import {
  canonicalBytes,
  sha256,
  sha256Bytes,
  sha256Text,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";

export const CALIBRATION_DERIVATION_TARGETS = ["F", "G", "J", "K", "L", "M"] as const;
export type CalibrationDerivationTarget =
  (typeof CALIBRATION_DERIVATION_TARGETS)[number];

export const CALIBRATION_CAP_CANDIDATE_MAX = 8;
export const CALIBRATION_MARGIN_CANDIDATE_MAX = 8;
export const CALIBRATION_ROLLOUT_COUNT_CANDIDATES = [2, 3, 5, 8] as const;
export const CALIBRATION_ONE_SIDED_CONFIDENCE_BASIS_POINTS = 9_500;
export const CALIBRATION_WILSON_Z_MICROS = 1_644_854;
export const CALIBRATION_FAILURE_BOUND_PROBABILITY_MICROS = 10_000;
export const CALIBRATION_MCSE_MAX_BASIS_POINTS = 100;
export const CALIBRATION_SEED_VARIANCE_MAX_BASIS_POINTS = 2_000;
export const CALIBRATION_POWER_MIN_BASIS_POINTS = 8_000;
export const CALIBRATION_RETENTION_MIN_BASIS_POINTS = 8_000;
export const CALIBRATION_SEED_STREAM_DOMAIN =
  "seh.calibration.synthetic.seed-stream.v1";
export const CALIBRATION_SEED_STREAM_ORDERING =
  "counter_ascending_zero_based";
export const CALIBRATION_PHASE_RESOURCE_IDS = [
  "providerRequestAttempts",
  "inputTokens",
  "outputTokens",
  "toolAttempts",
  "wallClockMilliseconds",
  "cpuMilliseconds",
  "memoryMiB",
  "outputBytes",
] as const;

export const CALIBRATION_SYNTHETIC_RESULT_MARKING = {
  publicDevelopment: true,
  authorizedForResearchEvidence: false,
  admissibleAsNumericFreezeValue: false,
  confirmatory: false,
} as const;

export const CALIBRATION_DERIVATION_PROGRAM_SPECIFICATIONS = [
  {
    target: "F",
    programName: "per_request_rollout_token_cap",
    estimatorIdentity:
      "wilson_one_sided_upper_bound.v1.z_1644854_micros.ceil_probability_micros",
    candidateBound: CALIBRATION_CAP_CANDIDATE_MAX,
    confidenceBasisPoints: CALIBRATION_ONE_SIDED_CONFIDENCE_BASIS_POINTS,
    failureBoundProbabilityMicros: CALIBRATION_FAILURE_BOUND_PROBABILITY_MICROS,
    selectionRule: "smallest_feasible_cap_wins",
    tieRule: "duplicate_cap_values_forbidden",
    roundingRule: "bound_ceil_to_probability_micros",
  },
  {
    target: "G",
    programName: "empirical_phase_resource_caps",
    estimatorIdentity:
      "wilson_one_sided_upper_bound.v1.z_1644854_micros.ceil_probability_micros",
    candidateBound: CALIBRATION_CAP_CANDIDATE_MAX,
    confidenceBasisPoints: CALIBRATION_ONE_SIDED_CONFIDENCE_BASIS_POINTS,
    failureBoundProbabilityMicros: CALIBRATION_FAILURE_BOUND_PROBABILITY_MICROS,
    selectionRule: "smallest_feasible_raw_cap_wins",
    tieRule: "raw_cap_then_candidate_id_ascending",
    roundingRule: "selected_resource_cap_ceil_to_declared_quantum",
  },
  {
    target: "J",
    programName: "synthetic_provider_cost_cap_arithmetic",
    estimatorIdentity: "integer_rational_cost_arithmetic.v1",
    candidateBound: 1,
    confidenceBasisPoints: null,
    failureBoundProbabilityMicros: null,
    selectionRule: "derive_only_from_selected_synthetic_G_caps",
    tieRule: "not_applicable",
    roundingRule: "each_token_price_component_ceil_to_integer_micro",
  },
  {
    target: "K",
    programName: "final_rollout_count_selection",
    estimatorIdentity: "precomputed_nested_seed_precision_metrics.v1",
    candidateBound: CALIBRATION_ROLLOUT_COUNT_CANDIDATES.length,
    confidenceBasisPoints: null,
    failureBoundProbabilityMicros: null,
    selectionRule: "smallest_feasible_of_2_3_5_8_wins",
    tieRule: "fixed_rollout_count_order_2_3_5_8",
    roundingRule: "integer_basis_points_no_rounding",
  },
  {
    target: "L",
    programName: "deterministic_seed_stream_expansion",
    estimatorIdentity: "sha256_domain_separated_counter_stream.v1",
    candidateBound: CALIBRATION_ROLLOUT_COUNT_CANDIDATES.length,
    confidenceBasisPoints: null,
    failureBoundProbabilityMicros: null,
    selectionRule: "expand_exactly_selected_rollout_count",
    tieRule: "counter_ascending_zero_based",
    roundingRule: "not_applicable",
  },
  {
    target: "M",
    programName: "statistical_margin_selection",
    estimatorIdentity: "precomputed_power_and_retention_metrics.v1",
    candidateBound: CALIBRATION_MARGIN_CANDIDATE_MAX,
    confidenceBasisPoints: null,
    failureBoundProbabilityMicros: null,
    selectionRule: "strictest_feasible_smallest_allowed_loss_wins",
    tieRule: "duplicate_allowed_loss_values_forbidden",
    roundingRule: "integer_basis_points_no_rounding",
  },
] as const;

export interface SyntheticPublicDevelopmentHeader {
  readonly tableId: string;
  readonly inputClass: "synthetic_public_development_table";
  readonly publicDevelopment: true;
  readonly authorizedForResearchEvidence: false;
  readonly admissibleAsNumericFreezeValue: false;
  readonly confirmatory: false;
  readonly protectedDataAncestry: false;
  readonly providerSmokeAncestry: false;
  readonly publicFixtureAncestry: false;
  readonly benchmarkAncestry: false;
  readonly realProviderPriceAncestry: false;
  readonly providerOrModelIdentityPresent: false;
  readonly protectedDataCapabilityPresent: false;
  readonly authoredSyntheticAncestry: "manually_authored_synthetic_values";
}

export interface SyntheticStratumObservation {
  readonly stratumId: string;
  readonly observations: number;
  readonly adverseEvents: number;
  readonly missingUsageCount: number;
  readonly missingUsageChargedAtReservationCount: number;
  readonly infrastructureIncidentCount: number;
}

export interface SyntheticCapCandidate {
  readonly candidateId: string;
  readonly cap: number;
  readonly strata: readonly SyntheticStratumObservation[];
}

export interface SyntheticCapGridInput {
  readonly header: SyntheticPublicDevelopmentHeader;
  readonly target: "F";
  readonly gridFrozenBeforeSyntheticResults: true;
  readonly requiredStrata: readonly string[];
  readonly candidates: readonly SyntheticCapCandidate[];
  readonly gridCommitment: string;
}

export interface SyntheticPhaseResourceGrid {
  readonly phaseId: string;
  readonly resourceId: (typeof CALIBRATION_PHASE_RESOURCE_IDS)[number];
  readonly roundingQuantum: number;
  readonly requiredStrata: readonly string[];
  readonly candidates: readonly SyntheticCapCandidate[];
  readonly gridCommitment: string;
}

export interface SyntheticPhaseResourceInput {
  readonly header: SyntheticPublicDevelopmentHeader;
  readonly target: "G";
  readonly gridFrozenBeforeSyntheticResults: true;
  readonly resources: readonly SyntheticPhaseResourceGrid[];
}

export type SyntheticWithdrawalReason =
  | "missing_required_stratum"
  | "missing_usage_undercharged"
  | "infrastructure_incident_present"
  | "post_result_grid_modification"
  | "no_feasible_candidate"
  | "upstream_G_not_selected"
  | "missing_phase_resource_cap"
  | "invalid_synthetic_price_schedule"
  | "missing_precision_observation";

interface SyntheticDerivationResultBase {
  readonly syntheticResultId: string;
  readonly target: CalibrationDerivationTarget;
  readonly status:
    | "selected_synthetic_only"
    | "withdrawn_synthetic_only"
    | "precision_limited_synthetic_only";
  readonly inputHash: string;
  readonly publicDevelopment: true;
  readonly authorizedForResearchEvidence: false;
  readonly admissibleAsNumericFreezeValue: false;
  readonly confirmatory: false;
}

export interface SyntheticCapCandidateEvaluation {
  readonly candidateId: string;
  readonly cap: number;
  readonly feasible: boolean;
  readonly stratumUpperBounds: readonly {
    readonly stratumId: string;
    readonly upperBoundProbabilityMicros: number;
  }[];
}

export interface SyntheticCapSelectionOutcome {
  readonly selectedCandidateId: string | null;
  readonly selectedCapTokens: number | null;
  readonly withdrawalReason: SyntheticWithdrawalReason | null;
  readonly evaluations: readonly SyntheticCapCandidateEvaluation[];
}

export interface SyntheticCapSelectionResult
  extends SyntheticDerivationResultBase {
  readonly target: "F";
  readonly outcome: SyntheticCapSelectionOutcome;
}

export interface SyntheticPhaseResourceSelection {
  readonly phaseId: string;
  readonly resourceId: SyntheticPhaseResourceGrid["resourceId"];
  readonly selectedCandidateId: string;
  readonly selectedRawCap: number;
  readonly selectedRoundedCap: number;
  readonly roundingQuantum: number;
}

export interface SyntheticPhaseResourceOutcome {
  readonly selections: readonly SyntheticPhaseResourceSelection[];
  readonly withdrawalReason: SyntheticWithdrawalReason | null;
}

export interface SyntheticPhaseResourceResult
  extends SyntheticDerivationResultBase {
  readonly target: "G";
  readonly outcome: SyntheticPhaseResourceOutcome;
}

export interface SyntheticPriceSchedule {
  readonly scheduleId: string;
  readonly syntheticPriceSchedule: true;
  readonly providerIdentity: null;
  readonly modelIdentity: null;
  readonly realPriceSource: null;
  readonly requestMicros: number;
  readonly inputTokenMicrosPerMillion: number;
  readonly outputTokenMicrosPerMillion: number;
}

export interface SyntheticCostInput {
  readonly header: SyntheticPublicDevelopmentHeader;
  readonly target: "J";
  readonly requiredPhaseIds: readonly string[];
  readonly gResult: SyntheticPhaseResourceResult;
  readonly priceSchedule: SyntheticPriceSchedule;
}

export interface SyntheticCostOutcome {
  readonly phaseCosts: readonly {
    readonly phaseId: string;
    readonly requestCostMicros: number;
    readonly inputTokenCostMicros: number;
    readonly outputTokenCostMicros: number;
    readonly phaseCostMicros: number;
  }[];
  readonly selectedSyntheticProviderCostMicros: number | null;
  readonly withdrawalReason: SyntheticWithdrawalReason | null;
}

export interface SyntheticCostResult extends SyntheticDerivationResultBase {
  readonly target: "J";
  readonly outcome: SyntheticCostOutcome;
}

export interface SyntheticRolloutCountCandidate {
  readonly rolloutCount: 2 | 3 | 5 | 8;
  readonly taskCount: number;
  readonly mcseBasisPoints: number;
  readonly seedVarianceShareBasisPoints: number;
  readonly missingObservationCount: number;
  readonly infrastructureIncidentCount: number;
}

export interface SyntheticRolloutCountInput {
  readonly header: SyntheticPublicDevelopmentHeader;
  readonly target: "K";
  readonly gridFrozenBeforeSyntheticResults: true;
  readonly candidates: readonly SyntheticRolloutCountCandidate[];
  readonly gridCommitment: string;
}

export interface SyntheticRolloutCountOutcome {
  readonly selectedRolloutCount: 2 | 3 | 5 | 8 | null;
  readonly precisionLimited: boolean;
  readonly withdrawalReason: SyntheticWithdrawalReason | null;
}

export interface SyntheticRolloutCountResult
  extends SyntheticDerivationResultBase {
  readonly target: "K";
  readonly outcome: SyntheticRolloutCountOutcome;
}

export interface SyntheticSeedStreamInput {
  readonly header: SyntheticPublicDevelopmentHeader;
  readonly target: "L";
  readonly rootSeedHex: string;
  readonly rolloutCount: 2 | 3 | 5 | 8;
  readonly domain: typeof CALIBRATION_SEED_STREAM_DOMAIN;
  readonly ordering: typeof CALIBRATION_SEED_STREAM_ORDERING;
}

export interface SyntheticSeedStreamOutcome {
  readonly domain: typeof CALIBRATION_SEED_STREAM_DOMAIN;
  readonly ordering: typeof CALIBRATION_SEED_STREAM_ORDERING;
  readonly seeds: readonly {
    readonly ordinal: number;
    readonly seedHex: string;
  }[];
}

export interface SyntheticSeedStreamResult
  extends SyntheticDerivationResultBase {
  readonly target: "L";
  readonly outcome: SyntheticSeedStreamOutcome;
}

export interface SyntheticMarginCandidate {
  readonly candidateId: string;
  readonly allowedLossBasisPoints: number;
  readonly powerBasisPoints: number;
  readonly retentionBasisPoints: number;
  readonly missingObservationCount: number;
  readonly infrastructureIncidentCount: number;
}

export interface SyntheticMarginInput {
  readonly header: SyntheticPublicDevelopmentHeader;
  readonly target: "M";
  readonly gridFrozenBeforeSyntheticResults: true;
  readonly predeclaredMaximumLossBasisPoints: number;
  readonly oneTaskResolutionBasisPoints: number;
  readonly candidates: readonly SyntheticMarginCandidate[];
  readonly gridCommitment: string;
}

export interface SyntheticMarginOutcome {
  readonly selectedCandidateId: string | null;
  readonly selectedAllowedLossBasisPoints: number | null;
  readonly safetyMarginBasisPoints: 0;
  readonly withdrawalReason: SyntheticWithdrawalReason | null;
}

export interface SyntheticMarginResult extends SyntheticDerivationResultBase {
  readonly target: "M";
  readonly outcome: SyntheticMarginOutcome;
}

export type SyntheticCalibrationDerivationResult =
  | SyntheticCapSelectionResult
  | SyntheticPhaseResourceResult
  | SyntheticCostResult
  | SyntheticRolloutCountResult
  | SyntheticSeedStreamResult
  | SyntheticMarginResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  assertCondition(isRecord(value), "SCHEMA_INVALID", `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assertCondition(
    actual.length === wanted.length &&
      actual.every((key, index) => key === wanted[index]),
    "SCHEMA_INVALID",
    `${label} contains missing, extra, or implicit-default fields`,
  );
}

function assertEntityId(value: string, label: string): void {
  assertCondition(
    /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,159}$/u.test(value),
    "SCHEMA_INVALID",
    `${label} is not a closed entity identifier`,
  );
}

function assertSafeInteger(
  value: number,
  label: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): void {
  assertCondition(
    Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    "SCHEMA_INVALID",
    `${label} is outside the permitted integer range`,
  );
}

function assertSortedUniqueStrings(values: readonly string[], label: string): void {
  assertCondition(values.length > 0 && values.length <= 64, "SCHEMA_INVALID", `${label} has invalid cardinality`);
  values.forEach((value, index) => {
    assertEntityId(value, `${label}[${index}]`);
    if (index > 0) {
      assertCondition(values[index - 1]! < value, "SCHEMA_INVALID", `${label} must be strictly sorted and unique`);
    }
  });
}

function assertSyntheticHeader(header: SyntheticPublicDevelopmentHeader): void {
  assertExactKeys(header, [
    "tableId",
    "inputClass",
    "publicDevelopment",
    "authorizedForResearchEvidence",
    "admissibleAsNumericFreezeValue",
    "confirmatory",
    "protectedDataAncestry",
    "providerSmokeAncestry",
    "publicFixtureAncestry",
    "benchmarkAncestry",
    "realProviderPriceAncestry",
    "providerOrModelIdentityPresent",
    "protectedDataCapabilityPresent",
    "authoredSyntheticAncestry",
  ], "synthetic table header");
  assertEntityId(header.tableId, "synthetic table id");
  assertCondition(
    header.inputClass === "synthetic_public_development_table" &&
      header.publicDevelopment === true &&
      header.authorizedForResearchEvidence === false &&
      header.admissibleAsNumericFreezeValue === false &&
      header.confirmatory === false &&
      header.protectedDataAncestry === false &&
      header.providerSmokeAncestry === false &&
      header.publicFixtureAncestry === false &&
      header.benchmarkAncestry === false &&
      header.realProviderPriceAncestry === false &&
      header.providerOrModelIdentityPresent === false &&
      header.protectedDataCapabilityPresent === false &&
      header.authoredSyntheticAncestry === "manually_authored_synthetic_values",
    "AUTHORIZATION_DENIED",
    "Only manually authored public-development synthetic tables are accepted",
  );
}

function assertObservation(observation: SyntheticStratumObservation): void {
  assertExactKeys(observation, [
    "stratumId",
    "observations",
    "adverseEvents",
    "missingUsageCount",
    "missingUsageChargedAtReservationCount",
    "infrastructureIncidentCount",
  ], "stratum observation");
  assertEntityId(observation.stratumId, "stratum id");
  assertSafeInteger(observation.observations, "observations", 1, 1_000_000_000);
  assertSafeInteger(observation.adverseEvents, "adverse events", 0, observation.observations);
  assertSafeInteger(observation.missingUsageCount, "missing usage", 0, observation.observations);
  assertSafeInteger(
    observation.missingUsageChargedAtReservationCount,
    "charged missing usage",
    0,
    observation.missingUsageCount,
  );
  assertSafeInteger(
    observation.infrastructureIncidentCount,
    "infrastructure incidents",
    0,
    observation.observations,
  );
}

function assertCapCandidates(candidates: readonly SyntheticCapCandidate[]): void {
  assertCondition(
    candidates.length > 0 && candidates.length <= CALIBRATION_CAP_CANDIDATE_MAX,
    "SCHEMA_INVALID",
    "Cap grid must contain between one and eight explicit candidates",
  );
  candidates.forEach((candidate, index) => {
    assertExactKeys(candidate, ["candidateId", "cap", "strata"], "cap candidate");
    assertEntityId(candidate.candidateId, "cap candidate id");
    assertSafeInteger(candidate.cap, "cap", 1);
    assertCondition(candidate.strata.length > 0 && candidate.strata.length <= 64, "SCHEMA_INVALID", "Candidate strata cardinality is invalid");
    candidate.strata.forEach(assertObservation);
    const stratumIds = candidate.strata.map((entry) => entry.stratumId);
    assertSortedUniqueStrings(stratumIds, "candidate strata");
    if (index > 0) {
      assertCondition(candidates[index - 1]!.cap < candidate.cap, "SCHEMA_INVALID", "Cap candidates must be strictly increasing without ties");
    }
  });
  assertCondition(
    new Set(candidates.map((candidate) => candidate.candidateId)).size === candidates.length,
    "SCHEMA_INVALID",
    "Cap candidate identifiers must be unique",
  );
}

function statusResult<T extends CalibrationDerivationTarget, O>(input: {
  readonly target: T;
  readonly status: SyntheticDerivationResultBase["status"];
  readonly sourceInput: unknown;
  readonly outcome: O;
}): SyntheticDerivationResultBase & { readonly target: T; readonly outcome: O } {
  const core = {
    target: input.target,
    status: input.status,
    inputHash: sha256(input.sourceInput),
    ...CALIBRATION_SYNTHETIC_RESULT_MARKING,
    outcome: input.outcome,
  } as const;
  return {
    syntheticResultId: `sdr-sha256:${sha256Bytes(canonicalBytes(core))}`,
    ...core,
  };
}

function capGridIdentity(input: {
  readonly target: "F" | "G";
  readonly phaseId?: string;
  readonly resourceId?: string;
  readonly roundingQuantum?: number;
  readonly requiredStrata: readonly string[];
  readonly candidates: readonly SyntheticCapCandidate[];
}): JsonValue {
  return {
    hashDomain: "SyntheticCalibrationCapGrid.v1",
    target: input.target,
    phaseId: input.phaseId ?? null,
    resourceId: input.resourceId ?? null,
    roundingQuantum: input.roundingQuantum ?? null,
    requiredStrata: [...input.requiredStrata],
    candidates: input.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      cap: candidate.cap,
      strata: candidate.strata.map((entry) => ({ ...entry })),
    })),
  } as unknown as JsonValue;
}

export function syntheticCapGridCommitment(input: {
  readonly target: "F" | "G";
  readonly phaseId?: string;
  readonly resourceId?: string;
  readonly roundingQuantum?: number;
  readonly requiredStrata: readonly string[];
  readonly candidates: readonly SyntheticCapCandidate[];
}): string {
  return `grid-sha256:${sha256(capGridIdentity(input)).slice("sha256:".length)}`;
}

export function syntheticRolloutGridCommitment(
  candidates: readonly SyntheticRolloutCountCandidate[],
): string {
  return `grid-sha256:${sha256({
    hashDomain: "SyntheticCalibrationRolloutGrid.v1",
    candidates: candidates.map((candidate) => ({ ...candidate })),
  }).slice("sha256:".length)}`;
}

export function syntheticMarginGridCommitment(input: {
  readonly predeclaredMaximumLossBasisPoints: number;
  readonly oneTaskResolutionBasisPoints: number;
  readonly candidates: readonly SyntheticMarginCandidate[];
}): string {
  return `grid-sha256:${sha256({
    hashDomain: "SyntheticCalibrationMarginGrid.v1",
    predeclaredMaximumLossBasisPoints: input.predeclaredMaximumLossBasisPoints,
    oneTaskResolutionBasisPoints: input.oneTaskResolutionBasisPoints,
    candidates: input.candidates.map((candidate) => ({ ...candidate })),
  }).slice("sha256:".length)}`;
}

export function wilsonOneSidedUpperBoundProbabilityMicros(input: {
  readonly adverseEvents: number;
  readonly observations: number;
}): number {
  assertSafeInteger(input.observations, "Wilson observations", 1, 1_000_000_000);
  assertSafeInteger(input.adverseEvents, "Wilson adverse events", 0, input.observations);
  const z = CALIBRATION_WILSON_Z_MICROS / 1_000_000;
  const zSquared = z * z;
  const p = input.adverseEvents / input.observations;
  const numerator =
    p +
    zSquared / (2 * input.observations) +
    z * Math.sqrt(
      (p * (1 - p)) / input.observations +
        zSquared / (4 * input.observations * input.observations),
    );
  const denominator = 1 + zSquared / input.observations;
  return Math.min(1_000_000, Math.ceil((numerator / denominator) * 1_000_000));
}

function observationDisposition(
  requiredStrata: readonly string[],
  candidates: readonly SyntheticCapCandidate[],
): SyntheticWithdrawalReason | null {
  for (const candidate of candidates) {
    const observed = candidate.strata.map((entry) => entry.stratumId);
    if (
      observed.length !== requiredStrata.length ||
      observed.some((value, index) => value !== requiredStrata[index])
    ) {
      return "missing_required_stratum";
    }
    for (const stratum of candidate.strata) {
      if (stratum.infrastructureIncidentCount !== 0) {
        return "infrastructure_incident_present";
      }
      if (
        stratum.missingUsageCount !==
        stratum.missingUsageChargedAtReservationCount
      ) {
        return "missing_usage_undercharged";
      }
    }
  }
  return null;
}

function evaluateCapCandidates(
  candidates: readonly SyntheticCapCandidate[],
): readonly SyntheticCapCandidateEvaluation[] {
  return candidates.map((candidate) => {
    const bounds = candidate.strata.map((stratum) => ({
      stratumId: stratum.stratumId,
      upperBoundProbabilityMicros: wilsonOneSidedUpperBoundProbabilityMicros({
        adverseEvents: stratum.adverseEvents,
        observations: stratum.observations,
      }),
    }));
    return {
      candidateId: candidate.candidateId,
      cap: candidate.cap,
      feasible: bounds.every(
        (bound) =>
          bound.upperBoundProbabilityMicros <=
          CALIBRATION_FAILURE_BOUND_PROBABILITY_MICROS,
      ),
      stratumUpperBounds: bounds,
    };
  });
}

export function selectSyntheticPerRequestTokenCap(
  input: SyntheticCapGridInput,
): SyntheticCapSelectionResult {
  assertExactKeys(input, ["header", "target", "gridFrozenBeforeSyntheticResults", "requiredStrata", "candidates", "gridCommitment"], "F input");
  assertSyntheticHeader(input.header);
  assertCondition(input.target === "F", "PROTOCOL_MISMATCH", "Token-cap program target must be F");
  assertCondition(input.gridFrozenBeforeSyntheticResults === true, "PROTOCOL_MISMATCH", "F grid must be frozen before synthetic results");
  assertSortedUniqueStrings(input.requiredStrata, "F required strata");
  assertCapCandidates(input.candidates);
  const expectedCommitment = syntheticCapGridCommitment({
    target: "F",
    requiredStrata: input.requiredStrata,
    candidates: input.candidates,
  });
  if (input.gridCommitment !== expectedCommitment) {
    return statusResult({
      target: "F",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: {
        selectedCandidateId: null,
        selectedCapTokens: null,
        withdrawalReason: "post_result_grid_modification",
        evaluations: [],
      },
    }) as SyntheticCapSelectionResult;
  }
  const disposition = observationDisposition(input.requiredStrata, input.candidates);
  if (disposition !== null) {
    return statusResult({
      target: "F",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: {
        selectedCandidateId: null,
        selectedCapTokens: null,
        withdrawalReason: disposition,
        evaluations: [],
      },
    }) as SyntheticCapSelectionResult;
  }
  const evaluations = evaluateCapCandidates(input.candidates);
  const selected = evaluations.find((candidate) => candidate.feasible);
  return statusResult({
    target: "F",
    status: selected === undefined ? "withdrawn_synthetic_only" : "selected_synthetic_only",
    sourceInput: input as unknown as JsonValue,
    outcome: {
      selectedCandidateId: selected?.candidateId ?? null,
      selectedCapTokens: selected?.cap ?? null,
      withdrawalReason: selected === undefined ? "no_feasible_candidate" : null,
      evaluations,
    },
  }) as SyntheticCapSelectionResult;
}

function roundUpToQuantum(value: number, quantum: number): number {
  assertSafeInteger(value, "resource cap", 1);
  assertSafeInteger(quantum, "resource rounding quantum", 1);
  const rounded = Math.ceil(value / quantum) * quantum;
  assertSafeInteger(rounded, "rounded resource cap", value);
  return rounded;
}

export function selectSyntheticPhaseResourceCaps(
  input: SyntheticPhaseResourceInput,
): SyntheticPhaseResourceResult {
  assertExactKeys(input, ["header", "target", "gridFrozenBeforeSyntheticResults", "resources"], "G input");
  assertSyntheticHeader(input.header);
  assertCondition(input.target === "G", "PROTOCOL_MISMATCH", "Resource-cap program target must be G");
  assertCondition(input.gridFrozenBeforeSyntheticResults === true, "PROTOCOL_MISMATCH", "G grids must be frozen before synthetic results");
  assertCondition(input.resources.length > 0 && input.resources.length <= 64, "SCHEMA_INVALID", "G resource grid cardinality is invalid");
  const resourceKeys = input.resources.map((resource) => `${resource.phaseId}/${resource.resourceId}`);
  assertCondition(new Set(resourceKeys).size === resourceKeys.length, "SCHEMA_INVALID", "G resource grids must be unique");
  assertCondition(resourceKeys.every((key, index) => index === 0 || resourceKeys[index - 1]! < key), "SCHEMA_INVALID", "G resource grids must be sorted");

  const selections: SyntheticPhaseResourceSelection[] = [];
  for (const resource of input.resources) {
    assertExactKeys(resource, ["phaseId", "resourceId", "roundingQuantum", "requiredStrata", "candidates", "gridCommitment"], "G resource grid");
    assertEntityId(resource.phaseId, "G phase id");
    assertEntityId(resource.resourceId, "G resource id");
    assertCondition(
      (CALIBRATION_PHASE_RESOURCE_IDS as readonly string[]).includes(
        resource.resourceId,
      ),
      "SCHEMA_INVALID",
      "G resource id is outside the closed phase-resource vocabulary",
    );
    assertSafeInteger(resource.roundingQuantum, "G rounding quantum", 1);
    assertSortedUniqueStrings(resource.requiredStrata, "G required strata");
    assertCapCandidates(resource.candidates);
    const expectedCommitment = syntheticCapGridCommitment({
      target: "G",
      phaseId: resource.phaseId,
      resourceId: resource.resourceId,
      roundingQuantum: resource.roundingQuantum,
      requiredStrata: resource.requiredStrata,
      candidates: resource.candidates,
    });
    if (resource.gridCommitment !== expectedCommitment) {
      return statusResult({
        target: "G",
        status: "withdrawn_synthetic_only",
        sourceInput: input as unknown as JsonValue,
        outcome: { selections: [], withdrawalReason: "post_result_grid_modification" },
      }) as SyntheticPhaseResourceResult;
    }
    const disposition = observationDisposition(resource.requiredStrata, resource.candidates);
    if (disposition !== null) {
      return statusResult({
        target: "G",
        status: "withdrawn_synthetic_only",
        sourceInput: input as unknown as JsonValue,
        outcome: { selections: [], withdrawalReason: disposition },
      }) as SyntheticPhaseResourceResult;
    }
    const selected = evaluateCapCandidates(resource.candidates).find((candidate) => candidate.feasible);
    if (selected === undefined) {
      return statusResult({
        target: "G",
        status: "withdrawn_synthetic_only",
        sourceInput: input as unknown as JsonValue,
        outcome: { selections: [], withdrawalReason: "no_feasible_candidate" },
      }) as SyntheticPhaseResourceResult;
    }
    selections.push({
      phaseId: resource.phaseId,
      resourceId: resource.resourceId,
      selectedCandidateId: selected.candidateId,
      selectedRawCap: selected.cap,
      selectedRoundedCap: roundUpToQuantum(selected.cap, resource.roundingQuantum),
      roundingQuantum: resource.roundingQuantum,
    });
  }
  return statusResult({
    target: "G",
    status: "selected_synthetic_only",
    sourceInput: input as unknown as JsonValue,
    outcome: { selections, withdrawalReason: null },
  }) as SyntheticPhaseResourceResult;
}

function ceilDivBigInt(numerator: bigint, denominator: bigint): bigint {
  assertCondition(numerator >= 0n && denominator > 0n, "SCHEMA_INVALID", "Cost arithmetic operands are invalid");
  return (numerator + denominator - 1n) / denominator;
}

function safeBigIntNumber(value: bigint, label: string): number {
  assertCondition(
    value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER),
    "SCHEMA_INVALID",
    `${label} exceeds the nonnegative I-JSON integer range`,
  );
  return Number(value);
}

function assertSyntheticPhaseResourceResult(
  result: SyntheticPhaseResourceResult,
): void {
  assertExactKeys(result, [
    "syntheticResultId",
    "target",
    "status",
    "inputHash",
    "publicDevelopment",
    "authorizedForResearchEvidence",
    "admissibleAsNumericFreezeValue",
    "confirmatory",
    "outcome",
  ], "synthetic G result");
  assertCondition(/^sdr-sha256:[a-f0-9]{64}$/u.test(result.syntheticResultId), "SCHEMA_INVALID", "Synthetic G result ID is invalid");
  assertCondition(/^sha256:[a-f0-9]{64}$/u.test(result.inputHash), "SCHEMA_INVALID", "Synthetic G input hash is invalid");
  const { syntheticResultId, ...core } = result;
  assertCondition(
    syntheticResultId ===
      `sdr-sha256:${sha256Bytes(canonicalBytes(core))}`,
    "HASH_MISMATCH",
    "Synthetic G result content identity differs",
  );
  assertExactKeys(result.outcome, ["selections", "withdrawalReason"], "synthetic G outcome");
  const keys: string[] = [];
  for (const selection of result.outcome.selections) {
    assertExactKeys(selection, [
      "phaseId",
      "resourceId",
      "selectedCandidateId",
      "selectedRawCap",
      "selectedRoundedCap",
      "roundingQuantum",
    ], "synthetic G selection");
    assertEntityId(selection.phaseId, "synthetic G phase id");
    assertEntityId(selection.resourceId, "synthetic G resource id");
    assertEntityId(selection.selectedCandidateId, "synthetic G candidate id");
    assertCondition(
      (CALIBRATION_PHASE_RESOURCE_IDS as readonly string[]).includes(
        selection.resourceId,
      ),
      "SCHEMA_INVALID",
      "Synthetic G selection uses an unknown resource",
    );
    assertSafeInteger(selection.selectedRawCap, "synthetic G raw cap", 1);
    assertSafeInteger(selection.selectedRoundedCap, "synthetic G rounded cap", 1);
    assertSafeInteger(selection.roundingQuantum, "synthetic G rounding quantum", 1);
    assertCondition(
      selection.selectedRoundedCap >= selection.selectedRawCap &&
        selection.selectedRoundedCap % selection.roundingQuantum === 0 &&
        selection.selectedRoundedCap - selection.selectedRawCap <
          selection.roundingQuantum,
      "PROTOCOL_MISMATCH",
      "Synthetic G selection does not use upward quantum rounding",
    );
    keys.push(`${selection.phaseId}/${selection.resourceId}`);
  }
  assertCondition(
    new Set(keys).size === keys.length &&
      keys.every((key, index) => index === 0 || keys[index - 1]! < key),
    "SCHEMA_INVALID",
    "Synthetic G selections must be sorted and unique",
  );
}

export function deriveSyntheticProviderCostCap(
  input: SyntheticCostInput,
): SyntheticCostResult {
  assertExactKeys(input, ["header", "target", "requiredPhaseIds", "gResult", "priceSchedule"], "J input");
  assertSyntheticHeader(input.header);
  assertCondition(input.target === "J", "PROTOCOL_MISMATCH", "Cost program target must be J");
  assertSortedUniqueStrings(input.requiredPhaseIds, "J required phase ids");
  const schedule = input.priceSchedule;
  assertExactKeys(schedule, ["scheduleId", "syntheticPriceSchedule", "providerIdentity", "modelIdentity", "realPriceSource", "requestMicros", "inputTokenMicrosPerMillion", "outputTokenMicrosPerMillion"], "synthetic price schedule");
  assertEntityId(schedule.scheduleId, "synthetic price schedule id");
  const priceValid =
    schedule.syntheticPriceSchedule === true &&
    schedule.providerIdentity === null &&
    schedule.modelIdentity === null &&
    schedule.realPriceSource === null;
  for (const [label, value] of [
    ["request micros", schedule.requestMicros],
    ["input-token micros", schedule.inputTokenMicrosPerMillion],
    ["output-token micros", schedule.outputTokenMicrosPerMillion],
  ] as const) {
    assertSafeInteger(value, label, 0);
  }
  if (!priceValid) {
    return statusResult({
      target: "J",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: { phaseCosts: [], selectedSyntheticProviderCostMicros: null, withdrawalReason: "invalid_synthetic_price_schedule" },
    }) as SyntheticCostResult;
  }
  assertSyntheticPhaseResourceResult(input.gResult);
  if (
    input.gResult.target !== "G" ||
    input.gResult.status !== "selected_synthetic_only" ||
    input.gResult.publicDevelopment !== true ||
    input.gResult.authorizedForResearchEvidence !== false ||
    input.gResult.admissibleAsNumericFreezeValue !== false ||
    input.gResult.confirmatory !== false
  ) {
    return statusResult({
      target: "J",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: { phaseCosts: [], selectedSyntheticProviderCostMicros: null, withdrawalReason: "upstream_G_not_selected" },
    }) as SyntheticCostResult;
  }

  const phaseCosts: SyntheticCostOutcome["phaseCosts"][number][] = [];
  for (const phaseId of input.requiredPhaseIds) {
    const selection = (resourceId: SyntheticPhaseResourceGrid["resourceId"]): SyntheticPhaseResourceSelection | undefined =>
      input.gResult.outcome.selections.find((entry) => entry.phaseId === phaseId && entry.resourceId === resourceId);
    const request = selection("providerRequestAttempts");
    const inputTokens = selection("inputTokens");
    const outputTokens = selection("outputTokens");
    if (request === undefined || inputTokens === undefined || outputTokens === undefined) {
      return statusResult({
        target: "J",
        status: "withdrawn_synthetic_only",
        sourceInput: input as unknown as JsonValue,
        outcome: { phaseCosts: [], selectedSyntheticProviderCostMicros: null, withdrawalReason: "missing_phase_resource_cap" },
      }) as SyntheticCostResult;
    }
    const requestCost = BigInt(request.selectedRoundedCap) * BigInt(schedule.requestMicros);
    const inputCost = ceilDivBigInt(
      BigInt(inputTokens.selectedRoundedCap) * BigInt(schedule.inputTokenMicrosPerMillion),
      1_000_000n,
    );
    const outputCost = ceilDivBigInt(
      BigInt(outputTokens.selectedRoundedCap) * BigInt(schedule.outputTokenMicrosPerMillion),
      1_000_000n,
    );
    const phaseCost = requestCost + inputCost + outputCost;
    phaseCosts.push({
      phaseId,
      requestCostMicros: safeBigIntNumber(requestCost, "request cost"),
      inputTokenCostMicros: safeBigIntNumber(inputCost, "input-token cost"),
      outputTokenCostMicros: safeBigIntNumber(outputCost, "output-token cost"),
      phaseCostMicros: safeBigIntNumber(phaseCost, "phase cost"),
    });
  }
  const total = phaseCosts.reduce((sum, phase) => sum + BigInt(phase.phaseCostMicros), 0n);
  return statusResult({
    target: "J",
    status: "selected_synthetic_only",
    sourceInput: input as unknown as JsonValue,
    outcome: {
      phaseCosts,
      selectedSyntheticProviderCostMicros: safeBigIntNumber(total, "provider cost cap"),
      withdrawalReason: null,
    },
  }) as SyntheticCostResult;
}

function assertRolloutCandidates(candidates: readonly SyntheticRolloutCountCandidate[]): void {
  assertCondition(candidates.length === CALIBRATION_ROLLOUT_COUNT_CANDIDATES.length, "SCHEMA_INVALID", "K requires the exact 2,3,5,8 candidate set");
  candidates.forEach((candidate, index) => {
    assertExactKeys(candidate, ["rolloutCount", "taskCount", "mcseBasisPoints", "seedVarianceShareBasisPoints", "missingObservationCount", "infrastructureIncidentCount"], "K candidate");
    assertCondition(candidate.rolloutCount === CALIBRATION_ROLLOUT_COUNT_CANDIDATES[index], "SCHEMA_INVALID", "K candidates must be exactly ordered 2,3,5,8");
    assertSafeInteger(candidate.taskCount, "K task count", 1, 1_000_000);
    assertSafeInteger(candidate.mcseBasisPoints, "K MCSE", 0, 10_000);
    assertSafeInteger(candidate.seedVarianceShareBasisPoints, "K seed variance share", 0, 10_000);
    assertSafeInteger(candidate.missingObservationCount, "K missing observations", 0, candidate.taskCount);
    assertSafeInteger(candidate.infrastructureIncidentCount, "K incidents", 0, candidate.taskCount);
  });
}

export function selectSyntheticFinalRolloutCount(
  input: SyntheticRolloutCountInput,
): SyntheticRolloutCountResult {
  assertExactKeys(input, ["header", "target", "gridFrozenBeforeSyntheticResults", "candidates", "gridCommitment"], "K input");
  assertSyntheticHeader(input.header);
  assertCondition(input.target === "K", "PROTOCOL_MISMATCH", "Rollout-count program target must be K");
  assertCondition(input.gridFrozenBeforeSyntheticResults === true, "PROTOCOL_MISMATCH", "K grid must be frozen before synthetic results");
  assertRolloutCandidates(input.candidates);
  if (input.gridCommitment !== syntheticRolloutGridCommitment(input.candidates)) {
    return statusResult({
      target: "K",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: { selectedRolloutCount: null, precisionLimited: false, withdrawalReason: "post_result_grid_modification" },
    }) as SyntheticRolloutCountResult;
  }
  if (input.candidates.some((candidate) => candidate.infrastructureIncidentCount !== 0)) {
    return statusResult({
      target: "K",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: { selectedRolloutCount: null, precisionLimited: false, withdrawalReason: "infrastructure_incident_present" },
    }) as SyntheticRolloutCountResult;
  }
  if (input.candidates.some((candidate) => candidate.missingObservationCount !== 0)) {
    return statusResult({
      target: "K",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: { selectedRolloutCount: null, precisionLimited: false, withdrawalReason: "missing_precision_observation" },
    }) as SyntheticRolloutCountResult;
  }
  const selected = input.candidates.find(
    (candidate) =>
      candidate.mcseBasisPoints <= CALIBRATION_MCSE_MAX_BASIS_POINTS &&
      candidate.seedVarianceShareBasisPoints <=
        CALIBRATION_SEED_VARIANCE_MAX_BASIS_POINTS,
  );
  if (selected === undefined) {
    return statusResult({
      target: "K",
      status: "precision_limited_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: { selectedRolloutCount: 8, precisionLimited: true, withdrawalReason: null },
    }) as SyntheticRolloutCountResult;
  }
  return statusResult({
    target: "K",
    status: "selected_synthetic_only",
    sourceInput: input as unknown as JsonValue,
    outcome: { selectedRolloutCount: selected.rolloutCount, precisionLimited: false, withdrawalReason: null },
  }) as SyntheticRolloutCountResult;
}

export function expandSyntheticSeedStream(
  input: SyntheticSeedStreamInput,
): SyntheticSeedStreamResult {
  assertExactKeys(input, ["header", "target", "rootSeedHex", "rolloutCount", "domain", "ordering"], "L input");
  assertSyntheticHeader(input.header);
  assertCondition(input.target === "L", "PROTOCOL_MISMATCH", "Seed-stream program target must be L");
  assertCondition(/^[a-f0-9]{64}$/u.test(input.rootSeedHex), "SCHEMA_INVALID", "Synthetic root seed must be 32 lowercase-hex bytes");
  assertCondition(CALIBRATION_ROLLOUT_COUNT_CANDIDATES.includes(input.rolloutCount), "SCHEMA_INVALID", "Synthetic rollout count is outside 2,3,5,8");
  assertCondition(input.domain === CALIBRATION_SEED_STREAM_DOMAIN, "PROTOCOL_MISMATCH", "Seed-stream domain drifted");
  assertCondition(input.ordering === CALIBRATION_SEED_STREAM_ORDERING, "PROTOCOL_MISMATCH", "Seed-stream ordering drifted");
  const seeds = Array.from({ length: input.rolloutCount }, (_, ordinal) => ({
    ordinal,
    seedHex: sha256Text(`${CALIBRATION_SEED_STREAM_DOMAIN}\0${input.rootSeedHex}\0${ordinal}`).slice("sha256:".length),
  }));
  assertCondition(new Set(seeds.map((entry) => entry.seedHex)).size === seeds.length, "VERIFICATION_FAILED", "Synthetic seed stream collided");
  return statusResult({
    target: "L",
    status: "selected_synthetic_only",
    sourceInput: input as unknown as JsonValue,
    outcome: {
      domain: CALIBRATION_SEED_STREAM_DOMAIN,
      ordering: CALIBRATION_SEED_STREAM_ORDERING,
      seeds,
    },
  }) as SyntheticSeedStreamResult;
}

function assertMarginCandidates(candidates: readonly SyntheticMarginCandidate[]): void {
  assertCondition(candidates.length > 0 && candidates.length <= CALIBRATION_MARGIN_CANDIDATE_MAX, "SCHEMA_INVALID", "M must contain between one and eight explicit candidates");
  candidates.forEach((candidate, index) => {
    assertExactKeys(candidate, ["candidateId", "allowedLossBasisPoints", "powerBasisPoints", "retentionBasisPoints", "missingObservationCount", "infrastructureIncidentCount"], "M candidate");
    assertEntityId(candidate.candidateId, "M candidate id");
    assertSafeInteger(candidate.allowedLossBasisPoints, "M allowed loss", 0, 10_000);
    assertSafeInteger(candidate.powerBasisPoints, "M power", 0, 10_000);
    assertSafeInteger(candidate.retentionBasisPoints, "M retention", 0, 10_000);
    assertSafeInteger(candidate.missingObservationCount, "M missing observations", 0, 1_000_000);
    assertSafeInteger(candidate.infrastructureIncidentCount, "M incidents", 0, 1_000_000);
    if (index > 0) {
      assertCondition(candidates[index - 1]!.allowedLossBasisPoints < candidate.allowedLossBasisPoints, "SCHEMA_INVALID", "M candidates must be strictly ordered from strictest to loosest");
    }
  });
  assertCondition(new Set(candidates.map((candidate) => candidate.candidateId)).size === candidates.length, "SCHEMA_INVALID", "M candidate identifiers must be unique");
}

export function selectSyntheticStatisticalMargin(
  input: SyntheticMarginInput,
): SyntheticMarginResult {
  assertExactKeys(input, ["header", "target", "gridFrozenBeforeSyntheticResults", "predeclaredMaximumLossBasisPoints", "oneTaskResolutionBasisPoints", "candidates", "gridCommitment"], "M input");
  assertSyntheticHeader(input.header);
  assertCondition(input.target === "M", "PROTOCOL_MISMATCH", "Margin program target must be M");
  assertCondition(input.gridFrozenBeforeSyntheticResults === true, "PROTOCOL_MISMATCH", "M grid must be frozen before synthetic results");
  assertSafeInteger(input.predeclaredMaximumLossBasisPoints, "M maximum loss", 0, 10_000);
  assertSafeInteger(input.oneTaskResolutionBasisPoints, "M one-task resolution", 1, 10_000);
  assertMarginCandidates(input.candidates);
  if (input.gridCommitment !== syntheticMarginGridCommitment(input)) {
    return statusResult({
      target: "M",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: { selectedCandidateId: null, selectedAllowedLossBasisPoints: null, safetyMarginBasisPoints: 0, withdrawalReason: "post_result_grid_modification" },
    }) as SyntheticMarginResult;
  }
  if (input.candidates.some((candidate) => candidate.infrastructureIncidentCount !== 0)) {
    return statusResult({
      target: "M",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: { selectedCandidateId: null, selectedAllowedLossBasisPoints: null, safetyMarginBasisPoints: 0, withdrawalReason: "infrastructure_incident_present" },
    }) as SyntheticMarginResult;
  }
  if (input.candidates.some((candidate) => candidate.missingObservationCount !== 0)) {
    return statusResult({
      target: "M",
      status: "withdrawn_synthetic_only",
      sourceInput: input as unknown as JsonValue,
      outcome: { selectedCandidateId: null, selectedAllowedLossBasisPoints: null, safetyMarginBasisPoints: 0, withdrawalReason: "missing_precision_observation" },
    }) as SyntheticMarginResult;
  }
  const maximumAllowedLoss = Math.min(
    input.predeclaredMaximumLossBasisPoints,
    input.oneTaskResolutionBasisPoints,
  );
  const selected = input.candidates.find(
    (candidate) =>
      candidate.allowedLossBasisPoints <= maximumAllowedLoss &&
      candidate.powerBasisPoints >= CALIBRATION_POWER_MIN_BASIS_POINTS &&
      candidate.retentionBasisPoints >= CALIBRATION_RETENTION_MIN_BASIS_POINTS,
  );
  return statusResult({
    target: "M",
    status: selected === undefined ? "withdrawn_synthetic_only" : "selected_synthetic_only",
    sourceInput: input as unknown as JsonValue,
    outcome: {
      selectedCandidateId: selected?.candidateId ?? null,
      selectedAllowedLossBasisPoints: selected?.allowedLossBasisPoints ?? null,
      safetyMarginBasisPoints: 0,
      withdrawalReason: selected === undefined ? "no_feasible_candidate" : null,
    },
  }) as SyntheticMarginResult;
}
