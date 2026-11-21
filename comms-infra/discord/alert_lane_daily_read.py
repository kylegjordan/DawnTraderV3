#!/usr/bin/env python3
"""The P6 observation read (B-TOKEN-ECONOMY amendment 1, P6 Step 7; pre-audit line 339, R2-3 and R2-5).

For every alert-lane routing since the install it recomputes the owner INDEPENDENTLY from the owner table and lists
every difference - never a net count. Per UTC day it prints:
  (i)   every lane marker against the table owner: agree / DIFFERS (listed one by one) / unjoined (no live row);
  (iii) fallback routings - from the markers' own rule text AND from the bridge journal's per-batch line;
  (iv)  churn (an alert id the lane routed to more than one owner in the window) and escalations (journal);
  (v)   the due count now, and whether each installed lane file equals its blob at the ref (with --installed-dir;
        the owner table is read from the mirror, not installed, so it is not in that list).
Stated limit (R2-3): a marker whose alert has no live row in the alerts file cannot be joined; it is COUNTED as
unjoined, never silently dropped, and never read as agreement.

Inputs are files, so a second party re-derives the same read from the same objects:
  --inbox     /var/log/cc-discord-inbox.jsonl (Helsinki)
  --alerts    a whole copy of staging's /var/log/dawntrader/system-alerts.jsonl (never a tail - #980)
  --journal   `journalctl -u discord-langston-bridge.service --since <T'> --no-pager` output (optional)
  --git-dir / --ref   where the table, register and plan are read (default: the Helsinki mirror, the lane's branch)
Run `--self-test` first: it drives the same functions over a synthetic inbox holding one known disagreement, one
fallback, one escalation and one churned id, and exits non-zero unless every count comes out as stated beforehand.
Exit codes: 0 read printed (differences are REPORTED, not an error) · 1 self-test failed · 2 an input unreadable."""
import argparse, collections, datetime as dt, hashlib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import alert_lane as al            # noqa: E402  - the lane's own marker regex and table loader
import alert_owner_route as aor    # noqa: E402  - the same table_route the bridge enforces

T_PRIME = "2026-11-21T00:13:33Z"   # the Langston bridge restart that installed P6 (39a3849c2)
# The three INSTALLED lane files. The owner table is deliberately absent: the bridge reads it from the mirror at the
# branch head on every batch (alert_owner_route), never from the install dir, so its sha is the "table read at" line
# and the journal's per-batch "at <sha>" - listing it here printed UNREADABLE every day (a false alarm, 2026-11-21).
LANE_FILES = ("discord-langston-bridge.py", "alert_lane.py", "alert_owner_route.py")
RULE_RE = re.compile(r"\(owner table: (.*)\)\s*$")
TABLE_LINE = re.compile(r"^(\d{4}-\d\d-\d\d) [\d:]+ alert lane: owner table routes (\d+) of (\d+) alert\(s\) at "
                        r"([0-9a-f]{40}), (\d+) by the fallback, (\d+) escalated")
BATCH_LINE = re.compile(r"^(\d{4}-\d\d-\d\d) [\d:]+ alert lane: batch of (\d+) - routed (\d+), escalated (\d+)")


def lane_markers(inbox_lines, since, until):
    """[(ts, alert_id, owner, action)] from the lane's own posts (kind langston_outbound, lane alert) in [since, until)."""
    out = []
    for line in inbox_lines:
        try:
            d = json.loads(line)
        except ValueError:
            continue
        ts = d.get("ts") or ""
        if d.get("kind") != "langston_outbound" or d.get("lane") != "alert" or not (since <= ts < until):
            continue
        for m in al.MARKER_RE.finditer(d.get("text") or ""):
            out.append((ts, m.group(1).lower(), m.group(2), m.group(3)))
    return out


def lane_escalations(inbox_lines, since, until):
    """[(ts, alert_id, reason)] - the ESCALATE markers in the lane's own posts in [since, until)."""
    out = []
    for line in inbox_lines:
        try:
            d = json.loads(line)
        except ValueError:
            continue
        ts = d.get("ts") or ""
        if d.get("kind") != "langston_outbound" or d.get("lane") != "alert" or not (since <= ts < until):
            continue
        for m in al.ESCALATE_RE.finditer(d.get("text") or ""):
            out.append((ts, m.group(1).lower(), m.group(2)))
    return out


def escalation_kind(reason):
    """Which apply_table/enforce arm wrote it - read off its own fixed wording (alert_lane.py apply_table)."""
    r = reason or ""
    if "is stale; he decides" in r or "the table or his ruling" in r:
        return "table-vs-precedent"
    if r.startswith("owner table:"):
        return "table-escalation-rule"
    if "routing of" in r and "was to Kyle" in r:
        return "precedent-Kyle"
    if "would route this to Kyle" in r:
        return "lane-Kyle"
    if "live row" in r:
        return "row-unreadable"
    return "other"


def last_rows(alert_lines):
    """{id: last row} - the last row for an id is its state (the file is append-only)."""
    rows = {}
    for line in alert_lines:
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("id"):
            rows[str(d["id"]).lower()] = d
    return rows


def marker_rule(action):
    m = RULE_RE.search(action or "")
    return m.group(1) if m else None


def compare(markers, rows, table, batch_owner, escalations=()):
    """{day: {'agree': [...], 'differs': [...], 'unjoined': [...], 'fallback_markers': n}} plus churn {id: owners}."""
    days = collections.defaultdict(lambda: {"agree": [], "differs": [], "unjoined": [], "fallback_markers": 0,
                                            "no_rule_text": 0, "precedent": [], "escalated": [],
                                            "rule_only": []})
    owners = collections.defaultdict(list)
    for ts, aid, owner, action in markers:
        day = days[ts[:10]]
        owners[aid].append(owner)
        rule = marker_rule(action)
        if rule is None:
            day["no_rule_text"] += 1
        elif rule.startswith("fallback"):
            day["fallback_markers"] += 1
        row = rows.get(aid)
        if row is None:
            day["unjoined"].append((ts, aid, owner, rule))
            continue
        t_owner, t_rule = aor.table_route(aor.dedupe_key_of(row), row.get("category"), row.get("title"), table,
                                          batch_owner)
        rec = (ts, aid, owner, rule, t_owner, t_rule)
        if rule is None and t_rule == "fallback":
            day["precedent"].append(rec)               # apply_table sent it to apply_precedent: Langston's ruling holds
            continue
        same_rule = rule is not None and (rule == t_rule or rule.startswith(t_rule + ";")
                                          or (t_rule == "fallback" and rule.startswith("fallback")))
        if owner == t_owner and same_rule:
            day["agree"].append(rec)
        elif owner == t_owner:
            day["rule_only"].append(rec)               # right owner, the post does not state the table's rule
        else:
            day["differs"].append(rec)
    for ts, aid, reason in escalations:
        days[ts[:10]]["escalated"].append((ts, aid, escalation_kind(reason), reason))
    churn = {aid: os_ for aid, os_ in owners.items() if len(set(os_)) > 1}
    return dict(days), churn


def journal_counts(journal_lines, since="", until="9"):
    """{day: {'fallback': n, 'table_escalated': n, 'batches': n, 'escalated': n, 'shas': set}} from the bridge log."""
    out = collections.defaultdict(lambda: {"fallback": 0, "table_escalated": 0, "batches": 0, "escalated": 0,
                                           "shas": set()})
    for line in journal_lines:
        body = line.split("python3[", 1)[-1].split("]: ", 1)[-1] if "]: " in line else line
        stamp = re.match(r"(\d{4}-\d\d-\d\d) ([\d:]+)", body)
        if not stamp or not (since <= "%sT%s" % stamp.groups() < until):
            continue
        m = TABLE_LINE.search(body)
        if m:
            d = out[m.group(1)]
            d["fallback"] += int(m.group(5))
            d["table_escalated"] += int(m.group(6))
            d["shas"].add(m.group(4))
        m = BATCH_LINE.search(body)
        if m:
            d = out[m.group(1)]
            d["batches"] += 1
            d["escalated"] += int(m.group(4))
    return dict(out)


def due_count(rows, now_iso):
    return sum(1 for r in rows.values() if r.get("state") == "active" and r.get("acknowledged_at") is None
               and (r.get("triggers_at") or "9") <= now_iso)


def blob_sha(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def installed_vs_ref(installed_dir, git_dir, ref):
    out = []
    for f in LANE_FILES:
        p = os.path.join(installed_dir, f)
        try:
            have = blob_sha(open(p, "rb").read())
        except OSError as e:
            out.append((f, "UNREADABLE (%s)" % type(e).__name__))
            continue
        r = subprocess.run(["git", "--git-dir", git_dir, "rev-parse", "%s:comms-infra/discord/%s" % (ref, f)],
                           capture_output=True, text=True)
        want = r.stdout.strip() if r.returncode == 0 else "NO BLOB AT REF (%s)" % r.stderr.strip()[:80]
        out.append((f, "equal" if have == want else "DIFFERS installed %s ref %s" % (have[:12], want[:12])))
    return out


def report(days, churn, jc, due, table_sha, since, until, inst=None, unjoined_detail=True):
    print("P6 OBSERVATION READ  window [%s, %s)  table read at %s" % (since, until, table_sha))
    allday = sorted(set(days) | set(jc))
    for day in allday:
        d = days.get(day, {"agree": [], "differs": [], "unjoined": [], "fallback_markers": 0, "no_rule_text": 0,
                           "precedent": [], "escalated": [], "rule_only": []})
        j = jc.get(day)
        n = len(d["agree"]) + len(d["differs"]) + len(d["rule_only"]) + len(d["unjoined"]) + len(d["precedent"])
        print("== %s  lane markers %d: agree %d · OWNER DIFFERS %d · right owner, rule not stated %d · "
              "fallback-to-precedent %d · unjoined %d (no live row) · no rule text %d"
              % (day, n, len(d["agree"]), len(d["differs"]), len(d["rule_only"]), len(d["precedent"]),
                 len(d["unjoined"]), d["no_rule_text"]))
        for tag, recs in (("OWNER DIFFERS", d["differs"]), ("RULE NOT STATED", d["rule_only"])):
            for ts, aid, o, rule, to, tr in recs:
                print("   %s %s %s  lane %s by %r  table %s by %r" % (tag, ts[:19], aid, o, rule, to, tr))
        if unjoined_detail:
            for ts, aid, o, rule in d["unjoined"]:
                print("   unjoined %s %s  lane %s by %r" % (ts[:19], aid, o, rule))
        print("   (iii) fallback: no-precedent markers %d + to-precedent %d · journal %s"
              % (d["fallback_markers"], len(d["precedent"]), j["fallback"] if j else "n/a"))
        kinds = collections.Counter(k for _t, _a, k, _r in d["escalated"])
        print("   (iv) escalations in lane posts: %d %s" % (len(d["escalated"]), dict(sorted(kinds.items()))))
        for ts, aid, k, r in d["escalated"]:
            print("   ESCALATED %s %s  %s: %s" % (ts[:19], aid, k, r[:140]))
        if j:
            print("   (iv) escalations: journal %d (of which table-rule %d) over %d batch(es); table sha(s) %s"
                  % (j["escalated"], j["table_escalated"], j["batches"], ", ".join(sorted(s[:12] for s in j["shas"]))))
    print("(iv) churn - ids routed to more than one owner in the window: %d" % len(churn))
    for aid, os_ in sorted(churn.items()):
        print("   CHURN %s %s" % (aid, " -> ".join(os_)))
    print("(v) due now: %d" % due)
    for f, verdict in (inst or []):
        print("(v) installed %s: %s" % (f, verdict))


def self_test():
    """Synthetic objects with every count stated BEFORE the run (rider on #744). Exit 1 unless all match."""
    table = {"batches": {"B-X": {"owner": "CC-INFRA"}}, "prefixes": {"pre-": {"owner": "CC-C"}}, "titles": {},
             "fallback": "CC-INFRA"}
    ids = ["%08d-0000-4000-8000-000000000000" % i for i in range(1, 8)]
    rows = last_rows(json.dumps(r) for r in [
        {"id": ids[0], "title": "B-X: thing", "category": "verification"},                 # table batch:B-X CC-INFRA
        {"id": ids[1], "title": "t", "dedupe_key": "pre-1", "category": "verification"},  # table prefix:pre- CC-C
        {"id": ids[2], "title": "t", "dedupe_key": "zz-1", "category": "verification"},   # table fallback CC-INFRA
        {"id": ids[5], "title": "t", "dedupe_key": "zz-2", "category": "verification"},   # table fallback CC-INFRA
        {"id": ids[6], "title": "B-X: other", "category": "verification"},                # table batch:B-X CC-INFRA
    ])
    def post(ts, *marks):
        return json.dumps({"ts": ts, "kind": "langston_outbound", "lane": "alert", "text": "Alert lane - x\n" +
                           "\n".join('[[ALERT id=%s owner=%s action="a (owner table: %s)"]]' % m for m in marks)})
    inbox = [
        post("2026-11-21T01:00:00", (ids[0], "CC-INFRA", "batch:B-X")),                         # agree
        post("2026-11-21T07:00:00", (ids[0], "CC-INFRA", "batch:B-X")),     # agree; a re-surface, SAME owner: no churn
        post("2026-11-21T02:00:00", (ids[1], "CC-A", "prefix:pre-")),                           # DIFFERS (owner)
        post("2026-11-21T03:00:00", (ids[2], "CC-INFRA", "fallback - no rule matched, no Langston precedent")),
        post("2026-11-21T04:00:00", (ids[3], "CC-B", "batch:B-Y")),                             # unjoined
        post("2026-11-21T05:00:00", (ids[1], "CC-C", "prefix:pre-")),                           # agree; ids[1] churns
        json.dumps({"ts": "2026-11-21T05:30:00", "kind": "langston_outbound", "lane": "alert", "text":
                    '[[ALERT id=%s owner=CC-A action="per precedent"]]' % ids[5]}),               # fallback->precedent
        json.dumps({"ts": "2026-11-21T05:40:00", "kind": "langston_outbound", "lane": "alert", "text":
                    '[[ESCALATE id=%s reason="the owner table says CC-C (prefix:pre-) but Langston’s latest '
                    'routing of t is CC-A - the table or his ruling is stale; he decides"]]' % ids[1]}),
        json.dumps({"ts": "2026-11-21T05:50:00", "kind": "langston_outbound", "lane": "alert", "text":
                    '[[ALERT id=%s owner=CC-INFRA action="no rule stated"]]' % ids[6]}),          # right owner, no rule
        post("2026-11-20T23:00:00", (ids[4], "CC-A", "batch:B-X")),                             # before window
        json.dumps({"ts": "2026-11-21T06:00:00", "kind": "langston_outbound", "text":            # not a lane post
                    '[[ALERT id=%s owner=CC-B action="x"]]' % ids[0]}),
    ]
    journal = ["Nov 21 01:00:00 h python3[1]: 2026-11-21 01:00:00 alert lane: owner table routes 1 of 2 alert(s) at "
               + "a" * 40 + ", 1 by the fallback, 1 escalated (batch owner not a building session)",
               "Nov 21 01:00:09 h python3[1]: 2026-11-21 01:00:09 alert lane: batch of 2 - routed 1, escalated 1",
               "Nov 21 00:05:00 h python3[1]: 2026-11-21 00:05:00 alert lane: batch of 3 - routed 0, escalated 3"]
    days, churn = compare(lane_markers(inbox, "2026-11-21T00:13:33", "2026-11-22"), rows, table, {},
                          lane_escalations(inbox, "2026-11-21T00:13:33", "2026-11-22"))
    d = days["2026-11-21"]
    jc = journal_counts(journal, "2026-11-21T00:13:33", "2026-11-22")["2026-11-21"]   # the 00:05 line is outside
    expect = {"agree": 4, "differs": 1, "unjoined": 1, "fallback_markers": 1, "churn": [ids[1]],
              "journal_fallback": 1, "journal_escalated": 1, "days": ["2026-11-21"], "differs_id": ids[1],
              "precedent": 1, "escalated_kinds": {"table-vs-precedent": 1}, "rule_only": [ids[6]],
              "journal_batches": 1}
    got = {"agree": len(d["agree"]), "differs": len(d["differs"]), "unjoined": len(d["unjoined"]),
           "fallback_markers": d["fallback_markers"], "churn": sorted(churn), "journal_fallback": jc["fallback"],
           "journal_escalated": jc["escalated"], "days": sorted(days),
           "differs_id": d["differs"][0][1] if d["differs"] else None, "precedent": len(d["precedent"]),
           "escalated_kinds": dict(collections.Counter(k for _t, _a, k, _r in d["escalated"])),
           "rule_only": [r[1] for r in d["rule_only"]], "journal_batches": jc["batches"]}
    bad = [k for k in expect if expect[k] != got[k]]
    for k in expect:
        print(("ok   " if k not in bad else "FAIL ") + "%s expected %r got %r" % (k, expect[k], got[k]))
    print("self-test failures: %d" % len(bad))
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--inbox", default="/var/log/cc-discord-inbox.jsonl")
    ap.add_argument("--alerts")
    ap.add_argument("--journal")
    ap.add_argument("--git-dir", default="/srv/dawntrader-backup.git")
    ap.add_argument("--ref", default="refs/heads/migration/aws-supabase")
    ap.add_argument("--since", default=T_PRIME)
    ap.add_argument("--until")
    ap.add_argument("--installed-dir")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if not a.alerts:
        print("refused: --alerts (a WHOLE copy of staging's system-alerts.jsonl) is required", file=sys.stderr)
        return 2
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    since, until = a.since.rstrip("Z"), (a.until or now).rstrip("Z")
    try:
        sha = subprocess.run(["git", "--git-dir", a.git_dir, "rev-parse", a.ref], capture_output=True, text=True,
                             check=True).stdout.strip()

        def read(path):
            return subprocess.run(["git", "--git-dir", a.git_dir, "show", "%s:%s" % (sha, path)], capture_output=True,
                                  encoding="utf-8", check=True).stdout
        table, batch_owner = al.owner_routing(read)
        with open(a.inbox, encoding="utf-8", errors="replace") as fh:
            inbox = fh.readlines()
        markers, escs = lane_markers(inbox, since, until), lane_escalations(inbox, since, until)
        with open(a.alerts, encoding="utf-8", errors="replace") as fh:
            rows = last_rows(fh)
        jc = {}
        if a.journal:
            with open(a.journal, encoding="utf-8", errors="replace") as fh:
                jc = journal_counts(fh, since, until)
    except (OSError, subprocess.CalledProcessError, ValueError) as e:
        print("refused: an input could not be read (%s: %s)" % (type(e).__name__, str(e)[:200]), file=sys.stderr)
        return 2
    if not rows:
        print("refused: the alerts file holds no rows - an empty copy is not evidence", file=sys.stderr)
        return 2
    days, churn = compare(markers, rows, table, batch_owner, escs)
    inst = installed_vs_ref(a.installed_dir, a.git_dir, sha) if a.installed_dir else None
    report(days, churn, jc, due_count(rows, now), sha, since, until, inst)
    return 0


if __name__ == "__main__":
    sys.exit(main())
