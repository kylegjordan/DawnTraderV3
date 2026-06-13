# P19-B2 COMPLETION REPORT — Live-Mode Build-Approach Decision (+ legacy live-stub removal)

> **Phase 19 · Batch 2 · DESIGN/DECISION batch + a code removal Kyle directed mid-batch.** Closed 2026-06-13. Author: Claude New (CC-B). Reviewer: Langston (Opus 4.8). Decider: Kyle.

## 🚨 SCAFFOLDING-VS-FUNCTIONAL (§9.1)
This batch does NOT make live trading functional. **Live remains hard-gated (HTTP 409 `LIVE_ENGINE_PHASE21_GATED`) until Phase 21.** P19-B2 produced a ratified build-approach decision, a verified paper-execution-target decision, homed Phase-19 follow-on items, and removed a legacy stub. No live capability was built or enabled.

## PREVIOUSLY-STATED-VS-NOW (§9.2)
- **Paper execution path: PREVIOUSLY (CLAUDE.md rule 20) "paper mode routes through Kraken's paper order system." NOW: Kraken has NO spot paper-fill system; paper = Kraken-vetted (validate=true) high-fidelity INTERNAL fill. REASON: exhaustive verification — Kraken hosted demo is futures-only.** (rule 20 corrected this batch.)
- **P19-B2 scope: PREVIOUSLY "code-free decision batch." NOW: includes a 593-line legacy removal. REASON: Kyle directed deleting the `live-trading-service` stub now rather than leaving it lingering.**
- **Pre-flight gate #8 (#213): PREVIOUSLY a B7b 5-min inert-check. NOW resolved at B2 by physical deletion. REASON: removing the routes is strictly better than confirming them inert.**

## Scope objectives → outcomes

| # | Objective | Result | Evidence |
|---|---|---|---|
| 1 | Decide how much of the paper engine the live build reuses | **YES — Option A (reuse-by-extension)** | Engine already mode-parametric (`PaperExecutionEngine` `mode:'live'\|'paper'`); only 2 order seams diverge. CC+Langston+Kyle ratified. |
| 2 | Record the Phase-19 plumbing constraint the decision imposes | **YES** | §4 reframed to 2 order seams + 2 shared-path invariants (fill-lifecycle, balance-source); PHASE_19_PLAN §5 + B3/B4 rows. |
| 3 | Home the surfaced follow-on items concretely (§9.4) | **YES** | `OrderPlacer` port → B3 first deliverable; fill-fidelity model + rate-limit lane + split-brain audit → B4; Kraken institutional inquiry → RUNNING_ISSUES (non-blocking). |
| 4 | Resolve the paper-execution TARGET (Kyle requirement: route paper through Kraken, not own sim) | **YES — Kraken-vetted internal high-fidelity fill** | Exhaustive verification (Kraken has no spot paper-fill); Kyle pre-authorized "go with the recommendation if the investigation confirms," which it did. rule 20 corrected; rule-14 log entry added. |
| 5 | Delete the legacy `live-trading-service` stub (Kyle directive) | **YES — DELETED, verified clean** | commit 59d501fc4; tsc+vitest green; Langston Step-4 APPROVE; deployed + first-pass verified (404 on removed routes, HTTP 200, no module errors). |
| 6 | Live stays 409-gated | **YES** | Modern gated path untouched; verified on staging. |

## The decision (Option A — ratified by CC + Langston + Kyle)
Live reuses the `PaperExecutionEngine` by extension (same class, `mode='live'`), swapping only the two order-placement seams (open `:2196`, close `:1104`) for real Kraken orders. A separate live engine was rejected: it would fork unproven copies of the exit/RTB/sizing/monitoring code Phase 19 exists to harden (NO-PATCHES). Isolation is already provided by the 409 gate + the seam boundary + the per-mode storage partition.

**Divergence surface (Langston reframe):** 2 order seams + 2 shared-path invariants that must stay live-swappable through B3–B6 — (i) **fill-confirmation lifecycle** (paper's synchronous atomic fill vs live's async/partial/rejectable; the #1 named seam), (ii) **balance/equity source for sizing** (paper-simulated vs real Kraken equity).

## Paper-execution-target decision (Kyle + investigation-confirmed)
Kraken offers NO spot paper-fill system for ordinary users (futures-only demo; spot `validate=true` validates-but-never-fills; institutional spot test-env is onboarding-gated + unconfirmed-to-fill; even Kraken's own March-2026 CLI does spot paper LOCALLY). Kyle's Sept/Oct-2025 memory maps to the FUTURES demo amid heavy 2025 derivatives marketing. **DECISION: paper = internal high-fidelity fill, made Kraken-vetted** — every paper order sent with `validate=true` (real-venue vetting) + priced off real Kraken WS + honest fill model (real tiered fees + L2-depth slippage + partial-fill realism, so paper EV ≈ live EV — Langston's #1 fidelity must). Institutional onboarding = non-blocking RUNNING_ISSUES inquiry, NOT a gate.

## Simultaneity requirements (Kyle)
Paper is always-on (full pipeline, unlike VTS) and runs ALONGSIDE live once live is fixed; per-mode labels; each mode its own page (filter-diag / RTB pool / surviving-pairs / open+closed tables); no mutual interference; manageable strain. Does not reopen Option A. Surfaced (Langston, homed to B4): paper needs its own credential/rate-limit lane (validate traffic can't throttle a live order); a shared-singleton split-brain audit (RTB cooldown/portfolio-heat sharing is the worst leak) must pass before any Phase-21 co-run (distinct from + earlier than the Phase-21 strain re-eval).

## Legacy removal (Kyle directive + Langston Step-4 APPROVE)
`live-trading-service.ts` stub cluster removed: the 464-line stub + 4 orphaned `/live-trading/*` routes + dead `start_live_trading` approval branch + test-harness scenario + stale `ExitDecisionSource` member. **+6 / −593.** Verified: tsc baseline green (no regressions, no dangling import), vitest 1854/1854 (1 env-only file re-ran green), modern gated live path + top-bar UI untouched, zero client refs. Archived + logged in `DELETED_COMPONENTS_LOG.md` per the new never-leave-legacy-lingering policy.

## Verification
- **CI:** run **27469343597** — `completed / success` on head **59d501fc4** (all 4 jobs green).
- **Staging deploy:** pulled 59d501fc4, build clean, PM2 online; HTTP **200**; removed route `/api/live-trading/status` → **404**; boot log clean (no module-not-found).
- **Langston:** Step-1 design ACK (Option A consensus), addendum review (Kraken target + simultaneity + deletion, 3 conditions), Step-4 removal APPROVE (4/4 verified on staging).

## Governance files changed
`PHASE_19_PLAN.md` (§1 status + B3/B4 rows + §6 gate #8 + §5 decision log) · `CLAUDE.md` (rule 18 legacy-removal policy + rule 20 Kraken-paper correction) · `1-system-manual/DELETED_COMPONENTS_LOG.md` (NEW) · `1-system-manual/_archive/deleted-code/…removed` (NEW archive) · `server/services/utils/symbol-canonicalizer.ts` (KNOWN_NONEXISTENT_NAMES rule-14 entry) · `RUNNING_ISSUES.md` (#213 RESOLVED + #227 Kraken inquiry opened) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `P19_B2_SCOPE.md` · this report · MEMORY 3-way (truth + repo mirror + Langston) · Langston `/home/langston/CLAUDE.md` (legacy-removal rule). **SYSTEM_IMPACT_MAP.md: N/A** — the removed stub was an orphan never mapped in the SIM (verified — zero references), consistent with its dead status; no SIM change applies.

## Follow-on homes (§9.4 — concrete, recorded)
- `OrderPlacer` typed port + partial/rejected fill-result type → **P19-B3 first deliverable.**
- Kraken-vetted high-fidelity fill model + paper rate-limit lane + shared-singleton split-brain audit → **P19-B4** (audit must pass before Phase-21 co-run).
- Kraken institutional spot-test-env inquiry → **RUNNING_ISSUES** (non-blocking; future upgrade path only).

**NEXT: P19-B3 (known-broken active-path repairs #137/#139) — opens with the `OrderPlacer` port.**
