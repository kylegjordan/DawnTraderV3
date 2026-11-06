# -*- coding: utf-8 -*-
"""KYLE'S DESK (Kyle 2026-11-06, via PM Claude; #1241 follow-up): PM Claude ALSO wakes on a post whose opening list
names Kyle, on the fixed "STILL NEED YOU" marker, and on a Langston triage whose alert marker names owner=Kyle.
No other session's wakes change.
Run: python scripts/analysis/test-wake-kyle-desk.py [path-to-cc-wake-filter.py]   (default: the repo copy)

The filter runs as a SUBPROCESS fed real tail-format input (the `==> file <==` header it requires). A POSITIVE CONTROL
runs first and must produce a WAKE line, or the run ABORTS (2). Every outcome is asserted on the filter's WAKE lines.
A failure prints `FAIL: <name>` and the run exits 1; the last line is `<n> passed, <m> failed`."""
import json, os, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILTER = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "comms-infra", "laptop", "cc-wake-filter.py")
LOG = "/var/log/cc-discord-inbox.jsonl"
SCRATCH = tempfile.mkdtemp(prefix="wake-desk-")
SESSIONS = ("CC-A", "CC-B", "CC-C", "CC-INFRA", "CC-PM")
P = F = 0


def ok(name, cond, detail=""):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print("  FAIL: " + name + (("   [" + str(detail)[:300] + "]") if detail else ""))


def row(text, sender="NEW Claude", kind="cc_outbound"):
    d = {"ts": "2026-11-06T17:00:00+00:00", "source": "discord-cc-bridge", "transport": "discord", "kind": kind,
         "text": text}
    if sender is not None:
        d["sender"] = sender
    return json.dumps(d, ensure_ascii=False)


def wakes(alias, r):
    st = os.path.join(tempfile.mkdtemp(dir=SCRATCH), alias + ".json")
    p = subprocess.run([sys.executable, FILTER, alias, "--state", st],
                       input=("==> %s <==\n%s\n" % (LOG, r)).encode("utf-8"), capture_output=True, timeout=120)
    if p.returncode != 0:
        print("HARNESS FAILED - filter exited %d: %s" % (p.returncode, p.stderr.decode("utf-8", "replace")[-600:]))
        sys.exit(2)
    return [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.startswith("WAKE[")]


def who(r):
    """The set of sessions this one row wakes."""
    return {a for a in SESSIONS if wakes(a, r)}


# ── the positive control, FIRST ──────────────────────────────────────────────────────────────────────────────────
_w = wakes("CC-PM", row("PM Claude — positive control"))
if not _w:
    print("HARNESS FAILED - the positive control produced no WAKE line; no result below would mean anything.")
    sys.exit(2)
print("positive control: WAKE seen - the instrument speaks")

print("1. crew and reviewer posts opening with Kyle wake PM Claude, and only PM Claude")
for text, sender in (("Kyle — the archive sample is ready", "NEW Claude"),
                     ("Kyle, Langston — two things", "OLD Claude"),
                     ("**Kyle** — a decision", "ANALYST Claude"),
                     ("Kyle — independent result", "Coltrane")):
    got = who(row(text, sender))
    ok("%r from %s wakes exactly CC-PM" % (text, sender), got == {"CC-PM"}, got)
got = who(row("Kyle, OLD Claude — both of you", "NEW Claude"))
ok("Kyle and OLD Claude in the opening list wake CC-PM and CC-A", got == {"CC-PM", "CC-A"}, got)
w = wakes("CC-PM", row("Kyle — a question", "NEW Claude"))
ok("the wake line says it is for Kyle", len(w) == 1 and "[for Kyle]" in w[0], w)
w = wakes("CC-PM", row("PM Claude — a question", "NEW Claude"))
ok("a post naming PM Claude carries no Kyle tag", len(w) == 1 and "[for Kyle]" not in w[0], w)

print("2. what does NOT wake PM Claude")
for text, sender, why in (("Langston — the change list mentions Kyle's ruling", "NEW Claude", "Kyle only mentioned later"),
                          ("OLD Claude — Kyle said yes", "NEW Claude", "Kyle mentioned after another addressee"),
                          ("Kyle — my own post", "PM Claude", "PM Claude's own post"),
                          ("I still need you to look at this", "NEW Claude", "the marker in lower case is prose")):
    ok("no wake: %s" % why, "CC-PM" not in who(row(text, sender)))

print("3. the STILL NEED YOU marker wakes PM Claude anywhere in the post")
for text, sender in (("STILL NEED YOU: does the sample read right?", "Infra Claude"),
                     ("NEW Claude — STILL NEED YOU: the decision is open", "NEW Claude"),
                     ("Langston — note. STILL NEED YOU: Kyle's call", "OLD Claude")):
    ok("marker in %r wakes CC-PM" % text[:40], "CC-PM" in who(row(text, sender)))
ok("the marker wakes no other session by itself", who(row("STILL NEED YOU: x", "Infra Claude")) == {"CC-PM"})

print("4. Langston's replies")
lo = lambda t: row(t, sender=None, kind="langston_outbound")
ok("a reply opening 'Kyle —' wakes exactly CC-PM", who(lo("Kyle — here is my ruling")) == {"CC-PM"})
w = wakes("CC-PM", lo("Kyle — here is my ruling"))
ok("its wake line says for Kyle", len(w) == 1 and w[0].startswith("WAKE[LANGSTON->CC-PM] [for Kyle]"), w)
tri = lo('NEW Claude — triage of the drift alert.\n[[ALERT id=5e760b86 owner=Kyle action="decide"]]')
ok("a triage marked owner=Kyle wakes CC-PM (and the session it opens with)", who(tri) == {"CC-PM", "CC-B"}, who(tri))
tri2 = lo('Triage of the drift alert.\n[[ALERT id=5e760b86 owner=Kyle action="decide"]]')
ok("an unaddressed triage marked owner=Kyle wakes exactly CC-PM", who(tri2) == {"CC-PM"}, who(tri2))
tri3 = lo('OLD Claude — yours.\n[[ALERT id=5e760b86 owner=CC-A action="fix"]]')
ok("a triage owned by CC-A, opening with OLD Claude, does not wake CC-PM", who(tri3) == {"CC-A"}, who(tri3))
ok("a reply to a session that only mentions Kyle later does not wake CC-PM",
   "CC-PM" not in who(lo("NEW Claude — Kyle approved this earlier")))
ok("a Langston reply carrying the marker wakes CC-PM", "CC-PM" in who(lo("NEW Claude — STILL NEED YOU: Kyle's call")))
# Langston Step-4 must-fix: the @CC-WAKE tag branch swallowed the desk (his three measured shapes)
g = who(lo("Kyle — my ruling. @CC-WAKE NEW Claude please re-land it."))
ok("a reply opening Kyle that TAGS another session wakes the desk too", g == {"CC-PM", "CC-B"}, g)
g = who(lo("NEW Claude — STILL NEED YOU: Kyle's call. @CC-WAKE OLD Claude"))
ok("the marker in a tagged reply still wakes the desk", "CC-PM" in g, g)
g = who(lo('Kyle — triage. @CC-WAKE NEW Claude\n[[ALERT id=5e760b86 owner=Kyle action="decide"]]'))
ok("a tagged triage marked owner=Kyle wakes the desk (it woke NOBODY before)", "CC-PM" in g, g)
w = wakes("CC-PM", lo("Kyle — my ruling. @CC-WAKE NEW Claude please re-land it."))
ok("...and that wake line says for Kyle", len(w) == 1 and "[for Kyle]" in w[0], w)

print("5. Kyle's own posts are unchanged")
ok("a Kyle post naming nobody still wakes every session", who(row("hello all", sender=None, kind="")) == set(SESSIONS))
ok("a Kyle post naming OLD Claude wakes only CC-A", who(row("OLD Claude, look at this", sender=None, kind="")) == {"CC-A"})

print("\n%d passed, %d failed" % (P, F))
sys.exit(1 if F else 0)
