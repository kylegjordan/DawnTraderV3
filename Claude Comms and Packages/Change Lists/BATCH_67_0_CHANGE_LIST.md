# Batch 67.0 — Change List

**Batch:** B67.0 (Telemetry & Ablation Framework, sub-deliverable 1 of 6 in B67)
**Commit:** `105d2b53` (2026-04-28)
**CI:** run `25065236992` GREEN (2m38s, 4/4 checks)
**Deploy:** PM2 restart #101, 2026-04-28 ~16:35 UTC. HTTP 200.

---

## Code changes (16 files)

### New files (7)

| File | Purpose | Lines |
|---|---|---:|
| `drizzle/migrations/2026-04-28-b67-0-regime-factor-alternates.sql` | Migration: `regime_factor_alternates` table + 4 indexes + XOR CHECK constraint + 3 module_constants seed rows | ~80 |
| `drizzle/migrations/2026-04-28-b67-0-rollback.sql` | Symmetric rollback (drops indexes, table, seed rows) | ~30 |
| `server/services/factor-ablation-emitter.ts` | Fire-and-forget `emitAblationRecord()` API with discriminated `AblationSource` union; gated on `b67_0_ablation_emit_enabled` | ~165 |
| `server/scripts/replay-ablation.ts` | Nightly cron job (skeleton + retention sweep functional; outcome-lookup logic gated for B67.1+) | ~165 |
| `Claude Comms and Packages/Scope Files/BATCH_67_SCOPE.md` | Step-1 scope (15 sections, 6 sub-deliverables) | ~530 |
| `Claude Comms and Packages/Scope Files/BATCH_67_PRE_AUDIT.md` | Step-2 V2 pre-audit (proper SIM consultation + code-level inspection) | ~470 |
| `Claude Comms and Packages/Scope Files/BATCH_67_PRE_AUDIT_V1_LIGHT.md` | V1 pre-audit preserved for traceability | ~210 |

### Modified files (9)

| File | Change |
|---|---|
| `shared/schema.ts` | Added `regimeFactorAlternates` Drizzle table + types adjacent to `moduleConstants` |
| `server/services/signal-orchestrator.ts` | Added `emitAblationRecord({ kind: 'active_signal', signalId }, ...)` hook after `readyToBuyService.queueSQESignal()` (line ~617). Empty alternates today; B67.1+ producers populate. Import added at top |
| `server/services/vts-runner.ts` | Added `emitAblationRecord({ kind: 'vts_trade', vtsTradeId: signal.id }, ...)` hook before `return { signal, tradeRecord }` (line ~1349). Empty alternates today. Import added at top |
| `server/services/drift-dashboard-aggregator.ts` | Added `computeAblationComparison(window)` exported function + `AblationFactorStats`/`AblationComparisonResponse` interfaces. Uses raw SQL with conditional JSONB aggregations; lazy-imports DB to avoid coupling existing JSONL paths |
| `server/routes.ts` | Added `GET /api/analytics/ablation-comparison` endpoint sibling to `/analytics/drift-dashboard` |
| `client/src/pages/analytics.tsx` | Added `AblationComparisonSection` React component + types; rendered in Drift Dashboard tab below existing `DriftDashboardSection`. Empty-state explainer + 8-column populated-state table |
| `package.json` | Added `b67:replay-ablation` npm script |
| `1-system-manual/POST_AUDIT_ROADMAP.md` | Added Phase 19.4.5 item 9 (daily-loss-budget service + kill-switch auto-trip wiring, **BLOCKING for live activation**) |
| `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` | §0 + §0.10 with all 12 §11 decisions resolved + 7 V2 audit refinements |

---

## Module constants seeded (3 rows in `ablation_framework` module)

- `b67_0_ablation_emit_enabled` (bool, default `true`) — kill-switch for emit
- `b67_0_alternates_retention_days` (int, default `90`) — retention window
- `b67_0_paper_replay_capital_threshold_pct` (float, default `0.80`) — Kelly-replay capital-constraint threshold (used when B67.5 wires confidence into Kelly sizing)

---

## Schema additions (1 new table)

`regime_factor_alternates` (12 columns):
- `id` SERIAL PRIMARY KEY
- `source_type` TEXT NOT NULL CHECK (`'active_signal'` | `'vts_trade'`)
- `signal_id` INTEGER (nullable; populated when source_type=active_signal)
- `vts_trade_id` TEXT (nullable; populated when source_type=vts_trade)
- `pair_symbol` TEXT NOT NULL
- `evaluated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `factor_name` TEXT NOT NULL
- `factor_state` TEXT NOT NULL CHECK (`'alternate_disabled'` | `'alternate_enabled'`)
- `real_decision` JSONB NOT NULL
- `alternate_decision` JSONB NOT NULL
- `replay_outcome` JSONB (populated by nightly job)
- `replay_completed_at` TIMESTAMPTZ (populated by nightly job)
- XOR CHECK: exactly one of `signal_id` / `vts_trade_id` populated

4 indexes:
- `(factor_name, evaluated_at DESC)` — dashboard time-series queries
- `(signal_id) WHERE signal_id IS NOT NULL` — active-signal join
- `(vts_trade_id) WHERE vts_trade_id IS NOT NULL` — VTS-trade join
- `(pair_symbol, evaluated_at DESC)` — per-pair queries

---

## API surface

**New endpoint:** `GET /api/analytics/ablation-comparison?window=rolling_24h|rolling_7d|rolling_30d|cohort_latest`

Returns:
```json
{
  "ok": true,
  "data": {
    "window": "rolling_24h",
    "windowStart": "2026-04-27T...",
    "windowEnd": "2026-04-28T...",
    "factors": [],
    "totalRows": 0,
    "hasReplayedRows": false
  }
}
```

`factors[]` populates per-factor when B67.1+ producers ship.

---

## UI changes

**Analytics page → Drift Dashboard tab → new "Factor Ablation Comparison (B67.0)" panel below existing "Regime & Strategy Drift Dashboard."**

- Window toggle (4 buttons): rolling 24h / 7d / 30d / since restart
- Empty state: explainer block visible at B67.0 ship time
- Populated state (when B67.1+ producers ship): 8-column table
  - Factor / Total / Replayed / Pending / Both Admit / Real Admit-Alt Reject / Avg $ Saved if Alt Active / Real Reject-Alt Admit
- 60s auto-refresh

---

## Out of scope (deferred)

- **Active-path replay outcome lookup** — wires when B67.5 produces first ablation rows
- **VTS JSONL outcome reader** — wires when first B67.1+ factor producer needs it
- **Factor producers** (B67.1, B67.2, B67.4, B68.x) — each builds its own emit call site
- **SYSTEM_MANUAL.md update** — no formula changes in B67.0 (purely infrastructure); update lands with B67.5 when FinalScore formula changes
- **Daily loss budget service + kill-switch auto-trip** — Phase 19.4.5 item 9, BLOCKING for live activation, independent safety gap

---

## Verification log

| Check | Result |
|---|---|
| TypeScript | `npx tsc --noEmit` clean across all B67.0 files |
| CI | run `25065236992` GREEN (TypeScript Check, Test Suite, Build, Docker Build) |
| Migration | `npm run db:migrate` applied 1 pending migration cleanly |
| HTTP health | `GET /api/health` → 200 |
| Schema | 12 columns confirmed via psql `information_schema.columns` |
| Module constants | 3 rows confirmed in `ablation_framework` module |
| Row count | 0 rows in `regime_factor_alternates` (expected — no factor producers yet) |
| API | `GET /api/analytics/ablation-comparison?window=rolling_24h` returns well-formed empty response |
| PM2 logs | First 60 lines post-restart: zero `[B67` errors |

---

## Workflow gates

| Step | Status |
|---|---|
| 1 — Scope | ✅ Langston-approved |
| 2 — Pre-audit V2 | ✅ Langston-approved (V1 light pre-audit superseded) |
| 3 — Implementation | ✅ Complete (3a-3g) |
| 4 — Code review | ✅ Langston ×3 chunks (foundational #835, backend #836, UI + bug fix #839) |
| 5 — GitHub push + CI | ✅ commit `105d2b53`, CI green |
| 6 — Staging deploy | ✅ PM2 #101, HTTP 200 |
| 7 — First-pass verification (CC) | ✅ See verification log above |
| 8 — Second-pass verification (Langston) | ⏳ Pending Kyle UI review + Langston ack |
| 9 — Iterate | None needed |
| 10 — Governance | ✅ This change list + BATCH_CATALOG + PHASE_HISTORY + SIM + CHANGES_AND_FIXES + MEMORY + progress report |
| 11 — Completion ack | ⏳ Pending Kyle |

---

*Sub-deliverable B67.0 of B67 (6 sub-deliverables total). Progress report at `Claude Comms and Packages/Batch Completion/BATCH_67_PROGRESS_REPORT.md` stays open until all 6 close.*
