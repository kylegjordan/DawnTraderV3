# OBJ-6b measurement instruments — B-MEASURE-GATE leg 2

These are the scripts **as run**, committed so the gate result can be re-derived rather
than taken on report. Result: `Claude Comms and Packages/Scope Files/B_MEASURE_GATE_LEG2_OBJ6B_RESULT.md`.

⛔ **THEY ARE NOT PORTABLE AND ARE NOT MEANT TO BE.** They carry absolute paths to this
laptop's clone and to the session-transcript store under `~/.claude/projects/`. They are
committed for **reproduction of a specific measurement at a specific ref**, not for reuse.
Anyone re-running them on another machine must re-point the paths and should expect
different numbers, because the corpus grows.

Run order — each writes JSON the next one reads:

| # | script | what it establishes |
|---|---|---|
| 1 | `obj6b_pop.py` | pins the population at one ref from one walk; excludes `MISTAKE: none` **and says so** |
| 2 | `obj6b_attr.py` | instrument 1 — attribution from commit bodies; **reports an UNATTRIBUTED bucket rather than forcing every row into a class** |
| 3 | `obj6b_cover.py` | instrument 2's **reach**, per commit, before its output is read as evidence |
| 4 | `obj6b_tools.py` | instrument 2 — tool distribution, erroring windows vs baseline |

★ **`obj6b_cover.py` replaced an earlier check that tested the corpus HULL instead of
per-commit coverage.** Both give the same answer here; only one of them was evidence.

⚠️ **`obj6b_tools.py` prints its baseline as ALL sampled activity, which CONTAINS the
erroring windows.** The result document reports the corrected windows-vs-NON-window
contrast (+11.1 pp), not the contaminated one the script prints (+9.9 pp).

---

## ⛔⛔ `r2` — SCRIPTS 5 AND 6 REFUTED THE RESULT SCRIPTS 1-4 PRODUCED

| # | script | what it establishes |
|---|---|---|
| 5 | `obj6b_control.py` | ⛔ **THE CONTROL THAT KILLED THE HEADLINE.** Same era, same window shape, around commits carrying NO trailer. **Enrichment `+0.3 pp`, not `+11.1 pp`.** Also proves confound (i) at the object: three of six sampled transcripts contribute ZERO era calls. |
| 6 | `obj6b_counts.py` | the `%b`-vs-`%B` field split (189/90 vs 190/91), trailers-vs-commits (90 trailers on 87 commits), the empty `MISTAKE: none` exclusion, and that the per-commit coverage test has **ONE distinct covering-set** and therefore cannot discriminate |

⚠️ **`obj6b_tools.py` (4) IS KEPT AS RUN, INCLUDING ITS CONTAMINATED BASELINE.** Its `else` branch already contains the correct conclusion — that the finding would be *"true and nearly vacuous"* — and it did not fire because the comparison fed to it was wrong. **It is left unmodified because that is the evidence.**
