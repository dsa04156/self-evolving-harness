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
  DeterministicClock,
  DeterministicIdFactory,
  EvidenceReceiptStore,
  HarnessComponentRegistry,
  HarnessLineageStore,
  HarnessQualificationStore,
  PrincipalRegistry,
  PrincipalSigner,
  RuntimeEventStream,
  SchemaRegistry,
  SecretRedactor,
  WeaknessMiningService,
  type FailurePattern,
  type SessionPins,
} from "../src/index.js";

const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const runtimeContractHash = `sha256:${"2".repeat(64)}`;
const runtimeStateSnapshotId = `rss-sha256:${"3".repeat(64)}`;
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-attribution-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("weakness mining preserves facts separately from signed attribution inference", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const clock = new DeterministicClock();
  const ids = new DeterministicIdFactory();
  const principals = new PrincipalRegistry();
  const auditSigner = PrincipalSigner.generate({
    principalId: "audit.attribution",
    role: "audit_store",
    implementationDigest: digest("4"),
    instanceId: "audit.attribution.instance",
  });
  const runtimeSigner = PrincipalSigner.generate({
    principalId: "runtime.attribution",
    role: "runtime",
    implementationDigest: digest("5"),
    instanceId: "runtime.attribution.instance",
  });
  const operationsSigner = PrincipalSigner.generate({
    principalId: "operations.attribution",
    role: "operations_owner",
    implementationDigest: digest("6"),
    instanceId: "operations.attribution.instance",
  });
  const proposerSigner = PrincipalSigner.generate({
    principalId: "proposer.attribution",
    role: "proposer",
    implementationDigest: digest("7"),
    instanceId: "proposer.attribution.instance",
  });
  for (const signer of [
    auditSigner,
    runtimeSigner,
    operationsSigner,
    proposerSigner,
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
  await components.initialize(path.resolve("configs/component-type-registry.json"));
  const systemPrompt = await components.createComponent({
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
  const harness = await components.createHarness({
    semanticVersion: "1.0.0",
    requiredRuntimeContractHash: runtimeContractHash,
    bindings: [
      {
        slotId: "permission",
        componentManifestId: permission.componentManifestId,
      },
      {
        slotId: "system_prompt",
        componentManifestId: systemPrompt.componentManifestId,
      },
    ],
  });
  const pins: SessionPins = {
    protocolId,
    harnessVersionId: harness.harnessVersionId,
    runtimeStateSnapshotId,
    modelIdentityHash: digest("8"),
    permissionPolicyHash: digest("9"),
    safetyPolicyHash: digest("a"),
    budgetPolicyHash: digest("b"),
    budgetAccountId: "budget.attribution.1",
    datasetPermissions: ["mine"],
  };

  const traceInputs = [];
  for (const taskNumber of [1, 2]) {
    const sessionId = `session.attribution.${taskNumber}`;
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
      subjectIds: [`task.attribution.${taskNumber}`, sessionId],
      harnessVersionIds: [harness.harnessVersionId],
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
    traceInputs.push({
      taskId: `task.attribution.${taskNumber}`,
      eventStream: stream,
      selectedEventIds: [observation.eventId, verifier.eventId],
      sourceReceiptIds: [receipt.receiptId],
    });
  }

  const miner = new WeaknessMiningService({
    root,
    protocolId,
    harnessVersionId: harness.harnessVersionId,
    schemas,
    audit,
    receipts,
    principals,
    signer: proposerSigner,
    clock,
    ids,
  });
  const patterns = await miner.mine(traceInputs);
  assert.equal(patterns.length, 1);
  const pattern = patterns[0]!;
  assert.equal(pattern.recordedObservations.taskCount, 2);
  assert.equal(pattern.recordedObservations.failureCount, 2);
  assert.equal(pattern.recordedObservations.verifierOutcomeEventIds.length, 2);
  assert.equal(pattern.mechanismInference.metadata.confidence, 0.5);
  assert.match(
    pattern.mechanismInference.summary,
    /component causality remains a hypothesis/u,
  );

  const attribution = new AttributionService({
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
  const result = await attribution.attribute({
    failurePatternId: pattern.failurePatternId,
    datasetRole: "mine",
    useClass: "proposal_input",
    candidates: [
      {
        componentManifestId: systemPrompt.componentManifestId,
        score: 0.9,
        hypothesizedMechanism:
          "The active system prompt omits a mandatory verification instruction.",
      },
    ],
    confidence: 0.8,
    alternativeExplanations: [
      "The workflow may have suppressed the verification phase.",
    ],
    method: "deterministic-fake-attributor-v1",
  });
  assert.equal(result.epistemicClass, "inference");
  assert.equal(result.rankedCandidates[0]?.resolvedComponentType, "SystemPrompt");
  assert.deepEqual(
    result.metadata.sourceEventIds,
    pattern.recordedObservations.sourceEventIds,
  );
  await assert.rejects(
    attribution.attribute({
      failurePatternId: pattern.failurePatternId,
      datasetRole: "mine",
      useClass: "proposal_input",
      candidates: [
        {
          componentManifestId: permission.componentManifestId,
          score: 0.9,
          hypothesizedMechanism: "Attempt to blame immutable permissions.",
        },
      ],
      confidence: 0.4,
      alternativeExplanations: ["The prompt is more likely."],
      method: "forbidden-immutable-attributor",
    }),
    /immutable or disabled component/u,
  );

  const mutations = new BoundedMutationEngine({
    root,
    protocolId,
    registry: components,
    schemas,
    clock,
    ids,
    proposer: proposerSigner.identity,
  });
  const proposed = await mutations.propose({
    parentHarnessVersionId: harness.harnessVersionId,
    candidateSemanticVersion: "1.0.1",
    attributionMode: "guided",
    attributionResultId: result.attributionResultId,
    causeClass: "single_fault",
    primaryFailureMechanism:
      result.rankedCandidates[0]!.hypothesizedMechanism,
    targets: [
      {
        componentManifestId: systemPrompt.componentManifestId,
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
    predictedFix: "The runtime will receive an explicit verification instruction.",
    predictedRegressions: ["The added instruction may consume more context."],
    passingBehaviorPreservation: ["task.contract.known-pass"],
    predictionMetadata: result.metadata,
  });
  const lineages = new HarnessLineageStore({
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
    attributions: attribution,
    lineage: lineages,
    lifecycle: qualification,
    principals,
    signer: operationsSigner,
    clock,
    ids,
  });
  const admitted = await admission.admit(proposed.proposal);
  assert.equal(admitted.validation.valid, true);
  assert.equal(admitted.validation.immutableDiffCount, 0);
  assert.equal(
    admitted.lineage.parentHarnessVersionId,
    harness.harnessVersionId,
  );
  assert.equal(
    await qualification.state(proposed.candidate.harnessVersionId),
    "statically_validated",
  );

  const forged: FailurePattern = {
    ...pattern,
    mechanismInference: {
      ...pattern.mechanismInference,
      summary: "Forged mechanism.",
    },
  };
  await assert.rejects(miner.verify(forged), /Invalid Ed25519 signature/u);
  await miner.verifyAll();
  await attribution.verifyAll();
  await admission.verifyAll();
  await lineages.verifyAll();
  await qualification.verifyAll();
  await receipts.verifyAll();
  await audit.verifyAll();
});
