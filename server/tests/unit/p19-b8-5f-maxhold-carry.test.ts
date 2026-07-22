/**
 * P19-B8.5f — the max-hold carry (#550) + the close-reason label (OBJ-5).
 *
 * WHAT THIS PROTECTS. `stampMaxHoldingMs` sets `maxHoldingMs` on the RAW signal and its own
 * comment promises the value reaches the execution enforcer. It did not: the sized-signal
 * metadata at `signal-orchestrator.ts:1059-1077` is REBUILT from an explicit field list and
 * never spreads `rawSignal.metadata`, so the key died there and the exit engine's
 * `max_holding_period` branch (`active-execution-engine.ts:1482-1494`) — which is gated on the
 * key being present — was skipped for EVERY position. Measured before the fix: 0 of 15 live
 * positions carried it, and 0 `max_holding_period` closes existed in the entire
 * `closed_trades` history.
 *
 * ★ These are FENCE tests: each one FAILS on the pre-fix code. That is the requirement — a
 * test that passes either way proves nothing about a silent drop.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('P19-B8.5f — max-hold carry through the sized-signal metadata rebuild', () => {
  it('FENCE: the orchestrator metadata rebuild carries maxHoldingMs (the #550 drop point)', () => {
    const src = read('server/services/signal-orchestrator.ts');
    // The rebuild block is the one that spreads _displayContext. The carry must live in it.
    const start = src.indexOf('const sqeSignalInput: SQESignalInput = {');
    expect(start, 'sized-signal construction not found — the anchor moved, re-read the file').toBeGreaterThan(-1);
    const end = src.indexOf('readyToBuyService.queueSQESignal', start);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);

    expect(block, 'the rebuild spreads _displayContext — anchor sanity').toContain('..._displayContext');
    // THE ASSERTION THAT FAILS PRE-FIX:
    expect(block, 'maxHoldingMs must be carried into the sized-signal metadata (#550)').toContain('maxHoldingMs');
  });

  it('FENCE: maxHoldingMs is REQUIRED by the transit contract, so a future omission fails the BUILD', () => {
    const src = read('server/core/rtb/ready_to_buy_service.ts');
    expect(src, 'SQESignalMetadata contract must exist').toContain('interface SQESignalMetadata');
    // Required (no `?`) — this is what makes the compiler, not a human list, the enforcer.
    expect(src, 'maxHoldingMs must be REQUIRED, not optional').toMatch(/maxHoldingMs:\s*number;/);
    // And the input must actually USE the narrowed type rather than the open Record.
    expect(src, 'SQESignalInput.metadata must use the narrowed contract').toMatch(/metadata\?:\s*SQESignalMetadata;/);
    expect(src, 'the open Record<string, unknown> metadata type must be gone — it was the hole')
      .not.toMatch(/metadata\?:\s*Record<string,\s*unknown>;/);
  });

  it('FENCE: the stamp-missing backstop FAILS LOUD rather than defaulting silently', () => {
    const src = read('server/services/signal-orchestrator.ts');
    expect(src, 'a bypass of the central stamp must throw, not coerce').toContain('MAXHOLD_STAMP_MISSING');
    // Guard against the regression this batch exists to prevent: a silent numeric default.
    expect(src, 'must not silently default the max-hold')
      .not.toMatch(/maxHoldingMs\s*[:=]\s*[^;,\n]*\?\?\s*\d/);
  });
});

describe('P19-B8.5f OBJ-5 — the time-exit close reason stops reading UNKNOWN', () => {
  it('FENCE: max_holding_period maps to MAX_HOLD, not UNKNOWN', () => {
    const src = read('server/services/active-execution-engine.ts');
    // THE ASSERTION THAT FAILS PRE-FIX: it mapped to 'UNKNOWN', which was rated LOW risk
    // (SysManual RISK-035) only because the exit had never fired. OBJ-1 makes it fire.
    expect(src, "the time-exit must not label its closes 'UNKNOWN' once it actually fires")
      .not.toMatch(/'max_holding_period':\s*'UNKNOWN'/);
    expect(src, 'max_holding_period must map to MAX_HOLD').toMatch(/'max_holding_period':\s*'MAX_HOLD'/);
  });

  it('MAX_HOLD is a member of the close-reason union in BOTH the map and the event type', () => {
    expect(read('server/services/active-execution-engine.ts'), 'engine map union').toContain("'MAX_HOLD'");
    expect(read('server/services/aj19b-lifecycle-diagnostic.ts'), 'AJ19B event union').toContain("'MAX_HOLD'");
  });
});
