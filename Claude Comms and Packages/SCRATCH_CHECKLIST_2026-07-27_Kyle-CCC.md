# SCRATCH CHECKLIST — Kyle ⇄ Claude Analyst (CC-C) — started 2026-07-27

> ⚠️ **TEMPORARY WORKING SCRATCH LIST.** Not governance. NOT in RUNNING_ISSUES or any tracked/maintained list. Not to be recreated or kept long-term. Just a shared checklist Kyle and I work through, then delete. Order of play: do PART A (cleanup, easiest→hardest) + PART B (doc verification, ongoing), THEN move to PART C (debate topics with the group + Langston).

---

## PART A — CLEANUP / FIX ITEMS (do first; easiest → hardest)

- [ ] **A1. Rules-freshness review: daily → weekly** (Kyle approved). Trim to the one human-signal (a session sitting on unsaved rulebook edits). *[easiest — schedule change, no trading-code touch]*
- [ ] **A2. Exploration-lane marker column** on the Open + Closed Trades tables — show which trades came in on the exploration lane. Data already stored (admissionBasis). Display-only; removable when we leave exploration mode.
- [ ] **A3. xStock blank columns** — Volume/Order-Book and Global-Regime don't fill for xStocks (they fill for crypto). Suspected same root: the xStock path isn't stamping the shared market-context fields onto its trades. (Took Volume/Order-Book over from New Claude — coordinate so we're not both on it.) NOTE: Pool (ideal/rotational) blank for xStocks is CORRECT — leave it.
- [ ] **A4. Exploration anneal-counter defect** — the counter that should count only filled-AND-closed exploration trades has no "is it closed?" check, so it also sweeps in open + orphaned exploration rows (reads 188 vs the true 184 filled-and-closed). Fix (require closed_at). Tangled with A5. *(verified 2026-07-27 against live DB + code)*
- [ ] **A5. Crypto orphan close-path** — 3 exploration-crypto rows (AVAX, ETH, MET) written at open, position gone, close details never filled in. Find why the close doesn't always update the record; fix the path; clean up the 3 stale rows (Kyle OK before editing production data).
- [ ] **A6. Slippage / negative-cost bug** — closed trades store entry+exit slippage negative, making total cost negative and flipping losses to green net (e.g. ONDO stop-loss showing +6.98%). Fix the slippage sign/reference; total cost must never go negative from slippage. ⚠️ Cost data is reportedly stored in columns NAMED after the old scores — verify before touching. Check who worked this last week (touched in another sub-batch). *[hardest of the fixes]*

## PART B — DOCUMENT / VERIFICATION (ongoing, alongside A)

- [ ] **B1. Flow-document verification pass** — re-verify EVERY stage already written against the code (after the xStock error). Mark each stage verified-vs-code or not-yet-verified. The document states only proven-working truth and is updated as we fix/prove each piece; it only goes as far as what we've worked on, repaired, and proven.

## PART C — DEBATE TOPICS (group + Langston — AFTER Part A/B)

- [ ] **C1. 24-hour trade caps** — do we cap trades to close within 24h (or force-close them)? Folds in the immediate TSM/MU 9-day-open question.
- [ ] **C2. Friday early-shutdown for xStocks** — do we stop opening / close out xStock trades early on Fridays so they don't carry into the weekend pause?
- [ ] **C3. xStock off-hours liquidity study → time-of-day admission gating** — study how each xStock's order-book value/volume behaves across a FULL day (US trading hours vs off-hours); categorize xStocks by that full-day activity/volume; then define, per category, WHEN it's permissible to open a trade in that xStock.
- [ ] **C4. What are our strategies actually targeting? (the deep one — the right framing of "hold longer")** — the "should signals hold longer than a few hours" question really belongs at signal GENERATION: what are our included strategies aiming for / targeting? Can we affect/influence the Net-EV target size a strategy uses to create a signal? If so, raising each strategy's Net-EV target may be a lever against the fee wall (bigger target → bigger required move → fee is a smaller share of gross) and would likely lengthen holds. First understand what each strategy targets, THEN decide how that factors into working around the fee wall / Net-EV.
- [ ] **C5. Learning-data strategy vs the fee wall** — exploration lane is winding down (~184/240 useful closes); once it shuts, the fee wall holds the normal lane near zero flow. How do we keep generating useful learning data for Phase 25 while improving the pipeline — extend the exploration budget, attack the fee wall directly, or a mix? (C4 feeds this.)

---
*Delete this file once Parts A/B are done and Part C has been debated.*
