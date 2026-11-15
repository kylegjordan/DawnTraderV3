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
T11 = "tests/test_p11_cold_census.py"
T8 = "tests/test_p8_census.py"
TG = "tests/test_install_cap_guard.py"   # Linux-only (bash + git): judge this set on Linux
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
     [("tier.py", "        j = tier_closed_journals(now)", "        j = {\"journals_moved\": [], \"journals_refused\": [], \"journals_failed\": [], \"journals_freed_bytes\": 0}")]),
    ("P9 a failed journal move is not counted into refused", T9,
     [("tier.py", "        out[\"refused\"] = out.get(\"refused\", 0) + len(j[\"journals_failed\"])" + NL, "")]),
    ("P9 the first-seen-short record is never written", T9,
     [("tier.py", "first = short_since.setdefault(key, now.isoformat())", "first = short_since.get(key, now.isoformat())")]),
    ("P9 a short journal never fails", T9,
     [("tier.py", "            if age > JOURNAL_SHORT_STALE_AFTER:", "            if False:")]),
    ("P9 an existing cold file is not failed", T9,
     [("tier.py", "            refused.append(key)" + NL + "            failed.append(key)" + NL + "            continue" + NL + "        h_src",
       "            refused.append(key)" + NL + "            continue" + NL + "        h_src")]),
    ("P9 a short-since record is never forgotten", T9,
     [("tier.py", "        if key not in refused:" + NL + "            short_since.pop(key)", "        if False:" + NL + "            short_since.pop(key)")]),
    ("P8 the census reads the cursor's own bucket", T8,
     [("tools/backlog_census.py", "    h, end = _hour(cursor) + timedelta(hours=1), _hour(census_hour)", "    h, end = _hour(cursor), _hour(census_hour)")]),
    ("P8 the census reads past the census hour", T8,
     [("tools/backlog_census.py", "        while h <= end:", "        while h <= end + timedelta(hours=1):")]),
    ("P8 an unreadable line is not counted", T8,
     [("tools/backlog_census.py", "                    except (ValueError, KeyError, TypeError):" + NL + "                        bad += 1",
       "                    except (ValueError, KeyError, TypeError):" + NL + "                        pass")]),
    ("P8 an existing artifact is overwritten", T8,
     [("tools/backlog_census.py", "        if os.path.exists(dst):" + NL + "            print(\"REFUSED: %s already exists", "        if False:" + NL + "            print(\"REFUSED: %s already exists")]),
    ("P8 the cursor moves without a matching census", T8,
     [("tools/move_followup_cursor.py", "        if where is None:", "        if False:")]),
    ("P8 the cursor move does not check it is after the cursor", T8,
     [("tools/move_followup_cursor.py", "        if a.census_hour <= last:", "        if False:")]),
    ("cap guard: an unchanged cap is re-checked (breaks the receiver)", TG,
     [("deploy/install_storage.sh", "  [ \"$new_cap\" = \"$old_cap\" ] && continue" + NL, "")]),
    ("cap guard: a new cap is never checked", TG,
     [("deploy/install_storage.sh", "  [ -n \"$new_cap\" ] || continue" + NL, "  continue" + NL)]),
    ("cap guard: an indented cap is invisible", TG,
     [("deploy/install_storage.sh", "  new_cap=$(grep -E '^[[:space:]]*MemoryMax='", "  new_cap=$(grep -E '^MemoryMax='")]),
    ("cap guard: only the first script on the ExecStart lines is checked", TG,
     [("deploy/install_storage.sh", "  for script in $scripts; do", "  for script in $(echo $scripts | cut -d' ' -f1); do")]),
    ("P8 the artifact re-read is not verified", T8,
     [("tools/backlog_census.py", "        if n != summary[\"rows\"] or back.hexdigest() != summary[\"payload_sha256\"]:", "        if False:")]),
    ("P8 the census accepts a cursor with no last_bucket", T8,
     [("tools/backlog_census.py", "        if not cursor:" + NL + "            print(\"REFUSED: the follow-up cursor has no last_bucket\"", "        if False:" + NL + "            print(\"REFUSED: the follow-up cursor has no last_bucket\"")]),
    ("P8 the move accepts a cursor with no last_bucket", T8,
     [("tools/move_followup_cursor.py", "        if not last:", "        if False:")]),
    ("P8 the census does not beat the lock", T8,
     [("tools/backlog_census.py", "            lock_beat()" + NL + "            path = due_path(h)", "            pass" + NL + "            path = due_path(h)")]),
    ("P8 the census records the census hour as every row's bucket", T8,
     [("tools/backlog_census.py", "line = json.dumps({\"bucket\": bucket,", "line = json.dumps({\"bucket\": census_hour,")]),
    ("P8 the move appends no skip record", T8,
     [("tools/move_followup_cursor.py", "            fh.write(json.dumps(rec, sort_keys=True) + ", "            fh.write(\"\" and json.dumps(rec, sort_keys=True) + ")]),
    ("P8 the manifest branch accepts any row", T8,
     [("tools/move_followup_cursor.py", "                if isinstance(r, dict) and r.get(\"name\") == name and r.get(\"sha256\") == sha:",
       "                if isinstance(r, dict):")]),
    ("P8 the skip record is written after the cursor moves", T8,
     [("tools/move_followup_cursor.py", "        save_state(CURSOR, new)" + NL + "        print(\"WRITTEN",
       "        print(\"WRITTEN"),
      ("tools/move_followup_cursor.py", "        rec = {\"moved_at\"", "        save_state(CURSOR, new)" + NL + "        rec = {\"moved_at\"")]),
    ("P11 pagination stops after the first page", T11,
     [("tools/census_cold_versions.py", "        if not start_name:" + NL + "            return out", "        if True:" + NL + "            return out")]),
    ("P11 orphans are not looked for", T11,
     [("tools/census_cold_versions.py", "for v in cold if v.get(\"action\") == \"upload\" and v.get(\"fileId\") not in seen_ids]",
       "for v in cold if False]")]),
    ("P11 hide markers are not listed", T11,
     [("tools/census_cold_versions.py", "             for v in cold if v.get(\"action\") == \"hide\"]", "             for v in cold if False]")]),
    ("P11 manifest/ and proof/ count as cold (orphans)", T11,
     [("tools/census_cold_versions.py", "    cold = [v for v in versions if str(v.get(\"fileName\", \"\")).startswith(co.COLD_PREFIX)]",
       "    cold = [v for v in versions if str(v.get(\"fileName\", \"\")).startswith(co.KEY_PREFIX)]")]),
    ("P11 size and sha1 are not compared", T11,
     [("tools/census_cold_versions.py", "        if v.get(\"fileName\") != row.get(\"b2_name\") or int(v.get(\"contentLength\", -1)) != row.get(\"bytes\") or not sha_ok:",
       "        if v.get(\"fileName\") != row.get(\"b2_name\"):")]),
    ("P11 newest by list order, not uploadTimestamp", T11,
     [("tools/census_cold_versions.py", "        if n not in newest or int(v.get(\"uploadTimestamp\") or 0) > int(newest[n].get(\"uploadTimestamp\") or 0):",
       "        if n not in newest:")]),
    ("P11 an empty manifest beside cold uploads is not refused", T11,
     [("tools/census_cold_versions.py", "    if not rows and any(", "    if False and any(")]),
    ("P11 an unexpected shape exits 1", T11,
     [("tools/census_cold_versions.py", "        print(\"REFUSED: the listing could not be reconciled (%s: %s)\" % (type(exc).__name__, exc), file=sys.stderr)" + NL + "        return 2",
       "        print(\"REFUSED: the listing could not be reconciled (%s: %s)\" % (type(exc).__name__, exc), file=sys.stderr)" + NL + "        return 1")]),
    ("P3 the memory gauge never pages", T11,
     [("summary.py", "    if cap and peak > MEM_WARN_SHARE * cap:", "    if False:")]),
    ("P11 an unreadable manifest line is ignored", T11,
     [("tools/census_cold_versions.py", "    if bad:" + NL + "        print(\"REFUSED: the manifest has", "    if False:" + NL + "        print(\"REFUSED: the manifest has")]),
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
