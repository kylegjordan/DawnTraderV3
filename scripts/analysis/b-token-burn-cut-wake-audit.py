# -*- coding: utf-8 -*-
"""B-TOKEN-BURN-CUT Step 7/8, OBJ-1(a): per session, over a window, classify every background-task notification.

A watcher completion counts as a WAKE when its output file holds a WAKE[ line; otherwise it is EMPTY; if its
output file cannot be opened it is UNREADABLE (counted, never folded into either). A Monitor notice (the retired
form) is counted separately. Everything else is OTHER, and its distinct summaries are listed, so nothing lands in
a silent sink (Langston Step 8 finding).

Usage: b-token-burn-cut-wake-audit.py <from-iso> <to-iso> [--all]
  default : each session's NEWEST transcript only (the Step-7 instrument)
  --all   : every transcript in the session's folder modified on or after <from-iso>
Each transcript is reported with its first and last entry timestamps, so the OBSERVED span is stated rather than
assumed (Langston Step 8 condition).
"""
import json, os, re, sys, glob
from datetime import datetime, timezone
sys.stdout.reconfigure(encoding='utf-8')
P = r'C:\Users\kyleg\.claude\projects'
SESS = {'CC-A': 'C--DawnTraderV3-old', 'CC-B': 'C--DawnTraderV3-new', 'CC-C': 'C--DawnTraderV3-analyst', 'CC-INFRA': 'C--DawnTraderV3-infra'}
args = [a for a in sys.argv[1:] if not a.startswith('--')]
T0, T1 = args[0], args[1]          # ISO window, UTC, e.g. 2026-10-01T00:00 2026-10-01T23:59
ALL = '--all' in sys.argv


def text_of(e):
    m = e.get('message') or {}
    c = m.get('content')
    if isinstance(c, str): return c
    if isinstance(c, list): return '\n'.join(x.get('text', '') if isinstance(x, dict) else str(x) for x in c)
    return ''


def files_for(d):
    fs = glob.glob(os.path.join(P, d, '*.jsonl'))
    if not fs: return []
    if not ALL: return [max(fs, key=os.path.getmtime)]
    t0 = datetime.fromisoformat(T0).replace(tzinfo=timezone.utc).timestamp()
    return sorted(f for f in fs if os.path.getmtime(f) >= t0)


for alias, d in SESS.items():
    for f in files_for(d):
        stats = {'watcher_wake': 0, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}
        empties, monitors, others, first_arm, first_ts, last_ts, notes = [], [], {}, None, None, None, 0
        with open(f, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                try: e = json.loads(line)
                except Exception: continue
                ts = (e.get('timestamp') or '')[:19]
                if ts:
                    first_ts = first_ts or ts
                    last_ts = ts
                if '<task-notification>' not in line and 'run_in_background' not in line: continue
                if not (T0 <= ts <= T1): continue
                t = text_of(e)
                if e.get('type') == 'assistant' and 'cc-wake-follow' in line and first_arm is None: first_arm = ts
                if e.get('type') != 'user' or '<task-notification>' not in t: continue
                for blk in re.findall(r'<task-notification>(.*?)</task-notification>', t, re.S):
                    notes += 1
                    sm = re.search(r'<summary>(.*?)</summary>', blk, re.S)
                    summ = sm.group(1) if sm else ''
                    outp = re.search(r'<output-file>(.*?)</output-file>', blk, re.S)
                    # Parenthesised (Langston Step 8): `and` binds tighter than `or`, so the unparenthesised form left
                    # the first disjunct unguarded and could divert a watcher completion whose summary said "Monitor".
                    if 'monitor' in summ.lower() and 'Background command' not in summ:
                        stats['monitor'] += 1; monitors.append(ts); continue
                    if 'wake watcher' in summ.lower() and 'Background command' in summ:
                        of = outp.group(1).strip() if outp else ''
                        try:
                            body = open(of, encoding='utf-8', errors='replace').read()
                            if 'WAKE[' in body: stats['watcher_wake'] += 1
                            else: stats['watcher_empty'] += 1; empties.append((ts, body.strip()[:120]))
                        except Exception:
                            stats['watcher_unreadable'] += 1
                    else:
                        stats['other_task'] += 1
                        k = re.sub(r'\s+', ' ', summ)[:70]
                        others[k] = others.get(k, 0) + 1
        print(f"{alias} {os.path.basename(f)}  entries {first_ts} .. {last_ts}  first arm in window: {first_arm}")
        print(f"   notifications in window: {notes}  ->  {stats}  (sum {sum(stats.values())})")
        for ts, b in empties[:8]: print(f"   EMPTY {ts}: {b!r}")
        for ts in monitors[:5]: print(f"   MONITOR {ts}")
        for k, n in sorted(others.items(), key=lambda x: -x[1])[:8]: print(f"   OTHER x{n}: {k}")
