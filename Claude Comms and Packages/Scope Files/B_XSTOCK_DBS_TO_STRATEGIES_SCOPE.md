# B-XSTOCK-DBS-TO-STRATEGIES — SCOPE r1a (`#1235`) — r1b: F1 folded as OBJ-1b; its settings row is missing, so OBJ-1b seeds one

change-class: non_architecture

**Owner:** CC-B (NEW Claude) · **Placed:** `SPRINT_TO_LIVE_PLAN` pre-sprint table, stage "00 — data truth first", order 4 (Kyle KD-2, 2026-11-04) · **Written:** 2026-11-05 · **Read at:** `origin/migration/aws-supabase` `86caf3040`

## 0. What this batch is for, in one paragraph
The xStock evaluation loop computes a real directional score (DBS) for every xStock with enough history, but never hands it to the strategies. Every strategy reads `dbsScore ?? 0`, so on xStock the score is always zero. Two kinds of damage follow. `strong_bull_trend` can never fire, because it needs a score of at least 0.35. And the guards that refuse counter-trend and strong-trend entries never fire either. **Measured on `#1235`: 95 of 521 xStock paper trades since the 2026-10-06 reset are trades those guards exist to refuse.** This batch hands the score through, so the xStock VTS and xStock paper trading run on the same input that crypto does.

## 1. The defect, re-read at the ref (`86caf3040`)
- **The loop hands the MCE's object to detect as is:** `server/asset_classes/xstock_spot/eval-cycle.ts:571` passes `mceContext.indicators` to `callStrategyDetect`.
- **That object has no DBS field:** `market-context-engine.ts:1432-1443`; type `server/types/market-context.ts:37-51`.
- **The real DBS is in hand at the same call:** the `propagatedDbs` parameter (`eval-cycle.ts:327`), which the scanner computes (`scanner.ts`, B-PHASE-A2) and passes into `mce.computeContext` (`:394`). There it feeds only the regime and `directionalBias`.
- **Crypto builds its own detect object WITH the score:** `vts-runner.ts:1824-1835` (`dbsScore: propagatedDbs?.score`, `dbsCategory`, `dbsSlope`), and the active path at `signal-orchestrator.ts` builds its own the same way.
- **Paper xStock reuses this detect result:** `dispatchXstockActiveSignal` (`eval-cycle.ts:1318`) carries the VTS detect's signal into the active pipeline without re-running detect.

**Every reader of the three fields, census by `git grep` at the ref (tests excluded):**

| reader | line | what it does with the score |
|---|---|---|
| `strong_bull_trend` | `strong-bull-trend.ts:77-78` | needs `dbsScore ≥` its floor to fire; reads `dbsSlope` |
| `vwap_pullback` | `strategy-engine.ts:171` | counter-trend LONG guard, `≤ counter_trend_long_dbs_floor` |
| `sma_trend_ride` | `strategy-engine.ts:473` | same guard |
| `morning_star` | `morning-star.ts:103, 112` | strong-DBS and counter-trend guards, `± dbs_min_threshold` (DB) |
| `reverse_impulse` | `reverse-impulse.ts:97, 105` | same, DB threshold |
| `defensive_hedge` | `defensive-hedge.ts:118, 126` | same, DB threshold |
| `volatility_edge` | `volatility-edge.ts:94` | strong-DBS exclusion at a **fixed 0.35 in code** (see finding F1) |

`computeRealHybridScore` (`server/core/utils/vts-real-score.ts`) reads none of the three fields, so the score the loop computes is unchanged.

## 2. Architectural read (1.a)
- **System Manual:** §"xStock eval pipeline" (`SYSTEM_MANUAL.md:12533` onward) draws `MCE → … → detect` with no statement of what detect receives. The xStock DBS chapter (`:12821`, per-class config: lookback 192, EMA 48/104, ATR 56) documents the score's computation, not its delivery. **That silence is a governance gap: the Manual never says the strategies receive the DBS on xStock, so it never contradicted the code.** Step 10 writes it.
- **System Impact Map:** the MCE entry and the xStock eval-cycle entries (`:264` reorg-B3.3x, `:1441` onward) list the loop's inputs. Neither lists the DBS hand-off to detect. Step 2 records the per-component census.
- **Blast radius:** xStock only. Crypto builds its own object on both paths, so nothing on crypto changes. **Behavior DOES change on xStock**, on both the VTS and paper trading: guards start refusing (about 1 xStock open in 5, by `#1235`'s measure) and `strong_bull_trend` becomes able to open xStock trades. That change is the purpose.

## 3. Provenance (1.b) — tier 1 for `eval-cycle.ts` detect input; tier 2 for the strategies (read, not changed)
**Corpora searched:** `RUNNING_ISSUES.md` (`#1235`, `#560`, `#549`, `#550`), `git log -S propagatedDbs --reverse` on `eval-cycle.ts`, and the two introducing commits.
- **The loop was written to mirror crypto.** `404a76428`, 2026-05-11, quoted: *"B79.0m.b2: mirror crypto VTS path in xstock eval-cycle (no SQE, fan-out, real patternInput) … Architectural rebuild of eval-cycle.ts to copy crypto vts-runner flow"*. At that time xStock had no DBS at all.
- **The real xStock DBS arrived a week later and was threaded only into the MCE.** `2a9341b87`, 2026-05-18, quoted: *"B-PHASE-A2 (C): xStock scanner DBS compute + eval-cycle propagatedDbs threading … Threads propagatedDbs into mce.computeContext(symbol, ohlc, lastPrice, volume24h, undefined, propagatedDbs, ASSET_CLASS)"*. The strategy input was not touched.
- **Same class as `#560` / `#549` / `#550`:** computed, then dropped in transit. `#560` (P19-B8.5h) fixed the same value's carry into the RTB queue, not into detect.
- **`bridge/canonical/`:** not consulted. The xStock loop and its DBS both postdate the 2026-01/02 governance change, so the corpus has no coverage of them.

**Disposition (of the five): (3) disconnected, should be RECONNECTED.** The intent is clear (crypto parity), and the guards were written for exactly these cases. **Bug taxonomy outcome (1), real defect.**

## 4. Objectives and how each is verified
**OBJ-1 — the xStock detect input carries the DBS.** The loop hands detect a new object: the MCE indicators plus `dbsScore`, `dbsCategory` and `dbsSlope` from `propagatedDbs`, exactly the three fields `vts-runner.ts:1832-1834` sets. **`mceContext.indicators` itself is not mutated**, because the provenance capture (`:592-599`), the hybrid score (`:672`), the reach gate (`:739`) and the paper hand-off (`:1327-1329`) read it.
- **When `propagatedDbs` is undefined** (the scanner lacked history, ATR or sector), the three fields are undefined and the strategies' `?? 0` neutral applies, the same as crypto. No new fallback.
- *Verify:* a unit test drives the detect call and asserts that the object detect receives carries the three values; a mutation removing them turns it red; a test with `propagatedDbs` undefined asserts the fields are absent, not 0.

**OBJ-1b — `volatility_edge` reads its strong-DBS threshold from the database (folded F1, §9.4 #1).** `volatility-edge.ts:94` replaces its fixed `0.35` with the same lookup its siblings use: `getCachedNumberRequired('strategy_dbs_routing_guards', 'dbs_min_threshold', {exchange:'*', assetClass, strategy, regime:'*'})` (`morning-star.ts:98-102`). The row's value is 0.35, so behavior is unchanged on crypto. Its absence fails hard, as on the siblings: no fallback.
- **MEASURED 2026-11-05 ~00:10Z (staging, `module_constants WHERE module_name='strategy_dbs_routing_guards'`): 4 rows, all `dbs_min_threshold = 0.35` at `asset_class='*'`, for `defensive_hedge`, `morning_star`, `reverse_impulse`, `strong_bull_trend`. NONE for `volatility_edge`.** So OBJ-1b needs ONE seeded row (`volatility_edge`, `*`/`*`/`*`, 0.35, matching its siblings' shape) in a migration with a rollback file, a MANIFEST entry and a count assertion. With the row absent the new lookup would fail hard, which is why the row ships in the same deploy, before the code reads it.
- *Verify:* the migration's own assertion (exactly 1 row inserted); a unit test with the row set to a different value proves the strategy reads it; a source fence that no literal `0.35` remains at that guard; on staging, `volatility_edge` keeps producing crypto signals after the deploy (no config-missing refusals).

**OBJ-2 — paper xStock inherits it with no second change.** *Verify:* trace at Step 2 that `dispatchXstockActiveSignal` carries the detect result built from the OBJ-1 object, with no path that re-runs detect with the old object.

**OBJ-3 — a count the reader can see: how many xStock evaluations carried a DBS this cycle.** One field in the existing xStock cycle summary (evaluations with `propagatedDbs` defined / total). **Positive control for OBJ-4:** zero would mean the hand-off is inert.
- *Verify:* the field appears in the staging cycle summary and is above 0 during market hours.

**OBJ-4 — staging verification, PRE-REGISTERED here, before any data:**
- **(a)** xStock strategy null reasons that were 0 before the deploy appear after it: `b63_strong_dbs_exclusion` and the counter-trend guard reasons, on the xStock VTS. **PASS:** at least one of each kind within the first US regular session after the deploy. **FAIL:** none in a full session while OBJ-3 reads above 0.
- **(b)** `strong_bull_trend` on xStock: its refusals stop being 100% below the DBS floor. **PASS:** any xStock evaluation that clears the DBS floor in the first session. Whether it then opens a trade depends on its other gates (reach, reward-to-risk) and is NOT a criterion.
- **(c)** crypto is unchanged: the same null-reason counts on crypto in comparable windows, and no code path on crypto touched.
- **(d)** UI: the Filter Diagnostics page for paper xStock shows the new refusal reasons (Claude-in-Chrome). ⛔ **The Drift Dashboard is NOT opened** (`#1037` am.4).

**OBJ-5 — NOT in this batch, carried so it is not lost:** Kyle's KD-7 (2026-11-04) switches on adaptive_flow, reverse_impulse, volatility_edge and support_bounce for xStock right after this deploys, each after a target-reachability check. That runs under `B-SILENT-STRATEGY-CENSUS` O3, which is already homed. This batch only removes the reason to wait.

## 5. Findings outside the scope (§9.4)
- **F1 — `volatility_edge`'s strong-DBS exclusion is a fixed 0.35 in code** (`volatility-edge.ts:94`). Its siblings read `strategy_dbs_routing_guards.dbs_min_threshold` from the database (`morning-star.ts:98-102`, documented class-invariant at 0.35). The value is the same today, so behavior is identical. But it is a hardcoded copy of a DB-governed setting, and **this batch makes it live on xStock for the first time.**
  **DISPOSITION: folded into this batch (§9.4 #1) as OBJ-1b.** PM Claude ruled 2026-11-05 that Kyle's standing rules already decide it (rule 23 fix-on-find, and no hard-coded values for DB-governed settings); Kyle is told as information, not asked.
- **F2 — xStock's strong-trend lane does not attach crypto's strong-trend stop/target override** (`vts-runner.ts:1835` attaches `strongTrendGeometryOverride` for the `quant-strong_trend` lane; `eval-cycle.ts` has an `xstock-strong_trend` lane and no override). **NOT ESTABLISHED:** whether any strategy that reads the override (`vwap_pullback`, `strategy-engine.ts:243`) runs in xStock's strong-trend lane.
  **DISPOSITION: review scheduled at this batch's Step 2** (the census settles whether it bites). If it does, it is a separate decision for Kyle, not folded here.
- **F3 — the guard thresholds (±0.35) were set on crypto's DBS scale.** xStock's DBS uses its own lookbacks (System Manual `:12821`), so whether 0.35 suits xStock is a calibration question. **DISPOSITION: no work in this batch.** Calibration reads it once the guards are live; this batch only makes them live.

## 6. Governance this batch expects to touch
System Manual (the xStock detect input), System Impact Map (the eval-cycle entry and its DBS hand-off), `RUNNING_ISSUES` `#1235`, `CHANGES_AND_FIXES`, `BATCH_CATALOG`, `PHASE_HISTORY`, the task lists, memory, and the plan's pre-sprint line. A progress report only if OBJ-4 needs a second session.

## 7. Risk
Small code change, real trading change. About one xStock open in five is expected to be refused, and `strong_bull_trend` may start opening xStock trades. Both are the intended behavior that has been silently missing since 2026-05-18. One new settings row (OBJ-1b's `volatility_edge` threshold, at the value the code already uses), no schema change.
