import { constants } from "node:fs";
import {
  lstat,
  link,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { HarnessError, assertCondition } from "../core/errors.js";

function validateRelativePath(relativePath: string): string[] {
  assertCondition(relativePath.length > 0, "SCHEMA_INVALID", "Path is empty");
  assertCondition(!relativePath.includes("\0"), "SCHEMA_INVALID", "Path contains NUL");
  assertCondition(!relativePath.includes("\\"), "SCHEMA_INVALID", "Backslashes are forbidden");
  assertCondition(!path.posix.isAbsolute(relativePath), "AUTHORIZATION_DENIED", "Absolute path denied");
  const normalized = relativePath.normalize("NFC");
  assertCondition(normalized === relativePath, "SCHEMA_INVALID", "Path must be NFC normalized");
  const components = relativePath.split("/");
  assertCondition(
    components.every((component) => component !== "" && component !== "." && component !== ".."),
    "AUTHORIZATION_DENIED",
    "Path traversal denied",
  );
  return components;
}

export class WorkspacePathGuard {
  readonly #configuredRoot: string;
  #root: string | null = null;

  public constructor(workspaceRoot: string) {
    this.#configuredRoot = path.resolve(workspaceRoot);
  }

  public async initialize(): Promise<void> {
    await mkdir(this.#configuredRoot, { recursive: true, mode: 0o700 });
    this.#root = await realpath(this.#configuredRoot);
  }

  public get root(): string {
    assertCondition(this.#root !== null, "INTERNAL_ERROR", "Path guard is not initialized");
    return this.#root;
  }

  public async resolveForRead(relativePath: string): Promise<string> {
    const components = validateRelativePath(relativePath);
    const target = path.join(this.root, ...components);
    await this.#assertAncestry(components.slice(0, -1));
    const metadata = await lstat(target);
    assertCondition(!metadata.isSymbolicLink(), "AUTHORIZATION_DENIED", "Symlink read denied");
    assertCondition(metadata.isFile(), "AUTHORIZATION_DENIED", "Only regular files may be read");
    assertCondition(metadata.nlink === 1, "AUTHORIZATION_DENIED", "Hard-linked file read denied");
    return target;
  }

  public async resolveForWrite(relativePath: string): Promise<string> {
    const components = validateRelativePath(relativePath);
    await this.#assertAncestry(components.slice(0, -1));
    const target = path.join(this.root, ...components);
    try {
      const metadata = await lstat(target);
      assertCondition(!metadata.isSymbolicLink(), "AUTHORIZATION_DENIED", "Symlink write denied");
      assertCondition(metadata.isFile(), "AUTHORIZATION_DENIED", "Only regular files may be replaced");
      assertCondition(metadata.nlink === 1, "AUTHORIZATION_DENIED", "Hard-linked file write denied");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return target;
  }

  public async readFile(relativePath: string, maxBytes: number): Promise<Buffer> {
    const target = await this.resolveForRead(relativePath);
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await handle.stat();
      assertCondition(metadata.isFile(), "AUTHORIZATION_DENIED", "File changed during read");
      assertCondition(metadata.nlink === 1, "AUTHORIZATION_DENIED", "File became hard-linked");
      const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
      assertCondition(
        openedPath === this.root || openedPath.startsWith(`${this.root}${path.sep}`),
        "AUTHORIZATION_DENIED",
        "Opened file escaped the workspace",
      );
      assertCondition(metadata.size <= maxBytes, "PAYLOAD_TOO_LARGE", "Read exceeds output limit");
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }

  public async writeFile(
    relativePath: string,
    bytes: Uint8Array,
    options: { overwrite: boolean; maxBytes: number; abortSignal?: AbortSignal },
  ): Promise<void> {
    this.#assertAuthority(options.abortSignal);
    assertCondition(bytes.byteLength <= options.maxBytes, "PAYLOAD_TOO_LARGE", "Write too large");
    const target = await this.resolveForWrite(relativePath);
    const directory = path.dirname(target);
    const temporary = path.join(
      directory,
      `.${path.basename(target)}.${randomBytes(16).toString("hex")}.tmp`,
    );
    const handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      this.#assertAuthority(options.abortSignal);
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      this.#assertAuthority(options.abortSignal);
      if (options.overwrite) {
        await rename(temporary, target);
      } else {
        try {
          await link(temporary, target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new HarnessError("CONFLICT", `${relativePath} already exists`);
          }
          throw error;
        }
        await unlink(temporary);
      }
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  #assertAuthority(abortSignal?: AbortSignal): void {
    if (abortSignal?.aborted === true) {
      throw new HarnessError("DEADLINE_EXCEEDED", "Workspace commit authority was revoked");
    }
  }

  async #assertAncestry(components: readonly string[]): Promise<void> {
    let current = this.root;
    for (const component of components) {
      current = path.join(current, component);
      const metadata = await lstat(current);
      assertCondition(!metadata.isSymbolicLink(), "AUTHORIZATION_DENIED", "Symlink ancestry denied");
      assertCondition(metadata.isDirectory(), "AUTHORIZATION_DENIED", "Non-directory ancestry denied");
    }
    const resolved = await realpath(current);
    assertCondition(
      resolved === this.root || resolved.startsWith(`${this.root}${path.sep}`),
      "AUTHORIZATION_DENIED",
      "Workspace escape denied",
    );
  }
}
