import {
  canonicalize,
  sha256,
  sha256Text,
  type JsonValue,
} from "../core/canonical.js";
import {
  CALIBRATION_SEED_STREAM_DOMAIN,
  wilsonOneSidedUpperBoundProbabilityMicros,
} from "./calibration-derivation-programs.js";

export const CALIBRATION_ARITHMETIC_PORTABILITY_CONTRACT = {
  contractVersion: "calibration_arithmetic_portability.v1",
  integerDomain: {
    input: "nonnegative_I-JSON_safe_integer",
    intermediate: "unbounded_signed_integer_with_nonnegative_operands",
    serializedOutput: "nonnegative_I-JSON_safe_integer",
    overflowDisposition:
      "reject_before_serialization_if_output_exceeds_9007199254740991",
  },
  rationalDomain: {
    numerator: "nonnegative_unbounded_integer",
    denominator: "positive_unbounded_integer",
    upwardRounding: "quotient=(numerator+denominator-1)//denominator",
    zeroDenominatorDisposition: "reject",
  },
  wilsonBound: {
    zNumerator: 1_644_854,
    zDenominator: 1_000_000,
    arithmetic:
      "IEEE-754_binary64_round_to_nearest_ties_to_even_without_fused_operations",
    orderedOperations: [
      "z=zNumerator/zDenominator",
      "zSquared=z*z",
      "p=adverseEvents/observations",
      "radicand=p*(1-p)/observations+zSquared/(4*observations*observations)",
      "numerator=p+zSquared/(2*observations)+z*sqrt(radicand)",
      "denominator=1+zSquared/observations",
      "bound=numerator/denominator",
      "output=min(1000000,ceil(bound*1000000))",
    ],
    comparisonPrecision:
      "compare_rounded_integer_probability_micros_only",
    nonFiniteDisposition: "reject",
  },
  resourceAndCostRounding: {
    resourceQuantum:
      "ceil(rawCap/positiveQuantum)*positiveQuantum_using_integer_arithmetic",
    requestCost: "requestCount*requestMicros_exact_integer",
    tokenCost:
      "ceil(tokenCount*microsPerMillion/1000000)_per_input_and_output_component_before_sum",
  },
  comparisons: {
    numeric: "exact_integer_comparison_after_declared_rounding",
    strings: "Unicode_code_point_order_over_closed_ASCII_identifiers",
    stableTieBehavior: "ties_forbidden_unless_the_program_contract_names_a_tie_rule",
  },
  seedStreamEncoding: {
    digest: "SHA-256",
    textEncoding: "UTF-8",
    preimage:
      "domain+U+0000+64_lowercase_hex_root_seed+U+0000+unpadded_base10_counter",
    counter: "ascending_zero_based_nonnegative_integer",
    output: "full_32_byte_lowercase_hex",
  },
  deterministicSerialization: {
    profile: "canonical_json.v1",
    encoding: "UTF-8",
    objectKeys: "lexicographic_order",
    whitespace: "none",
    arrays: "preserve_declared_order",
    numbers: "finite_I-JSON_safe_integers_only_for_portability_vectors",
    hashInputNewline: "excluded",
  },
  crossImplementationRequirement: {
    implementations: [
      "typescript_primary_node_24_18_1",
      "python3_stdlib_independent_reference",
    ],
    acceptance: "canonical_vector_arrays_must_be_byte_identical",
    permittedInputClass: "manually_authored_public_development_synthetic_only",
    providerBenchmarkPilotOrProtectedDataAllowed: false,
  },
} as const;

export interface CalibrationPortabilityGoldenVector {
  readonly vectorId: string;
  readonly operation:
    | "wilson_upper_probability_micros"
    | "ceil_rational_to_integer"
    | "ceil_to_positive_quantum"
    | "seed_stream_preimage_sha256"
    | "canonical_serialization_sha256";
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly publicDevelopment: true;
  readonly authorizedForResearchEvidence: false;
  readonly admissibleAsNumericFreezeValue: false;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new Error("Portable rational operands are outside the closed domain");
  }
  return (numerator + denominator - 1n) / denominator;
}

function asSafeNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Portable arithmetic output exceeds the I-JSON range");
  }
  return Number(value);
}

function marking(): Pick<
  CalibrationPortabilityGoldenVector,
  | "publicDevelopment"
  | "authorizedForResearchEvidence"
  | "admissibleAsNumericFreezeValue"
> {
  return {
    publicDevelopment: true,
    authorizedForResearchEvidence: false,
    admissibleAsNumericFreezeValue: false,
  };
}

export function buildCalibrationPortabilityGoldenVectors(): readonly CalibrationPortabilityGoldenVector[] {
  const canonicalInput: JsonValue = {
    zeta: [3, 1, 2],
    alpha: { enabled: true, count: 7 },
    label: "portable-ascii",
  };
  const rootSeedHex = "00".repeat(32);
  return [
    {
      vectorId: "wilson.zero-of-1000",
      operation: "wilson_upper_probability_micros",
      input: { adverseEvents: 0, observations: 1000 },
      output: {
        upperBoundProbabilityMicros:
          wilsonOneSidedUpperBoundProbabilityMicros({
            adverseEvents: 0,
            observations: 1000,
          }),
      },
      ...marking(),
    },
    {
      vectorId: "wilson.one-of-1000",
      operation: "wilson_upper_probability_micros",
      input: { adverseEvents: 1, observations: 1000 },
      output: {
        upperBoundProbabilityMicros:
          wilsonOneSidedUpperBoundProbabilityMicros({
            adverseEvents: 1,
            observations: 1000,
          }),
      },
      ...marking(),
    },
    {
      vectorId: "rational.ceil-one-millionth",
      operation: "ceil_rational_to_integer",
      input: { numerator: "1", denominator: "1000000" },
      output: { quotient: asSafeNumber(ceilDiv(1n, 1_000_000n)) },
      ...marking(),
    },
    {
      vectorId: "rational.ceil-above-one",
      operation: "ceil_rational_to_integer",
      input: { numerator: "1000001", denominator: "1000000" },
      output: { quotient: asSafeNumber(ceilDiv(1_000_001n, 1_000_000n)) },
      ...marking(),
    },
    {
      vectorId: "resource.ceil-101-to-25",
      operation: "ceil_to_positive_quantum",
      input: { value: 101, quantum: 25 },
      output: {
        rounded: asSafeNumber(ceilDiv(101n, 25n) * 25n),
      },
      ...marking(),
    },
    {
      vectorId: "seed.zero-root-counter-0",
      operation: "seed_stream_preimage_sha256",
      input: {
        domain: CALIBRATION_SEED_STREAM_DOMAIN,
        rootSeedHex,
        counter: 0,
      },
      output: {
        seedHex: sha256Text(
          `${CALIBRATION_SEED_STREAM_DOMAIN}\0${rootSeedHex}\0${0}`,
        ).slice("sha256:".length),
      },
      ...marking(),
    },
    {
      vectorId: "seed.zero-root-counter-7",
      operation: "seed_stream_preimage_sha256",
      input: {
        domain: CALIBRATION_SEED_STREAM_DOMAIN,
        rootSeedHex,
        counter: 7,
      },
      output: {
        seedHex: sha256Text(
          `${CALIBRATION_SEED_STREAM_DOMAIN}\0${rootSeedHex}\0${7}`,
        ).slice("sha256:".length),
      },
      ...marking(),
    },
    {
      vectorId: "serialization.closed-ascii-object",
      operation: "canonical_serialization_sha256",
      input: canonicalInput,
      output: {
        canonicalText: canonicalize(canonicalInput),
        sha256: sha256(canonicalInput),
      },
      ...marking(),
    },
  ];
}
