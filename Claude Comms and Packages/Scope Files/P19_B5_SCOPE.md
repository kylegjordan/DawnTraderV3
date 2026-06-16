# P19-B5 — Scope (data-capture completion for the paper-active path)

**Batch:** P19-B5 · **Date:** 2026-06-16 · **Author:** Claude New (CC-B)
**Run mode:** AUTONOMOUS with Langston (Kyle: proceed in plan sequence; this is the next scheduled batch after P19-B4 closed). Step-1 scope for your ACK; Step-2 pre-audit will nail exact per-site code (function names, line numbers, the existing B70 writer signature).
**Sources:** `POST_AUDIT_ROADMAP.md` §19.0.5 (item 19-3, HARD precondition before paper-active turns on) + RUNNING_ISSUES #94 (xStock macro-snapshot capture precondition) + #86 (Q-D probe scope decision).

> 🚨 **§9.1 SCAFFOLDING-VS-FUNCTIONAL:** like the existing admitted-path capture hook, every hook in this batch ships **DORMANT** — it only fires once paper-active trading turns on (B7b). B5 does NOT turn on capture; it makes the capture COMPLETE so that when the paper run happens (B9) it produces a dataset as rich as the VTS run. B5's own verification is that the hooks compile, are wired, and fire in a synthetic/dry-run test — NOT the 24h soak (that lands at the B9 run).

## Why this batch (plain): the capture gap
B70 shipped full capture for the VTS path (the only active path back then). The admitted-path hook for the active pipeline landed but is dormant. When paper-active turns on, the **reject** side + the **paper-engine open** side are NOT yet captured — so the paper run would record LESS than the VTS run that preceded it, which defeats the point. B5 closes that gap.

## Objectives
- **OBJ-1 — FX5 pre-filter reject capture.** Every pair the FX5 scanner rejects pre-strategy (spread / volume / IMF / family-eligibility / etc.) writes a `signal_eval_archive` row with `reject_stage='pre_filter'` + `gate_decision.reason` naming the stage. ~10 reject sites in `fx5-scanner.ts`. (Today rejection is implicit — absence from the archive — which is lossy.)
- **OBJ-2 — Active-path reject hooks (SQE / RTB / TCL).** Mirror the existing admitted-path hook at the three reject branches: `signal_quality_evaluator.ts` FinalScore-floor fail → `reject_stage='sqe'`; `ready_to_buy_service.ts` stale / TTL-expired → `reject_stage='rtb'`; `trading-bootstrap.ts` TCL cooldown / dedup → `reject_stage='tcl'`.
- **OBJ-3 — Paper-execution-engine admit hook.** On a paper open, write a `signal_eval_archive` row (`mode='paper_sim'`, `source='paper-execution-engine'`) so the open→close pair joins cleanly by `trade_id` (today the engine has only the `closePosition` exit hook).
- **OBJ-4 — #94 xStock macro snapshot at decision time.** Every xStock decision record carries the equity-macro snapshot (VIX + DXY z-scores at decision time) — the feed already exists (`amr-equity-feed`); B5 wires the snapshot onto the decision-record capture so Phase-25 item 25-7 (the macro modifier) has build material. **CAPTURE ONLY — the modifier BUILD stays Phase-25 (Kyle 2026-06-13).**
- **OBJ-5 — #86 Q-D probe scope DECISION.** Decide (with Langston) whether the dedicated `xstock_qd_probe_history` table (continuous quote-depth probe for friction-modeling distributional evidence) is built in B5 or homed to its own batch. This is a scope decision + (if in-scope) a migration + a capture hook; it gates downstream friction-extraction work. **Recommend: DECIDE the home here; build only if it's a thin add — otherwise its own batch.**
- **OBJ-6 — Verification.** All hooks try/catch-wrapped, never block the host path (same pattern as B70 main). Bench: tsc no-regression + vitest (new hook-fires-on-synthetic-input tests). The non-zero-across-4-tables soak is the B9 run's job (cross-referenced, not B5's gate).

## Open questions for Langston
- **Q1 (sub-batching):** B5 is ~200–400 lines across 5 files + #94 + the #86 decision. Split it (e.g. B5a = §19.0.5 capture hooks, B5b = #94 macro snapshot + #86 decision), or one batch? Recommend your call after you see the surface.
- **Q2 (#86):** build the Q-D probe table in B5, or home it to its own batch? (Recommend: home decision here; build only if thin.)
- **Q3 (reject-row shape):** the admitted-path hook's row schema — should reject rows reuse it 1:1 with `reject_stage` set + null admit-only fields, or a leaner reject-row variant? (I'll bring the exact existing schema in Step-2.)
- **Q4 (dormancy):** confirm these all ship dormant + gated like the admitted hook (no fire until paper-active), so B5 carries zero live risk — same as the B70 admitted hook.

## Next
On your ACK → Step-2 pre-audit (exact sites, the B70 writer signature, SIM data-capture section, the xStock decision-record write point for #94, the #86 current state) → implementation.
