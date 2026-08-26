/**
 * B-EPOCH-READER-CENSUS — FENCE
 *
 * WHY THIS EXISTS, and it is Langston's objection rather than my idea:
 * B-EPOCH-KEYING-PARITY shipped a fence that tests the PREDICATE in isolation. It enumerates no
 * readers and derives no readers. So when a FIFTH reader (the balance curve) turned up on
 * 2026-08-26 -- after the batch built to fix reader divergence -- nothing caught it, and nothing
 * would catch a sixth. His ruling: "a fifth reader found after the batch built to fix reader
 * divergence means that census was incomplete."
 *
 * ⛔ WHAT THIS FENCE ASSERTS, and what it deliberately does NOT:
 *   IT DOES assert that no file re-implements the epoch rule locally -- the copy-per-reader shape
 *     that put the rule into one reader of four in the first place (#900).
 *   IT DOES NOT assert that every P&L reader is epoch-scoped, because THAT IS NOT TRUE AND MUST
 *     NOT BECOME TRUE. The daily-loss budget and the guardrail settings read realized P&L over a
 *     SESSION window on purpose: a daily loss budget is not a lifetime scoreboard, and clamping it
 *     to the epoch would silently widen the risk envelope. A blanket "scope everything" sweep would
 *     have broken the kill switch. The census is a per-site judgement, not a rule.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('B-EPOCH-READER-CENSUS — one home for the rule', () => {
  it('the shared predicate is exported from exactly ONE module', () => {
    const dm = read('services/dashboard-metrics.ts');
    expect(dm).toMatch(/export function isInObservationEpoch/);
    expect(dm).toMatch(/export function clampWindowToEpoch/);
  });

  it('★ NO FILE RE-IMPLEMENTS THE BOTH-LEG RULE LOCALLY — the copy-per-reader shape #900 exists to stop', () => {
    // The rule's signature in code: comparing an OPEN time against the epoch. Any file that does
    // that WITHOUT importing the shared predicate is carrying its own copy.
    const suspects = ['routes.ts', 'storage.ts', 'services/dashboard-metrics.ts'];
    for (const rel of suspects) {
      const src = read(rel);
      const reimplements = /openedAt\s*\)?\s*>=\s*epoch|opened_at\s*>=\s*\(SELECT ts/i.test(src);
      if (!reimplements) continue;
      // storage.ts is the SQL implementation and is the one legitimate second copy — it is a
      // different language and cannot import the TS predicate. It is tracked by #900, which
      // requires a row-level SQL-vs-TS parity fence. Everything else must import.
      if (rel === 'storage.ts') continue;
      expect(src, `${rel} compares an open time to the epoch without importing the shared predicate`)
        .toMatch(/isInObservationEpoch/);
    }
  });

  it('★ every route that CLAMPS an epoch window also uses the shared clamp (no hand-rolled max())', () => {
    const src = read('routes.ts');
    const clampCalls = (src.match(/clampWindowToEpoch\(/g) ?? []).length;
    // Two known epoch-windowed routes today: trades/analytics and balance-curve.
    // A new one that hand-rolls `epoch > since ? epoch : since` instead of calling the shared
    // clamp is the divergence this fence is for.
    expect(clampCalls).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/epoch\w*\s*>\s*since\s*\?\s*epoch/i);
  });

  it('★ the balance curve — the FIFTH reader — is wired to the shared predicate, not a copy', () => {
    const src = read('routes.ts');
    const i = src.indexOf("'/active-engine/balance-curve'");
    expect(i, 'balance-curve route not found').toBeGreaterThan(-1);
    const body = src.slice(i, i + 4000);
    expect(body, 'balance curve must clamp its window to the epoch').toMatch(/clampWindowToEpoch/);
    expect(body, 'balance curve must key its closes on BOTH legs').toMatch(/isInObservationEpoch/);
  });

  it('the daily-loss budget is deliberately NOT epoch-scoped — clamping it would widen the risk envelope', () => {
    // A guard on the guard: if someone "fixes" this by scoping it, the kill switch stops measuring
    // today's loss and starts measuring loss-since-the-epoch, which is strictly more permissive.
    const src = read('services/daily-loss-budget.ts');
    expect(src).toMatch(/getRealizedPnlSince/);
    expect(src, 'the daily-loss budget must NOT be epoch-clamped').not.toMatch(/isInObservationEpoch|clampWindowToEpoch/);
  });
});
