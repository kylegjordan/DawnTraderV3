# B.2.UI — Entry-liquidity column on sim-trade tables + depth filter in diagnostics tab

**Phase:** 24 (B.2 support). **Mode:** active trading OFF; VTS/passive telemetry only — additive, no calibration/threshold change. **Asset classes:** crypto_spot + xstock_spot. **Drafted:** 2026-06-02 (CC), Kyle directive. **Step-1 reviewer:** Langston. Touches the VTS trade-open path → blast-radius review wanted.

## Objectives
1. **NEW "Volume / Order Book" column** on BOTH the **Open Simulated Trades** and **Closed Simulated Trades** tables (Machine Learning page, `machine-learning.tsx`), inserted **immediately after the "TEC State" column** (headers at lines 565 + 897; body cells at ~666 + ~997; next col is "$ Value / Qty"). Cell is **asset-aware**: **24h volume (USD)** for `crypto_spot`, **order-book depth (USD)** for `xstock_spot`. "—" when not captured.
2. **Capture the entry-liquidity value per VTS trade at trade-open** (Kyle: "capture xStock depth now"):
   - **xStock:** the ask-side depth-USD already in scope at the trade-open site (`eval-cycle.ts` registerOpenVtsTrade call ~L705; `askDepthUsd` is a function param, computed in `scanner.ts:618-644`). Capture the entry ask-depth.
   - **Crypto:** the 24h volume-USD figure at the crypto trade-open path (`vts-runner.ts` inline crypto ~L1438). VERIFY the volume-USD is in scope there; if not trivially available, thread it from the crypto LQ input (avgVolumeUSD). 
3. **Surface the depth (`min_depth_usd`) filter in the "xStocks Filter Diagnostics" tab** in BOTH the "last scan" and "24-hour" sections. The `failed_min_depth` counter is ALREADY computed (`global-filter.ts:139`, `pattern-filter.ts`) but is dropped by the API. Surface it.

## Design (for Langston review)

> **Kyle design refinement (2026-06-02) — SUPERSEDES the USD-volume design for crypto.** Crypto cell shows the **native 24h volume in COIN UNITS** with a **"QTY"** tag (NO USD conversion — removes the units risk Langston flagged in Q3). xStock cell shows **"$<depth> · OB"** (rolling-20m ask-side order-book depth). Cells may wrap (other columns do). Stored field renamed: `entryLiquidityValue` (number) + `entryLiquidityKind` ('depth_usd' | 'volume_qty'). Resolves Q3: no crypto USD conversion — capture `priceData.volume24h` (coin units) at the inline crypto trade-open. **Scope is ONLY the Open + Closed SIMULATED-trade tables (ML page) + the xStocks Filter Diagnostics tab — NOT the active-trading / RTB / live-history tables (those are Phase 19/25, Kyle 2026-06-02).**
- **Storage = `context` JSONB on `vts_open_trades`** (NOT a new top-level column) — lowest blast radius: no `ALTER TABLE`, no rehydration-mapping change; `context` already holds 20+ optional trade-metadata fields (ladder/phase/regime). Add `context.entryLiquidityUsd` (number) + `context.entryLiquidityKind` ('depth' | 'volume'). Closed trades inherit automatically (open record → `persistRealPriceTrade()` copy → JSONL). **Confirm context is serialized by `GET /api/vts/ml/open`**; if the handler whitelists fields, add the two.
- **Frontend:** read `entryLiquidityUsd`/`entryLiquidityKind` (fallback to asset_class for the label); format as `$` with the existing volume formatter; label cell e.g. `$6,309 · depth` / `$1.2M · vol`. Both tables.
- **Diagnostics filter:** 4 server edits in `routes.ts` (emptyGlobal + emptyPatternGlobal + buildGlobalFromCounters + buildPatternGlobalFromCounters ≈ L7369/7370/7420/7495) to pass `failed_min_depth`; 1 frontend label `failed_min_depth: 'Min Depth'` (`machine-learning.tsx:1886`). The tables iterate dynamically → both sections auto-populate.

## Verification (outcomes-based, §9.3)
- Staging UI (Claude-in-Chrome): new "Volume / Order Book" column renders after TEC State on BOTH tables; a NEW xStock trade shows a depth $ value, a NEW crypto trade shows a volume $ value; diagnostics tab shows a "Min Depth" filter row in last-scan + 24h.
- CI all-4-green; GDrive↔GitHub↔staging synced; Langston Step-4 (diff) + Step-8 (UI) recorded.

## Caveat (§9.1-style, surface to Kyle)
🚨 **Existing trades show "—".** Capture is at trade-OPEN; the current 287 open + ~1,696 closed trades were opened before this lands, so they carry no entry-liquidity and will render "—". Only trades opened AFTER deploy populate the column. (No backfill — depth history is only ~2 days hot and per-trade entry depth isn't reconstructable for past trades.)

## Blast radius
Additive only: one JSONB sub-field at the trade-open site (both asset paths), passthrough in two read APIs, two frontend columns, one diagnostics label + 4 API field passthroughs. No threshold/calibration change. Crypto + xStock both touched (the capture site differs per class) — confirm no regression to the trade-open hot path (the field write is a constant-time object set).

## Open questions for Langston
1. `context` JSONB vs a real `vts_open_trades` column for `entry_liquidity_usd`? (CC leans JSONB — lower risk.)
2. For xStock, capture **ask-only** depth (matches the LQ gate's input) or the **two-way min** (matches min_depth)? CC leans ask-only (the LQ gate's actual input; the column mirrors what the liquidity screen saw).
3. Crypto volume-at-open: confirm the volume-USD is in scope at the crypto trade-open site, or name the thread source.
