# P19-B7.2c — Step-2 Pre-Audit (post-promotion PENDING maker-fill lifecycle, paper + VTS)

**Owner:** CC-B · **Reviewer:** Langston (Step-2) · 2026-07-01. Grounded in direct source reads (§2.1a) + SIM consult (§9). Centerpiece = R4 (Langston: pass/fail, per-input, both paths).

---

## ★ R4 (CENTERPIECE) — `evaluateTradeExpectancy` input inventory: PASS

`evaluateTradeExpectancy(symbol, tradeMeta, assetClass?, quiet?)` (`server/core/calculations/expectancy.ts:602`). Every input, ruled per Langston's 3-way model (live-recompute / snapshot-persist / derived), for BOTH paper + VTS, with a parity column. **Result: ALL inputs are (live) or (snapshot→persist-typed-col). ZERO category-(c) "can't honestly re-check." Parity holds.**

| Input (kernel reads) | Category | Paper source @ re-check | VTS source @ re-check | Parity | Ruling |
|---|---|---|---|---|---|
| `entryPrice` — **MODE-DEPENDENT** | **FILL event: snapshot** (= `maker_limit_price`) · **CONVERT event: LIVE** (= CURRENT market price — a taker crossing the spread NOW, worse than the limit) | FILL: pending-row `maker_limit_price` · CONVERT: live price (`livePricingAdapter`) | FILL: OVT `maker_limit_price` · CONVERT: live price (priceCache/xstock snap) | 🟢 same | FILL=on-row limit · CONVERT=live current market |
| `fee` / `slippage` / `spread` — **NOT mode-keyed in the kernel today** | live-recompute — the kernel (`evaluateTradeExpectancy`→`getCachedCostMetrics`→`computeTotalRoundTripCost`) prices **TAKER BOTH LEGS UNCONDITIONALLY** (`cost-model.ts:134` `fee: feeRateTaker` hardcoded; §0 :110-112 "the maker-entry flip is future"). The kernel NEVER reads `chosen_entry_mode`/`entry_fee_rate`. | same call (taker-priced) | same call | 🟢 same | live-recompute, taker-priced. **The EV re-check runs ONLY on the CONVERT path** (a maker FILL just opens at limit+maker fee — no kernel re-run); so the convert is correctly taker-priced by the kernel with NO mode swap. The `chosen_entry_mode`→taker / `entry_fee_rate`→taker record write is **ACCOUNTING-only** (the trade record's displayed fee), NOT a kernel input. |
| `stopPrice` | snapshot | pending-row `stopLoss` | OVT `stopLoss` | 🟢 same | on-row |
| `targetPrice` | snapshot | pending-row `takeProfit` | OVT `takeProfit` | 🟢 same | on-row |
| `DI` | snapshot (accuracy modifier; must be the trade's signal-time DI, not a fresh recompute — else we score a *new* trade) | **PERSIST `di_at_open`** (typed) — extends the reorg-B3.1 #378 di_at_open already carried in paper metadata | OVT already carries at-open DI | 🟢 same basis | **PERSIST typed col** |
| `dbsScore` | snapshot (drives the strong-trend pWin floor branch) | **PERSIST `dbs_score_at_open`** (typed) — mirrors `rtb_signals.dbs_score_at_queue` (reorg-B3) | OVT carries at-open DBS | 🟢 same basis | **PERSIST typed col** |
| `VolNoise` | snapshot (kernel defaults 0.3 if null) | **PERSIST `vol_noise_at_open`** (typed; nullable) | OVT/metadata | 🟢 same basis | **PERSIST typed col (nullable)** |
| `sourcePool` | snapshot | carried on signal → pending row `sourcePool` | OVT `sourcePool` | 🟢 same | on-row |
| `assetClass` | live/on-row | pending-row `assetClass` (B69) | OVT `assetClass` | 🟢 same | on-row |
| `pwin_floor` / `pwin_ceiling` / `di_pwin_factor` | **live-recompute** (module_constants, boot-warmed, trade-invariant) | `getCachedNumberRequired` | same call | 🟢 same | recompute |
| `prices[]` (OHLC window) | snapshot ONLY IF used to derive DI/VolNoise when those were null at orig eval | carry in `metadata` (already present) | metadata | 🟢 same | metadata (DI/VolNoise persisted directly makes this moot) |
| `netEV`/`pWin`/`netRewardToRisk` (outputs) | derived | falls out of the above | falls out of the above | 🟢 | derived — no cache |

### ★ Convert-time economics — the REAL kernel mechanism (Langston Step-2, source-verified)
Two facts about `evaluateTradeExpectancy`, verified against source (not the doc):
- **`entryPrice` IS a load-bearing kernel input** (`expectancy.ts:636-638`: `friction = frictionPct · tradeMeta.entryPrice`, flowing into `computeNetExpectancyKernel`; and entry drives the pWin geometry via entry→stop / entry→target). So on a rested-buy convert, entry = **LIVE current market** (worse than the limit) genuinely re-prices R:R downward → the re-check may correctly DROP. **This is the load-bearing half and it's honored.**
- **Fee/slippage/spread are priced MODE-AGNOSTICALLY — TAKER BOTH LEGS, unconditionally** (`getCachedCostMetrics`→`computeTotalRoundTripCost`; `cost-model.ts:134` `fee: feeRateTaker` hardcoded; §0 :110-112 "the model prices taker both legs; the maker-entry flip is future"). The kernel NEVER reads `chosen_entry_mode`/`entry_fee_rate`.

**Consequences (the honest mechanism, correcting an earlier over-claim in this doc):**
- **There is NO fill-time EV re-check.** A maker FILL (trade-through) just OPENS the position at the limit + maker fee — the maker EV was already decided at signal-gen (`decideMakerTaker`→`chosen_net_ev`, carried on the pending). The kernel `evaluateTradeExpectancy` re-runs **ONLY on the CONVERT path** (hard-drop timeout or marketable-at-placement).
- **The convert re-check is CORRECTLY taker-priced BY THE KERNEL, with no mode swap** — because the kernel is hardcoded taker-both-legs. The `chosen_entry_mode`→taker / `entry_fee_rate`→taker write on convert is **ACCOUNTING-ONLY** (the trade record's displayed fee for the now-taker fill) — it does NOT reach the EV kernel. **Do NOT read the earlier "maker rate for fills / mode-keyed fee" wording as an implementer spec; the fee is NOT mode-keyed in the kernel today.**
- So the convert re-check = `evaluateTradeExpectancy(symbol, {entry=LIVE_current_market, stop, target, DI=di_at_open, VolNoise=vol_noise_at_open, sourcePool, dbsScore=dbs_score_at_open}, assetClass)` — entry LIVE (honored), friction taker-both-legs (kernel default). It honestly reflects the worse entry (entry ↑ → smaller reward-to-target + larger risk-to-stop → worse R:R → correctly may DROP). SCORE and FILL happen at the same live-market + taker basis (no split).
- **Safety today is by the kernel's taker-conservatism** (a maker fill, if ever EV-re-checked, would be *over*-charged taker friction → understates EV → never opens a known loser), not by a maker/taker fee swap plumbing through. Correct + conservative.
- **★ FORWARD RISK (§13 home — RUNNING_ISSUES #414):** when the future maker-entry flip makes the kernel mode-AWARE (reads the maker leg), the **CONVERT branch MUST be guarded to keep charging TAKER** — else a maker-fee-priced convert EV re-introduces exactly the optimism this batch avoids. Named now so the flip can't silently break the convert.

**★ Mixed-freshness of the convert re-check — CONSCIOUS DESIGN CHOICE (documented):** on the convert, **entry refreshes LIVE** (fill economics moved; friction is taker-both-legs either way) while **DI (`di_at_open`), VolNoise, dbsScore stay OPEN-SNAPSHOT** (the trade's *thesis* is frozen — we re-check the SAME trade's fill economics, not re-litigate signal quality at timeout). A later reader seeing live entry beside snapshot DI: this is by design.

**R4 verdict: PASS (no category-(c) gap).** `entryPrice` mode-dependent (FILL=snapshot limit / CONVERT=live market) is honored + load-bearing; friction is kernel-taker-both-legs (not mode-keyed today); DI/dbs/VolNoise persist as typed cols; the 3 persist cols extend the reorg-B3 at-queue/at-open pattern (low-risk). Parity holds paper↔VTS.

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
