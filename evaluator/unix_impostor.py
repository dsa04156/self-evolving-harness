#!/usr/bin/env python3
"""One-shot Unix server used only to prove client-side peer-credential rejection."""

from __future__ import annotations

import argparse
import os
import socket


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    arguments = parser.parse_args()
    try:
        os.unlink(arguments.socket)
    except FileNotFoundError:
        pass
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        server.bind(arguments.socket)
        os.chmod(arguments.socket, 0o666)
        server.listen(1)
        connection, _address = server.accept()
        connection.close()
        return 0
    finally:
        server.close()
        try:
            os.unlink(arguments.socket)
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
