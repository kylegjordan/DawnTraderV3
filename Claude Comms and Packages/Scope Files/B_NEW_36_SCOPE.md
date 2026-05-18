# B-NEW-36 — Off-hours session-lifecycle controller + migration-ledger reconciliation + xStock universe-split cleanup (rev 2)

> **From:** Claude Code
> **To:** Langston (Step 1 design review) + Kyle (decider)
> **Date:** 2026-05-19 early UTC (revising scope draft from 2026-05-18 night)
> **Type:** Combined three-sub-batch ship — ledger reconciliation (prerequisite) + lifecycle controller (the real work) + universe-split cleanup (empirical finding tonight)
> **Kyle directive 2026-05-18 night:** "Can this be added as a part of the off-hours session-lifecycle controller batch? If it can be added, please proceed with that combined batch." → answered YES. Then Kyle directive 2026-05-19 early UTC: "if you're able to find evidence the 10 designated 24/7 names actually trade weekends, keep the split; otherwise collapse to one pool." → empirical check returned ZERO weekend activity for the 6-of-10 names already in snapshot → collapsing to one pool, dropping the designation (gated on NVDA/QQQ/SPY/TSLA confirmation when pre-warm reaches them; see Q9).
> **Status on Hetzner staging:** B-NEW-34b code committed/pushed (commits `d9031fe8d`, `4fd780c3d`, `686d13ae4`); snapshot table created + B-NEW-34b ledger row inserted manually; pre-warm script in-flight (~163/265 symbols at last check); scanner not yet restarted pending pre-warm coverage.

---

## §0 — Why these three go together

Sub-batch (a) — migration-ledger reconciliation — is a prerequisite for sub-batch (b). The off-hours session-lifecycle controller will need to add at least one new database migration of its own (the `weekend_suspended` state marker on `vts_open_trades`, plus likely a `scheduled_tasks_audit` table). The `db:migrate` runner is currently blocked on 16 unrecorded-but-already-applied migrations dating back to 2026-05-08 (RUNNING_ISSUES #119 — discovered 2026-05-18 night during B-NEW-34b deploy). Without reconciliation, B-NEW-36's own migration can't deploy through the runner either.

Sub-batch (c) — xStock universe-split cleanup — surfaces the same empirical investigation that informs sub-batch (b)'s scheduling shape. If the 10-name designation is wrong (per §0.5 below), the lifecycle controller doesn't need a Monday cutover AND the scanner's universe-split logic that relies on the same 10-name set is silently shrinking the universe by ~96% during overnight weekday hours. Both fixes share the same `XSTOCK_SPOT_24_7_SYMBOLS` symbol + `market-hours.ts` predicate touch surface and should ship together.

Combining all three saves:
- One full Step 1-11 workflow pass per sub-batch (scope, pre-audit, code review, change list, deploy, verify, governance, completion report) — net saves ~2× governance overhead.
- One Langston review touchpoint for related work.
- One coherent commit narrative.

The three sub-batches are clearly separated in this scope so Langston can review them independently. Sub-batch (a) is mechanical (verify + INSERT bookkeeping rows); sub-batch (b) is architectural (state machine + scheduled tasks); sub-batch (c) is data + dead-code removal.

---

## §0.5 — Empirical findings tonight (2026-05-18 night → 2026-05-19 early)

Three queries against `xstock_spot_ohlc_60m_snapshot` (pre-warm-populated, PK-indexed, cheap) tonight produced unambiguous evidence on xStock trading hours per Kraken's WS feed.

**Finding 1 — All xStocks trade 24/5 (not just the 10 designated set).** Hourly distribution check across 14 symbols including presumed-ARCA-only names (AMZN, JPM, BAC, KO, JNJ, BABA, DIS, COST, CRM, GME, COIN — none in `XSTOCK_SPOT_24_7_SYMBOLS`) showed every symbol with bars distributed across ALL 24 ET-hour bands. Same distribution shape as the 10 "designated 24/7" names. There is no behavioral distinction in Kraken's feed between the 10 and the other ~255 during weekday hours.

**Finding 2 — All xStocks reopen simultaneously at Sun 8PM ET.** Sun-evening-to-Mon-ARCA-open window query (Sun 8PM ET → Mon 9:30AM ET) returned 60+ symbols including AMZN, JPM, BAC, GME, COIN, META, MSFT, NFLX, NIO, MCD, KO, JNJ, IBM, CSCO, AMD, ADBE — all with 12-13 buckets in a 13-hour window (full or near-full coverage). The "Monday 9:30AM ET ARCA open" concept does not apply to xStocks; they're all already trading by then.

**Finding 3 — All xStocks close uniformly Fri 8PM ET → Sun 8PM ET.** Weekend-window query (Sat 00:00 UTC → Mon 02:00 UTC) returned ONLY 2 result rows: Sun 8PM ET (124 symbols) and Sun 9PM ET (115 symbols). Saturday all-day + Sunday before 8PM ET: ZERO bucket activity for ANY symbol. The unified weekend close is real and applies uniformly to every name.

**Finding 4 — The 10 designated 24/7 names DO NOT have weekend activity.** Direct empirical check on the 6-of-10 names already in the snapshot (AAPL, CRCL, GLD, GOOGL, HOOD, MSTR) during the past weekend close window: each shows EXACTLY 1 bucket — at Sunday 8PM ET (the reopen moment) — and zero bars elsewhere in the Fri-8PM-ET-to-Sun-7:59PM-ET window. Whatever the marketing forums say about those 10 names trading 24/7, **Kraken's WS feed does not carry weekend price activity for them.** Kyle's prior intuition (formed when scanning Kraken in earlier xStock onboarding work) was correct.

**Conclusion that drives sub-batch (b) + (c) scope:** the 10-name designation is a stale artifact, almost certainly a Phase-1 launch-time classification that never got re-verified after Kraken expanded extended-hours coverage to the full xStock universe. Empirically, every xStock has identical hours: 24/5, Sun 8PM ET → Fri 8PM ET, with a ~48-hour weekend pause Fri 8PM ET → Sun 8PM ET.

**Open thread (Q9 below):** verify NVDA, QQQ, SPY, TSLA share the same zero-weekend-activity pattern once pre-warm reaches them. Extremely high prior given the broader 124-symbol pattern, but worth confirming before code change.

---

## §1 — Sub-batch (a): Migration-ledger reconciliation

### Objective

Restore parity between `_migrations` (the runner's bookkeeping table) and the actual database schema state. 16 migration files dating 2026-05-08 → 2026-05-17 have been applied to the staging DB schema (verified by table/column/row existence) but were never written into the `_migrations` ledger — they were applied via direct psql or a non-runner deploy path. Every file is the artifact of a tracked governance batch (scope + Langston review + completion report); the only thing missing is the ledger bookkeeping row.

### The 16 files

| File | Batch | Type | Date |
|---|---|---|---|
| `2026-05-08-b79-tec-per-class-be-rows.sql` | B79.TEC | INSERT + assertion | 2026-05-08 |
| `2026-05-10-b79-0e-rename-equity-to-xstock.sql` | B79.0e | DDL rename (172 objects) | 2026-05-10 |
| `2026-05-10-b79-0g-vts-open-trades.sql` | B79.0g | DDL (new table) | 2026-05-10 |
| `2026-05-10-b79-0g-tx-vts-open-trades-soft-delete.sql` | B79.0g-tx | DDL (add columns + index) | 2026-05-10 |
| `2026-05-10-b79-0g-tx-data-lifecycle-seed.sql` | B79.0g-tx | INSERT (seed) | 2026-05-10 |
| `2026-05-11-b79-0m-a-screener-filters-asset-class-index.sql` | B79.0m.a | DDL (index) | 2026-05-11 |
| `2026-05-11-b79-0m-a-xstock-family-imf-seeds.sql` | B79.0m.a | INSERT (seeds) | 2026-05-11 |
| `2026-05-11-b79-0m-a-xstock-regime-classifier-seeds.sql` | B79.0m.a | INSERT (seeds) | 2026-05-11 |
| `2026-05-11-b79-0m-a-xstock-strategy-gates-seeds.sql` | B79.0m.a | INSERT (seeds) | 2026-05-11 |
| `2026-05-11-b79-0m-b-xstock-active-quant-row.sql` | B79.0m.b | INSERT (seed) | 2026-05-11 |
| `2026-05-11-b79-0m-b-xstock-tec-enable.sql` | B79.0m.b | UPDATE (flip xstock_spot TEC BE to true) | 2026-05-11 |
| `2026-05-11-b79-0m-b2-xstock-pattern-rows.sql` | B79.0m.b2 | INSERT (seeds) | 2026-05-11 |
| `2026-05-12-b-new-1-xstock-global-tighten.sql` | B-NEW-1 | UPDATE (filter values) | 2026-05-12 |
| `2026-05-17-b-new-42b-price-discontinuity-detector-constants.sql` | B-NEW-42b | INSERT (constants) | 2026-05-17 |
| `2026-05-17-b-phase-a2-dbs-backfill-table.sql` | B-PHASE-A2 | DDL (new table) | 2026-05-17 |
| `2026-05-17-b-phase-a2-dbs-xstock-constants.sql` | B-PHASE-A2 | INSERT (8 DBS knobs) | 2026-05-17 |

All 16 are intentional governance batches with paper trail.

### Reconciliation procedure (per-file, run in chronological order)

For each file:

1. **Inspect SQL file content** to identify what it does (DDL CREATE/ALTER, INSERT seeds, UPDATE row, etc.) and what the verifiable post-state should be.
2. **Verify post-state in DB:**
   - DDL CREATE → `\d <table>` confirms table+columns+constraints+indexes exist.
   - DDL ALTER → column exists with expected type; index present.
   - INSERT seed → `SELECT COUNT(*) WHERE <key>` returns the expected rows.
   - UPDATE → `SELECT value FROM <table> WHERE <key>` returns the new value.
3. **If verified applied:** `INSERT INTO _migrations (name, applied_at) VALUES ('<filename>', NOW()) ON CONFLICT (name) DO NOTHING`. Logged in per-file verification doc.
4. **If NOT verified applied (file is genuinely pending):** flag for separate handling — DO NOT proceed past this file until decided with Langston. Genuinely-pending migrations require either running the file or documenting why it's intentionally skipped.
5. **Special case — `2026-05-08-b79-tec-per-class-be-rows.sql`:** the post-INSERT assertion in this file fails because `xstock_spot.break_even_enabled` is now `true` (flipped by the later `b79-0m-b-xstock-tec-enable.sql`). The assertion explicitly acknowledges this scenario ("A pre-existing intentional override may exist; manual review required"). Verification: confirm 4 rows exist in `module_constants` for `trailing_exit.<asset_class>.break_even_enabled` (we expect crypto_perp=false, crypto_spot=false, xstock_perp=false, xstock_spot=true — the last is intentional per B79.0m.b). If confirmed, INSERT the ledger row. The intentional override IS the documented post-state per B79.0m.b's completion report.

### Deliverables (Sub-batch a)

- `Claude Comms and Packages/Change Lists/B_NEW_36_a_LEDGER_RECONCILIATION.md` — per-file verification log with the actual SQL query output that confirmed each file's effects are present + the INSERT row written.
- Updated `_migrations` ledger with 16 new rows.
- After completion: `npm run db:migrate` runs cleanly (no pending items).
- RUNNING_ISSUES #119 marked RESOLVED.

### Acceptance criteria

- `SELECT COUNT(*) FROM _migrations WHERE name >= '2026-05-08'` returns 19 (the 16 reconciled + the 2 already-recorded May-8 b79-0a files + B-NEW-34b).
- `npm run db:migrate` on a clean staging exits 0 with "0 pending" message.
- Every one of the 16 verification queries documented in the change list with PASS confirmation.

---

## §2 — Sub-batch (b): Off-hours session-lifecycle controller (SIMPLIFIED per §0.5)

### Objective

End the current "scanner runs cycles with universe=0 during weekend close" + "TEC fail-closed noise from stale config in sporadic-consumer classes" + "open xStock VTS trades evaluated against stale data during weekend close" failure modes by adding **explicit weekend-shutdown + weekend-restart hooks** scheduled around the xStock unified Fri-8PM-ET → Sun-8PM-ET trading window.

### Operational requirements (simplified — two hooks only, no Monday cutover)

Per §0.5 empirical findings: all xStocks share identical hours. Two scheduled hooks suffice — no symbol-by-symbol partial-suspend, no Monday 9:30 AM ET un-suspend wave.

**Fri 8PM ET (= Sat 01:00 UTC) — Weekend shutdown hook:**
1. Run pre-warm script: `b-new-34b:prewarm --days 14` to refresh `xstock_spot_ohlc_60m_snapshot` with closing-week data (so Sun-restart cold reads are fresh).
2. Mark ALL open xStock VTS trades `state = 'weekend_suspended'` in `vts_open_trades` (single bulk UPDATE filtered by `asset_class = 'xstock_spot'`).
3. Unsubscribe `xstockSpotScanner` from `centralClock` so cycles genuinely stop (vs the current "universe=0 cycle still fires every 30s" pattern).
4. Emit `[B-NEW-36][WEEKEND_SHUTDOWN]` log with snapshot row count, suspended trade count, next-reopen ETA.

**Sun 8PM ET (= Mon 01:00 UTC) — Weekend restart hook:**
1. Run pre-warm script again (refresh-on-restart per Langston Q3 ACK on B-NEW-34b — 24h overlay window stays comfortable).
2. Re-subscribe `xstockSpotScanner` to `centralClock`.
3. Un-suspend ALL xStock VTS trades — single bulk UPDATE: `WHERE asset_class = 'xstock_spot' AND state = 'weekend_suspended' SET state = 'open'`.
4. Emit `[B-NEW-36][WEEKEND_RESTART]` log.

**No Monday 13:30 UTC ARCA-reopen hook needed** — empirically all xStocks are already trading by Sunday 8PM ET. (Cross-referenced from §0.5 Finding 2.)

### State machine for vts_open_trades

Current schema: `vts_open_trades.closed BOOLEAN` (post-B79.0g-tx soft-delete) — binary open/closed.

Proposed addition: `vts_open_trades.state VARCHAR(32)` (NULLABLE, default 'open' via app-side semantic), values:
- `'open'` (default — actively evaluated)
- `'weekend_suspended'` (scanner stopped + TEC + sim cycle skip)
- (future expansion possible without schema change)

Why a separate column rather than reusing `closed`: closed is a binary lifecycle marker (open vs gone-forever); weekend_suspended is a temporary pause within the open lifecycle. Trades will cycle open → weekend_suspended → open every week without changing closed status.

VTS sim cycle (`runPhase10SimulationCycle`) filter: `WHERE state != 'weekend_suspended'` added to the open-trades query. Eliminates RUNNING_ISSUES #116 TEC stale fail-closed for xStock as a side-effect — sim cycle no longer hits xstock trades during weekend → no TEC config resolve call → no stale fail-closed log noise.

### Scheduled task infrastructure

**Option A (RECOMMENDED — minimum-viable):** node-cron in-process scheduled tasks, registered at server boot, fired in `centralClock`'s timer space (no new process, no new infra). Two timers: Sat 01:00 UTC and Mon 01:00 UTC. Each timer wraps the corresponding hook function in `try/catch` with structured logging and a `scheduled_tasks_audit` row INSERT (NEW table, narrow schema: id, task_name, scheduled_for, fired_at, status, error_message).

**Option B (REJECTED for scope):** external systemd timer + script. Adds operational surface area (systemd unit ownership, cron-vs-app failure mode disambiguation). Reserved for if/when scheduled-task volume grows beyond 5-10 distinct tasks.

**Why in-process is the right call:**
- Tasks need access to in-memory `xstockSpotScanner` instance + Map state.
- Tasks need to atomically pause/resume scanner + update DB state without cross-process coordination.
- Server is already PM2-restart-resilient (PM2 auto-restarts on crash); cron-as-app-process gets the same resilience for free.

### New table: `scheduled_tasks_audit`

```sql
CREATE TABLE IF NOT EXISTS scheduled_tasks_audit (
  id              SERIAL PRIMARY KEY,
  task_name       VARCHAR(64)  NOT NULL,
  scheduled_for   TIMESTAMPTZ  NOT NULL,
  fired_at        TIMESTAMPTZ,
  status          VARCHAR(32)  NOT NULL,  -- 'pending' | 'success' | 'error'
  error_message   TEXT,
  meta            JSONB,                  -- snapshot row count, suspended trade count, etc.
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_audit_name_status
  ON scheduled_tasks_audit (task_name, status, fired_at DESC);
```

Forensic-only — surfaces task execution history for operations. Bounded growth (2 timers × ~52 weeks/year = ~104 rows/year for this batch; safe to leave unbounded for years).

### Code changes (Sub-batch b)

| File | Change |
|---|---|
| `drizzle/migrations/2026-05-XX-b-new-36-vts-open-trades-state.sql` (NEW) | ADD COLUMN `state VARCHAR(32) NOT NULL DEFAULT 'open'`. UPDATE existing rows to 'open' (no-op via DEFAULT). |
| `drizzle/migrations/2026-05-XX-b-new-36-scheduled-tasks-audit.sql` (NEW) | CREATE TABLE per above + index. |
| `server/services/session-lifecycle-controller.ts` (NEW) | Two timer-fire handlers (weekendShutdown, weekendRestart); registration logic; audit-row helpers; in-process pre-warm function call (per Q6 ACK). |
| `server/index.ts` | At boot: import + register the lifecycle controller's timers. Wrapped in same try/catch as other startup services. |
| `server/asset_classes/xstock_spot/scanner.ts` | Add `pause()` + `resume()` methods that subscribe/unsubscribe centralClock and update `diag.isRunning`. (`stop()` is the existing teardown; the new methods are reversible-without-process-restart.) |
| `server/services/vts-trade-persistence.ts` | New helpers `markAllXstockWeekendSuspended()` + `unmarkAllXstockWeekendSuspended()`. Both are bulk UPDATEs by asset_class + state filter (simplified from rev1's per-symbol-list shape). |
| `server/services/vts-runner.ts` (`runPhase10SimulationCycle`) | Add `AND state != 'weekend_suspended'` to the open-trades-fetch WHERE clause. |
| `scripts/b-new-34b-prewarm-snapshot.ts` | Refactor: extract `runPrewarm(options)` function for in-process invocation; CLI wrapper preserved at the bottom of the same file. |
| `server/tests/unit/b-new-36-lifecycle-controller.test.ts` (NEW) | State-machine tests + scheduled-task timer tests + sim-cycle skip-filter test. |

### Acceptance criteria

- `npm run db:migrate` applies both new migrations cleanly (sub-batch (a) completed first).
- Two scheduled timers register at boot + emit boot log lines confirming registration.
- `scheduled_tasks_audit` table receives one row per scheduled task fire (next Fri at the latest, but tests verify the firing logic).
- VTS sim cycle skips `state='weekend_suspended'` trades — verified by unit test + by staging observation post-Fri-shutdown.
- Scanner explicitly stops during weekend window (no more `lastUniverseSize=0` cycles every 30s).
- TEC stale fail-closed noise for xstock_spot ceases during weekend window (verified by absence of `TEC_STALE_FAIL_CLOSED` log lines for asset_class=xstock_spot in the Fri-8PM → Sun-8PM window).
- Manual pre-warm protocol in MEMORY.md updated to point at the automated controller (and the manual flag retained as a fallback for unplanned restarts).

---

## §2.5 — Sub-batch (c): xStock universe-split cleanup (NEW per §0.5)

### Objective

Retire the empirically-unsupported `XSTOCK_SPOT_24_7_SYMBOLS` 10-name designation. Collapse the scheduling model to a single pool of xStocks that all share identical hours (24/5, Sun 8PM ET → Fri 8PM ET, weekend close Fri 8PM ET → Sun 8PM ET).

### Code changes (Sub-batch c)

| File | Change |
|---|---|
| `shared/asset-classes.ts` | Drop the `is24_7?: boolean` field from `XstockSpotEntry` interface. Remove `is24_7: true` from all 10 registry entries (AAPL, CRCL, GLD, GOOGL, HOOD, MSTR, NVDA, QQQ, SPY, TSLA). Drop the `XSTOCK_SPOT_24_7_SYMBOLS` exported `Set` — but RETAIN as an empty deprecated-aliased const for one batch cycle to avoid breaking any consumer outside this scope (Langston Q1 from B-NEW-34b: ANY-array-binding-style deprecation pattern). Schedule removal in next-batch cleanup. |
| `server/asset_classes/xstock_spot/market-hours.ts` | Simplify `isXstockMarketOpenUTC(symbol, now)` to: (a) inside Fri-8PM-ET-to-Sun-8PM-ET unified weekend close → return false; (b) else return true. Drop the ARCA-aligned-vs-extended-hours branch. Drop the `XSTOCK_SPOT_24_7_SYMBOLS` import. Keep the symbol param signature for backward compat with all call sites; symbol is no longer consulted but the function-shape stays stable. |
| `server/asset_classes/xstock_spot/scanner.ts` (lines 281-309 of the universe-build block) | Simplify the three-case logic: inside weekend close → empty universe; else → full universe. Drop the ARCA-closed-but-extended-hours-open special case (the "scan only 10 names overnight" code path). Drop the `XSTOCK_SPOT_24_7_SYMBOLS` import. |
| `server/tests/unit/b79-0b-market-hours.test.ts` | Replace ARCA-only branch tests (which would now fail because all symbols are treated identically) with the single weekend-window predicate. Existing weekend-window tests pass through unchanged. |
| `server/tests/unit/b79-0L-market-hours-extended-hours.test.ts` | Delete the 14 cases that specifically test the extended-hours-vs-ARCA distinction. Replace with a smaller set of cases that verify all symbols behave identically (a representative ARCA-only-formerly + extended-hours-formerly pair giving the same return value at every test time). |

### Acceptance criteria (Sub-batch c)

- `isXstockMarketOpenUTC('AAPL/USD', t)` and `isXstockMarketOpenUTC('AMZN/USD', t)` return identical values for every test time `t` (no symbol distinction).
- Scanner `lastUniverseSize` during Mon-Thu overnight hours (e.g., Wed 23:00 UTC) returns the full ~265 not the previous 10. Verified by Claude-in-Chrome navigation to xStocks tab + Scanner Cycle metrics post-deploy.
- `XSTOCK_SPOT_24_7_SYMBOLS` retains its export shape (empty Set) for one batch cycle; full removal queued.
- Bar coverage for all xStocks Mon-Thu off-ARCA hours becomes consumable by scanner (was silently filtered out pre-fix).

### Blast radius

- LOW for the data side (registry flag drop + market-hours simplification — affects only xstock-spot code paths).
- MEDIUM for the scanner side — fixes the silent universe-shrinkage. Once shipped, the off-ARCA-hours scanner will start evaluating ~265 symbols where it previously evaluated 10. This is a real workload increase: 26× more pairs per cycle during overnight hours, ~5× more pairs per cycle during pre-market/after-hours bands. Must verify the cycle budget holds (the snapshot-first cache + 24h overlay should comfortably absorb this; B-NEW-34b's per-cycle DB cost is ~80% lower than the abandoned 120h live path so headroom exists).

### Gating: Sub-batch (c) ships ONLY if §5 Q9 confirms empirical zero-weekend-activity for the 4 remaining names (NVDA, QQQ, SPY, TSLA)

The 6-of-10 already-verified names (AAPL, CRCL, GLD, GOOGL, HOOD, MSTR) all showed zero weekend activity. If pre-warm reaches NVDA/QQQ/SPY/TSLA and any of them show weekend activity, the cleanup decision changes — those names would retain the `is24_7` flag and the universe-split logic would shrink to those 4 (or however many) only. Pre-audit (Step 2) gates Sub-batch (c) on this empirical confirmation; if it fails, Sub-batch (c) descopes to documentation-only and the 10-name → 4-name (or N-name) trim happens in a dedicated follow-up.

---

## §3 — SIM impact (consulted per CLAUDE.md §9.1)

New entries:
- `xstock_spot_ohlc_60m_snapshot` — already in SIM from B-NEW-34b; B-NEW-36 adds the lifecycle controller as a write path (Fri-shutdown pre-warm fire + Sun-restart pre-warm fire).
- `vts_open_trades.state` — new column; impacts vts-runner sim cycle (downstream consumer), vts-trade-persistence (writer), open-trades UI panel (display consumer — verify renders correctly when state='weekend_suspended').
- `scheduled_tasks_audit` — new forensic table; no downstream consumers in code (operator-only); blast radius LOW.
- `session-lifecycle-controller.ts` — new module; upstream from xstockSpotScanner + vts-trade-persistence + pre-warm-function-call; blast radius MEDIUM (touches scanner runtime behavior + open-trade state during a real-time window).
- `market-hours.ts` simplification — drops ARCA-aligned branch; blast radius LOW (xstock-only).
- `scanner.ts:281-309` simplification — drops universe-split branch; blast radius MEDIUM (fixes silent universe shrinkage; downstream impact is "more symbols evaluated per cycle during off-ARCA hours" which the snapshot architecture absorbs).
- `XSTOCK_SPOT_24_7_SYMBOLS` set retired (deprecated empty Set retained one cycle); blast radius LOW.

Cross-cutting concerns to verify in Step 2 pre-audit:
- Crypto regression — NONE by-construction (asset_class scoping on every state change; only xstock symbols affected).
- TEC interaction — `weekend_suspended` trades fall out of sim-cycle resolveOpenVirtualTrades loop → no TEC config-resolve calls → no stale fail-closed for xstock_spot during weekend. Confirmed side-effect, not a code change to TEC.
- B79.0n active-trading wire-in dependency — paper/live xstock trades (when wire-in lands) will also need `state` filtering; pre-audit confirms paper-execution-engine code path doesn't bypass the state check.
- Scanner cycle budget — Sub-batch (c) increases the universe during off-ARCA hours by ~26×; pre-audit confirms B-NEW-34b's per-cycle DB cost reduction (~75-85% lower) gives sufficient headroom.

---

## §4 — Sequencing

1. Sub-batch (a) — Ledger reconciliation FIRST. Verify each of the 16 files + INSERT bookkeeping rows. After: `db:migrate` should run cleanly.
2. Sub-batch (b) — Lifecycle controller. New migrations + new code + tests + staging deploy + Fri-8PM-ET observation gate.
3. Sub-batch (c) — Universe-split cleanup. Code change + tests + staging deploy + post-restart scanner verification. Gated on Q9 empirical confirmation.

Estimate: Sub-batch (a) ~1-2 hours. Sub-batch (b) ~1-2 days including Fri-evening live observation. Sub-batch (c) ~half-day (code is small, tests are mostly delete-cases). Combined ~2-3 days end-to-end.

**Friday 2026-05-22 8PM ET ship target** — if not met, current behavior (scanner idles with universe=0 during weekend, TEC log noise) persists for one more weekend. Acceptable but undesirable.

---

## §5 — Specific questions for Langston

**Q1: Sub-batch sequencing.** Confirm Sub-batch (a) ships fully (all 16 files reconciled + RUNNING_ISSUES #119 RESOLVED) before any Sub-batch (b) or (c) code lands. Any reason to interleave?

**Q2: Per-file verification SQL.** I'll write out the exact verification query for each of the 16 files in the change list. Want me to mock those into the scope file too, or accept that they materialize during Step 3 implementation?

**Q3: scheduled_tasks_audit table — name + scope.** Is `scheduled_tasks_audit` the right name (vs `scheduled_task_history`, `lifecycle_events`, etc.)? Should the schema be generic-purpose for any future scheduled tasks (current design) or scoped to lifecycle events only? My pick: generic-purpose because future batches will surely add more scheduled tasks (B-NEW-35 source-side dedup may want a nightly sweep, etc.) and the audit shape is identical.

**Q4: `state` column on vts_open_trades vs new column or new table.** Current `vts_open_trades` schema has `closed BOOLEAN + closed_at TIMESTAMPTZ` (post-B79.0g-tx soft-delete). Adding `state VARCHAR(32)` introduces a 2-dimensional lifecycle (closed × state) — is that the right shape, or should we collapse to `lifecycle_state` ENUM('open', 'weekend_suspended', 'closed') replacing the boolean? My pick: keep the separate `state` column for backward compatibility with all existing `closed=true|false` queries; a future cleanup batch can collapse if the dimension becomes confusing.

**Q5: In-process node-cron vs systemd timer.** Section §2 picks node-cron in-process. Concur, or prefer systemd? My pick: node-cron stays per the in-memory access requirement.

**Q6: Pre-warm script subprocess vs in-process function call.** When the Fri-shutdown hook runs the pre-warm "script," should it spawn a subprocess (`npx tsx scripts/b-new-34b-prewarm-snapshot.ts`) or extract the pre-warm logic into a callable function and invoke in-process? My pick (and reflected in Sub-batch (b) code-changes table): in-process function call — the script and the lifecycle controller live in the same codebase + share types; subprocess spawn adds error-handling surface for no benefit. Refactor `scripts/b-new-34b-prewarm-snapshot.ts` to expose `runPrewarm(options)` and have both the CLI and the lifecycle controller call it.

**Q7: Manual pre-warm protocol post-controller.** The MEMORY.md manual pre-warm protocol (from B-NEW-34b ship) currently says "anyone restarting scanner must run pre-warm first." Once controller ships, scanner restart triggers a fresh pre-warm via the Sun-restart hook IF the restart happens after Sun 8PM ET. What about restarts mid-week? My pick: keep the manual flag in MEMORY.md as a fallback for unplanned restarts, but note that planned restarts within an active-scanning session don't need it because the cache's write-back-on-miss keeps the snapshot fresh during active scanning. Document the precise rule clearly.

**Q8: Sub-batch (b) deferred to NEXT WEEKEND if Fri-8PM-ET is missed.** What if we can't ship Sub-batch (b) before Fri 2026-05-22 8PM ET? Fallback: scanner stays in its current "universe=0 every 30s during weekend close" pattern for one more weekend; manual pre-warm Sun evening; ship Sub-batch (b) the following week. No data loss, no broken behavior; just one more week of the current noise. Acceptable, or should I prioritize Sub-batch (b) hard against the Friday deadline?

**Q9 (NEW per §0.5): Empirical 24/7 gating + cleanup decision.** Pre-warm is currently in flight. Of the 10 designated 24/7 names, 6 (AAPL, CRCL, GLD, GOOGL, HOOD, MSTR) have been verified empirically zero weekend activity during the past Fri-8PM-ET-to-Sun-8PM-ET window. 4 (NVDA, QQQ, SPY, TSLA) are still alphabetically ahead in pre-warm and will be verified within the next ~30 minutes. Two questions:
  - (a) If all 10 confirm zero weekend activity (extremely high prior), Sub-batch (c) ships as written (collapse to one pool, retire designation).
  - (b) If any of the 4 unverified names DO show weekend activity (low prior, but possible), Sub-batch (c) descopes: retain `is24_7` only for the empirically-confirmed weekend-active names; document the empirical truth in System Manual.
  - (c) Confirm the gating mechanic is correct: pre-audit (Step 2) gates Sub-batch (c) on the empirical answer; if (b) fires, Sub-batch (c) doesn't block Sub-batch (a)+(b) — only Sub-batch (c) descopes.

---

## §6 — Ask

Step 1 ACK from Langston with revisions on §1-§5. Once locked, I'll write the Step 2 pre-audit (SIM consultation + per-file ledger verification SQL prep + scanner code-path trace for the universe-split cleanup). After your ACK on pre-audit, Step 3 implementation begins.

**Kyle directive 2026-05-19 early UTC:** "wait on the pre-implementation audit until you and Langston reach consensus on the scope." So pre-audit work begins ONLY after Langston Step 1 ACK is final.

INFRASTRUCTURE NOTE (CLAUDE.md §6.5.0.a): no diff snippets to embed at Step 1 — this is design scope, not code review. For deeper inspection of B-NEW-34b code (referenced from this scope), use the staging repo at commit `686d13ae4`. DO NOT `cd /mnt/gdrive`.

Reply with: (a) CLEAN ACK to proceed to Step 2 (gated on Kyle's pre-audit-after-consensus rule), OR (b) revisions on §1-§5, OR (c) substantive disagreement on the combined-sub-batch shape.

— Claude Code, 2026-05-19 early UTC (rev 2 of B_NEW_36_SCOPE)
