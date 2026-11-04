# PM Claude — plan sweep and priority review, 2026-11-04

> **What Kyle asked (2026-11-04):** go through the last three to four weeks of each session's chats, find everything discussed as work (what, when, close-out, interrupted), check each is somewhere in the pre-sprint table, the sprint or the after-live list, list what is missing with a recommended home, and judge whether the plan is in the right order. **His test for order:** anything that leaves trades open, closes trades on bad data, or spoils the data we need for calibration goes to the front; the rest is ranked by how much it hurts our ability to trade profitably.
> **These are recommendations. Nothing below has been placed; we decide together.**

**Method, so you can judge it.** The chats of OLD, NEW, ANALYST and Infra Claude from 2026-10-07 to 2026-11-04 (the crew was off from about 10-21 to 11-04) were boiled down to what people said, read by nine readers, then every item was checked against the plans and the issue ledger by three more. **451 items were found. About 300 are already in the plan, about 50 are done or were dropped by a decision, about 50 have no place in the plan, and 25 that ARE in the plan were started and then left.** Limit: a reader can miss something, and an item matched by its words may be matched to the wrong line; anything below marked "check" needs a second look before it is placed.

---

## 1. My recommended front of the plan

Today's failures show where the risk is. Langston measured three causes this evening: the shared database connections being used up and never returned, which drops price data and stalls the scanner; a staging disk filling up; and a crypto price feed that has been dead for 14 days without anyone noticing. **All three damage the price data that both open trades and calibration depend on.** So I would put these first, in this order, before anything else on any session's list:

| # | what it does | why this position | owner | state |
|---|---|---|---|---|
| 1 | **Finish the crypto price-feed watchdog** (`B-CRYPTO-FEED-WATCHDOG`). Notices when a feed connection is "connected" but silent, and restarts it. | About half the crypto coins (205 of 408 at Langston's measurement on 10-21) have had no price for 14 days. Trades on those coins cannot close on a real price, and none of their data can be used for calibration. | NEW Claude | built and live, Step 7 of 11: only the checks are left |
| 2 | **Finish the xStock bar check** (`B-XSTOCK-BAR-AVAILABILITY`, its last slow step). Makes sure each xStock price bar is stored and complete before the system relies on it. | It is the code that used up the database connections today. The leak is fixed; the step is still too slow, and 203 bars are waiting. | ANALYST Claude | in flight, Step 9 |
| 3 | **NEW: guard the shared database connections** (`B-DB-POOL-GUARD`, Langston's proposal). Every part of the app shares 10 connections; this adds a time limit for getting one, an alarm when one is returned still busy, and a few connections kept for saving data. | It has now failed four times from four different places, and each time every asset class lost data in the same second. Fixing one caller at a time is a patch; this fixes the shared weak point. **It also absorbs a piece already in the sprint (NEW Claude's archive-writer item, which carries the same "the pool filled up" problem), so it is not built twice.** | **I recommend OLD Claude**, not ANALYST as Langston proposed: ANALYST already has about ten open batches, and OLD's list is nearly finished (see §4). Langston should agree the owner. | new |
| 4 | **Give xStock strategies their directional score** (`#1235`). Every xStock strategy is fed a direction score of zero, so the safety checks built on it never fire. | 95 of 521 xStock paper trades were ones those checks were built to refuse, and they lose more (one group averaged −3.79% a trade). Every xStock result we collect for calibration is skewed until this is fixed. NEW Claude calls it a small fix. | NEW Claude | waiting on your slot since today |
| 5 | **Stop the staging disk filling** — three pieces: OLD Claude finishes the disk-file tiering (its nightly run is switched off until one fix is reviewed); the price-feed debug logging is trimmed (four debug lines are 88% of all log writes, about 1 GB a day); Infra Claude fixes the token study's failed off-site upload (13 GB against an 8 GB limit). | A full disk stops the app, and with it every open trade's exits. Langston measured 84% full with 13 GB free; the runway needs re-measuring because the token study is now growing fast. The debug-log trim has no place in the plan at all. | OLD Claude (tiering + log trim, folded into his batch); Infra Claude (token study) | tiering at Step 7; log trim not placed; token study at Step 7 |

**After these five, the existing lists carry on** in their current order. The next big item for trade quality is NEW Claude's entry gate (it refuses an entry that has drifted away from its plan), which is stuck on decisions only you and the reviewers can make (§3).

---

## 2. Items that are not in the plan, and where I would put them

### 2a. Before live — they touch trades or calibration data
| item | what it is | my recommendation |
|---|---|---|
| **Debug-log trim** | the four debug lines writing 88% of the logs | fold into OLD Claude's disk-file tiering now (front item 5) |
| **#1235 xStock direction score** | above | front item 4 |
| **Database connection guard** | above | front item 3 |
| **~113 xStock entries blocked on stale prices** (alert "xStock active fill blocked", no owner) | xStock entries refused because the price was too old | add to NEW Claude's price-feed coverage batch (his list item 3: it already owns "what counts as fresh" for prices) — check the fit with him |
| **Age limit on queued signals** (Langston, 10-20) | a signal can sit in the ready-to-buy queue for up to 21.8 hours and still be bought | add to NEW Claude's entry gate — it is the same question ("is this entry still what was planned?") |
| **Opening ATR is zero on xStock trades** (Langston measured 10-08) | the volatility figure stops are sized from is zero on xStock, so stop distances are wrong | add to NEW Claude's plan-price batch (his list item 4: what a signal's levels are based on) — check |
| **A possible fixed 2-to-1 target** (Langston 10-21, promised code check never done) | targets may be set by a fixed ratio rather than the strategy | same plan-price batch — a one-hour check first |
| **One-minute-bar blind spot in feed health** (agreed 10-07, feed-health batch now closed) | the feed-health check does not look at one-minute bars | NEW Claude's price-feed coverage batch |
| **KKR guard-reset bug** (ANALYST 10-10) | a reset restarts an exit's release progress | ANALYST's xStock exit batch (the realism batch, already in observation) — confirm it was folded in |
| **Overnight xStock stop-exit policy**, **"fewer, better trades"**, **maker entries with target-hit exits** (all discussed 10-16) | trading-behaviour choices, not defects | the sprint's calibration and tuning section — **after the data is clean, before live**; these need clean data to judge |
| **Archive follow-up** (OLD 10-17): label the 568 older archive copies as possibly incomplete, record source counts | archive history could be short without anyone knowing | OLD Claude, after the disk-file tiering — only matters if calibration reads the archive; check |
| **Staging deploy refused by a changed file** (`#733`, recurring) | a deploy is blocked until someone cleans the server copy | OLD Claude, small, after the tiering |
| **Unknown server address in the laptop's SSH records** (Kyle 10-08) | an unexplained connection target | Infra Claude's SSH key review (sprint "whose are the two unknown keys") — security, check soon |

### 2b. After live — crew tooling and housekeeping
Langston's alert queue running one at a time (up to 2-hour waits) and its backlog of ~116 old alerts — **but fold into Infra Claude's Langston relief batch, which is in flight, if it is still happening** · alert IDs cut off and misrouted (fold into Infra's alert-lane owner fix) · the crew switch waking Langston and costing credit · Coltrane named in the on-duty notice · the "hands off" wording · dead watchers for closed sessions · the plan checker unable to grade one row (`#1188`) · the checker missing an open declaration for 8 days (`#1074`) · an untagged rules-file edit passing the checker · the Codex failover loose ends (safety hooks, Coltrane alerts, browser check) · longer server log retention (ANALYST's hourly log copier covers what calibration needs) · the "phase squad" trial · `#237` (looks like a duplicate of a sprint item that makes the ready-to-buy queue's asset-class column mandatory — fold it there).

### 2c. Decisions only you can make
1. **Backblaze off-site storage:** the token study uses 3.78 GB of the free 10 GB and will hit it about mid-December. Allow paid storage, or shrink what is kept? (If it fills, the token study's disk problem comes straight back.)
2. **Your 10-19 questions that never got an answer:** turn on the four remaining xStock strategies; whether Filter Diagnostics counts as "hands off"; whether to keep taking the agreed readings.
3. **The entry gate's two open questions** (since 10-21): check entries against the worse side of the price only (Langston agreed today), and the profit-after-fees test (waiting on Coltrane).
4. **OLD Claude's held queue:** 16 items have been held since your 10-19 rule, and no OLD Claude list was ever agreed. I recommend we agree a short one, starting with the connection guard (front item 3).

---

## 3. Started and left (in the plan, but stalled)
The ones that matter for trading, first:
- **NEW Claude's entry gate** — Step 1, scope sent back 10-21, untouched for 14 days, waiting on the two answers above. **This is the biggest trade-quality fix not moving.**
- **ANALYST Claude's xStock realism batch** — in observation; its reads were missed during the break and are being done now.
- **OLD Claude's disk-file tiering** — deployed, but its nightly run is off until one fix is reviewed (front item 5).
- **Infra Claude's security hardening** (`B-CREW-ACCESS-HARDEN`: passphrase on the laptop's server key, a key-holder) — paused at Step 9 since 10-16 for the Langston work. Security before live; restart after the Langston relief batch.
- **Infra Claude's private-repo batch** — two parts left since 10-13.
- **NEW Claude's four small cleanups** (duplicate health route, five-minute jobs never judged late, the "last audit" card, a feed-mismatch report owed) — parked by your 10-19 freeze. Housekeeping; after live, except the feed-mismatch report, which is paperwork to close.
- **OLD Claude's status board** — Step 7; your phone check is owed.

---

## 4. Is the plan in the right order?

**Mostly yes, with three problems.**

1. **Too much is open at once, and finishing is losing to starting.** ANALYST Claude alone has ten batches started and not closed: nine in the sprint (five of them already built and live, waiting only on their final checks and paperwork) plus the xStock bar check. NEW Claude has a parked list of four. Each open batch needs a review, a check and paperwork before it counts, and Langston is reviewing all of them through one queue. **My recommendation: no new batch for ANALYST until his built-but-unchecked items are closed, and new pre-live work goes to the session with the shortest list (OLD Claude).**
2. **Data truth should come before trade logic.** The pre-sprint table already starts with feed truth, which is right. But the three things that broke today (connections, a dead feed, the disk) were not at the front, and two of them had no place at all. The five front items in §1 fix that.
3. **Decisions waiting on you are blocking the most important trade-quality work.** The entry gate has waited 14 days. A short decision session with you on §2c would unblock more than any batch.

**Are we making progress, or finding issues faster than we close them?** I can't answer that properly yet. It needs a count of issues opened against issues closed, week by week, since the sprint plan was set on 2026-09-28. That is my next measurement, and I will bring it to you.
