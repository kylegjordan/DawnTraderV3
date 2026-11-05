/**
 * B-BALANCE-SESSION-PAIRING (#618 leg 1; Langston Step-4 BLOCKER, 2026-11-05) — every guardrail result code must be
 * storable in execution_attempt_audit.block_reason.
 *
 * The engine writes the guardrail check's result code straight into that column (`blockReason: riskCheck.code as any`,
 * the BLOCKED audit row in active-execution-engine.ts). The column is the pg enum execution_block_reason, so a
 * TradeSafetyResultCode the enum does not hold makes the insert throw, and the non-blocking catch discards the row that
 * records why the entry was refused. Four codes were in that state, MONEY_HELD_UNAVAILABLE (this batch) among them; and
 * the declaration in shared/schema.ts had drifted from the database (it lacked MAX_TOTAL_EXPOSURE). Precedent:
 * b-pattern-enum-drift.test.ts. This guard compares the three sides at CI:
 *   1. every TradeSafetyResultCode member is in the declared pgEnum;
 *   2. every declared value is storable: in the initial CREATE TYPE or in a forward ADD VALUE of a REGISTERED migration;
 *   3. the writer still passes riskCheck.code (so the union, not some other list, is what reaches the column).
 * NOT COVERED, stated: a value written by some other path than the guardrail code (there is none at the ref; the one
 * writer is asserted in leg 3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
const MIGRATIONS = 'drizzle/migrations';
const manifestLines = new Set(read(`${MIGRATIONS}/MANIFEST.txt`).split('\n').map((l) => l.trim()));

function resultCodes(): string[] {
  const src = read('server/services/trade-safety.ts');
  const block = src.slice(src.indexOf('export type TradeSafetyResultCode ='), src.indexOf('export type TradeSafetyResult ='))
    .replace(/\/\/[^\n]*/g, '');
  return [...block.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
}

function declared(): string[] {
  const src = read('shared/schema.ts').replace(/\/\/[^\n]*/g, '');
  const m = src.match(/pgEnum\("execution_block_reason",\s*\[([^\]]*)\]\)/);
  if (!m) throw new Error('executionBlockReasonEnum declaration not found in shared/schema.ts');
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function storable(): Set<string> {
  const out = new Set<string>();
  const init = read(`${MIGRATIONS}/2026-04-22-initial-schema.sql`);
  const create = init.match(/CREATE TYPE public\.execution_block_reason AS ENUM \(([^)]*)\)/);
  if (!create) throw new Error('initial CREATE TYPE execution_block_reason not found');
  for (const v of create[1].matchAll(/'([^']+)'/g)) out.add(v[1]);
  for (const f of readdirSync(join(root, MIGRATIONS))) {
    if (!f.endsWith('.sql') || f.endsWith('-rollback.sql') || !manifestLines.has(f)) continue;
    for (const v of read(`${MIGRATIONS}/${f}`).matchAll(/ALTER TYPE (?:public\.)?execution_block_reason ADD VALUE (?:IF NOT EXISTS )?'([^']+)'/g)) out.add(v[1]);
  }
  return out;
}

describe('execution_block_reason holds every guardrail result code', () => {
  it('the parsers read real lists (controls)', () => {
    expect(resultCodes()).toContain('MAX_TOTAL_EXPOSURE');
    expect(declared()).toContain('KILL_SWITCH');
    expect(storable().has('MAX_TRADES')).toBe(true);
  });
  it('every TradeSafetyResultCode is declared in the pgEnum', () => {
    const d = new Set(declared());
    expect(resultCodes().filter((c) => !d.has(c))).toEqual([]);
  });
  it('every declared value is storable (initial CREATE TYPE, or ADD VALUE in a registered migration)', () => {
    const s = storable();
    expect(declared().filter((v) => !s.has(v))).toEqual([]);
  });
  it('the fix migration is registered and its rollback is not', () => {
    expect(manifestLines.has('2026-11-05-b-balance-session-pairing-block-reasons.sql')).toBe(true);
    expect(manifestLines.has('2026-11-05-b-balance-session-pairing-block-reasons-rollback.sql')).toBe(false);
  });
  it('the one writer passes the guardrail result code into the column', () => {
    const aee = read('server/services/active-execution-engine.ts');
    expect((aee.match(/blockReason: riskCheck\.code as any,/g) ?? []).length).toBe(1);
  });
});
