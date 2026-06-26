/**
 * P19-B6.7 — Feed-health aggregation primitives (pure, no I/O).
 *
 * After the vestigial 2nd WebSocket (#301) was removed, the four feed-health
 * consumers read the PRIMARY adapter's per-symbol health (`getI8EWsHealth()`).
 * That is per-symbol; the consumers need ONE signal each — and the correct
 * aggregate differs by consumer (Langston/CC-A Step-2 consensus):
 *
 *  - ALARM (feed-integrity-monitor)  → FEED-LEVEL aliveness = FRESHEST-symbol age.
 *      "the feed is alive if ANY subscribed symbol ticked; critical only when
 *       NONE ticked within threshold." Worst-case-per-symbol would false-CRITICAL
 *       on a single legitimately-quiet illiquid pair — the inverse of the bug
 *       B6.7 removes. So the alarm grades the freshest symbol.
 *  - GO-LIVE GATE (parity-gate)      → PROPORTION-fresh, worst-case-conservative.
 *      A readiness gate must NOT pass off one lively symbol; require most of the
 *      subscribed set fresh, err toward not-ready.
 *  - STATUS / DISPLAY (health-monitor, system-health-monitor) → freshest-symbol.
 *
 * These are pure functions over a minimal shape so they unit-test without a live
 * adapter. Asset-class partitioning + the xStock market-hours gate + warmup grace
 * live at the ALARM call site (feed-integrity-monitor), not here.
 */

/** Minimal per-symbol freshness shape (subset of the primary adapter's getI8EWsHealth() rows). */
export interface SymbolFreshness {
  symbol: string;
  /** ms since this symbol's last tick; null = it has never ticked (no data yet). */
  ageMs: number | null;
}

/**
 * FRESHEST-symbol age = the minimum ageMs across symbols that have ticked.
 * Returns null when NO symbol has ticked (the whole set is silent / no data) —
 * the "is the feed alive at all" signal. Symbols with ageMs === null (never
 * ticked) do not count as fresh and are skipped.
 */
export function freshestSymbolAgeMs(items: SymbolFreshness[]): number | null {
  let best: number | null = null;
  for (const it of items) {
    if (it.ageMs === null || it.ageMs === undefined) continue;
    if (best === null || it.ageMs < best) best = it.ageMs;
  }
  return best;
}

/**
 * Proportion (0..1) of the set that is fresh (ageMs <= thresholdMs). Symbols that
 * have never ticked (null) count as NOT fresh. An empty set returns 0 — vacuously
 * "not ready" — which is the conservative choice for a go-live gate (never PASS on
 * an empty / unknown feed).
 */
export function proportionFresh(items: SymbolFreshness[], thresholdMs: number): number {
  if (items.length === 0) return 0;
  let fresh = 0;
  for (const it of items) {
    if (it.ageMs !== null && it.ageMs !== undefined && it.ageMs <= thresholdMs) fresh++;
  }
  return fresh / items.length;
}

/**
 * GO-LIVE GATE readiness (parity-gate). P19-B6.7 (#301): the removed 2nd WS stayed
 * TCP-connected while delivering zero ticks, so "connected" alone false-PASSED the
 * go-live gate. Readiness now requires BOTH: (a) connected with acceptable uptime
 * (derived from reconnects), AND (b) a CONSERVATIVE proportion of subscribed symbols
 * actually delivering fresh ticks (worst-case aggregate — not freshest-one). Pure so
 * it unit-tests both directions without a live adapter.
 */
export interface WsReadinessOpts {
  simulationDurationMs: number;
  minWsUptimePercent: number;
  freshTickMaxMs: number;
  minSymbolsFreshPercent: number;
}
export interface WsReadiness {
  passed: boolean;
  uptimePercent: number;
  freshPercent: number;
}
export function assessWsReadiness(
  status: { isConnected: boolean; reconnectAttempts: number },
  health: SymbolFreshness[],
  opts: WsReadinessOpts,
): WsReadiness {
  const estimatedChecks = Math.max(120, opts.simulationDurationMs / 5000);
  const uptimePercent = status.isConnected
    ? Math.max(0, (1 - status.reconnectAttempts / estimatedChecks) * 100)
    : 0;
  const freshPercent = proportionFresh(health, opts.freshTickMaxMs) * 100;
  const passed = uptimePercent >= opts.minWsUptimePercent
    && freshPercent >= opts.minSymbolsFreshPercent;
  return { passed, uptimePercent, freshPercent };
}

export type FeedAliveGrade = 'healthy' | 'warning' | 'critical';

/**
 * Grade FEED-LEVEL aliveness from the freshest-symbol age (the ALARM aggregate).
 * `freshestAgeMs === null` (no symbol has ticked at all) → the feed is silent →
 * critical-eligible. The CALLER is responsible for suppressing this where silence
 * is legitimate (xStock market closed, post-open warmup grace, dormant mode).
 *
 * Two thresholds on the SAME aggregate (warning < critical) — not a second
 * aggregate. Asset-class-specific threshold values come from DB config (§11).
 */
export function gradeFeedAliveness(
  freshestAgeMs: number | null,
  warningMs: number,
  criticalMs: number,
): FeedAliveGrade {
  if (freshestAgeMs === null) return 'critical';
  if (freshestAgeMs >= criticalMs) return 'critical';
  if (freshestAgeMs >= warningMs) return 'warning';
  return 'healthy';
}
