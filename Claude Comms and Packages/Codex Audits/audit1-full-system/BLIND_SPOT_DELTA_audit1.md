# Questions before using Section 6

## Protocol status

This artifact is **CONTAMINATED, not a valid clean pre-exposure measurement**. The requested path `C:\DawnTrader-Codex\AUDIT\_BRIEF.md` did not exist. I located `C:\DawnTrader-Codex\AUDIT_BRIEF.md` and read it with a whole-file command; that exposed the text below Section 6's STOP line before this file existed. The questions below are reconstructed from Sections 1–5 plus my first look at `SYSTEM_MANUAL.md` and the cross-cutting runtime-state registry, but I cannot prove that the Section 6 hooks did not influence recall or phrasing.

## My top questions before using Section 6 as guidance

1. **Does the selection edge have one conserved objective from signal generation through SQE, RTB ranking, sizing, maker/taker choice, and final execution, or does each stage optimize a different proxy?** I would trace the exact value and population at every ranking/gating boundary, especially where a score is recomputed or normalized.

2. **Are economic costs represented exactly once in every decision path?** I would map fees, spread, slippage, fill probability, entry-side choice, and exit-side choice through active crypto, active xStock, and VTS, looking for omission and double counting rather than only wrong constants.

3. **Do risk limits remain hard boundaries after sizing, rounding, price movement, partial/delayed execution semantics, and portfolio aggregation?** I would test whether a value proved safe before rounding or price substitution can become unsafe afterward without a second guard.

4. **Can a signal or position cross asset-class, mode, or active/VTS boundaries without its discriminator being carried and revalidated?** I would inventory typed and untyped transit objects, cache keys, singleton maps, database predicates, and broadcast events for missing dimensions.

5. **Are all safety mechanisms capable of entering their protective state from cold start, recovering from it, and proving that they ran?** I would look for unreachable initialization predicates, sticky latches, missing yield paths, and counters whose zero is indistinguishable from non-execution.

6. **Where are time semantics conflated?** I would distinguish observation time, receipt time, cache-refresh time, decision time, order time, fill time, close time, and retention time, then look for age gates or cohorts built on a neighboring timestamp.

7. **Does regime classification form one coherent contract at boundaries?** I would compare the canonical classifier, strategy map, cache lifetime, per-pair/per-market scope, threshold inclusivity, unknown/default handling, and every consumer that may still derive or translate a regime independently.

8. **Which database-governed decisions have code defaults, cached stale values, partial-key behavior, or startup sequencing that can silently change the effective policy?** Because the database is unavailable, each suspected case must remain a question until live values and absence behavior are supplied.

9. **Can the system create obligations that no mechanism discharges, or consume state that no live writer can produce?** I would build writer/reader pairs for RTB state, price/book provenance, lifecycle fields, learning labels, alerts, retention registrations, and configuration broadcasts.

10. **Are there multiple entry points into execution, closing, signal admission, or learning that defeat a forward trace from the documented primary path?** I would enumerate callers and event subscribers first, then compare the invariants enforced by each route.

11. **Do failure paths preserve the safest truthful state?** I would inspect catches, timeouts, stale-cache re-serves, partial database writes, retries, and fallback branches for fail-open behavior or for fail-closed behavior that can strand positions indefinitely.

12. **Does the learning/calibration population represent the active decision population?** I would compare labels, inclusion predicates, mode/asset-class keys, shadow/VTS admixture, archive continuity, and selection bias introduced by recording only attempted or admitted signals.

13. **Which architectural claims in the manual are current intent but not implementation, and which are stale documentation after code moved?** Every divergence needs history or a batch record to identify which side moved before it becomes a finding.

14. **Can process lifetime, module singletons, caches, or restart behavior invalidate a file-level correctness claim?** I would trace initialization order, reset coverage, listener duplication, and whether deployments/restarts clear or preserve state assumed by the algorithm.

15. **Where can a mathematically valid formula be applied to the wrong unit, sign, leg, anchor, or population?** I would annotate dimensional units and semantic referents at the main quantitative chokepoints and trace one concrete symbol end to end.

## Delta after formally reading Section 6

### What the brief listed that my reconstructed list did not ask explicitly

- Whether smoothing, averaging, clamping, or defaulting changes a value's semantic meaning to its consumer. My questions cover proxy drift and time semantics, but did not isolate transformations as a first-class audit hook.
- The deliberately symmetric question of values written with no reader versus values read with no writer. My obligation question covers both generally, but did not foreground the symmetry.
- Whether the same action is performed twice by two mechanisms as a distinct flaw. I asked about multiple entry points and invariant divergence, but not duplicate work itself.
- Shared mutable-state races as a concurrency question. I asked about singleton dimensions and lifecycle, but did not explicitly ask about interleaving/race behavior.

### What I asked that the brief did not list explicitly

- Conservation of one selection objective across every pipeline stage, including recomputation and normalization boundaries.
- Post-sizing safety after rounding, price substitution, and delayed/partial execution semantics.
- Cold-start reachability, recovery/yield, and proof-of-execution as a three-part safety-mechanism test.
- A taxonomy of timestamps and cohort boundaries, not merely generic staleness.
- Learning/calibration population representativeness and selection bias versus the active decision population.
- Process/restart semantics and reset completeness as distinct from file correctness.
- Dimensional analysis across unit, sign, leg, anchor, and population.

## Interpretation limit

The delta above is useful as an audit-planning comparison, but it is **not** the uncontaminated blind-spot artifact Section 6 intended. The exposure error is itself part of the audit record and must be disclosed in the final deliverable.
