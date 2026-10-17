/**
 * B-VENUE-QUIET-ALERTING (#526 + Kyle's #994 + #638; SPRINT_TO_LIVE_PLAN row 3a1; change-class architecture).
 *
 * Kyle, 2026-09-03 (#994): an xStock mark going stale because the US market is closed is BY DESIGN — keep the count,
 * raise no alert; alert only when OUR feed or subscription is impaired. The freshness standard does not loosen. So this
 * module changes DELIVERY only: the exit monitor's skip rail, its emit and its log lines are untouched.
 *
 *   - QUIET-MARKET FAMILY: only `equity_tick_stale_*` and `equity_tick_missing` can be a quiet market. Every other skip
 *     reason (knob missing, book-state, the crypto REST arm) pages exactly as before.
 *   - THE COHORT TEST, at the decision instant: `T` = xStock symbols with a venue UPDATE frame in the trailing 60 s (r4: a
 *     subscribe-time `snapshot` frame never counts; `closed` is read first from the weekend window).
 *     QUIET iff T < `quiet_ticking_min`; THIN iff T < `thin_ticking_min` ⇒ cannot tell a quiet venue from an impaired
 *     feed ⇒ PAGE (default-to-page, Langston r1 Q2). A quiet-family escalation on a QUIET class joins ONE per-class
 *     standing record (`venue-quiet-<mode>-xstock_spot`, info, not delivered to Discord) instead of a per-symbol page.
 *     r7: OUTSIDE the US regular session a quiet-market streak joins on any verdict but `thin`/unreadable — the 60 s count
 *     cannot describe an off-session minute against a 15 s ceiling (FAIL-3). In session the cohort test runs as above.
 *   - BOOT: until the count is warm (a full window after this process's first update frame, bounded by `NOT_WARM_GRACE_MS`
 *     from engine start) an xStock streak skips without escalating — an EMPTY count is not a `thin` reading (r7, A.7).
 *   - DURATION: a standing-record member still unpriced `escalate_after_ms` after the class stopped being quiet pages on
 *     its own key (the market resumed; this symbol did not). r7: the clock also resets when the regular session ends.
 *   - THE CLEAR (#638), off the exit path and driven by a RE-MEASURED condition, never by the in-memory streak (a restart
 *     loses the streak): a `price-skip-<mode>-<SYMBOL>` row resolves once this engine has priced the symbol's position
 *     AFTER the row was minted, or once no position is open on the symbol; the standing record resolves when the class is
 *     not quiet and every member has been priced or closed. Resolves go through `resolveAlertsByDedupeKey` as the machine
 *     actor `active-exit-monitor`, transport `engine`, with the re-measured position's uuid as evidence.
 *   - Every key this module or the rail mints has a clearing condition (Langston r2 C1): `price-skip-config-<mode>-<class>`
 *     clears when the threshold reads successfully; `venue-quiet-resolve-stuck-<mode>` clears when nothing is stuck.
 *
 * Thresholds are DB constants (module `venue_quiet`, class `xstock_spot`; seeded by 2026-10-07-b-venue-quiet-alerting.sql,
 * prefetched at boot). The measured basis is the pre-audit (A2/A3): regular p05 461 of 468; after-hours median 154;
 * overnight min 108.
 */
import { getCachedNumberRequired } from './module-constants-service.js';
import { QUOTE_LEN_MIN, QUOTE_LEN_MAX } from '../../shared/asset-classes.js';
import { countEquitySymbolsUpdatedSince, EQUITY_TICKING_WINDOW_MS, isEquityTickingCountWarm } from './passive-archive/equity-spot-archiver.js';
import { isInXstockWeekendClose } from '../asset_classes/xstock_spot/market-hours.js';
import { getXstockSession, type XstockSession } from '../asset_classes/xstock_spot/time-of-day.js';

/** `closed` (r4, row 3a1 Step 9): the venue's scheduled weekend close (Fri 20:00 → Sun 20:00 ET, `isInXstockWeekendClose`,
 *  DST-aware). Nothing can tick, so `thin` there is the calendar, not a dying feed — measured 2026-10-10 (Saturday): `thin`
 *  pages at 12:00, 13:03, 17:06, 17:44 and 18:38Z. A closed venue neither pages nor reads as resumed. */
export type ClassVerdict = 'quiet' | 'not_quiet' | 'thin' | 'closed';
export const VENUE_QUIET_ACTOR = 'active-exit-monitor';
/** The window T is counted over; defined beside the count so the archiver's heartbeat control reads the same value. */
export const TICKING_WINDOW_MS = EQUITY_TICKING_WINDOW_MS;
/** How long a cold (not-yet-warm) knob may be read as "skip, do not escalate" after engine start before it pages.
 *  A BOOT-ORDERING bound, not a trading decision: the warm-up measured 2 s at the 2026-10-06 restart (pre-audit A7). */
export const NOT_WARM_GRACE_MS = 120_000;

/** Resolution-evidence references (path:line tokens) for the two rows that clear on a CONDITION rather than a position. */
export const THRESHOLD_SEED_REF = 'drizzle/migrations/2026-07-15-p19-b8-5-venue-only-pricing.sql:13';
export const SWEEP_REF = 'server/services/venue-quiet-alerting.ts:1';

/** r6b condition (Langston): the sweep clears a `price-skip` row for THREE different facts, and each gets its own evidence
 *  token so the row says which — a bare position uuid read the same for all three, and for a superseded row it read FALSE
 *  ("priced") in the direction that matters. Each keeps the uuid, which is what `isValidResolutionEvidence` matches. */
export const clearEvidence = {
  positionClosed: (positionId: string) => `POSITION-CLOSED position=${positionId}`,
  pricedAfterMint: (positionId: string) => `PRICED-AFTER-MINT position=${positionId}`,
  supersededByDurationPage: (positionId: string) => `SUPERSEDED-BY-DURATION-PAGE position=${positionId}`,
  // r7 (FINDING-1): an off-session row still held when the regular session opens, its position handed back to the engine.
  supersededBySessionChange: (positionId: string) => `SUPERSEDED-BY-SESSION-CHANGE position=${positionId}`,
} as const;

export function isQuietMarketReason(reason: string): boolean {
  return reason === 'equity_tick_missing' || reason.startsWith('equity_tick_stale_');
}

/** r4 (row 3a1 Step 9; CC-C's item at `f3c721bf4`, Langston's consensus ruling 2026-10-09 on Kyle's overnight direction): our
 *  own book-state guard HOLDING a symbol whose prices are arriving — a thin book. Outside the US regular session that hold is
 *  expected and must not page; inside it, an implausible book is worth a page. NOT `book_state_knob_missing`: that is our
 *  own configuration missing, which always pages. */
export function isBookStateHoldReason(reason: string): boolean {
  return reason === 'book_state_unvalidated' || reason === 'book_state_yield_refused';
}

export type ReasonFamily = 'quiet_market' | 'book_state' | 'other';
export function reasonFamilyOf(reason: string): ReasonFamily {
  if (isQuietMarketReason(reason)) return 'quiet_market';
  if (isBookStateHoldReason(reason)) return 'book_state';
  return 'other';
}

/** Would ONE reason family, on its own, join the standing record rather than page? Kyle 2026-10-03 (#994): a quiet market
 *  keeps the count and raises no alert; Kyle 2026-10-09 (sprint row 3a1): an expected overnight hold must not page — page
 *  only on (i) a book implausible inside the US regular session, or (ii) our own feed impaired. Arm (ii) binds EVERY family
 *  (Langston r4 BLOCKER-2): `thin` — fewer than `thin_ticking_min` symbols updating — is "our feed impaired", so it pages
 *  whatever the reason; if `thin` turns out to fire on healthy overnight hours, the knob moves, never a per-family carve-out. */
export function familyJoinsStandingRecord(family: ReasonFamily, verdict: ClassVerdict | null, nowMs: number): boolean {
  if (verdict === null) return false;                                   // config unreadable ⇒ page
  if (verdict === 'closed') return family !== 'other';                  // the venue is shut: nothing it does is a fault
  if (verdict === 'thin') return false;                                 // arm (ii): our feed impaired ⇒ page
  // r7 (row 3a1 Step 9, FAIL-3): outside the US regular session a quiet-market streak joins whatever the cohort count.
  // `T` is a 60 s union and the ceiling it excuses is 15 s, so off-session it saturates on the wind-down, the ramp-up and a
  // burst writer — n = 3 false pages on 2026-10-12, all off-session, when 69 % of the cohort was stale by the same standard
  // (Langston; `Langston Design Asks/B_VENUE_QUIET_ALERTING_STEP9_R7_DESIGN.md` A.2-A.5). In session the two clocks agree.
  if (family === 'quiet_market') return verdict === 'quiet' || getXstockSession(nowMs) !== 'regular';
  if (family === 'book_state') return getXstockSession(nowMs) !== 'regular';  // arm (i): page inside the regular session
  return false;
}

/** The streak joins only if EVERY family present in it would join on its own — a minority reason that would page VETOES the
 *  join (Langston's UNH triage 2026-10-10, routed to row 3a1 and widened by r4): a streak whose dominant reason is a quiet
 *  market but which also carries regular-session book-state refusals must not hide those inside an info-level record.
 *  Measured on 2026-10-10: 23 of 94 escalation lines carried more than one reason key. An empty set never joins. */
export function joinsStandingRecord(families: Iterable<ReasonFamily>, verdict: ClassVerdict | null, nowMs: number): boolean {
  let any = false;
  for (const f of families) {
    any = true;
    if (!familyJoinsStandingRecord(f, verdict, nowMs)) return false;
  }
  return any;
}

/** The families present in a streak's reason tally. */
export function familiesOf(reasonCounts: Record<string, number>): Set<ReasonFamily> {
  const out = new Set<ReasonFamily>();
  for (const [reason, n] of Object.entries(reasonCounts)) if (n > 0) out.add(reasonFamilyOf(reason));
  return out;
}

export interface VenueQuietConfig {
  quietTickingMin: number;
  thinTickingMin: number;
  escalateAfterMs: number;
  resolveStuckAfterMs: number;
}

export function readVenueQuietConfig(): VenueQuietConfig {
  const scope = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' };
  return {
    quietTickingMin: getCachedNumberRequired('venue_quiet', 'quiet_ticking_min', scope),
    thinTickingMin: getCachedNumberRequired('venue_quiet', 'thin_ticking_min', scope),
    escalateAfterMs: getCachedNumberRequired('venue_quiet', 'escalate_after_ms', scope),
    resolveStuckAfterMs: getCachedNumberRequired('venue_quiet', 'resolve_stuck_after_ms', scope),
  };
}

export function classVerdict(t: number, cfg: Pick<VenueQuietConfig, 'quietTickingMin' | 'thinTickingMin'>, nowMs: number): ClassVerdict {
  if (isInXstockWeekendClose(new Date(nowMs))) return 'closed';
  if (t < cfg.thinTickingMin) return 'thin';
  if (t < cfg.quietTickingMin) return 'quiet';
  return 'not_quiet';
}

export function measureXstockTicking(nowMs: number): number {
  return countEquitySymbolsUpdatedSince(nowMs - TICKING_WINDOW_MS);
}

/** r7 (Langston BLOCKER-1, row 3a1 Step 9): may an xStock streak escalate on `T` yet? Not while the count is an EMPTY
 *  instrument after a restart — until a full window has passed since this process's first update frame. Bounded and
 *  fail-closed, the `NOT_WARM_GRACE_MS` boot-ordering pattern: STILL COLD once `engineAgeMs` reaches it ⇒ the count is used as it
 *  stands, whatever made it cold (no update frame yet, or a first frame that came late). Not a widening of `thin`. */
export function xstockCountColdHoldsEscalation(nowMs: number, engineAgeMs: number): boolean {
  return !isEquityTickingCountWarm(nowMs) && engineAgeMs < NOT_WARM_GRACE_MS;
}

/** The cold/unseeded split (Langston r2 C3) — `module-constants-service` throws two distinguishable messages. */
export function classifyKnobError(err: unknown): 'not_warm' | 'unseeded' {
  const msg = err instanceof Error ? err.message : String(err);
  return /not warm/i.test(msg) ? 'not_warm' : 'unseeded';
}

/** The exact key shapes the sweep may select — never a prefix scan (Langston r2 C2). The QUOTE is any quote the system
 *  recognises, bounded by the shared SSOT (`QUOTE_LEN_MIN`/`QUOTE_LEN_MAX`, `shared/asset-classes.ts`) — the crypto arm mints
 *  this key for EUR/GBP/CAD/CHF/AUD-quoted positions too (Langston Step-4 BLOCKER-1: a hard-coded USD list left 33 historical
 *  symbols with no clearing condition, and an unresolved row blocks that symbol's every future page). Exactness against the
 *  sibling keys holds: `price-skip-config-<mode>-<class>` has no `/`, and the venue-quiet keys do not start `price-skip-`. */
export function priceSkipKeyPattern(mode: string): RegExp {
  return new RegExp(`^price-skip-${mode}-([A-Z0-9.]+/[A-Z0-9]{${QUOTE_LEN_MIN},${QUOTE_LEN_MAX}})$`);
}
export const standingKey = (mode: string) => `venue-quiet-${mode}-xstock_spot`;
export const stuckKey = (mode: string) => `venue-quiet-resolve-stuck-${mode}`;
export const configKey = (mode: string, cls: string) => `price-skip-config-${mode}-${cls}`;

export interface SweepAlertRow {
  id: string;
  dedupe_key?: string | null;
  state: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}
export interface SweepPosition { id: string; symbol: string; assetClass?: string | null }

export interface SweepDeps {
  listAlerts: () => SweepAlertRow[];
  resolveByKey: (key: string, by: string, evidence: string, transport: 'engine') => Promise<string[]>;
  addAlert: (opts: Record<string, unknown>) => Promise<{ id: string }>;
  /** r7 (FINDING-1): clear the engine's escalation latch and skip streak for a position, so its next skips are judged afresh
   *  by the engine's own rule. In memory; it cannot fail. */
  clearLatch: (positionId: string) => void;
}

/**
 * Per-engine state for the sweep. Everything here is RE-ESTABLISHED by observation after a restart: `lastPricedAt` fills
 * as the engine prices positions, `thresholdReadOk` as the knob reads — nothing depends on a pre-restart memory.
 */
export class VenueQuietState {
  lastPricedAt = new Map<string, number>();          // positionId -> last venue price, this process
  /** Asset classes whose skip threshold read cleanly in this process. It only GROWS: once a class has read, its config row
   *  is resolvable; a later cold read (boot ordering only — the cache is swap-on-success, never deleted) does not un-read it. */
  thresholdReadOk = new Set<string>();
  /** Symbols already escalated on duration in the current not-quiet window — so the sweep line counts NEW escalations, not
   *  a re-push every minute (Langston Step-4 record item 3). Cleared when the class turns quiet again. */
  durationEscalated = new Set<string>();
  notQuietSince: number | null = null;               // when the xStock class last turned not-quiet
  failingSince = new Map<string, number>();          // dedupe key -> first failed resolve, this process
  lastVerdict: ClassVerdict | null = null;
  /** r7: the US session at the previous sweep — so the duration clock can be reset when the regular session ENDS. */
  lastSession: XstockSession | null = null;

  notePriced(positionId: string, nowMs: number): void { this.lastPricedAt.set(positionId, nowMs); }

  /** `notQuietSince` = the first sweep this process saw the class not quiet, reset by any quiet sweep. After a restart in
   *  liquid hours it starts at the first sweep — duration escalation is then later, never earlier, than true. */
  noteVerdict(v: ClassVerdict, nowMs: number): void {
    // The CLOCK runs on anything but quiet (thin included): a member listed during QUIET carries `_priceSkipEscalated`, so
    // when the class turns thin it cannot re-page through the rail and the duration path is its only rescue (Langston
    // Step-4 BLOCKER-2). What `thin` must NOT do is read as "the venue resumed" — see the resolve and the prose below.
    // r4: a scheduled close is no more a "not-quiet" window than a quiet market is — the clock does not run across a weekend.
    // r7 (Langston BLOCKER-2, 2026-10-13): nor across the DAILY close. On 10-12 the clock ran from 13:45:37Z through 391
    // not-quiet sweeps, so at 20:16:51Z it read 6 h 31 m against 30 min: a member joining after the close would have been
    // duration-paged at the next not-quiet flicker (4 of 19 sweeps in the wind-down) with a "the cohort was updating" body.
    const session = getXstockSession(nowMs);
    const leftRegular = this.lastSession === 'regular' && session !== 'regular';
    this.lastSession = session;
    if (v === 'quiet' || v === 'closed' || leftRegular) { this.notQuietSince = null; this.durationEscalated.clear(); }
    if (v !== 'quiet' && v !== 'closed' && this.notQuietSince === null) this.notQuietSince = nowMs;
    this.lastVerdict = v;
  }
}

/** `held` (r6, Langston 2026-10-11): the standing record's members still unpriced at this sweep, with each one's own family —
 *  what is HOLDING the record open. Before r6 this list was computed and discarded unless a duration page fired, so a record
 *  that did not resolve could not name the member blocking it (the deciding quantity logged only when it released). */
export interface SweepResult {
  resolved: string[]; failed: number; escalated: string[]; unmatched: string[];
  held: Array<{ symbol: string; reasonFamilies: ReasonFamily[] }>;
}

/** r6b (Langston r6 BLOCKER-1): a member's FULL family set, never only its dominant family — the minority fact class must
 *  veto, not lose a ranking. Live 2026-10-10: 11 of 16 members carried `book_state` in `reasonFamilies` and 0 of 16 in
 *  `reasonFamily`. Members listed before r5 carry only `reasonFamily`; they fall back to it. */
export function memberFamilies(mem: { reasonFamily?: ReasonFamily | null; reasonFamilies?: ReasonFamily[] }): ReasonFamily[] {
  if (Array.isArray(mem.reasonFamilies) && mem.reasonFamilies.length > 0) return [...mem.reasonFamilies];
  return mem.reasonFamily ? [mem.reasonFamily] : [];
}

/**
 * One sweep (objective 9): re-measure every non-terminal row this rail owns and resolve the cleared ones. Never throws —
 * a failing resolve is logged, counted and retried next sweep; a key failing for `resolveStuckAfterMs` raises one
 * `venue-quiet-resolve-stuck-<mode>` row, which itself clears once nothing is failing.
 */
export async function sweepVenueQuiet(args: {
  mode: string;
  nowMs: number;
  openPositions: SweepPosition[];
  state: VenueQuietState;
  cfg: VenueQuietConfig;
  verdict: ClassVerdict;
  deps: SweepDeps;
}): Promise<SweepResult> {
  const { mode, nowMs, openPositions, state, cfg, verdict, deps } = args;
  const out: SweepResult = { resolved: [], failed: 0, escalated: [], unmatched: [], held: [] };
  state.noteVerdict(verdict, nowMs);
  const bySymbol = new Map<string, SweepPosition[]>();
  for (const p of openPositions) bySymbol.set(p.symbol.toUpperCase(), [...(bySymbol.get(p.symbol.toUpperCase()) ?? []), p]);
  const pricedAfter = (p: SweepPosition, sinceMs: number) => (state.lastPricedAt.get(p.id) ?? -Infinity) > sinceMs;
  const skipPat = priceSkipKeyPattern(mode);

  const tryResolve = async (key: string, evidence: string) => {
    try {
      const ids = await deps.resolveByKey(key, VENUE_QUIET_ACTOR, evidence, 'engine');
      out.resolved.push(...ids);
      state.failingSince.delete(key);
    } catch (err: any) {
      out.failed++;
      if (!state.failingSince.has(key)) state.failingSince.set(key, nowMs);
      console.error(`[VENUE_QUIET][RESOLVE_FAILED] key=${key} err=${err?.message ?? err}`);
    }
  };

  const rows = deps.listAlerts().filter((a) => a.state !== 'resolved' && a.dedupe_key);
  for (const row of rows) {
    const key = row.dedupe_key as string;
    const createdMs = Date.parse(row.created_at);
    const m = skipPat.exec(key);
    if (m) {
      const positions = bySymbol.get(m[1]) ?? [];
      if (positions.length === 0) {
        const ev = typeof row.metadata?.positionId === 'string' ? clearEvidence.positionClosed(row.metadata.positionId as string) : 'NO-EVIDENCE-GIVEN';
        await tryResolve(key, ev); // the position this row was minted for has closed
        continue;
      }
      const priced = positions.find((p) => pricedAfter(p, createdMs));
      if (priced) { await tryResolve(key, clearEvidence.pricedAfterMint(priced.id)); continue; } // the RE-MEASURED position's uuid (Langston record fix)
      // r7 (FINDING-1): a row minted OUTSIDE the regular session and still held when it is regular would swallow the in-session
      // page the rule promises — the engine latches before it decides and never sees its mint swallowed. Hand the position back
      // to the engine's own rule: clear its latch FIRST (in memory, cannot fail), then resolve; a failed resolve retries next
      // sweep (Langston's ordering, 2026-10-13). The sweep mints nothing: the streak re-crosses in session and is judged there.
      // ⛔ FAMILY-AGNOSTIC ON PURPOSE (Langston 2026-10-13 condition 4): the session gate stops quiet-only off-session mints, but
      // `thin`, `null` and an `other` minority still mint off-session and still hold their key — do not re-narrow this to book_state.
      // Step-10 F1 (Langston): the row names its own position — prefer it. A class find can pick a DIFFERENT same-symbol
      // position (unreachable while active xStock is long-only, `unique_symbol_side` on (symbol, side)), clear the wrong
      // latch and lose the row's own in-session page. The class find stays only for rows minted without a positionId.
      const rowPid = typeof row.metadata?.positionId === 'string' ? (row.metadata.positionId as string) : null;
      const xs = rowPid
        ? positions.find((p) => p.id === rowPid && p.assetClass === 'xstock_spot')
        : positions.find((p) => p.assetClass === 'xstock_spot');
      if (xs && getXstockSession(createdMs) !== 'regular' && getXstockSession(nowMs) === 'regular') {
        deps.clearLatch(xs.id);
        await tryResolve(key, clearEvidence.supersededBySessionChange(xs.id));
      }
      continue;
    }
    if (key === standingKey(mode)) {
      const members = (row.metadata?.members ?? {}) as Record<string, { symbol: string; listedAtMs: number; lastJoinedAtMs?: number; lastPricedAtMs?: number; reasonFamily?: ReasonFamily; reasonFamilies?: ReasonFamily[] }>;
      // `unpricedSinceMs` is THIS symbol's own clock (Langston Step-4 r2 condition): its last venue price in this process
      // if one was seen, else the moment it was listed — a lower bound, hence "at least". Never the class's
      // `notQuietSince`: a member listed one minute into a 90-minute window has not been out for 90 minutes.
      const stillOut: Array<{ positionId: string; symbol: string; unpricedSinceMs: number; reasonFamily: ReasonFamily | null; reasonFamilies: ReasonFamily[] }> = [];
      for (const [positionId, mem] of Object.entries(members)) {
        const open = (bySymbol.get(mem.symbol.toUpperCase()) ?? []).find((p) => p.id === positionId);
        // r6c: "priced since it last JOINED" decides membership (a member priced, re-staled and re-joined is out again);
        // the unpriced CLOCK below keeps the earliest listing (FINDING-B) when this process has never priced it.
        if (open && !pricedAfter(open, mem.lastJoinedAtMs ?? mem.listedAtMs)) {
          // r6c condition: "unpriced since" = this process's last price, else the last price carried on the row, else the
          // listing — so `mins` stays a lower bound across a restart (it never reads from a listing that a later price superseded).
          stillOut.push({ positionId, symbol: mem.symbol, unpricedSinceMs: state.lastPricedAt.get(positionId) ?? mem.lastPricedAtMs ?? mem.listedAtMs,
            reasonFamily: mem.reasonFamily ?? null, reasonFamilies: memberFamilies(mem) });
        }
      }
      out.held = stillOut.map((s) => ({ symbol: s.symbol, reasonFamilies: s.reasonFamilies }));
      // RESOLVE only when the venue genuinely resumed (`not_quiet`) — never on `thin`, which is the feed dying, not the
      // market returning (Langston Step-4 BLOCKER-2: a tri-state must not be tested with `!== 'quiet'`).
      if (verdict === 'not_quiet' && stillOut.length === 0) {
        await tryResolve(key, Object.keys(members)[0] ?? 'NO-EVIDENCE-GIVEN');
        continue;
      }
      // Duration escalation (objective 3 / r1a §6.1). Fires on not_quiet AND thin (the clock above); the PROSE branches on
      // the verdict, because the two mean opposite things about the cohort.
      // r4: by name, never `!== 'quiet'` — `closed` must not reach the duration page (the BLOCKER-2 lesson, one verdict later).
      if ((verdict === 'not_quiet' || verdict === 'thin') && state.notQuietSince !== null && nowMs - state.notQuietSince >= cfg.escalateAfterMs) {
        // The cohort statement is TIME-QUALIFIED (Langston record item, folded in-batch): `durationEscalated` holds the
        // symbol for the whole window, so this is its only page in that window — a thin reading at 09:30 must not read as
        // a claim about 09:45, and a not-quiet one must not read as a claim about later either.
        const at = new Date(nowMs).toISOString().slice(11, 16) + 'Z';
        for (const s of stillOut) {
          if (state.durationEscalated.has(s.symbol)) continue;
          const mins = Math.round((nowMs - s.unpricedSinceMs) / 60000);
          // r5 (Langston r4 BLOCKER-1) + r6b (r6 BLOCKER-1): worded from the member's FAMILY SET — a member whose streak
          // carried any book-state refusal is a symbol whose prices arrive and our own check refuses, not one with no mark.
          const bookState = s.reasonFamilies.includes('book_state');
          const what = bookState
            ? `Our own book-state check has refused ${s.symbol}'s order book for at least ${mins} min` +
              (s.reasonFamilies.includes('quiet_market') ? ' (its mark has also been too old to use)' : '')
            : `${s.symbol} has had no usable mark for at least ${mins} min`;
          const body = verdict === 'thin'
            ? `${what}. At ${at}, fewer than ${cfg.thinTickingMin} xStock symbols were updating at all — the whole feed was near-silent, not just this symbol. Check the equities socket and the venue before this position.`
            : `${what}. At ${at} the xStock venue was not quiet — the cohort was updating and this symbol was not: a lost subscription or a stuck book, not a quiet market.`;
          const pageKey = `price-skip-${mode}-${s.symbol}`;
          // r6b (Langston r6 BLOCKER-2): a non-terminal row on this key — e.g. an off-session page the member's book-state
          // basis left held — would make `addAlert` return it and write nothing. Resolve it first as SUPERSEDED by this
          // duration page (evidence = the position's uuid); if that resolve fails, do not mint and do not flag — retry next sweep.
          const held = rows.filter((a) => a.dedupe_key === pageKey);
          if (held.length > 0) {
            const before = out.failed;
            await tryResolve(pageKey, clearEvidence.supersededByDurationPage(s.positionId));
            if (out.failed > before) continue;
          }
          const minted = await deps.addAlert({
            triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
            title: verdict === 'thin'
              ? `Exit checks still skipped and the xStock feed is near-silent — ${s.symbol}`
              : `Exit checks still skipped after the venue resumed — ${s.symbol}`,
            body,
            metadata: { positionId: s.positionId, reasonFamily: s.reasonFamily, reasonFamilies: s.reasonFamilies, classVerdict: verdict, escalation: 'duration' },
            dedupe_key: pageKey,
          });
          // Flag ONLY a row actually created: `addAlert` hands back an existing non-terminal row unchanged on a dedupe hit.
          const heldIds = new Set(held.map((a) => a.id));
          if (!minted || !minted.id || heldIds.has(minted.id)) {
            console.error(`[VENUE_QUIET][DURATION_SUPPRESSED] key=${pageKey} — a held row was returned, nothing written; retrying next sweep`);
            continue;
          }
          state.durationEscalated.add(s.symbol);
          out.escalated.push(s.symbol);
        }
      }
      continue;
    }
    if (key.startsWith(`price-skip-config-${mode}-`)) {
      const cls = key.slice(`price-skip-config-${mode}-`.length);
      if (state.thresholdReadOk.has(cls)) await tryResolve(key, THRESHOLD_SEED_REF);
      continue;
    }
    if (key === stuckKey(mode) && state.failingSince.size === 0) {
      await tryResolve(key, SWEEP_REF);
      continue;
    }
    // Langston Step-4 BLOCKER-1: a key that LOOKS like this rail's but the selector rejects would never resolve — and would
    // block its symbol's every future page. Count and log it, so the next blind spot announces itself.
    if (key.startsWith(`price-skip-${mode}-`)) {
      out.unmatched.push(key);
      console.error(`[VENUE_QUIET][KEY_UNMATCHED] key=${key} — a price-skip row the sweep cannot select; it will never self-resolve`);
    }
  }

  const stuck = [...state.failingSince.entries()].filter(([, since]) => nowMs - since >= cfg.resolveStuckAfterMs);
  if (stuck.length > 0) {
    await deps.addAlert({
      triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
      title: `Venue-quiet sweep cannot resolve ${stuck.length} alert(s)`,
      body: `The exit monitor's re-measure sweep has failed to resolve these keys for over ${Math.round(cfg.resolveStuckAfterMs / 60000)} min: ${stuck.map(([k]) => k).join(', ')}. Read [VENUE_QUIET][RESOLVE_FAILED] in out.log.`,
      metadata: { keys: stuck.map(([k]) => k) },
      dedupe_key: stuckKey(mode),
    });
  }
  return out;
}
