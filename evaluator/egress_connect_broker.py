#!/usr/bin/env python3
"""Credential-blind CONNECT broker with an exact host/port allowlist.

The provider-proxy principal has no direct network namespace. It reaches this
Unix socket, sends one HTTP CONNECT request for the frozen destination, and
then performs TLS end-to-end through the opaque tunnel. The broker observes the
destination and encrypted byte counts but never terminates TLS or receives the
provider credential.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import selectors
import socket
import struct
import time


MAX_CONNECT_HEADER_BYTES = 4096
PEER_CREDENTIAL_FORMAT = "3i"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--expected-client-uid", required=True, type=int)
    parser.add_argument("--expected-client-gid", required=True, type=int)
    parser.add_argument("--allowed-host", required=True)
    parser.add_argument("--allowed-port", required=True, type=int)
    parser.add_argument("--timeout-millis", required=True, type=int)
    parser.add_argument("--max-tunnel-bytes", required=True, type=int)
    parser.add_argument("--socket-mode", default="660")
    return parser.parse_args()


def peer_credentials(
    connection: socket.socket,
) -> tuple[int, int, int]:
    raw = connection.getsockopt(
        socket.SOL_SOCKET,
        socket.SO_PEERCRED,
        struct.calcsize(PEER_CREDENTIAL_FORMAT),
    )
    return struct.unpack(PEER_CREDENTIAL_FORMAT, raw)


def read_connect_header(
    connection: socket.socket,
    allowed_host: str,
    allowed_port: int,
) -> None:
    buffer = bytearray()
    while b"\r\n\r\n" not in buffer:
        chunk = connection.recv(1024)
        if chunk == b"":
            raise ConnectionError("client closed during CONNECT")
        buffer.extend(chunk)
        if len(buffer) > MAX_CONNECT_HEADER_BYTES:
            raise ValueError("CONNECT header is too large")
    header, trailing = bytes(buffer).split(b"\r\n\r\n", 1)
    if trailing:
        raise ValueError("tunnel bytes arrived before CONNECT admission")
    try:
        lines = header.decode("ascii").split("\r\n")
    except UnicodeDecodeError as error:
        raise ValueError("CONNECT header is not ASCII") from error
    target = f"{allowed_host}:{allowed_port}"
    if lines[0] != f"CONNECT {target} HTTP/1.1":
        raise PermissionError("CONNECT destination is not allowlisted")
    permitted_headers = {
        f"Host: {target}",
        "Connection: keep-alive",
    }
    if not lines[1:] or any(line not in permitted_headers for line in lines[1:]):
        raise ValueError("CONNECT headers are not canonical")
    if f"Host: {target}" not in lines[1:]:
        raise ValueError("CONNECT Host header is missing")


def relay(
    client: socket.socket,
    upstream: socket.socket,
    *,
    deadline: float,
    max_tunnel_bytes: int,
) -> None:
    selector = selectors.DefaultSelector()
    selector.register(client, selectors.EVENT_READ, upstream)
    selector.register(upstream, selectors.EVENT_READ, client)
    total = 0
    try:
        while time.monotonic() < deadline:
            events = selector.select(timeout=max(0.0, deadline - time.monotonic()))
            if not events:
                raise TimeoutError("CONNECT tunnel timed out")
            for key, _mask in events:
                source = key.fileobj
                destination = key.data
                data = source.recv(64 * 1024)
                if data == b"":
                    return
                total += len(data)
                if total > max_tunnel_bytes:
                    raise ValueError("CONNECT tunnel byte cap exceeded")
                destination.sendall(data)
        raise TimeoutError("CONNECT tunnel timed out")
    finally:
        selector.close()


def main() -> int:
    arguments = parse_arguments()
    if (
        arguments.allowed_port < 1
        or arguments.allowed_port > 65535
        or arguments.timeout_millis < 1
        or arguments.max_tunnel_bytes < 1
    ):
        raise ValueError("invalid CONNECT broker numeric cap")
    socket_path = Path(arguments.socket)
    socket_path.unlink(missing_ok=True)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        listener.bind(str(socket_path))
        os.chmod(socket_path, int(arguments.socket_mode, 8))
        listener.listen(1)
        listener.settimeout(arguments.timeout_millis / 1000)
        client, _address = listener.accept()
        with client:
            _pid, uid, gid = peer_credentials(client)
            if (
                uid != arguments.expected_client_uid
                or gid != arguments.expected_client_gid
            ):
                raise PermissionError("CONNECT client credential mismatch")
            client.settimeout(arguments.timeout_millis / 1000)
            read_connect_header(
                client,
                arguments.allowed_host,
                arguments.allowed_port,
            )
            with socket.create_connection(
                (arguments.allowed_host, arguments.allowed_port),
                timeout=arguments.timeout_millis / 1000,
            ) as upstream:
                client.sendall(
                    b"HTTP/1.1 200 Connection Established\r\n\r\n"
                )
                relay(
                    client,
                    upstream,
                    deadline=(
                        time.monotonic()
                        + arguments.timeout_millis / 1000
                    ),
                    max_tunnel_bytes=arguments.max_tunnel_bytes,
                )
        return 0
    finally:
        listener.close()
        socket_path.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        raise SystemExit(2)
