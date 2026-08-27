# MISTAKE PATTERNS — the pattern layer

**Owner:** CC-A · **Created:** 2026-08-20 (B-MISTAKES-FILE, #694 piece 4, issue #731) · **Binds all four sessions**

> ⛔ **THIS IS NOT AN INCIDENT LOG, AND ONE MUST NOT BE BUILT.** The incidents already exist: **72 of the last 200 commits carry a full self-correction with its reasoning**, because rule 28.a already forces the reasoning into the commit. A second store would duplicate a record nothing keeps honest with the first — the #641 shape.
> **git is the INSTANCE layer. This file is the PATTERN layer above it. `CONDUCT.md` §13 is the SHORT LIST that auto-loads.**

---

## HOW AN INSTANCE IS RECORDED — one trailer, on the commit

```
MISTAKE: <pattern-slug> [<batch-id>] — <one line: what was wrong, what is true>
```

**The batch id is not decoration** — it is what makes the promotion threshold a **grep** instead of a judgment (Langston condition 1). Without it, *"2+ distinct batches"* is eyeballed, and an eyeballed threshold is a habit.
**Also mandated on the commit that CARRIES AN ISSUE ENTRY**, because rule 28.a's destination is *"the commit message **or** the issue entry"* and a trailer alone would cover only the first branch.

⚠️ **POPULATION LIMIT, STATED SO THIS FILE NEVER READS AS COMPLETE: the grep sees COMMITS ONLY.** The class it structurally cannot hold is **the mistake that produces no commit** — a claim retracted in review that never touched a file. Langston: *"that is most of my own ledger."*

**Search vocabulary** (the standard, hand-verified by Langston against a 10-commit delta): `\bcorrect(s|ed|ing|ion|ions)\b` · `retract*` · `withdraw*` · `mistake*` · `overturn*` · `vacat*` · `"I was wrong"`. **Measured recall against the record-sense union: 73/74 = 98.6%.**
**Pin the population BY REF, never by description** — `28c007163..<stated ref>` — or the same query hands two readers two denominators on the same day.

## PROMOTION — how a pattern becomes a rule

**Lifecycle: instance → pattern (this file) → RULE (promoted into `CONDUCT.md` §13, where it auto-loads) → MECHANISM shipped → RETIRED from both.**
★ **The rule is the INTERIM state, not the destination.** A rule is words, and words get skipped — rule 29(b) was auto-loaded and skipped **twice in one day**. A mechanism enforces.

**THRESHOLD (Langston-ruled 2026-08-20): 3+ instances across 2+ DISTINCT batches — as a FLOOR.**
- ⚠️ **A FLOOR, NOT A MEASURE.** The grep is commits-only, so a pattern reading 2 may really be at six. **The threshold may ALSO be met by cited NON-COMMIT instances — each carrying a resolvable ref (issue entry, ruling, alert id). NEVER on recollection.** Without this the highest-value class is structurally unpromotable.
- ⛔ **NO SEVERITY OVERRIDE.** A single severe mistake does **not** promote — **it gets a mechanism.** §13 is for RECURRENCE; severity is what rule 24's three outcomes are for.
- **§13 holds 3-5 slots, ordered MOST-RECENT-INSTANCE FIRST** — its job is preventing the *next* one, not scoring history.
- ⛔⛔ **A LIVE PATTERN DISPLACED OUT OF §13 BY THE SLOT LIMIT STAYS HERE, FLAGGED `LIVE — NOT IN §13`. AN ABSENCE FROM §13 MUST NEVER BE READABLE AS RETIREMENT.**

### ⛔⛔ DISPLACEMENT-BY-NEWNESS IS A DEFECT IN THIS DESIGN — KYLE FOUND IT 2026-08-20, BEFORE THE FIRST PASS RAN

**His reasoning, and it is correct:** *if a rule on the board has been PREVENTING the mistake, and it is then pushed out, the mistake logically resumes.*

★★ **AND THE FEEDBACK LOOP IS PERVERSE: a rule that WORKS produces FEWER new instances → its most-recent-instance date recedes → most-recent-first ordering sinks it → it is DISPLACED → the mistake resumes → it is re-promoted.** The system would oscillate, **paying real mistakes each lap, and it would punish exactly the rules that were doing their job.**

⇒ **THE ROOT IS THIS FILE'S OWN FAILURE MODE: you cannot distinguish "quiet because SOLVED" from "quiet because the rule is HOLDING IT DOWN."** Silence from a pattern under an active rule **is not evidence the pattern is gone** — `silence-not-evidence`, built into the instrument designed to catch it.

## ✅ THE RULE THAT REPLACES IT — CAP PRESSURE BUILDS A MECHANISM, IT DOES NOT DROP PROTECTION

> **When a 6th pattern qualifies and only 5 slots exist, that is NOT a signal to drop the oldest. It is the signal that the oldest must be MECHANISED.**
> **A live rule is NEVER displaced by newness alone. It leaves §13 only when a mechanism covers its instance class.**

**Why this is the right shape:** the cap becomes a **forcing function that produces guards**, instead of a reason to withdraw protection. Pressure converts into mechanisms rather than regressions. ⚠️ **AND THE COST, STATED: mechanism-building stops being aspirational and becomes MANDATORY — the board cannot take a new rule until an old one has been engineered away.** That is a real constraint on throughput and it is the price of the loop not eating itself.

⛔ **FALLBACK — AND IT IS GATED, BECAUSE *"where a drop genuinely cannot be avoided"* IS THE DROPPER'S OWN JUDGEMENT (Langston 3a — the exact thing the condition excluded).** Under throughput pressure every drop feels unavoidable, so an ungated fallback is the old rule wearing a flag.
> **A DROP REQUIRES EITHER (i) KYLE'S EXPLICIT CALL, OR (ii) A NAMED, RECORDED BLOCKER ON THE MECHANISM. NEVER THE DROPPER'S OWN ASSESSMENT THAT IT WAS UNAVOIDABLE.**

When one of those two holds: it is recorded as a **DELIBERATE EXPERIMENT, never a silent removal** — flagged **`DISPLACED — WATCHING FOR RECURRENCE (from <date>) — COMMIT-VISIBLE ONLY; THIS WATCH'S SILENCE DISCHARGES NOTHING`**. ⛔⛔ **Langston 3b, and it is this file's own bug one layer down inside its own remedy: the watch watches WITH THE GREP, and the grep is commits-only and structurally cannot hold the no-commit class** — *"most of my own ledger."* ⇒ **silence from this watch is NOT evidence the rule was dispensable**, so it can never by itself justify leaving a pattern dropped. ★ **If it recurs, that recurrence is PROOF the rule was load-bearing, and the pattern goes STRAIGHT to a mechanism — it does not go back on the board to be dropped again.** The oscillation becomes a diagnostic instead of a treadmill.


## THE WEEKLY PASS

`git log --grep='^MISTAKE:' --since=1.week` → group by slug → update counts → promote/displace/retire.
**Owner CC-A · weekly · fired by a self-chaining `verification` alert.**
⛔ **DISCHARGE ORDER MATTERS AND THE VERB IS THE MECHANISM: no `dedupe_key`; MINT THE NEXT ROW FIRST, THEN `resolve` the current one with evidence.** `resolve` is the ONLY verb that frees a dedupe key (`system-alerts.ts:389`); an `ack` silences the row permanently **and** drops it out of the §10.5 sweep. *"Avoid resolve"* would make the pass fire once and stop, silently.
### ⚠️ THE PASS ALSO CARRIES ONE TRIPWIRE THAT IS NOT ABOUT MISTAKES (#732, added 2026-08-20)
**#732 was DEPRIORITISED on a measured 7-for-7 record: all seven `trailing_stop_hit` rows are winners that exited at or above target.** The deferral rests entirely on that pattern holding. **So the pass checks it, because a deferral with no tripwire is an intention:**
```sql
select symbol, net_pnl, exit_price, take_profit, closed_at from closed_trades
 where close_reason = 'trailing_stop_hit' and (net_pnl < 0 or exit_price < take_profit);
```
**ANY row ⇒ #732 returns to priority and is reported to Kyle that week.** **Zero rows ⇒ record "tripwire clear" in the run-log row.** *It rides this pass deliberately — no second scheduled job and no additional token cost.*

★ **THE PASS WRITES A DATED ROW BELOW ON EVERY RUN, INCLUDING "no new instances" — so a MISSING ROW IS THE ALARM.** A pass that runs and records nothing is indistinguishable from one that was skipped, which is the failure this whole file exists to catch.

---

# THE PATTERNS

### `skipped-the-gate` — **DID THE WORK, SKIPPED THE REVIEW** — **LIVE — NOT IN §13** · mechanism: **#744, `B-GATE-GUARD`, queued** (opened 2026-08-24, CC-A; Langston required it at the hotfix gate)

**DISTINCT FROM EVERYTHING ELSE IN THIS INDEX**, and that is why it gets its own slug: every other pattern here is *a wrong belief*. **This one is a correct belief and a skipped step.** No measurement was wrong; no instrument misled. The audit, the census, the controls and the announcement requirement were all genuinely done — **written into commit messages instead of a scope file, and never paused for review.**

| # | instance | what was skipped | ref |
|---|---|---|---|
| 2 | `B-GOV-REPORTING` — **five governance edits across four files, pushed with no scope and no gate.** Kyle had directed each one. | The gate. ★ **AND NO URGENCY WAS INVOLVED — which is why instance 1’s counter-habit ("urgency is the cue") WOULD NOT HAVE FIRED.** The work arrived as five small answers to five small requests. **A trigger keyed to a feeling cannot catch a failure with no feeling attached.** ★★ **Root: KYLE DECIDES *WHAT*, LANGSTON REVIEWS *HOW* — and I merged the two because the request and the change arrived in the same breath.** | `b660f409a` |
| 1 | `B-CONDUCT-DELIVERY` — met all three hotfix qualifying tests, implemented + verified + **PUSHED** with no scope file and no Langston gate. Kyle caught it. | The gate. **One day after I wrote `workflow-hotfix` §3 saying the gate is the entire reason the fast path exists — a skill that NAMES URGENCY as the skip condition.** | `831f25b6d` |

★ **WHY MORE RULE-TEXT CANNOT FIX THIS (Langston):** *"the gate did not fail from ignorance."* The rule existed, was one day old, was written by the person who broke it, and **predicted its own bypass in its own text.** A rule that has been tested that directly and still failed is not improved by another sentence.
**THE COUNTER-HABIT, until #744 ships:** at the moment you judge something urgent, **that is the trigger to check whether a gate applies** — urgency is the condition the rule warns about, so feeling it is the cue, not the excuse.

### `read-the-field` — **THE OBJECT DESCRIBED ITSELF AND THE READER DID NOT LOOK** — **LIVE — NOT IN §13** · mechanism: **NONE YET** (opened 2026-08-23, CC-A; Langston-named, and **Langston corrected the tally down from three instances to two**)

**TWO instances, both CC-A, both inside `B-RULES-1c/1d`.** ⛔ **FAILS BOTH §13 LEGS** — under the 3+ floor, and 1c/1d is **ONE context, not two batches** (Langston: *"two id strings, one context: same session, same day, same subject, same state. The leg tests whether a pattern survives a CHANGE OF CONTEXT, not whether two strings differ. If a literal id test clears it, the gate is satisfiable by sub-batch numbering"* — the same "gate on paper" ground `silence-not-evidence` was refused on). **Recorded now so the next instance promotes it by GREP rather than by another judgement call.**

| # | instance | the self-describing field that was right there | ref |
|---|---|---|---|
| 1 | Cited a **resume** as the discharging **compaction** for GATE 2 — in the same message that argued the two could not be confused because the harness logs them separately. | `source=compact` vs `source=resume`, distinct values on every row of `instructions-loaded.jsonl`. | `d0fc181c7` |
| 2 | Read a **candidate-set** logger as proof of **loading**, and reported `CONDUCT.md` ABSENT on every boundary. | The row’s own `measures` field states verbatim that it records path existence and is **NOT** proof the harness loaded anything. | `d0fc181c7` |

★ **THE SHAPE, and the framing Langston asked be preserved verbatim: THE DATA WAS COMPLETE AND CORRECT AND NO INSTRUMENT FAILED.** A field that would have settled it sat in the object already being looked at, and the conclusion was formed before reading it. ⇒ **THESE INSTRUMENTS TOLD THE TRUTH, so every "verify your instrument" rule we have is STRUCTURALLY BLIND to this** — those catch instruments that LIE. *(That is the argument for RECORDING it. It is not yet the argument for a §13 slot.)*
**THE COUNTER-HABIT, one line:** before drawing a conclusion from a record, read what the record says **about itself** — its type field, its source field, its own stated scope.

### `fragment-not-whole` — **TESTED A FRAGMENT, ASSERTED ABOUT THE WHOLE** — **LIVE — NOT IN §13** · mechanism: **NONE YET** (opened 2026-08-23, CC-A, at Langston’s direction)

⚠️ **SPLIT OUT OF `read-the-field` BY LANGSTON, AND THE DISTINCTION IS REAL RATHER THAN PEDANTIC.** I had filed this as a third instance of that pattern. His correction: *"a regex doesn’t describe itself, and the twelve lines below it aren’t metadata, they’re the rest of the control flow."* ⇒ **there is no self-describing field here to have missed** — the failure is asserting whole-system behaviour from a component tested in isolation. Same family as **#675**.

| # | instance | what was tested vs what was claimed | ref |
|---|---|---|---|
| 1 | Told Kyle that alerts routed to CC-C **"never route"**. | Tested `ALERT_OWNER_RE` **in isolation**; never read the twelve lines below, where a NON-match falls THROUGH to the name check and the literal `CC-C` satisfies CC-C’s own alias. **The owner woke all along.** The real defect was the SUPPRESSION half — the opposite end of the same function. | `4b8220a27` |
| 2 | Argued to Langston that including `CC-INFRA` in the alert-owner set was a **"silent black hole"** and should be dropped. | Reasoned about the REGEX without following the **fall-through**. Dropping it restores a wake to **nobody** — `MY_RE` then scans the whole triage body and `CC-INFRA` satisfies no alias (`cc[\s_-]*a` wants cc→seps→a and gets `CC-I`). **The real choice was deterministic-nobody vs non-deterministic-WRONG-CC, and I had the sign backwards.** Langston traced it rather than weighing it. | `cb01111eb` |

| 3 | Argued in the `B-MBIM-SWITCH-ON` scope that a rotating slice was needed because MBIM's REST calls would **spend the Kraken budget `price-cache.ts` exists to protect**. | Reasoned about the **price cache's limiter** without following the **actual call path**: `getTicker` -> `makePublicRequest` (`kraken.ts:187`) is a **bare `fetch` with no limiter**, so these calls never enter that budget - they compete with it **from outside**. ⛔ **The error ran in the DANGEROUS direction: it made the load look SAFER than it is**, and it was load-bearing in a scope asking for a deploy. Langston traced it to source rather than weighing it. | `481bda9e3` |

★ **WHY IT IS WORTH ITS OWN SLUG:** the counter-habit is different. `read-the-field` says *read what the record says about itself*. This one says **exercise the WHOLE path, not the piece you suspect** — a unit that behaves correctly in isolation says nothing about the branch taken when it does not fire.
⚠️ **SECOND INSTANCE THE SAME DAY, HOURS AFTER THE PATTERN WAS OPENED — and the second one was an argument I took INTO a review, where it cost the reviewer a trace to refute. Both instances are still ONE context (`B-RULES-1c/1d`), so this does NOT clear the §13 distinct-batches leg either; recorded so the next one promotes by grep.**

★★ **AND THE NEXT ONE CAME — THE THRESHOLD IS NOW MET (recorded 2026-08-24, CC-C).** Instance 3 lands in **`B-MBIM-SWITCH-ON`**, a genuinely distinct batch and context from `B-RULES-1c/1d`. ⇒ **3 instances across 2 distinct batches = the §13 promotion floor is CLEARED**, exactly as the sentence above predicted it would be, by grep. ⛔ **NOT PROMOTED HERE, DELIBERATELY.** Promotion is the weekly pass's act and this ledger is CC-A's; a self-promotion by the session that just filed the qualifying instance is how a floor becomes a formality. **Flagged for the next pass to rule on.** ⚠️ Note the floor is a **floor, not a trigger** — the pass may still judge the mechanism unready.

### `pre-existing-therefore-fine` — **SWITCHING A DORMANT COMPONENT ON INTRODUCES EVERY ACTION IT TAKES** — **LIVE — NOT IN §13** · mechanism: **NONE YET** (opened 2026-08-24, CC-C, at Langston's direction)

★ **THE GENERAL FORM OF THE RULE-18 DISPOSITION QUESTION** (Langston: *"it belongs in `MISTAKE_PATTERNS.md`, not only in this scope"*). **The wrong test is "did this batch INTRODUCE the behaviour?" The right test is "will this batch cause the behaviour to HAPPEN?"** Dormant code is not inert code — it is code whose actions are queued behind a switch, and the batch that flips the switch owns all of them.

| # | instance | the reasoning that failed | ref |
|---|---|---|---|
| 1 | `B-MBIM-SWITCH-ON` scope §4 argued the monitor's drift branch needed no disposition because `triggerSoftResubscribe` was **"pre-existing behaviour of the service as designed, not introduced here."** | The service had **never run**. Wiring it to boot would have fired that limb for the first time in its 8-month life — into `softResubscribe` -> `orderBooks.delete`, read by `getBookForFill` behind the **FAIL-CLOSED #295 depth gate** => a silently blocked promotion. **The limb is 2025-12-30 code written BEFORE that gate existed**, so "does it still fit today's architecture?" was never asked. Langston: *"the scope gave that limb no disposition."* | `481bda9e3` |

⚠️ **ONE INSTANCE, ONE BATCH — WELL BELOW the 3-across-2 floor. Recorded so the next one promotes by grep, not to inflate a pattern.** The counter-habit: **before switching anything on, enumerate what it DOES, not what it IS** — the §9.5(a) census applied to a component's own actions rather than to its callers.

### `wrong-object` — **PROMOTED TO §13** · mechanism: **NONE YET**
**Right name, wrong thing.** The path is correct, the file is correct, the command runs — and it measures something other than what the claim is about.
**INSTANCES (attributed, condition 4 — no grandfathering):**
| # | instance | batch | ref |
|---|---|---|---|
| 1 | measured a governance file off my **worktree** instead of the **ref** | B-CONDUCT-FILE | completion report, MEASUREMENT §|
| 2 | baselined against `origin/…` **after that ref had advanced to my own push** — arithmetic came out backwards | B-CONDUCT-FILE | `0acb762d8` |
| 3 | read `git log -200 --grep` as *"of the last 200"* — **`-200` caps OUTPUT after filtering**, so it counted all history against a denominator I believed I had set | B-MISTAKES-FILE | `216d57f8b` |
| 4 | counted substring `correct` and reported it as **the presence of a correction**; ~18% adjectival | B-MISTAKES-FILE | `249875947` |
| 5 | reported transcript **file size** as overnight **growth** | — (conversational) | this file's §-above |
| 6 | **bounded a population by OPEN time and then asked a CLOSE-time question of it** — reported a 30-day P&L as `−35.47/100` windowed on `opened_at`, and told Langston the ghost filter, not the row cap, carried the error. Both halves wrong: recomputed on `closed_at` the ghost filter is a **provable no-op** (95 rows / −52.79 either way) and the cap is the ENTIRE error | B-BALANCE-TRUTH | `318673810` |
| 7 | **tested a data-integrity identity against `total_fee` when the value under test is DEFINED from `total_cost`** — declared one line away in the same schema block. Produced a fictitious "184-row broken fee era", which I escalated to Kyle **with a push notification** as a headline finding. Against the correct column: **478/478 consistent, max deviation 0.0000** | B-BALANCE-TRUTH | `#735` WITHDRAWN |
⛔ **INSTANCE 7 IS THE ONE THAT SHOULD END THE ARGUMENT FOR DEFERRING `B-MEASURE-GATE`.** Three instances of one pattern **in a single session**, by the session that filed instance 6 **and wrote the warning above it**, the third escalated to the decider before it was right. ⇒ **Self-knowledge of a pattern demonstrably does not suppress it — at any effort level. Only a gate that refuses a number lacking a stated object does.**
★ **AND THE THING THAT DID CATCH IT WAS NOT VIGILANCE, IT WAS A MANDATORY RULE:** the §2 1.b provenance read, required before changing the six `netPnl ?? pnl` sites. Reading the schema's declared intent surfaced the column definition immediately. **A mandatory read caught what three passes of careful attention did not** — which is the argument for mechanism over care, made by the failure itself.
⇒ **5+ instances across 3 distinct batches ⇒ THRESHOLD MET ⇒ IN §13.**
★ **Instance 6 is the sharpest argument this file has for the unbuilt mechanism, and it should be quoted at whoever next tries to defer `B-MEASURE-GATE`: the wrong-object error occurred INSIDE a batch whose entire purpose is deleting open-time/close-time confusion, committed by the session that had just written the rule against it, while actively looking for exactly that class of defect.** ⇒ **Knowing the pattern does not protect you from the pattern. Only a measure-time gate does.**
⛔⛔ **WEEKLY PASS 2026-08-27 — THE NUMBER IS THE ARGUMENT: `wrong-object` IS 22 OF THE 50 TRAILERS THIS WEEK (44%), ACROSS 12 DISTINCT BATCHES AND ALL FOUR SESSIONS.** The next most common slug has **2**. ★ **It is not the top of a distribution — it is the distribution**, and it is the one entry in this file whose mechanism is still `NONE YET`.
⚠️ **AND THE PASS PRODUCED INSTANCE 8 WHILE MEASURING IT.** Running the §#732 tripwire I called `/api/trades/closed`, which **does not exist**; the 404 body was read as the row list and returned **"0 breaches of 0 rows"** — a confident clean from an endpoint that never answered. **The control (total row count) is what exposed it: 651 rows exist.** ⇒ **the pass whose job is catching this class produced a fresh instance of it, in the same command that measures it.** *(Correct result, re-run against the table with the control stated: 14 `trailing_stop_hit` rows, **0 breaches**.)*

**Mechanism that would retire it:** a measure-time gate that refuses a reported number lacking a stated object + population + ref.
⛔⛔ **HOME: `B-MEASURE-GATE`, owner CC-A, placed in `PHASE_19_PLAN.md` §governance queue at position 5, after `B-GATE-GUARD`/`B-ISSUE-BLOCK-GUARD`** — same hook family, and it inherits their pre-push plumbing rather than racing it. ⚠️ **The due date that stood here (2026-09-03) is STRUCK under §9.4 (Kyle 2026-08-25): a batch gets a PLACE IN THE QUEUE, never a calendar date.** ★ **Found by the weekly pass itself — the earlier date sweep missed this one because it sits inside a pattern entry, not a ledger entry.** ⚠️ **It was carried as *"approved, unbuilt"*, and Langston is right that this is the single most important gap in the file: THAT IS EXACTLY THE STATE §13 EXISTS TO FORBID.** §13's only entry has `mechanism: NONE YET`, its forcing function points here, and **a forcing function aimed at an unowned, undated batch forces nothing.** ⇒ **an owner and a date are now mandatory AT THE MOMENT OF PRESSURE, not afterwards** — a mechanism obligation with neither is an intention wearing a deadline's clothes.

### `bare-commit` — ✅ **RETIRED 2026-08-20** (mechanism shipped, class covered)
**Was:** a commit without explicit paths sweeps whatever is staged, including another session's held work (#542/#540, `d090178d6`, `5f291a17e`).
**Retired because `.claude/hooks/guard-bare-commit.mjs` REFUSES every bare `git commit` — CLASS coverage, not the instance that surfaced it.** Removed from `CONDUCT.md` §13 in the same commit.
⚠️ **Kept here, not deleted:** a retired entry is the RECORD that the pattern was real and is now mechanised. **Deleting it would let the pattern be re-discovered from scratch.**

### `silence-not-evidence` — **LIVE — NOT IN §13** · mechanism: **PARTIAL**
**A check that CANNOT FAIL, mistaken for a check that passed.** Silence from a broken instrument is indistinguishable from silence from a healthy one.
**INSTANCES (attributed):**
| # | instance | batch | ref |
|---|---|---|---|
| 1 | wake-filter suppression **never fired in production** (stdin cp1252 vs UTF-8) + **three hand-fed tests that processed nothing** because they carried no `tail` file header | B-CONDUCT-FILE | #730, `5c2896938` |
| 2 | unset-path guard that **read as applied and did nothing** — `join('', 'CONDUCT.md')` is truthy, so the fallback was unreachable | B-CONDUCT-FILE | `0acb762d8` |
| 3 | **§7(a)'s own verification** specified against the `InstructionsLoaded` sink, which records **harness auto-loads only** and therefore could never observe a **hook-injected** file | B-CONDUCT-FILE | alert `441abe49`, resolved 2026-08-20 on the correct object — **7 loader injections observed in the transcript record (CC-A 6, CC-C 1)** |
⛔ **ALL THREE SIT IN ONE BATCH ⇒ the 2+-distinct-batches leg is NOT met ⇒ NOT promoted.** ★ **This is the gate refusing its own author's favourite example, which is the point of dogfooding it** (Langston condition 4: *"a gate whose initial population bypassed it is a gate on paper"*).
| + | **a caller census asserting "gates nothing" EXCLUDED THE DEFINING FILE, missing two `this.`-qualified self-calls — one of them a LIVE engine-start gate that throws.** The positive control passed and licensed the absence anyway: the three sibling callers it cited are all RECEIVER-qualified (`manager.`), while the misses are `this.`-qualified, so **the control exercised a call shape that could not fail** | B-BALANCE-TRUTH | `#734`, Langston BLOCKER |
★ **THE DIMENSION THIS ADDS, and it is the reason this instance is worth its lines: a positive control must match the SHAPE of the absence it licenses, not merely the STREAM and SEVERITY CLASS.** The existing rule made me match stream and severity and I did — and still shipped a false absence, because "does the census find callers at all?" and "does the census find callers *written the way the missing ones are written*?" are different questions and only the second one was load-bearing. ⇒ **standing: a caller census supporting an asserted absence searches `this.<name>` explicitly and never excludes the defining file.**
**Mechanism:** the wake filter's `else` now announces an unrouted line on stderr — **covers ONE instance in ONE watcher, not the class.** Per the retirement criterion, **partial coverage does not retire.**

### `hook-blind-compound` — **LIVE — NOT IN §13** · mechanism: **NONE YET**
**A COMPOUND SHELL COMMAND DEFEATS A HOOK THAT REASONS ABOUT STATE THE COMMAND ITSELF WOULD CREATE.** A `PreToolUse` guard fires on the whole call, BEFORE any of its parts run — so `add && commit && push` is judged in a world where the commit does not exist yet, and any guard that asks *"which files did this push touch?"* gets the empty set.
**INSTANCES (attributed):**
| # | instance | batch | ref |
|---|---|---|---|
| 1 | `guard-push-tsc-baseline` REFUSED a legitimate push, reporting the 7-error drop as *"in files this push DID NOT TOUCH"* — `server/routes.ts` **was** in the commit, but the commit had not been made when the hook evaluated | B-BALANCE-TRUTH | `e67deebef`, Step C |
| 2 | same shape, twice more on the next step — and the second-order cost is the sharper half: the blocked call also never wrote its own heredoc, so `git commit -F /tmp/msg.txt` then failed with *"could not read log file"*, which reads like a filesystem fault rather than a hook refusal | B-BALANCE-TRUTH | `c7c374732`, Step D |
⛔ **ONE BATCH ⇒ the 2+-distinct-batches leg is NOT met ⇒ NOT promoted.**
★ **THE TRANSFERABLE HALF IS THE GUARD'S, NOT MINE: it refused CORRECTLY on a cause it had wrong.** The refusal was right (an unverified error-count drop should not reach staging), the stated reason was false (the files *were* touched), and acting on the stated reason would have sent me hunting a parse failure that did not exist. **A guard can be right about the verdict and wrong about the evidence, and the verdict is the part to trust.**
**Mechanism that would retire it:** the guard resolving its touched-file set from the *working tree + index* rather than from committed range alone — or, cheaper and available today, never chaining a state-creating command with a state-reading guard. **Discipline until then: commit in its own call; push in its own call.**

### `process-not-file` — **LIVE — NOT IN §13** · mechanism: **NONE YET**
**A file test used to support a claim about a RUNNING PROCESS.** A running process holds the code it loaded at start; fixing the file does not fix the process.
**INSTANCES:** 1 — told Kyle a wake event *"confirms the filter fix works in production"* when the running watcher still held the pre-fix code (B-CONDUCT-FILE, `5c2896938`). **Below threshold.**
**Mechanism that would retire it:** the watcher reporting its own load time in its wake lines.

---

# WEEKLY PASS — RUN LOG (a missing row IS the alarm)

| date | window | new instances | promotions / displacements / retirements | by |
|---|---|---|---|---|
| 2026-08-20 | seed | 3 patterns seeded, 9 instances attributed | `wrong-object` → §13. `silence-not-evidence` and `process-not-file` below threshold, held here. | CC-A |
| 2026-08-20 | rehearsal | 0 new | `bare-commit` PROMOTED then RETIRED — the retirement path exercised end to end, both files in one commit | CC-A |
| 2026-08-27 | 08-20 → 08-27 | **50 trailers; `wrong-object` 22 (44%, 12 batches), `skipped-the-gate` 2, 26 singletons** | **No promotion — §13 already holds `wrong-object` and the slot limit is not the constraint; the MECHANISM is.** `B-MEASURE-GATE` due-date STRUCK → placed at queue position 5 (§9.4). `skipped-the-gate` at 2 instances this week, 4 lifetime — mechanism `B-GATE-GUARD` already placed, file set CONFIRMED widened to `.claude/skills/**` on two independent derivations. **Tripwire #732: CLEAR — 14 `trailing_stop_hit` rows, 0 breaches, control 651 total rows** (up from 7-for-7; population doubled, record holds). ⚠️ **The pass generated a `wrong-object` instance while running: a 404 body read as data returned "0 of 0" until the control caught it.** | CC-A |
