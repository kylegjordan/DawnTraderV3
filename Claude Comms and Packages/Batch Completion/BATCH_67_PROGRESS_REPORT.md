# Batch 67 — Progress Report (OPEN)

**Author:** Claude Code
**Opened:** 2026-04-28
**Status:** OPEN — B67.0 sub-deliverable closed; B67.1, B67.2, B67.3, B67.4, B67.5 remaining
**Closes as:** `BATCH_67_COMPLETION_REPORT.md` once all 6 sub-deliverables are closed.

This report stays open across multiple commits and accumulates the closure of each sub-deliverable as it ships. It becomes the completion report when the final sub-deliverable closes.

---

## Sub-deliverable status

| # | Sub-deliverable | Status | Commit | Closed |
|---|---|---|---|---|
| B67.0 | Telemetry & ablation framework | ✅ CLOSED | `105d2b53` | 2026-04-28 |
| B67.3 | Per-underlying position limits | ⏳ Pending | — | — |
| B67.1 | Macro confidence modifier (BTC dominance + funding + mcap) | ⏳ Pending | — | — |
| B67.2 | Phase dimension (EARLY/PRIME/LATE) | ⏳ Pending | — | — |
| — | Calibration check (gating event) | ⏳ Pending | — | — |
| B67.5 | Wire regime confidence into 7 consumers | ⏳ Pending (gated on calibration pass) | — | — |
| B67.4 | Realized-outcome feedback | ⏳ Pending | — | — |

Sequence per scope §3:

```
B67.0 ✅
  ↓
B67.3 (safety net first, no confidence dependency)
  ↓
B67.1 + B67.2 (recompute confidence value)
  ↓
~14-day observation window
  ↓
Calibration check (tertile-monotonic ≥7pp HIGH−LOW gap, n≥150/bucket, χ² p<0.05)
  ↓ (only if pass)
B67.5 (wire confidence into 7 consumers, with sourcePool gate on Consumer #5)
  ↓
B67.4 (realized-outcome feedback closes the loop)
```

---

## B67.0 closure — 2026-04-28

### What shipped

**Backend infrastructure** for the replay-ablation framework that future regime-overhaul work will use to prove its value.

- New table `regime_factor_alternates` with XOR-discriminated source (active_signal vs vts_trade), 4 indexes for time/factor/signal/pair queries, DB CHECK constraint enforcing exactly-one-of-signalId/vtsTradeId
- 3 module_constants seed rows (`b67_0_ablation_emit_enabled`, `b67_0_alternates_retention_days`, `b67_0_paper_replay_capital_threshold_pct`)
- New service `factor-ablation-emitter.ts` with fire-and-forget `emitAblationRecord()` API and discriminated `AblationSource` union
- Wire-in to `signal-orchestrator.ts` (active path, after RTB queue) and `vts-runner.ts` (VTS mirror, before trade-record return)
- Nightly replay job `replay-ablation.ts` (skeleton + retention sweep functional; outcome-lookup logic ships with B67.1+ producers)
- npm script `b67:replay-ablation`
- Drift Dashboard aggregator extension `computeAblationComparison()` with per-factor four-quadrant taxonomy
- API endpoint `GET /api/analytics/ablation-comparison`
- New UI component `AblationComparisonSection` in existing Drift Dashboard tab with empty-state explainer until B67.1+ producers ship

**Governance**

- `BATCH_67_SCOPE.md` — Step-1 scope, Langston-approved
- `BATCH_67_PRE_AUDIT.md` — Step-2 V2 with proper SIM consultation + code-level inspection, Langston-approved (V1 preserved at `BATCH_67_PRE_AUDIT_V1_LIGHT.md`)
- `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0 + §0.10 — master planning doc with all 12 §11 decisions resolved + 7 V2 audit refinements
- `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 9 — daily-loss-budget service + kill-switch auto-trip wiring, marked **BLOCKING for live activation**

### Workflow gates

| Step | Owner | Status |
|---|---|---|
| 1 — Scope | CC + Langston | ✅ Approved |
| 2 — Pre-audit (V2) | CC + Langston | ✅ Approved |
| 3 — Implementation | CC | ✅ Complete (3a–3g) |
| 4 — Code review | Langston | ✅ Approved across 3 chunks (#835 foundational, #836 backend, #839 UI + bug fix) |
| 5 — GitHub push + CI | CC | ✅ Commit `105d2b53`; CI run `25065236992` GREEN (2m38s, all 4 checks) |
| 6 — Staging deploy | CC | ✅ PM2 #101, HTTP 200, migration applied cleanly |
| 7 — First-pass verification | CC | ✅ See "Verification evidence" below |
| 8 — Second-pass verification | Langston | ⏳ Pending Kyle UI review + Langston ack |
| 9 — Iterate | — | None needed |
| 10 — Governance updates | CC | ✅ This report + BATCH_CATALOG, PHASE_HISTORY, SYSTEM_MANUAL, SIM, CHANGES_AND_FIXES, MEMORY, change list |
| 11 — Completion ack | Kyle | ⏳ Pending |

### Verification evidence (Step-7 first-pass)

**HTTP health:** `curl http://localhost:5000/api/health` → `HTTP 200`

**Database schema** — `regime_factor_alternates` table created with 12 columns:
- `id integer`, `source_type text`, `signal_id integer`, `vts_trade_id text`, `pair_symbol text`, `evaluated_at timestamp with time zone`, `factor_name text`, `factor_state text`, `real_decision jsonb`, `alternate_decision jsonb`, `replay_outcome jsonb`, `replay_completed_at timestamp with time zone`

**Module constants seeded** — 3 rows in `ablation_framework` module:
- `b67_0_ablation_emit_enabled = true`
- `b67_0_alternates_retention_days = 90`
- `b67_0_paper_replay_capital_threshold_pct = 0.8`

**Row count** — `SELECT COUNT(*) FROM regime_factor_alternates` → 0 (expected at B67.0 ship time, no factor producers yet)

**API endpoint** — `GET /api/analytics/ablation-comparison?window=rolling_24h` returns:
```json
{ "ok": true, "data": { "window": "rolling_24h", "windowStart": "...", "windowEnd": "...", "factors": [], "totalRows": 0, "hasReplayedRows": false } }
```

**PM2 logs** — first 60 lines post-restart show no `[B67` errors. Pre-existing WS Sub Error and Lazy SystemHealthMonitor warnings unchanged from prior batch (B65).

**TypeScript** — `npx tsc --noEmit` clean across all B67.0 files.

**CI** — all 4 checks green on commit `105d2b53` (TypeScript Check, Test Suite, Build, Docker Build).

### What Kyle can verify on the UI

Navigate to staging Analytics → Drift Dashboard tab. Below the existing "Regime & Strategy Drift Dashboard" panel, new panel **"Factor Ablation Comparison (B67.0)"** with the same 4 window-toggle buttons. Empty-state message:

> *"No ablation rows in this window yet. The replay-ablation framework (B67.0) is wired and listening, but no factor producers have shipped yet. Once they begin emitting alternates, this panel will populate automatically with per-factor counterfactual statistics."*

If the panel renders with that explainer, B67.0 UI is verified.

### Files in commit `105d2b53`

16 files: 7 new (2 migrations, 1 service, 1 script, 3 governance docs), 9 modified (1 schema, 5 services/routes/UI, 1 package.json, 1 roadmap, 1 planning doc).

See `Claude Comms and Packages/Change Lists/BATCH_67_0_CHANGE_LIST.md` for granular file-by-file change list.

### Out of scope (deferred to subsequent sub-deliverables)

- **Active-path replay outcome lookup** — wires when B67.5 produces first ablation rows joinable to paper_sim_trades
- **VTS JSONL outcome reader** — wires when first B67.1+ factor producer needs it
- **Factor producers** — each of B67.1, B67.2, B67.4 builds its own emit call site; B68.x continue the pattern
- **Daily loss budget service + kill-switch auto-trip** — deferred to Phase 19.4.5 item 9 (BLOCKING for live), independent safety gap

---

*This report is OPEN. Next update when B67.3 closes.*
