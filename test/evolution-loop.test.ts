import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  AttributionService,
  AuditTrail,
  BoundedMutationEngine,
  CandidateAdmissionService,
  EVALUATION_RESULT_SCHEMA_ID,
  EvidenceReceiptStore,
  EvolutionRunStore,
  HarnessComponentRegistry,
  HarnessError,
  HarnessEvolutionLoop,
  HarnessLineageStore,
  HarnessQualificationStore,
  PrincipalRegistry,
  PrincipalSigner,
  PromotionService,
  RuntimeEventStream,
  RandomIdFactory,
  SchemaRegistry,
  SecretRedactor,
  SystemClock,
  WeaknessMiningService,
  computeCandidateCostGate,
  sha256,
  type EvaluationBudgetUsage,
  type EvaluationResult,
  type EvolutionEvaluationExecutor,
  type HarnessEvolutionLoopInput,
  type JsonValue,
  type SessionPins,
} from "../src/index.js";

const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const runtimeContractHash = `sha256:${"2".repeat(64)}`;
const runtimeStateSnapshotId = `rss-sha256:${"3".repeat(64)}`;
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

const totalUsage: EvaluationBudgetUsage = {
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

type ScenarioMode = "approve" | "reject" | "evaluation_failure";

async function scenario(t: test.TestContext, mode: ScenarioMode) {
  const root = await mkdtemp(path.join(os.tmpdir(), `seh-evolution-loop-${mode}-`));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const clock = new SystemClock();
  const ids = new RandomIdFactory();
  const principals = new PrincipalRegistry();
  const auditSigner = PrincipalSigner.generate({
    principalId: `audit.evolution-loop.${mode}`,
    role: "audit_store",
    implementationDigest: digest("4"),
    instanceId: `audit.evolution-loop.${mode}.instance`,
  });
  const runtimeSigner = PrincipalSigner.generate({
    principalId: `runtime.evolution-loop.${mode}`,
    role: "runtime",
    implementationDigest: digest("5"),
    instanceId: `runtime.evolution-loop.${mode}.instance`,
  });
  const operationsSigner = PrincipalSigner.generate({
    principalId: `operations.evolution-loop.${mode}`,
    role: "operations_owner",
    implementationDigest: digest("6"),
    instanceId: `operations.evolution-loop.${mode}.instance`,
  });
  const proposerSigner = PrincipalSigner.generate({
    principalId: `proposer.evolution-loop.${mode}`,
    role: "proposer",
    implementationDigest: digest("7"),
    instanceId: `proposer.evolution-loop.${mode}.instance`,
  });
  const promoterSigner = PrincipalSigner.generate({
    principalId: `promoter.evolution-loop.${mode}`,
    role: "promoter",
    implementationDigest: digest("8"),
    instanceId: `promoter.evolution-loop.${mode}.instance`,
  });
  const evaluatorSigner = PrincipalSigner.generate({
    principalId: `evaluator.evolution-loop.${mode}`,
    role: "evaluator",
    implementationDigest: digest("9"),
    instanceId: `evaluator.evolution-loop.${mode}.instance`,
  });
  for (const signer of [
    auditSigner,
    runtimeSigner,
    operationsSigner,
    proposerSigner,
    promoterSigner,
    evaluatorSigner,
  ]) {
    principals.register(signer.exportPublic());
  }
  const audit = new AuditTrail({
    root,
    protocolId,
    signer: auditSigner,
    principals,
    clock,
    ids,
  });
  const receipts = new EvidenceReceiptStore({
    root,
    protocolId,
    schemas,
    audit,
    principals,
    clock,
    ids,
  });
  const qualification = new HarnessQualificationStore({
    root,
    protocolId,
    schemas,
    audit,
    receipts,
    principals,
    clock,
    ids,
  });
  const components = new HarnessComponentRegistry({
    root: path.join(root, "registry"),
    schemas,
    artifacts: new ArtifactStore(path.join(root, "artifacts")),
    requiredSlotIds: ["permission", "system_prompt"],
  });
  await components.initialize(
    path.resolve("configs/component-type-registry.json"),
  );
  const prompt = await components.createComponent({
    componentId: "component.system-prompt",
    semanticVersion: "1.0.0",
    typeEntryId: "type.system-prompt",
    payloadLanguage: "seh.prompt-markdown.v1",
    payload: {
      schemaVersion: 1,
      language: "seh.prompt-markdown.v1",
      sections: [
        {
          sectionId: "identity",
          purpose: "identity",
          content: "Answer without an explicit verification step.",
        },
      ],
      contextBindings: ["task_input"],
    },
    capabilityIds: ["prompt.instruct.primary"],
  });
  const permission = await components.createComponent({
    componentId: "component.permission-policy",
    semanticVersion: "1.0.0",
    typeEntryId: "type.permission-policy",
    payloadLanguage: "seh.policy-json.v1",
    payload: {
      schemaVersion: 1,
      language: "seh.policy-json.v1",
      policyType: "PermissionPolicy",
      policy: { fixed: true },
    },
    capabilityIds: ["permission.authorize"],
  });
  const parent = await components.createHarness({
    semanticVersion: "1.0.0",
    requiredRuntimeContractHash: runtimeContractHash,
    bindings: [
      {
        slotId: "permission",
        componentManifestId: permission.componentManifestId,
      },
      {
        slotId: "system_prompt",
        componentManifestId: prompt.componentManifestId,
      },
    ],
  });
  const pins: SessionPins = {
    protocolId,
    harnessVersionId: parent.harnessVersionId,
    runtimeStateSnapshotId,
    modelIdentityHash: digest("a"),
    permissionPolicyHash: digest("b"),
    safetyPolicyHash: digest("c"),
    budgetPolicyHash: digest("d"),
    budgetAccountId: `budget.evolution-loop.${mode}`,
    datasetPermissions: ["mine"],
  };
  const failureTraces = [];
  for (const taskNumber of [1, 2]) {
    const sessionId = `session.evolution-loop.${mode}.${taskNumber}`;
    const stream = new RuntimeEventStream({
      root: path.join(root, "events"),
      sessionId,
      pins,
      producer: runtimeSigner.identity,
      clock,
      ids,
      schemas,
      redactor: new SecretRedactor({}),
    });
    const observation = await stream.emit({
      eventType: "model_answer_observed",
      payload: { answerClass: "unverified_completion" },
      origin: {
        originClass: "runtime",
        originId: runtimeSigner.identity.principalId,
        trustLevel: "authenticated_principal",
      },
    });
    const verifier = await stream.emit({
      eventType: "verification_completed",
      payload: {
        passed: false,
        retryable: false,
        summary: "required verification step is missing",
        evidence: { code: "VERIFY_STEP_MISSING" },
      },
      origin: {
        originClass: "evaluator",
        originId: "deterministic.verifier",
        trustLevel: "trusted_evaluator",
      },
      epistemicClass: "verifier_outcome",
    });
    const receipt = await receipts.create({
      receiptType: "evaluation",
      subjectIds: [`task.failure.${taskNumber}`, sessionId],
      harnessVersionIds: [parent.harnessVersionId],
      runtimeStateSnapshotIds: [runtimeStateSnapshotId],
      eventRanges: [
        {
          sessionId,
          firstSequence: 0,
          lastSequence: 1,
          headHash: await stream.headHash(),
        },
      ],
      recordedObservationEventIds: [observation.eventId],
      verifierOutcomeEventIds: [verifier.eventId],
      signer: operationsSigner,
    });
    failureTraces.push({
      taskId: `task.failure.${taskNumber}`,
      eventStream: stream,
      selectedEventIds: [observation.eventId, verifier.eventId],
      sourceReceiptIds: [receipt.receiptId],
    });
  }
  const miner = new WeaknessMiningService({
    root,
    protocolId,
    harnessVersionId: parent.harnessVersionId,
    schemas,
    audit,
    receipts,
    principals,
    signer: proposerSigner,
    clock,
    ids,
  });
  const attributions = new AttributionService({
    root,
    protocolId,
    schemas,
    audit,
    patterns: miner,
    components,
    principals,
    signer: proposerSigner,
    clock,
    ids,
  });
  const mutations = new BoundedMutationEngine({
    root,
    protocolId,
    registry: components,
    schemas,
    clock,
    ids,
    proposer: proposerSigner.identity,
  });
  const lineage = new HarnessLineageStore({
    root,
    protocolId,
    schemas,
    audit,
    principals,
    clock,
    ids,
  });
  const admission = new CandidateAdmissionService({
    root,
    protocolId,
    schemas,
    audit,
    receipts,
    components,
    mutations,
    attributions,
    lineage,
    lifecycle: qualification,
    principals,
    signer: operationsSigner,
    clock,
    ids,
  });
  const promotions = new PromotionService({
    root,
    protocolId,
    promotionPolicyHash: digest("e"),
    schemas,
    audit,
    receipts,
    lifecycle: qualification,
    principals,
    signer: promoterSigner,
    clock,
    ids,
  });
  const runs = new EvolutionRunStore({
    root,
    protocolId,
    schemas,
    audit,
    principals,
    signer: operationsSigner,
    clock,
    ids,
  });
  let evaluationCalls = 0;
  const snapshotHash = digest("f");
  const evaluator: EvolutionEvaluationExecutor = {
    async prepare({ evolutionRunId, candidate }) {
      const receipt = await receipts.create({
        receiptType: "artifact_retention",
        subjectIds: [
          evolutionRunId,
          candidate.harnessVersionId,
          snapshotHash,
        ],
        harnessVersionIds: [candidate.harnessVersionId],
        signer: operationsSigner,
      });
      return {
        candidateFilesystemSnapshotHash: snapshotHash,
        evidenceReceiptIds: [receipt.receiptId],
      };
    },
    async evaluate({
      parentHarnessVersionId,
      candidate,
      preparation,
    }) {
      evaluationCalls += 1;
      if (mode === "evaluation_failure") {
        throw new HarnessError(
          "PEER_CRASHED",
          "Injected deterministic evaluator failure",
        );
      }
      const parentPassed = [true, false];
      const candidatePassed =
        mode === "approve" ? [true, true] : [false, false];
      const taskPairs = [];
      const sourceReceiptIds = [];
      for (const index of [0, 1]) {
        const taskId = `task.paired.${mode}.${index}`;
        const parentReceipt = await receipts.create({
          receiptType: "evaluation",
          subjectIds: [taskId, parentHarnessVersionId],
          harnessVersionIds: [parentHarnessVersionId],
          signer: operationsSigner,
        });
        const candidateReceipt = await receipts.create({
          receiptType: "evaluation",
          subjectIds: [taskId, candidate.harnessVersionId],
          harnessVersionIds: [candidate.harnessVersionId],
          signer: operationsSigner,
        });
        sourceReceiptIds.push(
          parentReceipt.receiptId,
          candidateReceipt.receiptId,
        );
        taskPairs.push({
          opaqueTaskHandleHash: digest(index === 0 ? "5" : "6"),
          rolloutSeed: 17,
          parentPassed: parentPassed[index]!,
          candidatePassed: candidatePassed[index]!,
          parentReceiptId: parentReceipt.receiptId,
          candidateReceiptId: candidateReceipt.receiptId,
        });
      }
      const parentPasses = parentPassed.filter(Boolean).length;
      const candidatePasses = candidatePassed.filter(Boolean).length;
      const passToFailCount = taskPairs.filter(
        (pair) => pair.parentPassed && !pair.candidatePassed,
      ).length;
      const failToPassCount = taskPairs.filter(
        (pair) => !pair.parentPassed && pair.candidatePassed,
      ).length;
      const core = {
        schemaVersion: 4 as const,
        evaluationResultId: ids.next("evaluation-result"),
        protocolId,
        track: "contract" as const,
        phase: "deterministic" as const,
        methodId: "B6" as const,
        datasetRole: "deterministic" as const,
        parentHarnessVersionId,
        candidateHarnessVersionId: candidate.harnessVersionId,
        candidateFilesystemSnapshotHash:
          preparation.candidateFilesystemSnapshotHash,
        runtimeStateSnapshotIds: [runtimeStateSnapshotId],
        rolloutSeeds: [17],
        epistemicClass: "verifier_outcome" as const,
        validity: "valid" as const,
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
        taskPairs,
        aggregate: {
          taskCount: taskPairs.length,
          rolloutSeedCount: 1,
          parentPassRateMicros: parentPasses * 500_000,
          candidatePassRateMicros: candidatePasses * 500_000,
          deltaPercentagePointMicros:
            (candidatePasses - parentPasses) * 50_000_000,
          passToFailCount,
          failToPassCount,
          pairedCi95LowerPercentagePointMicros:
            mode === "approve" ? 0 : -100_000_000,
          pairedCi95UpperPercentagePointMicros:
            mode === "approve" ? 100_000_000 : 0,
          taskIsPrimaryUnit: true as const,
        },
        attributionMetrics: null,
        usageByPhaseRole: [
          {
            phaseId: "phase.deterministic",
            roleId: "role.evaluator",
            usage: totalUsage,
          },
        ],
        totalUsage,
        deterministicCompute: {
          verifierCpuMillis: 0,
          validatorCpuMillis: 0,
          wallClockMillis: 0,
          peakMemoryMiB: 0,
        },
        feedbackEvents: [],
        gateChecks: [
          {
            gateId: "gate.deterministic",
            passed: true,
            observedValue: 0,
            threshold: 0,
            evidenceReceiptIds: sourceReceiptIds,
          },
        ],
        violations: [],
        evaluator: evaluatorSigner.identity,
        createdAt: clock.now().toISOString(),
      };
      const auditLink = await audit.appendSubject({
        subjectType: "EvaluationResult",
        subjectId: core.evaluationResultId,
        subjectHash: sha256(core),
      });
      const body = { ...core, auditLink };
      const result = {
        ...body,
        attestation: evaluatorSigner.attest(body as unknown as JsonValue),
      } as EvaluationResult;
      schemas.validate(
        EVALUATION_RESULT_SCHEMA_ID,
        result as unknown as JsonValue,
      );
      return {
        result,
        costGate: computeCandidateCostGate({
          gateTaskSetHash: digest("9"),
          taskCount: taskPairs.length,
          candidatePasses,
          parentPasses,
          failToPassCount,
          passToFailCount,
          candidateFailedOrTimedOutTasks: 0,
          parentFailedOrTimedOutTasks: 0,
          candidateTotalChargedTokens: 15,
          parentTotalChargedTokens: 15,
          sourceLedgerReceiptIds: sourceReceiptIds,
        }),
      };
    },
  };
  const loop = new HarnessEvolutionLoop({
    protocolId,
    runs,
    miner,
    attributions,
    mutations,
    admission,
    qualification,
    receipts,
    operationsSigner,
    evaluator,
    promotions,
  });
  const loopInput: HarnessEvolutionLoopInput = {
    parentHarnessVersionId: parent.harnessVersionId,
    failureTraces,
    attribution: {
      candidates: [
        {
          componentManifestId: prompt.componentManifestId,
          scoreMicros: 900_000,
          hypothesizedMechanism:
            "The active system prompt omits a mandatory verification instruction.",
        },
      ],
      confidenceMicros: 800_000,
      alternativeExplanations: [
        "The workflow may have suppressed the verification phase.",
      ],
      method: "deterministic-fake-attributor-v1",
    },
    mutation: {
      candidateSemanticVersion: "1.0.1",
      causeClass: "single_fault",
      targets: [
        {
          componentManifestId: prompt.componentManifestId,
          nextSemanticVersion: "1.0.1",
          operations: [
            {
              op: "replace",
              path: "/sections/0/content",
              value: "Answer and perform an explicit verification step.",
            },
          ],
          semanticOperations: ["prompt.section.replaced"],
        },
      ],
      predictedFix:
        "The runtime will receive an explicit verification instruction.",
      predictedRegressions: [
        "The additional verification instruction may consume more context.",
      ],
      passingBehaviorPreservation: ["task.contract.known-pass"],
    },
  };
  return {
    root,
    audit,
    receipts,
    qualification,
    components,
    parent,
    miner,
    attributions,
    mutations,
    lineage,
    admission,
    promotions,
    runs,
    loop,
    loopInput,
    evaluationCalls: () => evaluationCalls,
  };
}

test("first-class evolution loop approves or rejects one independently evaluated HarnessVersion", async (t) => {
  for (const mode of ["approve", "reject"] as const) {
    await t.test(mode, async (t) => {
      const value = await scenario(t, mode);
      const result = await value.loop.run(value.loopInput);
      assert.notEqual(
        result.candidate.harnessVersionId,
        value.parent.harnessVersionId,
      );
      assert.equal(
        result.decision.action,
        mode === "approve" ? "approve" : "reject",
      );
      assert.equal(
        result.run.outcome,
        mode === "approve" ? "approved" : "rejected",
      );
      assert.equal(result.run.state, "decided");
      assert.equal(value.evaluationCalls(), 1);
      assert.equal(
        await value.qualification.state(result.candidate.harnessVersionId),
        mode === "approve" ? "approved" : "rejected",
      );
      assert.equal(
        await value.mutations.disposition(result.proposal.mutationProposalId),
        mode === "approve" ? "accepted" : "rejected",
      );
      assert.deepEqual(
        (await value.runs.records(result.run.evolutionRunId)).map(
          (record) => record.state,
        ),
        [
          "created",
          "weaknesses_mined",
          "attributed",
          "candidate_created",
          "statically_validated",
          "evaluating",
          "evaluated",
          "decided",
        ],
      );
      assert.equal(
        value.components.getHarness(value.parent.harnessVersionId)
          .harnessVersionId,
        value.parent.harnessVersionId,
      );
      if (mode === "reject") {
        await assert.rejects(
          value.mutations.propose({
            parentHarnessVersionId: value.loopInput.parentHarnessVersionId,
            candidateSemanticVersion:
              value.loopInput.mutation.candidateSemanticVersion,
            attributionMode: "guided",
            attributionResultId: result.attribution.attributionResultId,
            causeClass: value.loopInput.mutation.causeClass,
            primaryFailureMechanism:
              result.attribution.rankedCandidates[0]!
                .hypothesizedMechanism,
            targets: value.loopInput.mutation.targets,
            predictedFix: value.loopInput.mutation.predictedFix,
            predictedRegressions:
              value.loopInput.mutation.predictedRegressions,
            passingBehaviorPreservation:
              value.loopInput.mutation.passingBehaviorPreservation,
            predictionMetadata: result.attribution.metadata,
          }),
          /duplicates rejected proposal/u,
        );
      }
      await value.runs.verifyAll();
      await value.miner.verifyAll();
      await value.attributions.verifyAll();
      await value.admission.verifyAll();
      await value.lineage.verifyAll();
      await value.qualification.verifyAll();
      await value.receipts.verifyAll();
      await value.promotions.verifyDecision(result.decision);
      await value.audit.verifyAll();
    });
  }
});

test("evaluation failure rejects the candidate once and records a failed evolution run", async (t) => {
  const value = await scenario(t, "evaluation_failure");
  await assert.rejects(
    value.loop.run(value.loopInput),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "PEER_CRASHED",
  );
  assert.equal(value.evaluationCalls(), 1);
  const records = await value.runs.records();
  const failed = records.at(-1)!;
  assert.equal(failed.state, "failed");
  assert.equal(failed.outcome, "failed");
  assert.equal(failed.failureCode, "PEER_CRASHED");
  assert.notEqual(failed.candidateHarnessVersionId, null);
  assert.notEqual(failed.mutationProposalId, null);
  assert.equal(
    await value.qualification.state(failed.candidateHarnessVersionId!),
    "rejected",
  );
  assert.equal(
    await value.mutations.disposition(failed.mutationProposalId!),
    "rejected",
  );
  assert.deepEqual(
    records.map((record) => record.state),
    [
      "created",
      "weaknesses_mined",
      "attributed",
      "candidate_created",
      "statically_validated",
      "evaluating",
      "failed",
    ],
  );
  assert.equal(
    value.components.getHarness(value.parent.harnessVersionId)
      .harnessVersionId,
    value.parent.harnessVersionId,
  );
  await value.runs.verifyAll();
  await value.qualification.verifyAll();
  await value.receipts.verifyAll();
  await value.audit.verifyAll();
});
