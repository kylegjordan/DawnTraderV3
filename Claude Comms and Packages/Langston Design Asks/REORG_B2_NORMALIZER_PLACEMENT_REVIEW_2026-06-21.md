# reorg-B2 — Signal-Target-Normalizer PLACEMENT review (Kyle-requested CC↔Langston iteration)

**Date:** 2026-06-21 · **Requested by:** Kyle · **Driver:** NEW Claude (CC-B) · **Reviewer:** Langston
**Status:** OPEN architecture question — Kyle wants us to iterate to a joint recommendation BEFORE the reorg-B2 Filter-Diagnostics visibility follow-up proceeds.

---

## 0. The ask (Kyle, verbatim intent)

Kyle is questioning whether `server/core/calculations/signal-target-normalizer.ts` (`normalizeAndGateTarget`) — the reorg-B2 helper that runs AFTER a strategy builds a signal and does {floor-lift, RR-gate, reachability-gate} — is **correctly placed**, or whether these three checks belong **inside the 19 strategy modules** where the signal is generated (or possibly in SQE). His reasoning:

1. The strategy module generates a signal considering the WHOLE picture (price, volume, ATR, many gates/thresholds). The normalizer is a downstream helper that sees ONLY the target in isolation — "not the whole strategy signal picture."
2. The **floor-lift** is the sharpest concern: lifting a target the strategy deliberately set can create a signal "the strategy would never have produced" — if the strategy had known the target had to be that big, it might have declined to fire at all (because it weighs the full pair picture).
3. He suspects some of this may ALREADY be done inside some strategy modules → possible **redundancy**, and wants us to actually LOOK at the strategy modules to check.
4. He is explicitly NOT mandating a move — "not saying we can't use the helper, I just wanna make sure it's the right thing to do." He wants our honest joint engineering call (he may overrule, but wants the real recommendation + the upsides/downsides each way).
5. Correction he made: there are **19** canonical strategies (17 original + ORB + strong_bull_trend), not 21. The normalizer's comment says "21 (12 file-based + 9 in-class)" — that is wrong and must be fixed.

---

## 1. Evidence — strategy-module investigation (CC-B, 2026-06-21, read-only sweep of all 19)

**Count:** 19 confirmed (`STRATEGY_DISPLAY_NAMES`, `canonical-regime-strategy-map.ts:511-533`). Real split ≈ **9 in-class** (logic in `strategy-engine.ts`) + **10 file-based** (`server/strategies/*.ts` via thin wrappers). The normalizer comment's "12 file-based + 9 in-class = 21" is inaccurate on both the split and the total.

**Shared guard layer already exists:** `server/strategies/strategy-helpers.ts::applyGlobalGuards` (:361-371) bundles `validateRR` (RR ≥ `MIN_RR_RATIO = 1.5`), `validateStopDistance` (≥0.3%), `getEffectiveATR` (rejects ATR < 0.1% of price, clamps ≤10%). **The 10 file-based strategies route through it (except `orb`); the ~9 in-class strategies do NOT use it at all.**

**Op-by-op overlap with the normalizer:**

| Normalizer op | Already in strategies? | Detail |
|---|---|---|
| **1. Floor-LIFT** (target ≥ entry×(1+floorPct)) | **0 of 19** | Genuinely new. BUT conflicts with strategy intent for **measured-move** (breakout `entry+rangeHeight`; volatility_edge `min(measuredMove, atrTarget)`) and **structural-ceiling** (range_trade `target=rangeHigh−atr`; mean_reversion `target=meanValue`; dhma symmetric vol target). Lifting past those points manufactures reward the thesis doesn't predict. Less harmful for the plain ATR-multiple family (morning_star, support_bounce, etc. — `target=entry+mult×ATR`, already arbitrary). |
| **2. RR-GATE** (rr ≥ minRR) | **~8 of 19** | The 8 guarded file-based strategies already enforce RR ≥ 1.5 via `applyGlobalGuards`. Exceptions: `strong_bull_trend` + `orb` (no RR floor) and ALL ~9 in-class (only ad-hoc `target>entry`). The normalizer re-gates at a per-class `minRR` (seeded 2.5) → **stricter than 1.5 ⇒ silently overrides + makes the strategy's own RR guard dead/redundant** for those 8; adds RR for the first time to the other ~11. |
| **3. REACHABILITY** (atrsToTarget ≤ reachAtrMax) | **0 of 19** | Genuinely new for all. `getEffectiveATR` rejects ATR-too-small but never caps how many ATRs the target sits away. |

**Feasibility of moving into the strategy layer:** the shared `applyGlobalGuards` is ready-made scaffolding — adding floor + reachability there covers the **10 file-based strategies in ONE edit**, not 10. RR + reachability are **formula-agnostic** (read only entry/stop/target/ATR) → identical across strategies → ideal for the shared helper. The **floor-lift is the only op needing per-strategy judgment** (~4-5 exemption flags for the measured-move/ceiling strategies). The obstacle: the **~9 in-class detectors in `strategy-engine.ts` bypass `strategy-helpers.ts`** — they'd each need wiring to the shared guard (real Phase-19 work + risk).

**Wiring bonus:** VTS calls `strategyEngine.detect*` DIRECTLY. If these gates live in the strategy/shared-guard layer, BOTH the active path AND VTS inherit them automatically — eliminating the normalizer's current need to be wired at TWO convergence points.

---

## 2. CC-B's preliminary position (honest best-for-system read)

Kyle's instinct has **real merit**, and the evidence supports a change — but a NUANCED one, op-by-op, not "rip out the helper":

- **Floor-LIFT** — the weakest as a blind central op. My lean: **stop blindly LIFTING.** Either (a) convert it to a per-class minimum-target **DROP** gate (if the strategy's NATIVE target doesn't clear the floor, drop the signal — don't fabricate a target the strategy didn't choose), or (b) keep a lift but make it **per-strategy-aware** (exempt measured-move/ceiling strategies). I lean (a)-DROP because it respects strategy intent AND, given the EV reality (taker can't open profitably anyway), the lift doesn't actually open trades — it just manufactures questionable geometry. (a) is also formula-agnostic, so it can still be central.
- **RR-GATE** — consolidate to ONE SSOT. Today the normalizer's per-class `minRR` silently shadows `strategy-helpers`' hardcoded 1.5. Pick one home: extend `applyGlobalGuards` to read the per-class `minRR` and wire the ~9 in-class strategies to it → one shared guard, no duplication, covers active+VTS.
- **REACHABILITY** — genuinely new, formula-agnostic; fine centrally OR in the shared guard. Lean: same shared-guard home as RR for consistency.

**Net lean:** fold all three into the strategy **shared-guard layer** (`strategy-helpers`, extended to the in-class strategies), with the floor reconsidered as drop-or-per-strategy-aware. Upside: gates at signal generation (Kyle's point), DRY via one shared helper (not 19 copies — the "scatter" fear is overstated since 10 already share the guard), auto-covers VTS (kills the dual-wiring), respects strategy intent. Downside: wiring the ~9 in-class detectors to the shared guard is real Phase-19 work + regression risk, and "the helper is already built/tested/deployed" — but NO-PATCHES says don't keep a worse shape because it's already built.

**Counter-case to keep central (steelman):** RR + reachability ARE pure feasibility checks legitimately done once at the convergence point; the in-class refactor adds risk mid-Phase-19; and a single chokepoint is easier to make VISIBLE in Filter Diagnostics (Kyle's hard requirement) than logic distributed across 19 detectors.

---

## 3. Questions for Langston (iterate to consensus)

1. Do you agree the **floor-LIFT** should stop being a blind lift? DROP-gate vs per-strategy-aware-lift vs leave-as-is — your call + why.
2. **RR-gate consolidation:** extend `applyGlobalGuards` to the per-class `minRR` + wire the in-class strategies, vs keep the central re-gate (and accept the strategy-helpers 1.5 becomes dead)? 
3. **Overall placement:** shared-strategy-guard layer vs central helper vs SQE? Weigh the VTS auto-coverage + Kyle's "consider the whole strategy picture" point against the in-class-refactor risk.
4. Is the in-class-detector refactor (wiring the ~9 to `strategy-helpers`) safe to do inside Phase-19, or is it its own batch?
5. Regardless of placement: the Filter-Diagnostics visibility (VTS tabs, both classes) is Kyle's hard requirement and proceeds either way — agreed?

Reply with your independent read; we iterate to a joint recommendation for Kyle.
