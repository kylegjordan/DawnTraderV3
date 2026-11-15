#!/usr/bin/env python3
"""P5 / P6 / P14 mutants (B-TOKEN-WATCH-FOLLOWUP-MEMORY). Run from token-watch/ on a scratch COPY of the tree:
    python3 tests/mutate_p5_p6_p14.py
exit 0 = every mutant killed (its test file exits non-zero WITH a FAIL line). NOT-APPLIED counts as a failure."""
import subprocess, sys

NL = chr(10)
T5 = "tests/test_p5_error_requeue.py"
T6 = "tests/test_p6_fence_and_writer.py"
TC = "tests/test_collector.py"
T9 = "tests/test_p9_journals.py"
MUTANTS = [
    ("P5 the failed entry is dropped again (no requeue)", T5,
     [("follow_up.py", "                    _append_next_bucket(dict(entry, attempts=attempts), now)" + NL,
       "                    pass" + NL)]),
    ("P5 no observation row for the failure", T5,
     [("follow_up.py", "                record_observation(mint, age, now, {" + NL + "                    \"observed\": False," + NL +
       "                    \"reason\": \"abandoned\" if giving_up else \"error\",",
       "                (lambda *a: None)(mint, age, now, {" + NL + "                    \"observed\": False," + NL +
       "                    \"reason\": \"abandoned\" if giving_up else \"error\",")]),
    ("P5 the attempt count is not carried", T5,
     [("follow_up.py", "_append_next_bucket(dict(entry, attempts=attempts), now)", "_append_next_bucket(dict(entry), now)")]),
    ("P5 never abandons", T5,
     [("follow_up.py", "                giving_up = attempts >= MAX_ERROR_ATTEMPTS", "                giving_up = False")]),
    ("P6(c) a past point is written to a bucket too", T6,
     [("store.py", "                \"first_seen_at\": now.isoformat()," + NL + "            })" + NL + "            continue",
       "                \"first_seen_at\": now.isoformat()," + NL + "            })")]),
    ("P6(c) a same-hour point goes to the current bucket", T6,
     [("store.py", "            due_bucket = due + timedelta(hours=1)", "            due_bucket = due")]),
    ("P6(d) the summary timer builds without the lock", T6,
     [("summary.py", "    with periodic_lock(\"summary\") as held:" + NL + "        if not held:",
       "    with periodic_lock(\"summary\") as held:" + NL + "        if False:")]),
    ("P14 the follow-up is not shed when the account has no room", TC,
     [("budget.py", "    if kind == \"follow_up\":" + NL + "        return non_birth < headroom and remaining > 0",
       "    if kind == \"follow_up\":" + NL + "        return non_birth < headroom")]),
    ("P6(d) a skipped summary always exits 0", T6,
     [("summary.py", "        (LOG.error if code else LOG.info)(why)" + NL + "        sys.exit(code)" + NL + "    print(",
       "        (LOG.error if code else LOG.info)(why)" + NL + "        sys.exit(0)" + NL + "    print(")]),
    ("P6(d) a stale published file reads as fresh", T6,
     [("summary.py", "    if age > SKIP_STALE_AFTER:", "    if False:")]),
    ("P6(d) the refusing holder is not captured", T6,
     [("store.py", "                _LAST_REFUSAL[\"line\"] = stale_line.strip()" + NL, "")]),
    ("tier: a skipped run always exits 0", T6,
     [("tier.py", "        (LOG.error if code else LOG.info)(why)" + NL + "        sys.exit(code)" + NL + "    sys.exit(1 if",
       "        (LOG.error if code else LOG.info)(why)" + NL + "        sys.exit(0)" + NL + "    sys.exit(1 if")]),
    ("tier: an old completion reads as fresh", T6,
     [("tier.py", "    if age > TIER_SKIP_STALE_AFTER:", "    if False:")]),
    ("tier: a completed run is not recorded", T6,
     [("tier.py", "        save_state(TIER_STATE, {\"completed_at\": now.isoformat()})" + NL, "")]),
    ("P9 the current month counts as closed", T9,
     [("store.py", "                if len(key) == 7 and key[4] == \"-\" and key < cur:", "                if len(key) == 7 and key[4] == \"-\" and key <= cur:")]),
    ("P9 only the previous month is drained", T9,
     [("budget.py", "    for key in closed_journal_months(now):" + NL + "        n = _drain_month(key)", "    for key in closed_journal_months(now)[-1:]:" + NL + "        n = _drain_month(key)")]),
    ("P9 a short journal is tiered anyway", T9,
     [("tier.py", "        if cursors.get(key, 0) < size:", "        if False:")]),
    ("P9 an existing cold file is overwritten", T9,
     [("tier.py", "        if os.path.exists(dst):" + NL + "            LOG.error(\"closed journal", "        if False:" + NL + "            LOG.error(\"closed journal")]),
    ("P9 the cold copy is not verified", T9,
     [("tier.py", "        if n_cold != size or h_cold.digest() != h_src.digest():", "        if False:")]),
    ("P9 tier.run skips the journals", T9,
     [("tier.py", "        out.update(tier_closed_journals(now))" + NL, "")]),
]
files = sorted({f for _n, _t, edits in MUTANTS for f, _a, _b in edits})
orig = {f: open(f, encoding="utf-8").read() for f in files}
bad = 0
try:
    for name, test, edits in MUTANTS:
        texts = dict(orig)
        ok = True
        for f, a, b in edits:
            if texts[f].count(a) != 1:
                print("NOT-APPLIED %s (anchor count %d in %s)" % (name, texts[f].count(a), f))
                ok = False
                break
            texts[f] = texts[f].replace(a, b)
        if not ok:
            bad += 1
            continue
        for f in files:
            if texts[f] != orig[f]:
                open(f, "w", encoding="utf-8", newline="").write(texts[f])
        p = subprocess.run([sys.executable, test], capture_output=True, text=True, timeout=900)
        fails = [l.strip()[:110] for l in p.stdout.splitlines() if l.strip().startswith("FAIL")]
        killed = p.returncode != 0 and bool(fails)
        print(("KILLED  " if killed else "SURVIVED") + " %-55s rc=%d %s" % (name, p.returncode, fails[:1]))
        bad += not killed
        for f in files:
            open(f, "w", encoding="utf-8", newline="").write(orig[f])
finally:
    for f, t in orig.items():
        open(f, "w", encoding="utf-8", newline="").write(t)
sys.exit(1 if bad else 0)
