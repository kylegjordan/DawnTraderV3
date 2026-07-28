# B-ARM-REMOVAL — Scope (Step 1)

**change-class: architecture**
**Owner:** CC-A · **Date:** 2026-07-28 · **Status:** DRAFT — Langston Q1/Q2 pre-approved the removal; this is the Step-1 artefact for his review
**Authority:** Kyle, 2026-07-28 — *"The ideal vs. rotational pool was a good idea in theory… but it doesn't sound like its been implemented in a way that is working effectively. If we can't improve upon it, we can do away with it."* The improvement path was **tested and failed** (§2). Kyle then delegated: *"You guys see this one through to completion."*

---

## 1. WHAT IS BEING REMOVED

The **Adaptive Ratio Manager (ARM)** — `server/services/adaptive-ratio-manager.ts` — which dynamically splits scanner attention between the *ideal* and *rotational* pair pools, plus its now-dead SQL evidence readers.

**NOT being removed:** the ideal/rotational pools themselves, or `telemetry-aggregator`'s `poolAggregates`/`getPoolPerformanceComparison` (⚠️ Langston condition — **prove the caller set first; diagnostics may read them**).

---

## 2. WHY — THE IMPROVEMENT TEST WAS RUN, AND FAILED ON ARITHMETIC

> **Rev history is deliberately NOT narrated here.** Rev 1 asserted a 20-point noise-amplification mechanism and "pure win rate"; both were wrong and are corrected **in the body below, once each**. The error record lives in `RUNNING_ISSUES` and in the commit messages — **not stacked on top of the text the completion report, `DELETED_COMPONENTS_LOG` and the OBJ-6 governance docs get written from.** (Langston: a preamble that repeats the body is the same trap re-armed — the next rev edits one copy and they diverge.)

★★★ **THE DECIDING MEASUREMENT — THE RATIO IS NON-BINDING AT ANY VALUE, AND HAS BEEN FOR ALL OBSERVABLE HISTORY.** `adaptive-scan-manager.ts:211-214`: `targetIdealCount = ceil(300 * ratio)`, then `actualIdealCount = min(targetIdealCount, availableIdealCount)`. Measured on `/var/log/dawntrader/out.log` (control: 1,155 `[11.4B.2-R1]` lines present):
```
[11.4B.2-R1][AdaptiveScan] Target: Ideal=151, Available=16, Actual=16+284=300 (M64)
[11.4B.2-R1][AdaptiveScan] UNDERFLOW PROTECTION: Ideal deficit=135, rotational expanded to 284
[11.4B.2-R1][AdaptiveScan] Cycle composed of 16 ideal + 284 rotational pairs (4%/78%) [UNDERFLOW]
```
**`Available` over the last 200 cycles: 0 (52x), 1 (36x), 15 (22x), 13 (16x), 9 (14x), 2 (12x), 16 (12x), 14 (12x) — NEVER above 16, against a target of 151.** Today: 232 cycles, **avg 5.6**. Pre-A2 archive (`out.log.pre-rotation-archive-2026-07-13.gz`, control: 4,265 lines): **n=853, avg 31.1, MAX EVER 60** — still far below 151, and its tail (0–8) already resembles today's.
⇒ **THE CLAMP BINDS ON EVERY CYCLE, ON BOTH SIDES OF #558 A2.** At ratio 0.50 the target is 151; at 0.70 it is 211; `actual` is `Available` (≤16) either way. **⇒ THE DELETION IS BEHAVIOUR-NEUTRAL, ASSERTED WITH EVIDENCE RATHER THAN HOPE — and §6's separate "is 0.7 the right split" item is MOOT: the knob has been non-binding at ANY value.** That is the headline, not a footnote.
⇒ **A2 DID NOT CAUSE THE STARVATION** — the pre-A2 tail already shows 0–8. My hypothesis that #558 zeroing `finalScore` starved `getTopPairs` is **NOT SUPPORTED** by this evidence and is withdrawn.
★ **THE REAL FINDING, WHICH IS BIGGER THAN THE ARM: the ideal pool is chronically empty — ~4–5% of scan slots against a nominal 50–70%, with `UNDERFLOW PROTECTION` firing every cycle. That fully explains the previously-untested "ideal produces 1.4% of closes at 70% attention" observation: it never had 70% attention. It had 4%.** Filed separately — it is not this batch's to fix.

★ **The ARM is not inert — but the case against it is the design, not amplification.** Measured on staging `/var/log/dawntrader/out.log` (control: 2,334 scanner lines present in the file), **2026-07-28 01:46:37 UTC**:

```
[11.2R1][RatioManager] Using in-memory pool data: ideal=8412 samples, rotational=19826 samples
[11.2R1][RatioManager] Computed ratio | regime=RANGE_BOUND_STABLE | ideal=0.50 | rotational=0.50
                       | Performance-based: ideal=0.309, rotational=0.307, confidence=1.00
```
199 of the last 200 decisions computed `ideal=0.50`; one computed `0.60`.

⇒ **The computed ratio is 0.50, arrived at because `:151` is a share-of-score normaliser whose resting point IS 0.50 when the pools are near-tied (0.309/0.616 = 0.5016). The 0.002 separation contributed ~0.16 percentage points.** The distance from `defaultRatio` is not a measure of anything the scores did — **`defaultRatio` has no representation in the target function at all.** ⚠️ **AND IT DOES NOT REACH ALLOCATION ANYWAY: the clamp binds every cycle (§2's measurement), so this number changes nothing downstream.**

**★ TAXONOMY FIRST, BECAUSE IT GOVERNS HOW THE REST READS: bucket 2/3 — THERE IS NO DEFECT. The design does not survive its own inputs.** (Framed as a bug, the correct counter is *"then fix `computeConfidence`"* and we relitigate.) **What follows is a list of inputs the design assumed and does not have:**
1. **The score's quality term is fed a retired input.** `computePoolScore:215` = `winRate*0.6 + avgEdge*0.4`; `avgEdge` ← `aggregate.avgFinalScore` (`:206`) ← `updatePoolAggregate(pool, data.finalScore, …)`, and both VTS call sites now pass `finalScore: trade.finalScore ?? 0` (#558 A2). ⚠️ **"It is therefore PURE WIN RATE" is an INFERENCE, NOT A MEASUREMENT — `avgEdge`'s live value was never read** (the two live scores summing to 0.616 rather than 1 is consistent with a blend). Do not state it as measured. **Win rate contradicts §0** (*"the edge is selection, not frequency"*) and is the most manipulable performance statistic (Goetzmann/Ingersoll/Spiegel/Welch, RFS 20(5) 2007; Lo, FAJ 57(6) 2001).
2. **The confidence damper is a no-op at operating scale.** `computeConfidence = min(1, totalSamples/100)`; live total is 28,238 ⇒ pinned at 1.00. The one restraint provides none.
3. **The SQL evidence path has NEVER had data — ★ AND IT HAS *TWO INDEPENDENT* CAUSES, NOT ONE (Langston CORRECTION-3; rev 1 gave half a cause and attributed it to him).** `telemetry_history` = **0 rows** — ★ *controlled*: same `DATABASE_URL` from the app's own `.env`, `db=postgres`, `schema=public`, and on that **same connection** `vts_open_trades` reads 39,258 and `rtb_shadow_pool_members` reads 112,582; only one `telemetry_history` exists, in one schema. **Cause (Langston-discriminated): the writer WAS built and IS wired** — `telemetry-aggregator.ts:295` → `persistTelemetryAsync` → `saveTelemetryRecord` → `db.insert(telemetryHistory)` carrying `pool`/`regime`/`mode`/`successRate` — but it is fenced by `shouldPersist()` (`telemetry-repository.ts:129-136`): `return (mode === 'live') || force`. **We have never been in live mode.** So the design premise — *learn during VTS, apply at launch* — never had a data path at all.
   ⚠️ **BUT `shouldPersist()` EXPLAINS ONLY THE POOL/REGIME ROWS — IT DOES NOT EXPLAIN A ZERO-ROW TABLE.** There is a **second, UNFENCED writer**: `persistCostSnapshot` (`cost-telemetry.ts:75`) → `db.insert(telemetryHistory)` at `:97`, with **no `shouldPersist` call anywhere in that file**. Its cause is different again: **`startCostTelemetryLoop` (`:223`) has ZERO CALLERS in the tree — the loop is never started.** ⇒ **Two independent causes for one empty table.** (Rule 24.a applies here exactly as this scope's sibling raised it for the same table.)
4. **`MIN_SAMPLES: 3` is dead config** — `telemetry-aggregator.ts:141` assigns `this.minSamples`; nothing in the tree reads it (Langston-verified).
5. **Membership is decided without any outcome data.** `getCompositeScore` (`:947-965`) = `latest.finalScore*0.4 + latest.hybridScore*0.3 + latest.regimeWeight*0.2 + latest.predictiveConfidence*0.1` — **all four terms are pre-trade estimates**, computed from **`entries[entries.length-1]`, a SINGLE observation**. "Best performing" never measures performance.

### 2a. ★ THE REPAIR PATH WAS COSTED AND REJECTED — RECORD IT, DO NOT RE-PROPOSE IT BLIND
CC-A proposed re-sourcing "best performing" from realised outcomes in `logs/virtual_trades` (118 files, 33.9 MB, 14,542 records, 0 parse failures). **Langston independently re-derived the corpus and it fails on distribution:** 957 symbols, **mean 15.2 trades/symbol, median 9**; **13 symbols ≥ 100; ZERO ≥ 393**; the busiest symbol in four months is `ALGO/USD` at **130** records.
⇒ **At n̄=15, a shrinkage estimator with any defensible prior returns the pooled mean for almost the entire universe.** It would ship **near-zero discrimination wearing a far more respectable justification than the thing it replaced** — *the same failure diagnosed in `getCompositeScore`, rebuilt one layer up.* **Shrinkage does not manufacture evidence; it correctly reports that we do not have it.**
★ **Langston's decisive purpose-test argument, which stands independently of all the above:** this knob allocates **scan attention**, while the binding constraint is the net-EV/fee **qualification** drought (#570). **The funnel is dry at the qualification stage, not the looking stage — tuning attention upstream of a dry gate buys nothing.** CC-A's *"ideal produces 1.4% of closes at 70% attention"* is the same finding from the other end.

---

## 3. NUMBERED OBJECTIVES

**OBJ-1 — Delete `adaptive-ratio-manager.ts`** (rule 18 / §15 delete-on-the-spot; archive to `_archive/deleted-code/*.removed`, record in `DELETED_COMPONENTS_LOG.md`).

**OBJ-2 — ★ REV 3 (Langston BLOCKER-2): FLIP TO THE EXISTING CONFIG PATH AT `0.60`, **NOT** `0.7`.**
  ⚠️ **REV 1/2 GOT THE BASELINE WRONG, AND WRONG IN THE LINGERING-LEGACY DIRECTION.** `0.7` is **not** a config default — it is `DEFAULT_CONFIG.defaultRatio` at **`adaptive-ratio-manager.ts:57`, a PRIVATE CONSTANT OF THE FILE BEING DELETED.** The config SSOT is **`SCANNER_PARAMS.DUAL_POOL.IDEAL_RATIO = 0.6` / `ROTATIONAL_RATIO = 0.4` (`system-guards.ts:160-163`)**, and `adaptive-scan-manager.ts` **already has a live `else`-branch that uses it** when `useAdaptiveRatio` is false.
  ⇒ **THREE candidate landings, and rev 1 collapsed two of them: `0.50` (today's computed) · `0.60` (the existing config path) · `0.70` (ARM-internal).** ★ **Adopting `0.7` because the dying file said so is exactly the lingering-legacy shape §15 exists to prevent (Langston).** ⇒ **Take `0.60` by flipping to the existing config path**; let OBJ-6/§13 set the right number against evidence. **If `0.7` is ever wanted it is a deliberate raise ABOVE the SSOT, justified on its own, and written INTO `system-guards.ts` — never a literal inherited from an archived file.**
  ★ **This makes the cut SMALLER: delete the adaptive branch and keep the existing `:203-205` fixed-ratio path, rather than writing a new one.**

**OBJ-3 — Delete the SQL evidence readers that die with it:** `getPoolComparison` + `getPerformanceByPool` (`telemetry-repository.ts:371-429`). **Same batch or they are lingering legacy** (Langston condition).

**★ OBJ-3b (BLOCKER-4) — `getPoolPerformanceComparison` IS DISPOSITIONED NOW: DELETE IT WITH THE ARM.** Langston's whole-tree census at head: **its only production caller is `adaptive-ratio-manager.ts:104`**; everything else is `adaptive_scanning.test.ts:170/201/206`, `b79-0n-telemetry-isolation.test.ts:51/68`, and docs — **no diagnostic route, no API reader.** ⇒ OBJ-4's *"prove the caller set first"* is now **discharged**, and the answer is that it reaches **zero production callers** the moment the ARM dies, making it textbook §15 lingering legacy. **It goes in this batch.** ⚠️ The `poolAggregates`/`updatePoolAggregate` limb behind it is **NOT** covered by that census — **its read-set census is a Step-2 DELIVERABLE, not an assumption**, and it stays untouched until run.

**★ OBJ-3c — FIX THE DANGLING CITATION IN THE SAME GOVERNANCE PASS:** `RUNNING_ISSUES` **#582 cites `adaptive-ratio-manager.ts:204` as an `avgEdge` source** — that reference **dangles the moment the file is deleted**. Repoint or annotate it as part of this batch's governance, not later.

**OBJ-4 — Blast-radius census BEFORE cutting, not after** (Langston condition; **discharged for `getPoolPerformanceComparison` — see OBJ-3b — and still OPEN for the `poolAggregates` limb**). Known production consumers: `adaptive-scan-manager.ts:23,199,348,384`. Tests: `b79-0a-arm-injection.test.ts`, `adaptive_scanning.test.ts:164-165`. ⚠️ **Do NOT reflexively delete `poolAggregates`/`getPoolPerformanceComparison` — prove the caller set first.** Also closes the stale optional-`telemetry?`-arg item in RUNNING_ISSUES.

**OBJ-5 — Record the future path, do not bury the idea.** `DELETED_COMPONENTS_LOG` states: the concept (*scan better performers more often*) is **sound**; the implementation could not measure performance and had no evidence path. The principled version, **if a real per-pool evidence base ever exists**, is **discounted Thompson Sampling on net log-growth** with a window far wider than 24h-per-regime.

**OBJ-6 — OUT OF SCOPE, filed separately (§13):** whether `0.7` is the *correct* split given ideal produces ~1.4% of closes at 70% attention. **A behaviour decision must not ride inside a deletion** (Langston).

---

## 4. VERIFICATION

1. Untruncated `tsc` on edited files + `check-tsc-baseline` PASS.
2. Named tests green; the ARM-injection test removed/adjusted deliberately, not deleted silently.
3. All 4 CI jobs green on head (rule 19).
4. ★ **REV 5 (Langston BLOCKER-5) — the old criterion was UNSATISFIABLE and cited an abandoned ratio.** It read *"the scan composition holds at 70/30"*: wrong number (OBJ-2 lands on **0.60**) and **impossible by this scope's own clamp measurement** — `actualIdealCount = min(ceil(300*0.60) = 180, Available ≤ 16)` (`adaptive-scan-manager.ts:212-217`), so composition will be roughly **5%/95% with `UNDERFLOW PROTECTION` firing**, exactly as it does today. As written, Step 7 would either fail or be quietly reinterpreted — **the failure mode of a criterion nobody can meet is that it gets re-read until it passes.**
   **THE CORRECT CRITERION:** (a) `targetIdealCount` reads **180** in the `[11.4B.2-R1]` line; (b) `Available`/`Actual` are **statistically unchanged from the pre-cut baseline** (that is the neutrality claim, and it is the thing actually being verified); (c) `[11.2R1][RatioManager]` lines **cease entirely**. All three read from `/var/log/dawntrader/out.log` **with the file-contains-scanner-lines control** — an empty grep proved nothing three separate times during this batch's investigation.
5. §9.3 staging UI check of any scanner/pool surface.
6. **Architecture-class governance (§17): CONTENT updates to `SYSTEM_MANUAL.md:2701,3172,3226`, `SYSTEM_IMPACT_MAP.md:425,433,2202`, `sections/PHASE3_MARKET_SCANNING_AND_PAIR_MANAGEMENT.md:395,866,919`** — not a TOC pass.

---

## 5. RISK

**★ NO SCAN-ALLOCATION CHANGE — PROVEN, NOT ASSUMED (see §2's clamp measurement): `Available` never exceeds 16 against a target of 151, so 0.50, 0.60 and 0.70 all resolve to the same `actual`.** Rev 1's *"shifts 50→70"* risk line was wrong twice over — wrong baseline (§OBJ-2) and wrong premise (the clamp binds every cycle). **The pools and their membership logic are untouched by this batch** — membership remains outcome-blind (§2 item 5), which is a *known, recorded* defect this batch does **not** fix and must not be described as fixing.


---

## 6. DEPLOY VERIFICATION — 2026-07-28 (staging, pm2 restart #536 @ 02:49:54Z)

**CI:** all four GREEN on `156470b94`. **Deploy:** pull → `db:migrate` (none) → build → restart. HTTP 200, process online, **zero** errors matching `adaptiveRatioManager` / `getPoolPerformanceComparison` / `is not a function` / `Cannot find module`.

- ★ **(a) PASS — `targetIdealCount` reads 180.** `02:50:28: Target: Ideal=180, Available=0, Actual=0+300=300`, on every 30s tick through 02:53:28. Exactly `ceil(300 × 0.60)` ⇒ the landing took the **config SSOT**, not the deleted file's private `0.7`. Pre-restart the same line read `Ideal=151` (the old 0.503 computed ratio). **Independently re-verified by Langston at staging, not ruled on report.**
- ★ **(c) PASS — `[11.2R1][RatioManager]` CEASED.** Last line `02:49:40`, i.e. **before** the 02:49:54 restart; none after. Verified by TIMESTAMP, not by an absent grep hit. **Independently re-verified by Langston.**
- **Batch composition unaffected:** `0+300=300` is underflow protection doing exactly what it did at `16+284=300`.

### ⚠️ (b) — MY MODEL OF THE BASELINE WAS WRONG (Langston, off the rotated logs)
I planned to judge (b) by waiting for "warm-vs-warm". **There is no warm steady state to converge on.** `Available` is a **MONOTONIC RAMP with no observed ceiling in the retained window**:
- restart 00:10:00 → `Available=1` @00:42 (32 min) → `16` @01:50 (100 min) → still 16 @02:23 (when I snapshotted the "baseline");
- an earlier uninterrupted run: 13:10 `4` → 14:13 `16` → 16:19 `33` → **18:12 `39`**, reset 18:40.
⇒ **My pre-deploy "avg 16.00" was simply where a 100-minute-old process happened to be — a point on a ramp, not a level.** Post-restart `Available=0` is the ramp restarting, not a regression.
★ **THE COMPARATOR FOR (b) IS THE RAMP, NOT THE LEVEL — matched on uptime AND clock-time.** Falsifiable test (off the 00:10 restart, nearest in clock time and same overnight liquidity): **`Available > 0` by ~03:22Z and `≈16` by ~04:30Z ⇒ PASS. Still 0 at 04:00Z ⇒ real signal, investigate.** ⚠️ **Do NOT use the 13:10 ramp as comparator** — it reached 16 in ~63 min because that is the xStock session and the pool fills faster.

### ★★ LESSON (generalises well past this batch)
**A COUNTER THAT ONLY GOES UP IS A CLOCK, NOT A GAUGE.** Two instances in this one verification: (1) my first check counted `[11.2R1]` lines across an **append-only log** and got 104 vs a baseline 98 — reading as *"the component is still running"* when those were all pre-restart lines, and only the timestamp answered it; (2) `Available` itself, which I treated as a level to compare when it is an accumulation whose value encodes **uptime**. **Before comparing any two readings, ask whether the number can go down. If it cannot, you are comparing clocks.**
