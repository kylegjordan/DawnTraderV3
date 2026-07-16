# P19-B8.9a — source-tag honesty micro-diff (completion; CC-A, 2026-07-16)

**change-class: non_architecture** (labels become honest; one gate's ADMISSION widened to what the venue-only doctrine at engine :972-985 already states; no threshold/strategy/regime/math change — Langston class-confirm requested at Step-4, granted with the APPROVE). Sub-batch of the open P19-B8.9; design record = the Discord Step-1/amendment/Step-4 thread (Langston independently verified both findings at ref 862577437; scope/pre-audit substance = the parent P19_B8_9 scope + the in-channel amended design, parent-ride).

## What shipped (commit 1f30f5fe8, CI 4-green run 29534550743, deployed 21:05Z)
FOUR mislabels fixed + one pre-existing safety hole closed, one diff:
1. Engine :1036 — REST prices cached under a WS badge (a load-bearing REST-call cache); fixed with the honest label + honest admission: NEW `isKrakenVenueSource` predicate (single home, adapter) referenced by the engine gate :986, the non-venue warn :992, and the adapter's fresh-window leg — no per-site whitelist to drift.
2. Engine :965 — genuine equities-WS ticks wearing the crypto WS tag ('kraken_equities_ws' was unrepresentable); both adapter unions extended; CC-B-blessed (his known build-time interim).
3. `updateFromWebSocket` renamed `updateCache` (honest generic contract; 3 callers, 2 were lying; rule-18 no-alias; stale comments swept).
4. The ternary INSIDE the method discarding the caller's source ('binance' for everything non-kraken_ws) — caught by this batch's own unit test failing.
+ SAFETY: getPriceWithFallback's last-resort stale re-serve returned the ORIGINAL venue tag on REST failure — a stale price could satisfy the actionable gate in the exact dark-venue scenario the skip-rail was built for. Now returns 'last_known_good' (the tag APM :588 already expected) → skip-tick + escalation engage as designed. Langston verified the fix clean across all six getPriceWithFallback callers.

## Verification
- 28/28 tests (new p19-b8-9a-source-tag-honesty.test.ts + the price-liveness suite); tsc baseline OK.
- Deployed + live-verified: honest tags flowing within 1 min (post-deploy distribution: 57,370 kraken_ws / 755 kraken_equities_ws / 47 kraken_rest, ZERO mislabels); engine auto-resumed through the restart.
- §9.3 UI walk: paper page renders, Open Trades "Active Trades (15)" (cap full at the $145 sizing), no errors.
- CORRECTED-INSTRUMENT BASELINE (Langston sequencing condition — taken AFTER the label fix): REST fetches avg 14.7/min, peak 17/min (0.28/sec) vs pre-fix avg 23 / peak 46 (0.77/sec) — the honest fresh-venue admission already saves redundant re-fetches. This baseline is the comparator for the B8.9 retirement cuts.

## Governance
This report + PHASE_19_PLAN §5 row (+ BATCH_CATALOG at parent close). SIM + SysManual pricing-chapter content updates land with the PARENT B8.9 close (Langston's named closure condition covers both findings; the parent close is the single content-update event for the whole chain).
