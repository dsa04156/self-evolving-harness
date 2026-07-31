import { once } from "node:events";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  canonicalBytes,
  createWireEnvelope,
  encodeWireFrame,
  PrincipalSigner,
  RandomIdFactory,
  SchemaRegistry,
  sha256,
  type JsonValue,
  type PrincipalIdentity,
  type PublicPrincipal,
  type WireEnvelope,
} from "../src/index.js";
import { EVALUATOR_REQUEST_SCHEMA_ID } from "../src/evolution/external-evaluator.js";

interface Configuration {
  readonly protocolId: string;
  readonly schemaDirectory: string;
  readonly evaluatorSocketPath: string;
  readonly candidateFilesystemSnapshotHash: string;
  readonly operations: PublicPrincipal & { readonly privateKeyPath: string };
}

const digest = (character: string): string => `sha256:${character.repeat(64)}`;

function configuration(value: JsonValue): Configuration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("adversarial configuration is not an object");
  }
  return value as unknown as Configuration;
}

async function connect(socketPath: string): Promise<net.Socket> {
  const socket = net.createConnection({ path: socketPath });
  await once(socket, "connect");
  return socket;
}

async function readFrame(socket: net.Socket): Promise<Buffer | null> {
  let buffer = Buffer.alloc(0);
  const deadline = Date.now() + 3_000;
  while (Date.now() <= deadline) {
    const chunk = socket.read() as Buffer | null;
    if (chunk === null) {
      if (socket.readableEnded || socket.destroyed) return null;
      await Promise.race([
        once(socket, "readable"),
        once(socket, "end"),
        once(socket, "close"),
        delay(100),
      ]);
      continue;
    }
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.byteLength >= 4) {
      const length = buffer.readUInt32BE(0);
      if (buffer.byteLength >= length + 4) return buffer.subarray(4, length + 4);
    }
  }
  return null;
}

async function expectNoFinalResult(socket: net.Socket): Promise<void> {
  const chunks: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  await Promise.race([
    once(socket, "close"),
    once(socket, "error").catch(() => []),
    delay(3_000),
  ]);
  const bytes = Buffer.concat(chunks).toString("utf8");
  if (bytes.includes("\"operation\":\"evaluation_final\"")) {
    throw new Error("invalid input synthesized a final evaluation result");
  }
}

function requestPayload(
  requestId: string,
  candidateFilesystemSnapshotHash: string,
): Record<string, JsonValue> {
  return {
    schemaVersion: 1,
    operation: "evaluate",
    requestId,
    evaluationResultId: "evaluation-result-adversarial",
    datasetRole: "deterministic",
    phase: "deterministic",
    methodId: "B6",
    parentHarnessVersionId: `hv-sha256:${"1".repeat(64)}`,
    candidateHarnessVersionId: `hv-sha256:${"2".repeat(64)}`,
    candidateFilesystemSnapshotHash,
    runtimeStateSnapshotIds: [`rss-sha256:${"3".repeat(64)}`],
    rolloutSeeds: [17],
    manifestPins: {
      protocol: digest("1"),
      budget: digest("2"),
      modelConfiguration: digest("3"),
      split: digest("4"),
      evaluator: digest("5"),
      environment: digest("6"),
      toolchain: digest("7"),
      statisticalPlan: digest("8"),
    },
    taskPairs: [
      {
        opaqueTaskHandleHash: digest("a"),
        rolloutSeed: 17,
        parentPassed: false,
        candidatePassed: true,
        parentReceiptId: "receipt-parent-adversarial",
        candidateReceiptId: "receipt-candidate-adversarial",
      },
    ],
    totalUsage: {
      modelRequestAttempts: 1,
      completedModelCalls: 1,
      failedModelCalls: 0,
      cancelledModelCalls: 0,
      inputTokens: 1,
      outputTokens: 1,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalChargedTokens: 2,
      providerCostMicros: 0,
      toolCalls: 0,
      feedbackEvents: 0,
      wallClockMillis: 1,
    },
    pairedCi95LowerPercentagePointMicros: 0,
    pairedCi95UpperPercentagePointMicros: 100_000_000,
    sourceEvidenceReceiptIds: ["receipt-source-adversarial"],
    violations: [],
    createdAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  const mode = process.argv[3];
  if (configPath === undefined || mode === undefined) {
    throw new Error("configuration path and adversarial mode are required");
  }
  const config = configuration(
    JSON.parse(await readFile(path.resolve(configPath), "utf8")) as JsonValue,
  );
  const schemas = await SchemaRegistry.load(config.schemaDirectory);
  const operations = PrincipalSigner.import({
    identity: config.operations.identity as PrincipalIdentity,
    keyId: config.operations.keyId,
    privateKeyPem: await readFile(config.operations.privateKeyPath, "utf8"),
    publicKeyPem: config.operations.publicKeyPem,
  });
  const ids = new RandomIdFactory();
  const requestId = ids.next("adversarial-request");
  let signer = operations;
  if (mode === "wrong_key") {
    signer = PrincipalSigner.generate({
      principalId: "operations.adversarial-impostor",
      role: "operations_owner",
      implementationDigest: digest("f"),
      instanceId: "operations.adversarial-impostor.instance",
    });
  }
  const now = new Date();
  const valid = createWireEnvelope({
    protocolId: config.protocolId,
    messageId: ids.next("adversarial-message"),
    correlationId: requestId,
    causationId: null,
    recipientRole: "evaluator",
    messageType: "evaluator.request",
    sentAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5_000).toISOString(),
    senderSequence: 0,
    nonce: "A".repeat(32),
    payloadSchemaId: EVALUATOR_REQUEST_SCHEMA_ID,
    payload: requestPayload(
      requestId,
      config.candidateFilesystemSnapshotHash,
    ),
    signer,
    schemas,
  });
  const socket = await connect(config.evaluatorSocketPath);
  socket.on("error", () => undefined);
  if (mode === "partial") {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(100, 0);
    socket.end(Buffer.concat([header, Buffer.from("{}")]));
    await expectNoFinalResult(socket);
  } else if (mode === "oversized") {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(1_048_577, 0);
    socket.end(header);
    await expectNoFinalResult(socket);
  } else if (mode === "peer_crash") {
    socket.write(encodeWireFrame(valid));
    socket.destroy();
  } else if (mode === "replay") {
    const frame = encodeWireFrame(valid);
    socket.write(frame);
    const first = await readFrame(socket);
    if (first === null || !first.toString("utf8").includes("evaluation_proposed")) {
      throw new Error("replay setup did not receive the first proposal");
    }
    socket.write(frame);
    await expectNoFinalResult(socket);
  } else if (mode === "extra_frame") {
    const malformed = Buffer.alloc(4);
    malformed.writeUInt32BE(1_048_577, 0);
    socket.write(Buffer.concat([encodeWireFrame(valid), malformed]));
    const first = await readFrame(socket);
    if (first === null || !first.toString("utf8").includes("evaluation_proposed")) {
      throw new Error("extra-frame setup did not receive the first proposal");
    }
    await expectNoFinalResult(socket);
  } else {
    const mutable = structuredClone(valid) as unknown as Record<string, JsonValue>;
    if (mode === "downgrade") {
      mutable["wireProtocolVersion"] = "seh-wire/0";
    } else if (mode === "wrong_role") {
      mutable["recipientRole"] = "promoter";
    } else if (mode === "bad_signature") {
      const attestation = structuredClone(
        mutable["attestation"],
      ) as Record<string, JsonValue>;
      attestation["signature"] =
        "A".repeat(String(attestation["signature"]).length);
      mutable["attestation"] = attestation;
    } else if (
      mode === "schema_invalid" ||
      mode === "snapshot_mismatch"
    ) {
      const payload = structuredClone(
        mutable["payload"],
      ) as Record<string, JsonValue>;
      if (mode === "schema_invalid") {
        payload["methodId"] = "B7";
      } else {
        payload["candidateFilesystemSnapshotHash"] = digest("f");
      }
      mutable["payload"] = payload;
      mutable["payloadHash"] = sha256(payload);
      mutable["payloadSizeBytes"] = canonicalBytes(payload).byteLength;
      const { attestation: _attestation, ...unsigned } = mutable;
      mutable["attestation"] = operations.attest(
        unsigned as unknown as JsonValue,
      ) as unknown as JsonValue;
    } else if (mode !== "wrong_key") {
      throw new Error(`unknown adversarial mode ${mode}`);
    }
    const body = canonicalBytes(mutable as JsonValue);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.byteLength, 0);
    socket.end(Buffer.concat([header, body]));
    await expectNoFinalResult(socket);
  }
  process.stdout.write(
    `${JSON.stringify({ mode, rejectedWithoutFinalResult: true })}\n`,
  );
}

await main();
