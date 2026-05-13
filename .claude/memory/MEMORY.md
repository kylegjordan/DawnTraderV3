# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — comms; §2 Step 10.b — Langston MEMORY sync; §6.5 Step 3 — verbatim Telegram relay).
2. Read this file.
3. Read `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` — canonical xstock UI tracker.
4. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for current phase context.
5. Kyle messages me here in Claude Desktop. For Kyle↔Langston visibility, tail `/var/log/cc-bridge-inbox.jsonl` on Hetzner.
6. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; touch crypto_spot (no-touch fence through 2026-05-15); dump trial-and-error history into workflow doc (standing rules only).

---

## TEMPORARY MAINTENANCE RULES (xStocks UI sprint — remove when ALL open B-NEW items closed)

**Rule 1 — `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` discipline:** all-time changelog. Every fix → row. Every Kyle-raised issue → new B-NEW-N. One-by-one workflow.

**Rule 2 — `ASSET_CLASS_ONBOARDING_WORKFLOW.md` discipline:** STANDING RULES only. Trial-and-error history lives in batch completion reports + xstocks tracker.

**Rule 3 — Update both files in the same session you ship a fix.**

Remove these when all B-NEW items in tracker Open Items closed AND Layer-3 calibration moved to its own batch.

---

## CURRENT STATE — 2026-05-13 14:15 UTC (BATCH_80 CLOSED + Phase 2.b asset-name UI, PM2 #270, HEAD `70d2afb2d`)

**BATCH_80 SHIPPED + verified live.** TEC `trailingStates` Map re-keyed from symbol → tradeId. RUNNING_ISSUES #105 RESOLVED. Concurrent trades on same symbol (FET/USD 4-trade case, SUI/EUR 7-trade case, XRP/GBP 3-trade case) now each have their own engine state. Option C+ rehydrate seed preserves in-flight `tradeMode`+`ladderRung`+`originalStopPrice` across restarts. Engine-side defensive coercion for null-rung TRAILING_TAKE seeds (Langston Phase 1 review revision). Runtime invariant `[B80][TEC_KEYING_INVARIANT_VIOLATION]` fires every exit-cycle on both VTS + paper + live. 10 unit tests + 5 b65-parity scenarios passing in CI.

**Phase 2 UI revision (Phase 2.b — Kyle clarification 2026-05-13):** Open + Closed Simulated Trades now show specific asset NAME (Apple, Bitcoin, Solana, Alibaba) instead of category (crypto/xstock). Lookup from new `shared/asset-names.ts` (~180 entries: CRYPTO_NAMES + XSTOCK_NAMES). Maintain by adding entries when new pairs enter trading.

**Commits:** `8ace0b859` (Phase 1 engine + tests) → `d5fe43084` (Phase 1.b coercion fix) → `1c47b3e37` (Phase 1.c test-site coverage) → `08b07dfb4` (Phase 2 UI category — superseded) → `a3f757a3b` (governance close) → `70d2afb2d` (Phase 2.b asset-name UI). All pushed; PM2 #268→#269→#270 deployed.

**30-min monitor window CLEAN:** zero `[B80][TEC_KEYING_INVARIANT_VIOLATION]`, zero `[TEC_UPDATE_MISSING_TRADE_ID]`, persistence preserved per-trade state across 3 PM2 restarts, FET/USD multi-trade case verified (4 trades each with own stop), new opens (PDD/BABA/CRWD/CRCL/NIO/HUT/SPGI/GEV) all using new tradeId format.

**Moonbag concurrency behavior delta:** pre-B80 collapsed 3 same-symbol moonbag transitions into 1 counter increment; post-B80 counts each per-trade. Cap now enforces declared semantics. Watch for entries previously sneaking through getting rejected — that's the cap working, not a regression. Documented in SIM line 884 + completion report.

**Earlier today (xStocks UI sprint, B-NEW-17 through B-NEW-27):** Possible Strategy Iterations subtractive flow + per-lane Pre-Eval Skips split; xstock exit-cycle `db is not defined` fix (B-NEW-20 — the 21-stuck-trades bug); xstock UI Stale badge fix (B-NEW-25); closed-trade assetClass persistence (B-NEW-26); 15-trade JSON backfill (B-NEW-27); BE-protect doc sync (xstock_spot deliberately ENABLED per Kyle).

---

## NEXT SESSION PLAN (post-compaction)

**Priority 1 — Continue xStocks diagnostic tab fixes** from `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` Open Items list:
- **B-NEW-14:** `max_bid_ask_spread` filter wiring. Was reverted (adding bid/ask to ticker_snap SELECT caused 130× query slowdown 141ms→18.5s). **Redesign needed:** separate batched bid/ask query AFTER freshness gate (survivor set only). DB threshold already 3.0% per Langston, code path doesn't read it yet.
- **L3-NEW-1:** Investigate `no_pattern_detected` and `family_filter_mismatch` rejection rates — legitimate or over-blocking?

**Priority 2 — Layer-3 calibration items** (B-NEW-15, 16, 18): batch deferred until xstock UI items closed. Will fold into new Phase 24 backfill calibration batch (added to roadmap 2026-05-13).

**New Phase 24 batch added to roadmap (2026-05-13 — Kyle directive):** archived xstock data backfill calibration. Use 2+ weeks of `xstock_spot_ohlc_1m` + `xstock_spot_ticker_snap` + `signal_eval_archive` to perform backfill testing for: (a) filter thresholds (LQ/VN/DI/Corr per family — currently cloned from crypto, never tuned for equity microstructure); (b) regime classifications (likely STRONG_TREND redistribution like crypto saw post-calibration); (c) strategy selection criteria (per-strategy module_constants — currently 26 wildcards); (d) strategy gates. Scope to be defined when batch starts.

**Phase 16 §16.7 added to roadmap (2026-05-13):** Test Suite Recovery. CI red since at least 2026-05-12 23:23 with ~60 pre-existing test failures across b73/cost_telemetry/dynamic_sizing/b72/b70. Triage each: regression / outdated / behavior-change-needing-rewrite. Sequenced AFTER xstock UI close + AFTER any active batch. Approach: do not bundle into BATCH_81 (already reserved for filter-as-first-class) — keep within Phase 16.

**B-NEW-23 carryover** (Phase 16/19 hardening): observability gap that allowed B79.0m.b2 missing-import bug to run silently 2 days. Investigate why `TypeScript Check` CI didn't catch missing identifier. Tighten try/catch around `db.execute` to distinguish ReferenceError from operational errors. Add consecutive-failure alert.

**BATCH_80 24h moonbag-counter forward-watch** (Langston Step 8 non-blocking ask 2026-05-13 14:50 UTC). Window expires 2026-05-14 14:50 UTC. Monitor `concurrentMoonbagByMode.{vts,paper,live}` counter via PM2 logs `[9.2][LADDER] ... concurrent=N` lines. Pre-B80 collapsed 3 same-symbol moonbag transitions into 1 counter increment; post-B80 counts each per-trade (3 increments). If the cap starts rejecting moonbag entries that previously sneaked through, that is the cap finally enforcing its declared semantics — NOT a regression. Flag for the dashboard but don't reverse course. Capture observation summary in next session.

---

## ANSWERS TO RECURRING QUESTIONS

**Q: When was open-trade persistence added?** A: **B79.0g (2026-05-10)** shipped `vts_open_trades` DB table + `vts-trade-persistence.ts` service (insertOpenTrade/deleteOpenTrade/rehydrateOpenTrades/bootstrapOpenTradesFromMemory). **B79.0g-tx (2026-05-11)** made it atomic with closed-flag soft-delete + boot-time GC sweep + 90-day retention. Open trades now persist across PM2 restarts via DB rehydrate. Separate from TEC engine state which persists via `/tmp/trailing-states.json` per B65.2 Directive 9.2.D.

**Q: Where do pre-existing CI test failures fit?** A: **Phase 16 §16.7 Test Suite Recovery** (added 2026-05-13). Sequenced after xstock UI work closes. NOT a new BATCH_81 (that's reserved for filter-as-first-class promotion per Multi-Asset VTS Expansion stretch).

---

## RECURRING ANALYSIS RECIPE ("run the calibration review")

Restored from B79.0a / B79.TEC era MEMORY (was present in commit `8152acd61` 2026-05-08, dropped during xStocks expansion trim). Endpoints unchanged — still callable.

1. `GET /api/analytics/factor-calibration?window=rolling_7d` — 10-row factor table. Post-B78 scoped `asset_class='crypto_spot'`.
2. `GET /api/analytics/exit-strategy-ablation?window=rolling_7d` — 12-variant table sorted by Sharpe.
3. Verify recent fixes: b68_5 lift drift; trailing-after-target DISABLED; liquidity_trap exclusion; floor 0.20; B72 sync-read API healthy; B76 marker present.
4. Plain-language interpretation + recommendations for B67.5 wiring (~2026-05-15).

xStock parallels (when needed, post-Phase-24 backfill-calibration batch):
- `GET /api/xstocks/factor-calibration?window=rolling_7d` (scoped xstock_spot)
- `GET /api/xstocks/exit-strategy-ablation?window=rolling_7d`

## Calibration windows (LOCKED through 2026-05-15)

B67.4 / B68.1 / B68.2 / B68.3 / B68.4 — gates: tertile-monotonic WR, ≥7pp gap, p<0.05, n≥150/bucket. **Pre-B76 lifts captured 2026-05-08:** b67_4 +2.95pp, b68_1 +5.71pp, b68_2 +4.13pp, b68_3 +4.13pp, b68_4 +2.94pp, b68_5 −1.78pp. If any flip post-B76/B78 → revert. Re-run the recipe weekly to track.

---

## NO-TOUCH FENCE on crypto_spot through 2026-05-15

```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```
Halt + revert if cadence drops materially. Fence expires 2026-05-15.

---

## OPERATIONAL FACTS

- xstocks: 260-pair universe + 24h DB-backed trade counts via `vts_open_trades` (B79.0g-tx soft-delete model with 90d retention).
- 75-pair round-robin scan rotation (~1m 45s full universe sweep). 3 pinned benchmarks: SPY/QQQ/GLD.
- xstock + perp feeds archived via B74 (renamed to xstock_*_ohlc_1m / xstock_*_ticker_snap in B79.0e).
- Strategy registration: 10 enabled for xstock_spot (DB `strategy_gates`), 9 disabled.
- xstock_spot BE-protect = **TRUE** in DB per Kyle directive (intentional, not a bug).
- Active trading OFF (Phase 19 territory). VTS passive learning ON.
- TEC state persists across PM2 restarts via `/tmp/trailing-states.json` (B65.2). Open trades persist via DB (B79.0g + 0g-tx).
- **TEC is now per-trade keyed (BATCH_80)** — `trailingStates: Map<tradeId, TrailingState>`.

---

## LANGSTON RUNTIME + COMMS — see CLAUDE.md §6 + §8

Two systemd bridges on Hetzner `204.168.141.77`. Unified inbox `/var/log/cc-bridge-inbox.jsonl`. Send protocol = 3 steps (Telegram visibility + SSH-deliver via `claude -p` + verbatim relay back to Telegram). Use `--permission-mode bypassPermissions`; scp-stage files to `/home/langston/inbox/<batch>/`; fresh UUID per send.

---

## Kyle Operating Directives (active, condensed)

- **NO PATCHES** (CLAUDE.md §5 #15). Long-term sustainable solutions only.
- **Per-asset-class config is the default** for behavioral knobs.
- **Backpressure: vertical-scale, never asset-class shedding.**
- **Each new asset class gets its OWN dedicated observation UI tab.**
- **No fallbacks for DB-governed settings.**
- **Kyle messages me in Claude Desktop.** Telegram = Kyle↔Langston + CC outbound visibility only.
- **Iterate with Langston to consensus** — escalate only on deadlock / scope expansion / new directive / risk boundary.
- **Calibration is a mandatory onboarding step** (workflow Step 6b 2026-05-13).
- **"Staging verified" means UI-navigated, not curl-checked** (CLAUDE.md §9.3).
- **Numeric deltas / scaffolding-vs-functional declarations** must be top-of-report explicit (CLAUDE.md §9.1, §9.2).

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` (xstock UI tracker, all-time changelog)
4. `1-system-manual/POST_AUDIT_ROADMAP.md` (Phase 24 follow-ups + Phase 16 §16.7 + new backfill calibration batch)
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
6. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` (canonical blueprint, Step 6b calibration cycle)
