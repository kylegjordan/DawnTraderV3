/**
 * B-NEW-51 — system-alerts dedup tests.
 *
 * Verifies the optional `dedupe_key` on `addAlert`: a non-terminal alert with
 * the same key suppresses a duplicate; a `resolved` same-key alert does NOT;
 * and callers that omit the key keep the original always-append behavior.
 *
 * Uses SYSTEM_ALERTS_FILE env-override (B-NEW-51) to point the library at a
 * throwaway tmp file instead of the staging /var/log path.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const TMP = path.join(os.tmpdir(), `sa-dedup-test-${process.pid}.jsonl`);
process.env.SYSTEM_ALERTS_FILE = TMP;

function clean() {
  for (const f of [TMP, `${TMP}.lock`]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
}

beforeEach(clean);
afterAll(clean);

async function load() {
  // Static import is fine — env is set above before any import resolves.
  return await import('../../services/system-alerts.js');
}

const base = {
  triggers_at: new Date().toISOString(),
  category: 'breakage' as const,
  severity: 'warning' as const,
  title: 'test',
  body: 'test body',
};

describe('B-NEW-51 system-alerts dedup', () => {
  it('suppresses a duplicate when a non-terminal alert with the same dedupe_key exists', async () => {
    const { addAlert, readAllAlerts } = await load();
    const a = await addAlert({ ...base, dedupe_key: 'k1' });
    const b = await addAlert({ ...base, dedupe_key: 'k1' });
    expect(b.id).toBe(a.id);               // returned the existing one
    expect(readAllAlerts()).toHaveLength(1); // only one persisted
  });

  it('allows a new alert once the same-key alert is resolved', async () => {
    const { addAlert, resolveAlert, readAllAlerts } = await load();
    const a = await addAlert({ ...base, dedupe_key: 'k2' });
    await resolveAlert(a.id, 'test');
    const c = await addAlert({ ...base, dedupe_key: 'k2' });
    expect(c.id).not.toBe(a.id);            // fresh alert created
    expect(readAllAlerts()).toHaveLength(2); // resolved + new
  });

  it('still dedups against an ACKNOWLEDGED same-key alert (non-terminal)', async () => {
    const { addAlert, fireDue, ackAlert, readAllAlerts } = await load();
    const a = await addAlert({ ...base, dedupe_key: 'k3' });
    await fireDue();                  // scheduled → active
    await ackAlert(a.id, 'test');     // active → acknowledged (non-terminal)
    const d = await addAlert({ ...base, dedupe_key: 'k3' });
    expect(d.id).toBe(a.id);
    expect(readAllAlerts()).toHaveLength(1);
  });

  it('no dedupe_key → always appends (backward-compatible)', async () => {
    const { addAlert, readAllAlerts } = await load();
    await addAlert({ ...base });
    await addAlert({ ...base });
    expect(readAllAlerts()).toHaveLength(2);
  });

  it('different dedupe_keys do not collide', async () => {
    const { addAlert, readAllAlerts } = await load();
    await addAlert({ ...base, dedupe_key: 'kA' });
    await addAlert({ ...base, dedupe_key: 'kB' });
    expect(readAllAlerts()).toHaveLength(2);
  });
});
