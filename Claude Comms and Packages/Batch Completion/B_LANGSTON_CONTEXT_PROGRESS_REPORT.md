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

## 4. WHAT IS UNPROVEN
- **Chunk 1 on a schedule.** Every live run so far was started by me. Criterion A is the test.
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
