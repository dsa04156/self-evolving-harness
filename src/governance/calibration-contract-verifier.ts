import { execFile } from "node:child_process";
import {
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  canonicalBytes,
  canonicalize,
  parseStrictJson,
  sha256,
  sha256Bytes,
  type JsonValue,
} from "../core/canonical.js";
import { SchemaRegistry } from "../contracts/schema-registry.js";
import type {
  CalibrationArtifactReference,
  CalibrationContract,
  CalibrationContractAuditReceipt,
} from "./calibration-contract.js";

const execFileAsync = promisify(execFile);
const SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/calibration-contract.schema.json";
const CONTRACT_PATH =
  "governance/gate3/calibration-contract-preregistration.json";
const RECEIPT_PATH =
  "governance/gate3/calibration-contract-preregistration-audit-receipt.json";

const EXPECTED_ARTIFACTS = [
  ["numeric_freeze_entry", "governance/gate3/research-protocol-numeric-freeze-entry.json", "application/json"],
  ["numeric_freeze_entry_receipt", "governance/gate3/research-protocol-numeric-freeze-entry-audit-receipt.json", "application/json"],
  ["conformance_manifest", "governance/trust-plane/conformance-manifest.json", "application/json"],
  ["outstanding_obligations", "governance/trust-plane/outstanding-obligations.json", "application/json"],
  ["evaluation_budget", "configs/evaluation-budget.yaml", "text/yaml; charset=utf-8"],
  ["entry_evidence_packet", "architect/PACKET_03RRRRRRRRRRRRRRRR_NUMERIC_FREEZE_ENTRY_EVIDENCE.md", "text/markdown; charset=utf-8"],
  ["entry_evidence_ruling", ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrr.md", "text/markdown; charset=utf-8"],
  ["derivation_preregistration_packet", "architect/PACKET_03RRRRRRRRRRRRRRRRR_NUMERIC_DERIVATION_PREREGISTRATION.md", "text/markdown; charset=utf-8"],
  ["derivation_preregistration_ruling", ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrr.md", "text/markdown; charset=utf-8"],
  ["authority_separation_packet", "architect/PACKET_03RRRRRRRRRRRRRRRRRR_EVALUATOR_SCORER_SEPARATION.md", "text/markdown; charset=utf-8"],
  ["authority_separation_ruling", ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrr.md", "text/markdown; charset=utf-8"],
  ["calibration_contract_schema", "schemas/calibration-contract.schema.json", "application/json"],
  ["common_contract_schema", "schemas/common.schema.json", "application/json"],
  ["principal_identity_source", "src/trust/identity.ts", "text/typescript; charset=utf-8"],
  ["public_api_source", "src/index.ts", "text/typescript; charset=utf-8"],
  ["package_manifest", "package.json", "application/json"],
  ["calibration_contract_model", "src/governance/calibration-contract.ts", "text/typescript; charset=utf-8"],
  ["calibration_contract_verifier", "src/governance/calibration-contract-verifier.ts", "text/typescript; charset=utf-8"],
  ["calibration_contract_generator", "scripts/create-calibration-contract.ts", "text/typescript; charset=utf-8"],
  ["calibration_contract_verify_script", "scripts/verify-calibration-contract.ts", "text/typescript; charset=utf-8"],
  ["calibration_contract_test", "test/calibration-contract.test.ts", "text/typescript; charset=utf-8"],
  ["calibration_contract_documentation", "docs/evaluation/calibration-contract-preregistration.md", "text/markdown; charset=utf-8"],
] as const;

const EXPECTED_GROUPS = [
  "seeds.finalRolloutCount",
  "seeds.finalRolloutValues",
  "identity",
  "phases",
  "perRequest.rolloutTokenCapT",
  "environment",
  "statisticalMargins",
  "h4SecondModelIdentity",
] as const;
const EXPECTED_PHASES = [
  "mine_trace_generation", "evidence_summarization", "weakness_mining",
  "attribution", "proposal", "static_validation", "gate_evaluation",
  "gate_selection", "offline_canary", "track_a_task_search",
  "final_solving", "temporal_replication",
] as const;
const EXPECTED_SENTINELS = [
  ["seeds.finalRolloutCount", "PILOT_PENDING_BY_PRECISION_RULE", 1],
  ["seeds.finalRolloutValues", "PILOT_PENDING_AFTER_COUNT_FREEZE", 1],
  ["h4TransferExperiment.secondProviderAndModelIdentity", "PILOT_PENDING", 1],
  ["identity.provider", "PILOT_PENDING", 1],
  ["identity.modelId", "PILOT_PENDING", 1],
  ["identity.modelRevision", "PILOT_PENDING", 1],
  ["identity.serviceTier", "PILOT_PENDING", 1],
  ["identity.reproducibilityTier", "PILOT_PENDING", 1],
  ["identity.parameters.reasoningEffort", "PILOT_PENDING", 1],
  ["identity.parameters.temperature", "PILOT_PENDING", 1],
  ["identity.parameters.topP", "PILOT_PENDING", 1],
  ["phases.*.providerModelRequestAttempts", "PILOT_PENDING", 12],
  ["phases.*.totalChargedTokens", "PILOT_PENDING", 12],
  ["phases.*.providerCostMicros", "PILOT_PENDING", 12],
  ["phases.*.toolAttempts", "PILOT_PENDING", 12],
  ["phases.*.feedbackEvents", "PILOT_PENDING", 12],
  ["phases.*.wallClockSeconds", "PILOT_PENDING", 12],
  ["phases.*.processCount", "PILOT_PENDING", 12],
  ["phases.*.cpuSeconds", "PILOT_PENDING", 12],
  ["phases.*.memoryMiB", "PILOT_PENDING", 12],
  ["phases.*.outputBytes", "PILOT_PENDING", 12],
  ["perRequest.rolloutTokenCapT", "PILOT_PENDING", 1],
  ["environment.containerImageDigest", "PILOT_PENDING", 1],
  ["environment.toolchainDigest", "PILOT_PENDING", 1],
  ["environment.networkPolicyDigest", "PILOT_PENDING", 1],
] as const;
const EXPECTED_CLASSES = [
  "normative_contract_value", "environment_identity_dependent",
  "provider_or_model_identity_dependent", "mine_calibration_required",
  "dedicated_pilot_required", "withdraw_if_not_estimable",
] as const;
const EXPECTED_ASSIGNMENTS = [
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
] as const;
const EXPECTED_NUMERIC_GRAPH = {
  nodes: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
  edges: [
    "A->B", "A->C", "A->D", "A->H", "A->N", "B->D", "B->F",
    "B->G", "B->I", "B->N", "C->D", "C->F", "C->G", "D->E",
    "E->F", "E->G", "E->K", "E->M", "F->G", "G+I->J", "A->K",
    "A->L", "A->M", "K->L", "B+C+F+G+H+J+K+L+M+N->O",
  ],
  cycleEdgesForbidden: ["O->D"],
} as const;
const EXPECTED_EVIDENCE_GRAPH = {
  nodes: ["D", "E0", "E1", "E2", "E3", "E4", "F", "G", "K", "M", "O"],
  edges: [
    "A+B+C->D", "D->E0", "E0->E1",
    "E1+signed_accounting+frozen_scoring_program->E2",
    "E2+reference_only_E1_roots->E3", "E3->E4", "E4->F", "E4->G",
    "E4->K", "E4->M", "accepted_prerequisites+F+G+H+J+K+L+M+N->O",
  ],
  forbiddenEdges: ["E1->E4", "E0->E2", "evaluator_raw->E2", "E1->O", "E2->O", "O->D"],
} as const;
const EXPECTED_RULES = [
  ["identity_environment_price", ["B", "C", "I", "N"], "public_identity_and_reproducible_build_only", "identity_assertion_or_build_artifact", 1, "exact_tuple_and_digest_match_with_integer_micros_rounded_up", "one_consistent_receipt_one_independent_verification_one_artifact_per_digest", "block_primary_or_withdraw_H4_before_results"],
  ["per_request_token_cap", ["F"], "dedicated_pilot_only", "charged_provider_request_stratified_by_role_and_method", 8, "smallest_provider_admissible_cap_with_one_sided_95pct_truncation_upper_bound_at_most_1pct_each_stratum", "every_planned_stratum_uncensored_and_missing_usage_charged_at_reservation", "withdraw_protocol_if_no_candidate_or_accounting_or_stratum_failure"],
  ["phase_resource_caps", ["G", "H", "J"], "dedicated_pilot_plus_normative_topology_plus_signed_price", "complete_task_method_seed_phase_transaction", 8, "smallest_upward_rounded_cap_with_one_sided_95pct_failure_upper_bound_at_most_1pct_each_reachable_stratum", "all_reachable_strata_observed_cost_derived_upward_feedback_and_process_normative", "block_freeze_without_reallocation_on_incomplete_incident_mismatch_or_asymmetry"],
  ["final_rollout_count_and_values", ["K", "L"], "dedicated_pilot_only", "task_with_nested_rollout_seeds", 4, "smallest_of_2_3_5_8_with_mcse_at_most_1pp_and_seed_variance_at_most_20pct", "paired_hierarchical_bootstrap_and_sha256_seed_stream", "freeze_8_with_precision_limited_or_new_nonpooled_protocol_after_protected_access"],
  ["statistical_margins", ["M"], "dedicated_pilot_plus_public_task_count_resolution", "paired_task_with_nested_seeds", 8, "strictest_margin_with_80pct_power_retention_and_predeclared_maximum_loss", "H3_margins_at_most_one_task_resolution_and_all_safety_margins_zero", "H3_exploratory_or_protocol_revision_before_gate"],
] as const;
const EXPECTED_ATOMIC_FREEZE = {
  requiredResolvedNodes: ["B", "C", "F", "G", "H", "J", "K", "L", "M", "N"],
  outputs: ["ProtocolManifest", "BudgetFreezeManifest"],
  activation: "joint_transaction_only",
  finalIdentityDerivation: "after_all_payload_bytes_exist",
  grantsExecution: false,
  requiresLaterArchitectApproval: true,
  amendmentRule: "new_protocol_id_and_permanent_non_pooling",
  forbiddenInputs: ["sentinel_or_classification_as_value", "partial_or_per_field_activation", "synthetic_provider_smoke_fixture", "gate_final_temporal_withheld_or_oracle_information", "promotion_or_deployment_information", "unverified_E1_or_E2"],
} as const;
const EXPECTED_FAILURES = [
  "cycle_or_missing_predecessor", "implicit_default_or_unpinned_price",
  "unsupported_or_mutable_identity", "missing_required_stratum_or_accounting",
  "no_feasible_precommitted_candidate", "infrastructure_incident_or_arm_asymmetry",
  "protected_or_contaminated_input", "post_result_edit",
  "role_key_process_mount_or_capability_collapse", "wrong_role_record_creation",
  "partial_freeze_or_premature_final_identity",
] as const;
const EXPECTED_EVALUATOR_READABLE = ["future.current_opaque_dedicated_pilot_capability", "future.current_task_body_inside_sandbox", "future.read_only_verifier_capability", "future.frozen_execution_environment", "future.executor_event_usage_incident_stream"] as const;
const EXPECTED_EVALUATOR_WRITABLE = ["future.evaluator_only_raw_measurement_store", "future.signed_task_measurement_commitments", "future.evaluator_incident_failure_records"] as const;
const EXPECTED_EVALUATOR_FORBIDDEN = ["aggregate_output", "protocol_mutation", "proposer_candidate_data", "promoter_deployment_keys", "other_tasks", "gate_final_temporal_withheld_paths"] as const;
const EXPECTED_SCORER_READABLE = ["future.signed_evaluator_commitments", "future.opaque_task_stratum_commitments", "future.signed_accounting_records", "future.frozen_scoring_estimator_program", "future.precommitted_grids_abort_rules"] as const;
const EXPECTED_SCORER_WRITABLE = ["future.signed_aggregate_calibration_commitments", "future.rejected_grid_commitments", "future.scorer_incident_failure_withdrawal_records"] as const;
const EXPECTED_SCORER_FORBIDDEN = ["task_body", "raw_conversation_or_output", "verifier_source", "provider_credential_or_request_capability", "evaluator_raw_mount", "protocol_mutation", "proposer_promotion_deployment_state"] as const;
const EXPECTED_DATA_ACCESS = [
  ["calibration_evaluator", [...EXPECTED_EVALUATOR_READABLE, ...EXPECTED_EVALUATOR_WRITABLE], EXPECTED_EVALUATOR_FORBIDDEN],
  ["calibration_scorer", [...EXPECTED_SCORER_READABLE, ...EXPECTED_SCORER_WRITABLE], EXPECTED_SCORER_FORBIDDEN],
  ["independent_verifier", ["future.signed_scorer_aggregate", "future.reference_only_evaluator_commitment_roots", "future.signed_accounting_roots", "future.frozen_contract_and_verifier_program"], ["task_body", "evaluator_raw_bytes_or_mount", "provider_credential_or_request_capability", "mutable_proposal_authority", "measurement_or_aggregate_creation"]],
  ["protocol_author", ["future.independently_verified_aggregate_envelope", "future.rejected_value_commitments", "future.failure_or_withdrawal_disposition"], ["task_body", "task_level_measurements", "evaluator_raw_root_or_bytes", "evaluator_or_scorer_private_mount", "provider_credential_or_request_capability", "direct_evaluator_derived_value"]],
] as const;
const EXPECTED_CAPABILITIES = [
  ["future.evaluator.execute_current_pilot_once", "calibration_evaluator", "bounded_current_pilot_task_execution"],
  ["future.evaluator.read_verifier", "calibration_evaluator", "read_only_verifier_access"],
  ["future.evaluator.read_executor_stream", "calibration_evaluator", "signed_executor_stream_read"],
  ["future.evaluator.write_measurement", "calibration_evaluator", "evaluator_owned_measurement_write"],
  ["future.scorer.read_measurement_commitment", "calibration_scorer", "reference_only_measurement_read"],
  ["future.scorer.read_accounting", "calibration_scorer", "signed_accounting_read"],
  ["future.scorer.run_frozen_scoring", "calibration_scorer", "deterministic_scoring_only"],
] as const;
const EXPECTED_MESSAGES = [
  ["calibration_executor", "calibration_evaluator", ["CalibrationExecutionReceipt", "CalibrationUsageReceipt", "CalibrationIncidentRecord"]],
  ["calibration_evaluator", "calibration_scorer", ["CalibrationMeasurementCommitment", "CalibrationEvaluatorFailureRecord", "CalibrationEvaluatorIncidentRecord"]],
  ["calibration_scorer", "independent_verifier", ["AggregateCalibrationCommitment", "RejectedDerivationCandidateCommitment", "CalibrationWithdrawalRecord", "CalibrationScorerFailureRecord", "CalibrationScorerIncidentRecord"]],
  ["independent_verifier", "protocol_author", ["CalibrationVerificationReceipt"]],
] as const;
const EXPECTED_RECORD_CREATORS = [
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
const EXPECTED_ZERO_KEYS = ["providerModelRequestAttempts", "providerTokens", "providerCostMicros", "runtimeToolAttempts", "benchmarkVaultUnlocks", "protectedDataAccesses", "feedbackReleases", "researchSchedulerProcesses", "taskExecutions", "calibrationExecutions", "processCount", "wallClockSeconds", "cpuSeconds", "memoryMiB", "outputBytes", "mutationProposals", "candidateManifests", "evaluationResults", "selectionPromotionDeploymentActions", "gitPushes"] as const;
const EXPECTED_AUTHORITY_KEYS = ["providerExecutionAuthorized", "researchEvidenceAuthorized", "candidateSelectionAuthorized", "promotionAuthorized", "deploymentAuthorized", "claimAuthorityGranted", "calibrationExecutionAuthorized", "contractActivationAuthorized", "protectedDataAccessAuthorized"] as const;
const EXPECTED_ELIGIBILITY_FALSE_KEYS = ["authorizedForResearchEvidence", "confirmatory", "eligibleForGate", "eligibleForFinal", "eligibleForHeldOut", "eligibleForSealed", "eligibleForTemporalHoldout", "authorizedForPromotion", "authorizedForCalibration", "authorizedForProtocolFreeze"] as const;
const EXPECTED_OBLIGATIONS = ["b0_b6_research_execution", "held_out_confirmatory_attribution", "performance_generalization_security_evolution_results", "real_benchmark_custody", "real_provider_receipt", "research_candidate_selection_promotion", "research_protocol_numeric_freeze"] as const;

interface SignedRecord {
  readonly recordedBy?: JsonValue;
  readonly producer?: JsonValue;
  readonly publicPrincipal: {
    readonly identity: JsonValue;
    readonly keyId: string;
    readonly publicKeyPem: string;
  };
  readonly attestation: {
    readonly algorithm: string;
    readonly keyId: string;
    readonly signature: string;
  };
  readonly [key: string]: JsonValue | undefined;
}

export interface CalibrationContractArtifactReader {
  treeOf(commit: string): Promise<string>;
  read(commit: string, artifactPath: string): Promise<Buffer>;
}

export class GitCalibrationContractArtifactReader
implements CalibrationContractArtifactReader {
  readonly #root: string;

  public constructor(root: string) {
    this.#root = root;
  }

  public async treeOf(commit: string): Promise<string> {
    const result = await execFileAsync("git", ["rev-parse", "--verify", `${commit}^{tree}`], {
      cwd: this.#root,
      encoding: "utf8",
    });
    return result.stdout.trim();
  }

  public async read(commit: string, artifactPath: string): Promise<Buffer> {
    ensureSafePath(artifactPath);
    const result = await execFileAsync("git", ["show", `${commit}:${artifactPath}`], {
      cwd: this.#root,
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024,
    });
    return result.stdout;
  }
}

export interface CalibrationContractVerificationResult {
  readonly verified: true;
  readonly calibrationContractId: string;
  readonly contractHash: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly artifactCount: 22;
  readonly pendingSentinelCount: 25;
  readonly pendingGroupCount: 8;
  readonly phaseCount: 12;
  readonly derivationClassCount: 6;
  readonly evidenceNodeCount: 11;
  readonly unresolvedObligationCount: 7;
  readonly providerModelRequestAttempts: 0;
  readonly calibrationExecutions: 0;
  readonly authoritiesGranted: 0;
  readonly authorizedForResearchEvidence: false;
  readonly finalProtocolId: null;
  readonly budgetFreezeId: null;
}

function fail(message: string): never {
  throw new Error(`Calibration-contract verification failed: ${message}`);
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function ensureSafePath(value: string): void {
  ensure(!path.isAbsolute(value) && !value.split("/").includes("..") && value.length > 0, `unsafe artifact path ${value}`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameStrings(actual: readonly string[], expected: readonly string[], label: string): void {
  ensure(sameJson(sorted(actual), sorted(expected)), `${label} differs`);
}

function withoutKeys(value: SignedRecord, keys: readonly string[]): JsonValue {
  const excluded = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key))) as JsonValue;
}

function verifyEmbeddedSignature(record: SignedRecord, identityField: "recordedBy" | "producer", expectedRole: "protocol_author" | "audit_store", label: string): void {
  const identity = record[identityField];
  ensure(identity !== undefined, `${label} signer is absent`);
  ensure(record.attestation.algorithm === "Ed25519" && record.attestation.keyId === record.publicPrincipal.keyId, `${label} attestation metadata differs`);
  ensure(sameJson(identity, record.publicPrincipal.identity), `${label} public principal differs`);
  const identityRecord = identity as { readonly role?: unknown; readonly identityDigest?: unknown };
  ensure(identityRecord.role === expectedRole, `${label} signer role differs`);
  const publicKey = createPublicKey(record.publicPrincipal.publicKeyPem);
  const der = publicKey.export({ type: "spki", format: "der" });
  ensure(identityRecord.identityDigest === `sha256:${sha256Bytes(der)}`, `${label} public-key digest differs`);
  ensure(verifySignature(null, canonicalBytes(withoutKeys(record, ["attestation"])), publicKey, Buffer.from(record.attestation.signature, "base64url")), `${label} signature is invalid`);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  ensure(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is not an object`);
  return value as Record<string, unknown>;
}

function artifactMap(record: CalibrationContract): Map<string, CalibrationArtifactReference> {
  const result = new Map<string, CalibrationArtifactReference>();
  const paths = new Set<string>();
  for (const artifact of record.artifacts) {
    ensure(!result.has(artifact.artifactId), "duplicate artifact ID");
    ensure(!paths.has(artifact.path), "duplicate artifact path");
    result.set(artifact.artifactId, artifact);
    paths.add(artifact.path);
  }
  return result;
}

function verifyPublicRole(role: CalibrationContract["authoritySeparation"]["evaluator"], expectedRole: "calibration_evaluator" | "calibration_scorer", principalPrefix: string, keyPrefix: string): void {
  ensure(role.role === expectedRole && role.publicPrincipal.identity.role === expectedRole, `${expectedRole} role differs`);
  ensure(role.publicPrincipal.identity.principalId.startsWith(principalPrefix), `${expectedRole} principal namespace differs`);
  ensure(role.publicPrincipal.keyId.startsWith(keyPrefix), `${expectedRole} key namespace differs`);
  ensure(role.publicPrincipal.identity.instanceId.startsWith(principalPrefix), `${expectedRole} instance namespace differs`);
  const publicKey = createPublicKey(role.publicPrincipal.publicKeyPem);
  const der = publicKey.export({ type: "spki", format: "der" });
  ensure(role.publicPrincipal.identity.identityDigest === `sha256:${sha256Bytes(der)}`, `${expectedRole} key digest differs`);
  ensure(role.currentCapabilityHandles.length === 0 && role.delegatedCapabilityIds.length === 0 && role.roleAliases.length === 0 && role.keyRotationLineage.length === 0, `${expectedRole} has current, delegated, aliased, or rotated authority`);
  ensure(role.writableMount.mounted === false, `${expectedRole} mount is active`);
}

function verifyContractIdentity(record: CalibrationContract): void {
  verifyEmbeddedSignature(record as unknown as SignedRecord, "recordedBy", "protocol_author", "contract");
  const core = withoutKeys(record as unknown as SignedRecord, ["contractHash", "publicPrincipal", "attestation"]);
  ensure(record.contractHash === sha256(core), "contract hash differs");
  const identity = withoutKeys(record as unknown as SignedRecord, ["schemaVersion", "calibrationContractId", "recordType", "recordedBy", "contractHash", "publicPrincipal", "attestation"]) as Record<string, JsonValue>;
  const expectedId = `cc-sha256:${sha256Bytes(canonicalBytes({ hashDomain: "CalibrationContract.v1", ...identity }))}`;
  ensure(record.calibrationContractId === expectedId, "contract ID differs");
}

function expectedRules(): readonly Record<string, unknown>[] {
  return EXPECTED_RULES.map(([ruleId, targets, dataRole, samplingUnit, candidateBound, selectionRule, precisionRule, failureDisposition]) => ({ ruleId, targets, dataRole, samplingUnit, candidateBound, selectionRule, precisionRule, failureDisposition }));
}

export async function verifyCalibrationContractAgainstArtifacts(input: {
  readonly record: CalibrationContract;
  readonly schemas: SchemaRegistry;
  readonly reader: CalibrationContractArtifactReader;
}): Promise<CalibrationContractVerificationResult> {
  input.schemas.validate(SCHEMA_ID, input.record as unknown as JsonValue);
  verifyContractIdentity(input.record);
  ensure(input.record.zeroExecution === true && input.record.status === "preregistered_only" && input.record.evidencePresent === false && input.record.authorizedForResearchEvidence === false, "contract is not zero-execution preregistration");
  ensure(input.record.sourceSnapshot.additionalPushPerformed === false, "contract claims a push");
  const sourceTree = await input.reader.treeOf(input.record.sourceSnapshot.sourceCommit);
  ensure(sourceTree === input.record.sourceSnapshot.sourceTree, "source tree differs");

  const artifacts = artifactMap(input.record);
  ensure(artifacts.size === EXPECTED_ARTIFACTS.length, "artifact count differs");
  const bytesById = new Map<string, Buffer>();
  for (const [artifactId, artifactPath, mediaType] of EXPECTED_ARTIFACTS) {
    const artifact = artifacts.get(artifactId);
    ensure(artifact !== undefined, `missing artifact ${artifactId}`);
    ensure(artifact.path === artifactPath && artifact.mediaType === mediaType && artifact.sourceCommit === input.record.sourceSnapshot.sourceCommit, `artifact ${artifactId} identity differs`);
    const bytes = await input.reader.read(artifact.sourceCommit, artifact.path);
    ensure(artifact.sizeBytes === bytes.byteLength && artifact.sha256 === `sha256:${sha256Bytes(bytes)}`, `artifact ${artifactId} bytes differ`);
    bytesById.set(artifactId, bytes);
  }

  const bindingToArtifact = [
    [input.record.priorBindings.numericFreezeEntryRawSha256, "numeric_freeze_entry"],
    [input.record.priorBindings.entryEvidencePacketSha256, "entry_evidence_packet"],
    [input.record.priorBindings.entryEvidenceRulingSha256, "entry_evidence_ruling"],
    [input.record.priorBindings.derivationPacketSha256, "derivation_preregistration_packet"],
    [input.record.priorBindings.derivationRulingSha256, "derivation_preregistration_ruling"],
    [input.record.priorBindings.separationPacketSha256, "authority_separation_packet"],
    [input.record.priorBindings.separationRulingSha256, "authority_separation_ruling"],
  ] as const;
  for (const [binding, artifactId] of bindingToArtifact) {
    ensure(binding === `sha256:${sha256Bytes(bytesById.get(artifactId)!)}`, `${artifactId} prior binding differs`);
  }
  ensure(input.record.priorBindings.numericFreezeEntryId === "nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f" && input.record.priorBindings.derivationDecision === "REVISE" && input.record.priorBindings.separationDecision === "APPROVE", "prior decision identity differs");

  const numericEntry = asObject(parseStrictJson(bytesById.get("numeric_freeze_entry")!.toString("utf8")), "numeric entry");
  ensure(numericEntry["entryId"] === input.record.priorBindings.numericFreezeEntryId, "numeric entry ID binding differs");
  ensure(sameJson(input.record.pendingInventory.groups, EXPECTED_GROUPS), "pending groups differ");
  const expectedSentinels = EXPECTED_SENTINELS.map(([sentinelPath, sentinel, effectiveExpansionCount]) => ({ path: sentinelPath, sentinel, effectiveExpansionCount }));
  ensure(sameJson(input.record.pendingInventory.sentinels, expectedSentinels), "sentinels differ");
  ensure(sameJson(numericEntry["pilotPendingFields"], EXPECTED_GROUPS) && sameJson(numericEntry["unresolvedSentinels"], expectedSentinels), "contract inventory differs from approved entry");
  ensure(sameJson(input.record.pendingInventory.phaseIds, EXPECTED_PHASES), "phase IDs differ");

  const obligations = asObject(parseStrictJson(bytesById.get("outstanding_obligations")!.toString("utf8")), "obligations");
  ensure(Array.isArray(obligations["obligations"]), "obligation list is absent");
  const obligationIds: string[] = [];
  for (const item of obligations["obligations"]) {
    const obligation = asObject(item, "obligation");
    ensure(obligation["status"] === "unresolved" && obligation["evidencePresent"] === false && typeof obligation["obligationId"] === "string", "obligation resolved or evidentiary");
    obligationIds.push(obligation["obligationId"]);
  }
  sameStrings(obligationIds, EXPECTED_OBLIGATIONS, "obligations");

  sameStrings(input.record.derivationContract.classes, EXPECTED_CLASSES, "derivation classes");
  ensure(sameJson(input.record.derivationContract.assignments, EXPECTED_ASSIGNMENTS.map(([pathOrGroup, derivationClass]) => ({ pathOrGroup, derivationClass }))), "derivation assignments differ");
  ensure(sameJson(input.record.derivationContract.numericGraph, EXPECTED_NUMERIC_GRAPH), "numeric graph differs");
  ensure(sameJson(input.record.derivationContract.rules, expectedRules()), "derivation rules differ");
  ensure(sameJson(input.record.derivationContract.atomicFreeze, EXPECTED_ATOMIC_FREEZE), "atomic-freeze contract differs");
  sameStrings(input.record.derivationContract.failureConditions, EXPECTED_FAILURES, "failure conditions");

  const evaluator = input.record.authoritySeparation.evaluator;
  const scorer = input.record.authoritySeparation.scorer;
  verifyPublicRole(evaluator, "calibration_evaluator", "principal.calibration.evaluator.", "key.calibration.evaluator.");
  verifyPublicRole(scorer, "calibration_scorer", "principal.calibration.scorer.", "key.calibration.scorer.");
  const inequalities = [
    [evaluator.publicPrincipal.identity.principalId, scorer.publicPrincipal.identity.principalId, "principalId"],
    [evaluator.publicPrincipal.identity.instanceId, scorer.publicPrincipal.identity.instanceId, "instanceId"],
    [evaluator.publicPrincipal.keyId, scorer.publicPrincipal.keyId, "keyId"],
    [evaluator.publicPrincipal.identity.identityDigest, scorer.publicPrincipal.identity.identityDigest, "publicKeyDigest"],
    [evaluator.processIdentity, scorer.processIdentity, "processIdentity"],
    [evaluator.writableMount.writableMountRoot, scorer.writableMount.writableMountRoot, "writableMountRoot"],
    [evaluator.writableMount.canonicalSourceId, scorer.writableMount.canonicalSourceId, "canonicalSourceId"],
    [evaluator.writableMount.backingObjectId, scorer.writableMount.backingObjectId, "backingObjectId"],
  ] as const;
  for (const [left, right, label] of inequalities) ensure(left !== right, `${label} is collapsed`);
  ensure(evaluator.processIdentity === "future.process.calibration.evaluator.v1" && scorer.processIdentity === "future.process.calibration.scorer.v1", "process identities differ");
  ensure(evaluator.writableMount.writableMountRoot === "future-mount://calibration/evaluator" && scorer.writableMount.writableMountRoot === "future-mount://calibration/scorer", "writable mount roots differ");
  sameStrings(evaluator.readableDataClasses, EXPECTED_EVALUATOR_READABLE, "evaluator readable data");
  sameStrings(evaluator.writableDataClasses, EXPECTED_EVALUATOR_WRITABLE, "evaluator writable data");
  sameStrings(evaluator.forbiddenDataClasses, EXPECTED_EVALUATOR_FORBIDDEN, "evaluator forbidden data");
  sameStrings(scorer.readableDataClasses, EXPECTED_SCORER_READABLE, "scorer readable data");
  sameStrings(scorer.writableDataClasses, EXPECTED_SCORER_WRITABLE, "scorer writable data");
  sameStrings(scorer.forbiddenDataClasses, EXPECTED_SCORER_FORBIDDEN, "scorer forbidden data");
  ensure(input.record.authoritySeparation.canonicalMountSourcesMustDiffer && input.record.authoritySeparation.backingObjectsMustDiffer && input.record.authoritySeparation.delegationForbidden && input.record.authoritySeparation.aliasingForbidden && input.record.authoritySeparation.proxyWrappingCosigningInheritanceTemporaryReuseForbidden, "authority-separation flags differ");

  ensure(sameJson(input.record.capabilityMatrix, EXPECTED_CAPABILITIES.map(([capabilityId, role, purpose]) => ({ capabilityId, role, purpose, granted: false, delegable: false, currentHandle: null }))), "capability matrix differs or grants authority");
  ensure(sameJson(input.record.mountMatrix, [
    {
      role: "calibration_evaluator",
      mountKind: "reserved_future_writable",
      ...evaluator.writableMount,
      currentWriteCapability: null,
    },
    {
      role: "calibration_scorer",
      mountKind: "reserved_future_writable",
      ...scorer.writableMount,
      currentWriteCapability: null,
    },
  ]), "mount matrix differs from separated role mounts");
  ensure(sameJson(input.record.dataAccessMatrix, EXPECTED_DATA_ACCESS.map(([role, allowedFutureDataClasses, forbiddenDataClasses]) => ({
    role,
    allowedFutureDataClasses,
    forbiddenDataClasses,
    currentAccessGranted: false,
  }))), "data-access matrix differs or grants protected access");
  ensure(sameJson(input.record.messageFlows, EXPECTED_MESSAGES.map(([from, to, acceptedRecordTypes]) => ({ from, to, acceptedRecordTypes }))), "message flows differ");
  ensure(sameJson(input.record.recordCreationMatrix, EXPECTED_RECORD_CREATORS.map(([recordType, soleCreator]) => ({ recordType, soleCreator, proxyWrapAliasDelegateCosignReuseForbidden: true }))), "record ownership differs");
  ensure(sameJson(input.record.evidenceGraph, EXPECTED_EVIDENCE_GRAPH), "evidence graph differs");

  sameStrings(Object.keys(input.record.zeroBudget), EXPECTED_ZERO_KEYS, "zero-budget keys");
  ensure(Object.values(input.record.zeroBudget).every((value) => value === 0), "nonzero budget exists");
  sameStrings(Object.keys(input.record.authorityState), EXPECTED_AUTHORITY_KEYS, "authority keys");
  ensure(Object.values(input.record.authorityState).every((value) => value === false), "authority is granted");
  ensure(input.record.eligibilityState.publicDevelopment === true, "contract is not public-development only");
  for (const key of EXPECTED_ELIGIBILITY_FALSE_KEYS) ensure(input.record.eligibilityState[key] === false, `eligibility ${key} is true`);
  ensure(Object.values(input.record.futureIdentityState).every((value) => value === null), "future identity allocated");
  ensure(input.record.claimBoundary.contractPreregistered === true && Object.entries(input.record.claimBoundary).filter(([key]) => key !== "contractPreregistered").every(([, value]) => value === false), "claim boundary escalated");

  const preregPacket = bytesById.get("derivation_preregistration_packet")!.toString("utf8");
  const preregRuling = bytesById.get("derivation_preregistration_ruling")!.toString("utf8");
  const separationPacket = bytesById.get("authority_separation_packet")!.toString("utf8");
  const separationRuling = bytesById.get("authority_separation_ruling")!.toString("utf8");
  ensure(preregPacket.includes("Twenty-five sentinel paths") && preregRuling.startsWith("DECISION: REVISE\n") && separationPacket.includes("calibration_evaluator") && separationPacket.includes("calibration_scorer") && separationRuling.startsWith("DECISION: APPROVE\n") && separationRuling.includes("AUTHORIZED_NEXT_SCOPE:"), "Architect governance chain differs");

  return {
    verified: true,
    calibrationContractId: input.record.calibrationContractId,
    contractHash: input.record.contractHash,
    sourceCommit: input.record.sourceSnapshot.sourceCommit,
    sourceTree: input.record.sourceSnapshot.sourceTree,
    artifactCount: 22,
    pendingSentinelCount: 25,
    pendingGroupCount: 8,
    phaseCount: 12,
    derivationClassCount: 6,
    evidenceNodeCount: 11,
    unresolvedObligationCount: 7,
    providerModelRequestAttempts: 0,
    calibrationExecutions: 0,
    authoritiesGranted: 0,
    authorizedForResearchEvidence: false,
    finalProtocolId: null,
    budgetFreezeId: null,
  };
}

function verifyReceiptIdentity(receipt: CalibrationContractAuditReceipt): void {
  verifyEmbeddedSignature(receipt as unknown as SignedRecord, "producer", "audit_store", "audit receipt");
  const core = withoutKeys(receipt as unknown as SignedRecord, ["receiptHash", "publicPrincipal", "attestation"]);
  ensure(receipt.receiptHash === sha256(core), "audit receipt hash differs");
  const identity = withoutKeys(receipt as unknown as SignedRecord, ["schemaVersion", "receiptId", "recordType", "producer", "receiptHash", "publicPrincipal", "attestation"]) as Record<string, JsonValue>;
  const expectedId = `ccar-sha256:${sha256Bytes(canonicalBytes({ hashDomain: "CalibrationContractAuditReceipt.v1", ...identity }))}`;
  ensure(receipt.receiptId === expectedId, "audit receipt ID differs");
}

export function verifyCalibrationContractAuditReceiptIndependent(input: {
  readonly receipt: CalibrationContractAuditReceipt;
  readonly contract: CalibrationContract;
  readonly contractBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(SCHEMA_ID, input.receipt as unknown as JsonValue);
  verifyReceiptIdentity(input.receipt);
  ensure(input.receipt.contractReference.calibrationContractId === input.contract.calibrationContractId && input.receipt.contractReference.contractHash === input.contract.contractHash && input.receipt.contractReference.path === CONTRACT_PATH && input.receipt.contractReference.sourceCommit === input.contract.sourceSnapshot.sourceCommit && input.receipt.contractReference.sourceTree === input.contract.sourceSnapshot.sourceTree && input.receipt.contractReference.sha256 === `sha256:${sha256Bytes(input.contractBytes)}` && input.receipt.contractReference.sizeBytes === input.contractBytes.byteLength, "audit receipt contract reference differs");
  ensure(input.receipt.verifierArtifactId === "calibration_contract_verifier", "audit receipt verifier differs");
  ensure(Object.entries(input.receipt.verification).every(([key, value]) => key === "authoritiesGranted" ? value === 0 : value === true), "audit receipt reports failure or authority");
}

export async function verifyCalibrationContractFiles(input: {
  readonly repositoryRoot: string;
  readonly contractPath?: string;
  readonly receiptPath?: string;
}): Promise<CalibrationContractVerificationResult & { readonly auditReceiptId: string; readonly auditReceiptHash: string }> {
  const contractPath = input.contractPath ?? CONTRACT_PATH;
  const receiptPath = input.receiptPath ?? RECEIPT_PATH;
  ensureSafePath(contractPath);
  ensureSafePath(receiptPath);
  const [contractBytes, receiptBytes, schemas] = await Promise.all([
    readFile(path.join(input.repositoryRoot, contractPath)),
    readFile(path.join(input.repositoryRoot, receiptPath)),
    SchemaRegistry.load(path.join(input.repositoryRoot, "schemas")),
  ]);
  const contract = parseStrictJson(contractBytes.toString("utf8")) as unknown as CalibrationContract;
  const receipt = parseStrictJson(receiptBytes.toString("utf8")) as unknown as CalibrationContractAuditReceipt;
  const result = await verifyCalibrationContractAgainstArtifacts({
    record: contract,
    schemas,
    reader: new GitCalibrationContractArtifactReader(input.repositoryRoot),
  });
  verifyCalibrationContractAuditReceiptIndependent({ receipt, contract, contractBytes, schemas });
  return { ...result, auditReceiptId: receipt.receiptId, auditReceiptHash: receipt.receiptHash };
}
