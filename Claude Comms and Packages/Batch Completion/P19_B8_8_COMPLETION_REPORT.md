# P19-B8.8 — COMPLETION REPORT: sizing-fallback fail-loud sweep

Owner: CC-B · 2026-07-16 · change-class: non_architecture (declared Step-1, held)
Head `7de34c03d` · CI 4-green run `29523500782` (TypeScript Check / Test Suite / Build /
Docker Build all success) · NO migration · deployed + engine CONTINUE (`paper_-i05tFriAB`)
Langston: Step-1 PASS (5 conditions) · Step-2 PASS (all discharged) · Step-4 APPROVED
Origin: #516 (B8.7 home-not-fold ruling), PULLED FORWARD per Kyle's fix-on-find directive.

## Objectives (from the Step-1 7-item build list) — all YES

1. **Sizer fail-loud** — YES. `active-position-sizing.ts`: both fallback layers deleted
   (`||'1.50'`/`||'10.00'`/null→100 AND the `safe*` re-defaults). Per-field validate;
   any missing/unparseable/non-positive → `[P19-B8.8][SIZING_GUARDRAIL_READ_FAIL]` +
   `invalidResult` (→ engine `SIZING_INVALID` path) + rail. Evidence: 16 unit tests
   (3 fields × 5 bad shapes + whole-row-null) + valid-row control.
2. **Rail** — YES. `rtb-metrics-service.ts`: consecutive counter, threshold 10 → ONE
   `breakage` alert (dedupe_key `sizing-guardrail-read-fail`), reset+unlatch on success,
   alert write via dynamic import off the hot path. Langston ruling: rail-in-sizer is
   correct ("the only site that knows a read failed"), do NOT purify. 2 tests.
3. **guardrail-settings raw pass-through** — YES. Field fallbacks deleted: exposure
   `'25.00'`, position `'30.00'/'10.00'`, LPCP trio, kill-switch `'7.00'` (:194 —
   surfaced at Step-2, would have been a half-swept function). Throw-on-missing-row
   (:152-154) remains the loud gate.
4. **trade-safety fail-closed** — YES. `checkPositionSizeCap` + `checkMaxTotalExposure`
   refuse loudly on unreadable caps (new `GUARDRAIL_READ_FAIL` in
   `TradeSafetyResultCode` — the type member the bench tsc forced). The B72.1
   guardrail_defaults fallback leg retired (:400 diagnostic use kept — not orphaned,
   Langston-verified). Dormant LPCP block annotated in-code → #518.
5. **goal-feasibility** — YES. The loosening `||'100.00'` (+ `'3.00'`/`'12.00'`) →
   loud BLOCK naming the unreadable fields. 2 tests.
6. **routes** — YES. The PHANTOM GUARDRAILS ROW (:1336-1359, nanoid id + all risk
   fields hardcoded, served as if real — the worst member) → honest 404
   `GUARDRAILS_NOT_CONFIGURED`. Test-endpoint `||'7.00'/'75.00'` → 422 refuse.
7. **m5e** — YES (+#515 rider). Alias-guessing + `{8,40,12}` fabrications → null-refuse;
   snapshot skips loudly; summary THROWS — caught at `runComparisonPhase` :355-369,
   run fails contained (`phase='FAILED'`), no unhandled rejection (Langston
   non-blocker 1, verified in code pre-push).

## Verification evidence
- **Bench**: tsc baseline OK (after the type-member fix); vitest 2300 passed / 2 failed
  = the known pre-existing b79-0n routing pair (2279 baseline + exactly the 21 new tests).
- **CI**: 4-green on head (`29523500782`).
- **Deploy**: BUILD_EXIT=0, HTTP 200; post-deploy logs: ZERO
  `*GUARDRAIL_READ_FAIL` events (healthy DB = correct silence), engine cycling.
- **Positive controls**: `/api/guardrails?mode=paper` → 200 with the REAL row
  (1.95/6.67/100.00/15); production rows both modes queried populated (Step-2 (A)).
- **§9.3 UI (Claude-in-Chrome, staging)**: Paper page live — ACTIVE, Open Trades/Slots
  15/15 (honest guardrails-keyed slots), real balances/breakdowns, no white-screen.
  **Honest boundary**: the 404 branch itself was NOT UI-triggered — doing so requires
  deleting the live guardrails row (breaking live sizing to prove a guard — refused by
  design). Langston accepted the three-consumer code trace (target-daily-goals guards
  on truthiness; use-override-state/ai-transparency are key-list/invalidation only).

## Step-8 finding (out of scope, homed): #520 — the engine SILENTLY HALTS on every
process restart: `[41F-B][RECOVERY]` orphan-closes the running session at boot (18:22:37,
~5 min post-deploy) and the R9.3.HF-4.FIX auto-resume never wins ("Session missing
required fields" heartbeat skip seconds prior). Every deploy today shows the same
stop→manual-continue pattern in `active_engine_sessions`. Folded into #512
B-STAGING-LIVENESS-WATCH (Friday 2026-07-18) as a named second objective.
Also clarified during Step-8: the two 16:26Z xstock `closed_trades` rows are B7.2c
`never_filled` maker pendings (NULL pnl correct — no position existed); **B8.5 AC2
(first REAL xstock close) is still an open watch**; 8 xstock + 7 crypto positions live.
FYI noted to crew: DB at 136 GB is within STORAGE_POLICY's known envelope (pre-Wave-D
quote-snapshot era; ~6× reduction lands 2026-08-01); the dashboard banner's "10 GB
limit" is a stale display threshold.

## Governance files changed
`BATCH_CATALOG.md` (B8.8 row) · `PHASE_HISTORY.md` (B8.8 block) · `PHASE_19_PLAN.md`
(§5 decision log) · `RUNNING_ISSUES.md` (#516 RESOLVED; #518/#519/#520 OPENED+homed) ·
`SYSTEM_IMPACT_MAP.md` (§6.3 DSE degrade-contract content update — Langston condition E)
· SysManual judged N/A (no strategy/regime/math/pipeline-architecture change; the
degrade semantics is component behavior = SIM scope — judgment applied explicitly per
§9 anti-pattern) · MEMORY_CC_B + repo mirror · this report.
