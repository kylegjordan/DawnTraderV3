# P19 reorg-B4.1 — Scope

**Batch:** P19 reorg-B4.1 — shadow-trading visibility tab + per-cycle pool-membership record
**change-class: architecture** (new persisted table + a capture-behavior change in the shadow layer + read endpoint + UI tab)
**Owner:** NEW Claude (CC-B) · reviewer Langston
**Origin:** Kyle directive 2026-06-26 — "build a tab where we can see the shadow-trading results, on the trading page right after Trade History; take it to verified completion incl. a look on the staging UI." Follows reorg-B4 (the shadow-trade engine, now closed + deployed, dormant).

---

## Why

reorg-B4 built the shadow-trade engine but NO visibility — the results land only in `rtb_shadow_pairings` with no screen and no read endpoint. Kyle wants a tab to see them. The tab's purpose is the selection-quality question: **per promotion cycle, show the ranked pool, mark the one we promoted, and show how every candidate's shadow turned out** — so you can eyeball "the one we picked finished 4th of 6."

**Design gap this batch ALSO closes (surfaced by Kyle's mechanics question):** reorg-B4 opens ONE shadow per signal (deduped) and records its rank/`promoted` flag at FIRST appearance. A signal that lingers across cycles, or is promoted on a LATER cycle, therefore has a stale rank and a wrong `promoted=false`. The per-cycle pool snapshot is not reconstructable. Since the layer is DORMANT (rtb_total=0, no rows yet), now is the free/clean time to fix the capture granularity.

> 🚨 **§9.1 FORWARD-INSTRUMENTATION DISCLAIMER:** the tab + endpoint render an EMPTY state until paper-mode active trading is turned back on (~B9). rtb_total=0 today → no promotion cycles → no shadow rows. This batch ships the tab WIRED + verified-rendering (empty-state + populated-state proven), but it shows live rows only after paper-active turn-on. Staging UI verification this batch = the tab renders cleanly (empty state + a seed-then-clean populated proof).

## Objectives

**OBJ-1 — Per-cycle pool-membership capture (the granularity fix).** Keep ONE resolving shadow TRADE per signal (the existing `rtb_shadow_pairings`, deduped — outcomes never duplicate), but ADD a per-cycle membership record so rank + `promoted` are captured EVERY cycle:
- NEW table `rtb_shadow_pool_members`: one row per (cycle, signal) — `cycle_key`, `mode`, `asset_class`, `signal_id`, `shadow_trade_id` (FK → `rtb_shadow_pairings.id`), `symbol`, `strategy`, `promotion_rank`, `promoted` (rank<openSlots THIS cycle), `final_score` + components (hybrid/confidence/regime_weight/decay_penalty), `ranking_score`, `di_at_queue`, `dbs_score_at_queue`, `sqe_verdict`, `created_at`. Indexes: `(mode, asset_class, cycle_key)`, `shadow_trade_id`, `cycle_key`. (Outcome is NOT duplicated here — joined from `rtb_shadow_pairings`.)
- `captureShadowPool` writes a member row for EVERY pool member each cycle (NOT deduped), referencing the existing-or-new shadow trade id.
- `registerOpenShadowTrade` returns the trade id on dedupe (currently returns null) so the member row can reference the existing trade.
- `rtb_shadow_pairings` stays the resolving-trade + outcome record (its existing `promotion_rank`/`promoted`/`cycle_key` columns become the FIRST-seen snapshot — informational; the authoritative per-cycle view is the new table). Migration + rollback (OUT of git) + MANIFEST.

**OBJ-2 — Read endpoint.** `GET /api/shadow-trades/by-cycle` (paper-mode; optional `assetClass` filter) returning, grouped by promotion cycle (most-recent first, paginated): the ranked pool (each member: rank, promoted-flag, symbol, strategy, scores) JOINed to each one's shadow outcome (net/gross PnL, R-multiple, close reason, holding, open/closed) from `rtb_shadow_pairings`. Plus: (a) a "currently-open shadows" list (in-flight, not yet closed); (b) summary selection-quality stats over the window (e.g. of cycles where all members have closed, how often the promoted pick had the best / above-median outcome). Read-only; NO write; NEVER touches a learning store.

**OBJ-3 — UI tab.** New "Shadows" tab on the trading page (`active-trades.tsx`) immediately AFTER "Trade History" (grid → 6 cols). New `client/src/components/trading/shadow-trades-tab.tsx` mirroring the trade-history-tab patterns (useQuery + apiFetch + `useTradingMode` isPaper-gate + Card + DualScrollTable + clean empty-state + a small summary header). Primary view = the by-cycle comparison (each cycle: the ranked pool with the promoted pick marked + each member's outcome side-by-side). Secondary = "open shadows in flight" + the selection-quality summary cards. Honest empty state ("No shadow trades yet — populates when paper-mode active trading is on").

**OBJ-4 — Staging UI verification (§9.3, Kyle-required).** After deploy, navigate the staging UI via Claude-in-Chrome to the trading page → Shadows tab: confirm it renders, the empty state is clean (no undefined/"--"/layout break), no console errors. THEN seed 2-3 representative `rtb_shadow_pool_members` + `rtb_shadow_pairings` rows on staging, re-navigate, screenshot the POPULATED tab (proves the real rendering), then DELETE the seed rows (telemetry-only table, clean-up verified). Screenshot evidence in the completion report.

**OBJ-5 — Isolation preserved.** The read path is read-only and NEVER writes a learning store. The OBJ-1 capture change must keep the reorg-B4 by-construction isolation intact (separate Map, allowlist close, `VTS_OPEN_TRADES_EXCLUDE_SHADOW` on shared-table reads, rehydration split all unchanged) — the new member-row write is an additional telemetry write to the isolated sink family only. A test asserts the member-write touches no learning store + the dedupe still bounds the open-shadow population.

## Out of scope
- The two B9-gated reorg-B4 hardening items (#388 rehydration fail-direction, #389 capture-path guard) stay at B9.
- No change to the shadow exit math / resolution / cap / TTL.

## Verification criteria
- tsc baseline OK; new tests green (member-capture per-cycle + isolation + endpoint shape); CI 4-green.
- Migration applies cleanly on staging; `rtb_shadow_pool_members` live + indexes.
- Staging UI (Claude-in-Chrome): Shadows tab renders empty-state cleanly + the seed-then-clean populated proof (screenshots).
- Langston Step-1/2/4/8 consensus.

## Governance (Tier-1 + applicable Tier-2)
SIM (the new `rtb_shadow_pool_members` table + the capture-behavior note folded into the reorg-B4 callout; S19 unchanged), System Manual §19.8 (extend with the per-cycle membership record + the tab), BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5, completion report. (RUNNING_ISSUES only if a new follow-up surfaces.)
