# Decision pack — Kyle's xStock capture-rate condition (#441): fold it into a batch, or retire it? (2026-11-05)

> KD-34 protocol (`1-system-manual/pm/DECISION_PROTOCOL.md`). Owner CC-A (OLD Claude, owner of `B-XSTOCK-FRESHNESS-MONITOR`); deciders CC-A + Langston + Coltrane; PM Claude records. Raised by PM Claude's KD-43 governance audit (the open row since 2026-07-08). Retiring a condition Kyle set goes to him for his yes, as the group's settled recommendation.

## 1. The question
In July Kyle approved slowing the xStock quote capture to one snapshot per 4 s, on a condition: a weekly watch of the trading opportunities the slower rate costs. The watch was never built to running. Should that condition be **folded into a batch that delivers it**, or **retired** because something since July already measures what he asked for?

## 2. What was intended, when and why
- **Kyle, 2026-07-08 (B-STORAGE-HARDEN Wave D OBJ-4), recorded at `RUNNING_ISSUES.md:448` (#441):** "Kyle confirmed the conservative capture rate (4000 ms) ON CONDITION we add a weekly monitor of the trading opportunities the reduced cadence costs us + any other unintended consequences — run until we're satisfied there's no meaningful opportunity loss." And: "Kyle wants this WATCHED, not assumed benign." *(Sessions' record of his position; no verbatim quote of Kyle exists in the repo.)* Also `Batch Completion/B_STORAGE_HARDEN_WAVE_D_COMPLETION_REPORT.md:48-49` and commit `e349c799a`.
- **What the watch was to report (#441 scope):** (a) per-symbol freshness-breach exposure past the 15 s fill gate, week over week; (b) depth-median sample adequacy; (c) 1-minute bar coverage; (d) once active trading is on, the breaches cross-referenced against actual signal / RTB / fill-attempt events — **the true opportunity-loss measure**.
- **Why the rate was slowed:** storage. `xstock_spot_ticker_snap` was the largest table (~63 GB/month at ~1.8 s capture); the 4 s rate cut it ~3× (`STORAGE_POLICY.md:94`).
- **The batch:** `B-XSTOCK-FRESHNESS-MONITOR` (scope `ddb47edbb`, pre-audit `51044f564`, OBJ-1 reframed `90b49d00a`, all 2026-07-08). Its script `server/scripts/b-xstock-freshness-monitor.ts` was only rescued into git on 2026-07-23 (`c65813bcd`) and **cannot run**: it writes `xstock_freshness_report` (`:268`), which no migration creates. It never had a plan placement.

## 3. What is built today (measured at the ref and on staging)
- **The rate is still 4000 ms.** Staging `module_constants` `passive_archive.b74_ticker_snapshot_min_interval_ms` = 4000, `updated_by b-storage-harden-wave-d-obj4-stepdown`, 2026-07-08T14:48:03Z (read 2026-11-05 ~21:45Z). Code default 1000 (`ticker-batch-writer.ts:33`); no migration carries 4000.
- **The two xStock entry freshness gates are 15 s and read THIS table:** `xstock_fill_safety.active_fill_max_age_ms` = 15000 (dispatch, `active-dispatch.ts:181-185`) and `fill_depth_gate.warmth_max_age_ms` xstock = 15000 (`depth-source.ts:306`, again at consumption `active-execution-engine.ts:6253`) — both read `NOW() - MAX(captured_at)` of `xstock_spot_ticker_snap` (`active-dispatch.ts:74-79`, `depth-source.ts:99-100`). ⇒ the 4 s sampling (plus the 5 s flush, `ticker-batch-writer.ts:30`) sits **directly in front of the gate**: up to ~9 s of a quote's age can be capture lag rather than market silence (`Scope Files/B_XSTOCK_SESSION_FRESHNESS_ESTIMAND_REGISTRATION.md` §19).
- **What measures xStock staleness today, and what it misses:**

| instrument | counts | lands | gap vs Kyle's condition |
|---|---|---|---|
| dispatch stale-skip `_staleSkips` (`active-dispatch.ts:52,183`) | signals refused at dispatch for an old tick | in memory, class total; no caller outside tests | resets on restart; not per symbol; invisible |
| `xstock-stale-fill-block` alert (`:88-100`) | one page per refusal (symbol, age) | alert queue, ONE shared key | an open row mutes every later refusal |
| depth-gate counters (`depth-source.ts:322`) | `stale_book`, consumption-freshness refusals | in memory; no caller outside tests | resets on restart; invisible |
| RTB `recordOpenFailed` (`rtb-metrics-service.ts:221-237`) | open failures by stage incl. `DEPTH_GATE`, `CONSUMPTION_FRESHNESS`, per symbol | since-boot API summary + `[OPEN_FAILED]` log | resets on restart; no week-over-week |
| `signal_eval_archive` | persisted signal outcomes | table | **staleness refusals are NOT archived** — the signal is archived `admitted` (`eval-cycle.ts:1272`) BEFORE the dispatch check (`:1393`) |
| `closed_trades` `entry_book_age_ms`, `entry_book_consumption_age_ms`, `exit_fill_depth_age_ms` | book age on trades that HAPPENED | table | refused trades are invisible by construction |
| exit-side `_recordPriceSkip`, #548 ceiling, #526 alert noise, book-state tracker | exit marks / hollow books | alerts, labels | exit side, not entries |
| B-XSTOCK-BAR-AVAILABILITY (#707, Step 9), B-CRYPTO-FEED-WATCHDOG (#1232) | bar publication timing; perp/crypto silence | event tables, alerts | not entry freshness |
| #531, #559 | weekend posture; a crypto subscription storm | — | not xStock entry freshness |
| one-off measurements (B-XSTOCK-FEED-SANITY §2c: share of time past 15 s — RTH 14.0 %, after-hours 69.0 %, pre-market 78.6 %, overnight 80.4 %) | exposure, once | documents | not recurring |

- **Answer to the question in §1, measured:** **nothing today measures opportunity loss in Kyle's sense.** Refusals for staleness ARE counted — but in memory, reset on every restart, not per symbol at dispatch, never stored over time, and never joined to the signal / RTB / fill events. No weekly or daily xStock freshness job exists. The persisted signal archive records the very signals the gate refused as `admitted`. *(Census by a fresh reader at the ref 2026-11-05; the rate and gate values re-read by CC-A on staging; citations above.)*

## 4. What the plans say is coming
Nothing places it. The freshness items #526 (CC-B, alert noise), #531 (weekend posture), #548 (resolved), #559 (resolved) are different questions. `SPRINT_TO_LIVE_PLAN` row 40 (B-ENTRY-CONSUMPTION-FRESHNESS) kept the 15 s gate; the rate itself is in no plan. The database is at 68.3 % of its 200 GB cap (2026-11-05 19:51Z) and growing ~1-1.7 GB/day, so **returning to the 1 s rate is not cheap** — the slower rate's cost matters more now, not less.

## 5. Options
| option | benefits | risks |
|---|---|---|
| **A — fold into one small batch: persist what is already counted.** Write each xStock staleness refusal (dispatch stale-skip, depth-gate `stale_book`, consumption-freshness) to a table with symbol, stage, measured age, the signal id; archive the refused signal as refused rather than `admitted`; one weekly per-symbol report (refusals, the share of each name's session time past 15 s, week over week). Retire the July script and its unbuilt table (rule 18). | delivers (a) and (d) of Kyle's condition with instruments that already exist; small; gives the evidence to decide the rate honestly; fixes the signal archive's mislabel | a new batch — needs Kyle's slot; touches the dispatch path (persisting must not slow or block it) |
| **B — retire the condition** | no work | **not honest today**: nothing measures what he asked; the gate reads the throttled table directly; "assumed benign" is exactly what he said not to do |
| **C — revisit the rate instead** (back toward 1 s for xStock only) | removes the cause | storage: the largest table ~3× bigger with the database at 68 % and the cold tier at its cap — a storage decision Kyle owns, and it still leaves the loss unmeasured |

## 6. Positions (each round recorded)
- **CC-A (2026-11-05):** **A.** B fails on the evidence in §3 — the condition is not met by anything that exists, and the throttled table feeds the gate directly. C trades a storage problem we already have for one we cannot afford, and still measures nothing. A is the smallest honest delivery: the refusals are already counted, they are just thrown away. Two points for the reviewers to attack: (1) whether the signal archive's "`admitted` before dispatch" is a defect to fix here or its own item; (2) whether the weekly report should be a scheduled job with a Discord summary (as #441 said) or a query + a monthly read (cheaper, and Kyle now prefers fewer messages). Placement: a new batch, so it goes to Kyle's list as "the group agreed this, placed here"; the July batch closes into it (its open row then dissolves).
