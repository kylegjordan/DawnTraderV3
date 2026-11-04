/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-CRYPTO-FEED-WATCHDOG (#1232, P7) — is a crypto ticker witness fit to GRADE a close?
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The not-warm close gate (`active-execution-engine.ts`, the `walk_above_reference` arm,
 * built by B-FEED-MISMATCH-FIX) refuses a walked close that sits above the ticker
 * witness's bid. `getTickerWitness` is fail-open on ABSENCE (a miss returns null and the
 * close proceeds) — but a dead recorder does not produce absence, it produces a FROZEN
 * PRESENCE: on 2026-10-21 → 11-04 thirteen closes carried a witness frozen at 10:19:57Z
 * and one (GLMR/USD) a witness from a symbol no longer in the recorder at all. A frozen
 * presence is the worse input, because it is the one the gate consents to grade against.
 *
 * So a witness GRADES only if it is VOUCHED:
 *   (a) its symbol is in the recorder's subscribed universe, AND
 *   (b) DATA is arriving on the connection that owns it, AND
 *   (c) its age is within `close_fill_contract.witness_max_age_ms` (a backstop: a quiet
 *       coin's newest row is legitimately hours old, so age alone cannot tell quiet from
 *       frozen — liveness can).
 * Otherwise the close is not graded and is stamped `walk_witness_unvouched`. Unknown
 * liveness (no config, no connection) is NOT vouched — never assumed live.
 * The bound lives HERE, on the consumer; `getTickerWitness` stays fail-open.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export type WitnessVouchReason = 'vouched' | 'not_in_recorder' | 'connection_not_live' | 'liveness_unknown' | 'too_old';

export interface WitnessVouch {
  vouched: boolean;
  reason: WitnessVouchReason;
  ageMs: number;
}

export function decideWitnessVouch(input: {
  inRecorderUniverse: boolean;
  /** true / false, or null when it cannot be judged. */
  connectionLive: boolean | null;
  capturedAtMs: number;
  nowMs: number;
  maxAgeMs: number;
}): WitnessVouch {
  const ageMs = Math.max(0, input.nowMs - input.capturedAtMs);
  if (!input.inRecorderUniverse) return { vouched: false, reason: 'not_in_recorder', ageMs };
  if (input.connectionLive === null) return { vouched: false, reason: 'liveness_unknown', ageMs };
  if (!input.connectionLive) return { vouched: false, reason: 'connection_not_live', ageMs };
  if (ageMs > input.maxAgeMs) return { vouched: false, reason: 'too_old', ageMs };
  return { vouched: true, reason: 'vouched', ageMs };
}
