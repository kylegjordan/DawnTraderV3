# B-NEW-40 Pre-Audit — pg pool keepalive + TEC refresh timeout

**Date:** 2026-05-17
**Author:** CC
**Reviewer:** Langston (Step 2)
**Scope file:** to be drafted after this pre-audit lands
**Workflow step:** Step 2 (Pre-Implementation Audit) per CLAUDE.md §2

---

## 0. Cover summary

This batch closes two stacked root contributors to the recurring `TEC_STALE_FAIL_CLOSED` incidents on staging (2026-05-15 and 2026-05-16):

1. **Network-layer cause** — silent TCP path death between Hetzner Falkenstein and Supabase Frankfurt. Long-idle connections lose state at intermediate hops without TCP RST. With pg-pool's default `keepAlive: false`, the client never detects the dead socket. Connections sit in the pool in apparent good health and get reused for queries that then hang indefinitely.

2. **Code-architecture amplifier** — B79.TEC (commit `01fa39912`, 2026-05-08) replaced the old synchronous-await TEC config resolver with a fire-and-forget background refresh coalesced through `tecConfigRefreshInFlight`. A hung refresh promise traps the Map entry forever (no `.finally` because the promise neither resolves nor rejects), blocking every future refresh until process restart. After 5min staleness ceiling, every `resolveTECConfig` call throws `TEC_STALE_FAIL_CLOSED`.

Both contributors agreed by CC + Langston rev1/rev2 reviews. This pre-audit walks the System Impact Map, identifies the blast radius of each proposed change, and queues Step 2 sign-off questions.

---

## 1. Verified evidence

### 1.1 — Pre-May 8 corroboration grep (2026-05-17, CC)

Grep `/var/log/dawntrader/out.log` for `"Heartbeat cycle took N{4,}ms"` entries pre-May 8 (B79.TEC deploy):

- **Throughout April:** ~1-3 slowdown events per day. Examples: 2026-04-15 14,879ms; 2026-04-13 6,567ms; 2026-04-22 3,418ms.
- **Aggregated by frequency:** 4 events at 96,983ms (~97s), 4 events at 8,943ms, etc. Long tail of multi-second cycles.
- **Auto-recovery action**: fires (`auto_recovery_triggered`), reports `success: false`, but next cycle starts fresh — system limps along.

Post-May 8 heartbeat slowdown counts by date:

| Date | >1s cycles |
|---|---:|
| 2026-05-09 | 2 |
| 2026-05-12 | **866** |
| 2026-05-13 | 584 |
| 2026-05-15 | **1712** |
| 2026-05-16 | 48 |

**Conclusion: the network slowdown pattern existed before B79.TEC.** Post-B79.TEC, baseline rate is similar BUT massive clusters appear on incident days, consistent with the TEC stuck-state cascade.

**Architectural fingerprint** (Langston Step 2 observation): the clustering shape isn't just "more slow cycles." It's the *exact-duplication* pattern — 4 events at precisely 96,983ms, 4 events at precisely 8,943ms, 4 events at precisely 8,905ms, etc. Identical durations repeating across the same hour is the signature of "one hung promise traps the in-flight Map, every subsequent `resolveTECConfig` re-evaluates the same staleness check against the same fixed timestamp." A genuine recurring network issue would produce a distribution of durations, not exact duplicates. This is the smoking gun for the code amplifier (B79.TEC's in-flight Map), distinct from the network cause.

### 1.2 — TEC error pattern (consolidated from rev1+rev2)

- `[TEC_STALE_FAIL_CLOSED]` events in `error.log`: **4832** (first observed 2026-05-08 15:03:57 on xstock_spot — same day as B79.TEC deploy)
- `[TEC_REFRESH_FAIL]` events in `error.log`: **0** (strict regex). The `.catch` handler that increments `tecRefreshFailCount` has never executed in 4832 stale events.
- `[connection terminated|ECONNRESET|ECONNREFUSED|read ETIMEDOUT|write ETIMEDOUT]` in either time window: **0**.

The promise neither resolves nor rejects → `.finally` never fires → `tecConfigRefreshInFlight.has(assetClass)` stays true permanently → refresh never re-scheduled → cache ages past `CONFIG_MAX_STALENESS_MS = 5min` → every read throws fail-closed.

### 1.3 — DATABASE_URL connection mode

Direct connection to Postgres at `db.<project>.supabase.co:5432`. NOT the pgbouncer transaction-pool at port 6543. Rules out pgbouncer-transaction-mode prepared-statement gotchas.

### 1.4 — pg pool config

`server/db.ts` (full file):
```ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```
No `keepAlive`, no `query_timeout`, no `idleTimeoutMillis`, no `connectionTimeoutMillis`, no `max`. All defaults. pg-pool default `keepAlive: false` means `SO_KEEPALIVE` is not set on the socket; the Linux OS won't probe a dead connection for 7200s (2h).

### 1.5 — Pre-vs-post B79.TEC architecture diff

**Pre-B79.TEC** (`01fa39912^`, server/services/trailing-exit-controller.ts:96-130):
```ts
async function resolveTECConfig(strategy?, regime?): Promise<TrailingExitConfig> {
  if (now < configExpiresAt) return cachedConfig;
  try {
    const rows = await getModuleConstants(...);
    cachedConfig = { ... };
    configExpiresAt = now + CONFIG_TTL_MS;
  } catch (err) {
    console.error('[9.2][TEC] Failed to refresh ...; using cached/defaults:', err);
    configExpiresAt = now + 5_000;
  }
  return cachedConfig;
}
```
- Awaited inline. Catch handler covers reject. A hung await stalls THE CALLER.
- On stall: orchestrator cycle takes longer than usual, next cycle starts fresh, system continues.

**Post-B79.TEC** (`01fa39912`, server/services/trailing-exit-controller.ts:214-266):
```ts
if (now >= expiresAt && !tecConfigRefreshInFlight.has(assetClass)) {
  const promise = refreshTECConfigForClass(assetClass)
    .catch((err) => { tecRefreshFailCount.set(...); console.error('[TEC_REFRESH_FAIL]', err); })
    .finally(() => { tecConfigRefreshInFlight.delete(assetClass); });
  tecConfigRefreshInFlight.set(assetClass, promise);
}
const cached = tecConfigCache.get(assetClass);
return cached;
```
- Sync read from cache. Refresh fire-and-forget. inFlight Map coalesces concurrent refreshes.
- On stall: promise pending forever, Map entry stuck, refresh never re-scheduled, stale-fail-closed cascade after 5min.

---

## 2. System Impact Map consult

### 2.1 — Components touched by this batch

| Component | Change | SIM line |
|---|---|---|
| `server/db.ts` | Add `keepAlive`, `keepAliveInitialDelayMillis`, `query_timeout`, `idleTimeoutMillis`, explicit `max` | SIM 724 (limited entry, no blast-radius detail) |
| `server/services/trailing-exit-controller.ts` | Wrap `refreshTECConfigForClass` call in `Promise.race(refresh, timeoutAfter45s)` so inFlight Map always releases | SIM 822, 851, 865, 921, 1497, 1639, 1660, 1821 (heavy coverage of TEC engagement but NO entry for the config-cache refresh subsystem itself) |
| `tec-pg-capture` systemd unit | Add `ss -tnpi state established '( dport = 5432 )'` to each snapshot tick | Not in SIM (operational tooling on staging, not application code) |
| Hostile-scenario test (NEW) | Sim hung refresh, assert Map releases at 45s+ε | Tests dir, not in SIM |

### 2.2 — Pool change: 23 DB-pool consumers identified (UPSTREAM/SHARED)

All consumers import `pool`/`db` from `server/db.ts` and would be subject to the new config:

**Hot path (signal pipeline, every signal cycle):**
- `server/services/module-constants-service.ts` (reads module_constants cache)
- `server/services/vts-runner.ts`
- `server/services/factor-ablation-emitter.ts`
- `server/services/vts-trade-persistence.ts`
- `server/services/factor-replay-core.ts`

**Hot path (xstock scanner):**
- `server/asset_classes/xstock_spot/scanner.ts`
- `server/asset_classes/xstock_spot/ohlc-aggregator.ts`
- `server/asset_classes/xstock_spot/eval-cycle.ts`

**Archive writers (high-throughput batch):**
- `server/services/passive-archive/ticker-batch-writer.ts`
- `server/services/passive-archive/ohlc-batch-writer.ts`
- `server/services/data-archive/archive-batch-writer.ts`

**Cron-scoped scripts (run rarely, may have longer queries):**
- `server/scripts/replay-ablation.ts` (04:00 UTC nightly)
- `server/scripts/b74-create-monthly-partitions.ts` (02:00 UTC 28th)
- `server/scripts/dump-settings-registry.ts` (manual)

**Telemetry / repository / diagnostics:**
- `server/services/telemetry-repository.ts`
- `server/services/adaptive-learning-repository.ts`
- `server/core/telemetry/cost-telemetry.ts`
- `server/diagnostics/metrics.ts`

**Bootstrap / seed scripts:**
- `server/startup/passive-archive-bootstrap.ts`
- `server/db/seed-family-filters.ts`
- `server/db/update-di-thresholds.ts`

**Tests (not production):**
- `server/tests/unit/b-new-34-aggregator.test.ts`
- `server/tests/integration/b72-dbs-routing-guards-consistency.test.ts`

### 2.3 — Long-running query audit (under proposed `query_timeout: 30s`)

Searched for explicit statement-timeout overrides, BATCH constants, LIMIT clauses, chunking patterns:

| Risk | Location | Finding |
|---|---|---|
| LOW | `drift-dashboard-aggregator.ts:870-878` | Uses its OWN per-statement `SET LOCAL statement_timeout = 4000` (4s). Pool 30s is a higher ceiling, won't break this. |
| **MEDIUM** | `partition-exporter.ts:122-124` | `BATCH = 1000` rows per query, keyset pagination. Each chunk should complete in <1s. Comment at L114 references a historical "2min statement_timeout" hit which a code change already mitigated. Re-verified the current path is chunked properly. Under `query_timeout: 30s`, single chunks should be safe. |
| LOW | `xstock_spot/scanner.ts:365` | Comment references prior 2min statement_timeout cancellations on 240-min warm-fetch path. That path is SUSPENDED (commented out) since B-NEW-34. Re-enable would be a separate batch (B-NEW-35) — that batch would need to re-evaluate timeout interaction. |
| LOW | `replay-ablation.ts` | Cron-scoped, chunked (LIMIT 5000 per batch per existing code). Single-query payload bounded. |
| LOW | `b74-create-monthly-partitions.ts` | CREATE TABLE statements only; sub-second each. |
| LOW | Batch writers (ticker/ohlc) | Already chunked by design; no single-query risk under 30s. |

**Audit verdict:** no production code path currently runs a single query that legitimately exceeds 30s. The 240-min warm-fetch reference at scanner.ts:365 is the only NEAR-MISS, and it's already suspended pending B-NEW-35. Pool `query_timeout: 30s` is safe to apply.

### 2.4 — TEC change: downstream callers

- `server/services/tec-evaluator.ts` (centralizer for VTS + paper exit loops)
- `server/services/vts-runner.ts` (calls `resolveTECConfig` via tec-evaluator in VTS exit loop)
- `server/services/paper-execution-engine.ts` (calls via tec-evaluator in checkExitConditions)
- `server/routes.ts` (admin endpoint `/api/diagnostics/tec-config` — the new diagnostic added in steps 1-3)

The Promise.race wrapper is internal to `refreshTECConfigForClass` callsite at L235. No callers see a different return signature. No downstream change required.

### 2.5 — SIM governance gaps surfaced

This pre-audit identifies a SIM gap that B-NEW-40 should close as part of governance:

- **No SIM entry for B79.TEC's config-cache subsystem.** The B79.TEC batch added the per-class cache Map, primeTECConfig bootstrap, hasExplicitAssetClassRow assertion, MAX_STALENESS guard, and the `tecConfigRefreshInFlight` coalescer. None are documented in SIM. The current B79.TEC SIM entries cover the state-map for trade tracking (`TrailingState`), engagement points, etc. — but not the config-cache subsystem.
- This is exactly the "buried important details" failure mode CLAUDE.md §9 warns against.

B-NEW-40 should add a SIM entry covering: the per-class config cache structure (`tecConfigCache`, `tecConfigExpiresAt`, `tecConfigLastSuccessAt`), `primeTECConfig()` boot bootstrap + `hasExplicitAssetClassRow` invariant, the refresh subsystem with its `tecConfigRefreshInFlight` coalescer and new 45s `Promise.race` timeout fence, the `CONFIG_MAX_STALENESS_MS = 5min` ceiling and `TEC_STALE_FAIL_CLOSED` semantics, the new `/api/diagnostics/tec-config` endpoint with its payload shape including Central Clock health, and the upstream dependency on `server/db.ts` pool config (including the new `application_name: 'dawntrader_main'` connection tag that surfaces this class in `pg_stat_activity` for DB-side diagnosability). Link the new TEC-config-cache SIM entry to the updated `server/db.ts` SIM entry bidirectionally.

---

## 2.6 Central Clock alignment audit (Kyle directive 2026-05-17)

**Standing rule:** Central Clock (`server/services/central-clock.ts`, 🔒 LOCKED per Directive 8.8.4-A4.R10R-4) is the single 1-second tick source for all engine subsystems. Subscribers today: FX5 Scanner, RTB Refresh, TCL, Monitoring. The principle: anything that introduces a new recurring schedule should subscribe to the clock; nothing should introduce a competing timer that races against tick-aligned subsystems. Kyle's framing 2026-05-17: "be aware of it, consider it, make sure that nothing... is in violation of syncing everything to the central clock. There may be no conflicts or nothing to do for it. Just not to ignore it."

Walking each B-NEW-40 component:

| Change | Layer | Recurring schedule? | Central Clock interaction |
|---|---|---|---|
| `keepAlive: true`, `keepAliveInitialDelayMillis: 10_000` | OS / TCP kernel | NO — OS-managed once SO_KEEPALIVE is set | None. Kernel-layer probe scheduling has no visibility into the Node.js event loop or Central Clock. No conflict. |
| `query_timeout: 30_000` | pg-pool internal | NO — per-query timer, fires when an individual query runs long | None. Each query is bounded independently; not a recurring tick. No conflict. |
| `idleTimeoutMillis: 30_000` | pg-pool internal | NO — per-connection idle bookkeeping | None. Idle reaping is pool-internal lifecycle, not scheduled work. No conflict. |
| `max: 10` | pg-pool config | NO | Static config. No conflict. |
| `Promise.race(refreshTECConfigForClass, timeoutAfter45s)` | TEC internal | NO — fires only when a refresh is in flight, resolves/rejects at 45s | Per-call bound, not a recurring schedule. Could be implemented via `setTimeout(reject, 45_000)` OR via Central Clock subscribe with `if (currentTick - startTick >= 45) reject`. Either works. **Recommendation: use plain `setTimeout`** — the timeout is internal to one refresh call's lifetime; subscribing to Central Clock for a 45-second one-shot would add subscriber churn (subscribe at start, unsubscribe on resolution) for no scheduling benefit. No conflict either way. |
| `/api/diagnostics/tec-config` endpoint | HTTP handler | NO — fires on inbound request | None. No conflict. Could optionally surface `centralClock.getHealth()` in the response payload for operational visibility (recommended addition, see below). |
| `ss -tnpi` capture in `tec-pg-capture` systemd unit | Bash/shell on staging host | NO — fires on log-tail trigger event | Lives outside the Node.js runtime. Cannot subscribe to Central Clock (different process). Event-driven by `TEC_STALE_FAIL_CLOSED` log line, not recurring. No conflict. |
| Hostile-scenario test | Test code | NO | Test environment. No conflict. |

**Verdict: B-NEW-40 introduces zero new recurring schedules and zero competing timers. No Central Clock violations. Nothing to wire to Central Clock.**

### Pre-existing item worth surfacing (not in B-NEW-40 scope)

While reading TEC code for this pre-audit, noted that the existing `[TEC_RESOLVE_AGGR]` log emitter at `trailing-exit-controller.ts:~190` uses raw `setInterval(..., 60_000)` independent of Central Clock. This predates B-NEW-40 and isn't introduced by it, but it IS the kind of "competing timer" the Central Clock standing rule cares about — every 60s it logs a per-class resolve-count summary, but it's not aligned to Central Clock ticks, so the log timestamps drift slightly against FX5 / RTB / TCL events. This is a pre-existing minor drift, not B-NEW-40's problem. Could be a small follow-up cleanup batch: subscribe TEC to Central Clock and use `isAlignedWithInterval(60)` for the log emit. Filing for future consideration; out of B-NEW-40 scope per Kyle's "no scope creep" framing.

### Recommended diagnostic-endpoint enrichment (small, in-scope)

Add Central Clock health to the `/api/diagnostics/tec-config` response payload. Useful at incident time to see whether the clock itself is running and reporting normal drift:

```json
{
  ...existing fields...,
  "centralClock": {
    "isRunning": true,
    "tickNumber": 12345,
    "averageDriftMs": 8.2,
    "maxDriftMs": 47
  }
}
```

Minimal addition, surfaces useful state. Inclusion is suggested; non-blocking.

---

## 2.7 System Alerts infrastructure — scope expansion (Kyle directive 2026-05-17)

**Trigger:** the 14-day soak verification for objectives 2.1–2.5 has a handoff problem — no specific Claude Code session can be relied on to be alive on the verification date, and Kyle has been clear that Telegram messages don't get reliably read (a lot of CC↔Langston technical chatter scrolls past). Kyle's directive: build a basic alerts/notifications surface that survives the handoff. Per-turn Claude check + UI tab for human + server-side cron dispatcher. Keep it minimum-viable; defer the wider health-check architecture to a future batch.

### 2.7.1 Architecture

Three layers, all minimum-viable:

| Layer | What | Component |
|---|---|---|
| Store | Flat-file queue at `/var/log/dawntrader/system-alerts.jsonl`, one JSON object per line — matches the existing `/var/log/cc-bridge-inbox.jsonl` pattern used by Langston bridge. No DB migration for the minimum. | `/var/log/dawntrader/system-alerts.jsonl` |
| Dispatcher | systemd timer running every 15 min, calls `scripts/system-alerts.ts fire-due`. Reads scheduled events (also stored in the same flat file under `state: 'scheduled'`), promotes events whose `triggers_at <= NOW()` to `state: 'active'`, optionally pings Telegram via `@CCDTCommsBot` if `severity: 'critical'`. | systemd `system-alerts-dispatcher.service` + `.timer` |
| Surface (humans) | New UI tab "System Alerts" in the dashboard. Lists `state: 'active'` entries. Ack button per row sets `state: 'acknowledged'` + records `acknowledged_at` + `acknowledged_by`. | React component + `GET /api/system-alerts` + `POST /api/system-alerts/:id/acknowledge` |
| Surface (AI) | Every Claude Code session (CC and Langston) reads `/var/log/dawntrader/system-alerts.jsonl` on every user-message turn. CLAUDE.md mandates this. Surfaces unacknowledged active entries in the response. Marks acknowledged any that the session acts on. | CLAUDE.md addendum (CC + Langston) |

### 2.7.2 Flat-file schema (one JSON object per line)

```jsonc
{
  "id": "uuid",
  "created_at": "ISO-8601",
  "triggers_at": "ISO-8601",          // when this should fire; <= NOW() means due
  "fired_at": "ISO-8601 | null",      // when dispatcher promoted it to active
  "acknowledged_at": "ISO-8601 | null",
  "acknowledged_by": "kyle | cc | langston | system | null",
  "state": "scheduled | active | acknowledged | resolved",
  "category": "soak_verification | health_check | breakage | one_off | recurring",
  "severity": "info | warning | critical",
  "title": "short human-readable label",
  "body": "longer description, optionally with markdown",
  "metadata": { /* free-form jsonb-equivalent: log paths, query refs, etc. */ },
  "recurrence_interval_seconds": null  // schema-reserved for future recurring health checks; not implemented in B-NEW-40
}
```

Each ack/state change rewrites the row (the file is rewritten atomically via tmpfile-rename pattern). The file is small (expected <1000 entries over years), so rewriting whole-file is acceptable. Future DB migration preserves the schema dimensions verbatim — no breaking change when we promote to a table.

### 2.7.3 CLI surface

`scripts/system-alerts.ts`:
- `add --triggers-at <ISO> --category <c> --severity <s> --title <t> --body <b> [--metadata <json>]` — insert a scheduled event
- `fire-due` — dispatcher invocation (called by systemd timer, also runnable manually)
- `list [--state <s>] [--category <c>]` — print alerts
- `ack <id> [--by <user>]` — mark acknowledged
- `resolve <id>` — mark resolved (terminal state, kept for history)

### 2.7.4 API surface

Two read-only/admin endpoints (auth-gated, same `authenticateToken` middleware as `/api/diagnostics/tec-config`):

- `GET /api/system-alerts` — returns all entries where `state IN ('active', 'scheduled')`, sorted by `triggers_at` ascending; honors `?state=` and `?category=` query filters
- `POST /api/system-alerts/:id/acknowledge` — body `{ "by": "kyle" }` — moves an entry to `state: 'acknowledged'`

Both back onto the flat file via the same library used by the CLI. No DB queries — pure file I/O.

### 2.7.5 UI surface

New tab "System Alerts" in the dashboard. Minimum:
- Header with counts: `N active, M scheduled`
- Table: timestamp, category chip, severity chip (color-coded), title, "Ack" button
- Clicking ack calls the POST endpoint and refreshes
- 30-second refresh cadence; no realtime push for the minimum

Polish (filtering, sorting, search, detail view) explicitly deferred.

### 2.7.6 CLAUDE.md addendum (mandatory per-turn check)

New section to be added to BOTH `CLAUDE.md` (CC, in repo) and `/home/langston/CLAUDE.md` (Langston, on Hetzner):

> **System Alerts per-turn check (Kyle directive 2026-05-17 — mandatory).** Before responding to any user message, read `/var/log/dawntrader/system-alerts.jsonl`. For each entry where `state === 'active'` AND `acknowledged_at === null` AND `triggers_at <= NOW()`, surface the entry to the user as part of your response in plain language (not raw JSON). Cite the `id`, `title`, `severity`, `body`, and `metadata` if present. If you act on an alert during the turn (run a verification, dispatch a follow-up, etc.), call `scripts/system-alerts.ts ack <id> --by <session-name>` so it does not keep getting surfaced. If you cannot reach the file (Hetzner unreachable, file missing, etc.), state that explicitly and proceed with the user's request — do not skip the user's intent. Production session-start check + per-turn check both apply.

### 2.7.7 The B-NEW-40 14-day soak event as canonical first use

On deploy day, the implementation script inserts one row into the queue:

```jsonc
{
  "id": "<uuid>",
  "created_at": "<deploy timestamp>",
  "triggers_at": "<deploy timestamp + 14 days>",
  "state": "scheduled",
  "category": "soak_verification",
  "severity": "warning",
  "title": "B-NEW-40 14-day soak verification due",
  "body": "Verify zero TEC_STALE_FAIL_CLOSED events since deploy. Run scripts/b-new-40-soak-verify.ts and review the output. If clean, mark this acknowledged and close B-NEW-40. If recurrences, capture pg_stat_activity + ss output via tec-pg-capture and escalate.",
  "metadata": {
    "verify_script": "scripts/b-new-40-soak-verify.ts",
    "logs_to_grep": ["/var/log/dawntrader/error.log", "/var/log/dawntrader/out.log"],
    "log_signatures": ["TEC_STALE_FAIL_CLOSED", "TEC_REFRESH_TIMEOUT", "TEC_REFRESH_FAIL"],
    "deploy_commit": "<commit-hash>",
    "scope_doc": "Claude Comms and Packages/Scope Files/B_NEW_40_SCOPE.md"
  }
}
```

On day 14, the 15-min dispatcher promotes it to `state: 'active'`. The next Claude session (CC or Langston) sees it on per-turn check. Telegram ping fires concurrently (warning severity — not critical, but Kyle's mobile gets a heads-up). UI tab shows it. Verification runs. Ack closes the loop.

### 2.7.8 SIM consult for the new components

- **`/var/log/dawntrader/system-alerts.jsonl`** — new flat file. Pattern parallels existing `/var/log/cc-bridge-inbox.jsonl`. No SIM entry needed for the file itself; the section we're adding here documents the pattern. Future entries that emit alerts would reference this file.
- **`scripts/system-alerts.ts` CLI** — new operational tool. Cron-invoked + manual. Not part of the runtime application code.
- **`system-alerts-dispatcher.service` + `.timer`** — new systemd units on staging. Run every 15 min. Cron-style infra, not application code. Operational tooling.
- **`GET /api/system-alerts` + `POST /api/system-alerts/:id/acknowledge`** — two new HTTP endpoints in `server/routes.ts`. Read/write to flat file. Auth-gated.
- **UI tab "System Alerts"** — new React component. Reads from new API endpoints.
- **CLAUDE.md addendum** — new mandatory standing rule for every Claude Code session (CC + Langston).

No DB schema changes. No interaction with `server/db.ts` pool. No interaction with `module_constants`. No interaction with TEC except as a consumer of the new alert API.

### 2.7.9 Central Clock alignment audit for the new components

- **systemd timer (every 15 min)** — kernel/systemd-managed, runs in its own process. Cannot subscribe to Node.js Central Clock. Independent of application runtime. No conflict.
- **CLI invocations** — synchronous, one-shot, exit on completion. No recurring schedule. No conflict.
- **API endpoints** — request-driven, fire on inbound HTTP. Not scheduled. No conflict.
- **UI tab refresh (30s polling)** — browser-side `setInterval`. Browser, not server. No conflict.
- **CLAUDE.md per-turn check** — fires on every user message, not on a server-side schedule. No conflict.

**Verdict: zero new recurring schedules introduced in the application runtime. The 15-min systemd timer is a separate process, equivalent in principle to the existing `tec-pg-capture.timer`. No Central Clock interaction or violation.**

### 2.7.10 Long-running query audit

Not applicable — the new components don't query the database. All persistence is via flat-file I/O. The 30-day pool `query_timeout` from objective 2.1 doesn't affect any of these new code paths.

### 2.7.11 Blast radius rating

LOW. The new components are entirely additive:
- New flat file: doesn't conflict with anything else
- New systemd unit: independent of existing services
- New CLI: standalone tool
- New API endpoints: new URL paths, don't modify existing routes
- New UI tab: new tab in the dashboard, doesn't modify existing tabs
- CLAUDE.md addendum: adds a standing rule; doesn't modify any existing rule. Implementation cost is 1-2 sentences of context every Claude session reads on startup.

If the implementation has bugs, the surface area is contained: a malformed alert in the JSONL file won't crash the application (the alerts code is isolated); the dispatcher cron failing just delays alert firing; the per-turn check failing to find the file (Hetzner unreachable from CC's laptop, say) means Claude states the issue and continues. Graceful degradation by design.

### 2.7.12 What's explicitly deferred (documented for future batch)

A new section will be added to `1-system-manual/POST_AUDIT_ROADMAP.md` listing:

- **DB-backed history table** for queryable past alerts. Schema preserves field set from the JSONL today. Migration is mechanical when we want it.
- **Recurrence support** for periodic health checks. Schema already has `recurrence_interval_seconds`; dispatcher logic doesn't yet act on it.
- **Severity-based push routing** with per-category Telegram thresholds, optional Discord/email channels.
- **Breakage-trigger integrations** in specific subsystems: scanner self-monitor, TEC self-monitor, VTS exit loop self-monitor, archive writer self-monitor, etc. Each is a small batch that adds an `emitSystemAlert` call site.
- **Richer alert payloads** — structured evidence pointers beyond the free-form `metadata` field.
- **Acknowledgement state machine** with `reopened` state and audit trail of state transitions.
- **UI polish** — category chips with colors, severity icons, filtering, sorting, search, alert detail view, history view of acknowledged/resolved.
- **Slack/Discord/email push channels** beyond Telegram.

### 2.7.13 Open questions for Langston

**Q-Alerts-1.** Flat file vs DB table for the minimum — agree with flat file (matches `cc-bridge-inbox.jsonl` pattern, no migration needed), or do you want a DB table from day one even at this minimum scope? My lean: flat file is correct for now, DB is the future-batch swap.

**Q-Alerts-2.** Per-turn check mandate — should it be in CLAUDE.md as a standing rule (current proposal), or as a session-start protocol entry in MEMORY.md (which is volatile and may drift)? My lean: CLAUDE.md because it needs to be permanent across all sessions.

**Q-Alerts-3.** Telegram push routing — current proposal: critical severity always pushes, warning/info do not. Agree, or want different defaults?

**Q-Alerts-4.** Ack `--by` field — should it be required (every ack must identify who/what acked it) or optional? My lean: required for audit; the system-side dispatcher acks itself with `--by system`.

**Q-Alerts-5.** Anything missing in the architecture or deferred list?

---

## 3. Blast radius rating

**Pool config change**: MEDIUM-LOW blast radius.
- 23 consumers share the pool. All would see new `keepAlive`, `query_timeout: 30s`, `idleTimeoutMillis: 30s`, explicit `max: 10`.
- Long-query audit (§2.3) shows no current production query exceeds 30s by design.
- `keepAlive: true` is purely additive (TCP probes). No behavioral risk.
- Explicit `max: 10` matches pg-pool default — behavior unchanged, but surfaces the ceiling explicitly for operator visibility. If staging ever shows pool-saturation queue waits, raise to 15 or 20; don't lower `idleTimeoutMillis`.
- `idleTimeoutMillis: 30_000` **extends** the idle window from the pg-pool default 10s to 30s (longer idle survival, not shorter). Tradeoff: lower connection churn (each new connection costs TCP handshake + TLS handshake + auth round-trip) vs. more time for an intermediate hop to drop state on an idle socket. Resilience against dead-socket-reuse is NOT provided by this setting — it's provided by `keepAlive: true` with 10s initial-probe delay, which detects dead sockets independent of pool idle reaping. So `idleTimeoutMillis` is purely churn tuning; the cause we're fixing is handled by the keepalive layer.
- `keepAlive: true` failure mode: when an OS keepalive probe is RST'd by a dead peer, the pg client emits an `'error'` event, the pool removes the client, and any in-flight queries on that client reject with a connection error. **No silent retry** — failures surface to the caller cleanly. Aligns with CLAUDE.md §5 "no silent fallbacks" doctrine.

**TEC refresh timeout change**: LOW blast radius.
- Single callsite at `trailing-exit-controller.ts:235`.
- Behavior on timeout: existing `.catch` fires, `[TEC_REFRESH_FAIL]` logs, `tecRefreshFailCount` increments, `.finally` clears inFlight. All existing recovery paths.
- No public surface change.

**tec-pg-capture change**: ZERO blast radius.
- Operational tooling on staging. Read-only.

---

## 4. Proposed scope (for the Step 1 SCOPE doc that follows this pre-audit)

1. **`server/db.ts`** — add `keepAlive: true`, `keepAliveInitialDelayMillis: 10_000`, `query_timeout: 30_000`, `idleTimeoutMillis: 30_000`, `max: 10`, `application_name: 'dawntrader_main'`.

2. **`server/services/trailing-exit-controller.ts`** — wrap the `refreshTECConfigForClass(assetClass)` await at L235 in `Promise.race([refresh, timeoutAfter45s])` so the inFlight Map always releases. On timeout: log `[TEC_REFRESH_TIMEOUT]`, increment `tecRefreshFailCount` via the existing catch path.

3. **`server/services/trailing-exit-controller.ts` + `server/routes.ts`** — push the diagnostic endpoint code already written in this branch (`getTECDiagnostics()` + `/api/diagnostics/tec-config` route). Langston rev1 approved. **Add Central Clock health (`isRunning`, `tickNumber`, `averageDrift`, `maxDrift`) to the response payload** per §2.6 enrichment recommendation — gives operational visibility at incident time.

4. **`tec-pg-capture` systemd unit on staging** — add `ss -tnpi state established '( dport = 5432 )' > $OUT_DIR/ss_$ts.txt` per snapshot tick.

5. **NEW hostile-scenario test** in `server/services/__tests__/` — simulate a hung refresh promise and assert ALL of:
   - (a) `tecConfigRefreshInFlight` Map entry releases within 45s + ε
   - (b) `tecRefreshFailCount` for the affected asset class increments by 1 (so the catch path is provably traversed)
   - (c) `[TEC_REFRESH_TIMEOUT]` (or `[TEC_REFRESH_FAIL]`) log line fires exactly once for that incident (so a future regression bypassing the catch path is caught)
   - (d) `resolveTECConfig` continues returning the cached config snapshot until `CONFIG_MAX_STALENESS_MS` (5 min) elapses, then throws `TEC_STALE_FAIL_CLOSED`
   This expanded assertion set prevents regressions where the catch handler is silently skipped (the exact failure-mode pattern B-NEW-40 closes).

6. **Governance updates**:
   - Add new SIM section for B79.TEC config-cache subsystem + B-NEW-40 pool/refresh changes
   - Add CHANGES_AND_FIXES entry: BUG-2026-05-17 (or similar)
   - Update BATCH_CATALOG
   - Update PHASE_HISTORY if applicable

---

## 5. Open questions for Langston Step 2 review

**Q1.** Pre-audit blast radius assessment for the pool change — agree with MEDIUM-LOW? Any consumer I haven't accounted for?

**Q2.** `query_timeout: 30_000` — agree with 30s? Or do you want a higher ceiling (60s, 120s) given the partition-exporter 240-min historical reference? I argued in §2.3 that 30s is safe; do you concur?

**Q3.** Refresh-promise timeout value: 45s. Justification: pool `query_timeout` is 30s, so a hung query SHOULD reject at ~30s, then the refresh wrapper releases at 45s as a fallback. Is 45s tight enough (so we recover fast on inFlight stuck states) or do you want longer (60s)?

**Q4.** `idleTimeoutMillis: 30_000` — pg-pool default is 10s. Going to 30s reduces connection churn but extends the window where a connection could sit idle long enough for NAT to drop state. What's your preferred value?

**Q5.** SIM governance: agree with adding a new section for B79.TEC config-cache subsystem as part of this batch? Or split it into a separate governance-only patch?

**Q6.** Anything in this pre-audit that's missing or wrongly framed?

**Q7.** Central Clock alignment audit in §2.6 — agree the verdict (zero violations, nothing to wire)? Agree with the recommendation to add Central Clock health to the diagnostic endpoint payload? Agree the pre-existing `setInterval` in `[TEC_RESOLVE_AGGR]` is a follow-up consideration, not B-NEW-40 scope?

---

## 6. Pre-audit standing-rules verification

Per CLAUDE.md §2 + §9:

- [x] Scope written first: not yet (this is the pre-audit; scope follows)
- [x] **SIM consulted for every component affected** — done (§2)
- [x] Upstream/downstream traced — done (§2)
- [x] Blast radius rated — done (§3)
- [x] Plain-language summary planned for Kyle — included in batch scope when drafted
- [x] No silent fallback proposed — keepAlive is additive; pool timeouts fail loud with logged errors
- [x] Per-asset-class default verified — TEC config is already per-asset-class (B79.TEC architecture); no change to that dimension here
- [x] Crypto regression check planned — yes (see batch scope when drafted)
- [x] File-first protocol for Langston ask — yes (this file, staged to inbox)
- [x] **Central Clock alignment audit** (Kyle directive 2026-05-17) — done (§2.6). Verdict: no violations, no new recurring schedules introduced. One small enrichment proposed (Central Clock health in diagnostic endpoint payload). One pre-existing follow-up item noted (TEC `setInterval` for `[TEC_RESOLVE_AGGR]` log emit, out of scope here)

---

## 7. Deliverables to commit alongside the actual fix

- `Claude Comms and Packages/Scope Files/B_NEW_40_SCOPE.md` (Step 1 scope, draft after this pre-audit Step 2 sign-off)
- `Claude Comms and Packages/Scope Files/B_NEW_40_PRE_AUDIT.md` (THIS FILE)
- `Claude Comms and Packages/Batch Completion/B_NEW_40_COMPLETION_REPORT.md` (Step 11)
- Code changes per §4
- SIM update per §2.5 + §4 item 6
- CHANGES_AND_FIXES entry
- BATCH_CATALOG row
