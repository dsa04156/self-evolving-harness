#!/usr/bin/env python3
"""OS-enforced development scorer release gate.

The scorer socket is created only after a durable audit-signed prediction seal
exists. Each request is authenticated with SO_PEERCRED plus an Ed25519 audit
signature, is bound to the exact sealed prediction/corpus tuple, and consumes a
nonce before the scorer worker can access the visible-fixture oracle.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import struct
import subprocess
import tempfile
from typing import Any


MAX_FRAME_BYTES = 1_048_576
PEER_CREDENTIAL_FORMAT = "3i"
REQUEST_FIELDS = {
    "schemaVersion",
    "requestId",
    "nonce",
    "sealRecordHash",
    "predictionCommitmentHash",
    "predictionSetHash",
    "corpusHash",
    "issuedAt",
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--audit-public-key", required=True)
    parser.add_argument("--state-directory", required=True)
    parser.add_argument("--seal", required=True)
    parser.add_argument("--max-requests", type=int, required=True)
    parser.add_argument("--worker-command", nargs="+", required=True)
    return parser.parse_args()


def canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def read_exact(connection: socket.socket, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = connection.recv(remaining)
        if not chunk:
            raise ValueError("truncated frame")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def receive_json(connection: socket.socket) -> dict[str, Any]:
    (length,) = struct.unpack(">I", read_exact(connection, 4))
    if length < 2 or length > MAX_FRAME_BYTES:
        raise ValueError("invalid frame length")
    value = json.loads(read_exact(connection, length))
    if not isinstance(value, dict):
        raise ValueError("request is not an object")
    return value


def send_json(connection: socket.socket, value: dict[str, Any]) -> None:
    body = canonical(value)
    connection.sendall(struct.pack(">I", len(body)) + body)


def peer_credentials(connection: socket.socket) -> tuple[int, int, int]:
    raw = connection.getsockopt(
        socket.SOL_SOCKET,
        socket.SO_PEERCRED,
        struct.calcsize(PEER_CREDENTIAL_FORMAT),
    )
    return struct.unpack(PEER_CREDENTIAL_FORMAT, raw)


def decode_signature(value: str) -> bytes:
    if not isinstance(value, str) or not (80 <= len(value) <= 128):
        raise ValueError("malformed signature")
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def verify_signature(
    public_key: Path,
    body: dict[str, Any],
    signature: str,
    state_directory: Path,
) -> None:
    with tempfile.TemporaryDirectory(dir=state_directory) as temporary:
        body_path = Path(temporary, "body.json")
        signature_path = Path(temporary, "signature.bin")
        body_path.write_bytes(canonical(body))
        signature_path.write_bytes(decode_signature(signature))
        completed = subprocess.run(
            [
                "/usr/bin/openssl",
                "pkeyutl",
                "-verify",
                "-pubin",
                "-inkey",
                str(public_key),
                "-rawin",
                "-in",
                str(body_path),
                "-sigfile",
                str(signature_path),
            ],
            capture_output=True,
            check=False,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
        )
    if completed.returncode != 0:
        raise PermissionError("invalid audit signature")


def require_durable_seal(
    seal_path: Path,
    config: dict[str, Any],
) -> dict[str, Any]:
    metadata = os.stat(seal_path, follow_symlinks=False)
    if not stat.S_ISREG(metadata.st_mode):
        raise PermissionError("prediction seal is not a regular file")
    with seal_path.open(encoding="utf-8") as source:
        seal = json.load(source)
    expected = {
        "recordHash": config["sealRecordHash"],
        "predictionCommitmentHash": config[
            "predictionCommitmentHash"
        ],
        "predictionSetHash": config["predictionSetHash"],
        "corpusHash": config["corpusHash"],
        "commitmentVerified": True,
        "scorerReleaseAllowed": True,
        "developmentOnly": True,
        "authorizedForResearchEvidence": False,
    }
    for field, value in expected.items():
        if seal.get(field) != value:
            raise PermissionError(
                f"prediction seal binding mismatch: {field}"
            )
    if seal.get("durability") != {
        "appendMode": "exclusive_create",
        "fileSyncRequired": True,
        "directorySyncRequired": True,
    }:
        raise PermissionError("prediction seal durability contract missing")
    return seal


def validate_request(
    request: dict[str, Any],
    config: dict[str, Any],
    audit_public_key: Path,
    state_directory: Path,
) -> dict[str, Any]:
    if set(request) != {"body", "keyId", "signature"}:
        raise ValueError("request envelope fields changed")
    body = request["body"]
    if not isinstance(body, dict) or set(body) != REQUEST_FIELDS:
        raise ValueError("request body fields changed")
    if body["schemaVersion"] != 1:
        raise ValueError("request schema version changed")
    if request["keyId"] != config["auditKeyId"]:
        raise PermissionError("wrong audit key id")
    verify_signature(
        audit_public_key,
        body,
        request["signature"],
        state_directory,
    )
    for field in (
        "sealRecordHash",
        "predictionCommitmentHash",
        "predictionSetHash",
        "corpusHash",
    ):
        if body[field] != config[field]:
            raise PermissionError(f"release binding mismatch: {field}")
    nonce = body["nonce"]
    if (
        not isinstance(nonce, str)
        or len(nonce) < 16
        or len(nonce) > 160
    ):
        raise ValueError("invalid release nonce")
    replay_directory = Path(state_directory, "replay")
    replay_directory.mkdir(mode=0o700, exist_ok=True)
    replay_path = replay_directory / hashlib.sha256(
        nonce.encode("utf-8")
    ).hexdigest()
    descriptor = os.open(
        replay_path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600,
    )
    try:
        os.write(descriptor, canonical(body))
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    directory_descriptor = os.open(
        replay_directory,
        os.O_RDONLY | os.O_DIRECTORY,
    )
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
    return body


def run_worker(command: list[str], state_directory: Path) -> dict[str, Any]:
    report_path = state_directory / "score-report.json"
    if not report_path.exists():
        completed = subprocess.run(
            command,
            capture_output=True,
            check=False,
            timeout=60,
            env={
                "PATH": "/usr/bin:/bin",
                "LANG": "C.UTF-8",
                "LC_ALL": "C.UTF-8",
                "TZ": "UTC",
            },
        )
        if completed.returncode != 0:
            raise RuntimeError(
                "scorer worker failed: "
                + completed.stderr.decode(
                    "utf-8", errors="replace"
                )[:2000]
            )
    with report_path.open(encoding="utf-8") as source:
        report = json.load(source)
    return {
        "accepted": True,
        "reportHash": report["reportHash"],
        "claimAuthorized": False,
        "promotionAuthorized": False,
    }


def main() -> int:
    arguments = parse_arguments()
    socket_path = Path(arguments.socket)
    config_path = Path(arguments.config)
    state_directory = Path(arguments.state_directory)
    seal_path = Path(arguments.seal)
    state_directory.mkdir(mode=0o700, exist_ok=True)
    with config_path.open(encoding="utf-8") as source:
        config = json.load(source)

    # This check intentionally occurs before bind(2): no signed durable seal,
    # no scorer socket and therefore no oracle-input capability.
    require_durable_seal(seal_path, config)
    socket_path.unlink(missing_ok=True)
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(socket_path))
    os.chmod(socket_path, 0o666)
    server.listen(8)
    try:
        for ordinal in range(arguments.max_requests):
            connection, _address = server.accept()
            with connection:
                try:
                    peer_pid, peer_uid, peer_gid = peer_credentials(
                        connection
                    )
                    if (
                        peer_uid != config["expectedAuditUid"]
                        or peer_gid != config["expectedAuditGid"]
                    ):
                        raise PermissionError(
                            "audit peer credential mismatch: "
                            f"pid={peer_pid} uid={peer_uid} gid={peer_gid}"
                        )
                    request = receive_json(connection)
                    validate_request(
                        request,
                        config,
                        Path(arguments.audit_public_key),
                        state_directory,
                    )
                    response = run_worker(
                        arguments.worker_command,
                        state_directory,
                    )
                    response["requestOrdinal"] = ordinal
                    send_json(connection, response)
                except FileExistsError:
                    send_json(
                        connection,
                        {
                            "accepted": False,
                            "errorCode": "REPLAY_REJECTED",
                        },
                    )
                except Exception as error:
                    send_json(
                        connection,
                        {
                            "accepted": False,
                            "errorCode": type(error).__name__,
                        },
                    )
    finally:
        server.close()
        socket_path.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"development score gate failed: {error}", file=os.sys.stderr)
        raise SystemExit(2)
