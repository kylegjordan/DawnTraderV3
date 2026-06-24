# reorg-B3.3 — Step-4 diff review (CC-B → Langston)

INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git on the gdrive mount. Read THIS file directly
(local FS). For repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

Bench: **tsc baseline gate OK — no regressions above baseline.** New unit test **6/6 pass**. The 3 existing
strategy-call test files I re-ran pass; one (`b63-item12`) fails ONLY on the bench because it needs Postgres
(`module-constants-service` prefetch → pg-pool ECONNREFUSED in `beforeEach`) — environmental, not my change;
the sibling `b79-0n-strategy-required-assetclass` (which calls `callStrategyDetect` omitting the new arg)
passes, proving the default-enforce safety. CI's Test Suite job has the DB.

Diffstat (13 code files; +136 −49 — uniform/mechanical):
`strategy-helpers.ts` (+35 SSOT), `strategy-engine.ts` (8 in-class sigs + guard swap + 10 wrapper pass-throughs),
`vts-runner.ts` (threading + the one `'tag'` call), 10 strategy files (3-line change each), + new test.

---

## 1. The SSOT (strategy-helpers.ts) — the whole policy is here

```ts
export type GateDisposition = 'enforce' | 'tag';
const VTS_TAGGABLE_GUARD_REASONS: ReadonlySet<GuardDropReason> = new Set<GuardDropReason>(['rr_below_min', 'unreachable']);
export function guardForcesDrop(gr: GuardResult, disposition: GateDisposition = 'enforce'): boolean {
  if (gr.pass) return false;
  if (disposition === 'enforce') return true;                  // active/live: drop on any fail (unchanged)
  return !VTS_TAGGABLE_GUARD_REASONS.has(gr.dropReason);        // VTS: quality tags; validity (atr/stop) drops
}
```

## 2. Per-strategy change — IDENTICAL 3-line shape in all 18 (strong-bull-trend shown)

```diff
+import { guardForcesDrop, type GateDisposition } from './strategy-helpers';
   ...detect signature...
     assetClass: AssetClass,
+    gateDisposition: GateDisposition = 'enforce',     // trailing-optional; LAST param in all 18
   ): StrategySignal | null {
   ...
-    if (!_gr.pass) { setNullReason('guard_fail'); return null; }
+    if (guardForcesDrop(_gr, gateDisposition)) { setNullReason('guard_fail'); return null; }
```
(In `strategy-engine.ts` the 8 in-class detectors got the same; the 10 file-based detectors got it in their
own files PLUS their `strategy-engine` wrapper methods now thread `gateDisposition` through. `defensive-hedge`
and `orb` put the param after their extra last param `btcCandles`/`ctx`, matching the wrapper call order.)

## 3. The ONLY behavioral opt-in (vts-runner.ts — crypto VTS)

```diff
+  // reorg-B3.3: crypto VTS opts into 'tag' — quality guards no longer drop at the strategy; they fall
+  // through tagged, then the existing reorg-B3.2 normalizer (:~1189) re-derives the verdict + simulates.
+  // ACTIVE/LIVE omit the arg → 'enforce' → unchanged. (Option A: xStock eval-cycle stays 'enforce' → B3.3x.)
   const strategySignal = callStrategyDetect(strategy, stratDetectIndicators, ohlcAsAny, stratPatternInput, symbol, _resolvedAssetClass, 'tag');
```
`callStrategyDetect`/`callStrategyDetectRaw` got a trailing `gateDisposition: GateDisposition = 'enforce'`
threaded to all 18 dispatch cases. **No other call site passes a value** → every other caller defaults to enforce.

---

## 4. Your four/six conditions — closed

**(1) `unreachable` = far-but-directionally-valid, not malformed — CONFIRMED.** Two independent reasons: (a)
long-only construction — every strategy sets `target = entry + (positive)×ATR`, `stop = entry − (positive)×ATR`,
so `target>entry` strictly whenever ATR is valid (ATR≤0 → `clampEffectiveATR` returns null → `invalid_atr` →
DROPS at the strategy on every path, never reaches the reach check); a wrong-side target would yield
`reward≤0 → rr≤0 → rr_below_min`, not a false `unreachable`. (b) Defense-in-depth on the tagged crypto path:
the downstream normalizer (`signal-target-normalizer.ts:73-78`) has an explicit `invalid_geometry` guard
(non-finite / `entry≤0` / `stop≥entry`) that is a VALIDITY reason → DROPS under reorg-B3.2. So even a
hypothetically malformed signal that a strategy tagged would be re-checked and dropped before any sim.

**(2) Caller exhaustiveness — CONFIRMED, not assumed.** Grep of all 19 `detectXXX`/`callStrategyDetect`
call sites repo-wide: live = `vts-runner` (crypto VTS, the one `'tag'`), `signal-orchestrator` (active),
`xstock eval-cycle` (xStock VTS), plus `routes.ts`, `historic-signal-generator`, `strategy-validator`,
`stage-b-validator`, `paper-sim-diagnostic`, one script, 3 tests, and the `docs/.../screeners_export`
snapshot copies. **Every one of them OMITS the new trailing-optional arg → defaults to `'enforce'` → behavior
byte-identical.** Only `vts-runner:1182` opts in. (Default-enforce makes any future missed caller safe too.)

**(3) Normalizer parity (the silent-bite one) — examined, and it does NOT bite. Here's the honest finding.**
Same gate SSOT: both `applyGlobalGuards` (strategy) and `normalizeAndGateTarget` (normalizer) take
`minRR`/`reachAtrMax` from `getPerClassTargetGate(assetClass)` — identical thresholds. RR math is identical
for valid long-only geometry (strategy uses `|target−entry|`, normalizer uses signed `target−entry`; equal
when `target>entry`). **One real divergence: the reachability DENOMINATOR.** Strategy uses `clampEffectiveATR`
(ATR capped at `price×0.10`); the normalizer uses RAW `mceContext.indicators.atr`. Since `clamped ≤ raw`, the
strategy guard is *stricter* on reachability. Why it's benign on BOTH paths: (a) ACTIVE/'enforce' — the
strategy guard gates first and is the stricter bound, so if it passes reach the normalizer (more lenient)
never contradicts it downward — no flip. (b) VTS/'tag' — the strategy guard does NOT drop on `unreachable`
anyway (it's taggable), it just continues; the **normalizer at :1189 is the AUTHORITATIVE source of the
recorded `vtsGateVerdict`**. So there is no "tag-at-guard-then-mis-verdict": the strategy guard only decides
drop-vs-continue (and continues for both quality reasons), and the normalizer independently assigns the label
the record carries. The divergence can only change whether the strategy-guard *would* have said unreachable
vs the normalizer's verdict at the `atr>10%×price` extreme — and in every such case the signal still opens +
simulates with the normalizer's authoritative verdict. Net: parity holds where it matters (the recorded
verdict + the active gate); the denominator asymmetry is pre-existing (B2.1 vs B2) and label-neutral here.
Flag if you'd rather I align the VTS-path normalizer call to the clamped ATR — it's a 1-line VTS-only change,
but I judge it unnecessary and out-of-scope.

**(4) Downstream-of-guard safety, all 18 — VERIFIED.** The guard sits immediately before signal construction/
return in every strategy (the reorg-B2.1 comment "Dominates the single signal return below"). Spot-read the
in-class `detectVWAPPullback` (guard → `return signal`) and the file `morning_star` (guard → confidence calc →
build/return) — nothing after the guard re-asserts `pass` or assumes the drop fired. On 'tag'-continue the
quality-failing signal flows to the normal `return signal`. No site reads `_gr.pass` after the guard.

**(5) Telemetry / Step-7 measurability — RESOLVED (you're right that guardDrops is the wrong lens).**
`recordGuardEval` fires `pass=false` for tagged signals too, so `guardDrops` rr/reach counts will look the
SAME before/after — it cannot show the un-strangle. The MEASURABLE proof is a DIFFERENT metric:
`vtsEvaluation.signalsGenerated` (currently **1** across 136,779 evals) and VTS opens climb — because the
quality-gated population that was hard-dropped (not counted as generated) now flows through to generate +
open. The DELTA in signalsGenerated/opens IS the tagged-simulated count. Per-trade attribution rides on
`vtsGateVerdict ∈ {rr_below_min, unreachable}` on each opened record. So Step-7 proof = signalsGenerated/opens
climb sharply from ~1, with opened records carrying non-`passed` verdicts. No new diagnostic code needed.

**(6) §13 home for reorg-B3.3x — LANDING THIS BATCH (drafted below, in this push).**
- `RUNNING_ISSUES.md` **#382 (OPEN)** — "reorg-B3.3x — xStock VTS un-strangle (tag-don't-drop at the
  eval-cycle gate chain). The shared strategy `gateDisposition` param is built (B3.3); xStock's downstream is
  structurally different (Net-EV floor at `eval-cycle.ts:657`, no B3.2 normalizer), so it needs its own
  tag-don't-drop + `vtsGateVerdict` capture. Designated the IMMEDIATE next batch after B3.3. xStock VTS stays
  strangled until this lands — short window. ↔ #380, reorg-B3.3."
- `PHASE_19_PLAN.md` §1 board + §5 log — reorg-B3.3x as the named next item right after reorg-B3.3.

Ask: CONCUR to push (code + the #382/PHASE_19_PLAN home together)? Or CHANGES-NEEDED on any of the above
(esp. if you want the normalizer-ATR alignment in #3).
