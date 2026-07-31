import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEVELOPMENT_EVIDENCE_USE_CLASSES,
  DeterministicClock,
  EvidenceQuarantinePolicy,
  GovernanceDeviationLog,
  HFB_STRUCTURAL_ORACLE_EVIDENCE_FILE_HASH,
  HFB_STRUCTURAL_ORACLE_SUITE_HASH,
  HarnessError,
  PrincipalSigner,
  RESEARCH_PROHIBITED_USE_CLASSES,
  SchemaRegistry,
  createGovernanceDeviationRecord,
  hfbMineFixtureIds,
  parseStrictJson,
  verifyGovernanceDeviationRecord,
  type GovernanceDeviationRecord,
  type GovernanceDeviationUnsignedInput,
} from "../src/index.js";

function unsignedValue(): GovernanceDeviationUnsignedInput {
  return {
    deviationId:
      "governance-deviation.hfb-structural-oracle.2026-07-31",
    governanceDomainId: "self-evolving-harness.local-governance",
    protocolStatus: "not_frozen",
    priorDecision: {
      decision: "REVISE",
      responsePath:
        ".codex/gpt-pro-architect/responses/response-3.md",
      responseSha256: `sha256:${"1".repeat(64)}`,
    },
    dispositionDecision: {
      decision: "REVISE",
      responsePath:
        ".codex/gpt-pro-architect/responses/response-3r.md",
      responseSha256: `sha256:${"2".repeat(64)}`,
    },
    occurred: {
      firstOperationAt: "2026-07-31T03:37:52.000Z",
      lastOperationAt: "2026-07-31T03:49:02.000Z",
      actors: [
        {
          actorId: "codex.local",
          actorType: "coding_agent",
          displayName: "Codex local coding agent",
        },
      ],
      implementationCommits: ["1".repeat(40)],
      evidenceCommits: ["2".repeat(40)],
      operations: [
        "Constructed and executed 28 visible structural fixtures.",
      ],
      fixtureIds: hfbMineFixtureIds(),
    },
    exceededAuthorization:
      "Executed visible D_mine fixture construction after a decision that authorized only the frozen provider smoke.",
    affectedArtifacts: [
      {
        artifactKind: "development_evidence_file",
        artifactId: "hfb-structural-oracle-evidence",
        contentHash: HFB_STRUCTURAL_ORACLE_EVIDENCE_FILE_HASH,
        path: "architect/evidence/harness-fault-bench-mine/evidence.json",
      },
      {
        artifactKind: "suite_commitment",
        artifactId: "hfb-structural-oracle-suite",
        contentHash: HFB_STRUCTURAL_ORACLE_SUITE_HASH,
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
      requiredActions: [
        "Separate execution inputs from the ground-truth oracle.",
      ],
    },
    recordedAt: "2026-07-31T04:00:00.000Z",
  };
}

function signer(): PrincipalSigner {
  return PrincipalSigner.generate({
    principalId: "protocol.author.governance-test",
    role: "protocol_author",
    implementationDigest: `sha256:${"3".repeat(64)}`,
    instanceId: "protocol.author.governance-test.instance",
  });
}

test("signed governance deviation verifies and is append-only", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-governance-deviation-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const record = createGovernanceDeviationRecord({
    value: unsignedValue(),
    signer: signer(),
  });
  assert.doesNotThrow(() =>
    verifyGovernanceDeviationRecord({ record, schemas }),
  );
  const log = new GovernanceDeviationLog({ root, schemas });
  const first = await log.append(record);
  const duplicate = await log.append(record);
  assert.equal(first.recordHash, duplicate.recordHash);
  assert.equal((await log.all()).length, 1);

  const conflicting = createGovernanceDeviationRecord({
    value: {
      ...unsignedValue(),
      exceededAuthorization: "Different signed content.",
    },
    signer: signer(),
  });
  await assert.rejects(
    log.append(conflicting),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "CONFLICT",
  );
});

test("quarantine allows development checks and blocks every research consumer", async () => {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const record = createGovernanceDeviationRecord({
    value: unsignedValue(),
    signer: signer(),
  });
  const policy = new EvidenceQuarantinePolicy({
    records: [record],
    schemas,
  });

  for (const useClass of DEVELOPMENT_EVIDENCE_USE_CLASSES) {
    const admission = policy.assertReferencesAllowed({
      useClass,
      references: [HFB_STRUCTURAL_ORACLE_SUITE_HASH],
    });
    assert.equal(admission?.useClass, useClass);
    assert.deepEqual(admission?.governingDeviationIds, [
      record.deviationId,
    ]);
  }
  for (const useClass of RESEARCH_PROHIBITED_USE_CLASSES) {
    assert.throws(
      () =>
        policy.assertPayloadAllowed({
          useClass,
          payload: {
            nested: {
              artifact: HFB_STRUCTURAL_ORACLE_SUITE_HASH,
            },
          },
        }),
      (error: unknown) =>
        error instanceof HarnessError &&
        error.code === "AUTHORIZATION_DENIED",
    );
  }
  assert.equal(
    policy.assertReferencesAllowed({
      useClass: "research_protocol_manifest",
      references: [`sha256:${"f".repeat(64)}`],
    }),
    null,
  );
});

test("governance deviation rejects hash, signature, and signer tampering", async () => {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const record = createGovernanceDeviationRecord({
    value: unsignedValue(),
    signer: signer(),
  });

  const changedAuthorization = structuredClone(record);
  (
    changedAuthorization as {
      exceededAuthorization: string;
    }
  ).exceededAuthorization = "Tampered";
  assert.throws(
    () =>
      verifyGovernanceDeviationRecord({
        record: changedAuthorization,
        schemas,
      }),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "HASH_MISMATCH",
  );

  const changedSignature = structuredClone(record);
  (
    changedSignature as {
      attestation: { signature: string };
    }
  ).attestation.signature =
    `${
      changedSignature.attestation.signature.startsWith("A")
        ? "B"
        : "A"
    }${changedSignature.attestation.signature.slice(1)}`;
  assert.throws(
    () =>
      verifyGovernanceDeviationRecord({
        record: changedSignature,
        schemas,
      }),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "AUTHENTICATION_FAILED",
  );

  const changedIdentity = structuredClone(record);
  (
    changedIdentity as {
      recordedBy: { principalId: string };
    }
  ).recordedBy.principalId = "protocol.author.attacker";
  assert.throws(
    () =>
      verifyGovernanceDeviationRecord({
        record: changedIdentity,
        schemas,
      }),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "HASH_MISMATCH",
  );
});

test("only a protocol author can sign a governance deviation", () => {
  const operations = PrincipalSigner.generate({
    principalId: "operations.governance-test",
    role: "operations_owner",
    implementationDigest: `sha256:${"4".repeat(64)}`,
    instanceId: "operations.governance-test.instance",
  });
  assert.throws(
    () =>
      createGovernanceDeviationRecord({
        value: unsignedValue(),
        signer: operations,
      }),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "AUTHORIZATION_DENIED",
  );
});

test("deviation timestamps remain caller-supplied facts, not clock side effects", () => {
  const clock = new DeterministicClock(
    "2026-07-31T04:00:00.000Z",
  );
  const value = unsignedValue();
  assert.equal(value.recordedAt, clock.now().toISOString());
});

test("persisted HFB deviation covers the complete old artifact graph", async () => {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const record = parseStrictJson(
    await readFile(
      path.resolve(
        "governance/deviations/hfb-structural-oracle-2026-07-31.json",
      ),
      "utf8",
    ),
  ) as unknown as GovernanceDeviationRecord;
  verifyGovernanceDeviationRecord({ record, schemas });
  assert.equal(record.occurred.fixtureIds.length, 28);
  assert.equal(record.affectedArtifacts.length, 115);
  assert.equal(
    record.priorDecision.responseSha256,
    "sha256:52992fdac76c72d306de937e386191ca1dc82a9685a993317d7ffcf01d1bf62d",
  );
  assert.equal(
    record.dispositionDecision.responseSha256,
    "sha256:29aff8598f70bd5453c1cb7c46b529229c6c07df1ec4427228cae00f101c161d",
  );
  assert.equal(
    JSON.stringify(record).includes("PRIVATE KEY"),
    false,
  );
  const policy = new EvidenceQuarantinePolicy({
    records: [record],
    schemas,
  });
  assert.equal(policy.quarantinedReferences().length, 115);
  for (const useClass of RESEARCH_PROHIBITED_USE_CLASSES) {
    assert.throws(
      () =>
        policy.assertReferencesAllowed({
          useClass,
          references: policy.quarantinedReferences(),
        }),
      (error: unknown) =>
        error instanceof HarnessError &&
        error.code === "AUTHORIZATION_DENIED",
    );
  }
});
