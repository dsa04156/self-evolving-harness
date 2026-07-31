import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  ArtifactStore,
  DEVELOPMENT_ARTIFACT_ALLOWED_USE_CLASSES,
  DEVELOPMENT_ARTIFACT_PROHIBITED_USE_CLASSES,
  DeterministicLabelBlindAttributor,
  DevelopmentArtifactQuarantinePolicy,
  DevelopmentExternalEvaluator,
  DevelopmentMutationDryRunService,
  HarnessComponentRegistry,
  HarnessError,
  HarnessFaultBenchSemanticAuthoringBuilder,
  NonPromotableHarnessRegistry,
  SchemaRegistry,
  buildLabelBlindAttributionCorpus,
  canonicalize,
  createDevelopmentAttributionCommitment,
  createDevelopmentFixturePrincipal,
  createDevelopmentOracleAccessEvent,
  hfbSemanticSuiteCommitment,
  parseStrictJson,
  scoreDevelopmentAttribution,
  sha256,
  sha256Bytes,
  toLabelBlindAttributionInput,
  verifyDevelopmentArtifactQuarantine,
  verifyDevelopmentAttributionCommitment,
  verifyDevelopmentAttributionPrototypeManifest,
  verifyDevelopmentAttributionScoreReport,
  verifyDevelopmentEvaluatorRequest,
  verifyDevelopmentEvaluatorResult,
  verifyDevelopmentMutationDryRun,
  verifyDevelopmentOracleAccessEvent,
  verifyNonPromotableHarnessRecord,
  type ComponentManifest,
  type DevelopmentArtifactQuarantineRecord,
  type DevelopmentAttributionCommitment,
  type DevelopmentAttributionPredictionSet,
  type DevelopmentAttributionPrototypeManifest,
  type DevelopmentAttributionScoreReport,
  type DevelopmentEvaluatorRequest,
  type DevelopmentEvaluatorResult,
  type DevelopmentMutationDryRunRecord,
  type DevelopmentOracleAccessEvent,
  type DevelopmentOracleJoinEntry,
  type HarnessVersionManifest,
  type JsonValue,
  type LabelBlindAttributionCorpus,
  type NonPromotableHarnessRecord,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const EVIDENCE_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/development-attribution-dry-run-evidence.schema.json";
const evidenceRoot = path.resolve(
  "architect/evidence/development-attribution-dry-run",
);
const quarantinePath = path.resolve(
  "governance/development-quarantines/attribution-mutation-dry-run-2026-07-31.json",
);

interface EvidenceSummary {
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly authorization: {
    readonly architectResponseHash: string;
    readonly remediationClosureHash: string;
  };
  readonly input: {
    readonly semanticSuiteCommitment: string;
    readonly labelBlindCorpusCommitment: string;
    readonly uniqueTraceCount: number;
    readonly occurrenceCount: number;
  };
  readonly attribution: {
    readonly prototypeManifestHash: string;
    readonly implementationHash: string;
    readonly predictionSetHash: string;
    readonly predictionCommitmentHash: string;
    readonly predictionCount: number;
    readonly occurrenceCount: number;
    readonly statusCounts: Readonly<Record<string, number>>;
    readonly priorDiagnosticResultsVisible: boolean;
    readonly generatedAt: string;
    readonly sealedAt: string;
  };
  readonly scoring: {
    readonly scorerImplementationHash: string;
    readonly oracleAccessEventHash: string;
    readonly scoreReportHash: string;
    readonly oracleRecordCount: number;
    readonly oracleAccessedAt: string;
    readonly scoredAt: string;
  };
  readonly mutation: {
    readonly dryRunRecordHash: string;
    readonly parentHarnessVersionId: string;
    readonly candidateHarnessVersionId: string;
    readonly nonPromotableRecordHash: string;
    readonly promotable: false;
  };
  readonly externalEvaluator: {
    readonly requestHash: string;
    readonly resultHash: string;
    readonly implementationHash: string;
    readonly syntheticTaskCount: number;
    readonly requestAccepted: true;
    readonly researchMetric: false;
    readonly promotionSignal: false;
  };
  readonly accessBoundary: {
    readonly attributorOracleImports: 0;
    readonly mutationProposerOracleImports: 0;
    readonly candidateEvaluatorOracleImports: 0;
    readonly gateCapability: false;
    readonly finalCapability: false;
    readonly realProviderCalled: false;
  };
  readonly claims: {
    readonly developmentOnly: true;
    readonly confirmatory: false;
    readonly publicVisibleFixtures: true;
    readonly authorizedForResearchEvidence: false;
    readonly attributionPerformanceClaim: false;
  };
  readonly artifactFiles: readonly {
    readonly path: string;
    readonly fileSha256: string;
    readonly contentHash: string;
  }[];
  readonly evidenceHash: string;
}

async function readJson<T>(file: string): Promise<T> {
  const bytes = await readFile(file);
  const text = bytes.toString("utf8");
  const parsed = parseStrictJson(text) as unknown as T;
  if (
    text !==
    `${canonicalize(parsed as unknown as JsonValue)}\n`
  ) {
    throw new Error(
      `Persisted artifact is not canonical JSON: ${file}`,
    );
  }
  return parsed;
}

async function fileHash(file: string): Promise<string> {
  return `sha256:${sha256Bytes(await readFile(file))}`;
}

function without<T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const cloned = { ...value };
  delete cloned[key];
  return cloned;
}

async function sourceFileHash(
  relativePath: string,
  sourceCommit: string,
): Promise<string> {
  const current = await readFile(path.resolve(relativePath));
  const committed = await execFileAsync(
    "git",
    ["show", `${sourceCommit}:${relativePath}`],
    {
      cwd: process.cwd(),
      encoding: "buffer",
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (!Buffer.from(committed.stdout).equals(current)) {
    throw new Error(
      `Evidence implementation drifted from source commit: ${relativePath}`,
    );
  }
  return `sha256:${sha256Bytes(current)}`;
}

const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const corpus = await readJson<LabelBlindAttributionCorpus>(
  path.resolve(
    "benchmarks/harness-fault-bench/semantic/mine/label-blind-corpus.json",
  ),
);
const prototypeManifest =
  await readJson<DevelopmentAttributionPrototypeManifest>(
    path.join(evidenceRoot, "prototype-manifest.json"),
  );
const predictionSet =
  await readJson<DevelopmentAttributionPredictionSet>(
    path.join(evidenceRoot, "prediction-set.json"),
  );
const predictionCommitment =
  await readJson<DevelopmentAttributionCommitment>(
    path.join(evidenceRoot, "prediction-commitment.json"),
  );
const oracleAccessEvent =
  await readJson<DevelopmentOracleAccessEvent>(
    path.join(evidenceRoot, "oracle-access-event.json"),
  );
const scoreReport =
  await readJson<DevelopmentAttributionScoreReport>(
    path.join(evidenceRoot, "score-report.json"),
  );
const mutationDryRun =
  await readJson<DevelopmentMutationDryRunRecord>(
    path.join(evidenceRoot, "mutation-dry-run.json"),
  );
const nonPromotableRecord =
  await readJson<NonPromotableHarnessRecord>(
    path.join(evidenceRoot, "non-promotable-record.json"),
  );
const evaluatorRequest =
  await readJson<DevelopmentEvaluatorRequest>(
    path.join(evidenceRoot, "evaluator-request.json"),
  );
const evaluatorResult =
  await readJson<DevelopmentEvaluatorResult>(
    path.join(evidenceRoot, "evaluator-result.json"),
  );
const parentHarness = await readJson<HarnessVersionManifest>(
  path.join(evidenceRoot, "parent-harness.json"),
);
const candidateHarness =
  await readJson<HarnessVersionManifest>(
    path.join(evidenceRoot, "candidate-harness.json"),
  );
const permissionComponent =
  await readJson<ComponentManifest>(
    path.join(evidenceRoot, "permission-component.json"),
  );
const beforeComponent = await readJson<ComponentManifest>(
  path.join(evidenceRoot, "before-component.json"),
);
const afterComponent = await readJson<ComponentManifest>(
  path.join(evidenceRoot, "after-component.json"),
);
const permissionPayload = await readJson<JsonValue>(
  path.join(evidenceRoot, "permission-payload.json"),
);
const beforePayload = await readJson<JsonValue>(
  path.join(evidenceRoot, "before-payload.json"),
);
const afterPayload = await readJson<JsonValue>(
  path.join(evidenceRoot, "after-payload.json"),
);
const evidence = await readJson<EvidenceSummary>(
  path.join(evidenceRoot, "evidence.json"),
);
const quarantine =
  await readJson<DevelopmentArtifactQuarantineRecord>(
    quarantinePath,
  );

schemas.validate(
  EVIDENCE_SCHEMA_ID,
  evidence as unknown as JsonValue,
);
if (
  evidence.evidenceHash !==
  sha256(
    without(evidence, "evidenceHash") as unknown as JsonValue,
  )
) {
  throw new Error("Development evidence hash mismatch");
}

const resolvedTree = (
  await execFileAsync(
    "git",
    ["rev-parse", "--verify", `${evidence.sourceCommit}^{tree}`],
    { cwd: process.cwd(), encoding: "utf8" },
  )
).stdout.trim();
if (resolvedTree !== evidence.sourceTree) {
  throw new Error("Evidence source commit/tree binding mismatch");
}

const [
  attributorImplementationHash,
  scorerImplementationHash,
  mutationImplementationHash,
  evaluatorImplementationHash,
  nonPromotableImplementationHash,
  quarantineImplementationHash,
  evaluatorScriptHash,
] = await Promise.all([
  sourceFileHash(
    "src/evaluation/development-attribution.ts",
    evidence.sourceCommit,
  ),
  sourceFileHash(
    "src/evaluation/development-attribution-scorer.ts",
    evidence.sourceCommit,
  ),
  sourceFileHash(
    "src/evolution/development-mutation-dry-run.ts",
    evidence.sourceCommit,
  ),
  sourceFileHash(
    "src/evolution/development-external-evaluator.ts",
    evidence.sourceCommit,
  ),
  sourceFileHash(
    "src/governance/non-promotable-harness.ts",
    evidence.sourceCommit,
  ),
  sourceFileHash(
    "src/governance/development-artifact-quarantine.ts",
    evidence.sourceCommit,
  ),
  sourceFileHash(
    "evaluator/development_dry_run_evaluator.py",
    evidence.sourceCommit,
  ),
]);

if (
  prototypeManifest.implementationHash !==
    attributorImplementationHash ||
  scoreReport.scorer.implementationHash !==
    scorerImplementationHash ||
  evaluatorResult.externalProcess.implementationHash !==
    evaluatorScriptHash ||
  evidence.externalEvaluator.implementationHash !==
    evaluatorScriptHash
) {
  throw new Error(
    "Persisted implementation digest does not match source",
  );
}

verifyDevelopmentAttributionPrototypeManifest({
  manifest: prototypeManifest,
  schemas,
});
const replayedPredictionSet =
  new DeterministicLabelBlindAttributor({
    manifest: prototypeManifest,
    schemas,
  }).run({
    runId: predictionSet.runId,
    corpus,
    generatedAt: predictionSet.generatedAt,
    priorDiagnosticResultsVisible:
      predictionSet.priorDiagnosticResultsVisible,
  });
if (
  canonicalize(
    replayedPredictionSet as unknown as JsonValue,
  ) !==
  canonicalize(predictionSet as unknown as JsonValue)
) {
  throw new Error(
    "Label-blind prediction replay is not byte-equivalent",
  );
}
const predictionProposer = createDevelopmentFixturePrincipal({
  principalId:
    "proposer.development-attribution-evidence",
  role: "proposer",
  implementationDigest: attributorImplementationHash,
  instanceId:
    "proposer.development-attribution-evidence.instance",
  seedByte: 41,
});
const replayedCommitment =
  createDevelopmentAttributionCommitment({
    predictionSet,
    manifest: prototypeManifest,
    corpus,
    schemas,
    signer: predictionProposer,
    commitmentId: predictionCommitment.commitmentId,
    sealedAt: predictionCommitment.sealedAt,
  });
if (
  canonicalize(replayedCommitment as unknown as JsonValue) !==
  canonicalize(predictionCommitment as unknown as JsonValue)
) {
  throw new Error(
    "Prediction commitment deterministic replay failed",
  );
}
verifyDevelopmentAttributionCommitment({
  commitment: predictionCommitment,
  predictionSet,
  manifest: prototypeManifest,
  corpus,
  schemas,
});

const oracleRoot = await mkdtemp(
  path.join(os.tmpdir(), "seh-verify-development-oracle-"),
);
let oracleEntries: readonly DevelopmentOracleJoinEntry[];
let semanticSuiteCommitment: string;
try {
  const artifacts = new ArtifactStore(
    path.join(oracleRoot, "artifacts"),
  );
  const registry = new HarnessComponentRegistry({
    root: path.join(oracleRoot, "registry"),
    schemas,
    artifacts,
  });
  await registry.initialize(
    path.resolve("configs/component-type-registry.json"),
  );
  const fixtures =
    await new HarnessFaultBenchSemanticAuthoringBuilder({
      schemas,
      artifacts,
      registry,
      workingRoot: path.join(oracleRoot, "executions"),
    }).buildAll();
  const rebuiltCorpus = buildLabelBlindAttributionCorpus(
    fixtures.map((fixture) => fixture.faultyResult),
  );
  if (
    canonicalize(rebuiltCorpus as unknown as JsonValue) !==
    canonicalize(corpus as unknown as JsonValue)
  ) {
    throw new Error(
      "Verifier oracle reconstruction changed the label-blind corpus",
    );
  }
  semanticSuiteCommitment =
    hfbSemanticSuiteCommitment(fixtures).commitmentHash;
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
  await rm(oracleRoot, { recursive: true, force: true });
}

const scorer = createDevelopmentFixturePrincipal({
  principalId:
    "evaluator.development-attribution-scorer",
  role: "evaluator",
  implementationDigest: scorerImplementationHash,
  instanceId:
    "evaluator.development-attribution-scorer.instance",
  seedByte: 42,
});
verifyDevelopmentOracleAccessEvent({
  event: oracleAccessEvent,
  commitment: predictionCommitment,
  oracleEntries,
  schemas,
});
const replayedAccess = createDevelopmentOracleAccessEvent({
  accessEventId: oracleAccessEvent.accessEventId,
  commitment: predictionCommitment,
  predictionSet,
  manifest: prototypeManifest,
  corpus,
  oracleEntries,
  accessedAt: oracleAccessEvent.accessedAt,
  signer: scorer,
  schemas,
});
const replayedScore = scoreDevelopmentAttribution({
  reportId: scoreReport.reportId,
  scorerId: scoreReport.scorer.scorerId,
  scorerImplementationHash,
  predictionSet,
  commitment: predictionCommitment,
  manifest: prototypeManifest,
  corpus,
  oracleEntries,
  accessEvent: replayedAccess,
  scoredAt: scoreReport.scoredAt,
  signer: scorer,
  schemas,
});
if (
  canonicalize(replayedAccess as unknown as JsonValue) !==
    canonicalize(oracleAccessEvent as unknown as JsonValue) ||
  canonicalize(replayedScore as unknown as JsonValue) !==
    canonicalize(scoreReport as unknown as JsonValue)
) {
  throw new Error(
    "Separate oracle join/scorer deterministic replay failed",
  );
}
verifyDevelopmentAttributionScoreReport({
  report: scoreReport,
  commitment: predictionCommitment,
  accessEvent: oracleAccessEvent,
  schemas,
});

const mutationRoot = await mkdtemp(
  path.join(os.tmpdir(), "seh-verify-development-mutation-"),
);
try {
  const artifacts = new ArtifactStore(
    path.join(mutationRoot, "artifacts"),
  );
  const registry = new HarnessComponentRegistry({
    root: path.join(mutationRoot, "registry"),
    schemas,
    artifacts,
    requiredSlotIds: ["permission", "workflow"],
  });
  await registry.initialize(
    path.resolve("configs/component-type-registry.json"),
  );
  const recreateComponent = async (
    manifest: ComponentManifest,
    payload: JsonValue,
  ): Promise<ComponentManifest> =>
    registry.createComponent({
      componentId: manifest.identity.componentId,
      semanticVersion: manifest.identity.semanticVersion,
      typeEntryId:
        manifest.identity.typeRegistryRef.typeEntryId,
      payloadLanguage: manifest.identity.payload.language,
      payload,
      capabilityIds:
        manifest.identity.payload.capabilityIds,
      dependencyManifestIds:
        manifest.identity.dependencies.map(
          (dependency) =>
            dependency.component.componentManifestId,
        ),
    });
  const recreatedPermission = await recreateComponent(
    permissionComponent,
    permissionPayload,
  );
  const recreatedBefore = await recreateComponent(
    beforeComponent,
    beforePayload,
  );
  if (
    recreatedPermission.componentManifestId !==
      permissionComponent.componentManifestId ||
    recreatedBefore.componentManifestId !==
      beforeComponent.componentManifestId
  ) {
    throw new Error(
      "Synthetic parent component reconstruction drifted",
    );
  }
  const recreatedParent = await registry.createHarness({
    semanticVersion:
      parentHarness.identity.semanticVersion,
    requiredRuntimeContractHash:
      parentHarness.identity.requiredRuntimeContractHash,
    bindings: parentHarness.identity.componentBindings.map(
      (binding) => ({
        slotId: binding.slotId,
        componentManifestId:
          binding.component.componentManifestId,
      }),
    ),
  });
  if (
    recreatedParent.harnessVersionId !==
      parentHarness.harnessVersionId
  ) {
    throw new Error(
      "Synthetic parent harness reconstruction drifted",
    );
  }
  const mutationProposer =
    createDevelopmentFixturePrincipal({
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
    implementationDigest:
      nonPromotableImplementationHash,
    instanceId:
      "operations.development-candidate-quarantine.instance",
    seedByte: 44,
  });
  const nonPromotable = new NonPromotableHarnessRegistry({
    root: mutationRoot,
    schemas,
  });
  const replayedDryRun =
    await new DevelopmentMutationDryRunService({
      protocolId: mutationDryRun.protocolId,
      schemas,
      registry,
      nonPromotable,
      proposer: mutationProposer,
      operations,
    }).create({
      dryRunId: mutationDryRun.dryRunId,
      quarantineRecordId:
        nonPromotableRecord.recordId,
      parentHarnessVersionId:
        mutationDryRun.parentHarnessVersionId,
      candidateSemanticVersion:
        candidateHarness.identity.semanticVersion,
      nextComponentSemanticVersion:
        afterComponent.identity.semanticVersion,
      selectedTraceProjectionId:
        mutationDryRun.selectedTraceProjectionId,
      operations: mutationDryRun.change.operations,
      semanticOperations:
        mutationDryRun.change.semanticOperations,
      manifest: prototypeManifest,
      corpus,
      predictionSet,
      commitment: predictionCommitment,
      createdAt: mutationDryRun.createdAt,
    });
  const replayedNonPromotable =
    await nonPromotable.recordFor(
      replayedDryRun.candidateHarnessVersionId,
    );
  if (
    replayedNonPromotable === null ||
    canonicalize(replayedDryRun as unknown as JsonValue) !==
      canonicalize(mutationDryRun as unknown as JsonValue) ||
    canonicalize(
      replayedNonPromotable as unknown as JsonValue,
    ) !==
      canonicalize(
        nonPromotableRecord as unknown as JsonValue,
      ) ||
    canonicalize(
      registry.getHarness(
        replayedDryRun.candidateHarnessVersionId,
      ) as unknown as JsonValue,
    ) !==
      canonicalize(candidateHarness as unknown as JsonValue) ||
    canonicalize(
      registry.getComponent(
        replayedDryRun.change.afterComponentManifestId,
      ) as unknown as JsonValue,
    ) !== canonicalize(afterComponent as unknown as JsonValue) ||
    canonicalize(
      (await registry.getPayload(
        replayedDryRun.change.afterComponentManifestId,
      )) as unknown as JsonValue,
    ) !== canonicalize(afterPayload)
  ) {
    throw new Error(
      "Bounded mutation or non-promotable record deterministic replay failed",
    );
  }
  await verifyDevelopmentMutationDryRun({
    record: mutationDryRun,
    manifest: prototypeManifest,
    corpus,
    predictionSet,
    commitment: predictionCommitment,
    registry,
    nonPromotable,
    schemas,
  });
  verifyNonPromotableHarnessRecord({
    record: nonPromotableRecord,
    schemas,
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
  const replayedEvaluation =
    await new DevelopmentExternalEvaluator({
      schemas,
      nonPromotable,
      evaluator: externalEvaluatorSigner,
      pythonExecutable: "python3",
      scriptPath: path.resolve(
        "evaluator/development_dry_run_evaluator.py",
      ),
    }).evaluate({
      requestId: evaluatorRequest.requestId,
      resultId: evaluatorResult.resultId,
      dryRun: mutationDryRun,
      tasks: evaluatorRequest.tasks,
      evaluatedAt: evaluatorResult.evaluatedAt,
    });
  if (
    canonicalize(
      replayedEvaluation.request as unknown as JsonValue,
    ) !==
      canonicalize(evaluatorRequest as unknown as JsonValue) ||
    canonicalize(
      replayedEvaluation.result as unknown as JsonValue,
    ) !==
      canonicalize(evaluatorResult as unknown as JsonValue)
  ) {
    throw new Error(
      "External evaluator deterministic replay failed",
    );
  }
  verifyDevelopmentEvaluatorRequest({
    request: evaluatorRequest,
    dryRun: mutationDryRun,
    schemas,
  });
  verifyDevelopmentEvaluatorResult({
    result: evaluatorResult,
    request: evaluatorRequest,
    dryRun: mutationDryRun,
    schemas,
  });
} finally {
  await rm(mutationRoot, { recursive: true, force: true });
}

const contentHashByName = new Map<string, string>([
  ["prototype-manifest.json", prototypeManifest.manifestHash],
  ["prediction-set.json", predictionSet.predictionSetHash],
  [
    "prediction-commitment.json",
    predictionCommitment.commitmentHash,
  ],
  ["oracle-access-event.json", oracleAccessEvent.eventHash],
  ["score-report.json", scoreReport.reportHash],
  ["mutation-dry-run.json", mutationDryRun.recordHash],
  [
    "non-promotable-record.json",
    nonPromotableRecord.recordHash,
  ],
  ["evaluator-request.json", evaluatorRequest.requestHash],
  ["evaluator-result.json", evaluatorResult.resultHash],
  ["parent-harness.json", parentHarness.harnessVersionId],
  [
    "candidate-harness.json",
    candidateHarness.harnessVersionId,
  ],
  [
    "permission-component.json",
    permissionComponent.componentManifestId,
  ],
  [
    "before-component.json",
    beforeComponent.componentManifestId,
  ],
  ["after-component.json", afterComponent.componentManifestId],
  ["permission-payload.json", sha256(permissionPayload)],
  ["before-payload.json", sha256(beforePayload)],
  ["after-payload.json", sha256(afterPayload)],
]);
for (const artifact of evidence.artifactFiles) {
  const relative = path.relative(
    process.cwd(),
    path.resolve(artifact.path),
  );
  if (
    !relative.startsWith(
      "architect/evidence/development-attribution-dry-run/",
    )
  ) {
    throw new Error(
      `Evidence artifact escaped its root: ${artifact.path}`,
    );
  }
  const basename = path.basename(artifact.path);
  if (
    artifact.fileSha256 !==
      (await fileHash(path.resolve(artifact.path))) ||
    artifact.contentHash !== contentHashByName.get(basename)
  ) {
    throw new Error(
      `Evidence artifact binding mismatch: ${artifact.path}`,
    );
  }
  contentHashByName.delete(basename);
}
if (contentHashByName.size !== 0) {
  throw new Error(
    "Evidence summary omitted one or more generated artifacts",
  );
}

verifyDevelopmentArtifactQuarantine({
  record: quarantine,
  schemas,
});
const expectedQuarantineHashes = new Set([
  ...evidence.artifactFiles.map(
    (artifact) => artifact.contentHash,
  ),
  evidence.evidenceHash,
]);
const actualQuarantineHashes = new Set(
  quarantine.artifacts.map(
    (artifact) => artifact.contentHash,
  ),
);
if (
  actualQuarantineHashes.size !==
    expectedQuarantineHashes.size ||
  [...expectedQuarantineHashes].some(
    (hash) => !actualQuarantineHashes.has(hash),
  )
) {
  throw new Error(
    "Development quarantine does not cover the full artifact graph",
  );
}
const policy = new DevelopmentArtifactQuarantinePolicy({
  record: quarantine,
  schemas,
});
for (const useClass of DEVELOPMENT_ARTIFACT_ALLOWED_USE_CLASSES) {
  policy.assertReferencesAllowed({
    useClass,
    references: [...expectedQuarantineHashes],
  });
}
for (const useClass of DEVELOPMENT_ARTIFACT_PROHIBITED_USE_CLASSES) {
  let denied = false;
  try {
    policy.assertReferencesAllowed({
      useClass,
      references: [...expectedQuarantineHashes],
    });
  } catch (error) {
    denied =
      error instanceof HarnessError &&
      error.code === "AUTHORIZATION_DENIED";
  }
  if (!denied) {
    throw new Error(
      `Development quarantine did not deny ${useClass}`,
    );
  }
}

const responseHash = await fileHash(
  path.resolve(
    ".codex/gpt-pro-architect/responses/response-3rr.md",
  ),
);
const closure = await readJson<{ readonly recordHash: string }>(
  path.resolve(
    "governance/remediation-closures/hfb-structural-oracle-2026-07-31.json",
  ),
);
if (
  evidence.authorization.architectResponseHash !==
    responseHash ||
  evidence.authorization.remediationClosureHash !==
    closure.recordHash ||
  quarantine.authorizationDecisionHash !== responseHash ||
  evidence.input.labelBlindCorpusCommitment !==
    corpus.corpusHash ||
  evidence.input.semanticSuiteCommitment !==
    semanticSuiteCommitment
) {
  throw new Error(
    "Authorization or semantic input commitment drifted",
  );
}

for (const [sourcePath, forbiddenTokens] of [
  [
    "src/evaluation/development-attribution.ts",
    [
      "hfb-semantic-authoring",
      "harness-fault-bench",
      "development-attribution-scorer",
      "oracle-records/",
    ],
  ],
  [
    "src/evolution/development-mutation-dry-run.ts",
    [
      "hfb-semantic-authoring",
      "harness-fault-bench",
      "development-attribution-scorer",
      "oracle-records/",
    ],
  ],
  [
    "src/evolution/development-external-evaluator.ts",
    [
      "hfb-semantic-authoring",
      "harness-fault-bench",
      "development-attribution-scorer",
      "oracle-records/",
    ],
  ],
] as const) {
  const sourceText = await readFile(
    path.resolve(sourcePath),
    "utf8",
  );
  for (const forbidden of forbiddenTokens) {
    if (sourceText.includes(forbidden)) {
      throw new Error(
        `${sourcePath} imports forbidden oracle authority token ${forbidden}`,
      );
    }
  }
}

if (
  Date.parse(predictionCommitment.sealedAt) >
    Date.parse(oracleAccessEvent.accessedAt) ||
  Date.parse(oracleAccessEvent.accessedAt) >
    Date.parse(scoreReport.scoredAt) ||
  evidence.claims.authorizedForResearchEvidence ||
  evidence.claims.attributionPerformanceClaim ||
  evidence.mutation.promotable ||
  evidence.externalEvaluator.researchMetric ||
  evidence.externalEvaluator.promotionSignal
) {
  throw new Error(
    "Prediction-first chronology or non-research claim boundary failed",
  );
}

process.stdout.write(
  [
    "PASS",
    `source=${evidence.sourceCommit}`,
    `traces=${evidence.input.uniqueTraceCount}`,
    `occurrences=${evidence.input.occurrenceCount}`,
    `prediction=${predictionSet.predictionSetHash}`,
    `score=${scoreReport.reportHash}`,
    `candidate=${candidateHarness.harnessVersionId}`,
    `evaluation=${evaluatorResult.resultHash}`,
    `evidence=${evidence.evidenceHash}`,
    `quarantine=${quarantine.recordHash}`,
    `allowed=${DEVELOPMENT_ARTIFACT_ALLOWED_USE_CLASSES.length}`,
    `prohibited=${DEVELOPMENT_ARTIFACT_PROHIBITED_USE_CLASSES.length}`,
    "research=false",
    "promotable=false",
  ].join(" ") + "\n",
);
