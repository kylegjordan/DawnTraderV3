# B-ENTRY-CONSUMPTION-FRESHNESS — Step 10 governance reconciliation

**Date:** 2026-10-15

**Owner:** CC-C / ANALYST Codex

**Change class:** `sub_batch`

**Implementation/deployed ref:** `28c58fb8dc537242f7c1b320dd7e4d1f13af1b8a`

**Step-9 evidence ref:** `7978c0aad` · CI `38732995231` four of four jobs green

## Result

The document set now says the same thing as the deployed code: the exact depth-gate snapshot is carried through later awaits, its source age is advanced with process-monotonic elapsed time, and invalid or over-limit age fails closed immediately before an immediate `openOrder`. The first gate age and final consumption age remain separate; direct taker and maker-to-taker fills are covered, while resting-maker placement stays null because it consumes no book.

The limits remain 5,000 ms for `crypto_spot` and 15,000 ms for `xstock_spot`; the live database read returned those two rows under `fill_depth_gate.warmth_max_age_ms`. The registered relaxation proof was inconclusive, so no threshold changed. Step 7's bounded evidence window ended by its registered terminal condition; there is no later soak, calendar wait, or deployment hold for this sub-batch.

## Board readback

GitHub Projects item `PVTI_lAHODmulEM4BfQP4zhA6_WU` in project `PVT_kwHODmulEM4BfQP4` reads:

- Status: `Governance`
- Owner: `Analyst`
- Type: `Sub-batch`
- Blocked on: `Nothing`
- Phase: `Phase 19`
- Review: `Approved`

## Reviewer memory budget

`langston-size-watch --status` measured 844,222 total bytes before the write and 843,666 after it, a 556-byte decrease. `/home/langston/MEMORY.md` fell from 751,615 to 751,059 bytes; the ledger and retraction counts remained 132 and 111. The update replaced one closed-batch mechanics paragraph with the durable consumption-freshness invariant. The inherited size breach remains owned outside this batch; this write did not increase it.

## Governance ledger

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | Added the Step-10 entry, plain-language behavior, unchanged thresholds, and the narrow umbrella boundary. |
| T1 | PHASE_HISTORY.md | ✅ | Added the 2026-10-15 plain-language landing record and stated that no later soak remains. |
| T1 | SPRINT_TO_LIVE_PLAN.md | ✅ | Row 40 now reads Step 10 done, Step 11 next, with deployed/ref review state and umbrella residuals separated. |
| T1 | PHASE_19_PLAN.md | ✅ | Added a historical P1b landing note without claiming the wider `3b.f-c` umbrella closed. |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ | Shared memory carries the durable invariant; CC-C position reads `STEP: 10 of 11 · NEXT STEP: 11 of 11`. |
| T1 | B_ENTRY_CONSUMPTION_FRESHNESS_SCOPE.md | ✅ | Existing approved scope remains the controlling seven-objective boundary. |
| T1 | B_ENTRY_CONSUMPTION_FRESHNESS_PRE_AUDIT.md | ✅ | Existing approved pre-audit remains the registered design and verification contract. |
| T1 | COMPLETION_REPORT | ✅ | Step 11 creates the final report from this exact ledger and replaces the catalog/plan/history Step-10 markers with closed state. |
| T1 | Observation column | N/A | Step 7's bounded terminal window already ended; the scope names no post-governance observation or deploy hold. |
| T1 | CC_A_SESSION_TASK_LIST.md | N/A | The batch is owned by CC-C and creates no CC-A task. |
| T1 | CC_B_SESSION_TASK_LIST.md | N/A | CC-B review is complete; the batch creates no CC-B task. |
| T1 | CC_C_SESSION_TASK_LIST.md | ✅ | Row 40 now records P1b Step 10 done / Step 11 next and preserves umbrella residuals. |
| T1 | CC_INFRA_SESSION_TASK_LIST.md | N/A | The batch creates no infrastructure task. |
| T1 | Langston `/home/langston/MEMORY.md` | ✅ | Durable immediate-open invariant written through the guarded part writer; measured total decreased 844,222 → 843,666 bytes. |
| T2 | SYSTEM_MANUAL.md | ✅ | The active depth-walk section now defines consumption-instant age, fail-closed behavior, separate fields, exact limits, and resting-maker null semantics. |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | Corrected the OrderPlacer description and mapped the final synchronous check, data flow, stage, and consumers. |
| T2 | RUNNING_ISSUES.md | ✅ | `#684` records the completed gate-to-consumption half without falsely closing its separately homed rate/alert/exit/dedupe work. |
| T2 | CHANGES_AND_FIXES.md | ✅ | Added `FIX-2026-10-15-A` with symptom, mechanism, fix, verification, and residual boundary. |
| T2 | POST_AUDIT_ROADMAP.md | N/A | This sub-batch implements an already placed item and changes no roadmap sequencing. |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | No threshold or calibration parameter changed; live settings remain 5,000/15,000 ms. |
| T2 | AUTHORITY_BASELINE.md | N/A | No authority, role, or approval boundary changed. |
| T2 | STORAGE_POLICY.md | N/A | One nullable field was added to the existing `closed_trades` lifecycle; no table, retention, tier, or storage policy changed. |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | The change is on the active immediate-open seam and does not alter VTS expansion. |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | No asset class was added and no onboarding invariant changed. |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | The implementation introduces no new build method or workflow gate. |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | Reviewer infrastructure and architecture are unchanged. |
| T2 | CLAUDE.md / CONDUCT.md | N/A | No stable crew rule or conduct rule changed. |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | No rule was added, replaced, or archived. |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | No component or code path was deleted. |
| T2 | MISTAKE_PATTERNS.md | N/A | No `MISTAKE:` trailer or new recurring mistake class arose in this batch. |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | No governance exception was requested or used. |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | Alert lifecycle, routing, acknowledgment, and resolution behavior are unchanged. |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | The card advanced under the existing protocol; no board field or transition rule changed. |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | No Claude Code model or feature evaluation belongs to this trading sub-batch. |

## Additional active-path record

`ACTIVE_PATH_FLOW.md` now records the same snapshot handoff and final check at RTB promotion step 3. `PRE_SPRINT_SIMULATION_TRUTH_PLAN.md` now marks P1b Step 10 done and explicitly says this sub-batch creates no deployment hold.
