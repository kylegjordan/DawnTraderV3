# B-RTB-REFRESH-CONSOLIDATE — OBJ-1 COMPLETION REPORT (#532)

**change-class: architecture** · **Owner:** CC-A · **Review:** Langston (Step-4 APPROVED, all three asks independently re-derived at the ref)
**Commits:** `d2306518e` (the retirement) + `373d73612` (stale canonical-claim fix) · **CI:** 4-green (run 29960947657) · **Deployed + verified 2026-07-22**

> **SCOPE NOTE:** this closes **OBJ-1 only**. OBJ-2b / OBJ-3 / OBJ-4 / OBJ-5 / OBJ-6 remain open on #532. **The batch is NOT closed.**

---

## 1. WHAT WAS WRONG

Two independent schedulers ran over the **same** ready-to-buy queue for roughly seven months, double-processing every queued signal into the SQE (audit: `RTB_REFRESH_AUDIT_2026-07-18.md`):

- **Mechanism A** — per-signal, Central-Clock-driven (~30s), `refreshSingleSignal`. Undocumented.
- **Mechanism B** — the bucketed `RTBRefreshService` (15s micro / 120s macro / 8 buckets). Documented.

## 2. WHY THIS WAS A REMOVAL, NOT A REDESIGN — AND WHERE MY FRAMING WAS WRONG

**Kyle corrected the central premise, and the record confirms him.** I had been carrying the 30s-to-120s cadence change as an **open risk** requiring a fresh edge-horizon measurement before anything could be cut. It was not open. It was **settled in December 2025**:

- **`7a029f390` (2025-12-23)** introduces the bucketed service: *"runs on a 15-second interval, **decoupling it from the FX5 scan loop**."*
- The follow-on chain is all load work: `7b31e8665` (dynamic pool broadcasting + **load balancing**), `5aee5c0f9` (**adaptive pool sizing**), `3ebb1f3e2` (bucket filtering), `e5660693b` (clock-tick sync).
- **The single-path 30s refresh — recomputing every signal every cycle — was under strain and could not keep up. The bucketed design was its replacement, and the longer gap between per-signal refreshes was weighed and ACCEPTED as part of that switch** (Kyle, 2026-07-22).
- `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md:125-127,195` documents **ONE** RTB refresh — the bucketed one.

⇒ **Mechanism A was never meant to coexist with B. It simply never got unplugged.** The cadence change is an already-priced trade, not a new risk, and my Step-2 "open cadence question" was re-litigating a decision that had already been made deliberately with that exact tradeoff on the table.

**Kyle's governing point, which outlives this batch:** an old architectural decision *can* be revisited — the rule is not that it is sacred. The rule is that you read its history and intent **first**, then judge whether it still fits. **Whether 120s should now be tightened remains a live and legitimate question**, explicitly left open, and is **not foreclosed** by this retirement, since the intervals are configuration.

## 3. WHAT SHIPPED

**Deleted:** `executePerSignalRefresh` · `refreshSingleSignal` · `startRefreshCycle` · `stopRefreshCycle` · the `centralClock.subscribe('RTB_${mode}')` subscription · the `clockTickHandlers` and `refreshIntervals` fields · `RTB_REFRESH_INTERVAL_SECONDS` · the orphaned `executeRefreshCycle` (zero callers, swept per §15) · `isRefreshCycleRunning`. Starters removed from `active-execution-engine.ts` (start plus both stop sites) and `trading-bootstrap.ts`.

**PRESERVED:** `reEvaluateQueue` — operator-triggered via `routes.ts`, never part of Mechanism A (Langston flagged this explicitly at Step-1).

**Safe by construction:** A's data semantics were extracted verbatim into the shared `acquireRefreshedInputs` at `b514fbc73` **before** this cut, so the survivor already ran identical logic. Nothing was lost but the duplicate scheduler.

**Method:** every cut boundary was asserted in-script before deletion; the removed code is archived to `1-system-manual/_archive/deleted-code/ready_to_buy_service.mechanism-a.ts.removed` per rule 18.

## 4. FOUND ALONG THE WAY

1. **`isRefreshCycleRunning` returned `false` unconditionally, forever.** It read `refreshIntervals.has(mode)` on a map that was declared, read, and deleted from — but **never once `.set`** anywhere in the file. Its one consumer, `GET /api/diagnostics/rtb-queue/refresher-status`, has reported *"refresh cycle not running"* on a healthy system since inception. **Rule-24 class (3), legacy that no longer fits intent** — Langston concurred: not (1), because this batch did not introduce it; not (2), because it is affirmatively wrong rather than merely unaddressed. Deleted; the endpoint now asks `rtbRefreshService.isActive()` **directly**, not via `readyToBuyService`, because `rtb-refresh-service.ts:22` imports that module and the reverse call would close an import cycle.

2. **The queue's promotion-exit columns are dead.** `rtb_signals.promoted_at` and `.promoted_trade_id` are **never populated — 0 of 101 rows, all time** — while promotions demonstrably occur (8 positions opened 07-22, 4 on 07-21, verified independently from `active_open_positions`). Rows are deleted on promotion instead. **Dwell-to-promotion is therefore unmeasurable from the queue's own record.** Filed to **OBJ-4** ("every queue exit counted, no silent deletes"); not fixed here. Recorded plainly because the empty query result means *the instrument does not exist*, **not** *the event does not occur* — the same misreading that cost several wrong calls earlier in the day.

3. **A test that would have silently hollowed out.** The score-timing invariant sliced `acquireRefreshedInputs` using `refreshSingleSignal` as its END delimiter. With that method deleted, `indexOf` returns `-1`, `slice(m, -1)` widens the slice to the whole rest of the file, and **the assertions still pass while testing nothing at all.** Re-pointed to `refreshAndRank` with both indices asserted, so a future rename fails loudly instead of quietly.

4. **Stale canonical claim (Langston's Step-4 catch).** `server/index.ts:1436-1439` asserted that `ReadyToBuyService.startRefreshCycle` was "canonical" — a method this batch deleted. Left standing, it is the §15 lingering-reference trap: a later reader takes a deleted method for the canonical one and resurrects it. Corrected in `373d73612`.

## 5. VERIFICATION

- **tsc baseline:** no regressions above baseline, on a clean private bench cloned at origin head. (The shared `C:\dev` bench is 186 commits behind and carries two other sessions' live work, which was left untouched per Langston's ruling.)
- **Tests:** **2409 passed** with the changes versus **2405 pristine** — the +4 are the new fences. **10 collection failures, identical in both runs** (the bench has no `DATABASE_URL`). **A/B'd by stashing, not asserted.**
- **Fences added (4):** the per-signal chain is gone · the second clock subscription is gone · the shared acquisition survives with the bucketed caller · `reEvaluateQueue` preserved. The shared-acquisition caller count now pins **`toBe(1)`**; it was `toBe(2)`, which pinned the deliberate transition state, so 2 to 1 is the batch succeeding rather than a regression.
- **CI:** all four jobs green, run 29960947657.
- **Retirement proof:** **zero** `[A3.R9.3][RTB_REFRESH][TICK]` lines after the restart (timestamp-filtered count = 0; last A tick 22:01:41, restart approximately 22:02), while `[RTBRefresh][CYCLE_COMPLETE]` continues rotating buckets (bucket 1: 13 signals, bucket 2: 12).
- **Liveness, independently re-derived by Langston:** `rtbRefreshService.start()` at `server/index.ts:348` is unconditional at boot, beside `priceCache.initialize()` — **not** engine-gated, which is why removing A's engine-lifecycle starters cannot stop refreshing. This was the one outcome that had to be ruled out before cutting.
- **Measured freshness delta:** staleness across all 101 queued signals moved from **5–20s** (both mechanisms live) to **min 11s / p50 73s / p90 76s / max 77s** immediately post-deploy.
  - ⚠️ **CORRECTION (2026-07-22, filed as #570):** that max-77s reading was a **POST-RESTART SNAPSHOT, not steady state** (CLAUDE.md rule 13). A later steady-state measurement found p50 ~74s (healthy) but a **stale tail**: 12/100 signals frozen, all hashing to **bucket 2**, which fires but does not refresh its members. This is a **pre-existing single-bucket coverage defect** (froze 22 min before this batch's follow-up deploy; causally not ours), homed to **#532/OBJ-4**. Queue-level coverage is complete (all 8 buckets assigned + fire); bucket 2's refresh not landing is the gap. **The honest statement: p50 converges on design; a pre-existing bucket-2 defect leaves a stale tail that a restart masks.**

✅ **§9.3 UI VERIFICATION — NOW DONE (2026-07-23).** Initially flagged NOT done because the in-app browser has its own un-logged-in session; resolved by using Kyle's own logged-in Chrome (the `claude-in-chrome` surface). Navigated the live Paper Trading page and opened the **Ready-to-Buy tab**: all **100 signals render cleanly**, ranked by RankingScore, every field populated (price / entry / target / stop / qty / strategy / regime / net-EV / duration / status), no broken layout or `--`/undefined values, count matches the DB. The surviving refresh mechanism's output displays correctly. **Note:** the #570 frozen bucket-2 signals (LTC/USD, LTC/EUR, ETH/GBP, HYPE/USD) appear here as **"reconfirmed"** — the UI keys on status, not `last_refreshed_at`, so #570 is invisible on this surface too (consistent with the finding, not a second bug).

## 6. GOVERNANCE FILES UPDATED

`SYSTEM_IMPACT_MAP.md` (retirement, measured delta, the provenance correction, both findings) · `DELETED_COMPONENTS_LOG.md` · `BATCH_CATALOG.md` · `RUNNING_ISSUES.md` (#532 core defect closed; issue stays OPEN for the remaining objectives) · `PHASE_19_PLAN.md` · `PHASE_HISTORY.md` · `SYSTEM_MANUAL.md` · this report.

**SYSTEM_MANUAL applicability:** applicable and updated — the refresh mechanism is signal-pipeline architecture, not display or data-quality.

## 7. STATUS

**OBJ-1 COMPLETE** — implemented, reviewed, CI-green, deployed, and verified post-deploy. **#532 remains OPEN** for OBJ-2b / OBJ-3 / OBJ-4 / OBJ-5 / OBJ-6. **The batch is not closed, and is not claimed as closed.**
