# -*- coding: utf-8 -*-
"""OBJ-6b, step 1: PIN THE POPULATION before attributing anything.

The gate: if `wrong-object` instances were not predominantly produced by Bash, the
`Bash` matcher is mis-aimed and 6c/6d do not get built. So first establish, at ONE
pinned ref from ONE walk, exactly which commits carry the trailer.
"""
import subprocess, re, json, os, io
os.chdir(r'C:\DawnTraderV3-old')

REF = subprocess.run(['git', 'rev-parse', 'origin/migration/aws-supabase'],
                     capture_output=True, text=True).stdout.strip()

SEP = '\x1e'
raw = subprocess.run(
    ['git', 'log', REF, '--no-merges', '--pretty=format:%H%x1f%ad%x1f%s%x1f%b' + SEP, '--date=short'],
    capture_output=True, text=True, encoding='utf-8', errors='replace').stdout

records = []
for chunk in raw.split(SEP):
    chunk = chunk.strip('\n')
    if not chunk:
        continue
    parts = chunk.split('\x1f')
    if len(parts) < 4:
        continue
    sha, date, subj, body = parts[0], parts[1], parts[2], parts[3]
    records.append({'sha': sha, 'date': date, 'subj': subj, 'body': body})

print('PINNED REF : %s' % REF)
print('COMMITS WALKED (no-merges, branch ancestry): %d' % len(records))

# The trailer, anchored at line start. `MISTAKE: none` is a declared NO-mistake and is
# excluded from the denominator -- stated, because r4 recorded that this exclusion was
# applied silently and made 171/44 unreproducible.
TRAILER = re.compile(r'^MISTAKE:\s*([a-z0-9][a-z0-9-]*)', re.M)

slugs = {}
wrong = []
none_rows = 0
for r in records:
    for m in TRAILER.finditer(r['body']):
        slug = m.group(1)
        if slug == 'none':
            none_rows += 1
            continue
        slugs[slug] = slugs.get(slug, 0) + 1
        if slug == 'wrong-object':
            wrong.append(r)

total = sum(slugs.values())
print('WELL-FORMED TRAILERS (excluding "MISTAKE: none"): %d across %d slugs' % (total, len(slugs)))
print('  "MISTAKE: none" rows excluded: %d  <- stated, not silent' % none_rows)
print()
top = sorted(slugs.items(), key=lambda kv: -kv[1])[:6]
for s, n in top:
    print('  %-34s %4d  %5.1f%%' % (s, n, 100.0 * n / total))
second = top[1][1] if len(top) > 1 else 0
print()
print('  wrong-object share: %.1f%%   ratio to second place: %.1fx' % (
    100.0 * slugs.get('wrong-object', 0) / total, slugs.get('wrong-object', 0) / second if second else 0))
print()
print('=== THE 6b POPULATION: %d wrong-object commits ===' % len(wrong))

out = r'C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-old\66dbb030-b3cb-4448-8086-39344c645007\scratchpad\obj6b_population.json'
io.open(out, 'w', encoding='utf-8').write(json.dumps({'ref': REF, 'commits': wrong}, indent=1))
print('written: %s' % out)
for r in wrong[:8]:
    print('  %s %s %s' % (r['sha'][:9], r['date'], r['subj'][:78]))
print('  ... (%d total)' % len(wrong))
