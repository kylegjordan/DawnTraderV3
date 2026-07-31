/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Equity Spot (xStocks) Archiver
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Persistent WebSocket connection to wss://ws-equities.kraken.com.
 * Subscribes to `ohlc` (interval=1) + `ticker` channels for every symbol in
 * `xstocks-universe.json`. Buffers incoming bars + snapshots into the shared
 * batch writers; flushes every 5s.
 *
 * Auto-reconnect with exponential backoff (1s → 30s cap) on disconnect.
 *
 * Per Langston cc-inbox #867 + #869:
 * - Static universe (no dynamic probe)
 * - Dedicated 2-slot DB pool via batch writers
 * - LAST in bootstrap sequence (non-critical infrastructure)
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import WebSocket from 'ws';
import { loadEquitySpotUniverse } from './universe-loader.js';
import { bufferOhlcBar } from './ohlc-batch-writer.js';
import { bufferTickerSnap } from './ticker-batch-writer.js';
import { makeBackoff, type BackoffPolicy } from './reconnect-policy.js';
// P19-B4a (C3) — silent-stall watchdog deps.
import { addAlert } from '../system-alerts.js';
import { isInXstockWeekendClose, isXstockLiquidFillWindowET } from '../../asset_classes/xstock_spot/market-hours.js';
import { resolveXstockFillSafetyConfig } from '../../asset_classes/xstock_spot/fill-safety-config.js';

const WS_URL = 'wss://ws-equities.kraken.com';
// B69: renamed from 'equity_spot' → 'xstock_spot' (tokenized equity, not real equity)
const ASSET_CLASS = 'xstock_spot' as const;

interface ArchiverState {
  ws: WebSocket | null;
  symbols: string[];
  backoff: BackoffPolicy;
  enabled: boolean;
  reconnectPending: boolean; // P19-B4a (C3): true between scheduleReconnect() and the next open
  lastMsgAt: number;
  /** #594: DATA-liveness. `lastMsgAt` answers "is the socket talking?" (stamped on ANY frame,
   *  correct for the health log it was born for at B74 — see the batch scope). This one answers
   *  "are PRICES arriving?" and is stamped ONLY in the parsers. Seeded at ws-open so "never yet
   *  had a price" can never read as infinitely stale. */
  lastDataMsgAt: number;
  rowsPersistedLastMinute: number;
  rowsPersistedLastMinuteWindowStart: number;
  // B74 v2: cumulative counters for monitor panel
  cumulativeOhlcRows: number;
  cumulativeTickerSnaps: number;
}

const state: ArchiverState = {
  ws: null,
  symbols: [],
  backoff: makeBackoff(30),
  enabled: true,
  reconnectPending: false,
  lastMsgAt: 0,
  lastDataMsgAt: 0,
  rowsPersistedLastMinute: 0,
  rowsPersistedLastMinuteWindowStart: Date.now(),
  cumulativeOhlcRows: 0,
  cumulativeTickerSnaps: 0,
};

export function getEquitySpotStats(): {
  connected: boolean;
  configuredSymbols: number;
  cumulativeOhlcRows: number;
  cumulativeTickerSnaps: number;
} {
  return {
    connected: state.ws?.readyState === WebSocket.OPEN,
    configuredSymbols: state.symbols.length,
    cumulativeOhlcRows: state.cumulativeOhlcRows,
    cumulativeTickerSnaps: state.cumulativeTickerSnaps,
  };
}

function parseOhlcBar(data: any): void {
  if (!data?.symbol || !data?.interval_begin) return;
  state.lastDataMsgAt = Date.now(); // #594: DATA-liveness — after the guard, same rule as parseTickerSnap.
  bufferOhlcBar(ASSET_CLASS, {
    symbol: data.symbol,
    assetClass: ASSET_CLASS,
    exchange: 'kraken-equities',
    intervalBegin: new Date(data.interval_begin),
    open: String(data.open),
    high: String(data.high),
    low: String(data.low),
    close: String(data.close),
    volume: String(data.volume ?? '0'),
    vwap: data.vwap != null ? String(data.vwap) : null,
    tradeCount: data.trades != null ? Number(data.trades) : null,
  } as any);
  state.rowsPersistedLastMinute++;
  state.cumulativeOhlcRows++;
}

// ── P19-B8.5 xSTOCK MARKS (Langston design-APPROVED 2026-07-16) ────────────────
// The exit monitor needs live marks for open xstock positions, and Kraken spot
// REST carries no tokenized equities (see KNOWN_NONEXISTENT_NAMES) — this feed IS
// the venue for the class. Per Langston condition 2 (single source of truth), the
// engine reads THIS archiver's latest-tick view — one WS consumer, one
// subscription lifecycle (universe-wide via XSTOCK_SPOT_SYMBOLS, so there is no
// per-position pin/unpin to manage — condition 3 is satisfied by architecture).
// Staleness judgment belongs to the READER (the engine enforces its blocking
// max-age knob); this map only reports what the feed last said and when.
const latestEquityTick = new Map<string, { price: number; tsMs: number }>();

/** Latest equities-feed tick for an internal symbol ('BIIB/USD'), or null. */
export function getLatestEquityTick(symbol: string): { price: number; tsMs: number } | null {
  return latestEquityTick.get(symbol.toUpperCase()) ?? null;
}

function parseTickerSnap(data: any): void {
  if (!data?.symbol) return;
  // #594: DATA-liveness stamp — AFTER the malformed-payload guard (a junk snap must not count as
  // proof of life) and BEFORE the mark branch (which is conditional on a finite positive mark;
  // stamping inside it would make this parser inconsistent with parseOhlcBar, which has no mark).
  // NOTE (#636): snap-arrival ≠ mark-freshness — the mark write below is CONDITIONAL while this
  // guard is not, so a snap can stamp this clock and write NO mark, leaving `latestEquityTick`
  // (the only venue price source for tokenized equities) ageing while this reads fresh. Mechanism
  // cited, frequency NOT measured. ⚠ Do NOT 'fix' it by moving this stamp into the mark branch —
  // that would make this parser inconsistent with parseOhlcBar, which has no mark at all.
  state.lastDataMsgAt = Date.now();
  // P19-B8.5 xstock marks: mid from bid/ask when both sides exist, else last.
  {
    const _bid = data.bid != null ? Number(data.bid) : NaN;
    const _ask = data.ask != null ? Number(data.ask) : NaN;
    const _last = data.last != null ? Number(data.last) : NaN;
    const _mark = (_bid > 0 && _ask > 0) ? (_bid + _ask) / 2 : _last;
    if (Number.isFinite(_mark) && _mark > 0) {
      latestEquityTick.set(String(data.symbol).toUpperCase(), { price: _mark, tsMs: Date.now() });
    }
  }
  bufferTickerSnap(ASSET_CLASS, {
    symbol: data.symbol,
    assetClass: ASSET_CLASS,
    exchange: 'kraken-equities',
    capturedAt: new Date(),
    bid: data.bid != null ? String(data.bid) : null,
    bidQty: data.bid_qty != null ? String(data.bid_qty) : null,
    ask: data.ask != null ? String(data.ask) : null,
    askQty: data.ask_qty != null ? String(data.ask_qty) : null,
    last: data.last != null ? String(data.last) : null,
    volume24h: data.volume != null ? String(data.volume) : null,
    vwap24h: data.vwap != null ? String(data.vwap) : null,
    high24h: data.high != null ? String(data.high) : null,
    low24h: data.low != null ? String(data.low) : null,
    open24h: data.open != null ? String(data.open) : null,
    prevDayClose: data.prev_day_close != null ? String(data.prev_day_close) : null,
    prevDayVolume: data.prev_day_volume != null ? String(data.prev_day_volume) : null,
    isExtendedHours: data.is_extended_hours ?? null,
    openInterest: data.open_interest != null ? String(data.open_interest) : null,
    fundingRate: null, // n/a for spot
  } as any);
  state.cumulativeTickerSnaps++;
}

// ═════════════════════════════════════════════════════════════════════════════
// B-NEW-44 (2026-05-25) — Diagnostic observability for non-data WS messages.
//
// Pre-existing behavior: handleMessage routed only `channel:'ohlc'` and
// `channel:'ticker'` data messages and silently dropped everything else.
// That made Kraken's subscribe-acknowledgements, errors, and status messages
// invisible — when the ohlc channel went silent on 2026-05-25 we had no way
// to tell whether the subscribe was rejected, accepted-with-warning, or
// accepted-cleanly-but-silent.
//
// This addition surfaces non-data messages for forensic inspection without
// changing routing behavior. Rate-limited per-key (1/60s) per Langston
// review refinement so recurring heartbeats don't flood logs long-term.
//
// PERMANENT observability, not a temporary debug switch. Reference:
// `Claude Comms and Packages/Langston Design Asks/B_NEW_36_XSTOCK_OHLC_DIAGNOSTIC_2026-05-25.md`.
// ═════════════════════════════════════════════════════════════════════════════
const DIAG_NON_DATA_LOG_INTERVAL_MS = 60_000;
const seenNonDataKeys = new Map<string, number>();

function classifyNonDataKey(msg: any): string {
  if (typeof msg?.method === 'string') return `method:${msg.method}`;
  if (msg?.error != null) {
    const code = msg.error.code ?? msg.error.message ?? 'unknown';
    return `error:${String(code)}`;
  }
  if (typeof msg?.channel === 'string') return `channel:${msg.channel}`;
  return 'other';
}

function logDiagNonDataMessage(msg: any): void {
  const key = classifyNonDataKey(msg);
  const now = Date.now();
  const last = seenNonDataKeys.get(key) ?? 0;
  if (now - last < DIAG_NON_DATA_LOG_INTERVAL_MS) return;
  seenNonDataKeys.set(key, now);
  let payload: string;
  try {
    payload = JSON.stringify(msg);
  } catch {
    payload = '<unserializable>';
  }
  const truncated = payload.length > 800 ? `${payload.slice(0, 800)}...[truncated ${payload.length - 800}b]` : payload;
  console.log(`[B74][equity-spot][DIAG] non-data message (key=${key}): ${truncated}`);
}

// Test-only export — allows unit tests to clear rate-limit state between cases.
export function _resetDiagNonDataState(): void {
  seenNonDataKeys.clear();
}

export { logDiagNonDataMessage as _logDiagNonDataMessageForTests };

function handleMessage(raw: WebSocket.RawData): void {
  state.lastMsgAt = Date.now();
  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg.channel === 'ohlc' && Array.isArray(msg.data)) {
    for (const bar of msg.data) parseOhlcBar(bar);
  } else if (msg.channel === 'ticker' && Array.isArray(msg.data)) {
    for (const snap of msg.data) parseTickerSnap(snap);
  } else {
    // B-NEW-44: route everything that isn't an ohlc/ticker data message into
    // the diagnostic logger. Includes subscribe-ack, errors, status updates,
    // and any future channels Kraken introduces.
    logDiagNonDataMessage(msg);
  }
}

function subscribe(ws: WebSocket): void {
  ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ohlc', symbol: state.symbols, interval: 1 },
  }));
  ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ticker', symbol: state.symbols },
  }));
  console.log(`[B74][equity-spot] subscribed to ohlc(1) + ticker for ${state.symbols.length} symbols`);
}

async function connect(): Promise<void> {
  if (!state.enabled) return;
  if (state.ws) {
    try { state.ws.close(); } catch { /* ignore */ }
    state.ws = null;
  }
  const ws = new WebSocket(WS_URL);
  state.ws = ws;

  ws.on('open', () => {
    console.log(`[B74][equity-spot] connected (attempt ${state.backoff.attempts() + 1})`);
    state.backoff.reset();
    state.reconnectPending = false; // P19-B4a (C3): connection restored.
    // #594 BLOCKER FIX (Langston Step-1): seed the DATA clock at connect-open. Without this,
    // an unset `lastDataMsgAt` yields `Infinity` in the watchdog, which is unconditionally
    // > threshold — so a boot or reconnect during a legitimately quiet off-RTH stretch would
    // raise CRITICAL and force `ws.close()`, dropping the only venue price source for xStock
    // marks, then repeat. "Never had data" and "had data, then stopped" are DIFFERENT STATES;
    // seeding here keeps the watchdog measuring the second one only.
    state.lastDataMsgAt = Date.now();
    subscribe(ws);
  });

  ws.on('message', handleMessage);

  ws.on('close', (code, reason) => {
    console.warn(`[B74][equity-spot] disconnected code=${code} reason=${reason.toString()}`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.warn(`[B74][equity-spot] ws error: ${err.message}`);
  });
}

function scheduleReconnect(): void {
  if (!state.enabled) return;
  state.reconnectPending = true; // P19-B4a (C3): so the stall watchdog doesn't race an in-flight reconnect.
  const delay = state.backoff.nextDelayMs();
  console.warn(`[B74][equity-spot] reconnecting in ${delay}ms (attempt ${state.backoff.attempts()})`);
  setTimeout(() => { connect().catch(err => console.error('[B74][equity-spot] reconnect failed:', err)); }, delay);
}

// 60-second health log
setInterval(() => {
  if (!state.enabled) return;
  const now = Date.now();
  const lastMsgAge = state.lastMsgAt > 0 ? now - state.lastMsgAt : -1;
  console.log(
    `[B74][equity-spot] connected=${state.ws?.readyState === WebSocket.OPEN} ` +
    `last_msg_age_ms=${lastMsgAge} rows_persisted_60s=${state.rowsPersistedLastMinute}`
  );
  state.rowsPersistedLastMinute = 0;
  state.rowsPersistedLastMinuteWindowStart = now;
}, 60_000);

// ════════════════════════════════════════════════════════════════════════════
// P19-B4a (C3) — SILENT-STALL WATCHDOG
// ════════════════════════════════════════════════════════════════════════════
// The close-handler only reconnects on a socket `close`. A feed that goes silent
// on an OPEN socket (Kraken stops sending while keeping the connection alive)
// never self-heals — that is audit-4's R1, and it would feed stale prices to an
// active fill. This watchdog catches it.
//
//  - Gated on the 24/5 FEED-LIVE window (`!isInXstockWeekendClose`), NOT the RTH
//    fill window (Langston C3 condition 1): the feed should be live 24/5, so the
//    watchdog must cover 24/5 to protect VTS ingestion too, and only sleeps across
//    the weekend close.
//  - TWO-TIER, DB-resolved threshold: tight in RTH (protect fills; above the
//    measured RTH p99.9 of 28.7s) vs loose off-RTH (above the measured off-RTH
//    p99 of 192s) so it neither misses an RTH stall nor thrashes on legitimately-
//    sparse off-hours gaps.
//  - Forces a reconnect by CLOSING the socket (reuses the existing backoff path —
//    one reconnect path, not two) and raises a dedup'd CRITICAL alert. Skipped
//    when a reconnect is already pending so it can't race the close-handler.
const STALL_WATCHDOG_CHECK_MS = 30_000;

async function raiseStallAlert(ageMs: number, thresholdMs: number, inLiquid: boolean): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'critical',
      title: 'xStock equity feed silent-stall — forcing reconnect',
      body: `The Kraken equity-spot WS socket was OPEN but delivered no data for ${Math.round(ageMs / 1000)}s (threshold ${Math.round(thresholdMs / 1000)}s, inLiquidWindow=${inLiquid}). Forced a reconnect. If this recurs, the upstream feed is degraded — active xStock fills are freshness-gated and will block until ticks resume.`,
      dedupe_key: 'xstock-equity-feed-stall',
    });
  } catch (err) {
    console.error('[B74][equity-spot][STALL] failed to raise stall alert:', err);
  }
}

async function raiseStallConfigMissingAlert(): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'critical',
      title: 'xStock fill-safety config missing — stall watchdog inert',
      body: 'The equity-feed silent-stall watchdog could not resolve its DB thresholds (module_constants xstock_fill_safety). It is inert this cycle (socket-close reconnect still works). Seed the config to restore open-socket stall protection.',
      dedupe_key: 'xstock-fill-safety-config-missing',
    });
  } catch (err) {
    console.error('[B74][equity-spot][STALL] failed to raise config-missing alert:', err);
  }
}

export async function runStallWatchdogTick(now: Date = new Date()): Promise<void> {
  if (!state.enabled) return;
  if (isInXstockWeekendClose(now)) return; // feed legitimately closed — do not watch.
  const safety = await resolveXstockFillSafetyConfig();
  if (!safety) {
    await raiseStallConfigMissingAlert(); // loud + inert this tick (rule-15: no silent default).
    return;
  }
  // #594: threshold the DATA clock, not the any-frame clock. `lastMsgAt` keeps its own stamp site
  // and its health-log consumer, untouched.
  // ⚠ POPULATION NOTE (Langston Step-4 — an earlier version of this comment claimed the constants
  // were 'derived against THIS clock all along'. THAT WAS WRONG, and it was the batch's one
  // load-bearing claim): the seeded thresholds are PER-SYMBOL successive `captured_at` diffs
  // (freshness doc §3, n=6.00M RTH / 1.15M off-RTH). `lastDataMsgAt` is UNIVERSE-WIDE — stamped
  // once per symbol-tick across ~485 symbols — so at ~900K-996K ticks/hr its aggregate
  // inter-arrival is ~4ms against a 75s threshold. DIFFERENT POPULATIONS, ~4 orders apart.
  // WHAT IS ACTUALLY TRUE AND CHECKABLE: the aggregate clock is STRICTLY DENSER than the
  // per-symbol clock the numbers came from ⇒ this change CANNOT make the watchdog fire more often
  // than before. The thresholds are NOT re-derived, and this detects a TOTAL feed stall ONLY.
  // ⇒ partial-stall blindness + aggregate-clock calibration are homed at #635.
  const ageMs = state.lastDataMsgAt > 0 ? Date.now() - state.lastDataMsgAt : Infinity;
  const inLiquid = isXstockLiquidFillWindowET(
    safety.liquidFillWindowOpenMinEt,
    safety.liquidFillWindowCloseMinEt,
    now,
  );
  const threshold = inLiquid ? safety.stallReconnectMsRth : safety.stallReconnectMsOffrth;
  const open = state.ws?.readyState === WebSocket.OPEN;
  if (open && !state.reconnectPending && ageMs > threshold) {
    console.error(
      `[B74][equity-spot][STALL] open socket silent ${Math.round(ageMs)}ms > ${threshold}ms (inLiquid=${inLiquid}) — forcing reconnect`,
    );
    await raiseStallAlert(ageMs, threshold, inLiquid);
    try { state.ws?.close(); } catch { /* close handler → scheduleReconnect (reuses backoff) */ }
  }
}

setInterval(() => { void runStallWatchdogTick(); }, STALL_WATCHDOG_CHECK_MS);

export async function startEquitySpotArchiver(): Promise<void> {
  state.symbols = await loadEquitySpotUniverse();
  if (state.symbols.length === 0) {
    console.warn('[B74][equity-spot] universe is empty; archiver not started');
    return;
  }
  state.enabled = true;
  await connect();
}

export function stopEquitySpotArchiver(): void {
  state.enabled = false;
  if (state.ws) {
    try { state.ws.close(); } catch { /* ignore */ }
    state.ws = null;
  }
}

// P19-B4a (C3) test-only: patch the watchdog-relevant archiver state so unit
// tests can exercise runStallWatchdogTick without a live socket.
export function _setArchiverStateForTest(
  patch: Partial<Pick<ArchiverState, 'enabled' | 'reconnectPending' | 'lastMsgAt' | 'lastDataMsgAt' | 'ws'>>,
): void {
  Object.assign(state, patch);
}
