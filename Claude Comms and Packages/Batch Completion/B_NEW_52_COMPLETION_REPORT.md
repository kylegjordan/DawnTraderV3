# B-NEW-52 Completion Report — Retire the fire-once weekend cron; make poll-reconcile the SSOT for the xStock weekend lifecycle

**Date:** 2026-06-06
**Deploy commit:** `6a8e5fd9c` (migration branch `migration/aws-supabase`)
**CI:** all-4-green on the head commit
**Status:** **CLOSED** — Langston Step-8 GREEN/CLOSED 2026-06-06. One by-design runtime proof pending (the natural Sunday-reopen test, alert `4cdec46d`, Sun 2026-06-07 8:10 PM ET).
**Active trading:** OFF throughout (VTS / passive learning only — zero capital risk).

---

## 1. Why this batch existed (Kyle-directed)

The xStock weekend pause/restart was driven by a **fire-once-a-week in-process `node-cron` alarm**. That alarm went stale for the **3rd time** despite three prior batches that added monitoring around it (B-NEW-36 poll-reconcile safety net, B-NEW-49 observability, B-NEW-50 next-fire readout fix, B-NEW-51 cadence-aware staleness + dedup):

- Last real cron fire: **2026-05-23**.
- **2026-05-30 occurrence: MISSED.**
- The 2026-06-06 occurrence only fired because a deploy happened to re-arm the timer ~20 minutes before the Friday boundary — luck, not reliability.

Kyle: *"We just tried to fix this on the last weekend shutdown, and you guys were convinced that it was fixed, and it's still breaking… if the backup method is the best way, then why don't we just use that as the primary source and remove the other one?… I don't want to just leave this one sitting around while it quietly becomes a bigger issue."*

**Root-cause class (the honest framing):** a once-weekly in-process alarm cannot survive the app's frequent mid-week deploys/restarts — the weekly arming repeatedly fails to survive a restart. Every prior fix patched *around* the alarm (observability, deploy-state arming) instead of removing it. Per **CLAUDE.md §5 #15 (NO PATCHES)** the correct fix is to remove the fragile dependency entirely rather than chase the exact internal failure mode a 4th time.

---

## 2. What shipped

**The fix:** retire the two weekend crons and make the two ALREADY-EXISTING restart-proof reconcilers the single source of truth:

1. **Boot reconciliation** — on every process start, reconcile the weekend-window-vs-scanner state (covers mid-window restarts).
2. **Continuous 30-second poll-reconcile** — `scanner.ts` clock-tick → `reconcileWindowState()`, which runs ABOVE the `if(isPaused)return` early-out (so it works while the scanner is paused — the Sunday-reopen invariant). It already calls the SAME shared `runWeekendShutdownCore`/`runWeekendRestartCore` (full shutdown = scanner pause + mark trades `weekend_suspended`; mirrored for Sunday restart) and is idempotent via an `inFlight` mutex.

A continuous self-correcting reconcile loop is strictly more reliable than a fire-once alarm and cannot be knocked out by a restart.

**Code changes:**
- **`server/services/session-lifecycle-controller.ts`:** removed `registerTimers()` (it registered ONLY the 2 weekend crons) + its `init()` call + dead callbacks `runWeekendShutdown`/`runWeekendRestart` + `writeMissedCronAlert` (function + 2 calls — else a weekly FALSE breakage alarm now that poll IS the normal path) + `node-cron`/`cronRegistry`/`logCronArm` imports; narrowed `TriggerSource` from `'cron'|'poll'|'boot'` → `'poll'|'boot'`; flipped `runShutdownFromPoll`/`runRestartFromPoll` to `runPrewarm:true` (folds the boundary OHLC pre-warm into the poll path so 60m+15m snapshots stay warm for DBS at the Sunday reopen). KEPT unchanged: `runWeekendShutdownCore`, `runWeekendRestartCore`, the poll calls, boot reconciliation.
- **`server/asset_classes/xstock_spot/scanner.ts`:** extracted the inline clock-tick closure into a named `handleTick()` (PURE refactor) with the reconcile-block byte-for-byte ABOVE `if(isPaused)return` (Sunday-reopen invariant preserved) + test seams (`_setIsPausedForTest`/`_setIsRunningForTest`/`_handleTickForTest`).
- **`server/index.ts`:** comment-only change (boot comment now notes the weekend cron is retired and poll-reconcile is the SSOT).
- **CRON-FIRE-VERIFIER:** no edit needed — it derives its expected-set dynamically from `cronRegistry.getAll()`, so removing the registrations auto-deregisters `weekend_shutdown`/`weekend_restart` (no more stale-flagging).
- **NEW test** `server/tests/unit/b-new-52-reconcile-ordering.test.ts` — restart-while-paused (reconcile runs above the early-out) + idempotency (repeated closed-window ticks don't double-suspend).

**Verification (bench):** tsc-baseline gate PASS (493 vs 494, zero new pairs); vitest 23/23 on affected/new suites + 35/35 cron-infra suites.

---

## 3. Scope-objectives checklist

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Remove the fragile weekend `node-cron` registration; keep boot + poll reconcile as SSOT | **YES** | `registerTimers()` + callbacks + imports removed; `TriggerSource` narrowed to `'poll'|'boot'`. Step-7: post-deploy boot showed **0 weekend-cron-register lines**. |
| 2 | Preserve the FULL shutdown/restart action via the poll path (trade-suspension + scanner pause/resume, not just pause) | **YES** | Poll calls the same `runWeekend*Core`; KEPT unchanged. Langston independently confirmed the poll path runs the full shutdown. |
| 3 | Preserve the Sunday-reopen invariant (reconcile must run while paused) | **YES** | `handleTick()` runs `reconcileWindowState()` ABOVE `if(isPaused)return`, byte-for-byte preserved; new test locks it. |
| 4 | Preserve the boundary pre-warm (don't lose the one extra thing the cron did) | **YES** | Poll path flipped to `runPrewarm:true`; folded into the poll-driven core. |
| 5 | No weekly false breakage alarm now that poll is the normal path | **YES** | `writeMissedCronAlert` removed; CRON-FIRE-VERIFIER auto-deregistered the weekend jobs. |
| 6 | Deploy survives a restart with correct state, no manual intervention | **YES** | Step-7: scanner correctly weekend-paused via boot-reconcile (NOT cron) after deploy; HTTP 200, no errors. |
| 7 | Idempotency / no double-suspend across repeated 30s ticks | **YES** | `inFlight` mutex + new idempotency test; 23/23 green. |
| 8 | Langston Step-4 code review + Step-8 verification | **YES** | Step-4 ACK on the embedded-diff change list; Step-8 GREEN/CLOSED 2026-06-06 (natural-test accepted, no hook). |
| 9 | The real runtime proof (a genuine poll-triggered reopen) | **PENDING (by design)** | No runtime trigger exists to force-induce drift (no scanner-resume admin endpoint; market-hours reads the real clock). Accepted path = the natural Sunday reopen. Alert `4cdec46d` fires Sun 2026-06-07 8:10 PM ET → 5-point checklist → ack. A failing checklist item (1)/(2) reopens B-NEW-52, not Step-8. |

---

## 4. Step-8 close (Langston, verbatim summary)

Langston independently verified Confirmation 1 against the live staging queue (alert `4cdec46d`, state `scheduled`, `triggers_at 2026-06-08T00:10:00Z` = Sun 8:10 PM ET, 5-point checklist in the body) and Confirmation 2 against the code (`runWeekendRestartCore`: the prewarm `status==='error'` branch sets `overallStatus`/`errorMessage` only — no `return`, no `throw` — so the try block runs unconditionally: `xstockSpotScanner.resume()` then `unmarkAllXstockWeekendSuspended`, then the audit row records the error without blocking; **a prewarm trip degrades telemetry, not the reopen**). He confirmed the honest nuance that the actual order is prewarm → resume → unsuspend → audit (resume before unsuspend; independent sequential awaits, harmless, doubly so with active trading OFF).

**Verdict:** *"FORMAL STEP-8 CLOSE — B-NEW-52: GREEN / CLOSED."* Cleared to Step-10 governance.

---

## 5. Runtime proof pending (the natural Sunday-reopen test)

**Alert `4cdec46d`** fires **Sun 2026-06-07 8:10 PM ET (Mon 00:10 UTC)** — 10 minutes after the 8 PM ET reopen. Whoever is at the keyboard when it fires (§10.5) runs the 5-point checklist:
1. xStock scanner RESUMED — new `pair_scan_archive_2026_06` rows for `asset_class=xstock_spot` after ~00:00 UTC.
2. `scheduled_tasks_audit` shows a weekend reopen row with `trigger_source = poll` or `boot` — **the first-ever real prod poll fire**.
3. Any `weekend_suspended` xStock trades un-suspended.
4. NO breakage false-alarm from the removed `writeMissedCronAlert`.
5. Then ack the alert.

This is the end-to-end proof of the retirement. A failure of item (1) or (2) reopens **B-NEW-52** (not Step-8).

---

## 6. Governance files changed (Step-10)

**Tier 1:**
- `1-system-manual/BATCH_CATALOG.md` — new B-NEW-52 row at the top of the B-NEW table.
- `1-system-manual/PHASE_HISTORY.md` — new B-NEW-52 closure paragraph after B-NEW-51.
- `.claude/memory/MEMORY.md` (+ user-cache truth file) — TRACK A updated to Step-8 CLOSED → governance.
- `Claude Comms and Packages/Batch Completion/B_NEW_52_COMPLETION_REPORT.md` — this file.
- (Scope/design: `Langston Design Asks/BNEW52_WEEKEND_CRON_RETIREMENT_DESIGN.md` + `Change Lists/BNEW52_CHANGE_LIST.md` + `Langston Design Asks/BNEW52_STEP8_CLOSE_CONFIRMATIONS.md`.)

**Tier 2:**
- `1-system-manual/CHANGES_AND_FIXES.md` — CLOSURE-2026-06-06 B-NEW-52 block (new latest).
- `1-system-manual/RUNNING_ISSUES.md` — #202 recurrence + ELEVATED note (2nd occurrence in 2 deploys); #198 note (weekend jobs retired, closes the practical weekend-job angle of #164/#165/#198).
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — §9.10.b rewritten (two-path poll+boot model, node-cron path retired) + the historical "Session lifecycle controller (NEW module)" entry annotated.
- `1-system-manual/SYSTEM_MANUAL.md` — "Off-hours session-lifecycle architecture" Layer 2: B-NEW-52 update banner + "Scheduled timers RETIRED" + the two `*Core` hooks reframed as poll/boot-invoked + the prewarm-non-blocking note on the restart core.
- Langston `/home/langston/MEMORY.md` (Hetzner) — synced per §10.b.

**No SQL migration this batch** (pure code/refactor; nothing in `module_constants`/schema). No new dependency. tsc baseline unchanged (493).

---

## 7. Follow-ups / open items

- **#202 deploy-hygiene ELEVATED** — recurred during this deploy (2nd time in 2 deploys). The `.gitignore` route for the four runtime-tracked dirs (`audit`/`bridge`/`diagnostics`/`logs`) is now the clear next fix to stop ad-hoc clearing on every deploy.
- **The Sunday-reopen verification** (alert `4cdec46d`) is the only open thread; it is by-design and self-surfacing via §10.5.

---

## 8. Sync gate (§7.1)

Google Drive (source of truth) ↔ GitHub ↔ staging confirmed in sync at close: from the Google Drive folder `git rev-list --count HEAD..origin/migration/aws-supabase = 0`; staging deployed `6a8e5fd9c`. Governance commit pushed FROM the Google Drive folder.
