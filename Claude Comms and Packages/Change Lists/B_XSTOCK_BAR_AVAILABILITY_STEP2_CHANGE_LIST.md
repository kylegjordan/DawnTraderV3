# B-XSTOCK-BAR-AVAILABILITY — Step 2 change list

**Review target:** merged pre-implementation audit and implementation plan; no runtime code or database schema changed.

**Change class:** architecture

**Primary issue:** `#707`

## Added

- `Claude Comms and Packages/Scope Files/B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md`
  - answers the provenance question: B74's vendor-label/local-receipt split was intentional, and B-NEW-34/B.3/B.4 intentionally chose the perceived forming bar; the missing design is exact revision availability between those decisions;
  - names all six workflow sources, enumerates entry points before the trace, and records writer/reader/mutator/deleter/scheduler censuses;
  - separates vendor label, receipt, write time, primary-scoped post-commit certification, aggregation/cache availability, and decision observation;
  - plans immutable xStock 1-minute revisions, exact-ID primary certification with monotonic sequence and clock-health guard, revision-aware 15m/60m aggregation/cache, content-addressed settled-window manifests, live/replay/provenance/dashboard migration, and a staged capacity-gated rollout;
  - preserves F-G-1 winner semantics with immutable applied/rejected projection outcomes and row-locked projection generations; as-of reads select the actual applied winner before testing its certificate, including older-arrival late-commit and equal-arrival inverted-certification mutations;
  - carries a typed 60m manifest/read observation through RTB scalar reduction, persists every refresh outcome, links reconfirmation and promotion to the exact attempt, and requires replay/readback of the regime inputs;
  - defines the capacity gate against the live B75 200-GiB cap: 40-GiB operating reserve, explicit archive-delay and index-rebuild reserves, a full 8-day/five-session capture population, and a fixed pass inequality/capture-stop response;
  - defines rollback as a fail-closed pause of new xStock decisions with the prior reader shadow-only, critical alert/provenance treatment, Kyle-only resume authority, and a mutation-backed rehearsal proving zero falsely exact post-fault decisions;
  - preserves the approved forming-bar policy and prohibits a blind `+15 minutes` rewrite or legacy exact-replay claim;
  - records one fresh claim-only reader hit and the re-derived corrections: observer scope, wall-clock regression, immutable identity, full expected/returned-ID equality, and certificate-commit timing;
  - labels the staging UI as not visually checked under the Codex password rule.

## Finding placed separately

- `1-system-manual/RUNNING_ISSUES.md`
  - adds `#1194`: 15m/60m snapshot reads are bounded but stored rows are not pruned;
  - records the 2026-10-14 planner estimates/sizes, zero target-delete census with positive controls, and separation from `#441`.
- `1-system-manual/SPRINT_TO_LIVE_PLAN.md`
  - places `B-XSTOCK-SNAPSHOT-RETENTION` after this availability batch and before `B-CRON-MISSED-CATCHUP`.
- Delivery Board draft item `PVTI_lAHODmulEM4BfQP4zhAulos`
  - Backlog · Analyst · Batch · `#1194` · Phase 19 · Blocked on Nothing · Review Not required;
  - `B-CRON-MISSED-CATCHUP` was moved after it in the board's manual order.

The current batch does not perform destructive snapshot cleanup. It owns revision-aware compatibility and bounded reads; `B-XSTOCK-SNAPSHOT-RETENTION` owns retention, archive/rebuild guarantees, coordination, and deletion safety.

## Measured deltas and controls

- xStock label→receipt reread: 15,352 retained current rows / 465 symbols, p50 949.585 s, p95 959.751 s, over the stated two-hour October-child population.
- Snapshot catalog estimates: 15m 2,225,519 rows / 503 MB; 60m 580,769 rows / 134 MB.
- Current database control: PostgreSQL 17.6 primary, Read Committed, `synchronous_commit=on`, `track_commit_timestamp=off`; public schema 103 `arrived_at` columns and zero `visible_by` columns.
- Runtime/code boundary: staging deploy `94bf16d1022b8cb24c027df9aa721fb1d0333f18`; plan read at shared origin `5ce1cdac3`. Its only delta from the initial audit ref was two unrelated crew-access Step-2 documents.
- Local code control: 45 `arrived_at`/`arrivedAt` matches and zero `visible_by`/`visibleBy` matches across tracked `shared`, `server`, `drizzle`, and `scripts` at the read ref.

## Reviewer questions

1. Does the audit preserve both intentional decisions—the raw clock split and forming-bar consumption—while identifying the narrower missing availability/revision contract?
2. Is exact-ID post-commit primary certification, with monotonic sequence, expected/returned-set equality, clock-health guard, and fail-closed NULL, a sufficient causal boundary without claiming exact commit or replica visibility?
3. Is the append-only revision + aggregate revision + content-addressed manifest shape proportionate to exact replay/provenance needs and current database capacity?
4. Are all 15m/60m live, replay, calibration, dashboard, export, dormant, and historical readers either migrated or explicitly fenced, with 240m refused?
5. Is `#1194` correctly separated and placed, or must any part of snapshot retention move into this availability batch before implementation?
6. Does projection generation preserve F-G-1 maximum-arrival/equal-arrival-last-applied behavior under both cross-process mutations, without certificate order selecting a winner?
7. Does the typed 60m RTB evidence survive scalar reduction and remain durable for every refresh outcome and promotion?
8. Is the fixed `D_gate + R_archive + R_index <= 160 GiB` gate against the governed 200-GiB cap sufficiently conservative and operationally complete?
9. Does the rollback contract prove that post-cutover faults pause new xStock decisions and cannot silently restore label-only trading or exact-era claims?
