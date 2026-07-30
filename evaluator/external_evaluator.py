#!/usr/bin/env python3
"""Deterministic, no-network evaluator subprocess for the Gate-2 runtime.

The process accepts only authenticated, length-prefixed canonical JSON. It deliberately
supports the deterministic contract track only; sealed and benchmark roles fail closed.
"""

from __future__ import annotations

import base64
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import re
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import unicodedata
from typing import Any


MAX_FRAME_BYTES = 1_048_576
WIRE_PROTOCOL_VERSION = "seh-wire/1"
WIRE_SCHEMA_ID = (
    "https://self-evolving-harness.local/schemas/wire-envelope.schema.json"
)
REQUEST_SCHEMA_ID = (
    "https://self-evolving-harness.local/schemas/"
    "evaluator-request-payload.schema.json"
)
RESPONSE_SCHEMA_ID = (
    "https://self-evolving-harness.local/schemas/"
    "evaluator-response-payload.schema.json"
)
PEER_CREDENTIAL_FORMAT = "3i"
ENTITY_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,159}$")
SHA256_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
HARNESS_ID_PATTERN = re.compile(r"^hv-sha256:[a-f0-9]{64}$")
SNAPSHOT_ID_PATTERN = re.compile(r"^rss-sha256:[a-f0-9]{64}$")
PROTOCOL_ID_PATTERN = re.compile(r"^protocol-sha256:[a-f0-9]{64}$")
SIGNATURE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{80,128}$")
UTC_TIMESTAMP_PATTERN = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T"
    r"[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$"
)
METHOD_IDS = {
    "B0",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5-U",
    "B5-SM",
    "B6-ABL",
    "B6",
}
MANIFEST_PIN_KEYS = {
    "protocol",
    "budget",
    "modelConfiguration",
    "split",
    "evaluator",
    "environment",
    "toolchain",
    "statisticalPlan",
}
USAGE_KEYS = {
    "modelRequestAttempts",
    "completedModelCalls",
    "failedModelCalls",
    "cancelledModelCalls",
    "inputTokens",
    "outputTokens",
    "reasoningTokens",
    "cachedInputTokens",
    "totalChargedTokens",
    "providerCostMicros",
    "toolCalls",
    "feedbackEvents",
    "wallClockMillis",
}
VIOLATION_KINDS = {
    "safety",
    "permission",
    "budget",
    "manifest",
    "state_snapshot",
    "data_access",
    "audit",
    "protocol",
}


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


def openssl_sign(body: bytes, private_key_path: str) -> str:
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
                private_key_path,
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


def read_exact(stream: object, size: int) -> bytes | None:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = stream.read(remaining)  # type: ignore[attr-defined]
        if chunk == b"":
            if remaining == size:
                return None
            raise ValueError("truncated frame")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def read_frame(stream: object) -> dict[str, Any] | None:
    header = read_exact(stream, 4)
    if header is None:
        return None
    (length,) = struct.unpack(">I", header)
    if length < 2 or length > MAX_FRAME_BYTES:
        raise ValueError("invalid frame size")
    body = read_exact(stream, length)
    if body is None:
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


def write_frame(stream: object, value: dict[str, Any]) -> None:
    body = canonical(value)
    if len(body) > MAX_FRAME_BYTES:
        raise ValueError("response frame too large")
    stream.write(struct.pack(">I", len(body)))  # type: ignore[attr-defined]
    stream.write(body)  # type: ignore[attr-defined]
    stream.flush()  # type: ignore[attr-defined]


def unsigned(message: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in message.items() if key != "attestation"}


def parse_timestamp(value: Any, label: str) -> datetime:
    if (
        not isinstance(value, str)
        or UTC_TIMESTAMP_PATTERN.fullmatch(value) is None
    ):
        raise ValueError(f"{label} is not a UTC timestamp")
    parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    if parsed.tzinfo is None:
        raise ValueError(f"{label} has no timezone")
    return parsed


def require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise ValueError(f"{label} keys mismatch missing={missing} extra={extra}")


def is_integer(value: Any, minimum: int = 0, maximum: int | None = None) -> bool:
    return (
        type(value) is int
        and value >= minimum
        and (maximum is None or value <= maximum)
    )


def is_entity_id(value: Any) -> bool:
    return isinstance(value, str) and ENTITY_ID_PATTERN.fullmatch(value) is not None


def validate_principal_identity(value: Any, expected_role: str) -> None:
    if not isinstance(value, dict):
        raise ValueError("principal identity is not an object")
    required = {
        "principalId",
        "role",
        "identityDigest",
        "implementationDigest",
        "instanceId",
    }
    if frozenset(value) not in {
        frozenset(required),
        frozenset(required | {"modelIdentityHash"}),
    }:
        raise ValueError("principal identity keys violate the closed schema")
    model_identity = value.get("modelIdentityHash")
    if (
        not is_entity_id(value.get("principalId"))
        or value.get("role") != expected_role
        or not isinstance(value.get("identityDigest"), str)
        or SHA256_PATTERN.fullmatch(value["identityDigest"]) is None
        or not isinstance(value.get("implementationDigest"), str)
        or SHA256_PATTERN.fullmatch(value["implementationDigest"]) is None
        or not is_entity_id(value.get("instanceId"))
        or (
            "modelIdentityHash" in value
            and model_identity is not None
            and (
                not isinstance(model_identity, str)
                or SHA256_PATTERN.fullmatch(model_identity) is None
            )
        )
    ):
        raise ValueError("principal identity violates the closed schema")


def validate_unique_strings(
    value: Any,
    label: str,
    *,
    minimum_items: int,
    pattern: re.Pattern[str] | None = None,
) -> None:
    if (
        not isinstance(value, list)
        or len(value) < minimum_items
        or any(not isinstance(item, str) for item in value)
        or len(set(value)) != len(value)
        or (
            pattern is not None
            and any(pattern.fullmatch(item) is None for item in value)
        )
    ):
        raise ValueError(f"{label} is not a unique canonical string list")


def validate_usage(value: Any) -> None:
    if not isinstance(value, dict):
        raise ValueError("usage is not an object")
    require_exact_keys(value, USAGE_KEYS, "usage")
    if any(not is_integer(item) for item in value.values()):
        raise ValueError("usage contains a non-integer or negative value")
    if value["modelRequestAttempts"] != (
        value["completedModelCalls"]
        + value["failedModelCalls"]
        + value["cancelledModelCalls"]
    ):
        raise ValueError("usage model-attempt accounting does not balance")


def validate_manifest_pins(value: Any) -> None:
    if not isinstance(value, dict):
        raise ValueError("manifest pins are not an object")
    require_exact_keys(value, MANIFEST_PIN_KEYS, "manifest pins")
    if any(
        not isinstance(item, str) or SHA256_PATTERN.fullmatch(item) is None
        for item in value.values()
    ):
        raise ValueError("manifest pin is not a SHA-256 digest")


def validate_task_pairs(value: Any, rollout_seeds: list[int]) -> None:
    if not isinstance(value, list) or not 1 <= len(value) <= 10_000:
        raise ValueError("task pair count is outside the closed schema")
    seen: set[tuple[str, int]] = set()
    for pair in value:
        if not isinstance(pair, dict):
            raise ValueError("task pair is not an object")
        require_exact_keys(
            pair,
            {
                "opaqueTaskHandleHash",
                "rolloutSeed",
                "parentPassed",
                "candidatePassed",
                "parentReceiptId",
                "candidateReceiptId",
            },
            "task pair",
        )
        key = (pair.get("opaqueTaskHandleHash"), pair.get("rolloutSeed"))
        if (
            not isinstance(key[0], str)
            or SHA256_PATTERN.fullmatch(key[0]) is None
            or not is_integer(key[1])
            or key[1] not in rollout_seeds
            or type(pair.get("parentPassed")) is not bool
            or type(pair.get("candidatePassed")) is not bool
            or not is_entity_id(pair.get("parentReceiptId"))
            or not is_entity_id(pair.get("candidateReceiptId"))
            or key in seen
        ):
            raise ValueError("task pair violates its closed schema")
        seen.add(key)


def validate_violations(value: Any) -> None:
    if not isinstance(value, list):
        raise ValueError("violations are not an array")
    for violation in value:
        if not isinstance(violation, dict):
            raise ValueError("violation is not an object")
        require_exact_keys(
            violation, {"kind", "count", "receiptIds"}, "violation"
        )
        if (
            violation.get("kind") not in VIOLATION_KINDS
            or not is_integer(violation.get("count"))
        ):
            raise ValueError("violation metadata is invalid")
        validate_unique_strings(
            violation.get("receiptIds"),
            "violation receipt IDs",
            minimum_items=0,
        )
        if any(
            not is_entity_id(receipt_id)
            for receipt_id in violation["receiptIds"]
        ):
            raise ValueError("violation receipt ID is invalid")


def validate_audit_link(value: Any) -> None:
    if not isinstance(value, dict):
        raise ValueError("audit link is not an object")
    require_exact_keys(
        value,
        {
            "protocolId",
            "logId",
            "sequence",
            "recordHash",
            "previousRecordHash",
        },
        "audit link",
    )
    if (
        not isinstance(value.get("protocolId"), str)
        or not value["protocolId"].startswith("protocol-sha256:")
        or not is_entity_id(value.get("logId"))
        or not is_integer(value.get("sequence"))
        or not isinstance(value.get("recordHash"), str)
        or SHA256_PATTERN.fullmatch(value["recordHash"]) is None
        or (
            value.get("previousRecordHash") is not None
            and (
                not isinstance(value["previousRecordHash"], str)
                or SHA256_PATTERN.fullmatch(value["previousRecordHash"]) is None
            )
        )
    ):
        raise ValueError("audit link violates its closed schema")


def validate_request_payload(payload: dict[str, Any]) -> None:
    operation = payload.get("operation")
    if operation == "evaluate":
        require_exact_keys(
            payload,
            {
                "schemaVersion",
                "operation",
                "requestId",
                "evaluationResultId",
                "datasetRole",
                "phase",
                "methodId",
                "parentHarnessVersionId",
                "candidateHarnessVersionId",
                "candidateFilesystemSnapshotHash",
                "runtimeStateSnapshotIds",
                "rolloutSeeds",
                "manifestPins",
                "taskPairs",
                "totalUsage",
                "pairedCi95LowerPercentagePointMicros",
                "pairedCi95UpperPercentagePointMicros",
                "sourceEvidenceReceiptIds",
                "violations",
                "createdAt",
            },
            "evaluate payload",
        )
        snapshot_hash = payload.get("candidateFilesystemSnapshotHash")
        rollout_seeds = payload.get("rolloutSeeds")
        if (
            payload.get("schemaVersion") != 1
            or payload.get("datasetRole") != "deterministic"
            or payload.get("phase") != "deterministic"
            or not is_entity_id(payload.get("requestId"))
            or not is_entity_id(payload.get("evaluationResultId"))
            or payload.get("methodId") not in METHOD_IDS
            or not isinstance(payload.get("parentHarnessVersionId"), str)
            or HARNESS_ID_PATTERN.fullmatch(
                payload["parentHarnessVersionId"]
            )
            is None
            or not isinstance(payload.get("candidateHarnessVersionId"), str)
            or HARNESS_ID_PATTERN.fullmatch(
                payload["candidateHarnessVersionId"]
            )
            is None
            or (
                snapshot_hash is not None
                and (
                    not isinstance(snapshot_hash, str)
                    or SHA256_PATTERN.fullmatch(snapshot_hash) is None
                )
            )
            or not isinstance(rollout_seeds, list)
            or not rollout_seeds
            or any(not is_integer(seed) for seed in rollout_seeds)
            or len(set(rollout_seeds)) != len(rollout_seeds)
        ):
            raise ValueError("unsupported evaluate payload version or data role")
        validate_unique_strings(
            payload.get("runtimeStateSnapshotIds"),
            "runtime-state snapshot IDs",
            minimum_items=1,
            pattern=SNAPSHOT_ID_PATTERN,
        )
        validate_manifest_pins(payload.get("manifestPins"))
        validate_task_pairs(payload.get("taskPairs"), rollout_seeds)
        validate_usage(payload.get("totalUsage"))
        lower = payload.get("pairedCi95LowerPercentagePointMicros")
        upper = payload.get("pairedCi95UpperPercentagePointMicros")
        if (
            not is_integer(lower, -100_000_000, 100_000_000)
            or not is_integer(upper, -100_000_000, 100_000_000)
            or lower > upper
        ):
            raise ValueError("paired confidence interval is invalid")
        validate_unique_strings(
            payload.get("sourceEvidenceReceiptIds"),
            "source evidence receipt IDs",
            minimum_items=1,
        )
        if any(
            not is_entity_id(receipt_id)
            for receipt_id in payload["sourceEvidenceReceiptIds"]
        ):
            raise ValueError("source evidence receipt ID is invalid")
        validate_violations(payload.get("violations"))
        parse_timestamp(payload.get("createdAt"), "createdAt")
    elif operation == "finalize":
        require_exact_keys(
            payload,
            {
                "schemaVersion",
                "operation",
                "requestId",
                "coreHash",
                "auditLink",
            },
            "finalize payload",
        )
        if (
            payload.get("schemaVersion") != 1
            or not is_entity_id(payload.get("requestId"))
            or not isinstance(payload.get("coreHash"), str)
            or SHA256_PATTERN.fullmatch(payload["coreHash"]) is None
        ):
            raise ValueError("unsupported finalize payload version")
        validate_audit_link(payload.get("auditLink"))
    else:
        raise ValueError("unsupported evaluator operation")


def authenticate_request_envelope(
    message: dict[str, Any],
    config: dict[str, Any],
    expected_sequence: int,
    seen_nonces: set[str],
) -> dict[str, Any]:
    require_exact_keys(
        message,
        {
            "schemaVersion",
            "wireProtocolVersion",
            "protocolId",
            "messageId",
            "correlationId",
            "causationId",
            "sender",
            "recipientRole",
            "messageType",
            "sentAt",
            "expiresAt",
            "senderSequence",
            "nonce",
            "payloadSchemaId",
            "payloadHash",
            "payloadSizeBytes",
            "payload",
            "artifactRefs",
            "result",
            "attestation",
        },
        "wire envelope",
    )
    if (
        message.get("schemaVersion") != 1
        or message.get("wireProtocolVersion") != WIRE_PROTOCOL_VERSION
        or message.get("protocolId") != config["protocolId"]
        or PROTOCOL_ID_PATTERN.fullmatch(message["protocolId"]) is None
        or not is_entity_id(message.get("messageId"))
        or not is_entity_id(message.get("correlationId"))
        or message.get("causationId") is not None
    ):
        raise ValueError("wire protocol downgrade or manifest mismatch")
    if (
        message.get("recipientRole") != "evaluator"
        or message.get("messageType") != "evaluator.request"
    ):
        raise ValueError("request role or message type is unauthorized")
    if message.get("sender") != config["operationsIdentity"]:
        raise ValueError("sender identity mismatch")
    if message["sender"].get("role") != "operations_owner":
        raise ValueError("sender role mismatch")
    if message.get("payloadSchemaId") != REQUEST_SCHEMA_ID:
        raise ValueError("request payload schema downgrade")
    if message.get("artifactRefs") != []:
        raise ValueError("inline deterministic evaluator accepts no artifact refs")
    if message.get("result") != {"status": "request", "error": None}:
        raise ValueError("evaluator request has invalid wire result state")
    sent_at = parse_timestamp(message.get("sentAt"), "sentAt")
    expires_at = parse_timestamp(message.get("expiresAt"), "expiresAt")
    now = datetime.now(timezone.utc)
    if (
        expires_at < sent_at
        or expires_at > sent_at + timedelta(seconds=30)
        or sent_at > now + timedelta(seconds=30)
    ):
        raise ValueError("invalid evaluator request time range")
    if expires_at < now:
        raise TimeoutError("evaluator request expired")
    attestation = message.get("attestation")
    if not isinstance(attestation, dict):
        raise ValueError("missing attestation")
    require_exact_keys(attestation, {"keyId", "algorithm", "signature"}, "attestation")
    if (
        attestation.get("algorithm") != "Ed25519"
        or attestation.get("keyId") != config["operationsKeyId"]
        or not isinstance(attestation.get("signature"), str)
        or SIGNATURE_PATTERN.fullmatch(attestation["signature"]) is None
    ):
        raise ValueError("request key mismatch")
    if (
        not is_integer(message.get("senderSequence"))
        or message.get("senderSequence") != expected_sequence
    ):
        raise ValueError("request sequence mismatch")
    nonce = message.get("nonce")
    if (
        not isinstance(nonce, str)
        or re.fullmatch(r"[A-Za-z0-9_-]{22,64}", nonce) is None
        or nonce in seen_nonces
    ):
        raise ValueError("request replay detected")
    payload = message.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("request payload is not an object")
    payload_bytes = canonical(payload)
    if (
        message.get("payloadHash") != sha256(payload)
        or message.get("payloadSizeBytes") != len(payload_bytes)
        or not is_integer(message.get("payloadSizeBytes"), 2, MAX_FRAME_BYTES)
    ):
        raise ValueError("request payload hash or size mismatch")
    validate_request_payload(payload)
    if message["correlationId"] != payload["requestId"]:
        raise ValueError("request correlation does not bind its request ID")
    openssl_verify(
        config["operationsPublicKeyPath"],
        canonical(unsigned(message)),
        attestation.get("signature", ""),
    )
    seen_nonces.add(nonce)
    return payload


def sign_value(
    body: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    return {
        **body,
        "attestation": {
            "keyId": config["evaluatorKeyId"],
            "algorithm": "Ed25519",
            "signature": openssl_sign(canonical(body), config["evaluatorPrivateKeyPath"]),
        },
    }


def utc_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def response_nonce(message_id: str, sequence: int) -> str:
    digest = hashlib.sha256(f"{message_id}:{sequence}".encode("utf-8")).digest()
    return b64url_encode(digest)[:32]


def create_response_envelope(
    payload: dict[str, Any],
    request: dict[str, Any],
    config: dict[str, Any],
    sequence: int,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    message_id = f"evaluator-response-{sequence:08d}"
    unsigned_envelope = {
        "schemaVersion": 1,
        "wireProtocolVersion": WIRE_PROTOCOL_VERSION,
        "protocolId": config["protocolId"],
        "messageId": message_id,
        "correlationId": request["correlationId"],
        "causationId": request["messageId"],
        "sender": config["evaluatorIdentity"],
        "recipientRole": "operations_owner",
        "messageType": "evaluator.result",
        "sentAt": utc_timestamp(now),
        "expiresAt": utc_timestamp(now + timedelta(seconds=5)),
        "senderSequence": sequence,
        "nonce": response_nonce(message_id, sequence),
        "payloadSchemaId": RESPONSE_SCHEMA_ID,
        "payloadHash": sha256(payload),
        "payloadSizeBytes": len(canonical(payload)),
        "payload": payload,
        "artifactRefs": [],
        "result": {"status": "ok", "error": None},
    }
    return sign_value(unsigned_envelope, config)


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
        "schemaVersion": 4,
        "evaluationResultId": message["evaluationResultId"],
        "protocolId": config["protocolId"],
        "track": "contract",
        "phase": "deterministic",
        "methodId": message["methodId"],
        "datasetRole": "deterministic",
        "parentHarnessVersionId": message["parentHarnessVersionId"],
        "candidateHarnessVersionId": message["candidateHarnessVersionId"],
        "candidateFilesystemSnapshotHash": message[
            "candidateFilesystemSnapshotHash"
        ],
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
        invalid_results.append(
            {
                "id": vector["id"],
                "rejected": rejected,
                "errorCategory": vector["errorCategory"] if rejected else None,
            }
        )
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


def validate_secret_file(path: str, expected_uid: int) -> None:
    metadata = os.stat(path, follow_symlinks=False)
    if not stat.S_ISREG(metadata.st_mode):
        raise PermissionError(f"key path is not a regular file: {path}")
    if metadata.st_nlink != 1:
        raise PermissionError(f"key path is hard-linked: {path}")
    if metadata.st_uid != expected_uid:
        raise PermissionError(f"key owner mismatch: {path}")
    if stat.S_IMODE(metadata.st_mode) & 0o077:
        raise PermissionError(f"key is accessible outside its owner: {path}")


def public_key_digest(path: str, *, private: bool) -> str:
    arguments = ["/usr/bin/openssl", "pkey"]
    if not private:
        arguments.append("-pubin")
    arguments.extend(["-in", path, "-pubout", "-outform", "DER"])
    completed = subprocess.run(
        arguments,
        check=False,
        capture_output=True,
        env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
    )
    if completed.returncode != 0:
        raise ValueError(
            "key identity derivation failed: "
            + completed.stderr.decode("utf-8", errors="replace")[:1000]
        )
    return "sha256:" + hashlib.sha256(completed.stdout).hexdigest()


def is_lower_hex(value: Any, lengths: set[int]) -> bool:
    return (
        isinstance(value, str)
        and len(value) in lengths
        and all(character in "0123456789abcdef" for character in value)
    )


def verify_filesystem_snapshot(
    root: str,
    descriptor_path: str,
    expected_hash: str,
) -> str:
    descriptor_metadata = os.stat(descriptor_path, follow_symlinks=False)
    if (
        not stat.S_ISREG(descriptor_metadata.st_mode)
        or descriptor_metadata.st_nlink != 1
    ):
        raise PermissionError("filesystem snapshot descriptor is not a single regular file")
    with open(descriptor_path, "rb") as descriptor_file:
        descriptor = parse_canonical_json(descriptor_file.read())
    if not isinstance(descriptor, dict):
        raise ValueError("filesystem snapshot descriptor is not an object")
    require_exact_keys(
        descriptor,
        {
            "schemaVersion",
            "headCommit",
            "treeHash",
            "entries",
            "filesystemSnapshotHash",
        },
        "filesystem snapshot descriptor",
    )
    core = {
        key: value
        for key, value in descriptor.items()
        if key != "filesystemSnapshotHash"
    }
    if (
        descriptor.get("schemaVersion") != 1
        or not is_lower_hex(descriptor.get("headCommit"), {40, 64})
        or not is_lower_hex(descriptor.get("treeHash"), {40, 64})
        or not isinstance(expected_hash, str)
        or not expected_hash.startswith("sha256:")
        or not is_lower_hex(expected_hash.removeprefix("sha256:"), {64})
        or descriptor.get("filesystemSnapshotHash") != expected_hash
        or sha256(core) != expected_hash
        or not isinstance(descriptor.get("entries"), list)
    ):
        raise ValueError("filesystem snapshot descriptor hash mismatch")
    expected_entries: dict[str, dict[str, Any]] = {}
    expected_directories = {"."}
    previous_path: str | None = None
    for entry in descriptor["entries"]:
        if not isinstance(entry, dict):
            raise ValueError("filesystem snapshot entry is not an object")
        require_exact_keys(
            entry,
            {"path", "gitMode", "gitObjectId", "sizeBytes", "contentHash"},
            "filesystem snapshot entry",
        )
        relative = entry.get("path")
        if (
            not isinstance(relative, str)
            or relative == ""
            or relative.startswith("/")
            or "\\" in relative
            or any(part in {"", ".", ".."} for part in relative.split("/"))
            or unicodedata.normalize("NFC", relative) != relative
            or (previous_path is not None and relative <= previous_path)
            or relative in expected_entries
        ):
            raise ValueError("filesystem snapshot path is unsafe or noncanonical")
        if (
            entry.get("gitMode") not in {"100644", "100755"}
            or not isinstance(entry.get("sizeBytes"), int)
            or entry["sizeBytes"] < 0
            or entry["sizeBytes"] > 16 * 1024 * 1024
            or not is_lower_hex(entry.get("gitObjectId"), {40, 64})
            or len(entry["gitObjectId"]) != len(descriptor["headCommit"])
            or not isinstance(entry.get("contentHash"), str)
            or not entry["contentHash"].startswith("sha256:")
            or not is_lower_hex(
                entry["contentHash"].removeprefix("sha256:"), {64}
            )
        ):
            raise ValueError("filesystem snapshot entry metadata is invalid")
        expected_entries[relative] = entry
        parent = os.path.dirname(relative)
        while parent not in {"", "."}:
            expected_directories.add(parent)
            parent = os.path.dirname(parent)
        previous_path = relative
    if len(descriptor["treeHash"]) != len(descriptor["headCommit"]):
        raise ValueError("filesystem snapshot mixes Git object formats")
    root_metadata = os.stat(root, follow_symlinks=False)
    if not stat.S_ISDIR(root_metadata.st_mode):
        raise PermissionError("filesystem snapshot root is not a directory")
    observed_paths: list[str] = []
    observed_directories = {"."}
    for current_root, directories, files in os.walk(root, followlinks=False):
        for name in directories:
            directory_path = os.path.join(current_root, name)
            relative_directory = os.path.relpath(directory_path, root).replace(
                os.sep, "/"
            )
            metadata = os.stat(directory_path, follow_symlinks=False)
            if not stat.S_ISDIR(metadata.st_mode):
                raise PermissionError("snapshot contains a non-directory ancestor")
            observed_directories.add(relative_directory)
        for name in files:
            file_path = os.path.join(current_root, name)
            relative = os.path.relpath(file_path, root).replace(os.sep, "/")
            observed_paths.append(relative)
            entry = expected_entries.get(relative)
            if entry is None:
                raise PermissionError("snapshot contains an uncommitted file")
            metadata = os.stat(file_path, follow_symlinks=False)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
                raise PermissionError("snapshot contains a link or special file")
            with open(file_path, "rb") as candidate_file:
                content = candidate_file.read(16 * 1024 * 1024 + 1)
            content_hash = "sha256:" + hashlib.sha256(content).hexdigest()
            object_algorithm = (
                hashlib.sha1 if len(entry["gitObjectId"]) == 40 else hashlib.sha256
            )
            git_blob_hash = object_algorithm(
                b"blob " + str(len(content)).encode("ascii") + b"\x00" + content
            ).hexdigest()
            executable = bool(stat.S_IMODE(metadata.st_mode) & 0o111)
            if (
                len(content) != entry["sizeBytes"]
                or content_hash != entry["contentHash"]
                or git_blob_hash != entry["gitObjectId"]
                or executable != (entry["gitMode"] == "100755")
                or stat.S_IMODE(metadata.st_mode)
                != (0o500 if entry["gitMode"] == "100755" else 0o400)
            ):
                raise ValueError("snapshot file bytes or mode changed")
    if sorted(observed_paths) != sorted(expected_entries):
        raise ValueError("snapshot is missing a committed file")
    if observed_directories != expected_directories:
        raise ValueError("snapshot contains an uncommitted directory")
    return expected_hash


def peer_credentials(connection: socket.socket) -> tuple[int, int, int]:
    raw = connection.getsockopt(
        socket.SOL_SOCKET,
        socket.SO_PEERCRED,
        struct.calcsize(PEER_CREDENTIAL_FORMAT),
    )
    return struct.unpack(PEER_CREDENTIAL_FORMAT, raw)


def evaluator_loop(
    input_stream: object,
    output_stream: object,
    config: dict[str, Any],
) -> int:
    expected_sequence = 0
    response_sequence = 0
    seen_nonces: set[str] = set()
    pending: dict[str, dict[str, Any]] = {}
    while True:
        message = read_frame(input_stream)
        if message is None:
            return 0
        payload = authenticate_request_envelope(
            message, config, expected_sequence, seen_nonces
        )
        expected_sequence += 1
        operation = payload.get("operation")
        request_id = payload.get("requestId")
        if not isinstance(request_id, str):
            raise ValueError("missing request ID")
        if operation == "evaluate":
            if (
                payload["candidateFilesystemSnapshotHash"]
                != config.get("candidateFilesystemSnapshotHash")
            ):
                raise ValueError(
                    "candidate filesystem snapshot pin does not match evaluator mount"
                )
            core = build_evaluation_core(payload, config)
            core_hash = sha256(core)
            pending[request_id] = core
            write_frame(
                output_stream,
                create_response_envelope(
                    {
                        "schemaVersion": 1,
                        "operation": "evaluation_proposed",
                        "requestId": request_id,
                        "coreHash": core_hash,
                        "core": core,
                    },
                    message,
                    config,
                    response_sequence,
                ),
            )
            response_sequence += 1
        elif operation == "finalize":
            core = pending.pop(request_id, None)
            if core is None or sha256(core) != payload.get("coreHash"):
                raise ValueError("unknown or changed evaluation core")
            body = {**core, "auditLink": payload["auditLink"]}
            result = {
                **body,
                "attestation": {
                    "keyId": config["evaluatorKeyId"],
                    "algorithm": "Ed25519",
                    "signature": openssl_sign(
                        canonical(body), config["evaluatorPrivateKeyPath"]
                    ),
                },
            }
            write_frame(
                output_stream,
                create_response_envelope(
                    {
                        "schemaVersion": 1,
                        "operation": "evaluation_final",
                        "requestId": request_id,
                        "result": result,
                    },
                    message,
                    config,
                    response_sequence,
                ),
            )
            response_sequence += 1
        else:
            raise ValueError("unsupported evaluator request")


def serve_unix(arguments: argparse.Namespace) -> int:
    config_metadata = os.stat(arguments.config, follow_symlinks=False)
    if not stat.S_ISREG(config_metadata.st_mode) or config_metadata.st_nlink != 1:
        raise PermissionError("evaluator config is not a single regular file")
    with open(arguments.config, "rb") as config_file:
        config_bytes = config_file.read()
    parsed_config = parse_canonical_json(config_bytes)
    if not isinstance(parsed_config, dict):
        raise ValueError("evaluator config is not an object")
    require_exact_keys(
        parsed_config,
        {
            "evaluatorIdentity",
            "evaluatorKeyId",
            "operationsIdentity",
            "operationsKeyId",
            "protocolId",
            "candidateFilesystemSnapshotHash",
        },
        "evaluator config",
    )
    if parsed_config.get("protocolId") != arguments.protocol_id:
        raise ValueError("evaluator configuration protocol mismatch")
    if (
        not isinstance(parsed_config["protocolId"], str)
        or PROTOCOL_ID_PATTERN.fullmatch(parsed_config["protocolId"]) is None
        or not is_entity_id(parsed_config.get("evaluatorKeyId"))
        or not is_entity_id(parsed_config.get("operationsKeyId"))
    ):
        raise ValueError("evaluator configuration identity fields are invalid")
    validate_principal_identity(parsed_config["evaluatorIdentity"], "evaluator")
    validate_principal_identity(
        parsed_config["operationsIdentity"], "operations_owner"
    )
    configured_snapshot = parsed_config.get("candidateFilesystemSnapshotHash")
    if configured_snapshot is None:
        if (
            arguments.candidate_snapshot_root is not None
            or arguments.candidate_snapshot_descriptor is not None
        ):
            raise ValueError("unexpected filesystem snapshot mount")
    else:
        if (
            not isinstance(configured_snapshot, str)
            or arguments.candidate_snapshot_root is None
            or arguments.candidate_snapshot_descriptor is None
        ):
            raise ValueError("configured filesystem snapshot mount is incomplete")
        verify_filesystem_snapshot(
            arguments.candidate_snapshot_root,
            arguments.candidate_snapshot_descriptor,
            configured_snapshot,
        )
    config = {
        **parsed_config,
        "evaluatorPrivateKeyPath": arguments.private_key,
        "operationsPublicKeyPath": arguments.operations_public_key,
    }
    validate_secret_file(arguments.private_key, os.geteuid())
    public_key_metadata = os.stat(arguments.operations_public_key, follow_symlinks=False)
    if (
        not stat.S_ISREG(public_key_metadata.st_mode)
        or public_key_metadata.st_nlink != 1
    ):
        raise PermissionError("operations public key path is not a regular file")
    if (
        public_key_digest(arguments.private_key, private=True)
        != parsed_config["evaluatorIdentity"]["identityDigest"]
        or public_key_digest(arguments.operations_public_key, private=False)
        != parsed_config["operationsIdentity"]["identityDigest"]
    ):
        raise PermissionError("evaluator key material does not match pinned identities")

    try:
        os.lstat(arguments.socket)
    except FileNotFoundError:
        pass
    else:
        raise FileExistsError("evaluator socket path already exists")

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.settimeout(arguments.timeout_millis / 1000)
    try:
        server.bind(arguments.socket)
        os.chmod(arguments.socket, arguments.socket_mode)
        server.listen(1)
        connection, _address = server.accept()
        with connection:
            peer_pid, peer_uid, peer_gid = peer_credentials(connection)
            if (
                peer_uid != arguments.expected_client_uid
                or peer_gid != arguments.expected_client_gid
            ):
                raise PermissionError(
                    "operations peer credential mismatch: "
                    f"pid={peer_pid} uid={peer_uid} gid={peer_gid}"
                )
            connection.settimeout(arguments.timeout_millis / 1000)
            with connection.makefile("rb", buffering=0) as input_stream:
                with connection.makefile("wb", buffering=0) as output_stream:
                    return evaluator_loop(input_stream, output_stream, config)
    finally:
        server.close()
        try:
            os.unlink(arguments.socket)
        except FileNotFoundError:
            pass


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--canonical-corpus")
    parser.add_argument("--serve-unix", dest="socket")
    parser.add_argument("--config")
    parser.add_argument("--private-key")
    parser.add_argument("--operations-public-key")
    parser.add_argument("--candidate-snapshot-root")
    parser.add_argument("--candidate-snapshot-descriptor")
    parser.add_argument("--protocol-id")
    parser.add_argument("--expected-client-uid", type=int)
    parser.add_argument("--expected-client-gid", type=int)
    parser.add_argument("--timeout-millis", type=int, default=5_000)
    parser.add_argument("--socket-mode", type=lambda value: int(value, 8), default=0o660)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if arguments.canonical_corpus is not None:
        server_values = (
            arguments.socket,
            arguments.config,
            arguments.private_key,
            arguments.operations_public_key,
            arguments.candidate_snapshot_root,
            arguments.candidate_snapshot_descriptor,
            arguments.protocol_id,
            arguments.expected_client_uid,
            arguments.expected_client_gid,
        )
        if any(value is not None for value in server_values):
            raise ValueError("canonical corpus mode accepts no server arguments")
        return canonical_corpus_main(arguments.canonical_corpus)
    required = {
        "--serve-unix": arguments.socket,
        "--config": arguments.config,
        "--private-key": arguments.private_key,
        "--operations-public-key": arguments.operations_public_key,
        "--protocol-id": arguments.protocol_id,
        "--expected-client-uid": arguments.expected_client_uid,
        "--expected-client-gid": arguments.expected_client_gid,
    }
    missing = [name for name, value in required.items() if value is None]
    if missing:
        raise ValueError(f"missing evaluator server arguments: {missing}")
    return serve_unix(arguments)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # fail closed; stderr is captured by the supervisor.
        print(f"external evaluator failed: {error}", file=sys.stderr)
        raise SystemExit(2)
