# B-CRON-MISSED-CATCHUP — Completion Report

**Status:** **CLOSED 2026-11-14** — Langston Step 11 CONFIRMED 2026-11-14 (Discord `1570987475885760533`). The crew returned from Codex to Claude on 2026-11-13, so the final review was Langston's, not Coltrane's.

**Scope items left open:** **NONE within `#691`.** All seven objectives are
green. KD-19 alert `7e20ed0f`, `#1250`, the xStock-bar availability windows
and tallies, xStock active-fill rows, shadow-censoring evidence and KD-73 stay
under their existing owners and closing conditions; this batch neither closes
nor acknowledges them.

**Owner:** CC-C (ANALYST Codex through 2026-11-12, ANALYST Claude from 2026-11-13)

**Change class:** `architecture`

**Placement:** pre-sprint Stage 3 order 7, issue `#691`, after
`B-XSTOCK-SNAPSHOT-RETENTION` and before Stage 4 paper-truth work

**Deployed runtime (final):** `9591ba8c22d2c0fb9adfd822d85462709e211ef9`
(joint deploy 2026-11-14T01:40:58Z, restart 699; CI `43539037444` 4/4)

**Repair history, in order:**
1. First Step-11 repair (legacy clock): approved `7591fef855f7cca2ff78eeb406c4b9184033e388`, deployed and integrated on `migration/aws-supabase` as `cd2b794dec63bea0771e32b733263b7ae516e6b8`. Two of its refs are OFF-BRANCH (real objects, not ancestors of `migration/aws-supabase`, so `dt-review` reports them `OFF-BRANCH:`): the Coltrane Step-8 PROCEED evidence ref `3a2097653165c240d80644886a7a1ef80a09426c` and the Step-10 governance ref `8b97ce272bfb46a2434a5fc8abd101a8878943b3`.
2. Second Step-11 repair (exact evidence must carry identity): code `1251fb8e4eddf5a4995e52bea2f9d2b1065d4015`, landed `b4edaf08920be0d0cf17488c1f1d7e72975b735f`, deployed `77f6fd5984aeb42a2c3a319dba32b116ca49b28b` (CI `43505196746` 4/4), Langston Step 8 PROCEED (Discord `1570916733307461712`).
3. Fold of Langston's carries (runner-authored fire-row keys): Step 4 PROCEED at `7ddaadb83` (Discord `1570923179759771802`), notes folded at `99722172178d431918eca9ed8265c2364af1307d`, fold CONFIRMED (Discord `1570929969817854053`), deployed `9591ba8c2`, Langston Step 8 PROCEED (Discord `1570982569284083793`).

**Step-10 governance ref (this report's ledger):**
`cd539cb56fa370b5dd46d49b141ec59bb5c3ef81`

**Record of the second repair and the fold:**
`Claude Comms and Packages/Change Lists/B_CRON_MISSED_CATCHUP_STEP11_REPAIR.md` §11-§17

## 1. Intended outcome and what was delivered

A wall-clock step or an event loop blocked at the scheduled second could make
node-cron discard one occurrence. The existing registry could detect stale
work, but it could not prove whether that occurrence had started, admit one
safe retry, or record why replay would be dishonest.

All six production node-cron jobs now use one durable `(job name, scheduled
boundary)` identity and one serialized lane per job across natural, missed,
boot and manual work. The database admits one runner. A reviewed policy allows
only the newest recent catch-up whose current inputs still represent that
boundary; unsafe backlog, historical Q-D replay, session-guard conflicts and
after-start uncertainty are recorded rather than guessed. Exact durable
success resolves only the exact stale alert, while `cron_verifier_blind`
remains manual-only.

The first completion read exposed one compatibility defect inside OBJ-6.
Pre-ledger rows stored callback start a few milliseconds after the calendar
second, so exact-only verification falsely paged the slower jobs. The repair
keeps exact identity for durable/current evidence. Only a candidate boundary
before the current process boot may use a successful legacy cron row without
an occurrence ID inside that candidate's strict
`[candidate,next-candidate)` partition; both verifier reads derive that rule
independently. Current candidates, later boundaries, non-cron rows, error rows
and genuinely missing candidates remain refusals.

The required claim-only completion reader then found a second defect in the
same objective: equality with the exact boundary sat outside the provenance
checks, so an audit row at the candidate's timestamp with no occurrence ID, or
from a non-scheduled source, could certify a current candidate. The repair
makes exact current evidence either a succeeded occurrence row or a successful
audit row that carries an occurrence ID with source `cron` or
`missed_catchup`; the real-database fence grew to twelve states (exact legacy
refusal, exact non-scheduled refusal, exact missed-catch-up acceptance added).
Langston's Step-8 carries followed: the runner now writes its five fire-row
identity keys (`trigger_source`, `occurrence_id`, `duration_ms`, `lag_ms`,
`policy_version`) after the job's own metadata, the registry reserves them by
type, and the runner is the only production fire-row writer, so a job cannot
override the identity the verifier now relies on.

## 2. Numeric corrections and deltas

**PREVIOUSLY STATED:** the `12:13Z` transition pass contained three stale jobs.

**NOW:** it contained exactly two of the six registered jobs: Formula Health
and xStock universe discovery. The three-of-six stale positive control is the
`11:13Z` pass.

**REASON:** awareness reflection already had an exact current `12:00Z`
occurrence by `12:13Z`; the initial evidence read the wrong pre-deploy pass.

**PREVIOUSLY STATED:** the post-resolution due-queue positive control returned
16 other due rows.

**NOW:** Coltrane's later fresh read returned 17 other due rows, while both
reads excluded all three repaired target alerts.

**REASON:** the due queue is time-dependent and one unrelated row became due
between the two reads; the target-alert result did not change.

## 3. Scope objectives

| objective | verdict | evidence |
|---|---|---|
| OBJ-1 — true occurrence identity | **YES** | The registry and tests pin node-cron's advanced missed-event date to the previous exact calendar match, preserve timezone handling, and write the true boundary separately from callback start. |
| OBJ-2 — one durable attempt per identity | **YES** | The occurrence ledger has a database-enforced unique `(job_name,scheduled_for)` identity; concurrent claims, restart, natural/missed collision, claim refusal and crash boundaries admit one decision and refuse unproved work. |
| OBJ-3 — serialized, bounded recovery | **YES** | One FIFO/advisory-lock lane per job covers scheduled and auxiliary work; the six-job policy limits backlog and age, refuses historical Q-D reconstruction and session conflicts, and records every skip. |
| OBJ-4 — all six schedules, unchanged purpose | **YES** | The source/runtime census finds exactly six registrations. Cadence, timezone, enablement, jitter, Q-D `noOverlap`, Formula Health counts, discovery evidence and each job's business purpose are preserved. |
| OBJ-5 — truthful stale-alert recovery | **YES** | Exact succeeded occurrence evidence resolves only the same job/boundary key through `cron-recovery`; failure, skip, indeterminate, wrong-boundary and verifier-blind cases remain open. After the repair, the three false rows were resolved with the deployed SHA, and Coltrane found zero new verifier alerts after deployment against three pre-deploy stale rows as the positive control. |
| OBJ-6 — compatible consumers and observable schedule truth | **YES** | New rows carry exact scheduled identity and actual start separately. The repaired reader accepts the two real legacy clock shapes only for pre-boot candidates inside their own strict partitions, accepts current exact awareness evidence, and rejects next-boundary, later-success, non-cron, error, current legacy-shaped and genuinely missing cases. Formula Health and the cadence verifier continue to read completed success evidence only. Second repair: an exact-boundary row now certifies a current candidate only with an occurrence ID from `cron` or `missed_catchup` (twelve-state real-database fence); on `9591ba8c2` all 9 of 9 post-restart fire rows carried the runner's keys with an occurrence ID matching that job's own natural occurrence, and the verifier passed six of six on them (Langston re-derived both). |
| OBJ-7 — deterministic, non-blocking staging proof | **YES** | The side-effect-free harness reconciled 11/11 identities as 6 succeeded / 3 skipped / 1 failed / 1 indeterminate, seven execution-only audit rows and one natural/missed race core call. The repair then completed exact-ref CI, deployment, live verification and independent reproduction without changing the host clock, waiting for a natural multi-day miss or blocking unrelated deployments. UI is N/A because the changed contract is server-side. |

## 4. Review, CI and live verification

- Coltrane approved the repair at exact ref
  `7591fef855f7cca2ff78eeb406c4b9184033e388` after the production path proved
  legacy acceptance in the initial and locked reads and current-candidate
  rejection in both.
- Deployed-code CI run `43215462342`: TypeScript Check **SUCCESS**, Test Suite
  **SUCCESS**, Build **SUCCESS**, Docker Build **SUCCESS** at deployed ref
  `cd2b794dec63bea0771e32b733263b7ae516e6b8`.
- The full suite passed 5,621/5,621. The repaired verifier passed 24/24 tests,
  and the six focused files passed 123/123.
- Mutation proof reversed both candidate-before-boot comparisons: both legacy
  acceptance controls became stale and the current-candidate control became
  falsely healthy; restoring the comparisons returned all three green.
- The same two-stream live instrument found three of six registered jobs stale
  at `11:13Z`, two of six stale at `12:13Z`, and all six healthy after
  deployment at `12:30Z` and again at `12:45Z`.
- The healthy population included Formula Health at `03:00:00.023Z`, xStock
  universe discovery at `06:00:00.018Z`, and current exact awareness at
  `12:00:00.000Z`.
- Alerts `7e07b671-159d-49b1-879e-ecfea53a50ef`,
  `475e1e6e-b133-4d2b-8a22-84028520ff86` and
  `faf3be74-940e-4187-9026-2632db6ed0b2` are resolved with the deployed SHA.
  Direct state readback and due-queue exclusion both passed.
- Coltrane returned **PROCEED** at corrected Step-8 evidence ref
  `3a2097653165c240d80644886a7a1ef80a09426c`. His fresh authenticated read
  confirmed exact running identity, engine liveness, 17 unrelated due rows as
  a positive control, zero target rows in that queue and zero verifier alerts
  created after deployment against the three pre-deploy rows.
- Governance checker tests passed: census 228/228 and poller 448/448.

**Second repair and fold (2026-11-13/14):**
- Second repair deployed `77f6fd598` (CI `43505196746` 4/4). Step 7 (change
  list §12): six of six healthy on the first post-restart pass; zero
  error-stream verifier lines against a positive control. Langston Step 8
  PROCEED (§13): 548 rows for the six jobs, all certified through the repaired
  exact arm; a stronger silence control (four non-cron alerts minted in the
  window while the cron class stayed silent).
- Fold: Langston Step 4 PROCEED at `7ddaadb83`, notes folded at `997221721`,
  fold CONFIRMED with his own rebuild of the compile fence (as shipped: errors
  on lines 2, 3, 4, all TS2322; with `?: unknown`: none; with a broken import:
  line 0 only). Both focused suites 61/61, run twice; `tsc --noEmit` at the 324
  baseline with none in the touched files.
- Fold deployed `9591ba8c2` (CI `43539037444` 4/4). Step 7 (§16) and Langston
  Step 8 PROCEED (§17): 9 of 9 post-restart fire rows correct (his tighter join
  also matched each occurrence to its own job); first verifier pass six of six
  healthy, the five-minute jobs certified on a boundary the folded runner
  wrote; zero cron alerts since the restart (corroborative only: no alert of any
  kind was minted in that window).

## 5. Honest residuals and separate work

1. Pre-ledger rows have no immutable occurrence ID. The compatibility arm can
   establish one successful cron callback inside the candidate's historical
   calendar partition; it cannot prove exactly-once execution or downstream
   business correctness for that old callback.
2. Recovery does not make external side effects exactly once after a crash.
   Work that may have started becomes `indeterminate` and requires a manual
   decision rather than an automatic retry.
3. Historical Q-D inputs cannot be reconstructed from current snapshots, so
   old Q-D occurrences are recorded as skips rather than fabricated history.
4. `cron_verifier_blind` remains manual-only after a human confirms history
   reads recovered. This batch does not weaken or auto-resolve it.
5. The recovery mechanism was proven with deterministic injected misses and
   live schedule evidence; no natural post-deploy wall-clock step or long
   event-loop stall was required as a closing condition.
6. A job that tries to set a reserved fire-row key is not exercised live — no
   registered job does. That arm is proven by the forging test and the compile
   fence only, and the type reservation binds object literals only; the
   runner's write-last order is what holds at runtime. No future silence may be
   read as proof the arm fires.
7. The batch stayed open past the checker's age limits and is declared open in
   `GOVERNANCE_EXCEPTIONS.md`; that row flips to open-retired in the close
   commit. The open-state checker missing this batch is the second recorded
   instance on `#744` (owner CC-A), not work for this batch.
8. KD-19, `#1250`, xStock-bar availability and tally windows, active-fill,
   shadow-censoring and KD-73 remain separately placed work. None was
   acknowledged, resolved or re-homed by this batch.

## 6. Governance files changed — transcribed from Step-10 commit `cd539cb56`

This is the ledger of the second repair's Step 10, copied from the commit message of
`cd539cb56fa370b5dd46d49b141ec59bb5c3ef81`, `N/A` rows included. The first repair's
ledger (commit `8b97ce272`) stands in git history; every document it updated was
updated again here where the second repair touched it.

CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | Header advanced to Step 10 of the second repair; second-repair paragraph added. |
| T1 | PHASE_HISTORY.md | ✅ | Entry heading advanced; dated paragraph for the second repair added. |
| T1 | SPRINT_TO_LIVE_PLAN.md (your row) | ✅ | Stage 3 order 7 advanced to Step 10 of the second repair, deployed 9591ba8c2. |
| T1 | PHASE_19_PLAN.md | N/A | Not a P19-* batch, and it has no row there. |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ | Cron line carries the exact-evidence and runner-key rules, both copies re-synced under cap; my position advanced to Step 11. |
| T1 | batch SCOPE | ✅ | §7 reconciles OBJ-6 to the exact-evidence repair and the fold. |
| T1 | batch PRE_AUDIT | ✅ | §13 carries the same reconciliation. |
| T1 | COMPLETION_REPORT | ✅ | Step 11 converts the withheld report, transcribing this ledger from this commit. |
| T1 | Observation column | N/A | The scope closes on deterministic exact-ref proof; no observation window. |
| T1 | four session task lists | ✅ mine / N/A ×3 | CC_C list row advanced; the OLD, NEW and INFRA lists are not mine. |
| T1 | Langston MEMORY.md | ✅ | Batch line now carries the exact-evidence and runner-key rules; loaded set 143,695 -> 143,691 B (ceiling 143,856). |
| T2 | SYSTEM_MANUAL.md | ✅ | Exact current evidence rule, the proxy-evidence limit, and runner-authored keys written last. |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | New 9.10.c bullet for the verifier, runner and registry boundary. |
| T2 | RUNNING_ISSUES.md | ✅ | #691 annotated with the second repair; close condition unchanged. |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-11-12-B gains the second-repair paragraph. |
| T2 | POST_AUDIT_ROADMAP.md | N/A | No phase-level item or sequence changed. |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | No strategy, regime, filter or calibration parameter changed. |
| T2 | AUTHORITY_BASELINE.md | N/A | No authority boundary changed. |
| T2 | STORAGE_POLICY.md | N/A | No table tier or retention changed; only evidence classification and metadata order. |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | Working list re-read; the repair touches only cron evidence and runner code, no xStock bar or calibration input. |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | No onboarding learning surfaced. |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | No role or gate changed. |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | Reviewer build unchanged by this batch. |
| T2 | CLAUDE.md / CONDUCT.md | N/A | No stable rule changed. |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | CLAUDE.md not changed. |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | The repair diffs delete no file or component. |
| T2 | MISTAKE_PATTERNS.md | N/A | One wrong-population trailer (fold commit) is a single instance below the floor, counted by the weekly pass from commits. |
| T2 | GOVERNANCE_EXCEPTIONS.md | ✅ | Declared-open row filed in the fold (997221721); flips to open-retired in the close commit. |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | Unchanged. |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | Unchanged; the card moves to Governance. |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | The daily check did not run in this batch. |

## 7. Delivery reconciliation pending confirmation

The active Sprint-to-Live Plan, `BATCH_CATALOG`, `PHASE_HISTORY`,
`RUNNING_ISSUES`, the Analyst task list and the Delivery Board (card in
Governance) all identify Step 11 as the only remaining boundary. After Langston
confirms this report, the close commit marks `#691` and those records closed,
flips the `GOVERNANCE_EXCEPTIONS.md` row to open-retired, moves the card to
Complete, and leaves every separately named window and alert unchanged.

## 8. Fresh-reader record

`REVIEWER: claim-only · asked which objects settle whether legacy-shaped or later rows can certify current or genuinely missing candidates, and what alternate states fit those objects · HIT — exact legacy/non-scheduled audit rows bypassed the current provenance gate, and populated pre-ledger partitions remain proxy evidence rather than exact historical identity · re-derived y`

That one pass is the batch's fresh-reader pass; its hit became the second
repair, which Langston reviewed at Step 4 and Step 8. The new text in this
converted report is `NOT RE-READ` by a second reader; Langston is the second
pass.

## 9. Final reviewer confirmation

**CONFIRMED** — Langston Step 11 CONFIRMED 2026-11-14 (Discord `1570987475885760533`). He re-derived at `cd539cb56`: the §6 ledger matches that commit's message; all seven required `architecture` documents are ✅ with content changed, not reorganised; `GOVERNANCE_EXCEPTIONS` row present; `#691` annotation inside its own entry; staging `9591ba8c2`, restart 699, CI 4/4 at each deployed sha; live at 02:17Z, 15 of 15 post-restart fire rows correct under his tighter join, with the positive control holding; the 02:10:55Z verifier pass six of six healthy, awareness state now certifying on a boundary the folded runner wrote after the restart; his loaded set 143,691 B. No alert names this batch, so nothing is resolved at close. Residual §5(6) stands as written.
