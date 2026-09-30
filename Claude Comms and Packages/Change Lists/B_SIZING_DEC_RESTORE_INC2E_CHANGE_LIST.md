# B-SIZING-DEC-RESTORE — increment 2e change list (Step 4): Kyle's 2026-09-30 sizing directives

## Dispatch header (the three fields)
- **Declared change-class:** `sub_batch` (increment of `B-SIZING-DEC-RESTORE`, whose class is `architecture`; the doc set is the parent's).
- **The class's doc set:** scope `B_SIZING_DEC_RESTORE_SCOPE.md` (present; `:16` updated, condition 4) · pre-audit + plan `B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §19-§20.6 (present) · this change list (present) · `DELETED_COMPONENTS_LOG` 2e entry (present) · SIM + System Manual content, BATCH_CATALOG, PHASE_HISTORY, completion report, task list, Langston's MEMORY — **Step 10, owed** (not ticked).
- **Step-2 reference:** PRE_AUDIT §20 (plan), §20.4 (your two rulings folded), §20.5 (re-derivable legs); PROCEED to Step 3 at 00:23Z with seven conditions.

## What 2e is
Kyle's directives of 2026-09-30, as one increment for the ≥ 2026-10-02T20:10Z window: no limit on the max position % (2b's floor withdrawn), no backup sizer, the never-filled cooldown pinned as it is, the cap's split off, the pattern size cap off, the correlation shrink out (your J1b), the AI chat's action path deleted, and the size factors that are not settings shown read-only on the Guardrails tab.

## As built — see PRE_AUDIT §20.6 (item by item, against conditions 1-7 and C1-C6)

## Tests and mutations
- New behaviour tests: split removed (a formerly-exempt symbol is capped; no `cohort` on the decision); resolver identity; a pattern and a quant signal at `p` = 20 size identically ($582); both classes size at $2,425 in the cascade; the never-filled pin + its control (CI Postgres).
- Source-text (labelled): the fallback sizer is gone and its `else` refuses (`SIZING_INVALID`, one alert per engine session).
- Fence: five removal patterns + one positive control over the survivors (68 pass).
- **Mutation-proved locally:** re-adding the split branch fails 1; a cap back in the resolver fails 3. The never-filled mutation runs on a temporary CI branch.
- tsc 367 → 339 (all 28 from the deleted chat code; `routes.ts` still reports 111), baseline synced.

## Judgement calls to attack
1. The reset script's precondition — I re-pointed it from 2b's floor to increment 1's range; it was not in §20's census.
2. The refusal alert's dedupe key uses the engine session START; a restart mints a new key. Is that the right grain?
3. Keeping the sizer's `sourcePool`/`assetClass` params as record-only inputs rather than dropping them.
