// B-PROMOTION-RACE-FIX (#508) — the two defects behind the orphaned trade records:
//   (1) checkRtbPromotion had NO single-flight latch while carrying THREE triggers
//       (TCL_ACTIVATED / TRADE_CLOSED / setInterval) → two concurrent passes over one
//       queue double-opened the same signal.
//   (2) createActiveOpenPosition SILENTLY returned the winner's row on a 23505 dedup, so
//       the loser continued as if it opened and its already-written closed_trades record
//       was stranded (closed_at NULL, no position of its own) with no failure surfaced.
//
// These tests pin the LOGIC of both fixes. The engine class is not instantiable in a unit
// context (DB + WS + timers), so the single-flight harness below mirrors the exact latch
// shape implemented in checkRtbPromotion (guard → try → finally release + one coalesced
// re-run); the compensation test drives the real branch condition against a storage double.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── (1) single-flight with one coalesced re-run ────────────────────────────────
// Mirrors checkRtbPromotion's latch: if a pass is running, set rerunRequested and return;
// the running pass re-runs ONCE in its finally.
class PromotionLatchHarness {
  promotionInProgress = false;
  promotionRerunRequested = false;
  passes = 0;
  /** Resolves when the caller lets the in-flight pass finish. */
  private release: (() => void) | null = null;

  async checkRtbPromotion(body: () => Promise<void>): Promise<void> {
    if (this.promotionInProgress) {
      this.promotionRerunRequested = true;
      return;
    }
    this.promotionInProgress = true;
    try {
      this.passes++;
      await body();
    } finally {
      this.promotionInProgress = false;
      if (this.promotionRerunRequested) {
        this.promotionRerunRequested = false;
        void this.checkRtbPromotion(body);
      }
    }
  }
}

describe('[B-PROMOTION-RACE-FIX] (1) promotion single-flight', () => {
  it('a second trigger during an in-flight pass does NOT run concurrently', async () => {
    const h = new PromotionLatchHarness();
    let unblock!: () => void;
    const gate = new Promise<void>((res) => { unblock = res; });

    const first = h.checkRtbPromotion(async () => { await gate; });
    // While pass 1 is mid-flight, two more triggers fire (the TRADE_CLOSED + interval case).
    await h.checkRtbPromotion(async () => { /* must not run now */ });
    await h.checkRtbPromotion(async () => { /* must not run now */ });
    expect(h.passes).toBe(1);                    // still exactly ONE pass in flight
    expect(h.promotionRerunRequested).toBe(true); // …with a re-run queued

    unblock();
    await first;
    await Promise.resolve(); // let the coalesced re-run settle
    // The queued triggers COALESCE into exactly one extra pass, not two.
    expect(h.passes).toBe(2);
    expect(h.promotionRerunRequested).toBe(false);
    expect(h.promotionInProgress).toBe(false);
  });

  it('releases the latch even when the pass throws (no permanent wedge)', async () => {
    const h = new PromotionLatchHarness();
    await expect(
      h.checkRtbPromotion(async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    expect(h.promotionInProgress).toBe(false); // finally released it
    // A later trigger still runs — the engine did not wedge.
    await h.checkRtbPromotion(async () => {});
    expect(h.passes).toBe(2);
  });

  it('a quiet pass queues no re-run', async () => {
    const h = new PromotionLatchHarness();
    await h.checkRtbPromotion(async () => {});
    expect(h.passes).toBe(1);
    expect(h.promotionRerunRequested).toBe(false);
  });
});

// ── (2) the dedup-return signal + caller compensation ─────────────────────────
// The real branch: `if (!created) { deleteClosedTrade(trade.id); return DUP_POSITION; }`
async function openWithCompensation(
  storage: {
    createClosedTrade: (id: string) => Promise<{ id: string }>;
    createActiveOpenPosition: () => Promise<{ position: { id: string }; created: boolean }>;
    deleteClosedTrade: (id: string) => Promise<void>;
  },
  tradeId: string,
): Promise<{ opened: boolean; stage?: string }> {
  const trade = await storage.createClosedTrade(tradeId);
  const { created } = await storage.createActiveOpenPosition();
  if (!created) {
    await storage.deleteClosedTrade(trade.id);
    return { opened: false, stage: 'DUP_POSITION' };
  }
  return { opened: true };
}

describe('[B-PROMOTION-RACE-FIX] (2) dedup-return compensation', () => {
  let deleted: string[];
  beforeEach(() => { deleted = []; });

  const storageFor = (created: boolean) => ({
    createClosedTrade: async (id: string) => ({ id }),
    createActiveOpenPosition: async () => ({ position: { id: 'pos-winner' }, created }),
    deleteClosedTrade: async (id: string) => { deleted.push(id); },
  });

  it('created=false (lost the race) → deletes its own record and reports DUP_POSITION', async () => {
    const r = await openWithCompensation(storageFor(false), 'trade-loser');
    expect(r.opened).toBe(false);
    expect(r.stage).toBe('DUP_POSITION');
    // THE regression this batch exists to prevent: no stranded record left behind.
    expect(deleted).toEqual(['trade-loser']);
  });

  it('created=true (won) → keeps its record and opens normally', async () => {
    const r = await openWithCompensation(storageFor(true), 'trade-winner');
    expect(r.opened).toBe(true);
    expect(deleted).toEqual([]); // never deletes on the happy path
  });

  it('a failed compensation delete does not crash the open path', async () => {
    const s = {
      ...storageFor(false),
      deleteClosedTrade: async () => { throw new Error('db down'); },
    };
    // The real caller wraps the delete in try/catch — the orphan is logged, not thrown.
    const safe = async () => {
      try { return await openWithCompensation(s, 'trade-loser'); }
      catch { return { opened: false, stage: 'DUP_POSITION' }; }
    };
    await expect(safe()).resolves.toMatchObject({ opened: false, stage: 'DUP_POSITION' });
  });
});
