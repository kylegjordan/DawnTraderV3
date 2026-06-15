# B-NAMES — Asset Name Resolution Service (last-resort online lookup) — SCOPE

**Batch:** B-NAMES · **Date:** 2026-06-15 · **Author:** Claude New (CC-B) · **Step:** 1 (Planning + Scope)
**Status:** _DRAFT — pending Langston Step-1 review._
**Implements:** RUNNING_ISSUES #298 (the data-quality half — the structural display fix already shipped in commit `534d582ed`).
**Origin:** Kyle directive 2026-06-15 — when the company/token name doesn't arrive with the feed, do a last-resort online lookup (CoinGecko for crypto, a stock-metadata source for xStocks) and FILL it, so unnamed symbols (PALL, CHIP, XRP-class) resolve automatically instead of showing a hidden/blank name line.

---

## 0. Problem recap (from #298, verified)

The Symbol-column name comes from two LOCAL sources: crypto → the static `CRYPTO_NAMES` map (`shared/asset-names.ts`); xStock → `xstock_spot_universe.name` (DB, via the `/api/xstocks/asset-names` overlay, populated by universe-discovery). When the local source MISSES or stores a **ticker-echo** (e.g. `XRP:'XRP'`, or PALL's DB row `name='PALL'`), the name line now hides (shipped fix). This batch ADDS an authoritative last-resort lookup so those names get FILLED, not hidden.

---

## 1. Objectives (numbered, verifiable)

**O-1 — A server-side name-resolution service with a strict fallback chain.** Resolution order (per Kyle's "last resort" framing): (1) local source (crypto map / xStock DB) → (2) if MISS or ticker-echo → (3) **last-resort external lookup** → (4) if that fails/ambiguous → the clean hidden line (already shipped). The external lookup runs **server-side only** (never per-browser), and only as the last step.

**O-2 — Crypto names via CoinGecko (reuse the existing integration).** Resolve real token names from CoinGecko. **Pre-audit must confirm whether the system's EXISTING CoinGecko price-fetch already carries the canonical `name`** (if so, crypto names are nearly free — read them from data we already pull). Otherwise, a `/coins/list` (symbol→id→name) lookup. Either way, ride the **existing rate-limited + 429-backoff CoinGecko lane** (B69.3) — no new un-throttled caller.

**O-3 — xStock company names + fix the discovery name-fetch gap.** xStocks are tokenized STOCKS — CoinGecko does NOT cover them. (a) Fix WHY xStock universe-discovery stored the ticker for PALL (its name-fetch failed/returned the ticker); (b) add a last-resort stock-company-name source for xStocks that miss. Pre-audit identifies the current discovery name source + the best last-resort stock-name source.

**O-4 — Write-through persistence (one-time lookup, fills permanently).** A successful external resolution is PERSISTED (crypto → a names store; xStock → `xstock_spot_universe.name` / an overrides table) so the symbol is resolved ONCE and reused everywhere forever — never re-hitting the API for the same symbol.

**O-5 — Disambiguation + fail-graceful + observable.** (a) **Disambiguation:** a ticker (e.g. CHIP) can map to MULTIPLE CoinGecko coins — pick the RIGHT one (the one we trade / highest market cap / cross-referenced with the exchange listing), never the first hit, never a wrong name. (b) **Fail-graceful:** any external failure/ambiguity → fall back to the hidden line; NEVER block the UI, NEVER throw into the render path. (c) **Observable:** count lookups / hits / misses / ambiguous-skips (B3b-style counter) so we can see coverage + catch a source going down.

---

## 2. Verification criteria (outcomes)

- A symbol that previously hid its name (CHIP, PALL) shows its **real, correct** name in the UI after the resolver fills it (UI-navigated per §9.3).
- The external lookup fires **only on a local miss/echo** (proven by the observable counter — not on every render, not for already-named symbols).
- The resolved name is **persisted** — a second load of the same symbol does NOT re-hit the external API (counter shows one lookup per symbol, then cache hits).
- **Disambiguation** test: an ambiguous ticker resolves to the intended coin (not the first/wrong match), or is skipped (hidden) if it can't be disambiguated confidently — NEVER a wrong name.
- **Fail-graceful** test: simulate an external-source failure → the line hides cleanly, no error in the render path, no UI block.
- Rate-limit lane respected (no new un-throttled CoinGecko caller; existing backoff honored).
- Bench green (tsc baseline + vitest) · CI all-4-green · staging deploy HTTP 200.

---

## 3. Proposed shape (Langston to refine at pre-audit)

- New server-side `asset-name-resolver` service: `resolveAndCacheName(symbol, assetClass)` → tries local → external → persists → returns. Called on a background sweep of unnamed open/closed trade symbols (NOT in the request hot path).
- Crypto adapter (CoinGecko, reuse existing client + lane + the price-data name if present).
- xStock adapter (stock-name source) + the discovery name-fetch fix.
- Persistence: crypto names store (new table or extend an existing one) + `xstock_spot_universe.name` write-back.
- The client keeps reading the LOCAL map/overlay (unchanged) — which the service backfills; no client-side external calls.

---

## 4. Open questions for Langston (Step-1)

- **Q1** — does the existing CoinGecko price integration already expose the canonical coin `name` (making O-2 nearly free), or is a separate `/coins/list` lookup needed?
- **Q2** — what does xStock universe-discovery currently use to fetch company names, and what's the best last-resort stock-name source (the xStock provider's metadata? a free stock-symbol API?)?
- **Q3** — persistence shape: a dedicated `asset_names` table (mode/class-agnostic, symbol→name+source+resolved_at), or extend the per-class stores (crypto map-as-DB + xstock_spot_universe)?
- **Q4** — disambiguation rule: market-cap-rank? cross-reference the exchange the pair trades on? a confidence threshold below which we skip (hide) rather than risk a wrong name?
- **Q5** — split crypto-first (O-1/O-2/O-4/O-5) as B-NAMES and xStock (O-3) as B-NAMES.1, since they use different sources + the xStock side carries the discovery-fix? Or one batch?

---

## 5. Governance at close

Tier-1: BATCH_CATALOG, PHASE_HISTORY, MEMORY (3-way), completion report. Tier-2: SIM (the new resolver service + its place in the name-resolution chain + the CoinGecko/stock-name dependencies), SYSTEM_MANUAL (the name-resolution architecture), RUNNING_ISSUES (#298 — stays OPEN until BOTH B-NAMES + B-NAMES.1 land), CHANGES_AND_FIXES. Close gates: §7.1 sync both-directions-0, rule-19 CI all-4-green, push from Google-Drive.

---

## 6. Langston Step-1 outcome (2026-06-15) — APPROVE-WITH-CONDITIONS (all accepted, consensus)

Full review: `Claude Comms and Packages/Langston Design Asks/B_NAMES_STEP1_LANGSTON_REVIEW.md`.

**★ SPLIT RATIFIED (Q5):** **B-NAMES = crypto** (O-1/O-2/O-4/O-5; rides the existing CoinGecko lane, low-risk, ships coverage fast). **B-NAMES.1 = xStock** (O-3; different source + carries the discovery name-fetch root-cause fix). Independent risk profiles. **#298 stays OPEN until BOTH land** — the crypto batch resolves only the crypto half.

**Conditions (all accepted):**
- **C1 — Negative-cache + invalidation (the gap I missed).** Cache MISSES too (TTL/backoff) so a permanently-unresolvable symbol isn't re-hit every sweep — negative-caching is part of "one lookup," not an afterthought. AND store `source` + `resolved_at` + `confidence` + a manual **re-resolve/override path**, so a wrong disambiguation isn't permanent + silent (otherwise the first bad name is load-bearing forever).
- **C2 — Pre-audit resolves Q1 endpoint + surfaces the existing symbol→id mapping** BEFORE O-2 design (that mapping is the backbone of both O-2 and the disambiguation).
- **C3 — Disambiguation tiers (Q4):** **tier-1 = reuse the already-pinned trade CoinGecko-id** (if we trade the pair we ALREADY resolved symbol→id to fetch price → zero ambiguity, covers nearly everything in the UI); tier-2 = highest market-cap rank ABOVE a clear-leader gap threshold (+ exchange cross-ref) for unresolved/discovery-only symbols; tier-3 = **ambiguous → skip → hide** (never first-hit, never a wrong name). The counter must distinguish **ambiguous-skip** from **hard-fail-miss** (so we can tell "genuinely ambiguous" from "source is down").
- **C4 — One SSOT per tier; no runtime mutation of the static code map (Q3).** Persistence = a dedicated **`asset_names` overlay table** (`symbol, asset_class, name, source, confidence, resolved_at`) — the resolver's backfill SSOT, merged by the existing `/api/xstocks/asset-names`-style endpoint. The crypto static map STAYS as tier-1 local source (code — you cannot write-through to a source file). For xStock, fix discovery to write the correct name into `xstock_spot_universe.name` AT SOURCE; `asset_names` overlays anything still missing. The overlay READS, it doesn't fight the local source (no dual-write race).
- **C5 — Discovery ticker-echo is itself a bug (Q2a):** the xStock discovery name-fetch fell back to storing the ticker (PALL→'PALL') — that fallback violates the new hidden-line principle; it should store NULL, not the echo. Root-cause it in B-NAMES.1.

**Q-answers (Langston):**
- **Q1:** depends on the B69.3 endpoint — `/coins/markets` returns `name` (nearly free); `/simple/price` has no name BUT is keyed by coin **id** (so symbol→id is ALREADY resolved = the disambiguation answer; id→name is a cheap `/coins/list` join or one `/coins/{id}`). Pre-audit identifies the endpoint + where symbol→id lives.
- **Q2:** xStock universe is SMALL + bounded (~dozens of Backed-tokenized equities). For a fixed small set, a **vetted static map + provider (Backed) metadata at discovery is MORE robust than a flaky third-party stock API** (stock tickers collide worse than crypto). Online stock-API path reserved only if the universe is genuinely open-ended. Pre-audit confirms universe size.
- **Q3 → C4.** **Q4 → C3.** **Q5 → the split above.**

**NEXT:** Step-2 pre-audit — resolve C2 (CoinGecko endpoint + symbol→id mapping location), the xStock universe size + current discovery name source (B-NAMES.1), then implement B-NAMES (crypto) first. "Clear these at pre-audit and I'm green to implement" (Langston).
