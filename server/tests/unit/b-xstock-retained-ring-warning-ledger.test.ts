import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddAlertOptions } from '../../services/system-alerts.js';

vi.mock('node:fs', async (importOriginal) => {
  const source = await importOriginal<typeof import('node:fs')>();
  return { ...source, renameSync: vi.fn(source.renameSync) };
});

// The real writer and dispatcher share this key. These controls exercise the
// file boundary before the monotonic incident monitor is connected to it.
const KEY = 'book-state-ring-snapshot-failing';
const RECOVERY_EVIDENCE = 'server/tests/unit/b-xstock-retained-ring-warning-ledger.test.ts:1';
const FIRST_ELIGIBLE_MS = 300_000;
const episode = (ringIncidentId: string, elapsedMs: number): AddAlertOptions => ({
  triggers_at: new Date(0),
  category: 'breakage',
  severity: 'warning',
  title: 'xStock book-state ring snapshots failing',
  body: 'Isolated retained-ring warning test',
  dedupe_key: KEY,
  metadata: { ringIncidentId, elapsedMs },
});

let directory: string;
let ledger: string;
let alerts: typeof import('../../services/system-alerts.js');

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xstock-ring-warning-'));
  ledger = path.join(directory, 'alerts.jsonl');
  vi.stubEnv('SYSTEM_ALERTS_FILE', ledger);
  alerts = await import('../../services/system-alerts.js');
});
beforeEach(() => fs.writeFileSync(ledger, ''));
afterAll(() => {
  vi.unstubAllEnvs();
  for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
  fs.rmdirSync(directory);
});

describe('retained-ring warning ledger controls', () => {
  it('keeps B behind A, then promotes exactly one B after A resolves and B retries', async () => {
    const a = await alerts.addAlert(episode('A', FIRST_ELIGIBLE_MS));
    expect((await alerts.fireDue()).map(row => row.id)).toEqual([a.id]);

    const blocked = await alerts.addAlert(episode('B', FIRST_ELIGIBLE_MS));
    expect(blocked.id).toBe(a.id);
    expect(blocked.metadata.ringIncidentId).toBe('A');
    await alerts.resolveAlert(a.id, 'codex-c', RECOVERY_EVIDENCE, 'cli');
    // Omission control. With no retry, nothing gets promoted for B.
    expect((await alerts.fireDue()).map(row => row.id)).toEqual([]);
    expect(alerts.readAllAlerts().map(row => [row.id, row.state])).toEqual([[a.id, 'resolved']]);

    const stillOutstanding = episode('B', FIRST_ELIGIBLE_MS + 30_000);
    const b = await alerts.addAlert(stillOutstanding);
    expect(b.id).not.toBe(a.id);
    expect((await alerts.addAlert(stillOutstanding)).id).toBe(b.id);
    expect((await alerts.fireDue()).map(row => row.id)).toEqual([b.id]);
    expect(await alerts.fireDue()).toEqual([]);
    const rows = alerts.readAllAlerts();
    expect(rows.map(row => [row.id, row.state])).toEqual([[a.id, 'resolved'], [b.id, 'active']]);
    expect(rows[0].resolution_evidence).toBe(RECOVERY_EVIDENCE);
    expect(rows[1].acknowledged_at).toBeNull();
    expect(rows[1].metadata).toEqual(stillOutstanding.metadata);
  });

  it('can retry a failed atomic rename, and can find a committed rename after a lost reply', async () => {
    const options = episode('rename-incident', FIRST_ELIGIBLE_MS);
    const { renameSync } = await vi.importActual<typeof import('node:fs')>('node:fs');
    const fault = vi.mocked(fs.renameSync);
    fault.mockImplementationOnce(() => { throw new Error('rename did not commit'); });
    await expect(alerts.addAlert(options)).rejects.toThrow('rename did not commit');
    expect(alerts.readAllAlerts()).toEqual([]);

    fault.mockImplementationOnce((from, to) => {
      renameSync(from, to);
      throw new Error('reply lost after rename');
    });
    await expect(alerts.addAlert(options)).rejects.toThrow('reply lost after rename');
    const persisted = alerts.readAllAlerts();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ dedupe_key: KEY, state: 'scheduled', metadata: options.metadata });
    expect((await alerts.addAlert(options)).id).toBe(persisted[0].id);
    expect(alerts.readAllAlerts()).toHaveLength(1);
  });
});
