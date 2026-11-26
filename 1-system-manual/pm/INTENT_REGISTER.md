# PM intent register

> One entry per agreed batch. Kyle's words are quoted only from the named source; PM explanations are labelled. Earlier intent is retained when superseded.

## Entry format

### `<BATCH-ID>` — `<plain name>`

- **Owner:**
- **Agreed date and source:**
- **Kyle's words:**
- **PM explanation:**
- **Done means to Kyle:**
- **Scope:**
- **Completion report:**
- **Supersedes / superseded by:** none

## B-PM-CLAUDE — PM coordination machinery

- **Owner:** PM Claude; PM Codex while the Codex crew is on duty
- **Agreed date and source:** 2026-11-04, `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`; updated 2026-11-10 by Kyle's PM Codex chat instruction, KD-68
- **Kyle's words:** *"I need you to be my eyes, my ears, my voice, and to keep everything moving according to our pre-sprint and sprint task lists."*
- **PM explanation:** Give Kyle one project manager that can see the whole plan, keep each owner aligned to batch intent, route decisions and reviewer rulings, identify real stalls, and explain progress in the context of getting the foundational trading machinery and calibration evidence ready for profitable, risk-contained live operation.
- **Done means to Kyle:** The PM role, records, routine skills, transition tools and pruning work for both PMs; crew state is sourced and visible; stalls and drift are acted on within the agreed limits; no historical PM record is lost.
- **Scope:** `Claude Comms and Packages/Scope Files/B_PM_CLAUDE_SCOPE.md`
- **Completion report:** pending batch close
- **Supersedes / superseded by:** none

## R-SBT-XSTOCK-PUBLISHED-BASELINE — Defensible SBT xStock starting baseline

- **Owner:** NEW Claude for mechanism/current-setting provenance and plan integration; ANALYST Claude for published-practice and DawnTrader empirical comparison; Coltrane for transferability review
- **Agreed date and source:** Kyle's original question, PM Desktop transcript 2026-11-06 13:13Z; restored by Kyle in PM Codex chat 2026-11-12 after Coltrane's agreement, KD-73
- **Kyle's words:** *"look at industry standards, what reputable trading firms are doing, and seeing if there's anything that we could start with that we could provide sensible logic for a start on, and then we're monitoring that and have better data to then calibrate with later."*
- **PM explanation:** Reconcile the generic August target-geometry research with the narrower question it did not settle: whether reputable published 15-minute equity momentum/trend practice supplies a defensible starting range for strong_bull_trend on xStock after DawnTrader's much higher costs, operating balance, position sizes, slot limits and clean post-entry-gate outcomes are applied. This is evidence for later calibration, not permission to change a live value.
- **Done means to Kyle:** Each comparable source states its population, timeframe, holding and cost assumptions; the study proves what transfers and what does not; DawnTrader's actual fees, executable spread, volatility and portfolio constraints are applied; the result is a bounded starting range with a pre-stated falsifier, or an honest `not transferable / insufficient` verdict. No live SBT setting changes as part of this research.
- **Scope:** named prerequisite to sprint row 129 / roadmap 25-17; also gates any row 131 / roadmap 25-20 action touching SBT's xStock `min_rr`; does not gate B-SILENT-STRATEGY-CENSUS O3's four candidates
- **Completion report:** pending; the transferability verdict cannot close before the registered clean post-entry-gate SBT window ends or returns insufficient evidence
- **Supersedes / superseded by:** supplements rather than supersedes KD-57; reconciles `TARGET_GEOMETRY_STUDY_PLAN.md` and the generic August industry note in roadmap 25-17

## B-XSTOCK-HOLIDAY-CALENDAR — xStock holiday closures across VTS, paper and live

- **Owner** — NEW Claude, with NEW Codex while Codex is on duty. ANALYST verifies VTS behavior, OLD coordinates live integration with row 183 and INFRA supports operational verification.
- **Agreed date and source** — 2026-11-26, Kyle in the PM Codex chat, KD-122.
- **Kyle’s words** — *“we should fix the calendar altogether in all three modes: VTS paper and live”* and *“we should be able to find the days where the underlying assets will not be trading or the venues won't be open. Find the days when that is and we use the same shutdown procedure as the weekend shutdown procedure”*. *“There should be a batch that's inserted somewhere as opposed to something we work on now. And when I say inserted, I mean in the sprint”*.
- **PM explanation** — A scheduled market closure should trigger the same behavior as the weekend for the affected xStocks. An underlying exchange’s published market calendar and the execution venue’s product schedule establish the actual closure and reopening hours. When schedules differ, the owner verifies what the venue and subscribed feed support for that instrument and gets Coltrane to rule on how the closure applies. Verify against the [NYSE calendar](https://www.nyse.com/trade/hours-calendars), [Nasdaq calendar](https://www.nasdaq.com/holiday-trading-hours) and [Kraken xStock market hours](https://support.kraken.com/articles/market-hours-explained) as applicable.
- **Done means to Kyle** — VTS, paper and live apply the same verified weekend procedure to affected xStocks during a full or observed holiday or an applicable shortened session. Checks cover the last eligible interval, closure, reopening, open positions and working orders, and an ordinary open day with usable quotes. The calendar accounts for confirmed instrument exceptions and can be kept current. Expected closures and genuine feed failures remain distinguishable. Live integration is verified before live xStock enablement; the existing weekend posture work in row 166b governs any pre-close entry or position policy.
- **Scope** — [Sprint to Live Plan, Wave B2](../SPRINT_TO_LIVE_PLAN.md), row 166b1, and [Running Issues](../RUNNING_ISSUES.md), #392. The owner writes the scope at Step 1 when the sprint reaches the slot.
- **Completion report** — Due at the batch’s close, after the applicable three-mode verification.
- **Supersedes** — The September 3 parking of #392.
