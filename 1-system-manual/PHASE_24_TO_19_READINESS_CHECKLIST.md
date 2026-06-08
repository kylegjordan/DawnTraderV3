# PHASE 24 → PHASE 19 READINESS CHECKLIST

> **Canonical, ordered source of truth** for all work between the Phase 24 close and the Phase 19 kickoff. Created 2026-06-08 (Kyle directive) after a full audit of `POST_AUDIT_ROADMAP.md`, `MULTI_ASSET_VTS_EXPANSION_PLAN.md` (incl. the xStock 15-minute working-list at the bottom), `RUNNING_ISSUES.md`, and `ASSET_CLASS_ONBOARDING_WORKFLOW.md`. **Update this doc as each item closes.** Retire to `_archive/` when Phase 19 kicks off. Active trading is OFF throughout all of this.

---

## 0. STATUS SNAPSHOT (2026-06-08)
- **Phase 24** (xstock_spot onboarding umbrella) — onboarding **closed 2026-05-10**; the calibration *tail* is data-blocked and parked in Phase 25 (see §9). The formal Phase-24 **governance close** (all sub-batch reports + one umbrella report + finalized onboarding workflow) is **NOT yet done** — that is items 1 + 2 below.
- **Decision-provenance capture** (was roadmap **19-20**, a pre-19 build item) — **DONE.** Built + deployed + closed as B-NEW-53 / B-NEW-53.1 / B-NEW-53.2 (2026-06-07/08), both spot classes. The roadmap doc still lists 19-20 as pending — a staleness to fix in item 2.
- Recent fixes all closed: B-NEW-52 (weekend-cron retirement), B-NEW-53/.1/.2 (provenance + admitted-features).

---

## 1. ★ THE ORDERED SEQUENCE (Kyle directive 2026-06-08) — DO STRICTLY IN THIS ORDER
1. ✅ **Finalize the asset-class onboarding workflow** (the doc for adding new asset classes) — DONE 2026-06-08 (research-driven rebuild, Langston-reviewed). → §2
2. **Final Phase-24 governance close** — close all Phase-24 sub-batch completion reports + generate ONE final umbrella completion report for all of Phase 24. → §3
3. **ml-service restart fix** (the small process-management fix). → §4
4. **VTS standalone always-on Simulation service** — runs whether or not active trading is on. **Includes a required storage-architecture design + decision** (see §5a) before build. → §5
5. **AMR (Adaptive Market Response) body build.** → §6

**Phase 19 kicks off only after items 1–5 are complete.** (Phase 19's own pre-flight list is in §10 for awareness — NOT part of this between-phase sequence.)

---

## 2. ITEM 1 — Finalize the asset-class onboarding workflow
**File:** `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md`. **Status: ✅ DONE 2026-06-08 — research-driven REBUILD + FINALIZED + Langston-reviewed.**

**What landed:** Kyle reframed "finalize" (2026-06-08) as a full research-driven REBUILD (not a light consolidation), to one single source-of-truth playbook with NO competing step-orders, NO numbering collisions, NO empty/dangling pointers. Passes 1+2 (research) = the consolidated artifact `Claude Comms and Packages/Scope Files/ONBOARDING_WORKFLOW_REBUILD_RESEARCH.md` (~90 learnings by onboarding lifecycle). Pass 3 (rewrite) = the doc dropped 1,919 → 692 lines into: Part 0 how-to + Standing invariants + **Part 1 the SINGLE sequence (Phases 0–9, 83 steps, watch-fors embedded)** + Part 2 reference library (28 `R-*` code-template entries) + Part 3 xstock_spot worked example (the former H.1.D code-surface + H.1.E 18-stage stubs FILLED) + Part 4 empty future slots. The old two-competing-step-orders, the `4.15` collision, the misplaced Section D.1, and the chronological §4.x tail are all gone. Langston Step-2 review = approve-with-revisions; both revisions applied (wired the orphaned `R-LAYERS` into Standing invariant #4 + Steps 5.1/7.6/8.5; corrected the `R-DISPATCH` header); R-reference graph verified clean in BOTH directions (28 defs / 28 refs, 0 orphans, 0 danglers, 0 dup step numbers).

**Deferred to ITEM 2 (its rule-correct home):** the CLAUDE.md §3.3 learning-capture flip — §3.3 says "after Phase 24 closes," so it stays active through the final Phase-24 governance close (item 2) so the umbrella Phase-24 report carries its onboarding-learnings section, then converts to ad-hoc.

**Original "what finalize means" (superseded by the rebuild above):**
- The doc is functionally complete + battle-tested (Sections A–L + the xstock_spot worked example are fully populated; 12 "Step 4.x" learning blocks + 4 H.1.x standing rules all have real content).
- BUT a stream of recent learnings (§4.22, §4.24, §4.27, §4.28, §4.29 + the Phase-24 pre-calibration baseline block) were **appended chronologically and never consolidated** into the clean A–L structure (this was explicitly "deferred to post-Phase-24, capturing now per Kyle 2026-06-02").
- Sections **H.2 (crypto_perp) and H.3 (future classes) are intentional empty forward-slots** — leave them empty.
- **Finalize = (a)** consolidate the chronological §4.x tail into the clean structure; **(b)** confirm no further Phase-24 learnings are pending (the xStock calibration arc is data-blocked → Phase 25, so its remaining learnings, if any, are deferred — note this explicitly); **(c)** formally flip the standing learning-capture rule (CLAUDE.md §3.3) from "every Phase-24 batch captures learnings" to "ad-hoc update when substantive learnings surface."
- Governance: this is the artifact that formally satisfies the §3.3 Phase-24-close condition; update CLAUDE.md §3.3 to mark the rule converted, and ASSET_CLASS_ONBOARDING_WORKFLOW header to "finalized."

## 3. ITEM 2 — Final Phase-24 governance close
- **Close all Phase-24 sub-batch completion reports** — audit `Claude Comms and Packages/Batch Completion/` for every Phase-24 sub-batch (B79, B79.TEC, B79.0a–0g/0h, B79.0n.* umbrella sub-batches, B.1–B.5 calibration, B-NEW-* xStock-era) and ensure each has a closed completion report; backfill any gap (RUNNING_ISSUES #145 flags a PHASE_HISTORY sub-batch 5/6/7 backfill gap).
- **Generate ONE final umbrella Phase-24 completion report** — a single report summarizing all of Phase 24 (xstock_spot onboarding + the calibration arc + what landed vs. what deferred to Phase 25), citing every sub-batch.
- **Fold in the governance reconciliation loose ends (§8):** mark roadmap 19-20 complete (provenance done); reconcile the stale roadmap 19-19 AMR-precondition wording (decoupled from xStock umbrella per Kyle 2026-06-05); flip the resolved-but-still-"OPEN" RUNNING_ISSUES trackers (#77, #79, #82, #85, #54) to RESOLVED; regenerate the stale RUNNING_ISSUES summary tally (last updated 2026-05-07); collapse the §19.x-prose-vs-locked-tables duplicates the roadmap itself flags for a start-of-phase cleanup.

## 4. ITEM 3 — ml-service restart fix
**The finding (investigated 2026-06-08):** the `ml-service` PM2 process shows a restart counter of ~**184,185** — but this is **cumulative-since-creation and never resets**; the process has run **stably for 49 days with `unstable_restarts: 0` and an empty error log.** So the number is **historical churn, not a live crash loop.** Logged as VTS-plan working-list item **F.2 (☐)**.
**The REAL fix (small but legitimate):**
- The live process is named `ml-service` (hand-registered in B54) but `ecosystem.config.cjs` defines the ML app as `dawntrader-ml` with guardrails `max_restarts: 5` / `min_uptime: 10s` / `restart_delay: 3000`. **Because the names don't match, those guardrails are NOT attached to the running process** — if it ever churns again, nothing caps it.
- `server/core/boot_orchestrator.ts` ALSO auto-spawns `services/ml_service.py` (a second, independent spawn path) → latent double-management hazard.
- Fix: unify the process under one managed name with the guardrails attached, resolve the dual-spawn path, optionally reset the cosmetic counter. Worth doing pre-19 since active trading leans on the ML helper.

## 5. ITEM 4 — VTS standalone always-on Simulation service
**Decision (Kyle 2026-06-08):** build VTS as a **standalone Simulation service that is ALWAYS running, regardless of whether trading is active.** This **overrides** the earlier MEMORY note ("standalone-VTS firehose = separate lane, do NOT pull in") and the older 2026-05-21 "VTS partition deferred to post-launch, possibly never built" framing — it is now confirmed **part of the between-Phase-24-and-Phase-19 work.**
**Why:** when Phase 19 turns active trading on, the start/stop of active trading would otherwise interrupt the continuous-learning data stream. A standalone always-on sim preserves the broad learning baseline (drift, pattern-path negative-control, every-signal coverage) independent of trading state.
**Design intent (from the roadmap):** ingest market data ONCE, fan out to N consumers (standalone-VTS / paper / live) → zero extra Kraken API calls. Reuse existing VTS infrastructure where possible.

### 5a. ★ STORAGE-ARCHITECTURE DECISION (REQUIRED design step — do BEFORE building item 4)
**Kyle directive 2026-06-08:** before building the VTS standalone, **discuss + decide + plan the full data/storage picture**, because we will soon have **three always-on data producers simultaneously:**
1. **Standalone VTS** — always on (this item).
2. **Paper-mode active trading** — always on once Phase 19 fixes/enables it.
3. **Live trading** — always on once activated (Phase 21+).

**Must decide + document (with Langston, design-before-build per NO-PATCHES §5#15):**
- **What data each of the three producers captures** (and where it overlaps vs. is producer-specific) — and the strict partition so calibration never pools simulated vs. paper vs. live.
- **When/what goes into the tiered storage structure** (hot Postgres → warm cloud-object → cold/drop), per data class. Current state for reference: the B74 OHLC/ticker tables flow hot→warm (Supabase Storage, `default_warm_retention_days=365`); the B70 archive family (`signal_eval_archive`, provenance, etc.) is **Postgres-only with a 90-day partition-drop**, NOT tiered. The new always-on volume (esp. provenance ~1.45 GB/mo today, growing with 3 producers) may warrant tiering decisions.
- **Volume projection** with all three on at once + the retention/tier policy per stream.
- This produces a storage-architecture design doc that gates the VTS-standalone build.

## 6. ITEM 5 — AMR (Adaptive Market Response) body
**Status: NOT started.** The LAST item before Phase 19. (Distinct from the "ARM"/Adaptive Ratio Manager scanner-pool work, which was deliberately SKIPPED.)
**What it is (roadmap 19-19 + `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`):** a "weather-report" posture layer — an aggregator combines regime state + DBS direction/trend + realized-vs-predicted EV + pair-level regime distribution + friction trend into one classification (calm / choppy / stormy / favorable), driving **response dials** (position size, stop distance, target distance, confidence floor, entry cooldown, strategy/pool allowance lists, slot-count caps, hard-pause flag) + an offensive **Aggressive** mode added to the existing Normal/Defensive/Survival skeleton. Hand-set conservative per-asset-class thresholds (NOT VTS-calibrated). Decoupled from the xStock-calibration umbrella (Kyle 2026-06-05) — proceeds on its own schedule.
**Shadow-mode boot gate (Langston):** first ~5–7 days of Phase 19, the aggregator runs + logs every classification/transition but the dials stay pinned at Normal (no actual brakes) — mitigates the debug-confounder during Phase 19's bug-discovery window; then flip the DB flag to active.
**Brain/M2 (the ML posture-model that replaces hand-set thresholds) = Phase 25 / post-launch (roadmap 25-6), NOT this item.**

---

## 7. ALREADY DONE (pre-19 items completed — for the record)
- **Decision-provenance capture** (roadmap 19-20) — B-NEW-53/.1/.2, closed 2026-06-08, both spot classes, runtime-proven. This is what *unblocks* the Phase-25 calibration studies once forward data accrues.
- **xStock 15-minute foundation** (B.4) — landed 2026-06-04, regime/IMF/DBS recalibrated, parity exit-gate passed.
- **Weekend-cron retirement** (B-NEW-52), tiered-storage sweep activation (B-NEW-47), and the rest of the recent operational arc.

## 8. GOVERNANCE LOOSE ENDS (fold into ITEM 2)
- Roadmap **19-20** still listed pending → mark DONE (provenance built).
- Roadmap **19-19** AMR precondition wording stale ("after B-XSTOCK-CALIB umbrella close") → reconcile to the 2026-06-05 decoupling.
- Roadmap §19.x prose vs. the locked Phase-19/25 tables → collapse duplicates (the roadmap itself flags this start-of-phase cleanup, line 67).
- RUNNING_ISSUES: stale summary tally (2026-05-07) → regenerate; resolved-but-"OPEN" trackers **#77 / #79 / #82 / #85 / #54** → flip to RESOLVED.

## 9. CORRECTLY DEFERRED TO PHASE 25 (NOT pre-19 — confirm parked, don't do now)
- **25-12** entry-trigger sweep (B.5 W2.0b) · **25-13** geometry reconstruction + RI-a stop-anchor (W2.0a) · **25-14** per-strategy re-fit (W2.2) + ORB entry-edge (W3) + vwap_bounce forward power-test · **25-15** HCE rejected-arm causal test (#205, distinct intraday-data gap). All data-blocked; self-surface via the #206 accrual alert (2026-07-05).
- xStock outcome-needing calibrations: **25-7** macro modifiers · **25-8** pattern position-cap validation · **25-9** pair-correlation · **25-10** crypto confidence-modifier · **25-11** depth-aware sizing/exit.
- **A few working-list items still showing ☐/◐ to formally park or close in item 2:** Bucket B strategy indicator-gate re-centering (pivot_shift RSI/ADX, sma_trend_ride, mean_reversion) · Bucket D 15-minute pattern-shape re-measurement (likely *moot* — pattern path resolved as coin-flip / kept as negative-control) · Bucket F.1 historical-outcome re-evaluation sanity study (gated after the calibration arc). Decide each: Phase-25 vs. moot.
- **ORB pre-19 slice (carve-out):** the ORB plumbing (DST-aware 9:30-ET anchor + 15m-bar-unit fix + US-holiday/half-day calendar, #203) *can* run pre-19; only the ORB entry-EDGE validation is Phase-25. Decide whether to slot the plumbing into the pre-19 window or leave with 25-14.

## 10. PHASE 19 OPENS WITH (NOT "between" — awareness only)
Phase 19's own pre-active-trading flip gates (these are Phase 19 work): #92 wire xstockSpotScanner through orchestration · #139 resolveAssetClass throwing call-sites · #137 active-trading restoration intake (54 files / 231 tagged errors) · §19.0.5 full data-capture coverage (HARD precondition) · #166 TEC stale-cache fence (fix before active-paper) · #204 xStock corrupt-stop incidence (~45× crypto) · #153 pattern position-cap 0.50 validation · #95 xStock real-time WS pricing adapter · #96 sector-aware cluster prevention · #97 xStock characteristics inventory · #19-17 Active-Trading Simulations layer · Boot Readiness Coordinator (conditional). Phase 19 also runs BEFORE Phase 16 (Kyle 2026-05-23).

---

## 11. CROSS-REFERENCES
- `POST_AUDIT_ROADMAP.md` — Phase 19 table (19-1…19-20), Phase 25 table (25-1…25-15), the Phase-19/25 split note.
- `MULTI_ASSET_VTS_EXPANSION_PLAN.md` — the xStock 15-minute WORKING LIST (buckets A–F), the firehose resequencing, ARM/POOL skip.
- `RUNNING_ISSUES.md` — the open-issue inventory + phase tags.
- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` — item 1 target.
- `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` — item 5 (AMR) design source.
- CLAUDE.md §3.3 (onboarding learning-capture standing rule) · §5#20 (trading-mode taxonomy / Phase 19 definition) · §7.1 (storage workflow) · §5#15 (NO PATCHES / design-before-build).
