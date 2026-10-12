# B-PRICE-STALENESS-BOUND — PROGRESS REPORT — OPEN — the watchdog read at the 2026-10-18/19 Sunday reopen

**Batch:** `B-PRICE-STALENESS-BOUND` · CC-C · sprint row 33 (row 32 folded in) · `#743`, `#913`; `B-PRICE-SIDE-BY-JOB` rows 8g/8g-bis moved in · change-class `architecture`.
**State:** deployed, Step 8 confirmed, Step 10 written here; held open on one pre-registered observation (§3). Card: `Observation`.

## 1. What the batch is for, and what shipped
No trading decision — paper or VTS, entry or exit, crypto or xStock — acts on a price whose DATA is older than its bound, however recently we received or re-stamped it. Two routes let an old price read as fresh (`#743`): the re-serve legs re-stamping receipt time (route A), and the xStock feed's reconnect `snapshot` stamping the mark fresh (route B, the live case: PLTR's 20.8-hour frozen book on 2026-10-10).
| item | what shipped | code |
|---|---|---|
| P1 | only an `update` frame refreshes the xStock mark's age; any other frame carries it | `0a82d2a24`, `8db2d8904` |
| P1b | a replay-only mark is COLD: waits ≤ `min(cold_mark_max_ms = 15000, ceiling)`, counted, outside the skip streak; then `equity_tick_stale_cold_unobserved`. New knob + migration + warm-up check | `0a82d2a24`, `8db2d8904` |
| P2 | the stall watchdog measures silence from the end of the weekend close / `sun_reopen` pause | `0a82d2a24` |
| P3 | re-serves present their observation time (finite stamp required); `peekCachedPrice` reports observation age | `bc951c51b`, `e56275cf0`, `10a41786a` |
| P4 / 8g | the crypto exit leg judges the RETAINED `observedAt` (2 s) | `cde9cbb75`, `b75214481` |
| P4 / 8g-bis | the stored-row tripwire on `kraken_rest_rate_limited_reserve` rows (four arms; age arm narrowed at Step 8) | `cde9cbb75`, `b75214481`, `839aeb386`, `1e48298ab` |
| P5 | `#913` labels fixed by class; `WS_CACHE_FALLBACK_MS` deleted | `bc951c51b`, `e56275cf0`, `10a41786a` |

## 2. Every step, with its evidence
- **Step 1** — scope r2 APPROVED by Langston 2026-10-10 (four conditions; row 32 folded, `#913` re-homed): `Scope Files/B_PRICE_STALENESS_BOUND_SCOPE.md`.
- **Step 2** — audit + plan r3 APPROVED (r1 sent back on P6; r2 P1b; r3 three conditions): `Scope Files/B_PRICE_STALENESS_BOUND_PRE_AUDIT.md`.
- **Step 3** — built in three parts (`0a82d2a24`, `cde9cbb75`, `bc951c51b`), every new protection mutation-checked red.
- **Step 4** — APPROVED in three gates: gate 1 (two blockers + a condition, `8db2d8904`), gate 2 (two conditions, `b75214481`), gate 3 sent back then APPROVED r2 (`e56275cf0`, conditions `10a41786a`, titles `d1e97e664`). Change list: `Change Lists/B_PRICE_STALENESS_BOUND_STEP4_CHANGE_LIST.md`.
- **Step 5** — CI on the final head `10a41786a`: run `38158614608`, TypeScript Check (baseline gate), Test Suite, Build, Docker Build each success; on the deployed head `78f62ed01`: run `38188554376`, the same four each success.
- **Step 6** — `dt-deploy 78f62ed016a3453947280a35d6a6af028f0303df --by cc-c`, 2026-10-12T00:42:13Z, restart 639, migrate ran 786 ms before the restart, engine resumed; preserved files SHA256-identical. The deploy hold (`GOVERNANCE_EXCEPTIONS` 2026-10-11T16:45Z) released 00:45Z.
- **Step 7** — first reads against the pre-registration written before the deploy (`4cabb9adc`): cold state entered (`coldMarkTicksSinceStart` 0 → 93), 13 `EQUITY_MARK_COLD_CLEARED` (5 `expired=false`), no symbol decided before its clear 13/13, **PLTR's frozen book entered cold and cleared on a genuine update** (the discriminator); 8g exercised (2,316 refusals in 77 min, three unmapped symbols, each followed to a fresh REST read); tripwire unexercised (0 reserve rows in 24 h); the watchdog pair seen at 00:00:13 / 00:13:13Z on the OLD code (the control); UI payload honest.
- **Step 8** — CONFIRMED by Langston 2026-10-12 on reads 1, 2, 3 and 5 (re-derived on staging), (4) deferred; his finding on the tripwire's age arm → narrowed (decided exits only; 1,500 ms measured booking allowance; `OPERATOR_CLOSE_REASONS`) and APPROVED with one condition, folded (`1e48298ab`). **The narrowing is NOT yet deployed** — it rides the next deploy.

## 3. ⛔ PRE-REGISTERED CLOSE CRITERION (written 2026-10-12, before the data)
**Window: an EVENT — the Sunday reopen 2026-10-18 20:00 ET = 2026-10-19 00:00:00Z — read 00:00:00-00:47:00Z on a build containing P2 (any build ⊇ `78f62ed01`; the deployed sha is recorded at the read).**
- **PASS (P2):** ZERO `[B74][equity-spot][STALL]` lines in `error.log` between 2026-10-19 00:00:00Z and 00:35:00Z, AND ZERO `xstock-equity-feed-stall` rows minted in that span. (Control on the old code, 2026-10-12: exactly 2 lines, 00:00:13Z and 00:13:13Z.)
- **FAIL (P2):** any `[STALL]` line between 00:00:00Z and 00:35:00Z on such a build ⇒ the batch reopens at Step 3 for P2.
- **NOT a fail by itself:** a `[STALL]` line after 00:47:00Z — that is the watchdog doing its job on a real outage; read it against the feed's own liveness before judging.
- ✅ **DISCHARGED 2026-10-12:** the arm-(d) narrowing (`1e48298ab`) went live in CC-B's `e8f575d3c` deploy (2026-10-12T08:58:11Z, carried with CC-C's clearance); the run line now prints `operatorRows=0 operatorMaxAgeMs=none` (08:58:06Z `lookback=restart_24h`, 09:08:07Z `lookback=watermark`).
**Close = that data AND a decision on it** (close the batch on PASS; reopen Step 3 on FAIL).

## 4. Unproven, stated as unproven (none blocks the close; each is a standing mechanism that announces itself)
- **The tripwire on a real row** — 0 `kraken_rest_rate_limited_reserve` closes since the deploy. Falsified by: a reserve-priced close whose stored row breaks an arm with no alert raised.
- **The cold-unobserved escalation** — `equity_tick_stale_cold_unobserved` has not yet dominated a 40-tick streak, so its join/page routing is untested live (unit-tested). Falsified by: such a streak paging on a quiet/closed class.
- **The re-serve on screen** — no re-served price was on a display at the UI read. Falsified by: an RTB or Open Trades row showing a re-served price with a receipt-age (near 0) badge.
- **Route B's clock remains RECEIPT age** — the venue frame carries no timestamp; the fix makes it the receipt time of the last CHANGED quote, not an observation age. Stated, not fixable from this feed.

## 5. Governance files changed (the Step-10 ledger, transcribed from the governance commit)
CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | the batch entered as OPEN — OBSERVATION, with what it does and what it waits on |
| T1 | `PHASE_HISTORY.md` | ✅ | a plain-language entry for 2026-10-12 |
| T1 | `SPRINT_TO_LIVE_PLAN.md` (row 33) | ✅ | state cell to OBSERVATION with this report linked |
| T1 | `PHASE_19_PLAN.md` | N/A — no row there | the batch is sprint row 33, not a P19 batch |
| T1 | shared `MEMORY.md` + `MEMORY_CC_C.md` | ✅ | own file's position line to Step 10 / observation; the shared file has no line for this batch to change |
| T1 | the batch `SCOPE` | ✅ | r2, Step 1 (earlier commits) |
| T1 | the batch `PRE_AUDIT` | ✅ | r3, Step 2 (earlier commits) |
| T1 | the `COMPLETION_REPORT` | N/A — not yet | this progress report converts to it at the 10-19 read |
| T1 | the `Observation` column | ✅ | card to Observation; window = the 2026-10-19 00:00Z reopen read (§3) |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-C's row 33 to OBSERVATION; CC-A, CC-B, CC-INFRA not mine |
| T1 | Langston's `MEMORY.md` | ✅ | one line for this batch, replacing a 1,530-byte duplicate F-G-2 block (outside the ledger); load 357,475 → 356,396 B |
| T2 | `SYSTEM_MANUAL.md` | ✅ | §18.0.2 — observation vs receipt age, the crypto and xStock rules, the cold state, the stored-row check |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | §2.1.3 (the two deciding age readers, 8g, re-serve display, tripwire) and the mark-staleness section (the `observed` flag, cold state, 11 knobs, watchdog baseline) |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#913` CLOSED; `#743` both routes deployed, open on the window; `#951`'s 8g-bis residual discharged |
| T2 | `CHANGES_AND_FIXES.md` | N/A | no registered bug/risk row is touched; the defect is carried by `#743` |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no phase-level change |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | it inventories no `mark_staleness` knob; the module's knobs (now 11) are listed in the System Impact Map |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | no table or retention change |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | no VTS or onboarding change; the xStock working list has no staleness item |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning surfaced |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | the method did not change |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | his build did not change |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no stable rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no `CLAUDE.md` rule changed |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | `WS_CACHE_FALLBACK_MS` entry (`bc951c51b`) |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | two instances under `wrong-object` (a grouped query read as a row; the 12-vs-10 miscount) |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | the deploy-hold row and its release (2026-10-11/12) |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | the ack/resolve process did not change |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | the board's columns and fields did not change |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | the daily check is not part of this batch |
