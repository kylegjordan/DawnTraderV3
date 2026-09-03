/**
 * B-XSTOCK-FEED-SANITY (#943) — THE FENCES. Every subject is DERIVED by scanning production source, never
 * a hand-written list (the `b-exit-provenance-fence` discipline), and every prohibition has a control
 * that fires on a fixture, so a vacuous fence cannot pass green.
 *
 *  F-C1  the guard's HOLLOW-skip branch writes NOTHING to the shared cache before it `continue`s
 *        (Langston Step-2 C1: a collapsed mid under the venue tag is indistinguishable from a real one).
 *  F-C2  the seed migration's `book_state` constant names == BOOK_STATE_KNOBS, and the warmup lists the
 *        module (one list; the boot assertion asserts the count).
 *  F-C3  every production READER of the label also reads its BASIS — a state read without its basis fails
 *        the build (a clock-proxied `hollow` must never gate an admission).
 *  F-$   the label never appears in a money expression.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { BOOK_STATE_KNOBS } from '../../asset_classes/xstock_spot/book-state.js';

const SERVER = join(__dirname, '..', '..');
const ROOT = join(SERVER, '..');
const AEE = readFileSync(join(SERVER, 'services', 'active-execution-engine.ts'), 'utf8');
const WARMUP = readFileSync(join(SERVER, 'startup', 'b72-warmup.ts'), 'utf8');
const MIGRATION = readFileSync(join(ROOT, 'drizzle', 'migrations', '2026-09-03-b-xstock-feed-sanity.sql'), 'utf8');

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!/node_modules|tests|__tests__|dist/.test(n)) walk(p, out); }
    else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p);
  }
  return out;
}

describe('F-C1 — the hollow SKIP branch writes nothing to the shared price cache', () => {
  const src = code(AEE);
  const skipStart = src.indexOf('SKIP hollow streak=');
  const skipEnd = src.indexOf('continue;', skipStart);
  it('CONTROL: the branch exists and ends in a continue', () => {
    expect(skipStart).toBeGreaterThan(0); expect(skipEnd).toBeGreaterThan(skipStart);
  });
  it('no updateCache between the SKIP log and its continue', () => {
    expect(src.slice(skipStart, skipEnd)).not.toMatch(/updateCache\s*\(/);
  });
  it('CONTROL: the two-sided path DOES reach updateCache after the guard (the fence is not vacuous)', () => {
    const guardEnd = src.indexOf("priceSource = 'kraken_equities_ws';", skipEnd);
    const cacheCall = src.indexOf('livePricingAdapter.updateCache(normalizeToInternalSymbol(position.symbol), currentPrice, \'kraken_equities_ws\'', guardEnd);
    expect(guardEnd).toBeGreaterThan(skipEnd); expect(cacheCall).toBeGreaterThan(guardEnd);
  });
  it('CONTROL: a fixture with updateCache inside the skip branch is caught', () => {
    const fixture = "SKIP hollow streak=1'); livePricingAdapter.updateCache(x); continue;";
    const a = fixture.indexOf('SKIP hollow streak='); const b = fixture.indexOf('continue;', a);
    expect(fixture.slice(a, b)).toMatch(/updateCache\s*\(/);
  });
});

describe('F-C2 — one knob list: migration == BOOK_STATE_KNOBS == warmup', () => {
  const seeded = Array.from(MIGRATION.matchAll(/\('book_state','\*','xstock_spot','\*','\*','([a-z_]+)'/g)).map(m => m[1]);
  it('the migration seeds exactly the twelve names, each once', () => {
    expect(seeded.length).toBe(12);
    expect(new Set(seeded)).toEqual(new Set(BOOK_STATE_KNOBS));
  });
  it('the warmup prefetches the module and calls the boot assertion', () => {
    expect(code(WARMUP)).toMatch(/'book_state'/);
    expect(WARMUP).toMatch(/assertBookStateKnobsAtBoot\(\)/);
  });
  it('CONTROL: a fixture missing a name is caught', () => {
    expect(new Set(seeded.slice(1))).not.toEqual(new Set(BOOK_STATE_KNOBS));
  });
});

describe('F-C3 — every production reader of exit_book_state also reads exit_book_state_basis', () => {
  // A READER is a line that uses the state in a comparison or filter (SQL `=`/`<>`/`IN`/`DISTINCT FROM`,
  // or TS `===`/`!==`) — not a line that ASSIGNS it (the writers: `exitBookState:` / `set exit_book_state`).
  const readerRe = /exit_book_state\s*(=|<>|!=|IS DISTINCT FROM|IN\s*\()|exitBookState\s*(===|!==)|\.exitBookState\s*(===|!==)/;
  const files = walk(SERVER).concat(walk(join(ROOT, 'scripts')));
  // The STATEMENT a reader sits in: from its line to the first line that closes it (`;`, or a
  // template/SQL literal end), capped at 8 lines — NEVER the whole file (Langston Step-4 condition:
  // a same-file test passes on an unrelated mention 6,000 lines away the day P7 lands in routes.ts).
  function statementOf(lines: string[], i: number): string {
    const out: string[] = [];
    for (let j = i; j < Math.min(lines.length, i + 8); j++) { out.push(lines[j]); if (/;\s*$|`\s*[,)]?\s*$/.test(lines[j]) && j > i) break; if (j === i && /;\s*$/.test(lines[j])) break; }
    return out.join('\n');
  }
  const readers: Array<{ file: string; line: string; statement: string }> = [];
  for (const f of files) {
    const lines = code(readFileSync(f, 'utf8')).split('\n');
    for (let i = 0; i < lines.length; i++) if (readerRe.test(lines[i])) readers.push({ file: f, line: lines[i].trim(), statement: statementOf(lines, i) });
  }
  it('every derived reader references the basis in the SAME STATEMENT', () => {
    for (const r of readers) {
      expect(/exit_book_state_basis|exitBookStateBasis/.test(r.statement), `${r.file}: ${r.line}`).toBe(true);
    }
  });
  it('CONTROL: statementOf stops at the statement, so a basis mention elsewhere in the file cannot satisfy it', () => {
    const lines = ["const x = row.exitBookState === 'hollow';", '', '', "// exitBookStateBasis mentioned far away"];
    expect(/exitBookStateBasis/.test(statementOf(lines, 0))).toBe(false);
    const multi = ["where exit_book_state = 'hollow'", "  and exit_book_state_basis in ('guard','decision_price')`;"];
    expect(/exit_book_state_basis/.test(statementOf(multi, 0))).toBe(true);
  });
  it('CONTROL: the reader regex fires on the P7 predicate shape and on a bare comparison', () => {
    expect(readerRe.test("AND NOT (exit_book_state = 'hollow' AND exit_book_state_basis IN ('guard','decision_price'))")).toBe(true);
    expect(readerRe.test("if (row.exitBookState === 'hollow')")).toBe(true);
    expect(readerRe.test("exitBookState: options?.exitProvenance?.bookStateAtDecision ?? null,")).toBe(false); // a writer
  });
  it('CONTROL: a fixture reader without a basis is caught', () => {
    const line = "where exit_book_state = 'hollow'";
    expect(readerRe.test(line)).toBe(true);
    expect(/exit_book_state_basis/.test(line)).toBe(false);
  });
});

describe('F-$ — the label never appears in a money expression', () => {
  const moneyRe = /HONEST_PNL|grossPnl\s*=|netPnl\s*=|net_pnl|reconstructed_net_pnl|dailyLoss|daily_loss/;
  const files = walk(SERVER);
  it('no line that computes money references the book-state label', () => {
    for (const f of files) {
      for (const l of code(readFileSync(f, 'utf8')).split('\n')) {
        if (moneyRe.test(l)) expect(l, `${f}: ${l.trim()}`).not.toMatch(/exit_book_state|exitBookState|bookStateAtDecision/);
      }
    }
  });
  it('CONTROL: a fixture is caught', () => {
    const l = "const netPnl = exitBookState === 'hollow' ? 0 : gross;";
    expect(moneyRe.test(l)).toBe(true); expect(l).toMatch(/exitBookState/);
  });
});
