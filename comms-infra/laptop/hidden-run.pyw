r"""hidden-run.pyw - run a scheduled job with NO visible window (PM Claude, Kyle's yes 2026-11-20).

Why: a scheduled task that starts powershell.exe or python.exe gets a console, and with Windows
Terminal as the default console host that console shows on Kyle's screen even with
-WindowStyle Hidden (the window appears before PowerShell can hide it). pythonw has no console;
it starts the real command with CREATE_NO_WINDOW, so the command and every console child it
starts (ssh, git, scp) share one invisible console.

Usage (Task Scheduler action):  pythonw.exe hidden-run.pyw <program> [args...]
Exit code is the job's own, so Task Scheduler's "Last Result" still reports failures.
Output goes to ~/.claude/hidden-run.log (one header line per run).
Rollback: re-import the saved definitions in ~/.claude/task-backups/.
"""
import os
import subprocess
import sys
from datetime import datetime, timezone

LOG = os.path.join(os.path.expanduser("~"), ".claude", "hidden-run.log")
CREATE_NO_WINDOW = 0x08000000


def main():
    cmd = sys.argv[1:]
    if not cmd:
        return 2
    with open(LOG, "a", encoding="utf-8", errors="replace") as log:
        log.write(f"\n=== {datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ} start: {subprocess.list2cmdline(cmd)}\n")
        log.flush()
        try:
            rc = subprocess.call(cmd, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                 creationflags=CREATE_NO_WINDOW)
        except OSError as e:
            log.write(f"launch failed: {e}\n")
            rc = 1
        log.write(f"=== {datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ} exit {rc}\n")
    return rc


if __name__ == "__main__":
    sys.exit(main())
