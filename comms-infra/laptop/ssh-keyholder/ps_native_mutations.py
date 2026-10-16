#!/usr/bin/env python3
"""Mutation controls for test_ps_native.py (Windows). Each mutation breaks ONE property of
the native-call helper or its use; the suite must then fail CLEANLY (failures, not errors).
The unmutated suite must pass first. A mutation whose text is not found once is a problem."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SUITE = HERE / "test_ps_native.py"
BOTH = ("install.ps1", "rollback.ps1")
MUTATIONS = [
    ("an empty argument is dropped", BOTH, "    if ($Value -eq '') { return '\"\"' }\r\n", "    if ($Value -eq '') { return '' }\r\n"),
    ("arguments with spaces are not quoted", BOTH, "    if ($Value -notmatch '[\\s\"]') { return $Value }\r\n", "    return $Value\r\n"),
    ("backslashes before a quote are not doubled", BOTH, "    $escaped = [regex]::Replace($Value, '(\\\\*)\"', '$1$1\\\"')\r\n", "    $escaped = $Value.Replace('\"', '\\\"')\r\n"),
    ("a trailing backslash is not doubled", BOTH, "    $escaped = [regex]::Replace($escaped, '(\\\\+)\\z', '$1$1')\r\n", ""),
    ("trailing-backslash rule also fires before a final newline", BOTH, "'(\\\\+)\\z'", "'(\\\\+)$'"),
    ("a program that never exits is waited on forever", BOTH,
     "        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {\r\n",
     "        $process.WaitForExit()\r\n        if ($false) {\r\n"),
    ("any non-zero ssh-keygen exit is taken as proof of encryption", ("install.ps1",),
     "    if (-not $result.OutputComplete -or $result.StdErr -notmatch 'incorrect passphrase') {\r\n",
     "    if ($false) {\r\n"),
    ("installer passphrase check reverts to the call operator", ("install.ps1",),
     "    $result = Invoke-NativeTool $Keygen @('-y', '-P', '', '-f', $KeyPath) 60\r\n",
     "    & $Keygen -y -P '' -f $KeyPath *> $null\r\n    $result = [pscustomobject]@{ ExitCode = $LASTEXITCODE; StdErr = 'incorrect passphrase'; OutputComplete = $true }\r\n"),
    ("a bare native command slips in outside the helper", ("rollback.ps1",),
     "$purgeResult = Invoke-NativeTool $sshAdd @('-D')\r\n",
     "ssh-add -D\r\n$purgeResult = Invoke-NativeTool $sshAdd @('-D')\r\n"),
    ("rollback purge reverts to the call operator", ("rollback.ps1",),
     "$purgeResult = Invoke-NativeTool $sshAdd @('-D')\r\n", "& $sshAdd -D *> $null\r\n$purgeResult = [pscustomobject]@{ ExitCode = $LASTEXITCODE }\r\n"),
    ("the two helper copies diverge", ("rollback.ps1",), "    $startInfo.CreateNoWindow = $true\r\n", ""),
]


def run(dir_: Path) -> tuple[int, str]:
    env = dict(os.environ, KEYHOLDER_PS_DIR=str(dir_))
    r = subprocess.run([sys.executable, str(SUITE)], env=env, capture_output=True, text=True, timeout=900)
    tail = (r.stderr.strip().splitlines() or ["?"])[-1]
    return r.returncode, tail


rc, tail = run(HERE)
if rc != 0 or tail != "OK":
    print(f"BASELINE DOES NOT PASS - mutation results would be meaningless: {tail}")
    sys.exit(2)
print(f"baseline: {tail}")
bad = 0
for name, files, old, new in MUTATIONS:
    d = Path(tempfile.mkdtemp(prefix="ps-mut-"))
    try:
        for f in BOTH:
            shutil.copyfile(HERE / f, d / f)
        applied = True
        for f in files:
            text = (d / f).read_bytes().decode("ascii")
            if text.count(old) != 1:
                print(f"MUTATION NOT APPLIED ({text.count(old)} matches in {f}): {name}")
                applied = False
                break
            (d / f).write_bytes(text.replace(old, new, 1).encode("ascii"))
        if not applied:
            bad += 1
            continue
        rc, tail = run(d)
        if rc == 0:
            print(f"SURVIVED (the suite did not notice): {name}")
            bad += 1
        elif not re.match(r"^FAILED \(failures=\d+(, skipped=\d+)?\)$", tail):
            print(f"CRASHED or errored, not a clean kill: {name} :: {tail}")
            bad += 1
        else:
            print(f"killed: {name:<58} {tail}")
    finally:
        shutil.rmtree(d, ignore_errors=True)
print(f"mutations: {len(MUTATIONS) - bad} applied and killed, {bad} problems")
sys.exit(1 if bad else 0)
