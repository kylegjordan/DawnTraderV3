import { beforeEach, describe, expect, it, vi } from 'vitest';

// 2026-11-04 pool jam: every transaction in the bar-availability module must set a
// server-side statement timeout below the pool's 30 s client timeout as its FIRST
// statement, and the certificate repair must be single-flight.
const state = vi.hoisted(() => ({
  statements: [] as string[][],
  allLogs: [] as string[][],
  releaseRepairRead: null as null | (() => void),
  transactionCalls: 0,
}));

function render(query: unknown): string {
  return JSON.stringify(query);
}

vi.mock('../../db.js', () => ({
  db: {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      // Only the REPAIR READ's transactions are counted and logged: R4 adds a separate global-count
      // transaction after a repair, which these single-flight tests do not measure.
      const log: string[] = [];
      // EVERY transaction's statements are kept here, so the "first statement is SET LOCAL" property
      // is asserted for all of them, including R4's count (Langston R4 PROCEED condition).
      state.allLogs.push(log);
      const tx = {
        execute: async (query: unknown) => {
          const text = render(query);
          log.push(text);
          if (text.includes('SELECT revision_id')) {
            state.transactionCalls += 1;
            state.statements.push(log);
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
  state.allLogs = [];
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
    await until(() => state.releaseRepairRead !== null);
    // Both callers share one run: only one transaction has been opened.
    expect(state.transactionCalls).toBe(1);
    state.releaseRepairRead!();
    await Promise.all([first, second]);
    expect(state.transactionCalls).toBe(1);

    // After it finishes, the next call starts a fresh run.
    state.releaseRepairRead = null;
    const third = repairPendingXstockCertificates();
    await until(() => state.transactionCalls === 2 && state.releaseRepairRead !== null);
    state.releaseRepairRead!();
    await third;
  });

  it('validates the limit before the single-flight gate, even while a repair is running', async () => {
    const running = repairPendingXstockCertificates();
    await until(() => state.releaseRepairRead !== null);
    await expect(repairPendingXstockCertificates(0)).rejects.toThrow(/invalid certificate repair limit/);
    await expect(repairPendingXstockCertificates(10_001)).rejects.toThrow(/invalid certificate repair limit/);
    state.releaseRepairRead!();
    await running;
    expect(state.transactionCalls).toBe(1);
  });

  it('does not serve a caller with a different limit from the running repair', async () => {
    const running = repairPendingXstockCertificates(1_000);
    await until(() => state.releaseRepairRead !== null);
    const other = repairPendingXstockCertificates(50);
    const release = state.releaseRepairRead!;
    state.releaseRepairRead = null;
    release();
    await running;
    // The different-limit caller starts its own run after the first one ends.
    await until(() => state.transactionCalls === 2 && state.releaseRepairRead !== null);
    // Read the repair SELECT itself (statement 0 is the SET LOCAL, whose number could also
    // contain '50'), and check the default limit is absent (Langston R5 r2 record 1).
    expect(state.statements[1][1]).toContain('visible_by IS NULL');
    expect(state.statements[1][1]).toContain('50');
    expect(state.statements[1][1]).not.toContain('1000');
    state.releaseRepairRead!();
    await other;
  });

  it("every transaction a repair opens, including R4's global count, sets SET LOCAL first", async () => {
    const run = repairPendingXstockCertificates();
    await until(() => state.releaseRepairRead !== null);
    state.releaseRepairRead!();
    await run;
    // The repair read plus R4's count transaction (the count runs while a certification row may be open).
    expect(state.allLogs.length).toBeGreaterThanOrEqual(2);
    expect(state.allLogs.some((log) => log.some((t) => t.includes('count(*)')))).toBe(true);
    for (const log of state.allLogs) {
      expect(log[0]).toContain(`SET LOCAL statement_timeout = ${XSTOCK_TX_STATEMENT_TIMEOUT_MS}`);
    }
  });
});
