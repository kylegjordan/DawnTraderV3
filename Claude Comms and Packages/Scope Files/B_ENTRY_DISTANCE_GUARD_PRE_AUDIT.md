# B-ENTRY-DISTANCE-GUARD — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** row 59 increment 1 (pre-sprint P1a) · **Owner:** CC-B · **change-class:** architecture · **Scope:** `B_ENTRY_DISTANCE_GUARD_SCOPE.md` (Step 1 PROCEED, Langston 2026-10-11, five findings in its §7).

## 0. PRE-REGISTRATION — committed BEFORE any measurement below is run (Langston FINDING-4; the `#1052` method)

**Read time:** every query in §1 runs against the staging database and states its UTC read time and the deployed sha.
**Populations (Langston FINDING-4 on the three entry columns):**
- **P-taker** = active-lane paper opens with `chosen_entry_mode` not `'maker'`, where the booked fill is `actual_entry_price` (closed) or `avg_price` (open) and the birth price is `intended_entry_price`. A row with `chosen_entry_mode = 'maker'` is EXCLUDED from every OBJ-1/OBJ-2 count (its `entry_price` is the limit). A row with a null `intended_entry_price` or null fill is counted separately and named, never dropped silently.
- **Window W1 (primary corroborating):** opened since the paper reset, 2026-10-06T15:53Z. **Window W2 (labelled, wider, different settings era):** opened since 2026-09-06. Any W2 number is reported as W2 and never pooled with W1.

**OBJ-1 (refuse at or through stop or target) — measured, no decision rides on it:** the count in P-taker of `fill <= stop_loss` and of `fill >= take_profit`, per class, per window, with the rows named. Expected (from `#1168`/`#915`): STZ, CEG, INTC, CRCL in W1; Langston's 7 crypto rows in W2.

**OBJ-2 (RR at the fill vs the live `min_rr`) — the LIVE / SHADOW decision:**
- **PRIMARY — the headroom table:** for every (canonical strategy × class) cell that can open on the active lane, the RR its geometry produces (constant, or variable with its driver), the live `min_rr` it resolves (staging `module_constants`, read at the stated time), and for constant-RR cells the adverse tolerance **t = (RR − floor) / (1 + floor)** as a fraction of the stop distance R.
- **CORROBORATING — the observed count:** in P-taker, W1, per cell, how many opens had `rr_fill = (take_profit − fill) / (fill − stop_loss) < live min_rr` (computed with TODAY's floors, labelled counterfactual), and the adverse slip `(fill − intended) / (intended − stop_loss)` in units of R (median, p90, max) per class.
- **DECISION RULE (fixed now):** OBJ-2 ships **LIVE** only if BOTH hold: **(a)** for every constant-RR cell that opened in W1, its tolerance t is greater than that class's observed p90 adverse slip in R (W1; W2 if W1 has fewer than 10 taker opens in the class, labelled); and **(b)** the W1 corroborating would-refuse share is at most 5 % of P-taker in each class, excluding rows OBJ-1 already refuses. **Otherwise OBJ-2 ships in SHADOW** beside the band, and the headroom table goes to Langston as the evidence that the floors (a calibration matter, `ADJUSTMENT_FRAMEWORK` clause 2) — not this check — are what would need to move. A cell that never opened in W1 is reported as **"no observation"**, never as a pass (`#661`).

**FINDING-2 (unknown strategy tokens):** the distinct `strategy_name` values in P-taker (both windows) and in the current `rtb_signals`, each run through `resolveCanonicalStrategy`. **Rule:** any token that canonicalizes to null blocks OBJ-2 LIVE until it is resolved, whatever (a)/(b) say — an unknown token resolves the class's maximum floor and would refuse outright.

**OBJ-4 (the fabricated 2 % target):** the count of current `rtb_signals` rows with a null `target_price`, and the count of P-taker rows (both windows) whose `take_profit / intended_entry_price` equals 1.02 within 1e-9. Zero on both ⇒ the fallback never fired in these windows and its removal is a fail-closed change with no observed population.

**§3 maker question (measured, ruled by Langston):** the count of `chosen_entry_mode = 'maker'` opens (both windows) whose recorded entry-decision ask (`entry_decision_price` on closed rows; the metadata stamp on open rows) was at or below `stop_loss` when the maker filled.
