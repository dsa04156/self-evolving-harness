#!/usr/bin/env python3
"""Adversarial role probe executed after dropping to a mapped subordinate UID."""

from __future__ import annotations

import argparse
import base64
import ctypes
import errno
import json
import os
import socket
import stat
import subprocess
import tempfile


PTRACE_ATTACH = 16


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", required=True)
    parser.add_argument("--own-key", required=True)
    parser.add_argument("--challenge", required=True)
    parser.add_argument("--forbidden-read", action="append", default=[])
    parser.add_argument("--forbidden-write", action="append", default=[])
    parser.add_argument("--target-pid", action="append", type=int, default=[])
    return parser.parse_args()


def expect_read_denied(path: str) -> None:
    try:
        with open(path, "rb") as forbidden:
            forbidden.read(1)
    except PermissionError:
        return
    raise PermissionError(f"unauthorized read unexpectedly succeeded: {path}")


def expect_write_denied(path: str) -> None:
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
    except PermissionError:
        return
    else:
        os.close(descriptor)
    raise PermissionError(f"unauthorized write unexpectedly succeeded: {path}")


def expect_signal_denied(pid: int) -> None:
    try:
        os.kill(pid, 0)
    except (PermissionError, ProcessLookupError):
        return
    raise PermissionError(f"cross-principal signal check unexpectedly succeeded: {pid}")


def expect_ptrace_denied(pid: int) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    result = libc.ptrace(PTRACE_ATTACH, pid, None, None)
    observed_errno = ctypes.get_errno()
    if result == -1 and observed_errno in {errno.EPERM, errno.EACCES, errno.ESRCH}:
        return
    if result == 0:
        os.kill(pid, 18)
    raise PermissionError(
        f"cross-principal ptrace unexpectedly succeeded or was ambiguous: "
        f"pid={pid} result={result} errno={observed_errno}"
    )


def expect_network_denied() -> str:
    connection = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    connection.settimeout(0.5)
    try:
        connection.connect(("1.1.1.1", 53))
    except OSError as error:
        return f"{error.errno}:{error.strerror}"
    finally:
        connection.close()
    raise PermissionError("direct IP network access unexpectedly succeeded")


def sign_challenge(private_key: str, challenge: str) -> str:
    with tempfile.TemporaryDirectory(dir="/state") as temporary:
        challenge_path = os.path.join(temporary, "challenge")
        with open(challenge_path, "wb") as challenge_file:
            challenge_file.write(challenge.encode("utf-8"))
        os.chmod(challenge_path, 0o600)
        completed = subprocess.run(
            [
                "/usr/bin/openssl",
                "pkeyutl",
                "-sign",
                "-inkey",
                private_key,
                "-rawin",
                "-in",
                challenge_path,
            ],
            capture_output=True,
            check=False,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
        )
    if completed.returncode != 0:
        raise ValueError(
            "role challenge signing failed: "
            + completed.stderr.decode("utf-8", errors="replace")[:1000]
        )
    return base64.urlsafe_b64encode(completed.stdout).decode("ascii").rstrip("=")


def process_status_value(label: str) -> str:
    with open("/proc/self/status", encoding="utf-8") as status:
        for line in status:
            if line.startswith(label + ":"):
                return line.split(":", 1)[1].strip()
    raise ValueError(f"process status has no {label}")


def main() -> int:
    arguments = parse_arguments()
    metadata = os.stat(arguments.own_key, follow_symlinks=False)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != os.geteuid()
        or stat.S_IMODE(metadata.st_mode) & 0o077
    ):
        raise PermissionError("own role key ownership or mode is invalid")
    with open(arguments.own_key, "rb") as own_key:
        if not own_key.read(32):
            raise ValueError("own role key is empty")
    for path in arguments.forbidden_read:
        expect_read_denied(path)
    for path in arguments.forbidden_write:
        expect_write_denied(path)
    for pid in arguments.target_pid:
        expect_signal_denied(pid)
        expect_ptrace_denied(pid)
    result = {
        "schemaVersion": 1,
        "role": arguments.role,
        "uid": os.geteuid(),
        "gid": os.getegid(),
        "ownKeyReadable": True,
        "challenge": arguments.challenge,
        "challengeSignature": sign_challenge(
            arguments.own_key, arguments.challenge
        ),
        "effectiveCapabilities": process_status_value("CapEff"),
        "noNewPrivileges": process_status_value("NoNewPrivs"),
        "forbiddenReadsDenied": len(arguments.forbidden_read),
        "forbiddenWritesDenied": len(arguments.forbidden_write),
        "signalsDenied": len(arguments.target_pid),
        "ptraceDenied": len(arguments.target_pid),
        "networkDenied": expect_network_denied(),
    }
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
