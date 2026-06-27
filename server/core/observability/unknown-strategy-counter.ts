/**
 * reorg-B2.3 OBJ-5 — Unknown-strategy-at-gate tripwire (observability for the fail-closed path).
 *
 * The per-class minRR gate (`getPerClassTargetGate`) canonicalizes its strategy token via the SSOT
 * `resolveCanonicalStrategy`. An UNRECOGNIZED token (a drift the canonicalization SSOT didn't map) is
 * the one remaining failure surface. SAFETY is handled at the gate by substituting the most-conservative
 * `min_rr_unknown_floor` (fail-CLOSED — a drifted token gets the strictest gate in its class, never a
 * permissive one). This module is the OBSERVABILITY half: a stable, queryable counter so Step-8 can assert
 * it stayed zero outside the deliberate test fixture, plus a §13 system-alert tripwire so a real drift
 * SURFACES (a silent loud-log gets scrolled past — the §10.5 lesson).
 *
 * The two properties are independent BY DESIGN: a missed counter/alert can NOT make an unsafe firing,
 * because the conservative floor substitution at the gate is what guarantees safety, not this counter.
 */
import { AlertsService } from '../../services/alerts-service.js';
import { storage } from '../../storage.js';

/** in-memory counts keyed by asset_class — the queryable metric `dawntrader_gate_unknown_strategy_total{asset_class}` */
const _counts = new Map<string, number>();
/** throttle: at most one §13 alert per asset_class per process lifetime (the floor already made it safe) */
const _alerted = new Set<string>();
/** throttle the loud log to ≤ once / 30s so a flood is loud but not spam */
let _lastWarnAtMs = 0;

/**
 * Record one unknown-strategy-token hit at the gate. Sync + hot-path-safe (no I/O on the call path).
 * @param assetClass the class whose gate was being resolved
 * @param rawToken   the unrecognized token (for the operator to trace the emitting site)
 */
export function recordUnknownStrategyAtGate(assetClass: string, rawToken: string): void {
  _counts.set(assetClass, (_counts.get(assetClass) ?? 0) + 1);

  // LOUD (never silent) but throttled.
  const nowMs = Date.now();
  if (nowMs - _lastWarnAtMs > 30_000) {
    _lastWarnAtMs = nowMs;
    console.warn(
      `[reorg-B2.3][unknown-strategy-at-gate] UNRECOGNIZED strategy token "${rawToken}" ` +
      `(assetClass=${assetClass}) → failed CLOSED to min_rr_unknown_floor. ` +
      `counts=${JSON.stringify(Object.fromEntries(_counts))}`,
    );
  }

  // TRIPWIRE: fire-and-forget a §13 system alert ONCE per asset_class per process. The substitution already
  // made the firing safe; this only needs to surface that drift is happening so it gets fixed. Off the hot
  // path (not awaited) — a rare event, hard-throttled, so it can never spam or block the gate.
  if (!_alerted.has(assetClass)) {
    _alerted.add(assetClass);
    void _raiseUnknownStrategyAlert(assetClass, rawToken).catch((e) =>
      console.error('[unknown-strategy-at-gate] tripwire alert raise failed:', e),
    );
  }
}

/** The queryable metric — Step-8 asserts this is `{}` (or all-zero) outside the deliberate test fixture. */
export function getUnknownStrategyCounts(): Record<string, number> {
  return Object.fromEntries(_counts);
}

/** test-only: reset the counter + throttles between fixtures. */
export function __resetUnknownStrategyCountsForTest(): void {
  _counts.clear();
  _alerted.clear();
  _lastWarnAtMs = 0;
}

async function _raiseUnknownStrategyAlert(assetClass: string, rawToken: string): Promise<void> {
  const users = await storage.getAllUsers();
  const adminUsers = users.filter((u) => u.isAdmin);
  for (const admin of adminUsers) {
    await AlertsService.createAlert({
      userId: admin.id,
      mode: 'paper',
      alertType: 'unknown_strategy_at_gate',
      severity: 'warning',
      category: 'actionable',
      message:
        `Unrecognized strategy token "${rawToken}" reached the per-class minRR gate ` +
        `(assetClass=${assetClass}) and was failed CLOSED to the conservative floor. A strategy-name ` +
        `drift slipped past the canonicalization SSOT — investigate the emitting site. (reorg-B2.3 tripwire)`,
      // NOTE (Langston Step-4): mode is hardcoded 'paper' for the alert envelope, but this is a CODE-DRIFT
      // observability alert that fires on BOTH the paper AND live gate paths — it is NOT a paper-only event.
      // `firesOnAllModes: true` records that so a future reader doesn't mistake it for paper-path-scoped.
      metadata: { assetClass, rawToken, source: 'getPerClassTargetGate', firesOnAllModes: true, counts: getUnknownStrategyCounts() },
    });
  }
}
