# B-TOKEN-WATCH — a free source for new-token births: test design (DRAFT, not a placed batch)

> **Status:** draft by Infra Claude, 2026-11-16, for Kyle's Helius decision (relayed by PM Claude). **No slot yet.** Nothing here is built. Placement goes to Kyle through PM; the design goes to Langston before any code.

## 1. Why (measured, staging, read-only, 2026-11-15)
- Births are all pump.fun (`venue` = `PUMP_FUN` on 37,757 of 37,757 births, 2026-11-14) and each costs **1 Helius credit when Helius delivers it** — "Webhook pushes are 1 credit" (helius.dev/pricing), charged whether or not our endpoint accepts it (helius.dev/docs/billing/credits); our ledger books it the same way (`token-watch/config.py`, `CREDITS["birth"] = 1`). **So any filter we apply after delivery saves no credits.**
- Births/month: Sep 956,273 · Oct 1,056,784 (with an 8-day gap) · Nov 1-15 593,910. The free allowance is 1M/month; the October gap matches its exhaustion (lead on `#1247`, not confirmed).
- Helius webhooks filter only by program/account and transaction type; the subscription is already the narrowest it can be (one launchpad, creation events only).

## 2. Candidate: PumpPortal `subscribeNewToken` (free per its page)
- Unverified, and the test exists to verify them: (a) whether the free stream needs a key or a funded wallet; (b) the payload — third-party logs show `mint`, `traderPublicKey`, `initialBuy`, `vSolInBondingCurve`, `vTokensInBondingCurve`, `marketCapSol`, `bondingCurveKey`, `signature`, `txType`; no official schema found; (c) its terms on storing data; (d) completeness.
- **Completeness is the gate.** Run it side by side with the Helius webhook for N days (N set in the scope, a period whose length is the content) and compare per-mint against both the webhook and the existing windowed chain re-census (`B_TOKEN_WATCH_PRE_REGISTRATION.md` §"Replacement - a windowed chain re-census"). Pre-register the pass bar before the data: e.g. ≥ 99.9% of chain-census mints present, no systematic hole by hour or by creator size.
- **Field fidelity:** every stored birth field (`creator`, `creator_tokens`, `creator_share`, `initial_size`, `created_at`, `signature`) must be derivable from the relay payload or from one cheap read; any field that cannot be is listed with its cost before switching.

## 3. Kyle's idea: stop tracking coins at birth that are predicted to die (added 2026-11-16)
**What it can and cannot save.** On Helius, nothing on births (charged at delivery, §1). With births arriving free from a relay, a birth-time rule could cut the FOLLOW-UP load instead — the DexScreener pacer, which is saturated today (run 3: ~234 of 240 calls/min), and the store — and the few Helius liquidity reads (≈16k credits in Nov 1-15).
**What it would cost the study.** The study measures what happens to new tokens from birth, which ones die, and which launch traits predict it (trait carriers vs controls). Dropping coins predicted to die removes the outcome being measured from the record: the death base rate can no longer be measured, and the rule itself can never be re-checked, because nothing is learned about the coins it excluded. That is selection on the outcome, the bias the census design exists to prevent.
**The form that keeps it honest:** record every birth (free), follow up in full the coins that pass the rule, **and follow up a fixed random sample of the coins the rule excludes** (the case-control design the study already uses for non-carriers, `CONTROL_SAMPLE_PER_DAY`). The sample measures the rule's miss rate, so the rule's own error is visible, and the base rate is recovered by weighting.
**Where the rule comes from:** it must be derived from data the study has already collected and pre-registered before it is applied. ⚠️ **Thin today:** the follow-up sweep was off 2026-09-30 → 11-15, so few births yet have a complete 30-day outcome; deriving a rule is itself a measurement with its own object and population.

## 4. Decision for Kyle (independent of this test)
The ~11-20 credit boundary arrives before any test can finish. Options: pay $49/month (Developer, 10M credits) now and downgrade if the free source proves complete; or stay free and accept the ~11-20 → 11-27 gap while testing.
