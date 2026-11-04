# B-PRICE-AGE-TRUTH (#951) — re-serve ages by symbol, against kraken_ws cache writes, on the exercised adapter path.
# Reads grep output of [8.8.5][REST_BLOCKED] and [I7-WS-D][CACHE_WRITE] lines on stdin.
# argv (optional): START END, UTC 'YYYY-MM-DD HH:MM:SS'; lines outside [START, END) are skipped.
# Result 2026-09-11 (13:11Z-19:42Z): 10,664 re-serves; 5 REST-only symbols 0.0% under 1 s, median 29.8 s; all sub-second rows on WS-fed symbols.
# Langston 2026-09-11 20:17Z, conditions 1-2: (1) the parse census, matched / carrying a stamp field / parsed / dropped by reason,
# never swallowed; (2) the discriminating measure, distinct observedAt values against re-serves per symbol: a re-stamp gives
# distinct == re-serves, an honest carry gives distinct near the number of successful upstream fetches.
import sys, time, calendar, collections
start = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
end = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
ages = collections.defaultdict(list)
stamps = collections.defaultdict(set)
ws_writes = collections.Counter()
census = collections.Counter()
for line in sys.stdin:
    head = line[:19]
    if start and head < start:
        continue
    if end and head >= end:
        continue
    if '[I7-WS-D][CACHE_WRITE]' in line and 'source=kraken_ws' in line and 'symbol=' in line:
        ws_writes[line.split('symbol=', 1)[1].split()[0]] += 1
        continue
    if '[8.8.5][REST_BLOCKED]' not in line:
        continue
    census['matched'] += 1
    if 'observedAt=' not in line:
        census['dropped_no_stamp_field'] += 1
        continue
    census['carrying_stamp_field'] += 1
    raw = line.split('observedAt=', 1)[1].split()[0]
    if raw == 'none':
        census['dropped_stamp_none'] += 1
        continue
    try:
        ts_ms = calendar.timegm(time.strptime(head, '%Y-%m-%d %H:%M:%S')) * 1000
        obs = float(raw)
    except ValueError:
        census['dropped_unparseable'] += 1
        continue
    census['parsed'] += 1
    sym = line.split('[8.8.5][REST_BLOCKED]', 1)[1].strip().split(':', 1)[0]
    ages[sym].append((ts_ms - obs) / 1000.0)
    stamps[sym].add(raw)
print('window', start or '(file start)', 'to', end or '(file end)')
print('parse census:', dict(census))
print('symbol | re-serves | distinct observedAt | share under 1 s | median age s | max age s | kraken_ws cache writes in the same window')
for sym, a in sorted(ages.items(), key=lambda kv: -len(kv[1])):
    a.sort()
    under = sum(1 for x in a if x < 1.0)
    print(sym, '|', len(a), '|', len(stamps[sym]), '|', str(round(100.0 * under / len(a), 1)) + '%', '|', round(a[len(a) // 2], 1), '|', round(a[-1], 1), '|', ws_writes.get(sym, 0))
