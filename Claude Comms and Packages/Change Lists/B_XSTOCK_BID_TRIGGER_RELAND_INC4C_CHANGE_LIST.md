# B-XSTOCK-BID-TRIGGER-RELAND increment (4c) — change list for the Step-4 diff review

**Header (Step-4 dispatch fields):**
- **(i) Declared change-class:** `architecture` (row 2's class; this increment changes when a VTS xStock page fires).
- **(ii) Doc set for that class:** scope — row 2's (`Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_*`), present; pre-audit — `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4C_PRE_AUDIT.md` r3, present; completion report — the batch PROGRESS report (`Batch Completion/B_XSTOCK_BID_TRIGGER_RELAND_PROGRESS_REPORT.md`), present, (4c) section owed at Step 7; `BATCH_CATALOG` / `PHASE_HISTORY` / System Manual / System Impact Map — owed at Step 10.
- **(iii) Step 2:** the pre-audit above, Langston PROCEED at `5117c73d6`.

**Ref:** `564ae590c1a6c81a86ea7fa88b1377b0cc93d7fe` (one commit; line numbers below are at it). **CI `41982942276` at that sha, 4/4:** Test Suite, TypeScript Check (baseline gate), Build, Docker Build — all `success`.

| file | change |
|---|---|
| `server/asset_classes/xstock_spot/market-hours.ts` | NEW `XSTOCK_PAGE_OPEN_SETTLE_MS` (`:96`) and `isXstockRailPagingTime(now)` (`:105`), beside `isInXstockWeekendClose`; the module has no imports and uses its own `getETParts` |
| `server/services/vts-runner.ts` | `_ntXsOffHours` (`:4036`) reads `!isXstockRailPagingTime(new Date())`; the `getXstockSession` import (its only use) removed. The unpriced-close label (`:4263`) is UNCHANGED, still `d.isRegularSession(now)` |
| `server/services/vts-rail-reporting.ts` | dep `isRailPagingTime` (`:55`, production `:450`); member clock reads it (`:282`); escalation body (`:299`) says the clock starts 09:45 ET at the open and the 421/423 norm was measured on a 09:30 clock; `joinsTooWide` / `joinsTooOldQuiet` (`:62`, `:220`) on the sweep line (`:341`); `EXPECTED_WIDE` imported |
| `server/services/active-execution-engine.ts` | `moonbag_timeout` line (`:4084`): `trigger=none mark=${currentPrice}${_xsTag}` |
| tests | NEW `b-xstock-bid-trigger-reland-inc4c.test.ts` (12); `…-inc4a.test.ts` +1 behaviour test and the stub's new dep; `b-price-side-8a-p3-crypto-finish.test.ts` fence re-pointed (same subject) |

## P1 — the predicate (`market-hours.ts:105`)
```ts
export function isXstockRailPagingTime(now: Date): boolean {
  if (isInXstockWeekendClose(now)) return false;
  const { hour, minute } = getETParts(now);
  const m = (hour === 24 ? 0 : hour) * 60 + minute;
  const openPlusSettle = 9 * 60 + 30 + XSTOCK_PAGE_OPEN_SETTLE_MS / 60_000;
  return m >= openPlusSettle && m < 16 * 60;
}
```
The test checks it against "`getXstockSession(t) === 'regular'` and at least 09:45 ET" at every minute of a weekday (1,440 points), and at the four boundaries in both DST regimes.

## P1 — the two consumers and the one that stays
- **Runner gate (`vts-runner.ts:4036`):** BEFORE `trade.assetClass === 'xstock_spot' && (isInXstockWeekendClose(new Date()) || getXstockSession(Date.now()) !== 'regular')` · AFTER `trade.assetClass === 'xstock_spot' && !isXstockRailPagingTime(new Date())`. It feeds `_ntPages`, which gates both the crossing (`stepNoTriggerStreak`) and the doorbell (`onMemberReason`).
- **Member clock (`vts-rail-reporting.ts:282`):** BEFORE `const regular = deps.isRegularSession(nowMs);` · AFTER `const regular = deps.isRailPagingTime(nowMs);`
- **Unpriced-close label (`vts-runner.ts:4263`):** unchanged — `session: d.isRegularSession(now) ? 'regular' : 'off_session'`.

## Tests and mutation checks
- **Behaviour (inc4a file):** a member joined Wed; Thu 09:35 ET with the label `regular` but not paging time ⇒ the clock stays null; 09:45 ⇒ the clock starts; 10:05 ⇒ no escalation (a 09:30 clock would have escalated); 10:15 ⇒ one escalation on its own key. **Mutation:** the member clock put back on `isRegularSession` fails this test.
- **Predicate:** the settle removed (`openPlusSettle = 9*60+30`) fails 4 of the 12 (4c) tests.
- **Call-site fences (Langston r3 record item 2), on the callers, not a file grep:** the gate reads `isXstockRailPagingTime`; the member clock reads `isRailPagingTime` and not `isRegularSession`; the label still reads `isRegularSession`; the production deps define both.
- **Join split:** two too_wide, one too_old on a quiet verdict, one `no_usable_mark` ⇒ joins 3 = 2 + 1, the paging reason in neither.
- **Unit suite (run before the fence re-point):** 4,510 tests, 4,478 pass, 3 fail, the rest skipped. The 3: 1 was the 8a-P3 fence pinning the old gate text (re-pointed, now 24/24), and 2 are `b-root-duplicate-scanner-retire.test.ts`, which walks a git-excluded agent worktree under `.claude/worktrees/` present only on this laptop. No `tsc` errors in the changed lines (the tsc output's errors are at baseline lines elsewhere in the same two files).

## Judgement calls to attack
1. `isXstockRailPagingTime` computes the regular-session bounds itself rather than calling `getXstockSession` (the module is import-free by design; the 1,440-point test pins them equal). Is that duplication acceptable, or should `market-hours.ts` gain a lazy import?
2. The doorbell (`onMemberReason`) waits until 09:45 too, because it shares `_ntPages`. The plan's §4 named this risk; is a single gate right, or should the doorbell keep 09:30?
3. The escalation body now says the 421/423 norm was measured on a 09:30 clock — enough, or should the norm be re-measured before it is cited?
