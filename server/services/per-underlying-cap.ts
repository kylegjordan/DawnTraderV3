/**
 * B67.3 — Per-Underlying Position Limits
 *
 * Caps simultaneous open trades per UNDERLYING (base currency) across the
 * VTS + paper paths. Promoted from `POST_B62_PRE_LAUNCH_PLAN.md` Item 4
 * (paper-only with VTS bypass) to general application per
 * `BATCH_67_SCOPE.md` §5.
 *
 * Rationale: ML doesn't get smarter from 10 simultaneous BTC trades. Those
 * trades have ~95% correlated outcomes — to the learner, that's effectively
 * 1 sample weighted 10x, which is *worse* than 1 sample because it biases
 * the training distribution toward BTC's behavior. Per-underlying
 * diversification improves training quality even in VTS.
 *
 * ── Behavior ───────────────────────────────────────────────────────────────
 *
 * On signal admission:
 *   1. Extract base currency from symbol via fxConversionService.parseSymbol.
 *   2. If signal's pair_id_hash cohort is the CONTROL (cohort 1) AND the A/B
 *      universe-split is active, allow without cap.
 *   3. Otherwise count current open trades sharing the base currency.
 *      If count >= b67_3_max_concurrent_per_underlying, REJECT with
 *      RejectionReason 'PER_UNDERLYING_CAP'.
 *
 * Cohort assignment (from `assignCohortHash`) is deterministic on the
 * symbol so repeated entries on the same pair land in the same cohort.
 * Hash is `crc32(symbol) % 2`.
 *
 * ETH/BTC counts toward the BASE currency only (ETH in this case). Cross-
 * quote correlation (e.g., ETH/BTC pulling on both ETH and BTC concurrent-
 * trade pools) is handled separately in B68.3 pair correlation context.
 *
 * ── Disabled by default at B67.3 ship ───────────────────────────────────────
 *
 * `b67_3_enabled` defaults to FALSE in the migration. Activation flips the
 * flag in module_constants — no code redeploy. Until then, the gate logs
 * what it WOULD have done in shadow mode (visible in PM2) but does not
 * actually reject.
 *
 * Reference: BATCH_67_SCOPE.md §5
 * Schema:    shared/schema.ts :: closedTradesTable.pairIdHash
 * Migration: drizzle/migrations/2026-04-28-b67-3-per-underlying-cap-pair-hash.sql
 */

import { fxConversionService } from './fx-conversion-service.js';
import { getConstant, GLOBAL_KEY } from './module-constants-service.js';

/**
 * Result of a B67.3 admission check. `allowed === false` means the signal
 * must be REJECTED with RejectionReason 'PER_UNDERLYING_CAP'.
 */
export interface PerUnderlyingCapDecision {
  allowed: boolean;
  reason?: 'cap_reached' | 'cap_disabled' | 'control_cohort' | 'no_open_trades';
  baseCurrency: string;
  currentOpenCount: number;
  cap: number;
  cohort: 0 | 1;
  shadowMode: boolean; // true when b67_3_enabled is false; gate is observational only
}

/**
 * Compute deterministic cohort for a symbol. CRC32-based — same symbol always
 * lands in the same cohort. Cohort 0 = treatment (cap enabled). Cohort 1 =
 * control (cap disabled). Designed so the universe is split ~50/50 across
 * the pair set.
 *
 * Uses a simple FNV-1a 32-bit hash for portability — node has no built-in
 * crc32, and pulling in a dependency for one hash is overkill. FNV-1a has
 * good distribution for our purposes.
 */
export function assignCohortHash(symbol: string): 0 | 1 {
  const upper = symbol.toUpperCase();
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < upper.length; i++) {
    hash ^= upper.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return ((hash >>> 0) % 2) as 0 | 1;
}

/**
 * Check whether opening a new trade on `symbol` would breach the per-
 * underlying cap. Caller passes its current set of open-trade symbols
 * (typically the keys of the in-memory open-positions map for VTS, or a
 * SELECT on active_open_positions for paper).
 *
 * @param symbol — pair being evaluated for entry
 * @param openTradeSymbols — symbols of all currently-open trades on the
 *                           same path (do NOT mix paths; VTS and paper have
 *                           separate caps that would otherwise conflate)
 */
export async function checkPerUnderlyingCap(
  symbol: string,
  openTradeSymbols: string[],
): Promise<PerUnderlyingCapDecision> {
  // Resolve module_constants. The `getConstant` calls fall through to the
  // global wildcard rows seeded by the migration. If a row is missing
  // (someone hand-edited the table), default to safe values.
  const enabled =
    (await getConstant<boolean>('per_underlying_cap', 'b67_3_enabled', GLOBAL_KEY)) ?? false;
  const splitActive =
    (await getConstant<boolean>('per_underlying_cap', 'b67_3_universe_split_active', GLOBAL_KEY)) ?? true;
  const cap =
    (await getConstant<number>('per_underlying_cap', 'b67_3_max_concurrent_per_underlying', GLOBAL_KEY)) ?? 2;

  const cohort = assignCohortHash(symbol);
  const shadowMode = !enabled;

  const parsed = fxConversionService.parseSymbol(symbol);
  const baseCurrency = parsed.baseCurrency || symbol;

  // Count concurrent opens that share this base currency. We re-parse each
  // open symbol — performance-acceptable because open-trade lists are
  // bounded (≤ tens, not thousands).
  const matchingOpens = openTradeSymbols.filter((sym) => {
    const otherBase = fxConversionService.parseSymbol(sym).baseCurrency || sym;
    return otherBase.toUpperCase() === baseCurrency.toUpperCase();
  });
  const currentOpenCount = matchingOpens.length;

  // A/B split: if active and this signal is in the control cohort (1), allow.
  if (splitActive && cohort === 1) {
    return {
      allowed: true,
      reason: 'control_cohort',
      baseCurrency,
      currentOpenCount,
      cap,
      cohort,
      shadowMode,
    };
  }

  // Below cap → allow.
  if (currentOpenCount < cap) {
    return {
      allowed: true,
      reason: currentOpenCount === 0 ? 'no_open_trades' : undefined,
      baseCurrency,
      currentOpenCount,
      cap,
      cohort,
      shadowMode,
    };
  }

  // Cap reached. If shadow mode (enabled=false), still allow but flag.
  if (shadowMode) {
    return {
      allowed: true,
      reason: 'cap_disabled',
      baseCurrency,
      currentOpenCount,
      cap,
      cohort,
      shadowMode,
    };
  }

  // Cap reached and enabled — REJECT.
  return {
    allowed: false,
    reason: 'cap_reached',
    baseCurrency,
    currentOpenCount,
    cap,
    cohort,
    shadowMode,
  };
}

/**
 * Format a decision for PM2 log lines. Use at the call site to make
 * shadow-mode observations visible in logs alongside real rejections.
 *
 *   [B67.3] AVAX/USD base=AVAX cohort=0 open=2/2 → REJECTED (cap_reached)
 *   [B67.3] BTC/USD  base=BTC  cohort=1 open=3/2 → allowed (control_cohort)
 *   [B67.3] ETH/USD  base=ETH  cohort=0 open=2/2 → SHADOW would-reject (cap_disabled)
 */
export function formatDecisionLog(symbol: string, d: PerUnderlyingCapDecision): string {
  const head = `[B67.3] ${symbol} base=${d.baseCurrency} cohort=${d.cohort} open=${d.currentOpenCount}/${d.cap}`;
  if (!d.allowed) {
    return `${head} → REJECTED (${d.reason})`;
  }
  if (d.reason === 'cap_disabled' && d.currentOpenCount >= d.cap) {
    return `${head} → SHADOW would-reject (${d.reason})`;
  }
  return `${head} → allowed${d.reason ? ` (${d.reason})` : ''}`;
}
