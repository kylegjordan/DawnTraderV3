import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateRun,
  normaliseSchedule,
  selectCrontabLine,
  tailText,
  unverifiedStreak,
  UNVERIFIED_MARKER,
} from '../../services/archival-run-check';

// B-DISK-FILE-TIERING amendment 2, AP-7 (pre-audit "Amendment 2" r1-r4, Langston PROCEED on r4): the archival-health
// verdict ties a DONE to a start at/after the scheduled fire. Fixture lines are copied from the real staging logs
// (2026-11-13), so the patterns are tested against the population's own shape, not a hand-written imitation.

const ROOT = path.join(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const T = (iso: string) => Date.parse(iso);

const RET_START = /\[B75 sweep\] started at (\S+) run_id=/;
const RET_DONE = /DONE .*\bfailed=(\d+)\b.*\bplain_failed=(\d+)\b.*\bsnapshot_failed=(\d+)\b/;
const TIER_START = /\[disk-tiering\] (\S+) started run /;
const TIER_DONE = /DONE moved=\d+ failed=(\d+)/;
const ROT_START = /\[B75 rotator\] started at (\S+) /;
const ROT_DONE = /DONE candidates=\d+ rotated=\d+ failed=(\d+)/;

const tierRun = (day: string, moved = 28, failed = 0) => [
  `[disk-tiering] ${day}T02:45:02.265Z started run free=31625396224 cwd=/home/deploy/dawntrader`,
  `[disk-tiering] ${day}T02:45:02.324Z candidates=28 planned=28 stopped_by=none hot_days=35`,
  `[disk-tiering] ${day}T02:45:06.830Z moved disk_file.phase15b_dbs_telemetry/2026-10-08.jsonl bytes=93868190 gz=15904487 newlines=247470`,
  `[disk-tiering] ${day}T02:45:24.811Z DONE moved=${moved} failed=${failed} freed_bytes=132757058 free_after=31757565952 stopped_by=none hot_days=35`,
].join('\n');
const retRun = (day: string, failed = 0, plainFailed = 0, snapshotFailed = 0) => [
  `[B75 sweep] started at ${day}T02:15:03.042Z run_id=5e6f1dd5-09c7-426b-a0fb-5bc420a1b55c slice_threshold_hot_bytes=3221225472`,
  `[B75 sweep] xstock_perp_ticker_snap: no partitions older than 2026-10-01 (retentionDays=30)`,
  `[B75 sweep] DONE — examined=5 dropped=5 failed=${failed} bytes_freed=3873783808 bytes_archived=472274229 plain_deleted=132480 plain_failed=${plainFailed} snapshot_deleted=29055 snapshot_failed=${snapshotFailed} duration_ms=868264`,
].join('\n');
const rotRun = (day: string) => [
  `[B75 rotator] started at ${day}T03:00:02.960Z dry_run=false cold_provider=b2 cold_configured=true warm_retention_days=365`,
  `[B75 rotator] no candidates older than warm retention window`,
  `[B75 rotator] DONE candidates=0 rotated=0 failed=0 bytes_moved=0 duration_ms=425`,
].join('\n');

const due = (iso: string) => T(iso);
const tier = (live: string, rotated = '', dueIso = '2026-11-13T02:45:00Z') =>
  evaluateRun({ live, rotated, startPattern: TIER_START, donePattern: TIER_DONE, dueMs: due(dueIso) });

describe('AP-7 evaluateRun — the run is the last start at/after the fire, and its own DONE', () => {
  it('clean run: ok, failures read from that DONE', () => {
    const v = tier(`${tierRun('2026-11-12')}\n${tierRun('2026-11-13')}`);
    expect(v.kind).toBe('ok');
    expect(v.kind === 'ok' && v.failedTotal).toBe(0);
  });
  it('failures summed from the DONE after the last start (retention has two groups)', () => {
    const v = evaluateRun({ live: `${retRun('2026-11-12')}\n${retRun('2026-11-13', 2, 3)}`, rotated: '', startPattern: RET_START, donePattern: RET_DONE, dueMs: due('2026-11-13T02:15:00Z') });
    expect(v.kind === 'ok' && v.failedTotal).toBe(5);
  });
  it('a snapshot-lane-only failure is counted too (Langston F2): failures summed over all three counters', () => {
    const v = evaluateRun({ live: retRun('2026-11-13', 0, 0, 4), rotated: '', startPattern: RET_START, donePattern: RET_DONE, dueMs: due('2026-11-13T02:15:00Z') });
    expect(v.kind === 'ok' && v.failedTotal).toBe(4);
  });
  it('crash after the start: the previous night’s DONE does not count — incomplete', () => {
    const live = `${tierRun('2026-11-12')}\n[disk-tiering] 2026-11-13T02:45:02.265Z started run free=1 cwd=/x\n[disk-tiering] 2026-11-13T02:45:03.000Z moved a bytes=1 gz=1 newlines=1`;
    const v = tier(live);
    expect(v.kind).toBe('incomplete');
    expect(v.kind === 'incomplete' && v.startIso).toBe('2026-11-13T02:45:02.265Z');
  });
  it('refusal before the start line (retention, DATABASE_URL not set): last start is yesterday — not_started, quoting the last line', () => {
    const live = `${retRun('2026-11-12')}\n[B75 sweep] DATABASE_URL not set`;
    const v = evaluateRun({ live, rotated: '', startPattern: RET_START, donePattern: RET_DONE, dueMs: due('2026-11-13T02:15:00Z') });
    expect(v.kind).toBe('not_started');
    expect(v.kind === 'not_started' && v.lastStartIso).toBe('2026-11-12T02:15:03.042Z');
    expect(v.kind === 'not_started' && v.lastLine).toBe('[B75 sweep] DATABASE_URL not set');
  });
  it("tiering's lock_held night (a DONE with no start) reads not_started, not failed, and the quote names lock_held=1", () => {
    const live = `${tierRun('2026-11-12')}\n[disk-tiering] 2026-11-13T02:45:01.000Z another run holds the lock (/tmp/x) — skipping this tick\n[disk-tiering] 2026-11-13T02:45:01.001Z DONE moved=0 failed=1 lock_held=1`;
    const v = tier(live);
    expect(v.kind).toBe('not_started');
    expect(v.kind === 'not_started' && v.lastLine).toContain('lock_held=1');
  });
  it('day 2 of a hung retention holder: its start precedes the fire, the runner skips — not_started, naming the skip', () => {
    const live = `[B75 sweep] started at 2026-11-12T02:15:03.042Z run_id=a slice_threshold_hot_bytes=1\n[B75 sweep] xstock_spot_ticker_snap: processing partition=2026-10-13 child=c\n[B75 sweep] another run still holds the kernel lock — skipping this invocation`;
    const v = evaluateRun({ live, rotated: '', startPattern: RET_START, donePattern: RET_DONE, dueMs: due('2026-11-13T02:15:00Z') });
    expect(v.kind).toBe('not_started');
    expect(v.kind === 'not_started' && v.lastLine).toContain('kernel lock');
  });
  it('a start one millisecond before the fire is not_started (tolerance 0)', () => {
    const v = tier(tierRun('2026-11-13'), '', '2026-11-13T02:45:02.266Z');
    expect(v.kind).toBe('not_started');
  });
  it('a 3,500-line run whose start is far beyond the old 60-line window: ok', () => {
    const moves = Array.from({ length: 3500 }, (_, i) => `[disk-tiering] 2026-11-13T02:50:00.000Z moved f${i} bytes=1 gz=1 newlines=1`).join('\n');
    const live = `[disk-tiering] 2026-11-13T02:45:02.000Z started run free=1 cwd=/x\n${moves}\n[disk-tiering] 2026-11-13T03:27:51.174Z DONE moved=3500 failed=0`;
    expect(tier(live).kind).toBe('ok');
  });
  it('no start line anywhere: not_started with no last start', () => {
    const v = tier('[disk-tiering] 2026-11-13T02:45:24.811Z DONE moved=28 failed=0');
    expect(v.kind === 'not_started' && v.lastStartIso).toBeNull();
  });
});

describe('AP-7 rotation (C-3, B3, notifempty)', () => {
  it('both start and DONE in .1, fresh empty live file (the morning after a rotation): ok', () => {
    expect(tier('', tierRun('2026-11-13')).kind).toBe('ok');
  });
  it('start in .1, DONE in the live file: ok', () => {
    const [s, ...rest] = tierRun('2026-11-13').split('\n');
    expect(tier(rest.join('\n'), s).kind).toBe('ok');
  });
  it('start in .1 and no DONE in either: incomplete', () => {
    expect(tier('', tierRun('2026-11-13').split('\n').slice(0, 3).join('\n')).kind).toBe('incomplete');
  });
  it('the monthly rotator: its run rotated to .1, an empty live file not rotated again (notifempty) — ok all month', () => {
    const v = evaluateRun({ live: '', rotated: rotRun('2026-11-01'), startPattern: ROT_START, donePattern: ROT_DONE, dueMs: due('2026-11-01T03:00:00Z') });
    expect(v.kind).toBe('ok');
  });
  it('the quote falls back to .1 when the live file is empty, and to "(log empty)" when both are', () => {
    const v = tier('', `${tierRun('2026-11-12')}`);
    expect(v.kind === 'not_started' && v.lastLine).toContain('DONE moved=28');
    const e = tier('', '');
    expect(e.kind === 'not_started' && e.lastLine).toBe('(log empty)');
  });
});

describe('AP-7 bounded read (C-4)', () => {
  it('a truncated tail drops its partial first line; a whole file keeps every line', () => {
    const text = 'partial line\nwhole one\nwhole two\n';
    const buf = Buffer.from(text.slice(4));
    expect(tailText(buf, text.length)).toBe('whole one\nwhole two\n');
    expect(tailText(Buffer.from(text), text.length)).toBe(text);
  });
  it('a start older than the cap is not in the tail: not_started', () => {
    const big = `${tierRun('2026-11-13')}\n${'x'.repeat(1000)}`;
    const cut = Buffer.from(big.slice(big.indexOf('candidates')));
    expect(tier(tailText(cut, big.length)).kind).toBe('not_started');
  });
});

describe('AP-7 crontab selector and normalisation (r4 item 2, optional)', () => {
  // the live root crontab's own lines, 2026-11-13
  const crontab = [
    '# [B-STORAGE-HARDEN 2026-07-07 Kyle-authorized] DISABLED — B70 tiering pending; do NOT drop analytics data. Re-enable at OBJ-2 close.',
    '30 2 28 * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b70-create-monthly-partitions.ts" >> /var/log/dawntrader/b70-partitions.log 2>&1',
    '15 2 * * * su - deploy -c "cd /home/deploy/dawntrader && server/scripts/b75-retention-run.sh" >> /var/log/dawntrader/b75-retention.log 2>&1',
    '45 2 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b-disk-file-tiering.ts" >> /var/log/dawntrader/disk-file-tiering.log 2>&1',
  ].join('\n');
  it('one active line: its five fields', () => {
    expect(selectCrontabLine(crontab, 'b75-retention.log')).toMatchObject({ kind: 'one', schedule: '15 2 * * *' });
  });
  it('a #-disabled line with no active one is not a schedule: none', () => {
    const c = `# 15 2 * * * su - deploy -c "x" >> /var/log/dawntrader/b75-retention.log 2>&1\n${crontab.split('\n')[1]}`;
    expect(selectCrontabLine(c, 'b75-retention.log').kind).toBe('none');
  });
  it('two active lines: many', () => {
    const line = crontab.split('\n')[2];
    expect(selectCrontabLine(`${line}\n${line.replace('15 2', '20 3')}`, 'b75-retention.log').kind).toBe('many');
  });
  it('a longer file name is not a match for its prefix', () => {
    const c = '15 2 * * * x >> /var/log/dawntrader/b75-retention.log.old 2>&1';
    expect(selectCrontabLine(c, 'b75-retention.log').kind).toBe('none');
  });
  it('leading zeros and spacing do not count as drift', () => {
    expect(normaliseSchedule('15 02 * * *')).toBe(normaliseSchedule('15  2 * * *'));
    expect(normaliseSchedule('0 3 1 * *')).toBe('0 3 1 * *');
    expect(normaliseSchedule('15 2 * * *')).not.toBe(normaliseSchedule('15 3 * * *'));
  });
});

describe('AP-7 schedule_unverified streak (r2 (b), r4 4(ii), C-r4-1)', () => {
  const run = (iso: string, unverified: boolean) =>
    [`[archival-health] started at ${iso}`, ...(unverified ? [`${UNVERIFIED_MARKER} Command failed: sudo -n crontab -l`] : []), '[archival-health] DONE — all_ok=true checks=5'].join('\n');
  const cur = '2026-11-13T05:00:00.000Z';
  const current = `[archival-health] started at ${cur}\n${UNVERIFIED_MARKER} x`;
  it('counts consecutive previous unverified runs, excluding the current one', () => {
    expect(unverifiedStreak({ live: `${run('2026-11-11T05:00:00.000Z', true)}\n${run('2026-11-12T05:00:00.000Z', true)}\n${current}`, rotated: '', currentStartIso: cur })).toBe(2);
    expect(unverifiedStreak({ live: `${run('2026-11-12T05:00:00.000Z', true)}\n${current}`, rotated: '', currentStartIso: cur })).toBe(1);
    expect(unverifiedStreak({ live: current, rotated: '', currentStartIso: cur })).toBe(0);
  });
  it('a verified run in between resets the count', () => {
    expect(unverifiedStreak({ live: `${run('2026-11-10T05:00:00.000Z', true)}\n${run('2026-11-11T05:00:00.000Z', false)}\n${run('2026-11-12T05:00:00.000Z', true)}\n${current}`, rotated: '', currentStartIso: cur })).toBe(1);
  });
  it('a rotation does not restart the count: the previous runs are read from .1', () => {
    expect(unverifiedStreak({ live: current, rotated: `${run('2026-11-11T05:00:00.000Z', true)}\n${run('2026-11-12T05:00:00.000Z', true)}`, currentStartIso: cur })).toBe(2);
  });
});

describe('AP-7 fences — the patterns match what each subject writes (C-5, the amendment-1 shape)', () => {
  const checker = read('server/scripts/b-storage-archival-health.ts');
  const subjects: Array<[string, string[], RegExp, RegExp]> = [
    ['server/scripts/b75-retention-sweep.ts', ['`[B75 sweep] started at ${startedAt.toISOString()} run_id=', '[B75 sweep] DONE — examined=', 'failed=${', 'plain_failed=${', 'snapshot_failed=${'], RET_START, RET_DONE],
    ['server/scripts/b75-cold-rotator.ts', ['`[B75 rotator] started at ${startedAt.toISOString()} `', '[B75 rotator] DONE candidates=${', 'rotated=${', 'failed=${'], ROT_START, ROT_DONE],
    ['server/scripts/b-disk-file-tiering.ts', ['log(`started run free=${', "log('DONE moved=0 failed=1 env_missing=1')", "log('DONE moved=0 failed=1 lock_held=1')", 'DONE moved=${'], TIER_START, TIER_DONE],
  ];
  for (const [file, literals, start, done] of subjects) {
    it(`${path.basename(file)}: its start and DONE literals are present, and the checker carries the same patterns`, () => {
      const src = read(file);
      for (const l of literals) expect(src, `${file}: ${l}`).toContain(l);
      expect(checker).toContain(`startPattern: ${start.toString()},`);
      expect(checker).toContain(`donePattern: ${done.toString()},`);
    });
  }
  it("tiering's log() prefix is what TIER_START expects", () => {
    expect(read('server/scripts/b-disk-file-tiering.ts')).toContain('console.log(`[disk-tiering] ${new Date().toISOString()} ${msg}`);');
  });
  it('the checker reads bounded tails through evaluateRun, not the old 60-line tail', () => {
    expect(checker).toContain('evaluateRun({');
    expect(checker).toContain('rotated: readTail(`${path}.1`)');
    expect(checker).not.toMatch(/tail\(fs\.readFileSync/);
    expect(checker).toMatch(/'not_started' \| 'schedule_drift' \| 'not_scheduled'/);
    expect(checker).toContain("dedupe_key: 'archival-health-crontab-schedule_unverified'");
  });
  it('the Step-7 overrides: every alert passes the dry gate, and the overrides default to production', () => {
    // one addAlert call in the whole script, inside raise(); everything else calls raise()
    expect((checker.match(/addAlert\(/g) ?? []).length).toBe(1); // the one call, inside raise()
    expect(checker).toContain('await addAlert(input);');
    expect(checker).toMatch(/if \(DRY\) \{[\s\S]{0,160}return false;\s*\}\s*await addAlert\(input\);\s*return true;/);
    // the overrides take effect only with --plant on argv (Langston: .env alone must not be able to disable alerting)
    expect(checker).toContain("const PLANT = process.argv.includes('--plant');");
    expect(checker).toContain("const LOG_DIR = (PLANT && process.env.ARCHIVAL_HEALTH_LOG_DIR) || '/var/log/dawntrader';");
    expect(checker).toContain("const CRONTAB_FILE = (PLANT && process.env.ARCHIVAL_HEALTH_CRONTAB_FILE) || '';");
    expect(checker).toContain("const DRY = PLANT && process.env.ARCHIVAL_HEALTH_DRY === '1';");
    expect(checker).toContain("if (CRONTAB_FILE) return { text: fs.readFileSync(CRONTAB_FILE, 'utf-8') };");
  });
  it('a dry run never prints ALERT, and a plant run announces itself (Langston C-1, C-2)', () => {
    const raiseCalls = (checker.match(/const raised = await raise\(\{/g) ?? []).length;
    const labelled = (checker.match(/\$\{raised \? 'ALERT' : 'DRY-ALERT'\}/g) ?? []).length;
    expect(raiseCalls).toBe(3);
    expect(labelled).toBe(raiseCalls);
    expect(checker).not.toMatch(/console\.log\(`\[archival-health\] ALERT /);
    expect(checker).toContain('[archival-health] PLANT RUN (not production)');
    expect(checker).toContain('IGNORED without --plant');
  });
  it('the cron line passes no arguments, so a cron run cannot be a plant run', () => {
    const header = /^ \*\s+0 5 \* \* \* (.*)$/m.exec(checker);
    expect(header).not.toBeNull();
    expect(header![1]).not.toContain('--plant');
  });
});
