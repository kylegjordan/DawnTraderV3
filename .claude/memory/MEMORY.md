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

## CURRENT STATE — 2026-05-10 (Phase 24 CLOSED; B79.0h governance retrospective shipped)

**B79.0h — Phase 24 governance retrospective.** ASSET_CLASS_ONBOARDING_WORKFLOW.md MAJOR update with H.1.x post-mortem (lessons by sub-batch incl. comms-infra protocols) + H.1.y updated decision rules (10 new if-then triggers from B79.0a-0g). SIM updated with collision-set + vts_open_trades + table renames entries. SYSTEM_MANUAL appendix with 10 cross-cutting architectural patterns. PHASE_HISTORY sub-batch table populated. POST_AUDIT_ROADMAP Phase 24 closure recorded. **Phase 24 success criteria MET — xstock_spot fully onboarded across 9 sub-batches + onboarding workflow battle-tested + ready for Phase 25 (B80 crypto_perp).**

**Forward path post-Phase-24:**
- Phase 25 = B80 (crypto_perp) — implementer reads ASSET_CLASS_ONBOARDING_WORKFLOW.md H.1.x + H.1.y FIRST, then walks Sections A-G with checklist applied explicitly.
- B79.0g-tx (RUNNING_ISSUES #91) — close-time atomic transaction through persistRealPriceTrade refactor; affects B73+B70 hooks. Sequence after B80 ships.
- B79.x calibration sub-batches — Layer-1→Layer-3 promotion of xstock_spot thresholds based on shadow-mode evidence.
- B79.5 — live-pricing adapter for ws-equities (Phase 19 prerequisite).
- B79.6 — sector-aware portfolio cluster prevention (Stage 12.5).
- Kraken WS-equities weekend silence (RUNNING_ISSUES #89) — Kraken Pro feed-tier investigation OR REST polling fallback.

---

## PHASE 24 ARCHIVE (CLOSED 2026-05-10)

| Sub-batch | Commit | PM2 | Summary |
|---|---|---|---|
| B79 | `260cc8cc5` | #184 | Dormant scaffold + workflow doc |
| B79.TEC | `7eb4f5452` | #190 | Per-class TEC config + HARD-FAIL boot |
| B79.0a | `a327964a5` | #197 | Live scanner + telemetry triad + freshness helper |
| B79.0b | `54201bd32` | #198 | N3+N4 cleanup + SQE wildcard DELETE script |
| B79.0c | `e37679ebc` | #202 | Per-symbol 24/7 predicate (Kraken Phase 1) |
| B79.0d | `13178e9b5` | #203 | ORB real implementation (~210 lines) |
| B79.0f | `3ba99237a` | #204 | Collision disambiguation + 4862-row backfill |
| B79.0g | `fb42335f7` | #205 | vts_open_trades persistence + bootstrap-with-re-resolve |
| B79.0e | `aca52acdc` | #206 | equity_*→xstock_* (172 DB objects) |
| B79.0h | (gov) | n/a | Workflow retrospective + SIM/SYSTEM_MANUAL/PHASE_HISTORY |

**Pending operator gates (Sunday 2026-05-10/11):**
- ~11:24 UTC — B79.TEC.b `break_even_enabled` wildcard DELETE per checklist
- ~21:38 UTC — B79.0a SQE wildcards DELETE per checklist

**Open RUNNING_ISSUES post-Phase-24:** #89 Kraken WS-equities weekend silence, #90 ORB risk_reward_ratio rename, #91 B79.0g-tx atomic close-time tx

**Calibration analysis snapshot 2026-05-09 21:20 UTC (verified via `/api/analytics/factor-calibration?window=rolling_7d`):**
- DECISION-GRADE factors (n≥150 per tertile): b67_4 +5.19pp, b68_2 +4.14pp, b68_3 +4.11pp, b68_4 **+0.57pp (degraded from +2.94pp pre-B76)**, b68_5 **-7.79pp (regression from -1.78pp pre-B76; NEGATIVE predictive lift, factor is HURTING)**.
- ACCUMULATING: b67_2 +100pp at n=4 (low), b68_1 +7.73pp at n=388 (almost decision-grade).
- Action item per MEMORY locked thresholds: **if any flip post-B76/B78 → revert.** b68_5 went 4× more negative; b68_4 dropped 80%. Both warrant investigation before next chain modification. NOT actionable tonight (deferred to post-Sunday-reopen window when calibration windows refresh).

**Exit-ablation snapshot 2026-05-09 21:20 UTC:** B73 framework reports total trades 1248 / 14935 variant rows. Variant F (no_BE_stop) Sharpe 3.07 mean P&L +1.172% — confirmed PRODUCTION winner per B79.TEC ship 2026-05-08. Variant A (current_BE_stop_baseline) Sharpe null because it IS the baseline reference; meanPnlPct +1.046%. Production trades since 2026-05-08 11:24 UTC running variant F: closed-trade exit-reason distribution confirms (2026-05-09 = 66 target_hit + 49 stop_hit + 9 trailing_stop_hit + 2 break_even_stop; vs pre-removal 2026-05-02 to 2026-05-07 = 731 BE_stop dominant).

**176 open trades at session-time:** 173 crypto_spot + 3 xstock_spot. Top 96 trades open 17h+, peak 22-23h. Concentration in `strong_bull_trend` + `TREND_FRIENDLY_STABLE`. **By design** post-BE-removal — without BE-protect, trades track original SL→TP only; slow-moving TFS-regime pairs neither hit target nor stop within typical hold windows. Pre-B79.TEC mean duration 152min; post-B79.TEC longer holds expected. Not a bug.

---

## NO-TOUCH FENCE on crypto_spot through 2026-05-15

Step-0 pre-flight + post-deploy SQL on every batch (column is `evaluated_at`, not `captured_at`):

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
