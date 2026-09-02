# B-MEASURE-GATE leg 2 — SCOPE r2 (hooks: convert measurement/process rules into mechanisms)

change-class: architecture

**Owner:** CC-A · **Opened:** 2026-07-30 · **CONSOLIDATED r2:** 2026-08-31 · **Home:** `RUNNING_ISSUES` #623 · **Leg 1 shipped:** `b43af6c1d` (rule 29 + history §5.29)
**Kyle directive (2026-07-30):** *"Let's proceed with Legs 2 and 3 first in order to avoid mistakes in the rest of your batch work."* ⇒ leg 2 precedes #602 / #613 / #615 / the retention legs.
**Kyle directive (2026-08-31):** *"If this is an existing scope, then please update it to make sure that it includes everything we're doing now."*
**Langston ruled the design** at `4e0d5335`/`69f3c03d` (07-30) and the **post-execution approach round** on 2026-08-31. This scope implements his scoring, his ordering, his two non-negotiables, and his 08-31 conditions.

> ⛔ **THIS IS ONE DOCUMENT, NOT A SCOPE PLUS AN AMENDMENT TAIL.** r2 folds the 2026-08-31 amendment into the body. ★ **A reader reconciling an original against an appendix is the multi-homing failure this programme is about — reproducing it inside this batch's own scope would be indefensible.** Every r2 change is marked **`[r2]`**; **nothing from 07-30 was deleted.**

⚠️ **AFFECTS ALL FOUR SESSIONS.** Hooks live in `.claude/settings.local.json` + `.claude/hooks/`, which ship in the repo. **A blocking hook can interrupt another session's batch mid-flight.** **OBJ-0 is a notification obligation, not a courtesy.**

---

## 0. PREVIOUSLY-STATED-VS-NOW (§9.2)

**From 2026-07-30, unchanged:**
- **PREVIOUSLY STATED: eleven targeting errors. NOW: ten. REASON:** Langston's population correction — #6 was confabulation (no measurement to control, so no adjacent object) and the self-caught #11 is a *working control*, not a defect; counting it inflated the denominator the fix was sized against.
- **PREVIOUSLY STATED: a control on every reported number. NOW: a positive control only for load-bearing numbers, zeros, near-totals and absences. REASON:** Langston ruled the per-number form unaffordable and predicted it would be abandoned within a week; I agree and had no counter-argument.
- **PREVIOUSLY STATED: the conversion line is "mechanical vs judgement." NOW: "does the violation have a TOOL-EVENT SIGNATURE?" REASON:** Langston's correction — `guard-governed-read` works because the violation *is a command string*; that, not the rule's nature, is what makes it hookable.

**`[r2]` Added 2026-08-31:**
- ⚠️ **PREVIOUSLY STATED: a judgement-capable hook can sit on `Stop`. THEN: FALSE AND STRUCK. NOW: ⛔ UNSETTLED — AND MY WITHDRAWAL WAS ITSELF AN OVERCLAIM `[R1-1]`.** **REASON:** the shipped bundle's hooks documentation states twice that prompt hooks and agent hooks are *"Only available for tool events: `PreToolUse`, `PostToolUse`, `PermissionRequest`."* **`Stop` has a feedback channel and prompt hooks exist — two adjacent true facts welded into one that is not true.** ★ **That is `wrong-object`, in this batch's own approach round, on its load-bearing sentence. Langston's instruction: keep it in the scope as the best instance we will get.**
  ⛔⛔ **`[R1-1]` A FRESH READER THEN FOUND THE SAME BUNDLE CONTRADICTING THAT DOC STRING FOUR WAYS — WHICH MAKES MY *WITHDRAWAL* AS UNEVIDENCED AS THE ORIGINAL CLAIM:**
  1. **The settings schema applies NO per-event restriction** — one uniform discriminated union across all **26** events. **A prompt hook on `Stop` passes validation.**
  2. **The only runtime event/type filter that exists is for `http` hooks on `SessionStart`/`Setup`.** There is **no equivalent filter** for prompt or agent hooks on any event.
  3. ★ **`Stop` SUPPLIES EXACTLY WHAT PROMPT/AGENT HOOKS REQUIRE.** The executor throws when `toolUseContext` or `messages` are missing; **the `Stop` runner passes both.** ⇒ **the guard that would reject it would not fire.**
  4. **The doc is demonstrably incomplete about its own subject:** it lists **10** events where the enum has **26**, **omits `InstructionsLoaded`** — the event this project actually uses — and omits a fifth hook type present in the executor.
  ⚠️ **AND THE BINARY READ WAS `2.1.87`**, the stale standalone; **desktop sessions run 2.1.219+**, so the quoted doc may not describe the running build at all.
  ⇒ ⛔ **NEITHER "TRUE" NOR "FALSE" IS EVIDENCED. THE ONLY OBJECT THAT SETTLES IT IS EMPIRICAL: REGISTER A PROMPT HOOK ON `Stop` AND OBSERVE.** ✅ **That is now OBJ-6a, and it runs BEFORE any design rests on the answer.**
  ★ **THE BATCH DOES NOT DEPEND ON THE ANSWER EITHER WAY** — `PostToolUse` carries everything the `Stop` leg was wanted for, and that is where OBJ-6 sits.
- **PREVIOUSLY STATED (to Kyle, as calibration): teams run 15-30% documentation drift. NOW: WITHDRAWN. REASON:** Langston refused the population — theirs is *"teams' documentation"*, ours is *"governance state assertions in auto-loaded files."* Different object.
- **PREVIOUSLY STATED: `toCanonical` has 65 references across 10 files. NOW: quote the query and its result, never the bare number. REASON:** Langston re-derived it at his ref and got **six TypeScript files**. **The qualitative claim — tests, a telemetry service, a diagnostic, all behind a one-line call site — is confirmed exactly; the count is not reproducible across instruments.** ⇒ **two instruments, one object, two answers.** ★ **`[R2-F]` A THIRD READER NOW MAKES IT THREE: 10 TypeScript files / 76 occurrences at the pinned ref.** ⇒ **THREE instruments, one object, THREE answers — which strengthens the stated conclusion rather than weakening it. The qualitative claim (tests + `telemetry-aggregator.ts` + `active-scan-diagnostic.ts` behind a one-line call site) confirms at every ref.**

---

## 1. PROVENANCE READ (§9.5(b) / step-1 1.b) — TIER 1 on the files whose behaviour changes

**`.claude/settings.local.json` + `.claude/hooks/`.** Introduced for rule 22 enforcement (`guard-governed-read.mjs`, 2026-07-13) after the same false-absence error recurred twice; `guard-bare-commit.mjs` followed (07-19) for #542; `guard-push-tsc-baseline.mjs` (08-07) for #680.
⇒ **DISPOSITION (1) — still relevant and correct.** Design intent is **narrow shape, fail-open, never breaks a session**, and it is the intent this leg **extends rather than revises.**

**`CLAUDE.md` §10.5 / §7.1 / rule 19 / rule 25.c** — read for intent in leg 1; each stays **DISPOSITION (2): relevant, needing an update to today's intent** — the rule text is right, its *enforcement* is prose.

**`[r2]` `PostToolUse` as an event — NO PROVENANCE EXISTS HERE.** It has never been used by this project: **verified 2026-08-31: **18 REGISTRATION ENTRIES** — `[R1-1]` **10 DISTINCT SCRIPTS**, since `load-own-memory` and `load-conduct` are each sharded across five entries — all `type:"command"`, across exactly three events — `PreToolUse`, `SessionStart`, `InstructionsLoaded`. Zero `PostToolUse`, zero `Stop`, zero prompt- or agent-type.** ⇒ **DISPOSITION (3) — a capability that should be connected and never has been.**

⛔⛔ **`[r3]` C3 — AND `UserPromptSubmit` IS IN EXACTLY THE SAME POSITION, WHICH THE SCOPE LEFT IMPLICIT.** Langston: *"§1 gives `PostToolUse` disposition (3) but says nothing about `UserPromptSubmit`, which OBJ-1 also introduces from zero."* **He is right, and the omission is the more interesting half: I stated the from-zero risk for the event I had just been arguing about, and not for the one the July audit had ALREADY FLAGGED under the same heading.**

✅ **MEASURED AT THE REF 2026-08-31, `git grep -c` under `.claude/`, WITH A CONTROL so the zeros are readable:** `PreToolUse` **11** · `SessionStart` **15** · `UserPromptSubmit` **0** · `PostToolUse` **0**.

⇒ ✅ **ONE DISPOSITION COVERS BOTH, AND IT IS STATED ONCE RATHER THAN PER EVENT: DISPOSITION (3) — NO PROVENANCE, THEREFORE A PAYLOAD-LOGGING NO-OP SHIPS FIRST AND ITS OBSERVED SHAPE IS RECORDED BEFORE ANY MATCHER IS WRITTEN AGAINST IT.**
⛔ **Reasoning from the documented `PreToolUse` contract to an UNREAD event is precisely `wrong-object`** — assuming an adjacent thing behaves like the one you actually read, which is this batch’s entire subject.
★ **`InstructionsLoaded` (`instructions-loaded-native.mjs`) is a THIRD in-house precedent for wiring a new event safely, so this is a walked path rather than a first.**

★★ **AND THE GENERALISATION IS WORTH MORE THAN THE CONDITION: the July audit flagged the from-zero risk for `UserPromptSubmit`, and the identical risk arrived UNFLAGGED with `PostToolUse` a month later.** ⇒ **the plan carries ONE STANDING RULE for any new event surface, never a note per event — a per-event note is a thing you have to remember to write again.**

---

## 2. OBJECTIVES

### OBJ-0 — NOTIFY THE OTHER SESSIONS BEFORE ANY HOOK LANDS
Post to `#general` naming each session: **what will block, what will merely warn, and the disable path.**
**Verification:** the post exists and names both.
**`[r2]`** ⚠️ **AND IT MUST REACH THEM, WHICH IS NOT THE SAME AS BEING POSTED.** CC-B was **747 commits behind and dormant 15 days**; a hook shipped that day **would not have existed for it, and nothing would have said so.** ⇒ **OBJ-0 now requires confirmation that each session's clone actually carries the hook, not that a message was sent.**

### OBJ-1 — §10.5 ALERT CHECK → `UserPromptSubmit` hook
*(Langston: "strongest candidate, convert first.")* Injects active-unacked alerts so the per-turn check stops depending on memory.
⚠️ **HARD REQUIREMENT (his):** *"Must fail-open with a hard timeout — an SSH to Frankfurt on every turn is a new wedge surface."* ⇒ **timeout ≤3s, `exit 0` on any failure, never blocks the turn.**
**Verification:** the alert appears injected on a turn with a known-present active alert; **and with the network path deliberately broken, the turn still proceeds** — that second half is the load-bearing one.
✅ **`[r5]` BUILT IN TWO STAGES, PER THIS SCOPE'S OWN NEW-EVENT RULE, AND THE OBSERVED SHAPE IS RECORDED HERE, NOT ONLY IN A SINK.** Stage 1 (`observe-userpromptsubmit.mjs`) fired from **three sessions on 2026-09-02** and recorded the live payload: `session_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `prompt_id`, `permission_mode`, `hook_event_name`, `prompt`, `session_title` — **all strings, no `tool_input`.** Stage 2 (`inject-due-alerts.mjs`) is written against that, not the documentation.
✅ **BOTH VERIFICATION HALVES MEASURED:** live → 7 due alerts injected in 2.0s; unroutable host → exit 0, 3.2s, turn proceeds, and the failure is **INJECTED AS A VISIBLE LINE** — *"ALERT CHECK COULD NOT RUN"* — because silence would read as *"no alerts"*, the exact enforcement-layer lookalike. The remote filter prints a COUNT line as its own positive control, so *zero alerts* and *filter did not run* are never the same output.
⛔ **IT READS THE WHOLE FILE, FILTERED ON STAGING — NEVER A TAIL.** `#980` measured the mandated `tail -50` seeing 4 of 11 due alerts. **This is `#980`'s mitigation, landed in the batch that already owned the hook.** ⚠️ Cost stated: 2.0–2.2s per turn, inside the 3s cap but not by much; a persistently slow link turns every turn into a visible *could-not-check*, which is the honest outcome.

### OBJ-2 — §7.1 `git fetch` GATE → `PreToolUse` on `git commit` / `git push`
Warns when `origin/<branch>` was last fetched longer ago than a threshold, because the sync gate's step 0 has already been skipped in practice.
**Verification:** with a stale fetch the warning fires; with a fresh fetch, silent; **and it never blocks** — a blocked commit at the wrong moment costs more than a stale compare.

### OBJ-3 — RULE 19 CI-GREEN → `PreToolUse`, keyed on the COMMIT THAT ADDS A `*COMPLETION_REPORT*` PATH
*(Langston's correction: "the event isn't 'close'.")* Demands a cited run id in the message.
**Verification:** a completion-report commit without a run id warns; with one, silent.

### OBJ-4 — RULE 29 MEASUREMENT SHAPES → `PreToolUse`, WARN-ONLY
The shapes with a genuine **command-string** signature, each drawn from a real error: an unfiltered `LIKE '%…%'`, a `head`/`tail` slice presented as a population, a `grep -c` used as a thing-count.
**Verification:** each shape triggers its warning; a controlled equivalent does not.

### OBJ-5 — THE SELF-TEST *(Langston's second non-negotiable)*
*"A fail-open hook that has silently stopped running is a lookalike failure in the enforcement layer itself — the exact bug we're fixing."*
**Verification:** disable one hook deliberately → the self-test names it.
**`[r2]` AMENDED — IT MUST REPORT PER SESSION, NOT ONLY PER HOOK.** ★ **A hook can be alive in three clones and absent from a fourth, and OBJ-5 as written would not see that.** **CC-B's fifteen silent days are the case.** ✅ **The sink already exists and is unused for this: `log-instructions-loaded.mjs` writes each session's loaded set to `~/.claude/instructions-loaded.jsonl`.**
⚠️ **I proposed this as a NEW condition on 08-31 and it was already OBJ-5, written 07-30. Recorded because re-inventing an owned mechanism is the same class as re-deriving an owned decision.**

### ★★ OBJ-6 `[r2]` — `PostToolUse`, MATCHER `Bash`: SEE WHAT THE COMMAND *RETURNED*

⛔⛔ **THE GAP THIS CLOSES, AND IT IS STRUCTURAL: EVERY ONE OF OBJ-1..5 FIRES *BEFORE* A COMMAND RUNS.** They gate the **shape of a command**. **Nothing in the 07-30 design can see what a command RETURNED** — and that is where `wrong-object` is born: **the command is well-formed, it runs, it exits 0, and its output does not answer the question the claim is about.**

★★ **AND THIS EXTENDS LANGSTON'S OWN CONVERSION TEST RATHER THAN DEPARTING FROM IT.** His 07-30 correction was: *"does the violation have a TOOL-EVENT SIGNATURE?"* — **a command string is one tool-event surface; a RESULT is another.** ⇒ **the July scope applied his test only to the half of the event that existed before execution.**

**THE MEASUREMENT THAT PUTS IT FIRST** *(Kyle-directed ledger pass; **`[R1-3]` RE-MEASURED AND PINNED at `24f4b39bb`, 2026-08-31**, after a fresh reader showed the first pass reproduced only at ~HEAD~25 and **carried no ref, so it read as current and was not**)*.

✅ **BOTH FIGURES NOW COME FROM ONE POPULATION** — branch ancestry at the pinned ref. ⛔ **The first pass took 162 well-formed from branch ancestry and 166 raw only with `--all`, then subtracted across the two.** ★ *A control drawn from a different population than the measurement is not a control.*

| pattern | instances | bracket-tokens | share |
|---|---|---|---|
| ⛔ **`wrong-object`** | **80** | 26 | **46.8%** |
| `verification-weaker-than-claim` | 13 | 7 | 7.6% |
| `silence-not-evidence` | 12 | 8 | 7.0% |
| `fix-follows-pointer` | 8 | 6 | 4.7% |

**171 well-formed trailers across 44 distinct slugs. Raw `MISTAKE:` occurrences 175. Difference 4.**
⚠️ **AND THOSE 4 ARE NOT MALFORMED TRAILERS `[R1-3]`** — a fresh reader read them: they are **the trailer TEMPLATE quoted inside commit prose.** ⇒ **the "control" measured DOCUMENTATION OF THE FORMAT, not malformation. Retained as a completeness check; it is NOT a validity control.**
⚠️ **"26 bracket-tokens" IS NOT "26 BATCHES" `[R1-3]`** — the tokens include issue numbers (`#755`, `#756`, `#759`) and count `F-G`, `F-G-1`, `F-G-2` separately. **By subject-line batch-id it is ~12, with ~40 commits carrying no batch-id at all.** ★ **The defensible dispersion claim is "at least 12 distinct batches."**

★★ **ONE PATTERN IS 47% OF EVERY MISTAKE WE HAVE RECORDED — 6.2× SECOND PLACE.**

⚠️ **`[R1-5]` AND THE "MOST HEAVILY RULED" HALF IS WEAKER THAN I STATED. NARROWED, NOT DROPPED:**
- ⛔ **`CONDUCT.md` §13 has ONE filled slot against a declared "3-5".** ⇒ *"slot 1"* **is also the ONLY slot — true by VACANCY, not by ranking.** ⚠️ **`[R2-C]` I wrote that `shell-mangled-text` was "recorded PROMOTED" and omitted from §13. THE INDEX RECORDS IT AT `:242` AS "NEW 2026-08-29 · mechanism: NONE YET", AND NO PROMOTION RECORD EXISTS.** ⇒ **the premise is withdrawn: nothing was promoted-and-omitted. §13’s single slot stands on the "3-5 declared" vacancy alone, which is sufficient.**
- ⛔ **`CLAUDE.md` rule 22 forwards to the SAME `CONDUCT.md` §10**, and §10’s body carries the positive-control paragraph — which is `silence-not-evidence`’s content. ⇒ **shared coverage, counted by me as sole coverage.**
- ★★ **A STRONGER COMPETITOR EXISTS ON THE CRITERION THAT MATTERS: `bare-commit` has a rule AND A SHIPPED ENFORCING HOOK.** ⇒ **under "rule coverage" `wrong-object` may lead; under COVERAGE THAT BINDS it is the one entry with NO mechanism.**
- ⚠️ **§13’s parenthetical says "5 instances across 2 batches"; its own index holds 7 rows across 3 distinct batches** *(`[R2-D]` — I wrote "6+ batches"; **no object supports that**, and the index’s own summary at `:272` says "5+ instances across 3 distinct batches." **The staleness point survives; the magnitude does not.**)* ★ **The always-loaded list is STALE AGAINST ITS OWN INDEX** — `B-STATE-ASSERTION-LINT`’s class, sitting in the file that cites this batch.

⚠️ **`[R2-B]` AND "THE ONLY TOP-FOUR WITH NO ENFORCING MECHANISM" IS FALSE UNDER BOTH LITERAL READINGS.** By the index’s own labels: `wrong-object` **NONE YET** · `silence-not-evidence` **PARTIAL** · `verification-weaker-than-claim` ✅ · `fix-follows-pointer` ✅. **But the two ✅ entries are PROCEDURAL RULES, not enforcing mechanisms — and NONE OF THE FOUR HAS A SHIPPED HOOK.**
⇒ ✅ **THE DEFENSIBLE FORM, AND IT CARRIES THE WHOLE ARGUMENT: `wrong-object` IS THE MOST FREQUENT PATTERN BY 6.2×, AND THE ONLY TOP-FOUR ENTRY THE INDEX RECORDS AS HAVING NO MECHANISM AT ALL.** ⛔ **A fourth RULE for it would be the measured failure repeated. What it lacks is not prose.**

**⛔ THE MATCHER IS `Bash` AND NOTHING ELSE** *(Langston's cut, evidence-based)*: `Read`/`Grep`/`Glob` **do not manufacture denominators.**

⛔⛔ **`[R1-4]` BUT THE EVIDENCE I CITED FOR THAT CUT DOES NOT EXIST. I AM WITHDRAWING THE CITATION, NOT THE CUT.** I wrote *"all eight attributed instances at `MISTAKE_PATTERNS.md:264-278` were Bash."* A fresh reader went to the object:
- **The table is `:263-269` — SEVEN rows, not eight.** `:264` is instance **2**, so my range **excludes instance 1**; `:270-278` is argument prose. **Instance 8 is narrative at `:277`.** ⇒ **my citation describes neither the table nor eight instances.**
- ⚠️ **I THEN CLAIMED "THE FILE RECORDS NO TOOL ATTRIBUTION AT ALL." `[R2-A]` THAT IS ITSELF A FALSE ABSENCE CLAIM, AND A SECOND READER REFUTED IT AGAINST THE SAME OBJECT.** My stated grep returns **1 hit, not ZERO** (`:271`), and attribution **IS** present in the range: **instance 3 (`:265`) names `git log -200 --grep` verbatim**; **instance 8 (`:277`) names `/api/trades/closed` and a 404 body**; **`:274` enumerates six instruments including "a case-sensitive grep."** And **three of the four referenced commits DO name their command** — `216d57f8b`, `249875947`, `318673810`; only `0acb762d8` carries nothing.
  ⛔⛔ **SO I MADE A FALSE ABSENCE CLAIM *WHILE CORRECTING A FABRICATED MECHANISM CLAIM* — THE SAME CLASS, ONE TURN LATER, IN THE SCOPE THAT EXISTS TO FIX IT.**
  ✅ **WHAT IS ACTUALLY TRUE, NARROWED TO WHAT THE OBJECT SUPPORTS: there is NO TOOL COLUMN AND NO SYSTEMATIC ATTRIBUTION** — attribution appears incidentally, in prose, for some instances and not others. **That is why "all eight were Bash" could not be read off it.**
  ★★ **AND THE CORRECTION CUTS *TOWARD* THE MATCHER, NOT AGAINST IT: the attribution that DOES exist — `git log --grep` in instances 3-4, SQL predicates in 6-7 — points at Bash.** ⇒ **OBJ-6b is better-founded than my previous wording allowed, and it is a measurement worth running rather than a formality.**
⇒ **"All eight were Bash" was an assertion about objects that were never recorded — a fabricated mechanism, rule 29(c). WITHDRAWN.**

✅ **WHAT SURVIVES:** the instances are *consistent* with Bash — two are DB queries against columns (`opened_at`/`closed_at`, `total_fee`/`total_cost`), consistent with a Bash-wrapped `psql` **and equally with a non-Bash path**. ⛔ **So the `Bash` matcher is a HYPOTHESIS carried on Langston’s judgement, NOT on a measured population.**
⇒ ✅ **OBJ-6b `[R1-4]`: BEFORE the matcher is fixed, MEASURE THE TOOL DISTRIBUTION** — attribute a sample of `wrong-object` instances to the tool that actually produced the reading, from the transcripts. ⚠️ **If the population is not Bash, the matcher is wrong and the objective is mis-aimed. A real falsifier, not a formality.**

## ★★ `[r3]` **OBJ-6 IS FOUR OBJECTIVES, NOT ONE — AND 6c AND 6d MUST NOT SHARE A BAR** *(Langston Q1: "two is right, and I want four")*

| # | objective | it is a… | ✅ ITS OWN BAR, AND ONLY ITS OWN |
|---|---|---|---|
| **6a** | register a `Stop` hook and **OBSERVE** whether it fires | **an OBSERVATION, not a build** | ✅ **it fires or it does not — either is an answer.** ⛔ **No design may rest on it before it exists, and the batch does NOT depend on it.** |
| **6b** | measure the **TOOL DISTRIBUTION** of recorded `wrong-object` instances, from the transcripts | ⛔ **A GATE. IT RUNS FIRST AND IT CAN KILL 6c AND 6d OUTRIGHT.** | ⛔ **If the population is not predominantly `Bash`, the matcher is MIS-AIMED and 6c/6d are not built.** |
| **6c** | deterministic `PostToolUse` inspection, **warn-only** | **the affordable half** | ✅ **FIRES ON THE SHAPE, SILENT ON THE CONTROL.** No FP budget, no model call, no rate target. |
| **6d** | **agent** escalation on 6c’s survivors | **the expensive half** | ✅ **≥5 of 8 as a FLOOR (§below) AND ≤2% escalation on the clean ref-window.** |

⛔⛔ **THE SPLIT IS LOAD-BEARING, NOT BOOKKEEPING — in Langston’s form: bundled, *"OBJ-6 failed"* reads as *"result-inspection failed"* WHEN THE AFFORDABLE HALF PASSED.** ✅ **§5 falsifier 1 must be able to stop 6d and KEEP 6c.**

**★ TWO STAGES, CHEAP IN FRONT OF EXPENSIVE:** a **deterministic command hook** fires on every gated Bash result and escalates only a subset to an **agent hook**.
✅✅ **`[r3]` THE ESCALATION PREDICATE IS NOW SET — LANGSTON RULED IT AT STEP 1 RATHER THAN LET ME DEFEND A GUESS. IT IS A PRINCIPLE, NOT A SPEC:**

> ✅ **ESCALATE ON A RESULT THAT COULD NOT HAVE ANSWERED THE REQUEST — a SELF-IDENTIFYING property of the output contradicting the command that asked for it.**

⛔ **THE OUTPUT-ANOMALY ARM IS REJECTED OUTRIGHT.** A zero, a suspiciously round number, an empty result are properties of the **result alone**, with no link to any claim — **correct constantly, and therefore a banner-blindness generator.** ★ **`MISTAKE_PATTERNS:274` already settles it: four of the six instruments that failed in one day were BETTER MATCHERS than the one before.**
⛔ **AND COMMAND-SHAPE-PLUS-RESULT IS OBJ-4’S, NOT THIS ONE’S:** where the shape is visible BEFORE execution, **OBJ-4 owns it, because a pre-execution warning is strictly cheaper.**

**EVERY RECORDED INSTANCE HAS THE PROPERTY — which is what makes it a predicate rather than a preference:** `-200` capping **after** filtering, so the returned count **equals the cap** ⇒ the cap did the filtering · a query naming `total_fee` where the identity is defined from `total_cost` · instance 8’s **404 body read as a row list** · ★ **and Langston’s own live instance while reviewing this scope: `HTTP 200`, 7,968 B, `# B-GOV-HYGIENE-ANALYST-1` — a DIFFERENT BATCH’S SCOPE, caught ONLY because the H1 named it.**

**THREE BINDING CONSTRAINTS, pre-registered:**
1. ⛔ **Derivable from command + exit code + output with NO MODEL CALL.** If it needs to know what the CLAIM was, that is 6d’s job, not the predicate’s.
2. ⛔ **Tuned for RECALL, not precision.** Its measured bar is escalation **RATE** — never *"each escalation is real."*
3. ⛔ **It must NEVER fire on a value.**

**⛔ AGENT HOOK, NOT PROMPT HOOK — THE DISTINCTION IS THE WHOLE EPISTEMIC ARGUMENT.** A **prompt** hook re-reads my sentence about the object and **inherits my framing if my framing is in the transcript** — Langston's own `#675` failure. An **agent** hook *"runs an agent with tools"* and can **RE-EXECUTE THE MEASUREMENT AGAINST THE OBJECT.** ★ **Not a second reader — an independent re-derivation.**
⛔ **PRE-REGISTERED: an agent-hook verdict citing NO tool output it produced itself is INADMISSIBLE** — a prompt hook wearing an agent's clothes. **He will not approve a prompt-type hook as a verdict-carrying gate.**

**VERIFICATION — the pre-registered bars, set before any data and not to be restated looser:**

| | bar |
|---|---|
| **ship (6d)** | ✅ **`[r3]` ≥5 of the 8 known positives — AS A NECESSARY-CONDITION FLOOR AND A KILL-SWITCH, NOT A HIT RATE** · AND ≤1 false block per 50 gated Bash results (2%) |
| below 5 | **decorative — and THAT inference is sound, because the two biases are NOT symmetric: the ≤2% is measured on a CLEAN ref-window population; only the 5-of-8 sits on the dirty one** |
| ⛔⛔ above 5 | **IT HAS PROVEN ONLY THE FLOOR.** ⛔ **PRE-REGISTERED NOW, BEFORE ANY RESULT EXISTS: THE COMPLETION REPORT MAY NOT SAY "CATCHES N% OF `wrong-object`" — that inference is NOT AVAILABLE from a set selected on *noticed*, whatever the number turns out to be.** |
| ✅ **`[r3]` the free un-biasing, and therefore NOT optional** | **ADJUDICATE THE REF-WINDOW SAMPLE IN BOTH DIRECTIONS.** That window is already being run for the FP bar. **Any escalation in it that turns out to be a REAL `wrong-object` nobody trailered is a positive the trailer set COULD NOT CONTAIN BY CONSTRUCTION.** ★ **Same window, same cost — and it is the ONLY instrument in this batch that reaches the unnoticed arm at all.** |
| above 2% | ⛔ **bypassed inside a week — which is how `#756` died** |
| **first arm** | ✅ **WARN-ONLY** (`additionalContext`, no block). Live FP measured over a fixed window **before anything returns `decision:"block"`.** ★ *A gate that blocks on day one has an FP anecdote, not an FP rate.* |
| ⚠️ **negative arm** | **The 8 known positives were chosen BY LOOKING AT THE DATA — `control-enumerates-the-observed` by construction.** ⇒ **sample the negative arm BY REF-WINDOW**, independently of whether anything was later corrected. |

---

## ✅ `[r6]` **OBJ-6c BUILT — AND THE OBSERVED `PostToolUse` SHAPE CORRECTS THIS SCOPE'S OWN WORDING**

**Two stages, per this scope's new-event rule.** Stage 1 `observe-posttooluse.mjs` recorded the live payload on 2026-09-02 (it registered by hot-reload, no restart): `tool_input.{command,description}` and **`tool_response.{stdout, stderr, interrupted, isImage, noOutputExpected}`** plus `tool_use_id`, `duration_ms`, `agent_id`/`agent_type` when a subagent ran it. ⛔ **THERE IS NO EXIT CODE ON THE WIRE.** Constraint 1 above reads *"derivable from command + exit code + output"*; **the harness hands over no exit code, so the predicate is derived from command + stdout + stderr and nothing here may depend on one.** The constraint's intent (no model call, no claim) is unchanged.

**Stage 2 `guard-result-shape.mjs` — warn-only, `additionalContext`, exit 0 on every path. Four legs, each named for the recorded instance it is built from, each needing BOTH a property of the command AND a property of the output (constraint 3 — never on a value):**
| leg | command property | output property | instance |
|---|---|---|---|
| `cap-bound` | carries a numeric cap ≥ 5 (`head -N`, `tail -N`, `git log -N`, `grep -m N`, `LIMIT N`, `--limit N`) | has EXACTLY N lines | 3 (`-200` read as "of the last 200") |
| `error-consumed` | pipes into a consumer (`wc`, `grep -c`, `jq`, `python`, `sort`…) — or stdout's last line is a bare integer | stderr carries a hard error signature (`fatal:`, `No such file`, `Traceback`, `404`, `ECONNREFUSED`…) | 8 / `#732` ("0 breaches of 0 rows" from an endpoint that never answered) |
| `html-not-json` | asks an API (`curl`/`wget` to `/api/`, or piped to `jq`) | body is HTML | 8 |
| `other-document` | fetches/shows a path whose name carries a batch id | the H1 names a DIFFERENT batch | Langston's live instance (HTTP 200, `# B-GOV-HYGIENE-ANALYST-1`) |

⛔⛔ **`[r8]` THE r1 TABLE ABOVE WAS REFUTED BY A 75,739-RESULT REPLAY (fresh reader, same day) AND THE GUARD WAS REWRITTEN. THREE FINDINGS, ALL LOAD-BEARING:**
1. **STDERR IS STRUCTURALLY EMPTY ON THIS WIRE.** 4,359 non-empty stderrs in 75,739 real results — every one the harness's own *"Shell cwd was reset"* notice; **zero** matched an error signature, while stdout carried 2,231 (46 `fatal:` from `git show`, an `index.lock` failure with no `2>&1`). **The harness merges the child's stderr into stdout.** r1's `error-consumed` keyed on stderr and had **zero reachable inputs** — it fired 0 times in the replay and could never fire live. **Every leg now reads stdout** (stderr is joined in first, so a future harness that separates them loses nothing).
2. **`cap-bound` COMPARED THE CAP AGAINST THE WHOLE COMMAND'S OUTPUT.** 65 % of its 3,460 replayed fires were on multi-stage commands, where it INVERTS: `echo hdr; grep | head -20` with 22 lines was silent (genuine truncation) and with 20 total lines fired (head returned 19). **Both `cap-bound` and `other-document` now apply only to a SINGLE PIPELINE** (leading `cd`/`export` allowed) — the only case where the harness's stdout is the pipeline's. Honest wording landed: *"the cap MAY have done the filtering — the count is not evidence either way."*
3. **`other-document` HAD 7 REPLAYED FIRES, ALL FALSE**: the first `#` in a two-file command belonged to the other file; renamed batches (`# F-G-1 — B-GRID-REPRESENTABILITY` for `B_EXIT_GRID_…`); sub-batch scopes. Now single-pipeline only, H1 within 20 lines, and it fires only when the H1's batch id and the path's share **no word** — Langston's instance (`B-GOV-HYGIENE-ANALYST-1` for `B_MEASURE_GATE`) still fires; every one of the 7 false ones is silent.
⛔ **AND INSTANCE 8 AS IT ACTUALLY OCCURRED IS NOT CAUGHT.** The reader found the real `#732` command: the 404 body was JSON `{"error":"Not Found"}`, python parsed it cleanly and printed *"0 of 0 closed"* — no signature, no HTML, no traceback, nothing in the output identifies it. **Pinned in the suite as a KNOWN-GAP control so nobody claims it; it is 6d's job (re-execute against the object), not a shape's.** The error leg is renamed `error-counted` (signature on stdout + bare-integer last line + a counting stage in the command — 88 such results in the replay) and no longer claims instance 8.
**Replayed live rate, r1 legs on 75,739 results: cap-bound 4.6 % (tail-N overflows ~10/day — that IS the predicate), other-document 7 (all false), html-not-json 1, error-consumed 0.**

⛔⛔ **`[r9]` THE r2 REPLAY (object round, 75,759 results) CONTRADICTED THREE MORE CLAIMS AND PRODUCED r3.** r2 fired **1,516 = 2.00 %**: cap-bound 1,455 · error-counted 60 · html-not-json 1 · other-document **0**. But:
1. **Every one of the 4,359 real cwd notices begins with a NEWLINE** (`"\nShell cwd was reset to …"`), so r2's `^Shell cwd` exclusion matched **0 of 4,359** and the notice was joined into stdout as two lines — **85 cap-bound fires existed only because of the join (cap−2 outputs padded to cap) and 241 genuine exact-cap results were silenced (pushed to cap+2).** The suite's control tested a notice shape that never occurs. r3 strips the notice wherever it sits; the suite uses the real shape.
2. **`error-counted` fired 60 times, 0 of them on a single pipeline.** In 26 of 41 distinct commands the "counter" it matched was `python3` — the program that THREW the traceback; the trailing integers were max issue numbers from `sort -n | tail -1`, a git file mode (`100644`), or a later stage's `grep -c`; four "signatures" were issue **#404** in governance text. **It was firing on error-anywhere + integer-anywhere + python-anywhere: a value leg.** r3: single pipeline only, the LAST stage must be a real counter (`wc`, `grep -c`, `uniq -c`, `jq length`), `python`/`sort`/`awk` dropped, `404` only in its HTTP form.
3. **The pipeline split was quote-blind**: `psql -c "select 1; select 2 LIMIT 20"` read as two stages. Of 27,011 cap-carrying results, 6,433 "multi-stage" ones become single when quotes are honoured — 6,139 are `ssh`/`sh -c` wrappers (defensibly multi-stage remotely), **298 are not, and 65 of those had exactly cap lines — 65 missed fires.** r3: quote-aware split; a wrapper (`ssh host '…'`, `sh -c '…'`) is single only if its quoted payload is single.
4. A cap on the heredoc's own start line (`cat <<'EOF' | head -20`) was swallowed (9 commands, 0 would have fired) — fixed, and the fix's own defect (the retained `<<TAG` re-matched the unterminated pass and elided every later stage) was found by a mutation arm before it shipped.
**The 15-fire random sample of cap-bound: 10 were `tail -N` of the alerts log or a long doc — genuine overflows *by knowledge of the files*, 5 were `grep | head -N` — undecidable from the object. The guard cannot tell them apart and neither can a reader; that is why the wording says MAY.** ★ **439 of the 1,455 cap-bound fires (30 %) were the §10.5 `tail -N` alert read — the exact read `#980` measured as seeing 4 of 11 due alerts; the leg fires on it every time, which is the predicate, and the OBJ-1 injector has already replaced that read.**
**Suite r3: 71/71, nineteen mutation arms.**
✅ **`[r10]` ROUND 3 OF 3 — THE r3 REPLAY (75,819 results): 2,274 fires = 3.00 % — cap-bound 2,273 · html-not-json 1 (true) · error-counted 0 · other-document 0.** All 65 quote-silenced exact-cap results now fire; the notice fix gained 255 and lost exactly the 85 spurious ones; every one of the 4,359 real stderr values reduces to empty after the strip. **One contradiction left and fixed as r4:** a wrapper with trailing text after its closing quote (`2>&1`, `| tail -N`) escaped the payload recursion — 8,091 of 15,293 real wrapper stages have such text, and **40 fires were on an inner cap of a multi-stage remote payload**; the regex now spans trailing redirections and a final head/tail, the payload must still be single, and three arms pin it (**76/76, twenty-one mutations**). **Stated limits:** `error-counted` has ZERO real fires — a leg proven only on fixtures; the split is escape-blind (`\"`), silence-direction only, 123 exact-cap results; pm2 `--lines N` cannot fire exact-N and is not a cap. **Rounds on 6c are closed at Kyle's cap of three, ending on this object round.**

**Proof before wiring (#761), r1:** `test-guard-result-shape.mjs` **28/28** — every positive arm has a paired control differing in the ONE property the leg keys on; **seven mutation arms** (drop the cap floor, drop the heredoc elision, fire on the error alone, drop the API condition, drop the H1 comparison, emit a permission decision, exit 2) each fail the suite. ★ The permission-decision arm caught a check that could not fail — the invariant read the extracted string, not the raw output — which is the convention doing its job.
✅ **DELIVERY MEASURED LIVE, from the SHIPPED hook:** the first triggering command after wiring (`seq 1 20 | head -20`) returned the `cap-bound` warning in the tool result; the sink row is `synthetic:false`, `project_dir` this clone, **`hook_sha d684cdf99df0` = the file's own CRLF-normalised hash.** That is the Step-7 condition, satisfied for 6c on day one.
⛔ **KNOWN GAPS, in the hook header in those words:** an error swallowed by `2>&1` INTO the consumer leaves no stderr and a plausible number; a 404 body that parses as an empty list without a traceback; `interrupted` results are skipped as undecided; only the first and last 64 KB of stdout are inspected. **Its silence is non-evidential.** ★ **Instrument-agnostic by construction — the legs key on result-vs-request, never on which tool produced the error — as OBJ-6b's vacated split requires.**

## 📐 `[r7]` **OBJ-6d STAGE 1 — THE AGENT HOOK OBSERVED, NOT DESIGNED. MEASURED 2026-09-02, TWO PROBES.**

**What the docs say:** `type: "agent"` exists (`prompt`, `timeout` default 60 s, up to 50 tool turns, returns only `ok`/`reason`); **its support on `PostToolUse` is NOT documented** (the only example is `Stop`), no `model` field, no documented way for a command hook to gate an agent hook. *(`code.claude.com/docs/en/hooks-guide`, §Agent-based hooks.)*
**What is measured** (an agent hook registered on `PostToolUse`, matcher `Bash`, **`if: "Bash(echo AGENT-HOOK-PROBE*)"`**, fired by a deliberate probe command):
| property | measured |
|---|---|
| fires on `PostToolUse` at all | ✅ **yes, twice** — undocumented, now observed |
| the `if` argument-gate holds | ⛔ **NO — CORRECTED 20 minutes after this row was first written.** The hook fired on `node scripts/measure-gate/test-guard-result-shape.mjs …`, a command that does not begin with the probe text, and ran its full RULE 2 (reported that command's `stdout_bytes=596`). The earlier "plain command 2.5 s vs 1.3 s baseline" was consistent with the agent answering `ok:true` on every call, not with a gate — and I read it as a gate. ⇒ **the agent hook runs on EVERY Bash call; the only thing that kept it quiet was the prompt's recursion-breaker, i.e. the agent's own judgment, which failed once in three.** **The probe was REMOVED from settings the same minute** — an agent hook whose subagent runs Bash fires PostToolUse hooks of its own, and with the gate not holding the recursion bound was a model's discretion. |
| its `reason` reaches the turn | ✅ delivered as *"PostToolUse:Bash hook blocking error … Agent hook condition was not met: <reason>"*; **the turn continues** (this scope edit is being made in that turn) |
| receives `tool_response` | ✅ `has_tool_response=true`, `stdout_bytes` reported |
| tools it can use | **Read ✅ · Grep ✅ · Bash ✅** (`true` permitted on r2; a `printf >> ~/.claude/…` redirect was **DENIED** on r1 — *"permission denied in don't ask mode"*) · **Write ❌ DENIED** |
| cost per fire | **10–40 s wall-clock, one subagent**, synchronous |

★★ **WHAT THIS SETTLES FOR THE DESIGN:** the epistemic requirement holds — **the agent CAN re-execute a read-only measurement against the object** (git show, grep, a read query) and its verdict is admissible under the pre-registration (it cites tool output it produced). **Its record cannot be a file it writes**; the verdict IS the `reason`, which is delivered.
⛔ **WHAT IT DOES NOT SETTLE, AND IS THE DESIGN QUESTION FOR LANGSTON:** **no mechanism gates an agent hook on 6c's VERDICT — and, measured above, not even on the command's arguments.** Hooks in one event run in parallel, so a command hook cannot precede and gate an agent hook; the `if` field did not hold. An agent hook on every Bash result costs a subagent per call and bounds recursion by the agent's judgment — unaffordable and unsafe, and the ≤2 % escalation bar is about noise, not cost. **Two candidate shapes, neither pre-approved:** (A) an agent hook on **`Stop`** — once per turn, reads the 6c sink for this turn's survivors, re-derives only those, `ok:false` with the re-derivation when a survivor is real (cost: one subagent per turn, ~10 s when there are no survivors; its subagent's own tool calls do not re-enter `Stop`); (B) **the 6c command hook itself spawns a headless `claude -p` with tools, in the background, ONLY when it fires** — zero cost on clean calls, deterministic gate, verdict written to a file the OBJ-1 injector surfaces on the next prompt (asynchronous; not a hook-type agent, but the same independent re-derivation and the verdict cites its own tool output). ★ **My recommendation is (B): it is the only shape whose gate is deterministic and whose cost is zero on the 95 % of calls 6c never fires on.** **Dispatched as a design ask, not built.**

## ✅ `[r12]` **OBJ-3's EARLIER-TURN MSGFILE LIMIT — MEASURED ON LANGSTON'S CONDITION: THE LIMIT IS FREE**

**His condition:** *"Do not close it on an unmeasured denominator"* — of the real completion-report closes, how many read a msgfile whose name had been written in an EARLIER turn. **And the word "undecidable" was struck: the comparator is this turn's start, read from the transcript the payload names.**
**Population (fresh reader, 2,870 transcripts, entries deduplicated by uuid — 194,932 duplicates from backup copies and compaction re-appends):** 3,977 commit commands; **53 closes name a `COMPLETION_REPORT` on the commit stage** (58 before dedup — the prior readers' figure, reconciled). Message source for the 58: 24 same-command write · 16 `-F $var` · 8 inline `-m` · 6 `-F -` · **4 pre-existing file**.
| population | (a) same turn | (b) earlier turn | (c) no visible write |
|---|---|---|---|
| the 4 closes reading a pre-existing file | **4** (write→commit 0.1–0.2 min) | **0** | 0 |
| every pre-existing-file `-F` commit since 07-23 (93) | 92 | 1 | 0 |
| all-time, dedup (115) + backup copies for the trimmed pre-07-23 window | 114 | 3 | 0 |
**The one post-07-23 (b) was not a stale read — the file did not exist**: the write+commit+push command was refused whole by the tsc-baseline push guard (fail-closed, ETIMEDOUT), so the write never ran; 508 min later the commit failed exit 128 *"could not read log file"*. Of the two pre-07-23 (b)s, one is a genuine 5.5-min earlier-turn read (`/tmp/cmsg40.txt`, not a completion report, name written once) and one is a Write-tool file committed 7.5 min later across four **task-notification** entries — a real turn under a Kyle-turn reading. **Name reuse across turns: 13 of 93, and in every one the most recent write was in the commit's own turn.**
✅ **Zero of the 58 closes; zero reused-name stale reads anywhere; the limit is free and is stated as free, with this denominator.** *(Reach: writes by python, by `Write` under another path form, or from another session are invisible — none surfaced.)*
**What the measurement changed in the guard:** a harness task-notification is stored as a *user text* entry; read as a turn boundary it would have called that 7.5-min Write-tool file stale. The comparator now skips `<task-notification>` / `[SYSTEM NOTIFICATION` / `<system-reminder>` entries — one arm, one mutation.

## ⛔ `[r11]` **OBJ-6d CLOSED "OBSERVED, NOT BUILT" — BARS UNMET AND STATED. LANGSTON REFUSED BOTH GATED SHAPES ON PRINCIPLE, AND THE REFUSAL IS CORRECT.**

**His ruling (2026-09-02, verbatim in substance):** both (A) and (B) gate 6d on 6c's fire — and this scope's own header states gap (1): instance 8 as it occurred, the JSON 404 body parsed cleanly to *"0 of 0 closed"*, **produces no shape**. So both shapes gate 6d on a signal that is **blind by construction to 6d's motivating case** — *"a wiring defect, not a tuning one, and it survives any rate you tune to."* (B) has a second defect: gated on 6c it spawns ~10 headless tool-bearing model calls a day, nearly all `cap-bound`, whose re-derivation is *re-run it unbounded* against `ssh`/`psql`/`gh api` payloads bounded by the spawned model's judgment — **the exact bound that failed one in three in the stage-1 probe.**
**What he would accept:** (A)'s *event* with a different *source* — the `Stop` boundary, gated deterministically on **the turn's final message carrying a load-bearing number**, re-deriving *that* against the object. This scope's own line was *"if it needs the CLAIM, that is 6d"*; both proposals sourced it from the RESULT instead.
✅ **DISPOSITION — §9.4 #3, own batch, placed:** the claim-sourced design is a different build from the one this scope pre-registered (its bars — ≥5 of 8 known positives, ≤2 % escalation on the clean ref-window — were written for result-inspection and are **unmet and stated so**). It does not fold into a batch that is already at its third design revision on 6c. **`HOME: B-CLAIM-REDERIVE (#981), owner CC-A, placed in PHASE_19_PLAN at row 6.6, after B-MEASURE-GATE leg 3 (which is #623's own next leg).`**
**What 6d leaves behind, all measured and none wasted:** an agent-type hook fires on `PostToolUse` (undocumented); its `reason` is delivered non-fatally; it can Read/Grep/Bash but not Write; the `if` argument gate does not hold for agent hooks; a subagent's own Bash calls re-enter `PostToolUse`. **Every one of those is a design input for `B-CLAIM-REDERIVE`, and the `Stop` event is the one that avoids the last.**

## ⛔⛔ `[r4]` **THE SELF-REFERENCE HAZARD — A SHAPE-MATCHER FIRES ON TEXT *ABOUT* ITS TRIGGER, NOT ONLY ON *USE* OF IT.** *(§9.4 disposition 1 — folded into the work in hand)*

★★ **DISCOVERED BY ACCIDENT, LIVE, AND IT COULD NOT HAVE BEEN STAGED BETTER: THE HOOK BLOCKED THE POST THAT WAS WARNING THE OTHER SESSIONS ABOUT THE HOOK.** OBJ-0’s notice named the probe’s sentinel strings so the crew would know what to avoid; `probe-warn-delivery.mjs` matches `cmd.includes(sentinel)` against the **whole command string**, the heredoc carrying the notice contained them, and the blocking arm refused the command.

⛔⛔ **THE GENERALISATION IS THE POINT, AND IT LANDS DIRECTLY ON OBJ-4 AND OBJ-6c: THEY SCAN COMMAND STRINGS FOR BAD MEASUREMENT SHAPES, SO BY CONSTRUCTION THEY FIRE ON A SESSION WRITING A SCOPE, A REVIEW, A MISTAKE RECORD OR A COMPLETION REPORT THAT *QUOTES* A BAD MEASUREMENT SHAPE.**
★ **That is not a rare edge: it is what this project does constantly, in this batch, in these documents, in the commit messages that record the very instances the matcher is built from.** `MISTAKE_PATTERNS.md` is a file whose PURPOSE is to quote bad measurement shapes.
⇒ **A GUARD AGAINST WRONG MEASUREMENT THAT FIRES ON DOCUMENTATION *ABOUT* WRONG MEASUREMENT IS A BANNER-BLINDNESS GENERATOR** — exactly the outcome Langston rejected the output-anomaly arm to avoid, arriving by a different route.

### ✅ WHAT IT CHANGES, and none of it is a new objective

**1. IT IS A SECOND, INDEPENDENT ARGUMENT FOR WARN-ONLY — AND A BETTER ONE THAN MINE.** My case was *"the channel does not require blocking."* **This is: had it warned, I would have read it and moved on; because it BLOCKED, it cost a round trip — on my own hook, on the message warning others about that hook.** ★ **A false positive on a warn-only hook is noise. The same false positive on a blocking hook is a wedge.**

**2. THE PREDICATE NEEDS A USE-vs-MENTION LEG, AND IT IS PARTLY DETECTABLE WITHOUT A MODEL.** The distinguishing features are on the wire in the command string:
| signal | detectable? |
|---|---|
| the match sits inside a **heredoc body** (`<<` delimiter opened, not yet closed) | ✅ **yes — delimiters are literal text in the command** |
| the match sits inside a **quoted string being written to a file** (`cat >`, `tee`, a `-F <msgfile>` payload) | ✅ **mostly — the redirection operator is on the wire** |
| the match is in a **path or a filename** rather than an executed clause | ✅ yes |
| the command is *genuinely* running the bad shape | ⚠️ **the residual — and it is the case the objective exists for** |

⚠️ **STATED HONESTLY: THIS IS A HEURISTIC ON TOP OF A HEURISTIC AND IT WILL BE IMPERFECT.** A heredoc can contain a command that is then executed elsewhere. ✅ **But it is cheap, it is derivable from the command string alone with NO MODEL CALL, and it removes the single most common false-positive source in a corpus that documents its own mistakes for a living.**

**3. IT IS PRE-REGISTERED AS AN FP CATEGORY BEFORE ANY WINDOW IS MEASURED.** ⛔ **A self-referential fire counts as a FALSE POSITIVE against the ≤2% bar** — it may not be excused post hoc as *"not a real case"*. ★ **Writing this down before the measurement is the whole point; discovering it afterwards is how a bar gets renegotiated into a pass.**

---

## 3. EXPLICITLY OUT OF SCOPE

- **Leg 3** (collapsing rule text to pointers) — separate batch, **per-rule gated on that rule's hook having been OBSERVED firing.** Langston: *"converting rules to mechanisms before the mechanisms are trusted loses both."*
- **Judgement rules — NOT convertible:** rule 24's three outcomes · §9.5(b) provenance · rule 15 · §2 plain-language · rules 27/28. **A hook cannot rule on intent.**
- **Anything that BLOCKS on a content judgement.** Blocking is reserved for the narrow command-shape class (rule 22's precedent).
- **`[r2]` CONSENSUS STALENESS.** ⛔ **Every leg here — old and new — fires at WRITE TIME on a SINGLE ARTIFACT. A copy that was right when written and is wrong now is structurally unreachable by all of it.** ⇒ **`B-STATE-ASSERTION-LINT`, its own batch, after these hooks and before leg 3.**
  ⛔⛔ **`[R2-E]` AND A SECOND READER CAUGHT THAT IT WAS *NAMED, NOT PLACED* — §9.4’S OWN FAILURE, COMMITTED BY ME TODAY WHILE CITING §9.4 REPEATEDLY.** It existed only in `MECHANISM_INTEGRATION_PLAN.md` and in this scope: **no issue number, no owner, and ABSENT from the `PHASE_19_PLAN.md` governance queue** — the one list anyone reads to see what happens next. ✅ **FIXED in the same commit: minted and placed at queue row 6.5.**
- **`[r2]` THE IMPACT LOOKUP.** Langston ruled it **not a batch** but a **scope-bar amendment**: *a scope's blast-radius statement must quote the reference query and its result, not prose.* **Folded into work in hand.** ⚠️ **Its reach limit ships with it: a reference set is PRESENCE evidence and CANNOT make an absence claim — it does not cross dynamic dispatch, a string-keyed lookup, a SQL column name, a DB row or a config key, which is exactly §9.5(a-ii)'s hole. It sits BESIDE the state-write census, never replacing it.**

---

## 4. RISK — stated plainly

**The failure mode this batch can itself cause, and Langston named it in another context: a mechanised WRONG rule is worse than prose, because it is authoritative.** Mitigation: **warn-only for everything except the narrow command-shape class.**
**Second risk — banner-blindness.** Langston: *"fire it too often and it goes banner-blind, which is worse than nothing."* ⇒ **OBJ-4 and OBJ-6 warnings must be specific and rare; if any fires on routine correct work, it is wrong.**
**`[r2]` Third risk — cost.** A hook on every Bash result is **turned off inside a week** if the escalation predicate is not cheap. **That is `#756`'s death, repeated.**

---

## 5. `[r2]` WHAT WOULD FALSIFY OBJ-6

1. **If the escalation predicate cannot be made cheap**, this is `#756` again. **Say so and stop.**
2. **If the agent hook cannot cite its own tool output**, it is a prompt hook, and Langston has already refused that as a gate.
3. ⚠️ **Grounding checks REDUCE this class; they do not eliminate it** — a model can still misread what it genuinely retrieved. **This is a large dent in 48%, not a solve, and it is sized that way going in.**
4. ⛔ **THE KNOWN-POSITIVE SET HAS THE SAME DEFECT AS THE NEGATIVE ARM, AND I AM RAISING IT AGAINST MY OWN BAR:** the 8 are the errors that **got trailered** — which selects for errors somebody *noticed*. **The ones nobody noticed are absent by construction.** ⇒ **"5 of 8" is a bar over a biased population.** *(Open for Langston: fatal, or the best available?)*
