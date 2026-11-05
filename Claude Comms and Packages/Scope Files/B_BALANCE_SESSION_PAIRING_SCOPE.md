# B-BALANCE-SESSION-PAIRING — SCOPE (Step 1)

change-class: architecture
**Owner:** CC-C (ANALYST Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` §0a stage 00 order 6 (Kyle 2026-10-20; moved up by Kyle 2026-11-04, KD-8) · **Origin:** `RUNNING_ISSUES` `#618` "LEG 1 REOPENED" (2026-10-17, CC-B measured, Langston ruled at `e51bbe2c4`, Discord `1560945528655843379`) · **Drafted:** 2026-11-05 ~02:15Z, while `B-XSTOCK-BAR-AVAILABILITY` waits on review (Kyle via PM Claude: move to the next unblocked item).

## 1. What is wrong, measured
`getPortfolioBalanceV2(mode)` (`server/services/guardrail-settings.ts:25`) returns `anchor balance + realized P&L since the ENGINE SESSION START` (`:69-91`). The session start is an in-memory value reset to "now" on every engine start (`active-execution-engine.ts:534`, set at `:1314`), so every restart or deploy drops all realized P&L since the last operator re-anchor out of the figure.
**Measured 2026-11-05 ~02:10Z (paper):** the anchor is **$820.00** (v5, `measurement_override` 2026-10-06 15:52:57Z, the last operator re-anchor in `portfolio_anchor_events`). Realized `pnl` since then: **−$210.04 over 527 closes** (`closed_trades`, mode paper, `closed_at` not null, `never_filled` excluded; the same predicates as `getRealizedPnlSince`). ⇒ the money actually held is about **$609.96**, while the function returns $820 plus whatever closed since the last restart (21:20:15Z today). **Every consumer that treats it as money held reads about 34% high** (820 / 609.96 = 1.344). CC-B's 10-17 measurement was 19.8%; the gap grows with each loss, and each restart hides it again.

## 2. Census — every caller of `getPortfolioBalanceV2` (repo-wide, tests excluded; re-derived at the scope commit)
| # | caller | what it uses the figure for | which meaning it needs |
|---|---|---|---|
| 1 | `daily-loss-budget.ts:160` | the kill switch's DENOMINATOR | **session-paired, deliberately** — the numerator is windowed to the same session (`:138`, `resolveLossWindowStart`), so both sides of the ratio reset together at a restart. Kyle's recorded circuit-breaker decision (`BATCH_CATALOG` P19-B6: "a restart rebaselines = circuit-breaker, Kyle decision"; `#632`). **No change.** |
| 2 | `asset_classes/xstock_spot/active-dispatch.ts:222` | `SizingContext.portfolioValue` for xStock entries | **money held** |
| 3 | `guardrail-settings.ts:183` → `buildSettingsFromGuardrails().portfolioValue` → `active-execution-engine.ts:5584` | crypto (and shared) sizing via settings | **money held** |
| 4 | `active-execution-engine.ts:6759` | the working balance written on the OPENED execution-attempt audit row (§17 P-2) | **money held** (a record of what the position was sized against) |
| 5 | `trade-safety.ts:613` | `portfolioBalance` beside the blocking max-total-exposure check (`maxTotalExposurePct`) | **money held** — an exposure cap measured against an inflated balance lets total exposure run about 34% over the cap |
| 6 | `signal-orchestrator.ts:2106` | `[B6]` sizing in the orchestrator (`portfolioValue <= 0` ⇒ SIZING_ERROR) | **money held** |
| 7 | `command-router.ts:293` | `riskPerTrade` from a `riskPercent` command | **dead code** per its own comment ("CommandRouter is dead code (never invoked) — see RUNNING_ISSUES #136"); Step 2 confirms and it is left out of this batch's change |
| 8 | `routes.ts:4584`, `:4670`, `:4749` | display/analytics initial balance (`|| 50000` fallback) | display; Step 2 to classify (and the `|| 50000` fallback is itself a hard-coded default for a DB-governed value — a finding for Step 2) |
⚠️ This table is a first pass from reading the call sites; Step 2 does the full §9.5(a) census per hop (writers, readers, mutators, schedulers) and confirms each row from the code, not this table.

## 3. Provenance (1.b)
- **Tier 1 — `getPortfolioBalanceV2`'s session pairing (behaviour this batch changes).** Searched: `BATCH_CATALOG.md`, `RUNNING_ISSUES.md` (`#618`, `#632`), the `B-BALANCE-TRUTH` completion report, the System Manual §5 entry ("Phase 8.8.3-C7-FIX … realized P/L from closed trades within current engine session"), and `git log -S`. The `[9.6.3] Get realized P/L from closed trades - mode-aware` block arrived in `594aad717` (2026-01-01), whose message is, verbatim: *"Remove legacy risk management and userId parameters — Refactors code to remove the deprecated RiskManager and all userId references, improving system architecture and preparing for future phases."* No stated intent for pairing the SIZING balance to the engine session. **Disposition for the sizing use: (2) relevant but needs updating to today's intent — `INFERRED-FROM-CODE`.** The pairing appears designed for the kill-switch ratio (which IS decided), and inherited by every other reader because they share one function.
- **Tier 1 — the kill-switch use.** Decided and recorded (P19-B6, Kyle; `#632` keeps it as a standing Kyle decision with a question about changed conditions). **Disposition (1) still relevant and correct — unchanged by this batch.**
- **Tier 2 — `getLastAnchorAt(mode, { reasons: OPERATOR_REBASE_REASONS })`** (`portfolio-anchor-service.ts:118`, reasons `['start_new','measurement_override','launch_snap']` at `:41`): already used by the kill switch's window (`B-LOSS-WINDOW-OPERATOR-CLOSES`, `78d85f5d6`, 2026-10-07) to mean "the last time an operator deliberately set the money". **Disposition (1); this batch reuses it.** An automatic re-anchor (`auto_divergence`) deliberately does not count (`#1171`).
- **Tier 2 — `storage.getRealizedPnlSince(mode, since)`** (`storage.ts:3291`): the SQL aggregate `B-BALANCE-TRUTH` made canonical; reused unchanged.

## 4. Objectives (each with its verification)
- **OBJ-1 — a "money held" balance, one function.** `anchor + realized P&L since the last OPERATOR re-anchor` (the same aggregate and `pnl` basis as the kill switch, so the two stay comparable). *Verify:* unit tests over a restart (realized before the restart still counts) and over an operator re-anchor (realized before it does not); a fence that both functions use `getRealizedPnlSince`.
- **OBJ-2 — every "money held" caller reads it; the kill switch keeps the session-paired figure.** The census rows that need money held (2, 3, 4, 5, 6, and 8 if Step 2 confirms display wants it) move; row 1 stays; row 7 is dead code and untouched. *Verify:* a census fence (every caller of the session-paired function is on an allow-list containing only the kill switch, or is classified with a reason); on staging, after a restart, xStock and crypto sizing logs show the portfolio value equal to `anchor + realized since 2026-10-06 15:52:57Z`, not $820.
- **OBJ-3 — the null-session branch and live mode stay defined.** No session start (`#585`) and the live leg (`:111-125`) each get the money-held treatment or an explicit, logged reason they cannot. *Verify:* tests for both.
- **OBJ-4 — sizing size effect, measured after deploy.** Notional per new paper entry drops by the ratio of the two balances (about 1/1.34 today). *Verify:* Step 7 compares new entries' recorded notional against the pre-deploy ratio; no change to the per-trade share settings.

## 5. Not in scope
The kill-switch window and its restart re-baseline (`#632`, Kyle's decision). Changing the anchor or re-anchoring. The `pnl` vs `netPnl` basis (Langston's standing condition: both sides move together or not at all).

## 6. Risk note
This SHRINKS position sizes by about a quarter today, toward the money actually held — the safe direction under the mission (risk tolerance wins). It does not loosen any limit.
