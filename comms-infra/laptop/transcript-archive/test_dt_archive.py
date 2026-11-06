#!/usr/bin/env python3
"""Tests for dt_archive (B-TRANSCRIPT-ARCHIVE P5, the writer). `python3 -I test_dt_archive.py` — exit 0 = all pass.
Every test builds a throwaway projects tree and archive root; nothing real is read or written."""
import json
import os
import shutil
import sys
import tempfile

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

print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
