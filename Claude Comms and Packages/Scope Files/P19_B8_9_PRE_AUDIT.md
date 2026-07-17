# P19-B8.9 Step-2 pre-audit — venue-only AT-SOURCE (CC-A, 2026-07-17)

Counts-not-categories per Langston's Step-1 epistemics condition. All cites read at the working tree == origin (`d1a57ff5f`). B8.9a (the label micro-diff) is CLOSED and deployed — this pre-audit covers the remaining cuts (OBJ-1/2/3/5).

## OBJ-3 — the LKG/entry_seed per-caller VERDICT TABLE (trace-before-cut, the standing condition)

| Value | Writers | Readers | VERDICT |
|---|---|---|---|
| `entry_seed` | 1: `live-pricing-adapter.ts:826` (seeds the cache with the trade's entry price for a freshly-opened position; guarded — never overwrites a real price <60s old, :814-819) | union members only; the engine venue gate REJECTS it (post-B8.9a predicate); APM/routes treat it as non-REST display | **KEEP** — display bootstrap for the gap between open and first tick; never actionable. No change. |
| `last_known_good` | 3: adapter `:351` + `:380` (all-APIs-failed fetch path) + `:953` (the B8.9a stale re-serve — deliberate) | engine gate REJECTS (skip-rail engages); APM `:588` valuation fallback list (P&L continuity — Langston verified the exit path safe at B8.9a); 4× routes.ts display lists (12136/12542/12630/12791) | **KEEP** — it IS the honest "memory of a venue read" state and the substrate OBJ-5's venue-quiet display renders. No cut. |
| `binance` + `coingecko` (fetchers) | `fetchLivePrice` (:299+) tries **Binance FIRST**, then CoinGecko — third-party APIs are today's PRIMARY display fallback; `fetchFromBinance`/`fetchFromCoinGecko`/`binanceSymbolFor` | the union members; the 4 routes lists' `binance_rest`/`coingecko` entries; engine gate already rejects | **CUT (OBJ-1)** — rule-18 delete the fetchers + re-order `fetchLivePrice` to Kraken-REST-or-nothing; the union members + `binance_ws` shrink; DELETED_COMPONENTS_LOG entries. |
| `mock` | production-disabled (B9) | union member; entry_seed guard checks it | **KEEP the guard, CUT nothing** — dormant; full retirement rides the Phase-20 hardening sweep (a separate named item, not this batch's blast radius). |

## OBJ-2 — the structurally-wasted xstock REST asks
Mechanism: the 4 routes display sites + APM call `getPriceWithFallback(symbol, 5000)`; when an xstock symbol's cache entry goes stale (feed thins), the adapter's REST fallback fires `fetchLivePrice` — Binance/CoinGecko/Kraken-REST NONE of which carry tokenized equities (KNOWN_NONEXISTENT_NAMES; the engine-side equivalent is the `:933` equities-feed invariant) → guaranteed-failed fetches → LKG anyway. FIX: class-gate the adapter's REST-fallback leg — xstock symbols skip the fetch entirely and go straight to the stale-cache/LKG return (the venue-quiet state). This kills the measured ~46/window waste at its display-chain source.

## Enumerations (counts)
- Source-tag readers: 14 server / 0 client (on record from B8.9a; the 2 load-bearing gates now predicate-unified).
- `getPriceWithFallback` callers: 6 (engine crypto leg; APM :311 + :585; routes 12103/12511/12599/12760-region sites) — Langston already swept all six at B8.9a for the LKG change.
- Third-party fetcher call sites to delete: `fetchLivePrice`'s Binance + CoinGecko legs; `fetchFromBinance`, `fetchFromCoinGecko`, `binanceSymbolFor` definitions; the `binance_ws` updateCache member.
- The 4 duplicated `restFallbackSources` display lists: shrink members that become unrepresentable (`binance_rest`, `coingecko`); the 4-fold duplication itself noted as drift-prone — folding to one shared helper proposed as an in-batch tidy (small), NOT expanded scope.
- Client venue-quiet surface (OBJ-5): the price cells render values + em-dashes today; the venue-quiet STATE (explicit "venue quiet — last known $X @ t" vs a bare stale number) lands on the Open Trades current-price cell + the RTB current column. Reference specimens: BSX 20:37Z self-recovery + ROP 31fb9b88 (both now resolved-by-recovery, logs retained).

## Blast radius
`live-pricing-adapter.ts` (fetchers, chain order, unions, class-gate) · 4 routes.ts display lists (shrink) · client price cells (OBJ-5 state) · DELETED_COMPONENTS_LOG + SIM (source-union + venue-quiet cross-cutting state) + SysManual pricing chapter (the chain's honest shape) at close. UNTOUCHED: the engine actionable chain (correct since B8.9a), the equities feed, APM valuation logic (reads LKG as today), sizing, SQE/gates.

## Verification plan
Zero `fetchFromBinance|fetchFromCoinGecko` lines post-deploy · zero xstock REST-fallback fetches (log-gated) · REST rate re-measure vs the honest 0.28/sec baseline · APM valuation under venue-quiet demonstrated (stale name → LKG mark + honest UI state, no silent stale number) · §9.3 staging walk of the venue-quiet cell on Open Trades + RTB tabs.
