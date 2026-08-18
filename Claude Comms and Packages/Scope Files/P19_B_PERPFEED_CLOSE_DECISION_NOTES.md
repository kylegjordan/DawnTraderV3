# P19-B-PERPFEED close-out — three decisions for Kyle

> Drafted 2026-08-18 by CC-C during the pre-deploy window. Each item is a **rule-24 outcome-2** finding: the system is working as designed, and what's missing is a DECISION on how it should behave. Nothing here is a defect fix; nothing is implemented until Kyle picks. Plain-language first; the technical appendix at the bottom is for Langston's review.

---

## Decision 1 — What should happen to trading room after a downward balance reset? (#692)

**What happened:** on August 12 the system's own safety mechanism re-anchored the portfolio balance from $2,250 down to $824. The trades already open had been sized against the old, larger balance — four of them together held about $1,189 of position value, roughly 144% of the new budget. By the system's own rules the portfolio was now over-full, so every new trade was blocked for four days until the old positions closed one by one. Signals kept flowing the whole time; only the opens froze.

**Why it will happen again:** any future downward reset — and in live mode, drawdowns make downward resets routine — recreates the same squeeze whenever positions opened under the older, larger balance are still holding.

**The options:**

- **(a) Accept it as designed cooling-off.** After a drawdown-driven reset, a multi-day pause in new trading is arguably *desirable* — it is the risk envelope refusing to compound into a losing streak. Cost: days of missed opportunity each time; the pause length is accidental (however long the old positions take to close), not chosen.
- **(b) Proportional release.** On a downward re-anchor, scale the exposure budget's accounting of pre-reset positions (value them at their share of the OLD budget, not the new), so room frees gradually rather than binary-freezing. Cost: a real code change in the exposure math; more exposure carried in exactly the moment the system judged riskiest.
- **(c) Bounded cooling-off.** Keep the freeze but give it a chosen duration (e.g. 24h) after which pre-reset positions stop counting against the new budget at full weight. Middle ground; introduces a new tunable.

**Recommendation:** (a) for paper mode now — the behavior is conservative and the cost is only learning-data slowdown — revisit (c) before Phase 21 live, where a multi-day involuntary trading halt has real opportunity cost and the pause length should be a decision, not an accident.

---

## Decision 2 — Should formula-audit failures raise alerts? (#690 companion)

**What happened:** the daily formula audit had been reporting the RSI inversion as FAIL for days — into a report file nobody reads. It surfaced only because a scheduled-task miss led a session to run the audit by hand. The audit has no wiring into the alert queue; only its *cron-missing* has an alert, not its *findings*.

**The options:**

- **(a) Wire FAIL/WARNING results into the §10.5 alert queue** (severity: warning), so a failing formula surfaces on every session's per-turn check within a day. Cost: small, one write path; risk of alert fatigue is low because the audit is currently all-green (post-fix) and a new FAIL is genuinely rare news.
- **(b) Leave as-is** and rely on sessions reading the daily report. This is the state that just hid a real defect for days.

**Recommendation:** (a). The audit exists to catch drift; findings that reach no one are indistinguishable from no audit. One-evening change, fits a governance mini-cycle through Langston.

---

## Decision 3 — The storage-gauge denominator (#689)

**What happened:** one of the storage dashboard's fractions divides a windowed numerator by a since-process-start denominator, so it reads low by construction once uptime exceeds the window — at ANY retention setting. It was filed at Langston's request during the OHLC retention ruling, explicitly NOT pre-labeled a defect.

**The options:**

- **(a) Fix the denominator to the same window** as the numerator — the fraction then means what a reader assumes it means.
- **(b) Relabel the gauge** to state what it actually measures (lifetime-fraction), no code-math change.
- **(c) Retire the gauge** if nothing decisions off it.

**Recommendation:** (a), scheduled into the next storage governance batch (B-DAILY-CUTOVER-SWEEP, #688) rather than its own batch — it is one fraction in one aggregator, and that batch already touches the same surface.

---

## Technical appendix (for Langston)

- **D1:** the freeze mechanism is the interaction of the #632 divergence re-anchor (anchorVersion 4, $824.11 since 08-12) with exposure accounting in the fixed-notional sizer era (B-SIZING-DEC-RESTORE, 213e162dc). Measured: open notionals BMNR $254 + INTC $259 + ZTS $262 + OOB $414 = $1,189 vs ~$824 budget; zero opens across ALL classes 08-13→16 (`closed_trades`, 21-day window); signal admissions CONTINUED through the freeze (`signal_eval_archive` source='signal-orchestrator' reject_stage='admitted': crypto 933/796 on 08-12/13, xStock 27/45). Option (b) would touch `active-position-sizing.ts` exposure accounting; option (c) adds a time-decay term to the same. Full record: RUNNING_ISSUES #692.
- **D2:** wiring point is `server/jobs/formula-auto-audit.ts` (the finally-block that writes the audit row) → the `system-alerts` CLI/store used by §10.5; FAIL/WARNING statuses only; dedup key = formula name so a standing FAIL re-fires on the widening back-off rather than daily-spamming. Related instrument finding (same day): the §10.5 per-turn `tail -50` read cannot reach old unacked alerts (674-id event-sourced file) — the check command needs a last-state-per-id read; crew-flagged 2026-08-18.
- **D3:** `ohlcStoreFraction` in the storage aggregator (windowed numerator / since-boot denominator). Homed per #689; the (a) fix is scoped for #688 B-DAILY-CUTOVER-SWEEP.
