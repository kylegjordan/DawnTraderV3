# P19-B8.9 — venue-only AT-SOURCE (CC-A; claimed with CC-B agreement 2026-07-16)

change-class: architecture

**Kyle structural directive:** the actionable path went venue-only at `347e9534b` (kraken_ws → same-venue REST → skip-tick + the 40-skip §10.5 rail; binance/coingecko/LKG/entry_seed OFF actionable). This batch is the AT-SOURCE half: **stop FETCHING the backup prices at all**, remove the display-chain REST call sites, and replace third-party display values with an honest venue-quiet display state. FIX-ON-FIND era (CLAUDE.md rule 23): finds get fixed in-batch.

## Objectives
1. **OBJ-1 — retire the third-party fetching machinery (rule 18):** `fetchFromBinance` / CoinGecko fetchers + `binanceSymbolFor` in `live-pricing-adapter.ts` (:64, :293-310, :400+) — DELETE, archive per DELETED_COMPONENTS_LOG. The `source` unions shrink accordingly (typed honesty: a source that can no longer occur must not remain representable — pending the OBJ-3 trace verdict for `entry_seed`/`last_known_good`).
2. **OBJ-2 — remove the display-chain REST call sites.** For xstock symbols these are STRUCTURALLY WASTED: Kraken spot REST carries NO tokenized equities (KNOWN_NONEXISTENT_NAMES, dual-spelling tested; the endorsed invariant lives at `active-execution-engine.ts:933` — xstock decisions consume a fresh equities-feed tick or NOTHING, `getLatestEquityTick`, 90s blocking knob). This is the ~46 wasted lookups/window driving the measured REST peak (46/min = 0.77/sec vs Kraken's 1/sec public ceiling).
3. **OBJ-3 — LKG/entry_seed caller trace BEFORE any cut (standing Langston condition, two-cuts era):** confirmed double-duty at `active-portfolio-manager.ts:588` (`restFallbackSources` includes `last_known_good` — the P&L/valuation path) + 4 sites in `routes.ts` (display endpoints) + the adapter chain (6). Deliverable: a per-caller verdict table — KEEP (valuation/display legitimacy) / CUT (actionable residue) — with the portfolio-manager valuation behavior UNDER ABSENCE explicitly designed (honest venue-quiet marking, never a silent stale value). No cut ships without its row.
4. **OBJ-4 — FIX-ON-FIND rider (found in the Step-1 read):** `active-execution-engine.ts:1036` re-injects the REST-fetched price into the cache via `updateFromWebSocket(..., 'kraken_ws')` — REST data MISLABELED as WS. Downstream consumers (incl. freshness gates + the WS/REST divergence telemetry) cannot distinguish genuine WS marks from REST backfills. Fix: label honestly (`kraken_rest`) and verify every consumer of the source tag tolerates it.
5. **OBJ-5 — honest venue-quiet display state:** when the venue is quiet (no fresh WS/REST/equities-feed value), the UI shows an explicit venue-quiet state (reference: the BSX/USD ~40-tick self-recovered window at 20:37Z, alert 975fd498) — never a third-party number, never a silently-stale one. §9.3 UI walk mandatory (per the strengthened rule).

## Verification criteria
- Zero `fetchFromBinance`/CoinGecko fetch lines in staging logs post-deploy; the fetcher code deleted + archived.
- Zero display-chain REST asks for xstock symbols (log-verified).
- Rate-limit re-measurement vs today's baseline (avg 23/min, peak 46/min): peak materially reduced; headroom vs the 1/sec ceiling restated.
- OBJ-3 verdict table in the pre-audit; portfolio-manager valuation behavior under absence demonstrated (test + live).
- Source-tag honesty: no REST value carries a WS label (log + code assert).
- §9.3: staging walk of the venue-quiet display state on the paper page.

## Blast radius (pre-audit deepens)
`live-pricing-adapter.ts` (fetchers + source unions + fallback chain) · `active-execution-engine.ts` (:1036 label; the display-broadcast leg) · `active-portfolio-manager.ts` (:588 valuation fallback list) · `routes.ts` (4 display sites) · client display components consuming the price source tag. NOT touched: the SQE/gates files (CC-B's), the sizing files, the equities feed (`amr-equity-feed.ts` stays the xstock decision source), the actionable venue-only chain (already correct).
