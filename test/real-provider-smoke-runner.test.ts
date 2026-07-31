import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdtemp,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

interface Completed {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function invoke(
  args: readonly string[],
  extraEnvironment: Readonly<Record<string, string>> = {},
): Promise<Completed> {
  const child = spawn(
    process.execPath,
    [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("scripts/run-real-provider-smoke.ts"),
      ...args,
    ],
    {
      cwd: path.resolve("."),
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        TZ: "UTC",
        ...extraEnvironment,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) =>
    stdout.push(Buffer.from(chunk)),
  );
  child.stderr.on("data", (chunk: Buffer) =>
    stderr.push(Buffer.from(chunk)),
  );
  const code = await new Promise<number | null>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("real smoke runner test timed out"));
      }, 15_000);
      child.once("close", (value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    },
  );
  return {
    code,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

test("real smoke plan validation neither inspects credentials nor calls a provider", async () => {
  const sentinel = "sk-validation-mode-must-ignore-this";
  const completed = await invoke(["--validate-plan"], {
    OPENAI_API_KEY: sentinel,
  });
  assert.equal(completed.code, 0, completed.stderr);
  assert.doesNotMatch(completed.stdout, new RegExp(sentinel, "u"));
  const evidence = JSON.parse(completed.stdout) as {
    status: string;
    credentialInspected: boolean;
    networkCallAttempted: boolean;
  };
  assert.equal(evidence.status, "validated_no_call");
  assert.equal(evidence.credentialInspected, false);
  assert.equal(evidence.networkCallAttempted, false);
});

test("real smoke run fails closed before artifacts or network when the API key is absent", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-no-key-smoke-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const output = path.join(root, "must-not-exist");
  const completed = await invoke([
    "--run",
    "--output-directory",
    output,
  ]);
  assert.equal(completed.code, 2);
  assert.match(completed.stderr, /OPENAI_API_KEY is absent/u);
  await assert.rejects(lstat(output), {
    code: "ENOENT",
  });
});
