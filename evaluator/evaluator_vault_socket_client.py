#!/usr/bin/env python3
"""SO_PEERCRED-verifying client for the body-free vault gate."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import socket
import struct
from typing import Any


MAX_FRAME_BYTES = 1_048_576
PEER_CREDENTIAL_FORMAT = "3i"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--request", required=True)
    parser.add_argument("--expected-server-uid", type=int, required=True)
    parser.add_argument("--expected-server-gid", type=int, required=True)
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
            raise ValueError("truncated response")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def receive_json(connection: socket.socket) -> dict[str, Any]:
    (length,) = struct.unpack(">I", read_exact(connection, 4))
    if length < 2 or length > MAX_FRAME_BYTES:
        raise ValueError("invalid response frame length")
    value = json.loads(read_exact(connection, length))
    if not isinstance(value, dict):
        raise ValueError("response is not an object")
    return value


def main() -> int:
    arguments = parse_arguments()
    with Path(arguments.request).open(encoding="utf-8") as source:
        request = json.load(source)
    if not isinstance(request, dict):
        raise ValueError("request is not an object")
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.settimeout(70)
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
            "vault server peer mismatch: "
            f"pid={peer_pid} uid={peer_uid} gid={peer_gid}"
        )
    body = canonical(request)
    connection.sendall(struct.pack(">I", len(body)) + body)
    response = receive_json(connection)
    connection.close()
    response["verifiedServerPeer"] = {
        "pid": peer_pid,
        "uid": peer_uid,
        "gid": peer_gid,
    }
    print(canonical(response).decode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
