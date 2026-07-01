# P19-B7.2 — Step-4 code-review dispatch (CC-B → Langston)

**Full diff:** `P19_B7_2_STEP4_DIFF.patch` (staged to your inbox — 7 modified files + 3 new + the migration). **Bench:** `node scripts/check-tsc-baseline.mjs` = no regressions above baseline; `p19-b7-2-maker-taker.test.ts` = **13/13 pass**. **INFRA NOTE:** do NOT `cd /mnt/gdrive` or git-status the mount — read the staged inbox files directly; use `ssh staging` for any repo inspection.

## What landed (OBJ-1/2/3/4/6 — the crypto opener)
1. **NEW `maker-taker-decision.ts`** (pure): `decideMakerTaker()` — best-of-both via the SAME net-expectancy KERNEL (only friction differs: maker saves entry-leg fee-diff + spread + entry slippage). Conservatism = `makerNetEVAdjusted = pFill·(makerNetEV_onFill − A) − (1−pFill)·C`, where **A** (adverse selection) ↑ with signal strength and **C** (non-fill cost) ↑ for continuation / ↓ for reversal. **Non-fill is booked as an opportunity-cost LOSS, never EV=0 (your item 1).** Hard taker floor for strong continuation. `entryUrgencyClassForFamily`: trend/breakout/strong_trend→continuation, reversal/oscillator→reversal, else neutral.
2. **NEW `maker-taker-config.ts`** — per-class DB resolver (`maker_taker` module, fail-hard) + `resolveMakerTimeBudgetMs`. Warmed via b72-warmup (added `'maker_taker'`). Migration seeds 16 per-class START-TIGHT rows.
3. **Snapshot (OBJ-1/3)** — decided ONCE at `buildSizedSignalForStrategy` (the shared convergence — F1-verified: pattern bypasses `[HF9]`), on the same at-queue DI/DBS basis as the `diAtQueue` snapshot (F2). Persisted to 4 new typed rtb_signals columns (`chosen_entry_mode`, `chosen_net_ev`, `taker_net_ev`, `maker_net_ev_adjusted`) via `queueSQESignal`.
4. **Both readers (OBJ-3)** — the `[11.8B]` open-gate takes its EV-sign from `chosen_net_ev`; the B7.1 ranker ranks on `chosen_net_ev / risk_price`. Single-consistent-number (a taker-chosen signal is unchanged; a maker-chosen one carries the haircut-adjusted value).
5. **OBJ-4 make-then-take** — `processMakerPending` in the RTB refresh: honest per-tick trade-through fill → clears `maker_pending` (open path runs its S1+S4 at fill); keep-waiting within budget; on expiry **convert-safety via the KERNEL (`evaluateTradeExpectancy`, NOT `computeNetGeometry`)** → if taker netEV>0 **atomic re-snapshot** to taker, else `expireSignal`. Maker-POST in the promotion loop (`continue` BEFORE the slot decrement = slot-free-while-waiting) + `getRankedSignals` mutual-exclusion filter.
6. **OBJ-6 telemetry** — `recordMakerTakerDecision` + `getMakerPickProof()` (the **maker-PICK-RATE** monitor = your too-loose-haircut early warning). Paper maker-fills stay data-fenced.

## Landmines handled (your Step-2 items)
- **Item 1 (non-fill ≠ 0):** the `−(1−pFill)·C` term (test: `makerNetEVAdjusted < pFill·makerNetEV_onFill`).
- **Item 3 (atomic re-snapshot):** convert overwrites chosen/taker netEV + mode in ONE `updateRtbSignal`; friction is fresh; DI stays at-queue (accuracy-only per H1) and the gate reads the single re-stamped `chosen_net_ev`, so no mixed vintage in the decision.
- **CC-A field-name landmine:** convert-safety calls `evaluateTradeExpectancy` (kernel netEV), never `computeNetGeometry.netRewardToRisk` (gross).
- **Item 4 (S4 at fill):** on fill I clear `maker_pending` → the existing open-path guardrails run S1 count AND S4 concentration at open = slot-checked-at-fill.

## 3 asks for consensus
- **Q1 — #330 (OBJ-5): FOLD now or SPLIT?** I lean **split into a dedicated small follow-up.** The two fee-source paths (`getCachedCostMetrics` vs `getFrictionForAssetClass().feeRateTaker`) already resolve the SAME DB `fee_model` fact — #330 is a consolidation-refactor of a working path, and folding it risks an otherwise clean+tested batch. The maker/taker decision does NOT depend on it (it reads `getCachedCostMetrics` + `feeRateMaker` directly). Your call — the scope committed to folding it; I'll do either.
- **Q2 — honest fill (paper/dormant):** the trade-through fill is a single per-tick observation (`currentPrice ≤ makerLimit`); the real Kraken post-only place/reprice/cancel lifecycle is Phase-21 (§9.1 scaffolding). OK for paper-dormant?
- **Q3 — the SQE-ROI-dormant finding:** on the active path the SQE ROI gate is guarded `if(entry&&target&&regime)` and the active sqeInput doesn't set them → dormant → the sole active taker-EV gate is `[11.8B]`, so best-of-both reaching the snapshot suffices. I documented that if the active SQE ROI gate is ever activated, best-of-both must move before it (or that gate must read the snapshot). Agree that's the right call + the right place to flag it?

Reply with CHANGES-NEEDED items or APPROVE-to-push. I'll iterate to consensus, then push + CI + deploy + governance.
