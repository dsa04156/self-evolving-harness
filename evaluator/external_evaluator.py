#!/usr/bin/env python3
"""Deterministic, no-network evaluator subprocess for the Gate-2 runtime.

The process accepts only authenticated, length-prefixed canonical JSON. It deliberately
supports the deterministic contract track only; sealed and benchmark roles fail closed.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
import subprocess
import sys
import tempfile
from typing import Any


MAX_FRAME_BYTES = 1_048_576
CONFIG_PATH = "/run/config/evaluator.json"
PRIVATE_KEY_PATH = "/run/keys/evaluator-private.pem"
OPERATIONS_PUBLIC_KEY_PATH = "/run/keys/operations-public.pem"


def canonical(value: Any) -> bytes:
    validate_i_json(value)
    return canonical_text(value).encode("utf-8")


def canonical_text(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, allow_nan=False)
    if isinstance(value, list):
        return "[" + ",".join(canonical_text(item) for item in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=lambda key: key.encode("utf-16-be"))
        return (
            "{"
            + ",".join(
                canonical_text(key) + ":" + canonical_text(value[key]) for key in keys
            )
            + "}"
        )
    raise ValueError("value is outside the canonical JSON profile")


def validate_i_json(value: Any, location: str = "$") -> None:
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str):
        if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
            raise ValueError(f"{location} contains a lone surrogate")
        return
    if isinstance(value, int):
        if abs(value) > 9_007_199_254_740_991:
            raise ValueError(f"{location} exceeds I-JSON integer range")
        return
    if isinstance(value, float):
        raise ValueError(f"{location} is outside the integer-only canonical profile")
    if isinstance(value, list):
        for index, item in enumerate(value):
            validate_i_json(item, f"{location}[{index}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError(f"{location} has a non-string key")
            validate_i_json(item, f"{location}.{key}")
        return
    raise ValueError(f"{location} is not JSON")


def sha256(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical(value)).hexdigest()


def b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def openssl_verify(public_key: str, body: bytes, signature: str) -> None:
    with tempfile.TemporaryDirectory(dir="/tmp") as temporary:
        body_path = os.path.join(temporary, "body")
        signature_path = os.path.join(temporary, "signature")
        with open(body_path, "wb") as body_file:
            body_file.write(body)
        with open(signature_path, "wb") as signature_file:
            signature_file.write(b64url_decode(signature))
        completed = subprocess.run(
            [
                "/usr/bin/openssl",
                "pkeyutl",
                "-verify",
                "-pubin",
                "-inkey",
                public_key,
                "-rawin",
                "-in",
                body_path,
                "-sigfile",
                signature_path,
            ],
            check=False,
            capture_output=True,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
        )
        if completed.returncode != 0:
            raise ValueError("request signature verification failed")


def openssl_sign(body: bytes) -> str:
    with tempfile.TemporaryDirectory(dir="/tmp") as temporary:
        body_path = os.path.join(temporary, "body")
        with open(body_path, "wb") as body_file:
            body_file.write(body)
        completed = subprocess.run(
            [
                "/usr/bin/openssl",
                "pkeyutl",
                "-sign",
                "-inkey",
                PRIVATE_KEY_PATH,
                "-rawin",
                "-in",
                body_path,
            ],
            check=False,
            capture_output=True,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
        )
    if completed.returncode != 0:
        raise ValueError(
            "evaluator signature failed: "
            + completed.stderr.decode("utf-8", errors="replace")[:1000]
        )
    return b64url_encode(completed.stdout)


def read_frame() -> dict[str, Any] | None:
    header = sys.stdin.buffer.read(4)
    if header == b"":
        return None
    if len(header) != 4:
        raise ValueError("truncated frame header")
    (length,) = struct.unpack(">I", header)
    if length < 2 or length > MAX_FRAME_BYTES:
        raise ValueError("invalid frame size")
    body = sys.stdin.buffer.read(length)
    if len(body) != length:
        raise ValueError("truncated frame body")
    value = parse_canonical_json(body)
    if not isinstance(value, dict):
        raise ValueError("frame body must be an object")
    return value


def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key}")
        result[key] = value
    return result


def parse_strict_integer(token: str) -> int:
    if token == "-0":
        raise ValueError("negative zero is forbidden")
    value = int(token)
    if abs(value) > 9_007_199_254_740_991:
        raise ValueError("integer exceeds I-JSON range")
    return value


def reject_fraction(token: str) -> int:
    raise ValueError(f"fractional number is forbidden: {token}")


def parse_canonical_json(body: bytes) -> Any:
    value = json.loads(
        body.decode("utf-8"),
        object_pairs_hook=reject_duplicate_keys,
        parse_int=parse_strict_integer,
        parse_float=reject_fraction,
        parse_constant=reject_fraction,
    )
    if canonical(value) != body:
        raise ValueError("input is not canonical JSON")
    return value


def write_frame(value: dict[str, Any]) -> None:
    body = canonical(value)
    if len(body) > MAX_FRAME_BYTES:
        raise ValueError("response frame too large")
    sys.stdout.buffer.write(struct.pack(">I", len(body)))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def unsigned(message: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in message.items() if key != "attestation"}


def authenticate_request(
    message: dict[str, Any],
    config: dict[str, Any],
    expected_sequence: int,
    seen_nonces: set[str],
) -> None:
    if message.get("sender") != config["operationsIdentity"]:
        raise ValueError("sender identity mismatch")
    attestation = message.get("attestation")
    if not isinstance(attestation, dict):
        raise ValueError("missing attestation")
    if (
        attestation.get("algorithm") != "Ed25519"
        or attestation.get("keyId") != config["operationsKeyId"]
    ):
        raise ValueError("request key mismatch")
    if message.get("senderSequence") != expected_sequence:
        raise ValueError("request sequence mismatch")
    nonce = message.get("nonce")
    if not isinstance(nonce, str) or nonce in seen_nonces:
        raise ValueError("request replay detected")
    openssl_verify(
        OPERATIONS_PUBLIC_KEY_PATH,
        canonical(unsigned(message)),
        attestation.get("signature", ""),
    )
    seen_nonces.add(nonce)


def sign_response(body: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    return {
        **body,
        "attestation": {
            "keyId": config["evaluatorKeyId"],
            "algorithm": "Ed25519",
            "signature": openssl_sign(canonical(body)),
        },
    }


def empty_usage() -> dict[str, int]:
    return {
        "modelRequestAttempts": 0,
        "completedModelCalls": 0,
        "failedModelCalls": 0,
        "cancelledModelCalls": 0,
        "inputTokens": 0,
        "outputTokens": 0,
        "reasoningTokens": 0,
        "cachedInputTokens": 0,
        "totalChargedTokens": 0,
        "providerCostMicros": 0,
        "toolCalls": 0,
        "feedbackEvents": 0,
        "wallClockMillis": 0,
    }


def rounded_ratio(numerator: int, denominator: int) -> int:
    if denominator <= 0:
        raise ValueError("ratio denominator must be positive")
    sign = -1 if numerator < 0 else 1
    quotient, remainder = divmod(abs(numerator), denominator)
    return sign * (quotient + (1 if 2 * remainder >= denominator else 0))


def build_evaluation_core(message: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    if message.get("datasetRole") != "deterministic" or message.get("phase") != "deterministic":
        raise ValueError("external evaluator prototype permits deterministic data only")
    cases = message.get("taskPairs")
    if not isinstance(cases, list) or not cases:
        raise ValueError("at least one deterministic task pair is required")
    parent_passes = sum(1 for case in cases if case["parentPassed"])
    candidate_passes = sum(1 for case in cases if case["candidatePassed"])
    pass_to_fail = sum(
        1 for case in cases if case["parentPassed"] and not case["candidatePassed"]
    )
    fail_to_pass = sum(
        1 for case in cases if not case["parentPassed"] and case["candidatePassed"]
    )
    task_count = len(cases)
    total_usage = empty_usage()
    total_usage.update(message["totalUsage"])
    return {
        "schemaVersion": 3,
        "evaluationResultId": message["evaluationResultId"],
        "protocolId": message["protocolId"],
        "track": "contract",
        "phase": "deterministic",
        "methodId": message["methodId"],
        "datasetRole": "deterministic",
        "parentHarnessVersionId": message["parentHarnessVersionId"],
        "candidateHarnessVersionId": message["candidateHarnessVersionId"],
        "runtimeStateSnapshotIds": message["runtimeStateSnapshotIds"],
        "rolloutSeeds": message["rolloutSeeds"],
        "epistemicClass": "verifier_outcome",
        "validity": "valid",
        "manifestPins": message["manifestPins"],
        "taskPairs": cases,
        "aggregate": {
            "taskCount": task_count,
            "rolloutSeedCount": len(message["rolloutSeeds"]),
            "parentPassRateMicros": rounded_ratio(parent_passes * 1_000_000, task_count),
            "candidatePassRateMicros": rounded_ratio(
                candidate_passes * 1_000_000, task_count
            ),
            "deltaPercentagePointMicros": rounded_ratio(
                (candidate_passes - parent_passes) * 100_000_000, task_count
            ),
            "passToFailCount": pass_to_fail,
            "failToPassCount": fail_to_pass,
            "pairedCi95LowerPercentagePointMicros": message[
                "pairedCi95LowerPercentagePointMicros"
            ],
            "pairedCi95UpperPercentagePointMicros": message[
                "pairedCi95UpperPercentagePointMicros"
            ],
            "taskIsPrimaryUnit": True,
        },
        "attributionMetrics": None,
        "usageByPhaseRole": [
            {
                "phaseId": "phase.deterministic",
                "roleId": "role.evaluator",
                "usage": total_usage,
            }
        ],
        "totalUsage": total_usage,
        "deterministicCompute": {
            "verifierCpuMillis": 0,
            "validatorCpuMillis": 0,
            "wallClockMillis": 0,
            "peakMemoryMiB": 0,
        },
        "feedbackEvents": [],
        "gateChecks": [
            {
                "gateId": "gate.deterministic",
                "passed": len(message.get("violations", [])) == 0,
                "observedValue": len(message.get("violations", [])),
                "threshold": 0,
                "evidenceReceiptIds": message["sourceEvidenceReceiptIds"],
            }
        ],
        "violations": message.get("violations", []),
        "evaluator": config["evaluatorIdentity"],
        "createdAt": message["createdAt"],
    }


def canonical_corpus_main(corpus_path: str) -> int:
    with open(corpus_path, "rb") as corpus_file:
        corpus = json.loads(
            corpus_file.read().decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_int=parse_strict_integer,
            parse_float=reject_fraction,
            parse_constant=reject_fraction,
        )
    if corpus.get("profile") != "seh-c14n-int-v1":
        raise ValueError("canonical corpus profile mismatch")
    valid_results: list[dict[str, Any]] = []
    for vector in corpus.get("valid", []):
        value = vector["value"]
        valid_results.append(
            {
                "id": vector["id"],
                "canonical": canonical(value).decode("utf-8"),
                "sha256": sha256(value),
            }
        )
    invalid_results: list[dict[str, Any]] = []
    for vector in corpus.get("invalid", []):
        rejected = False
        try:
            parse_canonical_json(vector["json"].encode("utf-8"))
        except (UnicodeError, ValueError, json.JSONDecodeError):
            rejected = True
        invalid_results.append({"id": vector["id"], "rejected": rejected})
    sys.stdout.buffer.write(
        canonical(
            {
                "profile": "seh-c14n-int-v1",
                "valid": valid_results,
                "invalid": invalid_results,
            }
        )
    )
    sys.stdout.buffer.write(b"\n")
    return 0


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--canonical-corpus":
        return canonical_corpus_main(sys.argv[2])
    if len(sys.argv) != 1:
        raise ValueError("unsupported evaluator arguments")
    with open(CONFIG_PATH, "rb") as config_file:
        config_bytes = config_file.read()
    config = parse_canonical_json(config_bytes)
    expected_sequence = 0
    seen_nonces: set[str] = set()
    pending: dict[str, dict[str, Any]] = {}
    while True:
        message = read_frame()
        if message is None:
            return 0
        authenticate_request(message, config, expected_sequence, seen_nonces)
        expected_sequence += 1
        message_type = message.get("type")
        request_id = message.get("requestId")
        if not isinstance(request_id, str):
            raise ValueError("missing request ID")
        if message_type == "evaluate":
            core = build_evaluation_core(message, config)
            core_hash = sha256(core)
            pending[request_id] = core
            write_frame(
                sign_response(
                    {
                        "schemaVersion": 1,
                        "type": "evaluation_proposed",
                        "requestId": request_id,
                        "coreHash": core_hash,
                        "core": core,
                        "evaluator": config["evaluatorIdentity"],
                    },
                    config,
                )
            )
        elif message_type == "finalize":
            core = pending.pop(request_id, None)
            if core is None or sha256(core) != message.get("coreHash"):
                raise ValueError("unknown or changed evaluation core")
            body = {**core, "auditLink": message["auditLink"]}
            result = {
                **body,
                "attestation": {
                    "keyId": config["evaluatorKeyId"],
                    "algorithm": "Ed25519",
                    "signature": openssl_sign(canonical(body)),
                },
            }
            write_frame(
                sign_response(
                    {
                        "schemaVersion": 1,
                        "type": "evaluation_final",
                        "requestId": request_id,
                        "result": result,
                        "evaluator": config["evaluatorIdentity"],
                    },
                    config,
                )
            )
        else:
            raise ValueError("unsupported evaluator request")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # fail closed; stderr is captured by the supervisor.
        print(f"external evaluator failed: {error}", file=sys.stderr)
        raise SystemExit(2)
