# P19-B4 SCOPE — xStock active-path wire-in + high-fidelity paper fill + paper/live isolation

> **Phase 19 · Batch 4.** Status: **DRAFT — awaiting Langston Step-1 ACK.** Author: Claude New (CC-B). Reviewer: Langston (Opus 4.8). Decider: Kyle (autonomous-iteration directive 2026-06-13). Drafted 2026-06-14.
>
> Grounded in a four-part read-only architectural audit (paper-fill fidelity · xStock wire-in · WS-fitness/classify/gates · shared-singleton split-brain). Every architectural claim below carries `file.ts:line` evidence from direct code reads (CLAUDE.md §2.1.a). The repo is on a Google-Drive FUSE mount — `rg`/Glob time out; reads done via `git grep` + targeted Read.

---

## §0 — PREVIOUSLY-STATED-VS-NOW (§9.2)

- **#228 throwing-classify site count: PREVIOUSLY "~12 remaining active-path sites." NOW: ~26 confirmed by direct line-read** (signal-orchestrator alone has 13: 421/464/537/602/782/1038/1049/1083/1120/1425/1597/1941/2070). REASON: line drift + the original count undercounted the orchestrator. Not all 26 are reachable on the active dispatch path — B4a opens with a reachability triage (same method as B3b).
- **19-1 "deferred-activation stubs": PREVIOUSLY framed as inert stubs to write. NOW: the canary log, both outcomeFeedback EMA hooks, and the diagnostic counter are ALREADY BUILT and per-class** (`paper-execution-engine.ts:1606-1611` canary; `:1398-1450` EMA write; `signal-orchestrator.ts:840-856` EMA read). REASON: B79.0n built them per-class; "activation" = the xStock active path actually flowing signals/closes through them, NOT new code. Only genuine deferred *decisions*: per-class slippage (→ Phase 25/26) and risk-pct guardrail class-keying.
- **#231 ablation integer-id: PREVIOUSLY "wire an integer signalId." NOW: a SCHEMA CONTRADICTION blocks a clean wire** — `regime_factor_alternates.signal_id` is INTEGER (`schema.ts:562`) but `trading_signals.id` is a varchar UUID (`schema.ts:667`). The "integer FK to trading_signals.id" premise is itself inconsistent. REASON: requires a schema decision, not just a wire — see §5 decision 3 (recommend re-home).
- **Paper fill "tiered fee model": PREVIOUSLY implied a volume-tier schedule. NOW: a single flat Tier-1 value** (taker 0.008 / maker 0.004 decimal), no tier-selection logic in code (`b72-warmup.ts:156-189`). REASON: clarity for the high-fidelity fill design. Maker is resolved+stored but has zero live consumers.

---

## §1 — Objective & context

Phase 19 turns Paper Mode Active Trading back ON. Batch 4 is the **xStock wire-in (merged 19-1 + 19-7 / #92)** plus the **P19-B2 paper-execution-target work** (high-fidelity Kraken-vetted fill + paper/live isolation). Today: crypto (FX5) flows through the active pipeline (scanner → orchestrator → SQE → RTB → TEC → paper-execution-engine); **xStock does NOT** — the xStock scanner terminates in VTS/passive only (`eval-cycle.ts:831` `registerOpenVtsTrade`, never RTB), and the orchestrator's cycle is hard-bound to the crypto FX5 survivor pool (`signal-orchestrator.ts:1199/1213/1245`). B4 connects xStock end-to-end so paper trades can open AND close on xStock symbols, AND upgrades the paper fill from a flat 5-bps haircut to a depth-walked, partial-fill-capable, venue-vetted fill so paper EV ≈ live EV (Langston's #1 fidelity must).

**This batch does NOT turn active trading on** — that is the B7b flip, gated on the §6 pre-flight checklist. B4 makes the xStock active path *exist and be sound*, and makes the paper fill *honest*. (§9.1 scaffolding declaration carried into the completion report.)

---

## §2 — PROPOSED SUB-BATCH STRUCTURE (for Langston sign-off)

B4 is materially larger than B3. Proposed split (mirrors the B3a/B3b precedent), each its own scope/diff/CI/deploy/close:

- **P19-B4a — xStock active-path wire-in (+ feed-safety gate).** Connect xStock to the active pipeline, with the price-freshness safety gate as a HARD precondition, classify-site hardening + escalation hook, the RTB Phase-4 migration, B3.2 active strategy gates, the #153 0.50-cap validation, and the B11 contamination decision. "Make the xStock active path exist and be safe to flip."
- **P19-B4b — Paper execution fidelity + paper/live isolation.** The high-fidelity fill model (depth-walked slippage + partial fills + `validate=true`), paper's own credential/rate-limit lane, and the shared-singleton split-brain audit + per-mode isolation design. "Make the paper fill honest and co-run-safe."

**Ordering:** B4a first (xStock can flow and fill at the current model), then B4b upgrades fill fidelity for BOTH classes and lands the isolation design. B4a's wire-in does not depend on B4b; B4b's split-brain audit benefits from xStock already being on the path. **Langston: approve the split + ordering, or propose alternative (§5 decision 1).**

---

## §3 — P19-B4a OBJECTIVES (xStock wire-in + feed-safety)

**A1 — xStock scanner → active dispatch seam.** Add an active-path dispatch for xStock so `xstock_spot` signals enter the orchestrator's per-signal pipeline. The per-signal entry point `buildSizedSignalForStrategy(rawSignal, strategyId, sizingContext, marketContext)` (`signal-orchestrator.ts:399-404`) is ALREADY class-aware (resolves assetClass for sizing `:464` + SQE `:601-602`, writes `metadata.assetClass` to RTB `:693`). The seam decision is §5 decision 2. *Verification:* an xStock signal reaches `readyToBuyService.queueSQESignal` with `assetClass='xstock_spot'`; xStock RTB queue depth goes non-zero (`getQueueDepth()` `ready_to_buy_service.ts:1369`); the B3b drop-counter (`[RTB_QUEUE_DROP][CRITICAL]`) stays zero for xStock.

**A2 — Price-freshness gate + silent-stall watchdog (HARD safety gate — audit-4 top risk).** The xStock active path reads ticker prices from DB rows guaranteed fresh only to within **30 minutes** (`scanner.ts:637`), the prior 90s freshness gate was RETIRED, and the WS archiver has **no silent-stall watchdog** (open-but-quiet socket does not reconnect; `equity-spot-archiver.ts:223-225` error handler only logs). Before any xStock active dispatch is enabled: (a) a tight recency gate on the price the active path fills against (seconds-scale, §5 decision 5), and (b) a stall watchdog on the archiver that reconnects/alerts when ticks stop despite an open socket. *Verification:* simulated stale-price and stalled-feed both block xStock dispatch and raise an alert; fresh feed passes.

**A3 — #228 classify-site hardening + #230 fallback tagging + escalation-hook registration.** Triage the ~26 throwing `resolveAssetClass` sites for active-path reachability; convert the reachable ones to `safeResolveAssetClass` with explicit active-path skip semantics (a drop is a real signal-drop decision, homed here by design). Register the EXISTING escalation hook `setClassifyFallthroughHook` (`shared/asset-classes.ts:545-549`, fired at `:574`) to raise a **system-alert when active trading is ON** (the active-vs-passive cut `shared/` cannot make itself). #230: tag fallback-classified samples so they are excludable from clean training data. *Verification:* every reachable active-path classify site is safe+skip; the hook fires a system-alert on a synthetic active-mode fall-through and is silent in passive mode; fallback samples carry a distinguishing tag.

**A4 — RTB Phase-4 `asset_class SET NOT NULL` migration (zero-null gate).** Phase 1 (`ADD COLUMN ... NULL`) + Phase 3 (CHECK constraint + index) shipped; B4a ships the Phase-4 `ALTER COLUMN asset_class SET NOT NULL`. The write path defaults to `crypto_spot` + warns `[B79.0n.RTB][QUEUE_FALLBACK]` (`ready_to_buy_service.ts:1752`); the gate is zero null asset_class rows for 48h post-wire-in before the column flip. Migration: gitignored `*.sql` → `git add -f` + register in `drizzle/migrations/MANIFEST.txt` (rollback stays OUT). **Timing per §5 decision 6** (ship the migration file in B4a, apply SET NOT NULL after the soak). *Verification:* migration applies clean; zero-null soak confirmed before the flip.

**A5 — B3.2 active-path strategy gates.** The active strategy gate today is a HARDCODED 9-strategy list (`trading-engine.ts:57-67`) intersected with the code-SSOT `CANONICAL_REGIME_STRATEGY_MAP[assetClass][regime]` — there is NO DB-resolved per-class active gate (the VTS B3.1 equivalent). Build the DB-resolved per-class active-path strategy gate (config now, calibrate Phase 25). *Verification:* the active path resolves eligible strategies per `(assetClass, regime)` from DB with no hardcoded fallback (Kyle no-fallback rule); xStock-eligible set is config-correct.

**A6 — #153 0.50 pattern-pool-cap validation (HARD pre-flip gate #2).** Confirm + validate `module_constants.pattern_pool_gates.xstock_spot.pattern_max_position_pct = 0.50` (3.3× crypto's 0.15), read on the active sizing path at `paper-position-sizing.ts:163` (DB-resolved, fails hard if empty — good). Validate the 0.50 value against shadow evidence before the flip. *Verification:* the 0.50 value is evidence-justified or corrected; documented as a satisfied pre-flight gate.

**A7 — B11 contamination decision (DECIDE-AT-B4 per PHASE_19_PLAN §5).** No xStock entry-side halt/earnings guard exists, and no halt feed exists (that is B11/B13 net-new plumbing). The active-paper tables `paper_sim_trades` + `paper_sim_open_positions` have **NO `calibration_state` column** (F-NOW added it VTS-only). **Recommendation: TAG** — add `calibration_state` to the paper_sim tables mirroring the F-NOW pattern, so all pre-B11 xStock paper trades are excludable from Phase-25 calibration (§5 decision 4). *Verification:* paper_sim xStock trades carry the exclusion tag; aggregator can exclude them.

**(Deferred-activation note):** the canary log + EMA hooks + diagnostic counter are already built per-class — A1's wire-in makes them flow xStock-tagged. Verify they emit correct `xstock_spot` tags once xStock trades open (no new code expected).

---

## §4 — P19-B4b OBJECTIVES (paper fill fidelity + isolation)

**B1 — High-fidelity Kraken-vetted fill model.** Today the paper fill is a flat 5-bps haircut, atomic, always-full (`order-placer.ts:57-70`). The high-fidelity components ALREADY EXIST but are wired to a dead path: `slippage-fee-model.ts:91-125` walks the L2 book level-by-level, and a depth-10 feed exists via `market-data-coordinator.getLatestOrderBook()` — but the model is only called from the never-invoked `realtime-paper-executor.ts:119`, and the depth feed is on a SEPARATE WS that is lazily connected and gated off when trading is inactive (`feed-integrity-auto-check.ts:39-44`). Connect the depth-walked slippage + partial-fill realism into the `PaperOrderPlacer` (behind the existing `OrderPlacer` port + `FillResult` union), route every paper order through Kraken `validate=true` (already supported by `KrakenService.addOrder` params `kraken.ts:546` — zero client change), and **guarantee the depth feed is warm + fresh at paper turn-on** (else fills silently fall back to the conservative no-book table — a quiet fidelity loss). *Verification:* paper fills reflect depth-based impact + occasional partials + real tiered fees; `validate=true` round-trips against Kraken; depth-feed warmth is asserted before fills.

**B2 — Paper's own credential / rate-limit lane.** Today ~30 `KrakenService` instances share ONE credential pair (`kraken.ts:88-89`) with per-instance reactive cooldown only (no shared proactive limiter on the order path; the proactive `rate-control.ts` bucket is orphaned). Give paper's `validate=true` traffic its OWN credential + rate-limit lane so it can never throttle a real live order or trip its cooldown at the Phase-21 co-run; ideally a shared mode-partitioned proactive limiter in front of both order instances. *Verification:* paper validate traffic and live order traffic use distinct lanes; a paper burst cannot starve or cool-down the live order path; nonce coordination is collision-safe.

**B3 — Shared-singleton split-brain audit + per-mode isolation design (MUST pass before any Phase-21 co-run).** Enumerate and design per-mode isolation for every shared-state construct paper + live would both touch: the RTB singleton (`ready_to_buy_service` cooldown / dedup / portfolio-heat — the worst leak), the trading-mode global, `global.tradingEngines` (the dead live registry that already lies about paper liveness — #214), the **three globals that each answer "is paper running"** (`health-monitor.ts:444-470` / `context-refresh-coordinator.ts:197-201` / `state-awareness.ts:307-321` — #214 says consolidate to ONE truth source, target Phase-19 prep), TEC per-mode caches, and the KrakenService credential/rate sharing (B2). Deliver: a documented audit + a per-mode isolation design (and the consolidation of the "is paper running" readers). This is a design+audit deliverable that MUST pass before any Phase-21 live+paper co-run (distinct from + earlier than the Phase-21 strain re-eval). *Verification:* the audit enumerates every shared singleton with its mode-keying status; the isolation design has no split-brain path; the three liveness readers resolve to one source.

---

## §5 — DECISIONS NEEDED FROM LANGSTON (Step-1)

1. **Sub-batch split B4a/B4b + ordering** (§2) — approve, or re-cut?
2. **xStock dispatch seam** (A1): **(a)** add an xStock-side dispatch (sibling to `evaluateXstockPairForVTS`) that builds a `StrategySignal` with `metadata.assetClass='xstock_spot'` and calls into `buildSizedSignalForStrategy` — keeps xStock's own scanner/DBS/15m-bar/rotation/weekend cadence, no duplication; OR **(b)** teach the orchestrator's `evaluateMarket()` to also pull an xStock survivor pool — risks duplicating DBS/regime/bar logic and reconciling two cadences (orchestrator 30s self-timer vs xStock centralClock 30-tick). **CC recommends (a).** Confirm.
3. **#231 ablation integer-id**: the int-vs-UUID schema contradiction means there is no clean integer to wire. **CC recommends re-home** to the ablation-framework activation / Phase 20 (with a schema-reconciliation decision), keeping it baseline-suppressed (TS2345, no new (file,code) pair → CI green) rather than force a bad wire in B4 (rule-15). Confirm or direct.
4. **B11 contamination — tag vs halt-check** (A7): **CC recommends TAG** (add `calibration_state` to paper_sim tables, mirror F-NOW) since no halt feed exists. Confirm.
5. **Price-freshness gate threshold** (A2): propose a recency bound for active xStock fills. CC starting proposal: reject any active-path xStock price older than **~10–15s** for fills (vs the 30-min scanner ceiling), plus a stall watchdog that reconnects/alerts when no tick arrives for **~30s** on an open socket. Langston's call on the exact thresholds.
6. **RTB Phase-4 SET NOT NULL timing** (A4): ship the migration file in B4a, apply `SET NOT NULL` only after the 48h zero-null soak (post-wire-in), or stage differently?

---

## §6 — Blast-radius / architectural grounding (audit evidence)

- **xStock VTS-only terminus:** `eval-cycle.ts:831` (only dispatch; no SQE/RTB); scanner `scanner.ts:924-928` calls `evaluateXstockPairForVTS` only.
- **Orchestrator crypto-bound cycle:** `signal-orchestrator.ts:1199` (`DEFAULT_ASSET_CLASS='crypto_spot'`), `:1213` (FX5 pool), `:1245` (eligible = FX5). Per-signal pipeline `:399-404` already class-aware. ORB xStock branch `:1940` doubly dead (orb not in active enabled list).
- **Fill model:** flat slippage `order-placer.ts:57-70`; `SLIPPAGE_PERCENT=0.05%` (`paper-execution-engine.ts:135`). Depth-walk model orphaned `slippage-fee-model.ts:91-125`; depth-10 feed `market-data-coordinator.ts:136-138` (lazy, trading-gated). `validate=true` supported `kraken.ts:546`.
- **Fee model:** `getFrictionForAssetClass` `cost-model.ts:73-104`, per-class, NaN tombstones for un-dispatched classes; flat Tier-1 (no tier logic).
- **Rate/credential:** one credential `kraken.ts:88-89`; ~30 instances, per-instance reactive cooldown; `rate-control.ts` proactive bucket orphaned.
- **Split-brain:** `global.tradingEngines` dead live registry (#213 resolved the worst route; #214 the lying paper liveness); three "is paper running" globals (#214); RTB singleton cooldown/dedup/portfolio-heat.
- **Classify:** hook surface `shared/asset-classes.ts:545-549/574`; ~26 throwing sites confirmed (orchestrator 13).
- **Gates:** active strategy gate hardcoded `trading-engine.ts:57-67` + code-SSOT map; 0.50 cap DB-resolved `paper-position-sizing.ts:163`.
- **B11/tag:** no halt feed; paper_sim_* no `calibration_state`; F-NOW VTS-only (`2026-06-01-f-now-calibration-state.sql`).
- **RTB Phase-4:** `schema.ts:1885` nullable `asset_class`; Phase 1/3 migrations shipped + manifested.

**Doc gaps to fix at Step 10:** SIM cites `server/core/signal-orchestrator.ts` (actual `server/services/`); SIM:111/1842 stale on xStock WS staleness + the retired 90s gate; `setClassifyFallthroughHook` + the high-fidelity fill model + the rate lane have no SIM entries; the ablation int-vs-UUID contradiction is undocumented; SYSTEM_MANUAL §7 marks `slippage-fee-model.ts` "ACTIVE" (it is orphaned) + carries stale 0.26%/0.16% fee numbers; roadmap §3.2 lines 32/102 still say "Kraken paper order system" (rule-20 correction from P19-B2).

---

## §7 — Out of scope / homed

- **#231** ablation integer-id → re-home (§5 decision 3), pending Langston.
- **#232** netEV-floor threshold verify, **#233** driftScore/volZ real-source → **P19 pre-go-live (B7b gate)**, not B4.
- **#229** four symbol-form modules consolidation → Phase 20.
- Per-class slippage dispatch → Phase 25/26 (deferred decision, not B4).
- #221 cross-class rankingScore leveling wiring → Phase 19 (rides #142/SCORING.b) + Phase 25 calibration — confirm whether any wiring lands in B4 or stays its own batch.
- Phase-16 legacy register items surfaced incidentally → never delete in-flight; record per rule-18 (now: delete-on-spot-or-dated-deletion) as encountered.

---

## §8 — Verification gates (summary)

B4a: xStock RTB depth non-zero + zero drop-counter; freshness gate + stall watchdog block stale/stalled feed; classify sites safe+skip + hook alerts active-only; RTB Phase-4 migration clean + zero-null soak; active strategy gate DB-resolved no-fallback; 0.50 validated; paper_sim exclusion tag present. B4b: depth-walked + partial + tiered-fee + validate-vetted fills with depth-feed warmth asserted; paper rate lane isolated from live; split-brain audit enumerated + isolation design split-brain-free. Both: tsc baseline clean (no regressions above baseline), full suite green, CI all-4-green, staging deploy HTTP 200 + UI-verified (§9.3) where applicable.

---

*Step-1 deliverable. On Langston ACK → Step-2 pre-audit (deeper per-component SIM trace) → implementation per sub-batch.*
