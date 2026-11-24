import assert from 'node:assert/strict';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for the db-map snapshot control');
const a = new pg.Client({ connectionString: url });
const b = new pg.Client({ connectionString: url });
await Promise.all([a.connect(), b.connect()]);
const schema = `db_map_snapshot_${process.pid}`;
try {
  await a.query(`CREATE SCHEMA ${schema}`);
  const oneStatement = a.query(`
    WITH before_count AS MATERIALIZED (
      SELECT count(*)::integer AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1
    ), pause AS MATERIALIZED (SELECT pg_sleep(1)), after_count AS MATERIALIZED (
      SELECT count(*)::integer AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1
    )
    SELECT before_count.n AS before_n, after_count.n AS after_n FROM before_count, pause, after_count`, [schema]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await b.query(`CREATE TABLE ${schema}.appears_during_statement(id integer)`);
  const fixed = await oneStatement;
  assert.equal(fixed.rows[0].before_n, fixed.rows[0].after_n, 'one statement mixed catalog snapshots');

  const before = await a.query(`SELECT count(*)::integer AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1`, [schema]);
  await b.query(`CREATE TABLE ${schema}.appears_between_statements(id integer)`);
  const after = await a.query(`SELECT count(*)::integer AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1`, [schema]);
  assert.notEqual(before.rows[0].n, after.rows[0].n, 'split-statement mutant did not expose a mixed population');
  console.log('db-map snapshot control: one-statement PASS; split-statement mutant RED');
} finally {
  await b.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
  await Promise.all([a.end(), b.end()]);
}
