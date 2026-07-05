# P19-B8.2 PRE-AUDIT — Balance policy (Step-2)

**Batch:** P19-B8.2 · CC-B · 2026-07-05 · Scope: `P19_B8_2_SCOPE.md` @ 160f86544 (Step-1 consensus: Langston PASS + resolved CHANGES-NEEDED + §B pins)
**Evidence basis:** direct code reads (file:line below), live Supabase queries (2026-07-05), SIM Cross-Cutting registry §S1/S1-lock/S3 + the B8.1 module-constants semantics note, verification agent sweep (all claims re-verified against source).

## §0 — PREVIOUSLY STATED vs NOW (§9.2)

1. **PREVIOUSLY STATED (Step-1 architectural read): "5 dollar-VIOLATIONS classified for conversion" in the decision path. NOW: ZERO violations in the LIVE decision path. REASON:** the read conflated TWO tables. The LEGACY `guardrails` table (schema.ts:282-305) IS dollar-denominated (`maxDailyLoss` $1000, `maxPositionSize` $5000, `maxRequiredCapital` $100k, `maxRiskPerTradeLimit` $1000) — but the live decision path reads `guardrails_v2` (schema.ts:309-376), whose Core Four are PERCENT (portfolioRiskPerTradePct 1.50%, dailyLossKillSwitchPct 7.00%, maxPositionPercentPct 30%, maxTotalExposurePct 25%). The verified sweep of scanner→regime→strategy→SQE→EV→RTB→sizing found NO account-relative $ threshold: sizing = balance % × guardrail_v2 multipliers; EV gates on normalized figures.
2. **Consequence: the Kyle $→% sign-off list is EMPTY.** No conversions are proposed. The legacy `guardrails` $ knobs are disposed of by the already-scheduled **B6.10 guardrails-v1 retirement** (Phase-19 board), not converted here. B8.2's fence work = the enumerated boundary + the CI test that KEEPS it clean.
3. **PREVIOUSLY STATED: "$25 LPCP floor = exchange min-notional (PERMITTED)". NOW: PERMITTED, but re-labeled honestly** — `lowPriceMinPositionNotional` (guardrails_v2 LPCP.2, schema.ts:349-351; routes.ts:1346 default payload) is OUR order-sizing floor against tiny-price erratic sizing, NOT Kraken physics. It stays in the PERMITTED boundary (order-sizing notional — a % would defeat its purpose) **and is FLAGGED as balance-sensitive:** at $800 it binds ~3% of account, at $80k it's negligible — it is an INPUT to the friction-divergence trigger's discrete min-notional leg (§A), not a fence violation.

## §1 — SIM / blast-radius read (mandatory §2 + the duplication check)

- **S1 `globalPaperPortfolioManager` (single slot, mode='paper' hardcoded) + S1-lock:** OBJ-1/2 touch `routes.ts` start region + `active-engine-service` + `active-portfolio-manager` — ALL inside the S1 cluster. No re-keying attempted here (Phase-21 isolation item); B8.2 changes stay within the existing single-slot semantics.
- **S3 `KrakenService` fragmentation (36 instantiations, per-instance rate-limit state):** OBJ-1 adds a getAccountBalance caller. Discipline: reuse ONE existing service instance path (do NOT add a 37th `new KrakenService()`); the balance fetch is 1 call/start + 60s TTL cache — negligible budget.
- **Module-constants semantics (B8.1):** the new `friction_divergence` + band-bounds + `min_reanchor_interval` knobs inherit swap-on-success/SWR + boot hard-fail-on-zero-rows → the knob rows MUST ship in this batch's seed migration or boot refuses (rule 15 fail-hard is the DESIGN, but the rows must exist).
- **SizingContext.assetClass SSOT (P19-B4a C1):** the per-open divergence call partitions per class — it reads the STAMPED `sizingContext.assetClass`, never re-resolves from symbol (collision-ticker discipline).
- **"Could this live in / does it duplicate an existing component?" (mandatory check):** the friction-divergence estimator REUSES `slippage-fee-model.calculatePriceImpact` ingredients (σ, spread, book walk) but is NOT the same job — slippage-fee-model estimates ONE order's execution cost inside the EV kernel; the divergence module compares TWO hypothetical order sizes for a POLICY trigger. Placement: separate pure module `server/core/math/friction-divergence.ts` taking the SAME cost-metric inputs (fed by the caller — no duplicate book reads, no second σ estimator). It calls into the existing impact math where possible rather than re-deriving. Verified NOT duplicating: SQE (calculation-free gate), the EV kernel (per-signal, not cross-balance), the maker/taker decision service (entry-mode choice).

## §2 — Fence enumeration (FINAL, re-verified per row)

| Threshold | Where | Unit | Classification |
|---|---|---|---|
| guardrails_v2 Core Four | schema.ts:313-340 | % | ALREADY RELATIVE — fence-conformant |
| LPCP `lowPriceMinPositionNotional` $25 + `lowPriceThreshold` $0.50 | schema.ts:342-355 | $ | PERMITTED boundary (order-sizing floor) + balance-sensitive FLAG (§0.3) |
| LEGACY `guardrails` $ set | schema.ts:282-305 | $ | RETIRED-PATH → B6.10 disposition (fence documents, does not convert) |
| screener `minVolume` $1M / `minMarketCap` $100M / `minDepthUsd` | schema.ts:440/450/447 | $ | MARKET-FILTER (asset-own stats) — out of fence scope, documented |
| market-scanner `minLiquidity` $500k | market-scanner.ts:544 | $ | MARKET-FILTER |
| slippage-fee-model breakpoints ($1k/$10k/$50k) | slippage-fee-model.ts:141-144 | $ | PERMITTED (order-relative micro model) |
| `notional` columns (rtbSignals etc.) | schema | $ | computed VALUES, not thresholds — fence-exempt |

**Fence test design:** static-scan leg (the lead): a vitest that walks the ENUMERATED gate modules (strategy-helpers guards, SQE, EV kernel/rtb gates, sizing, TEC exits) and asserts no NEW raw-dollar comparison literal outside the enumerated PERMITTED set (module + line allowlist, so a new $ gate fails the test until deliberately enumerated). Runtime-helper leg: `assertRelativeThreshold()` used at the sizing/gate seams B8.2 touches. **Un-automatable classes get declared at Step-4 per §B-6** — current expectation: the static allowlist covers it; if a gate class proves unscannable it will be named.

## §3 — Start-flow + resume trace (exact current state)

- `POST /api/active-engine/start`: mode='new' → `hardResetActiveEngine('paper')` (routes.ts:11263) → `balance = initialBalance || 800` (:11293 — GHOST) → `updatePortfolioBalance` (:11308) → `startActiveEngine(userId,{startingBalance:balance})` (:11350). mode='continue' skips reset, preserves state.
- **`storage.hardResetActiveEngineTables` (storage.ts:4121-4176) does NOT touch portfolio_state** — it closes open trades (UPDATE closeReason='hard_reset'), DELETEs active_open_positions, stops sessions. The 'new' balance overwrite happens in routes AFTER. OBJ-1 keeps this shape (reset stays balance-agnostic; the Kraken-mirror value flows through the same `updatePortfolioBalance` write).
- **Fail-loud already PARTIALLY exists:** `startActiveEngine` THROWS on missing startingBalance (active-engine-service.ts:541-542 "startingBalance is required"). **Gaps to close (OBJ-2):** (a) `resumeActiveEngines` (:1127-1150) constructs the manager from the session row WITHOUT validating `existingSession.startingBalance` (schema default "10000" nullable — the ghost inheritance vector); (b) `ActivePortfolioManager.start('internal')` balance-read path needs the same refusal on absent/NULL/unparseable. App-layer refusal lands at BOTH seams; NOT NULL constraint = backstop.
- **Ghosts (7, re-confirmed):** schema.ts:1170 `"1000.00"` + :1829 `"10000"` defaults; routes.ts:11293 `800`, :5408 `10000`, :12274 `'1000'`; client paper-trading-controls.tsx `800`s (:38/:71/:100).

## §4 — Live DB evidence (Supabase, 2026-07-05)

1. **`public.portfolio_state` has THREE rows:** paper/$878.00 (default context — Kyle's genuine last entry) · **paper/$25,000.00 (global_context_id b8c1599a… — a GHOST scenario row, last touched 2025-12-30)** · live/$834.11 (stale, 2025-10-16). **Disposition (OBJ-2): delete the $25k ghost row** (it is exactly the wrong-row-pickup hazard) **; the live-mode row's stale value is REPLACED by Phase-21's launch snap** — left in place, documented (live start flow will overwrite; deleting it would NULL-out live-mode reads B8.2 doesn't touch).
2. **`active_engine_sessions`: 0 NULL starting_balance / 141 rows** — NOT NULL migration precheck CLEAN. `portfolio_state.balance` is ALREADY NOT NULL in the live DB — the migration only DROPS THE DEFAULTS (+ adds session NOT NULL, clean per the count).
3. **LEGACY `dawntrader_v2.portfolio_state` schema-copy (4 rows)** exists beside `public` (search_path = public — the app cannot read it). Rule-18 disposition: drop the orphaned legacy-schema table in this batch's migration + DELETED_COMPONENTS_LOG entry (blast-radius: zero code references possible — wrong schema).

## §5 — Kraken balance pin (§B-2)

`getAccountBalance(userId,bypassCache)` (kraken.ts:441-470) returns **`Record<string,string>`** — a PER-ASSET map (Kraken Z/X codes, e.g. `ZUSD`). 60s TTL cache + per-user rate-limit state. **NO existing aggregator-to-single-USD helper; NO existing server decision-path caller** — B8.2 builds the thin helper. **PIN: "the balance" = the FREE USD figure (`ZUSD`, with `USD`/`USDT`-stablecoin handling explicit)** — deployable quote cash, matching what a live engine could actually spend. Non-USD holdings: displayed alongside in the start modal (read-only honesty), NOT summed into the mirror figure v1 (valuing them needs price marks = more surface; Phase-21 revisits if the account holds non-USD at launch). Fail-hard: missing key/timeout/empty map → start REFUSED.

## §6 — Ratio-tag columns (§B-5 + OLD Claude constraints)

- **Precedent confirmed:** the at-open carry pattern is established — `chosenEntryMode`/`entryFeeRate`/`signalType`/`sourcePool`/`tradeMode` flow active_open_positions (schema.ts:1743-1803) → closed_trades (:1652-1740); vts_open_trades has typed cols + context jsonb.
- **New columns (typed, not jsonb — same discipline as B7.2b's promotion of fee-mode out of context):** `balance_ratio_at_open` decimal NULL + `anchor_balance_at_open` decimal NULL + `anchor_version_at_open` integer NULL on `active_open_positions` AND `closed_trades` (carried at close). Pre-B8.2 rows: honest NULL (no backfill, no guessed 1.0). **VTS rows: NO columns added — VTS is explicitly NULL-by-absence** (its breadth mission is balance-independent; adding always-NULL columns to vts_open_trades adds surface with no reader).
- **Sequencing:** `portfolio_anchor_events` (id, mode, occurred_at, old_balance, new_balance, reason ['start_new'|'auto_divergence'|'launch_snap'], anchor_version) + `portfolio_state.anchor_version` int — the START-NEW flow writes anchor v1 BEFORE the engine opens anything, so the first ratio stamp always has an anchor (OLD Claude's trap closed structurally).
- **Reader:** the calibration-fit reader filters in-band via the DB-governed band bounds; out-of-band rows stay queryable (25-16 input). Binary v1.

## §7 — Trigger cadence + cooldown (§B-1/§B-3/§B-4)

Per-open call evaluates THIS open's real paper Q vs the risk-EQUIVALENT live Q (same risk% = the guardrails_v2 `portfolioRiskPerTradePct`); live balance for the comparison comes from the SAME cached anchor-eval read (60s TTL — no per-fill jitter keying). Daily aggregate = median of the session's per-open divergences → B8.3 dashboard row. Knobs (`module_constants friction_divergence`, seeded per-class): `max_divergence_bps`, `min_notional_delta_max`, `min_reanchor_interval_ms`, band bounds for the ratio tag. k carries the bps unit reconciliation (module doc states it). Re-anchor executes: `reanchorToLive(reason)` → portfolio_state.balance := mirror figure, anchor_version++, anchor event row, info alert + Discord note. Cooldown: no re-fire inside `min_reanchor_interval_ms` regardless of divergence.

## §8 — confirm-balance retirement (OBJ-1)

Endpoint routes.ts:11227-11235 = NO-OP since "[41D]" (logs + returns success unconditionally). Client callers: `paper-trading-controls.tsx:152` + `confirm-balance-modal.tsx:80`. Retirement: endpoint deleted; `ConfirmBalanceModal` REPURPOSED as the read-only Kraken-mirror confirm (displays fetched figure + per-asset breakdown; Confirm proceeds, no free-text); DELETED_COMPONENTS_LOG entry for the endpoint.

## §9 — #410 final key map (OBJ-6)

Shared keys already emitted by BOTH: lastScan, rolling24h, vtsEvaluation, guardDrops, trackerStartedAt, lastCycleVtsEval, ok, schema. **Crypto-only:** `signalRejections`, `tradesOpened24h`; **xStock-only:** `xstockScanner`, top-level `timestamp`. Harmonization: xStock endpoint ADDS `tradesOpened24h` (now MEANINGFUL — the B7.2d xStock VTS lane opens real vts_open_trades rows; same DB-backed query, asset_class='xstock_spot') and `signalRejections` (from the eval-cycle reject accumulators; emit zeros-with-shape if a reason-class doesn't exist for xStock — honest, not fabricated); crypto ADDS top-level `timestamp`. `xstockScanner` STAYS as a documented class-specific extension (crypto has no scanner-lifecycle equivalent). Client: the dual-shape reads in `vts-shared.tsx`/panel retire; schema versions bump (v1.7 / v2.2).

## §10 — Open items for Langston Step-2 review

1. The **$25k ghost-row delete** + **stale live-row leave-in-place** dispositions (§4.1) — agree?
2. The **legacy `dawntrader_v2` schema-table drop** in this batch vs deferring to a housekeeping batch (my position: this batch — it is balance-table legacy, exactly this batch's domain, rule-18 on-the-spot).
3. **VTS gets NO ratio columns** (NULL-by-absence) vs adding always-NULL columns for schema symmetry (my position: no columns — no reader, no surface).
4. **ZUSD-free-cash pin** (§5) vs total-equity-valued — v1 free-cash, non-USD displayed-not-summed.
5. Fence-test allowlist mechanics (§2) — static-scan leg design.
