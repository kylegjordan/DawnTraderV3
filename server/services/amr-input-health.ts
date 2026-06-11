/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-5 AMR (Obj-15b) — runtime input-health sentinels
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Kyle directive 2026-06-11: flowing ≠ correct. Every AMR input reports
 * {fresh, inBounds, varying, crossConsistent} each cycle; failures route
 * through the system-alerts queue immediately, deduped per incident.
 *
 * Detector classes (Langston-ratified with riders R1-R5):
 *   ABSENCE/STALENESS — input absent beyond per-input tolerance.
 *   OUT-OF-BOUNDS     — DB-tunable plausibility rails; a violating reading is
 *                       QUARANTINED (nulled-with-reason upstream, NEVER
 *                       consumed, NEVER clamped). R2: quarantine may tighten
 *                       posture, never loosen (enforced in the aggregator).
 *   STUCK-VALUE       — R3: distinct-value-COUNT arming (≥K distinct values
 *                       over a trailing window; scale-free, quantization-
 *                       proof), then N identical consecutive observations →
 *                       alert. Stuck at EXACTLY ZERO (frozen-at-init, the
 *                       #219 flipRate failure class) uses a faster N.
 *                       Legitimately-quiet series disarm honestly.
 *   CROSS-SOURCE      — where second sources exist (CBOE-vs-FRED VIX on
 *                       trade date; the feed computes it — we surface it).
 *
 * R1: sentinels run under shadow + active ONLY (disabled = no compute, by
 * A5 construction — the aggregator never calls this for a disabled class).
 * Health alerts fire in shadow too: a silently broken input during the watch
 * week corrupts the very evidence the flip decision reads.
 *
 * Incident model (B-NEW-51 dedupe): one alert per (class, input, failure
 * kind) incident; the incident CLOSES when the value resumes varying /
 * returns in-bounds, so a feed that breaks twice re-alerts (Langston rider).
 *
 * All rails DB-governed: module_constants `amr_input_health` (§11).
 */

import { getCachedNumberRequired } from './module-constants-service.js';
import { getLatestEquitySnapshot } from './amr-equity-feed.js';
import type { AssetClass } from '../../shared/asset-classes.js';
import type { AmrWeatherInputs } from './amr-weather-report.js';

export interface InputHealthReading {
  input: string;
  fresh: boolean;
  inBounds: boolean;
  varying: boolean | null;        // null = detector disarmed (legit-quiet or warming)
  crossConsistent: boolean | null; // null = no second source / pending
  quarantined: boolean;
  detail?: string;
}

interface InputTrack {
  /** Recent observed values (bounded) for distinct-count arming + stuck runs. */
  recent: Array<{ v: number; epoch: number; at: number }>;
  identicalRun: number;
  lastValue: number | null;
  openIncidents: Set<string>; // failure kinds currently alerted (incident dedupe)
}

const tracks = new Map<string, InputTrack>(); // key: `${class}:${input}`

function trackFor(assetClass: AssetClass, input: string): InputTrack {
  const key = `${assetClass}:${input}`;
  let t = tracks.get(key);
  if (!t) {
    t = { recent: [], identicalRun: 0, lastValue: null, openIncidents: new Set() };
    tracks.set(key, t);
  }
  return t;
}

function railKey(assetClass: AssetClass) {
  return { exchange: '*', assetClass, strategy: '*', regime: '*' };
}

function rail(assetClass: AssetClass, name: string): number {
  return getCachedNumberRequired('amr_input_health', name, railKey(assetClass));
}

function fireAlert(assetClass: AssetClass, input: string, kind: string, detail: string): void {
  const t = trackFor(assetClass, input);
  if (t.openIncidents.has(kind)) return; // one alert per incident
  t.openIncidents.add(kind);
  void import('./system-alerts.js').then(({ addAlert }) => addAlert({
    title: `AMR input health: ${assetClass}/${input} ${kind}`,
    body: detail,
    severity: 'warning',
    dedupe_key: `amr_health_${assetClass}_${input}_${kind}`,
    metadata: { assetClass, input, kind },
  } as never)).catch(err => {
    console.warn(`[B-5][AMR][HEALTH] alert dispatch failed: ${err instanceof Error ? err.message : err}`);
  });
  console.warn(`[B-5][AMR][HEALTH] ${assetClass}/${input} ${kind}: ${detail}`);
}

function closeIncident(assetClass: AssetClass, input: string, kind: string): void {
  const t = trackFor(assetClass, input);
  if (t.openIncidents.delete(kind)) {
    console.log(`[B-5][AMR][HEALTH] ${assetClass}/${input} ${kind} incident closed (value recovered)`);
  }
}

/**
 * Track one numeric observation: distinct-count arming + identical-run stuck
 * detection (R3). Returns the `varying` verdict (null = disarmed).
 */
function observeValue(assetClass: AssetClass, input: string, value: number, epoch: number, now: number): boolean | null {
  const t = trackFor(assetClass, input);
  if (t.lastValue !== null && value === t.lastValue) {
    t.identicalRun++;
  } else {
    t.identicalRun = 0;
    if (t.lastValue !== null) closeIncident(assetClass, input, 'stuck_value');
  }
  t.lastValue = value;
  t.recent.push({ v: value, epoch, at: now });
  const windowMs = rail(assetClass, 'stuck_arming_window_days') * 86_400_000;
  while (t.recent.length > 5000 || (t.recent.length > 0 && now - t.recent[0].at > windowMs)) t.recent.shift();

  const distinct = new Set(t.recent.map(r => r.v)).size;
  const armed = distinct >= rail(assetClass, 'stuck_arming_distinct_k');
  if (!armed) return null; // legit-quiet or warming → honestly disarmed

  const isZeroish = value === 0;
  const limit = isZeroish ? rail(assetClass, 'stuck_zero_epochs_n') : rail(assetClass, 'stuck_value_epochs_n');
  if (t.identicalRun >= limit) {
    fireAlert(assetClass, input, 'stuck_value',
      `value ${value} identical for ${t.identicalRun} distinct-observation epochs (limit ${limit}${isZeroish ? ', zero-sentinel fast path' : ''}) while history shows ${distinct} distinct values — the #219 frozen-feed class.`);
    return false;
  }
  return true;
}

function checkBounds(assetClass: AssetClass, input: string, value: number, minRail: string | null, maxRail: string | null): boolean {
  const lo = minRail !== null ? rail(assetClass, minRail) : -Infinity;
  const hi = maxRail !== null ? rail(assetClass, maxRail) : Infinity;
  const ok = value >= lo && value <= hi;
  if (!ok) {
    fireAlert(assetClass, input, 'out_of_bounds', `reading ${value} outside plausibility rails [${lo}, ${hi}] — QUARANTINED (never consumed).`);
  } else {
    closeIncident(assetClass, input, 'out_of_bounds');
  }
  return ok;
}

/**
 * Evaluate all sentinel classes for one class-cycle. Called by the weather
 * aggregator on LIVE epochs only (R1: shadow + active; disabled never
 * computes; IDLE epochs are not health failures).
 */
export function evaluateInputHealth(
  assetClass: AssetClass,
  inputs: AmrWeatherInputs,
  epoch: number,
  now: number = Date.now(),
): InputHealthReading[] {
  const out: InputHealthReading[] = [];

  // vote percentage
  if (inputs.votePct !== null) {
    const inBounds = checkBounds(assetClass, 'vote', inputs.votePct, 'vote_pct_min', 'vote_pct_max');
    const varying = observeValue(assetClass, 'vote', inputs.votePct, epoch, now);
    out.push({ input: 'vote', fresh: true, inBounds, varying, crossConsistent: null, quarantined: !inBounds });
  } else {
    out.push({ input: 'vote', fresh: false, inBounds: true, varying: null, crossConsistent: null, quarantined: false, detail: 'absent' });
  }

  // friction score
  if (inputs.frictionScore !== null) {
    const inBounds = checkBounds(assetClass, 'friction', inputs.frictionScore, 'friction_score_min', 'friction_score_max');
    const varying = observeValue(assetClass, 'friction', inputs.frictionScore, epoch, now);
    out.push({ input: 'friction', fresh: true, inBounds, varying, crossConsistent: null, quarantined: !inBounds });
  } else {
    out.push({ input: 'friction', fresh: false, inBounds: true, varying: null, crossConsistent: null, quarantined: false, detail: inputs.frictionReason ?? 'absent' });
  }

  // DBS
  if (inputs.dbsScore !== null) {
    const abs = Math.abs(inputs.dbsScore);
    const inBounds = checkBounds(assetClass, 'dbs', abs, null, 'dbs_abs_max');
    const varying = observeValue(assetClass, 'dbs', inputs.dbsScore, epoch, now);
    out.push({ input: 'dbs', fresh: !inputs.dbsIsStale, inBounds, varying, crossConsistent: null, quarantined: !inBounds });
  } else {
    out.push({ input: 'dbs', fresh: false, inBounds: true, varying: null, crossConsistent: null, quarantined: false, detail: 'absent' });
  }

  // macro composite (z-magnitude rail + class-specific raw rails)
  if (inputs.macroMaxAbsZ !== null) {
    const inBounds = checkBounds(assetClass, 'macro', inputs.macroMaxAbsZ, null, 'z_abs_max');
    const varying = observeValue(assetClass, 'macro', inputs.macroMaxAbsZ, epoch, now);
    let crossConsistent: boolean | null = null;
    if (assetClass === 'xstock_spot') {
      const eq = getLatestEquitySnapshot();
      crossConsistent = eq.fredCrossCheck === 'ok' ? true : eq.fredCrossCheck === 'divergent' ? false : null;
      if (eq.fredCrossCheck === 'divergent') {
        fireAlert(assetClass, 'macro', 'source_divergence',
          `CBOE-vs-FRED VIX same-trade-date divergence ${eq.fredDivergencePoints?.toFixed(2)} pts exceeds the rail.`);
      } else if (eq.fredCrossCheck === 'ok') {
        closeIncident(assetClass, 'macro', 'source_divergence');
      }
      if (eq.schemaGuardTripped) {
        fireAlert(assetClass, 'macro', 'schema_drift', 'CBOE payload schema guard tripped — VIX ingestion halted (structural drift, no fallback by design).');
      } else {
        closeIncident(assetClass, 'macro', 'schema_drift');
      }
    }
    out.push({ input: 'macro', fresh: true, inBounds, varying, crossConsistent, quarantined: !inBounds });
  } else {
    out.push({ input: 'macro', fresh: false, inBounds: true, varying: null, crossConsistent: null, quarantined: false, detail: 'absent_or_warming' });
  }

  // Absence/staleness escalation: an input absent for longer than tolerance
  // (in epochs) is an incident, not just a staleness[] note.
  const tolerance = rail(assetClass, 'staleness_tolerance_epochs');
  for (const reading of out) {
    const t = trackFor(assetClass, reading.input);
    if (!reading.fresh) {
      const sinceLast = t.recent.length > 0 ? epoch - t.recent[t.recent.length - 1].epoch : epoch;
      if (sinceLast >= tolerance && t.recent.length > 0) {
        fireAlert(assetClass, reading.input, 'absent',
          `no fresh reading for ${sinceLast} distinct-observation epochs (tolerance ${tolerance}).`);
      }
    } else {
      closeIncident(assetClass, reading.input, 'absent');
    }
  }

  return out;
}

/** Test-only reset. */
export function _resetAmrInputHealthForTests(): void {
  if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
    throw new Error('[B-5] _resetAmrInputHealthForTests is test-only');
  }
  tracks.clear();
}
