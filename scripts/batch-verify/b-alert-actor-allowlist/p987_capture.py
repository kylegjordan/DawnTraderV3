#!/usr/bin/env python3
"""B-ALERT-ACTOR-ALLOWLIST (#987) P10 conservation capture.
Usage: p987_capture.py <label>   -> writes /home/deploy/p987-<label>.json
Records, over /var/log/dawntrader/system-alerts.jsonl (whole file):
  sha256, byte length, line count, unparseable lines, shape-invalid lines, distinct ids,
  duplicate ids, the acknowledged_by multiset, the resolved_by_claimed multiset,
  and per-id (acknowledged_by, resolved_by_claimed, state) for the pre-capture id set.
"""
import hashlib, json, sys, collections, datetime
P = '/var/log/dawntrader/system-alerts.jsonl'
label = sys.argv[1]
raw = open(P, 'rb').read()
lines = [l for l in raw.decode('utf-8').split('\n') if l.strip()]
unparseable = 0; shape_invalid = 0; rows = []
for l in lines:
    try:
        r = json.loads(l)
    except Exception:
        unparseable += 1; continue
    if not r.get('id') or not r.get('state') or not r.get('triggers_at'):
        shape_invalid += 1; continue
    rows.append(r)
ids = [r['id'] for r in rows]
dups = [i for i, c in collections.Counter(ids).items() if c > 1]
per_id = {r['id']: [r.get('acknowledged_by'), r.get('resolved_by_claimed'), r.get('state')] for r in rows}
out = {
    'label': label, 'taken_at_utc': datetime.datetime.utcnow().isoformat() + 'Z',
    'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'lines': len(lines),
    'unparseable': unparseable, 'shape_invalid': shape_invalid,
    'rows': len(rows), 'distinct_ids': len(set(ids)), 'duplicate_ids': dups,
    'acknowledged_by_multiset': dict(collections.Counter(str(r.get('acknowledged_by')) for r in rows)),
    'resolved_by_claimed_multiset': dict(collections.Counter(str(r.get('resolved_by_claimed')) for r in rows)),
    'per_id': per_id,
}
dest = f'/home/deploy/p987-{label}.json'
json.dump(out, open(dest, 'w'), indent=1)
print(f"[p987 {label}] {out['taken_at_utc']} sha256={out['sha256'][:16]}… lines={out['lines']} rows={out['rows']} "
      f"unparseable={unparseable} shape_invalid={shape_invalid} distinct_ids={out['distinct_ids']} dups={len(dups)} "
      f"ack_by_distinct={len(out['acknowledged_by_multiset'])} -> {dest}")
