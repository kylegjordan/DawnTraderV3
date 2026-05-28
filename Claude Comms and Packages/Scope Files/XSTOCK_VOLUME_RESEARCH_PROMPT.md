# Research prompt — Kraken xStocks volume/liquidity data semantics (for sharing with other LLMs)

*Self-contained. Paste into other models. Asks them to confirm or challenge our findings and offer a better angle.*

---

I'm building an automated trading system that consumes Kraken's tokenized-stock ("xStocks") market-data feed, and I've hit a data-interpretation puzzle I want a second and third opinion on. Please reason from public knowledge of Kraken/Backed Finance/xStocks market structure, cite sources where you can, and tell me explicitly if you think I'm misinterpreting something.

**Background facts I believe I've established:**
1. xStocks are tokenized equities issued by Backed Finance, backed 1:1 by the underlying share, trading as tokens on Solana/Ethereum and on centralized venues (Kraken, Bybit). Kraken has acquired Backed and runs a unified execution layer called "xChange."
2. My system ingests a WebSocket feed at `wss://ws-equities.kraken.com`, subscribing to `ticker` and `ohlc` channels for symbols like `TSLA/USD`, `NVDA/USD` (no "x" suffix on this feed).
3. The ticker channel's `volume` field for `TSLA/USD` reads ~13.2 million and climbs through the day toward the `prev_day_volume` field of ~44.8 million. That ~44.8M matches the **real underlying Tesla stock's** daily share volume — NOT a thin tokenized-product volume. So I believe this `volume` field is the **underlying equity's** volume, not the xStock token's.
4. An independent aggregator (CoinGecko's "xstocks-ecosystem") shows the **token's** cross-venue 24h volume as roughly: TSLAx ~$10M, NVDAx ~$8.7M, AAPLx ~$11M, GOOGLx ~$23M (top), down to ~$0.3M for the smallest. So real tokenized-stock volumes are single-digit to low-tens of millions of dollars per day across ALL venues combined.
5. Kraken's own public consumer page for the Tesla token showed ~$926K of 24h volume — i.e., Kraken's own slice looks like a fraction of the ~$10M cross-venue total.
6. The `ohlc` channel's per-minute bars show volumes/trade-counts that are much smaller than the underlying but still larger than the ~$10M/day cross-venue figure implies — so even the bar volume doesn't cleanly match the token's real volume.

**What I find odd / want checked:** Kraken *owns* the company that issues these tokens and built its own execution system for them, yet the volume actually transacting *on Kraken* appears small relative to the whole tokenized-stock market. That seems backwards. Maybe I'm misreading what these volume numbers represent, or how xStock liquidity/execution is actually structured.

**Please answer:**
1. On Kraken's `ws-equities` ticker feed, what does the `volume` field actually represent for an xStock symbol — the underlying equity's consolidated volume, the token's on-Kraken volume, or something else? Is my read (that it's the underlying's volume) correct?
2. Is there a Kraken API/feed/field that gives the **token's own on-Kraken traded volume** specifically (as opposed to the underlying)?
3. When a Kraken account holder trades an xStock, what do they actually match against — Kraken's internal order book (other Kraken users + Kraken market makers), or is it routed/bridged to broader onchain/cross-venue liquidity via xChange? Practically, what bounds the size you can fill and how fast?
4. Given Kraken owns Backed and runs xChange, why might Kraken's *own-venue* volume be small relative to the cross-venue total? Is the bulk of xStock volume onchain (DEXs) or on other CEXs?
5. For an automated system that places orders through Kraken's order API, what is the **right, authoritative data source** for "how much of this token can I realistically buy/sell right now without getting stuck" — order-book depth, a specific volume field, a published Kraken statistic, or something else?
6. Am I looking at this from the wrong angle in any way? What would you verify or measure that I haven't mentioned?

Please be concrete, flag uncertainty, and cite Kraken docs / Backed docs / reputable sources where possible.
