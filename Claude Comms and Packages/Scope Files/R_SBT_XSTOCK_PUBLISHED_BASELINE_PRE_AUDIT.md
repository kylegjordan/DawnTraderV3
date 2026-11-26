# R-SBT-XSTOCK-PUBLISHED-BASELINE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**2026-11-26 · Step 2 · KD-73 · change-class: non_architecture · read-only research**

**Previously stated vs now.** Step 1 left the identity of the governing clean post-Entry Gate window for review. Coltrane's 16:40:17 UTC PROCEED on `bd4ee0802a07564f36710d9029db9ff9afb3a503` confirmed the opening fence and terminal read in Silent Strategy Census Progress Report §§3a.2 and 3a.5. This satisfies the observation prerequisite for a transferability verdict. The result and sample size are unchanged. The audit adds the price bases needed to interpret the cohort. The verdict on published practice remains open.

## Audit

### A1. Signal geometry and the active xStock path

Shared source was read at `18f98b0f4e84d9ff0a1b99dce91993a99b39074a` and the serving mechanism at Phase A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`. The historical open writers were read at Entry Gate A `e0e68dfdb` and the level-basis cutover `1d4be9cf7`. The System Impact Map, System Manual, Batch Catalog, Running Issues, Batch 63 and Silent Strategy Census reports, #1250 change list, and `bridge/canonical` regime and strategy mapping were consulted. The canonical mapping corroborates original lane intent. The November 26 PM2 tail provided process and log presence. Row-level history came from durable trade records.

The xStock scanner starts from the app bootstrap (`server/index.ts:967` at shared), subscribes to the central clock (`scanner.ts:249`), and calls the xStock evaluation from its cycle (`scanner.ts:947`). It is the only production caller of that evaluation. The evaluation carries directional bias and the bars into the enabled detector (`eval-cycle.ts:471–527,594–622` at Phase A). The shared detector has callers through the orchestrator and the VTS strategy dispatcher, both through `strategy-engine.ts`. On the xStock path, VTS can tag and simulate quality refusals. The evaluation hands its levels to the paper path at its single `dispatchXstockActiveSignal` call (`eval-cycle.ts:1428–1451`). The dispatcher checks paper and class activation, forwards the geometry and geometry form, and takes money-held and guardrail inputs before the shared orchestrator accepts the external signal (`active-dispatch.ts:170–194,242–294`). Ready-to-Buy promotion calls the active engine's `processSignal` (`active-execution-engine.ts:5788`). Paper fills settle in `closed_trades`. VTS records represent a separate population.

The Step 1 staging snapshot and Coltrane's 16:37:59 UTC control agreed on the enabled strategy, its 1.95 reward-to-risk floor and 6.5 ATR reach ceiling. The xStock class defaults are 2.0 and 4.0. Scoped resolution is in `server/core/calculations/expectancy.ts:235–273`. The detector requires DBS of at least 0.35 and a close above the preceding six bars' high plus 0.15 ATR, with a 1.5 ATR cap on the breakout bar's body. It builds its stop and target at distances of 3 and 6 ATR from that close and stamps both legs as distance-form (`server/strategies/strong-bull-trend.ts:83–110,134–192`). Coltrane's pinned detector control passed the native 2:1 signal with the scoped settings and refused it on reach under the class defaults.

**Documentation discrepancy.** The historical B63 Strong Bull Trend row in the System Impact Map (shared line 1860) attributes Variant E to Strong Bull Trend. The System Manual (shared lines 11754–11767), the adjacent SIM override entry and the pinned detector identify Variant E with the eligible crypto VWAP Pullback path. The xStock detector uses its native 3/6 ATR distances. The audit uses that verified basis. The existing #1235 evidence and Phase 25 calibration carry the xStock lane questions.

### A2. Governing observation and price-basis controls

The paper xStock observation starts with positions opened at or after the Entry Gate A deploy on November 7 at 13:20:59 UTC. The 20th filled close was XLE/USD on November 12 at 14:43:14.634 UTC. The registered first 20 include four winners, with a sum of −11.2360 percentage points and an equal-weighted net mean of **−0.561800% per filled close**, against the registered pass line of 0%. **Registered FAIL.** Two trades opened before the fence closed during the registered window and remain in the pre-fence controls. KD-76 keeps the strategy enabled. The pre-fence diagnostic and results after the 20th close are outside this grade.

The November 26 16:49:31.767401 UTC read used `dt_reader` in a bounded read-only transaction. All 20 registered opens come after the #1250 xStock taker-rebase deployment `1d4be9cf7` on November 7 at 19:06:27 UTC. The original Entry Gate deploy used the planned stop and target at the walked taker fill (`e0e68dfdb:server/services/active-execution-engine.ts:6556–6606`). After the cutover the xStock taker path can reapply the distance legs to the paid price and records the plan and each carried level's basis (`1d4be9cf7:server/services/active-execution-engine.ts:6471–6505,6765–6770,7034–7042`).

| Registered first 20 | Closes | Paid price differed from recorded decision price | Stop and target basis |
| --- | ---: | ---: | --- |
| xStock taker, ticker-snapshot walk | 10 | 10 of 10 | Both fill-rebased |
| xStock taker, ticker-snapshot walk | 1 | 0 of 1 | Both remained at plan |
| xStock maker, raw-ask trigger | 9 | 6 of 9 | Taker rebase stamp absent on 9 of 9 |

SPG/USD provides the positive rebase control from the #1250 first look and the cohort re-read. The planned entry was 233.515 and the booked paper fill was 233.30. The carried stop and target each shifted by −0.215, preserving their distance from entry. ARKK/USD supplies the same-price control. It has a distance specification for both legs, an empty inconsistency list, and plan entry and fill both 79.10. Its `plan` basis describes the outcome of reapplying the levels. A `plan` stamp alone cannot distinguish equal prices, anchors and rejected specifications.

On the historical xStock maker path the raw ask triggered the fill and the order booked at its resting limit. On the taker path the decision stamp is the signal's intended entry and the booked entry is the sized walk. Interpret the fields by arm (`1d4be9cf7:server/services/active-execution-engine.ts:1941–2013,6789–6811`). The schema summary of the xStock maker decision price as a limit is stale for this raw-ask cohort (`shared/schema.ts:2005–2024`). A maker `opened_at` is placement time in the historical writer. Placement-to-close includes resting time, and a close-time stop or target may have moved with trailing logic. For executable spread, actual time in position and original carried levels, use independently matched quote and booking evidence or mark those fields unsupported. A nearby quote or a symbol/time-only match cannot prove the exact event.

**Reproduction.** Use `dt-sql` with a read-only transaction and bounded statement timeout. Group the output by cohort, chosen entry mode, producer, source and level-basis stamps. Check both prices before counting differences.

```sql
WITH base AS MATERIALIZED (
  SELECT symbol, opened_at, closed_at, chosen_entry_mode,
         actual_entry_price, entry_decision_price, entry_price_producer,
         entry_price_source, net_pnl_percent, metadata
  FROM closed_trades
  WHERE mode = 'paper' AND asset_class = 'xstock_spot'
    AND strategy_name = 'strong_bull_trend'
    AND opened_at >= TIMESTAMPTZ '2026-11-05 05:36:24+00'
    AND opened_at < TIMESTAMPTZ '2026-11-14 01:00:00+00'
    AND closed_at IS NOT NULL AND close_reason IS NOT NULL
    AND close_reason <> 'never_filled'
), first_twenty AS (
  SELECT * FROM base WHERE opened_at >= TIMESTAMPTZ '2026-11-07 13:20:59+00'
  ORDER BY closed_at, opened_at, symbol LIMIT 20
)
SELECT 'registered' AS cohort, * FROM first_twenty
UNION ALL
SELECT 'pre_fence' AS cohort, * FROM base
WHERE opened_at < TIMESTAMPTZ '2026-11-07 13:20:59+00';
```

`REVIEWER: claim-only · which objects distinguish native levels, executable quote and booked entry by cohort? · HIT: maker decision stamps can hold the triggering ask, and a plan stamp alone cannot identify the mechanism · re-derived y at the historical writers, #1250 first-look record and bounded SPG/ARKK and maker controls`

### A3. Existing plan and scope boundaries

The August [Target Geometry Study Plan](TARGET_GEOMETRY_STUDY_PLAN.md) contains generic published work and a separate VTS population. KD-73 adds the specific paper xStock bridge. The observation is historical and terminal. Step 2 introduces no prospective staging window or UI surface. The research overlay is a prerequisite within sprint rows 129 and 131.

**Audit blind spots checked.**

- Type versus database enum — paper mode, class and strategy were verified on the durable trade rows and matched against the active writer.
- Literal value lists — strategy enablement and scoped gate values came from the settings snapshot and resolver control.
- Properties and fields — metadata and price columns were checked against both historical write paths.
- Sibling producers — the scanner's VTS evaluation and paper dispatch were traced separately. The query reads paper mode only.
- Site meaning — maker and taker decision prices have different meanings. The cohort uses opening time and a filled-close filter.
- Error paths — missing level or quote evidence cannot supply a usable price basis. The no-shift control distinguishes `plan` from a proved stamp failure.
- External library behaviour — N/A for the document-only change. Source transferability is ANALYST's open evidence leg.
- Out-of-program scripts — the #1250 analysis SQL was read directly. Its time-matched archive corroboration cannot establish row identity by itself.

## Implementation plan

1. **P1 — Publish the provenance handoff (A1, A2).** Link the verified geometry, active route, exact first-20 record and fill-basis groups from the canonical Target Geometry Study Plan. Keep the registered grade on the whole cohort and the pre-fence diagnostic separate.
2. **P2 — ANALYST compares like with like (A2, A3).** Name each reputable published source's universe, sample, 15-minute decision timeframe, holding and cost assumptions. Compare with DawnTrader's actual fees, executable spreads, volatility, money held, position size and slot constraints under the applicable historical rules. Identify each cohort's fill and level basis, with the maker limit and trigger and the taker signal and walk distinguished. Keep unsupported inputs explicit. Produce a bounded starting range with a pre-stated falsifier, or a supported conclusion of insufficient evidence or non-transferability.
3. **P3 — Obtain and integrate the transferability ruling (A2, A3).** Return the exact comparison to Coltrane. Carry the ruling to the Strong Bull Trend xStock cell in row 129 and any row 131 action that would alter that cell's floor. KD-76, Adaptive Flow's KD-57 hold, Price Feed Coverage and Entry Gate D gates, and the November 27 #1191 return keep their existing authority.

**Summary.** The post-Entry Gate paper observation is complete and failed its registered test. The sample includes maker and taker entries whose quotes and booked prices describe different parts of the fill. The research comparison will use the recorded bases and go back to Coltrane before it informs sprint planning.

**Step 2 approval — 2026-11-26 17:09:19 UTC.** Coltrane approved exact `31b85c04186d580c5d3cf6d3e9605af9952c82b1` in response to dispatch `1575558198939615293`. He re-ran A2 under `dt_reader`, demonstrated that a closing-time filter admits both pre-fence controls, reproduced the SPG and ARKK level controls, and confirmed the maker distinction and Variant E discrepancy. The read-only handoff goes to ANALYST. The completed comparison returns at an exact ref for Coltrane's transferability ruling before advancing the named row 129 cell or changing its row 131 floor.
