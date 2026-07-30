import { spawn } from "node:child_process";
import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import { assertCondition } from "../core/errors.js";

interface GitResult {
  readonly stdout: string;
  readonly stderr: string;
}

function safeCandidateDirectoryName(candidateId: string): string {
  assertCondition(
    /^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u.test(candidateId),
    "SCHEMA_INVALID",
    "Invalid candidate worktree ID",
  );
  return candidateId;
}

async function runGit(
  repository: string,
  args: readonly string[],
  timeoutMillis = 30_000,
): Promise<GitResult> {
  return new Promise<GitResult>((resolve, reject) => {
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
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMillis);
    timer.unref();
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolve(result);
      else reject(new Error(`git ${args[0] ?? ""} failed (${code}): ${result.stderr}`));
    });
  });
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
}

export class GitWorktreeManager {
  readonly #repository: string;
  readonly #worktreeRoot: string;

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
    const treeHash = (await runGit(resolved, ["write-tree"])).stdout.trim();
    const statusPorcelainV2 = (
      await runGit(resolved, ["status", "--porcelain=v2", "--untracked-files=all"])
    ).stdout;
    return { ...candidate, path: resolved, headCommit, treeHash, statusPorcelainV2 };
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
}
