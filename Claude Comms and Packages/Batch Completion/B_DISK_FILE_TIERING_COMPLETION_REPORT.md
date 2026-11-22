# B-DISK-FILE-TIERING — COMPLETION REPORT

- **Batch:** `B-DISK-FILE-TIERING` · owner CC-A (OLD Claude) · `SPRINT_TO_LIVE_PLAN.md` row 5a (CC-A pre-sprint item 3) · Kyle 2026-11-04 Desktop + KD-2 (folds `#1240`) · `#1233`, `#1240`
- **CHANGE-CLASS: architecture** (scope header r7)
- **Record:** `Scope Files/B_DISK_FILE_TIERING_SCOPE.md` r7 · `Scope Files/B_DISK_FILE_TIERING_PRE_AUDIT.md` · `Change Lists/B_DISK_FILE_TIERING_CHANGE_LIST.md`
- **Live:** deployed `4456f515d07a1e7b1310a767bd7e1d645f565411` 2026-11-21 (rollback `85e7ce638`); Step 4 PROCEED at `b08323b86`; Step 9 rotation proofs at `d24bc86f8`; Step 10 governance `f0c3083d5` + `f02439ae3` (Langston confirmed, Discord `1574017339178094613`).
- **Status: CLOSED 2026-11-22** — Langston confirmed Step 11 (Discord `1574023561394266153`). Carried item done 2026-11-22: the wide Backblaze key's deletion (§0 item 1) — see §0 item 1.

> **No scaffolding.** Every objective marked YES is live on staging and ran there. OBJ-2 and OBJ-3 are marked PARTIAL because the case they guard has not yet occurred on staging, not because a later batch must switch them on.

> Claims labelled **NOT RE-READ** were not handed to a fresh reader (`workflow-11-completion`, one-pass rule); Langston is their second pass.

---

## 0. OPEN ITEMS — STATED FIRST, EACH WITH ITS HOME

| # | item | why it is open | home (owner) | closes when / fails when |
|---|---|---|---|---|
| 1 | **The old wide Backblaze key `…0001` is retired but NOT deleted at Backblaze** | it is off the server (moved to `/root/b2-wide-key.retired`) and the app runs on the narrow no-delete key `…0003`; deleting an access key needs Kyle's yes in CC-A's chat. KD-107 authorizes it in principle (`pm/DECISIONS.md:131`) | carried item on `SPRINT_TO_LIVE_PLAN.md` row 5a (CC-A) — no new row | **DONE 2026-11-22:** Kyle said yes in CC-A's chat; key …0001 deleted at Backblaze (`b2_delete_key`), `/root/b2-wide-key.retired` shredded, and a fresh authorize with it returns 401 `unauthorized`; positive control: the app's narrow key …0003 still authorizes, without `deleteFiles`. Original condition: closes on Kyle's yes in CC-A's chat, then: delete at Backblaze, shred `/root/b2-wide-key.retired`, and one call showing the key no longer authorizes; fails if the call still authorizes after the delete |
| 2 | **OBJ-2's moved-day alert has never fired on real traffic** | only `cohort_latest` can reach a moved day, and only after about 34 days without a restart (change list :44, O6); proven by fence only | standing; no work placed | closes the first time it fires (or resolves) on staging; fails if a window reaches an archived day and no alert is raised |
| 3 | **No real 365-day warm → cold hop of a disk file yet** | the first disk files reach 365 days in about a year; the cold path was proven on existing B75 objects (AP-5) | the cold rotator's monthly run; no work placed | closes on the first rotator DONE line that moves a `disk-files/` object with no failure row; fails on a `data_archive_cold_upload_failure` row for one |
| 4 | **The cold account's whole daily download is not measured** | the 1 GB/day allowance in `STORAGE_POLICY.md` §4.6 is a design figure; the cold audit budgets only its own read-back (500 MB/day) | stated in `STORAGE_POLICY.md` §4.6; no work placed | — |
| 5 | **The cold-meter-unknown page has never fired** | it triggers on bytes (`server/scripts/b75-cold-audit.ts:280`); "loud, not silent" rests on the fence test `b-disk-file-tiering-3c.test.ts:204` plus the carrier running, not on an organic fire (Langston, Step 10) | standing; no work | — |
| 6 | **`#661` leg 3 — the pages' silence is not evidence** | `disk-tiering-failed`, the cold-upload-failure row, the deferred report and the disk watchdog were forced (O3, O5) or fenced, not seen on organic failure | standing rule; no work | — |

---

## 1. OBJECTIVES — YES / NO / PARTIAL

| objective | result | evidence |
|---|---|---|
| **OBJ-1** daily job moves dated files older than 35 days to WARM through the streaming upload | **YES** | root cron `45 2 * * *`. First good run 2026-11-05: moved 1,709, failed 0, freed 2,097,381,777 B, stopped at the run cap; restore proof checksum OK, `rows_proven` 167,962 (change list :78). Live log at writing: 19 DONE lines; 11-06 moved 3,416, freed 10,827,635,813 B, `stopped_by=none`; 11-07 → 11-22 moved 28 a night, failed 0; 5,573 moved in total. O1 (`c0214c973`, `onMissing` alert) exercised its missing arm: row `eefabc37` (:106) |
| **OBJ-2** readers can tell "moved" from "no data" | **PARTIAL** — built and fenced; cannot fire yet (item 0.2) | `server/services/data-archive/moved-day-check.ts` (1e `8495b8768`), called from the Drift Dashboard aggregator; 8/8 tests. System Manual B64a invariant 3 exception + B64a.6 |
| **OBJ-3** WARM → COLD at 365 days, proven at size | **PARTIAL** — path proven, no real disk-file hop yet (item 0.3) | first proof 2026-11-05 was **UNSAFE** (1.06 GiB resident for a 171 MB object; B2 download cap exceeded, :133) → streaming `uploadColdFile` (3a). AP-5 PASS at `65132e2eb` 2026-11-14: peaks 119.1 MiB and 129.7 MiB, 10.6 MiB apart for very different object sizes (:316). Rotator refuses without free disk; failed upload leaves a durable `data_archive_cold_upload_failure` row |
| **OBJ-4** the 12.66 GB backlog, in capped slices | **YES** | drained by run 2 (2026-11-06, `stopped_by=none`). Disk `/`: 87% used on 2026-11-04 → 42% (30G used, 42G free) at writing — **snapshot, single-moment**; the drop has several contributors (this backlog, the trace in OBJ-5, the log rotation in OBJ-6) and is not attributed to OBJ-4 alone |
| **OBJ-5** Phase 41F-L trace writer removed, its file to WARM gzipped | **YES** | writer deleted `a846b0d08` (rule 18; `DELETED_COMPONENTS_LOG.md`). File moved 2026-11-05: 5,375,150,604 B → gz 170,761,082 B; manifest row `43825287` (:120) |
| **OBJ-6** system logrotate replaces pm2-logrotate (compression had never worked) | **YES** | Step 9 proofs (i)–(iv) all PASS at `d24bc86f8` (:764): archive naming and compression on time, oldest copies deleted on a scratch replica, ownership and modes, archival-health green. **NOT RE-READ** |
| **OBJ-7** one command brings any moved file back, verified; consumers named | **YES** | `b75-rehydrate.ts`: the 2026-11-05 restore proof; its `--out` guard exercised on all four arms (:56 area); `b75-cold-proof.ts`, `b75-cold-audit.ts` |
| **OBJ-8** the carrier: page + archival-health record | **YES** | O5 PASS (a `lock_held` run minted `afd2ab68`); cold-upload-failure row and the deferred report paged via archival-health; archival-health `all_ok=true checks=8`. Cold audit first run 2026-11-15 read back 4/4; latest audit DONE `versions=132`, 8,154,668,948 B, `missing=0`, `failed=0`; lifecycle proof both arms PASS 2026-11-19 (:658). Disk watchdog force-tested (O3, `9c9061de`) |
| **OBJ-9** governance, class `architecture` | **YES** | Step 10 `f0c3083d5` + `f02439ae3`; §3 below |
| **OBJ-10** per-tick price-feed debug lines removed (`#1240`) | **YES** | Langston re-derived it on a whole rotated file at Step 11 (`out__2026-11-22_11-00-26.log`): all six tags 0, the two control tags 561,261 and 773,489; 10.99 h per 1.14 GB file against 2.90 h per 1 GB before and about 7.7 h predicted (:113) |

---

## 2. CI — PER JOB

- **Code ref `73a425a26`:** run `44786881397` — Test Suite success · Build success · TypeScript Check (baseline gate) success · Docker Build success (4/4).
- **Deployed sha `4456f515d`:** run `44819135739` — TypeScript Check (baseline gate) success · Test Suite success · Build success · Docker Build success (4/4).
- **Step-10 sha `f02439ae3`:** run `45015731219` **cancelled** by a later push — a cancelled job is not green. The final governance sha's per-job result is recorded in §2a.

### 2a. Final sha

- **Close sha `3d402195d`:** run `45016704111` **cancelled** at 11:18:59Z by the next push; the next five runs (`45016855440`, `45017422185`, `45018946240`, `45019499956`, `45020412408`) were each **cancelled** in the Test Suite by the push after them (Build, TypeScript Check and Docker Build success in each). A cancelled job is not green.
- **The green that covers this tree is run `45024617078` on `260ff62b3`:** Build, Test Suite, TypeScript Check (baseline gate) and Docker Build all success (4/4), Test Suite completed 13:02:05Z. `260ff62b3` descends from `3d402195d`; the delta is other sessions' commits and touches none of this batch's files except other sessions' rows of the active plan. The Test Suite there grades the amendment-1 fence as CC-C's `e276b3eeb` left it (in both trees).
- archival-health's `checks=8` (OBJ-8) is the deployed reading; it will move when `e276b3eeb` deploys.

---

## 3. GOVERNANCE FILES CHANGED — THE STEP-10 TIER LEDGER, TRANSCRIBED

`CHANGE-CLASS: architecture`

| document | verdict | one line |
|---|---|---|
| the batch `SCOPE` | ✅ | r7 |
| the batch `PRE_AUDIT` | ✅ | present, with its amendments |
| `COMPLETION_REPORT` | ✅ | this file (Step 11) |
| `BATCH_CATALOG.md` | ✅ | entry: why, what it built, verified, not discharged |
| `PHASE_HISTORY.md` | ✅ | plain-language entry |
| `SYSTEM_MANUAL.md` | ✅ | B64a invariant 3 exception + new B64a.6; stale B70 line corrected |
| `SYSTEM_IMPACT_MAP.md` | ✅ | rows 4, 9, 9b; new 9d–9h, 15, 16; cron lines; buffered-rotator and B70 lines (+ `f02439ae3`) |
| `CHANGES_AND_FIXES.md` | ✅ | FIX-2026-11-22-A |
| `RUNNING_ISSUES.md` | ✅ | `#431` closed; `#1233` addendum |
| `POST_AUDIT_ROADMAP.md` | N/A | no roadmap item changed |
| `DELETED_COMPONENTS_LOG.md` | ✅ | trace writer, cold-delete code |
| `ADJUSTMENT_FRAMEWORK.md` | N/A | no tunable trading knob changed |
| `STORAGE_POLICY.md` | ✅ | disk-file section (§4) |
| `PHASE_19_PLAN.md` | N/A | no row there |
| `SPRINT_TO_LIVE_PLAN.md` row 5a | ✅ | Step 10 → 11, this report linked; flips to CLOSED after Langston's confirm |
| shared `MEMORY.md` | N/A | no consensus truth changed |
| `MEMORY_CC_A.md` + mirror | ✅ | position block |
| Langston's `MEMORY.md` | ✅ | via `langston-memory-write` |
| T1 · session task list(s) — CC_A_SESSION_TASK_LIST | ✅ | row 2 set to CLOSED at Step 11; the other three N/A, not mine |
| `workflow-07-verify-cc` skill | ✅ | log-retention facts updated for the new rotation |
| `GOVERNANCE_EXCEPTIONS.md` | ✅ | row 48 retired to `open-retired` (Step 11) |
| `CONDUCT.md` | N/A | no behavioural rule changed |
| `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no asset-class learning |
| `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | no VTS change |
| `Change Lists/B_DISK_FILE_TIERING_CHANGE_LIST.md` | ✅ | Step-10 section |

---

## 4. FINDINGS (each settled, with its disposition)

- **OBJ-3's first cold proof was UNSAFE** (1.06 GiB resident for a 171 MB object; B2 download cap exceeded). The scope's premise that the trace was the largest object the rotator would buffer was wrong: 114 warm objects were larger. DISPOSITION: folded — amendment 3a (streaming `uploadColdFile`) and AP-5, proven at `65132e2eb`.
- **Step 7: the job did not load `.env` when run by cron** (O5's first run exited at once). DISPOSITION: folded — fixed in `ad3948ff8`, Langston PROCEED, deployed.
- **`uploadColdFile` did not retry a B2 5xx** (FINDING-1). DISPOSITION: folded into 3b as a bounded retry (CC-A + Langston under KD-34).
- **A second residue version in the cold bucket** (`context_bridge_log/2026-01`, FINDING-2). DISPOSITION: folded into 3b's listing/cleanup; kept-residue list `data_lifecycle.cold_residue_kept_file_ids`.
- **A refused rotator argument left the run lock behind** (alert `930168e2`). DISPOSITION: folded — arguments now parsed before the lock is taken, with a test.
- **Step-10 log-growth reviews** (`pm2.log`, `level-basis-funnel.jsonl`, `system-health.log` / `system_events.log`, the `rawcap-*.jsonl` set, AP-8 trace families): all **withdrawn on growth**, each citing its measured rate (change list :776-780).

---

## 5. LANGSTON'S NOTES, CARRIED

- Step 10: the cold-meter-unknown page triggers on bytes and has never fired; "loud, not silent" rests on the fence test plus the carrier running (item 0.5).
- Step 11 carry order: retire `GOVERNANCE_EXCEPTIONS.md` row 48 → push → resolve `3486b243`. `gov-planline:B-DISK-FILE-TIERING` fires when this report lands and is cleared by flipping row 5a after his confirm — never acked.

## 6. HONEST RESIDUAL

- No page in this batch has fired on an organic failure; each was forced or fenced (item 0.6).
- The moved-day check and the 365-day disk-file hop have not met their real case (items 0.2, 0.3).
- The disk headroom figure is a snapshot with several contributors, not a measured share for any one objective.
- The cold account's total daily download is not instrumented (item 0.4).
- The wide key was deleted at Backblaze on 2026-11-22 after Kyle's yes (item 0.1).
