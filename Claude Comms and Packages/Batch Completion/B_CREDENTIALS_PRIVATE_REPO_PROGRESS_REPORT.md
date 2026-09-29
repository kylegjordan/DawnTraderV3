# B-CREDENTIALS-PRIVATE-REPO — PROGRESS REPORT

## OPEN — OBJ-1 (the crew login), the GB-8 bridges increment and OBJ-6 (the flip)

**Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1023` · **Change-class:** `non_architecture` · **Plan:** `SPRINT_TO_LIVE_PLAN.md` §0 (Infra plate, "RUN NOW") · **Scope:** `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_SCOPE.md` · **Pre-audit:** `…/B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md` (Langston PROCEED WITH CONDITIONS 2026-09-29T17:30Z, recorded §6 at `8309ba598`)

> ⚠️ **Why a progress report and not a completion report:** the batch is not at a close. It ships in increments; OBJ-4a has run Steps 3-10, and the objectives below are still open. This file carries the batch up to now so no reader needs the chat, and it becomes the completion report at close (`workflow-10-governance`).

---

### 1. WHAT THE BATCH IS FOR
Make the `kylegjordan/DawnTraderV3` repository private (it carried the live staging password in 348 files, `#1023`) **without cutting off** Langston, Coltrane, the Helsinki backup mirror, CI or any session: a server-held crew login instead of password literals (OBJ-1), no password in the repo again, document-only pushes skipping CI while the deploy gate still finds a green check, every anonymous GitHub reader moved to a keyed or local path (OBJ-4 / OBJ-4a), then the flip (OBJ-6). Kyle's decisions: D1 = yes (all four sessions + Langston + Coltrane use the crew login), D2 = no (the backups folder stays; private protects it).

### 2. WHAT HAS SHIPPED — OBJ-4a, Langston's pinned reader (Steps 3-10)
Full record, every step with its evidence: `Claude Comms and Packages/Change Lists/B_CREDENTIALS_PRIVATE_REPO_OBJ4A_CHANGE_LIST.md`.
| step | evidence |
|---|---|
| 3 · implementation | `dt-review`, `dt-backup-sync.sh`, `deploy.sh` rewritten; the bridge's review note; Langston's files r1→r7. Three fresh-reader rounds (the cap): 40 / 33 / 27 findings, all fixed, each hit re-derived with a CONTROL that fails on the version before. Code at `2767d358a`. |
| 4 · Langston review | two gates: 4a-1 (reader) APPROVED WITH CONDITIONS 20:45Z, 4a-2 (installer + backup gate) APPROVED WITH CONDITIONS 21:14Z, no blocker; conditions folded at `3b7b46f59` + `445b6a505`; **"BOTH GATES' CONDITIONS MET … Step 4 is CLOSED — APPROVED"** 21:47Z. Suites from the committed blobs: dt-review 95/95 · dt-backup-sync 55/55 · deploy.sh 60/60 (root run pasted in the change list). |
| 5 · CI | run `36633724430` on `445b6a505`: Build, TypeScript Check (baseline gate), Test Suite, Docker Build — all success, read per job. (CI does not run these shell scripts; the suites do.) |
| 6 · install | Helsinki, 2026-09-29 21:52:57Z, `deploy.sh --only readers` from the operator-checked installer (blob `cf280354`); re-checked independently; first backup-gate runs PASS (re-hashed) 22:00 / 22:15 / 22:30. Rollback copies `/root/rollback-credentials-20260929T215241Z/`. Langston's files r6 5/5 (the fifth through `langston-memory-write` after he reconciled his own `MEMORY.md`), r7 at Step 10. **The bridges group is NOT installed** (GB-8 increment). |
| 7 · first-pass verification | the scope's (a)-(e) on the live reader, all as specified (`17b6ecc3a` / `1d3cd9e0f`); the off-branch control branch created, checked, deleted, and seen pruned at 22:30. No staging UI surface. |
| 8 · Langston verification | **CONFIRMED** 22:30Z — re-derived (a)-(e) himself on the live binary; (d)'s fetch-failed wording is the one string he holds on reported fact (its branch he exercised). |
| 9 · iterate | nothing failed; nothing to iterate. |
| 10 · governance | this increment's ledger below (commit + this file); docs listed there. |

### 3. WHAT IS STILL OPEN, AND WHAT CLOSES IT (written before the work)
| objective | closes when | fails if |
|---|---|---|
| **OBJ-1 — the crew login** (dt-api / dtapi / dtmint, server-held) | every session, Langston and Coltrane reach the authenticated API and the agents' staging browser session refreshes through the crew login, with no password literal anywhere; the agents' stored session **stops refreshing from 2026-09-30 04:40Z and lapses 2026-10-06 04:40Z** — the hard edge | any reader still needs a password in the repo, or the refresh fails on 10-06 |
| **GB-8 — the bridges increment** | `deploy.sh --only bridges` installs the new REVIEW SOURCE note with **`discord.py` pinned** (Langston's rider), in a window with no queued review; the next invocation's journal shows the stamp; `#463` closes | the bridges run an unpinned upgrade, or the live note still sends him to raw GitHub at the flip |
| **OBJ-6 — the flip** | the repo is private; an anonymous raw read returns 404 (scope check (f)), `#1043` closes, and every reader still works | any reader breaks, or anonymous reads still return 200 |
| the rest of the scope (CI docs-only skip, password-literal removal, the other readers of OBJ-4) | as the scope's objective table states | as stated there |

### 4. UNPROVEN, STATED AS UNPROVEN
- The `DEGRADED: fetch failed (…)` wording on the live binary is proven by my Step-7 run (root namespace) and by the committed suite; Langston holds that one string on reported fact.
- `grep`/`ls` serve stored bytes, not re-hashed — accepted by Langston as a stated residual (every read says so); nothing behind the mirror's head is object-checked by the backup gate (its header states that reach).

### 5. GOVERNANCE FILES CHANGED SO FAR (OBJ-4a Step 10)
Scope (STEP-3 AMENDMENT + Step-4 texts) · System Impact Map · Langston Architecture · `CLAUDE.md` (the §7.1 read-path line) · the CLAUDE.md rule history · Running Issues (`#920` closed, `#1043`, `#463`, `#1023`, `#1057`) · the sprint plan and the after-live list · my session task list · Mistake Patterns · my memory file · Langston's `MEMORY.md` and four of his files (r6, r7). **The tier ledger for this increment is below, transcribed from the governance commit.**

#### OBJ-4a GOVERNANCE LEDGER
CHANGE-CLASS: non_architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | BLOCKED — `#1023` (OBJ-1, GB-8, OBJ-6 open) | the batch's row lands at close; this increment is in the progress report |
| T1 | `PHASE_HISTORY.md` | BLOCKED — `#1023` (OBJ-1, GB-8, OBJ-6 open) | the history entry lands at close |
| T1 | `SPRINT_TO_LIVE_PLAN.md` — my rows | ✅ | the batch row says OBJ-4a done, next OBJ-1; the reconcile-verb row takes Langston's two rulings |
| T1 | `PHASE_19_PLAN.md` | N/A — not a P19 batch | a letter-named batch (`B-…`); its old row 4.51a is history |
| T1 | shared `MEMORY.md` + `MEMORY_CC_INFRA.md` | ✅ | my position moves to OBJ-1; the shared file holds no read-path statement, so it is unchanged |
| T1 | the batch `SCOPE` | ✅ | the STEP-3 AMENDMENT gains the Step-4 texts and the discord.py pinning home |
| T1 | the batch `PRE_AUDIT` | ✅ | the Step-2 record (§6, `8309ba598`) stands; unchanged this increment |
| T1 | the `COMPLETION_REPORT` | BLOCKED — `#1023` (OBJ-1, GB-8, OBJ-6 open) | the progress report carries the batch until it converts at close |
| T1 | the `Observation` column | N/A — the scope names no observation window for OBJ-4a | its check (f) runs at the OBJ-6 flip, not over a window |
| T1 | the four session task lists | ✅ mine / N/A — not mine ×3 | my NOW line: OBJ-4a done, OBJ-1 next with its 09-30 and 10-06 edges |
| T1 | Langston's `/home/langston/MEMORY.md` | ✅ | the #1043 line through `langston-memory-write` says the replacement is live; loaded total 171,794 → 171,693 across r6 + r7 |
| T2 | `SYSTEM_MANUAL.md` | N/A — nothing under `server/`, `client/`, `shared/` changed | its stale `:10122` CI line belongs to this batch's CI objective |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | the reader, mirror and installer rows rewritten; the fetch lock and success stamps added; the bridge note flagged not-yet-live |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#920` closed; `#1043` replacement live; `#463` fix path; `#1023` progress; `#1057` third instance, his reconcile, his two rulings |
| T2 | `CHANGES_AND_FIXES.md` | N/A — no trading-system bug or risk entry | the changes are reviewer tooling on Helsinki |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A — no phase-level change | the work sits on the sprint plan's §0 plate |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A — no parameter changed | no DB-governed setting touched |
| T2 | `AUTHORITY_BASELINE.md` | N/A — no constitutional change | the review gate itself is unchanged |
| T2 | `STORAGE_POLICY.md` | N/A — no retention tier changed | the mirror's reflog-on is backup configuration, not a data tier |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A — its xStock working list reviewed, no item touched | every item there is trading-pipeline; this increment is Helsinki tooling |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A — no asset-class learning | nothing asset-class related changed |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A — the method is unchanged | the reviewer still reads at a ref with no working copy; only the instrument changed |
| T2 | `LANGSTON_ARCHITECTURE.md` | ✅ | §6 read path rewritten with its before, §7's table, a change-log row |
| T2 | `CLAUDE.md` / `CONDUCT.md` | ✅ `CLAUDE.md` / N/A `CONDUCT.md` | the §7.1 read-path line now names `dt-review show`; no behavioural rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | ✅ | the entry for the §7.1 line, in the same commit |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A — the readers install retired nothing | staging copies retire only when the bridges or notices groups run |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | `shell-mangled-text` (a Git Bash path rewrite), `wrong-object` ×3, `verification-weaker-than-claim` |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A — no exception granted | nothing waived |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A — the ack/resolve process is unchanged | the backup gate pages Discord, not the alert queue |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A — columns and fields unchanged | the card moved; the board did not |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A — the daily check did not run in this session | rule 21's run is a scheduled task |

