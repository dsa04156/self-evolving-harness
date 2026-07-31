import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  HarnessComponentRegistry,
  HarnessError,
  HarnessFaultBenchStructuralOracleBuilder,
  HFB_FIXTURE_SCHEMA_ID,
  HFB_STRUCTURAL_ORACLE_COMMITMENT_SCHEMA_ID,
  SchemaRegistry,
  assertPublicMineFixtureAccess,
  fixtureLabelOracleForScorerSelfTest,
  hfbMineFixtureIds,
  hfbStructuralOracleSuiteCommitment,
  parseStrictJson,
  runHfbStructuralOracleFixture,
  scoreHfbSingleFaultPredictions,
  type HfbBuiltStructuralOracleFixture,
} from "../src/index.js";

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-hfb-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function buildMineSuite(
  root: string,
): Promise<{
  readonly schemas: SchemaRegistry;
  readonly artifacts: ArtifactStore;
  readonly registry: HarnessComponentRegistry;
  readonly fixtures: readonly HfbBuiltStructuralOracleFixture[];
}> {
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
  return {
    schemas,
    artifacts,
    registry,
    fixtures: await builder.buildAll(),
  };
}

let sharedRoot: string;
let sharedSuite: Awaited<ReturnType<typeof buildMineSuite>>;

test.before(async () => {
  sharedRoot = await mkdtemp(path.join(os.tmpdir(), "seh-hfb-shared-"));
  sharedSuite = await buildMineSuite(sharedRoot);
});

test.after(async () => {
  await rm(sharedRoot, { recursive: true, force: true });
});

test("HFB structural oracle builds 28 schema-valid D_mine plumbing fixtures", async (t) => {
  const first = sharedSuite;
  assert.equal(first.fixtures.length, 28);
  assert.deepEqual(
    first.fixtures.map((fixture) => fixture.document.fixtureId),
    hfbMineFixtureIds(),
  );
  assert.equal(new Set(hfbMineFixtureIds()).size, 28);

  const exactTypeCounts = new Map<string, number>();
  for (const fixture of first.fixtures) {
    const document = fixture.document;
    first.schemas.validate(
      HFB_FIXTURE_SCHEMA_ID,
      document as never,
    );
    assert.equal(document.splitRole, "mine");
    assert.notEqual(
      document.knownGoodHarnessVersionId,
      document.faultyHarnessVersionId,
    );
    assert.equal(document.faults.length, 1);
    const type = document.faults[0]!.componentType;
    exactTypeCounts.set(type, (exactTypeCounts.get(type) ?? 0) + 1);
    const diff = first.registry.diffHarnesses(
      document.knownGoodHarnessVersionId,
      document.faultyHarnessVersionId,
    );
    assert.equal(diff.changed.length, 1);
    assert.equal(diff.immutableDiffCount, 0);
    assert.equal(diff.disabledConditionalDiffCount, 0);
    assert.equal(fixture.causalReport.knownGoodPassed, true);
    assert.equal(fixture.causalReport.faultyPassed, false);
    assert.equal(fixture.causalReport.singleChangedComponent, true);
    assert.equal(fixture.causalReport.declaredPatchMatchesPayloads, true);
    assert.equal(fixture.causalReport.groundTruthRestorationPassed, true);
    assert.equal(
      fixture.causalReport.nonGroundTruthRestorationPassed,
      false,
    );
    assert.equal(fixture.causalReport.replayHashesIdentical, true);
    assert.equal(fixture.causalReport.immutableTrustPinsIdentical, true);
    assert.equal(fixture.causalReport.capabilitySetUnchanged, true);
  }

  assert.equal(exactTypeCounts.get("SystemPrompt"), 4);
  assert.equal(exactTypeCounts.get("ContextPolicy"), 4);
  assert.equal(exactTypeCounts.get("MemoryRetrievalPolicy"), 4);
  assert.equal(exactTypeCounts.get("Skill"), 4);
  assert.equal(exactTypeCounts.get("WorkflowPolicy"), 4);
  assert.equal(exactTypeCounts.get("RoutingPolicy"), 2);
  assert.equal(exactTypeCounts.get("SubagentPrompt"), 2);
  assert.equal(exactTypeCounts.get("ToolDescription"), 4);

  const firstCommitment =
    hfbStructuralOracleSuiteCommitment(first.fixtures);
  assert.equal(firstCommitment.fixtureCount, 28);
  first.schemas.validate(
    HFB_STRUCTURAL_ORACLE_COMMITMENT_SCHEMA_ID,
    firstCommitment as never,
  );
  const persistedEvidence = parseStrictJson(
    await readFile(
      path.resolve(
        "architect/evidence/harness-fault-bench-mine/evidence.json",
      ),
      "utf8",
    ),
  ) as unknown as {
    suiteCommitment: typeof firstCommitment;
  };
  assert.deepEqual(persistedEvidence.suiteCommitment, firstCommitment);
  const secondRoot = await temporaryDirectory(t);
  const second = await buildMineSuite(secondRoot);
  assert.deepEqual(
    hfbStructuralOracleSuiteCommitment(second.fixtures),
    firstCommitment,
  );
});

test("HFB structural-oracle runner rejects tampering and reproduces trace hashes", async (t) => {
  const suite = sharedSuite;
  const fixture = suite.fixtures[0]!.document;
  const first = await runHfbStructuralOracleFixture({
    fixture,
    harnessVersionId: fixture.faultyHarnessVersionId,
    schemas: suite.schemas,
    artifacts: suite.artifacts,
    registry: suite.registry,
  });
  const second = await runHfbStructuralOracleFixture({
    fixture,
    harnessVersionId: fixture.faultyHarnessVersionId,
    schemas: suite.schemas,
    artifacts: suite.artifacts,
    registry: suite.registry,
  });
  assert.equal(first.passed, false);
  assert.equal(first.eventChainHash, fixture.expected.faultyEventChainHash);
  assert.deepEqual(second, first);

  const tampered = structuredClone(fixture);
  (
    tampered as unknown as {
      fakeProviderTable: { state: string }[];
    }
  ).fakeProviderTable[0]!.state = "state.tampered";
  await assert.rejects(
    runHfbStructuralOracleFixture({
      fixture: tampered,
      harnessVersionId: fixture.faultyHarnessVersionId,
      schemas: suite.schemas,
      artifacts: suite.artifacts,
      registry: suite.registry,
    }),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "HASH_MISMATCH",
  );
});

test("HFB scorer is strict and the label oracle is only a scorer self-test", async (t) => {
  const suite = sharedSuite;
  const documents = suite.fixtures.map((fixture) => fixture.document);
  const oraclePredictions = fixtureLabelOracleForScorerSelfTest(documents);
  const report = scoreHfbSingleFaultPredictions({
    fixtures: documents,
    predictions: oraclePredictions,
    registry: suite.registry,
    schemas: suite.schemas,
  });
  assert.equal(report.fixtureCount, 28);
  assert.equal(report.top1Correct, 28);
  assert.equal(report.top3Correct, 28);
  assert.equal(report.top1Micros, 1_000_000);
  assert.equal(report.top3Micros, 1_000_000);
  const persistedEvidence = parseStrictJson(
    await readFile(
      path.resolve(
        "architect/evidence/harness-fault-bench-mine/evidence.json",
      ),
      "utf8",
    ),
  ) as unknown as {
    scorerSelfTest: { scoreReport: typeof report };
  };
  assert.deepEqual(persistedEvidence.scorerSelfTest.scoreReport, report);

  const gateLabeled = structuredClone(documents[0]!);
  (gateLabeled as unknown as { splitRole: string }).splitRole = "gate";
  assert.throws(
    () => fixtureLabelOracleForScorerSelfTest([gateLabeled]),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "AUTHORIZATION_DENIED",
  );

  const unknown = structuredClone(oraclePredictions);
  (
    unknown as unknown as {
      rankedComponentIds: string[];
    }[]
  )[0]!.rankedComponentIds = ["component.unknown"];
  assert.throws(
    () =>
      scoreHfbSingleFaultPredictions({
        fixtures: documents,
        predictions: unknown,
        registry: suite.registry,
        schemas: suite.schemas,
      }),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );

  const duplicate = structuredClone(oraclePredictions);
  (
    duplicate as unknown as {
      rankedComponentIds: string[];
    }[]
  )[0]!.rankedComponentIds = [
    documents[0]!.faults[0]!.componentId,
    documents[0]!.faults[0]!.componentId,
  ];
  assert.throws(
    () =>
      scoreHfbSingleFaultPredictions({
        fixtures: documents,
        predictions: duplicate,
        registry: suite.registry,
        schemas: suite.schemas,
      }),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );
});

test("public fixture construction denies gate, final, and multi-cause bodies", () => {
  assert.doesNotThrow(() =>
    assertPublicMineFixtureAccess(
      "hfb-v0-system-prompt-01",
      "proposer",
    ),
  );
  for (const fixtureId of [
    "hfb-v0-system-prompt-05",
    "hfb-v0-system-prompt-07",
    "hfb-v0-multicause-01",
  ]) {
    assert.throws(
      () => assertPublicMineFixtureAccess(fixtureId, "evaluator"),
      (error: unknown) =>
        error instanceof HarnessError &&
        error.code === "AUTHORIZATION_DENIED",
    );
  }
});

test("the public multi-cause contract stays a balanced metadata graph only", async () => {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const graph = parseStrictJson(
    await readFile(
      path.resolve("benchmarks/harness-fault-bench/multicause-graph.json"),
      "utf8",
    ),
  ) as {
    combinedFamilies: string[];
    edges: {
      difficulty: "medium" | "high";
      familyA: string;
      familyB: string;
    }[];
  };
  schemas.validate(
    "https://self-evolving-harness.local/schemas/benchmarks/harness-fault-multicause-graph.schema.json",
    graph as never,
  );
  assert.equal(graph.edges.length, 14);
  for (const family of graph.combinedFamilies) {
    const total = graph.edges.filter(
      (edge) => edge.familyA === family || edge.familyB === family,
    );
    const medium = total.filter((edge) => edge.difficulty === "medium");
    const high = total.filter((edge) => edge.difficulty === "high");
    assert.equal(total.length, 4);
    assert.equal(medium.length, 2);
    assert.equal(high.length, 2);
  }
});
