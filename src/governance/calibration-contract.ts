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
  NUMERIC_FREEZE_ENTRY_AUTHORITY_STATE,
  NUMERIC_FREEZE_ENTRY_ELIGIBILITY_STATE,
  NUMERIC_FREEZE_ENTRY_PILOT_PENDING_FIELDS,
  NUMERIC_FREEZE_ENTRY_UNRESOLVED_SENTINELS,
  type NumericFreezeEntrySentinel,
} from "./research-protocol-numeric-freeze-entry.js";

export const CALIBRATION_CONTRACT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}calibration-contract.schema.json`;
export const CALIBRATION_CONTRACT_PATH =
  "governance/gate3/calibration-contract-preregistration.json";
export const CALIBRATION_CONTRACT_AUDIT_PATH =
  "governance/gate3/calibration-contract-preregistration-audit-receipt.json";

export type CalibrationArtifactMediaType =
  | "application/json"
  | "text/markdown; charset=utf-8"
  | "text/typescript; charset=utf-8"
  | "text/yaml; charset=utf-8";

export interface CalibrationArtifactReference {
  readonly artifactId: string;
  readonly path: string;
  readonly sourceCommit: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: CalibrationArtifactMediaType;
}

export const CALIBRATION_CONTRACT_ARTIFACT_SPECS = [
  {
    artifactId: "numeric_freeze_entry",
    path: "governance/gate3/research-protocol-numeric-freeze-entry.json",
    mediaType: "application/json",
  },
  {
    artifactId: "numeric_freeze_entry_receipt",
    path: "governance/gate3/research-protocol-numeric-freeze-entry-audit-receipt.json",
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
    artifactId: "evaluation_budget",
    path: "configs/evaluation-budget.yaml",
    mediaType: "text/yaml; charset=utf-8",
  },
  {
    artifactId: "entry_evidence_packet",
    path: "architect/PACKET_03RRRRRRRRRRRRRRRR_NUMERIC_FREEZE_ENTRY_EVIDENCE.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "entry_evidence_ruling",
    path: ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrr.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "derivation_preregistration_packet",
    path: "architect/PACKET_03RRRRRRRRRRRRRRRRR_NUMERIC_DERIVATION_PREREGISTRATION.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "derivation_preregistration_ruling",
    path: ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrr.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "authority_separation_packet",
    path: "architect/PACKET_03RRRRRRRRRRRRRRRRRR_EVALUATOR_SCORER_SEPARATION.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "authority_separation_ruling",
    path: ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrr.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "calibration_contract_schema",
    path: "schemas/calibration-contract.schema.json",
    mediaType: "application/json",
  },
  {
    artifactId: "common_contract_schema",
    path: "schemas/common.schema.json",
    mediaType: "application/json",
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
  {
    artifactId: "calibration_contract_model",
    path: "src/governance/calibration-contract.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "calibration_contract_verifier",
    path: "src/governance/calibration-contract-verifier.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "calibration_contract_generator",
    path: "scripts/create-calibration-contract.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "calibration_contract_verify_script",
    path: "scripts/verify-calibration-contract.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "calibration_contract_test",
    path: "test/calibration-contract.test.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "calibration_contract_documentation",
    path: "docs/evaluation/calibration-contract-preregistration.md",
    mediaType: "text/markdown; charset=utf-8",
  },
] as const satisfies readonly {
  readonly artifactId: string;
  readonly path: string;
  readonly mediaType: CalibrationArtifactMediaType;
}[];

export const CALIBRATION_PHASE_IDS = [
  "mine_trace_generation",
  "evidence_summarization",
  "weakness_mining",
  "attribution",
  "proposal",
  "static_validation",
  "gate_evaluation",
  "gate_selection",
  "offline_canary",
  "track_a_task_search",
  "final_solving",
  "temporal_replication",
] as const;

export const CALIBRATION_DERIVATION_CLASSES = [
  "normative_contract_value",
  "environment_identity_dependent",
  "provider_or_model_identity_dependent",
  "mine_calibration_required",
  "dedicated_pilot_required",
  "withdraw_if_not_estimable",
] as const;

export type CalibrationDerivationClass =
  (typeof CALIBRATION_DERIVATION_CLASSES)[number];

export interface CalibrationDerivationAssignment {
  readonly pathOrGroup: string;
  readonly derivationClass: CalibrationDerivationClass;
}

export const CALIBRATION_DERIVATION_ASSIGNMENTS = [
  ["seeds.finalRolloutCount", "dedicated_pilot_required"],
  ["seeds.finalRolloutValues", "normative_contract_value"],
  ["h4TransferExperiment.secondProviderAndModelIdentity/h4SecondModelIdentity", "withdraw_if_not_estimable"],
  ["identity.provider", "provider_or_model_identity_dependent"],
  ["identity.modelId", "provider_or_model_identity_dependent"],
  ["identity.modelRevision", "provider_or_model_identity_dependent"],
  ["identity.serviceTier", "provider_or_model_identity_dependent"],
  ["identity.reproducibilityTier", "provider_or_model_identity_dependent"],
  ["identity.parameters.reasoningEffort", "provider_or_model_identity_dependent"],
  ["identity.parameters.temperature", "provider_or_model_identity_dependent"],
  ["identity.parameters.topP", "provider_or_model_identity_dependent"],
  ["phases.*.providerModelRequestAttempts", "dedicated_pilot_required"],
  ["phases.*.totalChargedTokens", "dedicated_pilot_required"],
  ["phases.*.providerCostMicros", "provider_or_model_identity_dependent"],
  ["phases.*.toolAttempts", "dedicated_pilot_required"],
  ["phases.*.feedbackEvents", "normative_contract_value"],
  ["phases.*.wallClockSeconds", "dedicated_pilot_required"],
  ["phases.*.processCount", "normative_contract_value"],
  ["phases.*.cpuSeconds", "dedicated_pilot_required"],
  ["phases.*.memoryMiB", "dedicated_pilot_required"],
  ["phases.*.outputBytes", "dedicated_pilot_required"],
  ["perRequest.rolloutTokenCapT", "dedicated_pilot_required"],
  ["environment.containerImageDigest", "environment_identity_dependent"],
  ["environment.toolchainDigest", "environment_identity_dependent"],
  ["environment.networkPolicyDigest", "environment_identity_dependent"],
  ["statisticalMargins", "dedicated_pilot_required"],
] as const satisfies readonly (readonly [string, CalibrationDerivationClass])[];

export const CALIBRATION_NUMERIC_GRAPH = {
  nodes: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
  edges: [
    "A->B", "A->C", "A->D", "A->H", "A->N",
    "B->D", "B->F", "B->G", "B->I", "B->N",
    "C->D", "C->F", "C->G", "D->E", "E->F", "E->G",
    "E->K", "E->M", "F->G", "G+I->J", "A->K", "A->L",
    "A->M", "K->L", "B+C+F+G+H+J+K+L+M+N->O",
  ],
  cycleEdgesForbidden: ["O->D"],
} as const;

export const CALIBRATION_EVIDENCE_GRAPH = {
  nodes: ["D", "E0", "E1", "E2", "E3", "E4", "F", "G", "K", "M", "O"],
  edges: [
    "A+B+C->D",
    "D->E0",
    "E0->E1",
    "E1+signed_accounting+frozen_scoring_program->E2",
    "E2+reference_only_E1_roots->E3",
    "E3->E4",
    "E4->F",
    "E4->G",
    "E4->K",
    "E4->M",
    "accepted_prerequisites+F+G+H+J+K+L+M+N->O",
  ],
  forbiddenEdges: [
    "E1->E4",
    "E0->E2",
    "evaluator_raw->E2",
    "E1->O",
    "E2->O",
    "O->D",
  ],
} as const;

export const CALIBRATION_DERIVATION_RULES = [
  {
    ruleId: "identity_environment_price",
    targets: ["B", "C", "I", "N"],
    dataRole: "public_identity_and_reproducible_build_only",
    samplingUnit: "identity_assertion_or_build_artifact",
    candidateBound: 1,
    selectionRule: "exact_tuple_and_digest_match_with_integer_micros_rounded_up",
    precisionRule: "one_consistent_receipt_one_independent_verification_one_artifact_per_digest",
    failureDisposition: "block_primary_or_withdraw_H4_before_results",
  },
  {
    ruleId: "per_request_token_cap",
    targets: ["F"],
    dataRole: "dedicated_pilot_only",
    samplingUnit: "charged_provider_request_stratified_by_role_and_method",
    candidateBound: 8,
    selectionRule: "smallest_provider_admissible_cap_with_one_sided_95pct_truncation_upper_bound_at_most_1pct_each_stratum",
    precisionRule: "every_planned_stratum_uncensored_and_missing_usage_charged_at_reservation",
    failureDisposition: "withdraw_protocol_if_no_candidate_or_accounting_or_stratum_failure",
  },
  {
    ruleId: "phase_resource_caps",
    targets: ["G", "H", "J"],
    dataRole: "dedicated_pilot_plus_normative_topology_plus_signed_price",
    samplingUnit: "complete_task_method_seed_phase_transaction",
    candidateBound: 8,
    selectionRule: "smallest_upward_rounded_cap_with_one_sided_95pct_failure_upper_bound_at_most_1pct_each_reachable_stratum",
    precisionRule: "all_reachable_strata_observed_cost_derived_upward_feedback_and_process_normative",
    failureDisposition: "block_freeze_without_reallocation_on_incomplete_incident_mismatch_or_asymmetry",
  },
  {
    ruleId: "final_rollout_count_and_values",
    targets: ["K", "L"],
    dataRole: "dedicated_pilot_only",
    samplingUnit: "task_with_nested_rollout_seeds",
    candidateBound: 4,
    selectionRule: "smallest_of_2_3_5_8_with_mcse_at_most_1pp_and_seed_variance_at_most_20pct",
    precisionRule: "paired_hierarchical_bootstrap_and_sha256_seed_stream",
    failureDisposition: "freeze_8_with_precision_limited_or_new_nonpooled_protocol_after_protected_access",
  },
  {
    ruleId: "statistical_margins",
    targets: ["M"],
    dataRole: "dedicated_pilot_plus_public_task_count_resolution",
    samplingUnit: "paired_task_with_nested_seeds",
    candidateBound: 8,
    selectionRule: "strictest_margin_with_80pct_power_retention_and_predeclared_maximum_loss",
    precisionRule: "H3_margins_at_most_one_task_resolution_and_all_safety_margins_zero",
    failureDisposition: "H3_exploratory_or_protocol_revision_before_gate",
  },
] as const;

export const CALIBRATION_ATOMIC_FREEZE = {
  requiredResolvedNodes: ["B", "C", "F", "G", "H", "J", "K", "L", "M", "N"],
  outputs: ["ProtocolManifest", "BudgetFreezeManifest"],
  activation: "joint_transaction_only",
  finalIdentityDerivation: "after_all_payload_bytes_exist",
  grantsExecution: false,
  requiresLaterArchitectApproval: true,
  amendmentRule: "new_protocol_id_and_permanent_non_pooling",
  forbiddenInputs: [
    "sentinel_or_classification_as_value",
    "partial_or_per_field_activation",
    "synthetic_provider_smoke_fixture",
    "gate_final_temporal_withheld_or_oracle_information",
    "promotion_or_deployment_information",
    "unverified_E1_or_E2",
  ],
} as const;

export const CALIBRATION_FAILURE_CONDITIONS = [
  "cycle_or_missing_predecessor",
  "implicit_default_or_unpinned_price",
  "unsupported_or_mutable_identity",
  "missing_required_stratum_or_accounting",
  "no_feasible_precommitted_candidate",
  "infrastructure_incident_or_arm_asymmetry",
  "protected_or_contaminated_input",
  "post_result_edit",
  "role_key_process_mount_or_capability_collapse",
  "wrong_role_record_creation",
  "partial_freeze_or_premature_final_identity",
] as const;

export const CALIBRATION_ZERO_BUDGET = {
  providerModelRequestAttempts: 0,
  providerTokens: 0,
  providerCostMicros: 0,
  runtimeToolAttempts: 0,
  benchmarkVaultUnlocks: 0,
  protectedDataAccesses: 0,
  feedbackReleases: 0,
  researchSchedulerProcesses: 0,
  taskExecutions: 0,
  calibrationExecutions: 0,
  processCount: 0,
  wallClockSeconds: 0,
  cpuSeconds: 0,
  memoryMiB: 0,
  outputBytes: 0,
  mutationProposals: 0,
  candidateManifests: 0,
  evaluationResults: 0,
  selectionPromotionDeploymentActions: 0,
  gitPushes: 0,
} as const;

export const CALIBRATION_AUTHORITY_STATE = {
  ...NUMERIC_FREEZE_ENTRY_AUTHORITY_STATE,
  calibrationExecutionAuthorized: false,
  contractActivationAuthorized: false,
  protectedDataAccessAuthorized: false,
} as const;

export const CALIBRATION_ELIGIBILITY_STATE = {
  ...NUMERIC_FREEZE_ENTRY_ELIGIBILITY_STATE,
  authorizedForCalibration: false,
  authorizedForProtocolFreeze: false,
} as const;

export const CALIBRATION_RECORD_CREATION_MATRIX = [
  ["CalibrationMeasurementCommitment", "calibration_evaluator"],
  ["CalibrationEvaluatorFailureRecord", "calibration_evaluator"],
  ["CalibrationEvaluatorIncidentRecord", "calibration_evaluator"],
  ["AggregateCalibrationCommitment", "calibration_scorer"],
  ["RejectedDerivationCandidateCommitment", "calibration_scorer"],
  ["CalibrationWithdrawalRecord", "calibration_scorer"],
  ["CalibrationScorerFailureRecord", "calibration_scorer"],
  ["CalibrationScorerIncidentRecord", "calibration_scorer"],
  ["CalibrationVerificationReceipt", "independent_verifier"],
  ["ProtocolAuthorDerivedValueProposal", "protocol_author"],
] as const;

export const CALIBRATION_MESSAGE_FLOWS = [
  {
    from: "calibration_executor",
    to: "calibration_evaluator",
    acceptedRecordTypes: [
      "CalibrationExecutionReceipt",
      "CalibrationUsageReceipt",
      "CalibrationIncidentRecord",
    ],
  },
  {
    from: "calibration_evaluator",
    to: "calibration_scorer",
    acceptedRecordTypes: [
      "CalibrationMeasurementCommitment",
      "CalibrationEvaluatorFailureRecord",
      "CalibrationEvaluatorIncidentRecord",
    ],
  },
  {
    from: "calibration_scorer",
    to: "independent_verifier",
    acceptedRecordTypes: [
      "AggregateCalibrationCommitment",
      "RejectedDerivationCandidateCommitment",
      "CalibrationWithdrawalRecord",
      "CalibrationScorerFailureRecord",
      "CalibrationScorerIncidentRecord",
    ],
  },
  {
    from: "independent_verifier",
    to: "protocol_author",
    acceptedRecordTypes: ["CalibrationVerificationReceipt"],
  },
] as const;

export const CALIBRATION_EVALUATOR_READABLE = [
  "future.current_opaque_dedicated_pilot_capability",
  "future.current_task_body_inside_sandbox",
  "future.read_only_verifier_capability",
  "future.frozen_execution_environment",
  "future.executor_event_usage_incident_stream",
] as const;
export const CALIBRATION_EVALUATOR_WRITABLE = [
  "future.evaluator_only_raw_measurement_store",
  "future.signed_task_measurement_commitments",
  "future.evaluator_incident_failure_records",
] as const;
export const CALIBRATION_EVALUATOR_FORBIDDEN = [
  "aggregate_output",
  "protocol_mutation",
  "proposer_candidate_data",
  "promoter_deployment_keys",
  "other_tasks",
  "gate_final_temporal_withheld_paths",
] as const;
export const CALIBRATION_SCORER_READABLE = [
  "future.signed_evaluator_commitments",
  "future.opaque_task_stratum_commitments",
  "future.signed_accounting_records",
  "future.frozen_scoring_estimator_program",
  "future.precommitted_grids_abort_rules",
] as const;
export const CALIBRATION_SCORER_WRITABLE = [
  "future.signed_aggregate_calibration_commitments",
  "future.rejected_grid_commitments",
  "future.scorer_incident_failure_withdrawal_records",
] as const;
export const CALIBRATION_SCORER_FORBIDDEN = [
  "task_body",
  "raw_conversation_or_output",
  "verifier_source",
  "provider_credential_or_request_capability",
  "evaluator_raw_mount",
  "protocol_mutation",
  "proposer_promotion_deployment_state",
] as const;

export const CALIBRATION_DATA_ACCESS_MATRIX = [
  {
    role: "calibration_evaluator",
    allowedFutureDataClasses: [
      ...CALIBRATION_EVALUATOR_READABLE,
      ...CALIBRATION_EVALUATOR_WRITABLE,
    ],
    forbiddenDataClasses: [...CALIBRATION_EVALUATOR_FORBIDDEN],
  },
  {
    role: "calibration_scorer",
    allowedFutureDataClasses: [
      ...CALIBRATION_SCORER_READABLE,
      ...CALIBRATION_SCORER_WRITABLE,
    ],
    forbiddenDataClasses: [...CALIBRATION_SCORER_FORBIDDEN],
  },
  {
    role: "independent_verifier",
    allowedFutureDataClasses: [
      "future.signed_scorer_aggregate",
      "future.reference_only_evaluator_commitment_roots",
      "future.signed_accounting_roots",
      "future.frozen_contract_and_verifier_program",
    ],
    forbiddenDataClasses: [
      "task_body",
      "evaluator_raw_bytes_or_mount",
      "provider_credential_or_request_capability",
      "mutable_proposal_authority",
      "measurement_or_aggregate_creation",
    ],
  },
  {
    role: "protocol_author",
    allowedFutureDataClasses: [
      "future.independently_verified_aggregate_envelope",
      "future.rejected_value_commitments",
      "future.failure_or_withdrawal_disposition",
    ],
    forbiddenDataClasses: [
      "task_body",
      "task_level_measurements",
      "evaluator_raw_root_or_bytes",
      "evaluator_or_scorer_private_mount",
      "provider_credential_or_request_capability",
      "direct_evaluator_derived_value",
    ],
  },
] as const;

export interface CalibrationRoleAuthority {
  readonly role: "calibration_evaluator" | "calibration_scorer";
  readonly publicPrincipal: PublicPrincipal;
  readonly processIdentity: string;
  readonly writableMount: {
    readonly writableMountRoot: string;
    readonly canonicalSourceId: string;
    readonly backingObjectId: string;
    readonly mounted: false;
  };
  readonly readableDataClasses: readonly string[];
  readonly writableDataClasses: readonly string[];
  readonly forbiddenDataClasses: readonly string[];
  readonly currentCapabilityHandles: readonly [];
  readonly delegatedCapabilityIds: readonly [];
  readonly roleAliases: readonly [];
  readonly keyRotationLineage: readonly [];
}

export interface CalibrationContract {
  readonly schemaVersion: 1;
  readonly hashDomain: "CalibrationContract.v1";
  readonly calibrationContractId: string;
  readonly recordType: "calibration_contract_preregistration";
  readonly zeroExecution: true;
  readonly status: "preregistered_only";
  readonly evidencePresent: false;
  readonly authorizedForResearchEvidence: false;
  readonly sourceSnapshot: {
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly additionalPushPerformed: false;
  };
  readonly artifacts: readonly CalibrationArtifactReference[];
  readonly priorBindings: {
    readonly numericFreezeEntryId: "nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f";
    readonly numericFreezeEntryRawSha256: "sha256:432b341bf40096134d787381fb963c12266e2d73db97e079946614335ad01391";
    readonly entryEvidencePacketSha256: "sha256:6adbec974e9f994cb2dac92bbcb4f831611c5a19635296b8c52831ab9b3ccee6";
    readonly entryEvidenceRulingSha256: "sha256:8552851015a6fc09659677442710da6b1227a12943b52f1289d9dd51f4bea3ab";
    readonly derivationPacketSha256: "sha256:bffddeb8f9c7614f0ee7be5adb49cfd977b89ee3e607253b6f29e8629af61239";
    readonly derivationRulingSha256: "sha256:f002f7808d5377035dee1f5dbb060faf6e79802f86249c59b6a45f2f55e9d3f0";
    readonly separationPacketSha256: "sha256:d7ae7b647c58ff735dbd676390dd79300d26011ef8db85a8b3b979537c172ac6";
    readonly separationRulingSha256: "sha256:809987398f5abf6045cf62d6e91153332a406d3f671f784c37339f5a6a57e443";
    readonly derivationDecision: "REVISE";
    readonly separationDecision: "APPROVE";
  };
  readonly pendingInventory: {
    readonly groups: readonly string[];
    readonly sentinels: readonly NumericFreezeEntrySentinel[];
    readonly phaseIds: readonly string[];
  };
  readonly derivationContract: {
    readonly classes: readonly CalibrationDerivationClass[];
    readonly assignments: readonly CalibrationDerivationAssignment[];
    readonly numericGraph: typeof CALIBRATION_NUMERIC_GRAPH;
    readonly rules: readonly (typeof CALIBRATION_DERIVATION_RULES)[number][];
    readonly atomicFreeze: typeof CALIBRATION_ATOMIC_FREEZE;
    readonly failureConditions: readonly string[];
  };
  readonly authoritySeparation: {
    readonly evaluator: CalibrationRoleAuthority;
    readonly scorer: CalibrationRoleAuthority;
    readonly requiredInequalities: readonly [
      "principalId",
      "instanceId",
      "keyId",
      "publicKeyDigest",
      "processIdentity",
      "writableMountRoot"
    ];
    readonly canonicalMountSourcesMustDiffer: true;
    readonly backingObjectsMustDiffer: true;
    readonly delegationForbidden: true;
    readonly aliasingForbidden: true;
    readonly proxyWrappingCosigningInheritanceTemporaryReuseForbidden: true;
  };
  readonly capabilityMatrix: readonly {
    readonly capabilityId: string;
    readonly role: "calibration_evaluator" | "calibration_scorer";
    readonly purpose: string;
    readonly granted: false;
    readonly delegable: false;
    readonly currentHandle: null;
  }[];
  readonly mountMatrix: readonly {
    readonly role: "calibration_evaluator" | "calibration_scorer";
    readonly mountKind: "reserved_future_writable";
    readonly writableMountRoot: string;
    readonly canonicalSourceId: string;
    readonly backingObjectId: string;
    readonly mounted: false;
    readonly currentWriteCapability: null;
  }[];
  readonly dataAccessMatrix: readonly {
    readonly role:
      | "calibration_evaluator"
      | "calibration_scorer"
      | "independent_verifier"
      | "protocol_author";
    readonly allowedFutureDataClasses: readonly string[];
    readonly forbiddenDataClasses: readonly string[];
    readonly currentAccessGranted: false;
  }[];
  readonly messageFlows: readonly {
    readonly from: string;
    readonly to: string;
    readonly acceptedRecordTypes: readonly string[];
  }[];
  readonly recordCreationMatrix: readonly {
    readonly recordType: string;
    readonly soleCreator: string;
    readonly proxyWrapAliasDelegateCosignReuseForbidden: true;
  }[];
  readonly evidenceGraph: typeof CALIBRATION_EVIDENCE_GRAPH;
  readonly zeroBudget: typeof CALIBRATION_ZERO_BUDGET;
  readonly authorityState: typeof CALIBRATION_AUTHORITY_STATE;
  readonly eligibilityState: typeof CALIBRATION_ELIGIBILITY_STATE;
  readonly futureIdentityState: {
    readonly finalProtocolId: null;
    readonly budgetFreezeId: null;
    readonly providerIdentity: null;
    readonly modelIdentity: null;
    readonly calibrationEnvelopeId: null;
  };
  readonly claimBoundary: {
    readonly contractPreregistered: true;
    readonly calibrationPerformed: false;
    readonly numericFreezeComplete: false;
    readonly researchProtocolFrozen: false;
    readonly performanceEvidence: false;
    readonly fairnessEvidence: false;
    readonly securityClaim: false;
    readonly evolutionClaim: false;
    readonly selfImprovementClaim: false;
  };
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly contractHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedCalibrationContract = Omit<
  CalibrationContract,
  | "schemaVersion"
  | "hashDomain"
  | "calibrationContractId"
  | "recordType"
  | "recordedBy"
  | "contractHash"
  | "publicPrincipal"
  | "attestation"
>;

type ContractCore = Omit<
  CalibrationContract,
  "contractHash" | "publicPrincipal" | "attestation"
>;
type ContractSignedBody = Omit<CalibrationContract, "attestation">;

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

function contractIdentity(value: UnsignedCalibrationContract): JsonValue {
  return {
    hashDomain: "CalibrationContract.v1",
    ...value,
  } as unknown as JsonValue;
}

function contractCore(record: CalibrationContract): ContractCore {
  const {
    contractHash: _contractHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function contractSignedBody(record: CalibrationContract): ContractSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createCalibrationContract(input: {
  readonly value: UnsignedCalibrationContract;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): CalibrationContract {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Calibration contract requires a protocol-author signer",
  );
  const calibrationContractId = contentId(
    "ci-sha256",
    contractIdentity(input.value),
  ).replace("ci-sha256:", "cc-sha256:");
  const core: ContractCore = {
    schemaVersion: 1,
    hashDomain: "CalibrationContract.v1",
    calibrationContractId,
    recordType: "calibration_contract_preregistration",
    ...input.value,
    recordedBy: input.signer.identity,
  };
  const body: ContractSignedBody = {
    ...core,
    contractHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const record: CalibrationContract = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  verifyCalibrationContractSignature({ record, schemas: input.schemas });
  return record;
}

export function verifyCalibrationContractSignature(input: {
  readonly record: CalibrationContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    CALIBRATION_CONTRACT_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.recordedBy.role === "protocol_author" &&
      sameJson(input.record.recordedBy, input.record.publicPrincipal.identity),
    "AUTHORIZATION_DENIED",
    "Calibration contract signer differs from protocol author",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    contractSignedBody(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
  assertCondition(
    input.record.contractHash ===
      sha256(contractCore(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Calibration contract hash differs",
  );
  const {
    schemaVersion: _schemaVersion,
    calibrationContractId: _calibrationContractId,
    recordType: _recordType,
    recordedBy: _recordedBy,
    contractHash: _contractHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...unsigned
  } = input.record;
  const expected = contentId(
    "ci-sha256",
    contractIdentity(unsigned),
  ).replace("ci-sha256:", "cc-sha256:");
  assertCondition(
    input.record.calibrationContractId === expected,
    "HASH_MISMATCH",
    "Calibration contract content identity differs",
  );
}

export interface CalibrationContractAuditReceipt {
  readonly schemaVersion: 1;
  readonly hashDomain: "CalibrationContractAuditReceipt.v1";
  readonly receiptId: string;
  readonly recordType: "calibration_contract_audit_receipt";
  readonly contractReference: {
    readonly calibrationContractId: string;
    readonly contractHash: string;
    readonly path: typeof CALIBRATION_CONTRACT_PATH;
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  };
  readonly verifierArtifactId: "calibration_contract_verifier";
  readonly verification: {
    readonly schemaValid: true;
    readonly signatureValid: true;
    readonly sourceBindingsValid: true;
    readonly numericInventoryUnchanged: true;
    readonly derivationContractComplete: true;
    readonly authoritySeparationValid: true;
    readonly mountSourcesDisjoint: true;
    readonly messageAndRecordOwnershipValid: true;
    readonly evidenceGraphComplete: true;
    readonly zeroExecutionAndAuthorityValid: true;
    readonly forbiddenDataAbsent: true;
    readonly finalIdentitiesAbsent: true;
    readonly authoritiesGranted: 0;
  };
  readonly verifiedAt: string;
  readonly producer: PrincipalIdentity;
  readonly receiptHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedCalibrationContractAuditReceipt = Omit<
  CalibrationContractAuditReceipt,
  | "schemaVersion"
  | "hashDomain"
  | "receiptId"
  | "recordType"
  | "producer"
  | "receiptHash"
  | "publicPrincipal"
  | "attestation"
>;

type ReceiptCore = Omit<
  CalibrationContractAuditReceipt,
  "receiptHash" | "publicPrincipal" | "attestation"
>;
type ReceiptSignedBody = Omit<CalibrationContractAuditReceipt, "attestation">;

function receiptIdentity(
  value: UnsignedCalibrationContractAuditReceipt,
): JsonValue {
  return {
    hashDomain: "CalibrationContractAuditReceipt.v1",
    ...value,
  } as unknown as JsonValue;
}

function receiptCore(receipt: CalibrationContractAuditReceipt): ReceiptCore {
  const {
    receiptHash: _receiptHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = receipt;
  return core;
}

function receiptSignedBody(
  receipt: CalibrationContractAuditReceipt,
): ReceiptSignedBody {
  const { attestation: _attestation, ...body } = receipt;
  return body;
}

export function createCalibrationContractAuditReceipt(input: {
  readonly value: UnsignedCalibrationContractAuditReceipt;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
  readonly contract: CalibrationContract;
  readonly contractBytes: Uint8Array;
}): CalibrationContractAuditReceipt {
  assertCondition(
    input.signer.identity.role === "audit_store",
    "AUTHORIZATION_DENIED",
    "Calibration contract receipt requires an audit-store signer",
  );
  const receiptId = contentId(
    "ci-sha256",
    receiptIdentity(input.value),
  ).replace("ci-sha256:", "ccar-sha256:");
  const core: ReceiptCore = {
    schemaVersion: 1,
    hashDomain: "CalibrationContractAuditReceipt.v1",
    receiptId,
    recordType: "calibration_contract_audit_receipt",
    ...input.value,
    producer: input.signer.identity,
  };
  const body: ReceiptSignedBody = {
    ...core,
    receiptHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const receipt: CalibrationContractAuditReceipt = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  verifyCalibrationContractAuditReceipt({
    receipt,
    contract: input.contract,
    contractBytes: input.contractBytes,
    schemas: input.schemas,
  });
  return receipt;
}

export function verifyCalibrationContractAuditReceipt(input: {
  readonly receipt: CalibrationContractAuditReceipt;
  readonly contract: CalibrationContract;
  readonly contractBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    CALIBRATION_CONTRACT_SCHEMA_ID,
    input.receipt as unknown as JsonValue,
  );
  assertCondition(
    input.receipt.producer.role === "audit_store" &&
      sameJson(input.receipt.producer, input.receipt.publicPrincipal.identity),
    "AUTHORIZATION_DENIED",
    "Calibration receipt signer differs from audit store",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.receipt.publicPrincipal);
  principals.verify(
    input.receipt.producer,
    receiptSignedBody(input.receipt) as unknown as JsonValue,
    input.receipt.attestation,
  );
  assertCondition(
    input.receipt.receiptHash ===
      sha256(receiptCore(input.receipt) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Calibration receipt hash differs",
  );
  const {
    schemaVersion: _schemaVersion,
    receiptId: _receiptId,
    recordType: _recordType,
    producer: _producer,
    receiptHash: _receiptHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...unsigned
  } = input.receipt;
  const expected = contentId(
    "ci-sha256",
    receiptIdentity(unsigned),
  ).replace("ci-sha256:", "ccar-sha256:");
  assertCondition(
    input.receipt.receiptId === expected &&
      input.receipt.contractReference.calibrationContractId ===
        input.contract.calibrationContractId &&
      input.receipt.contractReference.contractHash ===
        input.contract.contractHash &&
      input.receipt.contractReference.path === CALIBRATION_CONTRACT_PATH &&
      input.receipt.contractReference.sha256 ===
        `sha256:${sha256Bytes(input.contractBytes)}` &&
      input.receipt.contractReference.sizeBytes === input.contractBytes.byteLength,
    "HASH_MISMATCH",
    "Calibration receipt identity or reference differs",
  );
}

export function defaultCalibrationPendingInventory(): {
  readonly groups: readonly string[];
  readonly sentinels: readonly NumericFreezeEntrySentinel[];
  readonly phaseIds: readonly string[];
} {
  return {
    groups: [...NUMERIC_FREEZE_ENTRY_PILOT_PENDING_FIELDS],
    sentinels: [...NUMERIC_FREEZE_ENTRY_UNRESOLVED_SENTINELS],
    phaseIds: [...CALIBRATION_PHASE_IDS],
  };
}
