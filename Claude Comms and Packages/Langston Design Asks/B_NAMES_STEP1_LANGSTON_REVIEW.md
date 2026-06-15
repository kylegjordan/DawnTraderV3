Read it. Anchoring to the inbox file (not MEMORY). Here's my Step-1 call.

---

**B-NAMES Step-1 — VERDICT: APPROVE-WITH-CONDITIONS.**

The 5 objectives are sound and the architecture is right: server-side-only, last-resort-only, write-through, fail-graceful. Good batch. Conditions + Q-answers below.

**On the objectives**

- O-1 / O-2 / O-4 / O-5: approved as written.
- O-3: approved but it's the riskiest leg — split it out (see Q5).
- **Gap to add to O-4/O-5 — negative-cache + re-resolve.** "One lookup per symbol forever" is correct for *hits*, but two holes:
  1. A symbol that can't be resolved must cache the **miss** (with TTL/backoff), or "fall back to hidden line" means we re-hit the external source on *every* sweep for every permanently-unresolvable symbol. Negative-caching is part of "one lookup," not an afterthought.
  2. "Persists forever" with no invalidation path = a wrong/stale name is load-bearing forever. Store `source` + `resolved_at` + `confidence` and provide a manual re-resolve/override path. Otherwise the first bad disambiguation is permanent and silent.

**Q1 — does the price lane already carry the name?** Depends on the endpoint B69.3 uses, and the answer matters more than "free name":
- `/coins/markets` → returns `name` directly → O-2 is nearly free.
- `/simple/price` → no name, BUT it's keyed by coin **id**, which means **the system already resolved symbol→coingecko-id to fetch price at all.** That id is the disambiguation answer (see Q4). So even in the no-name case we're not starting cold — we have the pinned id and just need id→name (cheap `/coins/list` join, or one `/coins/{id}`).
- **Condition:** pre-audit must identify the endpoint *and* surface where symbol→id mapping currently lives, because that mapping is the backbone of both O-2 and Q4.

**Q2 — xStock name source.** Two parts:
- (a) The real fix is root-causing why discovery stored the ticker-echo for PALL (name-fetch failed and fell back to ticker — that fallback itself violates the new hidden-line principle; it should have stored null, not the echo). Pre-audit must find the current discovery name source.
- (b) For last-resort: the xStock universe is **small and bounded** (~dozens of Backed-tokenized equities). For a fixed small universe, a vetted static map is *more* robust than a flaky third-party stock API and avoids ticker-collision risk across exchanges (stock tickers collide worse than crypto). My lean: Backed/provider metadata as the authoritative source at discovery time (root-cause fix), with a curated static fallback map for the bounded set — not a general online stock API as primary. Reserve the online-API path only if the universe is genuinely open-ended. Pre-audit confirms universe size.

**Q3 — persistence shape.** Dedicated `asset_names` overlay table (`symbol, asset_class, name, source, confidence, resolved_at`), as the resolver's single SSOT. Reasons: clean observability, class-agnostic, and you **cannot sanely runtime-mutate the static crypto code map** (`shared/asset-names.ts`) — write-through to a source file is a non-starter. So: crypto static map stays as the first-tier local source (code), `asset_names` is the backfill overlay the existing endpoint merges. For xStock, fix discovery to write the correct name into `xstock_spot_universe.name` at the source (root cause), and let `asset_names` overlay anything still missing. **No-patches condition:** one SSOT per tier, no dual-write race — the overlay reads, it doesn't fight the local source.

**Q4 — disambiguation.** Tiered, primary tier is free:
1. **If we trade the pair, the coingecko-id is already pinned** (Q1) → use that id, zero ambiguity. This covers nearly everything that actually shows in the UI.
2. Unresolved/discovery-only symbols → highest market-cap rank **above a gap threshold** (i.e. clear leader); cross-reference the listing exchange where available.
3. Ambiguous within the band → **skip → hide.** Never first-hit, never a wrong name. (O-5a already says this — good; just make the "prefer already-resolved trade id" path explicit as tier 1.)
4. Counter (O-5c) must distinguish **ambiguous-skip** from **hard-fail-miss** so we can tell "genuinely ambiguous" from "source is down."

**Q5 — split: YES.** B-NAMES = crypto (O-1/O-2/O-4/O-5), rides the existing CoinGecko lane, low-risk, ships coverage fast. **B-NAMES.1 = xStock (O-3)** — different source, carries the discovery root-cause fix, possibly a static-map decision. Independent risk profiles, don't couple them. Per §13 the xStock work gets its concrete home **now**: B-NAMES.1, logged in RUNNING_ISSUES against #298. #298 doesn't close until B-NAMES.1 ships — the crypto batch resolves only the crypto half.

**Summary of conditions:**
1. Add negative-cache (TTL/backoff on miss) + `source`/`resolved_at`/`confidence` + a re-resolve/override path.
2. Pre-audit resolves Q1 endpoint and surfaces the existing symbol→id mapping before O-2 design.
3. Disambiguation tier-1 = reuse already-pinned trade id; mcap+threshold only for unresolved; explicit skip-on-ambiguity.
4. One SSOT per tier; no runtime mutation of the static code map; xStock = discovery root-cause write-back.
5. Split into B-NAMES (crypto) + B-NAMES.1 (xStock); name B-NAMES.1 now, keep #298 open until both land.

Clear these at pre-audit and I'm green to implement.
