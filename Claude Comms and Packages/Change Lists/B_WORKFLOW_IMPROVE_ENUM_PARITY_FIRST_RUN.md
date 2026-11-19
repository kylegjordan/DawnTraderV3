# B-WORKFLOW-IMPROVE Q9 — the enum-parity check's first run (the r2 condition-1 control)

Actor: PM Claude (CC-PM), Claude crew. Graded ref: `96114da21` (CI run 44631018417, 2026-11-19 22:43Z).
Staging read: `dt-sql`, 2026-11-19 ~22:50Z.

## What ran
`server/tests/enum-parity/enum-parity.parity.ts` in the advisory ci.yml step, against the CI database built by `npm run db:migrate`.
- **Population:** 73 pgEnum exports in `shared/schema.ts` (equal to the 73 `export const X = pgEnum(` lines); 85 enum types in the database's public schema, one of them the run's own control.
- **Controls:** all four passed. A matching control passes. A code-only control type is reported. A database-only control value is reported, and a historical entry excuses it. The instrument also read `pattern_type`.
- **Required result:** unaffected. The job and the run are green, and the step's red is advisory, as designed.

## What it found (r2 condition 1: "if a live drift exists, it is the control")
| direction | values |
|---|---|
| code declares, database lacks | `market_regime`: TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION, HIGH_VOL_IMPULSE; `tuning_status`: reverted |
| database holds, code lacks | `strategy_type`: momentum_breakout, volatility_squeeze, trend_following, range_bound, breakout_pullback, divergence, accumulation_distribution, order_flow; `trading_mode`: passive, learning; `tuning_status`: pending |

- **#1063 (`pattern_type`):** no drift. The migrated database and staging both hold the six code values, ABCD included. This matches Langston's r2 reading that #1063's drift is closed in a migrated database. #1063's own ledger state was not re-read in this note.
- **Staging matches CI for the five drifting types** (one `pg_enum` read): `market_regime` holds only the six original values, and `tuning_status` holds pending, success and failed. So the drift is not a CI-only artefact.

## What is NOT established (a hypothesis, not a defect — CONDUCT §8/§9)
- **Columns typed by the drifting code-only values:**
  - `telemetry_history.regime` and `adaptive_learning.regime` (`market_regime`);
  - the tuning table's `status` (`tuning_status`, `shared/schema.ts:4592`).
- **Both regime tables are EMPTY on staging.** A grouped count returned the header and no rows.
- **Writers exist:**
  - `server/core/telemetry/cost-telemetry.ts:97`
  - `server/services/telemetry-repository.ts:252` and `:305`
  - `server/services/adaptive-learning-repository.ts:160`
- **Two competing explanations, not yet tested:** these writers are never called on a live path, OR their writes fail when the regime is one of the six newer names (added to code 2026-03-18/19, `bd40aa666` era). Pruning is a third possibility to rule out.
- **Not checked:**
  - whether any code writes the six names;
  - the PM2 logs for enum insert errors;
  - the call graph (`census.mjs --path` on each writer would answer reach);
  - the provenance of the database-only values.

## Disposition
- **Folded into this batch** as Q9's live control. The check is proven to discriminate on a real drift, and Langston receives it in the Step-4 dispatch.
- **The defect question is a finding outside the batch.** Its home (an owner's bug investigation per the `bug-investigation` skill) is proposed in the Step-4 dispatch, and any new slot goes to Kyle (CLAUDE.md §9.4, 2026-10-19 rule).
- **`HISTORICAL_VALUES` stays empty** until each database-only value's retirement is cited. Excusing them without that would hide the reverse direction.
