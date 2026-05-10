# BATCH 79.0j — ORB constant rename: risk_reward_ratio → target_range_multiple

> **Status:** AWAITING LANGSTON STEP 1+2 COMBINED REVIEW (small scope justifies abbreviated workflow)
> **Author:** Claude Code
> **Created:** 2026-05-10
> **Resolves:** RUNNING_ISSUES #90
> **Origin:** Langston B79.0d Step 4 F1 finding — current naming is misleading.

---

## 1. Why this batch

ORB module_constant `risk_reward_ratio = 2.0` is a misnomer. The code uses this value as a multiplier on **range height** to compute target distance: `targetPrice = entryPrice + RATIO * rangeHeight`. But the actual realized R:R is NOT 2.0 — it's roughly 1.3:1 because the actual risk = `entryPrice − rangeLow` is greater than `rangeHeight` once the breakout has cleared the range top. The constant should be named for what it actually IS (a multiplier of range height for target distance), not what its label promises (a reward-to-risk ratio).

Documented inline at `server/strategies/orb.ts:27-33` design comment + `scripts/b79-0d-orb-thresholds-seed.sql:33` line comment as deferred-to-B79.x. This batch closes the deferral.

---

## 2. Numbered objectives

1. **Rename DB module_constant key** `strategy.orb.xstock_spot.orb.*.risk_reward_ratio` → `target_range_multiple` via single atomic UPDATE on `module_constants`. Same value (2.0), same scope, same all other columns. The `constant_name` column changes; nothing else.

2. **Rename code reference** `c['risk_reward_ratio']` → `c['target_range_multiple']` at `server/strategies/orb.ts:193`.

3. **Rename local variable** `ORB_RR_RATIO` → `ORB_TARGET_RANGE_MULT` at `server/strategies/orb.ts:193` and 2 usage sites at lines 250 + 255.

4. **Update comment** at `server/strategies/orb.ts:27-33` to remove the "queued for B79.x rename" note (no longer queued — landed) and clarify the math: target distance = `target_range_multiple × rangeHeight`.

5. **Update seed SQL comment + key** at `scripts/b79-0d-orb-thresholds-seed.sql:33-34`. The committed-not-executed seed script gets the new key name so future fresh deploys seed the renamed constant. (Live staging DB also gets the UPDATE — they end up consistent.)

6. **Update test fixture** at `server/tests/unit/b79-0d-orb.test.ts:24` from `risk_reward_ratio: 2.0` → `target_range_multiple: 2.0`.

---

## 3. Non-objectives + invariants

- **No behavior change.** Same value 2.0, same math, same target-price computation. Pure rename.
- **No new tests.** The existing 10 B79.0d tests still pass with the renamed key in the fixture.
- **No effect on already-fired ORB signals.** Currently zero (ORB goes hot Monday 14:30 UTC). Even after Monday, the constant value is unchanged so existing signal_eval_archive rows stay valid.
- **No effect on other strategies.** ORB is xstock_spot-only; no other strategy uses this constant.
- **Crypto regression: NONE by-construction.** ORB doesn't run for crypto.

---

## 4. Verification (Step 7)

| # | Check | Expected |
|---|---|---|
| G1 | TypeScript Check + Build + Test Suite + Docker (CI) | Build + Docker green. TS+Test legacy-red baseline (no NEW errors). |
| G2 | DB UPDATE applied on staging | `SELECT constant_name, constant_value FROM module_constants WHERE module_name='strategy.orb' AND asset_class='xstock_spot' AND constant_name='target_range_multiple'` returns one row with value `'2.0'::jsonb`. Old `risk_reward_ratio` row returns zero rows. |
| G3 | PM2 logs post-restart | No `[B79.0d]` or `[ORB]` errors; module-constants service resolves new key cleanly. |
| G4 | xstock_spot regime cadence baseline | Crypto no-touch fence on `regime_factor_alternates` cadence holds (≥80% of pre-deploy baseline). |
| G5 | Optional Claude-in-Chrome smoke | xStocks tab renders without errors; not strictly necessary since this batch doesn't change UI. |

---

## 5. Implementation plan (Step 3)

Sequenced single-commit ship:

1. Run staging DB UPDATE (apply BEFORE code deploy so the constant exists by the new name when the renamed code reads it):
   ```sql
   UPDATE module_constants
   SET constant_name = 'target_range_multiple', updated_at = NOW(), updated_by = 'b79.0j-rename'
   WHERE module_name = 'strategy.orb'
     AND asset_class = 'xstock_spot'
     AND constant_name = 'risk_reward_ratio';
   -- Expect: UPDATE 1
   ```
2. Edit `server/strategies/orb.ts`: lines 27-33 comment + 193 const + key + 250 + 255 usages.
3. Edit `scripts/b79-0d-orb-thresholds-seed.sql`: lines 33-34 (key + comment).
4. Edit `server/tests/unit/b79-0d-orb.test.ts`: line 24 fixture.
5. Run TypeScript locally (we can't — Drive mount + no node_modules — but CI catches).
6. Push → CI → deploy → G1-G4 verify.

**Rollback:** Single UPDATE reversal:
```sql
UPDATE module_constants SET constant_name = 'risk_reward_ratio', updated_at = NOW(), updated_by = 'b79.0j-rollback'
WHERE module_name = 'strategy.orb' AND asset_class = 'xstock_spot' AND constant_name = 'target_range_multiple';
```
Plus `git revert` of the code commit.

---

## 6. Open questions for Langston

Q1. **Single-commit vs split-commit.** This is small enough I propose single commit covering DB script + code + test fixture together. Alternatively split-commit would be: (a) commit DB-only ALTER script + apply on staging, (b) verify constant reads cleanly under old code (bridge state), (c) commit code rename. Single is simpler; split is safer if anything goes wrong mid-deploy. Given ORB hasn't fired yet (Monday 14:30 UTC first fire), there's no actively-running consumer to break — single-commit is acceptable.

Q2. **Should I also update `BATCH_79_0d_COMPLETION_REPORT.md` paper trail noting the rename landed?** Tracker placeholder convention says yes — append a closure line. Lean: yes, do it.

Q3. **Step 1+2 combined OK for this scope?** Workflow ceremony is overkill for an 8-line rename. Asking for combined scope+pre-audit review since the impact analysis is trivially "rename only, no math change."

Q4. **Should the rollback SQL be committed alongside the forward SQL?** Convention from B79.0e was yes (rollback symmetry per Langston). For a 1-line UPDATE the rollback is also 1 line — yes, commit both.

---

## 7. Governance

- BATCH_CATALOG.md row for B79.0j
- PHASE_HISTORY.md sub-batch row
- RUNNING_ISSUES.md #90 marked RESOLVED with closure note
- BATCH_79_0d_COMPLETION_REPORT.md closure line appended (per Q2)
- BATCH_79_0j_COMPLETION_REPORT.md
- MEMORY.md (CC + Langston) — drop next-step pointer; add B79.0j closure row
