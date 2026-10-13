# B-VENUE-QUIET-ALERTING — r7 — STEP 4 CHANGE LIST (Step 9 iteration after FAIL-3)

**Graded ref:** `50dbbea8dbd46a379c45e5a82f22808fc9d6f0b9` on `migration/aws-supabase` · **Design:** `Langston Design Asks/B_VENUE_QUIET_ALERTING_STEP9_R7_DESIGN.md` r7d (`1d05ffa48`) — Langston 02:48Z: (vi) over (v), A.7 carries, B.3 approved with the ordering condition · change-class: architecture (unchanged) · row 3a1.

## The change set — 6 files (`git status --porcelain` checked for `??`: the one new file is the r7 test)
| file | what |
|---|---|
| `server/services/venue-quiet-alerting.ts` | A.5 session gate; A.8 clock reset; B.3 hand-back; `xstockCountColdHoldsEscalation`; `clearEvidence.supersededBySessionChange`; `SweepPosition.assetClass`; `SweepDeps.clearLatch`; header |
| `server/services/passive-archive/equity-spot-archiver.ts` | A.7 first-update-frame clock + `isEquityTickingCountWarm` |
| `server/services/active-execution-engine.ts` | A.7 cold hold at the crossing; the sweep's `clearLatch` dep; `assetClass` passed to the sweep |
| `server/tests/unit/b-venue-quiet-alerting-r7.test.ts` | NEW, 15 tests |
| `server/tests/unit/b-venue-quiet-alerting.test.ts` | 2 engine tests; 3 expectations flipped as designed; replay comment corrected; `deps.clearLatch` |
| `server/tests/unit/b-venue-quiet-alerting-r4-frames.test.ts` | 2 archiver tests |

## A.5 — the session gate (`familyJoinsStandingRecord`)
```ts
// BEFORE
  if (family === 'quiet_market') return verdict === 'quiet';
// AFTER (after the `null`, `closed` and `thin` arms — so thin still pages off-session)
  if (family === 'quiet_market') return verdict === 'quiet' || getXstockSession(nowMs) !== 'regular';
```

## A.8 — BLOCKER-2: the duration clock resets when the regular session ends (`VenueQuietState.noteVerdict`)
```ts
// BEFORE
    if (v === 'quiet' || v === 'closed') { this.notQuietSince = null; this.durationEscalated.clear(); }
    else if (this.notQuietSince === null) this.notQuietSince = nowMs;
// AFTER  (+ field: lastSession: XstockSession | null = null)
    const session = getXstockSession(nowMs);
    const leftRegular = this.lastSession === 'regular' && session !== 'regular';
    this.lastSession = session;
    if (v === 'quiet' || v === 'closed' || leftRegular) { this.notQuietSince = null; this.durationEscalated.clear(); }
    if (v !== 'quiet' && v !== 'closed' && this.notQuietSince === null) this.notQuietSince = nowMs;
```
Semantics: on the first sweep after the session leaves `regular` the clock is cleared and, if that sweep is not-quiet, restarts at that sweep — so 30 min of continuous off-session not-quiet still pages. ⚠️ `lastSession` is in memory: after a restart the first sweep sets it, so a restart straddling 16:00 ET does not see the transition — but a restart also starts the clock afresh at its first sweep, so nothing is inherited either way.

## A.7 — BLOCKER-1: the cold count at a restart
```ts
// equity-spot-archiver.ts
let firstTickerUpdateAtMs: number | null = null;
export function isEquityTickingCountWarm(nowMs: number): boolean {
  return firstTickerUpdateAtMs !== null && nowMs - firstTickerUpdateAtMs >= EQUITY_TICKING_WINDOW_MS;
}
//   … at the single update-frame site:
    if (frameType === 'update') {
      lastTickerUpdateAt.set(_sym, _now);
      if (firstTickerUpdateAtMs === null) firstTickerUpdateAtMs = _now;
    }
//   … `_resetTickerUpdateClockForTests` also nulls it.

// venue-quiet-alerting.ts
export function xstockCountColdHoldsEscalation(nowMs: number, engineAgeMs: number): boolean {
  return !isEquityTickingCountWarm(nowMs) && engineAgeMs < NOT_WARM_GRACE_MS;
}

// active-execution-engine.ts, _recordPriceSkip — after the cold-knob return and the unseeded alert, before `_crossed`
    if (_cls === 'xstock_spot' && _knob === 'ok' && xstockCountColdHoldsEscalation(Date.now(), Date.now() - this._engineConstructedAt)) return;
```
- Only `_knob === 'ok'`: an unseeded or not-warm knob keeps its own path untouched.
- The streak keeps counting (incremented above the return), so the first warm tick decides on a real count.
- Fail-closed: past `NOT_WARM_GRACE_MS` (120 s) from construction it never holds — a feed with no update frame reads `T=0` ⇒ `thin` ⇒ pages.
- The sweep is NOT gated by the cold count: a cold sweep reads `thin`, which cannot resolve the standing record and starts the duration clock ~1 min early at most (30 min threshold). Named, not changed.

## B.3 — FINDING-1: the off-session row handed back (`sweepVenueQuiet`, `skipPat` branch)
```ts
// BEFORE
      const priced = positions.find((p) => pricedAfter(p, createdMs));
      if (priced) await tryResolve(key, clearEvidence.pricedAfterMint(priced.id));
      continue;
// AFTER
      const priced = positions.find((p) => pricedAfter(p, createdMs));
      if (priced) { await tryResolve(key, clearEvidence.pricedAfterMint(priced.id)); continue; }
      const xs = positions.find((p) => p.assetClass === 'xstock_spot');
      if (xs && getXstockSession(createdMs) !== 'regular' && getXstockSession(nowMs) === 'regular') {
        deps.clearLatch(xs.id);                                                 // FIRST — in memory, cannot fail
        await tryResolve(key, clearEvidence.supersededBySessionChange(xs.id)); // a failure retries next sweep
      }
      continue;

// active-execution-engine.ts — the dep, and the asset class passed in
          clearLatch: (id: string) => { this._priceSkipStreak.delete(id); this._priceSkipReasons.delete(id); this._priceSkipEscalated.delete(id); } },
    void this._runVenueQuietSweep(openPositions.map((p) => ({ id: p.id, symbol: p.symbol, assetClass: p.assetClass })));
```
- Every family (your INVH point): no family read at all, so `memberFamilies` is not needed here — the legacy-row concern does not arise.
- **No per-session set:** once superseded, the key has no off-session row; a row minted again in session has an in-session `created_at` and is not touched. So nothing re-supersedes in a loop, and a restart cannot re-supersede a resolved row.
- While a resolve keeps failing, each sweep clears the latch again; a re-crossing in between is swallowed by the still-held row until the retry lands, and `resolveStuckAfterMs` raises the stuck row as it always has.
- `clearLatch` clears exactly the three maps the pricing site clears (`active-execution-engine.ts` "A position that reaches here has a VENUE price").

## Verification
- **Tests:** r7 file 15 + engine 2 + archiver 2 (each listed in the commit message). Three existing expectations flipped **as designed**: (1) `['book_state','quiet_market'], not_quiet, AFTER_HOURS` now joins (in-session twin added: still pages); (2) the 10-06 replay pages none off-session — NWL (T=401, 20:17:17Z) was the same wind-down edge the pre-audit had predicted would still page — and still pages when judged in session; (3) the inverted-quiet mutation is judged in session (44 of 46), and off-session the inverted rule pages none.
- **⚠️ A record correction inside the replay test:** its comment said ~9 of the 46 rows fall in the 19:30-20:00Z regular window. The store's first row is NWL at 20:17:17.895Z — all 46 are after hours. Corrected in the comment.
- **Mutants, each killed:** session gate removed → 5 fail · close reset removed → 2 · clear/resolve swapped → 1 · engine cold hold removed → 1 · fail-closed bound removed → 13.
- **tsc 337 = 337. Full suite 4,144 passed;** the same 10 files fail on the clean tree.

## Staging, pre-registered for the next weekday (written now, before the data)
1. **Read on the deployed sha (Langston rider):** off-session, the sweep's `held=` list **names** the quiet-only positions that would have paged before r7, with their `reasonFamilies` — the positive carrier (rider a: an absence of mints is suppressed by design and is not evidence). Secondary: any in-session quiet-only mint listed with `T`, verdict and the symbol's own last update.
2. **The deploy restart itself:** zero xStock `price-skip` mints in the first 120 s after `pm_uptime`, and the first post-restart sweep lines read as they do today.
3. **B.3:** if an off-session row is still held at the open, a `SUPERSEDED-BY-SESSION-CHANGE` resolve at the first regular sweep, and no mint by the sweep. If none is held, recorded as not exercised (unit tests are the evidence).
4. **The duration page** is still never-fired in production — a first firing is recorded whenever it happens; its absence is not evidence.
