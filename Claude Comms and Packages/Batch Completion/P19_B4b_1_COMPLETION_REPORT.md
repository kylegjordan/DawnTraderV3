# P19-B4b.1 — Completion Report (paper fill fidelity: depth-walked fill + partial-open + #295 24/5 depth-sufficiency gate)

**Batch:** P19-B4b.1 · **Date:** 2026-06-16 · **Author:** Claude New (CC-B)
**Run mode:** AUTONOMOUS with Langston (Kyle directive — iterate the workflow to verified-complete + verified-correct; escalate only on no-consensus; thorough code/SIM/System-Manual audit). No escalation was needed — Langston APPROVE at Step-1, Step-2, and Step-4.
**Commit:** `b74526dc3` · **CI:** `27586477175` all-4-green · **Deployed:** staging restart#393 (HTTP 200, migration applied).

> 🚨 **SCAFFOLDING-VS-FUNCTIONAL (§9.1):** B4b.1 turns ON NO trading. The depth-walked fill + partials + the 24/5 depth gate ship **DORMANT** (active trading off until B7b). It also does **NOT** make the paper fill "Kraken-vetted" — the `validate=true` round-trip + the credential rate-limit lane are **DEFERRED to #296** (locked `kraken.ts`). B4b.1 delivers the **depth-fidelity core**; the venue-vetting half follows in #296, and the live exercise happens at B7b.

## §0 — PREVIOUSLY-STATED-VS-NOW (§9.2)
| Item | PREVIOUSLY | NOW | REASON |
|---|---|---|---|
| D2 "build the crypto depth feed" | from-scratch | the live WS `book` (depth=10) ALREADY exists; B4b.1 EXPOSED it (`getBookForFill`) + added a warmth assert | Step-1.a audit |
| xStock depth | "no feed → freshness-only fallback" | xStock HAS top-of-book `askDepthUsd` (already feeds LQ gates) → real depth-sufficiency gate (R1) | Step-2 audit |
| D4 validate round-trip | in B4b.1 | DEFERRED to #296 (needs the credential lane in locked `kraken.ts`) | Langston Q1 concur |
| partial CLOSE | implied | closes ALWAYS full-fill (R2) → no partial-close double-count | Step-2 trace + Langston Q-A |
| vitest count | (D5 1952) | 1979 (+ B4b.1's +37 tests) | new tests |

## Scope objectives
| Objective | Status | Evidence |
|---|---|---|
| **OBJ-1 — fill-grade per-class depth accessor + warmth assert** | **YES** | `execution/depth-source.ts` (crypto → `krakenWebSocketAdapter.getBookForFill` depth=10 + book-freshness stamp; xStock → latest `xstock_spot_ticker_snap` top-of-book + `captured_at` age); `assessWarmth` (present + fresh + ≥min_levels) + `assessSufficiency` (depth ≥ order×multiple), pure + fail-closed. Tested `p19-b4b1-depth-gate.test.ts` (10). |
| **OBJ-2 — depth-walked fill + partial-open + RNG-free + golden test** | **YES** | `execution/depth-walk.ts` (pure VWAP walk; `closeFillFull` full-fill+penalty); `order-placer.ts` rewritten (flat % → walk; open `partial`/`rejected`; close always `filled`). NO `Math.random` on the seam (C-Q5). Golden test `depth-walk.test.ts` (14) pins it to `calculatePriceImpact`. Engine open seam reassigns `quantity=_openFill.fillQty` (single point → all downstream uses filled qty; partial-open split-brain closed, hold #1). |
| **OBJ-3 — #295: retire RTH clock → 24/5 book-depth-sufficiency gate (both classes)** | **YES** | `_evaluateOpenDepthGate` at the engine open seam (crypto multi-level + xStock top-of-book), per-class DB-resolved `fill_depth_gate` fail-closed. RTH clock fill-gate removed from `active-dispatch.ts`; predicate + keys RETAINED for the watchdog (verify-before-cut). #295 CLOSED. |
| **OBJ-4 — governance + correctness close** | **YES** | SIM §9.14 + registry + System Manual §7 CONTENT updated; Tier-1 (BATCH_CATALOG/PHASE_HISTORY/PHASE_19_PLAN §1/§5/§6/RUNNING_ISSUES #295+#300/DELETED_COMPONENTS_LOG/MEMORY); completion report; CI green; sync gate 0/0. |

## Verification
- ✅ **Bench (C:\dev): tsc baseline gate no-regressions (404<494)** · **vitest 1979** (the only 2 "failures" are 5s load-timeouts that pass in isolation at 1.8s — confirmed flakes in files B4b.1 doesn't touch). +37 net B4b.1 tests.
- ✅ **CI `27586477175` all-4-green** on `b74526dc3` (Build / TypeScript Check baseline gate / Test Suite / Docker Build).
- ✅ **Deploy clean** — migration `2026-06-16-p19-b4b1-fill-depth-gate-seed.sql` applied (1 pending → ✓); pm2 restart#393 online; **HTTP 200**; boot scan: no depth-gate/depth-source errors, no throws, no `LIVENESS_SPLIT` (only the pre-existing `/home/runner` EACCES health-log path issue, unrelated).
- ✅ **DB verified:** 8 `fill_depth_gate` rows seeded (crypto 5000/3/3/50, xStock 15000/2/1/50); 2 `liquid_fill_window_*` watchdog keys RETAINED.
- ✅ **Measured evidence (Step-2):** crypto book staleness + 10-level depth from a live 12-pair WS sample (majors sub-second updates, depth $20K–$2M, thin moments $2–6K); xStock top-of-book depth from staging (`xstock_spot_ticker_snap` 101K snaps, p50 $28K, thin tail $150). Thresholds EV-justified, per-class DB-resolved.
- ✅ **Langston Step-8 non-blocking concern RESOLVED (benign):** the now-signed `slippageQuote` (can be negative on a favorable open) is consumed only by the signed `grossPnl − totalCost` formulas (engine :1229, routes manual-close :12221, `c5-financial-diagnostics.ts:194`) — a favorable fill correctly lowers cost. The one `Math.abs(slippage)` is in dead `slippage-fee-model` aggregate stats, off the active path. No clamp/non-negative assumption breaks.

## Langston gates
- **Step-1** ACK-with-conditions (spine accepted; Q1–Q5 + 2 holds folded into scope §7).
- **Step-2** PROCEED-with-conditions (R1 xStock-depth + R2 close-full-fill ratified; specific EV-justified seeds + the 3 concrete homes required).
- **Step-4** APPROVE — push it. Confirmed: depth-walk math + golden test; single-point filled-qty reassign; close full-fill + DB penalty + no magic %; fail-closed gate; the verify-before-cut watchdog retention; the deferred homes. Required Step-10 SIM + System Manual content (landed).

## Deferrals & homes (§9.4 — all concrete)
- **D4 validate round-trip + credential rate-limit lane → #296** (the dedicated locked-`kraken.ts` batch).
- **Dead paper-fill machinery sweep → #300 / P19-B4b.2** (numbered PHASE_19_PLAN §1 row, BEFORE B7b): cuts `realtime-paper-executor.ts`, the left-behind dup book-walk math, the dup `market-data-ws`/coordinator WS `book` connection; `pre-execution-validator` coordinates with #297.
- **B7b gate-#13** (PHASE_19_PLAN §6): per-class fill-quality gate required — crypto depth-sufficiency + xStock depth-sufficiency AND #236/B6.6 liveness.
- **#295 CLOSED** (cross-ref #236/B6.6).

## Governance files changed
`1-system-manual/`: SYSTEM_IMPACT_MAP.md (registry B4b.1 note + §9.14 depth-walk), SYSTEM_MANUAL.md (§7 depth-walk banner), RUNNING_ISSUES.md (#295 RESOLVED + #300 NEW), PHASE_19_PLAN.md (§1 B4b.1+B4b.2 rows / §5 decision / §6 gate-13), BATCH_CATALOG.md, PHASE_HISTORY.md, DELETED_COMPONENTS_LOG.md. `drizzle/migrations/`: seed + MANIFEST. `Claude Comms and Packages/`: scope, pre-audit, change list, this report. MEMORY (4-way).

## Next
**P19-B4b.2** (#300 dead-code sweep, before B7b) · **#296** (validate round-trip + credential lane) · **B6.5** (crypto resurrection) + **B6.6** (liveness gate) still hard-gate B7b. The depth-walked fill + the 24/5 gate are exercised live for the first time at B7b.
