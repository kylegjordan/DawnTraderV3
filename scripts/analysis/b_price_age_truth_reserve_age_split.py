# B-PRICE-AGE-TRUTH (#951) — re-serve ages by symbol, against kraken_ws cache writes, on the exercised adapter path.
# Reads grep output of [8.8.5][REST_BLOCKED] and [I7-WS-D][CACHE_WRITE] lines on stdin.
# Result 2026-09-11 (13:11Z-19:42Z): 10,664 re-serves; 5 REST-only symbols 0.0% under 1 s, median 29.8 s; all sub-second rows on WS-fed symbols.
import sys, time, calendar, collections
ages = collections.defaultdict(list)
ws_writes = collections.Counter()
for line in sys.stdin:
    if '[I7-WS-D][CACHE_WRITE]' in line and 'source=kraken_ws' in line and 'symbol=' in line:
        ws_writes[line.split('symbol=', 1)[1].split()[0]] += 1
        continue
    if '[8.8.5][REST_BLOCKED]' not in line or 'observedAt=' not in line:
        continue
    try:
        ts_ms = calendar.timegm(time.strptime(line[:19], '%Y-%m-%d %H:%M:%S')) * 1000
        obs = float(line.split('observedAt=', 1)[1].split()[0])
    except ValueError:
        continue
    sym = line.split('[8.8.5][REST_BLOCKED]', 1)[1].strip().split(':', 1)[0]
    ages[sym].append((ts_ms - obs) / 1000.0)
print('symbol | re-serves | share under 1 s | median age s | max age s | kraken_ws cache writes in the same files')
for sym, a in sorted(ages.items(), key=lambda kv: -len(kv[1])):
    a.sort()
    under = sum(1 for x in a if x < 1.0)
    print(sym, '|', len(a), '|', str(round(100.0 * under / len(a), 1)) + '%', '|', round(a[len(a) // 2], 1), '|', round(a[-1], 1), '|', ws_writes.get(sym, 0))
