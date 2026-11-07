#!/usr/bin/env python3
"""Tests for dt_archive (B-TRANSCRIPT-ARCHIVE P5, the writer). `python3 -I test_dt_archive.py` — exit 0 = all pass.
Every test builds a throwaway projects tree and archive root; nothing real is read or written."""
import json
import os
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dt_archive as da  # noqa: E402
import dt_transcript as dt  # noqa: E402

try:   # a FAIL line can carry non-ASCII; on a cp1252 console that crashed the run instead of reporting the failure
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass
FAILS = []


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


SID = "0fe1c46a-a390-40b1-92b3-b160c6024f60"
SLUG = "C--DawnTraderV3-new"


def user(uid, ts, text):
    return {"type": "user", "uuid": uid, "timestamp": ts, "message": {"content": text}}


def reply(uid, ts, text):
    return {"type": "assistant", "uuid": uid, "timestamp": ts, "message": {"content": [{"type": "text", "text": text}]}}


def tree():
    base = tempfile.mkdtemp(prefix="dt-arch-")
    proj, root = os.path.join(base, "projects"), os.path.join(base, "archive")
    os.makedirs(os.path.join(proj, SLUG))
    os.makedirs(root)
    return base, proj, root


def raw_path(proj):
    return os.path.join(proj, SLUG, SID + ".jsonl")


def put(proj, entries, mode="a", partial=None):
    with open(raw_path(proj), mode, encoding="utf-8", newline="\n") as fh:
        for e in entries:
            fh.write(json.dumps(e) + "\n")
        if partial is not None:
            fh.write(partial)


def snapshot(root):
    out = {}
    for r, _d, fs in os.walk(root):
        for f in fs:
            if ".state" in r:
                continue
            p = os.path.join(r, f)
            out[os.path.relpath(p, root)] = open(p, "rb").read()
    return out


D1, D2 = "2026-10-21T10:00:0%dZ", "2026-10-22T09:00:0%dZ"
FIRST = [user("u1", D1 % 1, "hello on day one"), reply("a1", D1 % 2, "answer on day one"),
         user("u2", D2 % 1, "hello on day two")]

print("1. a first run, and a second run with nothing new")
base, proj, root = tree()
put(proj, FIRST, "w")
res, ref = da.archive_all(root, proj, dt.Redactor())
snap = snapshot(root)
f1, f2 = os.path.join("CC-B", "2026-10-21_0fe1c46a.md"), os.path.join("CC-B", "2026-10-22_0fe1c46a.md")
ok("one file per session per UTC day", sorted(snap) == sorted([f1, f2]), sorted(snap))
t1 = snap.get(f1, b"").decode()
ok("the day file opens with its header and the layer (c) state", t1.startswith("# CC-B — 2026-10-21 — session " + SID)
   and "> redaction layer (c), shapeless values: OFF" in t1, t1[:300])
ok("the day file holds that day's lines only", "hello on day one" in t1 and "answer on day one" in t1 and "day two" not in t1)
ok("every archive byte is LF, never CRLF", all(b"\r\n" not in v for v in snap.values()))
da.archive_all(root, proj, dt.Redactor())
ok("a second run with no new bytes changes nothing", snapshot(root) == snap)
b0, p0, r0 = tree()
put(p0, [user("w1", D1 % 1, "said once"), reply("w2", D1 % 2, "replied once"), user("w1", D1 % 1, "said once"),
         reply("w2", D1 % 2, "replied once")], "w")
da.archive_all(r0, p0, dt.Redactor())
t0 = open(os.path.join(r0, f1), encoding="utf-8").read()
ok("a uuid repeated INSIDE one run's bytes is written once", t0.count("said once") == 1 and t0.count("replied once") == 1, t0)
shutil.rmtree(b0)

print("2. new bytes, a half-written line, a repeated uuid")
put(proj, [reply("a2", D2 % 2, "answer on day two")], partial='{"type": "user", "uuid": "u9", "timestamp": "2026-10-22T09:00:09Z", "message": {"content": "half wr')
da.archive_all(root, proj, dt.Redactor())
t2 = open(os.path.join(root, f2), encoding="utf-8").read()
ok("only the new whole line is added", t2.count("answer on day two") == 1 and "half wr" not in t2, t2)
with open(raw_path(proj), "a", encoding="utf-8", newline="\n") as fh:
    fh.write('itten"}}\n')
put(proj, [user("u1", D1 % 1, "hello on day one"), reply("a1", D1 % 2, "answer on day one")])   # compaction re-append
da.archive_all(root, proj, dt.Redactor())
t1b, t2b = open(os.path.join(root, f1), encoding="utf-8").read(), open(os.path.join(root, f2), encoding="utf-8").read()
ok("the finished line is picked up next run", "half written" in t2b, t2b)
ok("a uuid the raw file repeats is not written again", t1b.count("hello on day one") == 1 and t1b.count("answer on day one") == 1, t1b)
st = json.load(open(da.state_path(root, da.raw_files(proj)[0]), encoding="utf-8"))
ok("the offset is the raw file's whole size", st["offset"] == os.path.getsize(raw_path(proj)))
shutil.rmtree(base)

print("3. a crash between writing and committing is recovered exactly")
def clean_result(extra):
    b, p, r = tree()
    put(p, FIRST, "w")
    da.archive_all(r, p, dt.Redactor())
    put(p, extra)
    da.archive_all(r, p, dt.Redactor())
    s = snapshot(r)
    shutil.rmtree(b)
    return s


EXTRA = [reply("a3", D2 % 3, "late answer"), user("u3", "2026-10-23T08:00:00Z", "a brand new day")]
want = clean_result(EXTRA)
base, proj, root = tree()
put(proj, FIRST, "w")
da.archive_all(root, proj, dt.Redactor())
put(proj, EXTRA)
real = da.write_state
OLD_OFF = json.load(open(da.state_path(root, da.raw_files(proj)[0]), encoding="utf-8"))["offset"]


def dying(path, st):
    # die on the commit that ADVANCES THE OFFSET - whatever came before it (an intent commit) is allowed through.
    # Keyed on the offset, not on a call count, so removing the intent commit cannot move the crash to a harmless call.
    if st["offset"] != OLD_OFF:
        raise RuntimeError("simulated crash")
    real(path, st)


da.write_state = dying
try:
    da.archive_all(root, proj, dt.Redactor())
except RuntimeError:
    pass
da.write_state = real
mid = snapshot(root)
ok("the crash left appended but uncommitted bytes (the case under test is real)",
   "late answer" in mid.get(f2, b"").decode() and os.path.join("CC-B", "2026-10-23_0fe1c46a.md") in mid, sorted(mid))
os.remove(da.state_path(root, da.raw_files(proj)[0]) + ".lock") if os.path.exists(da.state_path(root, da.raw_files(proj)[0]) + ".lock") else None
da.archive_all(root, proj, dt.Redactor())
ok("after recovery the archive is byte-identical to a run that never crashed", snapshot(root) == want,
   {k: (len(snapshot(root).get(k, b"")), len(want.get(k, b""))) for k in set(want) | set(snapshot(root))})
shutil.rmtree(base)

print("4. refusals")
base, proj, root = tree()
put(proj, FIRST, "w")
open(os.path.join(proj, SLUG, SID[:8] + "-ffff-ffff-ffff-ffffffffffff.jsonl"), "w").write(json.dumps(user("z1", D1 % 5, "other")) + "\n")
try:
    da.archive_all(root, proj, dt.Redactor())
    ok("two sessions sharing an 8-character prefix stop the run", False)
except da.Refused as e:
    ok("two sessions sharing an 8-character prefix stop the run", "collision" in str(e), str(e))
ok("...BEFORE anything is written", snapshot(root) == {} and not os.path.exists(os.path.join(root, ".state")))
shutil.rmtree(base)
base, proj, root = tree()
put(proj, FIRST, "w")
da.archive_all(root, proj, dt.Redactor())
sp = da.state_path(root, da.raw_files(proj)[0])
open(sp + ".lock", "w").write("123 x\n")
put(proj, [reply("a4", D2 % 4, "while locked")])
res, ref = da.archive_all(root, proj, dt.Redactor())
ok("a held lock refuses that file and writes nothing to it", ref and "locked" in ref[0]
   and "while locked" not in open(os.path.join(root, f2), encoding="utf-8").read(), ref)
if os.path.exists(sp + ".lock"):
    os.remove(sp + ".lock")
with open(os.path.join(root, f2), "r+b") as fh:
    fh.truncate(10)
res, ref = da.archive_all(root, proj, dt.Redactor())
ok("an archive file shorter than its committed length is refused, not repaired", ref and "shorter" in ref[0], ref)
shutil.rmtree(base)

print("5. a queued notice is held, cancelled by a later delivery, or released after its hour")
TN = ("<task-notification>\n<task-id>q1</task-id>\n<status>failed</status>\n"
      "<summary>Background command \"Re-arm\" failed with exit code 4</summary>\n</task-notification>")
Q = {"type": "queue-operation", "operation": "enqueue", "timestamp": "2026-10-21T12:00:00Z", "content": TN}
base, proj, root = tree()
put(proj, FIRST[:2] + [Q], "w")
mt = os.path.getmtime(raw_path(proj))
da.archive_all(root, proj, dt.Redactor(), now=mt + 60)
ok("an undelivered notice is HELD, not written, while its hour runs", "Re-arm" not in open(os.path.join(root, f1), encoding="utf-8").read())
st = json.load(open(da.state_path(root, da.raw_files(proj)[0]), encoding="utf-8"))
ok("the state holds its key and redacted display line, never the raw notice", len(st["held"]) == 1 and TN not in json.dumps(st)
   and "<task-id>" not in json.dumps(st) and st["held"][0]["key"] == dt.text_key(TN))
put(proj, [user("d1", "2026-10-21T12:00:05Z", TN)])
da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 60)
t = open(os.path.join(root, f1), encoding="utf-8").read()
ok("a delivery in a LATER run cancels the held notice: one wake line, no queued line",
   t.count("Re-arm") == 1 and "queued" not in t, t)
st = json.load(open(da.state_path(root, da.raw_files(proj)[0]), encoding="utf-8"))
ok("...the held notice is GONE from the state, not merely still waiting", st["held"] == [], st["held"])
da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 3 * da.HOLD_S)
ok("...so even after its hour it is never written", "queued" not in open(os.path.join(root, f1), encoding="utf-8").read())
shutil.rmtree(base)
base, proj, root = tree()
put(proj, FIRST[:2] + [Q], "w")
mt = os.path.getmtime(raw_path(proj))
da.archive_all(root, proj, dt.Redactor(), now=mt + 60)
da.archive_all(root, proj, dt.Redactor(), now=mt + da.HOLD_S + 60)
t = open(os.path.join(root, f1), encoding="utf-8").read()
ok("after an hour of file quiet the held notice is written, labelled queued", t.count("queued; no delivered copy") == 1, t)
da.archive_all(root, proj, dt.Redactor(), now=mt + 2 * da.HOLD_S)
ok("...and only once", open(os.path.join(root, f1), encoding="utf-8").read().count("queued; no delivered copy") == 1)
shutil.rmtree(base)

print("6. the layer (c) state line follows the state; nested transcripts; dry run")
base, proj, root = tree()
put(proj, FIRST[:1], "w")
da.archive_all(root, proj, dt.Redactor())
KEY = bytes(range(32))
import hmac, hashlib
sv = "Qm" + "7Vx2Lp9Rt4Wz8Kc"
hs = [{"name": "FRED_API_KEY", "length": len(sv), "hmac": hmac.new(KEY, sv.encode(), hashlib.sha256).hexdigest(), "key_id": dt.key_id(KEY)}]
put(proj, [reply("a5", D1 % 6, "the key is " + sv)])
da.archive_all(root, proj, dt.Redactor(hs, key=KEY))
t = open(os.path.join(root, f1), encoding="utf-8").read()
ok("the state line is written again where it changes", "values: OFF" in t and "values: ON, 1 value(s)" in t and sv not in t, t)
put(proj, [reply("a6", D1 % 7, "more")])
da.archive_all(root, proj, dt.Redactor(hs, key=KEY))
ok("...and not repeated while it stays the same", open(os.path.join(root, f1), encoding="utf-8").read().count("values: ON") == 1)
nd = os.path.join(proj, SLUG, SID, "subagents")
os.makedirs(nd)
open(os.path.join(nd, "agent-abc.jsonl"), "w").write(json.dumps(reply("n1", D1 % 8, "nested work")) + "\n")
put(proj, [{"type": "assistant", "uuid": "c1", "timestamp": D1 % 8, "sessionId": SID, "message": {"content": [
              {"type": "tool_use", "id": "tA", "name": "Agent", "input": {"description": "Do the nested work"}}]}},
           {"type": "user", "uuid": "c2", "timestamp": D1 % 9, "sessionId": SID, "toolUseResult": {"agentId": "abc"},
            "message": {"content": [{"type": "tool_result", "tool_use_id": "tA", "content": "done"}]}}])
da.archive_all(root, proj, dt.Redactor())
nf = os.path.join(root, "CC-B", "sub", SID[:8], "subagents__agent-abc.md")
ok("a nested transcript lands under sub/<parent8>/, labelled linked by folder",
   os.path.exists(nf) and "linked by FOLDER" in open(nf, encoding="utf-8").read() and "nested work" in open(nf, encoding="utf-8").read())
pt = open(os.path.join(root, f1), encoding="utf-8").read()
import re as _re
lk = _re.findall(r"nested transcript `([^`]+)`", pt)
put(proj, [{"type": "assistant", "uuid": "c3", "timestamp": "2026-10-21T10:00:30Z", "sessionId": SID, "message": {"content": [
              {"type": "tool_use", "id": "tB", "name": "Agent", "input": {"description": "Trimmed work"}}]}},
           {"type": "user", "uuid": "c4", "timestamp": "2026-10-21T10:00:31Z", "sessionId": SID, "toolUseResult": {"agentId": "gone"},
            "message": {"content": [{"type": "tool_result", "tool_use_id": "tB", "content": "done"}]}}])
da.archive_all(root, proj, dt.Redactor())
pt2 = open(os.path.join(root, f1), encoding="utf-8").read()
ok("a link to a nested transcript NOT on disk says so, never a pointer nobody can follow",
   "Trimmed work → nested transcript for agent `gone` is not on disk" in pt2 and "subagents__agent-gone.md" not in pt2, pt2[-300:])
ok("the parent's agent-call line names EXACTLY the nested file the writer made",
   lk == ["sub/%s/subagents__agent-abc.md" % SID[:8]] and os.path.exists(os.path.join(root, "CC-B", *lk[0].split("/"))), (lk, pt[-400:]))
before = snapshot(root)
put(proj, [reply("a7", D1 % 9, "dry")])
res, ref = da.archive_all(root, proj, dt.Redactor(), dry=True)
ok("a dry run reports and writes nothing", snapshot(root) == before and any(r["lines"] for r in res))
shutil.rmtree(base)

print("7. scope: only the five session folders")
base, proj, root = tree()
os.makedirs(os.path.join(proj, "G--My-Drive-Kasia-Projects"))
open(os.path.join(proj, "G--My-Drive-Kasia-Projects", "x.jsonl"), "w").write(json.dumps(user("k1", D1 % 1, "private")) + "\n")
put(proj, FIRST[:1], "w")
da.archive_all(root, proj, dt.Redactor())
ok("a folder outside the five is never read", all("private" not in v.decode() for v in snapshot(root).values()))
shutil.rmtree(base)

print("8. Langston P5 must-fixes")
import subprocess as _sp
base, proj, root = tree()
put(proj, FIRST, "w")
da.archive_all(root, proj, dt.Redactor())
cwd = os.getcwd()
os.chdir(base)
try:
    _r1, ref1 = da.archive_all(root, "projects", dt.Redactor())               # the SAME tree, spelled relative
    _r2, ref2 = da.archive_all(root, os.path.join(base, ".", "projects"), dt.Redactor())
finally:
    os.chdir(cwd)
t1 = open(os.path.join(root, f1), encoding="utf-8").read()
ok("MF1: two spellings of one raw file are ONE offset owner - nothing archived twice",
   t1.count("hello on day one") == 1 and len(os.listdir(os.path.join(root, ".state", "CC-B"))) == 1,
   (t1.count("hello on day one"), os.listdir(os.path.join(root, ".state", "CC-B"))))
st = json.load(open(da.state_path(root, da.raw_files(proj)[0]), encoding="utf-8"))
ok("MF1: the state records the file's identity, not a spelling", st["raw"] == da.identity(raw_path(proj)))
ok("MF1: ...and neither other spelling is REFUSED", ref1 == [] and ref2 == [], (ref1, ref2))
open(os.path.join(root, f2), "ab").write(b"uncommitted tail from a crashed run\n")
before = open(os.path.join(root, f2), "rb").read()
res, ref = da.archive_all(root, proj, dt.Redactor(), dry=True)
ok("MF2: a dry run leaves an uncommitted tail in place", open(os.path.join(root, f2), "rb").read() == before)
_b2, _p2, _r2 = tree()
put(_p2, FIRST, "w")
da.archive_all(_r2, _p2, dt.Redactor(), dry=True)
ok("a dry run on a fresh archive creates NOTHING - not even the .state folder a lock would make", os.listdir(_r2) == [], os.listdir(_r2))
shutil.rmtree(_b2)
ok("MF2: ...and REPORTS what recovery would cut", any(r.get("would_cut") and r["would_cut"][0][0] == f2 for r in res), res)
da.archive_all(root, proj, dt.Redactor())
ok("MF2: a real run then cuts it", b"uncommitted tail" not in open(os.path.join(root, f2), "rb").read())
for args in (["--hashes"], ["--key-file"], ["--hashes", "--key-file", "k"]):
    p = _sp.run([sys.executable, "-I", os.path.join(HERE, "dt_archive.py"), "--root", root, "--projects", proj] + args, capture_output=True)
    ok("MF3: %s with its value missing is REFUSED (exit 2), never run with layer (c) silently off" % " ".join(args),
       p.returncode == 2 and b"needs a value" in p.stderr, p.stderr[-200:])
shutil.rmtree(base)
ok("MF4: a UTC stamp is read as UTC (2000-01-01T00:00:00Z is 946684800 on any machine)", da._secs("2000-01-01T00:00:00Z") == 946684800)
ok("MF4: across a daylight-saving fold one hour is 3600 s", da._secs("2026-03-08T02:30:00Z") - da._secs("2026-03-08T01:30:00Z") == 3600)
ok("MF4: an unreadable stamp is None, not 0", da._secs("not a time") is None)
base, proj, root = tree()
Qbad = dict(Q, timestamp="garbled")
put(proj, FIRST[:2] + [Qbad, reply("a9", "2026-10-21T15:00:00Z", "much later")], "w")
mt = os.path.getmtime(raw_path(proj))
da.archive_all(root, proj, dt.Redactor(), now=mt + 60)
st = json.load(open(da.state_path(root, da.raw_files(proj)[0]), encoding="utf-8"))
ok("MF4: a held notice with an unreadable stamp is HELD on the session clock (only file quiet releases it)",
   len(st["held"]) == 1, st["held"])
shutil.rmtree(base)
base, proj, root = tree()
put(proj, [{"type": "user", "uuid": "nd", "message": {"content": "no timestamp at all"}}], "w")
da.archive_all(root, proj, dt.Redactor())
uf = os.path.join(root, "CC-B", "undated_0fe1c46a.md")
ok("an undated entry's file header says undated, not a cut filename",
   os.path.exists(uf) and open(uf, encoding="utf-8").read().startswith("# CC-B — undated — session"), open(uf, encoding="utf-8").read()[:80] if os.path.exists(uf) else None)
shutil.rmtree(base)

print("9. Langston P5 r2 must-fixes")
import calendar as _cal
base, proj, root = tree()
put(proj, FIRST, "w")
da.archive_all(root, proj, dt.Redactor())
open(os.path.join(root, f2), "ab").write(b"uncommitted tail from a crashed run\n")
p = _sp.run([sys.executable, "-I", os.path.join(HERE, "dt_archive.py"), "--root", root, "--projects", proj, "--dry-run"], capture_output=True)
ok("R2-MF1: a dry run PRINTS what recovery would cut, even with no new lines",
   p.returncode == 0 and b"WOULD CUT 36 uncommitted byte(s) from " in p.stdout, (p.stdout[-300:], p.stderr[-200:]))
p = _sp.run([sys.executable, "-I", os.path.join(HERE, "dt_archive.py"), "--root", root, "--projects", proj], capture_output=True)
ok("R2-MF1: a real run PRINTS the cut it made - a repair is an event, never silent",
   p.returncode == 0 and b"RECOVERED: cut 36 uncommitted byte(s) from " in p.stdout, (p.stdout[-300:], p.stderr[-200:]))
p = _sp.run([sys.executable, "-I", os.path.join(HERE, "dt_archive.py"), "--root", root, "--projects", proj,
             "--key-file", os.path.join(base, "nonexistent-key.bin")], capture_output=True)
ok("R2-MF2: --key-file without --hashes is REFUSED (exit 3), never run with layer (c) OFF",
   p.returncode == 3 and b"would run with layer (c) OFF" in p.stderr, p.stderr[-200:])
shutil.rmtree(base)
base, proj, root = tree()
put(proj, FIRST, "w")
nd = os.path.join(proj, SLUG, SID, "subagents")
os.makedirs(nd)
open(os.path.join(nd, "agent-abc.jsonl"), "w").write(json.dumps(reply("n1", D1 % 8, "nested work")) + "\n")
real_walk = os.walk


def blind_walk(top, onerror=None, **kw):
    for r, ds, fs in real_walk(top, **kw):
        if r.endswith("subagents"):
            if onerror:
                onerror(PermissionError(13, "Permission denied", r))
            continue
        yield r, ds, fs


da.os.walk = blind_walk
try:
    try:
        da.archive_all(root, proj, dt.Redactor())
        ok("R2-MF3: a nested folder that cannot be read REFUSES the run", False)
    except da.Refused as e:
        ok("R2-MF3: a nested folder that cannot be read REFUSES the run", "cannot read" in str(e) and "subagents" in str(e), str(e))
finally:
    da.os.walk = real_walk
ok("R2-MF3: ...before anything is written (no false 'not on disk' stamped)", os.listdir(root) == [], os.listdir(root))
da.archive_all(root, proj, dt.Redactor())
ok("R2-MF3: with the folder readable the nested transcript is archived", os.path.exists(os.path.join(root, "CC-B", "sub", SID[:8], "subagents__agent-abc.md")))
shutil.rmtree(base)
real_mktime = da.time.mktime
da.time.mktime = lambda t: _cal.timegm(t) - 3600         # a machine one hour off UTC, whatever zone this box is in
try:
    ok("R2-obs1: the UTC check does not depend on this machine's zone (mktime is never used)",
       da._secs("2000-01-01T00:00:00Z") == 946684800)
finally:
    da.time.mktime = real_mktime

print("10. Langston P5 r3 must-fix: the dir-vs-file decision checks its reach")
real_stat = os.stat


def stat_failing(bad, exc):
    def f(path, *a, **kw):
        if os.path.normcase(str(path)) == os.path.normcase(bad):
            raise exc
        return real_stat(path, *a, **kw)
    return f


for shape, mk in (("a session folder that cannot be stat'd (dangling junction, parent present)",
                   lambda proj: (os.path.join(proj, SLUG, SID), FileNotFoundError(2, "dangling", os.path.join(proj, SLUG, SID)))),
                  ("a slug folder that is present but unstattable",
                   lambda proj: (os.path.join(proj, SLUG), PermissionError(13, "denied", os.path.join(proj, SLUG)))),
                  ("a slug folder that is a dangling link (present name, no target)",
                   lambda proj: (os.path.join(proj, SLUG), FileNotFoundError(2, "dangling", os.path.join(proj, SLUG))))):
    base, proj, root = tree()
    put(proj, FIRST, "w")
    nd = os.path.join(proj, SLUG, SID, "subagents")
    os.makedirs(nd)
    open(os.path.join(nd, "agent-abc.jsonl"), "w").write(json.dumps(reply("n1", D1 % 8, "nested work")) + "\n")
    bad, exc = mk(proj)
    da.os.stat = stat_failing(bad, exc)
    try:
        try:
            da.archive_all(root, proj, dt.Redactor())
            ok("R3-MF1: %s REFUSES the run" % shape, False)
        except da.Refused as e:
            ok("R3-MF1: %s REFUSES the run" % shape, "cannot read" in str(e), str(e))
    finally:
        da.os.stat = real_stat
    ok("R3-MF1: ...with nothing written (no false 'not on disk' stamped)", os.listdir(root) == [], os.listdir(root))
    shutil.rmtree(base)
base, proj, root = tree()
put(proj, FIRST, "w")
ok("a session folder that is genuinely ABSENT is skipped, not refused (four of five slugs are absent here)",
   da.archive_all(root, proj, dt.Redactor())[1] == [])
shutil.rmtree(base)
# the real Windows shape: a junction whose target is gone
base, proj, root = tree()
put(proj, FIRST, "w")
tgt = os.path.join(base, "target-session")
os.makedirs(os.path.join(tgt, "subagents"))
link = os.path.join(proj, SLUG, SID)
made = False
if os.name == "nt":
    made = _sp.run(["cmd", "/c", "mklink", "/J", link, tgt], capture_output=True).returncode == 0
if made:
    shutil.rmtree(tgt)
    try:
        da.archive_all(root, proj, dt.Redactor())
        ok("R3-MF1 on a REAL dangling junction (Windows): refused", False)
    except da.Refused as e:
        ok("R3-MF1 on a REAL dangling junction (Windows): refused", "cannot read" in str(e), str(e))
    ok("R3-MF1 on a REAL dangling junction: nothing written", os.listdir(root) == [], os.listdir(root))
    os.rmdir(link)
else:
    print("skip R3-MF1 real junction: mklink /J not available here (the simulated cases above stand)")
shutil.rmtree(base, ignore_errors=True)

print("11. Langston P5 r4: a .jsonl that is neither a file nor a folder is refused, never dropped")
import stat as _st
for where in ("top", "nested"):
    base, proj, root = tree()
    put(proj, FIRST, "w")
    if where == "top":
        odd = os.path.join(proj, SLUG, "odd-session.jsonl")
    else:
        os.makedirs(os.path.join(proj, SLUG, SID, "subagents"))
        odd = os.path.join(proj, SLUG, SID, "subagents", "agent-fifo.jsonl")
    open(odd, "w").write("")
    real_stat2 = os.stat

    def fifo_stat(path, *a, **kw):
        if os.path.normcase(str(path)) == os.path.normcase(odd):
            return os.stat_result((_st.S_IFIFO | 0o644, 0, 0, 0, 0, 0, 0, 0, 0, 0))
        return real_stat2(path, *a, **kw)

    da.os.stat = fifo_stat
    try:
        try:
            da.archive_all(root, proj, dt.Redactor())
            ok("a %s .jsonl that is a FIFO (neither file nor folder) REFUSES the run" % where, False)
        except da.Refused as e:
            ok("a %s .jsonl that is a FIFO (neither file nor folder) REFUSES the run" % where, "neither a file nor a folder" in str(e), str(e))
    finally:
        da.os.stat = real_stat2
    ok("...with nothing written", os.listdir(root) == [], os.listdir(root))
    shutil.rmtree(base)

print("12. a raw file REWRITTEN IN PLACE (trim, dedup, distill) is re-read from the start; nothing new is lost or doubled")
BIG = "y" * 300
ORIG = [user("r%02d" % i, D1 % 1, "ORIGINAL %d %s" % (i, BIG)) for i in range(1, 9)]
NEW = [user("n%02d" % i, D1 % 3, "NEW %d after the rewrite" % i) for i in range(1, 6)]


def all_text(root):
    return "".join(open(os.path.join(r, f), encoding="utf-8").read() for r, _d, fs in os.walk(root)
                   for f in fs if f.endswith(".md") and ".state" not in r)


def st_of(root, proj):
    return json.load(open(da.state_path(root, da.raw_files(proj)[0]), encoding="utf-8"))


# (a) rewritten SHORTER, then the session goes on
base, proj, root = tree()
put(proj, ORIG, "w")
res0, _r = da.archive_all(root, proj, dt.Redactor())
ok("a file's FIRST run is not a re-read", res0 and res0[0].get("reread") is None, res0)
ok("a committed state carries the tail fingerprint", bool(st_of(root, proj).get("tail")), st_of(root, proj))
put(proj, [user("r01", D1 % 1, "ORIGINAL 1 (trimmed)"), user("r02", D1 % 1, "ORIGINAL 2 (trimmed)")], "w")
res, ref = da.archive_all(root, proj, dt.Redactor())
ok("a rewrite to SHORTER than the offset is reported as a re-read, nothing refused",
   ref == [] and res and res[0].get("reread", "").startswith("now ") and "shorter" in res[0]["reread"], (res, ref))
put(proj, NEW)
res, ref = da.archive_all(root, proj, dt.Redactor())
t = all_text(root)
ok("every NEW line after the rewrite is archived (the defect lost 19 of 20)", all(("NEW %d after" % i) in t for i in range(1, 6)), t[-600:])
ok("no original line is archived twice", all(t.count("ORIGINAL %d " % i) == 1 for i in range(1, 9)), [t.count("ORIGINAL %d " % i) for i in range(1, 9)])
ok("the trimmed copies are NOT added (their ids were already archived)", "(trimmed)" not in t)
ok("the run after the re-read is an ordinary one", res and not res[0].get("reread"), res)
shutil.rmtree(base)

# (b) rewritten but still LONGER than the offset: only the fingerprint can see it
base, proj, root = tree()
put(proj, ORIG[:3], "w")
da.archive_all(root, proj, dt.Redactor())
off = st_of(root, proj)["offset"]
put(proj, [user("r01", D1 % 1, "ORIGINAL 1 rewritten " + "z" * 900)] + ORIG[1:3] + NEW[:2], "w")
ok("(setup) the rewritten file is longer than the stored offset", os.path.getsize(raw_path(proj)) > off)
res, ref = da.archive_all(root, proj, dt.Redactor())
t = all_text(root)
ok("a LONGER rewrite is caught by the fingerprint and re-read", res and "changed" in (res[0].get("reread") or ""), res)
ok("...its new lines are archived and nothing is doubled", ("NEW 1 after" in t and "NEW 2 after" in t
   and all(t.count("ORIGINAL %d " % i) == 1 for i in (1, 2, 3)) and "rewritten" not in t), t[-500:])
shutil.rmtree(base)

# (c) an untouched file is never re-read
base, proj, root = tree()
put(proj, ORIG[:3], "w")
da.archive_all(root, proj, dt.Redactor())
put(proj, NEW[:1])
res, ref = da.archive_all(root, proj, dt.Redactor())
ok("an appended-to file is NOT re-read", res and res[0].get("reread") is None and res[0]["lines"] == 1, res)
shutil.rmtree(base)

# (d) a state written before the fingerprint: only SHORTER is detectable (the stated limit)
base, proj, root = tree()
put(proj, ORIG[:3], "w")
da.archive_all(root, proj, dt.Redactor())
sp = da.state_path(root, da.raw_files(proj)[0])
legacy = st_of(root, proj)
legacy.pop("tail", None)
da.write_state(sp, legacy)
put(proj, [user("r01", D1 % 1, "ORIGINAL 1 rewritten " + "z" * 900)] + ORIG[1:3] + NEW[:1], "w")
res, ref = da.archive_all(root, proj, dt.Redactor())
t = all_text(root)
ok("a legacy state (no fingerprint) is RE-READ once, even after a LONGER rewrite a size check cannot see (Langston P5 r7)",
   res and "no fingerprint yet" in (res[0].get("reread") or ""), res)
ok("...its new line is archived, nothing is doubled, the rewritten copy is not added",
   "NEW 1 after" in t and all(t.count("ORIGINAL %d " % i) == 1 for i in (1, 2, 3)) and "rewritten" not in t, t[-500:])
ok("...and the fingerprint it stamps is the one the next run checks: that run is ordinary",
   st_of(root, proj).get("tail") and not da.archive_all(root, proj, dt.Redactor())[0][0].get("reread"), st_of(root, proj))
legacy = st_of(root, proj)
legacy.pop("tail", None)
da.write_state(sp, legacy)
put(proj, ORIG[:1], "w")
res, ref = da.archive_all(root, proj, dt.Redactor())
ok("...but it does see a SHORTER one", res and "shorter" in (res[0].get("reread") or ""), res)
shutil.rmtree(base)

# (e) a dry run reports the re-read and writes nothing
base, proj, root = tree()
put(proj, ORIG[:3], "w")
da.archive_all(root, proj, dt.Redactor())
put(proj, ORIG[:1] + NEW[:1], "w")
snap, st0 = snapshot(root), st_of(root, proj)
res, ref = da.archive_all(root, proj, dt.Redactor(), dry=True)
ok("a dry run reports the re-read", res and "shorter" in (res[0].get("reread") or ""), res)
ok("...and writes nothing, the state included", snapshot(root) == snap and st_of(root, proj) == st0)
shutil.rmtree(base)

# (f) a re-read never cancels a notice earlier runs rightly HELD, using a delivery they had already weighed
base, proj, root = tree()
put(proj, FIRST[:2] + [user("d0", "2026-10-21T11:00:00Z", TN), user("d9", "2026-10-21T11:30:00Z", TN)], "w")   # TWO earlier deliveries
da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 60)
put(proj, [Q])                                                                # the notice arrives in a LATER run
da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 60)
held0 = st_of(root, proj)["held"]
ok("(setup) the notice is held after its own run", len(held0) == 1, held0)
put(proj, [user("u1", D1 % 1, "hello (trimmed)"), user("d0", "2026-10-21T11:00:00Z", TN), user("d9", "2026-10-21T11:30:00Z", TN), Q], "w")   # a SHORTER rewrite: one delivery is left over after the in-window match
res, ref = da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 60)
ok("the re-read happened", res and res[0].get("reread"), res)
ok("...and the held notice is STILL held, not cancelled by the old delivery", st_of(root, proj)["held"] == held0, st_of(root, proj)["held"])
shutil.rmtree(base)

print("13. Langston P5 r6: a HELD notice survives repeated rewrites as ONE notice; the fingerprint comes from the bytes read")
import hashlib as _hl

QN = ("<task-notification>\n<task-id>q7</task-id>\n<status>completed</status>\n"
      "<summary>Background command \"Probe\" completed</summary>\n</task-notification>")
QQ = {"type": "queue-operation", "operation": "enqueue", "timestamp": "2026-10-21T12:00:00Z", "content": QN}
for arm in ("shorter", "fingerprint"):
    base, proj, root = tree()
    put(proj, FIRST[:2] + [QQ] + ORIG[:3], "w")                  # held BECAUSE no delivery is in the file
    da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 60)
    counts = [len(st_of(root, proj)["held"])]
    for k in range(3):
        if arm == "shorter":
            put(proj, FIRST[:2] + [QQ] + [user("r01", D1 % 1, "ORIGINAL 1 (trim %d)" % k)], "w")
        else:
            put(proj, FIRST[:2] + [QQ] + [user("r01", D1 % 1, "ORIGINAL 1 rewritten %d " % k + "z" * 3000)] + ORIG[1:3], "w")
        res, ref = da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 60)
        counts.append(len(st_of(root, proj)["held"]))
        if k == 0:
            ok("(%s) the rewrite was detected" % arm, res and res[0].get("reread"), res)
    ok("(%s) one notice stays ONE held notice across three rewrites" % arm, counts == [1, 1, 1, 1], counts)
    da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 3 * da.HOLD_S)
    ok("(%s) ...and on release it is written exactly once" % arm, all_text(root).count("Probe") == 1, all_text(root).count("Probe"))
    shutil.rmtree(base)

# FINDING-2: a rewrite landing between the read and the commit must not be fingerprinted as if it were what was read
base, proj, root = tree()
put(proj, ORIG[:4], "w")
da.archive_all(root, proj, dt.Redactor())
put(proj, NEW[:2])
read_bytes = open(raw_path(proj), "rb").read()
real_distill = da.dt.distill


def distill_then_rewrite(lines, red, **kw):
    out = list(real_distill(lines, red, **kw))
    put(proj, ORIG[:1], "w")                                    # the trim lands mid-run
    return iter(out)


da.dt.distill = distill_then_rewrite
try:
    res, ref = da.archive_all(root, proj, dt.Redactor())
finally:
    da.dt.distill = real_distill
st = st_of(root, proj)
ok("the committed fingerprint is of the bytes the run READ, not of the file after the mid-run rewrite",
   st.get("tail") == _hl.sha256(read_bytes[max(0, st["offset"] - da.TAIL):st["offset"]]).hexdigest(), st)
ok("a state with offset > 0 never carries tail=None", st["offset"] > 0 and st.get("tail"), st)
put(proj, NEW[2:4])
res, ref = da.archive_all(root, proj, dt.Redactor())
t = all_text(root)
ok("...so the next run SEES the mid-run rewrite and re-reads", res and "shorter" in (res[0].get("reread") or ""), res)
ok("...and the lines after it are archived", "NEW 3 after" in t and "NEW 4 after" in t, t[-400:])
shutil.rmtree(base)

# (c): one real run stamps a legacy state with nothing new, offset unchanged; a dry run stamps nothing
base, proj, root = tree()
put(proj, ORIG[:3], "w")
da.archive_all(root, proj, dt.Redactor())
sp = da.state_path(root, da.raw_files(proj)[0])
legacy = st_of(root, proj)
legacy.pop("tail", None)
da.write_state(sp, legacy)
off0 = legacy["offset"]
da.archive_all(root, proj, dt.Redactor(), dry=True)
ok("a DRY run stamps no fingerprint on a legacy state", "tail" not in st_of(root, proj), st_of(root, proj))
res, ref = da.archive_all(root, proj, dt.Redactor())
ok("one REAL run with nothing new stamps it, offset unchanged", st_of(root, proj).get("tail") and st_of(root, proj)["offset"] == off0
   and res and res[0]["lines"] == 0, (res, st_of(root, proj)))
shutil.rmtree(base)

print("14. Langston P5 r7: the one-time legacy re-read keeps a held notice ONE notice")
base, proj, root = tree()
put(proj, FIRST[:2] + [QQ] + ORIG[:3], "w")
da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 60)
sp = da.state_path(root, da.raw_files(proj)[0])
legacy = st_of(root, proj)
legacy.pop("tail", None)
da.write_state(sp, legacy)
ok("(setup) a legacy state holding one notice", len(legacy["held"]) == 1 and "tail" not in legacy, legacy)
res, ref = da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 60)
ok("its first run is the one-time re-read", res and "no fingerprint yet" in (res[0].get("reread") or ""), res)
ok("...the notice is still ONE held notice, and nothing new was written", len(st_of(root, proj)["held"]) == 1 and res[0]["lines"] == 0,
   (st_of(root, proj)["held"], res))
da.archive_all(root, proj, dt.Redactor(), now=os.path.getmtime(raw_path(proj)) + 3 * da.HOLD_S)
ok("...and it is written exactly once on release", all_text(root).count("Probe") == 1, all_text(root).count("Probe"))
shutil.rmtree(base)

print("14b. the ONE Dawn Trader folder test, over the 24 folder names measured on the laptop 2026-11-07")
REAL = {
    "C--DawnTraderV3-old": "CC-A", "C--DawnTraderV3-new": "CC-B", "C--DawnTraderV3-analyst": "CC-C",
    "C--DawnTraderV3-infra": "CC-INFRA", "C--DawnTraderV3-pm": "CC-PM",
    "C--DawnTraderV3": "excluded", "G--My-Drive-Dawn-Trader": "HEARTBEAT",
    "C--Users-kyleg-AppData-Local-Temp-claude-C--DawnTraderV3-old-66dbb030-b3cb-4448-8086-39344c645007-scratchpad": "excluded",
    "G--My-Drive-Dawn-Trader-DT-Clone-Repo-DawnTraderV3": "excluded",
    "G--My-Drive-Dawn-Trader-DT-Clone-Repo-DawnTraderV3-ARCHIVE-20260727-201449": "excluded",
    "G--My-Drive-Dawn-Trader-DT-Clone-Repo-DawnTraderV3-BACKUP-20260727-201449": "excluded",
    # Dawn Trader by name, EMPTY today: UNMAPPED, which the run makes loud only if one ever holds a conversation
    "C--Users-kyleg--claude-projects-C--DawnTraderV3-old-66dbb030-b3cb-4448-8086-39344c645007-subagents-workflows-wf-d8bbea22-0a5": "UNMAPPED",
    "G--My-Drive-Dawn-Trader-DT-Clone_Repo-DawnTraderV3": "UNMAPPED",
    # not Dawn Trader by name: never read (crew-status-work is Dawn Trader's by content - KNOWN_OUTSIDE records it)
    "C--": "outside", "C--Users-kyleg--claude-crew-status-work": "outside", "DT-SHARED-MEMORY": "outside",
    "G--My-Drive": "outside", "G--My-Drive-1--Docs": "outside", "G--My-Drive-2--KJ-AI-Projects": "outside",
    "G--My-Drive-2--KJ-AI-Projects-Client-Engagement-Infrastructure-Proposal-Co-Pilot": "outside",
    "G--My-Drive-2--KJ-AI-Projects-Fantasy-Football": "outside", "G--My-Drive-2--KJ-AI-Projects-Finances-Tracker": "outside",
    "G--My-Drive-Kasia-Projects-Kasia-Marketing-Materials-Generator": "outside",
    "I--Shared-drives-Mundo-TNMI-Shared-Files-1-TNMI-OpsPlat-Build": "outside",
}
got = {s: da.dt_folder_class(s) for s in REAL}
ok("all 24 measured folders classed as recorded", len(REAL) == 24 and got == REAL, {s: g for s, g in got.items() if g != REAL[s]})
ok("every EXCLUDED name is a Dawn Trader name (an exclusion the test cannot reach is dead)",
   all(da.dt_folder_class(s) == "excluded" for s in da.EXCLUDED), [s for s in da.EXCLUDED if da.dt_folder_class(s) != "excluded"])
ok("the name test is case-blind, both spellings", da.dt_folder_class("x-DAWNTRADER-y") == "UNMAPPED"
   and da.dt_folder_class("x-dawn-trader") == "UNMAPPED" and da.dt_folder_class("x-Dawn_Trader") == "outside")

print("15. a HELD notice keeps the layer (c) state it was redacted under, across a switch (held-notice item, P5 r7)")
SECRET_TN = ("<task-notification>\n<task-id>q9</task-id>\n<status>failed</status>\n"
             "<summary>Background command \"Probe " + sv + "\" failed</summary>\n</task-notification>")
SQ = {"type": "queue-operation", "operation": "enqueue", "timestamp": "2026-10-21T12:00:00Z", "content": SECRET_TN}
OFF, ON = dt.Redactor(), dt.Redactor(hs, key=KEY)


def block_of(text, needle):
    """The C-9 state line in force for the first archive line holding `needle` (the last state line above it)."""
    state = None
    for ln in text.splitlines():
        if ln.startswith("> redaction layer (c)"):
            state = ln
        elif needle in ln:
            return state
    return "NEEDLE NOT FOUND"


# (a) held under OFF, released under ON with no re-read: written under its OWN (OFF) state line
base, proj, root = tree()
put(proj, FIRST[:2] + [SQ], "w")
da.archive_all(root, proj, OFF, now=os.path.getmtime(raw_path(proj)) + 60)
held = st_of(root, proj)["held"]
ok("(a) a new hold records the state it was redacted under", len(held) == 1 and held[0].get("c9") == OFF.layer_c_state(), held)
put(proj, [reply("z1", "2026-10-21T13:30:00Z", "later work")])
da.archive_all(root, proj, ON, now=os.path.getmtime(raw_path(proj)) + 60)
t = all_text(root)
ok("(a) the released notice sits under the OFF state line, never under ON", "values: OFF" in (block_of(t, "Probe") or ""), (block_of(t, "Probe"), t))
ok("(a) ...and the next fresh line is under the ON state line again", "values: ON" in (block_of(t, "later work") or ""), block_of(t, "later work"))
shutil.rmtree(base)

# (b) held under OFF, then the file is rewritten and re-read under ON: the hold is refreshed from the bytes
base, proj, root = tree()
put(proj, FIRST[:2] + [SQ] + ORIG[:3], "w")
da.archive_all(root, proj, OFF, now=os.path.getmtime(raw_path(proj)) + 60)
ok("(b setup) the OFF-era hold carries the shapeless value in its stored line", sv in json.dumps(st_of(root, proj)["held"]), st_of(root, proj)["held"])
put(proj, FIRST[:2] + [SQ] + [user("r01", D1 % 1, "ORIGINAL 1 (trimmed)")], "w")
res, ref = da.archive_all(root, proj, ON, now=os.path.getmtime(raw_path(proj)) + 60)
h = st_of(root, proj)["held"]
ok("(b) the re-read happened and the notice is still ONE hold", res and res[0].get("reread") and len(h) == 1, (res, h))
ok("(b) ...its stored line is re-redacted under ON, and records ON", len(h) == 1 and sv not in h[0]["line"] and h[0].get("c9") == ON.layer_c_state(), h)
da.archive_all(root, proj, ON, now=os.path.getmtime(raw_path(proj)) + 3 * da.HOLD_S)
t = all_text(root)
ok("(b) on release it is written once, under ON, without the value", t.count("Probe") == 1 and sv not in t and "values: ON" in (block_of(t, "Probe") or ""),
   (t.count("Probe"), block_of(t, "Probe")))
shutil.rmtree(base)

# (d) THE REACHABLE SWITCH (Langston P5 r7 review FINDING-1): the run refuses layer (c) OFF, so production goes
# ON, N -> ON, N+1. A hold minted before the second value is written under `ON, 1` with that value in clear, and the
# next fresh line under `ON, 2` - so no reader of the `ON, 2` line concludes the second value was redacted there.
sv2 = "Zk" + "8Pq3Rm7Tw2Xy5Lb"
hs2 = hs + [{"name": "OTHER_API_KEY", "length": len(sv2), "hmac": hmac.new(KEY, sv2.encode(), hashlib.sha256).hexdigest(),
             "key_id": dt.key_id(KEY)}]
ON2 = dt.Redactor(hs2, key=KEY)
SQ2 = dict(SQ, content=SECRET_TN.replace(sv, sv2))
base, proj, root = tree()
put(proj, FIRST[:2] + [SQ2], "w")
da.archive_all(root, proj, ON, now=os.path.getmtime(raw_path(proj)) + 60)
put(proj, [reply("z3", "2026-10-21T13:30:00Z", "after the second value")])
da.archive_all(root, proj, ON2, now=os.path.getmtime(raw_path(proj)) + 3 * da.HOLD_S)
t = all_text(root)
ok("(d) ON,1 -> ON,2: the hold is written under its own `ON, 1` line (the value it could not reach, in clear)",
   "ON, 1 value(s)" in (block_of(t, "Probe") or "") and sv2 in t, block_of(t, "Probe"))
ok("(d) ...and the fresh line under `ON, 2`", "ON, 2 value(s)" in (block_of(t, "after the second value") or ""),
   block_of(t, "after the second value"))
shutil.rmtree(base)

# (e) a refresh takes the ORDER from the re-read bytes too (a trim can move the enqueue): it equals a fresh archive's
base, proj, root = tree()
put(proj, FIRST[:2] + [SQ] + ORIG[:3], "w")
da.archive_all(root, proj, ON, now=os.path.getmtime(raw_path(proj)) + 60)
put(proj, FIRST[:1] + [SQ], "w")                                   # rewritten SHORTER, the enqueue one line earlier
da.archive_all(root, proj, ON, now=os.path.getmtime(raw_path(proj)) + 60)
fresh = os.path.join(base, "fresh")
os.makedirs(fresh)
da.archive_all(fresh, proj, ON, now=os.path.getmtime(raw_path(proj)) + 60)
ho, hf = st_of(root, proj)["held"], st_of(fresh, proj)["held"]
ok("(e) the refreshed hold's order is the re-read bytes' order", len(ho) == 1 and len(hf) == 1 and ho[0]["order"] == hf[0]["order"],
   (ho, hf))
shutil.rmtree(base)

# (c) a hold from a state written before holds recorded their state: the archive says NOT RECORDED
base, proj, root = tree()
put(proj, FIRST[:2] + [SQ], "w")
da.archive_all(root, proj, OFF, now=os.path.getmtime(raw_path(proj)) + 60)
sp = da.state_path(root, da.raw_files(proj)[0])
legacy = st_of(root, proj)
for _h in legacy["held"]:
    _h.pop("c9", None)
da.write_state(sp, legacy)
da.archive_all(root, proj, OFF, now=os.path.getmtime(raw_path(proj)) + 3 * da.HOLD_S)
t = all_text(root)
ok("(c) a legacy hold is written under the NOT RECORDED line, not under a borrowed state", block_of(t, "Probe") == da.C9_UNRECORDED, (block_of(t, "Probe"), t))
put(proj, [reply("z2", "2026-10-21T15:00:00Z", "after the legacy release")])
da.archive_all(root, proj, OFF, now=os.path.getmtime(raw_path(proj)) + 60)
ok("(c) ...and the next line is under the real state line again", "values: OFF" in (block_of(all_text(root), "after the legacy") or ""),
   block_of(all_text(root), "after the legacy"))
shutil.rmtree(base)

print("17. a GATED folder (heartbeat runs): a conversation is archived only if it holds a human turn - default-human")
HB = "G--My-Drive-Dawn-Trader"


def sched(uid, ts):
    return {"type": "user", "uuid": uid, "timestamp": ts, "message": {"content": '<scheduled-task name="wake-watcher-heartbeat">run</scheduled-task>'}}


def tool_res(uid, ts):
    return {"type": "user", "uuid": uid, "timestamp": ts, "message": {"content": [{"type": "tool_result", "tool_use_id": "t", "content": "x"}]}}


def queued(uid, ts, text):
    return {"type": "attachment", "uuid": uid, "timestamp": ts, "attachment": {"type": "queued_command", "prompt": text}}


T0 = "2026-10-21T10:0%d:00Z"
CASES = {   # session id -> (entries, archived?)
    "a1000001-0000-0000-0000-000000000000": ([sched("m1", T0 % 1), tool_res("m2", T0 % 2), reply("m3", T0 % 3, "MACHINE-ONLY-RUN")], False),
    "a1000002-0000-0000-0000-000000000000": ([sched("h1", T0 % 1), user("h2", T0 % 2, "okay, please stop for the rest of the day")], True),
    "a1000003-0000-0000-0000-000000000000": ([sched("q1", T0 % 1), queued("q2", T0 % 2, "KYLE-QUEUED please stop"),
                                              reply("q3", T0 % 3, "QUEUED-RUN-REPLY")], True),
    "a1000004-0000-0000-0000-000000000000": ([sched("i1", T0 % 1), {"type": "user", "uuid": "i2", "timestamp": T0 % 2, "message": {
        "content": [{"type": "image", "source": {}}]}}, reply("i3", T0 % 3, "IMAGE-RUN-REPLY")], True),
    "a1000005-0000-0000-0000-000000000000": ([sched("n1", T0 % 1)] + [user("n%d" % k, T0 % (k + 1), t) for k, t in enumerate((
        "<task-notification>\n<task-id>x</task-id>", "continue heartbeat", "continue wake-watcher-heartbeat now",
        "resume wake-watcher-heartbeat", "# Autonomous loop check", "[Request interrupted by user]",
        "[Your previous response had no text]"), 2)] + [{"type": "user", "uuid": "nm", "timestamp": T0 % 9, "isMeta": True,
        "message": {"content": "META-ONLY"}}, reply("n9", T0 % 9, "SHAPES-ONLY-RUN")], False),
}


def hb_tree():
    base = tempfile.mkdtemp(prefix="dt-hb-")
    proj, root = os.path.join(base, "projects"), os.path.join(base, "archive")
    os.makedirs(os.path.join(proj, HB))
    os.makedirs(root)
    for sid, (entries, _w) in CASES.items():
        with open(os.path.join(proj, HB, sid + ".jsonl"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write("".join(json.dumps(e) + "\n" for e in entries))
    return base, proj, root


base, proj, root = hb_tree()
calls = []
_real = da.human_turn
da.human_turn = lambda p: calls.append(p) or _real(p)
da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
got = {sid: any(f.endswith(sid[:8] + ".md") for _r, _d, fs in os.walk(os.path.join(root, "HEARTBEAT")) for f in fs) for sid in CASES}
ok("only the runs holding a human turn are archived (typed, queued_command, image), machine-only runs are not",
   got == {s: w for s, (_e, w) in CASES.items()}, got)
t = all_text(root)
ok("...a queued_command-only run is IN (the measured shape a user-entry count missed)", "QUEUED-RUN-REPLY" in t)
ok("...every enumerated machine shape and isMeta stays OUT", "SHAPES-ONLY-RUN" not in t and "MACHINE-ONLY-RUN" not in t)
ok("...the judgement is cached on disk", os.path.exists(os.path.join(root, "gate-cache.json")))
n1 = len(calls)
da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
ok("an unchanged run is NOT re-read (the cache answers); an archived one is in by its state", len(calls) == n1, (n1, len(calls)))
mo = os.path.join(proj, HB, "a1000001-0000-0000-0000-000000000000.jsonl")
with open(mo, "a", encoding="utf-8", newline="\n") as fh:
    fh.write(json.dumps(user("m9", "2026-10-21T10:59:00Z", "KYLE-LATER on a machine run")) + "\n")
da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
ok("a machine run that LATER gets a human turn is re-judged (size changed) and archived, from its start",
   "KYLE-LATER" in all_text(root) and "MACHINE-ONLY-RUN" in all_text(root), all_text(root)[-400:])
cp = os.path.join(root, "gate-cache.json")
cache = json.load(open(cp, encoding="utf-8")) if os.path.exists(cp) else {}
for k in cache:
    cache[k][2] = False                                      # a cache that wrongly says machine for every file
json.dump(cache, open(cp, "w", encoding="utf-8"))
before = all_text(root)
res_p, _r = da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
ok("an archived run stays archived whatever the cache says (its state answers first): still LISTED, nothing lost",
   all_text(root) == before and len([r for r in res_p if "HEARTBEAT" in r["raw"] or HB in r["raw"]]) == 4, len(res_p))
if os.path.exists(cp):
    os.remove(cp)
shutil.rmtree(os.path.join(root, ".state"), ignore_errors=True)
shutil.rmtree(os.path.join(root, "HEARTBEAT"), ignore_errors=True)
da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
ok("a lost cache costs a re-scan, never a miss: the queued_command run is found again", "QUEUED-RUN-REPLY" in all_text(root))
da.human_turn = _real
shutil.rmtree(base)
base, proj, root = hb_tree()
da.archive_all(root, proj, dt.Redactor(), dry=True)
ok("a dry run writes no gate cache", not os.path.exists(os.path.join(root, "gate-cache.json")))
shutil.rmtree(base)

print("18. Langston P10 review: a parentless nested file (C-2), a corrupt cache (C-3), the two content shapes (obs (a))")
SUBP = "a1000009-0000-0000-0000-000000000000"
for label, entries, want in (("C-2: a nested file with a human turn whose TOP file is absent is judged and archived",
                              [user("s1", T0 % 1, "kyle typed this inside a subagent run")], True),
                             ("C-2: ...a parentless nested file with no human turn is not",
                              [tool_res("s2", T0 % 1)], False)):
    base, proj, root = tree()
    d = os.path.join(proj, HB, SUBP, "subagents")
    os.makedirs(d)
    with open(os.path.join(d, "agent-x.jsonl"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("".join(json.dumps(e) + "\n" for e in entries))
    g = da.Gate(root)
    res, ref = da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S, gate=g)
    listed = [r for r in res if "agent-x" in r["raw"]]
    ok(label, bool(listed) == want and ref == [] and g.seen.get("HEARTBEAT", 0) == 0, (res, ref, g.seen))
    shutil.rmtree(base)
for label, body in (("C-3: a TRUNCATED cache", '{"a": [1, 2'), ("C-3: an EMPTY cache file", ""),
                    ("C-3: a cache that is a JSON LIST", "[1, 2, 3]"), ("C-3: an entry of the wrong shape", '{"x": 5}')):
    base, proj, root = hb_tree()
    open(os.path.join(root, "gate-cache.json"), "w", encoding="utf-8").write(body)
    try:
        res, ref = da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
        ok(label + " costs a re-scan, never the run: the queued_command run is still found",
           "QUEUED-RUN-REPLY" in all_text(root) and ref == [], ref)
    except Exception as e:  # noqa: BLE001
        ok(label + " costs a re-scan, never the run: the queued_command run is still found", False, repr(e))
    shutil.rmtree(base)
base, proj, root = hb_tree()
qf = os.path.join(proj, HB, "a1000003-0000-0000-0000-000000000000.jsonl")
json.dump({da.identity(qf): 5}, open(os.path.join(root, "gate-cache.json"), "w", encoding="utf-8"))
try:
    res, ref = da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
    ok("C-3: a wrong-shape entry UNDER THE FILE'S OWN KEY is re-judged, never trusted or crashed on",
       "QUEUED-RUN-REPLY" in all_text(root) and ref == [], ref)
except Exception as e:  # noqa: BLE001
    ok("C-3: a wrong-shape entry UNDER THE FILE'S OWN KEY is re-judged, never trusted or crashed on", False, repr(e))
shutil.rmtree(base)
base, proj, root = hb_tree()
g = da.Gate(root)
da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S, gate=g)
ok("C-1: the gate counts TOP runs judged and kept per alias (5 judged, 3 hold a human turn)",
   g.seen == {"HEARTBEAT": 5} and g.kept == {"HEARTBEAT": 3}, (g.seen, g.kept))
shutil.rmtree(base)
print("19. Langston P10 PROCEED: the gate's retry (both arms), kind_of's re-stat, a non-bool cached verdict")
import builtins  # noqa: E402
QFILE = "a1000003-0000-0000-0000-000000000000.jsonl"


def flaky(real, fails):
    """open() that fails `fails` times on the queued_command heartbeat run, then behaves."""
    left = [fails]

    def f(file, *a, **kw):
        if str(file).endswith(QFILE) and left[0] > 0:
            left[0] -= 1
            raise PermissionError(32, "The process cannot access the file", str(file))
        return real(file, *a, **kw)
    return f


da.time.sleep, _slp = (lambda s: None), da.time.sleep
_open = builtins.open
for label, fails, want in (("the gate's retry: a read that fails ONCE is retried and the run is kept", 1, "kept"),
                           ("...a read that keeps failing REFUSES - never 'no human turn'", 99, "refused")):
    base, proj, root = hb_tree()
    builtins.open = flaky(_open, fails)
    try:
        res, ref = da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
        got = "kept" if "QUEUED-RUN-REPLY" in all_text(root) else "dropped"
    except da.Refused:
        got = "refused"
    except Exception as e:  # noqa: BLE001  (a failure anywhere else must FAIL this check, never crash the suite)
        got = "escaped: %r" % e
    finally:
        builtins.open = _open
    ok(label, got == want, got)
    shutil.rmtree(base)
_stat = os.stat
for label, fails, want in (("kind_of: a stat that fails ONCE is re-statted and the run goes on", 1, "ok"),
                           ("...a stat that keeps failing REFUSES the run", 99, "refused")):
    base, proj, root = hb_tree()
    left = [fails]

    def st_flaky(p, *a, **kw):
        if str(p).endswith(QFILE) and left[0] > 0:
            left[0] -= 1
            raise PermissionError(32, "The process cannot access the file", str(p))
        return _stat(p, *a, **kw)
    os.stat = st_flaky
    try:
        da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
        got = "ok"
    except da.Refused:
        got = "refused"
    finally:
        os.stat = _stat
    ok(label, got == want, got)
    shutil.rmtree(base)
# MUST-FIX (Langston P10 ruling): an archived run whose STATE cannot be stat'd is refused, never silently dropped
base, proj, root = hb_tree()
da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
cp = os.path.join(root, "gate-cache.json")
cache = json.load(open(cp, encoding="utf-8")) if os.path.exists(cp) else {}   # never crash the suite
for k in cache:
    cache[k][2] = False                                           # the cache now says machine for every run
json.dump(cache, open(cp, "w", encoding="utf-8"))
qrfs = [r for r in da.raw_files(proj, gate=lambda rf: True) if r[2].endswith(QFILE)]
qsp = da.state_path(root, qrfs[0]) if qrfs else "<no such run listed>"   # never crash the suite: FAIL below


def st_state(p, *a, **kw):
    if os.path.normcase(str(p)) == os.path.normcase(qsp):
        raise PermissionError(5, "Access is denied", str(p))
    return _stat(p, *a, **kw)


os.stat = st_state
try:
    if not qrfs or not os.path.exists(qsp):
        raise RuntimeError("setup: the queued_command run has no state")
    res, ref = da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
    got = "listed" if any(r["raw"].endswith(QFILE) for r in res) else "DROPPED"
except da.Refused:
    got = "refused"
except Exception as e:  # noqa: BLE001
    got = "escaped: %r" % e
finally:
    os.stat = _stat
ok("an archived run whose state cannot be stat'd is REFUSED, never dropped on a machine cache verdict", got == "refused", got)
shutil.rmtree(base)
da.time.sleep = _slp
base, proj, root = hb_tree()
mf = os.path.join(proj, HB, "a1000001-0000-0000-0000-000000000000.jsonl")
s1 = os.stat(mf)
json.dump({da.identity(mf): [s1.st_size, s1.st_mtime_ns, "yes"]}, open(os.path.join(root, "gate-cache.json"), "w", encoding="utf-8"))
da.archive_all(root, proj, dt.Redactor(), now=time.time() + 3 * da.HOLD_S)
ok("a cached verdict that is not a bool (a truthy 'yes') is re-judged, never read as human",
   "MACHINE-ONLY-RUN" not in all_text(root), all_text(root)[:300])
shutil.rmtree(base)
ok("obs (a): content as a list of plain strings is a human turn", da._human_content(["kyle said this"]))
ok("obs (a): ...but a list holding only a machine string is not", not da._human_content(["<task-notification>x"]))
ok("obs (a): content as a bare image block is a human turn", da._human_content({"type": "image"}))
ok("obs (a): content as a bare tool_result block is not", not da._human_content({"type": "tool_result", "content": "x"}))

print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
