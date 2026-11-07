/**
 * #1250 P8 — FENCE 1 (counterfactual invariance) and FENCE 2 (membership), pre-audit §7.1 / §8.1 / §8.3.
 *
 * For every strategy in the xStock membership, per branch: the test PINS the source line that builds the entry, the stop
 * and the target (so what is evaluated IS what runs), evaluates those expressions twice with only the decision price
 * moved, and classifies how each level responded — anchor (did not move), distance (moved 1:1 with entry), proportional
 * (scaled with entry), r_multiple (moved with the risk). It then checks that classification against the stamp the
 * strategy writes in its source. A wrong stamp, or a construction edited without re-stamping, fails here.
 * ⚠️ NARROWED CLAIM (Langston r3): it proves each leg moves as its stamp says; it cannot separate forms that are
 * observationally equivalent on a given construction (on a distance stop an r_multiple target and a distance target
 * respond identically) and does not claim to. Mixed legs are tested per term, with a flip check on the operator.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_REGIMES, getStrategiesForRegime, resolveCanonicalStrategy } from '../../config/canonical-regime-strategy-map.js';

const ROOT = join(__dirname, '..', '..', '..');
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const ENGINE = 'server/services/strategy-engine.ts';

type Form = 'anchor' | 'distance' | 'proportional' | 'r_multiple';
type Leg = { expr: string; form: Form } | { op: 'max' | 'min'; terms: Array<{ expr: string; form: Form }> };
interface Case {
  key: string;            // canonical strategy key
  branch: string;
  file: string;
  decision: string;       // the identifier (or `obj.prop`) the decision price flows through
  entry: string;          // the entry expression, verbatim from the source
  stop: Leg;
  target: Leg;
  stamp: string;          // the stamp literal as it appears in the source (a substring)
}

const CASES: Case[] = [
  { key: 'vwap_pullback', branch: 'B63 override', file: ENGINE, decision: 'currentPrice',
    entry: "currentPrice + atr * c['entry_atr_premium']",
    stop: { expr: 'entryPrice - atr * override.stopAtrMultiplier', form: 'distance' },
    target: { expr: 'entryPrice + riskDistance * override.targetAsRMultiple', form: 'r_multiple' },
    stamp: "_levelSpec = { stop: { form: 'distance' }, target: { form: 'r_multiple', r: override.targetAsRMultiple } };" },
  { key: 'vwap_pullback', branch: 'default', file: ENGINE, decision: 'currentPrice',
    entry: "currentPrice + atr * c['entry_atr_premium']",
    stop: { expr: "Math.min(vwap - atr * c['stop_atr_mult_vwap'], low24h + atr * c['stop_atr_mult_low24h'])", form: 'anchor' },
    target: { op: 'max', terms: [
      { expr: "high24h - atr * c['target_atr_offset_high24h']", form: 'anchor' },
      { expr: "entryPrice + (riskDistance * c['target_r_multiple_default'])", form: 'r_multiple' }] },
    stamp: "{ spec: { form: 'r_multiple', r: c['target_r_multiple_default'] }, value: twoRTarget }" },
  { key: 'abcd_long', branch: 'fixed target', file: ENGINE, decision: 'cHigh',
    entry: "cHigh + abcdAtr * c['entry_atr_buffer']",
    stop: { expr: "parseFloat(cPoint.low) - abcdAtr * c['stop_atr_buffer']", form: 'anchor' },
    target: { expr: 'entryPrice * (1 + targetPercent)', form: 'proportional' },
    stamp: "_targetSpec = { form: 'proportional' };" },
  { key: 'abcd_long', branch: 'trailing', file: ENGINE, decision: 'cHigh',
    entry: "cHigh + abcdAtr * c['entry_atr_buffer']",
    stop: { expr: "parseFloat(cPoint.low) - abcdAtr * c['stop_atr_buffer']", form: 'anchor' },
    target: { op: 'min', terms: [
      { expr: 'entryPrice + abDistance', form: 'distance' },
      { expr: "entryPrice + (riskDistance * c['trailing_target_r_multiple'])", form: 'r_multiple' }] },
    stamp: "{ spec: { form: 'r_multiple', r: c['trailing_target_r_multiple'] }, value: twoRTarget }" },
  { key: 'sma_trend_ride', branch: 'trailing', file: ENGINE, decision: 'currentPrice',
    entry: "currentPrice * c['entry_premium_mult']",
    stop: { expr: "Math.min(priorSwingLow * c['swing_low_stop_mult'], sma * c['sma_stop_mult'])", form: 'anchor' },
    target: { expr: "entryPrice * (1 + trendStrength * c['trailing_strength_factor'])", form: 'proportional' },
    stamp: "_targetSpec = { form: 'proportional' };" },
  { key: 'sma_trend_ride', branch: 'break', file: ENGINE, decision: 'currentPrice',
    entry: "currentPrice * c['entry_premium_mult']",
    stop: { expr: "Math.min(priorSwingLow * c['swing_low_stop_mult'], sma * c['sma_stop_mult'])", form: 'anchor' },
    target: { expr: "entryPrice + (riskDistance * c['break_target_r_multiple'])", form: 'r_multiple' },
    stamp: "_targetSpec = { form: 'r_multiple', r: c['break_target_r_multiple'] };" },
  { key: 'breakout', branch: 'only', file: ENGINE, decision: 'breakoutLevel',
    entry: "breakoutLevel * c['entry_premium_mult']",
    stop: { expr: "rangeResult.rangeLow * c['stop_below_low_mult']", form: 'anchor' },
    target: { expr: 'entryPrice + rangeHeight', form: 'distance' },
    stamp: "levelSpec: { stop: { form: 'anchor' }, target: { form: 'distance' } } satisfies LevelSpec, // #1250 P0: range low; entry + range height" },
  { key: 'mean_reversion', branch: 'only', file: ENGINE, decision: 'currentPrice',
    entry: "currentPrice * c['entry_premium_mult']",
    stop: { expr: 'currentPrice * (1 - stopLossBuffer)', form: 'proportional' },
    target: { expr: "meanValue * c['target_below_mean_mult']", form: 'anchor' },
    stamp: "levelSpec: { stop: { form: 'proportional' }, target: { form: 'anchor' } } satisfies LevelSpec" },
  { key: 'range_trade', branch: 'only', file: ENGINE, decision: 'currentPrice',
    entry: "currentPrice + atr * c['entry_atr_premium']",
    stop: { expr: "rangeResult.rangeLow - atr * c['stop_atr_below_low']", form: 'anchor' },
    target: { expr: "rangeResult.rangeHigh - atr * c['target_atr_below_high']", form: 'anchor' },
    stamp: "levelSpec: { stop: { form: 'anchor' }, target: { form: 'anchor' } } satisfies LevelSpec, // #1250 P0: range low / range high" },
  { key: 'vwap_bounce', branch: 'only', file: ENGINE, decision: 'currentPrice',
    entry: "currentPrice * c['entry_premium_mult']",
    stop: { expr: "vwap * c['stop_below_vwap_mult']", form: 'anchor' },
    target: { expr: "entryPrice + (riskDistance * c['target_r_multiple'])", form: 'r_multiple' },
    stamp: "levelSpec: { stop: { form: 'anchor' }, target: { form: 'r_multiple', r: c['target_r_multiple'] } } satisfies LevelSpec" },
  { key: 'liquidity_trap', branch: 'only (disabled; bearish geometry)', file: ENGINE, decision: 'currentBarPrice',
    entry: "currentBarPrice * c['entry_on_return_mult']",
    stop: { expr: "breakoutHigh * c['stop_above_trap_mult']", form: 'anchor' },
    target: { expr: "rangeResult.rangeLow * c['target_range_low_mult']", form: 'anchor' },
    stamp: "levelSpec: { stop: { form: 'anchor' }, target: { form: 'anchor' } } satisfies LevelSpec, // #1250 P0: trap high / range low" },
  { key: 'dhma', branch: 'only', file: ENGINE, decision: 'currentPrice',
    entry: "currentPrice * c['entry_premium_mult']",
    stop: { expr: 'currentPrice - k_tp * realizedVol', form: 'distance' },
    target: { expr: 'currentPrice + k_tp * realizedVol', form: 'distance' },
    stamp: "levelSpec: { stop: { form: 'distance' }, target: { form: 'distance' } } satisfies LevelSpec, // #1250 P0: price ∓ k·vol" },
  { key: 'adaptive_flow', branch: 'only', file: 'server/strategies/adaptive-flow.ts', decision: 'currentPrice',
    entry: 'currentPrice * 1.001',
    stop: { op: 'min', terms: [
      { expr: 'threeSoldiersLow * (1 - AF_STOP_BUFFER)', form: 'anchor' },
      { expr: 'entryPrice - AF_STOP_ATR_MULT * effectiveATR', form: 'distance' }] },
    target: { expr: 'entryPrice + AF_TARGET_ATR_MULT * effectiveATR', form: 'distance' },
    stamp: "{ stop: { op: 'min', terms: [{ spec: { form: 'anchor' }, value: patternStop }, { spec: { form: 'distance' }, value: atrStop }] }, target: { form: 'distance' } }" },
  { key: 'inside_bar_reversal', branch: 'only', file: 'server/strategies/inside-bar-reversal.ts', decision: 'parentHigh',
    entry: 'parentHigh * (1 + IB_BREAKOUT_BUFFER)',
    stop: { expr: 'parentLow * (1 - IB_STOP_BUFFER)', form: 'anchor' },
    target: { expr: 'entryPrice + IB_TARGET_ATR_MULT * effectiveATR', form: 'distance' },
    stamp: "{ stop: { form: 'anchor' }, target: { form: 'distance' } } satisfies LevelSpec, // #1250 P0: parent low" },
  { key: 'morning_star', branch: 'only', file: 'server/strategies/morning-star.ts', decision: 'currentPrice',
    entry: 'currentPrice * 1.001',
    stop: { expr: 'Math.min(c2Low, c1Low) * (1 - MS_STOP_BUFFER)', form: 'anchor' },
    target: { expr: 'entryPrice + MS_TARGET_ATR_MULT * effectiveATR', form: 'distance' },
    stamp: "{ stop: { form: 'anchor' }, target: { form: 'distance' } } satisfies LevelSpec, // #1250 P0: min(c2Low, c1Low)" },
  { key: 'orb', branch: 'only', file: 'server/strategies/orb.ts', decision: 'currentPrice',
    entry: 'currentPrice',
    stop: { expr: 'rangeLow', form: 'anchor' },
    target: { expr: 'entryPrice + ORB_TARGET_RANGE_MULT * rangeHeight', form: 'distance' },
    stamp: "{ stop: { form: 'anchor' }, target: { form: 'distance' } } satisfies LevelSpec, // #1250 P0: range low; entry + mult" },
  { key: 'pivot_shift', branch: 'only', file: 'server/strategies/pivot-shift.ts', decision: 'currentPrice',
    entry: 'currentPrice * 1.001',
    stop: { op: 'max', terms: [
      { expr: 'morningStarLow', form: 'anchor' },
      { expr: 'entryPrice - PS_STOP_ATR_MULT * effectiveATR', form: 'distance' }] },
    target: { expr: 'entryPrice + PS_TARGET_ATR_MULT * effectiveATR', form: 'distance' },
    stamp: "{ stop: { op: 'max', terms: [{ spec: { form: 'anchor' }, value: morningStarLow }, { spec: { form: 'distance' }, value: atrBasedStop }] }, target: { form: 'distance' } }" },
  { key: 'reverse_impulse', branch: 'only', file: 'server/strategies/reverse-impulse.ts', decision: 'currentPrice',
    entry: 'currentPrice * 1.001',
    stop: { expr: 'pinbarLow * (1 - RI_STOP_BUFFER)', form: 'anchor' },
    target: { expr: 'entryPrice + RI_TARGET_ATR_MULT * effectiveATR', form: 'distance' },
    stamp: "{ stop: { form: 'anchor' }, target: { form: 'distance' } } satisfies LevelSpec, // #1250 P0: pinbar low" },
  { key: 'strong_bull_trend', branch: 'only', file: 'server/strategies/strong-bull-trend.ts', decision: 'currentBar.close',
    entry: 'currentBar.close',
    stop: { expr: 'entryPrice - (atr * SBT_STOP_ATR_MULT)', form: 'distance' },
    target: { expr: 'entryPrice + (atr * SBT_TARGET_ATR_MULT)', form: 'distance' },
    stamp: "{ stop: { form: 'distance' }, target: { form: 'distance' } } satisfies LevelSpec, // #1250 P0: entry ∓ k·ATR" },
  { key: 'support_bounce', branch: 'only', file: 'server/strategies/support-bounce.ts', decision: 'currentPrice',
    entry: 'currentPrice * 1.001',
    stop: { expr: 'supportLevel * (1 - SB_STOP_BELOW_SUPPORT)', form: 'anchor' },
    target: { expr: 'entryPrice + SB_TARGET_ATR_MULT * effectiveATR', form: 'distance' },
    stamp: "{ stop: { form: 'anchor' }, target: { form: 'distance' } } satisfies LevelSpec, // #1250 P0: support" },
  { key: 'volatility_edge', branch: 'only', file: 'server/strategies/volatility-edge.ts', decision: 'cPointHigh',
    entry: 'cPointHigh * (1 + VE_BREAKOUT_BUFFER)',
    stop: { expr: 'cPointLow * (1 - VE_STOP_BUFFER)', form: 'anchor' },
    target: { op: 'min', terms: [
      { expr: 'cPointLow + (bPointHigh - aPointLow) * VE_MEASURED_MOVE_MULT', form: 'anchor' },
      { expr: 'entryPrice + VE_TARGET_ATR_MULT * effectiveATR', form: 'distance' }] },
    stamp: "target: { op: 'min', terms: [{ spec: { form: 'anchor' }, value: measuredMoveTarget }, { spec: { form: 'distance' }, value: atrTarget }] }, targetIsCap: true }" },
];

// ── a tiny evaluator over the pinned expressions ───────────────────────────────────────────────────────────────────────
function seeded(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function makeEnv(rnd: () => number, decision: string, decisionValue: number, fixed: Record<string, number>) {
  const memo = new Map<string, number>();
  const num = (k: string) => {
    if (k in fixed) return fixed[k];
    if (!memo.has(k)) {
      const r = rnd();
      // price-like names ~ 80-120, buffers / multipliers small, everything else 0.5-3
      // a price MULTIPLIER from config (`c['…_mult']`, not an ATR multiple) sits near 1 in the code: 0.99-1.01
      // an entry PREMIUM is a hair above 1 in the code (0.05 %-ish): 1.0000-1.0020
      memo.set(k, /^c\./.test(k) && /premium_mult/i.test(k) ? 1 + r * 0.002 :
        /^c\./.test(k) && /mult/i.test(k) && !/atr/i.test(k) ? 0.99 + r * 0.02 :
        /buffer|mult|premium|percent|Strength|factor|Buffer/i.test(k) ? 0.002 + r * 0.02 : /Low|High|Price|vwap|sma|mean|Level|range|Bar|Point|low24h|high24h/.test(k) ? 80 + r * 40 : 0.5 + r * 2.5);
    }
    return memo.get(k)!;
  };
  const obj = (base: string) => new Proxy({}, { get: (_t, p) => (typeof p === 'string' ? (`${base}.${p}` === decision ? decisionValue : num(`${base}.${p}`)) : undefined) });
  return new Proxy({} as Record<string, unknown>, {
    has: (_t, k) => typeof k === 'string' && !['Math', 'parseFloat', 'Number'].includes(k),
    get: (_t, k) => {
      if (typeof k !== 'string') return undefined;
      if (k === decision) return decisionValue;
      if (['c', 'override', 'rangeResult', 'cPoint', 'currentBar'].includes(k)) return obj(k);
      return num(k);
    },
  });
}
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const evalIn = (expr: string, env: object): number => new Function('env', `with (env) { return (${expr}); }`)(env) as number;
const legExprs = (l: Leg) => ('op' in l ? l.terms : [l]);

function run(cs: Case, seed: number, d: number) {
  const rnd = seeded(seed);
  const fixed: Record<string, number> = {};
  const env0 = makeEnv(rnd, cs.decision, 100, fixed);
  // first pass fixes every free value (memoised), second pass reuses them with the decision moved by d
  const entry0 = evalIn(cs.entry, env0);
  const pass = (decision: number) => {
    const env = makeEnv(() => 0, cs.decision, decision, fixed);
    // reuse the memo by re-reading the same keys from env0's draws: copy them through `fixed`
    return env;
  };
  // capture env0's memo by evaluating every expression once, then freezing the draws into `fixed`
  const freeze = (expr: string) => { for (const m of expr.matchAll(/[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*|\['[^']+'\])?/g)) {
    const k = m[0].replace(/\['([^']+)'\]/, '.$1');
    if (k === cs.decision || ['Math', 'Math.min', 'Math.max', 'parseFloat', 'entryPrice', 'riskDistance', 'stopPrice'].includes(k)) continue;
    if (!(k in fixed)) fixed[k] = evalIn(m[0], env0);
  } };
  [cs.entry, ...legExprs(cs.stop).map((t) => t.expr), ...legExprs(cs.target).map((t) => t.expr)].forEach(freeze);
  const at = (decision: number) => {
    const env = pass(decision);
    const entry = evalIn(cs.entry, env);
    const withEntry = (expr: string, stop: number) => evalIn(expr, new Proxy({}, {
      has: (_t, k) => typeof k === 'string' && !['Math', 'parseFloat', 'Number'].includes(k),
      get: (_t, k) => (k === 'entryPrice' ? entry : k === 'riskDistance' ? entry - stop : k === 'stopPrice' ? stop : (env as Record<string, unknown>)[k as string]),
    }));
    const legVal = (l: Leg, stop: number) => ('op' in l
      ? (l.op === 'max' ? Math.max : Math.min)(...l.terms.map((t) => withEntry(t.expr, stop)))
      : withEntry(l.expr, stop));
    const stop = legVal(cs.stop, NaN);
    const terms = (l: Leg, s: number) => legExprs(l).map((t) => withEntry(t.expr, s));
    return { entry, stop, stopTerms: terms(cs.stop, NaN), targetTerms: terms(cs.target, stop), target: legVal(cs.target, stop) };
  };
  void entry0;
  return { a: at(100), b: at(100 + d) };
}

function classify(form: Form, a: { entry: number; level: number; stop?: number }, b: { entry: number; level: number; stop?: number }): boolean {
  const dE = b.entry - a.entry, dL = b.level - a.level;
  switch (form) {
    case 'anchor': return Math.abs(dL) < 1e-9;
    case 'distance': return Math.abs(dL - dE) < 5e-3 * Math.abs(dE) + 1e-12;
    case 'proportional': return Math.abs(b.level / a.level - b.entry / a.entry) < 1e-9 && Math.abs(dL - dE) > 1e-6 * Math.abs(dE);
    case 'r_multiple': {
      const R = (a.level - a.entry) / (a.entry - (a.stop as number));
      return Math.abs(b.level - (b.entry + R * (b.entry - (b.stop as number)))) < 1e-6 * Math.abs(b.level);
    }
  }
}

describe('#1250 FENCE 1 — each leg responds to the decision price exactly as its stamp claims', () => {
  for (const cs of CASES) {
    describe(`${cs.key} — ${cs.branch}`, () => {
      const file = src(cs.file);
      it('the evaluated expressions are pinned to the source (what runs is what is tested)', () => {
        expect(file).toContain(cs.entry);
        for (const t of [...legExprs(cs.stop), ...legExprs(cs.target)]) {
          if (t.expr === 'morningStarLow' || t.expr === 'rangeLow') continue; // bare identifiers, asserted by the stamp below
          // Step-4 (Langston (a)): EXACTLY once — a second copy of the construction could be the one that runs.
          expect(file.split(t.expr).length - 1, `occurrences of ${t.expr}`).toBe(1);
        }
        expect(file).toContain(cs.stamp);
      });
      it.each([[1, 0.4], [2, -0.4], [3, 1.3]])('seed %s, decision moved by %s: every term moves as stamped', (seed, d) => {
        const { a, b } = run(cs, seed, d);
        legExprs(cs.stop).forEach((t, i) => {
          expect(classify(t.form, { entry: a.entry, level: a.stopTerms[i] }, { entry: b.entry, level: b.stopTerms[i] }), `stop term ${t.expr}`).toBe(true);
        });
        legExprs(cs.target).forEach((t, i) => {
          expect(classify(t.form, { entry: a.entry, level: a.targetTerms[i], stop: a.stop }, { entry: b.entry, level: b.targetTerms[i], stop: b.stop }), `target term ${t.expr}`).toBe(true);
        });
      });
    });
  }
  it('mutation control: a distance construction stamped anchor is caught', () => {
    const cs = CASES.find((c) => c.key === 'strong_bull_trend')!;
    const { a, b } = run(cs, 1, 0.4);
    expect(classify('anchor', { entry: a.entry, level: a.stop }, { entry: b.entry, level: b.stop })).toBe(false);
  });
});

describe('#1250 FENCE 2 — every member of the xStock membership is covered, keyed through the fail-closed resolver', () => {
  it('the case table covers the normalised membership exactly', () => {
    const members = new Set<string>();
    for (const r of CANONICAL_REGIMES) for (const s of getStrategiesForRegime('xstock_spot' as never, r as never) as unknown as Array<string | { strategyKey: string }>) {
      members.add(typeof s === 'string' ? s : s.strategyKey);
    }
    const covered = new Set(CASES.map((c) => resolveCanonicalStrategy(c.key)));
    const resolvedMembers = new Set([...members].map((m) => resolveCanonicalStrategy(m)));
    expect([...resolvedMembers].sort()).toEqual([...covered].sort());
    expect(resolvedMembers.size).toBe(18);
  });
});
