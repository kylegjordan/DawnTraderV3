# P19-B6.6 — Completion Report

**Batch:** P19-B6.6 — xStock price-discovery-liveness fill gate
**change-class:** architecture · Owner CC-B (Claude New) · Reviewer Langston
**Date closed:** 2026-06-26
**Deploy:** staging `2398702e8` restart#420 · CI 4-green `28208230871` · migration `2026-06-26-p19-b6-6-price-liveness-seed.sql` applied (5 rows seeded/verified) · HTTP 200
**Issue:** RUNNING_ISSUES #236 → RESOLVED · cross-ref #295

---

> 🚨 **THIS BATCH DOES NOT TURN xStock ACTIVE TRADING ON, AND THE GATE HAS NOT FIRED IN PRODUCTION.** The xStock active fill path is DORMANT (`system_context.isEngineActive=false`) until P19-B7b. This is **forward-instrumentation** (§9.1): the gate is BUILT, wired at the open seam, unit-tested (22/22), and its config is seeded + resolvable on staging — but it governs no live fill and **no live block has been observed**. "Verified" here means *wired + config-resolvable + unit-tested*, NOT "fired against a real fill." It becomes load-bearing only at B7b turn-on.

## What it is

reorg-B4a's C3 shipped a freshness gate + a clock-based liquid-fill-window (since retired, #295) + a silent-stall watchdog. #236 is the hole those leave: on a US-equity **holiday / half-day / LULD halt / exchange glitch**, the 24/5 xStock token feed keeps emitting fresh snapshots with depth quoted (`captured_at` fresh → freshness passes; `bid/ask/qty>0` → depth gate can pass), but the underlying is closed so the **traded `last` is frozen** — both gates pass and a fill would land on a dead-but-quoted book at a stale reference price. B6.6 adds the **price-discovery-liveness gate**: at the engine open seam, immediately AFTER the depth gate (depth-first), xStock-only, fail-closed — it requires this token's `last` to have actually CHANGED ≥ `min_moves` times within the trailing `window_ms` before a fill is permitted.

## Objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Evidence-based threshold | ✅ YES | Window **45 min PINNED** from 3 weekday RTH sessions of `xstock_spot_ticker_snap`. Measured at the real admission floor (depth ≳$2K = strong_trend `lq_min=33`): worst admitted in-RTH inter-trade p99 = EWN 68m / EWP 50m / TOTL 42m (deep-but-slow ETF tokens) vs every genuinely-active name ≤20m. See pre-audit §0. |
| OBJ-2 | The liveness gate (pure, tested) | ✅ YES | `xstock_spot/price-liveness.ts`: pure `assessPriceLiveness` (reason taxonomy no_data/sparse_snapshots/flat_last/live), `getRecentLastMoveStats` (index-bounded windowed read + Promise.race timeout-fail-closed), never-throws orchestrator. 22 unit tests. |
| OBJ-3 | DB-resolved config (fail-closed) | ✅ YES | `module_constants price_discovery_liveness` / `xstock_spot` (window_ms=2,700,000, min_moves=1, min_snaps=5, query_timeout_ms=2000, enabled=true) + `resolvePriceLivenessConfig` (missing/mistyped → null → block, 60s cache). Migration + rollback (OUT) + MANIFEST. 5 rows verified on staging. |
| OBJ-4 | Wire-in (fail-closed + observable) | ✅ YES | `paper-execution-engine.ts` open seam, xStock-only, AFTER the depth gate (depth-first by structure). Block → `recordDepthGateBlock` (distinct reason-bucket) + `recordOpenFailed(...,'LIVENESS_GATE',...)` into the I3 invariant. `'LIVENESS_GATE'` added to `OpenFailStage`. Never throws. |
| OBJ-5 | Isolation / no regression | ✅ YES | Freshness gate, depth gate, stall watchdog, `liquid_fill_window_*` keys all unchanged. tsc baseline OK no-regress (paper-execution-engine 3→1). Full unit suite 2043 pass; the 9 failed files are pre-existing env-only DB-connection failures — **proven by reverting my 4 files and re-running: identical 9-fail/160-skip on base**. |
| OBJ-6 | B7b gate-#13 formalized | ✅ YES | PHASE_19_PLAN §1 board (B6.6 closed) + §5 decision log + §6 gate-11 GREEN + gate-13 (xStock-liveness half GREEN). |

## The key design decisions (3-way consensus)

- **Placement (Langston-approved Option B):** the open seam beside the depth gate, NOT dispatch. #236's text was internally split ("before a fill" vs "piggyback the freshness read"); liveness is a *fill-time* property and the threat is a FILL on a dead book, so it belongs at the seam that opens the position, co-located with the depth gate (the other half of #295's "is the book real" guard), depth-first, on the same telemetry path.
- **Window = 45 min, single, NOT tiered — justified by type-II frozen-book detection, not "p99 margin".** The raw per-symbol in-RTH tail spans secs→59m and would overlap holiday flatness, but the upstream `lq_min` gate (38/33) removes the unseparable shallow names before the seam. Among names that actually reach liveness (depth ≳$2K), the active cluster (≤20m) and any dead state (hours) separate cleanly under one window. Langston's two Step-2 replies diverged 45-vs-60; the multi-day measurement resolved it: **60 is a dead middle** — it doesn't rescue EWN (68m quiet-day p99 > 60), so it buys nothing while being strictly worse for the type-II case (a frozen-but-quoted book where liveness is the ONLY gate — feed ON, `captured_at` fresh, depth green). Under the fail-safe asymmetry (false-block = miss one slow-ETF fill, near-zero cost; stale fill into a frozen book = real loss), tighter dominates.
- **GOTU residual (Langston catch):** GOTU (33m worst-day p99, ~$2.3K depth) PASSES the 45m window at 1.36× margin — the lone admitted name not excluded. Accepted residual, NOT a window change (moving it would clip the active cluster); bounded by construction (strong_trend-only admission + the 2× depth-sufficiency cap clips a ~$2.3K book to ~$1.1K fillable). Homed #391.
- **Gate SEMANTICS:** liveness gates on THIS token's Kraken-book price-discovery cadence, NOT "is ARCA open." A 24/7-traded liquid token (MU/NVDA) PASSES during a US holiday — correctly, since the paper fill executes on Kraken's live book. "Holiday" is the motivating case, not the mechanism.
- **No "holiday-exempt" config flag** — a flat-`last` holiday book is the precise block condition; an exemption would reopen the hole.

## Langston Step-4 — APPROVED, no code changes. Non-blocking notes folded into governance:
1. `recordDepthGateBlock` now aggregates BOTH gates (its name says "depth") → stated explicitly in SYSTEM_MANUAL §7 (read liveness blocks by their `flat_last`/`no_data`/`sparse_snapshots`/`liveness_*` reason-bucket).
2. **Promise.race orphaned-query residual** — the JS-side timeout rejects but doesn't cancel the server-side query. Fail direction correct + harmless at per-open frequency; the depth gate has NO timeout at all, so liveness is strictly more defensive. **Named §13 home: #391** (accepted for B6.6; revisit trigger = a post-B7b timeout cluster + pool pressure → replace with a transaction-scoped `SET LOCAL statement_timeout` that cancels).
3. `msSinceLastMove` vestigial at `min_moves=1` — correct future-proofing for a tiered min_moves. Left.

## Verification (Step-7, forward-instrument)
- CI run `28208230871` = 4-green. Deploy restart#420: `db:migrate` applied the migration cleanly ("1 pending → ✓ applied"); psql confirms all 5 `price_discovery_liveness/xstock_spot` rows with correct values/types (Langston independently re-verified all 5 resolve live at Step-8); HTTP 200; no price-liveness/boot errors. No UI surface (backend fill-safety gate). **No live fill or live block observed — the path is dormant; this is the §9.1 forward-instrument bar.**
- **★ HONESTY CORRECTION (Langston Step-8 catch, co-signed):** the "no price-liveness/boot errors" check above was a GATE-SCOPED grep (liveness/B6.6/boot markers), NOT a full `error.log` scan. A full scan surfaces a PRE-EXISTING, unrelated live flood — `[11.0E.1][VTS] Strategy execution failed: ReferenceError: setNullReason is not defined` (64,494 occurrences, crypto VTS detect path, from the reorg setNullReason-threading, NOT B6.6) — homed as **RUNNING_ISSUES #395** + a dedicated `B-VTS-SETNULLREASON` batch that preempts B6.7. B6.6's own seam is clean; the narrow-scan wording is corrected here for the record.

## Files changed
`server/asset_classes/xstock_spot/price-liveness.ts` (NEW), `server/services/paper-execution-engine.ts` (open-seam wire-in), `server/services/rtb-metrics-service.ts` (`LIVENESS_GATE` OpenFailStage), `drizzle/migrations/2026-06-26-p19-b6-6-price-liveness-seed.sql` (+ rollback OUT, + MANIFEST), `server/tests/unit/p19-b6-6-price-liveness.test.ts` (NEW, 22).

## Governance files changed
SYSTEM_MANUAL.md (§7 fill-safety CONTENT — the liveness gate + semantics + the recordDepthGateBlock-aggregates-both-gates caveat + open-edge), SYSTEM_IMPACT_MAP.md (S20 = `price-liveness._cache` singleton + assessor in the liveness/singletons registry), RUNNING_ISSUES.md (#236 RESOLVED; #391 + #392 created; #391 extended with the GOTU watch + Promise.race residual), BATCH_CATALOG.md, PHASE_HISTORY.md, PHASE_19_PLAN.md (§1/§5/§6), this report, MEMORY_CC_B mirror, Langston `/home/langston/MEMORY.md` (§10.b).

## Open follow-ups (homed)
- **#391 (B7b):** post-B7b in-RTH `flat_last` block-rate tuning + null-config/spike alert + GOTU-class loose-admission watch + the Promise.race orphaned-query residual.
- **#392 (Phase-19 fill-safety follow-up):** a deterministic US-equity holiday/half-day calendar predicate as before-the-fact defense-in-depth (complements behavioral liveness, which catches the unscheduled halts a calendar can't).

**Status: CLOSED pending Kyle's acknowledgment.**
