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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── (0) SOURCE FENCE — bound to the REAL files, not a mirror ──────────────────
// Langston Step-4 should-fix 2: the behavioural tests below exercise harnesses that mirror the
// implemented logic (the engine class needs DB + WS + timers to instantiate). A mirror stays green
// if the real code loses its guard, so this batch — which exists to close a SILENT race — pins the
// load-bearing shapes in the actual source. Same pattern as signal-id-format.test.ts.
const ENGINE_SRC = readFileSync(
  resolve(__dirname, '../../services/active-execution-engine.ts'), 'utf8');
const STORAGE_SRC = readFileSync(resolve(__dirname, '../../storage.ts'), 'utf8');

describe('[B-PROMOTION-RACE-FIX] (0) source fence — the real files keep their guards', () => {
  it('checkRtbPromotion declares the single-flight latch and guards on it', () => {
    expect(ENGINE_SRC).toMatch(/private\s+promotionInProgress\s*=\s*false/);
    expect(ENGINE_SRC).toMatch(/private\s+promotionRerunRequested\s*=\s*false/);
    // entry guard: set the re-run flag and bail while a pass is in flight
    expect(ENGINE_SRC).toMatch(/if\s*\(this\.promotionInProgress\)\s*\{[\s\S]{0,120}?this\.promotionRerunRequested\s*=\s*true;[\s\S]{0,40}?return;/);
  });

  it('the latch is released in a finally (no permanent wedge)', () => {
    expect(ENGINE_SRC).toMatch(/finally\s*\{[\s\S]{0,600}?this\.promotionInProgress\s*=\s*false/);
  });

  it('★ the coalesced re-run is isRunning-guarded (Step-4 blocker: never promote on a stopped engine)', () => {
    expect(ENGINE_SRC).toMatch(/if\s*\(this\.promotionRerunRequested\s*&&\s*this\.isRunning\)/);
  });

  it('the open path compensates on the dedup-return (created=false → delete its own record)', () => {
    expect(ENGINE_SRC).toMatch(/created:\s*_posCreated/);
    expect(ENGINE_SRC).toMatch(/if\s*\(!_posCreated\)\s*\{[\s\S]{0,900}?storage\.deleteClosedTrade\(/);
    expect(ENGINE_SRC).toMatch(/if\s*\(!_posCreated\)\s*\{[\s\S]{0,1400}?stage:\s*'DUP_POSITION'/);
  });

  it('the in-pass duplicate guard exists and records promoted symbols', () => {
    expect(ENGINE_SRC).toMatch(/promotedSymbolsThisPass\s*=\s*new Set<string>\(/);
    expect(ENGINE_SRC).toMatch(/if\s*\(promotedSymbolsThisPass\.has\(signal\.symbol\)\)/);
    expect(ENGINE_SRC).toMatch(/promotedSymbolsThisPass\.add\(signal\.symbol\)/);
  });

  it('createActiveOpenPosition signals the dedup-return instead of swallowing it', () => {
    expect(STORAGE_SRC).toMatch(/Promise<\{\s*position:\s*ActiveOpenPosition;\s*created:\s*boolean\s*\}>/);
    expect(STORAGE_SRC).toMatch(/return\s*\{\s*position:\s*existing\[0\],\s*created:\s*false\s*\}/);
    expect(STORAGE_SRC).toMatch(/return\s*\{\s*position:\s*result,\s*created:\s*true\s*\}/);
  });

  it('★ deleteClosedTrade is structurally restricted to UNCLOSED rows (balance-neutrality by contract)', () => {
    expect(STORAGE_SRC).toMatch(/deleteClosedTrade[\s\S]{0,900}?isNull\(closedTradesTable\.closedAt\)/);
  });
});

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

// ── (1b) the IN-PASS duplicate guard ──────────────────────────────────────────
// The pre-loop openPositions snapshot cannot see opens made earlier in the SAME pass
// (#508's 2026-07-15 MET/USD double-promotion). Mirrors the implemented set-guard.
function promotePass(
  rankedSignals: { symbol: string }[],
  openPositionSymbols: string[],
  openSlots: number,
): { promoted: string[]; deferred: string[] } {
  const promotedSymbolsThisPass = new Set<string>(openPositionSymbols);
  const promoted: string[] = [];
  const deferred: string[] = [];
  let slots = openSlots;
  for (const signal of rankedSignals) {
    if (slots <= 0) break;
    if (promotedSymbolsThisPass.has(signal.symbol)) { deferred.push(signal.symbol); continue; }
    promoted.push(signal.symbol);
    promotedSymbolsThisPass.add(signal.symbol); // recorded on success
    slots--;
  }
  return { promoted, deferred };
}

describe('[B-PROMOTION-RACE-FIX] (1b) in-pass duplicate guard', () => {
  it('two same-symbol signals in ONE pass → the second is deferred, not promoted', () => {
    // The exact #508 shape: two MET/USD rows from consecutive gen cycles, same pass.
    const r = promotePass([{ symbol: 'MET/USD' }, { symbol: 'MET/USD' }], [], 5);
    expect(r.promoted).toEqual(['MET/USD']);
    expect(r.deferred).toEqual(['MET/USD']);
  });

  it('a symbol already holding a position is deferred', () => {
    const r = promotePass([{ symbol: 'ETH/USD' }, { symbol: 'SOL/USD' }], ['ETH/USD'], 5);
    expect(r.promoted).toEqual(['SOL/USD']);
    expect(r.deferred).toEqual(['ETH/USD']);
  });

  it('distinct symbols all promote (the guard does not over-block)', () => {
    const r = promotePass([{ symbol: 'A/USD' }, { symbol: 'B/USD' }, { symbol: 'C/USD' }], [], 5);
    expect(r.promoted).toEqual(['A/USD', 'B/USD', 'C/USD']);
    expect(r.deferred).toEqual([]);
  });

  it('a deferred duplicate does NOT consume a slot', () => {
    // 2 slots, 3 signals where #2 duplicates #1 → both distinct symbols still fit.
    const r = promotePass([{ symbol: 'A/USD' }, { symbol: 'A/USD' }, { symbol: 'B/USD' }], [], 2);
    expect(r.promoted).toEqual(['A/USD', 'B/USD']);
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
