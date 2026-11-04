/**
 * B-STAGING-LIVENESS-WATCH — the fallback template CANNOT drift from addAlert.
 *
 * The watchdog's direct-append fallback (staging-liveness-watchdog.mjs) writes
 * alert rows when the app/CLI is broken — the exact moment validation can't run.
 * This test pins the fallback template's SHAPE against a REAL addAlert row:
 * a schema change that forgets the fallback breaks the BUILD, not the outage
 * report (Langston Step-2 item 3a). Also pins the fallback's dedupe scan
 * semantics (item 3b: CLI + fallback converge on ONE alert per outage).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slw-test-'));
const tmpAlerts = path.join(tmpDir, 'system-alerts.jsonl');
process.env.SYSTEM_ALERTS_FILE = tmpAlerts; // must be set BEFORE system-alerts loads

// Dynamic imports so the env override above governs ALERTS_FILE.
let addAlert: any;
let buildFallbackAlert: any;
let fileHasOpenDedupeKey: any;

beforeAll(async () => {
  ({ addAlert } = await import('../../services/system-alerts.js'));
  ({ buildFallbackAlert, fileHasOpenDedupeKey } = await import('../../scripts/staging-liveness-watchdog.mjs'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('fallback template shape-equality vs addAlert (drift breaks the build)', () => {
  it('the fallback row carries EXACTLY the key set of a real addAlert row', async () => {
    const real = await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'critical',
      title: 'shape control',
      body: 'shape control',
      metadata: { source: 'test' },
      dedupe_key: 'shape-control',
    });
    const fallback = buildFallbackAlert({
      title: 'shape probe',
      body: 'shape probe',
      dedupeKey: 'shape-probe',
      metadata: {},
    });
    expect(Object.keys(fallback).sort()).toEqual(Object.keys(real).sort());
    expect(fallback.schema_version).toBe(real.schema_version);
    expect(fallback.state).toBe('scheduled');
    expect(fallback.category).toBe('breakage');
  });

  it('a fallback row round-trips through the file and parses as a valid entry', () => {
    const row = buildFallbackAlert({ title: 't', body: 'b', dedupeKey: 'roundtrip-key', metadata: {} });
    fs.appendFileSync(tmpAlerts, JSON.stringify(row) + '\n');
    const back = fs.readFileSync(tmpAlerts, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const found = back.find((r) => r.dedupe_key === 'roundtrip-key');
    expect(found).toBeTruthy();
    expect(found.severity).toBe('critical');
  });
});

describe('fallback dedupe: idempotent against file contents, converges with the CLI path', () => {
  it('detects a non-resolved row with the same dedupe_key (CLI-written OR fallback-written)', async () => {
    await addAlert({
      triggers_at: new Date(), category: 'breakage', severity: 'critical',
      title: 'outage', body: 'outage', dedupe_key: 'watchdog-http',
    });
    expect(fileHasOpenDedupeKey(tmpAlerts, 'watchdog-http')).toBe(true);
    expect(fileHasOpenDedupeKey(tmpAlerts, 'watchdog-never-written')).toBe(false);
  });

  it('a RESOLVED row does not block a fresh alert for a NEW outage (matches addAlert semantics)', () => {
    const resolved = { ...buildFallbackAlert({ title: 'old', body: 'old', dedupeKey: 'watchdog-engine', metadata: {} }), state: 'resolved' };
    fs.appendFileSync(tmpAlerts, JSON.stringify(resolved) + '\n');
    expect(fileHasOpenDedupeKey(tmpAlerts, 'watchdog-engine')).toBe(false);
  });

  it('tolerates a torn/corrupt line without failing the scan', () => {
    fs.appendFileSync(tmpAlerts, '{"torn json\n');
    expect(fileHasOpenDedupeKey(tmpAlerts, 'watchdog-http')).toBe(true);
  });
});

// B-DISK-FILE-TIERING (#1233, pre-audit P7): the server-disk checks, their category, the honest
// dedupe log, and the clear edge that stops a recovered outage from swallowing the next one.
describe('B-DISK-FILE-TIERING — category, dedupe discriminator, clear edge, disk reading', () => {
  let mod: any;
  let alerts: any;
  beforeAll(async () => {
    mod = await import('../../scripts/staging-liveness-watchdog.mjs');
    alerts = await import('../../services/system-alerts.js');
  });

  it('the fallback carries the category it is given and keeps the addAlert key set (C3)', async () => {
    const real = await alerts.addAlert({
      triggers_at: new Date(), category: 'health_check', severity: 'warning',
      title: 'disk shape control', body: 'x', dedupe_key: 'disk-shape-control',
    });
    const fb = mod.buildFallbackAlert({ title: 't', body: 'b', dedupeKey: 'server-disk-utilization-warning', metadata: {}, severity: 'warning', category: 'health_check' });
    expect(Object.keys(fb).sort()).toEqual(Object.keys(real).sort());
    expect([fb.category, fb.severity]).toEqual(['health_check', 'warning']);
  });

  it('a dedupe returns the EXISTING row, so its triggers_at differs from the one just sent — the discriminator holds (C4)', async () => {
    const first = await alerts.addAlert({ triggers_at: new Date('2026-11-04T10:00:00Z'), category: 'health_check', severity: 'warning', title: 'd1', body: 'd1', dedupe_key: 'disc-key' });
    const sent = new Date('2026-11-04T11:00:00Z');
    const second = await alerts.addAlert({ triggers_at: sent, category: 'health_check', severity: 'warning', title: 'd2', body: 'd2', dedupe_key: 'disc-key' });
    expect(second.id).toBe(first.id);
    expect(second.triggers_at).not.toBe(sent.toISOString());
  });

  it('cliJson reads the CLI\'s JSON after npm\'s preamble, and returns null when there is none', () => {
    expect(mod.cliJson('\n> dawntrader@1.0.0 system-alerts\n> tsx scripts/system-alerts.ts add\n\n{\n  "id": "abc",\n  "dedupe_key": "k"\n}\n')).toEqual({ id: 'abc', dedupe_key: 'k' });
    expect(mod.cliJson('{"resolved":[]}')).toEqual({ resolved: [] });
    expect(mod.cliJson('npm ERR! nothing here')).toBeNull();
  });

  it('the clear edge: resolving by key under the watchdog actor stamps cli, and the NEXT outage mints a new row (B1, B2)', async () => {
    const open = await alerts.addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'critical', title: 'outage 1', body: 'o', dedupe_key: 'watchdog-pm2' });
    expect(mod.fileHasOpenDedupeKey(tmpAlerts, 'watchdog-pm2')).toBe(true);
    const ids = await alerts.resolveAlertsByDedupeKey('watchdog-pm2', 'staging-liveness-watchdog', `watchdog run ${crypto.randomUUID()}: cleared`, 'cli');
    expect(ids).toEqual([open.id]);
    const row = alerts.readAllAlerts().find((r: any) => r.id === open.id);
    expect([row.state, row.resolved_by_claimed, row.resolved_by_transport]).toEqual(['resolved', 'staging-liveness-watchdog', 'cli']);
    expect(mod.fileHasOpenDedupeKey(tmpAlerts, 'watchdog-pm2')).toBe(false);
    const next = await alerts.addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'critical', title: 'outage 2', body: 'o', dedupe_key: 'watchdog-pm2' });
    expect(next.id).not.toBe(open.id);
  });

  it('envNumber: an unset override falls back, a numeric one is used, a typo THROWS rather than comparing against NaN', () => {
    delete process.env.WD_TEST_NUM;
    expect(mod.envNumber('WD_TEST_NUM', 85)).toBe(85);
    process.env.WD_TEST_NUM = '1';
    expect(mod.envNumber('WD_TEST_NUM', 85)).toBe(1);
    process.env.WD_TEST_NUM = '8S';
    expect(() => mod.envNumber('WD_TEST_NUM', 85)).toThrow(/not a number/);
    delete process.env.WD_TEST_NUM;
  });

  it('diskUsage is df\'s Use%: used / (used + available to unprivileged users)', () => {
    // 100 blocks of 4096: 20 free, of which 15 available to users ⇒ used 80, Use% = 80 / 95.
    const d = mod.diskUsage({ blocks: 100, bfree: 20, bavail: 15, bsize: 4096 });
    expect(d.usedPct).toBeCloseTo((80 / 95) * 100, 6);
    expect(d.freeBytes).toBe(15 * 4096);
  });
});
