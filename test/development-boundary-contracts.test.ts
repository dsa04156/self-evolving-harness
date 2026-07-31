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
  DeterministicLabelBlindAttributor,
  DevelopmentArtifactTaintPolicy,
  DevelopmentBoundaryMutationService,
  HarnessComponentRegistry,
  PrincipalSigner,
  SchemaRegistry,
  createDevelopmentArtifactTaintRecord,
  createDevelopmentAttributionCommitment,
  createDevelopmentAttributionPrototypeManifest,
  createDevelopmentBoundaryReceipt,
  createDevelopmentPredictionSeal,
  createDevelopmentSyntheticEvaluation,
  createNonPromotableHarnessRecord,
  executeDevelopmentSyntheticRuntime,
  parseStrictJson,
  sha256Text,
  verifyDevelopmentBoundaryReceipt,
  verifyDevelopmentPredictionSeal,
  type LabelBlindAttributionCorpus,
} from "../src/index.js";

async function attributionFixture(): Promise<{
  readonly schemas: SchemaRegistry;
  readonly corpus: LabelBlindAttributionCorpus;
}> {
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
  return { schemas, corpus };
}

function signer(
  name: string,
  role:
    | "runtime"
    | "operations_owner"
    | "proposer"
    | "evaluator"
    | "audit_store",
): PrincipalSigner {
  return PrincipalSigner.generate({
    principalId: `${role}.${name}`,
    role,
    implementationDigest: sha256Text(
      `implementation.${role}.${name}`,
    ),
    instanceId: `${role}.${name}.instance`,
  });
}

test("prediction seal and role receipts bind ordering, authority, and process identity", async () => {
  const value = await attributionFixture();
  const manifest =
    createDevelopmentAttributionPrototypeManifest({
      prototypeId: "development.boundary.attributor",
      semanticVersion: "0.2.0",
      implementationHash: sha256Text(
        "development.boundary.attributor",
      ),
      approvedCorpusHash: value.corpus.corpusHash,
    });
  const predictionSet =
    new DeterministicLabelBlindAttributor({
      manifest,
      schemas: value.schemas,
    }).run({
      runId: "development.boundary.predictions",
      corpus: value.corpus,
      generatedAt: "2026-07-31T10:00:00.000Z",
      priorDiagnosticResultsVisible: false,
    });
  const committer = signer(
    "prediction-committer",
    "proposer",
  );
  const commitment =
    createDevelopmentAttributionCommitment({
      predictionSet,
      manifest,
      corpus: value.corpus,
      schemas: value.schemas,
      signer: committer,
      commitmentId:
        "development.boundary.commitment",
      sealedAt: "2026-07-31T10:01:00.000Z",
    });
  const audit = signer("prediction-seal", "audit_store");
  const seal = createDevelopmentPredictionSeal({
    sealId: "development.boundary.seal",
    commitment,
    predictionSet,
    manifest,
    corpus: value.corpus,
    sealedAt: "2026-07-31T10:02:00.000Z",
    signer: audit,
    schemas: value.schemas,
  });
  verifyDevelopmentPredictionSeal({
    record: seal,
    commitment,
    predictionSet,
    manifest,
    corpus: value.corpus,
    schemas: value.schemas,
  });
  assert.equal(seal.scorerReleaseAllowed, true);
  assert.throws(
    () =>
      createDevelopmentPredictionSeal({
        sealId: "development.boundary.early-seal",
        commitment,
        predictionSet,
        manifest,
        corpus: value.corpus,
        sealedAt: "2026-07-31T10:00:59.999Z",
        signer: audit,
        schemas: value.schemas,
      }),
    /cannot precede/iu,
  );

  const scorer = signer("scorer", "evaluator");
  const receipt = createDevelopmentBoundaryReceipt({
    receiptId: "development.boundary.receipt.scorer",
    roleName: "scorer",
    action: "score_predictions",
    process: {
      uid: 1203,
      gid: 1203,
      isolationClass: "os_enforced_subordinate_uid",
    },
    inputHashes: [
      seal.recordHash,
      predictionSet.predictionSetHash,
    ],
    outputHashes: [sha256Text("score-output")],
    accessibleMountClasses: [
      "visible_fixture_oracle_read_only",
      "scorer_private_key",
    ],
    absentCapabilityClasses: [
      "candidate_mutation",
      "promotion",
      "research_selection",
    ],
    startedAt: "2026-07-31T10:03:00.000Z",
    completedAt: "2026-07-31T10:03:01.000Z",
    signer: scorer,
    schemas: value.schemas,
  });
  verifyDevelopmentBoundaryReceipt({
    receipt,
    schemas: value.schemas,
  });
  assert.equal(receipt.process.uid, 1203);
  assert.throws(
    () =>
      createDevelopmentBoundaryReceipt({
        receiptId:
          "development.boundary.receipt.wrong-key",
        roleName: "scorer",
        action: "score_predictions",
        process: {
          uid: 1203,
          gid: 1203,
          isolationClass:
            "os_enforced_subordinate_uid",
        },
        inputHashes: [seal.recordHash],
        outputHashes: [sha256Text("score-output")],
        accessibleMountClasses: [],
        absentCapabilityClasses: [],
        startedAt: "2026-07-31T10:03:00.000Z",
        completedAt: "2026-07-31T10:03:01.000Z",
        signer: committer,
        schemas: value.schemas,
      }),
    /requires evaluator authority/iu,
  );
});

test("recursive taints reject copied, aliased, wrapped, and post-score laundering", async () => {
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const audit = signer("anti-laundering", "audit_store");
  const candidateId =
    `hv-sha256:${"a".repeat(64)}`;
  const predictionHash = sha256Text("predictions");
  const oracleHash = sha256Text("oracle");
  const scoreHash = sha256Text("score");
  const evaluationHash = sha256Text("evaluation");
  const record = createDevelopmentArtifactTaintRecord({
    recordId: "development.taint.test",
    recordedAt: "2026-07-31T11:00:00.000Z",
    signer: audit,
    schemas,
    artifacts: [
      {
        artifactId: "prediction.test",
        artifactKind: "prediction_set",
        contentHash: predictionHash,
        taintClasses: ["prediction_pre_oracle"],
      },
      {
        artifactId: "oracle.test",
        artifactKind: "oracle_access_event",
        contentHash: oracleHash,
        taintClasses: ["oracle_input"],
      },
      {
        artifactId: "score.test",
        artifactKind: "score_report",
        contentHash: scoreHash,
        references: [oracleHash, predictionHash],
        taintClasses: ["post_score_output"],
      },
      {
        artifactId: "candidate.test",
        artifactKind: "candidate_harness",
        contentHash: candidateId,
        aliases: [
          "archive/candidate-latest",
          "candidate-copy-manifest",
        ],
        references: [predictionHash],
        taintClasses: ["development_candidate"],
      },
      {
        artifactId: "evaluation.test",
        artifactKind: "evaluator_result",
        contentHash: evaluationHash,
        references: [candidateId],
        taintClasses: ["development_evaluation"],
      },
    ],
  });
  const policy = new DevelopmentArtifactTaintPolicy({
    records: [record],
    schemas,
  });

  policy.assertGraphUseAllowed({
    useClass: "development_mutation_proposer_input",
    rootReferences: [predictionHash],
    nodes: [],
  });
  for (const forbiddenRoot of [oracleHash, scoreHash]) {
    assert.throws(
      () =>
        policy.assertGraphUseAllowed({
          useClass:
            "development_mutation_proposer_input",
          rootReferences: [forbiddenRoot],
          nodes: [],
        }),
      /cannot be used/iu,
    );
  }
  for (const useClass of [
    "research_protocol_manifest",
    "research_candidate_selection",
    "promotion_decision",
    "canary",
    "claim_table",
  ] as const) {
    assert.throws(
      () =>
        policy.assertGraphUseAllowed({
          useClass,
          rootReferences: [candidateId],
          nodes: [],
        }),
      /cannot be used/iu,
    );
  }

  assert.throws(
    () =>
      policy.assertGraphUseAllowed({
        useClass: "research_protocol_manifest",
        rootReferences: ["copied.manifest"],
        nodes: [
          {
            artifactId: "copied.manifest",
            contentHash: candidateId,
            aliases: [],
            references: [],
          },
        ],
      }),
    /cannot be used/iu,
  );
  assert.throws(
    () =>
      policy.assertGraphUseAllowed({
        useClass: "research_evidence",
        rootReferences: ["wrapper.outer"],
        nodes: [
          {
            artifactId: "wrapper.outer",
            contentHash: sha256Text("wrapper.outer"),
            aliases: [],
            references: ["wrapper.inner"],
          },
          {
            artifactId: "wrapper.inner",
            contentHash: sha256Text("wrapper.inner"),
            aliases: [],
            references: [evaluationHash],
          },
        ],
      }),
    /cannot be used/iu,
  );
  assert.throws(
    () =>
      policy.assertGraphUseAllowed({
        useClass: "research_candidate_selection",
        rootReferences: ["archive/candidate-latest"],
        nodes: [],
      }),
    /cannot be used/iu,
  );
});

test("bounded candidate is evaluated from actual standalone runtime evidence", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-development-runtime-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const value = await attributionFixture();
  const registry = new HarnessComponentRegistry({
    root: path.join(root, "registry"),
    schemas: value.schemas,
    artifacts: new ArtifactStore(
      path.join(root, "registry-artifacts"),
    ),
    requiredSlotIds: ["permission", "workflow"],
  });
  await registry.initialize(
    path.resolve("configs/component-type-registry.json"),
  );
  const permission = await registry.createComponent({
    componentId: "component.permission.boundary-test",
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
    componentId: "component.workflow.boundary-test",
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
          actions: [],
        },
        {
          stateId: "work",
          actions: [
            {
              action: "construct_context",
              targetId: null,
            },
          ],
        },
      ],
      transitions: [
        {
          from: "start",
          trigger: "action_succeeded",
          guard: "always",
          to: "work",
        },
      ],
      terminalStates: ["work"],
    },
    capabilityIds: ["workflow.dispatch.closed-action"],
  });
  const parent = await registry.createHarness({
    semanticVersion: "1.0.0",
    requiredRuntimeContractHash: sha256Text(
      "development-boundary-runtime-contract",
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
  const manifest =
    createDevelopmentAttributionPrototypeManifest({
      prototypeId:
        "development.boundary.runtime-attributor",
      semanticVersion: "0.2.0",
      implementationHash: sha256Text(
        "development.boundary.runtime-attributor",
      ),
      approvedCorpusHash: value.corpus.corpusHash,
    });
  const predictionSet =
    new DeterministicLabelBlindAttributor({
      manifest,
      schemas: value.schemas,
    }).run({
      runId: "development.boundary.runtime-predictions",
      corpus: value.corpus,
      generatedAt: "2026-07-31T12:00:00.000Z",
      priorDiagnosticResultsVisible: false,
    });
  const selected = predictionSet.predictions[0]!;
  assert.equal(
    selected.rankedComponentTypes[0]?.componentType,
    "WorkflowPolicy",
  );
  const proposer = signer("boundary-mutation", "proposer");
  const commitment =
    createDevelopmentAttributionCommitment({
      predictionSet,
      manifest,
      corpus: value.corpus,
      schemas: value.schemas,
      signer: proposer,
      commitmentId:
        "development.boundary.runtime-commitment",
      sealedAt: "2026-07-31T12:01:00.000Z",
    });
  const proposal =
    await new DevelopmentBoundaryMutationService({
      registry,
      schemas: value.schemas,
      proposer,
    }).create({
      proposalId:
        "development.boundary.mutation-proposal",
      parentHarnessVersionId: parent.harnessVersionId,
      candidateSemanticVersion: "1.1.0",
      nextComponentSemanticVersion: "1.1.0",
      selectedTraceProjectionId:
        selected.traceProjectionId,
      operations: [
        {
          op: "replace",
          path: "/states/1/actions/0/action",
          value: "model_turn",
        },
      ],
      semanticOperations: [
        "Replace the single observable synthetic workflow action.",
      ],
      manifest,
      corpus: value.corpus,
      predictionSet,
      commitment,
      createdAt: "2026-07-31T12:02:00.000Z",
    });
  assert.equal(
    proposal.handoffBoundary.evaluatorReleaseAllowed,
    false,
  );

  const operations = signer(
    "boundary-quarantine",
    "operations_owner",
  );
  const nonPromotable =
    createNonPromotableHarnessRecord({
      recordId:
        "development.boundary.non-promotable",
      harnessVersionId:
        proposal.candidateHarnessVersionId,
      recordedAt: "2026-07-31T12:03:00.000Z",
      signer: operations,
    });
  const runtimeSigner = signer(
    "boundary-synthetic-runtime",
    "runtime",
  );
  const execution =
    await executeDevelopmentSyntheticRuntime({
      root: path.join(root, "runtime"),
      protocolId:
        `protocol-sha256:${"b".repeat(64)}`,
      executionBundleId:
        "development.boundary.execution",
      parentHarnessVersionId:
        proposal.parentHarnessVersionId,
      candidateHarnessVersionId:
        proposal.candidateHarnessVersionId,
      tasks: [
        {
          taskId: "candidate-improves",
          acceptedActions: ["model_turn"],
        },
        {
          taskId: "passing-behavior-preserved",
          acceptedActions: [
            "construct_context",
            "model_turn",
          ],
        },
      ],
      registry,
      runtimeSigner,
      schemas: value.schemas,
      generatedAt: "2026-07-31T12:04:00.000Z",
    });
  assert.equal(
    execution.tasks[0]!.parent.passed,
    false,
  );
  assert.equal(
    execution.tasks[0]!.candidate.passed,
    true,
  );
  assert.equal(
    execution.tasks[0]!.parent.observedAction,
    "construct_context",
  );
  assert.equal(
    execution.tasks[0]!.candidate.observedAction,
    "model_turn",
  );

  const evaluator = signer(
    "boundary-candidate-evaluator",
    "evaluator",
  );
  const result = createDevelopmentSyntheticEvaluation({
    resultId: "development.boundary.evaluation",
    execution,
    nonPromotableRecord: nonPromotable,
    evaluatedAt: "2026-07-31T12:05:00.000Z",
    signer: evaluator,
    schemas: value.schemas,
  });
  assert.deepEqual(result.aggregate, {
    taskCount: 2,
    parentPassCount: 1,
    candidatePassCount: 2,
    passToFailCount: 0,
    failToPassCount: 1,
    researchMetric: false,
    promotionSignal: false,
  });
  assert.equal(result.lifecycleBoundary.promotable, false);
});
