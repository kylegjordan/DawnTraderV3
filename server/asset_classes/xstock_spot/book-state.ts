/**
 * B-XSTOCK-FEED-SANITY (`#943`, closes `#567`) — THE BOOK-STATE PREDICATE. PURE. NO DB, NO CLOCK.
 *
 * WHAT IT DECIDES. Given the CURRENT xStock quote (bid / ask / last as the venue sent them) and the
 * pair's OWN recent two-sided history, is this quote a book we may act on (`two_sided`), a HOLLOW
 * book (`hollow` — one side has fallen away from where the book was while the other side and the
 * last trade have not moved), or undecidable (`unknown` — no comparator yet)?
 *
 * WHY IT EXISTS. The exit path reads a MIDPOINT (`equity-spot-archiver.ts` `markKindOf` → (bid+ask)/2)
 * and compares it to the stop and the target. At Kraken's session handoffs (8:15 PM / 4:15 PM /
 * 4:00 AM ET) the whole book re-quotes inside a second and the BID side collapses while the ask
 * and the last trade stand still; the mid follows the bid down, the stop fires, and the position is
 * closed on a price nobody traded at. The freshness ceiling (`mark-staleness.ts`, `#548`) governs
 * how OLD a mark may be and, by its own design note, never whether its VALUE is plausible — that
 * gap is `#567`, and this predicate is its fix. Measured shapes behind every branch below are in
 * `B_XSTOCK_FEED_SANITY_PRE_AUDIT.md` §A.9 / §A.11 (the 21 rows carrying `exit_decision_price`).
 *
 * WHY SYMMETRIC. The damage rows show BOTH arms: stop-outs on a collapsed bid (NOW, TGT, BABA,
 * SPGI) and target-hits on a spiked ask (MOH decided at 281.0 and filled at 219.8; WEN; DE). A
 * target hit on a hollow ask is the same defect on the other side of the book.
 *
 * WHY RELATIVE. §16.1's absolute pair (spread > 20 % AND bid ≤ 0.90 × prior mid) was tuned on the
 * all-name STATE census and misses the closes: the archived handoff frames on HELD names sit at
 * 8–20 % spreads with bid/prior 0.87–0.99. A departure is therefore measured against the pair's
 * OWN trailing two-sided spread (× `single_side_departure_k_rel`, floored at
 * `single_side_departure_floor_pct`), so a name that normally quotes 0.1 % wide trips on a 1 %
 * departure and a name that normally quotes 3 % wide does not.
 *
 * ⛔ THE FAIL DIRECTION IS THE WHOLE DESIGN (scope §17.1 constraints 1 + 7): a HOLLOW verdict may
 * WITHHOLD a decision; it may never trap a position — the CALLER bounds the withholding with
 * `hollow_skip_cap` and then YIELDS. Nothing in this file closes, re-prices, widens or narrows a
 * stop. It answers one question about one quote.
 *
 * ⛔ CANDIDATE (ii) — THE FEED-HEALTH READ — IS GATE-ONLY AND INERT BY KNOB. It reads how many of
 * the OTHER books on the SAME feed stubbed at the same instant (publisher health, not a comparator
 * price — Langston's ruling 2026-09-02 23:31Z, Kyle may overturn). Fences: F1 it never enters a
 * money expression (it is a reason string here and nothing else); F2 the denominator is measured
 * at the reading instant and carried in `inputs`; F3 a cohort below `feed_cohort_floor` makes the
 * read INERT (reason `feed_read_inert`), never actionable-by-emptiness; F4 it is INERT by knob
 * (`feed_read_enabled = 0`) until its fraction is re-measured on the guard's own telemetry.
 *
 * ★ THE TWELVE KNOB NAMES BELOW ARE THE ONE LIST. The seed migration, the config resolver
 * (`book-state-config.ts`) and the boot assertion (`b72-warmup.ts`) all read THIS array, so the
 * three cannot drift (`#641`; Langston Step-2 condition C2). Adding a knob = adding it here.
 */

export const BOOK_STATE_MODULE = 'book_state' as const;

/** Exactly twelve. The boot assertion asserts the count, so an eleventh or a thirteenth refuses. */
export const BOOK_STATE_KNOBS = [
  'enabled',
  'single_side_departure_k_rel',
  'single_side_departure_floor_pct',
  'other_side_hold_pct',
  'last_hold_pct',
  'trailing_spread_window_snaps',
  'feed_read_enabled',
  'feed_stub_fraction_f',
  'feed_stub_window_ms',
  'feed_cohort_floor',
  'hollow_skip_cap',
  'own_mark_deviation_d_pct',
] as const;
export type BookStateKnob = (typeof BOOK_STATE_KNOBS)[number];

/** Pre-registered seed values (audit §A.9, registered BEFORE any code; a change is a
 *  PREVIOUSLY/NOW line in the completion report, never a tune on the observation window). */
export const BOOK_STATE_SEED: Readonly<Record<BookStateKnob, number>> = {
  enabled: 1,
  single_side_departure_k_rel: 3,
  single_side_departure_floor_pct: 1.0,
  other_side_hold_pct: 0.5,
  last_hold_pct: 0.5,
  trailing_spread_window_snaps: 20,
  feed_read_enabled: 0,
  feed_stub_fraction_f: 0.10,
  feed_stub_window_ms: 90_000,
  feed_cohort_floor: 50,
  hollow_skip_cap: 60,
  own_mark_deviation_d_pct: 5,
};

export interface BookStateConfig {
  enabled: boolean;
  /** Departure threshold = max(kRel × trailing median two-sided spread, floorPct/100). */
  kRel: number;
  floorPct: number;
  /** The OTHER side must have held within this % of its prior for the departure to read hollow. */
  otherSideHoldPct: number;
  /** `last` must have held within this % of its prior (vacuous when either is absent). */
  lastHoldPct: number;
  trailingSpreadWindowSnaps: number;
  feedReadEnabled: boolean;
  feedStubFractionF: number;
  feedStubWindowMs: number;
  feedCohortFloor: number;
  hollowSkipCap: number;
  ownMarkDeviationDPct: number;
}

export interface BookStateInput {
  /** The current quote as the venue sent it — `null` where the side was absent in the frame. */
  bid: number | null;
  ask: number | null;
  last: number | null;
  /** The pair's own comparator: the last frame this predicate read as `two_sided`. */
  priorTwoSidedMid: number | null;
  priorBid: number | null;
  priorAsk: number | null;
  priorLast: number | null;
  /** Median of the pair's recent two-sided spreads, as a FRACTION of mid (null until warm). */
  trailingMedianSpreadFrac: number | null;
  /** Candidate (ii), measured at the reading instant by the caller: fraction of the feed's
   *  cohort that stubbed inside the window, and the cohort size it was measured over. */
  feedStubFraction?: number | null;
  feedCohortN?: number | null;
}

export type BookState = 'two_sided' | 'hollow' | 'unknown';

export interface BookStateResult {
  state: BookState;
  /** Every reason that fired, in evaluation order; a `two_sided` verdict carries the checks
   *  that passed. Reasons are the telemetry (scope constraint 4) and never a number. */
  reasons: string[];
  /** The numbers the verdict was taken on — logged on every acted-on tick, so Step 7/8 can
   *  recompute the verdict from the row rather than trust it. */
  inputs: {
    bid: number | null; ask: number | null; last: number | null;
    priorMid: number | null; priorBid: number | null; priorAsk: number | null; priorLast: number | null;
    departureThresholdFrac: number | null;
    bidDepartureFrac: number | null; askDepartureFrac: number | null; midDepartureFrac: number | null;
    spreadFrac: number | null; trailingMedianSpreadFrac: number | null;
    feedStubFraction: number | null; feedCohortN: number | null;
  };
}

const fin = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const pos = (v: number | null | undefined): v is number => fin(v) && v > 0;

/** Median of a numeric array; null on empty. Exported so the tracker and the tests share it. */
export function medianOf(values: readonly number[]): number | null {
  const s = values.filter(fin).slice().sort((a, b) => a - b);
  if (s.length === 0) return null;
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/**
 * The predicate. Branch order is the design: absent bid → single-side departure (both arms) →
 * feed-health (gate-only, inert by knob) → own-mark deviation → two_sided.
 */
export function assessBookState(input: BookStateInput, cfg: BookStateConfig): BookStateResult {
  const reasons: string[] = [];
  const bid = fin(input.bid) ? input.bid : null;
  const ask = fin(input.ask) ? input.ask : null;
  const last = fin(input.last) ? input.last : null;
  const priorMid = pos(input.priorTwoSidedMid) ? input.priorTwoSidedMid : null;
  const priorBid = pos(input.priorBid) ? input.priorBid : null;
  const priorAsk = pos(input.priorAsk) ? input.priorAsk : null;
  const priorLast = pos(input.priorLast) ? input.priorLast : null;
  const trailing = pos(input.trailingMedianSpreadFrac) ? input.trailingMedianSpreadFrac : null;
  const feedStub = fin(input.feedStubFraction) ? input.feedStubFraction : null;
  const feedN = fin(input.feedCohortN) ? input.feedCohortN : null;

  const twoSidedNow = pos(bid) && pos(ask) && ask >= bid;
  const midNow = twoSidedNow ? (bid + ask) / 2 : null;
  const spreadFrac = twoSidedNow && midNow! > 0 ? (ask - bid) / midNow! : null;

  const inputs: BookStateResult['inputs'] = {
    bid, ask, last, priorMid, priorBid, priorAsk, priorLast,
    departureThresholdFrac: null, bidDepartureFrac: null, askDepartureFrac: null, midDepartureFrac: null,
    spreadFrac, trailingMedianSpreadFrac: trailing, feedStubFraction: feedStub, feedCohortN: feedN,
  };

  // (0) ABSENT / ZERO BID — HOLLOW BY DEFINITION (scope §17.1 P-B). Never fall through to `last`:
  // the archiver's `markKindOf` would have served a `last` that has not moved since the close, and
  // that is exactly the mark this guard exists to refuse.
  if (!pos(bid)) {
    reasons.push('absent_bid');
    return { state: 'hollow', reasons, inputs };
  }
  if (!pos(ask)) {
    // One-sided on the ASK side: nothing to sell into is not a hollow BID, but it is not a two-sided
    // book either. The exit path cannot take a stop/target decision on a bid alone.
    reasons.push('absent_ask');
    return { state: 'hollow', reasons, inputs };
  }

  // No comparator yet (first frames after boot, or a symbol never seen two-sided): undecidable.
  // The caller treats `unknown` as ACTIONABLE (there is nothing to withhold on) and LABELS it.
  if (priorMid === null || priorBid === null || priorAsk === null) {
    reasons.push('no_comparator');
    return { state: 'unknown', reasons, inputs };
  }

  // (i) SINGLE-SIDE DEPARTURE, SYMMETRIC AND RELATIVE.
  const threshold = Math.max(
    cfg.kRel * (trailing ?? ((priorAsk - priorBid) / priorMid)),
    cfg.floorPct / 100,
  );
  const bidDep = (priorMid - bid) / priorMid;          // positive when the bid fell away
  const askDep = (ask - priorMid) / priorMid;          // positive when the ask spiked away
  const askHeld = Math.abs(ask - priorAsk) / priorAsk <= cfg.otherSideHoldPct / 100;
  const bidHeld = Math.abs(bid - priorBid) / priorBid <= cfg.otherSideHoldPct / 100;
  // `last` held: vacuously true when either print is absent — an absent print cannot disprove a
  // hollow book, and requiring one would make every off-hours frame read two_sided by default.
  const lastHeld = last === null || priorLast === null
    ? true
    : Math.abs(last - priorLast) / priorLast <= cfg.lastHoldPct / 100;
  inputs.departureThresholdFrac = threshold;
  inputs.bidDepartureFrac = bidDep;
  inputs.askDepartureFrac = askDep;
  inputs.midDepartureFrac = (midNow! - priorMid) / priorMid;

  if (bidDep > threshold && askHeld && lastHeld) {
    reasons.push('bid_collapsed');
    return { state: 'hollow', reasons, inputs };
  }
  if (askDep > threshold && bidHeld && lastHeld) {
    reasons.push('ask_spiked');
    return { state: 'hollow', reasons, inputs };
  }

  // (ii) FEED HEALTH — gate-only, inert by knob, inert below the cohort floor (F1–F4).
  if (cfg.feedReadEnabled) {
    if (feedN === null || feedStub === null) {
      reasons.push('feed_read_unavailable');
    } else if (feedN < cfg.feedCohortFloor) {
      reasons.push('feed_read_inert');
    } else if (feedStub >= cfg.feedStubFractionF) {
      reasons.push('feed_burst');
      return { state: 'hollow', reasons, inputs };
    } else {
      reasons.push('feed_quiet');
    }
  }

  // (iii) OWN-MARK DEVIATION — the retired §2.1b band's floor. A mid that moved more than D % from
  // the prior two-sided mid WITHOUT both sides moving together is not a move, it is a hollow that
  // slipped past (i)'s hold tolerance. Both sides moving the same way past the hold tolerance IS
  // a move, and passes.
  const midDep = inputs.midDepartureFrac!;
  const bothMovedTogether =
    Math.sign(bid - priorBid) === Math.sign(ask - priorAsk) &&
    Math.abs(bid - priorBid) / priorBid > cfg.otherSideHoldPct / 100 &&
    Math.abs(ask - priorAsk) / priorAsk > cfg.otherSideHoldPct / 100;
  if (Math.abs(midDep) > cfg.ownMarkDeviationDPct / 100 && !bothMovedTogether) {
    reasons.push('mark_deviation');
    return { state: 'hollow', reasons, inputs };
  }

  reasons.push('two_sided');
  return { state: 'two_sided', reasons, inputs };
}
