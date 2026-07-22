/**
 * B-RTB-REFRESH-CONSOLIDATE — the transplant, pinned.
 *
 * The defect (audit 2026-07-18): two refresh mechanisms ran concurrently over one queue.
 * The DOCUMENTED survivor (bucketed service → `refreshAndRank`) handed the SQE the FROZEN
 * queue-time snapshot — stored volatility, stored chosen_net_ev, no geometry re-read, no
 * maker/taker re-decide — AND wrote none of those fields back, so the staleness was
 * self-perpetuating. The UNDOCUMENTED mechanism was the only one re-reading market state.
 *
 * These tests pin the STRUCTURAL guarantees of the fix (they are source-level assertions by
 * design — the runtime path needs a live queue + market caches, which the §7 staging
 * verification covers on the soak; see Langston Step-1 Q5 gate).
 *
 * The load-bearing one is `chosenNetEv`: NetEV is the BINDING admission gate (#501 fee wall),
 * so replaying a queue-time snapshot meant a signal whose net expectancy had gone NEGATIVE
 * since queueing was reconfirmed on the old number.
 */
import { describe, it, expect } from 'vitest';
import { calculateRegimeWeight } from '../../core/utils/score-calculator';

/**
 * B-REGIME-INPUTS-LIVE / #546: calculateRegimeWeight returns a RESULT OBJECT
 * ({ok:true,value} / {ok:false,reason}) so absence cannot be coerced into a score by a
 * `??` downstream. These assertions test the COMPUTED math, which is UNCHANGED — the
 * helper unwraps and asserts ok, so a silent {ok:false} fails loudly instead of
 * comparing objects and passing by accident.
 */
function rw(metrics: { trendStrength?: number; volatility?: number }): number {
  const r = calculateRegimeWeight(metrics);
  if (!r.ok) throw new Error(`expected computed regimeWeight, got ok:false (${r.reason})`);
  return r.value;
}

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(process.cwd(), 'server/core/rtb/ready_to_buy_service.ts'), 'utf-8');

/** Body of the batch-refresh mechanism (the documented survivor). */
function refreshAndRankBody(): string {
  const start = SRC.indexOf('async refreshAndRank(');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n  isRefreshComplete(', start);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('B-RTB-REFRESH-CONSOLIDATE: one shared acquisition, both mechanisms', () => {
  it('the shared acquisition method exists', () => {
    // B-REGIME-REFRESH-PIPE (2026-07-21): now `async` — it awaits a fresh regime compute
    // (computeRefreshRegimeInputs) for queued pairs the survivor-only MCE cache can't cover.
    expect(SRC).toContain('private async acquireRefreshedInputs(');
  });

  it('exactly ONE caller remains — the bucketed survivor (staging step 2 complete)', () => {
    // ★ OBJ-1 (2026-07-22): was `toBe(2)`, pinning the DELIBERATE transition state — the shared
    // acquisition was extracted so both mechanisms ran identical logic while they coexisted, with
    // the per-signal caller due to disappear at "staging step 2". That step is now DONE: Mechanism
    // A is retired, so 2 -> 1 is the batch SUCCEEDING, not a regression. This assertion now guards
    // the end state — if it ever reads 2 again, a second scheduler has been reintroduced over the
    // same queue, which is the exact ~7-month defect this batch exists to close.
    const calls = SRC.match(/this\.acquireRefreshedInputs\(/g) ?? [];
    expect(calls.length).toBe(1);
  });

  it('the survivor no longer keeps its own decay/FinalScore recompute', () => {
    // It must consume the shared result, not maintain a divergent copy.
    expect(refreshAndRankBody()).toContain('_acq.refreshedFinalScore');
  });
});

describe('B-RTB-REFRESH-CONSOLIDATE: the survivor is handed CURRENT state (OBJ-2)', () => {
  it('★ chosenNetEv prefers this tick re-decide over the stored snapshot (the binding gate)', () => {
    const body = refreshAndRankBody();
    expect(body).toContain('chosenNetEv: _acq.refreshedMT?.chosenNetEV');
    // the stored value survives ONLY as the fallback (?? ), never as the primary read
    expect(body).toMatch(/chosenNetEv: _acq\.refreshedMT\?\.chosenNetEV\s*\n?\s*\?\?/);
  });

  it('volatility is the live read, not the frozen `metadata ?? 0.3` default', () => {
    const body = refreshAndRankBody();
    expect(body).toContain('volatility: _acq.currentVol');
    expect(body).not.toContain('volatility: metadata.volatility ?? 0.3');
  });

  it('chosenEntryMode follows the same re-decide-first precedence', () => {
    expect(refreshAndRankBody()).toContain('_acq.refreshedMT?.chosenMode');
  });
});

describe('B-RTB-REFRESH-CONSOLIDATE: the self-perpetuating loop is broken (OBJ-2)', () => {
  it('the survivor writes the freshness fields BACK — it never did before', () => {
    const body = refreshAndRankBody();
    // Without these the next cycle re-reads its own stale values forever.
    expect(body).toContain('netExpectedEdge: _acq.netExpectedEdge');
    expect(body).toContain('volatility: _acq.currentVol');
    expect(body).toContain('spread: _acq.currentSpread');
    expect(body).toContain('lastCostRefresh:');
  });

  it('the re-decided maker/taker snapshot is persisted (ranker + open-gate read it)', () => {
    const body = refreshAndRankBody();
    expect(body).toContain('chosenNetEv: _acq.refreshedMT.chosenNetEV.toString()');
    expect(body).toContain('chosenEntryMode: _acq.refreshedMT.chosenMode');
  });

  it('lastCostRefresh only advances when geometry ACTUALLY refreshed (throttle stays honest)', () => {
    // Advancing it unconditionally would defeat shouldRecalculateGeometry's age branch.
    expect(refreshAndRankBody()).toContain('_acq.geometryRefreshed ? Date.now() :');
  });
});

describe('B-RTB-REFRESH-CONSOLIDATE: score-timing invariant preserved (Langston B7.2b gate)', () => {
  it('decideMakerTaker runs AFTER the decayed score, so signalStrength is same-vintage', () => {
    const m = SRC.indexOf('private async acquireRefreshedInputs('); // B-REGIME-REFRESH-PIPE: now async
    // OBJ-1 (2026-07-22): the end-delimiter WAS `refreshSingleSignal`, which this batch DELETED.
    // Left unfixed, indexOf returns -1 and slice(m, -1) silently widens `method` to the whole rest
    // of the file — the assertions below would still PASS while no longer testing this method at
    // all. Re-pointed to the next surviving member, and both indices are asserted so a future
    // rename fails LOUDLY instead of quietly hollowing the test out.
    const end = SRC.indexOf('\n  async refreshAndRank(', m);
    expect(m).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(m);
    const method = SRC.slice(m, end);
    const scoreAt = method.indexOf('const refreshedFinalScore');
    const mtAt = method.indexOf('decideMakerTaker({');
    expect(scoreAt).toBeGreaterThan(-1);
    expect(mtAt).toBeGreaterThan(scoreAt); // order is the invariant
  });

  it('sourcePool stays the frozen at-queue value (governed exception — admission lane is history)', () => {
    expect(refreshAndRankBody()).toContain("sourcePool: (signal as any).sourcePool");
  });
});

describe('B-RTB-REFRESH-CONSOLIDATE OBJ-2: regimeWeight recompute — honest about what it does NOT fix', () => {
  it('the recompute tracks LIVE volatility (the honest third)', () => {
    // calculateRegimeWeight = trendScore×0.70 + (1 − min(1,vol))×0.30
    const calm = rw({ trendStrength: 0.5, volatility: 0.02 });
    const stormy = rw({ trendStrength: 0.5, volatility: 0.90 });
    // A volatility spike must LOWER the weight — that is the whole point of refreshing it,
    // and the direction that can evict a signal whose market turned after queueing.
    expect(stormy).toBeLessThan(calm);
  });

  it('★ 70% of the output is INERT to the fabricated trendStrength — this is NOT a repair', () => {
    // trendStrength is hardcoded 0.5 at generation with no honest source in the repo.
    // Hold volatility fixed and sweep the ONE input that is real vs the one that is fake:
    const volSwing = Math.abs(
      rw({ trendStrength: 0.5, volatility: 0.0 }) -
      rw({ trendStrength: 0.5, volatility: 1.0 })
    );
    const trendSwing = Math.abs(
      rw({ trendStrength: 0.0, volatility: 0.5 }) -
      rw({ trendStrength: 1.0, volatility: 0.5 })
    );
    // The fabricated axis owns MORE of the range than the honest one — 0.70 vs 0.30.
    expect(trendSwing).toBeGreaterThan(volSwing);
    expect(volSwing).toBeCloseTo(0.30, 5);
    expect(trendSwing).toBeCloseTo(0.70, 5);
    // Pinned so nobody can later describe the RegimeWeight gate as "fed honest data" while
    // trendStrength remains a constant. Fixing that is its own named item.
  });

  it('with trendStrength pinned at 0.5, the entire live range is 0.35–0.65', () => {
    const lo = rw({ trendStrength: 0.5, volatility: 1.0 });
    const hi = rw({ trendStrength: 0.5, volatility: 0.0 });
    expect(lo).toBeCloseTo(0.35, 5);
    expect(hi).toBeCloseTo(0.65, 5);
  });
});

describe('B-RTB-REFRESH-CONSOLIDATE OBJ-1: Mechanism A RETIRED — the duplicate scheduler cannot return', () => {
  // WHY THIS FENCE EXISTS (rule 18 + the §9.5 audit finding): two independent schedulers ran over
  // the SAME queue for ~7 months, double-processing every signal into the SQE, and TWO audits
  // missed it because each traced forward from ONE entry point. The bucketed RTBRefreshService
  // (origin 7a029f390, 2025-12-23) was built to REPLACE the per-signal path — decoupled from the
  // scan loop for load, the longer refresh gap a weighed + ACCEPTED trade at that time
  // (Kyle, 2026-07-22). Running both was never the plan; A simply never got unplugged.
  it('the per-signal refresh chain is gone from the service', () => {
    expect(SRC).not.toContain('private async executePerSignalRefresh(');
    expect(SRC).not.toContain('private async refreshSingleSignal(');
    expect(SRC).not.toContain('private async executeRefreshCycle(');
  });
  it('the second Central-Clock subscription is gone (ONE scheduler over the queue)', () => {
    expect(SRC).not.toContain('startRefreshCycle(');
    expect(SRC).not.toContain('stopRefreshCycle(');
  });
  it('the shared acquisition survives, with the bucketed path as its caller', () => {
    expect(SRC).toContain('private async acquireRefreshedInputs(');
    expect(SRC).toContain('async refreshAndRank(');
  });
  it('the manual re-evaluate endpoint is PRESERVED (operator-triggered, not Mechanism A)', () => {
    expect(SRC).toContain('async reEvaluateQueue(');
  });
});

describe('B-RTB-REFRESH-CONSOLIDATE OBJ-1 follow-up: the per-signal refresh latch has a LIVE writer', () => {
  // WHY THIS FENCE EXISTS — it pins the exact defect class that produced it. Retiring Mechanism A
  // removed the ONLY writer of `SignalRefreshState.isRefreshing`, while `getRankedSignals` kept
  // filtering on `!isSignalRefreshing(...)`. Result: a reader pinned to false, a filter that
  // passed everything, and a promotion guard that presented as protection while guarding nothing
  // — with the global barrier it replaced (R9.3-D) already gone. NOTHING FAILED: no compile
  // error, no failing test, because a flag written by deleted code and read elsewhere is invisible
  // to caller-tracing and to tsc. Langston ruled RESTORE (bucket 1, real defect).
  it('the survivor SETS the latch — a reader with no writer is the bug this batch created once', () => {
    expect(SRC).toContain('_refreshState.isRefreshing = true');
  });

  it('and CLEARS it in a finally — a stranded TRUE latch is a silent queue leak', () => {
    // If a throw stranded the latch true, that signal becomes permanently invisible to promotion.
    const setAt = SRC.indexOf('_refreshState.isRefreshing = true');
    const clearAt = SRC.indexOf('_refreshState.isRefreshing = false');
    expect(setAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(setAt);
    expect(SRC.slice(setAt, clearAt)).toContain('} finally {');
  });

  it('the consumer side is intact: promotion still filters on the latch', () => {
    expect(SRC).toContain('!this.isSignalRefreshing(mode, s.signalId)');
  });

  it('getSignalRefreshState is no longer orphaned — the restore gave it its caller back', () => {
    const uses = SRC.match(/this\.getSignalRefreshState\(/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(1);
  });
});
