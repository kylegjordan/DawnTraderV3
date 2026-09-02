# OPEN — F-G-2 / `B-EXIT-TRANSACTABLE-SIDE` — PROGRESS REPORT (observation window)

> **Status: DEPLOYED, IN OBSERVATION. Not closed.** Converts to `F_G_2_COMPLETION_REPORT.md` only when the pre-registered data is in AND a decision has been taken on it (workflow-10 rule, 2026-08-26). Card: `Verification` → `Observation` once Step 8 clears.
> **Written 2026-09-02 by CC-C. Every number below names its object and population; every criterion below is pre-registered BEFORE the data it judges exists.**

## 1. WHAT THE BATCH IS FOR, AND WHAT SHIPPED
Exit decisions read a book MIDPOINT — a price nobody can transact at — while a sell fills on the BID (scope §2: post-book-fix crypto stop-outs land below their stop 24 of 24). F-G-2 (a) measures the bid-side decision as a SHADOW arm before switching anything (OBJ-0/OBJ-1, crypto), and — folded in on Kyle's 2026-09-02 directive — (b) makes VTS book **mark-booked** exits instead of TEC's clamp (OBJ-5a), charge the MAKER entry fee where a maker was actually paid (OBJ-5b), and cut the VTS learning history at ONE epoch boundary (OBJ-5c). xStock decision-side legs are HELD (§7.4 rows 1-2); the xStock fee site is EXEMPT and ships (row 3).

**Shipped:** code `d3e643032` (11 files) + Langston FINDING-2 stamp `76c65266e` + fence pin/nit `3f399cddf`/`2cc4a03ec`. **Deployed `2cc4a03ecd864ca87bdcdde6317077c94cbc9c16` @ 2026-09-02T08:49:47Z** (`dt-deploy`, record written, migration ran 787 ms, `restart_time=592`, `deployed_by_claimed=ANALYST-Claude`). **Rollback sha `c6ad197684b45437c00855cb2d7ef208d49cca6e`.** ⚠️ **Langston's Step-7 rider fix (`f36c8f496`: witness only on an exit event) is PUSHED and CI-green (`33612071982` at `ecfc4b836`) but NOT yet deployed — it deploys with the pre-run follow-up before the shadow run is armed.**

## 2. EVERY STEP, WITH ITS EVIDENCE
| step | evidence |
|---|---|
| 1 scope | r12 `B_EXIT_TRANSACTABLE_SIDE_2_SCOPE.md`; OBJ-5 decided CHANGE (Kyle) |
| 2 pre-audit | r3 cleared by Langston 07:31 at `840df8a5d`; conditions 1-2 applied `a433b1b49`; condition 3 carried to §7 below |
| 3 implementation | `d3e643032`; fresh-reader round changed the shape (three fee write paths, not one: 107/439/7/11 by origin) |
| 4 code review | Langston APPROVED 08:26 at `d3e643032` (re-read the live call, the shadow block, the close merge, all four `costFeeFraction` writers); seededFrom hunk verified 08:51 at `2cc4a03ec` |
| 5 CI | run `33609980643` at `2cc4a03ec`: Build / TypeScript Check (baseline gate) / Test Suite / Docker Build — **4/4 success, per job**. ⚠️ That head also carries CC-A `f2d2cafae`+`f812e729d` (measure-gate hooks) and CC-B `9fa63ed47` (memory) — a green grades what ships; a red there would not have been attributable to F-G-2 alone. Baseline regenerated at `2d1e4ae17`: 7 entries retired (two stale interface declarations), 0 added |
| 6 deploy | above |
| 7 first pass | §3 |

## 3. STEP-7 EVIDENCE AT THE OBJECTS (2026-09-02, 08:49–09:07Z)
- **OBJ-5c — VERIFIED.** `module_constants` `calibration_epoch`: `vts/crypto_spot` 4→**5**, `vts/xstock_spot` 5→**6**, `updated_by=fg2-obj5c-vts-cost-truth`; wildcard `vts/*` untouched at 3 (superseded — pre-audit P14's "wildcard row" was corrected at the object). Boot: `[ITEM4][outcomeFeedbackStore] epoch 4→5 for vts_crypto_spot_… Welford reset (EMA continues — documented limitation)` at 08:50:41.
- **OBJ-5a — INSTRUMENT PROVEN, n=1.** Closed store `logs/virtual_trades/2026-09-02.json`: the one post-deploy crypto `stop_hit` (AKE/USD, exitTime 08:50:40) booked `exitPrice 0.00806734` vs `originalStopPrice 0.0081876` — **1.47% below the stop, the observed mark**. Same instrument, pre-deploy: 19 of 20 today's `stop_hit`/`target_hit` rows book `exitPrice == originalStopPrice` exactly (the clamp signature; the exceptions are 8-dp rounding). ⛔ **Mark-booked, not "realistic" and not "transactable" (Langston FINDING-1): the booked mark is the cache MID, still favourable by ~half a spread; the eventual bid switch carries a VTS leg.**
- **OBJ-5b — WRITE PATH NOT YET EXERCISED.** 0 VTS rows opened since 08:49:47Z by 09:07Z (VTS opens on its own cycle). The first post-deploy open is the first observation.
- **OBJ-0 — SEED STAMP LIVE; COVERAGE LIMIT MEASURED.** `active_open_positions.metadata.fg2Shadow`: CRV/USD = `{seededFrom:"midlife", witnessAtEvent:{…}}`. `midlife` because CRV's first post-restart cycle threw `TEC_CACHE_MISS_FATAL` (warm-up) after the live key was created, so the shadow key was created a cycle later — **the post-restart symmetric re-seed Langston predicted; it over-excludes, it does not entangle.** The `witnessAtEvent` on a seed-only row is the #546-class stamp the rider fix removes. APR/USD carries no stamp because the engine never reaches its exit evaluation at all (§6 — not a shadow-arm gap).
- **UI (Claude-in-Chrome, no login):** `/virtual-simulations` → Open Trades renders 116 rows with `Entry Fee Mode` + the five cost columns; a pre-deploy maker row (SPX/USD, `Maker (0.40%)`) renders fee legs `$2.0000 / $2.0000` on $250 — **0.80% per leg on a maker row: the batch's thesis rendered live**. Closed Trades renders 590 rows; AKE/USD shows Entry `$0.0088` / Exit `$0.0081` / Stop `$0.0082` / `STOP LOSS` — exit below stop, matching the store.
- **Boot errors since restart:** three transient lines at 08:49:41-45 (TEC cache miss during warm-up, one WS parse, `/home/runner` EACCES — all pre-existing classes); none after.

## 4. ⛔ PRE-REGISTERED CLOSE CRITERIA — WRITTEN BEFORE THE DATA
**4a. OBJ-0 (the 2×2) — the run is NOT armed yet.** It starts only after F-G-1's own criterion returns PASS (alert `2093a98a`, 2026-09-04) and after the rider fix is deployed.
- **Window:** 14 days from the arming deploy (§13: the duration is the content).
- **Population:** crypto closes whose row carries `fg2Shadow` with **`seededFrom='cold'`** — `midlife` rows EXCLUDED (their arms share a ratcheted stop); **n-floor 30 such closes**, i.e. closes carrying a book bid, NOT closes.
- **Abort:** if `trailing_enabled_active` or `moonbag_qualifying_strategies` flips on for `crypto_spot` inside the window, the run is VOID (arms entangle silently; measured inert today by CONFIG on all four classes).
- **The 2×2:** rows = bid-arm first exit ∈ {stop-side, target-side, none}; columns = live close reason ∈ {stop_hit, target_hit, other}. **Every cell published.** The **DISCORDANT cell** = bid-arm first exit was stop-side AND the live close was `target_hit`.
- **The estimand, in dollars (Langston: a rate is precision, not the decision):** per discordant row, `value_forgone = quantity × (actual_exit_price − bidFirstExit.bid)` — the profit the live arm captured that the bid rule would have cut short (sign: positive = forgone). Per concordant-stop row (bid-arm stop-side AND live `stop_hit`), `shortfall_avoided = quantity × (bidFirstExit.bid − actual_exit_price)` (positive = the bid rule would have exited higher than the live fill). **PASS = Σ shortfall_avoided > Σ value_forgone over the window; FAIL otherwise.** Both sums published with the row counts; Wilson 95% interval on the discordant RATE reported beside them as precision only.
- **Reading rule:** events are counted from `fg2Shadow.bidFirstExit`/`midFirstExit` on `closed_trades.metadata`, **never from `[SHADOW_ARM]` log lines** (the seed cycle logs one).

**4b. OBJ-5a — per return site (pre-audit §8.7).** Population: post-deploy crypto VTS closes with `exitReason ∈ {stop_hit, target_hit}` in `logs/virtual_trades/*.json`. **PASS = every such row with a live mark books `exitPrice ≠` the trigger where the mark differed**, reported per reason with the traversal count (*n stop_hit, n target_hit, of N closes*); **negative control:** pass-through reasons (`trailing_stop_hit`, `break_even_stop`, `timeout`, `moonbag_timeout`) unchanged. xStock rows reported as HELD. **n-floor 20 clamp-traversing crypto closes or 7 days.**

**4c. OBJ-5b — the reconstruction, by origin.** Population: real (non-shadow) VTS rows opened post-deploy, read from `vts_open_trades.context` (persists on `closed=true`). **PASS = `frictionCost ≈ costEntryFeeFraction + costExitFeeFraction + 2·costSlippageFraction + costSpreadFraction`** (|Δ| < 1e-9) on every row, split **inline / twin / xStock**, and on maker rows `costEntryFeeFraction = 0.0040` while `costExitFeeFraction = 0.0080`. **n-floor 20 rows with at least 3 maker twins.**

**4d. The residual, NAMED (Langston condition a):** after 4b passes, booked friction still carries the 0.05%/leg slippage constant (INVARIANT F2 / Directive 11.3B) against a measured 0.0612%/leg post-clamp residual — object: exit leg, crypto, `stop_hit`, n=21, the adversely-selected tail, not a global figure. **Re-measured at the 09-07 `#951` window (condition b).**

## 5. UNPROVEN, STATED AS UNPROVEN
- The bid-side decision improves outcomes — that is what OBJ-0 measures; nothing here assumes it.
- That mark-booked VTS exits are "realistic": they are closer than the clamp and still biased by ~half a spread (FINDING-1).
- OBJ-5b on real rows: zero post-deploy opens at writing.
- The n-floors above are targets, not guarantees: the crypto VTS open/close cadence today is ~30 closes/day, so 4b/4c should fill in 1-2 days; 4a depends on the bid arm firing at all.

## 6. FINDINGS OUTSIDE THE BATCH, WITH DISPOSITIONS
- **APR/USD active position UNEVALUATED since open (08:07Z):** row never updated, no `ENGINE_PNL_CALC`, no skip line, `withoutPrice=1`, no alert. Boot: `[I7-MAP-FIX][SUBSCRIBE_SKIPPED] symbol=APR/USD no valid mapping`. **Disposition (2): live instance on `#571 B-WS-SUBSCRIBE-BOUNDARY-CLASS` (CC-A recorded it at `4dfa77bfd`); the unevaluated-exit path is the active-engine lane (CC-B), announced once, not followed.**
- **The three overnight `Exit checks skipped` alerts on MDT/USD** (`ae2e739b`, `f1e480b1`, earlier `9c95c179`/`ed033ca8`): the xStock equity-tick arm (`aee:1244`), pre-market thin feed, resolved with the position row id each time after an exposure check; not `#951`'s crypto arm.

## 7. OWED AT CONVERSION (Step 11)
- Langston Step-4 condition 3: state that the open-trades table renders 0.60/0.60 per fee leg on a maker row while `context` carries 0.40/0.80 — same row, two surfaces.
- The 4a-4d results against the criteria AS WRITTEN above, and the decision taken on each.
- Governance: System Impact Map (the shadow arm, `vts-exit-booking.ts`, `composeBookedFriction`, the twin re-price in `planTwin`), System Manual (VTS booking semantics: mark-booked exits, one-maker-leg friction; the seam on xStock), STORAGE/ADJUSTMENT as applicable (epoch bump recorded per `calibration-epoch.ts` amendment 2), `RUNNING_ISSUES` (#914 partially retired — the PRICE half; #943 seam owed), `BATCH_CATALOG`, `PHASE_HISTORY`, `PHASE_19_PLAN`, the scratch master order (row 1 → observation).
