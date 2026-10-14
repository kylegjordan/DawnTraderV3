#!/usr/bin/env python3
"""Verify the bounded 39-object laptop caller census and guarded selection."""

from __future__ import annotations

import argparse
import ast
import hashlib
import io
import json
import re
import subprocess
import tokenize
import xml.etree.ElementTree as ET
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
INSTALLED_SOURCES = {
    Path.home() / ".claude" / "dt-media-get": ROOTS[-1] / r"comms-infra\laptop\dt-media-get",
    Path.home() / ".claude" / "dt-media-post": ROOTS[-1] / r"comms-infra\laptop\dt-media-post",
    Path.home() / ".claude" / "cc-wake-filter.py": ROOTS[-1] / r"comms-infra\laptop\cc-wake-filter.py",
    Path.home() / ".claude" / "cc-wake-follow.py": ROOTS[-1] / r"comms-infra\laptop\cc-wake-follow.py",
}
TASKS = {
    r"\codex-channel-mirror": {
        "command": r"C:\Python313\pythonw.exe",
        "argument_fragment": r"C:\DawnTraderV3-infra\comms-infra\codex-channel-mirror.py",
        "working_directory": "",
    },
    r"\codex-discord-outbox": {
        "command": r"C:\Python313\pythonw.exe",
        "argument_fragment": r"C:\DawnTraderV3-infra\comms-infra\codex-discord-outbox.py",
        "working_directory": "",
    },
    r"\DawnTrader Crew Status": {
        "command": r"C:\Python313\pythonw.exe",
        "argument_fragment": r"C:\DawnTraderV3-infra\comms-infra\laptop\crew-status.py",
        "working_directory": r"C:\Users\kyleg\.claude\crew-status-work",
    },
}
KEYHOLDER = r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py"
WINDOWS_CLIENTS = {
    "ssh": r"C:\Windows\System32\OpenSSH\ssh.exe",
    "scp": r"C:\Windows\System32\OpenSSH\scp.exe",
    "sftp": r"C:\Windows\System32\OpenSSH\sftp.exe",
}
EVIDENCE_NAMES = {str(path) for path in SELECTORS} | {"direct:powershell", "direct:git-bash"}
REQUIRED_CLIENTS = {
    str(SELECTORS[0]): {"ssh"},
    str(SELECTORS[1]): {"ssh"},
    str(SELECTORS[2]): {"ssh"},
    str(SELECTORS[3]): {"ssh", "scp"},
    str(SELECTORS[4]): {"ssh"},
    str(SELECTORS[5]): {"ssh"},
    str(SELECTORS[6]): {"scp"},
    str(SELECTORS[7]): {"ssh", "scp"},
    "direct:powershell": {"ssh"},
    "direct:git-bash": {"ssh"},
}


def normalized_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def uncommented_python(text: str) -> str:
    tokens = tokenize.generate_tokens(io.StringIO(text).readline)
    kept = [token for token in tokens if token.type != tokenize.COMMENT]
    return tokenize.untokenize(kept)


def python_has_guard_call(text: str) -> bool:
    try:
        tree = ast.parse(uncommented_python(text))
    except (SyntaxError, tokenize.TokenError):
        return False
    keyholder_names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            value = node.value
            constants = [item.value for item in ast.walk(value) if isinstance(item, ast.Constant) and isinstance(item.value, str)] if value else []
            if any("dt-ssh-keyholder.py" in item.replace("/", "\\").casefold() for item in constants):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                keyholder_names.update(target.id for target in targets if isinstance(target, ast.Name))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        values = [value.value for value in ast.walk(node) if isinstance(value, ast.Constant) and isinstance(value.value, str)]
        names = {value.id for value in ast.walk(node) if isinstance(value, ast.Name)}
        joined = " ".join(values).replace("/", "\\").casefold()
        if ("dt-ssh-keyholder.py" in joined or names & keyholder_names) and "exec" in values and "--client" in values:
            return True
    return False


def uncommented_non_python(text: str, suffix: str) -> str:
    if suffix in {".js", ".mjs", ".ts", ".tsx"}:
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        return re.sub(r"(?m)^\s*//.*$", "", text)
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith(("#", "<!--")))


def has_guarded_invocation(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix == ".py":
        return python_has_guard_call(text)
    active = uncommented_non_python(text, path.suffix).replace("/", "\\").casefold()
    keyholder = KEYHOLDER.casefold()
    if path.suffix in {".js", ".mjs", ".ts", ".tsx"}:
        assignments = re.findall(r"\b(?:const|let|var)\s+(\w+)\s*=\s*['\"]([^'\"]*dt-ssh-keyholder\.py)['\"]", active)
        return any(
            re.search(rf"\b(?:spawn|spawnsync|execfile)\w*\s*\(\s*{re.escape(name)}\b.*\bexec\b.*--client.*\b(?:ssh|scp|sftp)\b", active, re.S)
            for name, value in assignments if value == keyholder
        )
    return re.search(
        re.escape(keyholder) + r'''["']?\s+exec\s+--client\s+(ssh|scp|sftp)\b''',
        active,
        re.S,
    ) is not None


def validate_task_xml(xml_text: str, expected: dict[str, str]) -> list[str]:
    failures: list[str] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        return [f"task XML is invalid: {exc}"]
    namespace = {"t": "http://schemas.microsoft.com/windows/2004/02/mit/task"}
    exec_nodes = root.findall(".//t:Actions/t:Exec", namespace)
    if len(exec_nodes) != 1:
        return [f"task must have exactly one Exec action, observed {len(exec_nodes)}"]
    command = exec_nodes[0].findtext("t:Command", default="", namespaces=namespace)
    arguments = exec_nodes[0].findtext("t:Arguments", default="", namespaces=namespace)
    working = exec_nodes[0].findtext("t:WorkingDirectory", default="", namespaces=namespace)
    command = command.strip().strip('"')
    if command.casefold() != expected["command"].casefold():
        failures.append(f"task command differs: {command}")
    if expected["argument_fragment"].casefold() not in arguments.casefold():
        failures.append(f"task arguments do not select expected guarded source: {arguments}")
    if working.casefold() != expected["working_directory"].casefold():
        failures.append(f"task working directory differs: {working}")
    return failures


def validate_evidence(path: Path, expected_fingerprint: str) -> list[str]:
    failures: list[str] = []
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"cannot read real-entry evidence: {exc}"]
    if not isinstance(rows, list):
        return ["real-entry evidence must be an array"]
    non_objects = sum(not isinstance(row, dict) for row in rows)
    if non_objects:
        failures.append(f"evidence has {non_objects} non-object row(s)")
    names = [row.get("name") for row in rows if isinstance(row, dict)]
    duplicates = sorted({name for name in names if names.count(name) > 1 and isinstance(name, str)})
    if duplicates:
        failures.append("evidence has duplicate rows: " + ", ".join(duplicates))
    if len(rows) != len(EVIDENCE_NAMES):
        failures.append(f"evidence row count differs: expected {len(EVIDENCE_NAMES)}, observed {len(rows)}")
    by_name = {row.get("name"): row for row in rows if isinstance(row, dict)}
    missing = sorted(EVIDENCE_NAMES - by_name.keys())
    extra = sorted(by_name.keys() - EVIDENCE_NAMES)
    if missing: failures.append("evidence is missing: " + ", ".join(missing))
    if extra: failures.append("evidence has unexpected rows: " + ", ".join(extra))
    for name in sorted(EVIDENCE_NAMES & by_name.keys()):
        row = by_name[name]
        if row.get("result") != "success": failures.append(f"{name}: real entry did not succeed")
        if row.get("serverFingerprint") != expected_fingerprint: failures.append(f"{name}: server fingerprint differs")
        clients = row.get("spawnedClients")
        if not isinstance(clients, list):
            failures.append(f"{name}: spawnedClients is not an array")
        else:
            observed_names = {client_name for client_name, path_value in WINDOWS_CLIENTS.items() if path_value in clients}
            if any(path_value not in WINDOWS_CLIENTS.values() for path_value in clients):
                failures.append(f"{name}: a spawned client is not Windows OpenSSH")
            if observed_names != REQUIRED_CLIENTS[name]:
                failures.append(f"{name}: spawned client set differs: {sorted(observed_names)}")
        if row.get("negativeSpawnCount") != 0: failures.append(f"{name}: locked negative gate spawned an SSH-family client")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory-only", action="store_true")
    parser.add_argument("--expected-fingerprint")
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    if not args.inventory_only and (not args.expected_fingerprint or args.evidence is None):
        parser.error("guard verification requires --expected-fingerprint and --evidence")

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
            if has_guarded_invocation(path):
                guarded += 1
            elif not args.inventory_only:
                failures.append(f"selector has no executable key-holder call: {path}")
        hashes[str(suffix)] = values
        if len(values) != len(ROOTS) or len(set(values)) != 1:
            failures.append(f"selector population/hash differs across clone roots: {suffix}")

    installed_present = 0
    for installed, source in INSTALLED_SOURCES.items():
        if not installed.is_file():
            failures.append(f"missing installed runtime file: {installed}")
            continue
        installed_present += 1
        if not source.is_file():
            failures.append(f"missing installed-file source: {source}")
            continue
        if normalized_hash(installed) != normalized_hash(source):
            failures.append(f"installed runtime differs from source: {installed}")
        if installed.name in {"dt-media-get", "dt-media-post"} and not args.inventory_only and not has_guarded_invocation(installed):
            failures.append(f"installed selector has no executable key-holder call: {installed}")

    tasks_present = 0
    for task, expected in TASKS.items():
        result = subprocess.run(
            [r"C:\Windows\System32\schtasks.exe", "/Query", "/TN", task, "/XML"],
            capture_output=True, text=True, check=False, encoding="utf-8", errors="replace",
        )
        if result.returncode != 0:
            failures.append(f"missing scheduled task: {task}")
            continue
        tasks_present += 1
        failures.extend(f"{task}: {failure}" for failure in validate_task_xml(result.stdout, expected))

    if not args.inventory_only:
        failures.extend(validate_evidence(args.evidence, args.expected_fingerprint))

    report = {
        "repoSelectors": len(ROOTS) * len(SELECTORS),
        "guardedRepoSelectors": guarded,
        "installedRuntimeFiles": installed_present,
        "scheduledTasks": tasks_present,
        "directCommandClasses": 2 if not args.inventory_only and not any("direct:" in failure for failure in failures) else 0,
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
