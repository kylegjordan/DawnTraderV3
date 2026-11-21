"""F-3 real-data positive control: a REAL alert row -> the REAL apply_table emitter -> the REAL dc.log formatter
-> the tool's CHOSE_RULE / CHOSE_FALLBACK regexes. No synthetic literal on either side of the regex."""
import json, subprocess, sys, time
sys.path.insert(0, ".")
import alert_lane as al, alert_owner_route as aor, alert_lane_daily_read as dr

SHA = "984ae80bb0f88d2a13c1aa2c9b48247243b1b236"
def git_show(path):
    return subprocess.run(["git", "--git-dir", "/srv/dawntrader-backup.git", "show", "%s:%s" % (SHA, path)],
                          capture_output=True, text=True, check=True).stdout
table, batch_owner = al.owner_routing(git_show)

rows = {}
for line in open("alerts_whole.jsonl"):
    try: d = json.loads(line)
    except ValueError: continue
    if d.get("id"): rows[str(d["id"]).lower()] = d

# a real row the table settles BY RULE, and a real row that falls through to the table fallback
pick = {}
for aid, row in rows.items():
    if row.get("state") != "active" or row.get("acknowledged_at") is not None: continue
    o, rule = aor.table_route(aor.dedupe_key_of(row), row.get("category"), row.get("title"), table, batch_owner)
    kind = "fallback" if rule == "fallback" else "rule"
    if kind not in pick and o != "CC-B":
        pick[kind] = (aid, row, o, rule)
    if len(pick) == 2: break
print("picked:", {k: (v[0][:8], v[2], v[3]) for k, v in pick.items()})

notes_all = []
for kind, (aid, row, t_owner, rule) in pick.items():
    routed = {aid: ("CC-B", "triage: real-data F-3 control")}          # a lane choice that DIFFERS from the table's
    keys = {aid: al.alert_key("**%s**" % (row.get("title") or "").strip())}
    troutes = {aid: (t_owner, rule)}
    r, esc, notes, rest = al.apply_table(routed, {}, keys, {}, troutes)   # prec={} -> no precedent
    print("%-8s apply_table -> routed=%s esc=%d rest=%d notes=%d" % (kind, {k: v[0] for k, v in r.items()}, len(esc), len(rest), len(notes)))
    notes_all += notes

# the REAL formatter: discord_common.log's prefix, verbatim
jlines = ["Nov 21 01:50:00 helsinki python3[1]: %s alert lane: %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), n) for n in notes_all]
for l in jlines: print("JOURNAL LINE:", l)
jc = dr.journal_counts(jlines, "2026-11-21T00:00:00", "2026-11-22T00:00:00")
got = [x for d in jc.values() for x in d["lane_chose"]]
print("tool parsed lane_chose notes: %d of %d emitted" % (len(got), len(notes_all)))
for x in got: print("   PARSED:", x)
sys.exit(0 if len(got) == len(notes_all) == 2 else 1)
