import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import {
  canonicalBytes,
  PrincipalRegistry,
  PrincipalSigner,
  RandomIdFactory,
  SchemaRegistry,
  SystemClock,
  UnixAuditClient,
  type JsonValue,
} from "../src/index.js";

const protocolId = `protocol-sha256:${"a".repeat(64)}`;
const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const python =
  "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu/bin/python3.13";

test("Unix audit transport authenticates and verifies append-only links (same-UID emulation)", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-audit-transport-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const ipc = path.join(root, "ipc");
  const keys = path.join(root, "keys");
  const logDirectory = path.join(root, "audit-log");
  await Promise.all([
    mkdir(ipc, { recursive: true, mode: 0o700 }),
    mkdir(keys, { recursive: true, mode: 0o700 }),
    mkdir(logDirectory, { recursive: true, mode: 0o700 }),
  ]);
  const operations = PrincipalSigner.generate({
    principalId: "operations.audit-transport",
    role: "operations_owner",
    implementationDigest: digest("1"),
    instanceId: "operations.audit-transport.instance",
  });
  const audit = PrincipalSigner.generate({
    principalId: "audit.transport",
    role: "audit_store",
    implementationDigest: digest("2"),
    instanceId: "audit.transport.instance",
  });
  const principals = new PrincipalRegistry();
  principals.register(operations.exportPublic());
  principals.register(audit.exportPublic());
  const privateKey = path.join(keys, "audit-private.pem");
  const auditPublic = path.join(keys, "audit-public.pem");
  const operationsPublic = path.join(keys, "operations-public.pem");
  const configPath = path.join(keys, "audit.json");
  await writeFile(privateKey, audit.exportPrivatePem(), { mode: 0o600 });
  await writeFile(auditPublic, audit.exportPublic().publicKeyPem, { mode: 0o600 });
  await writeFile(operationsPublic, operations.exportPublic().publicKeyPem, {
    mode: 0o600,
  });
  await writeFile(
    configPath,
    canonicalBytes({
      auditIdentity: audit.identity as unknown as JsonValue,
      auditKeyId: audit.keyId,
      operationsIdentity: operations.identity as unknown as JsonValue,
      operationsKeyId: operations.keyId,
      protocolId,
    }),
    { mode: 0o600 },
  );
  const socketPath = path.join(ipc, "audit.sock");
  const serverArguments = [
    "-I",
    path.resolve("evaluator/external_audit.py"),
    "--serve-unix",
    socketPath,
    "--config",
    configPath,
    "--private-key",
    privateKey,
    "--audit-public-key",
    auditPublic,
    "--operations-public-key",
    operationsPublic,
    "--protocol-id",
    protocolId,
    "--log-directory",
    logDirectory,
    "--expected-client-uid",
    String(process.getuid!()),
    "--expected-client-gid",
    String(process.getgid!()),
  ];
  const child = spawn(
    python,
    serverArguments,
    {
      detached: true,
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        TZ: "UTC",
        PYTHONDONTWRITEBYTECODE: "1",
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  t.after(() => {
    if (child.exitCode === null && child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already stopped.
      }
    }
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await lstat(socketPath)).isSocket()) break;
    } catch {
      await delay(20);
    }
  }
  assert.equal((await lstat(socketPath)).isSocket(), true, stderr);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const client = new UnixAuditClient({
    protocolId,
    endpoint: {
      socketPath,
      expectedAuditUid: process.getuid!(),
      expectedAuditGid: process.getgid!(),
      pythonExecutable: python,
      relayScriptPath: path.resolve("evaluator/unix_peer_relay.py"),
    },
    schemas,
    operationsSigner: operations,
    auditPrincipal: audit.exportPublic(),
    principals,
    clock: new SystemClock(),
    ids: new RandomIdFactory(),
  });
  await client.start();
  assert.equal(client.peerCredentials?.uid, process.getuid!());
  const expected = {
    subjectType: "TestSubject",
    subjectId: "subject-001",
    subjectHash: digest("3"),
  };
  const first = await client.appendSubject(expected);
  const duplicate = await client.appendSubject(expected);
  assert.deepEqual(duplicate, first);
  await client.verifyLink(first, expected);
  await client.verifyAll();
  await client.stop();
  await new Promise<void>((resolve) => child.once("close", () => resolve()));
  assert.equal(child.exitCode, 0, stderr);

  const auditLog = path.join(logDirectory, "audit.log");
  const originalLog = await readFile(auditLog, "utf8");
  assert.ok(originalLog.includes("subject-001"));
  await writeFile(auditLog, originalLog.replace("subject-001", "subject-002"), {
    mode: 0o600,
  });
  let tamperStderr = "";
  const tamperServer = spawn(python, serverArguments, {
    detached: true,
    env: {
      PATH: "/usr/bin:/bin",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      TZ: "UTC",
      PYTHONDONTWRITEBYTECODE: "1",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  tamperServer.stderr.on("data", (chunk: Buffer) => {
    tamperStderr += chunk.toString("utf8");
  });
  t.after(() => {
    if (tamperServer.exitCode === null && tamperServer.pid !== undefined) {
      try {
        process.kill(-tamperServer.pid, "SIGKILL");
      } catch {
        // Already stopped.
      }
    }
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await lstat(socketPath)).isSocket()) break;
    } catch {
      await delay(20);
    }
  }
  const tamperClient = new UnixAuditClient({
    protocolId,
    endpoint: {
      socketPath,
      expectedAuditUid: process.getuid!(),
      expectedAuditGid: process.getgid!(),
      pythonExecutable: python,
      relayScriptPath: path.resolve("evaluator/unix_peer_relay.py"),
    },
    schemas,
    operationsSigner: operations,
    auditPrincipal: audit.exportPublic(),
    principals,
    clock: new SystemClock(),
    ids: new RandomIdFactory(),
  });
  await tamperClient.start();
  await assert.rejects(tamperClient.verifyAll(), /Audit service failed|closed/u);
  await tamperClient.stop();
  await new Promise<void>((resolve) =>
    tamperServer.once("close", () => resolve()),
  );
  assert.equal(tamperServer.exitCode, 2, tamperStderr);
});
