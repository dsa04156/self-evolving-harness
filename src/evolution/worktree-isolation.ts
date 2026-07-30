import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import { sha256, sha256Bytes, type JsonValue } from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";

interface GitBytesResult {
  readonly stdout: Buffer;
  readonly stderr: string;
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });
const MAX_SNAPSHOT_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;

function safeCandidateDirectoryName(candidateId: string): string {
  assertCondition(
    /^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u.test(candidateId),
    "SCHEMA_INVALID",
    "Invalid candidate worktree ID",
  );
  return candidateId;
}

async function runGitBytes(
  repository: string,
  args: readonly string[],
  timeoutMillis = 30_000,
): Promise<GitBytesResult> {
  return new Promise<GitBytesResult>((resolve, reject) => {
    const child = spawn("/usr/bin/git", ["-C", repository, ...args], {
      env: {
        HOME: "/tmp",
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_SNAPSHOT_BYTES) {
        child.kill("SIGKILL");
        reject(new HarnessError("PAYLOAD_TOO_LARGE", "Git output exceeds snapshot limit"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMillis);
    timer.unref();
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolve(result);
      else reject(new Error(`git ${args[0] ?? ""} failed (${code}): ${result.stderr}`));
    });
  });
}

async function runGit(
  repository: string,
  args: readonly string[],
  timeoutMillis = 30_000,
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  const result = await runGitBytes(repository, args, timeoutMillis);
  return { stdout: UTF8.decode(result.stdout), stderr: result.stderr };
}

export interface CandidateWorktree {
  readonly candidateId: string;
  readonly path: string;
  readonly baseCommit: string;
  readonly initialTreeHash: string;
}

export interface FrozenWorktreeState extends CandidateWorktree {
  readonly headCommit: string;
  readonly treeHash: string;
  readonly statusPorcelainV2: string;
  readonly filesystemSnapshotHash: string;
  readonly entries: readonly FrozenSnapshotEntry[];
}

export interface FrozenSnapshotEntry {
  readonly path: string;
  readonly gitMode: "100644" | "100755";
  readonly gitObjectId: string;
  readonly sizeBytes: number;
  readonly contentHash: string;
}

export interface MaterializedSnapshot {
  readonly path: string;
  readonly filesystemSnapshotHash: string;
  readonly fileCount: number;
  readonly totalBytes: number;
}

export interface FilesystemSnapshotDescriptor {
  readonly schemaVersion: 1;
  readonly headCommit: string;
  readonly treeHash: string;
  readonly entries: readonly FrozenSnapshotEntry[];
  readonly filesystemSnapshotHash: string;
}

export class GitWorktreeManager {
  readonly #repository: string;
  readonly #worktreeRoot: string;
  readonly #materializedSnapshots = new Set<string>();

  public constructor(repository: string, worktreeRoot: string) {
    this.#repository = path.resolve(repository);
    this.#worktreeRoot = path.resolve(worktreeRoot);
    assertCondition(
      this.#worktreeRoot !== this.#repository &&
        !this.#repository.startsWith(`${this.#worktreeRoot}${path.sep}`),
      "AUTHORIZATION_DENIED",
      "Worktree root cannot contain the source repository",
    );
  }

  public async initialize(): Promise<void> {
    const inside = (await runGit(this.#repository, ["rev-parse", "--is-inside-work-tree"]))
      .stdout.trim();
    assertCondition(inside === "true", "SCHEMA_INVALID", "Source is not a Git worktree");
    await mkdir(this.#worktreeRoot, { recursive: true, mode: 0o700 });
  }

  public async create(candidateId: string, baseRevision = "HEAD"): Promise<CandidateWorktree> {
    await this.initialize();
    const directory = path.join(
      this.#worktreeRoot,
      safeCandidateDirectoryName(candidateId),
    );
    try {
      await lstat(directory);
      throw new Error(`Candidate worktree already exists: ${candidateId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const baseCommit = (
      await runGit(this.#repository, ["rev-parse", "--verify", `${baseRevision}^{commit}`])
    ).stdout.trim();
    await runGit(this.#repository, [
      "worktree",
      "add",
      "--detach",
      "--no-checkout",
      directory,
      baseCommit,
    ]);
    try {
      await runGit(directory, ["checkout", "--detach", baseCommit]);
      const resolved = await realpath(directory);
      assertCondition(
        resolved.startsWith(`${this.#worktreeRoot}${path.sep}`),
        "AUTHORIZATION_DENIED",
        "Git placed candidate outside worktree root",
      );
      const initialTreeHash = (
        await runGit(directory, ["rev-parse", "--verify", "HEAD^{tree}"])
      ).stdout.trim();
      return { candidateId, path: resolved, baseCommit, initialTreeHash };
    } catch (error) {
      await runGit(this.#repository, ["worktree", "remove", "--force", directory]).catch(
        () => undefined,
      );
      throw error;
    }
  }

  public async freeze(candidate: CandidateWorktree): Promise<FrozenWorktreeState> {
    const resolved = await realpath(candidate.path);
    assertCondition(
      resolved.startsWith(`${this.#worktreeRoot}${path.sep}`),
      "AUTHORIZATION_DENIED",
      "Candidate is outside managed worktree root",
    );
    const headCommit = (await runGit(resolved, ["rev-parse", "--verify", "HEAD^{commit}"]))
      .stdout.trim();
    const treeHash = (await runGit(resolved, ["rev-parse", "--verify", "HEAD^{tree}"]))
      .stdout.trim();
    const statusPorcelainV2 = (
      await runGit(resolved, [
        "status",
        "--porcelain=v2",
        "--untracked-files=all",
        "--ignored=matching",
      ])
    ).stdout;
    assertCondition(
      statusPorcelainV2.length === 0,
      "AUTHORIZATION_DENIED",
      "Candidate worktree is not an exact clean committed snapshot",
    );
    const entries = await this.#snapshotEntries(resolved, headCommit);
    await this.#assertTrackedFilesAreSingleLinks(resolved, entries);
    await this.#assertUnchanged(resolved, headCommit, treeHash);
    const filesystemSnapshotHash = sha256({
      schemaVersion: 1,
      headCommit,
      treeHash,
      entries,
    } as unknown as JsonValue);
    return {
      ...candidate,
      path: resolved,
      headCommit,
      treeHash,
      statusPorcelainV2,
      filesystemSnapshotHash,
      entries,
    };
  }

  public async materializeSnapshot(
    frozen: FrozenWorktreeState,
    destination: string,
  ): Promise<MaterializedSnapshot> {
    await this.#assertUnchanged(frozen.path, frozen.headCommit, frozen.treeHash);
    const target = path.resolve(destination);
    try {
      await lstat(target);
      throw new HarnessError("CONFLICT", "Snapshot destination already exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await mkdir(target, { recursive: false, mode: 0o700 });
    const directories = new Set<string>([target]);
    let totalBytes = 0;
    for (const entry of frozen.entries) {
      const bytes = (
        await runGitBytes(frozen.path, ["cat-file", "blob", entry.gitObjectId])
      ).stdout;
      assertCondition(
        bytes.byteLength === entry.sizeBytes &&
          `sha256:${sha256Bytes(bytes)}` === entry.contentHash,
        "HASH_MISMATCH",
        `Committed blob changed for ${entry.path}`,
      );
      totalBytes += bytes.byteLength;
      assertCondition(
        totalBytes <= MAX_SNAPSHOT_BYTES,
        "PAYLOAD_TOO_LARGE",
        "Snapshot exceeds total byte limit",
      );
      const output = path.join(target, ...entry.path.split("/"));
      await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
      let directory = path.dirname(output);
      while (directory === target || directory.startsWith(`${target}${path.sep}`)) {
        directories.add(directory);
        if (directory === target) break;
        directory = path.dirname(directory);
      }
      const handle = await open(
        output,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        entry.gitMode === "100755" ? 0o500 : 0o400,
      );
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await chmod(output, entry.gitMode === "100755" ? 0o500 : 0o400);
    }
    for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
      await chmod(directory, 0o500);
    }
    await this.#assertUnchanged(frozen.path, frozen.headCommit, frozen.treeHash);
    this.#materializedSnapshots.add(target);
    return {
      path: target,
      filesystemSnapshotHash: frozen.filesystemSnapshotHash,
      fileCount: frozen.entries.length,
      totalBytes,
    };
  }

  public snapshotDescriptor(
    frozen: FrozenWorktreeState,
  ): FilesystemSnapshotDescriptor {
    const core = {
      schemaVersion: 1 as const,
      headCommit: frozen.headCommit,
      treeHash: frozen.treeHash,
      entries: frozen.entries,
    };
    assertCondition(
      sha256(core as unknown as JsonValue) === frozen.filesystemSnapshotHash,
      "HASH_MISMATCH",
      "Frozen snapshot descriptor does not match its recorded hash",
    );
    return {
      ...core,
      filesystemSnapshotHash: frozen.filesystemSnapshotHash,
    };
  }

  public async disposeMaterializedSnapshot(snapshot: MaterializedSnapshot): Promise<void> {
    const target = path.resolve(snapshot.path);
    assertCondition(
      this.#materializedSnapshots.has(target),
      "AUTHORIZATION_DENIED",
      "Refusing to remove an untracked snapshot",
    );
    await this.#makeWritableForDisposal(target);
    await rm(target, { recursive: true, force: false });
    this.#materializedSnapshots.delete(target);
  }

  public async dispose(candidate: CandidateWorktree): Promise<void> {
    const resolvedRoot = await realpath(this.#worktreeRoot);
    const resolvedCandidate = await realpath(candidate.path);
    assertCondition(
      resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`) &&
        path.dirname(resolvedCandidate) === resolvedRoot,
      "AUTHORIZATION_DENIED",
      "Refusing to remove unmanaged worktree",
    );
    await runGit(this.#repository, [
      "worktree",
      "remove",
      "--force",
      resolvedCandidate,
    ]);
  }

  async #snapshotEntries(
    worktree: string,
    commit: string,
  ): Promise<FrozenSnapshotEntry[]> {
    const output = (
      await runGitBytes(worktree, ["ls-tree", "-r", "-z", "--long", "--full-tree", commit])
    ).stdout;
    const records = output.subarray(0, Math.max(0, output.byteLength - 1)).toString("utf8");
    if (records.length === 0) return [];
    const entries: FrozenSnapshotEntry[] = [];
    let totalBytes = 0;
    for (const record of records.split("\0")) {
      const match = /^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40,64}) +([0-9-]+)\t(.+)$/u.exec(
        record,
      );
      assertCondition(match !== null, "SCHEMA_INVALID", "Unexpected Git tree entry");
      const [, mode, objectType, objectId, declaredSize, entryPath] = match;
      assertCondition(
        (mode === "100644" || mode === "100755") && objectType === "blob",
        "AUTHORIZATION_DENIED",
        "Symlink, submodule, or special Git entry is outside evaluator closure",
      );
      assertCondition(
        entryPath !== undefined &&
          entryPath === entryPath.normalize("NFC") &&
          !path.posix.isAbsolute(entryPath) &&
          entryPath.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
        "AUTHORIZATION_DENIED",
        "Git tree path is unsafe",
      );
      const bytes = (await runGitBytes(worktree, ["cat-file", "blob", objectId!])).stdout;
      assertCondition(
        bytes.byteLength <= MAX_SNAPSHOT_FILE_BYTES &&
          Number(declaredSize) === bytes.byteLength,
        "PAYLOAD_TOO_LARGE",
        `Snapshot file is invalid or too large: ${entryPath}`,
      );
      totalBytes += bytes.byteLength;
      assertCondition(
        totalBytes <= MAX_SNAPSHOT_BYTES,
        "PAYLOAD_TOO_LARGE",
        "Snapshot exceeds total byte limit",
      );
      entries.push({
        path: entryPath,
        gitMode: mode,
        gitObjectId: objectId!,
        sizeBytes: bytes.byteLength,
        contentHash: `sha256:${sha256Bytes(bytes)}`,
      });
    }
    return entries;
  }

  async #assertTrackedFilesAreSingleLinks(
    worktree: string,
    entries: readonly FrozenSnapshotEntry[],
  ): Promise<void> {
    for (const entry of entries) {
      const metadata = await lstat(path.join(worktree, ...entry.path.split("/")));
      assertCondition(
        metadata.isFile() && !metadata.isSymbolicLink(),
        "AUTHORIZATION_DENIED",
        `Tracked path changed type: ${entry.path}`,
      );
      assertCondition(
        metadata.nlink === 1,
        "AUTHORIZATION_DENIED",
        `Hard-linked tracked file is outside evaluator closure: ${entry.path}`,
      );
    }
  }

  async #assertUnchanged(
    worktree: string,
    expectedCommit: string,
    expectedTree: string,
  ): Promise<void> {
    const [commit, tree, status] = await Promise.all([
      runGit(worktree, ["rev-parse", "--verify", "HEAD^{commit}"]),
      runGit(worktree, ["rev-parse", "--verify", "HEAD^{tree}"]),
      runGit(worktree, [
        "status",
        "--porcelain=v2",
        "--untracked-files=all",
        "--ignored=matching",
      ]),
    ]);
    assertCondition(
      commit.stdout.trim() === expectedCommit &&
        tree.stdout.trim() === expectedTree &&
        status.stdout.length === 0,
      "HASH_MISMATCH",
      "Candidate worktree changed after snapshot verification",
    );
  }

  async #makeWritableForDisposal(target: string): Promise<void> {
    const metadata = await lstat(target);
    assertCondition(
      !metadata.isSymbolicLink(),
      "AUTHORIZATION_DENIED",
      "Snapshot disposal encountered a symlink",
    );
    if (!metadata.isDirectory()) {
      await chmod(target, 0o600);
      return;
    }
    await chmod(target, 0o700);
    for (const entry of await readdir(target)) {
      await this.#makeWritableForDisposal(path.join(target, entry));
    }
  }
}
