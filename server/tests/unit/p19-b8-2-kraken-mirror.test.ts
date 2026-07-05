// P19-B8.2 (OBJ-1) — the Kraken-mirror balance derivation. Mock-API coverage of
// the pin (pre-audit §5, Langston-agreed): the mirror figure is ZUSD + native
// USD ONLY; stablecoins (USDT/USDC/…) and non-USD assets appear in the display
// breakdown but are NEVER summed; every failure shape THROWS (fail-hard — the
// start flow refuses, no fallback figure exists anywhere).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetAccountBalance } = vi.hoisted(() => ({ mockGetAccountBalance: vi.fn() }));

vi.mock('../../exchanges/kraken/kraken', () => ({
  KrakenService: class {
    getAccountBalance = mockGetAccountBalance;
  },
}));

import { getKrakenMirrorBalance } from '../../services/kraken-mirror-balance';

beforeEach(() => {
  mockGetAccountBalance.mockReset();
});

describe('getKrakenMirrorBalance — the mirror figure', () => {
  it('sums ZUSD + USD only; stablecoins and crypto displayed-not-summed', async () => {
    mockGetAccountBalance.mockResolvedValue({
      ZUSD: '850.25',
      USD: '27.75',
      USDT: '500.00',
      USDC: '10.00',
      XXBT: '0.015',
      XETH: '0',
    });
    const r = await getKrakenMirrorBalance();
    expect(r.mirrorBalanceUsd).toBeCloseTo(878.0, 2);
    const byAsset = Object.fromEntries(r.breakdown.map((b) => [b.asset, b]));
    expect(byAsset.USDT.kind).toBe('stablecoin');
    expect(byAsset.USDT.deployable).toBe(false);
    expect(byAsset.XXBT.kind).toBe('other');
    expect(byAsset.XXBT.deployable).toBe(false);
    // zero-balance assets omitted from the display
    expect(byAsset.XETH).toBeUndefined();
  });

  it('a USD-empty account yields mirror 0 (the start flow refuses on <= 0)', async () => {
    mockGetAccountBalance.mockResolvedValue({ USDT: '5000.00' });
    const r = await getKrakenMirrorBalance();
    expect(r.mirrorBalanceUsd).toBe(0);
  });

  it('THROWS on a fetch failure — never returns a fallback figure', async () => {
    mockGetAccountBalance.mockRejectedValue(new Error('lockout'));
    await expect(getKrakenMirrorBalance()).rejects.toThrow(/refused/i);
  });

  it('THROWS on an unparseable per-asset amount', async () => {
    mockGetAccountBalance.mockResolvedValue({ ZUSD: 'not-a-number' });
    await expect(getKrakenMirrorBalance()).rejects.toThrow(/Unparseable/i);
  });

  it('THROWS on an empty/unparseable payload', async () => {
    mockGetAccountBalance.mockResolvedValue(null);
    await expect(getKrakenMirrorBalance()).rejects.toThrow();
  });
});
