import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  decideEra,
  decideEraWithWarmup,
  hotRehydrateInstruction,
  parseHorizonRows,
  parseLifecycleNumber,
  DATA_LIFECYCLE_SCOPE_SQL,
  HOT_HORIZON_SQL,
} from '../../services/data-archive/hot-horizon.js';

// B-DB-SIZE-RELIEF OBJ-3 (pre-audit P6 / F8): a by-hand reader of the HOT tables states what it read and refuses an
// era it cannot serve; a JOIN of two tables is limited by the SHORTER horizon.

const NOW = Date.parse('2026-11-20T12:00:00Z');
const H = parseHorizonRows([
  { constant_name: 'signal_eval_archive.hot_retention_days', value: 15 },
  { constant_name: 'signal_eval_provenance.hot_retention_days', value: 30 },
  { constant_name: 'pair_scan_archive.hot_retention_days', value: 'junk' },
]);
const JOINED = ['signal_eval_archive', 'signal_eval_provenance'];

describe('decideEra', () => {
  it('REFUSES the replay script\'s default era (2026-06-08) and names the warm tier and the earliest servable era', () => {
    const d = decideEra('2026-06-08T00:00:00Z', JOINED, H, NOW);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.message).toMatch(/WARM tier/);
    expect(d.message).toMatch(/b75-rehydrate\.ts/);
    expect(d.message).toContain('--table signal_eval_archive --from 2026-06-08 --to 2026-11-06');
    expect(d.message).toContain('--table signal_eval_provenance --from 2026-06-08 --to 2026-11-06');
    expect(d.message).toMatch(/15 d, set by signal_eval_archive/);
    expect(d.earliestServableIso).toBe('2026-11-06T00:00:00.000Z'); // next UTC midnight after 2026-11-05T12:00Z
  });

  it('serves an era inside the SHORTER horizon and reports the limiting table', () => {
    const d = decideEra('2026-11-10T00:00:00Z', JOINED, H, NOW);
    expect(d).toMatchObject({ ok: true, horizonDays: 15, limitingTable: 'signal_eval_archive' });
  });

  it('an era inside the longer table\'s horizon but outside the shorter one is still REFUSED (the INNER-join loss)', () => {
    expect(decideEra('2026-10-30T00:00:00Z', JOINED, H, NOW).ok).toBe(false); // 21 d back: inside 30, outside 15
  });

  it('REFUSES a PRESENT-but-malformed key, and says the key exists (gate 3 F3) — never a default', () => {
    const d = decideEra('2026-11-15T00:00:00Z', ['signal_eval_archive', 'pair_scan_archive'], H, NOW); // pair_scan = 'junk'
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.message).toMatch(/PRESENT but not a positive number for pair_scan_archive/);
    expect(d.message).toMatch(/the key exists/);
    expect(d.message).not.toMatch(/no data_lifecycle hot_retention_days for pair_scan_archive/);
  });

  it('REFUSES an ABSENT key with the missing-key message (distinct from malformed)', () => {
    const d = decideEra('2026-11-15T00:00:00Z', ['signal_eval_archive', 'macro_feed_archive'], H, NOW); // not in H at all
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.message).toMatch(/no data_lifecycle hot_retention_days for macro_feed_archive/);
    expect(d.message).not.toMatch(/PRESENT but not a positive number/);
  });

  it('REFUSES an unparseable era', () => {
    expect(decideEra('not-a-date', JOINED, H, NOW).ok).toBe(false);
  });

  it('an era servable at the START of a run can be unservable a day later — why the replay re-checks at the end', () => {
    const era = '2026-11-06T00:00:00Z'; // exactly the earliest servable era at NOW
    expect(decideEra(era, JOINED, H, NOW).ok).toBe(true);
    expect(decideEra(era, JOINED, H, NOW + 86_400_000).ok).toBe(false);
  });

  it('REFUSES a requested window whose warmup crosses the hot horizon', () => {
    const requested = '2026-11-06T00:00:00Z';
    expect(decideEra(requested, JOINED, H, NOW).ok).toBe(true);
    const d = decideEraWithWarmup(requested, 86_400_000, JOINED, H, NOW);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.message).toContain('needs 86400000ms of prior bars');
    expect(d.message).toContain('--from 2026-11-05');
  });

  it('builds one concrete restore command per required table', () => {
    expect(hotRehydrateInstruction(JOINED, '2026-10-01T12:00:00Z', '2026-10-03T00:00:00Z'))
      .toBe(
        'npx tsx server/scripts/b75-rehydrate.ts --table signal_eval_archive --from 2026-10-01 --to 2026-10-03 '
        + '--out ~/rehydrated/signal_eval_archive ; '
        + 'npx tsx server/scripts/b75-rehydrate.ts --table signal_eval_provenance --from 2026-10-01 --to 2026-10-03 '
        + '--out ~/rehydrated/signal_eval_provenance',
      );
  });
});

describe('increment 4 — the ENFORCER and the READERS share one scope filter and one value test (Langston, gate 2)', () => {
  const ROOT = path.join(__dirname, '../../..');

  it('parseLifecycleNumber accepts only what the sweep enforces: a finite number > 0 — a string "15" is NOT a horizon', () => {
    expect(parseLifecycleNumber(15)).toBe(15);
    expect(parseLifecycleNumber(30.5)).toBe(30.5);
    for (const bad of ['15', 0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, true, { days: 15 }]) {
      expect(parseLifecycleNumber(bad), String(bad)).toBeNull();
    }
  });

  it('a string-seeded key is UNKNOWN to the readers (the sweep would abort on it, so no badge or era may trust it)', () => {
    const h = parseHorizonRows([{ constant_name: 'signal_eval_archive.hot_retention_days', value: '15' }]);
    expect(h.get('signal_eval_archive')).toBeNull(); // present, not a horizon
    const d = decideEra('2026-11-19T00:00:00Z', ['signal_eval_archive'], h, NOW);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.message).toMatch(/PRESENT but not a positive number for signal_eval_archive/);
  });

  it('the sweep reads data_lifecycle through the SAME scope filter and the SAME value test', () => {
    const sweep = fs.readFileSync(path.join(ROOT, 'server/scripts/b75-retention-sweep.ts'), 'utf8');
    expect(sweep).toContain("import { DATA_LIFECYCLE_SCOPE_SQL, parseLifecycleNumber } from '../services/data-archive/hot-horizon.js';");
    expect(sweep).toMatch(/FROM module_constants\s+WHERE \$\{DATA_LIFECYCLE_SCOPE_SQL\}/);
    expect(sweep).toMatch(/function reqNum\(key: string\): number \{[\s\S]{0,200}parseLifecycleNumber\(map\.get\(key\)\)/);
    expect(sweep).not.toMatch(/WHERE module_name = 'data_lifecycle'`/); // the unscoped read is gone
    expect(HOT_HORIZON_SQL).toContain(DATA_LIFECYCLE_SCOPE_SQL);
  });

  it('the three enforcing readers use the shared value test, and wildcard readers use the shared scope predicate', () => {
    const eligibility = fs.readFileSync(path.join(ROOT, 'scripts/analysis/b_disk_headroom_eligibility.ts'), 'utf8');
    expect(eligibility).toContain('DATA_LIFECYCLE_SCOPE_SQL');
    expect(eligibility).toContain('parseLifecycleNumber');
    expect(eligibility).toMatch(/FROM module_constants WHERE \$\{DATA_LIFECYCLE_SCOPE_SQL\}/);
    expect(eligibility).toMatch(/parseLifecycleNumber\(consts\.get\(`\$\{parent\}\.hot_retention_days`\)\)/);

    const guardrail = fs.readFileSync(path.join(ROOT, 'server/services/guardrail-settings.ts'), 'utf8');
    expect(guardrail).toContain("import { parseLifecycleNumber } from './data-archive/hot-horizon.js';");
    expect(guardrail).toMatch(/const days = parseLifecycleNumber\(row\?\.value\);[\s\S]{0,80}days === null/);
    // Deliberately NOT scope-pinned: its limit(2) duplicate guard must keep refusing any second scoped row.
    expect(guardrail).toMatch(/constantName, 'closed_trades\.hot_retention_days'\)\)\)[\s\S]{0,40}\.limit\(2\)/);

    const capacity = fs.readFileSync(path.join(ROOT, 'server/scripts/b-xstock-bar-availability-capacity-gate.ts'), 'utf8');
    expect(capacity).toContain('DATA_LIFECYCLE_SCOPE_SQL, parseLifecycleNumber');
    expect(capacity).toMatch(/WHERE \$\{DATA_LIFECYCLE_SCOPE_SQL\}[\s\S]{0,100}xstock_bar_revision_event\.hot_retention_days/);
    expect(capacity).toMatch(/const revisionHotRetentionDays = parseLifecycleNumber\(meta\.revision_hot_retention_days\)/);
  });

  it('the sweep detects narrow rows, alerts without refusing tiering, and resolves the alert on a clean read', () => {
    const sweep = fs.readFileSync(path.join(ROOT, 'server/scripts/b75-retention-sweep.ts'), 'utf8');
    expect(sweep).toContain("b75-retention-sweep:data-lifecycle-narrow-scope");
    for (const column of ['exchange', 'asset_class', 'strategy', 'regime']) {
      expect(sweep).toContain(`${column} IS DISTINCT FROM '*'`);
    }
    expect(sweep).toContain('a narrow row is not out-voted; it is unseen by the sweep');
    const narrowBranch = sweep.slice(sweep.indexOf('if (narrowNames.length > 0)'), sweep.indexOf('} else {', sweep.indexOf('if (narrowNames.length > 0)')));
    expect(narrowBranch).toContain('narrow-scope data_lifecycle rows count=${narrowNames.length}');
    expect(narrowBranch).toContain("constant_names=${narrowNames.join(',')}");
    expect(narrowBranch.indexOf('console.warn(')).toBeLessThan(narrowBranch.indexOf('raiseSweepAlert('));
    expect(sweep).toMatch(/if \(narrowNames\.length > 0\) \{[\s\S]{0,800}raiseSweepAlert\(/);
    expect(sweep).toMatch(/\} else \{[\s\S]{0,180}resolveSweepAlerts\(\[NARROW_LIFECYCLE_SCOPE_ALERT_KEY\]/);
  });
});

describe('wiring', () => {
  const ROOT = path.join(__dirname, '../../..');

  it('every configurable xStock snapshot reader checks its full requested window plus warmup before reading snapshots', () => {
    const cases = [
      ['scripts/b-xstock-calib-b31a-gate-audit-2.ts', '3 * 86_400_000', 'xstock_spot_ohlc_60m_snapshot'],
      ['scripts/b5-w2a-geometry-sweep.ts', '2 * 86_400_000', 'xstock_spot_ohlc_15m_snapshot'],
      ['scripts/b-xstock-calib-b3-regime-audit.ts', 'WINDOW_BARS * 60 * 60_000', 'xstock_spot_ohlc_60m_snapshot'],
    ] as const;
    for (const [relative, warmup, table] of cases) {
      const src = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      const check = src.indexOf('decideEraWithWarmup(');
      const read = src.indexOf(`FROM ${table}`, check);
      expect(check, relative).toBeGreaterThan(-1);
      expect(src, relative).toContain(warmup);
      expect(check, relative).toBeLessThan(read);
    }
  });

  it('the fixed May replay refuses the hot table and accepts only proven rehydrated snapshot input', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/b-xstock-calib-b1a-replay.ts'), 'utf8');
    expect(src).toContain('B1A_REHYDRATED_SNAPSHOT_PATH');
    expect(src).toContain('loadProvenRehydratedSnapshot(B1A_REHYDRATED_INPUT, SNAPSHOT_TABLE)');
    expect(src).toContain('fixed historical replay may not read the mutable hot snapshot table');
    expect(src.indexOf('loadProvenRehydratedSnapshot(')).toBeLessThan(src.indexOf('fetchAllSymbols(client, rehydrated)'));
  });

  it('the replay script reads the horizons for BOTH joined tables and exits non-zero on a refusal', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/b5-w20c-provenance-replay.ts'), 'utf8');
    expect(src).toContain("const HOT_TABLES = ['signal_eval_archive', 'signal_eval_provenance', SNAPSHOT_TABLE]");
    expect(src).toMatch(/decideEraWithWarmup\(ERA_START, SNAPSHOT_WARMUP_MS, HOT_TABLES/);
    expect(src).toMatch(/if \(!era\.ok\) \{[\s\S]{0,120}process\.exit\(2\)/);
    // the check runs BEFORE the first archive query
    expect(src.indexOf('decideEraWithWarmup(ERA_START')).toBeLessThan(src.indexOf('FROM signal_eval_archive b'));
  });

  it('the replay script RE-CHECKS the era at the END of the run and exits 3 if a sweep may have truncated it', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/b5-w20c-provenance-replay.ts'), 'utf8');
    const iEnd = src.indexOf('const endEra = decideEraWithWarmup(ERA_START');
    expect(iEnd).toBeGreaterThan(-1);
    // after the LAST archive read: the sampling joins (gate 3 F2 — 'FROM signal_eval_archive' is the FIRST read only)
    expect(src.lastIndexOf('signal_eval_archive b ON')).toBeGreaterThan(src.indexOf('FROM signal_eval_archive'));
    expect(iEnd).toBeGreaterThan(src.lastIndexOf('signal_eval_archive b ON'));
    expect(src.slice(iEnd)).toMatch(/if \(!endEra\.ok\) \{[\s\S]{0,900}process\.exit\(3\)/);
    // gate 4 fold (Langston): spelling-independent — NO archive read of any alias after the end check
    expect(src.slice(iEnd)).not.toMatch(/FROM signal_eval/);
    // gate 3 F1: the refusal is on STDOUT as well as stderr, before the exit
    expect(src.slice(iEnd)).toMatch(/if \(!endEra\.ok\) \{[\s\S]{0,900}console\.log\(banner\);[\s\S]{0,60}console\.error\(banner\);[\s\S]{0,80}process\.exit\(3\)/);
  });

  it('the fee-contract SQL prints the hot horizons of both tables it reads, before section (1)', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'scripts/analysis/b_xstock_fee_contract_deploy_baselines.sql'), 'utf8');
    const i0 = sql.indexOf('=== (0) B-DB-SIZE-RELIEF OBJ-3');
    expect(i0).toBeGreaterThan(-1);
    expect(i0).toBeLessThan(sql.indexOf('=== (1) P8 p0'));
    // one row per table ALWAYS (a VALUES list LEFT JOINed to the keys), so a missing key prints MISSING, never vanishes
    expect(sql).toContain("FROM (VALUES ('signal_eval_archive'), ('switch_on_shadow_evidence')) AS t(table_name)");
    expect(sql).toMatch(/LEFT JOIN module_constants m[\s\S]{0,200}m\.constant_name = t\.table_name \|\| '\.hot_retention_days'/);
    expect(sql).toContain("'MISSING - hot window unknown");
    // gate 3: a MISSING key STOPS the file (RAISE under the run's ON_ERROR_STOP=1), before section (1)
    const iRaise = sql.indexOf("RAISE EXCEPTION 'B-DB-SIZE-RELIEF section (0): data_lifecycle hot_retention_days absent, or not a positive number");
    expect(iRaise).toBeGreaterThan(i0);
    expect(iRaise).toBeLessThan(sql.indexOf('=== (1) P8 p0'));
    expect(sql).toContain('-v ON_ERROR_STOP=1');
    // gate 4 fold: the SAME value test as parseLifecycleNumber — absent, non-number and <= 0 all stop; a CASE (ordered),
    // never an OR, so the numeric cast cannot run on a jsonb string
    expect(sql).toContain("WHERE CASE WHEN m.value IS NULL THEN true WHEN jsonb_typeof(m.value) <> 'number' THEN true ELSE (m.value)::numeric <= 0 END;");
    expect(sql).toContain("WHEN (m.value)::numeric <= 0 THEN 'NOT POSITIVE");
    expect(sql).not.toMatch(/\(m\.value\)::int\b/); // the old cast errored on a string before the guard could name it
    // psql \echo treats an apostrophe as an open quote: none may carry one
    const echoes = sql.split(/\r?\n/).filter((x) => x.startsWith('\\echo'));
    expect(echoes.length).toBeGreaterThan(10); // the filter finds the echo lines (12 at gate 4), so its silence means something
    for (const l of echoes) expect(l, l).not.toContain("'");
  });

  it('the three gate-4 SQL copies of the data_lifecycle wildcard predicate carry all five terms (gate 4 C-2)', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'scripts/analysis/b_xstock_fee_contract_deploy_baselines.sql'), 'utf8');
    const setter = fs.readFileSync(path.join(ROOT, 'scripts/analysis/b_disk_headroom_set_retention.sh'), 'utf8');
    const sqlSelect = sql.slice(sql.indexOf('SELECT t.table_name'), sql.indexOf('DO $$'));
    const sqlGuard = sql.slice(sql.indexOf('DO $$'), sql.indexOf('=== (1) P8 p0'));
    const setterUpdate = setter.slice(setter.indexOf('UPDATE module_constants'), setter.indexOf('GET DIAGNOSTICS'));
    const copies = [sqlSelect, sqlGuard, setterUpdate];
    const terms = [
      "module_name = 'data_lifecycle'",
      "exchange = '*'",
      "asset_class = '*'",
      "strategy = '*'",
      "regime = '*'",
    ];
    for (const copy of copies) {
      expect(copy.length).toBeGreaterThan(100); // positive control: every slice reached a real SQL block
      for (const term of terms) expect(copy, term).toContain(term);
    }
  });

  it('the Drift Dashboard panel (OBJ-2) uses the SAME query and parser, not a copy of its own', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server/services/drift-dashboard-aggregator.ts'), 'utf8');
    expect(src).toContain('sql.raw(HOT_HORIZON_SQL)');
    expect(src).toContain('parseHorizonRows(');
    expect(src).not.toContain("LIKE '%.hot_retention_days'");
  });
});
