# P19-B8 Design Intentions — v1 (Kyle brief, 2026-07-03)

**From:** NEW Claude (CC-B) · **For:** Langston design review + discussion → consensus → Step-1 scope
**Source:** Kyle's design-intention briefing (Desktop, 2026-07-03), plus CC-B staging walkthrough + code verification the same day.
**Status:** Kyle has LOCKED the items in §1–§3. §4 (balance/compounding/learning) is genuinely OPEN — Kyle is stuck on it and wants our best joint thinking. §5–§7 are batch content confirmed by Kyle.

---

## 1. LOCKED — Page reorganization (the shape of the batch)

The single "Trading" page (client/src/pages/active-trades.tsx, 6 tabs) is replaced by **three mode pages**, nav order:

1. **Live Trading**
2. **Paper Trading**
3. **Virtual Simulations** (VTS)

Per-page tabs:

| # | Live Trading | Paper Trading | Virtual Simulations |
|---|---|---|---|
| 1 | Crypto Filter Diagnostics | Crypto Filter Diagnostics | Crypto Filter Diagnostics |
| 2 | xStock Filter Diagnostics | xStock Filter Diagnostics | xStock Filter Diagnostics |
| 3 | Ready to Buy | Ready to Buy | Open Trades |
| 4 | Open Trades | Open Trades | Closed Trades |
| 5 | Closed Trades | Closed Trades | — |
| 6 | Shadows (last tab) | Shadows (last tab) | — |

- The old **Filter Insights** tab is retired; six per-mode/per-class Filter Diagnostics panels replace it. (The two existing VTS panels under Machine Learning are the template; they presumably MOVE to the VTS page — open sub-question §8.Q3.)
- **Controls:** the global trading toggle in the top bar goes away. Paper and Live each get a start/stop control INSIDE their own page only. The VTS gets no start/stop (always-on).
- **Shadows:** LOCKED per Kyle — stays as the last tab inside Paper and inside Live (no separate page).
- Dashboard redesign of the MAIN dashboard: deferred. But see §5 — per-mode dashboards ARE in.

## 2. LOCKED — Deletions (rule-18 full-delete discipline)

1. **Pattern Scanning tab** — DELETE entirely (component client/src/components/trading/pattern-scanning.tsx, Phase 14.5 B19C vintage; renders GET /api/pattern-pool?mode=paper). Kyle: it was a debugging window from the pattern-repair era; the pattern lane now reports into the Filter Diagnostics (both classes, all three modes) and Open Trades. Blast-radius: check whether /api/pattern-pool has other consumers before deleting the endpoint too. Note: this tab is ALSO the whole-page crash on staging (`.toFixed()` on undefined → error boundary eats the page), so deletion also closes that defect.
2. **Ghost balance defaults — DELETE, not deprecate (Kyle: "wiped out as if it never existed"):**
   - `activeEngineSessions.startingBalance` schema default `"10000"` (shared/schema.ts:1829)
   - `portfolio_state.balance` schema default `"1000.00"` (shared/schema.ts:1170)
   - routes.ts:11286 start-route fallback `: 800`
   - Sweep for any other hard-coded balance literals on the active path. Fail-hard posture per CLAUDE.md §11 (no hard-coded fallbacks for DB-governed settings): if no balance is provided/derivable, refuse to start, don't invent one.

## 3. VERIFIED CODE FACTS (CC-B, 2026-07-03 — grounding for the discussion)

- **Start flow matches Kyle's memory:** clicking start opens `confirm-balance-modal.tsx` ("Confirm Portfolio Balance", prefilled from current portfolio_state.balance), POST `/api/active-engine/start` `{mode: 'new'|'continue', initialBalance}`. The $878 on staging's top bar = Kyle's LAST-ENTERED balance persisted in `portfolio_state` — NOT the Kraken balance. Nothing anywhere mirrors Kraken today.
- **Reset semantics today (mode='new' → activeSessionResetService.hardResetActiveEngine → storage.hardResetActiveEngineTables, storage.ts:4121):** (a) any still-open rows in closed_trades get closeReason='hard_reset' and closedAt=now — **history rows are KEPT, never deleted**; (b) active_open_positions rows are **DELETED** (all of them); (c) running sessions marked stopped. mode='continue' preserves everything. VTS tables untouched either way.
- **Persistence:** portfolio_state (per-mode balance), active_open_positions, closed_trades, active_engine_sessions are all DB-backed, and `resumeActiveEngines()` (active-engine-service.ts:1127, R9.3.HF-4.FIX) exists to resume a running session after server restart. UNPROVEN end-to-end (dormant since built); #404 (heartbeat session.userId dormant-path) sits in this exact area. → A restart-with-open-positions leg belongs in the P19-B8-AC1 acceptance proof.
- **Per-trade manual close is INTACT:** per-row button in the Open Trades tab → POST `/api/active-engine/close-trade/:id` `{reason:'manual_close'}` (route routes.ts:12364, authenticated, hardened vs bad symbols). Kyle explicitly wants this capability preserved in the rebuilt pages (it frees a slot on demand).

## 4. OPEN PROBLEM — paper balance / compounding / learning skew (the design question)

Kyle's intent: paper-mode active trading runs for weeks/months WITHOUT reset. Default start = mirror the real Kraken balance. Lean = keep it simple: probably NO custom-balance option, possibly no user-facing reset at all. But then:

- Over months, paper compounds (hopefully up) while the real Kraken balance stays what it is → when live mode starts at real Kraken value, paper and live diverge in balance, sizes, and slot counts (guardrails × balance ⇒ slots).
- Does that divergence skew what the system LEARNS from paper? Larger balances make larger-dollar trades; the worry is the system "learns to trade big" in ways that don't transfer to the small live account.
- Scenario balances (e.g. "what if $2,000") were desired but Kyle now leans against them for simplicity — UNLESS we find they're cheap and safe (if built: scenario runs must be telemetry-tagged and excluded from calibration learning, same discriminator pattern as 'paper_sim'/'vts').

**CC-B's framing + recommendation (pressure-test this):**
- The skew has two distinct components: (a) DECISION skew — only exists if any learning/calibration reads dollar-absolute features; sizing is %-of-portfolio and ranking is R-multiple/netEV-based, so decisions SHOULD be scale-free — propose an explicit **dollar-agnostic learning audit + a fence test** (no calibration input may be a raw dollar amount; percent/R units only); (b) FRICTION realism skew — real and physical: bigger orders walk more L2 depth, tiny balances hit exchange minimum-order floors. This one cannot be fenced away; it argues for keeping paper's balance in the NEIGHBORHOOD of live's reality.
- **Recommendation P1+P3:** start = Kraken mirror; compound freely; no custom-balance input; reset (admin-level, not a prominent button) re-anchors to current Kraken balance; learning layer made provably dollar-agnostic. Accept the friction-realism drift until it's material — and define "material" (e.g. paper balance > ~3-5× live balance → recommend a re-anchor) so it's a governed threshold, not a vibe.
- Rejected-by-Kyle: the "balance always mirrors Kraken while a separate 'what our trades would have done' tracker runs" hybrid — he finds it silly; don't resurrect it unless there's a strong argument.
- Open for Langston: is periodic re-anchor (e.g. at live-mode launch, paper snaps to live's balance) better than compound-freely? What does the industry do for long-running paper environments? (Kyle's standing directive: research the field first for important design pieces.)

## 5. NEW — Per-mode dashboards (Paper + Live)

Each mode page (or a per-mode dashboard section) gets a summary scoreboard: activity over 1h / 24h / 7d, filterable to longer ranges. Kyle's named stats: win/loss rate, profit/loss % and $, portfolio lifetime gain $ and %, plus whatever else we recommend from the current dashboard's metric set (earnings today/week/month, ADE, trades today/active/closed, volume traded, avg per trade/day, fees, completion time). CC-B proposed additions for the discussion: profit factor, expectancy per trade (R), max drawdown, total fees paid, slot utilization. The MAIN dashboard redesign comes later and will remix these per-mode scoreboards.

## 6. Defect fixes riding in this batch (verified on staging 2026-07-03)

1. Crypto (VTS) Filter Diagnostics "Trades Opened (24h)" reads **0**; DB shows **143** crypto VTS opens in that window (+87 xStock). Counter or its query is wrong — find + fix at the source, don't paper over.
2. xStocks Filter Diagnostics red banner: `module_constants: module 'dbs_calculation' is not warm — call prefetchModule('dbs_calculation') at server startup before sync reads.` Fix = warm it at boot.
3. xStocks pipeline "Family-Qualified (Unique Pairs)" reads 0 against a 296,654 fan-out (crypto equivalent shows 124,979 — the xStock counter is broken).
4. xStocks rolling-24h "Pairs Scanned" reads 0 against 1,469 cycles.
5. (Closed by the §2 deletion: the Pattern Scanning whole-page crash.)

## 7. Existing B8 riders (from PHASE_19_PLAN §5, unchanged)

closed_trades growth/integrity gate at switch-on · #406 Q5 wire-or-correct decision (CC-B researched rec: correct-the-doc) · #404 heartbeat session.userId dormant-path · #411 pattern-volume measure. Plus B8's core sequence: monitoring screens (this design) FIRST → switch-on (crypto → xStock, D7 one-class-at-a-time) → P19-B8-AC1/AC2 acceptance proofs.

## 8. Asks for Langston

- **Q1:** Pressure-test §4 (the P1+P3 recommendation, the re-anchor threshold idea, the dollar-agnostic fence). Field prior art welcome.
- **Q2:** The three-page reorg (§1): any structural objection, and what's the right component strategy (one parameterized mode-page component vs three pages sharing tab components)? The existing FilterDiagnosticsPanel is already shared/parameterized — extend that pattern?
- **Q3:** Where do the two existing VTS Filter Diagnostics panels (Machine Learning page) end up — move to the VTS page wholesale, or does Machine Learning keep a pointer? The ML page's other tabs (Open/Closed VTS trades, Predictive Adjustments, Regime Archive, DBS Pair Tracking) overlap the new VTS page — how much of the ML page survives?
- **Q4:** Start-flow redesign: with ghosts deleted and Kraken-mirror default, what's the exact start UX (auto-fetch Kraken balance → show → confirm; no free-text override? or keep the field editable with the fetched value as default)? Kyle leans simple/no-override; confirm the fail-hard path when Kraken is unreachable.
- **Q5:** Scope-splitting: this is UI-heavy + engine-adjacent. Propose sub-batch cut lines (e.g. B8.1 pages/tabs reorg + deletions, B8.2 balance policy + start flow, B8.3 dashboards, then switch-on + AC1/AC2) so each stays reviewable.

---

# ADDENDUM — CONSENSUS LOCKED (CC-B + Langston, 2026-07-03, post-review)

Langston reviewed via three stateless passes (14:50 Discord + 14:51 staged `P19_B8_LANGSTON_REVIEW_v1.md` + 14:53 self-advance) + follow-ups; CC-B reconciled explicitly (stricter-wins). **The single merged position:**

## Balance policy (§4 resolved, pending Kyle's two decisions)
- Start (`mode='new'`) = auto-fetch real Kraken balance → read-only display → confirm. NO free-text override. Kraken unreachable → refuse to start (no fallback to persisted balance or any literal). `mode='continue'` resumes the persisted paper balance, NEVER re-fetches/re-anchors — a Kraken outage never blocks a resume.
- Compound freely pre-live (Kyle watches growth — his confidence signal, preserved).
- **Launch-time re-anchor = the RULE:** when live mode turns on, paper snaps to live's Kraken balance; pre-launch growth is preserved on the lifetime scoreboard as warm-up record. *(Kyle decision #2)*
- **Physics backstop between anchor events:** per-asset-class friction-divergence threshold (the ratio where paper's typical order walks materially more top-of-book depth than a live-size order, or crosses min-order floors). Crossing it TRIGGERS re-anchor (vs recommend-only — *Kyle decision #1*). Threshold = governed knob → **ADJUSTMENT_FRAMEWORK entry**, defined per class, never a global round multiple.
- **Balance-ratio-at-open tag** on every paper trade (first-class telemetry dimension; friction calibration down-weights/excludes out-of-band trades; shares the existing calibration tagging/exclusion machinery — OLD Claude input pending on the adjacency). **Read-side-discriminator distinction (state in B8.2 scope in one line, so it isn't re-litigated):** we do NOT fence the drift itself and we NEVER normalize actual position sizing — drift stays honest in the ledger; only what the calibration layer READS is balance-ratio-normalized. Dollars stay honest, learning stays comparable.
- **CI property test homing (§13):** the decision-skew fence test ships INSIDE B8.2 alongside the tag (the test guards the tag) and gets a RUNNING_ISSUES entry naming that home — never left as an unhomed "we agreed to add a test."
- **Re-anchor ≠ learning reset, ever.** Learned calibration is scale-free and survives every re-anchor untouched. Reset also never deletes closed-trade history (verified: hard reset closes open rows with reason 'hard_reset', keeps all history).
- **Dollar-agnostic fence (B8.2 acceptance criterion — the criterion itself is the §13 scheduled home; must land in the B8.2 scope/acceptance doc, not only this thread):** all THRESHOLDS and COMPARISONS across scanner→regime→strategy→SQE→EV are percent/R/bps. An explicitly ENUMERATED permitted boundary carries real quote-currency amounts: order-sizing notional, exchange min-notional/min-order constraints, exchange-side fee computation. Dollar-denominated logic outside the enumerated set = violation. **Mechanical-assertion requirement (Langston):** the criterion must be provable batch-over-batch — CI-automatable gate preferred; if not automatable, a deliberately designed manual checklist is declared AT SCOPE TIME, not discovered later. **Three fence-honesty locks (Langston, final round):** (1) admission test for the permitted set = "would the exchange reject or mis-size the order without a real amount here?" — no = doesn't belong; keep the enumeration minimal. (2) **Convert-don't-enumerate on risk-limit thresholds:** dollar-denominated max-daily-loss / kill-switch floor / per-trade risk cap found on the path are VIOLATIONS whose disposition is convert-to-relative (%-of-equity / R), NEVER widen-the-enumeration — stated explicitly in the acceptance text so no implementer takes the shortcut. ⚠️ CC-B rider: any semantic conversion of a RISK guardrail ($-cap → %-cap changes behavior under a compounding balance) is a Kyle-owned risk-tolerance call — surface each such conversion to Kyle at B8.2 scope review (ADJUSTMENT_FRAMEWORK discipline), don't convert silently. (3) Account equity is an INPUT to boundary #1 (sizing_notional = risk% × equity), not a fourth enumerated item.
- Scenario balances: NOT built in v1.
- Field-research offer (citation-grade pass on shadow-book balance policy) relayed to Kyle — *Kyle decision #3 (optional)*.

## Component + page architecture (Q2/Q3 resolved)
- ONE parameterized `<ModeTradingPage mode>` shell driven by per-mode tab manifests; tabs are shared components (FilterDiagnosticsPanel pattern). VTS = shorter manifest, not a fork. Order-destination + controls-present are explicit config.
- **Mode-scoped data-source contract from day one:** shared Open/Closed tab components abstract their endpoints per mode (active path reads active_open_positions/closed_trades; VTS reads vts_open_trades + JSON). No tab component may assume the active-path tables.
- ML page: both VTS Filter Diagnostics panels + Open/Closed VTS trade views MOVE to the VTS page; ML's duplicates are DELETED at source (rule 18, DELETED_COMPONENTS_LOG entries, dispositions decided at the B8.1 cut — numbered scope item). ML survives as pure analytics (Predictive Adjustments, Regime Archive, DBS Pair Tracking); rename candidate "Learning/Calibration".
- Three-distinct-balances labeling (paper balance / live balance / actual Kraken balance) — B8.3 dashboard requirement; % is the honest cross-mode comparable, lead with % over $ in paper-vs-live views.

## Sub-batch cut (Q5 resolved)
- **B8.1** — 3-page reorg + tab manifests + Pattern Scanning DELETE (trace /api/pattern-pool consumers first) + §6 defect fixes. Defects #1/#3/#4 treated as ONE suspected root cause (by-mode/by-class query scoping) — **root-cause once, verify THRICE** (three distinct Step-8 proof cases; a shared fix must prove all three symptoms independently, not declare victory from one). #2 (dbs_calculation warm-at-boot) rides along, flagged server-side.
- **B8.2** — balance policy + fences + ratio-tag + start-flow redesign + **ghost-default deletion ATOMIC with the Kraken-mirror replacement** (never delete ahead — start would be dead between batches). tsc-trace the ghost literals for dangling references. resumeActiveEngines' balance source traced BEFORE the ghost-delete. B8.2 scope waits on §4 lock (Kyle's decisions).
- **B8.3** — per-mode dashboards (Kyle's stats + profit factor, expectancy-R, max drawdown, total fees, slot utilization + the three-balances labeling).
- **B8.4** — switch-on (crypto→xStock per D7) + P19-B8-AC1/AC2. **GATING PRECONDITION: AC1 restart-with-open-positions proven on BOTH legs** — (leg 1, pre-switch-on, CI: seed session+positions in test DB, call resumeActiveEngines on a FRESH reloaded instance (not the same in-memory object), assert full rehydration — kills #404 dormant leg; (leg 2, first hours post-switch-on: DELIBERATE scheduled pm2 restart with real open positions; pass = byte-identical open state (position count, entry prices, session id, stop/target state) + ZERO duplicate re-entry + ZERO orphaned positions — not "it came back up").

## Kyle-owned decisions (open)
1. Threshold re-anchor: TRIGGERED (rec) vs recommend-only.
2. Hard re-anchor at live-launch: YES (rec) vs no.
3. Commission Langston's citation-grade field-research pass before §4 locks: optional.
