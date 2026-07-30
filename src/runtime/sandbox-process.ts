import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import { HarnessError, assertCondition } from "../core/errors.js";

export interface SandboxProcessPolicy {
  readonly timeoutMillis: number;
  readonly maxOutputBytes: number;
  readonly maxCommandBytes: number;
  readonly environment: Readonly<Record<string, string>>;
}

export interface SandboxProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export class BubblewrapProcessRunner {
  readonly #workspaceRoot: string;
  readonly #policy: SandboxProcessPolicy;
  readonly #activeProcessGroups = new Set<number>();

  public constructor(workspaceRoot: string, policy: SandboxProcessPolicy) {
    this.#workspaceRoot = path.resolve(workspaceRoot);
    this.#policy = policy;
  }

  public async initialize(): Promise<void> {
    await access("/usr/bin/bwrap", constants.X_OK);
  }

  public get activeProcessCount(): number {
    return this.#activeProcessGroups.size;
  }

  public async runShell(command: string, abortSignal?: AbortSignal): Promise<SandboxProcessResult> {
    assertCondition(
      Buffer.byteLength(command, "utf8") <= this.#policy.maxCommandBytes,
      "PAYLOAD_TOO_LARGE",
      "Shell command exceeds policy limit",
    );
    return this.#run(["/bin/bash", "--noprofile", "--norc", "-c", command], abortSignal);
  }

  public async runExecutable(
    executable: string,
    args: readonly string[],
    abortSignal?: AbortSignal,
  ): Promise<SandboxProcessResult> {
    assertCondition(
      executable.startsWith("/") && !executable.includes("\0"),
      "AUTHORIZATION_DENIED",
      "Executable must be an absolute trusted path",
    );
    return this.#run([executable, ...args], abortSignal);
  }

  async #run(command: readonly string[], abortSignal?: AbortSignal): Promise<SandboxProcessResult> {
    if (abortSignal?.aborted === true) {
      throw new HarnessError("DEADLINE_EXCEEDED", "Process authority was already revoked");
    }
    const bwrapArgs = [
      "--unshare-all",
      "--die-with-parent",
      "--new-session",
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind",
      "/bin",
      "/bin",
      "--ro-bind",
      "/lib",
      "/lib",
      "--ro-bind",
      "/lib64",
      "/lib64",
      "--ro-bind",
      "/etc",
      "/etc",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--bind",
      this.#workspaceRoot,
      "/workspace",
      "--chdir",
      "/workspace",
      "--clearenv",
      "--setenv",
      "HOME",
      "/tmp",
      "--setenv",
      "PATH",
      "/usr/local/bin:/usr/bin:/bin",
      "--setenv",
      "LANG",
      "C.UTF-8",
      "--setenv",
      "LC_ALL",
      "C.UTF-8",
      "--setenv",
      "TZ",
      "UTC",
    ];
    for (const [name, value] of Object.entries(this.#policy.environment).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      assertCondition(
        /^[A-Z][A-Z0-9_]{0,63}$/u.test(name),
        "SCHEMA_INVALID",
        `Invalid environment name ${name}`,
      );
      assertCondition(!value.includes("\0"), "SCHEMA_INVALID", "Environment value contains NUL");
      bwrapArgs.push("--setenv", name, value);
    }
    bwrapArgs.push("--", ...command);

    return new Promise<SandboxProcessResult>((resolve, reject) => {
      const child = spawn("/usr/bin/bwrap", bwrapArgs, {
        cwd: this.#workspaceRoot,
        detached: true,
        env: {},
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let timedOut = false;
      let settled = false;
      let terminationError: HarnessError | null = null;
      let killTimer: NodeJS.Timeout | null = null;
      if (child.pid !== undefined) this.#activeProcessGroups.add(child.pid);

      const killGroup = (signal: NodeJS.Signals): void => {
        if (child.pid === undefined) return;
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      };
      const settleError = (error: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (killTimer !== null) clearTimeout(killTimer);
        abortSignal?.removeEventListener("abort", onAbort);
        if (child.pid !== undefined) this.#activeProcessGroups.delete(child.pid);
        reject(error);
      };
      const revokeAndReap = (error: HarnessError, timeout: boolean): void => {
        if (terminationError !== null || settled) return;
        terminationError = error;
        timedOut = timeout;
        killGroup("SIGTERM");
        killTimer = setTimeout(() => killGroup("SIGKILL"), 100);
        killTimer.unref();
      };
      const capture = (target: Buffer[], chunk: Buffer): void => {
        outputBytes += chunk.byteLength;
        if (outputBytes > this.#policy.maxOutputBytes) {
          revokeAndReap(
            new HarnessError("PAYLOAD_TOO_LARGE", "Process output limit exceeded"),
            false,
          );
          return;
        }
        target.push(chunk);
      };
      child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk));
      child.on("error", settleError);
      child.on("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (killTimer !== null) clearTimeout(killTimer);
        abortSignal?.removeEventListener("abort", onAbort);
        if (child.pid !== undefined) this.#activeProcessGroups.delete(child.pid);
        if (terminationError !== null) {
          reject(terminationError);
          return;
        }
        resolve({
          exitCode,
          signal,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          timedOut,
        });
      });
      const onAbort = (): void => {
        revokeAndReap(
          new HarnessError("DEADLINE_EXCEEDED", "Process authority was revoked"),
          false,
        );
      };
      abortSignal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => {
        revokeAndReap(
          new HarnessError("DEADLINE_EXCEEDED", "Process deadline expired"),
          true,
        );
      }, this.#policy.timeoutMillis);
      timer.unref();
      if (abortSignal?.aborted === true) onAbort();
    });
  }
}
