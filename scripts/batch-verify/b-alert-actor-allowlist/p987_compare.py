#!/usr/bin/env python3
"""P10 conservation compare: the PRE-capture id set vs the file NOW.

Usage: p987_compare.py [--pre PATH] [--post PATH] [--label L] [allowed_id ...]

By default the compare RE-CAPTURES the live file (via p987_capture.py, label
`compare-<utc>`) and diffs the pre-capture against that — so a write made after
the last stored snapshot is always inside the instrument's reach (Langston Step-8
FINDING-1: the first version read a frozen post file and could not see a later
write). Pass --post to compare against a specific stored snapshot instead.

allowed_id: pre-capture ids whose identity fields were EXPECTED to change. An id
minted AFTER the pre-capture is not in the pre set and is reported on the
`added` line — it can never be "allowed"; the verdict covers pre-capture ids only.
"""
import argparse, datetime, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--pre', default='/home/deploy/p987-pre.json')
ap.add_argument('--post', default=None, help='stored snapshot to compare against; default = re-capture the live file now')
ap.add_argument('--label', default=None)
ap.add_argument('allowed', nargs='*')
a = ap.parse_args()

pre = json.load(open(a.pre))
if a.post:
    post = json.load(open(a.post)); post_src = a.post
else:
    label = a.label or 'compare-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    cap = os.path.join(HERE, 'p987_capture.py')
    if not os.path.exists(cap):
        cap = '/home/deploy/p987_capture.py'
    subprocess.run([sys.executable, cap, label], check=True)
    post_src = f'/home/deploy/p987-{label}.json'
    post = json.load(open(post_src))

allowed_changed = set(a.allowed)
pre_ids = set(pre['per_id']); post_ids = set(post['per_id'])
missing = sorted(pre_ids - post_ids)
changed = {i: (pre['per_id'][i], post['per_id'][i]) for i in pre_ids & post_ids if pre['per_id'][i] != post['per_id'][i]}
unexpected = {i: v for i, v in changed.items() if i not in allowed_changed}
added = sorted(post_ids - pre_ids)
not_in_pre = sorted(allowed_changed - pre_ids)
print(f"pre: {pre['taken_at_utc']} sha256={pre['sha256'][:12]} rows={pre['rows']} ({a.pre})")
print(f"post: {post['taken_at_utc']} sha256={post['sha256'][:12]} rows={post['rows']} ({post_src})")
if not_in_pre:
    print(f"NOTE: {len(not_in_pre)} allowed id(s) are not in the pre-capture set and cannot be 'allowed' — they appear on the added line if present: {not_in_pre}")
print(f"pre-capture ids: {len(pre_ids)} | still present: {len(pre_ids & post_ids)} | MISSING: {len(missing)} {missing}")
print(f"pre-capture ids whose (acknowledged_by, resolved_by_claimed, state) changed: {len(changed)}")
for i, (x, y) in changed.items():
    print(f"  {'EXPECTED' if i in allowed_changed else 'UNEXPECTED'} {i[:8]}: {x} -> {y}")
print(f"UNEXPECTED changes: {len(unexpected)}")
print(f"rows added after capture (excluded by id): {len(added)}")
for i in added:
    print(f"  + {i[:8]}: {post['per_id'][i]}")
print(f"post integrity: unparseable={post['unparseable']} shape_invalid={post['shape_invalid']} distinct_ids={post['distinct_ids']} dups={post['duplicate_ids']}")
pre_ms = pre['acknowledged_by_multiset']; post_ms = post['acknowledged_by_multiset']
diff = {k: (pre_ms.get(k, 0), post_ms.get(k, 0)) for k in set(pre_ms) | set(post_ms) if pre_ms.get(k, 0) != post_ms.get(k, 0)}
print(f"acknowledged_by multiset deltas (key: pre -> post): {diff}")
print("CONSERVATION (pre-capture id set):", "PASS" if not missing and not unexpected else "FAIL")
