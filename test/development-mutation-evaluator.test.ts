import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  AuditTrail,
  DeterministicClock,
  DeterministicIdFactory,
  DeterministicLabelBlindAttributor,
  DevelopmentExternalEvaluator,
  DevelopmentMutationDryRunService,
  EvidenceReceiptStore,
  HarnessComponentRegistry,
  HarnessQualificationStore,
  NonPromotableHarnessRegistry,
  PrincipalRegistry,
  PrincipalSigner,
  SchemaRegistry,
  assertDevelopmentCandidateDestination,
  createDevelopmentAttributionCommitment,
  createDevelopmentAttributionPrototypeManifest,
  parseStrictJson,
  sha256Text,
  type LabelBlindAttributionCorpus,
} from "../src/index.js";

async function setup(t: test.TestContext): Promise<{
  readonly root: string;
  readonly schemas: SchemaRegistry;
  readonly corpus: LabelBlindAttributionCorpus;
  readonly registry: HarnessComponentRegistry;
  readonly parentHarnessVersionId: string;
  readonly nonPromotable: NonPromotableHarnessRegistry;
  readonly proposer: PrincipalSigner;
  readonly operations: PrincipalSigner;
  readonly evaluator: PrincipalSigner;
}> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-development-mutation-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const corpus = parseStrictJson(
    await readFile(
      path.resolve(
        "benchmarks/harness-fault-bench/semantic/mine/label-blind-corpus.json",
      ),
      "utf8",
    ),
  ) as unknown as LabelBlindAttributionCorpus;
  const registry = new HarnessComponentRegistry({
    root: path.join(root, "registry"),
    schemas,
    artifacts: new ArtifactStore(
      path.join(root, "artifacts"),
    ),
    requiredSlotIds: ["permission", "workflow"],
  });
  await registry.initialize(
    path.resolve("configs/component-type-registry.json"),
  );
  const permission = await registry.createComponent({
    componentId: "component.permission.synthetic",
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
  const workflow = await registry.createComponent({
    componentId: "component.workflow.synthetic",
    semanticVersion: "1.0.0",
    typeEntryId: "type.workflow-policy",
    payloadLanguage: "seh.workflow.v1",
    payload: {
      schemaVersion: 1,
      language: "seh.workflow.v1",
      entryState: "start",
      states: [
        {
          stateId: "start",
          actions: [
            {
              action: "construct_context",
              targetId: null,
            },
          ],
        },
        {
          stateId: "complete",
          actions: [],
        },
      ],
      transitions: [
        {
          from: "start",
          trigger: "action_succeeded",
          guard: "always",
          to: "complete",
        },
      ],
      terminalStates: ["complete"],
    },
    capabilityIds: ["workflow.dispatch.closed-action"],
  });
  const parent = await registry.createHarness({
    semanticVersion: "1.0.0",
    requiredRuntimeContractHash: sha256Text(
      "development-runtime-contract",
    ),
    bindings: [
      {
        slotId: "permission",
        componentManifestId:
          permission.componentManifestId,
      },
      {
        slotId: "workflow",
        componentManifestId:
          workflow.componentManifestId,
      },
    ],
  });
  const proposer = PrincipalSigner.generate({
    principalId: "proposer.development-mutation.test",
    role: "proposer",
    implementationDigest: sha256Text(
      "development-mutation-test",
    ),
    instanceId:
      "proposer.development-mutation.test.instance",
  });
  const operations = PrincipalSigner.generate({
    principalId: "operations.development-mutation.test",
    role: "operations_owner",
    implementationDigest: sha256Text(
      "development-mutation-quarantine-test",
    ),
    instanceId:
      "operations.development-mutation.test.instance",
  });
  const evaluator = PrincipalSigner.generate({
    principalId: "evaluator.development-mutation.test",
    role: "evaluator",
    implementationDigest: sha256Text(
      "development-evaluator-test",
    ),
    instanceId:
      "evaluator.development-mutation.test.instance",
  });
  return {
    root,
    schemas,
    corpus,
    registry,
    parentHarnessVersionId: parent.harnessVersionId,
    nonPromotable: new NonPromotableHarnessRegistry({
      root,
      schemas,
    }),
    proposer,
    operations,
    evaluator,
  };
}

test("label-blind mutation candidate is bounded, externally evaluated, and non-promotable", async (t) => {
  const value = await setup(t);
  const manifest =
    createDevelopmentAttributionPrototypeManifest({
      prototypeId:
        "development.label-blind-attributor.mutation-test",
      semanticVersion: "0.1.0",
      implementationHash: sha256Text(
        "development-attributor-mutation-test",
      ),
      approvedCorpusHash: value.corpus.corpusHash,
    });
  const predictionSet =
    new DeterministicLabelBlindAttributor({
      manifest,
      schemas: value.schemas,
    }).run({
      runId: "development-attribution-run.mutation-test",
      corpus: value.corpus,
      generatedAt: "2026-07-31T06:00:00.000Z",
      priorDiagnosticResultsVisible: false,
    });
  const first = predictionSet.predictions[0]!;
  assert.equal(
    first.rankedComponentTypes[0]?.componentType,
    "WorkflowPolicy",
  );
  const commitment = createDevelopmentAttributionCommitment({
    predictionSet,
    manifest,
    corpus: value.corpus,
    schemas: value.schemas,
    signer: value.proposer,
    commitmentId:
      "development-attribution-commitment.mutation-test",
    sealedAt: "2026-07-31T06:01:00.000Z",
  });

  const service = new DevelopmentMutationDryRunService({
    protocolId: "protocol.development-mutation.test",
    schemas: value.schemas,
    registry: value.registry,
    nonPromotable: value.nonPromotable,
    proposer: value.proposer,
    operations: value.operations,
  });
  const dryRun = await service.create({
    dryRunId: "development-mutation-dry-run.test",
    quarantineRecordId:
      "non-promotable-harness.development-mutation.test",
    parentHarnessVersionId:
      value.parentHarnessVersionId,
    candidateSemanticVersion: "1.1.0",
    nextComponentSemanticVersion: "1.1.0",
    selectedTraceProjectionId:
      first.traceProjectionId,
    operations: [
      {
        op: "replace",
        path: "/states/0/actions/0/action",
        value: "model_turn",
      },
    ],
    semanticOperations: [
      "Replace the synthetic entry action for dry-run validation.",
    ],
    manifest,
    corpus: value.corpus,
    predictionSet,
    commitment,
    createdAt: "2026-07-31T06:02:00.000Z",
  });
  assert.equal(dryRun.change.changedComponentCount, 1);
  assert.equal(dryRun.lifecycleBoundary.promotable, false);
  await assert.rejects(
    value.nonPromotable.assertQualificationAllowed(
      dryRun.candidateHarnessVersionId,
    ),
    /cannot enter qualification/iu,
  );
  assert.throws(
    () =>
      assertDevelopmentCandidateDestination(
        dryRun,
        "canary",
      ),
    /cannot enter canary/iu,
  );

  const external = new DevelopmentExternalEvaluator({
    schemas: value.schemas,
    nonPromotable: value.nonPromotable,
    evaluator: value.evaluator,
    pythonExecutable: "python3",
    scriptPath: path.resolve(
      "evaluator/development_dry_run_evaluator.py",
    ),
  });
  const evaluated = await external.evaluate({
    requestId: "development-evaluator-request.test",
    resultId: "development-evaluator-result.test",
    dryRun,
    tasks: [
      {
        taskId: "synthetic-task.read-path",
        taskInputHash: sha256Text("synthetic-task-input"),
        parentPassed: false,
        candidatePassed: true,
      },
      {
        taskId: "synthetic-task.preserve-path",
        taskInputHash: sha256Text(
          "synthetic-preservation-input",
        ),
        parentPassed: true,
        candidatePassed: true,
      },
    ],
    evaluatedAt: "2026-07-31T06:03:00.000Z",
  });
  assert.equal(
    evaluated.result.externalProcess.requestAccepted,
    true,
  );
  assert.equal(
    evaluated.result.syntheticOutcomes.researchMetric,
    false,
  );
  assert.equal(
    evaluated.result.lifecycleBoundary.canaryAllowed,
    false,
  );

  const principalRegistry = new PrincipalRegistry();
  principalRegistry.register(value.operations.exportPublic());
  const auditSigner = PrincipalSigner.generate({
    principalId: "audit.development-mutation.test",
    role: "audit_store",
    implementationDigest: sha256Text(
      "development-mutation-audit",
    ),
    instanceId:
      "audit.development-mutation.test.instance",
  });
  principalRegistry.register(auditSigner.exportPublic());
  const clock = new DeterministicClock(
    "2026-07-31T06:04:00.000Z",
  );
  const ids = new DeterministicIdFactory(0);
  const audit = new AuditTrail({
    root: value.root,
    protocolId: "protocol.development-mutation.test",
    signer: auditSigner,
    principals: principalRegistry,
    clock,
    ids,
  });
  const receipts = new EvidenceReceiptStore({
    root: value.root,
    protocolId: "protocol.development-mutation.test",
    schemas: value.schemas,
    audit,
    principals: principalRegistry,
    clock,
    ids,
  });
  const qualification = new HarnessQualificationStore({
    root: value.root,
    protocolId: "protocol.development-mutation.test",
    schemas: value.schemas,
    audit,
    receipts,
    principals: principalRegistry,
    clock,
    ids,
  });
  await assert.rejects(
    qualification.createDraft({
      harnessVersionId:
        dryRun.candidateHarnessVersionId,
      evidenceReceiptIds: [],
      signer: value.operations,
    }),
    /cannot enter qualification/iu,
  );
});

test("development mutation and evaluator source do not import oracle authority", async () => {
  for (const sourcePath of [
    "src/evolution/development-mutation-dry-run.ts",
    "src/evolution/development-external-evaluator.ts",
  ]) {
    const source = await readFile(path.resolve(sourcePath), "utf8");
    for (const forbiddenImport of [
      "hfb-semantic-authoring",
      "harness-fault-bench",
      "development-attribution-scorer",
      "oracle-records/",
    ]) {
      assert.equal(
        source.includes(forbiddenImport),
        false,
        `${sourcePath} imports ${forbiddenImport}`,
      );
    }
  }
});
