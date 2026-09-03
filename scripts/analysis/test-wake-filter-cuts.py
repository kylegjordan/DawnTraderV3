# -*- coding: utf-8 -*-
"""Behavioural test of the two #995 cuts, run against the LIVE filter as a subprocess with
real tail-format input. ABORTS LOUDLY if the harness cannot run — a test that processes
nothing must never print PASS (the three hand-fed filter tests that read PASS while
processing nothing, recorded in MEMORY)."""
import json, subprocess, sys, io

FILTER = r'C:\Users\kyleg\.claude\cc-wake-filter.py'
LOG = '/var/log/cc-discord-inbox.jsonl'

def row(kind, sender, text):
    return json.dumps({"ts": "2026-09-03T18:00:00+00:00", "source": "discord-cc-bridge",
                       "transport": "discord", "kind": kind, "sender": sender, "text": text})

HB_OK = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: "
         "bridges active: y | inbox-log last-write: 36s ago (recent) | active-unacked alerts: none. "
         "Re-verify your wake watcher is alive (are WAKE events arriving?); re-arm only if dead.")
HB_OK_ALERTS = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: "
                "bridges active: y | inbox-log last-write: 45s ago (recent) | active-unacked alerts: "
                "5 DUE (b1f58a01, 1d1573c7) — please triage. Re-verify your wake watcher is alive.")
HB_BAD = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: "
          "bridges active: n | inbox-log last-write: 9400s ago STALE | active-unacked alerts: none.")
HB_REWORD = ("OLD Claude / NEW Claude — hourly heartbeat: something new we have never emitted before, "
             "please look at it now.")
PUSH_ROUTINE = "OLD Claude / NEW Claude / ANALYST Claude — review branch moved to abc1234. Pull before you push."
LANG_MARKER_MINE = ("NEW Claude — triage done, routing it.\n\n"
                    "[[ALERT id=deadbeef-0000-0000-0000-000000000000 owner=CC-A action=\"look at it\"]]")
LANG_MARKER_MINE_NAMED = ("OLD Claude — triage done, this one is yours.\n\n"
                          "[[ALERT id=deadbeef-0000-0000-0000-000000000000 owner=CC-A action=\"look\"]]")
LANG_MARKER_THEIRS = ("NEW Claude — yours.\n\n"
                      "[[ALERT id=deadbeef-0000-0000-0000-000000000000 owner=CC-B action=\"look\"]]")
LANG_NAMED = "OLD Claude — a plain reply addressed to you, no marker at all."
LANG_OTHER = "NEW Claude — a plain reply addressed to someone else."

CASES = [
    ("cc_outbound", "Heartbeat",   HB_OK,          False, "all-clear heartbeat is SUPPRESSED (the cut)"),
    ("cc_outbound", "Heartbeat",   HB_OK_ALERTS,   False, "all-clear heartbeat listing due alerts is SUPPRESSED (the hook shows them every turn)"),
    ("cc_outbound", "Heartbeat",   HB_BAD,         True,  "POSITIVE CONTROL: a heartbeat reporting a DEAD BRIDGE still wakes"),
    ("cc_outbound", "Heartbeat",   HB_REWORD,      True,  "POSITIVE CONTROL: an unrecognised heartbeat shape still wakes (fail-safe)"),
    ("cc_outbound", "Push notice", PUSH_ROUTINE,   False, "REGRESSION GUARD: routine push notice still suppressed"),
    ("langston_outbound", None,    LANG_MARKER_MINE,       False, "marker owns me but prose names someone else -> no wake (the duplicate, cut)"),
    ("langston_outbound", None,    LANG_MARKER_MINE_NAMED, True,  "POSITIVE CONTROL: marker owns me AND he addresses me -> still wakes"),
    ("langston_outbound", None,    LANG_MARKER_THEIRS,     False, "REGRESSION GUARD: marker owns another session -> still suppressed"),
    ("langston_outbound", None,    LANG_NAMED,             True,  "POSITIVE CONTROL: plain reply addressed to me -> still wakes"),
    ("langston_outbound", None,    LANG_OTHER,             False, "REGRESSION GUARD: plain reply to someone else -> silent"),
]

# ONE SUBPROCESS PER CASE. Attribution is then unambiguous and nothing is appended to the
# input. Two earlier harnesses were void: the first matched on a 30-char prefix that several
# cases SHARED, so one wake was credited to all of them; the second appended a unique token,
# which broke `_ROUTINE_PUSH`'s end-anchor and made a path I never edited look like a
# regression. Both printed a confident FAIL table. A harness that corrupts its own input is
# the same class as one that processes nothing.
def run_one(kind, sender, text):
    stdin = f"==> {LOG} <==\n" + row(kind, sender, text) + "\n"
    p = subprocess.run([sys.executable, FILTER, "CC-A"], input=stdin.encode('utf-8'),
                       capture_output=True, timeout=120)
    if p.returncode != 0:
        print("HARNESS FAILED — filter exited", p.returncode)
        print(p.stderr.decode('utf-8', 'replace')[:800]); sys.exit(2)
    return [l for l in p.stdout.decode('utf-8', 'replace').splitlines() if l.startswith("WAKE[")]

results = [(c, run_one(c[0], c[1], c[2])) for c in CASES]

# The harness must be shown able to emit, or every "silent" below is worthless.
if not any(w for _, w in results):
    print("HARNESS FAILED — the filter emitted NOTHING for ANY case, including the positive")
    print("controls. No result below would be valid."); sys.exit(2)

fails = 0
for (kind, sender, text, expect, label), wakes in results:
    got = bool(wakes)
    ok = (got == expect)
    if not ok: fails += 1
    print(f"  {'PASS' if ok else '** FAIL **':10} expected {'WAKE   ' if expect else 'silent '} got {'WAKE   ' if got else 'silent '}  {label}")
print()
print(f"({sum(1 for _, w in results if w)} of {len(CASES)} cases produced a wake — the instrument speaks)")
print("ALL PASS" if fails == 0 else f"{fails} FAILED")
sys.exit(0 if fails == 0 else 1)
