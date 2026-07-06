# P19-B8.3 SCOPE — Per-mode dashboards + metrics-strip move + labels/error-states

change-class: non_architecture

**Batch:** P19-B8.3 (third sub-batch of the P19-B8 arc) · CC-B · Step-1 draft 2026-07-06
**Basis:** Kyle's B8 design requirements (per-mode dashboards, 1h/24h/week windows, win/loss, P/L % and $, lifetime portfolio gain, "recommend metrics") + the B8.1/B8.2/B8.2b carry list + the 2026-07-06 architectural read (all claims file:line-verified).
**Class rationale:** display + aggregation only — NO trading-path, math-kernel, regime, or filter changes; the server work is stats endpoints reading existing closed-trade data. Langston reviews the declaration.

## Kyle's locked requirements + the recommended metric set (dispatched to Kyle 2026-07-06, awaiting his reaction — build proceeds; any metric he cuts is a cheap removal)

Per mode page, windows **1h / 24h / 7d + lifetime**: wins/losses (raw counts ALWAYS beside %), net P/L in $ AND %, lifetime portfolio gain. RECOMMENDED additions: (1) win rate w/ raw counts; (2) profit factor; (3) average net R-multiple; (4) **fee drag** ($ fees + % of gross P/L consumed — the Tier-1 make-or-break lens); (5) maker-vs-taker entry mix; (6) max drawdown in window (against the REAL balance — the B8.2 denominator fix makes this honest). VTS variant reframes for learning breadth: opens/day + per-strategy spread instead of portfolio gain.

## Objectives

### OBJ-1 — Mode-parameterize + complete the active-path stats endpoints
`/api/active-engine/trades/analytics` and `/api/active-engine/portfolio-summary` are HARDCODED `mode='paper'` (routes.ts:12763 / :12339). Add `?mode=paper|live` (default `paper` — zero behavior change for existing callers). ADD to analytics (all computable from existing closed_trades columns — verified): `feeDrag` {totalFees, pctOfGross} (totalFee/grossPnl cols), `makerTakerMix` {makerCount, takerCount, makerShare} (chosenEntryMode, NULL rows excluded honestly), `avgNetR` (netPnl ÷ (|entryPrice−stopLoss|×quantity); zero-risk rows excluded + counted), `maxDrawdownInWindow` (running netPnl curve ÷ the mode's real starting balance via the B8.2 anchor read — NEVER a literal). FIX the pre-existing `netPnlPercent` always-0 nit (routes.ts:12932, server comment admits it). Ghost-trade + `never_filled` exclusions UNCHANGED (visible-≠-counted stands).

### OBJ-2 — NEW compact VTS analytics endpoint
`GET /api/vts/analytics?days=` — server-side aggregates over closed VTS trades (today the client would have to compute from raw `/ml/closed` rows; flagged by the read: no VTS aggregates exist). Returns per-window: opens/day, win rate w/ counts, net P/L $ / % (VIRTUAL — labeled as such), profit factor, avg hold, maker/taker mix, per-strategy breakdown. HONESTY RULES carried from B7.2c: twins EXCLUDED from aggregates (`countsInAggregates=false` discipline), `never_filled` excluded, shadows excluded (`VTS_OPEN_TRADES_EXCLUDE_SHADOW`).

### OBJ-3 — The Dashboard tab (shared component, per-mode manifest entry) — ★ LAYOUT LOCKED by Kyle 2026-07-06 (screenshot of the legacy /dashboard = the widget template, fed with REAL data)
ONE `DashboardTab` component parameterized by mode, added to all three mode pages' manifests as the FIRST tab + the new `defaultTab` (flagged to Kyle 07-06; he proceeded). **Widget set per Kyle's screenshot + additions:**
- **Portfolio Value card** — the mode's balance figures (OBJ-5 labels).
- **Earnings card** — Today / This Week / This Month net P/L + Avg Daily Earnings ($ and %) + 7-day trend.
- **Trading Activity & Results card** (window selector Day/Week/Month) — trades opened, active, closed, win rate W/ RAW COUNTS, volume traded.
- **Averages card** (window selector) — avg daily earnings, avg trades/day, avg earnings/trade, avg amount invested, avg fees/trade, avg daily earnings %, avg completion (hold) time.
- **The six recommended metrics** (Kyle-approved 07-06): profit factor, avg net R, fee drag, maker/taker mix, in-window max drawdown, win-rate-with-counts — folded into the cards above where natural (fee drag + maker/taker into Averages/Activity; PF + avgNetR + maxDD into a compact "Edge" strip).
- **★ Portfolio Value Over Time chart** (Kyle 07-06) — range selector 7D/1M/3M/YTD/ALL; see OBJ-3b for the data source.
- **★ Breakdown tables** (Kyle 07-06): **by asset class** (crypto_spot vs xstock_spot: trades, win rate w/ counts, net P/L, fees) and **by strategy** (the analytics byStrategy map + per-strategy net P/L/win-rate) — per selected window.
Paper/Live read OBJ-1; VTS reads OBJ-2 with the learning framing (VIRTUAL-labeled dollars). Live renders dormancy-aware (honest zeros + the DORMANT badge, no fake data).

### OBJ-3b — ★ Balance-growth-over-time data (Kyle 07-06)
The mode's balance curve, DERIVED server-side — NO new snapshot infrastructure: curve = anchor events (the balance re-bases) + cumulative closed-trade netPnl between them, bucketed to the selected range (the legacy `/api/paper/metrics/history` computes a similar running balance from trades — that shape is the precedent, but built mode-scoped + anchor-aware + reading `closed_trades`, NOT the legacy `paper_trades` table). VTS variant: cumulative VIRTUAL net P/L curve (no balance semantics — labeled as such). Honest empty state when a window has no data (never a flat fabricated line). NOTE (flagged, not in scope): once per-mode dashboards land, the legacy mode-less `/dashboard` page becomes redundant — its disposition (retire vs redirect) is a named follow-up decision for Kyle at B8.3 close.

### OBJ-4 — Metrics-strip move (the B8.1-pinned item)
The top-bar strip (top-bar.tsx:332-371, 6 fields off portfolio-summary, paper-gated) MOVES into the Paper Trading page (below the controls block); the top bar keeps clocks only. Live gets the same strip dormancy-aware at Phase-21 readiness (rendered now, honest zeros/409-state). VTS gets NO strip (no balance semantics — Kyle's VTS-has-no-controls principle extends).

### OBJ-5 — Three-balances labeling
Explicit, unambiguous labels wherever a balance renders: **"Paper Balance (simulated)"** (portfolio_state paper), **"Live Balance (record)"** (portfolio_state live — the launch-snap target), **"Kraken Balance (real, read-only)"** (the mirror endpoint, 60s-cached, shown on the Paper dashboard so drift is visible at a glance — the divergence telemetry Kyle asked for in the B8 design talk). No bare "$X" anywhere on the mode pages after this batch.

### OBJ-6 — Live-page badge fix
active-trades-v2.tsx:1216 hardcodes the string "Paper Trading" — derive from the mode context so each page's Open Trades panel names its own mode (the B8.1 carry).

### OBJ-7 — Reward-vs-Risk gate relabels (Kyle 2026-07-06)
In the shared FD panel gate table (now bottom-positioned per B8.2b): ADD a **Rejected** total column (= Evals − Passed, so the reasons visibly sum); RENAME reason headers to plain language — `Reward-vs-Risk` → **"RR Too Low"**, `Unreachable` → **"Target Unreachable"**, `Stop Distance` → **"Bad Stop"**, `Invalid ATR` → **"No ATR Data"**; header tooltips carry the one-line meaning of each. Data/tracker untouched — labels + one derived column only.

### OBJ-8 — Visible fetch-failure states (the 2026-07-06 zero-trades scare)
The self-fetching tab wrappers (vts-tabs.tsx: Open/Closed/FD) and the new DashboardTab render an EXPLICIT error banner + Retry button on fetch failure (useQuery isError) and a distinct loading state — a failed load must never render as an empty table ("no trades" ≠ "couldn't load"). Same treatment on the moved strip.

### OBJ-9 — OPTIONAL (Kyle decision pending): crypto Scanner Cycle Metrics twin
A crypto FX5-scanner lifecycle card matching the xStock tab's, for symmetry. IN scope only if Kyle says yes; otherwise dropped without residue.

### OBJ-10 — Workflow close
Bench → Langston Step-4 diff → CI 4-green → deploy → **full visual audit: every mode page's Dashboard tab + the moved strip + labels + gate relabels + a forced error-state render** (Kyle's standing hard requirement) → Langston Step-8 → governance (SIM: dashboard endpoints + strip re-home; SysManual: N/A judged — display/aggregation only, stated explicitly; BATCH_CATALOG/PHASE_HISTORY/PHASE_19_PLAN; RUNNING_ISSUES sweep) → completion report → Kyle ack.

## Out of scope (named)
The switch-on + AC1 leg-2/AC2 (B8.4); dashboard ALERTING/thresholds (Phase-25 calibration era); the ML-page rename (separate Kyle decision, still open from B8.1); anchor-ratio visualizations beyond the balance labels (25-16); any styling redesign beyond the new components.

## Blast radius (from the read)
Server: routes.ts analytics+portfolio-summary (mode param + new fields), routes/vts.ts (+1 endpoint), NO engine/math/storage-write changes. Client: top-bar.tsx (strip out), paper/live/virtual-simulations manifests (+1 tab each, defaultTab change), NEW dashboard component(s), active-trades-v2 badge line, FD panel gate headers, vts-tabs error states. Existing endpoint callers unaffected (mode param defaults; strip's WS refresh listeners move with it).

## Riders
- `netPnlPercent` always-0 fix = a PRE-EXISTING defect corrected in passing (disclosed, §9.2).
- The mirror-balance display adds a read-only Kraken-cached call to the Paper dashboard poll — 60s service cache absorbs it; C6 cadence watch still rides B8.4.
- Strip WS listeners (trade_closed/price_updated throttle) move with the strip — verify no orphaned listeners left in top-bar.
