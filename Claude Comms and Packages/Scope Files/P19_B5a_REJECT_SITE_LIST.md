# P19-B5a — Chunk-A artifact: tagged pre_filter reject-site list (for Langston Step-3 sign-off BEFORE hooking)

**Date:** 2026-06-16 · **Author:** Claude New (CC-B). Per your Q-B: classified by reject SEMANTICS, not file boundary. **No hook is written until you sign off on this list.**

## ★ GATE SoT — RESOLVED (your Q-A verify-before-edit concern is moot)
The scanner **ALREADY reads the canonical active-mode SoT in scope**: `earlyContext = await storage.getSystemContext(mode)` (`fx5-scanner.ts:674`), reused as `isEngineActive = earlyContext?.isEngineActive` (`fx5-scanner.ts:1127`) — the **same** `storage.getSystemContext(mode).isEngineActive` SoT that `tradingStateSync.isEngineActive` (`trading-state-sync.ts:347`) and the xStock active-dispatch (`active-dispatch.ts:122`) use. So the capture gate is literally `if (isEngineActive) archiveSignalEval(...)` at each site — **NO new parallel boolean**, reuses the existing in-scope read. (The market-scanner global-filter sites fetch the same `getSystemContext(mode)` — confirm in Step-3 the same `earlyContext` is threadable there, else one `getSystemContext` read at the scan-cycle top, NOT a new flag.)

## CAPTURE sites → `reject_stage='pre_filter'` (real decision-rejects — pair was evaluated against a quality/liquidity threshold and failed)
| # | File:Line | Condition | Label |
|---|---|---|---|
| 1 | market-scanner.ts:786 | `volume24h < activeMinVolume` | low_volume |
| 2 | market-scanner.ts:798 | `bidAskSpread > activeMaxBidAskSpread` | wide_spread |
| 3 | market-scanner.ts:804 | `!passesHistoryFilter(...)` | insufficient_history ⚠️(borderline — see Q1) |
| 4 | market-scanner.ts:792 | `currentPrice < activeMinPrice` | low_price ⚠️(borderline — see Q1) |
| 5 | fx5-scanner.ts:1089 | `LQ < dbLqMin \|\| VolNoise > dbVnMax` (quant IMF core) | core_imf_lq_vn |
| 6 | fx5-scanner.ts:1300 | `lq < thresholds.LQ_MIN` (family IMF) | family_imf_lq |
| 7 | fx5-scanner.ts:1301 | `vn > thresholds.VN_MAX` (family IMF) | family_imf_vn |
| 8 | fx5-scanner.ts:1302 | `di < DI_MIN \|\| di > DI_MAX` (family IMF) | family_imf_di |
| 9 | fx5-scanner.ts:1259 | `lq<LQ_MIN \|\| vn>VN_MAX \|\| di<DI_TRENDING_MIN` (pattern IMF) | pattern_imf |
| 10 | market-scanner.ts:937/944/951/958/965 | pattern-path price/volume/spread/history thresholds | pattern_quality_* |

## SKIP-ELIGIBILITY sites → NOT captured (never-was-a-candidate; capturing inflates volume with non-informative rows — your rule)
| File:Line | Condition | Label | Why skip |
|---|---|---|---|
| market-scanner.ts:754/763 | already in pool / open position | already_active | not a candidate (already trading it) |
| market-scanner.ts:770 / 930 | stablecoin regex | stablecoin | structural exclusion |
| fx5-scanner.ts:954 | `volume24h`/`dailyRange` null | incomplete_metrics | data-integrity, not an evaluation |
| fx5-scanner.ts:1290/1292 | DBS exclusive family routing | exclusive_routing | architectural ROUTING (not a reject — the pair still trades, just in another family) |
| fx5-scanner.ts:1147 | already in `classifiedSymbolSet` | already_classified | structural dedup |

## Reconciliation / questions for you
- **Q1 (borderline — your call):** the recon agent tagged `already_active` + `stablecoin` as CAPTURE; I **applied your semantic rule and moved them to SKIP** (never-a-candidate). Confirm. AND two I'm genuinely unsure on: **`low_price` (#4)** and **`insufficient_history` (#3)** — both ARE threshold evaluations (so lean CAPTURE by your rule), but they're close to "structural eligibility." My lean: CAPTURE both (they're evaluated gates, and a thin/young pair being filtered IS informative for friction analysis). Your call — capture or skip?
- **Q2 (write-volume note, you already accepted gate-on-active):** when active, these fire for **most of ~300 pairs every scan cycle** — high volume, but telemetry-only (async, try/catch, partitioned + retention-swept like the rest of B70). Flagging it as a known property, not a blocker.
- **Q3 (DBS routing):** `fx5:1290/1292` is exclusive-family ROUTING, not a reject (the pair still trades in `strong_trend`). I classified it SKIP — confirm it should NOT get a pre_filter row (it isn't a rejection).

On your sign-off (capture set + the Q1 borderlines) I write the chunk-A hooks at the confirmed CAPTURE sites only, each gated `if (isEngineActive)`, fire-and-forget try/catch, `reject_stage='pre_filter'`, score fields null (pre_filter = never scored, per your headline rule).
