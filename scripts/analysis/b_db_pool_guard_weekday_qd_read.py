#!/usr/bin/env python3
"""B-DB-POOL-GUARD Step 7 — the weekday qd-probe read (Langston, Step-8 leg 4, Discord 1568815695393853545).

"The weekday read must test the MAIN pool's wait_gt_* / max_wait_ms in the probe's minute, not the probe's own
duration." So: for each xstock_qd_probe_cron fire on DAY (a weekday, xStocks trading), take the main pool's
POOL_MINUTE_V2 line(s) whose 60-second window contains any part of the fire, and compare their wait fields with
every other main-pool minute of the same day (the baseline).

Run on staging as root, read-only:
  python3 b_db_pool_guard_weekday_qd_read.py 2026-11-13
Inputs: scheduled_tasks_audit (task_name='xstock_qd_probe_cron', fired_at on DAY) via psql with DATABASE_URL from
/home/deploy/dawntrader/.env; the main-pool lines from /var/log/dawntrader/error.log (or error__<DAY+1>*.log
when DAY is not today — the archive is named for the rotation instant, so it holds the PRECEDING day).
A minute line stamped T covers (T-60s, T]. A fire is [fired_at, fired_at + duration_ms] when meta carries a
duration, else [fired_at, fired_at + 60s] (stated in the output).
"""
import datetime as dt
import glob
import json
import os
import re
import subprocess
import sys

DAY = sys.argv[1] if len(sys.argv) > 1 else dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d')
ENV = '/home/deploy/dawntrader/.env'

def db_url():
    for line in open(ENV, encoding='utf-8'):
        if line.startswith('DATABASE_URL='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise SystemExit('REFUSED: no DATABASE_URL in ' + ENV)

sql = ("SELECT to_char(fired_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS'), status, coalesce(meta::text,'{}') "
       "FROM scheduled_tasks_audit WHERE task_name='xstock_qd_probe_cron' "
       f"AND fired_at >= '{DAY}T00:00:00Z' AND fired_at < ('{DAY}'::date + 1)::timestamptz ORDER BY fired_at")
out = subprocess.run(['psql', db_url(), '-X', '-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
                     capture_output=True, text=True)
if out.returncode != 0:
    raise SystemExit('REFUSED: psql failed: ' + out.stderr.strip())

def dur_ms(meta):
    for k in ('duration_ms', 'durationMs', 'elapsed_ms', 'elapsedMs', 'ms'):
        v = meta.get(k)
        if isinstance(v, (int, float)):
            return float(v), k
    return None, None

fires = []
for row in out.stdout.splitlines():
    ts, status, meta_s = row.split('\t')
    try:
        meta = json.loads(meta_s)
    except Exception:
        meta = {}
    start = dt.datetime.strptime(ts, '%Y-%m-%dT%H:%M:%S.%f')
    d, key = dur_ms(meta)
    end = start + dt.timedelta(milliseconds=d if d is not None else 60_000)
    fires.append((start, end, status, d, key))

today = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d')
if DAY == today:
    logs = ['/var/log/dawntrader/error.log']
else:
    nxt = (dt.datetime.strptime(DAY, '%Y-%m-%d') + dt.timedelta(days=1)).strftime('%Y-%m-%d')
    logs = sorted(glob.glob(f'/var/log/dawntrader/error__{nxt}*.log'))
if not logs:
    raise SystemExit(f'REFUSED: no error log found for {DAY}')

pat = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \+00:00: \[B-DB-POOL-GUARD\]\[POOL_MINUTE_V2\] pool=dawntrader_main (.*)$')
minutes = []
for p in logs:
    for line in open(p, encoding='utf-8', errors='replace'):
        m = pat.match(line)
        if not m or not m.group(1).startswith(DAY):
            continue
        t = dt.datetime.strptime(m.group(1), '%Y-%m-%d %H:%M:%S')
        f = dict(kv.split('=', 1) for kv in m.group(2).split() if '=' in kv)
        minutes.append((t, f))
if not minutes:
    raise SystemExit(f'REFUSED: 0 main-pool minute lines for {DAY} in {logs} — the instrument read nothing')

def in_probe(t):
    lo = t - dt.timedelta(seconds=60)
    return any(s < t and e > lo for s, e, *_ in fires)

def summarise(rows, label):
    n = len(rows)
    if n == 0:
        print(f'{label}: 0 minutes'); return
    def num(f, k):
        try: return float(f.get(k, 0))
        except ValueError: return 0.0
    w100 = sum(1 for _, f in rows if num(f, 'wait_gt_100ms') > 0)
    w1000 = sum(1 for _, f in rows if num(f, 'wait_gt_1000ms') > 0)
    w5000 = sum(1 for _, f in rows if num(f, 'wait_gt_5000ms') > 0)
    to = sum(1 for _, f in rows if num(f, 'acquire_timeouts') > 0)
    mw = sorted(num(f, 'max_wait_ms') for _, f in rows)
    p50 = mw[n // 2]; p95 = mw[min(n - 1, int(n * 0.95))]
    tot100 = sum(num(f, 'wait_gt_100ms') for _, f in rows)
    print(f'{label}: {n} minutes | minutes with any wait>100ms {w100} ({100*w100/n:.1f}%), >1s {w1000}, >5s {w5000}, '
          f'acquire_timeouts>0 {to} | wait>100ms events total {int(tot100)} ({tot100/n:.1f}/min) | '
          f'max_wait_ms p50 {p50:.0f} p95 {p95:.0f} max {mw[-1]:.0f}')

durs = [d for *_, d, _ in fires if d is not None]
keys = sorted({k for *_, k in fires if k})
print(f'DAY {DAY} ({dt.datetime.strptime(DAY, "%Y-%m-%d").strftime("%A")}), logs {logs}')
print(f'probe fires: {len(fires)} (status: ' + ', '.join(f'{s}={sum(1 for *_, st, _, _ in fires if st == s)}' for s in sorted({x[2] for x in fires})) + ')'
      + (f'; duration from meta key {keys}: min {min(durs):.0f} ms, max {max(durs):.0f} ms' if durs else '; NO duration in meta - each fire taken as 60 s'))
probe = [r for r in minutes if in_probe(r[0])]
rest = [r for r in minutes if not in_probe(r[0])]
print(f'main-pool minute lines on {DAY}: {len(minutes)} (first {minutes[0][0]}, last {minutes[-1][0]})')
summarise(probe, 'PROBE minutes   ')
summarise(rest, 'BASELINE minutes')
worst = sorted(probe, key=lambda r: -float(r[1].get('max_wait_ms', 0) or 0))[:5]
for t, f in worst:
    print(f'  probe minute {t}: max_wait_ms={f.get("max_wait_ms")} site={f.get("max_wait_site")} wait_gt_1000ms={f.get("wait_gt_1000ms")} waiting={f.get("waiting")}')
