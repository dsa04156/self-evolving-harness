import { constants } from "node:fs";
import {
  open,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  ArtifactStore,
  DeterministicLabelBlindAttributor,
  DevelopmentBoundaryMutationService,
  HarnessComponentRegistry,
  NonPromotableHarnessRegistry,
  PrincipalSigner,
  SchemaRegistry,
  canonicalBytes,
  createDevelopmentArtifactTaintRecord,
  createDevelopmentAttributionCommitment,
  createDevelopmentAttributionPrototypeManifest,
  createDevelopmentBoundaryReceipt,
  createDevelopmentOracleAccessEvent,
  createDevelopmentPredictionSeal,
  createDevelopmentSyntheticEvaluation,
  createNonPromotableHarnessRecord,
  executeDevelopmentSyntheticRuntime,
  parseStrictJson,
  scoreDevelopmentAttribution,
  sha256,
  sha256Text,
  verifyDevelopmentAttributionCommitment,
  verifyDevelopmentBoundaryMutation,
  verifyDevelopmentBoundaryReceipt,
  verifyDevelopmentPredictionSeal,
  type DevelopmentArtifactTaintClass,
  type DevelopmentAttributionCommitment,
  type DevelopmentAttributionPredictionSet,
  type DevelopmentAttributionPrototypeManifest,
  type DevelopmentBoundaryReceipt,
  type DevelopmentOracleJoinEntry,
  type DevelopmentPredictionSealRecord,
  type DevelopmentSyntheticExecutionBundle,
  type DevelopmentTaintedArtifact,
  type JsonValue,
  type LabelBlindAttributionCorpus,
  type NonPromotableHarnessRecord,
  type PublicPrincipal,
} from "../src/index.js";

const INPUT = "/input";
const STATE = "/state";
const SCHEMAS = "/opt/seh/schemas";
const TYPE_REGISTRY =
  "/opt/seh/config/component-type-registry.json";
const PRIVATE_KEY = "/run/keys/private.pem";

interface WorkerConfiguration {
  readonly mode:
    | "attribute"
    | "commit"
    | "seal"
    | "score"
    | "propose"
    | "quarantine"
    | "runtime"
    | "evaluate"
    | "finalize";
  readonly timestamp: string;
  readonly protocolId?: string;
}

async function readJson<T>(name: string): Promise<T> {
  return parseStrictJson(
    await readFile(path.join(INPUT, name), "utf8"),
  ) as unknown as T;
}

async function writeJson(
  name: string,
  value: JsonValue,
): Promise<void> {
  await writeFile(
    path.join(STATE, name),
    canonicalBytes(value),
    { mode: 0o600, flag: "wx" },
  );
}

async function writeDurableExclusive(
  name: string,
  value: JsonValue,
): Promise<void> {
  const file = path.join(STATE, name);
  const handle = await open(
    file,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(canonicalBytes(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await open(
    STATE,
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function loadSigner(): Promise<PrincipalSigner> {
  const principal =
    await readJson<PublicPrincipal>("own-public.json");
  return PrincipalSigner.import({
    identity: principal.identity,
    keyId: principal.keyId,
    privateKeyPem: await readFile(PRIVATE_KEY, "utf8"),
    publicKeyPem: principal.publicKeyPem,
  });
}

function processIdentity(): {
  readonly uid: number;
  readonly gid: number;
  readonly isolationClass:
    "os_enforced_subordinate_uid";
} {
  return {
    uid: process.getuid?.() ?? -1,
    gid: process.getgid?.() ?? -1,
    isolationClass: "os_enforced_subordinate_uid",
  };
}

async function receipt(input: {
  readonly receiptId: string;
  readonly roleName:
    | "attributor"
    | "prediction_committer"
    | "scorer"
    | "mutation_proposer"
    | "candidate_quarantine"
    | "runtime"
    | "candidate_evaluator"
    | "audit";
  readonly action:
    | "attribute"
    | "commit_predictions"
    | "seal_predictions"
    | "score_predictions"
    | "propose_mutation"
    | "quarantine_candidate"
    | "execute_synthetic_pair"
    | "evaluate_synthetic_pair"
    | "finalize_evidence";
  readonly inputHashes: readonly string[];
  readonly outputHashes: readonly string[];
  readonly mounts: readonly string[];
  readonly absent: readonly string[];
  readonly timestamp: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): Promise<DevelopmentBoundaryReceipt> {
  const result = createDevelopmentBoundaryReceipt({
    receiptId: input.receiptId,
    roleName: input.roleName,
    action: input.action,
    process: processIdentity(),
    inputHashes: input.inputHashes,
    outputHashes: input.outputHashes,
    accessibleMountClasses: input.mounts,
    absentCapabilityClasses: input.absent,
    startedAt: input.timestamp,
    completedAt: input.timestamp,
    signer: input.signer,
    schemas: input.schemas,
  });
  await writeJson(
    "receipt.json",
    result as unknown as JsonValue,
  );
  return result;
}

async function attribute(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const corpus =
    await readJson<LabelBlindAttributionCorpus>(
      "corpus.json",
    );
  const manifest =
    createDevelopmentAttributionPrototypeManifest({
      prototypeId:
        "development.os-boundary.attributor.v1",
      semanticVersion: "0.3.0",
      implementationHash:
        signer.identity.implementationDigest,
      approvedCorpusHash: corpus.corpusHash,
    });
  const predictions =
    new DeterministicLabelBlindAttributor({
      manifest,
      schemas,
    }).run({
      runId: "development.os-boundary.predictions.v1",
      corpus,
      generatedAt: config.timestamp,
      priorDiagnosticResultsVisible: false,
    });
  await writeJson(
    "manifest.json",
    manifest as unknown as JsonValue,
  );
  await writeJson(
    "predictions.json",
    predictions as unknown as JsonValue,
  );
  await receipt({
    receiptId: "development.os-boundary.attributor",
    roleName: "attributor",
    action: "attribute",
    inputHashes: [corpus.corpusHash],
    outputHashes: [
      manifest.manifestHash,
      predictions.predictionSetHash,
    ],
    mounts: ["label_blind_corpus", "attributor_key"],
    absent: [
      "oracle",
      "score_report",
      "candidate_evaluation",
      "promotion",
      "network",
    ],
    timestamp: config.timestamp,
    signer,
    schemas,
  });
}

async function commit(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const corpus =
    await readJson<LabelBlindAttributionCorpus>(
      "corpus.json",
    );
  const manifest =
    await readJson<DevelopmentAttributionPrototypeManifest>(
      "manifest.json",
    );
  const predictions =
    await readJson<DevelopmentAttributionPredictionSet>(
      "predictions.json",
    );
  const commitment =
    createDevelopmentAttributionCommitment({
      predictionSet: predictions,
      manifest,
      corpus,
      schemas,
      signer,
      commitmentId:
        "development.os-boundary.commitment.v1",
      sealedAt: config.timestamp,
    });
  await writeJson(
    "commitment.json",
    commitment as unknown as JsonValue,
  );
  await receipt({
    receiptId:
      "development.os-boundary.prediction-committer",
    roleName: "prediction_committer",
    action: "commit_predictions",
    inputHashes: [
      corpus.corpusHash,
      manifest.manifestHash,
      predictions.predictionSetHash,
    ],
    outputHashes: [commitment.commitmentHash],
    mounts: [
      "label_blind_corpus",
      "sealed_predictions",
      "prediction_committer_key",
    ],
    absent: [
      "oracle",
      "score_report",
      "candidate_mutation",
      "promotion",
      "network",
    ],
    timestamp: config.timestamp,
    signer,
    schemas,
  });
}

async function seal(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const corpus =
    await readJson<LabelBlindAttributionCorpus>(
      "corpus.json",
    );
  const manifest =
    await readJson<DevelopmentAttributionPrototypeManifest>(
      "manifest.json",
    );
  const predictions =
    await readJson<DevelopmentAttributionPredictionSet>(
      "predictions.json",
    );
  const commitment =
    await readJson<DevelopmentAttributionCommitment>(
      "commitment.json",
    );
  const predictionSeal = createDevelopmentPredictionSeal({
    sealId: "development.os-boundary.seal.v1",
    commitment,
    predictionSet: predictions,
    manifest,
    corpus,
    sealedAt: config.timestamp,
    signer,
    schemas,
  });
  await writeDurableExclusive(
    "prediction-seal.json",
    predictionSeal as unknown as JsonValue,
  );
  await receipt({
    receiptId: "development.os-boundary.audit-seal",
    roleName: "audit",
    action: "seal_predictions",
    inputHashes: [
      corpus.corpusHash,
      manifest.manifestHash,
      predictions.predictionSetHash,
      commitment.commitmentHash,
    ],
    outputHashes: [predictionSeal.recordHash],
    mounts: ["audit_key", "prediction_commitment"],
    absent: [
      "oracle",
      "score_report",
      "candidate_mutation",
      "promotion",
      "network",
    ],
    timestamp: config.timestamp,
    signer,
    schemas,
  });
}

async function score(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const corpus =
    await readJson<LabelBlindAttributionCorpus>(
      "corpus.json",
    );
  const manifest =
    await readJson<DevelopmentAttributionPrototypeManifest>(
      "manifest.json",
    );
  const predictions =
    await readJson<DevelopmentAttributionPredictionSet>(
      "predictions.json",
    );
  const commitment =
    await readJson<DevelopmentAttributionCommitment>(
      "commitment.json",
    );
  const predictionSeal =
    await readJson<DevelopmentPredictionSealRecord>(
      "prediction-seal.json",
    );
  const oracle =
    await readJson<readonly DevelopmentOracleJoinEntry[]>(
      "oracle-join.json",
    );
  verifyDevelopmentPredictionSeal({
    record: predictionSeal,
    commitment,
    predictionSet: predictions,
    manifest,
    corpus,
    schemas,
  });
  const access = createDevelopmentOracleAccessEvent({
    accessEventId:
      "development.os-boundary.oracle-access.v1",
    commitment,
    predictionSet: predictions,
    manifest,
    corpus,
    oracleEntries: oracle,
    accessedAt: config.timestamp,
    signer,
    schemas,
  });
  const report = scoreDevelopmentAttribution({
    reportId: "development.os-boundary.score.v1",
    scorerId: "development.os-boundary.scorer.v1",
    scorerImplementationHash:
      signer.identity.implementationDigest,
    predictionSet: predictions,
    commitment,
    manifest,
    corpus,
    oracleEntries: oracle,
    accessEvent: access,
    scoredAt: config.timestamp,
    signer,
    schemas,
  });
  await writeJson(
    "oracle-access.json",
    access as unknown as JsonValue,
  );
  await writeJson(
    "score-report.json",
    report as unknown as JsonValue,
  );
  await receipt({
    receiptId: "development.os-boundary.scorer",
    roleName: "scorer",
    action: "score_predictions",
    inputHashes: [
      predictionSeal.recordHash,
      commitment.commitmentHash,
      predictions.predictionSetHash,
      corpus.corpusHash,
    ],
    outputHashes: [access.eventHash, report.reportHash],
    mounts: [
      "visible_fixture_oracle_read_only",
      "scorer_key",
      "prediction_seal",
    ],
    absent: [
      "candidate_mutation",
      "operations_key",
      "promotion",
      "research_selection",
      "network",
    ],
    timestamp: config.timestamp,
    signer,
    schemas,
  });
}

async function createCandidateRegistry(
  schemas: SchemaRegistry,
): Promise<{
  readonly registry: HarnessComponentRegistry;
  readonly parentHarnessVersionId: string;
}> {
  const registry = new HarnessComponentRegistry({
    root: path.join(STATE, "registry"),
    schemas,
    artifacts: new ArtifactStore(
      path.join(STATE, "artifacts"),
    ),
    requiredSlotIds: ["permission", "workflow"],
  });
  await registry.initialize(TYPE_REGISTRY);
  const permission = await registry.createComponent({
    componentId:
      "component.permission.os-boundary-development",
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
    componentId:
      "component.workflow.os-boundary-development",
    semanticVersion: "1.0.0",
    typeEntryId: "type.workflow-policy",
    payloadLanguage: "seh.workflow.v1",
    payload: {
      schemaVersion: 1,
      language: "seh.workflow.v1",
      entryState: "start",
      states: [
        { stateId: "start", actions: [] },
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
      "development-os-boundary-runtime-contract",
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
  return {
    registry,
    parentHarnessVersionId: parent.harnessVersionId,
  };
}

async function propose(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const corpus =
    await readJson<LabelBlindAttributionCorpus>(
      "corpus.json",
    );
  const manifest =
    await readJson<DevelopmentAttributionPrototypeManifest>(
      "manifest.json",
    );
  const predictions =
    await readJson<DevelopmentAttributionPredictionSet>(
      "predictions.json",
    );
  const commitment =
    await readJson<DevelopmentAttributionCommitment>(
      "commitment.json",
    );
  verifyDevelopmentAttributionCommitment({
    commitment,
    predictionSet: predictions,
    manifest,
    corpus,
    schemas,
  });
  const selected = predictions.predictions.find(
    (prediction) =>
      prediction.status === "predicted" &&
      prediction.rankedComponentTypes[0]
        ?.componentType === "WorkflowPolicy",
  );
  if (selected === undefined) {
    throw new Error(
      "No committed WorkflowPolicy top-1 prediction",
    );
  }
  const parent = await createCandidateRegistry(schemas);
  const proposal =
    await new DevelopmentBoundaryMutationService({
      registry: parent.registry,
      schemas,
      proposer: signer,
    }).create({
      proposalId:
        "development.os-boundary.mutation.v1",
      parentHarnessVersionId:
        parent.parentHarnessVersionId,
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
        "Replace the single observable synthetic action.",
      ],
      manifest,
      corpus,
      predictionSet: predictions,
      commitment,
      createdAt: config.timestamp,
    });
  await writeJson(
    "proposal.json",
    proposal as unknown as JsonValue,
  );
  await writeJson(
    "parent-harness.json",
    parent.registry.getHarness(
      proposal.parentHarnessVersionId,
    ) as unknown as JsonValue,
  );
  await writeJson(
    "candidate-harness.json",
    parent.registry.getHarness(
      proposal.candidateHarnessVersionId,
    ) as unknown as JsonValue,
  );
  await writeJson(
    "parent-closure.json",
    await parent.registry.exportHarnessClosure(
      proposal.parentHarnessVersionId,
    ) as unknown as JsonValue,
  );
  await writeJson(
    "candidate-closure.json",
    await parent.registry.exportHarnessClosure(
      proposal.candidateHarnessVersionId,
    ) as unknown as JsonValue,
  );
  await receipt({
    receiptId:
      "development.os-boundary.mutation-proposer",
    roleName: "mutation_proposer",
    action: "propose_mutation",
    inputHashes: [
      commitment.commitmentHash,
      predictions.predictionSetHash,
      corpus.corpusHash,
    ],
    outputHashes: [
      proposal.proposalHash,
      proposal.candidateHarnessVersionId,
    ],
    mounts: [
      "label_blind_committed_predictions",
      "mutation_proposer_key",
      "mutable_candidate_registry",
    ],
    absent: [
      "oracle",
      "score_report",
      "operations_key",
      "candidate_evaluation",
      "promotion",
      "network",
    ],
    timestamp: config.timestamp,
    signer,
    schemas,
  });
}

async function loadCandidateRegistry(
  schemas: SchemaRegistry,
): Promise<HarnessComponentRegistry> {
  const registry = new HarnessComponentRegistry({
    root: "/candidate/registry",
    schemas,
    artifacts: new ArtifactStore("/candidate/artifacts"),
    requiredSlotIds: ["permission", "workflow"],
  });
  await registry.initialize(TYPE_REGISTRY);
  return registry;
}

async function quarantine(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const corpus =
    await readJson<LabelBlindAttributionCorpus>(
      "corpus.json",
    );
  const manifest =
    await readJson<DevelopmentAttributionPrototypeManifest>(
      "manifest.json",
    );
  const predictions =
    await readJson<DevelopmentAttributionPredictionSet>(
      "predictions.json",
    );
  const commitment =
    await readJson<DevelopmentAttributionCommitment>(
      "commitment.json",
    );
  const proposal = await readJson<
    Awaited<
      ReturnType<
        DevelopmentBoundaryMutationService["create"]
      >
    >
  >("proposal.json");
  const registry = await loadCandidateRegistry(schemas);
  verifyDevelopmentBoundaryMutation({
    proposal,
    manifest,
    corpus,
    predictionSet: predictions,
    commitment,
    registry,
    schemas,
  });
  const record = createNonPromotableHarnessRecord({
    recordId:
      "development.os-boundary.non-promotable.v1",
    harnessVersionId:
      proposal.candidateHarnessVersionId,
    recordedAt: config.timestamp,
    signer,
  });
  const durable = new NonPromotableHarnessRegistry({
    root: STATE,
    schemas,
  });
  await durable.register(record);
  await writeJson(
    "non-promotable.json",
    record as unknown as JsonValue,
  );
  await receipt({
    receiptId:
      "development.os-boundary.candidate-quarantine",
    roleName: "candidate_quarantine",
    action: "quarantine_candidate",
    inputHashes: [
      proposal.proposalHash,
      proposal.candidateHarnessVersionId,
    ],
    outputHashes: [record.recordHash],
    mounts: [
      "candidate_registry_read_only",
      "operations_key",
    ],
    absent: [
      "oracle",
      "score_report",
      "mutation_proposer_key",
      "candidate_evaluation",
      "promotion",
      "network",
    ],
    timestamp: config.timestamp,
    signer,
    schemas,
  });
}

async function runtime(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  if (config.protocolId === undefined) {
    throw new Error("runtime protocolId is required");
  }
  const proposal = await readJson<{
    readonly parentHarnessVersionId: string;
    readonly candidateHarnessVersionId: string;
    readonly proposalHash: string;
  }>("proposal.json");
  const nonPromotable =
    await readJson<NonPromotableHarnessRecord>(
      "non-promotable.json",
    );
  if (
    nonPromotable.harnessVersionId !==
    proposal.candidateHarnessVersionId
  ) {
    throw new Error(
      "runtime candidate is not quarantined",
    );
  }
  const registry = await loadCandidateRegistry(schemas);
  const execution =
    await executeDevelopmentSyntheticRuntime({
      root: path.join(STATE, "sessions"),
      protocolId: config.protocolId,
      executionBundleId:
        "development.os-boundary.execution.v1",
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
      runtimeSigner: signer,
      schemas,
      generatedAt: config.timestamp,
    });
  await writeJson(
    "execution.json",
    execution as unknown as JsonValue,
  );
  await receipt({
    receiptId: "development.os-boundary.runtime",
    roleName: "runtime",
    action: "execute_synthetic_pair",
    inputHashes: [
      proposal.proposalHash,
      nonPromotable.recordHash,
      proposal.parentHarnessVersionId,
      proposal.candidateHarnessVersionId,
    ],
    outputHashes: [execution.bundleHash],
    mounts: [
      "candidate_registry_read_only",
      "non_promotable_record",
      "runtime_key",
    ],
    absent: [
      "oracle",
      "score_report",
      "mutation_proposer_key",
      "evaluator_key",
      "promotion",
      "network",
    ],
    timestamp: config.timestamp,
    signer,
    schemas,
  });
}

async function evaluate(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const execution =
    await readJson<DevelopmentSyntheticExecutionBundle>(
      "execution.json",
    );
  const nonPromotable =
    await readJson<NonPromotableHarnessRecord>(
      "non-promotable.json",
    );
  const result = createDevelopmentSyntheticEvaluation({
    resultId:
      "development.os-boundary.evaluation.v1",
    execution,
    nonPromotableRecord: nonPromotable,
    evaluatedAt: config.timestamp,
    signer,
    schemas,
  });
  await writeJson(
    "evaluation.json",
    result as unknown as JsonValue,
  );
  await receipt({
    receiptId:
      "development.os-boundary.candidate-evaluator",
    roleName: "candidate_evaluator",
    action: "evaluate_synthetic_pair",
    inputHashes: [
      execution.bundleHash,
      nonPromotable.recordHash,
    ],
    outputHashes: [result.resultHash],
    mounts: [
      "runtime_evidence_read_only",
      "non_promotable_record",
      "candidate_evaluator_key",
    ],
    absent: [
      "oracle",
      "score_report",
      "mutation_proposer_key",
      "runtime_key",
      "promotion",
      "research_selection",
      "network",
    ],
    timestamp: config.timestamp,
    signer,
    schemas,
  });
}

interface FinalArtifactInput {
  readonly artifactId: string;
  readonly artifactKind:
    DevelopmentTaintedArtifact["artifactKind"];
  readonly contentHash: string;
  readonly aliases?: readonly string[];
  readonly references?: readonly string[];
  readonly taintClasses:
    readonly DevelopmentArtifactTaintClass[];
}

async function finalize(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const receipts =
    await readJson<readonly DevelopmentBoundaryReceipt[]>(
      "receipts.json",
    );
  const artifacts =
    await readJson<readonly FinalArtifactInput[]>(
      "taint-artifacts.json",
    );
  for (const roleReceipt of receipts) {
    verifyDevelopmentBoundaryReceipt({
      receipt: roleReceipt,
      schemas,
    });
  }
  const taint = createDevelopmentArtifactTaintRecord({
    recordId: "development.os-boundary.taint.v1",
    artifacts,
    recordedAt: config.timestamp,
    signer,
    schemas,
  });
  await writeDurableExclusive(
    "taint.json",
    taint as unknown as JsonValue,
  );
  const finalReceipt = await receipt({
    receiptId:
      "development.os-boundary.audit-finalize",
    roleName: "audit",
    action: "finalize_evidence",
    inputHashes: receipts.map(
      (roleReceipt) => roleReceipt.receiptHash,
    ),
    outputHashes: [taint.recordHash],
    mounts: [
      "role_receipts_read_only",
      "development_artifact_graph",
      "audit_key",
    ],
    absent: [
      "oracle",
      "mutation_proposer_key",
      "operations_key",
      "candidate_evaluator_key",
      "promotion",
      "network",
    ],
    timestamp: config.timestamp,
    signer,
    schemas,
  });
  await writeJson(
    "summary.json",
    {
      schemaVersion: 1,
      isolationClass:
        "os_enforced_subordinate_uids",
      roleUids: Object.fromEntries(
        [...receipts, finalReceipt].map((item) => [
          item.roleName,
          item.process.uid,
        ]),
      ),
      receiptHashes: [...receipts, finalReceipt]
        .map((item) => item.receiptHash)
        .sort(),
      taintRecordHash: taint.recordHash,
      researchEvidenceAuthorized: false,
      promotionAuthorized: false,
      providerUsed: false,
      oracleMountRoles: ["scorer"],
      summaryHash: sha256({
        receipts: [...receipts, finalReceipt]
          .map((item) => item.receiptHash)
          .sort(),
        taintRecordHash: taint.recordHash,
      }),
    } as unknown as JsonValue,
  );
}

async function main(): Promise<void> {
  const config =
    await readJson<WorkerConfiguration>("config.json");
  const schemas = await SchemaRegistry.load(SCHEMAS);
  const signer = await loadSigner();
  switch (config.mode) {
    case "attribute":
      return attribute(config, signer, schemas);
    case "commit":
      return commit(config, signer, schemas);
    case "seal":
      return seal(config, signer, schemas);
    case "score":
      return score(config, signer, schemas);
    case "propose":
      return propose(config, signer, schemas);
    case "quarantine":
      return quarantine(config, signer, schemas);
    case "runtime":
      return runtime(config, signer, schemas);
    case "evaluate":
      return evaluate(config, signer, schemas);
    case "finalize":
      return finalize(config, signer, schemas);
  }
}

await main();
