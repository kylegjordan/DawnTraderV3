# B-PLAN-CURRENCY-CHECK — census 2026-W47 worklist: handover record
**Source:** weekly census alert `2424d68f-1a00-4670-9a6f-7331cc709082`, graded at `4cc6ff94b5d351577dee09f7a76c56dbf4c9af87` against previous ref `b64efe052248b50df044a959c18e73a5bf39b802`. The checker's sealed box file is committed beside this record as `B_PLAN_CURRENCY_CHECK_CENSUS_2026-W47.json`; its local SHA-256 exactly matches the source file on staging: `1ecd050a704583d99b6ca84a54217c578a4834dd17003b266410c594d4002da3`.

**Method:** every listed id was re-read at the handover head (`62abe510f`, 2026-11-16) and, where the census's own code decides the verdict, run through that code (`census.mjs` `placement()`, `idsIn`, `recountS6`; `config.mjs` `batchIdToFileRegex`). Positive control for the recount: `recountS6` at the graded ref reproduces the box file's (g) numbers exactly (CC-B 97/96, CC-INFRA 54/55, total 323/323).

⛔ **KYLE'S RULE (2026-10-19, restated 2026-11-04) APPLIES:** no new batch or plan row without his agreement; findings go to their owners or PM to slot. This record adds no plan rows.

## THE SETS
| issue | owner at handover |
|---:|---|
| `#237` | CC-B |
| `#1165` | CC-B |
| `#1255` | CC-B |
| `#620` | CC-C |
| `#1256` | CC-INFRA |
| `#1258` | CC-INFRA |
| `#1259` | CC-INFRA |

## (a) completion reports — 2 at the graded ref, both NO WORK
- `B_GUARDRAIL_FAIL_CLOSED_COMPLETION_REPORT.md` (CC-C) — "in no plan line": its plan line is `PHASE_19_PLAN.md` row `4.a`, which the census does not read, and that row already reads ✅ CLOSED 2026-11-14 with the report named. No work.
- `B_TOKEN_WATCH_LIQ_SHED_HOTFIX_COMPLETION_NOTE.md` (CC-INFRA) — "not closed in §0": the §0 line is the parent `B-TOKEN-WATCH` (PARKED, research after live). `batchIdToFileRegex('B-TOKEN-WATCH')` matches the sub-batch's file by design (separator-led suffixes match), the same match Infra Claude explained for the storage sub-batch at W46. The parent is correctly not closed. No work.

## (b) unplaced OPEN issues — 7 at the graded ref
| issue | owner | why the census reads it unplaced (re-derived) | action owed |
|---:|---|---|---|
| `#237` | CC-B | U2. The whole entry is ONE line, so the census reads the entire paragraph as its HOME line; `idsIn` finds `P19-B4a` (the origin batch) and `B79.0n` (a log tag), and both glob-match completed reports. `P19-B8.5` itself matches none, and is in no list the census reads (its home is `PHASE_19_PLAN`). W46's rewrite could not change this. | Owner decision: put the `HOME:` on its own line, and either accept it reads as unplaced while its home is the Phase-19 plan, or place the NOT-NULL flip somewhere the census reads. |
| `#620` | CC-C | U4. Row `87a` names it as `+ item \`#620\``; the ruled homing form is `+ #N` with nothing between (`HOMING_FORM`, `census.mjs` R1-Q13 (c)), so the word `item` defeats it. The row is the right home. | Reword the note to `+ \`#620\` (item: …)` — handed over since 2026-09-30. |
| `#1165` | CC-B | U4. Row `2a0f` carries `` `#1165` `` in its REPORT cell, which is not a placing cell; the HOME line names `R-XSTOCK-PATTERN-TYPE`, which `idsIn` does not read as a batch id. The row is the right home. | Add `+ \`#1165\`` to row `2a0f`'s note cell. |
| `#1255` | CC-B | U5. HOME `B-ALERT-INSERT-CONTRACT` "CC-B pre-sprint list" — the id appears once in the plan, in the CC-B pre-sprint list's heading prose (line 162, added `b4888b869`), which is not a table row the census reads; it is in no §0a item, §4 row or after-live line. | Owner: give it a §0a table item (KD-78 slotted it), or correct the HOME. |
| `#1256` | CC-INFRA | U1. Disposition #2 "an item on whichever agreed Infra batch next touches either size watch" names no batch, so there is no HOME line to read. | Owner: name the batch, or record it as waiting for one. |
| `#1258` | CC-INFRA (filer; census reads owner ?) | U1. Folded into `B-TOKEN-WATCH-FOLLOWUP-MEMORY` with no `HOME:` line and no owner line. | Add `HOME: B-TOKEN-WATCH-FOLLOWUP-MEMORY, owner Infra Claude, …`. |
| `#1259` | CC-INFRA (incident lead; census reads CC-C from the ANALYST addendum) | U1. A decision item by design (Kyle's Supabase ban setting; the stopped cron lanes are ANALYST's under `#691`). | None for placement; the decision sits with PM for Kyle. Close or home it when Kyle answers. |

Handed-over check: 169 handed over, 93 placed since, 73 closed since, 3 still unplaced (`#237`, `#620`, `#1165` — above), 0 vanished.

## (c) dated homes — 0 (`#696` excluded by name)
## (d) id-less plan rows — 0 (7 excluded)
## (e) ordering references that name no earlier row — 0 of 69
## (f) not-closed plan lines with a report — 0 new of 5 (all five as at W46)

## (g) §6 ownership recount — CORRECTED IN THIS COMMIT
One cause: row `172` (`B-TEC-PRIME-BOOT-RACE`) moved from Infra Claude to CC-B under KD-82 (`9b9c41d62`) without a recount. §6 now reads CC-B 97, Infra Claude 54 (CC-A 89, CC-C 83 unchanged; total 323). `recountS6` on the corrected file: agree, cell sum 323 = stated total 323.

## Reused issue numbers — 8, unchanged
`#559 #561 #642 #646 #648 #660 #741 #921`, not renumbered blind.

## Handover state
Every item in THE SETS is handed over in one Discord post to CC-B, CC-C and Infra Claude, naming each item and the action owed. The census alert is resolved with this commit as evidence.
