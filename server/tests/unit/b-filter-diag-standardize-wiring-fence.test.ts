/**
 * B-FILTER-DIAG-STANDARDIZE — WIRING COMPLETENESS FENCE (Langston Step-4 item 3).
 *
 * WHY THIS EXISTS, in one sentence: **partial wiring is worse than none**, because a table where two-thirds
 * of strategies report their decline reasons and one-third silently do not READS AS FACT while being
 * unrepresentative — and nothing errors.
 *
 * That is not hypothetical. While wiring this batch my first pattern matched **11 of the 18** call sites; a
 * pre-flight assertion in the throwaway script caught it. Langston's point: **that script is not in the
 * repo**, so the guarantee died with it. A 19th strategy, or re-enabling `liquidity_trap`, silently
 * recreates exactly the 11/18 state — and the tab keeps looking authoritative.
 *
 * SO THE FENCE READS THE SOURCE. It parses `signal-orchestrator.ts` and asserts that every strategy which
 * runs a `detect*` in the active path both RESETS the shared null-reason tracker before detecting and
 * RECORDS the reason when the strategy declines. Source-parsing is unusual for a unit test and deliberate
 * here: the property being defended is "no call site was missed", which cannot be observed by exercising
 * behaviour — only by looking at every site.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { STRATEGY_DISPLAY_NAMES } from '../../config/canonical-regime-strategy-map.js';

const ORCH = path.resolve(__dirname, '../../services/signal-orchestrator.ts');
const src = fs.readFileSync(ORCH, 'utf8');

/** Strategies deliberately NOT wired, each with the reason it is absent. A name may only live here with a
 *  stated justification — an unexplained entry is how a real gap gets normalised into an allowlist. */
const DELIBERATELY_ABSENT: Record<string, string> = {
  liquidity_trap:
    'excluded from active generation entirely — its exclusion block sits where the wiring site would be, ' +
    'so there is no detect call to instrument (verified by Langston at Step-4).',
};

describe('B-FILTER-DIAG-STANDARDIZE — active-path null-reason wiring completeness', () => {
  it('POSITIVE CONTROL: the fence can actually read the orchestrator and find its detect calls', () => {
    // If this fails, every assertion below is vacuous — silence would mean "found nothing" rather than
    // "found nothing wrong". Prove the instrument before trusting it.
    expect(src.length).toBeGreaterThan(10_000);
    expect(src).toContain('this.strategyEngine.detect');
  });

  it('every wired site RESETS the tracker before detecting (the mis-attribution defence)', () => {
    const lines = src.split('\n');
    const detectLines = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /const rawSignal = this\.strategyEngine\.detect/.test(l));
    expect(detectLines.length).toBeGreaterThan(0);
    const missingReset = detectLines.filter(({ i }) => {
      const before = lines.slice(Math.max(0, i - 8), i).join('\n');
      const after = lines.slice(i, i + 16).join('\n');
      // Only sites that RECORD a null reason need the reset — those are the ones that read it.
      return after.includes('recordActiveStrategyNull') && !before.includes('resetNullReason()');
    });
    expect(missingReset.map(({ i }) => i + 1)).toEqual([]);
  });

  it('reset count EQUALS record count — neither half may drift from the other', () => {
    const resets = (src.match(/resetNullReason\(\)/g) ?? []).length;
    const records = (src.match(/recordActiveStrategyNull\(/g) ?? []).length;
    expect(resets).toBe(records);
  });

  it('★ EVERY canonical strategy is either WIRED or explicitly justified as absent', () => {
    const recorded = new Set(
      Array.from(src.matchAll(/recordActiveStrategyNull\([^,]+,\s*[^,]+,\s*'([a-z_0-9]+)'/g)).map((m) => m[1]),
    );
    const canonical = Object.keys(STRATEGY_DISPLAY_NAMES);
    expect(canonical.length).toBeGreaterThan(0); // positive control on the SSOT import
    const unaccounted = canonical.filter(
      (s) => !recorded.has(s) && !(s in DELIBERATELY_ABSENT),
    );
    // A failure here means a strategy silently stopped reporting its decline reasons — the tab would still
    // render, and would still look authoritative, while under-counting that strategy to zero.
    expect(unaccounted).toEqual([]);
  });

  it('the deliberately-absent list has not grown silently', () => {
    // Each entry is a real gap that was reasoned about. Growth must be a deliberate edit with a reason,
    // never an incidental way to make this fence pass.
    expect(Object.keys(DELIBERATELY_ABSENT)).toEqual(['liquidity_trap']);
    for (const reason of Object.values(DELIBERATELY_ABSENT)) {
      expect(reason.length).toBeGreaterThan(40);
    }
  });
});
