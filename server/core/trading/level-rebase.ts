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
  | { form: 'r_multiple'; r: number }
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
  /** Legs whose stamp did not reproduce the arriving plan within one tick — kept on the plan (§8.2). */
  inconsistent: Array<'stop' | 'target'>;
}
export type RebaseOutcome = RebaseResult | { ok: false; reason: string };

const isMixed = (s: LegSpec): s is { op: 'max' | 'min'; terms: [LevelTerm, LevelTerm] } => 'op' in s;
const finitePos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Re-derive one single-form value. `stop` is the CARRIED stop, needed only by `r_multiple`. */
function deriveForm(spec: LevelForm, value: number, plan: number, fill: number, stop: number | null): number {
  switch (spec.form) {
    case 'anchor': return value;
    case 'distance': return value + (fill - plan);
    case 'proportional': return value * (fill / plan);
    case 'r_multiple':
      if (stop === null) return NaN; // an r_multiple stop has no meaning
      return fill + spec.r * (fill - stop);
  }
}

/** The value the spec gives at the PLAN entry — what the strategy built, before any fill. */
function atPlan(spec: LegSpec, level: number, plan: number, planStop: number | null): number {
  if (!isMixed(spec)) {
    if (spec.form === 'r_multiple') return planStop === null ? NaN : plan + spec.r * (plan - planStop);
    return level; // anchor / distance / proportional reproduce themselves at the plan
  }
  const [a, b] = spec.terms;
  return spec.op === 'max' ? Math.max(a.value, b.value) : Math.min(a.value, b.value);
}

function deriveLeg(spec: LegSpec, level: number, plan: number, fill: number, stop: number | null): number {
  if (!isMixed(spec)) return deriveForm(spec, level, plan, fill, stop);
  const [a, b] = spec.terms;
  const va = deriveForm(a.spec, a.value, plan, fill, stop);
  const vb = deriveForm(b.spec, b.value, plan, fill, stop);
  return spec.op === 'max' ? Math.max(va, vb) : Math.min(va, vb);
}

const isAnchorOnly = (s: LegSpec | undefined): boolean => s === undefined || (!isMixed(s) && s.form === 'anchor');

/** Structural validity of a stamp (shape only — the counterfactual fence proves the FORM is right). */
export function isWellFormedLegSpec(s: unknown): s is LegSpec {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  const okForm = (f: unknown): boolean => {
    if (!f || typeof f !== 'object') return false;
    const ff = f as Record<string, unknown>;
    if (ff.form === 'anchor' || ff.form === 'distance' || ff.form === 'proportional') return true;
    return ff.form === 'r_multiple' && finitePos(ff.r);
  };
  if ('op' in o) {
    if (o.op !== 'max' && o.op !== 'min') return false;
    const t = o.terms;
    return Array.isArray(t) && t.length === 2 && t.every((x) => x && typeof x === 'object'
      && okForm((x as LevelTerm).spec) && finitePos((x as LevelTerm).value));
  }
  return okForm(o);
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
  spec: LevelSpec | null | undefined;
  tick: number | null;
}): RebaseOutcome {
  const { planEntry, planStop, planTarget, fill, tick } = i;
  if (![planEntry, planStop, planTarget, fill].every(finitePos)) return { ok: false, reason: 'invalid_inputs' };
  if (!(planStop < planEntry && planTarget > planEntry)) return { ok: false, reason: 'plan_not_long' };

  const spec = i.spec ?? {};
  const stopSpec = spec.stop !== undefined && isWellFormedLegSpec(spec.stop) ? spec.stop : undefined;
  const targetSpec = spec.target !== undefined && isWellFormedLegSpec(spec.target) ? spec.target : undefined;
  // One tick, plus double-rounding slack (104.01 − 104 is 0.010000000000005 in binary), or 1e-9 relative off-grid.
  const tol = (tick !== null && finitePos(tick) ? tick : 0) + Math.max(planEntry, fill) * 1e-9;
  const inconsistent: Array<'stop' | 'target'> = [];

  // §8.2 self-consistency, AT THE RE-BASE SITE, against the plan values that ARRIVE (post-rounding on the active arm).
  const stopUsable = stopSpec !== undefined && !isAnchorOnly(stopSpec)
    && Math.abs(atPlan(stopSpec, planStop, planEntry, null) - planStop) <= tol;
  if (stopSpec !== undefined && !isAnchorOnly(stopSpec) && !stopUsable) inconsistent.push('stop');
  const targetUsable = targetSpec !== undefined && !isAnchorOnly(targetSpec)
    && Math.abs(atPlan(targetSpec, planTarget, planEntry, planStop) - planTarget) <= tol;
  if (targetSpec !== undefined && !isAnchorOnly(targetSpec) && !targetUsable) inconsistent.push('target');

  let stop = stopUsable ? deriveLeg(stopSpec as LegSpec, planStop, planEntry, fill, null) : planStop;
  // The target's r_multiple is kept against the CARRIED stop (Langston BLOCKER-4).
  let target = targetUsable ? deriveLeg(targetSpec as LegSpec, planTarget, planEntry, fill, stop) : planTarget;

  // F-G-1: every price we emit is venue-representable. Boundaries round AWAY from entry; a cap target TOWARD it.
  if (tick !== null && finitePos(tick)) {
    if (stopUsable) stop = roundPriceForRole(stop, tick, 'stop', true);
    if (targetUsable) target = roundPriceForRole(target, tick, 'target', true, spec.targetIsCap === true);
  }
  if (!finitePos(stop) || !finitePos(target)) return { ok: false, reason: 'non_finite_rebase' };
  if (!(stop < fill && target > fill)) return { ok: false, reason: 'rebased_not_long' };
  return {
    ok: true,
    stopPrice: stop,
    targetPrice: target,
    stopBasis: stopUsable ? 'fill_rebased' : 'plan',
    targetBasis: targetUsable ? 'fill_rebased' : 'plan',
    inconsistent,
  };
}
