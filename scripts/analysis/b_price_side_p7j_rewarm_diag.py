# P-7j diagnostic on the captured REWARM/KALMAN lines: is the pre-registered FAIL the filter or the instrument?
# stdin = the capture evidence file. Reads every KALMAN line per symbol after its first REWARM, not just the first 12.
import sys, math, collections

restart = '2026-09-11 20:09:37'
rew = {}
seq = collections.defaultdict(list)


def f(body, key):
    for tok in body.split():
        if tok.startswith(key + '='):
            try:
                return float(tok[len(key) + 1:])
            except ValueError:
                return None
    return None


for line in sys.stdin:
    if line.startswith('#') or line[:19] < restart:
        continue
    if '[9.3][REWARM]' in line:
        b = line.split('[9.3][REWARM]', 1)[1].strip()
        s = b.split()[0]
        if s not in rew:
            rew[s] = line[:19]
    elif '[9.3][KALMAN]' in line:
        b = line.split('[9.3][KALMAN]', 1)[1].strip()
        s = b.split()[0]
        if s in rew:
            seq[s].append((line[:19], f(b, 'R'), f(b, 'Q'), f(b, 'K'), f(b, 'x')))


def kss(R, Q):
    P = (Q + math.sqrt(Q * Q + 4 * Q * R)) / 2
    return P / (P + R)


ratios = []
first_within = []
for s in sorted(seq):
    obs = seq[s]
    if len(obs) < 12:
        continue
    R12, Q12, K12 = obs[11][1], obs[11][2], obs[11][3]
    ratios.append((K12 / kss(R12, Q12), s))
    fw = next((i + 1 for i, o in enumerate(obs) if o[3] <= 1.1 * kss(o[1], o[2])), None)
    first_within.append(fw)
ratios.sort()
print('symbols with at least 12 KALMAN lines after REWARM:', len(ratios))
print('K at observation 12 / steady-state K: min', round(ratios[0][0], 3), ratios[0][1], '| median', round(ratios[len(ratios) // 2][0], 3), '| p90', round(ratios[int(len(ratios) * 0.9)][0], 3), '| max', round(ratios[-1][0], 3), ratios[-1][1])
fwv = sorted(x for x in first_within if x is not None)
print('first observation within x1.1, over every captured line: reached', len(fwv), '| never reached in capture', sum(1 for x in first_within if x is None),
      '| median', fwv[len(fwv) // 2] if fwv else None, '| min', fwv[0] if fwv else None, '| max', fwv[-1] if fwv else None)
lens = sorted(len(v) for v in seq.values())
print('KALMAN lines per symbol after REWARM: min', lens[0], 'median', lens[len(lens) // 2], 'max', lens[-1])
rep = sum(1 for v in seq.values() for a, b in zip(v, v[1:]) if a[3] == b[3] and a[4] == b[4])
print('consecutive lines with identical K and x (non-advancing prints):', rep, 'of', sum(max(len(v) - 1, 0) for v in seq.values()), 'consecutive pairs')
for s in [ratios[0][1], ratios[len(ratios) // 2][1], ratios[-1][1]]:
    print('---', s, 'REWARM at', rew[s])
    for i, o in enumerate(seq[s][:16]):
        print(i + 1, o[0][11:], 'R', o[1], 'Q', o[2], 'K', o[3], 'Kss', round(kss(o[1], o[2]), 4), 'x1.1', round(1.1 * kss(o[1], o[2]), 4), '1/n', round(1.0 / (i + 1), 4))

# Elapsed time and Q/R, added for the Step-7 record: minutes from observation 1 to the first observation within x1.1,
# the spacing between consecutive observations, and Q/R at observation 12 against test 12's fixture (R 26, Q 0.5).
import time as _t, calendar as _c


def _ts(s):
    return _c.timegm(_t.strptime(s, '%Y-%m-%d %H:%M:%S'))


mins, gaps, qr = [], [], []
for s, obs in seq.items():
    if len(obs) < 12:
        continue
    gaps += [_ts(b[0]) - _ts(a[0]) for a, b in zip(obs, obs[1:])]
    qr.append(obs[11][2] / obs[11][1])
    for o in obs:
        if o[3] <= 1.1 * kss(o[1], o[2]):
            mins.append((_ts(o[0]) - _ts(obs[0][0])) / 60.0)
            break
mins.sort()
gaps.sort()
qr.sort()
print('minutes from observation 1 to the first within x1.1: n', len(mins), 'min', round(mins[0], 1), 'median', round(mins[len(mins) // 2], 1), 'max', round(mins[-1], 1))
print('seconds between consecutive observations: n', len(gaps), 'p10', gaps[len(gaps) // 10], 'median', gaps[len(gaps) // 2], 'p90', gaps[int(len(gaps) * 0.9)])
print('Q/R at observation 12: n', len(qr), 'min', round(qr[0], 4), 'median', round(qr[len(qr) // 2], 4), 'max', round(qr[-1], 4), '| test 12 fixture Q/R', round(0.5 / 26, 4))
