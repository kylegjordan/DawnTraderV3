/**
 * P19-B5b (#94) — xStock decision-time equity-macro snapshot.
 *
 * Stamped onto EVERY xStock decision record (reject + admitted) in the eval cycle
 * so Phase-25 item 25-7 has decision-time backdrop to train the macro modifier.
 * CAPTURE ONLY — the modifier build stays Phase-25.
 *
 * Extracted from `eval-cycle.ts` so the shaping logic (the null-preservation +
 * freshness contract Langston gated on at Step-2) is unit-testable in isolation
 * without eval-cycle's heavy import chain. xStock-only by usage: imported solely
 * by the xStock eval cycle; crypto archive writes never call it.
 */
import { getLatestEquitySnapshot } from '../../services/amr-equity-feed.js';

/**
 * Build the `features.macro` object from the current equity-macro feed snapshot.
 *
 * Contract (Langston Step-1/Step-2):
 * - **Straight field copy, NOT omit-on-null** — an explicit `vixZ: null`
 *   (market-closed / below-min-obs) stays a different fact from a neutral `0`.
 *   JSON.stringify preserves explicit-null keys; it would only drop a key the
 *   object literally never set, which this never does.
 * - Captures BOTH z-scores AND raw `vix`/`dxy`: z is baseline-dependent and 25-7
 *   may recompute the rolling baseline, so the raw values are the only
 *   baseline-independent ground truth we can't regenerate (Q-A).
 * - Freshness: `ageSeconds` (relative to the read; `Infinity`/never-polled →
 *   explicit `null` so JSON doesn't silently coerce it) + the absolute per-source
 *   stamps `vixObservedAt` / `dxyEcbDate` — so a stale market-closed reading can
 *   never be read by 25-7 as decision-time-fresh.
 * - `partialFeed`: one source flowing while the other isn't — NOT derivable from
 *   the value-nulls (which also mean below-min-obs), so it carries real signal.
 *
 * `getLatestEquitySnapshot()` is a sync in-memory read (no await / DB / fetch),
 * and this is a pure straight-copy that cannot throw — safe on the every-cycle
 * hot path even though these archive writes are live-on-merge (NOT dormant).
 */
export function buildMacroSnapshot(): Record<string, unknown> {
  const s = getLatestEquitySnapshot();
  return {
    vixZ: s.vixZ,
    dxyZ: s.dxyZ,
    vix: s.vix,
    dxy: s.dxy,
    ageSeconds: Number.isFinite(s.ageSeconds) ? s.ageSeconds : null,
    partialFeed: s.partialFeed,
    vixObservedAt: s.vixObservedAt,
    dxyEcbDate: s.dxyEcbDate,
  };
}
