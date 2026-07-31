import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { describe, test } from "node:test";
import path from "node:path";

import {
  SchemaRegistry,
  canonicalize,
  createTrustPlaneConformanceManifest,
  parseStrictJson,
  sha256,
  verifyTrustPlaneAggregate,
  verifyTrustPlaneConformanceManifest,
  verifyTrustPlaneOutstandingObligations,
  type JsonValue,
  type TrustPlaneArtifactReference,
  type TrustPlaneConformanceManifest,
  type TrustPlaneControlLineage,
  type TrustPlaneEvidenceDomain,
  type TrustPlaneOutstandingObligations,
  type UnsignedTrustPlaneConformanceManifest,
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
    canonicalControlBindings:
      domainId ===
      "independent_authorship_vault_admission"
        ? [
            {
              controlId: "control.reviewer_blinding",
              evidenceRole: "historical",
            },
          ]
        : domainId ===
            "eight_principal_vault_os_integration"
          ? [
              {
                controlId: "control.reviewer_blinding",
                evidenceRole: "current",
              },
            ]
          : [],
  };
}

function reviewerBlindingLineage(): TrustPlaneControlLineage {
  return {
    lineageVersion: 1,
    controlId: "control.reviewer_blinding",
    domainIds: [
      "independent_authorship_vault_admission",
      "eight_principal_vault_os_integration",
    ],
    stages: [
      {
        stageId: "reviewer_blinding.introduced",
        sequence: 1,
        eventType: "implementation_introduced",
        disposition: "historical",
        artifactIds: ["domain4.contract"],
        predecessorStageId: null,
      },
      {
        stageId: "reviewer_blinding.defect_discovered",
        sequence: 2,
        eventType: "defect_discovered",
        disposition: "historical",
        artifactIds: ["domain6.ruling"],
        predecessorStageId: "reviewer_blinding.introduced",
      },
      {
        stageId: "reviewer_blinding.superseded",
        sequence: 3,
        eventType: "implementation_superseded",
        disposition: "superseded",
        artifactIds: ["domain4.contract"],
        predecessorStageId:
          "reviewer_blinding.defect_discovered",
      },
      {
        stageId: "reviewer_blinding.correcting",
        sequence: 4,
        eventType: "correcting_implementation",
        disposition: "historical",
        artifactIds: ["domain6.contract"],
        predecessorStageId: "reviewer_blinding.superseded",
      },
      {
        stageId: "reviewer_blinding.approved",
        sequence: 5,
        eventType: "approving_ruling",
        disposition: "historical",
        artifactIds: ["domain6.ruling"],
        predecessorStageId: "reviewer_blinding.correcting",
      },
      {
        stageId: "reviewer_blinding.current",
        sequence: 6,
        eventType: "current_implementation",
        disposition: "current",
        artifactIds: ["domain6.contract"],
        predecessorStageId: "reviewer_blinding.approved",
      },
    ],
    currentStageId: "reviewer_blinding.current",
    statusBindings: {
      implementedControlId: "status.test.implemented",
      locallyTestedControlId: "status.test.tested",
      derivedFromStageId: "reviewer_blinding.current",
    },
    behaviorProof: {
      defectDiscoveryArtifactId: "domain6.ruling",
      correctionSourceArtifactId: "domain6.contract",
      correctionWorkerArtifactId: "domain6.contract",
      approvingRulingArtifactId: "domain6.ruling",
      baselineCurrentSourceArtifactId: "domain6.contract",
      baselineCurrentWorkerArtifactId: "domain6.contract",
      snapshotCurrentSourceArtifactId: "domain6.contract",
      snapshotCurrentWorkerArtifactId: "domain6.contract",
      evidenceArtifactId: "domain6.contract",
      authorIdentityPresentPointer: "/reviewer/author",
      rawTaskHandlePresentPointer: "/reviewer/task",
      privateKeyPresentPointer: "/reviewer/key",
      inputFilesPointer: "/reviewer/files",
      expectedInputFiles: ["reviewer-projection.json"],
      requiredProjectionSourceMarkers: ["projection"],
      requiredWorkerSourceMarkers: ["worker"],
    },
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
      controlLineages: [reviewerBlindingLineage()],
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

async function resign(
  input: TrustPlaneConformanceManifest,
  schemas: SchemaRegistry,
  mutate: (
    value: UnsignedTrustPlaneConformanceManifest,
  ) => UnsignedTrustPlaneConformanceManifest,
): Promise<TrustPlaneConformanceManifest> {
  const signer = deterministicPrincipal({
    principalId: "protocol.author.aggregate-tamper.test",
    role: "protocol_author",
    implementationDigest: digest("7"),
    instanceId:
      "protocol.author.aggregate-tamper.test.instance",
    seedByte: 203,
  });
  const value = mutate({
    manifestId: input.manifestId,
    scope: input.scope,
    sourceSnapshot: input.sourceSnapshot,
    evidenceDomains: input.evidenceDomains,
    controlLineages: input.controlLineages,
    governanceChains: input.governanceChains,
    authorityState: input.authorityState,
    eligibilityState: input.eligibilityState,
    statusDistinction: input.statusDistinction,
    outstandingObligations: input.outstandingObligations,
    identityNamespacePolicy: input.identityNamespacePolicy,
    recordedAt: input.recordedAt,
  });
  const core = {
    schemaVersion: 2 as const,
    ...value,
    recordType: "trust_plane_conformance_manifest" as const,
    recordedBy: signer.identity,
  };
  const body = {
    ...core,
    manifestHash: sha256(core as unknown as JsonValue),
    publicPrincipal: signer.exportPublic(),
  };
  const record = {
    ...body,
    attestation: signer.attest(body as unknown as JsonValue),
  };
  schemas.validate(
    "https://self-evolving-harness.local/schemas/trust-plane-conformance-manifest.schema.json",
    record as unknown as JsonValue,
  );
  return record;
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
            controlLineages: record.controlLineages,
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

test("independent aggregate verification rejects validly re-signed nested drift", async (t) => {
  const manifestPath =
    "governance/trust-plane/conformance-manifest.json";
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const manifest = parseStrictJson(
    await readFile(manifestPath, "utf8"),
  ) as unknown as TrustPlaneConformanceManifest;
  const verified = await verifyTrustPlaneAggregate({
    repositoryRoot: process.cwd(),
    manifestPath,
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.authoritiesGranted, 0);
  assert.equal(verified.domainCount, 7);

  const temporaryRoot = await mkdtemp(
    path.resolve(".trust-plane-aggregate-test-"),
  );
  t.after(async () => {
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  });
  const writeTamper = async (
    name: string,
    value: TrustPlaneConformanceManifest,
  ): Promise<string> => {
    const target = path.join(temporaryRoot, `${name}.json`);
    await writeFile(
      target,
      `${canonicalize(value as unknown as JsonValue)}\n`,
      "utf8",
    );
    return path.relative(process.cwd(), target);
  };

  const hashDrift = await resign(
    manifest,
    schemas,
    (value) => ({
      ...value,
      evidenceDomains: value.evidenceDomains.map(
        (domain, index) =>
          index === 0
            ? {
                ...domain,
                artifacts: domain.artifacts.map(
                  (artifactValue, artifactIndex) =>
                    artifactIndex === 0
                      ? {
                          ...artifactValue,
                          sha256: digest("0"),
                        }
                      : artifactValue,
                ),
              }
            : domain,
      ),
    }),
  );
  await assert.rejects(
    verifyTrustPlaneAggregate({
      repositoryRoot: process.cwd(),
      manifestPath: await writeTamper(
        "artifact-hash",
        hashDrift,
      ),
    }),
    /content hash mismatch/u,
  );

  const rulingDrift = await resign(
    manifest,
    schemas,
    (value) => ({
      ...value,
      evidenceDomains: value.evidenceDomains.map(
        (domain, index) =>
          index === 0
            ? {
                ...domain,
                ruling: {
                  ...domain.ruling,
                  decision: "REVISE",
                },
              }
            : domain,
      ),
    }),
  );
  await assert.rejects(
    verifyTrustPlaneAggregate({
      repositoryRoot: process.cwd(),
      manifestPath: await writeTamper(
        "ruling-decision",
        rulingDrift,
      ),
    }),
    /ruling decision mismatch/u,
  );

  const chainTypeDrift = await resign(
    manifest,
    schemas,
    (value) => ({
      ...value,
      governanceChains: value.governanceChains.map(
        (chain, index) =>
          index === 0
            ? {
                ...chain,
                records: chain.records.map(
                  (record, recordIndex) =>
                    recordIndex === 1
                      ? {
                          ...record,
                          recordType:
                            "publication_remediation_closure",
                        }
                      : record,
                ),
              }
            : chain,
      ),
    }),
  );
  await assert.rejects(
    verifyTrustPlaneAggregate({
      repositoryRoot: process.cwd(),
      manifestPath: await writeTamper(
        "governance-type",
        chainTypeDrift,
      ),
    }),
    /record type mismatch/u,
  );

  const packetManifest =
    manifest.evidenceDomains[0]!.artifacts.find(
      (entry) =>
        entry.artifactId === "gate2r.packet_manifest",
    );
  assert.ok(packetManifest);
  const obligationDrift = await resign(
    manifest,
    schemas,
    (value) => ({
      ...value,
      outstandingObligations: {
        ...packetManifest,
        artifactId: "trust_plane.outstanding_obligations",
      },
    }),
  );
  await assert.rejects(
    verifyTrustPlaneAggregate({
      repositoryRoot: process.cwd(),
      manifestPath: await writeTamper(
        "obligation-source",
        obligationDrift,
      ),
    }),
    /SCHEMA_INVALID|schema|must have required property|must be equal/u,
  );

  const preProjectionAsCurrent = await resign(
    manifest,
    schemas,
    (value) => ({
      ...value,
      controlLineages: value.controlLineages.map(
        (lineage) => ({
          ...lineage,
          stages: lineage.stages.map((stage) =>
            stage.stageId === "reviewer_blinding.current"
              ? {
                  ...stage,
                  artifactIds: ["authorship.transition_source"],
                }
              : stage,
          ),
        }),
      ),
    }),
  );
  await assert.rejects(
    verifyTrustPlaneAggregate({
      repositoryRoot: process.cwd(),
      manifestPath: await writeTamper(
        "pre-projection-as-current",
        preProjectionAsCurrent,
      ),
    }),
    /reviewer_blinding\.current artifacts differs/u,
  );

  const withoutStage = async (
    stageId: string,
    name: string,
  ): Promise<void> => {
    const tampered = await resign(
      manifest,
      schemas,
      (value) => ({
        ...value,
        controlLineages: value.controlLineages.map(
          (lineage) => {
            const stages = lineage.stages
              .filter((stage) => stage.stageId !== stageId)
              .map((stage, index, retained) => ({
                ...stage,
                sequence: index + 1,
                predecessorStageId:
                  index === 0
                    ? null
                    : retained[index - 1]!.stageId,
              }));
            return {
              ...lineage,
              stages,
            };
          },
        ),
      }),
    );
    await assert.rejects(
      verifyTrustPlaneAggregate({
        repositoryRoot: process.cwd(),
        manifestPath: await writeTamper(name, tampered),
      }),
      /incomplete event chain/u,
    );
  };
  await withoutStage(
    "reviewer_blinding.correcting",
    "missing-correction",
  );
  await withoutStage(
    "reviewer_blinding.approved",
    "missing-approval",
  );

  const unconnectedSharedControl = await resign(
    manifest,
    schemas,
    (value) => ({
      ...value,
      controlLineages: value.controlLineages.map(
        (lineage) => ({
          ...lineage,
          domainIds: [
            "eight_principal_vault_os_integration",
          ],
        }),
      ),
    }),
  );
  await assert.rejects(
    verifyTrustPlaneAggregate({
      repositoryRoot: process.cwd(),
      manifestPath: await writeTamper(
        "unconnected-shared-control",
        unconnectedSharedControl,
      ),
    }),
    /reviewer-blinding lineage domains differs/u,
  );

  const supersededStatusSource = await resign(
    manifest,
    schemas,
    (value) => ({
      ...value,
      controlLineages: value.controlLineages.map(
        (lineage) => ({
          ...lineage,
          statusBindings: {
            ...lineage.statusBindings,
            derivedFromStageId:
              "reviewer_blinding.superseded",
          },
        }),
      ),
    }),
  );
  await assert.rejects(
    verifyTrustPlaneAggregate({
      repositoryRoot: process.cwd(),
      manifestPath: await writeTamper(
        "superseded-status-source",
        supersededStatusSource,
      ),
    }),
    /statuses do not derive from the current implementation/u,
  );

  const preProjectionProofBinding = await resign(
    manifest,
    schemas,
    (value) => ({
      ...value,
      controlLineages: value.controlLineages.map(
        (lineage) => ({
          ...lineage,
          behaviorProof: {
            ...lineage.behaviorProof,
            snapshotCurrentSourceArtifactId:
              "authorship.transition_source",
          },
        }),
      ),
    }),
  );
  await assert.rejects(
    verifyTrustPlaneAggregate({
      repositoryRoot: process.cwd(),
      manifestPath: await writeTamper(
        "pre-projection-proof-binding",
        preProjectionProofBinding,
      ),
    }),
    /behavior proof binding differs/u,
  );
});
