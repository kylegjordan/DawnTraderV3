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

## CURRENT STATE — 2026-05-07 evening (B79 Phase 24 SHIPPED dormant scaffold)

- **Branch:** `migration/aws-supabase` (pushed to GitHub)
- **Remote HEAD:** `871038509` (B79 Step 4 prep + completion report draft). Build chain: `d7ca57340` (PIA + workflow doc + 4 migrations) → `a991f40a4` (MEMORY mirror) → `260cc8cc5` (Step 3 implementation 5+11 files +1759/-84) → `871038509` (Step 4 prep).
- **Live:** B70 + B72 + B75 + B76 + B77 + B78 + B78.1 + B78.2 + **B79 dormant scaffold (PM2 #184 deployed 21:49 UTC).**
- **Watchdog:** `/usr/local/bin/langston-call`. **Tuning:** `--first-byte-timeout 240` for substantive reviews. B79 saw 1 hang + 1 success retry (PIA) and 1 hang + 1 success retry (Step 4).
- **B79 status:** Steps 1-7 CLOSED. Step 8 sign-off pinged via Telegram (Langston said "ping me on green" in Step 4). Step 10 governance complete. Step 11 completion report drafted + plain-language summary delivered.
- **No-touch fence:** absolute. Post-deploy SQL on crypto_spot regime_factor_alternates returns 12 emissions/factor/hr (within ±10% of pre-deploy 9/factor/hr post-restart-window-fill).

### B79 Phase 24 deliverables (commits d7ca57340 + a991f40a4 + 260cc8cc5 + 871038509)
- `Claude Comms and Packages/Scope Files/BATCH_79_PRE_AUDIT.md` — PIA per CLAUDE.md §2 Step 2; 3 telemetry partitioning hard blockers identified, resolution = two-instance pattern (separate aggregator + ratio-manager + failure-tracker per asset class)
- `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — NEW Tier-2 governance, full template + xstock_spot worked example
- `drizzle/migrations/2026-05-07-b79-screener-filters-asset-class.sql` (+ rollback) — adds asset_class + tunable_status columns to screener_filters; seeds xstock_spot row with NO max_price cap
- `drizzle/migrations/2026-05-07-b79-xstock-module-constants.sql` (+ rollback) — macro_modifier=1.0 (B79.3 deferred), orb_enabled=false (Q-D-gated), pattern-pool guardrails inherit-from-crypto

### B78/B78.1/B78.2 quick reference (all shipped 2026-05-07)
B78=modularization scaffold. B78.1=cycle break. B78.2=Kraken WS v1→v2 ping fix. Forward-watch #74 at T+24h tomorrow.

---

## SEQUENCING — B78–B81 stretch (8 days, until 2026-05-15)

| Batch | Status | Description |
|---|---|---|
| **B78** | **SHIPPED 2026-05-07** | Modularization scaffolding. Critical path. |
| **B79** | NEXT | xstock_spot (Kraken XStocks): VTS + active-path wire-in (dormant). 24/5 weekend-pause. 3-layer threshold derivation. Days 4-5. |
| **B80** | After B79 | crypto_perp (Kraken Futures): VTS + active-path wire-in. Funding-rate per-pair extension to macro modifier. Days 5-6. |
| **B81** | After B80 | RTB ranking parity (`expectedNetReturnR` primitive, pool-relative normalization) + SQE asset-class thresholds. Days 6-7. Removes B78 re-export shims (RUNNING_ISSUES #73). |

**Active-trading wire-in IS in scope** for B79-B81 (codepath end-to-end). Live-trading testing of new asset classes is Phase 19.

**Hard fence:** no-touch on crypto_spot through 2026-05-15. Step-0 pre-flight + post-deploy SQL on every batch (column is `evaluated_at`, not `captured_at`):

```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```

If cadence drops post-deploy → halt and revert.

---

## OPERATIONAL FACTS (verified 2026-05-07)

- **Kraken XStocks Pro** = equity exchange. Tokenized 1:1 backed equities. **Fractional buying $1 minimum** → same `$1000 base → ~$150/trade` sizing as crypto. **24/5 trading** (closed weekends — VTS needs weekend-pause gate). Solana-settled (affects Phase 19 active-path custody, NOT VTS).
- **Kraken Futures** = perp exchange. REST endpoint `https://futures.kraken.com/api/charts/v1/trade/<sym>/1m` (B74). 24/7 trading. Funding rate is per-pair signal (NEW input to crypto_perp's macro modifier in B80).
- Both feeds **already scanning + archiving** in production (B69 + B74).
- **B74 file note:** Kraken Futures work lives at `server/services/passive-archive/equity-perp-archiver.ts` — not a `kraken-futures-*` file. Plan/scope misattribution corrected in B78 governance.

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

## Recent batch history

| Batch | Date | Note |
|---|---|---|
| B70 + B72 | 2026-05-04→06 | Unified archive + 18/18 strategies DB-tunable |
| B75 | 2026-05-06 | Hot/warm/cold tiered storage |
| B76 | 2026-05-06 | Chain-final calibration framework. RUNNING_ISSUES #54 RESOLVED |
| B77 | 2026-05-07 | `isBreakEvenTriggered` no-op fix. RUNNING_ISSUES #71 RESOLVED |
| B78 | 2026-05-07 | Modularization scaffold. Asset_class + exchange extraction. |
| **B79 (Phase 24)** | **2026-05-07 evening** | **xstock_spot dormant scaffold + ASSET_CLASS_ONBOARDING_WORKFLOW.md. PM2 #184. Live wire-in B79.0a.** |

---

## Open RUNNING_ISSUES

- OPEN: #39 (CI TS legacy), #43/#49/#50/#53 (4 calibration windows), #46 (passive archive index), #55 (B69.x/B73.3 verification), #73 (B78 shim cleanup B81), #74 (B78 24-48h cadence forward-watch), **#77 (B79.0a tracker — live xstock scanner via centralClock + ARM injection + Q-D probe + N1-N4)**, **#78 (B79 24-48h cadence forward-watch)**, **#79 (B79.TEC tracker — per-asset-class TEC config + cold-start warmup via primeTECConfig + cache by AssetClass + zombies LEFT AS-IS. SEQUENCING LOCKED 2026-05-08 07:44 UTC: B79.TEC FIRST, before B79.0a, per Langston design call — routing xstock through hardcoded-crypto path even briefly is architecturally wrong + contaminates B79.4 ablation baseline)**, **#80 (B79.4 tracker — extend B73 exit-strategy ablation to xstock_spot, parallel not replacement. Langston flags: aggregator key needs schema lift `(regime,strategy)→(regime,strategy,asset_class)` — non-trivial; xstock panel operational from t=0 with sparse data, empty windows expected not bugs)**, **#81 (backpressure policy revised — vertical-scale only, never asset-class shedding; first execution B79.0a load test)**
- DEFERRED: #12e, #40, #44, #45, #52
- RESOLVED 2026-05-06/07: #54 (B76), #55, #56–#69, #70/#71/#72

---

## Next session pickup priority — B79 STEP 3 (post-2026-05-07-night session)

**B79 Step 1+2 CLOSED as of commit d7ca57340 (LOCAL ONLY, not pushed). Phase 24 NEW. Step 3 picks up from here.**

### CONSENSUS POSITIONS LOCKED (do not relitigate)
- Telemetry partitioning resolution = **two-instance pattern** (Langston rev 7 + PIA round 2 GREENLIT). Separate AdaptiveScanManager + TelemetryAggregator + AdaptiveRatioManager + PairFailureTracker per asset class. NOT param-plumbing. Rationale: silent-corruption failure-mode resistance.
- Subagent's 10 uncommitted files vs rev 7: **RIP universe-merge in market-scanner.ts** (Langston rev 7); reconcile other 9.
- Pattern path 3 strategies Day 1: `inside_bar_reversal`, `morning_star`, `pivot_shift`. Q3 regime-compatibility documented in PIA round-2 reply.
- ORB Q-D-gated via `module_constants.strategy_gates.xstock_spot.orb.enabled = false` (DB-tunable, no redeploy).
- TEC stop-freeze placement = top of `evaluateStop()`.
- Pre-deploy load test = replay 1.3× historical scan cycles (NOT stress-shim).
- Static-state hazard: TelemetryAggregator disk-persist path module-scoped (line 1600-1602). Xstock instance runs IN-MEMORY ONLY Day 1 (no disk persist) to sidestep clash. Promote persistence in B79.x if needed.
- Schema audit: 5 of 6 critical tables already have asset_class column; only screener_filters needed migration (committed in d7ca57340).
- xstock_spot screener_filters row defaults: NO max_price cap, universe_size=50, confidence_threshold=70 tunable_status='pending_layer_3'.

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
