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

### 🟢 IN-FLIGHT: SCORING (#8) + TEC (#9) — Step 2 pre-audits dispatched (HEAD a9c08f1d3)

**Step 1 → ACK with revisions received and integrated (both batches).** Verbatim relays posted to Telegram chunks 4206-4213. Plain-language summary posted (chunk 4214).

**Step 2 pre-audits drafted + committed + dispatched** (HEAD `a9c08f1d3`):
- SCORING pre-audit: `/home/langston/inbox/b79-0n-scoring/PRE_AUDIT_v1.md` (in-repo at `Claude Comms and Packages/Scope Files/`)
- TEC pre-audit: `/home/langston/inbox/b79-0n-tec/PRE_AUDIT_v1.md`

**🟡 NEXT BATCH: B79.0n.TELEMETRY (#10) per Kyle directive 2026-05-26 morning**

Kyle awoke + approved starting TELEMETRY (#10) in parallel with the SCORING/TEC verify-gate clock. Required scope-process inputs (must be done in Step 1.a):
1. **Navigate to staging trading page via Claude-in-Chrome** to inspect existing telemetry tabs — Kyle warns there is substantial telemetry already wired in across many phases. DO NOT reinvent the map. Catalog what's there before scoping new work.
2. Consult `1-system-manual/SYSTEM_IMPACT_MAP.md` for Telemetry Aggregator + downstream consumers (RTB Adaptive Ratio Manager + ML Calibration).
3. Consult `1-system-manual/SYSTEM_MANUAL.md` for telemetry architecture (chapters on telemetry / VTS telemetry / regime performance / etc.).
4. Once scope agreed + Langston Step 1 ACK, autonomously complete the sub-batch through full 11-step workflow.

**Per umbrella v4 row #10:** "Telemetry Aggregator per-asset-class buckets. Promoted from Tier 2 per Langston item 9 — RTB's Adaptive Ratio Manager consumes telemetry, so RTB depends on TELEMETRY. Hard-pinned to ship before WIRE-IN." Dependencies: STORAGE (closed). Downstream blocked: RTB (#11), RTB-REFRESH (#12), ML-CALIBRATION (#17), WIRE-IN (#16).

**Verify-gate alerts scheduled (Kyle directive — surface alerts properly so CC + Langston see them):**
- +24h: 2026-05-27T02:47:00Z — title "B79.0n.SCORING + B79.0n.TEC +24h verify-gate snapshot" (state=scheduled, category=soak_verification, severity=warning)
- +48h: 2026-05-28T02:47:00Z — title "B79.0n.SCORING + B79.0n.TEC +48h verify-gate CLOSE" (state=scheduled, same metadata)

§10.5 alerts check protocol: every turn `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`. When state=active AND acknowledged_at=null AND triggers_at <= NOW(): surface IN RESPONSE to Kyle (not just verify the log read). ACK via `ssh root@188.245.193.8 "cd /home/deploy/dawntrader && npm run system-alerts -- ack <id> --by cc-session-2026-05-26"` after probe completes.

**Kyle's CRITICAL flag about SCORING.b:** the 48h static-mirror-fallback verify-gate is WEAK observability in current VTS-shadow mode because SQE_EVAL only fires when signal-orchestrator/RTB processes a non-null candidate (zero fires across 69 min post-deploy). Recommend: re-scope SCORING.b to BUNDLE into sub-batch 18 active-trading flip when SQE_EVAL actually fires + provides observable runtime evidence. TEC.b's counter is observable independently (refreshTECConfigForClass runs at boot + 60s TTL). Update RUNNING_ISSUES #142 accordingly at start of TELEMETRY scope work.

**🟢 B79.0n.SCORING + B79.0n.TEC FULLY CLOSED 2026-05-26 — both `.b` follow-ups queued**

**Final close commits:**
- `b458588e5` Step 11 completion reports (TEC + SCORING)
- `33bcb5e99` Step 10 governance — ALL 8 Tier 1+2 docs ACTUALLY edited

**Deploy chain (final):**
- `ceeaa15c6` — Step 6 initial deploy (TEC + SCORING migrations + Step 3 code)
- `29bfda74f` — R-5 hotfix-deploy (SQE_EVAL log line gets `assetClass=` + threshold tags)

**Langston Step 1 + 2 + 4 + 8 ALL ACK FINAL** (chunked relays 4206-4231 to Telegram topic 21).

**Both .b follow-ups queued (RUNNING_ISSUES #141 + #142):**
- B79.0n.TEC.b: strict 11-key HARD-FAIL restoration via `requireKey<T>` (7-day SLA after 48h verify-gate close)
- B79.0n.SCORING.b: EXISTS-gated wildcard retirement + F-1 resolver hooks for SCORE_WEIGHTS + RANKING_WEIGHTS (after 48h verify-gate close)

**48h verify-gate clock: started 2026-05-26 02:47 UTC** (R-5 pull restart at 03:56 UTC reset PM2 uptime but counters preserved). Counter probes so far:
- +1h: 0 PICK_FALLBACK / 0 SQE_STATIC_MIRROR ✓
- +69min: 0 fires, 0 SQE_EVAL runtime (dormant — Langston schema-parity ACK with deferred runtime evidence)
- Next: +24h (2026-05-27 02:47 UTC) + +48h (2026-05-28 02:47 UTC)

**Active-trading impact today:** ZERO. paper_sim_trades + trades both empty. R-5 runtime evidence deferred to active-trading flip at umbrella v4 sub-batch 18 (or regime shift producing non-null candidates earlier).

**Remaining umbrella v4 work (8 sub-batches):**
- 10-17: per-class sub-batches (TBD per umbrella structure)
- 18: xStock active-trading flip (the umbrella close — depends on all prior sub-batches being in steady state)

**🟢 Original directive: SCORING + TEC parallel-eligible per umbrella v4 row 8/9 — COMPLETED per Kyle 2026-05-25 evening overnight directive.**

**Step 4 ACK received from Langston** (chunks 4221-4223 relayed): ACK both batches, Option A on TEC, SCORING F-1 hooks rolled into B79.0n.SCORING.b. 3 conditions: B79.0n.TEC.b SLA within 7d of verify-gate close; Step 7/8 must snapshot getTECPickFallbackStats() pre-deploy/+1h/+24h/+48h; C-1 perp-activation pre-flight in RUNNING_ISSUES Step 10.

**Step 6 deploy at 2026-05-26 ~02:47 UTC** — all 3 migrations applied cleanly:
- 2026-05-26-b79-0n-tec-perclass-seed.sql ✓
- 2026-05-26-b79-0n-tec-wildcard-retire.sql ✓
- 2026-05-26-b79-0n-scoring-perclass-seed.sql ✓

**Post-deploy state verified:**
- TEC: 44 rows total = 11 keys × 4 active classes; 0 wildcard rows (Migration 2 EXISTS-gate worked) ✓
- SCORING: +8 rows (4 perp + 4 crypto_spot numeric); B79.0n.SCORING stamped=8 ✓
- B79.0n.TEC stamped=32 (the 8 A.2 idempotent backfill rows for spot classes skipped because rows already present on staging — assertion counts ALL per-class rows so passed at 44) ✓
- HTTP 200 (142ms) ✓
- PM2 online (pid 1663995, restart 321) ✓

**Pre-deploy baseline (C-2 anchor for completion report):**
- VTS open: 74 / closed: 70 (last 24h: 144 opened / 102 closed)
- TEC pre-rows: crypto_perp=1 / crypto_spot=5 / xstock_perp=1 / xstock_spot=5
- SQE pre-rows: wildcard=2 / crypto_spot=2 / xstock_spot=6

**Step 7 first-pass verification PASS:**
- TEC_STALE_FAIL_CLOSED errors (pre-deploy issue ~02:35-02:44 UTC) STOPPED post-restart ✓
- 0 PICK_FALLBACK fires (counter clean — verify-gate clock starts) ✓
- 0 SQE_STATIC_MIRROR_FALLBACK fires ✓
- FX5Scanner running normally (evaluated=343, eligible=52 at 02:47:15Z) ✓
- B74 batch writers + ticker writers operating ✓
- ⚠️ SQE_EVAL log pattern not yet observed (warmup; signals haven't passed SQE post-restart)

**48h verify-gate clock started 02:47 UTC. Next snapshots:**
- +1h: 2026-05-26 03:47 UTC
- +24h: 2026-05-27 02:47 UTC
- +48h: 2026-05-28 02:47 UTC

**Next steps (Step 7 deep verification + Step 8 dispatch):**
1. +1h: probe getTECPickFallbackStats() + getSQEStaticMirrorFallbackStats() via PM2 logs or direct node script
2. R-5 SQE_EVAL log-tail confirming `assetClass=` tag presence after warmup
3. Dispatch Step 8 Langston second-pass verification
4. Step 10 governance (ALL 8 docs ACTUALLY edited per Kyle PATTERN-DETECT directive)
5. Step 11 completion reports (TEC + SCORING separate) including R-4 no-touch-fence sentence + Phase 24 onboarding learnings + C-1 RUNNING_ISSUES entry + C-2 baseline numbers cite
6. 3-way MEMORY sync at close

After SCORING + TEC close + 8 remaining sub-batches (10-18), umbrella closes with active-trading flip for xStocks.

CI failure cascade (each commit cancelled prior in-flight):
- TEC initial (2f7d66fed) → MANIFEST drift (SCORING line included but file not in commit)
- Hotfix 1 (a26d19348) → CI runs but Test Suite fails: 11-key HARD-FAIL throws because CI's initial-schema only has break_even_enabled rows
- Migration hotfix (e7aa96c7a) → idempotent A.2 block backfilling crypto_spot + xstock_spot hot keys; migrations APPLY successfully but tests STILL fail because they mock db.js with their own seed fixtures
- Hotfix 2 (69f3aea66) → softened strict-HARD-FAIL `requireKey<T>` back to observable `pick(key, TEC_DEFAULTS.x)` with per-key `[B79.0n.TEC][PICK_FALLBACK]` counter + WARN log; preserved `hasExplicitAssetClassRow` HARD-FAIL on `break_even_enabled` only

**Tradeoff:** strict 11-key HARD-FAIL deferred to B79.0n.TEC.b (mirror of SCORING two-step). Migration 1 still seeds all 11 keys × 4 classes; Migration 2 retires wildcards. Production steady-state: per-class rows only. Counter `getTECPickFallbackStats()` provides 48h verify-gate evidence.

**Langston Step 4 review will likely flag this partial retreat** from his Step 2 ACK ("all 11 keys via ALL_TEC_KEYS SSOT"). Iterate from his feedback. The right discipline is to eventually update all 7 TEC test fixtures + restore strict HARD-FAIL in B79.0n.TEC.b.

- TEC pushed at `2f7d66fed` (Step 3 implementation) → CI FAILED on MANIFEST drift (SCORING line included but file not in commit) → hotfix `a26d19348` pushed (removed dangling SCORING manifest line) → CI re-running
- SCORING pushed at `a177508f2` (Step 3 part 1: predictive-confidence per-class + Migration 1 + static-mirror counter) → CI in_progress

**Step 3 part 1 deliverables landed:**

TEC (a26d19348):
- Migration 1 (32 rows) + Migration 2 (EXISTS-gated retire) in same deploy
- trailing-exit-controller.ts: HARD-FAIL coverage 1 → 11 keys; ALL_TEC_KEYS SSOT; requireKey<T> helper eliminates pick→DEFAULTS silent fallback; TEC_DEFAULTS demoted to type-template-only
- trailing-exit-controller.ts:107 comment block updated with full chronology (kyle-directive-2026-05-21-disable-xstock-be)
- tec-evaluator.ts: resolveTECConstants now sync (per-class cache); evaluator caller dropped await; getModuleConstants import removed

SCORING (a177508f2):
- Migration 1 (8 rows): crypto_perp + xstock_perp coverage for min_final_score + min_regime_weight; crypto_spot promotion for adx_min/di_min_quant/di_min_pattern/momentum_min
- score-calculator.ts: getPredictiveConfidence(assetClass, symbol, regime, strategy) — F-2 cache-key isolation
- signal_quality_evaluator.ts: OBJ-4 static-mirror fallback counter + getSQEStaticMirrorFallbackStats() accessor
- 3 callers threaded: signal_quality_evaluator.ts:264, vts-runner.ts:1117, xstock_spot/eval-cycle.ts:577

**D-3 confirmed at Step 3 first move:** crypto_spot/pattern-pool-filters.ts EXISTS with same DB-getter pattern (line 43). No D-3 code work needed.

**Deferred to follow-up (NOT blocking):**
- F-1 resolver hooks for SCORE_WEIGHTS + RANKING_WEIGHTS (D-1/D-2) — Day-1 no-op
- /api/diagnostics/sqe-fallback-counter route (accessor function exists; route plumbing for Step 7)
- TEC test files (`b79-0n-tec-*.test.ts` × 4 per pre-audit §4)
- SCORING test files (`b79-0n-scoring-*.test.ts` × 5 per pre-audit §4)
- Old: pre-audit §6 details for the original SCORING Step 1 dispatch ACKs.

- TEC ACK (b9p9ax5q4): APPROVED with R-1 + R-2 required revisions, N-1..N-4 inline notes. Telegram chunks 4215+4216.
- SCORING ACK (bteg6y80m retry-2): APPROVED with 5 non-blocking clarifications + R-2 deploy-window revision (post-20:00 UTC weekdays DST, NOT 18:00). Telegram chunks 4217+4218.

**R-2 deploy-window revision (SCORING):** post-20:00 UTC weekdays (DST) or post-21:00 UTC (standard time) or weekend. Pre-audit §6 said "18:00-23:00" which is mid-NYSE-session in DST — needs fixing before Step 6.

**SCORING Step 3 clarifications to fold inline during chunks:**
1. `boot_orchestrator.ts:95` + `system-guards.ts:170` SCORE_WEIGHTS consumers — add one-line disposition (stay static const = observability-only) in chunk 6
2. signal-orchestrator + vts-runner footnote in chunk 6 (direct consumer vs assetClass threader)
3. Enumerate getPredictiveConfidence ready_to_buy_service callers (line numbers) in chunk 4
4. Rename §4.3 label to drop D-5 cross-reference
5. Confirm SQE_EVAL log line has `assetClass=` tag before relying on Step 7 probe
6. Step 3 first move: `ls server/asset_classes/crypto_spot/pattern-pool-filters.ts` to confirm equivalent file exists

**🟢 R-1 RESOLVED — xstock_spot.break_even_enabled root-cause:**
DB row: `updated_by = 'kyle-directive-2026-05-21-disable-xstock-be'` on **2026-05-21 16:26:00 UTC**.
→ Hypothesis 2 CONFIRMED: Kyle intentionally reverted on 2026-05-21 after the 2026-05-11 B79.0m.b enable migration had successfully set it to true.
→ Step 3 chunk 5 comment text MUST cite this exact chronology, NOT Hypothesis 1's "migration never applied" framing.

**Step 3 chunk 5 comment text (locked):**
```
// xstock_spot → break_even_enabled = false (CURRENT LIVE STATE per 'kyle-directive-2026-05-21-disable-xstock-be')
//
// Chronology:
//   - 2026-05-08 B79.TEC: seeded false for all 4 active classes
//   - 2026-05-11 B79.0m.b: UPDATE xstock_spot → true (BE-protect for xstocks enabled)
//   - 2026-05-13: documented enable-state in this code-comment block
//   - 2026-05-21 Kyle directive: reverted to false (disable-xstock-be)
//
// Respect current live state. Operator-flip via DB UPDATE when ready to re-enable.
```

**N-2 follow-up:** §4.16 onboarding entry must note "EXISTS-gate IN-clause hardcodes active-class list; future-proof via getActiveAssetClasses() SSOT requires server-side pg_temp function or node-driven migration wrapper — non-trivial in pure SQL."

**N-3 cross-batch dependency flag:** SCORING calibration window will see ZERO moonbag-mode VTS outcome telemetry per F-1. If any SCORING work needs moonbag-mode outcome signals, that's a conflict — flagged in TEC ACK for cross-check.

**SCORING Step 1 Langston dispositions:**
- D-1 SCORE_WEIGHTS = F-1 with resolver hook
- D-2 RANKING_WEIGHTS = F-1 same hook
- D-3 PATTERN_POOL_GUARDRAILS = F-2 structurally (CONFIRMED: xstock_spot/pattern-pool-filters.ts EXISTS with DB-getter — already done)
- D-4 crypto_spot numeric promotion = code defaults verbatim
- D-5 = **TWO-STEP** (Langston pushed back hard) — SCORING + SCORING.b after 48h verify-gate

**TEC Step 1 Langston dispositions + CRITICAL FINDING:**
- 🟢 **F-1: moonbag_qualifying_strategies = `[]` is INTENTIONAL** — `updated_by = 'kyle-2026-05-05-disable-trailing-after-target'` on 2026-05-05 12:19 UTC. Variant-K alignment per B75 winner. NOT a drift. Last-7d staging logs confirm zero `[9.2][MODE] → TRAILING_TAKE` events. Langston Caveat 1 hypothesis empirically right, disposition revised.
- 🟢 **F-2: VTS DOES route through tec-evaluator** (vts-runner.ts:43 + 2218). Initial bypass hypothesis refuted.
- 🟢 **F-3: zero active-trading impact** — paper_sim_trades + trades both EMPTY. Active trading hasn't fired any positions.
- D-1: REVISE (no auto-default to Option B; root-cause first). Recommendation: Option B (comment update) with chronology cite — most likely Hypothesis 1 (B79.0m.b migration tagged "PARTIAL" in commit 3b84dc756 may not have applied).
- D-2: F-2 structurally (per-class rows) but Day-1 values ALL `[]` matching variant K
- D-3: ACK consolidate
- D-4: Single batch CONFIRMED (clean grep — zero direct-wildcard consumers)
- C-1: no perp activation near-term; governance note only
- C-2: Pre-deploy baseline snapshot SQL in pre-audit §6
- C-3: Confirmed via D-4 grep

**Next steps (after Step 2 ACKs arrive):**
1. Verbatim relay both ACKs to Telegram (chunked ≤3500 chars per chunk; no Markdown parse to avoid 400 errors)
2. Plain-language Kyle summary
3. Begin Step 3 implementation for BOTH batches in parallel (sequence chunks per pre-audit §6 / §5)
4. Update MEMORY at each Step 3 chunk close

**Pre-audit findings summary for re-spawn after compaction:**

For SCORING:
- Migration 1 spec ready in pre-audit §5.1 (8 new rows: 4 perp + 4 crypto_spot numeric)
- Code chunks 1-9 sequenced in pre-audit §6
- Deploy outside NYSE 13:30 UTC (R-2)
- Step 7 probe: signal-orchestrator log tail confirming per-class threshold-values (R-5)
- §4.15 onboarding entry: promote-then-retire two-step pattern

For TEC:
- Migration 1 spec ready in pre-audit §5.1 (32 new rows: 8 perp hot-keys + 24 moonbag/persistence)
- Migration 2 spec ready (single-batch confirmed): EXISTS-gated DELETE for all 11 TEC keys
- Code chunks 1-7 in pre-audit §6
- D-1 comment update with chronology cite (Kyle 2026-05-05 directive)
- §4.16 onboarding entry: all-keys HARD-FAIL coverage pattern

After SCORING + TEC close + remaining 8 sub-batches (10-18), umbrella closes with active-trading flip for xStocks.

---


## REQUIRED PRE-READS (next session if compacted)
1. `DawnTraderV3/CLAUDE.md` (§1 ONE-paragraph + ALWAYS-POST-IN-CLAUDE-DESKTOP-TOO + §2 Step 1.a + §3.3 + §5 #15-19 + §6.5.0.a + §10.5 + §7.1 mirror)
2. This file
3. `Claude Comms and Packages/Batch Completion/B79_0n_CONFIDENCE_CHAIN_COMPLETION_REPORT.md` — closed-batch reference (this just closed)
4. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` — row 8 = SCORING summary, row 9 = TEC summary (next sub-batches, parallel-eligible)
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` — recent additions surfaced this batch (B79.0n.CONFIDENCE-CHAIN section)
6. `1-system-manual/RUNNING_ISSUES.md` — #140 NEW (deploy-runbook) + #138 (Tuesday RTH watch) + #136 register
