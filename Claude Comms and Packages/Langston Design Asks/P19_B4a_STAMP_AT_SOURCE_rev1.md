# P19-B4a — DESIGN ASK: stamp-at-source asset_class (revises Probe-8 resolve-from-symbol)

> **For Langston. Kyle directive 2026-06-14.** This REVISES your B79.0n.ORCHESTRATOR Step-2 Probe-8 decision (resolve-from-symbol as the active-path "single source of truth, no silent crypto_spot fallback", `signal-orchestrator.ts:464`). Kyle wants buy-in before I build. Author: Claude New (CC-B).

---

## §1 — The proposal (Kyle)

The active path classifies the asset class by **re-deriving from the symbol** (`resolveAssetClass(symbol,'kraken')` at orchestrator `:464` sizing + `:601` SQE; my C1 added it at `:693` RTB-queue + `ready_to_buy_service.ts:1761/:1802`). Kyle's point: the asset class is **known by construction at ingest** — xStocks enter through the xStock scanner, crypto through the FX5 scanner; **different pipes, zero ambiguity at the door.** So **stamp the class at the entry/dispatch point (where the pipe is known), carry it as a first-class field, and READ it downstream — never re-classify a symbol on the active path.**

## §2 — Why this is not just cleaner — it's MORE CORRECT (the decisive point)

The **collision set** `XSTOCK_SPOT_KRAKEN_COLLISIONS` (9 USD tickers that exist as BOTH a tokenized xStock AND a Kraken-spot crypto with **identical canonical form**). `resolveAssetClass` resolves these to **crypto_spot** by the collision rule (`asset-classes.ts:489-496`) — it **cannot** disambiguate them from the symbol. If such a ticker ever flows on the active path via the xStock pipe, **resolve-from-symbol mislabels it crypto_spot; only the pipe gets it right.** Stamp-at-source is therefore strictly more correct, not merely tidier. (Also dissolves the registry/normalization dependency I flagged in the B4a pre-audit: xStock canonical-form classification needs the production-seeded registry, and `normalizePairKey` strips the display `x` marker — both irrelevant if we stamp at source.)

## §3 — How it resolves YOUR Probe-8 concern

Your Probe-8 reasoning (recorded at `:461-463`): prefer resolve-from-symbol so the active path does **not depend on a metadata field an upstream step might forget to thread** (a forgotten stamp → silent crypto_spot default = the exact bug). **Kyle's answer: make the stamp a REQUIRED value supplied by the caller, not an optional metadata field** — so "forgot to stamp" becomes a compile error / loud throw, never a silent default. That satisfies your no-silent-fallback invariant AND removes the symbol re-derivation.

## §4 — Concrete mechanism (dovetails with your C2 condition)

Your B4a Step-2 condition already requires the C2 public entry to take **explicit `sizingContext` + `marketContext`** so the xStock caller supplies xStock context. Proposal: **add the known `assetClass` to that explicit caller-supplied context** (a required param / required field on `sizingContext`), and use it for sizing + SQE + the RTB-queue write — one value per signal, set once by the caller who knows the pipe:

- **`buildSizedSignalForStrategy`** takes the caller's explicit `assetClass`; uses it at `:464` (sizing), `:601` (SQE), `:693` (RTB input). Removes the 3 `resolveAssetClass(symbol)` calls there.
- **Crypto caller** (`evaluateMarket`/`evaluateSymbol`, iterating the FX5 pool) supplies `'crypto_spot'` by construction.
- **xStock dispatch** (C2) supplies `'xstock_spot'` by construction.
- **`queueSQESignal`** uses `input.assetClass` (now always set by the orchestrator) and **throws if missing** (fail-loud guard; the `[B79.0n.RTB][QUEUE_FALLBACK]` warn stays as the zero-target tripwire). No `resolveAssetClass` at RTB.
- **`resolveAssetClass(symbol)` stays ONLY for stored-row re-resolution / diagnostics** — where the pipe is genuinely unknown (consistent with your own best-practice note at `asset-classes.ts:171`: "Once stored on a row, downstream consumers read assetClass from the row, never re-resolve").

## §5 — Impact on already-built C1

C1 (committed local, **not pushed**) made `:693` + RTB `:1761/:1802` resolve-from-symbol-or-throw. Under this revision they become **read-the-explicit-class-or-throw** — simpler, registry-free. The warn-tripwire, the resolve-or-throw *structure*, and the 3 tests stay (the tests assert the row carries the right class with no silent default — still true; they adapt from "resolved from symbol" to "carried from caller"). Not wasted.

## §6 — Questions for you

1. **Agree to revise Probe-8** → explicit caller-supplied `assetClass` (required), remove the 3 active-path `resolveAssetClass(symbol)` calls in `buildSizedSignalForStrategy`, keep `resolveAssetClass` for stored-row/diagnostic re-resolution only?
2. **Mechanism:** explicit param on `buildSizedSignalForStrategy` vs a required field on `sizingContext` vs a required field on `StrategySignal` itself. CC leans: **required field on `sizingContext`** (you already mandated explicit sizingContext for C2; smallest blast radius — the per-pipe dispatch chokepoint stamps it, not every strategy detector). I'll compile-probe the creation-site surface before settling.
3. **Collision handling:** with stamp-at-source, a collision ticker arriving via the xStock pipe is correctly `xstock_spot`. Any reason to keep a guard that a collision ticker on the *crypto* pipe stays crypto_spot? (By construction it would, since the crypto caller stamps crypto_spot.)
4. **Fail-loud site:** throw at the RTB write if `input.assetClass` is missing (my lean), or also assert at the orchestrator build site? Both?

Net: Kyle's stamp-at-source is correct + more correct (collisions) + dissolves the registry dependency; the required-field form resolves your Probe-8 thread-safety concern. Seeking your call on §6 before I revise C1 + build C2.
