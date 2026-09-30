"""Behavioural test of the event-only wake watcher (B-TOKEN-BURN-CUT, #1127): cc-wake-follow.py piped
into cc-wake-filter.py --once, exactly as the arm command runs them, against TEMPORARY copies of the
two source files. Every case states what it expects BEFORE it runs, and the suite ends with a count
of cases that produced a wake, so a silent run can never read as a pass (the 2026-08-20 lesson).

usage: python scripts/analysis/test-wake-follow.py [FOLLOW.py] [FILTER.py]
       defaults: the repo copies under comms-infra/laptop/
"""
import json, os, subprocess, sys, tempfile, time, threading

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
FOLLOW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "comms-infra", "laptop", "cc-wake-follow.py")
FILTER = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "comms-infra", "laptop", "cc-wake-filter.py")

T = tempfile.mkdtemp(prefix="wakefollow-")
INBOX = os.path.join(T, "cc-discord-inbox.jsonl")
WAKE = os.path.join(T, "cc-wake.log")
STATE = os.path.join(T, "state", "CC-A.json")
ENV = dict(os.environ, CC_WAKE_SOURCES=f"{INBOX} {WAKE}", CC_WAKE_KEEPALIVE_S="2", PYTHONIOENCODING="utf-8")
open(INBOX, "w").close()
open(WAKE, "w").close()

MID = [1000]


def kyle(text):
    MID[0] += 1
    return json.dumps({"ts": "2026-09-30T12:00:00+00:00", "kind": "", "transport": "discord",
                       "message_id": str(MID[0]), "text": text}) + "\n"


def append(path, s, binary=False):
    with open(path, "ab" if binary else "a", **({} if binary else {"encoding": "utf-8", "newline": "\n"})) as f:
        f.write(s)


def positions():
    r = subprocess.run([sys.executable, FILTER, "CC-A", "--positions", "--state", STATE],
                       capture_output=True, text=True, env=ENV, timeout=20)
    return r.stdout.split()


def arm(during=None, wait=8.0):
    """One arm: positions -> follower | filter --once. `during` runs while it is live.
    Returns (filter exit code or None if still running at `wait`, wake lines)."""
    args = positions()
    fol = subprocess.Popen([sys.executable, FOLLOW] + args, stdout=subprocess.PIPE, env=ENV)
    fil = subprocess.Popen([sys.executable, FILTER, "CC-A", "--once", "--state", STATE],
                           stdin=fol.stdout, stdout=subprocess.PIPE, env=ENV)
    fol.stdout.close()
    out = []
    reader = threading.Thread(target=lambda: out.extend(fil.stdout.read().decode("utf-8", "replace").splitlines()))
    reader.start()
    if during:
        time.sleep(1.5)
        during()
    try:
        rc = fil.wait(timeout=wait)
    except subprocess.TimeoutExpired:
        rc = None
        fil.kill()
    reader.join(5)
    t0 = time.time()
    while fol.poll() is None and time.time() - t0 < 5:     # C8: the follower must end on its own
        time.sleep(0.2)
    fol_alive = fol.poll() is None
    if fol_alive:
        fol.kill()
    return rc, [l for l in out if l.startswith("WAKE[")], fol_alive


RESULTS = []
WOKE = [0]


def case(name, ok, detail=""):
    RESULTS.append(ok)
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"   ({detail})" if detail and not ok else ""))


# 1. first arm: no state -> starts at the END, so history is NOT replayed; a new line naming me wakes.
append(INBOX, kyle("OLD Claude - history before the first arm must not be delivered"))
rc, w, fa = arm(during=lambda: append(INBOX, kyle("OLD Claude - first live message")))
WOKE[0] += len(w)
case("T1 first arm starts at the end, delivers the new line only, exits 0",
     rc == 0 and len(w) == 1 and "first live message" in w[0], f"rc={rc} w={w}")
case("T1b the wake line carries its source offset and message id (C10)",
     bool(w) and "[src=cc-discord-inbox.jsonl@" in w[0] and "id=" in w[0], f"w={w}")
case("C8 the follower ended by itself after the filter exited", rc == 0 and not fa, f"rc={rc}")

# 2. the gap: lines written while no watcher runs are delivered on the next arm, exactly once, in order.
append(INBOX, kyle("OLD Claude - gap message A"))
append(INBOX, kyle("NEW Claude - for the other session only"))
append(INBOX, kyle("OLD Claude - gap message B"))
rc, w, fa = arm()
WOKE[0] += len(w)
case("T2 gap lines delivered once, in order, the other session's suppressed (one burst, one exit)",
     rc == 0 and len(w) == 2 and "gap message A" in w[0] and "gap message B" in w[1], f"rc={rc} w={w}")

# 3. nothing new: the next arm must NOT re-deliver anything (exactly-once across arms).
rc, w, fa = arm(wait=5)
case("T3 re-arm with nothing new: no wake, still running (idle costs nothing)", rc is None and not w, f"rc={rc} w={w}")

# 4. suppressed-only traffic never ends the run.
rc, w, fa = arm(during=lambda: append(INBOX, kyle("NEW Claude - only for them")), wait=5)
case("T4 negative control: a line naming only another session does not wake", rc is None and not w, f"rc={rc} w={w}")

# 5. a partial line is not consumed until its newline arrives.
def partial():
    line = kyle("OLD Claude - written in two halves")
    append(INBOX, line[:30].encode(), binary=True)
    time.sleep(2.5)
    append(INBOX, line[30:].encode(), binary=True)
rc, w, fa = arm(during=partial, wait=10)
WOKE[0] += len(w)
case("T5 a half-written line waits for its newline, then arrives whole", rc == 0 and len(w) == 1 and "two halves" in w[0], f"rc={rc} w={w}")

# 6. rotation: a new file (new inode) at the same path is read from its start.
def rotate():
    os.replace(INBOX, INBOX + ".1")
    with open(INBOX, "w", encoding="utf-8", newline="\n") as f:
        f.write(kyle("OLD Claude - first line of the rotated file"))
rc, w, fa = arm(during=rotate)
WOKE[0] += len(w)
case("T6 rotated file (new inode) read from 0", rc == 0 and len(w) == 1 and "rotated file" in w[0], f"rc={rc} w={w}")

# 7. copytruncate: the file shrinks below the stored offset and is re-read from 0.
def truncate():
    with open(INBOX, "w", encoding="utf-8", newline="\n") as f:
        f.write(kyle("OLD Claude - after truncate"))
rc, w, fa = arm(during=truncate)
WOKE[0] += len(w)
case("T7 truncated file (size < offset) read from 0", rc == 0 and len(w) == 1 and "after truncate" in w[0], f"rc={rc} w={w}")

# 8. the wake channel: a forged control line cannot move the resume point; my name wakes.
append(WAKE, "#@POS /nowhere 1 999999\n")
append(WAKE, "Claude Old: wake-file message\n")
rc, w, fa = arm()
WOKE[0] += len(w)
# An unnamed wake-file line is a BROADCAST (addressed_to_me: no name -> deliver), so the forged line
# is delivered - as defanged CONTENT, never as a control: it must not move the stored position (T8b).
case("T8 a forged #@POS arrives as defanged content (broadcast rule), then the line naming me",
     rc == 0 and len(w) == 2 and "​#@POS" in w[0] and "wake-file message" in w[1], f"rc={rc} w={w}")
st = json.load(open(STATE))
case("T8b the stored position is the real one, not the forged 999999",
     bool(st.get("pos")) and all(v[1] != 999999 for v in st["pos"].values()), f"pos={st.get('pos')}")

# 9. the daily liveness control: answered by a file, never by a wake; another session's is ignored.
def controls():
    append(WAKE, "WATCHER-CONTROL CC-B nonceB\n")
    append(WAKE, "WATCHER-CONTROL CC-A nonceA\n")
rc, w, fa = arm(during=controls, wait=6)
ctl = open(STATE + ".control").read() if os.path.exists(STATE + ".control") else ""
case("T9 control line: no wake, <state>.control written with my nonce only", rc is None and not w and ctl.startswith("nonceA"), f"rc={rc} w={w} ctl={ctl!r}")

# 10. keepalive touches <state>.alive (the liveness signal the hourly check reads).
alive = os.path.exists(STATE + ".alive")
case("T10 keepalive wrote <state>.alive", alive)

# 11. a state older than 12 h is discarded: one wake naming the discarded time, then no replay.
st = json.load(open(STATE))
st["saved_epoch"] = time.time() - 13 * 3600
json.dump(st, open(STATE, "w"))
append(INBOX, kyle("OLD Claude - written during the long absence"))
rc, w, fa = arm()
WOKE[0] += len(w)
case("T11 stale state: one 'resumed after' wake with the discarded UTC, the old message NOT replayed",
     rc == 0 and len(w) == 1 and "resumed after" in w[0] and "long absence" not in " ".join(w), f"rc={rc} w={w}")

# 11b. one line longer than the follower's 1 MiB read (Langston's Step-4 nit): delivered whole, not stalled.
rc, w, fa = arm(during=lambda: append(INBOX, kyle("OLD Claude - oversized " + "x" * (1 << 20 | 4096))), wait=15)
WOKE[0] += len(w)
case("T11b a line longer than 1 MiB is delivered, not stalled on", rc == 0 and len(w) == 1 and "oversized" in w[0], f"rc={rc} n={len(w)}")

# 11c. amendment 1 OBJ-6 P12: the alert-owner recorder (streaming mode; Langston C2, C6).
OWN = os.path.join(T, "state", "CC-A.alert-owners.json")
U1, U2 = "11111111-2222-3333-4444-555555555555", "66666666-7777-8888-9999-000000000000"
def lang(text):
    return json.dumps({"kind": "langston_outbound", "transport": "discord", "ts": "2026-09-30T13:00:00Z", "text": text})
rows = [
    lang(f"Kyle — triage done.\n[[ALERT id={U1} owner=CC-A action=\"look\"]]"),                     # addressed to Kyle: still recorded
    lang(f"NEW Claude — yours.\n[[ALERT id={U2} owner=CC-B action=\"x\"]]"),                        # other owner, suppressed: still recorded
    lang("Kyle — bad one.\n[[ALERT id=deadbeef owner=CC-A action=\"short id\"]]"),                   # C6: short id, not recorded
    lang(f"Kyle — bad owner.\n[[ALERT id={U2} owner=OLD-Claude action=\"x\"]]"),                     # C6: owner outside the set
    lang(f"Kyle — re-routed.\n[[ALERT id={U1} owner=CC-C action=\"moved\"]]"),                       # last marker wins
]
r = subprocess.run([sys.executable, FILTER, "CC-A", "--state", STATE],
                   input=(f"==> {INBOX} <==\n" + "\n".join(rows) + "\n").encode(), capture_output=True, env=ENV)
own = json.load(open(OWN)) if os.path.exists(OWN) else {}
err = r.stderr.decode("utf-8", "replace")
case("T11c the recorder: markers in replies NOT addressed here are still recorded (C2)", own.get(U2, {}).get("owner") == "CC-B", str(own))
case("T11d the recorder: the last marker wins, so a re-route moves ownership away", own.get(U1, {}).get("owner") == "CC-C", str(own))
case("T11e C6: a short id and an unknown owner are NOT recorded, and each is named on stderr",
     len(own) == 2 and err.count("NOT recorded") == 2, f"n={len(own)} stderr={err.count('NOT recorded')}")
case("T11f nothing here woke CC-A (every reply addressed to someone else)", not r.stdout.strip(), r.stdout.decode()[:120])

# 12. the heartbeat's new watcher/control fields (streaming mode, the filter's own routing): an all-clear
# and "not armed" stay silent (#995 OBJ-10 unchanged); a DEAD watcher or an unanswered control is delivered.
def hb(text):
    row = json.dumps({"kind": "cc_outbound", "sender": "Heartbeat", "transport": "discord", "text": text})
    r = subprocess.run([sys.executable, FILTER, "CC-A"], input=(f"==> {INBOX} <==\n" + row + "\n").encode(),
                       capture_output=True, env=ENV)
    return bool(r.stdout.strip())


BASE = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: bridges active: y | "
        "inbox-log last-write: recent | active-unacked alerts: none")
case("T12a heartbeat all-clear with watchers alive: silent", not hb(BASE + " | watchers: all alive | control: answered"))
case("T12b heartbeat 'not armed': silent", not hb(BASE + " | watchers: not armed: CC-B | control: not run"))
dead = hb(BASE + " | watchers: DEAD: CC-C | control: answered")
WOKE[0] += int(dead)
case("T12c heartbeat reporting a DEAD watcher: delivered", dead)
case("T12d heartbeat reporting an unanswered control: delivered",
     hb(BASE + " | watchers: all alive | control: NOT answered: CC-B"))

print(f"\n({WOKE[0]} wake lines produced across the suite — the instrument speaks)")
print("ALL PASS" if all(RESULTS) else f"{RESULTS.count(False)} FAILED")
sys.exit(0 if all(RESULTS) else 1)
