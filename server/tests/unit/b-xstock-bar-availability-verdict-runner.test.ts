/**
 * B-XSTOCK-BAR-AVAILABILITY R7 — fences for the unattended verdict runner (Langston C6 ruling, C-1..C-3).
 * Every I/O edge is injected, so these run without a database, a git clone or the alert file.
 */
import { describe, expect, it } from 'vitest';
import {
  FINAL_GATE_OFFSET_MS,
  buildVerdictAlert,
  classifyGateExit,
  decide,
  deployRefsFromReflog,
  finalGateAt,
  runVerdictRunner,
  runnerFailureKey,
  verdictKey,
  verdictReadBack,
  type RunnerDeps,
} from '../../scripts/b-xstock-bar-availability-verdict-runner.js';
import type { AddAlertOptions, AlertDedupeState, SystemAlert } from '../../services/system-alerts.js';
import { ALERT_ACTORS } from '../../services/system-alerts.js';

const START = new Date('2026-11-23T00:00:00.000Z');
const SHA = (c: string) => c.repeat(40);

function reflogLine(short: string, iso: string, sha: string): string {
  return `${short} HEAD@{${iso}}: reset: moving to ${sha}`;
}

function passEvidence(state: 'pass' | 'fail' = 'pass'): string {
  return JSON.stringify({
    window: {
      start: START.toISOString(),
      elapsedSeconds: 777_600,
      completeUtcCalendarDays: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
        '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01'],
    },
    population: { revision_events: 4321, symbols: 58 },
    venueSessions: [{ continuity_pass: true }, { continuity_pass: true }, { continuity_pass: false }],
    readElapsedMs: 471_843,
    verdict: {
      state,
      pass: state === 'pass',
      checks: { allContributingBuildsReviewed: true, revisionEventsAtLeast: state === 'pass' },
      reserves: { revision_events: 12 },
      runTiming: { totalMs: 480_000 },
    },
  });
}

describe('window arithmetic and keys', () => {
  it('final_gate_at is start + 9 days + 10 minutes', () => {
    expect(FINAL_GATE_OFFSET_MS).toBe(9 * 86_400_000 + 600_000);
    expect(finalGateAt(START).toISOString()).toBe('2026-12-02T00:10:00.000Z');
  });
  it('keys carry the exact window start', () => {
    expect(verdictKey(START)).toBe('xstock-bar-availability-capacity-verdict:2026-11-23T00:00:00.000Z');
    expect(runnerFailureKey(START)).toBe('xstock-bar-availability-verdict-runner-failed:2026-11-23T00:00:00.000Z');
  });
  it('the runner actor is a canonical machine actor', () => {
    const row = ALERT_ACTORS.find((a) => a.value === 'xstock-bar-verdict-runner');
    expect(row?.tag).toBe('machine');
  });
});

describe('decide (C-3: daily and idempotent from final_gate_at until a verdict exists)', () => {
  const due = finalGateAt(START);
  it('before final_gate_at it does not run, whatever the alert state', () => {
    expect(decide(new Date(due.getTime() - 1), START, 'absent').action).toBe('not-due');
  });
  it('at and after final_gate_at with no verdict it runs', () => {
    expect(decide(due, START, 'absent').action).toBe('run');
    expect(decide(new Date(due.getTime() + 5 * 86_400_000), START, 'absent').action).toBe('run');
  });
  it('any stored verdict — open or resolved — ends the work', () => {
    expect(decide(due, START, 'nonterminal').action).toBe('verdict-exists');
    expect(decide(due, START, 'resolved').action).toBe('verdict-exists');
  });
});

describe('deployRefsFromReflog (the reviewed-ref claim)', () => {
  const reflog = [
    reflogLine('ccc1111', '2026-11-25T10:00:00+00:00', SHA('c')),
    'ddd2222 HEAD@{2026-11-24T09:00:00+00:00}: pull: Fast-forward',
    reflogLine('bbb1111', '2026-11-22T20:00:00+00:00', SHA('b')),
    reflogLine('aaa1111', '2026-11-20T20:00:00+00:00', SHA('a')),
  ].join('\n');
  it('keeps every in-window reset plus only the NEWEST one before the window', () => {
    expect(deployRefsFromReflog(reflog, START)).toEqual([SHA('b'), SHA('c')]);
  });
  it('ignores non-reset entries', () => {
    expect(deployRefsFromReflog(reflog, START)).not.toContain(SHA('d'));
  });
  it('a reset exactly at the window start counts as in-window, and the one before still opens it', () => {
    const r = [reflogLine('eee', '2026-11-23T00:00:00+00:00', SHA('e')), reflogLine('bbb', '2026-11-22T20:00:00+00:00', SHA('b'))].join('\n');
    expect(deployRefsFromReflog(r, START)).toEqual([SHA('b'), SHA('e')]);
  });
  it('REFUSES when the reflog does not reach back before the window start', () => {
    expect(() => deployRefsFromReflog(reflogLine('ccc', '2026-11-25T10:00:00+00:00', SHA('c')), START))
      .toThrow(/does not reach back/);
    expect(() => deployRefsFromReflog('', START)).toThrow(/does not reach back/);
  });
});

describe('classifyGateExit (a verdict needs the exit code AND a matching verdict.state)', () => {
  it('exit 0 / pass, 2 / fail, 3 / inconclusive are verdicts', () => {
    expect(classifyGateExit(0, null, passEvidence('pass'))).toMatchObject({ kind: 'verdict', state: 'pass' });
    expect(classifyGateExit(2, null, passEvidence('fail'))).toMatchObject({ kind: 'verdict', state: 'fail' });
    const inc = JSON.stringify({ verdict: { state: 'inconclusive', pass: false, leg: 'population', reason: 'budget', runTiming: {} } });
    expect(classifyGateExit(3, null, inc)).toMatchObject({ kind: 'verdict', state: 'inconclusive' });
  });
  it('exit 1, an unknown exit, a signal or a null code are NO verdict', () => {
    expect(classifyGateExit(1, null, '{}').kind).toBe('no-verdict');
    expect(classifyGateExit(7, null, passEvidence()).kind).toBe('no-verdict');
    expect(classifyGateExit(null, 'SIGKILL', passEvidence()).kind).toBe('no-verdict');
    expect(classifyGateExit(null, null, passEvidence()).kind).toBe('no-verdict');
  });
  it('an exit/state mismatch or unparseable stdout is NO verdict', () => {
    expect(classifyGateExit(0, null, passEvidence('fail'))).toMatchObject({ kind: 'no-verdict', reason: expect.stringMatching(/expects pass/) });
    expect(classifyGateExit(0, null, 'not json').kind).toBe('no-verdict');
  });
});

describe('buildVerdictAlert (C-1 key + one-shot, C-2 checks and headline in metadata)', () => {
  const ctx = {
    windowStart: START, finalGateAt: finalGateAt(START), gradedRef: SHA('f'), reviewedRefs: [SHA('b'), SHA('f')],
    evidenceFile: '/var/log/dawntrader/x.json', runAt: new Date('2026-12-02T00:15:00.000Z'),
  };
  it('PASS is info, one-shot, on the verdict key, with the full checks and the day count', () => {
    const out = classifyGateExit(0, null, passEvidence('pass'));
    if (out.kind !== 'verdict') throw new Error('expected verdict');
    const a = buildVerdictAlert(out, ctx);
    expect(a.severity).toBe('info');
    expect(a.one_shot).toBe(true);
    expect(a.dedupe_key).toBe(verdictKey(START));
    expect(a.metadata?.checks).toEqual({ allContributingBuildsReviewed: true, revisionEventsAtLeast: true });
    expect(a.metadata?.reviewed_refs_source).toBe('dt-deploy-reflog');
    expect(a.metadata?.headline).toMatchObject({ complete_utc_days: 9, days_beyond_registered: 0, complete_venue_sessions: 2, revision_events: 4321 });
    expect(a.metadata?.run_timing).toEqual({ totalMs: 480_000 });
  });
  it('FAIL is a warning and names the failed checks', () => {
    const out = classifyGateExit(2, null, passEvidence('fail'));
    if (out.kind !== 'verdict') throw new Error('expected verdict');
    const a = buildVerdictAlert(out, ctx);
    expect(a.severity).toBe('warning');
    expect(a.metadata?.failed_checks).toEqual(['revisionEventsAtLeast']);
  });
  it('INCONCLUSIVE is a warning carrying the leg and reason, with no day counts', () => {
    const out = classifyGateExit(3, null, JSON.stringify({ verdict: { state: 'inconclusive', pass: false, leg: 'population', reason: 'budget', runTiming: { totalMs: 1 } } }));
    if (out.kind !== 'verdict') throw new Error('expected verdict');
    const a = buildVerdictAlert(out, ctx);
    expect(a.severity).toBe('warning');
    expect(a.metadata?.inconclusive).toEqual({ leg: 'population', reason: 'budget' });
    expect((a.metadata?.headline as Record<string, unknown>).complete_utc_days).toBeNull();
  });
});

function alertRow(opts: AddAlertOptions, id: string): SystemAlert {
  return {
    schema_version: 1, id, created_at: '2026-12-02T00:15:00.000Z', triggers_at: String(opts.triggers_at),
    fired_at: null, acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by_claimed: null,
    resolved_by_transport: null, resolution_evidence: null, state: 'scheduled', category: opts.category as SystemAlert['category'],
    severity: opts.severity, title: opts.title, body: opts.body, metadata: opts.metadata ?? {},
    recurrence_interval_seconds: null, dedupe_key: opts.dedupe_key,
  } as SystemAlert;
}

function harness(over: Partial<RunnerDeps> & { gate?: { code: number | null; signal: string | null; stdout: string } } = {}) {
  const store: SystemAlert[] = [];
  const logs: string[] = [];
  const resolved: string[] = [];
  let gateCalls = 0;
  const deps: RunnerDeps = {
    now: () => new Date('2026-12-02T00:15:00.000Z'),
    readGovernedWindowStart: async () => START,
    readGradedRef: async () => `${SHA('f')}\n`,
    readReflog: () => [reflogLine('fff', '2026-11-22T20:00:00+00:00', SHA('f'))].join('\n'),
    runGate: async () => { gateCalls += 1; return { ...(over.gate ?? { code: 0, signal: null, stdout: passEvidence('pass') }), stderr: '' }; },
    writeEvidence: async (name) => `/tmp/${name}`,
    dedupeState: (key): AlertDedupeState => (store.some((a) => a.dedupe_key === key) ? 'nonterminal' : 'absent'),
    addAlert: async (opts) => { const row = alertRow(opts, `id-${store.length + 1}`); store.push(row); return row; },
    readAllAlerts: () => store,
    resolveByKey: async (key) => { resolved.push(key); return []; },
    log: (l) => logs.push(l),
    ...over,
  };
  return { deps, store, logs, resolved, gateCalls: () => gateCalls };
}

describe('runVerdictRunner (end to end with injected edges)', () => {
  it('not due ⇒ skips without running the gate', async () => {
    const h = harness({ now: () => new Date('2026-12-02T00:09:59.000Z') });
    expect(await runVerdictRunner(h.deps)).toBe('skipped-not-due');
    expect(h.gateCalls()).toBe(0);
    expect(h.logs[0]).toMatch(/SKIPPED not-due/);
  });
  it('due ⇒ runs once, writes the verdict, reads it back, clears the failure key; a second run skips', async () => {
    const h = harness();
    expect(await runVerdictRunner(h.deps)).toBe('ran-and-wrote');
    expect(h.store).toHaveLength(1);
    expect(h.store[0].dedupe_key).toBe(verdictKey(START));
    expect(h.resolved).toEqual([runnerFailureKey(START)]);
    expect(h.logs.at(-1)).toMatch(/RAN-AND-WROTE state=pass/);
    expect(await runVerdictRunner(h.deps)).toBe('skipped-verdict-exists');
    expect(h.gateCalls()).toBe(1);
  });
  it('gate exit 1 ⇒ no verdict, a warning on the failure key, never the verdict key', async () => {
    const h = harness({ gate: { code: 1, signal: null, stdout: '' } });
    expect(await runVerdictRunner(h.deps)).toBe('ran-no-verdict');
    expect(h.store).toHaveLength(1);
    expect(h.store[0].dedupe_key).toBe(runnerFailureKey(START));
    expect(h.store[0].severity).toBe('warning');
    expect(h.resolved).toEqual([]);
  });
  it('a reflog that does not reach back ⇒ no verdict, and the gate is never run', async () => {
    const h = harness({ readReflog: () => reflogLine('ccc', '2026-11-25T10:00:00+00:00', SHA('c')) });
    expect(await runVerdictRunner(h.deps)).toBe('ran-no-verdict');
    expect(h.gateCalls()).toBe(0);
    expect(h.store[0].metadata.reason).toMatch(/does not reach back/);
  });
  it('a malformed BUILD_SHA ⇒ no verdict', async () => {
    const h = harness({ readGradedRef: async () => 'abc' });
    expect(await runVerdictRunner(h.deps)).toBe('ran-no-verdict');
    expect(h.gateCalls()).toBe(0);
  });
  it('a failed read-back throws rather than printing RAN-AND-WROTE', async () => {
    const h = harness({ readAllAlerts: () => [] });
    await expect(runVerdictRunner(h.deps)).rejects.toThrow(/read-back failed/);
    expect(h.logs.some((l) => l.includes('RAN-AND-WROTE'))).toBe(false);
  });
});

describe('verdictReadBack', () => {
  it('requires exactly one row on the key, with the written id and the same state', () => {
    const row = alertRow({ triggers_at: 'x', category: 'verification', severity: 'info', title: 't', body: 'b', metadata: { state: 'pass' }, dedupe_key: 'k' }, 'id-1');
    expect(verdictReadBack([row], 'k', row, 'pass')).toBe(true);
    expect(verdictReadBack([row], 'k', row, 'fail')).toBe(false);
    expect(verdictReadBack([row, { ...row, id: 'id-2' }], 'k', row, 'pass')).toBe(false);
  });
});
