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
  CALIBRATION_DERIVATION_ASSIGNMENTS,
  CALIBRATION_ELIGIBILITY_STATE,
  CALIBRATION_NUMERIC_GRAPH,
  CALIBRATION_ZERO_BUDGET,
  type CalibrationDerivationClass,
} from "./calibration-contract.js";
import {
  CALIBRATION_ARITHMETIC_PORTABILITY_CONTRACT,
  type CalibrationPortabilityGoldenVector,
} from "./calibration-plan-assembly-portability.js";

export const CALIBRATION_PLAN_ASSEMBLY_READINESS_SCHEMA_ID =
  `${SCHEMA_BASE_URL}calibration-plan-assembly-readiness.schema.json`;
export const CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH =
  "governance/gate3/calibration-plan-assembly-readiness.json";
export const CALIBRATION_PLAN_ASSEMBLY_READINESS_AUDIT_PATH =
  "governance/gate3/calibration-plan-assembly-readiness-audit-receipt.json";

export type CalibrationPlanAssemblyMediaType =
  | "application/json"
  | "text/markdown; charset=utf-8"
  | "text/typescript; charset=utf-8"
  | "text/x-python; charset=utf-8";

export interface CalibrationPlanAssemblyArtifactReference {
  readonly artifactId: string;
  readonly path: string;
  readonly sourceCommit: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: CalibrationPlanAssemblyMediaType;
}

export const CALIBRATION_PLAN_ASSEMBLY_ARTIFACT_SPECS = [
  ["numeric_freeze_entry", "governance/gate3/research-protocol-numeric-freeze-entry.json", "application/json"],
  ["numeric_freeze_entry_receipt", "governance/gate3/research-protocol-numeric-freeze-entry-audit-receipt.json", "application/json"],
  ["calibration_contract", "governance/gate3/calibration-contract-preregistration.json", "application/json"],
  ["calibration_contract_receipt", "governance/gate3/calibration-contract-preregistration-audit-receipt.json", "application/json"],
  ["derivation_readiness", "governance/gate3/calibration-derivation-program-readiness.json", "application/json"],
  ["derivation_readiness_receipt", "governance/gate3/calibration-derivation-program-readiness-audit-receipt.json", "application/json"],
  ["conformance_manifest", "governance/trust-plane/conformance-manifest.json", "application/json"],
  ["outstanding_obligations", "governance/trust-plane/outstanding-obligations.json", "application/json"],
  ["derivation_evidence_packet", "architect/PACKET_03RRRRRRRRRRRRRRRRRRRR_CALIBRATION_DERIVATION_READINESS_EVIDENCE.md", "text/markdown; charset=utf-8"],
  ["derivation_evidence_ruling", ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrrrr.md", "text/markdown; charset=utf-8"],
  ["common_schema", "schemas/common.schema.json", "application/json"],
  ["assembly_schema", "schemas/calibration-plan-assembly-readiness.schema.json", "application/json"],
  ["derivation_programs_source", "src/governance/calibration-derivation-programs.ts", "text/typescript; charset=utf-8"],
  ["portability_source", "src/governance/calibration-plan-assembly-portability.ts", "text/typescript; charset=utf-8"],
  ["portability_reference", "scripts/calibration-portability-reference.py", "text/x-python; charset=utf-8"],
  ["assembly_model", "src/governance/calibration-plan-assembly-readiness.ts", "text/typescript; charset=utf-8"],
  ["assembly_verifier", "src/governance/calibration-plan-assembly-readiness-verifier.ts", "text/typescript; charset=utf-8"],
  ["assembly_generator", "scripts/create-calibration-plan-assembly-readiness.ts", "text/typescript; charset=utf-8"],
  ["assembly_verify_script", "scripts/verify-calibration-plan-assembly-readiness.ts", "text/typescript; charset=utf-8"],
  ["assembly_tests", "test/calibration-plan-assembly-readiness.test.ts", "text/typescript; charset=utf-8"],
  ["assembly_documentation", "docs/evaluation/calibration-plan-assembly-readiness.md", "text/markdown; charset=utf-8"],
  ["principal_identity_source", "src/trust/identity.ts", "text/typescript; charset=utf-8"],
  ["public_api_source", "src/index.ts", "text/typescript; charset=utf-8"],
  ["package_manifest", "package.json", "application/json"],
] as const satisfies readonly (readonly [
  string,
  string,
  CalibrationPlanAssemblyMediaType,
])[];

export const CALIBRATION_PENDING_SENTINEL_PATHS = [
  "seeds.finalRolloutCount",
  "seeds.finalRolloutValues",
  "h4TransferExperiment.secondProviderAndModelIdentity",
  "identity.provider",
  "identity.modelId",
  "identity.modelRevision",
  "identity.serviceTier",
  "identity.reproducibilityTier",
  "identity.parameters.reasoningEffort",
  "identity.parameters.temperature",
  "identity.parameters.topP",
  "phases.*.providerModelRequestAttempts",
  "phases.*.totalChargedTokens",
  "phases.*.providerCostMicros",
  "phases.*.toolAttempts",
  "phases.*.feedbackEvents",
  "phases.*.wallClockSeconds",
  "phases.*.processCount",
  "phases.*.cpuSeconds",
  "phases.*.memoryMiB",
  "phases.*.outputBytes",
  "perRequest.rolloutTokenCapT",
  "environment.containerImageDigest",
  "environment.toolchainDigest",
  "environment.networkPolicyDigest",
] as const;

export const CALIBRATION_STATISTICAL_MARGIN_GROUP = "statisticalMargins";

export const CALIBRATION_FREEZE_PROHIBITED_SOURCE_CLASSES = [
  "synthetic_conformance_output",
  "public_development_result",
  "provider_smoke_artifact",
  "public_fixture_or_withheld_public_fixture",
  "benchmark_or_evaluator_vault_material",
  "protected_task_body_or_raw_output",
  "evaluator_raw_measurement",
  "unverified_E1_E2_or_E4",
  "direct_evaluator_or_scorer_value",
  "gate_final_temporal_sealed_or_oracle_information",
  "sentinel_or_classification_token",
] as const;

export type CalibrationFutureProducerRole =
  | "protocol_author";

export interface CalibrationFieldEvidenceMapping {
  readonly fieldPath: string;
  readonly mappingKind: "pending_sentinel" | "statistical_margin_group";
  readonly originalSentinel:
    | "PILOT_PENDING"
    | "PILOT_PENDING_BY_PRECISION_RULE"
    | "PILOT_PENDING_AFTER_COUNT_FREEZE"
    | null;
  readonly effectiveExpansionCount: number;
  readonly directDerivationClass: CalibrationDerivationClass;
  readonly dependencyGraphNode: "B" | "C" | "F" | "G" | "H" | "J" | "K" | "L" | "M" | "N";
  readonly requiredFutureRecordType:
    | "ProtocolAuthorDerivedValueProposal"
    | "ProtocolAuthorIdentityTupleProposal"
    | "ProtocolAuthorEnvironmentDigestProposal"
    | "ProtocolAuthorNormativeValueProposal"
    | "ProtocolAuthorTransferIdentityProposalOrWithdrawal";
  readonly requiredProducerRole: CalibrationFutureProducerRole;
  readonly requiredVerifierReceipt:
    | "CalibrationVerificationReceipt"
    | "ProtocolIdentityVerificationReceipt"
    | "EnvironmentBuildVerificationReceipt"
    | "NormativeContractVerificationReceipt"
    | "TransferIdentityVerificationReceipt";
  readonly admissibleSourceClass:
    | "verified_dedicated_pilot_aggregate"
    | "verified_aggregate_plus_signed_real_price"
    | "verified_provider_model_identity_assertion"
    | "verified_reproducible_build_digest"
    | "frozen_normative_contract"
    | "verified_K_result_plus_sha256_seed_stream"
    | "verified_second_provider_model_identity_or_withdrawal"
    | "verified_dedicated_pilot_power_retention_aggregate";
  readonly prohibitedSourceClasses: typeof CALIBRATION_FREEZE_PROHIBITED_SOURCE_CLASSES;
  readonly valueSupplied: false;
  readonly futureEvidenceReferenceSupplied: false;
}

function mappingSpec(path: string): Omit<
  CalibrationFieldEvidenceMapping,
  | "fieldPath"
  | "mappingKind"
  | "originalSentinel"
  | "effectiveExpansionCount"
  | "prohibitedSourceClasses"
  | "valueSupplied"
  | "futureEvidenceReferenceSupplied"
> {
  if (path === "seeds.finalRolloutCount") {
    return {
      directDerivationClass: "dedicated_pilot_required",
      dependencyGraphNode: "K",
      requiredFutureRecordType: "ProtocolAuthorDerivedValueProposal",
      requiredProducerRole: "protocol_author",
      requiredVerifierReceipt: "CalibrationVerificationReceipt",
      admissibleSourceClass: "verified_dedicated_pilot_aggregate",
    };
  }
  if (path === "seeds.finalRolloutValues") {
    return {
      directDerivationClass: "normative_contract_value",
      dependencyGraphNode: "L",
      requiredFutureRecordType: "ProtocolAuthorNormativeValueProposal",
      requiredProducerRole: "protocol_author",
      requiredVerifierReceipt: "NormativeContractVerificationReceipt",
      admissibleSourceClass: "verified_K_result_plus_sha256_seed_stream",
    };
  }
  if (path === "h4TransferExperiment.secondProviderAndModelIdentity") {
    return {
      directDerivationClass: "withdraw_if_not_estimable",
      dependencyGraphNode: "N",
      requiredFutureRecordType: "ProtocolAuthorTransferIdentityProposalOrWithdrawal",
      requiredProducerRole: "protocol_author",
      requiredVerifierReceipt: "TransferIdentityVerificationReceipt",
      admissibleSourceClass: "verified_second_provider_model_identity_or_withdrawal",
    };
  }
  if (path.startsWith("identity.")) {
    return {
      directDerivationClass: "provider_or_model_identity_dependent",
      dependencyGraphNode: "B",
      requiredFutureRecordType: "ProtocolAuthorIdentityTupleProposal",
      requiredProducerRole: "protocol_author",
      requiredVerifierReceipt: "ProtocolIdentityVerificationReceipt",
      admissibleSourceClass: "verified_provider_model_identity_assertion",
    };
  }
  if (path.startsWith("environment.")) {
    return {
      directDerivationClass: "environment_identity_dependent",
      dependencyGraphNode: "C",
      requiredFutureRecordType: "ProtocolAuthorEnvironmentDigestProposal",
      requiredProducerRole: "protocol_author",
      requiredVerifierReceipt: "EnvironmentBuildVerificationReceipt",
      admissibleSourceClass: "verified_reproducible_build_digest",
    };
  }
  if (path === "perRequest.rolloutTokenCapT") {
    return {
      directDerivationClass: "dedicated_pilot_required",
      dependencyGraphNode: "F",
      requiredFutureRecordType: "ProtocolAuthorDerivedValueProposal",
      requiredProducerRole: "protocol_author",
      requiredVerifierReceipt: "CalibrationVerificationReceipt",
      admissibleSourceClass: "verified_dedicated_pilot_aggregate",
    };
  }
  if (path === CALIBRATION_STATISTICAL_MARGIN_GROUP) {
    return {
      directDerivationClass: "dedicated_pilot_required",
      dependencyGraphNode: "M",
      requiredFutureRecordType: "ProtocolAuthorDerivedValueProposal",
      requiredProducerRole: "protocol_author",
      requiredVerifierReceipt: "CalibrationVerificationReceipt",
      admissibleSourceClass: "verified_dedicated_pilot_power_retention_aggregate",
    };
  }
  if (path === "phases.*.providerCostMicros") {
    return {
      directDerivationClass: "provider_or_model_identity_dependent",
      dependencyGraphNode: "J",
      requiredFutureRecordType: "ProtocolAuthorDerivedValueProposal",
      requiredProducerRole: "protocol_author",
      requiredVerifierReceipt: "CalibrationVerificationReceipt",
      admissibleSourceClass: "verified_aggregate_plus_signed_real_price",
    };
  }
  if (
    path === "phases.*.feedbackEvents" ||
    path === "phases.*.processCount"
  ) {
    return {
      directDerivationClass: "normative_contract_value",
      dependencyGraphNode: "H",
      requiredFutureRecordType: "ProtocolAuthorNormativeValueProposal",
      requiredProducerRole: "protocol_author",
      requiredVerifierReceipt: "NormativeContractVerificationReceipt",
      admissibleSourceClass: "frozen_normative_contract",
    };
  }
  return {
    directDerivationClass: "dedicated_pilot_required",
    dependencyGraphNode: "G",
    requiredFutureRecordType: "ProtocolAuthorDerivedValueProposal",
    requiredProducerRole: "protocol_author",
    requiredVerifierReceipt: "CalibrationVerificationReceipt",
    admissibleSourceClass: "verified_dedicated_pilot_aggregate",
  };
}

function sentinelFor(path: string): CalibrationFieldEvidenceMapping["originalSentinel"] {
  if (path === "seeds.finalRolloutCount") return "PILOT_PENDING_BY_PRECISION_RULE";
  if (path === "seeds.finalRolloutValues") return "PILOT_PENDING_AFTER_COUNT_FREEZE";
  return "PILOT_PENDING";
}

export function buildCalibrationFieldEvidenceMap(): readonly CalibrationFieldEvidenceMapping[] {
  const mappings: CalibrationFieldEvidenceMapping[] =
    CALIBRATION_PENDING_SENTINEL_PATHS.map((fieldPath) => ({
      fieldPath,
      mappingKind: "pending_sentinel",
      originalSentinel: sentinelFor(fieldPath),
      effectiveExpansionCount: fieldPath.startsWith("phases.*.") ? 12 : 1,
      ...mappingSpec(fieldPath),
      prohibitedSourceClasses: CALIBRATION_FREEZE_PROHIBITED_SOURCE_CLASSES,
      valueSupplied: false,
      futureEvidenceReferenceSupplied: false,
    }));
  mappings.push({
    fieldPath: CALIBRATION_STATISTICAL_MARGIN_GROUP,
    mappingKind: "statistical_margin_group",
    originalSentinel: null,
    effectiveExpansionCount: 1,
    ...mappingSpec(CALIBRATION_STATISTICAL_MARGIN_GROUP),
    prohibitedSourceClasses: CALIBRATION_FREEZE_PROHIBITED_SOURCE_CLASSES,
    valueSupplied: false,
    futureEvidenceReferenceSupplied: false,
  });
  return mappings;
}

export const CALIBRATION_FUTURE_CANDIDATE_GRID_SCHEMAS = [
  {
    target: "F",
    programBinding: "F",
    cardinality: { minimum: 1, maximum: 8, exact: null },
    orderedBy: "cap_strictly_ascending",
    unitContract: "positive_integer_rollout_tokens",
    requiredFields: ["candidateId", "cap", "requiredStrata", "gridCommitment"],
    requiredCommitmentDomain: "SyntheticCalibrationCapGrid.v1",
    actualCandidateValuesPresent: false,
    actualGridInstancePresent: false,
  },
  {
    target: "G",
    programBinding: "G",
    cardinality: { minimum: 1, maximum: 8, exact: null },
    orderedBy: "cap_strictly_ascending_per_closed_phase_resource",
    unitContract: "positive_integer_resource_unit_with_positive_rounding_quantum",
    requiredFields: ["candidateId", "cap", "requiredStrata", "roundingQuantum", "gridCommitment"],
    requiredCommitmentDomain: "SyntheticCalibrationCapGrid.v1",
    actualCandidateValuesPresent: false,
    actualGridInstancePresent: false,
  },
  {
    target: "K",
    programBinding: "K",
    cardinality: { minimum: 4, maximum: 4, exact: 4 },
    orderedBy: "exact_preapproved_program_domain_order",
    unitContract: "positive_integer_rollout_count_from_bound_program_domain",
    requiredFields: ["rolloutCount", "taskCount", "mcseBasisPoints", "seedVarianceShareBasisPoints", "gridCommitment"],
    requiredCommitmentDomain: "SyntheticCalibrationRolloutGrid.v1",
    actualCandidateValuesPresent: false,
    actualGridInstancePresent: false,
  },
  {
    target: "M",
    programBinding: "M",
    cardinality: { minimum: 1, maximum: 8, exact: null },
    orderedBy: "allowed_loss_basis_points_strictly_ascending",
    unitContract: "integer_basis_points_0_through_10000",
    requiredFields: ["candidateId", "allowedLossBasisPoints", "powerBasisPoints", "retentionBasisPoints", "gridCommitment"],
    requiredCommitmentDomain: "SyntheticCalibrationMarginGrid.v1",
    actualCandidateValuesPresent: false,
    actualGridInstancePresent: false,
  },
] as const;

export const CALIBRATION_FREEZE_ADMISSION_FIREWALL = {
  firewallVersion: "calibration_freeze_admission_firewall.v1",
  evaluationMode: "metadata_only_no_value_access",
  requiredFieldCount: 26,
  requiredPendingSentinelCount: 25,
  requiredStatisticalMarginGroupCount: 1,
  requiredResolvedNodes: ["B", "C", "F", "G", "H", "J", "K", "L", "M", "N"],
  requiredVerifiedEvidenceStages: ["E1", "E2", "E4"],
  directEvaluatorOrScorerValueAccepted: false,
  sentinelInterpretationAccepted: false,
  hiddenDefaultsAccepted: false,
  partialFieldSetsAccepted: false,
  syntheticOrPublicDevelopmentEvidenceAccepted: false,
  providerSmokePublicFixtureOrProtectedAncestryAccepted: false,
  candidateGridValuesAcceptedByReadiness: false,
  finalIdentityAllocationAccepted: false,
  nonzeroExecutionAuthorityAccepted: false,
  oProposalCreationImplemented: false,
  oActivationImplemented: false,
  rejectionCodes: [
    "field_set_incomplete_or_duplicate",
    "mapping_contract_mismatch",
    "dependency_unresolved",
    "evidence_unverified",
    "E1_E2_or_E4_unverified",
    "synthetic_or_public_development_source",
    "provider_smoke_public_fixture_or_protected_ancestry",
    "direct_evaluator_or_scorer_input",
    "sentinel_interpreted_as_value",
    "hidden_default_present",
    "candidate_grid_value_present",
    "premature_final_identity",
    "nonzero_execution_authority",
    "O_creation_or_activation_requested",
  ],
} as const;

export interface CalibrationFreezeAdmissionEvidenceMetadata {
  readonly fieldPath: string;
  readonly dependencyGraphNode: string;
  readonly dependencyResolved: boolean;
  readonly recordType: string;
  readonly producerRole: string;
  readonly verifierReceipt: string;
  readonly evidenceVerified: boolean;
  readonly sourceClass: string;
  readonly syntheticConformanceAncestry: boolean;
  readonly publicDevelopmentAncestry: boolean;
  readonly providerSmokeAncestry: boolean;
  readonly publicFixtureAncestry: boolean;
  readonly protectedDataDirectAncestry: boolean;
  readonly directEvaluatorOrScorerValue: boolean;
}

export interface CalibrationFreezeAdmissionProbe {
  readonly fieldEvidence: readonly CalibrationFreezeAdmissionEvidenceMetadata[];
  readonly resolvedNodes: readonly string[];
  readonly verifiedEvidenceStages: readonly string[];
  readonly hiddenDefaultsPresent: boolean;
  readonly sentinelInterpretedAsValue: boolean;
  readonly candidateGridValuesPresent: boolean;
  readonly finalProtocolId: string | null;
  readonly budgetFreezeId: string | null;
  readonly calibrationPlanManifestId: string | null;
  readonly calibrationEnvelopeId: string | null;
  readonly executionAuthorityCount: number;
  readonly requestOProposalCreation: boolean;
  readonly requestOActivation: boolean;
}

export interface CalibrationFreezeAdmissionAssessment {
  readonly completenessSatisfied: boolean;
  readonly futureOProposalPreconditionsMet: boolean;
  readonly rejectionCodes: readonly string[];
  readonly oProposalCreated: false;
  readonly oActivationPerformed: false;
  readonly authorityGranted: false;
}

export function assessCalibrationFreezeAdmission(
  probe: CalibrationFreezeAdmissionProbe,
): CalibrationFreezeAdmissionAssessment {
  const expected = buildCalibrationFieldEvidenceMap();
  const reasons = new Set<string>();
  const byPath = new Map<string, CalibrationFreezeAdmissionEvidenceMetadata>();
  for (const evidence of probe.fieldEvidence) {
    if (byPath.has(evidence.fieldPath)) reasons.add("field_set_incomplete_or_duplicate");
    byPath.set(evidence.fieldPath, evidence);
  }
  if (probe.fieldEvidence.length !== expected.length || byPath.size !== expected.length) {
    reasons.add("field_set_incomplete_or_duplicate");
  }
  for (const mapping of expected) {
    const evidence = byPath.get(mapping.fieldPath);
    if (evidence === undefined) {
      reasons.add("field_set_incomplete_or_duplicate");
      continue;
    }
    if (
      evidence.dependencyGraphNode !== mapping.dependencyGraphNode ||
      evidence.recordType !== mapping.requiredFutureRecordType ||
      evidence.producerRole !== mapping.requiredProducerRole ||
      evidence.verifierReceipt !== mapping.requiredVerifierReceipt ||
      evidence.sourceClass !== mapping.admissibleSourceClass
    ) reasons.add("mapping_contract_mismatch");
    if (!evidence.dependencyResolved) reasons.add("dependency_unresolved");
    if (!evidence.evidenceVerified) reasons.add("evidence_unverified");
    if (evidence.syntheticConformanceAncestry || evidence.publicDevelopmentAncestry) {
      reasons.add("synthetic_or_public_development_source");
    }
    if (
      evidence.providerSmokeAncestry ||
      evidence.publicFixtureAncestry ||
      evidence.protectedDataDirectAncestry
    ) reasons.add("provider_smoke_public_fixture_or_protected_ancestry");
    if (evidence.directEvaluatorOrScorerValue) {
      reasons.add("direct_evaluator_or_scorer_input");
    }
  }
  const requiredNodes = CALIBRATION_FREEZE_ADMISSION_FIREWALL.requiredResolvedNodes;
  if (
    probe.resolvedNodes.length !== requiredNodes.length ||
    requiredNodes.some((node, index) => probe.resolvedNodes[index] !== node)
  ) reasons.add("dependency_unresolved");
  const requiredStages = CALIBRATION_FREEZE_ADMISSION_FIREWALL.requiredVerifiedEvidenceStages;
  if (
    probe.verifiedEvidenceStages.length !== requiredStages.length ||
    requiredStages.some((stage, index) => probe.verifiedEvidenceStages[index] !== stage)
  ) reasons.add("E1_E2_or_E4_unverified");
  if (probe.hiddenDefaultsPresent) reasons.add("hidden_default_present");
  if (probe.sentinelInterpretedAsValue) reasons.add("sentinel_interpreted_as_value");
  if (probe.candidateGridValuesPresent) reasons.add("candidate_grid_value_present");
  if (
    probe.finalProtocolId !== null ||
    probe.budgetFreezeId !== null ||
    probe.calibrationPlanManifestId !== null ||
    probe.calibrationEnvelopeId !== null
  ) reasons.add("premature_final_identity");
  if (probe.executionAuthorityCount !== 0) reasons.add("nonzero_execution_authority");
  if (probe.requestOProposalCreation || probe.requestOActivation) {
    reasons.add("O_creation_or_activation_requested");
  }
  const rejectionCodes = [...reasons].sort();
  return {
    completenessSatisfied: rejectionCodes.length === 0,
    futureOProposalPreconditionsMet: rejectionCodes.length === 0,
    rejectionCodes,
    oProposalCreated: false,
    oActivationPerformed: false,
    authorityGranted: false,
  };
}

export const CALIBRATION_ASSEMBLY_COMPLETENESS_RULE = {
  requiredDependencyNodes: ["B", "C", "F", "G", "H", "J", "K", "L", "M", "N"],
  requiredPendingSentinelMappings: 25,
  requiredStatisticalMarginMappings: 1,
  requiredEffectiveExpandedOutputs: 136,
  producerAndVerifierAuthoritiesMustBeValid: true,
  allEvidenceMustBeUncontaminated: true,
  allDerivationReceiptsMustBeAccepted: true,
  oMayBeProposedOnlyAfterAllConditions: true,
  thisReadinessMayProposeO: false,
  thisReadinessMayCreateOrActivateO: false,
  activeForbiddenEdge: "O->D",
  numericGraph: CALIBRATION_NUMERIC_GRAPH,
} as const;

export const CALIBRATION_PLAN_ASSEMBLY_ZERO_BUDGET = {
  ...CALIBRATION_ZERO_BUDGET,
  providerIdentitySelections: 0,
  modelIdentitySelections: 0,
  environmentSelections: 0,
  realPriceSelections: 0,
  calibrationPlanManifests: 0,
  calibrationEnvelopes: 0,
  sentinelWrites: 0,
  statisticalMarginWrites: 0,
  protocolManifestWrites: 0,
  budgetFreezeManifestWrites: 0,
  oProposals: 0,
  oActivations: 0,
} as const;

export const CALIBRATION_PLAN_ASSEMBLY_AUTHORITY_STATE = {
  ...CALIBRATION_AUTHORITY_STATE,
  assemblyReadinessMayActAsCalibrationPlan: false,
  assemblyReadinessMayAdmitNumericValue: false,
  assemblyReadinessMayInterpretSentinel: false,
  assemblyReadinessMayCreateO: false,
  assemblyReadinessMayActivateO: false,
} as const;

export const CALIBRATION_PLAN_ASSEMBLY_ELIGIBILITY_STATE = {
  ...CALIBRATION_ELIGIBILITY_STATE,
  publicDevelopment: true,
  authorizedForResearchEvidence: false,
  admissibleAsCalibrationPlan: false,
  admissibleAsNumericFreezeValue: false,
  admissibleAsProtocolManifest: false,
  admissibleAsBudgetFreezeManifest: false,
  confirmatory: false,
} as const;

export interface CalibrationPlanAssemblyRole {
  readonly role: "protocol_author" | "independent_verifier" | "audit_store";
  readonly publicPrincipal: PublicPrincipal;
  readonly processIdentity: string;
  readonly currentCapabilityHandles: readonly [];
  readonly delegatedCapabilityIds: readonly [];
  readonly roleAliases: readonly [];
}

export interface CalibrationPlanAssemblyReadiness {
  readonly schemaVersion: 1;
  readonly hashDomain: "CalibrationPlanAssemblyReadiness.v1";
  readonly assemblyReadinessId: string;
  readonly recordType: "calibration_plan_assembly_readiness";
  readonly status: "offline_mapping_and_firewall_ready_only";
  readonly zeroExecution: true;
  readonly calibrationPlanCreated: false;
  readonly sourceSnapshot: {
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly additionalPushPerformed: false;
  };
  readonly priorBindings: {
    readonly numericFreezeEntryId: string;
    readonly numericFreezeEntryRawSha256: string;
    readonly calibrationContractId: string;
    readonly calibrationContractHash: string;
    readonly calibrationContractRawSha256: string;
    readonly derivationReadinessId: string;
    readonly derivationReadinessHash: string;
    readonly derivationReadinessRawSha256: string;
    readonly derivationEvidencePacketRawSha256: string;
    readonly derivationEvidenceRulingRawSha256: string;
    readonly derivationEvidenceDecision: "APPROVE";
  };
  readonly artifacts: readonly CalibrationPlanAssemblyArtifactReference[];
  readonly programBindings: readonly {
    readonly target: "F" | "G" | "J" | "K" | "L" | "M";
    readonly programId: string;
    readonly sourceSha256: string;
  }[];
  readonly fieldEvidenceMap: readonly CalibrationFieldEvidenceMapping[];
  readonly mappingSummary: {
    readonly pendingSentinelPathCount: 25;
    readonly statisticalMarginGroupCount: 1;
    readonly mappingCount: 26;
    readonly effectiveExpandedOutputCount: 136;
    readonly valuesSupplied: 0;
    readonly futureEvidenceReferencesSupplied: 0;
  };
  readonly freezeAdmissionFirewall: typeof CALIBRATION_FREEZE_ADMISSION_FIREWALL;
  readonly futureCandidateGridSchemas: typeof CALIBRATION_FUTURE_CANDIDATE_GRID_SCHEMAS;
  readonly actualCandidateGridInstances: readonly [];
  readonly arithmeticPortabilityContract: typeof CALIBRATION_ARITHMETIC_PORTABILITY_CONTRACT;
  readonly portabilityGoldenVectors: readonly CalibrationPortabilityGoldenVector[];
  readonly assemblyCompletenessRule: typeof CALIBRATION_ASSEMBLY_COMPLETENESS_RULE;
  readonly roleBoundary: {
    readonly protocolAuthor: CalibrationPlanAssemblyRole;
    readonly independentVerifier: CalibrationPlanAssemblyRole;
    readonly auditStore: CalibrationPlanAssemblyRole;
    readonly requiredInequalities: readonly [
      "principalId",
      "instanceId",
      "keyId",
      "publicKeyDigest",
      "processIdentity",
    ];
    readonly aliasingDelegationCosigningProxyingForbidden: true;
  };
  readonly researchExecutionBudget: typeof CALIBRATION_PLAN_ASSEMBLY_ZERO_BUDGET;
  readonly authorityState: typeof CALIBRATION_PLAN_ASSEMBLY_AUTHORITY_STATE;
  readonly eligibilityState: typeof CALIBRATION_PLAN_ASSEMBLY_ELIGIBILITY_STATE;
  readonly futureIdentityState: {
    readonly finalProtocolId: null;
    readonly budgetFreezeId: null;
    readonly calibrationPlanManifestId: null;
    readonly calibrationEnvelopeId: null;
    readonly selectedProtocolValueSetId: null;
  };
  readonly forbiddenRecordTypes: readonly [
    "CalibrationPlanManifest",
    "calibration_envelope",
    "ProtocolManifest",
    "BudgetFreezeManifest",
    "O_proposal",
    "O_activation",
  ];
  readonly claimBoundary: {
    readonly mappingAndFirewallImplemented: true;
    readonly arithmeticPortabilityConformanceOnly: true;
    readonly calibrationPerformed: false;
    readonly calibrationPlanAdmissible: false;
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
  readonly assemblyReadinessHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedCalibrationPlanAssemblyReadiness = Omit<
  CalibrationPlanAssemblyReadiness,
  | "schemaVersion"
  | "hashDomain"
  | "assemblyReadinessId"
  | "recordType"
  | "recordedBy"
  | "assemblyReadinessHash"
  | "publicPrincipal"
  | "attestation"
>;

type AssemblyCore = Omit<
  CalibrationPlanAssemblyReadiness,
  "assemblyReadinessHash" | "publicPrincipal" | "attestation"
>;
type AssemblySignedBody = Omit<CalibrationPlanAssemblyReadiness, "attestation">;

function assemblyIdentity(value: UnsignedCalibrationPlanAssemblyReadiness): JsonValue {
  return {
    hashDomain: "CalibrationPlanAssemblyReadiness.v1",
    ...value,
  } as unknown as JsonValue;
}

function assemblyCore(record: CalibrationPlanAssemblyReadiness): AssemblyCore {
  const {
    assemblyReadinessHash: _hash,
    publicPrincipal: _principal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function assemblySignedBody(record: CalibrationPlanAssemblyReadiness): AssemblySignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createCalibrationPlanAssemblyReadiness(input: {
  readonly value: UnsignedCalibrationPlanAssemblyReadiness;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): CalibrationPlanAssemblyReadiness {
  assertCondition(input.signer.identity.role === "protocol_author", "AUTHORIZATION_DENIED", "Assembly readiness requires protocol author");
  assertCondition(
    canonicalize(input.signer.exportPublic()) === canonicalize(input.value.roleBoundary.protocolAuthor.publicPrincipal),
    "AUTHORIZATION_DENIED",
    "Assembly readiness signer differs from the protocol-author boundary",
  );
  const assemblyReadinessId = contentId("ci-sha256", assemblyIdentity(input.value)).replace("ci-sha256:", "cpar-sha256:");
  const core: AssemblyCore = {
    schemaVersion: 1,
    hashDomain: "CalibrationPlanAssemblyReadiness.v1",
    assemblyReadinessId,
    recordType: "calibration_plan_assembly_readiness",
    ...input.value,
    recordedBy: input.signer.identity,
  };
  const body: AssemblySignedBody = {
    ...core,
    assemblyReadinessHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const record: CalibrationPlanAssemblyReadiness = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  verifyCalibrationPlanAssemblyReadinessSignature({ record, schemas: input.schemas });
  return record;
}

export function verifyCalibrationPlanAssemblyReadinessSignature(input: {
  readonly record: CalibrationPlanAssemblyReadiness;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(CALIBRATION_PLAN_ASSEMBLY_READINESS_SCHEMA_ID, input.record as unknown as JsonValue);
  assertCondition(
    input.record.recordedBy.role === "protocol_author" &&
      canonicalize(input.record.recordedBy) === canonicalize(input.record.publicPrincipal.identity) &&
      canonicalize(input.record.recordedBy) === canonicalize(input.record.roleBoundary.protocolAuthor.publicPrincipal.identity),
    "AUTHORIZATION_DENIED",
    "Assembly readiness is not signed by the bound protocol author",
  );
  const registry = new PrincipalRegistry();
  registry.register(input.record.publicPrincipal);
  registry.verify(input.record.recordedBy, assemblySignedBody(input.record) as unknown as JsonValue, input.record.attestation);
  assertCondition(
    input.record.assemblyReadinessHash === sha256(assemblyCore(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Assembly readiness hash differs",
  );
  const {
    schemaVersion: _schemaVersion,
    assemblyReadinessId: _id,
    recordType: _recordType,
    recordedBy: _recordedBy,
    assemblyReadinessHash: _hash,
    publicPrincipal: _principal,
    attestation: _attestation,
    ...unsigned
  } = input.record;
  const expected = contentId("ci-sha256", assemblyIdentity(unsigned)).replace("ci-sha256:", "cpar-sha256:");
  assertCondition(input.record.assemblyReadinessId === expected, "HASH_MISMATCH", "Assembly readiness content identity differs");
}

export interface CalibrationPlanAssemblyIndependentVerification {
  readonly hashDomain: "CalibrationPlanAssemblyIndependentVerification.v1";
  readonly assemblyReadinessId: string;
  readonly assemblyReadinessHash: string;
  readonly readinessArtifactSha256: string;
  readonly verification: {
    readonly schemaValid: true;
    readonly signaturesValid: true;
    readonly sourceBindingsValid: true;
    readonly priorBindingsValid: true;
    readonly programBindingsExact: true;
    readonly fieldEvidenceMapCompleteAndValueFree: true;
    readonly freezeAdmissionFirewallExact: true;
    readonly futureGridSchemasValueFree: true;
    readonly portabilityContractExact: true;
    readonly crossImplementationGoldenVectorsMatch: true;
    readonly rolesDisjoint: true;
    readonly zeroExecutionBudget: true;
    readonly finalIdentitiesAbsent: true;
    readonly oCreationAbsent: true;
    readonly authoritiesGranted: 0;
  };
  readonly verifiedAt: string;
  readonly verifier: PrincipalIdentity;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface CalibrationPlanAssemblyAuditReceipt {
  readonly schemaVersion: 1;
  readonly hashDomain: "CalibrationPlanAssemblyAuditReceipt.v1";
  readonly receiptId: string;
  readonly recordType: "calibration_plan_assembly_readiness_audit_receipt";
  readonly readinessReference: {
    readonly assemblyReadinessId: string;
    readonly assemblyReadinessHash: string;
    readonly path: typeof CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH;
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  };
  readonly independentVerification: CalibrationPlanAssemblyIndependentVerification;
  readonly referenceOnly: true;
  readonly grantsAuthority: false;
  readonly producer: PrincipalIdentity;
  readonly receiptHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedCalibrationPlanAssemblyAuditReceipt = Omit<
  CalibrationPlanAssemblyAuditReceipt,
  | "schemaVersion"
  | "hashDomain"
  | "receiptId"
  | "recordType"
  | "producer"
  | "receiptHash"
  | "publicPrincipal"
  | "attestation"
>;

function independentUnsigned(value: CalibrationPlanAssemblyIndependentVerification): JsonValue {
  const { attestation: _attestation, ...unsigned } = value;
  return unsigned as unknown as JsonValue;
}

export function createCalibrationPlanAssemblyIndependentVerification(input: {
  readonly readiness: CalibrationPlanAssemblyReadiness;
  readonly readinessBytes: Uint8Array;
  readonly verification: CalibrationPlanAssemblyIndependentVerification["verification"];
  readonly verifiedAt: string;
  readonly signer: PrincipalSigner;
}): CalibrationPlanAssemblyIndependentVerification {
  assertCondition(input.signer.identity.role === "independent_verifier", "AUTHORIZATION_DENIED", "Assembly verification requires independent verifier");
  assertCondition(
    canonicalize(input.signer.exportPublic()) === canonicalize(input.readiness.roleBoundary.independentVerifier.publicPrincipal),
    "AUTHORIZATION_DENIED",
    "Independent verifier differs from readiness boundary",
  );
  const body = {
    hashDomain: "CalibrationPlanAssemblyIndependentVerification.v1" as const,
    assemblyReadinessId: input.readiness.assemblyReadinessId,
    assemblyReadinessHash: input.readiness.assemblyReadinessHash,
    readinessArtifactSha256: `sha256:${sha256Bytes(input.readinessBytes)}`,
    verification: input.verification,
    verifiedAt: input.verifiedAt,
    verifier: input.signer.identity,
    publicPrincipal: input.signer.exportPublic(),
  };
  return { ...body, attestation: input.signer.attest(body as unknown as JsonValue) };
}

type AuditCore = Omit<CalibrationPlanAssemblyAuditReceipt, "receiptHash" | "publicPrincipal" | "attestation">;
type AuditSignedBody = Omit<CalibrationPlanAssemblyAuditReceipt, "attestation">;

function auditCore(receipt: CalibrationPlanAssemblyAuditReceipt): AuditCore {
  const { receiptHash: _hash, publicPrincipal: _principal, attestation: _attestation, ...core } = receipt;
  return core;
}

function auditSignedBody(receipt: CalibrationPlanAssemblyAuditReceipt): AuditSignedBody {
  const { attestation: _attestation, ...body } = receipt;
  return body;
}

export function createCalibrationPlanAssemblyAuditReceipt(input: {
  readonly value: UnsignedCalibrationPlanAssemblyAuditReceipt;
  readonly readiness: CalibrationPlanAssemblyReadiness;
  readonly readinessBytes: Uint8Array;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): CalibrationPlanAssemblyAuditReceipt {
  assertCondition(input.signer.identity.role === "audit_store", "AUTHORIZATION_DENIED", "Assembly audit requires audit store");
  assertCondition(canonicalize(input.signer.exportPublic()) === canonicalize(input.readiness.roleBoundary.auditStore.publicPrincipal), "AUTHORIZATION_DENIED", "Audit store differs from readiness boundary");
  assertCondition(
    input.value.readinessReference.assemblyReadinessId === input.readiness.assemblyReadinessId &&
      input.value.readinessReference.assemblyReadinessHash === input.readiness.assemblyReadinessHash &&
      input.value.readinessReference.sha256 === `sha256:${sha256Bytes(input.readinessBytes)}` &&
      input.value.readinessReference.sizeBytes === input.readinessBytes.byteLength,
    "HASH_MISMATCH",
    "Assembly audit reference differs from exact bytes",
  );
  const receiptId = contentId("rss-sha256", { hashDomain: "CalibrationPlanAssemblyAuditReceipt.v1", ...input.value }).replace("rss-sha256:", "cparar-sha256:");
  const core: AuditCore = {
    schemaVersion: 1,
    hashDomain: "CalibrationPlanAssemblyAuditReceipt.v1",
    receiptId,
    recordType: "calibration_plan_assembly_readiness_audit_receipt",
    ...input.value,
    producer: input.signer.identity,
  };
  const body: AuditSignedBody = {
    ...core,
    receiptHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const receipt: CalibrationPlanAssemblyAuditReceipt = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  input.schemas.validate(CALIBRATION_PLAN_ASSEMBLY_READINESS_SCHEMA_ID, receipt as unknown as JsonValue);
  return receipt;
}

export function verifyCalibrationPlanAssemblyAuditSignatures(input: {
  readonly receipt: CalibrationPlanAssemblyAuditReceipt;
  readonly readiness: CalibrationPlanAssemblyReadiness;
  readonly readinessBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(CALIBRATION_PLAN_ASSEMBLY_READINESS_SCHEMA_ID, input.receipt as unknown as JsonValue);
  assertCondition(input.receipt.referenceOnly && !input.receipt.grantsAuthority, "AUTHORIZATION_DENIED", "Assembly audit receipt must remain reference-only");
  const exactSha = `sha256:${sha256Bytes(input.readinessBytes)}`;
  assertCondition(
    input.receipt.readinessReference.assemblyReadinessId === input.readiness.assemblyReadinessId &&
      input.receipt.readinessReference.assemblyReadinessHash === input.readiness.assemblyReadinessHash &&
      input.receipt.readinessReference.sha256 === exactSha &&
      input.receipt.readinessReference.sizeBytes === input.readinessBytes.byteLength &&
      input.receipt.independentVerification.assemblyReadinessId === input.readiness.assemblyReadinessId &&
      input.receipt.independentVerification.assemblyReadinessHash === input.readiness.assemblyReadinessHash &&
      input.receipt.independentVerification.readinessArtifactSha256 === exactSha,
    "HASH_MISMATCH",
    "Assembly receipt or nested verification references different bytes",
  );
  assertCondition(
    canonicalize(input.receipt.independentVerification.publicPrincipal) === canonicalize(input.readiness.roleBoundary.independentVerifier.publicPrincipal) &&
      canonicalize(input.receipt.independentVerification.verifier) === canonicalize(input.readiness.roleBoundary.independentVerifier.publicPrincipal.identity),
    "AUTHORIZATION_DENIED",
    "Nested independent verifier differs",
  );
  const independentRegistry = new PrincipalRegistry();
  independentRegistry.register(input.receipt.independentVerification.publicPrincipal);
  independentRegistry.verify(input.receipt.independentVerification.verifier, independentUnsigned(input.receipt.independentVerification), input.receipt.independentVerification.attestation);
  assertCondition(
    input.receipt.producer.role === "audit_store" &&
      canonicalize(input.receipt.publicPrincipal) === canonicalize(input.readiness.roleBoundary.auditStore.publicPrincipal) &&
      canonicalize(input.receipt.producer) === canonicalize(input.receipt.publicPrincipal.identity),
    "AUTHORIZATION_DENIED",
    "Assembly receipt producer differs from audit store",
  );
  const auditRegistry = new PrincipalRegistry();
  auditRegistry.register(input.receipt.publicPrincipal);
  auditRegistry.verify(input.receipt.producer, auditSignedBody(input.receipt) as unknown as JsonValue, input.receipt.attestation);
  assertCondition(input.receipt.receiptHash === sha256(auditCore(input.receipt) as unknown as JsonValue), "HASH_MISMATCH", "Assembly receipt hash differs");
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
  const expected = contentId("rss-sha256", { hashDomain: "CalibrationPlanAssemblyAuditReceipt.v1", ...unsigned }).replace("rss-sha256:", "cparar-sha256:");
  assertCondition(input.receipt.receiptId === expected, "HASH_MISMATCH", "Assembly receipt content identity differs");
}

export function calibrationAssignmentClass(path: string): CalibrationDerivationClass {
  const lookup = path === "h4TransferExperiment.secondProviderAndModelIdentity"
    ? "h4TransferExperiment.secondProviderAndModelIdentity/h4SecondModelIdentity"
    : path;
  const assignment = CALIBRATION_DERIVATION_ASSIGNMENTS.find(([candidate]) => candidate === lookup);
  if (assignment === undefined) throw new Error(`No calibration assignment for ${path}`);
  return assignment[1];
}
