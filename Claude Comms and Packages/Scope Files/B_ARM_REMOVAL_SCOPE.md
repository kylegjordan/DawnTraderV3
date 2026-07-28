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

★ **The ARM is NOT inert. It is actively steering, and that is the case against it.** Measured on staging `/var/log/dawntrader/out.log` (control: 2,334 scanner lines present in the file), **2026-07-28 01:46:37 UTC**:

```
[11.2R1][RatioManager] Using in-memory pool data: ideal=8412 samples, rotational=19826 samples
[11.2R1][RatioManager] Computed ratio | regime=RANGE_BOUND_STABLE | ideal=0.50 | rotational=0.50
                       | Performance-based: ideal=0.309, rotational=0.307, confidence=1.00
```
199 of the last 200 decisions computed `ideal=0.50`; one computed `0.60`.

⇒ **It has moved scan allocation from the 0.7 default to 0.50 — a 20-percentage-point reallocation — on a pool-score difference of 0.002 (0.309 vs 0.307), computed from PURE WIN RATE, with its confidence damper pinned at 1.00.** That is Michaud's *estimation-error maximizer* (FAJ 1989) observed in production with a timestamp.

**Every component of it is broken, dead, or wrong:**
1. **Score is pure win rate.** `computePoolScore` = `winRate*0.6 + avgEdge*0.4`; `avgEdge` ← `aggregate.avgFinalScore` ← `updatePoolAggregate(pool, data.finalScore, …)`, and both VTS call sites now pass `finalScore: trade.finalScore ?? 0` (#558 A2). The 0.4 term is a hard zero. **Win rate contradicts §0** (*"the edge is selection, not frequency"*) and is the most manipulable performance statistic (Goetzmann/Ingersoll/Spiegel/Welch, RFS 20(5) 2007; Lo, FAJ 57(6) 2001).
2. **The confidence damper is a no-op at operating scale.** `computeConfidence = min(1, totalSamples/100)`; live total is 28,238 ⇒ pinned at 1.00. The one restraint provides none.
3. **The SQL evidence path has NEVER had data.** `telemetry_history` = **0 rows** — ★ *controlled*: same `DATABASE_URL` from the app's own `.env`, `db=postgres`, `schema=public`, and on that **same connection** `vts_open_trades` reads 39,258 and `rtb_shadow_pool_members` reads 112,582; only one `telemetry_history` exists, in one schema. **Cause (Langston-discriminated): the writer WAS built and IS wired** — `telemetry-aggregator.ts:295` → `persistTelemetryAsync` → `saveTelemetryRecord` → `db.insert(telemetryHistory)` carrying `pool`/`regime`/`mode`/`successRate` — but it is fenced by `shouldPersist()` (`telemetry-repository.ts:129-136`): `return (mode === 'live') || force`. **We have never been in live mode.** So the design premise — *learn during VTS, apply at launch* — never had a data path at all.
4. **`MIN_SAMPLES: 3` is dead config** — `telemetry-aggregator.ts:141` assigns `this.minSamples`; nothing in the tree reads it (Langston-verified).
5. **Membership is decided without any outcome data.** `getCompositeScore` (`:947-965`) = `latest.finalScore*0.4 + latest.hybridScore*0.3 + latest.regimeWeight*0.2 + latest.predictiveConfidence*0.1` — **all four terms are pre-trade estimates**, computed from **`entries[entries.length-1]`, a SINGLE observation**. "Best performing" never measures performance.

### 2a. ★ THE REPAIR PATH WAS COSTED AND REJECTED — RECORD IT, DO NOT RE-PROPOSE IT BLIND
CC-A proposed re-sourcing "best performing" from realised outcomes in `logs/virtual_trades` (118 files, 33.9 MB, 14,542 records, 0 parse failures). **Langston independently re-derived the corpus and it fails on distribution:** 957 symbols, **mean 15.2 trades/symbol, median 9**; **13 symbols ≥ 100; ZERO ≥ 393**; the busiest symbol in four months is `ALGO/USD` at **130** records.
⇒ **At n̄=15, a shrinkage estimator with any defensible prior returns the pooled mean for almost the entire universe.** It would ship **near-zero discrimination wearing a far more respectable justification than the thing it replaced** — *the same failure diagnosed in `getCompositeScore`, rebuilt one layer up.* **Shrinkage does not manufacture evidence; it correctly reports that we do not have it.**
★ **Langston's decisive purpose-test argument, which stands independently of all the above:** this knob allocates **scan attention**, while the binding constraint is the net-EV/fee **qualification** drought (#570). **The funnel is dry at the qualification stage, not the looking stage — tuning attention upstream of a dry gate buys nothing.** CC-A's *"ideal produces 1.4% of closes at 70% attention"* is the same finding from the other end.

---

## 3. NUMBERED OBJECTIVES

**OBJ-1 — Delete `adaptive-ratio-manager.ts`** (rule 18 / §15 delete-on-the-spot; archive to `_archive/deleted-code/*.removed`, record in `DELETED_COMPONENTS_LOG.md`).

**OBJ-2 — Replace the dynamic ratio with a FIXED SPLIT at `0.7` ideal / `0.3` rotational** in `adaptive-scan-manager.ts`.
  ⚠️ ★ **STATE PLAINLY: THIS IS A BEHAVIOUR CHANGE, NOT A NEUTRAL DELETION.** The live computed ratio is **0.50**, not the 0.7 default — so removal moves ideal-pool scan attention **from 50% to 70%**. `0.7` is chosen because the drift being discarded is win-rate noise, **not** because nothing changes.

**OBJ-3 — Delete the SQL evidence readers that die with it:** `getPoolComparison` + `getPerformanceByPool` (`telemetry-repository.ts:371-429`). **Same batch or they are lingering legacy** (Langston condition).

**OBJ-4 — Blast-radius census BEFORE cutting, not after** (Langston condition). Known production consumers: `adaptive-scan-manager.ts:23,199,348,384`. Tests: `b79-0a-arm-injection.test.ts`, `adaptive_scanning.test.ts:164-165`. ⚠️ **Do NOT reflexively delete `poolAggregates`/`getPoolPerformanceComparison` — prove the caller set first.** Also closes the stale optional-`telemetry?`-arg item in RUNNING_ISSUES.

**OBJ-5 — Record the future path, do not bury the idea.** `DELETED_COMPONENTS_LOG` states: the concept (*scan better performers more often*) is **sound**; the implementation could not measure performance and had no evidence path. The principled version, **if a real per-pool evidence base ever exists**, is **discounted Thompson Sampling on net log-growth** with a window far wider than 24h-per-regime.

**OBJ-6 — OUT OF SCOPE, filed separately (§13):** whether `0.7` is the *correct* split given ideal produces ~1.4% of closes at 70% attention. **A behaviour decision must not ride inside a deletion** (Langston).

---

## 4. VERIFICATION

1. Untruncated `tsc` on edited files + `check-tsc-baseline` PASS.
2. Named tests green; the ARM-injection test removed/adjusted deliberately, not deleted silently.
3. All 4 CI jobs green on head (rule 19).
4. Deploy; confirm `[11.2R1][RatioManager]` lines **cease** and the scan composition holds at 70/30 — read from `/var/log/dawntrader/out.log`, **with a control that the file still contains scanner lines** (an empty grep proved nothing three times tonight).
5. §9.3 staging UI check of any scanner/pool surface.
6. **Architecture-class governance (§17): CONTENT updates to `SYSTEM_MANUAL.md:2701,3172,3226`, `SYSTEM_IMPACT_MAP.md:425,433,2202`, `sections/PHASE3_MARKET_SCANNING_AND_PAIR_MANAGEMENT.md:395,866,919`** — not a TOC pass.

---

## 5. RISK

**Scan allocation shifts 50/70 toward the ideal pool on deploy.** Bounded, reversible, and it replaces a value currently derived from a 0.002 win-rate difference. **The pools and their membership logic are untouched by this batch** — membership remains outcome-blind (§2 item 5), which is a *known, recorded* defect this batch does **not** fix and must not be described as fixing.
