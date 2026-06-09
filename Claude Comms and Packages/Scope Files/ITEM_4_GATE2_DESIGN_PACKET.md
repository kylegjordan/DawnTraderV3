# ITEM 4 — GATE-2 DESIGN PACKET (the one document Kyle reads to approve)

> Between-plan **item 4: separate VTS / paper / live into independent standalone systems.** Gate 1 (scope) approved 2026-06-09. This packet closes **Phase A (design)**. **Kyle approving this packet = Gate 2 → Phase B (build) begins. Nothing is built until then.**
>
> Assembled 2026-06-09. Status: **READY FOR KYLE.** Backing docs (all committed, all CC+Langston-reviewed):
> `ITEM_4_SYSTEM_SEPARATION_SCOPE.md` (the approved scope + Kyle corrections §1.6) · `ITEM_4_ARCHITECTURE_INVESTIGATION.md` (the verified architecture) · `ITEM_4_PHASE_A_PREAUDIT.md` (the mode-touch audit: pair-traces T1/T2/T3 + sweep + merged map A1.U) · `ITEM_4_STORAGE_AND_LEARNING_DESIGN.md` (storage + labeled learning, joint-converged B.7/B.8) · `ITEM_4_THROUGHPUT_STUDY_METHODOLOGY.md` (the study design).

---

## §1 — PLAIN LANGUAGE: WHAT THIS DESIGN DOES (the Kyle read)

**Today** one switch decides which single system runs — and turning on active trading kills the VTS. **After this build:** the VTS runs always, on its own, no matter what; paper mode has its own on/off switch; live mode has its own separate on/off switch (and stays off until Phase 21 — when it's on, it places real orders, period); none of the three affects the others.

**The mode tag (your design):** every pair gets stamped with its system-of-origin at the moment it enters a pipeline, and the tag rides with it through every stage to final storage. No part of the system ever has to ask "what mode are we in?" — the answer travels with the data. The audit proved this is mostly already true in the paper pipeline; the simulator needs its stamp built (we found the exact spot); and exactly two endpoints drop the tag today (the learning memory and the storage writers) — those are the two repairs.

**Learning (your framing, jointly designed with Langston):** the system learns from BOTH worlds, labeled, never mixed. The simulator teaches how all signals in a regime family trade and whether pairs are being classified into the right regime. Paper teaches how well the real filtered, selective system actually performs on wins and losses. Each result is stored with its source label, what stage of selection it came from, and which calibration generation produced it — so learning can never blend two different worlds by accident, and a calibration change never muddies old data with new.

**Shared services (MCE, the scanners, pattern detection, strategy math, TEC):** computed once per pair per cycle, results handed read-only to every system. No duplicate computing, no copies that can drift.

**Storage:** one set of books per system, strictly separated; the shared scan data stored once for all. The throughput study then measures — not guesses — whether the current server carries the simulator and paper running together, and sizes any upgrade from real numbers.

## §2 — THE TWO DECISIONS YOU'RE MAKING AT THIS GATE

1. **How learning reads across the two worlds (recommendation: same-world).** Everything is captured and labeled regardless. The choice: when the system rates a brand-new signal, does it lean only on results from that same world? **We jointly recommend YES — same-world reads as the durable answer**, because blending toward the simulator's broader average would systematically penalize the real pipeline (the simulator's average includes every trade the real filter would have rejected). The "smart blend" is parked as a conditional research item — it only ever becomes valid if a specific bridge is built AND a statistical agreement test passes. We'll also store a slightly richer per-strategy result record now (count/mean/spread) so learning resets cleanly at calibration changes and nothing needs re-migrating later — a flagged, deliberate change to how the existing confidence nudge accumulates, not a silent swap.
2. **Retention (low stakes, default = no change):** keep paper's realistic record "hot" longer than the simulator's firehose? Default keeps today's uniform policy; the knob exists per-system if we ever want it.

**FYI (flagged, not decided now):** the same simulator-vs-paper question exists one level up in the scoring-weights layer (it's simulator-locked today; paper outcomes never reach it). A Phase-19+ decision — recorded so it can't ride silently.

## §3 — THE DESIGN, PER SCOPE OBJECTIVE (technical summary; details in backing docs)

- **O1 VTS standalone:** remove the 3 `tradingActive` kill-guards (`vts-runner.ts:3108/:3909/:3941`) + add a lifecycle guard; in-process decouple suffices now (separate process = a Phase-19 option, decided by the throughput study's event-loop-lag result). **The principle behind the guard removal (Kyle, 2026-06-09): the emergency kill-switch is a LIVE-ONLY construct** — the existing loss-% guardrail that halts live trading and waits for the user to hit start. It never halts VTS, and paper gets no kill-switch either — **VTS and paper are start/stop only** (paper's start/stop behavior itself is Phase-19 scope). **Verify:** VTS cadence holds within tolerance ACROSS a paper start/stop transient (quantitative, not merely non-zero).
- **O2 switch cleave:** per-mode flags already exist (`isEngineActivePaper`/`Live`); retire the `getCurrentMode()` collapse from all producer paths (it survives only as any-active display semantics); independent per-system controls in the control plane + UI. Off-pipeline mode-readers dispositioned per the merged map (A1.U): request-scoped keep / producer-scoped→carried-tag / global→any-active.
- **O3 paper + live independence:** paper independently startable (full debug = Phase 19). Live = independent switch ONLY, cleaved from paper; `globalLiveEngine.start()` asserted NEVER invoked in item 4; no scaffold (live trades real or not at all — Kyle). Dead constructs (`globalPaperEngine` branch, orphaned sim files) quarantine-flagged; `global.tradingEngines` second registry → Phase 16/21 (carved out).
- **O4 storage-for-3 + D1:** mode stamped at pipeline entry, carried on the payload, persisted from the carried tag. VTS entry-stamp at `vts-runner.ts:3129`; the 3 B70 archivers take required `mode` from the caller (delete the `getCurrentMode()` import); 5 hardcoded VTS literals re-pointed to the tag. Pair-scan tier = producer-agnostic shared substrate (once-for-all; mode column decision: shared/null vs stamp — resolved in Phase B detail design). Partition reserves `live` for Phase 21.
- **O5 compute-once fan-out:** MCE/pattern/strategy/TEC computed once per (symbol, cycle), published frozen (R-I/R-J). Per-producer state strictly per-producer.
- **D9 labeled learning (the joint design):** ONE physical store, key `(source, assetClass, regime, strategy)` — `source` REQUIRED, no default (compiler forces every call site); `selection_stage` derived from source; `would_admit` an entry FIELD on VTS rows (Phase-B build: replay SQE's threshold against the persisted finalScore); per-source `calibration_epoch` MINTED (no existing ledger — its own Phase-B mini-design; bumps on calibration-affecting changes, not wall clock); Welford `(count, mean, M2)` stored per partition. Read policy per §2 decision 1. House rule: every future outcome-fed store is born source-partitioned. Census: 1 live contaminator (fixed by this), 1 clean slate protected (future friction priors), 2 dormant traps labeled (predictive-weights VTS-lock = flagged Phase-19+ blind spot; adaptive-manager guarded).
- **O6 throughput study:** baseline VTS-only → measure VTS+paper (the real pre-21 pair) → PROJECT live's increment (no fake-live). Ratio thresholds ratified off the measured baseline. Hard gates: zero cross-stamped rows, single-writer-per-partition, exactly 1 MCE compute/(symbol,cycle). Producers driven through their REAL selection→queue→storage paths (the false-headroom hazard). Output: a measured capacity recommendation (Hetzner resize / Supabase bump, on demand).

## §4 — PHASE B BUILD PLAN (after Gate 2; each step its own reviewed sub-batch as needed)
1. VTS decouple (O1) + entry-stamp + verify standalone across paper start/stop. **Step-1 verify is NOT blocked on steps 3-4:** the transient is induced via the EXISTING start/stop control (`startPaperSimulation` / the current mode-param start route + `isEngineActivePaper`), which can start and stop a paper engine today — the new independent switches (step 3) are not required to flip the flag VTS's guards key on.
2. D1 + D9 contamination fixes (the two terminal writes) + the learning substrate (partitioned key, Welford, labels) + calibration-epoch mini-design.
3. Switch cleave / independent per-system controls (O2) + off-pipeline disposition list applied.
4. Paper + live standalone scaffolding (O3) — paper startable; live switch-only + never-start assertion.
5. Storage-for-3 finalization (O4) incl. pair-scan tier decision + per-source retention knobs.
6. Run the throughput study (O6) → capacity recommendation.
Then: item 4.5 (Kraken tiered fees) → 4.7 (per-class regime) → 5 (AMR) → **Phase 19**.

## §5 — WHAT THIS ITEM DOES *NOT* DO (boundary, unchanged from the approved scope)
No paper-mode debugging (Phase 19). No live engine build or reconciliation of the two live-engine models (Phase 21/16). No deletion of dead constructs (Phase 16). Active trading stays OFF throughout; "independent" is verified structurally. 🚨 **This item does NOT make paper or live trade. Paper trading-readiness = Phase 19; live = Phase 21.**

## §6 — PARKED, NOT DECIDED (the consolidated register — what Kyle is NOT approving at this gate)
One list of every deferred item this design touches, so nothing rides silently:
1. **The "smart blend" learning read** (simulator prior → paper update) — **conditional research item**, NOT scheduled. Only ever valid if the `would_admit` bridge is built AND a per-tuple distribution-agreement test passes. (§2 decision 1.)
2. **The scoring-weights blind spot** — predictive weights are simulator-locked today; paper outcomes never reach them. **Phase-19+ decision**, flagged so it can't ride silently. (§2 FYI.)
3. **Per-source retention divergence** — knob exists per-system; default stays uniform until there's reason. (§2 decision 2.)
4. **Separate VTS process** — in-process decouple now; the throughput study's event-loop-lag result decides whether Phase 19 pulls the separate process forward. (§3 O1.)
5. **Paper's start/stop behavior + full debug** — Phase 19. **Live's real engine build + reconciling the two live-engine models** — Phase 21 (with Phase-16 dead-construct cleanup). (§5.)
6. **Pair-scan tier mode column** (shared/null vs stamp on the producer-agnostic scan rows) — resolved in Phase-B detail design, not at this gate. (§3 O4.)
7. **Dormant-trap removals** — `adaptive-manager` (guarded, not removed) + the dead engine constructs (quarantine-flagged) — Phase 16. (§3 D9/O3.)
