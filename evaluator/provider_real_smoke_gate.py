#!/usr/bin/env python3
"""Three-principal OS gate for one preregistered real-provider smoke.

The runtime and credential-owning provider proxy each run without a network
namespace. A third, credential-blind egress principal retains network access,
admits only the frozen CONNECT destination, and never terminates TLS.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import subprocess
import time
from typing import Any

import provider_os_gate as shared


ROLE_UIDS = {
    "runtime": 1102,
    "provider": 1106,
    "egress": 1107,
}


def read_public_config(root: Path) -> dict[str, Any]:
    value = json.loads(
        (root / "public" / "provider-service.json").read_text()
    )
    manifest = value["smokeManifest"]
    egress = manifest["egress"]
    if (
        value["upstream"]["mode"] != "openai_connect"
        or value["upstream"]["egressSocketPath"]
        != "/run/ipc/egress.sock"
        or egress["transport"] != "unix_connect_allowlist"
        or egress["allowedHost"] != "api.openai.com"
        or egress["allowedPort"] != 443
        or egress["tlsServerName"] != "api.openai.com"
        or not isinstance(egress["maxTunnelBytes"], int)
        or egress["maxTunnelBytes"] < 1
    ):
        raise PermissionError("real-provider egress config is not frozen")
    return value


def prepare_ownership(root: Path) -> None:
    shared.prepare_ownership(root)
    os.chmod(root / "ipc", 0o1777)


def egress_sandbox(
    root: Path,
    repository: Path,
    *,
    allowed_host: str,
    allowed_port: int,
    timeout_millis: int,
    max_tunnel_bytes: int,
) -> list[str]:
    uid = ROLE_UIDS["egress"]
    return [
        "/usr/bin/bwrap",
        "--die-with-parent",
        "--new-session",
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
        "--ro-bind",
        "/etc",
        "/etc",
        "--dir",
        "/opt",
        "--dir",
        "/opt/seh",
        "--dir",
        "/opt/seh/evaluator",
        "--ro-bind",
        str(repository / "evaluator" / "egress_connect_broker.py"),
        "/opt/seh/evaluator/egress_connect_broker.py",
        "--dir",
        "/run",
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
        "--clearenv",
        "--chdir",
        "/opt/seh",
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
        "/usr/bin/python3",
        "-I",
        "/opt/seh/evaluator/egress_connect_broker.py",
        "--socket",
        "/run/ipc/egress.sock",
        "--expected-client-uid",
        str(ROLE_UIDS["provider"]),
        "--expected-client-gid",
        str(ROLE_UIDS["provider"]),
        "--allowed-host",
        allowed_host,
        "--allowed-port",
        str(allowed_port),
        "--timeout-millis",
        str(timeout_millis),
        "--max-tunnel-bytes",
        str(max_tunnel_bytes),
        "--socket-mode",
        "660",
    ]


def start_egress(
    root: Path,
    repository: Path,
    config: dict[str, Any],
) -> tuple[subprocess.Popen[bytes], int]:
    socket_path = root / "ipc" / "egress.sock"
    socket_path.unlink(missing_ok=True)
    manifest = config["smokeManifest"]
    egress = manifest["egress"]
    process = subprocess.Popen(
        egress_sandbox(
            root,
            repository,
            allowed_host=egress["allowedHost"],
            allowed_port=egress["allowedPort"],
            timeout_millis=manifest["caps"]["wallClockMillis"],
            max_tunnel_bytes=egress["maxTunnelBytes"],
        ),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    shared.wait_for_socket(socket_path, process)
    os.chown(
        socket_path,
        ROLE_UIDS["egress"],
        ROLE_UIDS["provider"],
        follow_symlinks=False,
    )
    os.chmod(socket_path, 0o660)
    return process, shared.process_uid(
        process.pid, ROLE_UIDS["egress"]
    )


def start_provider(
    root: Path,
    repository: Path,
    node_executable: Path,
    timeout_millis: int,
) -> tuple[subprocess.Popen[bytes], int]:
    socket_path = root / "ipc" / "provider.sock"
    socket_path.unlink(missing_ok=True)
    command = shared.base_sandbox("provider", root)
    shared.add_read_only_mounts(
        command,
        shared.node_mounts(repository, node_executable)
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
        str(timeout_millis),
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
    shared.wait_for_socket(socket_path, process)
    os.chown(
        socket_path,
        ROLE_UIDS["provider"],
        ROLE_UIDS["runtime"],
        follow_symlinks=False,
    )
    os.chmod(socket_path, 0o660)
    return process, shared.process_uid(
        process.pid, ROLE_UIDS["provider"]
    )


def run_runtime(
    root: Path,
    repository: Path,
    node_executable: Path,
    timeout_seconds: int,
) -> dict[str, Any]:
    command = shared.base_sandbox(
        "runtime", root, vault_probe=True
    )
    shared.add_read_only_mounts(
        command,
        shared.node_mounts(repository, node_executable)
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
    completed = subprocess.run(
        command, capture_output=True, timeout=timeout_seconds
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "real-provider runtime integration failed: "
            + completed.stderr.decode("utf-8", errors="replace")
        )
    return json.loads(
        (root / "state" / "runtime" / "result.json").read_text()
    )


def main() -> int:
    arguments = shared.parse_arguments()
    root = Path(arguments.root).resolve()
    repository = Path(arguments.repository).resolve()
    node_executable = Path(arguments.node_executable).resolve()
    active: list[subprocess.Popen[bytes]] = []
    try:
        if os.geteuid() != 0:
            raise PermissionError(
                "real-provider OS gate requires user-namespace root"
            )
        config = read_public_config(root)
        timeout_millis = config["smokeManifest"]["caps"][
            "wallClockMillis"
        ]
        prepare_ownership(root)
        egress, egress_pid = start_egress(
            root, repository, config
        )
        provider, provider_pid = start_provider(
            root,
            repository,
            node_executable,
            timeout_millis + 5_000,
        )
        runtime_holder, runtime_pid = shared.start_runtime_holder(
            root
        )
        active.extend([egress, provider, runtime_holder])
        probes = {
            "runtime": shared.run_probe(
                "runtime", provider_pid, root, repository
            ),
            "provider": shared.run_probe(
                "provider", runtime_pid, root, repository
            ),
        }
        shared.terminate(runtime_holder)
        active.remove(runtime_holder)
        integration = run_runtime(
            root,
            repository,
            node_executable,
            max(30, (timeout_millis + 15_000) // 1000),
        )
        _stdout, provider_stderr = provider.communicate(timeout=10)
        if provider.returncode != 0:
            raise RuntimeError(
                "real-provider service failed: "
                + provider_stderr.decode(
                    "utf-8", errors="replace"
                )
            )
        active.remove(provider)
        egress_stdout, egress_stderr = egress.communicate(timeout=10)
        if egress.returncode != 0:
            raise RuntimeError(
                "credential-blind egress broker failed: "
                + egress_stderr.decode(
                    "utf-8", errors="replace"
                )
            )
        active.remove(egress)
        evidence = {
            "schemaVersion": 1,
            "isolationClass": (
                "os_enforced_provider_proxy_with_"
                "credential_blind_egress"
            ),
            "uidMap": Path("/proc/self/uid_map")
            .read_text()
            .strip(),
            "roleUids": ROLE_UIDS,
            "hostRoleUids": {
                role: shared.outer_uid_for(uid)
                for role, uid in ROLE_UIDS.items()
            },
            "rolePids": {
                "provider": provider_pid,
                "egress": egress_pid,
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
            "egressBroker": {
                "credentialMount": False,
                "tlsTermination": False,
                "allowedHost": config["smokeManifest"]["egress"][
                    "allowedHost"
                ],
                "allowedPort": config["smokeManifest"]["egress"][
                    "allowedPort"
                ],
                "implementationHash": config["smokeManifest"][
                    "egress"
                ]["brokerImplementationHash"],
                "policyHash": config["smokeManifest"]["egress"][
                    "policyHash"
                ],
                "stdoutBytes": len(egress_stdout),
            },
        }
        print(
            json.dumps(
                evidence, sort_keys=True, separators=(",", ":")
            )
        )
        return 0
    finally:
        for process in active:
            shared.terminate(process)
        shared.restore_ownership(root)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(
            f"real-provider OS gate failed: {error}",
            file=os.sys.stderr,
        )
        raise
