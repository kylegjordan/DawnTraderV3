#!/usr/bin/env python3
"""P10 conservation compare: pre-capture id set vs the file now. Names the object and the population."""
import json, sys
pre = json.load(open('/home/deploy/p987-pre.json'))
post = json.load(open('/home/deploy/p987-post.json'))
allowed_changed = set(sys.argv[1:])  # ids whose identity fields were EXPECTED to change (the OBJ-6 checks)
pre_ids = set(pre['per_id']); post_ids = set(post['per_id'])
missing = sorted(pre_ids - post_ids)
changed = {i: (pre['per_id'][i], post['per_id'][i]) for i in pre_ids & post_ids if pre['per_id'][i] != post['per_id'][i]}
unexpected = {i: v for i, v in changed.items() if i not in allowed_changed}
added = sorted(post_ids - pre_ids)
print(f"pre: {pre['taken_at_utc']} sha256={pre['sha256'][:12]} rows={pre['rows']} | post: {post['taken_at_utc']} sha256={post['sha256'][:12]} rows={post['rows']}")
print(f"pre-capture ids: {len(pre_ids)} | still present: {len(pre_ids & post_ids)} | MISSING: {len(missing)} {missing}")
print(f"pre-capture ids whose (acknowledged_by, resolved_by_claimed, state) changed: {len(changed)}")
for i, (a, b) in changed.items():
    tag = 'EXPECTED' if i in allowed_changed else 'UNEXPECTED'
    print(f"  {tag} {i[:8]}: {a} -> {b}")
print(f"UNEXPECTED changes: {len(unexpected)}")
print(f"rows added after capture (excluded by id): {len(added)}")
for i in added:
    print(f"  + {i[:8]}: {post['per_id'][i]}")
print(f"post integrity: unparseable={post['unparseable']} shape_invalid={post['shape_invalid']} distinct_ids={post['distinct_ids']} dups={post['duplicate_ids']}")
pre_ms = pre['acknowledged_by_multiset']; post_ms = post['acknowledged_by_multiset']
diff = {k: (pre_ms.get(k, 0), post_ms.get(k, 0)) for k in set(pre_ms) | set(post_ms) if pre_ms.get(k, 0) != post_ms.get(k, 0)}
print(f"acknowledged_by multiset deltas (key: pre -> post): {diff}")
print("CONSERVATION:", "PASS" if not missing and not unexpected else "FAIL")
