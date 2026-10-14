# B-XSTOCK-BAR-AVAILABILITY — Step 1 change list

**Review target:** scope only; no runtime code or schema changed.

**Change class:** architecture

**Issue:** `#707`

## Added

- `Claude Comms and Packages/Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md`
  - establishes the still-unresolved provider-clock boundary without undoing the intentional B74 or forming-bar decisions;
  - records the System Manual/System Impact Map blast radius;
  - supplies full Tier-1 provenance with verbatim introducing decisions and explicit five-way dispositions;
  - scopes one availability contract across ingest, aggregation, snapshots/cache, scanner, regime refresh, replay, calibration, provenance, dashboard, and dormant-reader fences;
  - pre-registers live and historical verification populations and a mutation/positive-control requirement;
  - explicitly forbids a blind 15-minute relabel.

## Already in place before this scope commit

- `RUNNING_ISSUES #707` owns the finding and its placement.
- `SPRINT_TO_LIVE_PLAN` places `B-XSTOCK-BAR-AVAILABILITY` first in pre-sprint Stage 3, before `B-CRON-MISSED-CATCHUP`.
- Delivery Board item `PVTI_lAHODmulEM4BfQP4zhAtXCM` is in Scope, owned by Analyst, linked to `#707`.

## Reviewer questions

1. Does the scope preserve the exact three-way provenance conclusion: raw clock split intentional, perceived forming-bar policy intentional, provider label→availability equivalence unestablished?
2. Is the minimum invariant strong enough when Kraken provides no public xStock OHLC timing contract?
3. Does the architectural surface include every current and dormant reader without prematurely choosing an implementation?
4. Are the historical-null rule, replay no-look-ahead rule, and live observation population falsifiable?
