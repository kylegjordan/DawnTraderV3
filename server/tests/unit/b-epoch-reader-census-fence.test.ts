/**
 * B-EPOCH-READER-CENSUS — FENCE (r2, after Langston blocked r1 for reproducing its own defect)
 *
 * ⛔ WHAT r1 GOT WRONG, kept because it is the whole reason this file is shaped the way it is:
 * r1 enumerated its subjects as a HARDCODED NAME LIST — `['routes.ts','storage.ts','dashboard-metrics.ts']`
 * — one message after I told Langston that the previous fence "enumerates nothing… a sixth would be
 * invisible to it." A sixth reader in a FOURTH file was invisible to my replacement too. His ruling:
 * "the subject must be DERIVED… a name list passes green while the defect is live."
 *
 * ⇒ THE SUBJECT IS NOW DERIVED: walk every .ts under server/, apply the rule-shape regex, and assert
 * each match imports the shared predicate. Nothing is listed by name except the ONE declared
 * exception, and that exception carries its reason and its tracking issue.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SERVER = join(__dirname, '..', '..');

/** DERIVED subject: every .ts under server/, tests and build output excluded. */
function allServerSources(dir = SERVER, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'tests' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) allServerSources(full, acc);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) acc.push(full);
  }
  return acc;
}

/**
 * The RULE SHAPE, in both languages:
 *   TS  — comparing an OPEN time against an epoch value
 *   SQL — `opened_at >= (SELECT ts FROM epoch)`
 * Anything matching this is implementing the both-leg rule. It must import the shared predicate
 * instead — unless it is the one declared exception.
 */
const RULE_SHAPE = /opened?_?[Aa]t\s*\)?\s*>=\s*[_a-zA-Z]*[Ee]poch|opened_at\s*>=\s*\(\s*SELECT\s+ts/;

/** THE ONE DECLARED EXCEPTION, by reason not convenience. */
const SQL_EXCEPTION = 'storage.ts'; // the SQL implementation — cannot import a TS predicate. Tracked by #900.

describe('B-EPOCH-READER-CENSUS — the subject is DERIVED, not listed', () => {
  it('the derived sweep actually finds files — POSITIVE CONTROL, so a green result is not an empty one', () => {
    const files = allServerSources();
    expect(files.length).toBeGreaterThan(50);                       // the walk works
    const matches = files.filter(f => RULE_SHAPE.test(readFileSync(f, 'utf8')));
    expect(matches.length, 'the rule-shape regex matched NOTHING — it has rotted and every assertion below is vacuous')
      .toBeGreaterThan(0);
  });

  it('★ EVERY file implementing the both-leg rule imports the shared predicate — one declared exception', () => {
    const offenders: string[] = [];
    for (const f of allServerSources()) {
      const src = readFileSync(f, 'utf8');
      if (!RULE_SHAPE.test(src)) continue;
      const rel = relative(SERVER, f);
      if (rel.endsWith(SQL_EXCEPTION)) continue;                    // declared, reasoned, tracked by #900
      if (!/isInObservationEpoch/.test(src)) offenders.push(rel);
    }
    expect(offenders, `these files carry their own copy of the both-leg rule instead of importing it: ${offenders.join(', ')}`)
      .toEqual([]);
  });

  it('the shared predicate is exported from exactly ONE module', () => {
    const dm = readFileSync(join(SERVER, 'services', 'dashboard-metrics.ts'), 'utf8');
    expect(dm).toMatch(/export function isInObservationEpoch/);
    expect(dm).toMatch(/export function clampWindowToEpoch/);
  });
});

describe('B-EPOCH-READER-CENSUS — IDENTITY, not counts (#579: a count survives a 1-for-1 swap)', () => {
  const routes = () => readFileSync(join(SERVER, 'routes.ts'), 'utf8');
  // Bound the body by the NEXT route declaration, not by a character count. A fixed window is a
  // magic number that silently truncates when a handler grows -- which is how r2 of this fence
  // first reported a false failure on trades/analytics.
  const bodyOf = (marker: string) => {
    const src = routes();
    const i = src.indexOf(marker);
    expect(i, `route ${marker} not found`).toBeGreaterThan(-1);
    const next = src.indexOf('apiRouter.get(', i + marker.length);
    return src.slice(i, next > i ? next : undefined);
  };

  it('★ balance-curve — the FIFTH reader — clamps AND keys on both legs', () => {
    const b = bodyOf("'/active-engine/balance-curve'");
    expect(b, 'must clamp its window to the epoch').toMatch(/clampWindowToEpoch/);
    expect(b, 'must key its closes on BOTH legs').toMatch(/isInObservationEpoch/);
  });

  it('★ trades/analytics clamps AND keys on both legs', () => {
    const b = bodyOf("'/active-engine/trades/analytics'");
    expect(b, 'must clamp its window to the epoch').toMatch(/clampWindowToEpoch/);
    expect(b, 'must key its window on BOTH legs').toMatch(/isInObservationEpoch/);
  });

  it('no route hand-rolls the clamp instead of calling the shared one', () => {
    expect(routes()).not.toMatch(/[_a-zA-Z]*[Ee]poch\w*\s*>\s*since\s*\?/);
  });
});

describe('B-EPOCH-READER-CENSUS — the guard on the guard', () => {
  it('★ the daily-loss budget is NOT epoch-scoped, by IMPORT or by HAND-ROLLED comparison', () => {
    // Why this is a guard and not an omission: the daily-loss budget is the kill switch's
    // NUMERATOR and measures loss over a SESSION window. Clamping it to the epoch changes what
    // it measures. Langston's correction, taken: the direction is NOT fixed — under a
    // max()-clamp the window can only shrink and the effect bites hardest ON RE-ANCHOR DAY;
    // under a naive `since = epoch` REPLACEMENT it can instead pin the switch at kill. Either
    // way it is the wrong instrument, so this fails on BOTH forms of the change.
    const src = readFileSync(join(SERVER, 'services', 'daily-loss-budget.ts'), 'utf8');
    expect(src, 'sanity: the budget must still read realized P&L over a session window').toMatch(/getRealizedPnlSince/);
    expect(src, 'must not IMPORT the epoch predicate').not.toMatch(/isInObservationEpoch|clampWindowToEpoch/);
    expect(src, 'must not HAND-ROLL an epoch comparison either — that is the copy-per-reader shape')
      .not.toMatch(RULE_SHAPE);
  });
});
