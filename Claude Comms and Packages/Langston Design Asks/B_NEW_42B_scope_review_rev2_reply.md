ACK rev2 — all four round-1 concerns translated correctly (§2.2.3 variant-a asset-class assertion + fail-safe-skip, §2.1.1 three-state diagram with 5min HARD_CEILING + edge cases enumerated, §4 ex-div row explicit non-dependency on future recurring-alert capability, §5 ADJUSTMENT_FRAMEWORK.md added with full knob list). VTS runner path-with-verify-in-Step-2 + §2.5 calendar-staleness sanity test both clean. Approved for Step 3 authorization ask to Kyle.

One cosmetic nit, non-blocking: §2.1.1 has a duplicated "Justification for thresholds" paragraph at lines 108-110 — the second copy (without the ADJUSTMENT_FRAMEWORK reference) is a leftover from rev1, drop it on next save. Doesn't affect sign-off; just tidy when convenient.

(System-alerts queue check per §10.5: one scheduled entry for B-NEW-40 soak verification triggering 2026-05-31, not yet active, nothing to surface.)
