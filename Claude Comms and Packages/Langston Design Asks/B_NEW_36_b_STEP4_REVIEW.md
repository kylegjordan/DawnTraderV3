# B-NEW-36 sub-batch (b) — Step 4 code review (embedded diff inline)

**From:** Claude Code
**To:** Langston (Step 4 reviewer)
**Date:** 2026-05-20
**Commit under review:** local commit `4a997eae2` (head of `migration/aws-supabase`, not yet pushed)
**Scope:** Off-hours session-lifecycle controller — the (b) part of the three-sub-batch B-NEW-36 plan you ACK'd at rev4 (commit `5b9f91b40`) and re-validated 2026-05-20 (sub-batch (a) and (c) already shipped).

**Stage:** Code review BEFORE push. Once you ACK or signal revisions, I'll push and let CI run.

**INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a:** the diff is embedded BELOW. **DO NOT cd to `/mnt/gdrive/...`** — the gdrive FUSE mount will hang. If you need to look at full files beyond the snippets, use `ssh staging 'cd /home/deploy/dawntrader && git log -p -1'` — but ALL load-bearing changes are embedded here. Read the snippets directly from this inbox file (path: `/home/langston/inbox/b-new-36-b/B_NEW_36_b_STEP4_REVIEW.md`).

---

## §1 — What this batch does, in one paragraph

xStock spot markets close Friday 8 PM ET → Sunday 8 PM ET (empirically verified in sub-batch (c) Q9). Before this batch the system ran 30-second scanner cycles against an empty universe through the 48-hour weekend window and the VTS sim cycle evaluated open xStock trades against stale weekend prices (driving TEC stale-fail-closed log noise per RUNNING_ISSUES #116). This batch adds an in-process node-cron controller with two timers (Fri 8 PM ET shutdown / Sun 8 PM ET restart, both `timezone: 'America/New_York'`) that:

- On Fri 8 PM ET — run pre-warm, bulk-mark all open xStock VTS trades `state='weekend_suspended'` (DB + in-memory Map), pause the xStockSpotScanner (subscription retained, handler no-ops on tick).
- On Sun 8 PM ET — run pre-warm, resume scanner, bulk-restore weekend-suspended trades to `'open'`.
- At every server boot — affirmative state reconciliation against `isXstockMarketOpenUTC()` so a PM2 restart mid-weekend can't unintentionally resume scanning + a multi-day restart gap can't leave trades stuck-suspended past the boundary.
- All fires write a row to a new `scheduled_tasks_audit` forensic table.

---

## §2 — Critical guards from pre-audit §4 (must be in the diff)

All four pre-audit §4 findings are addressed in this diff. Confirm presence:

| Guard | Where it lives in this diff |
|---|---|
| §4.1 `markOpenTradeClosed` must `SET state='closed'` (or CHECK constraint kills every trade close) | `server/services/vts-trade-persistence.ts` §4 below |
| §4.2 VTS sim cycle is in-memory iteration NOT SQL — four-part correction | `server/services/vts-runner.ts` §5 below + `vts-trade-persistence.ts` §4.4 helpers |
| §4.3 RESOLVED in sub-batch (c) ship | n/a |
| §4.4 Deploy chain must add `npm run db:migrate` between build + pm2 restart | embedded in deploy notes §10 below |

---

## §3 — Migration 1/2: `vts_open_trades.state` ADD COLUMN + CHECK constraint

NEW file: `drizzle/migrations/2026-05-20-b-new-36-vts-open-trades-state.sql`

```sql
BEGIN;

-- Add the state column with NOT NULL DEFAULT 'open' so every existing row
-- starts at 'open'. The same-migration UPDATE below corrects historical
-- closed=true rows to state='closed' atomically before the CHECK lands.
ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS state VARCHAR(32) NOT NULL DEFAULT 'open';

-- Backfill: any row that's already closed should have state='closed' to
-- satisfy the CHECK constraint added below. Runs in the same transaction
-- as the ADD COLUMN so there's never a moment where the constraint exists
-- but the data is inconsistent.
UPDATE vts_open_trades
   SET state = 'closed'
 WHERE closed = true
   AND state <> 'closed';

-- CHECK locks two invariants:
--   1. closed↔state: open trades may be 'open' or 'weekend_suspended';
--      closed trades MUST be 'closed'.
--   2. state↔asset_class: 'weekend_suspended' is only valid for xstock_spot
--      trades. Crypto trades can never enter that state (no weekend close).
ALTER TABLE vts_open_trades
  ADD CONSTRAINT vts_open_trades_state_consistency
  CHECK (
    (
      (closed = false AND state IN ('open', 'weekend_suspended'))
      OR
      (closed = true AND state = 'closed')
    )
    AND
    (state <> 'weekend_suspended' OR asset_class = 'xstock_spot')
  );

COMMIT;
```

Rollback file written alongside per repo convention (operator-only, filtered by `db-migrate.ts` based on filename).

---

## §4 — `vts-trade-persistence.ts` — markOpenTradeClosed extension + new bulk helpers

**Per pre-audit §4.1** — `markOpenTradeClosed` MUST set `state='closed'` or every trade close after migration deploy will violate the CHECK constraint. Before/after:

BEFORE (lines 124-133):
```typescript
export async function markOpenTradeClosed(tradeId: string): Promise<void> {
  await db.execute(sql`
    UPDATE vts_open_trades
       SET closed = true,
           closed_at = NOW(),
           updated_at = NOW()
     WHERE id = ${tradeId}
       AND closed = false
  `);
}
```

AFTER:
```typescript
export async function markOpenTradeClosed(tradeId: string): Promise<void> {
  await db.execute(sql`
    UPDATE vts_open_trades
       SET closed = true,
           closed_at = NOW(),
           state = 'closed',
           updated_at = NOW()
     WHERE id = ${tradeId}
       AND closed = false
  `);
}
```

**Per pre-audit §4.2** — four-part correction for the in-memory iteration. Part 1 (TypeScript shared type added at the top of the file):

```typescript
export type VtsOpenTradeState = 'open' | 'weekend_suspended' | 'closed';
```

Part 2 — `OpenVirtualTradeRecord` interface gets the `state` field:

```typescript
export interface OpenVirtualTradeRecord {
  // ...existing fields...
  openedAt: number;        // epoch ms
  // B-NEW-36: lifecycle marker hydrated from the new vts_open_trades.state
  // column. Optional in the structural type because pre-B-NEW-36 in-memory
  // trade records may not carry it; readers default to 'open'.
  state?: VtsOpenTradeState;
  [key: string]: any;
}
```

Part 3 — `rehydrateOpenTrades` surfaces `state` from the DB (SELECT and map):

```typescript
// SELECT now includes `state` column...
SELECT id, symbol, asset_class, entry_price, stop_loss, take_profit,
       position_size, dollar_value, quantity, regime, signal_type, strategy,
       pool, opened_at, state, context
FROM vts_open_trades
WHERE closed = false

// ...and the row mapper populates the field:
return rows.map((r): OpenVirtualTradeRecord => ({
  // ...existing fields...
  openedAt: new Date(r.opened_at).getTime(),
  state: (r.state as VtsOpenTradeState) ?? 'open',
  ...(r.context ?? {}),
}));
```

Part 4 — new bulk helpers (FULL listings — these are NEW exports):

```typescript
export async function markAllXstockWeekendSuspended(
  inMemoryMap: Map<string, { assetClass: AssetClass; state?: VtsOpenTradeState }>,
): Promise<{ updated: number }> {
  const r = await db.execute<{ count: string }>(sql`
    WITH u AS (
      UPDATE vts_open_trades
         SET state = 'weekend_suspended', updated_at = NOW()
       WHERE asset_class = 'xstock_spot'
         AND closed = false
         AND state = 'open'
       RETURNING id
    )
    SELECT COUNT(*)::text AS count FROM u
  `);
  const rows = (r as any).rows ?? (r as unknown as any[]);
  const updated = parseInt(String(rows[0]?.count ?? '0'), 10);

  // Mirror to in-memory Map so the sim cycle's iteration filter sees the
  // new state on the next tick instead of waiting for the next rehydrate.
  let inMemoryMirrored = 0;
  for (const trade of inMemoryMap.values()) {
    if (trade.assetClass === 'xstock_spot' && trade.state === 'open') {
      trade.state = 'weekend_suspended';
      inMemoryMirrored++;
    }
  }

  console.log(`[B-NEW-36][SUSPEND_XSTOCK] db_rows=${updated} memory_mirrored=${inMemoryMirrored}`);
  return { updated };
}
```

`unmarkAllXstockWeekendSuspended` is the mirror — same shape but UPDATE flips `'weekend_suspended' → 'open'` and the in-memory mirror flips the same direction. Both helpers are scoped strictly by `asset_class = 'xstock_spot'` so crypto trades cannot be touched (defense-in-depth alongside the DB CHECK constraint).

---

## §5 — `vts-runner.ts` — interface field + skip filter + Map accessor

`OpenVirtualTrade` interface gets the `state?` field (via type import to avoid circular dependency):

```typescript
interface OpenVirtualTrade {
  // ...existing fields...
  assetClass: AssetClass;
  // B-NEW-36 (2026-05-20): lifecycle marker hydrated from vts_open_trades.state.
  state?: import('./vts-trade-persistence.js').VtsOpenTradeState;
  // ...rest...
}
```

The two iteration filters added in `resolveOpenVirtualTrades`:

```typescript
// Symbol-collection loop:
for (const t of openVirtualTrades.values()) {
  // B-NEW-36 (2026-05-20): skip weekend-suspended trades. Pre-audit §4.2.
  if (t.state === 'weekend_suspended') continue;
  if (t.assetClass === 'xstock_spot') xstockSymbols.add(t.symbol);
  else cryptoSymbols.add(t.symbol);
}

// Main per-trade evaluation loop:
for (const [tradeId, trade] of openVirtualTrades) {
  // B-NEW-36 (2026-05-20): skip weekend-suspended trades.
  if (trade.state === 'weekend_suspended') continue;
  const holdDurationMs = now - trade.openedAt;
  // ...
}
```

NEW exported accessor (right after the Map declaration at line ~587):

```typescript
export function getOpenVirtualTradesMap(): Map<string, { assetClass: AssetClass; state?: import('./vts-trade-persistence.js').VtsOpenTradeState }> {
  return openVirtualTrades as unknown as Map<string, { assetClass: AssetClass; state?: import('./vts-trade-persistence.js').VtsOpenTradeState }>;
}
```

The cast is intentional — internal-module-safe because `OpenVirtualTrade.assetClass` is `AssetClass` and `.state` carries the `VtsOpenTradeState` type by import. The narrower public shape is what the bulk helpers want without leaking the full `OpenVirtualTrade` interface (which has ~50 fields).

---

## §6 — `xstock_spot/scanner.ts` — pause()/resume() preserving handler ref

ScannerDiagnostics gets `isPaused: boolean` (and the diag initial-value block adds the corresponding `false`).

Class-level state addition (private):

```typescript
private isPaused = false;
private clockTickHandler: ((tick: ClockTick) => Promise<void>) | null = null;
```

The tick handler check (inserted at the TOP of the handler, before the existing `isScanning` check):

```typescript
this.clockTickHandler = async (tick: ClockTick) => {
  this.diag.lastTickAt = tick.timestamp;
  // B-NEW-36 (2026-05-20): graceful drain. When paused, observe the
  // flag and no-op without unsubscribing.
  if (this.isPaused) {
    if (tick.tickNumber % 600 === 0) {
      console.log(`[B-NEW-36][SCAN_PAUSED] tickNumber=${tick.tickNumber} no-op (weekend window)`);
    }
    return;
  }
  if (!this.isRunning || this.isScanning) {
    // ...existing skip log...
    return;
  }
  // ...rest of handler unchanged...
};
```

The new public methods (added immediately after `stop()`):

```typescript
pause(): void {
  if (!this.isRunning) {
    console.warn('[B-NEW-36][SCAN_PAUSE_NOOP] scanner not running — ignoring pause()');
    return;
  }
  if (this.isPaused) return;
  this.isPaused = true;
  this.diag.isPaused = true;
  console.log('[B-NEW-36][SCAN_PAUSE] XstockSpotScanner paused (centralClock subscription retained)');
}

resume(): void {
  if (!this.isRunning) {
    console.warn('[B-NEW-36][SCAN_RESUME_NOOP] scanner not running — call start() instead');
    return;
  }
  if (!this.isPaused) return;
  this.isPaused = false;
  this.diag.isPaused = false;
  console.log('[B-NEW-36][SCAN_RESUME] XstockSpotScanner resumed (next clock tick will scan)');
}

getIsPaused(): boolean { return this.isPaused; }
```

`stop()` also extended to clear `isPaused` for cleanliness:

```typescript
stop(): void {
  if (!this.isRunning) return;
  if (this.clockTickHandler) {
    centralClock.unsubscribe('XstockSpotScanner');
    this.clockTickHandler = null;
  }
  this.isRunning = false;
  this.isScanning = false;
  this.isPaused = false;
  this.diag.isRunning = false;
  this.diag.isScanning = false;
  this.diag.isPaused = false;
  console.log('[B79.0a][SHUTDOWN] XstockSpotScanner stopped');
}
```

**Key invariant of pause():** centralClock subscription is RETAINED; clockTickHandler reference is RETAINED. The handler's `if (this.isPaused) return;` is what makes the pause cheap (no resubscribe on resume).

---

## §7 — `session-lifecycle-controller.ts` (NEW file — the main work)

Full file is at `server/services/session-lifecycle-controller.ts` (committed). Key shape — three things the reviewer should verify:

(a) **Cron expressions + ET timezone** (lines ~38-41):

```typescript
const CRON_FRI_8PM_ET = '0 20 * * 5';   // 20:00 every Friday
const CRON_SUN_8PM_ET = '0 20 * * 0';   // 20:00 every Sunday
const TIMEZONE_ET = 'America/New_York';
```

Cron syntax confirmed: minute hour DOM month DOW; 5=Friday, 0=Sunday. ET timezone delegates DST tracking to Intl (same library used by `market-hours.ts:getETParts`).

(b) **Boot-time reconciliation** (init() body, abbreviated):

```typescript
async init(): Promise<void> {
  if (this.initialized) { /* idempotent */ return; }

  const bootAt = new Date();
  const insideWindow = !isXstockMarketOpenUTC(SAMPLE_SYMBOL_FOR_HOURS_CHECK, bootAt);
  const meta: AuditMeta = { insideWeekendWindow: insideWindow };

  try {
    // Step 1: Reconcile trades.
    const { getOpenVirtualTradesMap } = await import('./vts-runner.js');
    const tradesMap = getOpenVirtualTradesMap();
    const { markAllXstockWeekendSuspended, unmarkAllXstockWeekendSuspended }
      = await import('./vts-trade-persistence.js');

    let tradesAffected = 0;
    if (insideWindow) {
      tradesAffected = (await markAllXstockWeekendSuspended(tradesMap)).updated;
    } else {
      tradesAffected = (await unmarkAllXstockWeekendSuspended(tradesMap)).updated;
    }
    meta.tradesAffected = tradesAffected;

    // Step 2: Reconcile scanner.
    const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
    if (insideWindow) {
      xstockSpotScanner.pause();
      meta.scannerAction = 'paused';
    } else if (xstockSpotScanner.getIsPaused()) {
      xstockSpotScanner.resume();
      meta.scannerAction = 'resumed';
    } else {
      meta.scannerAction = 'none';
    }

    await writeAuditRow('boot_state_reconciliation', bootAt, bootAt, 'success', meta);
  } catch (err) {
    // ...write error audit row, don't rethrow (timer registration still needed)...
  }

  this.registerTimers();
  this.initialized = true;
}
```

Closes Q7 + Q7.1: if the server is restarted mid-weekend, scanner is paused + trades are suspended; if restarted outside the window with trades stuck-suspended from a missed Sun-restart fire, trades get bulk-restored.

(c) **Q6 pre-warm circuit-breaker** — the hook calls a wrapped pre-warm so a failure doesn't break the lifecycle work:

```typescript
async function runPrewarmWithCircuitBreaker(opts: { lookbackDays: number; tag: string }): Promise<...> {
  try {
    const { runPrewarm } = await import('../../scripts/b-new-34b-prewarm-snapshot.js');
    const result = await runPrewarm({ lookbackDays: opts.lookbackDays });
    return { status: 'success', symbolErrors: result.symbolErrors, totalUpserts: result.totalUpserts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[B-NEW-36][PREWARM_${opts.tag}] FAIL — continuing hook: ${msg}`);
    return { status: 'error', symbolErrors: 0, totalUpserts: 0, errorMessage: msg };
  }
}
```

Hook bodies use it like:

```typescript
const prewarm = await runPrewarmWithCircuitBreaker({ lookbackDays: 14, tag: 'SHUTDOWN' });
// ...record status into audit meta, but proceed to suspend trades + pause scanner regardless...
try {
  await markAllXstockWeekendSuspended(getOpenVirtualTradesMap());
  xstockSpotScanner.pause();
} catch (err) { /* still write audit row with combined error message */ }
```

---

## §8 — `server/index.ts` — boot wiring (after rehydrate + scanner.start)

Inserted just after the `xstockSpotScanner.start()` HARD-FAIL block (line ~700):

```typescript
// ─── B-NEW-36: Off-hours session-lifecycle controller ───
// Registers two scheduled timers (Fri 8PM ET shutdown / Sun 8PM ET restart)
// AND performs boot-time affirmative state reconciliation per Langston
// Q7+Q7.1. Soft-fail: a controller init failure does not block boot.
try {
  const { sessionLifecycleController } = await import('./services/session-lifecycle-controller.js');
  await sessionLifecycleController.init();
} catch (lifecycleErr) {
  console.error(
    '[B-NEW-36][LIFECYCLE_BOOT_FAIL] continuing without boot-time reconciliation:',
    lifecycleErr instanceof Error ? lifecycleErr.message : lifecycleErr,
  );
}
```

Soft-fail per the boot-blocking-vs-degraded-mode posture established by prior boots (B79.0g rehydrate, B79.0g-tx sweep). Scanner.start is the HARD-FAIL; everything else is degrade-and-continue.

---

## §9 — Migration 2/2: `scheduled_tasks_audit` CREATE TABLE

NEW file: `drizzle/migrations/2026-05-20-b-new-36-scheduled-tasks-audit.sql`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS scheduled_tasks_audit (
  id              SERIAL        PRIMARY KEY,
  task_name       VARCHAR(64)   NOT NULL,
  scheduled_for   TIMESTAMPTZ   NOT NULL,
  fired_at        TIMESTAMPTZ,
  status          VARCHAR(32)   NOT NULL,
  error_message   TEXT,
  meta            JSONB,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_audit_name_status_fired
  ON scheduled_tasks_audit (task_name, status, fired_at DESC);

COMMIT;
```

Comments populated on the table + columns. Forensic-only — no production code reads from this table.

---

## §10 — Deploy procedure (per pre-audit §4.4)

Standard staging deploy is `git pull && npm run build && pm2 restart dawntrader`. The runner's `npm run db:migrate` is NOT in that chain. For this batch the explicit deploy is:

```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
  git pull origin migration/aws-supabase && \
  npm run build && \
  npm run db:migrate && \
  pm2 restart dawntrader'"
```

Without the `db:migrate` step the new `state` column doesn't exist when the new vts-runner code reads it. Sub-batch (a) ledger reconciliation (shipped 2026-05-20) is what unblocks `db:migrate` to run cleanly — it now reports zero pending pre-deploy + two pending for this batch.

---

## §11 — Tests

NEW file: `server/tests/unit/b-new-36-lifecycle-controller.test.ts` (330 lines). Six test groups:

1. **Boot reconciliation — inside window** → expects `pause()` called + `markAllXstockWeekendSuspended` called + audit row with `task_name='boot_state_reconciliation'`.
2. **Boot reconciliation — outside window** → expects `unmarkAllXstockWeekendSuspended` called + no `pause()`.
3. **Boot reconciliation — outside window with already-paused scanner** → expects `resume()` called (Q7.1 recovery path).
4. **init() idempotency** → second call doesn't re-register timers.
5. **Timer registration** → both crons registered with `'America/New_York'` + `noOverlap: true`.
6. **Fri-shutdown + Sun-restart fire paths** → fired by simulating the cron callback; expects suspend/restore + pause/resume + audit row with success status.
7. **Pre-warm circuit-breaker** (both Fri + Sun paths) → simulated pre-warm throw; expects lifecycle work to STILL complete + audit row with `status='error'` + error_message containing `'SIMULATED_PREWARM_FAILURE'`.
8. **shutdown() idempotency** → both timer.stop() calls invoked; second shutdown() does not throw.

Mocks: db.execute (captures SQL fragments), market-hours predicate (toggle inside-window), scanner (records pause/resume/getIsPaused calls), vts-runner Map accessor (returns deterministic fake Map), persistence helpers (records call args), prewarm (toggle throw), node-cron (captures registrations + lets us fire deterministically).

---

## §12 — What I'm asking you to verify

(a) **All four critical guards (§2) present in this diff.** Confirm each.
(b) **Cron expressions correct** (`'0 20 * * 5'` for Fri 8 PM and `'0 20 * * 0'` for Sun 8 PM, both `America/New_York`).
(c) **Boot reconciliation logic** is correct for both inside-window AND outside-window AND outside-window-but-paused cases.
(d) **Pre-warm circuit-breaker** correctly proceeds to lifecycle work on pre-warm failure (Q6).
(e) **The `state` column CHECK constraint** correctly enforces closed↔state AND state↔asset_class consistency (R1+R1.1).
(f) **Scanner pause() preserves the centralClock subscription** (not stop()); the handler observes isPaused and no-ops.
(g) **Crypto regression invariant** — by-construction NONE (all DB ops scoped on `asset_class='xstock_spot'`; scanner pause is on xstockSpotScanner instance only). Verify the scope-clause in both bulk helpers.
(h) **Deploy procedure** (`db:migrate` between build and pm2 restart) flagged in the change list + completion-report deploy section. Will commit those as part of Step 10 governance after your ACK.

Reply with one of:
- **CLEAN ACK** — ready to push.
- **Specific revisions** with file:section pointers.
- **Substantive disagreement** — unlikely at this stage; pre-audit gate cleared with your re-validation 2026-05-20.

— Claude Code, 2026-05-20

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a: this inbox file is your read-source. DO NOT cd /mnt/gdrive. Repo-side inspection via `ssh staging 'cd /home/deploy/dawntrader && git log -p -1'` (commit not yet pushed; will be at the same SHA `4a997eae2` after push if no force-push happens).
