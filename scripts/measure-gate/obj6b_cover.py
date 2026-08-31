# -*- coding: utf-8 -*-
"""OBJ-6b, INSTRUMENT 2, step 0b: ACTUAL per-commit coverage, not the corpus HULL.

The previous run reported "100% inside the transcript span" and that was the wrong
object: the span is min(first) .. max(last) across ALL files -- a HULL. Most files
cover MINUTES. A commit can sit comfortably inside the hull with no transcript
covering its moment at all.

⇒ this asks the real question: for each wrong-object commit, does ANY transcript
interval actually CONTAIN its timestamp (plus a lookback window, since the erroring
read happens BEFORE the commit)?
"""
import os, io, json, glob, subprocess, datetime

BASE = r'C:\Users\kyleg\.claude\projects'
SP = r'C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-old\66dbb030-b3cb-4448-8086-39344c645007\scratchpad'
LOOKBACK_MIN = 60  # the erroring read precedes the commit

def iv(path):
    first = last = None
    try:
        with io.open(path, 'rb') as f:
            l = f.readline()
            if l:
                try: first = json.loads(l.decode('utf-8', 'replace')).get('timestamp')
                except Exception: pass
            size = os.path.getsize(path)
            f.seek(max(0, size - 262144))
            for l in reversed(f.read().decode('utf-8', 'replace').strip().split('\n')):
                try:
                    last = json.loads(l).get('timestamp')
                    if last: break
                except Exception: continue
    except Exception:
        pass
    return first, last

def parse(ts):
    if not ts: return None
    try: return datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
    except Exception: return None

intervals = []
for p in glob.glob(os.path.join(BASE, 'C--DawnTraderV3*', '*.jsonl')):
    f, l = iv(p)
    a, b = parse(f), parse(l)
    if a and b:
        intervals.append((a, b, p, os.path.getsize(p)))

print('=== ACTUAL COVERAGE, not the hull ===')
print('  transcript intervals with parseable ends: %d' % len(intervals))
tot_span = sum((b - a).total_seconds() for a, b, _, _ in intervals)
print('  summed wall-clock covered by transcripts: %.1f hours' % (tot_span / 3600.0))
hull_lo = min(a for a, b, _, _ in intervals); hull_hi = max(b for a, b, _, _ in intervals)
print('  HULL: %s .. %s  (%.0f days)' % (hull_lo.date(), hull_hi.date(), (hull_hi - hull_lo).total_seconds() / 86400.0))
print('  ⇒ transcripts cover %.1f%% of the hull\'s wall-clock. The hull was never the reach.'
      % (100.0 * tot_span / (hull_hi - hull_lo).total_seconds()))

pop = json.load(io.open(os.path.join(SP, 'obj6b_population.json'), encoding='utf-8'))
attr = json.load(io.open(os.path.join(SP, 'obj6b_attr1.json'), encoding='utf-8'))
unattr_shas = {x['sha'] for x in attr['unattributed']}

# commit timestamps, one walk
shas = [r['sha'] for r in pop['commits']]
os.chdir(r'C:\DawnTraderV3-old')
out = subprocess.run(['git', 'show', '-s', '--format=%H %cI'] + shas,
                     capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
ctime = {}
for line in out.split('\n'):
    parts = line.strip().split()
    if len(parts) == 2:
        d = parse(parts[1])
        if d: ctime[parts[0]] = d

covered, uncovered = [], []
for r in pop['commits']:
    t = ctime.get(r['sha'])
    if not t:
        continue
    lo = t - datetime.timedelta(minutes=LOOKBACK_MIN)
    hit = any(not (b < lo or a > t) for a, b, _, _ in intervals)
    (covered if hit else uncovered).append(r)

N = len(covered) + len(uncovered)
print()
print('=== PER-COMMIT COVERAGE (commit time, minus a %d-min lookback) ===' % LOOKBACK_MIN)
print('  wrong-object commits tested   : %d' % N)
print('  COVERED by some transcript    : %d  (%.1f%%)' % (len(covered), 100.0*len(covered)/N))
print('  NOT COVERED                   : %d  (%.1f%%)' % (len(uncovered), 100.0*len(uncovered)/N))

uc_un = [r for r in uncovered if r['sha'] in unattr_shas]
cv_un = [r for r in covered if r['sha'] in unattr_shas]
print()
print('  Of instrument 1\'s %d UNATTRIBUTED rows:' % len(unattr_shas))
print('    instrument 2 CAN reach   : %d' % len(cv_un))
print('    NEITHER instrument reaches: %d  <- the honest ceiling on 6b' % len(uc_un))
io.open(os.path.join(SP, 'obj6b_cover.json'), 'w', encoding='utf-8').write(json.dumps({
    'covered': [r['sha'] for r in covered],
    'reachable_unattributed': [{'sha': r['sha'], 'date': r['date'], 'subj': r['subj']} for r in cv_un],
}, indent=1))
