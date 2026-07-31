#!/usr/bin/env python3
"""Body-free evaluator-vault Unix transport gate.

The gate runs as the vault subordinate UID. It authenticates the calling OS
principal with SO_PEERCRED, then delegates the already-signed request to a
fresh vault worker running under the same vault UID. Only this sandbox has the
authoritative journal and lease mounts.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import socket
import stat
import struct
import subprocess
import threading
from typing import Any


MAX_FRAME_BYTES = 1_048_576
PEER_CREDENTIAL_FORMAT = "3i"
ROLE_UIDS = {
    "protocol_author": 1301,
    "benchmark_author": 1302,
    "benchmark_reviewer": 1303,
    "vault": 1304,
    "evaluator": 1305,
    "scorer": 1306,
    "promoter": 1307,
    "audit_store": 1308,
}
CRASH_PHASES = {
    "before_state_append",
    "during_state_append",
    "after_state_publish_before_sync",
    "after_state_sync_before_verify",
    "after_durable_commit_before_release",
    "after_release_before_ack",
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--common-input", required=True)
    parser.add_argument("--state-directory", required=True)
    parser.add_argument("--vault-state", required=True)
    parser.add_argument("--max-requests", type=int, required=True)
    parser.add_argument("--worker-command", nargs="+", required=True)
    parser.add_argument(
        "--lease-ttl-millis",
        type=int,
        default=30_000,
    )
    parser.add_argument("--crash-ordinal", type=int)
    parser.add_argument(
        "--crash-phase",
        choices=sorted(CRASH_PHASES),
    )
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
        raise ValueError("invalid request frame length")
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


def durable_write(path: Path, value: Any) -> None:
    descriptor = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600,
    )
    try:
        os.write(descriptor, canonical(value))
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def copy_common_inputs(common_input: Path, destination: Path) -> None:
    for name in (
        "contract.json",
        "included.json",
        "under-review.json",
        "own-public.json",
    ):
        source = common_input / name
        target = destination / name
        shutil.copyfile(source, target)
        os.chmod(target, 0o600)


def validate_peer(
    request: dict[str, Any],
    peer_uid: int,
    peer_gid: int,
) -> str:
    actor = request.get("actor")
    if not isinstance(actor, dict):
        raise ValueError("request actor is missing")
    role = actor.get("role")
    if not isinstance(role, str) or role not in ROLE_UIDS:
        raise PermissionError("request actor role is not a frozen OS role")
    expected = ROLE_UIDS[role]
    if peer_uid != expected or peer_gid != expected:
        raise PermissionError(
            "request actor and SO_PEERCRED disagree: "
            f"role={role} expected={expected} "
            f"uid={peer_uid} gid={peer_gid}"
        )
    return role


def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as source:
        value = json.load(source)
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} is not an object")
    return value


class RequestHandler:
    def __init__(
        self,
        *,
        common_input: Path,
        state_directory: Path,
        vault_state: Path,
        worker_command: list[str],
        lease_ttl_millis: int,
        crash_ordinal: int | None,
        crash_phase: str | None,
    ) -> None:
        self.common_input = common_input
        self.state_directory = state_directory
        self.vault_state = vault_state
        self.worker_command = worker_command
        self.lease_ttl_millis = lease_ttl_millis
        self.crash_ordinal = crash_ordinal
        self.crash_phase = crash_phase
        self.lock = threading.Lock()
        self.next_ordinal = 0

    def ordinal(self) -> int:
        with self.lock:
            value = self.next_ordinal
            self.next_ordinal += 1
            return value

    def handle(self, connection: socket.socket) -> None:
        with connection:
            peer_pid, peer_uid, peer_gid = peer_credentials(connection)
            try:
                request = receive_json(connection)
                actor_role = validate_peer(request, peer_uid, peer_gid)
                ordinal = self.ordinal()
                request_root = self.state_directory / "requests" / f"{ordinal:08d}"
                output_root = self.state_directory / "responses" / f"{ordinal:08d}"
                request_root.mkdir(parents=True, mode=0o700)
                output_root.mkdir(parents=True, mode=0o700)
                copy_common_inputs(self.common_input, request_root)
                configuration: dict[str, Any] = {
                    "mode": "process_request",
                    "role": "vault",
                    "timestamp": request.get("requestedAt"),
                    "protocolId": request.get("protocolId"),
                    "leaseOwnerId": (
                        f"body-free-os.socket-worker.{ordinal:08d}"
                    ),
                    "leaseTtlMillis":
                        self.lease_ttl_millis,
                }
                if ordinal == self.crash_ordinal:
                    configuration["crashPhase"] = (
                        self.crash_phase
                    )
                durable_write(request_root / "config.json", configuration)
                durable_write(request_root / "request.json", request)
                environment = {
                    "PATH": "/usr/bin:/bin",
                    "LANG": "C.UTF-8",
                    "LC_ALL": "C.UTF-8",
                    "TZ": "UTC",
                    "SEH_WORKER_INPUT": str(request_root),
                    "SEH_WORKER_OUTPUT": str(output_root),
                    "SEH_WORKER_VAULT_STATE": str(self.vault_state),
                    "SEH_WORKER_SCHEMAS": "/opt/seh/schemas",
                    "SEH_WORKER_GOVERNANCE": "/opt/seh/governance",
                    "SEH_WORKER_PRIVATE_KEY": "/run/keys/private.pem",
                }
                completed = subprocess.run(
                    self.worker_command,
                    capture_output=True,
                    check=False,
                    timeout=60,
                    env=environment,
                )
                if completed.returncode != 0:
                    send_json(
                        connection,
                        {
                            "transportAccepted": True,
                            "actorRole": actor_role,
                            "peer": {
                                "pid": peer_pid,
                                "uid": peer_uid,
                                "gid": peer_gid,
                            },
                            "worker": {
                                "ordinal": ordinal,
                                "returnCode": completed.returncode,
                                "stderrCommitment": (
                                    "sha256:"
                                    + __import__("hashlib")
                                    .sha256(completed.stderr)
                                    .hexdigest()
                                ),
                            },
                            "result": None,
                            "receipt": None,
                        },
                    )
                    return
                result = read_json(output_root / "result.json")
                receipt = read_json(output_root / "receipt.json")
                send_json(
                    connection,
                    {
                        "transportAccepted": True,
                        "actorRole": actor_role,
                        "peer": {
                            "pid": peer_pid,
                            "uid": peer_uid,
                            "gid": peer_gid,
                        },
                        "worker": {
                            "ordinal": ordinal,
                            "returnCode": completed.returncode,
                            "uid": os.geteuid(),
                            "gid": os.getegid(),
                        },
                        "result": result,
                        "receipt": receipt,
                    },
                )
            except Exception as error:
                send_json(
                    connection,
                    {
                        "transportAccepted": False,
                        "errorCode": type(error).__name__,
                        "peer": {
                            "pid": peer_pid,
                            "uid": peer_uid,
                            "gid": peer_gid,
                        },
                    },
                )


def main() -> int:
    arguments = parse_arguments()
    if (
        (arguments.crash_ordinal is None)
        != (arguments.crash_phase is None)
    ):
        raise ValueError(
            "crash ordinal and crash phase must be configured together"
        )
    if arguments.lease_ttl_millis < 100:
        raise ValueError("lease TTL must be at least 100 milliseconds")
    socket_path = Path(arguments.socket)
    common_input = Path(arguments.common_input)
    state_directory = Path(arguments.state_directory)
    vault_state = Path(arguments.vault_state)
    for directory in (state_directory, vault_state):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        metadata = os.stat(directory, follow_symlinks=False)
        if metadata.st_uid != os.geteuid() or metadata.st_gid != os.getegid():
            raise PermissionError(
                f"{directory} is not owned by the vault principal"
            )
    socket_path.unlink(missing_ok=True)
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(socket_path))
    os.chmod(socket_path, 0o666)
    if not stat.S_ISSOCK(os.lstat(socket_path).st_mode):
        raise PermissionError("vault endpoint is not a Unix socket")
    server.listen(16)
    handler = RequestHandler(
        common_input=common_input,
        state_directory=state_directory,
        vault_state=vault_state,
        worker_command=list(arguments.worker_command),
        lease_ttl_millis=arguments.lease_ttl_millis,
        crash_ordinal=arguments.crash_ordinal,
        crash_phase=arguments.crash_phase,
    )
    futures = []
    try:
        with ThreadPoolExecutor(max_workers=8) as executor:
            for _ordinal in range(arguments.max_requests):
                connection, _address = server.accept()
                futures.append(executor.submit(handler.handle, connection))
            for future in futures:
                future.result(timeout=90)
    finally:
        server.close()
        socket_path.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"evaluator-vault socket gate failed: {error}", file=os.sys.stderr)
        raise SystemExit(2)
