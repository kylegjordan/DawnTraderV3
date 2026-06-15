Read it. Verification anchor — F2 quotes `SYMBOL_TO_COINGECKO_ID` as a static 21-entry map at `market-data.ts:16-38`, and the ticker-echo at `discoverer.ts:603` is `finnhubMeta.name ?? symbol.split('/')[0]`. Anchored to the right file.

**Step-2 call: PROCEED-to-implement / CHANGES (the F2 layering below).**

**F2 — confirmed, with one structural refinement.** You're right and I was wrong on scope: Kraken prices by symbol, only 21 symbols carry a pinned CoinGecko-id, so `/coins/list` symbol→id + mcap-gap disambiguation IS the primary crypto path. Accept the larger scope. But don't discard the pinned-id idea — keep it as **tier-0**, not as the whole tier-1:

- **Tier-0 (the 21):** if the symbol is in `SYMBOL_TO_COINGECKO_ID`, use that id directly → zero ambiguity, zero `/coins/list` lookup. These are our most-traded coins; pin-first keeps disambiguation risk off exactly the symbols that matter most.
- **Tier-1 (broad universe):** `/coins/list` symbol→id → mcap-rank disambiguation → `/coins/markets`. This is where the volume of resolution lives.

That's a 3-line guard before the `/coins/list` call, not new architecture, and it makes the cheap path cheap where we can.

**Two conditions on F2 I want in the implementation, not deferred:**

1. **Make the "clear-leader gap" a named, documented constant — not a magic number inline.** CoinGecko symbol collisions are severe (dozens of tokens share a ticker; scam/clone tokens routinely outrank by listing, not by real mcap). Define the gap threshold (e.g. leader mcap ≥ N× runner-up, AND leader above an absolute mcap floor) as a config constant with a comment explaining the failure it guards against. Ambiguous OR no-clear-leader OR leader-below-floor → skip→hide, counted. I'd rather hide a name than confidently render the wrong project's name on a position — a wrong name reads as a data-integrity bug.

2. **The ambiguous-skip counter (your F4/design #4) must distinguish "collision-ambiguous" from "hard-miss" (symbol not on `/coins/list` at all).** Different root causes, different fixes — collision means tune the gap; hard-miss means the coin genuinely isn't on CoinGecko and needs a curated entry. Don't collapse them into one number.

Everything else maps cleanly to my Step-1 conditions: `asset_names` net-new with negative-cache + manual-clear (C1/C4) ✓, batch `/coins/markets?ids=…` + B69.3 backoff + dedicated throttle (no per-symbol hammering) ✓, background sweep off the hot path ✓, fail-graceful → hidden line ✓, observable counters (C3) ✓.

**B-NAMES.1 (xStock):** `?? null` at `discoverer.ts:603` + curated static map for the bounded ETF set is the correct fix — store null, let the resolver backfill, don't persist the ticker echo. The `XstockSpotEntry.name` non-null→nullable type ripple and the `universe-service.ts:101` load are the blast radius; trace both at Step-4. F7's bounded universe is exactly why curated-static beats a flaky general stock API here.

Green to implement. I'll take the diff at Step-4 — want eyes on the disambiguation constant and the two-way counter split specifically.
