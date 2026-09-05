/**
 * B-XSTOCK-FEED-SANITY — THE BOOK-STATE TRACKER: the pair's OWN comparator, and the one reader
 * every label site calls.
 *
 * WHAT LIVES HERE. Per xStock symbol, the last frame ACCEPTED AS THE REFERENCE (its bid, ask,
 * last, mid, time) and a short ring of recent accepted spreads. Accepted means: a frame the
 * predicate read as `two_sided`, OR the one SEEDING frame at a symbol's cold start (see below) —
 * and in either case only after the writer's own invariants (`mid > 0`, `ask >= bid`) hold.
 * That is the "own price history" the binding constraint names (scope §2.1b / §17.1): never a
 * second venue, never the clock, never the session.
 *
 * ★ SIM CROSS-CUTTING RUNTIME STATE — a NEW module singleton, registered as such: `_comparators`
 * is MODE-INVARIANT market data (both engines read the same feed; the same class as S2/S5), one
 * writer (`advanceBookStateComparator`, called by the engine on a `two_sided` verdict AND on the
 * first frame of a symbol, where only `unknown`/`no_comparator` is reachable), any
 * number of readers (`assessBookStateNow`). Never keyed by mode. Never persisted. Empties on
 * restart (the FIRST frame after boot seeds it and reads `unknown`; judging starts on the second — which is
 * the honest cold state, and it is labelled).
 *
 * ⛔ A HOLLOW FRAME MUST NEVER BECOME THE REFERENCE the next frame is judged against — otherwise a
 * sustained hollow run would quietly re-baseline itself into "two_sided" one frame later. THAT is
 * the invariant. The header used to state it as a rule about WHICH VERDICT PERMITS AN ADVANCE, and
 * that phrasing was WRONG — so strict that the comparator could never be seeded at all, which is
 * precisely how this guard shipped INERT on 2026-09-03 (zero `COMPARATOR_SEEDED` in 34 min, five
 * open positions). ⚠ The retired sentence is NOT reproduced here even as a quotation: `F-CROSSED`
 * fences the file against that wording, and a fence you are allowed to quote past is not a fence.
 *
 * The SEEDING frame is not an exception to the invariant: at cold start there is no reference yet,
 * so there is nothing a hollow frame could re-baseline. Every OTHER advance still
 * requires `two_sided`, and the writer refuses a crossed or non-positive-mid frame outright.
 *
 * WHO READS. (1) the exit loop, at the decision instant (and it is the only ADVANCER);
 * (2) `closePosition` at the fill instant; (3) `closeAllPositions` and the two manual routes, for
 * the label only. All four call `assessBookStateNow(symbol)`; none of them re-implements the read.
 */
import { getLatestEquityTick, type EquityTickRaw } from '../../services/passive-archive/equity-spot-archiver.js';
import { assessBookState, medianOf, type BookStateConfig, type BookStateResult } from './book-state.js';
import { resolveBookStateConfigSync } from './book-state-config.js';

export interface BookStateComparator {
  priorMid: number;
  priorBid: number;
  priorAsk: number;
  priorLast: number | null;
  priorAtMs: number;
  /** Recent two-sided spreads as a fraction of mid, newest last; bounded by the knob. */
  spreads: number[];
  /**
   * ⛔⛔ FALSE UNTIL A `two_sided` VERDICT HAS ADVANCED THIS CHAIN — i.e. the reference is still
   * the COLD-START SEED, which BY CONSTRUCTION was never judged against anything.
   * ★ WHY THIS FIELD EXISTS (Langston, Step-8 finding, 2026-09-03): `no_comparator` is reached
   * past the absent-bid/absent-ask branches, so a **collapsed-but-positive, uncrossed** book —
   * exactly the shape this batch exists to refuse — reads `unknown/no_comparator` and IS seedable.
   * A hollow frame therefore CAN become the reference. That cannot be fixed by judging the seed
   * (there is nothing to judge it against); it can only be BOUNDED and LABELLED.
   * ⇒ an unvalidated reference wearing a validated reference's label is `#546` exactly, so the
   *   label is carried into the row rather than inferred.
   */
  validated: boolean;
  /** When this reference CHAIN began (the seed frame's own time). Survives validation. */
  seededAtMs: number;
  /** Advances against this chain since the seed, so a fresh seed is distinguishable from a settled one. */
  framesSinceSeed: number;
}

const _comparators = new Map<string, BookStateComparator>();

export function readBookStateComparator(symbol: string): BookStateComparator | null {
  return _comparators.get(symbol.toUpperCase()) ?? null;
}

/**
 * Advance the pair's comparator. Called on a `two_sided` verdict, and — since the seeding fix —
 * on the FIRST frame of a symbol, where the predicate can only return `unknown`/`no_comparator`.
 *
 * ⛔⛔ THE WRITER OWNS ITS OWN INVARIANT, AND THAT IS THE LESSON OF THE DEADLOCK THIS REPLACED
 * (Langston condition 1, 2026-09-03). The old rule "only a two_sided frame may become the
 * reference" lived in the CALLER's condition — and the caller is exactly what was wrong. A rule
 * enforced only by its callers is enforced by whoever remembers it.
 * ⇒ `no_comparator` guarantees both sides are POSITIVE (it is reached past the absent-bid and
 *   absent-ask branches) but NOT that the book is uncrossed: `twoSidedNow` also requires
 *   `ask >= bid`, and nothing on the seed path checked it. A CROSSED frame would seed a reference
 *   the predicate itself would never accept, and push a NEGATIVE spread into the trailing ring.
 * ⇒ So the check is HERE, where every caller present and future inherits it.
 */
export function advanceBookStateComparator(
  symbol: string,
  frame: { bid: number; ask: number; last: number | null; atMs: number },
  windowSnaps: number,
  /**
   * ⛔ TRUE only when a `two_sided` VERDICT produced this advance. The writer cannot derive this —
   * it never sees the verdict — so it is the ONE thing the caller must state. That is not a
   * relapse into the caller-owned-invariant shape C1 fixed: an INVARIANT the writer can check
   * itself (mid > 0, ask >= bid) stays here; a FACT only the caller holds is passed in. Defaulting
   * to `false` is the fail-safe direction — an unstated advance is treated as unvalidated.
   */
  validatedByTwoSided: boolean = false,
): void {
  const key = symbol.toUpperCase();
  const mid = (frame.bid + frame.ask) / 2;
  if (!(mid > 0)) return;
  // ⛔ CROSSED BOOK — never becomes the reference, whoever asks.
  if (!(frame.ask >= frame.bid)) return;
  const prev = _comparators.get(key);
  const spreads = (prev?.spreads ?? []).concat((frame.ask - frame.bid) / mid);
  while (spreads.length > Math.max(5, windowSnaps)) spreads.shift();
  // THE EMITTER'S POSITIVE CONTROL (Langston, 2026-09-03 01:26Z): the guard's skip/yield lines fire only
  // on hollow ticks, so a night with no hollow tick on a held name is indistinguishable from an unarmed
  // guard. This line fires ONCE per symbol, on the FIRST FRAME that seeds its comparator (a
  // `no_comparator` verdict, not a `two_sided` one — that was the deadlock) —
  // proof the guard ran on that symbol before any zero on it is read as evidence.
  if (!prev) {
    console.log(`[B-XSTOCK-FEED-SANITY][BOOK_STATE] ${key} COMPARATOR_SEEDED mid=${mid} spread=${((frame.ask - frame.bid) / mid).toFixed(5)} at=${new Date(frame.atMs).toISOString()}`);
  }
  _comparators.set(key, {
    priorMid: mid, priorBid: frame.bid, priorAsk: frame.ask,
    priorLast: frame.last, priorAtMs: frame.atMs, spreads,
    // once validated, STAYS validated for the life of the chain — a later seed starts a new chain
    validated: (prev?.validated ?? false) || validatedByTwoSided,
    seededAtMs: prev?.seededAtMs ?? frame.atMs,
    framesSinceSeed: prev ? prev.framesSinceSeed + 1 : 0,
  });
}

/**
 * ⛔⛔ DROP THE REFERENCE — CALLED ON YIELD, AND IT IS THE FIX FOR A **LATCH**, NOT A TIDY-UP
 * (Langston, Step-8 finding, 2026-09-03; his mechanism, my disposition).
 *
 * ★ THE DEFECT IT CLOSES. A hollow-shaped frame with no prior seeds the comparator (see
 * `validated` above). From then on the engine's two exits BOTH bypass the advance: the hollow
 * branch `continue`s, and the yield path deletes the streak and falls through — so the advance,
 * which sits in the `else`, is unreachable while a bad reference is in place. **THE COMPARATOR CAN
 * THEREFORE NEVER LEAVE A BAD SEED.** A healthy book measured against it reads `mark_deviation`
 * ⇒ hollow ⇒ 60 skips ⇒ yield ⇒ still no advance ⇒ 60 skips … permanently, until a restart.
 * Exit monitoring silently degrades from the ~1.5 s loop cadence to roughly one look per yield.
 *
 * ⇒ **A YIELD IS THE PROOF THE REFERENCE IS UNUSABLE.** It means this reference produced an
 * unactionable verdict on `hollowSkipCap` CONSECUTIVE frames. Continuing to trust it is the one
 * thing we positively know is wrong, so the yield drops it and the next frame re-seeds.
 * ★ NO NEW KNOB — it reuses the cap that already bounds the withholding. A new threshold on a new
 * object is what `#996` was refused for, and inventing one here would repeat that.
 * ⚠️ **WHAT THIS DOES *NOT* FIX, STATED PLAINLY:** a genuinely hollow book at seed time still
 * produces a reference that makes the next hollow frames read `two_sided` — the guard passing the
 * run it exists to refuse. That arm cannot be judged relatively (there is no prior), so it is
 * LABELLED via `validated` and measured, not guessed at with a fresh threshold.
 */
export function clearBookStateComparator(symbol: string, reason: string): void {
  const key = symbol.toUpperCase();
  const prev = _comparators.get(key);
  if (!prev) return;
  _comparators.delete(key);
  console.warn(`[B-XSTOCK-FEED-SANITY][BOOK_STATE] ${key} COMPARATOR_CLEARED reason=${reason} validated=${prev.validated} framesSinceSeed=${prev.framesSinceSeed} seededAt=${new Date(prev.seededAtMs).toISOString()}`);
}

export type BookStateNow =
  | {
      ok: true; result: BookStateResult; cfg: BookStateConfig; raw: EquityTickRaw;
      /**
       * ⛔⛔ D3 FIX 2026-09-05 — `validated` HAD ZERO CONSUMERS. IT IS NOW RETURNED, SO IT CAN
       * HAVE ONE.
       *
       * The flag was written at the advance, printed in the CLEARED line, and READ BY NOTHING —
       * a census repo-wide (tests excluded) found no reader at all. So the field this batch added
       * to bound a bad seed changed no behaviour whatsoever. ★ The file's own docstring predicted
       * it exactly: *"an unvalidated reference wearing a validated reference's label is `#546`."*
       * I wrote that sentence, shipped the field, and never wired the consumer.
       *
       * ⚠️ WHAT THIS DOES AND DOES NOT DO, STATED SO IT IS NOT OVER-READ. It makes the fact
       * READABLE and RECORDABLE — a `two_sided` verdict from a comparator that has never been
       * validated by an independently-plausible frame can now be told apart from a trusted one,
       * at the decision site and in the record. **It does NOT change any verdict.**
       * ⛔ It CANNOT: the circularity is real — a comparator seeded from a hollow frame makes the
       * next hollow frame read `two_sided`, and that verdict is what would validate it. Breaking
       * that needs an ABSOLUTE plausibility test which no reference can supply, and that changes
       * exit behaviour, so it is a separate gated decision. **This fix stops the field lying; it
       * does not close the hole.**
       */
      comparatorValidated: boolean | null;
      /** Frames since this comparator was seeded — `null` when there is no comparator. */
      comparatorFramesSinceSeed: number | null;
    }
  | { ok: false; reason: 'no_tick' | 'knobs_missing' | 'disabled'; cfg?: BookStateConfig; error?: string };

/**
 * The one reader. Pure with respect to state: it reads the tick and the comparator and never
 * advances either — the ENGINE advances after acting (so a label read at a fill or a flatten
 * cannot move the comparator under the decision loop).
 */
export function assessBookStateNow(symbol: string): BookStateNow {
  let cfg: BookStateConfig;
  try {
    cfg = resolveBookStateConfigSync();
  } catch (err) {
    return { ok: false, reason: 'knobs_missing', error: err instanceof Error ? err.message : String(err) };
  }
  if (!cfg.enabled) return { ok: false, reason: 'disabled', cfg };
  const tick = getLatestEquityTick(symbol);
  const raw: EquityTickRaw | undefined = tick?.raw;
  if (!tick || !raw) return { ok: false, reason: 'no_tick', cfg };
  const cmp = readBookStateComparator(symbol);
  const result = assessBookState(
    {
      bid: raw.bid, ask: raw.ask, last: raw.last,
      priorTwoSidedMid: cmp?.priorMid ?? null,
      priorBid: cmp?.priorBid ?? null,
      priorAsk: cmp?.priorAsk ?? null,
      priorLast: cmp?.priorLast ?? null,
      trailingMedianSpreadFrac: cmp ? medianOf(cmp.spreads) : null,
      // Candidate (ii) is INERT by knob (`feed_read_enabled = 0`) until F4's re-measure lands; the
      // cohort read is wired then, on the guard's own telemetry — not stubbed here.
      feedStubFraction: null,
      feedCohortN: null,
    },
    cfg,
  );
  return {
    ok: true, result, cfg, raw,
    comparatorValidated: cmp ? cmp.validated : null,
    comparatorFramesSinceSeed: cmp ? cmp.framesSinceSeed : null,
  };
}

/** Test-only: reset every comparator. */
export function _resetBookStateComparatorsForTest(): void { _comparators.clear(); }
