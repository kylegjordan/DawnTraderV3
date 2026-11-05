# -*- coding: utf-8 -*-
"""B-WAKE-OPENING-LIST (#1241) P6 — replay a month of real session posts through the crew-branch decision,
BEFORE (a session's name ANYWHERE, `MY_RE`) and AFTER (the session in the post's OPENING LIST, address_list.py),
for every session, and count the (post, party) pairs whose wake changes.

THE EXPECTATION IS PRE-REGISTERED IN THE SCOPE (r4, §0, re-derived independently by Langston):
  population  /var/log/cc-discord-inbox.jsonl, kind == "cc_outbound", 2026-10-04 <= ts < 2026-11-04T23:59,
              excluding the senders "Push notice" and "Heartbeat"; 1,950 posts kept (3,666 raw).
  result      272 posts, 345 LOST (post, party) wakes: CC-C 122, CC-B 109, CC-INFRA 65, CC-A 42, CC-PM 7.
              A post's own author is not a party. @crew / ALL SESSIONS wake everyone on both sides.
  GAINED      expected 0: a name in the opening list is also a name anywhere.
Both sides read the code AS COMMITTED: BEFORE = the filter's NAMES and MY_RE construction (unchanged by the batch);
AFTER = address_list.py from this checkout, with the filter's NAMES as the session registry (as the filter does).

CONTROLS (stop conditions):
  POSITIVE  a planted post "Langston, and NEW Claude - x" must be GAINED-or-kept for CC-B and a planted
            "x - homed to CC-C" must be LOST for CC-C, or the harness is not measuring.
  HARNESS   the kept-post count must equal 1,950 before the result is read.
Usage:  python scripts/analysis/replay-wake-opening-list.py        (reads the log over ssh, read-only)
Exit:   0 matches the pre-registration · 1 a different result (a FINDING) · 2 harness/control failure
"""
import ast, importlib.util, json, os, re, subprocess, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = "root@204.168.141.77"
LOG = "/var/log/cc-discord-inbox.jsonl"
SINCE, BEFORE = "2026-10-04", "2026-11-04T23:59"
EXPECT_KEPT, EXPECT_POSTS, EXPECT_LOST = 1950, 272, {"CC-C": 122, "CC-B": 109, "CC-INFRA": 65, "CC-A": 42, "CC-PM": 7}
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILTER = os.path.join(REPO, "comms-infra", "laptop", "cc-wake-filter.py")
MODULE = os.path.join(REPO, "comms-infra", "discord", "address_list.py")
MUTED = {"Push notice", "Heartbeat"}


def _literal(name):
    tree = ast.parse(open(FILTER, encoding="utf-8").read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise SystemExit("HARNESS: %s not found in the filter" % name)


NAMES = _literal("NAMES")
ALIAS_NAME = _literal("ALIAS_NAME")
SENDER_ALIAS = {v.lower(): k for k, v in ALIAS_NAME.items()}
MY_RE = {a: re.compile(r"@?\b(" + "|".join(p) + r")\b", re.I) for a, p in NAMES.items()}   # the filter's :159 form
CREW_ALL_RE = re.compile(r"@crew\b|\bALL SESSIONS\b", re.I)
spec = importlib.util.spec_from_file_location("address_list", MODULE)
AL = importlib.util.module_from_spec(spec)
spec.loader.exec_module(AL)
REGISTRY = {**NAMES, **AL.REVIEWER_NAMES, **AL.LIST_ONLY_NAMES}   # exactly as the filter builds it


def decide(text, sender):
    """{alias: (before, after)} for every session that is not the author."""
    author = SENDER_ALIAS.get((sender or "").lower())
    crew = bool(CREW_ALL_RE.search(text))
    opening = AL.opening_addressees(text, REGISTRY)
    return {a: (bool(MY_RE[a].search(text)) or crew, a in opening or crew) for a in NAMES if a != author}


def fetch():
    prog = ("import json,sys\n"
            "for l in open(%r,encoding='utf-8'):\n"
            "  try: d=json.loads(l)\n"
            "  except Exception: continue\n"
            "  if d.get('kind')=='cc_outbound' and %r<=str(d.get('ts',''))<%r:\n"
            "    print(json.dumps({'s':d.get('sender') or d.get('username') or '','t':d.get('text') or ''}))\n"
            % (LOG, SINCE, BEFORE))
    r = subprocess.run(["ssh", HOST, "python3", "-"], input=prog, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise SystemExit("HARNESS: could not read the log: %s" % r.stderr.strip()[:300])
    return [json.loads(x) for x in r.stdout.splitlines() if x.strip()]


def main():
    # controls first
    pos = decide("Langston, and NEW Claude - please look", "OLD Claude")
    neg = decide("progress note - homed to CC-C", "OLD Claude")
    if not (pos["CC-B"][1] and neg["CC-C"] == (True, False)):
        print("HARNESS: controls failed: %r %r" % (pos["CC-B"], neg["CC-C"]))
        return 2
    rows = fetch()
    raw = len(rows)
    kept = [r for r in rows if r["s"] not in MUTED]
    print("rows raw %d, kept %d (excluded %d muted)" % (raw, len(kept), raw - len(kept)))
    if len(kept) != EXPECT_KEPT:
        print("HARNESS: kept %d, the pre-registration says %d — wrong population, result not read" % (len(kept), EXPECT_KEPT))
        return 2
    lost, gained, lost_posts = {a: 0 for a in NAMES}, {a: 0 for a in NAMES}, 0
    senders_missing = 0
    for r in kept:
        if not r["s"]:
            senders_missing += 1
        d = decide(r["t"], r["s"])
        any_lost = False
        for a, (b, n) in d.items():
            if b and not n:
                lost[a] += 1
                any_lost = True
            elif n and not b:
                gained[a] += 1
        lost_posts += any_lost
    print("posts losing at least one wake: %d (expected %d)" % (lost_posts, EXPECT_POSTS))
    print("lost pairs: %s, total %d (expected %s, total %d)" % (lost, sum(lost.values()), EXPECT_LOST,
                                                               sum(EXPECT_LOST.values())))
    print("gained pairs: %s (expected all 0)" % gained)
    print("rows with no sender field: %d" % senders_missing)
    ok = lost_posts == EXPECT_POSTS and all(lost.get(a, 0) == n for a, n in EXPECT_LOST.items()) \
        and not any(gained.values())
    print("RESULT: %s" % ("MATCHES the pre-registration" if ok else "DIFFERS from the pre-registration — a FINDING"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
