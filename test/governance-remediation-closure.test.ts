import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEVELOPMENT_EVIDENCE_USE_CLASSES,
  GovernanceRemediationClosureLog,
  PrincipalSigner,
  RESEARCH_PROHIBITED_USE_CLASSES,
  SchemaRegistry,
  createGovernanceDeviationRecord,
  createGovernanceRemediationClosure,
  sha256Text,
  verifyGovernanceRemediationClosure,
  type GovernanceRemediationClosureRecord,
} from "../src/index.js";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;
const SHA_D = `sha256:${"d".repeat(64)}`;
const SHA_E = `sha256:${"e".repeat(64)}`;
const COMMIT = "1".repeat(40);

async function fixture(): Promise<{
  readonly schemas: SchemaRegistry;
  readonly root: string;
  readonly deviation: ReturnType<
    typeof createGovernanceDeviationRecord
  >;
  readonly closure: GovernanceRemediationClosureRecord;
}> {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-remediation-closure-"),
  );
  const deviationSigner = PrincipalSigner.generate({
    principalId: "protocol.author.deviation.test",
    role: "protocol_author",
    implementationDigest: sha256Text("deviation-test"),
    instanceId: "protocol.author.deviation.test.instance",
    keyId: "protocol.author.deviation.test.ed25519",
  });
  const deviation = createGovernanceDeviationRecord({
    signer: deviationSigner,
    value: {
      deviationId: "governance-deviation.test",
      governanceDomainId: "governance.test",
      protocolStatus: "not_frozen",
      priorDecision: {
        decision: "REVISE",
        responsePath: "response-before.md",
        responseSha256: SHA_A,
      },
      dispositionDecision: {
        decision: "REVISE",
        responsePath: "response-revise.md",
        responseSha256: SHA_B,
      },
      occurred: {
        firstOperationAt: "2026-07-31T00:00:00.000Z",
        lastOperationAt: "2026-07-31T00:01:00.000Z",
        actors: [
          {
            actorId: "actor.test",
            actorType: "coding_agent",
            displayName: "test actor",
          },
        ],
        implementationCommits: [COMMIT],
        evidenceCommits: ["2".repeat(40)],
        operations: ["created structural fixtures"],
        fixtureIds: Array.from(
          { length: 28 },
          (_, index) =>
            `hfb-v0-test-${String(index + 1).padStart(2, "0")}`,
        ),
      },
      exceededAuthorization: "test deviation",
      affectedArtifacts: [
        {
          artifactKind: "suite_commitment",
          artifactId: "suite.test",
          contentHash: SHA_C,
          path: null,
        },
      ],
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
        requiredActions: ["replace structural suite"],
      },
      recordedAt: "2026-07-31T00:02:00.000Z",
    },
  });
  const closureSigner = PrincipalSigner.generate({
    principalId: "protocol.author.closure.test",
    role: "protocol_author",
    implementationDigest: sha256Text("closure-test"),
    instanceId: "protocol.author.closure.test.instance",
    keyId: "protocol.author.closure.test.ed25519",
  });
  const closure = createGovernanceRemediationClosure({
    deviation,
    signer: closureSigner,
    value: {
      closureId: "governance-remediation-closure.test",
      governanceDomainId: deviation.governanceDomainId,
      deviationId: deviation.deviationId,
      deviationRecordHash: deviation.recordHash,
      architectDecision: {
        decision: "APPROVE",
        responsePath: "response-approve.md",
        responseSha256: SHA_D,
      },
      replacementEvidence: {
        semanticSuiteCommitment: SHA_E,
        labelBlindCorpusCommitment: SHA_A,
        semanticEvidenceSourceCommit: "3".repeat(40),
        evidencePath: "evidence/semantic.json",
        evidenceFileSha256: SHA_B,
      },
      remediation: {
        originalRecordWasModified: false,
        originalStatusObserved: "in_progress",
        closureStatus: "closed_by_append_only_record",
        completedActions: ["replaced structural suite"],
        outstandingActions: [],
      },
      claimBoundary: {
        semanticDevelopmentFixtureCorrectionClosed: true,
        researchEvidenceAuthorized: false,
        attributionPerformanceClaim: false,
        selfEvolutionClaim: false,
        oldArtifactsRemainQuarantined: true,
      },
      closureSourceCommit: COMMIT,
      closedAt: "2026-07-31T00:03:00.000Z",
    },
  });
  return { schemas, root, deviation, closure };
}

test("remediation closes by an append-only signed record", async () => {
  const value = await fixture();
  verifyGovernanceRemediationClosure({
    record: value.closure,
    deviation: value.deviation,
    schemas: value.schemas,
  });
  assert.equal(value.deviation.remediation.status, "in_progress");

  const log = new GovernanceRemediationClosureLog({
    root: value.root,
    schemas: value.schemas,
    deviation: value.deviation,
  });
  const first = await log.append(value.closure);
  const duplicate = await log.append(value.closure);
  assert.equal(first.recordHash, duplicate.recordHash);
  assert.deepEqual(await log.all(), [value.closure]);
});

test("remediation closure rejects mutation and deviation rebinding", async () => {
  const value = await fixture();
  const mutated = structuredClone(value.closure);
  (
    mutated as {
      replacementEvidence: {
        evidenceFileSha256: string;
      };
    }
  ).replacementEvidence.evidenceFileSha256 = SHA_E;
  assert.throws(
    () =>
      verifyGovernanceRemediationClosure({
        record: mutated,
        deviation: value.deviation,
        schemas: value.schemas,
      }),
    /hash mismatch/iu,
  );

  const foreign = structuredClone(value.deviation);
  (
    foreign as {
      recordHash: string;
    }
  ).recordHash = SHA_E;
  assert.throws(
    () =>
      verifyGovernanceRemediationClosure({
        record: value.closure,
        deviation: foreign,
        schemas: value.schemas,
      }),
    /binding mismatch/iu,
  );
});
