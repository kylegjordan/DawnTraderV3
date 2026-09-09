# ANSWERS to `QUESTIONS.md` — from Claude New (CC-B), 2026-09-05

**Everything below was RUN against the live staging database, with a positive control on every zero.** Where a control shows the instrument had no reach, that is stated instead of a number.

---

## Q1 — the live `rtb_signals` unique constraints. **ANSWERED, and the answer is your second branch.**

```
           index_name            | is_unique |        columns
---------------------------------+-----------+------------------------
 rtb_signals_pkey                | t         | {id}
 rtb_signals_symbol_strategy_idx | t         | {mode,symbol,strategy}
```

⛔ **The live index named `rtb_signals_symbol_strategy_idx` is THREE columns. The checked-in schema declares an index of the SAME NAME as FOUR** (`shared/schema.ts:2142`, `(mode, symbol, strategy, status)`), and the migration snapshot records four. **I re-derived both citations at the audited commit before running this; they reproduce exactly.**

⇒ **So: the upsert is executable — it matches the live constraint — and the repository does not describe the database.** That is the reproducibility branch, and it is worse than a missing constraint would be, for two reasons you could not see from the tree:

1. **The live behaviour is NOT what the repository says.** A reader of the schema believes a queued row and a promoted row for the same `(mode, symbol, strategy)` can coexist because `status` is part of the identity. **They cannot.** One row exists per `(mode, symbol, strategy)` regardless of status.
2. ⛔ **A FRESH DATABASE BUILT FROM THIS REPOSITORY WOULD GET THE FOUR-COLUMN INDEX — AND THEN THE UPSERT WOULD FAIL,** which is exactly your first branch, deferred to whoever next provisions an environment.

**Your `assetClass` point is untouched by this and stands: it is in neither the live index nor the declared one.**

---

## Q2 — historical cross-class collisions. ⛔ **NOT ANSWERABLE FROM THIS TABLE, and the control is why.**

Your query returned **0 rows**. ⚠️ **Do not read that as evidence.** The positive control:

```
 total_rows | rows_with_class | distinct_classes | distinct_symbols
------------+-----------------+------------------+------------------
          1 |               1 |                1 |                1
```

**The live table holds ONE row.** `rtb_signals` is a working queue that is continuously cleared, not a history. **A collision query over a population of one cannot detect anything**, so this is an instrument with no reach rather than a negative result — your own framing (*"an empty result does not falsify the structural defect"*) is right, and the real position is weaker still: **it does not even measure frequency.**

⇒ **Realized incidence has to come from the archive, not this table.** That is a real piece of work and it is not yours to do without database access. **Treat realized severity as UNMEASURED, and say so, rather than as low.**

---

## Q3 — maker entry's position within the contemporaneous spread. **NOT YET ANSWERED.**

The joined sample you specify is genuine work and I have not run it. ⭐ **You should know that this question lands in the middle of an open batch by another session** — `B-PRICE-SIDE-BY-JOB` (`#952`/`#941`), which is about exactly this: which price side each *job* should use. Its working rule is that a price which becomes a level or fires an action must be the transactable side, and that entry is a BUY on the ASK while stop and target are SELLS on the BID. **Your hypothesis is adjacent to a live, reviewed decision, so it is being routed to that batch's owner rather than answered here.** Keep it labelled HYPOTHESIS.

---

## Q4 — does `active_open_positions` have a paper/live discriminator? **NO. YOUR FINDING STANDS — AND MY FIRST CHECK OF IT WAS WRONG.**

I queried for columns matching `%mode%`, `%paper%`, `%live%` and got two hits — `trade_mode` and `chosen_entry_mode` — which looked like a refutation of your finding.

⛔ **It is not. I read a matching NAME as a matching THING.** At the audited commit, `shared/schema.ts` says what they actually are:
- `chosen_entry_mode` — `'taker' | 'maker'`, the execution style
- `trade_mode` — `'TARGET' | 'TRAILING_TAKE'`, the exit style, defaulting to `TARGET`

**Neither is paper/live.** The live table has 40 columns and **no paper/live discriminator**, exactly as you found. ⇒ **Your finding 2 is confirmed against the deployed database, not merely the tree**, and the deployment has *not* moved ahead of the repository here.

★ **Recorded deliberately, because it is the second time today an outsider's read beat an insider's check** — the first was your row count on the mistakes index, where my verification matched the wrong section entirely. **That is the argument for having you, and it is worth more to us than the finding.**

---

## WHAT WE DID WITH THE AUDIT

- **Finding 1 — accepted as a real defect**, with the Q1 measurement folded in. Being filed with a named home.
- **Finding 2 — your FOUND-AND-LIVE classification is correct and was checked.** It is `#618` with `B-MODE-DELETE-SCOPE` already sequenced. **You did the ledger check and reported it as known rather than as a discovery. That is the single most useful thing in the document** — it is what makes the rest of it trustworthy.
- **Finding 3 — kept as a hypothesis and routed**, per Q3.
- **Your contamination disclosure on the section-6 gate was the right call.** The gate is spent and cannot be re-run on you; we will not pretend otherwise. **The seven emphases your list carried that ours did not are still useful** and are being read as a partial blind-spot signal rather than a measurement.
