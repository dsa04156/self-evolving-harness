import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  HarnessComponentRegistry,
  HarnessFaultBenchSemanticAuthoringBuilder,
  SchemaRegistry,
  assertLabelBlindBoundary,
  toLabelBlindAttributionInput,
} from "../src/index.js";

test("semantic execution keeps oracle labels outside the runtime module", async () => {
  const source = await readFile(
    path.resolve(
      "src/evaluation/hfb-semantic-execution.ts",
    ),
    "utf8",
  );
  for (const forbidden of [
    "fixtureId",
    "mechanismCode",
    "targetComponent",
    "knownGoodHarness",
    "faultyHarness",
    "applyHfbPatch",
    "hfbMineCasesForSemanticAuthoring",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `runtime execution imports oracle concept ${forbidden}`,
    );
  }
});

test("all 28 D_mine fixtures exercise mutable runtime semantics", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-hfb-semantic-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
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
    path.resolve("configs/component-type-registry.json"),
  );
  const builder =
    new HarnessFaultBenchSemanticAuthoringBuilder({
      schemas,
      artifacts,
      registry,
      workingRoot: path.join(root, "executions"),
    });
  const builtSuite = await builder.buildAll();
  assert.equal(builtSuite.length, 28);
  assert.equal(
    new Set(
      builtSuite.map(
        (built) => built.oracle.targetComponentType,
      ),
    ).size,
    8,
  );
  for (const built of builtSuite) {
    const fixtureId = built.oracle.fixtureId;
    assert.equal(built.knownGoodResult.passed, true);
    assert.equal(built.faultyResult.passed, false);
    assert.equal(
      built.validationReport
        .behaviorDivergedBeforeVerification,
      true,
    );
    assert.equal(
      built.validationReport.goodReplayHashesIdentical,
      true,
    );
    assert.equal(
      built.validationReport.faultyReplayHashesIdentical,
      true,
    );
    assert.equal(
      JSON.stringify(built.executionPackage).includes(
        fixtureId,
      ),
      false,
    );
    assert.equal(
      JSON.stringify(built.executionPackage).includes(
        built.oracle.targetComponentId,
      ),
      false,
    );
    const labelBlind =
      toLabelBlindAttributionInput(
        built.faultyResult,
      );
    schemas.validate(
      "https://self-evolving-harness.local/schemas/benchmarks/hfb-label-blind-attribution-input.schema.json",
      labelBlind as never,
    );
    assertLabelBlindBoundary(labelBlind, [
      built.oracle.fixtureId,
      built.oracle.mechanismCode,
      built.oracle.targetComponentId,
      built.oracle.knownGoodHarnessVersionId,
      built.oracle.faultyHarnessVersionId,
    ]);
  }
});
