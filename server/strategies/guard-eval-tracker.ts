/**
 * reorg-B2.1 OBJ-4 — Guard-eval suppression tracker (instrumentation PRECURSOR for #372 + #371).
 *
 * In-memory PER-STRATEGY counters for every `applyGlobalGuards` evaluation — pass AND fail — so we can
 * measure (a) how much each strategy is suppressed by the per-class `minRR` (#372, the calibration
 * precursor — "at 2.5 we discard X% of what strong_bull_trend generates") and (b) the reachability
 * ATR-source divergence rate (#371). COUNTERS, NOT per-eval log lines: emitting a log on every guard
 * call would flood the hot path (Langston Step-4 note) — instrumentation must not cost Net Expectancy.
 * Both pass and fail are counted so the suppression/divergence rates have an intact denominator.
 *
 * SERIALIZATION: safe because the active + VTS evaluation pipelines are strictly serial (like
 * `null-reason-tracker.ts`). If guard evaluation ever becomes concurrent, make this eval-local.
 */

import fs from 'fs';
import path from 'path';
import type { GuardDropReason } from './strategy-helpers.js'; // the guard owns the reason taxonomy (type-only, no runtime coupling)
import type { AssetClass } from '@shared/asset-classes'; // reorg-B2.2 OBJ-B: per-class composite key (type-only)

export interface GuardEvalRecord {
  evals: number;        // total guard evaluations (the denominator for rrSuppressionRate)
  passes: number;
  atrDrops: number;     // dropped by invalid ATR (effectiveATR null) — short-circuits BEFORE the RR check
  stopDrops: number;    // dropped by stop-distance — short-circuits BEFORE the RR check
  rrDrops: number;      // dropped by RR < per-class minRR  (the #372 suppression signal)
  reachDrops: number;   // dropped by reachability > per-class reachAtrMax (reached the RR check first)
  rrEvals: number;      // evals that REACHED the RR check (pass + rr_below_min + unreachable) — meanRR denominator
  rrSum: number;        // Σ rr over rrEvals → mean RR (excludes atr/stop short-circuits so it isn't skewed)
  rrMin: number;
  rrMax: number;
}

// reorg-B2.2 OBJ-B: keyed by the COMPOSITE `${strategy}::${assetClass}` (was strategy-only in reorg-B2.1).
// The per-class split is what lets the two VTS Filter-Diagnostics tabs (crypto / xStock) each show ONLY
// their class's reward-vs-risk / reachability drops (Kyle's no-hidden-gates, per class). The strategy-level
// #372 aggregate is preserved by SUMMING across classes on read (getGuardEvalStats) — never lost.
const _stats = new Map<string, GuardEvalRecord>();

function _blank(): GuardEvalRecord {
  return { evals: 0, passes: 0, atrDrops: 0, stopDrops: 0, rrDrops: 0, reachDrops: 0, rrEvals: 0, rrSum: 0, rrMin: Infinity, rrMax: -Infinity };
}

// Composite-key helpers. `::` separates strategy from assetClass; strategy keys are simple snake_case and
// asset-class values are crypto_spot / xstock_spot, so a lastIndexOf split is unambiguous and future-safe.
function _key(strategy: string, assetClass: string): string { return `${strategy}::${assetClass}`; }
function _parseKey(key: string): { strategy: string; assetClass: string } {
  const i = key.lastIndexOf('::');
  return i < 0 ? { strategy: key, assetClass: 'unknown' } : { strategy: key.slice(0, i), assetClass: key.slice(i + 2) };
}

/** A read-snapshot record: the raw counters plus the two derived ratios. */
type DerivedRecord = GuardEvalRecord & { meanRR: number; rrSuppressionRate: number };

/** Derive the two ratios from RAW fields — the ONE place the #372 numbers are computed, so any caller
 *  (aggregate, per-class, per-(strategy,assetClass)) is byte-consistent. meanRR over rrEvals (RR-reached
 *  only — unskewed); rrSuppressionRate over TOTAL evals (Langston: "how much does minRR suppress total
 *  output", denominator = all generated signals). NEVER average pre-derived ratios (FLAG-2). */
function _derive(r: GuardEvalRecord): DerivedRecord {
  return { ...r, meanRR: r.rrEvals > 0 ? r.rrSum / r.rrEvals : 0, rrSuppressionRate: r.evals > 0 ? r.rrDrops / r.evals : 0 };
}

/** Sum the RAW counters of `from` into `into` (min/max via Math.min/max). Used to fold per-class buckets
 *  back to the strategy-level #372 aggregate WITHOUT ever touching a derived ratio (FLAG-2). */
function _accumulate(into: GuardEvalRecord, from: GuardEvalRecord): void {
  into.evals += from.evals; into.passes += from.passes; into.atrDrops += from.atrDrops;
  into.stopDrops += from.stopDrops; into.rrDrops += from.rrDrops; into.reachDrops += from.reachDrops;
  into.rrEvals += from.rrEvals; into.rrSum += from.rrSum;
  into.rrMin = Math.min(into.rrMin, from.rrMin); into.rrMax = Math.max(into.rrMax, from.rrMax);
}

// ── reorg-B2.2 OBJ-A: PERSISTENCE ──────────────────────────────────────────────────────────────────
// The tracker must SURVIVE restarts (Kyle 2026-06-21: a restart should PAUSE+RESUME the suppression
// window, not reset it) and be crash/OOM/reboot-proof (Langston's robustness flag). Checkpoint to a JSON
// file in the gitignored logs/ dir — that path survives a git-pull deploy, a process restart, AND a host
// reboot (the disk persists) — every ~60s, plus reload-on-module-load. On reload the saved counts are
// RESTORED so the ≥48h window continues, and `_startedAt` is restored so it reflects the ORIGINAL window
// start (the #373 wipe-detection stamp — a restart no longer looks like a fresh window).
const _CKPT_PATH = path.join(process.cwd(), 'logs', 'guard-eval-checkpoint.json');
let _startedAt: string | null = null;

// reorg-B2.2 OBJ-B (FLAG-1): the checkpoint carries the KEY SCHEMA it was written under. When the key
// format changes (here: strategy-only → `strategy::assetClass`), an old checkpoint's buckets have the WRONG
// cardinality — loading them would create orphan/phantom buckets that silently corrupt the #372 aggregate
// (the exact failure #373 guards). So reload DISCARDS-and-loud-logs on ANY mismatch, INCLUDING an
// unversioned legacy checkpoint (reorg-B2.1/OBJ-A wrote no keySchema field) — "no field" is treated as a
// mismatch, never as "matches because there's nothing to compare". Bump this string on any future key change.
const _KEY_SCHEMA = 'strategy::assetClass/v1';

(function _reloadCheckpoint(): void {
  try {
    const d = JSON.parse(fs.readFileSync(_CKPT_PATH, 'utf-8'));
    // FLAG-1 key-schema guard — discard-and-loud-log on mismatch (incl. unversioned legacy = mismatch).
    // We do NOT restore _startedAt either: a stale-cardinality checkpoint can't seed an honest window start,
    // so this is a clean fresh window (harmless at the A+B bundle deploy — no in-flight window state to lose).
    if (!d || d.keySchema !== _KEY_SCHEMA) {
      console.error(`[guard-eval-tracker] checkpoint keySchema mismatch (got ${d?.keySchema ?? 'UNVERSIONED'}, expected ${_KEY_SCHEMA}) — DISCARDING stale-cardinality checkpoint; starting a fresh window.`);
      return;
    }
    if (d && typeof d.startedAt === 'string') _startedAt = d.startedAt;
    if (d && d.stats && typeof d.stats === 'object') {
      for (const [k, v] of Object.entries(d.stats as Record<string, GuardEvalRecord>)) {
        const r: GuardEvalRecord = { ..._blank(), ...v };
        // Infinity does NOT survive JSON (serializes to null) — restore the min/max sentinels.
        r.rrMin = Number.isFinite(r.rrMin) ? r.rrMin : Infinity;
        r.rrMax = Number.isFinite(r.rrMax) ? r.rrMax : -Infinity;
        _stats.set(k, r);
      }
    }
  } catch (err) {
    // FINDING-2 (Langston Step-4): ENOENT = no checkpoint yet (fresh window) — expected, swallow silently.
    // ANY OTHER error means a file that EXISTS but won't parse (a torn write / corruption) — that is a real
    // wipe event the #373 stamp exists to surface, so LOG IT LOUDLY: a silent start-clean would re-stamp a
    // false-fresh window invisibly (the exact failure #373 guards against — a silent swallow isn't airtight).
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('[guard-eval-tracker] checkpoint reload FAILED (non-ENOENT — possible window WIPE):', err);
    }
  }
})();

function _writeCheckpoint(): void {
  try {
    fs.mkdirSync(path.dirname(_CKPT_PATH), { recursive: true });
    // FINDING-1 (Langston Step-4): ATOMIC write — serialize to a tmp sibling then rename. rename() on the
    // same filesystem is atomic, so a reader (reload-on-boot) ALWAYS sees the whole old-or-new file, never a
    // torn partial from a reboot/OOM mid-write (which would throw in JSON.parse and silently wipe the window
    // — the literal reboot-proof scenario this checkpoint claims to protect). Same dir = same fs = atomic.
    const tmp = _CKPT_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ keySchema: _KEY_SCHEMA, startedAt: _startedAt, savedAt: new Date().toISOString(), stats: Object.fromEntries(_stats) }));
    fs.renameSync(tmp, _CKPT_PATH);
  } catch { /* best-effort: a missed checkpoint loses < one cadence of evals; the RATE is unaffected */ }
}
// Periodic checkpoint off the hot path; unref so it never keeps the process alive (or hangs tests).
const _ckptTimer = setInterval(_writeCheckpoint, 60_000);
if (typeof _ckptTimer.unref === 'function') _ckptTimer.unref();

/** The timestamp recording first started for the CURRENT counters (restored across restarts via the
 *  checkpoint). The #373 wipe-detection stamp: if this is recent but the window should be old, a wipe
 *  happened. */
export function getGuardEvalStartedAt(): string | null { return _startedAt; }

/** Record one guard evaluation for a strategy. `rr` is the computed reward-to-risk (for the suppression
 *  distribution); `pass` + `dropReason` capture the verdict. Cheap O(1), no I/O. */
export function recordGuardEval(strategy: string, rr: number, pass: boolean, dropReason: GuardDropReason, assetClass: AssetClass): void {
  if (_startedAt === null) _startedAt = new Date().toISOString(); // window start (restored across restarts)
  const key = _key(strategy, assetClass); // reorg-B2.2 OBJ-B: per-class composite bucket
  let r = _stats.get(key);
  if (!r) { r = _blank(); _stats.set(key, r); }
  r.evals++;
  // RR distribution is meaningful ONLY for evals that REACHED the RR check — the atr-null + stop-distance
  // guards short-circuit BEFORE it (their `rr` never gates anything), so including their rr would skew
  // meanRR up/down (Langston Step-4 #3). pass / rr_below_min / unreachable all computed-and-used the rr.
  const reachedRR = pass || dropReason === 'rr_below_min' || dropReason === 'unreachable';
  if (reachedRR && Number.isFinite(rr)) {
    r.rrEvals++;
    r.rrSum += rr;
    if (rr < r.rrMin) r.rrMin = rr;
    if (rr > r.rrMax) r.rrMax = rr;
  }
  if (pass) { r.passes++; return; }
  if (dropReason === 'invalid_atr') r.atrDrops++;
  else if (dropReason === 'stop_distance') r.stopDrops++;
  else if (dropReason === 'rr_below_min') r.rrDrops++;
  else if (dropReason === 'unreachable') r.reachDrops++;
}

/** Snapshot the STRATEGY-LEVEL aggregate (the #372 calibration surface) — SUMS the per-class buckets back
 *  to one record per strategy and re-derives the ratios from the summed raw fields (FLAG-2). With the
 *  reorg-B2.2 re-key this is byte-identical to the pre-re-key per-strategy read (one class → sum is a no-op;
 *  two classes → the honest combined suppression). The shape is unchanged, so the existing #372 consumer is
 *  untouched. */
export function getGuardEvalStats(): Record<string, DerivedRecord> {
  const agg = new Map<string, GuardEvalRecord>();
  for (const [k, r] of _stats.entries()) {
    const { strategy } = _parseKey(k);
    let a = agg.get(strategy);
    if (!a) { a = _blank(); agg.set(strategy, a); }
    _accumulate(a, r);
  }
  const out: Record<string, DerivedRecord> = {};
  for (const [strategy, a] of agg.entries()) out[strategy] = _derive(a);
  return out;
}

/** reorg-B2.2 OBJ-B: the per-strategy stats for ONE asset class (feeds that class's VTS Filter-Diagnostics
 *  tab — the crypto tab passes `crypto_spot`, the xStock tab `xstock_spot`). Returns ONLY strategies that
 *  recorded ≥1 guard eval on this class (an absent strategy = "no evaluations", rendered distinctly — never
 *  a misleading 0% — FLAG-3). */
export function getGuardEvalStatsByClass(assetClass: string): Record<string, DerivedRecord> {
  const out: Record<string, DerivedRecord> = {};
  for (const [k, r] of _stats.entries()) {
    const p = _parseKey(k);
    if (p.assetClass !== assetClass) continue;
    out[p.strategy] = _derive(r);
  }
  return out;
}

/** reorg-B2.2 OBJ-B: the full per-(assetClass → strategy) breakdown — the additive `statsByClass` field on
 *  the raw `/api/diagnostics/guard-eval-stats` endpoint (schema bumped v2→v3, backward-compatible; the
 *  strategy-level `stats` aggregate above is unchanged). */
export function getGuardEvalStatsPerClass(): Record<string, Record<string, DerivedRecord>> {
  const out: Record<string, Record<string, DerivedRecord>> = {};
  for (const [k, r] of _stats.entries()) {
    const { strategy, assetClass } = _parseKey(k);
    (out[assetClass] ??= {})[strategy] = _derive(r);
  }
  return out;
}

export function resetGuardEvalStats(): void {
  _stats.clear();
  _startedAt = null;
  try { fs.unlinkSync(_CKPT_PATH); } catch { /* no checkpoint to remove */ }
}
