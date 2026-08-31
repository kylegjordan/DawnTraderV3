# -*- coding: utf-8 -*-
"""OBJ-6b, RE-DERIVATION: was the +11.1 pp enrichment real, or a period effect?

A reader's refutation, re-derived here rather than taken on report. Two candidate
confounds, both testable:
  (i) PERIOD  - the low-Bash transcripts may all END before the wrong-object era, so
      "all other activity" compares August against May-July rather than erroring
      against non-erroring.
  (ii) TERMINATION - every window ENDS AT A COMMIT, and committing IS Bash
      (git add / commit / push). Any window ending at a commit is Bash-enriched
      whether or not an error happened in it.

THE CONTROL THAT SETTLES BOTH: windows of the SAME SHAPE (60 min, ending at a commit)
in the SAME ERA, around commits that carry NO mistake trailer at all. If those look
like the erroring windows, the enrichment is an artefact of shape and period.
"""
import os, io, json, glob, subprocess, datetime, collections

BASE = r'C:\Users\kyleg\.claude\projects'
os.chdir(r'C:\DawnTraderV3-old')
REF = subprocess.run(['git', 'rev-parse', 'origin/migration/aws-supabase'],
                     capture_output=True, text=True).stdout.strip()

def parse(ts):
    try: return datetime.datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
    except Exception: return None

SEP = '\x1e'
raw = subprocess.run(['git', 'log', REF, '--no-merges', '--format=%H%x1f%cI%x1f%B' + SEP],
                     capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
import re
TR = re.compile(r'^MISTAKE:\s*([a-z0-9][a-z0-9-]*)', re.M)
wrong, other, plain = [], [], []
for ch in raw.split(SEP):
    ch = ch.strip('\n')
    if not ch: continue
    p = ch.split('\x1f')
    if len(p) < 3: continue
    t = parse(p[1])
    if not t: continue
    slugs = set(TR.findall(p[2]))
    slugs.discard('none')
    if 'wrong-object' in slugs: wrong.append(t)
    elif slugs:                 other.append(t)
    else:                       plain.append(t)

ERA = min(wrong) - datetime.timedelta(hours=1)
print('=== ERA GATE: earliest wrong-object commit minus 1h = %s ===' % ERA.isoformat()[:19])
print('  wrong-object commits          : %d (all in era by construction)' % len(wrong))
other = [t for t in other if t >= ERA]
plain = [t for t in plain if t >= ERA]
print('  other-slug commits IN ERA     : %d' % len(other))
print('  no-trailer commits IN ERA     : %d' % len(plain))

def wins(ts): return [(t - datetime.timedelta(minutes=60), t) for t in ts]
W = {'wrong-object': wins(wrong), 'other-slug': wins(other), 'NO-trailer': wins(plain)}

def hit(t, ws): return any(a <= t <= b for a, b in ws)

files = sorted(glob.glob(os.path.join(BASE, 'C--DawnTraderV3*', '*.jsonl')), key=os.path.getsize, reverse=True)[:6]
cnt = {k: collections.Counter() for k in W}
era_all = collections.Counter()
per_file_era = collections.defaultdict(collections.Counter)
for p in files:
    try:
        with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                if '"tool_use"' not in line: continue
                try: e = json.loads(line)
                except Exception: continue
                t = parse(e.get('timestamp'))
                if not t: continue
                c = (e.get('message') or {}).get('content')
                if not isinstance(c, list): continue
                for x in c:
                    if isinstance(x, dict) and x.get('type') == 'tool_use':
                        nm = x.get('name') or '?'
                        if t >= ERA:
                            era_all[nm] += 1
                            per_file_era[os.path.basename(p)[:8]][nm] += 1
                            for k, ws in W.items():
                                if hit(t, ws): cnt[k][nm] += 1
    except Exception:
        continue

def pct(c):
    tot = sum(c.values())
    return (100.0 * c.get('Bash', 0) / tot, tot) if tot else (0.0, 0)

print()
print('=== THE CONTROL: same era, same window shape, all ending at a commit ===')
print('  %-24s %8s %8s' % ('window population', 'n calls', 'Bash %'))
for k in ('wrong-object', 'other-slug', 'NO-trailer'):
    b, n = pct(cnt[k]); print('  %-24s %8d %7.1f%%' % (k, n, b))
b, n = pct(era_all); print('  %-24s %8d %7.1f%%' % ('ALL era activity', n, b))

bw = pct(cnt['wrong-object'])[0]; bp = pct(cnt['NO-trailer'])[0]
print()
print('  ENRICHMENT vs NO-trailer commits in the same era: %+.1f pp' % (bw - bp))
print()
print('=== CONFOUND (i): do the low-Bash files predate the era? ===')
for p in files:
    nm = os.path.basename(p)[:8]
    try:
        with io.open(p, 'rb') as f:
            first = json.loads(f.readline().decode('utf-8', 'replace')).get('timestamp')
            f.seek(max(0, os.path.getsize(p) - 262144))
            last = None
            for l in reversed(f.read().decode('utf-8', 'replace').strip().split('\n')):
                try:
                    last = json.loads(l).get('timestamp')
                    if last: break
                except Exception: continue
    except Exception:
        first = last = None
    eb, en = pct(per_file_era[nm])
    print('  %-10s %s .. %s   era calls=%-6d era Bash=%s' % (
        nm, (first or '?')[:10], (last or '?')[:10], en, ('%.1f%%' % eb) if en else 'n/a'))
