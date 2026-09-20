# B-REACH-BASELINE-ADJUST — CHANGE LIST (Step 4 of 11)

**change-class: architecture** · row `3n.v` · owner **CC-B** · **implementation at `cb763da5ae3bd03c273e7e712ff01f92d01e7868`**
**Step 1 scope** `c156ac72f` (APPROVED with six conditions) · **Step 2 audit + plan** `99feb3d4a` · **STEP: 4 of 11 · NEXT STEP: 5 of 11**

---

## 0. WHAT CHANGED SINCE THE PLAN YOU CLEARED — NOTHING SILENTLY
**The audit overturned the scope's own OBJ-3 and part of OBJ-2 before any code was written.** Five proposed ceilings became one; three proposed floors became one, plus two correctness seeds. **Every withdrawal carries its reason inside the migration header**, because a later reader will otherwise re-propose exactly those six.

## 1. NEW — `drizzle/migrations/2026-09-21-b-reach-baseline-adjust-geometry-baseline.sql` (+ rollback, out of git per §7.1)
**Four rows ship:**
```sql
('expectancy_gates', 'reach_atr_max', '6.5'::jsonb,  'crypto_spot', '*', '*', 'strong_bull_trend', …),
('expectancy_gates', 'reach_atr_max', '6.5'::jsonb,  'xstock_spot', '*', '*', 'strong_bull_trend', …),
('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'xstock_spot', '*', '*', 'strong_bull_trend', …),
('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'crypto_spot', '*', '*', 'vwap_bounce',       …),
('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'crypto_spot', '*', '*', 'vwap_pullback',     …)
```
*(five VALUES lines, four distinct changes — `vwap_pullback` is an UPDATE from 2.44, the other three are new rows.)*
```sql
DELETE FROM module_constants
 WHERE module_name = 'expectancy_gates' AND constant_name = 'target_floor_pct';
```
**FOUR INVARIANTS, each raising rather than shipping a half-applied baseline:** (1) both ceilings landed **and neither is below its class default** — your binding-forward condition on the `2.4g-3` ratchet, enforced by a join rather than by a literal; (2) **every** seeded per-strategy `min_rr` stays ≤ its class `min_rr_unknown_floor`, so a drifted token is never more permissively treated than a known one; (3) the three seeded floors are strictly below 2.0; (4) `target_floor_pct` is gone **AND** the per-class `min_rr` default rows that inherit its fail-hard duty are present — *"DO NOT DEPLOY"* if not.

## 2. MODIFIED — the gate resolver, and the reason the deletion is not a deletion
`server/core/calculations/expectancy.ts`
```ts
// BEFORE
export function getPerClassTargetGate(assetClass: string, strategy: string): { floorPct: number; minRR: number; reachAtrMax: number } {
  const _classKey = { exchange: '*', assetClass, strategy: '*', regime: '*' };
  const floorPct = getCachedNumberRequired('expectancy_gates', 'target_floor_pct', _classKey);
// AFTER
export function getPerClassTargetGate(assetClass: string, strategy: string): { minRR: number; reachAtrMax: number } {
  const _classKey = { exchange: '*', assetClass, strategy: '*', regime: '*' };
  // B-REACH-BASELINE-ADJUST (P-6) — THE REPLACEMENT ASSERTION. Keep this FIRST and unconditional: the
  // per-class `min_rr` DEFAULT row exists for every active class and has NO global '*' fallback, so
  // requiring it here refuses an unresolved asset class exactly as the deleted read did. It is a
  // PRESENCE assertion — the value is deliberately discarded.
  getCachedNumberRequired('expectancy_gates', 'min_rr', _classKey);
```
⛔ **This is the whole reason the constant could not simply be dropped.** It was read FIRST, before canonicalization, so it — not `min_rr` — refused an unresolved asset class; and the `*_unknown_floor` rows **do** have a global `'*'` fallback, so removing it alone would have turned a hard failure into a silent permissive resolve on the (unknown class × drifted token) pair. **Your own reach migration's header called this out, and that is where I found it.**
`floorPct` also leaves the two `return` objects, the normalizer's input type, three call sites (`signal-orchestrator`, `vts-runner`, `xstock_spot/eval-cycle`), the provenance resolved-set, and the `b72-warmup` boot list.

## 3. MODIFIED — the provenance stamp, and what it costs
`server/services/data-archive/decision-provenance.ts`
```ts
-    const resolvedSet = { target_floor_pct: g.floorPct, min_rr: g.minRR, reach_atr_max: g.reachAtrMax };
+    const resolvedSet = { min_rr: g.minRR, reach_atr_max: g.reachAtrMax };
```
⚠️ **The hash changes at this deploy — and it would change anyway**, because the migration re-seeds two members of the same hashed triple. **The cohort split is attributable to the batch, not to the deletion**, and it is recorded so whoever next pools those rows is not surprised.

## 4. MODIFIED — the pinning test, and the mutation that proves it
`server/tests/unit/b-geometry-reach-baseline-per-strategy-reach.test.ts`
```ts
-  it('⛔ AN UNRESOLVED ASSET CLASS THROWS AT target_floor_pct BEFORE REACH IS EVER CONSULTED', () => {
-    expect(() => getPerClassTargetGate('some_future_class', 'garbage_token')).toThrow(/target_floor_pct/);
+  it('⛔ AN UNRESOLVED ASSET CLASS THROWS AT min_rr BEFORE REACH IS EVER CONSULTED', () => {
+    expect(() => getPerClassTargetGate('some_future_class', 'garbage_token')).toThrow(/min_rr/);
```
✅ **MUTATION-PROVED:** commenting out the one replacement-assertion line **fails this test** (re-run: 1 failed); restoring it passes **27/27**. ✅ **And the fixture no longer seeds `target_floor_pct` at all** — a resolver that still read it would fail *every* test in the file, so the deletion is proved by the suite rather than asserted.

## 5. BENCH
`tsc` baseline **377 = 377**. **54 passed** across the six affected files; the reach suite **27/27**.
⚠️ **`b63-item12-geometry-override.test.ts` fails on a DB connection inside `prefetchModule`. VERIFIED PRE-EXISTING with a control:** stashing my one-line change to that file reproduces the identical failure (4 skipped, 1 file failed) without it.

## 6. WHAT I WANT YOU TO LOOK AT HARDEST
1. **The replacement assertion.** It rests on a property of the DATA (the per-class `min_rr` default row has no global `'*'` fallback) rather than of the code. Migration invariant (4) pins it at apply time. **Is that enough, or does it want a code-side guard that cannot be un-seeded?**
2. **6.5 specifically.** The moment bound says ≤1.93 % of crypto's tail sits above it and 0.00 % of xStock's. **It is chosen to clear an undefined comparison, not to be tight — argue me up or down.**
3. **The withdrawals.** Six cells the scope proposed are not shipping, on a control (what the gates admit realises −1.61 % / −0.70 %) rather than on absolute P&L. **If you disagree with the control, four of the six change.**
4. **The crypto leg of OBJ-1, which I am least comfortable with.** It admits a cohort averaging −1.0 %: better than the control on both axes, still negative. **The rollback trigger is pre-registered in the audit and in the rollback file's header; it is not a promise made after the fact.**
