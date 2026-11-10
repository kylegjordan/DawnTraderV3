# B-PLAN-CURRENCY-CHECK — census 2026-W46 worklist: handover record
**Source:** weekly census alert `890d6c3d-127e-4e25-b865-c1ac83655b60`, graded at `b64efe052248b50df044a959c18e73a5bf39b802` against previous ref `cf6f0601df2674b9faa937cd00497bebbfce749a`. The checker's sealed box file is committed beside this record as `B_PLAN_CURRENCY_CHECK_CENSUS_2026-W46.json`; its local SHA-256 exactly matches the source file on staging: `30d6c8641df7fad9940c42880039015ad2fb212d9009f6614f683b41d03dff3f`.

**Method:** every listed id was re-checked against the plan and ledgers at the handover head on 2026-11-10. A graded-ref finding that had already been corrected is recorded as such, not handed over as fresh work. Partial completion reports remain partial; no open remainder is falsely closed.

The unresolved owner items were **handed over 2026-11-10** in Discord message `1569650115927474197`.

## THE SETS
| issue | owner at handover |
|---:|---|
| `#237` | CC-B |
| `#1237` | CC-INFRA |
| `#1243` | PM |
| `#1253` | CC-C |

⛔ **KYLE'S RULE (2026-10-19, restated 2026-11-04) APPLIES:** no new batch or plan row without his agreement; findings go to their owners or PM to slot. This record adds no plan rows.

## (a) completion reports absent from plan lines — 3 at the graded ref
- `B_PATTERN_ENUM_DRIFT_COMPLETION_NOTE.md` — CC-B, row 51: this is explicitly a partial completion note for the closed hotfix; the remaining drift work is still queued, so the plan must not close the row.
- `B_PRICE_FEED_TRUTH_COMPLETION_REPORT.md` — CC-C: verified rather than reopened at current-head ancestor `68907f092`: the report object exists, and `SPRINT_TO_LIVE_PLAN.md` §0 marks B-PRICE-FEED-TRUTH closed and links the report. No work.
- `F_G_1_COMPLETION_REPORT.md` — CC-C: verified rather than reopened at current-head ancestor `68907f092`: the report object exists, and `SPRINT_TO_LIVE_PLAN.md` §0 plus row 16 mark it closed and link the report. No work.

## THE SETS — (b) unplaced OPEN issues — 5 at the graded ref
| issue | owner | disposition at handover |
|---:|---|---|
| `#237` | CC-B | Handed over for owner disposition; U2 says its HOME batch already has a completion report. |
| `#1165` | CC-B | Placed since the census at row 2a0f; no further placement work. |
| `#1237` | CC-INFRA | Handed over for owner disposition; U5 says its HOME batch is in no list. |
| `#1243` | PM | Still ownerless and explicitly waiting for Kyle to slot the crew-roster correction; previously passed to PM on 2026-11-05. No implementation is authorised. |
| `#1253` | CC-C | Disposition (2) complete: moved from closed/absorbed row `8d` to the existing after-live "Break-even stop + moonbag exits" item in `PRE_LIVE_SPRINT.md`, owned by CC-C and binding before the two enabling switches. No new batch or row. |

The handed-over-issue check counted 165 issue blocks at the graded ref: 94 placed, 70 closed, and only `#1165` still unplaced there. It is placed at the handover head.

## (c) dated homes — 0
The empty set is supported by the same census instrument that found five unplaced issues in (b).

## (d) id-less plan rows — 0
The empty set is supported by the same census instrument that found nine unmatched ordering references in (e).

## (e) ordering references that do not name an earlier row — 9 findings
- **CC-A:** row 18's wording now says it starts once row 72 closes, instead of using a false `after` reference to a later row. Row 105 now says it starts once CC-A's stage-00 items are complete, without presenting `OLD` as a row id.
- **CC-B:** row 59g2 → `N`; row 100 → `B-XSTOCK-ENTRY-COMPARATOR`, `B-EXIT-TRIGGER-FILL-PARITY`, `B-BOOK-STATE-RING-INDEPENDENT-BOUND`; row 100 → row 32. Handed over for owner disposition.
- **CC-C:** disposed. Row 124b now describes row 150 as a later publication gate, not an ordering dependency; row 124c describes the scoring work as a later follow-on that begins when row 148a is complete, not a prerequisite for the capture row. The valid earlier-row placement of 124b/124c is unchanged.

## (f) not-closed plan lines with a report — 5 total, 2 new in W46
- **CC-B, new:** row 51 `B-PATTERN-ENUM-DRIFT`. The report is deliberately a completion note for the hotfix; the remainder stays queued.
- **CC-INFRA, new:** §0 `B-TOKEN-WATCH`. The report covers completed work while the plan line remains paused after live; handed over for owner confirmation.
- **Existing:** row 55 `B-RTB-REFRESH-CONSOLIDATE` (CC-B), §0 `B-MEASURE-GATE` (CC-A), §5 `B-XSTOCK-FEE-CONTRACT` (CC-B). No new CC-A work: B-MEASURE-GATE remains open on its observation objective by design.

## CC-B owner disposition — 2026-11-10 (NEW Codex)
- `#237`: remains OPEN. Its durable home is the still-open `P19-B8.5 THE SWITCH-ON` umbrella's OBJ-6 tail; the issue now names that scope explicitly and excludes completed lettered sub-batches. No new batch or plan row was created.
- `#1165`: confirmed already placed at sprint row `2a0f` as `R-XSTOCK-PATTERN-TYPE`; no change owed.
- Row 51 `B-PATTERN-ENUM-DRIFT`: confirmed intentionally partial. The deployed hotfix is closed; the raw-vs-canonical sink-label and `UNKNOWN` fallback remainder stays queued on the same row, exactly as its scope and completion note state.
- Row 59g2 → `N`: parser false positive. The closed row meant a configurable consecutive-skip count, implemented and reported as four, not a plan predecessor; wording now says “upon four consecutive skips.”
- Row 100: removed the three stale predecessor names because all three were deleted/folded into existing row 2 `B-XSTOCK-BID-TRIGGER-RELAND`, already named as row 100's first prerequisite. Replaced obsolete ordinal “row 32” with that row's current stable batch id, `B-DISK-HEADROOM`. Sequence is unchanged.

## (g) §6 ownership recount
The census recount over §4's seven-cell item rows is CC-C 83, CC-INFRA 55, CC-B 96, CC-A 89: 323 items total. The hand-maintained table said 83, 57, 96, 85: 321. This commit corrects CC-INFRA, CC-A, the total and the recount history; no row ownership changes are made.

## Reused issue numbers — 8, unchanged
`#559 #561 #642 #646 #648 #660 #741 #921` remain the known legacy doubles. They are not renumbered blind.

## Handover state
Every item in THE SETS was **handed over 2026-11-10** in one complete Discord post to CC-B, CC-C, CC-INFRA and PM, naming every item and the action owed: `1569650115927474197`. The census alert is resolved with this commit as evidence.
