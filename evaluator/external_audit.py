#!/usr/bin/env python3
"""Authenticated append-only audit service for the OS-principal Gate-2 path."""

from __future__ import annotations

import argparse
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import re
import socket
import stat
import struct
import subprocess
import tempfile
from typing import Any


MAX_FRAME_BYTES = 1_048_576
WIRE_PROTOCOL_VERSION = "seh-wire/1"
WIRE_SCHEMA_ID = (
    "https://self-evolving-harness.local/schemas/wire-envelope.schema.json"
)
REQUEST_SCHEMA_ID = (
    "https://self-evolving-harness.local/schemas/"
    "audit-request-payload.schema.json"
)
RESPONSE_SCHEMA_ID = (
    "https://self-evolving-harness.local/schemas/"
    "audit-response-payload.schema.json"
)
PEER_CREDENTIAL_FORMAT = "3i"
LOG_ID = "audit.main"
ENTITY_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,159}$")
SHA256_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
PROTOCOL_ID_PATTERN = re.compile(r"^protocol-sha256:[a-f0-9]{64}$")
SIGNATURE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{80,128}$")
UTC_TIMESTAMP_PATTERN = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T"
    r"[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$"
)


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


def canonical(value: Any) -> bytes:
    validate_i_json(value)
    return canonical_text(value).encode("utf-8")


def sha256(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical(value)).hexdigest()


def b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


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
        raise ValueError("signature verification failed")


def openssl_sign(body: bytes, private_key: str) -> str:
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
                private_key,
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
            "audit signature failed: "
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


def write_frame(stream: object, value: dict[str, Any]) -> None:
    body = canonical(value)
    if len(body) > MAX_FRAME_BYTES:
        raise ValueError("response frame too large")
    stream.write(struct.pack(">I", len(body)))  # type: ignore[attr-defined]
    stream.write(body)  # type: ignore[attr-defined]
    stream.flush()  # type: ignore[attr-defined]


def require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise ValueError(f"{label} keys mismatch")


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
        or PROTOCOL_ID_PATTERN.fullmatch(value["protocolId"]) is None
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
        raise ValueError("audit link violates the closed schema")


def validate_subject(value: Any, label: str) -> None:
    if not isinstance(value, dict):
        raise ValueError(f"{label} is not an object")
    require_exact_keys(
        value, {"subjectType", "subjectId", "subjectHash"}, label
    )
    if (
        not isinstance(value.get("subjectType"), str)
        or not 1 <= len(value["subjectType"]) <= 128
        or not isinstance(value.get("subjectId"), str)
        or not 1 <= len(value["subjectId"]) <= 256
        or not isinstance(value.get("subjectHash"), str)
        or SHA256_PATTERN.fullmatch(value["subjectHash"]) is None
    ):
        raise ValueError(f"{label} violates the closed schema")


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


def unsigned(message: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in message.items() if key != "attestation"}


def validate_request_payload(payload: dict[str, Any]) -> None:
    operation = payload.get("operation")
    common = {"schemaVersion", "operation", "requestId"}
    if operation == "append_subject":
        require_exact_keys(
            payload,
            common | {"subjectType", "subjectId", "subjectHash"},
            "append payload",
        )
        validate_subject(
            {
                "subjectType": payload.get("subjectType"),
                "subjectId": payload.get("subjectId"),
                "subjectHash": payload.get("subjectHash"),
            },
            "audit subject",
        )
    elif operation == "verify_link":
        require_exact_keys(payload, common | {"link", "expected"}, "verify payload")
        validate_audit_link(payload.get("link"))
        validate_subject(payload.get("expected"), "expected audit subject")
    elif operation == "verify_all":
        require_exact_keys(payload, common, "verify-all payload")
    else:
        raise ValueError("unsupported audit operation")
    if payload.get("schemaVersion") != 1 or not is_entity_id(
        payload.get("requestId")
    ):
        raise ValueError("invalid audit payload version or request ID")


def authenticate_request(
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
        message.get("recipientRole") != "audit_store"
        or message.get("messageType") != "audit.append"
        or message.get("sender") != config["operationsIdentity"]
        or message.get("payloadSchemaId") != REQUEST_SCHEMA_ID
    ):
        raise ValueError("audit request identity, role, or schema mismatch")
    if (
        not is_integer(message.get("senderSequence"))
        or message.get("senderSequence") != expected_sequence
        or not isinstance(message.get("nonce"), str)
        or re.fullmatch(r"[A-Za-z0-9_-]{22,64}", message["nonce"]) is None
        or message["nonce"] in seen_nonces
    ):
        raise ValueError("audit request replay or sequence mismatch")
    sent_at = parse_timestamp(message.get("sentAt"), "sentAt")
    expires_at = parse_timestamp(message.get("expiresAt"), "expiresAt")
    now = datetime.now(timezone.utc)
    if (
        sent_at > now + timedelta(seconds=5)
        or expires_at < now
        or expires_at <= sent_at
        or expires_at > sent_at + timedelta(seconds=30)
    ):
        raise ValueError("audit request deadline invalid")
    payload = message.get("payload")
    if (
        not isinstance(payload, dict)
        or message.get("payloadHash") != sha256(payload)
        or message.get("payloadSizeBytes") != len(canonical(payload))
        or not is_integer(message.get("payloadSizeBytes"), 2, MAX_FRAME_BYTES)
        or message.get("artifactRefs") != []
        or message.get("result") != {"status": "request", "error": None}
    ):
        raise ValueError("audit request payload commitment mismatch")
    attestation = message.get("attestation")
    if (
        not isinstance(attestation, dict)
    ):
        raise ValueError("audit request attestation mismatch")
    require_exact_keys(
        attestation, {"keyId", "algorithm", "signature"}, "attestation"
    )
    if (
        attestation.get("keyId") != config["operationsKeyId"]
        or attestation.get("algorithm") != "Ed25519"
        or not isinstance(attestation.get("signature"), str)
        or SIGNATURE_PATTERN.fullmatch(attestation["signature"]) is None
    ):
        raise ValueError("audit request attestation mismatch")
    openssl_verify(
        config["operationsPublicKeyPath"],
        canonical(unsigned(message)),
        attestation["signature"],
    )
    validate_request_payload(payload)
    if message["correlationId"] != payload["requestId"]:
        raise ValueError("audit correlation does not bind its request ID")
    seen_nonces.add(message["nonce"])
    return payload


def create_response(
    payload: dict[str, Any],
    request: dict[str, Any],
    config: dict[str, Any],
    sequence: int,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    sent_at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    expires_at = (now + timedelta(seconds=5)).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")
    nonce = b64url_encode(
        hashlib.sha256(
            f"{request['messageId']}:{sequence}:audit".encode("utf-8")
        ).digest()
    )[:32]
    body = {
        "schemaVersion": 1,
        "wireProtocolVersion": WIRE_PROTOCOL_VERSION,
        "protocolId": config["protocolId"],
        "messageId": f"audit-response-{sequence}",
        "correlationId": request["correlationId"],
        "causationId": request["messageId"],
        "sender": config["auditIdentity"],
        "recipientRole": "operations_owner",
        "messageType": "audit.acknowledge",
        "sentAt": sent_at,
        "expiresAt": expires_at,
        "senderSequence": sequence,
        "nonce": nonce,
        "payloadSchemaId": RESPONSE_SCHEMA_ID,
        "payloadHash": sha256(payload),
        "payloadSizeBytes": len(canonical(payload)),
        "payload": payload,
        "artifactRefs": [],
        "result": {"status": "ok", "error": None},
    }
    return {
        **body,
        "attestation": {
            "keyId": config["auditKeyId"],
            "algorithm": "Ed25519",
            "signature": openssl_sign(
                canonical(body), config["auditPrivateKeyPath"]
            ),
        },
    }


def validate_secret(path: str, expected_uid: int) -> None:
    metadata = os.stat(path, follow_symlinks=False)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != expected_uid
        or metadata.st_nlink != 1
        or stat.S_IMODE(metadata.st_mode) & 0o077
    ):
        raise PermissionError("audit key ownership or mode is invalid")


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


def record_digest(core: dict[str, Any]) -> str:
    entry = core.get("entry")
    if not isinstance(entry, dict):
        raise ValueError("audit record entry is missing")
    attestation = entry.get("attestation")
    if not isinstance(attestation, dict):
        raise ValueError("audit entry attestation is missing")
    hashable_entry = {
        **entry,
        "attestation": {
            key: value
            for key, value in attestation.items()
            if key != "signature"
        },
    }
    return sha256({**core, "entry": hashable_entry})


def read_records(log_path: str, config: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        metadata = os.stat(log_path, follow_symlinks=False)
    except FileNotFoundError:
        return []
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != os.geteuid()
        or metadata.st_nlink != 1
        or stat.S_IMODE(metadata.st_mode) & 0o077
    ):
        raise PermissionError("audit log ownership or file type is invalid")
    records: list[dict[str, Any]] = []
    previous_hash: str | None = None
    with open(log_path, "rb") as log_file:
        for line in log_file:
            if not line.endswith(b"\n"):
                raise ValueError("truncated audit log line")
            record = parse_canonical_json(line[:-1])
            if not isinstance(record, dict):
                raise ValueError("audit record is not an object")
            core = {key: value for key, value in record.items() if key != "recordHash"}
            if (
                record.get("schemaVersion") != 1
                or record.get("sequence") != len(records)
                or record.get("previousRecordHash") != previous_hash
                or record.get("recordHash") != record_digest(core)
            ):
                raise ValueError("audit record chain mismatch")
            entry = record.get("entry")
            if not isinstance(entry, dict):
                raise ValueError("audit entry is not an object")
            attestation = entry.get("attestation")
            if not isinstance(attestation, dict):
                raise ValueError("audit entry attestation is missing")
            openssl_verify(
                config["auditPublicKeyPath"],
                canonical(unsigned(entry)),
                attestation.get("signature", ""),
            )
            if (
                entry.get("protocolId") != config["protocolId"]
                or entry.get("logId") != LOG_ID
                or entry.get("producer") != config["auditIdentity"]
                or attestation.get("keyId") != config["auditKeyId"]
            ):
                raise ValueError("audit entry identity mismatch")
            records.append(record)
            previous_hash = record["recordHash"]
    return records


def append_subject(
    payload: dict[str, Any],
    request: dict[str, Any],
    log_path: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    records = read_records(log_path, config)
    for record in records:
        entry = record["entry"]
        if (
            entry["subjectType"] == payload["subjectType"]
            and entry["subjectId"] == payload["subjectId"]
        ):
            if entry["subjectHash"] != payload["subjectHash"]:
                raise ValueError("audit subject ID was reused with another hash")
            return {
                "protocolId": config["protocolId"],
                "logId": LOG_ID,
                "sequence": record["sequence"],
                "recordHash": record["recordHash"],
                "previousRecordHash": record["previousRecordHash"],
            }
    entry_core = {
        "schemaVersion": 1,
        "entryId": "audit-entry-" + hashlib.sha256(
            f"{payload['subjectType']}:{payload['subjectId']}".encode("utf-8")
        ).hexdigest(),
        "protocolId": config["protocolId"],
        "logId": LOG_ID,
        "subjectType": payload["subjectType"],
        "subjectId": payload["subjectId"],
        "subjectHash": payload["subjectHash"],
        "producer": config["auditIdentity"],
        "recordedAt": request["sentAt"],
    }
    entry = {
        **entry_core,
        "attestation": {
            "keyId": config["auditKeyId"],
            "algorithm": "Ed25519",
            "signature": openssl_sign(
                canonical(entry_core), config["auditPrivateKeyPath"]
            ),
        },
    }
    previous_hash = records[-1]["recordHash"] if records else None
    record_core = {
        "schemaVersion": 1,
        "sequence": len(records),
        "previousRecordHash": previous_hash,
        "entry": entry,
    }
    record = {**record_core, "recordHash": record_digest(record_core)}
    descriptor = os.open(
        log_path,
        os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_CLOEXEC | os.O_NOFOLLOW,
        0o600,
    )
    try:
        pending = memoryview(canonical(record) + b"\n")
        while pending:
            written = os.write(descriptor, pending)
            if written <= 0:
                raise OSError("audit append made no progress")
            pending = pending[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    directory_descriptor = os.open(
        os.path.dirname(log_path),
        os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC,
    )
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
    return {
        "protocolId": config["protocolId"],
        "logId": LOG_ID,
        "sequence": record["sequence"],
        "recordHash": record["recordHash"],
        "previousRecordHash": previous_hash,
    }


def verify_link(
    link: dict[str, Any],
    expected: dict[str, Any],
    records: list[dict[str, Any]],
    config: dict[str, Any],
) -> None:
    if (
        link.get("protocolId") != config["protocolId"]
        or link.get("logId") != LOG_ID
        or not isinstance(link.get("sequence"), int)
        or link["sequence"] < 0
        or link["sequence"] >= len(records)
    ):
        raise ValueError("audit link identity or sequence mismatch")
    record = records[link["sequence"]]
    entry = record["entry"]
    if (
        link.get("recordHash") != record["recordHash"]
        or link.get("previousRecordHash") != record["previousRecordHash"]
        or entry.get("subjectType") != expected.get("subjectType")
        or entry.get("subjectId") != expected.get("subjectId")
        or entry.get("subjectHash") != expected.get("subjectHash")
    ):
        raise ValueError("audit link subject mismatch")


def service_loop(
    input_stream: object,
    output_stream: object,
    config: dict[str, Any],
    log_path: str,
) -> int:
    expected_sequence = 0
    response_sequence = 0
    seen_nonces: set[str] = set()
    while True:
        request = read_frame(input_stream)
        if request is None:
            return 0
        payload = authenticate_request(
            request, config, expected_sequence, seen_nonces
        )
        expected_sequence += 1
        operation = payload["operation"]
        if operation == "append_subject":
            link = append_subject(payload, request, log_path, config)
            response_payload = {
                "schemaVersion": 1,
                "operation": "audit_link",
                "requestId": payload["requestId"],
                "link": link,
            }
        elif operation == "verify_link":
            records = read_records(log_path, config)
            verify_link(payload["link"], payload["expected"], records, config)
            response_payload = {
                "schemaVersion": 1,
                "operation": "verified",
                "requestId": payload["requestId"],
            }
        else:
            read_records(log_path, config)
            response_payload = {
                "schemaVersion": 1,
                "operation": "verified",
                "requestId": payload["requestId"],
            }
        write_frame(
            output_stream,
            create_response(
                response_payload, request, config, response_sequence
            ),
        )
        response_sequence += 1


def peer_credentials(connection: socket.socket) -> tuple[int, int, int]:
    raw = connection.getsockopt(
        socket.SOL_SOCKET,
        socket.SO_PEERCRED,
        struct.calcsize(PEER_CREDENTIAL_FORMAT),
    )
    return struct.unpack(PEER_CREDENTIAL_FORMAT, raw)


def serve(arguments: argparse.Namespace) -> int:
    config_metadata = os.stat(arguments.config, follow_symlinks=False)
    if not stat.S_ISREG(config_metadata.st_mode) or config_metadata.st_nlink != 1:
        raise PermissionError("audit config is not a single regular file")
    with open(arguments.config, "rb") as config_file:
        parsed = parse_canonical_json(config_file.read())
    if not isinstance(parsed, dict) or parsed.get("protocolId") != arguments.protocol_id:
        raise ValueError("audit configuration protocol mismatch")
    require_exact_keys(
        parsed,
        {
            "auditIdentity",
            "auditKeyId",
            "operationsIdentity",
            "operationsKeyId",
            "protocolId",
        },
        "audit config",
    )
    if (
        not isinstance(parsed["protocolId"], str)
        or PROTOCOL_ID_PATTERN.fullmatch(parsed["protocolId"]) is None
        or not is_entity_id(parsed.get("auditKeyId"))
        or not is_entity_id(parsed.get("operationsKeyId"))
    ):
        raise ValueError("audit configuration identity fields are invalid")
    validate_principal_identity(parsed["auditIdentity"], "audit_store")
    validate_principal_identity(
        parsed["operationsIdentity"], "operations_owner"
    )
    config = {
        **parsed,
        "auditPrivateKeyPath": arguments.private_key,
        "auditPublicKeyPath": arguments.audit_public_key,
        "operationsPublicKeyPath": arguments.operations_public_key,
    }
    validate_secret(arguments.private_key, os.geteuid())
    for public_key in (
        arguments.audit_public_key,
        arguments.operations_public_key,
    ):
        metadata = os.stat(public_key, follow_symlinks=False)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
            raise PermissionError("audit public key path is not a regular file")
    if (
        public_key_digest(arguments.private_key, private=True)
        != parsed["auditIdentity"]["identityDigest"]
        or public_key_digest(arguments.audit_public_key, private=False)
        != parsed["auditIdentity"]["identityDigest"]
        or public_key_digest(arguments.operations_public_key, private=False)
        != parsed["operationsIdentity"]["identityDigest"]
    ):
        raise PermissionError("audit key material does not match pinned identities")
    os.makedirs(arguments.log_directory, mode=0o700, exist_ok=True)
    directory_metadata = os.stat(arguments.log_directory, follow_symlinks=False)
    if (
        directory_metadata.st_uid != os.geteuid()
        or not stat.S_ISDIR(directory_metadata.st_mode)
        or stat.S_IMODE(directory_metadata.st_mode) & 0o077
    ):
        raise PermissionError("audit log directory ownership or mode is invalid")
    log_path = os.path.join(arguments.log_directory, "audit.log")
    try:
        os.lstat(arguments.socket)
    except FileNotFoundError:
        pass
    else:
        raise FileExistsError("audit socket path already exists")
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
                    return service_loop(input_stream, output_stream, config, log_path)
    finally:
        server.close()
        try:
            os.unlink(arguments.socket)
        except FileNotFoundError:
            pass


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
    valid_results = [
        {
            "id": vector["id"],
            "canonical": canonical(vector["value"]).decode("utf-8"),
            "sha256": sha256(vector["value"]),
        }
        for vector in corpus.get("valid", [])
    ]
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
    os.sys.stdout.buffer.write(
        canonical(
            {
                "profile": "seh-c14n-int-v1",
                "valid": valid_results,
                "invalid": invalid_results,
            }
        )
        + b"\n"
    )
    return 0


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--canonical-corpus")
    parser.add_argument("--serve-unix", dest="socket")
    parser.add_argument("--config")
    parser.add_argument("--private-key")
    parser.add_argument("--audit-public-key")
    parser.add_argument("--operations-public-key")
    parser.add_argument("--protocol-id")
    parser.add_argument("--log-directory")
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
            arguments.audit_public_key,
            arguments.operations_public_key,
            arguments.protocol_id,
            arguments.log_directory,
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
        "--audit-public-key": arguments.audit_public_key,
        "--operations-public-key": arguments.operations_public_key,
        "--protocol-id": arguments.protocol_id,
        "--log-directory": arguments.log_directory,
        "--expected-client-uid": arguments.expected_client_uid,
        "--expected-client-gid": arguments.expected_client_gid,
    }
    missing = [name for name, value in required.items() if value is None]
    if missing:
        raise ValueError(f"missing audit server arguments: {missing}")
    return serve(arguments)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"external audit failed: {error}", file=os.sys.stderr)
        raise SystemExit(2)
