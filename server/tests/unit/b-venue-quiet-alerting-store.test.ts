/**
 * B-VENUE-QUIET-ALERTING (row 3a1) — the alert-store primitives: resolve by dedupe key (objective 7), the engine actor and
 * transport (objective 8, the #987 gate stays total), and the standing record's metadata merge. Runs against a temp file.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'vq-store-'));
process.env.SYSTEM_ALERTS_FILE = join(dir, 'system-alerts.jsonl');

let sa: typeof import('../../services/system-alerts');
beforeAll(async () => { sa = await import('../../services/system-alerts'); });

const UUID = '21e9c8ce-bee5-4541-bca9-80404d7dc655';
const base = { triggers_at: new Date(), category: 'breakage', severity: 'warning' as const, title: 't', body: 'b' };

describe('resolveAlertsByDedupeKey', () => {
  it('resolves the non-terminal row for the key as active-exit-monitor over transport engine, with the uuid as evidence', async () => {
    const a = await sa.addAlert({ ...base, dedupe_key: 'price-skip-paper-OKTA/USD' });
    const ids = await sa.resolveAlertsByDedupeKey('price-skip-paper-OKTA/USD', 'active-exit-monitor', UUID, 'engine');
    expect(ids).toEqual([a.id]);
    const row = sa.readAllAlerts().find((r) => r.id === a.id)!;
    expect(row.state).toBe('resolved');
    expect(row.resolved_by_claimed).toBe('active-exit-monitor');
    expect(row.resolved_by_transport).toBe('engine');
    expect(row.resolution_evidence).toBe(UUID);
  });
  it('no matching row is a no-op', async () => {
    expect(await sa.resolveAlertsByDedupeKey('price-skip-paper-NONE/USD', 'active-exit-monitor', UUID, 'engine')).toEqual([]);
  });
  it('a multi-match (impossible through addAlert) resolves every row', async () => {
    const f = process.env.SYSTEM_ALERTS_FILE as string;
    const now = new Date().toISOString();
    const row = (id: string) => JSON.stringify({ schema_version: 1, id, created_at: now, triggers_at: now, fired_at: null,
      acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by_claimed: null, resolved_by_transport: null,
      resolution_evidence: null, state: 'active', category: 'breakage', severity: 'warning', title: 't', body: 'b', metadata: {},
      recurrence_interval_seconds: null, dedupe_key: 'price-skip-paper-DUP/USD' });
    writeFileSync(f, readFileSync(f, 'utf8') + row('aaaaaaaa-0000-4000-8000-000000000001') + '\n' + row('aaaaaaaa-0000-4000-8000-000000000002') + '\n');
    const ids = await sa.resolveAlertsByDedupeKey('price-skip-paper-DUP/USD', 'active-exit-monitor', UUID, 'engine');
    expect(ids.sort()).toEqual(['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002']);
  });
  it('the #987 gate stays total: an unknown actor is refused even through the by-key path', async () => {
    await sa.addAlert({ ...base, dedupe_key: 'price-skip-paper-REF/USD' });
    await expect(sa.resolveAlertsByDedupeKey('price-skip-paper-REF/USD', 'exit-monitor-typo', UUID, 'engine')).rejects.toThrow();
  });
  it('active-exit-monitor is a MACHINE actor, so the deploy tool can never take it as an identity', () => {
    const a = sa.ALERT_ACTORS.find((x) => x.value === 'active-exit-monitor');
    expect(a?.tag).toBe('machine');
  });
});

describe('mergeAlertMetadata', () => {
  it('merges into a live row and refuses a resolved one', async () => {
    const a = await sa.addAlert({ ...base, category: 'health_check', severity: 'info', metadata: { members: {} }, dedupe_key: 'venue-quiet-paper-xstock_spot' });
    const merged = await sa.mergeAlertMetadata(a.id, { members: { p1: { symbol: 'CAG/USD' } } });
    expect((merged?.metadata as any).members.p1.symbol).toBe('CAG/USD');
    await sa.resolveAlertsByDedupeKey('venue-quiet-paper-xstock_spot', 'active-exit-monitor', UUID, 'engine');
    expect(await sa.mergeAlertMetadata(a.id, { x: 1 })).toBeNull();
  });
  it('the standing record (info, health_check) is never delivered to Discord', () => {
    expect(sa.shouldDeliverToDiscord({ severity: 'info', category: 'health_check' })).toBe(false);
    expect(sa.shouldDeliverToDiscord({ severity: 'warning', category: 'breakage' })).toBe(true);
  });
});
