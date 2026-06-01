# B-XSTOCK-CALIB · B.0 PRE-CALIBRATION BASELINE — NUMBERS REPORT (WORKING)

**Status:** ANALYTICS COMPLETE 2026-06-02 — pending Langston Step-8 review + event-timeline timestamp pinning. xStocks only. No win/loss. Every rate carries raw counts (Kyle §9.2). Rolling windows, not snapshots (rule #13).
**Captured:** regime mix + stability/drift, eval funnel, strategy mix, throughput, gate config, rolling-24h IMF/global rejection rates, LQ/depth + DI/VN/spread + ATR distributions, DBS-drift proxy, denominator, restart proxy, external-feed inventory.
**REMAINING:** pin exact event-timeline stamps; Langston independent review; close B.0.

---

## 0. EXECUTIVE SUMMARY

**What this is:** the "before" snapshot of every xStock setting the Phase-24 calibrations will touch — IMF + global filter rejection rates, regime mix, strategy mix, throughput, and the filter-value distributions — captured as rolling windows (raw counts beside every rate), with operational events overlaid (Memorial Day, the ~30h weekend outage, the B.1.5 depth-filter go-live, weekend gaps) so distorted windows aren't read blind. No win/loss (Phase 25).

**DEFINITELY OFF NOW (ranked):**
1. **LQ gate mis-scaled — #1 B.2 target.** `lq_min=43` is a crypto-VOLUME-era carryover; B.1.5 made xStock LQ depth-based but kept 43 → it now demands ~$19,950 ask-depth and **rejects ~70% of names in RTH**, while the hard `min_depth_usd` gate (2000/5000) rejects only 4-13%. Two uncoordinated liquidity gates (disagree 4-10×) — recalibrate lq_min on the depth scale + coordinate with min_depth. **(Langston Step-8: min_depth gates min(ask,bid) / LQ gates ask-only → reconcile the STATISTIC not just the level; and the FINDING is decision-grade but the recalibration VALUE is NOT yet — depth on ~1 day → thicken-forward / bound-with-range.)** (§1d)
2. **Correlation mis-placed AND non-functional.** Canonical IMF = LQ/VN/DI (crypto confirms); xStock wrongly bundled correlation into IMF, and it's never computed (no benchmark → const 0.5 → rejects 0%). Kyle: remove from IMF at END of calibrations; correlation stays a confidence modulator, setup deferred to Phase 25. (§7.1)
3. **Spread gate far too loose — B.4/B.5.** Gate 1% (3% some paths) vs actual spreads median 0.08% / p99 0.81% → catches ~1% / 0.4%. Belongs ~0.25-0.4% if meant to screen. (§1e)
4. **Regime mix skewed + drifting — B.1.** RANGE_BOUND_STABLE ~0% EVERY day (persistent threshold problem); the mix also drifted (HIGH_VOLATILITY_UNSTABLE ~5%→23% over 2wk) — likely GENUINE late-May volatility (DBS healthy/unpinned → Langston L4 NOT triggered, no fresh replay). Calibrate against the drift-aware, event-overlaid view, not the 3wk blend. **(Langston Step-8: the "genuine volatility" causal read is CAVEAT-grade — the DBS-health window 05-05→15 predates the drift window 05-19→06-01; L4 still NOT triggered, but B.1 shouldn't inherit it as measured without a fresh DBS replay over the live window.)** (§2, §2b)
5. **Strategy-mix anomalies — D.** vwap_pullback 50% + morning_star 29% = ~80%; **date-segmented (Langston Step-8 — gates unchanged since 05-11, so NOT window artifacts):** breakout + inside_bar_reversal ENABLED 3wk with 0 trades (genuinely never-fire); strong_bull_trend opened 21× (05-21→26) while its gate = FALSE (genuine **gate-bypass**). Both confirmed real → D-audit. (§4)
6. **`min_volume` inert (0%, depth replaced it); strong_trend family ~unfiltered on LQ** (lq_min 30/35 ≈ $1-3k). (§1c, §1d)

**LOOKS HEALTHY / no change indicated:** DBS scoring (components moving, 0 stuck, 0 sentinel); DI sensibly targeted (inert on trend/breakout, only a too-trendy ceiling on reversal/oscillator); VN a light upper-tail filter by design; scanned universe = full 489; ATR baseline (~0.78%/hr median) captured for B.6.

**Feeds which sub-batch:** B.1 (regime thresholds incl. RANGE_BOUND) · **B.2 (LQ recalibration + min_depth coordination — lead)** · B.4/B.5 (spread/friction) · B.6 (ATR priors) · D (strategy audit). The comparison "Calibration Scoreboard" tab is a SEPARATE follow-on batch (numbers-first per Kyle).

**Caveats:** depth/spread raw readings retained ~1 day → those distributions thicken forward (session-segmented RTH); DI/VN value-distributions use a 4-day window so their reject-fractions differ from the scanner's ~1-day LIVE rates (LIVE rates decision-grade; distribution SHAPE is the takeaway); spread, ATR, regime, strategy, throughput, LQ/depth are decision-grade as reported.

---

## 1. FILTER REJECTION RATES — rolling 24h (decision-grade; 878 scan cycles, 489 unique pairs, 65,199 pair-scans)

### 1a. Global filter (quant path) — denom 60,469 pair-evals
| Gate | Rejected (raw) | Rate |
|---|---|---|
| passed all | 56,725 | 93.81% |
| min_price | 2,342 | 3.87% |
| **spread** | 1,402 | **2.32%** |
| min_volume | 0 | 0.00% (inert — replaced by depth) |
| correlation (global) | 0 | 0.00% |

> NOTE rule #13: a single 30s cycle earlier showed spread rejecting 12/75 = **16%**; the rolling-24h truth is **2.32%**. Snapshot was misleading — vindicates rolling-window discipline.

### 1b. IMF filters (quant path) — denom 283,625 (fan-out: 56,725 survivors × 5 families)
| Filter | Rejected (raw) | Rate |
|---|---|---|
| **LQ (depth-based liquidity)** | 137,140 | **48.35%** ← dominant filter |
| DI (directional integrity) | 38,172 | 13.46% |
| VN (vol-noise) | 2,603 | 0.92% |
| **Correlation** | 0 | **0.00% ← COMPLETELY INERT** |
| passed | 105,710 | 37.27% |

### 1c. Per-family IMF (each family evaluates 56,725 pair-bars)
| Family | LQ fail | VN fail | DI fail | Corr fail | passed |
|---|---|---|---|---|---|
| trend | 60.44% | 0.96% | 0% | 0% | 38.60% |
| reversal | 60.44% | 0.96% | **31.92%** | 0% | 6.69% |
| breakout | 60.44% | 0.96% | 0% | 0% | 38.60% |
| oscillator | 60.44% | 0.96% | **35.38%** | 0% | 3.22% |
| strong_trend | **0%** | 0.75% | 0% | 0% | **99.25%** ← barely filtered (lq_min=30/35 vs 43) |

> Pattern path IMF (denom 61,082): LQ 62.48%, VN 0.24%, DI 0%, Corr 0%, passed 37.28%.

**Headline:** LQ does ~all the liquidity work (48% overall, ~60% on 4 of 5 families); Correlation rejects literally 0 **because it is never computed — no benchmark passed (see §7.1)**; min_volume inert; spread ~2.3%; DI is family-targeted (0% trend/breakout, ~32-35% reversal/oscillator); strong_trend family ~unfiltered.

**Pipeline position (code-confirmed):** scanner → GLOBAL filter (`global-filter.ts`: min_price, max_price, min_volume[inert], min_depth_usd[B.1.5], min_history, max_bid_ask_spread — NO correlation gate in xStock global) → IMF filters (`imf-evaluator.ts`: currently LQ, VN, Correlation, DI per family — NOTE: Correlation's presence here is the architecture question Kyle flagged; canonical IMF = LQ/VN/DI only, see §7.1; admit if ≥1 family passes) → per-strategy detect → SQE → RTB → TEC → execution. IMF first-fail attribution order = LQ → VN → Correlation → DI (each reject counted once, to the first failing metric).

---

### 1d. DEPTH / LQ distribution + the two-liquidity-gate inconsistency (RTH, ~1 day retained ticker_snap, 485 symbols — short window, thickening forward)

**LQ threshold → required ask-depth** (LQ = log10(askDepth+1)×10): lq_min **43 → ~$19,950**; 35 → ~$3,162; 30 → ~$1,000.

| Session | n | p10 ask | p50 ask | p90 ask | pass lq43 (~$20k) | pass lq35 (~$3.2k) | pass lq30 (~$1k) | pass depth5000 | pass depth2000 |
|---|---|---|---|---|---|---|---|---|---|
| **RTH** | 485 | $5,941 | $14,418 | $32,799 | **30.3%** | 96.1% | 98.1% | 86.6% | 96.1% |
| OFF | 485 | $6,000 | $17,363 | $42,587 | 41.2% | 95.3% | 97.9% | 87.2% | 94.8% |

Two-way depth percentiles (RTH): p10 $4,445 · p25 $7,946 · **p50 $12,550** · p75 $18,491 · p90 $26,594.

**KEY FINDING — two uncoordinated liquidity gates.** The family-IMF **LQ** gate (lq_min=43 → ~$20k ask-depth) **rejects ~70% in RTH** (only 30.3% pass), while the hard **min_depth_usd** gate (2000/5000) rejects only ~4% / ~13%. **Correction (Langston Step-8):** min_depth gates **`min(ask,bid)` — the shallower side (`global-filter.ts:137`), NOT a bid+ask sum** — whereas LQ gates **ask-only**, so the two measure **different statistics of the book**, not just different levels. LQ is the binding liquidity constraint at ~$20k — ~4× the $5k hard gate, ~10× the $2k — nearly redundant on symmetric books, but the two **diverge on asymmetric (thin-ask) names** (exactly the stop-hunt names a liquidity gate should catch). **Root cause:** lq_min=43 is a CRYPTO-era carryover calibrated for the OLD volume-based LQ scale; B.1.5 switched xStock LQ to DEPTH-based but kept 43, which now lands at an arbitrary ~$20k. **→ Core B.2 work: settle ONE coherent liquidity definition across both gates (reconcile the *statistic*, not just the level) + recalibrate lq_min on the depth scale.** ⚠ **FINDING vs TARGET (Langston Step-8):** the *finding* (43 → ~$20k → ~70% reject) is decision-grade (math + pass-rate); the *recalibration VALUE* is NOT yet — depth rests on ~1 day/~15h of retained ticker_snap (RTH-only) and co-moves with the drifting volume regime (§2b), so B.2 must thicken depth forward OR bound the target with a sensitivity range, not pick a precise lq_min off one RTH day. strong_trend's lq_min (30/35 → ~$1-3k) is why that family ~never rejects on LQ (96-98% pass). Session matters: RTH depth is LOWER than off-hours (p50 $14.4k vs $17.4k) — calibrating on off-hours would overstate liquidity ~11 pts (Langston L2 confirmed).

### 1e. DI / VN / SPREAD value-distributions

**SPREAD % (decision-grade — point-in-time bid/ask, RTH, 485 symbols, per-symbol median):** p10 0.022 · **p50 0.082** · p90 0.256 · p99 0.814 (%). Crossings: **>1.0% = 1.0%** of symbols · **>3.0% = 0.4%**. → Spreads are tiny; the 1%/3% spread gates sit far past p99 (0.81%) → barely function as a filter. If the gate is meant to screen genuinely wide-spread names it belongs near p90-95 (~0.25-0.4%); as-is it's a loose safety rail. **Clear calibration target.**

**DI (rolled 60m closes; SHAPE robust):** p10 29.8 · **p50 48.1** · p90 68.3 (centered near neutral 50). `di_min=10` **never binds (0% below 10)**; the only binding DI side is `di_max` on reversal(40)/oscillator(35) — LIVE rolling-24h rejects **32% / 35%** there (decision-grade), 0% on trend/breakout (di_max=100). → DI does nothing on trend/breakout; acts only as a "too-trendy" ceiling on reversal/oscillator (sensible: a reversal setup shouldn't be strongly trending).

**VN (rolled 60m closes; SHAPE robust):** p10 0.571 · **p50 0.743** · p90 0.933 · p99 1.000. Thresholds vn_max 0.85(active)/0.95(vts)/0.98(pattern) all sit ABOVE median 0.74 → upper-tail filter → LIVE rejects **<1%** (decision-grade). → VN is a light, upper-tail filter by design.

**CAVEAT (rule #13 / window-match):** DI & VN are computed over a 4-day rolled-hourly window per symbol; the scanner uses its ~24-bar (~1-day) window at scan time + first-fail attribution (VN/Corr/DI only judge LQ-survivors), so the standalone crossing-fractions differ from the scanner's LIVE rolling-24h rates. The **LIVE rates (DI 32/35%, VN <1%) are the decision-grade reject numbers; the distribution SHAPE (median-vs-threshold) is the robust takeaway.** Spread has NO window issue (point-in-time) → fully decision-grade.

### 1f. ATR% (volatility) — B.6 trailing-stop / BE prior baseline

14-bar ATR on rolled 60m bars, as % of price (404 symbols): p10 **0.433** · **p50 0.778** · p90 **1.842** · p99 **3.490** (%/hr). → Typical xStock hourly true-range ≈ 0.78% of price; a 2×ATR trailing stop ≈ 1.6% at median, ~3.7% at p90. NOT regime-segmented yet (B.6 refines per-regime). This is the "before" for the TEC trailing-stop / BE-stop / moonbag priors.

---

## 2. REGIME MIX — 3 weeks (5,970,917 classifications)
| Regime | Count | Share |
|---|---|---|
| STRUCTURAL_TRANSITION | 2,668,188 | 44.69% |
| TREND_FRIENDLY_STABLE | 2,312,485 | 38.73% |
| HIGH_VOLATILITY_UNSTABLE | 741,349 | 12.42% |
| IMPULSE_EXPANSION | 240,458 | 4.03% |
| **RANGE_BOUND_STABLE** | 8,437 | **0.14% ← essentially never called** |

### 2b. DBS-drift + regime STABILITY (the 3-week average masks a MOVING distribution)

**DBS components are HEALTHY — NOT pinning** (backfill 05-05→15, 260 symbols): final_score mean -0.006 / std 0.354; component std slope 0.059 / return 0.153 / ema 0.171; **sentinel (failed-compute) = 0%**; per-symbol final_score std p50 **0.243**, **0 symbols stuck** (std<0.01). → **Langston L4 escalation NOT triggered** — the regime skew is NOT from pinned components, so NO fresh component replay needed.

**Regime mix DRIFTED over the last 2 weeks** (share/day): HIGH_VOLATILITY_UNSTABLE climbed **~5% (05-19/20) → ~23% (06-01)**; IMPULSE ~1% → ~9%; STRUCTURAL_TRANSITION eased ~53% → ~36%; TREND ~38% → ~32%. DBS components being healthy → this is LIKELY genuine rising market volatility late-May, not classifier drift. **⚠ CAVEAT-GRADE, not decision-grade (Langston Step-8):** the DBS-health evidence is from the STALE backfill window 05-05→15, which **predates the drift window 05-19→06-01** — so "components were healthy DURING the drift" is an INFERENCE, not a measurement. It IS enough to NOT trigger L4 (no escalation on an absent signal); but B.1 must NOT inherit "genuine-volatility-not-classifier-drift" as a *measured* premise — the clean conversion is a fresh DBS component replay over the live 05-19→06-01 window (scope §3.E REPLAY path). Either way **the 3-week regime average (§2) is a blend of a shifting distribution**; B.1 must use the drift-aware, event-overlaid view, not the blended average. **RANGE_BOUND_STABLE is ~0% EVERY day** (0.55% → 0.01%, declining) — persistent, not transient → a regime-threshold issue (B.1), not drift. Weekend artifact visible: 05-23/24 = 100% TREND on a handful of closed-market evals (excluded from decision-grade).

---

## 3. DOWNSTREAM EVAL FUNNEL — 3 weeks (5,970,826 strategy-evals; post-fan-out)
| Stage | Count | Share |
|---|---|---|
| strategy_internal (died in strategy logic) | 5,826,628 | 97.58% |
| tcl | 142,227 | 2.38% |
| admitted (→ became VTS trade) | 1,864 | 0.03% |
| sqe | 107 | 0.0018% |

(Upstream scan-funnel reject rates = §1 live counters; not in this archive — archive begins at strategy-eval.)

---

## 4. STRATEGY MIX — VTS opens, all-time (1,879 trades)
| Strategy | Trades | Share | Gate |
|---|---|---|---|
| vwap_pullback | 941 | 50.08% | on |
| morning_star | 554 | 29.48% | on |
| sma_trend_ride | 162 | 8.62% | on |
| vwap_bounce | 73 | 3.89% | on |
| pivot_shift | 65 | 3.46% | on |
| range_trade | 61 | 3.25% | on |
| strong_bull_trend | 21 | 1.12% | **OFF (anomaly: disabled but has trades)** |
| mean_reversion | 2 | 0.11% | on (fires ~never) |
| **breakout** | 0 | 0% | **on (enabled, NEVER fired)** |
| **inside_bar_reversal** | 0 | 0% | **on (enabled, NEVER fired)** |

> 2 strategies = ~80% of all trades. **DATE-SEGMENTED (Langston Step-8 — all 3 gates UNCHANGED since 2026-05-11 / b79.0m.a, so these are NOT all-time-vs-current-gate artifacts; the segmentation CONFIRMS them as genuine):** (a) **strong_bull_trend gate = FALSE since 05-11, yet 21 opens 05-21→05-26 then ceased** → genuine **gate-bypass** (a disabled strategy DID trade, then stopped ~05-26) — root-cause in D-audit (does the VTS path honor strategy_gates? did a later batch fix it ~05-26?). (b) **breakout + inside_bar_reversal gate = TRUE since 05-11, ZERO opens in 3 weeks** → genuinely never-fire despite enabled (NOT "recently enabled") — D-audit. (c) mean_reversion 2 opens (05-27/29).

---

## 5. THROUGHPUT — VTS opens/day (last 21d)
14 (5-12) → 32 → 55 → 87 → [weekend gap] → 25 (5-18) → 64 → 167 → 169 → 217 → **4 (5-25 Memorial Day)** → 257 (5-26) → 197 → 226 → 201 (5-29) → [5-30/5-31 weekend + 30h outage gap] → 164 (6-01, partial). Admitted-signals/day ≈ opens/day (consistent).

---

## 6. DENOMINATOR + GATES + LIFECYCLE
- **Scanned universe:** 489 unique pairs (rolling 24h) / 479 distinct in 3w archive ≈ full discovered universe. (The "~260" figure was the STALE DBS-backfill coverage window, NOT a current scanning limit.)
- **Enabled strategy gates (9):** breakout, inside_bar_reversal, mean_reversion, morning_star, pivot_shift, range_trade, sma_trend_ride, vwap_bounce, vwap_pullback. (orb=off, strong_bull_trend=off, +8 others off.)
- **Restart proxy:** boot_state_reconciliation fired **34×** in 3 weeks (~1.6/day) → the in-memory scan counters reset often (why §1 must come from rolling-24h, not lifetime). weekend_shutdown fired only 1× (5-23); the 5-29 fire MISSED (node-cron bug = the 30h outage). weekend_restart 2×.

---

## 7. EARLY "DEFINITELY OFF" LIST (decision-grade where rate is rolling-24h)
1. **Correlation inside IMF — 0.00% rejection over 283,625 checks. TWO findings (code + governance research, both confirmed):**
   - **(a) Architecturally MISPLACED.** Canonical IMF = **LQ / VN / DI only** (crypto confirms: `fx5-scanner.ts:813-818` loads only LQ/VN/DI thresholds for the family-IMF gate; correlation is NOT an IMF metric in crypto; the shared `calculateIMFMetrics` that bundles Correlation is unused by the crypto live path). The xStock evaluator **DIVERGED** — it bundled Correlation as a 4th IMF metric (`imf-evaluator.ts:148-177`, `corr_max`). It does not belong in IMF.
   - **(b) Non-functional anyway.** `calculateCorrelation(ohlc)` is called with no benchmark → early-returns **0.5** (`imf-metrics.ts:104-107`); constant 0.5 < corr_max 0.92 → never trips.
   - **ACTION (Kyle 2026-06-01): REMOVE correlation from the xStock IMF evaluator** (match canonical LQ/VN/DI) — NOT "wire it up" — **at the END of all calibrations** (deferred cleanup; do NOT remove mid-B.2). Log to Phase-16 legacy register (§5.18). The benchmark/modulator correlation SETUP (SPY/sector reference, enable flag, calibration) is **DEFERRED TO PHASE 25** (metrics where trade outcomes are part of the consideration). So correlation — both the IMF removal and the modulator setup — is fully OUT of the B.0–D archive-replay arc.
   - **The GENUINE benchmark-correlation feature is SEPARATE — a downstream confidence MODULATOR (`b68_3 pair_correlation`), NOT an IMF filter / scan gate — and already designed + decided:** xStock reference = **SPY/USD seeded 2026-05-25** (B79.0n.CONFIDENCE-CHAIN) but **`compute_correlation_enabled=false`** (DISABLED pending SPY-OHLC verify + calibration, Risk R-7). v2 target = **per-sector ETF** (XLK/XLF/… per GICS sector) — decided 2026-05-15 (XSTOCK_CALIBRATION_PLAN §3 Q4) but BLOCKED: all 11 SPDR sector ETFs missing from Kraken (B-PHASE-A1 2026-05-17 §3.3) → needs FRED+Yahoo offline feed (B-PHASE-E-PRE-1, Phase E). **So benchmark-correlation is OUT of scope for B.2 threshold calibration** — it has its own decided path.
   - **FEED VERIFICATION (Kyle ask 2026-06-01, re-checked code+config, 2 independent passes, no-assumptions):** wired external feeds = **CoinGecko** (xStock symbol DISCOVERY only — `coins/markets?category=xstocks-ecosystem` → symbol LIST; does NOT supply sector data; also crypto macro: BTC dominance / mcap), **Finnhub** (the SECTOR-CLASSIFICATION source — `/stock/profile2` `finnhubIndustry` → GICS tag; this is what tags XLK/XLF/etc. per symbol; null → UNCATEGORIZED), **Kraken WS** (prices/validation), **Binance** (crypto funding). **NO wired feed supplies per-SECTOR PRICE series** (XLK/XLF/… price history) → per-sector benchmark genuinely still blocked (re-confirmed). **BUT broad-market benchmarks ARE available now:** SPY (S&P) + QQQ (NASDAQ) are in the registry as INDEX_PROXY with live Kraken price history — which is exactly why SPY was the seeded v1 interim. Net: **broad-market (SPY/S&P) correlation is UNBLOCKED** (needs SPY-OHLC verify + calibration + flip `compute_correlation_enabled`); **per-sector correlation needs a sector-price feed** (B-PHASE-E-PRE-1, or alt Polygon/yfinance/self-source per RUNNING_ISSUES #94). Confidence-MODULATOR track — separate from the B.2 depth/IMF pass.
2. **RANGE_BOUND_STABLE ~0% EVERY day** (3wk 0.14%; daily 0.55%→0.01%) — persistent, not transient → mis-set _XSTOCK regime thresholds (B.1). Separately the regime mix **DRIFTED** (HIGH_VOL ~5%→23% over 2wk) — likely GENUINE late-May volatility (DBS components healthy, 0 stuck → Langston L4 NOT triggered, no fresh replay needed), so the 3wk average masks a moving distribution; B.1 must use the drift-aware view (§2b).
3. **min_volume — 0% (inert).** Known; depth replaced it.
4. **strong_trend family ~99.25% pass** — lq_min set lower (30/35) than peers (43); barely filters.
5. **2 enabled strategies never fire** (breakout, inside_bar_reversal); mean_reversion fires twice; **strong_bull_trend disabled-but-has-21-trades** (consistency bug to run down).
6. **LQ is the binding liquidity gate but MIS-SCALED (quantified, §1d).** lq_min=43 ≈ $19,950 ask-depth → rejects ~70% in RTH (only 30% pass); the hard min_depth_usd gate (2000/5000) rejects just 4-13% → the two liquidity gates disagree by 4-10×. lq_min=43 is a crypto-volume-era carryover now applied to the depth scale (B.1.5). **Core B.2 target: recalibrate lq_min on the depth scale + coordinate with min_depth_usd.** Resolves Langston #1: family paths DO have an effective liquidity gate (LQ) — it's mis-scaled, not absent.
7. **spread ~2.3% rolling** — barely bites; the 3% quant/pattern paths likely never bite (confirm in metric-shape).

---

## PENDING
- ✅ DONE: LQ/depth (§1d), DI/VN/spread (§1e), ATR (§1f), DBS-drift + regime-stability (§2b). Correlation OUT (§7.1).
- ✅ DONE: Executive summary (§0) + Langston Step-8 independent review (concur on all 5 points + 3 corrections absorbed: min_depth statistic, regime-drift caveat, strategy date-segmentation; + lq finding-vs-target split).
- REMAINING: pin exact event-timeline stamps (scheduled_tasks_audit / discovery_runs); close B.0. Optional: fresh DBS replay over live 05-19→06-01 window IF B.1 wants the volatility premise measured (not blocking).
