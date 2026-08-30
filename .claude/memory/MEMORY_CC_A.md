# MEMORY — CC-A ("Claude Old" / OLD Claude)

> Per-session volatile state. Shared protocols in `MEMORY.md`; stable governance in `CLAUDE.md`. Cap 200 lines / ~24KB — watch BYTES; collapse closed batches to one-liners.
> **★ I WORK IN MY CLONE: `C:\DawnTraderV3-old` (NOT the retired Google Drive folder).** New §7.1 (landed `e54c5ff7b`): GitHub is source of truth; each session its own clone on `migration/aws-supabase`; `git fetch` → pull → push; **a rejected push = the system working (pull, then push)**. On local NTFS the **Tier-1 path-limited commit is the mandated form** (`git commit -F <msg> -- <paths>`; #542: zero recurrences REPORTED since 07-23 — absence-of-reported-failure, not per-commit proof, §5.25). The `guard-bare-commit` hook blocks a bare commit — use Tier-1. Rules-freshness hook re-stages `CLAUDE.md`/`.claude/*`/`load-own-memory.mjs` into my index/tree — `git checkout -- CLAUDE.md .claude/settings.local.json` + `git reset` them out before committing MY paths only.

---

# ▶▶ CURRENT POSITION — READ THIS FIRST, BEFORE ANYTHING ELSE

> **A HEARTBEAT OR TIMER WAKE MEANS *RESUME*, NOT *REPORT*.** Read this block, then carry on from it.
> **If BLOCKED-ON says Kyle, say NOTHING and do not work the item.** Otherwise continue to the next step and report only at the step boundary, in the `CONDUCT.md` §6 format.
> ⚠️ **UPDATE THESE FOUR LINES AT EVERY STEP BOUNDARY.** They were left stale for weeks and Kyle found it before I did.

- **STEP: 2 of 11** (`B-RULES-1e` — the merged Pre-Implementation Audit AND Implementation Plan, with Langston). ✅ **`B-CLAUDEMD-SLIM` CLOSED** (−5,110 B at the ref; `PHASE_19_PLAN` row 12 marked closed — it read "NAMED, NOW PLACED" for a day after closing). **Docs exist: `B_RULES_1E_SCOPE.md` (Step-1 approved w/ conditions @ `650dd2209`) + `B_RULES_1E_PRE_AUDIT.md`.** ⛔ **RE-READ THE AUDIT DOC; DO NOT RE-DERIVE A1-A4.**
- ⛔⛔ **`#946` LANGSTON’S `MEMORY.md` TRIM IS NOT MINE — KYLE REMOVED IT 2026-08-30** (*"that is the responsibility of Infra Claude … I don’t wanna mix that work"*). **Out of `B-GOV-REPORTING` and out of my queue; NOT in the `PHASE_19_PLAN` queue, because Kyle owns its placement in Infra’s ordering.** ★ **Langston TOLD TO STOP mid-split.** ✅ **His full ruling is the handover on `#946` — (B) compress-in-place, (A) dead for retractions, (D) govern on per-line assertion class not bytes; and his `B-MISTAKES-FILE` clearance DID land at `ec7519410`.**
- ★ **WHAT STAYED WITH ME FROM IT: the matrix’s MISSING `BLOCKED` STATE** — `REQUIRED`/`JUDGED` with no third option, so a required row that cannot be discharged takes a ✅ it has not earned. Rides in `B-GOV-REPORTING`, queue 8. **Surfaced BY the trim, not part of it.**
- **QUEUE, read from `PHASE_19_PLAN` §governance (NOT from memory): 1 `B-RULES-1e` IN FLIGHT · 2 `B-CROSS-SESSION-BLEED` (#753) · 3 `B-GDRIVE-UNMOUNT` (#757/#759) — **INFRA CLAUDE, not me** · 4 `B-REVIEWER-LOOP` (#758) · 5 `B-CHUNK-ADDRESSING` (#749/#761) · 6 `B-MEASURE-GATE` · 7 `B-EXIT-LATCH-INVESTIGATION` (#732) · 8 `B-GOV-REPORTING` · 9 `B-EOL-NORMALISE` (#751) · 10 `B-GATE-GUARD`+`B-ISSUE-BLOCK-GUARD` (#744/#745) · 11 `B-CREW-BOARD-REMOVAL` (gated on Kyle) · 12 `B-CLAUDEMD-SLIM` ✅ CLOSED.**
- ⛔ **OWED TO KYLE, NOT YET ANSWERED: Langston’s `AWAITING KYLE` block has sat 51 DAYS** (fail-open vs fail-CLOSED + two standing-rule proposals). **It does NOT travel with the descope** — an undecided thing is the one class that cannot be refetched. **Plus (D) as a standing question.**
- ⛔ **OPEN AND MINE:** `#761` comms outage (evidence `/root/evidence/761/`) · **two overdue alerts `f6ae5419` (18d), `23f004a4` (21d)** · ★ **THE ALERT QUEUE STALL IS ITSELF THE FINDING (Langston): six unmoved in two days, oldest 3 weeks — take the STALL to Kyle, not six rows.**
- ⚠️ **TWO MECHANISMS MEASURED 2026-08-29, both in `#946`’s commit trail: (1) the RULES-FRESHNESS HOOK wrote origin’s `RUNNING_ISSUES` into my tree while HEAD sat 43 behind — staging it would have re-committed CC-C’s `#940`-`#945` under my name; candidate cause for `B-CROSS-SESSION-BLEED`, labelled HYPOTHESIS. (2) reading a CRLF file with universal newlines and writing back flips EVERY line — a 5,083-insertion diff for a 25-line entry. **Read with `newline=''`.**
# ⛔⛔ I TOOK LIVE COMMS DOWN FOR ~4 MINUTES AND COULD NOT DIAGNOSE IT (`#761`)
**Patched `discord_common.py` for `#749`, restarted the bridge, every `cc-send` returned `send FAILED`. Reverted from backup; verified restored.** ⛔ **CAUSE STILL UNKNOWN — I had two theories, tested BOTH offline against the real functions, and both were REFUTED.** Broken copy preserved at `/tmp/discord_common.py.broken-749`.
★★ **THE PROCESS FAILURE IS THE KEEPER: I DEPLOYED TO A LIVE SERVICE AND TESTED IN PRODUCTION.** ⇒ **prove chunking OFFLINE on real bodies FIRST.** ⚠️ **Pulled out of the slim into `B-CHUNK-ADDRESSING` (queue 5) — a doc batch is how a live-service change came to be attempted at the tail end of one.**

# ⚠⚠ SIX INSTRUMENTS CALLED CONTENT "ABSENT" AND ALL SIX WERE WRONG — IN ONE DAY
**exact-phrase (5 false) · concept-word (3) · a checker that could not tell a POINTER from a BODY (3) · a case-sensitive grep against capitalised text · and TWO of Langston’s own (`lstrip` strips a CHARACTER SET not a prefix → 22 false; phrase probes → 5).**
★★ **THE ONLY METHOD THAT DID NOT FAIL: READ THE DESTINATION END TO END AND CITE THE LINE YOU REJECTED BESIDE THE ONE YOU ACCEPTED.** ⛔ **A BETTER MATCHER IS NOT THE FIX — FOUR OF THE SIX WERE BETTER MATCHERS.**
⚠️ **My two misses were NOT paraphrase failures: I read one plausible line and stopped — §9.5(a) first-sufficient-explanation, applied to a FILE.** ★ **CHECK EVERY ZERO BEFORE ACTING ON IT.**
★ **23 `wrong-object` trailers in one day vs 22 for the whole prior week. `B-MEASURE-GATE` (queue 6) is the mechanism; logged mid-week in `MISTAKE_PATTERNS.md` rather than waiting for the pass.**

# ⛔⛔ SCOPE BEFORE YOU PUSH — and VERIFY THE LABEL, not just the content
★ **KYLE DECIDES *WHAT*. LANGSTON REVIEWS *HOW*. "Kyle asked for it" is not a review gate** — no moment presents itself as *"you are shipping a rules change."*
⚠️ **`cc505f452` shipped correct work under ANOTHER batch’s name** (`#760`): the message heredoc failed, `git commit -F` took a stale file, `-q` hid it, and **I verified the CONTENT reached origin and never looked at the label.** ⇒ **the checker attributes batches from commit SUBJECTS.** ★ **A matching name is not a matching thing — here it was RIGHT CONTENT, WRONG NAME.**
⛔ **STOP PUTTING BACKTICKS IN BASH-EMBEDDED PYTHON.** They are command-substituted, the heredoc dies, and a stale file survives to be picked up. **This caused `#760` and mangled four other edits today. Use the Write tool for any script with backticks.**

# ⚠⚠ CAP + BYTE CLAIMS: MEASURE AT THE REF, NEVER YOUR CHECKOUT
★ **`git show <ref>:FILE | wc -c` — the blob is one object, identical for every clone.** ⛔ **A working-copy `wc -c` is CRLF-inflated (~1 B/line) and re-opens the hole: three false "over cap" readings in one day (`#751`).** ⚠️ **119 md files DO store CRLF; `CLAUDE.md` does not.**

# ✅ FRESH-CONTEXT REVIEWER — LIVE, STANDING APPROVAL (Kyle 2026-08-27)
**Spawn for load-bearing claims at ANY workflow point, and after ANY investigation that produced a finding. No asking.** ⚠️ **I had written "Kyle must approve" into it myself — four skills, ZERO uses in two days.**
**Hand it ONLY the object + the claim. Ask "WHAT OTHER STATES OF THE WORLD ARE CONSISTENT WITH THIS OBJECT?"** — never *"does this support my claim?"* (the first reaches wrong-object; the second cannot). **Scope to that ONE output; never a disposition.** ⚠️ **Limit: a fresh context is blind to context it NEEDS, not only what it should ignore.**
★ **RUN 1 CONTRADICTED A LANGSTON RULING** — found 8 absences in §9.5 incl. the clause the section is TITLED after; I re-derived all 8 with a control. **§9.5 re-classified Class A → Class B.** ⚠️ **One run, one claim, my choice of target — a positive result, NOT proof it generalises.**

# ▶▶ §6b: SELF-REVIEW CANNOT WORK — THE FIX IS A PROCESS BOUNDARY
⛔ **"GO BACK TO THE OBJECT" IS THE WRONG INSTRUCTION: in 3 of 4 errors I DID and was still wrong** — the failure is checking something **ADJACENT** to the claim. ★ **I prove RELIABILITY and call it VALIDITY.**
★★ **LANGSTON, and it settles the loop question: *"Three rounds by the same reader is not three measurements — the generator and the checker share a failure mode. You measured your BASE RATE, not your RESIDUAL."*** ⇒ **non-convergence is EXPECTED; more rounds buy nothing.**
⚠️ **AND THE ACTIONABLE ERROR RATE EXCEEDS THE FALSE-FINDING RATE: a session told "fix X because Y" ACTS ON Y — a fabricated Y sends them to rebuild the wrong thing, indistinguishable from a false finding.** ⇒ **rule 29(c): every mechanism claim cites its line or is labelled HYPOTHESIS.**

# ▶ B-RULES-1e — re-read the audit doc; do NOT re-derive. ⛔ **A1: `langston-call` has NO programmatic caller** though `CLAUDE.md` §8 calls it the alert/queue invoker (control: `cc-send` = 6). **A4: CI has exactly 4 jobs.** ★ **A3’s lesson: TWO INSTRUMENTS AGREEING IS NOT A CONTROL — a control is one that would FAIL DIFFERENTLY.**
- **A2** 9 copies of that 6 KB script (live + 6 backups + 2 repo forks), ≥4 models. **A3** `CLAUDE_CODE_FEATURE_WATCH.md` has **no programmatic writer OR reader** — 7 pre-existing refs, all `.md` ⇒ the liveness artifact and the thing it measures are **the same actor**.
- ★ **A4 — CI HAS EXACTLY 4 JOBS AND RULE 19 NAMES THEM. A 5th job would make every "4/4" citation wrong.** The skill check rides INSIDE `TypeScript Check`.
- ★★ **A3’s COUNT WAS WRONG AT FIRST DISPATCH AND THE LESSON IS THE KEEPER: TWO INSTRUMENTS BOTH RETURNED 6 AND EACH MISSED A DIFFERENT FILE.** Their AGREEMENT read as corroboration. `git grep` (index, not filesystem) resolved it. ⇒ **TWO INSTRUMENTS AGREEING IS NOT A CONTROL — A CONTROL IS ONE THAT WOULD FAIL DIFFERENTLY.** Proposed to Langston as a standard; one instance, not yet ruled.

# ★ KYLE 2026-08-21: (1) step renamed **"Pre-Implementation Audit AND Implementation Plan"** — check it is renamed everywhere. (2) **His skills design: ONE workflow skill whose SKILL.md is a SHORT INDEX, each step in its own file read on demand** — skill→FILE, not skill→skill.

## ⛔ STANDING RULE — NO CROSS-SESSION NARRATION IN KYLE'S CHAT (Kyle 2026-07-30, restating §5 rule 28 at me directly)
**Kyle: *"stop providing commentary on the panel decision for the AMR. New Claude owns that, so I will get the details from him or Discord. Contribute to the Discord decision where you can and should but no need to explain it here."***
⇒ **CONTRIBUTE fully on Discord; explain NOTHING of it in his chat.** The split is: **Discord = where I do the work. His chat = ONLY my own batches and what I need FROM him.**
⚠️ **The failure was not a one-off** — I explained the AMR panel to him across five consecutive turns while it was CC-B's item, each time believing that particular update was worth it. **Rule 28 already said this; I read it as being about push notices and heartbeats, not about substantive findings on someone else's batch. It covers both.**
★ **TEST BEFORE WRITING TO HIM: is this MY batch, or something I need him to DECIDE? If neither, it does not go in his chat — however interesting it is.**

## ⛔ STANDING RULE — PERMANENT, NEVER DELETE (Kyle 2026-07-28)
**Before I tell Kyle anything is wrong, all four. He named the failure: I announce on first read, run an hour on a wrong premise, then correct. It costs him time and trust.**
1. **SEARCH OUR DOCS FIRST — AND GREP THE *FILE PATH*, NOT THE SYMPTOM** (sharpened 2026-07-28). RUNNING_ISSUES · BATCH_CATALOG · completion reports · STORAGE_POLICY · SYSTEM_MANUAL · SIM. *(Twice in one day the answer was in a batch I wrote myself.)* ★ **The sharpening cost a whole session: I searched RUNNING_ISSUES for the ml-calibration SYMPTOM and found nothing; the FILENAME returns #174 instantly — a 7-week-old keep/remove decision Langston had signed TWICE. Keep/remove calls sit quietly under the component's PATH, and in the Phase-16 register. Grep the path against both.**
2. **NAME THE POPULATION, CITE THE READ SITE** — which table/file/window does the code actually read? *(5 wrong-population errors in one arc.)*
3. **PROVE THE INSTRUMENT** — an absence needs a control that FAILS if the search is broken; an improving number can mean the tool stopped; a rising counter is a clock, not a gauge.
4. **MEASURE THE BLAST RADIUS BEFORE NAMING IT** — diff lost-vs-preserved. *("History destroyed" became "sizing fields" after one query.)*
★★ **5. READ THE HISTORY BEFORE YOU CALL IT A PROBLEM (Kyle 2026-07-28, after the ml-calibration arc). NON-NEGOTIABLE, AND IT COMES *BEFORE* TELLING HIM ANYTHING.**
When something looks like an error or a thing to fix, **go and understand what it IS first**: the CODE, the **batch records** (BATCH_CATALOG + completion reports), the **`bridge/canonical/` folder** and the docs in it, the commit that introduced it and its attached directive. **Understand what it was built to do, when, and why.**
**Kyle's diagnosis, verbatim in substance:** *"You're just reacting to first glances and spouting off everything, and you're getting corrected by yourself, by Langston and by the other sessions. It is too much."* ★ **He identified ml-calibration as legacy from ONE fact — that it sits in no part of the active path (not SQE, TCL, TEC, RTB). I had that fact and did not draw the conclusion; he did, instantly, and only then did I go read the history that proved him right.** **A component that belongs to no part of the live pipeline is a HISTORY question, not a defect — check its provenance before it is ever described as broken.**
**BREAKNECK PACE IS THE ROOT CAUSE, not carelessness in the individual step.** Slow down. One thing at a time, dug properly. **Fewer findings, each actually understood, beats a stream that gets retracted.**

**Then: symptom + evidence only. No cause, magnitude or adjective until measured. Write it SHORT — no self-flagellation, no narrated corrections to Kyle (those go in RUNNING_ISSUES + commits). Give him: what it is, what it means, what I'm doing, what he must decide.**
★ **PLAIN NAMES, NOT NUMBERS, when talking to Kyle.** #591 = *the settings-adjustment routine still using the retired score* (batch **B-EVIDENCE-GATE**). #593 = *the AMR context-bonus arm*. #582/Phase-B = *the retired-score cleanup*. #599 = *trade-record retention*.

## ▶▶ GOVERNANCE / RULES PROGRAMME — LIVE STATE (closed work collapsed 2026-08-20; repo is authoritative)

**Delivery board** `https://github.com/users/kylegjordan/projects/1`, protocol `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`. Langston sets `Review`; the OWNER moves the card. ⚠ Nothing automates it, and a board audit has already found **false states** — an un-updated board is a confidently wrong second record.
★ **KYLE RULED (08-05): the governance/rules-file work CONTINUES and is NOT interrupted by Phase-19 cards.**

**IN FLIGHT / NEXT:** **B-RULES-1c** parked at Step-1 (PROCEED on r3) · **B-RULES-1d** scope dispatched — its §3 holds Kyle's full proposed skill list, **do NOT re-derive it here** · **#694 pieces 4 + 5 NOT STARTED**: the mistakes file, and pre-audit + implementation plan as ONE document.

**DURABLE TECHNICAL FACTS (measured; do not re-derive):**
- ⛔ **Desktop sessions run 2.1.219** (above all three `.claude/rules` defect gates); **PATH `claude` is 2.1.87, a STALE STANDALONE that never loaded instruction files.** Judge capability by the DESKTOP binary.
- ⛔ **Skill BODIES are free; skill LISTINGS are NOT.** The listing has a character budget and on overflow **drops descriptions least-invoked-first**. Kyle's model confirmed verbatim: *"a skill's body loads only when it's used."*
- ⛔ **Parent→child skill references are NOT a documented mechanism** — 8 of 11 composition patterns matched nothing. What exists is the Skill tool.
- **`@path` imports load EAGERLY at launch** — dead end for lazy loading, correctly abandoned.
- **Native `InstructionsLoaded` hook exists (v2.1.69)**, landed `f8c537dbe`; sink `~/.claude/instructions-loaded.jsonl`. ⚠ **Unreachable from Hetzner ⇒ anything resting on it is `RULED ON REPORTED FACT` unless the derivation is committed.**

**CLOSED, repo-recorded, do NOT re-narrate:** #651 · #599 · #602 · #661 · #668 · B-RULES-1a/1b · B-ARM · Wave D · B-TEC-REGIME-PARAM-REMOVAL · B-CONDUCT-FILE.

## ▶▶ GOVERNANCE PROGRAMME — THE STANDING FRAME (the 07-31 blow-by-blow is CLOSED and repo-recorded; see #668 for live status)
★★ **KYLE’S GOVERNING INSTRUCTION, the one that changes how I work:** *"all of these little rules … are only going to cause more instruction-file bloat. Note the rules we want followed, but then … have them enforced by runbooks."* Plan: `B_GOVERNANCE_REMEDIATION_PLAN_r1.md` @ `8f68b7ec3` (Part 1 APPROVED TO SCOPE; Parts 2+3 stand → now #671 + #672).
★ **THE STANDARD, CITED: ≤200 lines** (*"longer files consume more context and reduce adherence"*, `code.claude.com/docs/en/memory`). ⛔ **`@path` IMPORTS DO NOT REDUCE CONTEXT** (*"imported files load at launch"*) — **struck as a lever, do NOT re-litigate.** ★ **SUCCESS METRIC = BYTES ACTUALLY LOADED AT SESSION START, NOT a line count (gameable).** **SKILLS are the real lever** — progressive disclosure: only name+description at startup, BODY loads on invoke.
★ **APPROVED SEQUENCE: 1a → 1b → 1c (path-scoped rules) → 1d (skills) → 1e (ORDERING last).** Rulings that still bind: **rule 29’s home is the HOOK, not a skill** (nobody invokes a skill in the seconds before mis-measuring) · rule 20 STAYS (a glossary is a document, not an enforcement home) · **observe what loads BEFORE restructuring what loads.**
✅ **CLOSED, pointer only:** Langston’s `MEMORY.md`-never-loaded (fixed, #651) · #602 · B-ARM-REMOVAL · B-TRADE-RECORD-RETENTION legs 1+2 · B-EVIDENCE-GATE (no build; `ml-calibration.ts` removal → Kyle booked **Phase 16**, roadmap 16.8).
▶ **STILL OPEN, not mine to progress alone:** #592 signal_eval growth → **CC-B** · #621 deploy-head → **CC-C** · AMR panel = **CC-B’s arc** (Kyle: contribute on Discord, explain NONE of it in his chat) · pool I/R column removal — **I flagged the POOLS SURVIVE so the column still carries provenance ⇒ awaiting Kyle’s decision** · leg-3 corrections live in `RUNNING_ISSUES` #599/#630/#631 — **re-read there, do NOT re-derive.**

## ▶ PARKED — **B-RETIRED-SCORE-REMOVAL (#558)**: A0-A3 deployed+verified; **Phase B HALTED before any drop, awaiting a Kyle scope call.** Census authoritative in `RUNNING_ISSUES` #582/#591/#592 — nothing droppable yet.

## ★★ RULE 29 — shipped leg 1 (`b43af6c1d`); full text CLAUDE.md rule 29 + history §5.29. Leg 2 hooks = B-MEASURE-GATE (approved, unbuilt — gates the rule-29 CLAUDE.md conversion).

## ⚑ STANDING LESSONS (earned; do not re-learn)
★★ **SILENCE IS NOT EVIDENCE UNTIL THE INSTRUMENT IS SHOWN ABLE TO SPEAK — RUN THE POSITIVE CONTROL FIRST, ALWAYS.** 2026-08-19/20 produced **THREE checks that COULD NOT FAIL, mistaken for checks that passed**, in one session: (1) **#730** — the wake filter's noise suppression had **NEVER fired in production** (stdin decoded as **cp1252** while the bridges write UTF-8, so the em-dash arrived mangled; and per Langston the read loop sits OUTSIDE the try/except, so **a right curly quote KILLED the watcher process outright**); (2) **three hand-fed filter tests read PASS while processing NOTHING** — `cur` is set only by `tail`'s `==> file <==` header, so header-less lines were dropped silently, **and I reported one of those passes to Kyle as confirmation**; (3) an unset-path guard that **read as applied and did nothing** because `join('', 'CONDUCT.md')` is truthy. ⚠ **Rule 29(b) already required the control and I skipped it twice in one day** — and a separate near-miss proved 29(b) is not sufficient alone: **I ran a control, it PASSED, and the measurement was still wrong**, because the control proved the instrument could speak but not that it was pointed at the right object.
★ **A file test proves the FILE; a PROCESS claim needs the process re-read** — a running watcher holds the code it loaded at ARM time, so **re-arm after editing the filter**.
★ **Verify a fix by RUNNING IT IN THE CASE IT WAS WRITTEN FOR, never by re-reading the changed line.**
★ **A pointer added to an auto-loaded file must be checked that it RESOLVES** (Langston's form, now mine): *"a pointer to a file that isn't there is the same failure wearing the fix's clothes."*
★ **My issue block is #730-#759** (settled #702: CC-C 704-729 · CC-A 730-759 · CC-B 760-789). Mint from MY block; `max+1` is a race that collided FOUR times in one evening. **Four legacy doubles (#642 #646 #660 #668) are live — do NOT renumber them blind.**

⚠ **CI, with THREE sessions pushing minutes apart: runs CANCEL EACH OTHER, and a CANCELLED job reads as not-green.** I nearly reported 3-of-4 as a pass. ⇒ **VERIFY THE PER-JOB `conclusion`, never the run-level summary — `cancelled` ≠ `failure` ≠ `success`, and only the last is a pass.**
- **VERIFY THE OBJECT/CALL-PATH, not the plausible one.** A0 phantom read; the `calculateFinalScore` false-equivalence; reasoning from dead `executeRefreshCycle`. Grep callers + check the actual type BEFORE concluding.
- **A removed WRITER with a surviving READER is invisible** to caller-tracing/tsc/CI (#568). Run the state-write census at deletion.
- **What woke me / a truncated read / a head-N slice is NOT the population** (rule 13). "3 instances" was 29; the `head-20` tsc check hid real errors; the D-5 ref check certified an empty repo. Measure the population.
- **Never attribute a measurement from a wake FRAGMENT** — it's truncated/quoting; read the full message or ask. (3 attribution slips today.)
- **Announce SYMPTOMS freely, CAUSES only after testing reach** (24.a). Provenance-read old architecture before calling it wrong (24).
- **Langston is STATELESS per-invoke** — carry his prior ruling into the next prompt. **Use his ACTUAL NAME to Kyle, never "the reviewer."** Quote `path:line` from `origin/…`, never the working tree.
- Rule 27: me + Langston, ship it — don't convene panels. Rule 28: don't narrate other sessions' work to Kyle.
- **PERSISTENT-CONDITION GOV ALERT (gov-staleopen, "open >48h"): ACK, do NOT resolve.** poller.mjs:238-244 — the confirmed open row suspends the DEADLINE but the 48h backstop deliberately re-pings (config.mjs:201 "OPEN must never be a silent bypass"). RESOLVING frees the dedupe key → checker spawns a fresh twin next cycle (hit this 2026-07-27). Correct: ack-and-leave (dedupe suppresses twins; drops from unacked list); resolve ONLY when the batch actually closes. Contrast the gov-deadline alert, which the confirmed open row DOES suppress.

---

## 📌 OPEN THREADS
**KYLE'S CALIBRATION ANSWER (delivered 2026-08-20).** The Drift Dashboard + factor-calibration + ablation tables ARE the surfaces he remembered — but they are **OBSERVATION lenses, not a calibration mechanism**, and they read `logs/virtual_trades/*.json`. **MEASURED today: 88 closed trades in the file, ALL `source:'vts'`, ZERO from the active paper path.** ⇒ his Phase-25 deferral reasoning is **still literally true today**, weeks into active paper trading.
**CC-B / CC-C are still running the PRE-FIX wake filter until they re-arm.**
**Rule 21 removal remains GATED** behind alert `9c3037f0`; it did NOT ride B-CONDUCT-FILE.

- **#558** — A1 DEPLOYED+§9.3-VERIFIED on staging 2026-07-27 (above). NEXT = **A2 (xStock eval-cycle.ts), awaiting Kyle's go** (asked 2026-07-27; did NOT start unilaterally). Open row confirmed (langston, fa959de63); gov-staleopen `f4ffaf53` ACKED-and-left (do not resolve — see lesson). Board [34] held (still my file for A2? re-pin at ref). A2 recon: finalScore cluster at `eval-cycle.ts:656` computeFinalScore + `:668/:1000` + pattern-filter/pattern-pool-filters.
- **#582** — finalScore telemetry-reader retirement (`B-FINALSCORE-TELEMETRY-RETIRE`, Phase-B prereq). Owner CC-A. Langston Step-4 condition, homed.
- **#578** — legacy `TradingEngine` (runs in neither mode; paper never `.start()`ed, live Phase-21-gated-refuses; `active-execution-engine` is the real paper+live pipeline). Kyle-ruled legacy → its own removal batch `B-TRADING-ENGINE-REMOVAL`, owner CC-A. Not #558.
- **#580** — A0 predictiveConfidence-not-persisted seam; superseded-by-A1-removal; owner CC-A.
- **#570** — RTB bucket-2 refresh gap → **HANDED to CC-C/Analyst** (rides their item 1). Not mine anymore.
- **#579** — CI `check-tsc-baseline` dedup hole → **CC-B owns** (after B8.5k).
- **#571** `B-WS-SUBSCRIBE-BOUNDARY-CLASS` (mine, Phase 19). Obligations **#44** (2026-08-01, alert `74a661e5`), **#45** (2026-08-30, alert `27860643`).
- Kyle: crypto uses VOLUME not order-book — confirm Phase 25, don't act. Consolidate freshness work (#441/#526/#531/#548/#559) — unstarted.
- **xStock exit-check-skip staleness family** (PGR/GM/TER/QCOM/BX/BAX…) = #566, CC-B's line. Ack instances, don't chase; don't re-triage.

---

## ✅ CLOSED — repo is authoritative (completion reports + `RUNNING_ISSUES`).

## ✅ B-CONDUCT-FILE — CLOSED 2026-08-20 (`0acb762d8`). Repo is authoritative. ⛔ **§7(a) alert `441abe49` still OPEN — do NOT close it on a direct-invocation test; state the OBSERVED session-start count from the sink and name #700 as the coverage caveat.**
