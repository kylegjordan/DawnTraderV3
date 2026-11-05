# PM slot check — CC-INFRA

- ref: origin/migration/aws-supabase
- ref-sha: ea6d0af6ed94e27fb12414f2ff1bf88a349ff71a
- origin-head: ea6d0af6ed94e27fb12414f2ff1bf88a349ff71a
- freshness: FRESH
- owner: CC-INFRA
- item: Two small Infra items (KD-39): push-guard type-check runs from the repo root (fixes false refusals from subfolders) with four tests; daily root-crontab schedule snapshot on staging (half 1) for archival-health
- generated: 2026-11-05T15:50:09.103Z

## 1. Open plan rows (plan order)

- section 4 row 1m (line 221) [queued] B-DT-REVIEW-SIDE-BRANCH (`#1138`) — Langston's review reader can read a review branch: `dt-review` and the backup sync fetch only `migration/aws-supabase`, so a Step-4 diff on a separate review b… — status: QUEUED
- section 4 row 1w1 (line 227) [queued] B-DTREVIEW-ABSENCE-PROVENANCE (`#1181`) — The review tool refused a commit as "not in the mirror" fourteen minutes after the mirror held it — a reviewer can report a real commit as missing: reproduce i… — status: QUEUED
- section 4 row 5 (line 261) [queued] — batch named at Step 1 — 12.1 rulings-durability fix — status: QUEUED
- section 4 row 6 (line 262) [queued] — batch named at Step 1 — Months of database headroom — status: QUEUED
- section 4 row 7 (line 263) [queued] — batch named at Step 1 — Install the context_bridge_log 14-day TTL job — status: QUEUED
- section 4 row 11 (line 280) [queued] #521 — batch named at Step 1 — #521 — status: QUEUED
- section 4 row 12 (line 281) [queued] — batch named at Step 1 — Fix duplicated plan ids — status: QUEUED
- section 4 row 20 (line 297) [queued] B-RTB-SIGNAL-IDENTITY — B-RTB-SIGNAL-IDENTITY — status: QUEUED
- section 4 row 21 (line 298) [queued] B-VTS-CLASS-LABEL-INTEGRITY — B-VTS-CLASS-LABEL-INTEGRITY — status: QUEUED
- section 4 row 22 (line 299) [queued] B-CLOSED-TRADES-CLASS-BACKFILL — B-CLOSED-TRADES-CLASS-BACKFILL — status: QUEUED
- section 4 row 23 (line 300) [queued] #150 — batch named at Step 1 — #150 — status: QUEUED
- section 4 row 24 (line 301) [queued] — batch named at Step 1 — Exclude plain-currency and non-dollar pairs — status: QUEUED
- section 4 row 25 (line 302) [queued] B-NONFIAT-QUOTE-DENOMINATION — B-NONFIAT-QUOTE-DENOMINATION — status: QUEUED
- section 4 row 26 (line 303) [queued] B-QUOTE-ADMISSION-LEGACY-SWEEP — B-QUOTE-ADMISSION-LEGACY-SWEEP — status: QUEUED
- section 4 row 27 (line 304) [queued] B-QUOTE-LEG-INTEGRITY — B-QUOTE-LEG-INTEGRITY — status: QUEUED
- section 4 row 28 (line 305) [queued] B-PRICE-FLOOR-REVIEW — B-PRICE-FLOOR-REVIEW — status: QUEUED
- section 4 row 29 (line 306) [queued] B-VENUE-PAIRS-REINIT — B-VENUE-PAIRS-REINIT — status: QUEUED
- section 4 row 30 (line 307) [queued] B-SCAN-BREADTH-DECLINE — B-SCAN-BREADTH-DECLINE — status: QUEUED
- section 4 row 35a (line 313) [queued] B-WS-SUBSCRIBE-BOUNDARY-CLASS (`#571`) — Thread the authoritative asset class through the crypto WS subscribe boundary, so no caller can subscribe a symbol of the wrong class — status: QUEUED
- section 4 row 71 (line 372) [queued] #166 — batch named at Step 1 — #166 — status: QUEUED
- section 4 row 73 (line 374) [queued] B-SCHEDULER-FIRST-TICK — B-SCHEDULER-FIRST-TICK — status: QUEUED
- section 4 row 74 (line 375) [queued] #585 — batch named at Step 1 — #585 — status: QUEUED
- section 4 row 75 (line 376) [queued] B-STRING-TRUTHINESS-GUARDS — B-STRING-TRUTHINESS-GUARDS — status: QUEUED
- section 4 row 76 (line 377) [queued] B-GUARD-COVERAGE-AUDIT — B-GUARD-COVERAGE-AUDIT — status: QUEUED
- section 4 row 77 (line 378) [queued] B-LEARNING-SYSTEM-CENSUS — B-LEARNING-SYSTEM-CENSUS — status: QUEUED
- section 4 row 78 (line 379) [queued] — batch named at Step 1 — Dead-code reachability census — status: QUEUED
- section 4 row 81 (line 383) [queued] roadmap 16.6 — batch named at Step 1 — 16.6 Trailing-Percent Code Purge (added 2026-04-25, Kyle directiv — status: QUEUED
- section 4 row 83 (line 385) [queued] B-WS-V1-RESIDUE-SWEEP — B-WS-V1-RESIDUE-SWEEP — status: QUEUED
- section 4 row 85 (line 388) [queued] B-MODE-PREDICATE-SWEEP — B-MODE-PREDICATE-SWEEP — status: QUEUED
- section 4 row 85a (line 389) [queued] B-USER-RESOLUTION-PIN — B-USER-RESOLUTION-PIN (`#1092`) — status: QUEUED
- section 4 row 91 (line 396) [queued] B-VALIDATE-OBSERVABILITY — B-VALIDATE-OBSERVABILITY — status: QUEUED
- section 4 row 92 (line 397) [queued] B-DIAG-READ-INTEGRITY — B-DIAG-READ-INTEGRITY — status: QUEUED
- section 4 row 93 (line 398) [queued] B-FILTER-DIAG-XSTOCK — B-FILTER-DIAG-XSTOCK — status: QUEUED
- section 4 row 94 (line 399) [queued] #664 — batch named at Step 1 — #664 — status: QUEUED
- section 4 row 95 (line 400) [queued] #419 — batch named at Step 1 — #419 — status: QUEUED
- section 4 row 96 (line 401) [queued] #549 — batch named at Step 1 — #549 — status: QUEUED
- section 4 row 97 (line 402) [queued] #561 — batch named at Step 1 — #561 — status: QUEUED
- section 4 row 98 (line 404) [queued] #547 — batch named at Step 1 — #547 — status: QUEUED
- section 4 row 158 (line 501) [queued] B-SEC-HARDEN — B-SEC-HARDEN — status: QUEUED
- section 4 row 158a (line 502) [queued] B-PATH-SINK-CENSUS — B-PATH-SINK-CENSUS — status: QUEUED
- section 4 row 158b (line 503) [queued] B-AUDIT-ROUTE-AUTH — B-AUDIT-ROUTE-AUTH — status: QUEUED
- section 4 row 159 (line 504) [queued] B-SSH-KEY-CENSUS — B-SSH-KEY-CENSUS (investigation) — status: QUEUED
- section 4 row 160 (line 505) [queued] #615 — batch named at Step 1 — #615 — status: QUEUED
- section 4 row 160a (line 506) [queued] `#1013` — batch named at Step 1 — Scan commits for secrets — status: QUEUED
- section 4 row 161 (line 507) [queued] — batch named at Step 1 — Coltrane parity: a privacy check like Langston's — status: QUEUED
- section 4 row 162 (line 508) [queued] #681 — batch named at Step 1 — #681 — status: QUEUED
- section 4 row 163 (line 509) [queued] #168 — batch named at Step 1 — #168 — status: QUEUED
- section 4 row 164 (line 510) [queued] P19-B12 — P19-B12 — status: QUEUED
- section 4 row 172 (line 526) [queued] B-TEC-PRIME-BOOT-RACE — B-TEC-PRIME-BOOT-RACE — status: QUEUED
- section 4 row 174 (line 528) [queued] #619 — batch named at Step 1 — #619 — status: QUEUED
- section 4 row 175 (line 529) [queued] B-DASHBOARD-AUTH-RACE — B-DASHBOARD-AUTH-RACE — status: QUEUED
- section 4 row 178 (line 537) [queued] — batch named at Step 1 — Resize the staging server one step up before live — status: QUEUED
- section 4 row 193 (line 565) [queued] — batch named at Step 1 — Provision the live Kraken API key — status: QUEUED
- section 4 row 197a (line 570) [queued] B-TOKEN-WATCH-AUTH (`#1228`) — The token-watch summary on staging answers without a login, though its code says it is behind one: put the login check on that one route, with a no-login contr… — status: QUEUED

## 2. Pre-sprint rows

- stage 00 — data truth first (Kyle 2026-11-04, KD-2) order 5b (line 22) B-TOKEN-WATCH-STORAGE — status: IN FLIGHT — Step 7 (installed 2026-11-0… — waiting on: data — the rest of the backlog moves when the storage provi…
- stage 0 — clear the plates (Infra Claude) order 1a (line 76) B-WAKE-OPENING-LIST — Everyone named in a post's opening list of addressees wakes (review… — status: IN FLIGHT — Step 1 APPROVED 2026-11-05 … — waiting on: Infra Claude
- stage 0 — clear the plates (Infra Claude) order 3 (line 78) B-LANGSTON-CLAUDEMD-RESIDUAL — status: IN FLIGHT — Step 7: installed 2026-11-0… — waiting on: Infra Claude (the fix, held for Kyle's 2026-11-04 restart r…
- stage 0 — clear the plates (Infra Claude) order 4 (line 79) B-LANGSTON-MEMORY-WRITE-FENCE — status: STEP 1 — scope r1 drafted 2026-11-05 (`… — waiting on: Infra Claude
- stage 0 — clear the plates (Infra Claude) order 5 (line 80) B-TOKEN-WATCH-FOLLOWUP-MEMORY — status: STEP 1 — scope r1 drafted 2026-11-05 (`… — waiting on: Infra Claude (after B-LANGSTON-CLAUDEMD-RESIDUAL)
- stage 0 — clear the plates (Infra Claude) order 6 (line 81) B-CREDENTIALS-PRIVATE-REPO — status: IN FLIGHT — OBJ-1 closed 2026-10-13; th… — waiting on: Infra Claude (after B-LANGSTON-CLAUDEMD-RESIDUAL)
- stage 0 — clear the plates (Infra Claude) order 7 (line 82) B-CREW-ACCESS-HARDEN — status: PARKED — Step 9, paused by Kyle 2026-10… — waiting on: Infra Claude (after the current batches)
- stage 0 — clear the plates (Infra Claude) order 8 (line 83) B-LANGSTON-CONTEXT (increment 2) — status: PARKED (chunk 1 closed; the rest partly… — waiting on: Infra Claude (re-scope against B-LANGSTON-RELIEF), then Kyle
- stage 0 — clear the plates (Infra Claude) order 10 (line 85) B-SIZE-WATCH-BREACH-ALARM — status: QUEUED — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 11 (line 86) B-LANGSTON-MEMORY-NOTICES — status: QUEUED — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 12 (line 87) B-AGENT-INVOKE-FAILURE-NOTICE — status: QUEUED — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 13 (line 88) B-AGENT-PRIVATE-TMP — status: QUEUED — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 14 (line 89) B-LANGSTON-REPOST-FAILED — status: QUEUED — waiting on: Kyle (and after B-AGENT-PRIVATE-TMP)
- stage 0 — clear the plates (Infra Claude) order 15 (line 90) B-ALERT-LANE-LEDGER-OWNER — status: QUEUED (owner accepted by Infra Claude … — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 16 (line 91) B-LANGSTON-RECONCILE-VERB — status: QUEUED — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 17 (line 92) B-CHAPLET-DELETE — status: QUEUED — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 18 (line 93) B-TRANSCRIPT-ARCHIVE — status: QUEUED — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 19 (line 94) B-TOKEN-WATCH — status: PARKED (research, after live; it owns n… — waiting on: Kyle
- stage 0 — clear the plates (Infra Claude) order 20 (line 95) B-CREW-STATUS-2 — status: PARKED (after live; it and #670 dissolv… — waiting on: nothing

## 3. Task list

task-list: UNPARSEABLE (| batch | stalled at | waiting on | note |)

First table, verbatim:

| batch | stalled at | waiting on | note |
|---|---|---|---|
| ▶ **`B-TOKEN-WATCH-STORAGE`** (`#1132`; plan §0a stage 00 "data truth first", order 5b — Kyle D-2, 2026-11-04) | **Step 2 of amendment 1** — the backlog is off the box (86 files), store 7.18 GiB; amendment 1 (OBJ-7 cursor-bounded `due` prune, OBJ-8 feed watch) APPROVED, its pre-audit §4 with Langston since 08:38Z | Langston (pre-audit); data for Step-7 legs (ii) after 00:00Z and (v) after the 11-06 05:30Z run | `#1246` sizing, `#1247` birth gap (Kyle decision via PM Claude) |
| ⏳ **`B-WAKE-OPENING-LIST`** (`#1241`, Kyle KD-20 + KD-21, 2026-11-04) | **Step 2** — scope r4a approved; pre-audit `0d6f14b99` with Langston since 09:30Z | Langston | A6: Coltrane cannot wake Langston — Kyle decision via PM Claude |
| ⏳ **`B-LANGSTON-MEMORY-WRITE-FENCE`** (`#1234`, Kyle-placed 2026-11-04 right after the rules-file batch) | Step 1 — scope r1 drafted 2026-11-05 | me, after `B-LANGSTON-CLAUDEMD-RESIDUAL` | the composed memory file writable only through the tool, while Langston keeps writing it himself without root |
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


## Push-back: Position A — both items as one small batch directly after Infra's current active batch

Active batch per the record: B-TOKEN-WATCH-STORAGE (stage 00, order 5b, data truth, IN FLIGHT). Items are small (one-line fix + four tests; one timer).
Pushed back, in order of Kyle's ranking (open trades, faulty closes, calibration data, KD-2 data truth, then everything else):
1. Open trades / faulty closes / calibration data: nothing in Infra's stage-0 list is in these classes; no push-back.
2. KD-2 data truth: B-TOKEN-WATCH-STORAGE is the active batch and stays ahead; no push-back.
3. Everything else (all of it pushed back by one small batch): B-WAKE-OPENING-LIST (1a, KD-21), B-LANGSTON-CLAUDEMD-RESIDUAL (3, Step 7), B-LANGSTON-MEMORY-WRITE-FENCE (4), B-TOKEN-WATCH-FOLLOWUP-MEMORY (5), B-CREDENTIALS-PRIVATE-REPO (6), then orders 7-20 and the queued Infra rows. Note KD-15 (crew-tooling/checker improvements wait until after live) binds the push-guard item, so A needs a Kyle slot to override it.

## Push-back: Position B — both items after Infra's already-placed sprint rows (rows 20-23 etc.)

Pushes back nothing already placed; the items go behind every row above (stage 0 orders 1a-20 and section 4 rows 20-23 etc. as the record shows).
Ranked: open trades, faulty closes, calibration data, KD-2 data truth: no push-back. Everything else: no push-back (items sit last).
Cost: false push-guard refusals from subfolders and the missing schedule snapshot (archival-health) persist until then. Consistent with KD-15 (waits until after live).
