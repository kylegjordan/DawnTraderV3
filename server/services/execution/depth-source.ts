/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B4b.1 — per-class fill-time DEPTH SOURCE + warmth/sufficiency assessors (OBJ-1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The single fill-time read of "what's on the book right now" for the depth-walked
 * fill + the 24/5 depth-sufficiency gate (#295). Per asset class:
 *   - crypto_spot: the LIVE Kraken WS v2 mini-book (depth=10) via the active adapter
 *     `krakenWebSocketAdapter.getBookForFill` — full 10-level ladder + book age.
 *   - xstock_spot: the latest `xstock_spot_ticker_snap` top-of-book (1 level) — the
 *     same ask/bid sizes that already feed the xStock LQ gates — + captured_at age.
 *
 * Returns `null` when no usable book exists (caller fails-closed). The assessors are
 * PURE (testable) and carry a `reason` string for the loud-block telemetry.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { krakenWebSocketAdapter } from '../../exchanges/kraken/kraken-websocket-adapter.js';
import type { AssetClass } from '../../../shared/asset-classes.js';
import type { BookLevel } from './depth-walk.js';
import { cumulativeNotional, validLevelCount } from './depth-walk.js';
import type { FillDepthGateConfig } from './depth-gate-config.js';

/** B-XSTOCK-BID-TRIGGER-RELAND increment A, P4 ([C5]) — what the NEWEST xStock snapshot row holds on one side. */
export type DepthSideVerdict = 'ok' | 'qty_absent' | 'price_absent';

/** A two-sided book snapshot for a fill, best-first per side, with its age. */
export interface DepthSnapshot {
  asks: BookLevel[]; // ascending (best-first)
  bids: BookLevel[]; // descending (best-first)
  ageMs: number;
  source: 'crypto_ws_book' | 'xstock_ticker_snap';
  /**
   * xStock only (P4): the verdict on the NEWEST snapshot row, per side. Absent on crypto. A caller that may act on the
   * current book (entry, a normal exit fill) must refuse unless both sides are `ok`; see `getDepthSnapshot`.
   */
  verdict?: { bid: DepthSideVerdict; ask: DepthSideVerdict };
  /** xStock only: true when the levels are the last fully two-sided row, returned because the caller asked for it. */
  fromLastTwoSided?: boolean;
}

/**
 * Fetch the current fill-time depth for a symbol+class. `null` when absent
 * (cold/no two-sided book) → caller blocks the open / penalizes the close.
 *
 * ⛔⛔ xSTOCK — B-XSTOCK-BID-TRIGGER-RELAND increment A, P4 ([C5], Langston gate 2). The query used to filter
 * `bid > 0 AND bid_qty > 0 AND ask > 0 AND ask_qty > 0` BEFORE taking the newest row, so a current book with a side
 * missing read as the last complete one. It now reads the NEWEST row unconditionally and returns a per-side `verdict`.
 * MEASURED (7 days, 14,237,109 rows): 21,019 fail the old filter — bid_qty absent 8,579 · both qty absent 6,464 ·
 * ask_qty absent 5,975 · price one-sided 1. So the real population is a MISSING SIZE on a two-sided price book, all
 * extended-hours, clustering at 00:15:00Z — hence `qty_absent` per side, not "one-sided".
 * THREE CONSUMERS, THREE POLICIES: the entry depth gate refuses; a normal exit fill refuses (the position holds);
 * the operator FLATTEN passes `allowLastTwoSided` and gets exactly the old behaviour (the last complete row), so P4 can
 * never newly block an engine stop (B-FEED-MISMATCH-FIX P2 lets a stopped-engine flatten book a cold book).
 * A `qty_absent` side carries its price with qty 0 (so every depth reader sees no size); a `price_absent` side is empty.
 */
export async function getDepthSnapshot(
  symbol: string,
  assetClass: AssetClass,
  opts?: { allowLastTwoSided?: boolean },
): Promise<DepthSnapshot | null> {
  if (assetClass === 'crypto_spot') {
    const book = krakenWebSocketAdapter.getBookForFill(symbol);
    if (!book) return null;
    return { asks: book.asks, bids: book.bids, ageMs: book.ageMs, source: 'crypto_ws_book' };
  }
  if (assetClass === 'xstock_spot') {
    try {
      type Row = { ask: string | null; ask_qty: string | null; bid: string | null; bid_qty: string | null; age_ms: string };
      const first = (res: unknown): Row | undefined => {
        const rows = (res as any).rows ?? (res as unknown as any[]);
        return Array.isArray(rows) ? rows[0] : undefined;
      };
      // P4: the NEWEST row, whatever it holds.
      const r = first(await db.execute<Row>(sql`
        SELECT ask::text, ask_qty::text, bid::text, bid_qty::text,
               EXTRACT(EPOCH FROM (NOW() - captured_at)) * 1000 AS age_ms
        FROM xstock_spot_ticker_snap
        WHERE symbol = ${symbol}
        ORDER BY captured_at DESC
        LIMIT 1
      `));
      if (!r) return null;
      const num = (v: string | null) => (v === null ? NaN : parseFloat(v));
      const ask = num(r.ask), askQty = num(r.ask_qty), bid = num(r.bid), bidQty = num(r.bid_qty);
      const sideVerdict = (price: number, qty: number): DepthSideVerdict =>
        !(price > 0) ? 'price_absent' : !(qty > 0) ? 'qty_absent' : 'ok';
      const verdict = { bid: sideVerdict(bid, bidQty), ask: sideVerdict(ask, askQty) };
      if (verdict.bid === 'ok' && verdict.ask === 'ok') {
        return {
          asks: [{ price: ask, qty: askQty }],
          bids: [{ price: bid, qty: bidQty }],
          ageMs: Math.max(0, parseFloat(r.age_ms) || 0),
          source: 'xstock_ticker_snap',
          verdict,
        };
      }
      if (opts?.allowLastTwoSided) {
        // The flatten's policy: exactly the pre-P4 read (the last complete row), with the newest row's verdict attached.
        const lr = first(await db.execute<Row>(sql`
          SELECT ask::text, ask_qty::text, bid::text, bid_qty::text,
                 EXTRACT(EPOCH FROM (NOW() - captured_at)) * 1000 AS age_ms
          FROM xstock_spot_ticker_snap
          WHERE symbol = ${symbol} AND ask > 0 AND ask_qty > 0 AND bid > 0 AND bid_qty > 0
          ORDER BY captured_at DESC
          LIMIT 1
        `));
        if (!lr) return null;
        const la = num(lr.ask), laq = num(lr.ask_qty), lb = num(lr.bid), lbq = num(lr.bid_qty);
        if (!(la > 0 && laq > 0 && lb > 0 && lbq > 0)) return null;
        return {
          asks: [{ price: la, qty: laq }], bids: [{ price: lb, qty: lbq }],
          ageMs: Math.max(0, parseFloat(lr.age_ms) || 0), source: 'xstock_ticker_snap', verdict, fromLastTwoSided: true,
        };
      }
      return {
        asks: verdict.ask === 'price_absent' ? [] : [{ price: ask, qty: verdict.ask === 'ok' ? askQty : 0 }],
        bids: verdict.bid === 'price_absent' ? [] : [{ price: bid, qty: verdict.bid === 'ok' ? bidQty : 0 }],
        ageMs: Math.max(0, parseFloat(r.age_ms) || 0),
        source: 'xstock_ticker_snap',
        verdict,
      };
    } catch (err) {
      console.error(`[P19-B4b.1][DEPTH_SOURCE] xStock snapshot query threw for ${symbol} — fail-closed (null):`, err);
      return null;
    }
  }
  return null; // no depth feed for other classes
}

/**
 * B-EXIT-PROVENANCE OBJ-3 / `#911` — THE INDEPENDENT WITNESS AT CLOSE.
 *
 * ⛔ WHY THIS IS A SEPARATE READ AND NOT `getDepthSnapshot`, WHICH THE CLOSE PATH ALREADY CALLS.
 * `#741` is an ORDER-BOOK defect. For `crypto_spot` the fill walks `getBookForFill` — the live WS
 * mini-book, i.e. THE SUSPECT. Stamping a cross-check FROM that same book is checking the suspect
 * against its own testimony: it would agree with itself by construction and prove nothing.
 * `crypto_spot_ticker_snap` is written by the ARCHIVER off a SEPARATE socket, so it is a genuinely
 * independent observation of the same instant. That independence is the entire value of the column.
 *
 * ⚠️ AND IT IS NOT INDEPENDENT ON xSTOCK — stated here rather than discovered later (Langston,
 * 2026-08-27). For `xstock_spot` the fill's own depth-walk reads `xstock_spot_ticker_snap`, THE
 * SAME TABLE this function reads. There, the stamp is a CONSISTENCY record — it can catch a stale
 * or mis-keyed read, and it CANNOT corroborate the price against a second feed. Two different
 * epistemic values behind one column name; the schema comment carries the same warning.
 *
 * ⚠️ THE VALUE CARRIES AN ARCHIVE AGE, NOT A LIVE ONE. The archiver writes on its own cadence
 * (measured 2026-08-27: xStock ~4s; crypto 5.0-9.0s across the top 5 symbols, 0 null sides in
 * n≈4,970 over two hours). So this is a lagged witness, and `capturedAtMs` is returned so the lag
 * is READABLE ON THE ROW rather than assumed to be zero. A witness whose staleness is unknown is
 * the `#546` shape; one that reports its own age is not.
 *
 * FAIL-OPEN BY DESIGN: returns `null` on any miss or throw. This is a TELEMETRY cross-check —
 * it must never be able to block or delay a close. Contrast `getDepthSnapshot`, which fails CLOSED
 * because a fill genuinely cannot proceed without depth.
 */
export interface TickerWitness { bid: number; ask: number; capturedAtMs: number; }

export async function getTickerWitness(
  symbol: string,
  assetClass: AssetClass,
): Promise<TickerWitness | null> {
  const table =
    assetClass === 'crypto_spot' ? 'crypto_spot_ticker_snap'
    : assetClass === 'xstock_spot' ? 'xstock_spot_ticker_snap'
    : null;
  if (!table) return null;
  try {
    // Table name is chosen from a closed literal set above — never interpolated from input.
    const res = await db.execute<{ bid: string; ask: string; captured_ms: string }>(
      table === 'crypto_spot_ticker_snap'
        ? sql`SELECT bid::text, ask::text, EXTRACT(EPOCH FROM captured_at) * 1000 AS captured_ms
              FROM crypto_spot_ticker_snap
              WHERE symbol = ${symbol} AND bid > 0 AND ask > 0
              ORDER BY captured_at DESC LIMIT 1`
        : sql`SELECT bid::text, ask::text, EXTRACT(EPOCH FROM captured_at) * 1000 AS captured_ms
              FROM xstock_spot_ticker_snap
              WHERE symbol = ${symbol} AND bid > 0 AND ask > 0
              ORDER BY captured_at DESC LIMIT 1`,
    );
    const rows = (res as any).rows ?? (res as unknown as any[]);
    const r = Array.isArray(rows) ? rows[0] : undefined;
    if (!r) return null;
    const bid = parseFloat(r.bid), ask = parseFloat(r.ask);
    if (!(bid > 0 && ask > 0)) return null;
    return { bid, ask, capturedAtMs: Math.round(parseFloat(r.captured_ms) || 0) };
  } catch (err) {
    // Fail-OPEN and loud: the close proceeds, the columns land NULL, and the reason is on the record.
    console.warn(`[B-EXIT-PROVENANCE][TICKER_WITNESS] ${symbol} (${assetClass}) lookup failed — stamping NULL, close unaffected:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** `kind` is the DISCRIMINATED verdict (B-FEED-MISMATCH-FIX C1, Langston): `reason` is a DISPLAY string that
 *  carries measurements inline (`stale_book age=7231ms>5000ms`), so a consumer that persists or branches on the
 *  verdict must read `kind`, never split `reason`. */
export type WarmthKind = 'warm' | 'no_book' | 'stale_book' | 'thin_book';
export interface WarmthResult { warm: boolean; kind: WarmthKind; reason: string; }

/**
 * Warmth = the book exists, is fresh (age ≤ warmthMaxAgeMs), and has enough valid
 * levels (≥ minLevels) to be a fillable book. Pure. A non-warm result is a loud block.
 */
export function assessWarmth(
  snap: DepthSnapshot | null,
  side: 'asks' | 'bids',
  config: FillDepthGateConfig,
): WarmthResult {
  if (!snap) return { warm: false, kind: 'no_book', reason: 'no_book' };
  if (snap.ageMs > config.warmthMaxAgeMs) {
    return { warm: false, kind: 'stale_book', reason: `stale_book age=${Math.round(snap.ageMs)}ms>${config.warmthMaxAgeMs}ms` };
  }
  const levels = side === 'asks' ? snap.asks : snap.bids;
  const valid = validLevelCount(levels);
  if (valid < config.minLevels) {
    return { warm: false, kind: 'thin_book', reason: `thin_book levels=${valid}<${config.minLevels}` };
  }
  return { warm: true, kind: 'warm', reason: 'warm' };
}

// ── Observable depth-gate block counter (rules 10/11 — a blocked open is never a
//    silent skip). Keyed by `assetClass:reasonKind` so the telemetry shows WHY.
const _gateBlocks = new Map<string, { count: number; lastReason: string; lastAt: number }>();

/** Record a depth-gate open block (observable; never throws). */
export function recordDepthGateBlock(assetClass: string, reason: string): void {
  const kind = reason.split(' ')[0]; // coarse bucket (no_book / stale_book / thin_book / insufficient_depth / ...)
  const key = `${assetClass}:${kind}`;
  const cur = _gateBlocks.get(key) ?? { count: 0, lastReason: '', lastAt: 0 };
  cur.count += 1; cur.lastReason = reason; cur.lastAt = Date.now();
  _gateBlocks.set(key, cur);
}

/** Snapshot the depth-gate block counters (for diagnostics + tests). */
export function getDepthGateBlockStats(): Record<string, { count: number; lastReason: string; lastAt: number }> {
  return Object.fromEntries(_gateBlocks);
}

/** Test-only reset. */
export function _testResetDepthGateBlocks(): void { _gateBlocks.clear(); }

export interface SufficiencyResult { sufficient: boolean; availableNotional: number; reason: string; }

/**
 * Sufficiency (open-side, the EV-knob ratio gate): available depth on the side
 * being consumed ≥ orderNotional × sufficiencyMultiple. Pure.
 */
export function assessSufficiency(
  snap: DepthSnapshot,
  side: 'asks' | 'bids',
  orderNotional: number,
  config: FillDepthGateConfig,
): SufficiencyResult {
  const available = cumulativeNotional(side === 'asks' ? snap.asks : snap.bids);
  const required = orderNotional * config.sufficiencyMultiple;
  return {
    sufficient: available >= required,
    availableNotional: available,
    reason: available >= required
      ? 'sufficient'
      : `insufficient_depth avail=$${Math.round(available)}<required=$${Math.round(required)} (order=$${Math.round(orderNotional)}*${config.sufficiencyMultiple})`,
  };
}
