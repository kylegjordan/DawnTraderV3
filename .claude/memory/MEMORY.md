# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + ONE-paragraph default per Kyle 2026-05-24; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt fix + #19 CI per-batch confirmation; §6.5.0.a embedded-diff + no-gdrive dispatch pattern; §10.5 alerts; §7.1 mirror).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll (Kyle directive 2026-05-24 — every 5 min when idle):** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`. Kyle may post directives in topic 21 group chat during the day.
5. Kyle in Claude Desktop OR Telegram group chat. Telegram = Langston verbatim relay + Kyle visibility. Summaries TO KYLE: **ONE-PARAGRAPH on Telegram** per stage (Kyle directive 2026-05-24).
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-25 — B79.0n.CONFIDENCE-CHAIN FULLY CLOSED; Next: SCORING #8 or TEC #9 parallel-eligible)

### B79.0n.CONFIDENCE-CHAIN — 🟢 FULLY CLOSED 2026-05-25

Deploy commit `b6e45a8` (PM2 #319 at 18:00Z; CI all-4-green at run `26413160763` for `3efb745` + post-`b6e45a8` deploy green). Sub-batch 7 of 18 in B79.0n umbrella v4 arc — **parallel-eligible with SCORING (#8) + TEC (#9)**. Migration `2026-05-25-b79-0n-confidence-chain-per-class-seed.sql` applied cleanly.

**Highlights:**
- Confidence-modulator chain per-class plumbing across 9 modulator modules. 7 modulator surface APIs gain REQUIRED `assetClass: AssetClass`; 7 `FactorAlternateInput` discriminated-union arms extended; MCE `refreshMacroConfig`/`refreshPairCorrelationConfig`/`refreshPhaseConfig` refactored to per-class enumeration with **atomic Map-replace pattern** (R-11 mitigation); 16 chain-composition push sites threaded with `safeResolveAssetClass` capture-and-reuse.
- Per-class disposition decisions D-1 through D-5 (Langston Step 1 ACK ✅ AGREE all 5): macro xstock NO-OP via `assetClassNoOpActive`; pair-correlation `SPY/USD` reference (DB-confirmed) + `computeCorrelationEnabled=false` v1 default; phase-preference per-class JSONB blob (27 cells); outcome-feedback legacy-as-crypto disk-load re-key; canonical ASSET_CLASSES enumeration + fail-hard on missing-class.
- Outcome-feedback store key shape `<assetClass>_<regime>_<strategy>` + persistent path move `/tmp/` → `/home/deploy/dawntrader/data/` (R-9 mitigation). HARD-FAIL on corrupt new-path. Same path move for regime-phase-store.
- R-10 mitigation: paper-execution + vts-service close-hooks resolve assetClass via `safeResolveAssetClass + skip-on-null` before `outcomeFeedbackStore.updateEma`.
- 2 hotfixes during deploy: `da92a79` MANIFEST.txt drift; `b6e45a8` esbuild dynamic-require (inline `require('path')` → top-of-file `import * as path from 'path'`).
- Local tsc baseline 494 unchanged across 7 chunks. 26 NEW tests + 94 existing test updates pass.
- Anti-graveyard: 12 `@ts-expect-error` confined to dedicated type-lock harness; zero new `as any`/`@ts-ignore`/`!` in modulator production files.

**Verification (Steps 7+8 GREEN):** 18 DB rows (9 modules × 2 classes); MCE `[B67.1][modifier] crypto_spot value=1.0500 ... per_class_count=2` at 18:00:36 UTC; 10 crypto ablation factors emitting at 18:06-18:07 UTC. Langston Step 1+2+4+8 all FINAL ACK.

**Step 4 focus-area-3 clarification closed:** upstream regime classifier uses STRICT `resolveAssetClass` — null-skip branch in signal-orchestrator is structurally unreachable defense-in-depth + WARN.

**Watch-items:**
- **Tuesday 2026-05-26 13:30 UTC ARCA reopen** — first observable xStock signal evaluation will confirm `metadata.asset_class_no_op_active=true` + `metadata.compute_disabled=true` flag stamping. Memorial Day holiday today 2026-05-25 paused live xstock signal cadence.
- **RUNNING_ISSUES #140 NEW** — deploy procedure refinement (apply migration BEFORE pm2 restart for batches that add new required constants — eliminates 2-6 minute fail-hard WARN window). Tier 3 polish.

**Governance ACTUALLY edited this batch** (per Kyle directive from PATTERN-DETECT close): ✅ BATCH_CATALOG / PHASE_HISTORY / SIM / SYSTEM_MANUAL / ASSET_CLASS_ONBOARDING_WORKFLOW Step 4.14 / MULTI_ASSET_VTS_EXPANSION_PLAN / CHANGES_AND_FIXES / RUNNING_ISSUES. CLAUDE.md consolidation pass per Kyle directive 2026-05-25 staged for follow-up commit with Langston review (separate small batch).

**Full report:** `Claude Comms and Packages/Batch Completion/B79_0n_CONFIDENCE_CHAIN_COMPLETION_REPORT.md`.

### 🟢 NEXT BATCH: SCORING (#8) OR TEC (#9) parallel-eligible

Kyle chooses ordering when next session starts. Both sub-batches were locked parallel-eligible per umbrella v4 row 8/9 and CONFIDENCE-CHAIN closure unblocks both. After SCORING + TEC + remaining 8 sub-batches (10-18), umbrella closes with active-trading flip for xStocks.

---


## REQUIRED PRE-READS (next session if compacted)
1. `DawnTraderV3/CLAUDE.md` (§1 ONE-paragraph + ALWAYS-POST-IN-CLAUDE-DESKTOP-TOO + §2 Step 1.a + §3.3 + §5 #15-19 + §6.5.0.a + §10.5 + §7.1 mirror)
2. This file
3. `Claude Comms and Packages/Batch Completion/B79_0n_CONFIDENCE_CHAIN_COMPLETION_REPORT.md` — closed-batch reference (this just closed)
4. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` — row 8 = SCORING summary, row 9 = TEC summary (next sub-batches, parallel-eligible)
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` — recent additions surfaced this batch (B79.0n.CONFIDENCE-CHAIN section)
6. `1-system-manual/RUNNING_ISSUES.md` — #140 NEW (deploy-runbook) + #138 (Tuesday RTH watch) + #136 register
