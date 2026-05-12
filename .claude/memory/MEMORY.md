# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — comms; §2 Step 10.b — Langston MEMORY sync mandatory; §6.5 Step 3 — Telegram verbatim relay mandatory).
2. Read this file.
3. Read `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — canonical blueprint. Step 6b (Calibration cycle) added 2026-05-13.
4. Read `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` — canonical xstock UI tracker (all-time changelog).
5. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for current phase.
6. Kyle messages me here in Claude Desktop. For Kyle↔Langston traffic visibility, tail `/var/log/cc-bridge-inbox.jsonl` on Hetzner.
7. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; touch crypto_spot (no-touch fence through 2026-05-15); dump every lesson into workflow doc (standing rules only).

---

## TEMPORARY MAINTENANCE RULES (xStocks UI sprint — remove when ALL B-NEW items closed)

**Rule 1 — `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` discipline:**
- All-time changelog format. Every fix → row in CHANGELOG with date/commit/change. Every new issue Kyle raises → append `B-NEW-N` to OPEN ITEMS.
- One-by-one workflow: fix → push → Kyle verifies on staging → mark FIXED → next.

**Rule 2 — `ASSET_CLASS_ONBOARDING_WORKFLOW.md` discipline:**
- Update with STANDING RULES only ("tomorrow we add a new asset class — what gets us 98% there on first pass?"), NOT trial-and-error history.
- Trial-and-error history lives in batch completion reports + xstocks tracker.

**Rule 3 — Update both files in the same session you ship a fix.**

Remove these rules once all B-NEW items in `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` Open Items list are closed AND Layer-3 calibration is moved to its own batch.

---

## CURRENT STATE — 2026-05-13 03:15 UTC (post-xStocks UI sprint, PM2 #262, HEAD `717a4ada8`)

**xStocks UI diagnostic sprint COMPLETE** for the actionable items. 17 fixes shipped across 2026-05-12 and 2026-05-13. Pipeline + UI now match crypto architecture at the panel level. Math is internally coherent per pool.

### What's shipped (highlights — full log in XSTOCKS_DIAGNOSTICS_TAB_FIXES.md)

- **Crypto-parity scanner defenses** (config-cache 1-per-cycle screener_filters load; 25s SCAN_TIMEOUT_MS + Promise.race; 75-pair round-robin rotation with 3 pinned benchmarks). Cycle time 280s→ ~10-17s.
- **Parallel quant + pattern global filters** (B-NEW-1) — pattern lane admits pairs quant rejects ($2-5 band).
- **DB-backed 24h Trades Opened** (B-NEW-9 path A) — `vts_open_trades` per `signal_type` split (QUANT vs PATTERN). 14 trades in 24h (13 quant + 1 pattern morning_star).
- **Per-lane null-reason aggregates** (B-NEW-12.b) — `quantNullReasonAggregate` + `patternNullReasonAggregate` separate. Quant column %s no longer over-count (was 108.7%, now coherent ≤100%).
- **All 10 xstock-enabled strategies in By Strategy panel** (B-NEW-10) — dormant ones show zero-rows.
- **Setup Nulls Section Total + drift indicator** (B-NEW-11) — amber ⚠ on >100% or <95%.
- **Family Filter Mismatch math** (B-NEW-12) — `familyMismatchDenominatorTotal` instead of strategiesEvaluated. Was 158%/177%, now realistic.
- **Pre-Eval Skips total includes all pre-detect rejections** (B-NEW-17 + 17.b) — Last Scan list has Family Filter Mismatch / Duplicate Position / Regime Has No Strategies rows; 24h Summary populates Quant + Pattern columns.
- **Max Price → "—"** (fractional ownership; DB value 0 + applicable flag false).
- **Workflow doc Step 6b** — Calibration cycle is now a MANDATORY onboarding step with 3 sub-cycles (regime classifier, filter thresholds, strategy gate testing) before any asset class moves to Phase 19 active-trading.

### Live state (PM2 #262 deployed 2026-05-13 ~01:13 UTC)

- 14 trades opened in last 24h DB-backed (13 QUANT + 1 PATTERN)
- Pattern strategies firing (vwap_pullback, range_trade, morning_star, pivot_shift, orb)
- 5 strategies still dormant (breakout, inside_bar_reversal, mean_reversion, sma_trend_ride, vwap_bounce) — regime-gated, waiting for IMPULSE_EXPANSION + HIGH_VOLATILITY_UNSTABLE regimes to hit + family-IMF passes
- All UI math now consistent within each scope (% sums ≤ 100% per pool)

### Open / next session

**B-NEW-14 (deferred, needs redesign):** max_bid_ask_spread filter wiring. Was reverted earlier — adding bid/ask columns to ticker_snap SELECT made the query 130× slower (141ms → 18.5s) due to heap reads on the partitioned table. Redesign: **separate batched bid/ask query** after the freshness gate (survivor set only). DB threshold still set to 3.0% (Langston-approved); code path doesn't read it yet.

**Layer-3 calibration items (B-NEW-15, 16, 18):**
- DI_MAX too tight for reversal/oscillator families (65-66% rejection on xstock RTH)
- vts_trend + vts_breakout DB rows have IDENTICAL thresholds (cloned from crypto, not differentiated)
- Regime classifier calibration needed (expect redistribution toward STRONG_TREND like crypto saw)
- IE-regime strategies (sma_trend_ride / breakout / vwap_bounce) dormant despite ORB firing under IE — separate IE-routing audit needed

These are Layer-3 calibration work, **not UI bugs**. Move to a dedicated calibration batch after Phase 24 closure.

---

## NO-TOUCH FENCE on crypto_spot through 2026-05-15

```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```
Halt + revert if cadence drops materially.

---

## OPERATIONAL FACTS

- xstocks: 260-pair universe + 24h DB-backed trade counts via `vts_open_trades` (B79.0g-tx soft-delete model).
- 75-pair round-robin scan rotation (~1m 45s full universe sweep). 3 pinned benchmarks: SPY/QQQ/GLD.
- xstock + perp feeds archived via B74 (renamed to xstock_*_ohlc_1m / xstock_*_ticker_snap in B79.0e).
- Strategy registration: 10 enabled for xstock_spot (DB `strategy_gates`), 9 disabled (defensive_hedge / volatility_edge etc. — regime-gated).
- Active trading OFF (Phase 19 territory). VTS passive learning ON. Trading toggle reads paper-mode `screener_filters` rows.

---

## LANGSTON RUNTIME + COMMS — see CLAUDE.md §6 + §8

Two systemd bridges on Hetzner `204.168.141.77`. Unified inbox log `/var/log/cc-bridge-inbox.jsonl`. Send protocol = 3 steps (Telegram visibility + SSH-deliver via direct `claude -p` + verbatim relay back to Telegram). Use `--permission-mode bypassPermissions`; scp-stage files to `/home/langston/inbox/<batch>/`; fresh UUID every send.

---

## Kyle Operating Directives (active, condensed)

- **NO PATCHES** (CLAUDE.md §5 #15). Long-term sustainable solutions only.
- **Per-asset-class config is the default** for behavioral knobs.
- **Backpressure: vertical-scale, never asset-class shedding.**
- **Each new asset class gets its OWN dedicated observation UI tab.**
- **No fallbacks for DB-governed settings.**
- **Kyle messages me in Claude Desktop.** Telegram = Kyle↔Langston + CC outbound visibility only.
- **Iterate with Langston to consensus** — escalate only on deadlock / scope expansion / new directive / risk boundary.
- **Calibration is a mandatory onboarding step** (workflow Step 6b 2026-05-13). Initial Layer-1 values are domain-knowledge starters, not production-tuned.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` (canonical blueprint, Step 6b added 2026-05-13)
4. `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` (all-time changelog)
5. `1-system-manual/POST_AUDIT_ROADMAP.md` (current phase)
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
