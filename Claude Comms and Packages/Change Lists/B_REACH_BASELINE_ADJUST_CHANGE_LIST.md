# B-REACH-BASELINE-ADJUST — CHANGE LIST (Step 4 of 11)

**change-class: architecture** · row `3n.v` · owner **CC-B** · **implementation `cb763da5a`, Step-4 revisions `27fba4d56` and `4f5f54188`**
**Step 1 scope** `c156ac72f` (APPROVED, six conditions) · **Step 2 audit + plan** `99feb3d4a`, addendum `03b9a5197` · **STEP: 4 of 11 · NEXT STEP: 5 of 11**
⭐ **Langston Step-4: CHANGES-NEEDED → two blockers + four conditions, then a RULING that the xStock ceiling ships. All discharged; see §7.**

---

## 0. WHAT CHANGED SINCE THE PLAN YOU CLEARED — NOTHING SILENTLY
**The audit overturned the scope's own OBJ-3 and part of OBJ-2 before any code was written.** Five proposed ceilings became one; three proposed floors became one, plus two correctness seeds. **Every withdrawal carries its reason inside the migration header**, because a later reader will otherwise re-propose exactly those six.

## 1. NEW — `drizzle/migrations/2026-09-21-b-reach-baseline-adjust-geometry-baseline.sql` (+ rollback, out of git per §7.1)
**SIX rows ship across five cells** — r2: Langston reversed the xStock `vwap_pullback` withdrawal at Step 4 and it ships at 6.0:
```sql
('expectancy_gates', 'reach_atr_max', '6.5'::jsonb,  'crypto_spot', '*', '*', 'strong_bull_trend', …),
('expectancy_gates', 'reach_atr_max', '6.5'::jsonb,  'xstock_spot', '*', '*', 'strong_bull_trend', …),
('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'xstock_spot', '*', '*', 'strong_bull_trend', …),
('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'crypto_spot', '*', '*', 'vwap_bounce',       …),
('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'crypto_spot', '*', '*', 'vwap_pullback',     …),
('expectancy_gates', 'reach_atr_max', '6.0'::jsonb,  'xstock_spot', '*', '*', 'vwap_pullback',     …)
```
*(six VALUES lines across five cells — `crypto/vwap_pullback` is an UPDATE from 2.44; the other five are new rows.)*
```sql
DELETE FROM module_constants
 WHERE module_name = 'expectancy_gates' AND constant_name = 'target_floor_pct';
```
**SIX INVARIANTS, each raising rather than shipping a half-applied geometry baseline.**
⭐ **(4b) and (5) were Langston-ordered at Step 4, and both are mutation-proved against LIVE staging in a rolled-back transaction.** **(4b)** refuses to apply while a wildcard-`asset_class` `min_rr` row exists — because THAT, not the presence of the per-class rows, is what the moved fail-hard actually rests on. **(5)** pins `strong_bull_trend`'s stop 3.0 and target 6.0: **6.5 and 1.95 are functions of those two rows, nothing else pinned them, and `2.4g-5` is still open on exactly the lever that moves them.** ✅ **Mutation proof: flipping (5)'s expected target to 5.0 raises and aborts the transaction.** The original four: (1) both ceilings landed **and neither is below its class default** — your binding-forward condition on the `2.4g-3` ratchet, enforced by a join rather than by a literal; (2) **every** seeded per-strategy `min_rr` stays ≤ its class `min_rr_unknown_floor`, so a drifted token is never more permissively treated than a known one; (3) the three seeded floors are strictly below 2.0; (4) `target_floor_pct` is gone **AND** the per-class `min_rr` default rows that inherit its fail-hard duty are present — *"DO NOT DEPLOY"* if not.

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

## 7. WHAT THE STEP-4 ROUNDS CHANGED — so §6 below is read as the question it WAS, not as open
| his item | outcome |
|---|---|
| **BLOCKER-1** — the header still told the withdrawn story | ✅ **Already fixed one commit earlier** (`27fba4d56`, he read `03b9a519`). All three strings he cited are gone from the body; verified by grep at the ref. |
| **BLOCKER-2** — xStock `vwap_pullback`'s withdrawal is wrong | ✅ **REVERSED — it ships at 6.0.** The pooled control was 63 % one strategy; against its OWN admitted cohort the cell is better on both axes. |
| **BLOCKER-2b** — `range_trade`'s stated reason is false | ✅ Corrected in the header: 20 rows, not "fewer than 10"; withdrawn **on merits**. |
| **C-1** — pin the multipliers | ✅ **Invariant (5), mutation-proved.** |
| **C-2** — pre-deploy baselines, both classes | ✅ crypto −0.8981 % (n=50) · xStock −0.6664 % (n=41), recorded BEFORE the deploy; the admissions arm flagged as possibly unreadable on xStock. |
| **C-3** — the xStock pair ships together | ✅ Stated in the migration: under a 4.0 ceiling that floor is unexercisable by construction. |
| **C-4** — strike the stale lines inline | ✅ Struck in the audit BODY, not only in the addendum. |
| **rider (i)** — my epoch cut straddled two later bumps | ✅ Recut at every bump and **stated as the weaker reading**: control segments are n=12/14/33 and swing +2.556 % → −1.840 %. |
| **rider (ii)** — publish the control's n | ✅ **n=59**, beside the −0.171 %. |
| **`RULED ON REPORTED FACT`** on the counts | ⚠️ Noted: those legs are his-unverified and are labelled as such wherever they appear. |

## 6. WHAT I WANTED HIM TO LOOK AT HARDEST — and what he found
1. **The replacement assertion.** It rests on a property of the DATA (the per-class `min_rr` default row has no global `'*'` fallback) rather than of the code. Migration invariant (4) pins it at apply time. **Is that enough, or does it want a code-side guard that cannot be un-seeded?**
2. **6.5 specifically.** The moment bound says ≤1.93 % of crypto's tail sits above it and 0.00 % of xStock's. **It is chosen to clear an undefined comparison, not to be tight — argue me up or down.**
3. **The withdrawals.** Six cells the scope proposed are not shipping, on a control (what the gates admit realises −1.61 % / −0.70 %) rather than on absolute P&L. **If you disagree with the control, four of the six change.**
4. **The crypto leg of OBJ-1, which I am least comfortable with.** It admits a cohort averaging −1.0 %: better than the control on both axes, still negative. **The rollback trigger is pre-registered in the audit and in the rollback file's header; it is not a promise made after the fact.**
