# B-RANKING-COMPONENT-CAPTURE (#555) — COMPLETION REPORT

**change-class: architecture** · **Owner:** CC-A · **Review:** Langston · **Date:** 2026-07-22
**Commits:** `785863921` (main) + `09bea840e` (hybridScore follow-up) · **CI:** all-4-green both · **Deployed + migration applied.**

---

## 1. WHAT WAS WRONG

The shadow-pairing **selection-quality** record — the dataset behind the "did we pick the best?" view — was storing **NULL for 3 of the 4 ranking components on every row** (measured: 14,232 rows; `final_score` 14,232/14,232 non-null; `regime_weight`/`hybrid_score`/`decay_penalty` all **0**). A calibration record that cannot see three of the four inputs to a ranking decision cannot evaluate that decision.

**Mechanism:** the capture read the `rtb_signals` **columns**, which were NULL from birth — the queue-insert builder enumerates 26 fields and never included these three, so the storage upsert mapping was fed `undefined` forever, while the refresh wrote the recomputed values only into `metadata`.

**No trading-behaviour defect at any point:** admissions gate on the live in-memory value throughout.

## 2. WHAT SHIPPED

1. **Re-point** the three reads to `metadata` — the block's own idiom (`meta.atr`/`meta.sourcePool`/`meta.rankingScore` already read that way); the three column reads were the anomaly.
2. **Born-populated at insert** for `regimeWeight` + `decayPenalty` (into metadata, NOT columns — populating columns would have resurrected the two-location split-brain being removed). `decayPenalty: 0` documented as the TRUE admission value (λ × ageMinutes, age 0 at admit), not a placeholder.
3. **Stale comment corrected** on the consumer — it claimed "DORMANT (rtb_total=0 → no rows)", false at 14,232 rows, and pointed the next triager at exactly the wrong disposition (delete a live capability).
4. **Dropped** the three now-zero-reader columns + storage mapping + schema entries, with forward and rollback migrations.
5. **Follow-up (`09bea840e`):** removed the `?? confidence` substitution from BOTH refresh sites — it wrote confidence under the hybridScore NAME and was written back into metadata, making it permanent and indistinguishable from a real hybrid score. Absent now stays absent.

## 3. VERIFICATION

- **tsc baseline clean** after removing three schema columns — the machine-checked version of the reader census; a missed consumer would have failed loudly.
- **Reader census independently re-derived by Langston** at `58d8f8f94`, not taken on report: exactly three column reads, all in the one capture block.
- **No DB dependency:** live `pg_depend`/`pg_rewrite` query returned zero views/matviews on `rtb_signals`.
- **Test suite:** 2,355 passed. 10 files fail at collection on a DB connect; **A/B'd against a pristine checkout — they fail identically without these changes** (bench has no DATABASE_URL).
- **Deploy:** code first, migration second (ordering is load-bearing); columns confirmed gone, table healthy, staging HTTP 200.

⚠️ **NOT YET VERIFIED — stated honestly:** no calibration row has been written since deploy, so **non-null capture is not yet demonstrated**. The capture runs only on the promotion path, and with 15 positions open and no free slots there have been no promotions in ~7 hours. Code is in and independently reviewed; the proof needs a slot to free. **This batch is NOT claiming observed acceptance.**

## 4. ERRORS I MADE, ON THE RECORD

1. **False equivalence claim (Langston Step-4 CHANGES-NEEDED).** I justified the substitution removal as behaviour-neutral because `calculateFinalScore` applies the same fallback. **That function is not on this path** — the refresh inlines its own formula with `(hybridScore ?? 0)`, so `refreshedFinalScore` drops by `confidence × 0.4` systematically. I verified against a plausible-looking function instead of the one actually executing — the exact error class being caught in greps and citations all week. The conclusion (safe) survived for a *different* reason: the finalScore gate is retired and neither the live `r_multiple` ranker nor `decideMakerTaker` reads it. **"Safe because the gate that would have cared is retired" ≠ "safe because equivalent."**
2. **Overstated urgency.** I reported the sink as "actively accumulating, newest row minutes old." Measured properly it was **6.45 hours** old and writes in bursts. Corrected to Langston unprompted; it did not affect his ruling (which rested on the census) but my framing was wrong.
3. **Sent a description instead of a diff** for Step-4 review. Corrected — the real diff, in two parts because the migrations are gitignored and invisible to both `git diff` and `git status`.

## 5. FOUND ALONG THE WAY (not fixed here)

- **Two stale invariant comments** in the same function claimed the decayed score feeds `decideMakerTaker`'s `signalStrength` and the ranker. Both false (it takes the `flat_pwin_base` CONFIG value; the live ranker is `r_multiple`). Langston ruled these corrected in-place — done in `09bea840e`. Third and fourth stale comments this lineage has produced.
- **The capture only runs on the promotion path**, so while the system sits at position capacity it records nothing for calibration. Possible real gap in what is being collected — **surfaced, not scoped.**
- **★ KYLE STANDING DIRECTIVE (restated 2026-07-22):** the retired scores (`finalScore`, `hybridScore`) should be **REMOVED**, not maintained. This batch made them *honest*; Kyle's position is they should be *gone*. Their continued presence keeps generating work like this. **Needs its own removal batch** — noted as the correct disposition, not actioned here.

## 6. GOVERNANCE FILES UPDATED
`DELETED_COMPONENTS_LOG.md` (the column drop, with blast-radius + deploy ordering) · `RUNNING_ISSUES.md` (#555) · this report.

## 7. STATUS
**Code complete, reviewed, deployed, migration applied.** Acceptance observation pending a promotion. Not claimed as verified.
