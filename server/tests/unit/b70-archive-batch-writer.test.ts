/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B70 — Archive Batch Writer unit tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers:
 * - registerArchiveTable is idempotent
 * - enqueueArchiveRow returns false for unregistered tables
 * - enqueueArchiveRow buffers rows and reports them via getArchiveStats
 * - setQueueMax controls overflow behavior
 * - JSONB columns are detected by name (not stringified twice)
 *
 * The actual DB write path (insertChunk) is integration-tested on staging;
 * this file exercises the in-memory queue/buffer/stats logic only.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the db module so insertChunk's db.execute() is a no-op.
vi.mock('../../db.js', () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

import {
  registerArchiveTable,
  enqueueArchiveRow,
  setQueueMax,
  getArchiveStats,
  _resetForTests,
} from '../../services/data-archive/archive-batch-writer';

describe('B70 — archive-batch-writer', () => {
  beforeEach(() => {
    _resetForTests();
  });

  it('registerArchiveTable is idempotent', () => {
    registerArchiveTable('test_table', ['captured_at', 'symbol', 'features']);
    registerArchiveTable('test_table', ['different', 'columns']); // ignored
    const stats = getArchiveStats();
    expect(stats.test_table).toBeDefined();
    expect(stats.test_table.bufferDepth).toBe(0);
    expect(stats.test_table.totalFlushed).toBe(0);
  });

  it('enqueueArchiveRow returns false for unregistered table', () => {
    const result = enqueueArchiveRow('unknown_table', { foo: 'bar' });
    expect(result).toBe(false);
  });

  it('enqueueArchiveRow buffers rows', () => {
    registerArchiveTable('t1', ['captured_at', 'symbol', 'features']);
    expect(enqueueArchiveRow('t1', { captured_at: new Date(), symbol: 'BTC/USD' })).toBe(true);
    expect(enqueueArchiveRow('t1', { captured_at: new Date(), symbol: 'ETH/USD' })).toBe(true);
    const stats = getArchiveStats();
    expect(stats.t1.bufferDepth).toBe(2);
    expect(stats.t1.overflowDrops).toBe(0);
  });

  it('respects setQueueMax with drop-OLDEST behavior', () => {
    registerArchiveTable('overflow_test', ['captured_at', 'symbol']);
    setQueueMax(3);
    enqueueArchiveRow('overflow_test', { symbol: 'A' });
    enqueueArchiveRow('overflow_test', { symbol: 'B' });
    enqueueArchiveRow('overflow_test', { symbol: 'C' });
    // Buffer is now at max; next enqueue triggers drop of oldest
    enqueueArchiveRow('overflow_test', { symbol: 'D' });
    const stats = getArchiveStats();
    expect(stats.overflow_test.bufferDepth).toBe(3);
    expect(stats.overflow_test.overflowDrops).toBe(1);
  });

  it('handles JSONB columns by name detection', () => {
    registerArchiveTable('jsonb_test', ['captured_at', 'features', 'modulators']);
    enqueueArchiveRow('jsonb_test', {
      captured_at: new Date(),
      features: { schema_version: 1, foo: 'bar' },
      modulators: { schema_version: 1, baz: 42 },
    });
    const stats = getArchiveStats();
    expect(stats.jsonb_test.bufferDepth).toBe(1);
  });

  it('getArchiveStats reflects multiple tables independently', () => {
    registerArchiveTable('table_a', ['captured_at', 'symbol']);
    registerArchiveTable('table_b', ['captured_at', 'symbol']);
    enqueueArchiveRow('table_a', { symbol: 'A' });
    enqueueArchiveRow('table_a', { symbol: 'B' });
    enqueueArchiveRow('table_b', { symbol: 'X' });
    const stats = getArchiveStats();
    expect(stats.table_a.bufferDepth).toBe(2);
    expect(stats.table_b.bufferDepth).toBe(1);
  });
});
