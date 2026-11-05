/**
 * B-ENTRY-GATE (`#1224`) increment A, P9 — the RTB refresh's two diagnostic files write again.
 *
 * `logRtbTrace` and `logSqeRejection` called `require('fs')` inside an ESM bundle (esbuild `--format=esm`, package
 * `"type": "module"`), so `require` threw into an empty catch and nothing was ever written: staging held no
 * `logs/rtb_refresh_trace_*.log` and no `logs/diagnostics/sqe_rejections.log` on 2026-11-05. They now import `node:fs`.
 * The trace writes STATUS TRANSITIONS only (Directive 8.8.4-A3.R8's intent); an unchanged status is not a line.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const fsCalls = vi.hoisted(() => ({ append: [] as Array<[string, string]>, failNext: false }));
vi.mock('node:fs', async (orig) => {
  const actual = await orig<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: () => true,
    mkdirSync: () => undefined,
    appendFileSync: (p: string, d: string) => {
      if (fsCalls.failNext) { fsCalls.failNext = false; throw new Error('disk full'); }
      fsCalls.append.push([String(p), String(d)]);
    },
  };
});
vi.mock('../../db.js', () => ({ db: {} }));
vi.mock('../../storage', () => ({ storage: { getRtbSignals: vi.fn(async () => []) } }));
vi.mock('../../lib/event-bus', () => ({ eventBus: { onPromotion: () => {}, on: vi.fn(), emit: vi.fn() } }));
vi.mock('../../services/central-clock', () => ({
  centralClock: { subscribe: vi.fn(), unsubscribe: vi.fn(), start: vi.fn(), getTickNumber: () => 0, getIsRunning: () => false },
}));

import { readyToBuyService } from '../../core/rtb/ready_to_buy_service';
const svc = readyToBuyService as unknown as Record<string, (...a: unknown[]) => void>;

beforeEach(() => { fsCalls.append.length = 0; fsCalls.failNext = false; });

describe('P9 — the refresh diagnostics reach the file system under ESM', () => {
  it('a status transition writes one JSON line to logs/rtb_refresh_trace_<date>.log', () => {
    svc.logRtbTrace('paper', 'BTC/USD', 'vwap_pullback', 'reconfirmed', 'deleted', 'SQE_failure');
    expect(fsCalls.append).toHaveLength(1);
    const [path, line] = fsCalls.append[0];
    expect(path).toMatch(/logs[\\/]rtb_refresh_trace_\d{8}\.log$/);
    expect(JSON.parse(line)).toMatchObject({ mode: 'paper', symbol: 'BTC/USD', oldStatus: 'reconfirmed', newStatus: 'deleted', trigger: 'SQE_failure' });
  });
  it('an unchanged status is not a line (no reconfirmed → reconfirmed flood)', () => {
    svc.logRtbTrace('paper', 'BTC/USD', 'vwap_pullback', 'reconfirmed', 'reconfirmed', 'refresh');
    expect(fsCalls.append).toHaveLength(0);
  });
  it('an SQE rejection writes to logs/diagnostics/sqe_rejections.log', () => {
    svc.logSqeRejection({ symbol: 'ETH/USD', strategy: 'pivot_shift', signalId: 's1' }, 'RegimeWeight 0.29 < 0.3', 0.5);
    expect(fsCalls.append).toHaveLength(1);
    expect(fsCalls.append[0][0]).toMatch(/logs[\\/]diagnostics[\\/]sqe_rejections\.log$/);
    expect(JSON.parse(fsCalls.append[0][1])).toMatchObject({ symbol: 'ETH/USD', reason: 'RegimeWeight 0.29 < 0.3', finalScore: '0.5000' });
  });
  it('a failed write is warned once, never thrown into the refresh', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fsCalls.failNext = true;
    expect(() => svc.logSqeRejection({ symbol: 'X/USD', strategy: 's', signalId: 'x' }, 'r', 0)).not.toThrow();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[DIAG_WRITE_FAILED] sqe_rejections'))).toBe(true);
    warn.mockRestore();
  });
  it('no `require(` is left in the module (the defect class)', () => {
    const src = readFileSync(new URL('../../core/rtb/ready_to_buy_service.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\brequire\(/);
  });
});
