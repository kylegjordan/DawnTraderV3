/**
 * B-XSTOCK-FEED-SANITY — the DB-governed configuration of the book-state guard.
 *
 * ★ ONE LIST. The knob NAMES come from `BOOK_STATE_KNOBS` in `book-state.ts`; this file only
 * maps them onto the typed config the predicate takes. The seed migration and the boot assertion
 * read the same array, so the three cannot drift (Langston Step-2 condition C2, `#641`).
 *
 * ⛔ NO SILENT DEFAULT (rule 15). Every row is read with `getCachedNumberRequired`; a missing row
 * THROWS, the caller refuses to run the guard and says so on its own skip reason. The module MUST
 * be listed in `b72-warmup.ts` `PREFETCH_MODULES` or every sync read below throws on a cold cache
 * — the exact omission that took staging down on 2026-07-22 for `mark_staleness`.
 */
import { getCachedNumberRequired, getCachedNumbersForModule } from '../../services/module-constants-service.js';
import { BOOK_STATE_KNOBS, BOOK_STATE_MODULE, type BookStateConfig, type BookStateKnob } from './book-state.js';

const KEY = { exchange: '*', assetClass: 'xstock_spot' as const, strategy: '*', regime: '*' };

/** Read all twelve rows for `xstock_spot` from the warmed cache. Throws on any missing row. */
export function readBookStateKnobs(): Record<BookStateKnob, number> {
  const out = {} as Record<BookStateKnob, number>;
  for (const k of BOOK_STATE_KNOBS) out[k] = getCachedNumberRequired(BOOK_STATE_MODULE, k, KEY);
  return out;
}

/** The typed config the predicate takes. Sync — the exit loop must never await a knob. */
export function resolveBookStateConfigSync(): BookStateConfig {
  const r = readBookStateKnobs();
  return {
    enabled: r.enabled === 1,
    kRel: r.single_side_departure_k_rel,
    floorPct: r.single_side_departure_floor_pct,
    otherSideHoldPct: r.other_side_hold_pct,
    lastHoldPct: r.last_hold_pct,
    trailingSpreadWindowSnaps: r.trailing_spread_window_snaps,
    feedReadEnabled: r.feed_read_enabled === 1,
    feedStubFractionF: r.feed_stub_fraction_f,
    feedStubWindowMs: r.feed_stub_window_ms,
    feedCohortFloor: r.feed_cohort_floor,
    hollowSkipCap: r.hollow_skip_cap,
    ownMarkDeviationDPct: r.own_mark_deviation_d_pct,
  };
}

/**
 * The BOOT assertion (called from `b72-warmup.ts` after the module is prefetched). Every one of
 * the twelve rows present by name, the count exactly twelve, and every range sane. A refusal here
 * is a DEPLOY-time failure — never a silent mid-session guard outage (the `calibration_epoch`
 * precedent). Returns the values so the warmup can log them.
 */
export function assertBookStateKnobsAtBoot(): Record<BookStateKnob, number> {
  // ⛔ THE ROW SET IS READ FROM THE CACHE, NOT REBUILT FROM THE LIST (Langston Step-4 condition):
  // iterating BOOK_STATE_KNOBS can only ever see the twelve names it iterates — a THIRTEENTH
  // xstock_spot row (a future batch's stray seed) would be invisible. `getCachedNumbersForModule`
  // returns whatever rows the module actually holds for the key; the set must EQUAL the list.
  const live = getCachedNumbersForModule(BOOK_STATE_MODULE, KEY);
  const liveNames = Object.keys(live).sort();
  const wanted = [...BOOK_STATE_KNOBS].sort();
  if (liveNames.length !== 12 || wanted.length !== 12 || liveNames.some((n, i) => n !== wanted[i])) {
    throw new Error(`[B-XSTOCK-FEED-SANITY][warmup] book_state must hold EXACTLY the twelve xstock_spot rows named in BOOK_STATE_KNOBS — live rows: ${liveNames.length} (${liveNames.join(',')}); expected: ${wanted.join(',')}`);
  }
  const r = readBookStateKnobs();
  const fail = (msg: string): never => { throw new Error(`[B-XSTOCK-FEED-SANITY][warmup] book_state ${msg} — refusing to start (fail-closed, no silent default)`); };
  if (!(r.enabled === 0 || r.enabled === 1)) fail(`enabled=${r.enabled} must be 0 or 1`);
  if (!(r.single_side_departure_k_rel > 0)) fail(`single_side_departure_k_rel=${r.single_side_departure_k_rel} must be > 0`);
  if (!(r.single_side_departure_floor_pct > 0)) fail(`single_side_departure_floor_pct=${r.single_side_departure_floor_pct} must be > 0`);
  if (!(r.other_side_hold_pct > 0)) fail(`other_side_hold_pct=${r.other_side_hold_pct} must be > 0`);
  if (!(r.last_hold_pct > 0)) fail(`last_hold_pct=${r.last_hold_pct} must be > 0`);
  if (!(r.trailing_spread_window_snaps >= 5)) fail(`trailing_spread_window_snaps=${r.trailing_spread_window_snaps} must be >= 5`);
  if (!(r.feed_read_enabled === 0 || r.feed_read_enabled === 1)) fail(`feed_read_enabled=${r.feed_read_enabled} must be 0 or 1`);
  if (!(r.feed_stub_fraction_f > 0 && r.feed_stub_fraction_f <= 1)) fail(`feed_stub_fraction_f=${r.feed_stub_fraction_f} must be in (0,1]`);
  if (!(r.feed_stub_window_ms > 0)) fail(`feed_stub_window_ms=${r.feed_stub_window_ms} must be > 0`);
  if (!(r.feed_cohort_floor >= 1)) fail(`feed_cohort_floor=${r.feed_cohort_floor} must be >= 1`);
  if (!(r.hollow_skip_cap >= 1)) fail(`hollow_skip_cap=${r.hollow_skip_cap} must be >= 1`);
  if (!(r.own_mark_deviation_d_pct > 0)) fail(`own_mark_deviation_d_pct=${r.own_mark_deviation_d_pct} must be > 0`);
  return r;
}
