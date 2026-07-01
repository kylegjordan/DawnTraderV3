# P19-B7.2c — Step-2 Pre-Audit (post-promotion PENDING maker-fill lifecycle, paper + VTS)

**Owner:** CC-B · **Reviewer:** Langston (Step-2) · 2026-07-01. Grounded in direct source reads (§2.1a) + SIM consult (§9). Centerpiece = R4 (Langston: pass/fail, per-input, both paths).

---

## ★ R4 (CENTERPIECE) — `evaluateTradeExpectancy` input inventory: PASS

`evaluateTradeExpectancy(symbol, tradeMeta, assetClass?, quiet?)` (`server/core/calculations/expectancy.ts:602`). Every input, ruled per Langston's 3-way model (live-recompute / snapshot-persist / derived), for BOTH paper + VTS, with a parity column. **Result: ALL inputs are (live) or (snapshot→persist-typed-col). ZERO category-(c) "can't honestly re-check." Parity holds.**

| Input (kernel reads) | Category | Paper source @ re-check | VTS source @ re-check | Parity | Ruling |
|---|---|---|---|---|---|
| `entryPrice` — **MODE-DEPENDENT** | **FILL event: snapshot** (= `maker_limit_price`) · **CONVERT event: LIVE** (= CURRENT market price — a taker crossing the spread NOW, worse than the limit) | FILL: pending-row `maker_limit_price` · CONVERT: live price (`livePricingAdapter`) | FILL: OVT `maker_limit_price` · CONVERT: live price (priceCache/xstock snap) | 🟢 same | FILL=on-row limit · CONVERT=live current market |
| `fee` — **MODE-KEYED (flips maker→taker at convert)** | **FILL event: maker** rate · **CONVERT event: taker** rate (`chosen_entry_mode`→taker + `entry_fee_rate`→taker SWAPPED not inherited) | `getFrictionForAssetClass(class)` → the mode's leg | same call | 🟢 same | mode-keyed: maker for fill, taker for convert (NOT mode-agnostic) |
| `stopPrice` | snapshot | pending-row `stopLoss` | OVT `stopLoss` | 🟢 same | on-row |
| `targetPrice` | snapshot | pending-row `takeProfit` | OVT `takeProfit` | 🟢 same | on-row |
| `DI` | snapshot (accuracy modifier; must be the trade's signal-time DI, not a fresh recompute — else we score a *new* trade) | **PERSIST `di_at_open`** (typed) — extends the reorg-B3.1 #378 di_at_open already carried in paper metadata | OVT already carries at-open DI | 🟢 same basis | **PERSIST typed col** |
| `dbsScore` | snapshot (drives the strong-trend pWin floor branch) | **PERSIST `dbs_score_at_open`** (typed) — mirrors `rtb_signals.dbs_score_at_queue` (reorg-B3) | OVT carries at-open DBS | 🟢 same basis | **PERSIST typed col** |
| `VolNoise` | snapshot (kernel defaults 0.3 if null) | **PERSIST `vol_noise_at_open`** (typed; nullable) | OVT/metadata | 🟢 same basis | **PERSIST typed col (nullable)** |
| `sourcePool` | snapshot | carried on signal → pending row `sourcePool` | OVT `sourcePool` | 🟢 same | on-row |
| `assetClass` | live/on-row | pending-row `assetClass` (B69) | OVT `assetClass` | 🟢 same | on-row |
| `fee` / `slippage` / `spread` | **live-recompute** (deterministic from symbol+assetClass, DB-cached) | `getCachedCostMetrics(symbol, class)` | same call | 🟢 same | recompute at re-check |
| `pwin_floor` / `pwin_ceiling` / `di_pwin_factor` | **live-recompute** (module_constants, boot-warmed, trade-invariant) | `getCachedNumberRequired` | same call | 🟢 same | recompute |
| `prices[]` (OHLC window) | snapshot ONLY IF used to derive DI/VolNoise when those were null at orig eval | carry in `metadata` (already present) | metadata | 🟢 same | metadata (DI/VolNoise persisted directly makes this moot) |
| `netEV`/`pWin`/`netRewardToRisk` (outputs) | derived | falls out of the above | falls out of the above | 🟢 | derived — no cache |

### ★ Convert-time entry economics (Langston Step-2 crux — the R4 table's entry/fee are MODE-DEPENDENT)
The table above froze `entryPrice = maker_limit_price` + treated `fee` as generic-from-class. That is correct **only for the maker-FILL path**. The convert valve's job is a **taker** entry, and its economics differ on BOTH dimensions — nailed here so R4 is truly (c)-free:
- **Maker FILL (trade-through):** entry = `maker_limit_price` (SNAPSHOT), fee = **maker** rate. You got your resting price.
- **Taker CONVERT (timeout OR marketable-at-placement):** entry = **CURRENT market price (LIVE)** — a taker fill crosses the spread NOW, which for a buy whose limit rested below market is a **worse** entry than the limit; fee = **taker** rate (**SWAPPED, not inherited** — the record's `chosen_entry_mode` flips to `'taker'` + `entry_fee_rate` to the taker rate, using the B7.2b cols for exactly this). So the convert EV re-check = `evaluateTradeExpectancy(symbol, {entry=CURRENT_market, stop, target, DI=di_at_open, VolNoise, sourcePool, dbsScore}, class)` with the taker friction — it HONESTLY reflects the worse entry (entry moved up → smaller reward-to-target + larger risk-to-stop → worse R:R → the re-check may correctly DROP). Scoring the convert at the frozen maker limit while filling at market would be the dishonest optimism Langston flagged; we do NOT do that. **So in the R4 table `entryPrice` is SNAPSHOT(=limit) for the maker-fill and LIVE(=current market) for the taker-convert; `fee` is maker for fill, taker for convert — both fully determined, no category-(c).** (The convert both SCORES and FILLS at the same current market price + taker fee — score-and-fill consistency, no split.)

**★ Mixed-freshness of the convert re-check — CONSCIOUS DESIGN CHOICE (Langston Step-2, documented):** on the taker convert, **entry + fee refresh to LIVE** (the fill economics genuinely moved) while **DI (`di_at_open`), VolNoise, dbsScore remain OPEN-SNAPSHOT** (the trade's *thesis* is frozen at open). This is deliberate: the convert valve re-checks whether the SAME trade is still worth taking now that the fill got more expensive — it does NOT re-litigate signal quality at timeout (that would be scoring a different trade). Stated explicitly so a later reader seeing live entry beside snapshot DI knows it's by design: **the convert re-check refreshes fill economics only; signal-quality inputs stay open-snapshot by design.**

**R4 verdict: PASS (all-live / all-persist-typed-col; no (c)-gap; convert-time entry+fee resolved above; mixed-freshness documented).** The **CONVERT** re-check = `evaluateTradeExpectancy(symbol, {entry=CURRENT_market_price, stop, target, DI=di_at_open, VolNoise=vol_noise_at_open, sourcePool, dbsScore=dbs_score_at_open}, assetClass)` at the **TAKER** friction (entry LIVE + fee taker-swapped — NOT the frozen `maker_limit`, which is used only for the maker-FILL trade-through). Identical semantic inputs in paper + VTS, kernel deterministic → the convert valve fires identically across both paths (R2/R5 safe). **The 3 persist cols (`di_at_open`, `dbs_score_at_open`, `vol_noise_at_open`) extend the already-established at-queue/at-open snapshot pattern — low-risk, not net-new architecture.**

## R1 — slot-count race: SAFE by event-loop (no explicit sequencing needed)
- Paper promotion loop reads slots via `storage.getPaperSimOpenPositions(mode).length` — a **fresh DB read** each call (:1730); it captures a snapshot then decrements a LOCAL `openSlots` var per open within the serial loop (:1755) — it does NOT re-read mid-loop. Node's single-threaded event loop runs the promotion tick and the monitor/close tick serially (no true concurrency); a close in another tick can only make MORE slots free, never double-open.
- VTS: `openVirtualTrades` is an in-memory Map; `.delete(id)` is synchronous inside `resolveOpenVirtualTrades`; the next cycle reads `.size` and sees the delete. Naturally safe.
- **Verdict: no locking needed.** OBJ-5's test still asserts the *observable* invariants (drop→frees-slot, fill→holds-slot, no double-count) so a future refactor can't silently break the event-loop assumption.

## R3 — xStock weekend: reuse `isXstockMarketOpenUTC`
- Canonical predicate `isXstockMarketOpenUTC(symbol, tsMs)` (`server/asset_classes/xstock_spot/market-hours.js`, used by `session-lifecycle-controller.ts:207`; symbol-independent post-B-NEW-36). `!isXstockMarketOpenUTC(...)` = inside the Fri-8pm-ET→Sun-8pm-ET closed window. VTS already suspends xStock open trades to `state='weekend_suspended'` (`markAllXstockWeekendSuspended`); paper has NO weekend suspension (VTS-only today).
- **B7.2c use:** an xStock pending maker order must NOT burn `maker_max_pending_ms` (nor hard-drop) inside the closed window (can't honestly fill a shut book). Approach: store `maker_deadline` as an *elapsed-open-market-time* budget OR gate the hard-drop check with `isXstockMarketOpenUTC`. **★ CORRECTION to the read agent's suggestion:** pending is **NOT crypto-only** — the maker/taker decision applies to BOTH classes, so xStock maker-chosen promotions ALSO rest pending (just weekend-aware). The CHECK amendment allows `'pending'` for `closed=false` regardless of class (the weekend-aware deadline handles xStock's closed window).

## Schema plan (typed cols; Q3 discipline)
**`paper_sim_open_positions` (ADD):** `state` varchar default `'open'` (values `'open'`|`'pending'`); `maker_limit_price` numeric; `maker_deadline` timestamptz; `di_at_open` numeric; `dbs_score_at_open` numeric; `vol_noise_at_open` numeric. (fee-mode cols `chosen_entry_mode`/`entry_fee_rate` already present, B7.2b.) **★ CORRECTION to the read agent's E.3 slip:** `state` IS added to `paper_sim_open_positions` — pending is a POST-promotion state on the open-trade record (Kyle's LOCKED model), NOT on `rtb_signals` (that was the wrong-stage machinery STRIPPED in B7.2b).
**`vts_open_trades` (ADD + ALTER):** `maker_limit_price` numeric + `maker_deadline` timestamptz (typed, not context JSON); **AMEND the `vts_open_trades_state_consistency` CHECK** to allow `state='pending'` when `closed=false` (both classes; keep the existing `weekend_suspended → xstock_spot` clause). `rehydrateOpenTrades` filters `closed=false` → pending rows hydrate correctly into `resolveOpenVirtualTrades` (no change). The `context->>'shadow'` predicate is orthogonal (unchanged).
**`module_constants.maker_taker` (ADD knob):** `maker_max_pending_ms` per class (~1h crypto; xStock TBD) + inert tier placeholders; keep `maker_time_budget_ms` (document NEW T1 meaning). Load-time invariant `maker_max_pending_ms ≥ maker_time_budget_ms`.

## Blast-radius — `paper_sim_open_positions` readers (adding `state='pending'`)
| Reader | file:line | Handling for pending |
|---|---|---|
| Monitor loop | paper-execution-engine.ts:786 | process `state IN ('open','pending')`; pending → fill-check pre-pass (OBJ-2), open → normal exit |
| **Promotion slot count** | :1730/:1733 | **pending COUNTS as an occupied slot** (Kyle: "occupies a slot") — the count already includes it (all rows); confirm not filtered out |
| **Portfolio exposure / heat** | paper-portfolio-manager.ts:277/505/559 | **pending does NOT count toward capital exposure** (unfilled = no capital deployed) → filter `state='open'` in exposure math |
| Guardrail AMR open-class count | paper-execution-engine.ts:1781 | pending counts as an occupied concurrency slot (consistent with the slot cap) |
| **Symbol clustering / duplicate guard** (Langston Step-2) | paper-execution-engine.ts:2337-2343 (I7-PM-FOCUS C1) | **pending PARTICIPATES** — the dup guard reads `getPaperSimOpenPositions(mode)` + blocks a new order when any position exists `p.symbol === signal.symbol`; a pending row (in that read) blocks a 2nd order on the same symbol. Confirmed pending is in the clustering guard (not just slot/exposure). Applies to `reentry_cooldown`/`price_past_*` pre-open reasons too where they key on an existing position for the symbol. |
| Active-Trades API + UI | routes.ts `/api/paper-sim/active-trades` + active-trades-v2 | surface pending rows with a PENDING badge (OBJ-6) |
| Diagnostics/validation | aj19b-lifecycle-diagnostic / c13-c14 | pass-through; label pending correctly |

**★ DESIGN DECISION (for Langston Step-2 sign-off):** a PENDING maker order **counts toward the slot/concurrency cap (YES — Kyle's "occupies a slot")** but **does NOT count toward portfolio capital exposure (NO — no capital is deployed until it fills)**. Slots = a concurrency cap; exposure = a capital cap; a resting order reserves concurrency without deploying capital. Recommend adopting this split; flagging explicitly because it touches the portfolio-manager heat math.

## SIM-grounded blast-radius (§9)
- **paper-execution-engine** (SIM Layer 6): upstream RTB queue + live pricing + trade-safety + TEC; downstream paper-sim UI + `paper_sim_trades` + portfolio risk + guardrails; cross-cutting = mode-keyed positions (S1/S4 per-mode). B7.2c adds the pending pre-pass to the monitor + the pending-slot rule to promotion.
- **vts-runner** (SIM Layer 6): upstream market data + rehydrate; downstream TEC + closed archive + learning telemetry; cross-cutting = in-memory `openVirtualTrades` Map (mode-invariant sim). B7.2c adds the pending pre-pass to `resolveOpenVirtualTrades`.
- **trade stores** (SIM): the new columns + state extend the B-NEW-36 state lifecycle + the B7.2b fee-mode cols. SIM update at governance: the pending state + typed maker cols on both stores + the fill-sim + convert valve.
- **maker/taker service** (SIM P19-B7.2/B7.2b entry): B7.2c adds the post-promotion timeout/convert machinery; the decision + fee-mode remain as-is.

## Verdict
**READY TO BUILD — no scope-blocking finding.** R4 PASS (3 persist cols, extends an established pattern), R1 event-loop-safe, R3 helper reusable, the schema ALTER is straightforward, the one design decision (pending: slot=yes / exposure=no) is flagged for Langston. Corrections vs the read agent: pending is both-classes (not crypto-only) + paper `state` IS added (pending is post-promotion, not rtb_signals). Awaiting Langston Step-2 sign-off → implement OBJ-1..7.
