# B-NEW-53.2 — COMPLETION REPORT — xStock admitted at-entry-context block (#208)

**Date:** 2026-06-08. **Status: DEPLOYED + CI-GREEN + Langston-APPROVED — live-confirm alert-gated (sparse xStock admitted cadence).**
**Deploy commit:** `a6767cd75`. **CI:** run `27125059665` — all 4 jobs GREEN. **Deployed staging:** HTTP 200, clean boot, 2026-06-08T08:25Z. **Langston Step-4:** APPROVE-TO-PUSH.

## What this batch does (one paragraph)
The deferred xStock counterpart of B-NEW-53.1. xStock admitted rows in `signal_eval_archive.features` were scoring-metadata-only (no at-entry economics/context) because the xStock archive hook (`eval-cycle.ts:703`) fires BEFORE `registerOpenVtsTrade` (L727) — so there was no in-scope open-trade record to read (a DISTINCT mechanism from the crypto #207 wrong-object read). The fix builds the `registerOpenVtsTrade` payload as a named `const xOpenTrade` ABOVE the archive hook (a side-effect-free hoist), then archives the at-entry economics+context reading purely from it — the same object register receives, eliminating archive/row drift — mirroring the crypto B70.2 key set. Telemetry-only; no trade/gate/decision change; no migration; active trading OFF.

## Scope objectives (checklist)
1. **xStock admitted rows populate the at-entry block — YES (deployed; live-confirm alert-gated).** The block reads entry/stop/target/quantity/positionSize/atrAtOpen/phase/phaseAgeSeconds/regimeConfidence*/macroModifierValue/pairDirectionalBias(+score) from `xOpenTrade` + `expectedEdge`/`netRewardToRisk` from `kernelResult`. Live confirmation is alert-gated (2026-06-08T16:00Z) because xStock admitted cadence is sparse (~5/hr; 0 rows in the first post-deploy minutes is expected).
2. **Values equal the trade that registered — YES by construction.** The archive reads the SAME `xOpenTrade` object passed to `registerOpenVtsTrade`, so archived entry/stop/target == the trade's `vts_open_trades` row (no parallel-literal drift). Langston verified the field-by-field parity against the register payload.
3. **Zero behavior change — YES.** `registerOpenVtsTrade(xOpenTrade)` receives the identical object; the gates + reject archives are untouched; `archiveSignalEval` stays in its own try/catch (telemetry can't break the trade); archive-before-register ordering preserved.
4. **No new tsc baseline errors; suite green — YES.** Bench: tsc no new errors (the `as const` on the two literal-union fields keeps `xOpenTrade` assignable to `RegisterOpenVtsTradeInput`); vitest 11 failed files / 12 tests = the known pre-existing clean-head set, 1626 passed, zero new failures.
5. **Cross-class uniformity — YES.** The xStock admitted `features` mirror the crypto B70.2 key set field-for-field (+ the `netRewardToRisk` extra), with documented `null` where xStock genuinely lacks the value.
6. **Telemetry-only / safety — YES.** One file (`eval-cycle.ts`); no migration; active trading OFF.

## Langston gates
- **Step-1:** all 5 ratified (payload-hoist over reorder; `expectedEdge=netEV`; the 2 nulls; mirror-key-set; ACK Step-2) + 2 riders for Step-2.
- **Step-2:** both riders discharged — **(a) hoist purity** confirmed side-effect-free (dollarValue literal; quantity pure over `const entryPrice`; archive fire-and-forget; askDepthUsd immutable param); **(b) units** — verified netEV is **price-space** vs crypto's **score/return-space** → NOT cross-comparable. Langston's refinement: capture **both** `expectedEdge=raw netEV` (audit fidelity — the literal quantity the admit gate compared to `VTS_NET_EV_FLOOR`) **and** `netRewardToRisk` (kernel-native scale-free, the Phase-25 within-class selectivity normalizer). His blocking condition — never-pool is **code-level** — VERIFIED: `hce_study.py` tags `asset_class` + loops `for ac in ['crypto_spot','xstock_spot']` separately at every stage (L262/318/371/431).
- **Step-4 code review:** **APPROVE-TO-PUSH.** Walked the field-by-field key-set parity vs the register payload + the crypto admitted block; confirmed hoist purity ("same object eliminates archive/row drift — better than neutral"); never-pool code-level discharged.

## ⚠️ Units caveat (recorded per Langston)
`expectedEdge` on xStock admitted rows is the kernel's **price-space net-EV** (`pWin·|tgt−entry| − pLoss·|entry−stop| − friction`, scales with asset price) — the literal value the admit gate compared to `VTS_NET_EV_FLOOR`. Crypto's `expectedEdge` is **score/return-space** (`finalScore·(|tgt−entry|/entry) − friction`). Different formula AND units → **NEVER pool or compare cross-class**. Safe because the never-pool rule is enforced at code level (HCE per-`ac` partition), not just methodology prose. `netRewardToRisk` is the kernel's native scale-free metric for within-class Phase-25 selectivity.

## Langston non-blocking notes (recorded, not revisions)
1. If `mceContext.directionalBias` is ever undefined, the archive captures `null` (via `?? null`) while register may default-resolve a real `pairDirectionalBias`/score onto the `vts_open_trades` row — a rare single-field archive/row divergence, low-impact.
2. Backlog (out of scope): `registerOpenVtsTrade` default-resolving *crypto* global-market aggregates onto *xStock* rows (pre-existing B-NEW-22) is arguably wrong-context for xStock — a separate future per-`ac`-global-resolve item.

## Files changed
**Modified:** `server/asset_classes/xstock_spot/eval-cycle.ts` only (hoist `dollarValue`/`quantity` + named `xOpenTrade` const above the admitted archive; at-entry `features`/`modulators` block; `registerOpenVtsTrade(xOpenTrade)`). **No migration.**

## Governance files updated
RUNNING_ISSUES (#208 resolved), CHANGES_AND_FIXES (closure + units caveat + never-pool-is-code-level + the 2 non-blocking notes), SYSTEM_IMPACT_MAP (B70.2 xStock note → realized), BATCH_CATALOG (row), PHASE_HISTORY (entry), this completion report, MEMORY (truth + mirror + Langston).

## Remaining to fully CLOSE
1. Langston Step-8 second-pass confirmation (dispatched).
2. The `B-NEW-53.2 live confirm` alert (2026-06-08T16:00Z): xStock admitted at-entry block populated at scale → if green, B-NEW-53.2 fully CLOSED; if still blank on post-deploy admitted rows, reopen #208.
