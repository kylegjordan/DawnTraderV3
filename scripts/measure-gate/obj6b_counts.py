# -*- coding: utf-8 -*-
"""Re-derive the reader's hits A and B before accepting them. A hit is a lead."""
import os, subprocess, re, io, json, glob, datetime, collections
os.chdir(r'C:\DawnTraderV3-old')

SEP = '\x1e'
def walk(ref, use_full):
    fmt = '%H%x1f%cI%x1f' + ('%B' if use_full else '%b') + SEP
    return subprocess.run(['git', 'log', ref, '--no-merges', '--format=' + fmt],
                          capture_output=True, text=True, encoding='utf-8', errors='replace').stdout

TR = re.compile(r'^MISTAKE:\s*([a-z0-9][a-z0-9-]*)', re.M)

print('=== HIT A: does 189/44/90 reproduce, and at which ref? ===')
print('  %-12s %-6s %6s %6s %8s %8s' % ('ref', 'field', 'total', 'slugs', 'wo-trail', 'wo-commits'))
for ref in ['origin/migration/aws-supabase', 'a758ce6f3', '4210bba36', 'a913bdeb1']:
    for use_full, lab in ((False, '%b'), (True, '%B')):
        raw = walk(ref, use_full)
        if not raw.strip(): continue
        slugs = collections.Counter(); wo_tr = 0; wo_sha = set()
        for ch in raw.split(SEP):
            ch = ch.strip('\n')
            if not ch: continue
            p = ch.split('\x1f')
            if len(p) < 3: continue
            for m in TR.finditer(p[2]):
                s = m.group(1)
                if s == 'none': continue
                slugs[s] += 1
                if s == 'wrong-object':
                    wo_tr += 1; wo_sha.add(p[0])
        print('  %-12s %-6s %6d %6d %8d %8d' % (ref[:12], lab, sum(slugs.values()), len(slugs), wo_tr, len(wo_sha)))

print()
print('=== HIT A(ii): is the "MISTAKE: none" exclusion a no-op? ===')
raw = walk('origin/migration/aws-supabase', True)
hits = []
for ch in raw.split(SEP):
    p = ch.strip('\n').split('\x1f')
    if len(p) < 3: continue
    for m in re.finditer(r'^MISTAKE:\s*none.*$', p[2], re.M):
        hits.append((p[0][:9], m.group(0)[:70]))
print('  literal "MISTAKE: none" lines found: %d' % len(hits))
for sha, txt in hits:
    wellformed = bool(re.match(r'^MISTAKE:\s*none\s*\[[^\]]+\]\s*[-\u2014\u2013]', txt))
    print('    %s  well-formed(with [batch] and dash)=%s  %r' % (sha, wellformed, txt))

print()
print('=== HIT B: does the interval-coverage test carry information? ===')
BASE = r'C:\Users\kyleg\.claude\projects'
def parse(ts):
    try: return datetime.datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
    except Exception: return None
ivs = []
for p in glob.glob(os.path.join(BASE, 'C--DawnTraderV3*', '*.jsonl')):
    try:
        with io.open(p, 'rb') as f:
            a = parse(json.loads(f.readline().decode('utf-8', 'replace')).get('timestamp'))
            f.seek(max(0, os.path.getsize(p) - 262144))
            b = None
            for l in reversed(f.read().decode('utf-8', 'replace').strip().split('\n')):
                try:
                    b = parse(json.loads(l).get('timestamp'))
                    if b: break
                except Exception: continue
        if a and b: ivs.append((a, b, os.path.basename(p)[:8]))
    except Exception: continue

# wrong-object commit times
wo = []
for ch in walk('origin/migration/aws-supabase', True).split(SEP):
    p = ch.strip('\n').split('\x1f')
    if len(p) < 3: continue
    if any(m.group(1) == 'wrong-object' for m in TR.finditer(p[2])):
        t = parse(p[1])
        if t: wo.append(t)
wo = sorted(set(wo))
dist = collections.Counter()
names = collections.Counter()
for t in wo:
    lo = t - datetime.timedelta(minutes=60)
    cov = [n for a, b, n in ivs if not (b < lo or a > t)]
    dist[len(cov)] += 1
    names[tuple(sorted(cov))] += 1
print('  wrong-object commit times: %d' % len(wo))
print('  windows by number of covering intervals: %s' % dict(dist))
print('  distinct covering-SETS: %d  <- if 1, the test returns the same answer for every commit' % len(names))
for s, n in names.most_common(3):
    print('    %d windows covered by exactly: %s' % (n, ', '.join(s)))
