import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  applyMakerTakerFillPolicy,
  type MakerTakerDecisionResult,
} from '../../core/math/maker-taker-decision.js';
import { evaluatePendingMaker, planTwin } from '../../core/trading/pending-maker-logic.js';
import { selectTouchPrice } from '../../core/calculations/touch-price.js';

const decision = (
  over: Partial<MakerTakerDecisionResult> = {},
): MakerTakerDecisionResult => ({
  chosenMode: 'maker',
  chosenNetEV: 2,
  takerNetEV: 1,
  makerNetEVRaw: 3,
  makerNetEVAdjusted: 2,
  makerEntryAdvantagePct: 0.01,
  adverseSelectionPct: 0.001,
  nonFillCostPct: 0.001,
  hardFloorFired: false,
  makerFillProbability: 0.7,
  signalStrength: 0.5,
  taker: {} as MakerTakerDecisionResult['taker'],
  maker: {} as MakerTakerDecisionResult['maker'],
  ...over,
});

describe('B-CLASS-LEG-FILL-MODE — policy overlay', () => {
  it('maker_only rejects a hard-floor signal even when both priced arms are positive', () => {
    expect(applyMakerTakerFillPolicy(decision({ hardFloorFired: true }), 'maker_only', -0.01))
      .toEqual({ admitted: false, policy: 'maker_only', reason: 'hard_floor' });
  });

  it('maker_only gates on adjusted maker EV, never the diagnostic raw maker EV', () => {
    expect(applyMakerTakerFillPolicy(
      decision({ makerNetEVRaw: 100, makerNetEVAdjusted: 0 }),
      'maker_only',
      -0.01,
    )).toEqual({ admitted: false, policy: 'maker_only', reason: 'maker_not_positive' });
  });

  it('maker_preferred takes maker first, then independently-admissible taker, then rejects', () => {
    expect(applyMakerTakerFillPolicy(decision(), 'maker_preferred', 0)).toMatchObject({ admitted: true, chosenMode: 'maker' });
    expect(applyMakerTakerFillPolicy(
      decision({ makerNetEVAdjusted: -1, takerNetEV: 0.5 }),
      'maker_preferred',
      0,
    )).toMatchObject({ admitted: true, chosenMode: 'taker', chosenNetEV: 0.5 });
    expect(applyMakerTakerFillPolicy(
      decision({ makerNetEVAdjusted: -1, takerNetEV: 0 }),
      'maker_preferred',
      0,
    )).toEqual({ admitted: false, policy: 'maker_preferred', reason: 'no_admissible_arm' });
  });

  it('the active and VTS floors remain distinct', () => {
    const marginal = decision({ makerNetEVAdjusted: -0.005, takerNetEV: -0.02 });
    expect(applyMakerTakerFillPolicy(marginal, 'maker_preferred', 0).admitted).toBe(false);
    expect(applyMakerTakerFillPolicy(marginal, 'maker_preferred', -0.01))
      .toMatchObject({ admitted: true, chosenMode: 'maker', chosenNetEV: -0.005 });
  });
});

describe('B-CLASS-LEG-FILL-MODE — strict later-quote interval', () => {
  const base = {
    side: 'buy' as const,
    transactablePrice: 99,
    limit: 100,
    nowMs: 250,
    deadlineMs: 200,
    restPlacedAtMs: 100,
  };

  it('fills from a pre-deadline quote even when evaluated after the deadline', () => {
    expect(evaluatePendingMaker({ ...base, quoteArrivedAtMs: 150 })).toBe('fill');
  });

  it.each([
    ['equal to placement', 100],
    ['before placement', 99],
    ['equal to deadline', 200],
    ['after deadline', 201],
    ['missing', null],
  ])('refuses a trade-through quote %s', (_label, quoteArrivedAtMs) => {
    expect(evaluatePendingMaker({ ...base, quoteArrivedAtMs })).toBe('drop');
  });

  it('keeps resting before expiry when the quote is not strictly later than placement', () => {
    expect(evaluatePendingMaker({ ...base, nowMs: 150, quoteArrivedAtMs: 100 })).toBe('rest');
  });

  it('preserves the freshness clock while carrying a separate receipt clock', () => {
    const now = 10_000;
    const r = selectTouchPrice({
      book: null,
      bookEligible: false,
      ticker: {
        bid: 99,
        ask: 101,
        stampMs: 8_000,
        arrivalMs: 9_500,
        clockBasis: 'venue',
        producer: 'test',
      },
      tickerBasis: 'ticker_bbo',
    }, now, { maxAgeMs: 5_000, maxSpreadFraction: 0.1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.ageMs).toBe(2_000);
    expect(r.quote.quoteArrivedAtMs).toBe(9_500);
  });
});

describe('B-CLASS-LEG-FILL-MODE — VTS twin policy', () => {
  const base = {
    twinEnabled: true,
    pendingMaker: true,
    decisionChosenMode: 'maker' as const,
    entryFillPolicy: 'maker_preferred' as const,
    takerNetEV: 0.25,
    admissionFloor: -0.01,
    limitPrice: 100,
    placementTransactablePrice: 101,
    feeRateMaker: 0.004,
    feeRateTaker: 0.008,
    makerMaxPendingMs: () => 60_000,
    nowMs: 1_000,
    chosenSlippage: 0.0005,
    chosenSpread: 0.001,
  };

  it('maker_only suppresses the alternate leg', () => {
    expect(planTwin({ ...base, entryFillPolicy: 'maker_only' }))
      .toEqual({ kind: 'skip', reason: 'policy_forbidden' });
  });

  it('maker_preferred suppresses a maker alternate after a taker decision', () => {
    expect(planTwin({ ...base, pendingMaker: false, decisionChosenMode: 'taker' }))
      .toEqual({ kind: 'skip', reason: 'policy_forbidden' });
  });

  it('opens a taker twin only when its own EV clears the VTS floor', () => {
    expect(planTwin({ ...base, takerNetEV: -0.01 }))
      .toEqual({ kind: 'skip', reason: 'alternate_inadmissible' });
    const plan = planTwin(base);
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.twinMode).toBe('taker');
    expect(plan.overlay.entryFillPolicy).toBe('maker_preferred');
  });
});

describe('B-CLASS-LEG-FILL-MODE — durable wiring fences', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  it('the migration seeds exactly four class/leg policies and adds no column default', () => {
    const migration = read('drizzle/migrations/2026-10-15-b-class-leg-fill-mode.sql');
    expect((migration.match(/'maker_taker', 'entry_fill_policy'/g) ?? [])).toHaveLength(2);
    expect((migration.match(/'maker_taker', 'target_exit_fill_policy'/g) ?? [])).toHaveLength(2);
    expect(migration).not.toMatch(/entry_fill_policy\s+varchar\(20\)\s+DEFAULT/i);
    expect(migration).not.toMatch(/target_exit_fill_policy\s+varchar\(20\)\s+DEFAULT/i);
  });

  it('VTS persistence writes and rehydrates policy plus the exact placement instant', () => {
    const persistence = read('server/services/vts-trade-persistence.ts');
    expect(persistence).toMatch(/entry_fill_policy, entry_fee_rate/);
    expect(persistence).toMatch(/maker_limit_price, maker_placed_at, maker_deadline/);
    expect(persistence).toMatch(/entryFillPolicy: r\.entry_fill_policy/);
    expect(persistence).toMatch(/makerPlacedAt: r\.maker_placed_at/);
  });

  it('refuses missing active snapshots and preserves explicit legacy dispositions', () => {
    const queue = read('server/core/rtb/ready_to_buy_service.ts');
    const engine = read('server/services/active-execution-engine.ts');
    const vtsExport = read('server/utils/export-csv.ts');
    expect(queue).toContain('chosenEntryMode: input.chosenEntryMode,');
    expect(queue).not.toContain("chosenEntryMode: input.chosenEntryMode ?? 'taker'");
    expect(engine).toContain("'POLICY_SNAPSHOT_MISSING'");
    expect(engine).toContain("neverFilledReason: why");
    expect(engine).toMatch(/_restBudgetMs !== null && _targetPolicy !== null/);
    expect(vtsExport).toContain("exitReason: trade.exitReason || 'never_filled'");
  });
});
