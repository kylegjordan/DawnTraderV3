/**
 * B-UNIVERSE-REFRESH-ACTS (#1018, KD-26) — the daily crypto spot universe refresh, acting on the RUNNING recorder.
 *
 * Called once per occurrence by `crypto-universe-refresh-cron.ts` (03:00Z, through the shared occurrence runner).
 * It computes today's universe, compares it with what the recorder is subscribed to right now, and either applies the
 * difference to the live connections (`applyCryptoUniverseChange`) or REFUSES and records why. Every run writes one
 * row to `crypto_universe_refresh_runs`; that table is the whole record — there is no operator path and no file.
 *
 * Gate order (pre-audit §2.2, Langston Step-2 PROCEED on r3 with C1-C3):
 *   0. take the add failures the previous run's adds left behind, and log them at once (they survive a later throw)
 *   1. load the universe
 *   2. arm (a): any fetch incomplete            ⇒ refused `incomplete_fetch`, confirmable=false
 *   3. non-degeneracy: empty, or under half the running count (`assertClassifiedPlausible`, CAUGHT — C1)
 *                                               ⇒ refused `degenerate`, confirmable=false, with THIS job's own message (C2)
 *   4. pins (symbols with an open position, either mode) — a failed read THROWS: an unknown held set is never "none"
 *   5. arm (b): dropped = running − computed − pins; share = dropped / running
 *        within `crypto_spot.universe_refresh_max_drop_share`        ⇒ applied (or noop when nothing changes)
 *        over it, and no confirming baseline                          ⇒ refused `drop_share`, confirmable=true
 *        over it, baseline differs by more than
 *          `crypto_spot.universe_refresh_confirm_max_diff_share`      ⇒ refused `drop_share`, confirmable=true
 *        over it, baseline agrees                                     ⇒ applied_confirmed: a BOUNDED step, lowest volume first
 *   6. apply → write the run row → alerts (rungs on refused / applied_confirmed; resolve them on applied / noop)
 *
 * The baseline is the latest confirmable row, and only when that row is itself part of an over-the-knob episode
 * (`refused` or `applied_confirmed`). An `applied` or `noop` row ends the episode, so the next over-the-knob run starts
 * a new one and must be confirmed afresh. (Judgement call, flagged at Step 4.)
 *
 * Failure semantics: a refusal is a RECORDED outcome, never a throw. A missing knob, a failed pins read, a failed apply,
 * a failed row write or a failed alert write THROWS to the occurrence runner, which marks the occurrence failed.
 * ⚠️ An apply that throws after it has changed some connections leaves those changes in place with no run row; the
 * next run reads the recorder's live set, so it starts from the truth, not from a stale record.
 */

import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { cryptoUniverseRefreshRuns } from '../../shared/schema.js';

const MODULE = 'crypto_spot' as const;
export const MAX_DROP_SHARE_KEY = 'universe_refresh_max_drop_share';
export const CONFIRM_MAX_DIFF_SHARE_KEY = 'universe_refresh_confirm_max_diff_share';
export const RUNG_PREFIX = 'crypto-universe-refresh-rung-';
export const REFRESH_ACTOR = 'crypto-universe-refresh';
const LOG = '[B-UNIVERSE-REFRESH-ACTS][refresh]';

export type RefreshOutcome = 'noop' | 'applied' | 'applied_confirmed' | 'refused';
export type RefusalReason = 'incomplete_fetch' | 'degenerate' | 'drop_share';

export interface RefreshResult {
  outcome: RefreshOutcome;
  refusalReason: RefusalReason | null;
  countBefore: number;
  countAfter: number;
  addedCount: number;
  droppedCount: number;
  consecutiveRefusals: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure decision (arm b and the confirmed bounded step). No I/O — the unit suite drives it directly.
// ─────────────────────────────────────────────────────────────────────────────

export interface RefreshDecisionInput {
  running: readonly string[];
  computed: readonly string[];
  pins: readonly string[];
  volumeUsdBySymbol: Readonly<Record<string, number>>;
  maxDropShare: number;
  confirmMaxDiffShare: number;
  /** The episode baseline's computed list, or null when there is none (see the header). */
  baselineComputed: readonly string[] | null;
}

export interface RefreshDecision {
  outcome: Exclude<RefreshOutcome, never>;
  refusalReason: 'drop_share' | null;
  add: string[];
  drop: string[];
  dropShare: number;
  confirmDiffShare: number | null;
  boundedStep: number | null;
}

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

/** |a Δ b| / |b|. An empty `b` cannot confirm anything, so it reads as an infinite difference. */
export function symmetricDiffShare(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (B.size === 0) return Number.POSITIVE_INFINITY;
  let diff = 0;
  for (const x of A) if (!B.has(x)) diff++;
  for (const x of B) if (!A.has(x)) diff++;
  return diff / B.size;
}

export function decideRefresh(input: RefreshDecisionInput): RefreshDecision {
  const running = new Set(input.running);
  const computed = new Set(input.computed);
  const pins = new Set(input.pins);

  const add = sorted([...computed].filter(s => !running.has(s)));
  const dropped = sorted([...running].filter(s => !computed.has(s) && !pins.has(s)));
  const dropShare = running.size === 0 ? 0 : dropped.length / running.size;

  if (dropShare <= input.maxDropShare) {
    const outcome = add.length === 0 && dropped.length === 0 ? 'noop' : 'applied';
    return { outcome, refusalReason: null, add, drop: dropped, dropShare, confirmDiffShare: null, boundedStep: null };
  }

  const refuse = (confirmDiffShare: number | null): RefreshDecision => ({
    outcome: 'refused', refusalReason: 'drop_share', add: [], drop: [], dropShare, confirmDiffShare, boundedStep: null,
  });
  if (input.baselineComputed === null) return refuse(null);

  const confirmDiffShare = symmetricDiffShare(input.computed, input.baselineComputed);
  if (confirmDiffShare > input.confirmMaxDiffShare) return refuse(confirmDiffShare);

  // Confirmed: drop only what BOTH computations agree is gone, never a pin, at most ⌊max × running⌋ this run,
  // lowest volume first; a symbol with no ticker today (absent from the map) is lowest of all. Ties by symbol.
  const baseline = new Set(input.baselineComputed);
  const confirmedSet = [...running].filter(s => !computed.has(s) && !baseline.has(s) && !pins.has(s));
  const cap = Math.floor(input.maxDropShare * running.size);
  const vol = (s: string): number => {
    const v = input.volumeUsdBySymbol[s];
    return typeof v === 'number' && Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY;
  };
  const ordered = [...confirmedSet].sort((a, b) => (vol(a) - vol(b)) || (a < b ? -1 : a > b ? 1 : 0));
  const drop = sorted(ordered.slice(0, cap));
  const boundedStep = confirmedSet.length === 0 ? null : drop.length / confirmedSet.length;
  return { outcome: 'applied_confirmed', refusalReason: null, add, drop, dropShare, confirmDiffShare, boundedStep };
}

/** Next consecutive-refusal count: a refused or confirmed (bounded) run extends the episode; applied / noop ends it. */
export function nextConsecutiveRefusals(prev: number, outcome: RefreshOutcome): number {
  return outcome === 'refused' || outcome === 'applied_confirmed' ? prev + 1 : 0;
}

/** Episode baseline from the latest confirmable row: usable only while that row is still inside an episode. */
export function baselineFrom(row: { outcome: string; computedSymbols: unknown } | null): string[] | null {
  if (!row) return null;
  if (row.outcome !== 'refused' && row.outcome !== 'applied_confirmed') return null;
  return Array.isArray(row.computedSymbols) ? row.computedSymbols.filter((s): s is string => typeof s === 'string') : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rungs
// ─────────────────────────────────────────────────────────────────────────────

export function rungFor(consecutive: number): { key: string; severity: 'info' | 'warning' | 'critical'; level: 1 | 2 | 3 } {
  if (consecutive >= 3) return { key: `${RUNG_PREFIX}3`, severity: 'critical', level: 3 };
  if (consecutive === 2) return { key: `${RUNG_PREFIX}2`, severity: 'warning', level: 2 };
  return { key: `${RUNG_PREFIX}1`, severity: 'info', level: 1 };
}

export function rungBody(args: {
  level: 1 | 2 | 3; consecutive: number; ageHours: number; outcome: RefreshOutcome;
  refusalReason: RefusalReason | null; occurrenceId: string; runId: string;
}): string {
  const what = args.outcome === 'applied_confirmed'
    ? 'applied a BOUNDED, confirmed step (part of a large drop the gate held back), so the universe is still converging'
    : `REFUSED to change the universe (reason: ${args.refusalReason})`;
  // A body is written ONCE: addAlert returns an open same-key row unchanged (system-alerts.ts, the dedupe branch),
  // so rung 3 stays open across every later refusal. Rungs 1 and 2 are mint-time records and say so; rung 3 carries
  // NO figure at all and points at the table for the live count (pre-audit, the rung-3 body rule — Langston Gate A).
  const figures = args.level === 3
    ? 'This alert is not updated after it is raised: the LIVE count of runs without a clean apply and the age of the recorder\'s subscribed set are consecutive_refusals and running_set_age_hours on the LATEST row of crypto_universe_refresh_runs.'
    : `As of run ${args.runId}: consecutive runs without a clean apply ${args.consecutive}; the recorder's subscribed set was last confirmed current ${args.ageHours.toFixed(1)} h before this run.`;
  const lines = [
    `The daily crypto spot universe refresh ${what}.`,
    figures,
    `Raised by occurrence ${args.occurrenceId}; run row ${args.runId} in crypto_universe_refresh_runs.`,
    'This alert resolves itself on the next applied or noop run. RESOLVE it, never ack it.',
  ];
  if (args.level === 3) {
    lines.push(
      'Read the run rows in crypto_universe_refresh_runs (outcome, refusal_reason, drop_share, confirm_diff_share, batches) to see why it keeps refusing.',
      'There is NO operator path to force a change, and a restart is NOT recovery: the recorder boots from the same computed universe the refresh refused.',
    );
  }
  return lines.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// The run
// ─────────────────────────────────────────────────────────────────────────────

export async function runCryptoUniverseRefresh(
  { occurrenceId, triggerSource }: { occurrenceId: string; triggerSource: 'cron' | 'missed_catchup' },
): Promise<RefreshResult> {
  const startedAt = new Date();
  const archiver = await import('./passive-archive/crypto-spot-archiver.js');

  // 0. Add failures left by the previous run — logged now so they survive any later throw.
  const addFailures = archiver.takeCryptoAddFailures();
  if (addFailures.rejected.length || addFailures.unconfirmed.length) {
    console.warn(`${LOG} previous adds: rejected=${JSON.stringify(addFailures.rejected)} unconfirmed=${JSON.stringify(addFailures.unconfirmed)}`);
  }

  // Knobs — required, no fallback (a missing or non-number row throws). Read ASYNC, through the service's own
  // TTL-cached loader: a once-a-day job has no reason to depend on the boot-warmed sync cache, and the sync readers
  // are reserved for modules the warmup prefetches (the 8a-P4c inc 3 sweep guards exactly that class).
  const { getConstant, GLOBAL_KEY } = await import('./module-constants-service.js');
  const requiredNumber = async (name: string): Promise<number> => {
    const v = await getConstant<unknown>(MODULE, name, GLOBAL_KEY);
    if (typeof v !== 'number') {
      throw new Error(`module_constants: required number missing for ${MODULE}.${name} (got ${v === undefined ? 'no row' : typeof v}). Seed via Drizzle migration.`);
    }
    return v;
  };
  const maxDropShare = await requiredNumber(MAX_DROP_SHARE_KEY);
  const confirmMaxDiffShare = await requiredNumber(CONFIRM_MAX_DIFF_SHARE_KEY);

  // 1. Load.
  const { loadCryptoSpotUniverse, isUniverseFetchComplete, assertClassifiedPlausible } =
    await import('./passive-archive/universe-loader.js');
  const universe = await loadCryptoSpotUniverse();
  const computed = [...new Set(universe.symbols)].sort();

  // Previous rows: the counter, the episode baseline, and the age of the running set.
  const [lastRow] = await db.select({ consecutiveRefusals: cryptoUniverseRefreshRuns.consecutiveRefusals })
    .from(cryptoUniverseRefreshRuns).orderBy(desc(cryptoUniverseRefreshRuns.startedAt)).limit(1);
  const prevConsecutive = lastRow?.consecutiveRefusals ?? 0;
  const [lastConfirmable] = await db.select({
    outcome: cryptoUniverseRefreshRuns.outcome, computedSymbols: cryptoUniverseRefreshRuns.computedSymbols,
  }).from(cryptoUniverseRefreshRuns).where(eq(cryptoUniverseRefreshRuns.confirmable, true))
    .orderBy(desc(cryptoUniverseRefreshRuns.startedAt)).limit(1);
  const [lastClean] = await db.select({ finishedAt: cryptoUniverseRefreshRuns.finishedAt })
    .from(cryptoUniverseRefreshRuns)
    .where(inArray(cryptoUniverseRefreshRuns.outcome, ['applied', 'applied_confirmed', 'noop']))
    .orderBy(desc(cryptoUniverseRefreshRuns.startedAt)).limit(1);
  const processStartMs = Date.now() - process.uptime() * 1000;
  const cleanMs = lastClean?.finishedAt ? new Date(lastClean.finishedAt).getTime() : Number.NEGATIVE_INFINITY;
  const runningSetAgeHours = (Date.now() - Math.max(cleanMs, processStartMs)) / 3_600_000;

  // The running set is read AFTER the multi-batch fetch and the row reads, not before them: the recorder can remove
  // symbols outside a refresh (a rejected or timed-out add is withdrawn), so a snapshot taken before those awaits
  // could diff against a set that no longer exists (Langston Gate A carry 1). The pins read is the only await left
  // between this read and decideRefresh.
  const running = archiver.getCryptoRecorderRunningSymbols();
  const countBefore = running.length;

  let outcome: RefreshOutcome;
  let refusalReason: RefusalReason | null = null;
  let confirmable = false;
  let decision: RefreshDecision | null = null;
  let pins: string[] = [];
  let refusalMessage: string | null = null;

  if (!isUniverseFetchComplete(universe.batches)) {
    // 2. Arm (a).
    outcome = 'refused';
    refusalReason = 'incomplete_fetch';
  } else {
    // 3. Non-degeneracy — C1: the throw is caught and recorded; C2: our own message, never the perp one.
    let degenerate = computed.length === 0;
    if (!degenerate) {
      try {
        assertClassifiedPlausible(countBefore, computed.length);
      } catch {
        degenerate = true;
      }
    }
    if (degenerate) {
      outcome = 'refused';
      refusalReason = 'degenerate';
      refusalMessage = `crypto spot universe refresh: computed ${computed.length} symbols against ${countBefore} running ` +
        `(floor ${Math.ceil(countBefore / 2)}); refusing as degenerate`;
    } else {
      // 4. Pins — a throw propagates.
      const { readCryptoUniversePins } = await import('./passive-archive/crypto-universe-pins.js');
      pins = await readCryptoUniversePins();
      // 5. Arm (b).
      decision = decideRefresh({
        running, computed, pins, volumeUsdBySymbol: universe.volumeUsdBySymbol,
        maxDropShare, confirmMaxDiffShare, baselineComputed: baselineFrom(lastConfirmable ?? null),
      });
      outcome = decision.outcome;
      refusalReason = decision.refusalReason;
      confirmable = true;
    }
  }
  if (refusalMessage) console.warn(`${LOG} ${refusalMessage}`);
  else if (outcome === 'refused') console.warn(`${LOG} refused: ${refusalReason}`);

  // 6. Apply.
  let added: string[] = [];
  let droppedApplied: string[] = [];
  if (decision && (decision.add.length || decision.drop.length)) {
    const r = await archiver.applyCryptoUniverseChange({ add: decision.add, drop: decision.drop, occurrenceId });
    added = r.added;
    droppedApplied = r.dropped;
  }
  const countAfter = archiver.getCryptoRecorderRunningSymbols().length;
  const consecutiveRefusals = nextConsecutiveRefusals(prevConsecutive, outcome);

  // Run row.
  const [row] = await db.insert(cryptoUniverseRefreshRuns).values({
    occurrenceId,
    startedAt,
    finishedAt: new Date(),
    outcome,
    refusalReason,
    confirmable,
    confirmDiffShare: decision?.confirmDiffShare ?? null,
    confirmMaxDiffShare,
    boundedStep: decision?.boundedStep ?? null,
    countBefore,
    countAfter,
    computedCount: computed.length,
    computedSymbols: computed,
    added,
    dropped: droppedApplied,
    pinned: pins,
    rejectedAdds: addFailures.rejected,
    unconfirmedAdds: addFailures.unconfirmed,
    batches: universe.batches,
    volumes: universe.volumeUsdBySymbol,
    floorUsd: universe.floorUsd,
    dropShare: decision?.dropShare ?? null,
    maxDropShare,
    runningSetAgeHours,
    consecutiveRefusals,
    triggerSource,
  }).returning({ id: cryptoUniverseRefreshRuns.id });
  const runId = row.id;

  // Alerts.
  const alerts = await import('./system-alerts.js');
  if (outcome === 'refused' || outcome === 'applied_confirmed') {
    const rung = rungFor(consecutiveRefusals);
    await alerts.addAlert({
      triggers_at: new Date(),
      category: 'health_check',
      severity: rung.severity,
      title: `Crypto universe refresh: ${outcome === 'refused' ? `refused (${refusalReason})` : 'bounded confirmed step'}, ` +
        `${consecutiveRefusals} run(s) without a clean apply`,
      body: rungBody({ level: rung.level, consecutive: consecutiveRefusals, ageHours: runningSetAgeHours, outcome,
        refusalReason, occurrenceId, runId }),
      dedupe_key: rung.key,
      metadata: {
        batch: 'B-UNIVERSE-REFRESH-ACTS', ledger: '#1018', run_id: runId, occurrence_id: occurrenceId,
        outcome, refusal_reason: refusalReason, consecutive_refusals: consecutiveRefusals,
        running_set_age_hours: runningSetAgeHours, count_before: countBefore, count_after: countAfter,
      },
    });
  } else {
    await alerts.resolveAlertsByDedupePrefix(RUNG_PREFIX, REFRESH_ACTOR, `crypto_universe_refresh_runs ${runId}`, 'engine');
  }

  console.log(`${LOG} occurrence=${occurrenceId} outcome=${outcome}${refusalReason ? `/${refusalReason}` : ''} ` +
    `running ${countBefore}→${countAfter} added=${added.length} dropped=${droppedApplied.length} consecutive=${consecutiveRefusals}`);
  return {
    outcome, refusalReason, countBefore, countAfter,
    addedCount: added.length, droppedCount: droppedApplied.length, consecutiveRefusals,
  };
}
