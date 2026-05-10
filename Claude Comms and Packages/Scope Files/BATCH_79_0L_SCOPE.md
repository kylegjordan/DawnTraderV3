# BATCH 79.0L — xStock market-hours correction (Fri 8PM ET → Sun 8PM ET closed window)

> **Status:** AWAITING LANGSTON STEP 1+2 COMBINED REVIEW (small surface; well-bounded correction)
> **Author:** Claude Code
> **Created:** 2026-05-10
> **Resolves:** RUNNING_ISSUES #89 (transitions to RESOLVED — was misframed as a feed bug; actually intentional market closure)

---

## 1. Why this batch

Kyle clarification 2026-05-10: **xStocks are closed from Friday 8PM ET → Sunday 8PM ET** (48-hour weekend window). This applies to ALL xStocks, including the previously-marked Phase-1 "24/7" set. The current codebase has the schedule wrong:

1. **`server/asset_classes/xstock_spot/market-hours.ts`** treats `XSTOCK_SPOT_24_7_SYMBOLS` as always-open (`return true` if symbol is in the set, regardless of weekday/hour). This is wrong — those names ARE closed during the Fri-Sun weekend window.
2. **The non-24/7 schedule uses 22:00 UTC** for the close/reopen boundary. 22:00 UTC = 5PM ET (winter EST) / 6PM ET (summer EDT) — neither matches Kyle's spec of 8PM ET.
3. **The "24/7" naming + UI badges** are misleading — the names trade extended hours (Sun 8PM ET → Fri 8PM ET continuous, ~120 hours/week) but ARE closed for 48 hours.
4. **B79.0c WS probe finding misinterpreted as a feed bug.** Empirical observation Saturday 22:30 UTC was correct (zero ticker/OHLC), but the silence was the market correctly being closed, not a Kraken feed issue. RUNNING_ISSUES #89 transitions to RESOLVED-NOT-A-BUG via this batch.

---

## 2. Numbered objectives

1. **`server/asset_classes/xstock_spot/market-hours.ts`** — replace UTC-day/hour schedule logic with DST-aware ET-based check using `Intl.DateTimeFormat` + `timeZone: 'America/New_York'`. New rule:
   - **All xStocks:** closed Friday 20:00 ET → Sunday 20:00 ET (48 hours)
   - **Outside the closed window:**
     - Phase-1 extended-hours names (current `XSTOCK_SPOT_24_7_SYMBOLS`): always OPEN
     - All other xStocks: ARCA-aligned schedule (Mon-Fri 9:30 AM - 8:00 PM ET extended hours, with overnight gap... actually keep the existing UTC math for now since it approximates ARCA-aligned schedule and Kyle's correction is specifically about the Fri-Sun closed window)

2. **`shared/asset-classes.ts` line 280** — JSDoc on `XSTOCK_SPOT_24_7_SYMBOLS`: keep the constant name (used in many call sites; rename later if desired) but REWRITE the comment to clearly state: "These names trade extended hours (Sun 8PM ET → Fri 8PM ET continuous), NOT 24/7. Like all xStocks, they are closed during the Fri 8PM ET → Sun 8PM ET weekend window. The set name is preserved from B79.0c for stability; the predicate `isXstockMarketOpenUTC()` correctly applies the 48-hour weekend close."

3. **`server/strategies/orb.ts` line 154-159** — comment update: the 24/7-name early-return inside detect() is still correct (no opening-bell semantics for these names) but the comment "24/7 names trade through weekend" needs correcting to "extended-hours names trade Sun 8PM ET → Fri 8PM ET — they have no daily opening bell within the open window, so ORB doesn't apply."

4. **`client/src/components/machine-learning/xstocks-tab.tsx`** —
   - Line 155: `"24/7 only"` → `"Ext hours only"`
   - Line 210: `"24/7" = Kraken Phase-1 names trade through weekend.` → `"Ext" = Kraken Phase-1 extended-hours names (Sun 8PM ET → Fri 8PM ET continuous; closed weekends).`
   - Line 229: `<Badge>24/7</Badge>` → `<Badge>Ext</Badge>` with tooltip via `title` attribute

5. **`server/tests/unit/b79-0b-market-hours.test.ts`** — existing tests use ARCA_SYM (a non-extended-hours symbol) with the old UTC-day/hour math. After §1 changes, those tests still apply if we preserve the ARCA schedule for non-extended-hours names. **Add new test cases for the extended-hours symbols** with the Fri-Sun closed window:
   - Sat 12:00 UTC, AAPL/USD → false (Saturday during closed window)
   - Sun 19:00 ET → false (Sunday before reopen)
   - Sun 20:01 ET → true (Sunday after reopen)
   - Wed 14:30 UTC, AAPL/USD → true (mid-week, extended hours, open)
   - Fri 19:59 ET, AAPL/USD → true (Friday before close)
   - Fri 20:01 ET, AAPL/USD → false (Friday after close)
   - DST boundary tests (March/November transitions if scheduled in test fixture window)

6. **Governance:**
   - RUNNING_ISSUES #89 → RESOLVED-NOT-A-BUG with explanation
   - `BATCH_79_0c_COMPLETION_REPORT.md` post-closure addenda noting the "24/7" framing was wrong
   - `BATCH_79_0i_b_COMPLETION_REPORT.md` post-closure addenda noting the UI badge correction landed
   - `BATCH_79_0k_COMPLETION_REPORT.md` post-closure addenda noting the investigation finding was misframed
   - `CHANGES_AND_FIXES.md` INFRA-2026-05-10-C entry
   - `BATCH_CATALOG.md` row for B79.0L
   - `PHASE_HISTORY.md` sub-batch row
   - `MEMORY.md` (CC + Langston) — drop next-step pointer, add closure row

---

## 3. Non-objectives + invariants

- **No rename of `XSTOCK_SPOT_24_7_SYMBOLS` constant.** Stable across many call sites; renaming to `XSTOCK_SPOT_EXTENDED_HOURS_SYMBOLS` is cosmetic-only and adds churn risk. JSDoc rewrite captures the corrected semantics. Future batch can rename if Kyle wants.
- **No change to ARCA-aligned schedule for non-extended-hours names.** The current 22:00 UTC math approximates ARCA hours; Kyle's correction was specifically about the Fri-Sun close window for the extended-hours names. Conservative scope.
- **Crypto regression: NONE by-construction.** All changes scoped to xstock_spot.
- **No-touch fence on crypto_spot through 2026-05-15 preserved.**

---

## 4. Verification (Step 7)

| Gate | Check | Expected |
|---|---|---|
| G1 | CI Build + Docker green | Yes (TS+Test legacy-red baseline tolerated) |
| G2 | Tests pass: B79.0b legacy + new B79.0L tests covering Fri 8PM ET → Sun 8PM ET window | All pass |
| G3 | PM2 logs post-deploy | No errors; xstockSpotScanner correctly skips ALL names during Sat 21:00 UTC = Sat 17:00 ET (still in closed window per current time) |
| G4 | xStocks tab UI rendering | Badge label "Ext" instead of "24/7"; freshness panel still renders all symbols |
| G5 | Crypto no-touch fence | regime_factor_alternates cadence holds |

---

## 5. Implementation plan (Step 3)

Single commit:
1. Edit `market-hours.ts` — DST-aware ET check via `Intl.DateTimeFormat`
2. Edit `shared/asset-classes.ts` — JSDoc rewrite
3. Edit `orb.ts` line 154-159 — comment update
4. Edit `xstocks-tab.tsx` — UI label corrections
5. Add new test file `b79-0L-market-hours-extended-hours.test.ts` covering the Fri-Sun closed window for extended-hours symbols + DST boundary
6. Push, deploy, verify, governance close

---

## 6. Open questions for Langston

Q1. **Combined Step 1+2 OK?** Small scope (~50-80 LOC across 4 files + 1 new test file), well-bounded correction.

Q2. **Should I rename `XSTOCK_SPOT_24_7_SYMBOLS` to `XSTOCK_SPOT_EXTENDED_HOURS_SYMBOLS`?** I lean NO (cosmetic-only churn; JSDoc rewrite captures the corrected semantics). But the misleading name will outlive this batch unless renamed.

Q3. **Should I correct the ARCA-aligned schedule too?** Currently the non-extended-hours names use 22:00 UTC for close/reopen which is wrong by 3 hours. Could re-base to ARCA standard hours (9:30 AM - 8:00 PM ET extended) using same DST-aware ET check. **My lean: include this correction in the batch since we're already in market-hours.ts territory.** But it expands scope by ~10-20 LOC.

Q4. **DST handling approach.** I propose `Intl.DateTimeFormat` with `timeZone: 'America/New_York'`. Built-in, well-tested, handles DST transitions automatically. Alternative: hardcode UTC offsets with explicit DST transition dates (more brittle). My lean: `Intl.DateTimeFormat`.

Q5. **Test fixture for DST boundary** — the March 2026 DST transition has already passed; November 2026 is upcoming. Worth including a Nov 2026 fixture? My lean: yes, add 2 boundary cases (Sat in Nov around DST switch).

---

## 7. Sequencing

After B79.0L ships:
- RUNNING_ISSUES #89 closes as RESOLVED-NOT-A-BUG
- B79.0g-tx (#91) Step 2 pre-audit + implementation is the next batch (Langston Option B already approved with 5 revisions applied)
