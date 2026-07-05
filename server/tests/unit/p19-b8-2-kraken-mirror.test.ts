// P19-B8.2 (OBJ-1) — the Kraken-mirror balance derivation. Mock-API coverage of
// the pin (pre-audit §5, REVISED at Step-7 on live evidence — #435): the mirror
// figure = free USD (ZUSD/USD) + the USD-pegged stablecoins the universe admits
// as quote currencies (USDT/USDC, 1:1, labeled stablecoin in the display);
// non-pegged/non-admitted assets (DAI, EURT, crypto, xStock tokens) appear in
// the breakdown but are NEVER summed; every failure shape THROWS (fail-hard —
// the start flow refuses, no fallback figure exists anywhere).
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
  it('sums USD cash + admitted USD-pegged stablecoins; everything else displayed-not-summed', async () => {
    mockGetAccountBalance.mockResolvedValue({
      ZUSD: '850.25',
      USD: '27.75',
      USDT: '500.00',
      USDC: '10.00',
      DAI: '75.00',   // stablecoin but NOT an admitted quote — displayed, not summed
      EURT: '40.00',  // EUR-pegged — displayed, not summed
      XXBT: '0.015',
      XETH: '0',
    });
    const r = await getKrakenMirrorBalance();
    expect(r.mirrorBalanceUsd).toBeCloseTo(1388.0, 2); // 850.25+27.75+500+10
    const byAsset = Object.fromEntries(r.breakdown.map((b) => [b.asset, b]));
    expect(byAsset.USDT.kind).toBe('stablecoin'); // honest label even though counted
    expect(byAsset.USDT.deployable).toBe(true);
    expect(byAsset.USDC.deployable).toBe(true);
    expect(byAsset.DAI.deployable).toBe(false);
    expect(byAsset.EURT.deployable).toBe(false);
    expect(byAsset.XXBT.kind).toBe('other');
    expect(byAsset.XXBT.deployable).toBe(false);
    // zero-balance assets omitted from the display
    expect(byAsset.XETH).toBeUndefined();
  });

  it('the REAL-account shape (live 2026-07-05): all-USDC balance counts — the strict ZUSD-only pin would have refused', async () => {
    mockGetAccountBalance.mockResolvedValue({ 'USDC': '824.110024', 'NVDAx.T': '0.055761' });
    const r = await getKrakenMirrorBalance();
    expect(r.mirrorBalanceUsd).toBeCloseTo(824.11, 2);
    const byAsset = Object.fromEntries(r.breakdown.map((b) => [b.asset, b]));
    expect(byAsset['NVDAx.T'].deployable).toBe(false);
  });

  it('an account with only non-pegged assets yields mirror 0 (the start flow refuses on <= 0)', async () => {
    mockGetAccountBalance.mockResolvedValue({ XXBT: '0.5', EURT: '100.00' });
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
