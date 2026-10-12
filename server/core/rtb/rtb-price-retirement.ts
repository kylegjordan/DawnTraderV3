/**
 * `B-RTB-REFRESH-LIVE-PRICE` (sprint row 59e, `#1168` frozen-levels half; Kyle's directive 3, 2026-10-07) — THE RTB REFRESH'S
 * PRICE DECISION. Pure: the ask is read elsewhere (`server/services/rtb-retirement-ask.ts`) and handed in.
 *
 * ⛔ WHAT THIS IS, AND WHAT IT IS NOT (Langston Step-2 C6): row 59 increment 1 already refuses a bad OPEN — `refuseTakerBooking`
 * on the depth-walked fill (`active-execution-engine.ts`, the taker branch). So this retirement is QUEUE HYGIENE, NOT the capital
 * safety net. A MISSED retirement costs nothing (the open still refuses); a FALSE one deletes a queued opportunity. ⇒ every
 * ambiguous input resolves to KEEP: no admissible ask ⇒ `unpriced`, never a retirement.
 *
 * THE RULE: the same primitive the open uses — a long whose transactable ASK is at or through its own stop or its own target
 * cannot be bought as the trade it was planned as. **Crypto retires on the first pass; xStock on the SECOND CONSECUTIVE pass that
 * refuses on the same level** — the pre-registered consequence of the re-admission gap (`B_RTB_REFRESH_LIVE_PRICE_PRE_AUDIT.md`
 * §0 M3, §1.3: crypto median 29.9 s, xStock 1 h 47 m — a false xStock retirement costs hours, a crypto one about one cycle).
 * Never moves a stop or a target; never re-derives levels.
 */
import { refuseTakerBooking, type TakerBookingRefusal } from '../trading/entry-booking.js';

/**
 * `readAtMs` + `ceilingMs` (Langston Step-4 CONDITION 1): the ask is judged fresh at READ time but acted on later — the refresh
 * awaits per-chunk work in between (measured on the deployed code, `rankDuration` n=63: p50 669 ms, p99 1,290 ms, max 1,299 ms).
 * The decision re-checks the age AT DECIDE TIME against the same ceiling the read applied, so an ask that was fresh when read
 * but stale when acted on is `unpriced` (`ask_expired`), never a retirement.
 */
export type RetirementAsk =
  | { ok: true; ask: number; bid: number; ageMs: number; basis: string; readAtMs: number; ceilingMs: number }
  | { ok: false; reason: string };

/** A refusal carried from the previous pass of the same signal (xStock needs two in a row on the same level). */
export interface PriorBreach { reason: TakerBookingRefusal; passes: number }

export type RetirementDecision =
  | { action: 'unpriced'; reason: string }
  | { action: 'inside' }
  | { action: 'hold_breach'; reason: TakerBookingRefusal; passes: number }
  | { action: 'retire'; reason: TakerBookingRefusal; passes: number };

/** Consecutive refusing passes required before a retirement, per class. Classes not listed are never price-retired. */
export const RETIREMENT_PASSES_REQUIRED: Readonly<Record<string, number>> = {
  crypto_spot: 1,
  xstock_spot: 2,
};

export function decideRetirement(input: {
  assetClass: string | null;
  ask: RetirementAsk;
  stopPrice: number;
  targetPrice: number | null;
  prior: PriorBreach | null;
  /** Decision time; defaults to now. */
  nowMs?: number;
}): { decision: RetirementDecision; nextBreach: PriorBreach | null } {
  const required = input.assetClass ? RETIREMENT_PASSES_REQUIRED[input.assetClass] : undefined;
  if (required === undefined) return { decision: { action: 'unpriced', reason: 'class_unsupported' }, nextBreach: null };
  // No admissible ask: no decision on price, and the streak RESETS — "consecutive" means two refusing passes with nothing
  // between them (the pre-audit's item 3: reset by any pass that does not refuse). The conservative direction (C6).
  if (!input.ask.ok) return { decision: { action: 'unpriced', reason: input.ask.reason }, nextBreach: null };
  // CONDITION 1: the age the ask has NOW, not when it was read.
  const ageNow = input.ask.ageMs + ((input.nowMs ?? Date.now()) - input.ask.readAtMs);
  if (!(ageNow <= input.ask.ceilingMs)) return { decision: { action: 'unpriced', reason: 'ask_expired' }, nextBreach: null };
  if (!Number.isFinite(input.stopPrice) || input.stopPrice <= 0) {
    return { decision: { action: 'unpriced', reason: 'stop_not_finite' }, nextBreach: null };
  }
  const refusal = refuseTakerBooking(input.ask.ask, input.stopPrice, input.targetPrice ?? Number.NaN);
  if (refusal === null) return { decision: { action: 'inside' }, nextBreach: null };
  const passes = input.prior && input.prior.reason === refusal ? input.prior.passes + 1 : 1;
  if (passes >= required) return { decision: { action: 'retire', reason: refusal, passes }, nextBreach: null };
  return { decision: { action: 'hold_breach', reason: refusal, passes }, nextBreach: { reason: refusal, passes } };
}
