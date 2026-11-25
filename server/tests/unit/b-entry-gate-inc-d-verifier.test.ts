import { describe, expect, it } from 'vitest';
import { mkdtemp, unlink, writeFile, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEvidence, verifyEntryGateWindow } from '../../../scripts/analysis/b-entry-gate-inc-d.mjs';

const start = Date.parse('2026-12-07T14:30:00Z');
const end = Date.parse('2026-12-07T21:00:00Z');
const processId = '41:1796640000000';
type Record = { kind: string; [key: string]: string | number };

function fixture() {
  const records: Record[] = [];
  const health: { at: number; tickNumber: number; subscribers: number }[] = [];
  const emit = (kind: string, at: number, details: Omit<Record, 'kind'> = {}) => {
    records.push({ kind, window: start, processId, at, ...details });
  };
  const first = start - 120_000;
  const cutoff = end + 900_000;
  emit('window_start', first, { end, tickNumber: 60, scanSequence: 16 });
  for (let at = first, tickNumber = 60; at <= cutoff; at += 15_000, tickNumber += 15) {
    if (at === cutoff) emit('window_end', at, { tickNumber, scanSequence: 18 });
    emit('tick', at, { tickNumber });
    if (tickNumber % 60 === 0) health.push({ at, tickNumber, subscribers: 5 });
    if (at < start || at >= end) continue;
    if (at === start + 15_000) {
      emit('cycle_busy', at, { tickNumber });
      continue;
    }
    emit('cycle_start', at, { tickNumber });
    emit('snapshot', at, { tickNumber, queryStartedAt: at + 1, observedAt: at + 12, elapsedMs: 18, monotonicElapsedMs: 19,
      crypto: at === start ? 1 : 0, xstock: 67 });
  }
  const scan = { instance: 4, scan: 17, origin: 'active_portfolio', mode: 'paper', assetClass: 'crypto_spot' };
  emit('scan_start', start, scan);
  const attempts: { strategy: string; lane: string; symbol: string; events: [string, Omit<Record, 'kind'>?][] }[] = [
    { strategy: 'inside_bar_reversal', lane: 'direct', symbol: 'AA/USD',
      events: [['detector_enter'], ['evaluation_end', { outcome: 'no_candidate' }]] },
    { strategy: 'reverse_impulse', lane: 'direct', symbol: 'BB/USD',
      events: [['detector_enter'], ['sizing_enter'], ['target_refused', { reason: 'unreachable' }],
        ['evaluation_end', { outcome: 'build_refused' }]] },
    { strategy: 'inside_bar_reversal', lane: 'pattern_parent', symbol: 'CC/USD',
      events: [['evaluation_end', { outcome: 'matched', children: 1 }]] },
    { strategy: 'inside_bar_reversal', lane: 'pattern', symbol: 'CC/USD',
      events: [['sizing_enter'], ['target_pass'], ['rtb_call'], ['evaluation_end', { outcome: 'built' }],
        ['rtb_refused', { reason: 'class_inactive' }]] },
    { strategy: 'strong_bull_trend', lane: 'hybrid', symbol: 'DD/USD',
      events: [['sizing_enter'], ['target_pass'], ['rtb_call'], ['upsert_attempt'],
        ['evaluation_end', { outcome: 'built' }], ['upsert_committed', { rowId: 'existing-row', storedSymbol: 'DD/USD' }],
        ['rtb_error']] },
    { strategy: 'strong_bull_trend', lane: 'direct', symbol: 'EE/USD',
      events: [['detector_enter'], ['sizing_enter'], ['target_pass'], ['rtb_call'], ['upsert_attempt'],
        ['upsert_failed', { sqlState: '23514' }], ['rtb_error'], ['evaluation_end', { outcome: 'built' }]] },
    { strategy: 'strong_bull_trend', lane: 'hybrid', symbol: 'FF/USD',
      events: [['sizing_enter'], ['target_pass'], ['rtb_call'], ['rtb_error'], ['evaluation_end', { outcome: 'build_error' }]] },
  ];
  for (const { strategy, lane, symbol, events } of attempts) {
    const evaluation = { ...scan, strategy, lane, symbol, ordinal: 0,
      id: JSON.stringify([scan.instance, scan.scan, lane, symbol, strategy, 0]) };
    emit('census', start + 1, evaluation);
    const targetVerdict = events.find(([kind]) => ['target_pass', 'target_refused'].includes(kind))?.[0] ?? 'not_reached';
    const rtbCalls = events.filter(([kind]) => kind === 'rtb_call').length;
    const upsertOutcome = events.find(([kind]) => ['upsert_committed', 'upsert_failed'].includes(kind))?.[0] ?? 'not_attempted';
    for (const [index, [kind, details]] of events.entries()) {
      const terminal = kind === 'evaluation_end' ? { targetVerdict, rtbCalls }
        : ['rtb_error', 'rtb_refused', 'rtb_returned'].includes(kind) ? { upsertOutcome } : {};
      emit(kind, start + 2 + index, { ...evaluation, ...details, ...terminal });
    }
  }
  const expected: { [key: string]: number } = {};
  for (const { lane, strategy } of attempts) {
    const key = `${lane}:${strategy}`;
    expected[key] = (expected[key] ?? 0) + 1;
  }
  emit('scan_end', start + 40, { ...scan, outcome: 'complete', expected: JSON.stringify(expected) });
  emit('scan_start', start + 60_000, { ...scan, scan: 18 });
  emit('scan_end', start + 60_001, { ...scan, scan: 18, outcome: 'empty_fx5', expected: '{}' });
  return { records, health, lifecycle: [] as number[], start, end, processId, maxSnapshotLagMs: 200 };
}

describe('Entry Gate increment D fixed-session reconciliation', () => {
  it('measures the entire started population, including explicit zeroes, and retains a confirmed write through a later error', () => {
    const result = verifyEntryGateWindow(fixture());
    expect(result.errors).toEqual([]);
    expect(result.clock).toMatchObject({
      eligible: 1560, started: 1559, busy: 1, verifiedSnapshots: 1559, medians: { crypto: 0, xstock: 67 },
    });
    expect(result.opportunities.totals.reverse_impulse.direct).toMatchObject({ targetRefused: 1, rtbCalls: 0, commits: 0 });
    expect(result.opportunities.totals.inside_bar_reversal.pattern).toMatchObject({
      targetJudged: 1, rtbCalls: 1, commits: 0, outcomes: { rtb_refused: 1 },
    });
    expect(result.opportunities.totals.strong_bull_trend.hybrid).toMatchObject({
      commits: 1, outcomes: { post_commit_error: 1, pre_upsert_error: 1 },
    });
    expect(result.opportunities.totals.strong_bull_trend.direct).toMatchObject({ commits: 0, outcomes: { upsert_failed: 1 } });
  });

  it('fails when the aligned census tick and its entire refresh pair are both removed', () => {
    const input = fixture();
    input.records = input.records.filter(row => row.at !== start + 30_000);
    expect(verifyEntryGateWindow(input)).toMatchObject({ clock: { medians: null },
      errors: expect.arrayContaining([expect.stringContaining('Clock continuity failed')]) });
  });

  it('fails when a zero snapshot is omitted or the diagnostic query is busy or late', () => {
    const input = fixture();
    const sample = input.records.find(row => row.kind === 'snapshot' && row.at === start + 30_000)!;
    delete sample.crypto;
    expect(verifyEntryGateWindow(input).errors).toContain('Unusable snapshot for tick 210');
    sample.kind = 'snapshot_missing';
    sample.reason = 'observer_busy';
    expect(verifyEntryGateWindow(input).errors).toContain('Unusable snapshot for tick 210: observer_busy');
    sample.kind = 'snapshot';
    sample.crypto = 0;
    sample.observedAt = Number(sample.at) + 201;
    expect(verifyEntryGateWindow(input).clock.medians).toBeNull();
  });

  it.each([
    { statementLagMs: 199 },
    { startLagMs: 13 },
    { elapsedMs: 201 },
    { monotonicElapsedMs: 201 },
    { monotonicElapsedMs: 190 },
  ])('rejects physically inconsistent or late samples (%j)', changes => {
    const input = fixture();
    const sample = input.records.find(row => row.kind === 'snapshot' && row.at === start + 30_000)!;
    if (changes.statementLagMs !== undefined) sample.observedAt = Number(sample.at) + changes.statementLagMs;
    if (changes.startLagMs !== undefined) sample.queryStartedAt = Number(sample.at) + changes.startLagMs;
    sample.elapsedMs = changes.elapsedMs ?? sample.elapsedMs;
    sample.monotonicElapsedMs = changes.monotonicElapsedMs ?? sample.monotonicElapsedMs;
    expect(verifyEntryGateWindow(input).errors).toContain('Unusable snapshot for tick 210');
  });

  it('fails if a whole trace disappears after its independent census', () => {
    const input = fixture();
    input.records = input.records.filter(row => row.symbol !== 'AA/USD' || row.kind === 'census');
    expect(verifyEntryGateWindow(input).errors).toEqual(expect.arrayContaining([expect.stringContaining('terminal result')]));
  });

  it('uses the scan roster to reject a loss of both the census and the complete trace', () => {
    const input = fixture();
    input.records = input.records.filter(row => row.symbol !== 'AA/USD' && row.symbol !== 'CC/USD');
    expect(verifyEntryGateWindow(input).errors).toContain('Scan 17: census differs from its independent planned roster');
  });

  it.each([17, 18])('uses the window anchors to detect loss of the whole boundary scan %s', scan => {
    const input = fixture();
    input.records = input.records.filter(row => row.scan !== scan);
    expect(verifyEntryGateWindow(input).errors).toContain('Scan sequence differs from the registered window anchors');
  });

  it('fails if storage is suppressed, if commit precedes attempt, or if its acknowledgement is lost', () => {
    const omitted = fixture();
    omitted.records = omitted.records.filter(row => row.kind !== 'upsert_attempt' || row.symbol !== 'DD/USD');
    expect(verifyEntryGateWindow(omitted).errors).toEqual(expect.arrayContaining([expect.stringContaining('illegal evaluation')]));
    const reordered = fixture();
    const attempt = reordered.records.find(row => row.symbol === 'DD/USD' && row.kind === 'upsert_attempt')!;
    const commit = reordered.records.find(row => row.symbol === 'DD/USD' && row.kind === 'upsert_committed')!;
    [attempt.kind, commit.kind] = [commit.kind, attempt.kind];
    expect(verifyEntryGateWindow(reordered).errors).toEqual(expect.arrayContaining([expect.stringContaining('illegal evaluation')]));
    const lost = fixture();
    lost.records.find(row => row.symbol === 'DD/USD' && row.kind === 'upsert_committed')!.kind = 'upsert_unconfirmed';
    expect(verifyEntryGateWindow(lost).errors).toEqual(expect.arrayContaining([expect.stringContaining('write acknowledgement missing')]));
  });

  it('rejects a missing target verdict that would otherwise look like an early sizing refusal', () => {
    const input = fixture();
    input.records = input.records.filter(row => row.kind !== 'target_refused');
    expect(verifyEntryGateWindow(input).errors).toEqual(expect.arrayContaining([
      expect.stringContaining('terminal evidence disagrees with the observed target, RTB call or upsert outcome'),
    ]));
  });

  it.each(['upsert_committed', 'upsert_unconfirmed'])('rejects loss of the upsert attempt and %s when the RTB error survives', outcome => {
    const input = fixture();
    const result = input.records.find(row => row.symbol === 'DD/USD' && row.kind === 'upsert_committed')!;
    result.kind = outcome;
    input.records.find(row => row.symbol === 'DD/USD' && row.kind === 'rtb_error')!.upsertOutcome = outcome;
    input.records = input.records.filter(row => row.symbol !== 'DD/USD' || !['upsert_attempt', outcome].includes(row.kind));
    expect(verifyEntryGateWindow(input).errors).toEqual(expect.arrayContaining([
      expect.stringContaining('terminal evidence disagrees with the observed target, RTB call or upsert outcome'),
    ]));
  });

  it('rejects an orphan pattern child and a cross-class Ready-to-Buy call', () => {
    const input = fixture();
    input.records = input.records.filter(row => row.lane !== 'pattern_parent');
    input.records.find(row => row.symbol === 'DD/USD' && row.kind === 'rtb_call')!.assetClass = 'xstock_spot';
    expect(verifyEntryGateWindow(input).errors).toEqual(expect.arrayContaining([
      expect.stringContaining('pattern parent'),
      expect.stringContaining('inconsistent dispatch identity or cohort'),
    ]));
  });

  it('rejects a process swap, clock reset, or bounded-buffer loss', () => {
    const input = fixture();
    input.records.find(row => row.kind === 'snapshot')!.processId = '42:1796640000000';
    input.lifecycle.push(start + 1000);
    input.records.push({ kind: 'loss', at: start + 2100, dropped: 3 });
    expect(verifyEntryGateWindow(input).errors).toEqual(expect.arrayContaining([
      expect.stringContaining('Serving process changed'),
      'Evidence buffer reported loss',
    ]));
  });

  it('reads the existing PM2 clock timestamps and evidence across an ordered rotation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'entry-gate-d-'));
    const first = join(dir, 'rotated.log');
    const next = join(dir, 'out.log');
    try {
      await writeFile(first, '2026-12-07 14:29:03 +00:00: [CentralClock][HEALTH] tickNumber=180 avgDrift=1.0ms subscribers=5\n');
      await writeFile(next, '2026-12-07 14:30:03 +00:00: [B-ENTRY-GATE-D] {"kind":"tick","tickNumber":240}\n'
        + '2026-12-07 14:31:01 +00:00: [CentralClock] Stopped\n');
      expect(await readEvidence([first, next])).toEqual({
        records: [{ kind: 'tick', tickNumber: 240 }],
        health: [{ at: Date.parse('2026-12-07T14:29:03Z'), tickNumber: 180, subscribers: 5 }],
        lifecycle: [Date.parse('2026-12-07T14:31:01Z')],
      });
    } finally {
      await Promise.all([unlink(first), unlink(next)]);
      await rmdir(dir);
    }
  });
});
