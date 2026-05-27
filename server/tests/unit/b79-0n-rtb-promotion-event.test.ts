/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — PromotionEvent additive assetClass field (T9)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per Langston Step 2 ACK C-7 + scope OBJ-8 + R-8 mitigation: PromotionEvent
 * gets an additive OPTIONAL `assetClass?: string` field. Existing consumers
 * (ready_to_buy_service:369 destructure, c13-validation-service collection,
 * c14-validation-service collection) MUST continue to work unmodified —
 * none enumerate keys via exhaustive-switch or `keyof PromotionEvent`.
 *
 * This test verifies:
 *   T9.1 — Emitting PromotionEvent WITHOUT assetClass works (back-compat)
 *   T9.2 — Emitting PromotionEvent WITH assetClass also works
 *   T9.3 — Existing-field consumers (mode/symbol/strategy/tradeId/signalId)
 *          unaffected — destructure works regardless of assetClass presence
 *   T9.4 — Multiple consumers receive identical event payload (no mutation)
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
  },
}));

import { eventBus, type PromotionEvent } from '../../lib/event-bus';

describe('B79.0n.RTB — PromotionEvent additive assetClass field (T9)', () => {
  beforeEach(() => {
    eventBus.removeAllListeners('PROMOTION');
  });

  it('T9.1 — PromotionEvent without assetClass emits + delivers (back-compat)', async () => {
    const received: PromotionEvent[] = [];
    eventBus.onPromotion((e) => received.push(e));

    const evt: PromotionEvent = {
      mode: 'paper',
      symbol: 'BTC/USD',
      strategy: 'fx5',
      signalId: 'sig-1',
      tradeId: 'trade-1',
      timestamp: new Date().toISOString(),
      // assetClass intentionally omitted
    };

    eventBus.emitPromotion(evt);
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(received[0].symbol).toBe('BTC/USD');
    expect(received[0].assetClass).toBeUndefined();
  });

  it('T9.2 — PromotionEvent WITH assetClass emits + delivers cleanly', async () => {
    const received: PromotionEvent[] = [];
    eventBus.onPromotion((e) => received.push(e));

    const evt: PromotionEvent = {
      mode: 'live',
      symbol: 'PF_BTCUSD',
      strategy: 'fx5',
      signalId: 'sig-2',
      tradeId: 'trade-2',
      timestamp: new Date().toISOString(),
      assetClass: 'xstock_perp',
    };

    eventBus.emitPromotion(evt);
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(received[0].assetClass).toBe('xstock_perp');
    expect(received[0].symbol).toBe('PF_BTCUSD');
  });

  it('T9.3 — destructure of existing fields works regardless of assetClass presence', async () => {
    const destructured: Array<{ symbol: string; strategy: string; tradeId: string }> = [];
    eventBus.onPromotion(({ symbol, strategy, tradeId }) => {
      destructured.push({ symbol, strategy, tradeId });
    });

    eventBus.emitPromotion({
      mode: 'paper',
      symbol: 'ETH/USD',
      strategy: 'breakout',
      signalId: 's1',
      tradeId: 't1',
      timestamp: new Date().toISOString(),
    });
    eventBus.emitPromotion({
      mode: 'paper',
      symbol: 'SOL/USD',
      strategy: 'breakout',
      signalId: 's2',
      tradeId: 't2',
      timestamp: new Date().toISOString(),
      assetClass: 'crypto_perp',
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(destructured).toHaveLength(2);
    expect(destructured[0]).toEqual({ symbol: 'ETH/USD', strategy: 'breakout', tradeId: 't1' });
    expect(destructured[1]).toEqual({ symbol: 'SOL/USD', strategy: 'breakout', tradeId: 't2' });
  });

  it('T9.4 — multiple consumers receive identical event payload', async () => {
    const consumerA: PromotionEvent[] = [];
    const consumerB: PromotionEvent[] = [];
    const consumerC: PromotionEvent[] = [];

    eventBus.onPromotion((e) => consumerA.push(e));
    eventBus.onPromotion((e) => consumerB.push(e));
    eventBus.onPromotion((e) => consumerC.push(e));

    const evt: PromotionEvent = {
      mode: 'live',
      symbol: 'AAPL_X/USD',
      strategy: 'vwap_pullback',
      signalId: 'sig-multi',
      tradeId: 'trade-multi',
      timestamp: '2026-05-27T00:00:00.000Z',
      assetClass: 'xstock_spot',
    };

    eventBus.emitPromotion(evt);
    await new Promise((r) => setTimeout(r, 10));

    expect(consumerA).toHaveLength(1);
    expect(consumerB).toHaveLength(1);
    expect(consumerC).toHaveLength(1);
    // All consumers see the same shape (no mutation between handlers).
    expect(consumerA[0].assetClass).toBe('xstock_spot');
    expect(consumerB[0].assetClass).toBe('xstock_spot');
    expect(consumerC[0].assetClass).toBe('xstock_spot');
  });

  it('T9.5 — assetClass is optional in TypeScript shape (omittable)', () => {
    // Compile-time contract: the field MUST be optional or omitting it
    // would be a TS error. This is asserted by the fact that the object
    // literal below has no assetClass and the type check passes.
    const evt: PromotionEvent = {
      mode: 'paper',
      symbol: 'ABC/USD',
      strategy: 'fx5',
      signalId: 's-omit',
      tradeId: 't-omit',
      timestamp: 'now',
    };
    expect(evt.assetClass).toBeUndefined();
  });
});
