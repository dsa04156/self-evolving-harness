#!/usr/bin/env python3
"""Signed audit release client for the development scorer gate."""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
from typing import Any


PEER_CREDENTIAL_FORMAT = "3i"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--private-key", required=True)
    parser.add_argument("--expected-server-uid", type=int, required=True)
    parser.add_argument("--expected-server-gid", type=int, required=True)
    parser.add_argument(
        "--mode",
        choices=[
            "valid",
            "replay",
            "wrong_key",
            "commitment_substitution",
            "prediction_substitution",
            "corpus_substitution",
            "seal_substitution",
        ],
        required=True,
    )
    parser.add_argument("--nonce", required=True)
    return parser.parse_args()


def canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def sign(private_key: Path, body: dict[str, Any]) -> str:
    with tempfile.TemporaryDirectory() as temporary:
        body_path = Path(temporary, "body.json")
        body_path.write_bytes(canonical(body))
        completed = subprocess.run(
            [
                "/usr/bin/openssl",
                "pkeyutl",
                "-sign",
                "-inkey",
                str(private_key),
                "-rawin",
                "-in",
                str(body_path),
            ],
            capture_output=True,
            check=False,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
        )
    if completed.returncode != 0:
        raise ValueError(
            "release signing failed: "
            + completed.stderr.decode(
                "utf-8", errors="replace"
            )[:1000]
        )
    return base64.urlsafe_b64encode(
        completed.stdout
    ).decode("ascii").rstrip("=")


def receive_json(connection: socket.socket) -> dict[str, Any]:
    header = connection.recv(4)
    if len(header) != 4:
        raise ValueError("truncated response header")
    (length,) = struct.unpack(">I", header)
    chunks: list[bytes] = []
    remaining = length
    while remaining:
        chunk = connection.recv(remaining)
        if not chunk:
            raise ValueError("truncated response body")
        chunks.append(chunk)
        remaining -= len(chunk)
    value = json.loads(b"".join(chunks))
    if not isinstance(value, dict):
        raise ValueError("response is not an object")
    return value


def main() -> int:
    arguments = parse_arguments()
    with Path(arguments.config).open(encoding="utf-8") as source:
        config = json.load(source)
    body = {
        "schemaVersion": 1,
        "requestId": f"development-score-release.{arguments.mode}",
        "nonce": arguments.nonce,
        "sealRecordHash": config["sealRecordHash"],
        "predictionCommitmentHash": config[
            "predictionCommitmentHash"
        ],
        "predictionSetHash": config["predictionSetHash"],
        "corpusHash": config["corpusHash"],
        "issuedAt": "2026-07-31T13:04:00.000Z",
    }
    substitutions = {
        "commitment_substitution": "predictionCommitmentHash",
        "prediction_substitution": "predictionSetHash",
        "corpus_substitution": "corpusHash",
        "seal_substitution": "sealRecordHash",
    }
    substituted = substitutions.get(arguments.mode)
    if substituted is not None:
        body[substituted] = (
            "sha256:" + arguments.mode[0] * 64
        )
    signature = sign(Path(arguments.private_key), body)
    if arguments.mode == "wrong_key":
        signature = (
            ("A" if signature[0] != "A" else "B")
            + signature[1:]
        )
    request = {
        "body": body,
        "keyId": config["auditKeyId"],
        "signature": signature,
    }
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.settimeout(10)
    connection.connect(arguments.socket)
    raw = connection.getsockopt(
        socket.SOL_SOCKET,
        socket.SO_PEERCRED,
        struct.calcsize(PEER_CREDENTIAL_FORMAT),
    )
    peer_pid, peer_uid, peer_gid = struct.unpack(
        PEER_CREDENTIAL_FORMAT, raw
    )
    if (
        peer_uid != arguments.expected_server_uid
        or peer_gid != arguments.expected_server_gid
    ):
        raise PermissionError(
            "scorer server peer credential mismatch: "
            f"pid={peer_pid} uid={peer_uid} gid={peer_gid}"
        )
    payload = canonical(request)
    connection.sendall(struct.pack(">I", len(payload)) + payload)
    response = receive_json(connection)
    connection.close()
    print(canonical(response).decode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
