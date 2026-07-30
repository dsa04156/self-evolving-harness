#!/usr/bin/env python3
"""Rootless subordinate-UID orchestrator for Gate-2 OS-boundary evidence."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time
from typing import Any


ROLE_UIDS = {
    "operations": 1101,
    "runtime": 1102,
    "evaluator": 1103,
    "promoter": 1104,
    "audit": 1105,
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--python-root", required=True)
    parser.add_argument("--node-executable", required=True)
    return parser.parse_args()


def chown_tree(root: Path, uid: int, gid: int) -> None:
    for current_root, directories, files in os.walk(root):
        for name in directories:
            os.chown(Path(current_root, name), uid, gid, follow_symlinks=False)
        for name in files:
            os.chown(Path(current_root, name), uid, gid, follow_symlinks=False)
    os.chown(root, uid, gid, follow_symlinks=False)


def prepare_ownership(root: Path) -> None:
    vault = root / "vault"
    os.chmod(vault, 0o711)
    for role, uid in ROLE_UIDS.items():
        role_root = vault / role
        chown_tree(role_root, uid, uid)
        os.chmod(role_root, 0o700)
        os.chmod(role_root / "private.pem", 0o600)
        state = root / "state" / role
        chown_tree(state, uid, uid)
        os.chmod(state, 0o700)
    os.chmod(root / "ipc", 0o1777)
    os.chmod(root / "public", 0o755)
    for public_file in (root / "public").iterdir():
        os.chmod(public_file, 0o644)
    chown_tree(
        root / "candidate-snapshot",
        ROLE_UIDS["evaluator"],
        ROLE_UIDS["evaluator"],
    )


def restore_ownership(root: Path) -> None:
    for current_root, directories, files in os.walk(root, topdown=False):
        for name in files:
            try:
                os.chown(Path(current_root, name), 0, 0, follow_symlinks=False)
            except FileNotFoundError:
                pass
        for name in directories:
            try:
                directory = Path(current_root, name)
                os.chown(directory, 0, 0, follow_symlinks=False)
                os.chmod(directory, stat.S_IMODE(os.lstat(directory).st_mode) | 0o700)
            except FileNotFoundError:
                pass
    os.chown(root, 0, 0, follow_symlinks=False)
    os.chmod(root, stat.S_IMODE(os.lstat(root).st_mode) | 0o700)


def base_sandbox(
    role: str,
    root: Path,
    repository: Path,
    python_root: Path,
    *,
    vault_probe: bool = False,
) -> list[str]:
    uid = ROLE_UIDS[role]
    command = [
        "/usr/bin/bwrap",
        "--die-with-parent",
        "--new-session",
        "--unshare-net",
        "--unshare-pid",
        "--unshare-ipc",
        "--unshare-uts",
        "--unshare-cgroup-try",
        "--ro-bind",
        "/usr",
        "/usr",
        "--ro-bind",
        "/bin",
        "/bin",
        "--ro-bind",
        "/lib",
        "/lib",
        "--ro-bind",
        "/lib64",
        "/lib64",
        "--dir",
        "/etc",
        "--ro-bind",
        "/etc/ssl",
        "/etc/ssl",
        "--dir",
        "/opt",
        "--dir",
        "/opt/seh",
        "--dir",
        "/opt/seh/evaluator",
        "--dir",
        "/opt/seh/scripts",
        "--dir",
        "/opt/node",
        "--dir",
        "/opt/node/bin",
        "--ro-bind",
        str(python_root),
        "/opt/python",
        "--dir",
        "/run",
        "--bind",
        str(root / "ipc"),
        "/run/ipc",
        "--ro-bind",
        str(root / "public"),
        "/run/config",
        "--bind",
        str(root / "state" / role),
        "/state",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--tmpfs",
        "/tmp",
    ]
    if vault_probe:
        command.extend(["--ro-bind", str(root / "vault"), "/vault"])
    else:
        command.extend(
            ["--ro-bind", str(root / "vault" / role), "/run/keys"]
        )
    command.extend(
        [
            "--clearenv",
            "--chdir",
            "/",
            "--setenv",
            "PATH",
            "/usr/bin:/bin",
            "--setenv",
            "LANG",
            "C.UTF-8",
            "--setenv",
            "LC_ALL",
            "C.UTF-8",
            "--setenv",
            "TZ",
            "UTC",
            "--setenv",
            "PYTHONHASHSEED",
            "0",
            "--setenv",
            "PYTHONDONTWRITEBYTECODE",
            "1",
            "--cap-drop",
            "ALL",
            "--uid",
            str(uid),
            "--gid",
            str(uid),
            "--",
        ]
    )
    return command


def add_read_only_mounts(
    command: list[str],
    mounts: list[tuple[Path, str]],
) -> None:
    options: list[str] = []
    for source, destination in mounts:
        options.extend(["--ro-bind", str(source), destination])
    command[-1:-1] = options


def wait_for_socket(socket_path: Path, process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if process.poll() is not None:
            _stdout, stderr = process.communicate()
            raise RuntimeError(
                f"server exited before socket readiness: "
                f"{stderr.decode('utf-8', errors='replace')}"
            )
        try:
            if stat.S_ISSOCK(os.lstat(socket_path).st_mode):
                return
        except FileNotFoundError:
            pass
        time.sleep(0.02)
    raise TimeoutError(f"socket readiness timed out: {socket_path}")


def process_uid(pid: int, expected_uid: int) -> int:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            with open(f"/proc/{pid}/status", encoding="utf-8") as status:
                for line in status:
                    if line.startswith("Uid:"):
                        effective = int(line.split()[2])
                        if effective == expected_uid:
                            return pid
        except FileNotFoundError:
            pass
        children_path = Path(f"/proc/{pid}/task/{pid}/children")
        try:
            children = [
                int(value) for value in children_path.read_text().split()
            ]
        except (FileNotFoundError, PermissionError):
            children = []
        for child in children:
            try:
                with open(f"/proc/{child}/status", encoding="utf-8") as status:
                    values = next(
                        line for line in status if line.startswith("Uid:")
                    ).split()
                if int(values[2]) == expected_uid:
                    return child
            except (FileNotFoundError, StopIteration):
                continue
        time.sleep(0.02)
    raise RuntimeError(
        f"no process under launcher {pid} reached expected UID {expected_uid}"
    )


def start_audit(
    root: Path, repository: Path, python_root: Path
) -> tuple[subprocess.Popen[bytes], int]:
    socket_path = root / "ipc" / "audit.sock"
    socket_path.unlink(missing_ok=True)
    command = base_sandbox("audit", root, repository, python_root)
    add_read_only_mounts(
        command,
        [
            (
                repository / "evaluator" / "external_audit.py",
                "/opt/seh/evaluator/external_audit.py",
            ),
        ],
    )
    command += [
        "/opt/python/bin/python3.13",
        "-I",
        "/opt/seh/evaluator/external_audit.py",
        "--serve-unix",
        "/run/ipc/audit.sock",
        "--config",
        "/run/config/audit.json",
        "--private-key",
        "/run/keys/private.pem",
        "--audit-public-key",
        "/run/config/audit-public.pem",
        "--operations-public-key",
        "/run/config/operations-public.pem",
        "--protocol-id",
        (root / "public" / "protocol-id").read_text().strip(),
        "--log-directory",
        "/state",
        "--expected-client-uid",
        str(ROLE_UIDS["operations"]),
        "--expected-client-gid",
        str(ROLE_UIDS["operations"]),
        "--timeout-millis",
        "30000",
        "--socket-mode",
        "660",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    wait_for_socket(socket_path, process)
    os.chown(
        socket_path,
        ROLE_UIDS["audit"],
        ROLE_UIDS["operations"],
        follow_symlinks=False,
    )
    os.chmod(socket_path, 0o660)
    return process, process_uid(process.pid, ROLE_UIDS["audit"])


def start_evaluator(
    root: Path,
    repository: Path,
    python_root: Path,
    *,
    world_accessible: bool = False,
) -> tuple[subprocess.Popen[bytes], int]:
    socket_path = root / "ipc" / "evaluator.sock"
    socket_path.unlink(missing_ok=True)
    command = base_sandbox("evaluator", root, repository, python_root)
    add_read_only_mounts(
        command,
        [
            (
                repository / "evaluator" / "external_evaluator.py",
                "/opt/seh/evaluator/external_evaluator.py",
            ),
            (root / "candidate-snapshot", "/candidate"),
        ],
    )
    command += [
        "/opt/python/bin/python3.13",
        "-I",
        "/opt/seh/evaluator/external_evaluator.py",
        "--serve-unix",
        "/run/ipc/evaluator.sock",
        "--config",
        "/run/config/evaluator.json",
        "--private-key",
        "/run/keys/private.pem",
        "--operations-public-key",
        "/run/config/operations-public.pem",
        "--candidate-snapshot-root",
        "/candidate",
        "--candidate-snapshot-descriptor",
        "/run/config/candidate-snapshot.json",
        "--protocol-id",
        (root / "public" / "protocol-id").read_text().strip(),
        "--expected-client-uid",
        str(ROLE_UIDS["operations"]),
        "--expected-client-gid",
        str(ROLE_UIDS["operations"]),
        "--timeout-millis",
        "30000",
        "--socket-mode",
        "666" if world_accessible else "660",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    wait_for_socket(socket_path, process)
    if not world_accessible:
        os.chown(
            socket_path,
            ROLE_UIDS["evaluator"],
            ROLE_UIDS["operations"],
            follow_symlinks=False,
        )
        os.chmod(socket_path, 0o660)
    return process, process_uid(process.pid, ROLE_UIDS["evaluator"])


def run_probe(
    role: str,
    target_pids: list[int],
    root: Path,
    repository: Path,
    python_root: Path,
) -> dict[str, Any]:
    own = f"/vault/{role}/private.pem"
    forbidden = [
        f"/vault/{other}/private.pem"
        for other in ROLE_UIDS
        if other != role
    ]
    command = base_sandbox(
        role, root, repository, python_root, vault_probe=True
    )
    add_read_only_mounts(
        command,
        [
            (
                repository / "evaluator" / "os_role_probe.py",
                "/opt/seh/evaluator/os_role_probe.py",
            ),
        ],
    )
    command += [
        "/opt/python/bin/python3.13",
        "-I",
        "/opt/seh/evaluator/os_role_probe.py",
        "--role",
        role,
        "--own-key",
        own,
        "--challenge",
        (
            f"seh-os-principal:{role}:"
            f"{(root / 'public' / 'protocol-id').read_text().strip()}"
        ),
    ]
    for path in forbidden:
        command.extend(["--forbidden-read", path, "--forbidden-write", path])
    for pid in target_pids:
        command.extend(["--target-pid", str(pid)])
    completed = subprocess.run(command, capture_output=True, timeout=15)
    if completed.returncode != 0:
        raise RuntimeError(
            f"{role} probe failed: "
            f"{completed.stderr.decode('utf-8', errors='replace')}"
        )
    return json.loads(completed.stdout)


def run_operations(
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
) -> dict[str, Any]:
    command = base_sandbox("operations", root, repository, python_root)
    add_read_only_mounts(
        command,
        [
            (repository / "node_modules", "/opt/seh/node_modules"),
            (repository / "package.json", "/opt/seh/package.json"),
            (repository / "schemas", "/opt/seh/schemas"),
            (repository / "src", "/opt/seh/src"),
            (repository / "tsconfig.json", "/opt/seh/tsconfig.json"),
            (
                repository / "scripts" / "os-principal-operations.ts",
                "/opt/seh/scripts/os-principal-operations.ts",
            ),
            (
                repository / "evaluator" / "unix_peer_relay.py",
                "/opt/seh/evaluator/unix_peer_relay.py",
            ),
            (node_executable, "/opt/node/bin/node"),
        ],
    )
    command += [
        "/opt/node/bin/node",
        "/opt/seh/node_modules/tsx/dist/cli.mjs",
        "/opt/seh/scripts/os-principal-operations.ts",
        "/run/config/operations.json",
    ]
    completed = subprocess.run(command, capture_output=True, timeout=30)
    if completed.returncode != 0:
        raise RuntimeError(
            "operations integration failed: "
            + completed.stderr.decode("utf-8", errors="replace")
        )
    with open(root / "state" / "operations" / "result.json", encoding="utf-8") as result:
        return json.load(result)


def wait_server(
    process: subprocess.Popen[bytes],
    *,
    expected_returncodes: set[int],
    label: str,
) -> str:
    _stdout, stderr = process.communicate(timeout=10)
    if process.returncode not in expected_returncodes:
        raise RuntimeError(
            f"{label} returned {process.returncode}: "
            f"{stderr.decode('utf-8', errors='replace')}"
        )
    return stderr.decode("utf-8", errors="replace")


def run_adversarial_client(
    mode: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
) -> dict[str, Any]:
    command = base_sandbox("operations", root, repository, python_root)
    add_read_only_mounts(
        command,
        [
            (repository / "node_modules", "/opt/seh/node_modules"),
            (repository / "package.json", "/opt/seh/package.json"),
            (repository / "schemas", "/opt/seh/schemas"),
            (repository / "src", "/opt/seh/src"),
            (repository / "tsconfig.json", "/opt/seh/tsconfig.json"),
            (
                repository / "scripts" / "os-principal-evaluator-adversary.ts",
                "/opt/seh/scripts/os-principal-evaluator-adversary.ts",
            ),
            (node_executable, "/opt/node/bin/node"),
        ],
    )
    command += [
        "/opt/node/bin/node",
        "/opt/seh/node_modules/tsx/dist/cli.mjs",
        "/opt/seh/scripts/os-principal-evaluator-adversary.ts",
        "/run/config/operations.json",
        mode,
    ]
    completed = subprocess.run(command, capture_output=True, timeout=15)
    if completed.returncode != 0:
        raise RuntimeError(
            f"adversarial client {mode} failed: "
            f"{completed.stderr.decode('utf-8', errors='replace')}"
        )
    return json.loads(completed.stdout)


def wrong_uid_probe(
    root: Path, repository: Path, python_root: Path
) -> None:
    code = (
        "import socket;"
        "s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);"
        "s.connect('/run/ipc/evaluator.sock');"
        "s.close()"
    )
    command = base_sandbox("runtime", root, repository, python_root) + [
        "/opt/python/bin/python3.13",
        "-I",
        "-c",
        code,
    ]
    completed = subprocess.run(command, capture_output=True, timeout=10)
    if completed.returncode != 0:
        raise RuntimeError(
            "wrong-UID connection probe could not reach the socket: "
            + completed.stderr.decode("utf-8", errors="replace")
        )


def socket_permission_probe(
    root: Path, repository: Path, python_root: Path
) -> None:
    code = (
        "import socket;"
        "paths=['/run/ipc/audit.sock','/run/ipc/evaluator.sock'];"
        "\nfor p in paths:\n"
        " s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)\n"
        " try:\n"
        "  s.connect(p)\n"
        " except PermissionError:\n"
        "  pass\n"
        " else:\n"
        "  raise PermissionError('unauthorized socket connect succeeded: '+p)\n"
        " finally:\n"
        "  s.close()\n"
    )
    command = base_sandbox("runtime", root, repository, python_root) + [
        "/opt/python/bin/python3.13",
        "-I",
        "-c",
        code,
    ]
    completed = subprocess.run(command, capture_output=True, timeout=10)
    if completed.returncode != 0:
        raise RuntimeError(
            "socket filesystem-permission probe failed: "
            + completed.stderr.decode("utf-8", errors="replace")
        )


def wrong_server_uid_probe(
    root: Path, repository: Path, python_root: Path
) -> None:
    socket_path = root / "ipc" / "impostor.sock"
    socket_path.unlink(missing_ok=True)
    server_command = base_sandbox(
        "runtime", root, repository, python_root
    )
    add_read_only_mounts(
        server_command,
        [
            (
                repository / "evaluator" / "unix_impostor.py",
                "/opt/seh/evaluator/unix_impostor.py",
            ),
        ],
    )
    server_command += [
        "/opt/python/bin/python3.13",
        "-I",
        "/opt/seh/evaluator/unix_impostor.py",
        "--socket",
        "/run/ipc/impostor.sock",
    ]
    server = subprocess.Popen(
        server_command, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    try:
        wait_for_socket(socket_path, server)
        client_command = base_sandbox(
            "operations", root, repository, python_root
        )
        add_read_only_mounts(
            client_command,
            [
                (
                    repository / "evaluator" / "unix_peer_relay.py",
                    "/opt/seh/evaluator/unix_peer_relay.py",
                ),
            ],
        )
        client_command += [
            "/opt/python/bin/python3.13",
            "-I",
            "/opt/seh/evaluator/unix_peer_relay.py",
            "--socket",
            "/run/ipc/impostor.sock",
            "--expected-server-uid",
            str(ROLE_UIDS["evaluator"]),
            "--expected-server-gid",
            str(ROLE_UIDS["evaluator"]),
            "--timeout-millis",
            "5000",
        ]
        client = subprocess.run(client_command, capture_output=True, timeout=10)
        if (
            client.returncode != 2
            or b"peer credential mismatch" not in client.stderr
        ):
            raise RuntimeError(
                "client did not reject an impostor server UID: "
                + client.stderr.decode("utf-8", errors="replace")
            )
        wait_server(server, expected_returncodes={0}, label="impostor server")
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=2)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


def terminate_all(processes: list[subprocess.Popen[bytes]]) -> None:
    for process in processes:
        if process.poll() is None:
            process.terminate()
    deadline = time.monotonic() + 2
    for process in processes:
        if process.poll() is None:
            try:
                process.wait(timeout=max(0.01, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

def outer_uid_for(inner_uid: int) -> int:
    for line in Path("/proc/self/uid_map").read_text().splitlines():
        inner_start, outer_start, count = [int(value) for value in line.split()]
        if inner_start <= inner_uid < inner_start + count:
            return outer_start + (inner_uid - inner_start)
    raise ValueError(f"inner UID {inner_uid} is not mapped")


def main() -> int:
    arguments = parse_arguments()
    root = Path(arguments.root).resolve()
    repository = Path(arguments.repository).resolve()
    python_root = Path(arguments.python_root).resolve()
    node_executable = Path(arguments.node_executable).resolve()
    active: list[subprocess.Popen[bytes]] = []
    try:
        if os.geteuid() != 0:
            raise PermissionError("OS-principal orchestrator requires root inside user namespace")
        prepare_ownership(root)
        audit_process, audit_pid = start_audit(root, repository, python_root)
        evaluator_process, evaluator_pid = start_evaluator(
            root, repository, python_root
        )
        active.extend([audit_process, evaluator_process])
        probes = {
            "operations": run_probe(
                "operations",
                [audit_pid, evaluator_pid],
                root,
                repository,
                python_root,
            ),
            "runtime": run_probe(
                "runtime",
                [audit_pid, evaluator_pid],
                root,
                repository,
                python_root,
            ),
            "promoter": run_probe(
                "promoter",
                [audit_pid, evaluator_pid],
                root,
                repository,
                python_root,
            ),
            "audit": run_probe(
                "audit", [evaluator_pid], root, repository, python_root
            ),
            "evaluator": run_probe(
                "evaluator", [audit_pid], root, repository, python_root
            ),
        }
        socket_permission_probe(root, repository, python_root)
        integration = run_operations(
            root,
            repository,
            python_root,
            node_executable,
        )
        wait_server(audit_process, expected_returncodes={0}, label="audit")
        wait_server(evaluator_process, expected_returncodes={0}, label="evaluator")
        active.clear()

        adversarial_modes = [
            "partial",
            "oversized",
            "downgrade",
            "wrong_role",
            "wrong_key",
            "bad_signature",
            "schema_invalid",
            "snapshot_mismatch",
            "replay",
            "extra_frame",
            "peer_crash",
        ]
        adversarial: list[dict[str, Any]] = []
        for mode in adversarial_modes:
            server, _server_pid = start_evaluator(root, repository, python_root)
            active.append(server)
            adversarial.append(
                run_adversarial_client(
                    mode,
                    root,
                    repository,
                    python_root,
                    node_executable,
                )
            )
            wait_server(
                server,
                expected_returncodes={0, 2} if mode == "peer_crash" else {2},
                label=f"evaluator adversarial {mode}",
            )
            active.remove(server)

        wrong_uid_server, _pid = start_evaluator(
            root,
            repository,
            python_root,
            world_accessible=True,
        )
        active.append(wrong_uid_server)
        wrong_uid_probe(root, repository, python_root)
        wrong_uid_error = wait_server(
            wrong_uid_server,
            expected_returncodes={2},
            label="evaluator wrong UID",
        )
        active.remove(wrong_uid_server)
        if "peer credential mismatch" not in wrong_uid_error:
            raise RuntimeError("wrong-UID rejection did not cite kernel credentials")
        wrong_server_uid_probe(root, repository, python_root)

        with open(
            root / "public" / "candidate-snapshot.json",
            encoding="utf-8",
        ) as snapshot_file:
            snapshot_descriptor = json.load(snapshot_file)
        evidence = {
            "schemaVersion": 1,
            "isolationClass": "os_enforced_subordinate_uids",
            "uidMap": Path("/proc/self/uid_map").read_text().strip(),
            "roleUids": ROLE_UIDS,
            "hostRoleUids": {
                role: outer_uid_for(uid) for role, uid in ROLE_UIDS.items()
            },
            "roleProbes": probes,
            "integration": integration,
            "adversarial": adversarial,
            "wrongUidRejected": True,
            "wrongServerUidRejected": True,
            "unauthorizedSocketConnectDenied": True,
            "candidateFilesystemSnapshot": {
                "filesystemSnapshotHash": snapshot_descriptor[
                    "filesystemSnapshotHash"
                ],
                "headCommit": snapshot_descriptor["headCommit"],
                "treeHash": snapshot_descriptor["treeHash"],
                "entryCount": len(snapshot_descriptor["entries"]),
            },
            "auditPrivateOwner": os.stat(
                root / "vault" / "audit" / "private.pem"
            ).st_uid,
            "evaluatorPrivateOwner": os.stat(
                root / "vault" / "evaluator" / "private.pem"
            ).st_uid,
        }
        print(json.dumps(evidence, sort_keys=True, separators=(",", ":")))
        return 0
    finally:
        terminate_all(active)
        restore_ownership(root)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"os principal gate failed: {error}", file=sys.stderr)
        raise
