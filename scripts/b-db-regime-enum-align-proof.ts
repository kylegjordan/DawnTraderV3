/**
 * B-DB-REGIME-ENUM-ALIGN (#1263) P11 — the OBJ-3 proof on staging, run ONCE after dt-deploy of this batch.
 *
 *   FORCE_PERSIST=true MODE=paper npx tsx scripts/b-db-regime-enum-align-proof.ts <expected-40-char-sha>
 *
 * It drives the real writer (TelemetryAggregatorService.recordPairTelemetry) for two distinguishable symbols:
 *   B1263-PROOF-CANON  pairRegime IMPULSE_EXPANSION         -> expect regime IMPULSE_EXPANSION
 *   B1263-PROOF-GHOST  pairRegime HIGH_VOL_IMPULSE (a ghost) -> expect regime IMPULSE_EXPANSION (normalized)
 * Before this batch the canonical label was not a value of the stored market_regime enum, so this insert was
 * refused; the PASS arm is a row read back with that label.
 *
 * Langston Step-2 condition (b): row read-back (id, regime, mode, symbol, source), pre/post count(*) (graded; n_tup_ins
 * is printed but not graded because the statistics view can lag), a build-sha
 * assert, distinguishable symbols. Population note: server/tests/integration/cost_telemetry.test.ts:56 also
 * inserts into telemetry_history (mode 'system'), but only in the CI test database — never on staging.
 * The rows are LEFT IN PLACE and their ids printed (the rehydrate path reads mode='live' only).
 * caller is 'vts' because recordPairTelemetry returns at its M70 guard for any other caller (Langston Step-4 F1);
 * caller is never persisted, so the symbols remain the discriminator. A missing pg_stat row prints n_tup_ins=unavailable.
 * Exit 0 = PASS, 1 = FAIL, 2 = refused to run (wrong build, missing env, proof symbols already present).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sql } from 'drizzle-orm';
import { db } from '../server/db.js';
import { TelemetryAggregatorService } from '../server/services/telemetry-aggregator.js';

const SYMBOLS = ['B1263-PROOF-CANON', 'B1263-PROOF-GHOST'] as const;
const EXPECT: Record<string, string> = { 'B1263-PROOF-CANON': 'IMPULSE_EXPANSION', 'B1263-PROOF-GHOST': 'IMPULSE_EXPANSION' };
const EXPECTED_COLUMNS = [
  { name: 'source', dataType: 'character varying', charLen: 20, precision: null, scale: null, nullable: 'YES', defaultValue: "'unknown'::character varying" },
  { name: 'global_regime', dataType: 'character varying', charLen: 40, precision: null, scale: null, nullable: 'YES', defaultValue: null },
  { name: 'pair_friction', dataType: 'numeric', charLen: null, precision: 5, scale: 2, nullable: 'YES', defaultValue: null },
  { name: 'global_friction', dataType: 'numeric', charLen: null, precision: 5, scale: 2, nullable: 'YES', defaultValue: null },
  { name: 'pair_directional_bias', dataType: 'character varying', charLen: 20, precision: null, scale: null, nullable: 'YES', defaultValue: null },
  { name: 'global_directional_bias', dataType: 'character varying', charLen: 20, precision: null, scale: null, nullable: 'YES', defaultValue: null },
  { name: 'decay_penalty', dataType: 'numeric', charLen: null, precision: 5, scale: 4, nullable: 'YES', defaultValue: null },
] as const;

function refuse(msg: string): never {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}

async function counts(): Promise<{ rows: number; ins: number | null }> {
  const r = await db.execute(sql`select (select count(*) from telemetry_history)::int as rows,
    (select n_tup_ins from pg_stat_user_tables where relname = 'telemetry_history')::int as ins`);
  const row = (r as unknown as { rows: Array<{ rows: number; ins: number | null }> }).rows[0];
  // No pg_stat_user_tables row => NULL; report it as unavailable, never as a false zero (Langston Step-4 F5).
  return { rows: Number(row.rows), ins: row.ins === null || row.ins === undefined ? null : Number(row.ins) };
}
const fmtIns = (v: number | null): string => (v === null ? 'unavailable' : String(v));

async function assertTelemetrySchema(): Promise<void> {
  const r = await db.execute(sql`select column_name, data_type, character_maximum_length::int as char_len,
      numeric_precision::int as precision, numeric_scale::int as scale, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'telemetry_history'
      and column_name in ('source', 'global_regime', 'pair_friction', 'global_friction',
        'pair_directional_bias', 'global_directional_bias', 'decay_penalty')
    order by column_name`);
  const rows = (r as unknown as { rows: Array<{
    column_name: string; data_type: string; char_len: number | null; precision: number | null;
    scale: number | null; is_nullable: string; column_default: string | null;
  }> }).rows;
  const byName = new Map(rows.map((row) => [row.column_name, row]));
  const bad: string[] = [];
  for (const expected of EXPECTED_COLUMNS) {
    const actual = byName.get(expected.name);
    if (!actual) {
      bad.push(`${expected.name}:missing`);
      continue;
    }
    if (actual.data_type !== expected.dataType
      || actual.char_len !== expected.charLen
      || actual.precision !== expected.precision
      || actual.scale !== expected.scale
      || actual.is_nullable !== expected.nullable
      || actual.column_default !== expected.defaultValue) {
      bad.push(`${expected.name}:wrong-shape`);
    }
  }
  if (bad.length) throw new Error(`telemetry_history schema mismatch: ${bad.join(', ')}`);
  console.log(`SCHEMA ${rows.length}/${EXPECTED_COLUMNS.length} expected telemetry columns exact`);
}

async function proofRows(): Promise<Array<{ id: string; regime: string; mode: string; symbol: string; source: string | null }>> {
  const r = await db.execute(sql`select id, regime::text as regime, mode::text as mode, symbol, source from telemetry_history
    where symbol in (${SYMBOLS[0]}, ${SYMBOLS[1]}) order by id`);
  return (r as unknown as { rows: Array<{ id: string; regime: string; mode: string; symbol: string; source: string | null }> }).rows;
}

async function main(): Promise<void> {
  const expected = process.argv[2];
  if (!expected || !/^[0-9a-f]{40}$/.test(expected)) refuse('pass the deployed 40-char sha as the only argument');
  const built = readFileSync('dist/BUILD_SHA', 'utf8').trim();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (built !== expected || head !== expected) refuse(`build-sha mismatch: expected ${expected} dist/BUILD_SHA ${built} HEAD ${head}`);
  if (process.env.FORCE_PERSIST !== 'true' || process.env.MODE !== 'paper') refuse('needs FORCE_PERSIST=true and MODE=paper in this command env');
  await assertTelemetrySchema();
  if ((await proofRows()).length) refuse('proof symbols already present — this proof has run; read those rows instead');

  const pre = await counts();
  console.log(`BUILD ${built} · PRE rows=${pre.rows} n_tup_ins=${fmtIns(pre.ins)}`);

  const svc = new TelemetryAggregatorService();
  // caller must be 'vts': recordPairTelemetry drops every other caller at the M70 guard (telemetry-aggregator.ts
  // ~:205) before any persist. caller is never stored; the B1263-PROOF-* symbols are the discriminator, and this
  // script's own TelemetryAggregatorService instance keeps the app's M70 counters untouched (Langston Step-4 F1).
  const base = { assetClass: 'crypto_spot' as const, finalScore: 0.5, caller: 'vts' as const };
  svc.recordPairTelemetry(SYMBOLS[0], { ...base, pairRegime: 'IMPULSE_EXPANSION' });
  // Deliberate cast: the untyped-at-runtime path the type no longer admits at a call site.
  svc.recordPairTelemetry(SYMBOLS[1], { ...base, pairRegime: 'HIGH_VOL_IMPULSE' as never });

  let rows: Awaited<ReturnType<typeof proofRows>> = [];
  for (let i = 0; i < 40 && rows.length < 2; i++) {
    await new Promise((res) => setTimeout(res, 500));
    rows = await proofRows();
  }
  // pg_stat counters are flushed by the writing backend at most about once a second; wait before reading.
  await new Promise((res) => setTimeout(res, 3000));
  const post = await counts();
  console.log(`POST rows=${post.rows} n_tup_ins=${fmtIns(post.ins)}`);
  for (const r of rows) console.log(`ROW id=${r.id} symbol=${r.symbol} regime=${r.regime} mode=${r.mode} source=${r.source}`);

  const fails: string[] = [];
  if (rows.length !== 2) fails.push(`expected 2 proof rows, read ${rows.length}`);
  for (const r of rows) {
    if (r.regime !== EXPECT[r.symbol]) fails.push(`${r.symbol}: regime ${r.regime}, expected ${EXPECT[r.symbol]}`);
    if (r.mode !== 'paper') fails.push(`${r.symbol}: mode ${r.mode}, expected paper`);
    if (r.source !== 'vts') fails.push(`${r.symbol}: source ${r.source}, expected vts`);
  }
  if (post.rows - pre.rows < 2) fails.push(`count(*) moved ${post.rows - pre.rows}, expected >= 2`);
  // n_tup_ins is reported, not graded: the statistics view can lag the commit, and count(*) plus the
  // read-back rows already prove the insert. A lagging counter is printed as such.
  if (pre.ins === null || post.ins === null) console.log('NOTE: n_tup_ins unavailable (no pg_stat_user_tables row; not graded)');
  else if (post.ins - pre.ins < 2) console.log(`NOTE: n_tup_ins moved ${post.ins - pre.ins} (statistics lag; not graded)`);
  console.log(fails.length ? `FAIL: ${fails.join('; ')}` : 'PASS');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error('FAIL (threw):', e);
  process.exit(1);
});
