# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + **two-paragraph default**; §3.3 NEW Phase-24 learning-capture rule; §6.5.0.a embed-diff-inline; §6.5.0.b hung-instance; §6+§8 Langston comms; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston verbatim relay + visibility only. **Kyle directive 2026-05-20: summaries TO KYLE go in THIS session, not Telegram-only.** Langston-verbatim relays to Telegram are still mandatory per §6.5 step 3.
5. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-20 EOD — B79.0n UMBRELLA LOCKED; next is B79.0n.HYGIENE Step 1 scope)

**B-NEW-36 fully closed earlier today.** Locked sequence completed: B-NEW-34b ✅ → B-NEW-35 ✅ → B-NEW-36 ✅. Then started Phase 24's xStock active-trading wire-in arc.

**B79.0n umbrella locked at commit `6e9810171`** (Langston rev2 FINAL ACK 2026-05-20 PM). Original single-batch wire-in scope expanded by Kyle into a 17-sub-batch arc covering systemic asset-class awareness across the entire active-trading pipeline. v1 came back from Langston with 11 substantive items; v2 absorbed 11, counter-proposed on 3; Langston concurred on all 3.

**The umbrella file:** `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md`. **Read this first post-compaction.**

### 17 sub-batches locked sequence

Tier 1 (15 critical-path):
1. **HYGIENE** ← NEXT (setNullReason #121 + 5-symbol registry trim #120)
2. STORAGE (silent-fallback audit + SQE bug fix + REQUIRED-assetClass refactor)
3. MCE (regime + IMF + DBS + DI + cost-model.ts + indicators)
4. STRATEGY (detectors + `_SE_KEY` + Hybrid Integration + Strategy Sync + strategy-mapper.ts)
5. PATTERN-DETECT
6. CONFIDENCE-CHAIN (b67/b68 modulators)
7. SCORING (FinalScore + RankingScore + HybridScore + Net EV + Adaptive Goals + SQE thresholds + ranking-weights + normalization)
8. TEC (+ TCL + Structural Discontinuity + Exit Strategy Replay + #116 background timer)
9. TELEMETRY (promoted Tier 1 per Langston item 9 — must ship before WIRE-IN; RTB depends on it via ARM)
10. RTB (queue + ARM + TCL watchdog + cross-asset top-signal selection)
11. RTB-REFRESH (split per Kyle)
12. POOL (addSurvivors REQUIRED-assetClass + primary market-hours gate at admission)
13. ORCHESTRATOR (evaluateSymbol branching + ORB hook reachability + defense-in-depth market-hours check)
14. EXECUTION (paper-execution-engine + sizing + slippage-fee-model + risk-concentration + dynamic-slots + tick-size/lot-size + pre-audit enumeration of 4 executor layers)
15. WIRE-IN (xStock scanner mode-aware routing — vts vs paper_sim|live)

Tier 2 (2 learning/observability):
16. ML-CALIBRATION
17. OBSERVABILITY

### Per-batch standing rules (all in umbrella §2)
- Crypto regression-lock with per-metric thresholds: FX5 pool / signal gen / VTS rate ±5%/24h; active trade-open rate ±1-2 trades/day OR ±15% 7-day rolling.
- Crypto-by-construction NONE — every change ADDITIVE or TYPE-ENFORCED with explicit crypto callers passing `'crypto_spot'`.
- **Asset-class onboarding learning-capture section MANDATORY** in every completion report (CLAUDE.md §3.3 standing rule through end of Phase 24).
- Green light to fix obvious bugs found during audit if they'd otherwise hit Phase 19.
- CC + Langston have combine/split autonomy with documented reasoning.
- EXECUTION pre-audit MUST surface 4-executor-layer findings to Langston at Step 2 review BEFORE finalizing implementation scope.

### Three deferred follow-ups (post-umbrella)
- RUNNING_ISSUES #122 — cross-class portfolio P&L reconciliation (`fx-conversion-service.ts`)
- RUNNING_ISSUES #123 — external macro feed asset-class-agnostic (`external-macro-feed.ts`)
- RUNNING_ISSUES #117 — was original B79.0n trigger; now closes when this whole umbrella arc closes

### Phase 24 end-of-arc consolidation
After all 17 sub-batches close, a dedicated workflow consolidation batch reviews every completion report's "Asset-class onboarding workflow learnings" section + distills into finalized `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Target: 90-95% guesswork reduction for next asset class onboarding (perpetual futures next).

---

## NEXT IMMEDIATE STEP (post-compaction)

**Draft `B79_0n_HYGIENE_SCOPE.md` as the Step 1 scope for the first sub-batch.** Two minor items:
- `setNullReason is not defined` ReferenceError fix (RUNNING_ISSUES #121). Path: instrumented PM2 capture of full stack to identify missing-import file; add import; unit test. Helper IS defined at `server/utils/null-reason-tracker.ts:9-19`.
- 5-symbol Kraken-gap registry trim (RUNNING_ISSUES #120): retire BITF/HOLX/PARA/SAGE/WBA from `shared/asset-classes.ts:XSTOCK_SPOT_REGISTRY` + log to `KNOWN_NONEXISTENT_NAMES` per CLAUDE.md §5 #14.

Use the 9-section scope template defined in umbrella §3. Standard 11-step workflow follows.

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak verification, 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak verification, 2026-05-31. No action.
- `283bd74e` — B-NEW-36 first weekend_shutdown timer fire verification, Fri 2026-05-22 8:05 PM ET (Sat 2026-05-23 00:05 UTC). No action until then.

### Recent commits
- `6e9810171` — B79.0n umbrella v2 governance close (Langston rev2 FINAL ACK; today)
- `39b033738` — B-NEW-36 sub-batch (b) Step 10/11 governance close
- `4a997eae2` — B-NEW-36 sub-batch (b) implementation
- `4dfe1deb6` — B-NEW-36 (a)+(c) + B-NEW-35 Step 11 governance
- `f001002d9` — B-NEW-35 canonical deploy

### Permissions reminder
`.claude/settings.local.json` has `defaultMode: "bypassPermissions"` set at both top-level AND inside permissions block (addresses Claude Code v2.1.7+ regression where compound bash commands prompt even with allow rules). Should suppress 30-second prompts. Deny list still blocks `git push --force`, `git reset --hard`, `sudo`, `rm -rf /`.

---

## REQUIRED PRE-READS (FIRST 3 MINUTES OF NEXT SESSION)

1. `DawnTraderV3/CLAUDE.md` (esp. §1 + §3.3 NEW + §6.5 Langston comms + §10.5 alerts)
2. This file
3. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (umbrella v2 — full 17-batch arc spec)
4. `1-system-manual/RUNNING_ISSUES.md` #120, #121, #122, #123 (HYGIENE in-scope items + deferred follow-ups)

Then start drafting `B79_0n_HYGIENE_SCOPE.md`. Standing Langston dispatch pattern: file-first to `/home/langston/inbox/b79-0n/`, fresh UUID per dispatch, verification anchor quoting specific document content.
