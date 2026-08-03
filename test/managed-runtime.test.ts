import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DeterministicClock,
  DeterministicIdFactory,
  FakeModelProvider,
  FakeTaskVerifier,
  SchemaRegistry,
  createManagedStandaloneRuntime,
  passingVerification,
  type ModelResponse,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const digest = (character: string): string => `sha256:${character.repeat(64)}`;

function terminalResponse(): ModelResponse {
  return {
    responseId: "response-managed-1",
    modelIdentity: "fake:managed-v1",
    output: [{ kind: "assistant_message", text: "managed runtime complete" }],
    usage: {
      inputTokens: 8,
      outputTokens: 3,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 11,
    },
    providerMetadata: { deterministic: true },
  };
}

test("managed runtime joins kernel, operations, evidence, and retirement", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-managed-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const runtime = await createManagedStandaloneRuntime({
    root,
    schemas,
    provider: new FakeModelProvider([terminalResponse()]),
    verifier: new FakeTaskVerifier(digest("9"), () => passingVerification()),
    sessionId: "session.managed.1",
    pins: {
      protocolId: `protocol-sha256:${"1".repeat(64)}`,
      harnessVersionId: `hv-sha256:${"2".repeat(64)}`,
      runtimeStateSnapshotId: `rss-sha256:${"3".repeat(64)}`,
      modelIdentityHash: digest("4"),
      permissionPolicyHash: digest("5"),
      safetyPolicyHash: digest("6"),
      budgetPolicyHash: digest("7"),
      budgetAccountId: "budget.managed.1",
      datasetPermissions: ["deterministic"],
    },
    modelIdentity: "fake:managed-v1",
    runtimeSigner: deterministicPrincipal({
      principalId: "runtime.managed",
      role: "runtime",
      implementationDigest: digest("a"),
      instanceId: "runtime.managed.instance",
      seedByte: 41,
    }),
    operationsSigner: deterministicPrincipal({
      principalId: "operations.managed",
      role: "operations_owner",
      implementationDigest: digest("b"),
      instanceId: "operations.managed.instance",
      seedByte: 42,
    }),
    auditSigner: deterministicPrincipal({
      principalId: "audit.managed",
      role: "audit_store",
      implementationDigest: digest("c"),
      instanceId: "audit.managed.instance",
      seedByte: 43,
    }),
    budgetLimits: {
      maxModelCalls: 2,
      maxInputTokens: 128,
      maxOutputTokens: 128,
      maxToolCalls: 1,
      maxWallClockMillis: 10_000,
      maxRetries: 0,
      maxDescendants: 1,
    },
    clock: new DeterministicClock(),
    ids: new DeterministicIdFactory(),
    prompt: {
      sections: [
        {
          sectionId: "identity",
          purpose: "identity",
          content: "Complete the deterministic managed-runtime test.",
        },
      ],
    },
    contextPolicy: {
      totalTokenLimit: 1024,
      sources: [
        {
          source: "system_prompt",
          priority: 100,
          maxTokens: 256,
          selection: "all_in_order",
        },
        {
          source: "task_input",
          priority: 90,
          maxTokens: 256,
          selection: "all_in_order",
        },
        {
          source: "tool_catalog",
          priority: 80,
          maxTokens: 512,
          selection: "all_in_order",
        },
      ],
      overflowPolicy: "block",
    },
    allowedToolIds: ["filesystem.read"],
  });

  const execution = await runtime.execute("Return a verified terminal answer.");
  assert.equal(execution.start.state, "initialized");
  assert.equal(execution.submit.state, "completed");
  assert.equal(execution.finalize?.state, "retired");
  assert.equal(execution.result.state, "completed");
  assert.equal(execution.result.verification?.passed, true);
  assert.ok(execution.finalize?.nextAllowedActions.includes("validate"));

  const events = await runtime.operations.events("session.managed.1");
  assert.equal(events.operation, "events");
  assert.ok(events.evidence.length >= 4);
  const artifacts = await runtime.operations.artifacts("session.managed.1");
  assert.equal(artifacts.operation, "artifacts");
  const validation = await runtime.operations.validate("session.managed.1");
  assert.equal(
    typeof validation.data === "object" &&
      validation.data !== null &&
      !Array.isArray(validation.data) &&
      validation.data["receiptChainValid"],
    true,
  );
  await runtime.verify();
});
