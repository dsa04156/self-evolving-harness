#!/usr/bin/env python3
"""Rootless eight-principal encrypted synthetic-custody rehearsal.

The payload is fixed inert binary data generated inside the vault worker. It
contains no task instruction, verifier, label, expected answer, model prompt,
benchmark path, or research semantics.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from typing import Any

import evaluator_vault_os_gate as base


SCENARIOS = (
    "normal",
    "evaluator_crash",
    "vault_crash",
    "timeout",
    "capability_rejection",
    "response_loss",
)

CRASH_BOUNDARIES = (
    "after_reservation_commit",
    "after_deny_release",
    "after_materialization_start",
    "after_deny_materialization",
    "after_plaintext_delete",
    "after_private_delete",
    "after_cleanup_commit",
)

ENVELOPE_ATTACKS = (
    "ciphertext",
    "authentication_tag",
    "nonce",
    "aad_custody_id",
    "aad_protocol_id",
    "aad_contract_id",
    "aad_contract_hash",
    "aad_task_handle",
    "aad_author_commitment",
    "aad_included_transition",
    "aad_admitted_state",
    "aad_unlock_capability",
    "aad_plaintext_commitment",
    "aad_payload_length",
    "aad_delivery_guarantee",
    "envelope_swap",
)

CAPABILITY_SUBSTITUTIONS = (
    "custodyId",
    "admittedVaultStateHead",
    "authorCommitmentHash",
    "taskHandleCommitment",
    "unlockCapabilityHash",
)


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


def text_digest(value: str) -> str:
    return "sha256:" + hashlib.sha256(
        value.encode("utf-8")
    ).hexdigest()


def timestamp(offset_minutes: int) -> str:
    origin = datetime(
        2026, 7, 31, 22, 0, tzinfo=timezone.utc
    )
    return (
        origin + timedelta(minutes=offset_minutes)
    ).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def read_json(path: Path) -> dict[str, Any]:
    value = base.read_json(path)
    if not isinstance(value, dict):
        raise TypeError(f"{path.name} is not an object")
    return value


def write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(
        path,
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | os.O_NOFOLLOW,
        0o600,
    )
    try:
        os.write(descriptor, value)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def prepare_custody_roots(root: Path) -> None:
    for name in (
        "custody",
        "custody-state",
        "logs",
        "retained-scan",
    ):
        directory = root / name
        directory.mkdir(parents=True, mode=0o700)
        os.chown(
            directory,
            base.ROLE_UIDS["vault"],
            base.ROLE_UIDS["vault"],
            follow_symlinks=False,
        )
        os.chmod(directory, 0o700)


def tmpfs_for(path: Path) -> str:
    best_mount = ""
    best_type = ""
    resolved = str(path.resolve())
    for line in Path("/proc/self/mountinfo").read_text().splitlines():
        left, right = line.split(" - ", 1)
        mount_point = left.split()[4].replace("\\040", " ")
        filesystem_type = right.split()[0]
        if (
            resolved == mount_point
            or resolved.startswith(mount_point.rstrip("/") + "/")
        ) and len(mount_point) > len(best_mount):
            best_mount = mount_point
            best_type = filesystem_type
    if best_type != "tmpfs":
        raise RuntimeError(
            f"materialization root is not tmpfs-backed: {best_type}"
        )
    return best_type


def insert_mounts(
    command: list[str], mounts: list[str]
) -> list[str]:
    index = command.index("--clearenv")
    return command[:index] + mounts + command[index:]


def custody_sandbox(
    *,
    role: str,
    stage: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization: Path,
    vault_private: bool,
    evaluator_plaintext: bool = False,
    scan_mounts: bool = False,
    protected_probe: bool = False,
) -> list[str]:
    command = base.base_sandbox(
        role,
        root / "input" / stage,
        root / "state" / stage,
        root,
        repository,
        python_root,
        node_executable,
        protected_probe=protected_probe,
    )
    mounts: list[str] = []
    if vault_private:
        mounts.extend(
            [
                "--bind",
                str(root / "custody"),
                "/custody",
                "--bind",
                str(root / "custody-state"),
                "/custody-state",
                "--bind",
                str(materialization),
                "/materialization",
            ]
        )
    elif evaluator_plaintext:
        payload = materialization / "payload.bin"
        if not payload.is_file():
            raise FileNotFoundError(
                "evaluator plaintext materialization is missing"
            )
        mounts.extend(
            [
                "--dir",
                "/materialization",
                "--ro-bind",
                str(payload),
                "/materialization/payload.bin",
            ]
        )
    if scan_mounts:
        mounts.extend(
            [
                "--ro-bind",
                str(root / "retained-scan"),
                "/retained",
                "--ro-bind",
                str(root / "logs"),
                "/logs",
                "--dir",
                "/scan",
                "--dir",
                "/scan/repository",
                "--ro-bind",
                str(repository / "src"),
                "/scan/repository/src",
                "--ro-bind",
                str(repository / "scripts"),
                "/scan/repository/scripts",
                "--ro-bind",
                str(repository / "evaluator"),
                "/scan/repository/evaluator",
                "--ro-bind",
                str(repository / "schemas"),
                "/scan/repository/schemas",
                "--ro-bind",
                str(repository / "test"),
                "/scan/repository/test",
            ]
        )
    if protected_probe:
        mounts.extend(
            [
                "--ro-bind",
                str(materialization.parent),
                "/protected-materializations",
            ]
        )
    return insert_mounts(command, mounts)


def custody_worker_command() -> list[str]:
    return [
        base.NODE,
        base.TSX,
        base.CUSTODY_WORKER,
    ]


def prepare_custody_stage(
    *,
    root: Path,
    stage: str,
    role: str,
    mode: str,
    custody_id: str,
    occurred_at: str,
    contract_path: Path,
    extra: dict[str, Any] | None = None,
    inputs: dict[str, Path] | None = None,
) -> tuple[Path, Path]:
    input_directory, state_directory = base.reset_stage(
        root, stage, role
    )
    base.write_input(
        input_directory,
        "config.json",
        {
            "mode": mode,
            "role": role,
            "timestamp": occurred_at,
            "custodyId": custody_id,
            **(extra or {}),
        },
        role,
    )
    base.copy_input(
        input_directory,
        "own-public.json",
        root / "public" / f"{role}.json",
        role,
    )
    base.copy_input(
        input_directory,
        "contract.json",
        contract_path,
        role,
    )
    for name, source in (inputs or {}).items():
        base.copy_input(
            input_directory,
            name,
            source,
            role,
        )
    return input_directory, state_directory


def retain_outputs(
    root: Path, stage: str, state_directory: Path
) -> None:
    target = root / "retained-scan" / stage
    target.mkdir(parents=True, mode=0o700)
    for source in sorted(state_directory.rglob("*")):
        if not source.is_file():
            continue
        relative = source.relative_to(state_directory)
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        os.chown(
            destination,
            base.ROLE_UIDS["vault"],
            base.ROLE_UIDS["vault"],
            follow_symlinks=False,
        )
        os.chmod(destination, 0o600)
    base.chown_tree(
        target,
        base.ROLE_UIDS["vault"],
        base.ROLE_UIDS["vault"],
    )
    os.chmod(target, 0o700)


def run_custody_worker(
    *,
    root: Path,
    stage: str,
    role: str,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization: Path,
    vault_private: bool,
    evaluator_plaintext: bool = False,
    scan_mounts: bool = False,
    timeout_seconds: float = 60,
    retain: bool = True,
) -> dict[str, Any]:
    command = custody_sandbox(
        role=role,
        stage=stage,
        root=root,
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=vault_private,
        evaluator_plaintext=evaluator_plaintext,
        scan_mounts=scan_mounts,
    ) + custody_worker_command()
    command_log = root / "logs" / f"{stage}.command.json"
    write_bytes(command_log, canonical(command))
    os.chown(
        command_log,
        base.ROLE_UIDS["vault"],
        base.ROLE_UIDS["vault"],
        follow_symlinks=False,
    )
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    timed_out = False
    try:
        stdout, stderr = process.communicate(
            timeout=timeout_seconds
        )
    except subprocess.TimeoutExpired:
        timed_out = True
        process.kill()
        stdout, stderr = process.communicate()
    for suffix, content in (
        ("stdout", stdout),
        ("stderr", stderr),
    ):
        log = root / "logs" / f"{stage}.{suffix}"
        write_bytes(log, content)
        os.chown(
            log,
            base.ROLE_UIDS["vault"],
            base.ROLE_UIDS["vault"],
            follow_symlinks=False,
        )
    state_directory = root / "state" / stage
    if (
        retain
        and process.returncode == 0
        and state_directory.exists()
    ):
        retain_outputs(root, stage, state_directory)
    return {
        "returnCode": process.returncode,
        "timedOut": timed_out,
        "stdoutCommitment":
            "sha256:" + hashlib.sha256(stdout).hexdigest(),
        "stderrCommitment":
            "sha256:" + hashlib.sha256(stderr).hexdigest(),
    }


def require_success(
    result: dict[str, Any], stage: str
) -> None:
    if result["returnCode"] != 0 or result["timedOut"]:
        raise RuntimeError(
            f"{stage} failed: {result}"
        )


def setup_authorship_and_unlock(
    *,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    protocol_id: str,
    task_handle: str,
) -> dict[str, Any]:
    principals = read_json(
        root / "public" / "principals.json"
    )
    protocol_input, _state = base.prepare_stage(
        root,
        "protocol_contract",
        "protocol_author",
        "freeze_contract",
        timestamp(0),
        protocol_id,
        extra={
            "contractId":
                "synthetic-custody.vault-contract.v1"
        },
    )
    base.write_input(
        protocol_input,
        "principals.json",
        principals,
        "protocol_author",
    )
    base.run_worker(
        "protocol_author",
        "protocol_contract",
        root,
        repository,
        python_root,
        node_executable,
    )
    contract_path = (
        root
        / "state"
        / "protocol_contract"
        / "contract.json"
    )

    assign_input, _state = base.prepare_stage(
        root,
        "protocol_assign",
        "protocol_author",
        "assign",
        timestamp(1),
        protocol_id,
        extra={
            "workflowId":
                "synthetic-custody.authorship.v1",
            "taskHandle": task_handle,
        },
    )
    base.copy_input(
        assign_input,
        "contract.json",
        contract_path,
        "protocol_author",
    )
    base.run_worker(
        "protocol_author",
        "protocol_assign",
        root,
        repository,
        python_root,
        node_executable,
    )

    commit_input, _state = base.prepare_stage(
        root,
        "author_commit",
        "benchmark_author",
        "commit",
        timestamp(2),
        protocol_id,
    )
    for name, source in {
        "contract.json": contract_path,
        "assigned.json": root
        / "state"
        / "protocol_assign"
        / "assigned.json",
    }.items():
        base.copy_input(
            commit_input,
            name,
            source,
            "benchmark_author",
        )
    base.run_worker(
        "benchmark_author",
        "author_commit",
        root,
        repository,
        python_root,
        node_executable,
    )

    blind_input, _state = base.prepare_stage(
        root,
        "vault_blind",
        "vault",
        "blind",
        timestamp(3),
        protocol_id,
    )
    for name, source in {
        "contract.json": contract_path,
        "assigned.json": root
        / "state"
        / "protocol_assign"
        / "assigned.json",
        "committed.json": root
        / "state"
        / "author_commit"
        / "committed.json",
    }.items():
        base.copy_input(
            blind_input, name, source, "vault"
        )
    base.run_worker(
        "vault",
        "vault_blind",
        root,
        repository,
        python_root,
        node_executable,
    )

    reviewer_input, _state = base.prepare_stage(
        root,
        "reviewer_decide",
        "benchmark_reviewer",
        "decide",
        timestamp(4),
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
        base.copy_input(
            reviewer_input,
            name,
            source,
            "benchmark_reviewer",
        )
    base.run_worker(
        "benchmark_reviewer",
        "reviewer_decide",
        root,
        repository,
        python_root,
        node_executable,
    )

    include_input, _state = base.prepare_stage(
        root,
        "vault_include",
        "vault",
        "include",
        timestamp(5),
        protocol_id,
    )
    for name, source in {
        "contract.json": contract_path,
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
        base.copy_input(
            include_input, name, source, "vault"
        )
    base.run_worker(
        "vault",
        "vault_include",
        root,
        repository,
        python_root,
        node_executable,
    )
    included_path = (
        root
        / "state"
        / "vault_include"
        / "included.json"
    )
    included = read_json(included_path)
    committed = read_json(
        root
        / "state"
        / "author_commit"
        / "committed.json"
    )

    server, _vault_pid = base.start_vault_server(
        root,
        repository,
        python_root,
        node_executable,
        max_requests=3,
    )
    try:
        create_request = base.sign_request(
            root,
            repository,
            python_root,
            node_executable,
            stage="custody_create",
            role="benchmark_author",
            protocol_id=protocol_id,
            action="create",
            request_id="synthetic-custody.request.create",
            sender_sequence=0,
            nonce="synthetic-custody-create-nonce-0001",
            timestamp=timestamp(6),
            task_handle=task_handle,
            subject_commitment=included["recordHash"],
        )
        create_response = base.send_request(
            "benchmark_author",
            "custody_create",
            create_request,
            root,
            repository,
            python_root,
            node_executable,
        )
        if not create_response["result"]["ok"]:
            raise RuntimeError("custody task create failed")

        seal_request = base.sign_request(
            root,
            repository,
            python_root,
            node_executable,
            stage="custody_seal",
            role="vault",
            protocol_id=protocol_id,
            action="seal",
            request_id="synthetic-custody.request.seal",
            sender_sequence=0,
            nonce="synthetic-custody-seal-nonce-0001",
            timestamp=timestamp(7),
            task_handle=task_handle,
            subject_commitment=included["recordHash"],
        )
        seal_response = base.send_request(
            "vault",
            "custody_seal",
            seal_request,
            root,
            repository,
            python_root,
            node_executable,
        )
        if seal_response["result"]["taskState"] != "sealed":
            raise RuntimeError("custody task seal failed")

        capability_input, _state = base.prepare_stage(
            root,
            "custody_unlock_capability",
            "vault",
            "issue_capability",
            timestamp(8),
            protocol_id,
            extra={
                "taskHandle": task_handle,
                "leaseOwnerId":
                    "synthetic-custody.unlock-capability",
                "leaseTtlMillis": 30_000,
            },
        )
        for name, source in {
            "contract.json": contract_path,
            "included.json": included_path,
            "under-review.json": root
            / "state"
            / "vault_blind"
            / "under-review.json",
        }.items():
            base.copy_input(
                capability_input, name, source, "vault"
            )
        base.run_worker(
            "vault",
            "custody_unlock_capability",
            root,
            repository,
            python_root,
            node_executable,
            vault_state=True,
        )
        unlock_capability_path = (
            root
            / "state"
            / "custody_unlock_capability"
            / "capability.json"
        )
        unlock_capability = read_json(
            unlock_capability_path
        )
        unlock_request = base.sign_request(
            root,
            repository,
            python_root,
            node_executable,
            stage="custody_unlock",
            role="evaluator",
            protocol_id=protocol_id,
            action="unlock",
            request_id="synthetic-custody.request.unlock",
            sender_sequence=0,
            nonce="synthetic-custody-unlock-nonce-0001",
            timestamp=timestamp(9),
            task_handle=task_handle,
            capability=unlock_capability_path,
        )
        unlock_response = base.send_request(
            "evaluator",
            "custody_unlock",
            unlock_request,
            root,
            repository,
            python_root,
            node_executable,
        )
        if (
            not unlock_response["result"]["ok"]
            or unlock_response["result"]["taskState"]
            != "unlocked"
        ):
            raise RuntimeError("custody task unlock failed")
        _stdout, stderr = server.communicate(timeout=90)
        if server.returncode != 0:
            raise RuntimeError(
                "custody base vault server failed: "
                + stderr.decode("utf-8", errors="replace")
            )
    finally:
        if server.poll() is None:
            server.kill()
            server.communicate()

    return {
        "principals": principals,
        "contractPath": contract_path,
        "contract": read_json(contract_path),
        "included": included,
        "committed": committed,
        "reviewerInput": reviewer_input,
        "unlockCapability": unlock_capability,
        "unlockResult": unlock_response["result"],
        "baseAccessRecordHashes": [
            create_response["result"]["accessRecordHash"],
            seal_response["result"]["accessRecordHash"],
            unlock_response["result"]["accessRecordHash"],
        ],
    }


def custody_role_denials(
    *,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization: Path,
    scenario: str,
    protocol_id: str,
    custody_id: str,
) -> dict[str, Any]:
    custody_object = root / "custody" / custody_id
    journal_files = sorted(
        path
        for path in (
            root / "custody-state" / custody_id
        ).rglob("*.json")
        if path.is_file()
    )
    if not journal_files:
        raise RuntimeError("custody journal is empty")
    protected_paths = [
        f"/protected/custody/{custody_id}/key.bin",
        f"/protected/custody/{custody_id}/envelope.json",
        "/protected/"
        + str(journal_files[0].relative_to(root)),
        (
            f"/protected-materializations/{scenario}/"
            "payload.bin"
        ),
    ]
    if not custody_object.is_dir():
        raise RuntimeError("custody object is missing")
    results: dict[str, Any] = {}
    for role in base.ROLE_UIDS:
        if role == "vault":
            continue
        stage = f"custody_probe_{role}"
        base.reset_stage(root, stage, role)
        command = custody_sandbox(
            role=role,
            stage=stage,
            root=root,
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=materialization,
            vault_private=False,
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
            f"synthetic-custody:{role}:{protocol_id}",
        ]
        for forbidden in protected_paths:
            command.extend(
                [
                    "--forbidden-read",
                    forbidden,
                    "--forbidden-write",
                    forbidden,
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
                f"custody role probe {role} failed: "
                + completed.stderr.decode(
                    "utf-8", errors="replace"
                )
            )
        result = json.loads(completed.stdout)
        if (
            result["forbiddenReadsDenied"] != 4
            or result["forbiddenWritesDenied"] != 4
        ):
            raise PermissionError(
                f"{role} reached custody private state"
            )
        results[role] = result
    return results


def journal_transitions(
    root: Path, custody_id: str
) -> list[dict[str, Any]]:
    records = []
    for file in sorted(
        (
            root / "custody-state" / custody_id
        ).rglob("[0-9]" * 20 + ".json")
    ):
        record = read_json(file)
        records.append(record["payload"])
    return records


def stage_receipt(root: Path, stage: str) -> dict[str, Any]:
    return read_json(
        root / "state" / stage / "receipt.json"
    )


def attempt_fresh_capability_reuse(
    *,
    condition: str,
    ordinal: int,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization: Path,
    contract_path: Path,
    custody_id: str,
    descriptor_path: Path,
    capability_path: Path,
    occurred_at: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    before = journal_transitions(root, custody_id)
    sign_stage = (
        f"custody_{custody_id.split('.')[1]}_fresh_"
        f"{condition}_sign"
    )
    prepare_custody_stage(
        root=root,
        stage=sign_stage,
        role="evaluator",
        mode="sign_release",
        custody_id=custody_id,
        occurred_at=occurred_at,
        contract_path=contract_path,
        extra={
            "requestId":
                f"{custody_id}.fresh.{condition}.request",
            "senderSequence": 10_000 + ordinal,
            "requestNonce":
                f"{condition}-fresh-request-nonce-{ordinal:04d}",
        },
        inputs={
            "descriptor.json": descriptor_path,
            "capability.json": capability_path,
        },
    )
    sign_process = run_custody_worker(
        root=root,
        stage=sign_stage,
        role="evaluator",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=False,
    )
    require_success(sign_process, sign_stage)
    request_path = (
        root / "state" / sign_stage / "request.json"
    )
    request = read_json(request_path)
    reserve_stage = (
        f"custody_{custody_id.split('.')[1]}_fresh_"
        f"{condition}_reserve"
    )
    prepare_custody_stage(
        root=root,
        stage=reserve_stage,
        role="vault",
        mode="reserve_release",
        custody_id=custody_id,
        occurred_at=occurred_at,
        contract_path=contract_path,
        inputs={
            "descriptor.json": descriptor_path,
            "request.json": request_path,
        },
    )
    reserve_process = run_custody_worker(
        root=root,
        stage=reserve_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(reserve_process, reserve_stage)
    result = read_json(
        root / "state" / reserve_stage / "result.json"
    )
    after = journal_transitions(root, custody_id)
    denial = result["transition"]
    reservations = [
        transition
        for transition in after
        if transition["action"] == "reserve_release"
    ]
    materializations = [
        transition
        for transition in after
        if transition["action"]
        == "begin_materialization"
    ]
    if (
        request["requestHash"]
        == read_json(
            root
            / "state"
            / f"custody_{custody_id.split('.')[1]}_sign"
            / "request.json"
        )["requestHash"]
        or result["failure"]["code"] != "REPLAY_DETECTED"
        or not result["newlyCommitted"]
        or len(after) != len(before) + 1
        or denial["action"] != "deny_release"
        or denial["decision"] != "denied"
        or denial["denialReason"]
        != "consumed_capability_reuse"
        or denial["requestCommitment"]
        != f"sha256:{hashlib.sha256(base.canonical(request)).hexdigest()}"
        or denial["capabilityCommitment"]
        != request["capability"]["capabilityHash"]
        or denial["requestActor"] != request["actor"]
        or denial["stateBefore"] != denial["stateAfter"]
        or len(reservations) != 1
        or len(materializations) > 1
    ):
        raise RuntimeError(
            f"fresh capability replay escaped after {condition}"
        )
    exact_retry_stage = (
        f"custody_{custody_id.split('.')[1]}_fresh_"
        f"{condition}_exact_retry"
    )
    exact_retry_at = (
        datetime.fromisoformat(
            occurred_at.replace("Z", "+00:00")
        )
        + timedelta(seconds=1)
    ).isoformat().replace("+00:00", "Z")
    prepare_custody_stage(
        root=root,
        stage=exact_retry_stage,
        role="vault",
        mode="reserve_release",
        custody_id=custody_id,
        occurred_at=exact_retry_at,
        contract_path=contract_path,
        inputs={
            "descriptor.json": descriptor_path,
            "request.json": request_path,
        },
    )
    retry_process = run_custody_worker(
        root=root,
        stage=exact_retry_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(retry_process, exact_retry_stage)
    retry_result = read_json(
        root
        / "state"
        / exact_retry_stage
        / "result.json"
    )
    after_retry = journal_transitions(root, custody_id)
    if (
        retry_result["failure"]["code"]
        != "REPLAY_DETECTED"
        or retry_result["newlyCommitted"]
        or retry_result["transition"]["recordHash"]
        != denial["recordHash"]
        or len(after_retry) != len(after)
    ):
        raise RuntimeError(
            f"fresh capability exact retry changed history after {condition}"
        )
    return (
        {
            "condition": condition,
            "correctlySignedFreshRequest": True,
            "request": request,
            "requestHash": request["requestHash"],
            "senderSequence": request["senderSequence"],
            "nonce": request["nonce"],
            "failureCode": result["failure"]["code"],
            "newlyCommitted": result["newlyCommitted"],
            "denialTransitionHash":
                denial["recordHash"],
            "denialReason":
                denial["denialReason"],
            "statePreservingDenial": True,
            "transitionCountBefore": len(before),
            "transitionCountAfter": len(after),
            "exactRetryFailureCode":
                retry_result["failure"]["code"],
            "exactRetryNewlyCommitted":
                retry_result["newlyCommitted"],
            "exactRetryTransitionHash":
                retry_result["transition"]["recordHash"],
            "exactRetryTransitionCountBefore":
                len(after),
            "exactRetryTransitionCountAfter":
                len(after_retry),
            "reservationCount": len(reservations),
            "materializationCount":
                len(materializations),
            "secondReservationAppended": False,
            "secondMaterializationBegan": False,
        },
        [
            stage_receipt(root, sign_stage),
            stage_receipt(root, reserve_stage),
            stage_receipt(root, exact_retry_stage),
        ],
    )


def run_scenario(
    *,
    scenario: str,
    ordinal: int,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization_base: Path,
    setup: dict[str, Any],
    binding: dict[str, Any],
) -> dict[str, Any]:
    contract_path: Path = setup["contractPath"]
    custody_id = f"synthetic-custody.{scenario}.v1"
    materialization = materialization_base / scenario
    materialization.mkdir(mode=0o700)
    os.chown(
        materialization,
        base.ROLE_UIDS["vault"],
        base.ROLE_UIDS["vault"],
        follow_symlinks=False,
    )
    scenario_offset = 20 + ordinal * 10
    expires_at = (
        timestamp(scenario_offset + 2)
        if scenario == "capability_rejection"
        else timestamp(scenario_offset + 8)
    )
    request_at = timestamp(scenario_offset + 3)
    role_receipts: list[dict[str, Any]] = []

    seal_stage = f"custody_{scenario}_seal"
    seal_input, _state = prepare_custody_stage(
        root=root,
        stage=seal_stage,
        role="vault",
        mode="seal_custody",
        custody_id=custody_id,
        occurred_at=timestamp(scenario_offset),
        contract_path=contract_path,
        extra={
            "capabilityId":
                f"{custody_id}.capability",
            "capabilityIssuedAt":
                timestamp(scenario_offset + 1),
            "capabilityExpiresAt": expires_at,
            "capabilityNonce":
                f"{scenario}-capability-nonce-0001",
        },
    )
    base.write_input(
        seal_input,
        "binding.json",
        binding,
        "vault",
    )
    seal_process = run_custody_worker(
        root=root,
        stage=seal_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(seal_process, seal_stage)
    descriptor_path = (
        root / "state" / seal_stage / "descriptor.json"
    )
    capability_path = (
        root / "state" / seal_stage / "capability.json"
    )
    descriptor = read_json(descriptor_path)
    capability = read_json(capability_path)
    seal_result = read_json(
        root / "state" / seal_stage / "result.json"
    )
    role_receipts.append(stage_receipt(root, seal_stage))

    sign_stage = f"custody_{scenario}_sign"
    prepare_custody_stage(
        root=root,
        stage=sign_stage,
        role="evaluator",
        mode="sign_release",
        custody_id=custody_id,
        occurred_at=request_at,
        contract_path=contract_path,
        extra={
            "requestId": f"{custody_id}.request",
            "senderSequence": ordinal,
            "requestNonce":
                f"{scenario}-request-nonce-0001",
        },
        inputs={
            "descriptor.json": descriptor_path,
            "capability.json": capability_path,
        },
    )
    sign_process = run_custody_worker(
        root=root,
        stage=sign_stage,
        role="evaluator",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=False,
    )
    require_success(sign_process, sign_stage)
    request_path = (
        root / "state" / sign_stage / "request.json"
    )
    request = read_json(request_path)
    role_receipts.append(stage_receipt(root, sign_stage))

    reserve_stage = f"custody_{scenario}_reserve"
    prepare_custody_stage(
        root=root,
        stage=reserve_stage,
        role="vault",
        mode="reserve_release",
        custody_id=custody_id,
        occurred_at=timestamp(scenario_offset + 4),
        contract_path=contract_path,
        inputs={
            "descriptor.json": descriptor_path,
            "request.json": request_path,
        },
    )
    reserve_process = run_custody_worker(
        root=root,
        stage=reserve_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(reserve_process, reserve_stage)
    reserve_result = read_json(
        root / "state" / reserve_stage / "result.json"
    )
    role_receipts.append(
        stage_receipt(root, reserve_stage)
    )

    materialize_result = None
    consumer_receipt = None
    consumer_role_receipt = None
    consumer_process = {
        "returnCode": None,
        "timedOut": False,
        "responseLost": False,
        "receiptProduced": False,
    }
    exact_retry = None
    fresh_reuse: list[dict[str, Any]] = []
    role_denials = None

    if scenario == "capability_rejection":
        if (
            reserve_result["ok"]
            or reserve_result["failure"]["code"]
            != "AUTHORIZATION_DENIED"
        ):
            raise RuntimeError(
                "expired custody capability was accepted"
            )
        cleanup_reason = "capability_rejection"
        cleanup_mode = "cleanup"
    else:
        if not reserve_result["ok"]:
            raise RuntimeError(
                f"{scenario} reservation failed"
            )
        materialize_stage = (
            f"custody_{scenario}_materialize"
        )
        prepare_custody_stage(
            root=root,
            stage=materialize_stage,
            role="vault",
            mode="materialize",
            custody_id=custody_id,
            occurred_at=timestamp(
                scenario_offset + 5
            ),
            contract_path=contract_path,
            extra={
                "crashAfterPlaintextWrite":
                    scenario == "vault_crash"
            },
            inputs={
                "descriptor.json": descriptor_path,
                "request.json": request_path,
            },
        )
        materialize_process = run_custody_worker(
            root=root,
            stage=materialize_stage,
            role="vault",
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=materialization,
            vault_private=True,
            retain=scenario != "vault_crash",
        )
        payload_path = materialization / "payload.bin"
        if scenario == "vault_crash":
            if (
                materialize_process["returnCode"] == 0
                or not payload_path.is_file()
            ):
                raise RuntimeError(
                    "vault crash did not occur after plaintext write"
                )
            cleanup_reason = "vault_crash_recovery"
            cleanup_mode = "recover_cleanup"
        else:
            require_success(
                materialize_process, materialize_stage
            )
            materialize_result = read_json(
                root
                / "state"
                / materialize_stage
                / "result.json"
            )
            role_receipts.append(
                stage_receipt(root, materialize_stage)
            )
            if not payload_path.is_file():
                raise RuntimeError(
                    f"{scenario} plaintext was not materialized"
                )
            if scenario == "normal":
                role_denials = custody_role_denials(
                    root=root,
                    repository=repository,
                    python_root=python_root,
                    node_executable=node_executable,
                    materialization=materialization,
                    scenario=scenario,
                    protocol_id=setup["contract"][
                        "protocolId"
                    ],
                    custody_id=custody_id,
                )
            consume_stage = (
                f"custody_{scenario}_consume"
            )
            release_id = materialize_result[
                "transition"
            ]["releaseId"]
            consume_input, _state = (
                prepare_custody_stage(
                    root=root,
                    stage=consume_stage,
                    role="evaluator",
                    mode="consume",
                    custody_id=custody_id,
                    occurred_at=timestamp(
                        scenario_offset + 6
                    ),
                    contract_path=contract_path,
                    extra={
                        "consumerBehavior": (
                            "crash_after_read"
                            if scenario
                            == "evaluator_crash"
                            else (
                                "timeout"
                                if scenario == "timeout"
                                else "normal"
                            )
                        )
                    },
                    inputs={
                        "descriptor.json":
                            descriptor_path,
                    },
                )
            )
            base.write_input(
                consume_input,
                "release.json",
                {"releaseId": release_id},
                "evaluator",
            )
            consume_process = run_custody_worker(
                root=root,
                stage=consume_stage,
                role="evaluator",
                repository=repository,
                python_root=python_root,
                node_executable=node_executable,
                materialization=materialization,
                vault_private=False,
                evaluator_plaintext=True,
                timeout_seconds=(
                    0.75
                    if scenario == "timeout"
                    else 60
                ),
                retain=scenario != "response_loss",
            )
            consumer_process = {
                "returnCode":
                    consume_process["returnCode"],
                "timedOut":
                    consume_process["timedOut"],
                "responseLost":
                    scenario == "response_loss",
                "receiptProduced": (
                    root
                    / "state"
                    / consume_stage
                    / "evaluator-receipt.json"
                ).is_file(),
            }
            if scenario == "evaluator_crash":
                if consume_process["returnCode"] == 0:
                    raise RuntimeError(
                        "evaluator crash did not occur"
                    )
                cleanup_reason = "evaluator_crash"
            elif scenario == "timeout":
                if not consume_process["timedOut"]:
                    raise RuntimeError(
                        "evaluator timeout did not occur"
                    )
                cleanup_reason = "timeout"
            elif scenario == "response_loss":
                require_success(
                    consume_process, consume_stage
                )
                if not consumer_process[
                    "receiptProduced"
                ]:
                    raise RuntimeError(
                        "response-loss consumer produced no response"
                    )
                shutil.rmtree(
                    root / "state" / consume_stage
                )
                consumer_process[
                    "receiptProduced"
                ] = False
                cleanup_reason = "response_loss"
            else:
                require_success(
                    consume_process, consume_stage
                )
                consumer_receipt = read_json(
                    root
                    / "state"
                    / consume_stage
                    / "evaluator-receipt.json"
                )
                consumer_role_receipt = stage_receipt(
                    root, consume_stage
                )
                role_receipts.append(
                    consumer_role_receipt
                )
                cleanup_reason = "normal_completion"
        cleanup_mode = (
            "recover_cleanup"
            if scenario == "vault_crash"
            else "cleanup"
        )

    condition = {
        "normal": "normal_completion",
        "response_loss": "response_loss",
        "vault_crash": "vault_restart",
    }.get(scenario)
    if condition is not None:
        reuse, receipts = attempt_fresh_capability_reuse(
            condition=condition,
            ordinal=ordinal,
            root=root,
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=materialization,
            contract_path=contract_path,
            custody_id=custody_id,
            descriptor_path=descriptor_path,
            capability_path=capability_path,
            occurred_at=timestamp(scenario_offset + 6),
        )
        fresh_reuse.append(reuse)
        role_receipts.extend(receipts)

    cleanup_stage = f"custody_{scenario}_cleanup"
    cleanup_inputs = {
        "descriptor.json": descriptor_path,
        "request.json": request_path,
    }
    prepare_custody_stage(
        root=root,
        stage=cleanup_stage,
        role="vault",
        mode=cleanup_mode,
        custody_id=custody_id,
        occurred_at=timestamp(scenario_offset + 7),
        contract_path=contract_path,
        extra={"cleanupReason": cleanup_reason},
        inputs=cleanup_inputs,
    )
    cleanup_process = run_custody_worker(
        root=root,
        stage=cleanup_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
        scan_mounts=True,
    )
    require_success(cleanup_process, cleanup_stage)
    cleanup_result = read_json(
        root / "state" / cleanup_stage / "result.json"
    )
    leakage_scan = read_json(
        root
        / "state"
        / cleanup_stage
        / "leakage-scan.json"
    )
    role_receipts.append(
        stage_receipt(root, cleanup_stage)
    )
    if (
        cleanup_result["state"] != "cleaned"
        or (materialization / "payload.bin").exists()
        or (root / "custody" / custody_id).exists()
    ):
        raise RuntimeError(
            f"{scenario} cleanup left private material"
        )

    if scenario == "normal":
        reuse, receipts = attempt_fresh_capability_reuse(
            condition="cleanup_completion",
            ordinal=ordinal + 100,
            root=root,
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=materialization,
            contract_path=contract_path,
            custody_id=custody_id,
            descriptor_path=descriptor_path,
            capability_path=capability_path,
            occurred_at=timestamp(scenario_offset + 8),
        )
        fresh_reuse.append(reuse)
        role_receipts.extend(receipts)
        retry_reserve_stage = (
            "custody_normal_exact_retry_reserve"
        )
        prepare_custody_stage(
            root=root,
            stage=retry_reserve_stage,
            role="vault",
            mode="reserve_release",
            custody_id=custody_id,
            occurred_at=timestamp(
                scenario_offset + 8
            ),
            contract_path=contract_path,
            inputs={
                "descriptor.json": descriptor_path,
                "request.json": request_path,
            },
        )
        retry_reserve_process = run_custody_worker(
            root=root,
            stage=retry_reserve_stage,
            role="vault",
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=materialization,
            vault_private=True,
        )
        require_success(
            retry_reserve_process,
            retry_reserve_stage,
        )
        retry_reserve = read_json(
            root
            / "state"
            / retry_reserve_stage
            / "result.json"
        )
        role_receipts.append(
            stage_receipt(
                root, retry_reserve_stage
            )
        )
        retry_materialize_stage = (
            "custody_normal_exact_retry_materialize"
        )
        prepare_custody_stage(
            root=root,
            stage=retry_materialize_stage,
            role="vault",
            mode="materialize",
            custody_id=custody_id,
            occurred_at=timestamp(
                scenario_offset + 9
            ),
            contract_path=contract_path,
            inputs={
                "descriptor.json": descriptor_path,
                "request.json": request_path,
            },
        )
        retry_materialize_process = (
            run_custody_worker(
                root=root,
                stage=retry_materialize_stage,
                role="vault",
                repository=repository,
                python_root=python_root,
                node_executable=node_executable,
                materialization=materialization,
                vault_private=True,
            )
        )
        require_success(
            retry_materialize_process,
            retry_materialize_stage,
        )
        retry_materialize = read_json(
            root
            / "state"
            / retry_materialize_stage
            / "result.json"
        )
        role_receipts.append(
            stage_receipt(
                root, retry_materialize_stage
            )
        )
        if (
            retry_reserve["newlyCommitted"]
            or retry_reserve["transition"]["recordHash"]
            != reserve_result["transition"]["recordHash"]
            or retry_materialize["failure"]["code"]
            != "REPLAY_DETECTED"
            or retry_materialize[
                "materializationCreated"
            ]
            or (materialization / "payload.bin").exists()
        ):
            raise RuntimeError(
                "exact retry rematerialized plaintext"
            )
        exact_retry = {
            "reservationStable": True,
            "reservationTransitionHash":
                retry_reserve["transition"][
                    "recordHash"
                ],
            "secondMaterializationDenied": True,
            "failureCode":
                retry_materialize["failure"]["code"],
            "plaintextFilePresent": False,
        }

    transitions = journal_transitions(root, custody_id)
    if (
        len(
            [
                item
                for item in transitions
                if item["action"]
                == "begin_materialization"
            ]
        )
        > 1
    ):
        raise RuntimeError(
            f"{scenario} materialized more than once"
        )
    return {
        "scenario": scenario,
        "custodyId": custody_id,
        "descriptor": descriptor,
        "capability": capability,
        "request": request,
        "sealResult": seal_result,
        "reserveResult": reserve_result,
        "materializeResult": materialize_result,
        "consumer": consumer_process,
        "consumerReceipt": consumer_receipt,
        "consumerRoleReceipt":
            consumer_role_receipt,
        "cleanupResult": cleanup_result,
        "leakageScan": leakage_scan,
        "transitions": transitions,
        "roleReceipts": role_receipts,
        "roleDenials": role_denials,
        "exactRetry": exact_retry,
        "freshCapabilityReuse": fresh_reuse,
        "residuals": {
            "keyFilePresent": False,
            "ciphertextFilePresent": False,
            "plaintextFilePresent": False,
        },
    }


def run_crash_case(
    *,
    boundary: str,
    ordinal: int,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization_base: Path,
    setup: dict[str, Any],
    binding: dict[str, Any],
) -> dict[str, Any]:
    contract_path: Path = setup["contractPath"]
    custody_id = (
        f"synthetic-custody.crash-{ordinal}.v1"
    )
    materialization = (
        materialization_base / f"crash-{ordinal}"
    )
    materialization.mkdir(mode=0o700)
    os.chown(
        materialization,
        base.ROLE_UIDS["vault"],
        base.ROLE_UIDS["vault"],
        follow_symlinks=False,
    )
    offset = 100 + ordinal * 12
    receipts: list[dict[str, Any]] = []
    prefix = f"custody_crash_{ordinal}"

    seal_stage = f"{prefix}_seal"
    seal_input, _state = prepare_custody_stage(
        root=root,
        stage=seal_stage,
        role="vault",
        mode="seal_custody",
        custody_id=custody_id,
        occurred_at=timestamp(offset),
        contract_path=contract_path,
        extra={
            "capabilityId":
                f"{custody_id}.capability",
            "capabilityIssuedAt": timestamp(offset + 1),
            "capabilityExpiresAt": timestamp(
                offset + 2
                if boundary == "after_deny_release"
                else offset + 11
            ),
            "capabilityNonce":
                f"crash-{ordinal}-capability-nonce-0001",
        },
    )
    base.write_input(
        seal_input, "binding.json", binding, "vault"
    )
    process = run_custody_worker(
        root=root,
        stage=seal_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(process, seal_stage)
    receipts.append(stage_receipt(root, seal_stage))
    descriptor_path = (
        root / "state" / seal_stage / "descriptor.json"
    )
    capability_path = (
        root / "state" / seal_stage / "capability.json"
    )
    descriptor = read_json(descriptor_path)

    sign_stage = f"{prefix}_sign"
    prepare_custody_stage(
        root=root,
        stage=sign_stage,
        role="evaluator",
        mode="sign_release",
        custody_id=custody_id,
        occurred_at=timestamp(
            offset + 3
            if boundary == "after_deny_release"
            else offset + 2
        ),
        contract_path=contract_path,
        extra={
            "requestId": f"{custody_id}.request",
            "senderSequence": 20_000 + ordinal,
            "requestNonce":
                f"crash-{ordinal}-request-nonce-0001",
        },
        inputs={
            "descriptor.json": descriptor_path,
            "capability.json": capability_path,
        },
    )
    process = run_custody_worker(
        root=root,
        stage=sign_stage,
        role="evaluator",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=False,
    )
    require_success(process, sign_stage)
    receipts.append(stage_receipt(root, sign_stage))
    request_path = (
        root / "state" / sign_stage / "request.json"
    )
    request = read_json(request_path)

    reserve_stage = f"{prefix}_reserve"
    prepare_custody_stage(
        root=root,
        stage=reserve_stage,
        role="vault",
        mode="reserve_release",
        custody_id=custody_id,
        occurred_at=timestamp(offset + 3),
        contract_path=contract_path,
        extra={
            "crashAfterReservationCommit":
                boundary == "after_reservation_commit",
            "crashAfterDenialCommit":
                boundary == "after_deny_release",
        },
        inputs={
            "descriptor.json": descriptor_path,
            "request.json": request_path,
        },
    )
    reserve_process = run_custody_worker(
        root=root,
        stage=reserve_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
        retain=boundary
        not in {
            "after_reservation_commit",
            "after_deny_release",
        },
    )
    if boundary in {
        "after_reservation_commit",
        "after_deny_release",
    }:
        if reserve_process["returnCode"] == 0:
            raise RuntimeError(
                f"{boundary} crash boundary did not terminate"
            )
    else:
        require_success(reserve_process, reserve_stage)
        receipts.append(stage_receipt(root, reserve_stage))

    if boundary == "after_reservation_commit":
        cleanup_reason = "reservation_abandoned"
    elif boundary == "after_deny_release":
        cleanup_reason = "capability_rejection"
    else:
        if boundary == "after_deny_materialization":
            tamper_stage = f"{prefix}_tamper"
            prepare_custody_stage(
                root=root,
                stage=tamper_stage,
                role="vault",
                mode="tamper_private_envelope",
                custody_id=custody_id,
                occurred_at=timestamp(offset + 4),
                contract_path=contract_path,
                extra={"tamperKind": "authentication_tag"},
                inputs={
                    "descriptor.json": descriptor_path,
                },
            )
            tamper_process = run_custody_worker(
                root=root,
                stage=tamper_stage,
                role="vault",
                repository=repository,
                python_root=python_root,
                node_executable=node_executable,
                materialization=materialization,
                vault_private=True,
            )
            require_success(tamper_process, tamper_stage)
            receipts.append(
                stage_receipt(root, tamper_stage)
            )
        materialize_stage = f"{prefix}_materialize"
        prepare_custody_stage(
            root=root,
            stage=materialize_stage,
            role="vault",
            mode="materialize",
            custody_id=custody_id,
            occurred_at=timestamp(offset + 4),
            contract_path=contract_path,
            extra={
                "crashAfterMaterializationStart":
                    boundary
                    == "after_materialization_start",
                "crashAfterMaterializationDenialCommit":
                    boundary
                    == "after_deny_materialization",
            },
            inputs={
                "descriptor.json": descriptor_path,
                "request.json": request_path,
            },
        )
        materialize_process = run_custody_worker(
            root=root,
            stage=materialize_stage,
            role="vault",
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=materialization,
            vault_private=True,
            retain=(
                boundary
                not in {
                    "after_materialization_start",
                    "after_deny_materialization",
                }
            ),
        )
        if boundary == "after_materialization_start":
            if (
                materialize_process["returnCode"] == 0
                or (
                    materialization / "payload.bin"
                ).exists()
            ):
                raise RuntimeError(
                    "materialization-start crash crossed plaintext write"
                )
            cleanup_reason = (
                "materialization_prewrite_abandoned"
            )
        elif boundary == "after_deny_materialization":
            if (
                materialize_process["returnCode"] == 0
                or (
                    materialization / "payload.bin"
                ).exists()
            ):
                raise RuntimeError(
                    "materialization-denial crash crossed plaintext write"
                )
            cleanup_reason = "cryptographic_rejection"
        else:
            require_success(
                materialize_process, materialize_stage
            )
            receipts.append(
                stage_receipt(root, materialize_stage)
            )
            if not (
                materialization / "payload.bin"
            ).is_file():
                raise RuntimeError(
                    "cleanup crash case has no plaintext"
                )
            cleanup_reason = {
                "after_plaintext_delete":
                    "cleanup_interrupted_after_plaintext_delete",
                "after_private_delete":
                    "cleanup_interrupted_after_private_delete",
                "after_cleanup_commit":
                    "cleanup_acknowledgement_loss",
            }[boundary]

    crash_cleanup_process: (
        dict[str, Any] | None
    ) = None
    if boundary in {
        "after_plaintext_delete",
        "after_private_delete",
        "after_cleanup_commit",
    }:
        crash_cleanup_stage = f"{prefix}_cleanup_crash"
        prepare_custody_stage(
            root=root,
            stage=crash_cleanup_stage,
            role="vault",
            mode="cleanup",
            custody_id=custody_id,
            occurred_at=timestamp(offset + 5),
            contract_path=contract_path,
            extra={
                "cleanupReason": cleanup_reason,
                "crashAfterPlaintextDelete":
                    boundary
                    == "after_plaintext_delete",
                "crashAfterPrivateDelete":
                    boundary == "after_private_delete",
                "crashAfterCleanupCommit":
                    boundary == "after_cleanup_commit",
            },
            inputs={
                "descriptor.json": descriptor_path,
                "request.json": request_path,
            },
        )
        crash_cleanup_process = run_custody_worker(
            root=root,
            stage=crash_cleanup_stage,
            role="vault",
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=materialization,
            vault_private=True,
            scan_mounts=True,
            retain=False,
        )
        if crash_cleanup_process["returnCode"] == 0:
            raise RuntimeError(
                f"{boundary} cleanup did not terminate"
            )

    before_recovery = journal_transitions(
        root, custody_id
    )
    reservation_count_before_recovery = sum(
        transition["action"] == "reserve_release"
        for transition in before_recovery
    )
    materialization_count_before_recovery = sum(
        transition["action"]
        == "begin_materialization"
        for transition in before_recovery
    )

    recovery_stage = f"{prefix}_recover"
    prepare_custody_stage(
        root=root,
        stage=recovery_stage,
        role="vault",
        mode="recover_cleanup",
        custody_id=custody_id,
        occurred_at=timestamp(offset + 6),
        contract_path=contract_path,
        extra={"cleanupReason": cleanup_reason},
        inputs={
            "descriptor.json": descriptor_path,
            "request.json": request_path,
        },
    )
    recovery_process = run_custody_worker(
        root=root,
        stage=recovery_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
        scan_mounts=True,
    )
    require_success(recovery_process, recovery_stage)
    receipts.append(stage_receipt(root, recovery_stage))
    result = read_json(
        root / "state" / recovery_stage / "result.json"
    )
    scan = read_json(
        root
        / "state"
        / recovery_stage
        / "leakage-scan.json"
    )
    transitions = journal_transitions(root, custody_id)
    begin_cleanup_count = sum(
        transition["action"] == "begin_cleanup"
        for transition in transitions
    )
    cleanup_count = sum(
        transition["action"] == "cleanup"
        for transition in transitions
    )
    materialization_count = sum(
        transition["action"]
        == "begin_materialization"
        for transition in transitions
    )
    reservation_count = sum(
        transition["action"] == "reserve_release"
        for transition in transitions
    )
    denial_count = sum(
        transition["action"]
        in {"deny_release", "deny_materialization"}
        for transition in transitions
    )
    expected_materializations = (
        0
        if boundary
        in {
            "after_reservation_commit",
            "after_deny_release",
        }
        else 1
    )
    expected_reservations = (
        0 if boundary == "after_deny_release" else 1
    )
    expected_denials = (
        1
        if boundary
        in {
            "after_deny_release",
            "after_deny_materialization",
        }
        else 0
    )
    residuals = {
        "keyFilePresent": (
            root / "custody" / custody_id / "key.bin"
        ).exists(),
        "ciphertextFilePresent": (
            root
            / "custody"
            / custody_id
            / "envelope.json"
        ).exists(),
        "plaintextFilePresent": (
            materialization / "payload.bin"
        ).exists(),
    }
    leakage_counts = [
        scan[name]
        for name in (
            "repositoryPayloadMatches",
            "repositoryKeyMatches",
            "retainedStatePayloadMatches",
            "retainedStateKeyMatches",
            "logPayloadMatches",
            "logKeyMatches",
            "processArgumentPayloadMatches",
            "processArgumentKeyMatches",
        )
    ]
    if (
        result["state"] != "cleaned"
        or begin_cleanup_count != 1
        or cleanup_count != 1
        or materialization_count
        != expected_materializations
        or reservation_count != expected_reservations
        or denial_count != expected_denials
        or reservation_count
        != reservation_count_before_recovery
        or materialization_count
        != materialization_count_before_recovery
        or any(residuals.values())
        or any(leakage_counts)
    ):
        raise RuntimeError(
            f"{boundary} recovery is not terminal and clean"
        )
    return {
        "boundary": boundary,
        "deliveryGuarantee":
            "at_most_once_abort_on_uncertain_delivery",
        "cleanupReason": cleanup_reason,
        "crashObserved": True,
        "crashReturnCode": (
            reserve_process["returnCode"]
            if boundary
            in {
                "after_reservation_commit",
                "after_deny_release",
            }
            else (
                materialize_process["returnCode"]
                if boundary
                in {
                    "after_materialization_start",
                    "after_deny_materialization",
                }
                else crash_cleanup_process["returnCode"]
            )
        ),
        "evaluatorPlaintextMounted": False,
        "evaluatorReceiptProduced": False,
        "descriptor": descriptor,
        "transitions": transitions,
        "terminalTransitionHash":
            result["transition"]["recordHash"],
        "beginCleanupCount": begin_cleanup_count,
        "cleanupCount": cleanup_count,
        "denialCount": denial_count,
        "reservationCountBeforeRecovery":
            reservation_count_before_recovery,
        "reservationCountAfterRecovery":
            reservation_count,
        "materializationCountBeforeRecovery":
            materialization_count_before_recovery,
        "materializationCountAfterRecovery":
            materialization_count,
        "materializationCount": materialization_count,
        "duplicateMaterializationCount": 0,
        "leakageScan": scan,
        "roleReceipts": receipts,
        "residuals": residuals,
    }


def prepare_attack_object(
    *,
    prefix: str,
    custody_id: str,
    offset: int,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization: Path,
    contract_path: Path,
    binding: dict[str, Any],
) -> tuple[Path, Path, dict[str, Any], dict[str, Any]]:
    stage = f"{prefix}_seal"
    input_directory, _state = prepare_custody_stage(
        root=root,
        stage=stage,
        role="vault",
        mode="seal_custody",
        custody_id=custody_id,
        occurred_at=timestamp(offset),
        contract_path=contract_path,
        extra={
            "capabilityId":
                f"{custody_id}.capability",
            "capabilityIssuedAt": timestamp(offset + 1),
            "capabilityExpiresAt": timestamp(offset + 9),
            "capabilityNonce":
                f"{prefix}-capability-nonce-0001",
        },
    )
    base.write_input(
        input_directory,
        "binding.json",
        binding,
        "vault",
    )
    process = run_custody_worker(
        root=root,
        stage=stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(process, stage)
    descriptor_path = (
        root / "state" / stage / "descriptor.json"
    )
    capability_path = (
        root / "state" / stage / "capability.json"
    )
    return (
        descriptor_path,
        capability_path,
        read_json(descriptor_path),
        stage_receipt(root, stage),
    )


def finish_adversarial_cleanup(
    *,
    prefix: str,
    custody_id: str,
    offset: int,
    reason: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization: Path,
    contract_path: Path,
    descriptor_path: Path,
    request_path: Path,
) -> tuple[
    dict[str, Any], dict[str, Any], dict[str, Any]
]:
    stage = f"{prefix}_cleanup"
    prepare_custody_stage(
        root=root,
        stage=stage,
        role="vault",
        mode="recover_cleanup",
        custody_id=custody_id,
        occurred_at=timestamp(offset),
        contract_path=contract_path,
        extra={"cleanupReason": reason},
        inputs={
            "descriptor.json": descriptor_path,
            "request.json": request_path,
        },
    )
    process = run_custody_worker(
        root=root,
        stage=stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
        scan_mounts=True,
    )
    require_success(process, stage)
    return (
        read_json(root / "state" / stage / "result.json"),
        read_json(
            root
            / "state"
            / stage
            / "leakage-scan.json"
        ),
        stage_receipt(root, stage),
    )


def assert_adversarial_terminal(
    *,
    attack_id: str,
    root: Path,
    custody_id: str,
    materialization: Path,
    scan: dict[str, Any],
    expected_materializations: int,
    expected_denial_action: str,
) -> tuple[list[dict[str, Any]], dict[str, bool]]:
    transitions = journal_transitions(root, custody_id)
    denial_count = sum(
        transition["action"] == expected_denial_action
        for transition in transitions
    )
    cleanup_count = sum(
        transition["action"] == "cleanup"
        for transition in transitions
    )
    begin_cleanup_count = sum(
        transition["action"] == "begin_cleanup"
        for transition in transitions
    )
    materialization_count = sum(
        transition["action"]
        == "begin_materialization"
        for transition in transitions
    )
    residuals = {
        "keyFilePresent": (
            root / "custody" / custody_id / "key.bin"
        ).exists(),
        "ciphertextFilePresent": (
            root
            / "custody"
            / custody_id
            / "envelope.json"
        ).exists(),
        "plaintextFilePresent": (
            materialization / "payload.bin"
        ).exists(),
    }
    leakage_counts = [
        scan[name]
        for name in (
            "repositoryPayloadMatches",
            "repositoryKeyMatches",
            "retainedStatePayloadMatches",
            "retainedStateKeyMatches",
            "logPayloadMatches",
            "logKeyMatches",
            "processArgumentPayloadMatches",
            "processArgumentKeyMatches",
        )
    ]
    if (
        denial_count != 1
        or cleanup_count != 1
        or begin_cleanup_count != 1
        or materialization_count
        != expected_materializations
        or any(residuals.values())
        or any(leakage_counts)
    ):
        raise RuntimeError(
            f"{attack_id} did not deny and clean exactly once"
        )
    return transitions, residuals


def run_envelope_attack(
    *,
    attack: str,
    ordinal: int,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization_base: Path,
    setup: dict[str, Any],
    binding: dict[str, Any],
) -> dict[str, Any]:
    custody_id = (
        f"synthetic-custody.attack-envelope-{ordinal}.v1"
    )
    prefix = f"custody_attack_envelope_{ordinal}"
    offset = 180 + ordinal * 10
    materialization = (
        materialization_base / f"attack-envelope-{ordinal}"
    )
    materialization.mkdir(mode=0o700)
    os.chown(
        materialization,
        base.ROLE_UIDS["vault"],
        base.ROLE_UIDS["vault"],
        follow_symlinks=False,
    )
    contract_path: Path = setup["contractPath"]
    (
        descriptor_path,
        capability_path,
        descriptor,
        seal_receipt,
    ) = prepare_attack_object(
        prefix=prefix,
        custody_id=custody_id,
        offset=offset,
        root=root,
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        contract_path=contract_path,
        binding=binding,
    )
    receipts = [seal_receipt]

    sign_stage = f"{prefix}_sign"
    prepare_custody_stage(
        root=root,
        stage=sign_stage,
        role="evaluator",
        mode="sign_release",
        custody_id=custody_id,
        occurred_at=timestamp(offset + 2),
        contract_path=contract_path,
        extra={
            "requestId": f"{custody_id}.request",
            "senderSequence": 30_000 + ordinal,
            "requestNonce":
                f"envelope-{ordinal}-request-nonce-0001",
        },
        inputs={
            "descriptor.json": descriptor_path,
            "capability.json": capability_path,
        },
    )
    process = run_custody_worker(
        root=root,
        stage=sign_stage,
        role="evaluator",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=False,
    )
    require_success(process, sign_stage)
    receipts.append(stage_receipt(root, sign_stage))
    request_path = (
        root / "state" / sign_stage / "request.json"
    )
    request = read_json(request_path)

    reserve_stage = f"{prefix}_reserve"
    prepare_custody_stage(
        root=root,
        stage=reserve_stage,
        role="vault",
        mode="reserve_release",
        custody_id=custody_id,
        occurred_at=timestamp(offset + 3),
        contract_path=contract_path,
        inputs={
            "descriptor.json": descriptor_path,
            "request.json": request_path,
        },
    )
    process = run_custody_worker(
        root=root,
        stage=reserve_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(process, reserve_stage)
    receipts.append(stage_receipt(root, reserve_stage))

    tamper_stage = f"{prefix}_tamper"
    prepare_custody_stage(
        root=root,
        stage=tamper_stage,
        role="vault",
        mode="tamper_private_envelope",
        custody_id=custody_id,
        occurred_at=timestamp(offset + 4),
        contract_path=contract_path,
        extra={"tamperKind": attack},
        inputs={"descriptor.json": descriptor_path},
    )
    process = run_custody_worker(
        root=root,
        stage=tamper_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(process, tamper_stage)
    receipts.append(stage_receipt(root, tamper_stage))

    materialize_stage = f"{prefix}_materialize"
    prepare_custody_stage(
        root=root,
        stage=materialize_stage,
        role="vault",
        mode="materialize",
        custody_id=custody_id,
        occurred_at=timestamp(offset + 5),
        contract_path=contract_path,
        inputs={
            "descriptor.json": descriptor_path,
            "request.json": request_path,
        },
    )
    process = run_custody_worker(
        root=root,
        stage=materialize_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(process, materialize_stage)
    result = read_json(
        root / "state" / materialize_stage / "result.json"
    )
    receipts.append(stage_receipt(root, materialize_stage))
    if (
        result["ok"]
        or result["failure"]["code"]
        not in {
            "AUTHENTICATION_FAILED",
            "HASH_MISMATCH",
            "SCHEMA_INVALID",
        }
        or result["materializationCreated"]
        or (materialization / "payload.bin").exists()
    ):
        raise RuntimeError(
            f"{attack} envelope attack produced plaintext"
        )

    cleanup_result, scan, cleanup_receipt = (
        finish_adversarial_cleanup(
            prefix=prefix,
            custody_id=custody_id,
            offset=offset + 6,
            reason="cryptographic_rejection",
            root=root,
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=materialization,
            contract_path=contract_path,
            descriptor_path=descriptor_path,
            request_path=request_path,
        )
    )
    receipts.append(cleanup_receipt)
    if cleanup_result["state"] != "cleaned":
        raise RuntimeError(
            f"{attack} cleanup is not terminal"
        )
    transitions, residuals = (
        assert_adversarial_terminal(
            attack_id=attack,
            root=root,
            custody_id=custody_id,
            materialization=materialization,
            scan=scan,
            expected_materializations=1,
            expected_denial_action=
                "deny_materialization",
        )
    )
    denial = next(
        transition
        for transition in transitions
        if transition["action"]
        == "deny_materialization"
    )
    return {
        "attackId": f"envelope.{attack}",
        "attackClass": (
            "descriptor_envelope_swap"
            if attack == "envelope_swap"
            else (
                "aad_identity_substitution"
                if attack.startswith("aad_")
                else "cipher_envelope_tamper"
            )
        ),
        "targetField": attack,
        "correctlySignedRequest": True,
        "request": request,
        "crossScenarioSwap":
            attack == "envelope_swap",
        "evaluatorPlaintextMounted": False,
        "evaluatorReceiptProduced": False,
        "denialCode": denial["reasonCode"],
        "denialTransitionHash": denial["recordHash"],
        "cleanupReason": "cryptographic_rejection",
        "cleanupTransitionHash":
            cleanup_result["transition"]["recordHash"],
        "descriptor": descriptor,
        "transitions": transitions,
        "leakageScan": scan,
        "roleReceipts": receipts,
        "residuals": residuals,
    }


def run_capability_substitution_attack(
    *,
    field: str,
    ordinal: int,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization_base: Path,
    setup: dict[str, Any],
    binding: dict[str, Any],
) -> dict[str, Any]:
    custody_id = (
        f"synthetic-custody.attack-capability-{ordinal}.v1"
    )
    prefix = f"custody_attack_capability_{ordinal}"
    offset = 350 + ordinal * 10
    materialization = (
        materialization_base
        / f"attack-capability-{ordinal}"
    )
    materialization.mkdir(mode=0o700)
    os.chown(
        materialization,
        base.ROLE_UIDS["vault"],
        base.ROLE_UIDS["vault"],
        follow_symlinks=False,
    )
    contract_path: Path = setup["contractPath"]
    (
        descriptor_path,
        capability_path,
        descriptor,
        seal_receipt,
    ) = prepare_attack_object(
        prefix=prefix,
        custody_id=custody_id,
        offset=offset,
        root=root,
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        contract_path=contract_path,
        binding=binding,
    )
    receipts = [seal_receipt]

    forge_stage = f"{prefix}_forge"
    prepare_custody_stage(
        root=root,
        stage=forge_stage,
        role="vault",
        mode="forge_substituted_capability",
        custody_id=custody_id,
        occurred_at=timestamp(offset + 2),
        contract_path=contract_path,
        extra={"substitutionField": field},
        inputs={
            "descriptor.json": descriptor_path,
            "capability.json": capability_path,
        },
    )
    process = run_custody_worker(
        root=root,
        stage=forge_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(process, forge_stage)
    receipts.append(stage_receipt(root, forge_stage))
    substituted_capability_path = (
        root / "state" / forge_stage / "capability.json"
    )

    sign_stage = f"{prefix}_sign"
    prepare_custody_stage(
        root=root,
        stage=sign_stage,
        role="evaluator",
        mode="sign_substituted_release",
        custody_id=custody_id,
        occurred_at=timestamp(offset + 3),
        contract_path=contract_path,
        extra={
            "requestId":
                f"{custody_id}.substituted.request",
            "senderSequence": 40_000 + ordinal,
            "requestNonce":
                f"substitution-{ordinal}-request-nonce-0001",
        },
        inputs={
            "descriptor.json": descriptor_path,
            "capability.json":
                substituted_capability_path,
        },
    )
    process = run_custody_worker(
        root=root,
        stage=sign_stage,
        role="evaluator",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=False,
    )
    require_success(process, sign_stage)
    receipts.append(stage_receipt(root, sign_stage))
    request_path = (
        root / "state" / sign_stage / "request.json"
    )
    request = read_json(request_path)

    reserve_stage = f"{prefix}_reserve"
    prepare_custody_stage(
        root=root,
        stage=reserve_stage,
        role="vault",
        mode="reserve_release",
        custody_id=custody_id,
        occurred_at=timestamp(offset + 4),
        contract_path=contract_path,
        inputs={
            "descriptor.json": descriptor_path,
            "request.json": request_path,
        },
    )
    process = run_custody_worker(
        root=root,
        stage=reserve_stage,
        role="vault",
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=True,
    )
    require_success(process, reserve_stage)
    result = read_json(
        root / "state" / reserve_stage / "result.json"
    )
    receipts.append(stage_receipt(root, reserve_stage))
    if (
        result["ok"]
        or result["failure"]["code"]
        != "AUTHORIZATION_DENIED"
        or result["materializationCreated"]
    ):
        raise RuntimeError(
            f"{field} substituted capability was accepted"
        )

    cleanup_result, scan, cleanup_receipt = (
        finish_adversarial_cleanup(
            prefix=prefix,
            custody_id=custody_id,
            offset=offset + 5,
            reason="capability_rejection",
            root=root,
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=materialization,
            contract_path=contract_path,
            descriptor_path=descriptor_path,
            request_path=request_path,
        )
    )
    receipts.append(cleanup_receipt)
    transitions, residuals = (
        assert_adversarial_terminal(
            attack_id=field,
            root=root,
            custody_id=custody_id,
            materialization=materialization,
            scan=scan,
            expected_materializations=0,
            expected_denial_action="deny_release",
        )
    )
    denial = next(
        transition
        for transition in transitions
        if transition["action"] == "deny_release"
    )
    return {
        "attackId": f"capability.{field}",
        "attackClass": (
            "capability_object_substitution"
            if field == "custodyId"
            else "capability_identity_substitution"
        ),
        "targetField": field,
        "correctlySignedRequest": True,
        "request": request,
        "crossScenarioSwap": field == "custodyId",
        "evaluatorPlaintextMounted": False,
        "evaluatorReceiptProduced": False,
        "denialCode": denial["reasonCode"],
        "denialTransitionHash": denial["recordHash"],
        "cleanupReason": "capability_rejection",
        "cleanupTransitionHash":
            cleanup_result["transition"]["recordHash"],
        "descriptor": descriptor,
        "transitions": transitions,
        "leakageScan": scan,
        "roleReceipts": receipts,
        "residuals": residuals,
    }


def run_projection(
    *,
    role: str,
    mode: str,
    stage: str,
    occurred_at: str,
    root: Path,
    repository: Path,
    python_root: Path,
    node_executable: Path,
    materialization: Path,
    contract_path: Path,
    descriptor_path: Path,
    source_receipt_hash: str,
    cleanup_transition_hash: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    input_directory, _state = prepare_custody_stage(
        root=root,
        stage=stage,
        role=role,
        mode=mode,
        custody_id="synthetic-custody.normal.v1",
        occurred_at=occurred_at,
        contract_path=contract_path,
        inputs={"descriptor.json": descriptor_path},
    )
    base.write_input(
        input_directory,
        "projection-input.json",
        {
            "sourceReceiptHash":
                source_receipt_hash,
            "cleanupTransitionHash":
                cleanup_transition_hash,
        },
        role,
    )
    process = run_custody_worker(
        root=root,
        stage=stage,
        role=role,
        repository=repository,
        python_root=python_root,
        node_executable=node_executable,
        materialization=materialization,
        vault_private=False,
    )
    require_success(process, stage)
    return (
        read_json(
            root / "state" / stage / "projection.json"
        ),
        stage_receipt(root, stage),
    )


def main() -> int:
    arguments = parse_arguments()
    root = Path(arguments.root).resolve()
    repository = Path(arguments.repository).resolve()
    python_root = Path(arguments.python_root).resolve()
    node_executable = Path(
        arguments.node_executable
    ).resolve()
    protocol_id = "protocol-sha256:" + "c" * 64
    task_handle = "opaque-task-sha256:" + "d" * 64
    materialization_base = Path(
        tempfile.mkdtemp(
            prefix="seh-synthetic-custody-",
            dir="/dev/shm",
        )
    )
    try:
        if os.geteuid() != 0:
            raise PermissionError(
                "synthetic custody OS gate requires root in a user namespace"
            )
        tmpfs_type = tmpfs_for(materialization_base)
        os.chmod(materialization_base, 0o700)
        base.prepare_ownership(root)
        prepare_custody_roots(root)
        setup = setup_authorship_and_unlock(
            root=root,
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            protocol_id=protocol_id,
            task_handle=task_handle,
        )
        reviewer_input: Path = setup["reviewerInput"]
        reviewer_bytes = b"".join(
            file.read_bytes()
            for file in sorted(reviewer_input.iterdir())
        )
        if (
            task_handle.encode() in reviewer_bytes
            or b"synthetic_custody_descriptor"
            in reviewer_bytes
            or b"ciphertextCommitment"
            in reviewer_bytes
        ):
            raise PermissionError(
                "reviewer received custody-identifying metadata"
            )
        binding = {
            "taskHandleCommitment":
                text_digest(task_handle),
            "authorCommitmentHash":
                setup["committed"]["recordHash"],
            "includedTransitionHash":
                setup["included"]["recordHash"],
            "admittedVaultStateHead":
                setup["unlockResult"]["stateHead"],
            "unlockCapabilityHash":
                setup["unlockCapability"][
                    "capabilityHash"
                ],
        }
        scenarios = [
            run_scenario(
                scenario=scenario,
                ordinal=ordinal,
                root=root,
                repository=repository,
                python_root=python_root,
                node_executable=node_executable,
                materialization_base=materialization_base,
                setup=setup,
                binding=binding,
            )
            for ordinal, scenario in enumerate(SCENARIOS)
        ]
        crash_cases = [
            run_crash_case(
                boundary=boundary,
                ordinal=ordinal,
                root=root,
                repository=repository,
                python_root=python_root,
                node_executable=node_executable,
                materialization_base=materialization_base,
                setup=setup,
                binding=binding,
            )
            for ordinal, boundary in enumerate(
                CRASH_BOUNDARIES
            )
        ]
        adversarial_cases = [
            run_envelope_attack(
                attack=attack,
                ordinal=ordinal,
                root=root,
                repository=repository,
                python_root=python_root,
                node_executable=node_executable,
                materialization_base=materialization_base,
                setup=setup,
                binding=binding,
            )
            for ordinal, attack in enumerate(
                ENVELOPE_ATTACKS
            )
        ] + [
            run_capability_substitution_attack(
                field=field,
                ordinal=ordinal,
                root=root,
                repository=repository,
                python_root=python_root,
                node_executable=node_executable,
                materialization_base=materialization_base,
                setup=setup,
                binding=binding,
            )
            for ordinal, field in enumerate(
                CAPABILITY_SUBSTITUTIONS
            )
        ]
        normal = scenarios[0]
        normal_descriptor_path = (
            root
            / "state"
            / "custody_normal_seal"
            / "descriptor.json"
        )
        normal_consumer_receipt = normal[
            "consumerReceipt"
        ]
        if normal_consumer_receipt is None:
            raise RuntimeError(
                "normal custody scenario has no evaluator receipt"
            )
        cleanup_hash = normal["cleanupResult"][
            "transition"
        ]["recordHash"]
        scorer_projection, scorer_receipt = (
            run_projection(
                role="scorer",
                mode="scorer_projection",
                stage="custody_scorer_projection",
                occurred_at=timestamp(90),
                root=root,
                repository=repository,
                python_root=python_root,
                node_executable=node_executable,
                materialization=(
                    materialization_base / "normal"
                ),
                contract_path=setup["contractPath"],
                descriptor_path=normal_descriptor_path,
                source_receipt_hash=(
                    normal_consumer_receipt["recordHash"]
                ),
                cleanup_transition_hash=cleanup_hash,
            )
        )
        promoter_projection, promoter_receipt = (
            run_projection(
                role="promoter",
                mode="promoter_projection",
                stage="custody_promoter_projection",
                occurred_at=timestamp(91),
                root=root,
                repository=repository,
                python_root=python_root,
                node_executable=node_executable,
                materialization=(
                    materialization_base / "normal"
                ),
                contract_path=setup["contractPath"],
                descriptor_path=normal_descriptor_path,
                source_receipt_hash=(
                    scorer_projection["recordHash"]
                ),
                cleanup_transition_hash=cleanup_hash,
            )
        )

        descriptor_hashes = sorted(
            {
                item["descriptor"]["recordHash"]
                for item in scenarios
            }
            | {
                item["descriptor"]["recordHash"]
                for item in crash_cases
            }
            | {
                item["descriptor"]["recordHash"]
                for item in adversarial_cases
            }
        )
        transition_hashes = sorted(
            {
                transition["recordHash"]
                for item in scenarios
                for transition in item["transitions"]
            }
            | {
                transition["recordHash"]
                for item in crash_cases
                for transition in item["transitions"]
            }
            | {
                transition["recordHash"]
                for item in adversarial_cases
                for transition in item["transitions"]
            }
        )
        role_receipts = [
            receipt
            for item in scenarios
            for receipt in item["roleReceipts"]
        ] + [
            receipt
            for item in crash_cases
            for receipt in item["roleReceipts"]
        ] + [
            receipt
            for item in adversarial_cases
            for receipt in item["roleReceipts"]
        ] + [scorer_receipt, promoter_receipt]
        leakage_scan_hashes = sorted(
            {
                item["leakageScan"]["recordHash"]
                for item in scenarios
            }
            | {
                item["leakageScan"]["recordHash"]
                for item in crash_cases
            }
            | {
                item["leakageScan"]["recordHash"]
                for item in adversarial_cases
            }
        )
        audit_stage = "custody_audit_finalize"
        audit_input, _state = prepare_custody_stage(
            root=root,
            stage=audit_stage,
            role="audit_store",
            mode="finalize_audit",
            custody_id="synthetic-custody.audit.v1",
            occurred_at=timestamp(92),
            contract_path=setup["contractPath"],
        )
        base.write_input(
            audit_input,
            "audit-summary.json",
            {
                "descriptorHashes": descriptor_hashes,
                "transitionHashes": transition_hashes,
                "roleReceiptHashes": sorted(
                    {
                        receipt["receiptHash"]
                        for receipt in role_receipts
                    }
                ),
                "leakageScanHashes":
                    leakage_scan_hashes,
                "scorerProjectionHash":
                    scorer_projection["recordHash"],
                "promoterProjectionHash":
                    promoter_projection["recordHash"],
            },
            "audit_store",
        )
        audit_process = run_custody_worker(
            root=root,
            stage=audit_stage,
            role="audit_store",
            repository=repository,
            python_root=python_root,
            node_executable=node_executable,
            materialization=(
                materialization_base / "normal"
            ),
            vault_private=False,
        )
        require_success(audit_process, audit_stage)
        final_audit = read_json(
            root
            / "state"
            / audit_stage
            / "final-audit.json"
        )
        audit_receipt = stage_receipt(
            root, audit_stage
        )
        role_receipts.append(audit_receipt)

        evidence = {
            "schemaVersion": 1,
            "recordType":
                "synthetic_custody_os_boundary_evidence",
            "isolationClass":
                "os_enforced_subordinate_uids",
            "ephemeralStorage": {
                "filesystemType": tmpfs_type,
                "pathRetained": False,
                "plaintextNamesRetained": False,
            },
            "roleUids": base.ROLE_UIDS,
            "hostRoleUids": {
                role: base.outer_uid_for(uid)
                for role, uid in base.ROLE_UIDS.items()
            },
            "keyOwners": {
                role: os.stat(
                    root
                    / "keys"
                    / role
                    / "private.pem",
                    follow_symlinks=False,
                ).st_uid
                for role in base.ROLE_UIDS
            },
            "publicPrincipals": setup["principals"],
            "contract": setup["contract"],
            "binding": binding,
            "reviewerBoundary": {
                "inputFiles": sorted(
                    file.name
                    for file in reviewer_input.iterdir()
                ),
                "custodyDescriptorPresent": False,
                "ciphertextMetadataPresent": False,
                "authorIdentityPresent": False,
                "rawTaskHandlePresent": False,
                "privateKeyPresent": False,
            },
            "scenarios": scenarios,
            "crashCases": crash_cases,
            "adversarialCases": adversarial_cases,
            "scorerProjection": scorer_projection,
            "promoterProjection": promoter_projection,
            "finalAudit": final_audit,
            "roleReceipts": role_receipts,
            "bodyAbsence": {
                "taskBodyPresent": False,
                "verifierLogicPresent": False,
                "labelPresent": False,
                "taskPathPresent": False,
                "expectedAnswerPresent": False,
                "modelPromptPresent": False,
                "gateMaterialPresent": False,
                "finalMaterialPresent": False,
                "researchSemanticsPresent": False,
            },
            "providerUsed": False,
            "researchEvidenceAuthorized": False,
            "promotionAuthorized": False,
            "repositoryPushPerformed": False,
        }
        serialized = canonical(evidence)
        if (
            task_handle.encode() in serialized
            or b"BEGIN PRIVATE KEY" in serialized
            or b'"ciphertext":' in serialized
            or b'"authenticationTag":' in serialized
        ):
            raise PermissionError(
                "synthetic custody evidence retained private bytes"
            )
        evidence["evidenceHash"] = digest(evidence)
        print(canonical(evidence).decode("utf-8"))
        return 0
    finally:
        shutil.rmtree(
            materialization_base,
            ignore_errors=True,
        )
        base.restore_ownership(root)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(
            f"synthetic custody OS gate failed: {error}",
            file=sys.stderr,
        )
        raise SystemExit(2)
