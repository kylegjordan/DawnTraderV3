"""
token-watch — minting a system alert from a root-run job. (B-TOKEN-WATCH-STORAGE, P4/P5)

The study's own users (tokenwatch, tokenwatch-cold) cannot run the trading
app's alert command, so the two root jobs that need to page — the store-size
watch and the unit-failure template — mint through this one function.

⛔ ONE FORM, THE SAME AS `comms-infra/discord/dt-deploy-drift.sh:165`:
   `npm run system-alerts -- add` as `deploy`, with all five flags `cmdAdd`
   requires (`scripts/system-alerts.ts:184-192`) and a category from the
   seven-member list (`server/services/system-alerts.ts:69-77`). `health_check`
   is the member that list itself glosses as "disk / archival-cron-silence /
   freshness system health".
⛔ AN ARGUMENT LIST, NEVER A SHELL STRING. Titles and bodies carry file names
   and journal lines; a shell would interpret them.
⛔ A FAILED MINT IS SAID ALOUD: `MINT_FAILED` is logged and the caller exits
   non-zero. An unfiled alert must never look like a filed one.

Dedupe (`server/services/system-alerts.ts:516-557`): while a row with the same
key is not resolved, `add` returns the existing row and writes nothing. So a
standing condition re-minted daily stays ONE row, and a resolved row lets the
next occurrence mint.
"""

from __future__ import annotations

import logging
import subprocess
from datetime import datetime, timezone

LOG = logging.getLogger("token-watch.alert")

APP_DIR = "/home/deploy/dawntrader"
CATEGORY = "health_check"
SEVERITIES = ("info", "warning", "critical")
BODY_MAX = 3500   # the dispatcher posts the body to Discord; keep it under one message's worth of room


def mint_argv(*, severity: str, dedupe_key: str, title: str, body: str, now: datetime | None = None) -> list[str]:
    """The exact argument list. Separate from `mint` so a test can assert the form without running it."""
    if severity not in SEVERITIES:
        raise ValueError("severity %r is not one of %r" % (severity, SEVERITIES))
    if not dedupe_key or not title or not body:
        raise ValueError("dedupe_key, title and body are all required")
    when = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    if len(body) > BODY_MAX:
        body = body[:BODY_MAX - 40] + "\n… (truncated; see the journal)"
    return [
        "runuser", "-u", "deploy", "--",
        "/usr/bin/npm", "--prefix", APP_DIR, "run", "--silent", "system-alerts", "--",
        "add",
        "--triggers-at", when,
        "--category", CATEGORY,
        "--severity", severity,
        "--dedupe-key", dedupe_key,
        "--title", title,
        "--body", body,
    ]


def mint(*, severity: str, dedupe_key: str, title: str, body: str, run=subprocess.run) -> bool:
    """Mint (or, if an unresolved row holds the key, return the existing one). True on success."""
    argv = mint_argv(severity=severity, dedupe_key=dedupe_key, title=title, body=body)
    try:
        r = run(argv, capture_output=True, text=True, timeout=120, cwd=APP_DIR)
    except Exception as exc:                     # noqa: BLE001 — any failure to run is a failed mint
        LOG.error("MINT_FAILED key=%s: could not run the alert command: %s", dedupe_key, exc)
        return False
    if r.returncode != 0:
        LOG.error("MINT_FAILED key=%s rc=%s stderr=%s", dedupe_key, r.returncode, (r.stderr or "")[:500])
        return False
    LOG.info("minted (or matched an open row) key=%s severity=%s", dedupe_key, severity)
    return True
