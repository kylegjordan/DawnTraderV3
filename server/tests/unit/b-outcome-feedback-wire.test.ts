/**
 * B-OUTCOME-FEEDBACK-WIRE (#602) — unit fence, r2 (Langston Step-4 A–F folded).
 *
 * The defect: `(position as any).regime` read a column `activeOpenPositions`
 * never declared, so the B67.4 close-hook gate failed on every active close and
 * the active path never wrote the outcome-learning store (whole-store census at
 * the pre-audit: 13/13 entries `vts_`-prefixed, zero `paper_sim_`).
 *
 * r1's helper-function tests were the "fence asserting a literal against
 * itself" trap in new clothes (Langston Step-4 B): re-implementations of the
 * edit expressions, revert-blind. This r2 pins the SOURCE (the repo's SRC()
 * fence form, per p19-b-rename-w2-persisted-fence.test.ts) so a revert of
 * either edit fails at CI, and the store round-trip control uses SYNTHETIC
 * dims that no running engine ever constructs (Step-4 A: `updateEma`
 * unconditionally saveToDisk()s — a canonical-label tuple written from a test
 * run in the deploy dir would inject a synthetic sample into the live store
 * and clobber concurrent writes; parity is a property of the KEY BUILDER, not
 * of the label strings).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  outcomeFeedbackStore,
  type LearningSource,
} from '../../core/metrics/outcome-feedback-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel: string) => readFileSync(path.resolve(__dirname, '../../..', rel), 'utf-8');

describe('B-OUTCOME-FEEDBACK-WIRE #602 (source fences)', () => {
  it('WRITE fence: the at-entry metadata block stamps regimeAtOpen from the MCE context accessor — NOT from signal.metadata.regime (the strategy-stamped pseudo-label space)', () => {
    const s = SRC('server/services/active-execution-engine.ts');
    // The stamp reads the same accessor the orchestrator read side uses.
    expect(s).toMatch(/regimeAtOpen:\s*_b67_2_1_ctx\?\.regime\.regime\s*\?\?\s*null/);
    // And the pseudo-label source is structurally out: nothing assigns the new
    // key from signal metadata. (This is what makes 'counter-trend' /
    // 'decorrelated-hedge' unreachable — Step-4 D, converted from the r1
    // decoration test to the source pin that actually proves it.)
    expect(s).not.toMatch(/regimeAtOpen:\s*[^,\n]*signal\.metadata/);
  });

  it('READ fence: the B67.4 close-hook reads metadata.regimeAtOpen and the dead (position as any).regime cast is gone from the hook', () => {
    const s = SRC('server/services/active-execution-engine.ts');
    expect(s).toMatch(/const regimeAtOpen = \(position\.metadata as Record<string, unknown> \| null\)\?\.\['regimeAtOpen'\] as string \| undefined/);
    // The old dead read must not return to the hook. The ONE remaining
    // `(position as any).regime` in the file is the :1561 TEC-context field —
    // ruled disposition (4) REMOVE, homed at B-TEC-REGIME-PARAM-REMOVAL, and
    // deliberately untouched by this batch. Pin the count so a regression
    // (re-adding the dead read to the hook) and the follow-up removal are both
    // visible here.
    const deadCasts = s.match(/\(position as any\)\.regime/g) ?? [];
    expect(deadCasts.length).toBe(1);
  });

  it('SKIP-INSTRUMENTATION fence: the gate has a plain else naming which condition failed (Step-4 F — the non-finite-pnl leg must not fall through silently)', () => {
    const s = SRC('server/services/active-execution-engine.ts');
    expect(s).toMatch(/\[B67\.4\]\[feedback\] skip:/);
    // The skip branch is a plain else (covers BOTH failing legs), not
    // `else if (!regimeAtOpen)` which left non-finite netPnlPercent silent.
    expect(s).not.toMatch(/else if \(!regimeAtOpen\)/);
  });
});

describe('B-OUTCOME-FEEDBACK-WIRE #602 (store round-trip control — synthetic dims)', () => {
  // Step-4 C relabel: this is a KEY-BUILDER ROUND-TRIP CONTROL, kept because
  // the key shape has changed three times (outcome-feedback-store.ts:124-133).
  // It is NOT the engine↔orchestrator parity proof — that is the structural
  // same-accessor read Langston derived at the sites (Step-4 ruling), plus the
  // two SRC fences above.
  it('a write is found by a peek over the same four dims, and an unwritten tuple returns undefined (synthetic, non-collidable labels — Step-4 A)', () => {
    const source: LearningSource = 'paper_sim';
    // Synthetic regime + strategy: no engine, orchestrator, or MCE ever
    // constructs these, so even a run inside the deploy dir cannot collide
    // with (or be read back into) live tuples.
    const SYNTH_REGIME = 'SYNTH_REGIME_602_FENCE';
    const SYNTH_STRATEGY = 'synth_strategy_602_fence';

    outcomeFeedbackStore.updateEma(source, 'crypto_spot', SYNTH_REGIME, SYNTH_STRATEGY, 1.25, 0.2, Date.now(), 0);

    const entry = outcomeFeedbackStore.peek('paper_sim', 'crypto_spot', SYNTH_REGIME, SYNTH_STRATEGY);
    expect(entry).toBeDefined();
    expect(entry!.sample_count).toBeGreaterThan(0);

    // Negative control: the instrument can return absent.
    expect(outcomeFeedbackStore.peek('paper_sim', 'crypto_spot', SYNTH_REGIME, 'never_written_602')).toBeUndefined();
  });
});
