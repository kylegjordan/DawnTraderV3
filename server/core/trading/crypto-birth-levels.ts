// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B-PRICE-SIDE-BY-JOB row `8c` (switch-on) — A CRYPTO SIGNAL'S LEVELS, BUILT ON THE PRICES A COUNTERPARTY FILLS.
// Plan: `Scope Files/B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md` §9 (amendment 4, RULED 2026-11-07) + the 09-28 conditions.
//
// A strategy builds its triple on the smoothed MID. At birth, on the crypto active lane:
//   entry            → the ASK (the taker's role price). The maker arm's entry is the BID it would rest at.
//   stop / target    → re-derived BY THEIR STAMPED FORM onto the BID (the side the exit trigger reads, `8a-P2`/`8a-P3`):
//                      anchor unchanged · distance + (bid − mid) · proportional × bid/mid · r_multiple against the ASK.
// It is `#1250`'s transform (`rebaseLevels`) at a second moment: `fill` = the bid (the level basis), `entryBasis` = the ask.
//
// ⛔ CONDITION 1 — NO MIDPOINT FALLBACK, BY CONSTRUCTION. Every arm that cannot put a leg on the transactable side REFUSES:
//   no transactable quote · no stamp · a malformed stamp · a stamp that does not reproduce the strategy's own plan.
//   (`rebaseLevels` keeps an inconsistent leg ON THE PLAN — right at the xStock fill, where the plan is a fail-safe; at
//   crypto birth "the plan" is the mid, so the same outcome is the fallback condition 1 forbids. It is refused here.)
// ⭐ IDEMPOTENT: a triple already stamped `levelGeometry: 'sided'` (a HYBRID re-sizing an already-sized quant signal) is
//   returned unchanged — a second pass would move its distance legs a second time.
// PURE: no I/O, no clock, no config read — the quote, the knobs and the time arrive as arguments.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { rebaseLevels, isWellFormedLegSpec, type LevelSpec, type LegBasis } from './level-rebase.js';

export type LevelGeometry = 'mid' | 'sided';

/**
 * THE ONE READER of a signal's level geometry. `'sided'` ONLY on the exact stamp this module writes; everything else —
 * xStock, VTS, a crypto row queued before the switch-on — is a mid-priced triple and keeps today's arithmetic.
 */
export function levelGeometryOf(metadata: unknown): LevelGeometry {
  return metadata !== null && typeof metadata === 'object'
    && (metadata as Record<string, unknown>).levelGeometry === 'sided' ? 'sided' : 'mid';
}

/**
 * The MAKER arm's entry on a sided triple — the bid recorded at the build — or null when the triple is not sided or the
 * record is unusable. ONE reader for the birth decision and the engine's resting limit: on a sided triple the signal's
 * `entryPrice` is the ASK, and a buy limit resting at the ask is marketable by construction (it would cross every time).
 */
export function makerEntryOf(metadata: unknown): number | null {
  if (levelGeometryOf(metadata) !== 'sided') return null;
  const s = readSidedStamp(metadata);
  return s === null ? null : s.bid;
}

/** The transactable quote the levels are built on — the ladder's accepted rung (`selectTouchPrice`). */
export interface BirthQuote {
  bid: number;
  ask: number;
  /** `book_top` | `ticker_bbo` — the rung taken. */
  basis: string;
  producer: string;
  ageMs: number;
}

/** What every built level carries (§5 ruling: the accepted age AND the f it implies; Step 7 stratifies by stop distance). */
export interface LevelBasisAtBirth {
  bid: number;
  ask: number;
  /** The strategy's own entry — the mid-basis the legs were re-derived from. */
  planEntry: number;
  planStop: number;
  planTarget: number;
  basis: string;
  producer: string;
  ageMs: number;
  stopBasis: LegBasis;
  targetBasis: LegBasis;
  /** (ask − stop) / ask, on the built levels. */
  stopDistanceFraction: number;
  /** (driftRef60s / stopDistanceFraction) · √(age / 60 s) — the stale-side cost relative to the stop. */
  f: number;
  driftRef60s: number;
  maxAgeMs: number;
}

export type BirthLevelRefusal =
  | 'no_transactable_basis'
  | 'level_spec_absent'
  | 'level_spec_malformed'
  | 'level_spec_inconsistent'
  | 'level_geometry_stamp_malformed'
  | `rebase_${string}`;

export type BirthLevelsOutcome =
  | {
      ok: true;
      /** true ⇒ the triple was already sided; nothing moved. */
      alreadySided: boolean;
      entryPrice: number;
      entryPriceMaker: number;
      stopPrice: number;
      targetPrice: number;
      /** The metadata to MERGE onto the signal: `levelGeometry: 'sided'` + `levelBasisAtBirth`. */
      stamp: { levelGeometry: 'sided'; levelBasisAtBirth: LevelBasisAtBirth };
    }
  | { ok: false; reason: BirthLevelRefusal };

const finitePos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function readSidedStamp(metadata: unknown): LevelBasisAtBirth | null {
  const lb = (metadata as { levelBasisAtBirth?: unknown } | null | undefined)?.levelBasisAtBirth;
  if (!lb || typeof lb !== 'object') return null;
  const o = lb as Record<string, unknown>;
  return finitePos(o.bid) && finitePos(o.ask) && (o.bid as number) <= (o.ask as number) ? (lb as LevelBasisAtBirth) : null;
}

export function baseCryptoLevelsAtBirth(i: {
  planEntry: number;
  planStop: number;
  planTarget: number;
  metadata: unknown;
  /** The accepted quote, or null when the ladder refused both rungs. */
  quote: BirthQuote | null;
  knobs: { maxAgeMs: number; driftRef60s: number };
}): BirthLevelsOutcome {
  // ── Idempotence: already sided ⇒ unchanged. The maker entry is the bid recorded when it was sided.
  if (levelGeometryOf(i.metadata) === 'sided') {
    const prior = readSidedStamp(i.metadata);
    if (prior === null) return { ok: false, reason: 'level_geometry_stamp_malformed' };
    return {
      ok: true, alreadySided: true,
      entryPrice: i.planEntry, entryPriceMaker: prior.bid, stopPrice: i.planStop, targetPrice: i.planTarget,
      stamp: { levelGeometry: 'sided', levelBasisAtBirth: prior },
    };
  }

  const q = i.quote;
  if (q === null || !finitePos(q.bid) || !finitePos(q.ask) || q.bid > q.ask || !(q.ageMs >= 0)) {
    return { ok: false, reason: 'no_transactable_basis' };
  }

  // ── The stamp: both legs present and well-formed (ruling item 4 — absent or malformed is a refusal at crypto birth).
  const spec = (i.metadata as { levelSpec?: unknown } | null | undefined)?.levelSpec;
  if (spec === undefined || spec === null) return { ok: false, reason: 'level_spec_absent' };
  if (typeof spec !== 'object') return { ok: false, reason: 'level_spec_malformed' };
  const s = spec as LevelSpec;
  if (!isWellFormedLegSpec(s.stop) || !isWellFormedLegSpec(s.target)) return { ok: false, reason: 'level_spec_malformed' };
  if (s.targetIsCap !== undefined && typeof s.targetIsCap !== 'boolean') return { ok: false, reason: 'level_spec_malformed' };

  // ── The transform. `tick: null`: the venue-grid seam rounds the whole triple next, with the stamp's cap bit.
  const r = rebaseLevels({
    planEntry: i.planEntry, planStop: i.planStop, planTarget: i.planTarget,
    fill: q.bid, entryBasis: q.ask, spec: s, tick: null,
  });
  if (!r.ok) return { ok: false, reason: `rebase_${r.reason}` };
  if (r.inconsistent.length > 0) return { ok: false, reason: 'level_spec_inconsistent' };

  const stopDistanceFraction = (q.ask - r.stopPrice) / q.ask;
  const f = (i.knobs.driftRef60s / stopDistanceFraction) * Math.sqrt(q.ageMs / 60_000);
  return {
    ok: true, alreadySided: false,
    entryPrice: q.ask, entryPriceMaker: q.bid, stopPrice: r.stopPrice, targetPrice: r.targetPrice,
    stamp: {
      levelGeometry: 'sided',
      levelBasisAtBirth: {
        bid: q.bid, ask: q.ask,
        planEntry: i.planEntry, planStop: i.planStop, planTarget: i.planTarget,
        basis: q.basis, producer: q.producer, ageMs: q.ageMs,
        stopBasis: r.stopBasis, targetBasis: r.targetBasis,
        stopDistanceFraction, f,
        driftRef60s: i.knobs.driftRef60s, maxAgeMs: i.knobs.maxAgeMs,
      },
    },
  };
}
