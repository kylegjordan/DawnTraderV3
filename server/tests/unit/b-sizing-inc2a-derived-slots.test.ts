/**
 * B-SIZING-DEC-RESTORE increment 2a (obj-2 / obj-4, #698) — HOW MANY POSITIONS CAN BE OPEN IS DERIVED.
 *
 * Plan: `Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §14 + §14.4 (Langston's ruling, graded ref a8b20eba9).
 * The stored `max_open_positions` setting is retired. The slot count is `floor(100 / effectiveP)`, where
 * `effectiveP` comes from the SAME resolver the sizer uses (`resolveEffectivePositionPct`), so the count and the
 * trade size cannot disagree (BLOCKER-2). `p` slices the exposure BUDGET, not the balance, so `e` plays no part
 * in the count (his retraction of ADDITION 4).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('../../services/system-alerts.js', () => ({ addAlert: vi.fn(async () => ({ id: 'test-alert' })) }));
// The sizer's 0.97 buffer and the pattern pool's per-class cap are both read through the cached-required path.
// The cap is set to 0.15 here (a test value) so the pattern leg below has a cap BELOW p to bite on.
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: vi.fn((module: string, key: string) =>
    module === 'pattern_pool_gates' && key === 'pattern_max_position_pct' ? 0.15 : 0.97),
}));

const _row = { current: null as Record<string, unknown> | null };
vi.mock('../../storage', () => ({
  storage: {
    getGuardrailsV2: async () => _row.current,
    // No portfolio state: the balance leg returns 0 with a warning. The slot count does not read the balance.
    getPortfolioState: async () => null,
  },
}));

import { deriveSlotCount, resolveEffectivePositionPct, sizeActivePositionForSignal } from '../../services/active-position-sizing.js';
import { buildSettingsFromGuardrails } from '../../services/guardrail-settings.js';
import { guardrailPolicy } from '../../services/guardrail-policy.js';

// The engine's two promotion loops refuse admissions on exactly this predicate (active-execution-engine.ts, both
// GUARDRAIL_READ_FAIL sites). It is restated here so the unit legs test what the loops actually do with the value.
const loopsHalt = (slots: number) => !Number.isFinite(slots) || slots <= 0;

describe('deriveSlotCount — floor(100 / effectiveP)', () => {
  it('Kyle\'s reset figure: 5% per position ⇒ 20 slots', () => expect(deriveSlotCount(5)).toBe(20));
  it('today\'s paper: 20% ⇒ 5 slots', () => expect(deriveSlotCount(20)).toBe(5));
  it('live: 30% ⇒ 3 slots (exposure already binds at 3)', () => expect(deriveSlotCount(30)).toBe(3));

  // MUTATION: replace the floor with Math.round and this fails (100 / 30 = 3.33 still floors, 100 / 6.67 = 14.99 does not).
  it('rounds DOWN, never up: 6.67% ⇒ 14, not 15', () => expect(deriveSlotCount(6.67)).toBe(14));

  it('an unreadable percent gives NaN, and the loops HALT on it', () => {
    const s = deriveSlotCount(Number.NaN);
    expect(Number.isNaN(s)).toBe(true);
    expect(loopsHalt(s)).toBe(true);
  });

  // §14.4 D9 (his third addition): p = 0 is not NaN — it is Infinity, which is finite-checked, not NaN-checked.
  it('p = 0 gives Infinity, and the loops HALT on it', () => {
    const s = deriveSlotCount(0);
    expect(s).toBe(Number.POSITIVE_INFINITY);
    expect(loopsHalt(s)).toBe(true);
  });

  it('a negative percent gives a negative count, and the loops HALT on it', () => {
    expect(loopsHalt(deriveSlotCount(-5))).toBe(true);
  });

  // §14.4 D4: p = 0.5 is FINITE and the loops do NOT halt on it — 200 slots. Increment 2b closes it at ENTRY:
  // RULE_012 and the DB CHECK refuse p < 1 (the derivation itself stays a pure function).
  it('p = 0.5 ⇒ 200 slots, the loops do not halt — and 2b refuses p = 0.5 at entry', () => {
    expect(deriveSlotCount(0.5)).toBe(200);
    expect(loopsHalt(deriveSlotCount(0.5))).toBe(false);
    const failures = guardrailPolicy.validate({ mode: 'paper', maxPositionPercentPct: 0.5 } as any).failures.map((f) => f.ruleId);
    expect(failures).toContain('RULE_012');
  });
});

describe('the invariant — N slots never commit more than the exposure budget', () => {
  // BLOCKER-2: obj-5's posture multiplier must land INSIDE resolveEffectivePositionPct. At ×1.25 (AGGRESSIVE) a slot
  // count taken from the raw p would size N trades at 1.25p = 125% of the budget. Taken from the resolver's output it
  // holds by construction. Both multipliers run here so the ×1.25 case is on record before obj-5 exists.
  for (const multiplier of [1, 1.25]) {
    it(`slots × effectiveP ≤ 100 for every p from 0.5% to 100%, posture ×${multiplier}`, () => {
      for (let p = 0.5; p <= 100; p += 0.25) {
        const effectiveP = resolveEffectivePositionPct(p * multiplier, 'quant');
        expect(deriveSlotCount(effectiveP) * effectiveP, `p=${p} ×${multiplier}`).toBeLessThanOrEqual(100);
      }
    });
  }

  // The same statement through the REAL sizer, in dollars: $3,000, e = 100%, p = 5% ⇒ $145.50 a trade, 20 slots,
  // $2,910 committed = 97% of the budget (the 0.97 buffer). MUTATION: size from a different share than the resolver
  // returns and the committed total moves off the budget.
  it('through the sizer: Kyle\'s $3,000 reset at 5% ⇒ 20 × $145.50 = $2,910 ≤ $3,000', () => {
    const r = sizeActivePositionForSignal({
      mode: 'paper', portfolioValue: 3000, entryPrice: 100, stopPrice: 97, symbol: 'TEST/USD',
      strategy: 'breakout' as any, assetClass: 'crypto_spot' as any,
      guardrails: { maxPositionPercentPct: '5.00', maxTotalExposurePct: '100.00' } as any,
    });
    const slots = deriveSlotCount(resolveEffectivePositionPct(5, 'quant'));
    expect(slots).toBe(20);
    expect(r.estimatedValue).toBeCloseTo(145.5, 2);
    expect(slots * r.estimatedValue).toBeLessThanOrEqual(3000);
  });

  it('the pattern pool is capped at its class share and never raised above p', () => {
    // with the pattern share at 15% (the mocked row): a p above it is cut to 15, a p below it is left alone.
    expect(resolveEffectivePositionPct(20, 'pattern', 'crypto_spot' as any)).toBe(15);
    expect(resolveEffectivePositionPct(5, 'pattern', 'crypto_spot' as any)).toBe(5);
    expect(resolveEffectivePositionPct(20, 'quant')).toBe(20);
  });
});

describe('buildSettingsFromGuardrails — maxOpenTrades is derived from the row, not read from it', () => {
  const row = (p: unknown) => ({
    mode: 'paper', maxPositionPercentPct: p, maxTotalExposurePct: '100.00',
    dailyLossKillSwitchPct: '7.00', killSwitchTripped: false,
    lowPriceThreshold: '1', lowPriceMinStopAtrMult: '1', lowPriceMinPositionNotional: '1',
  });
  const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('p = 5 ⇒ 20', async () => {
    const w = quiet(); _row.current = row('5.00');
    expect((await buildSettingsFromGuardrails('paper')).maxOpenTrades).toBe(20);
    w.mockRestore();
  });

  it('p = 30 ⇒ 3', async () => {
    const w = quiet(); _row.current = row('30.00');
    expect((await buildSettingsFromGuardrails('paper')).maxOpenTrades).toBe(3);
    w.mockRestore();
  });

  // MUTATION: put a `|| 15`-style default back and this fails. P19-B8.7's rule: no fabricated cap.
  it('an unreadable percent ⇒ NaN, never a substituted number', async () => {
    const w = quiet(); _row.current = row(undefined);
    const s = (await buildSettingsFromGuardrails('paper')).maxOpenTrades;
    expect(Number.isNaN(s)).toBe(true);
    expect(loopsHalt(Number(s))).toBe(true);
    w.mockRestore();
  });

  // The retired column, if a stale row still carried it, must not be what the count comes from.
  it('a stale max_open_positions on the row is ignored', async () => {
    const w = quiet(); _row.current = { ...row('5.00'), maxOpenPositions: 15 };
    expect((await buildSettingsFromGuardrails('paper')).maxOpenTrades).toBe(20);
    w.mockRestore();
  });
});

describe('ONE derivation (§14.4 BLOCKER-1) — every slot reader calls it, nothing re-derives it', () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8').replace(/\r\n/g, '\n');

  it('the sizer sizes from the resolver', () => {
    expect(src('server/services/active-position-sizing.ts'))
      .toContain('const effectiveMaxPositionPct = resolveEffectivePositionPct(safeMaxPositionPct, signalSourcePool, params.assetClass);');
  });

  // (m5e left this list in increment 2d — the harness is deleted, P-11.)
  it('the settings builder and the state snapshot take the count from deriveSlotCount', () => {
    for (const f of ['server/services/guardrail-settings.ts', 'server/services/state-awareness.ts']) {
      expect(src(f), f).toContain('deriveSlotCount(');
    }
  });

  // (the m5e `floor(e / p)` twin test left with the harness in increment 2d; the legacy-deletion fence now asserts the
  //  harness does not come back.)
});

// (2a's test that POST /orchestrator/updateGuardrail refused maxOpenPositions is gone with the route itself —
//  increment 2d, #1090; the legacy-deletion fence now asserts the route and its schema do not come back.)

describe('P3 (increment 2b, §15.1 G2) — the fallback sizer reads the working balance', () => {
  const src = readFileSync(join(process.cwd(), 'server/services/active-execution-engine.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const i = src.indexOf('[B6][FALLBACK_SIZING]');
  const branch = src.slice(i, i + 1400);
  // MUTATION: put `storage.getPortfolioState` back in the fallback branch and the first assertion fails.
  it('the fallback branch sizes from getPortfolioBalanceV2, not the bare anchor', () => {
    expect(i).toBeGreaterThan(0);
    expect(branch).not.toContain('getPortfolioState');
    expect(branch).toContain('await getPortfolioBalanceV2(this.mode)');
  });
  it('its log line no longer claims it sizes somewhere else', () => {
    expect(branch).not.toContain('will size in executeSimulatedTrade');
  });
});
