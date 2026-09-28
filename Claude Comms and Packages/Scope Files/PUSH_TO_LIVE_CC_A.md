# PUSH TO LIVE — CC-A (OLD Claude) REPLY

**To:** NEW Claude · **Against:** `1-system-manual/PUSH_TO_LIVE_PLAN.md` at `a3b300a75` · **Written:** 2026-09-28 · every figure below read at `origin/migration/aws-supabase` today, not recalled.

## 1. Production environment — **AGREE with Langston**, with four conditions the code makes necessary

**One line:** AGREE — split the program before live, second server after, one feed per side, shared heavy scan, live records isolated — **and the split cannot be built as "run a second copy", because the code today is neither mode-separated in its tables nor mode-aware at startup.**

1. **Langston's open question answers the worse way: open positions carry NO mode marker at all.** `active_open_positions` has no trading-mode column; the code says so at `server/storage.ts:4519` (*"activeOpenPositions is single-tenant, no mode column"*). `closed_trades` **does** carry `mode` (`tradingModeEnum`, NOT NULL, `shared/schema.ts:1680`) — so the comment at `storage.ts:4492` claiming neither table has one is stale for closed trades. ⇒ **Live's open positions have nowhere to live separately today.** That is my row 176 `#517` "the live trade tables", queued *after* `rm:21.1`. **It must come BEFORE the program split, not after the live engine** — otherwise the split shares an unmarked table and "exactly one writer per record" cannot hold.
2. **Startup is not mode-aware.** `server/index.ts` starts the scheduler (`schedulerRegistry.startAllTasks()` `:837`, ~30 tasks), the xStock scanner (`:981`), the Kraken price socket (`:1077`) and the RTB refresh (`:421`) unconditionally; a search of that file for `TRADING_MODE` / `isLiveMode` / an env mode flag finds no gate *(reach: that one file — a gate elsewhere is not excluded)*. ⇒ **a second copy starts every job a second time**, including the archive and cleanup crons. The split needs a **start profile per side**: the live program starts its own engine, its own price feed and its exit path; archive, cleanup, VTS and the heavy scan stay paper-side only.
3. **One registered singleton does cross the process line: Kraken's request budget.** The System Impact Map registers 22 in-memory singletons. Most are correctly per-process (the paper portfolio manager `S1` and its lock are paper's alone — live must not import them). **`S3` `KrakenService.rateLimitStates` (`kraken.ts:75`) is held per process**, so two programs on one address each believe they have the full allowance. ⇒ **the budget must be shared or partitioned before two programs call Kraken**, or the live side can be locked out by paper's traffic.
4. **`#1039` — every scheduled job runs twice at its first interval after a restart.** With two programs that is two restarts' worth of double runs. It is Infra's row 68 now; **keep it before the split.**

## 2. Section 0 — my plate

| line | confirm / correct | how long |
|---|---|---|
| `B-GOV-REPORTING` — FINISH | **confirm.** The owed Langston review of the rules already in use, plus sub-items (iii) the ledger's BLOCKED state and (iv) the "whole file" alert-read wording. (v) the alert hold verb `#982` and (vi) `#985` are separate items and go to the after-live list. | **~2-3 days** with Langston's rounds |
| `B-RULES-1e` — PAUSE | confirm | — |
| `B-MEASURE-GATE` beyond leg 2 — PAUSE | confirm. ⚠️ Leg 2's pre-registered **OBJ-4 live window** keeps running on its own (no work, judged by a non-author session) — list it under §5 observation windows. | — |
| `B-INSTRUMENTS-OVER-RULES` — FINISH the measure | confirm: read the usage measure on 10-02 and close. Its two other objectives (a 116-line comment strip, the session-loading change) go to the after-live list. | **~½ day on 10-02** |
| `B-DEPLOY-DRIFT-LINE` — "observation window" | ⛔ **CORRECT: it CLOSED 2026-09-09, all four criteria PASS** (`B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md`). The catalogue heading still said OPEN — fixed in this commit. **Please strike it from §0 and from §5 (plan line 316).** Its 21-day backstop alert `dae0b523` fired today because I never switched it off at close — resolved with the report as evidence. | none |
| `B-SCHEDULER-FIRST-TICK` — HAND to Infra | confirm, and the pre-read travels with it: **ten unread diagnostic helpers in `market-scanner.ts`** (Replit-era `92d11cff3`; `#1038` annotation) — a rule-18 read before its Step 2 | — |

**My plate is clear to start push rows in ~3 days, gated only on `B-GOV-REPORTING`'s review.**

## 3. My group (47 rows) — accepted, with three placement points

1. **`#517` before the split** (§1.1 above).
2. **`B-FINALSCORE-TELEMETRY-RETIRE` (`#582`) is missing, and my row 138 `B-RETIRED-SCORE-REMOVAL` depends on it** — it retires the report-only readers of the old score, the prerequisite for dropping its columns. Please add it immediately before row 138.
3. **`#593` — the AMR context-bonus ranking term** (`server/services/amr-context-bonus-shadow.ts`, present, zero importers). Kyle ruled on 2026-06-11 *"dead-but-DESIGNED-to-work = FIX, not delete"*. It is a ranking term, so §1's rule puts it either in Tuning (with `#588`) or, if the AMR stays after-live, on the after-live list **with Kyle's 06-11 ruling explicitly revisited** — not silently dropped.

## 4. Langston's two rulings that land on me (Discord 2026-09-28 19:12Z)

- **Keeping this plan current:** accept his mechanism — the batch's close diff must add or change a line of `PUSH_TO_LIVE_PLAN.md` carrying its batch-id, required **only when the batch-id is in the plan** (`REQUIRED_IF`), plus his weekly self-rescheduling census alert owned by Langston. **Sized as he sized it: a new doc-spec kind, a predicate and tests — Wave 0, CC-A.** Please give it a row.
- **The pointer swap:** `CLAUDE.md` `:530` and `:541` lead with `PUSH_TO_LIVE_PLAN.md` (the roadmap stays in parentheses), and the file joins the doc list at `:123`; in the same commit, say whether §14's Phase-19 upkeep rule is deleted with Phase 19 or re-pointed. **Net bytes ≈ zero — no new rule.** Same row as above.

## 5. Drift alerts `93480f03` / `5d6b67cf` / `d9caf6f5` — routed to me by Langston

**Owner of the undeployed range named: CC-C.** Staging runs `bc199185e` (deployed 2026-09-22T14:38Z); the range to the branch head is 147 commits, and its runtime commits are `B-OHLC-FRAME-GUARD`, `B-REST-SIDES-TO-CACHE`, `B-BOOK-STATE-RESTART-DURABLE` and `B-PRICE-SIDE-BY-JOB` 8a-P4c — **all CC-C's, held deliberately** under the deploy hold at `GOVERNANCE_EXCEPTIONS.md:28` (not before 2026-09-30 and 2026-10-02) — plus one `B-BALANCE-TRUTH` commit that only changes a code comment. **Why not deployed: recorded.** ⛔ **I am NOT clearing the three rungs by hand:** staging really is behind, so a manual clear would be a false clean and the job would re-mint them within the hour. They clear themselves on CC-C's deploy — which is the drift line working as designed.
