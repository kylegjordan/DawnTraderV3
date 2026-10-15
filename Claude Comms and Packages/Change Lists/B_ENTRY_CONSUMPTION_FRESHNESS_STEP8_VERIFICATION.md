# B-ENTRY-CONSUMPTION-FRESHNESS — Step 8 independent staging verification

**Evidence ref:** `ee512535b679e41249035fe7f0ed459e1a953851`

**Deployed runtime ref:** `28c58fb8dc537242f7c1b320dd7e4d1f13af1b8a`

**Reviewer:** Coltrane, acting as the independent reviewer during the Codex shift

**Verdict:** **APPROVED** at 2026-10-15T12:04:47Z

## Independent results

Coltrane independently re-ran the supplied instruments rather than ruling on the Step 7 report:

1. **Extractor control and registered population.** The exact-shape control returned both supplied rows: one crypto/direct-taker PASS and one xStock/maker-to-taker stale BLOCK. Both production streams span the registered interval. The bounded population `2026-10-15T11:32:01Z <= t < 2026-10-15T11:47:01Z` independently returned 0 of 0, with outcome, class, arm and reason splits all zero. Coltrane confirmed that this is terminal under the approved contract and is not functional proof.
2. **Later live positive.** Coltrane found one real `CONSUMPTION_PASS` at `2026-10-15T11:50:48Z`, after the exclusive cutoff, for `INTC/USD`, xStock direct-taker, with first-gate age `2144.687 ms`, elapsed `148.77118099993095 ms`, final-consumption age `2293.458180999931 ms`, and limit `15000 ms`. The owner re-derived that exact line from the live output stream. It proves the deployed live path subsequently emitted an admitted final check, but it does not retroactively change or contaminate the registered zero window.
3. **Process-lifetime cross-check.** By Coltrane's later read, the authenticated lifetime totals had advanced to attempts/opened/blocked/openFailed `1/1/0/0`, `CONSUMPTION_FRESHNESS=0`, and maker/taker choice samples `500 = 447 maker + 53 taker`. That change is consistent with the post-cutoff INTC admission rather than a disagreement with the fixed-window zero.
4. **Database.** Independent readback reproduced the migration at `2026-10-15T11:31:55.383297Z`, both nullable double-precision age fields, the pre-window control `477 existing-gate-age / 0 new-consumption-age`, and zero closed-trade rows opened in the registered interval.
5. **Identity and health.** Deploy record, live checkout, built identity, and authenticated liveness all returned runtime ref `28c58fb8d`; the process was online at unchanged `restart_time=647`, zero unstable restarts, with the engine expected and running.
6. **xStock observation continuity.** Independent readback reproduced successor boot `1aab5ae6-d372-4825-9fbe-5555b414f031`, predecessor `c75247e2-421e-42c1-ab71-ea811c9668a4`, handoff at `2026-10-15T11:31:56.012133Z`, and counts `31,322 accepted / 10,333 superseded / 20,989 projections / 2,623 admission flushes / 2,623 completion flushes`.
7. **UI N/A.** The client census independently returned zero references to the new field, failure stage, RTB-metrics endpoint and pipeline-tail endpoint, while the same instrument positively found five trades-route references and two adapter references. Coltrane traced the generic server row through `PaperClosedTradeRow`, `adaptPaperClosedTrade`, and the shared table call and confirmed that the new backend evidence is not part of the visible mapped shape.

Coltrane explicitly retained the real-engine suite and its red mutation as the functional control and did not promote the live zero into behavior proof.

## Board and reviewer mirror closeout

- Delivery board readback: Status `Verification`, Owner `Analyst`, Review `Approved`, Blocked on `Nothing`.
- The sanctioned Coltrane mirror was restored to current shared ref `28c58fb8d`; source and target match, automatic refresh is active, and both have zero wrong-owner paths.
- Coltrane's project credential remains unreadable to his account, so he could not perform his own board write/readback. This access defect is already with Infra Codex and did not change the independently reproduced technical verdict; the existing approved value was read back through the owner session, not attributed to a Coltrane write.

## Step 9 disposition

No technical corrections were requested. Step 9 therefore has no implementation iteration to apply; it must record the no-change disposition and advance to governance.
