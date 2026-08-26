# MEMORY — CC-A ("Claude Old" / OLD Claude)

> Per-session volatile state. Shared protocols in `MEMORY.md`; stable governance in `CLAUDE.md`. Cap 200 lines / ~24KB — watch BYTES; collapse closed batches to one-liners.
> **★ I WORK IN MY CLONE: `C:\DawnTraderV3-old` (NOT the retired Google Drive folder).** New §7.1 (landed `e54c5ff7b`): GitHub is source of truth; each session its own clone on `migration/aws-supabase`; `git fetch` → pull → push; **a rejected push = the system working (pull, then push)**. On local NTFS the **Tier-1 path-limited commit is the mandated form** (`git commit -F <msg> -- <paths>`; #542: zero recurrences REPORTED since 07-23 — absence-of-reported-failure, not per-commit proof, §5.25). The `guard-bare-commit` hook blocks a bare commit — use Tier-1. Rules-freshness hook re-stages `CLAUDE.md`/`.claude/*`/`load-own-memory.mjs` into my index/tree — `git checkout -- CLAUDE.md .claude/settings.local.json` + `git reset` them out before committing MY paths only.

---

# ▶▶ CURRENT POSITION — READ THIS FIRST, BEFORE ANYTHING ELSE

> **A HEARTBEAT OR TIMER WAKE MEANS *RESUME*, NOT *REPORT*.** Read this block, then carry on from it.
> **If BLOCKED-ON says Kyle, say NOTHING and do not work the item.** Otherwise continue to the next step and report only at the step boundary, in the `CONDUCT.md` §6 format.
> ⚠️ **UPDATE THESE FOUR LINES AT EVERY STEP BOUNDARY.** They were left stale for weeks and Kyle found it before I did.

- **BATCH:** **B-RULES-1e** — mechanisms for three rules followed ZERO times (#739 daily-check liveness · #740 skill-description colon-space · **#741 CC-A — *Langston’s 900s ceiling*, NOT CC-C’s #741**). Card `PVTI_…zg4BQXs`.
- **STEP:** **2 DONE, dispatched `40c461605` + correction `1391f3dec`.** Step-1 APPROVED WITH CONDITIONS. ✅ **VERIFIED THE DISPATCH IS QUEUED, NOT DEAD** — enqueued 16:07:46, **no `handled`, no timeout, no `bridge error`, no PARK**; CC-C has 5 later items and Langston is replying to him. ★ **That check IS #741 applied to itself: "silent" and "dead" are different states and only the bridge journal distinguishes them.** ⛔ **Do NOT re-poke on a cadence — his queue is not mine.**
- **BLOCKED-ON:** Langston’s Step-2 clearance. Card `Pre-Audit`, `Blocked on = Langston`.
- **NEXT:** on his ruling → Step 3 (P1-P7). Then `B-GATE-GUARD` · `B-ISSUE-BLOCK-GUARD` · `B-CREW-BOARD-REMOVAL` (**gated on KYLE** — follows Infra onboarding). **Queue order, NO dates (§9.4).**

# ▶ B-RULES-1e — THE FINDINGS THAT ARE NOT IN THE THREE ISSUES (re-read the audit; do NOT re-derive)
- ⛔⛔ **A1 — `langston-call` HAS NO PROGRAMMATIC CALLER, and `CLAUDE.md` §8 + shared `MEMORY.md` BOTH say it is "the invoker the ALERT/QUEUE path uses."** Whole-box grep → only docs/backups; **control: `cc-send` returns 6 real callers.** Its own log = **2 ad-hoc invocations in 3 weeks.** ★ **One of them IS the daily currency check’s live model probe ⇒ a stale MODEL there corrupts the instrument whose job is noticing a stale model.** ⚠️ **Rule 24: NOT outcome (1).** He runs it by hand; only the ALERT/QUEUE claim is asserted false. **His call.**
- **A2** 9 copies of that 6 KB script (live + 6 backups + 2 repo forks), ≥4 models. **A3** `CLAUDE_CODE_FEATURE_WATCH.md` has **no programmatic writer OR reader** — 7 pre-existing refs, all `.md` ⇒ the liveness artifact and the thing it measures are **the same actor**.
- ★ **A4 — CI HAS EXACTLY 4 JOBS AND RULE 19 NAMES THEM. A 5th job would make every "4/4" citation wrong.** The skill check rides INSIDE `TypeScript Check`.
- ★★ **A3’s COUNT WAS WRONG AT FIRST DISPATCH AND THE LESSON IS THE KEEPER: TWO INSTRUMENTS BOTH RETURNED 6 AND EACH MISSED A DIFFERENT FILE.** Their AGREEMENT read as corroboration. `git grep` (index, not filesystem) resolved it. ⇒ **TWO INSTRUMENTS AGREEING IS NOT A CONTROL — A CONTROL IS ONE THAT WOULD FAIL DIFFERENTLY.** Proposed to Langston as a standard; one instance, not yet ruled.

# ★ KYLE 2026-08-21 — TWO STANDING ITEMS
1. **THE WORKFLOW STEP IS RENAMED: "PRE-IMPLEMENTATION AUDIT" → "PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN".** Piece (5) merged the two into ONE step/ONE document and Langston ADOPTED it; **the STEP NAME in `CLAUDE.md` §2 must follow.** Check it is renamed everywhere, not just in the piece-(5) record.
2. **HIS SKILLS DESIGN, and it works WITH the mechanism:** one big workflow skill whose `SKILL.md` is a SHORT INDEX, with each step's full detail in a **separate supporting file inside the skill's own directory**, read on demand. ⇒ **large workflow, only the applicable section loads.** ★ **This sidesteps the refuted parent→child path entirely: it is skill→FILE (a normal Read that certainly works), not skill→skill.** Length inside a step file is NOT a concern — correctness and being followed is.


---

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

## ▶ PARKED — B-RETIRED-SCORE-REMOVAL (#558)
A0-A3 deployed + §9.3-verified; **Phase B HALTED before any drop**, awaiting a Kyle scope call. Pre-drop census authoritative in `RUNNING_ISSUES` #582/#591/#592 — nothing droppable yet. ⚠️ **This sat under a heading reading "ACTIVE BATCH" for weeks while I ran two other batches. Kyle caught it 2026-08-20. A stale position marker is worse than none: it reads as current.**

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

## ✅ B-CONDUCT-FILE — CLOSED 2026-08-20 (ref `0acb762d8`; CI 4/4 per-job run `32314304639`; Langston Step-1/2/4 APPROVED)
`CONDUCT.md` + `.claude/hooks/load-conduct.mjs` auto-load the BEHAVIOURAL rules every start/resume/compaction, so they arrive BEFORE I act instead of sitting below 100 KB of `CLAUDE.md`. **Always-loaded −2,430 tokens**, measured on what the loader EMITS (not the file size — that was Langston's correction; my own second error was baselining against a ref that had advanced to my own commit). 10 rules moved, all pointered, **nothing deleted**; rule 24's text staged at `1-system-manual/_pending-skills/bug-investigation-SOURCE.md` for B-RULES-1d to build from and delete.
⛔ **§7(a) OPEN, NOT CLAIMED — alert `441abe49` fires 2026-08-20T12:00Z.** The hook is proven to EMIT; that the **HARNESS** invokes it is unproven (no session had started/compacted after registration). **Do NOT close it on a direct-invocation test — that is the thing already proven.** ★ **AT DISCHARGE (Langston rider): state the OBSERVED SESSION-START COUNT from the sink — *"several"* is not a number and is how an alert re-surfaces forever without concluding; and name **#700** as the COVERAGE caveat, since a non-repo-folder session is dark to that sink, so a LOW count may be coverage, not failure.** Full criterion: the completion report's DISCHARGE CRITERION section.
