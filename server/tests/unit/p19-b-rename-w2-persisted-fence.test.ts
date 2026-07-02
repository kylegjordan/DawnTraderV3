/**
 * P19-B-RENAME Wave-2 — the PERSISTED-VOCABULARY FENCE (Langston hard condition).
 *
 * The `'paper_sim'` run-mode/source discriminator is a DATA CONTRACT (Langston
 * ruling: keep-as-data, same as the mode axis) — historical rows in the
 * outcome-feedback store + calibration-epoch carry the literal. Wave-2 renamed
 * code identifiers (files/symbols/routes/event keys/module_constants keys) and
 * must NEVER drag the persisted vocabulary with it. These tests read the SOURCE
 * of the persisted-write path and pin the literals, so any future rename that
 * touches them fails at CI, not in the calibration training data.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel: string) => readFileSync(path.resolve(__dirname, '../../..', rel), 'utf-8');

describe('P19-B-RENAME W2 — persisted paper_sim vocabulary is UNTOUCHED (keep-as-data)', () => {
  it('outcome-feedback-store: the LearningSource union still carries the paper_sim literal', () => {
    const s = SRC('server/core/metrics/outcome-feedback-store.ts');
    expect(s).toMatch(/LearningSource\s*=\s*'vts'\s*\|\s*'paper_sim'\s*\|\s*'live'/);
  });

  it('outcome-feedback-store: the SOURCE_PREFIXES key-parser still contains paper_sim_', () => {
    const s = SRC('server/core/metrics/outcome-feedback-store.ts');
    expect(s).toMatch(/SOURCE_PREFIXES\s*=\s*\[\s*'vts_'\s*,\s*'paper_sim_'\s*,\s*'live_'\s*\]/);
  });

  it('b72 warmup: the calibration-epoch source loop still enumerates paper_sim', () => {
    const s = SRC('server/startup/b72-warmup.ts');
    expect(s).toMatch(/\[\s*'vts'\s*,\s*'paper_sim'\s*,\s*'live'\s*\]/);
  });

  it('the persisted vocabulary shares NO source constant with the renamed event keys', () => {
    // The event keys are active_engine_* after Wave-2; the persisted literal is
    // paper_sim. If someone ever centralizes them into one constant, this
    // cross-check fails: the store must not contain any active_engine_ event key.
    const s = SRC('server/core/metrics/outcome-feedback-store.ts');
    expect(s).not.toContain('active_engine_');
  });
});
