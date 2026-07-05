// P19-B8.2 (OBJ-1) — Kraken-mirror starting balance.
//
// The paper engine's 'new'-start balance is the REAL Kraken account's deployable
// USD cash, fetched read-only from the authenticated private Balance endpoint and
// displayed for confirmation — never a typed-in or invented number.
//
// "The balance" (pre-audit §5 pin, REVISED at Step-7 on LIVE evidence — see
// RUNNING_ISSUES #435): the deployable figure = free USD (ZUSD/USD) PLUS the
// USD-PEGGED stablecoins the trading universe itself admits as quote
// currencies (USDT, USDC — exactly `crypto-universe-filter.json` allowedQuotes;
// counted 1:1, each labeled by kind in the display). The original ZUSD-only
// pin assumed stablecoins were an edge case; the first live fetch showed the
// REAL account's entire balance is USDC (824.11) with ZERO free ZUSD — the
// strict pin would have refused every start against Kyle's actual buying
// power. Non-USD-pegged holdings (BTC, ETH, EURT, xStock tokens, …) stay
// displayed-NOT-summed (valuing them needs price marks = failure surface;
// Phase-21 revisits per #435).
//
// FAIL-HARD: any fetch/parse failure THROWS. The start flow refuses to start —
// there is no fallback to a persisted balance or a literal (rule 15 / §5 #10).
// The 'continue' path never calls this module (an outage never blocks resume).

import { KrakenService } from '../exchanges/kraken/kraken';

// One module-scoped instance (S3 discipline — do not add per-call instances;
// the balance fetch is one call per start-new plus the service's own 60s cache).
const kraken = new KrakenService();

/**
 * Asset codes counted 1:1 into the mirror figure: free USD + the USD-pegged
 * stablecoins the universe admits as quote currencies (allowedQuotes parity).
 */
const DEPLOYABLE_USD_CODES = new Set(['ZUSD', 'USD', 'USDT', 'USDC']);

/** Other stablecoins shown distinctly in the breakdown (displayed, never summed —
 * either not USD-pegged (EURT) or not an admitted quote currency). */
const STABLECOIN_CODES = new Set(['DAI', 'USDG', 'PYUSD', 'TUSD', 'EURT']);

export interface KrakenMirrorBalance {
  /** The mirror figure: free USD cash (ZUSD + USD), the paper start balance. */
  mirrorBalanceUsd: number;
  /** Every non-zero holding, for the read-only confirm display. */
  breakdown: Array<{
    asset: string;
    amount: number;
    kind: 'usd_cash' | 'stablecoin' | 'other';
    deployable: boolean;
  }>;
  fetchedAt: string; // ISO
}

/**
 * Fetch the real Kraken account balance and derive the mirror figure.
 * THROWS on any failure (auth, network, unparseable payload) — callers refuse
 * to proceed; they must never substitute a default.
 */
export async function getKrakenMirrorBalance(): Promise<KrakenMirrorBalance> {
  let raw: Record<string, string>;
  try {
    raw = await kraken.getAccountBalance('default');
  } catch (err: any) {
    throw new Error(
      `[B8.2][kraken-mirror] Kraken balance fetch FAILED — paper start refused (no fallback). Cause: ${err?.message ?? err}`
    );
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('[B8.2][kraken-mirror] Kraken Balance returned an empty/unparseable payload — paper start refused.');
  }

  let mirror = 0;
  const breakdown: KrakenMirrorBalance['breakdown'] = [];

  for (const [asset, amountStr] of Object.entries(raw)) {
    const amount = Number.parseFloat(amountStr);
    if (!Number.isFinite(amount)) {
      throw new Error(
        `[B8.2][kraken-mirror] Unparseable balance for asset ${asset} ('${amountStr}') — paper start refused.`
      );
    }
    if (amount === 0) continue;

    const isDeployable = DEPLOYABLE_USD_CODES.has(asset);
    const isTrueCash = asset === 'ZUSD' || asset === 'USD';
    const isStable = (isDeployable && !isTrueCash) || STABLECOIN_CODES.has(asset);
    if (isDeployable) mirror += amount;

    breakdown.push({
      asset,
      amount,
      // Honest labels: USDT/USDC COUNT into the figure but still display as
      // stablecoins — the user sees exactly what their balance is made of.
      kind: isTrueCash ? 'usd_cash' : isStable ? 'stablecoin' : 'other',
      deployable: isDeployable,
    });
  }

  if (mirror < 0) {
    throw new Error(`[B8.2][kraken-mirror] Negative free-USD figure (${mirror}) — paper start refused.`);
  }

  return {
    mirrorBalanceUsd: Math.round(mirror * 100) / 100,
    breakdown: breakdown.sort((a, b) => Number(b.deployable) - Number(a.deployable) || b.amount - a.amount),
    fetchedAt: new Date().toISOString(),
  };
}
