# B-TOKEN-WATCH-BIRTH-CAP — SCOPE r1: a self-imposed daily cap on new coins tracked, spread across the day, so the study stays on the free Helius tier

change-class: non_architecture
**Owner:** Infra Claude (CC-INFRA) · **Opened:** 2026-11-16 · **Kyle decision:** KD-90 (relayed by PM Claude; Kyle, Desktop 2026-11-16) · **Deadline that is a period, not a promise:** the current Helius credit cycle is projected to run dry about 2026-11-20 (lead on `#1247`, not confirmed), so the cap must be live before then or the feed stops until the cycle resets.
**Plan placement:** KD-90, Infra's next item, ahead of `B-CONVERSATION-INDEX` (PM records the slot).
**Batch class reasoning:** token-watch is a co-tenant study service on the staging box; it touches no trading code, the same class as `B-TOKEN-WATCH` and `B-TOKEN-WATCH-FOLLOWUP-MEMORY`.

---

## 0. KYLE'S DECISION AND THE STUDY'S PURPOSE, VERBATIM

> *"Let's self cap the number of launches we check track per day. We track everything already in our track list and then all of the new coins up to the daily track limit. Right now, we are in observe and learn mode to see if there are ways to identify early (with a relatively high probability) which newly launched coins will go on to become coins that make on to the main exchanges and trade significantly higher."*

He declined the $49/month Developer plan in favour of this. The purpose sentence is also written into `B_TOKEN_WATCH_SCOPE.md` §1 as the study's stated intent (OBJ-7).

## 1. WHY (measured, staging, read-only)

- **Births exceed the free allowance.** Births per month: Sep 956,273 · Oct 1,056,784 (despite an 8-day gap) · Nov 1-15 593,910 (`births/*.jsonl` line counts). The design assumed 20,700/day (`config.py:92`, measured 2026-08-27); the rate is now ~40,000/day.
- **A birth is charged when Helius sends it, not when we keep it:** *"Per event sent by Helius, regardless of successful or failed endpoint responses"* (helius.dev/docs/billing/credits); our ledger books the same (`config.py:323`, `CREDITS["birth"] = 1`). ⇒ **a cap enforced by discarding arrivals saves nothing. The cap must stop Helius sending.**
- **The cycle is not the calendar month (lead, NOT CONFIRMED):** counting credits back from the October stop (10-18T20:24:19Z) the 1,000,000th lands 09-27T10:09Z, and the feed resumed 10-27T00:00:50Z (`#1247`, `bbb63f11c`). Our ledger keys the calendar month (`budget._month_key`), so it cannot see the real boundary. Credits this cycle at 2026-11-16T00:01Z ≈ 824,805 (212,813 Oct 27-31 from the cold journal + Nov 594,163 births + 17,829 liquidity).
- **Stopping the feed costs credits too:** *"Create, edit, delete webhooks"* = 100 credits each (same page). The webhook has no documented pause field (update-webhook reference). So every on/off pair is ~200 credits, which makes the number of windows a day a budget term, not a free choice.
- **Tracking already-listed coins is not a credit problem:** follow-ups use DexScreener (0 credits); Helius liquidity reads were 17,829 credits in Nov 1-15 (~1.2k/day). The follow-up's limit is the DexScreener pacer, already saturated (P10 run 3: ~234 of 240 calls/min) — fewer new coins also relieves that.

## 2. PROVENANCE — WHAT THIS CHANGES AND WHY IT WAS BUILT THE OTHER WAY

- **Tier 1 — the census rule.** Pre-registration §6: *"Census on birth. No sampling. The birth record IS the predictor; a sampled birth record destroys the base rate irrecoverably."* (`B_TOKEN_WATCH_PRE_REGISTRATION.md:47`); scope §5.1 shed order *"births NEVER"*; `config.py` `SHED_ORDER = ("liquidity", "follow_up")`. **Disposition (2): relevant, needs updating to Kyle's decision.** The census was chosen because the base rate was the product. Kyle's stated purpose (§0) is prediction: which new coins reach main exchanges and trade much higher. A sample that is random in time keeps that answerable, with known weights. The pre-registration takes an amendment (OBJ-6) written BEFORE any capped data exists.
- **Tier 1 — the credit budget** (`config.py:124-170`, scope §5.1, Langston r2-r4): reserve 803,000, carve 190,000, 7,000 separation, keyed by calendar month. **Disposition (2):** it is re-derived against the real cycle and the cap.
- **Tier 2 — the receiver, the follow-up job, the dead-man alarm** (`liveness`): read, and changed only where a deliberate quiet window must not page as a dead feed (OBJ-4).

## 3. OBJECTIVES

| # | objective | verified by |
|---|---|---|
| **OBJ-1** | **The cap stops Helius sending, not us discarding.** A controller switches the birth subscription on and off through the Helius webhook API. Every switch is logged and charged to the ledger (100 credits each). | Staging: in an off window, zero webhook deliveries reach the receiver (receiver log), and the ledger shows the edit charges. Re-derived against the Helius usage view that Kyle reads. |
| **OBJ-2** | **The sample is spread across the day.** Listening windows are spaced through every part of the day, with a phase that rotates daily, so no hour of the day is systematically missed. The window count per day is chosen by trading edit cost against even spread (Langston rules; options in §4). | Over 7 days, births per UTC hour of day are within a pre-registered band of the uncapped hour-of-day shape (Sep-Oct reference). |
| **OBJ-3** | **The daily number is computed from the real cycle.** cap_today = (credits left in the cycle − a safety reserve) ÷ days left, minus liquidity reads and switch costs. Births are counted until the cap, then the feed stays off until the next window day. The cycle boundary is set from Kyle's Helius dashboard, or the admin usage endpoint if enabled. Until confirmed, use the measured lead (27th, 00:00Z). | Unit tests on the arithmetic for 28/30/31-day cycles and a mid-cycle start. The cycle date confirmed by Kyle's dashboard before switch-on. |
| **OBJ-4** | **A planned quiet window does not page as a dead feed, and a real failure inside a listening window still does.** | Mutation tests: silence in an off window → no page; silence in an on window → page; a switch-on that fails (the API refuses) → page. |
| **OBJ-5** | **Everything already tracked keeps being tracked.** The cap applies only to new births. The follow-up schedule, liquidity reads and the late pass are unchanged. | The follow-up run counts before/after; no tracked mint is dropped from the due schedule. |
| **OBJ-6** | **Pre-registration amendment, written before capped data exists.** It records census → time-sampled births, the window design, the per-birth sampling weight, and the effect on the study's estimates. The trait-carrier vs control design is unchanged. | Langston approves the amendment text before switch-on; the amendment's commit precedes the first capped birth. |
| **OBJ-7** | **Kyle's purpose (§0) is written into `B_TOKEN_WATCH_SCOPE.md` §1 as the study's stated intent.** | The line is present at the ref. |
| **OBJ-8** | **Live before the cycle runs dry (~11-20).** If it cannot be, the fallback is the natural stop at exhaustion, with Kyle told the date. Nothing is switched on unreviewed to beat the date. | Switch-on recorded with its timestamp, ahead of the cycle's exhaustion. |

## 4. DESIGN CHOICES FOR LANGSTON (Step 1 rulings)
1. **Windows per day** (each on/off pair ≈ 200 credits). Next full cycle (11-27 → 12-27, 30 days, 33,333 credits/day), with liquidity at ~1.2k/day and a 10% launch-spike margin:
   - 24 windows (part of every hour): 4,800/day in switching → **~24,700 births/day, ~60% of ~40k launches**.
   - 12 windows (every 2 h): 2,400/day → **~27,000/day, ~65-68%**.
   - 6 windows (every 4 h, phase rotating daily): 1,200/day → **~28,000/day, ~70%**.
   I recommend 12 with a daily-rotating phase: even spread for 2,400 credits a day. To be ruled.
2. **This cycle's tail:** if live by ~11-18, about 95k credits remain for about 9 days, so ~7k births/day (~17%). The alternative is the natural gap. Recommendation: cap the tail as well, because a thin even sample beats a week-long hole.
3. **How "off" is done:** edit the webhook to a no-match filter vs delete/recreate. The pre-audit measures which is cheaper and which reliably stops deliveries.

## 5. OUT OF SCOPE
PumpPortal or any free birth source (draft `Langston Design Asks/B_TOKEN_WATCH_FREE_BIRTHS_TEST_DESIGN.md`, unplaced); predicted-death filtering at birth; `#1257`; the follow-up throughput finding (P10 observation of `B-TOKEN-WATCH-FOLLOWUP-MEMORY`).

## 6. GOVERNANCE (expected, judged at Step 10)
`B_TOKEN_WATCH_PRE_REGISTRATION.md` amendment · `B_TOKEN_WATCH_SCOPE.md` §1 intent line + §5.1 budget note · SYSTEM_IMPACT_MAP token-watch entry (a new controller holding the external subscription) · RUNNING_ISSUES `#1247` · BATCH_CATALOG · plan row per KD-90.
