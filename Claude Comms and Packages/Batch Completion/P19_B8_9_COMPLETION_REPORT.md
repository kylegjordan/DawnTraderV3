# P19-B8.9 — venue-only AT-SOURCE — Completion Report (CC-A, 2026-07-17)

change-class: **architecture** (retires an external price-sourcing pathway + collapses the source-type model)

> 🚨 **PARTIAL — the SERVER half is deployed + verified; the venue-quiet DISPLAY CELL is not yet user-visible.** The venue-quiet Current-price cell renders through CC-B's B8.7 Step-9 shared-table rewire (carry obligation on channel record). Until that push lands, the server ships the `priceVenueQuiet` boolean and the honest at-source behavior runs (cuts + xstock gate active in production), but the on-screen "venue quiet" badge appears only once CC-B's shared table is live. The §9.3 UI walk of the cell + Langston's final OBJ-5 sign-off close the remaining sliver.

## Objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Retire third-party fetchers + Kraken-REST-or-nothing chain | ✅ DONE | `fetchFromBinance`/`fetchFromCoinGecko`/`binanceSymbolFor` deleted + archived (DELETED_COMPONENTS_LOG 2026-07-17); `source` unions dropped `'binance'`/`'coingecko'`; tsc green proves no dangling literals. Deployed: **zero** Binance/CoinGecko fetch refs in 2,000-line post-deploy log window. |
| OBJ-2 | xstock display-chain REST class-gate | ✅ DONE | `[P19-B8.9][XSTOCK_REST_GATE]` firing live on **BSX/USD + UBER/USD** (the two stale xstock positions) — `rest_ask=skipped serving=last_known_good`; zero xstock symbols reaching Kraken REST. |
| OBJ-3 | LKG/entry_seed caller trace before any cut | ✅ DONE | Per-caller verdict table in `P19_B8_9_PRE_AUDIT.md` (entry_seed KEEP, last_known_good KEEP, binance/coingecko CUT, mock KEEP). No cut shipped without its row. |
| OBJ-4 | (folded into B8.9a — the :1036 REST-as-WS mislabel) | ✅ DONE (B8.9a) | Closed in the B8.9a sub-batch; the FIFTH mislabel (broadcast ternary) fixed in this batch. |
| OBJ-5 | Honest venue-quiet display state | ◐ SUBSTRATE DONE / cell pending CC-B | Server `priceVenueQuiet` (ONE notion, both surfaces) + `peekCachedPrice` + standalone `VenueQuietPrice` deployed; the CELL renders via CC-B's shared-table rewire (carry). §9.3 walk pending that push. |

## The 5→1 fold (Langston-blessed tidy)
Five drifted inline `restFallbackSources` lists (4× `routes.ts` + `active-portfolio-manager.ts`) folded to one shared `isRestFallbackSource` predicate; unrepresentable members (`binance_rest`/`coingecko`) removed.

## Langston Step-4 conditions — discharged
- **Condition 1** (binanceSymbolFor 11 assertions): the on-disk `p19-b8-5-exit-integrity.test.ts` contained ONLY those assertions (34 lines) → whole-file retirement (rule 18). Skip-rail coverage confirmed in `p19-b6-6-price-liveness` + `p19-b8-9a-source-tag-honesty` + the new suite; full-suite remainder green.
- **Condition 2** (`market-data.ts:113` own `fetchFromCoinGecko`): untouched; recorded left-intentionally in DELETED_COMPONENTS_LOG.
- **OBJ-5 item 1** (silent no-op): `priceSource`/`priceAgeMs` were already on the Open Trades payload (routes.ts:12298-99, pre-existing) — confirmed present.
- **OBJ-5 item 2** (two quiet definitions): RECONCILED onto one server-side `priceVenueQuiet` boolean on both surfaces; age-blind client helper removed.

## Verification
- Bench: tsc baseline OK (no regressions); full vitest **0 failed tests / 2327 passed** (the 10 "failed files" are pre-existing DB-teardown-noise, proven identical on clean baseline); new suite `p19-b8-9-venue-only-source.test.ts` 6/6.
- CI: all 4 jobs GREEN on `b28cf7074` (run `29582668953`).
- Deploy: HTTP 200, PM2 online; backend evidence above.
- REST rate: still well under the 1/sec Kraken ceiling; xstock REST asks now structurally zero (gate-confirmed). Full re-measure vs the 0.28/sec B8.9a baseline logged at Step-7.
- §9.3 UI walk of the venue-quiet cell: **PENDING CC-B shared-table push** (the only remaining close item alongside Langston's OBJ-5 sign-off).

## Governance files changed
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — new §2.1.2 (venue-only source model + venue-quiet + 5→1 fold + B8.9a fold-in).
- `1-system-manual/SYSTEM_MANUAL.md` — §3.5 venue-only display-chain note (with the venue-match WHY).
- `1-system-manual/DELETED_COMPONENTS_LOG.md` — the fetchers + the retired test (rule 18).
- `1-system-manual/BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md` — B8.9 rows.
- Scope `P19_B8_9_VENUE_ONLY_SOURCE_SCOPE.md` + pre-audit `P19_B8_9_PRE_AUDIT.md` (Steps 1-2).
- MEMORY (CC-A + shared) at close.

## Commit
`b28cf7074` (the approved half). RTB-table client hunk rides on CC-B's push (interleaved shared file — who-holds-the-wrench).
