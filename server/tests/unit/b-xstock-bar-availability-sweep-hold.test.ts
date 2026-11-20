/**
 * B-XSTOCK-BAR-AVAILABILITY R7b — the B75 sweep holds the revision partitions an open graded window
 * still needs, until that window's verdict exists. Pure plan + the sweep's injectable settle step.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  heldChildren,
  HOLD_ALERT_KEY_PREFIX,
  HOLD_CAP_ALERT_KEY_PREFIX,
  HOLD_CAP_PARTITIONS,
  holdAlertKey,
  holdCapAlertKey,
  overlapsRegisteredWindow,
  planRevisionHold,
  verdictKey,
  WINDOW_UNREADABLE_ALERT_KEY,
  XSTOCK_REVISION_PARENT,
  type HoldablePartition,
  type VerdictKeyState,
} from '../../services/data-archive/xstock-revision-verdict-hold.js';
import { settleRevisionHold, type PartitionRow, type RevisionHoldDependencies } from '../../scripts/b75-retention-sweep.js';
import { verdictKey as runnerVerdictKey, VERDICT_KEY_PREFIX as RUNNER_PREFIX } from '../../scripts/b-xstock-bar-availability-verdict-runner.js';

const START = new Date('2026-11-23T00:00:00.000Z');

function day(iso: string): PartitionRow {
  const rangeStart = new Date(`${iso}T00:00:00.000Z`);
  const rangeEnd = new Date(rangeStart.getTime() + 86_400_000);
  const label = iso;
  return {
    parent: XSTOCK_REVISION_PARENT,
    child: `${XSTOCK_REVISION_PARENT}_${iso.replace(/-/g, '_')}`,
    partitionLabel: label,
    rangeStart,
    rangeEnd,
  };
}

/** A readable window. The verdict state lives inside it (Langston Step-4 ruling 4). */
function win(verdictState: VerdictKeyState = 'absent') {
  return { ok: true as const, start: START, verdictState };
}

describe('R7b plan — planRevisionHold', () => {
  it('does not apply to any other table', () => {
    const plan = planRevisionHold({ parent: 'xstock_spot_ticker_snap', eligible: [day('2026-11-23')], window: win() });
    expect(plan.kind).toBe('not-applicable');
    expect(heldChildren(plan).size).toBe(0);
  });

  it('holds in-window partitions while the verdict key is absent, newest first', () => {
    const eligible = [day('2026-11-23'), day('2026-11-24')];
    const plan = planRevisionHold({ parent: XSTOCK_REVISION_PARENT, eligible, window: win() });
    expect(plan.kind).toBe('hold');
    if (plan.kind !== 'hold') return;
    expect(plan.held.map((p) => p.partitionLabel)).toEqual(['2026-11-24', '2026-11-23']);
    expect(plan.capReleased).toEqual([]);
  });

  it('never holds a partition outside [start, start + 9 days)', () => {
    const eligible = [day('2026-11-21'), day('2026-11-22'), day('2026-12-02')];
    const plan = planRevisionHold({ parent: XSTOCK_REVISION_PARENT, eligible, window: win() });
    expect(plan).toMatchObject({ kind: 'no-hold', verdictPresent: false });
  });

  it('the window edges: the last in-window day is held, the first day after is not', () => {
    expect(overlapsRegisteredWindow(day('2026-12-01'), START)).toBe(true);
    expect(overlapsRegisteredWindow(day('2026-12-02'), START)).toBe(false);
    expect(overlapsRegisteredWindow(day('2026-11-22'), START)).toBe(false);
    expect(overlapsRegisteredWindow(day('2026-11-23'), START)).toBe(true);
  });

  it('a partition straddling the window start (monthly child) counts as in the window', () => {
    const month: HoldablePartition = {
      child: 'xstock_bar_revision_event_2026_11',
      partitionLabel: '2026-11',
      rangeStart: new Date('2026-11-01T00:00:00.000Z'),
      rangeEnd: new Date('2026-12-01T00:00:00.000Z'),
    };
    expect(overlapsRegisteredWindow(month, START)).toBe(true);
  });

  it(`caps the hold at ${HOLD_CAP_PARTITIONS} partitions: the OLDEST in-window partitions are released`, () => {
    expect(HOLD_CAP_PARTITIONS).toBe(3);
    const eligible = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'].map(day);
    const plan = planRevisionHold({ parent: XSTOCK_REVISION_PARENT, eligible, window: win() });
    expect(plan.kind).toBe('hold');
    if (plan.kind !== 'hold') return;
    expect(plan.held.map((p) => p.partitionLabel)).toEqual(['2026-11-27', '2026-11-26', '2026-11-25']);
    expect(plan.capReleased.map((p) => p.partitionLabel)).toEqual(['2026-11-24', '2026-11-23']);
    expect([...heldChildren(plan)]).toHaveLength(HOLD_CAP_PARTITIONS);
  });

  it.each(['nonterminal', 'resolved'] as const)('ANY verdict state (%s) ends the hold — it guards the read, never the result', (state) => {
    const plan = planRevisionHold({ parent: XSTOCK_REVISION_PARENT, eligible: [day('2026-11-23')], window: win(state) });
    expect(plan).toMatchObject({ kind: 'no-hold', verdictPresent: true });
    expect(heldChildren(plan).size).toBe(0);
  });

  it('window unreadable: holds EVERY eligible revision partition (fail closed for this table only)', () => {
    const eligible = [day('2026-10-01'), day('2026-11-23')];
    const plan = planRevisionHold({
      parent: XSTOCK_REVISION_PARENT,
      eligible,
      window: { ok: false, reason: 'found 0 rows' },
    });
    expect(plan.kind).toBe('window-unreadable');
    expect(heldChildren(plan)).toEqual(new Set(eligible.map((p) => p.child)));
  });

  it('the runner writes on exactly the key the sweep guards (one definition, no drift)', () => {
    expect(runnerVerdictKey(START)).toBe(verdictKey(START));
    expect(RUNNER_PREFIX).toBe('xstock-bar-availability-capacity-verdict:');
    expect(verdictKey(START)).toBe('xstock-bar-availability-capacity-verdict:2026-11-23T00:00:00.000Z');
  });
});

function fakeDeps(over: Partial<RevisionHoldDependencies> = {}) {
  const raised: Array<{ title: string; severity: string; metadata: Record<string, unknown>; key: string; category: string | undefined }> = [];
  const resolved: string[] = [];
  const otherWindows: Array<{ prefix: string; keepKey: string }> = [];
  const lines: string[] = [];
  const readWindowStart = vi.fn(async () => ({ ok: true, start: START }) as { ok: true; start: Date } | { ok: false; reason: string });
  const deps: RevisionHoldDependencies = {
    readWindowStart,
    verdictState: () => 'absent',
    raiseAlert: async (title, _body, severity, metadata, key, category) => {
      raised.push({ title, severity, metadata, key, category });
    },
    resolveAlerts: async (keys) => {
      resolved.push(...keys);
    },
    resolveOtherWindows: async (prefix, keepKey) => {
      otherWindows.push({ prefix, keepKey });
    },
    log: (line) => lines.push(line),
    ...over,
  };
  return { deps, raised, resolved, otherWindows, lines, readWindowStart };
}

describe('R7b settle step — settleRevisionHold', () => {
  it('reads nothing and does nothing for any other table', async () => {
    const f = fakeDeps();
    const plan = await settleRevisionHold('xstock_spot_ticker_snap', [day('2026-11-23')], f.deps);
    expect(plan.kind).toBe('not-applicable');
    expect(f.readWindowStart).not.toHaveBeenCalled();
    expect(f.raised).toEqual([]);
    expect(f.resolved).toEqual([]);
    expect(f.otherWindows).toEqual([]);
  });

  it('hold: one HELD line per held partition, a warning on the hold key owned by this batch', async () => {
    const f = fakeDeps();
    const plan = await settleRevisionHold(XSTOCK_REVISION_PARENT, [day('2026-11-23'), day('2026-11-24')], f.deps);
    expect(plan.kind).toBe('hold');
    expect(f.lines.filter((l) => l.includes(': HELD — inside graded window'))).toHaveLength(2);
    expect(f.lines[0]).toContain('(held 1 of cap 3)');
    expect(f.raised).toHaveLength(1);
    expect(f.raised[0]).toMatchObject({ severity: 'warning', key: holdAlertKey(START) });
    expect(f.raised[0].metadata.batch).toBe('B-XSTOCK-BAR-AVAILABILITY');
    expect(f.resolved).toEqual([WINDOW_UNREADABLE_ALERT_KEY]);
  });

  it('cap reached: a CRITICAL on the cap key naming the released partitions', async () => {
    const f = fakeDeps();
    await settleRevisionHold(
      XSTOCK_REVISION_PARENT,
      ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map(day),
      f.deps,
    );
    const cap = f.raised.find((r) => r.key === holdCapAlertKey(START));
    expect(cap).toMatchObject({ severity: 'critical' });
    expect(cap?.metadata.released).toEqual(['2026-11-23']);
  });

  it('every hold raise uses the non-breakage category (Step-4 fold-in d)', async () => {
    const f = fakeDeps();
    await settleRevisionHold(XSTOCK_REVISION_PARENT, ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map(day), f.deps);
    const u = fakeDeps({ readWindowStart: async () => ({ ok: false, reason: 'found 0 rows' }) });
    await settleRevisionHold(XSTOCK_REVISION_PARENT, [day('2026-11-23')], u.deps);
    const all = [...f.raised, ...u.raised];
    expect(all.map((r) => r.key).sort()).toEqual([holdAlertKey(START), holdCapAlertKey(START), WINDOW_UNREADABLE_ALERT_KEY].sort());
    for (const r of all) expect(r.category).toBe('verification');
  });

  it('verdict exists: no hold, BOTH the hold key and the cap key are resolved', async () => {
    const f = fakeDeps({ verdictState: () => 'resolved' });
    const plan = await settleRevisionHold(XSTOCK_REVISION_PARENT, [day('2026-11-23')], f.deps);
    expect(plan.kind).toBe('no-hold');
    expect(f.raised).toEqual([]);
    expect(f.resolved).toEqual([WINDOW_UNREADABLE_ALERT_KEY, holdAlertKey(START), holdCapAlertKey(START)]);
  });

  it('nothing in window and no verdict: the hold key clears, the cap key STAYS (a cap release is a permanent loss)', async () => {
    const f = fakeDeps();
    const plan = await settleRevisionHold(XSTOCK_REVISION_PARENT, [day('2026-11-01')], f.deps);
    expect(plan).toMatchObject({ kind: 'no-hold', verdictPresent: false });
    expect(f.resolved).toEqual([WINDOW_UNREADABLE_ALERT_KEY, holdAlertKey(START)]);
    expect(f.resolved).not.toContain(holdCapAlertKey(START));
  });

  it.each([
    ['hold', () => 'absent' as const, [day('2026-11-23')]],
    ['verdict exists', () => 'resolved' as const, [day('2026-11-23')]],
    ['nothing in window', () => 'absent' as const, [day('2026-11-01')]],
  ])('%s: older-window hold and cap rows are cleared, keeping the current window\'s keys (#1074 class)', async (_name, verdictState, eligible) => {
    const f = fakeDeps({ verdictState });
    await settleRevisionHold(XSTOCK_REVISION_PARENT, eligible, f.deps);
    expect(f.otherWindows).toEqual([
      { prefix: HOLD_ALERT_KEY_PREFIX, keepKey: holdAlertKey(START) },
      { prefix: HOLD_CAP_ALERT_KEY_PREFIX, keepKey: holdCapAlertKey(START) },
    ]);
  });

  it('window unreadable: holds everything, CRITICAL on the unreadable key, never throws, clears nothing', async () => {
    const f = fakeDeps({ readWindowStart: async () => ({ ok: false, reason: 'expected exactly one row, found 0' }) });
    const plan = await settleRevisionHold(XSTOCK_REVISION_PARENT, [day('2026-10-01'), day('2026-11-23')], f.deps);
    expect(plan.kind).toBe('window-unreadable');
    expect(heldChildren(plan).size).toBe(2);
    expect(f.raised).toEqual([expect.objectContaining({ severity: 'critical', key: WINDOW_UNREADABLE_ALERT_KEY })]);
    expect(f.resolved).toEqual([]);
    expect(f.otherWindows).toEqual([]);
  });

  it('alert store unreadable: treated as no verdict, so the in-window partitions stay held', async () => {
    const f = fakeDeps({ verdictState: () => { throw new Error('EACCES'); } });
    const plan = await settleRevisionHold(XSTOCK_REVISION_PARENT, [day('2026-11-23')], f.deps);
    expect(plan.kind).toBe('hold');
    expect(f.lines[0]).toContain('verdict-key read failed (EACCES)');
  });
});

describe('R7d: a night with NO eligible revision partition still settles the hold keys', () => {
  it('readable window, no verdict, nothing eligible: the hold key clears, the cap key stays', async () => {
    const f = fakeDeps();
    const plan = await settleRevisionHold(XSTOCK_REVISION_PARENT, [], f.deps);
    expect(plan).toMatchObject({ kind: 'no-hold', verdictPresent: false });
    expect(f.readWindowStart).toHaveBeenCalledTimes(1);
    expect(f.raised).toEqual([]);
    expect(f.resolved).toEqual([WINDOW_UNREADABLE_ALERT_KEY, holdAlertKey(START)]);
  });

  it('readable window, verdict present, nothing eligible: both the hold and cap keys clear', async () => {
    const f = fakeDeps({ verdictState: () => 'resolved' });
    const plan = await settleRevisionHold(XSTOCK_REVISION_PARENT, [], f.deps);
    expect(plan).toMatchObject({ kind: 'no-hold', verdictPresent: true });
    expect(f.resolved).toEqual([WINDOW_UNREADABLE_ALERT_KEY, holdAlertKey(START), holdCapAlertKey(START)]);
  });

  it('window unreadable with nothing eligible: nothing held, NO critical raised, and the unreadable key is NOT resolved', async () => {
    const f = fakeDeps({ readWindowStart: async () => ({ ok: false, reason: 'found 0 rows' }) });
    const plan = await settleRevisionHold(XSTOCK_REVISION_PARENT, [], f.deps);
    expect(plan.kind).toBe('window-unreadable');
    expect(heldChildren(plan).size).toBe(0);
    expect(f.raised).toEqual([]);
    expect(f.resolved).toEqual([]);
    expect(f.otherWindows).toEqual([]);
    expect(f.lines.some((l) => l.includes('no eligible partition, nothing held'))).toBe(true);
  });

  it('the sweep settles the hold BEFORE it skips a table with no old partitions', () => {
    const src = fs.readFileSync(new URL('../../scripts/b75-retention-sweep.ts', import.meta.url), 'utf8');
    const settle = src.indexOf('const held = heldChildren(await settleRevisionHold(spec.parent, oldPartitions));');
    expect(settle).toBeGreaterThan(0);
    const empty = src.indexOf('if (oldPartitions.length === 0)', settle);
    expect(empty).toBeGreaterThan(settle);
    expect(src.lastIndexOf('if (oldPartitions.length === 0)', settle)).toBeLessThan(src.lastIndexOf('for (const spec', settle));
    expect(src.match(/settleRevisionHold\(spec\.parent/g)).toHaveLength(1);
  });
});

describe('R7b wiring in the sweep loop', () => {
  const src = fs.readFileSync(new URL('../../scripts/b75-retention-sweep.ts', import.meta.url), 'utf8');

  it('the loop skips a held child, counting it as held and NOT as examined, before it is processed', () => {
    const loop = src.slice(src.indexOf('const held = heldChildren(await settleRevisionHold('));
    const skip = loop.indexOf('if (held.has(partition.child)) { partitionsHeld++; continue; }');
    const examined = loop.indexOf('partitionsExamined++');
    const process = loop.indexOf('processPartitionAndSettle(spec, partition, cfg)');
    expect(skip).toBeGreaterThan(0);
    expect(examined).toBeGreaterThan(skip);
    expect(process).toBeGreaterThan(skip);
  });

  it('the fenced started and DONE lines are untouched (B-DISK-FILE-TIERING AP-7); held= is appended at the end', () => {
    expect(src).toContain('`[B75 sweep] started at ${startedAt.toISOString()} run_id=');
    expect(src).toContain('[B75 sweep] DONE — examined=');
    expect(src).toContain('`snapshot_failed=${snapshotFailed} duration_ms=${totalMs} held=${partitionsHeld}`');
  });

  it('the storage-health DONE reader still matches a DONE line carrying held=', () => {
    const health = fs.readFileSync(new URL('../../scripts/b-storage-archival-health.ts', import.meta.url), 'utf8');
    expect(health).toContain(String.raw`donePattern: /DONE .*\bfailed=(\d+)\b.*\bplain_failed=(\d+)\b.*\bsnapshot_failed=(\d+)\b/,`);
    const donePattern = /DONE .*\bfailed=(\d+)\b.*\bplain_failed=(\d+)\b.*\bsnapshot_failed=(\d+)\b/;
    const line = '[B75 sweep] DONE — examined=4 dropped=3 failed=0 bytes_freed=1 bytes_archived=1 plain_deleted=0 '
      + 'plain_failed=0 snapshot_deleted=0 snapshot_failed=0 duration_ms=1200 held=2';
    expect(donePattern.exec(line)?.slice(1)).toEqual(['0', '0', '0']);
  });
});
