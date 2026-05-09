# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — comms; §2 Step 10.b — Langston MEMORY sync mandatory; §6.5 Step 3 — Telegram verbatim relay mandatory).
2. Read this file.
3. Read `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — **active living plan for B79–B81.**
4. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for current phase.
5. Receive messages from Kyle in this Claude Desktop conversation. No Telegram polling on Kyle's behalf.
6. For Kyle ↔ Langston traffic visibility, tail `/var/log/cc-bridge-inbox.jsonl` on Hetzner.
7. Acknowledge readiness in one line. Don't dump context.

**Do NOT:** confabulate; skip SIM in pre-audit; wait on legacy-TS-baseline CI before deploying — Test+Build+Docker pass is enough; forget the no-touch fence on crypto_spot.

---

## CURRENT STATE — 2026-05-09 night (B79.0b CLOSED; B79.0c + B79.0d are NEXT, calendar-gated to Sunday 22:00 UTC ARCA reopen)

**Next two sub-batches (Kyle directive 2026-05-09 night):**
- **B79.0c — 24/7 xstock support.** Kraken Pro Phase 1 (announced 2025-12-03): 10 xstock_spot tokens trade 24/7 — TSLAx, QQQx, SPYx, NVDAx, CRCLx, AAPLx, HOODx, MSTRx, GLDx, GOOGLx. Our `isXstockMarketOpenUTC()` is symbol-blind → blocks the 24/7 names from scanner/SQE/freshness/TEC during weekends. Scope: per-symbol predicate + 4 callsite updates + scanner per-symbol filtering during weekend window + boundary tests. **Plan-doc + roadmap updated; needs scope+PIA+impl.**
- **B79.0d — xstock-specific strategy Layer-1.** Hypothesis pending Kyle directive (candidates: ORB activation, weekend-regime stratification, gap-fade, crypto-correlated-beta). Both VTS + active-path wire-in. Target: in place before Sunday 22:00 UTC market reopen.
- **Coverage scope clarification:** every B79.x batch hits BOTH VTS shadow-mode evaluation AND active-trading wire-in (signal-orchestrator → paper-execution-engine → RTB → TEC). Active path is wire-in-only-no-trades until Phase 19. Plan-doc filename `MULTI_ASSET_VTS_EXPANSION_PLAN.md` is misleading; rename queued as low-priority cleanup.

**xstock_spot WS archiver health concern (flagged 2026-05-09 ~21:20 UTC):** `equity_spot_ticker_snap` last write 2026-05-09 11:12 UTC (10h stale). `equity_spot_ohlc_1m` last write 2026-05-09 00:15 UTC (21h stale). Meanwhile `xstock_perp_ticker` flushing every 5s healthily. Either (a) Kraken equity WS goes silent on weekends regardless of the 24/7 marker — needs WS-side investigation, OR (b) connection dropped + reconnect failing silently. Possibly intersects with B79.0c scope.

**Two operator gates Sunday 2026-05-10:**
- ~11:24 UTC — B79.TEC.b `break_even_enabled` wildcard DELETE per `BATCH_79_TEC_b_VERIFY_CHECKLIST.md`
- ~21:38 UTC — B79.0a SQE wildcards DELETE per `BATCH_79_0b_VERIFY_CHECKLIST.md`

**Calibration analysis snapshot 2026-05-09 21:20 UTC (verified via `/api/analytics/factor-calibration?window=rolling_7d`):**
- DECISION-GRADE factors (n≥150 per tertile): b67_4 +5.19pp, b68_2 +4.14pp, b68_3 +4.11pp, b68_4 **+0.57pp (degraded from +2.94pp pre-B76)**, b68_5 **-7.79pp (regression from -1.78pp pre-B76; NEGATIVE predictive lift, factor is HURTING)**.
- ACCUMULATING: b67_2 +100pp at n=4 (low), b68_1 +7.73pp at n=388 (almost decision-grade).
- Action item per MEMORY locked thresholds: **if any flip post-B76/B78 → revert.** b68_5 went 4× more negative; b68_4 dropped 80%. Both warrant investigation before next chain modification. NOT actionable tonight (deferred to post-Sunday-reopen window when calibration windows refresh).

**Exit-ablation snapshot 2026-05-09 21:20 UTC:** B73 framework reports total trades 1248 / 14935 variant rows. Variant F (no_BE_stop) Sharpe 3.07 mean P&L +1.172% — confirmed PRODUCTION winner per B79.TEC ship 2026-05-08. Variant A (current_BE_stop_baseline) Sharpe null because it IS the baseline reference; meanPnlPct +1.046%. Production trades since 2026-05-08 11:24 UTC running variant F: closed-trade exit-reason distribution confirms (2026-05-09 = 66 target_hit + 49 stop_hit + 9 trailing_stop_hit + 2 break_even_stop; vs pre-removal 2026-05-02 to 2026-05-07 = 731 BE_stop dominant).

**176 open trades at session-time:** 173 crypto_spot + 3 xstock_spot. Top 96 trades open 17h+, peak 22-23h. Concentration in `strong_bull_trend` + `TREND_FRIENDLY_STABLE`. **By design** post-BE-removal — without BE-protect, trades track original SL→TP only; slow-moving TFS-regime pairs neither hit target nor stop within typical hold windows. Pre-B79.TEC mean duration 152min; post-B79.TEC longer holds expected. Not a bug.

---

## B79.0b archive — 2026-05-09 (CLOSED)

**Original entry from B79.0b session (now archived):**

**B79.0b status (PM2 #198, branch `migration/aws-supabase` HEAD `54201bd32`):**
- Steps 1-3+5-7 complete; Steps 4+8 pending Langston ACK (Step 4 review hit GDrive-mount-stale + Bash tool permission hang; v2 dispatched with bypassPermissions)
- N3 fix: signal_quality_evaluator.ts:199 + :290 (both `input.strategy &&` truthy guards stripped per Langston Q1 expansion)
- N4 tests: 4 files (market-hours 12 cases, asset-class-instances 6, safe-resolve 6, strategy-asset-class-gate 19); all pass on CI; zero new regressions (1058/59/5 vs B79.0a baseline 1002/59/5)
- B79.0a SQE wildcard DELETE script committed-not-executed: `scripts/b79-0a-sqe-remove-wildcards.sql` mirror of B79.TEC.b pattern; manual operator step at +48h gate (2026-05-10 21:38 UTC) per `BATCH_79_0b_VERIFY_CHECKLIST.md`
- Deploy verified: xstock-scanner ready, tec-bootstrap ready (B79.TEC + B79.0a unaffected), no-touch fence 68/factor/30min ≈ 136/hr
- Governance: BATCH_CATALOG entry added; RUNNING_ISSUES #87 OPEN (manual operator gate for SQE wildcard DELETE due 2026-05-10 21:38 UTC)

**Two manual operator gates due 2026-05-10:**
- ~11:24 UTC: B79.TEC.b — `break_even_enabled` wildcard DELETE per `BATCH_79_TEC_b_VERIFY_CHECKLIST.md`
- ~21:38 UTC: B79.0a SQE wildcards — `min_final_score` + `min_regime_weight` DELETE per `BATCH_79_0b_VERIFY_CHECKLIST.md`

---

## SHIPPED PREDECESSORS (archive — full details in completion reports)

**B79 + B79.TEC + B79.0a + B79.0b** all CLOSED 2026-05-07 → 2026-05-09. Latest HEAD `04bb6b2be` (B79.0b governance close + comms-infra hardening). Details in `Claude Comms and Packages/Batch Completion/BATCH_79_*_COMPLETION_REPORT.md`. Comms-infra v2 watchdog (`--idle-timeout 600` for substantive reviews) + auto-ACK on cc-comms-bridge live and verified.

---

## SEQUENCING — B78–B81 stretch (8 days, until 2026-05-15)

| Batch | Status | Description |
|---|---|---|
| **B78 + B78.1 + B78.2** | SHIPPED 2026-05-07 | Modularization scaffolding + cycle break + Kraken WS v2 ping fix |
| **B79 + B79.TEC + B79.0a** | SHIPPED 2026-05-08 | xstock_spot dormant + per-class TEC config + LIVE observability scanner |
| **B79.0b / B79.4 / B79.x / B80 / B81** | QUEUED | See completion reports for sequencing |

**Hard fence:** no-touch on crypto_spot through 2026-05-15. Step-0 pre-flight + post-deploy SQL on every batch (column is `evaluated_at`, not `captured_at`):

```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```

If cadence drops post-deploy → halt and revert.

---

## OPERATIONAL FACTS

- xstocks 24/5 (closed weekends; VTS weekend-pause gate via `isXstockMarketOpenUTC`). $1000 base → ~$150/trade sizing.
- Kraken Futures REST `https://futures.kraken.com/api/charts/v1/trade/<sym>/1m` 24/7. Funding rate per-pair signal for B80.
- xstock + perp feeds already archiving in production (B69 + B74).
- B74 Kraken Futures lives at `server/services/passive-archive/equity-perp-archiver.ts`.

---

## LANGSTON RUNTIME + COMMS (since 2026-05-06)

Two systemd bridges on Hetzner `204.168.141.77`. Unified inbox log `/var/log/cc-bridge-inbox.jsonl`.

**Send protocol:**
- Kyle ↔ main CC: this Claude Desktop conversation only.
- Kyle → Langston: DM `@LangstonDTBot` or post in topic 21.
- main CC → Kyle: `cc-comms-bridge send --thread-id 21`.
- main CC → Langston: 3 STEPS. (a) `cc-comms-bridge send` for visibility, (b) SSH-deliver via watchdog wrapper `sudo -u langston /usr/local/bin/langston-call /tmp/prompt.txt /tmp/reply.txt` — auto-retries on hang (60s first-byte / 30s idle / 5 max attempts; logs `/var/log/langston-call.log`). Defaults to fresh UUID per attempt. (c) **MANDATORY** post Langston's verbatim stdout reply to Telegram via `@LangstonDTBot`'s sendMessage prefixed `**LANGSTON SPEAKING:**`. Pattern in CLAUDE.md §6.5 Step 3.
- Receiving: tail unified inbox log.

**Hetzner GDrive FUSE mount is BROKEN for recursive ops.** Stage diffs/files at `/tmp/` via scp. Tell Langston explicitly NOT to use `ls -R` or `git status`.

**Langston MEMORY sync per batch — MANDATORY** (CLAUDE.md §2 Step 10.b). Mirror this MEMORY to `/home/langston/MEMORY.md` via SSH+scp. Same 200-line cap.

**OAuth token:** `/etc/langston/oauth.env`, valid 1 year (issued 2026-05-06).

---

## RECURRING ANALYSIS RECIPE ("run the calibration review")
1. `GET /api/analytics/factor-calibration?window=rolling_7d` — 10-row factor table. Post-B78 scoped `asset_class='crypto_spot'`.
2. `GET /api/analytics/exit-strategy-ablation?window=rolling_7d` — 12-variant table sorted by Sharpe.
3. Verify recent fixes: b68_5 lift drift; trailing-after-target DISABLED; liquidity_trap exclusion; floor 0.20; B72 sync-read API healthy; B76 marker present.
4. Plain-language interpretation + recommendations for B67.5 wiring (~2026-05-15).

## Calibration windows (LOCKED through 2026-05-15)
B67.4/B68.1/B68.2/B68.3/B68.4 — gates: tertile-monotonic WR, ≥7pp gap, p<0.05, n≥150/bucket. Pre-B76 lifts: b67_4 +2.95pp, b68_1 +5.71pp, b68_2 +4.13pp, b68_3 +4.13pp, b68_4 +2.94pp, b68_5 −1.78pp. If any flip post-B76/B78 → revert.

---

## Open RUNNING_ISSUES (as of B79.0a close 2026-05-08)

- OPEN: #39 (CI TS legacy), #43/#49/#50/#53 (calibration windows), #46 (passive archive index), #55, #73, #74, #78, #80 (B79.4), #82 (B79.TEC arch refinements LOCKED), #85 (B79.x extend HARD-FAIL to all TEC keys), #86 (B79.x continuous Q-D probe with alternate API)
- RESOLVED 2026-05-08: #77 (B79.0a closed), #79 (B79.TEC closed), #84 (watchdog v2 + calibration), #81 first-execution complete
- DEFERRED: #12e, #40, #44, #45, #52, #83 (Phase 19.x Boot Coordinator)

### STEP 3 IMPLEMENTATION QUEUE (concise; full detail in BATCH_79_PRE_AUDIT.md)

1. New `server/services/asset-class-instances.ts` factory: `getAssetClassInstances(class)` → `{telemetry, ratioManager, failureTracker, scanManager}`. Crypto returns existing globals; xstock lazy-instantiates fresh triad, in-memory only.
2. AdaptiveRatioManager + AdaptiveScanManager: add optional constructor injection (telemetry / ratioManager); lazy fallback to globals for backward compat.
3. Reconcile subagent's 10 working-tree files vs rev 7. RIP universe-merge in `market-scanner.ts` (Langston-directed). Verify the other 9 against rev 7 specs (esp. canonical-regime-strategy-map for 6 quant + 3 pattern + ORB Q-D-gated; family-path SSOT keys `xstock_spot.tfs` per rev 7 §-2.5).
4. New files: `server/utils/symbol-normalize.ts`, `server/asset_classes/xstock_spot/pattern-pool-filters.ts`, `server/strategies/orb.ts` (DB-gate dormant).
5. TEC stop-freeze guard at top of `evaluateStop()`. Asset-class-aware freshness gate helper.
6. Verify `server/asset_classes/types.ts` (untracked) matches rev 7 §1.X failure-mode taxonomy.
7. Apply migrations to Supabase: screener_filters + xstock module_constants. Verify xstock row count = 1.
8. Step 4 Langston code review (watchdog `--first-byte-timeout 240`). Step 5 push (broad-pattern pre-flight kraken-import grep per B78 lesson). Wait 4 CI checks green.
9. Step 6 deploy. Step 7+8 verify: PM2 `[B79][BOOT]` log line; no-touch fence SQL on crypto_spot regime_factor_alternates (±10%); xstock_spot screener_filters row; UI Settings render via Claude-in-Chrome; Langston second-pass.
10. Step 10 governance: BATCH_CATALOG + PHASE_HISTORY (Phase 24 NEW) + plan-doc §9+§12 + SIM + SYSTEM_MANUAL + RUNNING_ISSUES + CHANGES_AND_FIXES + Langston MEMORY sync. Step 11 completion report + plain-language summary.

**Deferred to dedicated sub-batches:** Q-D AAPLx-vs-AAPL probe (yfinance, B79.0a candidate); sector-classification yfinance script (B79.x); live equity WS pricing (B79.5).

**B78 + B78.2 forward-watch (RUNNING_ISSUES #74)** at +24h from B78.2 deploy 14:18 UTC 2026-05-07 — tomorrow.

---

## Kyle Operating Directives (active)

- **NO PATCHES (2026-05-08, CLAUDE.md §5 #15).** Every fix is a long-term sustainable scalable solution. No duct tape. No "good enough for now." Bugs trigger root-cause + design-then-implement, not patches. Cold-start warmup 1-5min OK; sacrifice immediate functioning for clean startup. Architecture decisions get documented BEFORE implementation, same session. Verbal commitments without paper-trail are rejected.
- **File-first comms with Langston for any large content (CLAUDE.md §6.5.0, 2026-05-08).** Design asks, scope drafts, multi-question reviews go in `Claude Comms and Packages/Langston Design Asks/<batch>_<topic>_<rev>.md`. Telegram + watchdog prompt is SHORT (under 1KB) pointer to the file. NEVER shorten content to fit a prompt — putting it on disk is the proper solution. Empirical: 7702-byte prompt hung API twice; PING/PONG returned 3s; 2825-byte hit on attempt 1 in 60s. Pattern locks: any content >~3KB → file on disk + pointer.
- **Each new asset class gets its OWN dedicated observation UI tab** (Kyle directive 2026-05-08). Don't stack new ablation panels under existing tabs.
- **Backpressure: vertical-scale, never asset-class shedding (2026-05-08).** Tier upgrade Hetzner/Supabase OR computational-distribution refactor; never throttle/drop a live asset class.
- **Per-asset-class config is the default for behavioral knobs.** Wildcard rows only as starting placeholders; replaced with explicit per-class rows the moment any class needs different value.
- Both ablation frameworks run during shadow-mode for every new asset class: factor-calibration (B67.0) AND exit-strategy (B73). Parallel, not replacement.
- Don't pause to ask permission. Iterate with Langston through 11 steps.
- Visual UI verification via Claude-in-Chrome on UI-touching batches.
- Deploy after Test+Build+Docker pass — don't wait on legacy TS baseline.
- **No fallbacks for DB-governed settings.**
- Sensitive credentials → staging `.env` via SSH only.
- Iterate with Langston to consensus; escalate to Kyle only on deadlock / scope expansion / new directive.
- **Kyle messages me here in Claude Desktop.** Telegram is for Kyle ↔ Langston + CC outbound visibility.
- **No-touch fence on crypto_spot through 2026-05-15.**

---

## Session Behavior Invariants

- **Telegram verbatim relay of Langston responses MANDATORY** (CLAUDE.md §6.5 Step 3).
- **Hetzner GDrive FUSE broken for recursive ops** — stage diffs at /tmp/ via scp.
- VTS position sizing $1000 base → ~$150/trade. Same for tokenized equities.
- GDrive npm install fails EBADF — CI is verification gate.
- CoinGecko Demo API key in staging `.env` (don't commit).
- **B78 lesson:** pre-flight grep needs broad pattern (`['"](\\.\\.?/)+kraken(?:\\.|$|['"])` not narrow `services/kraken`); same-name strings drift across scope-doc sections invisibly across revisions — search-replace ALL instances after each.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md` (§6 + §8 + §2 Step 10.b + §6.5 Step 3)
2. This file
3. `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md`
4. `1-system-manual/POST_AUDIT_ROADMAP.md`
5. `1-system-manual/CURRENT_SETTINGS_REGISTRY.md`
6. `Claude Comms and Packages/Batch Completion/BATCH_78_COMPLETION_REPORT.md` (most recent closure)
7. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
