import {
  canonicalize,
  sha256,
  type JsonPrimitive,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";

export const TRUST_PLANE_CONFORMANCE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}trust-plane-conformance-manifest.schema.json`;
export const TRUST_PLANE_OUTSTANDING_OBLIGATIONS_SCHEMA_ID =
  `${SCHEMA_BASE_URL}trust-plane-outstanding-obligations.schema.json`;

export const TRUST_PLANE_DOMAIN_IDS = [
  "standalone_runtime_gate2r",
  "development_process_separation",
  "publication_historical_exposure",
  "independent_authorship_vault_admission",
  "durable_serialized_vault_state",
  "eight_principal_vault_os_integration",
  "synthetic_one_time_custody_recovery",
] as const;

export const TRUST_PLANE_OBLIGATION_IDS = [
  "real_provider_receipt",
  "real_benchmark_custody",
  "research_protocol_numeric_freeze",
  "b0_b6_research_execution",
  "held_out_confirmatory_attribution",
  "research_candidate_selection_promotion",
  "performance_generalization_security_evolution_results",
] as const;

export interface TrustPlaneAuthorityState {
  readonly providerExecutionAuthorized: false;
  readonly researchEvidenceAuthorized: false;
  readonly candidateSelectionAuthorized: false;
  readonly promotionAuthorized: false;
  readonly deploymentAuthorized: false;
  readonly claimAuthorityGranted: false;
}

export interface TrustPlaneEligibilityState {
  readonly publicDevelopment: true;
  readonly eligibleForHeldOut: false;
  readonly eligibleForSealed: false;
  readonly eligibleForTemporalHoldout: false;
  readonly eligibleForGate: false;
  readonly eligibleForFinal: false;
  readonly confirmatory: false;
  readonly authorizedForResearchEvidence: false;
  readonly authorizedForPromotion: false;
}

export interface TrustPlaneGitSource {
  readonly role: "primary" | "supporting" | "evidence" | "decision";
  readonly commit: string;
  readonly tree: string;
}

export interface TrustPlaneArtifactReference {
  readonly artifactId: string;
  readonly path: string;
  readonly sourceCommit: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType:
    | "application/json"
    | "text/markdown; charset=utf-8"
    | "text/typescript; charset=utf-8";
}

export interface TrustPlaneEvidenceAssertion {
  readonly artifactId: string;
  readonly jsonPointer: string;
  readonly equals: JsonPrimitive;
}

export interface TrustPlaneRulingReference {
  readonly artifactId: string;
  readonly decision: "APPROVE" | "REVISE";
  readonly acceptanceAnchors: readonly string[];
  readonly claimBoundaryAnchor: string;
  readonly authorizedNextScopeAnchor: string;
}

export interface TrustPlaneControlDisposition {
  readonly implementedControlIds: readonly string[];
  readonly locallyTestedControlIds: readonly string[];
  readonly deferredControlIds: readonly string[];
  readonly unclaimedPropertyIds: readonly string[];
}

export interface TrustPlaneIdentityBinding {
  readonly scope: string;
  readonly logicalName: string;
  readonly identityKind:
    | "protocol"
    | "contract"
    | "component_registry"
    | "evidence";
  readonly value: string;
  readonly artifactId: string;
  readonly jsonPointer: string;
}

export interface TrustPlaneEvidenceDomain {
  readonly domainId: (typeof TRUST_PLANE_DOMAIN_IDS)[number];
  readonly sourceCommits: readonly TrustPlaneGitSource[];
  readonly artifacts: readonly TrustPlaneArtifactReference[];
  readonly evidenceAssertions:
    readonly TrustPlaneEvidenceAssertion[];
  readonly ruling: TrustPlaneRulingReference;
  readonly claimBoundaryReference: {
    readonly artifactId: string;
    readonly locator: string;
  };
  readonly contractArtifactIds: readonly string[];
  readonly controlDisposition: TrustPlaneControlDisposition;
  readonly identityBindings:
    readonly TrustPlaneIdentityBinding[];
}

export interface TrustPlaneGovernanceChain {
  readonly chainId:
    | "hfb_structural_oracle_remediation"
    | "public_exposure_remediation";
  readonly appendOnly: true;
  readonly records: readonly {
    readonly artifactId: string;
    readonly recordType: string;
    readonly predecessorArtifactId: string | null;
    readonly relationship:
      | "root_deviation"
      | "append_only_closure"
      | "append_only_superseding_closure";
  }[];
}

export interface TrustPlaneOutstandingObligations {
  readonly schemaVersion: 1;
  readonly matrixId: string;
  readonly recordType: "trust_plane_outstanding_obligations";
  readonly statusAsOf: string;
  readonly scope: "local_runtime_and_trust_readiness";
  readonly obligations: readonly {
    readonly obligationId:
      (typeof TRUST_PLANE_OBLIGATION_IDS)[number];
    readonly status: "unresolved";
    readonly evidencePresent: false;
    readonly requiredEvidenceClass: string;
    readonly blocks: readonly string[];
  }[];
  readonly authorityState: TrustPlaneAuthorityState;
}

export interface TrustPlaneConformanceManifest {
  readonly schemaVersion: 1;
  readonly manifestId: string;
  readonly recordType: "trust_plane_conformance_manifest";
  readonly scope: "local_runtime_and_trust_readiness";
  readonly sourceSnapshot: {
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly remoteTrackingRef: "refs/remotes/origin/main";
    readonly remoteCommit: string;
    readonly additionalPushPerformed: false;
  };
  readonly evidenceDomains: readonly TrustPlaneEvidenceDomain[];
  readonly governanceChains:
    readonly TrustPlaneGovernanceChain[];
  readonly authorityState: TrustPlaneAuthorityState;
  readonly eligibilityState: TrustPlaneEligibilityState;
  readonly statusDistinction: TrustPlaneControlDisposition;
  readonly outstandingObligations:
    TrustPlaneArtifactReference;
  readonly identityNamespacePolicy:
    "scope_qualified_no_cross_domain_equivalence";
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly manifestHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedTrustPlaneConformanceManifest = Omit<
  TrustPlaneConformanceManifest,
  | "schemaVersion"
  | "recordType"
  | "recordedBy"
  | "manifestHash"
  | "publicPrincipal"
  | "attestation"
>;

type ManifestCore = Omit<
  TrustPlaneConformanceManifest,
  "manifestHash" | "publicPrincipal" | "attestation"
>;
type ManifestSignedBody = Omit<
  TrustPlaneConformanceManifest,
  "attestation"
>;

function manifestCore(
  record: TrustPlaneConformanceManifest,
): ManifestCore {
  const {
    manifestHash: _manifestHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function signedBody(
  record: TrustPlaneConformanceManifest,
): ManifestSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function assertUnique(
  values: readonly string[],
  label: string,
): void {
  assertCondition(
    values.length === new Set(values).size,
    "SCHEMA_INVALID",
    `${label} must be unique`,
  );
}

function validateInternalReferences(
  record: TrustPlaneConformanceManifest,
): void {
  assertUnique(
    record.evidenceDomains.map((entry) => entry.domainId),
    "Trust-plane domain IDs",
  );
  assertCondition(
    canonicalize(
      [...record.evidenceDomains.map((entry) => entry.domainId)].sort(),
    ) === canonicalize([...TRUST_PLANE_DOMAIN_IDS].sort()),
    "SCHEMA_INVALID",
    "Trust-plane manifest does not contain the exact required domains",
  );

  const artifacts = new Map<
    string,
    TrustPlaneArtifactReference
  >();
  for (const domain of record.evidenceDomains) {
    assertUnique(
      domain.sourceCommits.map(
        (entry) => `${entry.role}:${entry.commit}`,
      ),
      `${domain.domainId} source commits`,
    );
    assertUnique(
      domain.artifacts.map((entry) => entry.artifactId),
      `${domain.domainId} artifact IDs`,
    );
    for (const artifact of domain.artifacts) {
      assertCondition(
        !artifacts.has(artifact.artifactId),
        "SCHEMA_INVALID",
        `Duplicate trust-plane artifact ${artifact.artifactId}`,
      );
      artifacts.set(artifact.artifactId, artifact);
    }
  }
  assertCondition(
    !artifacts.has(record.outstandingObligations.artifactId),
    "SCHEMA_INVALID",
    "Outstanding-obligations artifact ID collides with evidence",
  );
  artifacts.set(
    record.outstandingObligations.artifactId,
    record.outstandingObligations,
  );

  const identityValues = new Map<string, string>();
  for (const domain of record.evidenceDomains) {
    const referenced = new Set(
      domain.artifacts.map((entry) => entry.artifactId),
    );
    for (const assertion of domain.evidenceAssertions) {
      assertCondition(
        referenced.has(assertion.artifactId),
        "SCHEMA_INVALID",
        `Evidence assertion references an absent artifact ${assertion.artifactId}`,
      );
    }
    assertCondition(
      referenced.has(domain.ruling.artifactId) &&
        referenced.has(
          domain.claimBoundaryReference.artifactId,
        ),
      "SCHEMA_INVALID",
      `${domain.domainId} ruling or claim-boundary artifact is absent`,
    );
    for (const contractId of domain.contractArtifactIds) {
      assertCondition(
        referenced.has(contractId),
        "SCHEMA_INVALID",
        `${domain.domainId} contract artifact ${contractId} is absent`,
      );
    }
    for (const binding of domain.identityBindings) {
      assertCondition(
        referenced.has(binding.artifactId),
        "SCHEMA_INVALID",
        `Identity binding references an absent artifact ${binding.artifactId}`,
      );
      const key = `${binding.scope}\0${binding.logicalName}`;
      const prior = identityValues.get(key);
      assertCondition(
        prior === undefined || prior === binding.value,
        "CONFLICT",
        `Contradictory identity binding ${binding.scope}/${binding.logicalName}`,
      );
      identityValues.set(key, binding.value);
    }
  }

  assertUnique(
    record.governanceChains.map((entry) => entry.chainId),
    "Trust-plane governance-chain IDs",
  );
  for (const chain of record.governanceChains) {
    assertCondition(
      chain.records[0]?.relationship === "root_deviation" &&
        chain.records[0].predecessorArtifactId === null,
      "INVALID_STATE_TRANSITION",
      `${chain.chainId} must begin with an unmodified deviation`,
    );
    for (let index = 0; index < chain.records.length; index += 1) {
      const entry = chain.records[index]!;
      assertCondition(
        artifacts.has(entry.artifactId),
        "SCHEMA_INVALID",
        `${chain.chainId} references absent ${entry.artifactId}`,
      );
      if (index > 0) {
        assertCondition(
          entry.predecessorArtifactId ===
            chain.records[index - 1]!.artifactId,
          "INVALID_STATE_TRANSITION",
          `${chain.chainId} is not append-only`,
        );
      }
    }
  }

  const statusBuckets = [
    record.statusDistinction.implementedControlIds,
    record.statusDistinction.locallyTestedControlIds,
    record.statusDistinction.deferredControlIds,
    record.statusDistinction.unclaimedPropertyIds,
  ];
  const allStatuses = statusBuckets.flat();
  assertUnique(allStatuses, "Trust-plane status identifiers");
}

export function createTrustPlaneConformanceManifest(input: {
  readonly value: UnsignedTrustPlaneConformanceManifest;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): TrustPlaneConformanceManifest {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Only a protocol author may sign the conformance manifest",
  );
  const core: ManifestCore = {
    schemaVersion: 1,
    manifestId: input.value.manifestId,
    recordType: "trust_plane_conformance_manifest",
    scope: input.value.scope,
    sourceSnapshot: input.value.sourceSnapshot,
    evidenceDomains: input.value.evidenceDomains,
    governanceChains: input.value.governanceChains,
    authorityState: input.value.authorityState,
    eligibilityState: input.value.eligibilityState,
    statusDistinction: input.value.statusDistinction,
    outstandingObligations:
      input.value.outstandingObligations,
    identityNamespacePolicy:
      input.value.identityNamespacePolicy,
    recordedAt: input.value.recordedAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: ManifestSignedBody = {
    ...core,
    manifestHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: TrustPlaneConformanceManifest = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyTrustPlaneConformanceManifest({
    record,
    schemas: input.schemas,
  });
  return record;
}

export function verifyTrustPlaneOutstandingObligations(input: {
  readonly record: TrustPlaneOutstandingObligations;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    TRUST_PLANE_OUTSTANDING_OBLIGATIONS_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertUnique(
    input.record.obligations.map(
      (entry) => entry.obligationId,
    ),
    "Outstanding obligation IDs",
  );
  assertCondition(
    canonicalize(
      input.record.obligations
        .map((entry) => entry.obligationId)
        .sort(),
    ) === canonicalize([...TRUST_PLANE_OBLIGATION_IDS].sort()),
    "SCHEMA_INVALID",
    "Outstanding-obligations matrix is incomplete",
  );
}

export function verifyTrustPlaneConformanceManifest(input: {
  readonly record: TrustPlaneConformanceManifest;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    TRUST_PLANE_CONFORMANCE_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.recordedBy.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Conformance manifest signer is not a protocol author",
  );
  assertCondition(
    canonicalize(input.record.recordedBy) ===
      canonicalize(input.record.publicPrincipal.identity),
    "AUTHENTICATION_FAILED",
    "Conformance signer identity does not match its public key",
  );
  assertCondition(
    input.record.manifestHash ===
      sha256(manifestCore(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Conformance manifest hash mismatch",
  );
  validateInternalReferences(input.record);
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    signedBody(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
}
