#!/usr/bin/env python3
"""B-TOKEN-WATCH-BIRTH-CAP mutants: each safety rule of the birth cap, broken on purpose, must fail test_birthcap.py.
Run from anywhere (CI runs it from the repo root):  python3 token-watch/tests/mutate_birthcap.py
It mutates a SCRATCH COPY of token-watch/ under the home directory and removes it afterwards; never the checkout.
exit 0 = every mutant killed (its test exits non-zero WITH a FAIL line). NOT-APPLIED counts as a failure."""
import os, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = tempfile.mkdtemp(prefix="tw-mut-birthcap-", dir=os.path.expanduser("~"))
# Mutants run CONCURRENTLY, each in its OWN copy of token-watch/ (the suite makes its own store root, so copies share
# nothing). Run one at a time the 89 mutants took ~10 min and CI's 22-min Test Suite was cancelled by every push that
# landed inside it. MUTANT_WORKERS overrides the pool size (1 = the old serial behaviour).
WORKERS = max(1, int(os.environ.get("MUTANT_WORKERS") or (os.cpu_count() or 2)))

NL = chr(10)
T = "tests/test_birthcap.py"
MUTANTS = [
    # ── the ON-window compare (Langston 2026-11-20, Discord 1573176718766637057) ──
    ("the window snapshot includes the ON switch's own credits", T,
     [("birthcap.py", '        web = int(usage["credits"]["webhooks"])' + NL, '        web = int(usage["credits"]["webhooks"]) + 100' + NL)]),
    ("a divergent hour does not replan", T,
     [("birthcap.py", '        _flag_replan(st, "divergence-hour:%s" % prev)', '        pass')]),
    ("an hourly frozen meter is reported as a divergence", T,
     [("birthcap.py", '    elif dv_web - switch_cr <= 0 and births >= BIRTHCAP_DIVERGENCE_MIN:', '    elif False:')]),
    ("a window frozen meter is reported as a divergence", T,
     [("birthcap.py", '    elif dv - switch_cr <= 0 and births >= BIRTHCAP_DIVERGENCE_MIN:', '    elif False:')]),
    ("the quiet check ignores a birth after the grace", T,
     [("birthcap.py", '            last = m' + NL, '            pass' + NL)]),
    ("a window that never goes quiet is never compared", T,
     [("birthcap.py", '        if not quiet and now < off + timedelta(seconds=BIRTHCAP_WINDOW_QUIET_MAX_S):', '        if not quiet:')]),
    ("the no-OFF bound is a wall-clock constant, not the plan's blocks", T,
     [("birthcap.py", '    block = plan.get("block_s") or (86400.0 / BIRTHCAP_W_MIN)', '    block = 86400.0 / BIRTHCAP_W_MIN')]),
    ("a counter reset inside a window pages as a divergence", T,
     [("birthcap.py", '    elif row["reset_test"]:', '    elif False:')]),
    ("a reset window stays in the cumulative leg", T,
     [("birthcap.py", 'summed = [r for r in kept if r.get("verdict") not in ("reset", "frozen", "backwards", "unpaired")]',
       'summed = [r for r in kept if r.get("verdict") not in ("frozen", "backwards", "unpaired")]')]),
    ("a counter reset inside an hour replans as a divergence", T,
     [("birthcap.py", '    reset = reset_test is not None', '    reset = False')]),
    ("a cycle change with a positive delta is read as a spend", T,
     [("birthcap.py", '        return "cycle" if cycle_then != cycle_now else None', '        return None')]),
    ("a negative delta is not read as a reset", T,
     [("birthcap.py", '    return "negative-delta" if delta < 0 else None' + NL, '    return None' + NL)]),
    ("an ON window does not record its cycle", T,
     [("birthcap.py", '"web": web, "cycle": cycle, "reason": reason,', '"web": web, "reason": reason,')]),
    ("a cut window does not carry its cycle", T,
     [("birthcap.py", '"web": web_now, "cycle": cycle_now, "reason": "cut",', '"web": web_now, "reason": "cut",')]),
    ("the hourly snapshot does not record its cycle", T,
     [("birthcap.py", '           "cycle": _cycle_of(usage)}', '           "cycle": None}')]),
    ("an rpc overrun pages across a reset", T,
     [("birthcap.py", 'if not reset and dv_rpc > 0 and', 'if dv_rpc > 0 and')]),
    ("the cumulative leg is two-sided", T,
     [("birthcap.py", '(cv - ce) / ce > BIRTHCAP_CUMULATIVE_OVER_SHARE', 'abs(cv - ce) / ce > BIRTHCAP_CUMULATIVE_OVER_SHARE')]),
    ("the cumulative leg never pages", T,
     [("birthcap.py", '    if ce >= BIRTHCAP_CUMULATIVE_MIN and', '    if False and')]),
    ("rows older than 72 h stay in the cumulative leg", T,
     [("birthcap.py", 'if _ts(r["closed_at"]) >= cutoff] + [row]', 'if True] + [row]')]),
    ("a replan is not recorded", T,
     [("birthcap.py", '            st.setdefault("replans", []).append(', '            [].append(')]),
    ("a window still waiting after its OFF is lost when the feed switches back ON", T,
     [("birthcap.py", '    if prev and prev.get("off_at") and pages is not None:', '    if False:')]),
    ("the hour row carries no verdict", T,
     [("birthcap.py", '                   "share": share, "verdict": verdict, "paged": paged,' + NL, '')]),
    ("the plan accepts an on-window too short to see a failed switch-ON", T,
     [("birthcap.py", "        if on_s > LIVENESS_GAP_SECONDS:", "        if on_s > 0:")]),
    ("the daily allowance is not clamped to the births reserve", T,
     [("birthcap.py", "                    float(BIRTHCAP_MAX_BIRTHS_PER_DAY))", "                    float(10 ** 9))")]),
    ("the phase never rotates (the same hours are missed every day)", T,
     [("birthcap.py", "    offset = (day_index * BIRTHCAP_PHASE_STEP % 1.0) * block", "    offset = 0.0")]),
    ("an unconfirmed echo is taken as a successful switch", T,
     [("birthcap.py", '        rec["ok"] = (resp.get("active") is (target == "on")) and rec["echo_auth_set"] and rec["echo_url_ok"]',
       '        rec["ok"] = True')]),
    ("an unreadable switch log does not force the feed ON", T,
     [("birthcap.py", '        records, want = None, "on"', '        records = None')]),
    ("the liveness handshake is not checked", T,
     [("birthcap.py", '    if not getattr(liveness, "PLANNED_OFF_READER", False):', '    if False:')]),
    ("the breaker never trips", T,
     [("birthcap.py", '        if used >= ceiling and want == "off":', '        if False:')]),
    ("a failing switch back ON is never capped (100 credits a minute)", T,
     [("birthcap.py", "        elif used >= hard:", "        elif False:")]),
    ("an unreadable switch log uncaps the vendor calls (no state counter)", T,
     [("birthcap.py", "            calls[today] = int(calls.get(today, 0)) + 1" + NL + "            _append(BIRTHCAP_SWITCHES, rec)",
       "            _append(BIRTHCAP_SWITCHES, rec)")]),
    ("births arriving while OFF never page", T,
     [("birthcap.py", "        if hits:", "        if False:")]),
    ("the in-flight grace is dropped (a decaying tail pages)", T,
     [("birthcap.py", "    first = off_at + timedelta(seconds=BIRTHCAP_OFF_GRACE_S)", "    first = off_at")]),
    ("disabling leaves the feed OFF", T,
     [("birthcap.py", '        if st.get("applied") != "on":', '        if False:')]),
    ("disabling restores only a known OFF (an unknown state stays dark)", T,
     [("birthcap.py", '        if st.get("applied") != "on":', '        if st.get("applied") == "off":')]),
    ("the disabled restore does not bump the state counter", T,
     [("birthcap.py", "                calls[today] = int(calls.get(today, 0)) + 1      # C-2", "                pass  # C-2")]),
    ("the backstop never truncates a day", T,
     [("birthcap.py", '        if st.get("days", {}).get(today, 0) >= float(plan["births_allowance_per_day"]):', '        if False:')]),
    ("a GET to re-learn the state is not charged", T,
     [("birthcap.py", '        _charge_switch(st, rec, now)                          # a GET is charged like a PUT (pre-audit A3)' + NL, "")]),
    # ── §9e Part B: switch credits pair to the ON window by CODE ORDER (a counter), never by requested_at ──
    ("a GET charges the budget but not the window counter (the old ledger-only charge)", T,
     [("birthcap.py", '        _charge_switch(st, rec, now)                          # a GET is charged like a PUT (pre-audit A3)' + NL,
       '        budget.record_pending("switch", 1, now)' + NL)]),
    ("the switch-credit counter never advances", T,
     [("birthcap.py", '        st["switch_charged"] = int(st.get("switch_charged", 0)) + cr', '        pass')]),
    ("an ON window does not snapshot the counter at its meter read", T,
     [("birthcap.py", '"reason": reason,' + NL + '                    "sw": int(st.get("switch_charged", 0)),',
       '"reason": reason,' + NL + '                    "sw": 0,')]),
    ("a cut window does not snapshot the counter at its meter read", T,
     [("birthcap.py", '"reason": "cut",' + NL + '                        "sw": int(st.get("switch_charged", 0)),',
       '"reason": "cut",' + NL + '                        "sw": 0,')]),
    ("a billed disabled restore is charged to neither the ledger nor the window counter", T,
     [("birthcap.py", "                _charge_switch(st, rec, now)" + NL + '                st["applied"] = "on" if rec.get("ok") else None',
       "                pass" + NL + '                st["applied"] = "on" if rec.get("ok") else None')]),
    ("a pre-counter window is compared as if paired (the install transition throws)", T,
     [("birthcap.py", "    if not paired:" + NL + "        # ⛔ A WINDOW OPENED BEFORE", "    if False:" + NL + "        # ⛔ A WINDOW OPENED BEFORE"),
      ("birthcap.py", "int(w[\"sw\"]) if paired else 0", "int(w[\"sw\"])")]),
    ("an unpaired window stays in the cumulative leg", T,
     [("birthcap.py", "\"backwards\", \"unpaired\")]", "\"backwards\")]")]),
    ("the window compare drops the switch credits", T,
     [("birthcap.py", '    switch_cr = int(st.get("switch_charged", 0)) - int(w["sw"])', '    switch_cr = 0')]),
    ("the hourly divergence is never evaluated (re-anchored: the hour now replans and records, the window pages)", T,
     [("birthcap.py", "    elif base_n >= BIRTHCAP_DIVERGENCE_MIN and abs(dv_web - expected) / base_n > BIRTHCAP_DIVERGENCE_SHARE:",
       "    elif False:")]),
    ("RPC spend above its allowance is not caught", T,
     [("birthcap.py", "    if not reset and dv_rpc > 0 and dv_rpc > 1.25 * allow_rpc_hour + (50 if allow_rpc_hour > 0 else 0):", "    if False:")]),
    ("the backstop is skipped in always-on and refused plans (the cap disables itself)", T,
     [("birthcap.py", '    if plan and plan.get("births_allowance_per_day") is not None:',
       '    if plan and not plan.get("refused") and not plan.get("always_on"):')]),
    ("the launch rate is the raw delivered rows (censored by the cap)", T,
     [("birthcap.py", "                rates.append(rows / frac)", "                rates.append(rows)")]),
    # (retired: "a webhook divergence does not replan" - superseded by "a divergent hour does not replan" above)
    ("the divergence gate reads the vendor delta only (a frozen counter is never tested)", T,
     [("birthcap.py", "    base_n = max(dv_web, expected)", "    base_n = dv_web")]),
    ("a mid-hour snapshot is compared (false divergence and replan at switch-on)", T,
     [("birthcap.py", "    if snap_at is None or (snap_at - hour_start).total_seconds() > BIRTHCAP_SNAP_OPEN_S:", "    if snap_at is None:")]),
    ("a failed mint discards its pages (no carry)", T,
     [("birthcap.py", '    carry = load_state(CARRY, {}).get("pages", [])', "    carry = []"),
      ("birthcap.py", "    kept = [p for p in failed if now - _ts(p[\"carried_at\"]) <= CARRY_MAX_AGE][:CARRY_MAX]", "    kept = []")]),
    ("the count bound keeps the OLDEST (evicts the new pages)", T,
     [("birthcap.py", "<= CARRY_MAX_AGE][:CARRY_MAX]", "<= CARRY_MAX_AGE][-CARRY_MAX:]")]),
    ("a re-raised key is re-stamped now (the 24 h bound never binds)", T,
     [("birthcap.py", "            at[k] = min(at[k], stamp, key=_ts)", "            at[k] = max(at[k], stamp, key=_ts)")]),
    ("no mint budget (a slow call chain runs past the unit timeout)", T,
     [("birthcap.py", "        if clock() - start > budget:", "        if False:")]),
    ("the mint budget is not anchored to the tick's start", T,
     [("birthcap.py", "    budget = min(float(MINT_BUDGET_S),", "    budget = max(float(MINT_BUDGET_S),")]),
    ("after the group kill, communicate() again (blocks on an escaped descendant's pipe)", T,
     [("birthcap.py", "            proc.wait()" + NL + "            raise", "            proc.communicate()" + NL + "            raise")]),
    ("the per-call timeout is not cut", T,
     [("birthcap.py", '    timeout = min(float(kw.pop("timeout", None) or MINT_CALL_TIMEOUT_S), float(MINT_CALL_TIMEOUT_S))',
       '    timeout = float(kw.pop("timeout", None) or MINT_CALL_TIMEOUT_S)')]),
    ("a timeout kills only the child (the grandchild survives)", T,
     [("birthcap.py", "                os.killpg(proc.pid, signal.SIGKILL)", "                proc.kill()")]),
    ("a deferral is silent", T,
     [("birthcap.py", "    if untried:", "    if False:")]),
    ("a hand-run mint gets the unit's (zero) budget", T,
     [("birthcap.py", '    if not os.environ.get("INVOCATION_ID"):', "    if False:")]),
    ("floor_binds reads True where the floor was abandoned", T,
     [("birthcap.py", "rule_w < BIRTHCAP_W_MIN and w == BIRTHCAP_W_MIN", "rule_w < BIRTHCAP_W_MIN")]),
    ("liveness ignores planned windows (a planned off window pages as a dead feed)", T,
     [("liveness.py", "            covered = planned_overlap(prev, ts, windows) if delta > LIVENESS_GAP_SECONDS else 0.0",
       "            covered = 0.0")]),
    ("a gap 'recovers' with no row arrived (B-1)", T,
     [("liveness.py", '        elif open_gap and last_dt <= datetime.fromisoformat(open_gap["started_at"]):', "        elif False:")]),
    ("a failed OFF keeps its planned window (B-2)", T,
     [("liveness.py", "            b = ts" + NL, "            pass" + NL)]),
    ("a dead controller's OFF stays planned to the full bound", T,
     [("liveness.py", "            end = min(end, max(off, alive_until)", "            end = max(end, max(off, alive_until)")]),
    ("an OFF with no ON stays planned forever (the dead-man goes blind)", T,
     [("liveness.py", "        end = max(midnight, off + timedelta(seconds=MAX_BLOCK_S))",
       "        end = max(midnight, off + timedelta(days=3650))")]),
    # ── the §9e fix round (Langston 2026-11-20, Discord 1573311142691078216) ──
    ("an hourly same-cycle backwards meter is not detected", T,
     [("birthcap.py", '    elif _backwards(dv_web, snap.get("cycle"), cur["cycle"]):', '    elif False:')]),
    ("a window same-cycle backwards meter is not detected", T,
     [("birthcap.py", '    elif _backwards(dv, w.get("cycle"), cycle_now):', '    elif False:')]),
    ("a same-cycle negative delta is read as a reset", T,
     [("birthcap.py", '        return "cycle" if cycle_then != cycle_now else None',
       '        return "cycle" if cycle_then != cycle_now else ("negative-delta" if delta < 0 else None)')]),
    ("an hourly backwards meter does not replan", T,
     [("birthcap.py", '        _flag_replan(st, "backwards-meter:%s" % prev)', '        pass')]),
    ("an hourly frozen meter ignores the switch credits", T,
     [("birthcap.py", '    elif dv_web - switch_cr <= 0 and births >= BIRTHCAP_DIVERGENCE_MIN:',
       '    elif dv_web <= 0 and births >= BIRTHCAP_DIVERGENCE_MIN:')]),
    ("a window frozen meter ignores the switch credits", T,
     [("birthcap.py", '    elif dv - switch_cr <= 0 and births >= BIRTHCAP_DIVERGENCE_MIN:',
       '    elif dv <= 0 and births >= BIRTHCAP_DIVERGENCE_MIN:')]),
    ("an hourly frozen meter is gated on births + switches (an hour of switches reads frozen)", T,
     [("birthcap.py", '    elif dv_web - switch_cr <= 0 and births >= BIRTHCAP_DIVERGENCE_MIN:',
       '    elif dv_web - switch_cr <= 0 and expected >= BIRTHCAP_DIVERGENCE_MIN:')]),
    ("a window frozen meter is gated on births + switches", T,
     [("birthcap.py", '    elif dv - switch_cr <= 0 and births >= BIRTHCAP_DIVERGENCE_MIN:',
       '    elif dv - switch_cr <= 0 and expected >= BIRTHCAP_DIVERGENCE_MIN:')]),
    ("a frozen window stays in the cumulative leg", T,
     [("birthcap.py", 'summed = [r for r in kept if r.get("verdict") not in ("reset", "frozen", "backwards", "unpaired")]',
       'summed = [r for r in kept if r.get("verdict") not in ("reset", "backwards", "unpaired")]')]),
    ("a backwards window stays in the cumulative leg", T,
     [("birthcap.py", 'summed = [r for r in kept if r.get("verdict") not in ("reset", "frozen", "backwards", "unpaired")]',
       'summed = [r for r in kept if r.get("verdict") not in ("reset", "frozen", "unpaired")]')]),
    ("meter-fault windows are not counted aside", T,
     [("birthcap.py", 'r.get("verdict") in ("frozen", "backwards"))}', 'r.get("verdict") in ("frozen",))}')]),
    ("a second replan reason overwrites the first", T,
     [("birthcap.py", '        st["replan"] = prev + "+" + reason', '        st["replan"] = reason')]),
    ("a replan reason raised twice is repeated", T,
     [("birthcap.py", '    elif reason not in prev.split("+"):', '    else:')]),
    ("a legacy True pending replan is not read as manual", T,
     [("birthcap.py", '    if prev is True:' + NL + '        prev = "manual"' + NL, '')]),
    ("an rpc overrun is recorded as not paged", T,
     [("birthcap.py", '        _flag_replan(st, "rpc-overrun:%s" % prev)' + NL + '        paged = True' + NL,
       '        _flag_replan(st, "rpc-overrun:%s" % prev)' + NL)]),
    ("the hour row does not record which reset test fired", T,
     [("birthcap.py", '                   "reset_test": reset_test}', '                   }')]),
    ("the window row does not record which reset test fired", T,
     [("birthcap.py", '    row["reset_test"] = _reset_test(dv, w.get("cycle"), cycle_now)' + NL, ''),
      ("birthcap.py", '    elif row["reset_test"]:', '    elif _reset_test(dv, w.get("cycle"), cycle_now):')]),
    ("--replan records True, not manual", T,
     [("birthcap.py", '        _flag_replan(st, "manual")', '        st["replan"] = True')]),
    ("--status reads through load_state (an unreadable state prints null, rc 0)", T,
     [("birthcap.py", '        try:' + NL + '            with open(path, "r", encoding="utf-8") as fh:' + NL +
       '                st = json.load(fh)' + NL + '        except (OSError, ValueError) as exc:' + NL +
       '            print("birthcap --status: cannot read %s: %s" % (path, exc), file=sys.stderr)' + NL +
       '            return 1' + NL, '        st = load_state(STATE, {})' + NL)]),
    ("--status prints the whole history, not its tail", T,
     [("birthcap.py", 'STATUS_TAIL = 12 ', 'STATUS_TAIL = 100000 ')]),
    ("--status omits the pending replan", T,
     [("birthcap.py", ' "pending_replan": st.get("replan"),', '')]),
]
files = sorted({f for _n, _t, edits in MUTANTS for f, _a, _b in edits})
orig = {f: open(os.path.join(PKG, f), encoding="utf-8").read() for f in files}


def run_mutant(idx):
    """One mutant in its own scratch copy. Returns (line, bad). Never touches the checkout or another mutant's copy."""
    name, test, edits = MUTANTS[idx]
    texts = dict(orig)
    for f, a, b in edits:
        if texts[f].count(a) != 1:
            return "NOT-APPLIED %s (anchor count %d in %s)" % (name, texts[f].count(a), f), True
        texts[f] = texts[f].replace(a, b)
    work = os.path.join(SCRATCH, "m%03d" % idx, "token-watch")
    try:
        shutil.copytree(PKG, work, ignore=shutil.ignore_patterns("__pycache__"))
        for f in files:
            if texts[f] != orig[f]:
                open(os.path.join(work, f), "w", encoding="utf-8", newline="").write(texts[f])
        p = subprocess.run([sys.executable, test], cwd=work, capture_output=True,
                           env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"), text=True, timeout=900)
    finally:
        shutil.rmtree(os.path.dirname(work), ignore_errors=True)
    fails = [l.strip()[:110] for l in p.stdout.splitlines() if l.strip().startswith("FAIL")]
    killed = p.returncode != 0 and bool(fails)
    return ("KILLED  " if killed else "SURVIVED") + " %-70s rc=%d %s" % (name, p.returncode, fails[:1]), not killed


bad = 0
try:
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(run_mutant, range(len(MUTANTS))))    # map keeps MUTANTS order in the report
    for line, is_bad in results:
        print(line)
        bad += is_bad
finally:
    shutil.rmtree(SCRATCH, ignore_errors=True)
print("%d of %d killed (%d workers)" % (len(MUTANTS) - bad, len(MUTANTS), WORKERS))
sys.exit(1 if bad else 0)
