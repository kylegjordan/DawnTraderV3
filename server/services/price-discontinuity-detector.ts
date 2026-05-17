/**
 * ════════════════════════════════════════════════════════════════════════════
 * B-NEW-42b — Price-Discontinuity Detector (TEC sentinel)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sentinel module consumed by TEC to short-circuit stop-check + target-lock
 * during price discontinuities that are structurally NOT real market movement:
 *
 *   1. **halt_resume_gap** — ticker pauses for >5min and resumes with a price
 *      change of ≥0.5%. The resume tick is a price-discovery discontinuity,
 *      not normal market drift. TEC's naive `currentPrice <= currentStopPrice`
 *      check would fire the stop at the pre-halt level (unfillable in reality).
 *      Detector flags ACTIVE; TEC defers stop check until a confirming tick
 *      arrives within the clearing window.
 *
 *   2. **corp_action** — single-bar price change ≥40% suggests a corporate
 *      action (split, reverse split, special dividend, spin-off). The B79.0L
 *      weekend market-hours gate is the existing partial defense (splits
 *      almost always overnight-effective); detector covers the intra-week
 *      edge case + reverse splits during open window.
 *
 *   3. **ex_dividend** — within the 1-2h pre-market-open window on a known
 *      ex-dividend date. Curated calendar (interim posture per B-NEW-42b
 *      pre-audit §3) until Phase D auto-calendar feed lands.
 *
 * ## Architecture
 *
 * Detector-owned per-symbol state cache. Callers pass current tick context
 * (`symbol`, `currentPrice`, `currentTs`); detector internally tracks prior
 * tick, runs the gap calculation, updates the state machine, and returns
 * `{ active, kind?, details? }`. Cold-start safe: first call per symbol
 * populates the cache and returns inactive (no gap to evaluate yet).
 *
 * ## State machine (halt_resume_gap)
 *
 *   IDLE → (gap>300s AND |Δ%|≥0.5%) → DISCONTINUITY_ACTIVE
 *   DISCONTINUITY_ACTIVE → (next tick within HARD_CEILING AND |Δ%|<0.5% from resume px) → CLEARING
 *   DISCONTINUITY_ACTIVE → HARD_CEILING (300s) elapsed without confirming tick → IDLE (defensive timeout)
 *   CLEARING → next call → IDLE (1-tick confirming, auto-transitions)
 *
 * ## Crypto path
 *
 * Detector returns `{ active: false }` immediately for symbols not in the
 * xStock spot universe. Crypto stop-check behavior unchanged.
 *
 * ## Test coverage
 *
 * `server/tests/unit/b-new-42b-price-discontinuity-detector.test.ts` covers
 * cold-start, halt-resume-gap state machine (active/clearing/hard-ceiling),
 * corp-action threshold, ex-dividend calendar lookup, and the crypto-symbol
 * no-op.
 *
 * Reference: `Claude Comms and Packages/Scope Files/B_NEW_42B_SCOPE.md` rev2.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { XSTOCK_SPOT_SYMBOLS } from '../../shared/asset-classes.js';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type DiscontinuityKind = 'halt_resume_gap' | 'corp_action' | 'ex_dividend' | 'cold_start';

export interface DiscontinuityDetails {
  prevPrice?: number;
  currentPrice?: number;
  prevTs?: Date;
  currentTs?: Date;
  gapSeconds?: number;
  priceChangePct?: number;
  knownExDate?: string;
}

export interface DiscontinuityResult {
  active: boolean;
  kind?: DiscontinuityKind;
  details?: DiscontinuityDetails;
}

// ────────────────────────────────────────────────────────────────────────────
// Configuration (defaults seeded; overridable via module_constants in future
// Phase E calibration, per ADJUSTMENT_FRAMEWORK catalogue)
// ────────────────────────────────────────────────────────────────────────────

// **Constants are HARDCODED in B-NEW-42b** to keep the surgical scope minimal.
// The companion seed migration (`drizzle/migrations/2026-05-17-b-new-42b-
// price-discontinuity-detector-constants.sql`) creates per-asset-class rows
// in `module_constants.price_discontinuity_detector.*` with values matching
// these hardcoded defaults — they exist for **future Phase E calibration**
// when operators want to tune the thresholds without a code redeploy.
// Detector reads from module_constants will be added in a follow-up calibration
// batch using the standard `getModuleConstants` API with wildcard-default
// sentinel pattern (B79.0a `_NO_WINDOW = Infinity` precedent — Langston
// pre-audit rev1 #3). For now, the code is implicitly "defensive against
// pre-migration DB state" because it does not read DB at all.
const HALT_GAP_SECONDS_THRESHOLD = 300;          // >5min gap = halt candidate
const HALT_PCT_THRESHOLD = 0.5;                  // |Δ%| ≥ 0.5% at resume = real gap
const HALT_CLEARING_WINDOW_SECONDS = 30;         // preferred confirming-tick window
const HALT_HARD_CEILING_SECONDS = 300;           // 5min: defensive auto-clear (stateless timestamp check)
const CORP_ACTION_PCT_THRESHOLD = 40;            // |Δ%| ≥ 40% single-bar = corp action
const CORP_ACTION_TTL_SECONDS = 86400;           // 24h persistence
const EX_DIV_PRE_OPEN_WINDOW_HOURS = 2;          // 1-2h pre-market-open block
const SYMBOL_CACHE_STALE_SECONDS = 86400;        // Lazy-eviction: drop entry if no calls in 24h → treat as cold-start
                                                  // (Langston pre-audit rev1 #1: prefer lazy eviction over background sweep
                                                  // or refcount tracking. Bounded universe (~50-100 symbols) makes this cheap.)

// ────────────────────────────────────────────────────────────────────────────
// Per-symbol state
// ────────────────────────────────────────────────────────────────────────────

type DetectorState = 'IDLE' | 'DISCONTINUITY_ACTIVE' | 'CLEARING';

interface SymbolEntry {
  state: DetectorState;
  // Last observed tick (used to compute gap on next call)
  lastPrice: number;
  lastTs: number;            // ms since epoch
  // When DISCONTINUITY_ACTIVE: the price observed at the resume tick (anchor for clearing comparison)
  activeKind?: DiscontinuityKind;
  resumePrice?: number;
  resumeTs?: number;
  // When CORP_ACTION active: expiry timestamp for TTL clearing
  corpActionExpiresAt?: number;
}

const symbolCache = new Map<string, SymbolEntry>();

// ────────────────────────────────────────────────────────────────────────────
// Ex-dividend curated calendar (interim posture per B-NEW-42b §2.1.3)
// ────────────────────────────────────────────────────────────────────────────

interface DividendCalendarEntry {
  symbol: string;
  ex_dates: string[];   // 'YYYY-MM-DD' format
}

let dividendCalendar: Map<string, Set<string>> | null = null;

/**
 * Lazy-load the curated dividend calendar JSON. Called on first ex-dividend
 * check, then cached for the process lifetime.
 */
function loadDividendCalendar(): Map<string, Set<string>> {
  if (dividendCalendar !== null) return dividendCalendar;
  const result = new Map<string, Set<string>>();
  try {
    // Path resolution: from server/services/ to 1-system-manual/audits/b-new-42/
    const calendarPath = join(
      process.cwd(),
      '1-system-manual',
      'audits',
      'b-new-42',
      'dividend-calendar-seed.json',
    );
    const raw = readFileSync(calendarPath, 'utf-8');
    const parsed: { _metadata?: unknown; entries: DividendCalendarEntry[] } = JSON.parse(raw);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    for (const entry of entries) {
      if (typeof entry?.symbol === 'string' && Array.isArray(entry?.ex_dates)) {
        result.set(entry.symbol, new Set(entry.ex_dates));
      }
    }
    console.log(
      `[B-NEW-42b][DIVIDEND_CALENDAR_LOAD] Loaded ${entries.length} symbols ` +
      `from dividend-calendar-seed.json (curated interim posture; Phase D ` +
      `replaces with Yahoo Finance auto-feed).`,
    );
  } catch (err) {
    console.warn(
      `[B-NEW-42b][DIVIDEND_CALENDAR_LOAD_FAIL] Failed to load ` +
      `dividend-calendar-seed.json (treating as empty): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  dividendCalendar = result;
  return result;
}

/**
 * Check if `now` falls within the 1-2h pre-market-open window on a known
 * ex-dividend date for the given symbol.
 *
 * Window definition: NYSE market opens 9:30 ET. Block runs from 2h before
 * (7:30 ET) until market open (9:30 ET) on the ex-date. Uses Intl.DateTimeFormat
 * with America/New_York timezone for DST correctness (same pattern as
 * server/asset_classes/xstock_spot/market-hours.ts).
 */
function isWithinExDividendBlock(symbol: string, nowMs: number): { active: boolean; exDate?: string } {
  const calendar = loadDividendCalendar();
  const symbolExDates = calendar.get(symbol);
  if (!symbolExDates || symbolExDates.size === 0) return { active: false };

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
  const etDate = `${get('year')}-${get('month')}-${get('day')}`;
  const etHour = Number(get('hour'));
  const etMinute = Number(get('minute'));
  const etTotalMinutes = etHour * 60 + etMinute;

  // Block window: 7:30 ET (= 450) through 9:30 ET (= 570). 2h pre-open per
  // v2 plan §0.2.3 specifier.
  const BLOCK_START = (9 - EX_DIV_PRE_OPEN_WINDOW_HOURS) * 60 + 30; // 7:30 ET = 450
  const BLOCK_END = 9 * 60 + 30;                                    // 9:30 ET = 570

  if (etTotalMinutes < BLOCK_START || etTotalMinutes >= BLOCK_END) return { active: false };
  if (!symbolExDates.has(etDate)) return { active: false };

  return { active: true, exDate: etDate };
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Primary entry point — called by TEC's stop-check + target-lock gate sites.
 *
 * @param symbol      Trading symbol (e.g. `AAPL/USD`).
 * @param currentPrice Current observed price.
 * @param currentTs   Current tick timestamp (ms since epoch; defaults to Date.now()).
 *
 * @returns `{ active: false }` if the symbol is not in the xStock universe OR
 *           no discontinuity is currently active. Otherwise `{ active: true,
 *           kind, details }` with details for diagnostic logging.
 *
 * Side effect: updates the per-symbol cache. On cold start (first call per
 * symbol), records the tick and returns inactive (no prior tick to compare).
 */
export function isDiscontinuityActive(
  symbol: string,
  currentPrice: number,
  currentTs: number = Date.now(),
): DiscontinuityResult {
  // 1. Crypto-path no-op: detector only applies to xStock spot symbols.
  if (!XSTOCK_SPOT_SYMBOLS.has(symbol)) {
    return { active: false };
  }

  // 2. Ex-dividend curated-calendar check (independent of tick state).
  const exDivCheck = isWithinExDividendBlock(symbol, currentTs);
  if (exDivCheck.active) {
    return {
      active: true,
      kind: 'ex_dividend',
      details: { currentPrice, currentTs: new Date(currentTs), knownExDate: exDivCheck.exDate },
    };
  }

  // 3. Look up per-symbol state from cache.
  let entry = symbolCache.get(symbol);

  // 3a. Lazy eviction (Langston pre-audit rev1 #1) — if last observed call was
  // more than SYMBOL_CACHE_STALE_SECONDS ago AND we're in IDLE state, drop
  // the entry and treat the current call as cold-start. **Critical:** only
  // evict from IDLE; entries in DISCONTINUITY_ACTIVE or CLEARING must reach
  // their state-machine resolution (TTL/hard-ceiling/clearing tick) regardless
  // of wall-clock staleness — they represent live operational state.
  if (entry && entry.state === 'IDLE' && (currentTs - entry.lastTs) / 1000 > SYMBOL_CACHE_STALE_SECONDS) {
    symbolCache.delete(symbol);
    entry = undefined;
  }

  // 3b. Cold-start fail-safe-skip (Langston pre-audit rev1 #1 NON-NEGOTIABLE):
  //
  // First call per symbol when cache is empty returns ACTIVE with kind='cold_start'.
  // The reasoning: in absence of certainty about prior-tick state, default to
  // safe-skip rather than safe-execute. A process restart at t=0 with a halt
  // landing at t=-5s would otherwise leave the first post-restart tick (a
  // gap-down resume price) executable through `shouldClosePosition` — exactly
  // the unfillable-fill failure mode this batch closes.
  //
  // Cost: one tick of stop-check delay per symbol per cold-start episode.
  // Operationally trivial; symbols see hundreds of ticks per session.
  //
  // The cache populates from this call. Second call onward evaluates normally.
  if (!entry) {
    symbolCache.set(symbol, {
      state: 'IDLE',
      lastPrice: currentPrice,
      lastTs: currentTs,
    });
    console.log(
      `[B-NEW-42b][DETECTOR_COLD_START_SKIP] ${symbol} ` +
      `currentPrice=${currentPrice} — first call per symbol, returning ACTIVE ` +
      `(cold_start fail-safe-skip per pre-audit §3).`,
    );
    return {
      active: true,
      kind: 'cold_start',
      details: { currentPrice, currentTs: new Date(currentTs) },
    };
  }

  // 4. Compute gap from prior tick.
  const gapSeconds = (currentTs - entry.lastTs) / 1000;
  const priceChangePct = entry.lastPrice > 0
    ? ((currentPrice - entry.lastPrice) / entry.lastPrice) * 100
    : 0;
  const absPct = Math.abs(priceChangePct);

  // 5. State machine.
  switch (entry.state) {
    case 'IDLE': {
      // Check for corp_action discontinuity FIRST (more extreme; supersedes halt).
      if (absPct >= CORP_ACTION_PCT_THRESHOLD) {
        // Langston Step 4 minor: capture BEFORE mutation so the diagnostic
        // log line shows the real prior tick, not the post-mutation snapshot.
        const corpPrevPrice = entry.lastPrice;
        const corpPrevTs = entry.lastTs;
        entry.state = 'DISCONTINUITY_ACTIVE';
        entry.activeKind = 'corp_action';
        entry.resumePrice = currentPrice;
        entry.resumeTs = currentTs;
        entry.corpActionExpiresAt = currentTs + CORP_ACTION_TTL_SECONDS * 1000;
        entry.lastPrice = currentPrice;
        entry.lastTs = currentTs;
        return {
          active: true,
          kind: 'corp_action',
          details: {
            prevPrice: corpPrevPrice, currentPrice,
            prevTs: new Date(corpPrevTs), currentTs: new Date(currentTs),
            gapSeconds, priceChangePct,
          },
        };
      }
      // Halt-resume-gap check.
      if (gapSeconds > HALT_GAP_SECONDS_THRESHOLD && absPct >= HALT_PCT_THRESHOLD) {
        entry.state = 'DISCONTINUITY_ACTIVE';
        entry.activeKind = 'halt_resume_gap';
        entry.resumePrice = currentPrice;
        entry.resumeTs = currentTs;
        const prevPrice = entry.lastPrice;
        const prevTs = entry.lastTs;
        entry.lastPrice = currentPrice;
        entry.lastTs = currentTs;
        return {
          active: true,
          kind: 'halt_resume_gap',
          details: {
            prevPrice, currentPrice,
            prevTs: new Date(prevTs), currentTs: new Date(currentTs),
            gapSeconds, priceChangePct,
          },
        };
      }
      // No discontinuity. Update last-tick + remain IDLE.
      entry.lastPrice = currentPrice;
      entry.lastTs = currentTs;
      return { active: false };
    }

    case 'DISCONTINUITY_ACTIVE': {
      const sinceResumeSeconds = entry.resumeTs ? (currentTs - entry.resumeTs) / 1000 : Infinity;

      // 5a. Corp_action TTL expiry (24h auto-clear).
      if (
        entry.activeKind === 'corp_action' &&
        entry.corpActionExpiresAt !== undefined &&
        currentTs >= entry.corpActionExpiresAt
      ) {
        entry.state = 'IDLE';
        entry.activeKind = undefined;
        entry.resumePrice = undefined;
        entry.resumeTs = undefined;
        entry.corpActionExpiresAt = undefined;
        entry.lastPrice = currentPrice;
        entry.lastTs = currentTs;
        return { active: false };
      }

      // 5b. Hard ceiling auto-clear (5min) for halt_resume_gap.
      if (entry.activeKind === 'halt_resume_gap' && sinceResumeSeconds > HALT_HARD_CEILING_SECONDS) {
        entry.state = 'IDLE';
        entry.activeKind = undefined;
        entry.resumePrice = undefined;
        entry.resumeTs = undefined;
        entry.lastPrice = currentPrice;
        entry.lastTs = currentTs;
        return { active: false };
      }

      // 5c. Halt clearing check: tick within window AND price moved <0.5% from
      // resume price → transition to CLEARING (one-tick confirming).
      if (entry.activeKind === 'halt_resume_gap' && entry.resumePrice !== undefined) {
        const pctFromResume = ((currentPrice - entry.resumePrice) / entry.resumePrice) * 100;
        if (sinceResumeSeconds <= HALT_HARD_CEILING_SECONDS && Math.abs(pctFromResume) < HALT_PCT_THRESHOLD) {
          entry.state = 'CLEARING';
          entry.lastPrice = currentPrice;
          entry.lastTs = currentTs;
          // Still ACTIVE for this call; the CLEARING state means "this call
          // confirms; next call returns inactive."
          return {
            active: true,
            kind: 'halt_resume_gap',
            details: {
              prevPrice: entry.resumePrice, currentPrice,
              prevTs: entry.resumeTs ? new Date(entry.resumeTs) : undefined,
              currentTs: new Date(currentTs),
              gapSeconds: sinceResumeSeconds, priceChangePct: pctFromResume,
            },
          };
        }
      }

      // 5d. Still active, no clearing.
      entry.lastPrice = currentPrice;
      entry.lastTs = currentTs;
      return {
        active: true,
        kind: entry.activeKind,
        details: {
          prevPrice: entry.resumePrice, currentPrice,
          prevTs: entry.resumeTs ? new Date(entry.resumeTs) : undefined,
          currentTs: new Date(currentTs),
          gapSeconds: sinceResumeSeconds,
          priceChangePct,
        },
      };
    }

    case 'CLEARING': {
      // One-tick confirming completed → transition to IDLE.
      entry.state = 'IDLE';
      entry.activeKind = undefined;
      entry.resumePrice = undefined;
      entry.resumeTs = undefined;
      entry.lastPrice = currentPrice;
      entry.lastTs = currentTs;
      return { active: false };
    }
  }
}

/**
 * Explicit per-symbol cache invalidation. NOT the production eviction
 * mechanism — that's lazy eviction at 24h staleness (see §3a in
 * isDiscontinuityActive). This export exists for:
 *
 *   - Test setup/teardown isolation
 *   - Manual recovery in case a symbol's state goes corrupt and an operator
 *     wants to force re-cold-start without waiting 24h
 *
 * Per Langston pre-audit rev1 #1: prefer lazy eviction over refcount tracking
 * or trade-close hooks. Bounded xStock universe makes the natural lifetime
 * (active set + 24h tail) acceptable.
 */
export function clearSymbolState(symbol: string): void {
  symbolCache.delete(symbol);
}

/**
 * Test-only helpers exposed for unit tests. Production code MUST NOT call
 * these.
 */
export function _testClearAllState(): void {
  symbolCache.clear();
  dividendCalendar = null;
}

export function _testGetSymbolEntry(symbol: string): SymbolEntry | undefined {
  return symbolCache.get(symbol);
}

export function _testInjectDividendCalendar(entries: DividendCalendarEntry[]): void {
  const result = new Map<string, Set<string>>();
  for (const entry of entries) {
    result.set(entry.symbol, new Set(entry.ex_dates));
  }
  dividendCalendar = result;
}
