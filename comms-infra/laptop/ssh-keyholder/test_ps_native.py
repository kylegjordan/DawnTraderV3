"""Runs the PowerShell native-call helper for real, under the stock Windows PowerShell.

install.ps1 and rollback.ps1 were approved after tests that only exercised the Python
holder; neither script had ever been executed. On the laptop's Windows PowerShell 5.1 the
installer refused at its first native call ("Too many arguments": the empty passphrase
argument was dropped) and rollback would have stopped half-way (ssh-add -D reports on
stderr, which 5.1 turns into a terminating error under ErrorActionPreference Stop).
This suite proves the replacement helper on the shell that actually runs the scripts, and
first proves that the same shell reproduces the original failure, so a pass cannot come
from an environment that never had the problem.

Windows only. Elsewhere every test is skipped with that reason, so a non-Windows run is
not evidence. KEYHOLDER_PS_DIR overrides the script directory (used by the mutation runner).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(os.environ.get("KEYHOLDER_PS_DIR") or Path(__file__).resolve().parent)
POWERSHELL = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
SSH_KEYGEN = Path(r"C:\Windows\System32\OpenSSH\ssh-keygen.exe")
SSH_ADD = Path(r"C:\Windows\System32\OpenSSH\ssh-add.exe")
BEGIN = "# BEGIN native-call helper"
END = "# END native-call helper"
ON_WINDOWS = os.name == "nt" and POWERSHELL.is_file() and SSH_KEYGEN.is_file()


def read_script(name: str) -> str:
    return (HERE / name).read_bytes().decode("ascii").replace("\r\n", "\n")


def helper_block(name: str) -> str:
    text = read_script(name)
    assert text.count(BEGIN) == 1 and text.count(END) == 1, f"{name}: helper markers must appear exactly once"
    return text[text.index(BEGIN): text.index(END) + len(END)]


def run_ps(body: str) -> dict:
    """Run helper + body in a fresh stock powershell.exe with the scripts' own error settings.
    The body must Write-Output exactly one JSON object as its last line."""
    script = "$ErrorActionPreference = 'Stop'\nSet-StrictMode -Version Latest\n" + helper_block("install.ps1") + "\n" + body
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "probe.ps1"
        path.write_bytes(script.replace("\n", "\r\n").encode("ascii"))
        r = subprocess.run([str(POWERSHELL), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(path)],
                           capture_output=True, text=True, timeout=120)
    lines = [ln for ln in r.stdout.splitlines() if ln.strip()]
    if r.returncode != 0 or not lines:
        raise AssertionError(f"powershell probe failed rc={r.returncode}\nstdout={r.stdout[-800:]}\nstderr={r.stderr[-800:]}")
    return json.loads(lines[-1])


class StaticShape(unittest.TestCase):
    def test_helper_identical_in_both_scripts(self):
        self.assertEqual(helper_block("install.ps1"), helper_block("rollback.ps1"))

    def test_no_native_call_bypasses_the_helper(self):
        for name in ("install.ps1", "rollback.ps1"):
            text = read_script(name)
            body = text.replace(helper_block(name), "")
            calls = [ln.strip() for ln in body.splitlines() if re.match(r"^\s*(\$\w+\s*=\s*)?&\s", ln)]
            self.assertEqual([c for c in calls if not c.startswith("& $rollbackScript ")], [], f"{name}: direct call operator use")
            for pattern in (r"\*>", r"2>&1", r"\$LASTEXITCODE"):
                self.assertIsNone(re.search(pattern, body), f"{name}: {pattern} found outside the helper")


@unittest.skipUnless(ON_WINDOWS, "needs Windows PowerShell and Windows OpenSSH; a non-Windows run is not evidence")
class StockShellRuntime(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="ps-native-"))
        cls.plain = cls.tmp / "plain_key"
        cls.locked = cls.tmp / "locked key with spaces"
        # Throwaway test keys, created here and deleted in tearDownClass; the passphrase is a test value.
        subprocess.run([str(SSH_KEYGEN), "-q", "-t", "ed25519", "-N", "", "-f", str(cls.plain)], check=True, capture_output=True)
        subprocess.run([str(SSH_KEYGEN), "-q", "-t", "ed25519", "-N", "test-only-passphrase", "-f", str(cls.locked)], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def ps_path(self, p: Path) -> str:
        return str(p).replace("'", "''")

    def test_shell_reproduces_the_original_failure(self):
        # Positive control: the old call form must fail on this shell, or nothing below means anything.
        out = run_ps(f"""
$msg = 'no-throw'
try {{ & '{SSH_KEYGEN}' -y -P '' -f '{self.ps_path(self.plain)}' *> $null }} catch {{ $msg = $_.Exception.Message }}
Write-Output (@{{ major = $PSVersionTable.PSVersion.Major; msg = $msg }} | ConvertTo-Json -Compress)
""")
        if out["major"] != 5:
            self.skipTest(f"powershell.exe is {out['major']}.x, not the stock 5.1 this control is about")
        self.assertIn("Too many arguments", out["msg"])

    def test_empty_argument_arrives(self):
        out = run_ps(f"""
$r = Invoke-NativeTool '{SSH_KEYGEN}' @('-y', '-P', '', '-f', '{self.ps_path(self.plain)}')
Write-Output (@{{ code = $r.ExitCode; out = $r.StdOut; err = $r.StdErr }} | ConvertTo-Json -Compress)
""")
        self.assertEqual(out["code"], 0, out)
        self.assertTrue(out["out"].startswith("ssh-ed25519 "), out)

    def test_encrypted_key_refuses_empty_passphrase_without_throwing(self):
        out = run_ps(f"""
$r = Invoke-NativeTool '{SSH_KEYGEN}' @('-y', '-P', '', '-f', '{self.ps_path(self.locked)}')
Write-Output (@{{ code = $r.ExitCode; err = $r.StdErr }} | ConvertTo-Json -Compress)
""")
        self.assertNotEqual(out["code"], 0, out)
        self.assertNotIn("Too many arguments", out["err"])
        self.assertIn("passphrase", out["err"].lower())

    def test_stderr_and_nonzero_exit_do_not_throw(self):
        out = run_ps(f"""
$r = Invoke-NativeTool '{SSH_KEYGEN}' @('-l', '-f', '{self.ps_path(self.tmp / "absent")}')
Write-Output (@{{ code = $r.ExitCode; err = $r.StdErr }} | ConvertTo-Json -Compress)
""")
        self.assertNotEqual(out["code"], 0, out)
        self.assertTrue(out["err"].strip(), out)

    @unittest.skipUnless(SSH_ADD.is_file(), "Windows ssh-add absent")
    def test_ssh_add_reports_an_exit_code_instead_of_throwing(self):
        out = run_ps(f"""
$r = Invoke-NativeTool '{SSH_ADD}' @('-l')
Write-Output (@{{ code = $r.ExitCode }} | ConvertTo-Json -Compress)
""")
        self.assertIsInstance(out["code"], int)

    def test_quoting_round_trips_exactly(self):
        import sys
        values = ["", "plain", "a b", 'q"x', "tail\\", "c:\\p q\\", 'both \\"x\\" ', "*SID:(OI)(CI)F"]
        py = sys.executable.replace("'", "''")
        arr = ", ".join("'" + v.replace("'", "''") + "'" for v in values)
        out = run_ps(f"""
$r = Invoke-NativeTool '{py}' @('-c', 'import sys,json;print(json.dumps(sys.argv[1:]))', {arr})
Write-Output (@{{ code = $r.ExitCode; out = $r.StdOut }} | ConvertTo-Json -Compress)
""")
        self.assertEqual(out["code"], 0, out)
        self.assertEqual(json.loads(out["out"]), values)


if __name__ == "__main__":
    unittest.main(verbosity=2)
