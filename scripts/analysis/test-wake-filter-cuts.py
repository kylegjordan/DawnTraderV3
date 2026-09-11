# -*- coding: utf-8 -*-
"""Behavioural test of the two #995 cuts, run against the LIVE filter as a subprocess with
real tail-format input. ABORTS LOUDLY if the harness cannot run — a test that processes
nothing must never print PASS (the three hand-fed filter tests that read PASS while
processing nothing, recorded in MEMORY)."""
import json, subprocess, sys, io

# argv[1] runs the suite against another copy - the repo file BEFORE it is installed, or the live
# file to show which new cases the unfixed filter FAILS (B-WAKE-LEAD-NAME).
FILTER = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\kyleg\.claude\cc-wake-filter.py'
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
# Langston Step-4 Q2: all 13 live deliveries came through the STALE arm and SIX were negations.
HB_NOT_STALE = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: "
                "bridges active: y | inbox-log last-write: quiet but not stale | "
                "active-unacked alerts: none.")
HB_BORDERLINE = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: "
                 "bridges active: y | inbox-log last-write: borderline stale | "
                 "active-unacked alerts: none.")
PUSH_ROUTINE = "OLD Claude / NEW Claude / ANALYST Claude — review branch moved to abc1234. Pull before you push."
LANG_MARKER_MINE = ("NEW Claude — triage done, routing it.\n\n"
                    "[[ALERT id=deadbeef-0000-0000-0000-000000000000 owner=CC-A action=\"look at it\"]]")
LANG_MARKER_MINE_NAMED = ("OLD Claude — triage done, this one is yours.\n\n"
                          "[[ALERT id=deadbeef-0000-0000-0000-000000000000 owner=CC-A action=\"look\"]]")
LANG_MARKER_THEIRS = ("NEW Claude — yours.\n\n"
                      "[[ALERT id=deadbeef-0000-0000-0000-000000000000 owner=CC-B action=\"look\"]]")
LANG_NAMED = "OLD Claude — a plain reply addressed to you, no marker at all."
# Langston FINDING-5: the r2 change with the largest blast radius had NO test. Deciding on
# the FULL body flips ~118 of 2,820 of his replies from silent to waking, and the only
# reason the marker-strip defect surfaced was that it re-broke an EXISTING assertion — the
# new behaviour itself was unasserted. This is the case someone regresses by reinstating
# `text` for "consistency".
LANG_NAME_LATE = ("Kyle — a long reply that does not name any session for a while. "
                  + ("Filler that pushes the name past the 400-character truncation. " * 8)
                  + "OLD Claude, this part is for you.")
LANG_OTHER = "NEW Claude — a plain reply addressed to someone else."
# B-WAKE-LEAD-NAME (#1040) — scope OBJ-2 (a)(b)(c) and Langston's Step-2 conditions 3, 4, 5.
MARK = lambda owner: "\n\n[[ALERT id=deadbeef-0000-0000-0000-000000000000 owner=" + owner + " action=\"look\"]]"
LEAD_A = "OLD Claude — here is the answer to your dispatch; the r2 is fine." + MARK("CC-B")
LEAD_B = "Kyle — a reply to you. OLD Claude, this bit is for you as well." + MARK("CC-B")
LEAD_C = "NEW Claude — here is the answer to your question." + MARK("CC-A")
LEAD_OUT_OF_SET = "NEW Claude — triage done." + MARK("OLD-Claude")
LEAD_LOWER = "OLD Claude — yours, in prose." + MARK("cc-b")
LEAD_MENTION = "OLD Claude's r2 is fine, but NEW Claude — this one is yours." + MARK("CC-B")
LEAD_TWO_OWNERS = "OLD Claude — your answer, plus two alert notes." + MARK("CC-C") + MARK("CC-B") + MARK("CC-C")
LEAD_LAST_MINE = "OLD Claude — your answer; a note for NEW Claude, then yours." + MARK("CC-B") + MARK("CC-A")
LEAD_SELF_FIRST = "OLD Claude — yours first, then a note for NEW Claude." + MARK("CC-A") + MARK("CC-B")

CASES = [
    ("cc_outbound", "Heartbeat",   HB_OK,          False, "all-clear heartbeat is SUPPRESSED (the cut)"),
    ("cc_outbound", "Heartbeat",   HB_OK_ALERTS,   False, "all-clear heartbeat listing due alerts is SUPPRESSED (the hook shows them every turn)"),
    ("cc_outbound", "Heartbeat",   HB_BAD,         True,  "POSITIVE CONTROL: a heartbeat reporting a DEAD BRIDGE still wakes"),
    ("cc_outbound", "Heartbeat",   HB_REWORD,      True,  "POSITIVE CONTROL: an unrecognised heartbeat shape still wakes (fail-safe)"),
    ("cc_outbound", "Heartbeat",   HB_NOT_STALE,   False, "Q2: \"quiet but NOT stale\" is a negation, not a verdict -> SUPPRESSED"),
    ("cc_outbound", "Heartbeat",   HB_BORDERLINE,  False, "Q2: \"borderline stale\" is hedged, not a verdict -> SUPPRESSED"),
    ("cc_outbound", "Push notice", PUSH_ROUTINE,   False, "REGRESSION GUARD: routine push notice still suppressed"),
    ("langston_outbound", None,    LANG_MARKER_MINE,       False, "marker owns me but prose names someone else -> no wake (the duplicate, cut)"),
    ("langston_outbound", None,    LANG_MARKER_MINE_NAMED, True,  "POSITIVE CONTROL: marker owns me AND he addresses me -> still wakes, with NO routing tag", ""),
    ("langston_outbound", None,    LANG_MARKER_THEIRS,     False, "REGRESSION GUARD: marker owns another session -> still suppressed"),
    ("langston_outbound", None,    LANG_NAMED,             True,  "POSITIVE CONTROL: plain reply addressed to me -> still wakes"),
    ("langston_outbound", None,    LANG_NAME_LATE,         True,  "FINDING-5: my name appears only PAST byte 400 -> must WAKE (this is the ~118/2820 class the truncation used to swallow)"),
    ("langston_outbound", None,    LANG_OTHER,             False, "REGRESSION GUARD: plain reply to someone else -> silent"),
    ("langston_outbound", None,    LEAD_A,           True,  "#1040 (a): reply OPENS with my name, another owner's marker -> WAKE, tagged CC-B (the defect)", "CC-B"),
    ("langston_outbound", None,    LEAD_B,           False, "#1040 (b): my name only MID-body, another owner's marker -> silent (the #995 cut, untouched)"),
    ("langston_outbound", None,    LEAD_C,           False, "#1040 (c): marker is mine, reply opens with someone else -> silent (unchanged)"),
    ("langston_outbound", None,    LEAD_OUT_OF_SET,  False, "condition 3: an owner OUTSIDE the list is now stripped, so its `OLD-Claude` no longer wakes me"),
    ("langston_outbound", None,    LEAD_LOWER,       True,  "condition 4: `owner=cc-b` prints the canonical CC-B, not the body's spelling", "CC-B"),
    ("langston_outbound", None,    LEAD_MENTION,     True,  "condition 5 (ACCEPTED spurious wake): a MENTION-opening matches - no separator is required, by design", "CC-B"),
    ("langston_outbound", None,    LEAD_TWO_OWNERS,  True,  "Step-8 FINDING-A: markers for CC-C, CC-B, CC-C -> the tag names BOTH distinct owners, in body order", "CC-C, CC-B"),
    ("langston_outbound", None,    LEAD_LAST_MINE,   True,  "Step-8 FINDING-D: LAST marker is mine, an earlier one is CC-B's -> still wakes, and the tag names CC-B", "CC-B"),
    ("langston_outbound", None,    LEAD_SELF_FIRST,  True,  "Step-8 FINDING-D self pin: markers CC-A, CC-B -> the tag EXCLUDES self on this path too", "CC-B"),
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
for case, wakes in results:
    kind, sender, text, expect, label = case[:5]
    tag = case[5] if len(case) > 5 else None   # None: unchecked · "": no tag allowed · "CC-B": exactly that tag
    got = bool(wakes)
    ok = (got == expect)
    if ok and got and tag is not None:
        heads = [w.split(": ", 1)[0] for w in wakes]
        if tag:
            ok = any(h == "WAKE[LANGSTON->CC-A] [alert routed to " + tag + "]" for h in heads)
        else:
            ok = all("[alert routed to" not in h for h in heads)
        if not ok:
            label += "  [TAG WRONG: " + " | ".join(heads) + "]"
    if not ok: fails += 1
    print(f"  {'PASS' if ok else '** FAIL **':10} expected {'WAKE   ' if expect else 'silent '} got {'WAKE   ' if got else 'silent '}  {label}")
print()
print(f"({sum(1 for _, w in results if w)} of {len(CASES)} cases produced a wake — the instrument speaks)")
print("ALL PASS" if fails == 0 else f"{fails} FAILED")
sys.exit(0 if fails == 0 else 1)
