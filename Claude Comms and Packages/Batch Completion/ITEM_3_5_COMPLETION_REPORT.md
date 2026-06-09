# ITEM 3.5 COMPLETION REPORT — RUNNING_ISSUES → Roadmap-Homing Audit + Roadmap Reorder

> Between-Phase-24→19 plan, **item 3.5** (Kyle directive 2026-06-08; readiness-checklist §4.a). **Closed 2026-06-09.** Governance-only (no code, no migration). Head `bb67cb1e8`, sync gate 0.

## Objective (from the plan)
Walk the entire `RUNNING_ISSUES.md` open list; confirm every non-resolved entry has an explicit roadmap home; place the homeless / escalate the ambiguous to Kyle; AND reorder `POST_AUDIT_ROADMAP.md` to state the canonical sequential post-19 execution order. Langston second-pass on placements before close.

## Outcome checklist
| # | Objective | Result | Evidence |
|---|---|---|---|
| 1 | Every non-resolved RUNNING_ISSUES entry has a roadmap home | ✅ YES | `Claude Comms and Packages/Scope Files/ITEM_3_5_ISSUE_HOMING_RECONCILIATION.md` §2 — ~90 entries mapped to Phase 19 / 25 / 16 / 20 / 21 / between-plan item / post-live / operational |
| 2 | Homeless/ambiguous escalated to Kyle | ✅ YES | §4 — 4 escalations; Kyle resolved all 2026-06-09 (per-class regime → item 4.7; #111 → Phase 25; #142 → Phase 16; #12e → Phase 25) |
| 3 | Roadmap reordered to canonical execution order | ✅ YES | `POST_AUDIT_ROADMAP.md` "Where We Are" — canonical-execution-order block (verbatim mirror of checklist §1) + Phase 25 anchor heading + Phase 19.0 stale-label fix + item 4.7 |
| 4 | Langston second-pass on placements | ✅ YES | v1 review (2 catches: #111 not-silent-override, #162's B-NEW-48 lock; tally 9→11) folded into v2; Step-8 final-confirm dispatched |
| 5 | Stale entries closed (verify-first verified) | ✅ YES | 11 closed; #87/#128/#55 staging-verified 2026-06-09 (SQE per-class, discovery operational, fixes in long-running bundle); #81 text-confirmed |

## Kyle decisions (2026-06-09)
1. **Per-asset-class regime (#162/#163, the old B-NEW-48):** build PRE-19 as **NEW between-plan item 4.7**, sequenced just before the AMR body (so AMR's weather-report is built on per-class regime — no rework). Supersedes the earlier "decide during calibration" answer once Langston surfaced it was a real Phase-24-era scheduled batch.
2. **TFS sustainability gate (#111):** → Phase 25 (25-3).

## Changes applied (all committed + pushed)
- **`POST_AUDIT_ROADMAP.md`** — canonical-execution-order block; `## Phase 25` anchor heading; Phase 19.0 "DEFERRED TO POST-LAUNCH" superseding note (VTS-standalone now pre-19 item 4); item 4.7 referenced.
- **`RUNNING_ISSUES.md`** — "★ ITEM 3.5 HOMING-AUDIT RESOLUTIONS" section (11 stale CLOSED, 4 re-homed); header date; regenerated Summary Counts (the 2026-05-07 tally was stale at 8 OPEN; now reflects ~90 audited + homed).
- **`PHASE_24_TO_19_READINESS_CHECKLIST.md`** — item 3.5 marked DONE; new item 4.7 inserted; "items 1–5 (incl. 4.5 + 4.7)" gate.
- **`ITEM_3_5_ISSUE_HOMING_RECONCILIATION.md`** (artifact) — the authoritative homing map (v2 with Langston catches + Kyle decisions).
- **MEMORY** (truth + in-repo mirror + Langston `/home/langston/MEMORY.md`) — item 3.5 closed, item 4.7 added, on item 4. 80 lines (≤200 cap).

## Governance files changed
`POST_AUDIT_ROADMAP.md`, `RUNNING_ISSUES.md`, `PHASE_24_TO_19_READINESS_CHECKLIST.md`, `BATCH_CATALOG.md` (this row), MEMORY (×3), + the reconciliation artifact + this report. SIM / System Manual: **not applicable** (no architecture/code/math change — this is a governance reconciliation).

## Commits
`855ad4226` (reconciliation v2) · `8499e1119` (apply: roadmap + RUNNING_ISSUES + checklist) · `bb67cb1e8` (MEMORY mirror). Sync gate 0.

## Not done now (correctly deferred)
- The §19.x roadmap prose-vs-locked-table duplicate collapse — the roadmap flags it as a start-of-Phase-19 cleanup; left there.
- Per-entry status-cell rewrites for all ~90 entries — the reconciliation doc is the SSOT; only the 11 closes + 4 re-homes were applied to RUNNING_ISSUES (the file's own batch-closure-section convention).

## Next
Item 4 — VTS standalone always-on Simulation service (storage-architecture design FIRST, with Langston, per §5a).
