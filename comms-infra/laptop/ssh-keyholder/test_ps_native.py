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
KBEGIN = "# BEGIN key-encryption check"
KEND = "# END key-encryption check"
ON_WINDOWS = os.name == "nt" and POWERSHELL.is_file() and SSH_KEYGEN.is_file()


def read_script(name: str) -> str:
    return (HERE / name).read_bytes().decode("ascii").replace("\r\n", "\n")


def block(name: str, begin: str, end: str) -> str:
    text = read_script(name)
    assert text.count(begin) == 1 and text.count(end) == 1, f"{name}: {begin!r} markers must appear exactly once"
    return text[text.index(begin): text.index(end) + len(end)]


def helper_block(name: str) -> str:
    return block(name, BEGIN, END)


def run_ps(body: str) -> dict:
    """Run helper + body in a fresh stock powershell.exe with the scripts' own error settings.
    The body must Write-Output exactly one JSON object as its last line."""
    script = ("$ErrorActionPreference = 'Stop'\nSet-StrictMode -Version Latest\n" + helper_block("install.ps1") + "\n"
              + block("install.ps1", KBEGIN, KEND) + "\n" + body)
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

    # A lint, not a proof: it recognises the launch forms below. A launch spelled some other
    # way would pass it; the runtime class and review remain the controls for that.
    BYPASS = [
        (r"&\s*[$'\"(]", "call operator"),
        (r"^\s*\.\s+\S", "dot-sourcing"),
        (r"\bStart-Process\b", "Start-Process"),
        (r"\bInvoke-Expression\b|\biex\b", "Invoke-Expression"),
        (r"\bcmd(\.exe)?\s+/[ck]\b", "cmd /c"),
        (r"\[(System\.)?Diagnostics\.Process\]::Start", "Process.Start outside the helper"),
        (r"(^|[;{|(=]\s*)(ssh-add|ssh-keygen|ssh|scp|sftp|icacls|gpupdate|schtasks|reg|sc|python|py|powershell|pwsh)(\.exe)?(\s|$)",
         "bare native command"),
        (r"\*>|2>&1|\d>\s*\$null|2>\s*\S", "native stream redirection"),
        (r"\$LASTEXITCODE", "$LASTEXITCODE"),
    ]

    @staticmethod
    def code_of(line: str) -> str:
        """The line with comment lines dropped and string-literal CONTENTS emptied (quotes kept),
        so a tool named inside a message is not a launch while `& 'C:\\x.exe'` still is."""
        if line.lstrip().startswith("#"):
            return ""
        return re.sub(r"'[^']*'", "''", re.sub(r'"[^"]*"', '""', line))

    def test_no_native_call_bypasses_the_helper(self):
        for name in ("install.ps1", "rollback.ps1"):
            body = read_script(name).replace(helper_block(name), "")
            for n, line in enumerate(body.splitlines(), 1):
                code = self.code_of(line)
                if not code.strip() or code.strip().startswith("& $rollbackScript "):
                    continue
                for pattern, label in self.BYPASS:
                    self.assertIsNone(re.search(pattern, code), f"{name} (helper removed) line {n}: {label}: {line.strip()}")

    def test_lint_sees_each_bypass_form(self):
        # Positive control for the lint itself: each recognised form must be caught.
        samples = ["& $sshAdd -l", "if ($x) { & 'C:\\t.exe' }", ". $tool", "Start-Process ssh-add", "iex $c",
                   "cmd /c ssh-add -l", "[Diagnostics.Process]::Start($si)", "ssh-add -l", "$x = icacls.exe a",
                   "gpupdate /force", "foo 2>&1", "foo *> $null", "foo 2> $null", "$LASTEXITCODE"]
        for sample in samples:
            self.assertTrue(any(re.search(p, self.code_of(sample)) for p, _ in self.BYPASS), sample)
        self.assertFalse(any(re.search(p, self.code_of('throw "ssh-keygen exit 1"')) for p, _ in self.BYPASS))


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
        values = ["", "plain", "a b", 'q"x', "tail\\", "c:\\p q\\", 'both \\"x\\" ', "*SID:(OI)(CI)F",
                  "a b\\\n", "ab\\\n", "x\ty", "it's"]
        py = sys.executable.replace("'", "''")
        vals = json.dumps(values, ensure_ascii=True).replace("'", "''")
        out = run_ps(f"""
$vals = [string[]]('{vals}' | ConvertFrom-Json)   # no @(): 5.1 emits the array as ONE object
$r = Invoke-NativeTool '{py}' (@('-c', 'import sys,json;print(json.dumps(sys.argv[1:]))') + $vals)
Write-Output (@{{ code = $r.ExitCode; out = $r.StdOut }} | ConvertTo-Json -Compress)
""")
        self.assertEqual(out["code"], 0, out)
        self.assertEqual(json.loads(out["out"]), values)

    def test_a_program_that_never_exits_is_stopped(self):
        import sys
        py = sys.executable.replace("'", "''")
        out = run_ps(f"""
$msg = 'no-throw'
try {{ $null = Invoke-NativeTool '{py}' @('-c', 'import time; time.sleep(60)') 2 }} catch {{ $msg = $_.Exception.Message }}
Write-Output (@{{ msg = $msg }} | ConvertTo-Json -Compress)
""")
        self.assertIn("did not exit within 2 seconds", out["msg"])

    def key_check(self, key: Path) -> str:
        out = run_ps(f"""
$msg = 'accepted'
try {{ Assert-KeyIsPassphraseProtected '{SSH_KEYGEN}' '{self.ps_path(key)}' }} catch {{ $msg = $_.Exception.Message }}
Write-Output (@{{ msg = $msg }} | ConvertTo-Json -Compress)
""")
        return out["msg"]

    def test_key_check_accepts_a_protected_key(self):
        self.assertEqual(self.key_check(self.locked), "accepted")

    def test_key_check_refuses_a_plain_key(self):
        self.assertIn("has no passphrase", self.key_check(self.plain))

    def test_key_check_refuses_a_plain_key_it_cannot_read_cleanly(self):
        # A plain key with loose permissions makes ssh-keygen exit non-zero WITHOUT saying
        # "incorrect passphrase"; that must not be read as proof of encryption.
        loose = self.tmp / "loose_plain_key"
        subprocess.run([str(SSH_KEYGEN), "-q", "-t", "ed25519", "-N", "", "-f", str(loose)], check=True, capture_output=True)
        subprocess.run(["icacls", str(loose), "/grant", "*S-1-1-0:R"], check=True, capture_output=True)
        probe = subprocess.run([str(SSH_KEYGEN), "-y", "-P", "", "-f", str(loose)], capture_output=True, text=True)
        if probe.returncode == 0:
            self.skipTest("this OpenSSH build does not refuse a loose-permission key; the case cannot be staged here")
        self.assertNotIn("incorrect passphrase", probe.stderr)
        self.assertIn("could not be confirmed", self.key_check(loose))


if __name__ == "__main__":
    unittest.main(verbosity=2)
