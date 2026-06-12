# PHASE_19_PLAN.md — Phase 19: Paper Mode Audit & Debug — RUNNING PLAN

> **🔄 RUNNING GOVERNANCE DOCUMENT (Kyle directive 2026-06-12).** Tier-1 during Phase 19: updated after **EVERY Phase-19 batch AND sub-batch** — sequence position, per-item status, decisions taken. Created 2026-06-12 at phase kickoff (Claude New + Kyle planning session). Langston sequence review: **PENDING** (dispatched 2026-06-12).
>
> **One-home rule:** this doc owns Phase-19 **sequencing + live status + phase-scoped decisions**. Item DETAIL stays homed in `POST_AUDIT_ROADMAP.md` §3.2 (locked items 19-1…19-20, §19.6.x, 19.x) — entries here pointer to those anchors, never duplicate them. Batch-level detail lives in the normal scope/completion files per CLAUDE.md §2.
>
> **Retire from Tier 1 at Phase-19 close** (becomes a historical record).

---

## §1 — STATUS BOARD (update every batch/sub-batch)

| Seq | Batch | Roadmap items absorbed | Status | Completion report |
|---|---|---|---|---|
| P19-B1 | Test-suite cleanup | §16.7 + TEC.b strict-throw restore (parked 2026-06-09) | **NEXT — first batch** | — |
| P19-B2 | Live-mode build-approach decision | 19-18 (reshaped — see §3.2) | queued | — |
| P19-B3 | Known-broken active-path repairs | 19-6 (#137) + 19-10 (#139) | queued | — |
| P19-B4 | xStock wire-in (merged) | 19-1 + 19-7 (#92) + 19-8 residual latency check + B3.2 active-path strategy gates | queued | — |
| P19-B5 | Data-capture completion | 19-3 (§19.0.5 remaining half) | queued | — |
| P19-B6 | Daily loss-budget kill switch | 19-4 (§19.0.B — Kyle: build it, cheap insurance) | queued | — |
| P19-B7 | **THE SWITCH-ON** + paper pipeline tabs + results dashboard | 19-2 + Kyle UI directives (§4) | queued | — |
| P19-B8 | Shadow-trade layer | 19-17 | queued | — |
| P19-B9 | Paper trading run + audit | 19-11 + 19-12 (AMR shadow→active ~1 week in) | queued | — |
| P19-B10 | Performance + exit verification | 19-13 + 19-14 (§19.3.5; absorbs exit-protection proving — see §3.4) | queued | — |
| P19-B11 | xStock safety additions | 19-9 (entry-side failure modes) + 19-16 (sector clustering) | queued | — |
| P19-B12 | Diagnostics + internal-health monitoring | §19.6 + §19.6.6 (long-tail spills to Phase 20 §20.4.5) | queued | — |
| P19-B13 | Stock-characteristics data feeds | 19-15 (low urgency — slot flexibly late) | queued | — |
| P19-B14 | Boot Readiness Coordinator | 19-5 / 19.x — **CONDITIONAL** (boot-ordering half only; runtime-monitor half lives in B12 per §19.6.6) | conditional | — |

**Already done before kickoff (pulled forward into the Interphase 24→19 plan):** 19-19 AMR body (✅ 2026-06-12, in shadow; brain = Phase 25) · 19-20 decision-provenance capture (✅ 2026-06-08) · 19.0.C tiered fee model (✅ 2026-06-11) · per-asset-class regime 4.7 (✅ 2026-06-11) · scan-stall 4.6 (✅ 2026-06-12).

**Parked (not Phase 19):** 19-17b `live_engine_enabled` numeric-1 flip note → Phase 21 go-live checklist.

---

## §2 — THE AGREED SEQUENCE (locked with Kyle 2026-06-12; Langston review pending)

Ordering rationale: clean test background first (B1), then the early design decision that shapes paper plumbing (B2), then de-mine the known-broken path (B3), then connect xStock (B4), then the two hard switch-on preconditions (B5 capture, B6 safety net), then the flip with its displays (B7), then the learning multiplier (B8), then the long run that IS the phase (B9), with verification (B10) and xStock safety (B11) proving inside it, diagnostics hardening at the end (B12) to protect the Phase-25 calibration run, B13 slotting wherever convenient late, B14 only if triggered.

Exit criteria (roadmap §3.2 expected outcome): stable, debugged paper-trading system generating real decision data for Phase 25 calibration; diagnostics layer live; all components validated.

---

## §3 — RECONCILIATION RECORD (2026-06-12 kickoff walk — what changed vs the roadmap catalog)

Kyle directive: walk the draft sequence item-by-item against ACTUAL completion state, code-verified, not roadmap-trusted. Findings:

### 3.1 STALE — already done, removed from the plan
- **19-8 xStock real-time pricing — DONE in substance.** The roadmap line ("stale REST polling") is outdated: B74's `equity-spot-archiver.ts` holds a persistent WS to `wss://ws-equities.kraken.com` (ohlc interval-1 + ticker channels → `xstock_spot_ohlc_1m` + `xstock_spot_ticker_snap`); no REST polling in the live flow. **Residual folded into P19-B4:** verify the ingest→DB→scanner-read hop is fast enough for active execution (direct-stream read if not).

### 3.2 RESHAPED — smaller than written
- **19-18 live-mode build approach.** The Item-4 separation (2026-06-10) already cleaved VTS/paper/live into standalone systems with live scaffolding hard-gated 409 until Phase 21. Remaining question is narrower: how much of paper's engine the live build reuses. Still early (B2) because it shapes paper plumbing care.

### 3.3 MERGED (Kyle approved 2026-06-12)
- **19-1 + 19-7 are the same work** → single batch P19-B4. The B79.0n umbrella (16 sub-batches, all CLOSED 2026-05-27) did ALL per-class plumbing but deliberately deferred the final connection (umbrella items #14 WIRE-IN / #16 flip). Code-verified gap: xstock scanner routes only to VTS (`eval-cycle.ts` → `registerOpenVtsTrade`, never RTB); `signal-orchestrator.ts` evaluates the FX5/crypto pool only. P19-B4 contents: scanner→orchestrator dispatch with `assetClass='xstock_spot'` (#92), activate the deferred canary log + outcomeFeedback EMA store (EXECUTION/RTB/ORCHESTRATOR deferrals), RTB Phase-4 `SET NOT NULL` migration (zero-null gate), **xstock 0.50 pattern-pool-cap placeholder validation (HARD pre-flip gate, RUNNING_ISSUES #153)**, pricing-latency check (3.1), B3.2 active-path strategy gates (pending task — config now, calibrate Phase 25).

### 3.4 STALE-ish — built, only proving remains
- **Paper exit protections (draft item 7) — built.** `paper-execution-engine.ts:953` consumes `evaluateTECExit` with per-asset-class config (B79.0n.TEC per-class `break_even_enabled`, trail multipliers, moonbag caps); paper loop independent of VTS. Survives only as the prove-on-real-fills half of P19-B10 (19-14/§19.3.5).

### 3.5 HALF-DONE — reduced scope
- **19-3 data capture (§19.0.5).** EXISTS: SQE rejects (`vts-runner.ts:3755`, xstock `eval-cycle.ts:657`), strategy_internal, admitted hooks (orchestrator:1047 dormant; VTS; xstock). MISSING (= P19-B5): fx5 pre-filter reject rows, RTB TTL/stale rejects (currently silent deletes), proper TCL hook at trading-bootstrap, **paper-engine admit hook (engine writes nothing to `signal_eval_archive` today)**.

### 3.6 CONFIRMED REAL — as written
- **B1:** 59 known stale test failures (~12 files: cost_telemetry, net_expectancy, dynamic_sizing, b73-exit-replay, b72-dbs-routing, b70-run-mode, b79-0m-b2-pattern-filter set…) + TEC.b strict-throw fold-in (~15-20 stale TEC mocks).
- **B3:** #137 = 54 files / 231 Phase-19-tagged errors + routes/storage majority share; baseline `phase_tag` audit itself unfinished (all 66 files still "TBD") → B3 opens with a triage pass. Named landmines code-confirmed: Phase10TradeRecord builder leaves ~13 archive-read fields unset (`vts-runner.ts:1543` vs ~1882-1921); SQESignalInput `ngc`/`riskScore`/`profitRate` read-never-set with the throw swallowed by `.catch()` (`ready_to_buy_service.ts:1595+`). #139 = 9 throwing `resolveAssetClass` sites remain in vts-runner (4 already safe).
- **B6:** confirmed no daily-loss service exists; `tripKillSwitch` manual-only (`guardrail-policy.ts:442`).
- **B8, B9, B10, B11, B13:** stand as cataloged. **B14:** conditional, boot-ordering half only.

---

## §4 — KYLE UI/DISPLAY DIRECTIVES (2026-06-12 — binding; land with P19-B7)

The trading page's pipeline tabs are rebuilt for PAPER mode (same pattern later for live) — the three systems are now separate, so paper needs its own equivalents of the VTS-tracking tabs:

1. **Filter Diagnostics — crypto** (paper)
2. **Filter Diagnostics — xStock** (separate tab)
3. **Ready-to-Buy queue**
4. **Open trades + Closed trades tables — MIRROR the VTS equivalents** (Kyle 2026-06-12 evening: "pretty much just mirror what we have in the VTS")
5. **Surviving-pairs table — KEEP** (all pairs that passed filters)
6. **Results & outcomes dashboard (NEW — Kyle 2026-06-12 evening):** paper trades nonstop unless intentionally stopped → needs a cumulative results/outcomes view; mine the current dashboard's tables for ideas at design time.
7. **VTS-indicator UI placement** (pending Kyle item) — folds into this same design pass.

Timing decision (Kyle 2026-06-12): tabs/dashboard built **alongside the switch-on batch (P19-B7)** — shells can come with wire-in work; they populate the moment trading flips on, doubling as visual verification (§9.3 UI-verify applies).

---

## §5 — DECISION LOG

| Date | Decision | Source |
|---|---|---|
| 2026-06-12 | Plan doc created as running Tier-1 (during Phase 19) governance doc; CLAUDE.md §3 tier list updated | Kyle directive |
| 2026-06-12 | Merge 19-1 + 19-7 into P19-B4; retire draft item 7 into P19-B10; 19-8 marked done-in-substance with latency residual | Kyle approved CC reconciliation |
| 2026-06-12 | Paper pipeline tabs + results dashboard ride with P19-B7 (switch-on) | Kyle |
| 2026-06-12 | Open/Closed paper trade tabs mirror VTS equivalents; results dashboard sourced from current dashboard ideas | Kyle |
| 2026-06-12 | Loss-budget kill switch (19-4, roadmap-optional) WILL be built pre-flip | Kyle ("cheap insurance") |
| 2026-06-12 | First batch = P19-B1 test-suite cleanup | Kyle |

---

*Maintained by the implementing CC session. Update §1 status + §5 decisions every batch/sub-batch close; re-sequence only with Kyle's sign-off recorded here.*
