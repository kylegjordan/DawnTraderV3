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

---

## Step 4 r2 — Langston CHANGES-NEEDED (23:41Z, graded `4d86141b6`): both blockers + four conditions, one commit
- **BLOCKER-1** — `routes.ts` stranded-clear now stamps `exitDecisionPrice`, `exitPriceProducer`, `exitPriceSource`, `exitObservedAtMs` from the `liveQuote` it booked. New fence in `b-feed-mismatch-fix.test.ts` reads `routes.ts` (no other fence did) and also asserts the `FALLBACK_TO_ENTRY` arm is gone from that route.
- **BLOCKER-2** — `_countCloseRefusal(…, isFlatten)`: a refused FLATTEN alerts on its FIRST refusal (title *"FLATTEN left <symbol> OPEN"*); runtime test added (fill_depth_gate unseeded ⇒ `no_depth_config` ⇒ one alert, nothing persisted).
- **C1** — the contract statement is corrected rather than the behaviour changed: `order-placer.ts` docblock now says a flatten IS refused when `fill_depth_gate` is unseeded (latent — both classes seeded at 50), and that refusal is now loud (BLOCKER-2). The change list's "a flatten never refuses" is superseded by: *a flatten never refuses on divergence or a cold book; it can be refused only by missing depth config, and alerts at once.*
- **C2** — `exit_fill_arm` comment (schema + migration `COMMENT ON`) now names the reconciler's `synthetic_reference` rows and the discriminator `close_reason = 'engine_stop_cleanup'` (no fee, no penalty on those rows).
- **C3** — **PLAN DEVIATION, recorded for the completion report:** plan row `3n.u` said flatten paths "stop accepting an unbounded-age `last_known_good_reserve`". `_flattenOne` ACCEPTS it and carries `observedAt` onto the row. Re-decided because holding a position through an engine stop / kill switch is worse than booking a labelled, aged, learning-fenced observed price; Langston concurs.
- **C4 nit** — `_deliberatelyOpen` block re-indented.
- **Finding, corrected in place:** the `canYield=false` rail's alert body no longer promises that resolving re-arms it (it fires once per streak; the streak clears only when the position closes).
- **Findings homed (§9.4 disposition 3):** `CLOSE_NO_TRADE_ROW` still deletes (should write the row from the position) and stranded-clear's `fees:'0', slippage:'0'` → **`HOME: B-CLOSE-WRITER-COSTS, owner CC-B, placed in PHASE_19_PLAN at row 3n.u3, after 3n.u2`**.
tsc 377 = 377; the batch's three test files 47/47.

---

## Step 6 — DEPLOYED `323ae277641368acb057e8ffa7643894aa1c2799` (joint with CC-C `8a-P4a`/`8a-P4b`)
`dt-deploy … --by cc-b`: *"OK — live, engine resumed, identity asserted"*; `deployed_at 2026-09-19T00:02:43Z`, `migrate_ran_at 00:02:31Z` (1,043 ms) — BEFORE the restart. Previous good sha (rollback): `91647c9b99e2c0c1c548bab6127134301fd5f6a0` + the two `-rollback.sql` files in reverse date order.

## Step 7 — FIRST-PASS VERIFICATION (CC-B)
- **Migration at the object:** `closed_trades.exit_fill_book_warmth` and `exit_fill_arm` exist; `close_fill_contract` rows `up_tol 0.01`, `cold_refusal_cap 60` for `crypto_spot` and `xstock_spot`.
- **P1 LIVE, first post-deploy close (00:02:47Z, 4 s after deploy):** `LOW/USD` xStock `stop_hit` taker — book age **51.8 s** ⇒ `exit_fill_book_warmth = stale_book`; walked fill **192.50** = witness bid **192.50** ⇒ within `up_tol` ⇒ `exit_fill_arm = walk_stale`; `exit_book_state_at_fill = two_sided`. Log line agrees: `[FILL_DEPTH_AGE] symbol=LOW/USD … ageMs=51784.908 warmth=stale_book arm=walk_stale`. ⭐ This is the position behind CC-C's hollow-book / unmanageable alerts (`748f2ba6`, `ef81571d`) — it closed at the real bid.
- **Exit monitor healthy after restart:** first `[EVAL_EXIT]` cycle at 00:03:02Z evaluated 8/8 with WS prices, `exitEvalRefused=0`, `noTriggerRefusals=0`.
- **UI (Claude-in-Chrome, `/paper-trading` → Closed Trades):** `LOW/USD` is the top row — `STOP LOSS`, `$198.8800 / $192.5000`, exit mode `TAKER`, 808 total trades; the dashboard's KPIs render. ⚠️ **The two new columns have NO UI surface** — they are forensic columns for the close audit, read by SQL; no panel was built for them in scope.
- **Known, not new:** 18 `[TEC_CACHE_MISS_FATAL]` lines in the first ~2 s after restart (00:02:37-39Z), then clean — the boot race already filed as **`#1053` `B-TEC-PRIME-BOOT-RACE`** (plan row 2.4j, owner CC-B); the same line appears after the 09-13 and 09-14 restarts.
- ⛔ **UNEXERCISED, DECLARED (Langston Step-4 obligation):** P2 (`_flattenOne` / engine-stop flatten), P3 (close-all, stranded-clear) and P4 (reconciler) have **zero live population ever** (0 rows of `manual_stop`, `stranded_clear`, `engine_stop_cleanup`, 07-15 → 09-18). Exercising them on staging means stopping the engine (flattens every open paper position) or pressing Close All — **not done without Kyle's go-ahead**. Their coverage is the unit/runtime tests (flatten cold → reference arm; refused flatten alerts at once; stranded-clear provenance fence). **Post-deploy silence on those arms proves nothing (#661 leg 3).**
- **Not yet observed:** a REFUSED close (`CLOSE_REFUSED`), a `walk_yield`, a `synthetic_reference`. Watch: `select exit_fill_arm, count(*) from closed_trades where closed_at > '2026-09-19 00:02:43+00' group by 1`.
