import json, sys
p=sys.argv[1]
sids=set(); lines=0; bad=0; uu=set(); dup=0; types={}
with open(p,encoding='utf-8') as f:
    for line in f:
        line=line.strip()
        if not line: continue
        lines+=1
        try: d=json.loads(line)
        except: bad+=1; continue
        if 'sessionId' in d: sids.add(d['sessionId'])
        u=d.get('uuid')
        if u is not None:
            if u in uu: dup+=1
            uu.add(u)
print(f"lines={lines} bad_json={bad} duplicate_uuids={dup} unique_uuids={len(uu)}")
print(f"distinct_sessionIds={sids}")
