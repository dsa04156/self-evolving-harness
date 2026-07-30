import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  AuditTrail,
  DeploymentAuthorizer,
  DeploymentRegistry,
  DeterministicClock,
  DeterministicIdFactory,
  EvidenceReceiptStore,
  ExternalEvaluatorClient,
  HarnessComponentRegistry,
  HarnessQualificationStore,
  PrincipalRegistry,
  PrincipalSigner,
  PromotionService,
  SchemaRegistry,
  computeCandidateCostGate,
  type EvaluationBudgetUsage,
  type HarnessVersionManifest,
} from "../src/index.js";

const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const runtimeContractHash = `sha256:${"2".repeat(64)}`;
const promotionPolicyHash = `sha256:${"3".repeat(64)}`;
const deploymentPolicyHash = `sha256:${"4".repeat(64)}`;
const snapshotId = `rss-sha256:${"5".repeat(64)}`;

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function prompt(content: string) {
  return {
    schemaVersion: 1,
    language: "seh.prompt-markdown.v1",
    sections: [{ sectionId: "identity", purpose: "identity", content }],
    contextBindings: ["task_input"],
  };
}

function permissionPolicy() {
  return {
    schemaVersion: 1,
    language: "seh.policy-json.v1",
    policyType: "PermissionPolicy",
    policy: { mode: "fixed-test-boundary" },
  };
}

const usage: EvaluationBudgetUsage = {
  modelRequestAttempts: 2,
  completedModelCalls: 2,
  failedModelCalls: 0,
  cancelledModelCalls: 0,
  inputTokens: 70,
  outputTokens: 20,
  reasoningTokens: 10,
  cachedInputTokens: 0,
  totalChargedTokens: 100,
  providerCostMicros: 0,
  toolCalls: 2,
  feedbackEvents: 2,
  wallClockMillis: 10,
};

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-deployment-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("approved harnesses deploy by exact CAS and rollback swaps the full tuple", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const clock = new DeterministicClock();
  const ids = new DeterministicIdFactory();
  const principals = new PrincipalRegistry();
  const auditSigner = PrincipalSigner.generate({
    principalId: "audit.deployment",
    role: "audit_store",
    implementationDigest: digest("6"),
    instanceId: "audit.deployment.instance",
  });
  const operationsSigner = PrincipalSigner.generate({
    principalId: "operations.deployment",
    role: "operations_owner",
    implementationDigest: digest("7"),
    instanceId: "operations.deployment.instance",
  });
  const evaluatorSigner = PrincipalSigner.generate({
    principalId: "evaluator.deployment",
    role: "evaluator",
    implementationDigest: digest("8"),
    instanceId: "evaluator.deployment.instance",
  });
  const promoterSigner = PrincipalSigner.generate({
    principalId: "promoter.deployment",
    role: "promoter",
    implementationDigest: digest("9"),
    instanceId: "promoter.deployment.instance",
  });
  for (const signer of [
    auditSigner,
    operationsSigner,
    evaluatorSigner,
    promoterSigner,
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
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  const components = new HarnessComponentRegistry({
    root: path.join(root, "registry"),
    schemas,
    artifacts,
    requiredSlotIds: ["permission", "system_prompt"],
  });
  await components.initialize(path.resolve("configs/component-type-registry.json"));
  const permission = await components.createComponent({
    componentId: "component.permission-policy",
    semanticVersion: "1.0.0",
    typeEntryId: "type.permission-policy",
    payloadLanguage: "seh.policy-json.v1",
    payload: permissionPolicy(),
    capabilityIds: ["permission.authorize"],
  });
  const harnesses: HarnessVersionManifest[] = [];
  for (const [semanticVersion, content] of [
    ["1.0.0", "Parent prompt."],
    ["1.1.0", "Candidate A prompt."],
    ["1.2.0", "Candidate B prompt."],
  ] as const) {
    const systemPrompt = await components.createComponent({
      componentId: "component.system-prompt",
      semanticVersion,
      typeEntryId: "type.system-prompt",
      payloadLanguage: "seh.prompt-markdown.v1",
      payload: prompt(content),
      capabilityIds: ["prompt.instruct.primary"],
    });
    harnesses.push(
      await components.createHarness({
        semanticVersion,
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
      }),
    );
  }
  const [parent, candidateA, candidateB] = harnesses as [
    HarnessVersionManifest,
    HarnessVersionManifest,
    HarnessVersionManifest,
  ];

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
  t.after(async () => evaluator.stop());
  const promotions = new PromotionService({
    root,
    protocolId,
    promotionPolicyHash,
    schemas,
    audit,
    receipts,
    lifecycle: qualification,
    principals,
    signer: promoterSigner,
    clock,
    ids,
  });

  async function approve(candidate: HarnessVersionManifest) {
    const lifecycleReceipt = async (
      receiptType:
        | "artifact_retention"
        | "static_validation"
        | "evaluation"
        | "gate_release",
    ) =>
      receipts.create({
        receiptType,
        subjectIds: [candidate.harnessVersionId],
        harnessVersionIds: [candidate.harnessVersionId],
        signer: operationsSigner,
      });
    const draft = await lifecycleReceipt("artifact_retention");
    await qualification.createDraft({
      harnessVersionId: candidate.harnessVersionId,
      evidenceReceiptIds: [draft.receiptId],
      signer: operationsSigner,
    });
    const proposed = await lifecycleReceipt("artifact_retention");
    await qualification.transition({
      harnessVersionId: candidate.harnessVersionId,
      toState: "candidate",
      evidenceReceiptIds: [proposed.receiptId],
      signer: operationsSigner,
    });
    const validated = await lifecycleReceipt("static_validation");
    await qualification.transition({
      harnessVersionId: candidate.harnessVersionId,
      toState: "statically_validated",
      evidenceReceiptIds: [validated.receiptId],
      signer: operationsSigner,
    });
    const evaluating = await lifecycleReceipt("evaluation");
    await qualification.transition({
      harnessVersionId: candidate.harnessVersionId,
      toState: "evaluating",
      evidenceReceiptIds: [evaluating.receiptId],
      signer: operationsSigner,
    });
    const result = await evaluator.evaluate({
      methodId: "B6",
      parentHarnessVersionId: parent.harnessVersionId,
      candidateHarnessVersionId: candidate.harnessVersionId,
      runtimeStateSnapshotIds: [snapshotId],
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
      sourceEvidenceReceiptIds: [evaluating.receiptId],
    });
    const canary = await lifecycleReceipt("gate_release");
    await qualification.transition({
      harnessVersionId: candidate.harnessVersionId,
      toState: "canary",
      evidenceReceiptIds: [canary.receiptId],
      signer: operationsSigner,
    });
    const costGate = computeCandidateCostGate({
      gateTaskSetHash: digest("c"),
      taskCount: 2,
      candidatePasses: 2,
      parentPasses: 1,
      failToPassCount: 1,
      passToFailCount: 0,
      candidateFailedOrTimedOutTasks: 0,
      parentFailedOrTimedOutTasks: 0,
      candidateTotalChargedTokens: 100,
      parentTotalChargedTokens: 100,
      sourceLedgerReceiptIds: [evaluating.receiptId],
    });
    const decision = await promotions.decide({
      parentHarnessVersionId: parent.harnessVersionId,
      candidateHarnessVersionId: candidate.harnessVersionId,
      evaluationResults: [result],
      costGate,
    });
    assert.equal(decision.action, "approve");
    return decision;
  }

  const approvalA = await approve(candidateA);
  const approvalB = await approve(candidateB);
  const authorizer = new DeploymentAuthorizer({
    root,
    protocolId,
    deploymentPolicyHash,
    schemas,
    audit,
    components,
    promotions,
    signer: promoterSigner,
    clock,
    ids,
  });
  const deployment = new DeploymentRegistry({
    root,
    protocolId,
    deploymentPolicyHash,
    schemas,
    audit,
    components,
    promotions,
    qualification,
    principals,
    signer: operationsSigner,
    clock,
    ids,
  });

  const empty = await deployment.current();
  const initialize = await authorizer.authorize({
    action: "initialize",
    expectedBefore: empty,
    targetHarnessVersionId: candidateA.harnessVersionId,
  });
  await deployment.apply(initialize);
  const currentA = await deployment.current();
  assert.equal(currentA.harnessVersionId, candidateA.harnessVersionId);
  assert.equal(
    currentA.targetQualificationDecisionId,
    approvalA.promotionDecisionId,
  );
  await assert.rejects(
    authorizer.authorize({ action: "rollback", expectedBefore: currentA }),
    /Rollback target is null/u,
  );

  const deployB = await authorizer.authorize({
    action: "deploy",
    expectedBefore: currentA,
    targetHarnessVersionId: candidateB.harnessVersionId,
  });
  const staleDeployB = await authorizer.authorize({
    action: "deploy",
    expectedBefore: currentA,
    targetHarnessVersionId: candidateB.harnessVersionId,
  });
  await deployment.apply(deployB);
  await assert.rejects(
    deployment.apply(staleDeployB),
    /compare-and-swap expectation is stale/u,
  );
  const currentB = await deployment.current();
  assert.equal(currentB.harnessVersionId, candidateB.harnessVersionId);
  assert.equal(
    currentB.targetQualificationDecisionId,
    approvalB.promotionDecisionId,
  );
  assert.equal(
    currentB.rollbackTargetHarnessVersionId,
    candidateA.harnessVersionId,
  );

  const rollbackA = await authorizer.authorize({
    action: "rollback",
    expectedBefore: currentB,
  });
  await deployment.apply(rollbackA);
  const rolledBackA = await deployment.current();
  assert.equal(rolledBackA.harnessVersionId, candidateA.harnessVersionId);
  assert.equal(
    rolledBackA.rollbackTargetHarnessVersionId,
    candidateB.harnessVersionId,
  );

  const rollbackB = await authorizer.authorize({
    action: "rollback",
    expectedBefore: rolledBackA,
  });
  await deployment.apply(rollbackB);
  const rolledBackB = await deployment.current();
  assert.equal(rolledBackB.harnessVersionId, candidateB.harnessVersionId);

  const decommission = await authorizer.authorize({
    action: "decommission",
    expectedBefore: rolledBackB,
  });
  await deployment.apply(decommission);
  const stopped = await deployment.current();
  assert.equal(stopped.harnessVersionId, null);
  assert.equal(stopped.rollbackTargetHarnessVersionId, null);

  const lockDirectory = path.join(root, "deployment");
  await mkdir(lockDirectory, { recursive: true });
  await writeFile(
    path.join(lockDirectory, "production.lock"),
    JSON.stringify({ pid: 2_147_483_647, protocolId }),
    { mode: 0o600 },
  );
  assert.equal(await deployment.recoverStaleLock(), true);
  assert.equal(await deployment.recoverStaleLock(), false);

  await qualification.verifyAll();
  await receipts.verifyAll();
  await audit.verifyAll();
});
