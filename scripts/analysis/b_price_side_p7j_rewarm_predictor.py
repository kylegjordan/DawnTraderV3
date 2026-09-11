# B-PRICE-SIDE-BY-JOB r5 OBJ-7 P-7j — the model predictor behind the next-restart pre-registration, committed so every number
# it produces is second-party checkable. Langston 2026-09-11 21:17Z: the earlier "within one observation on 72 of 72" was an
# uncommitted ad-hoc number and did not reproduce (he measured 64 of 72).
# stdin: a capture evidence file of [9.3][REWARM] and [9.3][KALMAN] lines. argv[1]: the restart instant 'YYYY-MM-DD HH:MM:SS' UTC.
# Population: a REWARM line within 600 s of the restart and at least 12 KALMAN lines after it.
import sys, math, time, calendar, collections

RESTART = sys.argv[1] if len(sys.argv) > 1 else '2026-09-11 20:09:37'
G = 0.9  # REWARM_FIRST_LIVE_GAIN
r_epoch = calendar.timegm(time.strptime(RESTART, '%Y-%m-%d %H:%M:%S'))


def ts(s):
    return calendar.timegm(time.strptime(s, '%Y-%m-%d %H:%M:%S'))


def field(body, key):
    for tok in body.split():
        if tok.startswith(key + '='):
            try:
                return float(tok[len(key) + 1:])
            except ValueError:
                return None
    return None


rew = {}
seq = collections.defaultdict(list)
for line in sys.stdin:
    if line.startswith('#') or line[:19] < RESTART:
        continue
    if '[9.3][REWARM]' in line:
        s = line.split('[9.3][REWARM]', 1)[1].split()[0]
        if s not in rew:
            rew[s] = ts(line[:19])
    elif '[9.3][KALMAN]' in line:
        b = line.split('[9.3][KALMAN]', 1)[1].strip()
        s = b.split()[0]
        if s in rew:
            seq[s].append((line[:19], field(b, 'R'), field(b, 'Q'), field(b, 'K')))


def kss(R, Q):
    P = (Q + math.sqrt(Q * Q + 4 * Q * R)) / 2
    return P / (P + R)


def model_gains(R, Q, n):
    """Gains from K1 = G with R and Q held constant."""
    P = R * G / (1 - G)
    out = []
    for _ in range(n):
        K = P / (P + R)
        out.append(K)
        P = (1 - K) * P + Q
    return out


def nhat(R, Q):
    ks = kss(R, Q)
    for i, K in enumerate(model_gains(R, Q, 1000)):
        if K <= 1.1 * ks:
            return i + 1
    return None


def replay_own(obs):
    """Gains replayed with each line's own logged R and Q, from the lazy inflation (K1 = G)."""
    out = []
    P = None
    for i, (_, R, Q, _) in enumerate(obs):
        if i == 0:
            P = R * G / (1 - G)
        K = P / (P + R)
        out.append(K)
        P = (1 - K) * P + Q
    return out


def q(v, p):
    return v[min(len(v) - 1, int(p * len(v)))]


pop = sorted(s for s in seq if rew[s] <= r_epoch + 600 and len(seq[s]) >= 12)
print('POPULATION: REWARM within 600 s of %s, at least 12 KALMAN lines: %d symbols' % (RESTART, len(pop)))

# 1. Filter fidelity: the logged gains against a replay from each line's own R and Q.
errs = [abs(k_log - k_rep) for s in pop for (_, _, _, k_log), k_rep in zip(seq[s], replay_own(seq[s]))]
print('1. FIDELITY: |logged K - replay with own R,Q| over %d lines: max %.6f; lines above 5e-4: %d' % (len(errs), max(errs), sum(1 for e in errs if e > 5e-4)))

# 2. The index predictor, under two definitions of "the observed first observation within x1.1".
for label, thr in (('OWN (each line\'s own R,Q)', lambda o, R12, Q12: 1.1 * kss(o[1], o[2])),
                   ('FIX12 (observation 12\'s R,Q)', lambda o, R12, Q12: 1.1 * kss(R12, Q12))):
    within, misses, censored = 0, [], 0
    for s in pop:
        obs = seq[s]
        R12, Q12 = obs[11][1], obs[11][2]
        n = nhat(R12, Q12)
        hit = next((i + 1 for i, o in enumerate(obs) if o[3] <= thr(o, R12, Q12)), None)
        if hit is None:
            censored += 1
        elif abs(hit - n) <= 1:
            within += 1
        else:
            misses.append('%s %d vs %d' % (s, hit, n))
    reached = within + len(misses)
    print('2. INDEX PREDICTOR, %s: reached %d, within +-1 %d, missed %d, censored %d; misses: %s' % (label, reached, within, len(misses), censored, '; '.join(misses) if misses else 'none'))

# 3. The r2 criterion replayed as registered: scope R and Q within 10%% of observation 12 over 1..max(12, nhat+1); +-1 tolerance.
for label, own in (('OWN', True), ('FIX12', False)):
    insc = met = missed = cens = excl = 0
    for s in pop:
        obs = seq[s]
        R12, Q12 = obs[11][1], obs[11][2]
        n = nhat(R12, Q12)
        span = obs[:max(12, n + 1)]
        if not all(abs(o[1] - R12) <= 0.10 * R12 and abs(o[2] - Q12) <= 0.10 * Q12 for o in span):
            excl += 1
            continue
        insc += 1
        hit = next((i + 1 for i, o in enumerate(obs) if o[3] <= (1.1 * kss(o[1], o[2]) if own else 1.1 * kss(R12, Q12))), None)
        if hit is None:
            cens += 1
        elif abs(hit - n) <= 1:
            met += 1
        else:
            missed += 1
    print('3. r2 REPLAY, %s: in scope %d (excluded %d): met %d, missed %d, censored %d => %.1f%% met' % (label, insc, excl, met, missed, cens, 100.0 * met / insc if insc else 0))

# 4. The quantity, not the index: observed K at observation nhat against the model gain there (obs-12 R,Q constant).
rel_at_n, short = [], 0
rel_at_12 = []
for s in pop:
    obs = seq[s]
    R12, Q12 = obs[11][1], obs[11][2]
    n = nhat(R12, Q12)
    mg = model_gains(R12, Q12, max(n, 12))
    rel_at_12.append(abs(obs[11][3] - mg[11]) / mg[11])
    if len(obs) < n:
        short += 1
        continue
    rel_at_n.append(abs(obs[n - 1][3] - mg[n - 1]) / mg[n - 1])
for label, v in (('at observation nhat', rel_at_n), ('at observation 12', rel_at_12)):
    v = sorted(v)
    bands = ', '.join('%d%%: %d' % (b, sum(1 for x in v if x <= b / 100.0)) for b in (2, 3, 5, 10))
    print('4. QUANTITY %s: n %d; relative |K_obs - K_model| min %.4f median %.4f p90 %.4f p95 %.4f max %.4f; within %s' % (label, len(v), v[0], v[len(v) // 2], q(v, 0.9), q(v, 0.95), v[-1], bands))
print('   symbols whose capture ends before observation nhat: %d' % short)


def replay_own_k1(obs, k1_of):
    """As replay_own, with the first live gain supplied by k1_of(R, Q) instead of G: the broken-re-warm controls."""
    out = []
    P = None
    for i, (_, R, Q, _) in enumerate(obs):
        if i == 0:
            k1 = k1_of(R, Q)
            P = R * k1 / (1 - k1)
        K = P / (P + R)
        out.append(K)
        P = (1 - K) * P + Q
    return out


# 5. r3 candidate, the quantity along the path: every logged K over observations 1-12 within 5e-4 (print rounding) of the
#    replay from K1 = G with each line's own logged R and Q. No R/Q-stability exclusion is needed and nothing is censored,
#    because the population rule already requires 12 lines.
met = 0
worst = []
for s in pop:
    obs = seq[s][:12]
    m = max(abs(o[3] - r) for o, r in zip(obs, replay_own(obs)))
    worst.append(m)
    if m <= 5e-4:
        met += 1
worst.sort()
print('5. r3 CANDIDATE, path fidelity over observations 1-12: met %d of %d (%.1f%%); per-symbol worst error median %.6f max %.6f' % (met, len(pop), 100.0 * met / len(pop), worst[len(worst) // 2], worst[-1]))

# 6. Discrimination: the same check against broken re-warms. A useful check fails every one of them on every symbol.
for label, k1_of in (('A no inflation, K1 = steady-state gain', lambda R, Q: kss(R, Q)),
                     ('B half the constant, K1 = 0.5', lambda R, Q: 0.5),
                     ('C a small change, K1 = 0.85', lambda R, Q: 0.85)):
    seps = []
    for s in pop:
        obs = seq[s][:12]
        seps.append(max(abs(o[3] - r) for o, r in zip(obs, replay_own_k1(obs, k1_of))))
    seps.sort()
    print('6. CONTROL %s: per-symbol worst separation from the log over obs 1-12: min %.4f median %.4f; symbols that would still pass 5e-4: %d of %d' % (label, seps[0], seps[len(seps) // 2], sum(1 for x in seps if x <= 5e-4), len(seps)))
