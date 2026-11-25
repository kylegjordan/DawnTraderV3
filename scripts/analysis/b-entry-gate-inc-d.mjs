import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const PREFIX = '[B-ENTRY-GATE-D] ';
const STRATEGIES = ['inside_bar_reversal', 'reverse_impulse', 'strong_bull_trend'];
const TICK_INTERVAL = 15;
const HEALTH_INTERVAL = 60;
const GUARD_MS = 120_000;
const DRAIN_MS = 900_000;

function group(records, key) {
  const groups = new Map();
  for (const record of records) {
    const value = key(record);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(record);
  }
  return groups;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function integerCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function exactlyOne(rows, context, errors) {
  if (rows.length === 1) return rows[0];
  errors.push(`${context}: expected 1, got ${rows.length}`);
}

function clockAndQueue(records, health, start, end, cutoff, maxSnapshotLagMs, { open, close }, errors) {
  const ticks = records.filter(record => record.kind === 'tick');
  if (!open || !close || open.at >= start || open.at < start - GUARD_MS || open.end !== end
    || close.at < cutoff || close.at >= cutoff + GUARD_MS
    || ticks[0]?.tickNumber !== open.tickNumber || ticks[0]?.at !== open.at
    || !ticks.some(tick => tick.tickNumber === close.tickNumber && tick.at === close.at)) {
    errors.push('Window markers do not cover the registered start, end and drain');
  }
  if (!ticks.some(tick => tick.at < start) || !ticks.some(tick => tick.at >= end)) {
    errors.push('Missing a clock tick on either side of the measured session');
  }

  const anchors = health.filter(anchor => anchor.at >= start - GUARD_MS && anchor.at < cutoff + GUARD_MS);
  if (!anchors.some(anchor => anchor.at < start) || !anchors.some(anchor => anchor.at >= end)) {
    errors.push('Missing a Central Clock health anchor before or after the session');
  }
  const tickByNumber = new Map(ticks.map(tick => [tick.tickNumber, tick]));
  for (const [index, anchor] of anchors.entries()) {
    const tick = tickByNumber.get(anchor.tickNumber);
    if (!tick || Math.abs(tick.at - anchor.at) > 1000 || anchor.subscribers !== 5
      || anchor.tickNumber % HEALTH_INTERVAL !== 0
      || (index && anchor.tickNumber !== anchors[index - 1].tickNumber + HEALTH_INTERVAL)) {
      errors.push(`Central Clock health anchor mismatch at tick ${anchor.tickNumber}`);
    }
  }

  const cycles = group(records.filter(record => record.kind.startsWith('cycle_')), record => record.tickNumber);
  const samples = group(records.filter(record => record.kind.startsWith('snapshot')), record => record.tickNumber);
  const counts = { crypto: [], xstock: [] };
  let eligible = 0;
  let started = 0;
  let busy = 0;
  for (const [index, tick] of ticks.entries()) {
    const previous = ticks[index - 1];
    if (!integerCount(tick.tickNumber) || tick.tickNumber === 0 || tick.tickNumber % TICK_INTERVAL !== 0
      || (previous && (tick.tickNumber !== previous.tickNumber + TICK_INTERVAL || tick.at <= previous.at))) {
      errors.push(`Clock continuity failed at tick ${tick.tickNumber}`);
    }
    if (tick.at < start || tick.at >= end) continue;
    eligible++;
    const cycle = exactlyOne(cycles.get(tick.tickNumber) ?? [], `cycle ${tick.tickNumber}`, errors);
    cycles.delete(tick.tickNumber);
    if (!cycle) continue;
    if (cycle.at !== tick.at) errors.push(`Cycle timestamp differs from tick ${tick.tickNumber}`);
    const sampleRows = samples.get(tick.tickNumber) ?? [];
    samples.delete(tick.tickNumber);
    if (cycle.kind === 'cycle_busy') {
      busy++;
      if (sampleRows.length) errors.push(`Busy tick ${tick.tickNumber} supplied a snapshot`);
      continue;
    }
    if (cycle.kind !== 'cycle_start') {
      errors.push(`Unknown cycle disposition for tick ${tick.tickNumber}`);
      continue;
    }
    started++;
    const sample = exactlyOne(sampleRows, `snapshot ${tick.tickNumber}`, errors);
    if (!sample) continue;
    if (sample.kind !== 'snapshot' || sample.at !== tick.at
      || !Number.isFinite(sample.observedAt) || sample.observedAt < tick.at
      || sample.observedAt > tick.at + maxSnapshotLagMs || sample.observedAt >= ticks[index + 1]?.at
      || !integerCount(sample.elapsedMs) || sample.at + sample.elapsedMs > cutoff
      || !integerCount(sample.crypto) || !integerCount(sample.xstock)) {
      errors.push(`Unusable snapshot for tick ${tick.tickNumber}${sample.reason ? `: ${sample.reason}` : ''}`);
      continue;
    }
    counts.crypto.push(sample.crypto);
    counts.xstock.push(sample.xstock);
  }
  for (const tick of cycles.keys()) errors.push(`Cycle outside the enrolled ticks: ${tick}`);
  for (const tick of samples.keys()) errors.push(`Snapshot outside the enrolled cycles: ${tick}`);
  if (!eligible || !started) errors.push('No measured tick or started-cycle positive control');
  const complete = eligible === started + busy && started > 0 && counts.crypto.length === started;
  return {
    eligible, started, busy, verifiedSnapshots: counts.crypto.length,
    medians: complete ? { crypto: median(counts.crypto), xstock: median(counts.xstock) } : null,
  };
}

function classifyEvaluation(rows, context, errors) {
  const kinds = rows.map(row => row.kind);
  const census = exactlyOne(rows.filter(row => row.kind === 'census'), `${context} census`, errors);
  const endRow = exactlyOne(rows.filter(row => row.kind === 'evaluation_end'), `${context} terminal result`, errors);
  if (!census || !endRow) return;
  const expectedId = JSON.stringify([census.instance, census.scan, census.lane, census.symbol, census.strategy, census.ordinal]);
  if (census.id !== expectedId || !STRATEGIES.includes(census.strategy)
    || rows.some(row => row.mode !== 'paper' || row.assetClass !== 'crypto_spot'
      || row.scan !== census.scan || row.instance !== census.instance || row.origin !== census.origin
      || row.strategy !== census.strategy || row.symbol !== census.symbol
      || row.lane !== census.lane || row.ordinal !== census.ordinal)) {
    errors.push(`${context}: inconsistent dispatch identity or cohort`);
  }
  const terminal = endRow.outcome;
  const first = kinds[0] === 'census';
  const detector = census.lane === 'direct' ? ['detector_enter'] : [];
  const sizing = ['census', ...detector, 'sizing_enter'];
  const target = kinds.filter(kind => kind === 'target_pass' || kind === 'target_refused');
  const storage = kinds.filter(kind => kind !== 'evaluation_end').slice(sizing.length + target.length);
  const same = (left, right) => left.join('/') === right.join('/');
  const endIndex = kinds.indexOf('evaluation_end');
  const storagePaths = [
    ['rtb_call', 'rtb_refused'],
    ['rtb_call', 'rtb_error'],
    ['rtb_call', 'upsert_attempt', 'upsert_failed', 'rtb_error'],
    ['rtb_call', 'upsert_attempt', 'upsert_unconfirmed', 'rtb_error'],
    ['rtb_call', 'upsert_attempt', 'upsert_unconfirmed', 'rtb_returned'],
    ['rtb_call', 'upsert_attempt', 'upsert_committed', 'rtb_returned'],
    ['rtb_call', 'upsert_attempt', 'upsert_committed', 'rtb_error'],
  ];
  let valid = false;
  if (census.lane === 'pattern_parent') {
    valid = same(kinds, ['census', 'evaluation_end'])
      && ((terminal === 'no_matching_buy' && endRow.children === 0)
        || (terminal === 'matched' && integerCount(endRow.children) && endRow.children > 0)
        || terminal === 'pattern_error');
  } else if (census.lane === 'direct' && (terminal === 'no_candidate' || terminal === 'detector_error')) {
    valid = same(kinds, ['census', 'detector_enter', 'evaluation_end']);
  } else if (terminal === 'upstream_error'
    || (census.lane === 'hybrid' && terminal === 'hybrid_error')
    || (census.lane === 'pattern' && ['atr_refused', 'pattern_error'].includes(terminal))) {
    valid = same(kinds, ['census', 'evaluation_end']);
  } else if (['direct', 'pattern', 'hybrid'].includes(census.lane)) {
    const prefix = kinds.filter(kind => kind !== 'evaluation_end').slice(0, sizing.length + target.length);
    valid = endIndex >= sizing.length + target.length && target.length <= 1
      && same(prefix, [...sizing, ...target]);
    if (target[0] === 'target_pass') {
      valid &&= (terminal === 'build_error' && storage.length === 0)
        || (['built', 'build_error', 'build_refused'].includes(terminal)
          && storagePaths.some(path => same(path, storage)) && kinds.indexOf('rtb_call') < endIndex);
    } else {
      valid &&= storage.length === 0 && ['build_refused', 'build_error'].includes(terminal);
    }
  }
  if (!first || !valid) errors.push(`${context}: illegal evaluation or write sequence (${kinds.join(', ')})`);
  if (kinds.includes('upsert_unconfirmed')) errors.push(`${context}: write acknowledgement missing`);
  const commit = rows.find(row => row.kind === 'upsert_committed');
  if (commit && (typeof commit.rowId !== 'string' || !commit.rowId || commit.storedSymbol !== census.symbol)) {
    errors.push(`${context}: confirmed row identity does not match the evaluation`);
  }
  return { census, endRow, target: target[0], commit: Boolean(commit),
    rtbCalls: kinds.includes('rtb_call') ? 1 : 0,
    storageOutcome: commit ? (kinds.includes('rtb_error') ? 'post_commit_error' : 'upsert_committed')
      : storage.find(kind => ['upsert_failed', 'upsert_unconfirmed', 'rtb_refused'].includes(kind))
        ?? (storage.includes('rtb_error') ? 'pre_upsert_error' : undefined) };
}

function evaluations(records, start, end, cutoff, { open: windowOpen, close: windowClose }, errors) {
  const scans = group(records.filter(row => row.kind === 'scan_start' || row.kind === 'scan_end'), row => row.scan);
  const identities = group(records.filter(row => row.id !== undefined), row => row.id);
  const instances = new Set();
  const firstSequence = windowOpen?.scanSequence;
  const lastSequence = windowClose?.scanSequence;
  if (!integerCount(firstSequence) || !integerCount(lastSequence)
    || lastSequence - firstSequence !== scans.size) {
    errors.push('Scan sequence differs from the registered window anchors');
  }
  let priorScan = firstSequence;
  for (const [scan, rows] of scans) {
    const [open, close] = rows;
    if (rows.length !== 2 || open.kind !== 'scan_start' || close.kind !== 'scan_end'
      || open.at < start || open.at >= end || close.at < open.at || close.at > cutoff
      || !integerCount(scan) || (priorScan !== undefined && scan !== priorScan + 1)
      || open.mode !== 'paper' || close.mode !== 'paper'
      || open.assetClass !== 'crypto_spot' || close.assetClass !== 'crypto_spot'
      || open.origin !== 'active_portfolio' || close.origin !== open.origin || close.instance !== open.instance
      || !['complete', 'empty_fx5'].includes(close.outcome)) {
      errors.push(`Scan ${scan}: incomplete scan or unexpected orchestrator, mode or class`);
    }
    priorScan = scan;
    instances.add(open.instance);
  }
  if (instances.size !== 1) errors.push(`Expected exactly one active paper crypto instance, got ${instances.size}`);
  const summaries = [];
  for (const [id, rows] of identities) {
    const summary = classifyEvaluation(rows, id, errors);
    if (!summary) continue;
    const { census } = summary;
    const [open, close] = scans.get(census.scan) ?? [];
    if (!open || !close || census.at < open.at || census.at > close.at
      || census.origin !== open.origin || census.instance !== open.instance
      || rows.some(row => row.at < census.at || row.at > cutoff)) {
      errors.push(`${id}: evidence is outside its enrolled scan or extraction cutoff`);
    }
    summaries.push(summary);
  }
  const byScan = group(summaries, ({ census }) => census.scan);
  for (const [scan, rows] of scans) {
    const expected = rows[1]?.expected;
    const observed = new Map();
    for (const { census } of byScan.get(scan) ?? []) {
      const key = `${census.lane}:${census.strategy}`;
      observed.set(key, (observed.get(key) ?? 0) + 1);
    }
    let roster;
    try { roster = JSON.parse(expected); } catch { /* recorded as an invalid roster below */ }
    if (!roster || typeof roster !== 'object' || Array.isArray(roster)
      || Object.keys(roster).length !== observed.size
      || Object.entries(roster).some(([key, count]) => count !== observed.get(key))) {
      errors.push(`Scan ${scan}: census differs from its independent planned roster`);
    }
  }
  const patternGroups = group(
    summaries.filter(({ census }) => ['pattern', 'pattern_parent'].includes(census.lane)),
    ({ census }) => JSON.stringify([census.instance, census.scan, census.symbol, census.strategy]),
  );
  for (const [id, outcomes] of patternGroups) {
    const parents = outcomes.filter(({ census }) => census.lane === 'pattern_parent');
    const parent = exactlyOne(parents, `${id} pattern parent`, errors);
    if (parent && (parent.endRow.children ?? 0) !== outcomes.length - parents.length) {
      errors.push(`${id}: pattern children differ from the parent's observed matches`);
    }
  }
  const totals = {};
  for (const strategy of STRATEGIES) {
    totals[strategy] = {};
    for (const lane of ['direct', 'pattern_parent', 'pattern', 'hybrid']) {
      const selected = summaries.filter(({ census }) => census.strategy === strategy && census.lane === lane);
      const outcomeCounts = {};
      for (const summary of selected) {
        const outcome = summary.storageOutcome ?? summary.target ?? summary.endRow.outcome;
        outcomeCounts[outcome] = (outcomeCounts[outcome] ?? 0) + 1;
      }
      totals[strategy][lane] = {
        opportunities: selected.length,
        targetJudged: selected.filter(summary => summary.target).length,
        targetRefused: selected.filter(summary => summary.target === 'target_refused').length,
        rtbCalls: selected.reduce((sum, summary) => sum + summary.rtbCalls, 0),
        commits: selected.filter(summary => summary.commit).length,
        outcomes: outcomeCounts,
      };
    }
  }
  return { scans: scans.size, totals };
}

export function verifyEntryGateWindow({ records, health, lifecycle, start, end, processId, maxSnapshotLagMs }) {
  const errors = [];
  if (!Number.isFinite(start) || end - start !== 6.5 * 3_600_000
    || !/^\d+:\d+$/.test(processId) || !Number.isFinite(maxSnapshotLagMs)
    || maxSnapshotLagMs <= 0 || maxSnapshotLagMs >= 15_000) {
    throw new Error('Expected one registered 6.5-hour session, serving process and snapshot bound below 15 seconds');
  }
  const cutoff = end + DRAIN_MS;
  const windowRows = records.filter(record => record.window === start);
  if (windowRows.some(record => !Number.isFinite(record.at) || record.processId !== processId)
    || records.some(record => record.kind !== 'loss' && record.window !== start
      && record.at >= start - GUARD_MS && record.at < cutoff + GUARD_MS)
    || lifecycle.some(at => at >= start - GUARD_MS && at < cutoff + GUARD_MS)) {
    errors.push('Serving process changed, Central Clock restarted, or evidence did not carry a valid time');
  }
  if (records.some(record => record.kind === 'loss' && (record.window === start
    || (record.at >= start - GUARD_MS && record.at < cutoff + GUARD_MS)))) {
    errors.push('Evidence buffer reported loss');
  }
  const markers = {
    open: exactlyOne(windowRows.filter(record => record.kind === 'window_start'), 'window start', errors),
    close: exactlyOne(windowRows.filter(record => record.kind === 'window_end'), 'window end', errors),
  };
  const clock = clockAndQueue(windowRows, health, start, end, cutoff, maxSnapshotLagMs, markers, errors);
  const opportunities = evaluations(windowRows, start, end, cutoff, markers, errors);
  if (errors.length) clock.medians = null;
  return { start: new Date(start).toISOString(), clock, opportunities, errors };
}

export async function readEvidence(files) {
  const records = [];
  const health = [];
  const lifecycle = [];
  for (const file of files) {
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      const index = line.indexOf(PREFIX);
      if (index !== -1) {
        records.push(JSON.parse(line.slice(index + PREFIX.length)));
        continue;
      }
      const anchor = /\[CentralClock\]\[HEALTH\] tickNumber=(\d+) .*subscribers=(\d+)/.exec(line);
      const reset = /\[CentralClock\](?:\[R9\.3\.HF-4\] Starting central clock service| Stopped)/.test(line);
      if (!anchor && !reset) continue;
      const timestamp = /\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)? ?(?:Z|[+-]\d\d:\d\d)/.exec(line);
      if (!timestamp) throw new Error(`Untimestamped Central Clock evidence in ${file}`);
      const at = Date.parse(timestamp[0].replace(' ', 'T').replace(' ', ''));
      if (anchor) health.push({ at, tickNumber: Number(anchor[1]), subscribers: Number(anchor[2]) });
      if (reset) lifecycle.push(at);
    }
  }
  return { records, health, lifecycle };
}

async function main() {
  const [manifestPath, ...files] = process.argv.slice(2);
  if (!manifestPath || !files.length) throw new Error('Usage: node b-entry-gate-inc-d.mjs registration.json log1 [log2 ...]');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(manifest.build) || manifest.windows?.length !== 4
    || new Set(manifest.windows.map(window => Date.parse(window.start))).size !== 4) {
    throw new Error('Registration needs the serving commit and four distinct UTC sessions');
  }
  const evidence = await readEvidence(files);
  const results = manifest.windows.map(({ start, end }) => verifyEntryGateWindow({
    ...evidence, start: Date.parse(start), end: Date.parse(end),
    processId: manifest.processId, maxSnapshotLagMs: manifest.maxSnapshotLagMs,
  }));
  const strategies = {};
  for (const strategy of STRATEGIES) {
    const totals = { opportunities: 0, targetJudged: 0, targetRefused: 0, rtbCalls: 0, commits: 0 };
    for (const result of results) {
      const lanes = result.opportunities.totals[strategy];
      for (const lane of [lanes.direct, lanes.pattern, lanes.hybrid]) {
        for (const key of Object.keys(totals)) totals[key] += lane[key];
      }
    }
    strategies[strategy] = { ...totals,
      sufficientGateEvidence: totals.targetJudged > 0,
      allJudgedTargetsRefusedWithZeroCalls: totals.targetJudged > 0 && totals.targetRefused === totals.targetJudged && !totals.rtbCalls };
  }
  const complete = results.every(result => !result.errors.length) && strategies.strong_bull_trend.commits > 0;
  console.log(JSON.stringify({ build: manifest.build, processId: manifest.processId, complete, strategies, results }, null, 2));
  if (!complete) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
