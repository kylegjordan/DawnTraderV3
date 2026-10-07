# B-CENSUS-OWNERLESS-TRIAGE — STEP 7 VERIFICATION (CC-A, 2026-10-07)

**No UI surface, stated:** this batch changes governance documents and the governance checker, which has no screen. The evidence is the live checker process and the census run with the deployed code, on staging.

## Deploy (Step 6) — the checker deploys itself
- Landing commit `82775ef9f` (P1 + the §6 recount, one commit, Langston Step-4 C2). CI: run `37575898610` at `82775ef9f` was **cancelled** (superseded by a push 30 s later); run `37575930308` at `862436977` — which contains `82775ef9f` — **4/4 success per job** (TypeScript Check, Test Suite, Build, Docker Build).
- Staging `/opt/governance-checker/DawnTraderV3`: the unit's `ExecStartPre` fetch + `merge --ff-only` merged it at **05:38:30Z**; clone at `9ab39a45a`, `merge-base --is-ancestor 82775ef9f HEAD` true; the widened pattern present once in each of `checker.mjs` and `census.mjs`.
- **The PROCESS ran the new code** (not just the file): `journalctl -u governance-checker` 05:38:40Z — `planline: enabled ref=9ab39a45a… rows4=285 rows5=3 ids=165 graded=9 legs=9 fail=0 malformed=0`. Before P1 the same line read `rows4=271 ids=152` (preview at `0c8ef5da2`).

## Objectives
| obj | result at the deployed ref `9ab39a45a` | instrument |
|---|---|---|
| OBJ-1 | 61 triage lines, 79 tokens resolve, 7 measured, **0 unresolved — measured at `86e39dc47`**. ⚠️ **Langston Step 8 C1: by the deployed ref three line-pinned tokens had DECAYED** (`#406` `active-execution-engine.ts:5486`, `#418` `:3791`/`:4111` — the code moved down the file the same day). Fixed in the instrument, not the citations: `resolve1n.py` now resolves each line-pinned token at the sha its line numbers were STAMPED with, requires the needle to still exist somewhere in the file at the ref, and lists line-moves apart. At `035d0f7e5`: **79 resolve, 7 measured, 0 unresolved; 3 moved** (those three, still present); five bad tokens flagged. Also runs from any clone now (no hard-coded repo path). | `resolve1n.py <ref> --from-ledger [--bad-control]` |
| OBJ-2 | **0 of the 60 unplaced; 0 of the 60 ownerless; the census lists show `[owner ? 0]` — per LIST, not ledger-wide** (Langston Step 8 C2: 48 open issues are placed but have no owner the census reads, so no list shows them — filed `#1167`, row 1s). Of the 60, 32 open (28 closed/withdrawn). Ledger-wide unplaced = 7: #620 #667 #908 #913 #936 #945 #1165 — none in the 60. **Control at `be41f8585`, population = the 55:** 55 unplaced, 55 ownerless (ledger-wide there: 107 unplaced, 103 ownerless; at `9ab39a45a` ownerless-by-any-source is 48, and the 55 that moved are exactly the scoped 55 — Langston, enumerated). | `census.mjs --ref HEAD --dry-run` and `placement()` on the box clone |
| OBJ-3 | three hand-over posts by number, ~04:50Z; CC-B, Infra and CC-C replies on record | Discord |
| OBJ-4 | `#439` `#575` `#596` `#532` → CC-B (agreed by NEW Claude); `#613` → Infra Claude (agreed; discharge test measured at `da54e6617`) | the entries |
| OBJ-5 | self-contradicting sub-list **(0)** — `#532` gone | census dry run |
| OBJ-6 | Langston's 10 (8 CLOSED/WITHDRAWN): **10/10 land**, incl. `langston_queue.py` diffed against the live bridge copy | his Step-4 ruling |
| OBJ-7 | §6 at the landing commit: `recountS6` diffs `[]`, stated Total 283 = cell sum 283 | `recountS6` |

## No new alert from the widened grading
`metadata.dedupe_key` starting `gov-planline`, created since 05:30Z: **0**. **Control:** the same filter finds the 3 such rows ever raised (latest `gov-planline:B-WAKE-ARM-EXCLUSIVE:s4`, 2026-10-02). (A first pass keyed on a top-level `dedupe_key` returned 0 for BOTH — the field lives in `metadata`; the control caught it.)

## Langston Step 8 (2026-10-07): CONFIRMED, two record conditions — both above. Records: P1's benefit is prospective (all 14 newly visible rows are QUEUED with no report, so `graded` stayed 9); row `2a0f`'s `R-` id is enrollment-blind (folded into `#1116`); the landing commit's range `2a0b..2a0j` over-reads by one (`2a0g` does not exist — 14 rows, not 15).
