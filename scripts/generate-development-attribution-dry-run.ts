import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  ArtifactStore,
  DeterministicLabelBlindAttributor,
  DevelopmentExternalEvaluator,
  DevelopmentMutationDryRunService,
  HarnessComponentRegistry,
  HarnessFaultBenchSemanticAuthoringBuilder,
  NonPromotableHarnessRegistry,
  SchemaRegistry,
  buildLabelBlindAttributionCorpus,
  canonicalize,
  createDevelopmentArtifactQuarantine,
  createDevelopmentAttributionCommitment,
  createDevelopmentAttributionPrototypeManifest,
  createDevelopmentFixturePrincipal,
  createDevelopmentOracleAccessEvent,
  hfbSemanticSuiteCommitment,
  parseStrictJson,
  scoreDevelopmentAttribution,
  sha256,
  sha256Bytes,
  sha256Text,
  toLabelBlindAttributionInput,
  verifyDevelopmentArtifactQuarantine,
  verifyGovernanceDeviationRecord,
  verifyGovernanceRemediationClosure,
  type ComponentManifest,
  type DevelopmentArtifactReference,
  type DevelopmentAttributionCommitment,
  type DevelopmentAttributionPredictionSet,
  type DevelopmentAttributionPrototypeManifest,
  type DevelopmentAttributionScoreReport,
  type DevelopmentEvaluatorRequest,
  type DevelopmentEvaluatorResult,
  type DevelopmentMutationDryRunRecord,
  type DevelopmentOracleAccessEvent,
  type DevelopmentOracleJoinEntry,
  type GovernanceDeviationRecord,
  type GovernanceRemediationClosureRecord,
  type HarnessVersionManifest,
  type JsonValue,
  type LabelBlindAttributionCorpus,
  type NonPromotableHarnessRecord,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const EVIDENCE_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/development-attribution-dry-run-evidence.schema.json";
const EXPECTED_ARCHITECT_RESPONSE_HASH =
  "sha256:19d1998f6207ba0f67095be9ed21ff649b35c6523aedb165715694c1115d6e74";
const EXPECTED_REMEDIATION_CLOSURE_HASH =
  "sha256:b7ef8d04c20c2c2904780b1cca4c758961a1e59b997e9e63d8fa879f5dde6a7a";
const outputRoot = path.resolve(
  "architect/evidence/development-attribution-dry-run",
);
const quarantinePath = path.resolve(
  "governance/development-quarantines/attribution-mutation-dry-run-2026-07-31.json",
);

interface SemanticDevelopmentEvidence {
  readonly suiteCommitment: {
    readonly commitmentHash: string;
  };
  readonly labelBlindBoundary: {
    readonly corpusHash: string;
  };
}

interface PersistedArtifacts {
  readonly prototypeManifest: DevelopmentAttributionPrototypeManifest;
  readonly predictionSet: DevelopmentAttributionPredictionSet;
  readonly predictionCommitment: DevelopmentAttributionCommitment;
  readonly oracleAccessEvent: DevelopmentOracleAccessEvent;
  readonly scoreReport: DevelopmentAttributionScoreReport;
  readonly mutationDryRun: DevelopmentMutationDryRunRecord;
  readonly nonPromotableRecord: NonPromotableHarnessRecord;
  readonly evaluatorRequest: DevelopmentEvaluatorRequest;
  readonly evaluatorResult: DevelopmentEvaluatorResult;
  readonly parentHarness: HarnessVersionManifest;
  readonly candidateHarness: HarnessVersionManifest;
  readonly permissionComponent: ComponentManifest;
  readonly beforeComponent: ComponentManifest;
  readonly afterComponent: ComponentManifest;
  readonly permissionPayload: JsonValue;
  readonly beforePayload: JsonValue;
  readonly afterPayload: JsonValue;
}

interface ArtifactFile {
  readonly path: string;
  readonly value: JsonValue;
  readonly fileSha256: string;
  readonly contentHash: string;
}

async function requireMissing(target: string): Promise<void> {
  try {
    await access(target);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
  throw new Error(
    `Refusing to overwrite existing development evidence: ${target}`,
  );
}

async function cleanSource(): Promise<{
  readonly commit: string;
  readonly tree: string;
}> {
  const status = await execFileAsync(
    "git",
    ["status", "--porcelain=v1"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (status.stdout.length !== 0) {
    throw new Error(
      "Development dry-run evidence requires a clean Git worktree",
    );
  }
  const [commitResult, treeResult] = await Promise.all([
    execFileAsync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }),
    execFileAsync(
      "git",
      ["rev-parse", "--verify", "HEAD^{tree}"],
      { cwd: process.cwd(), encoding: "utf8" },
    ),
  ]);
  const commit = commitResult.stdout.trim();
  const tree = treeResult.stdout.trim();
  if (
    !/^[a-f0-9]{40}$/u.test(commit) ||
    !/^[a-f0-9]{40}$/u.test(tree)
  ) {
    throw new Error("Git source did not resolve to exact identities");
  }
  return { commit, tree };
}

async function fileHash(file: string): Promise<string> {
  return `sha256:${sha256Bytes(await readFile(file))}`;
}

function serialized(value: JsonValue): string {
  return `${canonicalize(value)}\n`;
}

function artifactFile(input: {
  readonly relativePath: string;
  readonly value: JsonValue;
  readonly contentHash: string;
}): ArtifactFile {
  return {
    path: input.relativePath,
    value: input.value,
    fileSha256:
      `sha256:${sha256Bytes(Buffer.from(serialized(input.value)))}`,
    contentHash: input.contentHash,
  };
}

async function writeExclusive(
  file: string,
  value: JsonValue,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serialized(value), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

const source = await cleanSource();
await requireMissing(outputRoot);
await requireMissing(quarantinePath);

const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const corpus = parseStrictJson(
  await readFile(
    path.resolve(
      "benchmarks/harness-fault-bench/semantic/mine/label-blind-corpus.json",
    ),
    "utf8",
  ),
) as unknown as LabelBlindAttributionCorpus;
const semanticEvidence = parseStrictJson(
  await readFile(
    path.resolve(
      "architect/evidence/harness-fault-bench-semantic/evidence.json",
    ),
    "utf8",
  ),
) as unknown as SemanticDevelopmentEvidence;
if (
  corpus.corpusHash !==
    semanticEvidence.labelBlindBoundary.corpusHash
) {
  throw new Error(
    "Persisted label-blind corpus is not the approved semantic evidence corpus",
  );
}

const responsePath = path.resolve(
  ".codex/gpt-pro-architect/responses/response-3rr.md",
);
const responseHash = await fileHash(responsePath);
if (
  responseHash !== EXPECTED_ARCHITECT_RESPONSE_HASH ||
  !(await readFile(responsePath, "utf8")).startsWith(
    "DECISION: APPROVE\n",
  )
) {
  throw new Error("Architect 3RR authorization drifted");
}
const deviation = parseStrictJson(
  await readFile(
    path.resolve(
      "governance/deviations/hfb-structural-oracle-2026-07-31.json",
    ),
    "utf8",
  ),
) as unknown as GovernanceDeviationRecord;
const closure = parseStrictJson(
  await readFile(
    path.resolve(
      "governance/remediation-closures/hfb-structural-oracle-2026-07-31.json",
    ),
    "utf8",
  ),
) as unknown as GovernanceRemediationClosureRecord;
verifyGovernanceDeviationRecord({ record: deviation, schemas });
verifyGovernanceRemediationClosure({
  record: closure,
  deviation,
  schemas,
});
if (
  closure.recordHash !== EXPECTED_REMEDIATION_CLOSURE_HASH ||
  closure.architectDecision.responseSha256 !== responseHash
) {
  throw new Error("Signed semantic remediation closure drifted");
}

const attributorSourcePath = path.resolve(
  "src/evaluation/development-attribution.ts",
);
const scorerSourcePath = path.resolve(
  "src/evaluation/development-attribution-scorer.ts",
);
const mutationSourcePath = path.resolve(
  "src/evolution/development-mutation-dry-run.ts",
);
const evaluatorSourcePath = path.resolve(
  "src/evolution/development-external-evaluator.ts",
);
const nonPromotableSourcePath = path.resolve(
  "src/governance/non-promotable-harness.ts",
);
const quarantineSourcePath = path.resolve(
  "src/governance/development-artifact-quarantine.ts",
);
const evaluatorScriptPath = path.resolve(
  "evaluator/development_dry_run_evaluator.py",
);
const [
  attributorImplementationHash,
  scorerImplementationHash,
  mutationImplementationHash,
  evaluatorImplementationHash,
  nonPromotableImplementationHash,
  quarantineImplementationHash,
] = await Promise.all([
  fileHash(attributorSourcePath),
  fileHash(scorerSourcePath),
  fileHash(mutationSourcePath),
  fileHash(evaluatorSourcePath),
  fileHash(nonPromotableSourcePath),
  fileHash(quarantineSourcePath),
]);

const predictionProposer = createDevelopmentFixturePrincipal({
  principalId:
    "proposer.development-attribution-evidence",
  role: "proposer",
  implementationDigest: attributorImplementationHash,
  instanceId:
    "proposer.development-attribution-evidence.instance",
  seedByte: 41,
});
const scorer = createDevelopmentFixturePrincipal({
  principalId:
    "evaluator.development-attribution-scorer",
  role: "evaluator",
  implementationDigest: scorerImplementationHash,
  instanceId:
    "evaluator.development-attribution-scorer.instance",
  seedByte: 42,
});
const mutationProposer = createDevelopmentFixturePrincipal({
  principalId:
    "proposer.development-bounded-mutation",
  role: "proposer",
  implementationDigest: mutationImplementationHash,
  instanceId:
    "proposer.development-bounded-mutation.instance",
  seedByte: 43,
});
const operations = createDevelopmentFixturePrincipal({
  principalId:
    "operations.development-candidate-quarantine",
  role: "operations_owner",
  implementationDigest: nonPromotableImplementationHash,
  instanceId:
    "operations.development-candidate-quarantine.instance",
  seedByte: 44,
});
const externalEvaluatorSigner =
  createDevelopmentFixturePrincipal({
    principalId:
      "evaluator.development-external-process",
    role: "evaluator",
    implementationDigest: evaluatorImplementationHash,
    instanceId:
      "evaluator.development-external-process.instance",
    seedByte: 45,
  });
const protocolAuthor = createDevelopmentFixturePrincipal({
  principalId:
    "protocol-author.development-artifact-quarantine",
  role: "protocol_author",
  implementationDigest: quarantineImplementationHash,
  instanceId:
    "protocol-author.development-artifact-quarantine.instance",
  seedByte: 46,
});

// The proposer sees only the already committed label-blind corpus. Oracle
// fixtures are not instantiated until after this signed prediction seal.
const prototypeManifest =
  createDevelopmentAttributionPrototypeManifest({
    prototypeId:
      "development.label-blind-attributor.evidence-v1",
    semanticVersion: "0.1.0",
    implementationHash: attributorImplementationHash,
    approvedCorpusHash: corpus.corpusHash,
  });
const predictionSet = new DeterministicLabelBlindAttributor({
  manifest: prototypeManifest,
  schemas,
}).run({
  runId: "development-attribution-run.evidence-v1",
  corpus,
  generatedAt: "2026-07-31T08:00:00.000Z",
  priorDiagnosticResultsVisible: false,
});
const predictionCommitment =
  createDevelopmentAttributionCommitment({
    predictionSet,
    manifest: prototypeManifest,
    corpus,
    schemas,
    signer: predictionProposer,
    commitmentId:
      "development-attribution-commitment.evidence-v1",
    sealedAt: "2026-07-31T08:01:00.000Z",
  });

const authoringRoot = await mkdtemp(
  path.join(os.tmpdir(), "seh-development-oracle-join-"),
);
let oracleEntries: readonly DevelopmentOracleJoinEntry[];
try {
  const authoringArtifacts = new ArtifactStore(
    path.join(authoringRoot, "artifacts"),
  );
  const authoringRegistry = new HarnessComponentRegistry({
    root: path.join(authoringRoot, "registry"),
    schemas,
    artifacts: authoringArtifacts,
  });
  await authoringRegistry.initialize(
    path.resolve("configs/component-type-registry.json"),
  );
  const fixtures =
    await new HarnessFaultBenchSemanticAuthoringBuilder({
      schemas,
      artifacts: authoringArtifacts,
      registry: authoringRegistry,
      workingRoot: path.join(authoringRoot, "executions"),
    }).buildAll();
  const rebuiltCorpus = buildLabelBlindAttributionCorpus(
    fixtures.map((fixture) => fixture.faultyResult),
  );
  const rebuiltSuite = hfbSemanticSuiteCommitment(fixtures);
  if (
    canonicalize(rebuiltCorpus as unknown as JsonValue) !==
      canonicalize(corpus as unknown as JsonValue) ||
    rebuiltSuite.commitmentHash !==
      semanticEvidence.suiteCommitment.commitmentHash
  ) {
    throw new Error(
      "Post-commitment oracle regeneration did not match approved semantic commitments",
    );
  }
  oracleEntries = fixtures.map((fixture) => ({
    caseId: fixture.oracle.fixtureId,
    traceProjectionId: toLabelBlindAttributionInput(
      fixture.faultyResult,
    ).traceProjectionId,
    targetComponentType:
      fixture.oracle.targetComponentType,
    oracleRecordHash: fixture.oracle.oracleHash,
  }));
} finally {
  await rm(authoringRoot, {
    recursive: true,
    force: true,
  });
}

const oracleAccessEvent = createDevelopmentOracleAccessEvent({
  accessEventId: "development-oracle-access.evidence-v1",
  commitment: predictionCommitment,
  predictionSet,
  manifest: prototypeManifest,
  corpus,
  oracleEntries,
  accessedAt: "2026-07-31T08:02:00.000Z",
  signer: scorer,
  schemas,
});
const scoreReport = scoreDevelopmentAttribution({
  reportId: "development-attribution-score.evidence-v1",
  scorerId: "development-attribution-scorer.v1",
  scorerImplementationHash,
  predictionSet,
  commitment: predictionCommitment,
  manifest: prototypeManifest,
  corpus,
  oracleEntries,
  accessEvent: oracleAccessEvent,
  scoredAt: "2026-07-31T08:03:00.000Z",
  signer: scorer,
  schemas,
});

const selectedPrediction = predictionSet.predictions.find(
  (prediction) =>
    prediction.status === "predicted" &&
    prediction.rankedComponentTypes[0]?.componentType ===
      "WorkflowPolicy",
);
if (selectedPrediction === undefined) {
  throw new Error(
    "No committed WorkflowPolicy top-1 prediction is available for the synthetic mutation dry run",
  );
}

const mutationRoot = await mkdtemp(
  path.join(os.tmpdir(), "seh-development-mutation-"),
);
let persisted: PersistedArtifacts;
try {
  const mutationArtifacts = new ArtifactStore(
    path.join(mutationRoot, "artifacts"),
  );
  const mutationRegistry = new HarnessComponentRegistry({
    root: path.join(mutationRoot, "registry"),
    schemas,
    artifacts: mutationArtifacts,
    requiredSlotIds: ["permission", "workflow"],
  });
  await mutationRegistry.initialize(
    path.resolve("configs/component-type-registry.json"),
  );
  const permissionPayload: JsonValue = {
    schemaVersion: 1,
    language: "seh.policy-json.v1",
    policyType: "PermissionPolicy",
    policy: { fixed: true },
  };
  const beforePayload: JsonValue = {
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
  };
  const permissionComponent =
    await mutationRegistry.createComponent({
      componentId:
        "component.permission.synthetic-development-evidence",
      semanticVersion: "1.0.0",
      typeEntryId: "type.permission-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: permissionPayload,
      capabilityIds: ["permission.authorize"],
    });
  const beforeComponent =
    await mutationRegistry.createComponent({
      componentId:
        "component.workflow.synthetic-development-evidence",
      semanticVersion: "1.0.0",
      typeEntryId: "type.workflow-policy",
      payloadLanguage: "seh.workflow.v1",
      payload: beforePayload,
      capabilityIds: [
        "workflow.dispatch.closed-action",
      ],
    });
  const parentHarness = await mutationRegistry.createHarness({
    semanticVersion: "1.0.0",
    requiredRuntimeContractHash: sha256Text(
      "development-attribution-mutation-runtime-contract-v1",
    ),
    bindings: [
      {
        slotId: "permission",
        componentManifestId:
          permissionComponent.componentManifestId,
      },
      {
        slotId: "workflow",
        componentManifestId:
          beforeComponent.componentManifestId,
      },
    ],
  });
  const nonPromotable = new NonPromotableHarnessRegistry({
    root: mutationRoot,
    schemas,
  });
  const mutationDryRun =
    await new DevelopmentMutationDryRunService({
      protocolId:
        "protocol.visible-fixture-development-dry-run.v1",
      schemas,
      registry: mutationRegistry,
      nonPromotable,
      proposer: mutationProposer,
      operations,
    }).create({
      dryRunId:
        "development-mutation-dry-run.evidence-v1",
      quarantineRecordId:
        "non-promotable-harness.development-evidence-v1",
      parentHarnessVersionId:
        parentHarness.harnessVersionId,
      candidateSemanticVersion: "1.1.0",
      nextComponentSemanticVersion: "1.1.0",
      selectedTraceProjectionId:
        selectedPrediction.traceProjectionId,
      operations: [
        {
          op: "replace",
          path: "/states/0/actions/0/action",
          value: "model_turn",
        },
      ],
      semanticOperations: [
        "Replace the synthetic entry action solely to validate a bounded development mutation.",
      ],
      manifest: prototypeManifest,
      corpus,
      predictionSet,
      commitment: predictionCommitment,
      createdAt: "2026-07-31T08:04:00.000Z",
    });
  const nonPromotableRecord =
    await nonPromotable.recordFor(
      mutationDryRun.candidateHarnessVersionId,
    );
  if (nonPromotableRecord === null) {
    throw new Error(
      "Development candidate was not quarantined",
    );
  }
  const externalEvaluation =
    await new DevelopmentExternalEvaluator({
      schemas,
      nonPromotable,
      evaluator: externalEvaluatorSigner,
      pythonExecutable: "python3",
      scriptPath: evaluatorScriptPath,
    }).evaluate({
      requestId:
        "development-evaluator-request.evidence-v1",
      resultId:
        "development-evaluator-result.evidence-v1",
      dryRun: mutationDryRun,
      tasks: [
        {
          taskId: "synthetic-task.changed-path",
          taskInputHash: sha256Text(
            "synthetic-development-changed-path-v1",
          ),
          parentPassed: false,
          candidatePassed: true,
        },
        {
          taskId: "synthetic-task.preservation-path",
          taskInputHash: sha256Text(
            "synthetic-development-preservation-path-v1",
          ),
          parentPassed: true,
          candidatePassed: true,
        },
      ],
      evaluatedAt: "2026-07-31T08:05:00.000Z",
    });
  const candidateHarness = mutationRegistry.getHarness(
    mutationDryRun.candidateHarnessVersionId,
  );
  const afterComponent = mutationRegistry.getComponent(
    mutationDryRun.change.afterComponentManifestId,
  );
  const afterPayload = await mutationRegistry.getPayload(
    afterComponent.componentManifestId,
  );
  persisted = {
    prototypeManifest,
    predictionSet,
    predictionCommitment,
    oracleAccessEvent,
    scoreReport,
    mutationDryRun,
    nonPromotableRecord,
    evaluatorRequest: externalEvaluation.request,
    evaluatorResult: externalEvaluation.result,
    parentHarness,
    candidateHarness,
    permissionComponent,
    beforeComponent,
    afterComponent,
    permissionPayload,
    beforePayload,
    afterPayload,
  };
} finally {
  await rm(mutationRoot, {
    recursive: true,
    force: true,
  });
}

const files: ArtifactFile[] = [
  artifactFile({
    relativePath: "prototype-manifest.json",
    value:
      persisted.prototypeManifest as unknown as JsonValue,
    contentHash: persisted.prototypeManifest.manifestHash,
  }),
  artifactFile({
    relativePath: "prediction-set.json",
    value: persisted.predictionSet as unknown as JsonValue,
    contentHash: persisted.predictionSet.predictionSetHash,
  }),
  artifactFile({
    relativePath: "prediction-commitment.json",
    value:
      persisted.predictionCommitment as unknown as JsonValue,
    contentHash:
      persisted.predictionCommitment.commitmentHash,
  }),
  artifactFile({
    relativePath: "oracle-access-event.json",
    value:
      persisted.oracleAccessEvent as unknown as JsonValue,
    contentHash: persisted.oracleAccessEvent.eventHash,
  }),
  artifactFile({
    relativePath: "score-report.json",
    value: persisted.scoreReport as unknown as JsonValue,
    contentHash: persisted.scoreReport.reportHash,
  }),
  artifactFile({
    relativePath: "mutation-dry-run.json",
    value:
      persisted.mutationDryRun as unknown as JsonValue,
    contentHash: persisted.mutationDryRun.recordHash,
  }),
  artifactFile({
    relativePath: "non-promotable-record.json",
    value:
      persisted.nonPromotableRecord as unknown as JsonValue,
    contentHash:
      persisted.nonPromotableRecord.recordHash,
  }),
  artifactFile({
    relativePath: "evaluator-request.json",
    value:
      persisted.evaluatorRequest as unknown as JsonValue,
    contentHash: persisted.evaluatorRequest.requestHash,
  }),
  artifactFile({
    relativePath: "evaluator-result.json",
    value:
      persisted.evaluatorResult as unknown as JsonValue,
    contentHash: persisted.evaluatorResult.resultHash,
  }),
  artifactFile({
    relativePath: "parent-harness.json",
    value: persisted.parentHarness as unknown as JsonValue,
    contentHash: persisted.parentHarness.harnessVersionId,
  }),
  artifactFile({
    relativePath: "candidate-harness.json",
    value:
      persisted.candidateHarness as unknown as JsonValue,
    contentHash:
      persisted.candidateHarness.harnessVersionId,
  }),
  artifactFile({
    relativePath: "permission-component.json",
    value:
      persisted.permissionComponent as unknown as JsonValue,
    contentHash:
      persisted.permissionComponent.componentManifestId,
  }),
  artifactFile({
    relativePath: "before-component.json",
    value: persisted.beforeComponent as unknown as JsonValue,
    contentHash:
      persisted.beforeComponent.componentManifestId,
  }),
  artifactFile({
    relativePath: "after-component.json",
    value: persisted.afterComponent as unknown as JsonValue,
    contentHash:
      persisted.afterComponent.componentManifestId,
  }),
  artifactFile({
    relativePath: "permission-payload.json",
    value: persisted.permissionPayload,
    contentHash: sha256(persisted.permissionPayload),
  }),
  artifactFile({
    relativePath: "before-payload.json",
    value: persisted.beforePayload,
    contentHash: sha256(persisted.beforePayload),
  }),
  artifactFile({
    relativePath: "after-payload.json",
    value: persisted.afterPayload,
    contentHash: sha256(persisted.afterPayload),
  }),
];

const evidenceCore = {
  schemaVersion: 1 as const,
  evidenceClass:
    "visible_fixture_development_diagnostic_and_dry_run" as const,
  sourceCommit: source.commit,
  sourceTree: source.tree,
  authorization: {
    architectResponseHash: responseHash,
    remediationClosureHash: closure.recordHash,
  },
  input: {
    semanticSuiteCommitment:
      semanticEvidence.suiteCommitment.commitmentHash,
    labelBlindCorpusCommitment: corpus.corpusHash,
    uniqueTraceCount: corpus.traces.length,
    occurrenceCount: corpus.traces.reduce(
      (sum, entry) => sum + entry.occurrenceCount,
      0,
    ),
  },
  attribution: {
    prototypeManifestHash:
      persisted.prototypeManifest.manifestHash,
    implementationHash:
      persisted.prototypeManifest.implementationHash,
    predictionSetHash:
      persisted.predictionSet.predictionSetHash,
    predictionCommitmentHash:
      persisted.predictionCommitment.commitmentHash,
    predictionCount:
      persisted.predictionSet.predictions.length,
    occurrenceCount:
      persisted.predictionCommitment.occurrenceCount,
    statusCounts: persisted.predictionSet.statusCounts,
    priorDiagnosticResultsVisible:
      persisted.predictionSet
        .priorDiagnosticResultsVisible,
    generatedAt: persisted.predictionSet.generatedAt,
    sealedAt: persisted.predictionCommitment.sealedAt,
  },
  scoring: {
    scorerImplementationHash:
      persisted.scoreReport.scorer.implementationHash,
    oracleAccessEventHash:
      persisted.oracleAccessEvent.eventHash,
    scoreReportHash: persisted.scoreReport.reportHash,
    oracleRecordCount:
      persisted.oracleAccessEvent.oracleRecordHashes.length,
    oracleAccessedAt:
      persisted.oracleAccessEvent.accessedAt,
    scoredAt: persisted.scoreReport.scoredAt,
    diagnosticMetrics:
      persisted.scoreReport.diagnosticMetrics,
    claimBoundary: persisted.scoreReport.claimBoundary,
  },
  mutation: {
    dryRunRecordHash:
      persisted.mutationDryRun.recordHash,
    parentHarnessVersionId:
      persisted.mutationDryRun.parentHarnessVersionId,
    candidateHarnessVersionId:
      persisted.mutationDryRun.candidateHarnessVersionId,
    selectedComponentType:
      persisted.mutationDryRun.selectedComponentType,
    changedComponentCount:
      persisted.mutationDryRun.change.changedComponentCount,
    expandedClosureEditBytes:
      persisted.mutationDryRun.change
        .expandedClosureEditBytes,
    immutableDiffCount: 0,
    capabilityDiffCount: 0,
    nonPromotableRecordHash:
      persisted.nonPromotableRecord.recordHash,
    promotable: false as const,
  },
  externalEvaluator: {
    requestHash: persisted.evaluatorRequest.requestHash,
    resultHash: persisted.evaluatorResult.resultHash,
    implementationHash:
      persisted.evaluatorResult.externalProcess
        .implementationHash,
    syntheticTaskCount:
      persisted.evaluatorResult.syntheticOutcomes.taskCount,
    requestAccepted:
      persisted.evaluatorResult.externalProcess
        .requestAccepted,
    researchMetric:
      persisted.evaluatorResult.syntheticOutcomes
        .researchMetric,
    promotionSignal:
      persisted.evaluatorResult.syntheticOutcomes
        .promotionSignal,
  },
  accessBoundary: {
    attributorOracleImports: 0 as const,
    mutationProposerOracleImports: 0 as const,
    candidateEvaluatorOracleImports: 0 as const,
    gateCapability: false as const,
    finalCapability: false as const,
    realProviderCalled: false as const,
  },
  claims: persisted.prototypeManifest.claimBoundary,
  artifactFiles: files
    .map((file) => ({
      path: path.posix.join(
        "architect/evidence/development-attribution-dry-run",
        file.path,
      ),
      fileSha256: file.fileSha256,
      contentHash: file.contentHash,
    }))
    .sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
};
const evidence = {
  ...evidenceCore,
  evidenceHash: sha256(evidenceCore as unknown as JsonValue),
};
schemas.validate(
  EVIDENCE_SCHEMA_ID,
  evidence as unknown as JsonValue,
);
const evidenceFile = artifactFile({
  relativePath: "evidence.json",
  value: evidence as unknown as JsonValue,
  contentHash: evidence.evidenceHash,
});

const kindFor = (
  relativePath: string,
): DevelopmentArtifactReference["artifactKind"] => {
  if (relativePath === "prototype-manifest.json")
    return "prototype_manifest";
  if (relativePath === "prediction-set.json")
    return "prediction_set";
  if (relativePath === "prediction-commitment.json")
    return "prediction_commitment";
  if (relativePath === "oracle-access-event.json")
    return "oracle_access_event";
  if (relativePath === "score-report.json")
    return "development_score_report";
  if (relativePath === "mutation-dry-run.json")
    return "mutation_dry_run";
  if (relativePath === "parent-harness.json")
    return "parent_harness";
  if (relativePath === "candidate-harness.json")
    return "candidate_harness";
  if (relativePath.endsWith("-component.json"))
    return "component_manifest";
  if (relativePath.endsWith("-payload.json"))
    return "component_payload";
  if (relativePath === "non-promotable-record.json")
    return "non_promotable_record";
  if (relativePath === "evaluator-request.json")
    return "evaluator_request";
  if (relativePath === "evaluator-result.json")
    return "evaluator_result";
  if (relativePath === "evidence.json")
    return "development_evidence";
  throw new Error(`Unknown development artifact ${relativePath}`);
};
const quarantine = createDevelopmentArtifactQuarantine({
  recordId:
    "development-artifact-quarantine.attribution-mutation-dry-run.2026-07-31",
  authorizationDecisionHash: responseHash,
  artifacts: [...files, evidenceFile].map((file) => ({
    artifactId: file.path.replace(/\.json$/u, ""),
    artifactKind: kindFor(file.path),
    contentHash: file.contentHash,
    path: path.posix.join(
      "architect/evidence/development-attribution-dry-run",
      file.path,
    ),
  })),
  recordedAt: "2026-07-31T08:06:00.000Z",
  signer: protocolAuthor,
});
verifyDevelopmentArtifactQuarantine({
  record: quarantine,
  schemas,
});

await mkdir(outputRoot, { recursive: false });
for (const file of [...files, evidenceFile]) {
  await writeExclusive(
    path.join(outputRoot, file.path),
    file.value,
  );
}
await writeExclusive(
  quarantinePath,
  quarantine as unknown as JsonValue,
);

process.stdout.write(
  [
    "WROTE",
    `source=${source.commit}`,
    `traces=${corpus.traces.length}`,
    `occurrences=${predictionCommitment.occurrenceCount}`,
    `prediction=${predictionSet.predictionSetHash}`,
    `score=${scoreReport.reportHash}`,
    `candidate=${persisted.candidateHarness.harnessVersionId}`,
    `evaluation=${persisted.evaluatorResult.resultHash}`,
    `evidence=${evidence.evidenceHash}`,
    `quarantine=${quarantine.recordHash}`,
    "research=false",
    "promotable=false",
  ].join(" ") + "\n",
);
