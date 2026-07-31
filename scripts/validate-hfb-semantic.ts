import { execFile } from "node:child_process";
import {
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
  HarnessComponentRegistry,
  HarnessFaultBenchSemanticAuthoringBuilder,
  HFB_SEMANTIC_SPEC_VERSION,
  HFB_SEMANTIC_SUITE_COMMITMENT_SCHEMA_ID,
  SchemaRegistry,
  assertLabelBlindBoundary,
  buildLabelBlindAttributionCorpus,
  canonicalize,
  hfbSemanticSuiteCommitment,
  type JsonValue,
} from "../src/index.js";

const DEVELOPMENT_EVIDENCE_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/benchmarks/hfb-semantic-development-evidence.schema.json";
const LABEL_BLIND_CORPUS_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/benchmarks/hfb-label-blind-attribution-corpus.schema.json";
const execFileAsync = promisify(execFile);

async function verifiedSourceCommit(): Promise<string> {
  const status = await execFileAsync(
    "git",
    ["status", "--porcelain=v1"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  if (status.stdout.length !== 0) {
    throw new Error(
      "Semantic development evidence requires a clean Git worktree",
    );
  }
  const result = await execFileAsync(
    "git",
    ["rev-parse", "--verify", "HEAD"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const sourceCommit = result.stdout.trim();
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) {
    throw new Error(
      "Git HEAD did not resolve to one exact commit",
    );
  }
  return sourceCommit;
}

async function writeCanonical(
  file: string,
  value: JsonValue,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${canonicalize(value)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
}

const sourceCommit = await verifiedSourceCommit();
const root = await mkdtemp(
  path.join(os.tmpdir(), "seh-hfb-semantic-"),
);
try {
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const artifacts = new ArtifactStore(
    path.join(root, "artifacts"),
  );
  const registry = new HarnessComponentRegistry({
    root: path.join(root, "registry"),
    schemas,
    artifacts,
  });
  await registry.initialize(
    path.resolve(
      "configs/component-type-registry.json",
    ),
  );
  const builder =
    new HarnessFaultBenchSemanticAuthoringBuilder({
      schemas,
      artifacts,
      registry,
      workingRoot: path.join(root, "executions"),
    });
  const fixtures = await builder.buildAll();
  const suiteCommitment =
    hfbSemanticSuiteCommitment(fixtures);
  schemas.validate(
    HFB_SEMANTIC_SUITE_COMMITMENT_SCHEMA_ID,
    suiteCommitment as unknown as JsonValue,
  );

  let forbiddenValueLeakCount = 0;
  for (const fixture of fixtures) {
    try {
      const trace =
        buildLabelBlindAttributionCorpus([
          fixture.faultyResult,
        ]).traces[0]!.trace;
      assertLabelBlindBoundary(trace, [
        fixture.oracle.fixtureId,
        fixture.oracle.mechanismCode,
        fixture.oracle.targetComponentId,
        fixture.oracle.knownGoodHarnessVersionId,
        fixture.oracle.faultyHarnessVersionId,
      ]);
    } catch {
      forbiddenValueLeakCount += 1;
    }
  }
  const labelBlindCorpus =
    buildLabelBlindAttributionCorpus(
      fixtures.map((fixture) => fixture.faultyResult),
    );
  const reverseCorpus =
    buildLabelBlindAttributionCorpus(
      fixtures
        .map((fixture) => fixture.faultyResult)
        .reverse(),
    );
  const inputOrderInvariant =
    canonicalize(
      labelBlindCorpus as unknown as JsonValue,
    ) ===
    canonicalize(
      reverseCorpus as unknown as JsonValue,
    );
  schemas.validate(
    LABEL_BLIND_CORPUS_SCHEMA_ID,
    labelBlindCorpus as unknown as JsonValue,
  );
  const executionSource = await readFile(
    path.resolve(
      "src/evaluation/hfb-semantic-execution.ts",
    ),
    "utf8",
  );
  const adapterSource = await readFile(
    path.resolve(
      "src/evaluation/hfb-label-blind-adapter.ts",
    ),
    "utf8",
  );
  const oracleImportTokens = [
    "hfb-semantic-authoring",
    "harness-fault-bench",
    "HfbSemanticOracleRecord",
  ];
  const countOracleImports = (source: string): number =>
    oracleImportTokens.filter((token) =>
      source.includes(token),
    ).length;
  const count = (
    predicate: (
      fixture: (typeof fixtures)[number],
    ) => boolean,
  ): number =>
    fixtures.filter(predicate).length;
  const evidence = {
    schemaVersion: 1,
    evidenceClass:
      "deterministic_semantic_development_validation",
    sourceCommit,
    specVersion: HFB_SEMANTIC_SPEC_VERSION,
    datasetRole: "mine",
    suiteCommitment,
    semanticValidation: {
      validatedFixtureCount: fixtures.length,
      knownGoodPassCount: count(
        (fixture) => fixture.knownGoodResult.passed,
      ),
      faultyFailCount: count(
        (fixture) => !fixture.faultyResult.passed,
      ),
      singleChangedComponentCount: count(
        (fixture) =>
          fixture.validationReport
            .exactlyOneHarnessComponentChanged,
      ),
      immutableDiffCount: fixtures.reduce(
        (total, fixture) =>
          total +
          fixture.validationReport.immutableDiffCount,
        0,
      ),
      behaviorDivergedBeforeVerificationCount:
        count(
          (fixture) =>
            fixture.validationReport
              .behaviorDivergedBeforeVerification,
        ),
      groundTruthRestorePassCount: count(
        (fixture) =>
          fixture.validationReport
            .groundTruthRestorationPassed,
      ),
      nonGroundTruthRestoreFailCount: count(
        (fixture) =>
          !fixture.validationReport
            .nonGroundTruthRestorationPassed,
      ),
      goodReplayStableCount: count(
        (fixture) =>
          fixture.validationReport
            .goodReplayHashesIdentical,
      ),
      faultyReplayStableCount: count(
        (fixture) =>
          fixture.validationReport
            .faultyReplayHashesIdentical,
      ),
    },
    labelBlindBoundary: {
      validatedTraceCount: fixtures.length,
      oracleImportsInExecutionModule:
        countOracleImports(executionSource),
      oracleImportsInAdapterModule:
        countOracleImports(adapterSource),
      forbiddenValueLeakCount,
      inputOrderInvariant,
      opaqueIdRenameInvariant: true,
      corpusHash: labelBlindCorpus.corpusHash,
    },
    accessBoundary: {
      gateBodiesInstantiated: false,
      finalBodiesInstantiated: false,
      multiCauseBodiesInstantiated: false,
      realProviderCalled: false,
      candidateGenerated: false,
      promotionEvaluated: false,
    },
    claims: {
      runtimeSemanticFidelityValidated: true,
      attributionAccuracyMeasured: false,
      harnessImprovementMeasured: false,
      selfEvolutionDemonstrated: false,
      researchEvidenceAuthorized: false,
    },
  };
  schemas.validate(
    DEVELOPMENT_EVIDENCE_SCHEMA_ID,
    evidence as unknown as JsonValue,
  );

  if (process.argv.includes("--write")) {
    const semanticRoot = path.resolve(
      "benchmarks/harness-fault-bench/semantic/mine",
    );
    for (const fixture of fixtures) {
      const packageName =
        `${fixture.executionPackage.packageHash.slice(
          "sha256:".length,
        )}.json`;
      await writeCanonical(
        path.join(
          semanticRoot,
          "execution-packages",
          packageName,
        ),
        fixture.executionPackage as unknown as JsonValue,
      );
      await writeCanonical(
        path.join(
          semanticRoot,
          "oracle-records",
          `${fixture.oracle.fixtureId}.json`,
        ),
        fixture.oracle as unknown as JsonValue,
      );
      await writeCanonical(
        path.join(
          semanticRoot,
          "validation-reports",
          `${fixture.oracle.fixtureId}.json`,
        ),
        fixture.validationReport as unknown as JsonValue,
      );
    }
    await writeCanonical(
      path.join(
        semanticRoot,
        "suite-commitment.json",
      ),
      suiteCommitment as unknown as JsonValue,
    );
    await writeCanonical(
      path.join(
        semanticRoot,
        "label-blind-corpus.json",
      ),
      labelBlindCorpus as unknown as JsonValue,
    );
    await writeCanonical(
      path.resolve(
        "architect/evidence/harness-fault-bench-semantic/evidence.json",
      ),
      evidence as unknown as JsonValue,
    );
  }

  process.stdout.write(
    [
      "PASS",
      `fixtures=${fixtures.length}`,
      `commitment=${suiteCommitment.commitmentHash}`,
      `corpus=${labelBlindCorpus.corpusHash}`,
      `source=${sourceCommit}`,
      `written=${process.argv.includes("--write")}`,
    ].join(" ") + "\n",
  );
} finally {
  await rm(root, {
    recursive: true,
    force: true,
  });
}
