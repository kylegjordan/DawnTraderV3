/**
 * B-XSTOCK-BID-TRIGGER-RELAND increment A, P5 (objective 2) — THE REFUSAL-DURATION TALLY, per open position.
 *
 * WHAT IT RECORDS. How long the exit monitor REFUSED to decide on a held position because the book-state guard would
 * not trust the book (a hollow skip, a yield refusal, or an unvalidated chain): refused ticks, refused time, separate
 * episodes, the longest episode, and — at each RELEASE (the first decided tick after an episode) — where the BID stood
 * against the stop, as a percent of the stop. The cost of a hold is that distance: a release below the stop is a stop
 * that could not be acted on while the book was distrusted.
 *
 * WHERE IT GOES. In flight on the engine's `RI_NEAR_MISS` line (Langston gate 2: an at-close sink alone is censored
 * against exactly the holds it exists to measure — the live refusals were all on positions still open), and durably on
 * `closed_trades.metadata.exitRefusal` at close.
 *
 * ⛔ IN MEMORY. A restart empties it, so a position opened before the engine started carries `sinceRestart: true` and its
 *   tally covers only the time since the boot (all 16 open positions at the 2026-10-10 boot predate it). The flag is the
 *   honest label; the tally is never presented as the position's whole life.
 * ⛔ NOT RE-DERIVABLE FROM THE LOG: the refusal line carries the symbol and no position id, so attribution lives here.
 * ⛔ NO ALERT. A thin-book hold is expected (Kyle 2026-10-09); per-symbol alert keys are the `#679` treadmill.
 * PURE: no clock, no I/O. The caller passes `nowMs`.
 */

/** A gap longer than this between two refused ticks starts a new episode (the exit loop ticks ~1.5 s). */
export const EPISODE_GAP_MS = 60_000;

export type ExitRefusalKind = 'hollow_skip' | 'yield_refused' | 'unvalidated';

export interface ExitRefusalTally {
  /** True when the position was opened before this engine instance started: the tally covers only the time since. */
  sinceRestart: boolean;
  refusedTicks: number;
  refusedMs: number;
  episodes: number;
  longestEpisodeMs: number;
  byKind: Record<ExitRefusalKind, number>;
  /** Row 2 objective 6: refused ticks whose hollow reason was `spread_blown` (the Kyle-directed wide-book hold). */
  spreadBlownTicks: number;
  /** Row 2 objective 6 S6 (Coltrane r2): THE HOLDING-COST TRIPWIRE. The bid at the FIRST `spread_blown`-refused tick on
   *  which the bid was AT OR BELOW the stop — the first tick the stop would have fired absent the guard. NOT the first wide
   *  tick: a book can be wide for hours while the bid is still above the stop, and that time is not a held stop. */
  spreadBlownFirstStopRefusedBid: number | null;
  /** Total time a stop was HELD by `spread_blown`: from each first stop-crossing refused tick to the release (or the close). */
  spreadBlownStopHeldMs: number;
  /** Internal: when the current spread-blown stop hold began, if one is open. */
  stopHoldStartMs: number | null;
  releases: number;
  lastReleaseBidToStopPct: number | null;
  minReleaseBidToStopPct: number | null;
  /** Internal: the open episode, if any. */
  episodeStartMs: number | null;
  lastRefuseAtMs: number | null;
}

export function newExitRefusalTally(sinceRestart: boolean): ExitRefusalTally {
  return {
    sinceRestart, refusedTicks: 0, refusedMs: 0, episodes: 0, longestEpisodeMs: 0,
    byKind: { hollow_skip: 0, yield_refused: 0, unvalidated: 0 },
    spreadBlownTicks: 0,
    spreadBlownFirstStopRefusedBid: null, spreadBlownStopHeldMs: 0, stopHoldStartMs: null,
    releases: 0, lastReleaseBidToStopPct: null, minReleaseBidToStopPct: null,
    episodeStartMs: null, lastRefuseAtMs: null,
  };
}

/** One refused tick. Time accrues between consecutive refused ticks of the SAME episode only. */
export function noteRefusal(
  t: ExitRefusalTally, kind: ExitRefusalKind, nowMs: number,
  spreadBlown = false, bid: number | null = null, stop: number | null = null,
): void {
  t.refusedTicks++;
  t.byKind[kind]++;
  if (spreadBlown) {
    t.spreadBlownTicks++;
    // S6: a stop is HELD only from the first refused tick whose bid is at/below it (a long position's stop is a sell).
    if (bid !== null && stop !== null && Number.isFinite(bid) && Number.isFinite(stop) && stop > 0 && bid <= stop) {
      if (t.spreadBlownFirstStopRefusedBid === null) t.spreadBlownFirstStopRefusedBid = bid;
      if (t.stopHoldStartMs === null) t.stopHoldStartMs = nowMs;
    }
  }
  const gap = t.lastRefuseAtMs === null ? Infinity : nowMs - t.lastRefuseAtMs;
  if (t.episodeStartMs === null || gap > EPISODE_GAP_MS) {
    t.episodes++;
    t.episodeStartMs = nowMs;
  } else {
    t.refusedMs += Math.max(0, gap);
  }
  t.lastRefuseAtMs = nowMs;
  t.longestEpisodeMs = Math.max(t.longestEpisodeMs, nowMs - t.episodeStartMs);
}

/**
 * The first DECIDED tick after an episode. `bid` and `stop` may be absent (no transactable bid, no stop) — the release
 * still counts, and the distance stays null rather than being invented. Returns true when it closed an open episode.
 */
export function noteRelease(t: ExitRefusalTally, bid: number | null, stop: number | null, nowMs?: number): boolean {
  if (t.episodeStartMs === null) return false;
  t.releases++;
  t.episodeStartMs = null;
  closeStopHold(t, nowMs);
  if (bid !== null && stop !== null && Number.isFinite(bid) && Number.isFinite(stop) && stop > 0) {
    const pct = ((bid - stop) / stop) * 100;
    t.lastReleaseBidToStopPct = pct;
    t.minReleaseBidToStopPct = t.minReleaseBidToStopPct === null ? pct : Math.min(t.minReleaseBidToStopPct, pct);
  }
  return true;
}

/** S6: end an open spread-blown stop hold, adding its duration (the release, or the close). */
function closeStopHold(t: ExitRefusalTally, nowMs?: number): void {
  if (t.stopHoldStartMs === null) return;
  const end = nowMs ?? t.lastRefuseAtMs ?? t.stopHoldStartMs;
  t.spreadBlownStopHeldMs += Math.max(0, end - t.stopHoldStartMs);
  t.stopHoldStartMs = null;
}

/** The durable record (no internal fields). `nowMs` = the close: an open stop hold is counted up to it. */
export function snapshotExitRefusal(t: ExitRefusalTally, nowMs?: number): Omit<ExitRefusalTally, 'episodeStartMs' | 'lastRefuseAtMs' | 'stopHoldStartMs'> & { open: boolean } {
  closeStopHold(t, nowMs);
  const { episodeStartMs, lastRefuseAtMs: _l, stopHoldStartMs: _s, ...rest } = t;
  return { ...rest, byKind: { ...rest.byKind }, open: episodeStartMs !== null };
}
