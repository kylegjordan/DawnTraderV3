import { beforeEach, describe, expect, it, vi } from 'vitest';

// 2026-11-04 pool jam: every transaction in the bar-availability module must set a
// server-side statement timeout below the pool's 30 s client timeout as its FIRST
// statement, and the certificate repair must be single-flight.
const state = vi.hoisted(() => ({
  statements: [] as string[][],
  releaseRepairRead: null as null | (() => void),
  transactionCalls: 0,
}));

function render(query: unknown): string {
  return JSON.stringify(query);
}

vi.mock('../../db.js', () => ({
  db: {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      state.transactionCalls += 1;
      const log: string[] = [];
      state.statements.push(log);
      const tx = {
        execute: async (query: unknown) => {
          const text = render(query);
          log.push(text);
          if (text.includes('visible_by IS NULL')) {
            // Hold the repair's read open until the test releases it.
            await new Promise<void>((resolve) => { state.releaseRepairRead = resolve; });
            return { rows: [] };
          }
          return { rows: [] };
        },
      };
      return work(tx);
    },
  },
}));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: vi.fn() }));

import {
  XSTOCK_TX_STATEMENT_TIMEOUT_MS,
  repairPendingXstockCertificates,
} from '../../services/passive-archive/xstock-bar-availability.js';

beforeEach(() => {
  state.statements = [];
  state.releaseRepairRead = null;
  state.transactionCalls = 0;
});

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise((r) => setTimeout(r, 0));
  expect(check()).toBe(true);
}

describe('bar-availability pool safety (2026-11-04 jam)', () => {
  it('keeps the server-side ceiling strictly below the pool client timeout of 30 s', () => {
    expect(XSTOCK_TX_STATEMENT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(XSTOCK_TX_STATEMENT_TIMEOUT_MS).toBeLessThan(30_000);
  });

  it('sets SET LOCAL statement_timeout as the first statement of the repair transaction', async () => {
    const run = repairPendingXstockCertificates();
    await until(() => state.releaseRepairRead !== null);
    state.releaseRepairRead!();
    await expect(run).resolves.toBe(0);
    expect(state.statements).toHaveLength(1);
    expect(state.statements[0][0]).toContain(`SET LOCAL statement_timeout = ${XSTOCK_TX_STATEMENT_TIMEOUT_MS}`);
    expect(state.statements[0][1]).toContain('visible_by IS NULL');
  });

  it('joins a repair already in flight instead of starting a second one', async () => {
    const first = repairPendingXstockCertificates();
    const second = repairPendingXstockCertificates();
    expect(second).toBe(first);
    await until(() => state.releaseRepairRead !== null);
    state.releaseRepairRead!();
    await Promise.all([first, second]);
    expect(state.transactionCalls).toBe(1);

    // After it finishes, the next call starts a fresh run.
    state.releaseRepairRead = null;
    const third = repairPendingXstockCertificates();
    expect(third).not.toBe(first);
    await until(() => state.transactionCalls === 2 && state.releaseRepairRead !== null);
    state.releaseRepairRead!();
    await third;
  });
});
