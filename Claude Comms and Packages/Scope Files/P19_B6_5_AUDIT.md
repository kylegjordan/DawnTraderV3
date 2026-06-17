# P19-B6.5b — Crypto Active-Pipeline Accretion-Delta AUDIT (Obj-1)

> **Batch:** P19-B6.5b · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-17 · **Issue:** #235 (carry-ins #320, #321)
> **This is the Obj-1 verification artifact** (per `P19_B6_5_SCOPE.md` §1). READ-ONLY trace of the full crypto active chain vs the Phase-8 baseline + live staging probes. Every "OK" is backed by `file:line`; every per-class DB dependency confirmed seeded for `crypto_spot` on staging.

---

## §0 BASELINE (git archaeology)

Crypto active-paper **last ran end-Phase-8 / start-Phase-9 (~2025-12-29 → 2026-01-01)**. The cleave to VTS/passive-learning is bracketed by: VTS-switch `0863a2c20`/`73485a919`/`ee0e99624` (2025-12-29, "trading activity status became the mode gate"); Phase-8 completion `f06e3d231` (2025-12-30); Phase-9 completion `727d4364c`/`5d27f9d75` (2026-01-02). The cleanest forensic marker is **`594aad717` "Remove legacy risk management and userId parameters" (2026-01-01)** — it deleted the Phase-8 daily-loss auto-trip (`checkKillSwitch`/`calculate24hPL`), which **P19-B6 just restored from `594aad717^`**. The functional baseline = the active crypto path at `594aad717^`; everything since is accretion.

**Accretion layered onto the shared crypto active path since baseline (each = a breakage surface this audit probed):** asset-class-as-schema-dimension (B69 `18372159b`); multi-asset per-class REQUIRED-`assetClass` refactor (B79.0n: storage `c8cb22e1c`, scoring `a177508f2`, orchestrator `5e0856836`); B3a OrderPlacer port + classify alarm (`027d2ddcc`); **B3b landmine fixes** (`d9b312780`); B4a stamp-at-source + xStock wire-in (`89b76c8b8`/`d37e9cc9e`/`da83a48ad`); B4b D5 split-brain isolation (`8901a4e2c`); **B4b.1 depth-walked fill** (`b74526dc3`); B5 capture; B6 daily-loss restore; **B6.5a per-class gate** (`500127614`). Many B4–B6.5a accretions are explicitly **DORMANT-until-B7b** — type-checked + bench-tested but never *runtime*-executed on the crypto active path. That is precisely why a runtime dry-run (Obj-2/3), not compile-checking, is the right instrument.

---

## §1 PER-HOP FINDINGS (front → back of chain)

Legend: **OK** = proven sound for crypto (file:line) · **FIX** = repair in B6.5b · **VERIFY** = prove in dry-run, fix only if reproduced · **HOME** = real but not lifecycle-blocking, gets a named home · **DEFER** = minor/cosmetic.

| # | Hop · file:line | Crypto breakage risk | Verdict |
|---|---|---|---|
| H1 | FX5 tick handler + B6.5a gate · `fx5-scanner.ts:529-598`, gate `:552-563` | Per-class gate is fail-closed; correct logic | **OK** |
| H2 | Universe construction · `market-scanner.ts:556-570` → `kraken.ts:251` (full Kraken spot `AssetPairs`, no class filter) | Could a pure xStock enter the crypto pool + be mis-stamped crypto_spot? | **HOME** (empirically refuted — see §2) |
| H3 | `scanMode` active-pool population · `fx5-scanner.ts:1143,1387` | **Per-class gate does NOT propagate here** — pool population keys on master `isEngineActive`, not the crypto flag | **FIX (#320)** |
| H4 | Active filter pools · `active-filter-pool.ts:262,294,367` | Hardcoded `crypto_spot` stamp (correct for crypto-only pool); orchestrator re-stamps anyway | **OK** (family-pool missing field = **DEFER**) |
| H5 | Orchestrator crypto pipe + stamp-at-source · `signal-orchestrator.ts:1357,197,436-442` | Stamp compile-enforced present + correct; **B3b landmine-2 fix holds** (`:745-746` riskScore/profitRate, `:778-780` observable counter, no ngc write) | **OK** (conditioned on strategy_gates seed — confirmed §3) |
| H6 | SQE · `signal_quality_evaluator.ts:218,613` (`MIN_FINAL_SCORE=0.35`) | Crypto skips xStock weekend/whitelist block; per-class thresholds resolve crypto_spot | **OK** |
| H7 | RTB `queueSQESignal` (sole live insertion) · `ready_to_buy_service.ts:1767,1881` | Throws if assetClass absent (crypto carries stamp); dual asset_class write; ngc-write removed | **OK** |
| H8 | RTB re-eval / promotion · `:1605,1261,1653` | Per-mode refresh key (D5); gates on master `isEngineActive` with explicit "B6.5b per-class re-check deferred" comments (`:593-597,791-793`) | **FIX (#320 defense-in-depth)** |
| H9 | TCL watchdog · `tcl_watchdog.ts:190,259` + capacity gate `trade-safety.ts:571` | Class-blind by design (global pool count); fine for crypto-only | **OK** |
| H10 | Paper-engine OPEN seam · `paper-execution-engine.ts:2120-2126` (class stamp-prefer + safe-resolve, loud-skip on null) | BTC/USD etc. classify cleanly | **OK** |
| H11 | Depth-walk fill + `fill_depth_gate` · `paper-execution-engine.ts:2131-2167` → `order-placer.ts:57` → `depth-walk.ts:44` | Walks live Kraken WS ask book to VWAP (flat slippage retired); single book fetch shared gate+fill; partials handled; crypto book-warmth at open-time is the one thing to watch | **OK** (dry-run watches depth-gate block counter) |
| H12 | Fees · `cost-model.ts:73,114` (`fee_model` crypto_spot taker 0.008) | DB-resolved + boot-asserted (`b72-warmup.ts:156-188`) | **OK** |
| H13 | TEC config + state machine · `trailing-exit-controller.ts:233-432,907-1252` (11-key strict hard-fail; crypto_spot warmed at boot) | Boot hard-fail if any of 11 crypto_spot rows missing — confirmed present §3 | **OK** |
| H14 | Exit evaluator · `tec-evaluator.ts:220-440` | **ATR-zero hole**: hard stop/target short-circuit runs only when `useTrailing===false`; paper passes `true`; trailing engages only when `atr>0` → if `atr_at_open` missing/0, position never closes on stop/target | **VERIFY** (dry-run) |
| H15 | CLOSE + P&L persist · `paper-execution-engine.ts:1169-1472` (`paper_sim_trades.asset_class NOT NULL DEFAULT 'crypto_spot'` `schema.ts:1685`) | Crypto persists crypto_spot by column default + concrete closeReason | **OK** (default-not-stamped = xStock **HOME**) |
| H16 | Cooldown · `trade-safety.ts:206-289` reads `getTrades('paper','closed')` = legacy `trades` table | Active-paper writes `paper_sim_trades` → cooldown reads empty → **silent no-op for paper** | **FIX** |
| H17 | TradeClosed + telemetry archives · `paper-execution-engine.ts:1688`, `exit-decision-archiver.ts:26` | Archives write asset_class=crypto_spot; fire-and-forget (never block close) | **OK** |
| H18 | Daily-loss evaluator (P19-B6) · `daily-loss-budget.ts:123-129,278-360` | Reads `getPaperSimTrades` for paper (correct table); receives realized loss in paper bucket; gated on isEngineActive | **OK** |

---

## §2 ★ THE UNIVERSE / COLLISION FINDING (H2) — empirically resolved

**The worst case (a pure xStock like AAPL leaking into the crypto pool and being traded as crypto) is EMPIRICALLY REFUTED.** Live + archive probes (2026-06-17 staging):

- **Live Kraken `/0/public/AssetPairs` = 1551 pairs; ZERO carry the xStock display form** (base ending lowercase `x`). Kraken does NOT serve Backed xStocks through the crypto REST endpoint the scanner consumes; xStocks ingest only via `exchange='kraken-equities'` (the WS-equities feed).
- **xStock-universe (490 syms) ∩ live Kraken crypto universe, minus the 9 documented collisions = 10 tickers:** `A, ADI, BSX, CAT, ES, IR, STRK, STX, WELL, WEN` (/USD). These are **genuine Kraken crypto tokens** (STX=Stacks, STRK=Starknet, WEN=memecoin, …) that *coincidentally share a ticker* with an xStock-universe entry — not Kraken-listed xStocks.
- **6-month archive ground truth:** every symbol ever stamped `crypto_spot` (ADI, CVX, DASH, MET, OPEN, STRK, STX, SUI) genuinely exists as a Kraken crypto. STX (4213×), STRK (4617×), DASH (41320×), SUI (76266×) have flowed as crypto_spot for months with no break. **No pure-xStock-only ticker (AAPL/TSLA/NVDA…) has EVER been stamped crypto_spot.** The same tickers also flow as `xstock_spot` via the equities feed (A 11153×, CAT 37706×, …) — i.e. the two feeds each correctly stamp their own instrument; there is no cross-contamination.

**Therefore:**
1. **NO universe-exclusion filter** (the kind a naive reading would add). It would WRONGLY drop legitimate crypto STX/STRK/ADI from the active path. The crypto pool is empirically clean.
2. **What IS real:** the resolver's documented `XSTOCK_SPOT_KRAKEN_COLLISIONS` set (`asset-classes.ts:428`) is **stale** — ≥3 confirmed undocumented collisions (ADI, STRK, STX) plus more in the intersection. `resolveAssetClass(sym,'kraken')` returns `xstock_spot` for these (line 576) where the crypto venue has a crypto token. The **active crypto path is unaffected** (stamp-at-source bypasses the resolver), so it does NOT block the lifecycle — but it is a latent mis-resolution for any resolve-on-`kraken` path and a B7b/live concern. There is already a STANDING quarterly re-audit rule for this set (`asset-classes.ts:424`). → **HOME** (collision-set re-audit; surfaced to Langston for fold-in-vs-defer).

---

## §3 PER-CLASS DB SEED — FULLY GREEN on staging (no seeding work needed)

| Dependency | Required | Staging result |
|---|---|---|
| `fill_depth_gate` crypto_spot | 4 rows (warmth 5000ms / sufficiency 3× / min_levels 3 / penalty 50bps) | ✅ 4/4 present |
| `trailing_exit` crypto_spot | 11 keys (boot hard-fail if missing) | ✅ 11/11 explicit crypto_spot rows |
| `fee_model` crypto_spot | taker + maker (boot-asserted) | ✅ taker 0.008 / maker 0.004 |
| `strategy_settings` crypto_spot enabled | crypto strategies enabled | ✅ 8 enabled (vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trading, vwap_bounce, liquidity_trap) |
| `screener_filters` crypto_spot | active_* family + vts_* + pattern + quant | ✅ 14 paths/mode (active_quant has lq_min/vn_max → scanMode non-null) |
| `guardrails_v2` paper | daily-loss + cooldown + max-open | ✅ kill 20.00, warn 50/75, cooldown 5min, max-open 15 |
| `system_context` paper | engine flag + active_asset_classes | ✅ is_engine_active=f, active_asset_classes={} (dormant by construction, both axes) |

**The dry-run needs only:** `setAssetClassActive('…','paper','crypto_spot',true)` + master engine ON. No migration, no seeding.

---

## §4 CLASSIFIED FINDINGS → repair-scope proposal (for Langston Step-2)

**FIX in B6.5b (break-fixes; these ARE the resurrection):**
- **F1 — #320 crypto per-class gate propagation (H3).** Thread the crypto per-class active flag into `scanMode` and AND it into the pool-population gate (`fx5-scanner.ts:1387`) + `enforcePassiveModeIfStopped` (`:1147`) so crypto-OFF (while master ON) actually routes to passive/VTS and clears the active pool — structurally matching the robust xStock active-dispatch gate. **PLUS defense-in-depth** at the single RTB chokepoint `queueSQESignal` (+ the SQE re-eval paths whose comments defer to B6.5b): reject a signal whose stamped `assetClass` is not active for its mode. **#320's carry-in mandate ("prove no signal reaches RTB past the entry gates, else enforce") — the proof FAILED → enforce.**
- **F2 — #321 wire the witness.** Call `witnessAssetClassEmissionWhileInactive` at the F1 defense-in-depth guard so a breach is observable (`recordLivenessSplit`), never silent. (Currently defined-but-uncalled.)
- **F3 — cooldown table re-point (H16).** Re-point `checkSymbolCooldown` for paper mode to `getPaperSimTradesBySymbol` (the pattern daily-loss already uses), keeping the `trades` read for live. Obj-2 requires "cooldown applied," so this is in-scope.
- **F4 — crypto-isolation acceptance test.** Mirror the gate-10 xStock-isolation test: master ON + crypto OFF (+ xStock ON) → zero crypto rows reach `rtb_signals`, orchestrator emits no crypto signal. Proves F1.

**VERIFY in the dry-run (fix only if reproduced):**
- **V1 — ATR-zero exit hole (H14).** If crypto positions reliably carry non-zero `metadata.atr_at_open`, this is OK-with-proof. If an open can carry 0/missing ATR, add a surgical hard-stop/target floor in `evaluateTECExit` (when `useTrailing && atr<=0`, fall through to the stop/target check). The dry-run's full closed lifecycle IS the test.

**HOME (real, not lifecycle-blocking — named home before "handled" per §9.4):**
- **H-a — collision-set re-audit (§2).** RUNNING_ISSUES new entry; decide with Langston whether to fold the validated crypto-side tickers into `XSTOCK_SPOT_KRAKEN_COLLISIONS` now (cheap, satisfies the standing quarterly rule) or schedule. CC lean: home it (per-ticker validation deserves its own focused pass; not crypto-blocking).
- **H-b — paper_sim_trades default-stamp (H15).** Insert relies on the `crypto_spot` column default rather than the resolved `_tradeClass` (`paper-execution-engine.ts:2295` computed, not passed to `:2301`). Correct for crypto; wrong for xStock → xStock-side follow-up home.
- **H-c — dead code (never-leave-legacy rule 18).** `queueSignal` (capacity variant, 0 production callers, no assetClass) + `storage.insertRtbSignal` (0 callers). Delete-on-the-spot in B6.5b OR schedule a dated deletion.

**DEFER (minor):** family-pool missing assetClass field (cosmetic, H4); dup-guard ordering runs after the paper fill (harmless for paper; pre-live Phase-21 polish, H-Cdup).

---

## §5 DRY-RUN PLAN (Obj-2 + Obj-3)

Controlled, time-boxed, **reverted** crypto-only turn-on on staging paper (fake money, internal fills, no real orders):
1. Pre-flight: confirm F1-F4 deployed; confirm depth-gate crypto_spot rows live (done §3); arm daily-loss kill (20%, present); confirm master engine + crypto_spot gate the only ON class, xStock OFF.
2. Flip: `setAssetClassActive('…','paper','crypto_spot',true)` + start paper engine.
3. Observe ≥1 FULL closed crypto lifecycle with evidence at each hop: FX5 admit → orchestrator emit+queue (assetClass=crypto_spot) → RTB rank+promote → TCL admit → paper-engine OPEN (depth-walk VWAP fill, `paper_sim_open_positions` crypto_spot) → TEC manage (crypto_spot config) → CLOSE (exit reason) → `paper_sim_trades` crypto_spot + telemetry archives → cooldown applied → daily-loss evaluator fed.
4. Obj-3 fill-parity: confirm open walked the live ask book (VWAP, not flat), depth gate evaluated (watch `getDepthGateBlockStats` for `crypto_spot:no_book`/`thin_book` first-open warmth), crypto_spot fees applied, close walked the bid book.
5. **xStock-isolation gate** (gate-10): zero xStock signals/opens during the run; `getAssetClassGateStats` shows xStock skips, `LIVENESS_SPLIT` witness = 0.
6. Revert: `setAssetClassActive(...,false)` + stop engine. (The permanent flip is B7b — Kyle-gated. This dry-run flip is staging/paper/fake-money, NOT Kyle-gated.)

---

*Obj-1 audit complete. → P19_B6_5b_PRE_AUDIT.md carries the SIM consultation + the Langston Step-2 questions. On Langston Step-2 PROCEED + repair-scope ruling → Step-3 implement F1-F4.*
