# B-NEW-40 — Change List for Langston Code-Diff Review (Step 4)

**Batch:** B-NEW-40 (pg pool keepalive + TEC refresh timeout — silent TCP death root-cause fix + alerts infrastructure)
**Branch:** `migration/aws-supabase` (working tree, not yet pushed)
**Baseline commit:** `d2f4db8cd` (Sustainability gate investigation: structural redesign options)
**Author:** Claude Code
**Date:** 2026-05-17
**Step 1 + Step 2 sign-off:** Langston APPROVED (5 corrections + 6 Q-Alerts refinements applied)

---

## Diff Summary

```
 1-system-manual/BATCH_CATALOG.md            |   1 +
 1-system-manual/CHANGES_AND_FIXES.md        |  40 ++++
 1-system-manual/PHASE_HISTORY.md            |  42 +++++
 1-system-manual/SYSTEM_IMPACT_MAP.md        |  66 ++++++--
 CLAUDE.md                                   |  26 +++
 client/src/App.tsx                          |   2 +
 client/src/components/layout/sidebar.tsx    |   4 +-
 package.json                                |   4 +-
 server/db.ts                                |  78 +++++++++-
 server/routes.ts                            | 141 +++++++++++++++++-
 server/services/trailing-exit-controller.ts | 110 +++++++++++++-
 11 files changed, 507 insertions(+), 7 deletions(-)
```

Plus 7 NEW files (1,994 LOC total across scripts/tests/UI/scope).

---

## 1. Core code (objectives 2.1–2.3)

| File | Status | Lines | One-liner |
|---|---|---|---|
| `server/db.ts` | MODIFIED | +78/-0 | pg pool hardening: `keepAlive: true`, `keepAliveInitialDelayMillis: 10_000`, `query_timeout: 30_000`, `idleTimeoutMillis: 30_000`, `max: 10`, `application_name: 'dawntrader_main'` + boot-time `[DB_POOL_INIT]` log. **Fixes silent TCP path death (root cause of TEC_STALE).** |
| `server/services/trailing-exit-controller.ts` | MODIFIED | +110/-3 | 45s `Promise.race` timeout fence at L235 wrapping `refreshTECConfigForClass()`; distinct `[TEC_REFRESH_TIMEOUT]` log tag; `tecRefreshFailCount` increment in `.catch`; `tecConfigRefreshInFlight.delete()` in `.finally` (guarantees Map release even on hang). NEW: `getTECDiagnostics()` export + `TECDiagnosticSnapshot` interface returning per-class state map. **Fixes B79.TEC inFlight-Map fire-and-forget amplifier.** |
| `server/routes.ts` | MODIFIED | +141/-0 | NEW `GET /api/diagnostics/tec-config` (returns TEC diagnostic snapshot enriched with `centralClock.getHealth()`); NEW `GET /api/system-alerts` (lists active + scheduled, counts surfaceable-now); NEW `POST /api/system-alerts/:id/acknowledge` (auth-gated ack with audit field). All three endpoints behind `authenticateToken`. |

## 2. New library + CLI (objective 2.8)

| File | Status | Lines | One-liner |
|---|---|---|---|
| `server/services/system-alerts.ts` | NEW | 321 | Alerts library: O_EXCL file lock (`fs.openSync` w/ `O_EXCL`, no new npm dep), `withLock<T>()`, `readAllAlerts()`, parse-skip-on-error w/ one-line warning, `writeAllAlertsAtomic()` (temp-file + rename), `addAlert()`, `fireDue()`, `ackAlert()`, `resolveAlert()`, `listSurfaceable()`. Lock retry 50× @ 100ms = 5s ceiling; stale-lock break at 30s. `SystemAlert` interface w/ `schema_version`, state machine (scheduled→active→acknowledged→resolved), severity ∈ {info, warning, critical}, optional `recurrence_interval_seconds`. **First-deploy bootstrap via `ensureFileExists()` (creates empty file before first write).** |
| `scripts/system-alerts.ts` | NEW | 229 | CLI wrapper: `add | fire-due | list | ack | resolve`. Telegram push for critical severity using `CCDT_BOT_TOKEN_FILE` env var → chat_id 8734856533 (Kyle DM). Invoked by `system-alerts-dispatcher.timer` every 15min on staging. |
| `scripts/b-new-40-soak-verify.ts` | NEW | 225 | 14-day verification script. Greps logs from `--deploy-ts` forward for FAIL_SIGNATURES (`TEC_STALE_FAIL_CLOSED`) and INFO_SIGNATURES (`TEC_REFRESH_TIMEOUT`, `TEC_REFRESH_FAIL`). **Presence-not-count criterion (Langston Q6):** ANY post-deploy FAIL signature = exit 1; INFO events = "fence working as designed." Per-day histogram for context. Optional `--ack-alert-id` to auto-ack soak alert on PASS. |

## 3. Hostile test (objective 2.5)

| File | Status | Lines | One-liner |
|---|---|---|---|
| `server/tests/unit/b-new-40-tec-refresh-hang.test.ts` | NEW | 188 | Vitest unit test simulating hung-promise (`new Promise(() => {})`) on `refreshTECConfigForClass`. **5 assertions (a–e):** (a) `inFlight` Map releases within 45s+ε; (b) `tecRefreshFailCount` increments by 1; (c) `[TEC_REFRESH_TIMEOUT]` log fires exactly once; (d) cached config returned until 5-min staleness ceiling; (e) past ceiling throws `TEC_STALE_FAIL_CLOSED`. Uses vitest fake timers. |

## 4. UI (objective 2.8.e)

| File | Status | Lines | One-liner |
|---|---|---|---|
| `client/src/pages/system-alerts.tsx` | NEW | 246 | "System Alerts" dashboard tab. 30s polling via TanStack Query. Color-coded severity chips (red/amber/blue), state chips (orange/gray/green/slate), ack button, "Ack as" actor identification input. Empty-state message. About-this-tab disclosure summarising scope §2.8. Minimum viable per scope §2.8.e; UI polish (filter/sort/search/detail/history) explicitly deferred to future batch (scope §3 out-of-scope). |
| `client/src/App.tsx` | MODIFIED | +2/-0 | Lazy import `SystemAlertsPage`; route `/system-alerts`. |
| `client/src/components/layout/sidebar.tsx` | MODIFIED | +4/-1 | Nav entry "System Alerts" w/ Bell icon, slotted between "System Monitoring" and "Settings". |

## 5. Package.json

| File | Status | One-liner |
|---|---|---|
| `package.json` | MODIFIED | +2 scripts: `system-alerts` (CLI) + `b-new-40:soak-verify`. No new dependencies (file-locking uses Node built-in `fs.openSync` w/ `O_EXCL`). |

## 6. Governance (Tier 1 + Tier 2 per CLAUDE.md §3)

| File | Status | Lines | One-liner |
|---|---|---|---|
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | MODIFIED | +59/-7 | New "Recent Additions (B-NEW-40)" section: `server/services/system-alerts.ts`, `scripts/system-alerts.ts`, `scripts/b-new-40-soak-verify.ts`, `client/src/pages/system-alerts.tsx`, three new routes. Updated `server/db.ts` entry (line 724) to reflect new pool config + bidirectional link to TEC. **Mandatory per CLAUDE.md §9 (any modified or new component requires SIM update).** |
| `1-system-manual/BATCH_CATALOG.md` | MODIFIED | +1 row | B-NEW-40 row inserted above B-NEW-37 with batch ID, date, scope summary, status, governance refs. |
| `1-system-manual/CHANGES_AND_FIXES.md` | MODIFIED | +40 lines | `INFRA-2026-05-17-A` entry at top: cause-trail (silent TCP path death + B79.TEC amplifier), fix (pg pool keepalive + 45s Promise.race), verification (presence-not-count over 14 days), rollback plan. |
| `1-system-manual/PHASE_HISTORY.md` | MODIFIED | +42 lines | New "Phase 24 INFRASTRUCTURE HARDENING" subsection. Captures 5 lessons: (1) default `keepAlive: false` lethal on long-haul DB connections; (2) fire-and-forget promises in coalescing maps need Promise.race fences; (3) catch-handler-never-fired is a diagnostic signal (4832 STALE vs 0 REFRESH_FAIL); (4) pre-existing latent network behavior absorbed by old await architecture surfaced after B79.TEC redesign; (5) silent-TCP-death class of bugs needs OS-level diagnostic capture (`ss -tnpi`). |
| `CLAUDE.md` | MODIFIED | +26 lines | §10.5 NEW: mandatory per-turn alerts check. Every CC + Langston session must read `/var/log/dawntrader/system-alerts.jsonl` BEFORE responding to any user message; surface active+unacked entries in plain language; ack on action. **Per Kyle directive 2026-05-17 (sessions can be weeks apart; per-turn ≠ session-start).** |

## 7. Scope + pre-audit + design asks (already approved)

| File | Status | Lines | One-liner |
|---|---|---|---|
| `Claude Comms and Packages/Scope Files/B_NEW_40_SCOPE.md` | NEW | 303 | Step 1 scope: 9 objectives (2.1 pool hardening, 2.2 refresh timeout, 2.3 diagnostic endpoint, 2.4 ss capture in tec-pg-capture, 2.5 hostile test, 2.6 Central Clock audit, 2.7 alerts infra, 2.8 alerts UI+CLI+cron, 2.9 14-day soak verification). Langston APPROVED w/ 5 corrections + 6 Q-Alerts refinements (all applied). |
| `Claude Comms and Packages/Scope Files/B_NEW_40_PRE_AUDIT.md` | NEW | 482 | Step 2 pre-audit: SIM consult for all 23 DB-pool consumers (zero `pool.connect()` lease patterns; all use Drizzle), blast radius rated MEDIUM-HIGH, §2.6 Central Clock audit (zero violations — alerts dispatcher is OS-cron, not Central Clock subscriber), §2.7 alerts infra architecture. Langston APPROVED. |
| `Claude Comms and Packages/Langston Design Asks/TEC_STALE_INVESTIGATION_2026-05-16_rev1.md` | NEW | — | Initial design ask: H1 hung-promise hypothesis presentation. Langston confirmed mechanism. |
| `Claude Comms and Packages/Langston Design Asks/TEC_STALE_INVESTIGATION_2026-05-17_rev2.md` | NEW | — | Refined design ask after Kyle's "cause not symptom" pushback: framed as TWO stacked contributors (network cause + B79.TEC amplifier). Langston AGREED with both keepalive + 45s race. |

## 8. Staging-side deploys (already executed, NOT in repo)

These are deployed and live on `188.245.193.8` (verified active). Documented here for review completeness but no repo diff:

- `/usr/local/bin/tec-pg-capture` — added `ss -tnpi state established '( dport = 5432 )'` per snapshot tick (objective 2.4).
- `/etc/systemd/system/system-alerts-dispatcher.service` + `.timer` — every 15min cadence, `OnCalendar=*:0/15` (offset 0,15,30,45 — does NOT collide with FX5/RTB/TCL Central Clock subscribers).
- `/etc/logrotate.d/dawntrader-system-alerts` — rotates dispatcher log; **explicitly EXCLUDES** `system-alerts.jsonl` (the queue, not a log). Per Langston Q-Alert refinement.
- `/home/langston/CLAUDE.md` — §10.5 installed (330 lines).
- `/home/langston/MEMORY.md` — synced 2026-05-17 (108 lines).

---

## Review Focus Areas for Langston

1. **`server/db.ts` pool config** — confirm `keepAlive: true` + 10s initial delay correctly addresses silent TCP path death; confirm `query_timeout: 30_000` is acceptable upper bound for slow analytics queries (none currently exceed 30s in production logs but worth flagging).
2. **`server/services/trailing-exit-controller.ts` Promise.race fence** — confirm `clearTimeout(timeoutHandle)` in `.finally` correctly prevents the inner timeout from firing after the real promise resolves first (no double-counting in `tecRefreshFailCount`). Also confirm the cached-config fallback path (returns last good config until 5-min ceiling) is correct when timeout fires.
3. **`server/services/system-alerts.ts` lock primitive** — confirm `O_EXCL` semantics are correct for our staging filesystem (ext4 on Hetzner — POSIX semantics OK); confirm 30s stale-lock break window is appropriate (longest legit operation is JSONL rewrite which is < 1s for queue sizes < 10k entries).
4. **Soak-verify presence-not-count criterion** — confirm grep against awk-filtered timestamp range is robust for log lines that span multi-line stack traces (sig match falls back to `.includes()` which handles this).
5. **Test isolation** — confirm vitest fake-timer mock for `refreshTECConfigForClass` doesn't leak state between assertions (each describe block uses fresh `vi.useFakeTimers()` + `vi.restoreAllMocks()`).
6. **SIM bidirectional links** — confirm the new "Recent Additions" subsection in SIM correctly cross-references the modified `server/db.ts` entry on line 724 (both directions).
7. **CLAUDE.md §10.5 boundary** — confirm the "per-turn, not per-session" wording is unambiguous to a fresh AI session reading CLAUDE.md cold.

---

**Ready for Step 4 code-diff review.** Dispatching via file-first protocol (CLAUDE.md §6.5.0): full change list + scope + pre-audit staged in `/home/langston/inbox/tec_investigation/`; SSH dispatch carries SHORT pointer prompt under 1KB.

---

## Step 4 Review Round 1 Results — Langston feedback APPLIED (2026-05-17)

Langston returned **APPROVED with one concern + 5 observations**. My response:

### Concern: 5s busy-wait event-loop block under HTTP-path lock contention
**Decision:** option 2 (async-ify the library). Per NO-PATCHES doctrine (CLAUDE.md §5 #15), shipping with a 5s event-loop stall and a "we'll revisit" note IS a patch.

**Applied:**
- `server/services/system-alerts.ts` — `acquireLock` → `async acquireLock(): Promise<void>` with `await new Promise(setTimeout)` replacing busy-wait
- `withLock<T>(fn)` → `async withLock<T>(fn: () => T | Promise<T>): Promise<T>`
- `addAlert`, `fireDue`, `ackAlert`, `resolveAlert` → all now `async`/returning `Promise<...>`
- `scripts/system-alerts.ts` — all CLI callers now `await`
- `server/routes.ts` POST `/api/system-alerts/:id/acknowledge` — now `await ackAlert(id, by)`
- `scripts/b-new-40-soak-verify.ts` — `doAck(id, by)` → `await doAck(id, by)`
- Added file-header note explaining the async-ification rationale

### Observation 1 (stale-lock recovery race) — PUNTED to RUNNING_ISSUES
**Issue #106 added.** Very low probability (tens of microseconds against a 30s+ stale lock); PID-based liveness check adds complexity not justified for this batch. Tracked for future hardening when next touching this file.

### Observation 2 (`tecRefreshFailCount` not reset on success) — NO CHANGE, code already correct
**On closer read this is a misread of the code.** `tecRefreshFailCount` IS reset to 0 inside `refreshTECConfigForClass` (line 376) on every successful refresh — which is exactly where the success-path lives. The Promise.race resolves only when the inner refresh resolves, which only happens after line 376 ran. So after `3 fails + 1 success + 1 fail`, the diagnostic correctly reports `consecutiveFailCount=1`, not 4.

### Observation 3 (hardcoded `KYLE_DM_CHAT_ID`) — PUNTED to RUNNING_ISSUES
**Issue #107 added.** Push is courtesy not SLA (queue + per-turn AI check are real surfaces). Env var migration tracked.

### Observation 4 (doc-trail nit `BATCH_B_NEW_40_SCOPE.md` vs actual `B_NEW_40_SCOPE.md`) — FIXED
All 4 references corrected: `server/services/system-alerts.ts:29`, `scripts/system-alerts.ts:30`, `scripts/b-new-40-soak-verify.ts:25`, `client/src/pages/system-alerts.tsx:8` + `client/src/pages/system-alerts.tsx:240`.

### Observation 5 (`state as any, category as any` TS casts) — FIXED
`server/routes.ts` GET `/api/system-alerts` — replaced `state as any` casts with proper `Set`-membership narrowing. Unknown values fall through to `undefined` (no filter) rather than silently casting garbage into the type.

---

**Ready for Langston Step 4 sign-off round 2.** Re-dispatching for verification of the async-ification surface.
