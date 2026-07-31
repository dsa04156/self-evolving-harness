import { execFile } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  PrincipalSigner,
  SchemaRegistry,
  canonicalize,
  createGovernanceRemediationClosure,
  parseStrictJson,
  sha256Bytes,
  sha256Text,
  verifyGovernanceDeviationRecord,
  verifyGovernanceRemediationClosure,
  type GovernanceDeviationRecord,
  type JsonValue,
} from "../src/index.js";

interface SemanticEvidence {
  readonly sourceCommit: string;
  readonly suiteCommitment: {
    readonly commitmentHash: string;
  };
  readonly labelBlindBoundary: {
    readonly corpusHash: string;
  };
}

const execFileAsync = promisify(execFile);
const deviationPath = path.resolve(
  "governance/deviations/hfb-structural-oracle-2026-07-31.json",
);
const responsePath = path.resolve(
  ".codex/gpt-pro-architect/responses/response-3rr.md",
);
const evidencePath = path.resolve(
  "architect/evidence/harness-fault-bench-semantic/evidence.json",
);
const outputPath = path.resolve(
  "governance/remediation-closures/hfb-structural-oracle-2026-07-31.json",
);
const expectedResponseHash =
  "sha256:19d1998f6207ba0f67095be9ed21ff649b35c6523aedb165715694c1115d6e74";
const expectedEvidenceHash =
  "sha256:3083ce265e91292582dfbff6320ab8a1f536e9afc50280e18230dcfe434cb876";

const status = await execFileAsync(
  "git",
  ["status", "--porcelain=v1"],
  { cwd: process.cwd(), encoding: "utf8" },
);
if (status.stdout.length !== 0) {
  throw new Error(
    "Remediation-closure signing requires a clean Git worktree",
  );
}
const headResult = await execFileAsync(
  "git",
  ["rev-parse", "--verify", "HEAD"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const sourceCommit = headResult.stdout.trim();
if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) {
  throw new Error("Git HEAD did not resolve to one exact commit");
}

const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const deviation = parseStrictJson(
  await readFile(deviationPath, "utf8"),
) as unknown as GovernanceDeviationRecord;
verifyGovernanceDeviationRecord({ record: deviation, schemas });

const responseBytes = await readFile(responsePath);
const responseHash = `sha256:${sha256Bytes(responseBytes)}`;
if (
  responseHash !== expectedResponseHash ||
  !responseBytes.toString("utf8").startsWith("DECISION: APPROVE\n")
) {
  throw new Error("Architect approval response drifted");
}

const evidenceBytes = await readFile(evidencePath);
const evidenceHash = `sha256:${sha256Bytes(evidenceBytes)}`;
if (evidenceHash !== expectedEvidenceHash) {
  throw new Error("Semantic replacement evidence drifted");
}
const evidence = parseStrictJson(
  evidenceBytes.toString("utf8"),
) as unknown as SemanticEvidence;

const signer = PrincipalSigner.generate({
  principalId:
    "protocol.author.semantic-remediation-closure-2026-07-31",
  role: "protocol_author",
  implementationDigest: sha256Text(
    `git:${sourceCommit}:scripts/create-hfb-remediation-closure.ts`,
  ),
  instanceId:
    "protocol.author.semantic-remediation-closure-2026-07-31.instance",
  keyId:
    "protocol.author.semantic-remediation-closure-2026-07-31.ed25519",
});
const record = createGovernanceRemediationClosure({
  deviation,
  signer,
  value: {
    closureId:
      "governance-remediation-closure.hfb-structural-oracle.2026-07-31",
    governanceDomainId: deviation.governanceDomainId,
    deviationId: deviation.deviationId,
    deviationRecordHash: deviation.recordHash,
    architectDecision: {
      decision: "APPROVE",
      responsePath:
        ".codex/gpt-pro-architect/responses/response-3rr.md",
      responseSha256: responseHash,
    },
    replacementEvidence: {
      semanticSuiteCommitment:
        evidence.suiteCommitment.commitmentHash,
      labelBlindCorpusCommitment:
        evidence.labelBlindBoundary.corpusHash,
      semanticEvidenceSourceCommit: evidence.sourceCommit,
      evidencePath:
        "architect/evidence/harness-fault-bench-semantic/evidence.json",
      evidenceFileSha256: evidenceHash,
    },
    remediation: {
      originalRecordWasModified: false,
      originalStatusObserved: "in_progress",
      closureStatus: "closed_by_append_only_record",
      completedActions: [
        "Preserved and mechanically quarantined all structural-oracle artifacts from research and adaptive use.",
        "Renamed the original suite as structural and label-oracle plumbing.",
        "Separated label-free runtime execution inputs from the benchmark-author oracle domain.",
        "Executed all eight mutable component types through standalone runtime decision points.",
        "Added an observable-only verifier and label-blind allowlist adapter with adversarial leakage tests.",
        "Generated distinct semantic and label-blind commitments and obtained Architect approval.",
      ],
      outstandingActions: [],
    },
    claimBoundary: {
      semanticDevelopmentFixtureCorrectionClosed: true,
      researchEvidenceAuthorized: false,
      attributionPerformanceClaim: false,
      selfEvolutionClaim: false,
      oldArtifactsRemainQuarantined: true,
    },
    closureSourceCommit: sourceCommit,
    closedAt: new Date().toISOString(),
  },
});
verifyGovernanceRemediationClosure({
  record,
  deviation,
  schemas,
});

const serialized =
  `${canonicalize(record as unknown as JsonValue)}\n`;
if (process.argv.includes("--write")) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `WROTE ${path.relative(process.cwd(), outputPath)} ${record.recordHash}\n`,
  );
} else {
  process.stdout.write(serialized);
}
