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

## CURRENT STATE — 2026-05-14 (BATCH_82 CLOSED + xStocks UI sprint data/UI fixes all shipped, PM2 #282)

**xStocks diagnostic tab data/UI sprint — FULLY CLOSED 2026-05-14.** All three data/UI items shipped + verified end-to-end on staging:

- **B-NEW-31 (commit `3e7a7ccbd`, PM2 #276):** Header row + first column frozen on Open + Closed Simulated Trades tables. Sticky positioning with z-index layering (z-30 top-left corner, z-20 thead, z-10 body first-col). Active-trading tables explicitly out of scope per Kyle — Phase 19.
- **B-NEW-14 (commits `3e17ff31e` + `b5b057161`, PM2 #280):** max_bid_ask_spread peer global filter on xstock_spot. Mirrors crypto's pattern semantically — crypto reads bid/ask from live Kraken ticker payload, xstock reads them from archived snap row (same upstream Kraken payload). Previous "130× slowdown" revert was a measurement artifact; live speed test confirmed adding bid/ask to the SELECT is 40-43ms either way. Tab strip wrap bonus shipped same commit.
- **B-NEW-TZ (commit `82325e27b`, PM2 #281):** User timezone setting actually persists + renders. Surfaced by Kyle mid-sprint; bundled with the diagnostic-tab work. PUT /api/settings was 410-dead (deprecation over-corrected); GET never returned timezone (built from buildSettingsFromGuardrails which omitted it). Fix: GET also fetches users.timezone; PUT accepts allow-listed { timezone } with Intl validation and writes users.timezone via storage.updateUser. Kyle's account set to Europe/Warsaw; top-bar verified showing "Local Time: GMT+2".
- **B-NEW-21 (commit `19de3bb4f`, PM2 #282):** `/api/xstocks/freshness` rewritten — `unnest + LATERAL JOIN` per symbol driving the (symbol, captured_at) index. 13.8s → 88ms (157× speedup). Note: the visible per-pair Fresh-Tick Latency UI panel was removed from xstocks-tab.tsx on 2026-05-12 as a workaround for the timeout; endpoint now safe to consume but re-enabling the visible panel is a separate UI decision pending Kyle's call.

**Plain-language summaries to Kyle (Kyle directive 2026-05-14)** — added to project CLAUDE.md §1 + §11 + Langston's `/home/langston/CLAUDE.md` §2. All Kyle-facing summaries are plain English now: no function names, file paths, code snippets, SQL, table/column names, or framework jargon. Reference exemplar: B-NEW-14 / B-NEW-21 explanations 2026-05-14. CC↔Langston exchanges stay technical at whatever depth best gets the outcome — bidirectional, no constraint either way.

**Open xStocks tab items remaining = LAYER-3 CALIBRATION ONLY** (deferred to Phase 24 backfill calibration batch per Kyle directive): B-NEW-15 (DI rejection on reversal/oscillator), B-NEW-16 (Trend + Breakout IMF threshold differentiation), B-NEW-18 (regime + family classification calibration), L3-NEW-1 (no_pattern_detected + family_filter_mismatch investigation). Data/UI sprint complete — calibration work begins after Phase 24 archived data backfill.

## EARLIER — BATCH_82 (still in 24h forward-watch window, PM2 #275, deploy_timestamp 2026-05-14T11:28:24Z)

**BATCH_82 SHIPPED + UI-verified live.** xstock_spot ablation + calibration data path repair. 5th instance of crypto-first / asset-class-lost pattern (after B-NEW-20/22/25/26) — structurally closed via type-system-enforced caller-resolves. `emitAblationRecord(assetClass: AssetClass)` REQUIRED parameter (no default). `ReplayContext.assetClass: AssetClass` non-nullable. Both `??` fallbacks dropped (line 264 SQL bind + line 294 OHLC fetch). Two composite indexes added (CONCURRENTLY): `(asset_class, created_at DESC)` on `exit_strategy_alternates`, `(asset_class, evaluated_at DESC) WHERE replay_completed_at IS NOT NULL` on `regime_factor_alternates`. UI empty-state per panel with `ASSET_CLASS_REGISTRY.displayName` ("xStock Spot" not raw enum). **Endpoint speedups: xstock-ablation 954×, xstock-calibration 501×, crypto-ablation 63× regression-test.** UI verified via Claude-in-Chrome 11:40 UTC — both panels render new "No xStock Spot data yet — accumulating" copy.

**Commits:** `0efa71c48` (scope rev2) → `af7f788f0` (pre-audit rev1) → `cd2f7ee53` (pre-audit rev2) → `dbdde1bfe` (Step 3 impl: 6 code files + 2 SQL migrations) → governance commit (this session).

**B83 hotfix SHIPPED 2026-05-14 (separate from B82).** `ReferenceError: tradeId is not defined` in `vts-runner.ts` second for-loop. Root cause: BATCH_80 Phase 1 (2026-05-13) renamed `getTrailingState(symbol)` → `getTrailingState(tradeId)` correctly in first for-loop, but second for-loop destructures iteration variable as `id` (not `tradeId`). Three references at `:2349`, `:2570`, `:2572` referenced out-of-scope `tradeId` → JS threw ReferenceError every cycle that had ≥1 trade to close → entire function aborted mid-loop → ZERO trades closed for ~24 hours. Fix: 3 single-char changes `tradeId` → `id`. Verified: 85 trades closed cleanly via natural exit rules on first post-fix cycle. Commit `b4cde6b85` (PM2 #274). `[B83-CYCLE]` log line shipped as permanent health-beat (no longer gated on `resolved > 0` — the anti-pattern that hid the failure).

**Governance shipped in same stretch:**
- §10d observability backfill batch filed in `MULTI_ASSET_VTS_EXPANSION_PLAN.md` (exit-cycle health dashboard + multi-API rate-limit dashboards for Kraken Public/Private/WS/Futures + CoinGecko + Supabase + Anthropic + Telegram + GitHub + Finnhub + System Monitoring page reorganization + code-side hardening + rename-inventory protocol). Sequenced AFTER xStocks UI sprint closes.
- SIM "Rename invariants" section + 3 new "If I Change X, Check Y" entries (post-B83 + B82).
- Langston's stale `/home/langston/.claude/CLAUDE.md` loader (referenced retired CCPI + DT_Staged_Changes + batch zip workflow + INSTRUCTIONS.md) **rewritten** to point at canonical project CLAUDE.md (§4 retirement + §5 #1 no-zip rule). Backup at `/home/langston/.claude/backups/CLAUDE.md.pre-B82.bak`.

**Activation thresholds for xstock panels (Kyle Q 2026-05-14):**
- Exit Strategy Ablation: **1 closed xstock trade** → 12 variant rows → empty-state hides.
- Factor Calibration: **1 closed xstock trade + 1 nightly replay-ablation cron run** → `totalReplayed > 0` → empty-state hides.

xStock market opens 13:30 UTC (US RTH); panels should populate within hours of first closes.

---

## NEXT SESSION PLAN (post-compaction)

**Priority 1 — Finish xStocks diagnostic tab fixes** from `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` Open Items list. Closed in this session: B-NEW-28 (graduated to BATCH_82, shipped), B-NEW-31 (header + first-col freeze), B-NEW-14 (max_bid_ask_spread peer global filter + tab strip wrap). Open items remaining:
- **B-NEW-21:** `/api/xstocks/freshness` Supabase statement-timeout. Iterates ~260 symbols joining the snap table. Options: add `(symbol, captured_at DESC)` index, switch to per-symbol DISTINCT ON in chunks, or materialized latest-per-symbol view. Observation-only — not blocking trade flow.
- **B-NEW-18** *(Layer-3)*: xstock regime + family classification calibration. Same exercise crypto went through. Fold into Phase 24 backfill calibration batch.
- **B-NEW-15** *(Layer-3)*: DI killing reversal + oscillator families on xstock (65%/66% rejection rates). Fold into Phase 24.
- **B-NEW-16** *(Layer-3)*: Trend + Breakout family IMF thresholds IDENTICAL on xstock — needs differentiation. Fold into Phase 24.
- **L3-NEW-1** *(Layer-3)*: Investigate `no_pattern_detected` + `family_filter_mismatch` rejection rates. Run after all UI items closed.

**Priority 2 — Forward-watches active:**
- BATCH_82 T+1h / T+6h / T+24h verification re-runs (queries in pre-audit §6). Append results to `BATCH_82_COMPLETION_REPORT.md` §"Forward-watch" appendix as they tick. T+1h = 2026-05-14T12:28:24Z, T+6h = 17:28:24Z, T+24h = 2026-05-15T11:28:24Z. Watch for: (a) first xstock_spot row landing in either ablation/calibration table, (b) endpoint timings holding < 5s p99, (c) no new crypto_spot mis-tags for xstock pairs.

**Priority 3 — Scheduled future batches (POST_AUDIT_ROADMAP):**
- **Phase 16 §16.7 Test Suite Recovery:** ~60 pre-existing CI failures (TypeScript Check + Test Suite RED baseline since 2026-05-12). Sequenced after xStocks UI work closes.
- **§10d Observability backfill batch** (`MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10d): exit-cycle health dashboard + multi-API rate-limit dashboards. Sequenced after xStocks UI sprint closes.
- **Phase 24 archived xstock data backfill calibration batch:** filter thresholds + regime classifications + strategy selection + strategy gate testing using 2+ weeks of archived xstock data.

---

## ANSWERS TO RECURRING QUESTIONS

**Q: How many closed xstock trades before tables activate?** Exit Strategy Ablation: 1. Factor Calibration: 1 trade + 1 nightly cron run.

**Q: When was open-trade persistence added?** B79.0g (2026-05-10) + B79.0g-tx (2026-05-11). `vts_open_trades` DB table + soft-delete with 90-day retention. TEC state persists separately via `/tmp/trailing-states.json` per B65.2.

**Q: What was B83?** `ReferenceError: tradeId is not defined` in `resolveOpenVirtualTrades` second for-loop. BATCH_80 Phase 1 rename missed three sites where the destructured iteration variable is `id` not `tradeId`. 24hr silent pipeline stall; 85-trade backlog flushed cleanly on first post-fix cycle. Fix: commit `b4cde6b85`.

---

## RECURRING ANALYSIS RECIPE ("run the calibration review")

1. `GET /api/analytics/factor-calibration?window=rolling_7d` — 10-row factor table.
2. `GET /api/analytics/exit-strategy-ablation?window=rolling_7d` — 12-variant table sorted by Sharpe.
3. Verify recent fixes: b68_5 lift drift; trailing-after-target DISABLED; liquidity_trap exclusion; floor 0.20; B72 sync-read API healthy; B76 marker present.
4. Plain-language interpretation + recommendations for B67.5 wiring.

xStock parallels (post-Phase-24 backfill-calibration batch):
- `GET /api/xstocks/factor-calibration?window=rolling_7d` (scoped xstock_spot)
- `GET /api/xstocks/exit-strategy-ablation?window=rolling_7d`

## Calibration windows (LOCKED through 2026-05-15)

B67.4 / B68.1 / B68.2 / B68.3 / B68.4 — gates: tertile-monotonic WR, ≥7pp gap, p<0.05, n≥150/bucket. **Pre-B76 lifts captured 2026-05-08:** b67_4 +2.95pp, b68_1 +5.71pp, b68_2 +4.13pp, b68_3 +4.13pp, b68_4 +2.94pp, b68_5 −1.78pp. If any flip post-B76/B78 → revert.

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

- xstocks: 260-pair universe + 24h DB-backed trade counts via `vts_open_trades` (B79.0g-tx soft-delete with 90d retention).
- 75-pair round-robin scan rotation. 3 pinned benchmarks: SPY/QQQ/GLD.
- xstock + perp feeds archived via B74 (renamed `xstock_*_ohlc_1m` / `xstock_*_ticker_snap` in B79.0e).
- Strategy registration: 10 enabled for xstock_spot. xstock_spot BE-protect = **TRUE** in DB per Kyle directive (intentional).
- Active trading OFF (Phase 19 territory). VTS passive learning ON.
- TEC state persists across PM2 restarts via `/tmp/trailing-states.json`. Per-trade keyed (BATCH_80).
- `[B83-CYCLE]` log fires unconditionally per VTS exit cycle (post-B83) — replaces gated `if (resolved > 0)` anti-pattern.
- `(asset_class, ...time...)` composite indexes on both ablation tables (BATCH_82) — partial on `regime_factor_alternates` for `replay_completed_at IS NOT NULL`.

---

## LANGSTON RUNTIME + COMMS — see CLAUDE.md §6 + §8

Two systemd bridges on Hetzner `204.168.141.77`. Unified inbox `/var/log/cc-bridge-inbox.jsonl`. Send protocol = 3 steps (Telegram visibility + SSH-deliver via `claude -p` + verbatim relay back to Telegram with `**LANGSTON SPEAKING:**` prefix). Use `--permission-mode bypassPermissions`; scp-stage large files to `/home/langston/inbox/<batch>/`; fresh UUID per send. Langston's loader at `/home/langston/.claude/CLAUDE.md` was rewritten in B82 Step 10 — references current canonical paths now.

---

## Kyle Operating Directives (active, condensed)

- **NO PATCHES** (CLAUDE.md §5 #15). Long-term sustainable solutions only.
- **Per-asset-class config is the default** for behavioral knobs.
- **Backpressure: vertical-scale, never asset-class shedding.**
- **Each new asset class gets its OWN dedicated observation UI tab.**
- **No fallbacks for DB-governed settings.**
- **Kyle messages me in Claude Desktop.** Telegram = Kyle↔Langston + CC outbound visibility only.
- **Iterate with Langston to consensus** — escalate only on deadlock / scope expansion / new directive / risk boundary. Independently evaluate his feedback; never rubber-stamp.
- **Calibration is a mandatory onboarding step** (workflow Step 6b 2026-05-13).
- **"Staging verified" means UI-navigated, not curl-checked** (CLAUDE.md §9.3).
- **Numeric deltas / scaffolding-vs-functional declarations** must be top-of-report explicit (CLAUDE.md §9.1, §9.2).
- **Rename inventory protocol** (post-B83, 2026-05-14): grep-inventory all OLD-name call sites before commit; per-row decision (RENAMED / KEPT-AS-OLD-WITH-REASON / REMOVED). Block-scope for-loop iteration variables are unforgiving — TS won't catch the bug.
- **Plain-language summaries to Kyle, every time** (Kyle directive 2026-05-14, CLAUDE.md §1 + §11). No function names, file paths, code snippets, SQL, or jargon in messages to Kyle. Reference bar: B-NEW-14 / B-NEW-21 explanations from 2026-05-14. CC↔Langston exchanges stay technical at whatever depth best gets the outcome. Same rule mirrored to Langston's CLAUDE.md §2 (Langston→Kyle plain, Langston→CC technical).

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` (B-NEW-28 closed; B-NEW-14/15/16/18/21 + L3-NEW-1 remain)
4. `1-system-manual/POST_AUDIT_ROADMAP.md` (Phase 24 + Phase 16 §16.7 + §10d observability batch + new backfill calibration batch)
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
6. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` (canonical blueprint)
