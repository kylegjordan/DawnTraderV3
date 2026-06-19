import json, sys, uuid as uuidlib
inp, outp = sys.argv[1], sys.argv[2]
first_raw = {}      # uuid -> first raw line kept
seen = set()
kept = dropped = reuuided = nouuid = 0
with open(inp,'r',encoding='utf-8') as f, open(outp,'w',encoding='utf-8') as o:
    for raw in f:
        s = raw.rstrip('\n')
        if not s.strip():
            continue
        try:
            d = json.loads(s)
        except Exception:
            o.write(raw); kept+=1; continue   # preserve unparseable as-is
        u = d.get('uuid')
        if u is None:
            o.write(raw); nouuid+=1; continue
        if u not in seen:
            seen.add(u); first_raw[u]=s; o.write(raw); kept+=1
        else:
            if s == first_raw[u]:
                dropped += 1                  # byte-identical true copy -> drop
            else:
                nu = str(uuidlib.uuid4())     # same id, different content -> re-id
                d['uuid'] = nu; seen.add(nu)
                o.write(json.dumps(d, ensure_ascii=False)+'\n'); reuuided+=1
print(f"kept(unique-uuid): {kept}  no-uuid(metadata kept): {nouuid}  dropped(identical): {dropped}  re-uuided(collisions): {reuuided}")
