/**
 * P19-B8.4 Part-2 (S21) — Active-path funnel tracker.
 *
 * Durable, (mode, assetClass)-keyed counters for the ACTIVE trading path's funnel, so the Paper/Live
 * Filter Diagnostics tabs can show — once active trading turns ON at B8.5 — the real per-mode funnel:
 * signals generated, the pre-SQE rejections, the SQE per-gate screening, and the RTB-refresh outcomes.
 * Everything here is DORMANT (zero counts) until the active engine runs (§9.1 forward-instrumentation);
 * the display renders "awaiting activation", NEVER a bare 0 (MUST-2 dormant≠zero) — the tri-state is the
 * caller's job (this module just holds counts + a `startedAt` stamp).
 *
 * MIRRORS `server/strategies/guard-eval-tracker.ts` (the proven durable-singleton pattern): a module
 * singleton Map, an ATOMIC tmp+rename checkpoint to the gitignored `logs/` dir every ~60s + reload-on-load,
 * a `keySchema` discard-and-loud-log guard (a key-cardinality change can never silently load orphan
 * buckets), and a `_startedAt` "since" stamp restored across restarts (so a post-deploy zero reads as
 * "nothing has run yet", not "a run rejected everything" — MUST-2 / Langston's B8.1 restart receipt).
 *
 * KEYING (Langston §9.1): every counter keys on BOTH `mode` (paper|live) AND `assetClass`
 * (crypto_spot|xstock_spot). The bug B8.4 fixes is a mode/feed mismatch; the asset axis is non-negotiable.
 *
 * SERIALIZATION: safe because the active + VTS eval pipelines are strictly serial (like guard-eval-tracker
 * / null-reason-tracker). If the active path ever becomes concurrent, make this eval-local.
 *
 * TELEMETRY-ONLY, mode+class-keyed (SIM registry S21). No trade state — a missed/double count can never
 * affect an order; the safety gates are independent of these counters.
 */

import fs from 'fs';
import path from 'path';

export type FunnelMode = 'paper' | 'live';
export type FunnelAssetClass = 'crypto_spot' | 'xstock_spot';

/**
 * Canonical SQE gate ids (Langston Q3 HYBRID). The per-gate tally derives the gate id from the SQE's
 * `failures[]` reason first-token (delimiter contract: up to whitespace or ':') — so a NEW gate auto-appears
 * — but is validated against this canonical set. A known token keys stably (rename-safe: a reworded reason
 * that changes the first token lands in `uncategorized` + loud-logs, surfacing it for deliberate promotion
 * rather than silently minting a drift bucket). Keep in sync with `signal_quality_evaluator.ts` gate order.
 */
export const SQE_CANONICAL_GATES = [
  'unclassifiable_asset_class',
  'xstock_weekend_closure',
  'asset_class_disabled',
  'FinalScore',
  'RegimeWeight',
  'ROI',
  'Confidence',
  'AMR',
  'Governance',
] as const;
export type SqeGateId = (typeof SQE_CANONICAL_GATES)[number] | 'uncategorized';
const _CANON = new Set<string>(SQE_CANONICAL_GATES);

/** Pre-SQE rejection reasons (the 5 orchestrator sites + family IMF). Kept as a string map (not an enum) so
 *  a caller-side addition surfaces as a new row rather than a compile break; the writers pass these tokens. */
export type PreSqeReason =
  | 'unmappable_symbol'
  | 'strategy_gate'
  | 'sizing_zero'
  | 'position_cap'
  | 'reachability'
  | 'family_imf';

export interface RtbRefreshCounters {
  cyclesRun: number;            // refresh micro-cycles that ran
  refreshedAttempted: number;   // signals that entered a refresh re-eval
  reconfirmed: number;          // survived re-SQE (stayed queued)
  rejectedInRefresh: number;    // failed re-SQE (dropped from queue)
  promoted: number;             // promoted out of the queue to an open attempt
}

/** The honest SQE double-count (Langston MUST-4): the SAME signal is SQE'd at generation AND again during
 *  each RTB refresh — these are TWO distinct labelled numbers, never a silent sum. Surfaced via the
 *  per-signal `_sqeAttemptCount` on the writer side; here we tally the two phases separately. */
export interface SqeAttemptCounters {
  atGeneration: number;
  atRefresh: number;
}

export interface ActiveFunnelRecord {
  signalsGenerated: number;
  /** by-reason pre-SQE rejects (the diagnostic headline). */
  preSqeRejects: Record<string, number>;
  /** by-(strategy → reason) pre-SQE rejects — the strategy dimension lives HERE, not on the SQE gates
   *  (Langston Q4: per-strategy-per-gate ≈648 buckets; SQE gates are strategy-agnostic). */
  preSqeRejectsByStrategy: Record<string, Record<string, number>>;
  /** per-SQE-gate reject tally (canonical gate id → count) + the `uncategorized` discovery bucket. */
  sqeGateRejects: Record<string, number>;
  /** SQE outcomes (the denominator so a gate's share is honest). */
  sqeEvaluated: number;
  sqePassed: number;
  rtbRefresh: RtbRefreshCounters;
  sqeAttempts: SqeAttemptCounters;
}

const _stats = new Map<string, ActiveFunnelRecord>();

function _blank(): ActiveFunnelRecord {
  return {
    signalsGenerated: 0,
    preSqeRejects: {},
    preSqeRejectsByStrategy: {},
    sqeGateRejects: {},
    sqeEvaluated: 0,
    sqePassed: 0,
    rtbRefresh: { cyclesRun: 0, refreshedAttempted: 0, reconfirmed: 0, rejectedInRefresh: 0, promoted: 0 },
    sqeAttempts: { atGeneration: 0, atRefresh: 0 },
  };
}

// `::` joins mode + assetClass into the composite key; `_parseKey` inverts it for the reload orphan-key
// guard — the ONLY place a stored key is read back. Each reloaded key is validated against the known enums
// so a stale/renamed checkpoint bucket is DISCARDED, not silently loaded (Langston Step-4: harden the
// keySchema guard against orphan/renamed keys — the exact failure class it exists for).
const _KNOWN_MODES = new Set<string>(['paper', 'live']);
const _KNOWN_CLASSES = new Set<string>(['crypto_spot', 'xstock_spot']);
function _key(mode: string, assetClass: string): string { return `${mode}::${assetClass}`; }
function _parseKey(key: string): { mode: string; assetClass: string } {
  const i = key.lastIndexOf('::');
  return i < 0 ? { mode: key, assetClass: '' } : { mode: key.slice(0, i), assetClass: key.slice(i + 2) };
}
function _isKnownKey(key: string): boolean {
  const { mode, assetClass } = _parseKey(key);
  return _KNOWN_MODES.has(mode) && _KNOWN_CLASSES.has(assetClass);
}

function _get(mode: FunnelMode, assetClass: FunnelAssetClass): ActiveFunnelRecord {
  if (_startedAt === null) _startedAt = new Date().toISOString();
  const key = _key(mode, assetClass);
  let r = _stats.get(key);
  if (!r) { r = _blank(); _stats.set(key, r); }
  return r;
}

// ── PERSISTENCE (mirror guard-eval-tracker OBJ-A/FLAG-1) ─────────────────────────────────────────────
const _CKPT_PATH = path.join(process.cwd(), 'logs', 'active-funnel-checkpoint.json');
// Bump on ANY key-format OR record-shape change (a stale-shape reload would seed malformed buckets).
// Exported so the reload test asserts against the SAME string the module writes/checks (no drift).
export const ACTIVE_FUNNEL_KEY_SCHEMA = 'mode::assetClass/funnel-v1';
let _startedAt: string | null = null;

/** Reload the on-disk checkpoint into memory. Runs once at module load (and from the reload test). Guards:
 *  keySchema-mismatch → discard the whole file + loud-log (fresh window); per-bucket orphan-key check
 *  (mode/assetClass not in the known enums) → discard that bucket + loud-log; ENOENT (no checkpoint yet) is
 *  quiet; any OTHER read/parse error is a possible window-WIPE, logged loudly (MUST-3). */
export function reloadCheckpointFromDisk(): void {
  try {
    const d = JSON.parse(fs.readFileSync(_CKPT_PATH, 'utf-8'));
    if (!d || d.keySchema !== ACTIVE_FUNNEL_KEY_SCHEMA) {
      console.error(`[active-funnel-tracker] checkpoint keySchema mismatch (got ${d?.keySchema ?? 'UNVERSIONED'}, expected ${ACTIVE_FUNNEL_KEY_SCHEMA}) — DISCARDING; fresh window.`);
      return;
    }
    if (typeof d.startedAt === 'string') _startedAt = d.startedAt;
    if (d.stats && typeof d.stats === 'object') {
      for (const [k, v] of Object.entries(d.stats as Record<string, Partial<ActiveFunnelRecord>>)) {
        // Orphan-key guard: discard a bucket whose mode/assetClass isn't in the known enums (stale/renamed).
        if (!_isKnownKey(k)) {
          console.error(`[active-funnel-tracker] checkpoint orphan/unknown key "${k}" (mode/assetClass not in known enums) — DISCARDING that bucket.`);
          continue;
        }
        // Merge over a fresh blank so a checkpoint written under an older-but-same-schema minor is filled out.
        const b = _blank();
        _stats.set(k, {
          ...b, ...v,
          preSqeRejects: { ...(v.preSqeRejects ?? {}) },
          preSqeRejectsByStrategy: { ...(v.preSqeRejectsByStrategy ?? {}) },
          sqeGateRejects: { ...(v.sqeGateRejects ?? {}) },
          rtbRefresh: { ...b.rtbRefresh, ...(v.rtbRefresh ?? {}) },
          sqeAttempts: { ...b.sqeAttempts, ...(v.sqeAttempts ?? {}) },
        });
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('[active-funnel-tracker] checkpoint reload FAILED (non-ENOENT — possible window WIPE):', err);
    }
  }
}
reloadCheckpointFromDisk(); // run once at module load

function _writeCheckpoint(): void {
  try {
    fs.mkdirSync(path.dirname(_CKPT_PATH), { recursive: true });
    const tmp = _CKPT_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ keySchema: ACTIVE_FUNNEL_KEY_SCHEMA, startedAt: _startedAt, savedAt: new Date().toISOString(), stats: Object.fromEntries(_stats) }));
    fs.renameSync(tmp, _CKPT_PATH);
  } catch { /* best-effort: a missed checkpoint loses < one cadence of counts */ }
}
const _ckptTimer = setInterval(_writeCheckpoint, 60_000);
if (typeof _ckptTimer.unref === 'function') _ckptTimer.unref();

/** The instant the CURRENT counters began (restored across restarts). The UI stamps "since HH:MM" from this
 *  so a post-deploy zero is never misread as "the pipeline rejected everything" (MUST-2). */
export function getActiveFunnelStartedAt(): string | null { return _startedAt; }

// ── WRITERS (O(1), no I/O — the checkpoint timer is the only I/O) ────────────────────────────────────

/** Count N signals generated this cycle for (mode, assetClass). */
export function recordActiveSignalsGenerated(mode: FunnelMode, assetClass: FunnelAssetClass, n: number): void {
  if (n <= 0) return;
  _get(mode, assetClass).signalsGenerated += n;
}

/** Count one pre-SQE rejection (before the signal reaches the SQE) by reason + optional strategy. */
export function recordActivePreSqeReject(mode: FunnelMode, assetClass: FunnelAssetClass, reason: PreSqeReason | string, strategy?: string): void {
  const r = _get(mode, assetClass);
  r.preSqeRejects[reason] = (r.preSqeRejects[reason] ?? 0) + 1;
  if (strategy) {
    (r.preSqeRejectsByStrategy[strategy] ??= {})[reason] = (r.preSqeRejectsByStrategy[strategy]?.[reason] ?? 0) + 1;
  }
}

let _lastUncatWarnMs = 0;
/** Extract the canonical SQE gate id from a `failures[]` reason (delimiter contract: first token up to
 *  whitespace or ':'), validated against the canonical set (Langston Q3 hybrid). An unknown token → the
 *  `uncategorized` bucket + a throttled loud-log, so a genuinely-new/reworded gate is surfaced for deliberate
 *  promotion into SQE_CANONICAL_GATES rather than silently minting a drift bucket. */
export function extractSqeGateId(reason: string): SqeGateId {
  const token = (reason ?? '').split(/[\s:]/)[0] ?? '';
  if (_CANON.has(token)) return token as SqeGateId;
  const now = Date.now();
  if (now - _lastUncatWarnMs > 30_000) {
    _lastUncatWarnMs = now;
    console.warn(`[active-funnel-tracker] SQE reason token "${token}" not in SQE_CANONICAL_GATES — bucketed 'uncategorized'. If it is a real new gate, add it to the canonical set. (reason: ${String(reason).slice(0, 80)})`);
  }
  return 'uncategorized';
}

/** Record one SQE evaluation on the active path. `passed` = the SQE verdict; `failures` = the SQE's reason
 *  strings (only read when !passed). Every failing gate in the list is tallied (a signal can fail multiple).
 *  Keyed (mode, assetClass) — NOT per-strategy (SQE gates are strategy-agnostic; strategy lives in the
 *  pre-SQE breakdown). `phase` distinguishes SQE-at-generation from SQE-during-RTB-refresh (MUST-4 honest
 *  double-count — two labelled numbers, never summed). */
export function recordActiveSqeEvaluation(
  mode: FunnelMode,
  assetClass: FunnelAssetClass,
  passed: boolean,
  failures: string[] | undefined,
  phase: 'generation' | 'refresh',
): void {
  const r = _get(mode, assetClass);
  r.sqeEvaluated++;
  if (passed) r.sqePassed++;
  if (phase === 'generation') r.sqeAttempts.atGeneration++;
  else r.sqeAttempts.atRefresh++;
  if (!passed && failures && failures.length) {
    for (const f of failures) {
      const gate = extractSqeGateId(f);
      r.sqeGateRejects[gate] = (r.sqeGateRejects[gate] ?? 0) + 1;
    }
  }
}

/** Record RTB-refresh outcomes for (mode, assetClass). Partial — pass only the counters that changed; each
 *  is added. Single home for refreshed/reconfirmed/rejected/promoted (Langston §9.5 — one writer per event,
 *  never "add promoted to metrics too"). */
export function recordActiveRtbRefresh(mode: FunnelMode, assetClass: FunnelAssetClass, delta: Partial<RtbRefreshCounters>): void {
  const r = _get(mode, assetClass).rtbRefresh;
  if (delta.cyclesRun) r.cyclesRun += delta.cyclesRun;
  if (delta.refreshedAttempted) r.refreshedAttempted += delta.refreshedAttempted;
  if (delta.reconfirmed) r.reconfirmed += delta.reconfirmed;
  if (delta.rejectedInRefresh) r.rejectedInRefresh += delta.rejectedInRefresh;
  if (delta.promoted) r.promoted += delta.promoted;
}

// ── READERS ──────────────────────────────────────────────────────────────────────────────────────────

/** The funnel record for one (mode, assetClass) — a deep copy so callers can't mutate the singleton. Returns
 *  a fresh blank (all zeros) for a never-touched key: a zero here is real-but-dormant, and the endpoint/UI
 *  render it as "awaiting activation" using `startedAt` (MUST-2 dormant≠zero). */
export function getActiveFunnelStats(mode: FunnelMode, assetClass: FunnelAssetClass): ActiveFunnelRecord {
  const r = _stats.get(_key(mode, assetClass)) ?? _blank();
  return {
    ...r,
    preSqeRejects: { ...r.preSqeRejects },
    preSqeRejectsByStrategy: Object.fromEntries(Object.entries(r.preSqeRejectsByStrategy).map(([s, m]) => [s, { ...m }])),
    sqeGateRejects: { ...r.sqeGateRejects },
    rtbRefresh: { ...r.rtbRefresh },
    sqeAttempts: { ...r.sqeAttempts },
  };
}

/** Whether ANY count has been recorded for (mode, assetClass) — the dormant-vs-active discriminator the
 *  endpoint uses to pick the tri-state `{status:'dormant'|'active'}`. */
export function hasActiveFunnelActivity(mode: FunnelMode, assetClass: FunnelAssetClass): boolean {
  const r = _stats.get(_key(mode, assetClass));
  if (!r) return false;
  return r.signalsGenerated > 0 || r.sqeEvaluated > 0 || r.rtbRefresh.cyclesRun > 0
    || Object.keys(r.preSqeRejects).length > 0;
}

/** Test-only: wipe all counters + the checkpoint. NOT called on any production path. */
export function resetActiveFunnelStats(): void {
  _stats.clear();
  _startedAt = null;
  try { fs.unlinkSync(_CKPT_PATH); } catch { /* nothing to remove */ }
}

/** Test-only: write a raw object as the checkpoint file, so the reload test controls the exact on-disk
 *  content (valid restore, keySchema mismatch, orphan key). NOT called on any production path. */
export function _writeRawCheckpointForTest(obj: unknown): void {
  fs.mkdirSync(path.dirname(_CKPT_PATH), { recursive: true });
  fs.writeFileSync(_CKPT_PATH, JSON.stringify(obj));
}
