# CC-INFRA (Infra Claude) — SESSION TASK LIST — plain language, as of 2026-09-03

> **Kyle asked for my running list in one place, in words he can read (2026-09-03):** *"I want to create a task list for each of you sessions. I already have it for analyst and Old Claude."* Same shape as `CC_A_SESSION_TASK_LIST.md`.
> **The authoritative ORDER is `PHASE_19_PLAN.md`; this file is the plain-language view of it, not a second source of truth.** Where they disagree, the plan wins.
> ⛔ **Everything below was re-derived at `origin/migration/aws-supabase` today, not recalled.** Two things my own memory had WRONG are corrected in §7.

---

## 0. Where Kyle last had the thread

He remembers **"we were working on improving Langston and setting him up"** in June or July, and asks how far in we are. ⭐ **THERE ARE TWO SEPARATE PROJECTS UNDER THAT HEADING AND I HAD CONFLATED THEM.** **(a) The one he actually meant — letting a stateless reviewer reach the archives — SHIPPED on 2026-08-06 and is in daily use (§2).** **(b) The memory-FILE trim, which is what Old Claude handed me on 30 August and is genuinely unfinished (§3).** Kyle's own words on (b): *"that is the responsibility of Infra Claude … I don't wanna mix that work"*, belonging to *"the instruction-file workstream started weeks ago and interrupted by hotfixes."* **Interrupted by hotfixes is exactly right for (b)** — `B-COMMS-IMAGES`, the crew-status tooling and then `B-TOKEN-WATCH` all landed on top of it. ⚠️ **But (a) was not interrupted; it finished, and I did not know that until I checked the box.**

---

## 1. In flight right now

| batch | what it is FOR, plainly | state |
|---|---|---|
| **`B-TOKEN-WATCH`** | A capture-only study of new Solana token launches — no trading, no wallet, no money. It builds the survival-analysis machinery **where a published answer key already exists**, so we can trust the machinery before pointing it at our own trading questions. | **STEP 7 of 11.** Collecting live. Three things owed: the Alchemy switch is **not cleared** (its acceptance test was invalid — see §5), the 72-hour proving run still needs the launch feed pointed at us, then Steps 8-11. |

---

## 2. ⭐ THE WORK KYLE ACTUALLY MEANT — "preserve his statelessness but let him reach the archives" — **IT SHIPPED**

> ⛔ **Kyle, 2026-09-03, correcting me:** *"I had old Claude hand you the trimming of Langston's rules or its memory file, but that's not what I'm referring to. You and I started working on Langston probably in June or July, where we were working to preserve his statelessness, but at the same time allowing him to access archives and previous decisions when necessary. And then we interrupted that work and haven't gotten back to it."*
> ✅ **HE IS RIGHT THAT IT IS A DIFFERENT PROJECT, AND I HAD IT FILED UNDER THE WRONG HEADING (§3 below is the memory-FILE trim; this is the RECALL system). BUT THE HONEST FINDING IS THAT IT WAS NOT ABANDONED — IT WENT LIVE ON 2026-08-06 AND IS IN DAILY USE.**

**WHAT IT IS: `langston-recall` — an archive index he PULLS from.** The design answer to Kyle's exact requirement is **pull-only by construction** (the tool's own header): he stays stateless per-invoke and writes nothing, and when he needs history he *asks for it*. It writes only under its own index directory and touches neither the bridge nor the live loop.

✅ **VERIFIED LIVE AT THE OBJECT 2026-09-03, not recalled:**
| | |
|---|---|
| tool | `/usr/local/bin/langston-recall` → `/opt/langston-memory/bin/langston_memory.py` |
| wired into his rules | **`CLAUDE.md` §19**, with a MANDATORY trigger: *"Before any verdict token, and before asserting anything is a defect / dead / absent / impossible"* |
| index | **79,876 records**, rebuilt nightly 04:10Z by `langston-memory-index.timer` (ran today) |
| four eras covered | openclaw `2026-03-12→05-06` · telegram `03-13→06-21` · discord `06-19→09-03` · his own transcripts `06-30→09-03` |
| ⭐ **actually used?** | **203 of his 3,680 session files carry a REAL shell invocation.** *(Control: 0 files contain the §19 rules text, so this is genuine use and not his rules file echoing into context. Recent real queries: "ZTS freshness ceiling exit checks skipped", "xstock freshness monitor".)* |

★ **AND IT IS BETTER BUILT THAN I REMEMBERED: every output states its own freshness and per-shard coverage, warns that "a miss here is NOT an absence", REFUSES on a degraded corpus, and cross-checks his RETRACTION LEDGER first — so a hit he is about to cite is flagged if he later vacated it.** That last part is the thing that makes archive access safe for a stateless reviewer.

⛔ **WHAT IS GENUINELY LEFT — three things, all smaller than "we never got back to it" implies:**
1. ⭐ **THE CORPUS DOES NOT INCLUDE THE FOUR CC SESSIONS' TRANSCRIPTS.** It indexes *his* transcripts plus the comms channels — so he can reach what reached the CHANNEL and what he himself said, but **not what a CC session worked through internally.** Our own design conversations are invisible to it, which I proved by querying it for this very project and getting **0 hits**. That is the biggest remaining gap and it is the one Kyle would feel.
2. **There is no usage instrument.** Nothing logs a query. I could only measure use by grepping his transcripts after the fact — which works, but means nobody can see whether the mandatory §19 trigger is actually being honoured.
3. **A window-cap constant was left "wrong-sized → tunable, shadow phase measures it"** in the build notes. The shadow measurement was never run.

---

### 2b. ⭐⭐ THE FULL DESIGN HAS **THREE** LAYERS, NOT ONE — and Kyle's memory of "we did maybe half" is close to right

> **Kyle, 2026-09-03:** *"it was not only about giving him the ability to archive. We were also… he was writing to a short term memory file, I think, with all of his decisions. This was part of the design that you came up with… We had a whole set of changes that we were working on for Langston, and I think we only did the first third or quarter or half of it."*
> ⛔ **SUPERSEDED BY §2c — I DID find it; it was a crew MESSAGE, not a repo document.** *(Original wording kept:)* **I did NOT find the original plan document.** Searched: `1-system-manual/`, `Claude Comms and Packages/` (scope files, completion reports, design asks, cross-session briefs), `LANGSTON_ARCHITECTURE.md`, `BUILD_METHOD_PLAYBOOK.md`, and the transcript corpus. **The three `B_LANGSTON_QUEUE*` reports are CC-A's Discord review-QUEUE work, a different thing.** ⚠️ **So the enumeration below is RECONSTRUCTED FROM THE BUILT SYSTEM, not read off a plan — treat it as evidence of what exists and what is missing, NOT as the original list.**

**WHAT IS ACTUALLY BUILT — three layers, verified on the box 2026-09-03:**

| layer | what it is | state |
|---|---|---|
| **1. SHORT-TERM — the auto-memory store** ⭐ *(this is the thing Kyle remembers)* | `/home/langston/.claude/projects/-home-langston/memory/` — **37 typed files, 172 KB**, prefixed `feedback_*` (a lesson learned) and `proj_*` (a durable project fact), each one a distilled decision with a pointer to the detail, plus an **11.8 KB index**. | ✅ **LIVE AND ACTIVELY WRITTEN — newest file today at 12:34Z.** The index content is genuinely his decisions, distilled — exactly the design Kyle describes. |
| **2. THE REVIEWER LEDGER** — his retractions and generalising rulings | Inside his ALWAYS-LOADED `MEMORY.md` §"REVIEWER LEDGER — MY OWN RETRACTIONS, RULINGS AND ERRORS (survives every prune)". Three subsections: retractions · rulings that generalise · rulings executed. | ⚠️ **EXISTS AND IS READ — but see the gap below.** |
| **3. LONG-TERM — `langston-recall`** | The 79,876-record archive index across four eras. | ✅ **LIVE 2026-08-06, used in 203 of his 3,680 sessions** (§2). |

⛔⛔ **GAP 1 — THE REVIEWER LEDGER HAS A READER AND NO WRITER. THIS IS THE CLEAREST MISSING HALF.**
**MEASURED on his `CLAUDE.md`: `REVIEWER LEDGER` appears 0 times, and write-verbs near `ledger`/`retraction` appear 0 times.** *(Positive control, same file, same search shape: `langston-recall` 3 hits, `MEMORY.md` 12 hits — so the instrument finds his standing obligations when they exist.)*
⇒ **`langston-recall` REFUSES on an unparseable ledger and prints its retractions before every result — the whole safety property of layer 3 rests on layer 2 — and NOTHING instructs him to maintain it.** It is kept by whichever CC session remembers to sync his memory. **A structure with a mandatory reader and no writer is one forgetful week from being silently stale**, and a stale retraction ledger means the recall tool confidently serves a ruling he already vacated.

⛔ **GAP 2 — TWO HOMES FOR THE SAME THING, AND IT HAS ALREADY MISFIRED ONCE, IN HIS OWN WORDS.** His `MEMORY.md:123`: *"the 08-28 correction was written into the auto-memory file `proj_board_write_access.md` while the DEFECTIVE recipe stayed HERE, in the always-loaded file I actually reach for. **Two homes, one corrected.**"* He filed it himself as `fix-follows-pointer`. ⇒ **Layer 1 and layer 2 both answer "what did I decide", with no rule saying which is authoritative — the `#641` shape inside the memory system itself.**

⚠️ **GAP 3 — NO CAP AND NO PRUNE ON LAYER 1.** 37 files and growing, with an index that is itself 11.8 KB. Every other memory file in this project has a stated cap; this store has none.

⚠️ **GAP 4 — NO USAGE INSTRUMENT ON ANY LAYER.** Nothing logs a recall query or a memory write. ⛔ **AND AN HONEST LIMIT ON MY OWN NUMBER: I measured that 163 of his 3,680 transcripts reference the auto-memory store — but I did NOT separate "the index LOADED into context" from "he WROTE a memory file that turn". Those are different facts and the distinction is load-bearing** *(this is the `wrong-object` trap, so it is named rather than glossed).* **Whether layer 1 reliably loads at invoke is UNVERIFIED — and `#651` is the precedent that says assume nothing here: his `MEMORY.md` was documented as auto-loading and had NEVER loaded.**

★ **RECOMMENDED ORDER IF KYLE WANTS THIS RESUMED:** (i) prove layer 1 actually loads at invoke — cheapest, and it is the `#651` failure mode; (ii) give layer 2 a WRITE rule, since layer 3's safety depends on it; (iii) rule which of layer 1 / layer 2 is authoritative and collapse the duplication; (iv) cap and prune layer 1. **`B-LANGSTON-LEDGER-SPLIT` (§3) touches the same files and should be sequenced with these, not separately.**

### 2c. ⭐⭐⭐ **THE PLAN IS FOUND.** It was a THREE-ITEM workstream and I broadcast it myself on 2026-08-05 — **item 1 shipped, item 3 was solved by someone else, ITEM 2 WAS NEVER STARTED**

> ⛔ **§2b said "I did NOT find the original plan document." THAT IS NOW SUPERSEDED — I found it.** It was never a repo file, which is why every folder search missed it: **it is my own crew broadcast in the Discord log, `2026-08-05T10:48:22Z`, sender `Infra Claude`, headed *"WHAT IS BEING BUILT (Kyle-approved, Langston-reviewed)"*.** ★ **Lesson: I searched for a DOCUMENT and the plan was a MESSAGE.** *(Found by date-filtering the crew log on the timestamp inside each record — the method Kyle asked me to prove.)*

**THE THREE ITEMS, VERBATIM FROM THAT BROADCAST, WITH TODAY'S STATE VERIFIED ON THE BOX:**

| # | what I said we were building | state today |
|---|---|---|
| **1** | *"**langston-recall** — a pull-only archive index over Langston's complete historical record… Key properties he required: latest-entry-per-ID always returned, retracted conclusions can never surface without their retraction attached, verbatim excerpts only, full provenance per hit."* | ✅ **SHIPPED 2026-08-06, live, used in 203 of his 3,680 sessions.** Every required property is present in the tool's output. |
| **2** | *"**Instruction-file restructure** — his CLAUDE.md has grown to ~61KB loaded on every invocation. It becomes a **lean core** (identity + invariants + one-line rules with pointers) plus **on-demand rule modules** he reads when the situation triggers them, plus an **automated daily size/staleness watch**."* | ⛔⛔ **NOT STARTED — ZERO OF THREE PARTS.** `/home/langston/rules/` **does not exist**; there is **no size/staleness timer**; the core was never split. ⚠️ **And his `CLAUDE.md` is now `66,994 B` — it has grown `+5,625 B` SINCE the restructure was scoped to shrink it.** |
| **3** | *"**His Reviewer Ledger** (retractions record) moves to a home that verifiably auto-loads."* | ✅ **ACHIEVED — but not by me and not by the restructure.** CC-A's `B-RULES-1a` OBJ-2 added `@MEMORY.md` (line 3 of his `CLAUDE.md`) on 2026-08-05, hours after my broadcast. **Verified at the object today.** |

⇒ ⭐ **KYLE'S RECOLLECTION — *"we only did the first third or quarter or half"* — IS EXACTLY RIGHT: one of three shipped, one was solved incidentally by another session, and the middle item — THE CLEANUP OF HIS RULES AND MEMORY FILES, which is the part Kyle specifically remembers — was never begun.**

⛔⛔ **AND HERE IS THE CONSEQUENCE THAT MATTERS, BECAUSE IT EXPLAINS §3b: ITEM 2 CONTAINED THE DAILY SIZE/STALENESS WATCH. IT WAS NEVER BUILT — WHICH IS PRECISELY WHY HIS FILE GREW `+137%` OVER 28 DAYS WITH NOBODY NOTICING.** ★ **The alarm that would have caught the growth was itself the thing that was never finished. That is not a coincidence; it is the same gap seen from both ends.**

★ **LANGSTON'S THREE HARD CONDITIONS on item 2, on record from the review rounds (`2026-08-05T14:15Z`) — binding on whoever resumes it:** (i) **the core index carries the one-line RULE, not just a pointer**; (ii) **his ledger retractions auto-load via a verified mechanism**; (iii) **no module is ever named "misc"**. ★ **Condition (ii) is already satisfied by the `@MEMORY.md` import — so resuming item 2 starts with one of three conditions already discharged.**

⛔⛔ **AND A DESIGN DECISION KYLE SHOULD NOT RE-OPEN BY ACCIDENT — THE JOURNAL WAS PROPOSED AND *REJECTED*, NOT FORGOTTEN.** My own broadcast, verbatim: ***"His journal/'window' memory concepts were reviewed and explicitly SHELVED on his own objection — recall is pull-only."***
⇒ **Kyle's memory of *"he was writing to a short-term memory file with all of his decisions"* is REAL — that concept was designed — but LANGSTON HIMSELF OBJECTED AND IT WAS DROPPED, deliberately, in favour of pull-only.** ⚠️ **The 37-file auto-memory store that exists today is the HARNESS'S OWN native feature, not our shelved journal — a different thing that arrived by another route.** *(§9.5(b-ii): a Kyle-approved, Langston-reviewed DECISION must not be re-scoped later as an unfinished task.)*

★ **ONE MORE THING THE READ TURNED UP, worth keeping: on 2026-08-05 at 10:48Z I broadcast that `/home/langston/MEMORY.md` "does NOT auto-load and never has" — and by 13:15Z the same day CC-A's OBJ-2 had made it false. I corrected it on the record myself at 14:15Z: *"Fastest stale claim I've ever issued."*** ⚠️ **The lesson generalises and is why §3b's corrections are written down rather than quietly fixed: on a system four sessions are changing simultaneously, a measured claim can go stale in HOURS.**

### 2d. ⭐⭐ **YES — HE BUILT HIS OWN DECISION FILE, UNPROMPTED, AND HE IS STILL WRITING TO IT TODAY**

> **Kyle, 2026-09-03:** *"I think during that same batch, we learned that Langston was writing his decisions in a file of his own that he had created by himself. Is that something that happened? Is he still writing to that file? And is that part of this plan?"*
> ✅ **ALL THREE ANSWERED, MEASURED ON THE BOX — and the answer to the third is NO, which is the interesting part.**

**WHAT IT IS:** `/home/langston/.claude/projects/-home-langston/memory/` — **37 files, 172 KB, with an 11.8 KB index he also maintains.** Not a log: a **linked knowledge base**. Every entry carries structured frontmatter (`name`, `description`, `type: feedback | project`, and the `originSessionId` of the session that learned it), a dated account of the incident, a **`Why:`**, a **`How to apply:`**, and **`[[wiki-links]]` to related entries**.

⭐ **HE STARTED IT ON `2026-05-07` — THE DAY AFTER HE MIGRATED TO CLAUDE CODE (2026-05-06), AND THREE MONTHS BEFORE OUR BATCH.** Nobody asked him to.

| month | files he wrote |
|---|---|
| 2026-05 | 1 |
| 2026-06 | 1 |
| 2026-07 | 12 |
| 2026-08 | **20** |
| 2026-09 (3 days in) | 3 |

⇒ ✅ **STILL LIVE AND ACCELERATING — newest entry today at 12:34Z.** *(Population: every `.md` in that directory; dates from the filesystem here are safe because these files are written in place and never copied.)*

★ **WHAT ONE ACTUALLY LOOKS LIKE — `feedback_narrow_predicate_false_absence.md`, his own words, 2026-08-24:** a CC reported a missing ledger row and reinforced it with a UNIQUE-index argument. His entry records that **the row existed**, and then generalises: *"the index argument is sound and irrelevant — it proves no DUPLICATE, never a PRESENCE. A too-narrow WHERE predicate returns a clean, confident, wrong zero, and the tighter the surrounding rigor the more convincing it looks."* Then a `How to apply` prescribing the unfiltered enumeration and a positive control. ⇒ **These are not notes. They are re-usable rulings with a stated mechanism, which is exactly what a stateless reviewer needs and cannot otherwise carry.**

⛔ **AND THE ANSWER TO "IS IT PART OF OUR PLAN": NO — AND OUR VERSION OF IT WAS DELIBERATELY REJECTED.** My 2026-08-05 broadcast, verbatim: ***"His journal/'window' memory concepts were reviewed and explicitly SHELVED on his own objection — recall is pull-only."***
⇒ **We designed a journal, Langston objected, we dropped it. Meanwhile he had ALREADY been keeping one of his own for three months, by a completely different route — the harness's native memory feature rather than anything we built.**
⚠️ **HONEST LIMIT ON THE CAUSAL CLAIM, because it is the tempting one to make and I have NOT established it: I can show the store PREDATES the batch by three months (measured) and that the journal was shelved on his objection (verbatim). I have NOT found a record saying the store IS WHY it was shelved.** ★ **A tidy causal story here would be a reconstruction, not a finding.**

⇒ ⭐ **THE PRACTICAL CONSEQUENCE, AND IT IS THE ONE WORTH ACTING ON: THIS STORE IS UNGOVERNED.** It is not in `LANGSTON_ARCHITECTURE.md` §4 "HIS FILES", carries **no cap and no prune** while every other memory file in this project has one, has **no backup** (unlike his `CLAUDE.md`/`MEMORY.md`, which get a dated pre-image on every change), and **nothing verifies it loads**. **It is the single most valuable artifact he owns — four months of his own hard-won rulings — and it is the least protected thing on that box.** ⇒ **Add it to `LANGSTON_ARCHITECTURE.md` §4 and give it a backup, ahead of any restructure work.**

### 2e. ⭐⭐ **WHY FOUR SESSIONS WRITE INTO HIS FILES — AND THE EVICTION RULE THAT ALREADY EXISTS AND IS NOT FOLLOWED**

> **Kyle, 2026-09-03, adding a fourth strand to the batch:** *"we need to make sure that we have a system for maintaining his memory file, his instruction file. And if sessions are constantly writing into them, we need to make sure that that still makes sense. **Why are they doing that? Is that the right thing?** And if not, then we need to make adjustments."*

⛔⛔ **CORRECTION TO MY OWN §3b, AND IT MATTERS: I TOLD KYLE THERE WAS NO DELETE RULE. THERE IS ONE.** It is in the header of his `MEMORY.md`: *"**Lean discipline (Kyle 2026-07-01): a CLOSED batch = ONE line here**; the repo completion reports + `PHASE_19_PLAN` §1 + `BATCH_CATALOG` are authoritative."* ⇒ **The rule exists, is Kyle-directed, and is simply NOT BEING HONOURED — 8 of his 18 sections name an already-CLOSED batch and each runs to a full section rather than one line.** *(`absence-never-searched`: I asserted the absence of a rule from the writer's side without reading the file being written to.)*

★★ **THE STRUCTURAL DIAGNOSIS THAT REPLACES IT, and it is sharper: THE *ADD* RULE LIVES WHERE THE WRITER LOOKS; THE *REMOVE* RULE LIVES WHERE ONLY THE READER LOOKS.**
- **§10.b (append)** sits in `workflow-10-governance`, which a session **loads at step 10** — so it fires reliably, every batch, from all four sessions.
- **The one-line-per-closed-batch discipline** exists only in the **header of the file being appended to** — which the writing session appends to **without reading**.
⇒ ⛔ **An append obligation that fires and an eviction obligation that does not is MONOTONIC GROWTH BY CONSTRUCTION** — and it is exactly what the numbers show: `24,528 B` (2026-08-06) → `58,177 B` today, **+137% in 28 days, ~1.2 KB/day.**

**WHO WRITES — measured from the live file's own attributions:** **CC-B 13 · CC-A 10 · CC-C 8 · Infra 1.** All four sessions, per batch, by mandate.

⛔⛔ **AND THE OBLIGATION'S STATED PREMISE WAS FALSE FOR THREE MONTHS.** §10.b (Kyle directive **2026-05-07** — the day after he came online) justifies itself: *"Langston's MEMORY **auto-loads every `claude -p` invocation**; stale MEMORY → wrong baseline at next review."* ⚠️ **My 2026-08-05 broadcast records, on Langston's own three-way verification, that `/home/langston/MEMORY.md` did NOT auto-load and NEVER HAD.** It became true only when CC-A's `@MEMORY.md` import landed hours later the same day. ⇒ **From 2026-05-07 to 2026-08-05, four sessions were mandated to write into a file he could not see unless a dispatch pointed at it — and that is the period in which most of the content was built.** ★ **The premise is TRUE today; it was false while the habit formed.**
⚠️ **AND THIS IS THE SECOND EVAPORATED PREMISE IN THE SAME RULE** — the rule-history doc already records the first: *"§3 step 10.b said repo docs were 'auto-visible to Langston via his GDrive mount.' The mount still exists on his box and is empty."*

⇒ **PUT TO LANGSTON as question 8 of the consultation (2026-09-03 19:20Z), because he is the one being written into:** **(8a)** is the sync still right at all, now that he has TWO other ways to carry context — his own store since 05-07 and `langston-recall` since 08-06 — or is it a rule outliving its premise? **(8b)** if it stays, what does he actually need pushed, given his own header says *"the inbox file in a dispatch OVERRIDES anything here"*? **(8c)** who should own eviction — the closing session (symmetric, but four writers on one file is the collision we keep paying for), a scheduled sweep, or him? **(8d)** should the instruction file and the memory file have *different* maintenance rules, given his `CLAUDE.md` grew +25% with no one-in-one-out while `CONDUCT.md` has one?
⛔ **NOT PRE-JUDGED: rule 24 outcome (2) — §10.b working as designed but its premise changed is a SCOPE DECISION (Kyle's), never a unilateral removal.**

### 2f. ⛔⛔ **KYLE'S RULING: A RULE THAT IS NOT FOLLOWED IS NOT A FIX — THE DESIGN MUST CARRY A MECHANISM** *(2026-09-03)*

> **Kyle, on being shown that his own 2026-07-01 eviction rule is measurably not honoured:** *"So if we have a standing rule for stuff to be deleted and it's not being followed, then that's not the right answer. It's my decision, but I'm saying that **what I decided before in the rule that we put in to fix this is not working. So we have to come up with a solution as a part of the design.** This big design that we're coming up for for Langston — **this needs to be a part of that design.**"*

⇒ ⛔ **THE RULING, OPERATIVE: the *"a CLOSED batch = ONE line"* discipline is NOT to be re-issued, re-worded or re-emphasised. It failed AS A RULE, the failure is measured, and Kyle has declined to fix it with a stronger instruction. `B-LANGSTON-CONTEXT` must deliver a MECHANISM.**
★★ **AND IT GENERALISES BEYOND THIS FILE — it is the clearest statement anyone has given of a principle this project keeps re-learning: RE-ISSUING A SKIPPED RULE IS NOT A REMEDY. Kyle overruling his OWN prior rule on evidence is the strongest possible form of it.**

★ **IT IS ALSO LANGSTON'S OWN PRINCIPLE RETURNING:** *"where possible, prefer **IMPOSSIBLE** over **INTERCEPTED** — a push from it fails at git, not at somebody's memory."* ⇒ **the eviction discipline is the purest intercepted-and-missed case we hold: correct, Kyle-directed, sitting in the header of the very file being written, and skipped by four sessions across ~32 attributed writes.**

**WHAT THE PROJECT'S OWN EVIDENCE SAYS ABOUT WHICH MECHANISMS HOLD:**
| held | failed |
|---|---|
| the invalid `DISABLED://` push URL — **fails at git, not at memory** | prose discipline in a file the actor does not read |
| `guard-bare-commit` — **fires at the moment of the action** | ⛔ **a rule that fires at REPORT time when the failure happens at WORK time** — named in `workflow-10`'s own text |
| the §9.4 disposition line + the step-10 tier ledger — **a FORMAT you cannot leave blank** | |

⭐ **MY RECOMMENDATION, put to Langston 2026-09-03 19:26Z as question 9 — one approach with its weaknesses stated, not a menu: COMPOSE HIS LOADED FILE FROM PARTS INSTEAD OF EDITING ONE MONOLITH.** Sessions stop appending to `MEMORY.md`; each batch writes its own small file, owned by the session that opened it; **what he loads is GENERATED from those parts, and a batch's part is included only while that batch is OPEN.**
⇒ ★★ **EVICTION STOPS BEING AN ACTION ANYONE MUST REMEMBER AND BECOMES A PROPERTY OF THE STRUCTURE. A closed batch does not need deleting — it stops being composed in. Nobody can forget to do a thing nobody has to do.**
★ **AND IT CONVERGES WITH THE UNFINISHED ITEM 2 — which is the strongest argument for it.** Item 2 was *"a lean core plus on-demand rule modules"* for his `CLAUDE.md`. **That is the SAME MOVE — compose the always-loaded artifact from parts rather than maintain one growing file — applied to the other file. One mechanism, both problems**, with Langston's three original conditions still binding.

⚠️ **THE FOUR WEAKNESSES I NAMED MYSELF, and asked him to find more:** **(1)** new machinery on his box, and **a generator that dies leaves him a stale or empty baseline he CANNOT NOTICE, because he is stateless** — it must fail loud and toward last-known-good, never toward empty; **(2)** it changes the write procedure for **all four sessions at once**, and a half-adopted procedure is worse than either end state; **(3)** whatever decides a batch is "OPEN" becomes load-bearing and can itself go stale — the delivery board already drifts; **(4)** ⛔ **the REVIEWER LEDGER and STANDING NOTES do not fit the pattern at all** — not per-batch, append-only by design, **22,545 B = 92% of the cap between them** — and I do not yet have an answer for where they live.

## 3. The Langston memory-FILE trim — a DIFFERENT job, handed to me by Kyle via Old Claude

**Already shipped:** the recall tool (Phase B), two-way Discord images so the sessions can see what Kyle posts, and the crew-status page.

| item | what it is FOR, plainly | state |
|---|---|---|
| **`#946` — Langston's memory file is over its size limit** | Everything in that file is re-read on **every single question we ask him**, so anything stale or bloated is paid for hundreds of times and can give him a wrong baseline. | ⛔ **OPEN and getting WORSE. Measured 49,224 bytes on 29 Aug; I measured 58,177 today — up ~18% in five days, against a 24,576 limit.** ⚠️ **~1,394 bytes of that growth is mine, added this morning** (Kyle's session-freshness ruling, which he needed). Filed under CC-A but Kyle assigned the work to me. |
| **`B-LANGSTON-LEDGER-SPLIT`** (governance queue **2.8**, placed 1 Sep) | His file contains a running ledger of past reviews. ⛔ **CORRECTED — see §3b: the ledger is `11,245 B` measured today, NOT the 34,605 B the plan row asserts. I repeated that figure without deriving it.** Moving it to its own separately-loaded file is the fix. Langston's own words: *"that is a batch, not an edit."* | **PLACED, not started.** Shared with Langston. **This is the piece that actually unblocks `#946`** — trimming around the ledger cannot get under the limit while the ledger is bigger than the limit. |

⭐ **My recommendation on the order: `B-LANGSTON-LEDGER-SPLIT` first.** It is the only one of the two that can succeed on the arithmetic.

---

### 3b. ⭐⭐ WHY HIS FILES GROW — MEASURED FROM THE DATED BACKUPS, and it answers Kyle's question exactly

> **Kyle, 2026-09-03:** *"His memory file used to always remain the same… We've never had to prune it before. So why is it accumulating and growing in size?"*

⛔⛔ **FIRST, TWO CORRECTIONS — BOTH MINE, BOTH FROM REPEATING A FIGURE INSTEAD OF DERIVING IT.**
1. ⛔ **THE REVIEWER LEDGER IS `11,245 B`, NOT `34,605 B`. MEASURED TODAY** by extracting the section between its own heading and the next. **`PHASE_19_PLAN` row 2.8 asserts 34,605 and I repeated it to Kyle and into §3 of this file without re-deriving it.** ⇒ **THE ARGUMENT I BUILT ON IT COLLAPSES: I said *"trimming around the ledger cannot get under the cap because the ledger is bigger than the cap."* At 11,245 B against a 24,576 B cap, THAT IS FALSE — trimming CAN get under, and the ledger split is a structural improvement rather than an arithmetic necessity.** *(`named-not-measured` — and I wrote about that exact failure this same morning.)*
2. ⛔ **IT HAS BEEN PRUNED BEFORE — TWICE, WITH THE ARTIFACTS STILL ON DISK.** Kyle's *"we've never had to prune it"* is not right: `langston_MEMORY_pre-prune-20260728-031116.md` (45,456 B) and `langston-MEMORY.md.pre-prune-20260805-134716` (25,488 B).

✅ **THE GROWTH SERIES, read off dated backup files on the box — not recalled, not estimated:**

| date | bytes | what the file was |
|---|---|---|
| 2026-07-28 03:11 | **45,456** | pre-prune → pruned |
| 2026-08-05 13:12 | 25,570 | pre-`#651`-OBJ2 |
| 2026-08-05 13:47 | 25,488 | pre-prune → **pruned again** |
| ⭐ **2026-08-06 11:18** | **24,528** | `pre-recall-golive` — **the day the recall system went live, and UNDER the 24,576 B cap** |
| 2026-08-28 17:09 | 45,178 | pre-F-G-1 |
| 2026-09-02 10:19 | 51,240 | pre-`B-MEASURE-GATE` leg 2 |
| **2026-09-03 (today)** | **58,177** | live |

⇒ ⛔⛔ **FROM 24,528 B TO 58,177 B IN 28 DAYS — `+33,649 B`, `+137%`, ROUGHLY `+1.2 KB PER DAY`.** ★ **So the honest answer to *"why is it growing"* is not that something broke — it is that it was pruned to exactly the cap on 08-06 and then grew at a steady daily rate with nothing removing anything.**

**THE THREE MECHANISMS, in order of contribution:**
1. ⛔ **EVERY BATCH APPENDS A SECTION AND NOTHING REMOVES IT AT CLOSE.** Step-10's §10.b mandates a sync of his memory in every governance turn — **an APPEND rule whose matching DELETE rule exists but is not honoured — ⛔ CORRECTED in §2e: I asserted there was none.** **Measured today: 8 of 18 sections name an already-CLOSED batch** (`B-REGIME-INPUTS-LIVE` 1,355 B · `B-ALERT-ACTOR-ALLOWLIST` 1,285 · `B-MISTAKES-FILE` 825 · `B-TELEGRAM-DECOMM` 641 · `B-EPOCH-KEYING-PARITY` 417 · `B-MBIM-SWITCH-ON` 305 · `P19-B-PERPFEED` 300 · `B-CONDUCT-FILE` 253) — **≈5.4 KB of finished work still loaded on every question we ask him.** ⚠️ **And `F-G-2` has TWO separate sections (3,266 + 1,350) for one batch.**
2. ⛔ **TWO STRUCTURES ARE APPEND-ONLY BY DESIGN AND CAN NEVER SHRINK.** `STANDING NOTES` **11,300 B** + `REVIEWER LEDGER` **11,245 B** — the ledger's own heading says *"survives every prune"*. **Together 22,545 B = 92% of the entire 24,576 B cap before a single batch note is added.** ⇒ **the cap is arithmetically unreachable while both live in the capped file — which IS the real case for the ledger split, on structure rather than on the wrong number I quoted.**
3. ⚠️ **THE RULES FILE GREW SEPARATELY AND FOR A DIFFERENT REASON: `53,405 B` (2026-07-23) → `54,699` (07-27) → `64,570` (08-28) → `66,994` today — `+25%` in six weeks.** Rules are added and essentially never removed. ★ **`CONDUCT.md` has a ONE-IN-ONE-OUT rule for exactly this; his `CLAUDE.md` has none.**

★★ **SO NOTHING IS MALFUNCTIONING — THE SYSTEM IS DOING WHAT IT WAS TOLD.** We built an append obligation at every batch close, two append-only ledgers, and no eviction rule anywhere. **A prune is therefore not a fix; it resets the clock ~28 days.** ⇒ **the durable fix is an EVICTION rule (a closed batch's section leaves his memory at close) plus moving the two append-only structures out of the capped, always-loaded file.**

## 4. Placed and waiting — my rows in the plan

| where | batch | what it is FOR, plainly |
|---|---|---|
| governance queue **3** | **`B-GDRIVE-UNMOUNT`** (`#757`, `#759`) | Remove a retired Google Drive mount from Langston's server. A wedged mount there **cannot be killed and freezes whatever touches it** — we hit it. Removing the hazard beats detecting it. Needs root, so it is mine. |
| Phase-19 tail | **`B-HELSINKI-MOUNT-DETECT`** (`#921`) | The other half: nothing tells us when that mount wedges. |
| Phase-19 tail | **`B-TOKENWATCH-PAIR-SELECT`** (`#983`) | A freshly-graduated token gets watched through its **dead** pool, because we ask for "the pair" and get the busiest-by-24h-volume one, which is the old one. |
| Phase-19 tail | **`B-TOKENWATCH-OBSERVED-AT`** (`#986`) | Every observation is stamped with the clock time we *started* the batch, not the moment of the reading, so two different readings can share a timestamp. |
| Phase-19 end | **`B-REVIEWER-LOOP-AVAILABILITY`** (`#931`) | Four of our workflow steps require "a fresh reader checks this first" — and in the session those steps govern, **it could not fire**. A rule that cannot run is worse than no rule, because it reads as covered. |
| Phase-19 end | **`B-BURN-THRESHOLDS`** (`#932`) | The spending alarm is set at fractions of the monthly cap while the plan deliberately spends 99.3% of it — so it can only tell us we are spending, never that we are off-plan. |

---

## 5. Open, mine, but with no place in the running order yet

| item | what it is FOR, plainly |
|---|---|
| **`#670`** | The crew-status tool keeps every snapshot forever with no hand-off to cold storage. Slow growth, not urgent — a tidiness debt, not a capacity one. |
| **`#924`** | **Two access keys reach the staging deploy account that nobody governs or rotates.** Security housekeeping. Investigation is mine; the remediation belongs with the security-hardening work. |
| **`#973`** | In the token study, part of how we decide a launch is "interesting" is structurally dead — that limb can never be true, so it silently contributes nothing. |
| **`#989`** | A token can lose 99.8% of its liquidity and the study still counts it **alive**, because "alive" never had a liquidity figure to look at. |

⚠️ **These four are the honest gap: they are named and owned but not placed, which is the exact failure §9.4 exists to stop. Placing them is a decision I would rather take with Kyle than alone.**

---

## 6. Parked by Kyle — not to be picked up without him

- **`B-CREW-STATUS-2` remainder** — parked 26 Aug. The valuable unbuilt piece is recording facts **at the moment they are observed**, because compaction destroys history that cannot be rebuilt later.
- **My onboarding into the crew comms** — Kyle, roughly 1-2 weeks, date open. CC-A's `B-CREW-BOARD-REMOVAL` is gated behind it.

---

## 7. Two things my own memory had WRONG, corrected here

1. ⛔ **My memory said `#651` was "the Langston instruction-file slim, transferred to me, NOT STARTED".** At the ref, **`#651` is CLOSED-AS-BUILT (5 Aug)** and is about something else entirely — his memory file never loading at all. The live Langston-file work is `#946` + `B-LANGSTON-LEDGER-SPLIT`. **The workstream is real; the issue number in my head was not.**
2. ⛔ **My memory listed `#926` (the push-guard defect) among my items.** The plan assigns that row to **CC-B**. I found it; I do not own it.

---

## 8. The board does not show any of this

**Measured today: 77 cards on the delivery board, 5 owned by Infra Claude.** Three of those are **closed** batches still sitting in `Verification`; `B-TOKEN-WATCH` sits in `CI + Deploy` while it is actually at Step 7. ⛔ **Not one of the six placed rows in §3 has a card at all.**
⇒ **So if Kyle looks at the board to see what I am doing, he sees three finished things, one wrongly-placed thing, and none of my queue.** Fixing that is cheap and I will do it once this list is agreed, so the board and this file say the same thing.

---

## 9. ⭐ WHAT I CAN AND CANNOT SEARCH — Kyle asked, and the answer is bigger than he expected

**MEASURED 2026-09-03, not estimated. Kyle guessed *"a hundred to two hundred megabytes"*; it is far more.**

| corpus | size | searchable by me? |
|---|---|---|
| **live session transcripts, ALL sessions** (the `.claude/projects` store) | ⭐ **11 GB across 2,901 files, ~20 project folders** | ✅ **YES**, directly with normal text search |
| **this session alone** | 46.7 MB | ✅ yes |
| **pre-trim BACKUPS still on disk** (`.BACKUP-*`, `.TRIMMED`, `.DISTILLED`) | **24 files**, largest **784 MB**, plus one at 461 MB and two at 311 MB | ✅ **YES — the trimmed-away history was NOT lost**, it is retained beside the live files |
| **Google Drive** (`Dawn Trader` folder) | mounted and readable | ✅ yes |
| **Langston's own transcripts** (Helsinki) | **584 MB, 3,680 files** | ✅ yes, over SSH |
| **the four comms archives** in his recall index | 79,876 records, back to 2026-03-12 | ✅ yes, via `langston-recall` |

⛔ **WHAT I CANNOT SEARCH, stated plainly:**
- **Anything that never reached a file** — a Desktop conversation deleted rather than archived leaves nothing on disk.
- **Reliably by DATE.** File timestamps reflect when a file was *copied or trimmed*, not when the conversation happened — several folders show modification dates long after their content. **Dates must be read from inside the records, never from the filesystem.**
- **Cheaply, at scale.** A content search across the 780 MB files **timed out after ten minutes**. Broad sweeps must be narrowed to a folder or a shard first; this is a real cost, not a formality.
- ⚠️ **AND THE HONEST TRAP: my own earlier sessions are hard to locate**, because I ran from a different folder before 2026-08-26 and a project folder's name is derived from where the session was opened. **An empty result in the folder I expect is NOT evidence the conversation never happened** — it usually means I am looking in the wrong folder. *(This is `wrong-object` waiting to happen, so it is written down.)*

★ **CONCLUSION FOR KYLE: effectively everything is searchable, including what we trimmed away. The constraint is TIME and knowing WHICH folder — not availability.**

---

## 10. ⚠️ STILL OWED — the broader sweep Kyle asked for

He also asked for **"all of the things that we've talked about, discussed, lined up to work on, and just have not gotten back to."**
⛔ **I have answered the Langston-recall question (§2) and swept the LEDGER and the PLAN (§1, §3-§6). I have NOT swept the 11 GB of conversation for older commitments that never reached a document.**
That is a real, bounded job — a folder-by-folder pass with dates extracted from inside the records rather than from file timestamps — and it is the honest next piece of work on this list. **Named here rather than left to read as complete.**
