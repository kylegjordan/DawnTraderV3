/**
 * row `8a-P1` — THE FENCE: THE LADDER RECORDS AND DECIDES NOTHING, AND ITS RECORD ACTUALLY RIDES.
 *
 * ⛔ WHY A SOURCE FENCE AND NOT A BEHAVIOURAL TEST — MEASURED, NOT PREFERRED. `evaluateTECExit` is
 * called inside the PRIVATE `checkExitConditions`. Enumerated at the ref: 23 test files mention
 * `active-execution-engine`, exactly TWO import from it (neither drives the exit loop), and the
 * tests that call `evaluateTECExit` call it DIRECTLY on `tec-evaluator`. ⇒ **a mutation at the
 * engine's call site is invisible to every existing test**, so there is no behavioural host to
 * write this in. The pattern here is copied from `reorg-b4-shadow-isolation.test.ts`, which already
 * fences the ARGUMENTS of an `evaluateTECExit(` call one file over.
 *
 * ⛔⛔ AND EVERY ASSERTION CARRIES ITS OWN IN-TEST CONTROL. A source fence that cannot be shown to
 * FAIL is a string search that always passes — the repo's own idiom (`b-xstock-feed-sanity-fence`:
 * "CONTROL: a fixture with `updateCache` inside the skip branch is caught"). The controls below run
 * the SAME matcher against a fixture that SHOULD trip it, so a silently-broken extraction or a
 * regex that matches nothing reads as RED, not as green.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AEE = readFileSync(join(process.cwd(), 'server/services/active-execution-engine.ts'), 'utf-8');

/** Strip line comments so a prohibition cannot be "satisfied" by prose that merely mentions it. */
const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, '');

function extractFunctionBody(src: string, signaturePrefix: string): string {
  const start = src.indexOf(signaturePrefix);
  if (start === -1) throw new Error(`function not found: ${signaturePrefix}`);
  let i = src.indexOf('(', start);
  let parenDepth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') parenDepth++;
    else if (src[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
  }
  let angle = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '<') angle++;
    else if (c === '>') { if (angle > 0) angle--; }
    else if (c === '{' && angle === 0) break;
  }
  const braceStart = i;
  let depth = 0;
  for (let j = braceStart; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(braceStart, j + 1); }
  }
  throw new Error(`unterminated body: ${signaturePrefix}`);
}

/** Every `evaluateTECExit({ … })` argument object in the file, extracted by brace balance. */
function evaluateTECExitArgs(src: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf('evaluateTECExit({', from);
    if (at === -1) break;
    const braceStart = src.indexOf('{', at);
    let depth = 0;
    for (let j = braceStart; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) { out.push(src.slice(braceStart, j + 1)); from = j + 1; break; }
      }
    }
    if (from <= at) break;
  }
  return out;
}

describe('row 8a-P1 — the ladder DECIDES NOTHING', () => {
  const args = evaluateTECExitArgs(code(AEE));

  it('1. ⭐ INSTRUMENT CONTROL — both `evaluateTECExit` call sites are found, and they are not empty', () => {
    // Without this, every prohibition below could pass by extracting nothing at all — which is the
    // failure mode a source fence is most prone to and least likely to announce.
    expect(args).toHaveLength(2);
    for (const a of args) expect(a).toContain('currentPrice');
  });

  it('2. ⛔ NO LADDER IDENTIFIER APPEARS IN EITHER ARGUMENT OBJECT', () => {
    // The ladder's locals and its accumulator. If any of these reached the evaluator, P1 would be
    // deciding rather than recording, which is the one thing this phase must not do.
    const FORBIDDEN = ['_lsSel', '_lsCache', 'ladderShadow', '_ladderShadow', 'selectTouchPrice', 'tickerLegFromCachedQuote'];
    for (const a of args) for (const f of FORBIDDEN) expect(a).not.toContain(f);
  });

  it('3. ⭐ CONTROL — the SAME matcher catches a fixture that DOES leak the ladder', () => {
    // Proves the prohibition in test 2 can fail. Without it, `not.toContain` over an extraction
    // that silently returned nothing would read as a pass for ever.
    const leaked = evaluateTECExitArgs('await evaluateTECExit({ tradeId: x, currentPrice: _lsSel.quote.bid });');
    expect(leaked).toHaveLength(1);
    expect(leaked[0]).toContain('_lsSel');
  });

  it('4. the live trigger still reads `currentPrice` — the shadow has not quietly replaced it', () => {
    // The complement of test 2: proving the ladder is absent is only half. This proves what IS there.
    expect(args[0]).toMatch(/currentPrice\s*,/);
  });
});

/**
 * The close-time carry block ONLY — from the first allowlisted key to the emit. Scoping matters:
 * a file-wide search for an identifier that legitimately appears in more than one function cannot
 * tell WHERE it appears, and that is how test 6 first shipped unable to fail.
 */
function carryBlock(src: string): string {
  const start = src.indexOf('if (_pm.fg2Shadow)');
  if (start === -1) throw new Error('carry block not found');
  const end = src.indexOf('return Object.keys(_carry).length', start);
  if (end === -1) throw new Error('carry block end not found');
  return src.slice(start, end);
}

describe('row 8a-P1 — the record actually rides onto the closed row', () => {
  const closeBody = code(AEE);

  it('5. ⛔ `ladderShadow` IS ON THE CLOSE-TIME ALLOWLIST', () => {
    // The carry is an ALLOWLIST that takes keys BY NAME, so an accumulator field that is written
    // every 30 s but never listed here is silently dropped at the close — the window would hold
    // ZERO rows while every counter looked healthy. That is what this pins.
    expect(closeBody).toContain('_carry.ladderShadow');
  });

  it('6. ⛔ THE CARRY READS THE MAP, NOT THE ROW — SCOPED TO THE CARRY BLOCK', () => {
    // `_pm` is the re-fetched row and holds the LAST FLUSH, up to a full interval stale. The map is
    // exact at the close instant. A carry from `_pm` would be the B1 defect at the one moment that
    // decides what the window contains.
    //
    // ⛔⛔ THIS ASSERTION WAS FILE-SCOPED AND DID NOT DISCRIMINATE — CAUGHT BY ITS OWN MUTATION.
    // `_ladderShadow.get(position.id)` also appears in `_ladderFlushIfDue`, so replacing the CARRY's
    // read with `_pm.ladderShadow` left the string present elsewhere and the test passed. A check
    // that cannot come out differently is not a check. It is scoped to the carry block now.
    const carry = carryBlock(closeBody);
    expect(carry).toContain('_ladderShadow.get(position.id)');
    expect(carry).not.toContain('_pm.ladderShadow');
  });

  it('7. ⛔ THE ENTRY IS EVICTED — a surviving entry would be a SOURCE', () => {
    expect(closeBody).toContain('_ladderShadow.delete(position.id)');
  });

  it('7b. ⛔⛔ AND THE EVICTION COMES **AFTER** THE MERGE — PRESENCE IS NOT ORDER', () => {
    // ⛔ CAUGHT BY MUTATION: test 7 asserts the delete EXISTS, and a delete moved ABOVE the read
    // satisfies it exactly — while `_lsAcc` would be `undefined` and the record would never ride.
    // Both strings present, correct order destroyed, every assertion green. A fence that checks
    // PRESENCE cannot see ORDER, so the order is asserted here as a position comparison.
    const carry = carryBlock(closeBody);
    const read = carry.indexOf('_ladderShadow.get(position.id)');
    const evict = carry.indexOf('_ladderShadow.delete(position.id)');
    expect(read).toBeGreaterThanOrEqual(0);
    expect(evict).toBeGreaterThanOrEqual(0);
    expect(evict).toBeGreaterThan(read);
  });

  it('8. ⛔ THE STOP PATH FLUSHES UNCONDITIONALLY — the `force` argument is what makes the bound real', () => {
    const stopBody = extractFunctionBody(code(AEE), 'async stop()');
    expect(stopBody).toContain('_ladderFlushIfDue');
    expect(stopBody).toContain('true');
  });

  it('9. ⭐ CONTROL — `extractFunctionBody` really isolated `stop()` and did not return the file', () => {
    // A body extraction that silently returned the whole file would make test 8 pass no matter
    // where the flush call actually lived.
    const stopBody = extractFunctionBody(code(AEE), 'async stop()');
    expect(stopBody.length).toBeLessThan(AEE.length / 4);
    expect(stopBody).toContain('this.isRunning = false');
    expect(stopBody).not.toContain('_carry.ladderShadow');
  });
});

describe('row 8a-P1 — the flush trigger is wall-clock, not a walk count alone', () => {
  it('10. ⛔ BOTH LEGS ARE PRESENT AND THEY ARE AN `OR`', () => {
    const body = extractFunctionBody(code(AEE), 'function _ladderShouldFlush');
    expect(body).toContain('walksSinceFlush >= LADDER_FLUSH_WALKS');
    expect(body).toContain('LADDER_FLUSH_MS');
    // ⛔ `||`, not `&&`. An AND would require BOTH, so a quiet position would never flush on time —
    // the count leg would gate the clock leg, which is the opposite of the guarantee.
    expect(body).toContain('||');
    expect(body).not.toContain('&&');
  });

  it('11. ⛔ THE SEED IS NOW, NEVER ZERO — a 0 epoch fires a trivially-empty first flush', () => {
    const body = extractFunctionBody(code(AEE), 'function _ladderAccumulate');
    expect(body).toContain('lastFlushAtMs: Date.now()');
    expect(body).not.toMatch(/lastFlushAtMs:\s*0\b/);
  });

  it('12. ⛔ THE BOUND IS STATED HONESTLY ON THE PERSISTED SNAPSHOT', () => {
    // Not "bounded at 30 s" — the wall-clock leg is only evaluated inside a walk, so a wedged
    // cycle leaves the entry unflushed indefinitely. The snapshot carries what it can actually
    // promise, beside the numbers it qualifies.
    const body = extractFunctionBody(code(AEE), 'function _ladderSnapshot');
    expect(body).toContain('as observed at the next walk');
  });
});
