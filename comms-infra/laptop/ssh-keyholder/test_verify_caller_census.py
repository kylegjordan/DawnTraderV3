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

    def evidence_bundle(self, *, duplicate: bool = False) -> tuple[Path, str]:
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
        process_path.write_text("".join(json.dumps(row) + "\n" for row in events), encoding="utf-8")
        journal_path.write_text("".join(json.dumps(row) + "\n" for row in journal), encoding="utf-8")
        bundle = {
            "schema": "dt-caller-capture-v1",
            "captureId": capture_id,
            "processEventsFile": process_path.name,
            "processEventsSha256": hashlib.sha256(process_path.read_bytes()).hexdigest(),
            "serverJournalFile": journal_path.name,
            "serverJournalSha256": hashlib.sha256(journal_path.read_bytes()).hexdigest(),
            "rows": rows,
        }
        path = root / "evidence.json"
        path.write_text(json.dumps(bundle), encoding="utf-8")
        return path, fingerprint

    def test_evidence_rejects_duplicate_rows_even_when_all_names_exist(self):
        path, fingerprint = self.evidence_bundle(duplicate=True)
        failures = validate_evidence(path, fingerprint)
        self.assertTrue(any("duplicate rows" in failure for failure in failures))
        self.assertTrue(any("row count differs" in failure for failure in failures))

    def test_evidence_requires_hash_bound_raw_capture(self):
        path, fingerprint = self.evidence_bundle()
        self.assertEqual(validate_evidence(path, fingerprint), [])
        process_path = path.parent / "process-events.jsonl"
        process_path.write_text(process_path.read_text(encoding="utf-8") + "{}\n", encoding="utf-8")
        failures = validate_evidence(path, fingerprint)
        self.assertTrue(any("SHA-256 differs" in failure for failure in failures))

    def test_evidence_requires_spawn_lineage_from_entry(self):
        path, fingerprint = self.evidence_bundle()
        process_path = path.parent / "process-events.jsonl"
        events = [json.loads(line) for line in process_path.read_text(encoding="utf-8").splitlines()]
        events[0]["parentProcessId"] = 42
        process_path.write_text("".join(json.dumps(row) + "\n" for row in events), encoding="utf-8")
        bundle = json.loads(path.read_text(encoding="utf-8"))
        bundle["processEventsSha256"] = hashlib.sha256(process_path.read_bytes()).hexdigest()
        path.write_text(json.dumps(bundle), encoding="utf-8")
        failures = validate_evidence(path, fingerprint)
        self.assertTrue(any("not descended from the invoked entry" in failure for failure in failures))


if __name__ == "__main__":
    unittest.main()
