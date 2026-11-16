# B-ARCHIVE-NETWORK-RETRY — Scope r1 (Step 1)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Reviewer:** Langston · **Issue:** `#705` (the 2026-11-16 item) · **Agreed:** Kyle, KD-97 (2026-11-16, `pm/DECISIONS.md` row KD-97: *"Yes, too old fix for the price recorder."*, PM transcript `C:/Users/kyleg/.claude/projects/C--DawnTraderV3-pm/994e6488-db2e-49a0-8e00-4d3635208c2d.jsonl`, user turn 2026-11-16T12:45:21Z, answering PM's "the two outage fixes"). Taken out of `B-ARCHIVE-WRITER-LIFECYCLE` (sprint row 119, CC-B; `PHASE_19_PLAN` `3b.h-8`) for this fix only.
**Plan line:** `SPRINT_TO_LIVE_PLAN.md` §0a, CC-A list item 3 (added in this commit).

## What this batch is for, in one paragraph
In the 2026-11-16 staging database outage (04:20:40 → 05:20:28Z; Supabase refused staging's address for ~60 min after four failed logins from a reviewer's ad hoc query, `#1259`), the price recorders threw away every batch they could not save, instead of holding it and retrying. The writers' retry decision (`isTransientWriteError`) did not recognise "connection refused" and treats anything it does not recognise as permanent, so up to 132,466 rows were discarded (ticker snapshots 109,560, which cannot be rebuilt; bars 22,906; Infra's count, upper bounds). This batch makes network-unreachable errors retryable, makes a buffer that overflows during a long outage raise its own alert, and states, from measured rates, how long each writer can ride out an outage.

## Objectives
| # | objective | verified by |
|---|---|---|
| **OBJ-1** | `isTransientWriteError` treats `econnrefused`, `ehostunreach`, `enetunreach` and `eai_again` as TRANSIENT; `enotfound` stays PERMANENT (the wrong-host configuration error); every existing verdict is unchanged (statement timeout and `canceling statement` permanent, read timeout permanent, unknown permanent). | Unit tests with the REAL message strings from staging's `error.log` (2026-11-16, the 3,036 `PERMANENT flush failure` lines — the classifier run over every distinct message shape, not a hand-written fixture alone), plus one per new code and `enotfound`; each new arm mutation-proved (remove it → its test fails). The existing F-G-1 fence stays green. |
| **OBJ-2** | A shed at the buffer cap raises the writer's OWN alert, per writer:class — `ohlc-writer-shed-<class>` (the three classes that shed; `xstock_spot` bars keep their fail-stop and its alert) and `ticker-writer-shed-<class>` (all four). Shaped like `alertPermanentWriteFailure`: one per writer:class per window, the in-process latch cleared by a successful flush and expiring at `ALERT_RE_ARM_MS`, released if the raise fails, deduplicated at `addAlert` by key while unresolved. The body names the class, the rows shed, the cap and the measured minutes of cover. | Unit tests: raises once under repeated sheds; a successful flush clears it so the next shed raises; a failed raise releases the latch; no alert below the cap. Each mutation-proved (latch removed, clear removed, call removed). |
| **OBJ-3** | How long each buffer holds an outage, and what a full set of buffers costs in memory, is MEASURED and written into the code comment and the System Impact Map before shipping. | Step 2: per-class arrival rates over the full `out*.log` reach (a stated window, rolling hourly — not a snapshot), minutes covered at median / p90 / peak; the heap bytes of one full buffer per writer measured, and the worst case (all eight full) set against staging's free memory. |
| **OBJ-4** | The deployed process classifies a refused connection as transient. | Step 7: deployed sha confirmed in `dist/BUILD_SHA`; the classifier at the DEPLOYED build run over the real 2026-11-16 message population returns transient for every refused/unreachable line and permanent for a control line; flushes continue on all eight writer:class pairs after the restart (flush lines present, no new writer alerts). An actual outage cannot be induced safely; that leg is stated as unexercised. |

## Preliminary measurement (rolling hourly, `out__*` + `out.log`, 2026-11-10 14Z → 2026-11-16 12Z, 108-143 hours per class; Step 2 re-derives it)
Minutes of outage a 50,000-row buffer (`RETRY_BUFFER_MAX`, `ohlc-batch-writer.ts:79`) holds, at the median / p90 / peak hourly rate:
| writer : class | median | p90 | peak hour |
|---|---:|---:|---:|
| ticker : xstock_spot | 63 | **9** | **9** |
| ticker : crypto_perp | 63 | 63 | 62 |
| ticker : crypto_spot | 206 | 133 | 82 |
| ticker : xstock_perp | 376 | 370 | 367 |
| bars : crypto_spot | 177 | 120 | 69 |
| bars : crypto_perp | 272 | 10 | 4 |
| bars : xstock_perp | 5,000 | 146 | 74 |
| bars : xstock_spot | fail-stop (not shed) | | |
⚠️ The bar rates for the futures classes count the REST poller's re-sent 2,000-bar windows, so their p90/peak overstate new data. ⚠️ **The xStock spot ticker buffer holds about 9 minutes at its busy hours.** This batch does NOT change the cap (judgement call J3).

## 1.a Architectural read
- `SYSTEM_IMPACT_MAP.md` §2.6b (the one bar writer for all four `*_ohlc_1m` tables; rows leave the buffer only after a successful write; the xStock path through `writeXstockProjectionAttempts`) and the Layer-9 table rows 4, 5 and 22 (5 s flush, 2-slot semaphore, 1,000-row chunks). Open edges named there: `#1034`/`#1032` (`3b.h-8`), backoff `#1082` (`3b.h-9`).
- `SYSTEM_MANUAL.md`: no section describes the writers' error classification (searched `batch writer`, `transient`); the System Manual is judged N/A unless Step 2 finds otherwise.
- **Census of every caller (git grep at `5007bc94f`):** `isTransientWriteError` — `ohlc-batch-writer.ts:667` and `ticker-batch-writer.ts:163`, plus the fence `f-g-1-writer-retry-fence.test.ts`. `alertPermanentWriteFailure` / `clearPermanentAlertLatch` — the two writers; `ohlc-frame-skip-tracker.ts` only cites its mechanics in comments. `RETRY_BUFFER_MAX` — the two writers and two test files. No other production caller.

## 1.b Provenance read
Corpora searched: `RUNNING_ISSUES.md` (`#705`, `#1082`, `#1034`, `#1032`), `BATCH_CATALOG.md`, `SYSTEM_IMPACT_MAP.md`, `git log -S` (not path-limited) for `isTransientWriteError`, `RETRY_BUFFER_MAX`.
- **TIER 1 — `isTransientWriteError`** (behaviour changes). Introduced `98640f00a` (2026-08-28, F-G-1 OBJ-9), quoted: *"UNKNOWN ERRORS ARE PERMANENT BY DEFAULT, deliberately. The opposite default retries an unrecognised permanent fault forever. A wrongly-dropped transient batch costs one flush window; a wrongly-retained permanent one costs the process."* and *"Transient means the rows would likely succeed later -- deadlock, pool-slot timeout, dropped connection -- and those are retained."* The default is KEPT; refused/unreachable is a named transient of the "dropped connection" kind, and the OOM the default guards against is answered by the bound (`:79`) plus OBJ-2's alert. Prior decision on this list: `#705` 2026-10-17, Langston refused `query read timeout` as transient (a permanently-slow write can only surface that way) — untouched here. No decision excludes `econnrefused` (a corpus grep finds only test-environment mentions). **Disposition (2): relevant, needs updating to today's intent.**
- **TIER 1 — the shed paths** (`ohlc-batch-writer.ts:708-717`, `ticker-batch-writer.ts:173-180`). Same commit, quoted: *"It is not silent -- the shed is counted and logged. A bound that drops quietly is the defect; a bound that drops loudly is the design."* Langston, 2026-11-16 (Discord `1571764238106759209`): stderr is not loud enough — pool alerts fired inside 71 s and still did not say which class lost what, and `crypto_spot` (WS-only) sheds silently where `xstock_spot` bars fail-stop with an alert. **Disposition (2).**
- **TIER 2 — `alertPermanentWriteFailure` / the latch** (`:256-325`): the shape OBJ-2 copies (BLOCKER-11: a latch must clear on success and expire). Read, not changed. **(1).**
- **TIER 2 — `RETRY_BUFFER_MAX`** (`:79`): the bound that makes retrying safe. Read, not changed. **(1).**

## Out of scope (each already homed)
- Retry backoff — `#1082`, `B-ARCHIVE-RETRY-BACKOFF` (`3b.h-9`). With refused connections retained, each 5 s flush re-attempts; a refused connect fails in ~40 ms at the first chunk and is not a login, so it cannot extend a Supabase ban.
- The ticker writer's double insert after a mid-flush failure — `#1032` (`3b.h-8`). ⚠️ Stated residual: a ban that starts mid-flush (chunks 1..k-1 committed, chunk k refused) now retains and re-inserts the committed chunks, which `#1032` already describes for the existing transient codes.
- The buffer cap's size, placement and the shutdown drain — `#1034` (`3b.h-8`).
- Write-timeout ordering — `B-WRITE-TIMEOUT-ORDERING` (after-live list).

## Judgement calls for Langston
- **J1** — the alert severity for a shed: `critical` / `breakage` like the permanent alert (a shed is unrecoverable loss on three of the seven shedding pairs), or `warning`. Proposed: `critical`.
- **J2** — the shed alert also covers `ticker:xstock_spot` (no fail-stop on the ticker leg). Proposed: yes, all four ticker classes.
- **J3** — the cap stays 50,000 per writer:class; OBJ-3 states the cover and the memory, and if the xStock spot ticker's ~9 minutes at peak is judged too short, raising it is a separate decision for Kyle's list, not folded here.
- **J4** — OBJ-4's live leg cannot reproduce an outage; the deployed classifier run over the real message population is the proposed substitute, labelled as such.

## Delivery
Card: the delivery board is retired for status (KD-35); status lives in `SPRINT_TO_LIVE_PLAN.md` §0a CC-A list item 3.
