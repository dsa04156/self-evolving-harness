import {
  canonicalize,
  contentId,
  sha256,
  sha256Text,
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
  type PrincipalRole,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";

export const CALIBRATION_EVIDENCE_CONTRACT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}calibration-evidence-contracts.schema.json`;

export const CALIBRATION_EVIDENCE_STAGES = ["E0", "E1", "E2", "E3", "E4"] as const;
export type CalibrationEvidenceStage = (typeof CALIBRATION_EVIDENCE_STAGES)[number];

export const CALIBRATION_EVIDENCE_RECORD_SPECS = [
  ["CalibrationExecutionReceipt", "E0", "calibration_executor", "cer"],
  ["CalibrationUsageReceipt", "E0", "calibration_executor", "cur"],
  ["CalibrationIncidentRecord", "E0", "calibration_executor", "cir"],
  ["CalibrationMeasurementCommitment", "E1", "calibration_evaluator", "cmc"],
  ["CalibrationEvaluatorFailureRecord", "E1", "calibration_evaluator", "cefr"],
  ["CalibrationEvaluatorIncidentRecord", "E1", "calibration_evaluator", "ceir"],
  ["AggregateCalibrationCommitment", "E2", "calibration_scorer", "acc"],
  ["RejectedDerivationCandidateCommitment", "E2", "calibration_scorer", "rdcc"],
  ["CalibrationWithdrawalRecord", "E2", "calibration_scorer", "cwr"],
  ["CalibrationScorerFailureRecord", "E2", "calibration_scorer", "csfr"],
  ["CalibrationScorerIncidentRecord", "E2", "calibration_scorer", "csir"],
  ["CalibrationVerificationReceipt", "E3", "independent_verifier", "cvr"],
  ["ProtocolAuthorDerivedValueProposal", "E4", "protocol_author", "padvp"],
] as const satisfies readonly (readonly [string, CalibrationEvidenceStage, PrincipalRole, string])[];

export type CalibrationEvidenceRecordType =
  (typeof CALIBRATION_EVIDENCE_RECORD_SPECS)[number][0];
export type CalibrationEvidenceOwnerRole =
  | "calibration_executor"
  | "calibration_evaluator"
  | "calibration_scorer"
  | "independent_verifier"
  | "protocol_author";

export const CALIBRATION_ATTEMPT_TERMINAL_DISPOSITIONS = [
  "aggregate_succeeded",
  "calibration_withdrawn",
  "calibration_failed",
] as const;
export type CalibrationAttemptTerminalDisposition =
  (typeof CALIBRATION_ATTEMPT_TERMINAL_DISPOSITIONS)[number];

export const CALIBRATION_VERIFIED_DISPOSITIONS = [
  "verified_aggregate",
  "verified_withdrawal",
  "verified_failure",
] as const;
export type CalibrationVerifiedDisposition =
  (typeof CALIBRATION_VERIFIED_DISPOSITIONS)[number];

export const CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX = [
  {
    stage: "E0",
    ownerRole: "calibration_executor",
    recordTypes: [
      "CalibrationExecutionReceipt",
      "CalibrationUsageReceipt",
      "CalibrationIncidentRecord",
    ],
  },
  {
    stage: "E1",
    ownerRole: "calibration_evaluator",
    recordTypes: [
      "CalibrationMeasurementCommitment",
      "CalibrationEvaluatorFailureRecord",
      "CalibrationEvaluatorIncidentRecord",
    ],
  },
  {
    stage: "E2",
    ownerRole: "calibration_scorer",
    recordTypes: [
      "AggregateCalibrationCommitment",
      "RejectedDerivationCandidateCommitment",
      "CalibrationWithdrawalRecord",
      "CalibrationScorerFailureRecord",
      "CalibrationScorerIncidentRecord",
    ],
  },
  {
    stage: "E3",
    ownerRole: "independent_verifier",
    recordTypes: ["CalibrationVerificationReceipt"],
  },
  {
    stage: "E4",
    ownerRole: "protocol_author",
    recordTypes: ["ProtocolAuthorDerivedValueProposal"],
  },
] as const;

export const CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX = [
  {
    stage: "E0",
    permitted: ["opaque_execution_commitment", "opaque_accounting_commitment", "incident_commitment"],
    prohibited: ["task_body", "raw_model_output", "verifier_source", "label", "answer", "credential", "protected_path"],
  },
  {
    stage: "E1",
    permitted: ["normalized_measurement_commitment", "missingness_state", "incident_commitment", "failure_commitment"],
    prohibited: ["task_body", "raw_model_output", "verifier_source", "direct_protocol_author_release", "credential", "protected_path"],
  },
  {
    stage: "E2",
    permitted: ["ordered_E1_commitments", "grid_commitment", "rejected_value_commitment", "rule_branch", "precision_check_commitment", "withdrawal_state"],
    prohibited: ["evaluator_raw", "task_body", "raw_model_output", "verifier_source", "credential", "protected_path"],
  },
  {
    stage: "E3",
    permitted: ["reference_only_verification", "aggregate_verification_commitment"],
    prohibited: ["derived_value", "task_body", "raw_model_output", "verifier_source", "credential", "protected_path"],
  },
  {
    stage: "E4",
    permitted: ["independently_verified_aggregate_reference", "derived_value_commitment"],
    prohibited: ["unverified_aggregate", "task_body", "raw_model_output", "verifier_source", "credential", "protected_path", "promotion_state", "deployment_state"],
  },
] as const;

export const CALIBRATION_EVIDENCE_GRAPH_CONTRACT = {
  stages: CALIBRATION_EVIDENCE_STAGES,
  allowedImmediateEdges: ["E0->E1", "E1->E2", "E2->E3", "E3->E4"],
  forbiddenEdges: [
    "E0->E2",
    "E0->E3",
    "E0->E4",
    "E1->E3",
    "E1->E4",
    "E2->E4",
    "evaluator_raw->E2",
    "E1->O",
    "E2->O",
    "E4->O_without_accepted_freeze_transaction",
  ],
  directProtocolAuthorReleaseFromE1Allowed: false,
  executorToScorerBypassAllowed: false,
  scorerRawOrProtectedAccessAllowed: false,
  attemptMixingAllowed: false,
  terminalDispositions: CALIBRATION_ATTEMPT_TERMINAL_DISPOSITIONS,
  verifiedDispositions: CALIBRATION_VERIFIED_DISPOSITIONS,
  exactlyOneTerminalDispositionPerAttempt: true,
  e0ExecutionAndUsagePerExpectedStratumExactlyOnce: true,
  e0OrphanOrReuseAllowed: false,
  accountingHeadMustMatchAcrossE0AndE1: true,
  e3MustMatchTerminalE2Branch: true,
  e4AllowedOnlyAfterVerifiedAggregate: true,
  oCreationAllowed: false,
  oActivationAllowed: false,
} as const;

export const CALIBRATION_EVIDENCE_DISPOSITION = {
  publicDevelopment: true,
  synthetic: true,
  authorizedForResearchEvidence: false,
  admissibleAsCalibrationEvidence: false,
  admissibleAsNumericFreezeValue: false,
  confirmatory: false,
} as const;

export const CALIBRATION_EVIDENCE_ZERO_BUDGET = {
  providerModelRequestAttempts: 0,
  totalChargedTokens: 0,
  providerCostMicros: 0,
  toolAttempts: 0,
  wallClockSeconds: 0,
  processCount: 0,
  cpuSeconds: 0,
  memoryMiB: 0,
  outputBytes: 0,
  protectedDataAccesses: 0,
} as const;

export interface SyntheticCalibrationCapabilityDescriptor {
  readonly schemaVersion: 1;
  readonly hashDomain: "SyntheticCalibrationCapabilityDescriptor.v1";
  readonly descriptorType: "synthetic_calibration_capability_descriptor";
  readonly capabilityCommitment: string;
  readonly datasetCommitment: string;
  readonly planCommitment: string;
  readonly gridCommitment: string;
  readonly budgetCommitment: string;
  readonly expectedStrataCommitments: readonly string[];
  readonly bodyFree: true;
  readonly oneTime: true;
  readonly opaqueCommitmentsOnly: true;
  readonly lifecycle: {
    readonly issued: false;
    readonly consumed: false;
    readonly handle: null;
    readonly executionAuthorized: false;
    readonly issuanceReceiptId: null;
    readonly consumptionReceiptId: null;
  };
  readonly replay: {
    readonly maximumConsumptionCount: 1;
    readonly observedConsumptionCount: 0;
    readonly replayDetected: false;
    readonly replayAccepted: false;
  };
  readonly budget: typeof CALIBRATION_EVIDENCE_ZERO_BUDGET;
  readonly disposition: typeof CALIBRATION_EVIDENCE_DISPOSITION;
  readonly forbiddenMaterial: readonly [
    "task_body",
    "verifier_logic",
    "label",
    "answer",
    "path",
    "real_handle",
    "provider_credential",
    "actual_model_identity",
    "active_authority",
  ];
}

export function buildSyntheticCalibrationCapabilityDescriptor(): SyntheticCalibrationCapabilityDescriptor {
  return {
    schemaVersion: 1,
    hashDomain: "SyntheticCalibrationCapabilityDescriptor.v1",
    descriptorType: "synthetic_calibration_capability_descriptor",
    capabilityCommitment: sha256Text("seh.public-development.calibration-capability.v1"),
    datasetCommitment: sha256Text("seh.public-development.synthetic-dataset.v1"),
    planCommitment: sha256Text("seh.public-development.no-plan.v1"),
    gridCommitment: sha256Text("seh.public-development.value-free-grid.v1"),
    budgetCommitment: sha256Text("seh.public-development.zero-budget.v1"),
    expectedStrataCommitments: [
      sha256Text("seh.public-development.synthetic-stratum.alpha.v1"),
      sha256Text("seh.public-development.synthetic-stratum.beta.v1"),
    ],
    bodyFree: true,
    oneTime: true,
    opaqueCommitmentsOnly: true,
    lifecycle: {
      issued: false,
      consumed: false,
      handle: null,
      executionAuthorized: false,
      issuanceReceiptId: null,
      consumptionReceiptId: null,
    },
    replay: {
      maximumConsumptionCount: 1,
      observedConsumptionCount: 0,
      replayDetected: false,
      replayAccepted: false,
    },
    budget: CALIBRATION_EVIDENCE_ZERO_BUDGET,
    disposition: CALIBRATION_EVIDENCE_DISPOSITION,
    forbiddenMaterial: [
      "task_body",
      "verifier_logic",
      "label",
      "answer",
      "path",
      "real_handle",
      "provider_credential",
      "actual_model_identity",
      "active_authority",
    ],
  };
}

export interface CalibrationEvidenceReference {
  readonly evidenceRecordId: string;
  readonly evidenceRecordHash: string;
  readonly stage: CalibrationEvidenceStage;
  readonly recordType: CalibrationEvidenceRecordType;
}

export interface CalibrationExecutionPayload {
  readonly stratumCommitment: string;
  readonly executionCommitment: string;
  readonly accountingHeadCommitment: string;
  readonly capabilityCommitment: string;
  readonly executionOccurred: false;
}

export interface CalibrationUsagePayload {
  readonly stratumCommitment: string;
  readonly executionReceiptId: string;
  readonly usageCommitment: string;
  readonly accountingHeadCommitment: string;
  readonly capabilityCommitment: string;
  readonly chargeObserved: false;
}

export interface CalibrationIncidentPayload {
  readonly stratumCommitment: string;
  readonly incidentCommitment: string;
  readonly incidentClass: "synthetic_conformance_incident";
  readonly disclosed: true;
  readonly realIncidentObserved: false;
}

export interface CalibrationMeasurementPayload {
  readonly stratumCommitment: string;
  readonly executionReceiptId: string;
  readonly usageReceiptId: string;
  readonly accountingHeadCommitment: string;
  readonly normalizedMeasurementCommitment: string;
  readonly normalizationContractCommitment: string;
  readonly missingnessState: "complete" | "missing_declared";
  readonly incidentCommitments: readonly string[];
  readonly rawMeasurementPresent: false;
}

export interface CalibrationEvaluatorFailurePayload {
  readonly stratumCommitment: string;
  readonly incidentRecordId: string;
  readonly failureCommitment: string;
  readonly failureClass: "synthetic_missingness" | "synthetic_evaluator_failure";
  readonly missingnessDeclared: true;
  readonly directProtocolAuthorRelease: false;
}

export interface CalibrationEvaluatorIncidentPayload {
  readonly stratumCommitment: string;
  readonly incidentRecordId: string;
  readonly incidentCommitment: string;
  readonly incidentClass: "synthetic_evaluator_incident";
  readonly incidentDisclosed: true;
  readonly directProtocolAuthorRelease: false;
}

export interface AggregateCalibrationPayload {
  readonly terminalDisposition: "aggregate_succeeded";
  readonly orderedE1RecordIds: readonly string[];
  readonly expectedStrataCommitments: readonly string[];
  readonly observedStrata: readonly {
    readonly stratumCommitment: string;
    readonly measurementRecordId: string;
  }[];
  readonly gridCommitment: string;
  readonly rejectedCandidateCommitments: readonly string[];
  readonly ruleBranch: "synthetic_conformance_only";
  readonly precisionCheckCommitment: string;
  readonly evaluatorFailureRecordIds: readonly string[];
  readonly evaluatorIncidentRecordIds: readonly string[];
  readonly missingnessReported: false;
  readonly incidentsReported: false;
  readonly withdrawalState: "not_withdrawn_synthetic";
  readonly requiredStrataComplete: true;
  readonly e0ToE1AccountingComplete: true;
  readonly unresolvedEvaluatorFailureCount: 0;
  readonly unmatchedIncidentCount: 0;
  readonly rawEvaluatorInputPresent: false;
  readonly protectedDataAccessed: false;
}

export interface RejectedDerivationCandidatePayload {
  readonly rejectedCandidateCommitment: string;
  readonly gridCommitment: string;
  readonly rejectionReason: "synthetic_infeasible" | "synthetic_precision_limited";
  readonly valueDisclosed: false;
}

export interface CalibrationWithdrawalPayload {
  readonly terminalDisposition: "calibration_withdrawn";
  readonly withdrawalCommitment: string;
  readonly withdrawalState: "synthetic_withdrawal";
  readonly withdrawalReason: "missing_required_stratum";
  readonly selectedValuePresent: false;
}

export interface CalibrationScorerFailurePayload {
  readonly terminalDisposition: "calibration_failed";
  readonly failureCommitment: string;
  readonly failureClass: "synthetic_scorer_failure";
  readonly rawEvaluatorInputPresent: false;
  readonly protectedDataAccessed: false;
}

export interface CalibrationScorerIncidentPayload {
  readonly incidentCommitment: string;
  readonly incidentClass: "synthetic_scorer_incident";
  readonly incidentDisclosed: true;
  readonly rawEvaluatorInputPresent: false;
  readonly protectedDataAccessed: false;
}

export interface CalibrationVerificationPayload {
  readonly disposition: CalibrationVerifiedDisposition;
  readonly verifiedE2RecordIds: readonly string[];
  readonly terminalRecordIds: readonly string[];
  readonly aggregateRecordId: string | null;
  readonly withdrawalRecordId: string | null;
  readonly failureRecordIds: readonly string[];
  readonly verificationCommitment: string;
  readonly referenceOnly: true;
  readonly aggregateVerified: boolean;
  readonly branchExclusivityVerified: true;
  readonly e0ToE1CoverageVerified: true;
  readonly e1ToE2CoverageVerified: true;
  readonly e4Eligible: boolean;
  readonly graphVerified: true;
  readonly missingnessAndIncidentCoverageVerified: true;
  readonly grantsAuthority: false;
}

export interface ProtocolAuthorDerivedValuePayload {
  readonly aggregateRecordId: string;
  readonly verificationReceiptId: string;
  readonly derivedValueCommitment: string;
  readonly disclosure: "commitment_only";
  readonly independentlyVerified: true;
  readonly freezeTransactionId: null;
  readonly finalProtocolId: null;
  readonly oProposalId: null;
  readonly oActivationId: null;
  readonly grantsAuthority: false;
}

export type CalibrationEvidencePayload =
  | CalibrationExecutionPayload
  | CalibrationUsagePayload
  | CalibrationIncidentPayload
  | CalibrationMeasurementPayload
  | CalibrationEvaluatorFailurePayload
  | CalibrationEvaluatorIncidentPayload
  | AggregateCalibrationPayload
  | RejectedDerivationCandidatePayload
  | CalibrationWithdrawalPayload
  | CalibrationScorerFailurePayload
  | CalibrationScorerIncidentPayload
  | CalibrationVerificationPayload
  | ProtocolAuthorDerivedValuePayload;

export interface CalibrationEvidenceRecord {
  readonly schemaVersion: 1;
  readonly hashDomain: "CalibrationEvidenceRecord.v1";
  readonly evidenceRecordId: string;
  readonly recordType: CalibrationEvidenceRecordType;
  readonly stage: CalibrationEvidenceStage;
  readonly attemptCommitment: string;
  readonly dependencies: readonly CalibrationEvidenceReference[];
  readonly payload: CalibrationEvidencePayload;
  readonly disposition: typeof CALIBRATION_EVIDENCE_DISPOSITION;
  readonly budget: typeof CALIBRATION_EVIDENCE_ZERO_BUDGET;
  readonly creationMode: {
    readonly directExclusiveOwnerSignature: true;
    readonly delegated: false;
    readonly proxied: false;
    readonly wrapped: false;
    readonly aliased: false;
    readonly cosigned: false;
    readonly combinedRecordTypes: false;
  };
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly evidenceRecordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedCalibrationEvidenceRecord = Omit<
  CalibrationEvidenceRecord,
  | "schemaVersion"
  | "hashDomain"
  | "evidenceRecordId"
  | "stage"
  | "recordedBy"
  | "evidenceRecordHash"
  | "publicPrincipal"
  | "attestation"
>;

export interface CalibrationEvidenceRoleBinding {
  readonly role: CalibrationEvidenceOwnerRole | "audit_store";
  readonly publicPrincipal: PublicPrincipal;
  readonly processIdentity: string;
  readonly currentCapabilityHandles: readonly [];
  readonly delegatedCapabilityIds: readonly [];
  readonly proxyPrincipalIds: readonly [];
  readonly wrapperPrincipalIds: readonly [];
  readonly roleAliases: readonly [];
  readonly cosignerKeyIds: readonly [];
}

export interface CalibrationEvidenceRoleBoundary {
  readonly calibrationExecutor: CalibrationEvidenceRoleBinding;
  readonly calibrationEvaluator: CalibrationEvidenceRoleBinding;
  readonly calibrationScorer: CalibrationEvidenceRoleBinding;
  readonly independentVerifier: CalibrationEvidenceRoleBinding;
  readonly protocolAuthor: CalibrationEvidenceRoleBinding;
  readonly auditStore: CalibrationEvidenceRoleBinding;
  readonly requiredInequalities: readonly [
    "principalId",
    "instanceId",
    "keyId",
    "publicKeyDigest",
    "processIdentity",
  ];
  readonly exclusiveOwnershipAndNoDelegationProxyWrapperAliasCosign: true;
}

function recordSpec(recordType: CalibrationEvidenceRecordType) {
  const result = CALIBRATION_EVIDENCE_RECORD_SPECS.find(([candidate]) => candidate === recordType);
  assertCondition(result !== undefined, "SCHEMA_INVALID", `Unknown calibration evidence record type ${recordType}`);
  return result;
}

function recordIdentity(input: {
  readonly recordType: CalibrationEvidenceRecordType;
  readonly stage: CalibrationEvidenceStage;
  readonly attemptCommitment: string;
  readonly dependencies: readonly CalibrationEvidenceReference[];
  readonly payload: CalibrationEvidencePayload;
  readonly disposition: typeof CALIBRATION_EVIDENCE_DISPOSITION;
  readonly budget: typeof CALIBRATION_EVIDENCE_ZERO_BUDGET;
  readonly creationMode: CalibrationEvidenceRecord["creationMode"];
  readonly recordedAt: string;
}): JsonValue {
  return {
    hashDomain: "CalibrationEvidenceRecord.v1",
    ...input,
  } as unknown as JsonValue;
}

function signedBody(record: CalibrationEvidenceRecord): Omit<CalibrationEvidenceRecord, "attestation"> {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function hashCore(record: CalibrationEvidenceRecord): Omit<CalibrationEvidenceRecord, "evidenceRecordHash" | "publicPrincipal" | "attestation"> {
  const {
    evidenceRecordHash: _hash,
    publicPrincipal: _principal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

export function calibrationEvidenceReference(record: CalibrationEvidenceRecord): CalibrationEvidenceReference {
  return {
    evidenceRecordId: record.evidenceRecordId,
    evidenceRecordHash: record.evidenceRecordHash,
    stage: record.stage,
    recordType: record.recordType,
  };
}

export function createCalibrationEvidenceRecord(input: {
  readonly value: UnsignedCalibrationEvidenceRecord;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): CalibrationEvidenceRecord {
  const [, stage, ownerRole, prefix] = recordSpec(input.value.recordType);
  assertCondition(
    input.signer.identity.role === ownerRole,
    "AUTHORIZATION_DENIED",
    `${input.value.recordType} requires exclusive ${ownerRole} creation`,
  );
  const identityValue = recordIdentity({ ...input.value, stage });
  const evidenceRecordId = contentId("ci-sha256", identityValue).replace("ci-sha256:", `${prefix}-sha256:`);
  const core = {
    schemaVersion: 1 as const,
    hashDomain: "CalibrationEvidenceRecord.v1" as const,
    evidenceRecordId,
    stage,
    ...input.value,
    recordedBy: input.signer.identity,
  };
  const body = {
    ...core,
    evidenceRecordHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const record: CalibrationEvidenceRecord = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  verifyCalibrationEvidenceRecord({ record, schemas: input.schemas });
  return record;
}

export function verifyCalibrationEvidenceRecord(input: {
  readonly record: CalibrationEvidenceRecord;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(CALIBRATION_EVIDENCE_CONTRACT_SCHEMA_ID, input.record as unknown as JsonValue);
  const [, expectedStage, expectedRole, prefix] = recordSpec(input.record.recordType);
  assertCondition(input.record.stage === expectedStage, "SCHEMA_INVALID", "Evidence stage differs from record type");
  assertCondition(
    input.record.recordedBy.role === expectedRole &&
      canonicalize(input.record.recordedBy) === canonicalize(input.record.publicPrincipal.identity),
    "AUTHORIZATION_DENIED",
    `Evidence record is not directly signed by its exclusive ${expectedRole} owner`,
  );
  assertCondition(
    input.record.recordedBy.modelIdentityHash === undefined || input.record.recordedBy.modelIdentityHash === null,
    "AUTHORIZATION_DENIED",
    "Actual model identity is forbidden in calibration evidence contracts",
  );
  const registry = new PrincipalRegistry();
  registry.register(input.record.publicPrincipal);
  registry.verify(
    input.record.recordedBy,
    signedBody(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
  assertCondition(
    input.record.evidenceRecordHash === sha256(hashCore(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Calibration evidence record hash differs",
  );
  const {
    schemaVersion: _schemaVersion,
    hashDomain: _hashDomain,
    evidenceRecordId: _id,
    stage: _stage,
    recordedBy: _recordedBy,
    evidenceRecordHash: _hash,
    publicPrincipal: _principal,
    attestation: _attestation,
    ...unsigned
  } = input.record;
  const expectedId = contentId("ci-sha256", recordIdentity({ ...unsigned, stage: expectedStage })).replace(
    "ci-sha256:",
    `${prefix}-sha256:`,
  );
  assertCondition(input.record.evidenceRecordId === expectedId, "HASH_MISMATCH", "Calibration evidence content identity differs");
}

function roleBindings(boundary: CalibrationEvidenceRoleBoundary): readonly CalibrationEvidenceRoleBinding[] {
  return [
    boundary.calibrationExecutor,
    boundary.calibrationEvaluator,
    boundary.calibrationScorer,
    boundary.independentVerifier,
    boundary.protocolAuthor,
    boundary.auditStore,
  ];
}

function ownerBinding(boundary: CalibrationEvidenceRoleBoundary, role: CalibrationEvidenceOwnerRole): CalibrationEvidenceRoleBinding {
  switch (role) {
    case "calibration_executor": return boundary.calibrationExecutor;
    case "calibration_evaluator": return boundary.calibrationEvaluator;
    case "calibration_scorer": return boundary.calibrationScorer;
    case "independent_verifier": return boundary.independentVerifier;
    case "protocol_author": return boundary.protocolAuthor;
  }
}

export function verifyCalibrationEvidenceRoleBoundary(boundary: CalibrationEvidenceRoleBoundary): void {
  const expectedRoles = [
    "calibration_executor",
    "calibration_evaluator",
    "calibration_scorer",
    "independent_verifier",
    "protocol_author",
    "audit_store",
  ] as const;
  const bindings = roleBindings(boundary);
  assertCondition(bindings.length === expectedRoles.length, "AUTHORIZATION_DENIED", "Role boundary is incomplete");
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index]!;
    const expectedRole = expectedRoles[index]!;
    assertCondition(
      binding.role === expectedRole && binding.publicPrincipal.identity.role === expectedRole,
      "AUTHORIZATION_DENIED",
      `Role binding ${expectedRole} differs`,
    );
    assertCondition(
      binding.currentCapabilityHandles.length === 0 &&
        binding.delegatedCapabilityIds.length === 0 &&
        binding.proxyPrincipalIds.length === 0 &&
        binding.wrapperPrincipalIds.length === 0 &&
        binding.roleAliases.length === 0 &&
        binding.cosignerKeyIds.length === 0,
      "AUTHORIZATION_DENIED",
      `${expectedRole} contains forbidden authority indirection`,
    );
    assertCondition(
      binding.publicPrincipal.identity.modelIdentityHash === undefined ||
        binding.publicPrincipal.identity.modelIdentityHash === null,
      "AUTHORIZATION_DENIED",
      `${expectedRole} contains an actual model identity`,
    );
  }
  const dimensions = [
    (value: CalibrationEvidenceRoleBinding) => value.publicPrincipal.identity.principalId,
    (value: CalibrationEvidenceRoleBinding) => value.publicPrincipal.identity.instanceId,
    (value: CalibrationEvidenceRoleBinding) => value.publicPrincipal.keyId,
    (value: CalibrationEvidenceRoleBinding) => value.publicPrincipal.identity.identityDigest,
    (value: CalibrationEvidenceRoleBinding) => value.processIdentity,
  ];
  for (const dimension of dimensions) {
    const values = bindings.map(dimension);
    assertCondition(new Set(values).size === values.length, "AUTHORIZATION_DENIED", "Calibration evidence roles collapse across a required identity dimension");
  }
}

function recordMap(records: readonly CalibrationEvidenceRecord[]): Map<string, CalibrationEvidenceRecord> {
  const map = new Map<string, CalibrationEvidenceRecord>();
  for (const record of records) {
    assertCondition(!map.has(record.evidenceRecordId), "CONFLICT", `Duplicate evidence record ${record.evidenceRecordId}`);
    map.set(record.evidenceRecordId, record);
  }
  return map;
}

function assertExactSet(actual: readonly string[], expected: readonly string[], label: string): void {
  assertCondition(actual.length === expected.length, "VERIFICATION_FAILED", `${label} cardinality differs`);
  assertCondition(new Set(actual).size === actual.length, "VERIFICATION_FAILED", `${label} contains duplicates`);
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  assertCondition(canonicalize(sortedActual) === canonicalize(sortedExpected), "VERIFICATION_FAILED", `${label} differs`);
}

function typedRecords<T extends CalibrationEvidenceRecordType>(
  records: readonly CalibrationEvidenceRecord[],
  recordType: T,
): CalibrationEvidenceRecord[] {
  return records.filter((record) => record.recordType === recordType);
}

export interface CalibrationEvidenceChainVerificationResult {
  readonly recordCount: number;
  readonly stageCounts: Readonly<Record<CalibrationEvidenceStage, number>>;
  readonly terminalDisposition: CalibrationAttemptTerminalDisposition;
  readonly verifiedDisposition: CalibrationVerifiedDisposition;
  readonly e4Eligible: boolean;
  readonly expectedStratumCount: number;
  readonly observedStratumCount: number;
  readonly e0ExecutionCoverageCount: number;
  readonly e0UsageCoverageCount: number;
  readonly orphanE0Count: 0;
  readonly reusedE0Count: 0;
  readonly unmatchedIncidentCount: 0;
  readonly issuedCapabilities: 0;
  readonly consumedCapabilities: 0;
  readonly providerModelRequestAttempts: 0;
  readonly protectedDataAccesses: 0;
  readonly oProposals: 0;
  readonly oActivations: 0;
  readonly authoritiesGranted: 0;
}

export function verifySyntheticCalibrationEvidenceChain(input: {
  readonly records: readonly CalibrationEvidenceRecord[];
  readonly capability: SyntheticCalibrationCapabilityDescriptor;
  readonly roleBoundary: CalibrationEvidenceRoleBoundary;
  readonly schemas: SchemaRegistry;
}): CalibrationEvidenceChainVerificationResult {
  input.schemas.validate(CALIBRATION_EVIDENCE_CONTRACT_SCHEMA_ID, input.capability as unknown as JsonValue);
  assertCondition(
    canonicalize(input.capability) === canonicalize(buildSyntheticCalibrationCapabilityDescriptor()),
    "VERIFICATION_FAILED",
    "Synthetic calibration capability descriptor differs from the closed zero-authority contract",
  );
  verifyCalibrationEvidenceRoleBoundary(input.roleBoundary);
  assertCondition(input.records.length > 0, "VERIFICATION_FAILED", "Calibration evidence chain is empty");
  const byId = recordMap(input.records);
  const stageCounts = { E0: 0, E1: 0, E2: 0, E3: 0, E4: 0 };
  const attemptCommitment = input.records[0]!.attemptCommitment;
  let previousStageIndex = -1;
  for (const record of input.records) {
    verifyCalibrationEvidenceRecord({ record, schemas: input.schemas });
    stageCounts[record.stage] += 1;
    assertCondition(
      record.attemptCommitment === attemptCommitment,
      "VERIFICATION_FAILED",
      "Evidence from different calibration attempts was mixed",
    );
    const stageIndex = CALIBRATION_EVIDENCE_STAGES.indexOf(record.stage);
    assertCondition(stageIndex >= previousStageIndex, "VERIFICATION_FAILED", "Evidence records are reordered across stages");
    previousStageIndex = stageIndex;
    const [, , ownerRole] = recordSpec(record.recordType);
    const binding = ownerBinding(input.roleBoundary, ownerRole as CalibrationEvidenceOwnerRole);
    assertCondition(
      canonicalize(record.publicPrincipal) === canonicalize(binding.publicPrincipal),
      "AUTHORIZATION_DENIED",
      `${record.recordType} signer differs from its exclusive role binding`,
    );
    if (record.stage === "E0") {
      assertCondition(record.dependencies.length === 0, "VERIFICATION_FAILED", "E0 may not have predecessors");
      continue;
    }
    assertCondition(record.dependencies.length > 0, "VERIFICATION_FAILED", `${record.stage} has no immediate predecessor`);
    const expectedPredecessor = CALIBRATION_EVIDENCE_STAGES[stageIndex - 1]!;
    for (const reference of record.dependencies) {
      const dependency = byId.get(reference.evidenceRecordId);
      assertCondition(dependency !== undefined, "VERIFICATION_FAILED", `Missing dependency ${reference.evidenceRecordId}`);
      assertCondition(
        canonicalize(reference) === canonicalize(calibrationEvidenceReference(dependency)),
        "VERIFICATION_FAILED",
        `Dependency commitment differs for ${reference.evidenceRecordId}`,
      );
      assertCondition(
        dependency.stage === expectedPredecessor,
        "VERIFICATION_FAILED",
        `Forbidden evidence edge ${dependency.stage}->${record.stage}`,
      );
    }
  }
  for (const stage of ["E0", "E1", "E2", "E3"] as const) {
    assertCondition(stageCounts[stage] > 0, "VERIFICATION_FAILED", `Evidence stage ${stage} is omitted`);
  }

  const executions = typedRecords(input.records, "CalibrationExecutionReceipt");
  const usages = typedRecords(input.records, "CalibrationUsageReceipt");
  const executorIncidents = typedRecords(input.records, "CalibrationIncidentRecord");
  const measurements = typedRecords(input.records, "CalibrationMeasurementCommitment");
  const evaluatorFailures = typedRecords(input.records, "CalibrationEvaluatorFailureRecord");
  const evaluatorIncidents = typedRecords(input.records, "CalibrationEvaluatorIncidentRecord");
  const aggregates = typedRecords(input.records, "AggregateCalibrationCommitment");
  const rejected = typedRecords(input.records, "RejectedDerivationCandidateCommitment");
  const withdrawals = typedRecords(input.records, "CalibrationWithdrawalRecord");
  const scorerFailures = typedRecords(input.records, "CalibrationScorerFailureRecord");
  const scorerIncidents = typedRecords(input.records, "CalibrationScorerIncidentRecord");
  const verifications = typedRecords(input.records, "CalibrationVerificationReceipt");
  const proposals = typedRecords(input.records, "ProtocolAuthorDerivedValueProposal");
  assertCondition(verifications.length === 1, "VERIFICATION_FAILED", "Calibration attempt requires exactly one E3 verification receipt");
  assertCondition(aggregates.length <= 1 && withdrawals.length <= 1, "VERIFICATION_FAILED", "Terminal aggregate or withdrawal cardinality differs");
  assertCondition(executions.length === input.capability.expectedStrataCommitments.length, "VERIFICATION_FAILED", "Execution count differs from expected strata");
  assertCondition(usages.length === input.capability.expectedStrataCommitments.length, "VERIFICATION_FAILED", "Usage count differs from expected strata");
  assertCondition(measurements.length === input.capability.expectedStrataCommitments.length, "VERIFICATION_FAILED", "Measurement count differs from expected strata");

  const executionByStratum = new Map<string, CalibrationEvidenceRecord>();
  for (const execution of executions) {
    const payload = execution.payload as CalibrationExecutionPayload;
    assertCondition(payload.capabilityCommitment === input.capability.capabilityCommitment, "VERIFICATION_FAILED", "E0 execution capability commitment differs");
    assertCondition(!executionByStratum.has(payload.stratumCommitment), "VERIFICATION_FAILED", "Duplicate E0 execution stratum");
    executionByStratum.set(payload.stratumCommitment, execution);
  }
  assertExactSet([...executionByStratum.keys()], input.capability.expectedStrataCommitments, "E0 execution strata");
  const usageByStratum = new Map<string, CalibrationEvidenceRecord>();
  for (const usage of usages) {
    const payload = usage.payload as CalibrationUsagePayload;
    assertCondition(payload.capabilityCommitment === input.capability.capabilityCommitment, "VERIFICATION_FAILED", "E0 usage capability commitment differs");
    assertCondition(!usageByStratum.has(payload.stratumCommitment), "VERIFICATION_FAILED", "Duplicate E0 usage stratum");
    const execution = executionByStratum.get(payload.stratumCommitment);
    assertCondition(execution !== undefined && payload.executionReceiptId === execution.evidenceRecordId, "VERIFICATION_FAILED", "E0 usage references the wrong execution receipt");
    assertCondition(payload.accountingHeadCommitment === (execution.payload as CalibrationExecutionPayload).accountingHeadCommitment, "VERIFICATION_FAILED", "E0 accounting heads differ");
    usageByStratum.set(payload.stratumCommitment, usage);
  }
  assertExactSet([...usageByStratum.keys()], input.capability.expectedStrataCommitments, "E0 usage strata");

  const e0UseCounts = new Map<string, number>(input.records.filter((record) => record.stage === "E0").map((record) => [record.evidenceRecordId, 0]));
  for (const record of input.records.filter((candidate) => candidate.stage === "E1")) {
    for (const dependency of record.dependencies) {
      const count = e0UseCounts.get(dependency.evidenceRecordId);
      assertCondition(count !== undefined, "VERIFICATION_FAILED", "E1 references a non-E0 accounting source");
      e0UseCounts.set(dependency.evidenceRecordId, count + 1);
    }
  }
  for (const [recordId, count] of e0UseCounts) {
    assertCondition(count === 1, "VERIFICATION_FAILED", count === 0 ? `Orphan E0 receipt ${recordId}` : `Reused E0 receipt ${recordId}`);
  }

  const measurementStrata = measurements.map((record) => (record.payload as CalibrationMeasurementPayload).stratumCommitment);
  assertExactSet(measurementStrata, input.capability.expectedStrataCommitments, "E1 measurement strata");
  for (const measurement of measurements) {
    const payload = measurement.payload as CalibrationMeasurementPayload;
    const execution = executionByStratum.get(payload.stratumCommitment);
    const usage = usageByStratum.get(payload.stratumCommitment);
    assertCondition(execution !== undefined && usage !== undefined, "VERIFICATION_FAILED", "E1 measurement has no matching E0 accounting pair");
    assertExactSet(
      measurement.dependencies.map((reference) => reference.evidenceRecordId),
      [execution.evidenceRecordId, usage.evidenceRecordId],
      "E1 execution and usage coverage",
    );
    assertCondition(payload.executionReceiptId === execution.evidenceRecordId && payload.usageReceiptId === usage.evidenceRecordId, "VERIFICATION_FAILED", "E1 accounting receipt IDs differ");
    assertCondition(payload.accountingHeadCommitment === (execution.payload as CalibrationExecutionPayload).accountingHeadCommitment && payload.accountingHeadCommitment === (usage.payload as CalibrationUsagePayload).accountingHeadCommitment, "VERIFICATION_FAILED", "E0/E1 accounting head differs");
    if (payload.missingnessState === "missing_declared") {
      const represented = evaluatorFailures.some(
        (record) =>
          (record.payload as CalibrationEvaluatorFailurePayload).stratumCommitment ===
          payload.stratumCommitment,
      );
      assertCondition(
        represented,
        "VERIFICATION_FAILED",
        "Declared E1 missingness has no evaluator failure record",
      );
    } else {
      assertCondition(
        !evaluatorFailures.some((record) => (record.payload as CalibrationEvaluatorFailurePayload).stratumCommitment === payload.stratumCommitment),
        "VERIFICATION_FAILED",
        "Complete E1 measurement has an evaluator failure",
      );
    }
    for (const incidentCommitment of payload.incidentCommitments) {
      const represented = evaluatorIncidents.some(
        (record) =>
          (record.payload as CalibrationEvaluatorIncidentPayload)
            .incidentCommitment === incidentCommitment,
      );
      assertCondition(
        represented,
        "VERIFICATION_FAILED",
        "E1 measurement incident commitment is unreported",
      );
    }
  }
  for (const failure of evaluatorFailures) {
    const payload = failure.payload as CalibrationEvaluatorFailurePayload;
    assertCondition(failure.dependencies.length === 1 && failure.dependencies[0]!.evidenceRecordId === payload.incidentRecordId, "VERIFICATION_FAILED", "Evaluator failure does not bind one executor incident");
    const incident = byId.get(payload.incidentRecordId);
    assertCondition(incident?.recordType === "CalibrationIncidentRecord" && (incident.payload as CalibrationIncidentPayload).stratumCommitment === payload.stratumCommitment, "VERIFICATION_FAILED", "Evaluator failure incident stratum differs");
  }
  for (const incident of evaluatorIncidents) {
    const payload = incident.payload as CalibrationEvaluatorIncidentPayload;
    assertCondition(incident.dependencies.length === 1 && incident.dependencies[0]!.evidenceRecordId === payload.incidentRecordId, "VERIFICATION_FAILED", "Evaluator incident does not bind one executor incident");
    const source = byId.get(payload.incidentRecordId);
    assertCondition(source?.recordType === "CalibrationIncidentRecord" && (source.payload as CalibrationIncidentPayload).stratumCommitment === payload.stratumCommitment, "VERIFICATION_FAILED", "Evaluator incident stratum differs");
    const measurement = measurements.find((record) => (record.payload as CalibrationMeasurementPayload).stratumCommitment === payload.stratumCommitment);
    assertCondition(measurement !== undefined && (measurement.payload as CalibrationMeasurementPayload).incidentCommitments.includes(payload.incidentCommitment), "VERIFICATION_FAILED", "Evaluator incident is unmatched by its measurement");
  }

  const allE1Ids = input.records.filter((record) => record.stage === "E1").map((record) => record.evidenceRecordId);
  const e1UseCounts = new Map<string, number>(allE1Ids.map((recordId) => [recordId, 0]));
  for (const record of input.records.filter((candidate) => candidate.stage === "E2")) {
    for (const dependency of record.dependencies) {
      const count = e1UseCounts.get(dependency.evidenceRecordId);
      assertCondition(count !== undefined, "VERIFICATION_FAILED", "E2 references a non-E1 record");
      e1UseCounts.set(dependency.evidenceRecordId, count + 1);
    }
  }
  for (const [recordId, count] of e1UseCounts) assertCondition(count === 1, "VERIFICATION_FAILED", count === 0 ? `Orphan E1 record ${recordId}` : `Reused E1 record ${recordId}`);

  for (const record of rejected) assertCondition((record.payload as RejectedDerivationCandidatePayload).gridCommitment === input.capability.gridCommitment, "VERIFICATION_FAILED", "Rejected candidate uses a substituted grid");

  const branchCount = (aggregates.length === 1 ? 1 : 0) + (withdrawals.length === 1 ? 1 : 0) + (scorerFailures.length > 0 ? 1 : 0);
  assertCondition(branchCount === 1, "VERIFICATION_FAILED", "Calibration attempt does not have exactly one terminal disposition");
  let terminalDisposition: CalibrationAttemptTerminalDisposition;
  let verifiedDisposition: CalibrationVerifiedDisposition;
  let terminalRecordIds: string[];
  let aggregateRecordId: string | null = null;
  let withdrawalRecordId: string | null = null;
  let failureRecordIds: string[] = [];
  if (aggregates.length === 1) {
    terminalDisposition = "aggregate_succeeded";
    verifiedDisposition = "verified_aggregate";
    const aggregate = aggregates[0]!;
    const aggregatePayload = aggregate.payload as AggregateCalibrationPayload;
    assertCondition(withdrawals.length === 0 && scorerFailures.length === 0 && scorerIncidents.length === 0, "VERIFICATION_FAILED", "Successful aggregate is mixed with withdrawal or terminal failure evidence");
    assertCondition(executorIncidents.length === 0 && evaluatorFailures.length === 0 && evaluatorIncidents.length === 0, "VERIFICATION_FAILED", "Successful aggregate contains unresolved evaluator or incident evidence");
    assertCondition(measurements.every((record) => (record.payload as CalibrationMeasurementPayload).missingnessState === "complete"), "VERIFICATION_FAILED", "Successful aggregate has missing required strata");
    assertExactSet(aggregate.dependencies.map((reference) => reference.evidenceRecordId), allE1Ids, "Aggregate E1 dependencies");
    assertCondition(canonicalize(aggregatePayload.orderedE1RecordIds) === canonicalize(allE1Ids), "VERIFICATION_FAILED", "Aggregate ordered E1 commitments differ");
    assertExactSet(aggregatePayload.expectedStrataCommitments, input.capability.expectedStrataCommitments, "Aggregate expected strata");
    assertExactSet(aggregatePayload.observedStrata.map((entry) => entry.stratumCommitment), input.capability.expectedStrataCommitments, "Aggregate observed strata");
    for (const entry of aggregatePayload.observedStrata) {
      const measurement = byId.get(entry.measurementRecordId);
      assertCondition(measurement?.recordType === "CalibrationMeasurementCommitment" && (measurement.payload as CalibrationMeasurementPayload).stratumCommitment === entry.stratumCommitment, "VERIFICATION_FAILED", "Aggregate observed stratum differs from E1");
    }
    assertCondition(aggregatePayload.terminalDisposition === terminalDisposition && aggregatePayload.gridCommitment === input.capability.gridCommitment, "VERIFICATION_FAILED", "Aggregate disposition or grid differs");
    assertExactSet(aggregatePayload.evaluatorFailureRecordIds, [], "Successful aggregate evaluator failures");
    assertExactSet(aggregatePayload.evaluatorIncidentRecordIds, [], "Successful aggregate evaluator incidents");
    terminalRecordIds = [aggregate.evidenceRecordId];
    aggregateRecordId = aggregate.evidenceRecordId;
  } else if (withdrawals.length === 1) {
    terminalDisposition = "calibration_withdrawn";
    verifiedDisposition = "verified_withdrawal";
    const withdrawal = withdrawals[0]!;
    const payload = withdrawal.payload as CalibrationWithdrawalPayload;
    assertCondition(aggregates.length === 0 && scorerFailures.length === 0 && scorerIncidents.length === 0, "VERIFICATION_FAILED", "Withdrawal is mixed with aggregate or terminal failure evidence");
    assertCondition(payload.terminalDisposition === terminalDisposition && payload.withdrawalState === "synthetic_withdrawal", "VERIFICATION_FAILED", "Withdrawal disposition differs");
    assertCondition(measurements.some((record) => (record.payload as CalibrationMeasurementPayload).missingnessState === "missing_declared") && evaluatorFailures.length > 0, "VERIFICATION_FAILED", "Withdrawal lacks declared missingness evidence");
    assertExactSet(withdrawal.dependencies.map((reference) => reference.evidenceRecordId), allE1Ids, "Withdrawal E1 coverage");
    terminalRecordIds = [withdrawal.evidenceRecordId];
    withdrawalRecordId = withdrawal.evidenceRecordId;
  } else {
    terminalDisposition = "calibration_failed";
    verifiedDisposition = "verified_failure";
    assertCondition(aggregates.length === 0 && withdrawals.length === 0 && scorerFailures.length > 0, "VERIFICATION_FAILED", "Failure branch differs");
    for (const failure of scorerFailures) assertCondition((failure.payload as CalibrationScorerFailurePayload).terminalDisposition === terminalDisposition, "VERIFICATION_FAILED", "Scorer failure disposition differs");
    failureRecordIds = scorerFailures.map((record) => record.evidenceRecordId);
    terminalRecordIds = [...failureRecordIds];
  }

  const verification = verifications[0]!;
  const verificationPayload = verification.payload as CalibrationVerificationPayload;
  const allE2Ids = input.records.filter((record) => record.stage === "E2").map((record) => record.evidenceRecordId);
  assertExactSet(
    verification.dependencies.map((reference) => reference.evidenceRecordId),
    allE2Ids,
    "E3 E2 dependencies",
  );
  assertExactSet(verificationPayload.verifiedE2RecordIds, allE2Ids, "E3 verified E2 records");
  assertExactSet(verificationPayload.terminalRecordIds, terminalRecordIds, "E3 terminal records");
  assertCondition(
    verificationPayload.disposition === verifiedDisposition &&
      verificationPayload.aggregateRecordId === aggregateRecordId &&
      verificationPayload.withdrawalRecordId === withdrawalRecordId,
    "VERIFICATION_FAILED",
    "E3 disposition does not match the terminal E2 branch",
  );
  assertExactSet(verificationPayload.failureRecordIds, failureRecordIds, "E3 failure records");
  const e4Eligible = terminalDisposition === "aggregate_succeeded";
  assertCondition(verificationPayload.aggregateVerified === e4Eligible && verificationPayload.e4Eligible === e4Eligible, "VERIFICATION_FAILED", "E3 E4 eligibility differs from terminal disposition");

  assertCondition(proposals.length === (e4Eligible ? 1 : 0), "VERIFICATION_FAILED", e4Eligible ? "Verified aggregate requires exactly one E4 proposal" : "E4 is forbidden after withdrawal or failure");
  if (e4Eligible) {
    const proposal = proposals[0]!;
    const proposalPayload = proposal.payload as ProtocolAuthorDerivedValuePayload;
    assertCondition(proposal.dependencies.length === 1 && proposal.dependencies[0]!.evidenceRecordId === verification.evidenceRecordId, "VERIFICATION_FAILED", "E4 does not depend exclusively on E3 verification");
    assertCondition(proposalPayload.verificationReceiptId === verification.evidenceRecordId && proposalPayload.aggregateRecordId === aggregateRecordId, "VERIFICATION_FAILED", "E4 references an ineligible verification or aggregate");
    assertCondition(proposalPayload.freezeTransactionId === null && proposalPayload.finalProtocolId === null && proposalPayload.oProposalId === null && proposalPayload.oActivationId === null && !proposalPayload.grantsAuthority, "AUTHORIZATION_DENIED", "E4 attempts a freeze, final identity, O transition, or authority grant");
  }

  return {
    recordCount: input.records.length,
    stageCounts,
    terminalDisposition,
    verifiedDisposition,
    e4Eligible,
    expectedStratumCount: input.capability.expectedStrataCommitments.length,
    observedStratumCount: measurements.filter((record) => (record.payload as CalibrationMeasurementPayload).missingnessState === "complete").length,
    e0ExecutionCoverageCount: executions.length,
    e0UsageCoverageCount: usages.length,
    orphanE0Count: 0,
    reusedE0Count: 0,
    unmatchedIncidentCount: 0,
    issuedCapabilities: 0,
    consumedCapabilities: 0,
    providerModelRequestAttempts: 0,
    protectedDataAccesses: 0,
    oProposals: 0,
    oActivations: 0,
    authoritiesGranted: 0,
  };
}

export interface CalibrationEvidenceFixtureSigners {
  readonly calibrationExecutor: PrincipalSigner;
  readonly calibrationEvaluator: PrincipalSigner;
  readonly calibrationScorer: PrincipalSigner;
  readonly independentVerifier: PrincipalSigner;
  readonly protocolAuthor: PrincipalSigner;
}

function creationMode(): CalibrationEvidenceRecord["creationMode"] {
  return {
    directExclusiveOwnerSignature: true,
    delegated: false,
    proxied: false,
    wrapped: false,
    aliased: false,
    cosigned: false,
    combinedRecordTypes: false,
  };
}

function fixtureRecord(input: {
  readonly recordType: CalibrationEvidenceRecordType;
  readonly attemptCommitment: string;
  readonly dependencies: readonly CalibrationEvidenceReference[];
  readonly payload: CalibrationEvidencePayload;
  readonly recordedAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): CalibrationEvidenceRecord {
  return createCalibrationEvidenceRecord({
    signer: input.signer,
    schemas: input.schemas,
    value: {
      recordType: input.recordType,
      attemptCommitment: input.attemptCommitment,
      dependencies: input.dependencies,
      payload: input.payload,
      disposition: CALIBRATION_EVIDENCE_DISPOSITION,
      budget: CALIBRATION_EVIDENCE_ZERO_BUDGET,
      creationMode: creationMode(),
      recordedAt: input.recordedAt,
    },
  });
}

export interface SyntheticCalibrationEvidenceScenarios {
  readonly success: readonly CalibrationEvidenceRecord[];
  readonly withdrawal: readonly CalibrationEvidenceRecord[];
  readonly failure: readonly CalibrationEvidenceRecord[];
}

interface ScenarioAccountingPair {
  readonly execution: CalibrationEvidenceRecord;
  readonly usage: CalibrationEvidenceRecord;
}

function buildAccountingPair(input: {
  readonly attemptCommitment: string;
  readonly stratumCommitment: string;
  readonly label: string;
  readonly offset: number;
  readonly time: (offset: number) => string;
  readonly hash: (label: string) => string;
  readonly capability: SyntheticCalibrationCapabilityDescriptor;
  readonly signers: CalibrationEvidenceFixtureSigners;
  readonly schemas: SchemaRegistry;
}): ScenarioAccountingPair {
  const accountingHeadCommitment = input.hash(`${input.label}.accounting-head`);
  const execution = fixtureRecord({
    recordType: "CalibrationExecutionReceipt",
    attemptCommitment: input.attemptCommitment,
    dependencies: [],
    signer: input.signers.calibrationExecutor,
    schemas: input.schemas,
    recordedAt: input.time(input.offset),
    payload: {
      stratumCommitment: input.stratumCommitment,
      executionCommitment: input.hash(`${input.label}.execution`),
      accountingHeadCommitment,
      capabilityCommitment: input.capability.capabilityCommitment,
      executionOccurred: false,
    },
  });
  const usage = fixtureRecord({
    recordType: "CalibrationUsageReceipt",
    attemptCommitment: input.attemptCommitment,
    dependencies: [],
    signer: input.signers.calibrationExecutor,
    schemas: input.schemas,
    recordedAt: input.time(input.offset + 1),
    payload: {
      stratumCommitment: input.stratumCommitment,
      executionReceiptId: execution.evidenceRecordId,
      usageCommitment: input.hash(`${input.label}.usage`),
      accountingHeadCommitment,
      capabilityCommitment: input.capability.capabilityCommitment,
      chargeObserved: false,
    },
  });
  return { execution, usage };
}

function buildMeasurement(input: {
  readonly attemptCommitment: string;
  readonly pair: ScenarioAccountingPair;
  readonly stratumCommitment: string;
  readonly label: string;
  readonly missingnessState: "complete" | "missing_declared";
  readonly incidentCommitments?: readonly string[];
  readonly recordedAt: string;
  readonly hash: (label: string) => string;
  readonly signers: CalibrationEvidenceFixtureSigners;
  readonly schemas: SchemaRegistry;
}): CalibrationEvidenceRecord {
  return fixtureRecord({
    recordType: "CalibrationMeasurementCommitment",
    attemptCommitment: input.attemptCommitment,
    dependencies: [calibrationEvidenceReference(input.pair.execution), calibrationEvidenceReference(input.pair.usage)],
    signer: input.signers.calibrationEvaluator,
    schemas: input.schemas,
    recordedAt: input.recordedAt,
    payload: {
      stratumCommitment: input.stratumCommitment,
      executionReceiptId: input.pair.execution.evidenceRecordId,
      usageReceiptId: input.pair.usage.evidenceRecordId,
      accountingHeadCommitment: (input.pair.execution.payload as CalibrationExecutionPayload).accountingHeadCommitment,
      normalizedMeasurementCommitment: input.hash(`${input.label}.measurement`),
      normalizationContractCommitment: input.hash("normalization"),
      missingnessState: input.missingnessState,
      incidentCommitments: input.incidentCommitments ?? [],
      rawMeasurementPresent: false,
    },
  });
}

export function buildSyntheticCalibrationEvidenceScenarios(input: {
  readonly signers: CalibrationEvidenceFixtureSigners;
  readonly schemas: SchemaRegistry;
  readonly timestampPrefix?: string;
}): SyntheticCalibrationEvidenceScenarios {
  const capability = buildSyntheticCalibrationCapabilityDescriptor();
  const time = (offset: number) => `${input.timestampPrefix ?? "2026-08-03T13:00:"}${offset.toString().padStart(2, "0")}.000Z`;
  const hash = (label: string) => sha256Text(`seh.public-development.calibration-evidence.${label}.v2`);
  const strata = capability.expectedStrataCommitments;

  const successAttempt = hash("success.attempt");
  const successAlpha = buildAccountingPair({ attemptCommitment: successAttempt, stratumCommitment: strata[0]!, label: "success.alpha", offset: 0, time, hash, capability, signers: input.signers, schemas: input.schemas });
  const successBeta = buildAccountingPair({ attemptCommitment: successAttempt, stratumCommitment: strata[1]!, label: "success.beta", offset: 2, time, hash, capability, signers: input.signers, schemas: input.schemas });
  const successMeasurementAlpha = buildMeasurement({ attemptCommitment: successAttempt, pair: successAlpha, stratumCommitment: strata[0]!, label: "success.alpha", missingnessState: "complete", recordedAt: time(4), hash, signers: input.signers, schemas: input.schemas });
  const successMeasurementBeta = buildMeasurement({ attemptCommitment: successAttempt, pair: successBeta, stratumCommitment: strata[1]!, label: "success.beta", missingnessState: "complete", recordedAt: time(5), hash, signers: input.signers, schemas: input.schemas });
  const successE1 = [successMeasurementAlpha, successMeasurementBeta];
  const aggregate = fixtureRecord({
    recordType: "AggregateCalibrationCommitment",
    attemptCommitment: successAttempt,
    dependencies: successE1.map(calibrationEvidenceReference),
    signer: input.signers.calibrationScorer,
    schemas: input.schemas,
    recordedAt: time(6),
    payload: {
      terminalDisposition: "aggregate_succeeded",
      orderedE1RecordIds: successE1.map((record) => record.evidenceRecordId),
      expectedStrataCommitments: strata,
      observedStrata: [
        { stratumCommitment: strata[0]!, measurementRecordId: successMeasurementAlpha.evidenceRecordId },
        { stratumCommitment: strata[1]!, measurementRecordId: successMeasurementBeta.evidenceRecordId },
      ],
      gridCommitment: capability.gridCommitment,
      rejectedCandidateCommitments: [],
      ruleBranch: "synthetic_conformance_only",
      precisionCheckCommitment: hash("success.precision-check"),
      evaluatorFailureRecordIds: [],
      evaluatorIncidentRecordIds: [],
      missingnessReported: false,
      incidentsReported: false,
      withdrawalState: "not_withdrawn_synthetic",
      requiredStrataComplete: true,
      e0ToE1AccountingComplete: true,
      unresolvedEvaluatorFailureCount: 0,
      unmatchedIncidentCount: 0,
      rawEvaluatorInputPresent: false,
      protectedDataAccessed: false,
    },
  });
  const successVerification = fixtureRecord({
    recordType: "CalibrationVerificationReceipt",
    attemptCommitment: successAttempt,
    dependencies: [calibrationEvidenceReference(aggregate)],
    signer: input.signers.independentVerifier,
    schemas: input.schemas,
    recordedAt: time(7),
    payload: {
      disposition: "verified_aggregate",
      verifiedE2RecordIds: [aggregate.evidenceRecordId],
      terminalRecordIds: [aggregate.evidenceRecordId],
      aggregateRecordId: aggregate.evidenceRecordId,
      withdrawalRecordId: null,
      failureRecordIds: [],
      verificationCommitment: hash("success.verification"),
      referenceOnly: true,
      aggregateVerified: true,
      branchExclusivityVerified: true,
      e0ToE1CoverageVerified: true,
      e1ToE2CoverageVerified: true,
      e4Eligible: true,
      graphVerified: true,
      missingnessAndIncidentCoverageVerified: true,
      grantsAuthority: false,
    },
  });
  const proposal = fixtureRecord({
    recordType: "ProtocolAuthorDerivedValueProposal",
    attemptCommitment: successAttempt,
    dependencies: [calibrationEvidenceReference(successVerification)],
    signer: input.signers.protocolAuthor,
    schemas: input.schemas,
    recordedAt: time(8),
    payload: {
      aggregateRecordId: aggregate.evidenceRecordId,
      verificationReceiptId: successVerification.evidenceRecordId,
      derivedValueCommitment: hash("success.derived-value"),
      disclosure: "commitment_only",
      independentlyVerified: true,
      freezeTransactionId: null,
      finalProtocolId: null,
      oProposalId: null,
      oActivationId: null,
      grantsAuthority: false,
    },
  });
  const success = [successAlpha.execution, successAlpha.usage, successBeta.execution, successBeta.usage, ...successE1, aggregate, successVerification, proposal];

  const withdrawalAttempt = hash("withdrawal.attempt");
  const withdrawalAlpha = buildAccountingPair({ attemptCommitment: withdrawalAttempt, stratumCommitment: strata[0]!, label: "withdrawal.alpha", offset: 10, time, hash, capability, signers: input.signers, schemas: input.schemas });
  const withdrawalBeta = buildAccountingPair({ attemptCommitment: withdrawalAttempt, stratumCommitment: strata[1]!, label: "withdrawal.beta", offset: 12, time, hash, capability, signers: input.signers, schemas: input.schemas });
  const missingIncident = fixtureRecord({ recordType: "CalibrationIncidentRecord", attemptCommitment: withdrawalAttempt, dependencies: [], signer: input.signers.calibrationExecutor, schemas: input.schemas, recordedAt: time(14), payload: { stratumCommitment: strata[1]!, incidentCommitment: hash("withdrawal.missing-source"), incidentClass: "synthetic_conformance_incident", disclosed: true, realIncidentObserved: false } });
  const disclosureIncident = fixtureRecord({ recordType: "CalibrationIncidentRecord", attemptCommitment: withdrawalAttempt, dependencies: [], signer: input.signers.calibrationExecutor, schemas: input.schemas, recordedAt: time(15), payload: { stratumCommitment: strata[1]!, incidentCommitment: hash("withdrawal.disclosure-source"), incidentClass: "synthetic_conformance_incident", disclosed: true, realIncidentObserved: false } });
  const withdrawalMeasurementAlpha = buildMeasurement({ attemptCommitment: withdrawalAttempt, pair: withdrawalAlpha, stratumCommitment: strata[0]!, label: "withdrawal.alpha", missingnessState: "complete", recordedAt: time(16), hash, signers: input.signers, schemas: input.schemas });
  const evaluatorIncidentCommitment = hash("withdrawal.evaluator-incident");
  const withdrawalMeasurementBeta = buildMeasurement({ attemptCommitment: withdrawalAttempt, pair: withdrawalBeta, stratumCommitment: strata[1]!, label: "withdrawal.beta", missingnessState: "missing_declared", incidentCommitments: [evaluatorIncidentCommitment], recordedAt: time(17), hash, signers: input.signers, schemas: input.schemas });
  const evaluatorFailure = fixtureRecord({ recordType: "CalibrationEvaluatorFailureRecord", attemptCommitment: withdrawalAttempt, dependencies: [calibrationEvidenceReference(missingIncident)], signer: input.signers.calibrationEvaluator, schemas: input.schemas, recordedAt: time(18), payload: { stratumCommitment: strata[1]!, incidentRecordId: missingIncident.evidenceRecordId, failureCommitment: hash("withdrawal.evaluator-failure"), failureClass: "synthetic_missingness", missingnessDeclared: true, directProtocolAuthorRelease: false } });
  const evaluatorIncident = fixtureRecord({ recordType: "CalibrationEvaluatorIncidentRecord", attemptCommitment: withdrawalAttempt, dependencies: [calibrationEvidenceReference(disclosureIncident)], signer: input.signers.calibrationEvaluator, schemas: input.schemas, recordedAt: time(19), payload: { stratumCommitment: strata[1]!, incidentRecordId: disclosureIncident.evidenceRecordId, incidentCommitment: evaluatorIncidentCommitment, incidentClass: "synthetic_evaluator_incident", incidentDisclosed: true, directProtocolAuthorRelease: false } });
  const withdrawalE1 = [withdrawalMeasurementAlpha, withdrawalMeasurementBeta, evaluatorFailure, evaluatorIncident];
  const withdrawalRecord = fixtureRecord({ recordType: "CalibrationWithdrawalRecord", attemptCommitment: withdrawalAttempt, dependencies: withdrawalE1.map(calibrationEvidenceReference), signer: input.signers.calibrationScorer, schemas: input.schemas, recordedAt: time(20), payload: { terminalDisposition: "calibration_withdrawn", withdrawalCommitment: hash("withdrawal.terminal"), withdrawalState: "synthetic_withdrawal", withdrawalReason: "missing_required_stratum", selectedValuePresent: false } });
  const withdrawalVerification = fixtureRecord({ recordType: "CalibrationVerificationReceipt", attemptCommitment: withdrawalAttempt, dependencies: [calibrationEvidenceReference(withdrawalRecord)], signer: input.signers.independentVerifier, schemas: input.schemas, recordedAt: time(21), payload: { disposition: "verified_withdrawal", verifiedE2RecordIds: [withdrawalRecord.evidenceRecordId], terminalRecordIds: [withdrawalRecord.evidenceRecordId], aggregateRecordId: null, withdrawalRecordId: withdrawalRecord.evidenceRecordId, failureRecordIds: [], verificationCommitment: hash("withdrawal.verification"), referenceOnly: true, aggregateVerified: false, branchExclusivityVerified: true, e0ToE1CoverageVerified: true, e1ToE2CoverageVerified: true, e4Eligible: false, graphVerified: true, missingnessAndIncidentCoverageVerified: true, grantsAuthority: false } });
  const withdrawal = [withdrawalAlpha.execution, withdrawalAlpha.usage, withdrawalBeta.execution, withdrawalBeta.usage, missingIncident, disclosureIncident, ...withdrawalE1, withdrawalRecord, withdrawalVerification];

  const failureAttempt = hash("failure.attempt");
  const failureAlpha = buildAccountingPair({ attemptCommitment: failureAttempt, stratumCommitment: strata[0]!, label: "failure.alpha", offset: 30, time, hash, capability, signers: input.signers, schemas: input.schemas });
  const failureBeta = buildAccountingPair({ attemptCommitment: failureAttempt, stratumCommitment: strata[1]!, label: "failure.beta", offset: 32, time, hash, capability, signers: input.signers, schemas: input.schemas });
  const failureMeasurementAlpha = buildMeasurement({ attemptCommitment: failureAttempt, pair: failureAlpha, stratumCommitment: strata[0]!, label: "failure.alpha", missingnessState: "complete", recordedAt: time(34), hash, signers: input.signers, schemas: input.schemas });
  const failureMeasurementBeta = buildMeasurement({ attemptCommitment: failureAttempt, pair: failureBeta, stratumCommitment: strata[1]!, label: "failure.beta", missingnessState: "complete", recordedAt: time(35), hash, signers: input.signers, schemas: input.schemas });
  const scorerFailure = fixtureRecord({ recordType: "CalibrationScorerFailureRecord", attemptCommitment: failureAttempt, dependencies: [calibrationEvidenceReference(failureMeasurementAlpha)], signer: input.signers.calibrationScorer, schemas: input.schemas, recordedAt: time(36), payload: { terminalDisposition: "calibration_failed", failureCommitment: hash("failure.scorer-failure"), failureClass: "synthetic_scorer_failure", rawEvaluatorInputPresent: false, protectedDataAccessed: false } });
  const scorerIncident = fixtureRecord({ recordType: "CalibrationScorerIncidentRecord", attemptCommitment: failureAttempt, dependencies: [calibrationEvidenceReference(failureMeasurementBeta)], signer: input.signers.calibrationScorer, schemas: input.schemas, recordedAt: time(37), payload: { incidentCommitment: hash("failure.scorer-incident"), incidentClass: "synthetic_scorer_incident", incidentDisclosed: true, rawEvaluatorInputPresent: false, protectedDataAccessed: false } });
  const failureE2 = [scorerFailure, scorerIncident];
  const failureVerification = fixtureRecord({ recordType: "CalibrationVerificationReceipt", attemptCommitment: failureAttempt, dependencies: failureE2.map(calibrationEvidenceReference), signer: input.signers.independentVerifier, schemas: input.schemas, recordedAt: time(38), payload: { disposition: "verified_failure", verifiedE2RecordIds: failureE2.map((record) => record.evidenceRecordId), terminalRecordIds: [scorerFailure.evidenceRecordId], aggregateRecordId: null, withdrawalRecordId: null, failureRecordIds: [scorerFailure.evidenceRecordId], verificationCommitment: hash("failure.verification"), referenceOnly: true, aggregateVerified: false, branchExclusivityVerified: true, e0ToE1CoverageVerified: true, e1ToE2CoverageVerified: true, e4Eligible: false, graphVerified: true, missingnessAndIncidentCoverageVerified: true, grantsAuthority: false } });
  const failure = [failureAlpha.execution, failureAlpha.usage, failureBeta.execution, failureBeta.usage, failureMeasurementAlpha, failureMeasurementBeta, ...failureE2, failureVerification];

  return { success, withdrawal, failure };
}

/** Compatibility alias for callers that need the admissible success-branch fixture only. */
export function buildSyntheticCalibrationEvidenceChain(input: {
  readonly signers: CalibrationEvidenceFixtureSigners;
  readonly schemas: SchemaRegistry;
  readonly timestampPrefix?: string;
}): readonly CalibrationEvidenceRecord[] {
  return buildSyntheticCalibrationEvidenceScenarios(input).success;
}
