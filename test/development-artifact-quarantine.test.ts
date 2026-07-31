import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  DevelopmentArtifactQuarantinePolicy,
  PrincipalSigner,
  SchemaRegistry,
  createDevelopmentArtifactQuarantine,
  sha256Text,
  verifyDevelopmentArtifactQuarantine,
} from "../src/index.js";

test("development diagnostics and candidates are excluded from research use", async () => {
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const signer = PrincipalSigner.generate({
    principalId:
      "protocol.author.development-quarantine.test",
    role: "protocol_author",
    implementationDigest: sha256Text(
      "development-quarantine-test",
    ),
    instanceId:
      "protocol.author.development-quarantine.test.instance",
  });
  const candidate = `hv-sha256:${"a".repeat(64)}`;
  const score = sha256Text("development-score");
  const record = createDevelopmentArtifactQuarantine({
    recordId: "development-artifact-quarantine.test",
    authorizationDecisionHash: sha256Text(
      "architect-approve",
    ),
    artifacts: [
      {
        artifactId: "candidate.test",
        artifactKind: "candidate_harness",
        contentHash: candidate,
        path: null,
      },
      {
        artifactId: "score.test",
        artifactKind: "development_score_report",
        contentHash: score,
        path: "evidence/score.json",
      },
    ],
    recordedAt: "2026-07-31T07:00:00.000Z",
    signer,
  });
  verifyDevelopmentArtifactQuarantine({
    record,
    schemas,
  });
  const policy = new DevelopmentArtifactQuarantinePolicy({
    record,
    schemas,
  });
  policy.assertReferencesAllowed({
    useClass: "development_diagnostic_scoring",
    references: [score],
  });
  for (const useClass of [
    "research_protocol_manifest",
    "attribution_gate",
    "research_candidate_selection",
    "promotion_decision",
    "canary",
    "deployment",
    "production_pointer",
    "claim_table",
    "research_evidence",
  ] as const) {
    assert.throws(
      () =>
        policy.assertReferencesAllowed({
          useClass,
          references: [candidate, score],
        }),
      /development-only artifacts/iu,
    );
  }

  const tampered = structuredClone(record);
  (
    tampered as {
      claimBoundary: {
        authorizedForResearchEvidence: boolean;
      };
    }
  ).claimBoundary.authorizedForResearchEvidence = true;
  assert.throws(
    () =>
      verifyDevelopmentArtifactQuarantine({
        record: tampered,
        schemas,
      }),
    /must be equal to constant|quarantine changed/iu,
  );
});
