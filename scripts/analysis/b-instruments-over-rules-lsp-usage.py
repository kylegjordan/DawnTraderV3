# -*- coding: utf-8 -*-
"""B-INSTRUMENTS-OVER-RULES, #1038 (d): the pre-registered usage measure.

Instrument (as pre-registered): `tool_use` blocks named `LSP` in each session's transcripts, with Grep and Glob
counted in the same scan as the control. Population: the four sessions' project folders. Span: 2026-09-11T14:12Z
(the tool first loaded) to the end argument.

  default        : main-chain only (top-level transcripts, `isSidechain` entries skipped) — clause (d)'s wording
  --with-subagents: also every `subagents/*.jsonl` under each session, sidechain entries included — the reach of
                    the scan #1038 used for its baseline (Langston Step-2 condition 2)

Per-window predicate (Langston condition 1): a session's window is the 14 days after its first restart past
2026-09-11T14:12Z. A restart on the same Claude Code version is invisible to a transcript, so the start is only
BOUNDED: no earlier than 2026-09-11T14:12Z and no later than the first entry of the next version. For every
admissible start (hourly steps across that bound) the script counts the session's active days inside
[start, start + 14 d) and its LSP calls there, and prints the WORST case (fewest active days) and the most calls.
Reach: transcripts are trimmed nightly — this counts what was retained.
Usage: b-instruments-over-rules-lsp-usage.py <end-iso> [--with-subagents]
"""
import json, os, sys, glob
from datetime import datetime, timedelta
sys.stdout.reconfigure(encoding='utf-8')
P = r'C:\Users\kyleg\.claude\projects'
SESS = {'CC-A': 'C--DawnTraderV3-old', 'CC-B': 'C--DawnTraderV3-new', 'CC-C': 'C--DawnTraderV3-analyst', 'CC-INFRA': 'C--DawnTraderV3-infra'}
args = [a for a in sys.argv[1:] if not a.startswith('--')]
T0 = '2026-09-11T14:12'
T1 = args[0] if args else '2026-10-02T23:59'
SUB = '--with-subagents' in sys.argv
print(f"WINDOW {T0} .. {T1} UTC; {'main chain + every subagents/*.jsonl, sidechain included' if SUB else 'main chain only (sidechain entries and subagents/ folders not read)'}")


def iso(s): return datetime.fromisoformat(s[:16])


for alias, d in SESS.items():
    files = glob.glob(os.path.join(P, d, '*.jsonl'))
    if SUB: files += glob.glob(os.path.join(P, d, '*', 'subagents', '*.jsonl'))
    calls, lsp, days_ts, versions = {'ALL': 0, 'LSP': 0, 'Grep': 0, 'Glob': 0}, [], [], {}
    for f in files:
        with open(f, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                try: e = json.loads(line)
                except Exception: continue
                ts = (e.get('timestamp') or '')[:19]
                if not (T0 <= ts <= T1): continue
                v = e.get('version')
                if v and (v not in versions or ts < versions[v]): versions[v] = ts
                if e.get('type') != 'assistant' or (e.get('isSidechain') and not SUB): continue
                m = e.get('message') or {}
                cont = m.get('content') if isinstance(m.get('content'), list) else []
                for b in cont:
                    if isinstance(b, dict) and b.get('type') == 'tool_use':
                        n = b.get('name'); calls['ALL'] += 1; days_ts.append(ts)
                        if n in calls: calls[n] += 1
                        if n == 'LSP': lsp.append((ts, (b.get('input') or {}).get('operation'), os.path.basename((b.get('input') or {}).get('filePath') or '')))
    # the latest admissible window start = first entry of the second version seen after T0 (a proven restart)
    vs = sorted(versions.items(), key=lambda x: x[1])
    latest = iso(vs[1][1]) if len(vs) > 1 else iso(T0)
    worst_days, most_calls, s = None, 0, iso(T0)
    while s <= latest:
        e_ = s + timedelta(days=14)
        days = {t[:10] for t in days_ts if s <= iso(t) < e_}
        n_l = sum(1 for t, _, _ in lsp if s <= iso(t) < e_)
        worst_days = len(days) if worst_days is None else min(worst_days, len(days))
        most_calls = max(most_calls, n_l)
        s += timedelta(hours=1)
    print(f"{alias}: files {len(files)} | tool calls {calls['ALL']} | LSP {calls['LSP']} | Grep {calls['Grep']} | Glob {calls['Glob']}"
          f" | window start bounded {T0} .. {latest:%Y-%m-%dT%H:%M} | WORST-CASE in-window active days {worst_days} | MOST in-window LSP calls {most_calls}")
    for t, op, fp in lsp: print(f"   LSP at {t}  {op}  {fp}")
