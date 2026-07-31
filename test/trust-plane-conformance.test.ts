import assert from "node:assert/strict";
import { describe, test } from "node:test";
import path from "node:path";

import {
  SchemaRegistry,
  createTrustPlaneConformanceManifest,
  verifyTrustPlaneConformanceManifest,
  verifyTrustPlaneOutstandingObligations,
  type TrustPlaneArtifactReference,
  type TrustPlaneConformanceManifest,
  type TrustPlaneEvidenceDomain,
  type TrustPlaneOutstandingObligations,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const digest = (value: string) =>
  `sha256:${value.repeat(64).slice(0, 64)}`;
const commit = (value: string) =>
  value.repeat(40).slice(0, 40);

function artifact(
  artifactId: string,
  suffix: "json" | "md" | "ts" = "json",
): TrustPlaneArtifactReference {
  return {
    artifactId,
    path: `fixtures/${artifactId}.${suffix}`,
    sourceCommit: commit("a"),
    sha256: digest("b"),
    sizeBytes: 1,
    mediaType:
      suffix === "json"
        ? "application/json"
        : suffix === "ts"
          ? "text/typescript; charset=utf-8"
          : "text/markdown; charset=utf-8",
  };
}

function domain(
  domainId: TrustPlaneEvidenceDomain["domainId"],
  ordinal: number,
  extraArtifacts: readonly TrustPlaneArtifactReference[] = [],
): TrustPlaneEvidenceDomain {
  const ruling = artifact(`domain${ordinal}.ruling`, "md");
  const contract = artifact(`domain${ordinal}.contract`, "ts");
  return {
    domainId,
    sourceCommits: [
      {
        role: "primary",
        commit: commit(String((ordinal % 9) + 1)),
        tree: commit(String(((ordinal + 1) % 9) + 1)),
      },
    ],
    artifacts: [ruling, contract, ...extraArtifacts],
    evidenceAssertions: [],
    ruling: {
      artifactId: ruling.artifactId,
      decision: "APPROVE",
      acceptanceAnchors: ["ACCEPTED:"],
      claimBoundaryAnchor: "CLAIM_DISCIPLINE:",
      authorizedNextScopeAnchor: "AUTHORIZED_NEXT_SCOPE:",
    },
    claimBoundaryReference: {
      artifactId: ruling.artifactId,
      locator: "CLAIM_DISCIPLINE:",
    },
    contractArtifactIds: [contract.artifactId],
    controlDisposition: {
      implementedControlIds: [`domain${ordinal}.implemented`],
      locallyTestedControlIds: [`domain${ordinal}.tested`],
      deferredControlIds: [`domain${ordinal}.deferred`],
      unclaimedPropertyIds: [`domain${ordinal}.unclaimed`],
    },
    identityBindings: [],
  };
}

function obligations(): TrustPlaneOutstandingObligations {
  return {
    schemaVersion: 1,
    matrixId: "trust-plane.test.obligations",
    recordType: "trust_plane_outstanding_obligations",
    statusAsOf: "2026-07-31T00:00:00.000Z",
    scope: "local_runtime_and_trust_readiness",
    obligations: [
      "real_provider_receipt",
      "real_benchmark_custody",
      "research_protocol_numeric_freeze",
      "b0_b6_research_execution",
      "held_out_confirmatory_attribution",
      "research_candidate_selection_promotion",
      "performance_generalization_security_evolution_results",
    ].map((obligationId) => ({
      obligationId:
        obligationId as TrustPlaneOutstandingObligations["obligations"][number]["obligationId"],
      status: "unresolved" as const,
      evidencePresent: false as const,
      requiredEvidenceClass: `${obligationId}.evidence`,
      blocks: ["research_execution"],
    })),
    authorityState: {
      providerExecutionAuthorized: false,
      researchEvidenceAuthorized: false,
      candidateSelectionAuthorized: false,
      promotionAuthorized: false,
      deploymentAuthorized: false,
      claimAuthorityGranted: false,
    },
  };
}

async function fixture(): Promise<{
  readonly schemas: SchemaRegistry;
  readonly record: TrustPlaneConformanceManifest;
}> {
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const hfbDeviation = artifact("governance.hfb.deviation");
  const hfbClosure = artifact("governance.hfb.closure");
  const publicationDeviation = artifact(
    "governance.publication.deviation",
  );
  const publicationClosure = artifact(
    "governance.publication.closure",
  );
  const publicationSuperseding = artifact(
    "governance.publication.superseding",
  );
  const signer = deterministicPrincipal({
    principalId: "protocol.author.trust-plane.test",
    role: "protocol_author",
    implementationDigest: digest("c"),
    instanceId: "protocol.author.trust-plane.test.instance",
    seedByte: 201,
  });
  const record = createTrustPlaneConformanceManifest({
    signer,
    schemas,
    value: {
      manifestId: "trust-plane.conformance.test",
      scope: "local_runtime_and_trust_readiness",
      sourceSnapshot: {
        sourceCommit: commit("a"),
        sourceTree: commit("b"),
        remoteTrackingRef: "refs/remotes/origin/main",
        remoteCommit: commit("c"),
        additionalPushPerformed: false,
      },
      evidenceDomains: [
        domain("standalone_runtime_gate2r", 1),
        domain("development_process_separation", 2),
        domain(
          "publication_historical_exposure",
          3,
          [
            hfbDeviation,
            hfbClosure,
            publicationDeviation,
            publicationClosure,
            publicationSuperseding,
          ],
        ),
        domain("independent_authorship_vault_admission", 4),
        domain("durable_serialized_vault_state", 5),
        domain("eight_principal_vault_os_integration", 6),
        domain("synthetic_one_time_custody_recovery", 7),
      ],
      governanceChains: [
        {
          chainId: "hfb_structural_oracle_remediation",
          appendOnly: true,
          records: [
            {
              artifactId: hfbDeviation.artifactId,
              recordType: "governance_deviation",
              predecessorArtifactId: null,
              relationship: "root_deviation",
            },
            {
              artifactId: hfbClosure.artifactId,
              recordType: "governance_remediation_closure",
              predecessorArtifactId: hfbDeviation.artifactId,
              relationship: "append_only_closure",
            },
          ],
        },
        {
          chainId: "public_exposure_remediation",
          appendOnly: true,
          records: [
            {
              artifactId: publicationDeviation.artifactId,
              recordType: "publication_deviation",
              predecessorArtifactId: null,
              relationship: "root_deviation",
            },
            {
              artifactId: publicationClosure.artifactId,
              recordType: "publication_remediation_closure",
              predecessorArtifactId:
                publicationDeviation.artifactId,
              relationship: "append_only_closure",
            },
            {
              artifactId: publicationSuperseding.artifactId,
              recordType: "publication_superseding_closure",
              predecessorArtifactId:
                publicationClosure.artifactId,
              relationship:
                "append_only_superseding_closure",
            },
          ],
        },
      ],
      authorityState: obligations().authorityState,
      eligibilityState: {
        publicDevelopment: true,
        eligibleForHeldOut: false,
        eligibleForSealed: false,
        eligibleForTemporalHoldout: false,
        eligibleForGate: false,
        eligibleForFinal: false,
        confirmatory: false,
        authorizedForResearchEvidence: false,
        authorizedForPromotion: false,
      },
      statusDistinction: {
        implementedControlIds: ["status.test.implemented"],
        locallyTestedControlIds: ["status.test.tested"],
        deferredControlIds: ["status.test.deferred"],
        unclaimedPropertyIds: ["status.test.unclaimed"],
      },
      outstandingObligations: artifact(
        "trust-plane.test.outstanding",
      ),
      identityNamespacePolicy:
        "scope_qualified_no_cross_domain_equivalence",
      recordedAt: "2026-07-31T00:00:00.000Z",
    },
  });
  return { schemas, record };
}

describe("trust-plane conformance contracts", () => {
  test("the obligations matrix is exact and unresolved", async () => {
    const schemas = await SchemaRegistry.load(
      path.resolve("schemas"),
    );
    verifyTrustPlaneOutstandingObligations({
      record: obligations(),
      schemas,
    });
    const incomplete = obligations();
    await assert.rejects(
      async () => {
        verifyTrustPlaneOutstandingObligations({
          record: {
            ...incomplete,
            obligations: incomplete.obligations.slice(1),
          },
          schemas,
        });
      },
      /outstanding-obligations matrix is incomplete|must NOT have fewer/u,
    );
  });

  test("a protocol author signs every manifest field", async () => {
    const { record, schemas } = await fixture();
    verifyTrustPlaneConformanceManifest({
      record,
      schemas,
    });
    assert.throws(
      () =>
        verifyTrustPlaneConformanceManifest({
          record: {
            ...record,
            sourceSnapshot: {
              ...record.sourceSnapshot,
              sourceTree: commit("9"),
            },
          },
          schemas,
        }),
      /manifest hash mismatch/u,
    );
  });

  test("contradictory qualified identities are rejected", async () => {
    const { record, schemas } = await fixture();
    const first = record.evidenceDomains[0]!;
    const second = record.evidenceDomains[1]!;
    const identity = {
      scope: "scope.test",
      logicalName: "protocol",
      identityKind: "protocol" as const,
      value: digest("d"),
      artifactId: first.artifacts[0]!.artifactId,
      jsonPointer: "/protocolId",
    };
    const signer = deterministicPrincipal({
      principalId: "protocol.author.trust-plane.test.2",
      role: "protocol_author",
      implementationDigest: digest("e"),
      instanceId: "protocol.author.trust-plane.test.2.instance",
      seedByte: 202,
    });
    assert.throws(
      () =>
        createTrustPlaneConformanceManifest({
          signer,
          schemas,
          value: {
            manifestId: record.manifestId,
            scope: record.scope,
            sourceSnapshot: record.sourceSnapshot,
            evidenceDomains: record.evidenceDomains.map(
              (entry, index) =>
                index === 0
                  ? {
                      ...first,
                      identityBindings: [identity],
                    }
                  : index === 1
                    ? {
                        ...second,
                        identityBindings: [
                          {
                            ...identity,
                            value: digest("f"),
                            artifactId:
                              second.artifacts[0]!.artifactId,
                          },
                        ],
                      }
                    : entry,
            ),
            governanceChains: record.governanceChains,
            authorityState: record.authorityState,
            eligibilityState: record.eligibilityState,
            statusDistinction: record.statusDistinction,
            outstandingObligations:
              record.outstandingObligations,
            identityNamespacePolicy:
              record.identityNamespacePolicy,
            recordedAt: record.recordedAt,
          },
        }),
      /Contradictory identity binding/u,
    );
  });
});
