#!/usr/bin/env python3
"""Tests for dt_transcript (B-TRANSCRIPT-ARCHIVE P2/P3). `python3 -I test_dt_transcript.py` — exit 0 = all pass.
Every planted secret below is FAKE, built at run time from fragments, so this file never holds a real key and the
repo's own redaction is never asked to hide this file."""
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dt_transcript as dt  # noqa: E402

FAILS = []


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


R = "x" * 0  # placeholder to keep fragments obvious
A40 = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0"

PLANTED = {
    "private-key-block": "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAB3Nza\n-----END OPENSSH PRIVATE KEY-----",
    "anthropic-token": "sk-" + "ant-oat01-" + A40,
    "openai-key": "sk-" + "proj-" + A40,
    "github-token": "gh" + "p_" + A40[:36],
    "discord-webhook": "https://discord.com/api/web" + "hooks/123456789012345678/" + A40 + "abcdefghij",
    "discord-bot-token": "M" + "TIzNDU2Nzg5MDEyMzQ1Njc4OTA" + "." + "Gabcde" + "." + A40[:30],
    "telegram-bot-token": "123456789" + ":AA" + A40[:33],
    "jwt": "eyJ" + "hbGciOiJIUzI1NiJ9" + ".eyJ" + "zdWIiOiIxMjM0NSJ9" + "." + A40[:20],
    "b2-application-key": "K00" + "5" + A40[:27],
    "bearer-token": "Authorization: Bearer " + A40,
    "url-credentials": "postgres://admin:" + "hunter2pass" + "@db.example:5432/x",
}

# ---- 1. every shape kind is caught, and named as its own kind ------------------------------------------------------
print("1. shapes")
for kind, secret in PLANTED.items():
    red = dt.Redactor()
    out = red("before " + secret + " after")
    ok("%s: the secret is gone" % kind, secret not in out and secret.split("\n")[0] not in out)
    ok("%s: named as its own kind" % kind, red.counts.get(kind, 0) >= 1)
    ok("%s: the text around it survives" % kind, out.startswith("before ") and out.rstrip().endswith("after"))

# ---- 2. names -----------------------------------------------------------------------------------------------------
print("2. names")
for form in ["KRAKEN_API_SECRET=%s", 'KRAKEN_API_SECRET: %s', '"KRAKEN_API_SECRET": "%s"']:
    red = dt.Redactor()
    val = "qWeRtY" + "123456plain"
    out = red(form % val)
    ok("name form %r hides the value" % form, val not in out and red.counts.get("named:KRAKEN_API_SECRET") == 1)
red = dt.Redactor()
ok("a key name with no value is left alone", red("set KRAKEN_API_SECRET in the env file") == "set KRAKEN_API_SECRET in the env file")

print("2b. names - the forms that leaked at r1 (Langston C-1, C-4)")
v = "aB3dE6" + "gH9jK2mN5pQ8"
for form in ["KRAKEN_API_SECRET='%s'", "KRAKEN_API_SECRET: '%s'", "kraken_api_secret=%s", "KRAKEN_API_SECRET -> %s",
             "export KRAKEN_API_SECRET=\"%s\" && run"]:
    red = dt.Redactor()
    out = red(form % v)
    ok("leaked form %r hides the value" % form, v not in out and red.counts.get("named:KRAKEN_API_SECRET") == 1)
red = dt.Redactor()
out = red("PASSWORD=p@ss,w0rd" + "TAILLEAK done")
ok("a comma inside an unquoted value does not leave a tail", "TAILLEAK" not in out and "w0rd" not in out and out.endswith(" done"))
red = dt.Redactor()
db = "DATABASE_URL=postgres://dtuser:" + "s3cretpw" + "@db.internal.example:5432/dawntrader"
out = red(db)
ok("DATABASE_URL: the whole value goes, host and db name included", "s3cretpw" not in out and "db.internal" not in out and "dawntrader" not in out)
ok("DATABASE_URL: the marker is intact (names run before shapes)", out == "DATABASE_URL=[REDACTED named:DATABASE_URL]")

print("2c. names - a value holding a quote, and short values (Langston C-7, C-8)")
canary = "LEAK" + "CANARY" + "x9"
BS = chr(92); Q = chr(34)
forms = ["PASSWORD=" + Q + "ab'cd" + canary + Q,
         "PASSWORD: " + Q + "a" + BS + Q + "b" + canary + Q,
         "PASSWORD: " + Q + "a" + Q + "b" + canary + Q,
         "PASSWORD=" + Q + "p@s'c" + canary + Q]
for f in forms:
    red = dt.Redactor()
    out = red(f)
    ok("quote inside the value: nothing of it survives %r" % f, canary not in out and red.counts.get("named:PASSWORD") == 1)
for f in ["PASSWORD=" + Q + "abc" + canary + " more text", "PASSWORD=abc" + Q + "def" + canary]:
    red = dt.Redactor()
    out = red(f)
    ok("an unterminated or embedded quote: the value is taken whole %r" % f, canary not in out and red.counts.get("named:PASSWORD") == 1)
for f in ["PASSWORD=ab1", "PASSWORD: ab1", "PASSWORD=x"]:
    red = dt.Redactor()
    out = red(f)
    ok("a short value is caught, no length floor: %r" % f, "ab1" not in out and out.split("=")[-1].split(": ")[-1].startswith("[REDACTED") and red.counts.get("named:PASSWORD") == 1)
red = dt.Redactor()
out = red('{"PASSWORD":"v1","next":1}')
ok("a JSON object keeps its next key", out == '{"PASSWORD":"[REDACTED named:PASSWORD]","next":1}')

print("2d. names - a prefixed name is the same secret kind (Langston r3 blocker)")
sv = "hunter" + "2zz"
for form, nm in [("DB_PASSWORD=%s", "PASSWORD"), ("PGPASSWORD=%s psql -c x", "PASSWORD"),
                 ('MYSQL_PASSWORD: "%s"', "PASSWORD"), ("APP_JWT_SECRET=%s", "JWT_SECRET"),
                 ("MY_GH_TOKEN=%s", "GH_TOKEN"), ("TEST_USER_PASSWORD = %s", "PASSWORD")]:
    red = dt.Redactor()
    out = red(form % sv)
    ok("prefixed name %r hides the value, counted under its LISTED name %s" % (form, nm),
       sv not in out and red.counts == {"named:" + nm: 1}, red.counts)
    ok("...and the text still shows the name as written", form.split("=")[0].split(":")[0].strip() in out)
red = dt.Redactor()
red("hunter2PASSWORD=x1 xPASSWORD=y2 DB_PASSWORD=z3")
ok("the counter keys are bounded by the list: three written names, one key", red.counts == {"named:PASSWORD": 3}, red.counts)
_saved = list(dt.SECRET_NAMES)
dt.SECRET_NAMES.append("TOKEN")        # a future list where one listed name ends another: the LONGEST must win
red = dt.Redactor()
red("MY_GH_TOKEN=abc123")
dt.SECRET_NAMES[:] = _saved
ok("when two listed names fit, the counter takes the LONGEST (GH_TOKEN, not TOKEN)", red.counts == {"named:GH_TOKEN": 1}, red.counts)
red = dt.Redactor()
ok("the sudoers literal NOPASSWD is not a secret", red("deploy ALL=(ALL) NOPASSWD: ALL") == "deploy ALL=(ALL) NOPASSWD: ALL" and red.counts == {})
red = dt.Redactor()
ok("a name that only CONTAINS a secret name in the middle is left alone", red("PASSWORD_HASH_ALGO=bcrypt") == "PASSWORD_HASH_ALGO=bcrypt")

# ---- 3. values by keyed hash (layer c): the value is never in the hash file, and the file is useless without the key --
print("3. values")
import hmac as _hmac
KEY = bytes(range(32))                      # a fixed test key, 32 bytes
KEY2 = bytes(range(1, 33))                  # a different one


def ent(name, v, key=KEY):
    return {"name": name, "length": len(v), "hmac": _hmac.new(key, v.encode(), hashlib.sha256).hexdigest(),
            "key_id": dt.key_id(key)}


shapeless = "zx" + "9CQ4u7Lm2Rt8Pw"  # no shape, no name
h = [ent("FINNHUB_API_KEY", shapeless)]
red = dt.Redactor(h, key=KEY)
out = red("curl -H 'X-Finnhub-Token: %s' https://x" % shapeless)
ok("a bare shapeless value is hidden by its keyed hash", shapeless not in out and red.counts.get("value:FINNHUB_API_KEY") == 1)
ok("the hash file holds no value", shapeless not in json.dumps(h))
ok("the hash file is not a plain SHA-256 of the value (useless without the key)",
   hashlib.sha256(shapeless.encode()).hexdigest() not in json.dumps(h))
red = dt.Redactor(h, key=KEY)
ok("a different token of the same length is left alone", red("zx9CQ4u7Lm2Rt8PX") == "zx9CQ4u7Lm2Rt8PX")
red = dt.Redactor()
ok("with no hash file the shapeless value is NOT caught (the stated residual)", shapeless in red(shapeless))
ok("layer (c) state says OFF in plain words when nothing loaded", "OFF" in dt.Redactor().layer_c_state() and "not switched on" in dt.Redactor().layer_c_state())
ok("layer (c) state counts what loaded", "ON, 1 value(s)" in dt.Redactor(h, key=KEY).layer_c_state())
ok("with NO key nothing loads", dt.Redactor(h).layer_c_names == 0)
red = dt.Redactor(h, key=KEY2)
ok("entries made with a DIFFERENT key are not loaded, and are counted and named", red.layer_c_names == 0
   and red.layer_c_wrong_key == 1)
ok("...and a different-key file does not catch the value", shapeless in red(shapeless))
short = [dict(ent("SHORTKEY", "a" * 11))]
ok("a value under 12 characters is named as out of reach", "OUT OF REACH" in dt.Redactor(short, key=KEY).layer_c_state() and "SHORTKEY" in dt.Redactor(short, key=KEY).layer_c_state())
ok("a malformed hash entry is not counted as loaded", dt.Redactor([{"name": "X"}, dict(ent("Y", "y" * 20), hmac="short")], key=KEY).layer_c_names == 0)
import tempfile as _tf
_d = _tf.mkdtemp(prefix="dt-test-")
_raw = os.path.join(_d, "raw.jsonl"); open(_raw, "w").write("")
_empty = os.path.join(_d, "empty.json"); open(_empty, "w").write("[]")
_keyf = os.path.join(_d, "key"); open(_keyf, "w").write(KEY.hex() + "\n")
_keyf2 = os.path.join(_d, "key2"); open(_keyf2, "w").write(KEY2.hex() + "\n")
_good = os.path.join(_d, "good.json"); open(_good, "w").write(json.dumps(h))
import io, contextlib


def _main(*a):
    _e = io.StringIO()
    with contextlib.redirect_stderr(_e), contextlib.redirect_stdout(io.StringIO()):
        r = dt.main(["dt", _raw] + list(a))
    return r, _e.getvalue()


rc, err = _main("--hashes", _empty, "--key-file", _keyf)
ok("--hashes with zero usable entries is REFUSED (exit 3), never silently off", rc == 3 and "0 usable" in err)
rc, err = _main("--hashes", _good)
ok("--hashes WITHOUT --key-file is REFUSED (exit 3)", rc == 3 and "--key-file" in err)
rc, err = _main("--hashes", _good, "--key-file", _keyf2)
ok("--hashes with the WRONG key is REFUSED (exit 3), not silently unmatched", rc == 3 and "different key" in err)
rc, err = _main("--hashes", _good, "--key-file", _keyf)
ok("--hashes with the right key runs (exit 0)", rc == 0)
_keys = os.path.join(_d, "key-short"); open(_keys, "w").write(KEY[:31].hex() + "\n")
rc, err = _main("--hashes", _good, "--key-file", _keys)
ok("a key under 32 bytes is REFUSED (exit 3)", rc == 3 and "--key-file" in err)
ok("the redactor's key id is the producer's", dt.KEY_ID_MSG == __import__("dt_secret_hashes").KEY_ID_MSG)

print("3b. values - the P3(c) contract: glued behind any '=', a trailing full stop, unreachable entries named")
sv = "Qm" + "7Vx2Lp9Rt4Wz8Kc"
hv = [ent("FRED_API_KEY", sv)]
for form in ("token=%s", "--api-key=%s", "see %s.", "api_key=%s.", "x=%s", "X=Y=%s", "a=b=c=%s."):
    red = dt.Redactor(hv, key=KEY)
    out = red(form % sv)
    ok("value caught in the form %r" % form, sv not in out and red.counts.get("value:FRED_API_KEY") == 1)
red = dt.Redactor(hv, key=KEY)
ok("the prefix before '=' is kept", red("--api-key=" + sv) == "--api-key=[REDACTED value:FRED_API_KEY]")
red = dt.Redactor(hv, key=KEY)
ok("the whole prefix before a SECOND '=' is kept", red("X=Y=" + sv) == "X=Y=[REDACTED value:FRED_API_KEY]")
red = dt.Redactor(hv, key=KEY)
ok("the trailing full stop is kept", red("see " + sv + ".") == "see [REDACTED value:FRED_API_KEY].")
red = dt.Redactor(hv, key=KEY)
ok("a value glued to another prefix is NOT caught (the stated residual)", sv in red("-p" + sv))
red = dt.Redactor(hv, key=KEY)
ok("a value with a suffix glued on is NOT caught (the stated residual)", sv in red(sv + "-old"))
un = hv + [{"name": "DATABASE_URL", "reachable": False, "reason": "contains characters outside the token set"},
           {"name": "JWT_SECRET", "reachable": False, "reason": "under 12 characters"}]
st = dt.Redactor(un, key=KEY).layer_c_state()
ok("an unreachable entry is named in the state line with its reason",
   "NOT REACHABLE" in st and "DATABASE_URL (contains characters outside the token set)" in st and "JWT_SECRET (under 12 characters)" in st)
ok("an unreachable entry is not counted as loaded", dt.Redactor(un, key=KEY).layer_c_names == 1)
_only = os.path.join(_d, "only-unreachable.json"); open(_only, "w").write(json.dumps(un[1:]))
rc, err = _main("--hashes", _only, "--key-file", _keyf)
ok("a hash file holding ONLY unreachable entries is REFUSED (exit 3)", rc == 3)

# ---- 4. the distiller: what is kept and what is dropped ------------------------------------------------------------
print("4. distiller")
T = "2026-11-06T09:00:0%dZ"
raw = [
    {"type": "user", "uuid": "u1", "timestamp": T % 1, "message": {"content": "please check " + PLANTED["anthropic-token"]}},
    {"type": "assistant", "uuid": "a1", "timestamp": T % 2, "message": {"content": [
        {"type": "thinking", "thinking": "SECRET-THOUGHT"},
        {"type": "text", "text": "Checking now."},
        {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "rm -rf x", "description": "Remove the scratch dir"}},
        {"type": "tool_use", "id": "t2", "name": "Edit", "input": {"file_path": "C:/r/a.py"}}]}},
    {"type": "user", "uuid": "u2", "timestamp": T % 3, "message": {"content": [
        {"type": "tool_result", "tool_use_id": "t1", "content": "TOOL-OUTPUT-BODY"},
        {"type": "tool_result", "tool_use_id": "t2", "is_error": True, "content": "String not found\nmore"}]}},
    {"type": "api-request-blob", "uuid": "b1", "timestamp": T % 4, "message": {"content": [{"type": "text", "text": "DUPLICATE-COPY"}]}},
    {"type": "attachment", "uuid": "x1", "timestamp": T % 5, "attachment": {"type": "hook_additional_context", "content": ["HOOK-NOISE"]}},
    {"type": "attachment", "uuid": "x2", "timestamp": T % 6, "attachment": {"type": "queued_command", "prompt": "also do Y"}},
    {"type": "user", "uuid": "c1", "timestamp": T % 7, "isCompactSummary": True, "message": {"content": [{"type": "text", "text": "Summary line one"}]}},
    {"type": "ai-title", "timestamp": T % 8, "aiTitle": "NO-UUID-TYPE"},
]
red = dt.Redactor()
out = [x[2] for x in sorted(dt.distill([json.dumps(e) for e in raw], red), key=lambda x: x[1])]
text = "\n".join(out)
ok("the user turn is kept", "please check" in text and "**[09:00:01] User:**" in text)
ok("a secret in a user turn is redacted", PLANTED["anthropic-token"] not in text and "[REDACTED anthropic-token]" in text)
ok("the reply text is kept", "Checking now." in text)
ok("thinking is dropped", "SECRET-THOUGHT" not in text)
ok("tool output is dropped", "TOOL-OUTPUT-BODY" not in text)
ok("one action line per tool call, with its own description", "Bash — Remove the scratch dir" in text)
ok("a failed tool call carries a one-line ERROR", "Edit — file_path C:/r/a.py ERROR: String not found more" in text)
ok("api-request-blob is dropped", "DUPLICATE-COPY" not in text)
ok("injected attachments are dropped", "HOOK-NOISE" not in text)
ok("a queued message is kept", "User (queued):** also do Y" in text)
ok("a compaction summary is kept whole", "compaction summary" in text and "Summary line one" in text)
ok("a type with no uuid is dropped", "NO-UUID-TYPE" not in text)
ok("every yielded line has its entry's uuid", all(x[0] for x in dt.distill([json.dumps(e) for e in raw], dt.Redactor())))
extra = [{"type": "system", "uuid": "s1", "timestamp": T % 9, "subtype": "informational", "content": "safeguards stopped the response above"},
         {"type": "system", "uuid": "s2", "timestamp": T % 9, "subtype": "brand_new_kind", "content": "X"},
         {"type": "attachment", "uuid": "x3", "timestamp": T % 9, "attachment": {"type": "never_seen"}}]
dropped = {}
text2 = chr(10).join(x[2] for x in dt.distill([json.dumps(e) for e in raw + extra], dt.Redactor(), dropped=dropped))
ok("system:informational is kept as one line (it explains a gap)", "[informational] safeguards stopped" in text2)
ok("an unknown system subtype is COUNTED as dropped, not silently lost", dropped.get("system:brand_new_kind") == 1)
ok("an unknown attachment type is counted", dropped.get("attachment:never_seen") == 1)
ok("known injected attachments are counted too", dropped.get("attachment:hook_additional_context") == 1)
empty = [{"type": "user", "uuid": "c9", "timestamp": T % 9, "isCompactSummary": True, "message": {"content": [{"type": "text", "text": "  "}]}}]
d2 = {}
got = list(dt.distill([json.dumps(e) for e in empty], dt.Redactor(), dropped=d2))
ok("an empty compaction summary is counted OR emitted, never both", got == [] and d2.get("user:compact-summary-empty") == 1)
_err2 = io.StringIO()
with contextlib.redirect_stderr(_err2), contextlib.redirect_stdout(io.StringIO()):
    rc2 = dt.main(["dt", _raw, "--verbose", "--hashes", _empty])
ok("an unknown argument is REFUSED, not allowed to shift --hashes", rc2 == 2 and "REFUSED" in _err2.getvalue())

print("4b. P5: a wake notice is ONE line; a person's words never fold into one; two text blocks in one entry")
TN = ("<task-notification>\n<task-id>bx1</task-id>\n<tool-use-id>toolu_01AbCdEfGhIjKlMnOpQrStUv</tool-use-id>\n"
      "<output-file>C:\\x\\tasks\\bx1.output</output-file>\n<status>completed</status>\n"
      "<summary>Background command \"Re-arm the wake watcher\" completed (exit code 0)</summary>\n</task-notification>")
TN2 = TN.replace("bx1", "bx2").replace("Re-arm the wake watcher", "Notify Kyle")
TNS = TN.replace("<summary>Background command \"Re-arm the wake watcher\" completed (exit code 0)</summary>\n", "")
raw4 = [
    {"type": "user", "uuid": "w1", "timestamp": T % 1, "message": {"content": TN}},
    {"type": "user", "uuid": "w2", "timestamp": T % 2, "message": {"content": [{"type": "text", "text": TN + "\n" + TN2}]}},
    {"type": "user", "uuid": "w3", "timestamp": T % 3, "message": {"content": TN + "\nAlso, Kyle here: please stop."}},
    {"type": "user", "uuid": "w4", "timestamp": T % 4, "message": {"content": TNS}},
    {"type": "user", "uuid": "w5", "timestamp": T % 5, "message": {"content": TN.replace("Re-arm the wake watcher", "leak " + PLANTED["github-token"])}},
    {"type": "assistant", "uuid": "m1", "timestamp": T % 6, "message": {"content": [
        {"type": "text", "text": "First piece of the reply."},
        {"type": "tool_use", "id": "t9", "name": "Bash", "input": {"command": "ls", "description": "List files"}},
        {"type": "text", "text": "Second piece of the reply."}]}},
]
red = dt.Redactor()
out4 = [x[2] for x in sorted(dt.distill([json.dumps(e) for e in raw4], red), key=lambda x: x[1])]
t4 = "\n".join(out4)
w1 = [l for l in out4 if "[09:00:01]" in l]
ok("a lone task notice becomes ONE line, with its time, the word Wake and its kind",
   len(w1) == 1 and w1[0].strip() == '**[09:00:01] Wake — task notice:** Background command "Re-arm the wake watcher" completed (exit code 0)', w1)
_folded = "\n".join(l for l in out4 if "Wake — task notice" in l)
ok("a folded wake line carries none of the notice's raw tags",
   _folded.count("Wake — task notice") == 4 and "<task-id>" not in _folded and "toolu_01AbCdEf" not in _folded
   and "bx1.output" not in _folded, _folded)
w2 = [l for l in out4 if "[09:00:02]" in l]
ok("two notices in one turn are one line naming both", len(w2) == 1 and "Re-arm the wake watcher" in w2[0] and "Notify Kyle" in w2[0] and w2[0].count("\n") <= 2, w2)
w3 = [l for l in out4 if "[09:00:03]" in l]
ok("a notice WITH a person's words is written in full, never folded", len(w3) == 1 and "User:**" in w3[0] and "please stop" in w3[0], w3)
w4 = [l for l in out4 if "[09:00:04]" in l]
ok("a notice with no summary still says it was a wake and its status", len(w4) == 1 and "Wake — task notice:** background task completed" in w4[0], w4)
w5 = [l for l in out4 if "[09:00:05]" in l]
ok("a secret inside a notice's summary is redacted", len(w5) == 1 and PLANTED["github-token"] not in w5[0] and "[REDACTED github-token]" in w5[0], w5)
m1 = [l for l in out4 if "[09:00:06]" in l]
ok("two text blocks in ONE assistant entry: both present, verbatim, in order, as separate Session sections",
   [l.strip() for l in m1 if "Session:" in l] == ["**[09:00:06] Session:** First piece of the reply.",
                                                  "**[09:00:06] Session:** Second piece of the reply."], m1)

print("4c. P5: an exact-millisecond tie keeps raw order; a queued notice with no delivered copy is kept (Langston P4)")
TT = "2026-11-06T10:00:00.000Z"
raw5 = [
    {"type": "assistant", "uuid": "k1", "timestamp": TT, "message": {"content": [
        {"type": "tool_use", "id": "t7", "name": "Bash", "input": {"command": "ls", "description": "Action that came first"}}]}},
    {"type": "assistant", "uuid": "k2", "timestamp": TT, "message": {"content": [{"type": "text", "text": "Reply that came second."}]}},
]
red = dt.Redactor()
o5 = [x[2] for x in sorted(dt.distill([json.dumps(e) for e in raw5], red), key=lambda x: (x[1], x[3]))]
ok("on an exact-millisecond tie the action that came first stays first",
   len(o5) == 2 and "Action that came first" in o5[0] and "Reply that came second" in o5[1], o5)
ok("every yielded tuple carries an order key", all(len(x) == 4 for x in dt.distill([json.dumps(e) for e in raw5], dt.Redactor())))
QN = TN.replace("Re-arm the wake watcher\" completed (exit code 0)", "Re-arm the wake watcher\" failed with exit code 4")
raw6 = [
    {"type": "queue-operation", "operation": "enqueue", "timestamp": "2026-11-06T10:00:01.000Z", "content": TN},
    {"type": "queue-operation", "operation": "dequeue", "timestamp": "2026-11-06T10:00:01.050Z"},
    {"type": "user", "uuid": "d1", "timestamp": "2026-11-06T10:00:01.100Z", "message": {"content": TN}},
    {"type": "queue-operation", "operation": "enqueue", "timestamp": "2026-11-06T10:00:02.000Z", "content": QN},
    {"type": "queue-operation", "operation": "enqueue", "timestamp": "2026-11-06T10:00:03.000Z", "content": TN},
    {"type": "queue-operation", "operation": "enqueue", "timestamp": "2026-11-06T10:00:04.000Z", "content": "typed while busy"},
]
y6 = list(dt.distill([json.dumps(e) for e in raw6], dt.Redactor()))
o6 = [x[2] for x in sorted(y6, key=lambda x: (x[1], x[3]))]
q = [l for l in o6 if "queued; no delivered copy" in l]
ok("a queued notice whose copy WAS delivered is not repeated", not any("10:00:01" in l and "queued" in l for l in o6), o6)
ok("a queued notice with NO delivered copy is kept, labelled, with its summary",
   any("[10:00:02] Wake — task notice (queued; no delivered copy in this file):** Background command \"Re-arm the wake watcher\" failed with exit code 4" in l for l in q), q)
ok("delivery is a MULTISET: the same notice queued twice and delivered once shows once as queued-only",
   sum("[10:00:03]" in l for l in q) == 1, q)
ok("a queued non-notice is kept as a queued user line", any("[10:00:04] User (queued; no delivered copy in this file):** typed while busy" in l for l in q), q)
ids = [x[0] for x in y6 if str(x[0]).startswith("queue:")]
ok("a queued-only line carries a stable synthetic id", len(ids) == 3 and
   ids == [x[0] for x in dt.distill([json.dumps(e) for e in raw6], dt.Redactor()) if str(x[0]).startswith("queue:")], ids)
ok("a queued-only line outside the window is not emitted",
   not [x for x in dt.distill([json.dumps(e) for e in raw6], dt.Redactor(), since="2026-11-06T10:00:05") if str(x[0]).startswith("queue:")])
ok("a delivery OUTSIDE the window still counts as delivered",
   not [x for x in dt.distill([json.dumps(e) for e in (raw6[2], raw6[4])], dt.Redactor(), since="2026-11-06T10:00:02.500Z")
        if str(x[0]).startswith("queue:")])
ok("...and the same pair with NO delivery does emit it (the control)",
   len([x for x in dt.distill([json.dumps(raw6[4])], dt.Redactor(), since="2026-11-06T10:00:02.500Z")
        if str(x[0]).startswith("queue:")]) == 1)

print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
