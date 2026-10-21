/**
 * B-XSTOCK-BID-TRIGGER-RELAND increment (4b) (sprint row 2, objective 8) — THE ONE EXIT-TRIGGER RULE, FENCED.
 * Plan: `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4B_PRE_AUDIT.md` (r3/r4, P1-P4, P9-P10).
 *
 * (a) DECISION-SITE FENCE — every production `evaluateTECExit(` call hands it a `selectExitTrigger(…)` price, and there
 *     are exactly three. ⚠️ ITS REACH, STATED (Langston condition B / A11): it catches a FOURTH caller of the shared
 *     evaluator or an inline price at a known caller. It does NOT catch a new exit path that bypasses `evaluateTECExit`
 *     altogether — nothing here can see a decision that never reaches the evaluator.
 * (b) THE RULE'S TABLE, every row, run.
 * (c) MUTATIONS, in this repo's idiom (an in-test fixture control, not source substitution — the `8a-P1` X3 pattern):
 *     each wrong variant of the rule is RUN against the frozen fixture and must FAIL it.
 * (d) THE FROZEN EXPECTED-VALUE FIXTURE — written from the three sites' behaviour BEFORE this diff (`8a-P4b` r1, `3n.q3`
 *     condition 2, `8a-P4c` increment 3, row 2 increment B), so equality is a standing fence, not a one-shot comparison.
 *     It carries a CRYPTO row deliberately given an `armed: false` arm (Langston BLOCKER-4): the class is tested first.
 * (e) THE A10 CENSUS AS A FENCE — the ASSIGNMENT SITES: the arm at one, the off-reason at exactly two, and no `?? 'unset'`.
 *     ⚠️ ITS REACH, STATED (Langston Step-4 R2): it does NOT prove the PATH property that makes the rule's throw unreachable —
 *     that every xStock position reaching the evaluator passed through one of those sites. A new arm inside the xStock
 *     block, above the book-state block, that does not `continue` would pass this fence and reach the throw (a hold).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectExitTrigger, exitTriggerClass, type ExitTriggerInput, type ExitTriggerSelection } from '../../core/trading/exit-trigger.js';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, '');
const AEE = code(read('server/services/active-execution-engine.ts'));
const VTS = code(read('server/services/vts-runner.ts'));

/** Every `evaluateTECExit({ … })` argument object in `src`, by brace balance. */
function evaluateTECExitArgs(src: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf('evaluateTECExit({', from);
    if (at === -1) return out;
    let depth = 0;
    const open = src.indexOf('{', at);
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { out.push(src.slice(open, i + 1)); from = i + 1; break; } }
    }
  }
}

type Row = { name: string; input: ExitTriggerInput; want: ExitTriggerSelection };
/** (d) THE FROZEN FIXTURE — what each lane handed the evaluator before (4b), class by class. */
const FIXTURE: Row[] = [
  { name: 'crypto, bid present (paper ladder / VTS touch)', input: { cls: 'crypto_spot', bid: 99.5, bidRefusal: null }, want: { price: 99.5, basis: 'bid', reason: 'ok' } },
  { name: 'crypto, no side (ladder refused)', input: { cls: 'crypto_spot', bid: null, bidRefusal: 'book_untrusted' }, want: { price: null, basis: 'none', reason: 'book_untrusted' } },
  { name: 'crypto, ok selection but no bid', input: { cls: 'crypto_spot', bid: null, bidRefusal: 'no_bid_side' }, want: { price: null, basis: 'none', reason: 'no_bid_side' } },
  // ⛔ BLOCKER-4: the old paper arm expression was FALSE on every crypto position. Cast past the type on purpose: a rule
  //   that tests the arm before the class sends this row to the mark (100) — a decision change on a live lane.
  { name: 'crypto given armed:false (class first)', input: { cls: 'crypto_spot', bid: 99.5, bidRefusal: null, arm: { armed: false, armOff: 'guard_off' }, mark: 100 } as unknown as ExitTriggerInput, want: { price: 99.5, basis: 'bid', reason: 'ok' } },
  { name: 'xStock armed, bid present', input: { cls: 'xstock_spot', arm: { armed: true }, bid: 399.6, bidRefusal: null, mark: 400 }, want: { price: 399.6, basis: 'bid', reason: 'ok' } },
  { name: 'xStock armed, crossed frame (paper)', input: { cls: 'xstock_spot', arm: { armed: true }, bid: null, bidRefusal: 'guarded_crossed', mark: 400 }, want: { price: null, basis: 'none', reason: 'guarded_crossed' } },
  { name: 'xStock armed, VTS guard too wide', input: { cls: 'xstock_spot', arm: { armed: true }, bid: null, bidRefusal: 'too_wide', mark: 400 }, want: { price: null, basis: 'none', reason: 'too_wide' } },
  { name: 'xStock unarmed, spread_blown off', input: { cls: 'xstock_spot', arm: { armed: false, armOff: 'spread_blown_off' }, bid: 320, bidRefusal: null, mark: 382.5 }, want: { price: 382.5, basis: 'mark', reason: 'spread_blown_off' } },
  { name: 'xStock unarmed, guard off', input: { cls: 'xstock_spot', arm: { armed: false, armOff: 'guard_off' }, bid: 320, bidRefusal: null, mark: 382.5 }, want: { price: 382.5, basis: 'mark', reason: 'guard_off' } },
  { name: 'other class, paper policy (mark)', input: { cls: 'other', otherClass: 'mark', mark: 100 }, want: { price: 100, basis: 'mark', reason: 'class_mark' } },
  { name: 'other class, VTS policy (none)', input: { cls: 'other', otherClass: 'none', mark: 100 }, want: { price: null, basis: 'none', reason: 'class_unbranched' } },
];

const passesFixture = (rule: (i: ExitTriggerInput) => ExitTriggerSelection) =>
  FIXTURE.every(({ input, want }) => { try { return JSON.stringify(rule(input)) === JSON.stringify(want); } catch { return false; } });

describe('row 2 (4b) — the rule, the frozen fixture, and its mutations', () => {
  it('(b)+(d) the rule reproduces every frozen row', () => {
    for (const { name, input, want } of FIXTURE) expect(selectExitTrigger(input), name).toEqual(want);
  });

  it('(c) MUTATIONS — every wrong variant FAILS the fixture (run, not predicted)', () => {
    const real = selectExitTrigger;
    expect(passesFixture(real)).toBe(true); // control: the fixture admits the real rule
    // M1 — class after arm (BLOCKER-4): an arm field anywhere sends the row to the mark.
    const classAfterArm = (i: ExitTriggerInput): ExitTriggerSelection => {
      const a = (i as { arm?: { armed: boolean; armOff?: string } }).arm;
      if (a && !a.armed) return { price: (i as { mark: number }).mark, basis: 'mark', reason: a.armOff as 'guard_off' };
      return real(i);
    };
    // M2 — the ungated bid (re-opens `#1065`): an unarmed xStock still triggers on its bid.
    const ungated = (i: ExitTriggerInput): ExitTriggerSelection =>
      i.cls === 'xstock_spot' ? real({ ...i, arm: { armed: true } }) : real(i);
    // M3 — mark fallback when armed: no bid ⇒ the mark (the midpoint `3n` forbids).
    const markFallback = (i: ExitTriggerInput): ExitTriggerSelection => {
      const r = real(i);
      return r.price === null && i.cls !== 'other' && 'mark' in i ? { price: i.mark, basis: 'mark', reason: r.reason } : r;
    };
    // M4 — inverted arm: armed ⇒ mark, unarmed ⇒ bid.
    const inverted = (i: ExitTriggerInput): ExitTriggerSelection =>
      i.cls === 'xstock_spot'
        ? (i.arm.armed ? { price: i.mark, basis: 'mark', reason: 'spread_blown_off' } : real({ ...i, arm: { armed: true } }))
        : real(i);
    // M5 — paper's other-class rule given to the VTS (BLOCKER-1): `none` behaves as `mark`.
    const paperPolicyEverywhere = (i: ExitTriggerInput): ExitTriggerSelection =>
      i.cls === 'other' ? real({ ...i, otherClass: 'mark' }) : real(i);
    // M6 — a default label instead of a required off-reason (P10's dead `?? 'unset'`).
    const defaultLabel = (i: ExitTriggerInput): ExitTriggerSelection =>
      i.cls === 'xstock_spot' && !i.arm.armed ? { price: i.mark, basis: 'mark', reason: 'unset' as 'guard_off' } : real(i);
    for (const [name, m] of [['classAfterArm', classAfterArm], ['ungated', ungated], ['markFallback', markFallback],
      ['inverted', inverted], ['paperPolicyEverywhere', paperPolicyEverywhere], ['defaultLabel', defaultLabel]] as const) {
      expect(passesFixture(m), name).toBe(false);
    }
  });

  it('an unarmed xStock with no off-reason THROWS (a caller bug; the paper per-position try makes it a hold)', () => {
    expect(() => selectExitTrigger({ cls: 'xstock_spot', arm: { armed: false } as never, bid: 1, bidRefusal: null, mark: 1 })).toThrow(/off-reason/);
  });

  it('exitTriggerClass: the two `3n` classes are themselves; everything else is `other`', () => {
    expect(exitTriggerClass('crypto_spot')).toBe('crypto_spot');
    expect(exitTriggerClass('xstock_spot')).toBe('xstock_spot');
    for (const c of ['crypto_perp', 'xstock_perp', '', null, undefined]) expect(exitTriggerClass(c)).toBe('other');
  });
});

describe('row 2 (4b) (a) — the DECISION-SITE fence: exactly three evaluator calls, each on the one rule', () => {
  it('three production `evaluateTECExit(` calls, and each triggerPrice is a selectExitTrigger price', () => {
    const paper = evaluateTECExitArgs(AEE);
    const vts = evaluateTECExitArgs(VTS);
    expect(paper).toHaveLength(1);
    expect(vts).toHaveLength(2);
    const slots = [...paper, ...vts].map((a) => /triggerPrice:\s*([^,}]+)/.exec(a)?.[1].trim());
    expect(slots).toEqual(['exitTrigger.price', '_vtsTrigger.price', '_sTrigger.price']);
    // each named selection IS the rule's output, in the same file
    expect(AEE).toMatch(/const exitTrigger = selectExitTrigger\(/);
    expect(VTS).toMatch(/const _vtsTrigger = selectExitTrigger\(/);
    expect(VTS).toMatch(/const _sTrigger = selectExitTrigger\(/);
  });

  it('no other production file calls the shared evaluator (a fourth caller goes red)', () => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'tests' && e.name !== 'node_modules') walk(p); }
        else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) && /evaluateTECExit\(/.test(code(readFileSync(p, 'utf-8')))) out.push(p.replace(/\\/g, '/'));
      }
    };
    walk(join(process.cwd(), 'server'));
    const callers = out.filter((p) => !p.endsWith('server/services/tec-evaluator.ts')).map((p) => p.slice(p.indexOf('server/'))).sort();
    expect(callers).toEqual(['server/services/active-execution-engine.ts', 'server/services/vts-runner.ts']);
  });

  it('the per-lane other-class policy: paper MARK, both VTS lanes NONE (BLOCKER-1)', () => {
    expect(AEE.match(/otherClass: 'mark'/g) ?? []).toHaveLength(1);
    expect(AEE).not.toMatch(/otherClass: 'none'/);
    expect(VTS.match(/otherClass: 'none'/g) ?? []).toHaveLength(2);
    expect(VTS).not.toMatch(/otherClass: 'mark'/);
  });

  it('CONTROL — the extractor finds a fourth call and an inline price in a fixture', () => {
    const fx = 'a(); await evaluateTECExit({ x, triggerPrice: currentPrice, y }); await evaluateTECExit({ triggerPrice: _z.price });';
    const got = evaluateTECExitArgs(fx).map((a) => /triggerPrice:\s*([^,}]+)/.exec(a)?.[1].trim());
    expect(got).toEqual(['currentPrice', '_z.price']); // an inline price is visible, so the slot assertion above can fail
  });
});

describe('row 2 (4b) (e) — the A10 census, fenced: every unarmed xStock path names its off-reason', () => {
  it('the arm is assigned at ONE site, the off-reason at exactly TWO, and no default label survives', () => {
    // the declaration starts it false (`let … = false`); exactly ONE assignment arms it
    expect(AEE.match(/let xsBidTriggerArmed = false;/g) ?? []).toHaveLength(1);
    expect(AEE.match(/(?<!let )\bxsBidTriggerArmed = /g) ?? []).toHaveLength(1);
    expect(AEE).toMatch(/xsBidTriggerArmed = _c\.spreadBlownEnabled === true;/);
    const offs = AEE.match(/\bxsBidTriggerOff = '(\w+)'/g) ?? [];
    expect(offs.sort()).toEqual(["xsBidTriggerOff = 'guard_off'", "xsBidTriggerOff = 'spread_blown_off'"]);
    expect(AEE).not.toMatch(/\?\? 'unset'/);
  });

  it('CONTROL — the census matcher counts a third assignment in a fixture', () => {
    const fx = "xsBidTriggerOff = 'guard_off'; xsBidTriggerOff = 'spread_blown_off'; xsBidTriggerOff = 'other';";
    expect(fx.match(/\bxsBidTriggerOff = '(\w+)'/g)).toHaveLength(3);
  });
});
