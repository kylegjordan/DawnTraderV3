# B-ALERT-ACTOR-ALLOWLIST (#987) — COMPLETION REPORT

**Batch:** `B-ALERT-ACTOR-ALLOWLIST` · **Owner:** CC-B (Claude New) · **change-class: `non_architecture`** (declared at Step 1, unchanged through OBJ-7) · **Closed:** 2026-09-02
**Reviewed code:** `dbcca4a9f` + `448084d13` (compare `0dc49be06..448084d13`) · **Deployed:** `fa563982c8e8db08b40f509b97326ec34ac76b57` at 2026-09-02T21:05:50Z via `dt-deploy --by CC-B` (previous sha `093d1878f` — the rollback target)
**CI:** run `33682325747` at `fa563982c` — TypeScript Check (baseline gate) ✅ · Test Suite ✅ · Build ✅ · Docker Build ✅ (per-job; `448084d13` is an ancestor and the six code files are blob-identical)
**Langston:** Step 1 APPROVED `8c93a2fa3` · Step 2 APPROVED `7ddbac0d9` (+OBJ-7, six conditions L1–L6) · Step 4 APPROVED at the pinned compare (four conditions) · Step 8 CONFIRMED 21:16Z (Review = Approved; two findings folded — change list §10) · Step 11 <STEP11>
**Records:** scope r4, pre-audit r4, change list r3 (§9 carries the Steps 5–7 evidence), `scripts/batch-verify/b-alert-actor-allowlist/` (capture, compare, verify scripts), captures on staging `/home/deploy/p987-pre.json` / `p987-post.json`.

## NOTHING LEFT OPEN IN SCOPE. Two follow-ons placed, both CC-B, neither a deferral of this batch's objectives:
- **`B-DEPLOY-ACTOR-ALLOWLIST`** — `PHASE_19_PLAN` 2.4a (#656 residual): the deploy record's `--by` is validated by shape only (`dt-deploy.sh:81`), the same defect one namespace over. Closing condition: the deploy record stores a canonical actor and refuses anything else. Failure condition: a `dt-deploy` with `--by cc-session-2026-09-02` succeeds.
- **`B-ALERT-QUEUE-INTEGRITY`** — 2.4b (#647 named home): lock-free watchdog append, lossy rewrite, poller-vs-heartbeat classifier drift. Closing condition: one lock discipline for every writer and one classifier. Failure condition: a row appended during a library rewrite is lost.

## 1 · WHAT IT WAS FOR
The alert file's owner record (`acknowledged_by`, and the claimed half of resolve provenance) was free text: **782 rows, 75 distinct strings**, most of them the dated `cc-session-<date>` form that `CLAUDE.md` §10.5 step 3 itself mandated from 2026-05-17 — 26 days before the session roster existed. An identity that identifies nobody defeats owner-routing, re-surface escalation and every "who has this" question. The batch replaces it with ONE canonical actor table applied at both write paths, refuses everything else, and never rewrites history.

## 2 · OBJECTIVES — every one green, with its evidence
| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | one canonical actor table, tagged roster/machine/human, one reason each | **YES** | `system-alerts.ts:186-272` `ALERT_ACTORS` — 9 entries; test "every member has a tag and a reason" |
| OBJ-1b | a NAMED exact-string normalisation table storing the canonical | **YES** | `ALERT_ACTOR_NORMALISATION` (7 history spellings + `kyle-direct`); the 60-char `langston (transport: …)` string is REFUSED (L3) — test + live NEG 2 |
| OBJ-2 | both write paths refuse before `withLock` | **YES** | `ackAlert :533`, `resolveAlert :559` call `assertAlertActor` before `ensureFileExists`; test "refuses before touching the file or the lock"; live NEG 1/3 (one line, exit 1) |
| OBJ-2b | API 400 with the set | **YES** | `routes.ts:6762-6804`; live `POST …/acknowledge {"by":"cc-session-2026-09-02"}` → 400 `Unrecognised actor`, `actors` 9 |
| OBJ-2c | UI select over the served set, default kyle | **YES** | `GET /api/system-alerts` → `actors[]`; page select 9 options; ack as kyle → row `6e7b27a6` `acknowledged_by kyle` (Claude-in-Chrome, no login) |
| OBJ-3 | soak verifier passes a fixed name; PID into the log line | **YES** | `b-new-40-soak-verify.ts:126-129`; `--ack-by` kept, gate-bound |
| OBJ-4 | every teacher of the retired form agrees with the tool — docs AND code | **YES** | `CLAUDE.md:567`, `ALERT_HANDLING_PROTOCOL.md:28/:36`, `governance-checker/README.md:76`, `routes.ts:6698`, `system-alerts.ts:185`, `scripts/system-alerts.ts:24`; class grep at `448084d13`: every remaining `cc-session-` in `server/scripts/client` (tests excluded) is a retirement note or the roster filename |
| OBJ-5 | history NOT rewritten, proven on the object | **YES** | pre/post capture in the deploy command: 784/784 pre-capture ids present, 0 identity-field changes, +3 test rows; test "legacy row survives a rewrite byte-identical" |
| OBJ-6 | live positive + negative controls on the incumbents' real strings | **YES** | `p987_verify.sh` 21:07Z: `cc-analyst`→`cc-c`, `infra-claude`→`cc-infra`, `Langston (reviewer)`→`langston`, `cc-session-2026-09-02` refused, canonical+text refused, checker repeat-resolve accepted; Langston's own resolve from his box, his key: `--by "Langston (reviewer)"` → `resolved_by_claimed=langston`, read back from the file (Step 8) |
| OBJ-7 | rule 18: the deleted handler's surviving source + re-deployer removed | **YES** | `infra/helsinki/langston-alert-handler.sh` + `deploy-langston-alert-handler.sh` deleted; deployer archived `.removed`; `DELETED_COMPONENTS_LOG` row; Helsinki installed copy measured ABSENT; two root-owned backups LEFT INTENTIONALLY and named as the residual re-entry vector (L4) |

## 3 · LANGSTON'S CONDITIONS — all answered
**Step 2 (L1–L6):** L1 class grep — two members (evidence, id) plus the category site as uniformity; all de-echoed. L2 — the 75-string table, §5 below. L3 — exact-string, refused case tested live. L4 — backups dispositioned in the log row. L5/L6 — stamps/paths fixed at `0dc49be06`.
**Step 4 (1–4):** (1) completed 4/4 CI at a ref holding `448084d13`'s tree — `fa563982c`; (2) change list r3 wording — *zero on the refusal branches*, category not in the tally; (3) L2 here; (4) two §13 homes placed at `19bc97049`.

## 4 · WHAT WAS FOUND THAT WAS NOT IN SCOPE (settled, each with its disposition)
- **The census was wrong three times** — 7 → 8 → 10 entry points, each missing KIND found by a fresh object round (direct library import, dormant backfill script, env-supplied ssh command). Disposition: folded into A3; `MISTAKE_PATTERNS` `enumerator-blind-spot` instance 8, second batch.
- **A CI-red assertion** (`gov-integrity-1.test.ts:59 toBe('CC-A')`) the fold would have broken. Folded (P7).
- **The refusal-message echo class had a third member** after I called it empty — `resolveAlert(${id})`. Fixed at `448084d13`; `fix-follows-pointer` instance 6.
- **The conservation invariant as first written would fail with no defect** — four timers write the file during a deploy window. Restated on the pre-capture id set.
- **The SIM already documented the three resolve fields** (`:890`); the real gap was `acknowledged_by` and the API/UI writer. Amended, not duplicated.
- **Deleted component with a live re-installer in the repo** (B-TELEGRAM-DECOMM-2's miss). Folded as OBJ-7.
- **`dt-deploy.sh:81` shape-only `--by`** and **poller-vs-heartbeat classifier drift** (Langston, Step 4). Placed: 2.4a, 2.4b.
- **Side work, same evening, not this batch:** three after-hours xStock price-staleness alerts (`1d1573c7`, `b1f58a01`, `6339b2d9`) placed under `B-XSTOCK-SESSION-FRESHNESS` (3b.f-c, CC-C) with two close criteria; the acknowledged BABA/USD row muting its dedupe key since 08-30 resolved (7 rows on the key, 0 non-terminal).
- **Startup errors after the deploy:** `unique_global_alert` (1,765 prior lines) and `/home/runner` EACCES (#148) — pre-existing, not this batch's.

## 5 · L2 — THE 75 IDENTITY STRINGS, EVERY ONE PLACED (object: `acknowledged_by` over the whole file at the pre-deploy capture, 784 rows; the 76th key is `None` = 11 never-acked rows)
| class | strings (count) | disposition under the gate |
|---|---|---|
| **canonical after trim+lowercase** (member of the set, any case) | `langston` 179 · `cc-b` 94 · `cc-a` 47 · `governance-checker` 40 · `cc-c` 24 · `Langston` 18 · `CC-A` 1 · `CC-C` 1 · `governance-checker-heartbeat` 1 | accepted, stored lowercase (9 strings, 405 rows) |
| **alias → canonical** (exact table) | `cc-analyst` 21 · `cc-a-old-claude` 7 · `infra-claude` 5 · `cc-c-analyst` 3 · `Langston (reviewer)` 3 · `langston-reviewer` 3 · `Langston-reviewer` 1 | mapped (7 strings, 43 rows) |
| **`cc-session-<date>` — the retired mandated form** | 44 spellings, 2026-05-20 → 2026-09-02, incl. the suffixed `cc-session-2026-05-28-b46-wrapper-verified`, `…-cleanup-invoke-failed`, `…-b46-cron-verified`, `cc-session-2026-05-31-b-new-49-verifier-false-positive`, `cc-session-2026-06-01-b-new-50` (largest: `cc-session-2026-06-19` 88, `-06-25` 16, `-09-02` 16, `-07-17` 13; `cc-session-2026-08-30` 5 includes the BABA/USD row that muted its dedupe key until resolved 2026-09-02) | REFUSED (44 strings, 251 rows) |
| **`cc-<alias>-<date>`** | `cc-b-2026-06-25` 8 · `cc-b-2026-06-26` 7 · `cc-c-2026-08-23` 5 · `cc-c-2026-08-24` 4 · `cc-a-2026-08-23` 3 · `cc-a-2026-07-28` 1 · `cc-a-2026-07-30` 1 | REFUSED (7 strings, 29 rows) |
| **flood / phase / batch artifacts** | `cc-2026-06-24-govflood` 37 · `phase4-test-superseded` 2 · `phase4-code-verify` 1 · `phase4-end-to-end-verified` 1 · `b-new-43-mce-soak-verified` 1 | REFUSED (5 strings, 42 rows) |
| **seam-test artifacts** (B-GOV-INTEGRITY-0, Langston L2) | `cc-b-seam-test` 1 · `cc-b-seam-test-cleanup` 1 | REFUSED (2 strings, 2 rows) |
| **canonical + appended text** | `langston (transport: langston ssh key via deploy@staging)` 1 | REFUSED — exact-string table (1 string, 1 row) |
| never acked | `null` | 11 rows |
**Totals, re-derived from `/home/deploy/p987-pre.json` by class (script in the commit message): 9 + 7 + 44 + 7 + 5 + 2 + 1 = 75 distinct non-null strings; 405 + 43 + 251 + 29 + 42 + 2 + 1 + 11 = 784 rows = the capture's row count.** ⚠️ PREVIOUSLY STATED (first draft of this table): 43 `cc-session-` spellings and `CC-A`/`CC-C`/`Langston` under "alias". NOW: 44, and those three are case-variants of members, not aliases. REASON: re-derived by classifier over the multiset rather than by hand.

## 6 · GOVERNANCE FILES CHANGED — transcribed from the Step-10 tier ledger in the governance commit
*(transcribed from the governance commit message, not from memory)*
CHANGE-CLASS: non_architecture
| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | row added: refs, class, deploy sha, CI run, the one-paragraph summary |
| T1 | PHASE_HISTORY.md | ✅ | close block: what changed, the findings worth more than the batch, the records |
| T1 | PHASE_19_PLAN.md | ✅ | row 2.4 → CLOSED; 2.4a/2.4b placed earlier today at 19bc97049; 3b.f-c placed at d0679649b |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ | shared: one truth line (the canonical set is the only accepted --by); own: position → Step 11, batch collapsed |
| T1 | the batch SCOPE | ✅ | r4 at 7ddbac0d9 (+OBJ-7); stamp nit fixed at 0dc49be06 |
| T1 | the batch PRE_AUDIT | ✅ | r4 at 7ddbac0d9 (three reader rounds, ten-entry census, Langston's six conditions recorded) |
| T1 | the COMPLETION_REPORT | ✅ | written at this commit; L2's 75-string table re-derived by classifier; Step-8 non-launder note in the residual |
| T1 | Langston's /home/langston/MEMORY.md | ✅ | one close block appended (199 lines / 56,783 B — over its cap BEFORE this batch; prune owed, not silently done) |
| T2 | SYSTEM_MANUAL.md | N/A | nothing under shared/ or the trading pipeline changed; the manual mentions the alert queue only as a sink (:7574, :10710, :11232), never its identity model |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | bullet under the alerting path: actor table as cross-cutting state, the API/UI writer (previously undocumented), the ten-entry writer census, :890 amended not duplicated |
| T2 | RUNNING_ISSUES.md | ✅ | #987 CLOSED; #647 + #656 amendments (homes); #977 amendment 2 (three alerts + BABA key) |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-09-02-A: defect, fix, same-instrument verification, risks registered |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change — the batch sits inside Phase 19's governance queue |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no trading parameter touched (diff has no server/services/*engine* or *tec* file) |
| T2 | AUTHORITY_BASELINE.md | N/A | no authority boundary changed — the deciders are the same, only their spelling is fixed |
| T2 | STORAGE_POLICY.md | N/A | no table, tier or retention touched; the alert file is a jsonl on staging, unchanged in shape |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | reviewed the xStock 15-minute-bar WORKING LIST at its foot this turn — nothing in this diff touches an item on it |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no onboarding learning surfaced |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | the method did not change — the fresh-reader loop was used as already written |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build unchanged; the handler deleted in OBJ-7 was already absent from his box |
| T2 | CLAUDE.md / CONDUCT.md | ✅ | CLAUDE.md §10.5 step 3 retires cc-session-<date> and names the set (in the Step-3 commit dbcca4a9f); CONDUCT.md untouched |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | ✅ | §10.5 backstory: the mandated form predated the roster by 26 days and produced 43 spellings |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | row under B-TELEGRAM-DECOMM-2: the two repo files, the Helsinki measurement, the two backups left intentionally (Step-3 commit) |
| T2 | MISTAKE_PATTERNS.md | ✅ | enumerator-blind-spot instance 8 (second batch — promotion threshold now met on both legs); fix-follows-pointer instance 6 |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception granted; class stayed non_architecture throughout |
| T2 | ALERT_HANDLING_PROTOCOL.md | ✅ | :28 names the set, :36 gains the mandatory --evidence it had omitted (Step-3 commit) |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | no column, field or ownership changed |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | the daily check did not run in this session (its scheduled task owns the row) |


## 7 · HONEST RESIDUAL
⛔ **P11 is not identity proof (Langston, Step 8):** `669893e0` carried `acknowledged_by: langston` written by CC-B through the API as `"Langston (reviewer)"` before he touched it; `resolved_by_claimed` is a CLAIM (#447) and `transport=cli` names the channel, not the key-holder. **This batch canonicalises the vocabulary; it does not authenticate the speaker.** Also: the compare instrument's first version read a frozen snapshot and was blind to a later write — fixed at Step 8 (re-captures the live file by default); and his own alias probe re-resolved two test rows, so the three test rows end the day carrying `resolved_by_claimed=langston` — the state §9 of the change list records is 21:07Z, the captures preserve both.
Not authentication: any process on staging can still claim any member of the set; `resolved_by_transport` remains the only verifiable half (#447). The gate binds the LIBRARY; the liveness watchdog writes rows outside it (`acknowledged_by: null`, so no identity leaks — #647). A caller that bypasses the library and appends a row with a free-text identity is not stopped. The 75 historical strings stay in the file by design; every reader that groups by identity must still treat them as history. Langston's `MEMORY.md` was 55,486 B before this batch's block (2.26× its cap) — the block added is the smallest that carries the close; the prune is owed and not mine to do silently.
