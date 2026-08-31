# B-MEASURE-GATE leg 2 — PRE-AUDIT (Step 2)

> ⚠️ **THIS DOCUMENT IS `r2`, 2026-08-31. THE 07-30 BODY BELOW IS UNTOUCHED; everything added today is in §5 onward and marked `[r2]`. Nothing is deleted.**

## 0. ⛔⛔ PREVIOUSLY STATED vs NOW — **EVERY NUMBER IN THE 07-30 BODY THAT HAS MOVED, AT THE TOP WHERE IT DECIDES SOMETHING**

> ★ **It sits above the audit deliberately: a reader is about to approve a plan built on these, and a number corrected silently reads as a number that never changed (§9.2).**

| | PREVIOUSLY STATED (07-30) | NOW (re-derived at `origin/migration/aws-supabase`, 2026-08-31) | REASON |
|---|---|---|---|
| **hook files** | *"all 5 hook files"* — §1’s table, presented as the POPULATION | **10** | Five landed between 07-30 and today: `guard-push-tsc-baseline.mjs` · `instructions-loaded-native.mjs` · `load-conduct.mjs` · `log-instructions-loaded.mjs` · `probe-warn-delivery.mjs`. **The layer this batch modifies DOUBLED while the audit of it sat still.** |
| **wired events** | *"Two events wired"* — `PreToolUse`, `SessionStart` | **THREE** — `PreToolUse` · `SessionStart` · **`InstructionsLoaded`** | `instructions-loaded-native.mjs` wired the native event after 07-30. **Directly load-bearing: §1 FINDING B’s argument was *"OBJ-1 introduces a NEW event surface"* — still true, but it is now the third such precedent, not the first.** |
| **the probe** | *"wired **LOCALLY and deliberately NOT committed**"*, disposition *"stays wired locally (uncommitted)"* | ✅ **COMMITTED since `3fd7ed119` (2026-08-07 — `[r4]`, this cell said 08-03 while §6 said 08-07; **the document contradicted itself on its own front page for one commit**)** and therefore PRESENT in all three clones. ⚠️ **`[r4]` "LIVE" IS STRICKEN AS UNCITED** — present is a fact about a tracked file; **live additionally requires each session to have restarted since and to hold no local edit to `settings.local.json`, and neither was checked** | See FINDING C. **The recorded disposition was reversed by a different process and nothing reconciled the two.** |
| **`wrong-object` magnitude** | *"77 instances across 24 batches = 48% … six times second place"* (`PHASE_19_PLAN` row 6) | ✅ **80 · 46.8% of 171 well-formed trailers across 44 slugs · 6.2× second place — PINNED AT `24f4b39bb`.** ⚠️ **`[r4]` TWO CORRECTIONS AGAINST THIS ROW’S OWN HEADER, BOTH FROM AN OBJECT ROUND.** **(i) THE COLUMN HEADER SAID "re-derived at `origin/migration/aws-supabase`" AND IT WAS NOT** — `24f4b39bb` is **17 commits behind the ref head**, and at the head the same walk returns **85 / 180 / 47.2%.** ✅ **The pinned figure is what the scope commits to and it reproduces exactly at its own sha; the DIRECTION is unchanged and the ratio is stable. But a figure pinned at one sha may not be captioned as re-derived at another, which is this batch’s own subject.** **(ii) THE 171/44 DENOMINATOR IS NOT REPRODUCIBLE FROM THE DOCUMENT AS WRITTEN:** it requires dropping the literal `MISTAKE: none` trailer, **a real row in the corpus.** The exclusion is correct — a declared no-mistake is not a mistake — **and it was nowhere stated, so the raw walk returns 172/45.** ✅ **Stated now.** | First pass carried **no ref**, reproduced only at `~HEAD~25`, and drew its control from a **different population** (`--all` against branch ancestry). ⛔ **THE ACROSS-BATCHES DENOMINATOR IS WITHDRAWN OUTRIGHT** — 26 bracket-tokens is not 26 batches (~12 by subject-line id), so **no across-batches figure is claimed at all.** Row 6 corrected this commit `[C1]`. |
| **rank in the queue** | *"RE-RANKED TO THE TOP OF THE UNSTARTED WORK"* | ⛔ **FALSE ON ITS OWN PAGE — position 6, four unstarted items above it** | Position was true when written and drifted as items were placed above. ★ **Langston’s transferable form, filed on `#978`: a queue position is an integer that every insertion above it silently decrements — cite the ANCHOR or the READ-SITE, never the number.** |

---


**Owner:** CC-A · 2026-07-30 · scope at `d04bf1978` · change-class `architecture` · home `RUNNING_ISSUES` #623

## 1. MEASURED STATE OF THE HOOK LAYER (read, not recalled)

**OBJECT:** `.claude/hooks/` + `.claude/settings.local.json` in `C:\DawnTraderV3-old`. **POPULATION:** all 5 hook files and all wired events.

| File | Bytes | Wired to |
|---|---|---|
| `guard-governed-read.mjs` | 2,205 | `PreToolUse` / matcher `Bash` |
| `guard-bare-commit.mjs` | 15,435 | `PreToolUse` / matcher `Bash` |
| `fresh-rules.mjs` | 7,951 | `SessionStart` / `startup\|resume\|compact` |
| `session-reminder.mjs` | 1,258 | `SessionStart` / same |
| `load-own-memory.mjs` | 4,565 | `SessionStart` / same |

**Two events wired: `PreToolUse` (2 hooks, chained) and `SessionStart` (3 hooks).**

**The precedent contract, quoted from `guard-governed-read.mjs:8-10` rather than summarised:**
> *"Fail-OPEN by construction: any parse/read problem here exits 0 (allow) so this guard can NEVER break a session — it only ever blocks the one precise dangerous shape. Exit 2 = block; the stderr message is fed back to the model."*

Mechanics confirmed at the source: payload arrives as JSON on **stdin**, command at `tool_input.command` (`:15-16`); **every** failure path is `process.exit(0)` (`:18`); block is `exit 2` with the explanation on stderr (`:27-36`); the trigger is the **conjunction** of two narrow regexes (`:22`, `:24`), not either alone.

**★ FINDING A — hooks are invoked via `$CLAUDE_PROJECT_DIR`, so they are PATH-PORTABLE and take effect in ALL THREE CLONES automatically.** This is not a per-session opt-in. ⇒ **OBJ-0's notification is load-bearing, not courtesy** — confirmed by measurement, which is why it is objective zero.

**★ FINDING B — there is NO `UserPromptSubmit` hook today.** OBJ-1 therefore introduces a **new event surface**, not another entry on an existing one. That is exactly the exposure behind Langston's *"an SSH to Frankfurt on every turn is a new wedge surface."*

## 2. ★ THE ORDERING CHALLENGE — I think OBJ-5 must precede OBJ-1, and Langston ruled the reverse

He ruled §10.5 *"strongest candidate, convert first."* **I am not reordering on my own judgement — I am putting the argument to him**, because two measured facts cut against it:

1. **OBJ-1 runs on every turn in all three sessions** (Finding A + Finding B). ⚠️ **`[r4]` THE WORD "ONLY" IS STRICKEN AS UNCITED AND WRONG TWICE OVER: `PreToolUse`/`Bash` fires PER BASH CALL, which on a working turn is MANY TIMES per turn rather than once — measured today at 44 probe rows in nine minutes — and OBJ-6c puts `PostToolUse` on the same footing inside this same batch.** ✅ **The argument does not need "only": what it needs is that OBJ-1’s blast radius is every session, which stands.** Its blast radius is every session's every turn; every other objective fires on a specific command shape.
2. **OBJ-1 is fail-open on a NETWORK call — so its failure mode is SILENT BY DESIGN.** A wedged or dead alert-injector looks exactly like "no active alerts," which is **the absent-as-valid class this entire batch exists to kill**, now installed in the enforcement layer itself.

⇒ **His own second non-negotiable — the self-test, because *"a fail-open hook that has silently stopped running is a lookalike failure in the enforcement layer itself"* — applies MOST SHARPLY to OBJ-1, and therefore should EXIST BEFORE IT, not after.** ⇒ **Proposed order: OBJ-4 (lowest-risk, establishes the warn-only pattern) → OBJ-5 (the self-test) → OBJ-1 → OBJ-2 → OBJ-3.** His call; I will build his order if he holds it.

## 3. BLAST RADIUS (§9.5(a) census on the layer being changed)

- **WRITES here:** only CC sessions editing `.claude/`; the `fresh-rules.mjs` hook **re-stages `CLAUDE.md` / `.claude/*` into the index** (known, in `MEMORY_CC_A`) ⇒ **any commit in this batch must verify staged content is mine** (rule 25.c). Done for every commit so far via `--cached` content checks.
- **READS here:** the Claude Code harness, per event, in all three clones.
- **DELETES here:** nothing. No hook is removed in leg 2 (leg 3 territory, and only text-collapse even then).
- **SCHEDULERS/ENTRY POINTS:** `PreToolUse` (per Bash call), `SessionStart` (`startup|resume|compact`), and **newly** `UserPromptSubmit` (per turn) — the third is new and is the risk.
- **SHARED STATE:** `.claude/settings.local.json` is a **single file all three sessions edit** ⇒ claim it on the crew board before editing (§5 rule 25.a) and expect pull-time collisions.

## 4. WHAT I WILL NOT ASSERT

- **I have not verified the harness's `UserPromptSubmit` payload shape or its timeout semantics** — I am reasoning from the documented `PreToolUse` contract and one unread event type. **Before OBJ-1 ships, that gets measured with a no-op hook that logs its payload, not assumed.** (Assuming an adjacent event behaves like the one I have read is the exact error class this batch is about.)
- **I have not proven a warn-only `PreToolUse` hook's stderr reaches me without blocking** — i.e. whether exit 0 + stderr surfaces at all. **If it does not, OBJ-4's whole delivery mechanism is wrong**, and that is measured first, with a control, before the real matchers are written.

### 4.1 ★ ATTEMPTED THAT MEASUREMENT AND IT IS **DEFERRED, NOT ANSWERED** — recorded because the near-miss is the point

A sentinel-gated probe (`.claude/hooks/probe-warn-delivery.mjs`, fires only on the literal `CCA_HOOK_PROBE_9f3`, so it is inert for every other command and session) was wired **LOCALLY and deliberately NOT committed**, then the sentinel was run. **No warning appeared.**

⚠️ **THAT RESULT IS UNINFORMATIVE AND MUST NOT BE READ AS "warn-only delivery does not work."** `CLAUDE.md` rule 22 states the reason outright: *"Hooks load at session start, so a freshly-added hook is live from the NEXT session, not the one that added it."* ⇒ **the instrument could not reach the thing being measured**, so its silence carries no information — **the exact absent-as-valid shape this batch exists to kill, arrived at while building the batch.** Under rule 29(b) the probe was run with only a positive treated as evidence, which is why nothing was concluded.

**DISPOSITION:** the probe **stays wired locally (uncommitted)** so it answers on the next session start. **OBJ-4 does not get finalised until it does** — if warn-only stderr does not surface, OBJ-4's delivery is wrong and the objective is redesigned rather than shipped hopefully.

**★ AND IT GENERALISES TO THE WHOLE LEG: every hook in this batch is unverifiable in the session that writes it.** So "wrote the hook" and "the hook works" are separated by a session boundary for all five objectives, and **any claim of a working hook made in the same session that authored it would be unevidenced by construction.** That is now a stated verification constraint on this batch, not a surprise to be discovered at Step 7.

---

# `[r2]` 2026-08-31 — RE-DERIVATION, THREE NEW FINDINGS, AND THE PLAN

**Trigger:** Langston’s Step-1 approval (2026-08-31 12:22Z) — three conditions and four answered attack-questions. **Everything below was measured at `origin/migration/aws-supabase` today, not carried from July.**

## 5. `[r2]` THE HOOK LAYER, RE-DERIVED — **§1’S TABLE WAS A SNAPSHOT AND IT AGED**

**OBJECT:** `.claude/hooks/` and `.claude/settings.local.json` **at the ref** (not my working tree — `#751`). **POPULATION:** every file `git ls-tree` returns under `.claude/hooks/`, and every event key in the settings `hooks` object.

| file | bytes at ref | in §1’s table? |
|---|---|---|
| `fresh-rules.mjs` | 8,897 | ✅ (was 7,951) |
| `guard-bare-commit.mjs` | 15,130 | ✅ (was 15,435) |
| `guard-governed-read.mjs` | 2,167 | ✅ (was 2,205) |
| `guard-push-tsc-baseline.mjs` | 12,234 | ⛔ **NEW** |
| `instructions-loaded-native.mjs` | 2,382 | ⛔ **NEW** |
| `load-conduct.mjs` | 11,279 | ⛔ **NEW** |
| `load-own-memory.mjs` | 7,253 | ✅ (was 4,565) |
| `log-instructions-loaded.mjs` | 6,523 | ⛔ **NEW** |
| `probe-warn-delivery.mjs` | **3,414** *(`[r4]`)* | ⛔ **NEW — this batch’s own, see FINDING C.** ⚠️ **THIS CELL READ `625` — the size at `24f4b39bb`, under a column headed "bytes at ref", stale against the very commit that carries the table** (`0e6139405` rewrote the probe; that rewrite IS FINDING D’s fix). |
| `session-reminder.mjs` | 1,242 | ✅ (was 1,258) |

⛔⛔ **`[r4]` THE "was N" COLUMN IS COMPARING TWO DIFFERENT SURFACES, AND FOR THREE OF THE FIVE THE ENTIRE DELTA IS LINE ENDINGS — NOT CONTENT.** §1 measured a **Windows working tree (CRLF)**; this table measures the **git object store (LF)**.
| file | §1 "was" | at ref | delta | LINES at ref |
|---|---|---|---|---|
| `guard-governed-read.mjs` | 2,205 | 2,167 | **38** | **38** |
| `session-reminder.mjs` | 1,258 | 1,242 | **16** | **16** |
| `guard-bare-commit.mjs` | 15,435 | 15,130 | **305** | **305** |

✅ **DELTA ≡ LINE COUNT ⇒ ONE BYTE PER LINE ⇒ CRLF-vs-LF. THOSE THREE FILES ARE BYTE-IDENTICAL IN CONTENT AND NOTHING DRIFTED.** ⛔ **Only `fresh-rules.mjs` (+946 over 164 lines) and `load-own-memory.mjs` (+2,688 over 127 lines) changed for real.**
★★ **THIS IS `#751` — CRLF INFLATION READ AS CONTENT — INSIDE THE TABLE I WROTE TO CATCH DRIFT, ON THE SAME DAY, IN THE BATCH ABOUT MEASURING THE WRONG THING.** The rule I hold is *"measure at the ref, never your checkout"*; **I obeyed it for the NOW column and compared it against a THEN column measured the other way.** ⇒ **the rule is not "measure at the ref" — it is "BOTH SIDES OF A COMPARISON MUST COME FROM ONE SURFACE."**

**Wired events at the ref: `PreToolUse` (4 hooks in TWO separate matcher blocks, both matcher `Bash` — `[r4]`, this read "chained", which they are not) · `SessionStart` (3, plus the chunked loaders) · `InstructionsLoaded` (1).** `.claude/settings.json` is **NOT PRESENT AT THE REF** — stated rather than assumed, because §1 named only `settings.local.json` and an absent second settings file is a thing a reader would otherwise have to take on trust.

## 6. ⛔⛔ `[r3]` **FINDING C — §4.1 ASSERTED THE PROBE WAS "WIRED LOCALLY". IT WAS NEVER REGISTERED. THE SENTENCE WAS FALSE WHEN WRITTEN AND IT IS STILL THERE.**

⚠️ **THIS FINDING WAS WRITTEN THE OTHER WAY ROUND EARLIER TODAY AND A FRESH READER REFUTED IT AGAINST THE OBJECT. THE `[r2]` VERSION IS SUPERSEDED, AND WHAT REPLACES IT IS BETTER, SO THE CORRECTION IS RECORDED RATHER THAN QUIETLY SWAPPED.**
**I claimed the batch-close sync gate had swept up a file whose uncommittedness WAS its design, and filed a "check 4 has no fourth outcome" defect against the gate.** ⛔ **THE GATE DID ITS JOB. I ACCUSED IT OF THE OPPOSITE OF WHAT IT DID, AND THE ITEM I FILED AGAINST IT IS WITHDRAWN.**

**WHAT §4.1 SAYS, AT THE REF, TODAY:** *"was wired **LOCALLY and deliberately NOT committed**"* · *"the probe **stays wired locally (uncommitted)** so it answers on the next session start."*

**WHAT THE ARMING COMMIT SAYS — `3fd7ed119`, 2026-08-07, quoted not summarised:** *"a probe written during the B-MEASURE-GATE leg 2 pre-audit, **never registered**, sitting untracked for days — **an instrument measuring nothing**."* … *"**Now registered.**"* ✅ **And `RUNNING_ISSUES:2198` records the same: found by the §7.1 gate-4 untracked-file review, orphaned and unregistered.**

⚠️ **`[r4]` AND THAT INFERENCE OVERREACHED — AN OBJECT ROUND CAUGHT IT, AND THE CORRECTION IS THE SECOND ONE THIS FINDING HAS TAKEN.** **BOTH CITED OBJECTS ARE THE SAME AUTHOR ASSERTING THE SAME THING ON THE SAME DAY**, and **neither says what `settings.local.json` held on 07-30.**
✅ **WHAT IS ESTABLISHED, AND IT IS NARROWER: on 08-07 the `.mjs` was untracked and the COMMITTED settings carried no entry** — the diff adds a 9-line block.
**EQUALLY CONSISTENT WITH THAT EVIDENCE:** (a) never wired · (b) **wired by a LOCAL, UNCOMMITTED edit to `settings.local.json` — exactly what §4.1 described — later lost to a `checkout`, a stash, or the `fresh-rules.mjs` re-staging this document flags in §3, leaving no artifact** · (c) wired at USER level, which nobody read on 08-07 · (d) wired and deliberately un-wired before the review.
⇒ ⛔ **"THE COMMITTED SETTINGS HAD NO ENTRY ON 08-07" IS NOT "NOTHING WAS ARMED FOR EIGHT DAYS", AND I CONVERTED ONE INTO THE OTHER.**
★★ **THE WITHDRAWAL OF THE CHECK-4 DEFECT STANDS ON FIRMER GROUND THAN THE REPLACEMENT FINDING, AND THAT ASYMMETRY IS THE HONEST SUMMARY: `[r2]` WAS REFUTED; `[r3]` IS NOT THEREBY ESTABLISHED.**

★★ **AND THAT IS `#978` SHAPE A, IN THIS BATCH’S OWN PRE-AUDIT, ABOUT THIS BATCH’S OWN INSTRUMENT: AN ASSERTED LIVE STATE WITH NO READ-SITE.** The sentence names a condition of the world (*"wired"*), cites nothing that would show it, and **nothing ever compared it to `settings.local.json`.** ⇒ **for eight days the document told every reader the gate was armed and waiting, and there was nothing armed.**

★ **THE GATE IS THE ONLY THING IN THE STORY THAT WORKED.** §7.1 check 4 requires untracked files to be reviewed **BY EYE**, and that review is what noticed an instrument measuring nothing. **The check that caught it is the one I filed a defect against**, which is `wrong-object` at the level of blame rather than of measurement: **right file, right event, wrong actor.**

⚠️ **TWO FIGURES IN THE `[r2]` VERSION WERE ALSO WRONG AND ARE CORRECTED HERE: the arming commit is 2026-08-07, NOT 08-03, so the probe has been registered for 24 days, NOT 28.** Both were asserted without opening the commit.

✅ **WHAT SURVIVED UNTIL TODAY, AND IT IS THE HALF THAT MATTERED: OBJ-4’S GATE HAD NEVER CLOSED — ✅✅ **AND §16 CLOSES IT.** The objective was made conditional on the probe answering. **In 24 registered days the answer never arrived and nothing ever asked why** *(`[r4]` — this read "nobody typed the sentinel", **an absence claim with no instrument**: the sink did not exist until today, so nothing could have shown it either way. **The claim is narrowed to what the documents DO show — no record of an answer anywhere at the ref, which both the commit body and `RUNNING_ISSUES:2198` set as the condition for retiring the probe.**)* — and both the commit body and `RUNNING_ISSUES:2198` set *"once the answer is recorded, unregister and delete it"* as its exit condition, **which no document at the ref records ever happening.** ⛔ **AN OPEN GATE WITH NO EXPIRY READS EXACTLY LIKE A CLOSED ONE.**

**DISPOSITION (§9.4 #1 — fold into the work in hand):** the probe is re-armed with a real liveness leg (FINDING D), **OBJ-4 stays gated on it with a stated read-site**, and **§4.1’s false sentence is left in place with this correction beside it** rather than edited away — it is the batch’s own best worked example of the class it exists to catch.

**REVIEWER: claim-only · "was the disposition reversed by the sync gate?" · HIT, refuted the framing · re-derived y (commit body + `RUNNING_ISSUES:2198`, both read at the object).**
## 7. ⛔⛔ `[r2]` **FINDING D — THE PROBE COULD NOT HAVE TERMINATED. ITS SILENCE HAS THREE MEANINGS AND IT CANNOT TELL THEM APART.**

I fired the sentinel today. **No stderr surfaced.** ⛔ **THAT RESULT IS STILL WORTH NOTHING, AND FOR A DIFFERENT REASON THAN IN JULY.** July’s reason was the session boundary (a fresh hook is live from the NEXT session). That one is discharged — the hook is committed at the ref, **wired in my own `settings.local.json` under `PreToolUse` matcher `Bash`**, and this session started weeks after the commit. **Every link in the chain is verified at the object except the last one.**

★★ **THE LAST LINK IS THE PROBLEM: THE PROBE’S ONLY OUTPUT IS THE THING BEING MEASURED.** So a silent run is consistent with three states that matter completely differently:
| | state | what it would mean for OBJ-4 |
|---|---|---|
| **(a)** | the hook ran; warn-only stderr does **not** reach the model | ⛔ **OBJ-4’s delivery mechanism is wrong and the objective is redesigned** |
| **(b)** | the hook ran; stderr reached nobody for some other reason | needs a different fix |
| **(c)** | ⛔ **the hook never ran at all** | **says nothing about delivery whatsoever** |

⇒ **AN INSTRUMENT WHOSE SILENCE CANNOT BE DISTINGUISHED FROM ITS ABSENCE IS NOT AN INSTRUMENT** (rule 29(b), `#453`). ★ **AND IT WAS SITTING INSIDE THIS BATCH’S OWN GATE** — the batch whose entire subject is a check that runs cleanly and measures the wrong thing. **I would have read (a) off a result that is equally (c).**

⚠️ **`[r3]` MY FIRST FIX WAS INSUFFICIENT, AND THE SAME FRESH READER CAUGHT IT — THE THREE STATES WERE AN UNDER-COUNT.**
I wrote the trace **INSIDE the sentinel branch**, so every failure that happens BEFORE the match still produced no row and no stderr: **no stdin · invalid JSON · or the payload arriving under a spelling this file does not read.** ⇒ **exactly the ambiguity the fix was meant to remove, moved one step earlier.**

⛔⛔ **AND THE THIRD OF THOSE IS NOT HYPOTHETICAL — A SIBLING HOOK’S OWN HEADER RECORDS IT HAPPENING FOR REAL.** `guard-push-tsc-baseline.mjs:63-69` at the ref: its first revision read `process.env.CLAUDE_TOOL_INPUT`, **which is never set**, so *"a guard documented as fail-closed would have been silently fail-OPEN"* on every push — **"an inert hook and a satisfied hook look identical from outside."**
✅ **MEASURED AT THE REF, and it is why this is a real exposure and not a worry: `guard-bare-commit` and `guard-push-tsc-baseline` BOTH accept `tool_input` AND `toolInput`. `guard-governed-read` and my probe accepted only `tool_input`.**

✅✅ **FIXED PROPERLY THIS COMMIT: the row is written UNCONDITIONALLY on every invocation, BEFORE any decision, and records what was actually parsed** — the tool, **which spelling carried the payload**, whether a command was present, and whether the sentinel matched. **Both spellings accepted, mirroring the guards that work.**
⇒ **ABSENCE OF A ROW NOW MEANS ONE THING ONLY: THE HOOK DID NOT RUN.** A row with `matched_sentinel: true` and no stderr seen is state (a) — **a real answer, at last.**

**REVIEWER: claim-only · "can a silent run be told apart from a hook that did not run?" · HIT, named 7 further states · re-derived y (`guard-push-tsc-baseline.mjs:63-69` + spelling census across all three guards).**

★ **AND THIS IS OBJ-5’S OWN SUBJECT, ONE LEVEL DOWN: a mechanism must report whether it is live.** The probe is now a worked instance of the objective it exists to gate — **use it as OBJ-5’s reference implementation rather than designing that leg from scratch.**

## 9′. ⛔ `[r3]` **FINDING F — "THE HOOK LAYER IS FAIL-OPEN BY CONSTRUCTION" IS FALSE, AND §1 GENERALISED IT FROM ONE FILE**

§1 quoted `guard-governed-read.mjs:8-10` — *"Fail-OPEN by construction … it only ever blocks the one precise dangerous shape"* — and called it **"the precedent contract"** for the layer. ⛔ **MEASURED ACROSS ALL TEN HOOKS AT THE REF, THAT CONTRACT IS NOT THE LAYER’S.**
- **Three hooks exit 2 (block) by design:** `guard-governed-read.mjs:36` · `guard-bare-commit.mjs:249,:304` · `guard-push-tsc-baseline.mjs:111`.
- ⛔⛔ **AND `guard-push-tsc-baseline` IS EXPLICITLY FAIL-*CLOSED* IN NAMED BRANCHES:** no upstream ⇒ *"FAIL CLOSED by running the check rather than skipping it"* (`:123-126`); **comparator missing ⇒ `refuse()` — an ERROR CONDITION THAT BLOCKS THE PUSH** (`:138-144`); touched-set uncomputable ⇒ refuse (`:154`).
- ✅ **Six ARE fail-open** — the three loaders, the reminder, and the two logging hooks.
- ⛔ **`[r4]` THAT IS NINE, AND THE CENSUS CLAIMED TEN. THE UNCLASSIFIED TENTH IS THE PROBE — THIS BATCH’S OWN FILE, AND THE ONE THE REST OF THE DOCUMENT IS ABOUT.** ✅ **Classified: fail-open, `process.exit(0)` on every path, and its sink write is inside a swallowing `catch`.** ★ **A census that omits the object under discussion is the census-at-every-hop failure (§9.5(a)) applied to itself.**
- ⚠️ **`[r4]` AND THE METHOD’S REACH IS NARROWER THAN THE CONCLUSION: `process.exit(2)` is not the only way to block.** A hook can deny via JSON output (`hookSpecificOutput` / `permissionDecision`) or by an uncaught throw. **Measured: `exitCode|permissionDecision|hookSpecificOutput|"deny"|additionalContext|throw ` across `.claude/hooks/` at the ref returns ZERO** ⇒ **the conclusion holds for this corpus — by the luck of the corpus, not by the method’s reach.** ★ **Load-bearing for §16, which needs exactly that channel.**
- ⚠️ **`[r4]` "FAIL-OPEN" IS NOT "HARMLESS".** `fresh-rules.mjs` exits 0 on every path **and re-stages `CLAUDE.md` / `.claude/*` into the index** — §3 says so. **A hook can be fail-open and still be the most consequential thing in the layer.**

★ **WHY IT MATTERS TO THIS BATCH RATHER THAN BEING TRIVIA: §1’s sentence is the DESIGN PRECEDENT every leg-2 hook was to be built on.** ⇒ **the honest statement is that fail-open is a CHOICE MADE PER HOOK against its own failure cost, not a property of the layer** — and `guard-push-tsc-baseline` is the standing proof that fail-CLOSED is sometimes the right one **and that it has already fired wrongly in production once** (`:40-47`, a cwd-relative path refused every push while the file was present).
★ **Langston’s non-negotiable that leg-2 hooks be fail-open still stands — it is a constraint on THESE hooks, not a description of the layer. Both things are true and §1 collapsed them.**

**REVIEWER: claim-only · "is every hook fail-open?" · HIT, refuted · re-derived y (exit-code census across all ten at the ref).**

## 8. `[r2]` **FINDING E — BOTH NEW EVENT SURFACES ARE FROM ZERO, AND `PostToolUse` IS THE SECOND** *(this answers Langston’s C3 and generalises it)*

**Measured under `.claude/` at the ref, `git grep -c`, with a positive control so the zeros are readable:**
| token | occurrences | reading |
|---|---|---|
| `PreToolUse` | **11** | ✅ **the control — the search discriminates** |
| `SessionStart` | **15** | ✅ control |
| `UserPromptSubmit` | **0** | ⛔ **OBJ-1 introduces it from zero** — §1 FINDING B, re-confirmed |
| `PostToolUse` | **0** | ⛔ **OBJ-6c introduces it from zero too** |

**C3 asked for the `UserPromptSubmit` disposition to be stated rather than left implicit. It is the same disposition as `PostToolUse`’s, and stating it once for both is the honest form:**

> ✅ **DISPOSITION FOR BOTH NEW EVENTS: a payload-logging no-op ships FIRST and its observed shape is recorded, before any matcher is written against it.** ⛔ **Reasoning from the documented `PreToolUse` contract to an unread event is precisely `wrong-object` — assuming an adjacent thing behaves like the one you actually read.** ★ **`InstructionsLoaded` is now a THIRD in-house precedent for wiring a new event safely (`instructions-loaded-native.mjs`), so this is a walked path, not a first.**

⚠️ **`[r4]` NAME THE POPULATION, BECAUSE IT IS NARROWER THAN "FROM ZERO" SOUNDS: THE COUNTS COVER `.claude/` IN THE REPO AT THE REF.** **Repo-wide the tokens are NOT zero** — `PostToolUse` appears in `MECHANISM_INTEGRATION_PLAN.md` (2) and a June cross-session brief (1); `UserPromptSubmit` in the same brief (1). ★ **That is PRIOR DESIGN DISCUSSION the census excludes — and it sharpens the point below rather than blunting it: the idea was written down in June and still arrived unflagged in August.**
✅ **The population also excludes USER-LEVEL `~/.claude/settings.json` and any per-clone uncommitted `settings.local.json` edit — the only places a live registration could hide from the ref. The user file was read and carries no `hooks` key, so the state is excluded IN FACT; the CENSUS does not exclude it, and that distinction is the whole of rule 29(b).**
✅ **`Stop` returns 3 and `InstructionsLoaded` 5 under the same population — worth stating because §15 rests on `Stop`.**

★ **The generalisation is worth more than the condition: the July audit flagged the from-zero risk for `UserPromptSubmit` and the same risk arrived unflagged with `PostToolUse` a month later.** ⇒ **the plan carries ONE rule covering any new event surface, rather than a note per event.**

## 9. `[r2]` **OBJ-6 IS FOUR OBJECTIVES, AND 6c AND 6d MUST NOT SHARE A BAR** *(Langston Q1 — he wanted four, and the reason is not tidiness)*

| # | objective | it is a… | ✅ ITS OWN BAR, and only its own |
|---|---|---|---|
| **6a** | register a `Stop` hook and **observe** whether it fires | **an OBSERVATION**, not a build | ✅ **it fires, or it does not — either is an answer.** ⛔ **No design may rest on the answer before it exists; the batch does NOT depend on it** (`PostToolUse` carries what `Stop` was wanted for). |
| **6b** | measure the **tool distribution** of recorded `wrong-object` instances, from transcripts | ⛔ **A GATE. IT RUNS FIRST AND IT CAN KILL 6c/6d OUTRIGHT.** | ⛔ **If the population is not predominantly `Bash`, the matcher is mis-aimed and 6c/6d do not get built.** |
| **6c** | deterministic `PostToolUse` inspection, **warn-only** | the affordable half | ✅ **fires on the shape, silent on the control.** No FP budget, no model, no rate target. |
| **6d** | agent escalation on the survivors | the expensive half | ✅ **≥5 of 8 as a FLOOR (see §11) and ≤2% escalation rate on the clean ref-window.** |

⛔⛔ **WHY THE SPLIT IS LOAD-BEARING AND NOT BOOKKEEPING, in Langston’s form: bundled, *"OBJ-6 failed"* reads as *"result-inspection failed"* when the affordable half passed.** ✅ **§5 falsifier 1 must be able to stop 6d and keep 6c.**

## 10. `[r2]` **THE ESCALATION PREDICATE — SETTLED, AND IT IS A PRINCIPLE, NOT A SPEC** *(Langston Q2; it was the one genuinely unspecified thing in the whole batch)*

⛔ **THE OUTPUT-ANOMALY ARM IS REJECTED OUTRIGHT.** A zero, a suspiciously round number, an empty result are properties of the **result alone**, with no link to any claim — **they are correct constantly, which makes them a banner-blindness generator.** `MISTAKE_PATTERNS:274` already settles it: **four of the six instruments that failed in a single day were BETTER MATCHERS than the one before.**

⛔ **AND COMMAND-SHAPE-PLUS-RESULT IS OBJ-4’S, NOT 6c’S: where the shape is visible BEFORE execution, OBJ-4 owns it, because a pre-execution warning is strictly cheaper.**

✅✅ **THE PREDICATE: A RESULT THAT COULD NOT HAVE ANSWERED THE REQUEST — a self-identifying property of the output contradicting the command that asked for it.**

**Every recorded instance has that property, which is what makes it a predicate rather than a preference:**
- `-200` capping **after** filtering ⇒ the returned count **equals the cap**, so the cap did the filtering;
- a query naming `total_fee` where the identity is defined from `total_cost`;
- instance 8: **a 404 body read as a row list**;
- ★ **and Langston’s own live instance today — §11.**

**THREE CONSTRAINTS, all binding, all pre-registered:**
1. ⛔ **Derivable from command + exit code + output with NO MODEL CALL.** If it needs to know what the CLAIM was, it is 6d’s job and not the predicate’s.
2. ⛔ **Tuned for RECALL, not precision.** Its measured bar is escalation **rate** — **never "each escalation is real."**
3. ⛔ **It must NEVER fire on a value.**

## 11. ★★ `[r2]` **THE CANONICAL EXAMPLE IS LANGSTON’S OWN, PRODUCED WHILE REVIEWING THIS BATCH** *(§9.4 disposition 1 — folded in)*

**His first fetch of this batch’s scope, at the pinned sha, returned `HTTP 200` and 7,968 bytes titled `# B-GOV-HYGIENE-ANALYST-1 — SCOPE (Step 1)`.** The contents API at the same ref reports **22,950 B, blob `b5585b95a`**; a refetch with `Cache-Control: no-cache` returned the right object. **Three plain refetches since are all correct** ⇒ **one occurrence at first touch, not reproducible.** ⚠️ **Mechanism is a HYPOTHESIS and he labelled it one** (an edge cache serving a stale object for a path).

⛔⛔ **HE WOULD HAVE REVIEWED THE WRONG BATCH’S SCOPE AND IT WOULD HAVE READ AS COMPLETE.** Well-formed request, `200`, plausible document, no error anywhere.

✅ **CAUGHT ONLY BECAUSE THE H1 NAMED A DIFFERENT BATCH — A SELF-IDENTIFYING HEADER CONTRADICTING THE REQUEST, WHICH IS THE §10 PREDICATE, ARRIVING INDEPENDENTLY AND FROM A DIFFERENT DIRECTION.**

⚠️⚠️ **`[r4]` AND AN OBJECT ROUND WIDENED THE HYPOTHESIS SPACE RATHER THAN CONFIRMING IT — THE 7,968-BYTE OBJECT IS NOT NOISE. IT IS A REAL HISTORICAL REVISION OF `B_GOV_HYGIENE_ANALYST_1_SCOPE.md`, AT `aa274b3d1`, FOUND BY SIZE ACROSS THAT FILE’S OWN HISTORY.**
✅ **The pinned figures check out: at `1246293e0` the scope blob is `b5585b95a`, and `git cat-file -s` returns exactly 22,950.**
⛔ **BUT A GENUINE PAST BLOB OF A DIFFERENT PATH IS CONSISTENT WITH MORE THAN ONE MECHANISM, AND THEY DO NOT COST THE SAME:**
| | state | what it would mean |
|---|---|---|
| **(a)** | an edge cache served a stale object for the requested path | ✅ **the labelled hypothesis — the failure is in the INFRASTRUCTURE** |
| **(b)** | ⛔ **the REQUEST named the hygiene path or an old sha, and the CDN returned exactly what was asked for** | ⛔ **the `wrong-object` is at the REQUESTER end — which makes this a DIFFERENT worked example than §10’s predicate needs** |
| **(c)** | a cache-key collision between the two `Scope Files/` paths | infrastructure again, different fix |

★★ **"ONE OCCURRENCE AT FIRST TOUCH, NOT REPRODUCIBLE" IS EQUALLY THE SIGNATURE OF (b) — A TYPO IS NOT REPRODUCIBLE EITHER.** ✅ **Labelling (a) a hypothesis was the right posture; committing to it as THE mechanism was not, and this is the same class the finding is ABOUT, one level up.**
✅ **WHAT SURVIVES INTACT AND CARRIES BOTH PLAN ITEMS: whatever produced it, a well-formed request returned `200` and a plausible document that was NOT the one asked for, and the ONLY thing that caught it was a SELF-IDENTIFYING HEADER CONTRADICTING THE REQUEST.** ⛔ **Under (b) the read-protocol assertion is MORE valuable, not less — it is the only check that fires on a mistyped request too.**

⇒ **TWO PLAN ITEMS FALL OUT OF IT:** it is 6c’s worked example, **and** a one-line assertion in the read protocol — **check the size or the H1 against the expected batch** — because **that curl is in every session’s always-loaded file and in the dispatch header itself.**

## 12. `[r2]` **THE 5-of-8 BAR IS RE-LABELLED, AND THE FREE UN-BIASING IS TAKEN** *(Langston Q3 — not fatal, but it may not be described as it was)*

⚠️ **THE TWO BIASES ARE NOT SYMMETRIC, and that asymmetry is the whole ruling.** The ≤2% false-positive bar is measured on a **clean** ref-window population. **Only the 5-of-8 sits on the dirty one** — the positives are the errors that got TRAILERED, which selects for **errors somebody noticed.** The ones nobody noticed are absent **by construction.**

✅ **SO `≥5 of 8` IS A NECESSARY-CONDITION FLOOR AND A KILL-SWITCH.** Below 5 the mechanism is decorative and that inference is sound. **Above 5 it has proven ONLY the floor.**

⛔⛔ **PRE-REGISTERED NOW, BEFORE ANY RESULT EXISTS: THE COMPLETION REPORT MAY NOT SAY "CATCHES N% OF `wrong-object`."** That inference **is not available** from a set selected on *noticed*, whatever the number turns out to be.

✅✅ **AND THE UN-BIASING IS FREE, WHICH IS WHY IT IS NOT OPTIONAL: ADJUDICATE THE REF-WINDOW SAMPLE IN BOTH DIRECTIONS.** That window is already being run for the false-positive bar. **Any escalation in it that turns out to be a REAL `wrong-object` nobody trailered is a positive the trailer set could not contain by construction.** ★ **Same window, same cost — and it is the only instrument in the batch that reaches the unnoticed arm at all.**

## 13. ⛔⛔ `[r2]` **C2 — THE HONEST DISCHARGE OF `system_manual` AND `sim`, DECIDED HERE AT STEP 2 AND NOT DISCOVERED AT STEP 10**

**The constraint, quoted rather than paraphrased: `architecture` makes `system_manual` and `sim` REQUIRED (`config.mjs:127`), and a required row cannot take `N/A`.** ✅ **And the class is NOT wrong** — cross-session blocking is the strongest blast-radius argument this batch has.

| doc | ✅ DECIDED NOW |
|---|---|
| **`SYSTEM_IMPACT_MAP.md`** | ✅ **DISCHARGEABLE FOR REAL, AND IT IS NOT PADDING.** The SIM opens with the **Cross-Cutting Runtime State, Singletons & Liveness Registry**, and **a hook that runs in every session on every turn in all three clones is exactly that.** The layer is **absent from it today** and has been through ten hooks. ⇒ **the hook layer gets a registry entry: what fires, on which event, in which clones, fail-open or blocking, and its liveness read-site.** |
| **`SYSTEM_MANUAL.md`** | ⛔⛔ **BLOCKED — NOT `N/A`, AND I AM NAMING IT RATHER THAN TICKING IT.** Its scope is architecture, strategy logic, regime detection, filter design, the signal pipeline and the maths. **This batch touches none of them and inventing a chapter to discharge a row would be padding a governance document to satisfy a matrix, which is worse than the gap.** |

★★ **THE MATRIX HAS NO CLASS FOR *"AFFECTS EVERY SESSION’S TOOLING, TOUCHES ZERO TRADING ARCHITECTURE"* — and it has no `BLOCKED` state either, only `REQUIRED` and `JUDGED`.** ⇒ **a required row that genuinely cannot be discharged takes a ✅ it has not earned. THAT IS HOW A FALSE TICK GETS WRITTEN, and I wrote two of them on `B-DISAGREEMENT-FINDER` three days after building the ledger format.**

✅ **§9.4 DISPOSITION 2 — added as an item to an existing batch: the matrix gap is `B-GOV-REPORTING`’s (queue row 8), which already owns the matrix and its missing `BLOCKED` state.** ⛔ **Not a new batch, and not "announced."**

⚠️ **PUT TO LANGSTON AS A DECISION, NOT AS A DISCHARGE: with `BLOCKED` unavailable, the only two exits the rules currently permit are (i) re-declare the class — which he has already said is wrong — or (ii) a `GOVERNANCE_EXCEPTIONS.md` entry, which the alert text offers and which he has ruled closed for required rows. THE HONEST POSITION IS THAT THERE IS NO CORRECT EXIT AVAILABLE, AND THAT IS THE FINDING.**

## 14. `[r2]` THE PLAN — **EVERY ITEM BACK-REFERENCES THE FINDING IT FALLS OUT OF**

| # | plan item | falls out of |
|---|---|---|
| **P1** | Re-arm the probe with the liveness leg; **read `~/.claude/probe-warn-delivery.jsonl` at next session start** and record which of the three states obtained | **FINDING D** |
| **P2** | **OBJ-4 stays gated on P1** and is redesigned rather than shipped if state (a) obtains | **FINDING C + D** |
| **P3** | **ONE standing rule for any new event surface:** payload-logging no-op ships first, observed shape recorded, matcher written only after | **FINDING E** |
| **P4** | Build order **6b → 6c → 6d**, with 6a running as an independent observation alongside; **6b can stop the other two** | **§9** |
| **P5** | Implement the §10 predicate under its three constraints; **no model call in the deterministic stage** | **§10** |
| **P6** | Add the size-or-H1 assertion to the read protocol in the always-loaded file and the dispatch header | **§11** |
| **P7** | Adjudicate the ref-window sample **in both directions**; pre-register the no-`N%` prohibition in the completion report scaffold **before** any result | **§12** |
| **P8** | SIM registry entry for the hook layer; **`SYSTEM_MANUAL` declared BLOCKED in-document with the reason** | **§13** |
| **P9** | File the check-4 gap and the matrix `BLOCKED` state on `B-GOV-REPORTING` (row 8) | **FINDING C + §13** |

✅ **NOTHING IN THIS PLAN IS `UNAUDITED`.**

## 16. ✅✅ `[r4]` **THE 24-DAY-OLD GATE IS CLOSED. WARN-ONLY `stderr` DOES NOT REACH THE MODEL, AND THAT CHANGES THE DESIGN.**

★★ **THE QUESTION, unchanged since 2026-07-30 and blocking OBJ-4 the whole time: DOES A `PreToolUse` HOOK’S `stderr` REACH THE MODEL WHEN IT EXITS 0 (warn, not block)?**

✅ **ANSWERED TODAY, AND THE INSTRUMENT NOW DISCRIMINATES. Sink `~/.claude/probe-warn-delivery.jsonl`, 44 rows, `12:44:49Z`–`12:53:35Z`:**
```
{"ts":"2026-08-31T12:53:28.402Z","stage":"ran","tool":"Bash","spelling":"tool_input",
 "command_present":true,"matched_sentinel":true,"about_to_write_stderr":true,"exit_code":0}
```
✅ **THE HOOK RAN. IT MATCHED. IT WROTE TO `stderr`. IT EXITED 0.** ⛔ **AND NO `PROBE-WARN-DELIVERY` TEXT APPEARED IN THE TOOL RESULT — THE RESULT CARRIED ONLY THE COMMAND’S OWN OUTPUT.**

⇒ ⛔⛔ **STATE (a). WARN-ONLY `stderr` ON EXIT 0 IS NOT A DELIVERY CHANNEL.**

★ **THE POSITIVE CONTROL IS THE DISCRIMINATING PAIR, AND IT ISOLATES THE ONE VARIABLE: `stderr` ON EXIT 2 DEMONSTRABLY REACHES THE MODEL** — that is how `guard-governed-read` and `guard-push-tsc-baseline` deliver their refusals, and both have surfaced in this session. **Same channel, same writer, different exit code, opposite outcome.** ⇒ **the exit code gates the channel; the channel is not simply broken.**

⚠️ **THE ONE THING THIS DOES NOT ESTABLISH, STATED RATHER THAN GLOSSED: n = 1 SENTINEL, ONE SESSION, ONE HARNESS BUILD.** The 43 non-matching rows prove the hook runs constantly; **they say nothing about delivery, because only the matching row wrote anything.** ★ **It is nevertheless decisive for the DESIGN QUESTION, because the design needed a channel that works, and a channel that failed its only trial is not one.**

### ✅ WHAT IT CHANGES — AND IT IS A DESIGN CHANGE, EXACTLY AS `3fd7ed119` PREDICTED

The arming commit said it in advance: *"If it does not, 'warn-mode hook' is not an available shape, and every leg-2 hook must block or find another channel. **That changes the design, not its wording.**"*

✅✅ **AND THE OTHER CHANNEL EXISTS — THE SCOPE ALREADY NAMES IT AND I HAD NOT CONNECTED THE TWO: OBJ-6’s first arm is *"WARN-ONLY (`additionalContext`, no block)"*.** ⇒ **warn-mode IS available; it is delivered by STRUCTURED JSON ON STDOUT, not by `stderr`.**
⛔ **SO EVERY WARN-ONLY OBJECTIVE — OBJ-4 AND OBJ-6c — IS RE-SPECIFIED ONTO `additionalContext`, AND `stderr` IS RESERVED FOR THE BLOCKING PATH.**
⚠️ **AND THAT CHANNEL IS ITSELF UNMEASURED: `additionalContext` appears ZERO times across `.claude/hooks/` at the ref** (§9′). ⇒ **it takes the SAME disposition as the two new event surfaces (§8): A NO-OP SHIPS FIRST AND ITS DELIVERY IS OBSERVED BEFORE ANY OBJECTIVE RESTS ON IT.** ⛔ **I am not replacing a measured dead end with an assumed live one — that is the trade this whole batch exists to refuse.**

★★ **THE KEEPER, AND IT IS THE BATCH IN ONE LINE: THE QUESTION WAS ANSWERABLE IN UNDER A MINUTE AND SAT OPEN FOR 24 DAYS, BECAUSE THE INSTRUMENT COULD NOT TELL ITS OWN SILENCE FROM ITS OWN ABSENCE.** **Adding six fields to one JSON row converted an unfalsifiable null into a decisive answer.** ⇒ **that is OBJ-5’s entire thesis, demonstrated on this batch’s own gate before a single objective was built.**

---

## 15. `[r2]` WHAT I STILL WILL NOT ASSERT

- ⛔ **Whether warn-only `PreToolUse` stderr reaches the model. STILL OPEN.** P1 answers it; **until it does, OBJ-4 is not finalised** — and that is now a read-site, not a hope.
- ⛔ **Whether a `Stop` hook fires at all.** Neither TRUE nor FALSE is evidenced: the doc string that blocked it is contradicted four ways by its own bundle, **and the bundle read was `2.1.87`, a stale standalone, against a desktop `2.1.219+` that a second reader could not locate at all.** ⇒ **the running build is UNREADABLE from here.** 6a observes; **no design rests on the answer.**
- ⛔ **The `PostToolUse` payload shape.** Unread. P3 governs it.
- ★ **And the batch’s standing verification constraint is unchanged and now has a second instance behind it: EVERY HOOK HERE IS UNVERIFIABLE IN THE SESSION THAT WRITES IT.** A claim of a working hook made in its authoring session is **unevidenced by construction.**
