# -*- coding: utf-8 -*-
"""OBJ-6b, INSTRUMENT 2: the tool distribution, from the transcripts themselves.

TWO measurements, because one of them alone would not discriminate:

  (A) BASELINE - the tool mix across ALL sampled transcript activity.
  (B) ERRORING WINDOWS - the tool mix in the hour before each wrong-object commit.

If (B) looks like (A), then "wrong-object instances are mostly Bash" is TRUE AND NEARLY
VACUOUS: everything is mostly Bash, so the matcher is aimed at the right tool for a
trivial reason and the interesting question is a different one. That distinction is the
gate's real content, and only the comparison can show it.

Streams line by line. Never loads a transcript into anything that reaches my context.
"""
import os, io, json, glob, datetime, collections, random

BASE = r'C:\Users\kyleg\.claude\projects'
SP = r'C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-old\66dbb030-b3cb-4448-8086-39344c645007\scratchpad'
random.seed(20260831)

cov = json.load(io.open(os.path.join(SP, 'obj6b_cover.json'), encoding='utf-8'))
import subprocess
os.chdir(r'C:\DawnTraderV3-old')
pop = json.load(io.open(os.path.join(SP, 'obj6b_population.json'), encoding='utf-8'))
shas = sorted({r['sha'] for r in pop['commits']})
out = subprocess.run(['git', 'show', '-s', '--format=%H %cI'] + shas,
                     capture_output=True, text=True, encoding='utf-8', errors='replace').stdout

def parse(ts):
    try: return datetime.datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
    except Exception: return None

windows = []
for line in out.split('\n'):
    p = line.strip().split()
    if len(p) == 2:
        t = parse(p[1])
        if t: windows.append((t - datetime.timedelta(minutes=60), t))

def in_window(t):
    return any(a <= t <= b for a, b in windows)

files = glob.glob(os.path.join(BASE, 'C--DawnTraderV3*', '*.jsonl'))
# Cap the read: the biggest files carry the bulk of activity, and reading all 2.65 GB
# buys nothing the distribution does not already show. STATED as a sampling decision.
files = sorted(files, key=os.path.getsize, reverse=True)[:6]

base_tools = collections.Counter()
win_tools = collections.Counter()
lines_read = 0
for p in files:
    try:
        with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                lines_read += 1
                if '"tool_use"' not in line:
                    continue
                try: e = json.loads(line)
                except Exception: continue
                t = parse(e.get('timestamp'))
                msg = e.get('message') or {}
                content = msg.get('content')
                if not isinstance(content, list): continue
                for c in content:
                    if isinstance(c, dict) and c.get('type') == 'tool_use':
                        name = c.get('name') or '?'
                        base_tools[name] += 1
                        if t and in_window(t):
                            win_tools[name] += 1
    except Exception:
        continue

def show(title, ctr):
    tot = sum(ctr.values())
    print('  %s  (n=%d)' % (title, tot))
    if not tot:
        print('    (empty)'); return
    for name, n in ctr.most_common(9):
        print('    %-34s %6d  %5.1f%%' % (name, n, 100.0 * n / tot))
    return tot

print('=== OBJ-6b INSTRUMENT 2 - tool distribution from transcripts ===')
print('  files read: %d of %d (largest first - STATED sampling decision, not a full census)'
      % (len(files), len(glob.glob(os.path.join(BASE, 'C--DawnTraderV3*', '*.jsonl')))))
print('  lines streamed: %d' % lines_read)
print('  erroring windows defined: %d (commit time minus 60 min)' % len(windows))
print()
tb = show('(A) BASELINE - all sampled tool calls', base_tools)
print()
tw = show('(B) ERRORING WINDOWS - the hour before a wrong-object commit', win_tools)

if tb and tw:
    bb = 100.0 * base_tools.get('Bash', 0) / tb
    bw = 100.0 * win_tools.get('Bash', 0) / tw
    print()
    print('=== THE GATE, READ HONESTLY ===')
    print('  Bash share, baseline        : %5.1f%%' % bb)
    print('  Bash share, erroring windows: %5.1f%%' % bw)
    print('  difference                  : %+5.1f pp' % (bw - bb))
    print()
    if abs(bw - bb) < 8:
        print('  ⇒ THE ERRORING WINDOWS LOOK LIKE EVERYTHING ELSE. "wrong-object is mostly Bash"')
        print('    is TRUE AND NEARLY VACUOUS - Bash dominates ALL activity, so the matcher is')
        print('    aimed at the right tool for a trivial reason. The population test PASSES but')
        print('    it is NOT evidence that a Bash-scoped hook catches the class.')
    else:
        print('  ⇒ The erroring windows DIFFER from baseline. That difference is the finding.')
