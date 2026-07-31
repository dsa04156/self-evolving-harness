#!/usr/bin/env python3
"""Subordinate-UID evidence track for the credential-owning provider proxy."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import time
from typing import Any


ROLE_UIDS = {
    "runtime": 1102,
    "provider": 1106,
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--repository", required=True)
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
        for file in role_root.iterdir():
            os.chmod(file, 0o600)
        state = root / "state" / role
        chown_tree(state, uid, uid)
        os.chmod(state, 0o700)
    os.chmod(root / "ipc", 0o1777)
    os.chmod(root / "public", 0o755)
    for public_file in (root / "public").iterdir():
        os.chmod(public_file, 0o644)


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
                os.chmod(
                    directory,
                    stat.S_IMODE(os.lstat(directory).st_mode) | 0o700,
                )
            except FileNotFoundError:
                pass
    os.chown(root, 0, 0, follow_symlinks=False)
    os.chmod(root, stat.S_IMODE(os.lstat(root).st_mode) | 0o700)


def base_sandbox(
    role: str,
    root: Path,
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
        "--chmod",
        "1777",
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
            "/opt/seh",
            "--setenv",
            "PATH",
            "/opt/node/bin:/usr/bin:/bin",
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


def add_read_only_mounts(
    command: list[str],
    mounts: list[tuple[Path, str]],
) -> None:
    options: list[str] = []
    for source, destination in mounts:
        options.extend(["--ro-bind", str(source), destination])
    command[command.index("--") : command.index("--")] = options


def node_mounts(
    repository: Path,
    node_executable: Path,
) -> list[tuple[Path, str]]:
    return [
        (repository / "node_modules", "/opt/seh/node_modules"),
        (repository / "package.json", "/opt/seh/package.json"),
        (repository / "schemas", "/opt/seh/schemas"),
        (repository / "src", "/opt/seh/src"),
        (repository / "tsconfig.json", "/opt/seh/tsconfig.json"),
        (node_executable, "/opt/node/bin/node"),
    ]


def wait_for_socket(socket_path: Path, process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if process.poll() is not None:
            _stdout, stderr = process.communicate()
            raise RuntimeError(
                "provider exited before socket readiness: "
                + stderr.decode("utf-8", errors="replace")
            )
        try:
            if stat.S_ISSOCK(os.lstat(socket_path).st_mode):
                return
        except FileNotFoundError:
            pass
        time.sleep(0.02)
    raise TimeoutError("provider socket readiness timed out")


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
                values = next(
                    line
                    for line in Path(
                        f"/proc/{candidate}/status"
                    ).read_text().splitlines()
                    if line.startswith("Uid:")
                ).split()
                if int(values[2]) == expected_uid:
                    return candidate
            except (FileNotFoundError, StopIteration):
                pass
            try:
                pending.extend(
                    int(value)
                    for value in Path(
                        f"/proc/{candidate}/task/{candidate}/children"
                    ).read_text().split()
                )
            except (FileNotFoundError, PermissionError):
                pass
        time.sleep(0.02)
    raise RuntimeError(f"no process reached expected UID {expected_uid}")


def start_provider(
    root: Path,
    repository: Path,
    node_executable: Path,
) -> tuple[subprocess.Popen[bytes], int]:
    socket_path = root / "ipc" / "provider.sock"
    socket_path.unlink(missing_ok=True)
    command = base_sandbox("provider", root)
    add_read_only_mounts(
        command,
        node_mounts(repository, node_executable)
        + [
            (
                repository / "scripts" / "provider-proxy-service.ts",
                "/opt/seh/scripts/provider-proxy-service.ts",
            ),
            (
                repository / "evaluator" / "provider_unix_front.py",
                "/opt/seh/evaluator/provider_unix_front.py",
            ),
        ],
    )
    command += [
        "/usr/bin/python3",
        "-I",
        "/opt/seh/evaluator/provider_unix_front.py",
        "--socket",
        "/run/ipc/provider.sock",
        "--expected-client-uid",
        str(ROLE_UIDS["runtime"]),
        "--expected-client-gid",
        str(ROLE_UIDS["runtime"]),
        "--timeout-millis",
        "30000",
        "--socket-mode",
        "660",
        "--",
        "/opt/node/bin/node",
        "/opt/seh/node_modules/tsx/dist/cli.mjs",
        "/opt/seh/scripts/provider-proxy-service.ts",
        "/run/config/provider-service.json",
    ]
    process = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    wait_for_socket(socket_path, process)
    os.chown(
        socket_path,
        ROLE_UIDS["provider"],
        ROLE_UIDS["runtime"],
        follow_symlinks=False,
    )
    os.chmod(socket_path, 0o660)
    return process, process_uid(process.pid, ROLE_UIDS["provider"])


def start_runtime_holder(
    root: Path,
) -> tuple[subprocess.Popen[bytes], int]:
    process = subprocess.Popen(
        base_sandbox("runtime", root) + ["/usr/bin/sleep", "30"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return process, process_uid(process.pid, ROLE_UIDS["runtime"])


def run_probe(
    role: str,
    target_pid: int,
    root: Path,
    repository: Path,
) -> dict[str, Any]:
    other = "provider" if role == "runtime" else "runtime"
    forbidden = [f"/vault/{other}/private.pem"]
    if role == "runtime":
        forbidden.append("/vault/provider/provider-secret")
    command = base_sandbox(role, root, vault_probe=True)
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
        "/usr/bin/python3",
        "-I",
        "/opt/seh/evaluator/os_role_probe.py",
        "--role",
        role,
        "--own-key",
        f"/vault/{role}/private.pem",
        "--challenge",
        f"seh-provider-os:{role}",
        "--target-pid",
        str(target_pid),
    ]
    for file in forbidden:
        command.extend(["--forbidden-read", file, "--forbidden-write", file])
    completed = subprocess.run(command, capture_output=True, timeout=15)
    if completed.returncode != 0:
        raise RuntimeError(
            f"{role} probe failed: "
            + completed.stderr.decode("utf-8", errors="replace")
        )
    return json.loads(completed.stdout)


def run_runtime(
    root: Path,
    repository: Path,
    node_executable: Path,
) -> dict[str, Any]:
    command = base_sandbox("runtime", root, vault_probe=True)
    add_read_only_mounts(
        command,
        node_mounts(repository, node_executable)
        + [
            (
                repository / "scripts" / "provider-os-runtime.ts",
                "/opt/seh/scripts/provider-os-runtime.ts",
            ),
            (
                repository / "evaluator" / "unix_peer_relay.py",
                "/opt/seh/evaluator/unix_peer_relay.py",
            ),
        ],
    )
    command += [
        "/opt/node/bin/node",
        "/opt/seh/node_modules/tsx/dist/cli.mjs",
        "/opt/seh/scripts/provider-os-runtime.ts",
        "/run/config/provider-runtime.json",
    ]
    completed = subprocess.run(command, capture_output=True, timeout=30)
    if completed.returncode != 0:
        raise RuntimeError(
            "provider runtime integration failed: "
            + completed.stderr.decode("utf-8", errors="replace")
        )
    return json.loads(
        (root / "state" / "runtime" / "result.json").read_text()
    )


def outer_uid_for(inner_uid: int) -> int:
    for line in Path("/proc/self/uid_map").read_text().splitlines():
        inner_start, outer_start, count = [
            int(value) for value in line.split()
        ]
        if inner_start <= inner_uid < inner_start + count:
            return outer_start + (inner_uid - inner_start)
    raise ValueError(f"inner UID {inner_uid} is not mapped")


def terminate(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def main() -> int:
    arguments = parse_arguments()
    root = Path(arguments.root).resolve()
    repository = Path(arguments.repository).resolve()
    node_executable = Path(arguments.node_executable).resolve()
    active: list[subprocess.Popen[bytes]] = []
    try:
        if os.geteuid() != 0:
            raise PermissionError(
                "provider OS gate requires root inside the user namespace"
            )
        prepare_ownership(root)
        provider, provider_pid = start_provider(
            root, repository, node_executable
        )
        runtime_holder, runtime_pid = start_runtime_holder(root)
        active.extend([provider, runtime_holder])
        probes = {
            "runtime": run_probe(
                "runtime", provider_pid, root, repository
            ),
            "provider": run_probe(
                "provider", runtime_pid, root, repository
            ),
        }
        terminate(runtime_holder)
        active.remove(runtime_holder)
        integration = run_runtime(root, repository, node_executable)
        _stdout, provider_stderr = provider.communicate(timeout=10)
        if provider.returncode != 0:
            raise RuntimeError(
                "provider service failed: "
                + provider_stderr.decode("utf-8", errors="replace")
            )
        active.remove(provider)
        evidence = {
            "schemaVersion": 1,
            "isolationClass": "os_enforced_provider_proxy",
            "uidMap": Path("/proc/self/uid_map").read_text().strip(),
            "roleUids": ROLE_UIDS,
            "hostRoleUids": {
                role: outer_uid_for(uid)
                for role, uid in ROLE_UIDS.items()
            },
            "roleProbes": probes,
            "integration": integration,
            "providerPrivateOwner": os.stat(
                root / "vault" / "provider" / "private.pem"
            ).st_uid,
            "providerCredentialOwner": os.stat(
                root / "vault" / "provider" / "provider-secret"
            ).st_uid,
            "runtimePrivateOwner": os.stat(
                root / "vault" / "runtime" / "private.pem"
            ).st_uid,
        }
        print(json.dumps(evidence, sort_keys=True, separators=(",", ":")))
        return 0
    finally:
        for process in active:
            terminate(process)
        restore_ownership(root)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"provider OS gate failed: {error}", file=os.sys.stderr)
        raise
