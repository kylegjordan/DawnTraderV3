# -*- coding: utf-8 -*-
"""B-WAKE-LEAD-NAME (#1040) — replay Langston's real replies through the wake filter BEFORE and AFTER,
for every session, then JOIN each newly-waking reply to the message it answered.

WHAT IT PROVES, AND WHAT IT DOES NOT (scope OBJ-1):
  (a) dropped-with-opening-name -> 0 for every session. TRUE BY CONSTRUCTION once the key is the
      opening name, so this proves the IMPLEMENTATION, not the key.
  (b) THE JOIN proves the key: every reply that newly wakes a session must answer a message that
      session wrote. Keyed on (message_id, kind), because the inbox log fans one Discord message
      into several rows by kind. A mismatch is a FINDING, not noise; alert-path rows (no session
      author to join to) are counted on their own, never folded into MATCH.
  (c) nothing else moves: wakes on replies that do NOT open with the session's name are identical
      before and after, except the condition-3 class (a marker whose owner is outside the list is
      now stripped), which is reported by name.
  (d) every newly-waking reply whose last marker names ANOTHER owner carries that owner's routing tag.

CONTROLS ARE STOP CONDITIONS, NOT DECORATION (Langston, Step 1):
  POSITIVE  message 1547973065172979794 must resolve to CC-INFRA before the join is trusted.
  NEGATIVE  a fixture reply opening "NEW Claude" answering that message must classify MISMATCH, and
            its "Infra Claude" twin MATCH — so the join is shown able to report a failure.
  HARNESS   one sentinel per row must come back per run, and the BEFORE run must emit at least one
            wake: a filter that processes nothing prints silence that reads like suppression.

Usage:  python scripts/analysis/replay-wake-lead-name.py [--since 2026-09-03] [--before-ref d03268d63]
                                                          [--after comms-infra/laptop/cc-wake-filter.py]
Exit:   0 all hold · 1 a finding (mismatch, unexpected change, missing tag, a drop survives) · 2 harness/control failure
"""
import argparse, ast, json, os, re, subprocess, sys, tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = "root@204.168.141.77"
LOG = "/var/log/cc-discord-inbox.jsonl"
WAKELOG = "/var/log/cc-wake.log"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
POSITIVE_MSG = "1547973065172979794"

ap = argparse.ArgumentParser()
ap.add_argument("--since", default="2026-09-03")
ap.add_argument("--before-ref", default="d03268d63")
ap.add_argument("--after", default=os.path.join(REPO, "comms-infra", "laptop", "cc-wake-filter.py"))
args = ap.parse_args()


def die(code, msg):
    print(msg)
    sys.exit(code)


# ── the filter's own registries, read from the AFTER source (one list, never restated here) ──
after_src = open(args.after, encoding="utf-8").read()


_after_tree = ast.parse(after_src)   # parsed, never executed: the filter's body is a stdin loop


def literal(name):
    for node in _after_tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return ast.literal_eval(node.value)
    die(2, f"HARNESS FAILED — top-level {name} not found in {args.after}")


NAMES = literal("NAMES")
ALIAS_NAME = literal("ALIAS_NAME")
ALERT_OWNERS = literal("ALERT_OWNERS")
ALIASES = list(NAMES)
NAME_TO_ALIAS = {v.lower(): k for k, v in ALIAS_NAME.items()}
OWNER_RE = re.compile(r"\[\[ALERT\b[^\]]*\bowner=(" + "|".join(re.escape(o) for o in ALERT_OWNERS) + r")\b", re.I)
ANY_OWNER_RE = re.compile(r"\[\[ALERT\b[^\]]*\bowner=([^\s\]]+)", re.I)
STRIP_RE = re.compile(r"\[\[ALERT\b[^\]]*\]\]", re.I)
# The key. ⚠️ NOT independent of the filter: this is the SAME predicate as its OPEN_RE, character for
# character (the bridge's ADDRESS_START_RE prefix class in front of the registry's name patterns) - so,
# as the docstring says, (a) is TRUE BY CONSTRUCTION. Only the JOIN below is independent evidence.
# Do not "fix" that by spelling the regex differently: a second spelling of one predicate proves nothing
# and can drift (Langston, Step-4 FINDING-1).
OPEN = {a: re.compile(r"^[\s*_~`>#:\".\-]*(?:" + "|".join(p) + r")\b", re.I) for a, p in NAMES.items()}
CANON = {o.upper(): o for o in ALERT_OWNERS}


def last_owner(body):
    mo = None
    for mo in OWNER_RE.finditer(body):
        pass
    return CANON[mo.group(1).upper()] if mo else None


def opens_with(alias, body):
    return bool(OPEN[alias].match(STRIP_RE.sub(" ", body)))


# ── fetch: every row since --since (langston_outbound for the replay, everything else for the join) ──
REMOTE = r'''
import json, sys
since = sys.argv[1]
for l in open("%s", encoding="utf-8", errors="replace"):
    try:
        d = json.loads(l)
    except Exception:
        continue
    if str(d.get("ts") or "") >= since:
        sys.stdout.write(json.dumps(d, ensure_ascii=False) + "\n")
''' % LOG
p = subprocess.run(["ssh", "-o", "ConnectTimeout=20", HOST, "python3", "-", args.since],
                   input=REMOTE.encode(), capture_output=True, timeout=600)
if p.returncode != 0:
    die(2, "HARNESS FAILED — fetch: " + p.stderr.decode("utf-8", "replace")[:400])
rows = [json.loads(l) for l in p.stdout.decode("utf-8", "replace").splitlines() if l.strip()]
replies = [r for r in rows if r.get("kind") == "langston_outbound"]
as_of = max((str(r.get("ts")) for r in rows), default="?")
if not replies:
    die(2, "HARNESS FAILED — zero langston_outbound rows fetched; an empty replay proves nothing")

by_msg = {}
for r in rows:
    if r.get("kind") != "langston_outbound" and r.get("message_id"):
        by_msg.setdefault(str(r["message_id"]), []).append(r)


def author_alias(r):
    for field in ("sender", "sender_username"):
        v = r.get(field)
        if v:
            return NAME_TO_ALIAS.get(str(v).split("#", 1)[0].strip().lower())
    return None


def join(reply, alias):
    """MATCH | MISMATCH | ALERT-PATH | NON-SESSION-AUTHOR | NO-TRIGGERING-ROW, keyed (message_id, kind)."""
    trig = by_msg.get(str(reply.get("reply_to") or ""), [])
    if not trig:
        return "NO-TRIGGERING-ROW"
    by_kind = {}
    for t in trig:
        by_kind.setdefault(t.get("kind"), t)
    if any(k and "alert" in k for k in by_kind):
        return "ALERT-PATH"
    authors = {author_alias(t) for t in by_kind.values()} - {None}
    if not authors:
        return "NON-SESSION-AUTHOR"
    return "MATCH" if authors == {alias} else "MISMATCH"


# ── controls, before any result is trusted ──
pos = by_msg.get(POSITIVE_MSG)
if not pos or {author_alias(t) for t in pos} - {None} != {"CC-INFRA"}:
    die(2, f"CONTROL FAILED — positive: {POSITIVE_MSG} did not resolve to CC-INFRA "
           f"(rows: {len(pos or [])}). The join cannot be trusted.")
fx_bad = {"kind": "langston_outbound", "reply_to": POSITIVE_MSG, "text": "NEW Claude — fixture"}
fx_good = {"kind": "langston_outbound", "reply_to": POSITIVE_MSG, "text": "Infra Claude — fixture"}
if join(fx_bad, "CC-B") != "MISMATCH" or join(fx_good, "CC-INFRA") != "MATCH":
    die(2, "CONTROL FAILED — negative: the join could not report a mismatch on a known-wrong fixture.")


# ── the replay: one filter process per (version, alias); a sentinel after each row attributes wakes ──
def replay(filter_path, alias):
    parts = []
    for n, r in enumerate(replies):
        parts.append(f"==> {LOG} <==\n{json.dumps(r, ensure_ascii=False)}\n==> {WAKELOG} <==\nREPLAY SENTINEL {n}\n")
    q = subprocess.run([sys.executable, filter_path, alias], input="".join(parts).encode("utf-8"),
                       capture_output=True, timeout=1800)
    if q.returncode != 0:
        die(2, f"HARNESS FAILED — {filter_path} {alias} exited {q.returncode}: "
               + q.stderr.decode("utf-8", "replace")[:400])
    out, bucket, got = [], [], 0
    for line in q.stdout.decode("utf-8", "replace").splitlines():
        m = re.match(r"WAKE\[CHANNEL->[^\]]*\]: REPLAY SENTINEL (\d+)\s*$", line)
        if m:
            if int(m.group(1)) != got:
                die(2, f"HARNESS FAILED — sentinel {m.group(1)} arrived out of order (expected {got})")
            out.append(bucket)
            bucket, got = [], got + 1
        elif line.startswith("WAKE["):
            bucket.append(line)
    if got != len(replies):
        die(2, f"HARNESS FAILED — {got} of {len(replies)} sentinels came back for {alias}; rows were dropped unseen")
    return out


before_src = subprocess.run(["git", "show", f"{args.before_ref}:comms-infra/laptop/cc-wake-filter.py"],
                            cwd=REPO, capture_output=True)
if before_src.returncode != 0:
    die(2, "HARNESS FAILED — cannot read the BEFORE filter at " + args.before_ref)
tmp = tempfile.NamedTemporaryFile("wb", suffix="-before-filter.py", delete=False)
tmp.write(before_src.stdout)
tmp.close()

print(f"population: {len(replies)} langston_outbound rows, ts >= {args.since}, as of {as_of}; "
      f"{len(rows)} rows fetched for the join")
print(f"BEFORE = {args.before_ref}:comms-infra/laptop/cc-wake-filter.py · AFTER = {args.after}")
print("controls: positive (1547973065172979794 -> CC-INFRA) HELD · negative (NEW Claude fixture -> MISMATCH) HELD\n")

findings = 0
total_before_wakes = 0
hdr = f"{'alias':9} {'opening+other-owner':>19} {'dropped before':>14} {'dropped after':>13} {'newly wake':>10} {'MATCH':>5} {'MISMATCH':>8} {'alert':>5} {'non-sess':>8} {'no-trig':>7} {'tag ok':>6} {'non-opening diff':>16}"
print(hdr)
for alias in ALIASES:
    b = replay(tmp.name, alias)
    a = replay(args.after, alias)
    total_before_wakes += sum(1 for x in b if x)
    key = [i for i, r in enumerate(replies)
           if opens_with(alias, r.get("text") or "") and (last_owner(r.get("text") or "") or alias).upper() != alias]
    drop_b = sum(1 for i in key if not b[i])
    drop_a = sum(1 for i in key if not a[i])
    newly = [i for i in range(len(replies)) if a[i] and not b[i]]
    j = {"MATCH": 0, "MISMATCH": 0, "ALERT-PATH": 0, "NON-SESSION-AUTHOR": 0, "NO-TRIGGERING-ROW": 0}
    tag_bad = 0
    for i in newly:
        j[join(replies[i], alias)] += 1
        owner = last_owner(replies[i].get("text") or "")
        if owner and owner.upper() != alias:
            distinct = []
            for m in OWNER_RE.finditer(replies[i].get("text") or ""):
                o = CANON[m.group(1).upper()]
                if o not in distinct:
                    distinct.append(o)
            want = f"WAKE[LANGSTON->{alias}] [alert routed to {', '.join(distinct)}]: "
            if not any(w.startswith(want) for w in a[i]):
                tag_bad += 1
    cond3, unexpected = 0, []
    for i, r in enumerate(replies):
        if opens_with(alias, r.get("text") or ""):
            continue
        if bool(a[i]) != bool(b[i]):
            owners = [o for o in ANY_OWNER_RE.findall(r.get("text") or "") if o.upper() not in CANON]
            if owners and b[i] and not a[i]:
                cond3 += 1
            else:
                unexpected.append((r.get("message_id"), bool(b[i]), bool(a[i])))
    tagged_ok = sum(1 for i in newly if (last_owner(replies[i].get("text") or "") or alias).upper() != alias) - tag_bad
    print(f"{alias:9} {len(key):>19} {drop_b:>14} {drop_a:>13} {len(newly):>10} {j['MATCH']:>5} {j['MISMATCH']:>8} "
          f"{j['ALERT-PATH']:>5} {j['NON-SESSION-AUTHOR']:>8} {j['NO-TRIGGERING-ROW']:>7} {tagged_ok:>6} "
          f"{('cond-3: %d, other: %d' % (cond3, len(unexpected))):>16}")
    if drop_a:
        print(f"  FINDING {alias}: {drop_a} replies opening with this session's name are still dropped")
        findings += 1
    if j["MISMATCH"] or j["NON-SESSION-AUTHOR"] or j["NO-TRIGGERING-ROW"]:
        print(f"  FINDING {alias}: newly-waking replies that do not join MATCH: "
              f"{j['MISMATCH']} mismatch, {j['NON-SESSION-AUTHOR']} non-session author, {j['NO-TRIGGERING-ROW']} no triggering row")
        findings += 1
    if tag_bad:
        print(f"  FINDING {alias}: {tag_bad} newly-waking replies with another owner's marker carry no correct routing tag")
        findings += 1
    if unexpected:
        print(f"  FINDING {alias}: {len(unexpected)} non-opening replies changed wake outside the condition-3 class: {unexpected[:5]}")
        findings += 1

os.unlink(tmp.name)
if total_before_wakes == 0:
    die(2, "HARNESS FAILED — the BEFORE filter emitted no Langston wake for any session; silence proves nothing")
print()
print("ALL HOLD" if not findings else f"{findings} FINDING(S)")
sys.exit(0 if not findings else 1)
