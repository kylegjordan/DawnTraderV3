**B79.0m.b2 Step 2 — rev2 sign-off**

(a) **Clear to write code.** All 8 rev1 edits land cleanly; the 4 prechecks resolve the open questions; G7 SQL is now correct on the jsonb path.

Walking the edits:
- §-1.1 C-1: Option B is the right call — `min_history_days` stays corpus metadata (matches `global-filter.ts:105-109` convention exactly), per-cycle floor is the 60-bar hard gate. `patternRejectByMinHistory` counter (#7) gives us an instant tripwire if the implementation gets this wrong. Clean.
- §-1.2 C-2: 26 wildcard rows confirmed via psql — no xstock-scoped pattern strategy overrides exist. Acceptable as Layer-1 calibration debt. The fallback-resolution unit test (#5) + G12 (#6) are belt-and-suspenders against silent `undefined` resolution. Good defense.
- §-1.3 C-3: scanPatterns ATR usage audit at `pattern-recognizer.ts:553-554` — pattern geometry is scale-free, ATR appears only on stop/target distance, auto-scales for xstock microstructure. Clean.
- §-1.4 source_pool: confirmed jsonb path (`features->>'sourcePool'`). G7 SQL corrected. No schema migration needed. Clean.
- §-1.5 EXPLAIN ANALYZE: 1.035ms with full index propagation across 13 partitions, sub-millisecond per replay query. Async path is safe at the projected close volume.
- §-1.6 B73 async error surfacing: `[B73-REPLAY][XSTOCK] err=...` log + `b73_xstock_replay_errors` observational counter. Correct posture — no auto-disable yet, monitoring batch can layer alerting later.
- §-1.7 ORB rollback trigger: pre-deploy baseline SQL + post-deploy +1h re-run defined. Single-line revert path documented.
- §-1.8 G12 gate added; §-1.9 counters wired.

**Two minor non-blocking items** — fold into implementation or completion report, your call:

1. **§-1.7 rollback trigger condition could be more deterministic.** Current phrasing — "a new rejection stage appears that's clearly the family gate" — leaves operator judgment in the loop. The family-eligibility gate emits a specific `reject_stage` value (I believe `family_imf_fail` or similar in `vts-runner.ts`); state the exact string in §-1.7 so post-deploy compare is mechanical, not interpretive. If you confirm the canonical reject_stage name when capturing the pre-deploy baseline, drop it into the trigger spec.

2. **Hardcoded 60-bar floor in `pattern-filter.ts`.** Mirroring `global-filter.ts:109` is correct parity for this batch — disagreeing with the existing convention would be scope creep. But per CLAUDE.md §8 #11 (per-asset-class configuration is the default for behavioral knobs), both floors should ultimately live in `module_constants` (e.g., `pattern_pool_gates.min_bars_for_eval` and the equivalent for global-filter). Log as a Layer-3 follow-up in the completion report's calibration-debt section alongside §-1.2/§-1.3. Not this batch.

**Cross-asset risk read on ORB `STRATEGY_FAMILY_MAP['orb'] = 'breakout'`:** I'm satisfied. Crypto regime-strategy map has ORB in STRUCTURAL_TRANSITION + IMPULSE_EXPANSION only — infrequent regimes. Adding the family-map entry will route those rare crypto ORB invocations through `breakout`-family IMF, which is behaviorally tighter, not looser. The §-1.7 rollback trigger catches any unexpected divergence. G10 no-touch fence + crypto byStrategy ORB 7d audit (currently 0) gives us the comparison baseline. Acceptable.

**Q-L1, Q-L2, Q-L3 — confirmed:**
- Q-L1 (1 + N entries for pattern + family fan-out): yes, matches crypto `fx5-scanner.ts:1607-1643` shape. Proceed.
- Q-L2 (ORB family = `breakout` vs `pattern`): `breakout` is right. ORB's `signalType='QUANT'` + range-break geometry argues against `pattern` (which is reserved for `scanPatterns()` chart formations). Proceed.
- Q-L3 (B73 replay branch): adding `db + sql` imports to `exit-strategy-replay-service.ts` is fine; async fire-and-forget, ~10k-bar worst case bounded by partition pruning per the EXPLAIN. Proceed.

**G12 wording nit (very small):** "OR a documented wildcard fallback" — I read this as "the wildcard fallback case must be logged or noted in the completion report when first observed." If that's what you mean, fine. If you mean "the code must emit a log line on every wildcard fallback fire" that's a bigger ask. Confirm in implementation comments which one. Either is acceptable; just want it deterministic.

**Verification gates G1-G12:** complete and unambiguous. G5 + G6 are dependent on RTH market hours — completion report should note actual wall-clock when verification ran so we don't ship a "G6 verified" claim from a pre-RTH snapshot.

Proceed to Step 3 implementation. Capture the ORB pre-deploy baseline + canonical reject_stage name before deploy. Confirm G12 wording on the wildcard-fallback log requirement when you implement.

— Langston
