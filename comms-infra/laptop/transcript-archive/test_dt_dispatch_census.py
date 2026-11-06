#!/usr/bin/env python3
"""Tests for dt_dispatch_census (B-TRANSCRIPT-ARCHIVE P8): the pre-audit drill cases the census owns, (6)-(18), each on
planted rows with a clean control beside it. `python3 -I test_dt_dispatch_census.py` - exit 0 = all pass."""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dt_dispatch_census as dc  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass
ADDR = os.path.join(os.path.dirname(os.path.dirname(HERE)), "discord", "address_list.py")
addr = dc.load_address(ADDR)
REG = addr.REGISTRY
FAILS = []


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


BASE = 1568300000000000000          # a snowflake; ids below are BASE + n * 2**22 (n ms later)


def sid(n):
    return BASE + n * (1 << 22)


SINCE = dc.snowflake_ms(BASE)


def inb(n, su="Infra Claude#0000", text="Langston — please review"):
    return {"kind": "langston_inbound", "message_id": sid(n), "sender_username": su, "text": text}


def out(reply_n, n, kind="langston_outbound", mid=True):
    return {"kind": kind, "message_id": str(sid(n)) if mid else None, "reply_to": sid(reply_n), "text": "ruling"}


def sil(reply_n, reason):
    return {"kind": "langston_silent", "reply_to": sid(reply_n), "reason": reason}


def cco(n, text, sender="Infra Claude"):
    return {"kind": "cc_outbound", "message_id": str(sid(n)), "sender": sender, "text": text}


def run(rows, alias="CC-INFRA", registry=None):
    return dc.census(rows, alias, SINCE, None, addr, REG if registry is None else registry)


print("controls")
r = run([inb(1), out(1, 2)])
ok("a dispatch with a real reply is ENDED, nothing open, no guard failure", r["ended"] == 1 and r["open"] == [] and r["guard_failed"] == [], r)
ok("the Coltrane NOT CHECKED line is printed every run", r["not_checked"] and "NOT CHECKED" in r["not_checked"][0])

print("(6) two open dispatches, one answered -> the other still open")
r = run([inb(1), inb(5), out(1, 2)])
ok("the unanswered one stays OPEN", [o["id"] for o in r["open"]] == [str(sid(5))] and r["ended"] == 1, r)
print("(7) an unmapped sender_username")
r = run([inb(1, su="Codex#0000")])
ok("GUARD FAILED, never a skip", any("unmapped sender" in g for g in r["guard_failed"]), r)
ok("excluded by name: self-advance and kylegjordan are not failures", run([inb(1, su="self-advance"), inb(2, su="kylegjordan")])["guard_failed"] == [])
print("(8) an unmapped cc_outbound sender")
r = run([cco(1, "hello", sender="Codex")])
ok("GUARD FAILED", any("unmapped cc_outbound sender" in g for g in r["guard_failed"]), r)
ok("machine senders are excluded by name", run([cco(1, "x", sender="Push notice"), cco(2, "y", sender="Heartbeat")])["guard_failed"] == [])
print("(9) an unknown kind")
r = run([{"kind": "langston_new_thing", "message_id": sid(1)}])
ok("GUARD FAILED", any("unknown kind" in g for g in r["guard_failed"]), r)
r = run([{"kind": "langston_new_thing", "ts": "2099-01-01T00:00:00Z"}])
ok("...even on a row with no id at all (placed by its own ts)", any("unknown kind" in g for g in r["guard_failed"]), r)
print("(10) an unknown silent reason")
r = run([inb(1), sil(1, "some new reason")])
ok("GUARD FAILED", any("unknown silent reason" in g for g in r["guard_failed"]), r)
print("(11) a duplicated dispatch row")
r = run([inb(1), inb(1), inb(1)])
ok("listed once", len(r["open"]) == 1 and r["counts"]["dispatches"] == 1, r)
print("(12) only reply is bridge_error_suppressed")
r = run([inb(1), sil(1, "bridge_error_suppressed")])
ok("OPEN, with the reason", r["open"] and r["open"][0]["note"] == "bridge_error_suppressed", r)
ok("circuit_breaker likewise OPEN", (run([inb(1), sil(1, "circuit_breaker")])["open"] or [{}])[0].get("note") == "circuit_breaker")
print("(13) a reply row with a null message_id")
r = run([inb(1), out(1, 2, mid=False)])
ok("OPEN (a reply with no message id is a post that failed)", len(r["open"]) == 1 and r["ended"] == 0, r)
ok("a langston_outbound_media reply with an id ENDS it", run([inb(1), out(1, 2, kind="langston_outbound_media")])["ended"] == 1)
print("(14) a near-miss decline string")
r = run([inb(1), sil(1, "[SILENT] addressed to Claude New (CC-B), not me.")])
ok("GUARD FAILED (exact equality, never a prefix)", any("unknown silent reason" in g for g in r["guard_failed"]), r)
for dcl in sorted(dc.DECLINE):
    ok("the exact decline %r ENDS the dispatch" % dcl[:30], run([inb(1), sil(1, dcl)])["ended"] == 1)
print("(15) a sent dispatch with no inbound row")
r = run([cco(1, "Langston — review the writer please")])
ok("NOT RECEIVED, listed by id", r["not_received"] == [str(sid(1))], r)
ok("a post that names Langston only LATER is not checked", run([cco(1, "OLD Claude — Langston said yes")])["not_received"] == [])
ok("a post received under its own id is fine", run([cco(1, "Langston — x"), inb(1, text="Langston — x")])["not_received"] == [])
print("(16) a two-piece dispatch")
p1 = "Langston — first piece of a long review request\n\nwith  a blank line and a double space"   # the PIECE itself has
p2 = "second piece continues the request"                                                     # runs of whitespace
r = run([cco(1, p1), cco(1, p2), inb(3, text=p1.replace(" with ", "\nwith ") + "\n" + p2)])
ok("both pieces matched on whitespace-normalised text: nothing NOT RECEIVED", r["not_received"] == [] and r["guard_failed"] == [], r)
r = run([cco(1, p1), inb(3, text="something else entirely")])
ok("...and a piece with no matching inbound text IS listed (the matcher's negative)", r["not_received"] == [str(sid(1))], r)
print("(17) the address registry swapped for SESSION_NAMES")
r = run([inb(1)], registry=addr.SESSION_NAMES)
ok("GUARD FAILED before any row is read", r["guard_failed"] and "LANGSTON" in r["guard_failed"][0] and r["open"] == [], r)
print("(18) a Coltrane row in the window")
r = run([{"kind": "cc_outbound", "sender": "Coltrane", "text": "Langston — hello", "ts": "2026-11-06T18:00:00Z"}])
ok("the named excluded path: NOT CHECKED, neither GUARD FAILED nor NOT RECEIVED",
   r["guard_failed"] == [] and r["not_received"] == [] and "NOT CHECKED" in r["not_checked"][0], r)

print("window and other alias")
ok("a dispatch before the window is not counted", run([{"kind": "langston_inbound", "message_id": BASE - (1 << 22), "sender_username": "Infra Claude#0000", "text": "x"}])["open"] == [])
ok("another session's dispatch is not this session's", run([inb(1, su="NEW Claude#0000")])["open"] == [])

print("as a process")
tmp = tempfile.mkdtemp(prefix="dt-cen-")
log = os.path.join(tmp, "inbox.jsonl")
open(log, "w", encoding="utf-8", newline="\n").write("".join(json.dumps(x) + "\n" for x in [inb(1), inb(5), out(1, 2)]) + "not json\n")
p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "dt_dispatch_census.py"), "--alias", "CC-INFRA", "--since-ms", str(SINCE),
                    "--log", log, "--address-list", ADDR], capture_output=True)
res = json.loads(p.stdout.decode("utf-8") or "{}")
ok("the process prints one JSON object with the open dispatch", p.returncode == 0 and [o["id"] for o in res.get("open", [])] == [str(sid(5))], p.stdout[:300])
p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "dt_dispatch_census.py"), "--alias", "CC-INFRA", "--since-ms", str(SINCE),
                    "--log", os.path.join(tmp, "missing.jsonl"), "--address-list", ADDR], capture_output=True)
res = json.loads(p.stdout.decode("utf-8") or "{}")
ok("an unreadable log -> GUARD FAILED, exit 3, never an empty green", p.returncode == 3 and res.get("guard_failed"), p.stdout[:300])
print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
