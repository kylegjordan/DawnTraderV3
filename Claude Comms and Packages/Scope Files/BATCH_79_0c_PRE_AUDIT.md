# BATCH 79.0c — Pre-Implementation Audit (PIA rev 1)

**Status:** DRAFT 2026-05-09 22:10 UTC. Companion to `BATCH_79_0c_SCOPE.md` rev 1.
**Branch HEAD:** `54201bd32`.
**Workflow Step:** 2 (pre-audit).

---

## §1 — SIM consultation per CLAUDE.md §9

**Components touched (5):**

### 1.a `server/asset_classes/xstock_spot/market-hours.ts`
- **Current SIM entry:** §1540 — "ARCA-aligned 24/5 schedule predicate `isXstockMarketOpenUTC(now?)`. NO IMPORTS — leaf module."
- **Change:** add per-symbol branch via `XSTOCK_SPOT_24_7_SYMBOLS`. Signature extends to `isXstockMarketOpenUTC(symbol?, now?)`.
- **Upstream:** none (still leaf module).
- **Downstream (4):** scanner.ts, signal_quality_evaluator.ts, data-freshness.ts, trailing-exit-controller.ts.
- **Shared state:** none.
- **Background execution:** none.
- **Blast radius:** **MEDIUM** — every xstock_spot signal evaluation passes through this. Back-compat preserved by optional `symbol` param defaulting to ARCA-only. SIM update required (signature change documented + 24/7-symbols set).

### 1.b `server/asset_classes/xstock_spot/scanner.ts`
- **Current SIM entry:** §1424 — "Live xstock_spot scanner subscribed to centralClock. Per-cycle batched DB read of `equity_spot_ticker_snap`. Market-open gate via `isXstockMarketOpenUTC` bypassable via hostile-sim flags."
- **Change:** universe filtering during ARCA-closed window. When closed, scan only the 10 24/7 names (vs full 275). Single batched DB query stays one round-trip; symbolList smaller during ARCA-closed.
- **Upstream:** centralClock, `equity_spot_ticker_snap`, `XSTOCK_SPOT_SYMBOLS`, NEW: `XSTOCK_SPOT_24_7_SYMBOLS`.
- **Downstream:** xstock_spot TelemetryAggregator, xstock_spot scan diagnostics.
- **Blast radius:** **HIGH** — only xstock_spot signal source live. Failure = no xstock signals. Mitigation: hostile-sim bypass + freshness gate per-symbol.

### 1.c `server/core/filters/signal_quality_evaluator.ts`
- **Current SIM entry:** §1566 — "xstock_spot weekend-pause + strategy-whitelist gates added at top of `evaluateSignalQuality`."
- **Change:** weekend-pause gate now per-symbol: passes `canonicalSymbol` to predicate. 24/7 names skip the weekend-pause failure-mode.
- **Upstream:** safeResolveAssetClass output, isXstockMarketOpenUTC.
- **Downstream:** SQE result struct → orchestrator → execution path.
- **Shared state:** `_b79WeekendSkipCount` (in-memory counter, log-throttling).
- **Blast radius:** **MEDIUM** — incorrect symbol pass-through could cause 24/7 signals to be wrongly rejected. Test case (Q4-c in scope) explicitly covers this.

### 1.d `server/utils/data-freshness.ts`
- **Current SIM entry:** §1438 — "`isPairDataFresh`. Closed-market for xstock_spot returns `true` (Langston Q2 belt-and-suspenders); 60s in-process per-class cache."
- **Change:** `_symbol` parameter (currently unused — prefixed underscore by convention) wired to `isXstockMarketOpenUTC(symbol)`.
- **Upstream:** module_constants.market_data window; isXstockMarketOpenUTC.
- **Downstream:** scanner freshness gate, signal-orchestrator pre-eval freshness check.
- **Blast radius:** **MEDIUM** — staleness handling for 24/7 names changes from "always-fresh during ARCA-closed" to "subject to data_freshness_window_ms." If WS still silent during weekends (verified per §1.f below), 24/7 signals will be rejected as stale. This is CORRECT behavior — better stale-gated than computing on stale data.

### 1.e `server/services/trailing-exit-controller.ts`
- **Current SIM entry:** §1567 — "TEC stop-freeze guard at top of `updatePosition` (Langston PIA Q5 placement). Returns no-op state preservation when xstock_spot market closed."
- **Change:** stop-freeze gate becomes per-symbol. 24/7 names experience NORMAL stop evaluation through the weekend.
- **Upstream:** `update.symbol`, isXstockMarketOpenUTC.
- **Downstream:** TEC trailingStates map, RTB stop-update log.
- **Blast radius:** **HIGH IF DATA STALE.** If a 24/7 name has stale price (because Kraken WS quiet), TEC could compute stop-eval on outdated price → potentially trigger spurious BE/trail moves. Mitigation: TEC only evaluates on fresh data per `isPairDataFresh` (1.d above). Belt-and-suspenders: TEC's stop-eval happens on tick that itself was gated by freshness.

### 1.f `server/services/passive-archive/equity-spot-archiver.ts` (INVESTIGATION ONLY)
- **Current SIM entry:** B74 archiver — `wss://ws-equities.kraken.com`, ohlc + ticker, 5s flush.
- **Live-state evidence (2026-05-09 22:00 UTC):**
  - `connected=true last_msg_age_ms=1752 rows_persisted_60s=0` — WS connected, recent messages received, but ZERO rows persisted in last minute.
  - Concurrent flushes: crypto_spot 8/cycle, xstock_perp 38/cycle, xstock_spot ZERO/cycle. Other classes flushing healthily.
  - `equity_spot_ticker_snap` last write 2026-05-09 11:12 UTC; `equity_spot_ohlc_1m` last write 2026-05-09 00:15 UTC.
  - **Hypothesis:** Kraken WS-equities sends WS-protocol heartbeats (keeps connection alive) but no actual ticker/ohlc data for ANY xstock during weekends, including the 10 24/7 names.
- **Verification path:** subscribe a stand-alone WS client to ws-equities for `TSLAxUSD` only and observe whether trade/ticker messages arrive. Out of scope for in-codebase diagnosis (operator-level investigation).
- **Decision:** ship B79.0c with the per-symbol predicate + scanner filter ASSUMING WS will resume at ARCA-reopen. If post-reopen we see 24/7 names ALSO flowing during the next weekend, problem solved upstream. If they DON'T, file follow-up RUNNING_ISSUE: "Kraken WS-equities silent for 24/7 names on weekends — need REST polling fallback or different feed."

---

## §2 — Cross-cutting risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Symbol normalization drift across 4 callsites | Medium | Medium | Predicate accepts both canonical (`TSLAx/USD`) and bare (`TSLAx`); strip `/USD` internally |
| TEC stop-freeze removed for 24/7 names + stale data | Medium | High | Belt-and-suspenders: freshness gate fires before TEC, so stale price never reaches TEC |
| 24/7 names continue stale post-deploy (Kraken WS issue) | High | Medium | Acknowledged + scope §3 Q5 documented + follow-up RUNNING_ISSUE if confirmed |
| Crypto_spot no-touch broken | Low | High | All changes gated by `assetClass === 'xstock_spot'` branch; crypto path unchanged |
| Universe-filter logic drops a 24/7 name on edge case | Low | Medium | Boundary tests for weekend-cycle filter behavior (scope §1 obj 5) |

---

## §3 — Strategy / regime / filter design verification

- **Strategy logic:** unchanged. xstock_spot whitelist (`XSTOCK_SPOT_ENABLED_STRATEGIES`) static; ORB activation deferred to B79.0d.
- **Regime detection:** unchanged. xstock_spot regime thresholds unchanged.
- **Filter design:** SQE weekend-pause gate gains per-symbol awareness; semantics unchanged for non-24/7 names.
- **Signal pipeline:** unchanged shape. Only weekend-window filter behavior differs.
- **Quantitative math:** none touched.

System Manual touches: §6.1.X (xstock_spot market-hours subsystem) — append per-symbol-24/7 paragraph + reference to Kraken Phase-1 announcement.

---

## §4 — Pre-deploy verification queries

```sql
-- Pre-deploy snapshot of crypto_spot regime_factor_alternates cadence
SELECT factor_name, COUNT(*) AS emissions_30min
FROM regime_factor_alternates
WHERE asset_class='crypto_spot'
  AND evaluated_at > NOW() - INTERVAL '30 minutes'
GROUP BY factor_name;

-- xstock WS data freshness check
SELECT symbol, MAX(captured_at) AS last_seen
FROM equity_spot_ticker_snap
WHERE symbol IN ('TSLAx','QQQx','SPYx','NVDAx','CRCLx','AAPLx','HOODx','MSTRx','GLDx','GOOGLx')
GROUP BY symbol
ORDER BY symbol;
```

Post-deploy comparison: emissions_30min ≥80% of pre-deploy baseline (no-touch fence holds); 24/7 names should show post-deploy ticks IF Kraken WS actually serves them (separate finding).

---

## §5 — Step 4 code-review focus areas (for Langston)

1. Predicate signature — back-compat preserved? (omit-symbol callers).
2. Symbol normalization in predicate — handles both `TSLAx/USD` and `TSLAx`?
3. Scanner universe-filter logic — symbols-set-swap inside `runCycle()` vs filter at result iteration?
4. SQE callsite — passes `canonicalSymbol` (post-normalize) not raw `input.symbol`?
5. data-freshness callsite — `_symbol` un-prefixed and wired?
6. TEC callsite — `update.symbol` defined at all entry points?
7. Test coverage — boundary cases comprehensive?

---

*End BATCH_79_0c_PRE_AUDIT.md rev 1.*
