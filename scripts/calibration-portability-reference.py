#!/usr/bin/env python3
"""Independent stdlib reference for public-development portability vectors."""

from __future__ import annotations

import hashlib
import json
import math


DOMAIN = "seh.calibration.synthetic.seed-stream.v1"
MARKING = {
    "publicDevelopment": True,
    "authorizedForResearchEvidence": False,
    "admissibleAsNumericFreezeValue": False,
}


def wilson(adverse_events: int, observations: int) -> int:
    z = 1644854 / 1000000
    z_squared = z * z
    p = adverse_events / observations
    radicand = (
        p * (1 - p) / observations
        + z_squared / (4 * observations * observations)
    )
    numerator = (
        p
        + z_squared / (2 * observations)
        + z * math.sqrt(radicand)
    )
    denominator = 1 + z_squared / observations
    return min(1000000, math.ceil((numerator / denominator) * 1000000))


def ceil_div(numerator: int, denominator: int) -> int:
    if numerator < 0 or denominator <= 0:
        raise ValueError("operands outside closed rational domain")
    return (numerator + denominator - 1) // denominator


def canonical(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def seed(root_seed_hex: str, counter: int) -> str:
    preimage = f"{DOMAIN}\0{root_seed_hex}\0{counter}".encode("utf-8")
    return hashlib.sha256(preimage).hexdigest()


def vector(vector_id: str, operation: str, input_value: object, output: object) -> dict:
    return {
        "vectorId": vector_id,
        "operation": operation,
        "input": input_value,
        "output": output,
        **MARKING,
    }


def main() -> None:
    root_seed_hex = "00" * 32
    canonical_input = {
        "zeta": [3, 1, 2],
        "alpha": {"enabled": True, "count": 7},
        "label": "portable-ascii",
    }
    canonical_text = canonical(canonical_input)
    vectors = [
        vector(
            "wilson.zero-of-1000",
            "wilson_upper_probability_micros",
            {"adverseEvents": 0, "observations": 1000},
            {"upperBoundProbabilityMicros": wilson(0, 1000)},
        ),
        vector(
            "wilson.one-of-1000",
            "wilson_upper_probability_micros",
            {"adverseEvents": 1, "observations": 1000},
            {"upperBoundProbabilityMicros": wilson(1, 1000)},
        ),
        vector(
            "rational.ceil-one-millionth",
            "ceil_rational_to_integer",
            {"numerator": "1", "denominator": "1000000"},
            {"quotient": ceil_div(1, 1000000)},
        ),
        vector(
            "rational.ceil-above-one",
            "ceil_rational_to_integer",
            {"numerator": "1000001", "denominator": "1000000"},
            {"quotient": ceil_div(1000001, 1000000)},
        ),
        vector(
            "resource.ceil-101-to-25",
            "ceil_to_positive_quantum",
            {"value": 101, "quantum": 25},
            {"rounded": ceil_div(101, 25) * 25},
        ),
        vector(
            "seed.zero-root-counter-0",
            "seed_stream_preimage_sha256",
            {"domain": DOMAIN, "rootSeedHex": root_seed_hex, "counter": 0},
            {"seedHex": seed(root_seed_hex, 0)},
        ),
        vector(
            "seed.zero-root-counter-7",
            "seed_stream_preimage_sha256",
            {"domain": DOMAIN, "rootSeedHex": root_seed_hex, "counter": 7},
            {"seedHex": seed(root_seed_hex, 7)},
        ),
        vector(
            "serialization.closed-ascii-object",
            "canonical_serialization_sha256",
            canonical_input,
            {
                "canonicalText": canonical_text,
                "sha256": "sha256:"
                + hashlib.sha256(canonical_text.encode("utf-8")).hexdigest(),
            },
        ),
    ]
    print(canonical(vectors))


if __name__ == "__main__":
    main()
