# P19-B4 SCOPE — xStock active-path wire-in + high-fidelity paper fill + paper/live isolation

> **Phase 19 · Batch 4.** Status: **v2 — Langston Step-1 APPROVED-WITH-CONDITIONS (2026-06-14), conditions folded; proceeding to Step-2 pre-audit.** Author: Claude New (CC-B). Reviewer: Langston (Opus 4.8). Decider: Kyle (autonomous-iteration directive 2026-06-13). Drafted 2026-06-14.
>
> Grounded in a four-part read-only architectural audit (paper-fill fidelity · xStock wire-in · WS-fitness/classify/gates · shared-singleton split-brain). Every architectural claim carries `file.ts:line` evidence from direct code reads (CLAUDE.md §2.1.a). Repo is on a Google-Drive FUSE mount — `rg`/Glob time out; reads via `git grep` + targeted Read.
>
> **Langston Step-1 verdict (verbatim relayed to topic 21):** split + all six directional calls CONFIRMED; approved with conditions. Load-bearing claims re-verified by Langston against staging HEAD `d9b312780`. His spine note: *B4a's real spine is "no silent literal asset_class default anywhere on the xStock write path."* All conditions integrated below (§9 checklist).

---

## §0 — PREVIOUSLY-STATED-VS-NOW (§9.2)

- **#228 throwing-classify site count: PREVIOUSLY "~12." NOW: ~26 confirmed** (signal-orchestrator alone 13: 421/464/537/602/782/1038/1049/1083/1120/1425/1597/1941/2070). REASON: line drift + undercount; B4a opens with a reachability triage (B3b method).
- **19-1 "deferred-activation stubs": PREVIOUSLY inert stubs to write. NOW: canary, both EMA hooks, diagnostic counter ALREADY BUILT + per-class.** REASON: B79.0n built them; "activation" = the xStock path flowing through them, not new code.
- **#231 ablation integer-id: PREVIOUSLY "wire an integer signalId." NOW: blocked by a SCHEMA CONTRADICTION** — `regime_factor_alternates.signal_id` INTEGER (`schema.ts:562`) vs `trading_signals.id` varchar UUID (`schema.ts:667`). Langston re-verified. REASON: re-home, don't force a lossy cast (§5.3).
- **Paper "tiered fee model": PREVIOUSLY a volume-tier schedule. NOW: a single flat Tier-1 value** (taker 0.008 / maker 0.004). REASON: clarity for the fill design; B1 is taker-only (§5 gap 5).

---

## §1 — Objective & context

Phase 19 turns Paper Mode Active Trading back ON. Batch 4 is the **xStock wire-in (merged 19-1 + 19-7 / #92)** plus the **P19-B2 paper-execution-target work** (high-fidelity Kraken-vetted fill + paper/live isolation). Today crypto (FX5) flows through the active pipeline (scanner → orchestrator → SQE → RTB → TEC → paper-execution-engine); **xStock does NOT** — the xStock scanner terminates in VTS only (`eval-cycle.ts:831` `registerOpenVtsTrade`, never RTB), and the orchestrator cycle is hard-bound to the crypto FX5 pool (`signal-orchestrator.ts:1199/1213/1245`). B4 connects xStock end-to-end so paper trades can open AND close on xStock, AND upgrades the paper fill from a flat 5-bps haircut to a depth-walked, partial-fill-capable, venue-vetted fill so paper EV ≈ live EV.

**This batch does NOT turn active trading on** — that is the B7b flip, gated on the §6 pre-flight checklist. B4 makes the xStock active path *exist + be sound* and the paper fill *honest*. (§9.1 scaffolding declaration carried into the completion report.)

---

## §2 — SUB-BATCH STRUCTURE (Langston APPROVED)

- **P19-B4a — xStock active-path wire-in (+ feed-safety gate).** Connect xStock to the active pipeline, with the price-freshness + equity-session safety gate as a HARD precondition, the **resolver-backed RTB asset_class write (the spine — A1.5)**, classify-site hardening + escalation hook, the RTB Phase-4 migration, B3.2 active strategy gates, the #153 0.50-cap validation, and the B11 contamination tag. **B4a is isolation-aware:** it introduces NO xStock-specific shared-singleton state (RTB cooldown/dedup/portfolio-heat) that B4b would then have to retrofit-isolate; the formal per-mode isolation design is B4b's B3 (Langston gap 3).
- **P19-B4b — Paper execution fidelity + paper/live isolation.** The high-fidelity fill (depth-walked slippage + partial fills + `validate=true`, **taker-only**), paper's own credential/rate-limit lane, and the shared-singleton split-brain audit + per-mode isolation design.

**Ordering (Langston-confirmed):** B4a first — B4b's split-brain audit enumerates *real* shared-state touches once xStock is on the path, not hypothetical ones. No flip in B4, no co-run until Phase 21.

---

## §3 — P19-B4a OBJECTIVES

**A1 — xStock scanner → active dispatch seam (option a).** Add an xStock-side dispatch (sibling to `evaluateXstockPairForVTS`) that builds a `StrategySignal` with `metadata.assetClass='xstock_spot'` at construction and calls the orchestrator per-signal entry `buildSizedSignalForStrategy` (`signal-orchestrator.ts:399-404`, already class-aware: sizing `:464`, SQE `:601-602`). Keeps xStock's centralClock cadence; no orchestrator-cycle duplication. *Verification:* an xStock signal reaches `queueSQESignal` with `assetClass='xstock_spot'`; xStock RTB depth goes non-zero (`getQueueDepth()` `:1369`); B3b drop-counter stays zero for xStock.

**A1.5 — Resolver-backed RTB asset_class write (THE SPINE — Langston gap 1, rule-10 no-silent-fallback).** Today the RTB row write is `rawSignal.metadata?.assetClass || DEFAULT_ASSET_CLASS` (`signal-orchestrator.ts:693`; same default pattern `ready_to_buy_service.ts:1752/1802`) — a missing metadata field silently writes `crypto_spot` onto an xStock row. **Confirm in Step-2 which site actually persists the row (orchestrator :693 vs RTB service :1752), then make THAT write resolver-backed (`resolveAssetClass(symbol)`, deterministic) or assert-non-null before `queueSQESignal`.** No literal `crypto_spot` default on that write — there is no justification for one when the symbol determines the class. This single fix is what makes A1 (seam), A4 (NOT NULL), and decision 6 actually sound. *Verification:* a signal with stripped metadata still writes the correct asset_class (resolved from symbol); no path writes a literal default.

**A2 — Price-freshness + equity-session gate + silent-stall watchdog (HARD safety gate — audit-4 top risk + Langston decision-5).** The xStock active path reads ticker prices from DB rows fresh only to within **30 minutes** (`scanner.ts:637`); the prior 90s freshness gate was RETIRED (`scanner.ts:557-561`); the WS archiver has **no silent-stall watchdog** (open-but-quiet socket does not reconnect; `equity-spot-archiver.ts:223-225` error handler only logs). Before any xStock active dispatch: (a) **measure the depth-10 xStock inter-tick interval distribution during ARCA hours first**, then set fill-max-age = `max(15s, p99 + margin)` (don't guess — same discipline as A6); (b) a stall watchdog on the archiver that reconnects/alerts when ticks stop despite an open socket, set clearly ABOVE the fill gate so they don't fight; (c) **equity-session gating — hard-block active xStock fills outside ARCA hours regardless of tick age** (a fresh token tick at 03:00 UTC is not a tradeable equity price). *Verification:* stale-price, stalled-feed, AND out-of-session each block xStock dispatch + alert; fresh in-session price passes; threshold justified by the measured inter-tick distribution.

**A3 — #228 classify-site hardening + #230 fallback tagging + escalation-hook registration.** Triage the ~26 throwing `resolveAssetClass` sites for active-path reachability; convert reachable ones to `safeResolveAssetClass` with explicit active-path skip semantics. Register the EXISTING hook `setClassifyFallthroughHook` (`shared/asset-classes.ts:545-549`, fired `:574`) to raise a **system-alert when active trading is ON** (active-vs-passive cut). #230: tag fallback-classified samples so they are excludable from clean training data. *Verification:* reachable active-path sites safe+skip; hook fires a system-alert on a synthetic active-mode fall-through, silent in passive; fallback samples tagged.

**A4 — RTB Phase-4 `asset_class SET NOT NULL` migration (zero-null gate — Langston decision-6 ordering).** Phase 1 (`ADD COLUMN NULL`) + Phase 3 (CHECK + index) shipped; B4a ships Phase-4 `ALTER COLUMN asset_class SET NOT NULL`. **Ordering (mandatory): resolver-backed write (A1.5) → 48h soak with a REAL generator → SET NOT NULL.** The flip must land AFTER A1.5 — otherwise NOT NULL passes on a silently-wrong `crypto_spot`-on-xStock row (corrupts, worse than null). **Define the soak generator:** B4 does not flip active trading, so specify what exercises the write during the window (VTS/passive writes to the same column, or a shadow dispatch writing asset_class without executing) — else "zero null for 48h" is vacuously true. Migration: gitignored `*.sql` → `git add -f` + `drizzle/migrations/MANIFEST.txt` (rollback OUT). *Verification:* migration clean; generator confirmed writing real per-class rows; zero-null soak real before the flip.

**A5 — B3.2 active-path strategy gates (DB-resolved, fail-hard; Langston gap 2 legacy disposition).** Active strategy gate today = HARDCODED 9-strategy list (`trading-engine.ts:57-67`) intersected with code-SSOT `CANONICAL_REGIME_STRATEGY_MAP[assetClass][regime]`; NO DB-resolved per-class active gate. Build the DB-resolved per-class active gate (config now, calibrate Phase 25), **failing hard on empty resolve (no fallback to the hardcoded list — Kyle no-fallback rule).** **Dispose the hardcoded 9-list at surfacing (rule-15/18):** delete-on-spot via the workflow with caller-tracing, or a dated deletion in `DELETED_COMPONENTS_LOG.md` — NOT left stubbed beside the new DB path. *Verification:* active path resolves eligible strategies per `(assetClass, regime)` from DB, fails hard if empty; old hardcoded list disposed (logged); xStock-eligible set config-correct.

**A6 — #153 0.50 pattern-pool-cap validation (HARD pre-flip gate #2).** `module_constants.pattern_pool_gates.xstock_spot.pattern_max_position_pct = 0.50` (3.3× crypto's 0.15), read on the active sizing path `paper-position-sizing.ts:163` (DB-resolved, fails hard if empty — good). Validate 0.50 against shadow evidence before the flip. *Verification:* 0.50 evidence-justified or corrected; documented as a satisfied pre-flight gate.

**A7 — B11 contamination → TAG (Langston decision-4 + default/backfill condition).** No xStock entry-side halt/earnings guard exists, and no halt feed exists (B11/B13 net-new). The active-paper tables `paper_sim_trades` + `paper_sim_open_positions` have NO `calibration_state` column (F-NOW added it VTS-only). Add `calibration_state` to both paper_sim tables mirroring F-NOW (default `pre_calibration_xstock_2026_05`) — **including a default + backfill so existing crypto paper_sim rows aren't left null** (don't strand a future NOT-NULL). *Verification:* paper_sim rows carry the tag (existing rows backfilled); aggregator can exclude pre-B11 xStock trades.

**(Deferred-activation note):** canary + EMA hooks + diagnostic counter are already built per-class — A1's wire-in makes them flow xStock-tagged; verify correct `xstock_spot` tags once xStock trades open (no new code expected).

---

## §4 — P19-B4b OBJECTIVES (paper fill fidelity + isolation)

**B1 — High-fidelity Kraken-vetted fill (TAKER-ONLY — Langston gap 5).** Today's fill is a flat 5-bps haircut, atomic, always-full (`order-placer.ts:57-70`). The high-fidelity parts EXIST but are wired to a dead path: `slippage-fee-model.ts:91-125` walks the L2 book; a depth-10 feed exists via `market-data-coordinator.getLatestOrderBook()` — but the model is only called from the never-invoked `realtime-paper-executor.ts:119`, and the depth feed is a SEPARATE lazily-connected WS gated off when trading is inactive (`feed-integrity-auto-check.ts:39-44`). Connect depth-walked slippage + partial-fill realism into `PaperOrderPlacer` (behind the existing `OrderPlacer` port + `FillResult` union), route every paper order through Kraken `validate=true` (supported by `KrakenService.addOrder` params `kraken.ts:546`, zero client change), and **guarantee the depth feed is warm + fresh at paper turn-on** (else fills silently fall back to the conservative no-book table — a quiet fidelity loss). The model is **taker-only** (marketable paper orders) — the resolved-but-unconsumed maker fee is NOT a wired path. *Verification:* paper fills reflect depth-based impact + occasional partials + real tiered taker fees; `validate=true` round-trips; depth-feed warmth asserted before fills.

**B2 — Paper's own credential / rate-limit lane.** ~30 `KrakenService` instances share ONE credential pair (`kraken.ts:88-89`) with per-instance reactive cooldown only (proactive `rate-control.ts` bucket orphaned). Give paper `validate=true` traffic its OWN credential + rate-limit lane so it can never throttle a live order or trip its cooldown at the Phase-21 co-run; ideally a shared mode-partitioned proactive limiter in front of both order instances. *Verification:* paper validate traffic and live order traffic use distinct lanes; a paper burst cannot starve/cooldown the live path; nonce coordination collision-safe.

**B3 — Shared-singleton split-brain audit + per-mode isolation design (MUST pass before any Phase-21 co-run).** Enumerate + design per-mode isolation for every shared-state construct paper + live both touch: the RTB singleton (`ready_to_buy_service` cooldown/dedup/portfolio-heat — worst leak), the trading-mode global, `global.tradingEngines` (dead live registry that lies about paper liveness — #214), the **three globals that each answer "is paper running"** (`health-monitor.ts:444-470` / `context-refresh-coordinator.ts:197-201` / `state-awareness.ts:307-321` — #214: consolidate to ONE truth source), TEC per-mode caches, KrakenService credential/rate sharing (B2). Deliver a documented audit + per-mode isolation design (and the liveness-reader consolidation). *Verification:* audit enumerates every shared singleton with mode-keying status; isolation design has no split-brain path; the three liveness readers resolve to one source.

---

## §5 — DECISIONS (Langston-confirmed, conditions folded)

1. **Sub-batch split B4a/B4b + ordering — APPROVED.** Carry-condition → A1.5 + gap-3 isolation-aware B4a (folded §2/§3).
2. **xStock dispatch seam — (a) CONFIRMED.** Condition: correctness must NOT depend on metadata surviving to the RTB write → **A1.5 resolver-backed write** (folded).
3. **#231 ablation integer-id — RE-HOME CONFIRMED.** Condition (rule §13/§9.4): log the int-vs-UUID contradiction in RUNNING_ISSUES NOW + write #231 into the Phase-20 plan as a NUMBERED item with "schema-reconciliation decision required" as the stated blocker. Keep baseline-suppressed (TS2345, no new (file,code) pair → CI green). **Action item: §7 + done in governance.**
4. **B11 contamination — TAG CONFIRMED.** Condition: mirror F-NOW default + backfill (no stranded nulls) → A7 (folded).
5. **Freshness gate — directional 15s fill / 30s stall ENDORSED, set from evidence.** Conditions: measure ARCA-hours inter-tick distribution first; fill-max-age = max(15s, p99+margin); stall-watchdog above fill gate; **add equity-session gating** → A2 (folded).
6. **RTB Phase-4 SET NOT NULL — STAGED APPROVED.** Conditions: define a real soak generator; order **resolver-backed write (A1.5) → soak → SET NOT NULL** → A4 (folded).

---

## §6 — Blast-radius / architectural grounding (audit evidence)

- **xStock VTS-only terminus:** `eval-cycle.ts:831`; scanner `scanner.ts:924-928` (`evaluateXstockPairForVTS` only).
- **Orchestrator crypto-bound cycle:** `signal-orchestrator.ts:1199/1213/1245`. Per-signal pipeline `:399-404` class-aware; **RTB write `:693` metadata-OR-literal-default (the A1.5 hinge).** ORB xStock branch `:1940` doubly dead.
- **Fill model:** flat slippage `order-placer.ts:57-70`; depth-walk orphaned `slippage-fee-model.ts:91-125`; depth-10 feed `market-data-coordinator.ts:136-138` (lazy, trading-gated); `validate=true` `kraken.ts:546`.
- **Fee model:** `getFrictionForAssetClass` `cost-model.ts:73-104`, per-class, NaN tombstones; flat Tier-1.
- **Rate/credential:** one credential `kraken.ts:88-89`; ~30 instances, per-instance reactive cooldown; `rate-control.ts` orphaned.
- **Split-brain:** `global.tradingEngines` dead registry (#213 resolved worst route; #214 lying paper liveness); three "is paper running" globals (#214); RTB singleton cooldown/dedup/portfolio-heat.
- **Classify:** hook `shared/asset-classes.ts:545-549/574`; ~26 throwing sites (orchestrator 13).
- **Gates:** active strategy gate hardcoded `trading-engine.ts:57-67` + code-SSOT map; 0.50 cap DB-resolved `paper-position-sizing.ts:163`.
- **B11/tag:** no halt feed; paper_sim_* no `calibration_state`; F-NOW VTS-only.
- **RTB Phase-4:** `schema.ts:1885` nullable `asset_class`; Phase 1/3 migrations shipped + manifested.
- **#231:** `schema.ts:562` integer `signal_id` vs `:667` UUID `trading_signals.id`.

**Doc gaps to fix at Step 10:** SIM cites `server/core/signal-orchestrator.ts` (actual `server/services/`); SIM:111/1842 stale on xStock WS staleness + the retired 90s gate; `setClassifyFallthroughHook` + high-fidelity fill + rate lane have no SIM entries; ablation int-vs-UUID contradiction undocumented; SYSTEM_MANUAL §7 marks `slippage-fee-model.ts` "ACTIVE" (orphaned) + stale 0.26/0.16 fees; roadmap §3.2 lines 32/102 still say "Kraken paper order system" (rule-20 correction from P19-B2).

---

## §7 — Out of scope / homed (with concrete homes — §9.4)

- **#231** ablation integer-id → **re-home Phase 20** as a numbered item ("schema-reconciliation decision required: integer `signal_id` FK vs UUID `trading_signals.id`"); the int-vs-UUID contradiction logged in RUNNING_ISSUES now. Baseline-suppressed meanwhile.
- **#232** netEV-floor threshold verify, **#233** driftScore/volZ real-source → **P19 pre-go-live (B7b gate)**, not B4.
- **#229** four symbol-form modules consolidation → Phase 20.
- **#221** cross-class rankingScore leveling → **REACHABILITY CHECK IS A STEP-2 GATE (Langston gap 4):** if the RTB queue does a cross-class comparative sort today, un-leveled xStock mis-ranks against crypto and leveling becomes a **B4a** concern (not deferrable); if per-class or FIFO-within-class, deferral to #142/Phase-25 is safe. Confirm in Step-2 pre-audit before committing the deferral.
- Per-class slippage dispatch → Phase 25/26 (deferred decision).
- Phase-16 legacy register items surfaced incidentally → never leave lingering (rule-18: delete-on-spot or dated deletion) as encountered.

---

## §8 — Verification gates (summary)

B4a: xStock RTB depth non-zero + zero drop-counter; **resolver-backed asset_class write (no literal default)**; freshness + stall + equity-session gates block stale/stalled/out-of-session; classify sites safe+skip + hook alerts active-only; RTB Phase-4 migration clean + real-generator zero-null soak BEFORE the NOT-NULL flip; active strategy gate DB-resolved fail-hard + old list disposed; 0.50 validated; paper_sim exclusion tag present + backfilled. B4b: depth-walked + partial + tiered-taker-fee + validate-vetted fills with depth-feed warmth asserted; paper rate lane isolated from live; split-brain audit enumerated + isolation design split-brain-free + 3 liveness readers consolidated. Both: tsc baseline clean, full suite green, CI all-4-green, staging deploy HTTP 200 + UI-verified (§9.3) where applicable.

---

## §9 — LANGSTON STEP-1 CONDITIONS CHECKLIST (must all be satisfied by close)

1. ☐ **A1.5 resolver-backed RTB asset_class write** — confirm the writing site (Step 2), no literal `crypto_spot` default on the xStock path.
2. ☐ **#231** int-vs-UUID contradiction logged in RUNNING_ISSUES + #231 written as a numbered Phase-20 item (do in governance).
3. ☐ **A7** `calibration_state` mirrors F-NOW default + backfill (no stranded nulls).
4. ☐ **A2** ARCA-hours inter-tick distribution measured → threshold = max(15s, p99+margin); stall-watchdog above fill gate; **equity-session gating** added.
5. ☐ **A4** real soak generator defined; order resolver-backed write → soak → SET NOT NULL.
6. ☐ **A5** DB gate fails hard on empty; hardcoded 9-list disposed (logged), not stubbed.
7. ☐ **B4a isolation-aware** — no new xStock-specific shared-singleton state for B4b to retrofit.
8. ☐ **#221 reachability** answered in Step-2 pre-audit before the deferral is committed.
9. ☐ **B1** stated taker-only.

---

*Step-1 CLOSED (approved-with-conditions). Next: Step-2 pre-audit (deeper per-component SIM trace + the #221/gap-4 reachability answer + confirm the RTB-write site for A1.5).*
