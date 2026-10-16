# B-SILENT-STRATEGY-CENSUS — strong_bull_trend ON for xStock (sprint row 52, `#1070`) — PRE-REGISTERED BEFORE THE SWITCH

change-class: non_architecture (one DB setting; no code)
**Authority:** Kyle 2026-09-30 (row 52): switch the five candidates on one or two at a time, **strong_bull_trend first**, each with a pass/fail written before it goes on. **Kyle 2026-10-16 (Desktop):** *"What's holding us back from switching on SBT for X-stocks now? … If it is just a matter of flipping the switch, please do so."*
⚠️ **Deviation from the 09-30 sequence, stated:** that decision also had the overdue per-strategy check of the nine already-on xStock strategies (Phase D.1) run first. Kyle's 10-16 instruction is taken as releasing that ordering for this one strategy; D.1 stays owed on row 52.

## 1. Readiness — read at `origin/migration/aws-supabase` and on staging, 2026-10-16
- **The ONE switch:** `module_constants` `strategy_gates` / `enabled` / `xstock_spot` / `strong_bull_trend` = `false` (`b79.0m.a`, 2026-05-11). Read by `isStrategyEnabledForAssetClass` (`canonical-regime-strategy-map.ts:1220`) at all three gates: the xStock loop (`eval-cycle.ts:497`), the SQE (`signal_quality_evaluator.ts:295`) and the orchestrator (`signal-orchestrator.ts:780`). `strategy_settings.enabled` is NOT consulted on these paths (it reads `false` for strategies that trade, e.g. vwap_pullback xStock).
- **Already routed:** strong_bull_trend is in the xStock regime map for TREND_FRIENDLY_STABLE and IMPULSE_EXPANSION, evaluated on its own strong-trend lane (`canonical-regime-strategy-map.ts:428-439`); only the switch skips it.
- **Its September settings already exist:** `reach_atr_max` 6.5 and `min_rr` 1.95 for `xstock_spot` / strong_bull_trend (`b-reach-baseline-adjust`) — the same two rows crypto strong_bull_trend runs on.
- **Takes effect without a deploy:** the settings cache refreshes every 60 s (`module-constants-service.ts:51`).

## 2. What the evidence says going in (analysis `ANALYSIS_2026-10-16_SIX_SETTINGS_LOSSES_AND_STOP_WIDTH.md`)
strong_bull_trend on crypto is roughly flat before fees (−0.26 % per trade) and loses after them; xStock trades lose most where stops fire outside US regular hours (1.59 % past the stop vs 0.03 % in session). **xStock fees are an order of magnitude lower than crypto's (~0.18 % vs ~1.45 % round trip), so the crypto result does not transfer directly — which is the point of running it.**

## 3. ⛔ PRE-REGISTERED CRITERION — written before the switch
**Population:** paper strong_bull_trend xStock trades OPENED after the switch time (recorded below), filled. **Window:** the first **20 filled closes**, or **21 days**, whichever comes first.
- **PASS (stays on):** average net P&L per filled trade **≥ 0 %** over the window.
- **FAIL (switched back off at window end):** average net per filled trade **< 0 %**.
- **At day 21 with 1-19 filled closes:** the verdict uses the mean of the closes accrued (PASS ≥ 0 %, FAIL < 0 %). *(Coltrane r1 correction 2.)*
- **At day 21 with ZERO filled closes:** insufficient evidence — no verdict; observation continues for one more 21-day window under the same rules, and if that also ends with zero closes it goes to Kyle with the evaluation counts (a strategy that never opens costs nothing but proves nothing).
- **EARLY STOP (switched off at once):** after **10 or more** filled closes, average net **≤ −1.5 %** per trade.
- **Reported each week, not a pass/fail input:** its share of xStock opens (crowding, `#1095` precedent: > 50 % is flagged to Kyle); how many of its stop-outs fired outside US regular hours and how far past the stop they filled.
**Read with:** the weekly six-settings read (successor `510a2e6a`, 2026-10-21), which adds this cell.

## 4. The change and the rollback
```sql
-- switch ON
UPDATE module_constants SET value='true'::jsonb, updated_by='b-silent-strategy-census', updated_at=now()
 WHERE module_name='strategy_gates' AND constant_name='enabled' AND asset_class='xstock_spot' AND strategy='strong_bull_trend'
   AND exchange='*' AND regime='*' AND value='false'::jsonb RETURNING *;
-- ROLLBACK (switch OFF)
UPDATE module_constants SET value='false'::jsonb, updated_by='b-silent-strategy-census-rollback', updated_at=now()
 WHERE module_name='strategy_gates' AND constant_name='enabled' AND asset_class='xstock_spot' AND strategy='strong_bull_trend'
   AND exchange='*' AND regime='*' RETURNING *;
```
**The activation gate (Coltrane r1 correction 1):** the UPDATE must return **exactly one row**; that row is re-read as `true`; the UTC time is recorded below. **That is the switch.** The first loop/SQE evidence after the 60 s refresh is **follow-up evidence, not the gate** — strong_bull_trend only reaches the SQE archive once a signal exists (`signal-orchestrator.ts:1166`) and the eval log line prints only when a trade opens (`eval-cycle.ts:1336`), so neither is guaranteed within minutes.
**Pre-switch zero, with its positive control** (`signal_eval_archive`, `asset_class='xstock_spot'`, non-VTS, last 24 h, read 2026-10-16 10:38:13Z): **strong_bull_trend 0 rows; vwap_pullback 527 rows** (the control — the same query sees an enabled xStock strategy).

## 5. Record
- **Coltrane APPROVED 2026-10-16 10:47:21Z at `b554b120fe3d8a8482984eca6583542011dd87fb`** (r1 send-back at `c043699bc`, two text corrections folded).
- **SWITCHED ON 2026-10-16 10:47:40.263Z UTC** on staging: `UPDATE 1`, the returned and re-read row `strong_bull_trend | true | b-silent-strategy-census` (before: `false`, `b79.0m.a`, 2026-05-11). **The window opens here: day 21 = 2026-11-06T10:47Z.**
- Follow-up evidence (first xStock strong_bull_trend loop/SQE rows after the 60 s refresh): _recorded when seen_
