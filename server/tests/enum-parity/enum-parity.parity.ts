import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { pgEnum } from 'drizzle-orm/pg-core';
import * as schema from '../../../shared/schema';

// B-WORKFLOW-IMPROVE OBJ-10 (Q9): every pgEnum declared in shared/schema.ts against pg_enum in the migrated
// CI database, in both directions.
//  - code -> database: a type or value the code declares that the database does not hold. A write of that
//    value fails at runtime (the #1063 class: pattern_type).
//  - database -> code: a value the database holds, IN A TYPE THE CODE DECLARES, that the code does not
//    declare. A read of that value fails type checks downstream, or the value was meant to be retired.
//    NOT COVERED: an enum type the database holds that the code does not declare at all - compare() loops
//    the code's types only (Langston Step-4 gate 2 O-1: 11 of 84 database enum types on staging; carried
//    to gate 4). Postgres cannot drop an enum value,
//    so a value retired on purpose is listed in HISTORICAL_VALUES with its reason, and only there.
// Runs in its own ci.yml step with continue-on-error, OUTSIDE the required result (Langston, Step-2 r2
// condition 1). The file is named *.parity.ts so the main vitest include (server/**/*.test.ts) does not
// pick it up; vitest.enum-parity.config.ts runs it.
// Controls (r2 condition 1): a code-only control enum must be reported, and a database-only control value,
// created in the CI database for the run and dropped after, must be reported. A matching control passes.

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const parsed = (() => { try { return new URL(RAW_DB_URL); } catch { return null; } })();
const SAFE_TEST_DB = parsed !== null && ['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.pathname === '/test';

async function reachable(): Promise<boolean> {
  if (!SAFE_TEST_DB) return false;
  const client = new pg.Client({ connectionString: RAW_DB_URL, connectionTimeoutMillis: 2000 });
  try { await client.connect(); await client.end(); return true; } catch { return false; }
}
const DB = await reachable();
if (process.env.CI && !DB) throw new Error('enum-parity: the migrated CI test database is unreachable');

// Values present in the database on purpose although the code no longer declares them: `type.value` -> reason.
// Empty until a run shows one; every entry needs the batch or migration that retired the value.
export const HISTORICAL_VALUES: Record<string, string> = {};

type CodeEnum = { name: string; values: readonly string[] };
type Drift = { missingTypes: string[]; codeOnly: string[]; dbOnly: string[] };

export function codeEnumsOf(mod: Record<string, unknown>): CodeEnum[] {
  const out: CodeEnum[] = [];
  for (const v of Object.values(mod)) {
    const e = v as { enumName?: unknown; enumValues?: unknown };
    if (typeof v === 'function' && typeof e.enumName === 'string' && Array.isArray(e.enumValues)) out.push({ name: e.enumName, values: e.enumValues as string[] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function compare(code: CodeEnum[], db: Map<string, Set<string>>, historical: Record<string, string>): Drift {
  const d: Drift = { missingTypes: [], codeOnly: [], dbOnly: [] };
  for (const e of code) {
    const have = db.get(e.name);
    if (!have) { d.missingTypes.push(e.name); continue; }
    for (const v of e.values) if (!have.has(v)) d.codeOnly.push(`${e.name}.${v}`);
    for (const v of have) if (!e.values.includes(v) && !historical[`${e.name}.${v}`]) d.dbOnly.push(`${e.name}.${v}`);
  }
  return d;
}

const clean = (d: Drift) => d.missingTypes.length + d.codeOnly.length + d.dbOnly.length === 0;

describe.skipIf(!DB)('enum parity: shared/schema.ts pgEnum against pg_enum in the migrated CI database', () => {
  const client = new pg.Client({ connectionString: RAW_DB_URL });
  const CTRL_REV = `enum_parity_control_rev_${process.pid}`;
  let db = new Map<string, Set<string>>();

  const readDb = async () => {
    const r = await client.query<{ typname: string; enumlabel: string }>(
      `SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder`);
    const m = new Map<string, Set<string>>();
    for (const row of r.rows) { if (!m.has(row.typname)) m.set(row.typname, new Set()); m.get(row.typname)!.add(row.enumlabel); }
    return m;
  };

  beforeAll(async () => {
    await client.connect();
    await client.query(`DROP TYPE IF EXISTS ${CTRL_REV}`);
    await client.query(`CREATE TYPE ${CTRL_REV} AS ENUM ('kept', 'db_only')`);
    db = await readDb();
  });
  afterAll(async () => { await client.query(`DROP TYPE IF EXISTS ${CTRL_REV}`); await client.end(); });

  it('the instrument reads the schema: it finds declared enums, including pattern_type', () => {
    const code = codeEnumsOf(schema as Record<string, unknown>);
    expect(code.length).toBeGreaterThan(0);
    expect(code.map((e) => e.name)).toContain('pattern_type');
  });

  it('control: a matching enum passes', () => {
    const d = compare([{ name: CTRL_REV, values: ['kept', 'db_only'] }], db, {});
    expect(clean(d)).toBe(true);
  });

  it('control, code -> database: a type the database lacks is reported', () => {
    const codeOnly = pgEnum(`enum_parity_control_code_only_${process.pid}`, ['a']);
    const d = compare(codeEnumsOf({ codeOnly }), db, {});
    expect(d.missingTypes).toEqual([`enum_parity_control_code_only_${process.pid}`]);
  });

  it('control, database -> code: a value only the database holds is reported, and a historical entry excuses it', () => {
    const d = compare([{ name: CTRL_REV, values: ['kept'] }], db, {});
    expect(d.dbOnly).toEqual([`${CTRL_REV}.db_only`]);
    expect(clean(compare([{ name: CTRL_REV, values: ['kept'] }], db, { [`${CTRL_REV}.db_only`]: 'control' }))).toBe(true);
  });

  it('every declared enum matches the database in both directions', () => {
    const code = codeEnumsOf(schema as Record<string, unknown>);
    const d = compare(code, db, HISTORICAL_VALUES);
    console.log(`enum-parity: ${code.length} declared enums, ${db.size} database enum types (public schema, control included)`);
    console.log(`enum-parity: missing types ${JSON.stringify(d.missingTypes)}; code-only values ${JSON.stringify(d.codeOnly)}; database-only values ${JSON.stringify(d.dbOnly)}`);
    expect(d).toEqual({ missingTypes: [], codeOnly: [], dbOnly: [] });
  });
});
