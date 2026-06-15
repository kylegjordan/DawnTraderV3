# B-NAMES (crypto — #298 backfill half) — Completion Report

**Batch:** B-NAMES (crypto) · **Date:** 2026-06-15 · **Author:** Claude New (CC-B)
**Build commit:** `f0cee92e7` (+ Step-4 pin-bypass fix commit) · **CI:** run `27547075378` all-4-green (re-confirmed on the pin-bypass head)
**Deploy:** staging `f0cee92e7` → migration applied → HTTP 200 → resolver scheduled at boot → first live sweep done.

> **Scope note:** this is the **crypto half** of RUNNING_ISSUES #298. Per Langston Q5, #298 was split into **B-NAMES (crypto)** and **B-NAMES.1 (xStock)**. This batch ships + verifies the crypto half and is FUNCTIONAL (184 names live on staging). **#298 STAYS OPEN until B-NAMES.1 (xStock) lands — scheduled immediately next.**

---

## Objectives checklist (from B_NAMES_SCOPE.md §1)

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| O-1 | Server-side name-resolution service, strict last-resort fallback chain | **YES** | `asset-name-resolver.ts`: local curated map skip → external CoinGecko only on miss → hide on fail/ambiguous. Off the request hot path (boot +90s, then 6h sweep). |
| O-2 | Crypto names via CoinGecko (reuse the integration) | **YES** | TIER-0 pinned id (`SYMBOL_TO_COINGECKO_ID`) → TIER-1 `/coins/list` + `/coins/markets`; rides the tier-aware auth + B69.3 429 single-retry backoff; 1.5s throttle; `/coins/list` cached 24h. |
| O-3 | xStock company names + discovery name-fetch fix | **N/A — B-NAMES.1** | Split out per Langston Q5; runs immediately next. |
| O-4 | Write-through persistence (one lookup, fills permanently) | **YES** | `asset_names` table write-through (positive) + negative-cache (miss, backoff). Resolved symbols skip on the next sweep (`positive.has`); 184 rows persisted. |
| O-5 | Disambiguation + fail-graceful + observable | **YES** | NAMED `DISAMBIGUATION_*` constants (5× dominance + $10M floor; lone-candidate accept-on-identity; else skip→hide); TWO-WAY counter (ambiguous vs hard_miss) + `/api/internal/asset-name-resolver/stats`; errors never negative-cache (retry next sweep). |

## Verification criteria (§2)

- ✅ A previously-blank crypto symbol shows its **real, correct** name — **AR/USD → "Arweave"** (not in the curated map), §9.3 Claude-in-Chrome UI-verified in the Open Simulated Trades Symbol column.
- ✅ External lookup fires **only on a local miss** — sweep-skip short-circuits on positive overlay rows, curated-map names, and negative-cache backoff.
- ✅ Resolved name **persisted, no re-hit** — `asset_names` positive rows; subsequent sweeps skip them.
- ✅ **Disambiguation** never renders a wrong name — 9 ambiguous symbols skipped→hidden; Step-8 confirmed none are mis-floored majors.
- ✅ **Fail-graceful** — 0 errors across 196 symbols; an error would retry next sweep (no negative-cache poisoning), and any miss leaves the line hidden (shipped 534d582ed).
- ✅ **Rate-limit lane respected** — 1.5s throttle + 429 backoff; 0 errors over 196 symbols + a 13,532-entry `/coins/list` load.
- ✅ Bench tsc-baseline-clean + vitest 1942/1942 (incl. 10 new) · CI all-4-green · deploy HTTP 200.

## First live sweep (runtime proof)

196 unresolved crypto symbols → **184 backfilled** (181 tier-1 + 3 tier-0 pinned), **9 ambiguous**, **3 hard-miss**, **0 errors**. `/coins/list` index = 13,532 distinct symbols (the collision surface the disambiguation guards). Sample resolved: SC→Siacoin, AR→Arweave, BIO→Bio Protocol, ATH→Aethir, BICO→Biconomy.

**Step-8 (Langston ask) — negative-cache dump:** ambiguous = AVA, BMB, BOB, BTR, FUN, GTC, PROMPT, SKR, TRUST (all clone-collision mid/small caps; no majors mis-floored → gates correctly set); hard_miss = EDGEX, UNITAS, YOM (niche, absent from `/coins/list` → curated-map TODO). ~6% ambiguous = healthy distribution.

## Langston gates

- **Step-1** APPROVE-WITH-CONDITIONS (split ratified; C1 negative-cache + C2 tier refinements).
- **Step-2** PROCEED-to-implement (tier-0 pin refinement + C1 named constant + C2 two-way counter).
- **Step-4** **APPROVE-WITH-CONDITIONS** — pure function + counter passed his edge-case walk; **one condition fixed in-batch** (the pin remediation was masked by the negative-cache backoff → a TIER-0 pin now bypasses backoff so a freshly-pinned id takes effect next sweep); both design questions ratified (Q1 keep lone-candidate accept-on-identity; Q2 ship 5×/$10M defaults).

## Governance files changed

- `1-system-manual/RUNNING_ISSUES.md` — #298 ★★UPDATE: crypto half SHIPPED + live-verified; #298 stays OPEN for B-NAMES.1.
- `1-system-manual/BATCH_CATALOG.md` — new B-NAMES row.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — new `asset-name-resolver` component (feeders/consumers).
- MEMORY (3-way: user-cache truth + in-repo mirror + Langston Helsinki).
- `Claude Comms and Packages/Batch Completion/B_NAMES_COMPLETION_REPORT.md` (this) + `Langston Design Asks/B_NAMES_STEP4_CODE_REVIEW.md` (dispatch).

## Next

**B-NAMES.1 (xStock)** immediately next — `discoverer.ts:603` `?? symbol.split('/')[0]` → `?? null` (+ dup :638; ripples to nullable `XstockSpotEntry.name` + `universe-service.ts:101`) + curated static map for the bounded Backed-ETF set. **Then #298 CLOSE.** Then resume the paused P19-B4b D5 split-brain isolation implementation.
