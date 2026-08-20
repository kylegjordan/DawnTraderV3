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
⇒ **5+ instances across 3 distinct batches ⇒ THRESHOLD MET ⇒ IN §13.**
★ **Instance 6 is the sharpest argument this file has for the unbuilt mechanism, and it should be quoted at whoever next tries to defer `B-MEASURE-GATE`: the wrong-object error occurred INSIDE a batch whose entire purpose is deleting open-time/close-time confusion, committed by the session that had just written the rule against it, while actively looking for exactly that class of defect.** ⇒ **Knowing the pattern does not protect you from the pattern. Only a measure-time gate does.**
**Mechanism that would retire it:** a measure-time gate that refuses a reported number lacking a stated object + population + ref.
⛔⛔ **HOME: `B-MEASURE-GATE` — OWNER CC-A — DUE 2026-09-03.** ⚠️ **It was carried as *"approved, unbuilt"*, and Langston is right that this is the single most important gap in the file: THAT IS EXACTLY THE STATE §13 EXISTS TO FORBID.** §13's only entry has `mechanism: NONE YET`, its forcing function points here, and **a forcing function aimed at an unowned, undated batch forces nothing.** ⇒ **an owner and a date are now mandatory AT THE MOMENT OF PRESSURE, not afterwards** — a mechanism obligation with neither is an intention wearing a deadline's clothes.

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
