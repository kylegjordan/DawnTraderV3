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
| B67.3 | Per-underlying position limits | ✅ CLOSED (shadow mode at deploy) | `ca0e2c2d` | 2026-04-28 |
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

## B67.3 closure — 2026-04-28

### What shipped

**Per-underlying position cap admission gate (shadow mode at deploy).** Caps simultaneous open trades per underlying base currency across VTS + active-trading paths. Sub-deliverable 2 of 6 in B67. Deploys FIRST among B67's confidence-modifying deliverables because it has zero confidence dependency — pure safety net during the rollout.

- New service `per-underlying-cap.ts` with `checkPerUnderlyingCap()` API. Cohort assignment via FNV-1a 32-bit hash on symbol (cohort 0 = treatment, cohort 1 = control). Decision considers enabled flag, split-active flag, current open count vs cap, cohort. Shadow-mode at ship logs would-reject without actually rejecting. Format helper for PM2-readable output.
- New rejection reason `'PER_UNDERLYING_CAP'` in `signal_lifecycle_audit.ts` taxonomy.
- Schema: `paper_sim_trades.pair_id_hash` integer column for cohort persistence. NULL on rows opened pre-B67.3.
- 3 module_constants seeds: `b67_3_enabled=false` (shadow), `b67_3_max_concurrent_per_underlying=2`, `b67_3_universe_split_active=true`.
- Wire-in: `signal-orchestrator.ts` (active path, gates BEFORE RTB queue) and `vts-runner.ts` (VTS-mirror, after MAX_OPEN_TRADES check). paper-execution-engine intentionally NOT gated — signals filter at signal-orchestrator before reaching RTB; avoids consistency risk between two paper-side gates.

### Workflow gates

| Step | Owner | Status |
|---|---|---|
| 1 — Scope | CC + Langston | ✅ Approved (rolled into B67 master scope §5) |
| 2 — Pre-audit | CC + Langston | ✅ Approved (B67 V2 pre-audit covers all sub-deliverables) |
| 3 — Implementation | CC | ✅ Complete |
| 4 — Code review | Langston | ✅ Approved (cc-inbox #841). One non-blocking comment fix applied: migration header now states FNV-1a explicitly with portability rationale (scope §5.3 specified CRC32 conceptually). |
| 5 — GitHub push + CI | CC | ✅ Commit `ca0e2c2d`; CI run `25072886601` GREEN (2m24s, all 4 checks) |
| 6 — Staging deploy | CC | ✅ PM2 #102, HTTP 200, migration applied cleanly |
| 7 — First-pass verification | CC | ✅ See verification evidence below |
| 8 — Second-pass verification | Langston | Skipped per Kyle workflow — Step-4 review by Langston covered code-level evidence |
| 9 — Iterate | — | None needed |
| 10 — Governance updates | CC | ✅ This progress report block + BATCH_CATALOG sub-row + PHASE_HISTORY entry + change list + MEMORY |
| 11 — Completion ack | Kyle | ⏳ Pending |

### Verification evidence (Step-7 first-pass)

**HTTP health:** `curl http://localhost:5000/api/health` → `HTTP 200`

**Database schema** — `paper_sim_trades.pair_id_hash` column confirmed PRESENT via psql

**Module constants seeded** — 3 rows in `per_underlying_cap` module:
- `b67_3_enabled = false`
- `b67_3_max_concurrent_per_underlying = 2`
- `b67_3_universe_split_active = true`

**TypeScript** — `npx tsc --noEmit` clean

**CI** — all 4 checks green on commit `ca0e2c2d` (TypeScript Check, Test Suite, Build, Docker Build)

**PM2 logs** — no `[B67.3]` errors. Live signal-evaluation logging not yet visible because VTS reports "No pairs available for simulation cycle" during this verification window — gate will exercise live when signal flow resumes (active trading is currently STOPPED per UI).

### Activation plan post-ship

1. ✅ Ship in shadow mode (`b67_3_enabled=false`)
2. Verify shadow-mode logs are coherent once signal flow resumes
3. Add the `pair_id_hash` trade-open wire-in (small follow-up commit; persists cohort to row at trade open so the end-of-observation cohort comparison can compute "cohort 0 WR vs cohort 1 WR")
4. Flip `b67_3_enabled=true` via module_constants UPDATE — no code change
5. Begin 14-day observation period
6. End-of-observation cohort comparison: WR / net expectancy / max-loss-per-day in cohort 0 vs cohort 1
7. If cohort 0 (limited) ≥ cohort 1 (unlimited) on net expectancy → keep cap, flip `b67_3_universe_split_active=false` so all pairs get the limit
8. If cohort 0 < cohort 1 → escalate to Kyle; deactivate `b67_3_enabled`

### What Kyle can verify on staging

- (UI) No new visible UI panel for B67.3 — this is a backend admission gate, not a dashboard feature
- (Logs) Once signal flow resumes (active trading turned ON or VTS gets pairs), PM2 logs will show `[B67.3]` decisions like `[B67.3] AVAX/USD base=AVAX cohort=0 open=2/2 → SHADOW would-reject (cap_disabled)` (shadow mode) or `→ allowed` for non-rejected signals

### Files in commit `ca0e2c2d`

7 files: 3 new (2 migrations + 1 service), 4 modified (rejection-reason taxonomy, schema, signal-orchestrator wire-in, vts-runner wire-in).

See `Claude Comms and Packages/Change Lists/BATCH_67_3_CHANGE_LIST.md` for granular file-by-file change list.

### Out of scope (deferred)

- **`pair_id_hash` trade-open persistence** — column exists post-migration; gate computes cohort on every signal evaluation. End-of-observation cohort comparison requires the cohort persisted on the trade record at trade open. Lands as a small follow-up commit before `b67_3_enabled` is flipped to true.
- **paper-execution-engine third gate** — intentionally NOT wired. Signals filter at signal-orchestrator before reaching RTB; redundant gate at paper-execution would risk consistency drift.
- **B68.3 cross-quote correlation** — ETH/BTC counts toward BASE only in B67.3; pair correlation for cross-quote concentration handled in B68.3.

---

*This report is OPEN. Next update when B67.1 + B67.2 close (deploy together per scope §3 dependency chain).*
