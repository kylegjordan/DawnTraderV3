from __future__ import annotations

import json
import tempfile
import unittest
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
            "import subprocess\nsubprocess.run([r'C:\\\\Users\\\\kyleg\\\\.claude\\\\ssh-keyholder\\\\dt-ssh-keyholder.py', 'exec', '--client', 'ssh', '--', 'host'])\n",
        )
        self.assertTrue(has_guarded_invocation(path))

    def test_python_named_guard_call_is_accepted(self):
        path = self.write(
            "caller.py",
            "import subprocess\nKEYHOLDER = r'C:\\\\Users\\\\kyleg\\\\.claude\\\\ssh-keyholder\\\\dt-ssh-keyholder.py'\nsubprocess.run([KEYHOLDER, 'exec', '--client', 'ssh', '--', 'host'])\n",
        )
        self.assertTrue(has_guarded_invocation(path))

    def test_shell_comment_only_guard_is_rejected(self):
        path = self.write("caller", "# C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py exec --client scp --\nscp a host:b\n")
        self.assertFalse(has_guarded_invocation(path))

    def test_shell_executable_guard_call_is_accepted(self):
        path = self.write("caller", "C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py exec --client scp -- a host:b\n")
        self.assertTrue(has_guarded_invocation(path))

    def test_shell_unrelated_guard_string_is_rejected(self):
        path = self.write(
            "caller",
            "KEYHOLDER=C:/Users/kyleg/.claude/ssh-keyholder/dt-ssh-keyholder.py\nother-tool exec --client ssh -- host\n",
        )
        self.assertFalse(has_guarded_invocation(path))

    def test_task_action_and_working_directory_are_semantically_checked(self):
        xml = '''<?xml version="1.0"?><Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Actions><Exec><Command>C:\\Python313\\pythonw.exe</Command><Arguments>C:\\DawnTraderV3-infra\\caller.py --once</Arguments><WorkingDirectory>C:\\work</WorkingDirectory></Exec></Actions></Task>'''
        expected = {"command": r"C:\Python313\pythonw.exe", "argument_fragment": r"C:\DawnTraderV3-infra\caller.py", "working_directory": r"C:\work"}
        self.assertEqual(validate_task_xml(xml, expected), [])
        self.assertTrue(validate_task_xml(xml.replace("caller.py", "direct.py"), expected))
        self.assertTrue(validate_task_xml(xml.replace("C:\\work", "C:\\other"), expected))

    def test_evidence_rejects_duplicate_rows_even_when_all_names_exist(self):
        rows = []
        for name in sorted(EVIDENCE_NAMES):
            clients = [WINDOWS_CLIENTS[client] for client in sorted(REQUIRED_CLIENTS[name])]
            rows.append({
                "name": name,
                "result": "success",
                "serverFingerprint": "SHA256:" + "A" * 43,
                "spawnedClients": clients,
                "negativeSpawnCount": 0,
            })
        rows.append(dict(rows[0]))
        path = self.write("evidence.json", json.dumps(rows))
        failures = validate_evidence(path, "SHA256:" + "A" * 43)
        self.assertTrue(any("duplicate rows" in failure for failure in failures))
        self.assertTrue(any("row count differs" in failure for failure in failures))


if __name__ == "__main__":
    unittest.main()
