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

describe('F-INV — a non-NULL basis implies a non-NULL exit_book_state (Langston Step-4 BLOCKER-3)', () => {
  const src = code(AEE);
  const RECUT = code(readFileSync(join(ROOT, 'scripts', 'xstock-hollow-recut.ts'), 'utf8'));
  it('the persisted basis is keyed on the DECISION label alone — never on the fill label', () => {
    const basisLines = src.split('\n').filter(l => /exitBookStateBasis\s*:/.test(l));
    expect(basisLines.length).toBeGreaterThan(0);
    for (const l of basisLines) {
      expect(l, l.trim()).toMatch(/bookStateAtDecision/);
      expect(l, l.trim()).not.toMatch(/_bsAtFill|bookStateAtFill/);
    }
  });
  it('the re-cut selects AND updates only rows with a NULL basis (a row with a basis already had a look)', () => {
    const selects = RECUT.match(/where[\s\S]*?exit_book_state is null[\s\S]*?close_reason/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s).toMatch(/exit_book_state_basis is null/);
    const updates = RECUT.match(/update closed_trades set[^`]*/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) expect(u).toMatch(/exit_book_state is null and exit_book_state_basis is null/);
  });
  it('CONTROL: the pre-fix shapes are caught', () => {
    expect("exitBookStateBasis: (a != null || _bsAtFill !== null) ? 'guard' : null,").toMatch(/_bsAtFill/);
    expect('update closed_trades set exit_book_state = $2 where id = $1 and exit_book_state is null').not.toMatch(/exit_book_state is null and exit_book_state_basis is null/);
  });
});

describe('F-P9 — the entry seam reads BOTH sides and consults the guard, xStock only (Kyle 2026-09-03, option D)', () => {
  const gate = (() => {
    const src = code(AEE);
    const a = src.indexOf('private async _evaluateOpenDepthGate');
    const b = src.indexOf('\n  }', src.indexOf("return { pass: true, reason: 'ok', snapshot };", a));
    return src.slice(a, b);
  })();
  it('CONTROL: the gate body was located and still contains its ask-side checks', () => {
    expect(gate.length).toBeGreaterThan(200);
    expect(gate).toMatch(/assessWarmth\(snapshot, 'asks'/);
    expect(gate).toMatch(/assessSufficiency\(snapshot, 'asks'/);
  });
  it('reads the BID side too — the ask-only hole that #992 found is closed', () => {
    expect(gate).toMatch(/assessWarmth\(snapshot, 'bids'/);
  });
  it('consults the same book-state predicate the exit guard uses, and refuses on hollow', () => {
    expect(gate).toMatch(/assessBookStateNow\(symbol\)/);
    expect(gate).toMatch(/state === 'hollow'/);
  });
  // ⛔ THE FENCE THAT PROTECTS KYLE'S RULING, and the first version was narrower than it read (Langston
  // Step-4 CONDITION-1): `/getHours/` does not match `getUTCHours()`, and `isMarketOpen`, `marketHours`,
  // a `market-hours.js` import and `toLocaleTimeString(…, {timeZone})` all slipped through it. Broadened
  // to the import level and given its own FIRING CONTROL — a negative assertion with no control proves
  // nothing about its token list, only that the slice was found.
  // ⚠️ `RTH` and `session` carry word boundaries BECAUSE unbounded and case-insensitive they match
  // inside `worth`, `north`, `further` and `sessionId` (Langston). That direction was fail-closed —
  // it would only ever have cost a future author a hunt for a clock reference that is not there —
  // and it was free to fix, so it is fixed on the line below rather than left as a known wart.
  const CLOCK_TOKENS = /market-?hours|isMarketOpen|isXstockMarketOpen|liquidFillWindow|get(UTC)?Hours|getUTC(Date|Day)|toLocale|timeZone|Date\.now|\bRTH\b|\bsession\b|premarket|after_?hours|overnight/i;
  it("⛔ NO CLOCK, NO SESSION TERM — Kyle's ruling is one standard at every hour", () => {
    expect(gate).not.toMatch(CLOCK_TOKENS);
  });
  it('CONTROL: the clock-token list actually fires on every shape it must catch', () => {
    for (const fixture of [
      'const h = new Date().getUTCHours();',
      "import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';",
      "if (isMarketOpen(symbol)) return { pass: true };",
      "const et = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York' });",
      'if (Date.now() > cutoff) return null;',
      'if (session === "overnight") widen();',
      'const et = nowET(); // RTH only',
    ]) expect(CLOCK_TOKENS.test(fixture), fixture).toBe(true);
    expect(CLOCK_TOKENS.test("const suff = assessSufficiency(snapshot, 'asks', orderNotional, config);")).toBe(false);
    // and the word-boundaries hold: these must NOT match, or a future author hunts a clock that isn't there
    for (const benign of ['const worth = 1;', 'if (north) go();', 'further();', 'const sessionId = x;'])
      expect(CLOCK_TOKENS.test(benign), benign).toBe(false);
  });
  it('⛔ neither new arm records its own gate-block counter — the caller is the sole writer (BLOCKER-1)', () => {
    expect(gate).not.toMatch(/recordDepthGateBlock/);
    const src = code(AEE);
    expect(src).toMatch(/recordDepthGateBlock\(_openClass, _gate\.reason\)/); // the one caller still records
  });
  it('the new checks are class-gated to xstock_spot, so crypto entry behaviour is unchanged', () => {
    const guardIdx = gate.indexOf("assetClass === 'xstock_spot'");
    expect(guardIdx).toBeGreaterThan(0);
    expect(gate.indexOf("assessWarmth(snapshot, 'bids'")).toBeGreaterThan(guardIdx);
    expect(gate.indexOf('assessBookStateNow(symbol)')).toBeGreaterThan(guardIdx);
  });
});

describe('F-P7ii — the re-entry relaxation is measured-only and NULL-safe', () => {
  const RTB = code(readFileSync(join(SERVER, 'core', 'rtb', 'ready_to_buy_service.ts'), 'utf8'));
  // ⛔ `code()` strips `//` and `/* */` — NOT SQL `--`. The predicate below is inside a SQL template whose
  // comments legitimately NAME the two bases that must never relax the block, so asserting on the raw
  // slice fails on its own explanation. Strip SQL line comments too, and CONTROL that the stripper works
  // — otherwise this fence would pass by stripping everything.
  const sqlCode = (src: string): string => src.replace(/--[^\n]*/g, '');
  const clause = (() => {
    const a = RTB.indexOf("AND close_reason = 'stop_hit'");
    return sqlCode(RTB.slice(a, RTB.indexOf('ORDER BY closed_at DESC LIMIT 1', a)));
  })();
  it('CONTROL: the cooldown query was located and the SQL-comment stripper keeps real predicate text', () => {
    expect(clause).toMatch(/make_interval/);
    expect(sqlCode("AND x = 1 -- minute_proxy never relaxes")).toBe('AND x = 1 ');
    expect(sqlCode("AND x = 1 -- note")).toMatch(/AND x = 1/);
  });
  it('only a MEASURED basis relaxes the block — never minute_proxy or market_state_predicate', () => {
    expect(clause).toMatch(/exit_book_state_basis/);
    expect(clause).toMatch(/'guard'/);
    expect(clause).toMatch(/'decision_price'/);
    expect(clause).not.toMatch(/minute_proxy|market_state_predicate/);
  });
  it('⛔ NULL-SAFE: unlabelled rows keep BLOCKING (a bare NOT(col = …) would silently drop them)', () => {
    expect(clause).toMatch(/COALESCE\(exit_book_state,\s*''\)/);
    expect(clause).toMatch(/COALESCE\(exit_book_state_basis,\s*''\)/);
  });
  it('⛔ CLASS-GATED IN THE SQL ITSELF — crypto invariance does not rest on another file (CONDITION-2)', () => {
    // This query runs for crypto too. Without the class term, crypto's cooldown would depend on the
    // WRITE side never labelling a crypto row — enforced elsewhere and fenced nowhere here.
    expect(clause).toMatch(/asset_class\s*=\s*'xstock_spot'/);
    const notBlock = clause.slice(clause.indexOf('AND NOT ('));
    expect(notBlock).toMatch(/asset_class\s*=\s*'xstock_spot'/);
  });
  it('CONTROL: a NOT-block without the class term is recognisably different', () => {
    const unfenced = "AND NOT (\n COALESCE(exit_book_state,'') = 'hollow'\n)";
    expect(unfenced).not.toMatch(/asset_class\s*=\s*'xstock_spot'/);
  });
  it('CONTROL: the unsafe form is recognisably different from what shipped', () => {
    const unsafe = "AND NOT (exit_book_state = 'hollow' AND exit_book_state_basis IN ('guard'))";
    expect(unsafe).not.toMatch(/COALESCE/);
  });
});

describe('F-CTRL — no control characters in this batch\'s source (Langston: the assertion belongs in the FENCE)', () => {
  // ⛔ WHY THIS IS A FENCE AND NOT A ONE-OFF REPAIR CHECK. Writing a regex fix through a shell heredoc
  // turned five `\b` escapes into literal BACKSPACE (0x08) characters inside `CLOCK_TOKENS` — the word
  // boundaries silently did not exist, the file still parsed, and only a fixture I happened to add caught
  // it. A repair script that asserts cleanliness protects the one repair; a fence protects every future
  // author, which is the difference Langston named. Applies to the batch's own files, which is the set
  // this suite is responsible for.
  const OWN_FILES = [
    join(SERVER, 'asset_classes', 'xstock_spot', 'book-state.ts'),
    join(SERVER, 'asset_classes', 'xstock_spot', 'book-state-config.ts'),
    join(SERVER, 'asset_classes', 'xstock_spot', 'book-state-tracker.ts'),
    join(SERVER, 'tests', 'unit', 'b-xstock-feed-sanity-fence.test.ts'),
    join(SERVER, 'tests', 'unit', 'b-xstock-feed-sanity-book-state.test.ts'),
    join(ROOT, 'scripts', 'xstock-hollow-recut.ts'),
    join(ROOT, 'scripts', 'reset-outcome-feedback-keys.ts'),
  ];
  // C0 and C1 are legitimate in text: TAB (09), LF (0A) and CR (0D). Everything else in the C0 range is
  // a mangled escape — 0x08 backspace being the one that actually happened.
  const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
  it('CONTROL: the detector fires on an injected backspace (else its silence means nothing)', () => {
    expect(CONTROL.test('abc\x08def')).toBe(true);
    expect(CONTROL.test('abc\tdef\r\nghi')).toBe(false); // tab/CR/LF must NOT trip it
  });
  it('none of this batch\'s own files contains a control character', () => {
    for (const f of OWN_FILES) {
      const src = readFileSync(f, 'utf8');
      const at = src.search(CONTROL);
      expect(at, `${f} @${at}: ${JSON.stringify(src.slice(Math.max(0, at - 40), at + 40))}`).toBe(-1);
    }
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

/**
 * ⛔⛔ F-SEED — THE CALL SITE MUST BE ABLE TO TAKE THE FIRST SNAPSHOT.
 *
 * The behavioural suite proves the PREDICATE's cycle closes. It cannot see the ENGINE's gate, and
 * the gate is where the deadlock lived: the shipped condition was `_r.state === 'two_sided'` alone,
 * which `book-state.ts` can never return without a comparator. Guard the gate itself, at the source.
 */
describe('F-SEED — the comparator seed gate', () => {
  // ⚠️ READ THE STRIPPED SOURCE: raw `AEE` also matches the PROSE at the top of the exit loop that
  // quotes the call for a human reader. My first version of this fence sliced against that comment
  // and reported the gate missing when it was present — the fence failing loudly, which is the point.
  const AEE_CODE = code(AEE);
  it('the seed condition admits no_comparator, not two_sided alone', () => {
    const i = AEE_CODE.indexOf('const _seedable');
    expect(i, 'the _seedable gate is missing at the advance call site').toBeGreaterThan(-1);
    const seedBlock = AEE_CODE.slice(i, AEE_CODE.indexOf('advanceBookStateComparator(position.symbol', i));
    expect(seedBlock).toMatch(/no_comparator/);
    expect(seedBlock).toMatch(/two_sided/);
  });
  it('CONTROL: the retired two_sided-only gate would FAIL this fence', () => {
    const retired = "if (_r.state === 'two_sided' && _raw.bid !== null) {";
    expect(/no_comparator/.test(retired)).toBe(false);
  });
  it('advanceBookStateComparator still has exactly ONE call site in the engine', () => {
    const calls = AEE_CODE.split('advanceBookStateComparator(position.symbol').length - 1;
    expect(calls).toBe(1);
  });
});

/**
 * ⛔ F-CROSSED — the crossed-book refusal lives in the WRITER (Langston condition 1).
 * `no_comparator` guarantees both sides POSITIVE but not `ask >= bid`, so a crossed frame is
 * seedable at the call site. The invariant belongs where every caller inherits it — putting it in
 * the caller's condition is exactly the shape that produced the deadlock this batch is fixing.
 */
describe('F-CROSSED — the writer refuses a crossed book', () => {
  const TRACKER = readFileSync(join(SERVER, 'asset_classes', 'xstock_spot', 'book-state-tracker.ts'), 'utf8');
  it('advanceBookStateComparator returns early unless ask >= bid', () => {
    expect(code(TRACKER)).toMatch(/if\s*\(!\(frame\.ask\s*>=\s*frame\.bid\)\)\s*return;/);
  });
  it('CONTROL: the guard is in the WRITER, not only in the engine call site', () => {
    expect(code(TRACKER)).toMatch(/frame\.ask\s*>=\s*frame\.bid/);
  });
  it('no stale claim survives that the comparator advances ONLY on two_sided', () => {
    expect(TRACKER).not.toMatch(/advances ONLY on a `two_sided` verdict/);
    expect(TRACKER).not.toMatch(/on the first two_sided verdict that seeds/);
  });
});
