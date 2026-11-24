# B-PRICE-SIDE-BY-JOB r5 P-7h — which symbols reach the shared REST limiter's check() path, by asset class.
# Langston's 19:30Z option 1 (2026-09-11). Reads grep output on stdin; argv[1] = a file of xStock symbols.
# Controls: the gate's symbols must all be in the DB xStock set; crypto symbols must appear at the limiter.
# Result 2026-09-11 19:35Z: limiter x gate = 0; limiter x the 147 xStock trade symbols = 1 (DASH/USD, the #1024 collision).
import sys, collections
lim = collections.Counter()
verbs = collections.Counter()
gate = collections.Counter()
first = {}
last = {}
for line in sys.stdin:
    if '[8.8.5][RestRateLimiter]' in line:
        rest = line.split('[8.8.5][RestRateLimiter]', 1)[1].strip()
        parts = rest.split(' ', 1)
        if parts[0] not in ('ALLOWED', 'BLOCKED') or len(parts) < 2:
            continue
        sym = parts[1].split(':', 1)[0].strip()
        lim[sym] += 1
        verbs[parts[0]] += 1
        key = 'limiter'
    elif '[P19-B8.9][XSTOCK_REST_GATE]' in line and 'symbol=' in line:
        sym = line.split('symbol=', 1)[1].split(' ', 1)[0].strip()
        gate[sym] += 1
        key = 'gate'
    else:
        continue
    t = line[:19]
    if key not in first or t < first[key]:
        first[key] = t
    if key not in last or t > last[key]:
        last[key] = t
db = set(x.strip() for x in open(sys.argv[1], encoding='utf-8') if x.strip())
print('LIMITER check() lines', sum(lim.values()), dict(verbs), 'distinct symbols', len(lim), 'reach', first.get('limiter'), 'to', last.get('limiter'))
print('XSTOCK GATE lines', sum(gate.values()), 'distinct symbols', len(gate), 'reach', first.get('gate'), 'to', last.get('gate'))
print('DB xStock symbol set (closed + open trades):', len(db), 'sample', sorted(db)[:8])
print('CONTROL: DB xStock symbols seen at the gate:', len(db & set(gate)))
a = sorted(set(lim) & set(gate))
b = sorted(set(lim) & db)
print('INTERSECTION limiter x gate set:', len(a), a[:20])
print('INTERSECTION limiter x DB xStock set:', len(b), b[:20])
print('limiter symbols by count, top 20:', lim.most_common(20))
