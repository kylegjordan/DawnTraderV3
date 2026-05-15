# Bar Interval Investigation — Crypto vs xStocks

> **Author:** CC primary, 2026-05-15.
> **Purpose:** answer Kyle's question (and the parallel one to the other CC session) on whether the 60-min-bar choice for crypto loses edge, whether xstock should switch to 60-min, and what the asset-class behavioral implications are.
> **Methodology:** code grep + historical doc review + DB inspection. Citations inline.

---

## 0. TL;DR

The crypto vs xstock disparity is real but more nuanced than the framing assumed:

| Asset class | Scanner active bar | Higher TF for B68.1 multi-tf modifier | Multi-tf cascade (active trading only) | Source |
|---|---|---|---|---|
| **crypto_spot** | 60 min | 240 min (4H) | 1H → 15m → 5m cascade | Kraken REST `getOHLCData(sym, 60)` |
| **xstock_spot** | **1 min** (entire pipeline) | 240 min (would be — config is `*` asset-class, but xstock has no B68.1 wired yet) | not wired for xstock | WS `wss://ws-equities.kraken.com` with `interval: 1` → archived to `xstock_spot_ohlc_1m` |

The mismatch isn't 1-min vs 60-min the way the question framed it — it's **xstock is doing regime classification on 1-min bars using thresholds cloned from crypto's 60-min calibration**. That's a calibration problem disguised as a bar-interval problem.

Three actionable findings:

1. **Crypto's 60-min choice was baked in from inception** (10.15.25 design docs explicitly reference "timeframe (60min)" and "max holding (24 bars)"). Not a rate-limit workaround — a design choice for swing-style trades with ~1-day holding period.
2. **Kyle's recollection of 1-min bars in the multi-tf modifier was inaccurate.** B68.1 multi-tf agreement uses **240-min (4H) higher timeframe** vs **60-min active timeframe**. There's a separate Directive 10.7 cascade that does 1H → 15m → 5m, but it's only active in `signal-orchestrator` during live-trading dispatch — not VTS, and currently active trading is off.
3. **xstock is currently classifying regime on a temporal scale (1-min bars) where the thresholds tuned for crypto (60-min bars) are semantically wrong.** This is the calibration-substrate finding — strategy thresholds calibrated for "vol < 0.012 over hourly returns" don't mean the same thing applied to minutely returns.

---

## 1. Code-level confirmation of bar intervals in each path

### 1.1 Crypto FX5 scanner — hard-coded 60 (= minutes)

`server/services/fx5-scanner.ts:914`:
```ts
const { ohlc } = await ohlcCache.getOHLCData(sym, 60);
```
And `server/services/fx5-scanner.ts:954` (pattern-only path). Comment at line 904: "Provides ~720 60-min candles for VN/σ/DI (close prices) and LQ (per-candle volume)." 720 × 60-min = 30 days of history loaded per pair per cycle.

### 1.2 Crypto VTS — also 60

`server/services/vts-runner.ts:750`: `const { ohlc } = await ohlcCache.getOHLCData(symbol, 60);` (in `fetchOHLCForPair`).
`server/services/vts-runner.ts:1666` (B68.3 BTC reference correlation): `await ohlcCache.getOHLCData(_pairCorrelationConfig.btcReferenceSymbol, 60)`.
`server/services/vts-runner.ts:3079` (BTC OHLC cache for defensive_hedge Spearman): `await ohlcCache.getOHLCData('XXBTZUSD', 60)`.

### 1.3 Crypto B68.1 multi-tf agreement — 240 (4H higher TF)

`drizzle/migrations/2026-05-03-b68-1-multi-tf-agreement.sql:29`: seeds `b68_1_higher_tf_interval_minutes = 240` for all asset classes.

DB verification (today):
```
multi_tf_agreement | b68_1_higher_tf_interval_minutes | 240   | *
multi_tf_agreement | b68_1_min_higher_tf_samples      | 30    | *
```

`server/services/vts-runner.ts:1708`: at signal-evaluation time, vts-runner fetches `ohlcCache.getOHLCData(symbol, _multiTfConfig.higherTfIntervalMinutes)` — passes 240 to Kraken. So when a trade is firing, the modulator pulls 4H bars as the "higher" reference and compares them to the 60-min "active" classification.

Important: **the active reference for B68.1 is still 60-min bars** — same as the scanner. The "multi-tf" is 60min × 240min, NOT 60min × 1min. Kyle's recall of "we added 1-min bars for the multi-tf modifier" doesn't match what the code says.

### 1.4 Crypto Directive 10.7 cascade — 1H → 15m → 5m (active trading only)

`server/services/multi-timeframe-scanner.ts` defines `KRAKEN_INTERVAL_MAP = { '1h': 60, '15m': 15, '5m': 5 }`. Cascade rules (from header comment):
- GLOBAL (1H) → all eligible pairs
- TACTICAL (15m) → pairs where 1H regimeWeight > 0.5
- PRECISION (5m) → pairs where 15m patternStrength > 0.6

Wiring: `server/services/signal-orchestrator.ts:1634`: `cascadingScan(...)` called when `TIMEFRAME_CONFIG.CASCADE.ENABLED` (defaults `true`). But **`signal-orchestrator` is the active-trading dispatch path, not VTS**. Active trading is currently OFF (passive learning / VTS only). So this cascade is dormant in production today.

`server/config/system-guards.ts:82-106` is "🔒 LOCKED MODULE — Directive 10.7" — frozen design.

### 1.5 xStock pipeline — 1-min bars throughout

**Archive source:** `server/services/passive-archive/equity-spot-archiver.ts:134` subscribes to `wss://ws-equities.kraken.com` with `params: { channel: 'ohlc', symbol: state.symbols, interval: 1 }`. So Kraken pushes 1-min bars over the WS feed; the archiver buffers them into `xstock_spot_ohlc_1m`.

**Scanner read:** `server/asset_classes/xstock_spot/eval-cycle.ts:79` defines `fetchXstockOHLC(symbol, limit = 120)`, which `SELECT ... FROM xstock_spot_ohlc_1m WHERE interval_begin > NOW() - INTERVAL '6 hours' ORDER BY interval_begin DESC LIMIT ${limit}`. Pulls the most recent ~120 of the 1-min bars.

**Eval cycle then calls** `mce.computeContext(symbol, ohlc, lastPrice, volume24h, ...)` — same MCE function crypto uses — but passing 1-min bars instead of 60-min bars to `calculatePairRegime`. **The regime classifier doesn't know what bar duration it's receiving; it computes vol/momentum/ADX on whatever it gets.**

### 1.6 What this means for regime math on xstock

`server/core/metrics/market-regime.ts:264`:
```ts
if (vol < t.RBS_VOL_MAX && dx < t.RBS_DX_MAX && absDbs < t.RBS_DBS_MAX) { regime = REGIMES.RANGE_BOUND_STABLE; ... }
```

The `RBS_VOL_MAX` threshold value (e.g., 0.012) was tuned for **hourly returns volatility**. When the function receives 120 1-min bars, `vol = computeVolatility(ohlcData)` computes the std dev of **minutely** returns — which on average is ~√60 ≈ 7.7× smaller than hourly returns volatility for a comparable price action.

So for xstock, "vol < 0.012" is hit ~always (because minute-scale vol naturally lives well below hourly thresholds). Same for ADX (`computeADX` over 120 1-min bars samples a 2-hour window vs crypto's 720 × 60-min sampling a 30-day window — very different statistical properties).

**The xstock regime classification is currently miscalibrated by temporal substrate, not just by threshold values.** Cloning the crypto thresholds was the wrong move; the bar interval itself needs to be either (a) matched to crypto's 60-min, OR (b) thresholds calibrated for 1-min substrate, OR (c) some intermediate (5-min / 15-min).

---

## 2. Historical reasoning for the 60-min choice (canonical docs)

### 2.1 Source: October 2025 design discussions

From `G:\My Drive\Dawn Trader\Dawn Trader ChatGPT Discussion Threads - MD Files\1 Dawn Trader Context for New Chat as of 10.15.25.md`:

- Line 149: `- Parameters: timeframe (60min), pullback threshold (2%), volume multiplier (1.5x), max holding (24 bars)`
- Line 193: `- **Rate Limiting**: 2 req/sec to Kraken (configurable)`
- Line 221: `- **Hourly Scanning**: Automated opportunity identification`

**Key implication: "max holding (24 bars)" = 24 × 60-min = 24 hours = one-day swing trades.** The system was designed from the start for swing-trading horizons on 60-min bars.

The 60-min choice is **NOT a rate-limit workaround.** It's a deliberate alignment with the intended ~1-day holding period.

### 2.2 Source: SYSTEM_MANUAL.md confirms

`1-system-manual/SYSTEM_MANUAL.md:1774`: "Multi-Timeframe Confirmation | ±10% | SMA5/SMA10 on 15m, 1h timeframes." Documented expectation: confirmation comes from 15m + 1h, not 1m.

`1-system-manual/SYSTEM_ARCHITECTURE_EXECUTION_FLOW` (canonical, frozen 2025-12-13): scanner cadence is 30-second tick, OHLC bar duration is hourly. The 30s tick is the **decision cadence** (how often we evaluate); the 60-min bar is the **data substrate** (what we evaluate on).

### 2.3 What is NOT documented: any explicit reasoning for the 60-min choice itself

Searched all canonical historical docs. No "we considered 1-min vs 60-min and chose 60-min because..." paragraph exists. The 60-min was a **silent assumption** baked in from earliest builds, justified by the holding period rather than explicitly defended against shorter timeframes.

This is a documentation gap. If we revisit the decision, we should also document the reasoning this time around.

---

## 3. Are we losing edge with 60-min bars on crypto?

Honest answer: **depends on what edge you're trying to capture.**

**Where 60-min is sufficient:**
- Swing-trade momentum strategies (vwap_pullback, sma_trend_ride, breakout)
- Regime classification (regime durations are typically hours-to-days; 60-min captures the transitions adequately)
- Statistical features (vol, ADX, DI) — natural calibration scale
- Daily holding-period trades — 60-min bars give 24 bars per trade, sufficient for stop/target ratchet decisions

**Where 60-min may be costing edge:**
- **Mean reversion** — typical reversion periods (especially on crypto) are minutes to hours, not days. By the time a 60-min bar closes, half the move is gone.
- **Range trading** — range-bound regimes can flip in minutes; coarser sampling misses early entries/exits.
- **Entry timing within an already-identified setup** — once you've identified TFS regime at hourly granularity, the actual entry point optimization (when to pull the trigger within the next hour) is a finer-grain problem.
- **ORB and any opening-range strategies** — the opening range on 60-min bars IS the first 60-min bar, which means by the time it closes you've already missed the breakout. ORB on crypto would need 5-15 min bars to be meaningful.

**The Directive 10.7 cascade (1H → 15m → 5m) was the architectural answer to this** — recognized that some edge lives at finer timeframes, and built a layered approach where 1H provides context, 15m provides setup, 5m provides entry. But the cascade only fires in `signal-orchestrator` (active trading), not VTS. So today's calibration data captures only the hourly-grain picture.

**Is there empirical evidence we're losing edge?** Hard to say without an A/B comparison. The system has been profitable on the swing-style 60-min cadence. A 15m or 5m comparison would require a parallel calibration which we haven't run. Worth noting: equity day-traders typically operate on 5-15 min bars, NOT 1-min, and NOT hourly — there's a domain consensus on what timeframe matches typical trade horizon. Crypto's 24/7 nature plus higher volatility-per-unit-time suggests crypto's natural decision-cadence may be tighter than equity's.

**My judgment, not a recommendation yet:** crypto on 60-min for regime classification + entry signal generation is probably fine for the system as designed (swing-style, ~1-day holds). If we wanted to add intraday momentum trades (sub-1-hour horizons), we'd need to widen the timeframe set. But that's a strategy-mix expansion, not a "the current system is leaving money on the table" claim.

---

## 4. Should xStock switch to 60-min?

Three options on the table:

### Option A — xStock switches to 60-min bars, matches crypto

**How:** locally aggregate 1-min bars from `xstock_spot_ohlc_1m` into 60-min bars at read time. No new feed required; the data is already archived at 1-min granularity. eval-cycle reads aggregated bars instead of raw.

**Pros:**
- Apples-to-apples with crypto for regime classification + strategy gates → calibration carries over cleanly
- Strategy thresholds (cloned from crypto) become approximately valid
- Multi-tf modulator (B68.1) naturally extends to xstock once wired

**Cons:**
- **ORB is meaningless on 60-min bars** — the strategy was the one equity-native addition, and the whole point of Opening Range Breakout is sub-hourly. Either retire ORB or keep a 5-min path just for ORB
- xstock data IS arriving in 1-min granularity; aggregating to 60-min discards information we already pay to archive
- Equity day-traders generally don't operate on 1-hour bars — domain consensus is 5-15 min for active equity strategies

### Option B — xStock stays on 1-min, threshold-recalibrate for that substrate

**How:** keep the 1-min bar pull; recalibrate every threshold (regime, IMF, strategy gates) against archived 1-min xstock data. Use the calibration corpus we've been archiving for 2-3 weeks.

**Pros:**
- ORB works as designed
- Captures intraday equity dynamics (gap opens, mid-day momentum bursts)
- Matches equity-trader domain norm for active-strategy timeframes

**Cons:**
- Doubles the calibration work (regime + IMF + strategy gates all need redo for 1-min substrate)
- Diverges further from crypto architecture — future maintenance has two parallel parameter sets
- Volume / liquidity metrics on 1-min are noisier than on aggregated bars

### Option C — Mid-tier (5-15 min), single substrate for both

**How:** both asset classes pull 5-min OR 15-min bars; xstock aggregates from the 1-min archive, crypto pulls via Kraken at the new interval. Re-calibrate both.

**Pros:**
- Aligned substrate across asset classes
- Matches equity day-trader domain norm
- Still finer-grain than current crypto 60-min → potentially captures intraday edge crypto currently misses
- ORB works

**Cons:**
- Crypto recalibration is a much bigger lift (the entire calibration / drift dashboard / factor framework was tuned for 60-min)
- Higher API rate limit pressure on crypto (60-min cache TTL becomes 5-min or 15-min cache TTL; more frequent refetch)
- Disrupts a working system to gain hypothetical (not yet evidenced) edge

### My initial lean

**Option B for the xstock calibration sprint we're about to start.** Keep crypto on its 60-min cadence (working, calibrated, not the problem); recalibrate xstock thresholds for 1-min substrate using the archived data. The xstock calibration plan we just wrote covers this implicitly — Phase B.1 (regime classifier) needs to acknowledge it's tuning thresholds for 1-min input, not assume crypto-cloned values port over.

**Option C as a longer-term consideration** — worth bringing up with Langston as a future architectural decision after the xstock calibration generates evidence on whether finer-grain crypto would add edge.

**Option A is the wrong move** because it discards ORB's edge and discards data we're already archiving.

---

## 5. Asset-class behavioral differences (reactivity)

### 5.1 Crypto

- 24/7 trading
- Higher unit-time volatility than equities
- Continuous price discovery (no overnight gaps)
- Order book depth highly variable across pairs
- Major moves can be triggered by social media / exchange announcements at any hour

### 5.2 xStocks (Kraken-wrapped equities)

- US RTH 4 AM ET to 8 PM ET on the underlying (ARCA-aligned)
- Phase-1 names (TSLA / AAPL / SPY / etc.) trade continuously during 120-hour open window
- Overnight gaps real (vs prior session close)
- Volatility regime varies dramatically across session (open, mid-day, close)
- Earnings events produce scheduled regime-disruption (no crypto analog)

### 5.3 Is the reactivity difference real?

**Yes, but the direction may surprise.** Crypto is often MORE reactive minute-to-minute than equities — flash news / liquidations / cascade liquidations create sharp price moves on sub-hour timeframes. Equities (especially mid-caps and below) often have *quieter* minute-to-minute action with the action concentrated at open / earnings / news events.

So the argument "xstocks need 1-min granularity because they're more reactive" doesn't fully hold up. The reverse is more accurate for major pairs (BTC/ETH are extremely reactive). For RANGE-BOUND equity mid-cycle days, 1-min on xstock is mostly noise.

**The real reason xstock has 1-min granularity isn't reactivity — it's that the data source (WS push) delivers at that resolution by default.** We didn't choose 1-min; Kraken pushes us 1-min and we archive what comes. Crypto could ALSO archive 1-min (via WS) but we don't because the system was designed around REST pulls at 60-min intervals.

---

## 6. Kraken API rate limit picture

- Crypto: REST API, 2 req/sec configured (system-guards), 10 req/sec hard limit. OHLC fetched via REST; first cycle after restart ~60-70 API calls (~17s), subsequent cycles mostly cache hits (60-min TTL).
- xStocks: WS push, no per-request rate limit (subscription model). Data flows into archive at ~146 rows/sec aggregate across the universe (per the Phase 24 actuals in `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10c.7).
- crypto_perp: Kraken Futures REST, similar rate limit posture as crypto spot.

**Rate limit is not a constraint on the bar-interval decision today.** Crypto could pull 15-min bars (4× the request rate) and still stay well under the 8 req/sec safety budget. Xstock isn't rate-limited at all.

The "rate limit" framing in the original system design was about scaling concerns at universe expansion time (going from 30 pairs to 700+ pairs), not a hard ceiling at current load.

---

## 7. Recommended action

### 7.1 For the xStock calibration plan (immediate)

**Acknowledge in Phase B.1 that xstock bar substrate is 1-min, not 60-min.** The Phase B.1 regime calibration work needs to be **substrate-aware** — we're not just porting crypto thresholds to xstock, we're calibrating thresholds for a fundamentally different temporal substrate.

Specifically:
- Regime threshold values will land at different magnitudes than crypto (likely 10-15× smaller for vol-type thresholds)
- The 120-bar lookback (2 hours of 1-min) is a different statistical sample than crypto's 720-bar lookback (30 days of 60-min) — the calibration analysis needs to either match the temporal coverage by aggregating 1-min into longer bars OR explicitly redesign the regime model for the shorter lookback
- This belongs as an explicit Phase A.4 design call BEFORE Phase B.1 starts — "what is the xstock regime substrate and how does it differ statistically from crypto's?"

### 7.2 For the strategy-set audit (Phase D)

Strategy timeframe-fit needs explicit consideration:
- **Keep on whatever timeframe makes sense:** vwap_pullback, sma_trend_ride, mean_reversion, range_trade — these are timeframe-flexible; will work on 1-min with appropriate threshold tuning
- **Equity-native intraday:** ORB — requires 1-min OR 5-min; cannot work on 60-min
- **Consider for elimination:** strategies whose detect logic implicitly assumes hourly cadence and won't tune well to 1-min noise (pivot_shift's pivot calc, daily-pivot-based logic, etc.)

### 7.3 For the longer-term crypto question

**No urgent change recommended.** The 60-min crypto setup works, is calibrated, and has accumulated months of factor-calibration evidence. Switching cadence would invalidate that evidence. Worth a separate post-xstock-launch design call to evaluate whether crypto would benefit from finer-grain in addition to 60-min — but that's a multi-month project, not a fix for now.

### 7.4 Documentation gap to close

The 60-min choice has no explicit design-rationale doc. Add a section to `SYSTEM_MANUAL.md` (or a new ADR document) capturing:
- Why 60-min for crypto (swing-style holding period, regime stability at hourly grain, rate limit headroom)
- Why 1-min for xstock (substrate-imposed by WS feed)
- Why these are NOT directly comparable + what the calibration implications are

---

## 8. Specifically for the cross-CC convergence

The other CC session is investigating the same questions. We should converge on:

1. **Bar substrate finding** — confirm xstock's 1-min vs crypto's 60-min is real (verified here)
2. **Calibration implication** — confirm thresholds don't port across substrates (this affects the xstock calibration plan)
3. **Recommendation** — keep substrates as-is, recalibrate xstock for 1-min, document the rationale
4. **Strategy-set implication for Phase D** — ORB needs 1-min/5-min; some carryovers may need timeframe re-evaluation

The other CC's research may surface additional points (especially around Kyle's correctness/incorrectness on the 1-min B68.1 claim). Once both sessions agree on the picture, this can fold into the xstock calibration plan as a Phase A.4 substrate-design checkpoint.

---

*Code citations verified at HEAD on `migration/aws-supabase` as of 2026-05-15 morning. Document references checked against canonical archives at `G:\My Drive\Dawn Trader\DawnTrader_Canonical_Context_v2025-12-13\` and `G:\My Drive\Dawn Trader\Dawn Trader ChatGPT Discussion Threads - MD Files\`.*
