/**
 * B-XSTOCK-BAR-AVAILABILITY R7 — the unattended verdict runner (Langston C6 ruling, 2026-11-20).
 *
 * Why it exists: the R2 window's final gate read was missed while every session was stopped, and
 * the nightly B75 sweep then dropped three of the window's revision partitions (11-09, 11-10 and 11-11).
 * A verdict must not depend on a session being awake. This runner is scheduled from root's crontab beside
 * the sweep (NOT an in-app lane, so it runs with the app down) but RUNS AS deploy —
 * `su - deploy -c "cd /home/deploy/dawntrader && server/scripts/b-xstock-bar-availability-verdict-run.sh"` —
 * because the alerts file is deploy:deploy 0644 and the alert store replaces it by renaming a temp file
 * over it: a root run would leave a root-owned alerts file the app can no longer write. The runner and
 * its launcher both REFUSE to run as root (Langston Step-4 blocker B1). Each run:
 *
 *   1. reads the governed `graded_window_start` and derives final_gate_at = start + 9 days + 10 minutes
 *      (final_gate_at is not stored anywhere else; the old window's lived only in an alert's metadata);
 *   2. SKIPS ("not due") before final_gate_at, and SKIPS ("verdict exists") once a verdict alert exists
 *      on `xstock-bar-availability-capacity-verdict:<window_start>` (one-shot key — C-1);
 *   3. otherwise runs the capacity gate CLI once and maps its exit: 0 pass / 2 fail / 3 inconclusive are
 *      VERDICTS (inconclusive is first-class, C6-2); exit 1, a signal, a timeout or an unparseable stdout
 *      is NO verdict, raised as a warning on `xstock-bar-availability-verdict-runner-failed:<window_start>`;
 *   4. writes the verdict alert with the full `verdict.checks`, headline counts, runTiming and the day
 *      count in its metadata (C-2 — the alert is the record; the dated JSON file is detail only), then
 *      READS IT BACK (C-1) before printing the ran-and-wrote line.
 *
 * DAYS THE SWEEP HAS ALREADY DROPPED (Langston Step-4 blocker B2). The gate's day labels come from the
 * clock, and its count checks do not test that each day's revision rows are still present — so a window
 * whose partitions were dropped can read as complete. Before grading, the runner lists which UTC days of
 * the registered window [start, start + 9 days) are no longer covered by any hot partition of
 * `xstock_bar_revision_event`, records them as `in_window_days_missing_from_hot`, and a PASS with any
 * day missing is recorded as INCONCLUSIVE (`gate_state` keeps the gate's own answer). A read failure here
 * is no verdict, never a silent pass. The metadata still records the gate's day count and how many days
 * lie beyond the registered nine.
 *
 * REVIEWED REFS — A CLAIM, STATED AS ONE. The gate requires every contributing build to be in the
 * reviewed-ref list. An unattended run cannot ask Langston, so it passes the staging DEPLOY HISTORY:
 * every `dt-deploy` reset recorded in the deploy clone's reflog since the window opened, plus the last
 * one before it (the build running at window open). A build that reached staging any other way is
 * absent from that list, so the gate still FAILS on it — the check keeps its teeth. What the list does
 * NOT prove is that each deploy was Langston-cleared; the verdict records `reviewed_refs_source` and the
 * grading session confirms each ref against his clearance before treating the verdict as final. The
 * reflog is read against an ALLOWLIST of known-good verbs: `reset: moving to <40-char sha>` is a
 * dt-deploy and `reset: moving to HEAD` (the deploy clone's own worktree reset) moves nothing. Every
 * other entry since the build running at window open (a checkout, a pull, a commit, a line the parser
 * cannot read) is unrecognised: it is counted and listed as `reflog_unrecognised_entries`, and it turns
 * a gate PASS into a recorded INCONCLUSIVE, because the build may have moved without a dt-deploy.
 *
 * Hot coverage (B2): before the gate runs, the runner lists the revision table's child partitions and
 * compares them with every UTC day the window touches. The metadata records the partitions examined,
 * the days compared and `in_window_days_missing_from_hot`; any missing day turns a PASS INCONCLUSIVE. A
 * partition read that fails or returns nothing is NOT an empty list: it is a no-verdict night (the
 * failure key is raised and the one-shot verdict is not spent), so an unread list never renders as a pass.
 *
 * Alert edges: the verdict key is one-shot and never cleared. `…-verdict-runner-failed:<start>` is
 * resolved by the run that writes and reads back that window's verdict, and every OLDER window's row is
 * resolved on each run once the governed start has moved (R2'). A read-back failure raises on that key
 * and stays open for the grading session: that case needs a person to look.
 *
 * Prints exactly one of: `RAN-AND-WROTE`, `RAN-NO-VERDICT`, `SKIPPED not-due`, `SKIPPED verdict-exists`.
 */
import 'dotenv/config';
import pg from 'pg';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  addAlert,
  getAlertDedupeState,
  readAllAlerts,
  resolveAlertsByDedupeKey,
  resolveAlertsByDedupePrefix,
  type AddAlertOptions,
  type AlertDedupeState,
  type SystemAlert,
} from '../services/system-alerts.js';
import {
  GRADED_WINDOW_START_SQL,
  parseGradedWindowStart,
  REGISTERED_WINDOW_DAYS,
  REGISTERED_WINDOW_MS,
  VERDICT_KEY_PREFIX,
  verdictKey,
  XSTOCK_REVISION_PARENT,
} from '../services/data-archive/xstock-revision-verdict-hold.js';
import { classifyPartition } from '../services/data-archive/sweep-slicing.js';

const { Client } = pg;

export const VERDICT_RUNNER_ACTOR = 'xstock-bar-verdict-runner';
/** The verdict key and the window length are defined once, in the sweep-hold module (R7b), so the
 *  writer here and the guard in the B75 sweep cannot drift onto different keys. */
export { REGISTERED_WINDOW_DAYS, VERDICT_KEY_PREFIX, verdictKey };
export const RUNNER_FAILURE_KEY_PREFIX = 'xstock-bar-availability-verdict-runner-failed:';
/** The registered window is nine days; the gate is due ten minutes after it closes. */
export const FINAL_GATE_OFFSET_MS = REGISTERED_WINDOW_MS + 10 * 60_000;
/** The gate's own read budget is 1,200,000 ms; anything past this is a hung child, not a slow read. */
export const GATE_CHILD_TIMEOUT_MS = 30 * 60_000;
const GATE_SCRIPT = 'server/scripts/b-xstock-bar-availability-capacity-gate.ts';
const LOG = '[xstock-bar-verdict-runner]';

export function finalGateAt(windowStart: Date): Date {
  return new Date(windowStart.getTime() + FINAL_GATE_OFFSET_MS);
}

export function runnerFailureKey(windowStart: Date): string {
  return `${RUNNER_FAILURE_KEY_PREFIX}${windowStart.toISOString()}`;
}

export type RunnerDecision =
  | { action: 'not-due'; finalGateAt: Date }
  | { action: 'verdict-exists'; key: string }
  | { action: 'run'; finalGateAt: Date };

/** Any stored verdict row — open or resolved — ends the runner's work for that window (one-shot key). */
export function decide(now: Date, windowStart: Date, verdictState: AlertDedupeState): RunnerDecision {
  const due = finalGateAt(windowStart);
  if (now.getTime() < due.getTime()) return { action: 'not-due', finalGateAt: due };
  if (verdictState !== 'absent') return { action: 'verdict-exists', key: verdictKey(windowStart) };
  return { action: 'run', finalGateAt: due };
}

const RESET_LINE = /^[0-9a-f]+ HEAD@\{([^}]+)\}: reset: moving to ([0-9a-f]{40})\s*$/i;

/**
 * The deploy history from `git reflog --date=iso-strict` in the deploy clone. Returns every reset at or
 * after the window start plus the newest reset before it. Throws when the reflog does not reach back
 * past the window start — then the build running at window open is unknown and the list is incomplete.
 */
export function deployRefsFromReflog(reflog: string, windowStart: Date): string[] {
  const resets: Array<{ at: number; sha: string }> = [];
  for (const line of reflog.split(/\r?\n/)) {
    const match = RESET_LINE.exec(line.trim());
    if (!match) continue;
    const at = new Date(match[1]).getTime();
    if (!Number.isFinite(at)) continue;
    resets.push({ at, sha: match[2].toLowerCase() });
  }
  const start = windowStart.getTime();
  const inWindow = resets.filter((r) => r.at >= start);
  const before = resets.filter((r) => r.at < start).sort((a, b) => b.at - a.at)[0];
  if (!before) {
    throw new Error(`deploy reflog does not reach back before the window start ${windowStart.toISOString()}; `
      + 'the build running at window open is unknown, so the reviewed-ref list would be incomplete');
  }
  return [...new Set([before.sha, ...inWindow.map((r) => r.sha)])].sort();
}

const REFLOG_ENTRY = /^[0-9a-f]+ HEAD@\{([^}]+)\}: (.*)$/i;
/**
 * The reflog actions that are KNOWN GOOD, enumerated (Langston: an allowlist, not "anything not on a bad
 * list"). A `reset: moving to <40-sha>` is a dt-deploy and is read by `deployRefsFromReflog`. A
 * `reset: moving to HEAD` is the deploy clone resetting its own worktree and moves nothing. Every other
 * entry is unrecognised.
 */
const BENIGN_REFLOG_ACTIONS: readonly RegExp[] = [/^reset: moving to HEAD\s*$/i];

/**
 * Reflog entries since the build running at window open that are neither a dt-deploy reset nor on the
 * benign list — a checkout, a pull, a commit, or a line the parser cannot read. Each moved (or may have
 * moved) the build without a dt-deploy, so the deploy history alone does not account for it. An entry
 * whose date cannot be read is counted: its position cannot be ruled out.
 */
export function unrecognisedReflogEntries(reflog: string, windowStart: Date): string[] {
  const start = windowStart.getTime();
  let cutoff = start;
  for (const line of reflog.split(/\r?\n/)) {
    const match = RESET_LINE.exec(line.trim());
    if (!match) continue;
    const at = new Date(match[1]).getTime();
    if (Number.isFinite(at) && at < start && (cutoff === start || at > cutoff)) cutoff = at;
  }
  const out: string[] = [];
  for (const raw of reflog.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || RESET_LINE.test(line)) continue;
    const entry = REFLOG_ENTRY.exec(line);
    if (entry && BENIGN_REFLOG_ACTIONS.some((ok) => ok.test(entry[2]))) continue;
    const at = entry ? new Date(entry[1]).getTime() : Number.NaN;
    if (!Number.isFinite(at) || at >= cutoff) out.push(line);
  }
  return out;
}

/** One hot child partition of `xstock_bar_revision_event`, with the UTC range its name declares. */
export interface HotPartition {
  child: string;
  rangeStart: Date;
  rangeEnd: Date;
}

export interface HotCoverage {
  /** Every classified child partition the read returned — the population the answer is drawn from. */
  partitionsExamined: string[];
  /** Every UTC day of the registered window [start, start + 9 days), the set compared against. */
  daysCompared: string[];
  /** The days of `daysCompared` whose in-window span no single hot partition covers. */
  missing: string[];
}

const DAY_MS = 86_400_000;

/**
 * B2 (Langston Step 4): which UTC days of the registered window are no longer in the hot partitions.
 * A day is covered when one partition's range holds that day's in-window span. The day set comes from
 * the governed window start alone, so it is never empty. A read that returned NO partition is not a
 * measured emptiness — it throws, and the run records no verdict.
 */
export function hotCoverage(partitions: HotPartition[], windowStart: Date): HotCoverage {
  if (partitions.length === 0) {
    throw new Error(`the partition read returned no classified child of ${XSTOCK_REVISION_PARENT}; `
      + 'an empty read is not evidence that every day is present');
  }
  const start = windowStart.getTime();
  const end = start + REGISTERED_WINDOW_MS;
  const daysCompared: string[] = [];
  const missing: string[] = [];
  for (let day = Math.floor(start / DAY_MS) * DAY_MS; day < end; day += DAY_MS) {
    const label = new Date(day).toISOString().slice(0, 10);
    daysCompared.push(label);
    const needStart = Math.max(day, start);
    const needEnd = Math.min(day + DAY_MS, end);
    const covered = partitions.some((p) => p.rangeStart.getTime() <= needStart && p.rangeEnd.getTime() >= needEnd);
    if (!covered) missing.push(label);
  }
  return { partitionsExamined: partitions.map((p) => p.child).sort(), daysCompared, missing };
}

export type GateOutcome =
  | {
    kind: 'verdict';
    state: 'pass' | 'fail' | 'inconclusive';
    evidence: Record<string, unknown>;
    /** Set when the gate passed but the runner's own checks cannot stand behind the pass. */
    downgrade?: { from: 'pass'; reasons: string[] };
  }
  | { kind: 'no-verdict'; reason: string };

/**
 * A gate PASS stands only if every window day is still in the hot partitions and the reflog holds no
 * unrecognised entry; otherwise it is recorded INCONCLUSIVE. A FAIL or an INCONCLUSIVE is never changed.
 */
export function applyRunnerChecks(outcome: GateOutcome, coverage: HotCoverage, unrecognised: string[]): GateOutcome {
  if (outcome.kind !== 'verdict' || outcome.state !== 'pass') return outcome;
  const reasons: string[] = [];
  if (coverage.missing.length > 0) reasons.push(`in-window days missing from hot partitions: ${coverage.missing.join(', ')}`);
  if (unrecognised.length > 0) reasons.push(`${unrecognised.length} unrecognised reflog entr${unrecognised.length === 1 ? 'y' : 'ies'} since the window opened`);
  if (reasons.length === 0) return outcome;
  return { ...outcome, state: 'inconclusive', downgrade: { from: 'pass', reasons } };
}

const EXIT_STATE: Record<number, 'pass' | 'fail' | 'inconclusive'> = { 0: 'pass', 2: 'fail', 3: 'inconclusive' };

/** A verdict needs BOTH a verdict exit code AND stdout whose `verdict.state` agrees with it. */
export function classifyGateExit(code: number | null, signal: string | null, stdout: string): GateOutcome {
  if (signal) return { kind: 'no-verdict', reason: `gate killed by ${signal}` };
  if (code === null || !(code in EXIT_STATE)) return { kind: 'no-verdict', reason: `gate exit ${String(code)}` };
  const expected = EXIT_STATE[code];
  let evidence: Record<string, unknown>;
  try {
    evidence = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return { kind: 'no-verdict', reason: `gate exit ${code} but stdout is not one JSON object` };
  }
  const state = (evidence.verdict as Record<string, unknown> | undefined)?.state;
  if (state !== expected) {
    return { kind: 'no-verdict', reason: `gate exit ${code} expects ${expected} but verdict.state is ${String(state)}` };
  }
  return { kind: 'verdict', state: expected, evidence };
}

export interface VerdictContext {
  windowStart: Date;
  finalGateAt: Date;
  gradedRef: string;
  reviewedRefs: string[];
  evidenceFile: string;
  runAt: Date;
  hotCoverage: HotCoverage;
  reflogUnrecognised: string[];
}

function count(value: unknown): number | null {
  const n = Number(value);
  return value === null || value === undefined || !Number.isFinite(n) ? null : n;
}

export function buildVerdictAlert(
  outcome: Extract<GateOutcome, { kind: 'verdict' }>,
  ctx: VerdictContext,
): AddAlertOptions {
  const ev = outcome.evidence;
  const verdict = (ev.verdict ?? {}) as Record<string, unknown>;
  const window = (ev.window ?? {}) as Record<string, unknown>;
  const population = (ev.population ?? {}) as Record<string, unknown>;
  const sessions = Array.isArray(ev.venueSessions) ? ev.venueSessions as Array<Record<string, unknown>> : [];
  const dayLabels = Array.isArray(window.completeUtcCalendarDays) ? window.completeUtcCalendarDays as string[] : [];
  const checks = (verdict.checks ?? null) as Record<string, boolean> | null;
  const failedChecks = checks ? Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name) : [];
  // The gate leaves its counts unset on its own inconclusive; a runner downgrade keeps the gate's counts.
  const gateInconclusive = outcome.state === 'inconclusive' && !outcome.downgrade;
  const headline = {
    complete_utc_days: gateInconclusive ? null : dayLabels.length,
    days_beyond_registered: gateInconclusive ? null : Math.max(0, dayLabels.length - REGISTERED_WINDOW_DAYS),
    complete_venue_sessions: gateInconclusive ? null : sessions.filter((s) => s.continuity_pass === true).length,
    revision_events: count(population.revision_events),
    symbols: count(population.symbols),
    elapsed_seconds: count(window.elapsedSeconds),
  };
  const windowIso = ctx.windowStart.toISOString();
  const what = outcome.state === 'pass'
    ? 'PASSED'
    : outcome.state === 'fail'
      ? `FAILED (${failedChecks.length} check(s): ${failedChecks.join(', ') || 'see metadata'})`
      : outcome.downgrade
        ? `was INCONCLUSIVE — the gate itself passed, but ${outcome.downgrade.reasons.join('; ')}`
        : `was INCONCLUSIVE (leg ${String(verdict.leg)}: ${String(verdict.reason)})`;
  const unrecognisedNote = ctx.reflogUnrecognised.length > 0
    ? ` The deploy clone's reflog holds ${ctx.reflogUnrecognised.length} entr${ctx.reflogUnrecognised.length === 1 ? 'y' : 'ies'} that is not a dt-deploy and not on the known-good list (listed in metadata).`
    : '';
  return {
    triggers_at: ctx.runAt,
    category: 'verification',
    severity: outcome.state === 'pass' ? 'info' : 'warning',
    title: `xStock bar availability capacity gate ${outcome.state.toUpperCase()} — window ${windowIso}`,
    body: `The unattended verdict runner graded the xStock bar availability window that opened ${windowIso}; `
      + `the gate ${what}. Graded build ${ctx.gradedRef}. `
      + 'The reviewed-ref list is the staging deploy history (every dt-deploy since the window opened, plus the '
      + 'build running at window open) — a claim, not Langston\'s clearance: the grading session confirms each ref '
      + `was cleared before treating this verdict as final.${unrecognisedNote} Full checks are in this alert's metadata; the raw evidence is ${ctx.evidenceFile}.`,
    metadata: {
      batch: 'B-XSTOCK-BAR-AVAILABILITY',
      source: 'b-xstock-bar-availability-verdict-runner',
      state: outcome.state,
      window_start: windowIso,
      final_gate_at: ctx.finalGateAt.toISOString(),
      graded_ref: ctx.gradedRef,
      reviewed_refs: ctx.reviewedRefs,
      reviewed_refs_source: 'dt-deploy-reflog',
      checks,
      failed_checks: failedChecks,
      reserves: verdict.reserves ?? null,
      inconclusive: outcome.state !== 'inconclusive'
        ? null
        : outcome.downgrade
          ? { leg: 'runner-checks', reason: outcome.downgrade.reasons.join('; '), gate_state: 'pass' }
          : { leg: verdict.leg ?? null, reason: verdict.reason ?? null, gate_state: 'inconclusive' },
      in_window_days_missing_from_hot: ctx.hotCoverage.missing,
      in_window_days_compared: ctx.hotCoverage.daysCompared,
      hot_partitions_examined: ctx.hotCoverage.partitionsExamined,
      reflog_unrecognised_entries: ctx.reflogUnrecognised,
      headline,
      run_timing: verdict.runTiming ?? null,
      read_elapsed_ms: count(ev.readElapsedMs),
      evidence_file: ctx.evidenceFile,
    },
    dedupe_key: verdictKey(ctx.windowStart),
    one_shot: true,
  };
}

/** C-1 read-back: the stored row on the key must be the one returned, carrying the same state. */
export function verdictReadBack(all: SystemAlert[], key: string, written: SystemAlert, state: string): boolean {
  const rows = all.filter((a) => a.dedupe_key === key);
  return rows.length === 1 && rows[0].id === written.id && rows[0].metadata?.state === state;
}

export interface RunnerDeps {
  now: () => Date;
  readGovernedWindowStart: () => Promise<Date>;
  readGradedRef: () => Promise<string>;
  readReflog: () => string;
  /** Every child of `xstock_bar_revision_event` with the range its name declares (B2). */
  readRevisionPartitions: () => Promise<HotPartition[]>;
  /** Resolve every open runner-failure row except `keepKey` — an older window's orphans (fold-in b). */
  resolveOtherWindows: (keepKey: string, evidence: string) => Promise<string[]>;
  runGate: (args: string[]) => Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>;
  writeEvidence: (name: string, content: string) => Promise<string>;
  dedupeState: (key: string) => AlertDedupeState;
  addAlert: (opts: AddAlertOptions) => Promise<SystemAlert>;
  readAllAlerts: () => SystemAlert[];
  resolveByKey: (key: string, evidence: string) => Promise<string[]>;
  log: (line: string) => void;
}

export type RunnerResult = 'ran-and-wrote' | 'ran-no-verdict' | 'skipped-not-due' | 'skipped-verdict-exists';

export async function runVerdictRunner(deps: RunnerDeps): Promise<RunnerResult> {
  const windowStart = await deps.readGovernedWindowStart();
  const key = verdictKey(windowStart);
  const failKey = runnerFailureKey(windowStart);
  try {
    const cleared = await deps.resolveOtherWindows(failKey,
      `governed window is now ${windowStart.toISOString()}; runner-failure rows of an older window are nobody's to clear`);
    if (cleared.length > 0) deps.log(`${LOG} resolved ${cleared.length} older-window runner-failure row(s)`);
  } catch (error) {
    deps.log(`${LOG} older-window clear failed (${error instanceof Error ? error.message : String(error)}); continuing`);
  }
  const decision = decide(deps.now(), windowStart, deps.dedupeState(key));
  if (decision.action === 'not-due') {
    deps.log(`${LOG} SKIPPED not-due window=${windowStart.toISOString()} final_gate_at=${decision.finalGateAt.toISOString()}`);
    return 'skipped-not-due';
  }
  if (decision.action === 'verdict-exists') {
    deps.log(`${LOG} SKIPPED verdict-exists key=${key}`);
    return 'skipped-verdict-exists';
  }

  const runAt = deps.now();
  const stamp = runAt.toISOString().replace(/[:.]/g, '-');
  const evidenceName = `xstock-bar-availability-verdict-${windowStart.toISOString().slice(0, 10)}-${stamp}.json`;
  let outcome: GateOutcome;
  let coverage: HotCoverage | null = null;
  let reflogUnrecognised: string[] = [];
  let gradedRef = '';
  let reviewedRefs: string[] = [];
  let stdout = '';
  let stderr = '';
  try {
    gradedRef = (await deps.readGradedRef()).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(gradedRef)) throw new Error(`dist/BUILD_SHA is not a 40-char sha: ${gradedRef}`);
    const reflog = deps.readReflog();
    reviewedRefs = deployRefsFromReflog(reflog, windowStart);
    reflogUnrecognised = unrecognisedReflogEntries(reflog, windowStart);
    // Read before the gate: a failed partition read is no verdict and costs no gate run.
    coverage = hotCoverage(await deps.readRevisionPartitions(), windowStart);
    const args = ['--window-start', windowStart.toISOString(), '--graded-ref', gradedRef,
      ...reviewedRefs.flatMap((ref) => ['--reviewed-ref', ref])];
    const child = await deps.runGate(args);
    stdout = child.stdout;
    stderr = child.stderr;
    outcome = applyRunnerChecks(classifyGateExit(child.code, child.signal, child.stdout), coverage, reflogUnrecognised);
  } catch (error) {
    outcome = { kind: 'no-verdict', reason: error instanceof Error ? error.message : String(error) };
  }

  const runner = { hotCoverage: coverage, reflogUnrecognised,
    downgrade: outcome.kind === 'verdict' ? outcome.downgrade ?? null : null };
  const evidenceFile = await deps.writeEvidence(evidenceName, outcome.kind === 'verdict'
    ? `${JSON.stringify({ ...outcome.evidence, runner }, null, 2)}\n`
    : `${JSON.stringify({ windowStart: windowStart.toISOString(), gradedRef, reviewedRefs, runner,
      noVerdict: outcome.reason, stdoutTail: stdout.slice(-4000), stderrTail: stderr.slice(-4000) }, null, 2)}\n`);

  if (outcome.kind === 'no-verdict') {
    await deps.addAlert({
      triggers_at: runAt,
      category: 'verification',
      severity: 'warning',
      title: `xStock bar availability verdict runner produced NO verdict — window ${windowStart.toISOString()}`,
      body: `The unattended runner could not grade the window that opened ${windowStart.toISOString()}: ${outcome.reason}. `
        + 'No verdict is stored, so it retries at its next daily run and the sweep keeps holding the window\'s '
        + `revision partitions (up to its cap). Detail: ${evidenceFile}.`,
      metadata: { batch: 'B-XSTOCK-BAR-AVAILABILITY', source: 'b-xstock-bar-availability-verdict-runner',
        window_start: windowStart.toISOString(), reason: outcome.reason, evidence_file: evidenceFile },
      dedupe_key: failKey,
    });
    deps.log(`${LOG} RAN-NO-VERDICT window=${windowStart.toISOString()} reason=${outcome.reason} evidence=${evidenceFile}`);
    return 'ran-no-verdict';
  }

  if (!coverage) throw new Error('unreachable: a verdict without a hot-coverage read');
  const ctx: VerdictContext = { windowStart, finalGateAt: decision.finalGateAt, gradedRef, reviewedRefs, evidenceFile, runAt,
    hotCoverage: coverage, reflogUnrecognised };
  const written = await deps.addAlert(buildVerdictAlert(outcome, ctx));
  if (!verdictReadBack(deps.readAllAlerts(), key, written, outcome.state)) {
    const reason = `verdict alert read-back failed on ${key} (written id ${written.id})`;
    // Fold-in f: raise before the throw so the failure is on the alert queue, not only in a log. If a
    // row is already open on this key (an earlier no-verdict night) the store returns that row and
    // writes nothing — the key is still open, which is what has to be true. It stays open for the
    // grading session: the verdict key may now hold a row, so no later run resolves it.
    try {
      await deps.addAlert({
        triggers_at: runAt,
        category: 'verification',
        severity: 'warning',
        title: `xStock bar availability verdict written but NOT read back — window ${windowStart.toISOString()}`,
        body: `The unattended runner wrote a ${outcome.state} verdict (alert ${written.id}) for the window that opened `
          + `${windowStart.toISOString()} but could not read it back on ${key}. Check that key by hand before treating `
          + `any verdict for this window as recorded. Evidence: ${evidenceFile}.`,
        metadata: { batch: 'B-XSTOCK-BAR-AVAILABILITY', source: 'b-xstock-bar-availability-verdict-runner',
          window_start: windowStart.toISOString(), reason, written_id: written.id, evidence_file: evidenceFile },
        dedupe_key: failKey,
      });
    } catch (alertErr) {
      deps.log(`${LOG} read-back failure alert could not be raised: ${alertErr instanceof Error ? alertErr.message : String(alertErr)}`);
    }
    throw new Error(reason);
  }
  const cleared = await deps.resolveByKey(failKey, `verdict alert ${written.id} written on ${key}`);
  deps.log(`${LOG} RAN-AND-WROTE state=${outcome.state} alert=${written.id} key=${key} reviewed_refs=${reviewedRefs.length}`
    + ` missing_from_hot=${coverage.missing.length} reflog_unrecognised=${reflogUnrecognised.length}`
    + ` cleared_failures=${cleared.length} evidence=${evidenceFile}`);
  return 'ran-and-wrote';
}

async function withClient<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const client = new Client({ connectionString: process.env.DATABASE_URL, application_name: 'xstock-bar-verdict-runner' });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '30s'");
    return await work(client);
  } finally {
    await client.end();
  }
}

async function readGovernedWindowStart(): Promise<Date> {
  return withClient(async (client) => {
    const { rows } = await client.query(GRADED_WINDOW_START_SQL);
    const parsed = parseGradedWindowStart(rows);
    if (!parsed.ok) throw new Error(parsed.reason);
    return parsed.start;
  });
}

/** The same child listing the B75 sweep reads, so the runner and the sweep see one partition set. */
const REVISION_PARTITIONS_SQL = `SELECT child.relname AS child_name
  FROM pg_inherits
  JOIN pg_class child ON child.oid = pg_inherits.inhrelid
  JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
  WHERE parent.relname = $1`;

async function readRevisionPartitions(): Promise<HotPartition[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ child_name: string }>(REVISION_PARTITIONS_SQL, [XSTOCK_REVISION_PARENT]);
    const out: HotPartition[] = [];
    for (const row of rows) {
      const c = classifyPartition(String(row.child_name));
      if (c) out.push({ child: String(row.child_name), rangeStart: c.rangeStart, rangeEnd: c.rangeEnd });
    }
    return out;
  });
}

function runGate(args: string[]): Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', GATE_SCRIPT, ...args], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    const timer = setTimeout(() => child.kill('SIGKILL'), GATE_CHILD_TIMEOUT_MS);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
}

async function main(): Promise<void> {
  // B1: the alerts file is deploy:deploy 0644 and is replaced by renaming a temp file over it, so a root
  // run would leave it root-owned and unwritable by the app. The cron line runs this as deploy.
  if (process.getuid?.() === 0) {
    console.error(`${LOG} refusing to run as root — schedule it as su - deploy -c "cd /home/deploy/dawntrader && ..."`);
    process.exitCode = 1;
    return;
  }
  const dir = process.env.XSTOCK_VERDICT_DIR || '/var/log/dawntrader';
  const result = await runVerdictRunner({
    now: () => new Date(),
    readGovernedWindowStart,
    readGradedRef: () => readFile('dist/BUILD_SHA', 'utf8'),
    readReflog: () => execFileSync('git', ['reflog', '--date=iso-strict'], { encoding: 'utf8' }),
    readRevisionPartitions,
    resolveOtherWindows: (keepKey, evidence) => resolveAlertsByDedupePrefix(
      RUNNER_FAILURE_KEY_PREFIX, VERDICT_RUNNER_ACTOR, evidence, 'timer-script', new Set([keepKey])),
    runGate,
    writeEvidence: async (name, content) => {
      await mkdir(dir, { recursive: true });
      const path = join(dir, name);
      await writeFile(path, content, { mode: 0o644 });
      return path;
    },
    dedupeState: getAlertDedupeState,
    addAlert,
    readAllAlerts,
    resolveByKey: (key, evidence) => resolveAlertsByDedupeKey(key, VERDICT_RUNNER_ACTOR, evidence, 'timer-script'),
    log: (line) => console.log(line),
  });
  process.exitCode = result === 'ran-no-verdict' ? 1 : 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`${LOG} fatal:`, error);
    process.exitCode = 1;
  });
}
