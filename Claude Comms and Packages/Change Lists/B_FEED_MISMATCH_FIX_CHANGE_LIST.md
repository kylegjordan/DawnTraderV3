# B-FEED-MISMATCH-FIX — CHANGE LIST (Step 4, code review)

change-class: architecture · plan row `3n.u` · owner CC-B · **STEP: 4 of 11 · NEXT STEP: 5 of 11**
Plan: `Scope Files/B_FEED_MISMATCH_FIX_PRE_AUDIT.md` r5, **cleared by Langston 2026-09-18 22:50Z with conditions C1-C4** — each answered below. Kyle 2026-09-19: *"fix the incorrect feeds that are not going to be fixed by analyst"*; *"keep going with Langston through to deploy"*.

## Verification before review
- `node scripts/check-tsc-baseline.mjs` → **377 = baseline 377**.
- New `server/tests/unit/b-feed-mismatch-fix.test.ts` **10/10**; amended `order-placer.test.ts`, `p19-b4b1-depth-gate.test.ts`, `b-exit-provenance-fence.test.ts` pass (55/55 across the four).
- **Mutation-proved** (each mutation applied, run, reverted): witness moved into the taker branch → test 4 fails; predicate made unsigned (`Math.abs`) → A-4 test and test 3 fail; refusal `return` removed → tests 1 and 2 fail.
- Full local unit run: 288/300 files pass. The 12 failing files are **not touched by this batch** — 6 integration/system files needing a local Postgres, 2 `.mjs` parse errors on Windows (`b-staging-liveness-watch`, `b-tsc-baseline-fix`), `b63-item12`, `b63-item16`, `b79-0n-storage-sqe-asset-class-routing` (screener_filters values); CI is the authoritative run.

## The change, by plan item

**P1 — the close fill grades its book** (`active-execution-engine.ts`, `closePosition` taker leg)
- `resolveCloseFillContractConfig` resolved **above** the depth read (no new await between snapshot and walk).
- After the walk: `assessWarmth(_closeSnap,'bids',_closeCfg)` → **C1: persisted from the new discriminated `WarmthResult.kind`** (`depth-source.ts`: `warm | no_book | stale_book | thin_book`), never a split of the display `reason`.
- **The gate runs AFTER the existing `_witness` read** (r5 — no hoist): maker leg → untouched; no bids walked (flatten only) → `synthetic_reference`; warm → `walk` / `flatten_walk`; not warm + no witness → `walk_no_reference`; not warm + `walkAboveReference(fill, witness.bid, up_tol)` false → `walk_stale`; true → **refused** (returns before any persistence) unless the per-position streak reaches `cold_refusal_cap` → `walk_yield` + one alert. Contract unseeded → refused, alert on first refusal, never yields (fail-closed).
- **C2 — the flatten discriminator is explicit:** `closePosition` options gain `flatten?: boolean`, set ONLY by `forceClosePosition`. On a flatten the gate **never refuses**: a diverged walk books as `flatten_walk_diverged`, a cold book books against the caller's observed reference (`synthetic_reference`); both are **excluded from the three learning captures** (`TRADE_OUTCOME`, exit-decision archive, outcome-feedback EMA).
- Non-filled closes (cold / no config) are counted by `_countCloseRefusal` (id-keyed, strict-equality alert, the `_noTriggerStreak` idiom).
- The `[FILL_DEPTH_AGE]` log moved below the decision and now carries `warmth` and `arm`.
- **C3 — `order-placer.ts` closeOrder:** config missing → `rejected no_depth_config`; cold + `coldBookReferencePrice` (flatten only) → reference × (1 − penalty); cold otherwise → `rejected cold_book`. The misleading `[CLOSE_COLD_BOOK] … exit at requestedPrice` warn is gone: the rejected arm logs *"close REJECTED, position stays open"*; the reference arm logs `CLOSE_COLD_BOOK_REFERENCE`. Still side-effect-free (docblock carries the live-swap obligation).
- New columns `closed_trades.exit_fill_book_warmth`, `exit_fill_arm` (schema + migration comments state the warmth/hollowness orthogonality and the arm vocabulary).
- New module `close_fill_contract` (`close-fill-contract-config.ts`): `up_tol` 0.01, `cold_refusal_cap` 60, both classes — **a separate module from `fill_depth_gate` on purpose** (a missing close knob there would null that resolver and block every OPEN). Migration header states `up_tol` is **a choice inside the empty interval (+0.47 %, +5.15 %), crypto n=0 not-warm rows**.

**P2 — one flatten path** (`active-portfolio-manager.ts`)
- New `_flattenOne(position, tag)`: request = a `getPriceWithFallback` quote of any age (its `observedAt` carried) → else the depth snapshot's best bid (producer = the class walk producer) → else **LEFT OPEN** + alert. **Never the entry price.** A C3 refusal is detected by re-reading the position (closePosition returns void).
- `forceCloseAllOpenPositionsOnStop` uses it; `details` gains status `left_open`.
- **Stop flow** (`active-engine-service.ts`): positions reported `left_open` are carried in `_deliberatelyOpen` and **skipped by the orphan delete**; passed explicitly into the reconciler.

**P3 — close-all through the canonical close**
- `closeAllPositions` → `_flattenOne` per position; returns `{closed, leftOpen, failed}`; `POST /active-engine/close-all` reports it instead of asserting "All positions closed". The button is kept.
- The silent-deletion hazard **moved with the route and was closed there**: `closePosition` itself deletes a position whose trade row cannot be found — now with a `CLOSE_NO_TRADE_ROW` log and alert.
- `resetPortfolio()` deleted (zero callers; docs-export occurrence named) — `DELETED_COMPONENTS_LOG` + `_archive/deleted-code/`.
- **Census addendum (sent 22:46Z, before your clearance):** `POST /active-engine/force-clear-stranded` **keeps its own row-writer** — a stranded position may have no open trade row, and `closePosition` books P&L only onto an existing row, so routing it would lose the row. Its entry-price fallback is removed: a no-price position is **skipped and reported** (`skippedNoPrice`). `hardResetActiveEngineTables` is **out of scope** (a deliberate wipe with no pricing claim; identifiable by `close_reason='hard_reset'`) — named in the SIM close-path census at Step 10.

**P4 — the reconciler** (`reconcileIncompleteTrades`)
- Population `{ limit: 'all' }` (FINDING-3). Price = an observed quote of any age with provenance (`exit_price_producer/_source/_observed_at_ms`, `exit_fill_arm='synthetic_reference'`); no quote → row **left open** + alert. Never the entry price.
- FINDING-4: `deliberatelyOpenSymbols` carried explicitly. **Keyed by symbol because no other join exists** — `active_open_positions` has no trade-id column; the symbol is unique among open positions. Stated in the code.

## C4 — the fence swap is not a net loss
- **Kept:** the independence pair (`not.toMatch(/exitTickerBid:…_closeSnap/)`) and the existing text-order witness test.
- **Added at runtime:** test 4 drives the MAKER leg and asserts `getTickerWitness` is called (branch reachability); tests 1/2/5 assert a refused close never reaches `storage.getClosedTradesBySymbol` (the opening of the persistence block), `updateClosedTrade` or `deleteActiveOpenPosition`.
- Amended deliberately: `b-exit-provenance-fence` CONDITION-1 (producer now `quote.producer`; `position_entry_price_reused` must not appear) and P9 (close-all writes no row of its own; routes through `_flattenOne`).

## Files
`server/services/active-execution-engine.ts` · `server/services/active-portfolio-manager.ts` · `server/services/active-engine-service.ts` · `server/routes.ts` · `server/services/execution/order-placer.ts` · `server/services/execution/types.ts` · `server/services/execution/depth-source.ts` · **NEW** `server/services/execution/close-fill-contract-config.ts` · `shared/schema.ts` · **NEW** `drizzle/migrations/2026-09-19-b-feed-mismatch-fix-close-fill-contract.sql` (+ rollback, not in MANIFEST) · `drizzle/migrations/MANIFEST.txt` · tests: **NEW** `server/tests/unit/b-feed-mismatch-fix.test.ts`, `server/services/execution/order-placer.test.ts`, `server/tests/unit/p19-b4b1-depth-gate.test.ts`, `server/tests/unit/b-exit-provenance-fence.test.ts` · governance: `DELETED_COMPONENTS_LOG.md`, `_archive/deleted-code/…resetPortfolio….removed`.
