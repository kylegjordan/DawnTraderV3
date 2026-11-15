#!/usr/bin/env python3
"""P7 mutants (B-TOKEN-WATCH-FOLLOWUP-MEMORY, OBJ-5). Run from token-watch/ on a scratch COPY of the tree:
    python3 tests/mutate_p7.py
exit 0 = every mutant killed (its test file exits non-zero WITH a FAIL line). NOT-APPLIED counts as a failure."""
import subprocess, sys

NL = chr(10)
TF = "tests/test_p7_obs_fold.py"
TS = "tests/test_p7_states.py"
TB = "tests/test_p7_birth_stamp.py"
MUTANTS = [
    # the fold
    ("fold: a shed row is not recognised", TF, [("obs_fold.py", "    if \"shed\" in r:" + NL + "        return \"shed\"",
                                                 "    if False:" + NL + "        return \"shed\"")]),
    ("fold: created_at is ignored", TF, [("obs_fold.py", "    t = _parse(r.get(\"created_at\"))" + NL + "    if t is not None:",
                                          "    t = None" + NL + "    if t is not None:")]),
    ("fold: due_at is ignored", TF, [("obs_fold.py", "    t = _parse(r.get(\"due_at\"))", "    t = None")]),
    ("fold: a half-written line is consumed", TF, [("obs_fold.py", "            if not raw.endswith(b\"\\n\"):" + NL + "                return",
                                                    "            if False:" + NL + "                return")]),
    ("fold: a shrunk file is not rebuilt", TF, [("obs_fold.py", "        why = (\"shrank\" if size < cur else", "        why = (\"shrank\" if False else")]),
    ("fold: receiver rows count as job liveness", TF,
     [("obs_fold.py", "if hour is not None and hour >= keep_from and shape != \"scheduled_in_the_past\":",
       "if hour is not None and hour >= keep_from:")]),
    ("fold: the member's alive flag is not carried", TS,
     [("obs_fold.py", "m[\"obs\"][label] = {\"at\": seen, \"alive\": r.get(\"alive\") is True}",
       "m[\"obs\"][label] = {\"at\": seen, \"alive\": True}")]),
    # D1
    ("D1: a checkpoint not yet due counts", TF, [("obs_fold.py", "            if end + OFFSET[label] > now:" + NL + "                continue" + NL + "            due_n",
                                                  "            if False:" + NL + "                continue" + NL + "            due_n")]),
    ("D1: blind = any empty checkpoint", TF, [("obs_fold.py", "if empty_n.get(d, 0) == n)", "if empty_n.get(d, 0) >= 1)")]),
    # D2
    ("D2: a shed row is liveness (CHANGE-3 as first worded)", TS,
     [("obs_fold.py", "    if covered_any > 0:" + NL + "        job_state = \"observing\"", "    if covered_any > 0 or any_rows > 0:" + NL + "        job_state = \"observing\"")]),
    ("D2: a job fault reads as N stale checkpoints", TS,
     [("obs_fold.py", "rec[\"state\"] = \"stale\" if job_state in (\"observing\", \"nothing_due\") else \"job_\" + job_state", "rec[\"state\"] = \"stale\"")]),
    ("D2: a lagging births fold reads as nothing due", TS,
     [("obs_fold.py", "        if through is None or _hour(hours[-1] - OFFSET[L]) > _hour(through):", "        if through is None:")]),
    ("D2: the trigger waits for a full K run", TS, [("obs_fold.py", "rec[\"rederive_due\"] = run >= k - 1", "rec[\"rederive_due\"] = run >= k")]),
    ("D2: a job fault counts toward a checkpoint's run", TS,
     [("obs_fold.py", "if _due(born_by_hour, h, L) > 0 and not obs[\"hourly\"].get(L, {}).get(hk) and _covered_any(obs, hk):",
       "if _due(born_by_hour, h, L) > 0 and not obs[\"hourly\"].get(L, {}).get(hk):")]),
    ("D2: no not_yet_due", TS, [("obs_fold.py", "        if first is None or first + OFFSET[L] > now:", "        if first is None:")]),
    ("D2: no never_instrumented", TS, [("obs_fold.py", "        if not obs[\"last_observed_at\"].get(L):" + NL + "            rec[\"state\"] = \"never_instrumented\"",
                                        "        if False:" + NL + "            rec[\"state\"] = \"never_instrumented\"")]),
    ("D2: the cadence ignores the randomized delay", TS, [("obs_fold.py", "\"cycle_s\": 3600 + delay}", "\"cycle_s\": 3600}")]),
    ("C1: a job fault never pages", TS, [("obs_fold.py", "    return JOB_FAULT_EXIT" + NL, "    return 0" + NL)]),
    ("C1: a switched-off job pages", TS, [("obs_fold.py", "    if switch == \"disabled\":", "    if False:")]),
    ("C1: the bound is not published", TS, [("obs_fold.py", "                  \"pages_after_s\": win_job}", "                  }")]),
    ("C2: an underived K reads as measured", TS, [("obs_fold.py", "\"floor_bound\": w.get(\"floor_bound\", True),",
                                                  "\"floor_bound\": w.get(\"floor_bound\", False),")]),
    ("C1: the switch is not published", TS, [("summary.py", "        states[\"job\"][\"switch\"] = obs_fold.timer_switch()" + NL, "        pass" + NL)]),
    ("C-A: an unreadable cadence does not page", TS, [("obs_fold.py", "        return CADENCE_UNKNOWN_EXIT" + NL, "        return 0" + NL)]),
    ("C-A: the survivor table guesses a cycle", TS, [("summary.py", "    settle = None if cadence is None else {L: rec[\"window_s\"]",
                                                      "    settle = {L: 11700 for L in states[\"labels\"]} if cadence is None else {L: rec[\"window_s\"]")]),
    ("C-A: only the word 'hourly' is understood", TS, [("obs_fold.py", "r\"^(hourly|\\*-\\*-\\* \\*:[0-5][0-9]:00( UTC)?)$\"", "r\"^(hourly)$\"")]),
    ("C-A: an unloaded unit reads as a cadence", TS, [("obs_fold.py", "    if not loaded or len(cal) != 1", "    if len(cal) != 1")]),
    ("watch: grown keyed on nothing", TS, [("obs_fold.py", "    grown = births_folded > int(watch.get(\"births_folded_at_seed\") or 0)", "    grown = False")]),
    ("Q3: the job verdict waits for the widest window", TS, [("obs_fold.py", "    win_job = K_FLOOR * cadence[\"cycle_s\"]", "    win_job = max(windows.values())")]),
    ("Q3: nothing due reads as observing", TS, [("obs_fold.py", "        job_state = \"nothing_due\"", "        job_state = \"observing\"")]),
    ("Q2: the reason does not name the silent feed", TS, [("obs_fold.py", "            rec[\"reason\"] = \"feed_silent\"", "            rec[\"reason\"] = \"fold_lag\"")]),
    ("Q1: a regrown file is not caught", TF, [("obs_fold.py", "\"first line changed\" if o[\"heads\"].get(name) and head != o[\"heads\"][name] else None)", "None)")]),
    ("Q1: the rebuild does not record what it lost", TF, [("obs_fold.py", "\"bytes_lost_at_least\": max(0, cur - size)}", "}")]),
    ("summary stream: reads to the end, not line by line", "tests/test_p7_summary_stream.py",
     [("summary.py", "                self.end += len(raw)" + NL, "                self.end = size" + NL)]),
    # D4
    ("D4: the settle window is ignored", TS, [("obs_fold.py", "t + OFFSET[L] + timedelta(seconds=settle_s.get(L, 0)) <= now",
                                               "t + OFFSET[L] <= now")]),
    ("D4: a non-member is called never_observed", TS,
     [("obs_fold.py", "        return {\"status\": \"unknown\", \"reason\": \"not in the watch set\"}", "        return {\"status\": \"never_observed\"}")]),
    ("D4: seen-but-not-alive is verified", TS,
     [("obs_fold.py", "\"verified_alive\" if (o is not None and o.get(\"alive\")) else", "\"verified_alive\" if (o is not None) else")]),
    ("D4: the set rebuilds whenever depleted", TS,
     [("obs_fold.py", "    return \"rebuilt\" if (watch.get(\"capped\") or grown) else None", "    return \"rebuilt\"")]),
    ("D4: a re-seed keeps the old fold (members get no history)", TS,
     [("summary.py", "            st[\"obs\"] = None" + NL, "")]),
    # the derivation
    ("derive: shed-only hours are liveness", TS, [("tools/derive_obs_window.py", "            if not due or not looked.get(hk):",
                                                   "            if not due or not any_rows.get(hk):")]),
    ("derive: floor_bound is mis-set", TS, [("tools/derive_obs_window.py", "or run + 2 <= obs_fold.K_FLOOR,", "or run + 2 < obs_fold.K_FLOOR,")]),
    ("derive: overwrites without --replace", TS, [("tools/derive_obs_window.py", "        if a.apply and existing and not a.replace:", "        if False:")]),
    # C-1 and C-2
    ("C-1: the observation write is not stamped", TB, [("follow_up.py", "            fields.update(_birth(entry))", "            pass")]),
    ("C-1: the shed row is not stamped", TB, [("follow_up.py", "dict({\"shed\": str(s), \"observed\": False}, **_birth(entry))",
                                               "{\"shed\": str(s), \"observed\": False}")]),
    ("C-1: the error row is not stamped", TB, [("follow_up.py", "                    **_birth(entry)," + NL, "")]),
    ("C-1: the fifth writer is not stamped", TB, [("store.py", "                \"created_at\": created_at.astimezone(UTC).isoformat()," + NL, "")]),
    ("C-2: the lag forgets the bucket is an hour long", TF,
     [("summary.py", "        end = datetime.strptime(last, \"%Y-%m-%dT%H\").replace(tzinfo=UTC) + timedelta(hours=1)",
       "        end = datetime.strptime(last, \"%Y-%m-%dT%H\").replace(tzinfo=UTC)")]),
]


def main():
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
            print(("KILLED  " if killed else "SURVIVED") + " %-58s rc=%d %s" % (name, p.returncode, fails[:1]))
            bad += not killed
            for f in files:
                open(f, "w", encoding="utf-8", newline="").write(orig[f])
    finally:
        for f, t in orig.items():
            open(f, "w", encoding="utf-8", newline="").write(t)
    print("%d mutants, %d not killed" % (len(MUTANTS), bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
