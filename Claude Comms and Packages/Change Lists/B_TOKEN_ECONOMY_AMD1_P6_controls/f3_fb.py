import json, subprocess, sys, time, collections
sys.path.insert(0, ".")
import alert_lane as al, alert_owner_route as aor, alert_lane_daily_read as dr
SHA="984ae80bb0f88d2a13c1aa2c9b48247243b1b236"
def git_show(p): return subprocess.run(["git","--git-dir","/srv/dawntrader-backup.git","show","%s:%s"%(SHA,p)],capture_output=True,text=True,check=True).stdout
table,bo=al.owner_routing(git_show)
rows={}
for line in open("alerts_whole.jsonl"):
    try: d=json.loads(line)
    except ValueError: continue
    if d.get("id"): rows[str(d["id"]).lower()]=d
kinds=collections.Counter(); fb=None
for aid,row in rows.items():
    o,rule=aor.table_route(aor.dedupe_key_of(row),row.get("category"),row.get("title"),table,bo)
    kinds["fallback" if rule=="fallback" else "rule"]+=1
    if rule=="fallback" and fb is None: fb=(aid,row,o,rule)
print("over all %d real rows: %s"%(len(rows),dict(kinds)))
if not fb: print("no real fallback row exists -> fallback arm has no real-data control"); sys.exit(2)
aid,row,o,rule=fb
print("fallback row:",aid[:8],repr((row.get('title') or '')[:60]),"->",o,rule)
r,esc,notes,rest=al.apply_table({aid:("CC-B","triage: real-data F-3 control")},{},{aid:al.alert_key("**%s**"%(row.get("title") or "").strip())},{},{aid:(o,rule)})
print("apply_table -> routed=%s rest=%d notes=%d"%({k:v[0] for k,v in r.items()},len(rest),len(notes)))
jl=["Nov 21 01:50:00 h python3[1]: %s alert lane: %s"%(time.strftime("%Y-%m-%d %H:%M:%S"),n) for n in notes]
for l in jl: print("JOURNAL LINE:",l)
jc=dr.journal_counts(jl,"2026-11-21T00:00:00","2026-11-22T00:00:00")
got=[x for d in jc.values() for x in d["lane_chose"]]
print("parsed %d of %d"%(len(got),len(notes)))
for x in got: print("   PARSED:",x)
sys.exit(0 if got and len(got)==len(notes) else 1)
