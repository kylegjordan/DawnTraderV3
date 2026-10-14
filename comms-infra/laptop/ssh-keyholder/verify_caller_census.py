#!/usr/bin/env python3
"""Verify the bounded 39-object laptop caller census and guarded selection."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


ROOTS = [
    Path(r"C:\DawnTraderV3-old"),
    Path(r"C:\DawnTraderV3-new"),
    Path(r"C:\DawnTraderV3-analyst"),
    Path(r"C:\DawnTraderV3-infra"),
]
SELECTORS = [
    Path(r".claude\memory\MEMORY.md"),
    Path(r".claude\hooks\inject-due-alerts.mjs"),
    Path(r"comms-infra\codex-channel-mirror.py"),
    Path(r"comms-infra\codex-discord-outbox.py"),
    Path(r"comms-infra\laptop\crew-status.py"),
    Path(r"comms-infra\tools\verify-agent-artifacts.py"),
    Path(r"comms-infra\laptop\dt-media-get"),
    Path(r"comms-infra\laptop\dt-media-post"),
]
INSTALLED = [
    Path.home() / ".claude" / "dt-media-get",
    Path.home() / ".claude" / "dt-media-post",
    Path.home() / ".claude" / "cc-wake-filter.py",
    Path.home() / ".claude" / "cc-wake-follow.py",
]
TASKS = [r"\codex-channel-mirror", r"\codex-discord-outbox", r"\DawnTrader Crew Status"]
GUARD_NAMES = ("dt-ssh-keyholder.py", "ssh-keyholder")


def normalized_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory-only", action="store_true")
    args = parser.parse_args()
    failures: list[str] = []
    hashes: dict[str, list[str]] = {}
    guarded = 0

    for suffix in SELECTORS:
        values: list[str] = []
        for root in ROOTS:
            path = root / suffix
            if not path.is_file():
                failures.append(f"missing selector: {path}")
                continue
            values.append(normalized_hash(path))
            text = path.read_text(encoding="utf-8", errors="replace")
            if any(name in text for name in GUARD_NAMES):
                guarded += 1
            elif not args.inventory_only:
                failures.append(f"selector does not use key-holder: {path}")
        hashes[str(suffix)] = values
        if len(set(values)) > 1:
            failures.append(f"selector differs across clone roots: {suffix}")

    installed_present = sum(path.is_file() for path in INSTALLED)
    for path in INSTALLED:
        if not path.is_file():
            failures.append(f"missing installed runtime file: {path}")

    tasks_present = 0
    for task in TASKS:
        result = subprocess.run(
            [r"C:\Windows\System32\schtasks.exe", "/Query", "/TN", task, "/XML"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            tasks_present += 1
        else:
            failures.append(f"missing scheduled task: {task}")

    report = {
        "repoSelectors": len(ROOTS) * len(SELECTORS),
        "guardedRepoSelectors": guarded,
        "installedRuntimeFiles": installed_present,
        "scheduledTasks": tasks_present,
        "governedConcretePopulation": len(ROOTS) * len(SELECTORS) + installed_present + tasks_present,
        "normalizedHashes": hashes,
        "failures": failures,
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    if report["governedConcretePopulation"] != 39:
        return 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
