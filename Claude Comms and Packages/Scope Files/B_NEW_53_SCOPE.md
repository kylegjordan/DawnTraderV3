# B-NEW-53 — Decision-provenance capture (the general fix for RUNNING_ISSUES #206) — SCOPE (Step 1, for Langston ACK)

**Date:** 2026-06-07. Kyle-directed (2026-06-07): build the CAPTURE now (pre-Phase-19, roadmap item 19-20) so forward data accrues immediately; the STUDY that consumes it (the entry-trigger replay/sweep) stays in Phase 25. **Read-only on the live decision (additive telemetry; active trading OFF). No behavior change to any trade.**

## 1. Why (the problem this closes — Langston-endorsed)
Three studies hit the same wall — W2.0a Mode-A (geometry anchors), the RI-a stop-anchor-persistence gap, and B.5 W2.0b (entry-trigger) — because the engine's **exact decision-time inputs are not persisted**, so no backward replay reproduces a live decision to ≥99% (W2.0b maxed 80%; the irreducible residual is the in-progress forming bar + the resolved constants). The fix is **one general decision-provenance capture** at the archive layer, not a per-strategy patch. Capture and study are **decoupled** (like the AMR body/brain split): the capture is built now; every future parity/calibration study — every strategy, every asset class — then becomes exact-replayable as the data accrues.

## 2. The lean design (settled bars already persisted → reference, don't duplicate)
The W2.0b snapshot run proved the **settled 15m bars are already persisted** in `xstock_spot_ohlc_15m_snapshot` (feeding them lifted parity 62→80%). So the capture does NOT store ~240 bars/decision. Net-new per archived decision:
- **(a) the forming (in-progress) bar** — the single current-bucket OHLCV the engine evaluated at decision time (the irreducible 20% gap);
- **(b) the resolved `module_constants`** the gate used (the strategy's resolved numbers for that decision) — as a compact JSONB or a versioned hash (closes the "did the gate move under us" confound permanently);
- **(c) a settled bar-set reference** — `(symbol, as-of bucket_ts, bar-count, interval)` so the replay pulls the exact settled bars from the snapshot table;
- **(d) the geometry anchors (RI-a unification)** — the stop/target anchors the engine used (live VWAP value / detectRange boundaries / pattern structural-low / ATR-at-decision). **One capture record satisfies both #206 (detect inputs) AND RI-a (stop anchors) — one layer, not two (Langston).**

## 3. Numbered objectives (verification criteria)
1. **Schema:** persist (a)–(d) per archived decision. **Storage approach is the #1 Step-2 design decision (settle before code, §8 #11):** new JSONB column(s) on `signal_eval_archive` vs a separate `signal_eval_provenance` table keyed by decision id. Decide on storage-cost grounds — the archive takes millions of decision rows/month (vwap_pullback alone ~884k/30d), so the forming-bar+constants payload must be measured and bounded. *Verify:* a written per-row byte estimate + projected monthly growth vs the current archive tier headroom (coordinate with the B75 tiered-storage sweep).
2. **Writer:** thread (a)–(d) into `archiveSignalEval` (`signal-eval-archiver.ts`) from the two hook sites (`vts-runner.ts:~1374`, `signal-orchestrator.ts:~638`) where the forming bar + resolved constants + anchors are already in scope at decision time. *Verify:* new decisions write the provenance; old rows are NULL (forward-only, no backfill).
3. **RI-a unification:** the same record carries the stop-anchor provenance. *Verify:* RI-a's forensic-anchor need (full stop-anchor trail) is satisfied by these fields; RI-a does not get its own separate persistence mechanism.
4. **Proof-of-capture (the key verification):** re-run the W2.0b detect-replay harness against decisions **captured by this batch** (fed the persisted provenance instead of reconstructing) → it must hit **~100% Tier-1 parity** (vs the 80% backward ceiling). This is the proof the capture is sufficient for exact replay. *Verify:* parity ≥99% on captured rows.
5. **Defined exit (self-clearing data-block):** once the capture is live and writing, set a §10.5 scheduled system-alert keyed on a concrete accrual condition (row-count threshold or a date) that re-surfaces "W2.0b/entry-trigger is now backward-replayable — resume the sweep." *Verify:* the alert is registered.
6. **Safety:** additive only; no change to the fire/no-fire decision or any trade behavior; failure to write provenance must NOT block the decision or the existing archive write (best-effort, try/catch, same as the existing archive hooks). *Verify:* a forced provenance-write failure leaves the decision + base archive row intact.

## 4. Out of scope
- The STUDY (entry-trigger replay/sweep) — Phase 25, after data accrues.
- Backfill of historical decisions — impossible (the inputs weren't saved); forward-only.
- Crypto-specific tuning — the capture is asset-class-general by construction (it captures whatever the engine evaluated), so crypto provenance is captured too at no extra design cost.

## 5. Questions for you (Step-1)
1. **Storage:** new JSONB column(s) on `signal_eval_archive` vs a separate `signal_eval_provenance` table (1:1 by decision id)? My lean: a separate table keyed by `(captured_at, symbol, strategy)` or a decision id — keeps the hot archive row narrow, isolates the heavier payload, and lets us put it on its own retention/tier. Your call.
2. **Constants:** persist the full resolved constant set per decision (compact JSONB) vs a hash + a versioned `module_constants` snapshot table the hash references? Hash-and-reference is cheaper but needs the version store; full-set is simpler but bigger. Given constants change rarely, I lean hash-and-reference against a small constants-version store.
3. **Forming bar source:** confirm the forming bar is exactly the last element of the `ohlcData` array passed to `computeContext`/detect at the decision site (so we capture what the engine actually saw, not a re-fetch). I believe yes — confirm.
4. **RI-a fields:** which exact stop-anchor fields satisfy the RI-a forensic-trail need (per its §8 #11 full-anchor-trail) — VWAP value, detectRange low/high, pattern structural-low, ATR-at-decision, and the chosen-stop formula id? I'll enumerate per-strategy in Step-2; confirm the set is right.
5. **Scope size:** is this one batch, or do you want the storage-design decision as its own short pre-batch (decide schema first, then implement)? My lean: one batch, with the storage decision settled in the Step-2 pre-audit before any code.

**On your ACK I draft the Step-2 pre-audit (SIM consult on `signal_eval_archive` consumers + the storage-cost analysis + the per-strategy anchor enumeration), then implement.**
