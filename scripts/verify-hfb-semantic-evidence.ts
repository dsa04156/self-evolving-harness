import { execFile } from "node:child_process";
import {
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  HFB_SEMANTIC_EXECUTION_PACKAGE_SCHEMA_ID,
  HFB_SEMANTIC_ORACLE_RECORD_SCHEMA_ID,
  HFB_SEMANTIC_SUITE_COMMITMENT_SCHEMA_ID,
  HFB_SEMANTIC_VALIDATION_REPORT_SCHEMA_ID,
  SchemaRegistry,
  assertCondition,
  canonicalize,
  parseStrictJson,
  sha256,
  type HfbSemanticExecutionPackage,
  type HfbSemanticOracleRecord,
  type HfbSemanticSuiteCommitment,
  type HfbSemanticValidationReport,
  type JsonValue,
  type LabelBlindAttributionCorpus,
} from "../src/index.js";

const DEVELOPMENT_EVIDENCE_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/benchmarks/hfb-semantic-development-evidence.schema.json";
const LABEL_BLIND_CORPUS_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/benchmarks/hfb-label-blind-attribution-corpus.schema.json";
const execFileAsync = promisify(execFile);
const semanticRoot = path.resolve(
  "benchmarks/harness-fault-bench/semantic/mine",
);

async function readJson(file: string): Promise<JsonValue> {
  return parseStrictJson(await readFile(file, "utf8"));
}

function hashWithout(
  value: object,
  field: string,
): string {
  const clone = structuredClone(
    value,
  ) as Record<string, unknown>;
  delete clone[field];
  return sha256(clone as unknown as JsonValue);
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) =>
    left.localeCompare(right),
  );
}

const schemas = await SchemaRegistry.load(
  path.resolve("schemas"),
);
const commitmentValue = await readJson(
  path.join(semanticRoot, "suite-commitment.json"),
);
schemas.validate(
  HFB_SEMANTIC_SUITE_COMMITMENT_SCHEMA_ID,
  commitmentValue,
);
const commitment =
  commitmentValue as unknown as HfbSemanticSuiteCommitment;
assertCondition(
  commitment.commitmentHash ===
    hashWithout(commitment, "commitmentHash"),
  "HASH_MISMATCH",
  "Semantic suite commitment hash mismatch",
);

const oracleDirectory = path.join(
  semanticRoot,
  "oracle-records",
);
const reportDirectory = path.join(
  semanticRoot,
  "validation-reports",
);
const packageDirectory = path.join(
  semanticRoot,
  "execution-packages",
);
const expectedOracleFiles = commitment.entries.map(
  (entry) => `${entry.fixtureId}.json`,
);
const expectedPackageFiles = [
  ...new Set(
    commitment.entries.map(
      (entry) =>
        `${entry.executionPackageHash.slice(
          "sha256:".length,
        )}.json`,
    ),
  ),
];
assertCondition(
  canonicalize(
    sorted(await readdir(oracleDirectory)),
  ) === canonicalize(sorted(expectedOracleFiles)) &&
    canonicalize(
      sorted(await readdir(reportDirectory)),
    ) ===
      canonicalize(sorted(expectedOracleFiles)) &&
    canonicalize(
      sorted(await readdir(packageDirectory)),
    ) ===
      canonicalize(sorted(expectedPackageFiles)),
  "HASH_MISMATCH",
  "Semantic persisted artifact inventory mismatch",
);

const packages = new Map<
  string,
  HfbSemanticExecutionPackage
>();
for (const filename of expectedPackageFiles) {
  const value = await readJson(
    path.join(packageDirectory, filename),
  );
  schemas.validate(
    HFB_SEMANTIC_EXECUTION_PACKAGE_SCHEMA_ID,
    value,
  );
  const executionPackage =
    value as unknown as HfbSemanticExecutionPackage;
  assertCondition(
    executionPackage.packageHash ===
      hashWithout(executionPackage, "packageHash") &&
      filename ===
        `${executionPackage.packageHash.slice(
          "sha256:".length,
        )}.json`,
    "HASH_MISMATCH",
    "Semantic execution package content address mismatch",
  );
  packages.set(
    executionPackage.packageHash,
    executionPackage,
  );
}

for (const entry of commitment.entries) {
  const oracleValue = await readJson(
    path.join(
      oracleDirectory,
      `${entry.fixtureId}.json`,
    ),
  );
  schemas.validate(
    HFB_SEMANTIC_ORACLE_RECORD_SCHEMA_ID,
    oracleValue,
  );
  const oracle =
    oracleValue as unknown as HfbSemanticOracleRecord;
  assertCondition(
    oracle.fixtureId === entry.fixtureId &&
      oracle.oracleHash === entry.oracleHash &&
      oracle.oracleHash ===
        hashWithout(oracle, "oracleHash"),
    "HASH_MISMATCH",
    "Semantic oracle record mismatch",
  );

  const reportValue = await readJson(
    path.join(
      reportDirectory,
      `${entry.fixtureId}.json`,
    ),
  );
  schemas.validate(
    HFB_SEMANTIC_VALIDATION_REPORT_SCHEMA_ID,
    reportValue,
  );
  const report =
    reportValue as unknown as HfbSemanticValidationReport;
  assertCondition(
    report.fixtureId === entry.fixtureId &&
      report.reportHash ===
        entry.validationReportHash &&
      report.reportHash ===
        hashWithout(report, "reportHash"),
    "HASH_MISMATCH",
    "Semantic validation report mismatch",
  );

  const executionPackage = packages.get(
    entry.executionPackageHash,
  );
  assertCondition(
    executionPackage !== undefined,
    "ARTIFACT_UNAVAILABLE",
    "Committed semantic execution package is missing",
  );
  const serializedPackage = canonicalize(
    executionPackage as unknown as JsonValue,
  );
  for (const forbidden of [
    oracle.fixtureId,
    oracle.mechanismCode,
    oracle.targetComponentId,
    oracle.knownGoodHarnessVersionId,
    oracle.faultyHarnessVersionId,
  ]) {
    assertCondition(
      !serializedPackage.includes(forbidden),
      "AUTHORIZATION_DENIED",
      "Execution package contains benchmark-author oracle data",
    );
  }
}

const corpusValue = await readJson(
  path.join(semanticRoot, "label-blind-corpus.json"),
);
schemas.validate(
  LABEL_BLIND_CORPUS_SCHEMA_ID,
  corpusValue,
);
const corpus =
  corpusValue as unknown as LabelBlindAttributionCorpus;
assertCondition(
  corpus.corpusHash ===
    hashWithout(corpus, "corpusHash") &&
    corpus.traces.reduce(
      (total, entry) =>
        total + entry.occurrenceCount,
      0,
    ) === 28,
  "HASH_MISMATCH",
  "Label-blind corpus commitment mismatch",
);

const evidenceValue = await readJson(
  path.resolve(
    "architect/evidence/harness-fault-bench-semantic/evidence.json",
  ),
);
schemas.validate(
  DEVELOPMENT_EVIDENCE_SCHEMA_ID,
  evidenceValue,
);
const evidence = evidenceValue as unknown as {
  readonly sourceCommit: string;
  readonly suiteCommitment: HfbSemanticSuiteCommitment;
  readonly labelBlindBoundary: {
    readonly corpusHash: string;
  };
};
assertCondition(
  canonicalize(
    evidence.suiteCommitment as unknown as JsonValue,
  ) ===
    canonicalize(
      commitment as unknown as JsonValue,
    ) &&
    evidence.labelBlindBoundary.corpusHash ===
      corpus.corpusHash,
  "HASH_MISMATCH",
  "Semantic evidence does not bind persisted commitments",
);
await execFileAsync(
  "git",
  [
    "cat-file",
    "-e",
    `${evidence.sourceCommit}^{commit}`,
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
  },
);

process.stdout.write(
  [
    "PASS",
    `fixtures=${commitment.entries.length}`,
    `packages=${packages.size}`,
    `commitment=${commitment.commitmentHash}`,
    `corpus=${corpus.corpusHash}`,
    `source=${evidence.sourceCommit}`,
  ].join(" ") + "\n",
);
