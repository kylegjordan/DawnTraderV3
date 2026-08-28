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
/**
 * ★ WHICH ASSET CLASSES CAN POPULATE `strategyNullReasons` — the honest coverage boundary (#675).
 *
 * CRYPTO ONLY, and this is a statement about WIRING, not about market activity. The 18
 * `recordActiveStrategyNull` call sites all sit in `signal-orchestrator.ts:2279-2743`, inside a
 * function whose SizingContext is stamped `crypto_spot` BY CONSTRUCTION (`:1801-1809` — *"this is
 * the CRYPTO pipe — evaluateMarket iterates the FX5 crypto survivor pool"*). xStock's active path is
 * a separate module (`asset_classes/xstock_spot/eval-cycle.ts` → `dispatchXstockActiveSignal`) with
 * ZERO instrumented sites — presence-evidenced by whole-tree census, not single-file grep.
 *
 * ⛔ WITHOUT THIS SET the envelope emits `{}` for xStock, which the contract defines as
 * "wired, nothing declined" — asserting an OBSERVED ZERO for a path nothing observes. That is the
 * absent-wearing-a-valid-value's-clothes failure reproduced INSIDE the field added to remove it.
 *
 * ⚠️ HOW THIS WAS FOUND, because the near-miss is the lesson: the empty table was first explained as
 * a cadence effect (xStock evaluates far less often), an account that was coherent, matched a real
 * mechanism, and was WRONG — it rested on counting signals that SURVIVED detection to argue about
 * signals that DECLINED, two complementary populations. Only the code read settled it.
 *
 * ★ DELETE THIS SET ENTIRELY when B-FILTER-DIAG-XSTOCK instruments the xStock module — do not add
 * the class to it and leave the machinery, or the next reader inherits a boundary with no boundary.
 */
export const STRATEGY_NULL_INSTRUMENTED_CLASSES: ReadonlySet<string> = new Set(['crypto_spot']);

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
  // B-FILTER-DIAG-PAPER OBJ-2 (2026-08-07): the promotion this discovery bucket was
  // designed for. MEASURED before promoting: 7,648 of 7,649 active-path sqe-stage
  // gate_decision reason tokens (24h, signal_eval_archive, source=signal-orchestrator)
  // are "NetEV" — 99.99% of `uncategorized` was the net-expectancy admission gate
  // (ACTIVE_PATH_FLOW.md §RTB; consistent with #570). Cumulative counters mean
  // PRE-promotion NetEV rejects stay in `uncategorized` forever — the client labels
  // both windows honestly rather than reattributing history.
  'NetEV',
] as const;
export type SqeGateId = (typeof SQE_CANONICAL_GATES)[number] | 'uncategorized';
const _CANON = new Set<string>(SQE_CANONICAL_GATES);

/** Pre-SQE rejection reasons — the orchestrator sites that drop a BUILT signal BEFORE it reaches the SQE, so
 *  they are a true subset of `signalsGenerated` (each fires after the denominator increment at the top of
 *  buildSizedSignalForStrategy). Kept as a string map (not an enum) so a caller-side addition surfaces as a
 *  new row rather than a compile break. NOTE: family-filter strategy drops are NOT here — they happen in
 *  evaluateSymbol BEFORE any signal is built (upstream of the denominator), so they live in the separate
 *  `strategyAttrition` bucket (Langston B8.4b: mixing them into preSqeRejects would let it exceed
 *  signalsGenerated and read as a broken funnel). position_cap / target-gate reasons are POST-SQE → they go
 *  through `recordActivePostSqeReject`, not here. */
export type PreSqeReason =
  | 'unmappable_symbol'
  | 'strategy_gate'
  | 'sizing_zero';

export interface RtbRefreshCounters {
  cyclesRun: number;            // refresh micro-cycles that ran
  refreshedAttempted: number;   // signals that entered a refresh re-eval
  reconfirmed: number;          // survived re-SQE (stayed queued)
  rejectedInRefresh: number;    // failed re-SQE (dropped from queue)
  promoted: number;             // promoted out of the queue to an open attempt
  // ── B-RTB-REFRESH-CONSOLIDATE OBJ-4 (2026-07-19, CORRECTED after Langston CHANGES-NEEDED).
  //
  // CC-A's first cut conflated TWO different denominators: queue-LIFECYCLE exits (every way a
  // row can leave rtb_signals — the §9.5(a) census's eight deleters) and refresh-PASS outcomes
  // (what happens to a signal that entered THIS pass's re-evaluation). They are not the same
  // set, and summing them produced an identity that could never hold:
  //   • `promoted` fires in active-execution-engine.ts:2223 — a DIFFERENT service, not a pass outcome.
  //   • the unclassifiable drop RETURNS BEFORE `refreshedAttempted` increments — it never enters.
  //   • expiry lives in cleanupExpiredSignals, outside refreshAndRank entirely.
  // Only ONE new bucket is a genuine refresh-pass outcome. The others were removed rather than
  // wired, because wiring them would have made the identity wrong in a way that still "passed".
  droppedError: number;          // exception mid-pass → row bulk-deleted. This one IS in the
                                 // denominator: the catch wraps the per-signal body, so the row
                                 // already ticked refreshedAttempted. #419 exactly — the catch
                                 // ticked neither outcome, so under errors attempted exceeded
                                 // reconfirmed + rejectedInRefresh and the sub-stage never balanced.
}

/** OBJ-4 — the refresh-PASS balance identity (deliberately narrow):
 *    refreshedAttempted === reconfirmed + rejectedInRefresh + droppedError
 *
 *  Scope is every signal that ENTERED a pass, and only exits reachable AFTER the
 *  `refreshedAttempted` increment. Non-zero residual ⇒ a mid-pass exit is still uncounted.
 *
 *  DELIBERATELY EXCLUDED (each leaves the queue, none is a pass outcome — counting them here
 *  would drive the residual negative and mask the very thing it exists to catch):
 *    • promoted — recorded by the execution engine, a separate lifecycle stage.
 *    • unclassifiable-asset-class — returns pre-increment; also unattributable per-class BY
 *      CONSTRUCTION (the branch is defined by that field being unresolvable), so it is alarmed
 *      at DATA_INTEGRITY grade rather than tallied into a bucket it cannot be keyed into.
 *    • expiry / cleanup sweep — outside refreshAndRank.
 *  Whole-lifecycle accounting for those is a separate stage and a separate identity. */
export function rtbRefreshPassResidual(r: RtbRefreshCounters): number {
  return r.refreshedAttempted - (r.reconfirmed + r.rejectedInRefresh + r.droppedError);
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
  /** UPSTREAM strategy attrition (by strategy): strategies excluded by the family filter in evaluateSymbol
   *  BEFORE any signal is built for them — so they are NOT a subset of `signalsGenerated` and must NOT be
   *  mixed into `preSqeRejects` (which would let the pre-SQE funnel stage exceed the denominator and read as
   *  broken — Langston B8.4b). This is its own pre-generation stage; the panel renders it above the signal
   *  funnel, not as a funnel subset. */
  strategyAttrition: Record<string, number>;
  /** F-G-1 — VPG signals that shipped UNROUNDED because we have no DERIVED grid for that xStock
   *  symbol yet. ⛔ THIS IS NOT A REJECT AND MUST NEVER LIVE IN `preSqeRejects`. The signal was
   *  NOT dropped: it continues to the SQE and is counted again at every later stage, so mixing it
   *  into the pre-SQE drop bucket would let that stage exceed `signalsGenerated` and read as a
   *  broken funnel — the SAME defect Langston caught on `strategyAttrition` (B8.4b), reproduced
   *  one bucket over. It is a COVERAGE gauge (how thin is our own xStock archive), not a filter.
   *  Additive field: an old checkpoint without it reloads as {} via the merge-over-blank below,
   *  so no keySchema bump — bumping would DISCARD live funnel history for a purely additive key
   *  (the `sqeGateRejectsAtRefresh` precedent). Shape: reason -> count. */
  gridPassthroughs: Record<string, number>;
  /** POST-SQE, pre-RTB rejects by reason (position_cap + the target-gate reasons) — signals that PASSED the
   *  SQE but were dropped before the RTB queue. Distinct from preSqeRejects because these sites sit AFTER the
   *  SQE call in buildSizedSignalForStrategy — lumping them into preSqeRejects would misstate the funnel
   *  order (Langston anchor-b). Surfaced for no-hidden-gates honesty (Kyle). */
  postSqeRejects: Record<string, number>;
  /** per-SQE-gate reject tally (canonical gate id → count) + the `uncategorized` discovery bucket. */
  sqeGateRejects: Record<string, number>;
  /** B-FILTER-DIAG-PAPER OBJ-3: the REFRESH-phase slice of sqeGateRejects (same gate ids,
   *  incremented only when phase==='refresh') — answers "what fell OUT of the RTB refresh
   *  cycle, at which gate". A subset of sqeGateRejects by construction, never summed with it.
   *  Additive field: an old checkpoint without it reloads as {} (absent-honest, no re-stamp). */
  sqeGateRejectsAtRefresh: Record<string, number>;
  /** B-FILTER-DIAG-STANDARDIZE (Kyle 2026-08-07: "this batch isn't complete until we have all the data we
   *  need feeding into these tracking metrics") — the ACTIVE path's per-strategy NULL taxonomy, the same
   *  shape the VTS produces in `vtsEvaluation.byStrategyNullReasons`.
   *  ★ THE DATA WAS ALREADY BEING COMPUTED AND DISCARDED: strategies set their decline reason via the SHARED
   *  `null-reason-tracker`, and the active orchestrator runs the SAME `strategy-engine` harness that sets it —
   *  the active path simply never READ it. This is that read, tallied.
   *  Shape: strategy -> reason -> count.
   *  ⚠️ OPTIONAL BY DESIGN (#675): `undefined` means NOT INSTRUMENTED FOR THIS ASSET CLASS and is a
   *  DIFFERENT claim from `{}`, which means wired-and-nothing-declined. The reader MUST keep them
   *  apart — collapsing them is the absent-as-valid failure (#546/#568) this field exists to remove.
   *  See `STRATEGY_NULL_INSTRUMENTED_CLASSES` for which classes can populate it, and why. */
  strategyNullReasons?: Record<string, Record<string, number>>;
  /** SQE outcomes (the denominator so a gate's share is honest). */
  sqeEvaluated: number;
  sqePassed: number;
  rtbRefresh: RtbRefreshCounters;
  sqeAttempts: SqeAttemptCounters;
}

const _stats = new Map<string, ActiveFunnelRecord>();

/**
 * F-G-1 — MIGRATE, DO NOT PURGE, THE PRE-FIX PASSTHROUGH KEY.
 *
 * Before this batch the seam booked a passthrough as `grid_unresolved_passthrough` inside
 * `preSqeRejects`. Those counts are still on disk, and the `keySchema` is deliberately NOT bumped
 * (bumping discards ALL live funnel history for a purely additive field). Left alone, the client
 * filter `r.startsWith('grid_')` folds them into the total under a heading reading
 * **"Venue Price Grid (VPG) — rejected"** — so the fix would be live for new counts while the tab
 * kept reporting old passthroughs as rejections, indefinitely. A fresh reader caught it.
 * ⛔ MOVED, NOT DELETED. The signals were real; only the bucket was wrong. Deleting them would
 * make the funnel's history quietly disagree with itself, which is the failure one layer up.
 */
export function migrateLegacyPassthroughKey(v: Partial<ActiveFunnelRecord>): {
  preSqeRejects: Record<string, number>;
  gridPassthroughs: Record<string, number>;
} {
  const rejects = { ...(v.preSqeRejects ?? {}) };
  const through = { ...(v.gridPassthroughs ?? {}) };
  const LEGACY = 'grid_unresolved_passthrough';
  if (rejects[LEGACY] != null) {
    through['unresolved_grid'] = (through['unresolved_grid'] ?? 0) + rejects[LEGACY];
    delete rejects[LEGACY];
    console.warn(
      `[active-funnel-tracker] migrated ${through['unresolved_grid']} legacy "${LEGACY}" counts out of ` +
      `preSqeRejects into gridPassthroughs — they were passthroughs, never rejections (F-G-1).`,
    );
  }
  return { preSqeRejects: rejects, gridPassthroughs: through };
}

function _blank(): ActiveFunnelRecord {
  return {
    signalsGenerated: 0,
    preSqeRejects: {},
    preSqeRejectsByStrategy: {},
    strategyAttrition: {},
    gridPassthroughs: {},
    postSqeRejects: {},
    sqeGateRejects: {},
    sqeGateRejectsAtRefresh: {},
    strategyNullReasons: {},
    sqeEvaluated: 0,
    sqePassed: 0,
    rtbRefresh: { cyclesRun: 0, refreshedAttempted: 0, reconfirmed: 0, rejectedInRefresh: 0, promoted: 0, droppedError: 0 },
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
export const ACTIVE_FUNNEL_KEY_SCHEMA = 'mode::assetClass/funnel-v3';
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
          preSqeRejectsByStrategy: { ...(v.preSqeRejectsByStrategy ?? {}) },
          strategyAttrition: { ...(v.strategyAttrition ?? {}) },
          // supplies BOTH preSqeRejects and gridPassthroughs -- the legacy key moves between them
          ...migrateLegacyPassthroughKey(v),
          postSqeRejects: { ...(v.postSqeRejects ?? {}) },
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
// ⚠️ INVARIANT (Langston B8.4b): every writer does a SYNCHRONOUS Map read-modify-write with NO `await`
// between the read and the write. That is the entire basis of the race-freedom under the active/RTB
// `Promise.all` chunks (Node is single-threaded; interleaving only happens at await points, so each
// increment completes atomically). DO NOT introduce an `await` inside any writer below.

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

/** Count one POST-SQE, pre-RTB rejection by reason. The signal PASSED the SQE and was dropped before the RTB
 *  queue — kept separate from preSqeRejects so the funnel order is honest (these sites sit after the SQE).
 *  Reasons today: `position_cap` (per-underlying cap) and the reorg-B2 target-gate reasons
 *  (`invalid_geometry` / `rr_below_min` / `invalid_atr` / `unreachable`). */
export function recordActivePostSqeReject(mode: FunnelMode, assetClass: FunnelAssetClass, reason: string): void {
  const r = _get(mode, assetClass);
  r.postSqeRejects[reason] = (r.postSqeRejects[reason] ?? 0) + 1;
}

/** Count one UPSTREAM strategy attrition (by strategy): a strategy excluded by the family filter in
 *  evaluateSymbol BEFORE any signal is built for it. Distinct from `preSqeRejects` because it sits upstream
 *  of the `signalsGenerated` denominator — mixing it in would let the pre-SQE stage exceed the denominator
 *  (Langston B8.4b). Its own pre-generation stage. */
/** Record ONE active-path strategy evaluation that produced no setup, with the reason the strategy itself
 *  reported. B-FILTER-DIAG-STANDARDIZE / Kyle 2026-08-07.
 *
 *  ⚠️ SERIALIZATION CONSTRAINT — READ BEFORE CHANGING EITHER SIDE. `getNullReason()` reads a MODULE GLOBAL
 *  in `server/utils/null-reason-tracker.ts`, whose own header states it is safe ONLY while strategy
 *  evaluation is strictly serial. VERIFIED at wiring time: `signal-orchestrator.ts` contains ZERO
 *  `Promise.all` and iterates `for (const strat of activeStrategies)`. **If the active evaluation is ever
 *  parallelised, this read AND the VTS's identical read at `vts-runner.ts:4863` both silently mis-attribute
 *  one strategy's reason to another — the failure is invisible, not loud.**
 *
 *  NON-THROWING BY CONSTRUCTION: this sits in the LIVE signal-generation path. Telemetry must never be able
 *  to break trading, so every failure is swallowed and logged rather than propagated. */
export function recordActiveStrategyNull(
  mode: FunnelMode,
  assetClass: FunnelAssetClass,
  strategy: string,
  reason: string,
): void {
  try {
    const r = _get(mode, assetClass);
    r.strategyNullReasons ??= {};
    const byReason = (r.strategyNullReasons[strategy] ??= {});
    // 'unknown' is the tracker's own reset value — keep it as a DISTINCT bucket rather than dropping it or
    // folding it into a neighbour: a strategy declining without setting a reason is itself a finding.
    const key = reason && reason.trim() ? reason : 'unknown';
    byReason[key] = (byReason[key] ?? 0) + 1;
  } catch {
    /* telemetry must never throw into the trading path */
  }
}

/**
 * F-G-1 — count one VPG PASSTHROUGH: a signal that shipped with UNROUNDED prices because no
 * DERIVED grid exists for that xStock symbol yet.
 *
 * ⛔ DELIBERATELY NOT `recordActivePreSqeReject`, and that was the defect a fresh reader caught.
 * `preSqeRejects` is defined as the sites that DROP a built signal before the SQE, "so they are a
 * true subset of signalsGenerated". A passthrough drops nothing — it is counted here AND flows on
 * to be counted at the SQE, so it would have inflated the pre-SQE stage above its own denominator
 * and rendered under a heading that reads "rejected" for signals that were not.
 *
 * ★ WHAT THIS NUMBER MEANS, AND WHAT IT DOES **NOT**: it counts SIGNAL EVALUATIONS that shipped
 * unrounded — once per symbol x strategy x lane x scan cycle. It is NOT a symbol count, and it is
 * NOT the refresher's coverage percentage.
 * ⛔ MY FIRST DOCSTRING CALLED IT "a gauge of how thin our xStock archive is", which is a number
 * this counter structurally CANNOT produce: one permanently-uncovered symbol re-evaluated all day
 * emits an unbounded count, so a large value can mean "a handful of symbols, all day" while
 * reading as "many trades shipped wrong". The refresher's own figure is the per-SYMBOL one
 * (`xstock-grid-refresher.ts`: 476 seen / 436 covered / 40 not). Fresh-reader finding, and the
 * defect was in the DESCRIPTION rather than the code — a name is a claim.
 * ⇒ Read it as "how often did we ship unrounded", never as "how much of the universe is uncovered".
 */
export function recordActiveGridPassthrough(mode: FunnelMode, assetClass: FunnelAssetClass, reason: string): void {
  const r = _get(mode, assetClass);
  r.gridPassthroughs[reason] = (r.gridPassthroughs[reason] ?? 0) + 1;
}

export function recordActiveStrategyAttrition(mode: FunnelMode, assetClass: FunnelAssetClass, strategy: string): void {
  const r = _get(mode, assetClass);
  r.strategyAttrition[strategy] = (r.strategyAttrition[strategy] ?? 0) + 1;
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
      // OBJ-3: the refresh-phase slice — same gate id, only on the refresh path.
      if (phase === 'refresh') {
        r.sqeGateRejectsAtRefresh ??= {};
        r.sqeGateRejectsAtRefresh[gate] = (r.sqeGateRejectsAtRefresh[gate] ?? 0) + 1;
      }
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
  // OBJ-4: the previously-silent exits.
  if (delta.droppedError) r.droppedError += delta.droppedError;
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
    strategyAttrition: { ...r.strategyAttrition },
    // ⚠️ NO `?? {}` HERE, AND THE COMMENT THAT USED TO BE HERE WAS FALSE. It read "reloaded
    // pre-F-G-1 checkpoints lack the field — snapshot as {}", but `_blank()` always carries it and
    // the reload fills it, so the guard was dead and its stated reason never applied. A dead guard
    // with a plausible comment is worse than no guard: it documents a protection that isn't there.
    gridPassthroughs: { ...r.gridPassthroughs },
    postSqeRejects: { ...r.postSqeRejects },
    sqeGateRejects: { ...r.sqeGateRejects },
    // reloaded pre-OBJ-3 checkpoints lack the field — snapshot as {} (absent-honest)
    sqeGateRejectsAtRefresh: { ...(r.sqeGateRejectsAtRefresh ?? {}) },
    // ★ B-FILTER-DIAG-STANDARDIZE / #675: the per-strategy decline taxonomy is instrumented for
    // crypto ONLY, and the envelope must SAY so rather than emit `{}`.
    //
    // WHY the class matters here: the 18 `recordActiveStrategyNull` sites all live in
    // `signal-orchestrator.ts:2279-2743`, inside a function whose SizingContext is stamped
    // `crypto_spot` BY CONSTRUCTION (`:1801-1809` — "this is the CRYPTO pipe"). xStock's active path
    // is a different module entirely (`asset_classes/xstock_spot/eval-cycle.ts` →
    // `dispatchXstockActiveSignal`) and has ZERO instrumented sites — whole-tree census, Langston.
    //
    // ⛔ So for xStock an EMPTY OBJECT WOULD BE A LIE. The envelope's own contract reads
    // absent = "not instrumented", `{}` = "wired, nothing declined" — and `{}` here would assert an
    // observed zero for a path nothing observes. That is the absent-wearing-a-valid-value's-clothes
    // failure (#546/#568) reproduced inside the very field added to remove it.
    //
    // Emitting `undefined` routes the client to its honest not-instrumented card. This line is
    // DELETED — not edited — the moment B-FILTER-DIAG-XSTOCK instruments that module; keeping the
    // reason here means whoever deletes it can see what they are re-enabling.
    strategyNullReasons: STRATEGY_NULL_INSTRUMENTED_CLASSES.has(assetClass)
      ? Object.fromEntries(
          Object.entries(r.strategyNullReasons ?? {}).map(([k, v]) => [k, { ...v }]),
        )
      : undefined,
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
    || Object.keys(r.preSqeRejects).length > 0
    // F-G-1: a passthrough IS activity. Unreachable today only because `signalsGenerated`
    // increments first at the top of the seam — an ordering guaranteed by a comment, not by the
    // type system. Omitting it here meant a bucket holding ONLY passthroughs would render
    // "awaiting activation" and hide the number entirely. Fresh-reader finding.
    || Object.keys(r.gridPassthroughs).length > 0;
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
