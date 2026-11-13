#!/usr/bin/env python3
"""Tests for scripts/obs-windows.py (B-DEPLOY-WINDOW-GUARD P12 (i)). Run: python3 scripts/test-obs-windows.py

EXPECTED OUTCOMES ARE STATED IN THE TABLES BEFORE THE RUN (#744 rider). Every refusal is matched by a SUBSTRING of
its rule text, so a case that is refused for the WRONG reason fails. Exit 0 = every case passed; anything else = do
not ship. The mutation run (--mutate) removes each refusal in turn and requires the suite to FAIL for each one -
judged by exit code, never by grepping for FAIL (a crash prints no FAIL line and would read as "survived").
"""
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "obs-windows.py")


def load(path):
    spec = importlib.util.spec_from_file_location("obs_windows", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


H = '{"schema":"deploy-windows/1"}'
SHA = "a" * 40


def j(**kw):
    return json.dumps(kw)


OPEN_T = j(type="open", batch="B-X", owner="cc-b", opened_at="2026-11-13T00:00:00Z", end="2026-11-20T00:00:00Z",
           review_by="2026-11-21T00:00:00Z", disturbs="the US session read", detail="B_X_PROGRESS_REPORT.md")
OPEN_E = j(type="open", batch="B-Y", owner="cc-a", opened_at="2026-11-13T00:00:00Z", until_event="the 30th close",
           expected_by="2026-11-25T00:00:00Z", review_by="2026-11-26T00:00:00Z", disturbs="exit timing",
           detail="GOVERNANCE_EXCEPTIONS row 2026-11-13")
NOW = "2026-11-14T00:00:00Z"


def reg(*rows):
    return "\n".join((H,) + rows) + "\n"


# (label, register text, rule substring the refusal must carry) - each must exit 4
BAD = [
    ("empty file", "", "header"),
    ("truncated to nothing but a newline", "\n", "header"),
    ("header not JSON", "schema deploy-windows/1\n", "header is not JSON"),
    ("wrong schema", '{"schema":"deploy-windows/2"}\n', "header must be exactly"),
    ("a row is not JSON", reg("{oops"), "not JSON"),
    ("a row is not an object", reg("[1,2]"), "not a JSON object"),
    ("unknown type", reg(j(type="pause", batch="B-X")), "unknown type"),
    ("missing field", reg(j(type="open", batch="B-X", owner="cc-b", opened_at="2026-11-13T00:00:00Z",
                            end="2026-11-20T00:00:00Z", disturbs="x", detail="y")), "missing review_by"),
    ("unknown field", reg(json.dumps(dict(json.loads(OPEN_T), reviewby="2026-11-21T00:00:00Z"))), "unknown field"),
    ("unknown owner", reg(OPEN_T.replace('"cc-b"', '"claude-new"')), "not a canonical actor"),
    ("malformed time", reg(OPEN_T.replace("2026-11-20T00:00:00Z", "2026-11-20 00:00")), "is not a UTC time"),
    ("impossible date", reg(OPEN_T.replace("2026-11-20T00:00:00Z", "2026-02-30T00:00:00Z")), "not a real date"),
    ("bad batch id", reg(OPEN_T.replace('"B-X"', '"B X"')), "not a batch id"),
    ("duplicate open window", reg(OPEN_T, OPEN_T), "already has an open window"),
    ("both end and event", reg(json.dumps(dict(json.loads(OPEN_T), until_event="e", expected_by="2026-11-25T00:00:00Z"))),
     "EITHER end OR"),
    ("neither end nor event", reg(json.dumps({k: v for k, v in json.loads(OPEN_T).items() if k != "end"})), "EITHER end OR"),
    ("event with no expected_by", reg(json.dumps({k: v for k, v in json.loads(OPEN_E).items() if k != "expected_by"})),
     "needs both until_event and expected_by"),
    ("empty disturbs", reg(OPEN_T.replace("the US session read", " ")), "non-empty string"),
    ("close with no open", reg(j(type="close", batch="B-X", at=NOW, reason="completed", note="")), "has no open window"),
    ("close with unknown reason", reg(OPEN_T, j(type="close", batch="B-X", at=NOW, reason="done", note="")),
     "close reason must be one of"),
    ("amend with no open", reg(j(type="amend", batch="B-X", at=NOW, field="review_by", value=NOW, reason="r")),
     "has no open window"),
    ("amend unknown field", reg(OPEN_T, j(type="amend", batch="B-X", at=NOW, field="owner", value="cc-a", reason="r")),
     "amend field must be one of"),
    ("amend end on an event window", reg(OPEN_E, j(type="amend", batch="B-Y", at=NOW, field="end", value=NOW, reason="r")),
     "is an event window"),
    ("amend expected_by on a timed window", reg(OPEN_T, j(type="amend", batch="B-X", at=NOW, field="expected_by",
                                                          value=NOW, reason="r")), "is a timed window"),
    ("hold with a short sha", reg(j(type="hold", hold="H-1", row="r", opened_at=NOW,
                                    pending=[{"batch": "B-Z", "landing_sha": "abc"}])), "not a full 40-char sha"),
    ("hold pending wrong shape", reg(j(type="hold", hold="H-1", row="r", opened_at=NOW, pending=[{"batch": "B-Z"}])),
     "must be exactly {batch, landing_sha}"),
    ("release with no hold", reg(j(type="release", hold="H-1", at=NOW)), "not an open hold"),
    ("duplicate hold", reg(j(type="hold", hold="H-1", row="r", opened_at=NOW, pending=[]),
                           j(type="hold", hold="H-1", row="r", opened_at=NOW, pending=[])), "already open"),
]

# (label, register, argv after the mode, expected exit, substring expected on stdout or stderr)
CHECK = [
    ("no windows: proceeds, lands in none", reg(), ["check", "--now", NOW], 0, "IN_WINDOW none"),
    ("one open window, not named: refused", reg(OPEN_T), ["check", "--now", NOW], 5, "B-X is in an open observation window"),
    ("one open window, named: proceeds", reg(OPEN_T), ["check", "--now", NOW, "--in-window", "B-X"], 0,
     "IN_WINDOW B-X/cc-b/open"),
    ("two open, one named: refused, names the other", reg(OPEN_T, OPEN_E),
     ["check", "--now", NOW, "--in-window", "B-X"], 5, "B-Y is in an open observation window"),
    ("two open, both named: proceeds", reg(OPEN_T, OPEN_E), ["check", "--now", NOW, "--in-window", "B-X,B-Y"], 0,
     "IN_WINDOW B-X/cc-b/open,B-Y/cc-a/open"),
    ("a name that is not an open window: refused, not echoed", reg(OPEN_T),
     ["check", "--now", NOW, "--in-window", "B-X,SECRETNAME"], 5, "(10 chars, not echoed)"),
    ("the same name twice: refused", reg(OPEN_T), ["check", "--now", NOW, "--in-window", "B-X,B-X"], 5, "twice"),
    ("closed window: proceeds, lands in none", reg(OPEN_T, j(type="close", batch="B-X", at=NOW, reason="completed", note="")),
     ["check", "--now", NOW], 0, "IN_WINDOW none"),
    ("past review_by: stale, does NOT block, still landed in", reg(OPEN_T), ["check", "--now", "2026-11-22T00:00:00Z"], 0,
     "IN_WINDOW B-X/cc-b/stale"),
    ("past end, before review_by: stale", reg(OPEN_T), ["check", "--now", "2026-11-20T12:00:00Z"], 0, "B-X/cc-b/stale"),
    ("past review_by, before end: stale (review_by alone decides)",
     reg(OPEN_T.replace("2026-11-20T00:00:00Z", "2026-12-31T00:00:00Z").replace("2026-11-21T00:00:00Z", "2026-11-15T00:00:00Z")),
     ["check", "--now", "2026-11-16T00:00:00Z"], 0, "B-X/cc-b/stale"),
    ("event window past expected_by: stale", reg(OPEN_E), ["check", "--now", "2026-11-25T12:00:00Z"], 0, "B-Y/cc-a/stale"),
    ("amended review_by moves it back to open: refused", reg(OPEN_T, j(type="amend", batch="B-X", at=NOW,
     field="review_by", value="2026-12-30T00:00:00Z", reason="extended")), ["check", "--now", "2026-11-20T00:00:00Z"], 5,
     "B-X is in an open observation window"),
    ("hold pending is printed", reg(j(type="hold", hold="H-1", row="GE 2026-11-13", opened_at=NOW,
     pending=[{"batch": "B-Z", "landing_sha": SHA}])), ["check", "--now", NOW], 0, "HOLD H-1 GE_2026-11-13 B-Z " + SHA),
    ("released hold is not printed", reg(j(type="hold", hold="H-1", row="r", opened_at=NOW,
     pending=[{"batch": "B-Z", "landing_sha": SHA}]), j(type="release", hold="H-1", at=NOW)), ["check", "--now", NOW], 0,
     "IN_WINDOW none"),
    ("census lists the stale one", reg(OPEN_T, OPEN_E), ["census", "--now", "2026-11-20T12:00:00Z"], 0,
     "STALE B-X cc-b past its end"),
    ("census is silent on an open one", reg(OPEN_E), ["census", "--now", NOW], 0, "WINDOW B-Y cc-a open"),
    ("--in-window on census: refused", reg(), ["census", "--in-window", "B-X"], 2, "check only"),
    ("no mode: usage", reg(), [], 2, "usage"),
    ("malformed register on check: exit 4", "", ["check", "--now", NOW], 4, "REGISTER REFUSED"),
]
NOT_IN = [  # (label index into CHECK, substring that must be ABSENT from the combined output)
    ("census is silent on an open one", "STALE"),
    ("released hold is not printed", "HOLD"),
    ("a name that is not an open window: refused, not echoed", "SECRETNAME"),
]


def run(m, argv, text):
    out, err = io.StringIO(), io.StringIO()
    try:
        rc = m.main(argv, io.StringIO(text), out, err)
    except Exception as e:  # a crash is a failure, never a pass
        return -1, "", "CRASH %s: %s" % (type(e).__name__, e)
    return rc, out.getvalue(), err.getvalue()


def suite(path):
    m = load(path)
    fails = 0
    for label, text, rule in BAD:
        rc, o, e = run(m, ["check", "--now", NOW], text)
        if rc != 4 or rule not in e:
            fails += 1
            print("FAIL bad-shape %-40s rc=%s want 4, rule %r in %r" % (label, rc, rule, e.strip()[:160]))
    results = {}
    for label, text, argv, want, sub in CHECK:
        rc, o, e = run(m, argv, text)
        results[label] = o + e
        if rc != want or sub not in (o + e):
            fails += 1
            print("FAIL check     %-40s rc=%s want %s, %r in %r" % (label, rc, want, sub, (o + e).strip()[:200]))
    for label, absent in NOT_IN:
        if absent in results.get(label, absent):
            fails += 1
            print("FAIL absent    %-40s %r must not appear" % (label, absent))
    if tuple(m.OWNERS) != ("cc-a", "cc-b", "cc-c", "cc-infra", "codex-a", "codex-b", "codex-c", "codex-infra",
                           "kyle", "langston", "coltrane", "pm-claude", "pm-codex"):
        fails += 1
        print("FAIL owners tuple changed - the parity test in server/tests/unit is the authority; update both")
    total = len(BAD) + len(CHECK) + len(NOT_IN) + 1
    print("obs-windows: %d cases, %d failures" % (total, fails))
    return 1 if fails else 0


# Each mutation removes ONE refusal. The suite must FAIL (exit non-zero) for every one of them.
MUTATIONS = [
    ("header check", 'if head != {"schema": SCHEMA}:', "if False:"),
    ("unknown type", "if kind not in FIELDS:", "if False:"),
    ("missing field", "        if missing:\n", "        if False:\n"),
    ("unknown field", "        if extra:\n", "        if False:\n"),
    ("duplicate open", "            if b in windows:\n", "            if False:\n"),
    ("owner check", 'if rec["owner"] not in OWNERS:', "if False:"),
    ("end-xor-event", "if has_end == has_event:", "if False:"),
    ("close with no open", '                raise Refused("%s: close names', '                pass  # '),
    ("close reason", 'if rec["reason"] not in CLOSE_REASONS:', "if False:"),
    ("amend field", "if f not in AMEND_FIELDS:", "if False:"),
    ("sha shape", 'or not SHA.match(item["landing_sha"]):', "or False:"),
    ("unnamed open window", "    if unnamed:\n", "    if False:\n"),
    ("name not an open window", "            if nm not in windows:\n", "            if False:\n"),
    ("stale on review_by", 'if now > w["review_by"]:', "if False:"),
    ("iso shape", "if not isinstance(value, str) or not ISO.match(value):", "if not isinstance(value, str):"),
]


def mutate():
    src = open(SRC, encoding="utf-8").read()
    if suite(SRC) != 0:
        print("ABORT: the unmutated suite does not pass - mutation results would mean nothing")
        return 2
    survived = 0
    for label, a, b in MUTATIONS:
        if src.count(a) != 1:
            print("MUTATION NOT APPLIED %-28s (%d matches) - fix the mutation, not the code" % (label, src.count(a)))
            survived += 1
            continue
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "obs-windows.py")
            open(p, "w", encoding="utf-8").write(src.replace(a, b))
            r = subprocess.run([sys.executable, os.path.abspath(__file__), "--suite-only", p],
                               capture_output=True, text=True)
            killed = r.returncode != 0
            print("%-8s %s" % ("killed" if killed else "SURVIVED", label))
            survived += 0 if killed else 1
    print("mutations: %d, survived: %d" % (len(MUTATIONS), survived))
    return 1 if survived else 0


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--suite-only":
        sys.exit(suite(sys.argv[2]))
    if len(sys.argv) == 2 and sys.argv[1] == "--mutate":
        sys.exit(mutate())
    sys.exit(suite(SRC))
