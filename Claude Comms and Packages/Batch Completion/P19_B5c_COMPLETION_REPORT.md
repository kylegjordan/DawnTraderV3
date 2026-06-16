# P19-B5c COMPLETION REPORT — Continuous Q-D (Quote-Depth) Probe → `xstock_qd_probe_history` (#86)

**Batch:** P19-B5c. **Author:** Claude New (CC-B). **Date:** 2026-06-16. **Run mode:** autonomous with Langston (full 11-step).
**Code commits:** `dc8350110` (Step-3 impl) → `16d4d3ca5` (Step-4 follow-up: weekend telemetry-narrative fix) → **`f521f6d6b` (Step-7 fix: per-symbol indexed snap read)**. Governance commits follow.

---

## 🚦 §9.1 SCAFFOLDING / DORMANCY DECLARATION

> **THIS BATCH DOES NOT MAKE PER-PAIR FRICTION MODELING FUNCTIONAL.** The friction model's `perPairOverrides` stays empty; `spreadRateDefault`/`slippageRateDefault` untouched. B5c is **CAPTURE-ONLY** — it COLLECTS the distributional friction evidence; CONSUMING it (deriving per-pair overrides) remains homed at **B81 / Phase-25**.

**NOT dormant** (unlike B5a): the probe writes rows immediately on deploy and runs regardless of paper/live active state — a passive-learning/telemetry component. So the *probe* is functional-on-deploy; only the downstream *consumer* is deferred.

---

## SCOPE OBJECTIVES — CHECKLIST

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | NEW `xstock_qd_probe_history` table (D5 fire-grid `bucket_start`; A1 `quote_quality`; UNIQUE(symbol,bucket_start); INDEX(bucket_start) alone) + migration + rollback + MANIFEST + schema.ts | ✅ YES | migration `2026-06-16-p19-b5c-qd-probe-history.sql`; applied on deploy (`\d` table present); schema const `xstockQdProbeHistory` |
| 2 | NEW probe service — iterate `XSTOCK_SPOT_SYMBOLS`, latest snap per symbol, compute spread/depth/staleness, `ON CONFLICT DO NOTHING`, fail-soft | ✅ YES | `qd-probe-service.ts`; live fire writes rows (Step-7 evidence below) |
| 3 | Cadence + retention + dedup module_constants-resolved (no hardcoded fallback; fail-loud) | ✅ YES | staging `module_constants`: `qd_probe.cadence_minutes=5`, `qd_probe.freshness_ceiling_ms=600000`, `data_lifecycle.xstock_qd_probe_history.hot_retention_days=90` (all verified present) |
| 4 | Always-on boot wiring + cron-registry + fire-evidence + B-NEW-49 smoke-test coverage | ✅ YES | boot log: `registered (expr=*/5 * * * *)`, `[CRON-REGISTRY] Registered job=xstock_qd_probe_cron interval_seconds=300`, `[CRON-ARM-SMOKE] status=OK next_fire=14:10:00Z`; fire-evidence rows in `scheduled_tasks_audit` |
| 5 | Retention — B75 plain-table age-delete pass (single owner, no partitioning, no cold-offload) | ✅ YES | `b75-retention-sweep.ts` `PLAIN_RETENTION_TABLES` + `sweepPlainTables` + main wiring; tsc-clean (runs nightly with the existing B75 cron) |
| 6 | Unit tests — A1 degenerate cases, fire-grid floor, stale boundary, no_snap | ✅ YES | `p19-b5c-qd-probe-metrics.test.ts` 14 tests; vitest **2006/2006** on the bench |
| 7 | Close-out: bench tsc-no-regression + vitest → CI all-4-green → deploy HTTP200 → live-verify rows + fire-evidence | ✅ YES | tsc-baseline OK; CI green (`16d4d3ca5` run `27623322606`; re-green on `f521f6d6b`); deploy HTTP 200 restart#397; live-verify below |

**§9.3 note:** this is a BACKEND data-quality / telemetry batch with **NO UI panel** — "staging verified" here = psql row evidence + boot/fire-evidence logs (explicitly NOT UI-navigated, because there is nothing to navigate).

---

## ★ STEP-7 LIVE-VERIFY FINDING + FIX (the value of outcomes-based verification)

The first cron fire (14:10:00Z) **errored at `duration_ms=30002`** — the 30s Postgres `statement_timeout` — writing 0 history rows (fire-evidence row present with `status=error`, null meta). **Root cause:** the snap read used a single `DISTINCT ON (symbol)` with **no WHERE**, which full-table-scans + sorts the multi-GB `xstock_spot_ticker_snap` tick archive (Postgres does not auto-do a loose index skip-scan) → timeout. This is exactly the "index-served" assumption Langston flagged at Step-4 to verify rather than assume.

**Fix (`f521f6d6b`, NO-PATCHES):** replaced with **per-symbol indexed `WHERE symbol=$1 ORDER BY captured_at DESC LIMIT 1` seeks** (bounded concurrency 8 over the pool) — each an O(log n) index seek on `(symbol, captured_at)`; ~40 instant lookups, no full scan, no array-param. Mirrors the proven `depth-source.ts` read. tsc-no-regression; redeployed.

**Post-fix live-verify (Step-7 re-run) — ✅ CONFIRMED:** redeployed `f521f6d6b` (restart #398, HTTP 200, cron re-armed). The 14:20:00Z fire wrote **486 rows** (`xstock_qd_probe_history`), all `quote_quality='ok'`, with sane on-venue spreads — AAPL/USD `spread_bps=1.34`, ABT 5.58, ABNB 9.32, ADBE 12.96, thinner name A 44.97 — real bid/ask depth notionals, fresh `snap_age_ms` 7–15s, `stale=false`. The **success fire-evidence row** (`scheduled_tasks_audit`, `status=success`) carries the full D7 meta: `duration_ms=3132` (vs the 30002ms timeout — fix confirmed), `market_open=true`, `rows_written=486`, `universe_size=490`, `symbols_skipped_no_snap=4`, `symbols_stale=1`. The two pre-fix errored fires (14:10, 14:15 @ 30002ms) remain in the audit trail as the documented timeout.

**§9.2 PREVIOUSLY-STATED-VS-NOW (universe size / volume):** PREVIOUSLY (scope/pre-audit, Langston sizing) ~20-40 active xStock symbols → ~0.4-1.0M rows steady-state. **NOW: 490 active symbols** (`XSTOCK_SPOT_SYMBOLS` is the full discovered universe, not the ~40 tradeable estimate) → ~490 × 288 fires/day × 90d ≈ **12.7M rows steady-state**. REASON: the in-memory universe is larger than estimated. Impact: still well within a plain Postgres table + the `bucket_start`-indexed age-delete; the per-symbol indexed read processed all 490 in **3.1s** (comfortably under the 5-min cadence and the 30s timeout). No design change required.

---

## GOVERNANCE FILES CHANGED

- **SIM** (`SYSTEM_IMPACT_MAP.md`) — Cross-Cutting Runtime State / Liveness Registry callout for the new `xstock_qd_probe_cron` always-on telemetry singleton (mode-invariant; reads ticker_snap + writes the new table; retention via B75 plain pass; weekend signature). *(Langston Step-4 Condition B.)*
- **System Manual** — one-line friction-model-chapter cross-reference ("continuous on-venue friction-evidence series accrues in `xstock_qd_probe_history`; consumption deferred to B81/Phase-25"). *(D11; full friction-chapter write happens at consumption, B81.)*
- **RUNNING_ISSUES** — #86 → CAPTURE-SUBSTRATE LANDED (extraction stays B81/Phase-25); **R-D2 basis CANDIDATE** homed to B81/Phase-25 (§9.4).
- **BATCH_CATALOG** — B5c row.
- **PHASE_HISTORY** — B5c paragraph.
- **PHASE_19_PLAN** — §1 status board (B5c → done) + §5 decision log (§14).
- **MULTI_ASSET_VTS_EXPANSION_PLAN** — xStock-calibration working-list: #86 friction-capture substrate landed.
- **MEMORY** (4-way sync).

## LEFT-INTENTIONALLY (rule 18 / §15 — so a later grep doesn't read it as a missed sweep)

- **`scripts/b79-0a-qd-probe.ts`** — the one-shot B79.0a Q-D probe is **kept** as the on-demand xStock-vs-underlying **basis** spot-check tool. Distinct purpose (basis, Yahoo-sourced, manual one-shot) — **NOT superseded by B5c** (which captures on-venue quote-depth, internal, continuous). Decision D10 (Langston Step-1).

## CI

- `16d4d3ca5` → run `27623322606` **all-4-green** (Build, Test Suite, TypeScript Check, Docker Build). Step-7 fix `f521f6d6b` re-green (recorded at close).

## LANGSTON TRAIL

Step-1 ACK (D1-D11) → Step-2 ACK (R-D9/D7/A1/D2 + index-swap + zero_depth) → Step-4 APPROVE (3 blessings + Condition A [empty-insert guard, already present] + Condition B [SIM registry entry, landed] + weekend-narrative catch [fixed `16d4d3ca5`]) → Step-8 _<pending>_.
