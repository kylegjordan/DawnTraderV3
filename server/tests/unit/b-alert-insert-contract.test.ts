/**
 * B-ALERT-INSERT-CONTRACT (#1255) — the parts that need no database.
 *
 * P3 (schema parity): `unique_global_alert` lives in the database (created by the initial-schema migration) and, since
 * this batch, in `shared/schema.ts`. `AlertsService.createAlert`'s conflict target is the ORM declaration's columns, so the
 * two must name the same columns. This test reads the migration from the directory `scripts/db-migrate.ts` RESOLVES — and
 * asserts that it is that directory — because a stale second tree (`migrations/0000_flaky_freak.sql`) agrees with the old
 * ORM, and a test re-pointed at it would pass while the database disagreed (Langston, Step-1 F-3 rider).
 * DIRECTION CHECKED: database (migration) → ORM, for this one constraint. The other direction — things the ORM declares that
 * the database lacks, e.g. `system_alerts.user_id → users.id`, a foreign key the database does not have — is not checked
 * here and is recorded as a scope decision for Kyle's list (pre-audit, Langston Step-2 finding).
 *
 * P6: `formatCheckFailedMessage` keeps one row per KIND of failure (digits normalized), keeps the cause readable on the
 * banner (which renders only `message`), and is bounded.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { systemAlerts } from '../../../shared/schema';
import { formatCheckFailedMessage } from '../../services/alerts-service';

const ROOT = resolve(__dirname, '../../..');

describe('P3 — unique_global_alert: the ORM declares the database\'s columns', () => {
  it('reads the migration from the directory db-migrate.ts resolves, and the columns match the ORM', () => {
    const migrateSrc = readFileSync(join(ROOT, 'scripts/db-migrate.ts'), 'utf8');
    // The resolved directory: path.resolve(dirname(script), '..', 'drizzle', 'migrations').
    const m = migrateSrc.match(/const MIGRATIONS_DIR = path\.resolve\(\s*path\.dirname\(fileURLToPath\(import\.meta\.url\)\),\s*'\.\.',\s*'([^']+)',\s*'([^']+)',?\s*\)/);
    expect(m, 'MIGRATIONS_DIR form changed — re-derive which directory db:migrate reads before trusting this test').not.toBeNull();
    const dir = join(ROOT, m![1], m![2]);
    expect(dir).toBe(join(ROOT, 'drizzle', 'migrations')); // NOT the stale `migrations/` tree
    const sources = readdirSync(dir).filter((f) => f.endsWith('.sql') && !/rollback/i.test(f));
    const hits = sources
      .map((f) => readFileSync(join(dir, f), 'utf8').match(/ADD CONSTRAINT unique_global_alert UNIQUE \(([^)]+)\)/))
      .filter(Boolean) as RegExpMatchArray[];
    expect(hits.length).toBe(1); // created exactly once
    const dbCols = hits[0][1].split(',').map((c) => c.trim());

    const ormUnique = getTableConfig(systemAlerts).uniqueConstraints.find((u) => u.name === 'unique_global_alert');
    expect(ormUnique, 'shared/schema.ts no longer declares unique_global_alert').toBeDefined();
    expect(ormUnique!.columns.map((c) => c.name)).toEqual(dbCols);
    expect(dbCols).toEqual(['mode', 'alert_type', 'message']);
  });
});

describe('P6 — the check-failed message', () => {
  it('two errors that differ only by a number make ONE message; different errors make two', () => {
    const a = formatCheckFailedMessage(new Error('timeout after 30012ms on attempt 3'));
    const b = formatCheckFailedMessage(new Error('timeout after 29871ms on attempt 4'));
    const c = formatCheckFailedMessage(new Error('connection refused'));
    expect(a).toBe(b);
    expect(a).toBe('Feed Health Check Failed: timeout after #ms on attempt #');
    expect(c).not.toBe(a);
  });
  it('keeps only the first line and caps the cause at 200 characters', () => {
    const long = formatCheckFailedMessage(new Error(`${'x'.repeat(500)}\nsecond line`));
    expect(long.startsWith('Feed Health Check Failed: ')).toBe(true);
    expect(long).not.toContain('second line');
    expect(long.length).toBeLessThanOrEqual('Feed Health Check Failed: '.length + 201);
  });
  it('never yields an empty cause', () => {
    expect(formatCheckFailedMessage(new Error(''))).toBe('Feed Health Check Failed: unknown error');
    expect(formatCheckFailedMessage(undefined)).toBe('Feed Health Check Failed: unknown error');
  });
});
