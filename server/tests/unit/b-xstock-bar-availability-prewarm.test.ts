import { beforeEach, describe, expect, it, vi } from 'vitest';

const { preview, prewarm } = vi.hoisted(() => ({
  preview: vi.fn(),
  prewarm: vi.fn(),
}));

vi.mock('../../asset_classes/xstock_spot/availability-aggregator.js', () => ({
  previewAvailableXstockOHLC: preview,
}));
vi.mock('../../services/xstock-ohlc-cache.js', () => ({
  xstockOhlcCache: { prewarmAvailabilitySnapshot: prewarm },
}));

import { runPrewarm } from '../../../scripts/b-new-34b-prewarm-snapshot.js';

beforeEach(() => {
  preview.mockReset();
  prewarm.mockReset();
});

describe('B-XSTOCK-BAR-AVAILABILITY restart/prewarm contract', () => {
  it('uses the exact availability prewarm for both snapshot intervals', async () => {
    prewarm
      .mockResolvedValueOnce({
        bucketsRead: 3,
        eligibleBuckets: 2,
        ineligibleBuckets: 1,
        snapshotRowsWritten: 2,
      })
      .mockResolvedValueOnce({
        bucketsRead: 5,
        eligibleBuckets: 4,
        ineligibleBuckets: 1,
        snapshotRowsWritten: 4,
      });

    const result = await runPrewarm({ symbols: ['CORZ/USD'], lookbackDays: 14 });
    expect(prewarm.mock.calls).toEqual([
      ['CORZ/USD', 60, 336],
      ['CORZ/USD', 15, 336],
    ]);
    expect(preview).not.toHaveBeenCalled();
    expect(result.totalBuckets).toBe(8);
    expect(result.totalUpserts).toBe(6);
    expect(result.ineligibleBuckets).toBe(2);
    expect(result.symbolErrors).toBe(0);
  });

  it('keeps dry-run on the read-only preview and performs no snapshot write', async () => {
    preview.mockResolvedValue(new Map([[
      'CORZ/USD',
      [
        { eligibilityState: 'eligible_certified' },
        { eligibilityState: 'metadata_unknown_legacy' },
      ],
    ]]));

    const result = await runPrewarm({
      symbols: ['CORZ/USD'],
      lookbackDays: 2,
      dryRun: true,
    });
    expect(preview.mock.calls).toEqual([
      [['CORZ/USD'], 60, 48],
      [['CORZ/USD'], 15, 48],
    ]);
    expect(prewarm).not.toHaveBeenCalled();
    expect(result.totalBuckets).toBe(4);
    expect(result.totalUpserts).toBe(2);
    expect(result.ineligibleBuckets).toBe(2);
  });
});
