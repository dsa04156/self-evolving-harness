import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  DeterministicLabelBlindAttributor,
  PrincipalSigner,
  SchemaRegistry,
  createDevelopmentAttributionCommitment,
  createDevelopmentAttributionPrototypeManifest,
  createDevelopmentOracleAccessEvent,
  parseStrictJson,
  scoreDevelopmentAttribution,
  sha256Text,
  verifyDevelopmentAttributionCommitment,
  type DevelopmentAttributionLabel,
  type DevelopmentOracleJoinEntry,
  type LabelBlindAttributionCorpus,
} from "../src/index.js";

const corpusPath = path.resolve(
  "benchmarks/harness-fault-bench/semantic/mine/label-blind-corpus.json",
);

async function fixture(): Promise<{
  readonly schemas: SchemaRegistry;
  readonly corpus: LabelBlindAttributionCorpus;
}> {
  return {
    schemas: await SchemaRegistry.load(path.resolve("schemas")),
    corpus: parseStrictJson(
      await readFile(corpusPath, "utf8"),
    ) as unknown as LabelBlindAttributionCorpus,
  };
}

test("label-blind prototype seals every prediction before oracle scoring", async () => {
  const value = await fixture();
  const manifest =
    createDevelopmentAttributionPrototypeManifest({
      prototypeId:
        "development.label-blind-attributor.test",
      semanticVersion: "0.1.0",
      implementationHash: sha256Text(
        "development-attribution-test",
      ),
      approvedCorpusHash: value.corpus.corpusHash,
    });
  const attributor = new DeterministicLabelBlindAttributor({
    manifest,
    schemas: value.schemas,
  });
  const predictionSet = attributor.run({
    runId: "development-attribution-run.test",
    corpus: value.corpus,
    generatedAt: "2026-07-31T05:00:00.000Z",
    priorDiagnosticResultsVisible: false,
  });
  assert.equal(
    predictionSet.predictions.length,
    value.corpus.traces.length,
  );
  assert.equal(
    Object.values(
      predictionSet.occurrenceStatusCounts,
    ).reduce((sum, count) => sum + count, 0),
    28,
  );

  const proposer = PrincipalSigner.generate({
    principalId: "proposer.development-attribution.test",
    role: "proposer",
    implementationDigest: manifest.implementationHash,
    instanceId:
      "proposer.development-attribution.test.instance",
  });
  const commitment = createDevelopmentAttributionCommitment({
    predictionSet,
    manifest,
    corpus: value.corpus,
    schemas: value.schemas,
    signer: proposer,
    commitmentId:
      "development-attribution-commitment.test",
    sealedAt: "2026-07-31T05:01:00.000Z",
  });
  verifyDevelopmentAttributionCommitment({
    commitment,
    predictionSet,
    manifest,
    corpus: value.corpus,
    schemas: value.schemas,
  });

  const labels: readonly DevelopmentAttributionLabel[] = [
    "SystemPrompt",
    "ContextPolicy",
    "MemoryRetrievalPolicy",
    "Skill",
    "WorkflowPolicy",
    "RoutingPolicy",
    "SubagentPrompt",
    "ToolDescription",
  ];
  const oracleEntries: DevelopmentOracleJoinEntry[] = [];
  let ordinal = 0;
  for (const entry of value.corpus.traces) {
    for (
      let occurrence = 0;
      occurrence < entry.occurrenceCount;
      occurrence += 1
    ) {
      oracleEntries.push({
        caseId:
          `development-case-${String(ordinal).padStart(2, "0")}`,
        traceProjectionId:
          entry.trace.traceProjectionId,
        targetComponentType:
          labels[ordinal % labels.length]!,
        oracleRecordHash: sha256Text(
          `oracle-record-${ordinal}`,
        ),
      });
      ordinal += 1;
    }
  }

  const evaluator = PrincipalSigner.generate({
    principalId:
      "evaluator.development-attribution.test",
    role: "evaluator",
    implementationDigest: sha256Text(
      "development-attribution-scorer-test",
    ),
    instanceId:
      "evaluator.development-attribution.test.instance",
  });
  assert.throws(
    () =>
      createDevelopmentOracleAccessEvent({
        accessEventId: "oracle-access.too-early",
        commitment,
        predictionSet,
        manifest,
        corpus: value.corpus,
        oracleEntries,
        accessedAt: "2026-07-31T05:00:59.999Z",
        signer: evaluator,
        schemas: value.schemas,
      }),
    /after prediction commitment/iu,
  );

  const accessEvent = createDevelopmentOracleAccessEvent({
    accessEventId: "oracle-access.test",
    commitment,
    predictionSet,
    manifest,
    corpus: value.corpus,
    oracleEntries,
    accessedAt: "2026-07-31T05:02:00.000Z",
    signer: evaluator,
    schemas: value.schemas,
  });
  const report = scoreDevelopmentAttribution({
    reportId: "development-attribution-score.test",
    scorerId: "development-attribution-scorer.test",
    scorerImplementationHash:
      evaluator.identity.implementationDigest,
    predictionSet,
    commitment,
    manifest,
    corpus: value.corpus,
    oracleEntries,
    accessEvent,
    scoredAt: "2026-07-31T05:03:00.000Z",
    signer: evaluator,
    schemas: value.schemas,
  });
  assert.equal(report.caseCount, 28);
  assert.equal(
    Object.values(report.statusCounts).reduce(
      (sum, count) => sum + count,
      0,
    ),
    28,
  );
  assert.equal(
    report.diagnosticMetrics.topKCount +
      report.diagnosticMetrics.abstentionCount +
      report.diagnosticMetrics.invalidOutputCount +
      report.diagnosticMetrics.failureCount +
      report.diagnosticMetrics.timeoutCount,
    28,
  );
  assert.equal(
    report.claimBoundary.attributionPerformanceClaim,
    false,
  );
});

test("attributor rejects corpus drift and oracle-shaped extra fields", async () => {
  const value = await fixture();
  const manifest =
    createDevelopmentAttributionPrototypeManifest({
      prototypeId:
        "development.label-blind-attributor.drift-test",
      semanticVersion: "0.1.0",
      implementationHash: sha256Text("drift-test"),
      approvedCorpusHash: value.corpus.corpusHash,
    });
  const attributor = new DeterministicLabelBlindAttributor({
    manifest,
    schemas: value.schemas,
  });
  const leaked = structuredClone(value.corpus) as unknown as {
    oracleLabel?: string;
  };
  leaked.oracleLabel = "SystemPrompt";
  assert.throws(
    () =>
      attributor.run({
        runId: "development-attribution-run.leaked",
        corpus:
          leaked as unknown as LabelBlindAttributionCorpus,
        generatedAt: "2026-07-31T05:00:00.000Z",
        priorDiagnosticResultsVisible: false,
      }),
    /additional properties/iu,
  );

  const drifted = structuredClone(value.corpus);
  (
    drifted.traces[0]!.trace.outcome as {
      passed: boolean;
    }
  ).passed = true;
  assert.throws(
    () =>
      attributor.run({
        runId: "development-attribution-run.drifted",
        corpus: drifted,
        generatedAt: "2026-07-31T05:00:00.000Z",
        priorDiagnosticResultsVisible: false,
      }),
    /approved committed corpus/iu,
  );
});

test("attributor source cannot import oracle or scorer authority", async () => {
  const source = await readFile(
    path.resolve(
      "src/evaluation/development-attribution.ts",
    ),
    "utf8",
  );
  for (const forbidden of [
    "hfb-semantic-authoring",
    "harness-fault-bench",
    "development-attribution-scorer",
    "oracle-records/",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
