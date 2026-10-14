#!/usr/bin/env python3
"""Verify the bounded 39-object laptop caller census and guarded selection."""

from __future__ import annotations

import argparse
import ast
import datetime as dt
import hashlib
import io
import json
import re
import shlex
import subprocess
import tokenize
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path, PureWindowsPath


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
CAPTURE_BINDINGS = Path(__file__).with_name("caller_capture_bindings.json")
EXPECTED_SOURCES = {name: name for name in EVIDENCE_NAMES if not name.startswith("direct:")}


def normalized_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def uncommented_python(text: str) -> str:
    tokens = tokenize.generate_tokens(io.StringIO(text).readline)
    kept = [token for token in tokens if token.type != tokenize.COMMENT]
    return tokenize.untokenize(kept)


def _python_static_value(node: ast.AST, assignments: dict[str, object]) -> object | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Name):
        return assignments.get(node.id)
    if isinstance(node, (ast.List, ast.Tuple)):
        values = [_python_static_value(item, assignments) for item in node.elts]
        return values if all(isinstance(item, str) for item in values) else None
    return None


PYTHON_SUBPROCESS_LAUNCHERS = {"run", "Popen", "call", "check_call", "check_output"}
PYTHON_OS_LAUNCHERS = {
    "system", "popen",
    "execl", "execle", "execlp", "execlpe", "execv", "execve", "execvp", "execvpe",
    "spawnl", "spawnle", "spawnlp", "spawnlpe", "spawnv", "spawnve", "spawnvp", "spawnvpe",
}


def _python_launcher_name(
    node: ast.AST,
    subprocess_modules: set[str],
    os_modules: set[str],
    imported_launchers: dict[str, str],
) -> str | None:
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        if node.value.id in subprocess_modules and node.attr in PYTHON_SUBPROCESS_LAUNCHERS:
            return f"subprocess.{node.attr}"
        if node.value.id in os_modules and node.attr in PYTHON_OS_LAUNCHERS:
            return f"os.{node.attr}"
    if isinstance(node, ast.Name):
        return imported_launchers.get(node.id)
    return None


def python_process_commands(text: str) -> list[list[str]]:
    """Return only statically-provable argv vectors passed to recognized launch APIs."""
    try:
        tree = ast.parse(uncommented_python(text))
    except (SyntaxError, tokenize.TokenError):
        return []
    subprocess_modules: set[str] = set()
    os_modules: set[str] = set()
    imported_launchers: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "subprocess":
                    subprocess_modules.add(alias.asname or alias.name)
                elif alias.name == "os":
                    os_modules.add(alias.asname or alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module in {"subprocess", "os"}:
            for alias in node.names:
                if alias.name == "*":
                    if node.module == "subprocess":
                        imported_launchers.update({name: f"subprocess.{name}" for name in PYTHON_SUBPROCESS_LAUNCHERS})
                    else:
                        imported_launchers.update({name: f"os.{name}" for name in PYTHON_OS_LAUNCHERS})
                    continue
                local_name = alias.asname or alias.name
                if node.module == "subprocess" and alias.name in PYTHON_SUBPROCESS_LAUNCHERS:
                    imported_launchers[local_name] = f"subprocess.{alias.name}"
                elif node.module == "os" and alias.name in PYTHON_OS_LAUNCHERS:
                    imported_launchers[local_name] = f"os.{alias.name}"
    assignments: dict[str, object] = {}
    rebound_launchers = False
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            value = _python_static_value(node.value, assignments) if node.value else None
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    if target.id in subprocess_modules | os_modules | imported_launchers.keys():
                        rebound_launchers = True
                    launcher = _python_launcher_name(
                        node.value, subprocess_modules, os_modules, imported_launchers
                    ) if node.value is not None else None
                    if launcher is not None:
                        imported_launchers[target.id] = launcher
                    if value is not None:
                        assignments[target.id] = value
    commands: list[list[str]] = [["<unresolved-launch>"]] if rebound_launchers else []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or _python_launcher_name(
            node.func, subprocess_modules, os_modules, imported_launchers
        ) is None:
            continue
        command_node = node.args[0] if node.args else next(
            (item.value for item in node.keywords if item.arg == "args"), None
        )
        if command_node is None:
            commands.append(["<unresolved-launch>"])
            continue
        value = _python_static_value(command_node, assignments)
        if isinstance(value, list) and all(isinstance(item, str) for item in value):
            commands.append(value)
        else:
            commands.append(["<unresolved-launch>"])
    return commands


def _program_name(value: str) -> str:
    return value.replace("\\", "/").rsplit("/", 1)[-1].casefold()


def _is_keyholder(value: str) -> bool:
    return value.replace("/", "\\").casefold() == KEYHOLDER.casefold()


def _is_guard_command(command: list[str]) -> bool:
    return (
        len(command) >= 6
        and _is_keyholder(command[0])
        and command[1:3] == ["exec", "--client"]
        and command[3] in WINDOWS_CLIENTS
        and command[4] == "--"
    )


def _is_direct_ssh_command(command: list[str]) -> bool:
    return bool(command) and _program_name(command[0]) in {"ssh", "ssh.exe", "scp", "scp.exe", "sftp", "sftp.exe"}


def python_has_guard_call(text: str) -> bool:
    commands = python_process_commands(text)
    return not any(command == ["<unresolved-launch>"] for command in commands) and any(_is_guard_command(command) for command in commands) and not any(
        _is_direct_ssh_command(command) for command in commands
    )


def uncommented_non_python(text: str, suffix: str) -> str:
    if suffix in {".js", ".mjs", ".ts", ".tsx"}:
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        return re.sub(r"(?m)^\s*//.*$", "", text)
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith(("#", "<!--")))


def shell_process_commands(text: str) -> list[list[str]]:
    assignments: dict[str, str] = {}
    commands: list[list[str]] = []
    continued = text.replace("\\\r\n", " ").replace("\\\n", " ")
    marked: list[str] = []
    quote: str | None = None
    comment = False
    index = 0
    while index < len(continued):
        character = continued[index]
        marked.append(character)
        if comment:
            if character == "\n":
                comment = False
                marked.append(";")
        elif quote:
            if character == "\\" and quote == '"' and index + 1 < len(continued):
                index += 1
                marked.append(continued[index])
            elif character == quote:
                quote = None
        elif character == "#":
            comment = True
        elif character in {"'", '"'}:
            quote = character
        elif character == "\\" and index + 1 < len(continued):
            index += 1
            marked.append(continued[index])
        elif character == "\n":
            marked.append(";")
        index += 1
    lexer = shlex.shlex("".join(marked), posix=True, punctuation_chars=";&|")
    lexer.whitespace_split = True
    lexer.commenters = "#"
    tokens = list(lexer) + [";"]
    segment: list[str] = []
    for token in tokens:
        if token in {";", "&&", "||", "|", "&"}:
            while segment and segment[0] in {"if", "then", "elif", "while", "until", "do", "!", "{"}:
                segment.pop(0)
            while segment and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", segment[0]):
                name, value = segment.pop(0).split("=", 1)
                assignments[name] = value
            while segment and segment[0] in {"command", "exec", "env", "nohup"}:
                segment.pop(0)
            if segment:
                resolved = [assignments.get(item[2:-1], item) if item.startswith("${") and item.endswith("}") else assignments.get(item[1:], item) if item.startswith("$") else item for item in segment]
                commands.append(["<unresolved-launch>"] if resolved[0].startswith("$") else resolved)
            segment = []
        else:
            segment.append(token)
    return commands


def javascript_process_commands(text: str) -> list[list[str]]:
    active = uncommented_non_python(text, ".js")
    assignments = dict(re.findall(r"\b(?:const|let|var)\s+(\w+)\s*=\s*['\"]([^'\"]+)['\"]", active))
    imported_functions: set[str] = set()
    for names in re.findall(r"\bimport\s*\{([^}]+)\}\s*from\s*['\"](?:node:)?child_process['\"]", active):
        imported_functions.update(part.strip().split(" as ")[-1] for part in names.split(","))
    imported_namespaces = set(re.findall(
        r"\bimport\s*\*\s*as\s*(\w+)\s*from\s*['\"](?:node:)?child_process['\"]",
        active,
    ))
    commands: list[list[str]] = []
    pattern = re.compile(
        r"\b((?:\w+\.)?(?:spawn|spawnSync|execFile|execFileSync))\s*\(\s*([^,]+?)\s*,\s*\[([^\]]*)\]",
        re.S,
    )
    for match in pattern.finditer(active):
        launcher = match.group(1)
        if "." in launcher:
            namespace, function = launcher.split(".", 1)
            if namespace not in imported_namespaces:
                continue
        elif launcher not in imported_functions:
            continue
        executable = match.group(2).strip()
        if executable in assignments:
            executable = assignments[executable]
        elif len(executable) >= 2 and executable[0] == executable[-1] and executable[0] in "'\"":
            executable = executable[1:-1]
        else:
            continue
        arguments = re.findall(r"['\"]([^'\"]*)['\"]", match.group(3))
        commands.append([executable, *arguments])
    recognized_call_count = 0
    for launcher in re.findall(r"\b((?:\w+\.)?(?:spawn|spawnSync|execFile|execFileSync))\s*\(", active):
        if "." in launcher and launcher.split(".", 1)[0] in imported_namespaces:
            recognized_call_count += 1
        elif launcher in imported_functions:
            recognized_call_count += 1
    commands.extend([["<unresolved-launch>"]] * max(0, recognized_call_count - len(commands)))
    return commands


def has_guarded_invocation(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix == ".py":
        return python_has_guard_call(text)
    if path.suffix in {".js", ".mjs", ".ts", ".tsx"}:
        commands = javascript_process_commands(text)
    else:
        commands = shell_process_commands(text)
    return not any(command == ["<unresolved-launch>"] for command in commands) and any(_is_guard_command(command) for command in commands) and not any(
        _is_direct_ssh_command(command) for command in commands
    )


def windows_command_line_args(command_line: str) -> list[str]:
    """Parse the Windows CommandLineToArgvW quoting rules without invoking a shell."""
    arguments: list[str] = []
    index = 0
    while index < len(command_line):
        while index < len(command_line) and command_line[index] in " \t":
            index += 1
        if index >= len(command_line):
            break
        argument: list[str] = []
        quoted = False
        while index < len(command_line):
            backslashes = 0
            while index < len(command_line) and command_line[index] == "\\":
                backslashes += 1
                index += 1
            if index < len(command_line) and command_line[index] == '"':
                argument.extend("\\" for _ in range(backslashes // 2))
                if backslashes % 2:
                    argument.append('"')
                else:
                    quoted = not quoted
                index += 1
                continue
            argument.extend("\\" for _ in range(backslashes))
            if index >= len(command_line) or (not quoted and command_line[index] in " \t"):
                break
            argument.append(command_line[index])
            index += 1
        if quoted:
            raise ValueError("unclosed quote in task arguments")
        arguments.append("".join(argument))
    return arguments


def validate_task_xml(xml_text: str, expected: dict[str, str]) -> list[str]:
    failures: list[str] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        return [f"task XML is invalid: {exc}"]
    namespace = {"t": "http://schemas.microsoft.com/windows/2004/02/mit/task"}
    action_nodes = root.findall(".//t:Actions/*", namespace)
    exec_nodes = root.findall(".//t:Actions/t:Exec", namespace)
    if len(action_nodes) != 1 or len(exec_nodes) != 1:
        return [
            "task must have exactly one action and it must be Exec: "
            f"observed {len(action_nodes)} action(s), {len(exec_nodes)} Exec"
        ]
    command = exec_nodes[0].findtext("t:Command", default="", namespaces=namespace)
    arguments = exec_nodes[0].findtext("t:Arguments", default="", namespaces=namespace)
    working = exec_nodes[0].findtext("t:WorkingDirectory", default="", namespaces=namespace)
    command = command.strip().strip('"')
    if command.casefold() != expected["command"].casefold():
        failures.append(f"task command differs: {command}")
    try:
        argument_vector = windows_command_line_args(arguments)
    except ValueError as exc:
        failures.append(f"task arguments are invalid: {exc}")
        argument_vector = []
    expected_source = expected["argument_fragment"].casefold()
    if not argument_vector or argument_vector[0].casefold() != expected_source:
        failures.append(f"task first argument is not the exact guarded source: {arguments}")
    executable_suffixes = (
        ".py", ".pyw", ".js", ".mjs", ".cmd", ".bat", ".ps1",
        ".exe", ".com", ".vbs", ".vbe", ".wsf", ".wsh", ".jar",
    )
    if any(value.casefold().endswith(executable_suffixes) for value in argument_vector[1:]):
        failures.append(f"task arguments contain an extra executable decoy: {arguments}")
    if working.casefold() != expected["working_directory"].casefold():
        failures.append(f"task working directory differs: {working}")
    return failures


def _parse_utc(value: object) -> dt.datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo is not None else None


def _read_json_lines(path: Path) -> tuple[list[dict[str, object]], list[str]]:
    rows: list[dict[str, object]] = []
    failures: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return [], [f"cannot read raw artifact {path.name}: {exc}"]
    for number, line in enumerate(lines, 1):
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            failures.append(f"{path.name}:{number}: invalid JSON: {exc}")
            continue
        if not isinstance(row, dict):
            failures.append(f"{path.name}:{number}: row is not an object")
            continue
        rows.append(row)
    return rows, failures


def _bounded_artifact(bundle: Path, name: object) -> Path | None:
    if not isinstance(name, str) or not name or Path(name).name != name:
        return None
    candidate = bundle.parent / name
    try:
        candidate.resolve().relative_to(bundle.parent.resolve())
    except (OSError, ValueError):
        return None
    return candidate


def validate_capture_bindings(path: Path, source_root: Path = ROOTS[-1]) -> list[str]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"cannot read canonical caller bindings: {exc}"]
    if not isinstance(document, dict) or document.get("schema") != "dt-caller-bindings-v1":
        return ["canonical caller binding schema differs"]
    failures: list[str] = []
    if document.get("active") is not True:
        failures.append("canonical caller bindings are not active")
    entries = document.get("entries")
    if not isinstance(entries, list):
        return failures + ["canonical caller binding entries are not an array"]
    names = [entry.get("name") for entry in entries if isinstance(entry, dict)]
    if (
        len(entries) != len(EVIDENCE_NAMES)
        or any(not isinstance(name, str) for name in names)
        or set(name for name in names if isinstance(name, str)) != EVIDENCE_NAMES
        or len(set(name for name in names if isinstance(name, str))) != len(names)
    ):
        failures.append("canonical caller bindings do not name the exact ten-entry population")
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("name") not in EVIDENCE_NAMES:
            continue
        name = str(entry["name"])
        expected_source = EXPECTED_SOURCES.get(name)
        if entry.get("sourcePath") != expected_source:
            failures.append(f"{name}: canonical source path differs")
        if expected_source is None and entry.get("sourceSha256") is not None:
            failures.append(f"{name}: direct entry must not claim a source hash")
        if expected_source is not None and not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("sourceSha256", ""))):
            failures.append(f"{name}: canonical source hash is absent")
        elif expected_source is not None:
            source = source_root / expected_source
            try:
                observed_source_hash = normalized_hash(source)
            except OSError as exc:
                failures.append(f"{name}: cannot read bound source: {exc}")
            else:
                if entry.get("sourceSha256") != observed_source_hash:
                    failures.append(f"{name}: canonical source hash differs from reviewed source")
        for prefix in ("positive", "negative"):
            command = entry.get(f"{prefix}Command")
            arguments = entry.get(f"{prefix}Arguments")
            if not isinstance(command, str) or not PureWindowsPath(command).is_absolute():
                failures.append(f"{name}: {prefix} command is not an absolute reviewed executable")
            if not isinstance(arguments, list) or any(not isinstance(item, str) for item in arguments):
                failures.append(f"{name}: {prefix} arguments are not a reviewed string vector")
    return failures


def validate_evidence(
    path: Path,
    expected_fingerprint: str,
    bindings_path: Path = CAPTURE_BINDINGS,
    source_root: Path = ROOTS[-1],
) -> list[str]:
    failures: list[str] = []
    try:
        bundle = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"cannot read real-entry evidence: {exc}"]
    if not isinstance(bundle, dict) or bundle.get("schema") != "dt-caller-capture-v1":
        return ["real-entry evidence must be a dt-caller-capture-v1 bundle"]
    try:
        capture_id = str(uuid.UUID(str(bundle.get("captureId"))))
    except ValueError:
        return ["captureId must be a canonical UUID"]
    if capture_id != bundle.get("captureId"):
        failures.append("captureId must use canonical UUID spelling")
    process_path = _bounded_artifact(path, bundle.get("processEventsFile"))
    journal_path = _bounded_artifact(path, bundle.get("serverJournalFile"))
    captured_bindings_path = _bounded_artifact(path, bundle.get("bindingsFile"))
    if process_path is None or journal_path is None or captured_bindings_path is None:
        return failures + ["raw artifact names must be bounded sibling filenames"]
    for artifact, digest_name in (
        (process_path, "processEventsSha256"),
        (journal_path, "serverJournalSha256"),
        (captured_bindings_path, "bindingsSha256"),
    ):
        try:
            observed = hashlib.sha256(artifact.read_bytes()).hexdigest()
        except OSError as exc:
            failures.append(f"cannot hash raw artifact {artifact.name}: {exc}")
            continue
        if bundle.get(digest_name) != observed:
            failures.append(f"{artifact.name}: SHA-256 differs from bundle")
    try:
        if hashlib.sha256(captured_bindings_path.read_bytes()).digest() != hashlib.sha256(bindings_path.read_bytes()).digest():
            failures.append("captured caller bindings differ from the reviewed repo binding")
    except OSError as exc:
        failures.append(f"cannot compare reviewed caller bindings: {exc}")
    failures.extend(validate_capture_bindings(bindings_path, source_root))
    process_events, process_failures = _read_json_lines(process_path)
    journal_rows, journal_failures = _read_json_lines(journal_path)
    failures.extend(process_failures + journal_failures)
    rows = bundle.get("rows")
    if not isinstance(rows, list):
        return failures + ["real-entry evidence rows must be an array"]
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
    event_by_id: dict[str, dict[str, object]] = {}
    for event in process_events:
        event_id = event.get("eventId")
        if not isinstance(event_id, str) or event_id in event_by_id:
            failures.append("process events require unique string eventId values")
            continue
        if event.get("captureId") != capture_id:
            failures.append(f"{event_id}: process event captureId differs")
        event_by_id[event_id] = event
    journal_by_cursor: dict[str, dict[str, object]] = {}
    for journal in journal_rows:
        cursor = journal.get("__CURSOR")
        if not isinstance(cursor, str) or cursor in journal_by_cursor:
            failures.append("server journal requires unique __CURSOR values")
            continue
        journal_by_cursor[cursor] = journal

    referenced_events: set[str] = set()
    referenced_cursors: set[str] = set()
    capture_windows: list[tuple[dt.datetime, dt.datetime, str]] = []
    for name in sorted(EVIDENCE_NAMES & by_name.keys()):
        row = by_name[name]
        if row.get("result") != "success": failures.append(f"{name}: real entry did not succeed")
        started = _parse_utc(row.get("startedAtUtc"))
        ended = _parse_utc(row.get("endedAtUtc"))
        negative_started = _parse_utc(row.get("negativeStartedAtUtc"))
        negative_ended = _parse_utc(row.get("negativeEndedAtUtc"))
        if started is None or ended is None or ended < started:
            failures.append(f"{name}: invalid bounded capture timestamps")
        else:
            capture_windows.append((started, ended, name))
        if (
            negative_started is None
            or negative_ended is None
            or negative_ended < negative_started
            or (ended is not None and negative_started <= ended)
        ):
            failures.append(f"{name}: invalid locked-negative capture timestamps")
        event_ids = row.get("processEventIds")
        entry_process_id = row.get("entryProcessId")
        if not isinstance(entry_process_id, int):
            failures.append(f"{name}: entryProcessId is not numeric")
        if not isinstance(event_ids, list) or not event_ids or any(not isinstance(item, str) for item in event_ids):
            failures.append(f"{name}: processEventIds must be a nonempty string array")
            event_ids = []
        observed_names: set[str] = set()
        row_processes = {
            event.get("processId"): event for event in process_events
            if event.get("entryName") == name and event.get("phase") == "positive"
            and isinstance(event.get("processId"), int)
        }
        for event_id in event_ids:
            referenced_events.add(event_id)
            event = event_by_id.get(event_id)
            if event is None:
                failures.append(f"{name}: process event {event_id} is absent")
                continue
            when = _parse_utc(event.get("timestampUtc"))
            if event.get("entryName") != name or event.get("phase") != "positive":
                failures.append(f"{name}: process event {event_id} has wrong row or phase")
            if started and ended and (when is None or when < started or when > ended):
                failures.append(f"{name}: process event {event_id} is outside its capture window")
            image = event.get("image")
            if not isinstance(image, str) or image not in WINDOWS_CLIENTS.values():
                failures.append(f"{name}: process event {event_id} is not an absolute Windows OpenSSH image")
            else:
                observed_names.add(next(client for client, expected in WINDOWS_CLIENTS.items() if expected == image))
                if _program_name(image) != str(event.get("processName", "")).casefold():
                    failures.append(f"{name}: process event {event_id} image/name differ")
            if not isinstance(event.get("processId"), int) or not isinstance(event.get("parentProcessId"), int):
                failures.append(f"{name}: process event {event_id} lacks numeric process lineage")
            elif isinstance(entry_process_id, int):
                parent = event.get("parentProcessId")
                seen: set[int] = set()
                while isinstance(parent, int) and parent != entry_process_id and parent not in seen:
                    seen.add(parent)
                    ancestor = row_processes.get(parent)
                    parent = ancestor.get("parentProcessId") if ancestor else None
                if parent != entry_process_id:
                    failures.append(f"{name}: process event {event_id} is not descended from the invoked entry")
        if observed_names != REQUIRED_CLIENTS[name]:
            failures.append(f"{name}: observed client set differs: {sorted(observed_names)}")

        negative_events = [
            event for event in process_events
            if event.get("entryName") == name and event.get("phase") == "negative"
            and str(event.get("processName", "")).casefold() in {"ssh.exe", "scp.exe", "sftp.exe"}
        ]
        if negative_events:
            failures.append(f"{name}: locked negative window observed {len(negative_events)} SSH-family spawn(s)")

        cursors = row.get("serverJournalCursors")
        if not isinstance(cursors, list) or not cursors or any(not isinstance(item, str) for item in cursors):
            failures.append(f"{name}: serverJournalCursors must be a nonempty string array")
            cursors = []
        matched_journal = False
        for cursor in cursors:
            if cursor in referenced_cursors:
                failures.append(f"{name}: server journal cursor {cursor} is already attributed to another entry")
            referenced_cursors.add(cursor)
            journal = journal_by_cursor.get(cursor)
            if journal is None:
                failures.append(f"{name}: server journal cursor {cursor} is absent")
                continue
            message = journal.get("MESSAGE")
            micros = journal.get("__REALTIME_TIMESTAMP")
            try:
                when = dt.datetime.fromtimestamp(int(str(micros)) / 1_000_000, tz=dt.timezone.utc)
            except (TypeError, ValueError):
                when = None
            if not isinstance(message, str) or "Accepted publickey" not in message or expected_fingerprint not in message:
                failures.append(f"{name}: journal cursor {cursor} is not an accepted expected-fingerprint login")
                continue
            if started and ended and (when is None or when < started or when > ended):
                failures.append(f"{name}: journal cursor {cursor} is outside its capture window")
                continue
            matched_journal = True
        if not matched_journal:
            failures.append(f"{name}: no raw server journal row corroborates the positive entry")
    unreferenced = sorted({
        str(event.get("eventId")) for event in process_events
        if event.get("phase") == "positive"
        and str(event.get("processName", "")).casefold() in {"ssh.exe", "scp.exe", "sftp.exe"}
    } - referenced_events)
    if unreferenced:
        failures.append("unreferenced positive process events: " + ", ".join(unreferenced))
    for previous, current in zip(sorted(capture_windows), sorted(capture_windows)[1:]):
        if current[0] <= previous[1]:
            failures.append(f"capture windows overlap: {previous[2]} and {current[2]}")
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
