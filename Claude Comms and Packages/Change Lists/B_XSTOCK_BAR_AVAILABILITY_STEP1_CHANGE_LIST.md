# B-XSTOCK-BAR-AVAILABILITY — Step 1 change list r2

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

## Coltrane correction pass at `2d50303bf57a105d31f50145ad1914b91ed7688e`

Coltrane accepted the three-way provenance conclusion and returned four load-bearing corrections. Scope r2 now:

1. splits process receipt/enqueue (`arrived_at`) from persistence/reader-visible availability and requires delayed-flush plus pool-wait proof;
2. records that the upsert destroys earlier revisions, adds the retained-ineligible/prior-unknown state, and limits exact replay to revision-aware post-cutover evidence;
3. covers both production snapshot paths (15m scanner and 60m regime refresh) and fences the dormant 240m path;
4. adds a table/API reader census with explicit migrate, fence, retire-or-migrate, historical-only, or remain-inert dispositions for every direct semantic reader found.

## Already in place before this scope commit

- `RUNNING_ISSUES #707` owns the finding and its placement.
- `SPRINT_TO_LIVE_PLAN` places `B-XSTOCK-BAR-AVAILABILITY` first in pre-sprint Stage 3, before `B-CRON-MISSED-CATCHUP`.
- Delivery Board item `PVTI_lAHODmulEM4BfQP4zhAtXCM` is in Scope, owned by Analyst, linked to `#707`.

## Reviewer questions

1. Does the scope preserve the exact three-way provenance conclusion: raw clock split intentional, perceived forming-bar policy intentional, provider label→availability equivalence unestablished?
2. Is the minimum invariant strong enough when Kraken provides no public xStock OHLC timing contract?
3. Does the architectural surface include every current and dormant reader without prematurely choosing an implementation?
4. Are the historical-null rule, replay no-look-ahead rule, and live observation population falsifiable?
