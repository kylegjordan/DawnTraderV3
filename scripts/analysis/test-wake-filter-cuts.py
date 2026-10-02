# -*- coding: utf-8 -*-
"""Behavioural test of the two #995 cuts, run against the LIVE filter as a subprocess with
real tail-format input. ABORTS LOUDLY if the harness cannot run — a test that processes
nothing must never print PASS (the three hand-fed filter tests that read PASS while
processing nothing, recorded in MEMORY)."""
import json, subprocess, sys, io

# argv[1] runs the suite against another copy - the repo file BEFORE it is installed, or the live
# file to show which new cases the unfixed filter FAILS (B-WAKE-LEAD-NAME).
# Default = the REPO copy, found relative to this file, so the suite runs anywhere the repo is (Langston
# could not reach a laptop path: B-TOKEN-BURN-CUT Step 4 condition 2). Pass the live copy explicitly.
import os
FILTER = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'comms-infra', 'laptop', 'cc-wake-filter.py')
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
# Step 7 (Langston): the heartbeat now reports a running-but-not-saving watcher as STUCK instead of DEAD.
HB_STUCK = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: "
            "bridges active: y | inbox-log last-write: 40s ago (recent) | active-unacked alerts: none | "
            "watchers: STUCK: CC-B (2 running) | control: not run.")
HB_DEAD_W = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: "
             "bridges active: y | inbox-log last-write: 40s ago (recent) | active-unacked alerts: none | "
             "watchers: DEAD: CC-C | control: not run.")
HB_ALIVE_W = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: "
              "bridges active: y | inbox-log last-write: 40s ago (recent) | active-unacked alerts: none | "
              "watchers: all alive | control: answered.")
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
# B-TOKEN-BURN-CUT amendment 1, OBJ-5 (Kyle 2026-09-30): the route to a second addressee is the explicit wake tag;
# a later line that merely LEADS with a name does not wake (OPEN_RE is ^-anchored, not multiline — Langston C1).
LANG_NAME_LATE_TAGGED = LANG_NAME_LATE.replace("OLD Claude, this part is for you.", "@CC-WAKE OLD Claude, this part is for you.")
LANG_SECOND_LINE = "NEW Claude — fine.\n\nOLD Claude — you owe the census."
# Step 4 BLOCKER-1: a marker whose action= text holds a `]`, in a reply opening with my name -> still wakes me.
LANG_BRACKET_MARKER = "OLD Claude — see this.\n[[ALERT id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee owner=CC-B action=\"read list [3] first\"]]"

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
    ("cc_outbound", "Heartbeat",   HB_STUCK,       True,  "Step 7: a heartbeat reporting a STUCK watcher (running, not saving) is a problem -> WAKES"),
    ("cc_outbound", "Heartbeat",   HB_DEAD_W,      True,  "POSITIVE CONTROL: a heartbeat reporting a DEAD watcher -> WAKES"),
    ("cc_outbound", "Heartbeat",   HB_ALIVE_W,     False, "REGRESSION GUARD: watchers all alive, control answered -> SUPPRESSED"),
    ("cc_outbound", "Push notice", PUSH_ROUTINE,   False, "REGRESSION GUARD: routine push notice still suppressed"),
    ("langston_outbound", None,    LANG_MARKER_MINE,       False, "marker owns me but prose names someone else -> no wake (the duplicate, cut)"),
    ("langston_outbound", None,    LANG_MARKER_MINE_NAMED, True,  "POSITIVE CONTROL: marker owns me AND he addresses me -> still wakes, with NO routing tag", ""),
    ("langston_outbound", None,    LANG_MARKER_THEIRS,     False, "REGRESSION GUARD: marker owns another session -> still suppressed"),
    ("langston_outbound", None,    LANG_NAMED,             True,  "POSITIVE CONTROL: plain reply addressed to me -> still wakes"),
    # RE-PINNED by B-TOKEN-BURN-CUT amendment 1 (OBJ-5, Kyle 2026-09-30, Langston approved): FINDING-5 pinned that a
    # name past byte 400 must WAKE. The rule it guarded is the one Kyle removed — a passing mention in a reply
    # addressed elsewhere no longer wakes (345 of 547 Langston-reply wakes in a week were that). Still decided on the
    # FULL body; what changed is WHICH name counts: the opening one, or the explicit tag.
    ("langston_outbound", None,    LANG_NAME_LATE,         False, "OBJ-5 (was FINDING-5): my name only deep in a reply addressed to Kyle -> silent now"),
    ("langston_outbound", None,    LANG_NAME_LATE_TAGGED,  True,  "OBJ-5 C1: the same reply with the explicit @CC-WAKE tag -> WAKE (the second-addressee route)"),
    ("langston_outbound", None,    LANG_SECOND_LINE,       False, "OBJ-5 C1: a later LINE leading with my name does not wake (OPEN_RE is not multiline)"),
    ("langston_outbound", None,    LANG_BRACKET_MARKER,    True,  "Step 4 BLOCKER-1: a marker with `]` inside action=, reply opening with my name -> WAKE", "CC-B"),
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
import tempfile, os
_STATE = os.path.join(tempfile.mkdtemp(prefix="wakecuts-"), "CC-A.json")


def run_one(kind, sender, text):
    stdin = f"==> {LOG} <==\n" + row(kind, sender, text) + "\n"
    # --state into a temp dir (B-TOKEN-BURN-CUT amendment 1): the filter now RECORDS alert owners beside its state
    # file, and without this the suite's made-up markers were written into the running session's real record.
    p = subprocess.run([sys.executable, FILTER, "CC-A", "--state", _STATE], input=stdin.encode('utf-8'),
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
# Round 3 condition 2 (Langston): a RE-ISSUED bad marker moves to the END of the rejects list, because the alert hook
# reports rejects[-1] as "Latest". Bad X, then bad Y, then X again -> the last reject must be X, carrying the newest ts.
_RDIR = tempfile.mkdtemp(prefix="wakerej-")
def _rrow(ts, mid):
    return json.dumps({"ts": ts, "kind": "langston_outbound", "text": f"NEW Claude — routing.\n\n[[ALERT id={mid} owner=CC-B action=\"x\"]]"})
_rin = f"==> {LOG} <==\n" + "\n".join([_rrow("2026-09-30T10:00:00+00:00", "badxxxxx"), _rrow("2026-09-30T11:00:00+00:00", "badyyyyy"),
                                       _rrow("2026-09-30T12:00:00+00:00", "badxxxxx")]) + "\n"
_rp = subprocess.run([sys.executable, FILTER, "CC-A", "--state", os.path.join(_RDIR, "CC-A.json")], input=_rin.encode("utf-8"),
                     capture_output=True, timeout=120)
_rej = (json.load(open(os.path.join(_RDIR, "CC-A.alert-owners.json"), encoding="utf-8")).get("_meta") or {}).get("rejects") or []
_rok = len(_rej) == 2 and "badxxxxx" in _rej[-1].get("marker", "") and _rej[-1].get("ts", "").startswith("2026-09-30T12")
if not _rok: fails += 1
print(f"  {'PASS' if _rok else '** FAIL **':10} condition 2: a re-issued bad marker moves to the END of the rejects ({[(r.get('ts','')[11:16], r.get('marker','')[-40:]) for r in _rej]})")
# owner=Langston is RECORDED, not rejected (his ruling, 2026-09-30).
_LDIR = tempfile.mkdtemp(prefix="wakelang-")
_lin = f"==> {LOG} <==\n" + json.dumps({"ts": "2026-09-30T18:00:00+00:00", "kind": "langston_outbound",
       "text": "NEW Claude — holding this one.\n\n[[ALERT id=4cae3f6e-525f-41c9-9e64-3ffd79483f31 owner=Langston action=\"rule the class\"]]"}) + "\n"
subprocess.run([sys.executable, FILTER, "CC-A", "--state", os.path.join(_LDIR, "CC-A.json")], input=_lin.encode("utf-8"),
               capture_output=True, timeout=120)
_lrec = json.load(open(os.path.join(_LDIR, "CC-A.alert-owners.json"), encoding="utf-8"))
_lok = (_lrec.get("4cae3f6e-525f-41c9-9e64-3ffd79483f31") or {}).get("owner") == "Langston" and not (_lrec.get("_meta") or {}).get("rejects")
if not _lok: fails += 1
print(f"  {'PASS' if _lok else '** FAIL **':10} owner=Langston is recorded as the owner, not rejected")

# Langston's id-keyed prose rule: a placeholder or absent id is a quotation (skipped, COUNTED); a real or wordy id
# reports every defect — including a real id whose owner was left off (his mutation) and id=none (a real attempt).
_PDIR = tempfile.mkdtemp(prefix="wakeprose-")
def _prow(ts, marker):
    return json.dumps({"ts": ts, "kind": "langston_outbound", "text": "NEW Claude — see.\n\n" + marker})
_pm = ['[[ALERT id=<full-uuid> owner=<CC-A|CC-B|Kyle> action="..."]]', '[[ALERT \u2026 owner=\u2026]]', '[[ALERT ...]]',
       '[[ALERT id=c244f2b8-a1eb-4d26-abf2-000000000000 action="owner left off"]]', '[[ALERT id=none owner=CC-B action="x"]]',
       '[[ALERT owner=CC-B]]', '[[ALERT id = c244f2b8-a1eb-4d26-abf2-000000000000 owner=CC-B action="spaced id"]]']
_pin = f"==> {LOG} <==\n" + "\n".join(_prow(f"2026-09-30T1{k}:00:00+00:00", m) for k, m in enumerate(_pm)) + "\n"
subprocess.run([sys.executable, FILTER, "CC-A", "--state", os.path.join(_PDIR, "CC-A.json")], input=_pin.encode("utf-8"),
               capture_output=True, timeout=120)
_pmeta = json.load(open(os.path.join(_PDIR, "CC-A.alert-owners.json"), encoding="utf-8")).get("_meta") or {}
_prej = [r.get("marker", "") for r in _pmeta.get("rejects") or []]
_pok = (_pmeta.get("skipped_as_prose") == 3 and len(_prej) == 4
        and any("owner left off" in r for r in _prej) and any("id=none" in r for r in _prej)
        and any(r.endswith("[[ALERT owner=CC-B]]") for r in _prej) and any("spaced id" in r for r in _prej))
if not _pok: fails += 1
print(f"  {'PASS' if _pok else '** FAIL **':10} prose rule: 3 quotations skipped and counted, 4 real defects reported (incl. no-id-with-owner and a spaced id) "
      f"(skipped_as_prose={_pmeta.get('skipped_as_prose')}, rejects={len(_prej)})")
# Langston nit (Step 7 approval): a per-process temp file survives the raise path. A --once start removes this alias's
# temp files older than an hour and leaves fresh ones (a live watcher's write in progress) and other aliases' alone.
_SDIR = tempfile.mkdtemp(prefix="wakesweep-"); _SST = os.path.join(_SDIR, "CC-A.json")
open(_SST, "w", encoding="utf-8").write('{"pos": {}}')
_old = [os.path.join(_SDIR, n) for n in ("CC-A.json.tmp.111", "CC-A.alert-owners.json.tmp.222")]
_keep = [os.path.join(_SDIR, n) for n in ("CC-A.json.tmp.333", "CC-B.json.tmp.444")]
for _f in _old + _keep: open(_f, "w").write("x")
for _f in _old + [_keep[1]]: os.utime(_f, (os.path.getmtime(_f) - 7200,) * 2)
subprocess.run([sys.executable, FILTER, "CC-A", "--once", "--state", _SST, "--lease-root", _SDIR],
               input=b"==> /var/log/cc-wake.log <==\n#@AT /var/log/cc-wake.log 7 0\n", capture_output=True, timeout=120)
_sok = not any(os.path.exists(f) for f in _old) and all(os.path.exists(f) for f in _keep)
if not _sok: fails += 1
print(f"  {'PASS' if _sok else '** FAIL **':10} start-up sweep: this alias's hour-old temp files removed, a fresh one and another alias's kept "
      f"(old_left={[os.path.basename(f) for f in _old if os.path.exists(f)]}, kept={[os.path.basename(f) for f in _keep if os.path.exists(f)]})")
# Langston (Step 7 approval): the held-file legs below test a WINDOWS mechanism. On POSIX an open reader does not block
# os.replace, so they cannot discriminate there (the stale leg even reads FAIL) — they SKIP, with the reason printed.
WIN = os.name == 'nt'
if not WIN:
    print("  SKIP       the three held-file legs (state held / save keeps failing / owner record held): Windows-only mechanism (an open reader does not block os.replace on POSIX)")
if WIN:
    # Step 7 finding (CC-B, 2026-10-01): Windows refuses os.replace while another process holds the state file open. Hold it
    # for 1.5 s while the filter runs a keepalive and then a wake: it must deliver the wake, exit 0 and save the position.
    _HDIR = tempfile.mkdtemp(prefix="wakehold-"); _HST = os.path.join(_HDIR, "CC-A.json")
    open(_HST, "w", encoding="utf-8").write('{"pos": {}}')
    _holder = subprocess.Popen([sys.executable, "-c", f"import time; f=open(r'{_HST}'); time.sleep(1.5)"])
    import time as _t; _t.sleep(0.4)
    _hin = "\n".join(["==> /var/log/cc-wake.log <==", "#@AT /var/log/cc-wake.log 7 0", "#@KEEPALIVE",
                      "#@POS /var/log/cc-wake.log 7 0", "Claude Old: held-file wake", "#@POS /var/log/cc-wake.log 7 30"]) + "\n"
    _hp = subprocess.run([sys.executable, FILTER, "CC-A", "--once", "--state", _HST, "--lease-root", _HDIR], input=_hin.encode("utf-8"), capture_output=True, timeout=120)
    _holder.wait()
    _hst = json.load(open(_HST, encoding="utf-8"))
    _hok = _hp.returncode == 0 and b"held-file wake" in _hp.stdout and b"Traceback" not in _hp.stderr and (_hst.get("pos") or {})
    if not _hok: fails += 1
    print(f"  {'PASS' if _hok else '** FAIL **':10} a state file held open by another process: the wake is delivered and the position saved (rc={_hp.returncode}, saved={bool((_hst.get('pos') or {}))})")
    # Langston (Step 7 approval): a save that keeps failing must NOT leave a fresh-and-green .alive. Hold the state file
    # open for 7 s (beyond the ~5 s retry) during a KEEPALIVE: the filter must survive, skip the save, and NOT write .alive.
    _KDIR = tempfile.mkdtemp(prefix="wakestale-"); _KST = os.path.join(_KDIR, "CC-A.json")
    open(_KST, "w", encoding="utf-8").write('{"pos": {}}')
    _kh = subprocess.Popen([sys.executable, "-c", f"import time; f=open(r'{_KST}'); time.sleep(7)"])
    _t.sleep(0.4)
    _kin = "\n".join(["==> /var/log/cc-wake.log <==", "#@AT /var/log/cc-wake.log 7 0", "#@KEEPALIVE"]) + "\n"
    _kp = subprocess.run([sys.executable, FILTER, "CC-A", "--once", "--state", _KST, "--lease-root", _KDIR], input=_kin.encode("utf-8"), capture_output=True, timeout=120)
    _kh.wait()
    _kok = (not os.path.exists(_KST + ".alive")) and b"keepalive save skipped" in _kp.stderr and b"Traceback" not in _kp.stderr
    if not _kok: fails += 1
    print(f"  {'PASS' if _kok else '** FAIL **':10} a save that keeps failing leaves .alive UNWRITTEN (stale), and the watcher survives (alive_written={os.path.exists(_KST + '.alive')})")
    # Langston (Step 7 approval): the alert-owner save had no retry and no handler, and a raise there dropped the WAKE on
    # the same line. Hold the owner record open 7 s while a Langston reply addressed to me, carrying a new marker, arrives:
    # the wake must still be delivered, the lost routing named, and no LINE DROPPED. (Control: cfe70f92c drops the line.)
    _ODIR = tempfile.mkdtemp(prefix="wakeown-"); _OST = os.path.join(_ODIR, "CC-A.json"); _OOF = os.path.join(_ODIR, "CC-A.alert-owners.json")
    open(_OST, "w", encoding="utf-8").write('{"pos": {}}'); open(_OOF, "w", encoding="utf-8").write('{}')
    _oh = subprocess.Popen([sys.executable, "-c", f"import time; f=open(r'{_OOF}'); time.sleep(7)"])
    _t.sleep(0.4)
    _orow = json.dumps({"ts": "2026-10-01T21:30:00+00:00", "kind": "langston_outbound",
                        "text": "OLD Claude — owner-file wake.\n\n[[ALERT id=c244f2b8-a1eb-4d26-abf2-000000000001 owner=CC-A action=\"x\"]]"})
    _oin = "\n".join([f"==> {LOG} <==", f"#@AT {LOG} 7 0", f"#@POS {LOG} 7 0", _orow, f"#@POS {LOG} 7 400", "#@CAUGHTUP"]) + "\n"
    _op = subprocess.run([sys.executable, FILTER, "CC-A", "--once", "--state", _OST, "--lease-root", _ODIR], input=_oin.encode("utf-8"), capture_output=True, timeout=120)
    _oh.wait()
    # #1142 (Langston C7): the SAME run must also leave the in-band loss record — id, owner, the message ts, a wall-clock at.
    _olost = os.path.join(_ODIR, "CC-A.alert-owners.lost.jsonl")
    _olines = [json.loads(x) for x in open(_olost, encoding="utf-8")] if os.path.exists(_olost) else []
    _ook = (b"owner-file wake" in _op.stdout and b"LINE DROPPED" not in _op.stderr and b"alert-owner record NOT saved" in _op.stderr
            and _op.returncode == 0 and len(_olines) == 1
            and _olines[0].get("ids") == [{"id": "c244f2b8-a1eb-4d26-abf2-000000000001", "owner": "CC-A"}]
            and _olines[0].get("ts") == "2026-10-01T21:30:00+00:00" and str(_olines[0].get("at", "")).endswith("Z"))
    if not _ook: fails += 1
    # ...but a SEED must not swallow it: it rebuilds the whole record, has no wake to protect, and a half-done seed must
    # never be marked seeded. Same hold, --seed-owners: expect a non-zero exit and no seeded_at.
    _EDIR = tempfile.mkdtemp(prefix="wakeseed-"); _EST = os.path.join(_EDIR, "CC-A.json"); _EOF = os.path.join(_EDIR, "CC-A.alert-owners.json")
    open(_EOF, "w", encoding="utf-8").write('{}')
    _eh = subprocess.Popen([sys.executable, "-c", f"import time; f=open(r'{_EOF}'); time.sleep(7)"])
    _t.sleep(0.4)
    _ein = "\n".join([f"==> {LOG} <==", _orow, "#@CAUGHTUP"]) + "\n"
    _ep = subprocess.run([sys.executable, FILTER, "CC-A", "--seed-owners", "--state", _EST], input=_ein.encode("utf-8"), capture_output=True, timeout=120)
    _eh.wait()
    _erec = json.load(open(_EOF, encoding="utf-8"))
    # #1142 (Langston C6): the seed path is untouched — it writes NO loss record (its own refusal is the signal).
    _eok = (_ep.returncode == 4 and not (_erec.get("_meta") or {}).get("seeded_at")
            and not os.path.exists(os.path.join(_EDIR, "CC-A.alert-owners.lost.jsonl")))
    if not _eok: fails += 1
    print(f"  {'PASS' if _eok else '** FAIL **':10} the same hold during a SEED fails the seed and leaves it unmarked (rc={_ep.returncode}, seeded={bool((_erec.get('_meta') or {}).get('seeded_at'))})")
    print(f"  {'PASS' if _ook else '** FAIL **':10} owner record held open past the retry: the wake on that line is still delivered and the lost routing named "
          f"(rc={_op.returncode}, woke={b'owner-file wake' in _op.stdout}, dropped={b'LINE DROPPED' in _op.stderr}, loss_lines={len(_olines)})")

# #1142 (Langston B1): forced-failure legs that run on EVERY platform, so CI evaluates the new write path. The owner
# record's destination is made a DIRECTORY, so the save raises OSError on POSIX and on Windows alike (on Windows only after
# the ~5 s replace retry). Expectations, stated before running:
#   P1 — the wake prints, no LINE DROPPED, rc 0, and ONE loss line names the marker's id and owner with the message ts.
#   P2 (B2) — the loss file is ALSO a directory, so the append fails: the wake STILL prints, no LINE DROPPED, rc 0, and
#        stderr says the loss record could not be written either, naming the id.
#   P3 (C3) — the only edit is a reject (no id): the loss line has ids [] and the reject's snippet.
# A directory at the record's path fails the LOAD first (found by this test: that raise used to drop the wake too), so P1-P3
# exercise the load-failure branch. P4 fails the SAVE with a readable record: POSIX only (a read-only directory blocks the
# temp file); on Windows the held-file leg above is the save-failure case.
def _forced(tag, text, lost_is_dir=False):
    d = tempfile.mkdtemp(prefix=f"wakeloss{tag}-"); st = os.path.join(d, "CC-A.json")
    open(st, "w", encoding="utf-8").write('{"pos": {}}')
    os.mkdir(os.path.join(d, "CC-A.alert-owners.json"))
    if lost_is_dir:
        os.mkdir(os.path.join(d, "CC-A.alert-owners.lost.jsonl"))
    row = json.dumps({"ts": "2026-10-03T08:00:00.250000+00:00", "kind": "langston_outbound", "text": text})
    inp = "\n".join([f"==> {LOG} <==", f"#@AT {LOG} 7 0", f"#@POS {LOG} 7 0", row, f"#@POS {LOG} 7 400", "#@CAUGHTUP"]) + "\n"
    p = subprocess.run([sys.executable, FILTER, "CC-A", "--once", "--state", st, "--lease-root", d], input=inp.encode("utf-8"),
                       capture_output=True, timeout=120)
    lf = os.path.join(d, "CC-A.alert-owners.lost.jsonl")
    lines = [json.loads(x) for x in open(lf, encoding="utf-8")] if os.path.isfile(lf) else []
    return p, lines
_MID = "c244f2b8-a1eb-4d26-abf2-000000000002"
_p1, _l1 = _forced("p1", f"OLD Claude — forced-loss wake.\n\n[[ALERT id={_MID} owner=CC-B action=\"x\"]]")
_ok1 = (b"forced-loss wake" in _p1.stdout and b"LINE DROPPED" not in _p1.stderr and _p1.returncode == 0 and len(_l1) == 1
        and _l1[0].get("ids") == [{"id": _MID, "owner": "CC-B"}] and _l1[0].get("ts") == "2026-10-03T08:00:00.250000+00:00")
if not _ok1: fails += 1
print(f"  {'PASS' if _ok1 else '** FAIL **':10} #1142 P1: a record that cannot be read (a directory at its path) delivers the wake AND leaves one loss line with id, owner and message ts "
      f"(rc={_p1.returncode}, woke={b'forced-loss wake' in _p1.stdout}, lines={len(_l1)})")
_p2, _l2 = _forced("p2", f"OLD Claude — forced-loss wake two.\n\n[[ALERT id={_MID} owner=CC-B action=\"x\"]]", lost_is_dir=True)
_ok2 = (b"forced-loss wake two" in _p2.stdout and b"LINE DROPPED" not in _p2.stderr and _p2.returncode == 0
        and b"loss record could not be written" in _p2.stderr and _MID[:8].encode() in _p2.stderr)
if not _ok2: fails += 1
print(f"  {'PASS' if _ok2 else '** FAIL **':10} #1142 P2 (B2): the append ALSO fails — the wake still prints, nothing is dropped, and stderr names the id "
      f"(rc={_p2.returncode}, woke={b'forced-loss wake two' in _p2.stdout}, dropped={b'LINE DROPPED' in _p2.stderr})")
_p3, _l3 = _forced("p3", "NEW Claude — a bad marker only.\n\n[[ALERT id=badzzzzz owner=CC-B action=\"x\"]]")
_ok3 = (_p3.returncode in (0, 3) and b"LINE DROPPED" not in _p3.stderr and len(_l3) == 1 and _l3[0].get("ids") == []
        and len(_l3[0].get("rejects") or []) == 1 and "badzzzzz" in _l3[0]["rejects"][0])
if not _ok3: fails += 1
print(f"  {'PASS' if _ok3 else '** FAIL **':10} #1142 P3 (C3): a loss with no alert id still leaves a line, carrying the reject's snippet "
      f"(rc={_p3.returncode}, lines={len(_l3)})")
# P4 — expected: a READABLE record whose directory is read-only, so the temp file for the save cannot be created; the wake
# prints, nothing is dropped, the loss line is written... to a directory that is read-only. So the append fails too, and the
# stderr line is the record: it names the id and says the loss record could not be written. (Read-only blocks BOTH files —
# that is the honest shape of a permissions break, and exactly the case B2 guards.) The exit code is NOT asserted: in a
# read-only directory the POSITION save at #@CAUGHTUP fails too and exits 1 after the wake has printed (measured on Linux,
# 2026-10-03) — a pre-existing behaviour outside #1142, put to Langston at this batch's Step 4.
if os.name != "nt" and os.geteuid() != 0:
    _d4 = tempfile.mkdtemp(prefix="wakelossp4-"); _s4 = os.path.join(_d4, "CC-A.json")
    open(_s4, "w", encoding="utf-8").write('{"pos": {}}')
    open(os.path.join(_d4, "CC-A.alert-owners.json"), "w", encoding="utf-8").write('{"_meta": {"seeded_at": "x"}}')
    os.chmod(_d4, 0o500)
    try:
        _row4 = json.dumps({"ts": "2026-10-03T09:00:00+00:00", "kind": "langston_outbound",
                            "text": f"OLD Claude — read-only wake.\n\n[[ALERT id={_MID} owner=CC-B action=\"x\"]]"})
        _in4 = "\n".join([f"==> {LOG} <==", f"#@AT {LOG} 7 0", f"#@POS {LOG} 7 0", _row4, f"#@POS {LOG} 7 400", "#@CAUGHTUP"]) + "\n"
        _p4 = subprocess.run([sys.executable, FILTER, "CC-A", "--once", "--state", _s4, "--lease-root", _d4], input=_in4.encode("utf-8"),
                             capture_output=True, timeout=120)
    finally:
        os.chmod(_d4, 0o700)
    _ok4 = (b"read-only wake" in _p4.stdout and b"LINE DROPPED" not in _p4.stderr and b"alert-owner record NOT saved" in _p4.stderr
            and _MID[:8].encode() in _p4.stderr)
    if not _ok4: fails += 1
    print(f"  {'PASS' if _ok4 else '** FAIL **':10} #1142 P4: the SAVE fails on a readable record (read-only directory) — the wake prints and stderr names the lost id "
          f"(rc={_p4.returncode}, woke={b'read-only wake' in _p4.stdout}, dropped={b'LINE DROPPED' in _p4.stderr})")
else:
    print("  SKIP       #1142 P4 (read-only directory): POSIX non-root only; on Windows the held-file leg is the save-failure case")
print()
print(f"({sum(1 for _, w in results if w)} of {len(CASES)} cases produced a wake — the instrument speaks)")
print("ALL PASS" if fails == 0 else f"{fails} FAILED")
sys.exit(0 if fails == 0 else 1)
