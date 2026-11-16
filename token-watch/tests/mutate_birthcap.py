#!/usr/bin/env python3
"""B-TOKEN-WATCH-BIRTH-CAP mutants: each safety rule of the birth cap, broken on purpose, must fail test_birthcap.py.
Run from anywhere (CI runs it from the repo root):  python3 token-watch/tests/mutate_birthcap.py
It mutates a SCRATCH COPY of token-watch/ under the home directory and removes it afterwards; never the checkout.
exit 0 = every mutant killed (its test exits non-zero WITH a FAIL line). NOT-APPLIED counts as a failure."""
import os, shutil, subprocess, sys, tempfile

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = tempfile.mkdtemp(prefix="tw-mut-birthcap-", dir=os.path.expanduser("~"))
WORK = os.path.join(SCRATCH, "token-watch")
shutil.copytree(PKG, WORK, ignore=shutil.ignore_patterns("__pycache__"))
os.chdir(WORK)

NL = chr(10)
T = "tests/test_birthcap.py"
MUTANTS = [
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
     [("birthcap.py", '        budget.record_pending("switch", 1, now)               # a GET is charged like a PUT (pre-audit A3)' + NL, "")]),
    ("the hourly vendor cross-check never pages a divergence", T,
     [("birthcap.py", "    if base_n >= BIRTHCAP_DIVERGENCE_MIN and abs(dv_web - expected) / base_n > BIRTHCAP_DIVERGENCE_SHARE:",
       "    if False:")]),
    ("RPC spend above its allowance is not caught", T,
     [("birthcap.py", "    if dv_rpc > 0 and dv_rpc > 1.25 * allow_rpc_hour + (50 if allow_rpc_hour > 0 else 0):", "    if False:")]),
    ("the backstop is skipped in always-on and refused plans (the cap disables itself)", T,
     [("birthcap.py", '    if plan and plan.get("births_allowance_per_day") is not None:',
       '    if plan and not plan.get("refused") and not plan.get("always_on"):')]),
    ("the launch rate is the raw delivered rows (censored by the cap)", T,
     [("birthcap.py", "                rates.append(rows / frac)", "                rates.append(rows)")]),
    ("a webhook divergence does not replan", T,
     [("birthcap.py", "        st[\"replan\"] = True                                   # the webhook leg", "        pass  # the webhook leg")]),
    ("the divergence gate reads the vendor delta only (a frozen counter is never tested)", T,
     [("birthcap.py", "    base_n = max(dv_web, expected)", "    base_n = dv_web")]),
    ("a mid-hour snapshot is compared (false divergence and replan at switch-on)", T,
     [("birthcap.py", "    if snap_at is None or (snap_at - hour_start).total_seconds() > BIRTHCAP_SNAP_OPEN_S:", "    if snap_at is None:")]),
    ("a failed mint discards its pages (no carry)", T,
     [("birthcap.py", '    carry = load_state(CARRY, {}).get("pages", [])', "    carry = []"),
      ("birthcap.py", "    kept = [p for p in failed if now - _ts(p[\"carried_at\"]) <= CARRY_MAX_AGE][-CARRY_MAX:]", "    kept = []")]),
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
        p = subprocess.run([sys.executable, test], capture_output=True, env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"),
                           text=True, timeout=900)
        fails = [l.strip()[:110] for l in p.stdout.splitlines() if l.strip().startswith("FAIL")]
        killed = p.returncode != 0 and bool(fails)
        print(("KILLED  " if killed else "SURVIVED") + " %-70s rc=%d %s" % (name, p.returncode, fails[:1]))
        bad += not killed
        for f in files:
            open(f, "w", encoding="utf-8", newline="").write(orig[f])
finally:
    for f, t in orig.items():
        open(f, "w", encoding="utf-8", newline="").write(t)
    os.chdir(os.path.expanduser("~"))
    shutil.rmtree(SCRATCH, ignore_errors=True)
sys.exit(1 if bad else 0)
