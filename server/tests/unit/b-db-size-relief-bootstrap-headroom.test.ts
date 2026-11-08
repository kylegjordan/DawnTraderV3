import { afterEach, describe, expect, it, vi } from 'vitest';

// B-DB-SIZE-RELIEF (Langston C-11): the boot headroom gauge must key its threshold on the SHAPE of the child it measured,
// not on the current month. In the interregnum after the cutover migration (dailies pre-created for 2026-12-01..16) the
// farthest child of crypto_spot_ticker_snap / xstock_perp_ticker_snap is a DAILY while the current month (November) is
// still monthly; keying on the month applied the 2-month rule to it and WARNed at every boot.

const h = vi.hoisted(() => ({ farthest: new Map<string, { child: string; end: string }>() }));
const text = (q: any): string => (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join('') : typeof c === 'string' ? c : '')).join('');

vi.mock('../../db.js', () => ({
  db: {
    execute: vi.fn(async (q: any) => {
      const t = text(q);
      if (t.includes('pg_get_expr')) {
        const table = (q?.queryChunks ?? []).find((c: any) => typeof c === 'string' && h.farthest.has(c)) as string | undefined;
        const f = table ? h.farthest.get(table) : undefined;
        return { rows: f ? [{ child_name: f.child, partition_bound: `FOR VALUES FROM ('2026-01-01') TO ('${f.end}')` }] : [] };
      }
      return { rows: [{ '?column?': 1 }] }; // every existence probe: present, so no self-heal runs
    }),
  },
}));
vi.mock('../../markets/xstock-grid-refresher.js', () => ({ startXstockGridRefresher: vi.fn() }));
vi.mock('../../services/passive-archive/ticker-batch-writer.js', () => ({ startTickerWriter: vi.fn(), setTickerThrottle: vi.fn(), setTickerThrottleForClass: vi.fn() }));
vi.mock('../../services/passive-archive/equity-spot-archiver.js', () => ({ startEquitySpotArchiver: vi.fn() }));
vi.mock('../../services/passive-archive/equity-perp-archiver.js', () => ({ startEquityPerpArchiver: vi.fn() }));
vi.mock('../../services/passive-archive/crypto-spot-archiver.js', () => ({ startCryptoSpotArchiver: vi.fn() }));
vi.mock('../../services/passive-archive/crypto-perp-archiver.js', () => ({ startCryptoPerpArchiver: vi.fn() }));
vi.mock('../../services/module-constants-service.js', () => ({ getConstant: vi.fn(), prefetchModule: vi.fn() }));
vi.mock('../../services/passive-archive/xstock-bar-availability.js', () => ({ XSTOCK_BAR_WRITER_BOOT_ID: 'test', recordXstockLifecycleFailure: vi.fn(), registerXstockWriterBootStart: vi.fn() }));
vi.mock('../../services/passive-archive/xstock-bar-timing.js', () => ({ startXstockTimingReporter: vi.fn() }));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); h.farthest.clear(); });

describe('passive-archive bootstrap headroom gauge (C-11)', () => {
  it('a pre-created future DAILY (interregnum) is judged by the daily rule — no false 2-month WARN', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T03:00:00Z'));
    h.farthest.set('crypto_spot_ticker_snap', { child: 'crypto_spot_ticker_snap_2026_12_16', end: '2026-12-17' });
    h.farthest.set('xstock_perp_ticker_snap', { child: 'xstock_perp_ticker_snap_2026_12_16', end: '2026-12-17' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { checkPartitionHeadroom } = await import('../../startup/passive-archive-bootstrap.js');
    await checkPartitionHeadroom();
    const warned = warn.mock.calls.map((c) => String(c[0]));
    expect(warned.some((w) => w.includes('crypto_spot_ticker_snap') && w.includes('less than 2 months'))).toBe(false);
    expect(warned.some((w) => w.includes('xstock_perp_ticker_snap') && w.includes('less than 2 months'))).toBe(false);
    expect(log.mock.calls.map((c) => String(c[0])).some((l) => l.includes('crypto_spot_ticker_snap OK (daily)'))).toBe(true);
  });

  it('control: a MONTHLY farthest child under 2 months ahead still WARNs by the monthly rule', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T03:00:00Z'));
    h.farthest.set('crypto_spot_ticker_snap', { child: 'crypto_spot_ticker_snap_2026_12', end: '2027-01-01' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { checkPartitionHeadroom } = await import('../../startup/passive-archive-bootstrap.js');
    await checkPartitionHeadroom();
    expect(warn.mock.calls.map((c) => String(c[0])).some((w) => w.includes('crypto_spot_ticker_snap') && w.includes('less than 2 months'))).toBe(true);
  });
});
