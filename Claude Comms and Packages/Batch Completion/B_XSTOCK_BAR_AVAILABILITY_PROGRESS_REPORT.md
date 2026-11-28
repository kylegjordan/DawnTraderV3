# B-XSTOCK-BAR-AVAILABILITY (#707) — PROGRESS REPORT

## OPEN — waiting on the R2prime graded read and decision

**Change class:** architecture

**Owner:** ANALYST Codex / CC-C
**Current workflow state:** Step 10 complete; card in Observation; Step 11 waits for the registered R2prime result and the action or decision taken from it.

## 1. What this batch is for

Kraken's xStock OHLC payload carries a vendor `interval_begin` label that reaches DawnTrader roughly 15–16 minutes later. The original capture design intentionally preserved that label, and the later live design intentionally consumed a forming bar; neither decision established that the vendor label was the time at which the exact revision was locally readable.

This batch makes those clocks explicit. The capture phase preserves the vendor label as identity, records receipt and committed reader-visible availability separately, and distinguishes those clocks on the archive-health display. The cutover plan carries exact source revisions to the scanner and RTB, applies the no-look-ahead rule to their decisions and records the evidence each decision used.

## 2. What shipped

- The one-minute writer retains append-only xStock revision events with receipt, persistence and reader-visible sequencing rather than relying only on the final upserted row.
- The deployed build includes availability-aware 15-minute and 60-minute aggregation, snapshot and cache code. The ordered settled-window manifest and forming-revision handoff were verified through focused controls.
- The scanner and independent RTB regime refresh still use their pre-cutover bar reads. Switching both together and recording their exact decision receipts are the agreed P8/P9 work after the capacity and quality gate.
- The replay contract requires a recorded decision receipt and the revisions that were reader-visible at that decision. Legacy or overwritten-revision periods remain explicitly unknown.
- The passive-archive status surface reports vendor-label, receipt and reader-visible measures separately.
- Dormant and historical readers are fenced from making exact decision-availability claims under the old label-only shape.
- A self-running capacity verdict, durable stored result and retention-sweep hold protect the registered observation from another missed handoff or premature partition sweep.

The deployed aggregate is exact ref `e3a96a8126f0280a9568bb1823b9210783f0afe0`, live since 2026-11-24T00:03:08Z. The governed R2prime start read back as `2026-11-30T01:00:00Z` under `b-xstock-bar-availability-r2prime`.

### Plan Price Basis A14 serving receipt, 2026-11-28

**UNPROVED.** Coltrane's 13:05:58Z ruling at `c0cd401d58ee72c050cd6abe62e2f78f83eaaf91` accepted the method for separate authorization once the carrier is identified and held execution. At the reported deployment, comparison ref `2b74f5dd2693c5af6ab8b581b59cf1cbc244aed2`, R3 `8f97c294ed705fab920245762183632eec7bad71` and shared `7e1d838047a797ddf402266f0b40eb71024d1af2`, `scanner.ts:595` serves the 15-minute legacy cache. Its warm read can return in-process values, and the cold read merges snapshot and live values (`xstock-ohlc-cache.ts:283–297,335–359`). The certified builder's exact and refusal tests (`b-xstock-bar-availability-aggregate.test.ts:179,258`) prove the handoff fields in isolation. The actual scanner call has no forming revision ID, ordered settled manifest or certified read time/sequence. This matches the Step 3 Change List's capture-only decision and independent Step 8 read.

Evaluation provenance preserves forming OHLCV and a hash of settled values (`signal-eval-archiver.ts:192–245`). Equal values can come from different revisions. VTS reads MCE separately (`eval-cycle.ts:411–426`). MCE can return a cached context before the pair-scan capture branch (`market-context-engine.ts:1241–1247,1524–1576`), so the archive corroborates symbol and context without identifying the context actually used by NEW's boot-scoped opportunity. NEW received the exact owner disposition in Discord `1576223520588046389`. A qualifying retained export must bind the actual scanner receipt and independently selected MCE context to that opportunity and build/boot. Collection, staging and the separate joint observation remain gated.

`REVIEWER: claim-only · does any existing read establish one boot-scoped serving receipt? · HIT: MCE cache hits can bypass the archive's computation event · re-derived y (cache return precedes the pair-scan call; eval-cycle reads the returned context)`

## 3. Workflow evidence through Step 10

| step | evidence |
|---|---|
| 1 — scope | Architecture scope r3 approved by Coltrane at `cf011e6d748f7af373dfe867bbf6c4bf8b0f0336`; CI `38574435663` was 4/4 green. The scope includes the full producer/consumer census and preserves the intentional mixed-clock design while replacing ambiguous consumption. |
| 2 — pre-audit | The pre-audit settled the clock dictionary, revision model, no-look-ahead rule, consumer dispositions, crypto isolation, exact proof shape and live-capacity criterion; Langston approved the audit before implementation. |
| 3 — implementation | The implementation arc ran from `65d66a6aa` through `7235d3052`/`37ef9f382`, then Step-9 reliability increments added the stored verdict, capacity-safe reader and sweep hold. |
| 4 — review | Coltrane/Langston reviewed the initial implementation and each Step-9 repair. R2prime round 2 was approved after moving the Sunday session start to the venue-live minute and keeping the 60-second gap test unchanged. |
| 5 — CI | The implementation and later reliability increments each passed all four required jobs at their reviewed refs; the final deploy bundle was independently approved at review ref `3087bb7c98727a82a48e89d32a2b268a90cb635e`. |
| 6 — deploy | Initial runtime landed in `f1f332946`; Step-9 reliability increments landed across the later reviewed deploys; R2prime is live in exact aggregate `e3a96a8126f0280a9568bb1823b9210783f0afe0`. |
| 7 — staging verification | Capture and certification were checked on staging. Focused controls covered exact aggregate/snapshot/manifest identity, microseconds and the decision-window handoff. R7d's self-running and archival-health checks passed after deploy `c21c1502a`. |
| 8 — independent verification | The reviewer independently verified additive capture and the Step-9 instrumentation at their exact pushed refs. The R2prime design and deploy bundle received PROCEED. |
| 9 — objective/capacity verification | The capacity reader completed its four heavy legs over 8.3 days in 471,843 ms of a 1,200,000 ms budget. This was a timing proof, not a grade; the first complete end-to-end grade remains R2prime. |
| 10 — governance | This progress report and the Tier ledger below record the open observation state in every applicable governance home. |

## 4. Step-9 observation history — failures are results, not delays

### First registered window

The first window did not close cleanly: one writer stopped without the required deploy handoff. That broke the registered integrity rule, so the window was not treated as a pass.

### R2 window

R2 also failed as an evidence window. Its final read was missed during the KD-99 stop, and the nightly retention sweep removed the 2026-11-09 through 2026-11-11 revision-event partitions before the read. The later unattended reader correctly returned **INCONCLUSIVE**, with 926,329 of 926,329 linked revisions outside the surviving bound; that alert remains evidence of the failed old window, not evidence about R2prime.

### Reliability repair

The repair made the final grade self-running, stores one durable verdict per registered window, records per-leg and total run timing, and holds overlapping revision partitions until a verdict exists. The capacity reader returns `inconclusive` rather than exhausting the database when its exactness cap is exceeded.

### R2prime

R2prime begins at 2026-11-30T01:00:00Z, aligned to the xStock venue week. Sunday sessions begin at the documented 20:15 ET live minute rather than the 20:00 ET reconnect interval, so the unchanged 60-second head-gap test grades only a live interval. The final gate is 2026-12-09T01:10:00Z; the first due unattended fire is 2026-12-10T00:15:00Z. The 2026-12-09 sweep is expected to hold one partition for one night, leaving two failure nights of margin under the three-partition cap.

## 5. Pre-registered close criterion — do not data-mine

The batch closes only when both the data is in **and** a decision or action has been recorded from it.

### PASS

The stored R2prime verdict is `pass`, the exact deployed/reviewed-ref census is accepted, and every required leg passes:

1. at least eight complete UTC days and at least five complete xStock venue sessions are present (the registered calendar contains seven eligible sessions);
2. the venue-session continuity tests pass, including the unchanged 60-second head-gap rule over the counted live intervals;
3. the capacity population includes at least 100,000 xStock revision events over at least 400 xStock symbols, and the crypto read returns a non-empty positive-control population;
4. every linked revision is found inside its registered availability bound, revision identity is unique, visibility ordering is coherent, and zero post-decision visibility violations exist;
5. manifest, partition, archive, certification, boot-chain and deployment-handoff checks pass;
6. the capacity reader completes inside its 1,200,000 ms budget and records total plus per-leg timing; and
7. Coltrane independently verifies the stored evidence at the exact pushed ref.

On PASS, the action is to accept the availability contract as the live and exact-replay boundary, convert this file into the completion report, retire the batch's open governance rows, resolve `ba8b42e2` and `8bd256bc` with the pushed evidence, and complete Step 11.

### FAIL

Any required Boolean leg false, an insufficient population/session count, a visibility violation, a duplicate/incoherent revision identity, missing certification/handoff evidence, or a budget overrun is a FAIL. A failed gate reopens the batch at the step that owns the failing object; the threshold is not loosened after seeing the data.

### INCONCLUSIVE / NO RESULT

An exactness-cap refusal, unreadable evidence source, incomplete stored result, or missing bound is neither PASS nor FAIL. It remains an open evidence problem and must be repaired or re-run without relabelling it.

## 6. What remains unproven

- R2prime has not started, so no statement here claims its live population passes.
- The provider's public xStock OHLC documentation still does not define `interval_begin` as publication or availability time. The live contract therefore rests on trustworthy local reader-visible availability, not a claim about provider event recency.
- Pre-cutover final-row history cannot recover overwritten revisions or exact reader-visible time and remains non-exact for decision replay.
- The stored clearing edge for the sweep hold has been verified by construction and tests but has not yet cleared a real successful R2prime verdict.
- The first complete end-to-end unattended CLI runtime, including its lighter catalog and certification legs, is measured by R2prime itself; the 471,843 ms result covered the four heavy legs only.

## 7. Active observation controls

- Event-wait alert `48fce948-f9e5-4540-bee5-a94665de8993` triggers 2026-12-10T00:45:00Z if the graded read still needs handling.
- `ba8b42e2-7212-4cb6-a1d2-e22ec4d74313` remains active and unacknowledged until the new graded read records the old inconclusive condition's disposition.
- `8bd256bc-4a85-4def-89b5-3282a583cf82` remains active and unacknowledged until the batch closes.
- The observation is nonblocking: normal reviewed work and deployments continue under the deployment-window register.

## 8. Governance files changed at this boundary

`BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `SPRINT_TO_LIVE_PLAN.md`, shared `MEMORY.md`, `MEMORY_CC_C.md`, `CC_C_SESSION_TASK_LIST.md`, this progress report, `SYSTEM_MANUAL.md`, `SYSTEM_IMPACT_MAP.md`, `RUNNING_ISSUES.md`, `CHANGES_AND_FIXES.md`, `STORAGE_POLICY.md`, `MULTI_ASSET_VTS_EXPANSION_PLAN.md`, `ASSET_CLASS_ONBOARDING_WORKFLOW.md`, `GOVERNANCE_EXCEPTIONS.md`, the delivery-board card, and Langston's `MEMORY.md`.

## 9. Tier ledger — Step 10, 2026-11-24

CHANGE-CLASS: architecture

| # | document | verdict | one-line result |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Added the shipped availability contract and the open R2prime close condition. |
| T1 | `PHASE_HISTORY.md` | ✅ | Added the plain-language delivery and the two failed-window lessons. |
| T1 | active plan `SPRINT_TO_LIVE_PLAN.md` | ✅ | Replaced the stale Step-9 registration text with live R2prime Observation state. |
| T1 | `PHASE_19_PLAN.md` | N/A | B-XSTOCK-BAR-AVAILABILITY has no in-flight row there; the active sprint plan owns it. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_C.md` | ✅ | Recorded the availability contract, exact live anchor and nonblocking Observation handoff. |
| T1 | batch `SCOPE` | ✅ | Existing approved architecture scope r3 remains the governing full producer/consumer contract. |
| T1 | batch `PRE_AUDIT` | ✅ | Existing pre-audit carries the R2prime registration, PASS/FAIL terms and timing bounds. |
| T1 | `COMPLETION_REPORT` | ✅ | Created this progress report because the registered evidence and decision are still outstanding. |
| T1 | Observation column | ✅ | Moved the card to Observation for the 2026-11-30 start and 2026-12-10 first due grade. |
| T1 | four session task lists | ✅ mine / N/A ×3 | Updated `CC_C_SESSION_TASK_LIST.md`; CC_A, CC_B and CC_INFRA lists are not mine. |
| T1 | Langston `/home/langston/MEMORY.md` | ✅ | Replaced fetchable mechanics with the R2prime baseline; loaded set fell 139,321→139,298 bytes. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | Added the canonical xStock bar clock, revision, eligibility and observation contract. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Added producers, consumers, stored state, gates and failure boundaries for the contract. |
| T2 | `RUNNING_ISSUES.md` | ✅ | Annotated `#707` as shipped and open only for the R2prime grade and decision. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | Registered the mixed-clock/no-look-ahead defect and its structural fix. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | This batch changes no phase-level order; pre-sprint stage 00 remains its authority. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | The batch changes evidence eligibility, not a tunable threshold or calibration epoch. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | The batch changes no operator, session or reviewer authority. |
| T2 | `STORAGE_POLICY.md` | ✅ | Added revision-event retention and the verdict-aware sweep-hold rule. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | ✅ | Reviewed the temporary 15-minute list and recorded the new trustworthy-availability era boundary. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | ✅ | Added the rule that vendor bar identity and decision availability are separate onboarding clocks. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No crew role, workflow gate or reusable build method changed. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | No reviewer model, runtime, invocation, auth or read path changed. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable crew or conduct rule changed in this batch. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | No `CLAUDE.md` rule was added or materially changed. |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | The batch removed no component, route, module or type. |
| T2 | `MISTAKE_PATTERNS.md` | N/A | No `MISTAKE:` trailer was written and the weekly pass did not run. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | Re-justified the declared-open row with the deployed R2prime window and close rule. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | Alert lifecycle rules did not change; this batch only follows existing event-wait handling. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | Board columns, fields and ownership rules did not change. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily model/feature check did not run in this governance turn. |
