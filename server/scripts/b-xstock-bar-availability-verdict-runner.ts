/**
 * B-XSTOCK-BAR-AVAILABILITY R7 — the unattended verdict runner (Langston C6 ruling, 2026-11-20).
 *
 * Why it exists: the R2 window's final gate read was missed while every session was stopped, and
 * the nightly B75 sweep then dropped two of the window's revision partitions. A verdict must not
 * depend on a session being awake. This runner is a root cron entry beside the sweep (NOT an
 * in-app lane, so it runs with the app down), invoked through `b-xstock-bar-availability-verdict-run.sh`
 * under a kernel flock. Each run:
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
 * A later run grades the superset [start, now): the gate already reads [windowStart, observedAt) and
 * every count check is `>=`, so only the session count can gain from extra days; the metadata records
 * the day count and how many days lie beyond the registered nine (C-3).
 *
 * REVIEWED REFS — A CLAIM, STATED AS ONE. The gate requires every contributing build to be in the
 * reviewed-ref list. An unattended run cannot ask Langston, so it passes the staging DEPLOY HISTORY:
 * every `dt-deploy` reset recorded in the deploy clone's reflog since the window opened, plus the last
 * one before it (the build running at window open). A build that reached staging any other way is
 * absent from that list, so the gate still FAILS on it — the check keeps its teeth. What the list does
 * NOT prove is that each deploy was Langston-cleared; the verdict records `reviewed_refs_source` and the
 * grading session confirms each ref against his clearance before treating the verdict as final.
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
  type AddAlertOptions,
  type AlertDedupeState,
  type SystemAlert,
} from '../services/system-alerts.js';

const { Client } = pg;

export const VERDICT_RUNNER_ACTOR = 'xstock-bar-verdict-runner';
export const VERDICT_KEY_PREFIX = 'xstock-bar-availability-capacity-verdict:';
export const RUNNER_FAILURE_KEY_PREFIX = 'xstock-bar-availability-verdict-runner-failed:';
/** The registered window is nine days; the gate is due ten minutes after it closes. */
export const REGISTERED_WINDOW_DAYS = 9;
export const FINAL_GATE_OFFSET_MS = REGISTERED_WINDOW_DAYS * 86_400_000 + 10 * 60_000;
/** The gate's own read budget is 1,200,000 ms; anything past this is a hung child, not a slow read. */
export const GATE_CHILD_TIMEOUT_MS = 30 * 60_000;
const GATE_SCRIPT = 'server/scripts/b-xstock-bar-availability-capacity-gate.ts';
const WILDCARD_SCOPE_SQL = "asset_class='*' AND exchange='*' AND strategy='*' AND regime='*'";
const LOG = '[xstock-bar-verdict-runner]';

export function finalGateAt(windowStart: Date): Date {
  return new Date(windowStart.getTime() + FINAL_GATE_OFFSET_MS);
}

export function verdictKey(windowStart: Date): string {
  return `${VERDICT_KEY_PREFIX}${windowStart.toISOString()}`;
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

export type GateOutcome =
  | { kind: 'verdict'; state: 'pass' | 'fail' | 'inconclusive'; evidence: Record<string, unknown> }
  | { kind: 'no-verdict'; reason: string };

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
  const headline = {
    complete_utc_days: outcome.state === 'inconclusive' ? null : dayLabels.length,
    days_beyond_registered: outcome.state === 'inconclusive' ? null : Math.max(0, dayLabels.length - REGISTERED_WINDOW_DAYS),
    complete_venue_sessions: outcome.state === 'inconclusive' ? null : sessions.filter((s) => s.continuity_pass === true).length,
    revision_events: count(population.revision_events),
    symbols: count(population.symbols),
    elapsed_seconds: count(window.elapsedSeconds),
  };
  const windowIso = ctx.windowStart.toISOString();
  const what = outcome.state === 'pass'
    ? 'PASSED'
    : outcome.state === 'fail'
      ? `FAILED (${failedChecks.length} check(s): ${failedChecks.join(', ') || 'see metadata'})`
      : `was INCONCLUSIVE (leg ${String(verdict.leg)}: ${String(verdict.reason)})`;
  return {
    triggers_at: ctx.runAt,
    category: 'verification',
    severity: outcome.state === 'pass' ? 'info' : 'warning',
    title: `xStock bar availability capacity gate ${outcome.state.toUpperCase()} — window ${windowIso}`,
    body: `The unattended verdict runner graded the xStock bar availability window that opened ${windowIso}; `
      + `the gate ${what}. Graded build ${ctx.gradedRef}. `
      + 'The reviewed-ref list is the staging deploy history (every dt-deploy since the window opened, plus the '
      + 'build running at window open) — a claim, not Langston\'s clearance: the grading session confirms each ref '
      + `was cleared before treating this verdict as final. Full checks are in this alert's metadata; the raw evidence is ${ctx.evidenceFile}.`,
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
      inconclusive: outcome.state === 'inconclusive' ? { leg: verdict.leg ?? null, reason: verdict.reason ?? null } : null,
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
  const failKey = runnerFailureKey(windowStart);
  let outcome: GateOutcome;
  let gradedRef = '';
  let reviewedRefs: string[] = [];
  let stdout = '';
  let stderr = '';
  try {
    gradedRef = (await deps.readGradedRef()).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(gradedRef)) throw new Error(`dist/BUILD_SHA is not a 40-char sha: ${gradedRef}`);
    reviewedRefs = deployRefsFromReflog(deps.readReflog(), windowStart);
    const args = ['--window-start', windowStart.toISOString(), '--graded-ref', gradedRef,
      ...reviewedRefs.flatMap((ref) => ['--reviewed-ref', ref])];
    const child = await deps.runGate(args);
    stdout = child.stdout;
    stderr = child.stderr;
    outcome = classifyGateExit(child.code, child.signal, child.stdout);
  } catch (error) {
    outcome = { kind: 'no-verdict', reason: error instanceof Error ? error.message : String(error) };
  }

  const evidenceFile = await deps.writeEvidence(evidenceName, outcome.kind === 'verdict'
    ? `${JSON.stringify(outcome.evidence, null, 2)}\n`
    : `${JSON.stringify({ windowStart: windowStart.toISOString(), gradedRef, reviewedRefs,
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

  const ctx: VerdictContext = { windowStart, finalGateAt: decision.finalGateAt, gradedRef, reviewedRefs, evidenceFile, runAt };
  const written = await deps.addAlert(buildVerdictAlert(outcome, ctx));
  if (!verdictReadBack(deps.readAllAlerts(), key, written, outcome.state)) {
    throw new Error(`verdict alert read-back failed on ${key} (written id ${written.id})`);
  }
  const cleared = await deps.resolveByKey(failKey, `verdict alert ${written.id} written on ${key}`);
  deps.log(`${LOG} RAN-AND-WROTE state=${outcome.state} alert=${written.id} key=${key} reviewed_refs=${reviewedRefs.length}`
    + ` cleared_failures=${cleared.length} evidence=${evidenceFile}`);
  return 'ran-and-wrote';
}

async function readGovernedWindowStart(): Promise<Date> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const client = new Client({ connectionString: process.env.DATABASE_URL, application_name: 'xstock-bar-verdict-runner' });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '30s'");
    const { rows } = await client.query(
      `SELECT value #>> '{}' AS start FROM module_constants
        WHERE module_name='xstock_bar_availability' AND constant_name='graded_window_start'
          AND ${WILDCARD_SCOPE_SQL}`,
    );
    if (rows.length !== 1) throw new Error(`expected exactly one governed graded_window_start row, found ${rows.length}`);
    const start = new Date(String(rows[0].start));
    if (!Number.isFinite(start.getTime())) throw new Error('governed graded_window_start is not a timestamp');
    return start;
  } finally {
    await client.end();
  }
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
  const dir = process.env.XSTOCK_VERDICT_DIR || '/var/log/dawntrader';
  const result = await runVerdictRunner({
    now: () => new Date(),
    readGovernedWindowStart,
    readGradedRef: () => readFile('dist/BUILD_SHA', 'utf8'),
    readReflog: () => execFileSync('git', ['reflog', '--date=iso-strict'], { encoding: 'utf8' }),
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
