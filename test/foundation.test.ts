import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AppendOnlyLog,
  ArtifactStore,
  DeterministicClock,
  HarnessError,
  PrincipalRegistry,
  PrincipalSigner,
  ReplayGuard,
  SchemaRegistry,
  createWireEnvelope,
  decodeWireFrame,
  encodeWireFrame,
  parseStrictJson,
  sha256,
  verifyWireEnvelope,
  type JsonValue,
} from "../src/index.js";

const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const PROTOCOL_ID = `protocol-sha256:${"1".repeat(64)}`;
const PROMPT_SCHEMA =
  "https://self-evolving-harness.local/schemas/payloads/prompt-payload.schema.json";

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-test-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function promptPayload(): { readonly [key: string]: JsonValue } {
  return {
    schemaVersion: 1,
    language: "seh.prompt-markdown.v1",
    sections: [
      {
        sectionId: "identity",
        purpose: "identity",
        content: "You are a deterministic test runtime.",
      },
    ],
    contextBindings: ["task_input"],
  };
}

test("strict JSON and canonical hashing reject ambiguous input", () => {
  assert.throws(
    () => parseStrictJson('{"a":1,"a":2}'),
    (error: unknown) => error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );
  assert.equal(sha256({ b: 2, a: 1 }), sha256({ a: 1, b: 2 }));
  assert.throws(() => sha256({ value: -0 }), /negative zero/u);
});

test("all frozen JSON schemas compile and validate a closed payload", async () => {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  assert.equal(schemas.schemaIds.length, 33);
  schemas.validate(PROMPT_SCHEMA, promptPayload());
  assert.throws(
    () => schemas.validate(PROMPT_SCHEMA, { ...promptPayload(), unexpected: true }),
    (error: unknown) => error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );
});

test("content-addressed artifacts and append-only records detect modification", async (t) => {
  const root = await temporaryDirectory(t);
  const store = new ArtifactStore(path.join(root, "artifacts"));
  await store.initialize();
  const reference = await store.putJson({ answer: 42 });
  assert.deepEqual(JSON.parse((await store.get(reference.contentHash)).toString()), { answer: 42 });

  const digest = reference.contentHash.slice("sha256:".length);
  const artifactPath = path.join(root, "artifacts", "sha256", digest.slice(0, 2), digest);
  await writeFile(artifactPath, "corrupt", "utf8");
  await assert.rejects(
    store.get(reference.contentHash),
    (error: unknown) => error instanceof HarnessError && error.code === "HASH_MISMATCH",
  );

  const log = new AppendOnlyLog<JsonValue>(path.join(root, "logs"), "audit.main");
  await log.append({ event: "one" });
  await log.append({ event: "two" });
  assert.equal((await log.readAll()).length, 2);
  const second = path.join(root, "logs", "audit.main", "00000000000000000001.json");
  const record = JSON.parse(await readFile(second, "utf8")) as Record<string, unknown>;
  record["payload"] = { event: "forged" };
  await writeFile(second, JSON.stringify(record), "utf8");
  await assert.rejects(
    log.readAll(),
    (error: unknown) => error instanceof HarnessError && error.code === "HASH_MISMATCH",
  );
});

test("wire envelopes enforce schema, authority, signature, deadline and replay", async () => {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const signer = PrincipalSigner.generate({
    principalId: "runtime.test",
    role: "runtime",
    implementationDigest: ZERO_HASH,
    instanceId: "runtime.instance.1",
  });
  const principals = new PrincipalRegistry();
  principals.register(signer.exportPublic());
  const envelope = createWireEnvelope({
    protocolId: PROTOCOL_ID,
    messageId: "message-0001",
    correlationId: "correlation-0001",
    causationId: null,
    recipientRole: "fake_provider",
    messageType: "provider.request",
    sentAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z",
    senderSequence: 0,
    nonce: "abcdefghijklmnopqrstuv",
    payloadSchemaId: PROMPT_SCHEMA,
    payload: promptPayload(),
    signer,
    schemas,
  });
  const decoded = decodeWireFrame(encodeWireFrame(envelope));
  const replayGuard = new ReplayGuard();
  verifyWireEnvelope(decoded, {
    schemas,
    principals,
    replayGuard,
    clock: new DeterministicClock(),
    expectedProtocolId: PROTOCOL_ID,
    expectedRecipientRole: "fake_provider",
  });
  assert.throws(
    () =>
      verifyWireEnvelope(decoded, {
        schemas,
        principals,
        replayGuard,
        clock: new DeterministicClock(),
        expectedProtocolId: PROTOCOL_ID,
        expectedRecipientRole: "fake_provider",
      }),
    (error: unknown) => error instanceof HarnessError && error.code === "REPLAY_DETECTED",
  );
  assert.throws(
    () =>
      createWireEnvelope({
        protocolId: PROTOCOL_ID,
        messageId: "message-0002",
        correlationId: "correlation-0002",
        causationId: null,
        recipientRole: "evaluator",
        messageType: "evaluator.request",
        sentAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T01:00:00.000Z",
        senderSequence: 1,
        nonce: "abcdefghijklmnopqrstuw",
        payloadSchemaId: PROMPT_SCHEMA,
        payload: promptPayload(),
        signer,
        schemas,
      }),
    (error: unknown) => error instanceof HarnessError && error.code === "AUTHORIZATION_DENIED",
  );
});
