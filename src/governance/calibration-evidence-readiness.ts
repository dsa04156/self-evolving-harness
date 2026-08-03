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
  CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX,
  CALIBRATION_EVIDENCE_DISPOSITION,
  CALIBRATION_EVIDENCE_GRAPH_CONTRACT,
  CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX,
  CALIBRATION_EVIDENCE_RECORD_SPECS,
  CALIBRATION_EVIDENCE_ZERO_BUDGET,
  buildSyntheticCalibrationCapabilityDescriptor,
  type CalibrationEvidenceRoleBoundary,
  type SyntheticCalibrationCapabilityDescriptor,
} from "./calibration-evidence-contracts.js";

export const CALIBRATION_EVIDENCE_READINESS_SCHEMA_ID =
  `${SCHEMA_BASE_URL}calibration-evidence-readiness.schema.json`;
export const CALIBRATION_EVIDENCE_READINESS_PATH =
  "governance/gate3/calibration-evidence-contract-readiness-v2.json";
export const CALIBRATION_EVIDENCE_READINESS_AUDIT_PATH =
  "governance/gate3/calibration-evidence-contract-readiness-v2-audit-receipt.json";

export type CalibrationEvidenceArtifactMediaType =
  | "application/json"
  | "text/markdown; charset=utf-8"
  | "text/typescript; charset=utf-8";

export interface CalibrationEvidenceArtifactReference {
  readonly artifactId: string;
  readonly path: string;
  readonly sourceCommit: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: CalibrationEvidenceArtifactMediaType;
}

export const CALIBRATION_EVIDENCE_READINESS_ARTIFACT_SPECS = [
  ["prior_evidence_readiness", "governance/gate3/calibration-evidence-contract-readiness.json", "application/json"],
  ["prior_evidence_readiness_receipt", "governance/gate3/calibration-evidence-contract-readiness-audit-receipt.json", "application/json"],
  ["prior_evidence_ruling", ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrrrrrr.md", "text/markdown; charset=utf-8"],
  ["assembly_readiness", "governance/gate3/calibration-plan-assembly-readiness.json", "application/json"],
  ["assembly_readiness_receipt", "governance/gate3/calibration-plan-assembly-readiness-audit-receipt.json", "application/json"],
  ["assembly_evidence_packet", "architect/PACKET_03RRRRRRRRRRRRRRRRRRRRR_CALIBRATION_PLAN_ASSEMBLY_READINESS_EVIDENCE.md", "text/markdown; charset=utf-8"],
  ["assembly_evidence_ruling", ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrrrrr.md", "text/markdown; charset=utf-8"],
  ["outstanding_obligations", "governance/trust-plane/outstanding-obligations.json", "application/json"],
  ["common_schema", "schemas/common.schema.json", "application/json"],
  ["evidence_contract_schema", "schemas/calibration-evidence-contracts.schema.json", "application/json"],
  ["evidence_readiness_schema", "schemas/calibration-evidence-readiness.schema.json", "application/json"],
  ["evidence_contract_source", "src/governance/calibration-evidence-contracts.ts", "text/typescript; charset=utf-8"],
  ["evidence_readiness_source", "src/governance/calibration-evidence-readiness.ts", "text/typescript; charset=utf-8"],
  ["evidence_readiness_verifier", "src/governance/calibration-evidence-readiness-verifier.ts", "text/typescript; charset=utf-8"],
  ["evidence_readiness_generator", "scripts/create-calibration-evidence-readiness.ts", "text/typescript; charset=utf-8"],
  ["evidence_readiness_verify_script", "scripts/verify-calibration-evidence-readiness.ts", "text/typescript; charset=utf-8"],
  ["evidence_readiness_tests", "test/calibration-evidence-readiness.test.ts", "text/typescript; charset=utf-8"],
  ["evidence_readiness_documentation", "docs/evaluation/calibration-evidence-contract-readiness.md", "text/markdown; charset=utf-8"],
  ["principal_identity_source", "src/trust/identity.ts", "text/typescript; charset=utf-8"],
  ["public_api_source", "src/index.ts", "text/typescript; charset=utf-8"],
  ["package_manifest", "package.json", "application/json"],
] as const satisfies readonly (readonly [string, string, CalibrationEvidenceArtifactMediaType])[];

export const CALIBRATION_EVIDENCE_CONTRACT_INVENTORY = CALIBRATION_EVIDENCE_RECORD_SPECS.map(
  ([recordType, stage, ownerRole, idPrefix]) => ({
    recordType,
    stage,
    ownerRole,
    idPrefix: `${idPrefix}-sha256`,
    closedSchema: true as const,
    bodyFree: true as const,
    directExclusiveOwnerSignature: true as const,
    currentInstancesPersisted: 0 as const,
  }),
);

export const CALIBRATION_EVIDENCE_AUTHORITY_STATE = {
  calibrationPlanCreated: false,
  calibrationEnvelopeCreated: false,
  calibrationCapabilityIssued: false,
  calibrationCapabilityConsumed: false,
  calibrationExecutionAuthorized: false,
  protectedDataAccessAuthorized: false,
  evidenceAdmissionAuthorized: false,
  numericFreezeWriteAuthorized: false,
  protocolManifestWriteAuthorized: false,
  budgetFreezeWriteAuthorized: false,
  oProposalAuthorized: false,
  oActivationAuthorized: false,
  promotionAuthorized: false,
  deploymentAuthorized: false,
} as const;

export const CALIBRATION_EVIDENCE_ELIGIBILITY_STATE = {
  ...CALIBRATION_EVIDENCE_DISPOSITION,
  admissibleAsCalibrationPlan: false,
  admissibleAsProtocolManifest: false,
  admissibleAsBudgetFreezeManifest: false,
  admissibleAsPromotionEvidence: false,
  admissibleAsDeploymentEvidence: false,
} as const;

export const CALIBRATION_EVIDENCE_FUTURE_IDENTITY_STATE = {
  finalProtocolId: null,
  budgetFreezeId: null,
  calibrationPlanManifestId: null,
  calibrationEnvelopeId: null,
  selectedProtocolValueSetId: null,
  capabilityId: null,
  capabilityHandle: null,
  freezeTransactionId: null,
  oProposalId: null,
  oActivationId: null,
} as const;

export const CALIBRATION_EVIDENCE_SYNTHETIC_FIXTURE_CONTRACT = {
  scenarioCount: 3,
  totalRecordCount: 30,
  scenarios: [
    {
      terminalDisposition: "aggregate_succeeded",
      verifiedDisposition: "verified_aggregate",
      expectedRecordCount: 9,
      expectedStageCounts: { E0: 4, E1: 2, E2: 1, E3: 1, E4: 1 },
      e4Expected: true,
    },
    {
      terminalDisposition: "calibration_withdrawn",
      verifiedDisposition: "verified_withdrawal",
      expectedRecordCount: 12,
      expectedStageCounts: { E0: 6, E1: 4, E2: 1, E3: 1, E4: 0 },
      e4Expected: false,
    },
    {
      terminalDisposition: "calibration_failed",
      verifiedDisposition: "verified_failure",
      expectedRecordCount: 9,
      expectedStageCounts: { E0: 4, E1: 2, E2: 2, E3: 1, E4: 0 },
      e4Expected: false,
    },
  ],
  expectedStratumCount: 2,
  terminalBranchesMutuallyExclusive: true,
  e0ExecutionUsageExactlyOnce: true,
  e0AccountingHeadsMatch: true,
  e0OrphanOrReuseAllowed: false,
  e3DispositionBoundToE2: true,
  e4OnlyAfterVerifiedAggregate: true,
  fixturesPersistedAsCalibrationEvidence: false,
  actualEvidenceRecordsPersisted: 0,
  validlyResignedAttackFamiliesMinimum: 30,
} as const;

export interface CalibrationEvidenceContractHashes {
  readonly inventory: string;
  readonly ownershipMatrix: string;
  readonly disclosureMatrix: string;
  readonly graphContract: string;
  readonly syntheticCapabilityDescriptor: string;
  readonly zeroBudget: string;
  readonly authorityState: string;
  readonly eligibilityState: string;
  readonly syntheticFixtureContract: string;
}

export function calibrationEvidenceContractHashes(): CalibrationEvidenceContractHashes {
  return {
    inventory: sha256(CALIBRATION_EVIDENCE_CONTRACT_INVENTORY as unknown as JsonValue),
    ownershipMatrix: sha256(CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX as unknown as JsonValue),
    disclosureMatrix: sha256(CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX as unknown as JsonValue),
    graphContract: sha256(CALIBRATION_EVIDENCE_GRAPH_CONTRACT as unknown as JsonValue),
    syntheticCapabilityDescriptor: sha256(buildSyntheticCalibrationCapabilityDescriptor() as unknown as JsonValue),
    zeroBudget: sha256(CALIBRATION_EVIDENCE_ZERO_BUDGET as unknown as JsonValue),
    authorityState: sha256(CALIBRATION_EVIDENCE_AUTHORITY_STATE as unknown as JsonValue),
    eligibilityState: sha256(CALIBRATION_EVIDENCE_ELIGIBILITY_STATE as unknown as JsonValue),
    syntheticFixtureContract: sha256(CALIBRATION_EVIDENCE_SYNTHETIC_FIXTURE_CONTRACT as unknown as JsonValue),
  };
}

export interface CalibrationEvidenceContractReadiness {
  readonly schemaVersion: 1;
  readonly hashDomain: "CalibrationEvidenceContractReadiness.v1";
  readonly readinessId: string;
  readonly recordType: "calibration_evidence_contract_readiness";
  readonly status: "offline_body_free_terminal_branches_ready_only";
  readonly sourceSnapshot: {
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly additionalPushPerformed: false;
  };
  readonly priorBindings: {
    readonly assemblyReadinessId: string;
    readonly assemblyReadinessHash: string;
    readonly assemblyReadinessRawSha256: string;
    readonly assemblyAuditReceiptId: string;
    readonly assemblyAuditReceiptHash: string;
    readonly assemblyAuditReceiptRawSha256: string;
    readonly assemblyEvidenceRulingRawSha256: string;
    readonly assemblyEvidenceDecision: "APPROVE";
    readonly priorEvidenceReadinessId: string;
    readonly priorEvidenceReadinessHash: string;
    readonly priorEvidenceReadinessRawSha256: string;
    readonly priorEvidenceAuditReceiptId: string;
    readonly priorEvidenceAuditReceiptHash: string;
    readonly priorEvidenceAuditReceiptRawSha256: string;
    readonly priorEvidenceRulingRawSha256: string;
    readonly priorEvidenceDecision: "REVISE";
  };
  readonly artifacts: readonly CalibrationEvidenceArtifactReference[];
  readonly contractInventory: typeof CALIBRATION_EVIDENCE_CONTRACT_INVENTORY;
  readonly ownershipMatrix: typeof CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX;
  readonly disclosureMatrix: typeof CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX;
  readonly graphContract: typeof CALIBRATION_EVIDENCE_GRAPH_CONTRACT;
  readonly syntheticCapabilityDescriptor: SyntheticCalibrationCapabilityDescriptor;
  readonly syntheticFixtureContract: typeof CALIBRATION_EVIDENCE_SYNTHETIC_FIXTURE_CONTRACT;
  readonly contractHashes: CalibrationEvidenceContractHashes;
  readonly roleBoundary: CalibrationEvidenceRoleBoundary;
  readonly actualEvidenceRecords: readonly [];
  readonly actualCapabilities: readonly [];
  readonly researchExecutionBudget: typeof CALIBRATION_EVIDENCE_ZERO_BUDGET;
  readonly authorityState: typeof CALIBRATION_EVIDENCE_AUTHORITY_STATE;
  readonly eligibilityState: typeof CALIBRATION_EVIDENCE_ELIGIBILITY_STATE;
  readonly futureIdentityState: typeof CALIBRATION_EVIDENCE_FUTURE_IDENTITY_STATE;
  readonly forbiddenMaterialAndActions: readonly [
    "actual_calibration_plan",
    "actual_calibration_envelope",
    "capability_issuance_or_consumption",
    "nonzero_budget",
    "provider_model_environment_or_price_selection",
    "credential_or_API_call",
    "benchmark_vault_task_or_raw_measurement",
    "sentinel_margin_final_identity_or_O",
    "attribution_mutation_candidate_promotion_or_deployment",
  ];
  readonly claimBoundary: {
    readonly closedSchemasImplemented: true;
    readonly semanticGraphVerifierImplemented: true;
    readonly publicDevelopmentConformanceOnly: true;
    readonly calibrationPerformed: false;
    readonly evidenceAdmitted: false;
    readonly capabilityIssuedOrConsumed: false;
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

export type UnsignedCalibrationEvidenceContractReadiness = Omit<
  CalibrationEvidenceContractReadiness,
  | "schemaVersion"
  | "hashDomain"
  | "readinessId"
  | "recordType"
  | "recordedBy"
  | "readinessHash"
  | "publicPrincipal"
  | "attestation"
>;

type ReadinessCore = Omit<CalibrationEvidenceContractReadiness, "readinessHash" | "publicPrincipal" | "attestation">;
type ReadinessSignedBody = Omit<CalibrationEvidenceContractReadiness, "attestation">;

function readinessIdentity(value: UnsignedCalibrationEvidenceContractReadiness): JsonValue {
  return { hashDomain: "CalibrationEvidenceContractReadiness.v1", ...value } as unknown as JsonValue;
}

function readinessCore(record: CalibrationEvidenceContractReadiness): ReadinessCore {
  const { readinessHash: _hash, publicPrincipal: _principal, attestation: _attestation, ...core } = record;
  return core;
}

function readinessSignedBody(record: CalibrationEvidenceContractReadiness): ReadinessSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createCalibrationEvidenceContractReadiness(input: {
  readonly value: UnsignedCalibrationEvidenceContractReadiness;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): CalibrationEvidenceContractReadiness {
  assertCondition(input.signer.identity.role === "protocol_author", "AUTHORIZATION_DENIED", "Evidence-contract readiness requires protocol author");
  assertCondition(
    canonicalize(input.signer.exportPublic()) === canonicalize(input.value.roleBoundary.protocolAuthor.publicPrincipal),
    "AUTHORIZATION_DENIED",
    "Readiness signer differs from protocol-author boundary",
  );
  const readinessId = contentId("ci-sha256", readinessIdentity(input.value)).replace("ci-sha256:", "cecr-sha256:");
  const core: ReadinessCore = {
    schemaVersion: 1,
    hashDomain: "CalibrationEvidenceContractReadiness.v1",
    readinessId,
    recordType: "calibration_evidence_contract_readiness",
    ...input.value,
    recordedBy: input.signer.identity,
  };
  const body: ReadinessSignedBody = {
    ...core,
    readinessHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const record: CalibrationEvidenceContractReadiness = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  verifyCalibrationEvidenceContractReadinessSignature({ record, schemas: input.schemas });
  return record;
}

export function verifyCalibrationEvidenceContractReadinessSignature(input: {
  readonly record: CalibrationEvidenceContractReadiness;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(CALIBRATION_EVIDENCE_READINESS_SCHEMA_ID, input.record as unknown as JsonValue);
  assertCondition(
    input.record.recordedBy.role === "protocol_author" &&
      canonicalize(input.record.recordedBy) === canonicalize(input.record.publicPrincipal.identity) &&
      canonicalize(input.record.publicPrincipal) === canonicalize(input.record.roleBoundary.protocolAuthor.publicPrincipal),
    "AUTHORIZATION_DENIED",
    "Evidence-contract readiness is not signed by the bound protocol author",
  );
  const registry = new PrincipalRegistry();
  registry.register(input.record.publicPrincipal);
  registry.verify(input.record.recordedBy, readinessSignedBody(input.record) as unknown as JsonValue, input.record.attestation);
  assertCondition(input.record.readinessHash === sha256(readinessCore(input.record) as unknown as JsonValue), "HASH_MISMATCH", "Evidence-contract readiness hash differs");
  const {
    schemaVersion: _schemaVersion,
    hashDomain: _hashDomain,
    readinessId: _id,
    recordType: _recordType,
    recordedBy: _recordedBy,
    readinessHash: _hash,
    publicPrincipal: _principal,
    attestation: _attestation,
    ...unsigned
  } = input.record;
  const expected = contentId("ci-sha256", readinessIdentity(unsigned)).replace("ci-sha256:", "cecr-sha256:");
  assertCondition(input.record.readinessId === expected, "HASH_MISMATCH", "Evidence-contract readiness identity differs");
}

export interface CalibrationEvidenceIndependentVerification {
  readonly hashDomain: "CalibrationEvidenceIndependentVerification.v1";
  readonly readinessId: string;
  readonly readinessHash: string;
  readonly readinessArtifactSha256: string;
  readonly verification: {
    readonly schemaValid: true;
    readonly signaturesValid: true;
    readonly sourceBindingsValid: true;
    readonly assemblyBindingValid: true;
    readonly priorReviseBindingValid: true;
    readonly contractsClosedAndBodyFree: true;
    readonly ownershipAndDisclosureMatricesExact: true;
    readonly oneWayGraphExact: true;
    readonly syntheticChainVerified: true;
    readonly threeTerminalScenariosVerified: true;
    readonly terminalBranchesMutuallyExclusive: true;
    readonly e0ToE1CoverageExact: true;
    readonly e3DispositionBoundToE2: true;
    readonly e4EligibilityExact: true;
    readonly roleBoundaryDisjoint: true;
    readonly capabilityUnissuedAndUnconsumed: true;
    readonly zeroExecutionBudget: true;
    readonly actualEvidenceRecordsAbsent: true;
    readonly finalIdentitiesAbsent: true;
    readonly oCreationAndActivationAbsent: true;
    readonly authoritiesGranted: 0;
  };
  readonly verifiedAt: string;
  readonly verifier: PrincipalIdentity;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface CalibrationEvidenceReadinessAuditReceipt {
  readonly schemaVersion: 1;
  readonly hashDomain: "CalibrationEvidenceReadinessAuditReceipt.v1";
  readonly receiptId: string;
  readonly recordType: "calibration_evidence_contract_readiness_audit_receipt";
  readonly readinessReference: {
    readonly readinessId: string;
    readonly readinessHash: string;
    readonly path: typeof CALIBRATION_EVIDENCE_READINESS_PATH;
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  };
  readonly independentVerification: CalibrationEvidenceIndependentVerification;
  readonly referenceOnly: true;
  readonly grantsAuthority: false;
  readonly producer: PrincipalIdentity;
  readonly receiptHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedCalibrationEvidenceReadinessAuditReceipt = Omit<
  CalibrationEvidenceReadinessAuditReceipt,
  | "schemaVersion"
  | "hashDomain"
  | "receiptId"
  | "recordType"
  | "producer"
  | "receiptHash"
  | "publicPrincipal"
  | "attestation"
>;

function independentUnsigned(value: CalibrationEvidenceIndependentVerification): JsonValue {
  const { attestation: _attestation, ...unsigned } = value;
  return unsigned as unknown as JsonValue;
}

export function createCalibrationEvidenceIndependentVerification(input: {
  readonly readiness: CalibrationEvidenceContractReadiness;
  readonly readinessBytes: Uint8Array;
  readonly verification: CalibrationEvidenceIndependentVerification["verification"];
  readonly verifiedAt: string;
  readonly signer: PrincipalSigner;
}): CalibrationEvidenceIndependentVerification {
  assertCondition(input.signer.identity.role === "independent_verifier", "AUTHORIZATION_DENIED", "Evidence-contract verification requires independent verifier");
  assertCondition(
    canonicalize(input.signer.exportPublic()) === canonicalize(input.readiness.roleBoundary.independentVerifier.publicPrincipal),
    "AUTHORIZATION_DENIED",
    "Independent verifier differs from readiness boundary",
  );
  const body = {
    hashDomain: "CalibrationEvidenceIndependentVerification.v1" as const,
    readinessId: input.readiness.readinessId,
    readinessHash: input.readiness.readinessHash,
    readinessArtifactSha256: `sha256:${sha256Bytes(input.readinessBytes)}`,
    verification: input.verification,
    verifiedAt: input.verifiedAt,
    verifier: input.signer.identity,
    publicPrincipal: input.signer.exportPublic(),
  };
  return { ...body, attestation: input.signer.attest(body as unknown as JsonValue) };
}

type AuditCore = Omit<CalibrationEvidenceReadinessAuditReceipt, "receiptHash" | "publicPrincipal" | "attestation">;
type AuditSignedBody = Omit<CalibrationEvidenceReadinessAuditReceipt, "attestation">;

function auditCore(receipt: CalibrationEvidenceReadinessAuditReceipt): AuditCore {
  const { receiptHash: _hash, publicPrincipal: _principal, attestation: _attestation, ...core } = receipt;
  return core;
}

function auditSignedBody(receipt: CalibrationEvidenceReadinessAuditReceipt): AuditSignedBody {
  const { attestation: _attestation, ...body } = receipt;
  return body;
}

export function createCalibrationEvidenceReadinessAuditReceipt(input: {
  readonly value: UnsignedCalibrationEvidenceReadinessAuditReceipt;
  readonly readiness: CalibrationEvidenceContractReadiness;
  readonly readinessBytes: Uint8Array;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): CalibrationEvidenceReadinessAuditReceipt {
  assertCondition(input.signer.identity.role === "audit_store", "AUTHORIZATION_DENIED", "Evidence readiness audit requires audit store");
  assertCondition(canonicalize(input.signer.exportPublic()) === canonicalize(input.readiness.roleBoundary.auditStore.publicPrincipal), "AUTHORIZATION_DENIED", "Audit store differs from readiness boundary");
  assertCondition(input.value.readinessReference.sha256 === `sha256:${sha256Bytes(input.readinessBytes)}`, "HASH_MISMATCH", "Readiness byte hash differs");
  assertCondition(input.value.referenceOnly && !input.value.grantsAuthority, "AUTHORIZATION_DENIED", "Audit receipt must remain reference-only");
  const receiptId = contentId("rss-sha256", { hashDomain: "CalibrationEvidenceReadinessAuditReceipt.v1", ...input.value }).replace("rss-sha256:", "cecrar-sha256:");
  const core: AuditCore = {
    schemaVersion: 1,
    hashDomain: "CalibrationEvidenceReadinessAuditReceipt.v1",
    receiptId,
    recordType: "calibration_evidence_contract_readiness_audit_receipt",
    ...input.value,
    producer: input.signer.identity,
  };
  const body: AuditSignedBody = { ...core, receiptHash: sha256(core as unknown as JsonValue), publicPrincipal: input.signer.exportPublic() };
  const receipt: CalibrationEvidenceReadinessAuditReceipt = { ...body, attestation: input.signer.attest(body as unknown as JsonValue) };
  verifyCalibrationEvidenceReadinessAuditSignatures({ receipt, readiness: input.readiness, readinessBytes: input.readinessBytes, schemas: input.schemas });
  return receipt;
}

export function verifyCalibrationEvidenceReadinessAuditSignatures(input: {
  readonly receipt: CalibrationEvidenceReadinessAuditReceipt;
  readonly readiness: CalibrationEvidenceContractReadiness;
  readonly readinessBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(CALIBRATION_EVIDENCE_READINESS_SCHEMA_ID, input.receipt as unknown as JsonValue);
  const reference = input.receipt.readinessReference;
  assertCondition(reference.readinessId === input.readiness.readinessId && reference.readinessHash === input.readiness.readinessHash && reference.sha256 === `sha256:${sha256Bytes(input.readinessBytes)}` && reference.sizeBytes === input.readinessBytes.byteLength, "HASH_MISMATCH", "Audit receipt readiness reference differs");
  const verification = input.receipt.independentVerification;
  assertCondition(verification.readinessId === input.readiness.readinessId && verification.readinessHash === input.readiness.readinessHash && verification.readinessArtifactSha256 === reference.sha256, "HASH_MISMATCH", "Independent verification reference differs");
  assertCondition(canonicalize(verification.publicPrincipal) === canonicalize(input.readiness.roleBoundary.independentVerifier.publicPrincipal) && verification.verifier.role === "independent_verifier", "AUTHORIZATION_DENIED", "Independent verifier differs");
  const verifierRegistry = new PrincipalRegistry();
  verifierRegistry.register(verification.publicPrincipal);
  verifierRegistry.verify(verification.verifier, independentUnsigned(verification), verification.attestation);
  assertCondition(input.receipt.producer.role === "audit_store" && canonicalize(input.receipt.publicPrincipal) === canonicalize(input.readiness.roleBoundary.auditStore.publicPrincipal) && canonicalize(input.receipt.producer) === canonicalize(input.receipt.publicPrincipal.identity), "AUTHORIZATION_DENIED", "Audit producer differs");
  const auditRegistry = new PrincipalRegistry();
  auditRegistry.register(input.receipt.publicPrincipal);
  auditRegistry.verify(input.receipt.producer, auditSignedBody(input.receipt) as unknown as JsonValue, input.receipt.attestation);
  assertCondition(input.receipt.receiptHash === sha256(auditCore(input.receipt) as unknown as JsonValue), "HASH_MISMATCH", "Audit receipt hash differs");
  const {
    schemaVersion: _schemaVersion,
    hashDomain: _hashDomain,
    receiptId: _id,
    recordType: _recordType,
    producer: _producer,
    receiptHash: _hash,
    publicPrincipal: _principal,
    attestation: _attestation,
    ...unsigned
  } = input.receipt;
  const expected = contentId("rss-sha256", { hashDomain: "CalibrationEvidenceReadinessAuditReceipt.v1", ...unsigned }).replace("rss-sha256:", "cecrar-sha256:");
  assertCondition(input.receipt.receiptId === expected, "HASH_MISMATCH", "Audit receipt identity differs");
}
