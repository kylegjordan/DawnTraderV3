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
    expect(SRC).toContain('private acquireRefreshedInputs(');
  });

  it('BOTH refresh mechanisms call it — identical logic, no copy-paste drift', () => {
    const calls = SRC.match(/this\.acquireRefreshedInputs\(/g) ?? [];
    expect(calls.length).toBe(2); // per-signal (retired in staging step 2) + batch survivor
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
    const m = SRC.indexOf('private acquireRefreshedInputs(');
    const method = SRC.slice(m, SRC.indexOf('\n  private async refreshSingleSignal(', m));
    const scoreAt = method.indexOf('const refreshedFinalScore');
    const mtAt = method.indexOf('decideMakerTaker({');
    expect(scoreAt).toBeGreaterThan(-1);
    expect(mtAt).toBeGreaterThan(scoreAt); // order is the invariant
  });

  it('sourcePool stays the frozen at-queue value (governed exception — admission lane is history)', () => {
    expect(refreshAndRankBody()).toContain("sourcePool: (signal as any).sourcePool");
  });
});
