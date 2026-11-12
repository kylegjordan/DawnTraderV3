/** B-CRON-MISSED-CATCHUP (#691): canonical exact-key stale-alert resolution. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'cron-recovery-alerts-'));
process.env.SYSTEM_ALERTS_FILE = join(dir, 'system-alerts.jsonl');

let alerts: typeof import('../../services/system-alerts');
beforeAll(async () => { alerts = await import('../../services/system-alerts'); });

const OCCURRENCE_ID = '4fa8bd6b-cd87-42bd-879a-dc9493cf4308';
const EVIDENCE =
  `cron occurrence ${OCCURRENCE_ID} policy b-cron-missed-catchup/v1 `
  + 'terminal 2026-11-12T12:01:10.000Z';
const base = {
  triggers_at: new Date(),
  category: 'breakage',
  severity: 'warning' as const,
  title: 'test',
  body: 'test',
};

describe('cron-recovery alert ownership', () => {
  it('resolves the matching stale row by returned ID and stores the exact actor and transport', async () => {
    const key = 'cron_stale:formula_audit_cron:2026-11-12T12:01:00.000Z';
    const stale = await alerts.addAlert({ ...base, dedupe_key: key });
    const ids = await alerts.resolveAlertsByDedupeKey(key, 'cron-recovery', EVIDENCE, 'engine');
    expect(ids).toEqual([stale.id]);
    const stored = alerts.readAllAlerts().find((row) => row.id === stale.id)!;
    expect(stored).toMatchObject({
      state: 'resolved',
      resolved_by_claimed: 'cron-recovery',
      resolved_by_transport: 'engine',
      resolution_evidence: EVIDENCE,
    });
  });

  it('refuses an unallowlisted actor and leaves the exact row open', async () => {
    const key = 'cron_stale:feed_integrity_cron:2026-11-12T12:05:00.000Z';
    const stale = await alerts.addAlert({ ...base, dedupe_key: key });
    await expect(
      alerts.resolveAlertsByDedupeKey(key, 'cron-recovery-typo', EVIDENCE, 'engine'),
    ).rejects.toThrow();
    expect(alerts.readAllAlerts().find((row) => row.id === stale.id)?.state).not.toBe('resolved');
  });

  it('never resolves the manual-only cron_verifier_blind family', async () => {
    const blind = await alerts.addAlert({ ...base, dedupe_key: 'cron_verifier_blind:history_read' });
    await alerts.resolveAlertsByDedupeKey(
      'cron_stale:xstock_qd_probe_cron:2026-11-12T12:10:00.000Z',
      'cron-recovery',
      EVIDENCE,
      'engine',
    );
    expect(alerts.readAllAlerts().find((row) => row.id === blind.id)?.state).not.toBe('resolved');
  });

  it('registers cron-recovery as a machine actor', () => {
    expect(alerts.ALERT_ACTORS.find((actor) => actor.value === 'cron-recovery')?.tag).toBe('machine');
  });
});
