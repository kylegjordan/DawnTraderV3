/**
 * F-G-1 / BLOCKER-10 — THE xSTOCK VTS GRID COUNTER, END TO END.
 *
 * ⛔⛔ THE DEFECT THIS FENCES IS NOT "THE COUNTER IS WRONG" — IT IS "THE COUNTER IS WRITTEN AND
 * NOTHING READS IT." Langston's whole-tree census at the ref found: a write site using three
 * `as any` casts onto a field that existed on no interface; a lifetime accumulator that is a
 * hardcoded literal plus a hardcoded key list, carrying neither key; a route that builds the
 * xStock tab's payload as an explicit field-by-field literal with no spread, carrying neither key;
 * and ZERO readers. The client renders `gridTags ?? {}` and `gridEvaluated ?? 0`, so the tab showed
 * **0 would-fail / 0 checked** — an absent value wearing a plausible number's clothes, on the ONE
 * asset class whose grid is DERIVED rather than published. It read as "perfectly on-grid" exactly
 * where we are least sure.
 * ★ `SYSTEM_IMPACT_MAP.md` already states the five-step contract for this counter family —
 * declare, initialise, write, accumulate, expose. The batch did step 3 alone, and the `as any`
 * cast is what made steps 1 and 2 optional.
 *
 * ⚠️ TWO OF THESE ARE SOURCE-TEXT ASSERTIONS AND I AM NOT APOLOGISING FOR THEM. Langston's J4
 * ruling was that grepping your own COMMENTS is not a fence, because comments are where intent is
 * written. These grep two HARDCODED LISTS — the defect IS the list being short — and comments are
 * stripped first so prose cannot satisfy them. That is the right instrument for this defect.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { makeEmptyXstockCycleCounters } from '../../asset_classes/xstock_spot/eval-cycle';

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('F-G-1 BLOCKER-10 — step 1+2: the fields are DECLARED and INITIALISED', () => {
  // MUTATION: drop either field from the factory and this fails. Dropping it from the INTERFACE
  // fails the build, which is the point of removing the `as any` casts at the write site.
  it('the empty counters carry the grid fields, so nothing needs an `as any` to write them', () => {
    const c = makeEmptyXstockCycleCounters();
    expect(c.gridEvaluated).toBe(0);
    expect(c.gridTags).toEqual({});
  });
});

describe('F-G-1 BLOCKER-10 — step 3: the write site is TYPED, not cast', () => {
  // MUTATION: restore any `(counters as any).grid...` and this fails.
  // The cast is the mechanism: it let a write to an undeclared field compile, which is what made
  // the four missing steps invisible.
  it('no `as any` cast remains on the grid counters', () => {
    const src = stripComments(
      readFileSync(join(process.cwd(), 'server/asset_classes/xstock_spot/eval-cycle.ts'), 'utf8'));
    expect(src).toMatch(/counters\.gridEvaluated\s*\+=/);
    expect(src).not.toMatch(/counters as any\)\.grid/);
  });
});

describe('F-G-1 BLOCKER-10 — step 4: the lifetime accumulator carries them', () => {
  // ⛔ THE ACCUMULATOR IS A HARDCODED LITERAL PLUS A HARDCODED KEY LIST. A counter absent from
  // EITHER is silently dropped on its way to the tab, with no error anywhere.
  // MUTATION: remove 'gridEvaluated' from the summed key list, or gridTags from the merge, and
  // this fails.
  it('initialises both keys AND sums/merges them', () => {
    const src = stripComments(
      readFileSync(join(process.cwd(), 'server/asset_classes/xstock_spot/scanner.ts'), 'utf8'));
    expect(src).toMatch(/gridEvaluated:\s*0/);         // the literal
    expect(src).toMatch(/'gridEvaluated'/);            // the summed key list
    expect(src).toMatch(/lt\.gridTags\[/);             // the record merge
  });
});

describe('F-G-1 BLOCKER-10 — step 5: the route EXPOSES them', () => {
  // ⛔ THE LAST STEP, AND THE ONE THAT MADE THE OTHER FOUR POINTLESS. The xStock tab's payload is
  // an explicit field-by-field literal with NO SPREAD, so a key missing here is invisible however
  // correctly it was written upstream.
  // MUTATION: delete either line from the vtsEvaluation literal and this fails.
  it('the xStock vtsEvaluation payload carries both keys', () => {
    const src = stripComments(readFileSync(join(process.cwd(), 'server/routes.ts'), 'utf8'));
    expect(src).toMatch(/gridEvaluated:\s*lt\?\.gridEvaluated/);
    expect(src).toMatch(/gridTags:\s*lt\?\.gridTags/);
  });
});
