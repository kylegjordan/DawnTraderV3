# B-NEW-52 — Retire the fire-once weekend cron; make the poll-reconcile the single source of truth — DESIGN (Kyle-directed 2026-06-06)

**For Langston design review (before any change). No gdrive — use `ssh staging`.**

## Why (Kyle directive, 2026-06-06)
`weekend_shutdown`/`weekend_restart` have gone STALE AGAIN (last fired 2026-05-23; CRON-FIRE-VERIFIER flagged it 06-06). This is the **3rd recurrence** despite B-NEW-49 (#161/#162/#163). Kyle: "we keep being convinced it's fixed and it keeps breaking… if the backup is the best way, why not make that the primary and remove the other one." Agreed — and it's the structural NO-PATCHES answer.

## Root cause (honest framing)
The weekend lifecycle depends on a **fire-once-a-week in-process node-cron alarm**. That class of mechanism is inherently fragile: the app is deployed/restarted multiple times a week (e.g. the B.5 W2.1 deploy 2026-06-06), and the once-weekly cron repeatedly fails to fire at its next Fri/Sun 20:00 ET occurrence after a mid-week restart (registration/arming does not reliably survive the restart). **B-NEW-49 added a MONITOR that now reliably DETECTS the miss (good — that's why we saw it) but did not remove the fragile alarm.** Every prior fix patched *around* the alarm (observability, deploy-state arming) instead of removing it. The exact internal failure mode (orphaned-closure vs un-armed-gate vs re-registration) is secondary: **the fix removes the fragile dependency entirely rather than chasing the precise failure for a 4th time.** (Agent traced it to the cron-registration/closure path in `session-lifecycle-controller.ts:254-293`; you should confirm on your side.)

## The proposal
**Retire the weekend crons. Make the existing continuous reconcile the single source of truth.** Two mechanisms already exist and are restart-proof:
1. **Boot reconciliation** (`session-lifecycle-controller.ts:~180-252`) — on every start, reconciles current weekend window vs scanner state. Covers mid-window restarts.
2. **30-second poll-reconcile** (`scanner.ts:~406-428` clock-tick → `runShutdownFromPoll` / `runRestartFromPoll`, `session-lifecycle-controller.ts:~355-412`) — every 30s asks "should we be shut down/open right now?" and self-corrects.

Per the investigation, the poll path **already calls the same shared core as the cron** — pauses the scanner AND marks open trades `weekend_suspended` (it is the FULL shutdown, not just scanner-pause), and mirrors it for Sunday restart. It's idempotent (an `inFlight` mutex + `pause()`/`markSuspended` are no-ops when already in state), so running every 30s is safe. **A continuous self-correcting reconcile loop is strictly more reliable than a fire-once alarm and cannot be knocked out by a restart.**

## The change (small)
1. **Stop registering the weekend crons** — remove the `registerTimers()` weekend-cron scheduling from `init()`. Keep boot-reconciliation + poll-reconcile.
2. **Re-label** the poll path so its audit/alert no longer reads "poll-path CAUGHT UP / cron regressed" (it's now the primary, not a fallback) — `trigger_source` becomes the normal path.
3. **Pre-warm** (the one thing the boundary-cron did extra — a best-effort data snapshot at the exact Fri 20:00 boundary): **DESIGN QUESTION FOR YOU** — (a) drop it (market closed all weekend, low value), (b) move it into the poll path's shutdown core, or (c) a separate small daily pre-warm schedule decoupled from the weekend lifecycle. My lean: (b) fold a best-effort pre-warm into the shutdown core so it still happens, just driven by the reconcile instead of the alarm.
4. **CRON-FIRE-VERIFIER**: deregister the weekend jobs from the verifier's expected set (they no longer exist) so it doesn't flag them as stale forever.

## Verification (the key part — must prove it survives a deploy)
Standard pipeline (CI green → deploy → verify), PLUS the specific failure-mode test: after deploy, confirm the scanner stays correctly paused/resumed across the window, and — the thing that's been breaking — **deploy/restart the app mid-test and confirm the reconcile re-establishes correct state within 30s with no manual intervention.** Unit test the reconcile idempotency (no double-suspend, no flapping).

## Asks for you
1. Agree with retiring the weekend crons and making boot + poll reconcile the SSOT? Any reliability gap I'm missing (e.g. a window where neither boot nor poll covers)?
2. Pre-warm: (a) drop / (b) fold into shutdown core / (c) separate daily schedule?
3. Confirm (you can verify on staging) that the poll path genuinely runs the FULL shutdown (trade-suspension included), so retiring the cron loses no functional action — only the boundary pre-warm.
4. Anything about the Sunday RESTART side that the poll-reconcile handles differently than shutdown and needs care.
