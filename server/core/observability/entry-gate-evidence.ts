const GUARD_MS = 120_000;
const DRAIN_MS = 900_000;
const MAX_BUFFERED_RECORDS = 2048;
const MAX_DRAIN_BATCH = 64;
const ENTRY_GATE_REFRESH_TICKS = 15;
const ENTRY_GATE_EVIDENCE_PREFIX = '[B-ENTRY-GATE-D] ';

interface EvidenceWindow {
  start: number;
  end: number;
}

// The observation stays off until the deployment names its pre-registered UTC windows.
// Require absolute, non-overlapping bounds so a bad launch value cannot widen collection.
function parseWindows(value: string | undefined): EvidenceWindow[] {
  if (!value) return [];
  const intervals = value.split(',');
  if (intervals.length > 4) return [];
  const windows: EvidenceWindow[] = [];
  for (const interval of intervals) {
    const bounds = interval.split('/');
    if (bounds.length !== 2 || bounds.some(bound => !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(bound))) {
      return [];
    }
    const [start, end] = bounds.map(Date.parse);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== 6.5 * 3_600_000) return [];
    if (bounds.some((bound, index) => new Date(index === 0 ? start : end).toISOString() !== bound.replace(/Z$/, '.000Z'))) {
      return [];
    }
    if (windows.some(window => start - GUARD_MS < window.end + DRAIN_MS + GUARD_MS
      && end + DRAIN_MS + GUARD_MS > window.start - GUARD_MS)) {
      return [];
    }
    windows.push({ start, end });
  }
  return windows;
}

const windows = parseWindows(process.env.ENTRY_GATE_EVIDENCE_WINDOWS_UTC);
const processId = `${process.pid}:${Math.round(performance.timeOrigin)}`;
type EvidenceRecord = {
  kind: string;
  window: number;
  at: number;
  [field: string]: string | number | undefined;
};

const buffered: EvidenceRecord[] = [];
const dropped = new Map<number, { count: number; at: number }>();
let scheduled = false;
let waitingForDrain = false;

function scheduleDrain(): void {
  if (scheduled || waitingForDrain) return;
  scheduled = true;
  setImmediate(flushEvidence).unref();
}

function recordLoss(window: number, at: number, count: number): void {
  const prior = dropped.get(window);
  dropped.set(window, { count: (prior?.count ?? 0) + count, at: prior ? Math.min(prior.at, at) : at });
}

function flushEvidence(): void {
  scheduled = false;
  const batch = buffered.splice(0, MAX_DRAIN_BATCH);
  const loss = Array.from(dropped);
  dropped.clear();
  try {
    const lostRecords = loss.map(([window, { count, at }]) => ({ kind: 'loss', window, at, dropped: count }));
    const lines = [...lostRecords, ...batch].map(record => ENTRY_GATE_EVIDENCE_PREFIX + JSON.stringify({ processId, ...record }));
    if (lines.length && !process.stdout.write(lines.join('\n') + '\n')) {
      waitingForDrain = true;
      process.stdout.once('drain', () => {
        waitingForDrain = false;
        scheduleDrain();
      });
    }
  } catch {
    for (const [window, { count, at }] of loss) recordLoss(window, at, count);
    for (const record of batch) recordLoss(record.window, record.at, 1);
    return;
  }
  if (buffered.length) scheduleDrain();
}

function recordEvidence(record: EvidenceRecord): void {
  if (buffered.length >= MAX_BUFFERED_RECORDS) {
    recordLoss(record.window, record.at, 1);
    return;
  }
  buffered.push(record);
  scheduleDrain();
}

const markedWindows = new Map<number, 'start' | 'end'>();
let nextScan = 0;

export function observeEntryGateClock(tickNumber: number, at: number): void {
  if (tickNumber % ENTRY_GATE_REFRESH_TICKS !== 0) return;
  const window = windows.find(window => at >= window.start - GUARD_MS && at < window.end + DRAIN_MS + GUARD_MS);
  if (!window) return;
  if (!markedWindows.has(window.start)) {
    markedWindows.set(window.start, 'start');
    recordEvidence({ kind: 'window_start', window: window.start, at, end: window.end, tickNumber, scanSequence: nextScan });
  }
  if (at >= window.end + DRAIN_MS && markedWindows.get(window.start) === 'start') {
    markedWindows.set(window.start, 'end');
    recordEvidence({ kind: 'window_end', window: window.start, at, tickNumber, scanSequence: nextScan });
  }
  recordEvidence({ kind: 'tick', window: window.start, at, tickNumber });
}

let snapshotInFlight = false;

export function observeEntryGateRefresh(tickNumber: number, at: number, busy: boolean): void {
  const window = windows.find(window => at >= window.start && at < window.end);
  if (!window) return;
  const base = { window: window.start, at, tickNumber };
  recordEvidence({ ...base, kind: busy ? 'cycle_busy' : 'cycle_start' });
  if (busy) return;
  if (snapshotInFlight) {
    recordEvidence({ ...base, kind: 'snapshot_missing', reason: 'observer_busy' });
    return;
  }
  snapshotInFlight = true;
  void readQueueSnapshot(base);
}

async function readQueueSnapshot(base: { window: number; at: number; tickNumber: number }): Promise<void> {
  try {
    const row = await readEntryGateQueueSnapshot();
    if (typeof row?.observed_at !== 'number' || !Number.isFinite(row.observed_at)
      || typeof row.crypto !== 'number' || !Number.isSafeInteger(row.crypto) || row.crypto < 0
      || typeof row.xstock !== 'number' || !Number.isSafeInteger(row.xstock) || row.xstock < 0) {
      recordEvidence({ ...base, kind: 'snapshot_missing', reason: 'invalid_result' });
      return;
    }
    recordEvidence({ ...base, kind: 'snapshot', observedAt: row.observed_at, elapsedMs: Date.now() - base.at,
      crypto: row.crypto, xstock: row.xstock });
  } catch {
    recordEvidence({ ...base, kind: 'snapshot_missing', reason: 'query_failed', elapsedMs: Date.now() - base.at });
  } finally {
    snapshotInFlight = false;
  }
}

export async function readEntryGateQueueSnapshot() {
  const [{ diagDb }, { sql }] = await Promise.all([import('../../db.js'), import('drizzle-orm')]);
  const { rows } = await diagDb.execute(sql`
    SELECT (EXTRACT(EPOCH FROM statement_timestamp()) * 1000)::double precision AS observed_at,
           COUNT(*) FILTER (WHERE asset_class = 'crypto_spot')::int AS crypto,
           COUNT(*) FILTER (WHERE asset_class = 'xstock_spot')::int AS xstock
    FROM rtb_signals
    WHERE mode = 'paper' AND status IN ('active', 'reconfirmed')
      AND asset_class IN ('crypto_spot', 'xstock_spot')
  `);
  return rows[0];
}

export const ENTRY_GATE_WATCHED_STRATEGIES = [
  'inside_bar_reversal', 'reverse_impulse', 'strong_bull_trend',
] as const;

export type EntryGateStrategy = typeof ENTRY_GATE_WATCHED_STRATEGIES[number];
export type EntryGateLane = 'direct' | 'pattern_parent' | 'pattern' | 'hybrid';
type OrchestratorOrigin = 'active_portfolio' | 'legacy';

interface EntryGateScanIdentity {
  readonly window: number;
  readonly instance: number;
  readonly scan: number;
  readonly origin: OrchestratorOrigin;
}

export interface EntryGateScan extends EntryGateScanIdentity {
  readonly expected: Map<string, number>;
}

export interface EntryGateEvaluation extends EntryGateScanIdentity {
  readonly id: string;
  readonly symbol: string;
  readonly strategy: EntryGateStrategy;
  readonly lane: EntryGateLane;
  readonly ordinal: number;
}

type EvaluationEvent =
  | 'census'
  | 'unexpected_dispatch'
  | 'detector_enter'
  | 'sizing_enter'
  | 'target_pass'
  | 'target_refused'
  | 'rtb_call'
  | 'rtb_refused'
  | 'rtb_returned'
  | 'rtb_error'
  | 'upsert_attempt'
  | 'upsert_failed'
  | 'upsert_unconfirmed'
  | 'upsert_committed'
  | 'evaluation_end';

let nextInstance = 0;

export function newEntryGateInstance(): number {
  return ++nextInstance;
}

export function startEntryGateScan(
  instance: number, origin: OrchestratorOrigin, mode: string, assetClass: string, at: number,
): EntryGateScan | undefined {
  if (mode !== 'paper' || assetClass !== 'crypto_spot') return;
  const window = windows.find(window => at >= window.start && at < window.end);
  if (!window) return;
  const scope = { instance, origin, scan: ++nextScan, window: window.start };
  recordEvidence({ ...scope, kind: 'scan_start', at, mode, assetClass });
  return { ...scope, expected: new Map() };
}

export type EntryGateScanOutcome = 'complete' | 'empty_fx5' | 'no_system_context' | 'no_filters'
  | 'no_engine_owner' | 'money_held_unavailable' | 'error';

export function endEntryGateScan(scope: EntryGateScan | undefined, outcome: EntryGateScanOutcome): void {
  if (!scope) return;
  const { expected, ...identity } = scope;
  recordEvidence({ ...identity, kind: 'scan_end', at: Date.now(), mode: 'paper', assetClass: 'crypto_spot',
    outcome, expected: JSON.stringify(Object.fromEntries(expected)) });
}

export function planEntryGateEvaluation(
  scope: EntryGateScan | undefined, symbol: string, strategyKey: string, lane: EntryGateLane, ordinal = 0,
  kind: 'census' | 'unexpected_dispatch' = 'census',
): EntryGateEvaluation | undefined {
  if (!scope) return;
  const strategy = ENTRY_GATE_WATCHED_STRATEGIES.find(watched => watched === strategyKey);
  if (!strategy) return;
  const { expected, ...identity } = scope;
  if (kind === 'census') {
    const group = `${lane}:${strategy}`;
    expected.set(group, (expected.get(group) ?? 0) + 1);
  }
  const evaluation = { ...identity, symbol, strategy, lane, ordinal,
    id: JSON.stringify([scope.instance, scope.scan, lane, symbol, strategy, ordinal]) };
  observeEntryGateEvaluation(evaluation, kind);
  return evaluation;
}

export function observeEntryGateEvaluation(
  evaluation: EntryGateEvaluation | undefined,
  kind: EvaluationEvent,
  details?: Omit<EvidenceRecord, 'kind' | 'window' | 'at'>,
): void {
  if (!evaluation) return;
  recordEvidence({ ...evaluation, kind, at: Date.now(), mode: 'paper', assetClass: 'crypto_spot', ...details });
}

// A PostgreSQL rejection of this statement is distinct from a lost acknowledgement.
// 40003 (statement completion unknown), shutdown and transport errors stay unconfirmed.
export function classifyEntryGateUpsertError(error: unknown): string {
  let cause: unknown = error;
  for (let depth = 0; depth < 3 && cause && typeof cause === 'object'; depth++) {
    const { code, severity, cause: next } = cause as { code?: unknown; severity?: unknown; cause?: unknown };
    if (severity === 'ERROR' && typeof code === 'string' && /^(22...|23...|42...|40001|40P01|57014)$/.test(code)) {
      return code;
    }
    cause = next;
  }
  return '';
}
