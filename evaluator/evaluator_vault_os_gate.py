#!/usr/bin/env python3
"""Rootless eight-principal body-free evaluator-vault integration gate."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time
from typing import Any


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
WORKER = "/opt/seh/scripts/evaluator-vault-os-worker.ts"
NODE = "/opt/node/bin/node"
TSX = "/opt/seh/node_modules/tsx/dist/cli.mjs"
CLIENT = "/opt/seh/evaluator/evaluator_vault_socket_client.py"
SERVER = "/opt/seh/evaluator/evaluator_vault_socket_gate.py"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--python-root", required=True)
    parser.add_argument("--node-executable", required=True)
    return parser.parse_args()


def canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical(value)).hexdigest()


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
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


def chown_tree(root: Path, uid: int, gid: int) -> None:
    for current_root, directories, files in os.walk(root):
        for name in directories:
            os.chown(
                Path(current_root, name),
                uid,
                gid,
                follow_symlinks=False,
            )
        for name in files:
            os.chown(
                Path(current_root, name),
                uid,
                gid,
                follow_symlinks=False,
            )
    os.chown(root, uid, gid, follow_symlinks=False)


def restore_ownership(root: Path) -> None:
    for current_root, directories, files in os.walk(
        root, topdown=False
    ):
        for name in files:
            try:
                os.chown(
                    Path(current_root, name),
                    0,
                    0,
                    follow_symlinks=False,
                )
            except FileNotFoundError:
                pass
        for name in directories:
            try:
                directory = Path(current_root, name)
                os.chown(
                    directory,
                    0,
                    0,
                    follow_symlinks=False,
                )
                os.chmod(
                    directory,
                    stat.S_IMODE(os.lstat(directory).st_mode)
                    | 0o700,
                )
            except FileNotFoundError:
                pass
    os.chown(root, 0, 0, follow_symlinks=False)
    os.chmod(
        root,
        stat.S_IMODE(os.lstat(root).st_mode) | 0o700,
    )


def prepare_ownership(root: Path) -> None:
    os.chmod(root, 0o711)
    for directory in (
        root / "input",
        root / "state",
        root / "ipc",
        root / "vault-state",
        root / "sensitive" / "author-identity",
        root / "sensitive" / "raw-handle",
    ):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root / "ipc", 0o1777)
    os.chown(
        root / "vault-state",
        ROLE_UIDS["vault"],
        ROLE_UIDS["vault"],
        follow_symlinks=False,
    )
    os.chmod(root / "vault-state", 0o700)
    os.chown(
        root / "sensitive" / "author-identity",
        ROLE_UIDS["benchmark_author"],
        ROLE_UIDS["benchmark_author"],
        follow_symlinks=False,
    )
    os.chown(
        root / "sensitive" / "raw-handle",
        ROLE_UIDS["vault"],
        ROLE_UIDS["vault"],
        follow_symlinks=False,
    )
    for directory in (
        root / "sensitive",
        root / "keys",
    ):
        os.chmod(directory, 0o711)
    author_identity = (
        root
        / "sensitive"
        / "author-identity"
        / "identity.json"
    )
    if not author_identity.exists():
        write_json(
            author_identity,
            {
                "recordType":
                    "synthetic_private_author_identity",
                "principal":
                    "benchmark-author-private-sentinel",
            },
        )
    os.chown(
        author_identity,
        ROLE_UIDS["benchmark_author"],
        ROLE_UIDS["benchmark_author"],
        follow_symlinks=False,
    )
    raw_handle = (
        root / "sensitive" / "raw-handle" / "task.txt"
    )
    if not raw_handle.exists():
        descriptor = os.open(
            raw_handle,
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | os.O_NOFOLLOW,
            0o600,
        )
        try:
            os.write(
                descriptor,
                b"synthetic-private-task-handle-sentinel",
            )
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    os.chown(
        raw_handle,
        ROLE_UIDS["vault"],
        ROLE_UIDS["vault"],
        follow_symlinks=False,
    )
    for role, uid in ROLE_UIDS.items():
        key_root = root / "keys" / role
        chown_tree(key_root, uid, uid)
        os.chmod(key_root, 0o700)
        os.chmod(key_root / "private.pem", 0o600)
    os.chmod(root / "public", 0o755)
    for public_file in (root / "public").iterdir():
        os.chmod(public_file, 0o644)


def reset_stage(
    root: Path, stage: str, role: str
) -> tuple[Path, Path]:
    input_directory = root / "input" / stage
    state_directory = root / "state" / stage
    for directory in (input_directory, state_directory):
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True, mode=0o700)
        os.chown(
            directory,
            ROLE_UIDS[role],
            ROLE_UIDS[role],
            follow_symlinks=False,
        )
    return input_directory, state_directory


def copy_input(
    destination: Path,
    name: str,
    source: Path,
    role: str,
) -> None:
    target = destination / name
    shutil.copyfile(source, target)
    os.chmod(target, 0o600)
    os.chown(
        target,
        ROLE_UIDS[role],
        ROLE_UIDS[role],
        follow_symlinks=False,
    )


def write_input(
    destination: Path,
    name: str,
    value: Any,
    role: str,
) -> None:
    target = destination / name
    write_json(target, value)
    os.chown(
        target,
        ROLE_UIDS[role],
        ROLE_UIDS[role],
        follow_symlinks=False,
    )


def base_sandbox(
    role: str,
    input_directory: Path,
    state_directory: Path,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    *,
    vault_state: bool = False,
    protected_probe: bool = False,
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
        "--ro-bind",
        str(repository / "node_modules"),
        "/opt/seh/node_modules",
        "--ro-bind",
        str(repository / "package.json"),
        "/opt/seh/package.json",
        "--ro-bind",
        str(repository / "tsconfig.json"),
        "/opt/seh/tsconfig.json",
        "--ro-bind",
        str(repository / "schemas"),
        "/opt/seh/schemas",
        "--ro-bind",
        str(repository / "src"),
        "/opt/seh/src",
        "--ro-bind",
        str(repository / "governance"),
        "/opt/seh/governance",
        "--ro-bind",
        str(
            repository
            / "scripts"
            / "evaluator-vault-os-worker.ts"
        ),
        WORKER,
        "--ro-bind",
        str(
            repository
            / "evaluator"
            / "evaluator_vault_socket_gate.py"
        ),
        SERVER,
        "--ro-bind",
        str(
            repository
            / "evaluator"
            / "evaluator_vault_socket_client.py"
        ),
        CLIENT,
        "--ro-bind",
        str(repository / "evaluator" / "os_role_probe.py"),
        "/opt/seh/evaluator/os_role_probe.py",
        "--ro-bind",
        str(node_executable),
        NODE,
        "--ro-bind",
        str(input_directory),
        "/input",
        "--bind",
        str(state_directory),
        "/state",
        "--dir",
        "/run",
        "--ro-bind",
        str(root / "public"),
        "/run/public",
        "--ro-bind",
        str(root / "keys" / role),
        "/run/keys",
        "--bind",
        str(root / "ipc"),
        "/run/ipc",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--tmpfs",
        "/tmp",
        "--chmod",
        "1777",
        "/tmp",
    ]
    if vault_state:
        command.extend(
            [
                "--bind",
                str(root / "vault-state"),
                "/vault-state",
            ]
        )
    if protected_probe:
        command.extend(
            ["--bind", str(root), "/protected"]
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
            "--cap-add",
            "CAP_SETUID",
            "--cap-add",
            "CAP_SETGID",
            "--cap-add",
            "CAP_SETPCAP",
            "--",
            "/usr/bin/setpriv",
            "--reuid",
            str(uid),
            "--regid",
            str(uid),
            "--clear-groups",
            "--no-new-privs",
            "--bounding-set=-all",
            "--inh-caps=-all",
            "--ambient-caps=-all",
            "--",
        ]
    )
    return command


def worker_command() -> list[str]:
    return [NODE, TSX, WORKER]


def prepare_stage(
    root: Path,
    stage: str,
    role: str,
    mode: str,
    timestamp: str,
    protocol_id: str,
    *,
    extra: dict[str, Any] | None = None,
) -> tuple[Path, Path]:
    input_directory, state_directory = reset_stage(
        root, stage, role
    )
    configuration = {
        "mode": mode,
        "role": role,
        "timestamp": timestamp,
        "protocolId": protocol_id,
        **(extra or {}),
    }
    write_input(
        input_directory,
        "config.json",
        configuration,
        role,
    )
    copy_input(
        input_directory,
        "own-public.json",
        root / "public" / f"{role}.json",
        role,
    )
    return input_directory, state_directory


def run_worker(
    role: str,
    stage: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    *,
    vault_state: bool = False,
    timeout: int = 90,
) -> subprocess.CompletedProcess[bytes]:
    completed = subprocess.run(
        base_sandbox(
            role,
            root / "input" / stage,
            root / "state" / stage,
            root,
            repository,
            python_root,
            node_executable,
            vault_state=vault_state,
        )
        + worker_command(),
        capture_output=True,
        check=False,
        timeout=timeout,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"{stage} worker failed: "
            + completed.stderr.decode(
                "utf-8", errors="replace"
            )[:4000]
        )
    return completed


def process_uid(pid: int, expected_uid: int) -> int:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        pending = [pid]
        visited: set[int] = set()
        while pending:
            candidate = pending.pop()
            if candidate in visited:
                continue
            visited.add(candidate)
            try:
                with open(
                    f"/proc/{candidate}/status",
                    encoding="utf-8",
                ) as status:
                    values = next(
                        line
                        for line in status
                        if line.startswith("Uid:")
                    ).split()
                if int(values[2]) == expected_uid:
                    return candidate
            except (FileNotFoundError, StopIteration):
                pass
            children_path = Path(
                f"/proc/{candidate}/task/{candidate}/children"
            )
            try:
                pending.extend(
                    int(value)
                    for value in children_path.read_text().split()
                )
            except (FileNotFoundError, PermissionError):
                pass
        time.sleep(0.02)
    raise RuntimeError(
        f"no process under launcher {pid} reached UID {expected_uid}"
    )


def wait_for_socket(
    socket_path: Path, process: subprocess.Popen[bytes]
) -> None:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if process.poll() is not None:
            _stdout, stderr = process.communicate()
            raise RuntimeError(
                "vault server exited before readiness: "
                + stderr.decode("utf-8", errors="replace")
            )
        try:
            if stat.S_ISSOCK(
                os.lstat(socket_path).st_mode
            ):
                return
        except FileNotFoundError:
            pass
        time.sleep(0.02)
    raise TimeoutError("vault socket readiness timed out")


def start_vault_server(
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    *,
    max_requests: int,
    lease_ttl_millis: int = 30_000,
    crash_phase: str | None = None,
) -> tuple[subprocess.Popen[bytes], int]:
    stage = "vault_server"
    input_directory, state_directory = reset_stage(
        root, stage, "vault"
    )
    for name, source in {
        "contract.json": root
        / "state"
        / "protocol_contract"
        / "contract.json",
        "included.json": root
        / "state"
        / "vault_include"
        / "included.json",
        "under-review.json": root
        / "state"
        / "vault_blind"
        / "under-review.json",
        "own-public.json": root / "public" / "vault.json",
    }.items():
        copy_input(input_directory, name, source, "vault")
    socket_path = root / "ipc" / "vault.sock"
    socket_path.unlink(missing_ok=True)
    crash_options = (
        []
        if crash_phase is None
        else [
            "--crash-ordinal",
            "0",
            "--crash-phase",
            crash_phase,
        ]
    )
    command = base_sandbox(
        "vault",
        input_directory,
        state_directory,
        root,
        repository,
        python_root,
        node_executable,
        vault_state=True,
    ) + [
        "/opt/python/bin/python3.13",
        "-I",
        SERVER,
        "--socket",
        "/run/ipc/vault.sock",
        "--common-input",
        "/input",
        "--state-directory",
        "/state",
        "--vault-state",
        "/vault-state",
        "--max-requests",
        str(max_requests),
        "--lease-ttl-millis",
        str(lease_ttl_millis),
        *crash_options,
        "--worker-command",
        *worker_command(),
    ]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for_socket(socket_path, process)
    os.chown(
        socket_path,
        ROLE_UIDS["vault"],
        ROLE_UIDS["vault"],
        follow_symlinks=False,
    )
    os.chmod(socket_path, 0o666)
    return process, process_uid(
        process.pid, ROLE_UIDS["vault"]
    )


def sign_request(
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    *,
    stage: str,
    role: str,
    protocol_id: str,
    action: str,
    request_id: str,
    sender_sequence: int,
    nonce: str,
    timestamp: str,
    task_handle: str | None,
    subject_commitment: str | None = None,
    capability: Path | None = None,
    protocol_override: str | None = None,
    capability_mutation: str | None = None,
    rogue: bool = False,
) -> Path:
    extra: dict[str, Any] = {
        "action": action,
        "requestId": request_id,
        "senderSequence": sender_sequence,
        "nonce": nonce,
        "taskHandle": task_handle,
        "subjectCommitment": subject_commitment,
    }
    if protocol_override is not None:
        extra["protocolOverride"] = protocol_override
    if capability_mutation is not None:
        extra["capabilityMutation"] = capability_mutation
    input_directory, _state = prepare_stage(
        root,
        stage,
        role,
        "sign_request",
        timestamp,
        protocol_id,
        extra=extra,
    )
    copy_input(
        input_directory,
        "contract.json",
        root
        / "state"
        / "protocol_contract"
        / "contract.json",
        role,
    )
    if capability is not None:
        copy_input(
            input_directory,
            "capability.json",
            capability,
            role,
        )
    if rogue:
        copy_input(
            input_directory,
            "rogue-public.json",
            root / "public" / "rogue-evaluator.json",
            role,
        )
        copy_input(
            input_directory,
            "rogue-private.pem",
            root / "source" / "rogue-evaluator-private.pem",
            role,
        )
        configuration = read_json(
            input_directory / "config.json"
        )
        (input_directory / "config.json").unlink()
        configuration["signingPublicPath"] = (
            "/input/rogue-public.json"
        )
        configuration["signingPrivatePath"] = (
            "/input/rogue-private.pem"
        )
        write_input(
            input_directory,
            "config.json",
            configuration,
            role,
        )
    run_worker(
        role,
        stage,
        root,
        repository,
        python_root,
        node_executable,
    )
    return root / "state" / stage / "request.json"


def client_command(
    role: str,
    stage: str,
    request: Path,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
) -> list[str]:
    input_directory, state_directory = reset_stage(
        root, f"client_{stage}", role
    )
    copy_input(
        input_directory,
        "request.json",
        request,
        role,
    )
    return base_sandbox(
        role,
        input_directory,
        state_directory,
        root,
        repository,
        python_root,
        node_executable,
    ) + [
        "/opt/python/bin/python3.13",
        "-I",
        CLIENT,
        "--socket",
        "/run/ipc/vault.sock",
        "--request",
        "/input/request.json",
        "--expected-server-uid",
        str(ROLE_UIDS["vault"]),
        "--expected-server-gid",
        str(ROLE_UIDS["vault"]),
    ]


def send_request(
    role: str,
    stage: str,
    request: Path,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
) -> dict[str, Any]:
    completed = subprocess.run(
        client_command(
            role,
            stage,
            request,
            root,
            repository,
            python_root,
            node_executable,
        ),
        capture_output=True,
        check=False,
        timeout=75,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"vault client {stage} failed: "
            + completed.stderr.decode(
                "utf-8", errors="replace"
            )[:3000]
        )
    return json.loads(completed.stdout)


def role_probe(
    role: str,
    stage: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    protocol_id: str,
    vault_pid: int,
    journal_file: Path,
) -> dict[str, Any]:
    input_directory, state_directory = reset_stage(
        root, stage, role
    )
    command = base_sandbox(
        role,
        input_directory,
        state_directory,
        root,
        repository,
        python_root,
        node_executable,
        protected_probe=True,
    ) + [
        "/opt/python/bin/python3.13",
        "-I",
        "/opt/seh/evaluator/os_role_probe.py",
        "--role",
        role,
        "--own-key",
        f"/protected/keys/{role}/private.pem",
        "--challenge",
        f"body-free-os:{role}:{protocol_id}",
    ]
    for other in ROLE_UIDS:
        if other == role:
            continue
        forbidden = (
            f"/protected/keys/{other}/private.pem"
        )
        command.extend(
            [
                "--forbidden-read",
                forbidden,
                "--forbidden-write",
                forbidden,
            ]
        )
    for sensitive in (
        "/protected/sensitive/author-identity/identity.json",
        "/protected/sensitive/raw-handle/task.txt",
    ):
        owner_role = (
            "benchmark_author"
            if "author-identity" in sensitive
            else "vault"
        )
        if role != owner_role:
            command.extend(
                [
                    "--forbidden-read",
                    sensitive,
                    "--forbidden-write",
                    sensitive,
                ]
            )
    if role != "vault":
        relative_journal = journal_file.relative_to(root)
        command.extend(
            [
                "--forbidden-read",
                f"/protected/{relative_journal}",
                "--forbidden-write",
                f"/protected/{relative_journal}",
                "--target-pid",
                str(vault_pid),
            ]
        )
    completed = subprocess.run(
        command,
        capture_output=True,
        check=False,
        timeout=20,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"role probe {role} failed: "
            + completed.stderr.decode(
                "utf-8", errors="replace"
            )[:3000]
        )
    return json.loads(completed.stdout)


def socket_replacement_probe(
    role: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
) -> dict[str, Any]:
    stage = f"socket_probe_{role}"
    input_directory, state_directory = reset_stage(
        root, stage, role
    )
    code = (
        "import json,os,socket\n"
        "p='/run/ipc/vault.sock'\n"
        "unlink=''\n"
        "bind=''\n"
        "try:\n"
        " os.unlink(p)\n"
        " unlink='unexpected_success'\n"
        "except OSError as e:\n"
        " unlink=f'{e.errno}:{e.strerror}'\n"
        "s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)\n"
        "try:\n"
        " s.bind(p)\n"
        " bind='unexpected_success'\n"
        "except OSError as e:\n"
        " bind=f'{e.errno}:{e.strerror}'\n"
        "finally:\n"
        " s.close()\n"
        "if unlink=='unexpected_success' or bind=='unexpected_success':\n"
        " raise PermissionError('socket replacement succeeded')\n"
        "print(json.dumps({'unlinkDenied':unlink,'bindDenied':bind},"
        "sort_keys=True,separators=(',',':')))\n"
    )
    completed = subprocess.run(
        base_sandbox(
            role,
            input_directory,
            state_directory,
            root,
            repository,
            python_root,
            node_executable,
        )
        + ["/opt/python/bin/python3.13", "-I", "-c", code],
        capture_output=True,
        check=False,
        timeout=10,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"socket replacement probe {role} failed: "
            + completed.stderr.decode(
                "utf-8", errors="replace"
            )
        )
    return json.loads(completed.stdout)


def outer_uid_for(inner_uid: int) -> int:
    for line in Path("/proc/self/uid_map").read_text().splitlines():
        inner_start, outer_start, count = [
            int(value) for value in line.split()
        ]
        if inner_start <= inner_uid < inner_start + count:
            return outer_start + (inner_uid - inner_start)
    raise ValueError(f"inner UID {inner_uid} is not mapped")


def receipt_hash(state: Path) -> str:
    return read_json(state / "receipt.json")["receiptHash"]


def main() -> int:
    arguments = parse_arguments()
    root = Path(arguments.root).resolve()
    repository = Path(arguments.repository).resolve()
    python_root = Path(arguments.python_root).resolve()
    node_executable = Path(arguments.node_executable).resolve()
    protocol_id = "protocol-sha256:" + "9" * 64
    task_handle = "opaque-task-sha256:" + "8" * 64
    workflow_id = "body-free-os.authorship.workflow.v1"
    server: subprocess.Popen[bytes] | None = None
    try:
        if os.geteuid() != 0:
            raise PermissionError(
                "body-free OS gate requires root in a user namespace"
            )
        prepare_ownership(root)
        principals = read_json(root / "public" / "principals.json")

        protocol_input, _state = prepare_stage(
            root,
            "protocol_contract",
            "protocol_author",
            "freeze_contract",
            "2026-07-31T21:00:00.000Z",
            protocol_id,
            extra={
                "contractId": "body-free-os.vault-contract.v1"
            },
        )
        write_input(
            protocol_input,
            "principals.json",
            principals,
            "protocol_author",
        )
        run_worker(
            "protocol_author",
            "protocol_contract",
            root,
            repository,
            python_root,
            node_executable,
        )

        assign_input, _state = prepare_stage(
            root,
            "protocol_assign",
            "protocol_author",
            "assign",
            "2026-07-31T21:01:00.000Z",
            protocol_id,
            extra={
                "workflowId": workflow_id,
                "taskHandle": task_handle,
            },
        )
        copy_input(
            assign_input,
            "contract.json",
            root
            / "state"
            / "protocol_contract"
            / "contract.json",
            "protocol_author",
        )
        run_worker(
            "protocol_author",
            "protocol_assign",
            root,
            repository,
            python_root,
            node_executable,
        )

        commit_input, _state = prepare_stage(
            root,
            "author_commit",
            "benchmark_author",
            "commit",
            "2026-07-31T21:02:00.000Z",
            protocol_id,
        )
        for name, source in {
            "contract.json": root
            / "state"
            / "protocol_contract"
            / "contract.json",
            "assigned.json": root
            / "state"
            / "protocol_assign"
            / "assigned.json",
        }.items():
            copy_input(
                commit_input,
                name,
                source,
                "benchmark_author",
            )
        run_worker(
            "benchmark_author",
            "author_commit",
            root,
            repository,
            python_root,
            node_executable,
        )

        blind_input, _state = prepare_stage(
            root,
            "vault_blind",
            "vault",
            "blind",
            "2026-07-31T21:03:00.000Z",
            protocol_id,
        )
        for name, source in {
            "contract.json": root
            / "state"
            / "protocol_contract"
            / "contract.json",
            "assigned.json": root
            / "state"
            / "protocol_assign"
            / "assigned.json",
            "committed.json": root
            / "state"
            / "author_commit"
            / "committed.json",
        }.items():
            copy_input(blind_input, name, source, "vault")
        run_worker(
            "vault",
            "vault_blind",
            root,
            repository,
            python_root,
            node_executable,
        )

        reviewer_input, _state = prepare_stage(
            root,
            "reviewer_decide",
            "benchmark_reviewer",
            "decide",
            "2026-07-31T21:04:00.000Z",
            protocol_id,
        )
        for name, source in {
            "reviewer-projection.json": root
            / "state"
            / "protocol_contract"
            / "reviewer-projection.json",
            "review.json": root
            / "state"
            / "vault_blind"
            / "review.json",
        }.items():
            copy_input(
                reviewer_input,
                name,
                source,
                "benchmark_reviewer",
            )
        reviewer_bytes = b"".join(
            file.read_bytes()
            for file in sorted(reviewer_input.iterdir())
        )
        author_identity = principals["benchmark_author"][
            "identity"
        ]["principalId"].encode()
        reviewer_leak_free = (
            task_handle.encode() not in reviewer_bytes
            and author_identity not in reviewer_bytes
            and b"BEGIN PRIVATE KEY" not in reviewer_bytes
        )
        if not reviewer_leak_free:
            raise PermissionError(
                "reviewer projection contains author or raw-handle material"
            )
        run_worker(
            "benchmark_reviewer",
            "reviewer_decide",
            root,
            repository,
            python_root,
            node_executable,
        )

        include_input, _state = prepare_stage(
            root,
            "vault_include",
            "vault",
            "include",
            "2026-07-31T21:05:00.000Z",
            protocol_id,
        )
        for name, source in {
            "contract.json": root
            / "state"
            / "protocol_contract"
            / "contract.json",
            "review.json": root
            / "state"
            / "vault_blind"
            / "review.json",
            "under-review.json": root
            / "state"
            / "vault_blind"
            / "under-review.json",
            "decision.json": root
            / "state"
            / "reviewer_decide"
            / "decision.json",
        }.items():
            copy_input(include_input, name, source, "vault")
        run_worker(
            "vault",
            "vault_include",
            root,
            repository,
            python_root,
            node_executable,
        )

        included = read_json(
            root / "state" / "vault_include" / "included.json"
        )
        server, vault_pid = start_vault_server(
            root,
            repository,
            python_root,
            node_executable,
            max_requests=16,
        )
        socket_denials = {
            role: socket_replacement_probe(
                role,
                root,
                repository,
                python_root,
                node_executable,
            )
            for role in ROLE_UIDS
            if role != "vault"
        }
        transports: list[dict[str, Any]] = []

        def record_transport(
            stage: str,
            role: str,
            request: Path,
            response: dict[str, Any],
        ) -> None:
            transports.append(
                {
                    "stage": stage,
                    "role": role,
                    "requestHash": read_json(request)[
                        "requestHash"
                    ],
                    "transportAccepted": response[
                        "transportAccepted"
                    ],
                    "peer": response.get("peer"),
                    "verifiedServerPeer": response.get(
                        "verifiedServerPeer"
                    ),
                    "worker": response.get("worker"),
                    "result": response.get("result"),
                    "receiptHash": (
                        response.get("receipt") or {}
                    ).get("receiptHash"),
                }
            )

        def sign_and_send(
            *,
            stage: str,
            role: str,
            action: str,
            sequence: int,
            nonce: str,
            timestamp: str,
            request_task: str | None,
            subject: str | None = None,
            capability: Path | None = None,
            protocol_override: str | None = None,
            capability_mutation: str | None = None,
            rogue: bool = False,
        ) -> dict[str, Any]:
            request = sign_request(
                root,
                repository,
                python_root,
                node_executable,
                stage=stage,
                role=role,
                protocol_id=protocol_id,
                action=action,
                request_id=f"body-free-os.request.{stage}",
                sender_sequence=sequence,
                nonce=nonce,
                timestamp=timestamp,
                task_handle=request_task,
                subject_commitment=subject,
                capability=capability,
                protocol_override=protocol_override,
                capability_mutation=capability_mutation,
                rogue=rogue,
            )
            response = send_request(
                role,
                stage,
                request,
                root,
                repository,
                python_root,
                node_executable,
            )
            record_transport(
                stage, role, request, response
            )
            return response

        create_response = sign_and_send(
            stage="create",
            role="benchmark_author",
            action="create",
            sequence=0,
            nonce="body-free-os-create-nonce-0001",
            timestamp="2026-07-31T21:06:00.000Z",
            request_task=task_handle,
            subject=included["recordHash"],
        )
        if not create_response["result"]["ok"]:
            raise RuntimeError("vault create failed")

        seal_response = sign_and_send(
            stage="seal",
            role="vault",
            action="seal",
            sequence=0,
            nonce="body-free-os-seal-nonce-0001",
            timestamp="2026-07-31T21:07:00.000Z",
            request_task=task_handle,
            subject=included["recordHash"],
        )
        if seal_response["result"]["taskState"] != "sealed":
            raise RuntimeError("vault seal failed")

        capability_input, _state = prepare_stage(
            root,
            "vault_capability",
            "vault",
            "issue_capability",
            "2026-07-31T21:08:00.000Z",
            protocol_id,
            extra={
                "taskHandle": task_handle,
                "leaseOwnerId": "body-free-os.capability",
                "leaseTtlMillis": 30_000,
            },
        )
        for name, source in {
            "contract.json": root
            / "state"
            / "protocol_contract"
            / "contract.json",
            "included.json": root
            / "state"
            / "vault_include"
            / "included.json",
            "under-review.json": root
            / "state"
            / "vault_blind"
            / "under-review.json",
        }.items():
            copy_input(
                capability_input, name, source, "vault"
            )
        run_worker(
            "vault",
            "vault_capability",
            root,
            repository,
            python_root,
            node_executable,
            vault_state=True,
        )
        capability_path = (
            root
            / "state"
            / "vault_capability"
            / "capability.json"
        )

        evaluation_commitment = (
            "sha256:"
            + hashlib.sha256(
                b"body-free-os.synthetic-evaluation"
            ).hexdigest()
        )
        early = sign_and_send(
            stage="early_evaluate",
            role="evaluator",
            action="evaluate",
            sequence=0,
            nonce="body-free-os-early-evaluate-0001",
            timestamp="2026-07-31T21:09:00.000Z",
            request_task=task_handle,
            subject=evaluation_commitment,
        )
        mismatch = sign_and_send(
            stage="protocol_mismatch",
            role="evaluator",
            action="unlock",
            sequence=0,
            nonce="body-free-os-protocol-mismatch-0001",
            timestamp="2026-07-31T21:09:01.000Z",
            request_task=task_handle,
            capability=capability_path,
            protocol_override="protocol-sha256:" + "7" * 64,
        )
        substitution = sign_and_send(
            stage="capability_substitution",
            role="evaluator",
            action="unlock",
            sequence=0,
            nonce="body-free-os-capability-substitution-0001",
            timestamp="2026-07-31T21:09:02.000Z",
            request_task=task_handle,
            capability=capability_path,
            capability_mutation="substitute",
        )
        wrong_key = sign_and_send(
            stage="wrong_key",
            role="evaluator",
            action="unlock",
            sequence=0,
            nonce="body-free-os-wrong-key-0001",
            timestamp="2026-07-31T21:09:03.000Z",
            request_task=task_handle,
            capability=capability_path,
            rogue=True,
        )
        for response, code in (
            (early, "INVALID_STATE_TRANSITION"),
            (mismatch, "PROTOCOL_MISMATCH"),
            (substitution, "HASH_MISMATCH"),
            (wrong_key, "AUTHENTICATION_FAILED"),
        ):
            if response["result"]["failure"]["code"] != code:
                raise RuntimeError(
                    f"expected {code}, got {response['result']}"
                )

        race_a = sign_request(
            root,
            repository,
            python_root,
            node_executable,
            stage="unlock_race_a",
            role="evaluator",
            protocol_id=protocol_id,
            action="unlock",
            request_id="body-free-os.request.unlock-race-a",
            sender_sequence=0,
            nonce="body-free-os-unlock-race-a-0001",
            timestamp="2026-07-31T21:10:00.000Z",
            task_handle=task_handle,
            capability=capability_path,
        )
        race_b = sign_request(
            root,
            repository,
            python_root,
            node_executable,
            stage="unlock_race_b",
            role="evaluator",
            protocol_id=protocol_id,
            action="unlock",
            request_id="body-free-os.request.unlock-race-b",
            sender_sequence=0,
            nonce="body-free-os-unlock-race-b-0001",
            timestamp="2026-07-31T21:10:00.001Z",
            task_handle=task_handle,
            capability=capability_path,
        )
        race_processes = [
            subprocess.Popen(
                client_command(
                    "evaluator",
                    "unlock_race_a",
                    race_a,
                    root,
                    repository,
                    python_root,
                    node_executable,
                ),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            ),
            subprocess.Popen(
                client_command(
                    "evaluator",
                    "unlock_race_b",
                    race_b,
                    root,
                    repository,
                    python_root,
                    node_executable,
                ),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            ),
        ]
        race_responses: list[dict[str, Any]] = []
        for process in race_processes:
            stdout, stderr = process.communicate(timeout=75)
            if process.returncode != 0:
                raise RuntimeError(
                    "unlock race client failed: "
                    + stderr.decode("utf-8", errors="replace")
                )
            race_responses.append(json.loads(stdout))
        race_successes = [
            response
            for response in race_responses
            if response.get("result", {}).get("ok") is True
        ]
        if len(race_successes) != 1:
            raise RuntimeError(
                f"unlock race produced {len(race_successes)} successes"
            )
        for stage, request, response in (
            ("unlock_race_a", race_a, race_responses[0]),
            ("unlock_race_b", race_b, race_responses[1]),
        ):
            transports.append(
                {
                    "stage": stage,
                    "role": "evaluator",
                    "requestHash": read_json(request)[
                        "requestHash"
                    ],
                    "transportAccepted": response[
                        "transportAccepted"
                    ],
                    "peer": response.get("peer"),
                    "verifiedServerPeer": response.get(
                        "verifiedServerPeer"
                    ),
                    "worker": response.get("worker"),
                    "result": response.get("result"),
                    "receiptHash": (
                        response.get("receipt") or {}
                    ).get("receiptHash"),
                }
            )

        fresh_duplicate = sign_and_send(
            stage="fresh_duplicate_unlock",
            role="evaluator",
            action="unlock",
            sequence=1,
            nonce="body-free-os-fresh-unlock-0001",
            timestamp="2026-07-31T21:10:01.000Z",
            request_task=task_handle,
            capability=capability_path,
        )
        if (
            fresh_duplicate["result"]["failure"]["code"]
            != "INVALID_STATE_TRANSITION"
        ):
            raise RuntimeError("fresh duplicate unlock was not denied")

        evaluate_request = sign_request(
            root,
            repository,
            python_root,
            node_executable,
            stage="evaluate",
            role="evaluator",
            protocol_id=protocol_id,
            action="evaluate",
            request_id="body-free-os.request.evaluate",
            sender_sequence=1,
            nonce="body-free-os-evaluate-nonce-0001",
            timestamp="2026-07-31T21:11:00.000Z",
            task_handle=task_handle,
            subject_commitment=evaluation_commitment,
        )
        evaluate_response = send_request(
            "evaluator",
            "evaluate",
            evaluate_request,
            root,
            repository,
            python_root,
            node_executable,
        )
        transports.append(
            {
                "stage": "evaluate",
                "role": "evaluator",
                "requestHash": read_json(evaluate_request)[
                    "requestHash"
                ],
                "transportAccepted": evaluate_response[
                    "transportAccepted"
                ],
                "peer": evaluate_response.get("peer"),
                "verifiedServerPeer": evaluate_response.get(
                    "verifiedServerPeer"
                ),
                "worker": evaluate_response.get("worker"),
                "result": evaluate_response.get("result"),
                "receiptHash": evaluate_response["receipt"][
                    "receiptHash"
                ],
            }
        )
        exact_retry = send_request(
            "evaluator",
            "evaluate_retry",
            evaluate_request,
            root,
            repository,
            python_root,
            node_executable,
        )
        transports.append(
            {
                "stage": "evaluate_exact_retry",
                "role": "evaluator",
                "requestHash": read_json(evaluate_request)[
                    "requestHash"
                ],
                "transportAccepted": exact_retry[
                    "transportAccepted"
                ],
                "peer": exact_retry.get("peer"),
                "verifiedServerPeer": exact_retry.get(
                    "verifiedServerPeer"
                ),
                "worker": exact_retry.get("worker"),
                "result": exact_retry.get("result"),
                "receiptHash": exact_retry["receipt"][
                    "receiptHash"
                ],
            }
        )
        if (
            evaluate_response["result"]["accessRecordHash"]
            != exact_retry["result"]["accessRecordHash"]
        ):
            raise RuntimeError("exact retry changed its committed disposition")

        scorer_wrong = sign_and_send(
            stage="scorer_wrong_evaluate",
            role="scorer",
            action="evaluate",
            sequence=0,
            nonce="body-free-os-scorer-wrong-0001",
            timestamp="2026-07-31T21:12:00.000Z",
            request_task=task_handle,
            subject=evaluation_commitment,
        )
        if (
            scorer_wrong["result"]["failure"]["code"]
            != "AUTHORIZATION_DENIED"
        ):
            raise RuntimeError("scorer action authority was not denied")

        score_response = sign_and_send(
            stage="score",
            role="scorer",
            action="score",
            sequence=0,
            nonce="body-free-os-score-nonce-0001",
            timestamp="2026-07-31T21:13:00.000Z",
            request_task=task_handle,
            subject=evaluation_commitment,
        )
        score_commitment = score_response["result"]["outcome"][
            "releasedCommitments"
        ][0]

        author_wrong = sign_and_send(
            stage="author_wrong_audit",
            role="benchmark_author",
            action="audit",
            sequence=1,
            nonce="body-free-os-author-wrong-0001",
            timestamp="2026-07-31T21:14:00.000Z",
            request_task=None,
        )
        promoter_wrong = sign_and_send(
            stage="promoter_wrong_score",
            role="promoter",
            action="score",
            sequence=0,
            nonce="body-free-os-promoter-wrong-0001",
            timestamp="2026-07-31T21:14:01.000Z",
            request_task=task_handle,
            subject=evaluation_commitment,
        )
        for response in (author_wrong, promoter_wrong):
            if (
                response["result"]["failure"]["code"]
                != "AUTHORIZATION_DENIED"
            ):
                raise RuntimeError("wrong role reached vault authority")

        pre_audit_journal_files = sorted(
            file
            for file in (root / "vault-state").rglob("*")
            if file.is_file()
        )
        if not pre_audit_journal_files:
            raise RuntimeError("vault state journal is empty")
        probes = {
            role: role_probe(
                role,
                f"probe_{role}",
                root,
                repository,
                python_root,
                node_executable,
                protocol_id,
                vault_pid,
                pre_audit_journal_files[0],
            )
            for role in ROLE_UIDS
        }

        audit_response = sign_and_send(
            stage="audit",
            role="audit_store",
            action="audit",
            sequence=0,
            nonce="body-free-os-audit-nonce-0001",
            timestamp="2026-07-31T21:15:00.000Z",
            request_task=None,
        )
        _stdout, server_stderr = server.communicate(timeout=90)
        if server.returncode != 0:
            raise RuntimeError(
                "vault server failed: "
                + server_stderr.decode(
                    "utf-8", errors="replace"
                )[:4000]
            )
        server = None

        crash_ttl_millis = 3_000
        durable_crash_request = sign_request(
            root,
            repository,
            python_root,
            node_executable,
            stage="crash_after_durable_commit",
            role="vault",
            protocol_id=protocol_id,
            action="enumerate",
            request_id=(
                "body-free-os.request."
                "crash-after-durable-commit"
            ),
            sender_sequence=1,
            nonce=(
                "body-free-os-crash-after-durable-"
                "commit-0001"
            ),
            timestamp="2026-07-31T21:15:10.000Z",
            task_handle=None,
        )
        server, _crash_vault_pid = start_vault_server(
            root,
            repository,
            python_root,
            node_executable,
            max_requests=1,
            lease_ttl_millis=crash_ttl_millis,
            crash_phase=(
                "after_durable_commit_before_release"
            ),
        )
        durable_crash = send_request(
            "vault",
            "crash_after_durable_commit",
            durable_crash_request,
            root,
            repository,
            python_root,
            node_executable,
        )
        record_transport(
            "crash_after_durable_commit",
            "vault",
            durable_crash_request,
            durable_crash,
        )
        if (
            durable_crash["result"] is not None
            or durable_crash["worker"]["returnCode"] == 0
        ):
            raise RuntimeError(
                "durable-commit crash was acknowledged"
            )
        _stdout, crash_stderr = server.communicate(
            timeout=90
        )
        if server.returncode != 0:
            raise RuntimeError(
                "durable-commit crash server failed: "
                + crash_stderr.decode(
                    "utf-8", errors="replace"
                )[:4000]
            )
        server = None
        time.sleep((crash_ttl_millis + 250) / 1000)

        server, _recovery_vault_pid = start_vault_server(
            root,
            repository,
            python_root,
            node_executable,
            max_requests=1,
        )
        durable_recovery = send_request(
            "vault",
            "recover_after_durable_commit",
            durable_crash_request,
            root,
            repository,
            python_root,
            node_executable,
        )
        record_transport(
            "recover_after_durable_commit",
            "vault",
            durable_crash_request,
            durable_recovery,
        )
        _stdout, recovery_stderr = server.communicate(
            timeout=90
        )
        if server.returncode != 0:
            raise RuntimeError(
                "durable-commit recovery server failed: "
                + recovery_stderr.decode(
                    "utf-8", errors="replace"
                )[:4000]
            )
        server = None
        if (
            durable_recovery["result"]["ok"] is not True
            or durable_recovery["result"][
                "transitionCount"
            ]
            != audit_response["result"][
                "transitionCount"
            ]
            + 1
        ):
            raise RuntimeError(
                "durable committed disposition was not "
                "reconstructed exactly once"
            )

        hardlink_crash_request = sign_request(
            root,
            repository,
            python_root,
            node_executable,
            stage="crash_during_hardlink_append",
            role="audit_store",
            protocol_id=protocol_id,
            action="audit",
            request_id=(
                "body-free-os.request."
                "crash-during-hardlink-append"
            ),
            sender_sequence=1,
            nonce=(
                "body-free-os-crash-during-hardlink-"
                "append-0001"
            ),
            timestamp="2026-07-31T21:15:20.000Z",
            task_handle=None,
        )
        server, _hardlink_vault_pid = start_vault_server(
            root,
            repository,
            python_root,
            node_executable,
            max_requests=1,
            lease_ttl_millis=crash_ttl_millis,
            crash_phase="during_state_append",
        )
        hardlink_crash = send_request(
            "audit_store",
            "crash_during_hardlink_append",
            hardlink_crash_request,
            root,
            repository,
            python_root,
            node_executable,
        )
        record_transport(
            "crash_during_hardlink_append",
            "audit_store",
            hardlink_crash_request,
            hardlink_crash,
        )
        if (
            hardlink_crash["result"] is not None
            or hardlink_crash["worker"]["returnCode"] == 0
        ):
            raise RuntimeError(
                "hardlink append crash was acknowledged"
            )
        _stdout, hardlink_stderr = server.communicate(
            timeout=90
        )
        if server.returncode != 0:
            raise RuntimeError(
                "hardlink crash server failed: "
                + hardlink_stderr.decode(
                    "utf-8", errors="replace"
                )[:4000]
            )
        server = None
        abandoned_hardlinks = [
            file
            for file in (root / "vault-state").rglob("*.tmp")
            if file.is_file()
        ]
        if not abandoned_hardlinks:
            raise RuntimeError(
                "hardlink crash did not leave a recovery target"
            )
        time.sleep((crash_ttl_millis + 250) / 1000)

        server, _hardlink_recovery_pid = start_vault_server(
            root,
            repository,
            python_root,
            node_executable,
            max_requests=1,
        )
        hardlink_recovery = send_request(
            "audit_store",
            "recover_hardlink_append",
            hardlink_crash_request,
            root,
            repository,
            python_root,
            node_executable,
        )
        record_transport(
            "recover_hardlink_append",
            "audit_store",
            hardlink_crash_request,
            hardlink_recovery,
        )
        _stdout, hardlink_recovery_stderr = (
            server.communicate(timeout=90)
        )
        if server.returncode != 0:
            raise RuntimeError(
                "hardlink recovery server failed: "
                + hardlink_recovery_stderr.decode(
                    "utf-8", errors="replace"
                )[:4000]
            )
        server = None
        abandoned_after_recovery = [
            file
            for file in (root / "vault-state").rglob("*.tmp")
            if file.is_file()
        ]
        if (
            hardlink_recovery["result"]["ok"] is not True
            or hardlink_recovery["result"][
                "transitionCount"
            ]
            != durable_recovery["result"][
                "transitionCount"
            ]
            + 1
            or abandoned_after_recovery
        ):
            raise RuntimeError(
                "published hardlink was not recovered exactly once"
            )

        promoter_input, _state = prepare_stage(
            root,
            "promoter_projection",
            "promoter",
            "promoter_projection",
            "2026-07-31T21:16:00.000Z",
            protocol_id,
        )
        copy_input(
            promoter_input,
            "contract.json",
            root
            / "state"
            / "protocol_contract"
            / "contract.json",
            "promoter",
        )
        write_input(
            promoter_input,
            "score-projection.json",
            {
                "scoreCommitment": score_commitment,
                "sourceAccessRecordHash": score_response[
                    "result"
                ]["accessRecordHash"],
            },
            "promoter",
        )
        run_worker(
            "promoter",
            "promoter_projection",
            root,
            repository,
            python_root,
            node_executable,
        )
        promoter_projection = read_json(
            root
            / "state"
            / "promoter_projection"
            / "promoter-projection.json"
        )

        role_receipt_hashes = [
            receipt_hash(root / "state" / stage)
            for stage in (
                "protocol_contract",
                "protocol_assign",
                "author_commit",
                "vault_blind",
                "reviewer_decide",
                "vault_include",
                "vault_capability",
                "promoter_projection",
            )
        ]
        role_receipt_hashes.extend(
            entry["receiptHash"]
            for entry in transports
            if entry["receiptHash"] is not None
        )
        access_record_hashes = sorted(
            {
                entry["result"]["accessRecordHash"]
                for entry in transports
                if entry["result"] is not None
                and entry["result"]["accessRecordHash"]
                is not None
            }
        )
        state_head = hardlink_recovery["result"][
            "stateHead"
        ]
        audit_input, _state = prepare_stage(
            root,
            "audit_finalize",
            "audit_store",
            "finalize_audit",
            "2026-07-31T21:17:00.000Z",
            protocol_id,
        )
        copy_input(
            audit_input,
            "contract.json",
            root
            / "state"
            / "protocol_contract"
            / "contract.json",
            "audit_store",
        )
        write_input(
            audit_input,
            "audit-summary.json",
            {
                "stateHead": state_head,
                "accessRecordHashes": access_record_hashes,
                "roleReceiptHashes": sorted(
                    set(role_receipt_hashes)
                ),
                "promoterProjectionHash": promoter_projection[
                    "recordHash"
                ],
            },
            "audit_store",
        )
        run_worker(
            "audit_store",
            "audit_finalize",
            root,
            repository,
            python_root,
            node_executable,
        )
        final_audit = read_json(
            root
            / "state"
            / "audit_finalize"
            / "final-audit.json"
        )

        journal_files = sorted(
            file
            for file in (root / "vault-state").rglob("*")
            if file.is_file()
        )
        journal_owners = sorted(
            {
                os.stat(
                    file, follow_symlinks=False
                ).st_uid
                for file in journal_files
            }
        )
        evidence = {
            "schemaVersion": 1,
            "recordType":
                "body_free_evaluator_vault_os_boundary_evidence",
            "isolationClass":
                "os_enforced_subordinate_uids",
            "roleUids": ROLE_UIDS,
            "publicPrincipals": principals,
            "hostRoleUids": {
                role: outer_uid_for(uid)
                for role, uid in ROLE_UIDS.items()
            },
            "keyOwners": {
                role: os.stat(
                    root / "keys" / role / "private.pem",
                    follow_symlinks=False,
                ).st_uid
                for role in ROLE_UIDS
            },
            "reviewerBoundary": {
                "inputFiles": sorted(
                    file.name
                    for file in reviewer_input.iterdir()
                ),
                "authorIdentityPresent": False,
                "rawTaskHandlePresent": False,
                "privateKeyPresent": False,
                "projectionHash": read_json(
                    root
                    / "state"
                    / "protocol_contract"
                    / "reviewer-projection.json"
                )["projectionHash"],
            },
            "authorship": {
                "assignmentHash": read_json(
                    root
                    / "state"
                    / "protocol_assign"
                    / "assigned.json"
                )["recordHash"],
                "authorCommitmentHash": read_json(
                    root
                    / "state"
                    / "author_commit"
                    / "committed.json"
                )["recordHash"],
                "reviewHash": read_json(
                    root
                    / "state"
                    / "vault_blind"
                    / "review.json"
                )["recordHash"],
                "reviewDecisionHash": read_json(
                    root
                    / "state"
                    / "reviewer_decide"
                    / "decision.json"
                )["recordHash"],
                "includedTransitionHash": included[
                    "recordHash"
                ],
            },
            "transport": {
                "serverUid": ROLE_UIDS["vault"],
                "socketOwnedByVault": True,
                "transactions": transports,
                "socketReplacementDenials": socket_denials,
            },
            "vault": {
                "authoritativeJournal":
                    "vault_state_cas_journal",
                "journalOwners": journal_owners,
                "journalFileCount": len(journal_files),
                "stateHead": state_head,
                "accessRecordHashes": access_record_hashes,
                "unlockRaceSuccesses": len(race_successes),
                "unlockRaceWorkerOrdinals": sorted(
                    response["worker"]["ordinal"]
                    for response in race_responses
                ),
                "freshDuplicateUnlockDenied": True,
                "exactRetryStable": True,
                "restartReconstructed": True,
                "crashRecovery": {
                    "actualSigkillPhases": [
                        "after_durable_commit_before_release",
                        "during_state_append",
                    ],
                    "crashWorkersUnacknowledged": [
                        durable_crash["result"] is None
                        and durable_crash["worker"][
                            "returnCode"
                        ]
                        != 0,
                        hardlink_crash["result"] is None
                        and hardlink_crash["worker"][
                            "returnCode"
                        ]
                        != 0,
                    ],
                    "durableCommit": {
                        "recoveredExactlyOnce": True,
                        "transitionCount": (
                            durable_recovery["result"][
                                "transitionCount"
                            ]
                        ),
                        "accessRecordHash": (
                            durable_recovery["result"][
                                "accessRecordHash"
                            ]
                        ),
                    },
                    "publishedHardlink": {
                        "stagingObservedBeforeRecovery":
                            bool(abandoned_hardlinks),
                        "stagingRemovedAfterRecovery":
                            not abandoned_after_recovery,
                        "recoveredExactlyOnce": True,
                        "transitionCount": (
                            hardlink_recovery["result"][
                                "transitionCount"
                            ]
                        ),
                        "accessRecordHash": (
                            hardlink_recovery["result"][
                                "accessRecordHash"
                            ]
                        ),
                    },
                },
            },
            "roleProbes": probes,
            "promoterProjection": promoter_projection,
            "finalAudit": final_audit,
            "bodyAbsence": {
                "bodyPresent": False,
                "verifierLogicPresent": False,
                "labelsPresent": False,
                "pathsPresent": False,
                "bodyAccess":
                    "none_in_body_free_contract_prototype",
            },
            "providerUsed": False,
            "researchEvidenceAuthorized": False,
            "promotionAuthorized": False,
        }
        if task_handle.encode() in canonical(evidence):
            raise PermissionError(
                "raw opaque task handle leaked into evidence"
            )
        evidence["evidenceHash"] = digest(evidence)
        print(canonical(evidence).decode("utf-8"))
        return 0
    finally:
        if server is not None and server.poll() is None:
            server.kill()
            server.communicate()
        restore_ownership(root)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(
            f"body-free evaluator-vault OS gate failed: {error}",
            file=sys.stderr,
        )
        raise SystemExit(2)
