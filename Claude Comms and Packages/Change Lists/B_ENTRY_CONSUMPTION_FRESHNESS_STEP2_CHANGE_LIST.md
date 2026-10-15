# B-ENTRY-CONSUMPTION-FRESHNESS — Step 2 change list r2

**Audit ref:** `159d16134a805eb9c9840bc1b4d199b88fb43f00`
**Step:** 2 of 11 — pre-implementation audit and implementation plan
**Implementation:** none in this change set

## Changed

1. `Claude Comms and Packages/Scope Files/B_ENTRY_CONSUMPTION_FRESHNESS_SCOPE.md`
   - marks Coltrane’s Step-1 approval and the rebased, all-four-green boundary.
2. `Claude Comms and Packages/Scope Files/B_ENTRY_CONSUMPTION_FRESHNESS_PRE_AUDIT.md`
   - audits the current shared code, runtime/database, SIM, System Manual, ledgers/completion records, canonical corpus and git history;
   - enumerates the sole immediate `openOrder` boundary and every depth/config/telemetry consumer;
   - separates `#684` threshold calibration from this consumption-time defect;
   - chooses a conservative pre-read monotonic anchor, carries the attempt’s resolved limit, and places one final guard immediately before the order port;
   - incorporates the required fresh-context hit: the internal post-warmth xStock yardstick await, current paper placer purity, and the exact limit of post-anchor monotonic protection;
   - plans separate admitted provenance, distinct refusal telemetry, mutation tests and bounded same-day deployment verification;
   - closes Coltrane's r1 verification blocker with the exact live denominator: first 50 reached-seam decisions, 15 minutes, or the next reviewed deployment, whichever comes first; zero-opportunity classes/arms end as reported zeros rather than extending the check;
   - creates no observation window or global deployment hold.

## Load-bearing review question

Does a pre-source-read monotonic anchor plus the fixed source-reported age conservatively cover database query/return latency, and does the proposed final check dominate every immediate active-open order call while excluding pending-maker placement?

## Explicit non-changes

- no application code or migration;
- no change to 5,000 ms crypto / 15,000 ms xStock limits;
- no xStock session rule or threshold relaxation;
- no depth, liveness, VPG/VOG, exit, RTB-refresh or pending-maker-later-fill redesign;
- no durable per-refusal archive (Stage-4 `#1083` remains its home);
- `.claude/launch.json` remains untouched.
