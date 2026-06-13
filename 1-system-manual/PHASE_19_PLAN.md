# PHASE_19_PLAN.md — Phase 19: Paper Mode Audit & Debug — RUNNING PLAN

> **🔄 RUNNING GOVERNANCE DOCUMENT (Kyle directive 2026-06-12).** Tier-1 during Phase 19: updated after **EVERY Phase-19 batch AND sub-batch** — sequence position, per-item status, decisions taken. Created 2026-06-12 at phase kickoff (Claude New + Kyle planning session). Langston sequence review: **✅ APPROVED 2026-06-12** ("APPROVE the B1→B14 sequence as ordered — no re-sequencing required") with 4 required additions + 3 recommendations, ALL folded in same-day (B7a/B7b split §1, pre-flight checklist §6, disposition table §7, decisions §5).
>
> **One-home rule:** this doc owns Phase-19 **sequencing + live status + phase-scoped decisions**. Item DETAIL stays homed in `POST_AUDIT_ROADMAP.md` §3.2 (locked items 19-1…19-20, §19.6.x, 19.x) — entries here pointer to those anchors, never duplicate them. Batch-level detail lives in the normal scope/completion files per CLAUDE.md §2.
>
> **Retire from Tier 1 at Phase-19 close** (becomes a historical record).

---

## §1 — STATUS BOARD (update every batch/sub-batch)

| Seq | Batch | Roadmap items absorbed | Status | Completion report |
|---|---|---|---|---|
| P19-B1 | Test-suite cleanup | §16.7 + TEC.b strict-throw restore (parked 2026-06-09) | **✅ DONE 2026-06-13** — 12-fail/141-skip → **0/0 both environments** (1880/1880, 161/161 files); TEC.b strict LIVE (#141 closed, deploy-verified 4-class boot 29ms); bench=CI parity via Docker; #226 opened (tier separation); Langston APPROVE Steps 2+4, CONFIRMED Step 8 | `P19_B1_COMPLETION_REPORT.md` |
| P19-B2 | Live-mode build-approach decision | 19-18 (reshaped — see §3.2) | queued | — |
| P19-B3 | Known-broken active-path repairs | 19-6 (#137) + 19-10 (#139) | queued | — |
| P19-B4 | xStock wire-in (merged) | 19-1 + 19-7 (#92) + 19-8 residual (latency **+ WS staleness/reconnect fitness for execution** — Langston) + B3.2 active-path strategy gates + #153 0.50-cap gate + Kraken paper-order smoke test (Langston req. — here or B7 pre-flight) + B11-tagging decision (§5) | queued | — |
| P19-B5 | Data-capture completion | 19-3 (§19.0.5 remaining half) + #86 Q-D probe scope decision | queued | — |
| P19-B6 | Daily loss-budget kill switch | 19-4 (§19.0.B) — **reuse existing `dailyLossKillSwitchPct` knob + existing `tripKillSwitch` signature, no new constants (Langston); force-trip verification mandatory before trusting it** | queued | — |
| P19-B7a | Paper pipeline tabs + results dashboard (UI shells) | Kyle UI directives (§4) — built/reviewed against VTS-style fixture data, merged BEFORE the flip commit (Langston split — same calendar as B7b, separate diffs for fault isolation) | queued | — |
| P19-B7b | **THE SWITCH-ON** + observability T2 | 19-2 — gated on §6 pre-flight checklist; **staged per-class flip: crypto_spot first → confirm open→close clean → xstock_spot → rest** (Langston) | queued | — |
| P19-B8 | Shadow-trade layer | 19-17 | queued | — |
| P19-B9 | Paper trading run + audit | 19-11 + 19-12 (AMR shadow→active ~1 week into the RUN — §5 re-anchor) + **opening task: first-48h capture-completeness audit** (every B5 hook landing rows, esp. paper-engine admit — Langston req., #206 failure class) + #138 first-confluence watch | queued | — |
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
| 2026-06-12 | Langston review: APPROVE as ordered + 4 required additions (disposition sweep §7, Kraken paper-order smoke, B9 first-48h capture audit, AMR re-anchor below) + B7a/B7b split + staged per-class flip + B6 force-trip test — ALL ACCEPTED by CC, folded same-day | CC ↔ Langston consensus |
| 2026-06-12 | **AMR shadow-window RE-ANCHOR ratified:** roadmap 19-19 says shadow "first ~5-7 days of Phase 19"; correct reading = first ~week **of the paper-active RUN** (B9). Shadow against VTS-only flow proves nothing about the dials; the debug-confounder concern applies to the active run. Plan reading is canonical; recorded so roadmap/plan divergence is a decision, not drift | Langston (his original amendment) + CC |
| 2026-06-12 | **B11-timing contamination guard:** entry-side halt/earnings guards land AFTER xstock paper trading starts → either pull a minimal halt-check into B4 or tag all pre-B11 xstock trades for Phase-25 exclusion. **DECIDE AT B4 SCOPE**; record outcome here | Langston flag |
| 2026-06-13 | **#80 exit-strategy ablation xstock extension → Phase 25** (needs real fills; calibration-flavored) | **Kyle decision** |
| 2026-06-13 | **Phase-19 working-style directive:** every pre-implementation audit = thorough CODE-LEVEL audit; SIM dug through for upstream + downstream impacts of every touched component + System Manual consulted; NO dismissiveness toward small errors — certainty about the issue before any deletion or cut; CC + Langston iterate autonomously per batch until verified complete AND verified correct, escalate to Kyle only on no-consensus | **Kyle directive** (P19-B1 turn) |
| 2026-06-13 | Bench DB: **Docker Desktop install APPROVED + executed** (winget, pgvector/pg17 compose to follow in P19-B1 Bucket A); reboot timing Kyle's call | Kyle |
| 2026-06-13 | **P19-B1 CLOSED.** Headline: the "59/12 pre-existing failures" story was FALSE — CI was already zero-tolerance green; all bench red was environment + 2 latent bugs (db-migrate Windows path doubling; regime-scan stateful-regex guard weakener — both fixed). TEC.b strict restore SHIPPED with blast radius MEASURED (exactly the predicted +50) before repair; obsolete defaults-backfill test REWRITTEN to lock the strict contract; 7 parked skips DELETED with replacement coverage verified first; #141 closed, #226 opened (unit/integration tier separation — Langston cond-2 + notes A/B). Mock-mechanism decision: cache seeder (real resolver exercised; sibling vi.mock pattern proven non-viable). All four Langston gates clean (Step-1 ACK, Step-2 PROCEED, Step-4 APPROVE, Step-8 CONFIRMED) | CC + Langston (Kyle autonomy directive) |

---

## §6 — P19-B7b PRE-FLIGHT CHECKLIST (Langston req. — de-facto gates live in earlier batches; nothing else aggregates them)

ALL must be ✅ before the flip commit. Verify each at B7b Step 2, cite evidence in the B7b scope:

| # | Gate | Built in | Status |
|---|---|---|---|
| 1 | Test suite green (no stale-failure noise floor) | B1 | ✅ 2026-06-13 (0 failed / 0 skipped, bench + CI) |
| 2 | #153 xstock 0.50 pattern-pool-cap placeholder validated (HARD gate per WIRE-IN doc) | B4 | ☐ |
| 3 | RTB `SET NOT NULL` Phase-4 migration shipped (zero-null gate) | B4 | ☐ |
| 4 | xStock pricing latency + staleness/reconnect fitness verified for execution | B4 | ☐ |
| 5 | Kraken paper-order-system smoke test passed (minimal order round-trip — API surface unexercised since Phase 8) | B4 tail or B7b pre-flight | ☐ |
| 6 | All §19.0.5 capture hooks live (pre-filter, RTB TTL, TCL, paper admit) | B5 | ☐ |
| 7 | Loss-budget auto-trip armed AND force-trip-tested (trip + recovery path proven) | B6 | ☐ |
| 8 | #213 legacy `/live-trading` routes confirmed inert (5-min check — gate-bypassing legacy route is a worse latent once execution machinery is hot) | B7b pre-flight | ☐ |
| 9 | UI shells (B7a) merged + reviewed against fixture data | B7a | ☐ |

---

## §7 — RUNNING_ISSUES PHASE-19 DISPOSITION TABLE (Langston req. — every Phase-19-homed open issue gets an explicit home or an explicit Kyle-signed deferral)

| # | Issue (one line) | Disposition |
|---|---|---|
| #92 | Wire xstockSpotScanner through signal-orchestration | → **B4** (core of the merged wire-in) |
| #137 | Active-trading-path restoration intake (54 files / 231 errors + routes/storage share; baseline tags still TBD) | → **B3** (opens with tag-triage pass) |
| #139 | vts-runner 9 remaining throwing resolveAssetClass sites | → **B3** |
| #153 | xstock 0.50 pattern-pool-cap placeholder validation | → **B4** (pre-flight gate #2) |
| #138 | Hybrid first-confluence label verification (fires on first confluence under active trading) | → **B9 watch-list** |
| #95 | xStock real-time WS pricing adapter | → **SUPERSEDED by reconciliation §3.1** (B74 WS feed live since archiver batch); B4 residual = latency/staleness/reconnect fitness; rewrite-or-close #95 at B4 close |
| #96 | Sector-aware portfolio-cluster prevention | → **B11** (19-16) |
| #97 | xStock characteristics inventory (earnings/market-cap/P/E/IV) | → **B13** (19-15) |
| #83 | Boot Readiness Coordinator (boot-ordering half) | → **B14** (conditional, triggers per roadmap 19.x) |
| #56 residue | §19.0.5 promoted capture hooks (FX5 pre-filter + active-path SQE/RTB) | → **B5** |
| #86 | Continuous Q-D friction probe + dedicated history table (gates xstock friction extraction) | → **B5 scope decision** (capture-infrastructure family; confirm or re-home at B5 Step 1) |
| #94 | xstock macro confidence modifiers (currently deliberate NO-OP = 1.0; issue argues no-macro-awareness shouldn't ship into active trading) | → **CC recommendation 2026-06-13: DEFER BUILD to Phase 25 + ensure equity-macro raw inputs are CAPTURED at B5** (capture-now/modulate-later, same doctrine as 19-20 + AMR body/brain). Rationale: zero-data hand-tuning pre-run would confound the debug window; mid-run build (B11) splits the calibration population; interim protection = paper-only stakes + AMR active from week 1 + per-class regime/DBS (B-4.7). Langston's Step-1 lean was B11 — reconciling in the P19-B1 loop; final recording pending Kyle confirm |
| #80 | Extend B73 exit-strategy ablation to xstock_spot (drives per-class TEC config) | → **✅ DEFERRED to Phase 25 — KYLE DECISION 2026-06-13** ("for the exit strategy study, yes, let's wait for phase twenty five") |

---

*Maintained by the implementing CC session. Update §1 status + §5 decisions every batch/sub-batch close; re-sequence only with Kyle's sign-off recorded here.*
