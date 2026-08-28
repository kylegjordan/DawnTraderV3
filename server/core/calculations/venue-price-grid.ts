/**
 * ════════════════════════════════════════════════════════════════════════════════════════
 *  VPG — THE VENUE PRICE GRID SERVICE
 * ════════════════════════════════════════════════════════════════════════════════════════
 *
 * ★ A NAMED COMPONENT, in the same sense as the MCE, the SQE and the TEC (Kyle, 2026-08-28:
 *   *"if it just remains code instead of something we refer to specifically by name, then it is
 *   easier to forget that it is there and that it is a component, an important component in our
 *   system"*). Refer to it as **the VPG**. It is not "the rounding code".
 *
 * WHAT IT OWNS: the single answer to *"is this a price the venue can actually express, and if
 * not, what is the nearest one that is?"* — for every asset class, on every lane.
 *
 * WHO CALLS IT (keep this list current — it is the reason the service exists):
 *   1. `signal-orchestrator.ts`  — the ACTIVE path, PAPER **and** LIVE (one mode-agnostic seam)
 *   2. `vts-runner.ts`           — the VTS learning lane (TAG only, never drop)
 *   3. `xstock_spot/eval-cycle.ts` — the xStock VTS lane (TAG only), which ALSO births the
 *                                    xStock active signal, which is why it tags rather than rounds
 *   4. `execution/venue-validate.ts` — shares the VPG's BASIS (`tick_size`) for the outbound
 *                                    order string, so the rule has one home rather than two
 *   5. `active-execution-engine.ts` — `roundQuantityForVenue` for the SIZE pre-filter
 *
 * ⛔ WHO DOES **NOT** CALL IT, AND MUST BE NAMED HERE OR THIS LIST READS AS A CENSUS WHEN IT IS
 * ONLY A LIST OF FRIENDS (Langston's condition):
 *   - `trailing-exit-controller.ts` — DOES NOT, and that is `#923`. It ratchets a live stop with
 *     `Math.max` over ATR-derived floats and takes the result straight off-grid. So between
 *     F-G-1 and F-G-2 the system advertises a grid guarantee that the trailing controller breaks
 *     on the first ratchet. HOME: `F-G-2`, owner CC-C, placed in `PHASE_19_PLAN` §1 after F-G-1.
 *     ⚠️ Presently UNREACHABLE — Langston re-derived it: the ladder is config-locked off
 *     (`trailing_enabled_active=false`, `moonbag_qualifying_strategies=[]`, all four classes).
 *     That lowers the urgency and NOT the obligation: a config flip re-arms it silently.
 *
 * ⛔ IF YOU ARE ABOUT TO ROUND, SNAP OR FORMAT A PRICE ANYWHERE ELSE, CALL THE VPG INSTEAD.
 *   A second implementation is how a decided rule ends up shipped into one reader out of several.
 *
 * F-G-1 / B-GRID-REPRESENTABILITY (OBJ-7, OBJ-7b, OBJ-3).
 *
 * WHY THIS EXISTS. Measured 2026-08-27 on 406 closed crypto trades, each matched to its OWN
 * published Kraken `tick_size`: entry prices are 80.8% representable, STOPS 2.7%, TARGETS 9.9%.
 * Entries inherit validity from an observed print; stops and targets are ATR-derived floats and
 * are overwhelmingly prices the venue CANNOT EXPRESS. Two consequences:
 *   (i)  LIVE-PARITY DEBT — in live mode these become real order prices and are rejected or
 *        silently re-priced, so paper and live diverge at the exact moment of exit.
 *   (ii) OBJ-8 DISCRIMINATION — for an off-grid limit, `high > limit` and `high >= limit` are
 *        THE SAME PREDICATE, because `high` can never equal a price the venue cannot express.
 *        Through-vs-touch therefore has an empty discriminating cell BY CONSTRUCTION.
 *
 * DELIBERATELY PURE. No imports, matching its neighbours in this directory. The venue tick is
 * passed IN; resolving it from venue metadata is the caller's job. That keeps the rounding rules
 * — which are geometry decisions — independently testable from the metadata lookup.
 *
 * ⛔ THE ROUNDING FUNCTION TAKES NO GATE RESULT AS INPUT, BY DESIGN (Langston's condition).
 * That mechanically forbids re-rounding a signal to make it pass: rounding to nearest is
 * deterministic, so "round again" could only mean rounding the OTHER way, and choosing the
 * direction that lets a trade through is shopping for a pass.
 */

/** A price's role in the trade, which determines its rounding DIRECTION. */
export type PriceRole = 'entry' | 'stop' | 'target';

export type GridRefusal =
  /** A leg is missing, non-finite or non-positive. No side exists; never default to long. */
  | 'invalid_triple'
  /** stop > entry > target — reads as a clean SHORT. Zero shorts have ever been taken. */
  | 'short_side_unexercised'
  /** Neither long-shaped nor short-shaped (e.g. #915's inverted stop). Not orderable. */
  | 'unorderable_triple'
  /** The venue grid for this symbol is unknown. NEVER silently default (no hard-coded fallback). */
  | 'grid_unknown'
  /** Rounding collapsed the geometry: entry/stop/target no longer strictly separated. */
  | 'degenerate_after_rounding'
  /** ⛔ SELF-CHECK: the rounded output is not on the grid. A rounding DEFECT, not a signal fault. */
  | 'not_representable_after_rounding';

export interface GridResult {
  ok: boolean;
  reason?: GridRefusal;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  /** True where every leg is an exact multiple of the tick. */
  representable: boolean;
}

/**
 * Decimal places implied by a tick, used only to kill floating-point dust after the
 * integer-space arithmetic below. `0.00001` -> 5. Ticks on Kraken are powers of ten today
 * (11 distinct values across 1,437 pairs), but this does NOT assume that — see `snap`.
 */
export function decimalsOf(tick: number): number {
  // ⛔ THE MANTISSA IS PART OF THE ANSWER. My first version read ONLY the exponent of
  // `toExponential()`, which is correct exactly when the mantissa is 1 — i.e. for powers of ten.
  // `decimalsOf(0.0025)` returned 3, so `snap`'s closing `toFixed(3)` took an on-grid product and
  // rounded it onto a 0.001 grid: `snap(12.3456, 0.0025, 'up')` → `12.348`, which is OFF GRID.
  // ⛔ THAT IS THE EXACT COUNTER-EXAMPLE LANGSTON USED TO KILL MY DECIMAL-PLACE METHOD FOR xSTOCK,
  // reintroduced by me at the final formatting line, one function below the GCD built to defeat
  // it — and live on the six xStock symbols measured at a 0.0025 tick. Read the decimal string.
  const str = String(tick);
  if (str.includes('e') || str.includes('E')) {
    const [mant, exp] = str.toLowerCase().split('e');
    const mantDecimals = (mant.split('.')[1] ?? '').length;
    return Math.min(12, Math.max(0, mantDecimals - Number(exp)));
  }
  return Math.min(12, (str.split('.')[1] ?? '').length);
}

type Dir = 'nearest' | 'up' | 'down';

/**
 * Snap `price` onto the `tick` grid in integer tick-space.
 *
 * ⚠️ Integer-space is not cosmetic: `price % tick` on floats gives 0.009999999 for values that
 * are exactly on the grid, so a naive modulo would report on-grid prices as off-grid.
 * The `EPS` nudge absorbs that same representation error before flooring/ceiling, so a value
 * already sitting on the grid is never pushed a whole tick away by dust.
 *
 * TIE RULE (entry only, the sole `nearest` caller): HALF-UP. Stated because Langston required
 * it be stated, though he also ruled it is not the decision that matters — DIRECTION is.
 */
function snap(price: number, tick: number, dir: Dir): number {
  const q = price / tick;
  // ⛔⛔ THE SAME ABSOLUTE-EPSILON-ON-A-RATIO DEFECT AS `isOnGrid`, TWELVE LINES BELOW — AND I
  // FIXED THAT ONE AND WALKED PAST THIS ONE. `q` is a COUNT OF TICKS and reaches ~1e10, where a
  // fixed `1e-9` nudge is larger than a whole tick, so the ceil/floor jumps a full increment on a
  // price that was ALREADY on the grid. The docstring above claimed the opposite — "a value
  // already sitting on the grid is never pushed a whole tick away by dust" — which was false at
  // exactly the scale the `isOnGrid` banner is about.
  // MEASURED HERE, on-grid inputs only, counting inputs moved a FULL TICK, n=200,000 per cell:
  //     tick 1e-5 @ $1k-100k   (q~1e10):  14.1% moved  ->  0.0% after
  //     tick 2e-8 @ $10-300    (q~1e10):  14.4% moved  ->  0.0% after
  //     tick 0.01 @ $1k-100k   (q~1e7):    0.0%  CONTROL, unchanged
  //     tick 0.01 @ $1-100     (q~1e4):    0.0%  CONTROL, unchanged
  //     tick 0.0025 @ $10-300  (q~1e5):    0.0%  CONTROL, unchanged
  // (Langston reported 49.3% on his own sampling of the first cell; mine is 14.1%. The defect
  // reproduces either way — the controls are what make it a measurement. I report mine.)
  // ⚠️ IT IS NOT A REFUSAL: the output stays ON grid, so `representable` never trips. For a plain
  // long the spurious tick moves stop and target AWAY, the cheap direction — but the `targetIsCap`
  // arm (`volatility_edge`, dir `down`) moves the target one tick TOWARD entry, past the bound it
  // was defined by. Bounded harm, false invariant.
  const EPS = Math.max(1, Math.abs(q)) * Number.EPSILON * 8;
  let n: number;
  if (dir === 'nearest') n = Math.floor(q + 0.5);           // half-up
  else if (dir === 'up') n = Math.ceil(q - EPS);
  else n = Math.floor(q + EPS);
  return Number((n * tick).toFixed(decimalsOf(tick)));
}

/**
 * True when `price` is an exact multiple of `tick`, computed in integer space.
 *
 * ⛔⛔ THE TOLERANCE IS RELATIVE TO `q`, AND MAKING IT ABSOLUTE WAS A REAL DEFECT IN THIS FILE.
 * `q = price / tick` is a COUNT OF TICKS and can be enormous — an xStock at $200 on a derived
 * `2e-8` grid gives `q = 1e10`, where one float ULP already exceeds `1e-9`. A fixed `1e-9` band
 * therefore says "not on grid" about prices that ARE exact multiples. MEASURED, with the
 * off-grid control held at false throughout:
 *     isOnGrid(68000.5, 0.00001)  ->  false      (68000.5 IS 6.8e9 ticks exactly)
 *     isOnGrid(1e6,     0.00001)  ->  false      (1e11 ticks exactly)
 * ⛔ AND THE CONSEQUENCE WAS NOT COSMETIC: `roundTripleToGrid` promotes `!representable` to
 * `not_representable_after_rounding`, a REFUSAL. So the self-check added to catch a rounding bug
 * would itself have refused valid signals — the guard becoming the thing it guards against.
 * ⇒ Scale the band with `q`, at FLOAT PRECISION and not at a hand-picked constant.
 *
 * ⛔⛔ THE CLASS GREP, STATED RATHER THAN THE INSTANCE FIXED (Langston's J8 remedy, and this file
 * is what produced the rule). `rg '1e-9' venue-price-grid.ts` at the ref returns FOUR sites:
 *   1. `snap`'s `EPS`                       — SAME CLASS (ratio `price/tick`).  FIXED.
 *   2. `isOnGrid`'s band                    — SAME CLASS (same ratio).          FIXED.
 *   3. `roundQuantityForVenue`'s floor nudge — SAME CLASS (ratio `qty/step`).   FIXED.
 *   4. `oneTick = t * (1 - 1e-9)`           — ⚠️ SAME CLASS AFTER ALL, AND LEFT ALONE FOR A
 *      DIFFERENT REASON THAN I FIRST WROTE. I said it was "already scale-free" and that was wrong
 *      in a way that mattered, because a wrong reason in this list becomes permanent guidance for
 *      whoever reads it next. It IS scale-free in the TICK — but the error it has to absorb is
 *      float error in `e - s`, which scales with the PRICE. Langston measured it: exactly-one-tick
 *      triples, n=20,000/cell — tick `1e-5` @ $1k-100k gives 79.1% spurious
 *      `degenerate_after_rounding`; tick `2e-8` @ $10-300 gives 69.6%; control tick `0.01` @
 *      $1k-100k (q~1e7) gives 0.00%.
 *      ⇒ LEFT ALONE because it is UNREACHABLE, not because it is sound: the 0.3% minimum stop
 *      distance puts every real separation ~1e7 ticks out, far below where the band bites.
 *      **Bounded by reachability, not by scale-freedom.** If that floor is ever removed or
 *      lowered, this line becomes live and must move to the relative band with the other three.
 * ⚠️ Repo-wide the same shape returns two more hits — `expectancy.ts` and
 * `drift-dashboard-aggregator.ts` — and BOTH are absolute epsilons on BOUNDED quantities (a
 * probability, a shift fraction), so they are a different shape wearing the same constant.
 * ⇒ I fixed ONE of these three on the first pass and reported the class as handled. The grep
 * would have returned all three the first time; it took a reviewer to ask.
 * ⛔⛔ AND MY OWN FIRST FIX WAS WORSE THAN THE DEFECT. I scaled the ORIGINAL `1e-9` by `q` —
 * which at `q = 6.8e9` opens a band of ~6.8 TICKS and starts accepting prices that are genuinely
 * OFF grid. MEASURED against a deliberate half-tick control set:
 *     absolute 1e-9   -> 2 on-grid MISSES,        0 false accepts   (the reported defect)
 *     relative 1e-9   -> 0 misses,                2 FALSE ACCEPTS   (my fix — strictly worse:
 *                                                                    an off-grid price now SHIPS)
 *     relative EPS*8  -> 0 misses,                0 false accepts   (clean on both)
 * `Number.EPSILON * 8` is ~1.8e-15 relative — a few ULPs, which is the precision actually
 * available. ⚠️ The `max(1, |q|)` floor preserves the SHAPE of the old rule (a constant floor for
 * small `q`) and NOT its behaviour: the old floor was `1e-9` and this one is ~1.78e-15, which is
 * 5.6e5x TIGHTER. My first wording said "preserves the old behaviour", which would have told the
 * next reader that small-`q` cases were untouched. They are not; they are strictly stricter.
 * ★ THE CONTROL IS THE WHOLE POINT: checking only that on-grid prices pass would have certified
 * the false-accept version. A tolerance needs BOTH a positive and a negative control, or it is
 * tuned in one direction only.
 * ⚠️ HONEST LIMIT, AND IT IS A SLOPE RATHER THAN THE CLIFF I FIRST WROTE. The band widens
 * CONTINUOUSLY with `q`: it is ~1.8e-4 ticks at `q = 1e11` (a value this file's own negative
 * control uses), ~1e-3 ticks at `q ~ 5.6e11`, and discrimination is fully gone near `q ~ 2.8e14`.
 * Naming only the far end understated it. That is a fact about doubles, not a tolerance to widen.
 * ⚠️ Reachable in principle at the finest derivable tick above roughly $5,600 — and the smallest
 * tick `gcdOfIncrements` can actually return is `2e-8`, not `1e-8` as I first wrote, because it
 * returns null at `g <= 1` on an 8dp integer scale. Conservative direction; corrected for accuracy.
 * Reported by a fresh-context reader; re-derived here, with controls, before anything changed.
 */
export function isOnGrid(price: number, tick: number): boolean {
  const q = price / tick;
  return Math.abs(q - Math.round(q)) < Math.max(1, Math.abs(q)) * Number.EPSILON * 8;
}

/**
 * Round one price according to its ROLE. Exported for fencing; the pipeline calls
 * `roundTripleToGrid`, which is the only form that can see the pairwise invariant.
 *
 * DIRECTION BY ROLE, and the reason is what KIND of quantity each price is:
 *  - ENTRY  is a point estimate (an observed print) -> NEAREST.
 *  - STOP   is a BOUNDARY -> AWAY from entry. Measured: nearest rounding moves the stop TOWARD
 *           entry on 197 of 398 long crypto trades (49.5%), and our stops are structural levels
 *           (`supportLevel`, `min(c2Low,c1Low)`, `parentLow`), so half of all stops would land
 *           INSIDE the structure they were deliberately placed behind. That is a design
 *           violation, not noise. Cost of the safe direction: +0.241% median extra risk.
 *  - TARGET is normally a FLOOR ("at least K x ATR") -> AWAY from entry.
 *    ⛔ EXCEPT where the target is a CAP. `volatility-edge.ts:189` is
 *       `Math.min(measuredMoveTarget, atrTarget)` — its design says AT MOST the measured move,
 *       so rounding it away pushes it PAST the bound it was defined by. A boundary rounded OUT
 *       of the thing it bounds is as wrong as one rounded INTO it. That is the ONLY cap found.
 */
export function roundPriceForRole(
  price: number,
  tick: number,
  role: PriceRole,
  isLong: boolean,
  targetIsCap = false,
): number {
  if (role === 'entry') return snap(price, tick, 'nearest');
  const awayIsUp = role === 'stop' ? !isLong : isLong;
  const dir: Dir = (role === 'target' && targetIsCap) ? (awayIsUp ? 'down' : 'up')
                                                      : (awayIsUp ? 'up' : 'down');
  return snap(price, tick, dir);
}

/**
 * Round a whole signal onto the venue grid.
 *
 * ⛔⛔ THE INVARIANT IS PAIRWISE, NOT PER-PRICE (Langston, and it is a defect this function
 * exists to avoid). Rounding each price safely on its own does NOT make the PAIR safe: with
 * tick 0.01, a stop of 99.99 is already representable and does not move, while an entry of
 * 99.9949 rounds NEAREST to 99.99 — RISK DISTANCE ZERO. Two guards follow from that:
 *   1. "Away" is measured from the ROUNDED entry, not the raw one. Fix the anchor, then move
 *      the boundaries off it.
 *   2. The ROUNDED TRIPLE is asserted: strict ordering AND at least one tick of separation.
 *      A fence that checks "no stop moved toward entry" against the UNROUNDED entry cannot see
 *      the case above, because there the stop never moves at all.
 */
export function roundTripleToGrid(
  entryPrice: number,
  stopPrice: number,
  targetPrice: number,
  tick: number | null | undefined,
  opts: { targetIsCap?: boolean; symbol?: string } = {},
): GridResult {
  const fail = (reason: GridRefusal): GridResult => ({
    ok: false, reason, entryPrice, stopPrice, targetPrice, representable: false,
  });

  const finite = (v: number) => Number.isFinite(v) && v > 0;
  if (!finite(entryPrice) || !finite(stopPrice) || !finite(targetPrice)) return fail('invalid_triple');

  // ⛔ SHAPE FIRST, GRID SECOND — AND THE ORDER IS THE POINT. These checks need NO TICK, and
  // `grid_unknown` used to return ABOVE them, so on the xStock passthrough path (where a missing
  // DERIVED grid proceeds rather than refusing) a SHORT-SHAPED or #915-INVERTED triple was never
  // shape-checked at all and went straight into sizing. My claim that "all other refusal reasons
  // still refuse for both classes" was FALSE — those four were not applied-and-passed, they were
  // never evaluated. Found by a second reader on the correction itself.
  // SIDE IS DERIVED FROM THE ORDERING, not carried. `StrategySignal` has no side field, and
  // measured across all 646 closed trades with a full triple: 634 are unambiguously long-shaped,
  // 0 short-shaped, 12 neither (#915's inverted stops).
  const isLong = stopPrice < entryPrice && targetPrice > entryPrice;
  const isShort = targetPrice < entryPrice && stopPrice > entryPrice;

  // ⛔ THE SHORT BRANCH REFUSES AND DOES NOT COMPUTE. A fully-inverted long is ORDERABLE and
  // reads as a clean short; side-inference cannot tell them apart. Zero shorts have ever been
  // taken, so a short-shaped triple today can ONLY be a defect — and pricing it as a valid short
  // would silently launder that defect into a trade. Refusing makes "unexercised" self-announcing
  // rather than a limitation someone has to remember to re-verify at the first real short.
  if (isShort) return fail('short_side_unexercised');
  if (!isLong) return fail('unorderable_triple');

  // NO HARD-CODED FALLBACK. If the venue grid is unknown we refuse; we do not invent one.
  // ⚠️ Now reached only AFTER the shape is proven valid, so a caller that chooses to proceed on
  // `grid_unknown` is proceeding with geometry that is at least well-formed.
  if (!finite(tick as number)) return fail('grid_unknown');
  const t = tick as number;
  const e = snap(entryPrice, t, 'nearest');
  const s = roundPriceForRole(stopPrice, t, 'stop', true);
  const g = roundPriceForRole(targetPrice, t, 'target', true, opts.targetIsCap === true);

  // THE PAIRWISE ASSERTION. Strict ordering AND >= 1 tick of separation on both legs.
  const oneTick = t * (1 - 1e-9);
  if (!(e - s >= oneTick) || !(g - e >= oneTick)) return fail('degenerate_after_rounding');

  // ⛔⛔ THE SELF-CHECK, AND IT IS THE REAL FIX. The module already COMPUTED `representable` and
  // NOBODY READ IT — the seam checked only `_r.ok`, so a rounding bug could return
  // `ok:true, representable:false` and ship. Promoting it to a refusal catches this entire CLASS
  // without anyone having to predict the next arithmetic error. Langston's point, and it is
  // stronger than the arithmetic fix above: that one fixes the bug we found; this one fixes the
  // bugs we have not.
  const representable = isOnGrid(e, t) && isOnGrid(s, t) && isOnGrid(g, t);
  if (!representable) return fail('not_representable_after_rounding');
  return { ok: true, entryPrice: e, stopPrice: s, targetPrice: g, representable: true };
}

/**
 * OBJ-7b kind (i) — VENUE-IMPOSSIBLE. Rounding the PRICE is not enough: the venue quantises
 * SIZE too, and a rounded price on an unroundable quantity is still an invalid order.
 * Quantity rounds DOWN (never buy more than sized), then must clear `ordermin` and `costmin`.
 *
 * Returns null when the order cannot be placed at all — the caller records that as a distinct
 * reject kind from a gate-marginal refusal, because the two mean opposite things: many of these
 * says our sizing is too small for the venue; many gate-marginal says our gates are tuned finer
 * than the market's resolution.
 */
export function roundQuantityForVenue(
  quantity: number,
  price: number,
  lotDecimals: number | null | undefined,
  ordermin: number | null | undefined,
  costmin: number | null | undefined,
): { quantity: number } | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (lotDecimals == null || !Number.isFinite(lotDecimals)) return null; // no fallback
  const step = Math.pow(10, -lotDecimals);
  // ⛔ THIRD INSTANCE OF THE SAME CLASS. `quantity / step` reaches ~1e10 at `lotDecimals = 8`,
  // where a fixed `1e-9` is bigger than a whole step and floors to the wrong lot.
  const _lots = quantity / step;
  const q = Number((Math.floor(_lots + Math.max(1, Math.abs(_lots)) * Number.EPSILON * 8) * step)
    .toFixed(Math.min(12, lotDecimals)));
  if (q <= 0) return null;
  if (ordermin != null && Number.isFinite(ordermin) && q < ordermin) return null;
  if (costmin != null && Number.isFinite(costmin) && q * price < costmin) return null;
  return { quantity: q };
}

/**
 * F-G-1 (OBJ-3 / VTS lane) — EVALUATE THE GRID WITHOUT CHANGING BEHAVIOUR.
 *
 * ⛔ THE VTS LANE TAGS; IT NEVER DROPS (Langston ruling, 2026-08-28). VTS runs its guards under
 * `'tag'` disposition by design, and a drop arm here on missing grid data would re-create the
 * 95-97% strangle that reorg-B3.2 was built to undo. So this function is PURE ANNOTATION: it
 * reports what rounding WOULD do, and the caller simulates on the NATIVE geometry regardless.
 *
 * ⛔ AND IT IS CARRIED IN A SIBLING FIELD, NEVER BY WIDENING `vtsGateVerdict`. That union rides
 * onto the trade record, so rows written before this landed must read as NOT INSTRUMENTED — never
 * as PASSED. A widened union would make an absence indistinguishable from a pass (`#546`).
 *
 * ★ Both VTS lanes call THIS function rather than each implementing the rule, because a decided
 * rule shipped into one reader out of several is the defect `B-EPOCH-KEYING-PARITY` is held on.
 */
export type GridTagVerdict =
  /** Every leg was already an exact multiple of the venue tick. Nothing would move. */
  | 'on_grid'
  /** Rounding would move at least one leg, and the result is still a valid trade. */
  | 'would_round'
  /** ⚠️ WIRING BUG, NOT A QUALITY VERDICT — the venue grid could not be resolved at all. */
  | 'grid_unknown'
  /** The rounded stop would fall inside the 0.3% minimum stop distance (GUARD-1). */
  | 'stop_distance_after_rounding'
  /** Rounding would collapse the legs to less than one tick apart. */
  | 'degenerate_after_rounding'
  /** Not long-shaped and not short-shaped, or a leg is missing — the `#915` family. */
  | 'unorderable'
  /** ⚠️ A POLICY REFUSAL, NOT A DEFECT AT ALL — the triple is a well-formed SHORT, and we refuse
   *  shorts because the branch is unexercised. It was folded into `unorderable`, whose own doc
   *  says "not long-shaped and NOT SHORT-SHAPED" — the one thing this triple demonstrably is.
   *  I pulled the two arithmetic reasons out of that bucket for exactly this reason and left the
   *  one that is not a defect. Langston, at the ref. */
  | 'short_side_unexercised'
  /** ⚠️ OUR ARITHMETIC, NOT THE SIGNAL'S SHAPE — the VPG rounded and the result was still not a
   *  multiple of the tick. A DEFECT IN THIS MODULE, and it must never be filed against the
   *  signal. It had been folded into `unorderable`, whose own doc says "not long-shaped and not
   *  short-shaped" — i.e. a property of the SIGNAL — so a VPG bug would have been recorded on
   *  both VTS lanes as bad xStock signal quality, in the exact bucket used to judge signals.
   *  Found by a fresh-context reader. */
  | 'not_representable_after_rounding'
  /** ⚠️ A leg is non-finite or non-positive. Also previously folded into `unorderable`, which is
   *  a different claim: this triple is not malformed in its ORDER, it is malformed in its VALUES. */
  | 'invalid_triple';

export interface GridTag {
  verdict: GridTagVerdict;
  tick: number | null;
  /** What rounding WOULD have produced. Null when it could not be computed. */
  wouldBe: { entryPrice: number; stopPrice: number; targetPrice: number } | null;
  /** True only when the verdict is a wiring problem rather than a property of the signal. */
  isWiringBug: boolean;
}

export function evaluateGridForTagging(
  entryPrice: number,
  stopPrice: number,
  targetPrice: number,
  tick: number | null | undefined,
  opts: { targetIsCap?: boolean; minStopDistanceBps?: number } = {},
): GridTag {
  const r = roundTripleToGrid(entryPrice, stopPrice, targetPrice, tick, opts);
  if (!r.ok) {
    // ⛔ `isWiringBug` MEANS "OUR PROBLEM, NOT THE SIGNAL'S" — so an unresolvable grid AND a
    // failed self-check both qualify. Only `grid_unknown` did, which under-reported our own
    // defects as signal defects.
    const wiring = r.reason === 'grid_unknown' || r.reason === 'not_representable_after_rounding';
    const verdict: GridTagVerdict =
      r.reason === 'grid_unknown' ? 'grid_unknown'
      : r.reason === 'degenerate_after_rounding' ? 'degenerate_after_rounding'
      : r.reason === 'not_representable_after_rounding' ? 'not_representable_after_rounding'
      : r.reason === 'invalid_triple' ? 'invalid_triple'
      : r.reason === 'short_side_unexercised' ? 'short_side_unexercised'
      : 'unorderable';
    return { verdict, tick: tick ?? null, wouldBe: null, isWiringBug: wiring };
  }
  const t = tick as number;
  const already = isOnGrid(entryPrice, t) && isOnGrid(stopPrice, t) && isOnGrid(targetPrice, t);
  const wouldBe = { entryPrice: r.entryPrice, stopPrice: r.stopPrice, targetPrice: r.targetPrice };

  // The one QUALITY verdict in the set: the rounded stop falls inside the minimum stop distance.
  // Tagged rather than dropped precisely so the counterfactual stays measurable — does a
  // sub-tick-margin setup actually win? That is the measurement worth having.
  const bps = opts.minStopDistanceBps;
  if (bps != null && Number.isFinite(bps)) {
    const dist = Math.abs(r.entryPrice - r.stopPrice) / r.entryPrice;
    if (dist < bps / 10000) {
      return { verdict: 'stop_distance_after_rounding', tick: t, wouldBe, isWiringBug: false };
    }
  }
  return { verdict: already ? 'on_grid' : 'would_round', tick: t, wouldBe, isWiringBug: false };
}
