# Audit questions requiring runtime or database evidence

## Audit 2 — fee viability, regimes, censoring, and forward design

1. **What fee contract actually applies to this Kraken account today?**

   Please provide the Kraken contracting entity/jurisdiction, product surface used for each class, eligible pair set, current rolling 30-day volume or Account-on-Platform tier, any negotiated schedule, and a raw dump of every live `fee_model` row (asset class, maker/taker rate, effective/update timestamps, and row/version identifiers). A screenshot/export from the authenticated Kraken fee page or account API is preferable to a manually transcribed number.

   If the authenticated rates equal the deployed rows, the suspected numeric mismatch closes but the missing external-version/provenance control remains. If they differ, the fee wall, maker/taker choice, and every net-EV decision must be treated as calculated under the wrong schedule from the effective boundary onward.

2. **Please export raw decision-time primitives, not precomputed viability labels, for the four named corpora.**

   For closed paper trades, open paper positions, passive real/shadow arms, and ranking-counterfactual members, include stable trade/signal/cycle IDs; class, symbol, strategy, pool, rank and ranker era; every generation/admission/open/close/deadline timestamp; state and censor reason; bid, ask, last, intended and actual entry/exit, stop, target, quantity; entry/exit fee modes and fee amounts; raw ATR/OHLC/regime inputs; and the exact config/deploy/fee version stamps. For paired arms, include one row per arm with its own start, cap, and end timestamp. Please do not apply the team’s net-EV, target-family, winner, or duration calculations before export.

   With these fields I will recompute units, legs, anchors, fee-era joins, paired rank comparisons, and censor-aware time-to-event quantities. If only derived labels are available, fee/geometry conclusions remain hypotheses because their defining calculations cannot be independently checked.

3. **Can ranking members be reconstructed within the same cycle and on first appearance?**

   Please include all ranks 0..N for each cycle, first-seen timestamp, selection status, duplicate/reappearance key, and the deploy boundaries for the ranker, order-book basis fix, and fee-contract changes. Also state whether any arm lacks primitives even though it has a stored label.

   If complete, I will perform the brief’s one-sided paired audit (rank 0 versus contemporaneous alternatives), split by required eras and publish the requested random subset size. A ranker win will be reported only as a lower-bound selection result; a tie/loss remains inconclusive. If cycles or first appearances cannot be reconstructed, no ranking-effect claim will be made.

4. **Which AMR/regime controls are live, shadow, or disabled at the audited deployment?**

   Please export the live feature flags and per-class constants for `amr_runtime`, regime thresholds, regime confidence/modulators, SQE regime-weight thresholds, and canonical regime-to-strategy routing. Include a small raw decision sample carrying classifier inputs/output/confidence, allowed strategy families, independently calculated SQE `regimeWeight`, and final gate result.

   If AMR is active, the audit will evaluate it as an acting control. If shadow/disabled, its code establishes capability only. If the two regime representations materially disagree in live decisions, the alignment proposal becomes priority; if they agree at the preregistered boundary cases, it becomes a documentation/observability issue instead.

5. **What evidence exists for maker fills beyond a sampled price crossing the resting limit?**

   For every paper/shadow maker attempt, export order-placement bid/ask and limit, every observed trade/tick until fill/deadline, observed trade size where available, displayed size ahead/at the limit where available, partial-fill events, final filled quantity, and cancellation/deadline state. Keep attempts that never fill.

   If size/queue/partial-fill evidence exists, I will bound the simulator’s optimistic bias against it. If it does not, maker outcomes will be treated as full-at-limit favorable-assumption results, and no realized maker advantage will be claimed from that corpus.

6. **Please preserve open positions as right-censored observations.**

   The open-position export should include age at extraction, latest executable bid, current stop/target/trailing state, arm-specific maximum hold, and whether the position would remain open absent the export. Closed rows need the same fields at closure.

   With both sets I will use survival/competing-risk summaries by arm. If open rows or arm-specific caps are absent, I will not compare duration distributions or infer that a short observed holding period is intrinsic to a strategy.

---

## Prior audit questions (retained for continuity)

1. **Which unique/exclusion constraints actually exist on `public.rtb_signals` at the audited deployment?**

   Run:

   ```sql
   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'rtb_signals'
   ORDER BY indexname;
   ```

   If there is only a four-column `(mode, symbol, strategy, status)` unique index, the three-column `ON CONFLICT` target cannot match it and a real upsert should fail. If a separate three-column constraint exists, the checked-in Drizzle schema/snapshot is incomplete and the identity still aliases same-symbol signals across asset classes. The answer changes whether Finding 1 is immediately executable, a reproducibility defect, or both.

2. **Have colliding canonical symbols occupied RTB simultaneously across asset classes, or overwritten one another?**

   Run (adjust timestamp column names only if the deployed schema differs):

   ```sql
   SELECT mode, symbol, strategy,
          COUNT(DISTINCT asset_class) AS classes,
          ARRAY_AGG(DISTINCT asset_class ORDER BY asset_class) AS asset_classes,
          COUNT(*) AS rows
   FROM rtb_signals
   WHERE asset_class IS NOT NULL
   GROUP BY mode, symbol, strategy
   HAVING COUNT(DISTINCT asset_class) > 1
   ORDER BY rows DESC, mode, symbol, strategy;
   ```

   A non-empty result proves live cross-class identity pressure. An empty result does not falsify the structural defect; it only lowers observed frequency. Historical logs/archive rows for known collision symbols (for example `SUI`, `CVX`, `DASH`, `MET`, `OPEN`) would determine realized impact.

3. **Does a maker-chosen signal's stored `entry_price` represent bid, midpoint, ask, or bar close at the decision instant?**

   Produce a joined sample of maker decisions with contemporaneous best bid/ask and calculate `(entry_price-bid)/(ask-bid)` for each source pool/strategy. If quant entries cluster near 0.5, the current maker EV credits roughly half a spread too much; if they cluster near 0, the whole-spread credit is consistent for that lane. Pattern/bar-close rows must be evaluated separately. This answer changes Finding 3 from HYPOTHESIS to defect or closes it.

4. **Has `active_open_positions` acquired a paper/live discriminator in the deployed database despite the audited schema lacking one?**

   Run:

   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'active_open_positions'
   ORDER BY ordinal_position;
   ```

   If no mode column exists, the audited mode arguments remain inert and mode-scoped deletion is impossible. If it exists, the checked-in schema/storage layer is behind production and requires reconciliation. The answer changes the present-tense operational exposure, not the code-level finding.
