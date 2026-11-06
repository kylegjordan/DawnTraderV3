"""
token-watch — the store-size watch, on its own schedule. (B-TOKEN-WATCH-STORAGE OBJ-3, P4)

★ WHY THIS EXISTS. The 8 GiB cap (`config.STORE_CAP_BYTES`) was only ever
  measured inside the follow-up sweep's dead-man's switch
  (then `follow_up.py:220` → `liveness.check()` → `_store_size_check()`; since
  B-TOKEN-WATCH-STORAGE amendment 1 that switch runs on its own timer,
  `ops/feed_watch.py`). When the
  sweep was switched off on 2026-09-30 for running out of memory (#1132), the
  size check went with it, and the store passed the cap with nobody told.
  This job measures it daily on its own and mints an alert.

⛔⛔ IT CALLS `liveness._store_size_check()` AND NOTHING ELSE FROM LIVENESS.
   `liveness.check()` ends in `save_state` into `state/` (tokenwatch-only), and
   `python3 liveness.py` IS `check()`. Run as root, either would leave a
   root-owned state file that `tokenwatch` cannot rewrite, breaking the real
   dead-man's switch when the sweep returns. The unit adds
   `ReadOnlyPaths=/var/lib/token-watch` so this is enforced, not remembered,
   and a test asserts a run writes nothing under the store.

THE TWO ROWS (dedupe keys `token-watch-store-warn` and
`token-watch-store-over_cap`) are kept apart on purpose: one key would let a
standing warn row swallow a later critical.
⚠️ THE WARN ROW IS A STANDING CONDITION. Once the cold archive leaves the box
   the store still sits above the 6 GiB warn line, so the warn row stays open.
   It is NOT resolved as fixed; it clears when the store is back under 6 GiB.
   Its clearing owner is Infra Claude until a self-clearing actor exists
   (homed to B-TOKEN-WATCH-FOLLOWUP-MEMORY).

INSTRUMENT, stated beside every number: the headline is
`_store_size_check()`'s own whole-store walk, summing FILE sizes only. The
per-directory split is a second walk a moment later with the same
files-only rule, so the two need not sum exactly. Neither equals `du -sb`,
which also counts directory entries (`due/`'s own is 131,072 B).
"""

from __future__ import annotations

import os as _os
import sys as _sys
# The collector modules this reads (config, liveness) live one directory up from ops/
# (why ops/ is separate: the header of ops/cold_offbox.py).
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

import datetime
import logging
import os
import sys

import alert_mint
import liveness
from config import ROOT, STORE_CAP_BYTES, STORE_CAP_WARN_BYTES

LOG = logging.getLogger("token-watch.store-watch")

SEVERITY = {"warn": "warning", "over_cap": "critical"}


def split(root: str = ROOT) -> dict[str, int]:
    """Bytes per top-level entry, files only — the same rule as `_store_size_check`."""
    out: dict[str, int] = {}
    for top in sorted(os.listdir(root)):
        path = os.path.join(root, top)
        if os.path.isfile(path):
            out.setdefault("(files at the root)", 0)
            out["(files at the root)"] += os.path.getsize(path)
            continue
        total = 0
        for base, _dirs, files in os.walk(path):
            for name in files:
                try:
                    total += os.path.getsize(os.path.join(base, name))
                except OSError:
                    continue
        out[top] = total
    return out


def gb(n: int) -> str:
    return "%s B (%.2f GiB)" % (format(n, ","), n / 2**30)


def utc_stamp() -> str:
    """The mint time, in UTC (an aware now(), never a naive local one - the box's local zone is not UTC)."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%MZ")


def body_for(state: str, total: int, parts: dict[str, int]) -> str:
    lines = [
        "Store: %s — measured by liveness._store_size_check(), a whole-store walk summing file sizes only." % gb(total),
        "Cap: %s · warn line: %s." % (gb(STORE_CAP_BYTES), gb(STORE_CAP_WARN_BYTES)),
        "",
        "Per directory (a second walk a moment later, same files-only rule, so it need not sum to the headline exactly):",
    ]
    for name, n in sorted(parts.items(), key=lambda kv: -kv[1]):
        lines.append("  %s: %s" % (name, gb(n)))
    lines.append("")
    if state == "warn":
        lines.append("STANDING CONDITION: this row stays open while the store is above the warn line. It is NOT to be "
                     "resolved as fixed; it clears when the store is back under %s. Clearing owner: Infra Claude "
                     "(CC-INFRA). The study shares / with the live trading app." % gb(STORE_CAP_WARN_BYTES))
    else:
        lines.append("OVER THE CAP. The study shares / with the live trading app; a full disk stops the app writing. "
                     "Owner: Infra Claude (CC-INFRA). Look first at due/ (spent buckets go 7 days after the follow-up "
                     "reads them, unread ones never; tools/due_census.py splits them) and at whether the daily off-box upload (token-watch-cold-offbox) is running.")
    # Langston, Step 8 C-3: a standing row is never re-minted while it stays open (dedupe), so this body is frozen at
    # mint time - and the live figure is root-only (journal and store), so a non-root reader sees ONLY this body.
    lines.append("THESE FIGURES ARE AS OF THIS ROW'S MINT (%s UTC) AND DO NOT UPDATE: the row is not re-minted while it "
                 "stays open. Live size, AS ROOT on the staging box: `du -sb /var/lib/token-watch`, or the hourly "
                 "`journalctl -u token-watch-feed-watch` line's store_bytes= field. Run without root, `du` is denied "
                 "parts of the store and prints a partial, silently small total." % utc_stamp())
    lines.append("Source: token-watch/ops/store_watch.py, unit token-watch-store-watch (B-TOKEN-WATCH-STORAGE, #1132).")
    return "\n".join(lines)


def run(mint=alert_mint.mint) -> int:
    result = liveness._store_size_check()
    state, total = result["store_state"], result["store_bytes"]
    if state == "ok":
        LOG.info("store ok: %s (cap %s, warn %s)", gb(total), gb(STORE_CAP_BYTES), gb(STORE_CAP_WARN_BYTES))
        return 0
    parts = split()
    title = ("token-watch store over its 8 GiB cap" if state == "over_cap"
             else "token-watch store above its 6 GiB warn line (standing condition)")
    ok = mint(severity=SEVERITY[state], dedupe_key="token-watch-store-%s" % state,
              title=title, body=body_for(state, total, parts))
    return 0 if ok else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    sys.exit(run())
