/**
 * B-DISK-FILE-TIERING (#1233) amendment 1 — H-3 (cadence-aware archival-health checks) and H-2 (the liveness
 * watchdog watches archival-health by reading its log's CONTENT). Langston's conditions C-1/C-2 pinned here.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cadenceVerdict, ARCHIVAL_SETTLE_MS } from '../../services/archival-cadence';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const T = (iso: string) => Date.parse(iso);

describe('H-3 — cadenceVerdict', () => {
  it('a daily job that ran at its fire reads ok at the next 05:00Z check', () => {
    expect(cadenceVerdict('45 2 * * *', T('2026-11-05T02:45:03Z'), T('2026-11-05T05:00:02Z')).kind).toBe('ok');
  });
  it('one missed night of a daily job is caught at the very next 05:00Z (the old 26 h grace passed it)', () => {
    const v = cadenceVerdict('45 2 * * *', T('2026-11-04T02:45:03Z'), T('2026-11-05T05:00:02Z'));
    expect(v.kind).toBe('stale');
    if (v.kind === 'stale') expect(new Date(v.dueMs).toISOString()).toBe('2026-11-05T02:45:00.000Z');
  });
  it('a missed monthly rotator is caught on the 1st, not the 4th', () => {
    expect(cadenceVerdict('0 3 1 * *', T('2026-11-01T03:00:05Z'), T('2026-12-01T05:00:02Z')).kind).toBe('stale');
    expect(cadenceVerdict('0 3 1 * *', T('2026-12-01T03:00:05Z'), T('2026-12-01T05:00:02Z')).kind).toBe('ok');
  });
  it('the settle: a fire inside the last 15 min is not judged yet (inert today, a fence)', () => {
    // fire 04:50, check 05:00, log last written at the previous day's run -> judged against 2026-11-04 04:50
    expect(ARCHIVAL_SETTLE_MS).toBe(15 * 60 * 1000);
    expect(cadenceVerdict('50 4 * * *', T('2026-11-04T04:50:02Z'), T('2026-11-05T05:00:00Z')).kind).toBe('ok');
    expect(cadenceVerdict('50 4 * * *', T('2026-11-04T04:50:02Z'), T('2026-11-05T05:06:00Z')).kind).toBe('stale');
  });
  it('an unparseable schedule is MISCONFIGURED — never ok, never a throw (C-2)', () => {
    expect(cadenceVerdict('not a cron', T('2026-11-05T02:45:03Z'), T('2026-11-05T05:00:02Z')).kind).toBe('misconfigured');
  });
});

describe('H-3 — the archival-health source', () => {
  const src = read('server/scripts/b-storage-archival-health.ts');
  const checks = [...src.matchAll(/name: '([a-z0-9-]+)',[\s\S]*?schedule: '([^']+)'/g)].map((m) => ({ name: m[1], schedule: m[2] }));

  it('every check carries a schedule and no graceMs remains', () => {
    expect(checks.map((c) => c.name)).toEqual(['b75-retention', 'b75-cold-rotator', 'b75-cold-liveness', 'disk-file-tiering']);
    expect(src).not.toMatch(/graceMs/);
  });

  it("each schedule equals the Cron line in its subject script's header (the fence's reach is a typo, stated in the code)", () => {
    const subject: Record<string, string> = {
      'b75-retention': 'server/scripts/b75-retention-sweep.ts',
      'b75-cold-rotator': 'server/scripts/b75-cold-rotator.ts',
      'b75-cold-liveness': 'server/scripts/b75-cold-liveness.ts',
      'disk-file-tiering': 'server/scripts/b-disk-file-tiering.ts',
    };
    for (const c of checks) {
      const header = read(subject[c.name]);
      const m = /^ \*\s+((?:\S+\s+){4}\S+)\s+(?:su - deploy|deploy)\b/m.exec(header);
      expect(m, `${c.name}: header Cron line found`).not.toBeNull();
      expect(m![1].trim().split(/\s+/).join(' ')).toBe(c.schedule);
    }
  });

  it('a misconfigured schedule pages through fire(), and one throwing check cannot end the run (C-2)', () => {
    expect(src).toMatch(/cadence\.kind === 'misconfigured'[\s\S]{0,80}await fire\(\s*spec,\s*'misconfigured'/);
    expect(src).toMatch(/try \{\s*ok = await runCheck\(spec, nowMs\);\s*\} catch \(err\) \{\s*await fire\(spec, 'errored'/);
  });
});

describe('H-2 — the liveness watchdog reads archival-health by CONTENT (C-1)', () => {
  let mod: any;
  const now = T('2026-11-05T12:00:00Z');
  const lines = (...l: string[]) => l.join('\n') + '\n';

  it('loads', async () => {
    mod = await import('../../scripts/staging-liveness-watchdog.mjs');
    expect(typeof mod.archivalHealthRan).toBe('function');
  });
  it('started after the due 05:00Z and finished -> ok', () => {
    expect(mod.archivalHealthRan(lines('[archival-health] started at 2026-11-05T05:00:02.111Z', '[archival-health] DONE — all_ok=true checks=5'), now).ok).toBe(true);
  });
  it("yesterday's complete run only -> not ok (today's did not start)", () => {
    expect(mod.archivalHealthRan(lines('[archival-health] started at 2026-11-04T05:00:02.111Z', '[archival-health] DONE — all_ok=true checks=5'), now).ok).toBe(false);
  });
  it("today's run started and wrote fatal (no DONE after it) -> not ok, though an older DONE exists above", () => {
    const t = lines('[archival-health] started at 2026-11-04T05:00:02.111Z', '[archival-health] DONE — all_ok=true checks=5',
      '[archival-health] started at 2026-11-05T05:00:02.111Z', '[archival-health] fatal: Error: boom');
    expect(mod.archivalHealthRan(t, now).ok).toBe(false);
  });
  it('an empty log (e.g. a logrotate create advanced the mtime) -> not ok', () => {
    expect(mod.archivalHealthRan('', now).ok).toBe(false);
  });
  it("before 05:30Z the due run is yesterday's, so yesterday's complete run is still ok", () => {
    expect(mod.archivalHealthRan(lines('[archival-health] started at 2026-11-04T05:00:02.111Z', '[archival-health] DONE — all_ok=true checks=5'), T('2026-11-05T05:10:00Z')).ok).toBe(true);
  });
  it("the watchdog's fire time equals archival-health's own header Cron line (0 5 * * *)", () => {
    const header = read('server/scripts/b-storage-archival-health.ts');
    expect(/^ \*\s+0 5 \* \* \* su - deploy/m.test(header)).toBe(true);
    expect(mod.ARCHIVAL_HEALTH_FIRE_UTC).toEqual({ hour: 5, minute: 0 });
  });
  it('a missing log is a FAIL, never a skip (returns false, not null)', () => {
    const src = read('server/scripts/staging-liveness-watchdog.mjs');
    expect(src).toMatch(/err\.code === 'ENOENT'\) \{ archivalReading = .*?; return false; \}/);
  });
});
