import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  CALIBRATION_SEED_STREAM_DOMAIN,
  CALIBRATION_SEED_STREAM_ORDERING,
  buildCalibrationDerivationSyntheticVectors,
  deriveSyntheticProviderCostCap,
  expandSyntheticSeedStream,
  selectSyntheticFinalRolloutCount,
  selectSyntheticPerRequestTokenCap,
  selectSyntheticPhaseResourceCaps,
  selectSyntheticStatisticalMargin,
  syntheticCapGridCommitment,
  syntheticMarginGridCommitment,
  syntheticRolloutGridCommitment,
  wilsonOneSidedUpperBoundProbabilityMicros,
  type SyntheticCapGridInput,
  type SyntheticMarginInput,
  type SyntheticPhaseResourceInput,
  type SyntheticRolloutCountInput,
  type SyntheticSeedStreamInput,
} from "../src/index.js";

function mutable<T>(value: T): any {
  return structuredClone(value);
}

function vector(caseId: string) {
  const found = buildCalibrationDerivationSyntheticVectors().find(
    (candidate) => candidate.caseId === caseId,
  );
  assert.ok(found, `missing synthetic vector ${caseId}`);
  return found;
}

describe("synthetic-only calibration derivation programs", () => {
  test("pins the one-sided Wilson estimator and selects the smaller feasible F cap", () => {
    assert.equal(
      wilsonOneSidedUpperBoundProbabilityMicros({ adverseEvents: 1, observations: 400 }),
      11_127,
    );
    assert.equal(
      wilsonOneSidedUpperBoundProbabilityMicros({ adverseEvents: 0, observations: 400 }),
      6_719,
    );
    const selected = vector("F.smallest-feasible").result;
    assert.equal(selected.status, "selected_synthetic_only");
    assert.equal(selected.target, "F");
    if (selected.target !== "F") throw new Error("unexpected target");
    assert.equal(selected.outcome.selectedCapTokens, 2_000);
    assert.equal(selected.outcome.evaluations[0]?.feasible, false);
    assert.equal(selected.outcome.evaluations[1]?.feasible, true);
  });

  test("rejects enlarged cap grids and hidden candidate defaults", () => {
    const input = mutable(vector("F.smallest-feasible").input);
    const last = mutable(input.candidates[1]);
    for (let index = 0; index < 7; index += 1) {
      input.candidates.push({
        ...last,
        candidateId: `F.cap.extra.${index}`,
        cap: 3_000 + index,
      });
    }
    assert.throws(() => selectSyntheticPerRequestTokenCap(input), /between one and eight/u);

    const hidden = mutable(vector("F.smallest-feasible").input);
    hidden.defaultCandidate = 8_192;
    assert.throws(
      () => selectSyntheticPerRequestTokenCap(hidden),
      /missing, extra, or implicit-default fields/u,
    );
  });

  test("withdraws instead of accepting missing strata, undercharging usage, or excluding incidents", () => {
    const missing = mutable(vector("F.smallest-feasible").input);
    missing.candidates[0]!.strata.pop();
    missing.gridCommitment = syntheticCapGridCommitment({
      target: "F",
      requiredStrata: missing.requiredStrata,
      candidates: missing.candidates,
    });
    assert.equal(
      selectSyntheticPerRequestTokenCap(missing).outcome.withdrawalReason,
      "missing_required_stratum",
    );
    assert.equal(
      vector("F.missing-usage-withdrawal").result.status,
      "withdrawn_synthetic_only",
    );
    assert.equal(
      vector("F.incident-withdrawal").result.status,
      "withdrawn_synthetic_only",
    );
  });

  test("detects post-result grid changes even when the outer object remains well formed", () => {
    const modified = vector("F.post-result-grid-withdrawal").result;
    assert.equal(modified.target, "F");
    if (modified.target !== "F") throw new Error("unexpected target");
    assert.equal(modified.outcome.withdrawalReason, "post_result_grid_modification");
  });

  test("selects G by raw cap and rounds resources upward", () => {
    const result = vector("G.upward-resource-rounding").result;
    assert.equal(result.target, "G");
    if (result.target !== "G") throw new Error("unexpected target");
    assert.deepEqual(
      result.outcome.selections.map((selection) => [
        selection.resourceId,
        selection.selectedRawCap,
        selection.selectedRoundedCap,
      ]),
      [
        ["inputTokens", 1_051, 1_100],
        ["outputTokens", 501, 600],
        ["providerRequestAttempts", 3, 3],
      ],
    );

    const reversed = mutable(vector("G.upward-resource-rounding").input);
    reversed.resources.reverse();
    assert.throws(() => selectSyntheticPhaseResourceCaps(reversed), /must be sorted/u);
  });

  test("derives J only from selected synthetic G caps and rounds each price component upward", () => {
    const result = vector("J.upward-integer-micro-cost").result;
    assert.equal(result.target, "J");
    if (result.target !== "J") throw new Error("unexpected target");
    assert.deepEqual(result.outcome.phaseCosts, [
      {
        phaseId: "mine_trace_generation",
        requestCostMicros: 9,
        inputTokenCostMicros: 1_210,
        outputTokenCostMicros: 1_320,
        phaseCostMicros: 2_539,
      },
    ]);
    assert.equal(result.outcome.selectedSyntheticProviderCostMicros, 2_539);

    const realPrice = mutable(vector("J.upward-integer-micro-cost").input);
    realPrice.priceSchedule.providerIdentity = "provider.example";
    assert.equal(
      deriveSyntheticProviderCostCap(realPrice).outcome.withdrawalReason,
      "invalid_synthetic_price_schedule",
    );
  });

  test("requires exactly K={2,3,5,8}, selects the smallest feasible count, and marks precision limitation", () => {
    const selected = vector("K.smallest-feasible").result;
    assert.equal(selected.target, "K");
    if (selected.target !== "K") throw new Error("unexpected target");
    assert.equal(selected.outcome.selectedRolloutCount, 5);

    const limited = vector("K.precision-limited").result;
    assert.equal(limited.target, "K");
    if (limited.target !== "K") throw new Error("unexpected target");
    assert.equal(limited.status, "precision_limited_synthetic_only");
    assert.equal(limited.outcome.selectedRolloutCount, 8);
    assert.equal(limited.outcome.precisionLimited, true);

    const enlarged = mutable(vector("K.smallest-feasible").input);
    enlarged.candidates.push({ ...enlarged.candidates[3]!, rolloutCount: 8 });
    assert.throws(() => selectSyntheticFinalRolloutCount(enlarged), /exact 2,3,5,8/u);

    const changed = mutable(vector("K.smallest-feasible").input);
    changed.candidates[2]!.mcseBasisPoints += 1;
    assert.equal(
      selectSyntheticFinalRolloutCount(changed).outcome.withdrawalReason,
      "post_result_grid_modification",
    );
  });

  test("pins L domain and zero-based ordering", () => {
    const result = vector("L.domain-separated-order").result;
    assert.equal(result.target, "L");
    if (result.target !== "L") throw new Error("unexpected target");
    assert.equal(result.outcome.seeds.length, 5);
    assert.deepEqual(
      result.outcome.seeds.map((seed) => seed.ordinal),
      [0, 1, 2, 3, 4],
    );
    assert.equal(
      result.outcome.seeds[0]?.seedHex,
      "cd0625e69da41b375b5aa4daac578305312a9913073390a5fe003425a18189e6",
    );

    const wrongDomain = mutable(vector("L.domain-separated-order").input);
    wrongDomain.domain = `${CALIBRATION_SEED_STREAM_DOMAIN}.changed`;
    assert.throws(() => expandSyntheticSeedStream(wrongDomain), /domain drifted/u);
    const wrongOrder = mutable(vector("L.domain-separated-order").input);
    wrongOrder.ordering = "counter_descending";
    assert.throws(() => expandSyntheticSeedStream(wrongOrder), /ordering drifted/u);
  });

  test("selects the strictest feasible M margin and refuses ties or threshold failures", () => {
    const selected = vector("M.strictest-feasible").result;
    assert.equal(selected.target, "M");
    if (selected.target !== "M") throw new Error("unexpected target");
    assert.equal(selected.outcome.selectedAllowedLossBasisPoints, 50);
    assert.equal(selected.outcome.safetyMarginBasisPoints, 0);
    assert.equal(vector("M.no-feasible-withdrawal").result.status, "withdrawn_synthetic_only");

    const tied = mutable(vector("M.strictest-feasible").input);
    tied.candidates[2]!.allowedLossBasisPoints = 50;
    tied.gridCommitment = syntheticMarginGridCommitment(tied);
    assert.throws(() => selectSyntheticStatisticalMargin(tied), /strictest to loosest/u);

    const changed = mutable(vector("M.strictest-feasible").input);
    changed.predeclaredMaximumLossBasisPoints = 200;
    assert.equal(
      selectSyntheticStatisticalMargin(changed).outcome.withdrawalReason,
      "post_result_grid_modification",
    );
  });

  test("rejects provider-smoke, public-fixture, benchmark, and protected ancestry", () => {
    for (const field of [
      "providerSmokeAncestry",
      "publicFixtureAncestry",
      "benchmarkAncestry",
      "protectedDataAncestry",
      "realProviderPriceAncestry",
      "providerOrModelIdentityPresent",
      "protectedDataCapabilityPresent",
    ]) {
      const input = mutable(vector("F.smallest-feasible").input);
      input.header[field] = true;
      assert.throws(
        () => selectSyntheticPerRequestTokenCap(input),
        /Only manually authored public-development synthetic tables/u,
      );
    }
  });

  test("marks every generated synthetic result as non-evidentiary and non-admissible", () => {
    const vectors = buildCalibrationDerivationSyntheticVectors();
    assert.equal(vectors.length, 11);
    for (const item of vectors) {
      for (const marked of [item, item.result]) {
        assert.equal(marked.publicDevelopment, true);
        assert.equal(marked.authorizedForResearchEvidence, false);
        assert.equal(marked.admissibleAsNumericFreezeValue, false);
        assert.equal(marked.confirmatory, false);
      }
      assert.match(item.result.syntheticResultId, /^sdr-sha256:[a-f0-9]{64}$/u);
    }
  });

  test("grid commitments change under any result-bearing table modification", () => {
    const k = mutable(vector("K.smallest-feasible").input);
    const before = k.gridCommitment;
    k.candidates[0]!.seedVarianceShareBasisPoints += 1;
    assert.notEqual(syntheticRolloutGridCommitment(k.candidates), before);
  });
});
