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

## CURRENT STATE (2026-05-25 evening — B79.0n.CONFIDENCE-CHAIN FULLY CLOSED + CLAUDE.md consolidation shipped; Kyle directive: run SCORING #8 + TEC #9 IN PARALLEL overnight)

### 🟢 KYLE OVERNIGHT DIRECTIVE 2026-05-25 evening

Kyle going to bed; wants work to continue through the night. Move forward with **SCORING (#8) AND TEC (#9) IN PARALLEL** under the B79.0n umbrella (both parallel-eligible per umbrella v4 row 8/9). Iterate to consensus + verified, confirmed correct completion autonomously with Langston, full 11-step workflow per batch. **MANDATORY:** review SIM + System Manual during scope (Step 1.a discipline) AND again during the extremely-thorough code-level audit (Step 2 pre-audit — go deeper than Step 1 surface). **Update MEMORY after EVERY step** to ensure seamless continuation if compaction fires mid-workflow.

**Recommended sequencing for parallel run (CC's judgment unless overridden):**
- Step 1 scope drafts for BOTH SCORING + TEC in parallel (read SIM + System Manual for both surfaces simultaneously)
- Dispatch both scope files to Langston in parallel for Step 1 ACK
- Step 2 pre-audits for both in parallel (deeper SIM consultation per component)
- Implementation can interleave by chunk OR run each batch end-to-end depending on file-overlap analysis from pre-audit
- Push as SEPARATE batches with SEPARATE CI confirmations (per CLAUDE.md §5 #19) — do not bundle into a single commit
- Each gets its own Step 4 code review dispatch, Step 6 staging deploy, Steps 7-8 verification, Steps 10-11 governance + completion report

**Per-batch deliverables required (each of SCORING + TEC):**
- `B79_0n_SCORING_SCOPE.md` / `B79_0n_TEC_SCOPE.md` in `Claude Comms and Packages/Scope Files/`
- `B79_0n_SCORING_PRE_AUDIT.md` / `B79_0n_TEC_PRE_AUDIT.md`
- `B79_0n_SCORING_STEP3_CHANGE_LIST.md` / `B79_0n_TEC_STEP3_CHANGE_LIST.md` in `Claude Comms and Packages/Change Lists/`
- `B79_0n_SCORING_COMPLETION_REPORT.md` / `B79_0n_TEC_COMPLETION_REPORT.md` in `Claude Comms and Packages/Batch Completion/`
- All 8 Tier 1 + Tier 2 governance docs ACTUALLY edited (BATCH_CATALOG / PHASE_HISTORY / SIM / System Manual / ASSET_CLASS_ONBOARDING_WORKFLOW with §4.15+ / MULTI_ASSET_VTS_EXPANSION_PLAN / CHANGES_AND_FIXES / RUNNING_ISSUES) — Kyle directive from PATTERN-DETECT close: ACTUALLY-edited, not just listed-as-updated
- Per Phase 24 standing rule (CLAUDE.md §3.3): completion reports MUST include "Asset-class onboarding workflow learnings" 4-section block
- 3-way MEMORY sync at every close (truth + in-repo + Langston Helsinki via SSH+heredoc per CLAUDE.md §2 step 10.b)

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

**Follow-up commit `cb078223a` (2026-05-25 evening) — CLAUDE.md consolidation pass.** Kyle directive 2026-05-25 + Langston ACK "Ship it" clean. CLAUDE.md 731 → 519 lines (29% line / 37% byte reduction; ~8k tokens removed from per-session auto-load). New companion archive `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md` (268 lines, read-on-demand) holds 23 labeled sections of discipline-origin paragraphs + empirical-evidence narratives + reference-exemplar stories. CLAUDE.md uses `see history doc §X` pointers (~25 occurrences). Every load-bearing operational content preserved verbatim (JSON shapes, bash command snippets, mcp__Claude_in_Chrome__* tool invocations, alerts-check procedure).

### 🟢 NEXT BATCHES: SCORING (#8) + TEC (#9) — RUN IN PARALLEL per Kyle overnight directive

Both parallel-eligible per umbrella v4 row 8/9. After SCORING + TEC + remaining 8 sub-batches (10-18), umbrella closes with active-trading flip for xStocks.

**SCORING (#8) scope per umbrella v4:** signal-quality-evaluator (SQE) surface per-class. SQE composes the final signal score from regime confidence + DBS + multi-tf agreement + freshness + outcome-feedback + other factor inputs into the FinalScore that RTB consumes. Pre-audit verifies whether SQE composition logic differs per asset class — likely F-2 because xstock has different friction profile + different strategy enablement set.

**TEC (#9) scope per umbrella v4:** trailing-exit-controller surface per-class. TEC owns break-even latching, target-lock, trailing-stop, moonbag, weekend-suspended state transitions. Has per-class config already (B79.TEC seeded BE/target-lock/trail-distance per class earlier per Langston D-4 of B79.0m.b). Pre-audit verifies whether TEC's evaluator + close-hook + per-class config resolution is consistent + audits for any silent crypto-fallback in TEC internals.

---


## REQUIRED PRE-READS (next session if compacted)
1. `DawnTraderV3/CLAUDE.md` (§1 ONE-paragraph + ALWAYS-POST-IN-CLAUDE-DESKTOP-TOO + §2 Step 1.a + §3.3 + §5 #15-19 + §6.5.0.a + §10.5 + §7.1 mirror)
2. This file
3. `Claude Comms and Packages/Batch Completion/B79_0n_CONFIDENCE_CHAIN_COMPLETION_REPORT.md` — closed-batch reference (this just closed)
4. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` — row 8 = SCORING summary, row 9 = TEC summary (next sub-batches, parallel-eligible)
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` — recent additions surfaced this batch (B79.0n.CONFIDENCE-CHAIN section)
6. `1-system-manual/RUNNING_ISSUES.md` — #140 NEW (deploy-runbook) + #138 (Tuesday RTH watch) + #136 register
