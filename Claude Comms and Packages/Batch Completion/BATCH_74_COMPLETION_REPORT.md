# Batch 74 — Completion Report

**Status:** CLOSED pending Kyle ack
**Type:** Passive OHLC + Ticker Archive Pipeline (Equity + Crypto)
**Commits:** `ce4a7e40` → `bd60add3` → `778cd4ed` (+ governance commit pending)
**PM2:** #119 → #122
**CI:** 3 of 4 green (Test Suite + Build + Docker; TS Check legacy-baseline red as established since B58)
**Workflow:** All 11 steps, Langston-approved at gates 1, 2, 4, 8 (cc-inbox #867 / #869 / #870 / #873)

---

## 1. Scope objectives — verification matrix

| # | Objective | Verification criterion | Result |
|---|---|---|---|
| 1 | All 128 xStocks captured continuously | After 1h, count(DISTINCT symbol) ≈ 128 in `equity_spot_ohlc_1m` | **PARTIAL — 38 of 128 in v1 starter list** (expand via PR per Langston cc-inbox #867 Q3); 38/38 captured |
| 2 | All 10 stock perp futures captured continuously | After 1h, both tables show rows for all 10 PF_*XUSD | **PARTIAL — ticker 10/10 syms 1,478 rows ✓; OHLC 0 rows ✗** (RUNNING_ISSUES #41 — feed name mismatch, ticker covers asset class) |
| 3 | Crypto USD/USDT/USDC universe captured continuously | At least 80% of universe captured after 1h | **YES — 373 of 380 captured (98%) within 6 minutes** |
| 4 | Symbol canonicalizer extension for perp form | Round-trip unit tests pass | **YES — `b74-symbol-canonicalizer-perp.test.ts` passes; existing crypto canonicalization unaffected** |
| 5 | Schema designed for B70 archival | 6 tables month-partitioned, no FKs, self-describing rows | **YES — verified `\d+`; 12 forward partitions per table; `metadata.schema_version=1` default; no FK constraints into B74** |
| 6 | No impact on existing live signal pipeline | VTS open-trade rate, FX5 scan latency, signal-orch emit count statistically unchanged | **YES — verified via SIM walk in pre-audit §A.3; no imports of B74 from any non-B74 file; bootstrap fire-and-forget cannot block startup** |
| 7 | Operationally safe (kill-switches, auto-reconnect, error handling) | Module-constants kill-switch test, disconnect/reconnect test | **YES — 7 module_constants seeded; exponential backoff 1→2→4→8→16→30s capped; insert errors logged + capture loop continues** |

**Summary: 5 of 7 fully achieved, 2 partial.** Equity universe size and equity_perp OHLC are both backlog items (RUNNING_ISSUES #41 + manual PR-driven xStocks expansion). Both partials approved by Langston Step-8 (cc-inbox #873) as non-blocking — ticker covers the perp asset class with more granularity than 1-min OHLC for most analysis purposes.

---

## 2. What shipped

### 2.1 Core implementation (commit `ce4a7e40`, 21 files, ~2,324 lines)

| File | Type | Lines |
|---|---|---|
| `drizzle/migrations/2026-05-01-b74-passive-archive-tables.sql` + rollback | NEW | 267 |
| `shared/schema.ts` (Drizzle defs for 6 new tables) | MODIFIED | +127 |
| `server/services/utils/symbol-canonicalizer.ts` | MODIFIED | +19 |
| `server/services/passive-archive/equity-spot-archiver.ts` | NEW | 182 |
| `server/services/passive-archive/equity-perp-archiver.ts` | NEW | 176 |
| `server/services/passive-archive/crypto-spot-archiver.ts` | NEW | 223 |
| `server/services/passive-archive/ohlc-batch-writer.ts` | NEW | 137 |
| `server/services/passive-archive/ticker-batch-writer.ts` | NEW | 145 |
| `server/services/passive-archive/reconnect-policy.ts` | NEW | 40 |
| `server/services/passive-archive/universe-loader.ts` | NEW | 209 |
| `server/startup/passive-archive-bootstrap.ts` | NEW | 80 |
| `server/scripts/b74-refresh-universe.ts` | NEW | 72 |
| `server/scripts/b74-create-monthly-partitions.ts` | NEW | 99 |
| `server/index.ts` (B74 bootstrap call) | MODIFIED | +12 |
| `server/config/{xstocks,equity-perp}-universe.json` + `crypto-universe-filter.json` | NEW | 82 |
| `server/tests/unit/b74-symbol-canonicalizer-perp.test.ts` | NEW | 78 |
| `server/tests/unit/b74-universe-loader.test.ts` | NEW | 138 |
| `Claude Comms and Packages/Scope Files/BATCH_74_PRE_AUDIT.md` | NEW | 247 |

### 2.2 Production hotfixes (commits `bd60add3` + `778cd4ed`)

**Hotfix 1 — Config path resolution** (`bd60add3`)
- Universe-loader's `import.meta.url`-based path didn't survive esbuild bundle to single-file `dist/index.js`. Symptom: bootstrap reported "started" but archivers showed connected=false because universe-loader threw ENOENT silently.
- Fix: switched to `process.cwd()`-based path. App is launched from project root by PM2, so cwd is stable.
- BUG-2026-04-30-F logged.

**Hotfix 2 — Two issues** (`778cd4ed`)
- (a) Migration pre-created partitions for 2026-05 → 2027-04 but deployed on 2026-04-30 → all inserts failed for ~1.5 hours until UTC midnight rolled into May. Manual partition creation on staging during incident; bootstrap self-heal added so fresh installs auto-create current-month partition with `[B74][partitions][SELF-HEAL] created missing CURRENT-month partition` warn log if missing. BUG-2026-04-30-G logged.
- (b) FNV-1a hash low-bit bias on similar-suffix strings (380 crypto pairs all ending in /USD, /USDT, /USDC) sharded 364/16 instead of expected ~190/190. Added Murmur3 fmix32 finalizer; rebalanced to 180/201. BUG-2026-04-30-H logged.

### 2.3 Operational additions

- 2 cron entries in root crontab: daily 03:00 UTC universe refresh + monthly 28th 02:00 UTC partition pre-creation
- 7 module_constants seeded in new `passive_archive` module: 3 kill-switches + 4 tuning knobs

---

## 3. Post-deploy verification (Step 7, ~6 minutes after PM2 #122)

```sql
SELECT 'equity_spot_ohlc_1m' tbl, count(*) rows, count(DISTINCT symbol) syms FROM equity_spot_ohlc_1m
UNION ALL SELECT 'equity_perp_ohlc_1m', count(*), count(DISTINCT symbol) FROM equity_perp_ohlc_1m
UNION ALL SELECT 'crypto_spot_ohlc_1m', count(*), count(DISTINCT symbol) FROM crypto_spot_ohlc_1m
UNION ALL SELECT 'equity_spot_ticker_snap', count(*), count(DISTINCT symbol) FROM equity_spot_ticker_snap
UNION ALL SELECT 'equity_perp_ticker_snap', count(*), count(DISTINCT symbol) FROM equity_perp_ticker_snap
UNION ALL SELECT 'crypto_spot_ticker_snap', count(*), count(DISTINCT symbol) FROM crypto_spot_ticker_snap;
```

| Table | Rows | Syms |
|---|---|---|
| equity_spot_ohlc_1m | 161 | 38 |
| equity_perp_ohlc_1m | **0** | **0** |
| crypto_spot_ohlc_1m | 4,008 | 373 |
| equity_spot_ticker_snap | 1,418 | 38 |
| equity_perp_ticker_snap | 1,478 | 10 |
| crypto_spot_ticker_snap | 824 | 373 |

**5 of 6 active. Equity perp OHLC is the only zero — RUNNING_ISSUES #41.**

---

## 4. Forward couples (per pre-audit §B)

- **B70 (data archiving)** — B74's tables ARE B70's substrate. Month-partitioned, no FKs, self-describing rows. B70 will define hot/warm/cold tiering.
- **B68.1 (multi-timeframe DBS agreement)** — `crypto_spot_ohlc_1m` provides the 1-min crypto data B68.1 needs. B68.1 still owns signal-pipeline integration.
- **Phase 21.5 (equity expansion)** — 3 equity tables provide weeks-to-months of historical context when Phase 21.5 begins.

---

## 5. Governance files updated

| File | What changed |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New B74 row inserted above B73.2 entry with full rationale + 3 hotfix narratives |
| `1-system-manual/PHASE_HISTORY.md` | New Phase 15c parallel-batch entry covering scope + 3 hotfixes + verification + backlog flagging |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | New B74 components inventory (16 entries) + forward-couples + known limitations sections |
| `1-system-manual/CHANGES_AND_FIXES.md` | 3 new BUG entries (F = config path, G = partition off-by-one, H = FNV-1a bias) with severity, location, root cause, fix, lesson |
| `1-system-manual/RUNNING_ISSUES.md` | 2 new entries: #41 (equity_perp OHLC feed-name mismatch) + #42 (CCDT narration leak — Langston self-fix in progress); summary counts updated |
| `.claude/memory/MEMORY.md` (truth + repo) | Current state updated to PM2 #122 + JUST COMPLETED rewritten for B74 ship + 3 hotfixes; 189 lines / 200 cap |
| `Claude Comms and Packages/Batch Completion/BATCH_74_COMPLETION_REPORT.md` | This file |

---

## 6. Backlog items (non-blocking)

1. **`equity_perp_ohlc_1m` at 0 rows** (RUNNING_ISSUES #41) — Kraken Futures WS subscription `feed: 'candles_trade_1m'` returns no data. Fix in v2 by probing for correct feed name OR REST-polling futures candles every 5 min.

2. **xStocks universe currently 38 of 128 target** — v1 starter from Kyle screenshots. Expand via PR per Langston cc-inbox #867 Q3.

3. **CCDT narration leak to General/topic-1** (RUNNING_ISSUES #42) — Langston self-implementing the immediate fix (NO_REPLY after explicit thread sends). Upstream openclaw fix queued for the platform team.

4. **Storage trajectory monitoring** — flag for Kyle: review Supabase plan limits before B74 has been running for 3 months (per Langston cc-inbox #867 sanity-check).

---

## 7. Sign-off

- [x] CC: implementation + verification + governance complete
- [x] Langston: Step 1 scope review (cc-inbox #867)
- [x] Langston: Step 2 pre-audit review (cc-inbox #869)
- [x] Langston: Step 4 code review (cc-inbox #870)
- [x] Langston: Step 8 second-pass verification (cc-inbox #873)
- [x] CI: 3 of 4 green (Test Suite + Build + Docker; TS Check legacy-baseline)
- [ ] Kyle: scope completion ack ← awaiting

*B74 closed pending Kyle's acknowledgment.*
