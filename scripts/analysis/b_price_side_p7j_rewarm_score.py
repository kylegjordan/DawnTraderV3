# B-PRICE-SIDE-BY-JOB r5 OBJ-7 — Step-8 capture for the P-7j re-warm, scored against the pre-registration committed at
# b597f1bf2 (change list, "STEP 8 PRE-REGISTRATION"). Reads grep output of [9.3][REWARM] and [9.3][KALMAN] lines on stdin.
# argv[1] = the restart instant, 'YYYY-MM-DD HH:MM:SS' (UTC), from the deploy record's deployed_at.
#
# Pre-registered, quoted in substance:
#   comparator  = the INSTANTANEOUS-parameter steady state from the R and Q on the 12th KALMAN line after the symbol's REWARM
#                 line: P = (Q + sqrt(Q^2 + 4QR)) / 2, K = P / (P + R)
#   tolerance   = K at observation 12 within x1.1 of the comparator
#   scope       = symbols whose R and Q each stayed within 10% of their observation-12 values across observations 1-12;
#                 the rest EXCLUDED AND COUNTED
#   population  = symbols with a REWARM line in the first 10 minutes after the restart; n-floor 20 in scope
#   PASS        = at least 80% of in-scope symbols meet the tolerance; FAIL below 80%; below the floor a count, no verdict
#   also        = K = 0.9 at observation 1 for every re-warmed symbol; median gapFrac at most 0.01
import sys, math, time, calendar, collections

restart = calendar.timegm(time.strptime(sys.argv[1], '%Y-%m-%d %H:%M:%S'))
window_end = restart + 600


def stamp(line):
    try:
        return calendar.timegm(time.strptime(line[:19], '%Y-%m-%d %H:%M:%S'))
    except ValueError:
        return None


def field(text, key):
    # exact token match: a substring split would read ER= as R= on the KALMAN line
    for tok in text.split():
        if tok.startswith(key + '='):
            try:
                return float(tok[len(key) + 1:])
            except ValueError:
                return None
    return None


rewarm = {}
kalman = collections.defaultdict(list)
for line in sys.stdin:
    t = stamp(line)
    if t is None or t < restart:
        continue
    if '[9.3][REWARM]' in line:
        body = line.split('[9.3][REWARM]', 1)[1].strip()
        sym = body.split()[0]
        if sym not in rewarm:
            rewarm[sym] = {'t': t, 'gap': field(body, 'gapFrac'), 'closes': body.split('from ', 1)[1].split()[0] if 'from ' in body else '?'}
    elif '[9.3][KALMAN]' in line:
        body = line.split('[9.3][KALMAN]', 1)[1].strip()
        sym = body.split()[0]
        if sym in rewarm and len(kalman[sym]) < 12:
            kalman[sym].append({'R': field(body, 'R'), 'Q': field(body, 'Q'), 'K': field(body, 'K')})

population = sorted(s for s, v in rewarm.items() if v['t'] <= window_end)
print('restart', sys.argv[1], 'UTC | REWARM symbols in the first 10 minutes (the population):', len(population), '| REWARM symbols overall:', len(rewarm))

gaps = sorted(rewarm[s]['gap'] for s in population if rewarm[s]['gap'] is not None)
if gaps:
    print('gapFrac over the population: n', len(gaps), '| median', round(gaps[len(gaps) // 2], 6), '| max', round(gaps[-1], 6), '| median <= 0.01:', gaps[len(gaps) // 2] <= 0.01)

k1_bad = [s for s in population if kalman[s] and kalman[s][0]['K'] is not None and abs(kalman[s][0]['K'] - 0.9) > 0.0005]
print('K at observation 1 not 0.9 (printed to 4 dp):', len(k1_bad), k1_bad[:10])

in_scope, excluded, short, meets = [], [], [], []
for s in population:
    obs = kalman[s]
    if len(obs) < 12 or any(o['R'] is None or o['Q'] is None or o['K'] is None for o in obs):
        short.append(s)
        continue
    R12, Q12, K12 = obs[11]['R'], obs[11]['Q'], obs[11]['K']
    stable = all(abs(o['R'] - R12) <= 0.10 * R12 and abs(o['Q'] - Q12) <= 0.10 * Q12 for o in obs)
    if not stable:
        excluded.append(s)
        continue
    P = (Q12 + math.sqrt(Q12 * Q12 + 4 * Q12 * R12)) / 2
    K_steady = P / (P + R12)
    in_scope.append(s)
    if K12 <= K_steady * 1.1:
        meets.append(s)

print('fewer than 12 KALMAN lines yet (not scored):', len(short))
print('EXCLUDED AND COUNTED (R or Q moved more than 10% across observations 1-12):', len(excluded))
print('in scope:', len(in_scope), '| meet x1.1 at observation 12:', len(meets))
if len(in_scope) < 20:
    print('VERDICT: below the n-floor of 20 in scope -> a count, no verdict')
else:
    share = len(meets) / len(in_scope)
    print('VERDICT:', 'PASS' if share >= 0.80 else 'FAIL', '| share meeting the tolerance', round(100 * share, 1), '%')
