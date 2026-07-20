# DISCORD SESSION FINDINGS — RUNNING LIST (all four participants)
**Maintainer:** CC-C ("Claude Analyst") · **Opened:** 2026-07-20 · **Kyle directive:** *"record all of these (yours, Old Claude's, New Claude's and Langston's)… Keep a running list. And then note which ones have not been given an implementation batch."*
**Scope:** the 2026-07-19/20 overnight Discord session. **RUNNING — append, do not replace.**

**Verification key:** ✅ **FILED** = I read the entry in `1-system-manual/RUNNING_ISSUES.md` in the working tree. ⚠️ **CHANNEL-ONLY** = stated in Discord, *not yet* in any ledger file I can read. 🔁 = superseded/retracted.

---

## A. FILED AND HOMED — verified present in RUNNING_ISSUES.md

| # | Finding | Source | Implementation batch | Status |
|---|---|---|---|---|
| **#543** | The RegimeWeight admission gate **cannot reject** — reads an orphaned volatility cache, silently gets a constant | CC-A | `B-REGIME-INPUTS-LIVE` **+ paired `B-REGIME-INPUTS-SEAL`** (Langston ruling: generation-site wiring alone does NOT seal it; RTB refresh at `:884` still passes fabricated trend) | ✅ OPEN, batch named |
| **#544** | xStock price capture stopped 9s after a restart and stayed dead through the venue reopen | CC-B (evidence) + CC-A (entry) | Capture-never-starts fix; **entry CORRECTED** — capture self-healed, restart-first plan struck | ✅ OPEN, corrected |
| **#545** | **Verification discipline** — seven self-corrections in one night, none caught by a test | CC-A (filed *because Kyle asked*) | `B-VERIFY-DISCIPLINE` — Step-1 decides which rules can be **mechanically enforced** by a hook vs stay convention | ✅ OPEN, batch named |
| **#546** | **Placeholder-value family** — a stored `regimeWeight = 0` cannot come from the formula (0.1 clamp floor), so it means *never written*, not *scored zero* | CC-B | Folded requirement into #543; own number so it isn't buried | ✅ OPEN |
| **#538** | `trendStrength` is a hardcoded constant owning **70%** of a blocking gate's input | CC-A | Co-gated with #543 / SEAL | ✅ OPEN |
| **#541** | Phantom parameter — `historicalHoldTime` reads like trading history, is a hardcoded 60 | CC-A | Own home (Langston-directed) | ✅ OPEN |
| **#542** | **GDrive mount segfaults `git` writes** — one full index corruption; root cause of *four* lock incidents in one night | CC-B | Mount-instability entry | ✅ OPEN |
| **#535** | Langston's GO condition was proven only for Mechanism A | prior | **`B-RTB-REFRESH-CONSOLIDATE`** (newly homed tonight) | ✅ OPEN, batch named |
| **#531** | xStock weekend posture — no suspend/flatten/admission rule across the 48h closure | prior + crew | **`B-XSTOCK-WEEKEND-POSTURE`** (3-way consensus locked, Kyle-delegated) | ✅ Consensus locked |
| — | xStock exit-price plausibility (renamed from "fix D" after a naming collision) | crew | **`B-XSTOCK-EXIT-PLAUSIBILITY`** | ✅ Named |
| **#539 / #540** | EOL normalization decision · shared-tree commit discipline (3-tier attestation) | crew / Langston | `B-EOL-POLICY` · guard hook (live) | ✅ Standing |

---

## B. ⚠️ CHANNEL-ONLY — DISCUSSED, ENDORSED, **NOT YET IN ANY LEDGER FILE**
> **This is the answer to Kyle's question.** Every row below was raised, debated, and in most cases explicitly endorsed by Langston — and none of them has an issue number or a named batch that I can find in the working tree. **They exist only in Discord and in my findings document.** I am read-only and cannot file them.

| Ref | Finding | Source | Langston's position | Batch? |
|---|---|---|---|---|
| **CR-1** | **Decision-record retention asymmetry** — we permanently keep the reasoning for every trade we TOOK and discard it for every signal we REFUSED. The rejected population is the counterfactual Phase-25 calibration needs, and it is being destroyed continuously. | CC-C | **"Real and needs a home now, not a flag"** — ruled twice | ❌ **NONE** |
| **CR-2** | **Fee-drag dashboard metric is computed on inconsistent bases** — gross from intended entry price, net from actual fill; prints an impossible 154% on a Kyle-facing dashboard | CC-C | **Endorsed** — "legit data-quality bug" | ❌ **NONE** |
| **CR-3** | **Orphaned `target_floor_pct = 0.040`** — its consumer (the floor-LIFT) was deliberately deleted at reorg-B2.1; the row still reads like a live 4% rule and misled me into filing a false defect | CC-C | **Endorsed** — Rule 18 §15, *document-then-delete* | ❌ **NONE** |
| **CR-5** | **The admission-lane split must be written as a METHOD rule** where the next analyst hits it *before* drawing conclusions — pooling exploration with organic produces a false headline (it produced mine) | CC-C | **Endorsed as governance** | ❌ **NONE** |
| **NEW-1** | **The kernel pWin pin decision** — CC-B and Langston both *reversed* tonight under Kyle's "best for learning" criterion and now favour pinning; I conceded CR-7. **No batch carries this decision.** | CC-B → all | Concurs with the flip | ❌ **NONE** |
| **NEW-2** | **Organic-cohort collapse warning** — pinning to the measured base rate (~0.31) admits ≈1 organic trade across a five-day soak, extinguishing the organic-vs-exploration contrast that is currently the most informative structure in the data. A *learning* cost, not a money cost. | CC-C | Not yet ruled | ❌ **NONE** |
| **NEW-3** | **Guard-hook heredoc hang** — a loop that never terminates when command text contains a heredoc marker; hook runs on EVERY Bash call, so it affected all three sessions live | CC-A (self-reported) | — | ❌ **NONE** (hazard active) |
| **NEW-4** | **Guard-hook substring-match hole** — the guard blocked a message merely for *quoting* the phrase it matches; a control with known silent-bypass holes is live and its fix sits uncommitted | CC-A | — | ❌ **NONE** |
| **NEW-5** | **`MISS_ALERT_THRESHOLD` mis-wording** — gates on total misses but the alert says "at scale across symbols"; one hot symbol trips a false "at scale" alarm | Langston | Raised as a nit for SEAL | ❌ **NONE** (nit) |
| **NEW-6** | **Exhaustive-search rule** — an asserted absence must state *which surfaces were searched*, and **commit history is mandatory** for any "was this approved / when did this change" question | CC-C (from the CR-8 failure) | Proposed for #545 / `B-VERIFY-DISCIPLINE` | ❌ **NONE** |

---

## C. 🔁 RETRACTED / SUPERSEDED — recorded so they are not re-raised

| Ref | Claim | Outcome |
|---|---|---|
| **CR-8** | "The exploration budget was raised to 50 without Kyle's approval" | 🔁 **RETRACTED — FALSE.** Commit `ecf52e37d` (2026-07-15 15:32:44, author kylegjordan): *"daily_budget 28->50 both classes (Kyle explicit GO 2026-07-15 post-crew-debate; Langston pre-blessed as sample-size-only)."* **Kyle approved it.** Shrinks to: `exploration-lane.ts:4` carries a **stale comment** still reading "25-30/day". ⚠️ **Langston independently "confirmed" my false claim** — because we both searched the working tree + DB and neither searched commit history. *Two people checking the same incomplete surface is one search performed twice, not independent verification.* → **NEW-6** |
| **CR-7** | "Do NOT lower the assumed win rate" | 🔁 **CONCEDED.** Optimised paper P&L; the stated objective is learning. Superseded by **NEW-1**, qualified by **NEW-2**. |
| **#543's 41.11%** | "41% of signals fall below the floor" | 🔁 **RETRACTED by CC-A — wrong by ~600×.** It counted null-coerced zeros as rejections. Struck from #543. |
| **#534** | RTB shadowed-gates "discovery" | 🔁 Withdrawn earlier as a duplicate of a governed decision (#514) |

---

## D. THE PATTERN WORTH NAMING (Kyle's real question, answered honestly)

**Section A is healthy — CC-A filed diligently, and did so specifically because Kyle asked.** Section B is the gap, and it has a structural cause rather than a negligent one:

1. **Most un-homed items are MINE, and I cannot file them.** I am read-only. My four change requests were handed to CC-B mid-audit and to Langston in review; both endorsed them; neither has landed them, because both were mid-incident all night. **A hand-off is not a home** — the exact failure §9.4 exists to prevent, reproduced by an access boundary rather than by forgetfulness. This is direct evidence for the §6 write-access proposal in `PAPER_SOAK_ANALYSIS_2026-07-20.md`.
2. **Decisions taken in-channel have no filing ritual.** The pWin reversal (NEW-1) was a genuine, reasoned, three-party change of position — and it lives nowhere but Discord. Findings get numbers; **decisions do not**, and a reversed recommendation is exactly what a future reader will need and won't find.
3. **Tooling faults get announced, not filed.** NEW-3/NEW-4 were flagged fast and well in-channel — and a live hazard affecting all three sessions still has no entry.

**Recommended dispositions (owners to accept/amend — I hold no vote):** CR-1/CR-2/CR-3/CR-5 → one small governance-hygiene batch, owner TBD. NEW-1+NEW-2 → the decision record on whichever batch pins pWin; must not ship as channel-only. NEW-3/NEW-4 → the guard-hook fix already in flight. NEW-6 → `B-VERIFY-DISCIPLINE` (#545).

---

*Maintained by CC-C. Append new findings as they arise; move rows A↔B as they are filed; never delete a row from C.*
