import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AuditTrail,
  AppendOnlyLog,
  ExternalEvaluatorClient,
  HarnessReferenceLedger,
  PrincipalRegistry,
  PrincipalSigner,
  RandomIdFactory,
  SchemaRegistry,
  SystemClock,
  SimulatedEvaluationCrash,
  type EvaluationBudgetUsage,
  type EvaluationTransactionStage,
  type JsonValue,
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

function evaluationInput() {
  return {
    methodId: "B6" as const,
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
    pairedCi95LowerPercentagePointMicros: 0,
    pairedCi95UpperPercentagePointMicros: 100_000_000,
    sourceEvidenceReceiptIds: ["receipt-source-001"],
  };
}

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
    endpoint: {
      socketPath: path.join(root, "ipc", "evaluator.sock"),
      expectedEvaluatorUid: process.getuid!(),
      expectedEvaluatorGid: process.getgid!(),
      pythonExecutable:
        "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu/bin/python3.13",
      relayScriptPath: path.resolve("evaluator/unix_peer_relay.py"),
    },
    evaluatorPrincipal: evaluatorSigner.exportPublic(),
    emulatedLaunch: {
      isolationClass: "isolation_emulated",
      pythonRoot:
        "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu",
      scriptPath: path.resolve("evaluator/external_evaluator.py"),
      evaluatorSigner,
    },
    schemas,
    audit,
    operationsSigner,
    principals,
    clock,
    ids,
  });
  await evaluator.start();
  assert.equal(evaluator.isolationClass, "isolation_emulated");
  assert.equal(evaluator.peerCredentials?.uid, process.getuid!());
  t.after(async () => {
    await evaluator.stop();
  });
  const result = await evaluator.evaluate(evaluationInput());
  assert.equal(result.aggregate.parentPassRateMicros, 500_000);
  assert.equal(result.aggregate.candidatePassRateMicros, 1_000_000);
  assert.equal(result.aggregate.passToFailCount, 0);
  assert.equal(result.aggregate.failToPassCount, 1);
  assert.equal(result.gateChecks[0]?.passed, true);
  assert.equal(result.evaluator.principalId, "evaluator.external");
  await audit.verifyAll();
});

test("every durable evaluator boundary recovers idempotently after a process crash", async (t) => {
  const stages: readonly EvaluationTransactionStage[] = [
    "started",
    "proposed",
    "audit_linked",
    "result_created",
    "signature_verified",
    "result_appended",
    "accounting_sealed",
    "completed",
  ];
  for (const stage of stages) {
    await t.test(stage, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), `seh-evaluator-${stage}-`));
      try {
        const schemas = await SchemaRegistry.load(path.resolve("schemas"));
        const principals = new PrincipalRegistry();
        const auditSigner = PrincipalSigner.generate({
          principalId: `audit.recovery.${stage}`,
          role: "audit_store",
          implementationDigest: digest("5"),
          instanceId: `audit.recovery.${stage}.instance`,
        });
        const operationsSigner = PrincipalSigner.generate({
          principalId: `operations.recovery.${stage}`,
          role: "operations_owner",
          implementationDigest: digest("6"),
          instanceId: `operations.recovery.${stage}.instance`,
        });
        const evaluatorSigner = PrincipalSigner.generate({
          principalId: `evaluator.recovery.${stage}`,
          role: "evaluator",
          implementationDigest: digest("7"),
          instanceId: `evaluator.recovery.${stage}.instance`,
        });
        for (const signer of [auditSigner, operationsSigner, evaluatorSigner]) {
          principals.register(signer.exportPublic());
        }
        const clock = new SystemClock();
        const ids = new RandomIdFactory();
        const makeAudit = () =>
          new AuditTrail({
            root,
            protocolId,
            signer: auditSigner,
            principals,
            clock,
            ids,
          });
        const makeReferences = (audit: AuditTrail) =>
          new HarnessReferenceLedger({
            root,
            protocolId,
            schemas,
            audit,
            principals,
            clock,
            ids,
          });
        const makeEvaluator = (
          audit: AuditTrail,
          references: HarnessReferenceLedger,
          crashAfterStage?: EvaluationTransactionStage,
        ) =>
          new ExternalEvaluatorClient({
            root,
            protocolId,
            endpoint: {
              socketPath: path.join(root, "ipc", "evaluator.sock"),
              expectedEvaluatorUid: process.getuid!(),
              expectedEvaluatorGid: process.getgid!(),
              pythonExecutable:
                "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu/bin/python3.13",
              relayScriptPath: path.resolve("evaluator/unix_peer_relay.py"),
            },
            evaluatorPrincipal: evaluatorSigner.exportPublic(),
            emulatedLaunch: {
              isolationClass: "isolation_emulated",
              pythonRoot:
                "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu",
              scriptPath: path.resolve("evaluator/external_evaluator.py"),
              evaluatorSigner,
            },
            schemas,
            audit,
            operationsSigner,
            principals,
            clock,
            ids,
            references,
            ...(crashAfterStage === undefined ? {} : { crashAfterStage }),
          });

        const firstAudit = makeAudit();
        const firstReferences = makeReferences(firstAudit);
        const first = makeEvaluator(firstAudit, firstReferences, stage);
        await first.start();
        await assert.rejects(
          first.evaluate(evaluationInput()),
          (error: unknown) =>
            error instanceof SimulatedEvaluationCrash && error.stage === stage,
        );
        await first.stop();
        assert.equal((await firstReferences.activeHolds()).length, 2);

        const recoveredAudit = makeAudit();
        const recoveredReferences = makeReferences(recoveredAudit);
        const recovered = makeEvaluator(recoveredAudit, recoveredReferences);
        await recovered.start();
        const results = await recovered.recoverPendingEvaluations();
        await recovered.stop();
        assert.equal(results.length, stage === "completed" ? 0 : 1);
        const records = await recovered.transactionRecords();
        assert.equal(records.at(-1)?.stage, "completed");
        assert.equal(
          records.filter((record) => record.stage === "completed").length,
          1,
        );
        assert.equal((await recoveredReferences.activeHolds()).length, 0);
        const resultLog = new AppendOnlyLog<JsonValue>(
          path.join(root, "evolution"),
          "evaluation.results",
        );
        assert.equal((await resultLog.readAll()).length, 1);
        await recovered.verifyTransactions();
        await recoveredReferences.verifyAll();
        await recoveredAudit.verifyAll();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
