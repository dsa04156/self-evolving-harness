#!/usr/bin/env python3
"""Operations-side byte relay for an authenticated evaluator Unix socket.

The relay is intentionally message-agnostic.  It verifies the kernel-reported
server credentials before forwarding length-prefixed frames.  Envelope,
signature, role, replay, and schema validation remain end-to-end between the
TypeScript operations client and the Python evaluator.
"""

from __future__ import annotations

import argparse
import os
import socket
import struct
import sys


MAX_FRAME_BYTES = 1_048_576
PEER_CREDENTIAL_FORMAT = "3i"


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


def read_frame(stream: object) -> bytes | None:
    header = read_exact(stream, 4)
    if header is None:
        return None
    (length,) = struct.unpack(">I", header)
    if length < 2 or length > MAX_FRAME_BYTES:
        raise ValueError("invalid frame size")
    body = read_exact(stream, length)
    if body is None:
        raise ValueError("truncated frame body")
    return header + body


def peer_credentials(connection: socket.socket) -> tuple[int, int, int]:
    raw = connection.getsockopt(
        socket.SOL_SOCKET,
        socket.SO_PEERCRED,
        struct.calcsize(PEER_CREDENTIAL_FORMAT),
    )
    return struct.unpack(PEER_CREDENTIAL_FORMAT, raw)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--expected-server-uid", required=True, type=int)
    parser.add_argument("--expected-server-gid", required=True, type=int)
    parser.add_argument("--ready-fd", type=int)
    parser.add_argument("--timeout-millis", default=5_000, type=int)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.settimeout(arguments.timeout_millis / 1000)
    connection.connect(arguments.socket)
    peer_pid, peer_uid, peer_gid = peer_credentials(connection)
    if (
        peer_uid != arguments.expected_server_uid
        or peer_gid != arguments.expected_server_gid
    ):
        raise PermissionError(
            "evaluator peer credential mismatch: "
            f"pid={peer_pid} uid={peer_uid} gid={peer_gid}"
        )

    if arguments.ready_fd is not None:
        with os.fdopen(arguments.ready_fd, "wb", closefd=True) as ready:
            ready.write(f"READY {peer_pid} {peer_uid} {peer_gid}\n".encode("ascii"))
            ready.flush()

    input_stream = sys.stdin.buffer
    output_stream = sys.stdout.buffer
    with connection:
        with connection.makefile("rb", buffering=0) as socket_input:
            while True:
                request = read_frame(input_stream)
                if request is None:
                    connection.shutdown(socket.SHUT_WR)
                    return 0
                connection.sendall(request)
                response = read_frame(socket_input)
                if response is None:
                    raise ConnectionError("evaluator closed before responding")
                output_stream.write(response)
                output_stream.flush()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"evaluator relay failed: {error}", file=sys.stderr)
        raise SystemExit(2)
