# B-XSTOCK-ORDERBOOK-COL — SCOPE + PRE-AUDIT (#561)

change-class: non_architecture

**Owner:** Claude Analyst (CC-C) · Kyle-directed (2026-07-27, from the running-issues scratch list; taken over from CC-B who dropped #561). **Langston Step-4: APPROVED** (diff at commit `82211df87`, all three files verified against the code). Crew board: claim id 38 (the three edited files).

## OBJECTIVE
The **"Volume / Order Book"** column on the Open Trades AND Closed Trades tabs shows `--` for every xStock trade (it fills for crypto). Make it fill for xStock too, on both tabs.

## PRE-AUDIT — root cause (traced in code, not inferred)
- The column renders `trade.entryLiquidityValue` / `entryLiquidityKind` (`vts-open-trades-table.tsx:172/335`; the closed table + adapter read the same). xStock convention = ask-side order-book depth USD (`depth_usd`); crypto = 24h volume (`volume_qty`).
- Crypto stamps it at the shared genesis-capture from `fx5Data.volume24h` (`signal-orchestrator.ts:~1001`). **xStock is absent from the FX5 pool, so `fx5Data` has nothing for it.**
- The xStock ask-side depth (`askDepthUsd`) IS computed (`eval-cycle.ts:312` param) and IS stamped on the VTS record (`:1037`) — but the **active-open dispatch call (`eval-cycle.ts:1130 dispatchXstockActiveSignal`) omitted it**, so the active trade (what the tables read) never received it.
- **No client/adapter change needed** — the adapter already maps `entryLiquidityValue/Kind` from metadata; the value simply never arrived for xStock.

## CHANGE (additive; tsc-clean — no new errors in the 3 files)
1. `eval-cycle.ts` dispatch call — add `entryLiquidityValue: askDepthUsd >= 0 ? askDepthUsd : undefined` + `entryLiquidityKind: 'depth_usd'` (mirrors the VTS stamp at `:1037`).
2. `active-dispatch.ts` `XstockActiveDispatchInput` — add optional `entryLiquidityValue?: number` / `entryLiquidityKind?: 'depth_usd'`.
3. `active-dispatch.ts` `rawSignal.metadata` — carry those two.
4. `signal-orchestrator.ts` genesis-capture stamp — xStock carried-value FIRST, crypto `fx5Data` fallback. Absence stays absent (honest-undefined, no default).

Closed rows inherit the at-open value (`createClosedTrade` writes at open), so fixing the open stamp fixes both tabs with one change.

## VERIFICATION
- tsc baseline (no new errors in the 3 files) ✅; Langston Step-4 ✅.
- **§9.3 (staging UI):** only NEWLY-opened xStock trades post-deploy carry it (pre-deploy opens stay `--`, same as the B-OPEN-TRADES-DISPLAY regime work). Confirm on a freshly-opened xStock trade after deploy: the DB row's `metadata.entryLiquidityValue`/`Kind` present, and the "Volume / Order Book" cell renders `$… · OB`. PENDING (a coordinated deploy window + a fresh xStock open).

## GOVERNANCE
Tier-1 per-batch at close (BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES #561, completion report, PHASE_19_PLAN). SIM: brief note if the display-context stamp enumeration is affected (the entry-liquidity carrier now has an xStock source). System Manual: N/A (display-plumbing only; no architecture/strategy/regime/math change).
