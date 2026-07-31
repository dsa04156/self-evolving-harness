import { mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  ArtifactStore,
  HarnessComponentRegistry,
  HarnessFaultBenchStructuralOracleBuilder,
  HFB_FIXTURE_SPEC_VERSION,
  HFB_STRUCTURAL_ORACLE_COMMITMENT_SCHEMA_ID,
  HFB_SCORE_REPORT_SCHEMA_ID,
  SchemaRegistry,
  canonicalize,
  fixtureLabelOracleForScorerSelfTest,
  hfbStructuralOracleSuiteCommitment,
  scoreHfbSingleFaultPredictions,
  type JsonValue,
} from "../src/index.js";

const DEVELOPMENT_EVIDENCE_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/benchmarks/harness-fault-development-evidence.schema.json";

const execFileAsync = promisify(execFile);

async function verifiedSourceCommit(): Promise<string> {
  const status = await execFileAsync("git", ["status", "--porcelain=v1"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (status.stdout.length !== 0) {
    throw new Error(
      "HarnessFaultBench structural-oracle evidence requires a clean Git worktree",
    );
  }
  const result = await execFileAsync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const sourceCommit = result.stdout.trim();
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) {
    throw new Error("Git HEAD did not resolve to one exact commit");
  }
  return sourceCommit;
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
  const builder = new HarnessFaultBenchStructuralOracleBuilder({
    schemas,
    artifacts,
    registry,
  });
  const fixtures = await builder.buildAll();
  const suiteCommitment =
    hfbStructuralOracleSuiteCommitment(fixtures);
  schemas.validate(
    HFB_STRUCTURAL_ORACLE_COMMITMENT_SCHEMA_ID,
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
    sourceCommit: await verifiedSourceCommit(),
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
