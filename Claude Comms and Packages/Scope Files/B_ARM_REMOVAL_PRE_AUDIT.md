# B-ARM-REMOVAL — Pre-Implementation Audit (Step 2)

**Owner:** CC-A · **change-class:** architecture · **Scope:** `B_ARM_REMOVAL_SCOPE.md`
**Written:** 2026-07-28, **retroactively at the canonical path** after alert `2d701427` correctly flagged its absence.

> ⚠️ **HONEST PROVENANCE — read this first.** The pre-implementation analysis below **was genuinely performed before any code was cut**, and each item cites the measurement or census that produced it. **What did not happen is filing it at the canonical path** — it lived in `B_ARM_REMOVAL_SCOPE.md` §2/§4a and in the Step-1/Step-2 review exchanges instead. The governance checker was right to fire: *"the work was done elsewhere"* is exactly the claim a missing-doc alert exists to stop people making, so this document is the evidence, not the excuse. **Nothing here is reconstructed from memory** — every figure is re-stated from a recorded measurement with its control.

---

## 1. SIM CONSULTATION (§2 mandatory)

| Component | SIM entry | Upstream | Downstream | Shared state | Blast radius |
|---|---|---|---|---|---|
| `adaptive-ratio-manager.ts` | §3.5 | Telemetry Aggregator (in-memory) + `telemetry-repository` (SQL) | `adaptive-scan-manager` **only** | `poolAggregates` (in-memory, per-instance) | Scanner batch composition |
| `telemetry-aggregator` pool limb | §3.5-adjacent | `recordPairTelemetry` (VTS-only writer, M70) | ARM **only** | `poolAggregates` + snapshot file | Nothing outside the ARM |
| `getPoolComparison`/`getPerformanceByPool` | (repository) | `telemetry_history` table | ARM **only** | — | Nothing outside the ARM |

★ **SIM defect found during this consultation and CORRECTED:** SIM **§3.6 (Pair Failure Tracker)** cited `adaptive-ratio-manager.ts` as its file. **That class has never lived there** — it is `adaptive-scan-manager.ts:50`. A pre-existing mis-attribution that would have become a dangling reference; fixed in this batch's governance pass. *(Consulting the SIM is supposed to surface exactly this; it did.)*

---

## 2. STATE-WRITE CENSUS (§9.5 a-ii — "does anything still DEPEND on what this DID?")

- **`ratioUsed`** (written by the branch being cut): declared `adaptive-scan-manager.ts:41`, written `:275`, read by **tests only** — **zero production readers**. One existing test already asserted it is `undefined` on the non-adaptive path, i.e. the surviving behaviour.
- **`getPoolPerformanceComparison`**: sole production caller `adaptive-ratio-manager.ts:104`; everything else tests/docs. **No API route, no diagnostic reader** (Langston re-derived independently).
- **`poolAggregates`**: private; readers are the getter, the reset, and the snapshot serialiser (`:1696`/`:1711-1714`). ⚠️ **This is what made "delete the getter only" wrong** — it would have left a **write-only** aggregate with the serialiser as its sole consumer (the #568 class inverted).
- **`PoolType` / `entry.pool`**: **live and retained** — types per-entry pool tagging, independent of the ARM.

---

## 3. THE DECIDING PRE-IMPLEMENTATION MEASUREMENT

`actualIdealCount = min(ceil(batchSize × ratio), availableIdealCount)` (`adaptive-scan-manager.ts:212-217`).

Measured on `/var/log/dawntrader/out.log` **before cutting** (control: 1,155 `[11.4B.2-R1]` lines present — an empty result would have been meaningful):
`Target: Ideal=151, Available=16, Actual=16+284=300` · `UNDERFLOW PROTECTION` firing · composition **4%/78%**.
`Available` over 200 consecutive cycles: **0 (52×), 1 (36×), never above 16** against a target of 151. Pre-cut archive (control: 4,265 lines): avg 31.1, **max ever 60**.

⇒ **The clamp bound on every cycle in all observable history ⇒ the dynamic ratio and a fixed one resolve to the same allocation ⇒ the removal is behaviour-neutral BY MEASUREMENT.** This is the finding that made the batch safe, and it was established *before* implementation.

---

## 4. WHY THE DESIGN COULD NOT BE REPAIRED (tested, per Kyle's condition)

1. **SQL evidence source holds ZERO rows and always has.** `telemetry_history`, controlled: same `DATABASE_URL`, `db=postgres`, `schema=public`; on that **same connection** `vts_open_trades`=39,258 and `rtb_shadow_pool_members`=112,582; one table, one schema. **Two independent causes** — the pool/regime writer is fenced by `shouldPersist()` = `(mode === 'live') || force` (never live), and the unfenced cost writer's loop `startCostTelemetryLoop:223` has **zero callers**.
2. **Damper inert at operating scale.** `computeConfidence = min(1, totalSamples/100)` saturates at 100; measured live at **28,238** samples.
3. **Score fed a retired input.** `winRate*0.6 + avgEdge*0.4`, `avgEdge ← avgFinalScore`, fed `finalScore ?? 0` since #558 A2.
4. **`MIN_SAMPLES: 3` is dead config** — assigned `telemetry-aggregator.ts:141`, read by nothing.
5. **Rebuilding on outcomes fails on distribution** — 957 symbols, mean **15.2** trades, **zero** above 393. Shrinkage would return the pooled mean for nearly the whole universe.

★ **Decisive (Langston): the PURPOSE TEST.** The knob allocates **scan attention**; the binding constraint is the net-EV **qualification** drought (#570). **Tuning attention upstream of a dry gate buys nothing** — true regardless of every measurement above.

---

## 5. RISK ASSESSMENT

| Risk | Assessment |
|---|---|
| Scan allocation shifts | **NONE — proven, not assumed** (§3 clamp). Rev 1 claimed a 20-point shift; that was **wrong** and is corrected in the scope. |
| Snapshot format break | **NONE.** State file is module-local, written/read only by its own two functions, restore is key-guarded; a leftover key is ignored by `JSON.parse`. Nothing reads `version`. |
| Hidden consumer | Census + `tsc` (394 = unchanged baseline, zero deleted-symbol errors) + 7 suites green. |
| Losing the *idea* | Future path recorded in `DELETED_COMPONENTS_LOG` + `SYSTEM_MANUAL` §6 — Thompson Sampling on net log-growth, gated on #596. |
| **Mistaking a deletion for a fix** | ⚠️ **Membership stays outcome-blind (#597). Every governance doc states this batch did NOT address it.** |

---

## 6. WHAT THIS AUDIT DID NOT COVER

Pool **membership** (`getCompositeScore`) and the ideal-pool **starvation** — both real, both measured, both filed as **#597**, and deliberately out of scope: this batch removes a *consumer* of pool telemetry, not the pool-quality logic. **A later reader must not read this audit as clearing membership.**
