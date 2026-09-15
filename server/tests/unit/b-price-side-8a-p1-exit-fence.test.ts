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
    // ⚠️ WAS 2 UNTIL 2026-09-14. `8a-P2` (P2-7) REMOVED THE F-G-2 SHADOW ARM — once the LIVE arm
    // reads the ladder bid, that arm compared bid against bid, its discordant cell collapsed by
    // construction, and it could never resolve again. ONE call site is now the correct count.
    expect(args).toHaveLength(1);
    for (const a of args) expect(a).toContain('currentPrice');
  });

  it('2. ⛔⛔ RETIRED-AND-INVERTED — THE LADDER NOW *DOES* DECIDE, AND THIS ASSERTS THE OPPOSITE', () => {
    // ⛔⛔ THIS TEST'S ORIGINAL SUBJECT IS DEAD, AND LEAVING IT GREEN WOULD HAVE BEEN THE WORST
    // OUTCOME OF THE WHOLE ROW. It forbade the strings `_lsSel`/`selectTouchPrice` inside the
    // evaluator's argument object, to prove P1 recorded without deciding.
    // ⚠️ MEASURED WHEN P2 LANDED: it still PASSED — because the trigger arrives through a
    // parameter named `triggerBid`, so not one forbidden STRING appears, while the behaviour the
    // test existed to forbid is now exactly what happens. A prohibition on identifiers is routed
    // around by a rename. ⇒ IT WAS GREEN AND MEANINGLESS, WHICH IS WORSE THAN RED.
    // ⇒ INVERTED TO THE POST-P2 TRUTH: the live call MUST carry a trigger distinct from the mark.
    expect(args[0]).toMatch(/triggerPrice\s*:/);
  });

  it('2b. ⛔⛔ THE MUTATION THAT MUST GO RED — triggerPrice MAY NEVER FALL BACK TO THE MIDPOINT', () => {
    // The single highest-value assertion in this row. A refusal must make NO DECISION; degrading
    // to `currentPrice` re-introduces the full-spread error the row removes, and it would look
    // entirely reasonable to a future reader trying to 'fix' skipped exit checks.
    const trigger = /triggerPrice\s*:\s*([^,}]+)/.exec(args[0]);
    expect(trigger).not.toBeNull();
    // ⭐ STRUCTURAL PRECONDITION ASSERTED BEFORE THE RESULT IS READ — a mutation that did not
    //   apply once reported as a SURVIVOR on this very batch. A false PASS hides a gap; a PHANTOM
    //   SURVIVOR invents one.
    const expr = trigger![1];
    expect(expr.length).toBeGreaterThan(0);
    // The crypto branch must resolve to the bid or to null — never to the mark.
    expect(expr).toMatch(/triggerBid/);
    // ⛔⛔ ASSERT THE *DEGRADATION*, NOT A BRANCH POSITION. The first version tested
    // `/\?\s*currentPrice/` — which passed only because the live ternary happens to read
    // `: currentPrice`. Flip it to `=== 'xstock_spot' ? currentPrice : triggerBid` and CORRECT
    // code goes red: a fence one character from a FALSE RED is as broken as one that cannot fail.
    // (Langston Step-4.) What actually matters is that the bid is never COALESCED into the mark,
    // in either branch order — so match the coalescing operators themselves.
    expect(expr).not.toMatch(/triggerBid\s*(\?\?|\|\|)/);
    expect(expr).not.toMatch(/(\?\?|\|\|)\s*currentPrice/);
  });

  it('2d. ⛔⛔ ONLY `crypto_spot` REACHES THE TRIGGER — the by-construction exemption has a tripwire', () => {
    // ⛔ WHAT THIS GUARDS IS AN ARGUMENT MADE IN ANOTHER FILE. The discontinuity sentinel has no
    // divergent fixture because it is xStock-only (`price-discontinuity-detector.ts:248-250`
    // returns `{active:false}` for every non-xStock symbol) while divergence is crypto-only — so
    // the two sets do not intersect and a test there would exercise an impossible path.
    // ⚠️ BUT THAT EXEMPTION LIVES ENTIRELY IN THE TERNARY BELOW, IN A DIFFERENT FILE, AND NOTHING
    // WATCHED IT. Add `'xstock_spot'` to it and test 2b stays GREEN — it asserts `triggerBid` is
    // present and never coalesced, and says nothing about the branch — while the sentinel starts
    // receiving a divergent price for the first time, SILENTLY. (Langston.)
    const expr = /triggerPrice\s*:\s*([^,}]+)/.exec(args[0])![1];
    // ⭐ THE CHECK IS THE *COUNT OF CLASSES*, NOT THE BRANCH ORDER — which is what makes it immune
    //   to the inverted-but-equivalent ternary that 2b had to step out of once.
    const classes = expr.match(/'(crypto_spot|xstock_spot)'/g) ?? [];
    expect(classes).toHaveLength(1);
    // …and the crypto side is the one that gets the bid, whichever way the ternary is written.
    const [whenTrue, whenFalse] = expr.split('?')[1].split(':');
    const cryptoIsTrueBranch = (classes[0] === "'crypto_spot'") !== /!==/.test(expr);
    expect(cryptoIsTrueBranch ? whenTrue : whenFalse).toMatch(/triggerBid/);
    // ⛔ IF THIS GOES RED: the sentinel's by-construction exemption HAS EXPIRED. A second asset
    //    class now reaches the transactable trigger, so `isDiscontinuityActive` can receive a
    //    price that differs from the mark. Re-open the sentinel question — do NOT relax this test.
  });

  it('2e. ⭐ CONTROL — a WIDENED predicate goes red, an INVERTED one does not', () => {
    const widened = "positionAssetClass === 'crypto_spot' || positionAssetClass === 'xstock_spot' ? triggerBid : null";
    expect(widened.match(/'(crypto_spot|xstock_spot)'/g)).toHaveLength(2);   // ⇒ 2d would fail
    const inverted = "positionAssetClass === 'xstock_spot' ? currentPrice : triggerBid";
    const cls = inverted.match(/'(crypto_spot|xstock_spot)'/g)!;
    expect(cls).toHaveLength(1);                                            // ⇒ 2d still passes
    const [t, f] = inverted.split('?')[1].split(':');
    const cryptoIsTrue = (cls[0] === "'crypto_spot'") !== /!==/.test(inverted);
    expect(cryptoIsTrue ? t : f).toMatch(/triggerBid/);                     // …and correctly
  });

  it('2c. ⭐ CONTROL — the SAME matcher CATCHES a fixture that DOES degrade to the mid', () => {
    // Without this, 2b's `not.toMatch` over a failed extraction reads as a pass for ever.
    const bad = evaluateTECExitArgs(
      'await evaluateTECExit({ tradeId: x, currentPrice, triggerPrice: triggerBid ?? currentPrice });',
    );
    expect(bad).toHaveLength(1);
    const t = /triggerPrice\s*:\s*([^,}]+)/.exec(bad[0]);
    expect(t).not.toBeNull();
    expect(t![1]).toMatch(/\?\?\s*currentPrice/);   // the control DOES trip
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
    // ⭐ MEANING CHANGED WITH `8a-P2` AND IS NOW STRONGER: this no longer says 'the trigger is
    // still the mark' — it says the BOOKING price was NOT switched along with the trigger. The
    // two jobs were split deliberately and only ONE of them moved.
    expect(args[0]).toMatch(/currentPrice\s*,/);
  });
});

/**
 * The close-time carry block ONLY — from the first allowlisted key to the emit. Scoping matters:
 * a file-wide search for an identifier that legitimately appears in more than one function cannot
 * tell WHERE it appears, and that is how test 6 first shipped unable to fail.
 */
/**
 * The `if (trade) { … }` block by BRACE BALANCE. ⛔ THIS EXISTS BECAUSE THE BLOCKER'S CONTENT IS
 * "OUTSIDE `if (trade)`" AND NOTHING MEASURED THAT. `if (trade)` is BROADER than the carry block,
 * so moving the whole eviction back inside it — above the closing brace, outside the carry IIFE —
 * left all eight assertions in tests 5/6/7/7b green. Langston ran that mutation himself.
 * ⇒ FOURTH instance of presence-is-not-position in this file, one level up: position relative to a
 *   BLOCK, not to a string.
 */
function ifTradeBlock(src: string): string {
  const at = src.indexOf('    if (trade) {');
  if (at === -1) throw new Error('if (trade) block not found');
  const braceStart = src.indexOf('{', at);
  let depth = 0;
  for (let j = braceStart; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(braceStart, j + 1); }
  }
  throw new Error('unterminated if (trade) block');
}

/**
 * The `} finally { … }` block by BRACE BALANCE. ⛔ THIS REPLACES A PROXIMITY REGEX THAT WAS THE
 * FIFTH INSTANCE OF PRESENCE-IS-NOT-POSITION IN THIS FILE — INSIDE THE FIX FOR THE FOURTH.
 * The old assertion was `/\}\s*finally\s*\{[\s\S]{0,800}?_ladderShadow\.delete\(/`, and `[\s\S]`
 * CROSSES THE FINALLY'S OWN CLOSING BRACE: move the delete just BELOW the block, back into normal
 * flow, and it still matched while the eviction no longer ran on a throw — precisely the mutation
 * the assertion existed to prevent. It was also the only assertion in this file with no paired
 * control, against the standard this file's own docblock sets.
 * ★ And a character budget is a hidden coupling: benign growth inside the block turns it red.
 */
function finallyBlock(src: string, anchor?: string): string {
  // ⛔⛔ ANCHORED, BECAUSE THE FIRST VERSION TOOK `indexOf('} finally {')` AND GRABBED THE WRONG
  // ONE — `monitoringCycle`'s `this.isCycleRunning = false` finally, hundreds of lines earlier.
  // The helper written to fix a wrong-object class picked the wrong object on its first run.
  // ⇒ the caller names what the block must FOLLOW, and the control below asserts the extraction
  //   contains this row's own marker so a future drift cannot silently re-point it.
  const from = anchor ? src.indexOf(anchor) : 0;
  if (anchor && from === -1) throw new Error(`finally anchor not found: ${anchor}`);
  const at = src.indexOf('} finally {', from);
  if (at === -1) throw new Error('finally block not found');
  const braceStart = src.indexOf('{', at);
  let depth = 0;
  for (let j = braceStart; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(braceStart, j + 1); }
  }
  throw new Error('unterminated finally block');
}

function carryBlock(src: string): string {
  const start = src.indexOf('if (_pm.fg2Shadow)');
  if (start === -1) throw new Error('carry block not found');
  const end = src.indexOf('return Object.keys(_carry).length', start);
  if (end === -1) throw new Error('carry block end not found');
  return src.slice(start, end);
}

describe('row 8a-P1 — the record actually rides onto the closed row', () => {
  // ⚠️ RENAMED FROM `closeBody`, which was the WHOLE FILE — a name that made every `toContain`
  // on it read as scoped when it was not (Langston, Step-4 r2).
  const wholeFile = code(AEE);

  it('5. ⛔ `ladderShadow` IS ON THE CLOSE-TIME ALLOWLIST', () => {
    // The carry is an ALLOWLIST that takes keys BY NAME, so an accumulator field that is written
    // every 30 s but never listed here is silently dropped at the close — the window would hold
    // ZERO rows while every counter looked healthy. That is what this pins.
    expect(wholeFile).toContain('_carry.ladderShadow');
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
    // ⚠️ THE READ IS NOW HOISTED ABOVE `if (trade)` (Step-4 BLOCKER-2), so the carry block uses
    // the hoisted `_lsAcc`; the assertion moves with it rather than being deleted.
    const carry = carryBlock(wholeFile);
    expect(carry).toContain('_carry.ladderShadow = _ladderSnapshot(_lsAcc)');
    expect(carry).not.toContain('_pm.ladderShadow');
    expect(wholeFile).toContain('const _lsAcc = _ladderShadow.get(position.id);');
  });

  it('7. ⛔ THE ENTRY IS EVICTED, AND **OUTSIDE THE `if (trade)` BLOCK** — BLOCKER-2', () => {
    // `trade` is `trades.find(t => t.openedAt && !t.closedAt)`, so two concurrent positions on one
    // symbol leave the second close with NO open trade row. Inside the block the accumulator would
    // be neither carried nor evicted: census dropped AND the entry immortal.
    const src = code(AEE);
    const block = ifTradeBlock(src);
    expect(src).toContain('_ladderShadow.delete(position.id)');
    // ⛔ THE ASSERTION THAT CARRIES THE BLOCKER: not in the block at all.
    expect(block).not.toContain('_ladderShadow.delete');
    // And the no-trade-row case is SAID, not silent — asserted in the eviction's own scope rather
    // than anywhere in 5,500 lines, which is what `closeBody`-as-whole-file used to mean.
    expect(src).toContain('LADDER_NO_TRADE_ROW');
    // ⛔ AND IT RUNS EVEN IF THE PERSIST THROWS (Langston §13): the block sits in a `try` whose
    // `finally` holds the eviction, so "WHETHER OR NOT a trade row was found" is now structurally
    // true rather than a claim the throw path falsified.
    const fin = finallyBlock(src, 'const _lsAcc = _ladderShadow.get(position.id);');
    expect(fin).toContain('_ladderShadow.delete(position.id)');
    // ⭐ AND THAT IT IS **THIS** FINALLY — the unanchored version grabbed `monitoringCycle`'s.
    expect(fin).toContain('LADDER_NO_TRADE_ROW');
    // ⛔ AND AN **UPPER** BOUND, because the identity assertion alone cannot see an OVER-RUN
    // (Langston, at approval). `finallyBlock`'s brace counter is naive about braces inside string
    // and template literals — correct for THIS block today, but a swallowed extension would still
    // contain `LADDER_NO_TRADE_ROW`, and a delete moved BELOW the block would then read as inside.
    // `regimeAtOpen` (`:3438`) is the first declaration past the block: directional, no budget.
    expect(fin).not.toContain('regimeAtOpen');
  });

  it('7d. ⭐ CONTROL — the containment check REJECTS a delete moved just BELOW the finally', () => {
    // This is the mutation the proximity regex could not see: still "near" the `finally`, no longer
    // INSIDE it, and therefore no longer running on a throw.
    const seeded = ['  } finally {', '    doSomething();', '  }', '  _ladderShadow.delete(position.id);'].join(String.fromCharCode(10));
    expect(finallyBlock(seeded)).not.toContain('_ladderShadow.delete');
    // …and it DOES see one that is genuinely inside, so the matcher is not simply always-false.
    const inside = ['  } finally {', '    _ladderShadow.delete(position.id);', '  }'].join(String.fromCharCode(10));
    expect(finallyBlock(inside)).toContain('_ladderShadow.delete');
  });

  it('7c. ⭐ CONTROL — `ifTradeBlock` really isolates the block, and catches a delete moved INTO it', () => {
    // Without this, test 7's `not.toContain` over an extraction that silently returned something
    // tiny or empty would pass for ever — which is exactly how its predecessor shipped.
    const block = ifTradeBlock(code(AEE));
    expect(block.length).toBeGreaterThan(2000);            // it really is the big block
    expect(block.length).toBeLessThan(code(AEE).length);    // and not the whole file
    expect(block).toContain('_carry.ladderShadow');         // the CARRY is inside it
    const seeded = ifTradeBlock(['    if (trade) {', '  _ladderShadow.delete(position.id);', '    }'].join(String.fromCharCode(10)));
    expect(seeded).toContain('_ladderShadow.delete');       // the matcher WOULD catch it
  });

  it('7b. ⛔⛔ AND THE EVICTION COMES **AFTER** THE MERGE — PRESENCE IS NOT ORDER', () => {
    // ⛔ CAUGHT BY MUTATION: test 7 asserts the delete EXISTS, and a delete moved ABOVE the read
    // satisfies it exactly — while `_lsAcc` would be `undefined` and the record would never ride.
    // Both strings present, correct order destroyed, every assertion green. A fence that checks
    // PRESENCE cannot see ORDER, so the order is asserted here as a position comparison.
    const read = wholeFile.indexOf('const _lsAcc = _ladderShadow.get(position.id);');
    const evict = wholeFile.indexOf('_ladderShadow.delete(position.id)');
    expect(read).toBeGreaterThanOrEqual(0);
    expect(evict).toBeGreaterThanOrEqual(0);
    expect(evict).toBeGreaterThan(read);
  });

  it('8. ⛔ THE STOP PATH FLUSHES WITH `force` — ASSERTED ON THE CALL, NOT ON THE WORD', () => {
    // ⛔⛔ THIS ASSERTION WAS `toContain('true')` AND COULD NOT FAIL ON THE THING IT NAMES.
    // `stop()` carries a SECOND `true` — `sessionCleared=true` in the `[AJ8][SESSION_STOP]`
    // template literal — which the comment-stripper does not touch. Flip the `force` argument to
    // `false` and the old assertion stayed green. The mutation table killed "stop-flush REMOVED"
    // and never ran "force FLIPPED", so the gap was in the mutation set as much as the matcher.
    // ⇒ assert the CALL WITH ITS THIRD ARGUMENT. Third instance of presence-is-not-discrimination
    //   in this file; each one was found by a mutation, none by reading.
    const stopBody = extractFunctionBody(code(AEE), 'async stop()');
    expect(stopBody).toMatch(/_ladderFlushIfDue\([^)]*,\s*true\s*\)/);
  });

  it('8b. ⭐ CONTROL — the same matcher REJECTS the flipped call', () => {
    const flipped = 'await this._ladderFlushIfDue(_p as any, _lsNow, false);';
    expect(flipped).not.toMatch(/_ladderFlushIfDue\([^)]*,\s*true\s*\)/);
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

describe('row 8a-P1 — a contained recorder fault is COUNTED, not silent', () => {
  it('13. ⛔ `ladderErrors` IS ON THE `EVAL_EXIT` LINE', () => {
    // Containment is right — an unguarded throw in a RECORDER would end the loop iteration and
    // become a skipped stop check. But a recorder throwing on EVERY walk yields
    // accepted=0 refused=0 viaBook=0, which is byte-identical to "no crypto positions open", and
    // no accumulator is created so nothing reaches the row either. Contained AND unreadable is not
    // a bound. (Langston, Step-4 ask 2.)
    const src = code(AEE);
    expect(src).toContain('ladderErrors++');
    expect(src).toMatch(/EVAL_EXIT[^`]*ladderErrors=\$\{ladderErrors\}/);
  });

  it('14. ⛔ THE PERSISTED BOUND IS INTERPOLATED FROM THE CONSTANT, NOT A LITERAL', () => {
    // A hard-coded '30s' restating LADDER_FLUSH_MS means changing the constant mints every later
    // row with a false bound, tsc green throughout. (Langston C1.)
    const body = extractFunctionBody(code(AEE), 'function _ladderSnapshot');
    expect(body).toContain('LADDER_FLUSH_MS');
    expect(body).not.toMatch(/<=30s/);
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

/**
 * ⛔⛔ `8a-P2` BLOCKER-1 — THE SITE I CLAIMED WAS CONVERTED AND WAS NOT.
 *
 * The Step-4 dispatch said "all FOUR trigger sites read it" and NAMED `tecUpdatePosition`. The
 * file passed `currentPrice` there. Langston read the ref and caught it.
 *
 * ⚠️ IT IS THE WORST OF THE FIVE TO MISS, AND NOT BECAUSE IT IS ONE MORE LINE. With
 * `useTrailing: true` and a live ATR the hard stop/target pair is UNREACHABLE, so the trailing
 * controller is where the live decision happens — `isTargetLockTriggered`, the high-water mark,
 * the break-even latch and the rung ladder all read this one argument. Leaving it on the mid
 * moved the STOP half to the bid and left the TARGET half on the mid, INSIDE ONE STATE MACHINE
 * ON ONE TICK — and a mid firing against a target is OPTIMISTIC, so the defect would have
 * survived on exactly the leg that books a WIN, while the losing leg got the fix.
 *
 * ⇒ A CLAIM I MADE ABOUT MY OWN DIFF, CONTRADICTED BY THE DIFF. This fence exists so the next
 *   reader does not have to take my word for it either.
 */
describe('row 8a-P2 — every trigger surface reads the trigger, not the mark', () => {
  const TEC = readFileSync(join(process.cwd(), 'server/services/tec-evaluator.ts'), 'utf-8');
  const body = code(TEC);

  it('8. ⛔ `tecUpdatePosition` RECEIVES THE TRIGGER — BLOCKER-1, and it was wrong once', () => {
    const call = /tecUpdatePosition\(\{([\s\S]*?)\n    \}\)/.exec(body);
    expect(call).not.toBeNull();                       // instrument control: the call was found
    expect(call![1].length).toBeGreaterThan(0);        // …and is not empty
    expect(call![1]).toMatch(/currentPrice:\s*triggerPrice/);
  });

  it('9. ⭐ CONTROL — the SAME matcher catches a fixture that passes the MARK', () => {
    // Without this, test 8 over a failed extraction reads as a pass for ever — which is exactly
    // how the original fence went green while the behaviour it forbade became true.
    const bad = 'const u = tecUpdatePosition({\n      tradeId: x,\n      currentPrice,\n      DI: 50,\n    })';
    const call = /tecUpdatePosition\(\{([\s\S]*?)\n    \}\)/.exec(bad);
    expect(call).not.toBeNull();
    expect(call![1]).not.toMatch(/currentPrice:\s*triggerPrice/);
  });

  it('8b. ⛔ `tecShouldClose` RECEIVES THE TRIGGER TOO — the describe says EVERY surface', () => {
    // FINDING-9: test 8 pinned ONE of the two controller hand-offs while the block claimed to
    // cover both. A fence whose name is broader than its assertions is the same defect as a
    // prohibition on strings — it reads as coverage it does not have.
    expect(body).toMatch(/tecShouldClose\(\s*input\.tradeId,\s*triggerPrice\s*,/);
  });

  it('8c. ⭐ CONTROL — the SAME matcher catches a `tecShouldClose` still on the mark', () => {
    const bad = 'if (tecShouldClose(input.tradeId, currentPrice, tickTs, discontinuity)) {';
    expect(bad).not.toMatch(/tecShouldClose\(\s*input\.tradeId,\s*triggerPrice\s*,/);
  });

  it('8d. ⛔⛔ THE HARD FLOOR PAIR — AND IT IS THE SURFACE THAT IS LIVE TODAY', () => {
    // ⚠️ FINDING-10, WHICH IS FINDING-9 A THIRD TIME IN THIS SAME BLOCK. The describe says
    // "every trigger surface"; after two widenings it still pinned TWO OF FIVE. Worse, the two
    // it pinned are the controller hand-offs — which only run when `atr_at_open > 0`, and that
    // field is 0 on every position we can read. ⇒ THE UNPINNED PAIR IS THE ONE ACTUALLY
    // DECIDING EXITS TODAY, and a fence that covers only the dormant surfaces is the emptiest
    // kind of green. (Langston CONDITION 1.)
    expect(body).toMatch(/triggerPrice\s*<=\s*input\.stopPrice/);
    expect(body).toMatch(/triggerPrice\s*>=\s*input\.targetPrice/);
  });

  it('8e. ⛔ THE DISCONTINUITY DETECTOR READS THE TRIGGER — the fifth surface', () => {
    // A per-symbol state machine fed by whichever price we hand it. Crypto is a documented
    // no-op inside it today, so this is inert — but inert-by-a-callee's-early-return is not the
    // same as correct, and the next class to enter that detector would inherit the mark.
    expect(body).toMatch(/isDiscontinuityActive\(\s*input\.symbol,\s*triggerPrice\s*,/);
  });

  it('8f. ⭐ CONTROL — all three matchers REJECT the pre-P2 forms', () => {
    // Without this, 8d/8e over a renamed or moved expression read as a pass for ever.
    const pre = 'if (currentPrice <= input.stopPrice) {} if (currentPrice >= input.targetPrice) {}'
      + ' const d = isDiscontinuityActive(input.symbol, currentPrice, tickTs);';
    expect(pre).not.toMatch(/triggerPrice\s*<=\s*input\.stopPrice/);
    expect(pre).not.toMatch(/triggerPrice\s*>=\s*input\.targetPrice/);
    expect(pre).not.toMatch(/isDiscontinuityActive\(\s*input\.symbol,\s*triggerPrice\s*,/);
  });

  it('8g. ⛔⛔ THE EXIT LANE USES ITS OWN *BOTH* CEILINGS — age AND spread', () => {
    // B-4: P2-4 split the AGE ceiling off the shared constant and then re-used the shared SPREAD
    // one — the same inconsistency, one field over. The shared spread value is 0.50, which admits
    // a bid at 0.75x mid: a wide book hands the stop check a trigger 25% below the mark, fires
    // stop_hit, and books the CLAMPED STOP, a fill nobody could have got.
    const sel = /selectTouchPrice\(([\s\S]*?)\n            \);/.exec(code(AEE));
    expect(sel).not.toBeNull();                     // instrument control
    expect(sel![1].length).toBeGreaterThan(0);
    expect(sel![1]).toMatch(/maxAgeMs:\s*EXIT_TRIGGER_MAX_AGE_MS/);
    expect(sel![1]).toMatch(/maxSpreadFraction:\s*EXIT_TRIGGER_MAX_SPREAD_FRACTION/);
    // ⛔ AND NEITHER SHARED CONSTANT MAY REAPPEAR IN THIS CALL.
    expect(sel![1]).not.toMatch(/LEVEL_BASIS_OBSERVATION_MAX_AGE_MS/);
    expect(sel![1]).not.toMatch(/LEVEL_BASIS_OBSERVATION_MAX_SPREAD_FRACTION/);
  });

  it('8h. ⭐ CONTROL — the OTHER two lanes still hold the SHARED constants, untouched', () => {
    // The complement, and it is the half that proves I did not quietly re-base three lanes. The
    // level and VTS lanes fail DIFFERENTLY (a worse estimate, not an unfillable booking), so their
    // number stays 3b.f-c's open question and must NOT have moved with this row.
    const ORCH = readFileSync(join(process.cwd(), 'server/services/signal-orchestrator.ts'), 'utf-8');
    const VTS = readFileSync(join(process.cwd(), 'server/services/vts-runner.ts'), 'utf-8');
    for (const src of [ORCH, VTS]) {
      expect(src).toMatch(/maxSpreadFraction:\s*LEVEL_BASIS_OBSERVATION_MAX_SPREAD_FRACTION/);
      expect(src).not.toMatch(/EXIT_TRIGGER_MAX_SPREAD_FRACTION/);
    }
    // ⛔ `8a-P3` — AMENDED DELIBERATELY AND VISIBLY. VTS's LEVEL lane still holds the shared constants (asserted
    // above); its EXIT lane now has its OWN, derived in `crypto-touch.ts` — never the paper exit lane's.
    expect(VTS).toMatch(/maxSpreadFraction:\s*VTS_EXIT_TOUCH_MAX_SPREAD_FRACTION/);
  });

  it('10. ⛔ THE BOOKING SITES ARE UNTOUCHED — only the trigger moved', () => {
    // The complement. If `exitPrice:` had followed the trigger onto the bid, the row would have
    // silently changed what we RECORD as well as what we DECIDE — two of the four jobs, when
    // only one was scoped.
    expect(body).toMatch(/exitPrice:\s*currentPrice/);
    expect(body).not.toMatch(/exitPrice:\s*triggerPrice/);
  });
});
