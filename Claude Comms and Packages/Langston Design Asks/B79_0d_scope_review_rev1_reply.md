# B79.0d review

## Q1-Q7 calls
Q1 (open-range definition: calendar-fixed vs sliding-day): **Concur — calendar-fixed.** Matches classical ORB and avoids per-symbol first-tick state; staggered-feed edge cases are acceptable Layer-1 noise to be calibrated in B79.x.

Q2 (breakout buffer ATR-mult vs range-pct): **Concur — ATR-mult 0.15.** Regime-adaptive buffer is the right choice; matches SBT pattern so engine behavior stays consistent across vol regimes.

Q3 (range-formation lockout window 15:00-17:00 vs full RTH): **Concur — 2-hour active window.** Late-day "ORB" breakouts are reversal-bait and degrade net expectancy; conservative ship is correct, can extend later if data supports.

Q4 (confidence formula coefficients): **Concur on shape with one nit.** Clamp the `range_atr_normalized` input itself (e.g. `min(range/atr, 3.0)`) before the 0.20 multiplier so an outlier wide range can't dominate. Floor/ceil and term weights are right — range is the primary edge, volume the confirmation.

Q5 (regime mapping IE+ST only, or also TFS): **Concur — IE + ST only.** TFS is already strategy-dense; ORB there would add overlap with SBT/breakout. Conservative ship, expand on evidence.

Q6 (asset-class guard placement: triple-defense): **Concur — keep all three.** Detect-guard + dispatch-guard + SQE whitelist. Belt-and-suspenders is correct posture for the crypto no-touch fence; a single missed gate can't accidentally fire ORB on crypto.

Q7 (B73 ablation register now or later): **Concur — register now.** N=0 rows are harmless and the audit trail is cleaner than retrofit.

## Concerns / Additions
- **Objective 1 should explicitly call out the 24/7-symbol guard.** §6 mentions detect must return null for `XSTOCK_SPOT_24_7_SYMBOLS` (no opening bell), but Obj 1 only names the asset-class guard. Add to detect logic + verification.
- **Objective 8 should add boundary case (g): 24/7 symbol returns null with reason='no_open_bell'.** Otherwise B79.0c's 24/7 list could silently regress without test coverage.
- **Time source determinism.** Detect's range-formation phase must use the same time source as the rest of the engine (marketContext clock, not `Date.now()`) so unit tests can synthesize the 14:30-17:00 window deterministically. Worth one line in Obj 1.
- **Seed SQL idempotency.** `scripts/b79-0d-orb-thresholds-seed.sql` should be `ON CONFLICT DO UPDATE` (or pre-DELETE) so re-running on staging doesn't error on the 5 module_constants rows.
- **Q-D rollback path.** §5 risk mentions "B79.x flips gate back to false" — confirm rollback is DB-only (no code revert), since Obj 6 wires gate to cached sync API. If gate flip alone fully neutralizes ORB on next tick, that's clean; worth one verification line.

No file-list misses beyond above. Scope is tight, file count realistic, 3-5h estimate credible.

## Verdict
approved-with-revisions

## Ship recommendation
ship after Q* revisions

(Revisions are scope-text additions to Obj 1, Obj 8, and seed-script idempotency — no design changes. Pre-impl audit can absorb them without a rev 2 cycle if CC acks here.)
