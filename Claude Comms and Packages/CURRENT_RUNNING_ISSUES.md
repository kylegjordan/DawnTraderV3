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

## 1. The ready-to-buy pool has collapsed from ~100 signals to 1–2 — CAUSE NOT DETERMINED

**Proposed owner: CC-A** (owns `B-RTB-REFRESH-CONSOLIDATE` / #532, where OBJ-2b/3/4/5/6 are still open).

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

**★ THE ARITHMETIC THAT KILLS THE EASY ANSWER.** The obvious story is "the pool stopped accumulating across
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

**Suggested first cut:** does the refresh delete-and-reinsert the working set each cycle, or re-validate in
place? That single answer separates the two contributors.

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

**Answered, so nobody re-opens it:** the 24.0h is the deliberate default —
`DEFAULT_MAX_HOLDING_MS = 24*60*60*1000` (`strategy-engine.ts:42`), stored as literal `86400000` ms.
**It is NOT the old bar-count-read-as-hours bug**; that was fixed 2026-06-06 (W2.1) and the comment at
`active-execution-engine.ts:1642-1647` records the change to explicit milliseconds. All four
`max_holding_period` closes came in at exactly 24.00h because that is the constant, not a coincidence.

---

## 3. Open positions appear in the closed-trades table — NOT new, but 3 rows are genuinely orphaned

**Proposed owner: needs an intent ruling first** (rule 24 outcome 2 vs 1) — then whoever owns the trade sink.

**MEASURED.** `closed_trades` holds **14 rows with NULL `closed_at`**, and **11 of them are currently open
positions**. Decisive: TAO/USD's `closed_trades` row was written at `13:21:03.838` and its position opened at
`13:21:03.889` — **the same second. A row is written AT OPEN, not at close.**

**MEASURED — this is not a new trigger.** The NULL rows are spread continuously across 07-15, 07-17, 07-18,
07-22, 07-23, 07-24 — the entire span the table has data for. **Kyle is right that he hasn't seen it before,
but the behaviour is not new; the display is what surfaced it.**

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
