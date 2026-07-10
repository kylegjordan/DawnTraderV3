# B-ALERT-LIFECYCLE — disposition table for the four acked-but-unresolved alerts

**Author:** CC-B · **Date:** 2026-07-10 · **Reviewer:** Langston
**Verdict: NONE of the four earns a `resolve`.** Three are NO-EVIDENCE; the fourth was verbally waved through with no data.

## Structural finding (the real headline)
All four are **alert-gated** verifications: a batch closed by SCHEDULING an alert to perform the live/at-scale check later, and **nobody ever wrote the result back**. The status fields still literally read "alert-gated," never upgraded to "confirmed." This is **one process gap that produced four instances**, not four independent data gaps.

Files checked (so the negatives are credible): `RUNNING_ISSUES.md`, `CHANGES_AND_FIXES.md`, `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `Batch Completion/{BATCH_B_NEW_53_1,BATCH_B_NEW_53_2,B_4_7,B_4_6B_CHUNK_B}_*.md`, and both Telegram archives.

---

## 1. `6f8db90b` — B-NEW-53.1: crypto admitted 13 fields still 100% AT SCALE (2026-06-08T14:00Z)
**VERDICT: NO EVIDENCE FOUND.** Only n=1 confirmed.
- Set, future tense — `Batch Completion/BATCH_B_NEW_53_1_COMPLETION_REPORT.md:10`: "the first post-deploy admitted row (ESPORTS/USD, 02:38Z) populated all 13 at 100% … **A broader re-confirm alert (2026-06-08T14:00Z) re-checks at scale.**"
- `CHANGES_AND_FIXES.md:199`: "**A broader re-confirm system-alert (2026-06-08T14:00Z) re-checks across the accrued sample.**"
- Never upgraded — `RUNNING_ISSUES.md:684`: "live-data confirm **alert-gated**" · `BATCH_CATALOG.md:318`: "**alert-gated on sparse-cadence accrual**"
- **Missing:** the 14:00Z at-scale output (row count + %-populated across the accrued sample).
- **Supersession hypothesis REJECTED (Langston, and correctly):** the later parity re-run (`7362f63f`) measured **provenance coverage** — 100% of 1.64M base decisions carry a provenance record. That is a **different property** from "the 13 crypto admission fields are each populated at 100% across admitted rows at scale." Provenance-present ≠ fields-populated; both can be true, or the first true and the second not. To count as the confirmation it must actually query the 13 fields' population rate over a meaningful admitted-crypto n. **No such query exists → #1 is OPEN WORK.**

## 2. `c2aa2940` — B-NEW-53.2: xStock at-entry block populated LIVE (2026-06-08T16:00Z)
**VERDICT: NO EVIDENCE FOUND.** Confirmation is code/deploy-only.
- `Batch Completion/BATCH_B_NEW_53_2_COMPLETION_REPORT.md:10`: "Live confirmation is **alert-gated (2026-06-08T16:00Z)** because xStock admitted cadence is sparse (~5/hr; 0 rows in the first post-deploy minutes is expected)."
- :37: "The `B-NEW-53.2 live confirm` alert: … **if green** … CLOSED; **if still blank** … reopen #208."
- Never upgraded — `RUNNING_ISSUES.md:687`: "RESOLVED (code) … **live-confirm alert-gated**" · `BATCH_CATALOG.md:317` / `CHANGES_AND_FIXES.md:194`: "**Live-confirm alert-gated** (sparse xStock admitted cadence)."
- **Missing:** any record that a real post-deploy xStock admitted row populated the block. The "if green → CLOSED" branch was never taken.

## 3. `da0c24b8` — B-4.7 R2 closure: first fresh TFS/IE `strong_bull_trend` admit (2026-06-12T19:00Z)
**VERDICT: NO EVIDENCE FOUND.** (OLD Claude claimed this alert; citation provided so he need not re-derive it.)
- `Batch Completion/B_4_7_COMPLETION_REPORT.md:32`: "**R2 full closure:** first fresh TFS/IE strong_bull_trend admit through chunk-B code (**both classes sat in STRUCTURAL_TRANSITION all post-deploy**) — system-alert `b47_sbt_fresh_admit` **fires 2026-06-12T19:00Z.**"
- `CHANGES_AND_FIXES.md:3788`: "…**R2 full-closure alert: `b47_sbt_fresh_admit`.**" (names the alert, no result)
- No `b47_sbt_fresh_admit` result in `RUNNING_ISSUES.md`, `CHANGES_AND_FIXES.md`, `PHASE_HISTORY.md`, or either Telegram archive. (`#217` is B-4.7 but concerns CONTEXT_BONUS, not the SBT fresh-admit.)
- **Missing:** evidence a fresh `strong_bull_trend` actually admitted through the chunk-B code once regimes left `STRUCTURAL_TRANSITION`. The code path deployed but was **never observed exercising**. → **re-home, do not resolve.**

## 4. `06532d55` — B-4.6-B formal 24h gate read on the AMENDED gate (2026-06-13)
**VERDICT: PARTIAL — a prose "passed" claim exists; NO formal data-backed ruling.** This is the worst of the four: Kyle personally accepted the gate amendment.
- Amendment recorded — `RUNNING_ISSUES.md:724` (#225): "**RESOLVED BY AMENDMENT (Kyle accepted 2026-06-12): the obj-3 max<250ms clause was replaced by the PINNED RESIDUAL CEILING** = (≈8 events/h, p50 191ms, max 554ms, 29/691 intervals ≥250ms)."
- Completion report **still open** — `Batch Completion/B_4_6B_CHUNK_B_COMPLETION_REPORT.md:3`: "**Status: COMPLETE pending the formal 24h gate read (scheduled alert) + Kyle ACK.**"
- The ONLY trace it ran is prose — Telegram archive [16:43 2026-06-13]: "the **24-hour check** on the recent scan-stall fix **passed cleanly on every measure**, nothing to reopen."
- **Missing:** the formal recorded 24h read (actual rate / p50 / max / interval counts) and an explicit **PASS ruling against the pinned ceiling**. `#225` remains OPEN carrying only the ~6h post-deploy sample + 11.5h baseline; no `CHANGES_AND_FIXES` closure entry exists.
- **Per rule-13 that prose claim is not decision-grade — it is not even a snapshot, it is an assertion.**

---

## Proposed disposition (Langston to rule)
| # | Alert | Verdict | Action |
|---|---|---|---|
| 1 | `6f8db90b` | NO EVIDENCE | REAL OPEN WORK — run the 13-field population query over a meaningful admitted-crypto n |
| 2 | `c2aa2940` | NO EVIDENCE | REAL OPEN WORK — confirm against a real xStock admitted row |
| 3 | `da0c24b8` | NO EVIDENCE | OLD Claude's — re-home, don't resolve |
| 4 | `06532d55` | PARTIAL (prose only) | REAL OPEN WORK — re-run the formal 24h read and RULE with data vs the pinned ceiling |

**Home (§13, per Langston): ONE dated re-verification batch** that re-runs each at-scale query live against staging and **writes the result back**, with the explicit rule that each status field flips from "alert-gated" to **"confirmed (query, n, date)"** or **"reopened"** — never left as-is. Reopening #208 in RUNNING_ISSUES is not a home; it is a loop. That closes the **process** gap, not just the four instances.
