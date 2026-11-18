# The eleven-step workflow: preliminary review (PM Claude, 2026-11-19)

Status: PRELIMINARY, for Kyle and for Coltrane's review. Nothing changes until Kyle agrees; any change then runs as its own batch.

## The ask (Kyle, 2026-11-18)
Review the eleven-step workflow, designed months ago, against today's models and tools. Recommend a change only if it meaningfully improves completeness, correctness, accuracy or speed. That includes catching a batch's intent and proving it is met at close, and audits and scopes that cover every part of the system the batch touches, so the build is correct and breaks nothing else. If the workflow is good enough, say so.

## What was read
- The twelve step skills at `origin/migration/aws-supabase` (166 KB in all; step 10 alone is 52 KB). PM read steps 1 and 2 in full, and a helper summarised 3-11 and hotfix.
- 74 completion reports first added 2026-09-01 to 11-16, plus the scope files' first-commit dates (73 of them). A helper read them. Its counts are line matches over report text, so they are indicative, not tallied findings.
- The test footprint at the ref: 453 test files against 671 server source files. 604 of the 704 server commits since 09-01 touched a test file.
- Current Anthropic guidance (Claude Code best-practices page, read 11-18).

## Verdict in one line
The backbone is sound and should stay. Most of the time a batch takes is waiting (timed reads, late slotting, reviewer and Kyle waits), not process steps. The real gaps are three: batches close with their intent unproven, the impact census is done by hand, and the paperwork at close is written three or four times. Four changes are worth making; the rest is fine.

## What the evidence shows
- **Speed.** Median 33 hours from scope to close (n=73). 44 batches closed in 3 days or less; 20 took more than a week. The long tail is mostly batches scoped long before they were slotted, plus observation windows. Step count is not the bottleneck.
- **The gates catch real problems.** Langston sent back or re-rounded Step 1 in 24 of 74 reports and Step 4 in 18; Step 8 caught wrong Step-7 statements (B_BOOK_STATE_RESTART_DURABLE). Rough split of mentions: ~40% scope and audit, ~35% code, ~25% verification.
- **Intent is often closed unproven.** 29 of 74 reports close objectives as PARTIAL, UNEXERCISED or "not seen live" (for example, B_ENTRY_DISTANCE_GUARD: the refusal "has never fired live"; B_CRYPTO_FEED_WATCHDOG: four objectives PARTIAL).
- **Escaped defects are coverage misses of a specific shape**:
  - a second code path (#903: a field added to the main return, not the empty-window return);
  - code and database disagreeing on allowed values (#1063: six pattern types in code, five in the database; 22,368 failed inserts over 13 days);
  - a consumer reading a value with a different meaning (#1160: `active` meant "any engine" to the server and "this mode's engine" to the page);
  - a failed read treated as an empty answer (#691/#1211).
  Each would have been caught by asking, for every changed value, *who else reads it, by what path, and what does each reader assume it means*.
- **Close-out paperwork.** The ~30-row governance ledger is written in the session, the commit message and the report; step 4's header lists the documents a fourth time. Report median ~10.5 KB. No report showed a document row changing a decision.
- **Tests are already standard practice** (604 of 704 server commits touch tests). "Write tests" is not a new recommendation.

## Recommendations (meaningful only, highest value first)

**R1. Every objective carries its proof of done, designed at Step 1, and "unproven" is a real status.** (Intent, correctness.)
Each objective states, in the scope, how it will be shown working: the exact query, test, log line or page. For a rare event, it states how the batch will *force* it on staging, because waiting for a refusal to fire naturally is how 29 of 74 closed partial. If a live proof truly cannot happen inside the batch, the batch closes as **CLOSED-UNPROVEN** with an armed alert to verify at the first live occurrence. It is never reported as done. Langston reviews the proof plan at Step 1, which is already where he finds the most problems.

**R2. A tool-driven impact census in Step 2, with a "readers and meaning" table.** (Completeness, correctness.)
Today the census of entry points, callers, writers and readers is hand-grepped, and the System Impact Map it leans on is hand-maintained. A script run at Step 2 lists, for each changed symbol and table or column: every reference (type-aware, not text grep), every scheduler, timer and start-up path repo-wide, and every database reader. Its output pastes into the pre-audit. The session then fills one table for each changed value: *reader · path · what it assumes the value means · still true after this change?* That table targets exactly the #903 and #1160 misses. Where a value is backed by a database type, a CI check compares the code's allowed values against the database's (the #1063 class). Large censuses fan out to Sonnet helpers, one per component, with the session checking every hit.

**R3. Write the close-out once, generated, and merge Steps 10 and 11.** (Speed, accuracy.)
The governance checker already holds the class-to-documents table. A script pre-fills the ledger from the diff and the declared class: which documents are required, which the diff touched, and which are judged. The session confirms or edits it. The same output feeds the step-4 header and the completion report, so nothing is retyped. The completion report shrinks to objectives, proof, outcome (including CLOSED-UNPROVEN items) and the generated ledger. That makes ten steps instead of eleven, and removes the most-repeated paperwork without dropping any document update.

**R4. Give Step 8 a defined independent method.** (Accuracy.)
Step 8's skill is 2.8 KB and does not say what Langston re-measures, so it tends to re-run Step 7's instrument. Make it: for each load-bearing objective, the reviewer proves it with an instrument *he chooses* (a different query, log or page), at the deployed sha. This keeps the step's value (it caught wrong-object claims) and makes its independence real rather than assumed.

**Smaller, worth doing in the same pass:** split Steps 1 and 2 cleanly. Step 1 keeps intent, objectives, proof plan and change class; the System Impact Map, System Manual and provenance reads move wholly to Step 2, so they stop being done twice. Strip repeated blocks from the step skills: the fresh-reader block appears three times, the board block in every step, plus each step's "preserved verbatim" copy of retired text. That makes them faster to load and read.

## What should NOT change
- Independent code review at the graded ref (Step 4), and the CI 4/4 gate (Step 5). Both catch real defects; review by a reader who never saw the reasoning is what current Anthropic guidance recommends.
- `dt-deploy` and its guards (Step 6). Already machine-checked.
- The provenance read and audit-before-plan ordering in Step 2.
- UI-navigated verification in Step 7: Anthropic's guidance treats live checks and tests as complementary.
- The hotfix path and its qualifying test.

## Not established
- Time per step: reports rarely timestamp steps, so where the 33-hour median goes inside a batch is unmeasured.
- How many escaped defects trace to scope or audit misses: no report records what review missed. Recommend R3's generated report add one line, "missed earlier, found at step N", so this becomes measurable.
- The value of the System Impact Map as maintained: not tested here.

## If Kyle agrees
One batch (or R1+R4 as rule edits, and R2+R3 as a tooling batch). The owner and placement are Kyle's to slot after a slot check; Langston or Coltrane reviews the rule edits before they land.
