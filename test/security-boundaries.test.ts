import assert from "node:assert/strict";
import {
  link,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AppendOnlyLog,
  ArtifactStore,
  BubblewrapProcessRunner,
  HarnessError,
  WorkspacePathGuard,
  type JsonValue,
} from "../src/index.js";

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-boundary-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("workspace guard rejects traversal, symlinks, hardlinks and special ancestry", async (t) => {
  const root = await temporaryDirectory(t);
  const workspaceRoot = path.join(root, "workspace");
  const outside = path.join(root, "outside.txt");
  await writeFile(outside, "outside", { mode: 0o600 });
  const guard = new WorkspacePathGuard(workspaceRoot);
  await guard.initialize();
  await assert.rejects(
    guard.readFile("../outside.txt", 1024),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "AUTHORIZATION_DENIED",
  );
  await assert.rejects(
    guard.readFile(outside, 1024),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "AUTHORIZATION_DENIED",
  );
  await symlink(outside, path.join(workspaceRoot, "outside-link"));
  await assert.rejects(
    guard.readFile("outside-link", 1024),
    /Symlink read denied/u,
  );
  await assert.rejects(
    guard.writeFile("outside-link", Buffer.from("changed"), {
      overwrite: true,
      maxBytes: 1024,
    }),
    /Symlink write denied/u,
  );
  await link(outside, path.join(workspaceRoot, "outside-hardlink"));
  await assert.rejects(
    guard.readFile("outside-hardlink", 1024),
    /Hard-linked file read denied/u,
  );
  await assert.rejects(
    guard.writeFile("outside-hardlink", Buffer.from("changed"), {
      overwrite: true,
      maxBytes: 1024,
    }),
    /Hard-linked file write denied/u,
  );
  await writeFile(path.join(workspaceRoot, "not-a-directory"), "file");
  await assert.rejects(
    guard.writeFile("not-a-directory/child", Buffer.from("x"), {
      overwrite: false,
      maxBytes: 1024,
    }),
    /Non-directory ancestry denied/u,
  );
  assert.equal(await readFile(outside, "utf8"), "outside");
});

test("artifact and append-only stores reject external hardlinks", async (t) => {
  const root = await temporaryDirectory(t);
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  await artifacts.initialize();
  const reference = await artifacts.put(Buffer.from("artifact"), "application/octet-stream");
  const digest = reference.contentHash.slice("sha256:".length);
  const artifactPath = path.join(
    root,
    "artifacts",
    "sha256",
    digest.slice(0, 2),
    digest,
  );
  await link(artifactPath, path.join(root, "artifact-external-link"));
  await assert.rejects(artifacts.get(reference.contentHash), /external hard link/u);

  const log = new AppendOnlyLog<JsonValue>(path.join(root, "logs"), "security.log");
  await log.append({ value: "original" });
  const recordPath = path.join(
    root,
    "logs",
    "security.log",
    "00000000000000000000.json",
  );
  await link(recordPath, path.join(root, "log-external-link"));
  await assert.rejects(log.readAll(), /external hard link/u);
});

test("bubblewrap denies network and host paths and enforces time/output caps", async (t) => {
  const root = await temporaryDirectory(t);
  const workspaceRoot = path.join(root, "workspace");
  await mkdir(workspaceRoot, { mode: 0o700 });
  const runner = new BubblewrapProcessRunner(workspaceRoot, {
    timeoutMillis: 250,
    maxOutputBytes: 128,
    maxCommandBytes: 256,
    environment: { TEST_ALLOWED: "yes" },
  });
  await runner.initialize();
  const isolation = await runner.runShell(
    [
      "test \"$PWD\" = /workspace",
      "test \"$HOME\" = /tmp",
      "test \"$TEST_ALLOWED\" = yes",
      "test -z \"$SSH_AUTH_SOCK\"",
      "test ! -e /home/jinuk/.ssh",
      "if exec 3<>/dev/tcp/1.1.1.1/53 2>/dev/null; then exit 42; fi",
      "echo denied",
    ].join(" && "),
  );
  assert.equal(isolation.exitCode, 0);
  assert.equal(isolation.stdout, "denied\n");

  const timedOut = await runner.runShell("sleep 5");
  assert.equal(timedOut.timedOut, true);
  assert.notEqual(timedOut.exitCode, 0);
  await assert.rejects(
    runner.runShell("printf '%0200d' 0"),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "PAYLOAD_TOO_LARGE",
  );
  await assert.rejects(
    runner.runShell("x".repeat(300)),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "PAYLOAD_TOO_LARGE",
  );
});
