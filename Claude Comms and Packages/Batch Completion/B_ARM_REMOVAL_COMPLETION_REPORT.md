# B-ARM-REMOVAL — Completion Report

**Owner:** CC-A · **Date:** 2026-07-28 · **change-class:** architecture
**Scope:** `Claude Comms and Packages/Scope Files/B_ARM_REMOVAL_SCOPE.md`
**Status:** ⏳ **NOT CLOSED — one verification criterion is still settling on a scheduled check (§3b). Everything else is complete and verified.**

> ⚠️ **This report does NOT claim the batch is closed.** Criterion (b) has a falsifiable check at ~04:30Z. Closing before it lands would be asserting a result we have not observed.

---

## 1. WHAT WAS DONE

Deleted the **AdaptiveRatioManager** — the component that dynamically split scanner attention between the ideal and rotational pair pools — together with its two SQL evidence readers and the telemetry pool-aggregate limb that fed it. The scanner now uses the **fixed config-SSOT split** (`SCANNER_PARAMS.DUAL_POOL.IDEAL_RATIO = 0.6`) that already existed as its non-adaptive path.

**Kyle's authorisation:** *"If we can't improve upon it, we can do away with it."* **The improvement path was tested and failed on arithmetic — the condition was met and measured, not assumed.**

---

## 2. OBJECTIVES

| # | Objective | Result | Evidence |
|---|---|---|---|
| OBJ-1 | Delete `adaptive-ratio-manager.ts` | **YES** | Commit `e3a22c15a`; archived as a **100%-similarity rename** so `git log --follow` traverses its history |
| OBJ-2 | Replace with fixed split at the **config SSOT 0.60** | **YES** | `Target: Ideal=180` = `ceil(300×0.60)` live at 02:50:28Z. ⚠️ Rev 1 said `0.7` — that was the **deleted file's private constant**; Langston BLOCKER-2 |
| OBJ-3 | Delete `getPoolComparison` + `getPerformanceByPool` | **YES** | `telemetry-repository.ts`; zero production references remain |
| OBJ-3b | Disposition `getPoolPerformanceComparison` | **YES** | Deleted with the ARM; sole production caller was `adaptive-ratio-manager.ts:104` |
| OBJ-3c | Fix the dangling #582 citation | **YES** | Annotated, not deleted — the claim it supported is now *stronger* |
| OBJ-4 | Blast-radius census **before** cutting | **YES** | Census ran first; found `ratioUsed` had **no production reader**. Langston re-derived independently |
| OBJ-5 | Record the future path, don't bury the idea | **YES** | `DELETED_COMPONENTS_LOG.md` + `SYSTEM_MANUAL.md` §6 |
| OBJ-6 | Keep the "is 0.7 right" question out of the deletion | **YES → MOOT** | The clamp measurement made it moot: the knob was non-binding at **any** value |

---

## 3. VERIFICATION

**CI:** all four GREEN on `156470b94` (Test Suite · Build · TypeScript Check baseline gate · Docker Build).
**Types:** tsc total **394 = unchanged baseline**, measured by stash/count/pop, with **zero** errors referencing any deleted symbol.
**Tests:** seven affected suites green, **55 tests** (one fewer by design — see §5).
**Deploy:** pm2 restart **#536** @ 02:49:54Z. HTTP 200, online, **zero** errors matching the deleted symbols.

- ★ **(a) PASS — target reads 180.** Every 30s tick 02:50:28→02:53:28. Pre-restart it read 151. **Langston re-verified at staging himself.**
- ★ **(c) PASS — the component is silent.** Last `[11.2R1][RatioManager]` line 02:49:40 — *before* the 02:49:54 restart; none after. Verified by **timestamp**, not by an absent grep hit. **Langston re-verified.**
- ⏳ **(b) OPEN — scheduled check.** `Available > 0` by ~03:22Z and ≈16 by ~04:30Z ⇒ PASS; **still 0 at 04:00Z ⇒ real signal, investigate.**

---

## 4. GOVERNANCE FILES CHANGED

`DELETED_COMPONENTS_LOG.md` (full removal record) · `SYSTEM_MANUAL.md` (§6 rewritten ACTIVE→REMOVED; component inventory; **RISK-023 superseded**) · `SYSTEM_IMPACT_MAP.md` (§3.5 removal record; **§3.6 mis-attribution corrected**; component entry) · `sections/PHASE3_MARKET_SCANNING_AND_PAIR_MANAGEMENT.md` · `RUNNING_ISSUES.md` (#582 citation; #594–#597 filed) · scope + this report.

---

## 5. WHAT THIS BATCH DID **NOT** DO (stated so a later reader is not misled)

- ⚠️ **Pool membership is still outcome-blind — open defect #597.** `getCompositeScore` ranks pairs on four **pre-trade estimates**, off a **single** most-recent observation, with the 3-sample minimum explicitly removed. **"Best performing" does not measure performance.** The pools survive; only the split between them was removed.
- ⚠️ **The ideal pool is chronically empty** (~4–5% of slots against a nominal 70%) — **#597**, cause deliberately **not** claimed.
- **Deleted a test rather than keep false coverage:** the M67 fence was re-pointed to a method that **hardcodes the asserted value**, so it could not fail for any input. Deleted as a unit, with the surviving coverage named (Langston BLOCKING B1).

---

## 6. WHAT WENT WRONG, AND THE LESSONS (recorded because the batch's value is mostly here)

1. ★ **WRONG POPULATION, FOUR TIMES.** Calibration feeds (VTS, not active-path — Kyle caught it); "no underflow" from log windows containing **zero scanner lines** (my own control caught it); 30-day DB rows for a gate reading a **process-lifetime** counter (Langston); per-symbol means from the DB when outcomes live in files — reported 41.7, truth **15.2**. ⇒ **Ask which population the code actually reads, and cite the read site, BEFORE measuring.**
2. ★ **A COUNTER THAT ONLY GOES UP IS A CLOCK, NOT A GAUGE.** Two instances in one verification: a cumulative count against an **append-only** log read as "still running"; and `Available` itself — a **ramp** whose value encodes uptime, which I mistook for a level. **Before comparing two readings, ask whether the number can go down.**
3. ★ **GREEN FOR THE WRONG REASON, TWICE.** A tsc error count that "improved" 394→3 because the compiler **bailed on a parse error**; and a re-pointed fence asserting a compile-time literal against itself. **An improvement in a health number can mean the instrument stopped working.**
4. ★ **A CORRECTION STACKED ON TOP OF WRONG TEXT IS NOT A CORRECTION.** I fixed §2's contradictions in a preamble and left the body asserting them, then repeated the identical error in the sibling scope. **Edit the body; the error record belongs in the issue tracker and commit messages** — completion reports get written *from* the body.
5. ★ **I INHERITED A DYING FILE'S CONSTANT.** Took `0.7` from `DEFAULT_CONFIG` **inside the component being deleted** — the exact inherited-claim failure I had filed as #593's root cause hours earlier.
6. ★ **TWO LIVE SCOPES IN CONTRADICTION.** Four objectives editing a file another of my own scopes deleted, and I told CC-B it "blocks nobody". **Not a measurement error — losing track of my own in-flight work, which no verification discipline catches.**
7. **An absence control that would pass even if the search were broken is worthless** — mine counted matches *inside* the target file, proving the pattern and not the traversal.
8. **A risk-register entry is a hypothesis until someone measures it** — RISK-023 predicted a graceful degradation that had already become total, unnoticed for the component's whole life.

---

## 7. FOLLOW-UPS FILED

**#594** six of nineteen strategies have never traded · **#595** retired-key reads (**done**, `1a2314447`) · **#596** outcome-corpus representativeness (**blocks** any outcome-sourced ranking) · **#597** ideal-pool starvation + outcome-blind membership.
