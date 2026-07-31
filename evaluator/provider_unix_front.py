#!/usr/bin/env python3
"""SO_PEERCRED gate and byte relay for the provider-proxy principal.

The child process owns the signed provider protocol, credential, and upstream
transport. This front only authenticates the runtime UID/GID and relays one
canonical length-prefixed request/response exchange. If the runtime disconnects,
the child process group is terminated so provider authority cannot outlive the
requesting channel.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import signal
import socket
import struct
import subprocess
import sys
from typing import BinaryIO


MAX_FRAME_BYTES = 1_048_576
PEER_CREDENTIAL_FORMAT = "3i"


def parse_arguments() -> tuple[argparse.Namespace, list[str]]:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--expected-client-uid", required=True, type=int)
    parser.add_argument("--expected-client-gid", required=True, type=int)
    parser.add_argument("--timeout-millis", default=30_000, type=int)
    parser.add_argument("--socket-mode", default="660")
    arguments, command = parser.parse_known_args()
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        parser.error("a fixed provider service command is required after --")
    return arguments, command


def read_exact(stream: BinaryIO, size: int) -> bytes | None:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = stream.read(remaining)
        if chunk == b"":
            if remaining == size:
                return None
            raise ValueError("truncated provider frame")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def read_frame(stream: BinaryIO) -> bytes | None:
    header = read_exact(stream, 4)
    if header is None:
        return None
    (length,) = struct.unpack(">I", header)
    if length < 2 or length > MAX_FRAME_BYTES:
        raise ValueError("invalid provider frame size")
    body = read_exact(stream, length)
    if body is None:
        raise ValueError("truncated provider frame body")
    return header + body


def peer_credentials(
    connection: socket.socket,
) -> tuple[int, int, int]:
    raw = connection.getsockopt(
        socket.SOL_SOCKET,
        socket.SO_PEERCRED,
        struct.calcsize(PEER_CREDENTIAL_FORMAT),
    )
    return struct.unpack(PEER_CREDENTIAL_FORMAT, raw)


def terminate_group(child: subprocess.Popen[bytes]) -> None:
    if child.poll() is not None:
        return
    try:
        os.killpg(child.pid, signal.SIGTERM)
        child.wait(timeout=0.5)
        return
    except (ProcessLookupError, subprocess.TimeoutExpired):
        pass
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    child.wait(timeout=2)


def exchange(
    connection: socket.socket,
    command: list[str],
    timeout_seconds: float,
) -> None:
    child = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
        close_fds=True,
    )
    assert child.stdin is not None
    assert child.stdout is not None
    assert child.stderr is not None
    connection.settimeout(timeout_seconds)
    try:
        with connection.makefile("rb", buffering=0) as socket_input:
            request = read_frame(socket_input)
            if request is None:
                raise ConnectionError("runtime disconnected before request")
            child.stdin.write(request)
            child.stdin.flush()
            child.stdin.close()
            response = read_frame(child.stdout)
            if response is None:
                stderr = child.stderr.read(4096)
                raise ConnectionError(
                    "provider service closed without response: "
                    + stderr.decode("utf-8", errors="replace")
                )
            connection.sendall(response)
            exit_code = child.wait(timeout=timeout_seconds)
            if exit_code != 0:
                raise RuntimeError("provider service exited unsuccessfully")
    finally:
        terminate_group(child)


def main() -> int:
    arguments, command = parse_arguments()
    socket_path = Path(arguments.socket)
    socket_path.unlink(missing_ok=True)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        listener.bind(str(socket_path))
        os.chmod(socket_path, int(arguments.socket_mode, 8))
        listener.listen(1)
        listener.settimeout(arguments.timeout_millis / 1000)
        connection, _address = listener.accept()
        with connection:
            _pid, uid, gid = peer_credentials(connection)
            if (
                uid != arguments.expected_client_uid
                or gid != arguments.expected_client_gid
            ):
                raise PermissionError(
                    f"runtime peer credential mismatch uid={uid} gid={gid}"
                )
            exchange(
                connection,
                command,
                arguments.timeout_millis / 1000,
            )
        return 0
    finally:
        listener.close()
        socket_path.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        print("provider Unix front failed", file=sys.stderr)
        raise SystemExit(2)
