// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// B-PRICE-SIDE-BY-JOB `#1250` — STOP AND TARGET ON THE PRICE PAID (xStock taker arm, active + VTS).
// Plan: `Scope Files/B_PRICE_SIDE_BY_JOB_1250_PRE_AUDIT.md` §7-§9 (Langston Step-2 PROCEED r4, Discord 1568677973609947248).
//
// A strategy builds each level ONE of four ways, or as a `max`/`min` of two of them, and that construction is the intent:
//   anchor        a market price (VWAP, a swing low, a range low)  → it stays where it is; the distance is an output
//   distance      entry ± k·ATR                                     → it keeps its distance from the price paid
//   r_multiple    entry + R·(entry − stop)   (targets only)          → R is kept against the CARRIED stop
//   proportional  a fraction of the price                           → it scales with the price paid
// A mixed leg re-derives BOTH terms and re-applies the SAME operator — never the winner alone (Langston BLOCKER-6: a
// winner-only `max` can return a stop wider than the strategy would ever choose).
// ⛔ Absent spec ⇒ every leg is an anchor ⇒ NOTHING MOVES. That is today's behaviour and the fail-safe direction.
// PURE: no I/O, no clock, no config read. The tick and the cap bit are passed in.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { roundPriceForRole } from '../calculations/venue-price-grid.js';

export type LevelForm =
  | { form: 'anchor' }
  | { form: 'distance' }
  /**
   * Step 9 (pre-audit §13 D1, Langston 2026-11-15): a SINGLE-FORM `r_multiple` leg also carries the exact entry and stop the
   * strategy multiplied (`builtEntry`, `builtStop`), so the check rebuilds the target the strategy built — not one re-derived
   * from the ROUNDED plan, whose per-leg directional rounding leaves a residual of up to [−2.5, +3.5] ticks at r = 2 (SBET,
   * the five-session read). Required on a single-form leg (`isWellFormedLegSpec`); a term inside a mixed leg carries its
   * `value` instead and needs neither.
   */
  | { form: 'r_multiple'; r: number; builtEntry?: number; builtStop?: number }
  | { form: 'proportional' };

/** One term of a mixed construction, with the value it had when the strategy built it. */
export interface LevelTerm { spec: LevelForm; value: number }

export type LegSpec = LevelForm | { op: 'max' | 'min'; terms: [LevelTerm, LevelTerm] };

/** Stamped by the strategy beside the levels it built (`signal.metadata.levelSpec`). */
export interface LevelSpec {
  stop?: LegSpec;
  target?: LegSpec;
  /** C-2: the target is a CEILING (rounded toward entry). Absent ⇒ a floor, as for every strategy but one. */
  targetIsCap?: boolean;
}

export type LegBasis = 'plan' | 'fill_rebased';

export interface RebaseResult {
  ok: true;
  stopPrice: number;
  targetPrice: number;
  stopBasis: LegBasis;
  targetBasis: LegBasis;
  /** Legs whose stamp did not reproduce the arriving plan (exactly, on the birth grid — §13 D3) — kept on the plan. */
  inconsistent: Array<'stop' | 'target'>;
  /**
   * §13.1 C-5: legs PRESENT in the stamp but not well-formed. They fall through to anchor (nothing moves — the fail-safe), and
   * without this field they were invisible: `inconsistent` stays empty, so a total stamping failure read as a clean run.
   */
  malformed: Array<'stop' | 'target'>;
}
export type RebaseOutcome = RebaseResult | { ok: false; reason: string };

const isMixed = (s: LegSpec): s is { op: 'max' | 'min'; terms: [LevelTerm, LevelTerm] } => 'op' in s;
const finitePos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Re-derive one single-form value. `stop` is the CARRIED stop, needed only by `r_multiple`. */
function deriveForm(spec: LevelForm, value: number, plan: number, fill: number, stop: number | null, entryBasis: number = fill): number {
  switch (spec.form) {
    case 'anchor': return value;
    case 'distance': return value + (fill - plan);
    case 'proportional': return value * (fill / plan);
    case 'r_multiple':
      if (stop === null) return NaN; // an r_multiple stop has no meaning
      return entryBasis + spec.r * (entryBasis - stop);
  }
}

/**
 * The value the strategy BUILT for this leg, before any rounding or fill. §13 D2: a single-form `r_multiple` rebuilds it from
 * its stamped operands — the same expression the three sites evaluate (`entry + (entry − stop) * r`), so it is the same double.
 * A mixed leg returns its stamped term values; anchor / distance / proportional reproduce themselves.
 */
function atPlan(spec: LegSpec, level: number): number {
  if (!isMixed(spec)) {
    if (spec.form === 'r_multiple') {
      const { builtEntry, builtStop } = spec;
      return finitePos(builtEntry) && finitePos(builtStop) ? builtEntry + (builtEntry - builtStop) * spec.r : NaN;
    }
    return level;
  }
  const [a, b] = spec.terms;
  return spec.op === 'max' ? Math.max(a.value, b.value) : Math.min(a.value, b.value);
}

/** §13.1 C-2: only these legs REBUILD a value at the plan, so only these are compared on the birth grid. */
const isReconstruction = (s: LegSpec): boolean => isMixed(s) || s.form === 'r_multiple';

/**
 * §13.1 C-1 — THE ONE cap derivation, used at birth (`signal-orchestrator.ts`, the grid rounding) AND at the re-base (the
 * check and the output rounding). A stamp present decides by its own bit; no stamp falls back to the one strategy whose
 * target is a ceiling. Two copies of this differed by exactly one tick — the window the old tolerance swallowed.
 */
export function resolveTargetIsCap(levelSpec: unknown, strategyId: string | null | undefined): boolean {
  if (levelSpec !== undefined) return (levelSpec as { targetIsCap?: unknown } | null)?.targetIsCap === true;
  return strategyId === 'volatility_edge';
}

function deriveLeg(spec: LegSpec, level: number, plan: number, fill: number, stop: number | null, entryBasis: number = fill): number {
  if (!isMixed(spec)) return deriveForm(spec, level, plan, fill, stop, entryBasis);
  const [a, b] = spec.terms;
  const va = deriveForm(a.spec, a.value, plan, fill, stop, entryBasis);
  const vb = deriveForm(b.spec, b.value, plan, fill, stop, entryBasis);
  return spec.op === 'max' ? Math.max(va, vb) : Math.min(va, vb);
}

const isAnchorOnly = (s: LegSpec | undefined): boolean => s === undefined || (!isMixed(s) && s.form === 'anchor');

/** Structural validity of a stamp (shape only — the counterfactual fence proves the FORM is right). */
export function isWellFormedLegSpec(s: unknown): s is LegSpec {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  // §13 D1 (Langston Q2: "required, no fallback"): a SINGLE-FORM r_multiple must carry its construction operands; a mixed
  // term carries its `value` instead. An old-shape single-form stamp is therefore malformed — absent ⇒ nothing moves.
  const okForm = (f: unknown, single: boolean): boolean => {
    if (!f || typeof f !== 'object') return false;
    const ff = f as Record<string, unknown>;
    if (ff.form === 'anchor' || ff.form === 'distance' || ff.form === 'proportional') return true;
    if (ff.form !== 'r_multiple' || !finitePos(ff.r)) return false;
    return !single || (finitePos(ff.builtEntry) && finitePos(ff.builtStop) && ff.builtStop < ff.builtEntry);
  };
  if ('op' in o) {
    if (o.op !== 'max' && o.op !== 'min') return false;
    const t = o.terms;
    return Array.isArray(t) && t.length === 2 && t.every((x) => x && typeof x === 'object'
      && okForm((x as LevelTerm).spec, false) && finitePos((x as LevelTerm).value));
  }
  return okForm(o, true);
}

/**
 * Re-base a long trade's stop and target onto the price paid.
 * @param tick the venue grid tick, or null when the class grid is unknown (xStock passes through unrounded, as at birth).
 */
export function rebaseLevels(i: {
  planEntry: number;
  planStop: number;
  planTarget: number;
  fill: number;
  /**
   * 8c amendment 4 item 3 (Langston): the ENTRY ROLE PRICE, when it differs from the level basis. At the fill (#1250) the
   * price paid is both, so it defaults to `fill`. At crypto BIRTH (8c) the levels move onto the bid (`fill`) while the entry
   * is the ask: an `r_multiple` target is a ratio over OUR geometry (`entry + r·(entry − stop)`), so it reads `entryBasis`,
   * and so does the long-ness assertion — a target inside the spread is not a long trade.
   */
  entryBasis?: number;
  spec: LevelSpec | null | undefined;
  /** The grid the re-based OUTPUT is rounded on (the fill-time grid), or null to leave it unrounded. */
  tick: number | null;
  /**
   * §13 D3: the grid the PLAN was rounded on at birth (`metadata.gridAtBirth.tick` when resolved), or null when the plan
   * arrives unrounded (VTS books unrounded; crypto birth runs before rounding; the xStock passthrough is born unrounded).
   * Kept separate from `tick` because the xStock grid is re-derived every 6 h — the check grades the plan on the grid it
   * was rounded with, never on whatever the map says at the fill (Langston finding 4).
   */
  planTick: number | null;
  /**
   * Step-4 FINDING-1 (Langston 2026-11-15, disposition (a)): the decimal quantum the plan was STORED at before it arrived,
   * or null when it arrives in memory (VTS, crypto birth). The active arm's plan comes back through the RTB queue's
   * `decimal(20,8)` columns, so an UNROUNDED plan (the xStock passthrough, `planTick` null) arrives quantised to 1e-8 — up to
   * 5e-9 off the built value, which is MORE than the 1e-9-relative slack for any price under $5. With a quantum, a rebuilt
   * leg on the planTick-null path is graded within HALF that quantum (the storage error's own bound, plus the slack), never a
   * blanket floor: the scale belongs to the caller whose plan came out of a column. Grid-rounded plans are ≤ 8 dp and
   * survive the column losslessly, so on the planTick path this input is not read.
   */
  planStorageQuantum: number | null;
}): RebaseOutcome {
  const { planEntry, planStop, planTarget, fill, tick, planTick } = i;
  const entryBasis = i.entryBasis ?? fill;
  if (![planEntry, planStop, planTarget, fill, entryBasis].every(finitePos)) return { ok: false, reason: 'invalid_inputs' };
  if (!(planStop < planEntry && planTarget > planEntry)) return { ok: false, reason: 'plan_not_long' };

  const spec = i.spec ?? {};
  // §13.1 C-1: the shared derivation. Step-4 NOTE-2 (Langston): its strategy-name fallback can never matter HERE — with no
  // spec every leg is anchor-only and the cap bit is read by neither the check nor the output rounding — so no name is passed
  // rather than carrying an argument nothing exercises. A present spec (including `null`, "present, not a cap") decides alone.
  const isCap = resolveTargetIsCap(i.spec, null);
  const stopSpec = spec.stop !== undefined && isWellFormedLegSpec(spec.stop) ? spec.stop : undefined;
  const targetSpec = spec.target !== undefined && isWellFormedLegSpec(spec.target) ? spec.target : undefined;
  const malformed: Array<'stop' | 'target'> = [];
  if (spec.stop !== undefined && stopSpec === undefined) malformed.push('stop');
  if (spec.target !== undefined && targetSpec === undefined) malformed.push('target');
  // Double-rounding slack only (104.01 − 104 is 0.010000000000005 in binary) — §13 D3 retired the one-tick tolerance.
  const eps = Math.max(planEntry, fill) * 1e-9;
  const inconsistent: Array<'stop' | 'target'> = [];

  // §13 D3 + §13.1 C-2: self-consistency AT THE RE-BASE SITE, against the plan values that ARRIVE. A leg that REBUILDS its
  // value (single-form r_multiple, mixed) must land EXACTLY on the arriving level once rounded on the birth grid with its
  // role's direction; a leg defined as itself is compared structurally and never re-rounded.
  const reproduces = (s: LegSpec, arriving: number, role: 'stop' | 'target'): boolean => {
    const built = atPlan(s, arriving);
    if (!Number.isFinite(built)) return false;
    if (!isReconstruction(s)) return Math.abs(built - arriving) <= eps; // C-2: a value defined as itself
    if (planTick !== null && finitePos(planTick)) {
      return Math.abs(roundPriceForRole(built, planTick, role, true, role === 'target' && isCap) - arriving) <= eps;
    }
    // Unrounded plan: exact, unless it came out of a column — then within half the column's quantum (FINDING-1 (a)).
    const storageSlack = i.planStorageQuantum !== null && finitePos(i.planStorageQuantum) ? i.planStorageQuantum / 2 : 0;
    return Math.abs(built - arriving) <= eps + storageSlack;
  };
  const stopUsable = stopSpec !== undefined && !isAnchorOnly(stopSpec) && reproduces(stopSpec, planStop, 'stop');
  if (stopSpec !== undefined && !isAnchorOnly(stopSpec) && !stopUsable) inconsistent.push('stop');
  const targetUsable = targetSpec !== undefined && !isAnchorOnly(targetSpec) && reproduces(targetSpec, planTarget, 'target');
  if (targetSpec !== undefined && !isAnchorOnly(targetSpec) && !targetUsable) inconsistent.push('target');

  let stop = stopUsable ? deriveLeg(stopSpec as LegSpec, planStop, planEntry, fill, null, entryBasis) : planStop;
  // The target's r_multiple is kept against the CARRIED stop (Langston BLOCKER-4).
  let target = targetUsable ? deriveLeg(targetSpec as LegSpec, planTarget, planEntry, fill, stop, entryBasis) : planTarget;

  // F-G-1: every price we emit is venue-representable. Boundaries round AWAY from entry; a cap target TOWARD it.
  if (tick !== null && finitePos(tick)) {
    if (stopUsable) stop = roundPriceForRole(stop, tick, 'stop', true);
    if (targetUsable) target = roundPriceForRole(target, tick, 'target', true, isCap);
  }
  if (!finitePos(stop) || !finitePos(target)) return { ok: false, reason: 'non_finite_rebase' };
  if (!(stop < entryBasis && target > entryBasis)) return { ok: false, reason: 'rebased_not_long' };
  // Step-4 CHANGE-2 (Langston, #546): the basis names what HAPPENED to the value, not which path ran — a mixed leg whose
  // anchor term wins at both the plan and the fill is re-applied and lands back on the plan, so it reads 'plan'.
  const moved = (v: number, p: number) => Math.abs(v - p) > Math.max(Math.abs(p), 1) * 1e-12;
  return {
    ok: true,
    stopPrice: stop,
    targetPrice: target,
    stopBasis: stopUsable && moved(stop, planStop) ? 'fill_rebased' : 'plan',
    targetBasis: targetUsable && moved(target, planTarget) ? 'fill_rebased' : 'plan',
    inconsistent,
    malformed,
  };
}
