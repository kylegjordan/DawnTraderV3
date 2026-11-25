import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

// The CI Postgres service is disposable. A fixed loopback URL and a session-local table keep
// the actual migration and rollback files isolated from the real module_constants table.
describe.runIf(process.env.CI === 'true' || process.env.DT_B8C_LOCAL_POSTGRES === '1')('8c Phase B PostgreSQL', () => {
  let db: Client;
  const snapshot = async () => (await db.query(
    'SELECT to_jsonb(module_constants) AS raw FROM module_constants ORDER BY asset_class, constant_name, exchange',
  )).rows.map(row => row.raw);

  beforeEach(async () => {
    db = new Client({ connectionString: 'postgresql://test:test@127.0.0.1:5432/test', connectionTimeoutMillis: 4000 });
    await db.connect();
    await db.query(fixture);
    await db.query(seed);
  });
  afterEach(async () => { await db.end(); });

  it.each([false, true])('deletes just the switch and preserves every other row (live ON = %s)', async on => {
    if (on) await db.query(turnOn);
    const before = await snapshot();
    expect(before).toHaveLength(5);
    expect((await db.query(liveGate)).rows).toEqual([{ gate: on ? 'PASS' : 'REFUSE', crypto_rows: '4' }]);
    await db.query(forward);
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
    await db.query(mutate);
    const before = await snapshot();
    expect((await db.query(liveGate)).rows[0].gate).toBe('REFUSE');
    await expect(db.query(forward)).rejects.toThrow(/8c Phase B precondition/);
    await db.query('ROLLBACK');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back a postcondition failure caused by retained-row drift during delete', async () => {
    await db.query(turnOn);
    await db.query(`
      CREATE FUNCTION pg_temp.damage_retained() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE module_constants SET value = '10' WHERE constant_name = 'level_build_max_age_ms';
        RETURN OLD;
      END $$;
      CREATE TRIGGER damage_retained AFTER DELETE ON module_constants
        FOR EACH ROW EXECUTE PROCEDURE pg_temp.damage_retained();
    `);
    const before = await snapshot();
    await expect(db.query(forward)).rejects.toThrow(/8c Phase B postcondition/);
    await db.query('ROLLBACK');
    expect(await snapshot()).toEqual(before);
  });

  it('recovers the exact ON tuple and refuses a repeated rollback', async () => {
    await db.query(turnOn);
    const before = await snapshot();
    await db.query(forward);
    await db.query(rollback);
    expect(await snapshot()).toEqual(before);
    expect((await db.query(liveGate)).rows).toEqual([{ gate: 'PASS', crypto_rows: '4' }]);
    await expect(db.query(rollback)).rejects.toThrow(/staging recovery requires three exact retained rows/);
    await db.query('ROLLBACK');
    expect(await snapshot()).toEqual(before);
  });
});
