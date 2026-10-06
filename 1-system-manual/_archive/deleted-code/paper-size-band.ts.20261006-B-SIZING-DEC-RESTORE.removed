/**
 * B-SIZING-DEC-RESTORE increment 3 — P4 / obj-14: KEEP EACH PAPER TRADE NEAR $140-150 AS THE BALANCE MOVES.
 *
 * Kyle's PAPER-RESET-3000 (as corrected 2026-09-29): one $3,000 pot, about 20 trades open, each sized by the
 * max-position % so it lands near $140-150; the % is MONITORED and ADJUSTED by hand as the balance moves. This is the
 * monitor. It computes the NORMAL-POSTURE, QUANT-POOL, PRE-COVARIANCE size the sizer would give a trade right now —
 *   size = getPortfolioBalanceV2('paper') × e/100 × p/100 × buffer
 * (active-position-sizing.ts: budget = balance × e, trade = budget × p, × the 0.97 buffer) — and raises ONE alert per
 * paper anchor version, direction and p* bucket (`bandDedupeKey`) when it leaves the band, naming the `p` that would
 * restore the target, stamped with the instant and balance it was computed at.
 *
 * ⚠️ IT IS NOT A CLAIM THAT EVERY TRADE IS $140-150 (Langston §15.2): correlation scaling and the pattern-pool cap can
 * make an individual trade smaller. It watches the size the % SETS, which is what Kyle adjusts.
 * ★ It is the ONLY check that sees DOLLARS, on both sides (Langston §15.4 G1 (i)): the position-% floor of 1 is
 * headroom, not a micro-position guard, and nothing refuses an upper typo (50 for 5). An undone reset drops the size to
 * ~$39.97 and fires `low` on the next close or start (tripwire A, §13.4).
 * ⛔ The band values are `module_constants` rows (`paper_size_band`: low, high, target), read FAIL-HARD. The fail-hard
 * is at BOOT (server/index.ts, beside the RTB cadence check — §16.4 C1); on the close seam and at engine start this
 * runs fire-and-forget and only LOGS a failure, so the band alert can never take the close path down.
 * `target` is NOT a band member: it feeds only the p* suggestion (§16.4 C2).
 */
import { getCachedNumberRequired } from './module-constants-service.js';
import { tradeNotional } from './active-position-sizing.js';

const GLOBAL_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as const;

export interface PaperSizeBand {
  low: number;
  high: number;
  target: number;
}

/** Fail-hard read of the three rows (throws on a missing row — boot turns that into a refusal to start). */
export function readPaperSizeBand(): PaperSizeBand {
  return {
    low: getCachedNumberRequired('paper_size_band', 'low', GLOBAL_KEY),
    high: getCachedNumberRequired('paper_size_band', 'high', GLOBAL_KEY),
    target: getCachedNumberRequired('paper_size_band', 'target', GLOBAL_KEY),
  };
}

export interface BandEvaluation {
  status: 'in' | 'low' | 'high' | 'unreadable';
  size: number;
  /** The max-position % that would put the normal size exactly on the target. */
  pStar: number;
}

/**
 * Pure. `balance`, `e` (max total exposure %) and `p` (max position %) as stored; `buffer` the sizer's 0.97.
 * Any non-finite or non-positive input is `unreadable` — never guessed into a band verdict.
 */
export function evaluatePaperSizeBand(
  input: { balance: number; e: number; p: number; buffer: number },
  band: PaperSizeBand,
): BandEvaluation {
  const { balance, e, p, buffer } = input;
  const ok = [balance, e, p, buffer].every((v) => Number.isFinite(v) && v > 0);
  if (!ok) return { status: 'unreadable', size: NaN, pStar: NaN };
  // B-SIZING-DEC-RESTORE increment 2c: the sizer's own formula (`tradeNotional`), not a copy of it.
  const size = tradeNotional(balance, e, p, buffer);
  const pStar = (band.target / (balance * (e / 100) * buffer)) * 100;
  if (size < band.low) return { status: 'low', size, pStar };
  if (size > band.high) return { status: 'high', size, pStar };
  return { status: 'in', size, pStar };
}

/**
 * Evaluate the live paper size and alert when it leaves the band. Paper only. Called on the close seam and once at
 * engine start, both fire-and-forget; an `unreadable` input is LOGGED loudly and raises nothing (a missing guardrail
 * row is the guardrail readers' alarm, not this one's).
 */
export async function checkPaperSizeBand(trigger: 'close' | 'engine_start'): Promise<BandEvaluation> {
  const { getPortfolioBalanceV2 } = await import('./guardrail-settings.js');
  const { storage } = await import('../storage.js');
  const band = readPaperSizeBand();
  const balance = await getPortfolioBalanceV2('paper');
  const g = await storage.getGuardrailsV2({ mode: 'paper' });
  const e = parseFloat(String(g?.maxTotalExposurePct));
  const p = parseFloat(String(g?.maxPositionPercentPct));
  const buffer = getCachedNumberRequired('active_sizing', 'max_position_buffer_factor', GLOBAL_KEY);
  const r = evaluatePaperSizeBand({ balance, e, p, buffer }, band);

  if (r.status === 'unreadable') {
    console.error(`[PaperSizeBand][UNREADABLE] trigger=${trigger} balance=${balance} e=${e} p=${p} buffer=${buffer} — no band verdict`);
    return r;
  }
  console.log(`[PaperSizeBand][${r.status.toUpperCase()}] trigger=${trigger} size=$${r.size.toFixed(2)} band=$${band.low}-$${band.high} balance=$${balance.toFixed(2)} e=${e}% p=${p}% p*=${r.pStar.toFixed(2)}%`);
  if (r.status === 'in') return r;

  const { getAnchorState } = await import('./portfolio-anchor-service.js');
  const anchor = await getAnchorState('paper');
  const anchorVersion = anchor?.anchorVersion ?? 'unknown';
  const side = r.status === 'low' ? 'below' : 'above';
  const at = new Date();
  const { addAlert } = await import('./system-alerts.js');
  await addAlert({
    triggers_at: at,
    category: 'reminder',
    severity: 'warning',
    title: `Paper trade size $${r.size.toFixed(2)} is ${side} the $${band.low}-$${band.high} band — set max position % to ${r.pStar.toFixed(2)}`,
    body: `As at ${at.toISOString()}, balance $${balance.toFixed(2)}: the size the paper max-position % gives a normal `
      + `trade is $${r.size.toFixed(2)}, ${side} the $${band.low}-$${band.high} band Kyle set for PAPER-RESET-3000 (target `
      + `$${band.target}). Object: the normal-posture, quant-pool, pre-covariance size = balance x exposure ${e}% x `
      + `position ${p}% x buffer ${buffer}. Not every trade is this size: correlation scaling and the pattern-pool cap can `
      + `make an individual trade smaller. To restore $${band.target}, set Max Position Percent to ${r.pStar.toFixed(2)}% `
      + `(paper guardrails). ⚠️ This suggestion is as at the instant above; the balance moves on every close, so if this `
      + `alert has sat a while, a newer one with a fresher % supersedes it. Trigger: ${trigger}; paper anchor version `
      + `${anchorVersion}. RESOLVE it once the % is adjusted. Owner: CC-C through the sprint (obj-14).`,
    dedupe_key: bandDedupeKey(anchorVersion, r.status, r.pStar, band),
  });
  return r;
}

/**
 * The alert's dedupe key: one alert per anchor version, direction AND p* BUCKET (Langston, increment 3 Step 4
 * condition 1). Without the bucket, a dedupe hit returns the first alert unchanged (`system-alerts.ts` `addAlert`), so
 * its p* — the alert's only actionable number — froze at the first fire while the pot kept moving; acting on it could
 * leave the size out of band with the key still suppressed.
 * ★ THE BUCKET WIDTH IS THE BAND'S OWN WIDTH, so no new constant: buckets are geometric with ratio high/low (150/140 ⇒
 * ~7.1%), i.e. a fresh alert mints when the suggested p* has moved by about as much as the band is wide — the smallest
 * move that changes what Kyle should set. A p* that is not a finite positive number keys to 'x' (never reached: an
 * unreadable input raises no alert).
 */
export function bandDedupeKey(anchorVersion: number | string, status: 'low' | 'high', pStar: number, band: PaperSizeBand): string {
  const ratio = band.high / band.low;
  const bucket = Number.isFinite(pStar) && pStar > 0 && ratio > 1 ? Math.floor(Math.log(pStar) / Math.log(ratio)) : 'x';
  return `paper-size-band:${anchorVersion}:${status}:p${bucket}`;
}
