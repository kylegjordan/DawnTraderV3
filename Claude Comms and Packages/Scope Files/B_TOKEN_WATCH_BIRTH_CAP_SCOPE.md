# B-TOKEN-WATCH-BIRTH-CAP — SCOPE r2: a self-imposed daily cap on new coins tracked, scheduled by time across the day, so the study stays on the free Helius tier

change-class: non_architecture
**Owner:** Infra Claude (CC-INFRA) · **Opened:** 2026-11-16 · **Kyle decision:** KD-90 (relayed by PM Claude; Kyle, Desktop 2026-11-16) · **Period that sets the pace:** the current Helius credit cycle is projected dry about 2026-11-20 (lead on `#1247`, not confirmed).
**Plan placement:** KD-90, Infra's next item, ahead of `B-CONVERSATION-INDEX` (PM records the slot).
**Class:** token-watch is a co-tenant study service on the staging box; no trading code; same class as `B-TOKEN-WATCH` and `B-TOKEN-WATCH-FOLLOWUP-MEMORY` (Langston C-11, approved).
**r1 → r2 (Langston Step 1, Discord `1571684619387146251`, read at `31958b4b3`):** rulings 1, 1b, 1c, 2 and 3 are written into §3-§4 as decided; C-1 → OBJ-1's instrument; C-2 → OBJ-4's switch-off-failed arm; C-3 → §4.3 decided on failure direction; C-4 → §2 Tier-2 disposition for the dead-man alarm; C-5 → §2 split, `NEVER_SHED` stays. C-6 to C-12 are carried into Step 2 (§7).

---

## 0. KYLE'S DECISION AND THE STUDY'S PURPOSE, VERBATIM

> *"Let's self cap the number of launches we check track per day. We track everything already in our track list and then all of the new coins up to the daily track limit. Right now, we are in observe and learn mode to see if there are ways to identify early (with a relatively high probability) which newly launched coins will go on to become coins that make on to the main exchanges and trade significantly higher."*

He declined the $49/month Developer plan in favour of this. The purpose sentence is written into `B_TOKEN_WATCH_SCOPE.md` §1 as the study's stated intent (OBJ-7, landed with r1 at `b86ea91fd`).

## 1. WHY (measured, staging, read-only; re-derived by Langston from `public/summary.json` `launches.by_day`)

- **Births exceed the free allowance.** Births per month: Sep 956,273 · Oct 1,056,784 (despite an 8-day gap) · Nov 1-15 593,910 (`births/*.jsonl` line counts; Langston's summary read: 956,271 · 1,056,783 · 594,159 at a later snapshot). The design assumed 20,700/day (`config.py:92`, measured 2026-08-27); the rate is now ~39,600/day.
- **A birth is charged when Helius sends it, not when we keep it:** *"Per event sent by Helius, regardless of successful or failed endpoint responses"* (helius.dev/docs/billing/credits); our ledger books the same (`config.py:323`, `CREDITS["birth"] = 1`). ⇒ **the cap must stop Helius sending; discarding arrivals saves nothing.**
- **The cycle is not proven to be the calendar month (lead, NOT CONFIRMED):** counting credits back from the October stop (10-18T20:24:19Z), the 1,000,000th lands 09-27T10:09Z, and the feed resumed 10-27T00:00:50Z (`#1247`, `bbb63f11c`). The vendor page says only *"Credits reset monthly"*, so neither the ledger's calendar month (`budget._month_key`) nor the 27th has vendor support. Credits this cycle at 2026-11-16T00:01Z ≈ 824,805 (212,813 Oct 27-31, exact per Langston; Nov 594,163 births + 17,829 liquidity).
- **Switching costs credits:** *"Create, edit, delete webhooks"* = 100 credits each; no pause field is documented (update-webhook reference). An on/off pair = 200 credits by edit+edit or by delete+create — identical.
- **Already-tracked coins are not a credit problem:** follow-ups use DexScreener (0 credits); Helius liquidity reads ~1.2k/day (17,829 in Nov 1-15). They draw from the SAME pool as births, so an exhausted pool stops them too (Langston, ruling 2).

## 2. PROVENANCE AND DISPOSITIONS

- **Tier 1 — the study-design rule.** Pre-registration §6: *"Census on birth. No sampling. The birth record IS the predictor; a sampled birth record destroys the base rate irrecoverably."* (`B_TOKEN_WATCH_PRE_REGISTRATION.md:47`) and scope §5.1 *"births NEVER"* (shed order). **Disposition (2): relevant, updated by Kyle's decision.** The census was chosen because the base rate was the product. KD-90 overrides *no sampling*; it does not override *the sample must be stateable* (pre-registration `:45`: *"Don't tune the schedule to the budget"*). So the replacement is a time sample with a known, measured inclusion probability, written as a pre-registration amendment (OBJ-6). The census period 2026-08-31 → switch-on stays as its own stratum and is the base-rate anchor.
- **Tier 1 — the code shed set, SPLIT FROM THE RULE (C-5).** `NEVER_SHED = ("birth", "delivery")` (`config.py:176`) and `SHED_ORDER = ("liquidity", "follow_up")` are **disposition (1): relevant and correct, unchanged.** The budget shed is an accept-side discard, and discarding a delivered birth burns its credit anyway (§1) — moving `birth` into `SHED_ORDER` would build the thing §1 proves saves nothing, and lose the row too. **The cap lives only in the new controller.**
- **Tier 1 — the credit budget** (`config.py:124-170`, scope §5.1, Langston r2-r4: reserve 803,000, carve 190,000, 7,000 separation, calendar month). **Disposition (2):** re-derived against the cycle and the cap; the `:337` reserve assert moves to the cap term (§7 C-6).
- **Tier 2 — the dead-man alarm (C-4).** `liveness.check()` (`token-watch/liveness.py`, B-TOKEN-WATCH Step 6, `17713672b`, Langston's catch): built to detect a TOTAL stop at zero credits, because a long window with zero recorded census rows is *"a Poisson impossibility"* against the known arrival rate, and to write a gap record so unknown loss becomes known, bounded, excludable loss. Run every few minutes by `ops/feed_watch.py` (B-TOKEN-WATCH-STORAGE, after `#1247` showed it had only logged). **Disposition (2): relevant, needs updating** — a scheduled off window is a planned silence and must be recorded as such (not as a loss gap, not as a page); silence inside an on window must still page and still write a gap record; births inside an off window prove the switch-off failed and must page (OBJ-4). Its measured behaviour across a switch boundary is a Step-2 item.
- **Tier 2 — the receiver and the follow-up job:** read only; unchanged except that births carry the window they arrived in (for weights).

## 3. OBJECTIVES

| # | objective | verified by |
|---|---|---|
| **OBJ-1** | **The cap stops Helius sending.** A controller switches the birth subscription on and off through the Helius webhook API; every switch is charged to the ledger (100 credits). | **Primary (C-1): the Helius credit counter's delta across an off window of stated length ≈ switch cost only, with the positive control of the counter advancing across an equal-length on window the same day.** Receiver silence is supporting only — it is also consistent with Helius sending and delivery failing (full spend). |
| **OBJ-2** | **Scheduled by TIME, not by count (ruling 1b).** Each day has W windows of fixed on-duration, evenly spaced, with a phase that rotates daily; inclusion probability = the measured on-time fraction, known in advance. **W is derived (ruling 1): switching ≤ 8% of the day's birth allowance, floor 4, ceiling 12** → 12 for a full cycle, 4 for this cycle's tail. | Over 7 days, births per UTC hour of day sit within a pre-registered band of the uncapped Sep-Oct shape (comparator's reach established at Step 2, C-7). |
| **OBJ-3** | **The credit cap is a BACKSTOP, fixed once per cycle (ruling 1b).** At cycle start: allowance/day = (cycle credits − reserve − liquidity reserve − switching) ÷ cycle days, computed once, never recomputed daily. The on-duration is set from it and the expected launch rate. If a day hits the allowance before its schedule ends, the feed stops and the day is logged **truncated**. The cycle boundary comes from Kyle's Helius dashboard (or the admin usage endpoint if enabled); until confirmed, use the conservative (earlier) boundary, the 27th 00:00Z. | Unit tests: 28/30/31-day cycles, a mid-cycle start (the tail), the backstop firing → a truncated-day record. The boundary confirmed by Kyle's dashboard before switch-on. |
| **OBJ-4** | **Every switch state is checked, both directions (C-2).** (i) After each switch, read the webhook back from the API and page on mismatch. (ii) **Births recorded inside a scheduled off window page as a failed switch-off.** (iii) Silence inside an on window pages and writes a gap record, as today. (iv) A planned off window writes a *planned-off* record, never a loss gap, and does not page. | Mutation tests for each arm, including a switch-off that "succeeds" at the API but keeps delivering (arm ii). The read-back's credit cost is measured at Step 2 (GET is unpriced). |
| **OBJ-5** | **Everything already tracked keeps being tracked.** The cap applies only to new births; follow-up schedule, liquidity reads and the late pass are unchanged; liquidity reads keep their reserved share of the pool (ruling 2). | Follow-up counts against a **pre-cap baseline window of equal length** (C-8: the DexScreener pacer is already saturated, so a drop can be inherited, not caused). |
| **OBJ-6** | **Pre-registration amendment, committed before the first capped birth (ruling 3).** It states: (a) the weight = the **measured** on-time fraction from the persisted switch timestamps, never a design constant; (b) what is **lost** — no complete per-day population on capped days, so no "first coin carrying trait X" claim and no absolute graduate count there — and what survives: weighted base rates and the trait-carrier/control contrast; (c) backstop-truncated days as their own stratum, excluded or re-weighted; (d) **2026-08-31 → switch-on as a CENSUS stratum**, no pooling across the boundary without weights; (e) written as a decision, not as though the census had been a mistake. | Langston approves the text; its commit precedes the first capped birth. |
| **OBJ-7** | Kyle's purpose (§0) in `B_TOKEN_WATCH_SCOPE.md` §1. | ✅ Present at `b86ea91fd`. |
| **OBJ-8** | **Exact on and off timestamps per switch are persisted (ruling 1c)** — requested time, API-confirmed time, and read-back result — in an append-only switch log the analysis reads. | The log reproduces each day's on-time fraction; a missing entry fails the weight computation loudly. |
| **OBJ-9** | **Live before the cycle runs dry (~11-20)**, with the tail capped (ruling 2). If it cannot be, the fallback is the natural stop, with Kyle told the date. Nothing is switched on unreviewed to beat the date. | Switch-on timestamp ahead of exhaustion. |

## 4. DESIGN — RULED (Langston, final)
1. **Windows per day: derived** (OBJ-2). Full cycle: 12 windows, e.g. 81 min on in each 2-h block (67.5% on-time), longest off-block 39 min — chosen for burst resolution (a 45-60 min launch wave is always partly caught), not hour-of-day evenness, which phase rotation gives at any count. This cycle's tail: 4 windows.
2. **Cap the tail.** A natural gap also stops the liquidity reads on the ~1.86M coins already tracked, which breaks the first clause of Kyle's instruction; October's stop left 7 fully blind days.
3. **How "off" is done — decided on failure direction, not cost (C-3).** Both forms cost 200 per pair. A failed re-create leaves NO subscription, with a quiet receiver as the only symptom; a failed re-edit leaves the object alive and recovery is one more edit. ⇒ **edit, not delete/recreate**, provided Step 2 shows an edit can produce a true no-match: an empty `accountAddresses` is undocumented and may be refused; the undocumented `txnStatus` is a second candidate. Both tested at Step 2; delete/recreate only if neither works.

## 5. NUMBERS (indicative; Step 2 fixes them against the confirmed boundary)
- **Full cycle (30 days, 33,333 credits/day):** liquidity ~1.2k/day, switching 12 × 200 = 2,400/day, a launch-spike reserve → births ≈ 27,000/day at 67.5% on-time of ~39,600 launches.
- **This cycle's tail:** if live ~11-18, ~95k credits for ~9 days; 4 windows (800/day switching) → roughly 8,500 births/day (~21% on-time). Step 2 recomputes from the counter on the switch-on day.

## 6. OUT OF SCOPE
PumpPortal or any free birth source (draft `Langston Design Asks/B_TOKEN_WATCH_FREE_BIRTHS_TEST_DESIGN.md`, unplaced); predicted-death filtering at birth; `#1257`; the follow-up throughput finding (`B-TOKEN-WATCH-FOLLOWUP-MEMORY` P10). Instrumenting the graduation base rate (Langston's note to Kyle) is a candidate for Kyle's list, not this batch.

## 7. CARRIED INTO STEP 2 (Langston C-6 to C-12)
- **C-6** rewrite the `config.py:337` reserve assert to the cap term, and rewrite the `:330-336` tripwire comment rather than stacking on it.
- **C-7** establish that birth records carry a true arrival timestamp at hour resolution for Sep-Oct (independent of the summary's approximated birth-day split), and exclude October's 7 blind and 2 partial days from the reference shape.
- **C-8** OBJ-5's pre-cap baseline window of equal length.
- **C-9** governance: `PHASE_HISTORY` is REQUIRED for this class.
- **C-10** the 7-day observation: an `open` row in `1-system-manual/DEPLOY_WINDOWS.jsonl` in the Step-2 commit; if observation runs on a progress report, a declared-`open` row in `GOVERNANCE_EXCEPTIONS`.
- **C-12** the delivery-board card (created with this r2).

## 8. GOVERNANCE (judged at Step 10)
Required (non_architecture): scope · pre-audit · completion report · `BATCH_CATALOG` · **`PHASE_HISTORY`**. Expected: `B_TOKEN_WATCH_PRE_REGISTRATION.md` amendment · `B_TOKEN_WATCH_SCOPE.md` §5.1 budget note · `SYSTEM_IMPACT_MAP` token-watch entry (a controller holding external subscription state) · `RUNNING_ISSUES` `#1247` · the plan row per KD-90.
