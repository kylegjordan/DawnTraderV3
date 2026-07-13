#!/usr/bin/env python3
"""Unit tests for gateway_watchdog.py pure decision core + persistence/inbox I/O.
(B-DISCORD-INBOUND-LIVENESS, #462). Run: python3 gateway_watchdog_test.py"""
import json
import os
import tempfile
import gateway_watchdog as gw

_p = _f = 0


def check(name, cond):
    global _p, _f
    if cond:
        _p += 1
    else:
        _f += 1
        print(f"  FAIL: {name}")


# ── resolve_threshold (Langston Q4: derive, don't hardcode) ──────────────────
check("threshold = N×heartbeat when that exceeds floor", gw.resolve_threshold(41.25, floor_s=120, n=4) == 165.0)
check("threshold = floor when N×heartbeat is below floor", gw.resolve_threshold(10, floor_s=120, n=4) == 120.0)
check("threshold falls back to floor on None heartbeat", gw.resolve_threshold(None, floor_s=120, n=4) == 120.0)
check("threshold falls back to floor on 0 heartbeat", gw.resolve_threshold(0, floor_s=120, n=4) == 120.0)

# ── is_stale ─────────────────────────────────────────────────────────────────
check("not stale just under threshold", gw.is_stale(1000.0, 1000.0 + 164, 165) is False)
check("stale just over threshold", gw.is_stale(1000.0, 1000.0 + 166, 165) is True)
check("exactly at threshold is NOT stale (strict >)", gw.is_stale(1000.0, 1165.0, 165) is False)

# ── should_alert (F2 cooldown) ───────────────────────────────────────────────
check("first alert always fires (no prior epoch)", gw.should_alert(None, 5000.0, 900) is True)
check("suppressed within cooldown", gw.should_alert(5000.0, 5000.0 + 300, 900) is False)
check("fires again past cooldown", gw.should_alert(5000.0, 5000.0 + 901, 900) is True)
check("fires exactly at cooldown boundary", gw.should_alert(5000.0, 5000.0 + 900, 900) is True)

# ── dedup_backfill (#494: key on id alone, order-preserving) ──────────────────
check("drops ids already present", gw.dedup_backfill([1, 2, 3], {2}) == [1, 3])
check("keeps all when none present", gw.dedup_backfill([1, 2, 3], set()) == [1, 2, 3])
check("drops all when all present", gw.dedup_backfill([1, 2], {1, 2, 9}) == [])
check("preserves order", gw.dedup_backfill([3, 1, 2], {1}) == [3, 2])

# ── epoch persist/read round-trip + fsync-before-return contract ─────────────
with tempfile.TemporaryDirectory() as d:
    sp = os.path.join(d, "sub", "alert_epoch")  # nested → mkdir parents
    check("read of absent epoch is None", gw.read_last_alert_epoch(sp) is None)
    gw.persist_alert_epoch(sp, 1234.5)
    check("epoch round-trips exactly", gw.read_last_alert_epoch(sp) == 1234.5)
    # simulate the restart re-read that the fsync ordering protects: file is on disk NOW
    check("epoch file exists on disk immediately (fsync'd, survives os._exit)", os.path.exists(sp))
    gw.clear_alert_epoch(sp)
    check("clear removes the marker", gw.read_last_alert_epoch(sp) is None)
    gw.clear_alert_epoch(sp)  # idempotent on absent
    check("clear is idempotent on absent file", True)
    # corrupt file → None (tolerant → will alert rather than silently suppress)
    with open(sp, "w") as f:
        f.write("not-a-float")
    check("corrupt epoch reads as None (fail toward alerting)", gw.read_last_alert_epoch(sp) is None)

# ── inbox_message_ids (#494 fanout: one id across multiple kind rows → one id) ─
with tempfile.TemporaryDirectory() as d:
    log = os.path.join(d, "inbox.jsonl")
    rows = [
        {"kind": "", "message_id": 111, "text": "kyle"},
        {"kind": "cc_outbound", "message_id": 222, "text": "mirror"},
        {"kind": "langston_inbound", "message_id": 222, "text": "same id, other kind"},  # fanout
        {"kind": "voice_inbound", "message_id": 333},
        {"no_message_id_field": True},
    ]
    with open(log, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    ids = gw.inbox_message_ids(log)
    check("inbox ids collected across kinds", ids == {111, 222, 333})
    check("id present once despite multi-kind fanout", 222 in ids and len([i for i in ids if i == 222]) == 1)
    check("rows without message_id are skipped", None not in ids)
    check("absent inbox file → empty set (not error)", gw.inbox_message_ids(os.path.join(d, "nope.jsonl")) == set())
    # end-to-end: backfill candidates deduped against the inbox
    check("backfill dedups against real inbox scan", gw.dedup_backfill([111, 444, 222, 555], ids) == [444, 555])
    # kind-scoping (cross-bridge false-skip guard): the CC bridge dedups only against ITS kinds,
    # so id 222 (present only as langston_inbound) is NOT seen as already-handled by the CC bridge.
    cc_ids = gw.inbox_message_ids(log, kinds={"", "voice_inbound", "voice_inbound_failed"})
    check("CC-scoped dedup sees the Kyle row (111) + its own voice (333), not the langston-only 222",
          cc_ids == {111, 333})
    lang_ids = gw.inbox_message_ids(log, kinds={"langston_inbound"})
    check("Langston-scoped dedup sees only its langston_inbound id (222)", lang_ids == {222})
    check("cross-bridge miss avoided: CC would re-deliver 222 rather than false-skip it",
          222 in gw.dedup_backfill([222], cc_ids))

print(f"\n{_p} passed, {_f} failed")
raise SystemExit(1 if _f else 0)
