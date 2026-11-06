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


def ok(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
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

# ---- 3. values by hash (layer c): the value is never in the hash file -------------------------------------------------
print("3. values")
shapeless = "zx" + "9CQ4u7Lm2Rt8Pw"  # no shape, no name
h = [{"name": "FINNHUB_API_KEY", "length": len(shapeless), "sha256": hashlib.sha256(shapeless.encode()).hexdigest()}]
red = dt.Redactor(h)
out = red("curl -H 'X-Finnhub-Token: %s' https://x" % shapeless)
ok("a bare shapeless value is hidden by its hash", shapeless not in out and red.counts.get("value:FINNHUB_API_KEY") == 1)
ok("the hash file holds no value", shapeless not in json.dumps(h))
red = dt.Redactor(h)
ok("a different token of the same length is left alone", red("zx9CQ4u7Lm2Rt8PX") == "zx9CQ4u7Lm2Rt8PX")
red = dt.Redactor()
ok("with no hash file the shapeless value is NOT caught (the stated residual)", shapeless in red(shapeless))
ok("layer (c) state says OFF in plain words when nothing loaded", "OFF" in dt.Redactor().layer_c_state() and "not switched on" in dt.Redactor().layer_c_state())
ok("layer (c) state counts what loaded", "ON, 1 value(s)" in dt.Redactor(h).layer_c_state())
short = [{"name": "SHORTKEY", "length": 11, "sha256": "a" * 64}]
ok("a value under 12 characters is named as out of reach", "OUT OF REACH" in dt.Redactor(short).layer_c_state() and "SHORTKEY" in dt.Redactor(short).layer_c_state())
ok("a malformed hash entry is not counted as loaded", dt.Redactor([{"name": "X"}, {"name": "Y", "length": 20, "sha256": "short"}]).layer_c_names == 0)
import tempfile as _tf
_d = _tf.mkdtemp(prefix="dt-test-")
_raw = os.path.join(_d, "raw.jsonl"); open(_raw, "w").write("")
_empty = os.path.join(_d, "empty.json"); open(_empty, "w").write("[]")
import io, contextlib
_err = io.StringIO()
with contextlib.redirect_stderr(_err), contextlib.redirect_stdout(io.StringIO()):
    rc = dt.main(["dt", _raw, "--hashes", _empty])
ok("--hashes with zero usable entries is REFUSED (exit 3), never silently off", rc == 3 and "REFUSED" in _err.getvalue())

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

print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
