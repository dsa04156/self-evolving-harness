import {
  canonicalize,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type { DevelopmentClaimBoundary } from "../evaluation/development-attribution.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";

export const DEVELOPMENT_ARTIFACT_QUARANTINE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-artifact-quarantine.schema.json`;

export const DEVELOPMENT_ARTIFACT_ALLOWED_USE_CLASSES = [
  "development_attribution_prototype",
  "development_diagnostic_scoring",
  "development_mutation_dry_run",
  "development_external_evaluation",
  "governance_audit",
] as const;

export const DEVELOPMENT_ARTIFACT_PROHIBITED_USE_CLASSES = [
  "research_protocol_manifest",
  "attribution_gate",
  "research_threshold",
  "research_candidate_selection",
  "promotion_decision",
  "canary",
  "deployment",
  "production_pointer",
  "claim_table",
  "research_evidence",
] as const;

export type DevelopmentArtifactUseClass =
  | (typeof DEVELOPMENT_ARTIFACT_ALLOWED_USE_CLASSES)[number]
  | (typeof DEVELOPMENT_ARTIFACT_PROHIBITED_USE_CLASSES)[number];

export interface DevelopmentArtifactReference {
  readonly artifactId: string;
  readonly artifactKind:
    | "prototype_manifest"
    | "prediction_set"
    | "prediction_commitment"
    | "oracle_access_event"
    | "development_score_report"
    | "mutation_dry_run"
    | "parent_harness"
    | "candidate_harness"
    | "component_manifest"
    | "component_payload"
    | "non_promotable_record"
    | "evaluator_request"
    | "evaluator_result"
    | "development_evidence";
  readonly contentHash: string;
  readonly path: string | null;
}

export interface DevelopmentArtifactQuarantineRecord {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly recordType:
    "development_artifact_quarantine";
  readonly authorizationDecisionHash: string;
  readonly artifacts: readonly DevelopmentArtifactReference[];
  readonly allowedUseClasses:
    typeof DEVELOPMENT_ARTIFACT_ALLOWED_USE_CLASSES;
  readonly prohibitedUseClasses:
    typeof DEVELOPMENT_ARTIFACT_PROHIBITED_USE_CLASSES;
  readonly claimBoundary: DevelopmentClaimBoundary;
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type RecordCore = Omit<
  DevelopmentArtifactQuarantineRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type SignedBody = Omit<
  DevelopmentArtifactQuarantineRecord,
  "attestation"
>;

const CLAIM_BOUNDARY: DevelopmentClaimBoundary = {
  developmentOnly: true,
  confirmatory: false,
  publicVisibleFixtures: true,
  authorizedForResearchEvidence: false,
  attributionPerformanceClaim: false,
};

function coreOf(
  record: DevelopmentArtifactQuarantineRecord,
): RecordCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function signedBodyOf(
  record: DevelopmentArtifactQuarantineRecord,
): SignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createDevelopmentArtifactQuarantine(input: {
  readonly recordId: string;
  readonly authorizationDecisionHash: string;
  readonly artifacts: readonly DevelopmentArtifactReference[];
  readonly recordedAt: string;
  readonly signer: PrincipalSigner;
}): DevelopmentArtifactQuarantineRecord {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Only protocol author may quarantine development artifacts",
  );
  assertCondition(
    input.artifacts.length > 0,
    "SCHEMA_INVALID",
    "Development quarantine requires artifacts",
  );
  const artifacts = [...input.artifacts].sort(
    (left, right) =>
      left.artifactId.localeCompare(right.artifactId) ||
      left.contentHash.localeCompare(right.contentHash),
  );
  const core: RecordCore = {
    schemaVersion: 1,
    recordId: input.recordId,
    recordType: "development_artifact_quarantine",
    authorizationDecisionHash:
      input.authorizationDecisionHash,
    artifacts,
    allowedUseClasses:
      DEVELOPMENT_ARTIFACT_ALLOWED_USE_CLASSES,
    prohibitedUseClasses:
      DEVELOPMENT_ARTIFACT_PROHIBITED_USE_CLASSES,
    claimBoundary: CLAIM_BOUNDARY,
    recordedAt: input.recordedAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: SignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  return {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
}

export function verifyDevelopmentArtifactQuarantine(input: {
  readonly record: DevelopmentArtifactQuarantineRecord;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_ARTIFACT_QUARANTINE_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.recordedBy.role === "protocol_author" &&
      canonicalize(input.record.publicPrincipal.identity) ===
        canonicalize(input.record.recordedBy),
    "AUTHORIZATION_DENIED",
    "Development quarantine is not signed by protocol author",
  );
  assertCondition(
    canonicalize(input.record.allowedUseClasses) ===
      canonicalize(
        DEVELOPMENT_ARTIFACT_ALLOWED_USE_CLASSES,
      ) &&
      canonicalize(input.record.prohibitedUseClasses) ===
        canonicalize(
          DEVELOPMENT_ARTIFACT_PROHIBITED_USE_CLASSES,
        ) &&
      input.record.recordHash ===
        sha256(coreOf(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Development artifact quarantine changed",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    signedBodyOf(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
}

export class DevelopmentArtifactQuarantinePolicy {
  readonly #record: DevelopmentArtifactQuarantineRecord;
  readonly #blocked = new Set<string>();

  public constructor(input: {
    readonly record: DevelopmentArtifactQuarantineRecord;
    readonly schemas: SchemaRegistry;
  }) {
    verifyDevelopmentArtifactQuarantine(input);
    this.#record = input.record;
    for (const artifact of input.record.artifacts) {
      this.#blocked.add(artifact.contentHash);
    }
  }

  public assertReferencesAllowed(input: {
    readonly useClass: DevelopmentArtifactUseClass;
    readonly references: readonly string[];
  }): void {
    const touchesQuarantine = input.references.some(
      (reference) => this.#blocked.has(reference),
    );
    if (!touchesQuarantine) return;
    assertCondition(
      this.#record.allowedUseClasses.includes(
        input.useClass as
          (typeof DEVELOPMENT_ARTIFACT_ALLOWED_USE_CLASSES)[number],
      ),
      "AUTHORIZATION_DENIED",
      `Development-only artifacts cannot be used for ${input.useClass}`,
    );
  }
}
