#!/usr/bin/env python3
"""Tests for dt_secret_hashes (B-TRANSCRIPT-ARCHIVE P3(c)). `python3 -I test_dt_secret_hashes.py` — exit 0 = all pass.
Drives the PRODUCTION entry point (the script run as a process, as it runs on a server) and asserts on what that
process wrote to stdout and stderr. Every value is FAKE and built at run time from fragments."""
import hashlib
import hmac
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "dt_secret_hashes.py")
sys.path.insert(0, HERE)
import dt_transcript as dt  # noqa: E402

FAILS = []


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


HK = bytes(range(7, 39))                       # the test HMAC key, 32 bytes
_kd = tempfile.mkdtemp(prefix="dt-hash-key-")
HKEYF = os.path.join(_kd, "key")
open(HKEYF, "w").write(HK.hex() + "\n")


def run(*args, stdin_script=False, key=True):
    if stdin_script:   # the documented SERVER form: a copy of the script with RUN_KEY_HEX set, streamed on stdin
        # bytes, not text: a server's ssh pipe carries the file's UTF-8 bytes; text=True would re-encode in the
        # laptop's locale and fail on the first non-ASCII character, which no server ever sees
        src = open(SCRIPT, "rb").read()
        if key:
            assert src.count(b'RUN_KEY_HEX = ""') == 1
            src = src.replace(b'RUN_KEY_HEX = ""', b'RUN_KEY_HEX = "' + HK.hex().encode() + b'"')
        p = subprocess.run([sys.executable, "-I", "-"] + list(args), input=src, capture_output=True)
        return p.returncode, p.stdout.decode("utf-8"), p.stderr.decode("utf-8")
    pre = ["--key-file", HKEYF] if key else []
    p = subprocess.run([sys.executable, "-I", SCRIPT] + pre + list(args), capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def mac(v, k=None):
    return hmac.new(k or HK, v.encode(), hashlib.sha256).hexdigest()


d = tempfile.mkdtemp(prefix="dt-hash-test-")
V1 = "Kr" + "8sP2vQ9mX4tL7wZ3nB6c"           # reachable, unquoted
V2 = "Fh" + "3Jk9Lm2Np5Qr8St"                  # reachable, double-quoted
V3 = "Ff" + "4Gg7Hh0Jj3Kk"                     # reachable, single-quoted, with export
V4 = "pg" + "://u:p@host:5432/db"              # characters outside the token set
V5 = "sh" + "ort9"                             # under 12
V6 = "Nn" + "5Mm8Ll1Kk4Jj7Hh"                  # a NON-secret key with a long value: must never be hashed
V7 = "Ww" + "2Ee5Rr8Tt1Yy4Uu7"                 # reachable, unquoted, with an inline comment
V8 = "Dd" + "9Ss6Aa3Qq0Ww7Ee"                  # the same name in a second file
V11 = "Aa1Bb2Cc3Dd4Ee5" + ":x"                # 15 token characters THEN a ":" - the whole value is unreachable
env = os.path.join(d, "app.env")
open(env, "w").write("# comment line\n\nKRAKEN_API_SECRET=%s\nFINNHUB_API_KEY=\"%s\"\nexport FRED_API_KEY='%s'\n"
                     "DATABASE_URL=%s\nJWT_SECRET=%s\nPUBLIC_BASE_PATH=%s\nCOINGECKO_API_KEY=%s  # rotated 10-01\n"
                     "OPENAI_API_KEY=%s\n"
                     % (V1, V2, V3, V4, V5, V6, V7, V11))
env2 = os.path.join(d, "second.env")
open(env2, "w").write("KRAKEN_API_SECRET=%s\n" % V8)
keyf = os.path.join(d, "helius-key")
V9 = "Hk" + "1Lm4Np7Qr0St3Uv"
open(keyf, "w").write(V9 + "\n")
keyf_crlf = os.path.join(d, "crlf-key")
V10 = "Cr" + "6Lf9Xx2Yy5Zz8Aa"
open(keyf_crlf, "w", newline="").write(V10 + "\r\n")
NAMES = "KRAKEN_API_SECRET,FINNHUB_API_KEY,FRED_API_KEY,DATABASE_URL,JWT_SECRET,COINGECKO_API_KEY,OPENAI_API_KEY"
ALL_VALUES = (V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, HK.hex())

print("1. a full run")
rc, out, err = run("--env", env, "--env", env2, "--names", NAMES, "--file", "HELIUS_API_KEY=" + keyf,
                   "--file", "CRLF_KEY=" + keyf_crlf)
ok("exit 0 when every listed name is found", rc == 0)
ok("no value appears on stdout or stderr", not any(v in out or v in err for v in ALL_VALUES))
H = json.loads(out) if rc == 0 else []
by = {}
for e in H:
    by.setdefault(e["name"], []).append(e)
want = {"KRAKEN_API_SECRET": {V1, V8}, "FINNHUB_API_KEY": {V2}, "FRED_API_KEY": {V3}, "COINGECKO_API_KEY": {V7},
        "HELIUS_API_KEY": {V9}, "CRLF_KEY": {V10}}
for n, vals in want.items():
    got = {(e.get("length"), e.get("hmac")) for e in by.get(n, []) if "hmac" in e}
    ok("%s hashed exactly (quotes, export, inline comment, trailing newline handled)" % n,
       got == {(len(v), mac(v)) for v in vals})
ok("a name in two files gives two entries", len(by.get("KRAKEN_API_SECRET", [])) == 2)
db = by.get("DATABASE_URL", [{}])[0]
ok("a value with characters outside the token set is reported NOT reachable, with no hash and no length",
   db.get("reachable") is False and "outside the token set" in db.get("reason", "") and "hmac" not in db and "length" not in db)
js = by.get("JWT_SECRET", [{}])[0]
ok("a value under 12 is reported NOT reachable, with no hash and no length",
   js.get("reachable") is False and "under 12" in js.get("reason", "") and "hmac" not in js and "length" not in js)
oa = by.get("OPENAI_API_KEY", [{}])[0]
ok("a value that only STARTS with token characters is NOT reachable (the contract is the whole value)",
   oa.get("reachable") is False and "hmac" not in oa)
ok("...and its run of 12+ token characters is hashed on its own as NAME#1",
   [(e.get("length"), e.get("hmac")) for e in by.get("OPENAI_API_KEY#1", [])] == [(15, mac(V11[:15]))]
   and "hashed as OPENAI_API_KEY#1..1" in oa.get("reason", ""))
ok("a separator value with no run of 12+ says so and emits no part", "no part of 12+" in db.get("reason", "")
   and not any(n.startswith("DATABASE_URL#") for n in by))
ok("a key not in --names is never emitted", "PUBLIC_BASE_PATH" not in by and mac(V6) not in out)
ok("every entry names its source file", all(e.get("source", "").endswith(env) or e.get("source", "").endswith(env2)
                                            or e.get("source", "").endswith(keyf) or e.get("source", "").endswith(keyf_crlf) for e in H))
ok("the summary line counts reachable and not", "12 entries, 8 reachable, 4 not reachable" in err)

print("2. the producer's output drives the redactor (the connection, not just each half)")
red = dt.Redactor(H, key=HK)
text = "export KR=%s; curl -H 'k: %s' x; key=%s. and %s and %s" % (V1, V2, V3, V9, V4)
red_out = red(text)
ok("every reachable value is hidden by the producer's own hashes", not any(v in red_out for v in (V1, V2, V3, V9)))
ok("the state line names the unreachable ones", "DATABASE_URL" in red.layer_c_state() and "JWT_SECRET" in red.layer_c_state())
KID = "00" + "5a1b2c3d4e5f60000000001"           # a key-file of the form keyid:key (25 + 1 + 31 characters)
BKEY = "K0" + "05AbCdEfGhIjKlMnOpQrStUvWxYz12"
coldf = os.path.join(d, "cold.key")
open(coldf, "w").write(KID + ":" + BKEY + "\n")
rc3, out3, err3 = run("--file", "B2_COLD_KEY=" + coldf)
H3 = json.loads(out3) if rc3 == 0 else []
red = dt.Redactor(H3, key=HK)
o3 = red("b2 account authorize %s %s; and glued %s:%s" % (KID, BKEY, KID, BKEY))
ok("a keyid:key file: both halves caught, apart and glued by the colon", rc3 == 0 and KID not in o3 and BKEY not in o3
   and red.counts.get("value:B2_COLD_KEY#1") == 2 and red.counts.get("value:B2_COLD_KEY#2") == 2)
ok("a keyid:key file: neither half nor the whole on stdout or stderr", not any(v in out3 + err3 for v in (KID, BKEY, HK.hex())))

print("2b. --json: one string field of a JSON credential file")
RT = "rt" + "_9xQ2mV7pL4kW8nZ3cB6tY1hJ5"
jf = os.path.join(d, "auth.json")
json.dump({"tokens": {"refresh_token": RT, "account_id": "0" * 36, "n": 5}, "last_refresh": "2026-11-04T20:51:00Z"},
          open(jf, "w"))
rc4, out4, err4 = run("--json", "CODEX_REFRESH_TOKEN=%s:tokens.refresh_token" % jf)
H4 = json.loads(out4) if rc4 == 0 else []
ok("--json hashes exactly the named field", rc4 == 0 and [(e["name"], e.get("length"), e.get("hmac")) for e in H4]
   == [("CODEX_REFRESH_TOKEN", len(RT), mac(RT))])
ok("--json never prints the value", RT not in out4 + err4)
for spec, why in (("X=%s:tokens.nope" % jf, "a missing key"),
                  ("X=%s:tokens.refresh_token.extra" % jf, "a key path running past a string"), ("X=%s:tokens.n" % jf, "a non-string value"),
                  ("X=%s:tokens" % jf, "an object value"), ("X=%s" % jf, "no key path"),
                  ("=%s:tokens.refresh_token" % jf, "an empty NAME"),
                  ("X=%s:a" % os.path.join(d, "nope.json"), "an unreadable file"), ("X=%s:a" % env, "a non-JSON file")):
    rc5, out5, err5 = run("--json", spec)
    ok("--json with %s is REFUSED: exit 4, nothing on stdout" % why, rc5 == 4 and out5 == "" and "REFUSED" in err5)

print("3. the documented remote form: script on stdin")
rc2, out2, err2 = run("--env", env, "--names", "FINNHUB_API_KEY", stdin_script=True)
ok("stdin form runs and hashes", rc2 == 0 and json.loads(out2)[0].get("hmac") == mac(V2))

print("3b. the key (Langston F1)")
ok("the committed script carries NO key", open(SCRIPT, encoding="utf-8").read().count('RUN_KEY_HEX = ""') == 1)
ok("an entry is an HMAC under the key, not a plain SHA-256", H and all(e["hmac"] != hashlib.sha256(b"x").hexdigest() for e in H if "hmac" in e)
   and by.get("FINNHUB_API_KEY", [{}])[0].get("hmac") == mac(V2)
   and by.get("FINNHUB_API_KEY", [{}])[0].get("hmac") != hashlib.sha256(V2.encode()).hexdigest())
ok("every hashed entry names its key", all(e.get("key_id") == dt.key_id(HK) for e in H if "hmac" in e))
rc, out, err = run("--env", env, "--names", "FINNHUB_API_KEY", key=False)
ok("no key at all: exit 2, nothing on stdout", rc == 2 and out == "" and "no usable key" in err)
rc, out, err = run("--env", env, "--names", "FINNHUB_API_KEY", stdin_script=True, key=False)
ok("the stdin form with RUN_KEY_HEX left empty: exit 2", rc == 2 and out == "")
shortk = os.path.join(_kd, "short"); open(shortk, "w").write("ab" * 31 + "\n")
rc, out, err = run("--key-file", shortk, "--env", env, "--names", "FINNHUB_API_KEY", key=False)
ok("a key under 32 bytes: exit 2", rc == 2 and out == "")
rc, out, err = run("--key-file", os.path.join(_kd, "nope"), "--env", env, "--names", "FINNHUB_API_KEY", key=False)
ok("an unreadable key file: exit 2", rc == 2 and out == "")
red = dt.Redactor(H, key=bytes(range(1, 33)))
ok("the producer's output under a DIFFERENT key loads nothing", red.layer_c_names == 0 and red.layer_c_wrong_key > 0)

print("3c. an inline comment that was cut is SAID, and the uncut reading listed (Langston F2)")
cg = by.get("COINGECKO_API_KEY", [])
ok("the cut reading carries a note", any(e.get("hmac") == mac(V7) and "inline comment stripped" in e.get("note", "") for e in cg))
ok("the uncut reading is listed as NOT reachable, with a note", any(e.get("reachable") is False and "WITHOUT the inline-comment strip" in e.get("note", "") for e in cg))
ok("...and its run that EQUALS the cut value is not listed again as NAME#1 (Langston r2 f3)",
   "COINGECKO_API_KEY#1" not in by and sum(1 for e in H if e.get("hmac") == mac(V7)) == 1, sorted(by))
red = dt.Redactor(H, key=HK)
ok("the state line names the uncut reading", "COINGECKO_API_KEY (contains characters outside the token set" in red.layer_c_state())
ok("a value with no comment carries no note", all("note" not in e for e in by.get("FINNHUB_API_KEY", [])))

print("3d. a name defined EMPTY is not found (Langston F3)")
emp = os.path.join(d, "empty.env")
open(emp, "w").write("SECRET_B=\nOTHER_KEY=%s\n" % V1)
rc, out, err = run("--env", emp, "--names", "SECRET_B,OTHER_KEY")
ok("a listed name defined empty: exit 4, nothing on stdout, named as EMPTY", rc == 4 and out == "" and "EMPTY" in err and "SECRET_B" in err)
rc, out, err = run("--env", emp, "--env", env2, "--names", "OTHER_KEY,KRAKEN_API_SECRET")
ok("an empty name NOT listed is simply ignored", rc == 0)

print("4. fails closed")
rc, out, err = run("--env", env, "--names", NAMES + ",NOT_THERE_KEY")
ok("a listed name found nowhere: exit 4, NOTHING on stdout, the name on stderr",
   rc == 4 and out == "" and "NOT_THERE_KEY" in err)
rc, out, err = run("--env", env, "--env", os.path.join(d, "missing.env"), "--names", "FINNHUB_API_KEY")
ok("an unreadable env file is REFUSED even when every name was found elsewhere: exit 4, nothing on stdout",
   rc == 4 and out == "" and "cannot read" in err)
rc, out, err = run("--env", env, "--names", "FINNHUB_API_KEY", "--file", "HELIUS_API_KEY=" + os.path.join(d, "nope"))
ok("an unreadable key file: exit 4, nothing on stdout (no partial list)", rc == 4 and out == "")
rc, out, err = run("--file", "no-equals-sign")
ok("a malformed --file: exit 4, nothing on stdout", rc == 4 and out == "")
rc, out, err = run("--file", "=" + keyf)
ok("a --file with an empty NAME (readable path): exit 4, nothing on stdout", rc == 4 and out == "" and "NAME=PATH" in err)
rc, out, err = run("--env", env)
ok("--env without --names: exit 2", rc == 2 and out == "")
rc, out, err = run("--names", "A")
ok("--names without --env: exit 2", rc == 2 and out == "")
rc, out, err = run()
ok("nothing to hash: exit 2", rc == 2 and out == "")
rc, out, err = run("--env", env, "--names", "FINNHUB_API_KEY", "--bogus")
ok("an unknown argument beside a valid run: exit 2, nothing on stdout", rc == 2 and out == "" and "unknown argument" in err)
SECRETLIKE = "Zz" + "9Yy8Xx7Ww6Vv5Uu4"
rc, out, err = run("--env", env, "--names", "FINNHUB_API_KEY", SECRETLIKE)
ok("an unknown argument is NOT echoed (a typo could put the key there)", rc == 2 and SECRETLIKE not in err and "position" in err, err)
cm = os.path.join(d, "comment-only.env")
open(cm, "w").write("C= # only a comment\nG=#text\nOK_KEY=%s\n" % V1)
rc, out, err = run("--env", cm, "--names", "C,G,OK_KEY")
ok("a value that is only a comment counts as EMPTY, not found (Langston r2 f2)", rc == 4 and out == "" and "EMPTY" in err and "C (in" in err and "G (in" in err, err)
ok("the core-dump guard is callable and reports what it could do", __import__("dt_secret_hashes").no_core_dumps() in (True, False))
rc, out, err = run("--env")
ok("a flag with no value: exit 2", rc == 2 and out == "")

print("5. the contract regex IS the redactor's token set")
ok("dt_secret_hashes.REACHABLE is dt_transcript.TOKEN anchored",
   __import__("dt_secret_hashes").REACHABLE.pattern == dt.TOKEN.pattern + r"\Z")

print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
