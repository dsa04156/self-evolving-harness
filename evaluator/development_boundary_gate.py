#!/usr/bin/env python3
"""Rootless subordinate-UID orchestrator for the development evolution boundary."""

from __future__ import annotations

import argparse
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
    "attributor": 1201,
    "committer": 1202,
    "scorer": 1203,
    "proposer": 1204,
    "operations": 1205,
    "runtime": 1206,
    "evaluator": 1207,
    "audit": 1208,
}


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
                    directory, 0, 0, follow_symlinks=False
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
    for directory in ("input", "state", "ipc"):
        Path(root, directory).mkdir(
            parents=True, exist_ok=True, mode=0o700
        )
    os.chmod(root / "ipc", 0o1777)
    os.chmod(root / "vault", 0o711)
    os.chmod(root / "public", 0o755)
    for public_file in (root / "public").iterdir():
        os.chmod(public_file, 0o644)
    for role, uid in ROLE_UIDS.items():
        role_vault = root / "vault" / role
        chown_tree(role_vault, uid, uid)
        os.chmod(role_vault, 0o700)
        os.chmod(role_vault / "private.pem", 0o600)


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


def materialize_read_only_candidate(
    root: Path,
) -> Path:
    destination = root / "candidate-view"
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(mode=0o755)
    for name in ("registry", "artifacts"):
        shutil.copytree(
            root / "state" / "proposer" / name,
            destination / name,
            copy_function=shutil.copyfile,
        )
    for current_root, directories, files in os.walk(
        destination
    ):
        os.chmod(current_root, 0o755)
        for name in directories:
            os.chmod(Path(current_root, name), 0o755)
        for name in files:
            os.chmod(Path(current_root, name), 0o444)
    return destination


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
    extra_mounts: list[tuple[Path, str]] | None = None,
    all_vaults: bool = False,
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
        "/opt/seh/config",
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
        str(
            repository
            / "scripts"
            / "development-boundary-worker.ts"
        ),
        "/opt/seh/scripts/development-boundary-worker.ts",
        "--ro-bind",
        str(
            repository
            / "configs"
            / "component-type-registry.json"
        ),
        "/opt/seh/config/component-type-registry.json",
        "--ro-bind",
        str(node_executable),
        "/opt/node/bin/node",
        "--ro-bind",
        str(input_directory),
        "/input",
        "--bind",
        str(state_directory),
        "/state",
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
    ]
    if all_vaults:
        command.extend(
            ["--ro-bind", str(root / "vault"), "/vault"]
        )
    else:
        command.extend(
            [
                "--ro-bind",
                str(root / "vault" / role),
                "/run/keys",
            ]
        )
    for source, destination in extra_mounts or []:
        command.extend(
            ["--ro-bind", str(source), destination]
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
    return [
        "/opt/node/bin/node",
        "/opt/seh/node_modules/tsx/dist/cli.mjs",
        "/opt/seh/scripts/development-boundary-worker.ts",
    ]


def run_worker(
    role: str,
    stage: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    *,
    extra_mounts: list[tuple[Path, str]] | None = None,
) -> None:
    command = base_sandbox(
        role,
        root / "input" / stage,
        root / "state" / stage,
        root,
        repository,
        python_root,
        node_executable,
        extra_mounts=extra_mounts,
    ) + worker_command()
    completed = subprocess.run(
        command, capture_output=True, timeout=90
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"{stage} worker failed: "
            + completed.stderr.decode(
                "utf-8", errors="replace"
            )[:4000]
        )


def prepare_stage(
    root: Path,
    stage: str,
    role: str,
    mode: str,
    timestamp: str,
    principals: dict[str, Any],
    *,
    protocol_id: str | None = None,
) -> tuple[Path, Path]:
    input_directory, state_directory = reset_stage(
        root, stage, role
    )
    config: dict[str, Any] = {
        "mode": mode,
        "timestamp": timestamp,
    }
    if protocol_id is not None:
        config["protocolId"] = protocol_id
    write_input(
        input_directory, "config.json", config, role
    )
    write_input(
        input_directory,
        "own-public.json",
        principals[role],
        role,
    )
    return input_directory, state_directory


def wait_for_socket(
    socket_path: Path, process: subprocess.Popen[bytes]
) -> None:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if process.poll() is not None:
            _stdout, stderr = process.communicate()
            raise RuntimeError(
                "scorer server exited before readiness: "
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
    raise TimeoutError("scorer socket readiness timed out")


def start_score_server(
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    *,
    max_requests: int,
) -> subprocess.Popen[bytes]:
    stage = "scorer"
    command = base_sandbox(
        "scorer",
        root / "input" / stage,
        root / "state" / stage,
        root,
        repository,
        python_root,
        node_executable,
        extra_mounts=[
            (
                repository
                / "evaluator"
                / "development_score_gate.py",
                "/opt/seh/evaluator/development_score_gate.py",
            )
        ],
    )
    command += [
        "/opt/python/bin/python3.13",
        "-I",
        "/opt/seh/evaluator/development_score_gate.py",
        "--socket",
        "/run/ipc/development-score.sock",
        "--config",
        "/input/gate-config.json",
        "--audit-public-key",
        "/input/audit-public.pem",
        "--state-directory",
        "/state",
        "--seal",
        "/input/prediction-seal.json",
        "--max-requests",
        str(max_requests),
        "--worker-command",
        *worker_command(),
    ]
    return subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def run_release_client(
    role: str,
    stage: str,
    mode: str,
    nonce: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
) -> dict[str, Any]:
    command = base_sandbox(
        role,
        root / "input" / stage,
        root / "state" / stage,
        root,
        repository,
        python_root,
        node_executable,
        extra_mounts=[
            (
                repository
                / "evaluator"
                / "development_score_client.py",
                "/opt/seh/evaluator/development_score_client.py",
            )
        ],
    )
    command += [
        "/opt/python/bin/python3.13",
        "-I",
        "/opt/seh/evaluator/development_score_client.py",
        "--socket",
        "/run/ipc/development-score.sock",
        "--config",
        "/input/release.json",
        "--private-key",
        "/run/keys/private.pem",
        "--expected-server-uid",
        str(ROLE_UIDS["scorer"]),
        "--expected-server-gid",
        str(ROLE_UIDS["scorer"]),
        "--mode",
        mode,
        "--nonce",
        nonce,
    ]
    completed = subprocess.run(
        command, capture_output=True, timeout=20
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"release client {role}/{mode} failed: "
            + completed.stderr.decode(
                "utf-8", errors="replace"
            )[:2000]
        )
    return json.loads(completed.stdout)


def run_role_probe(
    role: str,
    stage: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    protocol_id: str,
) -> dict[str, Any]:
    command = base_sandbox(
        role,
        root / "input" / stage,
        root / "state" / stage,
        root,
        repository,
        python_root,
        node_executable,
        extra_mounts=[
            (
                repository
                / "evaluator"
                / "os_role_probe.py",
                "/opt/seh/evaluator/os_role_probe.py",
            )
        ],
        all_vaults=True,
    )
    command += [
        "/opt/python/bin/python3.13",
        "-I",
        "/opt/seh/evaluator/os_role_probe.py",
        "--role",
        role,
        "--own-key",
        f"/vault/{role}/private.pem",
        "--challenge",
        f"seh-development-boundary:{role}:{protocol_id}",
    ]
    for other in ROLE_UIDS:
        if other == role:
            continue
        forbidden = f"/vault/{other}/private.pem"
        command.extend(
            [
                "--forbidden-read",
                forbidden,
                "--forbidden-write",
                forbidden,
            ]
        )
    completed = subprocess.run(
        command, capture_output=True, timeout=20
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"{role} OS probe failed: "
            + completed.stderr.decode(
                "utf-8", errors="replace"
            )[:2000]
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


def copy_common_attribution(
    destination: Path,
    role: str,
    root: Path,
) -> None:
    sources = {
        "corpus.json": root / "source" / "corpus.json",
        "manifest.json": root
        / "state"
        / "attributor"
        / "manifest.json",
        "predictions.json": root
        / "state"
        / "attributor"
        / "predictions.json",
        "commitment.json": root
        / "state"
        / "committer"
        / "commitment.json",
    }
    for name, source in sources.items():
        copy_input(destination, name, source, role)


def main() -> int:
    arguments = parse_arguments()
    root = Path(arguments.root).resolve()
    repository = Path(arguments.repository).resolve()
    python_root = Path(arguments.python_root).resolve()
    node_executable = Path(arguments.node_executable).resolve()
    active: list[subprocess.Popen[bytes]] = []
    try:
        if os.geteuid() != 0:
            raise PermissionError(
                "development boundary gate requires root in user namespace"
            )
        prepare_ownership(root)
        principals = read_json(root / "public" / "principals.json")
        protocol_id = (
            root / "public" / "protocol-id"
        ).read_text().strip()

        probes: dict[str, Any] = {}
        for role in ROLE_UIDS:
            stage = f"probe_{role}"
            reset_stage(root, stage, role)
            probes[role] = run_role_probe(
                role,
                stage,
                root,
                repository,
                python_root,
                node_executable,
                protocol_id,
            )

        input_directory, _state = prepare_stage(
            root,
            "attributor",
            "attributor",
            "attribute",
            "2026-07-31T13:00:00.000Z",
            principals,
        )
        copy_input(
            input_directory,
            "corpus.json",
            root / "source" / "corpus.json",
            "attributor",
        )
        run_worker(
            "attributor",
            "attributor",
            root,
            repository,
            python_root,
            node_executable,
        )

        input_directory, _state = prepare_stage(
            root,
            "committer",
            "committer",
            "commit",
            "2026-07-31T13:01:00.000Z",
            principals,
        )
        for name, source in {
            "corpus.json": root / "source" / "corpus.json",
            "manifest.json": root
            / "state"
            / "attributor"
            / "manifest.json",
            "predictions.json": root
            / "state"
            / "attributor"
            / "predictions.json",
        }.items():
            copy_input(input_directory, name, source, "committer")
        run_worker(
            "committer",
            "committer",
            root,
            repository,
            python_root,
            node_executable,
        )

        # Before audit sealing, the scorer receives neither the oracle nor a
        # seal. Its gate exits before bind(2), proving socket unavailability.
        input_directory, _state = prepare_stage(
            root,
            "scorer",
            "scorer",
            "score",
            "2026-07-31T13:03:00.000Z",
            principals,
        )
        copy_common_attribution(
            input_directory, "scorer", root
        )
        placeholder_config = {
            "auditKeyId": principals["audit"]["keyId"],
            "expectedAuditUid": ROLE_UIDS["audit"],
            "expectedAuditGid": ROLE_UIDS["audit"],
            "sealRecordHash": "sha256:" + "0" * 64,
            "predictionCommitmentHash": read_json(
                root
                / "state"
                / "committer"
                / "commitment.json"
            )["commitmentHash"],
            "predictionSetHash": read_json(
                root
                / "state"
                / "attributor"
                / "predictions.json"
            )["predictionSetHash"],
            "corpusHash": read_json(
                root / "source" / "corpus.json"
            )["corpusHash"],
        }
        write_input(
            input_directory,
            "gate-config.json",
            placeholder_config,
            "scorer",
        )
        copy_input(
            input_directory,
            "audit-public.pem",
            root / "public" / "audit-public.pem",
            "scorer",
        )
        early = start_score_server(
            root,
            repository,
            python_root,
            node_executable,
            max_requests=1,
        )
        _stdout, early_stderr = early.communicate(timeout=15)
        early_socket_absent = not (
            root / "ipc" / "development-score.sock"
        ).exists()
        if (
            early.returncode != 2
            or not early_socket_absent
            or b"prediction-seal.json" not in early_stderr
        ):
            raise RuntimeError(
                "scorer did not fail closed before durable sealing: "
                + early_stderr.decode(
                    "utf-8", errors="replace"
                )[:2000]
            )

        input_directory, _state = prepare_stage(
            root,
            "audit_seal",
            "audit",
            "seal",
            "2026-07-31T13:02:00.000Z",
            principals,
        )
        copy_common_attribution(
            input_directory, "audit", root
        )
        run_worker(
            "audit",
            "audit_seal",
            root,
            repository,
            python_root,
            node_executable,
        )

        # Recreate scorer input after sealing; this is the sole oracle mount.
        input_directory, _state = prepare_stage(
            root,
            "scorer",
            "scorer",
            "score",
            "2026-07-31T13:03:00.000Z",
            principals,
        )
        copy_common_attribution(
            input_directory, "scorer", root
        )
        copy_input(
            input_directory,
            "prediction-seal.json",
            root
            / "state"
            / "audit_seal"
            / "prediction-seal.json",
            "scorer",
        )
        copy_input(
            input_directory,
            "oracle-join.json",
            root / "source" / "oracle-join.json",
            "scorer",
        )
        copy_input(
            input_directory,
            "audit-public.pem",
            root / "public" / "audit-public.pem",
            "scorer",
        )
        seal_record = read_json(
            root
            / "state"
            / "audit_seal"
            / "prediction-seal.json"
        )
        release_config = {
            "auditKeyId": principals["audit"]["keyId"],
            "expectedAuditUid": ROLE_UIDS["audit"],
            "expectedAuditGid": ROLE_UIDS["audit"],
            "sealRecordHash": seal_record["recordHash"],
            "predictionCommitmentHash": seal_record[
                "predictionCommitmentHash"
            ],
            "predictionSetHash": seal_record[
                "predictionSetHash"
            ],
            "corpusHash": seal_record["corpusHash"],
        }
        write_input(
            input_directory,
            "gate-config.json",
            release_config,
            "scorer",
        )

        for stage, role in (
            ("release_audit", "audit"),
            ("release_runtime", "runtime"),
        ):
            release_input, _release_state = reset_stage(
                root, stage, role
            )
            write_input(
                release_input,
                "release.json",
                release_config,
                role,
            )

        score_server = start_score_server(
            root,
            repository,
            python_root,
            node_executable,
            max_requests=8,
        )
        active.append(score_server)
        wait_for_socket(
            root / "ipc" / "development-score.sock",
            score_server,
        )
        adversarial: list[dict[str, Any]] = []
        wrong_peer = run_release_client(
            "runtime",
            "release_runtime",
            "valid",
            "wrong-peer-nonce-0001",
            root,
            repository,
            python_root,
            node_executable,
        )
        adversarial.append(
            {"mode": "wrong_peer", "response": wrong_peer}
        )
        for mode in (
            "wrong_key",
            "commitment_substitution",
            "prediction_substitution",
            "corpus_substitution",
            "seal_substitution",
        ):
            response = run_release_client(
                "audit",
                "release_audit",
                mode,
                f"{mode}-nonce-0001",
                root,
                repository,
                python_root,
                node_executable,
            )
            adversarial.append(
                {"mode": mode, "response": response}
            )
        valid_nonce = "valid-release-nonce-0001"
        accepted = run_release_client(
            "audit",
            "release_audit",
            "valid",
            valid_nonce,
            root,
            repository,
            python_root,
            node_executable,
        )
        replay = run_release_client(
            "audit",
            "release_audit",
            "replay",
            valid_nonce,
            root,
            repository,
            python_root,
            node_executable,
        )
        adversarial.append(
            {"mode": "replay", "response": replay}
        )
        _stdout, score_stderr = score_server.communicate(
            timeout=30
        )
        active.remove(score_server)
        if score_server.returncode != 0:
            raise RuntimeError(
                "scorer server failed: "
                + score_stderr.decode(
                    "utf-8", errors="replace"
                )[:4000]
            )
        if (
            accepted.get("accepted") is not True
            or any(
                item["response"].get("accepted") is not False
                for item in adversarial
            )
        ):
            raise RuntimeError(
                "scorer adversarial acceptance matrix changed"
            )

        input_directory, _state = prepare_stage(
            root,
            "proposer",
            "proposer",
            "propose",
            "2026-07-31T13:05:00.000Z",
            principals,
        )
        copy_common_attribution(
            input_directory, "proposer", root
        )
        run_worker(
            "proposer",
            "proposer",
            root,
            repository,
            python_root,
            node_executable,
        )
        candidate_view = materialize_read_only_candidate(
            root
        )
        if any(
            (root / "input" / "proposer" / name).exists()
            for name in (
                "oracle-join.json",
                "oracle-access.json",
                "score-report.json",
            )
        ):
            raise PermissionError(
                "post-score output reached mutation proposer"
            )

        input_directory, _state = prepare_stage(
            root,
            "operations",
            "operations",
            "quarantine",
            "2026-07-31T13:06:00.000Z",
            principals,
        )
        copy_common_attribution(
            input_directory, "operations", root
        )
        copy_input(
            input_directory,
            "proposal.json",
            root / "state" / "proposer" / "proposal.json",
            "operations",
        )
        run_worker(
            "operations",
            "operations",
            root,
            repository,
            python_root,
            node_executable,
            extra_mounts=[
                (candidate_view, "/candidate")
            ],
        )

        input_directory, _state = prepare_stage(
            root,
            "runtime",
            "runtime",
            "runtime",
            "2026-07-31T13:07:00.000Z",
            principals,
            protocol_id=protocol_id,
        )
        copy_input(
            input_directory,
            "proposal.json",
            root / "state" / "proposer" / "proposal.json",
            "runtime",
        )
        copy_input(
            input_directory,
            "non-promotable.json",
            root
            / "state"
            / "operations"
            / "non-promotable.json",
            "runtime",
        )
        run_worker(
            "runtime",
            "runtime",
            root,
            repository,
            python_root,
            node_executable,
            extra_mounts=[
                (candidate_view, "/candidate")
            ],
        )

        input_directory, _state = prepare_stage(
            root,
            "evaluator",
            "evaluator",
            "evaluate",
            "2026-07-31T13:08:00.000Z",
            principals,
        )
        copy_input(
            input_directory,
            "execution.json",
            root / "state" / "runtime" / "execution.json",
            "evaluator",
        )
        copy_input(
            input_directory,
            "non-promotable.json",
            root
            / "state"
            / "operations"
            / "non-promotable.json",
            "evaluator",
        )
        run_worker(
            "evaluator",
            "evaluator",
            root,
            repository,
            python_root,
            node_executable,
        )

        receipt_sources = [
            root / "state" / "attributor" / "receipt.json",
            root / "state" / "committer" / "receipt.json",
            root / "state" / "audit_seal" / "receipt.json",
            root / "state" / "scorer" / "receipt.json",
            root / "state" / "proposer" / "receipt.json",
            root / "state" / "operations" / "receipt.json",
            root / "state" / "runtime" / "receipt.json",
            root / "state" / "evaluator" / "receipt.json",
        ]
        receipts = [read_json(source) for source in receipt_sources]
        predictions = read_json(
            root / "state" / "attributor" / "predictions.json"
        )
        commitment = read_json(
            root / "state" / "committer" / "commitment.json"
        )
        oracle_access = read_json(
            root / "state" / "scorer" / "oracle-access.json"
        )
        score_report = read_json(
            root / "state" / "scorer" / "score-report.json"
        )
        proposal = read_json(
            root / "state" / "proposer" / "proposal.json"
        )
        non_promotable = read_json(
            root
            / "state"
            / "operations"
            / "non-promotable.json"
        )
        execution = read_json(
            root / "state" / "runtime" / "execution.json"
        )
        evaluation = read_json(
            root / "state" / "evaluator" / "evaluation.json"
        )
        corpus = read_json(root / "source" / "corpus.json")
        taint_artifacts = [
            {
                "artifactId": "development.os.corpus",
                "artifactKind": "fixture_corpus",
                "contentHash": corpus["corpusHash"],
                "taintClasses": ["development_fixture"],
            },
            {
                "artifactId": "development.os.predictions",
                "artifactKind": "prediction_set",
                "contentHash": predictions["predictionSetHash"],
                "references": [corpus["corpusHash"]],
                "taintClasses": ["prediction_pre_oracle"],
            },
            {
                "artifactId": "development.os.commitment",
                "artifactKind": "prediction_commitment",
                "contentHash": commitment["commitmentHash"],
                "references": [predictions["predictionSetHash"]],
                "taintClasses": ["prediction_pre_oracle"],
            },
            {
                "artifactId": "development.os.seal",
                "artifactKind": "prediction_seal",
                "contentHash": seal_record["recordHash"],
                "references": [commitment["commitmentHash"]],
                "taintClasses": ["prediction_pre_oracle"],
            },
            {
                "artifactId": "development.os.oracle-access",
                "artifactKind": "oracle_access_event",
                "contentHash": oracle_access["eventHash"],
                "references": [seal_record["recordHash"]],
                "taintClasses": ["oracle_input"],
            },
            {
                "artifactId": "development.os.score",
                "artifactKind": "score_report",
                "contentHash": score_report["reportHash"],
                "references": [oracle_access["eventHash"]],
                "taintClasses": ["post_score_output"],
            },
            {
                "artifactId": "development.os.proposal",
                "artifactKind": "mutation_proposal",
                "contentHash": proposal["proposalHash"],
                "references": [commitment["commitmentHash"]],
                "taintClasses": ["development_candidate"],
            },
            {
                "artifactId": "development.os.candidate",
                "artifactKind": "candidate_harness",
                "contentHash": proposal["candidateHarnessVersionId"],
                "aliases": [
                    "archive/development-os-candidate",
                    "candidate-latest",
                ],
                "references": [proposal["proposalHash"]],
                "taintClasses": ["development_candidate"],
            },
            {
                "artifactId": "development.os.non-promotable",
                "artifactKind": "non_promotable_record",
                "contentHash": non_promotable["recordHash"],
                "references": [
                    proposal["candidateHarnessVersionId"]
                ],
                "taintClasses": ["development_candidate"],
            },
            {
                "artifactId": "development.os.execution",
                "artifactKind": "runtime_execution",
                "contentHash": execution["bundleHash"],
                "references": [
                    non_promotable["recordHash"]
                ],
                "taintClasses": ["development_evaluation"],
            },
            {
                "artifactId": "development.os.evaluation",
                "artifactKind": "evaluator_result",
                "contentHash": evaluation["resultHash"],
                "references": [execution["bundleHash"]],
                "taintClasses": ["development_evaluation"],
            },
        ]

        input_directory, _state = prepare_stage(
            root,
            "audit_final",
            "audit",
            "finalize",
            "2026-07-31T13:09:00.000Z",
            principals,
        )
        write_input(
            input_directory,
            "receipts.json",
            receipts,
            "audit",
        )
        write_input(
            input_directory,
            "taint-artifacts.json",
            taint_artifacts,
            "audit",
        )
        run_worker(
            "audit",
            "audit_final",
            root,
            repository,
            python_root,
            node_executable,
        )

        final_summary = read_json(
            root / "state" / "audit_final" / "summary.json"
        )
        evidence = {
            "schemaVersion": 1,
            "isolationClass": "os_enforced_subordinate_uids",
            "uidMap": Path("/proc/self/uid_map")
            .read_text()
            .strip(),
            "roleUids": ROLE_UIDS,
            "hostRoleUids": {
                role: outer_uid_for(uid)
                for role, uid in ROLE_UIDS.items()
            },
            "roleProbes": probes,
            "keyOwners": {
                role: os.stat(
                    root / "vault" / role / "private.pem"
                ).st_uid
                for role in ROLE_UIDS
            },
            "earlyScorerSocketAbsent": early_socket_absent,
            "predictionSeal": {
                "recordHash": seal_record["recordHash"],
                "commitmentVerified": seal_record[
                    "commitmentVerified"
                ],
                "durability": seal_record["durability"],
            },
            "scorerRelease": {
                "accepted": accepted,
                "adversarial": adversarial,
                "oracleMountRoles": ["scorer"],
                "proposerReceivedScorerOutput": False,
            },
            "candidate": {
                "parentHarnessVersionId": proposal[
                    "parentHarnessVersionId"
                ],
                "candidateHarnessVersionId": proposal[
                    "candidateHarnessVersionId"
                ],
                "proposalHash": proposal["proposalHash"],
                "nonPromotableRecordHash": non_promotable[
                    "recordHash"
                ],
            },
            "actualRuntimeEvaluation": {
                "executionBundleHash": execution["bundleHash"],
                "resultHash": evaluation["resultHash"],
                "aggregate": evaluation["aggregate"],
                "sourceClass": evaluation["sourceClass"],
            },
            "finalAudit": final_summary,
            "providerUsed": False,
            "researchEvidenceAuthorized": False,
            "promotionAuthorized": False,
        }
        print(canonical(evidence).decode("utf-8"))
        return 0
    finally:
        for process in active:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        restore_ownership(root)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(
            f"development boundary gate failed: {error}",
            file=sys.stderr,
        )
        raise
