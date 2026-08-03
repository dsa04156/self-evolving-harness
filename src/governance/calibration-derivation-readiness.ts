import {
  canonicalize,
  contentId,
  sha256,
  sha256Bytes,
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
import {
  CALIBRATION_AUTHORITY_STATE,
  CALIBRATION_ELIGIBILITY_STATE,
  CALIBRATION_NUMERIC_GRAPH,
  CALIBRATION_ZERO_BUDGET,
} from "./calibration-contract.js";
import {
  CALIBRATION_CAP_CANDIDATE_MAX,
  CALIBRATION_DERIVATION_PROGRAM_SPECIFICATIONS,
  CALIBRATION_MARGIN_CANDIDATE_MAX,
  CALIBRATION_MCSE_MAX_BASIS_POINTS,
  CALIBRATION_ONE_SIDED_CONFIDENCE_BASIS_POINTS,
  CALIBRATION_POWER_MIN_BASIS_POINTS,
  CALIBRATION_RETENTION_MIN_BASIS_POINTS,
  CALIBRATION_ROLLOUT_COUNT_CANDIDATES,
  CALIBRATION_SEED_STREAM_DOMAIN,
  CALIBRATION_SEED_STREAM_ORDERING,
  CALIBRATION_SEED_VARIANCE_MAX_BASIS_POINTS,
  CALIBRATION_SYNTHETIC_RESULT_MARKING,
  CALIBRATION_WILSON_Z_MICROS,
  type CalibrationDerivationTarget,
  type SyntheticCalibrationDerivationResult,
} from "./calibration-derivation-programs.js";
import type { CalibrationDerivationSyntheticVector } from "./calibration-derivation-synthetic-vectors.js";

export const CALIBRATION_DERIVATION_READINESS_SCHEMA_ID =
  `${SCHEMA_BASE_URL}calibration-derivation-readiness.schema.json`;
export const CALIBRATION_DERIVATION_READINESS_PATH =
  "governance/gate3/calibration-derivation-program-readiness.json";
export const CALIBRATION_DERIVATION_READINESS_AUDIT_PATH =
  "governance/gate3/calibration-derivation-program-readiness-audit-receipt.json";

export type CalibrationDerivationReadinessMediaType =
  | "application/json"
  | "text/markdown; charset=utf-8"
  | "text/typescript; charset=utf-8";

export interface CalibrationDerivationReadinessArtifactReference {
  readonly artifactId: string;
  readonly path: string;
  readonly sourceCommit: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: CalibrationDerivationReadinessMediaType;
}

export const CALIBRATION_DERIVATION_READINESS_ARTIFACT_SPECS = [
  {
    artifactId: "numeric_freeze_entry",
    path: "governance/gate3/research-protocol-numeric-freeze-entry.json",
    mediaType: "application/json",
  },
  {
    artifactId: "calibration_contract",
    path: "governance/gate3/calibration-contract-preregistration.json",
    mediaType: "application/json",
  },
  {
    artifactId: "calibration_contract_receipt",
    path: "governance/gate3/calibration-contract-preregistration-audit-receipt.json",
    mediaType: "application/json",
  },
  {
    artifactId: "conformance_manifest",
    path: "governance/trust-plane/conformance-manifest.json",
    mediaType: "application/json",
  },
  {
    artifactId: "outstanding_obligations",
    path: "governance/trust-plane/outstanding-obligations.json",
    mediaType: "application/json",
  },
  {
    artifactId: "common_schema",
    path: "schemas/common.schema.json",
    mediaType: "application/json",
  },
  {
    artifactId: "readiness_schema",
    path: "schemas/calibration-derivation-readiness.schema.json",
    mediaType: "application/json",
  },
  {
    artifactId: "derivation_programs_source",
    path: "src/governance/calibration-derivation-programs.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "synthetic_vectors_source",
    path: "src/governance/calibration-derivation-synthetic-vectors.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "readiness_model_source",
    path: "src/governance/calibration-derivation-readiness.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "readiness_verifier_source",
    path: "src/governance/calibration-derivation-readiness-verifier.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "readiness_generator_source",
    path: "scripts/create-calibration-derivation-readiness.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "readiness_verify_script",
    path: "scripts/verify-calibration-derivation-readiness.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "derivation_program_tests",
    path: "test/calibration-derivation-programs.test.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "readiness_tests",
    path: "test/calibration-derivation-readiness.test.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "readiness_documentation",
    path: "docs/evaluation/calibration-derivation-program-readiness.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "principal_identity_source",
    path: "src/trust/identity.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "public_api_source",
    path: "src/index.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "package_manifest",
    path: "package.json",
    mediaType: "application/json",
  },
] as const satisfies readonly {
  readonly artifactId: string;
  readonly path: string;
  readonly mediaType: CalibrationDerivationReadinessMediaType;
}[];

export const CALIBRATION_DERIVATION_GRID_CONTRACT = {
  protocolCandidateValuesChosen: false,
  protocolCandidateValues: [],
  implicitOrHiddenDefaultsAllowed: false,
  postResultGridModificationAllowed: false,
  capGrid: {
    targets: ["F", "G"],
    candidateMaximum: CALIBRATION_CAP_CANDIDATE_MAX,
    candidateFields: ["candidateId", "cap", "strata"],
    stratumFields: [
      "stratumId",
      "observations",
      "adverseEvents",
      "missingUsageCount",
      "missingUsageChargedAtReservationCount",
      "infrastructureIncidentCount",
    ],
    ordering: "strict_cap_ascending",
    duplicatesAllowed: false,
  },
  rolloutGrid: {
    target: "K",
    candidateValues: [...CALIBRATION_ROLLOUT_COUNT_CANDIDATES],
    candidateFields: [
      "rolloutCount",
      "taskCount",
      "mcseBasisPoints",
      "seedVarianceShareBasisPoints",
      "missingObservationCount",
      "infrastructureIncidentCount",
    ],
    ordering: "exact_2_3_5_8",
    duplicatesAllowed: false,
  },
  marginGrid: {
    target: "M",
    candidateMaximum: CALIBRATION_MARGIN_CANDIDATE_MAX,
    candidateFields: [
      "candidateId",
      "allowedLossBasisPoints",
      "powerBasisPoints",
      "retentionBasisPoints",
      "missingObservationCount",
      "infrastructureIncidentCount",
    ],
    ordering: "strictest_smallest_allowed_loss_first",
    duplicatesAllowed: false,
  },
} as const;

export const CALIBRATION_DERIVATION_ESTIMATOR_CONTRACT = {
  failureEstimator: {
    identity:
      "wilson_one_sided_upper_bound.v1.z_1644854_micros.ceil_probability_micros",
    confidenceBasisPoints:
      CALIBRATION_ONE_SIDED_CONFIDENCE_BASIS_POINTS,
    zMicros: CALIBRATION_WILSON_Z_MICROS,
    acceptedUpperBoundProbabilityMicros: 10_000,
    boundRounding: "upward_to_probability_micros",
  },
  resourceRounding: "upward_to_declared_positive_integer_quantum",
  costRounding:
    "each_input_and_output_token_component_upward_to_integer_micro_then_sum",
  rolloutThresholds: {
    mcseMaximumBasisPoints: CALIBRATION_MCSE_MAX_BASIS_POINTS,
    seedVarianceShareMaximumBasisPoints:
      CALIBRATION_SEED_VARIANCE_MAX_BASIS_POINTS,
  },
  seedStream: {
    digest: "SHA-256",
    domain: CALIBRATION_SEED_STREAM_DOMAIN,
    ordering: CALIBRATION_SEED_STREAM_ORDERING,
    output: "full_32_byte_lowercase_hex",
  },
  marginThresholds: {
    powerMinimumBasisPoints: CALIBRATION_POWER_MIN_BASIS_POINTS,
    retentionMinimumBasisPoints: CALIBRATION_RETENTION_MIN_BASIS_POINTS,
    strictness: "smaller_allowed_loss_is_stricter",
    safetyMarginBasisPoints: 0,
  },
} as const;

export const CALIBRATION_DERIVATION_SYNTHETIC_INPUT_POLICY = {
  allowedInputClass: "synthetic_public_development_table",
  requiredResultMarking: CALIBRATION_SYNTHETIC_RESULT_MARKING,
  requiredAncestry: "manually_authored_synthetic_values",
  protectedDataCapabilityPresent: false,
  providerCapabilityPresent: false,
  benchmarkCapabilityPresent: false,
  filesystemWriteCapabilityPresent: false,
  shellOrGitCapabilityPresent: false,
  networkCapabilityPresent: false,
  forbiddenAncestry: [
    "protected_data",
    "provider_smoke",
    "public_fixture",
    "benchmark",
    "evaluator_vault",
    "gate_final_temporal_or_sealed",
    "real_provider_price",
    "provider_or_model_identity",
  ],
  forbiddenOutputUses: [
    "numeric_freeze_sentinel_value",
    "statistical_margin_value",
    "ProtocolManifest_value",
    "BudgetFreezeManifest_value",
    "CalibrationPlanManifest_value",
    "calibration_envelope_value",
    "research_claim_evidence",
  ],
} as const;

export const CALIBRATION_DERIVATION_FAILURE_CONTRACT = [
  ["candidate_grid_enlargement", "reject"],
  ["hidden_or_implicit_default_candidate", "reject"],
  ["estimator_or_confidence_bound_drift", "reject"],
  ["rounding_or_tie_rule_reversal", "reject"],
  ["missing_required_stratum", "withdraw"],
  ["missing_usage_undercharging", "withdraw"],
  ["infrastructure_incident_exclusion", "withdraw"],
  ["post_result_grid_modification", "withdraw"],
  ["seed_stream_domain_or_order_change", "reject"],
  ["threshold_widening", "reject"],
  ["cycle_or_forbidden_O_to_D", "reject"],
  ["synthetic_output_as_sentinel", "reject"],
  ["provider_smoke_or_public_fixture_ancestry", "reject"],
  ["role_collapse_or_alias", "reject"],
  ["nonzero_research_budget", "reject"],
  ["final_identity_allocation", "reject"],
  ["authority_or_eligibility_escalation", "reject"],
] as const;

export const CALIBRATION_DERIVATION_FORBIDDEN_RECORD_TYPES = [
  "CalibrationPlanManifest",
  "calibration_envelope",
  "pilot_receipt",
  "ProtocolManifest",
  "BudgetFreezeManifest",
  "protocol_freeze",
  "budget_freeze",
] as const;

export const CALIBRATION_DERIVATION_DEPENDENCY_CONTRACT = {
  numericGraph: CALIBRATION_NUMERIC_GRAPH,
  readinessTargets: ["F", "G", "J", "K", "L", "M"],
  requiredEdges: ["G+I->J", "K->L"],
  forbiddenEdges: [
    "O->D",
    "synthetic_output->pending_sentinel",
    "synthetic_output->ProtocolManifest",
    "synthetic_output->BudgetFreezeManifest",
  ],
  syntheticOutputBindings: [],
  sentinelWrites: [],
  protocolManifestWrites: [],
  budgetFreezeWrites: [],
} as const;

export const CALIBRATION_DERIVATION_ZERO_RESEARCH_BUDGET = {
  ...CALIBRATION_ZERO_BUDGET,
  providerIdentitySelections: 0,
  modelIdentitySelections: 0,
  realPriceSelections: 0,
  calibrationPlanManifests: 0,
  calibrationEnvelopes: 0,
  sentinelWrites: 0,
  protocolManifestWrites: 0,
  budgetFreezeManifestWrites: 0,
} as const;

export const CALIBRATION_DERIVATION_AUTHORITY_STATE = {
  ...CALIBRATION_AUTHORITY_STATE,
  syntheticResultMayResolveSentinel: false,
  syntheticResultMayPopulateProtocolManifest: false,
  syntheticResultMayPopulateBudgetFreezeManifest: false,
  readinessRecordMayActAsCalibrationPlan: false,
} as const;

export const CALIBRATION_DERIVATION_ELIGIBILITY_STATE = {
  ...CALIBRATION_ELIGIBILITY_STATE,
  ...CALIBRATION_SYNTHETIC_RESULT_MARKING,
  admissibleForSentinelResolution: false,
  admissibleForStatisticalMargin: false,
  admissibleForProtocolManifest: false,
  admissibleForBudgetFreezeManifest: false,
} as const;

export interface CalibrationDerivationProgramDefinition {
  readonly target: CalibrationDerivationTarget;
  readonly programId: string;
  readonly programName: string;
  readonly sourceArtifactId: "derivation_programs_source";
  readonly sourceSha256: string;
  readonly estimatorIdentity: string;
  readonly candidateBound: number;
  readonly confidenceBasisPoints: number | null;
  readonly failureBoundProbabilityMicros: number | null;
  readonly selectionRule: string;
  readonly tieRule: string;
  readonly roundingRule: string;
}

export function calibrationDerivationProgramDefinitions(
  sourceSha256: string,
): readonly CalibrationDerivationProgramDefinition[] {
  assertCondition(
    /^sha256:[a-f0-9]{64}$/u.test(sourceSha256),
    "SCHEMA_INVALID",
    "Derivation program source hash is invalid",
  );
  return CALIBRATION_DERIVATION_PROGRAM_SPECIFICATIONS.map((specification) => {
    const identity = {
      hashDomain: "CalibrationDerivationProgram.v1",
      sourceSha256,
      ...specification,
    };
    return {
      target: specification.target,
      programId: `cdp-sha256:${sha256Bytes(Buffer.from(canonicalize(identity), "utf8"))}`,
      programName: specification.programName,
      sourceArtifactId: "derivation_programs_source",
      sourceSha256,
      estimatorIdentity: specification.estimatorIdentity,
      candidateBound: specification.candidateBound,
      confidenceBasisPoints: specification.confidenceBasisPoints,
      failureBoundProbabilityMicros:
        specification.failureBoundProbabilityMicros,
      selectionRule: specification.selectionRule,
      tieRule: specification.tieRule,
      roundingRule: specification.roundingRule,
    };
  });
}

export interface CalibrationDerivationReadinessRole {
  readonly role: "protocol_author" | "independent_verifier" | "audit_store";
  readonly publicPrincipal: PublicPrincipal;
  readonly processIdentity: string;
  readonly currentCapabilityHandles: readonly [];
  readonly delegatedCapabilityIds: readonly [];
  readonly roleAliases: readonly [];
}

export interface CalibrationDerivationProgramReadiness {
  readonly schemaVersion: 1;
  readonly hashDomain: "CalibrationDerivationProgramReadiness.v1";
  readonly readinessId: string;
  readonly recordType: "calibration_derivation_program_readiness";
  readonly status: "synthetic_programs_ready_only";
  readonly zeroResearchExecution: true;
  readonly researchEvidencePresent: false;
  readonly sourceSnapshot: {
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly additionalPushPerformed: false;
  };
  readonly priorBindings: {
    readonly numericFreezeEntryId: "nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f";
    readonly numericFreezeEntryRawSha256: "sha256:432b341bf40096134d787381fb963c12266e2d73db97e079946614335ad01391";
    readonly calibrationContractId: "cc-sha256:8d4ffe8fc9fee52dd3b81b58ae8c7ba65b0bafc4f1d7079f91f3e810f20fff9f";
    readonly calibrationContractHash: "sha256:004bd1d7ae369a6e29978117d83539dec90633f3da3f6d1a0c5d5a6fbf3c8f56";
    readonly calibrationContractRawSha256: "sha256:5231c0152ee359e42c1879ecc4d1740c8eafde132bd501f8e4196f217128d22d";
    readonly calibrationContractSourceCommit: "f8e9df2053c958131fd47385e688f6560b3034c3";
  };
  readonly artifacts: readonly CalibrationDerivationReadinessArtifactReference[];
  readonly programDefinitions: readonly CalibrationDerivationProgramDefinition[];
  readonly gridContract: typeof CALIBRATION_DERIVATION_GRID_CONTRACT;
  readonly estimatorContract: typeof CALIBRATION_DERIVATION_ESTIMATOR_CONTRACT;
  readonly syntheticInputPolicy: typeof CALIBRATION_DERIVATION_SYNTHETIC_INPUT_POLICY;
  readonly failureContract: readonly {
    readonly condition: string;
    readonly disposition: "reject" | "withdraw";
  }[];
  readonly dependencyContract: typeof CALIBRATION_DERIVATION_DEPENDENCY_CONTRACT;
  readonly syntheticConformanceVectors: readonly CalibrationDerivationSyntheticVector[];
  readonly roleBoundary: {
    readonly protocolAuthor: CalibrationDerivationReadinessRole;
    readonly independentVerifier: CalibrationDerivationReadinessRole;
    readonly auditStore: CalibrationDerivationReadinessRole;
    readonly requiredInequalities: readonly [
      "principalId",
      "instanceId",
      "keyId",
      "publicKeyDigest",
      "processIdentity"
    ];
    readonly aliasingDelegationCosigningProxyingForbidden: true;
  };
  readonly researchExecutionBudget: typeof CALIBRATION_DERIVATION_ZERO_RESEARCH_BUDGET;
  readonly authorityState: typeof CALIBRATION_DERIVATION_AUTHORITY_STATE;
  readonly eligibilityState: typeof CALIBRATION_DERIVATION_ELIGIBILITY_STATE;
  readonly futureIdentityState: {
    readonly finalProtocolId: null;
    readonly budgetFreezeId: null;
    readonly calibrationPlanManifestId: null;
    readonly calibrationEnvelopeId: null;
    readonly selectedProtocolValueSetId: null;
  };
  readonly forbiddenRecordTypes: readonly string[];
  readonly claimBoundary: {
    readonly deterministicProgramsImplemented: true;
    readonly syntheticConformanceOnly: true;
    readonly calibrationPerformed: false;
    readonly numericValuesFrozen: false;
    readonly estimatorAdequacyEstablished: false;
    readonly performanceEvidence: false;
    readonly fairnessEvidence: false;
    readonly attributionEvidence: false;
    readonly securityCertification: false;
    readonly evolutionClaim: false;
    readonly selfImprovementClaim: false;
  };
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly readinessHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedCalibrationDerivationProgramReadiness = Omit<
  CalibrationDerivationProgramReadiness,
  | "schemaVersion"
  | "hashDomain"
  | "readinessId"
  | "recordType"
  | "recordedBy"
  | "readinessHash"
  | "publicPrincipal"
  | "attestation"
>;

type ReadinessCore = Omit<
  CalibrationDerivationProgramReadiness,
  "readinessHash" | "publicPrincipal" | "attestation"
>;
type ReadinessSignedBody = Omit<
  CalibrationDerivationProgramReadiness,
  "attestation"
>;

function readinessIdentity(
  value: UnsignedCalibrationDerivationProgramReadiness,
): JsonValue {
  return {
    hashDomain: "CalibrationDerivationProgramReadiness.v1",
    ...value,
  } as unknown as JsonValue;
}

function readinessCore(
  record: CalibrationDerivationProgramReadiness,
): ReadinessCore {
  const {
    readinessHash: _readinessHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function readinessSignedBody(
  record: CalibrationDerivationProgramReadiness,
): ReadinessSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createCalibrationDerivationProgramReadiness(input: {
  readonly value: UnsignedCalibrationDerivationProgramReadiness;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): CalibrationDerivationProgramReadiness {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Derivation readiness requires a protocol-author signer",
  );
  assertCondition(
    canonicalize(input.value.roleBoundary.protocolAuthor.publicPrincipal.identity) ===
      canonicalize(input.signer.identity),
    "AUTHORIZATION_DENIED",
    "Readiness protocol-author boundary differs from signer",
  );
  const readinessId = contentId(
    "ci-sha256",
    readinessIdentity(input.value),
  ).replace("ci-sha256:", "cdr-sha256:");
  const core: ReadinessCore = {
    schemaVersion: 1,
    hashDomain: "CalibrationDerivationProgramReadiness.v1",
    readinessId,
    recordType: "calibration_derivation_program_readiness",
    ...input.value,
    recordedBy: input.signer.identity,
  };
  const body: ReadinessSignedBody = {
    ...core,
    readinessHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const record: CalibrationDerivationProgramReadiness = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  verifyCalibrationDerivationProgramReadinessSignature({
    record,
    schemas: input.schemas,
  });
  return record;
}

export function verifyCalibrationDerivationProgramReadinessSignature(input: {
  readonly record: CalibrationDerivationProgramReadiness;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    CALIBRATION_DERIVATION_READINESS_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.recordedBy.role === "protocol_author" &&
      canonicalize(input.record.recordedBy) ===
        canonicalize(input.record.publicPrincipal.identity) &&
      canonicalize(input.record.recordedBy) ===
        canonicalize(
          input.record.roleBoundary.protocolAuthor.publicPrincipal.identity,
        ),
    "AUTHORIZATION_DENIED",
    "Readiness signer is not the bound protocol author",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    readinessSignedBody(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
  assertCondition(
    input.record.readinessHash ===
      sha256(readinessCore(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Derivation readiness hash differs",
  );
  const {
    schemaVersion: _schemaVersion,
    readinessId: _readinessId,
    recordType: _recordType,
    recordedBy: _recordedBy,
    readinessHash: _readinessHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...unsigned
  } = input.record;
  const expected = contentId(
    "ci-sha256",
    readinessIdentity(unsigned),
  ).replace("ci-sha256:", "cdr-sha256:");
  assertCondition(
    input.record.readinessId === expected,
    "HASH_MISMATCH",
    "Derivation readiness content identity differs",
  );
}

export interface CalibrationDerivationIndependentVerification {
  readonly hashDomain: "CalibrationDerivationIndependentVerification.v1";
  readonly readinessId: string;
  readonly readinessHash: string;
  readonly readinessArtifactSha256: string;
  readonly verification: {
    readonly schemaValid: true;
    readonly signaturesValid: true;
    readonly sourceBindingsValid: true;
    readonly programsContentAddressed: true;
    readonly gridAndEstimatorContractExact: true;
    readonly syntheticInputPolicyExact: true;
    readonly conformanceVectorsRecomputed: true;
    readonly failureAndWithdrawalContractExact: true;
    readonly dependencyGraphAcyclicAndNoOToD: true;
    readonly syntheticOutputsUnboundFromSentinels: true;
    readonly rolesDisjoint: true;
    readonly zeroResearchBudget: true;
    readonly finalIdentitiesAbsent: true;
    readonly authoritiesGranted: 0;
  };
  readonly verifiedAt: string;
  readonly verifier: PrincipalIdentity;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface CalibrationDerivationReadinessAuditReceipt {
  readonly schemaVersion: 1;
  readonly hashDomain: "CalibrationDerivationReadinessAuditReceipt.v1";
  readonly receiptId: string;
  readonly recordType: "calibration_derivation_program_readiness_audit_receipt";
  readonly readinessReference: {
    readonly readinessId: string;
    readonly readinessHash: string;
    readonly path: typeof CALIBRATION_DERIVATION_READINESS_PATH;
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  };
  readonly independentVerification: CalibrationDerivationIndependentVerification;
  readonly referenceOnly: true;
  readonly grantsAuthority: false;
  readonly producer: PrincipalIdentity;
  readonly receiptHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedCalibrationDerivationReadinessAuditReceipt = Omit<
  CalibrationDerivationReadinessAuditReceipt,
  | "schemaVersion"
  | "hashDomain"
  | "receiptId"
  | "recordType"
  | "producer"
  | "receiptHash"
  | "publicPrincipal"
  | "attestation"
>;

type AuditReceiptCore = Omit<
  CalibrationDerivationReadinessAuditReceipt,
  "receiptHash" | "publicPrincipal" | "attestation"
>;
type AuditReceiptSignedBody = Omit<
  CalibrationDerivationReadinessAuditReceipt,
  "attestation"
>;

function independentVerificationUnsigned(
  value: CalibrationDerivationIndependentVerification,
): JsonValue {
  const {
    attestation: _attestation,
    ...unsigned
  } = value;
  return unsigned as unknown as JsonValue;
}

export function createCalibrationDerivationIndependentVerification(input: {
  readonly readiness: CalibrationDerivationProgramReadiness;
  readonly readinessBytes: Uint8Array;
  readonly verification: CalibrationDerivationIndependentVerification["verification"];
  readonly verifiedAt: string;
  readonly signer: PrincipalSigner;
}): CalibrationDerivationIndependentVerification {
  assertCondition(
    input.signer.identity.role === "independent_verifier",
    "AUTHORIZATION_DENIED",
    "Independent verification requires an independent-verifier signer",
  );
  assertCondition(
    canonicalize(input.signer.exportPublic()) ===
      canonicalize(
        input.readiness.roleBoundary.independentVerifier.publicPrincipal,
      ),
    "AUTHORIZATION_DENIED",
    "Independent verifier differs from readiness role boundary",
  );
  const body = {
    hashDomain: "CalibrationDerivationIndependentVerification.v1" as const,
    readinessId: input.readiness.readinessId,
    readinessHash: input.readiness.readinessHash,
    readinessArtifactSha256: `sha256:${sha256Bytes(input.readinessBytes)}`,
    verification: input.verification,
    verifiedAt: input.verifiedAt,
    verifier: input.signer.identity,
    publicPrincipal: input.signer.exportPublic(),
  };
  return {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
}

function auditReceiptCore(
  receipt: CalibrationDerivationReadinessAuditReceipt,
): AuditReceiptCore {
  const {
    receiptHash: _receiptHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = receipt;
  return core;
}

function auditReceiptSignedBody(
  receipt: CalibrationDerivationReadinessAuditReceipt,
): AuditReceiptSignedBody {
  const { attestation: _attestation, ...body } = receipt;
  return body;
}

export function createCalibrationDerivationReadinessAuditReceipt(input: {
  readonly value: UnsignedCalibrationDerivationReadinessAuditReceipt;
  readonly readiness: CalibrationDerivationProgramReadiness;
  readonly readinessBytes: Uint8Array;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): CalibrationDerivationReadinessAuditReceipt {
  assertCondition(
    input.signer.identity.role === "audit_store",
    "AUTHORIZATION_DENIED",
    "Readiness audit receipt requires an audit-store signer",
  );
  assertCondition(
    canonicalize(input.signer.exportPublic()) ===
      canonicalize(input.readiness.roleBoundary.auditStore.publicPrincipal),
    "AUTHORIZATION_DENIED",
    "Audit store differs from readiness role boundary",
  );
  assertCondition(
    input.value.readinessReference.readinessId === input.readiness.readinessId &&
      input.value.readinessReference.readinessHash ===
        input.readiness.readinessHash &&
      input.value.readinessReference.sha256 ===
        `sha256:${sha256Bytes(input.readinessBytes)}` &&
      input.value.readinessReference.sizeBytes === input.readinessBytes.byteLength,
    "HASH_MISMATCH",
    "Readiness audit reference differs from exact bytes",
  );
  const receiptId = contentId("rss-sha256", {
    hashDomain: "CalibrationDerivationReadinessAuditReceipt.v1",
    ...input.value,
  }).replace("rss-sha256:", "cdrar-sha256:");
  const core: AuditReceiptCore = {
    schemaVersion: 1,
    hashDomain: "CalibrationDerivationReadinessAuditReceipt.v1",
    receiptId,
    recordType: "calibration_derivation_program_readiness_audit_receipt",
    ...input.value,
    producer: input.signer.identity,
  };
  const body: AuditReceiptSignedBody = {
    ...core,
    receiptHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const receipt: CalibrationDerivationReadinessAuditReceipt = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  input.schemas.validate(
    CALIBRATION_DERIVATION_READINESS_SCHEMA_ID,
    receipt as unknown as JsonValue,
  );
  return receipt;
}

export function verifyCalibrationDerivationReadinessAuditSignatures(input: {
  readonly receipt: CalibrationDerivationReadinessAuditReceipt;
  readonly readiness: CalibrationDerivationProgramReadiness;
  readonly readinessBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    CALIBRATION_DERIVATION_READINESS_SCHEMA_ID,
    input.receipt as unknown as JsonValue,
  );
  assertCondition(
    input.receipt.referenceOnly === true &&
      input.receipt.grantsAuthority === false,
    "AUTHORIZATION_DENIED",
    "Readiness audit receipt must remain reference-only",
  );
  assertCondition(
    input.receipt.readinessReference.readinessId === input.readiness.readinessId &&
      input.receipt.readinessReference.readinessHash ===
        input.readiness.readinessHash &&
      input.receipt.readinessReference.sha256 ===
        `sha256:${sha256Bytes(input.readinessBytes)}` &&
      input.receipt.readinessReference.sizeBytes ===
        input.readinessBytes.byteLength,
    "HASH_MISMATCH",
    "Readiness audit receipt references different bytes",
  );
  assertCondition(
    input.receipt.independentVerification.readinessId ===
      input.readiness.readinessId &&
      input.receipt.independentVerification.readinessHash ===
        input.readiness.readinessHash &&
      input.receipt.independentVerification.readinessArtifactSha256 ===
        `sha256:${sha256Bytes(input.readinessBytes)}`,
    "HASH_MISMATCH",
    "Independent verification references different readiness bytes",
  );
  assertCondition(
    canonicalize(input.receipt.independentVerification.publicPrincipal) ===
      canonicalize(
        input.readiness.roleBoundary.independentVerifier.publicPrincipal,
      ) &&
      canonicalize(input.receipt.independentVerification.verifier) ===
        canonicalize(
          input.readiness.roleBoundary.independentVerifier.publicPrincipal.identity,
        ),
    "AUTHORIZATION_DENIED",
    "Independent verification role differs",
  );
  const independentRegistry = new PrincipalRegistry();
  independentRegistry.register(
    input.receipt.independentVerification.publicPrincipal,
  );
  independentRegistry.verify(
    input.receipt.independentVerification.verifier,
    independentVerificationUnsigned(input.receipt.independentVerification),
    input.receipt.independentVerification.attestation,
  );
  assertCondition(
    input.receipt.producer.role === "audit_store" &&
      canonicalize(input.receipt.publicPrincipal) ===
        canonicalize(input.readiness.roleBoundary.auditStore.publicPrincipal) &&
      canonicalize(input.receipt.producer) ===
        canonicalize(input.receipt.publicPrincipal.identity),
    "AUTHORIZATION_DENIED",
    "Readiness receipt producer differs from audit store",
  );
  const auditRegistry = new PrincipalRegistry();
  auditRegistry.register(input.receipt.publicPrincipal);
  auditRegistry.verify(
    input.receipt.producer,
    auditReceiptSignedBody(input.receipt) as unknown as JsonValue,
    input.receipt.attestation,
  );
  assertCondition(
    input.receipt.receiptHash ===
      sha256(auditReceiptCore(input.receipt) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Readiness audit receipt hash differs",
  );
  const {
    schemaVersion: _schemaVersion,
    hashDomain: _hashDomain,
    receiptId: _receiptId,
    recordType: _recordType,
    producer: _producer,
    receiptHash: _receiptHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...unsigned
  } = input.receipt;
  const expectedReceiptId = contentId("rss-sha256", {
    hashDomain: "CalibrationDerivationReadinessAuditReceipt.v1",
    ...unsigned,
  }).replace("rss-sha256:", "cdrar-sha256:");
  assertCondition(
    input.receipt.receiptId === expectedReceiptId,
    "HASH_MISMATCH",
    "Readiness audit receipt content identity differs",
  );
}

export function calibrationDerivationFailureContract(): readonly {
  readonly condition: string;
  readonly disposition: "reject" | "withdraw";
}[] {
  return CALIBRATION_DERIVATION_FAILURE_CONTRACT.map(
    ([condition, disposition]) => ({ condition, disposition }),
  );
}

export function calibrationDerivationVectorResultHashes(
  vectors: readonly CalibrationDerivationSyntheticVector[],
): readonly string[] {
  return vectors.map((vector) =>
    sha256(vector.result as unknown as JsonValue),
  );
}

export function isMarkedSyntheticOnly(
  result: SyntheticCalibrationDerivationResult,
): boolean {
  return (
    result.publicDevelopment === true &&
    result.authorizedForResearchEvidence === false &&
    result.admissibleAsNumericFreezeValue === false &&
    result.confirmatory === false
  );
}
