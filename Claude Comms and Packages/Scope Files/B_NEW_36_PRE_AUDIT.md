# B-NEW-36 Pre-Audit (Step 2)

**From:** Claude Code
**To:** Langston (Step 2 review gate) + Kyle (decider)
**Date:** 2026-05-20
**Type:** Code-level pre-implementation audit for B-NEW-36 (off-hours session-lifecycle controller + migration-ledger reconciliation + xStock universe-split cleanup).
**Scope under audit:** `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` rev 4 (Langston FINAL ACK at commit `5b9f91b40` — pre-audit gate cleared).
**Audit scope:** every component the three sub-batches touch — upstream feeders, downstream consumers, shared state, background execution, blast-radius rating — per CLAUDE.md §9.1.

---

## §1 — Headline result

Scope is sound at the architectural level, but the code-level read surfaced **three findings the scope does not address**, all small but load-bearing: a CHECK-constraint violation risk in the existing `markOpenTradeClosed` helper, a misframing in the scope's "VTS sim cycle filter" line (the cycle iterates an in-memory Map, not a DB query), and two extra real-code call sites for `XSTOCK_SPOT_24_7_SYMBOLS` that the scope's grep summary didn't catch (`server/routes.ts` and `server/strategies/orb.ts`).

Q9 empirical gate **CLEARED**: NVDA/QQQ/SPY/TSLA all show ZERO bucket activity in the weekend window (Sat 2026-05-16 00:00 UTC → Mon 2026-05-18 00:00 UTC) per snapshot query against `xstock_spot_ohlc_60m_snapshot`. Combined with the 6 already-confirmed names (AAPL, CRCL, GLD, GOOGL, HOOD, MSTR), all 10 designated 24/7 names confirmed empirically zero weekend activity. Sub-batch (c) clean-removal path is empirically safe.

---

## §2 — SIM consultation summary (per CLAUDE.md §9.1)

Read `1-system-manual/SYSTEM_IMPACT_MAP.md` for every component the scope touches. The map confirms scanner runtime + signal-orchestrator + vts-runner + B74 archiver + TEC + DBS-store are the load-bearing surfaces. No SIM-side gap discovered for B-NEW-36 — the components it touches are well-documented from prior batches (B79.0a, B79.0g, B79.0g-tx, B79.0m.b2, B-NEW-34b, B-PHASE-A2, B-NEW-35).

The B-NEW-35 "Recent Additions" block in SIM (line 817+) gives the deploy-ordering invariant model (`pm2 stop` window for ADD CONSTRAINT on actively-written tables) which B-NEW-36 sub-batch (b) also uses for the `vts_open_trades.state` migration. Same pattern; same precedent.

---

## §3 — Cascade analysis per affected component

### 3.1 `server/services/passive-archive/ohlc-batch-writer.ts` (touched indirectly via Fri-shutdown pre-warm)

- **Sub-batch:** (b)
- **Why touched:** the Fri-shutdown hook calls the pre-warm function (in-process per scope Q6 ACK). Pre-warm reads `xstock_spot_ohlc_1m` source partition + writes to `xstock_spot_ohlc_60m_snapshot`. ohlc-batch-writer itself doesn't change; it's just the upstream feeder of the source partition.
- **Upstream:** Kraken WebSocket adapters via `bufferOhlcBar()`.
- **Downstream:** all three `_ohlc_1m` partitioned tables (B-NEW-35 layers in place).
- **Shared state:** in-memory `buffers[assetClass]` Map.
- **Background:** 5s flush interval via `startBatchWriter`.
- **Blast radius:** NONE for B-NEW-36 (no archiver edits).

### 3.2 `server/asset_classes/xstock_spot/scanner.ts` (lines 41-265 surveyed)

- **Sub-batch:** (b) adds pause/resume; (c) simplifies the universe-build block (lines 280-309) + drops `XSTOCK_SPOT_24_7_SYMBOLS` import (line 43).
- **Current state:** subscribes to `centralClock` with module key `'XstockSpotScanner'` at line 243. Handler stored on `this.clockTickHandler`. `stop()` at line 254 unsubscribes AND nulls the handler. `start()` at line 179 is async, throws on bootstrap failure (HARD-FAIL boot per Langston rev1 #4).
- **B-NEW-36 implication:** `pause()` / `resume()` must NOT null the handler (vs `stop()`). Cleanest shape:
  - `pause()`: set `this.isPaused = true`; call `centralClock.unsubscribe('XstockSpotScanner')`. In-flight cycle finishes naturally (graceful drain per scope C1).
  - `resume()`: clear `this.isPaused`; call `centralClock.subscribe('XstockSpotScanner', this.clockTickHandler!)` (reuses retained handler ref).
  - DIAG flag: add `isPaused: boolean` to ScannerDiagnostics; surface on `/api/xstocks/filter-diagnostics`.
- **Universe-build simplification (sub-batch c):** lines 281-309 currently encode three states (weekend close / ARCA open / extended-hours only). Post-(c) becomes two states (weekend close / full universe). Lines that drop: 287-288 (extended-hours comment), 296-297 (extended-hours probe + insideUnifiedWeekendClose), 307-308 (extended-hours fallback branch), 336-341 (extended-only log line). The unified weekend close already reads from `isXstockMarketOpenUTC('AAPL/USD')` — post-(c) it reads from the unified probe directly.
- **Upstream:** centralClock ticks; XSTOCK_SPOT_SYMBOLS registry.
- **Downstream:** xstock eval-cycle → strategy detectors → VTS persistence; xstockDirectionalBiasStore writes per cycle.
- **Shared state:** in-memory `diag` object surfaced via `getDiagnostics()` to `/api/xstocks/filter-diagnostics`.
- **Background:** 30-tick cycle (30s wallclock) on centralClock.
- **Blast radius:** MEDIUM. (b) adds pause/resume = scanner runtime behavior change. (c) increases the off-ARCA universe from 10 to ~260 — see soak criterion R2 in scope §2.5.

### 3.3 `server/asset_classes/xstock_spot/market-hours.ts` (lines 1-147 surveyed)

- **Sub-batch:** (c) — simplify `isXstockMarketOpenUTC(symbol, now)` predicate.
- **Current state:** imports `XSTOCK_SPOT_24_7_SYMBOLS` at line 38; line 131 returns `true` for any 24/7-set symbol outside the weekend window; line 145 keeps a residual `Fri 22:00 UTC onward = closed` rule for ARCA-aligned non-24/7 names. The unified `isInXstockWeekendClose` helper at line 99 is symbol-independent.
- **B-NEW-36 implication:** post-(c) the function returns `!isInXstockWeekendClose(now)` for all symbols. The `symbol` param stays in the signature for backward compat with all call sites (scope §2.5 mandate). The Friday-22-UTC residual restriction (line 145) is REMOVED because the unified weekend close already covers it (Fri 20:00 ET = 00:00 UTC Sat in EDT / 01:00 UTC Sat in EST — both inside the unified window).
- **Upstream:** UTC clock.
- **Downstream:** scanner.ts (universe build); ORB strategy weekend bypass at `orb.ts:163` (see finding §4.3); freshness endpoint at `routes.ts:7894`.
- **Shared state:** none.
- **Background:** none (pure predicate).
- **Blast radius:** LOW. Behavior change: all symbols now treated identically in the off-ARCA-hours band that previously short-circuited only for the 10 names. Empirically (Q9 confirmed) zero weekend activity for ALL xStocks including the 10 — so the predicate change reflects observed reality, not a new behavioral assumption.

### 3.4 `shared/asset-classes.ts` — `XSTOCK_SPOT_24_7_SYMBOLS` export

- **Sub-batch:** (c) — drop `is24_7?` from `XstockSpotEntry` interface; remove `is24_7: true` from the 10 registry entries; decide retention vs removal of `XSTOCK_SPOT_24_7_SYMBOLS` exported Set.
- **Caller grep (full repo, real code only):**
  | File | Lines | What it does | (c) action |
  |---|---|---|---|
  | `server/asset_classes/xstock_spot/scanner.ts` | 43, 308 | import + universe fallback branch | DROP both (per §3.2) |
  | `server/asset_classes/xstock_spot/market-hours.ts` | 38, 131 | import + extended-hours-open branch | DROP both (per §3.3) |
  | `server/routes.ts` | 7852, 7894 | `/api/xstocks/freshness` endpoint emits `is24_7: boolean` per symbol | **NEW finding — see §4.2** |
  | `server/strategies/orb.ts` | 58, 163 | ORB weekend-trading bypass for the 10 names | **NEW finding — see §4.3** |
  | `server/tests/unit/b79-0c-market-hours-per-symbol.test.ts` | 6, 22, 40+ | dedicated 24/7-membership integrity tests | DELETE (scope already lists) |
  | `server/tests/unit/b79-0b-market-hours.test.ts` | 36 | comment reference only | none |
- **Decision:** clean removal beats empty-Set retention. Two non-trivial out-of-batch callers (routes.ts, orb.ts) must be updated in the same sub-batch — both are small (one field drop + one dead-code branch removal). Pre-audit findings §4.2 and §4.3 document the changes. Scope §2.5 should be amended to include routes.ts + orb.ts.
- **Blast radius:** LOW (Set + interface field; surface is well-bounded).

### 3.5 `server/services/vts-runner.ts` (lines 1998-2025 + 2946-2954 surveyed)

- **Sub-batch:** (b) — filter weekend-suspended trades out of the sim cycle.
- **Current state:** `runPhase10SimulationCycle()` at line 2946 calls `resolveOpenVirtualTrades()` at line 2954. `resolveOpenVirtualTrades()` at line 1998 iterates `openVirtualTrades.values()` — **the in-memory Map, NOT a DB query.** The Map is seeded at boot via `rehydrateOpenVtsTrades`.
- **B-NEW-36 implication (CRITICAL):** the scope §2 line "VTS sim cycle filter: `AND state != 'weekend_suspended'` added to the open-trades-fetch query" is misframed. There is no fetch query in this path; the filter must apply to the Map iteration. See finding §4.1 for the corrected approach.
- **Upstream:** open-trade insertions via `insertOpenTrade` + bootstrap via `bootstrapOpenTradesFromMemory`.
- **Downstream:** TEC `evaluateTECExit`, paper-execution close path, `markOpenTradeClosed`.
- **Shared state:** `openVirtualTrades: Map<string, OpenVirtualTrade>`.
- **Background:** runPhase10SimulationCycle invoked on its own schedule (NOT centralClock — separate setInterval lineage from Phase 10 era).
- **Blast radius:** MEDIUM. Filter mis-implementation = weekend-suspended trades still hit TEC = #116 noise persists = side-effect benefit of B-NEW-36 evaporates.

### 3.6 `server/services/vts-trade-persistence.ts` (full file surveyed)

- **Sub-batch:** (b) — add bulk-update helpers + extend close-time helper.
- **Current helpers:** `insertOpenTrade`, `markOpenTradeClosed`, `rehydrateOpenTrades`, `bootstrapOpenTradesFromMemory`, `sweepClosedOpenTrades`. `markOpenTradeClosed` at line 124 sets `closed=true, closed_at=NOW(), updated_at=NOW()` — **does NOT touch `state`.** Once the CHECK constraint per scope §2 lands, this UPDATE produces an illegal `(closed=true, state='open')` or `(closed=true, state='weekend_suspended')` row and the close FAILS.
- **B-NEW-36 implication (CRITICAL):** `markOpenTradeClosed` MUST be extended to `SET state='closed'` as part of the same UPDATE — otherwise sub-batch (b)'s CHECK constraint kills the trade-close path. See finding §4.1 for the corrected approach.
- **New helpers needed (per scope):** `markAllXstockWeekendSuspended()` and `unmarkAllXstockWeekendSuspended()` — bulk UPDATEs by `asset_class='xstock_spot' AND closed=false AND state IN (...)`. Both must also mark the in-memory `OpenVirtualTrade` records (see finding §4.1).
- **rehydrateOpenTrades** at line 141 must surface the new `state` column when seeding the Map.
- **Upstream:** vts-runner.ts trade lifecycle.
- **Downstream:** `vts_open_trades` table.
- **Shared state:** none (DB writes only).
- **Background:** boot-time rehydrate + GC sweep.
- **Blast radius:** HIGH if the `markOpenTradeClosed` fix is missed — every trade close starts failing. Easy to catch but easy to miss.

### 3.7 `server/services/central-clock.ts` (full file surveyed)

- **Sub-batch:** none direct — but the lifecycle controller indirectly uses its public API.
- **Note:** file carries a LOCKED MODULE banner (line 1-6, Directive 8.8.4-A4.R10R-4). Changes require formal directive. B-NEW-36 does NOT modify central-clock.ts; it only uses the existing `subscribe()` + `unsubscribe()` public methods via the scanner's pause/resume.
- **Blast radius:** NONE (no edits).

### 3.8 `scripts/b-new-34b-prewarm-snapshot.ts` (lines 1-180 surveyed)

- **Sub-batch:** (b) — extract `runPrewarm(options)` for in-process invocation.
- **Current state:** script is a stand-alone tsx CLI. Uses `pg.Pool` (NOT Drizzle) to run per-symbol DISTINCT ON aggregations + UPSERTs. `main()` at line 175 parses argv and orchestrates.
- **B-NEW-36 implication:** extract `runPrewarm({ lookbackDays, symbols, dryRun })` as a named export. Preserve CLI wrapper at bottom. Lifecycle controller imports + invokes; pg.Pool is recreated per-call (or accept an injected pool — pre-audit recommends pool-per-call for simplicity since the prewarm runs at most twice per week).
- **Per Langston Q6 ACK:** pre-warm failure must NOT crash the server. Wrap the controller's in-process call in try/catch; `status='error'` + error_message persisted to `scheduled_tasks_audit`; STILL ATTEMPT scanner pause/resume + trade state updates regardless of pre-warm outcome.
- **Upstream:** `xstock_spot_ohlc_1m` source partitions.
- **Downstream:** `xstock_spot_ohlc_60m_snapshot`.
- **Shared state:** none (DB writes).
- **Background:** invoked by lifecycle controller's two scheduled hooks (Fri 20:00 ET + Sun 20:00 ET).
- **Blast radius:** LOW (idempotent ON CONFLICT DO UPDATE).

### 3.9 `server/index.ts` boot path (lines 650-700 surveyed)

- **Sub-batch:** (b) — insert lifecycle controller boot logic.
- **Current order:** TEC bootstrap (line ~645) → `rehydrateOpenVtsTrades` (line 662) → `sweepClosedOpenTrades` (line 679) → `xstockSpotScanner.start()` (line 695) → `server.listen` (line 703).
- **B-NEW-36 insertion point:** AFTER rehydrate (so the in-memory Map exists for bulk update) and AROUND scanner.start (so the controller decides whether to start the scanner active or immediately pause it).
- **Cleanest pattern:** controller exposes `init()` that:
  1. Computes inside-weekend-window?
  2. Bulk-UPDATEs `vts_open_trades.state` for xstock_spot open trades to match window state + mirrors to in-memory records.
  3. Registers the two scheduled timers via node-cron.
  4. Returns a flag `shouldPauseScannerAtBoot: boolean`.
  Then server/index.ts calls `await xstockSpotScanner.start()` as today, and if the flag is true, calls `await xstockSpotScanner.pause()` immediately after. Preserves the existing HARD-FAIL boot semantic on scanner.start.
- **Audit-row insertion** for `boot_state_reconciliation` happens inside `init()`.
- **Blast radius:** MEDIUM. Boot-path change.

### 3.10 New table `scheduled_tasks_audit`

- **Sub-batch:** (b).
- **Shape:** per scope §2 — `id SERIAL PK, task_name VARCHAR(64), scheduled_for TIMESTAMPTZ, fired_at TIMESTAMPTZ, status VARCHAR(32), error_message TEXT, meta JSONB, created_at TIMESTAMPTZ`. Index on `(task_name, status, fired_at DESC)`.
- **Upstream:** lifecycle controller writes.
- **Downstream:** none in code (operator-only / forensic).
- **Background:** ~2 writes/week from B-NEW-36's two timers + boot-state-reconciliation rows on every PM2 restart.
- **Blast radius:** LOW.

### 3.11 `vts_open_trades.state` column

- **Sub-batch:** (b).
- **Migration shape:** ADD COLUMN with `NOT NULL DEFAULT 'open'` + same-migration UPDATE backfill for `closed=true → 'closed'` + CHECK constraint per scope §2 R1+R1.1 (state↔closed AND state↔asset_class).
- **Deploy-ordering invariant:** must run BEFORE `pm2 restart` so new vts-runner code sees the column. Pre-audit confirms standard staging deploy is `git pull && npm run build && pm2 restart dawntrader` — **no `npm run db:migrate` step** in the standard flow. B-NEW-36 deploy procedure MUST explicitly insert `npm run db:migrate` after the build, before pm2 restart. Documented in the per-batch deploy notes.
- **Blast radius:** HIGH for the brief deploy window if order is violated (CHECK constraint kills any trade close mid-window — but the same deploy ships the vts-trade-persistence.ts fix that respects the constraint, so the order is "all-or-nothing").

---

## §4 — Scope-missed findings (NEW; must be addressed in Step 3)

### 4.1 `markOpenTradeClosed` must SET state='closed' (CHECK-constraint compliance)

`server/services/vts-trade-persistence.ts:124-133` currently UPDATEs `closed=true, closed_at=NOW(), updated_at=NOW()`. After sub-batch (b)'s CHECK constraint lands, leaving the row at `state='open'` while `closed=true` violates `(closed=true AND state='closed')`. The trade close transaction fails; the in-memory delete from `openVirtualTrades` Map succeeds; the row stays in DB as zombie until next rehydrate fails the consistency check.

**Required fix in same sub-batch:**

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

Also `insertOpenTrade` relies on `DEFAULT 'open'` for state — that is correct post-migration; no edit needed there.

### 4.2 VTS sim cycle is in-memory iteration, not DB query

Scope §2 says "VTS sim cycle (`runPhase10SimulationCycle`) filter: `AND state != 'weekend_suspended'` added to the open-trades-fetch query." This is misframed. `resolveOpenVirtualTrades` at `server/services/vts-runner.ts:1998-2025` iterates `openVirtualTrades.values()` — an in-memory `Map<string, OpenVirtualTrade>`. There is no SQL query to add the filter to.

**Required design changes:**

1. Add `state?: VtsOpenTradeState` field to the `OpenVirtualTrade` interface in `vts-runner.ts` (default `'open'`).
2. `resolveOpenVirtualTrades` iteration filters: `if (t.state === 'weekend_suspended') continue;` before the per-trade work.
3. `rehydrateOpenTrades` in `vts-trade-persistence.ts` must SELECT and surface the `state` column, populate the field on the rehydrated record.
4. `markAllXstockWeekendSuspended()` helper must update BOTH the DB row AND the in-memory record's `state` field. Sketch:

```typescript
export async function markAllXstockWeekendSuspended(
  inMemoryMap: Map<string, { symbol: string; assetClass: AssetClass; state?: string }>,
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
  // Mirror to in-memory Map so sim cycle's filter sees the new state immediately.
  for (const trade of inMemoryMap.values()) {
    if (trade.assetClass === 'xstock_spot' && trade.state === 'open') {
      trade.state = 'weekend_suspended';
    }
  }
  const rows = (r as any).rows ?? (r as unknown as any[]);
  return { updated: parseInt(String(rows[0]?.count ?? '0'), 10) };
}
```

`unmarkAllXstockWeekendSuspended()` mirrors with `'weekend_suspended' → 'open'`.

### 4.3 Two extra `XSTOCK_SPOT_24_7_SYMBOLS` call sites the scope's grep summary missed

The scope says sub-batch (c) handles `XSTOCK_SPOT_24_7_SYMBOLS` retention based on grep results. Full-repo grep finds two real-code call sites outside the scope's listed ones:

**`server/routes.ts:7852, 7894`** — the `/api/xstocks/freshness` endpoint imports `XSTOCK_SPOT_24_7_SYMBOLS` and emits a `is24_7: boolean` field per symbol in the response. Quick check: client side — `client/src/components/machine-learning/xstocks-tab.tsx` is the consumer per B79.0i.a SIM note. Endpoint response shape change must be coordinated with UI consumer.

**Recommended action:** drop the `is24_7` field from the endpoint response entirely (no longer meaningful empirically), update the UI consumer to stop reading it. If UI still wants a fallback display, hardcode `is24_7: false` server-side and let the UI gradually drop the field. Pre-audit recommends the clean drop.

**`server/strategies/orb.ts:58, 163`** — ORB strategy has a weekend-trading bypass branch keyed on the 10-name set. ORB is disabled per B-NEW-34 ("ORB disabled (intraday-bar strategy, revisit Phase D of calibration plan)") so this branch is dead code today. Safe to drop in the same sub-batch (c) — the bypass made sense when the 10 names were treated as 24/7-trading; now that the empirical truth is "no xStock trades weekends," the bypass is wrong even if ORB were re-enabled.

**Scope §2.5 should be amended** to include these two files in the sub-batch (c) code-changes table.

### 4.4 Deploy procedure must explicitly run `db:migrate` before `pm2 restart`

Standard staging deploy is `git pull && npm run build && pm2 restart dawntrader`. The `db:migrate` step is NOT in that command chain. B-NEW-36 sub-batch (a) — `_migrations` ledger reconciliation — is the prerequisite that unblocks running `db:migrate` cleanly. Once (a) is reconciled, the (b) and (c) deploys must run:

```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
  git pull origin migration/aws-supabase && \
  npm run build && \
  npm run db:migrate && \
  pm2 restart dawntrader'"
```

Without the `db:migrate` step, the new `state` column doesn't exist when new vts-runner code starts reading it. Documented in the per-batch deploy notes; should also surface in the completion report's deploy section.

---

## §5 — Empirical findings recorded this session

### 5.1 Q9 cleared — all 10 designated-24/7 names confirmed zero weekend activity

Query against `xstock_spot_ohlc_60m_snapshot` for weekend window 2026-05-16 00:00 UTC → 2026-05-18 00:00 UTC (= Fri 8PM ET Sat → Sun 8PM ET):

| Symbol | Total buckets | Weekend-window buckets |
|---|---|---|
| NVDA/USD | 68 | 0 |
| QQQ/USD | 68 | 0 |
| SPY/USD | 68 | 0 |
| TSLA/USD | 68 | 0 |

Combined with the 6 already-confirmed (AAPL, CRCL, GLD, GOOGL, HOOD, MSTR): **all 10 designated-24/7 names empirically zero weekend activity.** Sub-batch (c) clean-removal gate **CLEARED**.

### 5.2 `node-cron` already in package.json

`package.json` ships `"node-cron": "^4.2.1"`. No new dependency required. Scope §2 in-process cron pattern is implementation-ready.

### 5.3 Five-symbol gap (BITF/HOLX/PARA/SAGE/WBA) — to be traced in sub-batch (c)

Carried over from B-NEW-35 closure. None of the five are in the registry's 24/7 set; scanner active universe unaffected. Sub-batch (c) decides: retire from registry vs symbol-form-fix vs log per CLAUDE.md §5 #14 in `KNOWN_NONEXISTENT_NAMES`. Per-symbol Kraken-side probe required at Step 3 time.

---

## §6 — Sub-batch sequencing confirmation

Per Langston R3 ACK: (a) → (c) → (b). Single Step 11 completion report covers all three.

- **(a) Step 4 review:** standalone — DB bookkeeping + per-file verification queries, no app-code surface. Small diff. Fast.
- **(b)+(c) Step 4 review:** Pass 2 together — scanner runtime + scheduling infra + market-hours predicate + state column + tests. Larger diff; embed-diff-inline per CLAUDE.md §6.5.0.a.

Estimated end-to-end: ~2-3 days.

**Friday 2026-05-22 8PM ET ship target** is the next natural verification gate (the first scheduled fire of the Fri-shutdown hook). Per Langston Q8: if not met, current state persists for one more weekend. No code-level blocker against the deadline today; sub-batch (a) reconciliation is the unknown-runtime variable.

---

## §7 — Crypto-regression invariant (B-PHASE-A2-style no-touch fence)

By-construction NONE:
- All state column work scoped on `asset_class = 'xstock_spot'`.
- CHECK constraint enforces `state <> 'weekend_suspended' OR asset_class = 'xstock_spot'` — physical guarantee no crypto trade lands in weekend_suspended.
- Scanner pause/resume scoped to `xstockSpotScanner` only.
- Pre-warm hits xstock_spot snapshot only.
- Universe-split cleanup touches only xstock_spot universe code paths.

Verified at code-level via grep.

---

## §8 — Acceptance criteria for Step 4 transition

Pre-audit declared READY-FOR-STEP-3 when Langston confirms:

(a) Findings §4.1, §4.2, §4.3 accepted and folded into the implementation plan.
(b) Deploy procedure §4.4 acknowledged.
(c) Q9 empirical clearance accepted (sub-batch (c) clean removal proceeds).
(d) Sequencing per §6 confirmed.

— Claude Code, 2026-05-20

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a: this pre-audit document is the inbox file for Langston. Embed-diff-inline already applied for findings §4.1 + §4.2. For repo-side inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`. DO NOT `cd /mnt/gdrive`.
