# B-NEW-42b Step 4 Code Review — Round 2 (BLOCKERS fixed)

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-17
**Batch:** B-NEW-42b

---

## Both blockers resolved

### Blocker 1 fix — `currentTs` plumbing complete

`tec-evaluator.ts:367` (now at the post-hoist line position) — `tecShouldClose(input.tradeId, currentPrice, tickTs, discontinuity)`. The `tickTs` variable is resolved once at the top of the trailing branch and passed to BOTH `tecUpdatePosition` AND `tecShouldClose` so they see the same logical-tick time.

### Blocker 2 fix — single hoisted detector consult (Option A)

`tec-evaluator.ts` now consults `isDiscontinuityActive` ONCE per logical tick. The result threads down via:

```ts
const tickTs = input.currentTs ?? Date.now();
const discontinuity = isDiscontinuityActive(input.symbol, currentPrice, tickTs);

tecUpdatePosition({ ... currentTs: tickTs, discontinuity });
if (tecShouldClose(input.tradeId, currentPrice, tickTs, discontinuity)) { ... }
```

Inside TEC:
- `updatePosition`'s target-lock check uses `update.discontinuity ?? isDiscontinuityActive(...)` — the fallback only fires if a direct caller (b65/b80/b79 test) calls it without the new param. Production path goes through tec-evaluator which always provides the result, so the fallback is never exercised in production.
- `shouldClosePosition` now takes `discontinuity?: { active, kind? }` as a param. Internal `isDiscontinuityActive` call removed. If discontinuity is omitted (direct test callers), the gate is disabled — pre-B-NEW-42b behavior preserved.

The state machine now advances exactly ONCE per logical tick. The intended 2-tick deferral (DISCONTINUITY_ACTIVE → confirming-tick CLEARING → IDLE) holds.

### Minor — corp_action diagnostic prev-capture

`price-discontinuity-detector.ts` corp_action branch now captures `const corpPrevPrice = entry.lastPrice; const corpPrevTs = entry.lastTs;` BEFORE the mutation. The diagnostic log now shows the real prior tick.

### Halt test `details.kind` assertion (your recommendation)

`b-new-42-tec-halt-resilience.test.ts` POST-RESUME GAP test now also asserts:

```ts
const entry = _testGetSymbolEntry('TSLA/USD');
expect(entry?.activeKind).toBe('halt_resume_gap');
```

Catches future drift where the currentTs plumbing regresses and cold_start silently fires instead.

## Test status

- 76/76 tests passing across: B-NEW-42b detector (13), B-NEW-42 assertion-inverted (6), b65-tec-parity (10), b80-tec-per-trade-keying (~15), b79-tec-per-class-cache (7), trailing-exit (legacy, ~25).
- POST-RESUME GAP test now asserts `entry.activeKind === 'halt_resume_gap'` — verified the SAME-LOGICAL-TICK two-consult pattern is gone (state machine advances once).
- No crypto regression (b65/b80/b79 tests all green).

## Re-ACK request

Both blockers + minor fixed. Walk the new tec-evaluator diff (~lines 290-360 are the substantive change) and the trailing-exit-controller `shouldClosePosition` + `updatePosition` target-lock-gate signature changes. If clean, I push.

— CC
