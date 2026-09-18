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
  /**
   * ⛔⛔ TRUE WHEN THIS CHAIN WAS SEEDED ON A FRAME THE RETAINED SPREAD RING SAYS IS IMPLAUSIBLE,
   * AND IT PERMANENTLY BLOCKS `validated` FOR THE CHAIN'S LIFE (8a r3, Langston BLOCKER-1,
   * 2026-09-12).
   *
   * ★ WHY IT EXISTS — `validated` ALONE CANNOT WORK, AND THIS FILE SAID SO 50 LINES BELOW:
   *   *"a comparator seeded from a hollow frame makes the next hollow frame read `two_sided`,
   *   and that verdict is what would validate it… This fix stops the field lying; it does not
   *   close the hole."* MEASURED on `CRM/USD`: after the yield-clear, tick 3's 7.00/1000.00
   *   frame compares to ITSELF — `bidDep = askDep = midDep = 0` against a threshold ≥ 0.01 —
   *   so no arm is reachable, it reads `two_sided`, and THAT promotes `validated`. Tick 4 acts.
   *   ⇒ **A REFERENCE CANNOT JUDGE ITS OWN SEED. The circularity needs a datum from OUTSIDE
   *   the new chain, and the retained ring is the only one available that costs no new knob.**
   *
   * ⚠️ COST, WRITTEN DOWN RATHER THAN DISCOVERED: a book that never recovers HOLDS INDEFINITELY.
   *   That is the stated policy (D3: refuse ⇒ hold) and the yield alert already fires — but the
   *   position stays open the whole time, so this is a real exposure, not a free win.
   * ⛔ `8a-P4a` (2026-09-18): the chain — not the flag — now has TWO ends: the hollow-skip yield, and
   *   `SEED_ESCAPED` when a book that RECOVERED passes the same retained-ring test (`advance…`). Before
   *   that, a book that recovered while staying two-sided never yielded, so it was held too — outside
   *   the cost above, which covers only a book that never recovers.
   */
  seedImplausible: boolean;
  /**
   * ⛔⛔ TRUE ONCE THIS CHAIN HAS SEEN THE BOOK ACTUALLY MOVE (8a r5, Langston BLOCKER-3).
   *
   * ★ WHY A POSITIVE PROPERTY AND NOT `!seedImplausible`: **NOT JUDGED IMPLAUSIBLE IS NOT
   *   JUDGED PLAUSIBLE.** A COLD-START chain gets `seedImplausible = false` VACUOUSLY — there
   *   was no retained ring, so the check never ran — and that is exactly the chain that can
   *   seed on a hollow frame. r4 retained on the absence of a negative, so a restart mid-hollow
   *   wrote its BROKEN ring into the slot the whole mechanism defines as OUTSIDE, permanently
   *   and in the PERMISSIVE direction — strictly worse than the hold-forever cost.
   *
   * ★ THE DISCRIMINATOR (his): **a real book MOVES; a frozen artefact does not.** A degenerate
   *   chain is precisely the one whose every advance has `bidDep = askDep = midDep = 0` — and
   *   FRAME COUNT alone cannot separate them, because an unchanging broken book reads
   *   `two_sided` forever. That is the circularity one more level up.
   */
  observedMovement: boolean;
  /**
   * `8a-P4a` — the chain's own SEED spread, and the retained median it was judged against at the seed
   * (`null` when no ring existed, i.e. the vacuous cold-start case). Carried for the life of the chain
   * so that EVERY refusal episode carries its own basis — including an INHERITED chain (one that
   * outlived the position it was seeded for), which never prints `SEED_IMPLAUSIBLE` (Langston, 8a-P4a
   * Step 1 BLOCKER-1 condition).
   */
  seedSpread: number;
  seedRetainedMedian: number | null;
  /** `8a-P4a` — true once this chain's first-refusal basis line has been printed (one per chain). */
  refusalBasisLogged: boolean;
  /**
   * `8a-P4a` — on a seed-implausible chain, how many times the book has MOVED during its CURRENT PLAUSIBLE RUN:
   * consecutive advances whose spread is within `kRel ×` the retained median. A wider frame resets it to 0.
   * The escape needs AT LEAST TWO: the jump from a wide quote into a tight one is ONE, so a book that then FROZE
   * at that tight price has exactly one and does not escape; a live book moves again. Movement made while still
   * wide proves nothing about the tight book, so it is never counted.
   * ⛔ Deliberately NOT a count inside the 20-frame ring (r2 of the build): a quiet but healthy book (AMC moves
   * on 2.33% of consecutive captured frames — Langston, 09-17) rarely shows two moves inside any 20-frame window
   * of 1.5 s exit ticks, so a windowed count would strand exactly the case the escape exists for. The run count
   * is cadence-free: it waits for two real moves however many ticks that takes, and a frozen book never gets them.
   */
  plausibleRunMoves: number;
  /** When this reference CHAIN began (the seed frame's own time). Survives validation. */
  seededAtMs: number;
  /** Advances against this chain since the seed, so a fresh seed is distinguishable from a settled one. */
  framesSinceSeed: number;
}

const _comparators = new Map<string, BookStateComparator>();

/**
 * ⛔ THE SPREAD RING SURVIVES A CLEAR, AND THAT IS THE WHOLE MECHANISM (8a r3).
 * The yield-clear drops the POINT reference — which is right, and is the latch fix — but the
 * chain's trailing spreads are evidence about the INSTRUMENT, not about the dropped frame, so
 * discarding them is what leaves the next seed unjudgeable. Retained here, keyed by symbol,
 * and consumed exactly once: at the next seed.
 */
const _retainedSpreads = new Map<string, number[]>();

export function readBookStateComparator(symbol: string): BookStateComparator | null {
  return _comparators.get(symbol.toUpperCase()) ?? null;
}

/**
 * `8a-P4a` — THE BASIS OF A REFUSAL, read by the exit path at `REFUSE unvalidated`.
 * `first` is true exactly once per chain (the flag lives on the chain, so a new chain — by yield, escape or
 * restart — logs again). `ratio` is the REAL ratio: the chain's current median spread over the retained
 * median the chain is judged against now (the live ring if one exists, else the one it was seeded against).
 * It is the production evidence `8a-P4a` §4a relies on to say whether a ring-independent bound (`3n.q5`) is
 * ever needed.
 */
export function takeChainRefusalBasis(symbol: string): {
  first: boolean; seedSpread: number; seedRetainedMedian: number | null; currentMedian: number | null;
  retainedMedianNow: number | null; ratio: number | null; seedImplausible: boolean; seededAtMs: number;
  framesSinceSeed: number;
} | null {
  const key = symbol.toUpperCase();
  const cmp = _comparators.get(key);
  if (!cmp) return null;
  const first = !cmp.refusalBasisLogged;
  cmp.refusalBasisLogged = true;
  const currentMedian = medianOf(cmp.spreads);
  const live = _retainedSpreads.get(key);
  const retainedMedianNow = live ? medianOf(live) : cmp.seedRetainedMedian;
  const ratio = currentMedian !== null && retainedMedianNow !== null && retainedMedianNow > 0
    ? currentMedian / retainedMedianNow : null;
  return {
    first, seedSpread: cmp.seedSpread, seedRetainedMedian: cmp.seedRetainedMedian, currentMedian,
    retainedMedianNow, ratio, seedImplausible: cmp.seedImplausible, seededAtMs: cmp.seededAtMs,
    framesSinceSeed: cmp.framesSinceSeed,
  };
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
  /**
   * ⛔ 8a r3 — PASSED IN, NOT RESOLVED HERE, AND THE REASON IS TESTABILITY RATHER THAN STYLE.
   * Resolving the knob inside would make a test that cannot reach the config take the
   * fail-safe branch and PASS FOR THE WRONG REASON — a control that cannot distinguish the
   * mechanism from its own fallback. The caller holds `cfg` at every site already.
   * `null` ⇒ unreadable ⇒ fail-safe: the seed is treated as implausible.
   */
  kRel: number | null = null,
): void {
  const key = symbol.toUpperCase();
  const mid = (frame.bid + frame.ask) / 2;
  if (!(mid > 0)) return;
  // ⛔ CROSSED BOOK — never becomes the reference, whoever asks.
  if (!(frame.ask >= frame.bid)) return;
  const spreadNow = (frame.ask - frame.bid) / mid;
  const ringCap = Math.max(5, windowSnaps);
  let prev = _comparators.get(key);
  // ⛔⛔ `8a-P4a` — THE RESEED ESCAPE. A seed-implausible chain on a book that has RECOVERED ends here.
  // WHY: the only thing that ended a chain was `clearBookStateComparator` at the hollow-skip yield — and a
  //   book that recovers while staying two-sided never yields, so its chain lived forever and the exit path
  //   refused every tick (`aee` REFUSE unvalidated). `f73fbfd0d` wrote the hold-forever cost down for a book
  //   that NEVER recovers, relying on "a healthy re-seed qualifies immediately" — which could not happen.
  //   MEASURED 2026-09-18: ANET 106,623 / AMC 88,588 / LOW 25,471 refused frames on books back at normal
  //   spreads; LOW held below its stop.
  // THE TEST IS THE SAME ONE THAT SET THE FLAG, against the SAME outside datum (the retained ring) — never
  //   the chain against itself — and it needs BOTH:
  //   (a) the chain's own trailing ring, FULL (`ringCap` frames), has its MEDIAN within `kRel ×` the
  //       retained median — so one lucky tight print inside a bad book cannot escape (Langston, Step 1);
  //   (b) THIS frame is itself within `kRel ×` — so the new chain's seed passes the ordinary seed test below
  //       by construction and consumes the ring under r4, instead of re-locking on the next line.
  //   Plus (c) the book has MOVED AT LEAST TWICE during its current plausible run (r5's positive property,
  //   applied to the recovered book itself — `plausibleRunMoves`): the jump into a tight quote is one, so a
  //   book that froze there does not escape; moves made while still wide do not count; no window, so a quiet
  //   healthy book is not stranded by its own cadence.
  // ⛔ ROUTED THROUGH `clearBookStateComparator`, NEVER AN IN-PLACE `seedImplausible = false` (Langston,
  //   Step 1): the clear is where r4's ring rule and r5's movement rule live, and the new chain starts with
  //   no inherited movement because it is created with no `prev`.
  // ⛔ No clock term and no new knob: `kRel` and the window are the guard's existing knobs.
  let escapedThisFrame = false;
  const movedNow = prev ? (frame.bid !== prev.priorBid || frame.ask !== prev.priorAsk) : false;
  // The run count this frame would produce on the CURRENT chain (used by the escape test and carried below).
  const escRetained = _retainedSpreads.get(key);
  const escRetainedMedian = escRetained ? medianOf(escRetained) : null;
  const escThreshold = kRel !== null && escRetainedMedian !== null && escRetainedMedian > 0 ? kRel * escRetainedMedian : null;
  const runMovesNow = prev && prev.seedImplausible && escThreshold !== null
    ? (spreadNow <= escThreshold ? prev.plausibleRunMoves + (movedNow ? 1 : 0) : 0)
    : 0;
  if (prev && prev.seedImplausible && prev.observedMovement && escThreshold !== null) {
    const retainedMedian = escRetainedMedian;
    const trailing = prev.spreads.concat(spreadNow);
    while (trailing.length > ringCap) trailing.shift();
    const trailingMedian = trailing.length >= ringCap ? medianOf(trailing) : null;
    const threshold = escThreshold;
    if (
      retainedMedian !== null &&
      trailingMedian !== null && trailingMedian <= threshold &&
      spreadNow <= threshold &&
      runMovesNow >= 2
    ) {
      console.warn(
        `[B-XSTOCK-FEED-SANITY][BOOK_STATE] ${key} SEED_ESCAPED framesHeld=${prev.framesSinceSeed} runMoves=${runMovesNow} ` +
        `seedSpread=${prev.seedSpread.toFixed(5)} escapeMedian=${trailingMedian.toFixed(5)} ` +
        `spreadNow=${spreadNow.toFixed(5)} retainedMedian=${retainedMedian.toFixed(5)} kRel=${kRel} ` +
        `seededAt=${new Date(prev.seededAtMs).toISOString()}`,
      );
      clearBookStateComparator(key, 'seed_escape_recovered');
      prev = undefined;
      escapedThisFrame = true;
    }
  }
  const spreads = (prev?.spreads ?? []).concat(spreadNow);
  while (spreads.length > ringCap) spreads.shift();
  // THE EMITTER'S POSITIVE CONTROL (Langston, 2026-09-03 01:26Z): the guard's skip/yield lines fire only
  // on hollow ticks, so a night with no hollow tick on a held name is indistinguishable from an unarmed
  // guard. This line fires ONCE per symbol, on the FIRST FRAME that seeds its comparator (a
  // `no_comparator` verdict, not a `two_sided` one — that was the deadlock) —
  // proof the guard ran on that symbol before any zero on it is read as evidence.
  if (!prev) {
    console.log(`[B-XSTOCK-FEED-SANITY][BOOK_STATE] ${key} COMPARATOR_SEEDED mid=${mid} spread=${((frame.ask - frame.bid) / mid).toFixed(5)} at=${new Date(frame.atMs).toISOString()}`);
  }
  // ⛔ 8a r3 — JUDGE THE SEED AGAINST THE RETAINED RING (Langston BLOCKER-1, his direction).
  // Only on a NEW chain: an advance within a chain inherits the flag unchanged.
  // ⛔ r5: has this chain ever seen the book MOVE? A repeated frozen frame never sets it.
  // `8a-P4a` (Langston Step-2 nit): ONE movement fact per frame. `movedNow` (above) was computed against the chain as it
  // stood BEFORE any escape; after an escape `prev` is gone and a new chain has no prior, so it cannot have moved.
  // Deriving it here keeps the run count and `observedMovement` on one definition — they cannot silently desync.
  const movedThisFrame = prev ? movedNow : false;
  const observedMovement = (prev?.observedMovement ?? false) || movedThisFrame;
  let seedImplausible = prev?.seedImplausible ?? false;
  let seedRetainedMedian: number | null = prev ? prev.seedRetainedMedian : null;
  if (!prev) {
    const retained = _retainedSpreads.get(key);
    const retainedMedian = retained ? medianOf(retained) : null;
    seedRetainedMedian = retainedMedian;
    if (retainedMedian !== null && retainedMedian > 0) {
      const seedSpread = spreadNow;
      // ⛔ FAIL-SAFE ON AN UNREADABLE KNOB: treat the seed as implausible. The alternative
      // validates an unjudged seed, which is the defect this closes.
      if (kRel === null || seedSpread > kRel * retainedMedian) {
        seedImplausible = true;
        console.warn(
          `[B-XSTOCK-FEED-SANITY][BOOK_STATE] ${key} SEED_IMPLAUSIBLE ` +
          `seedSpread=${seedSpread.toFixed(5)} retainedMedian=${retainedMedian.toFixed(5)} ` +
          `kRel=${kRel ?? 'unreadable'} — chain cannot validate; it ends at a yield, or by the seed escape when the book recovers`,
        );
      }
    }
    // ⛔⛔ r4 (Langston BLOCKER-2): CONSUME THE RING ONLY ON A PLAUSIBLE SEED.
    // Deleting it unconditionally throws away the last PLAUSIBLE instrument evidence the
    // moment an implausible chain starts — and then that broken chain's own ring becomes the
    // next seed's yardstick. Keeping it means the datum stays OUTSIDE every broken chain,
    // which is the principle this whole mechanism rests on.
    if (!seedImplausible) _retainedSpreads.delete(key);
  }
  _comparators.set(key, {
    priorMid: mid, priorBid: frame.bid, priorAsk: frame.ask,
    priorLast: frame.last, priorAtMs: frame.atMs, spreads,
    // once validated, STAYS validated for the life of the chain — a later seed starts a new chain
    // ⛔ 8a r3: …UNLESS the chain's own seed was implausible, in which case NOTHING promotes it.
    // A `two_sided` verdict produced by the seed frame comparing to ITSELF is exactly the
    // circularity this blocks, so that verdict must not be able to clear the gate it caused.
    // ⛔ `8a-P4a`: a chain seeded BY AN ESCAPE does not validate on its seed frame. This frame's verdict was
    // taken against the ESCAPED chain's reference, not the new one's, so it may not promote the new chain —
    // the escape seed validates on the NEXT `two_sided` frame, exactly like any other seed (one tick).
    validated: !seedImplausible && ((prev?.validated ?? false) || (validatedByTwoSided && !escapedThisFrame)),
    seedImplausible,
    seedSpread: prev ? prev.seedSpread : spreadNow,
    seedRetainedMedian,
    refusalBasisLogged: prev ? prev.refusalBasisLogged : false,
    plausibleRunMoves: prev ? runMovesNow : 0,
    observedMovement,
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
// ⛔ `8a-P4a`: called from TWO places now — the engine's hollow-skip yield (`reason = yield_after_N_hollow`)
// and the reseed escape inside `advanceBookStateComparator` (`reason = seed_escape_recovered`). Both end the
// chain through this ONE path, so r4's ring rule and r5's movement rule apply to both.
export function clearBookStateComparator(symbol: string, reason: string): void {
  const key = symbol.toUpperCase();
  const prev = _comparators.get(key);
  if (!prev) return;
  // 8a r3: drop the POINT reference, RETAIN the ring. See `_retainedSpreads`.
  // ⛔⛔ r4 (Langston BLOCKER-2) — RETAIN ONLY A PLAUSIBLE CHAIN'S RING, AND THIS IS THE HALF
  // THAT MAKES r3 SURVIVE A SECOND CYCLE. `spreads` is computed BEFORE the implausibility
  // check, so an implausible chain's ring holds the BROKEN spread (CRM: [1.9722]). Retaining
  // that raises the SEED threshold to `kRel × 1.9722` = 5.917 — ⚠️ NOTE, no floor term: the
  // ARM threshold at `book-state.ts:200` is `max(kRel × median, floorPct/100)`, the SEED check
  // at `:180` is a bare `kRel × median`. Quoting the arm's form here misled a reader once
  // (Langston FINDING-2) — they are different expressions and only one has a floor.
  // The same contaminated median also puts both side arms
  // out of reach — so the book can wander 7/1000 → 7/1200, yield again, and the reseed at
  // spread 1.977 now reads PLAUSIBLE against its own predecessor, validates on the next
  // self-comparison, and books 603.50. **Same terminal row, ~3 minutes later instead of 4.7 s.**
  // ★ MY OWN STATED PRINCIPLE NAMES THE DEFECT: *the circularity needs a datum from OUTSIDE
  //   the new chain.* After one cycle, an unconditionally-retained ring IS the broken chain.
  // ⛔⛔ r6 — READ THIS BEFORE ADDING A SEVENTH CONDITION HERE. **LANGSTON HAS RULED r5 THE LAST
  // GATE (2026-09-12), AND THE RULING IS THAT THE REMAINING HOLE IS NOT CLOSEABLE BY GATING.**
  // Retention happens AT A YIELD, and a yield is proof the reference was unusable; the only
  // datum from outside is the previous ring; **genesis must therefore come from SOME yielding
  // chain.** A `seedJudgedPlausible` gate makes the whole mechanism permanently INERT — which
  // is the original deadlock shape this guard already died of once.
  // ⛔ THE SURVIVING HOLE, PINNED AS A TEST RATHER THAN GATED (BLOCKER-4): `observedMovement`
  //   is satisfied on frame 2 of a COLD-SEEDED hollow chain, by that chain's own broken ring.
  //   Cold start 7.00/1000.00 seeds vacuously plausible; tick 2 with the live side ticking one
  //   cent gives `bidDep = -0.0014` against a threshold of `kRel × 1.986` = 5.96, so no arm is
  //   reachable ⇒ `two_sided` ⇒ advance ⇒ **movement earned by a book that never recovered.**
  // ★ MOVEMENT IS A PROPERTY OF THE FEED, NOT OF THE CHAIN'S PLAUSIBILITY. A stub-ask book with
  //   a live bid is the CANONICAL half-hollow shape; FROZEN was the CRM instance, not the class.
  //
  // ⛔⛔ r5 (Langston BLOCKER-3): RETAIN ONLY FROM A CHAIN THAT DEMONSTRATED IT IS A LIVE BOOK.
  // `!seedImplausible` alone is the ABSENCE OF A NEGATIVE, and a cold-start chain satisfies it
  // VACUOUSLY — which is the one chain class that can seed hollow. `observedMovement` is the
  // POSITIVE property: a frozen 7.00/1000.00 artefact never sets it, so its ring can never
  // become the yardstick that the whole mechanism defines as coming from OUTSIDE.
  if (!prev.seedImplausible && prev.observedMovement && prev.spreads.length > 0) {
    _retainedSpreads.set(key, [...prev.spreads]);
  }
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
export function _resetBookStateComparatorsForTest(): void { _retainedSpreads.clear(); _comparators.clear(); }
