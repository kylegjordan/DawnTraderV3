# B-OUTCOME-FEEDBACK-WIRE — PRE-AUDIT (Step-2, #602)

**Against scope r3 (@ `ed2b8eaec`) + Langston's Step-1 r3 PROCEED with two required folds.** CC-A · 2026-08-06.

## 1. SIM CONSULTATION (both components)
- `SYSTEM_IMPACT_MAP.md:3232` — `outcome-feedback-store.ts` is the **D9 labeled multi-source substrate** (re-architected): per-source partitions, no pooling. `:1100` — per-class key shape `updateEma/peek` REQUIRED-assetClass; persistent file `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json`; HARD-FAIL on corrupt state. `:1094` blast-radius line: confidence-chain consumers in `signal-orchestrator` + `vts-runner` + the close-hooks.
- The active-engine SIM entries confirm the `:3461` metadata block is the established at-entry stamp surface (B-OPEN-TRADES-DISPLAY rode the same block).

## 2. COMPONENT CENSUS (§9.5(a); repo-wide grep, tests excluded — full lists, not first-sufficient)
- **Writers (2):** `vts-service.ts:1127` (live, the 13 entries) · `active-execution-engine.ts:2128` (this batch's subject — structurally dormant via the dead gate).
- **Readers (2):** `signal-orchestrator.ts:1322` (`peek(tradingModeToRunMode(this.mode), …)` — SOURCE-MATCHED per the D9 comment above it) · `vts-runner.ts:2378` (`peek('vts', …)` — explicit vts partition).
- **Mutator (1):** `market-context-engine.ts:757` `evictExpired`.
- **Forbidden lane, enumerated because absence needs presence-evidence:** the shadow counterfactual sink (`rtb-shadow-store.ts:10`, `vts-runner.ts:723/:3633`) documents `updateEma` as a PROHIBITED call — test-enforced. No other caller exists.
- **Schedulers:** none — writes are close-path inline; the only periodic actor is the evictor.

## 3. FOUR-DIM KEY PARITY (Langston fold-1 — all four stated; key = `<source>_<assetClass>_<regime>_<strategy>`, raw concat `outcome-feedback-store.ts:134-135`)
| dim | WRITE (`:2128` site) | READ (`:1322`) | parity evidence |
|---|---|---|---|
| source | `tradingModeToRunMode(this.mode)` (`:2130`) | `tradingModeToRunMode(this.mode)` | **same function of the same mode** — paper engine writes `paper_sim`, paper orchestrator peeks `paper_sim` (D9 source-matched by design, comment at `:1320-1321`). |
| assetClass | `position.assetClass` column (SSOT stamp at creation) | `_pairAssetClass` | **measured:** `active_open_positions` distinct = {crypto_spot, xstock_spot}; `closed_trades` 7d = crypto 27 / xstock 62 — canonical enum both sides, population = all rows in each window. |
| regime | `_b67_2_1_ctx?.regime.regime` (the r3 stamp) | `symbolCtx?.regime.regime` (`:1264`) | **identical accessor, same MCE object** — parity by construction (Langston's source). |
| strategy | `position.strategyName` ← `signal.strategy` verbatim (`:3399`) | `rawSignal.strategy` (`:1260`) | **measured:** 14d closes distinct strategy_name = 8 canonical keys (vwap_pullback … defensive_hedge) — the SSOT key space, zero out-of-space values. |
**Store state (population = the ENTIRE persisted store):** 13 entries, **all `vts_`-prefixed, zero `paper_sim_`** — the paper orchestrator's peek has an empty partition, which is the defect made visible at the store itself. Sample key `vts_crypto_spot_IMPULSE_EXPANSION_strong_bull_trend` = exactly the read-side construction.

## 4. THE EDITS (unchanged from scope r3 §3, plus fold-2)
1. WRITE: `regimeAtOpen: _b67_2_1_ctx?.regime.regime ?? null,` in the `:3461` block. ⚠️ **Ordering is load-bearing (Langston):** the block sits BELOW the `...signal.metadata` spread (`:3446`), so the new key cannot be pre-polluted — keep it below the spread.
2. READ: `:2101` reads `metadata.regimeAtOpen`, dead cast retired.
3. **Fold-2 — INSTRUMENT THE SKIP:** the `:2103` gate's absent branch gains one log line (`[B67.4][feedback] skip: no regimeAtOpen (pre-deploy position or cold MCE) symbol=…`) — a silent fall-through is what hid this for three months; post-deploy, a cold-MCE null and a pre-deploy position must be distinguishable from "not shipped."
4. Blast radius: consumer-1 path only; `:1561` untouched (chain removal homed at `B-TEC-REGIME-PARAM-REMOVAL`); no schema change, no migration, no VTS-side edit; the type check proves the read edit is on the row type (`closePosition:1726` re-fetches via storage — Langston independently confirmed the READ edit is not a second dead cast).

## 5. RISK
Lowest tier: additive metadata key + a read-source change on a gate that today always skips. Failure modes: (a) MCE cold at open → null stamp → gate skips WITH the new log line (correct, visible); (b) pre-deploy positions → no key → same visible skip; (c) the EMA write itself is inside the existing try/catch. Not retroactive by design (scope r3 §3). Rollback = revert one commit.
