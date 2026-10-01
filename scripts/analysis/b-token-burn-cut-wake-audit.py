# -*- coding: utf-8 -*-
"""B-TOKEN-BURN-CUT Step 7, OBJ-1(a): per session, over a window, classify every background-task notification.
A watcher completion counts as a WAKE when its output file holds a WAKE[ line; otherwise it is an empty wake.
Monitor notices are counted separately (the retired form). Output: counts plus the list of empty ones."""
import json, os, re, sys, glob
sys.stdout.reconfigure(encoding='utf-8')
P = r'C:\Users\kyleg\.claude\projects'
SESS = {'CC-A': 'C--DawnTraderV3-old', 'CC-B': 'C--DawnTraderV3-new', 'CC-C': 'C--DawnTraderV3-analyst', 'CC-INFRA': 'C--DawnTraderV3-infra'}
T0, T1 = sys.argv[1], sys.argv[2]          # ISO window, UTC, e.g. 2026-10-01T00:00 2026-10-01T20:30
def text_of(e):
    m = e.get('message') or {}
    c = m.get('content')
    if isinstance(c, str): return c
    if isinstance(c, list): return '\n'.join(x.get('text', '') if isinstance(x, dict) else str(x) for x in c)
    return ''
for alias, d in SESS.items():
    f = max(glob.glob(os.path.join(P, d, '*.jsonl')), key=os.path.getmtime)
    stats = {'watcher_wake': 0, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}
    empties, monitors, first_arm = [], [], None
    with open(f, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            if '<task-notification>' not in line and 'run_in_background' not in line: continue
            try: e = json.loads(line)
            except Exception: continue
            ts = (e.get('timestamp') or '')[:19]
            if not (T0 <= ts <= T1): continue
            t = text_of(e)
            if e.get('type') == 'assistant' and 'cc-wake-follow' in line and first_arm is None: first_arm = ts
            if e.get('type') != 'user' or '<task-notification>' not in t: continue
            for blk in re.findall(r'<task-notification>(.*?)</task-notification>', t, re.S):
                summ = (re.search(r'<summary>(.*?)</summary>', blk, re.S) or [None, ''])[1] if re.search(r'<summary>(.*?)</summary>', blk, re.S) else ''
                outp = re.search(r'<output-file>(.*?)</output-file>', blk, re.S)
                if 'Monitor' in summ or 'monitor' in summ.lower() and 'watcher' in summ.lower() and 'Background command' not in summ:
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
    print(f"{alias} ({os.path.basename(f)[:8]}): {stats}  first new-form arm in window: {first_arm}")
    for ts, b in empties[:8]: print(f"   EMPTY {ts}: {b!r}")
    for ts in monitors[:5]: print(f"   MONITOR {ts}")
