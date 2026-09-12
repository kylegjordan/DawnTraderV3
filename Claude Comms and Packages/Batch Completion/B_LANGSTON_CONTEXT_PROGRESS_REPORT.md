# B-LANGSTON-CONTEXT — PROGRESS REPORT

**⏳ OPEN — waiting on: (1) the scheduled runs of 2026-09-12 that close chunk 1's Step 7; (2) chunk 2 — the single writer (P-6b), composition from parts (P-2), Langston's own retrofit, and eviction (P-1b).**
change-class `non_architecture` (`B_LANGSTON_CONTEXT_SCOPE.md:3`) · owner Infra Claude · plan rows 2.8a / 2.8b / 2.8c.

> ⚠️ **WRITTEN LATE, AND THAT IS A GAP IN THIS BATCH.** Increment 1 was verified at Step 7 on 2026-09-09 and reported as "a progress report, not a completion" — but no file was written. Measured on 2026-09-11: no file in `Batch Completion/` named the batch, while the same search found `B-WAKE-LEAD-NAME`'s report. **§9.4 disposition 1 — folded into increment 2, chunk 2.** The evidence below is cited to the pre-audit sections and commits where it was captured at the time, not reconstructed.

## 1. WHAT THIS BATCH IS FOR, AND WHAT HAS SHIPPED
**Purpose (Kyle, 2026-09-03):** keep the benefits of Langston's stateless reviews while letting him carry the context he needs. Concretely: his always-loaded files stop growing without bound, his own decision store is protected, his rulings can reach the rest of the system without exposing his store, and every mechanism added can be seen working.

| scope objective | where it went in the plan | state |
|---|---|---|
| OBJ-1 retire the closure-block limb of §10.b | killed as written by Langston's BLOCKER-1 (pre-audit §8); replaced by **P-1a** (no batch closes carrying an undischarged obligation) and **P-1b** (evict on obligation discharged, never on batch closed) | P-1a built (`bd416e7dd`, a checker predicate); P-1b **pending**, last in increment 2's order |
| OBJ-2 eviction becomes structural | **P-2** composition from parts + **P-6b** the single writer + Langston's retrofit | **pending** — chunk 2 |
| OBJ-3 govern his self-memory store | **P-3** | **built** — daily backup verified by reproduction, manifest in his reach, `LANGSTON_ARCHITECTURE.md` §4 |
| OBJ-4 where the ledger and standing notes live | **P-4**, revised by Langston r7: the ledger stays in `MEMORY.md` until `PHASE_19_PLAN` 2.8c; this increment carries only the closing-boundary rules, as writer checks inside P-6b | **pending** with P-6b |
| OBJ-5 daily size/staleness watch | **P-5**, the monotone ceiling (§18) | **built** — `langston-size-watch`, daily 05:40Z; crash guard added in increment 2 |
| OBJ-6 his rulings useful to other sessions | de-scoped by Langston's BLOCKER-3 into **P-8**, promotion of impersonal patterns into `MISTAKE_PATTERNS.md` | **built** (`439f81349`). Its Step-7 check on 2026-09-11 found the privacy leg FAILING (§20.6) — which became increment 2's chunk 1 |
| OBJ-7 usage instrumentation | **P-7** | **built first** (`57216944d` onward) |

## 2. EVERY STEP COMPLETED, WITH ITS EVIDENCE
**Increment 1**
- Step 1 scope `276be80ef`.
- Step 2 approved 2026-09-04 20:36Z with four conditions (pre-audit §12).
- Step 4 rounds r1-r6 — change list `c0586fab8` through `bb63c3b41`.
- Step 7 findings fixed at `3010027d4`, `ed0ad85bb` and `91ec9a543` (unknown flags now refused).
- The ceiling was adopted and the A/B struck (§18).

**Increment 2**
- **Step 2:** approved with conditions (§20-§21, `6b3248a69`, `fc36cb190`).
- **Step 3:**
  - route 3(c) — four tools stop leaving world-readable prompt files (`deec5fc0b`);
  - chunk 1 — the ledger reader refuses disagreeing sources, the search index is created private to Langston, and the privacy check itself (`e907aa608`).
- **Step 4 for chunk 1:** rounds r1-r4 (`a5273ad6d`, `18c134399`, `a3eac7b81`). Langston approved the Step 6 order at `a3eac7b81` with three conditions.
- **Step 5:** CI 4/4 per job on `d03268d63`, which contains `a3eac7b81`.
- **Step 6 for chunk 1, executed 16:24-16:31Z (§21.10):**
  - `dt-deploy a5273ad6d`;
  - eight files installed on Helsinki, each matching the reviewed ref;
  - first live run EXPOSED, 23 findings;
  - the fences closed;
  - a real rebuild left the index private to Langston;
  - second live run PASS, and its alert was resolved by the check's own identity.
- **Langston APPROVED Step 6 at 16:53Z** (§21.11) with FINDING-8 (folded at `e01e56765`) and FINDING-9/-10, which became P-6a.1/P-6a.2.
- **Chunk 2 part 1** (P-6a.1, P-6a.2): Step 3 at `624cd1733`, CI 4/4 on that commit (run `34625894318`); Step 4 dispatched with this report.

## 3. ⛔ PRE-REGISTERED CLOSE CRITERIA — written before the data arrives

**A. Chunk 1, Step 7 — a set QUANTITY: one run each of four scheduled units on 2026-09-12. None may be started by hand (Langston's condition 3).**
| unit | PASS | FAIL |
|---|---|---|
| `langston-memory-index` 04:10Z | `Result=success`, and `records.jsonl` mode `600` with an mtime from that run | not run, not success, or any other mode |
| `langston-size-watch` 05:40Z | ran (exit timestamp on 09-12) with `Result=success` — exit 0 or 1, since BREACH is a correct outcome of this unit | not run, or a failure result |
| `coltrane-size-watch` 05:51Z | same | same |
| `langston-privacy-check` 06:00Z | verdict `PASS`, both controls `true`, exit 0 | `EXPOSED`, `INSTRUMENT`, not run, or a failure result |

**B. The batch — the increment's outcome measure, stated by the plan at §20.3 (P-1b):** `langston-size-watch --status` moves from BREACH to within ceiling **with the ceiling unchanged**, after eviction of the parts Langston marks. **If eviction of his marked parts does not cover the overage, that is reported as a result, not a delay.**
- Measured for the record: loaded set 147,635 B against 143,856 B, BREACH by 3,779 B (Langston, 2026-09-11 17:38Z).

## 3.P2 — P-2 (COMPOSITION) MIGRATED + INSTALLED 2026-09-12 (Langston Step-4 APPROVED at 2019d7bf7, two robustness fixes after)

The writer composes MEMORY.md from `/home/langston/memory-parts/`; a direct write targets the part and MEMORY.md is recomposed, with a three-way rollback (part + MEMORY.md + compose-state) on a failed delta. Langston's two blockers (guard the parts against out-of-band edits; predicate the retarget on the parts, not the state, so a lost state file fails closed) and FINDING-1 (refuse a composed-file paste) were folded and re-proven. Migration: `00-legacy.md` = the live file byte-for-byte; `--compose` -> MEMORY.md = body + a 202 B stamp, strip-stamp byte-identical to the original, retractions 9 -> 9, state seeded. Installed writer `4acc9e41c` (067c971c) 750 root:langston, self-test PASSED, comparator 17/17. Two fixes found during the live migration: `main()` no longer reads stdin for `--compose` (it hung 10 min over ssh with no EOF - my fixture-not-process miss, now case C8) and an unreadable parts-dir refuses with a sentence. Recipe (workflow-10, both homes) updated to fetch the part. **NEXT: Langston's retrofit (splits 00-legacy into parts); the batch that creates part #2 must land `--part`. Then P-1b eviction.** Suites: compose 8/8, retarget 15/15, self-test PASSED.

## 3.A.CLOSE — CHUNK 1 CLOSED 2026-09-12 (Langston Step-8 CONFIRMED 06:15Z)

Langston re-derived condition 3 himself — `ExecMainStartTimestamp` == the `.timer` `LastTriggerUSec` for all four units (04:10:01 / 05:40:05 / 05:51:32 / 06:00:35), the strongest available evidence and stronger than the static `TriggeredBy`; he read the privacy-check run log directly (644 root:root) and reproduced 6 of 17 comparator pairs by hand (6/6 MATCH, negative control DIFFERs). Two record corrections, folded above, neither moving the verdict: the 06:01 timer run has two controls not three (the third is the 06:05 dry-run on the newer copy — wrong-object on my part); the size watch is installed, not comparator-covered. The self-test 73/0 and dry-run PASS remain RULED ON REPORTED FACT (750 root:root, he cannot run it), disclosed in §4. **Next: P-2 composition.**

## 3.A — CRITERION A: MET 2026-09-12 (all four scheduled units, timer-triggered, none by hand)

| unit | fired | result | at the object |
|---|---|---|---|
| `langston-memory-index` | 04:10:18Z (timer) | success, exit 0 | `records.jsonl` 600 langston:langston, mtime 04:10:18Z |
| `langston-size-watch` | 05:40:08Z (timer) | success, exit 1 | exit 1 = BREACH, a correct outcome (`SuccessExitStatus=0 1`); loaded set over ceiling, the known state |
| `coltrane-size-watch` | 05:51:32Z (timer) | success, exit 0 | — |
| `langston-privacy-check` | 06:01:06Z (timer) | success | verdict **PASS**, its **two** controls `reader_reads_own_folder`/`reader_refused_token_file` both true, 0 findings. ⚠️ CORRECTED (Langston Step-8): `a3eac7b81` has TWO controls; the third, `account_database_enumerable`, belongs to the 06:05 `--dry-run` on the newer `ac38b350d` below — I first mis-attributed it to this timer run (wrong-object). Pre-registration correctly said *both controls*, which this run satisfies |

Every unit's `TriggeredBy` is its own `.timer` — none was started by hand (Langston's condition 3). The 06:00Z run executed on the INSTALLED `a3eac7b81`, which has no directory-owner test, so the 20:12Z owner change could not have moved its verdict — the PASS stands on the pre-registered instrument.

**Post-06:00Z installs (chunk 2), done 06:05:54Z, GATE_FAIL=0:** the newer privacy check (`ac38b350d` — dec888f33 owner-split + the root-expected-fence fix) at 750 root:root and the size watch (`9ff25adc9`) at 755 root:root (installed and `--status`-exercised, but NOT comparator-covered — `verify-agent-artifacts.py` excludes it by its own comment), both sha-gated; privacy-check self-test 73/0, `--dry-run` PASS with MEMDIR root-owned (no DRIFT), size-watch `--status` readable by langston. `verify-agent-artifacts.py`: **17 MATCH / 0 DIFFER / 0 missing**.

## 4. WHAT IS UNPROVEN
- **Chunk 1 on a schedule.** ✅ SETTLED 2026-09-12: criterion A met, all four units timer-triggered (`ExecMainStartTimestamp` == the timer's `LastTriggerUSec`, four for four — Langston re-derived). This line's old claim that every live run was hand-started is now stale; the scheduled runs are the proof.
- **The self-test legs of the privacy check are RULED ON REPORTED FACT for Langston, permanently.** The tool is root-only, so he cannot re-run them.
- **The writer, composition, retrofit and eviction do not exist yet,** so OBJ-2 and the outcome measure are entirely unproven.
- **The group-ownership assertion (P-6a.1) reaches only ENUMERABLE accounts.** Non-enumerating NSS sources, per-user ACLs and live process credentials are outside it. The attempted reads as the reader account remain the check for access by that account.

## 5. GOVERNANCE FILES CHANGED SO FAR
- **`SYSTEM_IMPACT_MAP.md`** — the `langston-privacy-check` section, and the actor list replaced by a pointer.
- **`PHASE_19_PLAN.md`** — row 2.8 corrected in place; rows 2.8a / 2.8b / 2.8c placed.
- **`RUNNING_ISSUES.md`** — `#979` and `#998` amended; `#1040` found (now `B-WAKE-LEAD-NAME`).
- **`LANGSTON_ARCHITECTURE.md`** — §4, P-3.
- **`DELETED_COMPONENTS_LOG.md`** — four twin unit files removed.
- **`comms-infra/systemd/README.md`** — install rows; the check's permissions corrected to 750.
- **`.claude/skills/workflow-04-code-review/SKILL.md`** — the three-field dispatch header (`bd416e7dd`).
- **Both memory files, at every step boundary.**
- ⛔ **Not yet — they land at close:** `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, the completion report (a conversion of this file) and Langston's `MEMORY.md` row.
