# The eleven-step workflow: preliminary review (PM Claude, 2026-11-19)

Status: PRELIMINARY r2 (Coltrane's advisory review at `aa14c2114`, 2026-11-18 23:21Z, folded in; every point accepted), for Kyle. Nothing changes until Kyle agrees; any change then runs as its own batch.

## The ask (Kyle, 2026-11-18)
Review the eleven-step workflow, designed months ago, against today's models and tools. Recommend a change only if it meaningfully improves completeness, correctness, accuracy or speed. That covers:
- capturing a batch's intent and proving it is met at close;
- audits and scopes that cover every part of the system the batch touches, so the build is correct and breaks nothing else.

If the workflow is good enough, say so.

## What was read
- **The twelve step skills** at `origin/migration/aws-supabase`: 166 KB in all, with step 10 alone at 52 KB. PM read steps 1 and 2 in full; a helper summarised 3-11 and hotfix.
- **74 completion reports** first added 2026-09-01 to 11-16, plus the first-commit dates of 73 scope files. A helper read them. Its counts are line matches over report text: indicative, not tallied findings.
- **The test footprint at the ref:** 453 test files against 671 server source files. 604 of the 704 server commits since 09-01 touched a test file.
- **Current Anthropic guidance:** the Claude Code best-practices page, read 11-18.

## Verdict in one line
The backbone is sound and should stay. Four gaps are worth fixing:
- batches close with their intent unproven;
- the impact census is done by hand;
- the closing paperwork is written three or four times;
- the second verification has no defined method.

(Withdrawn in r2: "most of the time is waiting" and "step count is not the bottleneck". Time per step is unmeasured.)

## What the evidence shows
- **Elapsed time.** Median 33 hours from scope to close (n=73). 44 batches closed in 3 days or less; 20 took more than a week. Some of the long tail is batches scoped long before they were slotted, or observation windows. Time per step is not recorded.
- **The gates catch real problems.**
  - Langston sent back or re-rounded Step 1 in 24 of 74 reports, and Step 4 in 18.
  - Step 8 caught wrong Step-7 statements (B_BOOK_STATE_RESTART_DURABLE).
- **Intent is often closed unproven.** 29 of 74 reports close objectives as PARTIAL, UNEXERCISED or "not seen live". Examples: B_ENTRY_DISTANCE_GUARD, whose refusal "has never fired live"; B_CRYPTO_FEED_WATCHDOG, with four objectives PARTIAL. This is report-level line matching, not a count of scoped objectives, so it shows the gap exists, not its size.
- **The escaped defects found are coverage misses of a recognisable shape:**
  - a second code path: #903, a field added to the main return but not the empty-window return;
  - code and database disagreeing on allowed values: #1063, with 22,368 failed inserts over 13 days;
  - a consumer reading a value to mean something else: #1160, where `active` meant "any engine" to the server and "this mode's engine" to the page;
  - a failed read treated as an empty answer: #691/#1211.
- **Close-out paperwork.** The ~30-row governance ledger is written in the session, the commit message and the report, and step 4's header lists the documents a fourth time. Report median is ~10.5 KB.
- **Tests are routine:** 604 of 704 server commits touch a test. That shows activity, not adequacy.

## Recommendations

**R0. One traceability ledger per batch, the spine the rest hang on.** (Intent, completeness.)
- **One machine-readable file per batch, filled in as the batch goes:** objective → original intent → affected components, entry points and readers → plan item → diff and tests → Step-7 proof → Step-8 challenge → final status.
- **R1-R3 write into it** instead of each adding its own table, so scope, audit and close cannot drift apart.
- **It records the census and proof tool versions and outputs at the graded ref,** so a later reviewer can reproduce what "complete" meant.

**R1. A discriminating proof record per objective, and an honest residual status.** (Intent, correctness.)
- **Fix the existing contradiction first.** Step 9 ends only when every objective is green, but Step 11 allows NO / PARTIAL.
- **At Step 1, each objective records in R0:**
  - what is observed;
  - the population;
  - the instrument;
  - the expected result;
  - a positive and a negative control;
  - the evidence class needed: static, unit, integration, staging or live-only;
  - a safe forcing method for rare events;
  - the change that would turn it red.
- **Forcing is done only through a safe deterministic harness or injection.** The proof rule never justifies polluting staging or unsafe state.
- **Success criteria are fixed before results are seen.** They change only by a recorded, reviewed amendment, so "done" cannot be redefined after the evidence.
- **CLOSED-UNPROVEN is an explicit residual, never counted as done.** It needs an owner, a placed home, a closing condition, a failure condition, and an alert that opens the follow-up when the event occurs. An armed alert is not proof.
- **Classify the 29 before using them as a baseline:** scoped objective, observation leg, new finding, or honest residual.

**R2. A supporting census script, with its limits stated.** (Completeness, correctness.) The strongest change.
- **What it is and is not (Kyle, 2026-11-19).** It is a script that searches and lists. It does no reasoning, and it replaces nothing. The code read, the runtime and database read, the System Impact Map, the System Manual, the ledger search and the provenance read all stay mandatory and unchanged. It hands the session a list of places to check and cross-checks the hand census. The session does the thinking.
- **It builds on the code-search tool we already have; it does not replace it (provenance, 2026-11-19).**
  - B-INSTRUMENTS-OVER-RULES (CC-A, closed 10-02) installed a language-server code search, `dt-typescript-lsp`. It answers "who calls this" from the compiler's own symbol graph: 65 exact references where text search gave 25 files, 15 of them prose (`SEARCH_SURFACES.md`).
  - After the #1038 load fix (09-11) it works. Its pre-registered usage test still FAILED: zero calls by CC-B, CC-C and Infra over 14-day windows (`B_INSTRUMENTS_OVER_RULES_USAGE_MEASURE.md`).
  - No step skill tells a session to use it. The lesson: a tool that is not written into the step is not used.
  - So the census uses the language server for code references and adds only what it cannot see: schedulers, timers and start paths, database readers, and systemd, cron and PM2 starts. Step 2 then names the tools, and R0 records their output.
- **Out of scope here:** search over governance prose (1,944 documents). `SEARCH_SURFACES.md` calls it "the real gap" and deliberately left it open: the misses there were paraphrase, not matching. It stays open.
- **When it runs.** Step 2, alongside the hand census. Optionally a quick run at Step 1 to help bound the scope.
- **Its output is a lead, never a verdict.** A hit is a place to read. A clean result is never evidence that nothing else is affected, the same standing as a clean helper result. Where it disagrees with the System Impact Map, the gap is a finding: either the map is stale or the script missed something.
- **Its limits are investigated before it is used.** The pilot on closed batches measures what it finds, what it misses and what the hand audit missed. It produces a written list of blind spots, and the reliance written into the Step 2 skill is set from that list, not assumed. No batch depends on it until then.
- **At Step 2, a script lists for each changed symbol, table or column:** type-aware references; schedulers, timers and start paths repo-wide; and database readers.
- **It never claims "every" reader.** It labels what it found apart from surfaces it cannot see:
  - dynamic dispatch;
  - string-built SQL;
  - stored routines, triggers and views;
  - shell, systemd, cron and PM2 starts;
  - config-driven paths;
  - external consumers.

  It states the population searched and carries positive controls.
- **The reader table in R0:** reader · path · assumed meaning · missing, error and stale handling (the #691/#1211 class) · concurrency or mutual-exclusion assumption · still true after the change?
- **A CI check compares code and database allowed values in both directions.** It covers named shared contracts only, with intentionally historical values listed.
- **The tool must be proven before it becomes a gate.** Replay or seed the #903, #1063, #1160 and #691 cases and mutate each until the check goes red. Until then, "would have caught them" is a hypothesis.
- **Helpers may shard a large census.** The workflow names no model, and helper agreement is never evidence.

**R3. Generate the close-out once; keep Steps 10 and 11 separate.** (Speed, accuracy.)
- **One durable machine-readable governance artifact,** rendered into the session post, the commit and the report instead of retyped.
- **It is generated from more than the diff:** the declared class, the Step-2 census, R0, and the base-to-deployed tree diff. An omitted update leaves no diff, so a diff alone misses it.
- **Every judged or N/A row keeps its reason.**
- **Steps 10 and 11 stay separate.** Step 10 does the governance work; Step 11 attests the finished result. One close-out skill may hold both as ordered phases with one final review, but the evidence shows retyping, not that merging the gates helps.

**R4. Step 8 becomes two-legged.** (Accuracy.) For each load-bearing objective:
1. **Reproduce Step 7's result** with the same instrument and population, which keeps the comparison valid.
2. **Run an orthogonal challenge** aimed at wrong-object, alternate-path or failure-state risk, and state what would turn it red.

The reviewer tries to falsify the proof. If either leg cannot be done, the objective stays unproven.

**Also:**
- **Tests:** each load-bearing objective maps to named tests in R0, with one representative red mutant each.
- **Hotfix:** keeps its structure and inherits the proof record and census in proportion. It is the highest-pressure path and should not sit outside the safeguards.
- **Strip repetition from the skills:** 11 preserved-verbatim blocks, 11 board blocks and four full fresh-reader blocks. The common rules go into one always-loaded contract, and the historical text is archived.
- **Withdrawn:** moving all reading from Step 1 to Step 2. Intent and a credible boundary need architecture and provenance. Step 1 keeps targeted reading to bound the object; Step 2 owns the exhaustive census and extends the same R0 file.

## What should NOT change
- Independent code review at the graded ref (Step 4), and the CI 4/4 gate (Step 5).
- `dt-deploy` and its guards (Step 6).
- The provenance read, and the audit-before-plan ordering.
- UI-navigated verification in Step 7: live checks and tests are complementary.
- The hotfix qualifying test.

## How to proceed
- **One workflow-improvement batch,** carrying R0-R4 as tightened above.
- **Pilot first.** Run the census tool and the generated ledger on several closed batches, including the four named escapes, before either becomes a mandatory gate.

## Not established
- **Time per step.** Reports rarely timestamp steps, so where the 33-hour median goes inside a batch is unmeasured.
- **How many escaped defects trace to scope or audit misses.** No report records what review missed. R0 should carry one line, "missed earlier, found at step N", so this becomes measurable.
- **The value of the System Impact Map as maintained.** Not tested here.
