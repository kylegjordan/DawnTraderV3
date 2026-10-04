# B-DASHBOARD-STATS-BLANK — SCOPE (hotfix)

change-class: hotfix

**Owner:** CC-B (NEW Claude) · **Directed by:** Kyle, 2026-10-02/04 — *"look at the paper mode dashboard ... a number of stats that are not filling in ... the lifetime statistics in the first widget are not showing."* · **Issues:** `#903` (fixed here; its mechanism corrected), `#902` (checked: not unmasked) · **Rides:** deploy B (no migration).

## 1. Qualifying test
| # | test | answer |
|---|---|---|
| 1 | broken now | **Yes — the UI presents blank figures.** Measured in Claude-in-Chrome on staging, Kyle's session: (a) Paper Trading → Earnings card, "Day" window (the default): *Lifetime Net P/L* and *Lifetime return (time-weighted)* render "—"; the same request with `range=7d`/`30d`/`all` returns `lifetime`, `range=24h` does not (`hasLifetime:false`). (b) Main Dashboard → Portfolio Value card sits on loading placeholders; network shows `GET /api/portfolio/overview?mode=paper` → **401** while the page's other calls return 200; the same request with the session's Bearer token returns **200**. |
| 2 | waiting causes harm | Kyle directed it (he owns the urgency call). The balance card is the first thing on the main dashboard, and the lifetime rows are the OBJ-4 scoreboard he asked for. |
| 3 | blast radius small and proven | §3 below. |

## 2. Mechanism (quoted at `origin/migration/aws-supabase`)
**(a) Lifetime rows.** `GET /active-engine/trades/analytics` (`server/routes.ts:12880`) resolves `_lifetime` at `:12960` *before* the window split, but its empty-window early return (`:12990`, `return res.json({ ... earnings: computeRollingEarnings(validTrades, now, _epoch), avgAmountInvested: 0 } })`) never adds it; only the main return carries `lifetime` (`:13216`). Any window with no closes therefore ships no `lifetime`, and the card (`mode-dashboard-tab.tsx:179-186`, `a?.lifetime?.netPnl`) renders "—".
**Provenance:** `567385eae` (2026-08-21) *"B-BALANCE-TRUTH OBJ-4: the Earnings card's bottom line becomes a lifetime scoreboard with a time-weighted return"* added `lifetime` to the main return only. The scoreboard is window-independent by design (epoch-scoped, not range-scoped), so the omission on the early branch is a defect, not a decision. **Disposition (2): relevant, needs updating.**

**(b) Portfolio Value card.** `authenticateToken` (`server/routes.ts:181-186`) reads **only** the `Authorization` header and returns 401 when it is absent. `/portfolio/overview` is gated by it (`:4328`). `client/src/pages/dashboard.tsx:41,:53` and `client/src/hooks/use-trading.tsx:226` call it with a bare `fetch(...)`, which sends no `Authorization` header — so **every** call 401s; the card (`portfolio-value-widget.tsx`, via `PortfolioProvider`) never receives data. `apiFetch` (`client/src/lib/api.ts`) attaches the Bearer token and retries once on 401; the sibling hook `use-portfolio-balance.tsx:29` already uses it for the same route.
**Provenance:** the bare fetch arrives in `da4ff901c` (2025-11-26, *"Update data fetching and caching to use standardized query keys"*); the route already carried `authenticateToken` (`c9f7c4e33`, 2025-10-21). **Disposition (2).**
⚠️ **Correction to `#903`:** it diagnosed *"the first authenticated request loses a race."* The middleware has no timing dependence — no header, 401, every time. CC-C's measurement (one 401 of 25, request #2) is exactly this call; it is deterministic, not a race.

## 3. Blast radius (§9.5(a))
- **(a)** One key added to one response object. **Readers of `lifetime`:** `mode-dashboard-tab.tsx:179-186` (optional-chained; it already receives the key on non-empty windows) — the only client reader of the analytics `lifetime` key (`portfolio-overview.tsx:166` reads `earnings.lifetime`, a different object). The value is the same `_lifetime` object the main return sends. No writer, no state.
- **(b)** Three call sites switch `fetch` → `apiFetch`: same URL, same query keys, same refetch settings. **Callers of `/api/portfolio/overview`:** exactly four — these three plus `use-portfolio-balance.tsx:29` (already `apiFetch`). **What becomes visible:** the widget shows `totalValue`, `cash`, `currentExposure`, `cashPercent`, `cryptoPercent`, `syncTimestamp` only. ★ **`#902`'s unscoped `realizedPL` / `winRate` are NOT unmasked:** the only components that display them (`goals/portfolio-tab.tsx`, `trading/portfolio-overview.tsx`) have **no importer** (positive control: the same pattern finds `dashboard.tsx:11`'s import of the widget).
- **Other bare fetches (pattern, not symptom):** 24 bare `fetch('/api/…')` literals in `client/src`; 17 target token-gated routes, 4 `/api/config` (mixed), 3 open/unmatched (a floor: template paths and helpers are not matched, and a call may pass its own header). **Not this hotfix** — see §5.

## 4. Fix
1. `server/routes.ts` — add `lifetime: _lifetime` to the empty-window return.
2. `client/src/pages/dashboard.tsx` (both queries) and `client/src/hooks/use-trading.tsx` — `queryFn: () => apiFetch('/api/portfolio/overview?mode=…')`.
3. New `server/tests/unit/b-dashboard-stats-blank.test.ts` — every analytics return carrying `earnings` carries `lifetime`; the overview is never bare-fetched from those two files. **Mutation-checked:** both tests FAIL with the three source files reverted, PASS with them.
- tsc gate 338 = 338; `p19-b8-3-dashboard-metrics` + `b-epoch-keying-parity-fence` pass.

## 5. Ledger and homes (§9.4)
- `#903` → **fixed by this hotfix**; its mechanism corrected. Its row 175 (`B-DASHBOARD-AUTH-RACE`, Infra Claude) keeps the **rest of the class**: the 17 + 4 bare fetches to gated routes above — §9.4 disposition 2, added to that existing batch.
- `#902` → unchanged and still masked (§3); finding added: its two display components are unmounted — rule-18 candidates for `B-EPOCH-PARITY-FENCE` (row 99, CC-B) to settle before scoping the readers.

## 6. Verify once, after deploy B (same instruments)
- Paper Trading → Earnings → "Day": both lifetime rows show values, AND the same `range=24h` analytics response has `analytics.totalOpened === 0` **and** carries `lifetime` (Langston condition 1: only an EMPTY window exercises the fixed branch; if the window holds a close at check time the check is **NOT YET RUN**, never a pass).
- Main Dashboard → Portfolio Value shows a balance; network: `/api/portfolio/overview?mode=paper` → 200.

## 7. Langston gate — APPROVED 2026-10-04 10:54Z at `8e165d1d6`
- Condition 1 (binding, on the verify): §6's first check rewritten — an empty window or it is NOT YET RUN.
- Condition 2: the fence's reach is stated beside it (a later `lifetime` key below an early return, before the next return, would satisfy it).
- Note A: the LIVE arm (`dashboard.tsx:43`, `use-trading.tsx:228`) now reaches `?mode=live`, which calls Kraken `getAccountBalance()` per poll (15 s and 60 s). Inert in paper; recorded on the live-balance-reads row (`SPRINT_TO_LIVE_PLAN` row 9c) as a go-live rate item.
- Note B (pre-existing, untouched): the paper queries in `dashboard.tsx` (15 s) and `use-trading.tsx` (60 s) share the key `['portfolio-overview','paper']` with different intervals.
