"""
token-watch — a failed unit pages. (B-TOKEN-WATCH-STORAGE OBJ-4, P5)

Run by the root template `token-watch-failed@.service`, which every token-watch
unit names in `OnFailure=`. The argument is the failed unit's full name (%i).

★ WHY. `#1132`: the follow-up sweep was killed for running out of memory, hourly,
  with no `OnFailure=` — nothing reported it, and Langston found it by eye. The
  same silence then hid the store passing its cap for five weeks.

The row is deduped per unit (`token-watch-unit-failed-<unit>`): while it is
open, later failures of the same unit add nothing to it, so the body carries the
unit's last error lines at the time of the FIRST failure, and the journal is the
growing record.
"""

from __future__ import annotations

import logging
import re
import subprocess
import sys

import alert_mint

LOG = logging.getLogger("token-watch.unit-failed")
UNIT_RE = re.compile(r"^token-watch-[a-z0-9-]+\.service$")


def last_errors(unit: str, run=subprocess.run) -> str:
    try:
        r = run(["journalctl", "-u", unit, "-p", "err", "-n", "20", "--no-pager", "-o", "short-iso"],
                capture_output=True, text=True, timeout=60)
        text = (r.stdout or "").strip()
        return text or "(no error-priority lines in the journal for this unit)"
    except Exception as exc:                     # noqa: BLE001
        return "(could not read the journal: %s)" % exc


def run(unit: str, mint=alert_mint.mint, journal=last_errors) -> int:
    if not UNIT_RE.match(unit):
        LOG.error("refusing an unexpected unit name: %r", unit)
        return 2
    body = "\n".join([
        "The unit %s failed. Its last error-priority journal lines:" % unit,
        "",
        journal(unit),
        "",
        "Full history: journalctl -u %s. While this row is open, later failures of the same unit add nothing to "
        "it; resolve it with evidence once the cause is fixed, so the next failure can page." % unit,
        "Owner: Infra Claude (CC-INFRA). Source: token-watch/unit_failed.py (B-TOKEN-WATCH-STORAGE, #1132).",
    ])
    ok = mint(severity="warning", dedupe_key="token-watch-unit-failed-%s" % unit,
              title="token-watch unit failed: %s" % unit, body=body)
    return 0 if ok else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    if len(sys.argv) != 2:
        print("usage: unit_failed.py <unit name>", file=sys.stderr)
        sys.exit(2)
    sys.exit(run(sys.argv[1]))
