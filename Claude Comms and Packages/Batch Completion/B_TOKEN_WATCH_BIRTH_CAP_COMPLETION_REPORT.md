# B-TOKEN-WATCH-BIRTH-CAP — COMPLETION REPORT

## STEP 11 OPEN — OBJ-2, OBJ-5 and OBJ-8 passed independent adjudication

> Batch `B-TOKEN-WATCH-BIRTH-CAP` · issue `#1247` · owner Infra Claude · Kyle decision KD-90 · plan row `SPRINT_TO_LIVE_PLAN.md` 5a · change-class `non_architecture` (scope header).
> Window shape: a **set period** — 7 complete capped days for OBJ-2; OBJ-5's window is registered in §5 (AMENDMENT 18 rider 3): from the rider's commit to 2026-11-27 00:00Z.
> Both scheduled reads are complete and the owner has accepted the results within their registered criteria. Coltrane's confirmation of this Step 11 report is pending.
> Step-by-step evidence: `Claude Comms and Packages/Change Lists/B_TOKEN_WATCH_BIRTH_CAP_CHANGE_LIST.md` §9-§9e. This report points at it rather than copying it.

**Open evidence and custody.** INFRA retains the C-2 snapshot and the separately restricted KD-124 extract pending their own authorized disposition. This report supplies no disposal authority. The OBJ-5 coverage limit and the behaviors that lack a live example are listed in §6.

## 1. What the batch is for

Kyle, KD-90: keep the token-watch study on the free Helius tier. The free allowance (1,000,000 credits a cycle, cycle 10-27 → 11-27) was projected to run dry about 11-19/20 at ~40,000 credits a day, almost all of it new-coin ("birth") webhook deliveries (`RUNNING_ISSUES` `#1247`, confirmed at the vendor's own usage counter 11-16).

The batch built a controller, `token-watch/birthcap.py` (units `token-watch-birthcap.service` + `.timer`), that switches the Helius birth webhook on and off on a timetable: W evenly spaced windows a day with a daily rotating phase, so each hour of the day is sampled in proportion to a known, measured on-time fraction. A per-cycle credit allowance is the backstop: a day that reaches it stops early and is logged *truncated*. Every switch is persisted with its requested and vendor-confirmed times (`provenance/switches.jsonl`), and every ON window is compared against the vendor's meter (verdicts `ok`, `divergent`, `frozen`, `backwards`, `reset`, `unpaired`), with a one-sided cumulative over-billing page.

## 2. Steps done, with evidence

| step | evidence |
|---|---|
| 1 Scope | `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_SCOPE.md` r2 `ad55cb91e`; Langston closed Step 1, Discord `1571687052171288577` |
| 2 Audit + plan | `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_PRE_AUDIT.md` r2 (r1 sent back `1571708212506263694`; r2 cleared) |
| pre-registration | `Scope Files/B_TOKEN_WATCH_PRE_REGISTRATION.md` AMENDMENT 18 at `9fc98626e`, rider `06df4bee5`, rider 2 (this commit) — committed before the first capped birth (OBJ-6) |
| 4 Code review | Approved, Langston `1571833133165445181` (gates A-D) |
| 5 CI | run `43849031520` at `70d56bba3`, 4/4 per job |
| 6 Install + switch-on | install 2026-11-16T10:34:05Z; first enabled tick 10:37:20Z, 11-16 truncated, feed OFF 10:37:20Z (change list §9) |
| 9 Iterations | `896df3e30` (false replan + TasksMax; PROCEED `1571846571056701471`); `cde88cc02` free follow-up shed since 11-16 ~10:53Z, installed 11-20 00:03:59Z (PROCEED `1573123563844538452`, CI `44640384871`); the divergence check moved from the clock hour to the ON window, Part B PROCEED `1573388184308555899`, installed `f655fdd59` 11-20 18:11:36Z (change list §9b-§9e) |
| 7 First closed window | ON 18:24:20Z (the `on` path), OFF 19:46:20Z, compared 19:49:20Z: census births 2,604 + switch credits 200 = 2,804 expected; vendor webhook delta 2,776; verdict **ok**, not paged; `unpaired_windows` 0 |
| 8 Langston | **PROCEED**, Discord `1573430118146244780`: all three legs re-derived from raw objects; installed `birthcap.py` sha256 `48bc6072…` byte-identical to the repo at `f655fdd59` and at the graded ref `2b7396593` |
| 10 C-2 reviewer snapshot | C-2 landed at `387b9fc3f`, CI `45306759665` 4/4. Coltrane authorized the exact three-file combined install at 02:02:22Z. Installed 02:04:08Z with previous `f655fdd59`; no restart. One fixed snapshot created 02:04:33Z; receipt `4ee27c101…`; 8 files / 71,715 rows / 47,106,018 source bytes; `DEPLOY_BOUNDARY_PASS files=8`. Superseding 02:16:25Z ruling: OBJ-2/OBJ-8 PROCEED, 72/72 missing-transition mutants red, 24/24 hours PASS (change list §9f) |
| 11 Observation disposition and report | Cycle-end evidence `931e7ef094f1221f5dbf6ca1bc4419d0fe8097ee`, CI `45917557307` 4/4 (Build, TypeScript Check, Test Suite, Docker Build). Independent OBJ-5 PASS and owner disposition in §5. Step 11 confirmation pending. |

### PREVIOUSLY STATED / NOW

**PREVIOUSLY STATED:** the first window after the Part B install would open on the `adopt` path. **NOW:** it opened on the `on` path. **REASON:** the feed was OFF at install (OFF at 14:58:20Z), so there was no running window to adopt; the first window began at the 18:24:20Z ON switch. The adopt path has not run live.

**PREVIOUSLY STATED:** the window share is divided by the vendor's count. **NOW:** it is divided by our count, 2,804 (share 0.01). **REASON:** Langston's Step 8 correction; the code's base is the larger side, which here is ours.

## 3. Objectives

| # | objective (scope :37-:45) | status | evidence |
|---|---|---|---|
| OBJ-1 | the cap stops Helius sending: vendor counter flat across an OFF window, with an ON window the same day advancing | **YES** | 11-16: `webhooks` 837,420 and `rpc` 35,751 flat for 39 min (10:40:44Z → 11:19:21Z), file `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_OBJ1_OFF_20261116.jsonl`. 11-20 same-day pair: hours 16Z and 17Z (inside the 14:58:20Z → 18:24:20Z OFF) vendor 0, births 0 for 120 min; the 82-min ON window 18:24-19:46Z advanced 2,776. The ON leg is shorter than the OFF leg, so the control holds a fortiori. The 11-20 pair uses the webhooks counter only |
| OBJ-2 | scheduled by time; births per hour of day within the pre-registered band | **YES — independently adjudicated** | Coltrane reconstructed hourly ON intervals directly from the immutable 11-17 → 11-23 snapshot: 24/24 hours PASS; largest absolute difference 1.224429 pp at hour 06 against the 1.5 pp band (02:16:25Z ruling; §4 and change list §9f) |
| OBJ-3 | the credit cap is a backstop | **YES — live** | 11-16 truncated at the first enabled tick (12,095 recorded ≥ allowance 10,493.7) |
| OBJ-4 | every switch state checked, both directions | **YES — tests and live arm (i)** | suite 142 passed, every mutant killed (change list §9e). The read-back (arm i) runs on every switch: all six 11-20 switches `ok:true` with the echo matching. Arms (ii)-(iv) and the window alarms have **never fired live**, so their silence is not evidence they work |
| OBJ-5 | everything already tracked keeps being tracked | **YES within AMENDMENT 18 rider 3** | §5; 142,625 of 142,625 existing-token obligations represented in the observation rows were observed, with zero budget sheds and zero abandonments |
| OBJ-6 | pre-registration amendment before the first capped birth | **YES** | `9fc98626e` (before the 10:37:20Z switch-on), rider `06df4bee5`, rider 2 |
| OBJ-7 | Kyle's purpose in `B_TOKEN_WATCH_SCOPE.md` §1 | **YES** | `b86ea91fd` |
| OBJ-8 | exact switch timestamps persisted; the log reproduces each day's on-time fraction | **YES — independently adjudicated** | 75-row prefix: 38 ON / 37 OFF successful, alternating, non-overlapping and echo-consistent; 72 in-window transitions; 72/72 one-row omission mutants failed validation. Seven daily fractions reproduced in §4/change list §9f |
| OBJ-9 | live before the cycle ran dry | **YES** | switch-on 11-16 10:37Z, ahead of the projected ~11-19/20 exhaustion; the cycle has not run dry (11-20 status: 2,804 census vs 2,776 vendor in the first compared window, cumulative leg clean) |

## 4. The pre-registered close criterion — OBJ-2 (AMENDMENT 18, written before the data)

> "Over the first 7 complete capped days: each hour of day's share of recorded births is compared against its coverage-weighted expected share = the reference hour-share × that hour's measured on-time fraction, renormalised …"
> "PASS: every hour's capped share is within ±1.5 percentage points, or within 30 % relative, of its coverage-weighted expected share, whichever is wider. FAIL: any hour outside both."

Reference: `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_OBJ2_REFERENCE.json` (63 uncapped days, 2,423,615 rows, hour-share spread 0.49 pp). Days 11-17 → 11-23. OBJ-8 is read in the same pass: the switch log must reproduce each day's on-time fraction, and a missing entry fails the weight computation loudly.

**Fixed adjudication object:** `/srv/token-watch-review/birthcap-obj2-2026-11-17_2026-11-23`, captured 2026-11-24T02:04:33.827226Z. External manifest SHA-256 receipt: `4ee27c10124a2cb8b95d382c55c74b5c6aad89a8a98684d1fce008de913a9ba9`. The manifest binds 8 files, 71,715 rows and 47,106,018 source bytes; its complete switch prefix is 75 rows / 20,238 bytes. The live exporter returned `DEPLOY_BOUNDARY_PASS files=8`. The object is root-owned, mode 0555, and remains unchanged after adjudication; deletion has not been authorized or performed.

**Adjudication (Coltrane, superseding ruling 2026-11-24T02:16:25Z):** `on_fraction` is one whole-day scalar; it is recorded only as the manifest's provenance pointer for requested-time transition and day-boundary semantics, never as the 24-hour criterion implementation. Coltrane rebuilt ON intervals directly from the raw 75-row prefix, reproduced daily fractions `0.247228196`, `0.255553754`, `0.284749030`, `0.284462274`, `0.284950040`, `0.284722352`, `0.284716845`, and made each of the 72 in-window transition omissions fail validation. All 24 hourly comparisons pass; the largest difference is hour 06 at 1.224429 percentage points, inside its 1.5-point band. OBJ-2 and OBJ-8 are MET. The snapshot stays unchanged; deletion is not authorized.

## 5. OBJ-5 — the follow-up read (criterion registered: AMENDMENT 18 rider 3)

The scope's verification was *"follow-up counts against a pre-cap baseline window of equal length"*, with the baseline set at pre-audit :113 as *"the 7 days before switch-on"*. That window is not usable: the follow-up sweep only came back 11-15 15:12Z (`B-TOKEN-WATCH-FOLLOWUP-MEMORY` P10), and from 11-16 ~10:53Z to the `cde88cc02` install (11-20 00:03:59Z) a defect shed the free follow-up (change list §9c).

My first proposal (observed ÷ due against the 8 runs of 11-15 16:59Z → 11-16 10:52Z, PASS within 5 pp) was **sent back by Langston and is withdrawn** (`1573438420871676050`): `due` re-counts an entry every time it is requeued, so that ratio measures bucket timing rather than coverage; a 5 pp band would have passed loss the cap caused; and I had already read the post-install data, so it could not be a pre-registration.

**Registered criterion, quoted in full in `Scope Files/B_TOKEN_WATCH_PRE_REGISTRATION.md`, AMENDMENT 18 rider 3:**
- **Unit:** distinct (mint, checkpoint-age) obligations that came due in the window, each at its terminal state in the observation rows. Denominator = observed + shed + abandoned; requeued entries are on neither side.
- **Scored cohort:** mints created before the 11-16 10:37:20Z switch-on.
- **PASS:** zero cohort obligations shed for our own budget (reason `follow_up`) and zero `abandoned`. A vendor rate-limit shed (`follow_up rate-limited`) is counted and published but does not fail. No baseline comparator.
- **Window:** forward-only from the commit that landed rider 3, to 2026-11-27 00:00Z.
- **Counted from observation rows, never from the journal's `shed` total**, which also counts the liquidity leg's always-on shed (13,664 of them in the first 18 h after the install, against 0 checkpoint sheds).

> 4. **PASS:** zero cohort obligations shed with reason `follow_up` (our own budget, `providers.py:225`) AND zero `abandoned` (`follow_up.py:382-391`). **FAIL:** one or more of either. A shed with reason `follow_up rate-limited` (a vendor 429, `providers.py:230`) is counted and published but does not fail the gate. No baseline comparator; the 8 runs of 11-15 16:59Z → 11-16 10:52Z are context only. A `follow_up`-reason shed outside the cohort is published as a finding, not a batch FAIL.

**Langston's two burdens, both met in rider 3:** (a) the observation files are never pruned and reach back to 08-31; a real `follow_up` shed row from the defect window is quoted as the positive control. The retry-to-abandoned test exercises the abandoned branch, and live observations prove the shared writer is in service. (b) catch-up reads the oldest buckets first and drops nothing.

**Pre-registration-era, scoring nothing:** the full 18 h after the install is published in rider 3 (every journal key, and the row-level partition: 0 checkpoint sheds, 0 abandoned). The 8 baseline runs stay as context only.

### Cycle-end read — 2026-11-27 UTC

- **Rider 3 result.** The scored interval is `[2026-11-20T20:51:42Z, 2026-11-27T00:00:00Z)`, starting at the committer time of `35180bae871a58052527ac8386a72b037202ce3e`. Select each (mint, checkpoint-age) pair's latest row in the window, from its `observed_at`, and split by the 11-16 10:37:20Z creation cutoff. The **142,625 existing-token obligations** and **284,786 later-token obligations** were observed. Both populations have zero budget sheds, zero vendor rate-limit sheds, zero abandoned and zero latest pending-error rows. The raw census is 427,530 observed rows, 15 error rows subsequently superseded by an in-window row for the same pair, 119 duplicate (mint, age, observed_at) rows, and 131,012 observed rows whose liquidity leg was shed. No obligation had unknown cohort membership. Eleven daily files from 11-16 to 11-26 parsed successfully. A real budget-shed positive control was found in the pre-install data, totaling 457,783 such rows in the scanned files. The abandoned leg's control is the existing retry-to-abandoned test and the live writer's observed rows, with no live abandonment observed.
- **Boundary reconciliation.** Observation rows use sweep start time, and the system journal totals use sweep finish time. In the pre-registration interval, final row totals **71,967 observed and 17,635 liquidity sheds** minus the sweep stamped **11-20 20:44:59.881827Z** (**9,766 observed, 3,971 liquidity sheds**, finished 22:37:09Z) equal the 18 pre-registration journal results **62,201 and 13,664**. The original interim count of 62,427 and 13,667 had included 226 and 3 rows of that still-running sweep. For the scored interval, completed-journal totals **426,644 and 132,265**, minus the same opening-boundary sweep and plus the closing-boundary sweep stamped **11-26 22:43:53Z** (10,652 and 2,718, finished **11-27 00:30:01Z**), exactly equal **427,530 and 131,012** in the raw observations. The scored totals thus include the last in-window sweep without mixing journal timestamps into the scoring rule.
- **Catch-up and cycle roll.** The completed results in the scored interval recorded zero `buckets_skipped_too_old`; the closing sweep also recorded zero and read two buckets. The cursor was at the 11-26 22Z bucket at the first post-cutoff reading, two hour buckets behind the 00Z clock. The natural 00:00:20Z Birth Cap run replanned for **11-27 00:00Z to 12-27 00:00Z** with **1,000,000** remaining cycle credits at the plan read. The previously adjudicated OBJ-2/OBJ-8 snapshot manifest still hashes to `4ee27c10124a2cb8b95d382c55c74b5c6aad89a8a98684d1fce008de913a9ba9`. All eight bound files match the manifest (47,106,018 B, 71,715 rows).
- **Independent source verification.** Coltrane's 2026-11-27T03:27:56Z PASS at `931e7ef094f1221f5dbf6ca1bc4419d0fe8097ee` supersedes the 01:02:23Z send-back. He matched all three payload hashes and byte counts to restricted manifest SHA-256 `7a019c004339e1d914eb4cb65b0286d4b49fe06340b27ee65c960005b39bb1dd`. He independently reproduced both cohort counts, reconciled both boundary sweeps and all 140 journal receipts, and verified that reversing the order of tied rows preserved the result. The historical control raised the scored budget-shed count to one only when placed inside the scoring interval. The original source hashes and the count of 457,783 historical budget sheds are source attestations in the manifest.
- **Owner disposition.** INFRA Codex accepts OBJ-5 as MET under the registered criterion and proceeds to Step 11 report review. The result covers obligations represented in the observation rows. Coverage for obligations that produced no observation row remains unproved. Kyle's KD-124 authority is `06f1e278c6529d457317acb394083ccb26d14be3`, now an ancestor of shared `316c3e05e00b3bcd25b67574a4fd5d451822b0b9`. The C-2 snapshot and the separately restricted extract remain under their existing access and retention controls.

REVIEWER: claim-only · What can still be true when the reported OBJ-5 zeros hold? · Missing rows, in-flight retries and rows first written after cutoff remain outside the verdict · re-derived y at `35180bae8`, rider 3, and the pinned cycle-end review above.

## 6. What is unproven

- **OBJ-5 denominator** — §5 establishes coverage for observations that were written. It cannot establish the number or status of obligations that left no observation row.
- **The window alarms in live use.** No `divergent`, `frozen`, `backwards`, `reset` or cumulative page has fired live. The first `reset` chance is the 11-27 cycle boundary.
- **The `adopt` path** — not taken live (§2).
- **Hour 15Z on 11-20:** 7 vendor events with 0 births just after the 14:58:20Z OFF, probably late-counted deliveries from the closing window. **NOT RE-READ.**
- **C-2 deletion only.** Coltrane rejected both live-store ACL forms and approved the separate snapshot. Exact-ref implementation review, 4/4 CI, the collision redispatch, combined install, one snapshot and OBJ-2/OBJ-8 adjudication are complete. The fixed object remains unchanged; deletion is not authorized until a later explicit ruling.
- **Follow-up Memory alert work** is tracked separately in `Change Lists/B_TOKEN_WATCH_FOLLOWUP_MEMORY_P10_07EBA4B2_CHANGE_LIST.md`. Its Step 9 lock return remains independent of this report.

## 7. Governance files changed (this Step 10)

CHANGE-CLASS: non_architecture

| document | class | verdict | line |
|---|---|---|---|
| the batch `SCOPE` | REQUIRED | ✅ present | r2 `ad55cb91e`, unchanged |
| the batch `PRE_AUDIT` | REQUIRED | ✅ present | r2, unchanged; OBJ-5's baseline question carried to §5 here |
| `COMPLETION_REPORT` | REQUIRED | ✅ converted from progress report | this Step 11 report awaits confirmation; the existing declaration remains in `GOVERNANCE_EXCEPTIONS.md` through the close gate |
| `BATCH_CATALOG.md` | REQUIRED | ✅ updated | new entry, marked open, in observation |
| `PHASE_HISTORY.md` | REQUIRED | ✅ updated | 2026-11-16 entry, in observation |
| `SYSTEM_MANUAL.md` | judged | N/A | a co-tenant study service, no trading architecture, strategy or maths |
| `SYSTEM_IMPACT_MAP.md` | judged | ✅ updated | token-watch section: the birthcap units, the stores, the `birthcap-*` alerts and the outbound Helius webhook writes |
| `CHANGES_AND_FIXES.md` | judged | N/A | a capability batch, not a fix; the §9 defects are inside the batch and recorded in the change list |
| `RUNNING_ISSUES.md` | judged | ✅ updated | `#1247` note: live and in observation; the entry stays open |
| `POST_AUDIT_ROADMAP.md` | judged | N/A | no roadmap item moves |
| `DELETED_COMPONENTS_LOG.md` | judged | N/A | nothing deleted |
| `ADJUSTMENT_FRAMEWORK.md` | judged | N/A | no trading knob |
| `PHASE_19_PLAN.md` | — | N/A | no row there |
| `SPRINT_TO_LIVE_PLAN.md` row 5a | REQUIRED (has a row) | ✅ updated | stale "PAUSED Step 9" → Step 10, in observation, linked here |
| `GOVERNANCE_EXCEPTIONS.md` | judged | ✅ updated | declared-open row: the batch is open past its first code-bearing push until the reads land |
| `B_TOKEN_WATCH_PRE_REGISTRATION.md` | judged | ✅ updated | AMENDMENT 18 rider 2 |
| shared `MEMORY.md` / `MEMORY_CC_INFRA.md` / Langston's `MEMORY.md` | REQUIRED | ✅ mine updated · shared N/A (no consensus truth moved) · Langston's N/A (no ruling of his to record beyond the Discord PROCEEDs) | |
| own session task list | REQUIRED | ✅ updated | row 24 |
| `CONDUCT.md` / `CLAUDE.md` | judged | N/A | no rule changed |
| `B_TOKEN_WATCH_SCOPE.md` §5.1 | judged | N/A | the parent scope's residuals are unchanged by this batch |
