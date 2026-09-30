/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c` increment 3a-ii (plan §C3, P14, J7) — the close-time friction LEDGER for both VTS
 * lanes: counters SINCE BOOT, printed on the per-pass VTS_TOUCH line so a reading at any hour sees the running total,
 * plus the refusal alert.
 *   - `recomposed`  — closes booked under the per-leg rule (`recomposeVtsCloseFriction`).
 *   - `legacyBasis` — closes of a trade opened before every writer stamped `entryPriceBasis`; the positive control while
 *                     pre-stamp trades close. CUMULATIVE since boot, so it PLATEAUS rather than falling: what decays to 0
 *                     is its per-interval increase, once every pre-stamp trade has closed (≤ MAX_HOLD after the deploy).
 *                     A restart resets all four counters, so a plateau is read within one boot (the Step-7 extract).
 *   - `refused`     — a close missing SOME cost inputs (a writer lost one); the stamped scalar was booked
 *                     (`frictionBasis = 'stamped'`). Must stay 0. Each refusal logs, and raises ONE alert (dedupe
 *                     `vts-friction-recompose-refused`) — RESOLVE it with evidence, never ACK: an unresolved row blocks
 *                     the key's next mint (`#982`).
 *   - `unpriced`    — a close whose record carried NO cost input at all, not even `chosenEntryMode` (the shadow lane,
 *                     which books `frictionCost: 0`); counted separately and NEVER alerted — a lane never priced, not a
 *                     lost stamp.
 * Its own module (not inline in the runner) so the refusal arm is exercised at build (plan §C3.8).
 */
import type { VtsCloseFriction } from '../core/trading/vts-friction.js';

const counters = { recomposed: 0, legacyBasis: 0, refused: 0, unpriced: 0 };

/** A copy of the since-boot counters (never the live object). */
export function vtsFrictionSinceBoot(): { recomposed: number; legacyBasis: number; refused: number; unpriced: number } {
  return { ...counters };
}

export function noteVtsCloseFriction(lane: 'vts' | 'shadow', trade: { symbol: string }, fr: VtsCloseFriction): void {
  if (fr.basis === 'recomposed') counters.recomposed++;
  if (fr.legacyBasis) counters.legacyBasis++;
  // `unpriced` — a record that never carried a cost input (the shadow lane today): counted, NOT the tripwire, no alert.
  if (fr.basis === 'unpriced') { counters.unpriced++; return; }
  if (fr.basis !== 'stamped') return;
  counters.refused++;
  console.error(`[8a-P4c][VTS_FRICTION_REFUSED] lane=${lane} ${trade.symbol}: close friction NOT recomposed (missing ${fr.missing}) — the stamped figure was booked, labelled frictionBasis=stamped`);
  void import('./system-alerts.js').then(({ addAlert }) => addAlert({
    triggers_at: new Date(),
    category: 'breakage',
    severity: 'warning',
    title: `A VTS close could not recompose its friction (${trade.symbol}, missing ${fr.missing})`,
    body: `A ${lane} VTS close for ${trade.symbol} was missing ${fr.missing}, so its friction was NOT recomposed under the `
      + `per-leg rule (8a-P4c increment 3a-ii); the open-time estimate was booked and the row is labelled frictionBasis=stamped. `
      + `Every open writer stamps these fields, so this means a writer lost one. RESOLVE this alert with evidence once the `
      + `writer is found — do not ACK it (an ack freezes the dedupe key and hides the next occurrence).`,
    dedupe_key: 'vts-friction-recompose-refused',
  })).catch((err) => console.error('[8a-P4c][VTS_FRICTION_REFUSED] alert raise failed:', err instanceof Error ? err.message : err));
}
