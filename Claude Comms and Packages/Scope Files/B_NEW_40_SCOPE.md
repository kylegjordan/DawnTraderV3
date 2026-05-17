# B-NEW-40 — pg pool keepalive + TEC refresh timeout (silent-TCP-death root-cause fix)

**Date:** 2026-05-17
**Author:** CC
**Reviewer:** Langston (Step 1 sign-off, Step 4 code review)
**Pre-audit:** `Claude Comms and Packages/Scope Files/B_NEW_40_PRE_AUDIT.md`
**Workflow step:** Step 1 (Planning + Scope) per CLAUDE.md §2
**Estimated work:** ~3-5 hours implementation + tests + governance

---

## Plain-language summary (for Kyle)

Two stacked problems are causing the system to lock up roughly five minutes after a bad network blip. First, the database connection between our trading server and the database can go silently dead — the network path stops working but neither side gets told, so the system keeps a connection it thinks is healthy when it's actually broken. Second, a recent change to how the trade-exit controller refreshes its settings made things worse: when one of those refreshes gets stuck on a broken connection, the system never realizes the refresh hung, never retries, and after five minutes starts refusing to execute any exits at all until the process is restarted.

This batch closes both holes. It tells the operating system to send liveness probes on the database connections so dead ones get detected within seconds instead of hours. It adds a 45-second escape hatch on the trade-exit refresh so a stuck refresh always gives up and lets the next one try, instead of silently jamming the system. It also adds a diagnostic endpoint and a database-state capture so when something does go wrong, we can see the actual state of the system instead of guessing.

After the fix, brief network problems become brief degradations the system recovers from on its own, not multi-hour outages requiring a manual restart. No code changes to scanning, signal generation, trade execution, or any user-facing behavior. The Central Clock that synchronizes the rest of the system is not touched.

---

## 0. SCAFFOLDING-VS-FUNCTIONAL declaration

This batch IS functional. After deploy, the system's resilience to dead network connections is materially improved AND the recurring `TEC_STALE_FAIL_CLOSED` failure mode is eliminated. No deferred or inert components.

---

## 1. Background

Two `TEC_STALE_FAIL_CLOSED` incidents in 18 hours (2026-05-15 17:13 UTC and 2026-05-16 11:14 UTC) blocked the staging pipeline. Both required PM2 restarts (#288, #289). CC + Langston rev1+rev2 reviews + Step 2 pre-audit converged on the root cause:

1. **Network-layer cause:** silent TCP path death between Hetzner Falkenstein and Supabase Frankfurt. The pg-pool client has `keepAlive: false` by default, so dead-but-not-detected sockets stay in the pool and get reused for queries that then hang indefinitely. Pre-May 8 logs show the same network condition was always present (heartbeat cycles of 14.9s, 96.9s observed throughout April), just absorbed silently by the old code architecture.

2. **Code-architecture amplifier (B79.TEC, 2026-05-08):** the per-asset-class fire-and-forget refresh pattern with `tecConfigRefreshInFlight` coalescer + 5-minute staleness ceiling converts a single hung promise into a permanent fail-closed for the rest of process lifetime. Zero `[TEC_REFRESH_FAIL]` log events across 4832 `[TEC_STALE_FAIL_CLOSED]` events confirms the `.catch`/`.finally` chain never executes when the underlying promise is hung.

Full evidence + architectural diff in pre-audit §1 + §1.5.

---

## 2. Numbered objectives

### 2.1 Pool keepalive + config hardening

Modify `server/db.ts` to:

- Add `keepAlive: true` (enables OS-level TCP keepalive probes on every pool connection)
- Add `keepAliveInitialDelayMillis: 10_000` (overrides `TCP_KEEPIDLE` for socket; OS starts probing after 10s of socket idle)
- Add `query_timeout: 30_000` (pg-pool client-side abort after 30s on any single query — safety net for any other hang source we haven't identified)
- Add `idleTimeoutMillis: 30_000` (extends idle window from pg default 10s to 30s; lower connection churn since keepalive carries the resilience load)
- Add `max: 10` explicit (matches pg-pool default; surfaces ceiling for operator visibility)
- Add `application_name: 'dawntrader_main'` (tags this connection class in `pg_stat_activity` and Supabase dashboard for DB-side diagnosability)

**Verification:**
- Boot succeeds without TS errors, no pool init regressions
- New connections in `pg_stat_activity` show `application_name='dawntrader_main'`
- `ss -tnpi` capture (deployed in objective 2.4) at next stale event no longer shows ESTABLISHED-but-dead sockets — instead shows clean connection state with active keepalive probes
- No queue waits in 14-day staging soak (else raise `max` to 15 or 20)

### 2.2 TEC refresh-promise timeout

Wrap the refresh call at `server/services/trailing-exit-controller.ts:~235` in `Promise.race([refreshTECConfigForClass(assetClass), timeoutAfter45s])` so the `tecConfigRefreshInFlight` Map always releases — even when the underlying promise is hung and never resolves/rejects on its own.

Implementation:
- Use plain `setTimeout(reject, 45_000)` + `clearTimeout` on resolve. Do NOT subscribe to Central Clock for this one-shot deadline (per pre-audit §2.6 Central Clock audit: per-call bounds are not tick-aligned candidates; subscribing for a 45s timeout would add subscriber-churn for zero scheduling benefit).
- On timeout-path rejection, the existing `.catch` handler at L235 still fires — increments `tecRefreshFailCount`, logs `[TEC_REFRESH_TIMEOUT]` (distinct from `[TEC_REFRESH_FAIL]` so operators can tell which path triggered).
- `.finally` clears the in-flight Map entry as today.
- Next `resolveTECConfig` call sees empty in-flight Map, schedules a fresh refresh attempt.

**Verification:**
- New hostile-scenario test (objective 2.5) passes
- No regression on existing `b65-tec-parity.test.ts`, `b80-tec-per-trade-keying.test.ts`
- Manual smoke: `npm run test -- trailing-exit-controller` green
- 14-day staging soak: zero `TEC_STALE_FAIL_CLOSED` events (with corollary that `TEC_REFRESH_TIMEOUT` may fire if a true hang occurs — that's the recovery path working, not a failure)

### 2.3 TEC diagnostic endpoint

Push the `/api/diagnostics/tec-config` route + `getTECDiagnostics()` already written in this branch (Langston rev1-approved). Add Central Clock health to the payload per pre-audit §2.6 enrichment recommendation:

```json
{
  "ok": true,
  "capturedAt": "ISO-8601",
  "configTtlMs": 60000,
  "maxStalenessMs": 300000,
  "classes": [{ ...per-class state... }],
  "centralClock": {
    "isRunning": true,
    "tickNumber": 12345,
    "averageDriftMs": 8.2,
    "maxDriftMs": 47
  }
}
```

Use `centralClock.getHealth()` directly — matches existing `ClockHealth` interface at `central-clock.ts:27-34`. No reinvention.

**Verification:**
- `curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/diagnostics/tec-config` returns 200 with the expected shape
- Endpoint correctly reports `refreshInFlight: true` mid-refresh in a test scenario
- Endpoint correctly reports `centralClock.isRunning: true` post-bootstrap

### 2.4 Staging-side `tec-pg-capture` enhancement

Add `ss -tnpi state established '( dport = 5432 )' > $OUT_DIR/ss_$ts.txt` to each snapshot tick of the existing `tec-pg-capture` systemd unit on staging (188.245.193.8). Already runs once-per-minute for 10 ticks after each `TEC_STALE_FAIL_CLOSED` log line via tail-F trigger.

Per pre-audit §2.6: this is bash-side on the Hetzner host, separate process from the Node.js runtime, cannot subscribe to Central Clock. Event-driven by the log tail, not recurring. No conflict.

**Verification:**
- `systemctl restart tec-pg-capture && systemctl is-active tec-pg-capture` returns `active`
- Manually inject a fake `TEC_STALE_FAIL_CLOSED` line into the log file; confirm `ss` snapshot file lands in `/var/log/dawntrader/tec_diag/`
- After next real incident: `ss` output shows TCP state of all pool connections (retransmit counts, unacked bytes, ESTABLISHED-but-dead signatures)

### 2.5 Hostile-scenario test

NEW test file at `server/services/__tests__/b-new-40-tec-refresh-hang.test.ts` (or similar canonical location). Simulates a hung refresh by stubbing `refreshTECConfigForClass` to return `new Promise(() => {})` (never resolves, never rejects). Asserts ALL of:

- (a) `tecConfigRefreshInFlight` Map entry for the affected asset class releases within 45s + ε (typical: 200ms tolerance)
- (b) `tecRefreshFailCount` for that class increments by 1
- (c) `[TEC_REFRESH_TIMEOUT]` log line fires exactly once (via console.error spy)
- (d) Subsequent `resolveTECConfig(assetClass)` returns the cached config snapshot at each call until `CONFIG_MAX_STALENESS_MS` (5 min) elapses
- (e) After 5 min, `resolveTECConfig(assetClass)` throws with `TEC_STALE_FAIL_CLOSED` in the message

This expanded assertion set prevents regressions where the catch path is bypassed (the exact failure mode B-NEW-40 closes).

**Verification:**
- `npm run test -- b-new-40-tec-refresh-hang` green
- CI Test Suite check stays green on push

### 2.6 Governance updates

- **SIM new section** for B79.TEC config-cache subsystem covering: per-class cache structure (`tecConfigCache`, `tecConfigExpiresAt`, `tecConfigLastSuccessAt`), `primeTECConfig()` boot bootstrap + `hasExplicitAssetClassRow` invariant, `tecConfigRefreshInFlight` coalescer + new 45s Promise.race fence, `CONFIG_MAX_STALENESS_MS = 5min` ceiling and `TEC_STALE_FAIL_CLOSED` semantics, new `/api/diagnostics/tec-config` endpoint with payload shape (including Central Clock health), upstream dependency on `server/db.ts` pool config including `application_name: 'dawntrader_main'`. Link bidirectionally to the updated `server/db.ts` SIM entry.

- **`server/db.ts` SIM entry update** (line 724) to document the new pool config dimensions and the new SIM cross-reference.

- **BATCH_CATALOG.md entry** for B-NEW-40 row.

- **CHANGES_AND_FIXES.md entry** documenting the fix: silent TCP death + B79.TEC inFlight Map regression, the 5 mitigation layers, and the prior-incident timeline.

- **PHASE_HISTORY.md update** if applicable (Phase 24 cleanup item or similar).

- **CC + Langston MEMORY.md sync** at batch closure per CLAUDE.md §3 step 10.b.

**Verification:**
- All governance files updated on the same commit that ships the code
- Completion report (Step 11) lists every file changed

### 2.7 Push diagnostic endpoint code

The endpoint code already written in the working branch needs to be committed and pushed as part of this batch. Langston rev1 approved. No new code beyond the Central Clock enrichment to the payload.

### 2.8 System Alerts infrastructure (minimum viable) — closes the 14-day handoff gap

Per Kyle directive 2026-05-17: the 14-day soak verification for objectives 2.1–2.5 needs a delivery surface that doesn't depend on which specific Claude Code session is alive on day 14, and doesn't depend on Kyle remembering to read every Telegram message. Build a basic alerts/notifications surface as part of this batch; defer the wider health-check architecture to a future batch (see §3 + the POST_AUDIT_ROADMAP entry added in §2.6 governance).

Six deliverables, minimum viable:

**2.8.a Flat-file alert queue** at `/var/log/dawntrader/system-alerts.jsonl` on staging. JSON-Lines format, one event per line. Schema includes `id`, `created_at`, `triggers_at`, `fired_at`, `acknowledged_at`, `acknowledged_by`, `state` (`scheduled | active | acknowledged | resolved`), `category` (`soak_verification | health_check | breakage | one_off | recurring`), `severity` (`info | warning | critical`), `title`, `body`, `metadata` (free-form), `recurrence_interval_seconds` (reserved, not implemented yet). Pattern mirrors existing `/var/log/cc-bridge-inbox.jsonl`. Whole-file rewrite via tmpfile-rename for atomic state changes; file expected to stay <1000 entries over years.

**2.8.b `scripts/system-alerts.ts` CLI**. Commands:
- `add --triggers-at <ISO> --category <c> --severity <s> --title <t> --body <b> [--metadata <json>]`
- `fire-due` (dispatcher invocation)
- `list [--state <s>] [--category <c>]`
- `ack <id> [--by <user>]`
- `resolve <id>`

**2.8.c systemd timer + service on staging.** `system-alerts-dispatcher.service` triggered every 15 min by `system-alerts-dispatcher.timer`. Service runs `scripts/system-alerts.ts fire-due` which (a) promotes `state: 'scheduled'` events whose `triggers_at <= NOW()` to `state: 'active'`, (b) pings Telegram via `@CCDTCommsBot` for `severity: 'critical'` events.

**2.8.d API endpoints in `server/routes.ts`** (auth-gated, same `authenticateToken` middleware as `/api/diagnostics/tec-config`):
- `GET /api/system-alerts` — returns entries where `state IN ('active', 'scheduled')`, sorted by `triggers_at` ASC; supports `?state=` and `?category=` filters
- `POST /api/system-alerts/:id/acknowledge` — body `{ "by": "kyle" }` — sets `state: 'acknowledged'`, `acknowledged_at`, `acknowledged_by`

**2.8.e UI tab "System Alerts"** in the dashboard. Minimum:
- Header: counts of `N active, M scheduled`
- Table: timestamp / category / severity / title / Ack button
- 30-second polling refresh
- Color-coded severity chips (info/warning/critical)

**2.8.f CLAUDE.md addendum** (mandatory per-turn check) added to BOTH `CLAUDE.md` (repo, CC side) and `/home/langston/CLAUDE.md` (Hetzner, Langston side). New standing rule:

> **System Alerts per-turn check (Kyle directive 2026-05-17 — mandatory).** Before responding to any user message, read `/var/log/dawntrader/system-alerts.jsonl`. For each entry where `state === 'active'` AND `acknowledged_at === null` AND `triggers_at <= NOW()`, surface the entry to the user as part of your response in plain language. Cite the `id`, `title`, `severity`, `body`, and `metadata`. If you act on an alert during the turn, run `scripts/system-alerts.ts ack <id> --by <session-name>` so it does not keep getting surfaced. If you cannot reach the file (Hetzner unreachable, file missing), state that explicitly and proceed.

**2.8.g First canonical use: insert the B-NEW-40 14-day soak event** on deploy day:
```
scripts/system-alerts.ts add \
  --triggers-at <deploy_date+14d> \
  --category soak_verification \
  --severity warning \
  --title "B-NEW-40 14-day soak verification due" \
  --body "Verify zero TEC_STALE_FAIL_CLOSED events since deploy. Run scripts/b-new-40-soak-verify.ts." \
  --metadata '{"verify_script":"scripts/b-new-40-soak-verify.ts","log_signatures":["TEC_STALE_FAIL_CLOSED","TEC_REFRESH_TIMEOUT","TEC_REFRESH_FAIL"],"deploy_commit":"<hash>"}'
```

**Verification:**
- `system-alerts-dispatcher.timer` active on staging via `systemctl is-active`
- Test event inserted and verified to fire at its `triggers_at` time (use a near-term timestamp for the test)
- API endpoint returns the entry in JSON via `curl -H "Authorization: Bearer $TOKEN"`
- UI tab renders the entry
- CLAUDE.md addendum present in both repo and Hetzner copies
- B-NEW-40 14-day event inserted with its actual deploy-time-derived `triggers_at`

**Estimated work for 2.8 alone**: ~4 hours implementation + tests.

### 2.9 `scripts/b-new-40-soak-verify.ts` — verification script

Standalone Node CLI that any future operator (or Claude Code session) can run by hand:
- Reads the deploy commit hash from a constant set at deploy time
- Greps `/var/log/dawntrader/error.log` and `/var/log/dawntrader/out.log` from the deploy timestamp forward
- Counts events of interest (`TEC_STALE_FAIL_CLOSED`, `TEC_REFRESH_TIMEOUT`, `TEC_REFRESH_FAIL`, pool-related errors)
- **Pass/fail criterion (Langston Step 1 refinement, 2026-05-17):** presence-not-count. ANY `TEC_STALE_FAIL_CLOSED` event between deploy timestamp and run timestamp = FAIL. Count comparisons (vs the pre-fix baseline) are surfaced as informational context in the output, NOT used as the pass/fail decision. Rationale: the pre-fix 4832-events-in-9-days figure is real but the per-day average isn't a sharp baseline (events clustered on incident days at 866-1712 each, near-zero on others). Presence-not-count avoids quibbling over baseline arithmetic and gives a clean fail-loud signal.
- `TEC_REFRESH_TIMEOUT` events are surfaced as INFO not FAIL — those are the new fence doing its job (a hang was caught and the system recovered). Track count for tuning future.
- Outputs PASS / FAIL verdict + evidence summary including per-day event histogram for context
- On PASS, optionally acknowledges the corresponding `soak_verification` alert in the queue via `scripts/system-alerts.ts ack <id> --by <session-name>` (caller passes the alert ID via flag)

Invoked manually by Claude session on day 14 (triggered by the alerts queue) or by Kyle directly. Idempotent — re-running re-reads the logs, doesn't mutate state beyond optional ack.

---

## 3. Out of scope

- **Pre-existing `setInterval` for `[TEC_RESOLVE_AGGR]` log emitter at `trailing-exit-controller.ts:~190`.** Per pre-audit §2.6 + Langston Q7: this raw timer is independent of Central Clock and drifts cosmetically against tick-aligned subsystems. Worth a small future cleanup batch to subscribe TEC to Central Clock for this log, but NOT in B-NEW-40 scope. Filed for future consideration.
- **B79.TEC config-cache subsystem RESTRUCTURING** (vs the surgical 45s fence + pool config we're doing). The fence + pool config is the minimum sufficient change. Larger restructures would re-open architecture debate that B79.TEC already settled.
- **B-NEW-35** (B74 source-side dedup) — separate batch, separate cause.
- **xstock scanner SCAN_TIMEOUT + B73 ohlcBars undefined errors** — separate batch candidate, separate cause.

**Deferred from objective 2.8 (System Alerts) — explicitly out of B-NEW-40 scope, filed for future batch** (will be added to `POST_AUDIT_ROADMAP.md` as part of §2.6 governance):

- **DB-backed alert history table** for queryable past alerts. Today's JSONL flat file is the working store; future batch promotes to a Postgres table while keeping the flat file as a write-through cache for AI-side discovery. Schema dimensions in the JSONL today are designed to migrate verbatim — no breaking change when promoted.
- **Recurrence support** for periodic health checks. The schema already has `recurrence_interval_seconds`; the dispatcher logic does not yet act on it. Future batch wires the recurrence semantics.
- **Severity-based push routing** with configurable thresholds. Today: `critical → Telegram`, others don't push. Future batch: per-category routing rules, rate-limiting, Slack/Discord/email channels beyond Telegram.
- **Breakage-trigger integrations** in specific subsystems. The MVP supports manual + cron-fired alerts only; the future batch series adds `emitSystemAlert` call sites in scanner, TEC, VTS exit loop, archive writer, etc. Each subsystem integration is its own small batch.
- **Richer alert payloads** beyond the free-form `metadata` field — structured evidence pointers (dashboard URLs, log file refs, query IDs, related batch IDs).
- **Acknowledgement state machine** with `reopened` state and full state-transition audit trail. Today: simple `active → acknowledged → resolved` transitions; future supports re-opening + multi-actor audit.
- **UI polish**: filtering, sorting, search, alert detail view, history view of acknowledged/resolved entries, color-coded category chips, severity icons.
- **Dashboard summary widget** on the main dashboard surfacing the unacknowledged-active count alongside other system health metrics.

**Additional deferred items (Langston Step 1 review, 2026-05-17):**

- **Shared alerts library/module** — CLI + API both touch the file. From day one this should be a shared internal module to avoid duplicated parse/write code. (B-NEW-40 MVP will write the library as a side effect of building CLI+API together; promote to a separately-tested module in future batch.)
- **Alert deduplication / debouncing** — once breakage triggers exist, the same condition firing every 60s would flood the queue. Need a debounce semantic in the `emitSystemAlert` API (e.g., "don't fire a 'scanner stopped' alert if one is already active for the same subsystem").
- **TTL / auto-archive for resolved alerts** — bound the JSONL even under healthy growth. Resolved+acknowledged alerts older than N days move to `/var/log/dawntrader/system-alerts-archive.jsonl`. Future batch implements; B-NEW-40 doesn't enforce TTL.
- **Dispatcher-side observability** — log the last-run timestamp + last-fired-count somewhere the per-turn check can also surface. "Dispatcher hasn't run in >30min" is itself an alert. Future batch wires this self-monitoring; B-NEW-40 relies on systemd's `systemctl is-active` for liveness verification only.
- **`soak_verification` category Telegram refinement** — when this category promotes to active, ping Telegram even at warning severity (not just critical). Soak verifications ARE the "must not fall through cracks" use case. Bundle into future severity-routing batch.

---

## 4. Rollback plan

Each objective is independently revertable.

- **Pool config revert:** `git revert <commit-for-db.ts>`. No state migration required. Pool reverts to bare defaults. System resumes pre-B-NEW-40 behavior (vulnerable to the same hang, but no worse).
- **Refresh timeout revert:** `git revert <commit-for-trailing-exit-controller.ts>`. Promise.race wrapper removed. System reverts to original B79.TEC behavior (vulnerable to permanent fail-closed).
- **Diagnostic endpoint revert:** `git revert <commit-for-routes.ts + trailing-exit-controller.ts diagnostic block>`. Endpoint removed; everything else unaffected.
- **`tec-pg-capture` revert:** `systemctl stop tec-pg-capture && systemctl disable tec-pg-capture`. Capture stops; nothing else touched.

No DB migration in this batch — nothing to roll back at the database layer.

---

## 5. Verification criteria summary

| Objective | Pass criterion |
|---|---|
| 2.1 | Boot clean, `application_name` visible in pg_stat_activity, no pool starvation in 14d soak, `ss` shows no dead-ESTABLISHED sockets at next incident (if any) |
| 2.2 | New hostile test green, existing TEC tests green, zero `TEC_STALE_FAIL_CLOSED` in 14d soak |
| 2.3 | `/api/diagnostics/tec-config` returns 200 with expected shape including `centralClock` health |
| 2.4 | `tec-pg-capture.service` active, snapshot includes `ss_*.txt` files at next incident |
| 2.5 | All 5 assertions (a–e) green; CI Test Suite green |
| 2.6 | Every governance file updated on the same commit; completion report lists all |
| 2.7 | Endpoint code visible at production-deployed commit hash |

---

## 6. Open questions queued for Langston Step 1 sign-off

**Q1.** Scope as described in §2 — agree, or do you want to add/remove any objectives?

**Q2.** Verification soak window — 14 days proposed. Long enough to capture the recurrence cadence we've seen (12-18h between incidents pre-fix) with ample margin. Agree, or do you want 30 days for higher statistical confidence?

**Q3.** Hostile-scenario test location — `server/services/__tests__/b-new-40-tec-refresh-hang.test.ts` proposed. Confirm that's the right home, or do you want it under a different test path?

**Q4.** SIM new section content (§2.6) — any additional dimensions you want covered that I haven't listed?

**Q5.** Plain-language summary above — match the B-NEW-14 / B-NEW-21 reference bar in your read? Tune anything?

**Q6.** Anything else I'm missing before this scope is ready to drive implementation?

---

## 7. Pre-implementation checklist (will execute after Step 1 sign-off)

- [ ] Pre-audit §2.6 Central Clock audit verified by Langston (Step 2 sign-off received 2026-05-17)
- [ ] Step 1 scope sign-off received from Langston
- [ ] Grep `pool.connect()` callsites for missing `release()` — flag any starvation risks under explicit `max: 10`
- [ ] Inventory current peak concurrent connections in staging — if already approaching 10 under hot load, raise `max` ceiling pre-implementation
- [ ] Create branch and implement objectives 2.1 through 2.7
- [ ] Local test pass
- [ ] Push, CI green
- [ ] Deploy to staging, soak window starts
- [ ] Step 7 first-pass verification (CC)
- [ ] Step 8 second-pass verification (Langston)
- [ ] Step 10 governance updates committed
- [ ] Step 11 completion report
- [ ] Step 10.b Langston MEMORY sync per CLAUDE.md
