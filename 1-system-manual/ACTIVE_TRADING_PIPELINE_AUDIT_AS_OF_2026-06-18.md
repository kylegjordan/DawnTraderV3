# ACTIVE TRADING PIPELINE AUDIT — CRYPTO — *as of 2026-06-18*

> **What this is.** A single, navigable, decision-point-by-decision-point map of the **crypto (`crypto_spot`) ACTIVE trading line**, in pipeline order: scan → filters → signal generation → SQE → RTB → TCL → open/EV → TEC → close. For every gate/filter/decision it records: **what it gates on · its threshold · where that value is fed from (DB table / config / hardcoded constant) · current behavior · intended (Nov‑2025) behavior**. Built because, after the ~6‑month active‑trading gap, we keep hitting "cobwebs" one at a time; this is the map that lets us stop guessing.
>
> **Keep the as‑of date current.** Update the heading date whenever this doc is materially revised. Decision‑point IDs (e.g. `[F2]`) are stable and greppable — reference them in scopes/issues.
>
> **Review chain (Kyle‑set):** CC‑B (author) DRAFT → **Claude Old (CC‑A)** pours through → CC‑B + CC‑A CONSENSUS → **Langston** 3rd/final scrutiny. **Status: 3‑WAY APPROVED 2026‑06‑18 — REVIEW CHAIN COMPLETE.** CC‑B draft → CC‑A consensus (independently re‑verified H1/H3/H4/H7 vs code + a fresh `module_constants` query; added the friction‑safety‑buffer detail, §11) → **Langston APPROVED** (spot‑checked the load‑bearing claims vs the live tree HEAD `a93e274c8`; confirmed §14 zero‑callers; added the H2/V1 sharpenings folded in below). **Remaining:** in‑doc wording fixes (done), ONE decision to Kyle (§15 item 2(ii) — the gate‑10 structural choice), and §13 homes for the surfaced items.
>
> **Sources:** live code = **ground truth** (every `file:line` below is from the current `migration/aws-supabase` tree); cross‑read against `SYSTEM_IMPACT_MAP.md`, `SYSTEM_MANUAL.md`, and the Nov‑2025 Bridge‑canonical docs (`bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md`, `…_Mathematical_Architecture_v1.5.0.md`, `…_Complete_Project_History.md`) for the *intended* design. **Live DB values** confirmed by direct query of `module_constants` on staging 2026‑06‑18.
>
> **Meta‑principles (Kyle).** (1) **Nothing from Nov‑2025 is binding** — "intended" columns are reference, not a mandate; every divergence is a *fresh* decision. (2) **DEDUP** — where the audit finds a thing we planned to build is *already built* (even differently, but as/more effective), it is struck from the implementation plan (see §9).

---

## TABLE OF CONTENTS
- §0 — How verified (firsthand vs agent‑mapped)
- §1 — **HEADLINE FINDINGS** (read first)
- §2 — The pipeline at a glance (ordered map)
- §3 — Stage A: Scan + Universe + Recognition `[A*]`
- §4 — Stage B: Signal generation + inline NetEV filter `[B*]`
- §5 — Stage C: SQE (Signal Quality Evaluator) `[C*]`
- §6 — Stage D: RTB (Ready‑To‑Buy) queue `[D*]`
- §7 — Stage E: TCL (Trade Criteria Limiter) promotion `[E*]`
- §8 — Stage F: Open path — guardrails → EV gate → sizing → depth → fill → insert `[F*]`
- §9 — Stage G: Position management + TEC exits `[G*]`
- §10 — Stage H: Close `[H*]`
- §11 — **The EV / friction deep‑dive** (the blocker, with verified numbers)
- §12 — **Resolved answers to the five open questions** (a)–(e)
- §13 — Current‑vs‑intended (Nov‑2025 canon vs live)
- §14 — Dead / legacy code surfaced (DEDUP + removal candidates)
- §15 — Implementation‑plan implications (what changes)
- §16 — Open verification items
- §17 — Redundancy verdict (is this doc redundant with SIM/Manual?)

---

## §0 — How verified

| Mark | Meaning |
|---|---|
| ✅**V** | Verified firsthand by CC‑B reading the file/line or querying the live DB this session. |
| 🔎**M** | Mapped by a read‑only research agent; load‑bearing claims spot‑checked, but CC‑A/Langston should re‑confirm during review. |

Firsthand‑verified (✅V) this session: the EV kernel math (`net-expectancy-kernel.ts`), the expectancy gate (`expectancy.ts`), the inline NetEV filter (`signal-orchestrator.ts:2137‑2182`), the friction formula + fee source (`cost-model.ts`), the b45 fee migration, and the **live DB** `module_constants` values (pwin floor/ceiling, di_pwin_factor, crypto/xstock fees). Everything else is 🔎M from the segment agents.

---

## §1 — HEADLINE FINDINGS (read first)

> **CC‑A consensus note (2026‑06‑18):** Claude Old independently re‑verified **H1, H3, H4, H7** against the code and his own fresh `module_constants` query (same values: pWin floor 0.40 / ceiling 0.60 / di_factor 200; taker 0.008 / maker 0.004) and AGREED on all four plus the §15 re‑frame.
>
> **Langston final verdict (2026‑06‑18): APPROVED.** Spot‑checked the load‑bearing claims vs the live tree (HEAD `a93e274c8`). Confirmed §14 zero‑callers (both dead pairs). Three sharpenings, folded in: (1) **H2** — the strong‑trend dbsScore path caps at the SAME 0.60 ceiling, so it is *parity restoration*, not a crypto opener; (2) **V1/§12(d)** — corrected "sourcePool never threaded" → the consumption path IS wired (kernel branch + `expectancy.ts:586` forward + open‑gate read); the values are dropped at the RTB→promote **metadata plumbing**, so #233 is **one fix‑site**, not two; (3) confirmed **V2** (pattern bypasses HF9 — explanatory, non‑blocking), **V3** (two fee sources, low‑sev), **V5** (no regime‑flip exit; intent is a fresh decision, needs a home).

**H1 — The crypto EV‑reject is STRUCTURAL, not an input bug. Fixing the placeholder EV inputs (#233) will NOT, by itself, open a crypto trade.** ✅V
The Net‑Expectancy gate honestly rejects crypto because **friction (~1.8% round‑trip, dominated by the 1.6% taker fee) exceeds the edge**. The win‑probability is *already at its ceiling*: `pWin = clamp(0.40 + DI/200, 0.40, 0.60)`, and the default `DI=50` yields `0.65 → capped 0.60`. Live DB confirms `pwin_ceiling = 0.60`. Threading the *real* DI only changes pWin if real DI < 40 (which would *lower* it). **So the DI input fix gives zero upward lift.** This **reverses the B6.5e/B6.5g premise** ("fix the EV inputs and crypto will clear the gate"). The levers that actually open crypto are friction (maker‑fee execution 0.8%→0.4%, already scaffolded), target/stop **geometry** (larger reward‑to‑risk), and/or the **pWin ceiling** re‑decision — *not* input threading. (#233 is still worth fixing for **accuracy** and for the strong‑trend path — see H2 — but it is not the gate‑10 lever.)

**H2 — There is one place #233 *does* matter: the strong‑trend (`quant-strong_trend`) path.** ✅V
For that sourcePool the kernel derives `pWin = clamp(0.40 + |dbsScore|/2, 0.40, 0.60)`. The dropped `dbsScore` defaults to 0 → **pWin = 0.40 (the floor)**, *worse* than the standard path's 0.60. Threading a real `|DBS|≥0.35` would lift it toward 0.60. **But** `sourcePool` itself is also not threaded into the open‑path metadata, so today even strong‑trend signals are scored on the DI path. So the dbsScore fix only helps *after* sourcePool is also threaded.

**H3 — The "live TCL" is NOT `criteria-limiter.ts`.** 🔎M
`server/core/criteria-limiter.ts` (the `CriteriaLimiter` class literally labeled "Directive 11.0B") is **dead — zero callers**. The live promotion logic is `paper-execution-engine.ts → checkRtbPromotion()` → `ready_to_buy_service.ts:getRankedSignals()`, which sorts on **`finalScore`**. TCL is a **mechanical slot‑limiter + exposure filters (pair‑dedup, AMR), not a quality gate** — matching the Nov‑2025 intent.

**H4 — Ranking on `rankingScore` is a no‑op today.** 🔎M
`rankingScore` is computed by `computeRankingScore()` in exactly **one** place — `vts-runner.ts:4528` (the VTS/passive path). It is **never computed on the active path**; at RTB insert `rankingScore = input.rankingScore ?? finalScore` and the orchestrator never sets it → **`rankingScore` is stored equal to `finalScore`**. The `rankingScore`‑aware ranker (`getTopSignal`/`checkForPromotion`) is also **dead**. So Kyle's "TCL should rank on rankingScore" is a valid *intent*, but **switching the sort field alone changes nothing** until `computeRankingScore` is wired into the active orchestrator/RTB insert.

**H5 — The active scan ignores `crypto-universe-filter.json` entirely.** 🔎M
That config (`allowedQuotes: ["USD","USDT","USDC"]`) is consumed only by the **passive‑archive** loader (`universe-loader.ts`, run by the b74 daily OHLC cron) — **never by the active scan**. The active scan ingests the full raw Kraken ticker universe and excludes only **stablecoin/stablecoin** pairs via a hardcoded regex. **There is NO crypto‑quoted‑pair exclusion on the active path** → the proposed B6.5f crypto‑quote eligibility gate is **NOT redundant** (it closes a real, open gap).

**H6 — Two NetEV checkpoints, near‑identical verdicts.** ✅V
An inline `[HF9][NetEV]` filter at signal generation (`signal-orchestrator.ts:2144`, **real** DI) and the `[11.8B]` open‑path gate (`expectancy.ts:598`, **defaulted** DI). Both read the **same** friction (`getCachedCostMetrics`) and the **same** pWin params. Because real DI ≥ 40 caps at the same 0.60, the two are mathematically near‑identical (the inline one is only *stricter* when real DI < 40). **Open question (§16‑V4):** the dry‑run promoted pattern signals that were then `[11.8B]`‑rejected — confirm whether the **pattern path bypasses** the inline `[HF9]` filter (which lives in the quant `evaluateSymbol` path), which would explain how a signal reaches the open gate at all.

**H7 — The Kraken fee tier IS built in and is NOT stale.** ✅V
Migration `2026-06-11-b45-fee-model-tier1.sql` seeds `crypto_spot` (and `xstock_spot`) `spot_taker_fee = 0.008` (0.80%), `spot_maker_fee = 0.004` (0.40%) — Kraken cross‑platform **Tier 1** (account‑wide). Live DB confirms these exact values. This is the *intentionally conservative* current tier, not an old/stale rate. The high friction is honest, not a bug.

**H8 — No auto‑onboarding for new pairs.** 🔎M
The symbol recognizer/canonicalizer is entirely hand‑maintained hardcoded lists (`knownQuotes` = 8 entries, missing ~15 live Kraken quotes). An unrecognized quote → classify fall‑through → signal skipped (`asset-classes.ts:600` throw → `safeResolveAssetClass` null + alert). No fetch‑unknown‑pair → learn → reprocess loop exists.

---

## §2 — The pipeline at a glance (ordered)

```
 KRAKEN UNIVERSE (raw ticker)                         active gate: system_context.active_asset_classes.crypto_spot
   │                                                  AND system_context.isEngineActive  (today: crypto OFF → dormant)
   ▼
[A] SCAN (market-scanner → fx5-scanner)               full universe; numeric filters only; NO universe-filter.json; NO classify here
   │   A1 active/passive filter-row select
   │   A2 fetch full Kraken universe (no quote filter)
   │   A3 adaptive batch (~300 syms) + benchmark force-inject
   │   A4 already-active skip
   │   A5 stablecoin/stablecoin exclusion (hardcoded regex)   ← only quote-aware exclusion on active path
   │   A6 DBS-aware threshold routing (|DBS|≥0.35)
   │   A7 minVolume / A8 minPrice / A9 maxSpread / A10 minHistoryDays  (all DB screener_filters)
   ▼
[B] SIGNAL GENERATION (signal-orchestrator.evaluateSymbol)
   │   B1 EXTREME_NOISE veto (VN)   B2 regime→allowed strategies   B3 family filter
   │   B4 run EVERY allowed strategy → push a signal each  (NOT one-best)
   │   B5 inline [HF9] NetEV>0 filter (REAL DI)            ← quant path
   ▼
[C] SQE (signal_quality_evaluator)                    THE quality gate
   │   C1 FinalScore floor (0.35 quant / 0.45 pattern)   C2 RegimeWeight floor (0.30)
   │   C3 regime-aware ROI gate   C4 confidence floor   C5 AMR admission   C6 governance gate
   ▼
[D] RTB QUEUE (ready_to_buy_service.queueSQESignal)   holding queue; finalScore persisted; rankingScore = copy of finalScore
   ▼
[E] TCL PROMOTION (paper-execution-engine.checkRtbPromotion → getRankedSignals)
   │   mechanical: open-slot count (max 15) → sort by finalScore desc → slice
   │   exposure filters: pair-dedup, per-class AMR     (NOT a quality re-gate)
   ▼
[F] OPEN PATH (paper-execution-engine.executeSimulatedTrade)
   │   F1 guardrail risk   F2 ★[11.8B] Net-Expectancy gate (defaulted DI)  ← THE BLOCKER
   │   F3 sizing valid   F4 classifiable   F5 depth/liquidity gate (24/5 book-depth)
   │   F6 fill (OrderPlacer depth-walk VWAP)   F7 dup-position   F8 insert paper_sim_trades
   ▼
[G] POSITION MGMT + TEC (tec-evaluator / trailing-exit-controller)
   │   G1 hard stop   G2 hard target   G3 BE latch (crypto: OFF)   G4 moonbag (crypto: OFF)
   │   G5 trailing stop   G6 time-based   (NO regime-flip exit)
   ▼
[H] CLOSE (paper-execution-engine.closePosition → OrderPlacer.closeOrder)  never depth-gated; PnL net of fees
```

---

## §3 — Stage A: Scan + Universe + Recognition `[A*]`
*Primary files:* `server/services/market-scanner.ts`, `server/services/fx5-scanner.ts`, `server/services/adaptive-scan-manager.ts`, `shared/asset-classes.ts`, `server/services/utils/symbol-canonicalizer.ts`. *Active per‑class gate:* `fx5-scanner.ts:558‑563` (reads `system_context.active_asset_classes`, fail‑closed default‑OFF). 🔎M

| ID | Decision point | file:line | Gates on | Threshold / value | Value source | Current behavior |
|---|---|---|---|---|---|---|
| A0 | Per‑class active gate | fx5-scanner.ts:558 | `crypto_spot` active AND engine active | bool, fail‑closed OFF | DB `system_context.active_asset_classes` (JSONB) | OFF today → scan runs passive/VTS |
| A1 | Active‑vs‑passive filter rows | fx5-scanner.ts:698‑749 | `isEngineActive` | n/a | DB `system_context.isEngineActive` | active → `active_quant`/`active_pattern` rows; else `vts_*` |
| A2 | Fetch full Kraken universe | market-scanner.ts:556 | tradable pair | **no quote/crypto‑quote filter** | Kraken REST Ticker+AssetPairs | ALL tradable pairs enter |
| A3 | Adaptive batch + benchmark inject | adaptive-scan-manager.ts:182‑291 | telemetry rank + benchmark force‑inject | `BATCH_SIZE=300` | `system-guards.ts` + telemetry DB | ~300 syms/cycle |
| A4 | Already‑active skip | market-scanner.ts:757‑769 | already held | n/a | in‑mem pool + DB `getActiveTrades(mode)` | skips held pairs |
| **A5** | **Stablecoin/stablecoin exclusion** | market-scanner.ts:637, 773 | strict stable/stable regex | `^(USDT\|USDC\|DAI\|PYUSD\|USDE)/(USD\|EUR\|USDT\|USDC\|DAI)$` | **hardcoded** (`isStablePairRegex`) | excludes only stable/stable; **NOT crypto‑quoted pairs** |
| A6 | DBS‑aware routing | market-scanner.ts:778 | `|DBS| ≥ 0.35` | `B63_STRONG_DBS_THRESHOLD=0.35` | **hardcoded** + DB `active_strong_trend` | strong‑DBS → relaxed globals |
| A7 | Min volume (USD) | market-scanner.ts:789 | `vol24h_USD < min` | default `1,000,000` | DB `screener_filters.minVolume` | reject below |
| A8 | Min price | market-scanner.ts:797 | `price < min` | default `0.01` | DB `screener_filters.minPrice` | reject below |
| A9 | Max bid‑ask spread | market-scanner.ts:804 | `spread% > max` | default `1.00` | DB `screener_filters.maxBidAskSpread` | reject wide |
| A10 | Min history days | market-scanner.ts:811 | age `< min` | default `30` | DB `screener_filters.minHistoryDays` | null age → conservative FAIL |
| A11 | Pattern dual‑path | market-scanner.ts:900‑1015 | relaxed pattern thresholds | DB `active_pattern` row | DB `screener_filters` | second pass → `patternSurvivors` |

**Recognition / classify (where "unrecognized" bites):** the scan itself does **not** classify — it treats everything as `crypto_spot` and filters on numbers. Classification happens **downstream**. `resolveAssetClass` (`asset-classes.ts:542‑609`) throws on an unknown kraken spot symbol (drop point **`asset-classes.ts:600‑602`**); `safeResolveAssetClass` (`:650‑667`) catches, increments `_classifyFallthroughCount`, logs `[B69][CLASSIFY_FALLTHROUGH]`, fires the `classify-fallthrough-active` alert, returns `null` → caller skips. Canonicalizer `knownQuotes` (`symbol-canonicalizer.ts:151`) = `['USD','USDT','EUR','GBP','JPY','CAD','AUD','CHF']` — **8 entries; ~15 live Kraken quotes missing** (USDC, DAI, EUROP, PYUSD, RLUSD, XBT, ETH, SOL, …), and the suffix match is **array‑order first‑hit, not longest‑first** (the `ETHPYUSD→USD` mis‑split risk). **No auto‑onboarding** anywhere.

---

## §4 — Stage B: Signal generation + inline NetEV filter `[B*]`
*Primary file:* `server/services/signal-orchestrator.ts` (`evaluateMarket` :1254, `evaluateSymbol` :1620, `buildSizedSignalForStrategy` :415). 🔎M / ✅V where noted.

| ID | Decision point | file:line | Gates on | Threshold | Source | Current behavior |
|---|---|---|---|---|---|---|
| B1 | EXTREME_NOISE (VN) veto | signal-orchestrator.ts:1679 | `VolNoise > vnMax` | `0.93` | DB `screener_filters.vn_max` (fallback `'0.93'`) | per‑symbol pre‑filter |
| B2 | Regime → allowed strategies | :1712 | strategy ∈ regime set | set membership | MCE regime → `CANONICAL_REGIME_STRATEGY_MAP` | **runs ALL allowed, not one‑best** |
| B3 | Family filter | :1720 | family survived scan | n/a | `STRATEGY_FAMILY_MAP` + filter pools | intersect |
| B4 | Per‑strategy detect → push | :1771 + detect blocks | structural validity | n/a | strategy detectors | one signal pushed **per** strategy |
| **B5** | **Inline `[HF9]` NetEV>0 filter** | :2144‑2175 ✅V | `netEV ≤ 0` → drop | `netEV > 0` | **REAL DI** (`calculateDirectionalIntegrity(closePrices)` :2156) + `getCachedCostMetrics` friction + module_constants pWin params | quant‑path EV pre‑filter; emits `[HF9][NetEV]` (NOT `[11.8B]`) |
| B6 | Strategy validation | :2239 | price/stop/target sanity, long‑only | structural | hardcoded | drop malformed |
| B7 | Stamp‑present (fail‑loud) | :441 | missing `sizingContext.assetClass` | required | compile + runtime backstop | throws |
| B8 | Per‑class strategy gate | :458 | strategy disabled for class | bool | DB `strategy_gates` | block non‑enabled |
| B9 | Zero‑size gate | :523 | `quantity/value ≤ 0` | `> 0` | sizing helper | drop zero‑sized |

**Note:** confidence‑modulation chain (B67/B68, :813‑1098) runs for **ablation telemetry only** — does NOT gate; mostly no‑ops on active because `ohlcData` isn't attached. **#233 drop point starts here:** `:769‑772` writes `metadata = { strategyWeight, exposureBias }` only — **DI / VolNoise / prices / dbsScore / sourcePool are never written into the queued signal**, though DI/dbsScore exist in scope at that point. ✅V

---

## §5 — Stage C: SQE `[C*]`
*Primary file:* `server/core/filters/signal_quality_evaluator.ts` (`evaluate` :218). 🔎M. **This is THE quality gate.**

| ID | Gate | file:line | Gates on | Threshold | Source | Notes |
|---|---|---|---|---|---|---|
| C1 | FinalScore floor | :316 | `finalScore < min` | quant `0.35` / pattern `0.45` | DB `screener_filters.final_score_min` → `module_constants sqe_config.min_final_score` → static `0.35` | core gate |
| C2 | RegimeWeight floor | :321 | `regimeWeight < min` | `0.30` | same 3‑layer chain | core gate |
| C3 | Regime‑aware ROI gate | :327‑350 | `!isSignalProfitable` | dynamic ROI × predictiveConf | `getDynamicROIThreshold`; fee = `getFrictionForAssetClass().feeRateTaker` | only when entry/target/regime present |
| C4 | Confidence floor | :355 | `!meetsConfidenceFloor` | mode overlay | `strategy-modes` overlay | **fed cold‑start `regimeStability` defaults on active** (see below) |
| C5 | AMR admission | :370‑383 | per‑class AMR `disabled/shadow/active` | per‑class | `amr-gates` (DB) | default shadow → no real block today |
| C6 | Governance gate | :392‑398 | strategy eligibility vs stability/dependency | n/a | `strategy-governance` | blocks dependents in unstable regime |

**FinalScore formula** (`score-calculator.ts:44`, weights `SCORE_WEIGHTS.FINAL_SCORE`): `finalScore = hybridScore·0.40 + confidence·0.30 + regimeWeight·0.20 − decayPenalty·0.10` (on active path `hybridScore` defaults to `confidence`, `decayPenalty=0`). Persisted to `rtb_signals.final_score`, recomputed‑with‑decay on every RTB refresh. **Placeholder inputs on active:** `regimeStability` built from hardcoded `computeGlobalStability(0.5, 0, confidence)` (`signal-orchestrator.ts:638`), `trendStrength: 0.5` hardcoded (`:661`, `:561`), volatility default `0.3`. These feed C4/C6 and `regimeWeight`→`finalScore`. 🔎M

---

## §6 — Stage D: RTB queue `[D*]`
*Primary file:* `server/core/rtb/ready_to_buy_service.ts`. 🔎M

| ID | Decision point | file:line | Gates on | Threshold | Source | Behavior |
|---|---|---|---|---|---|---|
| D1 | Admission (`queueSQESignal`) | :1712 | already‑SQE‑qualified (trusted; no re‑gate) | — | upstream SQE | upsert `rtb_signals` status=`queued`/`reconfirmed` |
| D2 | Stamp throw | :1764 | missing `assetClass` | required | — | fail‑loud |
| D3 | Per‑class active gate (defense‑in‑depth) | :1781 | class not active | bool | DB `system_context` | reject if class OFF |
| D4 | Dedupe / active‑position | :1727, :1744 | duplicate pair / existing lower‑score | finalScore compare | rtb_signals rows | keep higher finalScore |
| D5 | Persist scores | :1797 (rankingScore), :1816 (finalScore) | — | — | — | `rankingScore = input.rankingScore ?? finalScore` → **= finalScore on active**; no `ranking_score` column (metadata only) |

`refreshAndRank` recomputes **finalScore** (with decay) but **not** rankingScore. ✅V (via H4 trace).

---

## §7 — Stage E: TCL promotion `[E*]`
*LIVE file:* `server/services/paper-execution-engine.ts:1716` `checkRtbPromotion()` → `ready_to_buy_service.ts:1634` `getRankedSignals()`. **`server/core/criteria-limiter.ts` (CriteriaLimiter class) is DEAD — zero callers** (see §14). 🔎M

| ID | Decision point | file:line | Gates on | Threshold / value | Source | Behavior |
|---|---|---|---|---|---|---|
| E1 | Promotion triggers | paper-execution-engine.ts:247‑308 | TCL_ACTIVATED / TRADE_CLOSED / 30s loop | 30s `CONTINUOUS_PROMOTION_INTERVAL_MS` | events + watchdog | failsafe so signals promote |
| E2 | Warm‑up gate | :1719 | `tclWatchdog.isActive(mode)` | warmup state | `tcl_watchdog.ts` | skip if not warm |
| **E3** | **Slot computation (the "15")** | :1727‑1735 | open positions vs max | `maxTrades = maxOpenTrades \|\| 15` | DB `guardrails_v2.max_open_positions` (`guardrail-settings.ts:187`); **15 is the engine fallback** | `openSlots = max − open` |
| E4 | Ranked fetch | :1740 → rtb:1634 | top‑N queued | `limit = openSlots` | — | by finalScore |
| E5 | Refresh + pair/active filters | rtb:1647‑1662 | not refreshing; no held pair | runtime | sets | drop in‑flight / held |
| **E6** | **Sort / rank** | rtb:1665‑1669 ✅V | `finalScore` desc | `parseFloat(final_score)` | DB `rtb_signals.final_score` | `sort()` then `.slice(limit)` |
| E7 | Per‑signal AMR re‑check | :1762‑1793 | per‑class AMR hard‑pause / slot cap | per‑class | `amr-gates.ts` (DB) | blocked → DEFER (stays queued) |
| E8 | Dup‑position guard | :2225‑2240 | existing position same symbol | runtime | — | skip |

**Verdict:** TCL **limits + applies exposure filters (pair‑dedup, AMR), does NOT quality‑gate** (no re‑check of finalScore/confidence/EV — explicit comment `:1757` "Duplicate FinalScore check REMOVED — SQE already enforces"). Ranks on **finalScore** (E6, ✅V). See §12(a).

---

## §8 — Stage F: Open path `[F*]`
*Primary file:* `server/services/paper-execution-engine.ts` (`executePromotedSignal` :1837 → `processSignal` :2716 → `executeSimulatedTrade` :1890). Each post‑guardrail failure now records `rtbMetricsService.recordOpenFailed(symbol, strategy, STAGE, reason)` and returns a typed `OpenOutcome` (P19‑B6.5e). 🔎M / ✅V where noted.

| ID | Gate | file:line | Condition / threshold | Source | openFailed stage |
|---|---|---|---|---|---|
| F0 | DryRun skip | :1916 | dry‑run flag | runtime | (pre‑attempt) |
| F1 | Guardrail risk | :1959 | daily‑loss / max‑position / max‑exposure / kill‑switch | DB `guardrails_v2` | (recordBlock) |
| **F2** | **★[11.8B] Net‑Expectancy gate** | :2035‑2077 ✅V | `evaluateTradeExpectancy().isTradeable` ⇔ `netEV > 0` | EV kernel (§11); **defaulted DI=50** | `EV_REJECT` |
| F3 | Sizing valid | :2120, :2132 | `portfolioValue>0`, `quantity>0` | cycleContext/settings | `SIZING_INVALID` |
| F4 | Classifiable (pre‑fill) | :2140 | `asValidAssetClass ?? safeResolveAssetClass != null` | stamp/canonicalizer | `UNCLASSIFIABLE` |
| F5 | Depth/liquidity gate | :2150 | 24/5 book‑depth‑sufficiency + warmth, fail‑closed | DB depth config + L2 book | `DEPTH_GATE` |
| F6 | Fill (OrderPlacer VWAP) | :2162 | rejected / non‑filled / qty 0 | OrderPlacer + book asks | `FILL_REJECTED` (partial → size‑down) |
| F7 | Dup‑position | :2223 | existing open same symbol | DB open positions | `DUP_POSITION` |
| F8 | Insert | :2335, catch :2636 | DB insert throws | DB `paper_sim_trades` | `TRADE_INSERT_ERROR` |

**F2 is the blocker.** Note the **depth gate (F5) replaced the B4a RTH clock** (Kyle 2026‑06‑15: gate on book‑depth 24/5, not a clock). The depth gate is **never** reached today because F2 rejects first.

---

## §9 — Stage G: Position management + TEC exits `[G*]`
*Primary files:* `server/services/tec-evaluator.ts` (`evaluateTECExit`, invoked `paper-execution-engine.ts:1029`), `server/services/trailing-exit-controller.ts`. R‑multiple constants from `module_constants` module `trailing_exit`, **per asset class**, HARD‑FAIL on missing row. 🔎M

| ID | Exit gate | file:line | Trigger | Value | Source | Per‑class? |
|---|---|---|---|---|---|---|
| G1 | Hard stop | tec-evaluator.ts:270 | `price ≤ stopPrice` | signal stop | strategy builder | floor when ATR≤0 |
| G2 | Hard target | :279 | `price ≥ targetPrice` | signal target | strategy builder | same |
| **G3** | **Break‑even latch** | trailing-exit-controller.ts:1040 | gain ≥ `breakEvenTriggerR×ATR` → ratchet to net‑BE | `break_even_trigger_r=1.0` | `module_constants trailing_exit` | **crypto `break_even_enabled=FALSE` (B73 variant‑K) → OFF** |
| **G4** | **Target‑lock / moonbag** | :1194 | `targetLockR×ATR` → flip target→trailing | `target_lock_r=1.5` | per‑class | crypto qualifiers empty → effectively OFF |
| G5 | Trailing stop | tec-evaluator.ts:389‑416 | pullback into ratcheted stop | `trail_distance_atr_multiplier=1.0` | per‑class | YES |
| G6 | Time‑based | paper-execution-engine.ts:1158 | `elapsed ≥ metadata.maxHoldingMs` | per‑signal stamp (`:468`) | per‑class | YES |

**Findings:** crypto **BE latch + moonbag are OFF** (variant‑K) → crypto exits resolve to hard stop/target + trailing + time valve. **No regime‑flip exit exists** on the active path — confirm whether intended (§16). `applyDSEMultiplier` (dynamic sizing) appears **unwired** on the active open path.

---

## §10 — Stage H: Close `[H*]`
*Primary file:* `paper-execution-engine.ts:1180` `closePosition` → `order-placer.ts:98` `closeOrder` (sell). 🔎M

- **Fill model:** depth‑walks the live **bid** book to a VWAP; beyond‑book remainder priced with per‑class `beyondDepthPenaltyBps`; cold book → `requested × (1 − penalty)`. **Closes are NEVER depth‑gated** ("must always exit"); a non‑filled status leaves the position OPEN and retries next cycle (no half‑close).
- **PnL:** `grossPnl = (exitPrice − intendedEntryPrice) × qty`; `totalCost = entryFee + exitFee + entrySlippage + exitSlippage`; `netPnl = grossPnl − totalCost`. **Fees applied once per side** (entry fee persisted at open, read back at close — not recomputed). ✅(logic) M.
- **★ Two fee sources (flag):** the **EV gate (F2)** prices friction via `getCachedCostMetrics` (`expectancy.ts:571`); the **fill/close** prices fees via `getFrictionForAssetClass().feeRateTaker` (`paper-execution-engine.ts:170`). Both currently resolve to the same DB `fee_model` rows, but they are **two code paths** — reconcile so they cannot diverge (§16‑V3).

---

## §11 — The EV / friction deep‑dive (the blocker) ✅V

**Kernel** (`net-expectancy-kernel.ts:85‑128`):
```
pWin   = clamp(minPWin + DI/diPWinFactor, minPWin, maxPWin)            // standard path
pWin   = clamp(minPWin + |dbsScore|/2,    minPWin, maxPWin)            // sourcePool='quant-strong_trend'
RawEV  = pWin·|target−entry| − (1−pWin)·|entry−stop|
NetEV  = RawEV − totalFriction
```
**Live DB (`module_constants`, queried 2026‑06‑18):** `pwin_floor=0.40`, `pwin_ceiling=0.60`, `di_pwin_factor=200`.

**Friction** (`cost-model.ts:163`): `totalCost = (fee×2) + (slippage×2) + spread`, applied as `frictionPct × entryPrice`. **Live DB fees:** `crypto_spot spot_taker_fee=0.008` (0.80%), `spot_maker_fee=0.004` (0.40%); slippage default `0.0005`, spread default `0.0010`.
→ **Round‑trip friction = 0.016 + 0.001 + 0.001 = 1.8%**, dominated by the **1.6% taker** (0.8% × 2 legs).

**Friction safety buffer — CC‑A addition, location‑refined (✅V both ways).** `module_constants` carries `friction_safety_buffer = 1.1`. CC‑A flagged it as a 10% friction margin reinforcing H1; on firsthand read it applies to the **SQE regime‑aware ROI floor** (`isSignalProfitable`/`getROIDetails`, `expectancy.ts:266,299` — `frictionFloor = (fee×2) + slippage×1.1`) and the **legacy 11.5 helpers** (`spread×1.1`, `:125,139`), **NOT to the `[11.8B]` Net‑Expectancy kernel** (which uses `computeTotalRoundTripCost`, `cost-model.ts:163` — no buffer). So the **`[11.8B]` open‑gate hurdle is the raw ~1.8%**, while **SQE's separate ROI gate (C3) adds the 10% cushion to slippage** upstream. Net: there are *two* friction hurdles (SQE C3 ROI floor with the 1.1 buffer; `[11.8B]` round‑trip with none), **both** reinforcing H1 — CC‑A's direction is right; the buffer makes the *SQE* gate stricter, not the EV kernel.

**Lever provenance (note):** `pwin_floor` / `pwin_ceiling` (`expectancy_kernel`), `di_pwin_factor` (`directional_integrity`), and the ROI buffer/bounds (`expectancy_gates`) all resolve from `module_constants` with **`asset_class='*'` (the global key)** — i.e. these EV levers are **global, not per‑class** today. The **fees** (`fee_model`) ARE per‑class rows (crypto_spot / xstock_spot), currently seeded identical (account‑wide tier).

**Worked example** (entry 100, target +2%, stop −1% = 2:1 RR, pWin=0.60):
`RawEV = 0.60·2% − 0.40·1% = 1.2% − 0.4% = 0.8%`; `NetEV = 0.8% − 1.8% = −1.0%`. → **honest reject.** This reproduces the dry‑run (RawEV positive, friction ~1.1–1.9× over). The model is *correctly* saying these trades lose to fees at Tier‑1 taker pricing.

**Why #233 won't fix it (the key proof):** default `DI=50 → pWin=0.65→cap 0.60`. The default **already sits at the ceiling**. Real DI ≥ 40 → still 0.60; real DI < 40 → *lower*. `VolNoise` only feeds the ranking `score`, not `netEV`. So threading real DI/VolNoise **cannot** raise RawEV. The only EV‑relevant input fix is **dbsScore on the strong‑trend path** (pWin 0.40→up to 0.60) — and that needs `sourcePool` threaded too.

**The actual levers to open crypto** (decisions, not bugs): (1) **maker‑fee execution** — maker 0.40% is seeded but has **zero consumers** (engine takes liquidity); a maker‑entry path would roughly halve fee drag (1.6%→~1.2% if one leg maker, or less). (2) **target/stop geometry** — require ≳1.8% gross target / larger RR. (3) **pWin ceiling** re‑decision (raise 0.60). (4) **per‑regime/per‑strategy** EV tuning. All are *fresh decisions*, to be made deliberately — not silently.

---

## §12 — Resolved answers to the five open questions

**(a) TCL — mechanical vs gating; FinalScore vs rankingScore.** ✅V(sort)/🔎M
TCL is a **mechanical slot‑limiter + exposure filters** (pair‑dedup, AMR), **not a quality gate** — matches Nov‑2025 intent ("performs no filtering — that occurs earlier in the SQE", Math‑Arch §9.2). It orders on **`finalScore`** today (live: `ready_to_buy_service.ts:1665‑1669` sort on `final_score`; `criteria-limiter.ts:90` `orderBy:'finalScore'` is the dead path). `rankingScore` **exists** (`ranking-weights.ts` formula `finalScore·qW + netReturn·rW − frictionPenalty·fW + contextBonus`) and was the *intended* ordering key (Phase 14.5), **but is computed only on the VTS path** (`vts-runner.ts:4528`); on the active path it is stored equal to `finalScore`. **Kyle's instinct is right in intent**, but **switching TCL's sort to `rankingScore` is a no‑op until `computeRankingScore` is wired into the active orchestrator/RTB insert** (and a `ranking_score` column or metadata read is decided). This is a real, bounded build item — not a one‑line orderBy change.

**(b) Kraken fee tier — built in? which tier? stale?** ✅V
**Built in (Tier 1), DB‑sourced, NOT stale.** `module_constants.fee_model` (seeded by `2026-06-11-b45-fee-model-tier1.sql`): crypto_spot **0.80% taker / 0.40% maker**, identical for xstock_spot (account‑wide tier). Live DB confirms. VTS/paper share the same cost‑model. The high friction is the **honest Tier‑1 taker fee**, not a stale/old rate — so the "stale‑fee bug" hypothesis is **disproven**. Two things to act on, though: maker (0.40%) is **stored but never used** (no maker‑entry path), and the **EV gate vs fill use two different fee‑resolution calls** (§10, §16‑V3).

**(c) benchmark / stablecoin / crypto‑quoted exclusions — already upstream?** 🔎M
**Partially, and not where the proposed gate would live.** On the **active** path: stablecoin/stablecoin pairs ARE excluded (hardcoded regex, A5); benchmarks are **force‑included** (not excluded); **crypto‑quoted pairs are NOT excluded at all.** `crypto-universe-filter.json` (`allowedQuotes`) is consumed **only by the passive‑archive loader** (b74 cron), **never by the active scan**. → **The B6.5f crypto‑quote active eligibility gate is NOT redundant** — it closes a genuinely open gap. (Prerequisite: the canonicalizer `knownQuotes` recognition fix, so the pairs are *recognized* before they can be *gated*.)

**(d) Placeholder EV inputs (#233).** ✅V
**Confirmed defaults:** `DI=50`, `VolNoise=0.300`, `dbsScore` dropped (→0), `sourcePool` dropped. **Drop points:** `signal-orchestrator.ts:769‑772` (queued metadata omits them) and `paper-execution-engine.ts:1860‑1865` (rebuilds metadata fresh, never reads the stored RTB metadata jsonb); `rtb_signals` has no column for them. **But per §11, fixing the DI/VolNoise inputs does NOT change the gate verdict** (pWin already capped). #233 is therefore an **accuracy/telemetry fix + a prerequisite for the strong‑trend dbsScore path**, **re‑scoped away from "the gate‑10 unblock lever."** This is the audit's biggest correction to the prior plan.

**(e) Unrecognized‑pair / auto‑onboarding.** 🔎M
**No auto‑onboarding.** Recognizer is hand‑maintained hardcoded lists; unknown quote → classify fall‑through → skip (`asset-classes.ts:600` throw → `safeResolveAssetClass` null + `classify-fallthrough-active` alert). The active scan doesn't classify (treats all as crypto_spot), so the drop happens downstream. An auto‑onboarding loop (detect unknown → fetch metadata → extend recognizer → reprocess) would be **net‑new** — worth scoping, but lower priority than the recognition‑completeness fix (B6.5f) and the structural EV/friction reframe.

---

## §13 — Current‑vs‑intended (Nov‑2025 canon vs live)
*Nothing below is binding — it's the reference baseline for fresh decisions.*

| Topic | Intended (Nov‑2025 canon) | Current (live code) | Divergence? |
|---|---|---|---|
| TCL role | "no filtering — SQE does it"; promote highest‑ranked on slot | mechanical limiter + exposure filters; no quality re‑gate | **Aligned** |
| RTB ranking | sort by **FinalScore** | sorts finalScore (rankingScore inert) | Aligned in effect; rankingScore was a *later* (Phase 14.5) intent never wired to active |
| EV gate inputs | pWin source unspecified; DI = `|momentum|/volatility`; flat fee | pWin from DI (capped 0.60); defaulted DI on open path | Diverged (placeholder inputs) — but see §11: not the blocker |
| Fee model | flat **0.10% taker** both sides | **0.80% taker** Tier‑1 (DB) | **Diverged — fee is 8× the canon**; canon is stale (pre‑Tier‑model) |
| One‑best‑per‑cycle | orchestrator emits **all** passing; TCL winnows to one | same (orchestrator emits all; TCL promotes per slot) | **Aligned** — CLAUDE.md rule‑20 "one best signal per cycle" is a *simplification*; the winnow is at TCL, not emission |
| Universe exclusions | benchmark/stablecoin handled at **scanner** | stablecoin yes; crypto‑quoted no | Partially diverged (crypto‑quote gap) |
| Regimes / strategies | 5 regimes (BULL_STABLE…), 17 strategies, no DBS/MCE | B62 5‑regime (TFS/HVU/RBS/IE/ST), 19 strategies, DBS+MCE central | **Canon is STALE** (predates Phase‑12 redesign) |

**Canon staleness flags:** the Bridge‑canonical docs predate the entire Phase‑12+ MCE/DBS redesign and the multi‑asset migration; they internally disagree on the FinalScore formula and the Ideal/Rotational split. Treat `DawnTrader_Regime_Strategy_Mapping.md` (Apr‑2026) as the freshest. **Langston history note:** Langston was not operational in Nov‑2025; this table is his catch‑up on intent‑vs‑now.

---

## §14 — Dead / legacy code surfaced (DEDUP + removal candidates)
*Per CLAUDE.md rule 18 (never leave legacy lingering) — each needs a disposition (delete‑on‑the‑spot or dated removal home). 🔎M — CC‑A/Langston to confirm zero‑caller claims before any deletion.*

1. **`server/core/criteria-limiter.ts` — entire `CriteriaLimiter` class + `criteriaLimiter` singleton.** The file labeled "Directive 11.0B — TCL" is **not the live TCL** (live = `paper-execution-engine.checkRtbPromotion`). Zero callers. → removal candidate.
2. **`ready_to_buy_service.getTopSignal` + `checkForPromotion`** — the `rankingScore`‑aware single‑signal ranker. Zero callers (dead). This is *where rankingScore would drive ordering if wired* — so its disposition is **coupled to the (a) decision**: either revive‑and‑wire (if we adopt rankingScore ordering) or delete.
3. **Maker‑fee rows (`spot_maker_fee=0.004`)** — stored, zero consumers. Keep (forward‑looking for a maker‑entry path) but **log as intentionally‑retained** so a grep doesn't read as a gap.
4. **`applyDSEMultiplier` (dynamic sizing wrapper)** — appears unwired on the active open path. Confirm dormant vs intended.
5. **`failed_quote_currency` counter** (market-scanner.ts:623) — marked deprecated, never increments.

**DEDUP against the implementation plan:** items where we *planned to build* something already present —
- *Per‑class fee tier:* already built (b45). **Drop** any "build the Kraken fee structure" task — only the maker‑path + two‑source reconcile remain.
- *EV‑input threading as the gate‑10 unblock:* the build still has value for accuracy, but **drop it as the "crypto‑opens" mechanism** (§11). Re‑home gate‑10 behind the friction/geometry decision.

---

## §15 — Implementation‑plan implications (what changes vs the pre‑audit plan)

1. **Re‑frame B6.5g.** Its stated core ("thread real DI/VolNoise → crypto clears the EV gate → gate‑10") is **invalidated by §11**. Threading inputs will NOT produce a crypto open. **Split it:** (i) #233 input‑threading as an **accuracy/telemetry** fix (keep, lower urgency, includes sourcePool+dbsScore for the strong‑trend path) — **Langston re‑scope:** this is **ONE metadata‑plumbing fix‑site** at the RTB→promote boundary (the consumption path — kernel branch, `expectancy.ts:586` forward, open‑gate read — is already wired; values drop at `signal-orchestrator.ts:769‑772` queue‑metadata + the `paper-execution-engine.ts:1859‑1865` promote rebuild), **lower effort than first scoped, and still NOT a crypto opener** (strong‑trend caps at the same 0.60); (ii) a **NEW structural decision** — how crypto is *meant* to clear friction (maker‑entry path? larger‑RR geometry? pWin‑ceiling/per‑regime tuning?) — which is the real gate‑10 prerequisite and is a **Kyle‑level decision** (§13: gets a named roadmap home the moment Kyle picks a direction), not a silent code change. **Maker‑entry is itself a real architectural build** (limit‑order fills aren't guaranteed), not a knob flip.
2. **B6.5f (canonicalizer quotes) stays valid and is the right next build** — it's a real recognition gap, prerequisite to any crypto‑quote handling. The **crypto‑quote eligibility gate** within it is **confirmed not redundant** (§12c).
3. **TCL "rank on rankingScore"** is a real bounded item (wire `computeRankingScore` into active + decide column/metadata) — **not** a one‑line orderBy flip. Decide whether it's worth it given that ranking only matters when RTB has more eligible signals than slots (rare while everything is EV‑rejected anyway).
4. **Legacy disposition** (§14 items 1‑2) — schedule per rule 18.
5. **Sequence (unchanged from Kyle's lock):** finish this AUDIT → Filter Diagnostics tab (crypto → xStock → live) → fixes — but the *fix list itself* is now reordered: recognition (B6.5f) → the structural friction/geometry decision → #233 accuracy → TCL ranking → auto‑onboarding.

---

## §16 — Open verification items (confirm during review)
- **V1 — strong‑trend path reachability:** confirm `sourcePool='quant-strong_trend'` is genuinely never threaded to the open‑path kernel (would make the dbsScore fix inert until sourcePool is also threaded). 🔎
- **V2 — pattern‑path vs inline `[HF9]` filter:** confirm whether pattern‑path signals bypass the inline NetEV filter (`evaluateSymbol` quant path), explaining how promoted signals reach `[11.8B]` (H6). 🔎
- **V3 — two fee sources:** confirm `getCachedCostMetrics` (EV gate) and `getFrictionForAssetClass` (fill) always resolve identical fee values; reconcile to one source. 🔎
- **V4 — depth gate never reached:** confirm F5 is unreachable while F2 rejects (so depth‑gate tuning is moot until friction is addressed). 🔎
- **V5 — regime‑flip exit:** confirm none exists and decide if one was intended (G‑section). 🔎
- **V6 — live `screener_filters` active rows:** confirm the active `vn_max`/min‑volume/etc. values in the DB match the defaults cited (A7‑A10, B1). 🔎

---

## §17 — Redundancy verdict (Kyle's direct question)
**This doc is NOT redundant with the SIM or the System Manual — it fills a real gap.** The **SIM** is organized by *file/component dependency + blast‑radius + shared‑state* (Layers 1‑11), not pipeline order, and its standout asset is the cross‑cutting singleton/liveness registry. The **System Manual** is organized by 11 audit *chapters* (architecture/math reference) and has only a 6‑line pipeline trace (lines ~4170‑4181), with thresholds scattered across chapters. **Neither** is an *ordered, scan→close, per‑decision‑point ledger that records each threshold's value‑source (DB/config/hardcoded) and current‑vs‑intended.* That is exactly this doc. **Disposition:** keep this as the working/navigable instrument and the current‑vs‑intended record; once verified, fold the per‑gate threshold+source facts into the relevant System Manual chapters (so governance doesn't proliferate), with this doc remaining the live pipeline map. The SIM remains the dependency/shared‑state map; the canon docs remain the (partly stale) intent source.

---

*End — CC‑B draft 2026‑06‑18. Next: Claude Old (CC‑A) review → consensus → Langston. No code changes pending that chain.*
