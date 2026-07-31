import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function temporaryDirectory(
  t: test.TestContext,
): Promise<string> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-egress-broker-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function waitForSocket(file: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      if ((await lstat(file)).isSocket()) return;
    } catch {
      // Broker is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`egress broker socket did not appear: ${file}`);
}

function startBroker(input: {
  readonly socketPath: string;
  readonly host: string;
  readonly port: number;
}) {
  return spawn(
    "/usr/bin/python3",
    [
      "-I",
      path.resolve("evaluator/egress_connect_broker.py"),
      "--socket",
      input.socketPath,
      "--expected-client-uid",
      String(process.getuid!()),
      "--expected-client-gid",
      String(process.getgid!()),
      "--allowed-host",
      input.host,
      "--allowed-port",
      String(input.port),
      "--timeout-millis",
      "5000",
      "--max-tunnel-bytes",
      "4096",
      "--socket-mode",
      "600",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        TZ: "UTC",
      },
    },
  );
}

async function connectUnix(file: string): Promise<net.Socket> {
  const socket = net.createConnection({ path: file });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  socket.setTimeout(5_000, () =>
    socket.destroy(new Error("Unix broker client timed out")),
  );
  return socket;
}

async function readUntil(
  socket: net.Socket,
  marker: Buffer,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.includes(marker)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error("socket closed before marker"));
    };
    const cleanup = (): void => {
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

test("CONNECT broker permits only the exact destination and relays opaque bytes", async (t) => {
  const root = await temporaryDirectory(t);
  let upstreamConnections = 0;
  const upstream = net.createServer((socket) => {
    upstreamConnections += 1;
    socket.on("data", (chunk) => socket.write(chunk));
  });
  await new Promise<void>((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise<void>((resolve) =>
        upstream.close(() => resolve()),
      ),
  );
  const address = upstream.address();
  assert.ok(address !== null && typeof address !== "string");

  const allowedSocket = path.join(root, "allowed.sock");
  const allowed = startBroker({
    socketPath: allowedSocket,
    host: "127.0.0.1",
    port: address.port,
  });
  t.after(() => {
    if (allowed.exitCode === null) allowed.kill("SIGKILL");
  });
  await waitForSocket(allowedSocket);
  const client = await connectUnix(allowedSocket);
  client.write(
    `CONNECT 127.0.0.1:${address.port} HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\nConnection: keep-alive\r\n\r\n`,
  );
  assert.match(
    (await readUntil(client, Buffer.from("\r\n\r\n"))).toString(
      "ascii",
    ),
    /^HTTP\/1\.1 200 /u,
  );
  const opaque = Buffer.from(
    "opaque-encrypted-provider-record",
    "utf8",
  );
  client.write(opaque);
  assert.equal(
    (await readUntil(client, opaque)).subarray(-opaque.length)
      .toString("utf8"),
    opaque.toString("utf8"),
  );
  client.end();
  assert.equal(
    await new Promise<number | null>((resolve) =>
      allowed.once("close", resolve),
    ),
    0,
  );
  assert.equal(upstreamConnections, 1);

  const deniedSocket = path.join(root, "denied.sock");
  const denied = startBroker({
    socketPath: deniedSocket,
    host: "127.0.0.1",
    port: address.port,
  });
  t.after(() => {
    if (denied.exitCode === null) denied.kill("SIGKILL");
  });
  await waitForSocket(deniedSocket);
  const deniedClient = await connectUnix(deniedSocket);
  deniedClient.write(
    "CONNECT api.openai.com:443 HTTP/1.1\r\nHost: api.openai.com:443\r\nConnection: keep-alive\r\n\r\n",
  );
  await new Promise<void>((resolve) =>
    deniedClient.once("close", () => resolve()),
  );
  assert.equal(
    await new Promise<number | null>((resolve) =>
      denied.once("close", resolve),
    ),
    2,
  );
  assert.equal(upstreamConnections, 1);
});
