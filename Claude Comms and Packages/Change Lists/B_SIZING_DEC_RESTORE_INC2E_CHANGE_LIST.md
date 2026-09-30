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

## Step-4 gate A1 — APPROVED with four conditions (Langston); conditions built — PRE_AUDIT §20.8
- **Pe1's premise, measured (his read):** staging `_migrations` 170 rows, a 2026-09 `b-*` file present as the positive control, **0 rows matching `%b-sizing%`**; `guardrails_v2` has no increment-1 range constraint and still has `max_open_positions_check` + `portfolio_risk_per_trade_pct_check` ⇒ 1/2a/2b/2c/3 all undeployed; withdrawing 2b's pair orphans nothing.
- **Pe2's "never used", with its window:** 0 fallback/sizing-failure markers against **942 `TRUST_SIZED` in 12.2 h** of staging stdout (2026-09-29T13:37:47Z → 09-30T01:50:21Z). A rate bound, not an event proof.
- **C1 (code):** the refusal alert's key no longer collapses to a constant with no session — a per-process boot token, stamped once.
- **C4 (comments):** fourteen stale "A/B cohort marker" comments corrected, not the three named.

## Step-4 gate A2 — CHANGES-NEEDED; all addressed — PRE_AUDIT §20.9
- **The magnitude (condition 2):** the removed pattern-list cap read **0.0667 on both classes since 2026-07-16**, not the narrated 0.15 / 0.50. At `p = 20` pattern positions go from 6.67% to 20% (×3) until the reset; at the reset's `p = 5` the cap would not have bound.
- **Blocker 1:** a SWEPT fence — every `deriveSlotCount(` in the codebase goes through the resolver (876 files, 5 occurrences; mutation-proved).
- **Blocker 2:** the tab now says the final amount is rounded down to the exchange's lot size.
- **Finding 1:** the buffer and the per-coin rule read independently; one unreadable row no longer hides the other.
- **Finding 2:** `sourcePool` and `assetClass` dropped from the sizer's inputs (unread since 2e).
- **Condition 1:** the orphan rows are deleted by the 2e migration (gate A1); the six doc lines naming the lever are Step-10 debts.
