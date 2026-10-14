from __future__ import annotations

import datetime as dt
import hashlib
import json
import tempfile
import unittest
import uuid
from pathlib import Path

from verify_caller_census import (
    EVIDENCE_NAMES,
    REQUIRED_CLIENTS,
    WINDOWS_CLIENTS,
    has_guarded_invocation,
    validate_evidence,
    validate_task_xml,
)


class CallerCensusParserTests(unittest.TestCase):
    def write(self, name: str, text: str) -> Path:
        root = Path(tempfile.mkdtemp(prefix="dt-census-"))
        path = root / name
        path.write_text(text, encoding="utf-8")
        return path

    def test_python_comment_only_guard_is_rejected(self):
        path = self.write("caller.py", "# dt-ssh-keyholder.py exec --client ssh --\nsubprocess.run(['ssh', 'host'])\n")
        self.assertFalse(has_guarded_invocation(path))

    def test_python_executable_guard_call_is_accepted(self):
        path = self.write(
            "caller.py",
            "import subprocess\nsubprocess.run([" + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + ", 'exec', '--client', 'ssh', '--', 'host'])\n",
        )
        self.assertTrue(has_guarded_invocation(path))

    def test_python_named_guard_call_is_accepted(self):
        path = self.write(
            "caller.py",
            "import subprocess\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nsubprocess.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\n",
        )
        self.assertTrue(has_guarded_invocation(path))

    def test_python_print_decoy_is_rejected(self):
        path = self.write(
            "caller.py",
            "KEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nprint(KEYHOLDER, 'exec', '--client', 'ssh')\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_guard_plus_direct_ssh_is_rejected(self):
        path = self.write(
            "caller.py",
            "import subprocess\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nsubprocess.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\nsubprocess.run(['ssh', 'host'])\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_guard_plus_dynamic_launcher_is_rejected(self):
        path = self.write(
            "caller.py",
            "import subprocess\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nsubprocess.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\nsubprocess.run(make_command())\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_aliased_module_direct_launcher_is_rejected(self):
        path = self.write(
            "caller.py",
            "import subprocess as sp\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nsp.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\nsp.run(['ssh', 'host'])\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_from_import_guard_is_accepted(self):
        path = self.write(
            "caller.py",
            "from subprocess import run as launch\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nlaunch([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\n",
        )
        self.assertTrue(has_guarded_invocation(path))

    def test_python_from_import_unresolved_launcher_is_rejected(self):
        path = self.write(
            "caller.py",
            "from subprocess import run\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nrun([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\nrun(make_command())\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_nested_alias_direct_launcher_is_rejected(self):
        path = self.write(
            "caller.py",
            "import subprocess\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nsubprocess.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\ndef bypass():\n    import subprocess as sp\n    sp.run(['ssh', 'host'])\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_os_system_launcher_is_rejected(self):
        path = self.write(
            "caller.py",
            "import os\nimport subprocess\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nsubprocess.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\nos.system('ssh host')\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_assigned_launcher_alias_is_rejected(self):
        path = self.write(
            "caller.py",
            "import subprocess as sp\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nsp.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\nlaunch = sp.run\nlaunch(['ssh', 'host'])\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_wildcard_import_direct_launcher_is_rejected(self):
        path = self.write(
            "caller.py",
            "from subprocess import *\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nrun([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\nrun(['ssh', 'host'])\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_rebound_module_is_rejected(self):
        path = self.write(
            "caller.py",
            "import subprocess\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nsubprocess.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\nsubprocess = make_launcher()\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_python_from_os_popen_is_rejected(self):
        path = self.write(
            "caller.py",
            "from os import popen\nimport subprocess\nKEYHOLDER = " + repr(r"C:\Users\kyleg\.claude\ssh-keyholder\dt-ssh-keyholder.py") + "\nsubprocess.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\npopen('ssh host')\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_shell_comment_only_guard_is_rejected(self):
        path = self.write("caller", "# C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py exec --client scp --\nscp a host:b\n")
        self.assertFalse(has_guarded_invocation(path))

    def test_shell_executable_guard_call_is_accepted(self):
        path = self.write("caller", "C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py exec --client scp -- a host:b\n")
        self.assertTrue(has_guarded_invocation(path))

    def test_shell_guard_plus_direct_ssh_on_next_line_is_rejected(self):
        path = self.write(
            "caller",
            "C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py exec --client ssh -- host\nssh host\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_shell_unrelated_guard_string_is_rejected(self):
        path = self.write(
            "caller",
            "KEYHOLDER=C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py\nother-tool exec --client ssh -- host\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_shell_echo_decoy_plus_direct_ssh_is_rejected(self):
        path = self.write(
            "caller",
            "echo C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py exec --client ssh --\nssh host\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_javascript_child_process_guard_is_accepted(self):
        path = self.write(
            "caller.mjs",
            "import { spawnSync } from 'node:child_process';\nconst KEYHOLDER = 'C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py';\nspawnSync(KEYHOLDER, ['exec', '--client', 'ssh', '--', 'host']);\n",
        )
        self.assertTrue(has_guarded_invocation(path))

    def test_javascript_fake_launcher_decoy_is_rejected(self):
        path = self.write(
            "caller.mjs",
            "const KEYHOLDER = 'C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py';\nfunction spawnSync() {}\nspawnSync(KEYHOLDER, ['exec', '--client', 'ssh', '--']);\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_javascript_guard_plus_direct_ssh_is_rejected(self):
        path = self.write(
            "caller.mjs",
            "import { spawnSync } from 'node:child_process';\nconst KEYHOLDER = 'C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py';\nspawnSync(KEYHOLDER, ['exec', '--client', 'ssh', '--', 'host']);\nspawnSync('ssh', ['host']);\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_javascript_guard_plus_dynamic_launcher_is_rejected(self):
        path = self.write(
            "caller.mjs",
            "import { spawnSync } from 'node:child_process';\nconst KEYHOLDER = 'C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py';\nspawnSync(KEYHOLDER, ['exec', '--client', 'ssh', '--', 'host']);\nspawnSync(makeCommand(), makeArguments());\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_task_action_and_working_directory_are_semantically_checked(self):
        xml = '''<?xml version="1.0"?><Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Actions><Exec><Command>C:\\Python313\\pythonw.exe</Command><Arguments>C:\\DawnTraderV3-infra\\caller.py --once</Arguments><WorkingDirectory>C:\\work</WorkingDirectory></Exec></Actions></Task>'''
        expected = {"command": r"C:\Python313\pythonw.exe", "argument_fragment": r"C:\DawnTraderV3-infra\caller.py", "working_directory": r"C:\work"}
        self.assertEqual(validate_task_xml(xml, expected), [])
        self.assertTrue(validate_task_xml(xml.replace("caller.py", "direct.py"), expected))
        self.assertTrue(validate_task_xml(xml.replace("C:\\work", "C:\\other"), expected))

    def test_task_rejects_source_suffix_prefix_and_extra_executable(self):
        xml = r'''<?xml version="1.0"?><Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Actions><Exec><Command>C:\Python313\pythonw.exe</Command><Arguments>C:\DawnTraderV3-infra\caller.py --once</Arguments></Exec></Actions></Task>'''
        expected = {"command": r"C:\Python313\pythonw.exe", "argument_fragment": r"C:\DawnTraderV3-infra\caller.py", "working_directory": ""}
        self.assertTrue(validate_task_xml(xml.replace("caller.py", "caller.py.bak"), expected))
        self.assertTrue(validate_task_xml(xml.replace("caller.py", "prefix-caller.py"), expected))
        self.assertTrue(validate_task_xml(xml.replace(" --once", " helper.py --once"), expected))
        self.assertTrue(validate_task_xml(xml.replace(" --once", " helper.exe --once"), expected))

    def test_task_rejects_additional_non_exec_action(self):
        xml = r'''<?xml version="1.0"?><Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Actions><Exec><Command>C:\Python313\pythonw.exe</Command><Arguments>C:\DawnTraderV3-infra\caller.py --once</Arguments></Exec><ComHandler><ClassId>{00000000-0000-0000-0000-000000000000}</ClassId></ComHandler></Actions></Task>'''
        expected = {"command": r"C:\Python313\pythonw.exe", "argument_fragment": r"C:\DawnTraderV3-infra\caller.py", "working_directory": ""}
        self.assertTrue(validate_task_xml(xml, expected))

    def evidence_bundle(self, *, duplicate: bool = False) -> tuple[Path, str, Path, Path]:
        root = Path(tempfile.mkdtemp(prefix="dt-census-evidence-"))
        fingerprint = "SHA256:" + "A" * 43
        capture_id = str(uuid.uuid4())
        started = dt.datetime(2026, 10, 14, 12, 0, tzinfo=dt.timezone.utc)
        ended = started + dt.timedelta(minutes=5)
        rows = []
        events = []
        journal = []
        for row_index, name in enumerate(sorted(EVIDENCE_NAMES)):
            row_started = started + dt.timedelta(minutes=row_index * 10)
            row_ended = row_started + dt.timedelta(minutes=5)
            event_ids = []
            for offset, client in enumerate(sorted(REQUIRED_CLIENTS[name]), 1):
                event_id = str(uuid.uuid4())
                event_ids.append(event_id)
                events.append({
                    "captureId": capture_id,
                    "eventId": event_id,
                    "entryName": name,
                    "phase": "positive",
                    "timestampUtc": (row_started + dt.timedelta(seconds=offset)).isoformat(),
                    "processId": 1000 + offset,
                    "parentProcessId": 900,
                    "image": WINDOWS_CLIENTS[client],
                    "processName": client + ".exe",
                })
            cursor = "cursor-" + hashlib.sha256(name.encode()).hexdigest()[:16]
            journal.append({
                "__CURSOR": cursor,
                "__REALTIME_TIMESTAMP": str(int((row_started + dt.timedelta(seconds=3)).timestamp() * 1_000_000)),
                "MESSAGE": f"Accepted publickey for root from 192.0.2.1 port 12345 ssh2: ED25519 {fingerprint}",
            })
            rows.append({
                "name": name,
                "result": "success",
                "startedAtUtc": row_started.isoformat(),
                "endedAtUtc": row_ended.isoformat(),
                "negativeStartedAtUtc": (row_ended + dt.timedelta(seconds=1)).isoformat(),
                "negativeEndedAtUtc": (row_ended + dt.timedelta(minutes=1)).isoformat(),
                "entryProcessId": 900,
                "processEventIds": event_ids,
                "serverJournalCursors": [cursor],
            })
        if duplicate:
            rows.append(dict(rows[0]))
        process_path = root / "process-events.jsonl"
        journal_path = root / "server-journal.jsonl"
        captured_bindings_path = root / "caller-bindings.json"
        bindings_path = root / "reviewed-bindings.json"
        source_root = root / "sources"
        source_root.mkdir()
        process_path.write_text("".join(json.dumps(row) + "\n" for row in events), encoding="utf-8")
        journal_path.write_text("".join(json.dumps(row) + "\n" for row in journal), encoding="utf-8")
        binding_entries = []
        for name in sorted(EVIDENCE_NAMES):
            source_hash = None
            if not name.startswith("direct:"):
                source = source_root / name
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_text(f"reviewed source for {name}\n", encoding="utf-8")
                source_hash = hashlib.sha256(source.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
            binding_entries.append({
                "name": name,
                "sourcePath": None if name.startswith("direct:") else name,
                "sourceSha256": source_hash,
                "positiveCommand": r"C:\Windows\System32\cmd.exe",
                "positiveArguments": ["/c", "positive", name],
                "negativeCommand": r"C:\Windows\System32\cmd.exe",
                "negativeArguments": ["/c", "negative", name],
            })
        bindings = {
            "schema": "dt-caller-bindings-v1",
            "active": True,
            "entries": binding_entries,
        }
        bindings_path.write_text(json.dumps(bindings), encoding="utf-8")
        captured_bindings_path.write_bytes(bindings_path.read_bytes())
        bundle = {
            "schema": "dt-caller-capture-v1",
            "captureId": capture_id,
            "bindingsFile": captured_bindings_path.name,
            "bindingsSha256": hashlib.sha256(captured_bindings_path.read_bytes()).hexdigest(),
            "processEventsFile": process_path.name,
            "processEventsSha256": hashlib.sha256(process_path.read_bytes()).hexdigest(),
            "serverJournalFile": journal_path.name,
            "serverJournalSha256": hashlib.sha256(journal_path.read_bytes()).hexdigest(),
            "rows": rows,
        }
        path = root / "evidence.json"
        path.write_text(json.dumps(bundle), encoding="utf-8")
        return path, fingerprint, bindings_path, source_root

    def test_evidence_rejects_duplicate_rows_even_when_all_names_exist(self):
        path, fingerprint, bindings, source_root = self.evidence_bundle(duplicate=True)
        failures = validate_evidence(path, fingerprint, bindings, source_root)
        self.assertTrue(any("duplicate rows" in failure for failure in failures))
        self.assertTrue(any("row count differs" in failure for failure in failures))

    def test_evidence_requires_hash_bound_raw_capture(self):
        path, fingerprint, bindings, source_root = self.evidence_bundle()
        self.assertEqual(validate_evidence(path, fingerprint, bindings, source_root), [])
        process_path = path.parent / "process-events.jsonl"
        process_path.write_text(process_path.read_text(encoding="utf-8") + "{}\n", encoding="utf-8")
        failures = validate_evidence(path, fingerprint, bindings, source_root)
        self.assertTrue(any("SHA-256 differs" in failure for failure in failures))

    def test_evidence_requires_spawn_lineage_from_entry(self):
        path, fingerprint, bindings, source_root = self.evidence_bundle()
        process_path = path.parent / "process-events.jsonl"
        events = [json.loads(line) for line in process_path.read_text(encoding="utf-8").splitlines()]
        events[0]["parentProcessId"] = 42
        process_path.write_text("".join(json.dumps(row) + "\n" for row in events), encoding="utf-8")
        bundle = json.loads(path.read_text(encoding="utf-8"))
        bundle["processEventsSha256"] = hashlib.sha256(process_path.read_bytes()).hexdigest()
        path.write_text(json.dumps(bundle), encoding="utf-8")
        failures = validate_evidence(path, fingerprint, bindings, source_root)
        self.assertTrue(any("not descended from the invoked entry" in failure for failure in failures))

    def test_evidence_rejects_substituted_entry_bindings(self):
        path, fingerprint, bindings, source_root = self.evidence_bundle()
        captured = path.parent / "caller-bindings.json"
        document = json.loads(captured.read_text(encoding="utf-8"))
        document["entries"][0]["positiveCommand"] = r"C:\Temp\helper.exe"
        captured.write_text(json.dumps(document), encoding="utf-8")
        bundle = json.loads(path.read_text(encoding="utf-8"))
        bundle["bindingsSha256"] = hashlib.sha256(captured.read_bytes()).hexdigest()
        path.write_text(json.dumps(bundle), encoding="utf-8")
        failures = validate_evidence(path, fingerprint, bindings, source_root)
        self.assertTrue(any("differ from the reviewed repo binding" in failure for failure in failures))

    def test_evidence_rejects_source_changed_after_binding(self):
        path, fingerprint, bindings, source_root = self.evidence_bundle()
        source = source_root / next(name for name in sorted(EVIDENCE_NAMES) if not name.startswith("direct:"))
        source.write_text("substituted source\n", encoding="utf-8")
        failures = validate_evidence(path, fingerprint, bindings, source_root)
        self.assertTrue(any("canonical source hash differs from reviewed source" in failure for failure in failures))


if __name__ == "__main__":
    unittest.main()
