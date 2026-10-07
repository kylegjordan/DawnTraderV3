/**
 * B-CLUSTER-BUS-PERSIST-DISPOSITION (#1159, SPRINT_TO_LIVE_PLAN row 2a0c) — the cluster bus is in-memory only.
 * The persist branch, the `cluster_bus_event` table, its `bus_event_topic` enum and the retention registration
 * leave together; the in-memory publish/subscribe path is unchanged.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dbTouched = vi.fn();
vi.mock('../../db', () => ({
  db: new Proxy({}, { get: (_t, prop) => { dbTouched(prop); return () => { throw new Error('db must not be used'); }; } }),
}));

import { ClusterBus } from '../../services/cluster-bus';

describe('ClusterBus.publish is in-memory only', () => {
  it('delivers to a subscriber and touches no database, for a formerly-persisted topic', async () => {
    const bus = new ClusterBus();
    const seen: Array<[Record<string, any>, string | undefined]> = [];
    bus.subscribe('task_completed', (payload, node) => { seen.push([payload, node]); });
    await bus.publish('task_completed', { id: 't1' }, 'node-a');
    expect(seen).toEqual([[{ id: 't1' }, 'node-a']]);
    expect(dbTouched).not.toHaveBeenCalled();
  });
  it('unsubscribe stops delivery', async () => {
    const bus = new ClusterBus();
    const handler = vi.fn();
    bus.subscribe('learning_delta', handler);
    bus.unsubscribe('learning_delta', handler);
    await bus.publish('learning_delta', { x: 1 });
    expect(handler).not.toHaveBeenCalled();
  });
});

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('fences — the persistence half stays removed', () => {
  it('cluster-bus.ts imports no database and names no table', () => {
    const src = read('server/services/cluster-bus.ts');
    expect(src).not.toMatch(/from ["']\.\.\/db["']/);
    expect(src).not.toMatch(/clusterBusEvent|insert\(/);
  });
  it('the schema declares neither the table nor its enum, and BusEventTopic is a plain union', () => {
    const schema = read('shared/schema.ts');
    expect(schema).not.toMatch(/pgTable\("cluster_bus_event"/);
    expect(schema).not.toMatch(/pgEnum\("bus_event_topic"/);
    expect(schema).toMatch(/export type BusEventTopic =\s*\r?\n\s*\| 'task_assigned'/);
  });
  it('the retention sweep does not register the table', () => {
    expect(read('server/scripts/b75-retention-sweep.ts')).not.toMatch(/cluster_bus_event/);
  });
  it('the removal migration is registered, its rollback is not, and the rollback runs before any code revert', () => {
    const lines = new Set(read('drizzle/migrations/MANIFEST.txt').split(/\r?\n/).map((l) => l.trim()));
    expect(lines.has('2026-10-07-b-cluster-bus-persist-remove.sql')).toBe(true);
    expect(lines.has('2026-10-07-b-cluster-bus-persist-remove-rollback.sql')).toBe(false);
    const fwd = read('drizzle/migrations/2026-10-07-b-cluster-bus-persist-remove.sql');
    expect(fwd).toMatch(/DROP TABLE IF EXISTS cluster_bus_event;/);
    expect(fwd).toMatch(/DROP TYPE IF EXISTS bus_event_topic;/);
    expect(fwd).not.toMatch(/^\s*DROP [^;]*CASCADE/m); // code form: the header comment names the word on purpose
    expect(fwd).toMatch(/constant_name = 'cluster_bus_event\.hot_retention_days'/);
    const rb = read('drizzle/migrations/2026-10-07-b-cluster-bus-persist-remove-rollback.sql');
    expect(existsSync(join(ROOT, 'drizzle/migrations/2026-10-07-b-cluster-bus-persist-remove-rollback.sql'))).toBe(true);
    expect(rb).toMatch(/RUN THIS FIRST, THEN REVERT THE CODE/);
    expect(rb).toMatch(/'cluster_bus_event\.hot_retention_days', '30'::jsonb/);
  });
});
