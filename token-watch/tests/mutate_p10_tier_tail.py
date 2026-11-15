#!/usr/bin/env python3
"""P10 tier-tail fold mutants (B-TOKEN-WATCH-FOLLOWUP-MEMORY, Langston 2026-11-15 `1571573900708679733`).
Run from anywhere (CI runs it from the repo root):  python3 token-watch/tests/mutate_p10_tier_tail.py
It mutates a SCRATCH COPY of token-watch/ in a temp directory, never the checkout.
exit 0 = every mutant killed (its test file exits non-zero WITH a FAIL line). NOT-APPLIED counts as a failure."""
import os, shutil, subprocess, sys, tempfile

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = tempfile.mkdtemp(prefix="tw-mut-p10-", dir=os.path.expanduser("~"))   # beside the test's own scratch
WORK = os.path.join(SCRATCH, "token-watch")
shutil.copytree(PKG, WORK, ignore=shutil.ignore_patterns("__pycache__"))
os.chdir(WORK)

NL = chr(10)
T = "tests/test_p10_tier_tail.py"

# C-6 (i): the tier call moved BELOW the `with periodic_lock` block -- the rejected ExecStartPost shape, in code.
_fu = open("follow_up.py", encoding="utf-8").read()
_s = _fu.index("        tnow = _clock()")
_tail_end = "            stats[\"stage_errors\"].append(\"tier\")" + NL
_e = _fu.index(_tail_end, _s) + len(_tail_end)
_BLOCK = _fu[_s:_e]
_DEDENT = "".join(l[4:] if l.startswith("    ") else l for l in _BLOCK.splitlines(True))
_AFTER = NL + "    LOG.info(\"follow-up %s\", stats)"

MUTANTS = [
    ("the tail never calls tier", T,
     [("follow_up.py", "            if due:" + NL + "                t = tier.run_locked(tnow)", "            if False:" + NL + "                t = tier.run_locked(tnow)")]),
    ("the tail calls tier every run", T,
     [("follow_up.py", "            due, why = tier.tail_due(tnow)", "            due, why = True, \"forced\"")]),
    ("run_locked does not record the completion", T,
     [("tier.py", "    save_state(TIER_STATE, {\"completed_at\": now.isoformat()})" + NL, "")]),
    ("a tier fault in the tail is swallowed", T,
     [("follow_up.py", "            stats[\"tier\"] = {\"error\": str(exc)}" + NL + "            stats[\"stage_errors\"].append(\"tier\")" + NL,
       "            stats[\"tier\"] = {\"error\": str(exc)}" + NL)]),
    ("a tier refusal in the tail is not a stage error", T,
     [("follow_up.py", "                    stats[\"stage_errors\"].append(\"tier refused\")", "                    pass")]),
    ("C-6(i) the tier call sits below the lock block", T,
     [("follow_up.py", _BLOCK + _AFTER, _AFTER[:1] + _DEDENT + _AFTER[1:])]),
    ("C-6(ii) the 04:30Z clause is dropped", T,
     [("tier.py", "    if (now.astimezone(UTC).hour, now.astimezone(UTC).minute) < TIER_TAIL_FROM_UTC:", "    if False:")]),
    ("already completed today is not checked", T,
     [("tier.py", "    if done.astimezone(UTC).date() >= now.astimezone(UTC).date():", "    if False:")]),
    ("C-3 the tail passes the run-start now", T,
     [("follow_up.py", "        tnow = _clock()                 # C-3", "        tnow = now                 # C-3")]),
    ("C-2 a promote fault is not a stage error", T,
     [("follow_up.py", "            stats[\"stage_errors\"].append(\"promote\")", "            pass")]),
    ("C-2 a summary fault is not a stage error", T,
     [("follow_up.py", "            stats[\"stage_errors\"].append(\"summary\")", "            pass")]),
    ("C-2 the exit code ignores stage errors", T,
     [("follow_up.py", "    return 1 if stats.get(\"errors\") or stats.get(\"stage_errors\") else 0", "    return 1 if stats.get(\"errors\") else 0")]),
    ("C-4 the timer takes the lock though the record is fresh", T,
     [("tier.py", "    if age is not None and age <= TIER_SKIP_STALE_AFTER:", "    if False:")]),
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
        p = subprocess.run([sys.executable, test], capture_output=True, env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"), text=True, timeout=900)
        fails = [l.strip()[:110] for l in p.stdout.splitlines() if l.strip().startswith("FAIL")]
        killed = p.returncode != 0 and bool(fails)
        print(("KILLED  " if killed else "SURVIVED") + " %-55s rc=%d %s" % (name, p.returncode, fails[:1]))
        bad += not killed
        for f in files:
            open(f, "w", encoding="utf-8", newline="").write(orig[f])
finally:
    for f, t in orig.items():
        open(f, "w", encoding="utf-8", newline="").write(t)
    os.chdir(os.path.expanduser("~"))
    shutil.rmtree(SCRATCH, ignore_errors=True)        # the copy is removed, never left behind (Langston nit)
sys.exit(1 if bad else 0)
