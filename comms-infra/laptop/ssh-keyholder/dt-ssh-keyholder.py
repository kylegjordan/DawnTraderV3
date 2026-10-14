#!/usr/bin/env python3
"""Command-line entry point for the DawnTrader Windows SSH key-holder."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from ssh_keyholder import Config, Keyholder, KeyholderError, WindowsBackend


def default_config_path() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        raise KeyholderError("LOCALAPPDATA is not defined")
    return Path(local_app_data) / "DawnTrader" / "ssh-keyholder" / "config.json"


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--config", type=Path, default=None)
    subcommands = result.add_subparsers(dest="command", required=True)
    subcommands.add_parser("unlock")
    subcommands.add_parser("lock")
    subcommands.add_parser("assert")
    execute = subcommands.add_parser("exec")
    execute.add_argument("--client", choices=("ssh", "scp", "sftp"), required=True)
    execute.add_argument("arguments", nargs=argparse.REMAINDER)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        config = Config.load(args.config or default_config_path())
        keyholder = Keyholder(config, WindowsBackend(config))
        if args.command == "unlock":
            print(json.dumps(keyholder.unlock(), sort_keys=True))
            return 0
        if args.command == "lock":
            keyholder.lock()
            print("LOCKED")
            return 0
        if args.command == "assert":
            print(json.dumps(keyholder.assert_unlocked(), sort_keys=True))
            return 0
        forwarded = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
        return keyholder.execute(args.client, forwarded)
    except KeyholderError as exc:
        print(f"REFUSED: {exc}", file=os.sys.stderr)
        return 78


if __name__ == "__main__":
    raise SystemExit(main())
