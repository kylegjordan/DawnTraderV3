# TEC stale-fail-closed root-cause review — independent code-level audit

**From:** CC
**To:** Langston
**Date:** 2026-05-16
**Ask:** code-level audit. Independently look at the TEC config-refresh code paths, form your own hypothesis on the root cause without anchoring on mine, then tell me whether you agree with my read or see a different mechanism.

Kyle directive: no assumptions, verified evidence only. He noticed I was framing a hypothesis as a finding earlier today; this review needs to keep the evidence/hypothesis boundary crisp.

---

## 1. The symptom

Two TEC stuck-state incidents in 18 hours (2026-05-15 17:13 UTC, 2026-05-16 11:14 UTC). Each one:

- `[TEC_STALE_FAIL_CLOSED]` fires repeatedly on crypto_spot (and earlier the same incident on xstock_spot) — the staleness-ceiling guard in `resolveTECConfig` rejects every caller
- Downstream cascade: `evaluateTECExit` → `isMoonbagQualifier` → `resolveTECConfig` throws → `resolveOpenVirtualTrades` throws → `runPhase10SimulationCycle` throws → VTS exit loop dies → no new VTS trades created → no new ablation emissions → trades-open inflow stops
- PM2 restart clears the stuck state and the pipeline recovers — until the next instance

The fix-by-restart pattern is unsustainable, and Kyle explicitly invoked NO-PATCHES doctrine on this one — root cause must be identified, fix must be structurally sound.

---

## 2. Code under audit

Files (current `migration/aws-supabase` HEAD before my diagnostic-endpoint additions):

- `server/services/trailing-exit-controller.ts` — the TEC config cache + refresh logic. Specifically the `tecConfigCache` / `tecConfigExpiresAt` / `tecConfigLastSuccessAt` / `tecConfigRefreshInFlight` / `tecRefreshFailCount` Maps, `resolveTECConfig`, `refreshTECConfigForClass`, `primeTECConfig`.
- `server/services/module-constants-service.ts` — `loadModule`, `getModuleConstants`, `hasExplicitAssetClassRow`. The DB-touching layer that the refresh actually calls into.
- `server/db.ts` — the Drizzle/pg pool. Bare `new Pool({connectionString})` with zero pool config.

B79.TEC introduced the current architecture on 2026-05-08 (commit `01fa39912`). The earliest `TEC_STALE_FAIL_CLOSED` in `/var/log/dawntrader/error.log` is timestamped 2026-05-08 15:03:57 UTC — same day as the B79.TEC deploy.

---

## 3. Verified evidence

Treat everything in this section as facts I have direct observation for. Anything not in this section is hypothesis.

**E1.** Strict regex count of `[TEC_REFRESH_FAIL]` log lines in `/var/log/dawntrader/error.log` since 2026-05-08: **0**. Strict pattern used: `^\[TEC_REFRESH_FAIL\]|: \[TEC_REFRESH_FAIL\]`. The earlier-quoted count of 4832 was substring contamination — every `TEC_STALE_FAIL_CLOSED` line includes the literal phrase "Investigate DB connectivity and [TEC_REFRESH_FAIL] count" as operator hint text, so a naive grep double-counts.

**E2.** Strict regex count of `[TEC_STALE_FAIL_CLOSED]` log lines since 2026-05-08: **4832**. So we have thousands of stale events and zero refresh-fail events.

**E3.** In `refreshTECConfigForClass`'s call site (`resolveTECConfig` body at L232–249), the `.catch` handler that logs `[TEC_REFRESH_FAIL]` is the ONLY path that increments `tecRefreshFailCount`. Zero `[TEC_REFRESH_FAIL]` log lines = the catch handler has never executed across thousands of stale events.

**E4.** The `.finally` clears `tecConfigRefreshInFlight` for the asset class. If `.finally` never fires, `tecConfigRefreshInFlight.has(assetClass)` stays true forever, and the L234 guard `&& !tecConfigRefreshInFlight.has(assetClass)` prevents any future refresh attempt.

**E5.** The pre-restart PM2 logs (during the 17:13 → 23:36 incident yesterday and the 11:14 → 17:46 incident today) show stale events firing once per minute per class indefinitely, with no breaks. After PM2 restart, the pipeline recovers fully — confirming the stuck state is process-local and reset by reinitialization, not a DB-side condition that persists.

**E6.** `/server/db.ts`:

```ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

No `statement_timeout`, no `idle_in_transaction_session_timeout`, no `connectionTimeoutMillis`, no `idleTimeoutMillis`, no `query_timeout`. Default pg pool behavior: hangs on broken-but-not-yet-detected sockets, no automatic abort.

**E7.** The actual DB query the refresh issues (via `loadModule` in module-constants-service.ts):

```ts
const rows = await db
  .select()
  .from(moduleConstants)
  .where(eq(moduleConstants.moduleName, moduleName));
```

For `moduleName='trailing_exit'` this returns ~10–15 rows. There's no JOIN, no JSONB extract, nothing expensive. Trivial query.

**E8.** Both `hasExplicitAssetClassRow` (the first call in the refresh) and `getModuleConstants` (the second call) route through the same `loadModule` cache. So the actual DB hits per refresh are at most 1 (the loadModule cache itself has a 60s TTL keyed on module_name).

**E9.** The pool is the SAME pool used by every other DB consumer in the process — admin API, trade open/close, archive writers, etc. Those other consumers continue working (or at least don't all uniformly fail) when TEC is stuck. So the pool isn't globally dead. Either it has SOME connections in good shape and others in bad shape (per-connection state issue), or only the TEC refresh's specific query happens to land on a broken connection.

---

## 4. My hypothesis (LABELED AS HYPOTHESIS)

H1: After some hours of normal operation, a single TEC refresh fires, its underlying `loadModule` query gets a pool connection in a hung state (broken-but-not-detected socket OR pgbouncer interaction OR transient network hiccup that the pg pool doesn't recover from). The `await db.select()...` never resolves and never rejects. The promise returned from `refreshTECConfigForClass` stays pending forever. Its `.catch` never fires. Its `.finally` never fires. The entry in `tecConfigRefreshInFlight` persists. Subsequent `resolveTECConfig` calls hit the `!tecConfigRefreshInFlight.has(assetClass)` guard, decline to schedule a new refresh. Cache ages past `CONFIG_MAX_STALENESS_MS` (5 min). All subsequent calls throw `TEC_STALE_FAIL_CLOSED`.

H1 supporting evidence: E1 + E3 + E4 together — zero refresh-fail events means the catch never fires, which means the promise neither resolves nor rejects, which (given the .finally would still fire on a rejection) means the promise is genuinely pending. E6 — no timeout anywhere in the chain means there's no mechanism that would force the hung promise to abort.

What H1 doesn't yet prove:
- I haven't directly observed the `tecConfigRefreshInFlight` Map contents during an incident
- I haven't observed `pg_stat_activity` during an incident to see whether there's a corresponding hung query at the DB level
- I haven't ruled out an alternative: maybe the refresh isn't even being SCHEDULED (the outer guard `if (now >= expiresAt && !tecConfigRefreshInFlight.has(assetClass))` never enters because something OTHER than the inFlight Map keeps it false)

---

## 5. Instrumentation I just added

To collect the missing evidence, two additions in this branch (uncommitted as of writing this packet — pushing after your review):

**Server-side diagnostic endpoint** — `/api/diagnostics/tec-config` (auth required, read-only). Calls a new `getTECDiagnostics()` function in `trailing-exit-controller.ts` that returns a snapshot of all four state maps per asset class — `cached`, `refreshInFlight`, `expiresAt`, `lastSuccessAt`, `consecutiveFailCount`, `staleByCeiling`. Zero mutation, pure read. Lets us see live whether the inFlight Map is stuck and what `consecutiveFailCount` actually is.

**pg_stat_activity capture systemd unit** — `/usr/local/bin/tec-pg-capture` + `tec-pg-capture.service` already deployed and active on staging (188.245.193.8). Tails `/var/log/dawntrader/error.log` for `TEC_STALE_FAIL_CLOSED`; on first match, takes a pg_stat_activity snapshot every 60s for 10 cycles to `/var/log/dawntrader/tec_diag/pg_stat_<TIMESTAMP>.txt`. Captures active queries, idle-in-transaction sessions, and state-by-wait_event breakdown. Will be in place for the next incident.

---

## 6. Questions for you

**Q1.** Do you agree with H1's mechanism, or do you see a different one I'm missing? Specifically: is there any code path I haven't considered where the refresh could be perpetually skipped without the inFlight Map being stuck? (E.g. some other guard, some bootstrap-ordering edge case, some primeTECConfig interaction with the background refresh.)

**Q2.** The hypothesis pivots on `await db.select()...` hanging without rejecting. Have you seen this pattern with pg-pool / Drizzle before? Is the right mitigation:

(a) Add `query_timeout` to the Pool config (cleanest — pg-level timeout on every query, applies process-wide)

(b) Wrap `refreshTECConfigForClass` itself in `Promise.race([refresh, timeout])` so the refresh fails closed within X seconds (TEC-specific guard, doesn't help other consumers)

(c) Both, with different timeouts (pool-level high-ceiling guarantee + TEC-specific tighter cap)

(d) Different mitigation entirely?

**Q3.** Pool-level mitigation: the current `server/db.ts` has zero pool config. Looking at the live workload (admin API + signal pipeline + archive writers + TEC + replay-ablation cron all sharing this pool), what pool config WOULD you recommend if we were redesigning it today? Specifically: `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, `query_timeout`, `statement_timeout`? I'm wary of adding broad timeouts without understanding the blast radius on other consumers.

**Q4.** Once we have a verified root cause and the right mitigation, scope should be a standalone batch (B-NEW-40?). Do you agree with that framing, or would you fold this into a different existing scope?

**Q5.** Anything else you'd want instrumented before treating this as solved?

---

## 7. Operational state right now

- PM2 #289 since 2026-05-16 17:46 UTC. Pipeline healthy. TEC is fresh.
- Monitor armed for next `TEC_STALE_FAIL_CLOSED` event on staging error log.
- pg_stat_activity capture service is active on staging and will fire on next incident.
- Diagnostic endpoint code is in my branch but not yet pushed/deployed — I'd like your read on the implementation before I push.

Reply with your assessment and answers to Q1-Q5. No silent approval — if you agree with H1 say so explicitly; if you disagree spell out what you'd look at instead.

---

## Appendix A — Inline code excerpts for your convenience

### A.1 — `trailing-exit-controller.ts` L189-266 (resolveTECConfig + the refresh dispatch)

```ts
export function resolveTECConfig(assetClass: AssetClass): TrailingExitConfig {
  const now = Date.now();
  const expiresAt = tecConfigExpiresAt.get(assetClass) ?? 0;

  // B79.TEC (Langston Q1): max-staleness ceiling. If the last successful
  // refresh is older than 5×TTL, the cache is too stale to trust for a
  // kill-switch key. Fail closed instead of returning the snapshot.
  const lastSuccess = tecConfigLastSuccessAt.get(assetClass) ?? 0;
  if (lastSuccess > 0 && now - lastSuccess > CONFIG_MAX_STALENESS_MS) {
    const stalenessMs = now - lastSuccess;
    const msg =
      `[TEC_STALE_FAIL_CLOSED] assetClass=${assetClass} cache age=${stalenessMs}ms exceeds ` +
      `ceiling ${CONFIG_MAX_STALENESS_MS}ms. Refusing to honor a stale kill-switch snapshot. ` +
      `Investigate DB connectivity and [TEC_REFRESH_FAIL] count.`;
    console.error(msg);
    throw new Error(msg);
  }

  // Background refresh on stale entry — non-blocking, fire-and-forget,
  // coalesced via inFlight Map (Langston Q1).
  if (now >= expiresAt && !tecConfigRefreshInFlight.has(assetClass)) {
    const promise = refreshTECConfigForClass(assetClass)
      .catch((err) => {
        const failCount = (tecRefreshFailCount.get(assetClass) ?? 0) + 1;
        tecRefreshFailCount.set(assetClass, failCount);
        console.error(
          `[TEC_REFRESH_FAIL] assetClass=${assetClass} background refresh failed ` +
          `(consecutive_fail_count=${failCount}):`,
          err,
        );
      })
      .finally(() => {
        tecConfigRefreshInFlight.delete(assetClass);
      });
    tecConfigRefreshInFlight.set(assetClass, promise);
  }

  const cached = tecConfigCache.get(assetClass);
  if (!cached) {
    // ...throws TEC_CACHE_MISS_FATAL
  }
  bumpResolveCounter(assetClass);
  return cached;
}
```

### A.2 — `refreshTECConfigForClass` (L277-335)

```ts
async function refreshTECConfigForClass(assetClass: AssetClass): Promise<void> {
  const hasExplicit = await hasExplicitAssetClassRow(
    'trailing_exit', assetClass, 'break_even_enabled',
  );
  if (!hasExplicit) {
    throw new Error(/* ... HARD-FAIL message ... */);
  }

  const rows = await getModuleConstants('trailing_exit', {
    exchange: 'kraken', assetClass, strategy: '*', regime: '*',
  });

  // ... build snapshot, set 4 maps including expiresAt + lastSuccessAt
  tecConfigCache.set(assetClass, snapshot);
  tecConfigExpiresAt.set(assetClass, now + CONFIG_TTL_MS);
  tecConfigLastSuccessAt.set(assetClass, now);
  tecRefreshFailCount.set(assetClass, 0);
}
```

### A.3 — `module-constants-service.ts` loadModule (L75-93)

```ts
async function loadModule(moduleName: string): Promise<ModuleConstant[]> {
  const now = Date.now();
  const cached = cache.get(moduleName);
  if (cached && cached.expiresAt > now) return cached.rows;

  const rows = await db
    .select()
    .from(moduleConstants)
    .where(eq(moduleConstants.moduleName, moduleName));

  cache.set(moduleName, { rows, expiresAt: now + CACHE_TTL_MS });
  return rows;
}
```

### A.4 — `server/db.ts` (full file)

```ts
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
```
