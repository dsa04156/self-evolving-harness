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
  readonly executionCommitment: string;
  readonly accountingContextCommitment: string;
  readonly capabilityCommitment: string;
  readonly expectedStrataCommitments: readonly string[];
  readonly executionOccurred: false;
}

export interface CalibrationUsagePayload {
  readonly usageCommitment: string;
  readonly accountingContextCommitment: string;
  readonly capabilityCommitment: string;
  readonly chargeObserved: false;
}

export interface CalibrationIncidentPayload {
  readonly incidentCommitment: string;
  readonly incidentClass: "synthetic_conformance_incident";
  readonly disclosed: true;
  readonly realIncidentObserved: false;
}

export interface CalibrationMeasurementPayload {
  readonly stratumCommitment: string;
  readonly normalizedMeasurementCommitment: string;
  readonly normalizationContractCommitment: string;
  readonly missingnessState: "complete" | "missing_declared";
  readonly incidentCommitments: readonly string[];
  readonly rawMeasurementPresent: false;
}

export interface CalibrationEvaluatorFailurePayload {
  readonly stratumCommitment: string;
  readonly failureCommitment: string;
  readonly failureClass: "synthetic_missingness" | "synthetic_evaluator_failure";
  readonly missingnessDeclared: true;
  readonly directProtocolAuthorRelease: false;
}

export interface CalibrationEvaluatorIncidentPayload {
  readonly incidentCommitment: string;
  readonly incidentClass: "synthetic_evaluator_incident";
  readonly incidentDisclosed: true;
  readonly directProtocolAuthorRelease: false;
}

export interface AggregateCalibrationPayload {
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
  readonly missingnessReported: true;
  readonly incidentsReported: true;
  readonly withdrawalState: "not_withdrawn_synthetic";
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
  readonly withdrawalCommitment: string;
  readonly withdrawalState: "not_withdrawn_synthetic" | "synthetic_withdrawal";
  readonly selectedValuePresent: false;
}

export interface CalibrationScorerFailurePayload {
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
  readonly verifiedE2RecordIds: readonly string[];
  readonly aggregateRecordId: string;
  readonly verificationCommitment: string;
  readonly referenceOnly: true;
  readonly aggregateVerified: true;
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
  readonly expectedStratumCount: number;
  readonly observedStratumCount: number;
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
  let previousStageIndex = -1;
  for (const record of input.records) {
    verifyCalibrationEvidenceRecord({ record, schemas: input.schemas });
    stageCounts[record.stage] += 1;
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
  for (const stage of CALIBRATION_EVIDENCE_STAGES) {
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
  for (const [label, values] of [
    ["execution", executions], ["usage", usages], ["executor incident", executorIncidents],
    ["evaluator failure", evaluatorFailures], ["evaluator incident", evaluatorIncidents],
    ["aggregate", aggregates], ["rejected candidate", rejected], ["withdrawal", withdrawals],
    ["scorer failure", scorerFailures], ["scorer incident", scorerIncidents],
    ["verification", verifications], ["proposal", proposals],
  ] as const) {
    assertCondition(values.length === 1, "VERIFICATION_FAILED", `Synthetic chain requires exactly one ${label} record`);
  }
  assertCondition(measurements.length === input.capability.expectedStrataCommitments.length, "VERIFICATION_FAILED", "Measurement count differs from expected strata");

  const executionPayload = executions[0]!.payload as CalibrationExecutionPayload;
  const usagePayload = usages[0]!.payload as CalibrationUsagePayload;
  assertCondition(
    executionPayload.capabilityCommitment === input.capability.capabilityCommitment &&
      usagePayload.capabilityCommitment === input.capability.capabilityCommitment,
    "VERIFICATION_FAILED",
    "E0 capability commitment differs",
  );
  assertExactSet(executionPayload.expectedStrataCommitments, input.capability.expectedStrataCommitments, "E0 expected strata");

  const measurementStrata = measurements.map((record) => (record.payload as CalibrationMeasurementPayload).stratumCommitment);
  assertExactSet(measurementStrata, input.capability.expectedStrataCommitments, "E1 measurement strata");
  for (const measurement of measurements) {
    const payload = measurement.payload as CalibrationMeasurementPayload;
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
  for (const incident of executorIncidents) {
    const represented = evaluatorIncidents.some((record) => record.dependencies.some((dependency) => dependency.evidenceRecordId === incident.evidenceRecordId));
    assertCondition(represented, "VERIFICATION_FAILED", "Executor incident is not represented at E1");
  }

  const aggregate = aggregates[0]!;
  const aggregatePayload = aggregate.payload as AggregateCalibrationPayload;
  const allE1Ids = input.records.filter((record) => record.stage === "E1").map((record) => record.evidenceRecordId);
  assertExactSet(
    aggregate.dependencies.map((reference) => reference.evidenceRecordId),
    allE1Ids,
    "Aggregate E1 dependencies",
  );
  assertCondition(
    canonicalize(aggregatePayload.orderedE1RecordIds) === canonicalize(allE1Ids),
    "VERIFICATION_FAILED",
    "Aggregate ordered E1 commitments are missing, substituted, or reordered",
  );
  assertExactSet(aggregatePayload.expectedStrataCommitments, input.capability.expectedStrataCommitments, "Aggregate expected strata");
  assertExactSet(aggregatePayload.observedStrata.map((entry) => entry.stratumCommitment), input.capability.expectedStrataCommitments, "Aggregate observed strata");
  for (const entry of aggregatePayload.observedStrata) {
    const measurement = byId.get(entry.measurementRecordId);
    assertCondition(measurement?.recordType === "CalibrationMeasurementCommitment", "VERIFICATION_FAILED", "Observed stratum does not reference an E1 measurement");
    assertCondition((measurement.payload as CalibrationMeasurementPayload).stratumCommitment === entry.stratumCommitment, "VERIFICATION_FAILED", "Observed stratum commitment differs from its E1 measurement");
  }
  assertCondition(aggregatePayload.gridCommitment === input.capability.gridCommitment, "VERIFICATION_FAILED", "Post-result grid substitution detected");
  assertExactSet(aggregatePayload.evaluatorFailureRecordIds, evaluatorFailures.map((record) => record.evidenceRecordId), "Evaluator failure coverage");
  assertExactSet(aggregatePayload.evaluatorIncidentRecordIds, evaluatorIncidents.map((record) => record.evidenceRecordId), "Evaluator incident coverage");
  assertCondition(aggregatePayload.missingnessReported && aggregatePayload.incidentsReported, "VERIFICATION_FAILED", "Missingness or incidents are unreported");

  const rejectedPayload = rejected[0]!.payload as RejectedDerivationCandidatePayload;
  assertCondition(rejectedPayload.gridCommitment === input.capability.gridCommitment, "VERIFICATION_FAILED", "Rejected candidate uses a substituted grid");

  const verification = verifications[0]!;
  const verificationPayload = verification.payload as CalibrationVerificationPayload;
  const allE2Ids = input.records.filter((record) => record.stage === "E2").map((record) => record.evidenceRecordId);
  assertExactSet(
    verification.dependencies.map((reference) => reference.evidenceRecordId),
    allE2Ids,
    "E3 E2 dependencies",
  );
  assertExactSet(verificationPayload.verifiedE2RecordIds, allE2Ids, "E3 verified E2 records");
  assertCondition(verificationPayload.aggregateRecordId === aggregate.evidenceRecordId, "VERIFICATION_FAILED", "E3 verifies the wrong aggregate");

  const proposalPayload = proposals[0]!.payload as ProtocolAuthorDerivedValuePayload;
  assertCondition(proposals[0]!.dependencies.length === 1 && proposals[0]!.dependencies[0]!.evidenceRecordId === verification.evidenceRecordId, "VERIFICATION_FAILED", "E4 does not depend exclusively on E3 verification");
  assertCondition(proposalPayload.verificationReceiptId === verification.evidenceRecordId, "VERIFICATION_FAILED", "E4 references an unverified receipt");
  assertCondition(proposalPayload.aggregateRecordId === aggregate.evidenceRecordId, "VERIFICATION_FAILED", "E4 references an unverified aggregate");
  assertCondition(
    proposalPayload.freezeTransactionId === null && proposalPayload.finalProtocolId === null &&
      proposalPayload.oProposalId === null && proposalPayload.oActivationId === null && !proposalPayload.grantsAuthority,
    "AUTHORIZATION_DENIED",
    "E4 attempts a freeze, final identity, O transition, or authority grant",
  );

  return {
    recordCount: input.records.length,
    stageCounts,
    expectedStratumCount: input.capability.expectedStrataCommitments.length,
    observedStratumCount: aggregatePayload.observedStrata.length,
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
      dependencies: input.dependencies,
      payload: input.payload,
      disposition: CALIBRATION_EVIDENCE_DISPOSITION,
      budget: CALIBRATION_EVIDENCE_ZERO_BUDGET,
      creationMode: creationMode(),
      recordedAt: input.recordedAt,
    },
  });
}

export function buildSyntheticCalibrationEvidenceChain(input: {
  readonly signers: CalibrationEvidenceFixtureSigners;
  readonly schemas: SchemaRegistry;
  readonly timestampPrefix?: string;
}): readonly CalibrationEvidenceRecord[] {
  const capability = buildSyntheticCalibrationCapabilityDescriptor();
  const time = (offset: number) => `${input.timestampPrefix ?? "2026-08-03T13:00:"}${offset.toString().padStart(2, "0")}.000Z`;
  const hash = (label: string) => sha256Text(`seh.public-development.calibration-evidence.${label}.v1`);
  const execution = fixtureRecord({ recordType: "CalibrationExecutionReceipt", dependencies: [], signer: input.signers.calibrationExecutor, schemas: input.schemas, recordedAt: time(0), payload: { executionCommitment: hash("execution"), accountingContextCommitment: hash("accounting"), capabilityCommitment: capability.capabilityCommitment, expectedStrataCommitments: capability.expectedStrataCommitments, executionOccurred: false } });
  const usage = fixtureRecord({ recordType: "CalibrationUsageReceipt", dependencies: [], signer: input.signers.calibrationExecutor, schemas: input.schemas, recordedAt: time(1), payload: { usageCommitment: hash("usage"), accountingContextCommitment: hash("accounting"), capabilityCommitment: capability.capabilityCommitment, chargeObserved: false } });
  const executorIncident = fixtureRecord({ recordType: "CalibrationIncidentRecord", dependencies: [], signer: input.signers.calibrationExecutor, schemas: input.schemas, recordedAt: time(2), payload: { incidentCommitment: hash("executor-incident"), incidentClass: "synthetic_conformance_incident", disclosed: true, realIncidentObserved: false } });
  const e0MeasurementDependencies = [calibrationEvidenceReference(execution), calibrationEvidenceReference(usage)];
  const measurementAlpha = fixtureRecord({ recordType: "CalibrationMeasurementCommitment", dependencies: e0MeasurementDependencies, signer: input.signers.calibrationEvaluator, schemas: input.schemas, recordedAt: time(3), payload: { stratumCommitment: capability.expectedStrataCommitments[0]!, normalizedMeasurementCommitment: hash("measurement-alpha"), normalizationContractCommitment: hash("normalization"), missingnessState: "complete", incidentCommitments: [], rawMeasurementPresent: false } });
  const measurementBeta = fixtureRecord({ recordType: "CalibrationMeasurementCommitment", dependencies: e0MeasurementDependencies, signer: input.signers.calibrationEvaluator, schemas: input.schemas, recordedAt: time(4), payload: { stratumCommitment: capability.expectedStrataCommitments[1]!, normalizedMeasurementCommitment: hash("measurement-beta"), normalizationContractCommitment: hash("normalization"), missingnessState: "missing_declared", incidentCommitments: [hash("evaluator-incident")], rawMeasurementPresent: false } });
  const evaluatorFailure = fixtureRecord({ recordType: "CalibrationEvaluatorFailureRecord", dependencies: [calibrationEvidenceReference(execution)], signer: input.signers.calibrationEvaluator, schemas: input.schemas, recordedAt: time(5), payload: { stratumCommitment: capability.expectedStrataCommitments[1]!, failureCommitment: hash("evaluator-failure"), failureClass: "synthetic_missingness", missingnessDeclared: true, directProtocolAuthorRelease: false } });
  const evaluatorIncident = fixtureRecord({ recordType: "CalibrationEvaluatorIncidentRecord", dependencies: [calibrationEvidenceReference(executorIncident)], signer: input.signers.calibrationEvaluator, schemas: input.schemas, recordedAt: time(6), payload: { incidentCommitment: hash("evaluator-incident"), incidentClass: "synthetic_evaluator_incident", incidentDisclosed: true, directProtocolAuthorRelease: false } });
  const e1Records = [measurementAlpha, measurementBeta, evaluatorFailure, evaluatorIncident];
  const e1Dependencies = e1Records.map(calibrationEvidenceReference);
  const aggregate = fixtureRecord({ recordType: "AggregateCalibrationCommitment", dependencies: e1Dependencies, signer: input.signers.calibrationScorer, schemas: input.schemas, recordedAt: time(7), payload: { orderedE1RecordIds: e1Records.map((record) => record.evidenceRecordId), expectedStrataCommitments: capability.expectedStrataCommitments, observedStrata: [{ stratumCommitment: capability.expectedStrataCommitments[0]!, measurementRecordId: measurementAlpha.evidenceRecordId }, { stratumCommitment: capability.expectedStrataCommitments[1]!, measurementRecordId: measurementBeta.evidenceRecordId }], gridCommitment: capability.gridCommitment, rejectedCandidateCommitments: [hash("rejected-candidate")], ruleBranch: "synthetic_conformance_only", precisionCheckCommitment: hash("precision-check"), evaluatorFailureRecordIds: [evaluatorFailure.evidenceRecordId], evaluatorIncidentRecordIds: [evaluatorIncident.evidenceRecordId], missingnessReported: true, incidentsReported: true, withdrawalState: "not_withdrawn_synthetic", rawEvaluatorInputPresent: false, protectedDataAccessed: false } });
  const rejected = fixtureRecord({ recordType: "RejectedDerivationCandidateCommitment", dependencies: [calibrationEvidenceReference(measurementAlpha)], signer: input.signers.calibrationScorer, schemas: input.schemas, recordedAt: time(8), payload: { rejectedCandidateCommitment: hash("rejected-candidate"), gridCommitment: capability.gridCommitment, rejectionReason: "synthetic_infeasible", valueDisclosed: false } });
  const withdrawal = fixtureRecord({ recordType: "CalibrationWithdrawalRecord", dependencies: [calibrationEvidenceReference(evaluatorFailure)], signer: input.signers.calibrationScorer, schemas: input.schemas, recordedAt: time(9), payload: { withdrawalCommitment: hash("withdrawal"), withdrawalState: "not_withdrawn_synthetic", selectedValuePresent: false } });
  const scorerFailure = fixtureRecord({ recordType: "CalibrationScorerFailureRecord", dependencies: [calibrationEvidenceReference(evaluatorFailure)], signer: input.signers.calibrationScorer, schemas: input.schemas, recordedAt: time(10), payload: { failureCommitment: hash("scorer-failure"), failureClass: "synthetic_scorer_failure", rawEvaluatorInputPresent: false, protectedDataAccessed: false } });
  const scorerIncident = fixtureRecord({ recordType: "CalibrationScorerIncidentRecord", dependencies: [calibrationEvidenceReference(evaluatorIncident)], signer: input.signers.calibrationScorer, schemas: input.schemas, recordedAt: time(11), payload: { incidentCommitment: hash("scorer-incident"), incidentClass: "synthetic_scorer_incident", incidentDisclosed: true, rawEvaluatorInputPresent: false, protectedDataAccessed: false } });
  const e2Records = [aggregate, rejected, withdrawal, scorerFailure, scorerIncident];
  const verification = fixtureRecord({ recordType: "CalibrationVerificationReceipt", dependencies: e2Records.map(calibrationEvidenceReference), signer: input.signers.independentVerifier, schemas: input.schemas, recordedAt: time(12), payload: { verifiedE2RecordIds: e2Records.map((record) => record.evidenceRecordId), aggregateRecordId: aggregate.evidenceRecordId, verificationCommitment: hash("verification"), referenceOnly: true, aggregateVerified: true, graphVerified: true, missingnessAndIncidentCoverageVerified: true, grantsAuthority: false } });
  const proposal = fixtureRecord({ recordType: "ProtocolAuthorDerivedValueProposal", dependencies: [calibrationEvidenceReference(verification)], signer: input.signers.protocolAuthor, schemas: input.schemas, recordedAt: time(13), payload: { aggregateRecordId: aggregate.evidenceRecordId, verificationReceiptId: verification.evidenceRecordId, derivedValueCommitment: hash("derived-value"), disclosure: "commitment_only", independentlyVerified: true, freezeTransactionId: null, finalProtocolId: null, oProposalId: null, oActivationId: null, grantsAuthority: false } });
  return [execution, usage, executorIncident, ...e1Records, ...e2Records, verification, proposal];
}
