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

> **★ Phase-19 TAIL — formalized batch numbers (Kyle renumber 2026-06-30; authoritative detail in `PHASE_19_PLAN.md` §1/§5):** the run-up to the paper switch-on is **P19-B7 = ranking fix (B7.1, the make-or-break) → maker/taker shared service (B7.2 — D6 rung-2, the real crypto opener at the fee wall) → crypto gate-10 lifecycle proof** → **P19-B8 = paper monitoring screens for BOTH classes + THE SWITCH-ON (staged crypto→xStock) + an explicit xStock lifecycle proof** (the flip lives inside B8) → **P19-B9 = sustained paper run + audit** (B8 = make-it-work; B9 = run-for-real + audit for Phase-25). This resolved a naming collision (two things were numbered "~B7" — the maker/taker service vs the paper UI shells). **Both-classes EXPLICIT (D1/D3/D7):** crypto AND xStock both run the full scan→filter→evaluate→signal→RTB→promote pipeline together (shared, not gated); only active EXECUTION is one-class-at-a-time during the validation window; both paper-working by Phase-19 close.

---
**★ GOVERNANCE-STANDARDIZATION ARC (GOV-ARC, #668) — Kyle-directed, runs CONTINUOUSLY alongside the phase work (added 2026-08-07).** Not a phase item and deliberately not sequenced behind one: it is the arc that makes every phase’s governance trustworthy. Pieces + state: rules-file slimming to Anthropic standards (1a+1b CLOSED; 1c/1d/1e open) · **decision records (#671) — the ~3,000 reviewer rulings that live on one box outside git, scoped and NOT started; ⛔ DURABILITY FIRST AND SEPARABLE: the corpus-into-git fix is NOT sequenced behind the harvest** · the governance tier list incl. the `STORAGE_POLICY.md` content-refresh obligation · the table catalogue · measurement-discipline hooks. **Status home: `RUNNING_ISSUES` #668 + the GOV-ARC board card.** Owner CC-A.

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
| 19-4 ✅ DONE 2026-06-17 (P19-B6) | §19.0.B Daily loss-budget service + kill-switch auto-trip | Aggregator + auto-trip on rolling 24h paper P&L vs portfolio. Safety mechanism. **SHIPPED as a RESTORE of the deleted Phase-8 auto-trip (`daily-loss-budget.ts`): session-anchored rolling-24h realized loss %, auto-trips the existing `tripKillSwitch` (which flattens), 2 warning tiers (per-mode, % of kill), dual alert surface (operational + website banner), circuit-breaker restart-rebaseline. DORMANT-in-effect until paper-active (B7b). Realized-only → unrealized gap homed #303/Phase-25. Follow-on P19-B6.8 (full paper-vs-live guardrail separation) scheduled.** |
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
**★ Phase-19 deposit — 2026-06-16 (catch-up; the roadmap had drifted behind `PHASE_19_PLAN.md`, which owns the LIVE batch sequencing/status during Phase 19 per CLAUDE.md §3.2 — these are the net-new phase-level items + issue dispositions since the 2026-06-13 deposit):**
- **P19-B4 CLOSED** — all sub-batches: **B4a** (xStock active wire-in + feed-safety), **B4b-D5** (paper/live split-brain isolation — the Phase-21 co-run precondition), **B4b.1** (depth-walked paper fill + partial-open + the 24/5 book-depth-sufficiency gate; closed #295), **B4b.2** (dead paper-fill machinery sweep; closed #300). Governance verified complete per sub-batch (completion report + catalog + history + doc updates each).
- **19-3 (§19.0.5 data-capture) is now SPLIT → `P19-B5a`** (active-path reject/admit capture hooks — the HARD precondition; Langston-signed-off, building) **/ `P19-B5b`** (#94 xStock VIX+DXY macro snapshot at decision time — CAPTURE-ONLY; the modifier BUILD stays Phase-25 item 25-7) **/ `P19-B5c`** (continuous Q-D probe #86 — carved out because it is ALWAYS-ON, not dormant).
- **NEW pre-switch-on (B7b) batches:** **`P19-B6.5`** crypto active-pipeline resurrection (#235 — accretion-delta audit + full closed-trade dry-run; **HARD-gates B7b**); **`P19-B6.6`** price-discovery-liveness fill gate (#236 — closes the holiday/half-day hole; **HARD-gates B7b**); **`P19-B6.7`** vestigial 2nd-WS `MarketDataCoordinator`/`MarketDataWebSocket` subsystem cleanup (#301 — pre-switch-on, does NOT hard-gate).
- **★ Phase-19 deposit — 2026-06-17 (P19-B6.5b + P19-B6.5c joint close + P19-B6.5e creation; the live status/sequencing detail stays homed in `PHASE_19_PLAN.md` §1 + §5):**
  - **`P19-B6.5` SPLIT into B6.5a / B6.5b / B6.5c / B6.5e.** **B6.5a** (per-asset-class active gate — the Option-C B7b infra) CLOSED 2026-06-17. **B6.5b** (crypto accretion-delta audit + crypto-only reverted dry-run + the per-class crypto active gate F1-F5) CLOSED 2026-06-17 — proved the front half of the crypto chain works (scanner→pools→orchestrator→SQE fire for crypto) but surfaced two ready-to-buy-insert breaks. **B6.5c** (crypto signal→ready-to-buy repair) CLOSED 2026-06-17 on objectives 1-3 — DROPPED the leftover NOT-NULL `cwqi` column DB-drift on `rtb_signals` via migration + resolved each detected pattern to its consuming CANONICAL strategy (patterns are TRIGGERS, not strategies — the 19 canonical strategies are fixed; regime + class aware, exact-match-or-drop) so crypto signals now reach ready-to-buy with canonical names; objective 5 / gate-10 carried forward.
  - **NEW batch `P19-B6.5e` — TCL→paper-execution-engine open-path silent-failure repair + gate-10 closed-lifecycle owner (#325; Langston ruling 2026-06-17).** B6.5c's gate-10 dry-run surfaced a downstream break: a sized crypto active-paper signal never OPENS a paper trade — it falls out of the TCL→paper-execution-engine handoff before any reason/block is recorded (the `[8.8.3-I3]` invariant monitor reports attempts>0, opened=0, blocked=0, reasonSum=0 — likely un-awaited promise / swallowed throw / early-return-no-telemetry; untested since Phase 8). **B6.5e OWNS gate-10 / the ≥1 FULL closed-trade-lifecycle proof** (open→exit→close→cooldown→telemetry); **may promote to a full `P19-B7` if the open-path surface is large.** **B7b stays HARD-gated on the closed-lifecycle proof, now owned by B6.5e** (PHASE_19_PLAN §6 gate 10 re-pointed). Scope with a deep SIM + System-Manual read first (Kyle directive).
  - **Issue dispositions since 06-16:** #320 (RTB defense-in-depth) + #321 (uncalled witness / dual-active edge) carried through B6.5b; #325 NEW (TCL→PEE open-path silent failure → B6.5e; blocks gate-10 + B7b); #326 NEW (B63 DBS-not-propagated hard-contract warn on some crypto pairs in the pattern-pool eval — non-fatal, caught/skipped; HOME pending = "P19 pre-go-live DBS-propagation hardening" / a B63-DBS-lineage line).
- **Issue dispositions since 06-13:** #295 (RTH clock → 24/5 depth gate) RESOLVED in B4b.1; #300 (dead paper-fill machinery) RESOLVED in B4b.2; #301 NEW (vestigial coordinator → B6.7); #296 (Kraken `validate=true` round-trip + credential rate-limit lane — needs a locked-`kraken.ts` directive) + #297 (dormant live-engine/agent-intent subsystem) remain homed follow-ups; #298 (asset-name display) CLOSED (B-NAMES + B-NAMES.1).
- **Canonical live status + per-batch detail:** `PHASE_19_PLAN.md` §1 status board + §5 decision log.

### 19.0.B — Daily loss-budget service + kill-switch auto-trip (✅ SHIPPED 2026-06-17 as P19-B6 — a RESTORE of the deleted Phase-8 auto-trip)

**Status (2026-06-17): ✅ DONE — shipped as P19-B6.** Originally an OPTIONAL Phase 19 batch (Kyle directive 2026-05-21). Kyle corrected the framing 2026-06-16 ("it was working as of Phase 8 — re-check"): git archaeology found the auto-trip HAD existed (mode-aware `risk-manager.ts::checkKillSwitch`+`calculate24hPL`, wired to the modern `tripKillSwitch`) and was DELETED 2026-01-01 (`594aad717`) as collateral of an unrelated remove-legacy sweep. So P19-B6 = RESTORE, not build. The shipped `server/services/daily-loss-budget.ts`: rolling-24h REALIZED loss % vs portfolio, session-anchored window (a restart rebaselines = circuit-breaker), auto-trips the EXISTING `tripKillSwitch` (which already flattens via `stopPaperSimulation→forceCloseAllOpenPositionsOnStop` — no double-close added), 2 warning tiers (`dailyLossWarning1/2Pct`, per-mode, % of kill, RULE_011 strict ordering) with ratchet + hysteresis, dual alert surface (operational `.jsonl` + user-facing dismissible website banner). DORMANT-in-effect until paper-active (B7b) — evaluator gated on `isEngineActive`; force-trip proven deterministically. Realized-only (faithful to Phase-8) → UNREALIZED-drawdown gap homed #303/Phase-25. Follow-on **P19-B6.8** (full paper-vs-live separation of ALL user guardrails) scheduled (#302). See `P19_B6_COMPLETION_REPORT.md` + BATCH_CATALOG.

**The gap (now closed):** the kill switch's `dailyLossKillSwitchPct` threshold lived in `guardrails_v2` but was checked manually via UI/API. No service watched running daily P&L and tripped automatically. `tripKillSwitch()` accepted `lossPercent`/`threshold` params but was never called by a budget aggregator. There was no `server/services/daily-loss-budget.ts`. **→ All restored in P19-B6.**

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
- Estimated scope: two new React tabs + ~6 new API endpoints + per-category baseline-range constants in `module_constants` (so baselines are DB-tunable per CLAUDE.md §5 #15) + per-process capacity envelopes also in `module_constants` + alert-emitter wiring. **Revised for 19.6.6 (2026-06-12): + the internal-health subsystem registry + trade-lifecycle invariant checks + trend-escalation logic — now ~2 weeks total, with the long-tail spilling into Phase 20.**
- Tier 1 governance: scope file, pre-audit consulting SIM for every monitored process, completion report. No new DB tables required (re-uses `system-alerts.jsonl` queue + `module_constants` for tunable baselines).
#### 19.6.6 Internal subsystem health + EARLY-FAILURE detection (NEW 2026-06-12, Kyle directive — "find failures in progress before they become failures we react to")

Extends §19.6 from external-sources + process-capacity into a **system-WIDE diagnostic layer**. The goal is explicitly *leading indicators*: catch degradation while it's still trending (a feed slowing, a queue backing up, a write path lagging) — BEFORE it becomes an outage that halts the system, force-closes trades prematurely, or loses money through a breakage nobody saw coming.

- **Internal pipeline health rows** alongside the external ones: scanner cycle cadence vs expected; signal-pipeline stage flow (scanner → regime → SQE → RTB → TEC) with per-stage freshness; DB pool health + write-batcher lag; archive/persistence pipeline backlog; scheduled-job fire-evidence (consolidates the B-NEW-49/51 cron verifier into this layer); event-loop stall tripwire (the permanent [4.6B][STALL] watchdog feeds this); disk/memory headroom trends.
- **Trade-lifecycle invariant checks:** open positions must have live pricing + an active exit path (TEC state present, stop/target sane); any open trade whose data feed goes stale fires BEFORE the exit logic malfunctions. This is the direct "don't lose money to a breakage" guard.
- **Trend-based escalation = the failure-in-progress detector:** a metric that is yellow AND worsening across N consecutive sweeps escalates to orange (alert) even though it never touched the orange threshold — degradation-rate, not just absolute level. Thresholds + N DB-tunable.
- **Consolidation mandate:** this layer ABSORBS the broken/parallel health surfaces — the defunct `SystemHealthMonitor`, the 3-registry health/lying-state problem (RUNNING_ISSUES #214), and the runtime-monitoring half of the Boot Readiness Coordinator (Phase 19.x below; its boot-ordering half stays its own item, but its "continuous operation monitoring" deliverable lands HERE so we don't build two registries). One subsystem registry, one alert pipeline, one dashboard family.
- **Sequencing within the run order:** core internal-health rows + trade-lifecycle invariants + alert wiring land with the §19.6 batch at the end of Phase 19 (they protect the Phase-25 calibration run); the long-tail rows and tuning spill into **Phase 20 production hardening** as its observability workstream — Phase 20 hardens what Phase 19 proves. Phase 16 was considered and rejected as the home: this is new protective infrastructure, not cleanup.

**Phase 19 expected outcome**: Fully debugged paper trading system with optional SQE recalibration (19.4), Adaptive Market Response brain (now Phase 25 — see §3.3 / Decision Log), and end-of-phase diagnostics dashboards (19.6) covering external-source health, internal compute capacity, AND the system-wide internal-health / early-failure-detection layer (19.6.6) wired into the alerts queue. All components validated. Ready for production hardening.

---

## Phase 19.x — Boot Readiness Coordinator (added 2026-05-08, Kyle directive)

**Status:** DEFERRED to Phase 19. NOT pre-launch. **Scope note (2026-06-12, Kyle 19.6.6 directive):** this item keeps the BOOT-ordering work (dependency-ordered startup, all-green-before-traffic gate); its "continuous operation monitoring" deliverable (#6 below) is RE-HOMED to §19.6.6 so the system has ONE subsystem registry + one alert pipeline, not two.

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
| 25-4 | §19.4 SQE Recalibration (B66 conditional) | Rebuild SQE thresholds with sibling-strategy WR controls + post-B62-only data + active-paper outcomes. **★ Named sub-items (P19-B8.5a/b riders, 2026-07-13):** (a) **#502 DI-formula unification** — crypto trend-straightness `|net|/path` vs xstock signed-direction `(net/abs)×50+50` share the kernel's `DI` input name with different semantics (same path → materially different pWin per lane); unify HERE because it moves measured pWin (evidence-based, not a rename). (b) **regimeStability honest-source rewire** — the gen-side `computeGlobalStability(0.5, 0, confidence||0.5)` feed is confidence-derived with cold-start defaults (the axis B8.5a severed from sizing); rebuild from an honest source, THEN feed it to the refresh SQE calls (#498's deferred leg). (c) **stamp `regime` on the `maker_taker` evidence-sink emit (#504)** — the `switch_on_shadow_evidence` maker_taker rows are honest-NULL for regime today (regime isn't a maker/taker decision input), but any regime-segmented pFill fit needs it; resolve regime once per-symbol at `signal-orchestrator.ts:770` when this calibration segments by regime (`adverseSelectionPct` is the haircut term that should vary by regime). **Two-pronged (Langston 2026-07-14, CC-A-traced): (a) segment the pFill fit by regime (needs the stamp); (b) `adverseSelectionPct` is LIVE in the maker-leg EV today (`maker-taker-decision.ts:246→262→276`→SQE) and resolved regime-flat at the config layer (`resolveMakerTakerHaircut(assetClass)` → `maker-taker-config.ts:18`+`:31`, key `{…regime:'*'}` — NOT the orchestrator `_mtGlobalKey`) → maker EV optimistic in HVU/IE, mildly pessimistic in RBS. 25-4 must CHECK the flat-haircut EV bias pre-fix (live P&L footprint), not only calibrate forward.** Cohort note: all pre-2026-07-13 VTS rows carry proxy-DI pWin/netEV — treat as a boundary. |
| 25-5 | §19.4.5 Observational Decision Gate | Pre-launch reordering decision based on 1-2 weeks of clean active-paper outcomes. Hostile-window recurrence, ladder net contribution, low-volume moonbag exclusion, etc. |
| 25-6 | **AMR posture-model M2 calibration (post-launch — Phase 17/18 ML buildout)** | **CORRECTED 2026-05-28 per CC + Langston consensus** — AMR BODY moved to Phase 19 entry 19-19 (pre-Phase-19 batch with hand-set conservative thresholds + shadow-mode boot gate). What remains for Phase 25 / post-launch is the BRAIN: ML M2 posture-model trains against paper-active outcomes from Phase 19, replaces the hand-set thresholds with a learned model via the body's existing socket per `ML_DESIGN_PRELIMINARY_2026-05-21.md` §6.2 + §7. This is the calibration-with-evidence component — M2 needs paper-active outcomes to train against (the population that hand-set thresholds couldn't legitimately be calibrated against pre-Phase-19). CC's original 2026-05-27 recommendation (full defer to Phase 25) was based on stale `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §5 decision pathway that Kyle's 2026-05-21 directive "yes we're building it" had already retired; corrected via Langston independent read 2026-05-28. |
| 25-7 | #94 B79.3 xStock equity-equivalent macro confidence modifiers | xStock equivalents to B68.x macro modifiers (DXY / VIX signals — the CBOE/FRED/ECB equity-macro feed ALREADY EXISTS from B-5 AMR; what's missing is the PER-SIGNAL modifier, not the feed). Confidence modifier work per Kyle 2026-05-27 voice — needs outcomes. **CAPTURE PRECONDITION (Kyle directive 2026-06-13, confirmed home):** the BUILD waits for Phase 25, but the INPUTS must be captured per-xStock-decision during the paper run — every xStock decision record must carry the equity-macro snapshot (VIX + DXY z-scores at decision time). That capture lands in **P19-B5 (data-capture completion)** so Phase 25 has the raw material. Interim safety: the class-level AMR brakes already react to VIX/DXY for the whole xStock class (active ~1 week into the paper run), so xStock is macro-aware at the class level during the run; only the per-signal refinement waits. Defer-build-but-capture-now per the 19-20 / AMR body-vs-brain doctrine. |
| 25-8 | #153 xStock `pattern_max_position_pct` 0.50 placeholder validation | The 0.50 cap inherited from xstock_spot module is a placeholder. Calibrate the actual right value against xStock outcome data. |
| 25-9 | xStock `pair_correlation` per-pair WR data accumulation (B68.3 calibration) | Per-pair correlation modifier needs paper-active WR data to set the right modifier coefficient. From `XSTOCK_CALIBRATION_PLAN.md`. |
| 25-10 | Crypto confidence-modifier calibration | Kyle 2026-05-27 voice flagged crypto also needs confidence-modifier calibration, not just xStock. Same family as 25-2 / 25-7, applied to crypto's existing modifier stack. |
| 25-11 | **Order-book / liquidity-aware position sizing + thin-market exit — BOTH asset classes (Kyle directive 2026-05-29)** | Build live order-book-depth into position sizing + a thin-market exit hook for xStock AND crypto. **SCOPE CHANGE 2026-05-29 (Kyle-approved):** these hooks are NO LONGER in B.1.5 — fully deferred here. Rationale: at the live portfolio (~$830, maybe →$1,330), guardrail math gives per-trade size ~$150-250, which is <1% of median overnight xStock top-of-book ($33K) and ~2% of the thin-decile ($11K) — a depth-based sizing cap **cannot bind** at this scale, so building it in B.1.5 would be dead code that never fires. B.1.5 ships the liquidity **FILTER only** (depth-based LQ + min_depth admission gate — portfolio-size-independent, the real stuck-trade screen against genuinely-dead/empty books). This Phase-25 batch builds the sizing/exit hooks when (a) paper-active outcomes exist to calibrate against and/or (b) the portfolio grows large enough (trades in the thousands) that depth actually constrains sizing — full version: depth-walking (multi-level book), MM-quote-availability prediction, hours-aware caps, regime-conditional participation rates — AND **ports the depth-aware sizing/exit to crypto** (crypto sizing/exits ignore depth today; identical gap). NOTE: B.1.5 does NOT change crypto's liquidity FILTER (crypto volume = real token volume, not broken; only the SIZING piece is the cross-asset item). Depends on B.1.5 depth-plumbing landing. Decision to port to crypto is Kyle's, evidence-backed. **BUILD-TRIGGER WATCH-ITEM (Langston 2026-05-29):** the deferral must not drift past its sell-by date — track a crossover trigger that says "build 25-11 NOW": roughly when **(per-trade sizing × max-concurrent positions) approaches ~3-5% of the p10 (thin-decile) top-of-book depth at the admission threshold**. Below that, the participation cap can't bind (dead code); at/above it, a single order could move a thin book and the cap becomes load-bearing. Re-evaluate this trigger as the portfolio grows through bands (e.g. $830 → $1,330 → $5K → $20K+). See `B_1_5_PRE_AUDIT.md` §9-§10 + MEMORY. |
| 25-17 | **★ TARGET-GEOMETRY CALIBRATION — ALL 19 CANONICAL STRATEGIES, BOTH ASSET CLASSES (Kyle directive 2026-08-08)** — *no existing Phase-25 item covers this; 25-12/13/14 are xStock-GEOMETRY-specific and 25-13 already FAILED once on missing anchors* | **WHY IT IS NEEDED:** `target_exit_atr_multiplier` is the single lever converting volatility into a profit target, and **nothing has ever decided its values** — B72 migrated them off hardcode (values unchanged, Replit-era origin); `ADJUSTMENT_FRAMEWORK.md:415-421` lists them as **Tier-1, bounds + 0.25 step + 7-day cadence** — *the tuning governance exists on paper and has NEVER RUN*, and the mechanism that would have run it (the adaptive tuner) was **dormant with zero callers and DELETED 2026-08-07**. **⚠️ ONLY 4 OF 9 STRATEGIES have stated bounds** (morning_star 2.5 [1.5-4.0] · support_bounce 2.0 [1.5-3.5] · reverse_impulse 2.0 [1.5-3.5] · adaptive_flow 3.0 [2.0-5.0]); **the other five — including `strong_bull_trend` at 6.0 — have NO bounds at all.** And **every row is `asset_class='*'`**, so one multiplier serves crypto's 60m bars and xStock's 15m bars against the same flat fee. **INDUSTRY BASELINE (researched 2026-08-08): stop 2×ATR most common (day 1.5-2×, swing 2-3×, position 3-4×); ATR profit targets typically 1.5-2× the 14-period ATR; professional R:R ≥1.5:1 day / 2:1 swing** ([QuantVPS](https://www.quantvps.com/blog/atr-stop-loss), [LuxAlgo](https://www.luxalgo.com/blog/5-atr-stop-loss-strategies-for-risk-control/), [Equiti](https://www.equiti.com/sc-en/news/trading-ideas/atr-indicator-how-traders-use-volatility-to-set-stops-and-targets/)). ⇒ **our 1.8-3.0 cluster is DEFENSIBLE as a baseline; `strong_bull_trend` 6.0 is ~3× any published norm and is the outlier to justify or change.** **★ BUT THE NORM IS NOT DIRECTLY TRANSFERABLE, AND THE DIRECTION MATTERS: published multiples assume institutional 3-5bps friction; we pay 80bps round-trip. A fee 16-27× the assumption argues our targets should sit ABOVE the published range, not at it** — which is the opposite of what a naive "match the industry" read would conclude. **★★ CORRECTED 2026-08-08 (Kyle caught my count): there are **19** canonical strategies (`STRATEGY_DISPLAY_NAMES`), not 9. I had counted FILES in `server/strategies/` (9) and called it the strategy count — the same error `LEVER_INVENTORY.md:184` flagged as unverified and asked a later pass to close.
**⚠️ AND THE MEASUREMENT IS WORSE THAN THE MISCOUNT: only 9 of the 19 have a `target_exit_atr_multiplier` AT ALL. TEN HAVE NONE** — `abcd_long`, `breakout`, `dhma`, `liquidity_trap`, `mean_reversion`, `orb`, `range_trade`, `sma_trend_ride`, `vwap_bounce`, `vwap_pullback`. Those set targets by **R-multiple / measured-move / percent** instead (the "9 in-class heterogeneous" family named in `signal-target-normalizer.ts:9-11`), and **those mechanisms are UNAUDITED — no bounds, no cadence, no inventory row.** ⇒ **the calibration cannot be an ATR-multiplier sweep; it must cover BOTH target-setting mechanisms or it silently leaves 10 of 19 strategies untuned.**
**SCOPE:** per-strategy × per-asset-class calibration against paper-active outcomes; bounds published for all 9 (not 4); the fee-adjusted baseline argued from first principles BEFORE fitting; then the 7-day monitor cadence the framework already specifies. **PRECONDITION:** the B-CRYPTO-UNBLOCK finding that **target is a SELECTOR not a knob** (organic lane 7.85% vs exploration 2.38%, same strategies) must be resolved first — if admission is really "native target ≥ fee wall", tuning the multiplier moves the whole distribution across the bar rather than improving selection. |
| 25-16 | **Trade-size / concurrency / win-rate dynamic + starting-balance sensitivity study (Kyle directive 2026-06-18)** — *paired here with 25-11 as the position-sizing / portfolio-construction calibration pair; a go-live-readiness prerequisite (the start-balance + concurrency decision must be evidence-backed before live)* | Find the SWEET SPOT for steady daily profitable closures — how many concurrent positions (2-3 vs 3-4 vs 5-6?) and what per-trade size maximize a small-but-positive daily P&L at the starting balance. **Core question:** does larger per-trade dollar SIZE lower the WIN RATE (via order-book impact / slippage), or is win rate ~size-independent in our ~$150-925/trade range given the % target floor is fee-driven (3.5-4%), not size-driven? Kyle's hypothesis to test: smaller trades → smaller required moves → faster/more-confident wins → volume of small profits → faster compounding, vs larger trades → bigger wins but possibly lower win rate. Also map **starting-balance sensitivity** ($800 vs +$1k vs +$2k → per-trade $ and concurrency; concurrency is governed by the position-cap % + signal supply, NOT by balance — more balance scales $/trade, not trade count). DERIVE first-principles estimates where possible; PROVE empirically against paper-active + the shadow-trade-layer (19-17 / P19-B8) outcomes. The concurrent-count is NOT a fixed requirement — it is an OUTPUT of this study. **Sequencing:** run EARLY in Phase 25 alongside the selection calibration (25-2 / 25-4), not in the data-blocked tail — selection quality + sizing together determine whether daily P&L is positive. **★ ENRICHED 2026-07-03 (P19-B8 design discussion — Kyle's two-paper-environments / higher-balance-behavior question; full record RUNNING_ISSUES #408): this study is THE home for "how does the system behave at higher balances" — verdict config-not-dollars (post-B8.2-fence decisions are scale-free; what changes = fill quality [depth-walk verified size-dependent in code], floor bindings, slot/sizing config options, incl. Kyle's mixed-size-policies-at-one-balance scenarios). INSTRUMENT STACK: (1) scenario-tagged CONFIG SWEEP on the primary paper env = centerpiece (real N-slot / per-trade-size ladders, reuses the B8.2 balance-ratio-tag + calibration-exclusion machinery; admin-level scenario set, not the deleted user override); (2) shadow-replay pre-screen (labeled counterfactual-beyond-first-divergence); (3) the organic compounding ladder (free, already-owned). GATED on the B8.2 dollar-agnostic fence audit passing. NO second standing paper engine unless the fence audit fails or the sweep hits a wall.** |
| 25-12 | **⛔ PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — Entry-trigger sweep (B.5 W2.0b)** — *we tried this; it's rescheduled here* | **Attempted 2026-06-06** in B.5 W2.0b: a detect-replay harness (`scripts/b5-w20b-entry-replay.ts`) re-ran the REAL detect functions over reconstructed 15m bars to sweep each strategy's entry-trigger thresholds, but **could not clear the ≥99% backward-parity gate** (vwap_pullback Tier-1 maxed **80%** — the in-progress FORMING bar was never persisted). Declared INCONCLUSIVE-by-backward-data rather than tune on a low-fidelity reconstruction (Langston-endorsed). **RESCHEDULED to Phase 25:** once the B-NEW-53 decision-provenance capture (item 19-20) accrues enough forward data, re-run the entry-trigger replay/sweep exactly (it'll hit ~100% parity on captured rows). Self-surfaces via the #206 §10.5 accrual alert. Source: `B_5_W20b_CONCLUSION.md`. |
| 25-13 | **⛔ PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — Faithful geometry reconstruction (W2.0a Mode-A) + RI-a stop-anchor forensic replay** — *we tried this; rescheduled here* | **Attempted 2026-06-06** in B.5 W2.0a: Mode-A (reconstruct each strategy's baseline stop from OHLC at current params + sweep, ≥95% parity gate) **FAILED for every strategy** because the geometry anchors (live VWAP / detectRange boundaries / pattern structural-low / ATR-at-decision) were never persisted; pivoted to Mode-B on the recorded `originalStopPrice` (keep-baseline verdict stands, INCONCLUSIVE-by-default). **RESCHEDULED to Phase 25:** the faithful OHLC-true geometry re-run + the RI-a stop-anchor forensic trail need those anchors, which B-NEW-53 captures going forward; re-validate geometry on the exact persisted anchors once they accrue. |
| 25-14 | **⛔ PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — Per-strategy entry re-fit (W2.2) + ORB entry-edge validation (W3) + vwap_bounce forward power test** — *downstream of 25-12, rescheduled here* | Downstream of the entry-trigger sweep (25-12): the **per-strategy entry-trigger re-fit (W2.2)** and the **ORB entry-edge validation (W3** — the DST-aware anchor + 15m-bar-unit + US-holiday-calendar PLUMBING can run pre-19 per #203, but the actual entry-EDGE validation is data-blocked**)** both need the decision-provenance accrual. Also carry W2.0a's thin **`vwap_bounce` tighter-stop candidate** (N=103, test R +0.125, within 1 SE of 0) as a pre-registered forward power test (~100+ trades) — do NOT seed until it clears forward. RESCHEDULED to Phase 25 with 25-12. |
| 25-15 | **⛔ DATA-BLOCKED STUDY (intraday-coverage gap) — HCE rejected-arm causal test (RUNNING_ISSUES #205)** — *tried, blocked on data; rescheduled here* | **Attempted 2026-06-05** in the HCE study P2/P3: the net-EV over-rejection causal test (does the `net_ev_rejected` gate reject signals that would have been net-positive? — the highest-value follow-on, since the admitted arm is robustly null and any edge lives at the admission boundary) hit a **NO-GO on its pre-registered bar** (19.1% pooled no-hit > 15% cap) — **entirely from crypto 1-min OHLC sparsity** (xStock no-hit 1% = GO-quality; the sim logic is valid, 96.8% sign-match when bars exist). A DISTINCT data gap from #206 (intraday-OHLC coverage, not decision-provenance) but the same "tried, blocked on data" class. **RESCHEDULED to Phase 25** (per Kyle 2026-06-07): unblock via (a) a denser intraday source — trade-tick reconstruction / order-book history — for the thin crypto symbols, and (b) the xStock `net_ev_rejected` accrual watch so the xStock-only causal arm can run at power as its own pre-registered mini-study. Source: `HCE_STUDY_FINAL_SYNTHESIS.md` + RUNNING_ISSUES #205. |

| 25-17 | **xStock per-class target-floor + reach_atr_max recalibration (reorg-B2 placeholder; RUNNING_ISSUES #336)** | reorg-B2 (2026-06-20) seeds xStock `target_floor_pct = 0.040` and `reach_atr_max = 4.0` identical to crypto (same account-wide Tier-1 fee wall) as a conservative PLACEHOLDER. A 4% intraday floor will under-trade xStock — equities don't move 4% intraday like alts. **Calibrate xStock's floor + reach_atr_max DOWN on its own realized paper-active data.** Same per-class-gate machinery reorg-B2 built; only the values change. ↔ RUNNING_ISSUES #336. |
| 25-17b | **★ CRYPTO `reach_atr_max` DECISION — the reachability-ceiling question, filed 2026-08-17 (P19-B-FEEVIABILITY OBJ-3 held-out successor; Langston ruled it a NEW item, NOT a pull-forward of 25-17 — the sign INVERTS: 25-17 calibrates xStock DOWN, crypto's direction is UNTESTED)** | **THE DECISION METHOD, pre-agreed:** re-cut the counterfactual replay in ATR units → the reach-vs-`atrsToTarget` curve per class → **if reach is material past 4.0, set the constant to the measured value; if reach collapses before 4.0, KEEP 4.0 with evidence and close.** Entry conditions (scope §OBJ-3, all four): ✅ `pivot_shift` distribution (measured 2026-08-16: p90 3.000 now, 4.74 at fee-clearing raise — the strategy this decides); the #371 two-gate ATR-divergence capture read; the reach-curve itself; filed as this item. **`pivot_shift`'s fee-viability re-entry depends on THIS decision** — it is the batch's best performer (73.3% hit) and stays excluded until the ceiling is evidence-based. **SEQUENCE: runs in the 25-17/25-18/25-20 coordinated calibration cluster (Kyle 2026-06-23: one batch, not scattered), fed by the P19-B-FEEVIABILITY marked-window data.** Industry context on record (scope §1.4): 3–4× ATR is a target-SETTING convention elsewhere, nowhere a rejection ceiling — our 4.0 was an uncalibrated placeholder. ↔ RUNNING_ISSUES #336, scope P19_B_FEEVIABILITY §OBJ-3. |
| 25-18 | **`friction_safety_buffer` per-class evaluation (reorg-B2 deliberate-global; RUNNING_ISSUES #337)** | reorg-B2 split the 6 ROI gate knobs per-class but kept `expectancy_gates.friction_safety_buffer` a single global `'*'` row BY DESIGN — it is a uniform safety MARGIN on top of the friction MODEL, and the model is already per-class (`fee_model` + per-class spreads). **TRIGGER (explicit, verbatim — CC-B + Langston Step-8 consensus 2026-06-20):** once the per-class friction MODELS are calibrated in Phase 25, evaluate whether the buffer ITSELF should differ per-class (i.e. whether the calibrated per-class friction profiles leave a residual the uniform margin mis-sizes). Until that trigger fires, the buffer stays global — this is an intentional decomposition (per-class model + global margin), not a missed split. ↔ RUNNING_ISSUES #337. |
| 25-19 | **Net-Expectancy gate JUDGMENT-QUALITY validation (Kyle 2026-06-21; RUNNING_ISSUES #370)** | reorg-B2.1 makes the Net-Expectancy (11.8B) gate the cost-coverage judge (drops the crude 4% floor). Kyle: "we have to look at its judgment skills — its ability to actually judge." **Validate (needs paper-active outcomes, hence Phase-25):** do NetEV-passing trades realize positive net-of-friction outcomes per regime/class vs NetEV-rejected ones? **Baseline = `VTS_4PCT_TARGET_STUDY_2026-06-21.md`** — a flat 4% target does NOT predict crypto profitability (≥4% win 31% vs 33%), so the gate must beat a crude proxy; xStock's 40-vs-26 target-quality win split is a real signal to capture. If judgment is poor, recalibrate the kernel inputs (pWin/DI/VolNoise — ties to #233). **★ INCLUDES the per-strategy EV-SURVIVAL cut (folded in from the former standalone 25-21, Kyle 2026-06-23 "bundle, don't tack on" — it's the same outcome analysis, one home): does each strategy realize positive net-of-friction outcomes at ANY threshold? Specifically the sub-1.0-RR strategies morning_star (meanRR 0.97 over 13,638 evals) + support_bounce (0.85), which need a ~55–60%+ win-rate just to break even — so lowering their minRR (25-20) does NOT make them earn their place. Verdict per strategy on outcomes: KEEP / recalibrate / retire. defensive_hedge (1.22) EXEMPT (a hedge; EV isn't standalone-directional). The 2 still trade in the Phase-19 paper run (flagged-for-watch, not pre-disabled) to generate the data. ↔ RUNNING_ISSUES #375.** ↔ RUNNING_ISSUES #370. Pairs with 25-2/25-4 (selection calibration) + 25-20 (minRR). |
| 25-20 | **Per-strategy × per-class minRR (reward-vs-risk floor) RECALIBRATION from win-rates (Kyle directive 2026-06-23; RUNNING_ISSUES #372)** | The reorg-B2 global `min_rr=2.5` wildcard suppresses 62–100% of every strategy (48h window read 2026-06-23: meanRR 0.85–2.38, most below 2.5). The Phase-19 BASELINE (set per `(strategy × asset_class)`, floored a notch BELOW each strategy's natural meanRR — Langston refinement; from each class's OWN per-class VTS data, NOT inherited — in the new Phase-19 batch **reorg-B2.3**) is a distribution-based STARTING point only. **This Phase-25 batch RECALIBRATES each `(strategy, asset_class)` minRR from real paper-active WIN-RATES** (the apples-to-apples population, not VTS): minRR is a coarse proxy for the real Net-Expectancy judge, so the recalibration sets each floor where it preserves positive-EV setups + trims genuinely-negative-EV ones. **Needs paper-active outcomes → gated AFTER Phase-19 turn-on (NOT floatable forward — the win-rate data doesn't exist until then; Langston §13).** Pairs with 25-19 (NetEV judgment). **★ CLUSTER (Kyle 2026-06-23 — placement checked, NOT tacked-on): 25-20 is the minRR member of the reorg-B2 per-class target-GATE recalibration family — siblings 25-17 (target_floor + reach_atr_max) + 25-18 (friction_safety_buffer). All three recalibrate the SAME per-class gate's knobs from the SAME paper-active outcomes → sequence them as ONE coordinated Phase-25 calibration batch, not three scattered items.** ↔ RUNNING_ISSUES #372; baseline-set in Phase-19 reorg-B2.3. |
| 25-21 | *(folded into 25-19 — Kyle 2026-06-23 "bundle, don't tack on")* | The sub-1.0-RR strategy EV-SURVIVAL audit (morning_star / support_bounce; RUNNING_ISSUES #375) is the per-strategy cut of 25-19's Net-Expectancy outcome analysis → **homed IN 25-19, not as a standalone item** (one-home convention). Anchor retained for #375 traceability. |

> **★ EXPLORATORY RESEARCH-IDEAS BLOCK (25-22 … 25-25) — RenTech-derived, Kyle directive 2026-07-10.** These are NOT go-live-gating calibration items like the ones above — they are *research ideas* drawn from a study of Renaissance Technologies' known/inferred disciplines (the actual Medallion signals are secret; these are principles, not their methods). **Workflow for each (Kyle-set): (1) cheap AD-HOC test on existing VTS / paper-active / archived data → (2) IF favorable, set up rigorous pre-registered out-of-sample testing → (3) only THEN scope for potential implementation.** Overarching caveat (the honest RenTech lesson): for a small, high-fee operation, **overfitting is the #1 way to die imitating a quant fund** — every one of these must clear out-of-sample validation before it earns a place, and each must survive our fee wall (≈1.8% round-trip), which forbids their signature high-turnover many-tiny-trades style. Two of the four areas Kyle asked about — **trade execution** (maker-fill capture, own-market-impact modeling, cost-aware sizing) and **net-of-friction ranking** — are already homed and *validated* by this research (the fee-ladder maker build under 25-2/3/10, depth-aware sizing/impact in 25-11, and the B7.1 rank-by-expected-R-multiple), so no duplicate item is added for them; the research reinforces staying that course. The four NEW ideas below are the genuinely-additive ones.

| 25-22 | **Edge-decay monitor — selection-IC + per-strategy calibration drift detection (RenTech "edges are perishable / capacity-decay"; research idea 2026-07-10)** | RenTech caps Medallion because edges decay with size and get arbitraged away. The transferable discipline: treat every calibrated edge as PERISHABLE and watch it decay *before* it costs money. **Idea:** a rolling-window drift detector on selection-IC (per-cycle cross-sectional Spearman, already computed by the B7.1 harness) + per-strategy calibration (realized-vs-predicted win-rate / Net-Expectancy) — a falling IC or widening calibration error = an edge dying. Architecturally this is the SAME "SLI + regression-detector" pattern just built for B-XSTOCK-FRESHNESS-MONITOR (#441), pointed at *signal edge* instead of data quality (Rule 13 rolling-windows, never snapshots). **Ad-hoc test:** compute selection-IC + per-strategy calibration over rolling windows on existing VTS / paper-active history; is edge-decay detectable and does it lead realized-P&L deterioration? **If favorable:** stand up a recurring edge-decay monitor (mirror the #441 machinery) with alerting. Low overfitting risk (it's a monitor, not a trading signal); highest-confidence of the four. |
| 25-23 | **Probabilistic hidden-state (HMM-style) regime inference → regime-conditioned EV (RenTech HMM lineage — Baum-Welch roots; research idea 2026-07-10)** | RenTech's mathematical roots run through Hidden Markov Models (Leonard Baum) — the market is in an *unobservable* state inferred from observables, with probabilistic transitions. Our regime layer (DBS-driven TFS/ST/HVU/IE/RBS) currently uses hard thresholds. **Idea:** evolve regime detection toward a probabilistic hidden-state model — a *distribution* over regimes + probabilistic transitions — feeding **regime-conditioned expected value** into signal-orchestrator selection ("given the inferred regime distribution, each strategy's net EV") rather than a hard on/off. **Ad-hoc test:** fit an HMM (or similar hidden-state model) on historical regime observables; does its regime classification / conditioned-EV predict forward net-of-friction outcomes *better out-of-sample* than the current hard-threshold DBS? **If favorable:** scope a rigorous build into the DBS/regime layer (frozen-during-audit caveat, §5 rule 11). ⚠️ **Overfitting-prone** — HMMs fit noise easily; strict out-of-sample + parsimony required, and it must beat the simple existing classifier to justify the complexity. |
| 25-24 | **Orthogonal weak-feature enrichment of the per-cycle selection ranking, incl. microstructure-as-signal (RenTech "combine many weak signals"; research idea 2026-07-10)** | RenTech's core method is an ensemble of individually-WEAK signals — which we CANNOT copy as *many trades* (fees). The fee-compatible echo: keep taking ONE selective trade per cycle, but feed **more independent, individually-weak features into that single ranking decision** (finalScore → the B7.1 net-R-multiple), combined statistically — including **microstructure features mined as SIGNAL** (spread, top-of-book depth, order-book imbalance, quote-freshness) that today we only use as fill GATES. **Ad-hoc test:** on archived data, test whether candidate orthogonal weak features improve selection-IC / net-EV calibration out-of-sample; keep ONLY features that survive (and are genuinely orthogonal to existing inputs — correlated features add noise, not signal). **If favorable:** fold the surviving features into the ranker via the existing single-source kernel wiring. ⚠️ Each added feature is an overfitting surface — pre-register, validate OOS, prune hard; "more features" is NOT automatically better. **★ AD-HOC PROBE #1 RUN 2026-07-10 (CC-A) — RESULT: NO SIGNAL at short horizons; do NOT spend rigorous-testing budget on these two features at these horizons.** Cross-sectional rank IC of two microstructure features vs FORWARD xStock returns, 3 days RTH, 1,151 minutes × ~393 symbols (~450k obs): order-book imbalance→5m IC=−0.0002 (t=−0.15); imbalance→15m IC=+0.0008 (t=0.48); spread→5m IC=−0.0020 (t=−0.58); spread→15m IC=+0.0035 (t=1.07). These are **clean nulls, not underpowered ambiguity** — at n≈450k an IC of 0.0008 with t=0.48 means the information is genuinely absent (and unsurprising: a retail-observable 5-min microstructure edge would have been arbitraged by HFT long ago). **★ METHODOLOGICAL CORRECTION for the NEXT probe (the reason 25-24 is NOT dead):** the horizon was wrong — our trades must clear a ≈1.8% round-trip fee wall and therefore target 3.5–4% moves held for **hours-to-days**, so the feature must be tested against *the horizon we actually trade*, not 5/15 minutes. Also improve feature construction (time-averaged / depth-weighted imbalance over a window, not a single instantaneous snapshot, which is dominated by quote noise). Re-run before concluding on 25-24. Probe methodology (per-minute cross-sectional Spearman → mean IC + t-stat) is reusable and is also the harness 25-22 needs. |
| 25-25 | **Cross-instrument / relative-value (statistical-arbitrage) signals (RenTech's stat-arb DNA; research idea 2026-07-10)** | Renaissance began as statistical arbitrage — exploiting *relationships between* instruments (lead-lag, pairs, basket relationships), which can be more stable than an outright directional call. We already run pair scanning; the research delta is using **cross-pair relationships as a predictive SIGNAL**, not just screening. **Ad-hoc test:** do relative-value / lead-lag relationships between correlated instruments (crypto majors, xStock sector cousins) predict forward returns net-of-friction, on archived data? **If favorable:** scope relative-value signals into the pipeline. ⚠️ **Friction is the killer here** — a 2-leg relative-value trade pays ~2× our ≈1.8% round-trip, so the relationship edge must be *large* to survive; likely viable only as a single-leg directional tilt informed by the relationship (e.g. "leader moved, lean the laggard"), not a classic 2-leg pairs trade, at our fee level + capital. Lowest-confidence of the four for exactly this reason. |

| 25-26 | **Trade HOLD-TIME / timeframe study — do slower (multi-day) trades clear the fee wall more reliably? (Kyle directive 2026-07-14)** | Today's trades open+close on a **few-hours-to-~1-day** timeframe, and the #501 baseline showed no net-positive admission threshold at those speeds (fee wall eats fast intraday moves). **Angle to test:** LONGER hold timeframes (**~2–3 days**) may produce MORE RELIABLE signals — slower to open, slower to close, but starting profitably and compounding, rather than the fast-trade/fast-close churn that constantly bleeds to friction. Hypothesis (Kyle): a signal that plays out over a bigger, slower move clears the ≈1.8% round-trip fee wall more dependably than a fast intraday scalp; fewer-but-better trades that build steadily beat many-fast-losers. **Test (paper-active + VTS):** bucket realized net-of-friction WR / EV by realized hold-time; does longer hold-time correlate with higher net-of-friction outcomes? Interacts with target geometry (a multi-day hold implies a bigger target → better fee coverage) and with the entry/exit timeframe the strategies evaluate on. **Pairs with** the fee-ladder (25-2/3/10 — same fee-wall lever), 25-16 (sizing/concurrency), and 25-19/25-20 (target/RR floors — a longer hold changes the reward geometry). NOT a fast-vs-slow ideology — an empirical timeframe sweep to find where net-of-friction reliability actually lives. |
| 25-27 | **Profitable-signal PROFILE → reverse-engineer a scanner PRE-SCREEN for early admission (Kyle directive 2026-07-14)** | Over the paper-active run, **build an empirical PROFILE of what a PROFITABLE signal looks like at the moment it passes the SQE and sits in the RTB queue** — the feature signature (netEV, geometry/RR, regime, DI, dbs, sourcePool, strategy, friction, timeframe, etc.) of the signals that go on to WIN net-of-friction. **Then reverse-engineer that profile back to the SCANNER intake:** define a target profile to look for when pairs FIRST arrive from the scanner, so incoming pairs that *look like* the winning profile are pre-screened, immediately run through the calculations/detection to confirm the signal, and opened **as early as possible** (capturing more of the move → better fee coverage). Net effect: profitable-signal fingerprinting → scanner-side predictive PRE-SELECTION + faster admission of high-probability setups, instead of treating every scanner pair equally and evaluating blind. **Needs paper-active WINNERS to build the profile → Phase-25.** **Relationship to the calibrated-pWin work (25-4 / #399):** the calibrated pWin model already learns "what wins" as a probability — this item is the **selection / early-admission APPLICATION** of that same knowledge (a scanner pre-screen + open-sooner pipeline), distinct from the gate/rank application; build them to share the feature substrate, not duplicate it. ⚠️ Overfitting caution (same as the 25-22..25-25 research block): the profile must survive out-of-sample before it drives scanner pre-selection — a profile fit to a handful of paper winners is a poisoned prior. |

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

### 16.8 Predictive-Learning / ML-Era Teardown REMAINDER (added 2026-07-28, **Kyle decision: REMOVE**)

**Kyle 2026-07-28, on the calibration routine:** *"yes, we remove this old legacy piece from the predictive learning and ML days — that needs to be removed… otherwise it goes into Phase 16 when we're debugging and removing legacy stuff."* **He also set the criterion — remove NOW only if it is causing problems. It is not** (write-only; the only readers of `/api/vts/predictive-adjustments/*` are display queries at `client/src/pages/machine-learning.tsx:436-1131`; no trading-path caller) ⇒ **scheduled, not urgent.**

**Three limbs, all logged to this register by B-NEW-54 (2026-06-08) as `RUNNING_ISSUES` #174 and left undecided for seven weeks — remove them TOGETHER, that being the point of a consolidated register:**
- **(a) `server/services/ml-calibration.ts`** + its scheduler (`server/core/schedulers/ml-calibration-scheduler.ts`, cron `0 0,8,16 * * *`) + the `logPredictiveAdjustment` sink and its read-only API routes. **ORIGIN: Replit-era commit `b141cbfdf`, 2026-01-04, whose attached directive `attached_assets/Pasted-Directive-10-6-Predictive-Calibration-The-Training-Loop_*.txt` states its purpose as *"connecting simulation output (VTS) back into strategy input (HYBRID_PARAMS)"*. The write-arm was NEVER built — the directive itself defers auto-apply to the Python ML microservice, and B-NEW-54 RETIRED that microservice.** ⇒ the loop it exists to close can never close.
- **(b) `server/services/retraining-freeze-controller.ts`** — orphaned when the drift-detector's `triggerRecalibration` became a logged no-op.
- **(c) `GET /api/vts/internal/calibration` (`vts.ts:419`) + `INTERNAL_SERVICE_KEY`** — its only caller was the deleted `ml_service.py`. ⚠️ `INTERNAL_SERVICE_KEY` is still read at `vts.ts:421`, so it stays in `.env`/`.env.example` until (c) goes.

⚠️ **AT REMOVAL — DO NOT INHERIT THE SHIPPED FORMULA AS THOUGH IT WERE DESIGNED.** `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` §11.2.1 specifies `winRate×0.4 + avgNetPL×0.3 + consistency×0.2 + regimeAlignment×0.1`; the code computes `avgFinalScore×0.5 + avgPredictiveConfidence×0.3 + avgRegimeWeight×0.2` — **a different formula from different inputs.** The implementation diverged from its own documented intent. The canonical corpus is a frozen historical record and is **NOT edited**; record the divergence in the removal report so whoever builds real learning (Phase 17/18) starts from the intent, not the drift.
⚠️ **ALSO DISPOSE OF ITS ORPHANED OUTPUT SINK:** `logs/predictive_adjustments` (2.3 MB, ~120 daily files) — delete, or record as a chosen-loss. It is part of the unmanaged file-store class (#601).
**What dies with (a), neither built:** `#591` limb (b) (the pinned quality multiplier, `B-CALIBRATION-QUALITY-WEIGHT`) and `B-EVIDENCE-GATE` OBJ-1 (**closed without build 2026-07-28**).
**Mechanics:** rule 18 — record in `DELETED_COMPONENTS_LOG.md` with blast-radius verification, archive to `_archive/deleted-code/*.removed`. **Closes `RUNNING_ISSUES` #174.**

### 16.9 `resetRateLimiter()` — INERT ON THE ONLY ENVIRONMENT WE RUN (added 2026-08-28, **Kyle decision: REMOVE IN PHASE 16**)

**Kyle 2026-08-28, on the dead reset found while unblocking his own login:** *"if it's not interfering with anything right now, then go ahead and slot that in with a definite slot… in phase sixteen."* **Criterion applied and met — it is NOT interfering**, on two independent counts: it never executes here, and its body touches only the login attempt counter (`store.resetAll()`) plus one transparency-log row. **It has no trading-path reach at all** — no trades, no RTB queue, no filters, no scanner, no engine.

**THE DEFECT IS A FALSE MECHANISM, NOT A MALFUNCTION.** `server/startup/rate-limiter-reset.ts:6` returns immediately when `NODE_ENV === "production"`, and **staging IS production** (`.env` and pm2 both). `server/index.ts:516-517` calls it on every boot, so **the call happens and the body does nothing.** What actually clears the login limiter on restart is the process being new — the helper contributes nothing to that. Its comment claims it *"guarantee[s] a clean state"*, which reads as a working mechanism to anyone who greps for one.

**⛔ THE DISPOSITION IS A REAL FORK AND THE BATCH MUST DECIDE IT, NOT ASSUME IT.** The comment scopes its purpose to *"automated testing"* — so the question that separates DELETE from FIX is: **does any automated harness log in against a long-lived non-production process?** If yes, the guard is correct and the bug is that our only such environment is flagged production. If no, it is unreachable by construction and goes. **Enumerate the login callers before cutting** (§9.5(a-ii) — a removed writer with a surviving reader produces no compile error).

⚠️ **CROSS-REFERENCE — this is `#935`'s sibling, not a duplicate.** `#935` was the LIVE defect (the login limit counted every client as one shared bucket behind the proxy, so my own automated logins locked Kyle out of his own account); it shipped as a hotfix on 2026-08-28. **This entry is the dead helper found while diagnosing that** — same file neighbourhood, unrelated mechanism, no urgency.
**Mechanics:** rule 18 — record in `DELETED_COMPONENTS_LOG.md` with blast-radius verification, archive to `_archive/deleted-code/*.removed`. **Closes `RUNNING_ISSUES` #936.**

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
- **20.3.1 — Unit/integration test-tier separation (RUNNING_ISSUES #226; HOMED HERE by CC+Langston 2026-06-13, Kyle-delegated).** Split vitest into projects/tiers: the **unit tier runs with NO database reachable**, so any unmocked DB read in a unit test fails fast in CI too (today CI's Postgres container masks it — that gap hid the P19-B1 pattern-filter DB dependency for 28 days). Acceptance case #1: `b79-0m-b2-pattern-filter.test.ts` passes on the no-DB unit tier (proves the cache seeder, not the DB, satisfies it). Why Phase 20 not Phase 19: it re-plumbs how *every* test runs — landing that mid-Phase-19 swaps the foundation while standing on it debugging; the parity bench always having a DB now removes the most likely interim false-pass vector. **Interim mitigation (Langston, optional — do ONLY if ≤~20 min, else log as tracked debt):** a cheap grep-level CI guard that fails any *new* unit test importing the DB client without the mock — converts silent accumulation across the ~13 Phase-19 batches into caught-at-write-time. Also folds in Langston Step-4 note A: TEC `requireKey` `=== undefined` → `== null` so a malformed null-valued seed row is caught too (ride the next TEC touch if sooner).

### 20.4 Security Finalization
- RBAC enforcement standardization across all routes (RISK-055)
- API versioning (`/api/v1/` namespace) (RISK-056)
- JWT token migration from localStorage to httpOnly cookies (RISK-063)
- Endpoint cleanup: remove any remaining unused server endpoints

### 20.4.5 Observability hardening (NEW 2026-06-12 — §19.6.6 long-tail)
- Extend the §19.6.6 internal-health layer: remaining subsystem rows, threshold tuning from Phase-19/25 observed baselines, alert-fatigue review (escalation N values), runbook links per alert category.

### 20.4.6 TRADEABLE-UNIVERSE BOUNDARY — fiat-vs-fiat currency pairs are inside the crypto universe (NEW 2026-08-28, `RUNNING_ISSUES` #937)

**A PRE-LIVE GUARDRAIL QUESTION, not cleanup.** Pure fiat currency pairs — `USD/CAD`, `USD/CHF`, `GBP/USD`, `EUR/USD`, `AUD/USD` — are admitted to the **crypto** scan universe, evaluated by crypto strategies, and stored with `asset_class = 'crypto_spot'`. **13 have opened and closed** (2026-07-15 → 07-26, **every one a loss, −$10.42 total**, against 414 crypto closes at +$142.55). They are **still generating signals today.**

**WHY IT IS HERE AND NOT IN PHASE 16:** this is not legacy residue — it is a live boundary the system does not currently draw, and **the risk is asymmetric across the mode boundary.** In paper mode it costs ~$10 and pollutes 3.1% of the crypto population. **In live mode it places real orders on instruments nobody chose to trade, sized and targeted by crypto logic.** ⇒ it must be settled **before Phase 21**, which is what makes Phase 20 its home.

➕ **SCOPE DOUBLED 2026-08-28: THERE ARE TWO FAMILIES, NOT ONE.** Beyond the pure fiat-fiat pairs above, **stablecoin-vs-fiat pairs** (`USDC/AUD` `USDC/CAD` `USDC/CHF` `USDC/GBP` `USDT/AUD` `USDT/GBP`) are also in the crypto universe: **20 closed trades, −$19.47**, disjoint from the 13 fiat-fiat (overlap control = 0). **Together 33 trades, −$29.89, 8.0% of the 414-trade crypto population.**
★★ **AND SET A IS KYLE'S OWN JULY QUESTION FROM `#550`** — *“should a near-flat USD-stablecoin pair like `USDC/CHF` be in the tradeable universe at all?”* **`USDC/CHF` is in it.** He raised it as a hypothetical; it now has trades and a loss behind it. ⇒ **one scope decision covers both families.**
**THE DECISION IS KYLE'S (rule 24 outcome 2 — working-as-designed-but-unaddressed; what is missing is a decision, not a fix):** exclude fiat-vs-fiat pairs from the crypto universe, admit them deliberately as their own asset class, or leave them in with stated reasoning. **Do not silently add a filter** — the boundary should be written down wherever it lands.

✅ **MECHANISM ANSWERED 2026-08-28 — AND IT IS CHEAPER THAN THIS ITEM FIRST ASSUMED.** The quote-currency filter **exists and is fully implemented** (`active-scan-diagnostic.ts:208-209`, sole live writer); it is **disarmed by an empty config**, not absent. **MEASURED:** `allowed_trading_pairs` is EMPTY on all three `trading_settings_legacy` rows, against its own schema default of `ARRAY['USD','USDT']` (`shared/schema.ts:230`), with the code stating why — `// Phase 27.F.13.B: No currency restrictions per user request`. ⇒ **A working filter would reject `USD/CAD` on quote `CAD` today if that array were populated.** ⚠️ `#677`'s config-gated-not-absent shape.
⛔⛔ **BUT THIS IS NOT "a one-value DB change", AND THAT PHRASING WAS STRUCK 2026-08-28.** The EDIT is one value; the CONSEQUENCE is **re-arming a quote-currency gate across the ENTIRE crypto universe.** ★ **The array was emptied `per user request` (`active-scan-diagnostic.ts:140`, restated at `:208`) — so KYLE IS BEING ASKED TO REVERSE HIS OWN EARLIER REQUEST, and the item must put it to him in those words.** Presenting a reversal of his own decision as a trivial config edit is how a scope call gets made by accident.

➕ **ADDED OBJECTIVE — `RUNNING_ISSUES` #938 (rule 24 outcome 1, a real defect):** the xStock tab renders its three N/A gates (stablecoin, quote-currency, market-cap) and max-price as counted zeros instead of `—`. The backend has sent `applicable:{…false}` since `BATCH_79_0m_a`; **the shared panel discards it as non-numeric (`vts-filter-diagnostics-panel.tsx:772`, `:1059`) and has never read it.** Folded here because it is the same panel and the same reader-facing "is this zero a measurement or an N/A?" question. ⛔ **It is a CODE FIX that stands alone and must NOT be closed by the universe-boundary decision above.**

**Mechanics:** the exclusion, if chosen, needs a real discriminator. **Kraken labels crypto and fiat identically** (`aclass_base = "currency"` for both, `kraken-asset-pairs-service.ts:22`), so `aclass` cannot separate them — a maintained fiat list or a base-asset check is required. **Enumerate every admission path before adding one gate** (§9.5(a-ii)): `#937` records that the path admitting non-USD-quoted `USD/CAD` is **not yet traced**, against an `allowedQuoteCurrencies` list of `['USD','EUR','USDT']` at `routes.ts:3732`.

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

#### 21.1.a ⛔⛔ **`B-LEGACY-LIVE-EXIT-PATH` (`#953`) — HARD GO-LIVE BLOCKER. NO REAL CAPITAL TRADES UNTIL THIS IS CLOSED.**
**HOME: `B-LEGACY-LIVE-EXIT-PATH`, owner CC-C, placed in `POST_AUDIT_ROADMAP` at Phase 21.1, immediately after *“Resolve BUG-010, BUG-011 (TradingEngine placeholder code for live mode)”* and before 21.2.** *(Kyle-directed 2026-08-30: this must be slotted into Phase 21 and confirmed.)*

⭐ **IT IS ALREADY THIS SECTION'S SUBJECT — 21.1 owns *“TradingEngine placeholder code for live mode”* AND *“validate kill switch functions correctly for live mode”*, and `#953` is both of those in one route.**

**ONE live authenticated HTTP route (`routes.ts:5054` → `trading-engine.closeTrade`) carries FOUR defects, all re-derived at the ref:**
1. It places a **REAL market sell** on the venue (`kraken.addOrder({type:'sell', ordertype:'market'})`).
2. It then books `exitPrice = marketPrice * (1 - Math.random()*0.1/100)` — **a randomly generated haircut instead of the actual fill.** Founding invariant **F7** forbids exactly this (*“mock pricing is prohibited in production”*), and this is **not** the env-gated mock path; it is unconditional.
3. It writes the **legacy `trades` table** (`storage.closeTrade` → `db.update(trades)`) while the daily-loss kill switch sums **`.from(closedTradesTable)`** ⇒ ⛔ **a close through this route is INVISIBLE to the kill switch.**
4. It books the live exit fee at a hardcoded **`0.0026`** against a July-9 Tier-1 taker of **0.80%**.

⚠️ **NO PAPER-MODE IMPACT TODAY** — the live branch is Phase-21 gated, which is why this is a blocker and not an incident. ⛔ **NO FIX PRE-JUDGED (rule 15): the first question is whether this route should exist at all, which is `PHASE_19_PLAN` row 3h's subject. Deleting the `Math.random()` alone would leave a real order booking a modelled exit against a table the risk system cannot see.** ↔ `#734` (the other Phase-21 go-live blocker in this family).

### 21.2 Paper-to-Live Transition Testing
- Run parallel paper+live (small position sizes) to validate consistency
- Compare paper sim results with live execution results
- Validate fee/slippage models against actual Kraken fills — **➕ 2026-09-02 (F-G-2 OBJ-5, `#914` residual): this item now explicitly includes the VTS 0.05%/leg slippage CONSTANT (INVARIANT F2, Directive 11.3B / BUG-028) checked against measured fills; one crypto one-leg read on 2026-09-01 gave 0.0612%. A Phase-25 CALIBRATION question, NOT a defect — the constant is a design decision, re-discovered three times by sessions that censused without reading provenance.**
- Validate cost-model accuracy against real Kraken fee schedules

### 21.4 POST-LAUNCH REVISIT — the strong-trend lane's absent volume floor, and the unread half of the order book

**KYLE'S DECISION, 2026-08-27, and the reasoning IS the item:** *"since you've shown me the results of trading these and the fact that it hasn't really caused any damage… let's look at it after we launch. And I get that just because it hasn't become a problem yet doesn't mean it won't ever."* => **DELIBERATELY DEFERRED ON EVIDENCE — not forgotten, and not unexamined.** Investigated in full 2026-08-27; **the investigation is the reason it is deferred rather than fixed.**

**THE STATE.** `crypto_spot` `strong_trend` / `vts_strong_trend` are the ONLY filter paths of nine with `min_volume = 0` **AND** `min_liquidity = 0` (every other crypto path carries 150,000-500,000; **every xStock path carries a 150,000-500,000 `min_liquidity`, including its own strong-trend lane at 500,000**). Pairs with a directional bias >= 0.35 route to that profile and bypass the standard globals — `market-scanner.ts` B63.3, *"the key architectural promise of B63."* Live profile: `minPrice=0.001`, `minVolume=0`, `maxSpread=3%`, `minHistory=5`.

**PROVENANCE — a documented, audited decision whose stated reason was SAMPLE SIZE, not risk.** `BATCH_63_SCOPE.md:58` proposed `volume=$250k`; `BATCH_63_COMPLETION_REPORT.md:197` records *"B63.4 loosened to min_volume=$0 to increase Path D trade count"*; `B64_AUTHORITY_BASELINE_AUDIT` caught it independently as *"1 intentional documented drift."* WARNING: **decided 2026-04-20 — four months before `#741`/`#507` established that thin books produce prices that never traded.** Disposition (2): working as designed, on a design predating the knowledge that changes its calculus.

**NO FLOOR WAS ADDED — THREE INDEPENDENT MEASUREMENTS, ALL NULL** (crypto, opened >= 2026-07-15, banded on entry liquidity):

| band | n | avg net % | mean abs ENTRY slip | mean EXIT slip | mean hold |
|---|---|---|---|---|---|
| <100k | 12 | **+2.14** | 0.516% | **0.576%** | 17.9h |
| 100-250k | 12 | -1.27 | 0.137% | 0.865% | 6.4h |
| 250-500k | 48 | -0.55 | 0.027% | 0.290% | 5.8h |
| >500k | 218 | +0.45 to +1.23 | **1.184%** | **1.060%** | 7.5h |

**The thinnest band is the BEST performer, has BETTER exit slippage than the deepest band, and shows no exit difficulty.** Thinnest symbol actually traded: **$25,858** daily volume. WARNING: **the >500k arm is inflated by the phantom-fill rows, so treat it as an upper bound — that only strengthens the direction.** A $100,000 floor was proposed and **WITHDRAWN**: it would have cost 12 of 290 trades (4.1%) to solve a failure that has not occurred. **A number chosen only so as not to be zero is a fitted-to-nothing constant.**

**THE BETTER INSTRUMENT, ALREADY ~90% BUILT — this is what to pick up post-launch.** `depth-source.ts:129` `assessSufficiency(snap, side: 'asks'|'bids', orderNotional, config)` is **already side-generic** (`cumulativeNotional(side === 'asks' ? snap.asks : snap.bids)`), pure and unit-tested; `getDepthSnapshot` returns **both sides plus `ageMs`** in one call for **both** asset classes; `active-execution-engine.ts:249-251` already calls it at the open seam and already blocks the open. **Repo-wide it has exactly ONE non-test call site, and it passes `'asks'`. The bid side is never assessed anywhere.**
=> **The unread half of the book IS the feature.**

**KYLE'S FRAMING, RECORDED AS THE CORRECT ONE:** the book is looked at **ONCE**, before the trade, and **both sides are visible in that same snapshot** — so *"can we get in"* and *"what could we sell into"* are **one question asked at one moment**, not an entry check plus a later exit check. (CC-C's original "exit-side check" phrasing implied a second event and was wrong.)

WARNING: **VERIFIED LIVE 2026-08-27, because the belief that this was xStock-only was WRONG.** Opens since the entry stamp deployed carry `entry_book_age_ms` populated with `entry_price_source = crypto_ws_book` (crypto) **AND** `xstock_ticker_snap` (xStock). **The depth gate runs on BOTH classes today.** A third row shows a maker fill with NULL book age — correct by construction, and the built-in control: a resting fill consults no book. *(That proof exists only because `B-EXIT-PROVENANCE`'s entry stamp shipped 2026-08-26; before it, there was no way to demonstrate the gate had run.)*

**TWO LIMITS THAT MUST TRAVEL WITH THIS ITEM:**
1. **Depth at entry does not predict depth when the stop fires 6-18h later.** It screens what is thin *now*; it is **not** a guarantee of exitability.
2. **It CANNOT be costed in advance** — bid-side depth at entry is not retained, so nobody can say how many trades it would block. **Ship OBSERVE-ONLY first** (log what it would have blocked, no behaviour change), read it, then set the threshold from measured data. **That is precisely the discipline whose absence produced the withdrawn $100,000.**

**OWNER: CC-C. PLACEMENT: here, Phase 21, after live activation — Kyle's explicit call.** No date, per section 9.4. Related: `#563` (venue-resting exit — the structural answer to in-process stops), `#741`, `#507`.

### 21.3 Live Mode Guardrails
- **21-3a (NEW, P19-B6.8a 2026-06-30 — RUNNING_ISSUES #401): add the "Live Guardrails" tab to the Guardrails & Filters page** — a one-liner now that `CoreFourGuardrails` takes a required `mode` prop: a `TabsTrigger value="guardrails-live"` + `<CoreFourGuardrails mode="live" />`. P19-B6.8a pinned the existing tab to PAPER ("Paper Guardrails"), so **live-mode guardrails are currently UI-uneditable** — this item restores live-guardrail editability and MUST land before live active trading turns on. Deliberate interim gap (CC-B + Langston Step-4 consensus): acceptable only because live is dormant until this phase. **★ Two mode-leaks to fix when building the live instance (Langston Step-8 note + CC-B trace 2026-06-30) — `CoreFourGuardrails` is a SHARED subcomponent, so before rendering it with `mode="live"`: (1) the "Current Balance = $X" shown in the guardrail descriptions comes from a HARDCODED `fetch('/api/paper-sim/portfolio-summary')` (`core-four-guardrails.tsx:167`) — make it mode-aware (live needs the live portfolio summary, not paper-sim) or the live tab will display the paper balance; (2) confirm no warn-tier / guardrail copy string hardcodes "paper" (today it derives from the prop — keep it that way). The mode HEADER + tab label already derive from the prop, so those are safe.**
- **21-3b (NEW, P19-B6.9 2026-06-30 — RUNNING_ISSUES #398/#396): calibrate the go-live WS-readiness gate's uptime threshold vs. the rolling-window granularity.** B6.9 fixed the #398 drift (parity-gate WS uptime is now a rolling-1h window via `feedIntegrityMonitor.getRollingWindowReadiness()`, denominator = snapshots present, NOT cumulative-since-boot). But the existing **99% floor** (`parity-gate.thresholds.minWsUptime`) interacts with the 12-snapshot/1h granularity: one reconnect in the last hour → (1−1/12)×100 = 91.7% → fails the gate, i.e. ANY reconnect/hour currently blocks go-live. Decide at go-live whether that's the intended bar or whether to relax (e.g. allow-1-reconnect, or a finer sub-snapshot reconnect window). Also confirm `MIN_READINESS_SAMPLES=6` (30-min warm-up before the gate is assessable) is the right go-live warm-up. **This is a THRESHOLD-calibration decision, not a bug** — B6.9 deliberately did NOT re-tune the floor (gate dormant until this phase). Pairs with the existing parity-gate validation below.
- **★★ 21-3d (NEW, KYLE-DIRECTED 2026-08-21 — B-BALANCE-TRUTH Step G / `B-MODE-DELETE-SCOPE`): THE RESET FUNCTIONS DELETE BOTH MODES' DATA. THIS ONE LOSES DATA RATHER THAN MISREPORTING IT, AND IT MUST LAND BEFORE LIVE IS ENABLED.** `deleteAllClosedTrades(mode)`, `deleteAllActiveOpenPositions(mode)` and `deleteAllActiveTradeLogs(mode)` each accept a `mode` and **delete every row regardless of it.** Reachable from `POST /api/active-engine/reset`, `POST /clear-data`, `DELETE /clear-trades`, and `c14-validation-service.ts:153 sanitizeEnvironment(mode: 'paper' | 'live')`.
  - ★ **THE UI EXPOSES IT:** `paper-open-trades-tab.tsx:297` posts `{ mode: 'paper' }` to `/active-engine/reset` — **a reset control on the PAPER page would delete LIVE open positions.**
  - ★ **`sanitizeEnvironment` is typed `'paper' | 'live'`** — written anticipating both modes, with the storage layer silently discarding the distinction. Not an unforeseen gap: a parameter threaded correctly to a function that ignores it.
  - **Inert today** (live has never run, so there is nothing of the other mode to destroy); **it stops being inert at the first live position.**
  - **DEPENDS ON the paper/live discriminator column** (B-BALANCE-TRUTH Step F) — a delete cannot filter by a column that does not exist, so the ordering is forced.
  - **Fence must prove what it does NOT delete:** seed a live row, run each reset with `mode='paper'`, assert the live row SURVIVES. A delete that removes too much passes any test that only checks the target is gone.
  - ⚠️ NOT affected: `deleteActiveOpenPosition(mode, id)` also ignores `mode` but deletes by unique id, so no cross-mode deletion is possible. One of the four is harmless; three are not.
- **★ 21-3c (NEW, KYLE-RULED 2026-08-21 — RUNNING_ISSUES #734): the engine-start health gate REFUSES TO START IN LIVE, for two independent reasons, and must be fixed BEFORE live is enabled.** `active-portfolio-manager.ts:165` throws `Portfolio in critical state` when `checkPortfolioHealth()` returns `critical`; the paper branch at `:153` only logs, so **this is invisible until the first live start.** Both trips are live TODAY on staging:
  - **(i) drawdown measured across a re-anchor.** `/api/active-engine/health` reports `critical — max drawdown 47.15% exceeds limit 20%`. Reproduced in SQL: **$388.57** peak-to-trough over 478 closed trades since 2026-07-15 — **47.15% of the current $824.11 anchor, 17.27% of the pre-re-anchor $2,250.** Numerator accumulated in one balance era, denominator from another. **Recurs on every downward re-anchor** (#692's trigger, different consumer). Fix: reset the drawdown series at the active anchor, or carry balance-at-the-time as the denominator — **Kyle's call, it changes what a risk threshold MEANS.**
  - **(ii) `MAX_OPEN_POSITIONS = 10` hardcoded** at `active-portfolio-manager.ts:58` against the live paper configuration of **15** slots. Sets `critical` **on its own**, every start, regardless of drawdown. A hardcoded behavioural knob of exactly the kind CLAUDE.md rule 15 says must be DB-resolved.
  - ⚠️ **FIXING EITHER ALONE LEAVES LIVE BLOCKED.** Both, or neither.
  - **★ Also fold in `active-portfolio-manager.ts:505`** — it keeps its 1,000-row cap, deliberately held out of B-BALANCE-TRUTH by Langston (2026-08-21) because uncapping it grows a numerator accumulated under the old balance against the new one — **louder without being truer** — and because `PHASE_27.F.13.I_VALIDATION_REPORT.md:16` records `checkPortfolioHealth()` as the **hang point of `manager.start()`**, root cause *"not fixed, only worked around"*: an unbounded list read there re-creates a known start-path hang. **Convert it SQL-side inside THIS item's diff — one diff on a live-mode gate, not two.**
  - **Verified NOT to affect paper mode or any dashboard** (Kyle's condition for tabling it): the paper branch only logs, no client code consumes `/api/active-engine/health`, and nothing else in `server/` reads it. Tabled here on that evidence, not on assumption.
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
## Phase 21.6: Evidence-Based Pool Ranking — rebuild "scan the proven winners more often" (Post-Live; Kyle-directed 2026-07-28)

**Origin.** `B-ARM-REMOVAL` (2026-07-28) DELETED the Adaptive Ratio Manager — the dynamic ideal/rotational scan split. ⚠️ **DELETED, not disabled** (archived at `_archive/deleted-code/b-arm-removal-adaptive-ratio-manager.ts.removed` as a 100%-similarity rename, so `git log --follow` traverses its full history). **Kyle 2026-07-28: *"eventually I would like to get back to having this, when we have more data and actual live data that it shows who are our proven winners. And I'd like to set it up on xStocks as well… after we launch the live mode active path trading."*** This phase is that rebuild.

**Why the original failed — do not repeat it.** (1) **It never measured performance.** Membership came from `getCompositeScore`: four **pre-trade estimates** off a **single most-recent observation**, minimum-sample rule removed. No profit, no outcome, anywhere (**#597**). (2) Its evidence sources were unusable — a live-mode-gated table that has never held a row, and a confidence damper saturating at 100 samples. (3) The ratio never reached allocation: `actualIdeal = min(target, available)` and available never exceeded 16 against targets of 151–180.

### ★ HARD PREREQUISITES — this phase CANNOT start until these are true
1. **#599 — RETENTION FIXED FIRST. Closed trades are currently HARD-DELETED at 90 days with no archive** (not in the manifest, not in the b75 sweep, `DELETE FROM vts_open_trades`). ⇒ **the corpus cannot accumulate; at launch we would hold 90 days, permanently.** ★ **Every day this is unfixed destroys another day of the very evidence this phase needs. It is the gating item, and it is gating NOW, not at Phase 21.**
2. **#596 — REPRESENTATIVENESS.** The only store with outcome fields is the JSONL fallback sink; the DB copy has **no** `netProfit`/`exitPrice` at all. If that sink covers a lane-selected subset, the sample is **biased in a way no statistics repair** — bias outranks volume.
3. **#597 — MEMBERSHIP.** Fix what "best performing" means before re-introducing anything that acts on it.
4. **Live-mode outcomes exist** (Kyle's condition: *actual live data*), for **crypto AND xStock**.

### The principled implementation (already researched — do not re-derive)
- **Reward = mean net log-growth per closed trade**, net of friction — simultaneously the Kelly criterion and the ρ=1 manipulation-proof measure (Goetzmann/Ingersoll/Spiegel/Welch 2007). ⚠️ **NOT win rate** — the most manipulable performance statistic there is (Lo 2001's *Capital Decimation Partners*: near-100% win rate, hidden bomb), and it contradicts §0's *"edge is selection, not frequency."*
- **Allocation = discounted Thompson Sampling** (Beta-Bernoulli or bounded-Gaussian) — chosen over UCB because our feedback is **delayed and batched** (Chapelle & Li 2011). Geometric decay toward the default split makes *"revert to default when evidence is stale"* a property of the model rather than a bolt-on.
- **Shrink to a COHORT, not the grand mean** — symbol nested in (asset class × strategy × regime); partial pooling estimates every level off the whole corpus.
- **Window far wider than the original 24h-per-regime**, which was structurally unfeedable.
- ⚠️ **If per-group counts still cannot reach the hundreds, the honest answer is a FIXED SPLIT** (DeMiguel/Garlappi/Uppal 2009; Goyal & Wahal 2008 — reallocating toward observed outperformers added nothing). **Do not ship a ranking with an undifferentiated middle dressed up as insight.**
- **Ship the disconfirming alarm with it (#598):** emit when `available ≥ target` — the one condition under which any of this binds.

**Full record:** `DELETED_COMPONENTS_LOG.md` · `SYSTEM_MANUAL.md` §6 · `B_ARM_REMOVAL_SCOPE.md` · `Langston Design Asks/B_CALIBRATION_QUALITY_WEIGHT_RESEARCH_SYNTHESIS_r1.md` (citations).

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

- **2026-06-19** — **Phase-19 REORG: both-classes "both in code, one live at a time" (CC-B + Langston; Kyle released the CC-A-concur dependency).** Active Trading Pipeline Audit (3-way APPROVED) reshaped the build order: fixing #233 does NOT open crypto (pWin capped 0.60) — the gate-10 unblock is the FEE LADDER (rung-1 bigger ~3.5-4% targets at taker / rung-2 maker build + asymmetric-stop EV kernel + shared active+VTS maker-taker service / rung-3 pWin-ceiling on measured win-rates). Shadow-trade layer (19-17/B8) PULLED FORWARD; the ranking fix (live picker ranks on anti-predictive finalScore; rankingScore inert) is the make-or-break. Both classes built together + paper-active ON by Phase-19 close (D3); Phase-25 calibrates both (crypto comfortable first; xStock may run parallel with Phase 16/20 — refines the 2026-06-08 strictly-sequential call for independent workstreams); both ready by Phase 21 → launch live together (D5). HARD GATE: one asset class in active-trading during validation (D7). Authoritative: `Scope Files/P19_REORG_BOTH_CLASSES_PLAN_2026-06-19.md` + `PHASE_19_PLAN.md` §1 banner. §13 homes #328-#331 in RUNNING_ISSUES.

- **2026-06-12** — §19.6 expanded into system-WIDE diagnostics (new 19.6.6): internal pipeline health + trade-lifecycle invariants + trend-based early-failure escalation feeding the alerts queue; absorbs the broken health monitors (#214) + the Boot Coordinator's runtime-monitoring half; long-tail → new §20.4.5. Home = Phase 19 end (rejected Phase 16: protective infra, not cleanup).
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

**B-5 close deposits (2026-06-12) — Phase-19 items from the AMR ship + audit:**
1. **AMR activation decision + flip checklist (Phase 19):** flip amr_runtime.mode shadow->active per class ONLY after the shadow-week would-vs-actual review. Checklist items banked from live evidence: (a) #224 restart-transient — decide IDLE-hold during sentinel warm-up vs the current thin-input CALM (~90s full-size window per restart under active); (b) session-boundary classification flap rate from the shadow-week ledger — decide whether classification-level hysteresis is needed (the dwell ladder already damps MODE one-rung, proven 19:40-20:20Z 2026-06-11); (c) #222 crypto DBS equity-contamination root-cause MUST be resolved before active (the dbs input reads the contaminated aggregate); (d) EV-gap window warm (30 obs/class post-units-fix).
2. **#217/#221 evidence unlock (Phase 19):** rankingShadow + ceilingSaturationRate populate ONLY from the RTB/getTopSignal selection path — zero rows in passive operation (Langston Step-8, semantics confirmed). The CONTEXT_BONUS wire-in evaluation and the cross-class rankingScore leveling calibration both START when Phase 19 turns selection on; do not count on shadow-week rankingShadow data.


## Future-roadmap note — daily reports return on our own ML (Kyle ruling 2026-07-03, P19-B-RENAME W1)

The Walter-era `paper_daily_briefs` + `paper_ai_reports` tables (the early OpenAI-via-API embed that never worked) were DELETED at P19-B-RENAME Wave-1 (both live-verified empty). **Kyle: the daily-reports CONCEPT returns later, rebuilt on our own machine learning / injected AI — not the preserved tables.** When the ML build reaches report-generation (post-Phase-25 calibration era), home the rebuilt daily-report design as its own scoped batch.


---

## §3.3-PULL — ★ WHICH PHASE-25 ITEMS CAN MOVE UP TO PHASE 19 NOW (Kyle directive 2026-08-08)

**KYLE'S TEST, and it is a genuinely clean one:** *"if we're looking at how price moved afterwards and geometry, that can be derived from data that we have from the VTS and not required from trades that have gone through the SQE and have had to sit in the RTB queue."*

**⇒ THE CLASSIFYING PRINCIPLE: does the question ask about the MARKET, or about our SELECTION?**
- **MARKET question** — *given this entry, did price reach X before Y?* **Admission bias changes WHICH entries you sample; it does NOT change how price moved afterwards.** ⇒ answerable on **VTS + 1m bars, TODAY** (43,523 crypto rows with full geometry; minute bars back to 2026-04-28).
- **SELECTION question** — *should this signal have traded / was it ranked correctly?* ⇒ needs the **SQE-gated, RTB-ranked** population, which is small (n=241 crypto, 12 organic) and accrues slowly. **Stays in Phase 25.**

| item | question type | verdict |
|---|---|---|
| **25-17 target-geometry calibration** | **MARKET** — did price traverse k×ATR before the stop? | **★ PULL FORWARD.** The replay method is built and was run 2026-08-07/08. Covers both target mechanisms (9 ATR-multiplier + 10 R-multiple/measured-move/percent). |
| **25-13 faithful geometry reconstruction (xStock)** | **MARKET** — but ⛔ **blocked on the #206 anchor gap, NOT on admission.** B-NEW-53 now captures anchors forward. | **PARTIAL** — the crypto equivalent is unblocked TODAY (1m bars exist); xStock still waits on accrual. **Split it.** |
| **25-11 order-book / liquidity-aware sizing** | **MARKET** — depth-vs-fill is a venue property | **★ PULL THE MEASUREMENT** (not the sizing change): the depth study §2.5 already needs is the same instrument. |
| 25-2 regime confidence-chain · 25-4 SQE recalibration · 25-10 crypto confidence-modifier | **SELECTION** — all calibrate what gets ADMITTED | **STAY.** These are exactly the apples-to-apples-population items; VTS cannot answer them. |
| 25-3 TFS sustainability gate · 25-5 observational decision gate · 25-15 HCE rejected-arm | **SELECTION** | **STAY.** |
| 25-16 trade-size / concurrency / balance sensitivity | **MIXED** — fill quality is MARKET (depth-walk is size-dependent in code); win-rate-vs-size is SELECTION | **SPLIT** — the fill-quality half is measurable now. |
| 25-7 / 25-8 / 25-9 xStock macro, pattern cap, pair correlation | **SELECTION** | **STAY.** |

**⚠️ THE LIMIT OF THE PRINCIPLE, STATED SO IT IS NOT OVER-APPLIED:** a market-question replay tells you **what the geometry would have done on the entries you sampled**. If the sampled entries are unrepresentative of what the live gate admits, the replay's ABSOLUTE numbers do not transfer — **only the SHAPE does** (e.g. "hit rate falls ~10 points per 0.5× of target" held across three differently-biased populations on 2026-08-07, while every LEVEL differed). ⇒ **pull-forward items may set RANGES and DIRECTIONS now; final VALUES still want gated data.** That is the honest version of Kyle's *"start to work with sharper ranges and thresholds"* — sharper, not final.
