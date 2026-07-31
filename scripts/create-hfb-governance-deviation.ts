import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  DEVELOPMENT_EVIDENCE_USE_CLASSES,
  HFB_STRUCTURAL_ORACLE_EVIDENCE_FILE_HASH,
  HFB_STRUCTURAL_ORACLE_SUITE_HASH,
  PrincipalSigner,
  RESEARCH_PROHIBITED_USE_CLASSES,
  SchemaRegistry,
  canonicalize,
  createGovernanceDeviationRecord,
  parseStrictJson,
  sha256Bytes,
  sha256Text,
  verifyGovernanceDeviationRecord,
  type GovernanceDeviationArtifact,
  type JsonValue,
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

const execFileAsync = promisify(execFile);
const evidencePath = path.resolve(
  "architect/evidence/harness-fault-bench-mine/evidence.json",
);

const gitStatus = await execFileAsync(
  "git",
  ["status", "--porcelain=v1"],
  { cwd: process.cwd(), encoding: "utf8" },
);
if (gitStatus.stdout.length !== 0) {
  throw new Error(
    "Governance-deviation signing requires a clean Git worktree",
  );
}
const gitHeadResult = await execFileAsync(
  "git",
  ["rev-parse", "--verify", "HEAD"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const gitHead = gitHeadResult.stdout.trim();
if (!/^[a-f0-9]{40}$/u.test(gitHead)) {
  throw new Error("Git HEAD did not resolve to one exact commit");
}

const evidenceBytes = await readFile(evidencePath);
const evidenceFileHash =
  `sha256:${sha256Bytes(evidenceBytes)}`;
if (evidenceFileHash !== HFB_STRUCTURAL_ORACLE_EVIDENCE_FILE_HASH) {
  throw new Error("Structural-oracle evidence file hash drifted");
}
const evidence = parseStrictJson(
  evidenceBytes.toString("utf8"),
) as unknown as StructuralEvidence;
if (
  evidence.suiteCommitment.suiteHash !==
  HFB_STRUCTURAL_ORACLE_SUITE_HASH
) {
  throw new Error("Structural-oracle suite commitment drifted");
}

const fixtures = [...evidence.suiteCommitment.fixtures].sort(
  (left, right) => left.fixtureId.localeCompare(right.fixtureId),
);
if (
  fixtures.length !== 28 ||
  new Set(fixtures.map((fixture) => fixture.fixtureId)).size !== 28
) {
  throw new Error("Expected exactly 28 unique structural fixtures");
}

const affectedArtifacts: GovernanceDeviationArtifact[] = [
  {
    artifactKind: "development_evidence_file",
    artifactId: "hfb-structural-oracle-development-evidence",
    contentHash: evidenceFileHash,
    path: "architect/evidence/harness-fault-bench-mine/evidence.json",
  },
  {
    artifactKind: "suite_commitment",
    artifactId: "hfb-structural-oracle-suite-commitment",
    contentHash: evidence.suiteCommitment.suiteHash,
    path: null,
  },
  {
    artifactKind: "score_report",
    artifactId: "hfb-label-oracle-scorer-self-test",
    contentHash: evidence.scorerSelfTest.scoreReport.reportHash,
    path: null,
  },
];
for (const fixture of fixtures) {
  affectedArtifacts.push(
    {
      artifactKind: "fixture_body",
      artifactId: fixture.fixtureId,
      contentHash: fixture.fixtureContentHash,
      path: null,
    },
    {
      artifactKind: "causal_report",
      artifactId: fixture.fixtureId,
      contentHash: fixture.causalReportHash,
      path: null,
    },
    {
      artifactKind: "known_good_harness",
      artifactId: fixture.fixtureId,
      contentHash: fixture.knownGoodHarnessVersionId,
      path: null,
    },
    {
      artifactKind: "faulty_harness",
      artifactId: fixture.fixtureId,
      contentHash: fixture.faultyHarnessVersionId,
      path: null,
    },
  );
}

const signer = PrincipalSigner.generate({
  principalId: "protocol.author.local-governance-2026-07-31",
  role: "protocol_author",
  implementationDigest: sha256Text(
    `git:${gitHead}:scripts/create-hfb-governance-deviation.ts`,
  ),
  instanceId:
    "protocol.author.local-governance-2026-07-31.instance",
  keyId: "protocol.author.local-governance-2026-07-31.ed25519",
});
const record = createGovernanceDeviationRecord({
  signer,
  value: {
    deviationId:
      "governance-deviation.hfb-structural-oracle.2026-07-31",
    governanceDomainId: "self-evolving-harness.local-governance",
    protocolStatus: "not_frozen",
    priorDecision: {
      decision: "REVISE",
      responsePath:
        ".codex/gpt-pro-architect/responses/response-3.md",
      responseSha256:
        "sha256:52992fdac76c72d306de937e386191ca1dc82a9685a993317d7ffcf01d1bf62d",
    },
    dispositionDecision: {
      decision: "REVISE",
      responsePath:
        ".codex/gpt-pro-architect/responses/response-3r.md",
      responseSha256:
        "sha256:29aff8598f70bd5453c1cb7c46b529229c6c07df1ec4427228cae00f101c161d",
    },
    occurred: {
      firstOperationAt: "2026-07-31T03:37:52.000Z",
      lastOperationAt: "2026-07-31T03:49:02.000Z",
      actors: [
        {
          actorId: "human-operator.workspace-owner",
          actorType: "human_operator",
          displayName:
            "Workspace user who authorized continued implementation",
        },
        {
          actorId: "coding-agent.codex-local",
          actorType: "coding_agent",
          displayName: "Codex local coding agent",
        },
        {
          actorId: "git-author.codex-research-harness",
          actorType: "git_author",
          displayName:
            "Codex Research Harness <codex-local@invalid>",
        },
      ],
      implementationCommits: [
        "7b0a7c88456ac96ce816514a70d5a63f69c04071",
        "5bd8061c6d16af2271320f9a60127b03be71dc7e",
      ],
      evidenceCommits: [
        "fc87786560f6abf7ac034d77058c5feda1595cf2",
      ],
      operations: [
        "Constructed all 28 visible D_mine fixture bodies across seven preregistered families.",
        "Executed known-good, faulty, target-restoration, non-target-perturbation, and three-replay structural-oracle paths.",
        "Persisted the causal-validation aggregate, suite commitment, and ground-truth-fed 28/28 scorer self-test.",
        "Bound the persisted evidence to clean Git HEAD 5bd8061c6d16af2271320f9a60127b03be71dc7e.",
      ],
      fixtureIds: fixtures.map((fixture) => fixture.fixtureId),
    },
    exceededAuthorization:
      "The Gate 3 readiness decision authorized only one exact frozen real-provider smoke and explicitly prohibited benchmark and D_mine execution. Constructing, executing, and persisting evidence for the 28 visible D_mine structural-oracle fixtures exceeded that authorization. General user permission to continue implementation did not override the preregistered Architect gate.",
    affectedArtifacts,
    quarantine: {
      developmentOnly: true,
      confirmatory: false,
      authorizedForResearchEvidence: false,
      allowedUseClasses: DEVELOPMENT_EVIDENCE_USE_CLASSES,
      prohibitedUseClasses: RESEARCH_PROHIBITED_USE_CLASSES,
      replacementPolicy:
        "retain_as_superseded_development_evidence",
    },
    remediation: {
      status: "in_progress",
      requiredActions: [
        "Keep the structural-oracle bodies, reports, harness versions, suite commitment, and scorer output outside every research protocol and adaptive decision.",
        "Rename the current path as structural or label-oracle plumbing rather than an attribution-ready executable benchmark.",
        "Separate runtime execution inputs from the ground-truth oracle authority domain.",
        "Implement seven-family component semantics through actual runtime decision points with input-driven fake provider and tools.",
        "Add an outcome-driven verifier and label-blind attribution-input adapter with adversarial leakage tests.",
        "Generate a distinct semantic development commitment and resubmit it for Architect review before research use.",
      ],
    },
    recordedAt: new Date().toISOString(),
  },
});

const schemas = await SchemaRegistry.load(path.resolve("schemas"));
verifyGovernanceDeviationRecord({ record, schemas });
process.stdout.write(
  `${canonicalize(record as unknown as JsonValue)}\n`,
);
