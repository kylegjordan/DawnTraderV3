# PM slot check — CC-INFRA

- ref: origin/migration/aws-supabase
- ref-sha: 8f1352d220368c3c86804ea68350a0e0ec9e46da
- origin-head: 8f1352d220368c3c86804ea68350a0e0ec9e46da
- freshness: FRESH
- owner: CC-INFRA
- item: B-DEPLOY-WINDOW-GUARD (#1249): a register of open test windows that dt-deploy reads before every staging deploy, refusing inside an open window unless named, failing closed; Kyle agreed option A 2026-11-06, before live, placed at Infra order 10a after B-SIZE-WATCH-BREACH-ALARM
- generated: 2026-11-06T13:19:09.297Z

## 1. Open plan rows (plan order)

- section 4 row 1m (line 222) [queued] B-DT-REVIEW-SIDE-BRANCH (`#1138`) — Langston's review reader can read a review branch: `dt-review` and the backup sync fetch only `migration/aws-supabase`, so a Step-4 diff on a separate review b… — status: QUEUED
- section 4 row 1w1 (line 228) [queued] B-DTREVIEW-ABSENCE-PROVENANCE (`#1181`) — The review tool refused a commit as "not in the mirror" fourteen minutes after the mirror held it — a reviewer can report a real commit as missing: reproduce i… — status: QUEUED
- section 4 row 5 (line 262) [queued] — batch named at Step 1 — 12.1 rulings-durability fix — status: QUEUED
- section 4 row 6 (line 263) [queued] — batch named at Step 1 — Months of database headroom — status: QUEUED
- section 4 row 7 (line 264) [queued] — batch named at Step 1 — Install the context_bridge_log 14-day TTL job — status: QUEUED
- section 4 row 11 (line 281) [queued] #521 — batch named at Step 1 — #521 — status: QUEUED
- section 4 row 12 (line 282) [queued] — batch named at Step 1 — Fix duplicated plan ids — status: QUEUED
- section 4 row 20 (line 298) [queued] B-RTB-SIGNAL-IDENTITY — B-RTB-SIGNAL-IDENTITY — status: QUEUED
- section 4 row 21 (line 299) [queued] B-VTS-CLASS-LABEL-INTEGRITY — B-VTS-CLASS-LABEL-INTEGRITY — status: QUEUED
- section 4 row 22 (line 300) [queued] B-CLOSED-TRADES-CLASS-BACKFILL — B-CLOSED-TRADES-CLASS-BACKFILL — status: QUEUED
- section 4 row 23 (line 301) [queued] #150 — batch named at Step 1 — #150 — status: QUEUED
- section 4 row 24 (line 302) [queued] — batch named at Step 1 — Exclude plain-currency and non-dollar pairs — status: QUEUED
- section 4 row 25 (line 303) [queued] B-NONFIAT-QUOTE-DENOMINATION — B-NONFIAT-QUOTE-DENOMINATION — status: QUEUED
- section 4 row 26 (line 304) [queued] B-QUOTE-ADMISSION-LEGACY-SWEEP — B-QUOTE-ADMISSION-LEGACY-SWEEP — status: QUEUED
- section 4 row 27 (line 305) [queued] B-QUOTE-LEG-INTEGRITY — B-QUOTE-LEG-INTEGRITY — status: QUEUED
- section 4 row 28 (line 306) [queued] B-PRICE-FLOOR-REVIEW — B-PRICE-FLOOR-REVIEW — status: QUEUED
- section 4 row 29 (line 307) [queued] B-VENUE-PAIRS-REINIT — B-VENUE-PAIRS-REINIT — status: QUEUED
- section 4 row 30 (line 308) [queued] B-SCAN-BREADTH-DECLINE — B-SCAN-BREADTH-DECLINE — status: QUEUED
- section 4 row 35a (line 314) [queued] B-WS-SUBSCRIBE-BOUNDARY-CLASS (`#571`) — Thread the authoritative asset class through the crypto WS subscribe boundary, so no caller can subscribe a symbol of the wrong class — status: QUEUED
- section 4 row 71 (line 373) [queued] #166 — batch named at Step 1 — #166 — status: QUEUED
- section 4 row 73 (line 375) [queued] B-SCHEDULER-FIRST-TICK — B-SCHEDULER-FIRST-TICK — status: QUEUED
- section 4 row 74 (line 376) [queued] #585 — batch named at Step 1 — #585 — status: QUEUED
- section 4 row 75 (line 377) [queued] B-STRING-TRUTHINESS-GUARDS — B-STRING-TRUTHINESS-GUARDS — status: QUEUED
- section 4 row 76 (line 378) [queued] B-GUARD-COVERAGE-AUDIT — B-GUARD-COVERAGE-AUDIT — status: QUEUED
- section 4 row 77 (line 379) [queued] B-LEARNING-SYSTEM-CENSUS — B-LEARNING-SYSTEM-CENSUS — status: QUEUED
- section 4 row 78 (line 380) [queued] — batch named at Step 1 — Dead-code reachability census — status: QUEUED
- section 4 row 81 (line 384) [queued] roadmap 16.6 — batch named at Step 1 — 16.6 Trailing-Percent Code Purge (added 2026-04-25, Kyle directiv — status: QUEUED
- section 4 row 83 (line 386) [queued] B-WS-V1-RESIDUE-SWEEP — B-WS-V1-RESIDUE-SWEEP — status: QUEUED
- section 4 row 85 (line 389) [queued] B-MODE-PREDICATE-SWEEP — B-MODE-PREDICATE-SWEEP — status: QUEUED
- section 4 row 85a (line 390) [queued] B-USER-RESOLUTION-PIN — B-USER-RESOLUTION-PIN (`#1092`) — status: QUEUED
- section 4 row 91 (line 397) [queued] B-VALIDATE-OBSERVABILITY — B-VALIDATE-OBSERVABILITY — status: QUEUED
- section 4 row 92 (line 398) [queued] B-DIAG-READ-INTEGRITY — B-DIAG-READ-INTEGRITY — status: QUEUED
- section 4 row 93 (line 399) [queued] B-FILTER-DIAG-XSTOCK — B-FILTER-DIAG-XSTOCK — status: QUEUED
- section 4 row 94 (line 400) [queued] #664 — batch named at Step 1 — #664 — status: QUEUED
- section 4 row 95 (line 401) [queued] #419 — batch named at Step 1 — #419 — status: QUEUED
- section 4 row 96 (line 402) [queued] #549 — batch named at Step 1 — #549 — status: QUEUED
- section 4 row 97 (line 403) [queued] #561 — batch named at Step 1 — #561 — status: QUEUED
- section 4 row 98 (line 405) [queued] #547 — batch named at Step 1 — #547 — status: QUEUED
- section 4 row 158 (line 503) [queued] B-SEC-HARDEN — B-SEC-HARDEN — status: QUEUED
- section 4 row 158a (line 504) [queued] B-PATH-SINK-CENSUS — B-PATH-SINK-CENSUS — status: QUEUED
- section 4 row 158b (line 505) [queued] B-AUDIT-ROUTE-AUTH — B-AUDIT-ROUTE-AUTH — status: QUEUED
- section 4 row 159 (line 506) [queued] B-SSH-KEY-CENSUS — B-SSH-KEY-CENSUS (investigation) — status: QUEUED
- section 4 row 160 (line 507) [queued] #615 — batch named at Step 1 — #615 — status: QUEUED
- section 4 row 160a (line 508) [queued] `#1013` — batch named at Step 1 — Scan commits for secrets — status: QUEUED
- section 4 row 161 (line 509) [queued] — batch named at Step 1 — Coltrane parity: a privacy check like Langston's — status: QUEUED
- section 4 row 162 (line 510) [queued] #681 — batch named at Step 1 — #681 — status: QUEUED
- section 4 row 163 (line 511) [queued] #168 — batch named at Step 1 — #168 — status: QUEUED
- section 4 row 164 (line 512) [queued] P19-B12 — P19-B12 — status: QUEUED
- section 4 row 172 (line 528) [queued] B-TEC-PRIME-BOOT-RACE — B-TEC-PRIME-BOOT-RACE — status: QUEUED
- section 4 row 174 (line 530) [queued] #619 — batch named at Step 1 — #619 — status: QUEUED
- section 4 row 175 (line 531) [queued] B-DASHBOARD-AUTH-RACE — B-DASHBOARD-AUTH-RACE — status: QUEUED
- section 4 row 178 (line 539) [queued] — batch named at Step 1 — Resize the staging server one step up before live — status: QUEUED
- section 4 row 193 (line 567) [queued] — batch named at Step 1 — Provision the live Kraken API key — status: QUEUED
- section 4 row 197a (line 572) [queued] B-TOKEN-WATCH-AUTH (`#1228`) — The token-watch summary on staging answers without a login, though its code says it is behind one: put the login check on that one route, with a no-login contr… — status: QUEUED

## 2. Pre-sprint rows

- stage 0 — clear the plates (Infra Claude) order 3 (line 78) B-LANGSTON-CLAUDEMD-RESIDUAL — status: IN FLIGHT — Step 7: installed 2026-11-0… — waiting on: Infra Claude (the fix, held for Kyle's 2026-11-04 restart r…
- stage 0 — clear the plates (Infra Claude) order 4a (line 80) B-LANGSTON-TWO-WORKERS — status: IN FLIGHT — Step 1 APPROVED 2026-11-06 … — waiting on: Infra Claude
- stage 0 — clear the plates (Infra Claude) order 4b (line 81) B-TRANSCRIPT-ARCHIVE — status: IN FLIGHT — Step 3 of 11: scope and pre… — waiting on: Infra Claude
- stage 0 — clear the plates (Infra Claude) order 5 (line 82) B-TOKEN-WATCH-FOLLOWUP-MEMORY — status: STEP 1 — scope r1 drafted 2026-11-05 (`… — waiting on: Infra Claude (after B-LANGSTON-CLAUDEMD-RESIDUAL)
- stage 0 — clear the plates (Infra Claude) order 6 (line 83) B-CREDENTIALS-PRIVATE-REPO — status: IN FLIGHT — OBJ-1 closed 2026-10-13; th… — waiting on: Infra Claude (after B-LANGSTON-CLAUDEMD-RESIDUAL)
- stage 0 — clear the plates (Infra Claude) order 7 (line 84) B-CREW-ACCESS-HARDEN — status: PARKED — Step 9, paused by Kyle 2026-10… — waiting on: Infra Claude (after the current batches)
- stage 0 — clear the plates (Infra Claude) order 8 (line 85) B-LANGSTON-CONTEXT (increment 2) — status: PARKED (chunk 1 closed; the rest partly… — waiting on: Infra Claude (re-scope against B-LANGSTON-RELIEF), then Kyle
- stage 0 — clear the plates (Infra Claude) order 10 (line 87) B-SIZE-WATCH-BREACH-ALARM — status: QUEUED — AGREED by Kyle 2026-11-06 (KD-… — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 11 (line 88) B-LANGSTON-MEMORY-NOTICES — status: ~~QUEUED~~ MOVED to the after-live list… — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 12 (line 89) B-AGENT-INVOKE-FAILURE-NOTICE — status: QUEUED — AGREED by Kyle 2026-11-06 (KD-… — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 13 (line 90) B-AGENT-PRIVATE-TMP — status: ~~QUEUED~~ MOVED to the after-live list… — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 14 (line 91) B-LANGSTON-REPOST-FAILED — status: ~~QUEUED~~ MOVED to the after-live list… — waiting on: Kyle (and after B-AGENT-PRIVATE-TMP)
- stage 0 — clear the plates (Infra Claude) order 15 (line 92) B-ALERT-LANE-LEDGER-OWNER — status: ~~QUEUED~~ MOVED to the after-live list… — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 16 (line 93) B-LANGSTON-RECONCILE-VERB — status: ~~QUEUED~~ MOVED to the after-live list… — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 17 (line 94) B-CHAPLET-DELETE — status: ~~QUEUED~~ MOVED to the after-live list… — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 19 (line 95) B-TOKEN-WATCH — status: PARKED (research, after live; it owns n… — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 20 (line 96) B-CREW-STATUS-2 — status: PARKED (after live; it and #670 dissolv… — waiting on: nothing

## 3. Task list

task-list: UNPARSEABLE (| batch | stalled at | waiting on | note |)

First table, verbatim:

| batch | stalled at | waiting on | note |
|---|---|---|---|
| ✅ ~~`B-TOKEN-WATCH-STORAGE`~~ (`#1132`, Kyle D-2 2026-11-04) | **CLOSED 2026-11-06** (installed; Langston CONFIRMED Step 11) | — | report `Batch Completion/B_TOKEN_WATCH_STORAGE_COMPLETION_REPORT.md`; warn row `7b19347d` standing → FOLLOWUP-MEMORY P10/P15; pager-failure gap P16 |
| ✅ ~~`B-WAKE-OPENING-LIST`~~ (`#1241`, Kyle KD-20 + KD-21, 2026-11-04) | **CLOSED 2026-11-06** (installed `f38220b83`; Langston CONFIRMED Step 11) | — | report `Batch Completion/B_WAKE_OPENING_LIST_COMPLETION_REPORT.md`; A6 (Coltrane cannot wake Langston) with Kyle via PM; bridge-error finding folded into B-AGENT-INVOKE-FAILURE-NOTICE (#1198) |
| ▶ **`B-LANGSTON-TWO-WORKERS`** (KD-44, Kyle 2026-11-05; plan §0a Infra order 4a) | **Step 4** — built at `82c03b2c3` (CI 4/4); Langston two parts + Coltrane concurrency pass | Langston, Coltrane | two review workers with per-batch lanes; a wait AND review-quality window before vs after (Kyle) |
| ✅ ~~`B-LANGSTON-MEMORY-WRITE-FENCE`~~ (`#1234`, Kyle-placed 2026-11-04) | **CLOSED 2026-11-06** (installed `fe3c4ad1f`; Langston CONFIRMED Step 11) | — | report `Batch Completion/B_LANGSTON_MEMORY_WRITE_FENCE_COMPLETION_REPORT.md`; the fence's page never fired (drill offered to Kyle via PM); §10.b exit-8 floor + exit-6 wording → `B-LANGSTON-TWO-WORKERS` |
| ⏳ **`B-TOKEN-WATCH-FOLLOWUP-MEMORY`** (`#1132`, order 5 in my §0a list) | queued | me, after the fence | the follow-up recorder's memory fix; the `due/` steady state; the B2 version census + orphan reconciliation (Langston Step 9) |
| ⏳ **`#1238`** Codex conversation backup | after live (Kyle D-1, 2026-11-04) | me | the ChatGPT stand-ins' conversations are not backed up |
| ✅ ~~`B-LANGSTON-RELIEF`~~ (sprint §0 row, Kyle 2026-10-16) | **CLOSED 2026-11-05** (Langston CONFIRMED 2026-11-05T03:04:32Z) | — | report `Batch Completion/B_LANGSTON_RELIEF_COMPLETION_REPORT.md`; the ceiling carried to `B-LANGSTON-CLAUDEMD-RESIDUAL` (Kyle option A) |
| ⏳ **`B-LANGSTON-CLAUDEMD-RESIDUAL`** (Kyle-slotted 2026-10-20; folds `#974`) | **Step 7** — installed 2026-11-05 08:21Z: his rules file 57,095 B (Langston-approved, `e319f34cf`), the installer and the size watch; loaded set 140,943 vs 143,856, canary LOADED | two consecutive daily size-watch runs under the ceiling, then Step 8 | OBJ-3 ceiling (carried from `B-LANGSTON-RELIEF`) met at install |
| ⏸ **`B-CREW-ACCESS-HARDEN`** (`#1092`, `#924`) | **Step 9**, paused | **Kyle** — stays paused until he says otherwise (2026-11-04) | P3a fixes at `ddf7eafac` unreviewed; disposable keys stay; add `C:\DawnTraderV3-pm` to the caller census on resume (#1092) |
| ⏳ **`B-LANGSTON-CONTEXT`** increment 2 (rows 2.8b / pre-audit §20-§21) | **chunk 1: Step 7** (Step 6 approved 16:53Z) · **chunk 2 part 1** (P-6a.1, P-6a.2) at Step 3, pushed `624cd1733` | tonight's SCHEDULED runs (04:10Z index, 05:40/05:51Z size watches, 06:00Z privacy) — Langston's condition 3 | then chunk 2's writer (P-6b), P-2, Langston's retrofit, P-1b |
| ⏳ **`B-WAKE-LEAD-NAME`** (row 4.51, `#1040`) | **Step 10** — Step 8 confirmed; FINDING-A approved; the FINDING-D hunk is with Langston | Langston's okay on `0df01c687` | then install the folded filter and write the completion report |
| ⏸ **`B-TOKEN-WATCH`** | **Step 7**, paused | me — Langston round 11 is owed; the Helius feed is not yet pointed at the endpoint | ⛔ the Alchemy switch is NOT cleared (pre-registration amendment 15) |
| ✅ ~~`#974` `B-RULES-1E-LANGSTON-SLIM`~~ | folded 2026-10-20 | — | unparked into `B-LANGSTON-CLAUDEMD-RESIDUAL` (above) |
| ⏸ **`#670`** crew-status cold hand-off | open | me | warm tier grows unbounded; a policy item, not a capacity one |
| ⏸ **`B-CREW-STATUS-2`** remainder | parked | **Kyle** (parked 2026-08-26) | ⛔ the costly unbuilt piece: persist derived facts at observation time |

## 4. Decisions binding the owner and not DONE (newest first; last 48 h flagged)

- KD-55 (2026-11-06) [LAST 48 H] status DECIDED (technical, KD-34) — **Coltrane-to-Langston wake (A6) closes the gap in KD-21, which says everyone named in a post's opening list wakes, reviewers alike: a reviewer's FRESH post whose opening list names the other reviewe…
- KD-53 (2026-11-06) [LAST 48 H] status ACKED (INFRA ~11:4xZ, CC-A ~1… — **Backblaze B2 is paid, pay-as-you-go (no package). FINAL SETTINGS, READ BACK by PM Claude in Kyle's dashboard 11-06 ~12:1xZ: payment method on; Daily STORAGE = No Cap with an alert email at $0.10/da…
- KD-52 (2026-11-06) [LAST 48 H] status ACKED (INFRA ~11:0xZ 11-06) — **The token-feed 8-day gap investigation (`B-TOKEN-WATCH-BIRTH-GAP`, #1247) goes on the after-live list**, with the token study it serves; the feed's dead-man alarm (B-TOKEN-WATCH-STORAGE OBJ-8) alre…
- KD-51 (2026-11-06) [LAST 48 H] status ACKED (INFRA ~11:0xZ 11-06) — **Six Infra items move to the after-live list (crew tooling, KD-15):** `B-LANGSTON-MEMORY-NOTICES` (#1216), `B-AGENT-PRIVATE-TMP` (#979/#1205 — the exposure is to other accounts on the agent box, not…
- KD-50 (2026-11-06) [LAST 48 H] status ACKED (INFRA ~11:0xZ 11-06) — **Two Infra items agreed for BEFORE live:** `B-AGENT-INVOKE-FAILURE-NOTICE` (#1198/#1206, with the bridge-error silent branch: a failed Langston or Coltrane review tells the requester) next after Inf…
- KD-49 (2026-11-06) [LAST 48 H] status ACKED (INFRA ~11:0xZ 11-06) — **B-TRANSCRIPT-ARCHIVE index location: option (iii)** — the conversation index lives in the shared memory folder WITHOUT the topic text (alias, date, session id, batch ids, line count), so nothing pr…
- KD-47 (2026-11-06) [LAST 48 H] status ACKED (INFRA 00:1xZ 11-06) — **B-TRANSCRIPT-ARCHIVE (Infra Claude) moves from pre-sprint order 18 up to order 4b, right after B-LANGSTON-TWO-WORKERS**, because it gates the shorter-conversation trial (KD-46, estimated 40-100% mo…
- KD-46 (2026-11-06) [LAST 48 H] status ACKED (INFRA 00:1xZ 11-06) — **A trial of shorter conversations is approved (one session, restart at a finished step around 400k tokens, measured for usage, restart cost and errors), on one condition: first a system is set up so…
- KD-44 (2026-11-05) [LAST 48 H] status ACKED (INFRA 22:2xZ) — **B-LANGSTON-TWO-WORKERS (Infra Claude) is slotted in the pre-sprint table at Infra order 4a, after B-LANGSTON-MEMORY-WRITE-FENCE and before B-TOKEN-WATCH-FOLLOWUP-MEMORY: Langston reviews two pieces…
- KD-43 (2026-11-05) [LAST 48 H] status IN PROGRESS — **Every batch closes with proper and complete governance. PM Claude checks each completion report's governance-files-changed list against the batch's class doc set (`workflow-10-governance`) before c…
- KD-42 (2026-11-05) [LAST 48 H] status ACKED (INFRA 19:4xZ, OLD 21:3… — **The two small Infra items of KD-39 are placed on the after-live list (`PRE_LIVE_SPRINT.md`, after B-REVIEW-REF-READ) as B-PUSH-GUARD-ROOT (Infra Claude) and B-CRONTAB-SNAPSHOT (Infra Claude half 1,…
- KD-39 (2026-11-05) [LAST 48 H] status DECIDED (technical) — awaitin… — **Two small Infra items are technically agreed (owner + Langston + Coltrane, KD-34), NOT yet placed: (1) the push-guard type-check runs and keys every error from the repo root, with four fast tests, …
- KD-36 (2026-11-05) [LAST 48 H] status DECIDED — **Trailing exits and break-even exits stay OFF in paper mode and the VTS until after live mode is running normally; work on them waits until then.** The dormant VTS-to-paper trailing write (`PRICING_…
- KD-34 (2026-11-05) [LAST 48 H] status DECIDED — **Technical decisions are made by the owning session + Langston + Coltrane to consensus, on a full provenance pack PM Claude assembles (original intent back to the pre-governance records, what is bui…
- KD-21 (2026-11-04) [LAST 48 H] status ACKED — Widens KD-20: everyone named in a post's **opening list of addressees** wakes, in any order, reviewers and sessions alike ("Langston, Coltrane, OLD Claude, NEW Claude, …"); a name that appears only l…
- KD-20 (2026-11-04) [LAST 48 H] status REVERSED by KD-21 (widened) — A post addressed to both reviewers ("Langston and Coltrane, …", either order) must wake both. Today each wakes only when his name comes first. Infra Claude fixes both bridges (keeping the rule that a…
- KD-16 (2026-11-04) [LAST 48 H] status ACKED — Dead or one-time code may wait until after live **only if** it is shown isolated so it cannot affect paper or live trading; the dead-code reachability census (sprint, Infra Claude) decides, and anyth…
- KD-15 (2026-11-04) [LAST 48 H] status ACKED — Crew-tooling and checker improvements wait until after live.
- KD-4 (2026-11-04) [LAST 48 H] status IN PLAN — **Kyle works through PM Claude; PM Claude relays decisions, records them here and makes sure they are implemented where and when agreed.**
- KD-3 (2026-11-04) [LAST 48 H] status WAITING — **No paid Backblaze storage for now.** Finish the planned storage and disk fixes, then re-measure storage growth and decide.
- KD-2 (2026-11-04) [LAST 48 H] status ACKED — **Five data-truth fixes lead the pre-sprint table, in order:** (1) finish the crypto price-feed watchdog; (2) finish the xStock bar check; (3) new batch, guard the shared database connections, owner …
- KD-1 (2026-11-04) [LAST 48 H] status ACKED — The ChatGPT stand-ins' missing conversation backup (`#1238`) goes after live, owned by Infra Claude.

## 5. Plan vs task list disagreements

NOT COMPARABLE: the task list is UNPARSEABLE, so nothing was compared (this is not an agreement).


## 6. Candidate position P-1 — Infra order 10a, after B-AGENT-INVOKE-FAILURE-NOTICE (12) and B-SIZE-WATCH-BREACH-ALARM (10), the KD-50 items

Reading (section 2 above, at 8f1352d22): the 10a label sits numerically between 10 and 11, but the stated position is after 12. Read as "after 12", the item lands between order 12 and order 13/19. Read as the label 10a, it would sit before 12 and push the KD-50 item B-AGENT-INVOKE-FAILURE-NOTICE back one place. The position should be stated as after 12 to keep both KD-50 items first.

What P-1 (after 12) pushes back, ranked on Kyle's priorities (open trades, faulty closes, calibration data, KD-2 data truth, everything else):
1. Open trades: nothing. No row after 12 touches open trades.
2. Faulty closes: nothing.
3. Calibration data: nothing.
4. KD-2 data truth: nothing. The five KD-2 items lead the pre-sprint table, ahead of all Infra rows.
5. Everything else, item by item:
   - Order 13 B-AGENT-PRIVATE-TMP, 14 B-LANGSTON-REPOST-FAILED, 15 B-ALERT-LANE-LEDGER-OWNER, 16 B-LANGSTON-RECONCILE-VERB, 17 B-CHAPLET-DELETE, and 11 B-LANGSTON-MEMORY-NOTICES: already MOVED to the after-live list (KD-51). Not pushed back by this.
   - Order 19 B-TOKEN-WATCH: PARKED, research, after live. Pushed back by one place, no effective change.
   - Order 20 B-CREW-STATUS-2: PARKED after live. Pushed back by one place, no effective change.
Net: nothing that bears on trading is delayed. Cost is Infra Claude time before live, ahead of parked rows only. It is also later than the Infra rows ahead of it (3 through 8, 10, 12), which finish first.

Caveat: the task list parse failed (section 3), so this was not checked against the task list.
