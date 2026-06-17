# P19-B6.5b — Step-2 PRE-AUDIT (crypto active-pipeline resurrection)

> **Batch:** P19-B6.5b · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-17 · **Issue:** #235 (carry-ins #320, #321)
> Companion to `P19_B6_5_AUDIT.md` (the Obj-1 per-hop findings + empirical probes + repair-scope proposal). This doc = SIM/System-Manual consultation + per-fix blast radius + the Langston Step-2 questions. Scope already Langston-ACKed at Step-1 (Rev-2, Option C + split).

---

## §1 SIM + System Manual consultation (mandatory, Kyle directive)

**SIM — `SYSTEM_IMPACT_MAP.md` Cross-Cutting Runtime State registry (read top section):**
- §"Per-asset-class active gate (P19-B6.5a)" (SIM:102-103) **already documents both B6.5b carry-ins**: "RTB (`ready_to_buy_service.ts:593/792`) is entry-gate-protected … **defense-in-depth deferred to B6.5b (#320)**"; and the **Known edge (#321)**: "`witnessAssetClassEmissionWhileInactive` … currently uncalled → wire/delete in B6.5b" + "`fx5-scanner` reads only the resolved active mode's context … live+paper-both-ON would consult only the live-resolved context." My audit findings align exactly — F1/F2 close these named gaps.
- **Liveness model (SIM:89-100):** the DB flag `system_context.isEngineActive` is the per-mode SSOT (5 readers). The B6.5a per-class gate is the SECOND axis on top. F1 makes the crypto gate propagate to the pool layer so the per-class axis is enforced at the same chokepoints as the master axis. `LIVENESS_SPLIT` witness (H2 reconcile, `getLivenessSplitStats`) + `getAssetClassGateStats` are my dry-run isolation witnesses.
- **S-singletons:** F1 touches `activeFilterPool` (S9, PER-MODE-SAFE — already mode-keyed, `active-filter-pool.ts:59`) and the fx5 scan path. F3 (cooldown) touches `trade-safety.ts` (reader of S1/S4) — read-path only, no singleton re-keying. **No new shared singleton introduced** by any fix → no SIM registry-row addition required (F1/F2/F3 are logic gates + a read re-point, not new cross-cutting state). The witness counter wired by F2 already exists (B6.5a).

**System Manual — signal-pipeline + execution chapters:**
- The canonical active chain (Layer 3 Scanning → Layer 4 Signal Gen/Qualification → Layer 6 Execution) matches the chain I traced. F1 lives in Layer 3 (scanner pool population) + Layer 4 (RTB admission); F3 in Layer 6 (cooldown guard); V1 in Layer 6 (TEC exit). The System Manual's "one-best-signal-per-cycle" orchestrator description holds — crypto pipe is per-mode + crypto-only (no multi-asset starvation), confirmed against `signal-orchestrator.ts:1283-1357`.
- **System Manual content update applicability:** F1 changes the per-class active-gate ENFORCEMENT surface (architecture of the gate) → System-Manual-scope (the gate-logic note added in B6.5a needs the "now enforced at pool + RTB chokepoint" refinement). F3/V1 are bug-fixes to existing documented behavior → SIM-scope (component note), light System-Manual touch. Both docs get a content update at close (not just a reorg) per §9 anti-pattern.

---

## §2 Per-fix blast radius

| Fix | Files | Upstream | Downstream | Blast | Risk |
|---|---|---|---|---|---|
| **F1** #320 gate propagation | `fx5-scanner.ts` (scanMode pool-population gate), `ready_to_buy_service.ts` (queueSQESignal + re-eval defense-in-depth), `trading-state-sync.ts` (reuse `isAssetClassActiveInContext`) | SystemContext (already fetched in scanMode as `earlyContext`) | active filter pool population; RTB admission | **MEDIUM** | crypto-ON dry-run unaffected (crypto is ON); fix only changes crypto-OFF behavior to correctly clear pool. Defense-in-depth must NOT reject a legitimately-active class — guard reads the SAME `isAssetClassActiveInContext` the entry gate uses. |
| **F2** #321 witness | `ready_to_buy_service.ts` (call site) | — | `recordLivenessSplit` counter (observable) | **LOW** | observability only; no behavior change beyond the F1 reject it annotates |
| **F3** cooldown re-point | `trade-safety.ts` (`checkSymbolCooldown` paper branch) | `getPaperSimTradesBySymbol` (exists, `storage.ts:3267`) | per-symbol re-entry guard | **LOW** | paper-mode read-path only; live path (`trades` table) untouched. Brings cooldown into line with daily-loss's already-correct paper-table read. |
| **F4** isolation test | `server/tests/unit/*.test.ts` (new) | — | — | **LOW** | test-only |
| **V1** ATR floor (conditional) | `tec-evaluator.ts` (only if dry-run reproduces) | — | exit decision | **LOW-MED** | surgical fall-through; gated on dry-run evidence |

**No migration. No DB seeding (§3 of the audit doc confirmed crypto_spot fully seeded). No `kraken.ts` edit (locked).**

---

## §3 Repair-scope boundary (Scope Q2) — CC proposal

Per the Step-1 Q2 ruling ("break-fix blocking a crypto lifecycle = in-batch; calibration/tuning defers"):
- **IN:** F1, F2, F3, F4 (and V1 iff the dry-run reproduces the ATR hole). These are break-fixes / proof infrastructure — they let a crypto trade complete the lifecycle correctly AND make the per-class gate actually isolate (the #320 carry-in mandate).
- **HOMED (not in-batch):** collision-set re-audit (H-a), xStock default-stamp (H-b), dead-code disposition (H-c). All get a concrete home in this batch's governance per §9.4.

---

## §4 LANGSTON STEP-2 QUESTIONS

- **Q1 — Repair scope.** Agree F1-F4 in-batch (+ V1 conditional)? Anything you'd pull in or push out?
- **Q2 — #320 enforcement shape.** I propose BOTH (a) structural: propagate the crypto per-class flag into `scanMode`'s pool-population gate so crypto-OFF clears the active pool (mirrors the robust xStock active-dispatch gate), AND (b) defense-in-depth: a per-class reject at the single RTB chokepoint `queueSQESignal` (+ the re-eval paths that explicitly defer to B6.5b), wiring the #321 witness there. Is the belt-and-suspenders right, or do you want only the structural fix (with the witness as the tripwire)? My lean: both — the audit found a real bypass, and defense-in-depth at the chokepoint is the durable B7b/Phase-21 guarantee.
- **Q3 — collision-set (H-a).** Fold the validated crypto-side tickers (ADI/STRK/STX confirmed crypto; A/BSX/CAT/ES/IR/WELL/WEN need per-ticker validation) into `XSTOCK_SPOT_KRAKEN_COLLISIONS` IN B6.5b, or HOME it as a focused re-audit follow-up? CC lean: HOME (per-ticker validation + the standing quarterly rule deserve a dedicated pass; the active crypto path is empirically unaffected). Decide the home now per §9.4.
- **Q4 — dead-code (H-c).** `queueSignal` + `storage.insertRtbSignal` (0 production callers). Delete-on-the-spot in B6.5b (rule 18, full blast-radius verify) or scheduled dated deletion? CC lean: delete-on-the-spot — they're a confirmed-dead RTB insertion variant and leaving a class-blind insertion path lingering is exactly the rule-18 risk.
- **Q5 — dry-run "green."** Gate-10 = F1-F4 deployed + ≥1 full closed crypto lifecycle observed + Obj-3 fill-parity + xStock-isolation witnessed (zero xStock opens, `LIVENESS_SPLIT`=0). Agreed?

---

*On Langston Step-2 PROCEED + Q1-Q5 rulings → Step-3 implement F1-F4 → bench → CI → deploy → dry-run (Obj-2/3) → Step-4 diff review → Step-8 verify → governance → close gate-10.*
