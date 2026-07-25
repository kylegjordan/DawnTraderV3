# CURRENT RUNNING ISSUES — live paper-mode trading

**Opened 2026-07-24 by Claude Analyst (CC-C) on Kyle's directive.** A board of things wrong with the
**system as it is running right now**, to be farmed out and fixed now rather than queued.

**This is NOT `RUNNING_ISSUES.md`.** That is the governance ledger and stays the permanent record —
anything here that turns out to be a real defect gets a number there. This file is the working board:
short-lived, operational, and deleted or emptied once its items are homed.

## How to read the confidence markers — this is the point of the file

| Marker | Means |
|---|---|
| **MEASURED** | I ran it and this is the output. Quote it. |
| **READ IN CODE** | I read the file at the ref and cite `path:line`. |
| **NOT DETERMINED** | I do not know, and I am not guessing. **Do not promote this to a cause.** |

Per CLAUDE.md rule 24, "that's a bug" is a hypothesis. Rule 24.a: a **symptom** is free to announce; a
**cause** is a claim that sends people to work. Everything below that is a cause is marked NOT DETERMINED
unless I read it in code.

---

## ★ KYLE'S GOVERNING THEORY (2026-07-24) — read this before working any item below

> *"I think that with the recent batches that we've been running, we've unlocked some bugs and some
> functionality that we didn't realize was there. It was being blocked by other things in the way, and had
> now been cleared out."*

**CONFIRMED for item 2, in the implementing batch's own comment** (`signal-orchestrator.ts:1089-1097`): the
max-hold value *"died here and the exit engine's `max_holding_period` branch was skipped for **EVERY
position**. Measured: 0 of 15 live positions carried it, and there are **0 max_holding_period closes in the
entire closed_trades history**… that stamp comment also says 'active trading is OFF — changes no live
behavior today' (2026-06-06); **it is ON now, so a dormant forward-prep guarantee had quietly become
load-bearing.**"*

**So the default posture for every item here is NOT "what did we break?" but "what did we switch on?"**
Several behaviours changed within days of each other; a re-activation explains a cluster like that far better
than several independent new defects do. **Check whether each behaviour ever worked before you look for what
broke it** — `SELECT ... GROUP BY close_reason` with a first-seen date answers that in one query, and for
item 2 it was decisive (4 closes ever, all on one day).

**⚠️ And the corollary that is easy to miss: a re-activated path's CONSTANTS were set while it was dormant,
so they were never decided — only shaped.** The 24h limit was written 2026-06-06 as a unit-normalisation
change while active trading was OFF, so it could not affect anything and was never put to Kyle as a trading
policy. **Kyle has never approved a 24-hour holding limit, and it is now enforcing on live paper positions.**
When you re-activate a dormant path, its numbers need re-approval, not just verification that they flow.

---

## 1. The ready-to-buy pool has collapsed from ~100 signals to 1–2 — ★ RESOLVED 2026-07-25 (diagnosed; NOT a bug)

**Owner: CC-C (Claude Analyst)** — taken over from CC-A per Kyle 2026-07-25. **Bundles #570** (handed to CC-C by Langston/CC-A). The original CAUSE-NOT-DETERMINED investigation below is kept for the record.

**★ VERDICT (rule 24, outcome 2 — WORKING-AS-DESIGNED, a fee-viability scope call, NOT a code defect):**

- **NOT the refresh.** The RTB refresh reconfirms ~everything: 210,271 reconfirmed of 210,289 attempted over 10 days, **18 rejected** (funnel `active-engine/diagnostics/funnel`). A regime-input miss LEAVES the signal queued (`ready_to_buy_service.ts:1049-1055`), it does not delete. Ruled out with data.
- **The break is admission, at the generation EV gate.** Two-sample funnel delta over 120s: crypto generated **+75**, evaluated **+76**, **passed +0**. Every reject reads `NetEV <= 0 (chosen maker mode — non-positive net expectancy after friction)` — measured in `gate_decision` (SUI/USD `-0.003365`, ONDO/USD `-0.001477`). The pool is empty because the organic gate correctly refuses signals that lose money after Kraken's 0.40%/0.80% fees — **the fee wall.** Reject values cluster just below zero: the fingerprint of marginal signals tipped under by fees, i.e. a CORRECT computation, not a broken one.
- **NOT a code or config regression.** Git: since 2026-07-21 the ONLY commit to the generation SQE / SQE evaluator / exploration lane / NetEV math (`decideMakerTaker`, `getFrictionForAssetClass`, `computeNetGeometry`) is `58d8f8f94` (max-hold carry — an EXIT change). Config: every `module_constants` change since 07-21 is exit-side (max_hold_switch, trailing_exit, mark_staleness). **Same admission code + same config gave a full pool on 07-22 and an empty one now ⇒ the only thing that changed is the market input.** Market/fee reality, not a regression.
- **The pool's only inflow is now the exploration lane, and it's a thin, annealing trickle (Kyle's catch — corrected my "budget exhausted" framing).** The 50/day budget is spent GRADUALLY (a few/hour, 50th hit ~21:00 UTC), so it was NOT the early-day constraint — the pool is 2-3 all day because organic=0 and exploration admits ~2/hour of short-lived maker orders (many `never_filled`). The exploration floor ANNEALS toward 0 as informative closes accrue (`exploration-lane.ts:152-154`): base -2%, +0.5% per 60 informative closed trades, **currently -1.0% at 161 informative closes, closes entirely at 240.**

**★ FORWARD RISK worth a home (§9.4 — Kyle scope call):** if the exploration lane finishes annealing shut (~240 informative closes) while the fee wall keeps organic admission at 0, **the pool goes to a permanent zero.** The exploration subsidy is designed to expire as the system learns — but it's expiring into a fee wall blocking the organic flow it was meant to hand off to. Lever = fee viability (venue / maker-only / fee ladder / Phase-25), and/or the exploration budget + anneal schedule. **Kyle's decision, not a code fix.**

---

### Original investigation record (kept; superseded by the verdict above)

**Was proposed owner: CC-A** (owns `B-RTB-REFRESH-CONSOLIDATE` / #532, where OBJ-2b/3/4/5/6 are still open).

**MEASURED — before.** On 2026-07-22/23 the pool held **100–101 signals**, from two independent records in
`B_RTB_REFRESH_CONSOLIDATE_OBJ1_COMPLETION_REPORT.md`: the freshness measurement ran across *"all 101
queued signals"*, and the §9.3 UI verification found *"all 100 signals render cleanly… count matches the DB."*

**MEASURED — now.** `SELECT COUNT(*) FROM rtb_signals` = **1**, sampled 8× over 3 minutes (13:18–13:20 UTC):
`1,1,1,1,2,2,2,2`. **Steady, not oscillating** — this is not a snapshot caught between refreshes.

**MEASURED — the scanner is healthy, so this is not a dead upstream.** Last scan 17s old, **325 pairs
scanned** against a 1518-pair Kraken universe, target 300/cycle. The funnel, one cycle:

| Stage | Count |
|---|---|
| scanned | 325 |
| **failed min-volume** | **253 (78%)** |
| already active | 31 |
| passed all filters | 15 |
| IMF (LQ/VN/DI) passed | 8 |
| **quant survivors** | **8** |
| …reaching the pool | **1–2** |

**A SECOND, WEAKER FRAMING (mine — kept only because its arithmetic is still valid).** The obvious story is "the pool stopped accumulating across
cycles" — plausible, because only 300 of 1518 pairs are scanned per cycle and the set rotates, so without
accumulation the pool can only ever hold the current cycle's output. **But the current cycle yields 8
survivors and the pool holds 1–2.** So there is real attrition *between* survivor and queued as well.
**At least two things are contributing and I have separated neither.** Do not ship a retention fix on the
assumption it explains the whole drop.

**Timing worth checking, explicitly NOT claimed as the cause.** The refresh machinery changed in exactly
this window: `d2306518e` (2026-07-22 23:54) retired Mechanism A, the duplicate refresh scheduler; `4760b1077`
(2026-07-23 00:25) restored the per-signal refresh latch on the survivor. **I have not read the retention or
eviction path, so I am not calling this the cause.** Note also that retiring a *duplicate deleter* should, on
its face, leave *more* signals in the pool, not fewer — so the naive version of this story has the sign wrong.

**★ KYLE'S HYPOTHESIS — more specific than mine, and it should be tested FIRST.** Paraphrasing him: signals
going through the RTB refresh may not be getting all the data they need, so they **fail during the refresh
and are never added back to the queue**. They may not even reach the SQE — they may be **removed as they exit
the refresh cycle** and never re-injected.

**One piece of supporting evidence I can stand behind:** the OBJ-1 report records that the refresh performs
an **SQE re-check that DELETES rows**. A refresh that drops a signal on incomplete input would look exactly
like this — a pool that empties while the scanner stays healthy.

**⚠️ A SECOND PIECE I CITED AND SHOULD NOT HAVE — flagged by Kyle, and he is right about the process.** I
also cited **#570** (bucket 2 fires without refreshing its members) as supporting evidence. **I had not
verified it; I read it in someone else's report and passed it on.** Having now checked: it is **not**
speculation — `RUNNING_ISSUES.md:23` carries it as **OPEN, measured on staging, confirmed with Langston**
(12 of 100 signals frozen ~34 min across two restarts, all twelve computed to bucket 2 from the live hash;
buckets 0/1/3–7 with zero frozen members; Langston then sharpened the lead at the graded ref). **So the claim
survives — but my process for repeating it did not, and an inherited claim used to prop up a new hypothesis
is exactly how noise compounds.**

**★ AND THE THING THAT ACTUALLY MATTERS HERE: Kyle has never been told about #570, and says every report he
has had says the refresh is functioning.** Those are reconcilable — 7 of 8 buckets do refresh fine, so an
aggregate health read is "functioning" — **but a measured, Langston-confirmed, open defect that the decider
has never heard of is its own problem, independent of the pool question.** Whoever takes this item: confirm
#570's current status FIRST (there were refresh changes this week and it may already be fixed), and tell Kyle
either way.

**Concrete first cut:** instrument the refresh exit. For one cycle, count signals IN, signals that reached the
SQE, signals that passed, and signals written back — **the gap between "entered the refresh" and "reached the
SQE" is the number that decides this.** Note that #532/OBJ-4 already records that queue exits are not
counted, so **that instrument may have to be built before the question can be answered.**

**Kyle's own framing, which is the requirement:** signals used to sit in the pool for **longer than a day**
waiting for a slot. Whatever the fix is, it has to restore that.

---

## 2. Three open positions can never be time-exited — READ IN CODE, and it explains TSM/MU

**Proposed owner: CC-B** (owns the exit-path work — `P19-B8.5f` carried the max-hold, `P19-B8.5i` the
trailing switch). **Kyle's instinct that this ties to that batch is correct.**

**READ IN CODE.** `server/services/active-execution-engine.ts:1648-1652`:

```ts
const maxHoldingMs =
  typeof metadata?.maxHoldingMs === 'number' && isFinite(metadata.maxHoldingMs)
    ? metadata.maxHoldingMs
    : undefined;
if (maxHoldingMs !== undefined) {   // ← absent ⇒ the whole time-exit block is skipped
```

**A position with no `maxHoldingMs` in its metadata is never time-exited. Ever.** Missing input silently
means "no limit" instead of refusing — the **absent-as-valid** class (#546/#568) that has now produced
several defects in a row.

**MEASURED.** Of 11 open positions:

| Symbol | opened | `max_hold_ms` | held |
|---|---|---|---|
| MU/USD | 07-17 20:25 | **(none)** | **161.0h** |
| TSM/USD | 07-17 20:29 | **(none)** | **160.9h** |
| QCOM/USD | 07-22 19:47 | **(none)** | **41.6h** |
| BE/USD and all 8 newer | 07-23 14:34 → | 86400000 | ≤22.8h |

**So TSM and MU are not "stuck" — they are structurally immortal, and they are the slots Kyle is watching
being eaten.** Closing them by hand would clear the slots and hide the defect; the three of them are the
only live evidence.

**★ NOT DETERMINED — and it is not simply "they predate the fix."** PM/USD opened **07-22 14:54** and *did*
time-exit at exactly 24.00h; QCOM/USD opened **07-22 19:47**, five hours *later*, and carries no value. **The
boundary is not chronological**, so something per-strategy or per-path decides whether the value is carried.
`strategy-engine.ts:80-88,189-195,603-609` resolves `max_holding_ms` from `module_constants` for only some
strategies. **That is the question to answer before writing any fix.**

**★ THE 24 HOURS IS A SCOPE CALL FOR KYLE, NOT A SETTING TO VERIFY — I got this wrong first time.**
I called it "the deliberate default." **Kyle: *"at no point have I approved a twenty four hour limit."*** He
is right, and the two claims are not the same: **"deliberate" describes how the value was written; it says
nothing about whether it was ever decided.**

What is actually true, from the archaeology: the value entered on **2026-06-06 (`ecf185753`, "unify max-hold
on explicit milliseconds")** — a **unit-normalisation change made while active trading was OFF**, when it
could not affect anything and was never put to Kyle as a trading policy. `DEFAULT_MAX_HOLDING_MS` at
`strategy-engine.ts:42` is the fallback when a strategy resolves no `max_holding_ms` of its own. **It is now
enforcing on live paper positions.** So the question is not "is 24h implemented correctly" — it is **"do we
want a 24-hour limit at all, and if so what should it be, per strategy and per asset class?"** That is
Kyle's, and it should be asked before anything is tuned.

**Settled only on the narrow technical point:** it is **not** the old bar-count-read-as-hours bug. That was
fixed by the same 2026-06-06 change, and the stored value is literal milliseconds (`86400000`), not a
24-bar count reinterpreted.

---

**★ CROSS-REFERENCE, added after the board was written — CC-B, this is probably yours too.** Alert
`23a2f15c` (acknowledged by cc-b 13:27) reports the exit monitor skipping **40 consecutive ticks** on
**GLW/USD** because the mark was older than the freshness ceiling (312s vs 253s). **GLW/USD is at 22.5h of
its 24h max hold.** The time-exit branch returns `price: currentPrice`, so if the tick is skipped wholesale
for staleness, **the time exit is not evaluated either** — a position can sail past its max hold while the
skip looks like an unrelated price-feed warning. Worth confirming whether the freshness gate sits upstream of
the max-hold branch or beside it; I have not traced that.

---

## 3. Open positions appear in the closed-trades table — NOT new, but 3 rows are genuinely orphaned

**Proposed owner: needs an intent ruling first** (rule 24 outcome 2 vs 1) — then whoever owns the trade sink.

**MEASURED.** `closed_trades` holds **14 rows with NULL `closed_at`**, and **11 of them are currently open
positions**. Decisive: TAO/USD's `closed_trades` row was written at `13:21:03.838` and its position opened at
`13:21:03.889` — **the same second. A row is written AT OPEN, not at close.**

**MEASURED — the WRITE is not new.** The NULL rows are spread continuously across 07-15 → 07-24, the entire
span the table has data for.

**⚠️ BUT THAT IS NOT THE SAME CLAIM AS "the display is not new," and I conflated the two. Kyle disputes the
display** — his read is that the write may have been happening in the background all along **without
appearing in the table on screen**, and that what changed is that it started *showing*. **My data cannot
tell those apart: I measured the rows, not the rendering.** Whoever takes this must check the table's own
filter — if it recently stopped excluding NULL-close rows, Kyle is right and the write is a separate,
older question. **He has also said he does not want these rows displayed regardless.**

**★ The part that is defect-shaped regardless of the intent ruling:** 3 of the 14 — MET/USD (07-15),
AVAX/USD and ETH/USD (both 07-18) — have **no matching open position**. Their trades are gone but `closed_at`
was never written. **The write-at-open happened and the update-at-close did not.** Whatever the design
intent, those three are wrong.

**Consequence to state plainly:** every count of "closed trades" is inflated by rows that never closed.

---

## 4. No pre-weekend entry throttle — SCOPE CALL, not a defect

**Proposed owner: Kyle decides; needs a named dated home per §9.4.**

**Kyle has confirmed** the weekend behaviour I described is correct and working: shutdown suspends open
xStock trades and pauses the scanner; the timers manage the Friday-close/Sunday-open boundary.

**What is absent — searched, and the absence is evidenced, not inferred:** there is **no rule that reduces or
stops opening new xStock positions as the weekend close approaches**. Kyle recalls discussing this earlier in
the week as standard practice at trading firms. It was either never implemented or booked into a later phase.
**Working-as-designed-but-unaddressed** — rule 24 outcome (2), so it is a decision for Kyle, not a fix.

**★ ELEVATED 2026-07-25 — this is now the load-bearing piece.** The item-1 slot-jam analysis + Kyle's
weekend-stickiness hypothesis (both confirmed: the July 18-22 jam was Friday xStocks held through the weekend
with a broken time-exit) make the pre-weekend throttle the front-line fix. Kyle added a broader insight —
xStock order-book depth also drops OUTSIDE US trading hours, so xStocks stick overnight too, not just on
weekends. All three candidate fixes (Friday dampening / a non-time-based stale-activity exit / per-xStock
time-of-day entry gating) are captured for discussion in
`Claude Comms and Packages/Langston Design Asks/XSTOCK_TRADING_WINDOW_AND_EXIT_NOTES.md`. A one-time
`monday-slot-jam-recheck` scheduled task (Mon 2026-07-27 10:00 ET) watches whether the jam is re-forming this
week and surfaces these solutions if so.

---

## 5. Regime column on the paper open-trades table shows one part instead of three

**Proposed owner: small display batch.** **READ IN CODE:** the shared cell already supports the
three-part regime with its phase (EARLY / PRIME / LATE) — the closed-trades table passes it, the **open**
table does not. Display gap only; no pipeline involvement.

## 6. Volume / order-book column shows volume for crypto but no order book for xStocks

**Proposed owner: CC-B** — Kyle believes this is already in their queue. **Raised here for visibility at
Kyle's explicit request**, not to duplicate the work. Confirm before starting.

## 7. 57 of 281 closes are `never_filled` (20%) — surfaced, not investigated

**MEASURED**, noticed while querying the close-reason mix: `stop_hit` 133, `target_hit` 87,
**`never_filled` 57**, `max_holding_period` 4. One close in five never got a fill. **I have not looked into
this at all** — flagging it because a fifth of the book not filling is worth someone's attention, and it may
be related to item 1.

---

## Already homed, listed so nobody re-files them

- **#570** — bucket 2 of the RTB refresh fires but does not refresh its members, leaving a stale tail.
  Pre-existing, homed to #532/OBJ-4.
- **#532 OBJ-4** — `rtb_signals.promoted_at` / `.promoted_trade_id` are never populated (0 of 101 rows, all
  time); rows are deleted on promotion, so dwell-to-promotion is unmeasurable from the queue's own record.
  **Directly relevant to item 1: the instrument that would answer it does not exist.**
