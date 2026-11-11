# CC-INFRA (Infra Claude) — SESSION TASK LIST — plain language, as of 2026-11-04

> 📁 **Lives in `1-system-manual/`** beside the other session lists (`workflow-10-governance` Tier-1 task-list row).
> ⚠️ **CREATED 2026-09-11 AT `B-WAKE-LEAD-NAME` STEP 10 — IT DID NOT EXIST BEFORE.** Only `CC_A_SESSION_TASK_LIST.md` was in this folder (control: the same listing showed that file), so every earlier close by this session had no list to update.
> ⛔ **THE PLAN IS THE AUTHORITY; THIS FILE IS THE INDEX.** Every row is derived from `SPRINT_TO_LIVE_PLAN.md` (Kyle 2026-09-28: one list, in order; it replaced the phase plan for ordering). If the two disagree, the plan wins and this file is stale.
> **UPDATED IN THREE PLACES, IN THE SAME TURN:** this file → `SPRINT_TO_LIVE_PLAN.md` → `POST_AUDIT_ROADMAP.md` where it is roadmap-level. **When:** every batch close, and every time a batch, sub-batch, hotfix or investigation is slotted.

---

## 0a. ⛔⛔ OPEN AND STALLED — WORK I STARTED AND HAVE NOT CLOSED

| batch | stalled at | waiting on | note |
|---|---|---|---|
| ✅ ~~`B-TOKEN-WATCH-STORAGE`~~ (`#1132`, Kyle D-2 2026-11-04) | **CLOSED 2026-11-06** (installed; Langston CONFIRMED Step 11) | — | report `Batch Completion/B_TOKEN_WATCH_STORAGE_COMPLETION_REPORT.md`; warn row `7b19347d` standing → FOLLOWUP-MEMORY P10/P15; pager-failure gap P16 |
| ✅ ~~`B-WAKE-OPENING-LIST`~~ (`#1241`, Kyle KD-20 + KD-21, 2026-11-04) | **CLOSED 2026-11-06** (installed `f38220b83`; Langston CONFIRMED Step 11) | — | report `Batch Completion/B_WAKE_OPENING_LIST_COMPLETION_REPORT.md`; A6 (Coltrane cannot wake Langston) with Kyle via PM; bridge-error finding folded into B-AGENT-INVOKE-FAILURE-NOTICE (#1198) |
| ▶ **`B-LANGSTON-TWO-WORKERS`** (KD-44, Kyle 2026-11-05; plan §0a Infra order 4a) | **Step 4** — built at `82c03b2c3` (CI 4/4); Langston two parts + Coltrane concurrency pass | Langston, Coltrane | two review workers with per-batch lanes; a wait AND review-quality window before vs after (Kyle) |
| ✅ ~~`B-LANGSTON-MEMORY-WRITE-FENCE`~~ (`#1234`, Kyle-placed 2026-11-04) | **CLOSED 2026-11-06** (installed `fe3c4ad1f`; Langston CONFIRMED Step 11) | — | report `Batch Completion/B_LANGSTON_MEMORY_WRITE_FENCE_COMPLETION_REPORT.md`; the fence's page never fired (drill offered to Kyle via PM); §10.b exit-8 floor + exit-6 wording → `B-LANGSTON-TWO-WORKERS` |
| ✅ ~~`B-TRANSCRIPT-ARCHIVE`~~ (KD-47, plan §0a Infra order 4b) | **CLOSED 2026-11-10** — all seven objectives green; Coltrane CONFIRMED Step 11 at `6d9535aa` | — | report `Batch Completion/B_TRANSCRIPT_ARCHIVE_COMPLETION_REPORT.md`; Codex/reviewer-history expansion remains after live under `#1238`; board Review-field access gap remains under B-CREW-ACCESS-HARDEN |
| ▶ **`B-CREDENTIALS-PRIVATE-REPO`** (`#1023`, plan §0 Infra order 6) | parent in flight; `#1117` increment closed; **GB-8 Step 5 complete**, CI `42829558680` 4/4 | crew mode | Step 6 parked because its bridge install would enable Langston while he is off; remaining parent work stays open |
| ▶ **`B-TOKEN-WATCH-FOLLOWUP-MEMORY`** (`#1132`, order 5 in my §0a list) | **Step 5 complete 2026-11-10**; CI `42843060525` 4/4 | me, Step 6 | next eligible work while both Langston-enabling Step-6 installs wait for Claude mode; index/encoding/N/arms next; no Langston service enable |
| ▶ **`B-DISK-HEADROOM`** (plan row 6) | **Step 7; Stage B formal evidence FAIL 2026-11-11** | logging correction review + repeat-proof disposition | operational 22-child run succeeded and 365 restore is safe; required proof-run `retentionDays=148` line was absent; correction prepared, not deployed |
| ⏳ **`#1237` + `#1238` `B-CODEX-CONVERSATION-BACKUP`** | after live (Kyle D-1, 2026-11-04) | me | one backed-up, searchable and restore-checked path for all five Claude sessions, all five Codex chats, Langston and Coltrane |
| ✅ ~~`B-LANGSTON-RELIEF`~~ (sprint §0 row, Kyle 2026-10-16) | **CLOSED 2026-11-05** (Langston CONFIRMED 2026-11-05T03:04:32Z) | — | report `Batch Completion/B_LANGSTON_RELIEF_COMPLETION_REPORT.md`; the ceiling carried to `B-LANGSTON-CLAUDEMD-RESIDUAL` (Kyle option A) |
| ⏳ **`B-LANGSTON-CLAUDEMD-RESIDUAL`** (Kyle-slotted 2026-10-20; folds `#974`) | **Step 7** — installed 2026-11-05 08:21Z: his rules file 57,095 B (Langston-approved, `e319f34cf`), the installer and the size watch; loaded set 140,943 vs 143,856, canary LOADED | two consecutive daily size-watch runs under the ceiling, then Step 8 | OBJ-3 ceiling (carried from `B-LANGSTON-RELIEF`) met at install |
| ⏸ **`B-CREW-ACCESS-HARDEN`** (`#1092`, `#924`) | **Step 9**, paused | **Kyle** — stays paused until he says otherwise (2026-11-04) | P3a fixes at `ddf7eafac` unreviewed; disposable keys stay; add `C:\DawnTraderV3-pm` to the caller census on resume (#1092) |
| ⏳ **`B-LANGSTON-CONTEXT`** increment 2 (rows 2.8b / pre-audit §20-§21) | **chunk 1: Step 7** (Step 6 approved 16:53Z) · **chunk 2 part 1** (P-6a.1, P-6a.2) at Step 3, pushed `624cd1733` | tonight's SCHEDULED runs (04:10Z index, 05:40/05:51Z size watches, 06:00Z privacy) — Langston's condition 3 | then chunk 2's writer (P-6b), P-2, Langston's retrofit, P-1b |
| ⏳ **`B-WAKE-LEAD-NAME`** (row 4.51, `#1040`) | **Step 10** — Step 8 confirmed; FINDING-A approved; the FINDING-D hunk is with Langston | Langston's okay on `0df01c687` | then install the folded filter and write the completion report |
| ⏸ **`B-TOKEN-WATCH`** | **Step 7**, paused | me — Langston round 11 is owed; the Helius feed is not yet pointed at the endpoint | ⛔ the Alchemy switch is NOT cleared (pre-registration amendment 15) |
| ✅ ~~`#974` `B-RULES-1E-LANGSTON-SLIM`~~ | folded 2026-10-20 | — | unparked into `B-LANGSTON-CLAUDEMD-RESIDUAL` (above) |
| ⏸ **`#670`** crew-status cold hand-off | open | me | warm tier grows unbounded; a policy item, not a capacity one |
| ⏸ **`B-CREW-STATUS-2`** remainder | parked | **Kyle** (parked 2026-08-26) | ⛔ the costly unbuilt piece: persist derived facts at observation time |

---

## 0. ⭐ THE QUEUE — MY ROWS IN `SPRINT_TO_LIVE_PLAN.md` (the authority; re-derived 2026-09-29)

> ⛔ **The order and the text below are COPIED from the sprint plan's row numbers — if they differ, the plan wins.** `PHASE_19_PLAN.md` no longer orders this work (Kyle, 2026-09-28: one list, in order).

**NOW, ahead of the sprint (§0 plate):** `B-CREDENTIALS-PRIVATE-REPO` GB-8, `B-AGENT-INVOKE-FAILURE-NOTICE`, and `B-TOKEN-WATCH-FOLLOWUP-MEMORY` are preserved at their install/deploy boundaries. `B-DISK-HEADROOM` Stage B's operational run succeeded and its proof window is restored to 365, but Step 7 remains open on the missing pre-registered retention log line; its correction is prepared for review, with no deploy or OBJ-4 flip first. No Langston worker is enabled during the Codex shift.

| row | item | what it is for |
|---|---|---|
| 5 | 12.1 rulings-durability fix | cheap and irreversible if lost: copy Langston's rulings file to a read-only replica |
| 6 | Months of database headroom | database at 81% (critical): confirm the October 1 move of August to warm storage lands; then (Kyle 2026-09-28) |
| 7 | Install the context_bridge_log 14-day TTL job | this week: make the retention demonstrably free bytes on a named table - install the missing 14-day job (1.48  |
| 11 | #521 | wave 0 (Langston F11): nothing notices a dead engine - a silent halt voids every observation window |
| 12 | Fix duplicated plan ids | a chore, not mechanics (Langston): no two plan items share a number |
| ~~18~~ | ~~B-UNIVERSE-REFRESH-ACTS~~ | moved to OLD Claude (Kyle KD-26, 2026-11-04) |
| ~~19~~ | ~~B-SYMBOL-CLASS-IDENTITY~~ | moved to OLD Claude (Kyle KD-26, 2026-11-04), after row 18; closes with KD-25 |
| 20 | B-RTB-SIGNAL-IDENTITY | after B-SYMBOL-CLASS-IDENTITY |
| 21 | B-VTS-CLASS-LABEL-INTEGRITY | after B-SYMBOL-CLASS-IDENTITY: correct the mislabelled VTS rows |
| 22 | B-CLOSED-TRADES-CLASS-BACKFILL | after B-SYMBOL-CLASS-IDENTITY |
| 23 | #150 | after B-SYMBOL-CLASS-IDENTITY: the RTB asset-class column made NOT NULL after a zero-null soak |
| 24 | Exclude plain-currency and non-dollar pairs | Kyle's decision: exclude plain currency pairs and non-dollar crypto now |
| 25 | B-NONFIAT-QUOTE-DENOMINATION | the exclusion itself, if small |
| 26 | B-QUOTE-ADMISSION-LEGACY-SWEEP | with the exclusion: what the old allowed-pairs list is for |
| 27 | B-QUOTE-LEG-INTEGRITY | with the exclusion |
| 28 | B-PRICE-FLOOR-REVIEW | replace the $0.25 floor with a real market-depth test |
| 29 | B-VENUE-PAIRS-REINIT | a changed exchange price step must not refuse orders |
| 30 | B-SCAN-BREADTH-DECLINE | why the scanner sees so few pairs — breadth feeds selection |
| 35 | B-WS-SUBSCRIBE-CLASS-FILTER | the crypto subscribe set is not class-filtered |
| 71 | #166 | close: the TEC stale-cache fence keeps firing |
| 73 | B-SCHEDULER-FIRST-TICK | restarts: every scheduled job runs twice after a restart |
| 74 | #585 | restarts: auto-resume skips a malformed session |
| 75 | B-STRING-TRUTHINESS-GUARDS | hygiene: guards that treat '0' as true |
| 76 | B-GUARD-COVERAGE-AUDIT | hygiene: which guards cover which paths |
| 77 | B-LEARNING-SYSTEM-CENSUS | hygiene: old learning systems still wired |
| 78 | Dead-code reachability census | hygiene (Langston C6): rules on ALL 22 legacy items - the 5 removals below AND the 17 in the after-live 'Legac |
| 81 | 16.6 Trailing-Percent Code Purge (added 2026-04-25, Kyle directiv | legacy removal, after the census: the old trailing-percent exit code, so it cannot re-enter a live exit |
| 83 | B-WS-V1-RESIDUE-SWEEP | legacy removal, after the census: the dead first-generation Kraken price handler |
| 85 | B-MODE-PREDICATE-SWEEP | hygiene: readers that would mix live and paper P&L |
| 85a | B-USER-RESOLUTION-PIN (`#1092`) | hygiene: "the first user in the table" is unordered, and a password reset changed who it is (measured 2026-09- |
| 91 | B-VALIDATE-OBSERVABILITY | paper truth: make validation failures visible |
| 92 | B-DIAG-READ-INTEGRITY | paper truth: diagnostics that read a status code as data |
| 93 | B-FILTER-DIAG-XSTOCK | paper truth: the empty xStock decline table |
| 94 | #664 | paper truth: a hardcoded 'strategies evaluated' |
| 95 | #419 | paper truth: funnel counts under errors |
| 96 | #549 | paper truth: Open Trades field gaps |
| 97 | #561 | paper truth: volume / order book columns in Open Trades |
| 98 | #547 | paper truth: the Analyst's July findings (owner reads) |
| 158 | B-SEC-HARDEN | route authorisation (the password rotation moved to B-CREDENTIALS-PRIVATE-REPO, run before the sprint) ⭐ Kyle  |
| 159 | B-SSH-KEY-CENSUS (investigation) | whose are the two unknown keys |
| 160 | #615 | the reviewer identity must not read the secrets file |
| 161 | Coltrane parity: a privacy check like Langston's | before the Coltrane trial: a privacy check like Langston's |
| 162 | #681 | a deploy must not outrun CI |
| 163 | #168 | with #681: CI catches a build that crashes on boot |
| 164 | P19-B12 | the deploy tool's own executable comes from the reviewed code |
| ~~165~~ | ~~B-VENUE-QUIET-ALERTING~~ | **MOVED 2026-10-06 to CC-B, plan row 3a1, paired with 3a (Kyle).** Not yours any more — written here by CC-B so this list does not carry a stale row. |
| 172 | B-TEC-PRIME-BOOT-RACE | restarts: the exit loop throws for a tick on open positions |
| ~~173~~ | ~~B-ENGINE-STOP-DURATION-COLUMN~~ | moved to CC-B (row 2a0) 2026-10-06 — Langston asked the lists be reconciled; `PHASE_19_PLAN` 3n.u4 named CC-B |
| 174 | #619 | a restore from backup lacks seeded config |
| 175 | B-DASHBOARD-AUTH-RACE | the portfolio card never recovers from a 401 |
| 178 | Resize the staging server one step up before live | before the split (Infra condition): one server size up, a second program needs the memory |
| 193 | Provision the live Kraken API key | the live key: trade-only, no withdrawals, locked to the server ⭐ Kyle creates the key on Kraken; Infra sets it |
| 197a | B-TOKEN-WATCH-AUTH (`#1228`) | Kyle-slotted 2026-10-20, near the sprint's end just before the go-live switch: the token-watch summary on staging answers without a login; put the login check on that one route, with a no-login control |

---

## 0b. OWNED BUT NOT YET PLACED — carried from the 2026-09-03 list during the task-list reconciliation (#1009)

> These are mine, named, but with no position in the running order — the exact `§9.4` gap ("naming is not placing"). Recorded here so the reconciliation loses nothing; placing them is a decision for Kyle or a Langston round, not a solo call.

| item | what it is FOR, plainly |
|---|---|
| **`#931` `B-REVIEWER-LOOP-AVAILABILITY`** | Four workflow steps require a fresh reader to check first — and in the session those steps govern, it could not fire. A rule that cannot run is worse than none: it reads as covered. |
| **`#924`** | Two access keys reach the staging deploy account that nobody governs or rotates — security housekeeping; remediation belongs with the security-hardening work. |
| **`#973`** | In the token study, part of how a launch is judged "interesting" is structurally dead — the limb can never be true, so it silently contributes nothing. |
| **`#989`** | A token can lose 99.8% of its liquidity and the study still counts it alive, because "alive" never had a liquidity figure to look at. |
| **the 11 GB conversation sweep** | Kyle asked for everything "discussed, lined up to work on, and not gotten back to." The Langston/plan sweep is done; the folder-by-folder pass over 11 GB of transcripts (dates read from inside records, not filesystem) is still owed. |

> **Reconciliation note (2026-09-13, Kyle-directed via OLD Claude — "two combined, one thrown out"):** this session had TWO task lists — this one (canonical, `1-system-manual/`) and a 48 KB `2026-09-03` file in `Scope Files/` that this listing never saw. Reconciled to ONE: the older file's live batches were already here; its unique owned rows are the table above; its Langston memory-growth analysis is in `B_LANGSTON_CONTEXT_PRE_AUDIT.md`; its owed 11 GB sweep is carried above; its `2026-09-03` searchability reference remains in git history. The 48 KB file was then **thrown out** (`git rm`) so there is exactly one CC-INFRA session task list, in `1-system-manual/`, and it is the one the ledger names. (`#1009` / `B-TASK-LIST-SLOT`.)
