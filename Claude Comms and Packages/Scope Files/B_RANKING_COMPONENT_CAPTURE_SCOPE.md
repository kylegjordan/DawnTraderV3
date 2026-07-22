# B-RANKING-COMPONENT-CAPTURE — SCOPE (#555)

**change-class: non_architecture**
**Owner:** CC-A · **Review:** Langston · **Date:** 2026-07-22 · **Issue:** #555

---

## ⚠️ 0. HONEST PROVENANCE — THIS SCOPE IS RETROACTIVE

**This document was written AFTER the batch shipped, and that is a process failure I am recording rather than concealing.** The work did not begin as a scoped batch: it emerged mid-investigation while checking the retirement gate for a *different* item (Mechanism-A retirement), and I carried it through implementation, review, and deploy without ever stopping to write Step-1/Step-2 artifacts. The governance checker caught all seven doc-gaps (`1159d20a`, `4611f05c`, `c295f97e`, `90ca23cf`, `1d58bce7`, `aaca157a`, `2545beb3`) — correctly.

Nothing below is invented to look pre-hoc. It records what was actually scoped and verified, in the order it actually happened. **The lesson: a finding that turns into a code change is a batch, and it needs its scope written at the moment it stops being a diagnosis — not after it deploys.**

## 1. CHANGE-CLASS DECLARATION + JUSTIFICATION

**Declared: `non_architecture`.** The checker defaulted to `architecture` because no class was declared (fail-closed — correct behaviour).

Reasoning, offered for Langston to overrule: the batch changes **where a telemetry value is read from** and **removes three dead DB columns**. It does not change strategy logic, regime detection, filter design, the signal pipeline, or any quantitative math. Admissions gate on the live in-memory value throughout and were never touched. Per CLAUDE.md §3/§9 ("a display/data-quality service is SIM-scope, not SysManual-scope"), this is a data-capture/telemetry change.

⇒ **SIM: APPLICABLE** (a component's read-source changed; three columns removed).
⇒ **SYSTEM_MANUAL: proposed N/A** — no architecture/strategy/regime/filter/pipeline/math change. **Requires Langston confirmation via GOVERNANCE_EXCEPTIONS.md; not self-certified.**

## 2. THE PROBLEM

The shadow-pairing selection-quality record — the dataset behind the "did we pick the best?" view — stored **NULL for 3 of the 4 ranking components on every row**. Measured: 14,232 rows; `final_score` 14,232/14,232 non-null; `regime_weight` / `hybrid_score` / `decay_penalty` all **0**. A calibration record blind to three of four ranking inputs cannot evaluate the ranking decision it exists to evaluate.

## 3. OBJECTIVES

1. **OBJ-1** — re-point the three reads from the (NULL) columns to `metadata`, the established SSOT for these derived components in that same builder.
2. **OBJ-2** — populate `regimeWeight` + `decayPenalty` at insert so rows are born populated (into **metadata**, never the columns — populating columns would recreate the two-location split-brain being removed).
3. **OBJ-3** — correct the stale `routes.ts` "DORMANT (rtb_total=0 → no rows)" comment, false at 14,232 rows and actively pointing triage at the wrong disposition.
4. **OBJ-4** — DROP the three now-zero-reader columns + storage mapping + schema entries, with forward and rollback migrations.
5. **OBJ-5 (follow-up)** — remove the `?? confidence` substitution from both refresh sites; absent stays absent (honest-null).

**EXPLICITLY OUT OF SCOPE:** `regimeWeight` as a *gate* (live, gating at 0.30 — untouched); the retired-score REMOVAL question (homed separately as #558); the promotion-path-only capture cadence (surfaced, not scoped).

## 4. VERIFICATION CRITERIA

- tsc baseline clean after schema-column removal (the machine-checked reader census).
- Reader census independently re-derived by Langston at the graded ref, not taken on report.
- No DB-side dependency (views/matviews) on the dropped columns.
- Deploy ordering: code first, migration second.
- ⚠️ **Non-null capture OBSERVED in a live row** — *this criterion was NOT met at close and was explicitly not claimed;* the capture runs only on the promotion path and no promotion occurred in the window.

## 5. RISKS ACCEPTED

- Dropping DB columns is irreversible in data terms — accepted because every row was NULL for the columns' entire existence (nothing to lose), with a rollback migration restoring shape.
- OBJ-5 lowers `refreshedFinalScore` by `confidence × 0.4` systematically. Accepted because the finalScore gate is retired and neither the live `r_multiple` ranker nor `decideMakerTaker` reads it. **My first justification for this was FALSE and Langston rejected it — see the completion report.**
