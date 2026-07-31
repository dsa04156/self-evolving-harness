import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ArtifactStore,
  HarnessComponentRegistry,
  HarnessFaultBenchMineBuilder,
  HFB_FIXTURE_SPEC_VERSION,
  HFB_MINE_COMMITMENT_SCHEMA_ID,
  HFB_SCORE_REPORT_SCHEMA_ID,
  SchemaRegistry,
  canonicalize,
  fixtureLabelOracleForScorerSelfTest,
  hfbMineSuiteCommitment,
  scoreHfbSingleFaultPredictions,
  type JsonValue,
} from "../src/index.js";

const DEVELOPMENT_EVIDENCE_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/benchmarks/harness-fault-development-evidence.schema.json";

function sourceCommitArgument(): string {
  const flagIndex = process.argv.indexOf("--source-commit");
  const value = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
  if (value === undefined || !/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error("--source-commit requires one exact 40-character Git SHA");
  }
  return value;
}

const root = await mkdtemp(path.join(os.tmpdir(), "seh-hfb-validation-"));
try {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  const registry = new HarnessComponentRegistry({
    root: path.join(root, "registry"),
    schemas,
    artifacts,
  });
  await registry.initialize(path.resolve("configs/component-type-registry.json"));
  const builder = new HarnessFaultBenchMineBuilder({
    schemas,
    artifacts,
    registry,
  });
  const fixtures = await builder.buildAll();
  const suiteCommitment = hfbMineSuiteCommitment(fixtures);
  schemas.validate(
    HFB_MINE_COMMITMENT_SCHEMA_ID,
    suiteCommitment as unknown as JsonValue,
  );
  const documents = fixtures.map((fixture) => fixture.document);
  const scoreReport = scoreHfbSingleFaultPredictions({
    fixtures: documents,
    predictions: fixtureLabelOracleForScorerSelfTest(documents),
    registry,
    schemas,
  });
  schemas.validate(
    HFB_SCORE_REPORT_SCHEMA_ID,
    scoreReport as unknown as JsonValue,
  );
  const count = (
    predicate: (fixture: (typeof fixtures)[number]) => boolean,
  ): number => fixtures.filter(predicate).length;
  const evidence = {
    schemaVersion: 1,
    evidenceClass: "deterministic_development_validation",
    sourceCommit: sourceCommitArgument(),
    specVersion: HFB_FIXTURE_SPEC_VERSION,
    datasetRole: "mine",
    suiteCommitment,
    causalValidation: {
      validatedFixtureCount: fixtures.length,
      knownGoodPassCount: count(
        (fixture) => fixture.causalReport.knownGoodPassed,
      ),
      faultyFailCount: count(
        (fixture) => !fixture.causalReport.faultyPassed,
      ),
      singleChangedComponentCount: count(
        (fixture) => fixture.causalReport.singleChangedComponent,
      ),
      groundTruthRestorePassCount: count(
        (fixture) => fixture.causalReport.groundTruthRestorationPassed,
      ),
      nonGroundTruthRestoreFailCount: count(
        (fixture) =>
          !fixture.causalReport.nonGroundTruthRestorationPassed,
      ),
      replayStableCount: count(
        (fixture) => fixture.causalReport.replayHashesIdentical,
      ),
      immutableTrustPinsIdenticalCount: count(
        (fixture) => fixture.causalReport.immutableTrustPinsIdentical,
      ),
      capabilitySetUnchangedCount: count(
        (fixture) => fixture.causalReport.capabilitySetUnchanged,
      ),
    },
    scorerSelfTest: {
      oracleWasGivenGroundTruthLabels: true,
      attributionPerformanceClaim: false,
      scoreReport,
    },
    accessBoundary: {
      gateBodiesInstantiated: false,
      finalBodiesInstantiated: false,
      multiCauseBodiesInstantiated: false,
      publicMultiCauseMetadataValidated: true,
    },
  };
  schemas.validate(
    DEVELOPMENT_EVIDENCE_SCHEMA_ID,
    evidence as unknown as JsonValue,
  );
  process.stdout.write(`${canonicalize(evidence)}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
