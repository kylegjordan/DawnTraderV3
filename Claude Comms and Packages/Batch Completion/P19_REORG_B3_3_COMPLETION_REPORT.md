# reorg-B3.3 — Completion Report

**Batch:** P19 reorg-B3.3 — strategy-level VTS tag-don't-drop (the CORRECTED un-strangle)
**change-class:** architecture (signal-pipeline / VTS)
**Date:** 2026-06-24 · **By:** CC-B (NEW Claude) + Langston (Step-1 scope, Step-4 diff CONCUR) · autonomous
**Deployed:** staging `ed9b8b626`, restart#413, CI 4-green `28118347545`, **no migration**

---

## Why this batch (the reorg-B3.2 correction)

reorg-B3.2 put tag-don't-drop on the vts-runner downstream normalizer — but it was **INERT on the live path.**
reorg-B2.1 had relocated the RR/reachability gate INTO the strategies at signal-gen, so all 18 strategies
`if (!_gr.pass) { return null }` and drop the signal BEFORE it reaches the normalizer. `callStrategyDetect`
returned null and B3.2 was dead code (staging-proven: `signalsGenerated=1` across 136,779 evals; `guardDrops`
rr+reach ~95%+). reorg-B3.3 moves the un-strangle to the actual drop site — the strategies' shared guard.

## Objectives — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Disposition policy SSOT `guardForcesDrop(gr, disposition)` in `strategy-helpers.ts` | ✅ YES | `GateDisposition` type + `VTS_TAGGABLE_GUARD_REASONS={rr_below_min, unreachable}`; unit test 6/6 pins the §3 table |
| OBJ-2 | Thread `gateDisposition='enforce'` (trailing-optional) through all 18 detect sigs + guard-site swap | ✅ YES | 8 in-class `strategy-engine` detectors + 10 file strategies + their wrapper methods; `if (!_gr.pass)` → `if (guardForcesDrop(_gr, gateDisposition))` |
| OBJ-3 | VTS dispatch threads the param; crypto VTS opts `'tag'` | ✅ YES | `callStrategyDetect`/`callStrategyDetectRaw` threaded to all 18 dispatch cases; `vts-runner.ts:1182` passes `'tag'`; flows to the B3.2 normalizer → `vtsGateVerdict` + simulate |
| OBJ-4 | Active/live unchanged BY CONSTRUCTION | ✅ YES | orchestrator + every non-vts-runner caller omits the arg → default `'enforce'`; grep-confirmed exhaustive; zero orchestrator edits |
| OBJ-5 | Tests + bench + CI 4-green | ✅ YES | new unit test 6/6; tsc baseline gate **OK no regressions**; CI `28118347545` all-4-green |
| OBJ-6 | Governance (Tier-1 + applicable Tier-2) | ✅ YES | see list below |

## Langston Step-4 — six conditions, all CONCUR

1. **`unreachable`=far-but-valid, not malformed** — long-only construction (`target=entry+(+)×ATR`; ATR≤0 → `invalid_atr` drops before the reach check) + the normalizer's `invalid_geometry` validity-drop net. Closed.
2. **Caller exhaustiveness** — repo-wide grep: every non-`vts-runner:1182` caller omits the arg → enforce; default covers future callers. Closed.
3. **Normalizer parity** — same gate SSOT (`getPerClassTargetGate`); one bounded clamped-vs-raw reach-ATR divergence, **benign + intentionally-left** (strategy guard is stricter; normalizer authoritative for the recorded verdict). Logged RUNNING_ISSUES #382. Closed (do-not-align, Langston agreed).
4. **Downstream-of-guard safety, all 18** — guard sits immediately before signal construction/return; spot-verified in-class + file; no post-guard `_gr.pass` read. Closed.
5. **Telemetry / Step-7 measurability** — `guardDrops` is path-blind (`recordGuardEval` fires `pass=false` for tagged too) → the measurable proof is `signalsGenerated`/opens climbing from 1, with opened records carrying `vtsGateVerdict ∈ {rr_below_min, unreachable}`. Closed.
6. **§13 home for reorg-B3.3x** — RUNNING_ISSUES **#382** + PHASE_19_PLAN §1 board + §5 log, landed same push. Closed.

## 🚨 Scope note (§9.1)

reorg-B3.3 un-strangles the **crypto VTS learning path only.** The **xStock VTS path remains strangled**
(default-`'enforce'`) until **reorg-B3.3x** (RUNNING_ISSUES #382) — its eval-cycle gate chain is structurally
different (Net-EV floor, no B3.2 normalizer). B3.3x is the designated immediate next batch.

## Step-7 verification

Deployed `ed9b8b626`, restart#413, HTTP 200; deploy verified correct (`guardForcesDrop`×18 + `TAG_NO_DROP`
present in `dist/index.js`; VTS scan running). **✅ MECHANISM CONFIRMED LIVE (the direct B3.3 proof):**
`[reorg-B3.2][VTS][TAG_NO_DROP]` markers FIRED post-deploy — e.g. `USDC/AUD/strong_bull_trend
would-gate=rr_below_min rr=2.00 — simulating anyway for learning data (active path still suppresses)`. Each
marker is a signal with RR below the 2.5 floor that **pre-B3.3 was hard-dropped at the strategy** (`guard_fail`,
returned null before reaching the normalizer) and is **now tagged-and-simulated.** The marker count tracked the
guard-tracker `rrDrops` delta 1:1 (each new rr_below_min guard-hit produced a TAG_NO_DROP), proving the
strategy guard no longer drops quality-gated signals on the crypto VTS path.

**Honest scope of the proof:** TAG_NO_DROP firing is the DIRECT, decision-grade proof the strategy-level
un-strangle works. The fuller `vts_open_trades` recovery toward ~150/day is a multi-hour ACCUMULATION (the
tagged signal must also clear the downstream VTS Net-EV floor to OPEN, and crypto strong-trend quality-gated
signals arrive at a low rate — ~tens/hr) — it climbs over the coming day, not within the deploy window.
`guardDrops` itself is NOT a climb proxy (`recordGuardEval` is path-blind, records `pass=false` for tagged
too) — the right lens is the TAG_NO_DROP markers + `signalsGenerated`/opens over a day.

## Governance files changed

- `1-system-manual/SYSTEM_MANUAL.md` — §11 NEW "reorg-B3.2 + reorg-B3.3 per-PATH gate DISPOSITION" content section (Langston §16 requirement)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — §1.2a-2 per-path disposition + explicit cross-cutting-state REGISTRY applicability call (`gateDisposition` = threaded param, NOT a registry entry)
- `1-system-manual/RUNNING_ISSUES.md` — #382 (reorg-B3.3x home) + the known-benign reach-ATR divergence note
- `1-system-manual/PHASE_19_PLAN.md` — §1 board rows (reorg-B3.3 + reorg-B3.3x) + §5 decision log
- `1-system-manual/BATCH_CATALOG.md` — reorg-B3.3 row
- `1-system-manual/PHASE_HISTORY.md` — plain-language reorg-B3.3 entry
- `Claude Comms and Packages/Scope Files/REORG_B3.3_SCOPE.md` (Step-1)
- `Claude Comms and Packages/Langston Design Asks/REORG_B3.3_STEP4_DIFF_REVIEW.md` (Step-4)
- `Claude Comms and Packages/Batch Completion/P19_REORG_B3_3_COMPLETION_REPORT.md` (this)
- MEMORY (CC-B per-session + Langston's Hetzner MEMORY per §10.b)

**Code files:** `server/strategies/strategy-helpers.ts`, `server/services/strategy-engine.ts`,
`server/services/vts-runner.ts`, 10 strategy files (`adaptive-flow`, `defensive-hedge`, `inside-bar-reversal`,
`morning-star`, `orb`, `pivot-shift`, `reverse-impulse`, `strong-bull-trend`, `support-bounce`,
`volatility-edge`), + `server/tests/unit/reorg-b3-3-guard-disposition.test.ts`.

## Step-8 — Langston independent verify: ✅ PASS

Langston independently confirmed on staging (`ssh deploy@188.245.193.8`, not from this report): code head
`ed9b8b626`, restart#413 online, CI `28118347545`; **10 `[VTS][TAG_NO_DROP]` markers firing since 17:57Z**
(`USDC/AUD/strong_bull_trend rr=2.00`, `USDT/GBP/volatility_edge`) — the strategy-level un-strangle confirmed
working ("the real fix B3.2 wasn't"). Governance `6fc8d9d03` clears his §16 gate (SYSTEM_MANUAL +15 lines
content not just a TOC touch; SIM §1.2a-2 registry-applicability call reasoned correctly).

**Edge resolution (the `rr=-0.00` finding) — Langston's call: RECLASSIFY.** `target<=entry` / `reward<=0`
is degenerate geometry (Net-Expectancy noise), NOT a low-RR-but-valid counterfactual — it belongs in the
validity-DROP bucket. The normalizer's `invalid_geometry` is asymmetric (nets `stop>=entry`, misses the
reward leg). **Named home (§13): reorg-B3.3y** (RUNNING_ISSUES #383 + PHASE_19_PLAN) — a tiny crypto-normalizer
symmetric-`invalid_geometry` fix + unit test, kept separate from B3.3x. Interim contamination bounded (the VTS
Net-EV floor rejects a reward≤0 trade from opening). **Non-blocking** for B3.3 closure.

**Status:** ✅ all 11 steps complete; Langston Step-8 PASS; reorg-B3.3y (#383) named per §13. **Code +
governance deployed/pushed, CI 4-green, sync 0/0. Awaiting only Kyle's acknowledgment to formally CLOSE.**
