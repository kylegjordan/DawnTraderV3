# B-NEW-42b Pre-Audit Review — Round 1

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-17
**Batch:** B-NEW-42b (price-discontinuity-detector + TEC integration)
**Scope:** `B_NEW_42B_SCOPE.md` rev2 (your ACK 2026-05-17)
**Pre-audit:** `/home/langston/inbox/b-new-42/B_NEW_42B_PRE_AUDIT.md`

---

## What's in the pre-audit

§1 — Authorization captured: Kyle granted go on B-NEW-42b implementation. CI red baseline accepted as pre-existing technical debt (investigation showed 10+ day failure history, TS-check non-blocking, NOT introduced by B-NEW-40 morning). Sequencing reconciliation carries forward from B-NEW-42.

§2 — SIM consultation per CLAUDE.md §9. 7 affected components (TEC, tec-evaluator, paper-execution-engine, vts-runner, data-freshness, module_constants, B79.0L market-hours gate) with upstream/downstream/shared-state/background-execution/blast-radius trace. Confirmed crypto path NONE by-construction.

§3 — **Design refinement flagged for your review** — detector-owned cache vs caller-side propagation. Scope rev2 §2.2.3 specifies caller-propagation; pre-audit reconsidered and prefers detector-owned cache (the detector maintains its own `Map<symbol, lastTick>` rather than receiving prev-tick context from callers). Outcome is structurally equivalent — detector knows the gap either way. Caller-side signature surface is unchanged. Rationale + cold-start handling + your rev1 #1 guardrail re-interpretation laid out.

§4 — Step 3 file plan with NEW files (detector module, test file, calendar JSON, migration SQL) and MODIFIED files (TEC integration, B-NEW-42 test assertion inversion, SIM, SYSTEM_MANUAL, CHANGES_AND_FIXES, POST_AUDIT_ROADMAP, BATCH_CATALOG, PHASE_HISTORY, ADJUSTMENT_FRAMEWORK, RUNNING_ISSUES, MEMORY files).

§5 — Risk register: 7 items including the refinement-rejection risk (Low — easy rollback to caller-propagation if you push back) and the pre-existing-failing-tests-mask-new-breakage risk (verify pass-count INCREASES, fail-count stays at 13).

§6 — Step 3 sub-step order: halt-detector → corp-action → ex-div → migration → crypto regression sweep → Step 4 dispatch.

## What I'm asking

Standard Step 2 review. 5 specific questions:

1. **Design refinement (detector-owned cache).** §3 — am I right that the outcome is equivalent to your scope §2.2.3 intent? Are there state-management concerns I'm missing (cache lifetime, memory growth, restart behavior) that I should resolve before Step 3? If you want me to revert to caller-propagation, say so explicitly.

2. **SIM coverage.** §2.1 — 7 components. Anything missing that has upstream-feeder / downstream-consumer / blast-radius relevance to the detector + integration?

3. **Sub-step ordering.** §6 — halt FIRST, corp-action SECOND, ex-div THIRD inside the same batch. Each independently shippable. Compatible with your scope §3 sequencing rule (no inter-step blocking)?

4. **Risk register completeness.** §5 — 7 items. Missing any?

5. **5min HARD_CEILING auto-clear timer mechanism.** Pre-audit §5 risk register notes "per-call one-shot setTimeout, not recurring schedule" (aligned with B-NEW-40 Central Clock audit). Is that the right pattern, or do you want a recurring single timer that the detector module manages internally?

## Format

Standard Step 2 review. Numbered responses + flagged adjustments. If clean, say so explicitly and I proceed to Step 3.

— CC
