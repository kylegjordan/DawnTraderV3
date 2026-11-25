import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db.js';

const readSql = (path: string) => readFileSync(resolve(__dirname, '../../..', path), 'utf8');
const seed = readSql('drizzle/migrations/2026-11-08-b-price-side-8c-level-build-knobs.sql');
const forward = readSql('drizzle/migrations/2026-11-25-b-price-side-8c-off-removal.sql');
const rollback = readSql('drizzle/migrations/2026-11-25-b-price-side-8c-off-removal-rollback.sql');
const liveGate = readSql('scripts/b8c-off-removal-stage-a-census.sql');
const switchName = ['crypto', 'birth', 'sided', 'enabled'].join('_');
const turnOn = `UPDATE module_constants SET value = '1', updated_by = 'kd-91-8c-switch-on-cc-c',
  updated_at = '2026-11-16T09:45:01.351822Z' WHERE constant_name = '${switchName}'`;
const fixture = `
  CREATE TEMP TABLE module_constants (
    module_name text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    strategy text NOT NULL,
    regime text NOT NULL,
    constant_name text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamptz,
    updated_by text,
    PRIMARY KEY (module_name, exchange, asset_class, strategy, regime, constant_name)
  );
  INSERT INTO module_constants VALUES ('level_basis', '*', 'xstock_spot', '*', '*',
    'outside_crypto_population', 'true', now(), 'fixture');
`;

// Use the approved pool configured by Vitest against disposable Postgres. Give each case
// its own session so the actual SQL cannot see the persistent module_constants table.
describe.runIf(process.env.CI === 'true' || process.env.DT_B8C_LOCAL_POSTGRES === '1')('8c Phase B PostgreSQL', () => {
  let db: PoolClient | undefined;
  const query = (sql: string) => db!.query(sql);
  const snapshot = async () => (await query(
    'SELECT to_jsonb(module_constants) AS raw FROM module_constants ORDER BY asset_class, constant_name, exchange',
  )).rows.map(row => row.raw);

  beforeEach(async () => {
    const target = new URL(pool.options.connectionString ?? '');
    if (!['localhost', '127.0.0.1'].includes(target.hostname)
      || target.port !== '5432' || target.pathname !== '/test' || target.username !== 'test') {
      throw new Error('8c PostgreSQL tests require the disposable loopback test database');
    }
    db = await pool.connect();
    await query(fixture);
    await query(seed);
  });
  afterEach(() => {
    db?.release(true); // Close the session, including its temporary objects and any failed transaction.
    db = undefined;
  });

  it.each([false, true])('deletes just the switch and preserves every other row (live ON = %s)', async on => {
    if (on) await query(turnOn);
    const before = await snapshot();
    expect(before).toHaveLength(5);
    expect((await query(liveGate)).rows).toEqual([{ gate: on ? 'PASS' : 'REFUSE', crypto_rows: '4' }]);
    await query(forward);
    expect(await snapshot()).toEqual(before.filter(row => row.constant_name !== switchName));
  });

  it.each([
    ['missing', "DELETE FROM module_constants WHERE constant_name = 'level_build_drift_ref_60s'"],
    ['extra', "UPDATE module_constants SET asset_class = 'crypto_spot' WHERE asset_class = 'xstock_spot'"],
    ['misdimensioned retained row', "UPDATE module_constants SET exchange = 'kraken' WHERE constant_name = 'level_build_max_age_ms'"],
    ['misdimensioned switch', `UPDATE module_constants SET strategy = 'breakout' WHERE constant_name = '${switchName}'`],
    ['wrong value', "UPDATE module_constants SET value = '0.00430' WHERE constant_name = 'level_build_drift_ref_60s'"],
    ['wrong switch value', `UPDATE module_constants SET value = '2' WHERE constant_name = '${switchName}'`],
    ['tampered OFF updater', `UPDATE module_constants SET updated_by = 'operator' WHERE constant_name = '${switchName}'`],
    ['unequal provenance', "UPDATE module_constants SET updated_at = updated_at + interval '1 microsecond' WHERE constant_name = 'level_build_max_age_ms'"],
    ['null seed timestamp', `UPDATE module_constants SET updated_at = NULL WHERE constant_name = '${switchName}'`],
    ['null seed updater', "UPDATE module_constants SET updated_by = NULL WHERE constant_name = 'level_build_max_age_ms'"],
  ])('refuses a %s population without deleting a row', async (_case, mutate) => {
    await query(mutate);
    const before = await snapshot();
    expect((await query(liveGate)).rows[0].gate).toBe('REFUSE');
    await expect(query(forward)).rejects.toThrow(/8c Phase B precondition/);
    await query('ROLLBACK');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back a postcondition failure caused by retained-row drift during delete', async () => {
    await query(turnOn);
    await query(`
      CREATE FUNCTION pg_temp.damage_retained() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE module_constants SET value = '10' WHERE constant_name = 'level_build_max_age_ms';
        RETURN OLD;
      END $$;
      CREATE TRIGGER damage_retained AFTER DELETE ON module_constants
        FOR EACH ROW EXECUTE PROCEDURE pg_temp.damage_retained();
    `);
    const before = await snapshot();
    await expect(query(forward)).rejects.toThrow(/8c Phase B postcondition/);
    await query('ROLLBACK');
    expect(await snapshot()).toEqual(before);
  });

  it('recovers the exact ON tuple and refuses a repeated rollback', async () => {
    await query(turnOn);
    const before = await snapshot();
    await query(forward);
    await query(rollback);
    expect(await snapshot()).toEqual(before);
    expect((await query(liveGate)).rows).toEqual([{ gate: 'PASS', crypto_rows: '4' }]);
    await expect(query(rollback)).rejects.toThrow(/staging recovery requires three exact retained rows/);
    await query('ROLLBACK');
    expect(await snapshot()).toEqual(before);
  });
});
