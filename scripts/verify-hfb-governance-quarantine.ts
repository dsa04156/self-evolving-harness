import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  DEVELOPMENT_EVIDENCE_USE_CLASSES,
  EvidenceQuarantinePolicy,
  HFB_STRUCTURAL_ORACLE_EVIDENCE_FILE_HASH,
  HFB_STRUCTURAL_ORACLE_SUITE_HASH,
  HarnessError,
  RESEARCH_PROHIBITED_USE_CLASSES,
  SchemaRegistry,
  parseStrictJson,
  sha256Bytes,
  verifyGovernanceDeviationRecord,
  type GovernanceDeviationRecord,
  type GovernanceRemediationClosureRecord,
  verifyGovernanceRemediationClosure,
} from "../src/index.js";

interface StructuralEvidence {
  readonly suiteCommitment: {
    readonly suiteHash: string;
    readonly fixtures: readonly {
      readonly fixtureId: string;
      readonly fixtureContentHash: string;
      readonly causalReportHash: string;
      readonly knownGoodHarnessVersionId: string;
      readonly faultyHarnessVersionId: string;
    }[];
  };
  readonly scorerSelfTest: {
    readonly scoreReport: {
      readonly reportHash: string;
    };
  };
}

const deviationPath = path.resolve(
  "governance/deviations/hfb-structural-oracle-2026-07-31.json",
);
const evidencePath = path.resolve(
  "architect/evidence/harness-fault-bench-mine/evidence.json",
);
const closurePath = path.resolve(
  "governance/remediation-closures/hfb-structural-oracle-2026-07-31.json",
);
const architectResponsePath = path.resolve(
  ".codex/gpt-pro-architect/responses/response-3rr.md",
);
const semanticEvidencePath = path.resolve(
  "architect/evidence/harness-fault-bench-semantic/evidence.json",
);
const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const record = parseStrictJson(
  await readFile(deviationPath, "utf8"),
) as unknown as GovernanceDeviationRecord;
verifyGovernanceDeviationRecord({ record, schemas });
const closure = parseStrictJson(
  await readFile(closurePath, "utf8"),
) as unknown as GovernanceRemediationClosureRecord;
verifyGovernanceRemediationClosure({
  record: closure,
  deviation: record,
  schemas,
});

const architectResponseHash =
  `sha256:${sha256Bytes(await readFile(architectResponsePath))}`;
if (
  closure.architectDecision.responseSha256 !==
  architectResponseHash
) {
  throw new Error("Remediation closure response hash drifted");
}
const semanticEvidenceBytes = await readFile(semanticEvidencePath);
const semanticEvidenceHash =
  `sha256:${sha256Bytes(semanticEvidenceBytes)}`;
if (
  closure.replacementEvidence.evidenceFileSha256 !==
  semanticEvidenceHash
) {
  throw new Error("Remediation closure replacement evidence drifted");
}
const semanticEvidence = parseStrictJson(
  semanticEvidenceBytes.toString("utf8"),
) as {
  readonly sourceCommit: string;
  readonly suiteCommitment: {
    readonly commitmentHash: string;
  };
  readonly labelBlindBoundary: {
    readonly corpusHash: string;
  };
};
if (
  closure.replacementEvidence.semanticEvidenceSourceCommit !==
    semanticEvidence.sourceCommit ||
  closure.replacementEvidence.semanticSuiteCommitment !==
    semanticEvidence.suiteCommitment.commitmentHash ||
  closure.replacementEvidence.labelBlindCorpusCommitment !==
    semanticEvidence.labelBlindBoundary.corpusHash
) {
  throw new Error("Remediation closure replacement commitments drifted");
}

const evidenceBytes = await readFile(evidencePath);
const evidenceFileHash =
  `sha256:${sha256Bytes(evidenceBytes)}`;
if (evidenceFileHash !== HFB_STRUCTURAL_ORACLE_EVIDENCE_FILE_HASH) {
  throw new Error("Persisted structural evidence hash drifted");
}
const evidence = parseStrictJson(
  evidenceBytes.toString("utf8"),
) as unknown as StructuralEvidence;
if (
  evidence.suiteCommitment.suiteHash !==
  HFB_STRUCTURAL_ORACLE_SUITE_HASH
) {
  throw new Error("Persisted structural suite hash drifted");
}

const expectedReferences = new Set<string>([
  evidenceFileHash,
  evidence.suiteCommitment.suiteHash,
  evidence.scorerSelfTest.scoreReport.reportHash,
]);
for (const fixture of evidence.suiteCommitment.fixtures) {
  expectedReferences.add(fixture.fixtureContentHash);
  expectedReferences.add(fixture.causalReportHash);
  expectedReferences.add(fixture.knownGoodHarnessVersionId);
  expectedReferences.add(fixture.faultyHarnessVersionId);
}
const actualReferences = new Set(
  record.affectedArtifacts.map((artifact) => artifact.contentHash),
);
if (
  actualReferences.size !== expectedReferences.size ||
  [...expectedReferences].some(
    (reference) => !actualReferences.has(reference),
  )
) {
  throw new Error(
    "Signed quarantine does not cover the complete structural artifact graph",
  );
}

const policy = new EvidenceQuarantinePolicy({
  records: [record],
  schemas,
});
for (const useClass of DEVELOPMENT_EVIDENCE_USE_CLASSES) {
  const admission = policy.assertReferencesAllowed({
    useClass,
    references: [...expectedReferences],
  });
  if (
    admission === null ||
    !admission.governingDeviationIds.includes(record.deviationId)
  ) {
    throw new Error(`Missing development admission for ${useClass}`);
  }
}
for (const useClass of RESEARCH_PROHIBITED_USE_CLASSES) {
  let rejected = false;
  try {
    policy.assertReferencesAllowed({
      useClass,
      references: [...expectedReferences],
    });
  } catch (error) {
    rejected =
      error instanceof HarnessError &&
      error.code === "AUTHORIZATION_DENIED";
  }
  if (!rejected) {
    throw new Error(`Quarantine did not reject ${useClass}`);
  }
}

process.stdout.write(
  [
    "PASS",
    `deviation=${record.deviationId}`,
    `record=${record.recordHash}`,
    `closure=${closure.recordHash}`,
    `fixtures=${record.occurred.fixtureIds.length}`,
    `artifacts=${record.affectedArtifacts.length}`,
    `allowed=${DEVELOPMENT_EVIDENCE_USE_CLASSES.length}`,
    `prohibited=${RESEARCH_PROHIBITED_USE_CLASSES.length}`,
  ].join(" ") + "\n",
);
