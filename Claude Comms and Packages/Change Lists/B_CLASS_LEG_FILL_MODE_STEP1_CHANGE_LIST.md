# B-CLASS-LEG-FILL-MODE — Step 1 change list

**Review target:** scope, provenance, and plan placement only; no runtime code or schema changed.

**Change class:** architecture

**Parent / issue:** pre-sprint P1c + [C3] / `#1170`

## Added

- `Claude Comms and Packages/Scope Files/B_CLASS_LEG_FILL_MODE_SCOPE.md`
  - defines DB-governed entry and target-exit policies by class;
  - defaults crypto to maker-only, xStock to maker-preferred with an independently admissible taker fallback, and keeps stops structurally taker;
  - preserves the existing fill-probability/adverse-selection-adjusted maker EV and the single-consistent-number admission/ranking invariant;
  - brings [C3] into the same batch: the deciding quote's actual local receipt time must be strictly after the explicit persisted rest-placement instant and before its deadline;
  - requires a dedicated durable entry `makerPlacedAt`, one captured instant for placement/deadline, and producer-supplied crypto arrival time rather than `now-age` reconstruction;
  - preserves the intentional venue/receipt freshness clocks as a separate concern;
  - records Tier-1 provenance and explicit dispositions for the B7.2, B7.2c, B7.2d, B8.6, transactable-side, and quote-clock components;
  - leaves VTS target rests and the remaining refused-cycle timer/deletion part of `#1073` in their existing homes;
  - requires deterministic/mutation proof and bounded staging verification without a calendar observation hold.

## Updated

- `1-system-manual/SPRINT_TO_LIVE_PLAN.md`
  - leads the P1c batch/reference cell with `B-CLASS-LEG-FILL-MODE`;
  - records that P1c and [C3] land together rather than serially.
- `.claude/memory/MEMORY_CC_C.md`
  - advances the active position to Step 1 for this batch and preserves the nonblocking October monitors.
- `Claude Comms and Packages/SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md`
  - replaces the unnamed P1c next-action line with the named batch and current Step-1 state.

## Reviewer questions

1. Does the two-value policy (`maker_only`, `maker_preferred`) exactly express Kyle's class/leg directive without weakening admission economics?
2. Is the entry overlay correctly placed after the unchanged two-arm calculation and before the one snapshotted value reaches gates/ranking?
3. Is the live-order interval `placement < arrival < deadline` the right [C3] rule while freshness keeps its existing mixed clock basis, including the explicit decision that a guard-admitted post-placement xStock replay counts as an arrival?
4. Is maker-only target expiry correctly specified as clear-and-remain-open, with stop precedence unchanged, while maker-preferred retains taker conversion?
5. Are VTS target exits and the remaining `#1073` timer/deletion question correctly bounded outside this batch, and is the no-new-window release plan sufficient?
