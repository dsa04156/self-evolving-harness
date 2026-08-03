import type { JsonValue } from "../core/canonical.js";
import {
  CALIBRATION_SEED_STREAM_DOMAIN,
  CALIBRATION_SEED_STREAM_ORDERING,
  CALIBRATION_SYNTHETIC_RESULT_MARKING,
  deriveSyntheticProviderCostCap,
  expandSyntheticSeedStream,
  selectSyntheticFinalRolloutCount,
  selectSyntheticPerRequestTokenCap,
  selectSyntheticPhaseResourceCaps,
  selectSyntheticStatisticalMargin,
  syntheticCapGridCommitment,
  syntheticMarginGridCommitment,
  syntheticRolloutGridCommitment,
  type CalibrationDerivationTarget,
  type SyntheticCalibrationDerivationResult,
  type SyntheticCapCandidate,
  type SyntheticCapGridInput,
  type SyntheticMarginCandidate,
  type SyntheticMarginInput,
  type SyntheticPhaseResourceGrid,
  type SyntheticPhaseResourceInput,
  type SyntheticPublicDevelopmentHeader,
  type SyntheticRolloutCountCandidate,
  type SyntheticRolloutCountInput,
  type SyntheticSeedStreamInput,
  type SyntheticStratumObservation,
} from "./calibration-derivation-programs.js";

export interface CalibrationDerivationSyntheticVector {
  readonly caseId: string;
  readonly target: CalibrationDerivationTarget;
  readonly purpose: string;
  readonly publicDevelopment: true;
  readonly authorizedForResearchEvidence: false;
  readonly admissibleAsNumericFreezeValue: false;
  readonly confirmatory: false;
  readonly input: JsonValue;
  readonly result: SyntheticCalibrationDerivationResult;
}

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function mutableCopy<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

function header(tableId: string): SyntheticPublicDevelopmentHeader {
  return {
    tableId,
    inputClass: "synthetic_public_development_table",
    ...CALIBRATION_SYNTHETIC_RESULT_MARKING,
    protectedDataAncestry: false,
    providerSmokeAncestry: false,
    publicFixtureAncestry: false,
    benchmarkAncestry: false,
    realProviderPriceAncestry: false,
    providerOrModelIdentityPresent: false,
    protectedDataCapabilityPresent: false,
    authoredSyntheticAncestry: "manually_authored_synthetic_values",
  };
}

function observation(input: {
  readonly stratumId: string;
  readonly adverseEvents?: number;
  readonly missingUsageCount?: number;
  readonly missingUsageChargedAtReservationCount?: number;
  readonly infrastructureIncidentCount?: number;
}): SyntheticStratumObservation {
  return {
    stratumId: input.stratumId,
    observations: 400,
    adverseEvents: input.adverseEvents ?? 0,
    missingUsageCount: input.missingUsageCount ?? 0,
    missingUsageChargedAtReservationCount:
      input.missingUsageChargedAtReservationCount ??
      input.missingUsageCount ??
      0,
    infrastructureIncidentCount: input.infrastructureIncidentCount ?? 0,
  };
}

function candidates(
  prefix: string,
  lowCap: number,
  highCap: number,
): readonly SyntheticCapCandidate[] {
  return [
    {
      candidateId: `${prefix}.low`,
      cap: lowCap,
      strata: [
        observation({ stratumId: "arm.B0", adverseEvents: 1 }),
        observation({ stratumId: "arm.B6", adverseEvents: 1 }),
      ],
    },
    {
      candidateId: `${prefix}.high`,
      cap: highCap,
      strata: [
        observation({ stratumId: "arm.B0" }),
        observation({ stratumId: "arm.B6" }),
      ],
    },
  ];
}

function fInput(): SyntheticCapGridInput {
  const capCandidates = candidates("F.cap", 1_000, 2_000);
  const requiredStrata = ["arm.B0", "arm.B6"];
  return {
    header: header("synthetic.F.selected.v1"),
    target: "F",
    gridFrozenBeforeSyntheticResults: true,
    requiredStrata,
    candidates: capCandidates,
    gridCommitment: syntheticCapGridCommitment({
      target: "F",
      requiredStrata,
      candidates: capCandidates,
    }),
  };
}

function gResource(
  resourceId: SyntheticPhaseResourceGrid["resourceId"],
  lowCap: number,
  highCap: number,
  roundingQuantum: number,
): SyntheticPhaseResourceGrid {
  const capCandidates = candidates(`G.${resourceId}`, lowCap, highCap);
  const requiredStrata = ["arm.B0", "arm.B6"];
  const phaseId = "mine_trace_generation";
  return {
    phaseId,
    resourceId,
    roundingQuantum,
    requiredStrata,
    candidates: capCandidates,
    gridCommitment: syntheticCapGridCommitment({
      target: "G",
      phaseId,
      resourceId,
      roundingQuantum,
      requiredStrata,
      candidates: capCandidates,
    }),
  };
}

function gInput(): SyntheticPhaseResourceInput {
  return {
    header: header("synthetic.G.selected.v1"),
    target: "G",
    gridFrozenBeforeSyntheticResults: true,
    resources: [
      gResource("inputTokens", 950, 1_051, 100),
      gResource("outputTokens", 450, 501, 100),
      gResource("providerRequestAttempts", 2, 3, 1),
    ],
  };
}

function kCandidates(
  values: readonly (readonly [2 | 3 | 5 | 8, number, number])[],
): readonly SyntheticRolloutCountCandidate[] {
  return values.map(([rolloutCount, mcseBasisPoints, seedVarianceShareBasisPoints]) => ({
    rolloutCount,
    taskCount: 40,
    mcseBasisPoints,
    seedVarianceShareBasisPoints,
    missingObservationCount: 0,
    infrastructureIncidentCount: 0,
  }));
}

function kInput(precisionLimited = false): SyntheticRolloutCountInput {
  const rolloutCandidates = precisionLimited
    ? kCandidates([[2, 180, 2_700], [3, 150, 2_500], [5, 125, 2_300], [8, 110, 2_100]])
    : kCandidates([[2, 120, 1_900], [3, 90, 2_100], [5, 80, 1_800], [8, 70, 1_500]]);
  return {
    header: header(precisionLimited ? "synthetic.K.precision-limited.v1" : "synthetic.K.selected.v1"),
    target: "K",
    gridFrozenBeforeSyntheticResults: true,
    candidates: rolloutCandidates,
    gridCommitment: syntheticRolloutGridCommitment(rolloutCandidates),
  };
}

function mInput(feasible = true): SyntheticMarginInput {
  const marginCandidates: readonly SyntheticMarginCandidate[] = feasible
    ? [
        { candidateId: "M.loss.0", allowedLossBasisPoints: 0, powerBasisPoints: 7_500, retentionBasisPoints: 9_000, missingObservationCount: 0, infrastructureIncidentCount: 0 },
        { candidateId: "M.loss.50", allowedLossBasisPoints: 50, powerBasisPoints: 8_200, retentionBasisPoints: 8_100, missingObservationCount: 0, infrastructureIncidentCount: 0 },
        { candidateId: "M.loss.100", allowedLossBasisPoints: 100, powerBasisPoints: 9_000, retentionBasisPoints: 9_000, missingObservationCount: 0, infrastructureIncidentCount: 0 },
      ]
    : [
        { candidateId: "M.loss.0", allowedLossBasisPoints: 0, powerBasisPoints: 7_000, retentionBasisPoints: 7_000, missingObservationCount: 0, infrastructureIncidentCount: 0 },
        { candidateId: "M.loss.50", allowedLossBasisPoints: 50, powerBasisPoints: 7_500, retentionBasisPoints: 7_500, missingObservationCount: 0, infrastructureIncidentCount: 0 },
      ];
  const base = {
    predeclaredMaximumLossBasisPoints: 100,
    oneTaskResolutionBasisPoints: 100,
    candidates: marginCandidates,
  };
  return {
    header: header(feasible ? "synthetic.M.selected.v1" : "synthetic.M.withdrawn.v1"),
    target: "M",
    gridFrozenBeforeSyntheticResults: true,
    ...base,
    gridCommitment: syntheticMarginGridCommitment(base),
  };
}

function vector(input: {
  readonly caseId: string;
  readonly target: CalibrationDerivationTarget;
  readonly purpose: string;
  readonly sourceInput: JsonValue;
  readonly result: SyntheticCalibrationDerivationResult;
}): CalibrationDerivationSyntheticVector {
  return {
    caseId: input.caseId,
    target: input.target,
    purpose: input.purpose,
    ...CALIBRATION_SYNTHETIC_RESULT_MARKING,
    input: input.sourceInput,
    result: input.result,
  };
}

export function buildCalibrationDerivationSyntheticVectors(): readonly CalibrationDerivationSyntheticVector[] {
  const selectedFInput = fInput();
  const selectedF = selectSyntheticPerRequestTokenCap(selectedFInput);

  const missingUsageInput = mutableCopy(fInput());
  missingUsageInput.header.tableId = "synthetic.F.missing-usage.v1";
  const missingUsageCandidate = missingUsageInput.candidates[0]!;
  const missingUsageStratum = missingUsageCandidate.strata[0]!;
  missingUsageStratum.missingUsageCount = 1;
  missingUsageStratum.missingUsageChargedAtReservationCount = 0;
  missingUsageInput.gridCommitment = syntheticCapGridCommitment({
    target: "F",
    requiredStrata: missingUsageInput.requiredStrata,
    candidates: missingUsageInput.candidates,
  });
  const missingUsage = selectSyntheticPerRequestTokenCap(missingUsageInput);

  const incidentInput = mutableCopy(fInput());
  incidentInput.header.tableId = "synthetic.F.incident.v1";
  incidentInput.candidates[0]!.strata[0]!.infrastructureIncidentCount = 1;
  incidentInput.gridCommitment = syntheticCapGridCommitment({
    target: "F",
    requiredStrata: incidentInput.requiredStrata,
    candidates: incidentInput.candidates,
  });
  const incident = selectSyntheticPerRequestTokenCap(incidentInput);

  const modifiedGridInput = mutableCopy(fInput());
  modifiedGridInput.header.tableId = "synthetic.F.post-result-modification.v1";
  modifiedGridInput.candidates[1]!.cap += 1;
  const modifiedGrid = selectSyntheticPerRequestTokenCap(modifiedGridInput);

  const selectedGInput = gInput();
  const selectedG = selectSyntheticPhaseResourceCaps(selectedGInput);
  const selectedJInput = {
    header: header("synthetic.J.selected.v1"),
    target: "J" as const,
    requiredPhaseIds: ["mine_trace_generation"],
    gResult: selectedG,
    priceSchedule: {
      scheduleId: "synthetic.price.schedule.v1",
      syntheticPriceSchedule: true as const,
      providerIdentity: null,
      modelIdentity: null,
      realPriceSource: null,
      requestMicros: 3,
      inputTokenMicrosPerMillion: 1_100_000,
      outputTokenMicrosPerMillion: 2_200_000,
    },
  };
  const selectedJ = deriveSyntheticProviderCostCap(selectedJInput);

  const selectedKInput = kInput();
  const selectedK = selectSyntheticFinalRolloutCount(selectedKInput);
  const precisionLimitedKInput = kInput(true);
  const precisionLimitedK = selectSyntheticFinalRolloutCount(precisionLimitedKInput);
  const selectedLInput: SyntheticSeedStreamInput = {
    header: header("synthetic.L.selected.v1"),
    target: "L" as const,
    rootSeedHex: `${"0".repeat(63)}1`,
    rolloutCount: 5 as const,
    domain: CALIBRATION_SEED_STREAM_DOMAIN,
    ordering: CALIBRATION_SEED_STREAM_ORDERING,
  };
  const selectedL = expandSyntheticSeedStream(selectedLInput);
  const selectedMInput = mInput();
  const selectedM = selectSyntheticStatisticalMargin(selectedMInput);
  const withdrawnMInput = mInput(false);
  const withdrawnM = selectSyntheticStatisticalMargin(withdrawnMInput);

  return [
    vector({ caseId: "F.smallest-feasible", target: "F", purpose: "smaller_infeasible_larger_feasible", sourceInput: selectedFInput as unknown as JsonValue, result: selectedF }),
    vector({ caseId: "F.missing-usage-withdrawal", target: "F", purpose: "missing_usage_is_not_undercharged", sourceInput: missingUsageInput as unknown as JsonValue, result: missingUsage }),
    vector({ caseId: "F.incident-withdrawal", target: "F", purpose: "incident_is_not_excluded", sourceInput: incidentInput as unknown as JsonValue, result: incident }),
    vector({ caseId: "F.post-result-grid-withdrawal", target: "F", purpose: "grid_commitment_detects_modification", sourceInput: modifiedGridInput as unknown as JsonValue, result: modifiedGrid }),
    vector({ caseId: "G.upward-resource-rounding", target: "G", purpose: "smallest_feasible_then_upward_quantum", sourceInput: selectedGInput as unknown as JsonValue, result: selectedG }),
    vector({ caseId: "J.upward-integer-micro-cost", target: "J", purpose: "componentwise_upward_integer_micro_rounding", sourceInput: selectedJInput as unknown as JsonValue, result: selectedJ }),
    vector({ caseId: "K.smallest-feasible", target: "K", purpose: "fixed_2_3_5_8_order", sourceInput: selectedKInput as unknown as JsonValue, result: selectedK }),
    vector({ caseId: "K.precision-limited", target: "K", purpose: "no_feasible_count_marks_precision_limited_8", sourceInput: precisionLimitedKInput as unknown as JsonValue, result: precisionLimitedK }),
    vector({ caseId: "L.domain-separated-order", target: "L", purpose: "sha256_counter_stream_is_ordered", sourceInput: selectedLInput as unknown as JsonValue, result: selectedL }),
    vector({ caseId: "M.strictest-feasible", target: "M", purpose: "smallest_allowed_loss_with_power_and_retention", sourceInput: selectedMInput as unknown as JsonValue, result: selectedM }),
    vector({ caseId: "M.no-feasible-withdrawal", target: "M", purpose: "failure_to_meet_power_or_retention_withdraws", sourceInput: withdrawnMInput as unknown as JsonValue, result: withdrawnM }),
  ];
}
