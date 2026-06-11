# DawnTrader Post-Audit Roadmap

> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Created**: 2026-02-17 · **Reorganized**: 2026-06-10 (full structural reorg, Kyle-approved 2026-06-10, Langston-approved same day — see Decision Log §6. Historical text moved verbatim to `1-system-manual/_archive/POST_AUDIT_ROADMAP_HISTORY.md`.)
> **Purpose**: The forward plan from the current state through live trading and beyond. Organized by EXECUTION ORDER, not phase number.
> **Companion documents**: `PHASE_24_TO_19_READINESS_CHECKLIST.md` (canonical ordering + live status of the current Interphase work) · `SYSTEM_MANUAL.md` (what the system IS) · `SYSTEM_IMPACT_MAP.md` (file-level dependencies) · `PHASE_HISTORY.md` + `BATCH_CATALOG.md` (the per-phase / per-batch historical record) · `RUNNING_ISSUES.md` (open-issue tracker) · `CHANGES_AND_FIXES.md` (bug/risk registry).

## 🔒 Standing rules for this document (adopted at the 2026-06-10 reorg — both CC sessions + Langston)

1. **One home per topic.** Every work item has exactly ONE section where its detail lives. Any other mention is a pointer to that home. (Item *numbers* — 19-1…19-20, 25-1…25-15, 19.0.A/B/C/3/5, 19.x — are stable anchors and never change, even when an item's home moves.)
2. **Edit in place + decision log.** New decisions modify the plan text directly where the affected item lives, plus ONE line in the Decision Log (§6). Do NOT stack new dated update blocks at the top of the file. Superseded text moves to the archive file, not deleted.

---
## §1 — NOW (updated 2026-06-10)

**Phase 24 (xstock_spot onboarding) is governance-closed.** Active trading is OFF. The system is executing the **Interphase 24→19** work program — the ordered set of items between the Phase-24 close and the Phase-19 kickoff. Canonical ordering + live per-item status: **`PHASE_24_TO_19_READINESS_CHECKLIST.md`** (that doc governs if any wording here diverges).

- **Done:** item 1 (onboarding-workflow rebuild) · item 2 (Phase-24 governance close) · item 3 (ml-service retired, B-NEW-54) · item 3.5 (issue-homing audit + roadmap reorder) · **item 4 — separate VTS / paper / live into independent standalone systems — CLOSED 2026-06-10** (all 6 throughput-study gates pass; zero cross-contamination proven under live concurrency; live start hard-gated until Phase 21; capacity verdict: keep current Hetzner, in-process GO — umbrella report `ITEM_4_UMBRELLA_COMPLETION_REPORT.md`) · **item 4.6 half A (disk hygiene) — EXECUTED 2026-06-10** (disk 80%→24%).
- **In flight / next:** 4.6 half B (chunk A instrument LIVE, 24h soak → analysis 06-11T19Z → chunk B) → **4.5 ✅ DONE 2026-06-11** (fees DB-governed Tier-1) → **4.7 ✅ DONE 2026-06-11** (per-asset-class regime — #162/#163 resolved; see readiness checklist) → 5 (AMR body) → **Phase 19 kicks off.**
- **B-4.5 roadmap deposits (2026-06-11):** (a) **Phase 19 — maker-entry evaluation** (source: `STRATEGIC_DIRECTIONS_AND_AI_EDGE.md` §1 direction B): evaluate post-only maker entries against MEASURED paper fill rates; design = fill-rate AND conditional-outcome comparison (maker-filled vs taker-filled trade outcomes — fill-rate alone is the adverse-selection trap); ⚠️ the flip is fee 0.80→0.40 **PLUS a spread-leg sign change on entry** (maker CAPTURES spread) — the DB rate-flip covers the fee half only. Until then the model prices taker both legs. (b) **Phase 21 prep — fee-tier automation** (B-4.5 scope obj 4): periodic Kraken fee-schedule/volume read → `fee_model` rows; deferred because the account is durably Tier 1 until live volume exists — manual DB update under ADJUSTMENT_FRAMEWORK is the current mechanism.

**The current trading posture:** the system has been in VTS / passive learning since end of Phase 8. Phase 19 is the work that turns Paper-Mode active trading back ON and debugs it end-to-end. Live trading is Phase 21, gated behind paper calibration comfort (see §2).

---
## §2 — THE RUN ORDER (canonical — phase NUMBERS are NOT the run order)

**Kyle decision 2026-06-08: strictly sequential, not parallel — correctness over speed.** Settle trade quality first, then productionize the stable system, then go live. Numbering ≠ order: Phase 25 runs right after 19; Phases 16+20 run after 25; Phase 22 runs after live; Phase 26 is the renamed crypto_perp onboarding (the old "Phase 25" label before reuse).

| # | Block | What it is | Status | Detail |
|---|---|---|---|---|
| 1 | **Interphase 24→19** | The ordered between-phase work program (VTS/paper/live separation, scan-stall fix, fee-model fix, per-class regime, AMR body). Canonical ordering: `PHASE_24_TO_19_READINESS_CHECKLIST.md` | **IN PROGRESS** — see readiness checklist for live item status | §3.1 |
| 2 | **Phase 19 — Paper Mode Audit & Debug** | Turn paper-active trading back ON (full pipeline → Kraken paper order system); debug end-to-end; minimum bootstrap tuning. Test-suite cleanup (§16.7) runs at the START of Phase 19 as a debugging-enabler. | Not started | §3.2 |
| 3 | **Phase 25 — Calibration With Evidence** | Calibrate everything that needs paper-active wins/losses to verify. **Go-live gate (Kyle): calibrate in paper until COMFORTABLE with wins/losses/profit — THEN proceed.** | Not started | §3.3 |
| 4 | **Phase 16 + Phase 20 — Cleanup + Production Hardening** | DB/legacy cleanup + hardening, done on the now-stable calibrated system. | Not started | §3.4 |
| 5 | **Phase 21 — Live Mode Activation** | Real Kraken orders. Gated by the Phase-25 comfort gate + the `live_engine_enabled` numeric flip (19-17b). | Not started | §3.5 |
| 6+ | **Post-live queue** | Phase 22 (Publication) → Phase 17/18 (real ML) → Phase 17.5 (Smart Thermostat) → Phase 21.4 (Modularization) → Phase 21.5/26 (perp futures) + backlog | Post-live | §4 |

**Standing operating posture (not a phase):** paper mode is PERMANENT — it keeps running after live turns on, as the testing ground where new functionality + calibration prove out before promoting to live. End-state = three concurrent producers: standalone always-on VTS + paper (live-mirror testing ground) + live.

---
## §3 — UPCOMING WORK — DETAIL (in run order)

### §3.1 — Interphase 24→19 (IN PROGRESS)

**This block's canonical ordering, per-item detail, and live status live in `PHASE_24_TO_19_READINESS_CHECKLIST.md` — one home, that doc wins.** Summary of the sequence (Kyle directives 2026-06-08/09/10): ✅ 1 onboarding-workflow rebuild · ✅ 2 Phase-24 governance close · ✅ 3 ml-service retirement (B-NEW-54) · ✅ 3.5 issue-homing audit + roadmap reorder · **4 VTS/paper/live system separation (IN FLIGHT)** — structural separation of the three producers with independent switches, labeled multi-source learning substrate, storage-for-three design, throughput study · then the item-4 throughput-study remediation + **4.6 scan-stall + disk hygiene** (hygiene immediately; structural scan fix scoped FROM the study output, lands before 4.5/4.7) · **4.5 Kraken tiered-fee-model fix** (detail below — its roadmap home) · **4.7 per-asset-class regime** (B-NEW-48; just before AMR so the AMR weather-report is built on per-class regime from the start; carries the #163 per-class regime→strategy-map restructure) · **5 AMR body** (detail at item 19-19 in the §3.2 table — its catalog home; concept: `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`; scope draft v2: `Claude Comms and Packages/Cross-Session Briefs/PHASE_25_AMR_SCOPE_DRAFT_V2_2026-06-03.md`; ships shadow-gated for the first ~5-7 days of Phase 19, then DB-flag to active; the ML "brain" that replaces its hand-set thresholds is 25-6, post-launch).

**Phase 19 kicks off only after this block completes.**

**Phase 19 roadmap deposit (Kyle directive 2026-06-11) — per-MODE break-even stops + moonbag trailing exits:** the TEC break-even-stop + moonbag trailing-exit machinery currently exists for the VTS only (and its per-class enables sit DISABLED for both crypto_spot and xstock_spot). With the item-4 three-system separation, paper mode runs independently full-time in Phase 19 — it MUST get its OWN break-even-stop + moonbag-trailing-exit functionality, per-class enable/disable (DB-governed per the §5.15 per-asset-class-config rule, never shared with the VTS switches). Live mode (Phase 21) gets the same: its own independently enable/disable-able BE + moonbag trailing set. Three modes × per-class switches, three independent configs — no cross-mode inheritance. Design note: the B73 exit-strategy ablation replay (12 BE/trailing variants, observation-only) is the calibration evidence source for choosing the paper-mode seed settings.

> *Anchor note:* §19.0.C below is the Kraken fee fix — the anchor number is preserved from its original Phase-19 placement; its home is HERE (Interphase item 4.5).

### 19.0.C — Tiered fee-model accuracy fix (NEW 2026-06-08, Kyle directive — between-Phase-24-and-19 prerequisite)

**Status (2026-06-08):** Tracked as a between-Phase-24-and-19 item; canonical sequencing lives in `PHASE_24_TO_19_READINESS_CHECKLIST.md` §5b (item 4.5). Independent of AMR; **must land before the Phase 19 paper-audit** so the audit observes realistic friction. Full analysis + transcribed tier table: `Claude Comms and Packages/Cross-Session Briefs/KRAKEN_TIERED_FEE_CHANGE_ANALYSIS_2026-06-08.md`.

**Trigger:** Kraken published "Cross-platform fee tier changes (July 2026)" (effective 2026-07-09). Tier is now set by the **most favorable** of {30-day spot volume, 30-day futures volume, Assets-on-Platform}, and the resolved tier's rate applies across spot + futures (no longer per-product). New ladder: Tier 1 = **0.80% taker / 0.40% maker** spot → Pro 5 = 0.05% taker / 0.00% maker. (Full verified tier table in the analysis doc.)

**The gap vs. what we model.** Current friction config hard-codes a single fee level (0.26% taker / 0.16% maker) in `server/config/exchange-defaults.ts` + the per-class `friction.ts` modules — **not** DB-tunable, **no** tier concept. At current account size the real tier is **Tier 1 (0.80% taker / 0.40% maker)**, so modeled round-trip friction (~0.7%) under-states reality (~1.8%) by ~1.1pp — **real friction ≈ 2.5× the model.** (Our modeled 0.26% taker only matches ~Tier 6: ~$100K 30-day spot vol or ~$200K AoP.) The Net-Expectancy gate (`cost-model.ts` round-trip → net-expectancy kernel) would admit marginally-EV-positive trades that are actually EV-negative once true fees apply. Not a live leak today (VTS/paper pay no real fees) — a **model-accuracy** fix, mandatory before live capital.

**Scope (design-before-build with Langston, NO-PATCHES §5#15):**
1. Migrate fee values from the hard-coded source files into `module_constants` (same per-asset-class resolution as other knobs). Note: the new cross-platform tier is account-wide, so the long-standing crypto==xStock fee equality is now structurally correct, not a coincidence — no per-asset-class fee dimension required (the DB layer supports one regardless).
2. Add live-tier awareness — periodic read of the account's current Kraken fee schedule feeding the DB value; until wired, **default to Tier 1 (most expensive)** so over-estimation only ever rejects good trades, never admits bad ones (safe failure mode during calibration).
3. Confirm the resolved (or default Tier-1) rate flows through every fee consumer into the EV kernel.

**Account tier confirmed (Kyle 2026-06-08): Tier 1.** Live account AoP ≈ $835, negligible 30-day volume → entry tier with no softening. Default-to-Tier-1 (0.80%/0.40%) is the *accurate* setting, not just conservative. New structure effective **2026-07-09**; old schedule (also above our modeled 0.26%) applies until then — fix warranted regardless.

**Futures rates** in the new table are captured in the analysis doc for later — perp friction is not configured until crypto_perp / xstock_perp onboard, so out of scope here.

**Effort:** ~1 week (mostly the DB migration + the live-tier read + verification). Cross-references the high-level "Execution / friction reduction → Phase 19" line in the foundations block.

---

### §3.2 — Phase 19: Paper Mode Audit & Debug

> **Run-order position: first block after the Interphase completes.** The locked item table below (19-1 … 19-20) is the authoritative catalog of Phase-19 items (2026-05-27 split, Kyle directive). Batch ordering within the phase is decided at the start of the phase. Items whose detail is homed elsewhere: **19-19 (AMR body)** = Interphase item 5 (§3.1); **19.0.C (fee fix)** = Interphase item 4.5 (§3.1); **§16.7 test-suite cleanup** runs at the START of Phase 19 (homed in §3.4 Phase 16). Calibration items that need paper-active outcomes (the old §19.0.A / §19.0.3 / §19.4 / §19.4.5 sections) are Phase-25-homed — §3.3, anchors preserved there.

## Phase 19: Paper Mode Audit & Debug (Weeks 34-37)

**Goal**: Run the complete system end-to-end in Paper Mode with all components active (MCE, real VTS, Directional Bias, Short Trading, Predictive Execution, ML). Find and fix everything before live capital.
**Locked Phase 19 items:**

| # | Item | Plain-language purpose |
|---|---|---|
| 19-1 | B79.0n.WIRE-IN (umbrella v4 #14) | xStock active-trading wire-in. Connects xstock_spot signals end-to-end through the engine so paper trades can actually open and close on xstock symbols. Activates the canary log + outcomeFeedback EMA store + diagnostic counter math we deferred in EXECUTION. |
| 19-2 | B79.0n.OBSERVABILITY T2 + active-trading flip (umbrella v4 #16) | The actual flip-the-switch on paper-active for all 4 active classes + observability dashboards/alerts. After this, the system is running. |
| 19-3 | §19.0.5 Full data-capture coverage for paper-active path | Active-path SQE/RTB/TCL reject hooks + FX5 pre-filter capture. HARD precondition before paper-active turns on. |
| 19-4 | §19.0.B Daily loss-budget service + kill-switch auto-trip | Aggregator + auto-trip on rolling 24h paper P&L vs portfolio. Safety mechanism. |
| 19-5 | §19.x Boot Readiness Coordinator | Unify the patchwork boot sequence. Triggered if Phase 19 surfaces boot-related cascading failures. |
| 19-6 | #137 active-trading-path restoration intake list | TypeScript baseline file's `phase_tag.startsWith("Phase 19")` entries — concrete code fixes from B-NEW-43 needed for active-trading to function correctly. |
| 19-7 | #92 wire xstockSpotScanner through signal-orchestration | Pre-existing wiring gap. Required for xstock_spot to produce signals on the active path. |
| 19-8 | B79.5 xStock real-time WebSocket pricing adapter | `wss://ws-equities.kraken.com` live-pricing adapter. Without it xstock active-trading runs on stale REST polling. |
| 19-9 | B79.x failure-mode taxonomy — entry-side gap | LULD halts / circuit breakers / dividends / splits / earnings entry-side scanner consult. Exit-side landed via B-NEW-42; entry-side is required before live trading. |
| 19-10 | #139 vts-runner throwing `resolveAssetClass` call sites | 10+ pre-existing throwing call sites surfaced during PATTERN-DETECT. Functional fix needed before paper-active across multiple classes. |
| 19-11 | §19.1 Paper Trading Run | The act of actually running paper-active for an extended observation window. Generates the data Phase 25 consumes. |
| 19-12 | §19.2 Audit & Debug | Fix structural bugs surfaced during the paper run. |
| 19-13 | §19.3 Performance Validation | Latency, throughput, queue depth, cadence holds under real paper-active flow. |
| 19-14 | §19.3.5 Trailing-exit live verification (B65.3 folded in) | Verify ATR TEC + ladder + break-even-stop behavior under real fills. |
| 19-15 | #97 xStock asset-specific characteristics inventory | Earnings calendar / market cap / P/E / IV / analyst ratings feeds. Plumbing for data sources active trading will consult. |
| 19-16 | B79.6 sector-aware portfolio-cluster prevention | Equities cluster by sector. Without this, multiple correlated xstock positions can land simultaneously. |
| 19-17 | **NEW — Active Trading Simulations (Kyle directive 2026-05-27)** | VTS-like layer that opens a simulated trade for every signal that enters RTB (and optionally for signals rejected by SQE, marked `SQE_PASSED` vs `SQE_REJECTED`). Captures additional data per unit of calendar time when slot caps limit how many real paper trades open. Lets us measure what the trades-we-didn't-take would have done + measure SQE filter quality (is SQE removing winners or losers?). Strict data partition so calibration doesn't pool simulated vs real. Reuses VTS infrastructure where possible. |
| 19-17b | **ITEM-4 step 3 standing note (2026-06-10): Phase-21 go-live MUST set `live_engine_enabled` to numeric `1`** | The `/api/trading/start` live branch is gated by `module_constants` module `live_engine_gate`, constant `live_engine_enabled` (seeded `0`). **NUMERIC semantics — set the VALUE to `1`, NOT boolean true** (jsonb booleans are invisible to the B72 numeric resolver; a 'true' write leaves live permanently gated). Until flipped, live start returns 409 `LIVE_ENGINE_PHASE21_GATED` (fail-closed, no state flip). Langston-required paper-trail (step-3 review condition 3). |
| 19-18 | **NEW — Live mode active-trading build approach (Kyle directive 2026-05-27)** | Discussion + design item at start of Phase 19: is live mode a copy-paste of paper mode with a switch-button toggle (current design plan), or is there a better way to build it? Decision lands before Phase 21 live mode activation. |
| 19-19 | **NEW — AMR body pre-Phase-19 (CC + Langston consensus 2026-05-28; sequencing reconciled 2026-06-08)** | Adaptive Market Response BODY lands as a pre-Phase-19 batch. **Sequencing (reconciled 2026-06-08 to the Phase-24→19 plan):** the AMR body is the LAST item (item 5) of that plan — after the onboarding-workflow finalize (done 2026-06-08), the Phase-24 governance close, the ml-service fix, the VTS standalone always-on Simulation service, and the Kraken tiered-fee-model fix; before Phase 19 kickoff. **The xStock-calibration TAIL is DECOUPLED (parked in Phase 25 per Kyle 2026-06-05) and is NOT an AMR precondition** — the older "after B-XSTOCK-CALIB umbrella close" wording predates that decoupling. Canonical ordering lives in `PHASE_24_TO_19_READINESS_CHECKLIST.md`. Body = weather-report aggregator service (combines regime state + DBS direction/trend + realized-vs-predicted EV + pair-level regime distribution + friction trend into one classification: calm/choppy/stormy/favorable) + response dials (position size, stop distance, target distance, confidence floor, entry cooldown, strategy/pool allowance lists, slot-count caps, hard-pause flag) + offensive Aggressive mode added to existing Normal/Defensive/Survival skeleton + per-asset-class `module_constants` integration (hand-set conservative thresholds, NOT VTS-calibrated). **Shadow-mode boot gate (Langston friendly amendment):** first ~5-7 days of Phase 19, weather aggregator runs and logs every classification + transition but response dials remain pinned at Normal (no actual brakes applied). After shadow window, flip DB feature flag to active. Mitigates debug-confounder concern during Phase 19's bug-discovery window while preserving observation runway. Cost trivial — dials already need respect/ignore toggle for emergency revert. Source documents: `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` (2026-04-25, body design) + `Claude Comms and Packages/Cross-Session Briefs/AMR_PRE_PHASE_19_PEER_DISCUSSION_2026-05-25.md` (sequencing argument) + `Claude Comms and Packages/Cross-Session Briefs/ML_DESIGN_PRELIMINARY_2026-05-21.md` §6.2 + §7 (M2 socket spec). CC + Langston converged consensus 2026-05-28 on body-now/brain-later split per Kyle directive 2026-05-27 evening "if so share with Langston and iterate until you guys arrive at a decision."  |
| 19-20 | **✅ DONE 2026-06-08 — Decision-provenance capture (RUNNING_ISSUES #206; Kyle directive 2026-06-07 — built pre-Phase-19, decoupled from the study)** | **CLOSED 2026-06-08: built + deployed + live-confirmed as B-NEW-53 / B-NEW-53.1 / B-NEW-53.2 across both spot classes** (crypto verified 100% live 2026-06-07 after the OHLCCandle.time-is-SECONDS hotfix; xStock 36,531/36,531 archive↔provenance rows = 100% coverage with real forming_bar_ts, and the admitted at-entry economics block 158/158 = 100% post-deploy vs 0/55 before). Forward data is now accruing; the proof-of-capture §10.5 alert `7362f63f` (2026-07-05) re-surfaces the Phase-25 entry-trigger sweep (25-12) once enough captured rows accrue (RI-a stop-anchor gap unified into the same provenance write per Langston). — *Original plan text retained below for the record.* The general fix for the wall that THREE studies hit (W2.0a Mode-A, RI-a stop-anchor, B.5 W2.0b entry-trigger): the engine's exact decision-time inputs were never persisted, so no backward replay reproduces a live decision to ≥99% (W2.0b maxed 80% — the irreducible gap is the in-progress FORMING bar + the resolved constants). **Capture / study are DECOUPLED — like the AMR body/brain split:** the CAPTURE (write-side instrumentation) is built NOW so forward data accrues immediately; the STUDY (the entry-trigger replay/sweep that consumes it) runs in Phase 25 with rich history. Every day deferred = forward data lost forever (Kyle 2026-06-07). **Lean by design — net-new storage is small:** the settled 15m bars are ALREADY persisted in `xstock_spot_ohlc_15m_snapshot` (that's why W2.0b's snapshot run hit 80%), so the capture only adds, per archived decision, (a) the forming-bar OHLCV (one bar), (b) the resolved `module_constants` used (small JSONB or a versioned hash), and (c) a reference to the settled bar-set (symbol + as-of bucket) — hash-and-reference, NOT 240 bars/row. **UNIFY with RI-a (stop-anchor persistence) as ONE capture layer, not two (Langston)** — one decision-provenance write satisfies both the detect-input gap and the stop-anchor gap. **Settle the storage design AT SCOPE before code (§8 #11 + §5#15 NO-PATCHES).** Additive / telemetry-only / active-trading OFF = low blast radius. **Defined exit:** once it lands + writes rows, a §10.5 scheduled alert keyed on a concrete accrual threshold re-surfaces "W2.0b now backward-replayable — resume the entry-trigger sweep," so the data-block self-clears. Source: `Claude Comms and Packages/Scope Files/B_5_W20b_CONCLUSION.md` + RUNNING_ISSUES #206. |
### 19.0.B — Daily loss-budget service + kill-switch auto-trip (OPTIONAL Phase 19 batch, Kyle directive 2026-05-21)

**Status (2026-05-21):** Optional Phase 19 batch. Previously listed as item 9 in the 19.4.5 observational decision gate as "BLOCKING FOR LIVE-TRADING ACTIVATION." Promoted to a dedicated Phase 19 batch slot rather than buried inside the observational gate so it has its own visibility, but flagged optional — if Phase 19 observation shows the existing manual kill-switch + per-trade guardrails are already absorbing real-world loss patterns adequately, the auto-trip wiring can ship later. If Phase 19 observation shows the gap is materially exposing capital, the batch fires.

**The gap:** today the kill switch's `dailyLossKillSwitchPct` threshold (~25%) lives in `guardrails_v2` but is checked manually via UI/API. No service watches running daily P&L and trips automatically. `tripKillSwitch()` accepts `lossPercent`/`threshold` params but is never called by a budget aggregator. There is no `server/services/daily-loss-budget.ts`.

**Scope if the batch fires:**
- Build `server/services/daily-loss-budget.ts` — rolling 24h P&L aggregator across paper + live trades.
- Wire auto-trip when `dailyPnL / portfolioValue ≤ -dailyLossKillSwitchPct`.
- Trade-mode-aware (paper-active aggregation lifts into live aggregation when live mode activates).
- DB-tunable threshold via `module_constants` (already present in `guardrails_v2`).
- Same service can later be a regime-confidence consumer (original B67 "Consumer #6" scope).

**Effort:** ~1-2 weeks if fired. Otherwise zero work.
### 19.0.5 — Full data-capture coverage for paper-active path (HARD requirement, Kyle directive 2026-05-05)

**Status:** B70 main + B70.1 shipped capture for the VTS path (which was the only active path at B70 time). When paper-active turns on in Phase 19, the system MUST capture EVERYTHING flowing through the paper path with the same fidelity. This is a precondition for Phase 19.1 paper trading run; without it, the paper run produces less data than the VTS run that preceded it, which defeats the whole point.

**Concrete deliverables (must land before Phase 19.1 starts paper-active):**

1. **FX5 pre-filter reject capture** — every pair the FX5 scanner evaluates and rejects pre-strategy (spread/volume/IMF/family-eligibility/etc.) writes a `signal_eval_archive` row with `reject_stage='pre_filter'` and `gate_decision.reason` carrying which stage rejected it. Today this is implicit (a pair that never appears in `signal_eval_archive` for a cycle was rejected pre-filter). When paper-active runs, we want explicit per-pair rejection rows. Surgical work: ~10 reject sites in `fx5-scanner.ts`.

2. **Active-path SQE / RTB / TCL reject hooks** — `signal-orchestrator.ts` currently has the admitted-path hook only (commit `6b63b6bd`, dormant until live activates). Phase 19 needs equivalent reject-stage hooks at:
   - `signal_quality_evaluator.ts` FinalScore-floor failure → `reject_stage='sqe'`
   - `ready_to_buy_service.ts` stale / TTL-expired path → `reject_stage='rtb'`
   - `trading-bootstrap.ts` TCL cooldown / dedup path → `reject_stage='tcl'`

3. **Paper-execution-engine admit hook** — currently paper-engine has only the `closePosition` exit hook. When paper-active opens a position, that admit event should also write a `signal_eval_archive` row with `mode='paper_sim'` and `source='paper-execution-engine'` so the open→close pair joins cleanly by trade_id.

4. **Verification target:** in the first 24h of paper-active running, every one of the 4 partitioned archive tables shows non-zero rows tagged with `mode='paper_sim'`. Drift Dashboard `DataArchiveSection` panel shows the breakdown.

**Why this is in Phase 19.0.5 not B70.2:** Kyle directive 2026-05-05 — "When paper mode active trading turns on, everything flowing through paper mode must be captured." Treating this as "B70.2 maybe-someday" risks the paper-active run going live with a capture gap. Locking it as a Phase 19 precondition guarantees the paper run produces a complete dataset.

**Estimated surface:** ~200-400 lines across fx5-scanner.ts (10 reject sites) + signal_quality_evaluator.ts (1 site) + ready_to_buy_service.ts (1-2 sites) + trading-bootstrap.ts TCL section (1-2 sites) + paper-execution-engine.ts open-position hook (1 site). All hot-path hooks try/catch wrapped, never block host paths (same pattern as B70 main).
### 19.1 Paper Trading Run
- Run extended paper trading with full system
- **Phase 19.0.5 capture coverage verified non-zero across all 4 archive tables for `mode='paper_sim'` (precondition)**
- All 17+ strategies active (including short strategies)
- MCE providing real indicators
- VTS generating real signals
- Predictive execution making bounded adjustments
- ML active (or in shadow mode if not ready)
- Structural Regime, Directional Bias, and Friction all flowing

### 19.2 Audit & Debug
- Verify FinalScore, Hybrid Score, Confidence, Regime Weight are all calculating correctly
- Verify Directional Bias is feeding into strategy selection
- Verify short positions execute correctly (if Kraken-confirmed)
- Verify predictive adjustments are bounded and reversible
- Verify ML outputs are explainable and within bounds
- Verify kill switch, guardrails, and safety systems function under all conditions
- Fix all discovered issues

### 19.3 Performance Validation
- Compare paper results to expectations
- Validate strategy performance across regimes
- Confirm learning systems are improving signal quality
- Validate data retention and archiving

### 19.3.5 Trailing-exit live verification (folded-in B65.3, 2026-04-25)

**Status:** B65.3 was originally scoped as "migrate paper's metadata-driven percentage trailing onto the ATR TEC state machine," but during the B65.2 audit it was found that paper-execution-engine.ts no longer consumes the legacy `trailingStopPercent` + `highWaterMark` exit path — the consumption was deleted as part of the B65.2 functional ship. Only a single non-consumed `highWaterMark` write at trade-open survives for legacy dashboards (paper-execution-engine.ts:1929, comment-flagged). The migration target therefore no longer exists.

**What folds into Phase 19.3.5 instead:** live verification under active paper trading that the ATR TEC service — already wired into both VTS and paper exit loops as of B65.2, with B65.4 ladder ratchet on top — produces the expected behavior under real fills:

- Break-even lock fires at +1×ATR gain
- Target lock fires at first rung
- Ladder rung ratchet (B65.4) advances stop AND target by `(targetPrice − entryPrice)` step on each rung hit
- Cost-aware net floor (`computeNetTargetFloor`) holds even on volatile pairs where slippage might otherwise nip the profit
- HWM dynamic trail acts as secondary floor below the rung floor
- Persistence across PM2 restarts continues to work (already verified post-B65.4 ship via `[9.2][EXIT] {symbol} restored: ... rung=N` log lines)

**Pass criteria:** at least one closed paper trade per scenario above, observed in logs and reflected in the Machine Learning page Closed Simulated Trades table with the correct TEC State badge (BE PROTECT slate / TRAIL STOP emerald / 🌙 MB×N).
### 19.6 External Source Connection & Capacity Diagnostics Dashboard (NEW 2026-06-02, Kyle directive)

**Status (2026-06-02):** Added to Phase 19 as the last operational sub-batch — diagnostics layer that hardens visibility before launch. Kyle directive 2026-06-02. Forward-compatible with the eventual ML/AI conversational layer (M5 in `ML_DESIGN_PRELIMINARY_2026-05-21.md`) — this dashboard's API surface is the same one the conversational overlay reads to answer "is everything healthy."

**Goal:** two new operator-facing diagnostics tabs that continuously monitor external data sources and internal compute capacity, surface health via a green / yellow / orange / red traffic-light system, and route degraded-or-worse states into the system-alerts queue so Langston and Claude Code sessions get notified per §10.5.

#### 19.6.1 External-Source Connection Dashboard

Per-source rows for every external API the system reads — Kraken (spot WS, equities WS, futures WS, REST, AssetPairs), CoinGecko (xStock discovery + crypto macro), Finnhub (sector tags), and any future feed wired in. Within each source, a row per *category* of data being pulled (e.g. Kraken spot: ticker channel, OHLC channel, trades channel, order book channel; CoinGecko: symbol discovery, macro). Each category shows:

| Status | Meaning |
|---|---|
| 🟢 Green | Working as expected — fresh data, within sanity baselines, well under API limits |
| 🟡 Yellow | Working but with intermittent disruptions (sporadic timeouts, brief feed gaps, approaching but under limits) |
| 🟠 Orange | Shaky — investigation warranted (sustained partial outages, sanity-check anomalies, API limit pressure ≥80%) |
| 🔴 Red | Off — no data flowing, or data flowing but failing baseline sanity checks |

**Two checks per category, not one:**
1. **Is data flowing?** Last-update freshness vs an expected cadence per category (e.g. ticker channel <2s, OHLC channel ≤60s, CoinGecko symbol discovery ≤24h).
2. **Does the data look right?** Per-category sanity baselines — NOT exhaustive per-pair validation. Examples: ticker prices within plausible bounds (not zero, not absurd), OHLC bar counts within an expected range per cycle, symbol discovery returning a stable count (within ±N% of recent baseline), sector tags returning the expected enum set. The "baseline" is defined per category and stored as a small set of expected-range constants; the dashboard flags categories whose live data falls outside the baseline range.

**API-limit pane (per source AND DawnTrader-wide):**
- Per-source usage vs that source's published rate-limit ceiling, expressed as a percentage with the same traffic-light tier.
- A DawnTrader-wide total throughput indicator showing aggregate inbound data rate vs the system's measured capacity (queue depths, persistence-pipeline lag, DB write throughput).
- Orange or red on either pane fires a system-alerts entry.

#### 19.6.2 CPU / Process Capacity Dashboard

A second tab listing every major process the system depends on at any given time and their live state:
- Scanner workers (FX5 crypto, xStock spot, xStock perp).
- Archivers (equity-spot, equity-perp, crypto-spot — the B74 chain).
- VTS runner.
- Active-trading orchestrator (when Phase 19 reactivates it).
- TEC / exit-decision service.
- Session-lifecycle controller.
- System-alerts dispatcher.
- DB pool + write batchers.
- ML sidecar (when it lands per Phase 17/18).

Each row shows: running / not running, current CPU%, memory footprint, queue depth or backlog where applicable, and the same green/yellow/orange/red status against per-process capacity envelopes. Aggregate CPU% and memory% against the host's total capacity are displayed at the top of the tab. Approaching capacity (≥80% sustained) is orange; saturated or process-down is red.

#### 19.6.3 Alert integration

Both dashboards write to `system-alerts.jsonl` (per §10.5) on yellow→orange or orange→red transitions, with severity matching the new tier (warning for orange, critical for red). The standing per-turn alerts-check protocol (CLAUDE.md §10.5) then surfaces them to whichever CC or Langston session is at the keyboard, plus Kyle via Telegram if severity is critical and during-RTH. Yellow alone does NOT fire an alert (would flood); yellow is a dashboard-only visibility state.

#### 19.6.4 Forward role — ML / AI conversational layer API

When the ML conversational layer (M5) lands in Phase 17/18, its "is everything healthy" question reads the SAME API surface this dashboard exposes. So the endpoints built here become a permanent part of the system's introspection layer, not a Phase-19-only artifact. Naming convention: `/api/diagnostics/external-sources/...` and `/api/diagnostics/process-capacity/...` so the surface is discoverable by both the dashboard frontend and any future programmatic consumer.

#### 19.6.5 Scope shape & sequencing

- Position: **last operational sub-batch of Phase 19** per Kyle directive. After SQE recalibration (19.4), the observational decision gate (19.4.5), and any AMR work that lands; before Phase 20 production hardening opens.
- Estimated scope: two new React tabs + ~6 new API endpoints + per-category baseline-range constants in `module_constants` (so baselines are DB-tunable per CLAUDE.md §5 #15) + per-process capacity envelopes also in `module_constants` + alert-emitter wiring. Roughly 1 week's batch — moderate surface, low risk because it's read-only diagnostics + alert writes.
- Tier 1 governance: scope file, pre-audit consulting SIM for every monitored process, completion report. No new DB tables required (re-uses `system-alerts.jsonl` queue + `module_constants` for tunable baselines).
**Phase 19 expected outcome**: Fully debugged paper trading system with optional SQE recalibration (19.4), Adaptive Market Response brain (now Phase 25 — see §3.3 / Decision Log), and end-of-phase diagnostics dashboards (19.6) covering external-source health and internal compute capacity wired into the alerts queue. All components validated. Ready for production hardening.

---

## Phase 19.x — Boot Readiness Coordinator (added 2026-05-08, Kyle directive)

**Status:** DEFERRED to Phase 19. NOT pre-launch.

**Trigger:** B79.TEC scope work (2026-05-08) surfaced that the current boot architecture is a patchwork — 12 separate bootstrap files in `server/startup/`, 8 separate health/monitor files in `server/services/`, the existing `SystemHealthMonitor` itself broken (`startPeriodicChecks is not a function` per PM2 logs), bootstraps run AFTER `server.listen()` so the app accepts traffic before subsystems are ready, and per-component error-handling is inconsistent (B74/B70 catch-and-continue, others throw, others silently degrade).

**Kyle directive 2026-05-08:** the patchwork is no bigger of an issue than any other subsystem during the patchwork era. Defer the unified coordinator to Phase 19. For B79.TEC specifically, ship hard-fail-on-boot with no env-flag carve-out (both production and dev hard-fail). If patchwork issues compound during Phase 19 paper-mode testing, address with the coordinator design then.

**Phase 19.x scope (number TBD when Phase 19 work formally begins):**

1. **Single Boot Readiness Coordinator service** registering all critical subsystems with declared dependencies.
2. **Per-subsystem readiness contract:** `register({name, dependsOn[], readinessCheck(), diagnose(), waitPolicy})`. Each subsystem declares its dependencies + how to check it's healthy + a diagnostic provider for failure cases + retry/wait policy (hard-fail, retry-with-backoff, retry-with-eta-from-external).
3. **Dependency-ordered boot.** Coordinator runs subsystems in topological order — `db_pool_ready` before `module_constants_warmup`, `module_constants_warmup` before `tec_config`, `tec_config` before `fx5_scanner`, etc.
4. **Single consolidated status surface.** Operator (Kyle) gets one Telegram message per state transition: "Booting... 11/14 green, waiting on Supabase (ETA 8 min based on retry response), full operation will resume when complete." Not noise from individual subsystems.
5. **All-green-before-traffic gate.** App refuses to accept production traffic until all subsystems green. Server.listen() moved BEHIND the coordinator's all-green signal.
6. **Continuous operation monitoring.** After full-green, coordinator continues to monitor — if a subsystem flips red mid-operation, alert with diagnosis.
7. **Replaces the patchwork:** consolidates the 12 bootstrap files + 8 health monitors. Fixes the broken `SystemHealthMonitor`. Standardizes error-handling across all subsystems.

**Why deferring is acceptable:** the patchwork has been running for many batches without recurring boot failures. B79.TEC's hard-fail handles its own correctness regardless of the broader boot architecture. The coordinator is cleanup work that benefits long-term maintainability, not a critical-path fix.

**Trigger conditions to escalate ahead of Phase 19:**
- Phase 19.0 VTS partition surfaces multiple boot-coordination bugs
- Phase 19.1 paper-trading run shows boot-related cascading failures
- Any new asset class onboarding (B80+) is significantly delayed by patchwork integration

---

### §3.3 — Phase 25: Calibration With Evidence (runs right after Phase 19)

> **Run-order position: immediately after Phase 19, BEFORE Phases 16/20/21.** The locked item table below (25-1 … 25-15) is the authoritative catalog. The four detailed sections that follow it (19.0.A, 19.0.3, 19.4, 19.4.5) keep their original anchor numbers but are Phase-25-homed — they all need paper-active outcomes.

## Phase 25: Calibration With Evidence (runs right after Phase 19)

**Anchor section (added 2026-06-09, item-3.5 reorder).** Phase 25 = "calibrate everything that needs paper-active wins/losses to verify." It runs **immediately after Phase 19** in the canonical execution order (see §2 — The Run Order), NOT in numeric sequence — Phase 25 precedes Phases 16/20/21. **Go-live gate (Kyle):** calibrate in Kraken paper-sim until COMFORTABLE with the wins/losses/profit, THEN proceed — not "launch and prove it live."

**The locked Phase 25 item list (25-1 … 25-15) lives DIRECTLY BELOW** (the "Locked Phase 25 items" table — moved into this section from the 2026-05-27 update block at the 2026-06-10 reorg). That table is the authoritative catalog; this heading exists so every "→ Phase 25" home in `RUNNING_ISSUES.md` and the item-3.5 reconciliation resolves to a real roadmap section. Highlights: 25-2 regime confidence-chain calibration · 25-3 **TFS sustainability gate value-scope** (RUNNING_ISSUES #111, moved here 2026-06-09 per Kyle) · 25-4 SQE recalibration · 25-7 xStock macro modifiers (#94) · 25-8 pattern_max_position_pct (#153) · 25-10 crypto confidence-modifier · 25-12/13/14 xStock entry-trigger/geometry/per-strategy re-fit (data-gated, self-surface via the #206 accrual alert) · 25-15 HCE rejected-arm causal test (#205). **Crypto strategy-signal re-validation** (2026-06-03 update) also sits here. Batch ordering within Phase 25 is decided at the start of the phase.

> **Note (numbering):** "Phase 25" the calibration phase is distinct from the retired "Phase 25 = B80 crypto_perp" label. crypto_perp perpetual-futures onboarding is now **Phase 26**, post-launch, no SLA (Decision Log §6 / archive).

---
**Locked Phase 25 items (calibration with evidence):**

| # | Item | Plain-language purpose |
|---|---|---|
| 25-1 | B79.0n.ML-CALIBRATION T2 (umbrella v4 #15) | Tier 2 ML calibration — confidence-chain calibration against active-paper outcomes. Explicitly needs live evidence. |
| 25-2 | §19.0.A Regime classifier confidence-chain calibration | B-NEW-33/36/37/39 workstream — confidence-modifier calibration re-run against paper-active outcomes (the apples-to-apples population). |
| 25-3 | §19.0.3 TFS sustainability gate value-scope decision | Recalibrate / re-target / deprecate the b68_5 sustainability gate against paper-active data. |
| 25-4 | §19.4 SQE Recalibration (B66 conditional) | Rebuild SQE thresholds with sibling-strategy WR controls + post-B62-only data + active-paper outcomes. |
| 25-5 | §19.4.5 Observational Decision Gate | Pre-launch reordering decision based on 1-2 weeks of clean active-paper outcomes. Hostile-window recurrence, ladder net contribution, low-volume moonbag exclusion, etc. |
| 25-6 | **AMR posture-model M2 calibration (post-launch — Phase 17/18 ML buildout)** | **CORRECTED 2026-05-28 per CC + Langston consensus** — AMR BODY moved to Phase 19 entry 19-19 (pre-Phase-19 batch with hand-set conservative thresholds + shadow-mode boot gate). What remains for Phase 25 / post-launch is the BRAIN: ML M2 posture-model trains against paper-active outcomes from Phase 19, replaces the hand-set thresholds with a learned model via the body's existing socket per `ML_DESIGN_PRELIMINARY_2026-05-21.md` §6.2 + §7. This is the calibration-with-evidence component — M2 needs paper-active outcomes to train against (the population that hand-set thresholds couldn't legitimately be calibrated against pre-Phase-19). CC's original 2026-05-27 recommendation (full defer to Phase 25) was based on stale `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §5 decision pathway that Kyle's 2026-05-21 directive "yes we're building it" had already retired; corrected via Langston independent read 2026-05-28. |
| 25-7 | #94 B79.3 xStock equity-equivalent macro confidence modifiers | xStock equivalents to B68.x macro modifiers (DXY / SPY / VIX-flavor signals). Confidence modifier work per Kyle 2026-05-27 voice — needs outcomes. |
| 25-8 | #153 xStock `pattern_max_position_pct` 0.50 placeholder validation | The 0.50 cap inherited from xstock_spot module is a placeholder. Calibrate the actual right value against xStock outcome data. |
| 25-9 | xStock `pair_correlation` per-pair WR data accumulation (B68.3 calibration) | Per-pair correlation modifier needs paper-active WR data to set the right modifier coefficient. From `XSTOCK_CALIBRATION_PLAN.md`. |
| 25-10 | Crypto confidence-modifier calibration | Kyle 2026-05-27 voice flagged crypto also needs confidence-modifier calibration, not just xStock. Same family as 25-2 / 25-7, applied to crypto's existing modifier stack. |
| 25-11 | **Order-book / liquidity-aware position sizing + thin-market exit — BOTH asset classes (Kyle directive 2026-05-29)** | Build live order-book-depth into position sizing + a thin-market exit hook for xStock AND crypto. **SCOPE CHANGE 2026-05-29 (Kyle-approved):** these hooks are NO LONGER in B.1.5 — fully deferred here. Rationale: at the live portfolio (~$830, maybe →$1,330), guardrail math gives per-trade size ~$150-250, which is <1% of median overnight xStock top-of-book ($33K) and ~2% of the thin-decile ($11K) — a depth-based sizing cap **cannot bind** at this scale, so building it in B.1.5 would be dead code that never fires. B.1.5 ships the liquidity **FILTER only** (depth-based LQ + min_depth admission gate — portfolio-size-independent, the real stuck-trade screen against genuinely-dead/empty books). This Phase-25 batch builds the sizing/exit hooks when (a) paper-active outcomes exist to calibrate against and/or (b) the portfolio grows large enough (trades in the thousands) that depth actually constrains sizing — full version: depth-walking (multi-level book), MM-quote-availability prediction, hours-aware caps, regime-conditional participation rates — AND **ports the depth-aware sizing/exit to crypto** (crypto sizing/exits ignore depth today; identical gap). NOTE: B.1.5 does NOT change crypto's liquidity FILTER (crypto volume = real token volume, not broken; only the SIZING piece is the cross-asset item). Depends on B.1.5 depth-plumbing landing. Decision to port to crypto is Kyle's, evidence-backed. **BUILD-TRIGGER WATCH-ITEM (Langston 2026-05-29):** the deferral must not drift past its sell-by date — track a crossover trigger that says "build 25-11 NOW": roughly when **(per-trade sizing × max-concurrent positions) approaches ~3-5% of the p10 (thin-decile) top-of-book depth at the admission threshold**. Below that, the participation cap can't bind (dead code); at/above it, a single order could move a thin book and the cap becomes load-bearing. Re-evaluate this trigger as the portfolio grows through bands (e.g. $830 → $1,330 → $5K → $20K+). See `B_1_5_PRE_AUDIT.md` §9-§10 + MEMORY. |
| 25-12 | **⛔ PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — Entry-trigger sweep (B.5 W2.0b)** — *we tried this; it's rescheduled here* | **Attempted 2026-06-06** in B.5 W2.0b: a detect-replay harness (`scripts/b5-w20b-entry-replay.ts`) re-ran the REAL detect functions over reconstructed 15m bars to sweep each strategy's entry-trigger thresholds, but **could not clear the ≥99% backward-parity gate** (vwap_pullback Tier-1 maxed **80%** — the in-progress FORMING bar was never persisted). Declared INCONCLUSIVE-by-backward-data rather than tune on a low-fidelity reconstruction (Langston-endorsed). **RESCHEDULED to Phase 25:** once the B-NEW-53 decision-provenance capture (item 19-20) accrues enough forward data, re-run the entry-trigger replay/sweep exactly (it'll hit ~100% parity on captured rows). Self-surfaces via the #206 §10.5 accrual alert. Source: `B_5_W20b_CONCLUSION.md`. |
| 25-13 | **⛔ PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — Faithful geometry reconstruction (W2.0a Mode-A) + RI-a stop-anchor forensic replay** — *we tried this; rescheduled here* | **Attempted 2026-06-06** in B.5 W2.0a: Mode-A (reconstruct each strategy's baseline stop from OHLC at current params + sweep, ≥95% parity gate) **FAILED for every strategy** because the geometry anchors (live VWAP / detectRange boundaries / pattern structural-low / ATR-at-decision) were never persisted; pivoted to Mode-B on the recorded `originalStopPrice` (keep-baseline verdict stands, INCONCLUSIVE-by-default). **RESCHEDULED to Phase 25:** the faithful OHLC-true geometry re-run + the RI-a stop-anchor forensic trail need those anchors, which B-NEW-53 captures going forward; re-validate geometry on the exact persisted anchors once they accrue. |
| 25-14 | **⛔ PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — Per-strategy entry re-fit (W2.2) + ORB entry-edge validation (W3) + vwap_bounce forward power test** — *downstream of 25-12, rescheduled here* | Downstream of the entry-trigger sweep (25-12): the **per-strategy entry-trigger re-fit (W2.2)** and the **ORB entry-edge validation (W3** — the DST-aware anchor + 15m-bar-unit + US-holiday-calendar PLUMBING can run pre-19 per #203, but the actual entry-EDGE validation is data-blocked**)** both need the decision-provenance accrual. Also carry W2.0a's thin **`vwap_bounce` tighter-stop candidate** (N=103, test R +0.125, within 1 SE of 0) as a pre-registered forward power test (~100+ trades) — do NOT seed until it clears forward. RESCHEDULED to Phase 25 with 25-12. |
| 25-15 | **⛔ DATA-BLOCKED STUDY (intraday-coverage gap) — HCE rejected-arm causal test (RUNNING_ISSUES #205)** — *tried, blocked on data; rescheduled here* | **Attempted 2026-06-05** in the HCE study P2/P3: the net-EV over-rejection causal test (does the `net_ev_rejected` gate reject signals that would have been net-positive? — the highest-value follow-on, since the admitted arm is robustly null and any edge lives at the admission boundary) hit a **NO-GO on its pre-registered bar** (19.1% pooled no-hit > 15% cap) — **entirely from crypto 1-min OHLC sparsity** (xStock no-hit 1% = GO-quality; the sim logic is valid, 96.8% sign-match when bars exist). A DISTINCT data gap from #206 (intraday-OHLC coverage, not decision-provenance) but the same "tried, blocked on data" class. **RESCHEDULED to Phase 25** (per Kyle 2026-06-07): unblock via (a) a denser intraday source — trade-tick reconstruction / order-book history — for the thin crypto symbols, and (b) the xStock `net_ev_rejected` accrual watch so the xStock-only causal arm can run at power as its own pre-registered mini-study. Source: `HCE_STUDY_FINAL_SYNTHESIS.md` + RUNNING_ISSUES #205. |

**XSTOCK_CALIBRATION_PLAN.md cross-walk:** Phases A / B / C / D / B.6 priors / F-NOW from `XSTOCK_CALIBRATION_PLAN.md` are calibrations that DON'T need outcomes — they sit in Phase 19 (or can run pre-Phase-19 as standalone calibration batches per Kyle directive 2026-05-27, where the next batch after EXECUTION close is exactly this work). Phases E / F-LATER from the same doc DO need outcomes and sit in Phase 25.

### 19.0.A — Regime classifier confidence-chain calibration (MOVED HERE 2026-05-21, Kyle directive)

**Status (2026-05-21):** Moved INTO Phase 19. Previously the active workstream blocking B67.5 (factor consumer-gate design) — `B-NEW-33` calibration tool, `B-NEW-36` diagnostic spike, `B-NEW-37` forensics, `B-NEW-39` phase-1 floor revert. Kyle directive 2026-05-21: stop trying to calibrate the confidence-chain modifiers against VTS outcomes — VTS and active-trading wins/losses are not comparable. VTS opens simulated trades on every filter-survivor against every strategy in a regime family (broad coverage by design); active trading runs a strict SQE filter on top that removes signals VTS retains. So VTS is observing losers (and some winners) the active path will never see, and active trading is filtering for a tighter subset than VTS measures. Calibrating the confidence chain against VTS data therefore conflates two different populations and produces verdicts that won't transfer to live.

**The calibration moves into Phase 19** for the same reason SQE recalibration (19.4) was moved into Phase 19 — once the paper-active path is running cleanly, the chain modifiers get calibrated against active-paper-mode outcomes (the apples-to-apples population) instead of VTS outcomes.

**What stays preserved through the move:**
- The 10-factor catalog + `b76_chain_final` framework version + nightly `regime_factor_alternates` accumulation continue running in the background. Data continues to build; the calibration verdict just isn't read until paper-active turns on.
- The B-NEW-39 phase-1 fix (post-composition floor reverted 0.20 → 0.45) stays in place — it was a structural correction, not a calibration outcome.
- B67.5 consumer-gate design is similarly parked. Confidence chain is currently shadow-modulating; nothing downstream actually consumes it as a decision input. That's the right posture until calibration can be done against the right population.

**What changes when Phase 19 opens:**
- Replay tool re-runs against paper-active outcome data (mode='paper_active' or equivalent) instead of VTS outcomes.
- Decision-grade gates (n ≥ 150/tertile, |spread| ≥ 7pp, p < 0.05) stay locked.
- Per-factor verdicts re-derived; KEEP / DROP / INCONCLUSIVE rolled into the B67.5 consumer-gate design.
- The B-NEW-37 forensic finding that the b68_5 sustainability gate is uniformly over-aggressive (Δconf identical between winners and losers) gets re-validated against paper-active data, not VTS data. If the same finding holds, the gate is recalibrated or deprecated per Phase 19.0.3 — TFS sustainability-gate decision tree.

**Why this is the right move:** calibrating sensors against a population the sensors won't actually serve produces measurements that don't survive the population change. Same reason SQE recalibration was moved into Phase 19. Same family of problem.
### 19.0.3 — TFS sustainability gate value-scope decision (NEW 2026-05-17, Kyle directive)

**Context.** The B67.5/B68.5 path-B sustainability gate currently feeds the confidence pipeline only — regime classifier, strategy selection, and Dynamic Sizing Engine do NOT consume sustainability output. Original design intent (B67.5/B68.5 era) was broader ("preventing late-trend entries" + "adding nuance to regime handling"); implementation contracted to confidence-only without explicit deferral tag. Step 1 baseline analysis 2026-05-17 (3,992 ablation rows in 16-day window) CONFIRMED B-NEW-37 forensic at scale: gate is uniform confidence dampener, blocks path B in only 0.9% of trades, Δconf identical between winners (0.4477) and losers (0.4423). Three-way Kyle/CC/Langston converged decision: table value-scope decision until Phase 19. RUNNING_ISSUES #111 tracks the deferral.

**Decision tree to resolve at Phase 19 opening:**

1. **Full stage-aware redesign** — extend regime model to include {EARLY, MATURE, LATE} stages; re-do canonical regime-strategy map as (regime × stage) → strategy set; modify DSE to factor stage into sizing. Multi-batch effort. Highest payoff if sustainability classifier validates AND stage-awareness measurably improves outcomes.

2. **Narrow trailing-exit-controller (TEC) routing hook** — read sustainability score at trade-entry time, route to TARGET (tight, lock-in) vs TRAILING_TAKE (wide trail, let-it-run) exit mode based on score. No changes to regime classifier, strategy selection, or sizing. Single batch (~1.x of follow-up). Smaller payoff but much smaller scope. Real near-term value path.

3. **Deprecate the gate** — remove the confidence-modification hook entirely, accept that DBS ≥ 0.30 regime classification + downstream Phase 19 filters carry the load. Smallest scope. Justified by data if classifier validation fails.

**Shared prerequisite for all three branches:** classifier accuracy validation. Methodology framework is locked at `Claude Comms and Packages/Langston Design Asks/TFS_SUSTAINABILITY_GATE_RESEARCH_DESIGN_2026-05-17_rev2.md`. Pivot at Kyle directive 2026-05-17: success criterion must be **forward-trend-continuation accuracy**, NOT trade-outcome win/loss (trade outcomes are downstream of entry/exit/sizing/friction; confidence inversion noise in VTS contaminates outcome-based measurement).

**Data continues accumulating during the deferral:** VTS persists sustainability score on every trade as feature for future ML training. The deferral doesn't lose history.

**Decision-record paper trail:** Step 1 baseline `..._STEP1_BASELINE_2026-05-17.md`; value-proposition decision `..._VALUE_PROPOSITION_2026-05-17.md`; methodology rev2 `..._RESEARCH_DESIGN_2026-05-17_rev2.md`. Implementation history captured in CHANGES_AND_FIXES `DESIGN-2026-05-17-A`.
### 19.4 SQE Recalibration (B66, conditional)

**Status (2026-04-25):** Was originally queued as a pre-launch standalone batch. Moved INTO Phase 19 because SQE recalibration is downstream of signal generation and orchestration — if those upstream paths have problems in active-trading mode, SQE recalibration is unverifiable and risks shipping changes we cannot validate.

**Methodology requirement added 2026-04-26 (B65.5 Phase A0 lesson):** any cohort-based metric used to drive an SQE recalibration decision (FinalScore-vs-outcome correlation, per-source-pool WR, PredConf rolling-window calibration, realized-EV-adaptive floor data, etc.) must include a **sibling-strategy WR control** in the threshold definition. The B63 Item 13 BUILD_DEDICATED verdict was procedurally clean against pre-registered thresholds but was confounded by hostile-window contamination — sibling-strategy WR in the same ±60min windows was identical to the cohort, meaning the cohort metrics reflected window quality, not strategy quality. Phase 19.4 must apply the same control to its own threshold definitions. Specifically:

1. For any reported "strategy X has WR Y%" finding, also report sibling-strategy WR in the same time windows.
2. For any reported "FinalScore is anti-predictive r=Z" finding, segment the data by per-day or per-window quality and check whether the anti-predictive correlation holds in clean windows or only appears when hostile-window observations dominate the sample.
3. The B63 audit findings (Item 18 SQE in particular — see `B63_ITEM18_SQE_AUDIT.md`) were generated on a window that included pre-B62 data and must be re-validated with sibling-strategy WR controls + post-B62-only restriction before any of their recommendations get acted on as part of Phase 19.4. The 2026-04-26 spot-check (`REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md` §11 + §12 corrected re-run) returned mixed results:
   - **Item 18 FinalScore-anti-predictive: probably stands on post-B62 data.** Re-run on post-B62-only (740 trades, 04-20 onward): r=−0.140 full, r=−0.094 HOSTILE, r=−0.057 CLEAN, r=+0.005 MIXED. The signal is STRONGER on post-B62 data than the original Item 18 claim of r=−0.017 (which was averaged across pre+post B62 data and partially diluted). Hostile-amplified but persists on CLEAN days too. **Direction is robust; re-validate magnitude with sibling-strategy controls.**
   - **Item 18 "only quant-strong_trend net-profitable": INVERTED from current truth.** On post-B62 data, quant-strong_trend = WORST pool (28.3% WR / −$7.08 net). Pattern pool leads (57.1% WR / +$0.26 net). On CLEAN days quant-strong_trend = 42.0% WR / −$1.13 (still net negative). **Whatever Item 18 measured for source-pool profitability does not match current behavior. Discard this claim.**
   - **Item 15 ExpectedEdge anti-predictive r=−0.130: does not replicate on post-B62 data.** Full r=+0.008. Mostly noise per segment except MIXED days (r=+0.261). Original strength likely from a different cohort. Discard unless re-derived.
   - **Item 15 PredConf design flaw: mild signal at design level.** Post-B62 r=−0.097 full, smaller per-segment. Design-level claim probably stands; empirical magnitude smaller than originally reported.
   - **Item 19 batch correlation 87.8%: reproduces lower (~72%) on post-B62.** Hostile-amplification pattern holds. Reinterpretation as "global state dominance" stands — argues for Phase 19.5 AMR approach, not cadence change.

   **Phase 19.4 must re-derive every recalibration recommendation from post-B62 data with sibling-strategy WR controls before shipping any threshold or formula change.** The Item 18 FinalScore-anti-predictive direction is robust enough that Phase 19.4 work is still warranted; the source-pool profitability conclusion is wrong and must not be acted on.

This is not a Phase 19.4 blocker — it is a methodology requirement that the recalibration process must satisfy. The decision gate at end of Phase 19 paper audit is now: "do the empirical paper-mode outcomes (with sibling controls) support the recalibration changes B66 proposed, OR do they show that B66's findings were window-confounded?"

Decision gate: after several days of paper trading shows real WR / streak / FinalScore-vs-outcome data, we recalibrate SQE thresholds against actual paper observations rather than against VTS data.

Scope (from `BATCH_66_SCOPE.md`):
- 6 formula constant promotions to `module_constants`
- PredConf rolling window (replace all-time cumulative)
- Per-underlying position limits (cross-pair correlation cap)
- Realized-EV-adaptive floor
- rankingScore logging

May be split into multiple sub-deploys per the original scope. May be partially deferred to post-launch if paper-trading evidence suggests current SQE behavior is acceptable.
### 19.4.5 Observational Decision Gate — pre-launch reordering (NEW 2026-04-26, Kyle directive)

**Status:** added 2026-04-26 after B65.6 closed via SKIP. Sits between SQE recalibration (19.4) and AMR (19.5). The gate's job is to use 1-2 weeks of clean active-paper-trading data to decide which currently-post-live items might need to move pre-live.

**Trigger:** runs once after the trading engine is verified working in paper mode (19.1–19.3), SQE recalibration is complete (19.4), and ~~B72 lever-to-`module_constants` migration is complete~~ **B72 lever migration is complete (✅ shipped 2026-05-05; B72.1 2026-05-05; B72.2 2026-05-06)**. By this point the system is stable, observable, and tunable from the database — the prerequisites for collecting decision-grade observational data.

**Reference document:** `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md` — captures the per-pair classifier work that was done pre-Phase-19 and intentionally NOT shipped, so future-CC reading this gate during Phase 19 has the full record of what was tested and why we deferred to observation rather than building a fix in advance.

**Observation scope (1-2 weeks of paper trading):**

The gate watches for several conditions that, if observed, would justify pulling normally-post-live work into the pre-launch path:

1. **Hostile-window recurrence at active-trading scale.** The B65.6 work showed that VTS sees recurring hostile windows (04-22 trend-rider failure, 04-18 reversal-strategy failure, etc.). Active-trading filters are stricter than VTS, so the streak phenomenon may attenuate naturally. If active-paper-trading shows similar hostile-window concentration → **move Phase 19.5 AMR into pre-launch.** If it doesn't → AMR can stay post-launch.
2. **Daily signal volume.** If active-paper-trading is generating low daily signal counts (e.g., < 5 signals/day across the whole pair universe), the system isn't capturing enough opportunity to be meaningfully validated. **Trigger to move XStocks + Perp Futures (currently Phase 21.5) forward into pre-launch** so the pair universe expands and signal volume comes up to a level we can audit.
3. **Per-pair classifier misclassification visible in active trading.** If TFS-tagged pairs in active trading show outcome-vs-confidence inversion comparable to the 04-22 VTS pattern (TFS 13.8% WR vs STR 83.3% WR), → reopen B65.6 as a pre-launch fix using the candidate variables documented in §4 of the findings paper.
4. **Hardcoded constants causing operational pain.** If during the observation period the team needs to change any threshold, weight, or limit and finds it requires a code redeploy, → indicates B72 lever migration was incomplete and should be expanded before launch.
5. **Modularization friction.** If during observation the team identifies cross-module changes that require touching multiple files in the monolith to test ideas, → consider pulling some Phase 21.4 modularization work pre-launch (specifically the modules that block the testing work).
6. **Machine learning data sufficiency.** If by end of observation the system has accumulated enough trade + classifier-input + outcome data that ML model training becomes obviously valuable, → consider pulling Phase 17 ML Design pre-launch as well.
7. **Ladder net contribution at active-trading scale (added 2026-04-26, narrowed by B65.4.1 hotfix same-day).** Per `B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md` — original B65.4 formula cost ~$11 in absolute terms vs the counterfactual of just exiting at original target across the first 5 closed laddered VTS trades. **B65.4.1 hotfix shipped 2026-04-26** changing the rung floor formula from `target * (1 - totalCost/2)` (floor below target) to `target * (1 + slippage * bufferMultiplier)` (floor above target). The hotfix narrows the Phase 19.4.5 question from "fix formula or retire ladder" to "**tune multiplier or retire ladder**." The buffer multiplier is now a `module_constants` entry (`rung_floor_slippage_buffer_multiplier`, seed 1.0) so calibration is a DB update, not a code change. Phase 19.4.5 should track laddered-trade actual vs counterfactual across at least 30 laddered trades under the hotfix. Reporting instructions preserved at `BATCH_65_4_1_HOTFIX_COMPLETION.md` §5 — runnable ad-hoc using grep + awk + manual aggregation; refactor to scripted form when cohort grows past n=30. Decision options at end of observation: (a) keep multiplier at 1.0 if net contribution is positive, (b) tune multiplier up/down via DB, or (c) retire ladder design in favor of just-take-target-and-exit if even the slippage-buffer formula doesn't deliver positive net contribution.

8. **Low-volume pair exclusion from moonbag eligibility (added 2026-04-28, Kyle directive 2026-04-28).** Flagged decision for later: should low-volume pairs be EXCLUDED from moonbag/ladder eligibility entirely so they always exit at original target rather than ratcheting? Evidence from B65.4.1 verification 2026-04-28 (`B65_4_1_LADDER_TABLE_2026_04_28.md`): the ladder's biggest losses are concentrated on illiquid pairs (2Z/USD, ATH/USD, GWEI/USD, RENDER/USD/EUR, TAO/EUR) where slippage on the stop-out fill swallows the slippage buffer and pushes actual exit below the original target value. High-volume pairs (JUP, SNX, INX) show clean hotfix behavior. **Decision is deferred to allow more data accumulation** — Kyle directive 2026-04-28: "the longer we let it run, the more data we'll see, and it will be easier to make that decision." The decision belongs in the Phase 19.4.5 observational decision gate alongside item 7 (ladder net contribution). Implementation if approved: new `module_constants` entry `moonbag_min_volume_24h_usd` (seed e.g., $500K), checked in `isMoonbagQualifier` (`server/services/trailing-exit-controller.ts`) alongside the existing strategy/source-pool qualifier list. Pair-by-pair, DB-tunable. ~1-2 days work.

9. **Daily loss budget service + kill-switch auto-trip wiring (moved to dedicated 19.0.B 2026-05-21).** ⚠️ **Now sits as OPTIONAL Phase 19 batch 19.0.B above — see that section for full scope.** Item retained here for cross-reference only. Surfaced during B67 V2 pre-audit code-level inspection: (a) **no daily-loss aggregator service exists in the codebase** (grep on `dailyPnL|daily_pnl|aggregate.*loss` returns no service-level matches); (b) **the kill switch's `dailyLossKillSwitchPct` threshold is configured in `guardrails_v2` table (probably 25%) but no automated enforcement code exists** — `tripKillSwitch()` accepts `lossPercent`/`threshold` params but is only called manually via UI/API. The 25% kill switch is currently a manual safety mechanism, not an automated one. Phase 19 paper observation watches whether daily-loss-budget protection would have caught real loss patterns. **This gap MUST be closed before any real capital is at risk in live trading.** Live-trading activation is gated on this work being complete and tested. If Phase 19 observation supports building, build `server/services/daily-loss-budget.ts` (rolling 24h aggregator) AND wire kill-switch auto-trip when `dailyPnL / portfolioValue ≤ -dailyLossKillSwitchPct`. The same batch covers both: aggregator + auto-trip share infrastructure. Resulting service can ALSO be a regime-confidence consumer (B67 had originally scoped this as "Consumer #6"; Kyle directive 2026-04-28 deferred it here). Implementation effort if approved: ~1-2 weeks. **Independent safety-gap framing:** the auto-trip gap exists today regardless of B67 outcome — a hotfix to wire auto-trip on the existing manual mechanism can ship before Phase 19 if observation shows real risk OR if live-trading activation date approaches without the full service being ready.

**Decision artifacts:** at the end of the observation period, the gate produces a written decision document (likely named `PHASE_19_OBSERVATIONAL_DECISIONS.md` when it lands) that lists, for each of the 9 items above:

- What was actually observed
- Whether the threshold for moving the work pre-launch was met
- The decision (move pre-launch / keep post-launch / re-evaluate at next milestone)
- The justification

**Decision-making principle (Kyle directive 2026-04-26):** prefer NOT to build pre-launch fixes that will likely be replaced post-launch. The 19.4.5 gate exists specifically to prevent shipping interim patches that create technical debt. Only move post-launch work into pre-launch when the observed evidence shows the post-launch design point is materially different from what was assumed when the original sequencing was set.

**Why this gate exists:** during the pre-Phase-19 batches (B62 through B65.6), several investigations surfaced findings that COULD have justified pre-launch fixes but didn't have enough evidence to be sure. The findings paper for B65.6 is the canonical example — the per-pair classifier showed inverted confidence/outcome on 04-22, but no per-pair fix in the current input space was sharp enough to ship without unacceptable clean-day cost. The decision was to NOT ship something that might be replaced by Phase 19.5 AMR. This gate formalizes that pattern: defer pre-launch fixes to the observational stage when the evidence will be cleaner, then make final go/no-go calls with active-paper-trading data in hand.

**Phase 19.4.5 expected outcome:** a written decision document for each of the 6 observation items, plus any pre-launch reordering of subsequent work that the observations justify. By the end of 19.4.5 the team has empirical data about what the system actually does when running close to active conditions, which informs whether to proceed to Phase 20 (Production Hardening) directly or to insert additional pre-launch work (AMR, XStocks, Modularization, ML) first.

---

#### Crypto strategy-signal re-validation (Phase-25-homed; Kyle directive 2026-06-03)

The xStock B3.1a gate-correctness audit surfaced that each strategy's own **trade-construction settings** (entry trigger, stop/target geometry, hold horizon, indicator periods/levels, pattern tolerances, bar frequency) were never empirically fitted — for xStock OR for crypto (inherited from the original pre-data strategy design; the crypto work to date calibrated gates/filters, not the strategies' own signal parameters). **The item:** apply the same re-validation methodology established by the xStock strategy-fit effort to crypto (crypto_spot + crypto_perp), asset-class-scoped throughout. The exploratory crypto bar-frequency study (2026-06-03, `Claude Comms and Packages/Batch Completion/CRYPTO_BAR_FREQUENCY_EXPLORATORY_STUDY_2026-06-03.md`) is the parked baseline evidence: no decision-grade signal to change crypto's 60-minute bars; the "interval change = foundation change" caveat applies to crypto with the same severity. Original directive text: archive, 2026-06-03 update block.

#### 19.5 — anchor stub (superseded section)

> **Anchor preserved.** The original "§19.5 Adaptive Market Response (conditional)" section is SUPERSEDED: the conditional framing dissolved when Kyle locked "build it" (2026-05-21), the AMR **body** became Interphase item 5 / catalog row 19-19 (§3.1), and the **brain** (ML M2 posture model) is row 25-6 above. References elsewhere to "Phase 19.5 AMR" resolve here. Original text: archive.

---

### §3.4 — Phase 16 + Phase 20: Cleanup + Production Hardening (run together, after Phase 25)

> **Run-order position: after the Phase-25 comfort gate, before Phase 21 live activation** (Kyle 2026-06-08; Phase 19 deliberately runs BEFORE Phase 16 per the 2026-05-23 decision — the restoration walkthrough creates ground truth on dead-vs-dormant, cleanup then acts on that ground truth). **Exception: §16.7 Test Suite Recovery runs at the START of Phase 19** as a debugging-enabler. Phase 16's legacy register: RUNNING_ISSUES #136.

## Phase 16: Database & Remaining Legacy Cleanup (Weeks 20-23)

**Goal**: Clean remaining legacy infrastructure — legacy database tables, remaining dead code, and schema simplification.

> **Note**: Wave 6 L-Series Cluster Removal was completed early in Phase 13 (Batch 14, 2026-03-04). The entire L12-L20 cluster (29 files, 59 endpoints, ~8,200 lines) has been permanently deleted. What remains for Phase 16 is database table cleanup, schema work, and any remaining legacy cleanup.

### ~~16.1 Wave 6: L-Series Cluster Removal~~ — ✅ DONE (Phase 13, Batch 14)
All L-Series services (17), route files (9), and utilities (2) removed. M3B validation service also removed. See Phase 13 completion notes above.

### 16.2 Database Phase A-B: Isolation & Modularization
- Confirm which legacy tables still have active writers (Phase A)
- Split storage.ts into domain-specific modules (Phase B)
- **Critical ordering**: storage.ts must be modularized BEFORE legacy tables are dropped

### 16.3 Database Phase C: Schema Simplification
- Drop Wave 3 tables (10 Walter tables) — if not already done in Phase 12
- Drop Wave 6 tables (~57 L-Series + ethics + cluster tables)
- Drop Wave 10 tables (4 paper duplicates + V1 guardrails)
- Remove ~40 legacy enums
- Clean schema.ts of dead definitions

### 16.4 Wave 7: Post-L-Series Cleanup
- SafetyGuardrails service removal
- Remaining consumer cleanup

### 16.5 LSP Error Resolution
- Delete legacy files causing LSP errors
- Fix remaining LSP error causes in active code
- Target: zero or near-zero LSP errors in active codebase

### 16.6 Trailing-Percent Code Purge (added 2026-04-25, Kyle directive)

The B65.2 functional ship deleted the paper-execution-engine consumption of metadata-driven `trailingStopPercent` for exit decisions, and B65.4 replaced the moonbag pure-trail design with the ATR-based ladder. The original B65.3 sub-batch ("migrate paper percentage trailing onto ATR TEC") was therefore declared MOOT in the catalog because the migration target no longer existed. Phase 16 will delete the residual references that survived only as legacy or dashboard-write artifacts:

**Required deletions:**
- `server/services/paper-execution-engine.ts:1929` — the single `highWaterMark` write at trade-open, comment-flagged "retained for legacy dashboards; no longer consumed by exit logic." Audit any "legacy dashboards" still reading the field; update them off the legacy path or delete them too.
- `server/services/tec-evaluator.ts` JSDoc paragraph referencing legacy paper trailing — already reduced to a forward-looking note in 2026-04-25 governance commit; remove entirely once the residual `highWaterMark` write is gone.

**Conditional deletions (only if ABCD + SMA Trend Ride strategies are themselves retired in Phase 16 cleanup):**
- `client/src/lib/types.ts:47,52` — `abcdTrailingStopPercent`, `smaTrailingStopPercent` settings type fields.
- `server/services/strategy-engine.ts` ABCD detector (~L232, L293, L314) and SMA Trend Ride detector (~L361, L378, L405, L428) per-strategy trailing-stop logic. These are entry-side strategy detector internals that compute `trailingStopPercent` from `trading_settings` and produce signal metadata — NOT the deleted paper exit-loop path. Decide retire/keep based on whether the strategies themselves still earn their slot in the canonical map after Phase 19 paper audit.
- `server/routes.ts:6602` — settings default literal `'2%'`.
- `1-system-manual/AUTHORITY_BASELINE.md` lines 89, 94 — canonical baseline references for ABCD + SMA Trend Ride trailing-stop. Update only if the strategies are retired.
- `1-system-manual/authority-baseline-v1.json` lines 68, 81 — same baseline JSON.

**Documentation-only references (no code change required):**
- `1-system-manual/sections/PHASE5_TRADE_EXECUTION_AND_LIFECYCLE.md:441`, `1-system-manual/SYSTEM_MANUAL.md:4464` — the engine's own `highWaterMark` field on `TrailingState` (still used inside `trailing-exit-controller.ts` as the secondary dynamic floor). Do NOT delete; this is the live engine field.
- `bridge/reference/DawnTrader_Chat_Archive_*.md` and `Archived Reports - Pre-Phase 12 Governance Implementation/*` — historical archives; do not edit.

**Pass criteria:** post-deletion, `grep -rn "trailingStopPercent"` over `server/` should return only the engine's own internal `highWaterMark` (which is part of the active ATR TEC state, not legacy). Any remaining ABCD/SMA references mean those strategies were kept; document the kept references explicitly so future audits don't re-flag them.

### 16.7 Test Suite Recovery (added 2026-05-13)

**Surfaced 2026-05-13 during BATCH_80 CI verification.** CI Test Suite has been red since at least 2026-05-12 23:23 with ~60 failed tests across 5 unrelated test files. Pre-existing — NOT caused by BATCH_80. CLAUDE.md §7 invariant "ALL 4 GREEN since B56" is currently violated.

**Failing test files (snapshot 2026-05-13 14:00 UTC, CI run `25802780663`):**
- `server/tests/unit/b73-exit-strategy-replay.test.ts` — BE-stop variant scenarios (Variants F, J, Scenarios 12-15). Likely test-data drift from B73.1 ATR real-input change.
- `server/tests/integration/cost_telemetry.test.ts` — DSE Cost Pressure (Directive 11.3C). Likely module_constants schema or seed drift.
- `server/tests/integration/dynamic_sizing.test.ts` — Directive 11.3 DSE (Core Sizing, Volatility/Cost Penalties, Telemetry, Diagnostics, Adaptive Weight Integration). Likely module_constants or storage interface drift.
- `server/tests/integration/b72-dbs-routing-guards-consistency.test.ts` — DBS routing guards mutual consistency.
- `server/tests/unit/b70-run-mode-controller.test.ts` — Run mode controller.

**★ TIMING (Kyle 2026-06-08, reaffirmed 2026-06-09):** the test-suite cleanup now runs at the **START of Phase 19** as a debugging-enabler (green tests are needed to debug paper-active confidently), NOT in Phase 16. The full roadmap reorder to the canonical post-19 order is between-plan item 3.5.

**Approach:**
- Triage each failing test: (a) legitimate regression to fix, (b) outdated test that needs updating, (c) test exercising intentionally-changed behavior that needs rewriting.
- Restore CI to clean green baseline so future batches can rely on the regression-gate signal.
- **★ B79.0n.TEC.b folded in here (Kyle 2026-06-09 — RUNNING_ISSUES #141).** The gate-cleared TEC strict-throw restoration (flip soft `pick`→strict `requireKey` in `refreshTECConfigForClass`) exposes ~15-20 stale TEC test mocks that omit the newest key `rung_floor_slippage_buffer_multiplier` (the retired soft-fallback had silently filled it). Complete those mocks AS PART of this cleanup, then ship the strict-throw flip + a strict-throw test. Production is unaffected (all 11 keys resolve live; soft fallback never triggers). The attempted code change (2026-06-09) was reverted un-shipped.
- Likely sequenced AFTER xstock UI diagnostic-tab fixes close + AFTER BATCH_80 governance closes.

**Out of scope:** if any failing test reveals a live-system bug, file as a separate dedicated batch — don't bundle into Test Suite Recovery.

**Phase 16 expected outcome**: All legacy infrastructure permanently removed. Schema cleaned. ~71 legacy tables dropped. LSP errors resolved. Residual paper percentage-trailing code purged from active codebase. **CI Test Suite restored to green per §16.7.**

---
## Phase 20: Production Hardening (Weeks 37-40)

**Goal**: Harden the system for live trading. Fix all remaining infrastructure, security, and quality concerns.

### 20.1 Database Phase D: Migration Rebaseline
- Generate fresh baseline migration from current schema.ts
- Archive old migration files
- Switch from `drizzle-kit push` to `drizzle-kit generate` + `drizzle-kit migrate`

### 20.2 Database Phase E: Index & Retention Hygiene
- Audit index usage via `pg_stat_user_indexes`
- Drop unused indexes
- Implement retention policies (Hot 0-30d / Warm 30-90d / Cold 90d+)
- Time-based partitioning for high-volume append-only tables

### 20.3 Test Infrastructure
- Add unified test runner scripts (`test:unit`, `test:e2e`, `test:all`)
- Install @testing-library/react + jest-dom for frontend tests
- Minimum frontend test targets: auth token refresh, TradingModeContext, WebSocket reconnection, TopBar start/stop
- Property-based testing for core math (fast-check)
- CI/CD pipeline (GitHub Actions workflow)

### 20.4 Security Finalization
- RBAC enforcement standardization across all routes (RISK-055)
- API versioning (`/api/v1/` namespace) (RISK-056)
- JWT token migration from localStorage to httpOnly cookies (RISK-063)
- Endpoint cleanup: remove any remaining unused server endpoints

### 20.5 Architecture Cleanup
- Decompose monolithic pages (enhanced-system-monitoring 4,528 lines, ai-transparency 2,074 lines)
- Define centralized polling policy (POLLING_TIERS)
- Decompose routes.ts into domain-specific route files

**Expected outcome**: Production-grade infrastructure. Tests, security, database hygiene all at deployment standard.

---
### §3.5 — Phase 21: Live Mode Activation

> **Run-order position: last pre-live block.** Gates: the Phase-25 comfort gate (calibrated-in-paper until comfortable) + **19-17b: the `/api/trading/start` live branch is gated by `module_constants` module `live_engine_gate`, constant `live_engine_enabled` — Phase-21 go-live MUST set it to numeric `1` (NOT boolean true; jsonb booleans are invisible to the B72 numeric resolver).** Also pending here: RUNNING_ISSUES #213 (legacy /live-trading routes bypass the Phase-21 gate — gate-or-retire before live) and 19-18 (live-mode build-approach design decision, made at start of Phase 19).

## Phase 21: Live Mode Activation (Weeks 40-43)

**Goal**: Create and validate live mode trading on Kraken.

### 21.1 Live Mode Engine
- Create Live Mode trading engine based on Paper Mode trading engine
- Resolve BUG-010, BUG-011 (TradingEngine placeholder code for live mode)
- Validate Kraken API integration for live orders (long AND short if confirmed)
- Test live order execution path end-to-end
- Validate kill switch functions correctly for live mode

### 21.2 Paper-to-Live Transition Testing
- Run parallel paper+live (small position sizes) to validate consistency
- Compare paper sim results with live execution results
- Validate fee/slippage models against actual Kraken fills
- Validate cost-model accuracy against real Kraken fee schedules

### 21.3 Live Mode Guardrails
- Validate all risk management guardrails for live mode
- Test emergency shutdown procedures
- Validate database monitoring alerts function correctly
- Confirm ML Safe Mode fallback works under live conditions
- Verify predictive execution bounds hold under real market volatility

**Expected outcome**: Live trading validated. Parallel paper+live confirms consistency. Ready for production.

---
## §4 — POST-LIVE QUEUE (after Phase 21)

> Decided order: **Phase 22 (Publication) → Phase 17 (ML Design) → Phase 18 (ML Implementation) → Phase 17.5 (Smart Thermostat) → Phase 21.4 (Modularization) → Phase 21.5 / Phase 26 (perp futures)** — plus the backlog at the end of this section. None of this is actionable until after live; kept in the live doc because it's plan, not history.

> **Naming note:** "Phase 26" = crypto_perp perpetual-futures onboarding (the old "Phase 25 / B80" label before the number was reused for Calibration-With-Evidence). Post-launch, no SLA.

## Phase 22: Publication (Weeks 43+)

**Goal**: Prepare the application for production deployment.

### 22.1 Build & Deploy Pipeline
- Production build validation
- Environment configuration (staging vs production)
- Database provisioning (consider Neon tier upgrade if approaching 10 GB)

### 22.2 Monitoring & Observability
- Production logging strategy (structured logging replacing console.log)
- Health monitoring endpoints
- Performance monitoring
- Error alerting
- ML performance dashboards (live)


---
## Phase 17: Machine Learning Design (Weeks 23-28)

**Goal**: Execute the "Plan to Create a Plan" — perform the research, mapping, and design work required to produce the ML implementation blueprint (Directive 18.0). This is NOT the ML build itself.

**Source**: "The Plan to Create A Plan for Machine Learning - Phase 12" (1.17.26) — now renumbered to Phase 17 to fit the updated sequence.

> **Important note from Kyle**: This phase will likely require a dedicated brainstorming/design discussion session to decide what the machine learning architecture will look like. The system audit (Phases 1-11) provides the foundation knowledge, but the ML design decisions need collaborative input.

### 17.1 Scope & Grounding (Week 23)
- Define full scope of ML integration
- Align audit categories (functional, architectural, behavioral)
- Establish criteria for "complete system visibility" for ML purposes
- Create audit template for every subsystem: name, role, inputs, outputs, key functions, calculations, dependencies, update frequency, performance sensitivity, ML integration potential, verification requirements

### 17.2 ML Touchpoint & Influence Mapping (Weeks 24-25)

#### Feature Extraction Points (Outbound — what ML will learn from):
- Market State (volatility, spread, LQ/VN)
- Contextual Data (time, session, liquidity)
- Signal Metadata (strategy, pattern, score)
- Trade Lifecycle (open/close outcomes)
- Guardrail Metrics (IMF, SQE)
- Structural Regime, Directional Bias, and Friction Scores (Global + Pair-level)
- Predictive Adjustment history and outcomes

#### Influence Points (Inbound — where ML output goes):
- DSS (strategy weighting)
- SQE (signal qualification)
- RTB Queue (queue pruning)
- DSE (dynamic sizing & stop management)
- DSS & IMF thresholds (auto-tuning)
- Canonical weight updates (replacing rules-based calibration)

#### Deliverable: ML Touchpoint Matrix
- Every component → data → ML interaction
- Labeled as: Outbound (learning source), Inbound (intelligence consumer), Bidirectional (adaptive feedback)

### 17.3 Infrastructure Design (Weeks 25-26)
- In-process module vs local microservice decision
- Inter-process communication design (gRPC, WebSocket, shared memory)
- Persistent state store design (on-disk or vector DB) for context preservation
- Rolling memory buffers for real-time adaptive recall
- Performance budgeting: model inference latency budget (<100ms per signal)
- CPU/GPU resource profiling and trade-off options
- Safe Mode fallback design: revert to rules-based (Phase 15) if ML misbehaves
- Watchdog for memory drift or performance degradation
- **Requirement**: Must run entirely locally, no cloud dependency

### 17.4 Research & Feature Engineering (Weeks 26-27)
- Evaluate ML architectures: Gradient Boosted Trees (tabular data), RL agents (adaptive sizing), etc.
- Assess local ML libraries: ONNX runtime, LightGBM, PyTorch local
- Feature Store schema design (universal, normalized, labeled)
- Explainability tools: SHAP, LIME for transparency and trust
- Model Drift Detection design
- Real-time dashboard design for confidence and error rates
- Auto-trigger "safe mode" when drift exceeds threshold

### 17.5 Blueprint Assembly (Weeks 27-28)
- Merge data flow, touchpoints, infrastructure into actionable directive
- Development milestones (Crawl, Walk, Run, Fly)
- Testing protocols
- Rollback procedures
- Monitoring dashboards

#### Deliverable: Directive 18.0 (Comprehensive Predictive Learning Architecture)
- The fully vetted, implementation-ready ML plan
- Reviewed and approved by Kyle before Phase 18 begins

**Expected outcome**: Complete ML architecture design. Feature Store schema. Touchpoint Matrix. Infrastructure proposal. Implementation blueprint ready for execution.

### 17.6 Trend Mining Engine — design consideration (Kyle directive 2026-05-04)

**Concept:** A separate engine whose ONLY job is to churn through archived data (B70 + B74 archives + paper-sim trade history + every signal eval) and propose candidate trends/patterns/signals that no human and no narrowly-defined model would surface — across pairs, regimes, strategies, time-of-day, macro context, volume regimes, etc. Not a hypothesis-driven coder writing "I think X matters"; an automated proposer that explores the feature × pair × regime × time-window space and surfaces statistically interesting candidates for the validation pipeline to ablation-test.

**Why it matters:** Supervised ML (including Phase 18 models) only learns trends in the features YOU give it, predicting the labels YOU define. It does not autonomously discover edges in dimensions you didn't think to include. A Trend Mining Engine fills that gap — it's the candidate-generator, the validation pipeline (B67.0 ablation framework, already built) is the gate, and ML / chain modulators / strategy roster are the consumers. Top quant funds (Renaissance, Two Sigma, D.E. Shaw, Citadel) all run "alpha factory" pipelines built around this idea. Open-source precedents exist: tsfresh, Featuretools, Qlib (Microsoft), mlfinlab, WorldQuant Brain, Numerai.

**The trap to design around:** multiple-comparisons / data-dredging / p-hacking. A naive engine that returns 47 patterns/week without rigorous validation is actively worse than useless. Discipline required: Bonferroni / FDR correction, walk-forward holdout, friction-net EV gates, sample-size minimums, Bayesian skeptical priors, explicit null hypotheses per candidate.

**Scope-of-design considerations for Phase 17 to address:**
- Decide whether to build in-house, integrate Qlib/mlfinlab, or wrap an external service (Numerai-style).
- Define the "candidate language" — what kinds of patterns the engine searches for (single-feature thresholds, feature interactions, time-conditional signals, regime-conditional signals, motif/shapelet patterns, association rules, anomaly clusters).
- Define the validation discipline — how the candidate stream gates into the existing B67.0 ablation framework. Realistic throughput target: most weeks the engine outputs zero new signals; rarely (quarterly?) it surfaces 1-2 high-quality candidates that pass validation.
- Define the kill switch — engines that are too prolific become noise generators; need a "results per quarter" sanity ceiling.
- Decide whether the engine runs continuously (resource cost, but always-on discovery) or in scheduled passes (cheaper, batchier).
- Decide whether engine output is auto-deployed (no — too risky) or human-reviewed before activation (yes — Langston/Kyle gate).

**Sequencing:** Trend Mining Engine is an ML-DESIGN-PHASE consideration, not a standalone earlier phase. It belongs in Directive 18.0 as a peer architecture to the supervised ML pipeline, sharing the Feature Store + Validation Pipeline. Concrete build can land in Phase 18 (alongside the Crawl/Walk/Run/Fly milestones) or as a Phase 22+ research track post-launch. Pre-launch: do not build. Pre-launch: ensure B70 data capture is designed so that when we DO build, the data is ready (B70 forward-design note: archive, Strategic Sequencing section).

**Forward-design implication for ML-light:** ML-light must NOT be designed as the system's sole "discovery" engine. It is a supervised classifier consumer. The Trend Mining Engine is the discovery engine. Both feed the validation pipeline. (ML-light forward-design note: archive, Strategic Sequencing section.)

---
## Phase 18: Machine Learning Implementation (Weeks 28-34)

**Goal**: Build and deploy the ML system as designed in Phase 17. This replaces and extends the rules-based predictive execution from Phase 15.

> **Note**: The specific sub-phases of Phase 18 will be defined by Directive 18.0 (the output of Phase 17). The following is a high-level outline — the actual implementation plan will be much more detailed.

### 18.1 Crawl: Feature Store & Data Pipeline
- Build Feature Store with schema from Phase 17.4
- Wire all Outbound touchpoints (data capture)
- Validate data quality and completeness
- Historical data ingestion for initial training

### 18.2 Walk: Model Training & Validation
- Train initial models on historical data
- Validate against paper trading results
- A/B comparison: ML predictions vs rules-based predictions (Phase 15)
- Explainability verification (SHAP/LIME outputs make sense)

### 18.3 Run: Integration & Parallel Execution
- Wire Inbound touchpoints (ML output → system logic)
- Run ML in parallel with rules-based system (shadow mode)
- Compare outcomes, calibrate confidence
- Drift detection active

### 18.4 Fly: ML as Primary Intelligence
- ML replaces rules-based policies as primary decision layer
- Rules-based system becomes fallback (Safe Mode)
- Continuous learning active within 11.8B-E bounds
- Monitoring dashboards live

### 18.5 Trend Mining Engine — parallel architecture (per Phase 17.6 design)

**Status:** Build per the design produced in Phase 17.6 (see above). Either ships as part of Phase 18 alongside supervised ML, or splits into a Phase 22+ research track post-launch — Directive 18.0 makes the call.

**Architecture (regardless of when it ships):**

```
        ┌────────────────────────┐
        │ Trend Mining Engine    │  ← candidate generator
        │ - tsfresh feature gen  │     (auto-proposes signals)
        │ - motif discovery      │
        │ - subgroup mining      │
        │ - per-pair / per-regime│
        │   pattern hunting      │
        └─────────┬──────────────┘
                  │ proposes candidates
                  ▼
        ┌────────────────────────┐
        │ Validation Pipeline    │  ← gate (already built — B67.0)
        │ - holdout + FDR        │
        │ - tertile monotonicity │
        │ - friction-net EV gate │
        │ - sample-size gates    │
        └─────────┬──────────────┘
                  │ filters down to ~1-2 keepers/quarter
                  ▼
        ┌────────────────────────┐
        │ Confidence Chain       │  ← consumers
        │ Strategy Roster        │
        │ ML-light feature set   │
        │ Supervised ML feature  │
        │   inputs (Phase 18)    │
        └────────────────────────┘
```

**Key principles:**
- Candidate generation and validation are decoupled. Generators compete; the validator is canonical.
- ML-light (pre-Phase-16 batch when it ships) is a CONSUMER of validated signals, not a generator.
- Phase 18 supervised ML is also a consumer — its feature inputs include validated mining outputs.
- Engine output requires human gate (Langston/Kyle) before activation. No auto-deploy of mined signals.
- "Results per quarter" sanity ceiling enforced — if the engine is producing >5 keepers/quarter, suspect false positives, tighten discipline.

**Pre-Phase-18 work:** ensure B70 data capture is wide + structured for automated mining tools (B70 entry: archive, Strategic Sequencing section). No engine code lands pre-launch.

### ML Safety Principles (Throughout):
- No overwrite without versioning — all static logic remains as fallbacks
- Everything observable — every ML output or adjustment logged and auditable
- Fail gracefully — if ML crashes or returns low confidence, revert to rules-based (Phase 15)
- Performance first — ML inference cannot block or delay live trading functions
- Authority Baseline (11.8C) is the floor — ML cannot violate the bounds defined by 11.8B-E

**Expected outcome**: ML system operational, producing real adaptive intelligence. Rules-based system retained as Safe Mode fallback.

---
## Phase 17.5: Smart Thermostat / Rules-Based Predictive Execution (Post-Live, Deferred from Phase 15b)

**Status**: DEFERRED here from pre-live on 2026-04-14. Originally planned as B60 / Phase 15b. Decision: cannot tune adaptive policy on top of a misclassified state model. Now sequenced after the new Phase 15b regime restructure has been validated in live mode and after ML design+implementation (Phases 17, 18).

**Goal**: Enable the "Smart Thermostat" — allow the predictive learning system to make bounded, rules-based filter adjustments. This is the pre-ML adaptive layer (Version 2 from Kyle's 11.8 document — rules + sensors, no AI).

### 17.5.1 Rules-Based Policy Engine
- Implement the policy execution layer defined by 11.8B-E
- Policies are deterministic, explainable, reversible
- Example policy: "In LOW_VOL_CHOP regime, increase minVolume by 15%"
- All adjustments logged, auditable, and bounded by 11.8B-E constraints

### 17.5.2 Predictive Adjustment Execution
- Wire Predictive Adjustments (currently observational-only) to execute bounded changes
- Pattern confidence multipliers can now modify behavior (within 11.8B-E bounds)
- Strategy weighting influenced by recent performance data

### 17.5.3 Calibration Execution
- Learning Calibration can now update canonical weights (within 11.8B-E bounds)
- Recommendations become executable (not just observational)
- All mutations logged against Authority Baseline for comparison

### 17.5.4 Regime-Aware Adaptation
- Structural Regime (Global + Pair-level) drives filter adjustments
- Directional Bias feeds into strategy selection weighting
- All three dimensions (Structural Regime, Directional Bias, Friction) feeding into predictive learning for correlation analysis

**Why deferred to post-live**: The new Phase 15b restructure changes the regime taxonomy and DBS integration. Smart Thermostat policies would need to be rewritten to match the new state model — so building the thermostat first and then redesigning the model would waste the work. Post-live ordering also lets ML (Phases 17, 18) inform whether a separate rules-based layer is even needed.

**Expected outcome**: System adapts to market conditions using rules + statistics. Not static, not ML. The intelligent middle ground.

---
## Phase 21.4: Modularization — 8-Module Architectural Extraction (Post-Live, formalized 2026-04-26, refined 2026-04-26)

**Status:** Formally inserted into the roadmap on 2026-04-26 in response to Kyle's question about where comprehensive lever-to-database migration lives. The phase has existed as an architectural plan in `Claude Comms and Packages/Scope Files/MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` since B63 close, but was not formally scheduled as a discrete phase header in this roadmap until now.

**Refinement 2026-04-26 (Kyle directive):** Comprehensive lever-to-`module_constants` migration was originally placed here, but per Kyle's go-live design intent, all levers must be DB-tunable BEFORE live trading. Lever migration moves to **B72 pre-launch** (final pre-Phase-19 batch). **B72 SHIPPED 2026-05-05 + B72.1 2026-05-05 + B72.2 2026-05-06** — 34 modules / ~163 rows now live. Phase 21.4 retains only the 8-module architectural extraction work, which is the heavy structural decomposition that benefits from live-trading evidence on which modules need which resolution scopes.

**Goal:** Extract 8 canonical modules from the current monolith. The 5D `(exchange, asset_class, filter, strategy, regime)` resolution matrix is already in place (B65.1 module_constants infrastructure + B72 comprehensive lever migration); Phase 21.4 wires the modules together against that matrix.

**Why post-live:** the architectural decomposition is a coherent exercise that benefits from being done once with full intent. By post-live, the system has live-trading evidence for which boundaries between modules matter most. Phase 21.4 is the prerequisite for Phase 21.5 (Exchange Expansion — XStocks + Perpetual Futures); without the 8-module decomposition, every new exchange or asset class would have to thread through the existing monolith.

**Pre-launch preview in Phase 19.0 (added 2026-04-26, renumbered from 18.5):** two of Phase 21.4's eight canonical modules — Exchange Adapter and Filter Module Family — land pre-launch as part of the VTS-partition work in Phase 19.0 (which sits at the very start of Phase 19, before paper audit work begins). The pre-launch versions are scoped to the VTS observation surface only (low-risk, doesn't affect active trading). Phase 21.4 then extends the same pattern to all 8 modules across the active-trading system. By that point the architectural pattern has been validated in production for months.

**Why before Phase 21.5 Exchange Expansion:** the 5D matrix is the prerequisite for adding new exchanges and asset classes in Phase 21.5. Without modularization, every new exchange or asset class would have to thread through the existing monolith — defeating the architectural intent.

**Addition 2026-04-29 (Kyle directive):** **Exit-strategy interface + per-asset-class strategy selection** is extracted as part of the 8-module architectural extraction. Triggered by B73 ablation findings (multi-week observation of 12 BE-stop / trailing-stop variants). Even if crypto data says "disable both BE and trail," equities have different microstructure (lower noise, slower retraces, gap risk) — exit-management should be pluggable so different asset classes can plug in different strategies. The IExitStrategy interface design is INFORMED by B73 outcomes, not designed speculatively before data. No pre-launch batch for this — it lands as part of Phase 21.4 whenever the modularization phase happens.

### 21.4.1 8-module extraction

Per `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md`:

1. **Exchange Adapter** — abstracts exchange-specific I/O (Kraken REST/WS, future Binance/Coinbase/etc.)
2. **Filter Module Family** — pluggable filter set per asset class
3. **Context Provider (MCE)** — extended to consume external data (B67/B68 outputs)
4. **Eligibility** — gates which signals proceed to scoring
5. **Scoring Kernel** — computes FinalScore / HybridScore / etc. with module_constants-resolved weights
6. **Threshold** — DB-tunable per (exchange, asset_class, filter, strategy, regime)
7. **Profitability** — net-EV computation with friction, slippage, fees
8. **Ranking** — ranks eligible signals for slot allocation

### 21.4.2 ~~Comprehensive lever-to-`module_constants` migration~~ — MOVED TO B72 (pre-launch) — ✅ SHIPPED 2026-05-05

Per Kyle directive 2026-04-26: comprehensive lever migration moved to **B72 pre-launch** as the final pre-Phase-19 batch. **B72 SHIPPED 2026-05-05** + **B72.1 SHIPPED 2026-05-05** + **B72.2 SHIPPED 2026-05-06**. 34 modules / ~163 rows live in production sync-read paths; 18/18 canonical strategies DB-tunable. Original go-live design intent (all levers DB-tunable before live trading) achieved. This phase retains only the architectural extraction work (§21.4.1). See `BATCH_CATALOG.md` rows 212-214 + `BATCH_72_COMPLETION_REPORT.md` + `BATCH_72_2_COMPLETION_REPORT.md`.

### 21.4.3 storage.ts modularization (folded in from Phase 16.2)

Phase 16.2's "storage.ts must be modularized BEFORE legacy tables are dropped" is also covered here as part of the 8-module extraction (Exchange Adapter + per-domain storage). The Phase 16 reference may need to be re-sequenced if the modularization phase happens later than Phase 16; alternative is to do a minimum storage.ts split as part of Phase 16 cleanup and the full split as part of 21.4.

**Phase 21.4 expected outcome:** monolith decomposed into 8 modules. With B72 lever migration already complete pre-launch, the 5D resolution matrix is populated and the modules just need to be wired against it. Adding a new exchange or asset class in Phase 21.5 becomes a configuration-and-adapter exercise, not a code-rewrite exercise.

---
## Phase 21.5: Exchange Expansion — Perpetual Futures (Post-Live)

**Status (2026-05-21):** XStocks already integrated pre-launch (Phase 24 closed 2026-05-10; xstock_spot universe expanded to ~450+ tokenized equities including Fortune 500 / NASDAQ / ETFs / index funds after the May discovery of ~220 previously-unrecognized feeds). Phase 21.5 now narrows to PERPETUAL FUTURES only.

**Goal**: Onboard Kraken Futures (~10 perpetual pairs) as the next asset class after live activation. Apply the canonical asset-class onboarding workflow (`ASSET_CLASS_ONBOARDING_WORKFLOW.md`) refined through xstock_spot.

**Why post-live**: Kraken Futures has only ~10 perp pairs — the marginal universe expansion is small relative to the 450+ tokenized equities the live system already trades. The calendar weeks needed for a clean perp onboarding (Day 0 friction extraction, funding-rate macro extension, leverage/liquidation guardrails, perpetual settlement, observation window) are better spent on Phase 19 paper audit pre-launch and reserved for post-launch when live data is informing the onboarding choices.

### 21.5.1 ~~Kraken XStocks Integration~~ — ✅ COMPLETE PRE-LAUNCH (Phase 24, 2026-05-10)

xstock_spot fully onboarded across 9 sub-batches. ~450+ tokenized equities feeding the system post-discovery (May 2026). See the Phase 24 summary in §5 + archive.

### 21.5.2 Perpetual Futures Integration
- Add Kraken Futures API endpoints
- Funding rate awareness in cost model
- Leverage-aware position sizing in guardrails
- Short trading capability (futures enable shorts without capital constraints)
- Futures-specific risk management (liquidation prevention, margin monitoring)

### 21.5.3 Cross-Asset Infrastructure
- Unified portfolio view across asset classes
- Asset-class-aware regime classification (crypto, equity, futures may have different regime characteristics)
- Performance tracking per asset class

---
## Post-Launch Enhancement Priorities

These items are deferred and not currently sequenced. Listed for reference:

### WebSocket Event Triggers
- Real-time Kraken WebSocket feeds for time-sensitive opportunity detection between scan cycles
- Supplements (does not replace) timer-based scanning

### Parallel Signal Generation
- Promise.all batching in evaluateMarket() for concurrent pair evaluation
- Only if throughput becomes a constraint

---

**Post-Live tracked work items (additional backlog, to be slotted into post-live phases):**
- **Predictive learning full teardown** — remove the cosmetic predictive learning services that B59 labeled as placeholders. Deferred because services are inert, not actively harming.
- **UI redesign** — Predictive Adjustments tab redesign, Events tab redesign as a news-report-style feed, broader UI cleanup.
- **Modular filter/strategy architecture** — refactor SQE/RTB/strategy filter layer into pluggable modular architecture so new strategies and filters can be added without touching core orchestration.
- **`liquidity_trap` strategy redesign** — current implementation flagged for redesign post-live.
- **`THREE_SOLDIERS` legacy cleanup** — remove residual legacy code paths around the THREE_SOLDIERS pattern after the new dual-path canonicalization is live.
- **X-stocks / perpetual futures integration** — covered by Phase 21.5 above.
- **ML Adaptive Intelligence Layer** — covered by Phases 17, 18 above.
- **VTS always-on** — only adopted if the effort is genuinely simple AFTER Kraken rate-limit research confirms it does not blow the API budget. Conditional, not committed.

### Additional post-live backlog (consolidated 2026-06-10 reorg)

- **Exchange-Data Adapter / alternate-source feeds (Binance/Coinbase/KuCoin) + symbol normalizer** — the still-deferrable half of the old "Phase 19.0 VTS Partition" section. The VTS-standalone half was RESEQUENCED pre-19 (Interphase item 4, ingest-once-fan-out design); the alternate-source adapter half remains post-launch, possibly never built (the fan-out design uses the single Kraken feed). Original design text: archive.
- **Periodic ML edge-scan scheduled job** (Kyle 2026-06-05) — the HCE engine becomes a scheduled weekly/monthly routine re-running winner-commonality / selectivity / raw-feature analysis → ranked candidate gates + drift report. Scheduled infra, not model work.
- **Alt-data ranking layer (Phase 25+ data layer)** — AI/LLM scoring of news/earnings/events (xStocks) + on-chain flows / smart-money (crypto), feeding signal confidence + ranking; xStock-first. Fuller home: `1-system-manual/STRATEGIC_DIRECTIONS_AND_AI_EDGE.md`.
- **Further out (bigger portfolio / new access):** delta-neutral funding-rate / cash-and-carry yield (needs perps); buy-and-hold investment sleeve; cross-sectional ranking (market-neutral gated on short-sale access — not available via Kraken today). Source: 2026-06-05 strategic-directions fold-in (archive) + `STRATEGIC_DIRECTIONS_AND_AI_EDGE.md`.

---
## §5 — COMPLETED PHASES (summaries only — full detail in `_archive/POST_AUDIT_ROADMAP_HISTORY.md`, per-batch record in `PHASE_HISTORY.md` + `BATCH_CATALOG.md`)

- **Phase 12 — Cleanup & Foundation** (✅ Feb–Mar 2026): fixed the critical math errors (DI probability divergence, dual friction models), security hardening, ~200+ dead files removed (Walter/Bob/Cortex ecosystem purge), pipeline unified to one regime engine / one strategy map / one confidence source.
- **Phase 13 — MCE Installation** (✅ 2026-03-04, B14): the Market Context Engine became the single authoritative source for market data, indicators, and regime classification; L12-L20 legacy cluster fully deleted (~8,200 lines).
- **Phase 14 (14.1–14.7) — VTS Real Calculations & Signal Enrichment** (✅ Mar–Apr 2026, B15–B54): VTS wired to real strategy detect functions; DBS implemented; dual-path pattern scanning + merit ranking; family-qualified identity; strategy calibration; ML service scaffold (later retired by B-NEW-54). Short trading DEFERRED INDEFINITELY; VTS data clear/backfill CANCELED.
- **Hetzner + Supabase migration** (✅ B40–B47): off Replit (frozen 2026-03-30) onto staging infra.
- **Phase 11 Finalization — Adjustment Framework + Authority Baseline** (✅ B58): the "decision constitution" (what may be adjusted, bounds, evidence, cadence) + the authoritative V1.0 baseline. Phase 11 CLOSED.
- **Phase 15a — Predictive Learning UI Audit & Data Path Fixes** (✅ B59): fixed three broken data paths; discovered predictive-learning services are cosmetic; discovered DBS fully implemented but ORPHANED — the finding that triggered Phase 15b.
- **Phase 15b — Regime / DBS / Strategy / Filter Restructure** (✅ B61–B65): DBS validated and made a first-class classifier input (B62); regime taxonomy redesigned; strategy re-audit; module_constants infra (B65.1) + TEC shared service + ladder trailing (B65.2–B65.4). The B72 comprehensive lever sweep (2026-05-05) made ~163 levers DB-tunable.
- **Phase 24 — xstock_spot onboarding** (✅ onboarding closed 2026-05-10; governance-closed 2026-06-08): ~450+ tokenized equities onboarded across 9 sub-batches + the B79.0n umbrella (18 sub-batches) + the xStock calibration arc (B.0–B.5: 15-minute bar foundation, regime/IMF/DBS recalibration, LQ depth-scale, strategy-fit groundwork — data-blocked tail parked in Phase 25 items 25-12…25-15). Canonical workflow: `ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Umbrella report: `Claude Comms and Packages/Batch Completion/PHASE_24_UMBRELLA_COMPLETION_REPORT.md`. The 12 cross-cutting onboarding patterns: SYSTEM_MANUAL appendix + archive.
- **Interphase 24→19 items 1–3.5** (✅ 2026-06-08/09): onboarding-workflow rebuild · Phase-24 governance close · ml-service retirement (B-NEW-54) · issue-homing audit (~90 entries homed) + decision-provenance capture (B-NEW-53.x, was roadmap 19-20).

---
## §6 — DECISION LOG (newest first; one line per decision; full original update blocks in the archive file)

- **2026-06-10** — Roadmap reorganized to run-order structure (this document); standing rules adopted (one home per topic; edit-in-place + decision log). Kyle + Langston approved.
- **2026-06-10** — Interphase item 4.6 added (scan-stall + disk hygiene): Langston root-caused the event-loop stalls to the ~306-pair scan pinning the CPU; hygiene half immediate, structural fix scoped from the item-4 throughput study, lands before 4.5/4.7.
- **2026-06-09** — Interphase item 4.7 added (per-asset-class regime, B-NEW-48) just before AMR; TFS sustainability gate (#111) homed to 25-3; item 3.5 issue-homing audit closed (~90 entries homed, 11 stale closed).
- **2026-06-08** — Canonical post-19 execution order locked (Kyle, overriding the parallel-two-track rec): 19 → 25 → 16+20 → 21, strictly sequential; go-live gate = comfortable-in-paper. Paper mode declared PERMANENT (runs post-live as testing ground). Kraken tiered-fee fix added as Interphase item 4.5 (account confirmed Tier 1: 0.80% taker vs 0.26% modeled — real friction ≈ 2.5× model). Phase-24 governance close + onboarding-workflow rebuild completed.
- **2026-06-05** — Strategic directions folded in (HCE study: no hidden edge in existing trades; path = selectivity + sizing + discipline + new data). VTS-standalone RESEQUENCED post-launch → Interphase item 4 (ingest-once-fan-out kills the rate-limit blocker). AMR body placement confirmed pre-19 (decoupled from the xStock-calibration tail, which parked in Phase 25). Execution/friction reduction → Phase 19. Alt-data ranking layer → Phase 25+.
- **2026-06-03** — Crypto strategy-signal re-validation added (Phase-25-homed): crypto's strategy-internal settings were never empirically calibrated either; reuse the xStock strategy-fit methodology. (Exploratory crypto bar-frequency study ran 2026-06-03: stay at 60m.)
- **2026-05-27** — Phase 19 / Phase 25 SPLIT locked: 19 = "functional from scan to closed trade" (no-outcome-needed work); 25 = "calibration with evidence" (needs paper-active outcomes). Locked item tables 19-1…19-20 + 25-1…25-15 (§3.2/§3.3). B80 crypto_perp relabeled Phase 26, post-launch.
- **2026-05-23** — Phase 19 runs BEFORE Phase 16: the restoration walkthrough creates ground truth on dead-vs-dormant; cleanup acts on that ground truth. (B-NEW-43 Phase 1 close; baseline 488 errors / 68 files.)
- **2026-05-21** — Pre-launch scope tightened: confidence-chain calibration moved into Phase 19 (later 25-2) — VTS and active-trading populations aren't comparable; crypto_perp deferred post-launch; VTS partition deferred post-launch (later reversed 2026-06-05 for the standalone half); daily loss-budget promoted to optional 19.0.B.
- **2026-05-10** — Phase 24 onboarding closed (9 sub-batches); 12 cross-cutting onboarding patterns established; "VTS Observation" terminology rule (never "shadow-mode" for VTS surfaces).
- **2026-05-07** — Multi-Asset VTS Expansion stretch (B78–B81): asset-class + exchange module scaffolding, no-deferrals directive; xstock_spot onboarding began (B79).
- **2026-04-14** — Phase 15b locked (Regime/DBS/Strategy/Filter restructure, B61–B65); B60 Smart Thermostat deferred post-live (→ Phase 17.5); predictive-learning teardown deferred post-live.
- **Earlier (Feb–Apr 2026)** — original roadmap v1–v7 evolution, Phase 12–15 planning detail, the original strategic-sequencing rationale, timeline estimates, risk assessment, and the mapping to Kyle's "Next Steps" document: all in the archive file.

---

*Reorganized 2026-06-10. Prior structure (v7-era, 1,777 lines) preserved verbatim at `1-system-manual/_archive/POST_AUDIT_ROADMAP_HISTORY.md`.*
