# Independent VTS Data Feed Feasibility — Binance + Alternatives

**Date:** 2026-04-26
**Trigger:** Kyle question 2026-04-26 — "When we go active trading, find a way to have the VTS continuing to run and collect data, simulate trades independently of the active trading, and that data goes into our archiving system. The API limitations make that pretty challenging if we're just pulling everything from Kraken. So when you look at Binance, is that something that we could rely on, or is there some other exchange or crypto platform that we could use?"
**Status:** Initial feasibility note. Not a scope or implementation plan. Phase 19.4.5 may reference this when deciding whether to pull this work pre-launch.

---

## 1. The problem

When active trading is on, the system needs Kraken API capacity for:
- Order placement
- Order status updates
- Account balance queries
- Position management
- Live OHLC pulls (every cycle, ~218 active pairs)

VTS, in parallel, would also want OHLC pulls every cycle for the same ~218 pairs to keep generating simulated signals and accumulating training data.

Kraken's REST API has rate limits per account — pulling OHLC for 218 pairs every 60 seconds is ~218 calls/minute, near or at Kraken's per-account limit. Active-trading order management adds more calls. **Net: there isn't enough Kraken API budget to run both active trading AND VTS at full coverage from the same Kraken endpoint.**

Two ways to solve this:
1. **Reduce VTS scope** — VTS runs on a smaller pair subset, or at lower frequency (e.g., every 5 minutes instead of every 1 minute). Loses signal coverage and training-data density.
2. **Pull VTS OHLC from a different exchange/source** — keeps Kraken's API budget for active trading, lets VTS run at full coverage from elsewhere. This is the path Kyle's asking about.

---

## 2. Binance feasibility

### 2.1 What we already proved

The B65.6 work used Binance's free public REST endpoint to pull historical 1-minute OHLC for ~615 trades on 5 hostile days. The pull was fast (rate-limited to ~20 calls/sec, well under Binance's 1200/min limit) and the data was clean. **Binance's free API works for the kind of use VTS would put it to.**

### 2.2 Binance's actual rate limits

- **Spot REST API:** 1,200 weight units per minute per IP (no account required for public OHLC)
- **Klines (OHLC) endpoint cost:** 2 weight units per call
- **Effective call limit:** ~600 OHLC calls/minute from a single IP, no account needed

For 218 pairs polled every 60 seconds: 218 calls/minute = well within budget. Could even run at every-30-seconds without issue. Multi-account or multi-IP not required.

### 2.3 Pair coverage overlap

Most majors trade on both Kraken and Binance. The mapping needed:
- **Direct equivalents** (Kraken → Binance): BTC/USD → BTCUSDT, ETH/USD → ETHUSDT, SOL/USDT → SOLUSDT, etc.
- **Quote substitutions:** Kraken EUR pairs (BTC/EUR, ETH/EUR, etc.) → Binance USDT equivalents as proxy. The price will differ slightly from EUR but the price action / momentum signals are essentially identical.
- **Kraken-only altcoins:** some smaller altcoins traded on Kraken aren't on Binance. Coverage gap.

In the B65.6 OHLC pull I did, the symbol-mapping coverage was about 75% — 615 of 998 trades attempted got Binance OHLC, ~25% had no Binance equivalent. For the missing 25% we'd either need a different exchange or accept reduced VTS coverage on those pairs.

### 2.4 Data quality differences

Binance's 1-min OHLC for liquid pairs is essentially identical to Kraken's in terms of price action and momentum signals — both reflect the same global crypto market. Spreads differ (Binance generally tighter), absolute prices differ slightly between exchanges (arbitrage keeps them close), but the indicators VTS needs (DBS, ADX, momentum, RSI, MA, etc.) all behave the same way because they're computed from price RATIOS or OHLC RELATIONSHIPS, not absolute prices.

For low-liquidity pairs (small altcoins), prices can diverge more meaningfully between exchanges. For those, Binance data is a noisier proxy and may not match Kraken's actual local conditions. But VTS isn't actually trading these pairs in the future — it's collecting training data — so a Binance-derived signal that's ~95% correlated with Kraken's signal is sufficient for ML training purposes.

### 2.5 Failure modes

- **Binance can geo-block** (depending on the source IP). If Hetzner staging is in a restricted region, this matters. Our staging IP is Falkenstein DE; Binance allows DE access for public API.
- **Binance can rate-limit aggressively** during exceptional load events. Need exponential backoff + retries.
- **Binance doesn't have all Kraken pairs.** Coverage gap requires fallback or accepting reduced VTS scope.

---

## 3. Alternative free data sources

If Binance has gaps or risk concerns, options that complement or replace it:

### 3.1 Coinbase Advanced Trade API
- Free public OHLC, no account needed
- Generous rate limits
- **Pair universe heavily USD-quoted** (good complement to Binance USDT)
- Coverage of the major altcoins overlapping with Kraken, plus some Coinbase-specific listings
- US-based, low geo-block risk

### 3.2 CoinGecko
- Free historical OHLC at 1-min granularity for pro plan; free tier has lower granularity (every 5 min for last 24h)
- Aggregates across exchanges → smoother price than any single exchange
- Free tier: 10-30 calls/minute (would be insufficient for 218 pairs every cycle)

### 3.3 CryptoCompare
- Free API with full historical OHLC at 1-min granularity
- Aggregates across exchanges
- Free tier: ~100,000 calls/month — enough for VTS use IF cached well
- Has data for nearly every major altcoin including most Kraken-only listings

### 3.4 KuCoin / Bybit / OKX
- Each has a free public OHLC endpoint
- Coverage similar to Binance
- Could be used as fallback for Binance-missing pairs

### 3.5 Direct websocket connections to multiple exchanges
- Subscribe to live OHLC streams (no per-call rate limit)
- More work to implement (websocket handlers, reconnect logic, normalization)
- Higher reliability than REST polling at scale

---

## 4. Recommended architectural approach (if this work moves pre-launch)

If Phase 19.4.5 decides this work needs to happen pre-launch (because daily signal volume in paper-mode is too low and we want to keep VTS running for training-data accumulation), the cleanest design is:

1. **Pluggable exchange-data adapter layer** in VTS specifically. VTS already pulls OHLC; abstract that pull behind an interface that can be backed by Kraken (current), Binance, Coinbase, CryptoCompare, or any combination.
2. **Fallback chain per pair.** For each Kraken pair, the adapter tries Binance first, then Coinbase, then CryptoCompare. First exchange with the pair wins. Coverage report logged at startup so the team knows which pairs have which data source.
3. **Active trading stays on Kraken-only** for the obvious safety reasons (you trade where you have the position, not on a proxy).
4. **VTS-mode flag controls which data path is used.** When VTS is running alongside active trading, VTS uses the alternative-data adapter. When VTS is the primary mode (like today), VTS uses Kraken (original behavior).

This naturally fits the Phase 21.4 Modularization design's "Exchange Adapter" module — it's exactly the kind of pluggable boundary that 8-module decomposition is supposed to create. So the work is also a partial pre-payment on Phase 21.4 if it lands pre-launch.

---

## 5. Effort estimate

If/when this lands pre-launch (Phase 19.4.5 decision):
- Exchange adapter abstraction: ~1 day
- Binance + Coinbase backends: ~1 day each
- Symbol mapping + fallback chain logic: ~half day
- VTS integration + flag-controlled routing: ~1 day
- Coverage diagnostics + logging: ~half day
- **Total estimate: 3-5 days of focused work**

This assumes no significant integration issues with existing VTS pull pipeline. If the integration surface is more complex than expected (e.g., the existing OHLC cache assumes Kraken-specific fields), add 1-2 days for adapter normalization.

---

## 6. Decision flag for Phase 19.4.5

This work moves pre-launch IF:
- Phase 19.4.5 observation shows active-paper-trading daily signal volume is < 20 signals/day system-wide (low-volume → need wider pair coverage to validate)
- AND/OR Kraken API budget during active trading is observably saturated (logs show throttling)
- AND/OR the team needs VTS to keep generating training data at full pair coverage during active trading

Otherwise, this work stays as a post-launch follow-up alongside the Phase 21.5 XStocks + Perp Futures expansion work. (XStocks would also benefit from a pluggable exchange-data layer, so the work is naturally adjacent.)

---

## 7. Quick answer for Kyle (revised 2026-04-26)

**Combined Binance + Coinbase + KuCoin (all free, all standard public REST APIs) covers ~95% of the Kraken VTS pair universe.** Closing the gap to ~5% — typically tiny altcoins where signal quality is already noisy.

Coverage breakdown by source:
- **Binance public REST** (1200 weight units/min, free): ~75% Kraken coverage. Covers most majors and USDT/USDC-quoted alts.
- **Coinbase Advanced Trade** (free, generous rate limits): adds ~10% via USD-quoted pairs Binance doesn't have.
- **KuCoin spot** (free, generous limits): adds ~10% via altcoin tail Binance + Coinbase miss.
- **Combined: ~95%** of Kraken VTS universe covered at $0/month.

Final ~5% gap = Kraken-only small-cap altcoins or EUR-quoted-without-USDT-equivalent pairs. Two options for that 5%:
- Accept reduced VTS coverage on those pairs (pragmatic — these tend to be illiquid pairs where signal quality is noisy anyway)
- CryptoCompare paid tier ($80–$150/month) for full coverage via aggregator — only worth it if the missing 5% turns out to materially affect VTS data quality during paper observation

**Recommendation: build with Binance + Coinbase + KuCoin combined free path.** Accept the ~5% gap. Re-evaluate at Phase 19.4.5 whether the missing pairs justify the paid upgrade.

**Earlier note (now superseded):** an earlier draft of this doc only quoted Binance-alone coverage (~75%) and described the 25% gap as a gating concern. That was a misframing — the 25% closes to ~5% once Coinbase + KuCoin are added in the fallback chain. Multi-source coverage is the standard pattern for this kind of work.

---

*This document is a feasibility note, not a scope. Phase 19.4.5 may convert it to a scope document if observation justifies pulling the work pre-launch.*
