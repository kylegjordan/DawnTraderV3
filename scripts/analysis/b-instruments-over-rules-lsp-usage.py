# -*- coding: utf-8 -*-
"""B-INSTRUMENTS-OVER-RULES, #1038 (d): the pre-registered usage measure.

Instrument (as pre-registered): main-chain `tool_use` blocks named `LSP` in each session's transcripts, with Grep and
Glob counted in the same scan as the control. Population: the four sessions' project folders. Window: from
2026-09-11T14:12Z (the tool first loaded) to the end argument; each session's own 14-day window starts at its first
restart after that time and therefore lies inside this span.
Also reported per session: the days on which it made any tool call (activity), first/last tool call, so "active
>= 5 days" is read from the same transcripts. Reach: transcripts are trimmed nightly — this counts what was retained.
Usage: b-instruments-over-rules-lsp-usage.py [<end-iso>]
"""
import json, os, sys, glob, collections
sys.stdout.reconfigure(encoding='utf-8')
P = r'C:\Users\kyleg\.claude\projects'
SESS = {'CC-A': 'C--DawnTraderV3-old', 'CC-B': 'C--DawnTraderV3-new', 'CC-C': 'C--DawnTraderV3-analyst', 'CC-INFRA': 'C--DawnTraderV3-infra'}
T0 = '2026-09-11T14:12'
T1 = sys.argv[1] if len(sys.argv) > 1 else '2026-10-02T23:59'
print(f"WINDOW {T0} .. {T1} UTC; main-chain only (subagent transcripts in subfolders are not read)")
for alias, d in SESS.items():
    c = collections.Counter(); days = set(); lsp_times = []; first = last = None; nfiles = 0
    for f in glob.glob(os.path.join(P, d, '*.jsonl')):
        nfiles += 1
        with open(f, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                if '"tool_use"' not in line: continue
                try: e = json.loads(line)
                except Exception: continue
                if e.get('type') != 'assistant' or e.get('isSidechain'): continue
                ts = (e.get('timestamp') or '')[:19]
                if not (T0 <= ts <= T1): continue
                for b in (e.get('message') or {}).get('content') or []:
                    if isinstance(b, dict) and b.get('type') == 'tool_use':
                        n = b.get('name')
                        c['ALL'] += 1
                        if n in ('LSP', 'Grep', 'Glob'): c[n] += 1
                        if n == 'LSP': lsp_times.append(ts)
                        days.add(ts[:10]); first = min(first or ts, ts); last = max(last or ts, ts)
    print(f"{alias}: files {nfiles} | tool calls {c['ALL']} | LSP {c['LSP']} | Grep {c['Grep']} | Glob {c['Glob']} | "
          f"active days {len(days)} | first {first} | last {last}")
    for t in lsp_times[:5]: print(f"   LSP at {t}")
