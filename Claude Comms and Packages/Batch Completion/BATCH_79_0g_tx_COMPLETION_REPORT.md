# BATCH 79.0g-tx — Completion Report

> **Status:** SHIPPED + verified + Langston-approved
> **Author:** Claude Code
> **Created:** 2026-05-11
> **Commits:** `79774aa51` (impl) + `e32e101ee` (test-mock hotfix) + `bd299b8f7` (seed-SQL column-list hotfix)
> **PM2 deploy:** #215 on `migration/aws-supabase`
> **Resolves:** RUNNING_ISSUES #91
> **New tracker opened:** RUNNING_ISSUES #93 (governance-doc schema-drift sweep — `tunable_status` phantom column)

---

## 1. What shipped — Option B closed-flag soft-delete

Replaces the B79.0g fire-and-log close-time DELETE pattern with a closed-flag soft-delete + boot-time GC sweep. Option C (full tx through `persistRealPriceTrade`) was rejected at scope-lock as a regression-masquerading-as-a-fix — there's no shared Postgres-tx surface with `logTrade`'s JSON write, so reorder-into-tx would convert today's recoverable ghost-row failure mode into an unrecoverable double-write or data-loss mode.

### Implementation summary

| File | Change |
|---|---|
| `drizzle/migrations/2026-05-10-b79-0g-tx-vts-open-trades-soft-delete.sql` (NEW) | `ALTER TABLE vts_open_trades` adds `closed BOOLEAN NOT NULL DEFAULT false` + `closed_at TIMESTAMPTZ` + `CREATE INDEX CONCURRENTLY vts_open_trades_open_filter_idx ON (id) WHERE closed=false`. No tx wrap (CONCURRENTLY can't run inside BEGIN/COMMIT). |
| `drizzle/migrations/2026-05-10-b79-0g-tx-vts-open-trades-soft-delete-rollback.sql` (NEW) | Drop the partial index + the two columns. |
| `drizzle/migrations/2026-05-10-b79-0g-tx-data-lifecycle-seed.sql` (NEW + hotfixed `bd299b8f7`) | INSERT `module_constants.data_lifecycle.vts_open_trades.closed_gc_retention_days = 90`. Wildcard scope (system knob, not per-asset behavioral). Hotfix dropped the phantom `tunable_status` column reference. |
| `drizzle/migrations/2026-05-10-b79-0g-tx-data-lifecycle-seed-rollback.sql` (NEW) | DELETE the seed row. |
| `server/services/vts-trade-persistence.ts` | `deleteOpenTrade` REMOVED. NEW `markOpenTradeClosed(tradeId)` — awaited UPDATE `SET closed=true, closed_at=NOW()` with idempotency filter `AND closed=false`. `rehydrateOpenTrades` SELECT filters `WHERE closed=false`. `bootstrapOpenTradesFromMemory` COUNT filters `WHERE closed=false` (Q4 re-resolve semantic preserved — closed-history rows don't block re-resolve when in-memory Map has stale assetClass). NEW `sweepClosedOpenTrades()` — boot-time CTE `DELETE…RETURNING / SELECT COUNT`; HARD-FAIL with `[B79.0g-tx][CONFIG_MISSING]` log + null-return on missing module_constants row; does NOT halt boot. |
| `server/services/vts-runner.ts` (lines 2375–2402) | Close-site rewrite per **Langston pre-audit R1 (critical):** `openVirtualTrades.delete(id)` FIRST (synchronous Map gate is the correctness invariant against re-executing the non-idempotent close cascade), THEN awaited `markOpenTradeClosed(id)` in try/catch with NO re-throw (re-throw would let next exit cycle re-run `persistRealPriceTrade` → duplicate JSON ledger + double session P&L + duplicate B70 archive + duplicate B73 ablation + duplicate ML calibration tick). Soft-delete is observability + bounded-history, not close-cascade atomicity. |
| `server/index.ts` (lines 661–686) | Per **Langston pre-audit R2:** NEW own try/catch block calling `sweepClosedOpenTrades` AFTER the rehydrate block; `[B79.0g-tx][SWEEP_FAIL]` label so a sweep failure isn't conflated with a rehydrate failure. Soft-fail, never halts boot. |
| `server/tests/unit/b79-0g-vts-trade-persistence.test.ts` | `deleteOpenTrade` tests replaced with `markOpenTradeClosed` tests (UPDATE SQL shape + idempotency). +3 `sweepClosedOpenTrades` tests (CONFIG_MISSING absent + config present + invalid value). +1 bootstrap regression-lock that bootstrap PROCEEDS when only soft-deleted closed=true rows exist (Q4 semantic). Test-mock pattern hotfixed via `e32e101ee` — replaced `mockImplementationOnce` overrides with a `dbReturnOverrides` queue the default mock consumes via `.shift()` so the dbCalls capture path isn't bypassed. |

---

## 2. Verification (5-gate, CC Step 7)

| Gate | Result |
|---|---|
| **G1 CI** | Build + Docker green on `bd299b8f7`. All 13 b79-0g-tx tests pass. Legacy TS / Test red baseline unchanged (no new errors introduced). |
| **G2 schema** | `\d vts_open_trades` shows `closed boolean NOT NULL DEFAULT false` + `closed_at timestamptz` + `vts_open_trades_open_filter_idx ON (id) WHERE closed=false`. Seed row present: `data_lifecycle.vts_open_trades.closed_gc_retention_days = 90` (wildcard scope). |
| **G3 PM2 logs** | Boot lines on PM2 #215: `[B79.0g][REHYDRATE] loaded 113 open VTS trades from DB` + `[B79.0g-tx][GC_SWEEP] retention=90d swept=0 closed-rows from vts_open_trades`. Zero `[MARK_CLOSED_FAIL]`, zero `[SWEEP_FAIL]`, zero `[CONFIG_MISSING]`. |
| **G4 DB state** | `SELECT closed, COUNT(*) FROM vts_open_trades GROUP BY closed` → 113 open, 0 closed (expected pre-first-VTS-close on this PM2 instance). |
| **G5 crypto no-touch fence** | All 10 factor families emitting at 8/hr (within ±10% baseline) for `asset_class='crypto_spot'` over the past hour. No-touch invariant preserved by construction (asset-class-agnostic soft-delete pattern). |

---

## 3. Step 8 — Langston second-pass verification

**APPROVED 2026-05-11.** Langston independently verified G1–G5 + the close-site ordering + the boot block separation + the idempotency clause + the bootstrap-empty-check filter. Verbatim closing line: "Sequential execution: completion report + governance updates next."

Two non-blocking observations recorded:

1. **Pre-audit §1.5 schema-paraphrase miss (shared accountability).** The phantom `tunable_status` column reference was caught at psql-INSERT time as a deploy-blocking error (not silent corruption). Langston's recommendation: "future §1.5 schema sections must paste `\d <table>` output, not paraphrase from workflow docs." Captured in CHANGES_AND_FIXES.md + tracked in new RUNNING_ISSUES #93.
2. **Verification gap acknowledged.** `swept=0` on first boot is correct (no closed=true rows exist yet) but means production telemetry won't confirm the CTE DELETE actually fires until either (a) ~90 days from the first close or (b) a time-travel test. The unit test `sweepClosedOpenTrades > issues DELETE WHERE closed=true AND closed_at < cutoff` exercises the SQL shape — strongest gate available short of time-travel. Acceptable per Langston.

---

## 4. Crypto no-touch posture

NONE by-construction. The soft-delete pattern is asset-class-agnostic; `closed` + `closed_at` apply uniformly across all rows regardless of `asset_class`. No-touch fence on `crypto_spot` through 2026-05-15 preserved. G5 SQL confirms factor cadence within ±10% of baseline.

---

## 5. Open follow-ups + new trackers

- **RUNNING_ISSUES #93 (NEW) — governance-doc schema-drift sweep.** `tunable_status` phantom column referenced in `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Section C + SYSTEM_MANUAL appendix. Sweep scope: audit all governance docs for stale schema references; either drop or ship a migration to add `tunable_status` if the design intent is to track it. Not bundled into B79.0g-tx — own scope.
- **RUNNING_ISSUES #92 (DEFERRED to Phase 19)** — xstockSpotScanner orchestration wiring (would populate xStocks tab funnel counters; only meaningfully testable when active trading is on).
- **B79.TEC.b operator gate** — manual `break_even_enabled` wildcard DELETE per checklist (already passed wall-clock ~11:24 UTC Sunday; verify operator ran it).
- **B79.0a SQE wildcards DELETE** — manual operator step (already passed wall-clock ~21:38 UTC Sunday; verify operator ran it).
- **Cosmetic rename `XSTOCK_SPOT_24_7_SYMBOLS` → `XSTOCK_SPOT_EXTENDED_HOURS_SYMBOLS`** — queued for future sweep batch per Langston Q2 to avoid call-site churn.
- **B79.0g-tx GC sweep first real exercise** — boot-time sweep only sees swept=0 until the first soft-deleted row crosses the 90-day retention horizon. First non-zero `[GC_SWEEP] swept=N` log line will land ~2026-08-09 at earliest, assuming continuous PM2 uptime in the interim. No action required.

---

## 6. Governance updates

This batch updated:

- `1-system-manual/BATCH_CATALOG.md` — B79.0g-tx row added
- `1-system-manual/PHASE_HISTORY.md` — Phase 24 sub-batch table extended
- `1-system-manual/RUNNING_ISSUES.md` — #91 RESOLVED + #93 OPEN (new)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — `vts_open_trades` + `vts-trade-persistence.ts` entries updated to reflect soft-delete pattern; close-time ordering invariant documented
- `1-system-manual/CHANGES_AND_FIXES.md` — INFRA-2026-05-11-A entry for the soft-delete ship + pre-audit §1.5 lesson
- `Claude Comms and Packages/Scope Files/BATCH_79_0g_tx_SCOPE.md` — Langston Step 1 approved Option B with 5 revisions
- `Claude Comms and Packages/Scope Files/BATCH_79_0g_tx_PRE_AUDIT.md` — Langston Step 2 approved with R1 (critical) + R2 (small) applied to §1.3 + §5.2 + §5.3 + §11
- `Claude Comms and Packages/Langston Design Asks/B79_0g_tx_pre_audit_review_rev1.md`
- `Claude Comms and Packages/Change Lists/B79_0g_tx_diff.txt` — staged-diff Langston code-reviewed at Step 4
- `Claude Comms and Packages/Batch Completion/BATCH_79_0g_tx_COMPLETION_REPORT.md` — this file
- MEMORY.md 3-way sync (CC user-cache + repo persistence + Langston Hetzner) per CLAUDE.md §2 Step 10.b

---

## 7. Snags + lessons

### Snag 1 — Pre-audit §1.5 phantom `tunable_status` column

**Symptom:** seed migration aborted with `ERROR: column "tunable_status" of relation "module_constants" does not exist` on staging-deploy psql-INSERT.

**Root cause:** My pre-audit §1.5 paraphrased `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Section C ("`tunable_status` column — does the row tag values as `pending_layer_3` for unknown thresholds?") instead of pasting `\d module_constants` output. Actual schema has 9 columns, no `tunable_status`.

**Fix:** 3-LOC hotfix `bd299b8f7` — corrected column list to (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_at, updated_by) + corrected ON CONFLICT key order to match the actual PK index.

**Standing rule (Langston Step 8 verbatim):** future pre-audit §1.5 schema sections must paste `\d <table>` output, not paraphrase from workflow docs.

**Tracked in:** RUNNING_ISSUES #93 for the broader governance-doc sweep.

### Snag 2 — Test-mock pattern bypassed dbCalls capture

**Symptom:** 2 of 13 b79-0g-tx tests failed on first CI run with `TypeError: Cannot read properties of undefined (reading 'sql')` at the lines that asserted on `dbCalls[0].sql` / `dbCalls[1].sql`.

**Root cause:** Existing mock used `mockExecute.mockImplementationOnce` to stage per-call return values, which replaced the default impl's `dbCalls.push(...)` capture for that single call — leaving the assertion's index slot undefined.

**Fix:** test-only hotfix `e32e101ee` — replaced `mockImplementationOnce` calls with a `dbReturnOverrides` queue the default mock impl consumes via `.shift()`. The default impl always runs (capturing into `dbCalls`) and just pops a staged return value if one's queued; otherwise falls back to its built-in shape rules. Cleaner pattern, no behavioral code touched.

**Standing rule:** when using vitest mocks that need both call-capture AND per-call return-value control, prefer a captured-queue pattern over `mockImplementationOnce`. Documented inline in the test file's mock-setup block.

### Lesson — R1 was the high-value catch of the batch

Langston's pre-audit R1 was the critical correctness review. My initial pre-audit pattern (UPDATE before Map.delete; re-throw on failure) would have shipped a latent bug where any transient Postgres blip during the close-time UPDATE would let the next exit cycle re-run the entire close cascade — duplicate JSON ledger entry, double-counted session P&L, duplicate B70 archive row, duplicate B73 ablation, duplicate ML calibration tick. That is strictly worse than the original B79.0g failure mode (recoverable ghost DB row, no double-write). The Map gate is the correctness invariant; soft-delete is observability + bounded-history. Option B's win is the partial-index-filtered rehydrate, not close-time atomicity.

This is a clean illustration of why Step 2 pre-audit review by an independent reviewer is non-negotiable per the canonical workflow.

---

*End BATCH_79_0g_tx_COMPLETION_REPORT.md.*
