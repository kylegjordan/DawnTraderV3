# B79.0d Step 4 review

## Verdict
approved-with-revisions

## Findings
- F1 (semantic, non-blocking): `risk_reward_ratio` is misnamed. `targetPrice = entry ± 2.0 × rangeHeight` with `stopPrice = opposite range extreme` does NOT yield realized 2:1 R:R once price has cleared `rangeHigh + buffer` — actual risk = `entry − rangeLow` > `rangeHeight`, so realized R:R drifts to ~1.3:1 on typical breakouts. Either rename the constant to `target_range_multiple`, or derive stop from entry + a separate `stop_range_multiple` so net-expectancy math reads true. Defer is acceptable; flag in module_constants comment so the next tuner doesn't trust the label.
- F2 (Q7 drift): DESIGN comment lines 19 + 152 in orb.ts assert "B73 ablation registered now" but the diff does not register it. Either implementation matches the lock (preferred) or the comment is corrected. Don't ship with comment ≠ behavior — that's a paper-trail rot bug.
- F3 (comment correctness): orb.ts:49 comment "14:30 UTC = 09:30 ET (DST handles itself in winter)" is backwards. 14:30 UTC = 09:30 ET only during EST (winter, UTC-5). During EDT (summer, UTC-4), 14:30 UTC = 10:30 ET — strategy fires 1h after NYSE open. Calendar-fixed UTC is the correct Q1 choice, but the comment misleads. Reword: "14:30 UTC = NYSE open in winter (EST); 1h after NYSE open in summer (EDT). Calendar-fixed UTC chosen per Q1."

## Specific checks
- Q1 calendar-fixed UTC window: yes
- Q2 ATR-mult buffer 0.15: yes
- Q3 active 15:00-17:00 window enforced: yes
- Q4 confidence formula with clamp-before-multiply: yes
- Q5 IE+ST regime mapping only: yes
- Q6 triple-defense (detect+dispatch+SQE whitelist): yes (trusting SQE whitelist claim — diff did not show that file)
- 24/7 symbol guard inside detect: yes
- Idempotent seed SQL: yes (per scope; SQL not in diff body but ON CONFLICT claim is explicit)
- DB-only rollback path documented: yes (orb.ts:32-33 + SQL header per scope)

## Open Q answer
B79.0d locked Q7 as "register now (n=0 OK; cleaner audit trail than retrofit)." The DESIGN comment already claims it was done. Going (A) ships a paper-trail divergence — comment says X, code does not-X. Choose (B): register the ablation in this batch. Metadata-only insert with n=0; small effort, keeps the lock honest, prevents future "did we ever wire that?" archaeology.

(B) include in this batch.

## Ship recommendation
ship after F2 fix (register ablation per Q7 lock, OR correct the comment to "deferred — RUNNING_ISSUE"). F1 + F3 are revisions that can ride alongside.

F2 is the only true blocker — comment-vs-behavior divergence is a NO PATCHES violation per CLAUDE.md §8 #11.
