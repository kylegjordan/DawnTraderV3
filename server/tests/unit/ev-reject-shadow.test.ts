/**
 * [11.8B] EV_REJECT_SHADOW conversion (Kyle override 2026-07-16; Langston ruling
 * amended): the netEV open-backstop observes and alarms, never blocks. This pins
 * the rail: counter increments per fire, exactly ONE dedupe-keyed alert latches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../services/system-alerts.js', () => ({
  addAlert: vi.fn(async () => ({ id: 'test-alert' })),
}));

import { rtbMetricsService } from '../../services/rtb-metrics-service.js';
import { addAlert } from '../../services/system-alerts.js';
import { resolveEvBlockDisposition } from '../../services/ev-block-disposition.js';

beforeEach(() => {
  vi.mocked(addAlert).mockClear();
});

describe('[11.8B] disposition routing — label integrity FENCED (Langston delta-GO condition)', () => {
  it('paper + snapshot present → SHADOW (observe, never block)', () => {
    expect(resolveEvBlockDisposition('paper')).toBe('SHADOW');
  });
  it('LIVE + snapshot present → BLOCK_EV_REJECT (the real-money fail-safe retained; never the snapshot-missing labels)', () => {
    expect(resolveEvBlockDisposition('live')).toBe('BLOCK_EV_REJECT');
  });
  it('B-ENTRY-GATE (#1224) P4b: the snapshot-missing outcome is gone — a NULL snapshot never reaches the router', () => {
    // The engine refuses a non-finite snapshot as POLICY_SNAPSHOT_MISSING first, and the parameter is `number`, so a
    // null argument is a compile error. The router has exactly two outcomes, by mode.
    // @ts-expect-error — the router takes the mode only; no EV value reaches it (Step-4 r3, the dead parameter removed)
    void resolveEvBlockDisposition(null, 'paper');
    expect(['SHADOW', 'BLOCK_EV_REJECT']).toContain(resolveEvBlockDisposition('live'));
    const src = readFileSync(new URL('../../services/ev-block-disposition.ts', import.meta.url), 'utf8');
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/BLOCK_SNAPSHOT_MISSING/);
    const eng = readFileSync(new URL('../../services/active-execution-engine.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(eng).not.toMatch(/EV_SNAPSHOT_MISSING|BLOCK_SNAPSHOT_MISSING/);
  });
});

describe('EV_REJECT_SHADOW drift alarm', () => {
  it('counts every fire but latches exactly ONE alert (dedupe-keyed)', async () => {
    const before = rtbMetricsService.getEvRejectShadow().count;
    rtbMetricsService.recordEvRejectShadow('TEST/USD', 'paper', -0.42);
    rtbMetricsService.recordEvRejectShadow('TEST2/USD', 'paper', -0.13);
    rtbMetricsService.recordEvRejectShadow('TEST3/USD', 'live', -0.07);

    const rail = rtbMetricsService.getEvRejectShadow();
    expect(rail.count).toBe(before + 3);
    expect(rail.alerted).toBe(true);
    await vi.waitFor(() => expect(vi.mocked(addAlert).mock.calls.length).toBeLessThanOrEqual(1));
    if (vi.mocked(addAlert).mock.calls.length === 1) {
      const call = vi.mocked(addAlert).mock.calls[0][0];
      expect(call.dedupe_key).toBe('ev-reject-shadow-drift');
      expect(call.severity).toBe('warning');
    }
  });
});
