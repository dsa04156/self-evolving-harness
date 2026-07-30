import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AuditTrail,
  ExternalEvaluatorClient,
  PrincipalRegistry,
  PrincipalSigner,
  RandomIdFactory,
  SchemaRegistry,
  SystemClock,
  type EvaluationBudgetUsage,
} from "../src/index.js";

const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const harness = (character: string): string => `hv-sha256:${character.repeat(64)}`;
const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const snapshot = `rss-sha256:${"4".repeat(64)}`;

const usage: EvaluationBudgetUsage = {
  modelRequestAttempts: 2,
  completedModelCalls: 2,
  failedModelCalls: 0,
  cancelledModelCalls: 0,
  inputTokens: 20,
  outputTokens: 10,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  totalChargedTokens: 30,
  providerCostMicros: 0,
  toolCalls: 2,
  feedbackEvents: 0,
  wallClockMillis: 10,
};

test("Python 3.13 evaluator is isolated, authenticated and returns schema-valid evidence", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-evaluator-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const principals = new PrincipalRegistry();
  const auditSigner = PrincipalSigner.generate({
    principalId: "audit.evaluator",
    role: "audit_store",
    implementationDigest: digest("5"),
    instanceId: "audit.evaluator.instance",
  });
  const operationsSigner = PrincipalSigner.generate({
    principalId: "operations.evaluator",
    role: "operations_owner",
    implementationDigest: digest("6"),
    instanceId: "operations.evaluator.instance",
  });
  const evaluatorSigner = PrincipalSigner.generate({
    principalId: "evaluator.external",
    role: "evaluator",
    implementationDigest: digest("7"),
    instanceId: "evaluator.external.instance",
  });
  principals.register(auditSigner.exportPublic());
  principals.register(operationsSigner.exportPublic());
  principals.register(evaluatorSigner.exportPublic());
  const clock = new SystemClock();
  const ids = new RandomIdFactory();
  const audit = new AuditTrail({
    root,
    protocolId,
    signer: auditSigner,
    principals,
    clock,
    ids,
  });
  const evaluator = new ExternalEvaluatorClient({
    root,
    protocolId,
    pythonRoot:
      "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu",
    scriptPath: path.resolve("evaluator/external_evaluator.py"),
    schemas,
    audit,
    operationsSigner,
    evaluatorSigner,
    principals,
    clock,
    ids,
  });
  await evaluator.start();
  t.after(async () => {
    await evaluator.stop();
  });
  const result = await evaluator.evaluate({
    methodId: "B6",
    parentHarnessVersionId: harness("2"),
    candidateHarnessVersionId: harness("3"),
    runtimeStateSnapshotIds: [snapshot],
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
        parentPassed: true,
        candidatePassed: true,
        parentReceiptId: "receipt-parent-001",
        candidateReceiptId: "receipt-candidate-001",
      },
      {
        opaqueTaskHandleHash: digest("b"),
        rolloutSeed: 17,
        parentPassed: false,
        candidatePassed: true,
        parentReceiptId: "receipt-parent-002",
        candidateReceiptId: "receipt-candidate-002",
      },
    ],
    totalUsage: usage,
    pairedCi95LowerPercentagePoints: 0,
    pairedCi95UpperPercentagePoints: 100,
    sourceEvidenceReceiptIds: ["receipt-source-001"],
  });
  assert.equal(result.aggregate.parentPassRate, 0.5);
  assert.equal(result.aggregate.candidatePassRate, 1);
  assert.equal(result.aggregate.passToFailCount, 0);
  assert.equal(result.aggregate.failToPassCount, 1);
  assert.equal(result.gateChecks[0]?.passed, true);
  assert.equal(result.evaluator.principalId, "evaluator.external");
  await audit.verifyAll();
});
