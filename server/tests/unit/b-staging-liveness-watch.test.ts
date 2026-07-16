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
