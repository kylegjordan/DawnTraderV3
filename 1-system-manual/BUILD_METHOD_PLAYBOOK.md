# THE BUILD METHOD — a portable playbook for running a multi-agent engineering crew

> **What this is:** how we actually build, described so it can be lifted onto a different project from scratch. The cast, the physical setup, the process, the document set, and — most importantly — **the rules that were learned by getting them wrong**, each with the incident that produced it.
>
> **Why the incidents are included:** a rule without its origin gets optimised away by the next person who finds it inconvenient. A rule with a measured failure attached survives. Every ★ rule below cost something real.
>
> **How to use it:** §9 is the build order. Read §1–§8 first, then stand things up in that order. **Do not build all of it on day one** — §9 says what is load-bearing from the first hour and what can wait.
>
> **★ KEEPING THIS CURRENT (Kyle directive 2026-07-24 — this is a LIVING document).** Update it whenever **the METHOD changes** — a role added or removed, a gate moved, a rule that earned its place, a tool that replaced another, a failure that taught something generalisable. Do **NOT** update it for this project's day-to-day state (that is what the batch catalog, phase history and issue list are for) — a playbook that tracks project state decays into a stale second copy of the rules, which is the exact duplication the one-source principle exists to prevent. **When you add a rule here, add the incident that produced it in the same edit**, or the rule will not survive its first encounter with someone in a hurry.
>
> **Written 2026-07-24 by Claude Analyst (CC-C), from ~5 months of running this on a live algorithmic-trading system.** Project-specific names are replaced with roles; where a concrete detail is the point, it is kept and marked.

---

## 1. THE CORE IDEA

**One human decides. Several AI agents implement. A separate AI agent reviews, and never implements. Everything that matters is written down in a place all of them read.**

The failure this design exists to prevent is not bad code — models write decent code. It is **confident wrongness that nobody catches**: an agent asserts something plausible, acts on it, and the error only surfaces days later wearing a disguise. Every structural choice below is aimed at that.

Three properties do the work:

| Property | What it means | Why |
|---|---|---|
| **Separation of implement and review** | The agent that wrote the code is never the agent that approves it | An author cannot see their own blind spot. This is the single highest-value rule in the document. |
| **Enforcement in tooling, not discipline** | Where possible, make the wrong thing *fail* rather than be *forbidden* | "A practice you have to remember is not a control." Every rule that relied on memory has been broken, most within weeks. |
| **Written provenance** | Every decision records *why*, with evidence, at the moment it is made | Agents lose context. Humans forget. The document is the only thing that persists. |

---

## 2. THE CAST — roles, not personalities

**The human (one, non-negotiable).** Decides scope, architecture, risk tolerance, and anything irreversible. Breaks ties. Is the only one who can waive a rule. **Is not expected to remember anything** — the system's job is to surface things to them, not to wait for them to ask. Treat their memory as a resource to be protected, not relied on.

**Implementation agents (we run 2–3).** Each owns whole pieces of work end to end: scope → build → test → deploy → verify → document. **Each has a stable identity bound to a session ID in a registry file** — not to its role, because roles drift and names must not. An agent that cannot confirm its own identity must ask rather than infer.

**The reviewer (exactly one, and it must be a different agent).** Reads the actual diff. Rules on scope before work starts and on the result before it advances. **Never writes code, never pushes** — and after we found it *could* push, we set its remote to a deliberately invalid value so the rule is enforced by the tool rather than by its good behaviour. Its independence is the product; protect it.

- ★ **Assume the reviewer is stateless between invocations.** Ours is: every message spins a fresh context with no memory of its own prior turns. That is a *feature* (no drift, no accumulated assumption) but it means **any multi-turn context must be carried in the prompt or in a committed file**. Never assume it remembers what it told you an hour ago. If it matters, restate it.
- ★ **Give the reviewer first-class access to the exact code being graded.** Ours spent months reading through a flaky network mount and produced reviews we later found were sometimes of stale files. Now it reads single files straight off the review branch at the *exact* commit under review, and its one local search corpus refreshes from the source *before every read*, refusing to answer if that refresh fails.

**Automated checkers (add these once the process is stable).** A governance checker that fires an alert when a batch lands code but not its documents. A pre-commit guard against known-dangerous command shapes. A backup verifier. **These catch what the humans and agents both miss at 2am**, which is exactly when they miss things.

---

## 3. THE PHYSICAL SETUP

### 3.1 Where the code lives

> **One independent clone per agent, all on ONE shared branch, on fast local disk. The hosted remote is the source of truth.**

- ★ **Independent clones, not shared workspaces or per-agent branches.**
  - *Shared workspace* → agents share one staging area, and one agent's commit silently captures another's in-progress files. We had this happen **in both directions in a single day**.
  - *Per-agent branches* → forces merges, and the failure mode of a stale merge is a **silent revert**: work vanishes and nothing errors.
  - *Independent clones on one branch* → separate staging areas make the capture impossible, and **the remote refuses a push from a clone that is behind**, so staying current is structural rather than remembered. **A rejected push is the system working. Never route around it.**
- ★ **Never put a git repository on cloud-sync storage** (Drive/Dropbox/OneDrive). Git's own FAQ forbids it. We measured it: a repository pushed there reported **SUCCESS while containing no data at all**. The same mount also corrupted our dependency tree (~99% of packages present but zero-byte) and made one commit form segfault deterministically. This cost us months of low-grade weirdness before we diagnosed it.
- ★ **Nothing carries into a fresh clone.** Identity settings, remotes, buffer sizes, untracked local config — all per-clone. Our first clone couldn't commit at all because the identity had only ever been set locally in the old one.

### 3.2 The branch model

**One review branch takes all the work. A separate stable branch is advanced only from it, at the end, once verified.**

- ★ **THE ONE-DIRECTION RULE — flow is one way; nothing ever flows back.** The review branch accepts input from exactly one source (the agents' clones). Everything else — deploy targets, backups, mirrors — **receives and never sends**. The stable branch only ever advances from the review branch.
  - **Why it is a rule and not a habit:** our worst sync incident was a *direction* failure — content existed in one place and not another and nobody could say which way it should have travelled. One declared direction makes "which copy is right?" answerable by looking at the topology.
  - ★ **State the disaster-recovery exception explicitly.** If the source is *confirmed lost*, re-seeding it from a backup is the only reason the backup exists. Write that carve-out down, or an absolute "never send back" will later be cited against the one restore you actually need.
  - **"A copy that can write upstream is not a backup, it is a second author."**

### 3.3 Backups

Two, in different failure domains: one **live and clonable** (a real repository on a server, which self-refreshes from the source and needs nobody's laptop awake), one **off-platform archive** (a single-file bundle somewhere else entirely, surviving the loss of both the host and the server).

- ★★ **VERIFY BY REPRODUCTION, NEVER BY COMPARISON.** Comparing pointers proves the pointers agree and *nothing about whether the data exists*. **That check certified a completely empty backup four times.** A valid check **rebuilds the project out of the backup and matches a known file's content hash against the source.** Cheap checks are fine as pre-filters; they are never the gate.
- ★ **A backup must never be able to block normal work.** We briefly wired backups into the push itself; a dead backup then **blocked ordinary pushes outright**. Backups are separate, self-driven, and asynchronous.
- ★ **When a verifier fails, it must distinguish "the thing is broken" from "I couldn't check."** Ours emitted an all-empty failure line for both, and the two need opposite responses. (Root cause of one such episode: the checker ran as a different user than owned the repository, and the version-control tool silently refused every command.)

### 3.4 The rest

A staging environment that deploys from the review branch. A per-agent identity registry. A scratch area for temporary files that is *not* the project directory.

---

## 4. THE PROCESS — one batch, start to finish

A unit of work ("batch") is not done when the code works. It is done when the objectives are **verifiably true in the running system** and both the implementer and the reviewer say so.

| # | Step | The point |
|---|---|---|
| 1 | **Scope** — numbered objectives + how each will be verified | Written *before* any code. Reviewer approves it. Architectural claims come from reading the dependency map, **not from memory or a quick search**. |
| 2 | **Pre-audit** — read the real files, logs, data, and UI; enumerate blast radius | This is where cascade bugs get caught. Reviewer reads it. |
| 3 | **Implement** — surgical, documented edits; no speculative refactoring | |
| 4 | **Review the actual diff** — at the exact commit, by the reviewer | ★ Be precise about *when*: ours reads at a pushed ref, so "review before push" was literally impossible and the rule contradicted itself for months. **The gate is before it advances to stable, not before it reaches the review branch.** |
| 5 | **Continuous integration green** — every check, on the head commit | ★ **Never push onto a red build.** Check before pushing, not after. |
| 6 | **Deploy to staging** | |
| 7 | **Verify — including the UI, by actually looking at it** | ★ A successful API call, a log line, and a passing query **do not prove the interface renders**. "Working in the backend but not showing on the front end" is a failure state the human cannot detect and will not forgive. |
| 8 | **Independent verification by the reviewer** | |
| 9 | **Iterate** until every objective is green | |
| 10 | **Update every applicable document** — same batch, not later | ★ *"I'll update the docs after it ships"* → deferred governance becomes forgotten governance. ★ **Reorganising a document is not updating its content.** |
| 11 | **Completion report** — objectives with verdict + evidence + the list of documents actually changed | Closed only on the human's acknowledgement. |

★ **A hand-off to the reviewer is not a stopping point.** When told to run autonomously, dispatch → chase → continue through the whole cycle. Saying "I've sent it for review, I'll continue" and then stopping is the most common way these systems quietly stall — we lost an 8-hour stretch to exactly that.

---

## 5. THE DOCUMENT SET

**Tier 1 — every batch, no exceptions:** a batch catalog (one row per batch), a phase/status history, the agent's own working memory, the scope, and the completion report.

### 5.1 ★ THE AGENTS' MEMORY AND SESSION STORAGE — how it actually works, and its two traps

Each agent has a **working-memory file it auto-loads at session start**, plus the harness's own per-project store (conversation transcripts). Both matter, and both have a sharp edge.

- ★ **ONE memory file PER AGENT, plus one shared file for consensus truths.** We started with a single shared file and the concurrent agents **clobbered each other's state**. Split it: each agent reads and writes **only its own**, and may read the others' for visibility. The shared file holds only protocols and settled decisions, edited surgically.
- ★ **Cap each memory file and enforce the cap in bytes, not lines.** Ours hit ~8× its cap by narrating every finished batch in full; dense paragraphs blow a byte budget while looking short. **The discipline: the moment work closes, collapse it to ONE line pointing at the repository record.** Keep only standing rules, identity, the one in-flight item, and things that exist nowhere else.
- ★ **Mirror the memory into the repository.** The live file sits in the harness's private store — outside the project, unversioned, and easy to lose. Copy it into the repo in the same turn you edit it, so it is backed up and reviewable.
- ★★ **TRAP 1 — THE PROJECT STORE IS KEYED TO THE WORKING FOLDER'S PATH.** Change the folder an agent runs from and the harness looks under a *new* key: **it creates an empty store and the agent's memory and history appear to be gone** (the files are safe under the old key — they are simply not where it now looks).
  - **The fix, and it must be done BEFORE the switch:** create a filesystem-level link at the new path pointing at the real store. On Windows a **junction** works and is transparent to every program; the equivalent elsewhere is a symlink. **Do it for every agent you are moving** — we created two of three and only caught the missing one by checking.
  - **Do not attempt to physically rename the store while a session is live** — the running session's own transcript is inside it.
  - **Verify a link by writing a marker through one path and reading it back through the other.** Identical directory listings prove nothing; they look the same whether it is one directory or two copies quietly diverging.
- ★★ **TRAP 3 — EVERY AGENT LOADS THE RULES FROM ITS OWN COPY, SO AGENTS SILENTLY RUN DIFFERENT RULEBOOKS.** With one clone per agent, a rule you land is not binding on anyone else until *their* folder pulls it. Measured here: one agent sat **8 commits behind, running a superseded rulebook**, and nothing surfaced it. **A stale-rules agent throws no error — it quietly obeys the wrong instructions**, which is the worst failure shape there is.
  - **The fix has TWO halves and the first is the one that matters.** *(a)* **Pull the file** — telling an agent to "re-read the rules" when its copy is stale just hands back the stale copy; the instruction is worthless without a current file underneath it. *(b)* **Then tell it** — because whether your refresh runs before or after the harness re-reads the rules may be undocumented, and printing the change makes you correct under either ordering instead of correct if you guessed right.
  - **Ride the event the agents ACTUALLY hit.** Ours re-reads its rules at *context compaction*, not only at a fresh start — and the human rarely restarts the app, so compaction is where nearly all reloads happen. Find your equivalent and hook that, or you will build something technically correct that almost never fires.
  - ★ **Scope the refresh to a NAMED SHORT LIST, not a general pull.** A blanket pull at session start drags in unrelated in-flight work and surprises the agent. Ours is four things: the rules; **the guard scripts themselves** (executed from disk, never in context — a stale guard silently does not fire, which is worse than no guard); the shared issue tracker (stale copies make two agents claim the same issue number); and the rule-narration file.
  - ★★ **NEVER let the refresh overwrite local work — and there are TWO cases, not one.** Uncommitted edits are the obvious one. The one we missed: **work committed locally but not yet pushed.** Our refresh compared against the remote and reverted a local commit's content — **it ate its own improvement.** *"Differs from the remote" is NOT the same question as "is stale": a local commit ahead of the remote is the NEWEST version.* Check both, and say which one you skipped, because the advice differs (one says *commit it*, the other says *push it*).
  - ★ **Instrument it from the first line.** We shipped this control with no logging, so "is it working?" was unanswerable — and that was the very next question asked. **A control that cannot be audited is a rumour.**
  - ★ **Two urgencies, not one.** A routine push needs a quiet one-line notice — no action required, since the version-control system itself refuses a stale push. A push that changes *the rules* needs a loud one demanding an immediate pull and reload. **The asymmetry is the whole point: a stale push gets a loud refusal; stale rules get silence.**
  - ⚠️ **What this does NOT fix, and say so rather than imply otherwise:** there may be **no way to purge already-loaded rules** from a running agent — a reload can *add* the new copy without deleting the old, leaving both present. And **whether an agent actually re-read after being told is not observable from outside.** The honest proxy is "the file was current and the agent was told"; anything stronger is a comfortable fiction.

- ★ **TRAP 2 — TRANSCRIPTS GROW WITHOUT BOUND AND DEGRADE THE SESSION.** Ours reached ~300 MB. Past a few hundred megabytes the interface misbehaves and context overhead climbs. Keep a **trim/dedup procedure** as a named runbook; the session must be closed during any file swap.

**Tier 2 — when applicable, judged explicitly:** the architecture/design manual; a **component dependency map** (for each component: what feeds it, what consumes it, what shared state it touches, what runs it in the background, and the blast radius of changing it); a change/fix registry; a roadmap; an open-issues list; a deleted-components log; a settings/parameter registry.

- ★ **The dependency map is the highest-leverage document in the set.** It is what turns "I think this is only called in two places" into a fact. It is also the one most likely to be skipped.
- ★ **Judge applicability explicitly, then record the judgment.** Skipping a doc silently and skipping it deliberately look identical afterwards. We keep an **exceptions ledger**: any "not applicable" is a row with reasoning, **confirmed by the reviewer, not by the author**. An automated checker keeps the alert open until that row exists. *An agent must never grade its own exemption.*
- ★ **Cap the agents' working-memory files and enforce it.** Ours grew to ~8× its limit by narrating every finished batch in full. The discipline: **the moment work closes, collapse it to one line pointing at the repository record.** Keep in memory only standing rules, the one in-flight item, and things that exist nowhere else.

---

## 6. COMMUNICATION

One channel that all parties read, with the agents able to message each other directly. Ours also carries automated alerts, so a machine-detected problem and a human question arrive in the same place.

- Agents are woken by inbound messages — they do not poll.
- ★ **Name routing:** address an agent by name and only that agent responds. Broadcast when it's for everyone.
- ★ **Reply where you were asked.** An agent woken by a message on the shared channel that answers only in its private console reads, to the human, as *no response at all*. We got this wrong for days.
- ★ **A call-out demands an immediate public answer** — ownership, plan, timing — **even when the fix will take a while.** Responding fast is mandatory; fixing fast is not. An alert must never be left silently active.
- ★ **STAY IN YOUR OWN LANE.** With several agents live, every agent's console filled with running commentary about the *other* agents' work. It buried what the human was actually reading. **Being woken by traffic is fine; reporting it is not.** Handle what isn't yours silently. ("Nothing for me, nothing for you" is still commentary.)
- ★ **Default to pairwise review — owner plus reviewer — and ship.** Everything drifting into a standing four-way debate produced reversals, re-reversals, and idle queues. Escalate to a full panel only for genuinely cross-cutting architecture, risk-envelope questions, or a true deadlock. *Judge before joining: does this need me, or am I adding a lap?*

### 6.1 ★ BUILDING THE FABRIC — the concrete version (added 2026-07-24 at Kyle's request; §6 above was properties only, which is not enough to rebuild from)

**We use Discord. The decisive reason is narrow and worth stating: bots can see each other's messages.** Our previous platform (Telegram) **blocks bot-to-bot delivery at the platform level** — one bot's messages are permanently invisible to another's. That single limitation forced every agent-to-agent exchange through a bolted-on side channel for months. **Check this property before you choose a platform; it is the one that decides the architecture.**

**The pieces, on a small always-on server (not anyone's laptop):**

| Piece | What it does |
|---|---|
| **One channel** | Every party reads it: human, all implementation agents, the reviewer, and automated alerts. One channel, not several — a machine-detected problem and a human question should land in the same place. |
| **Bot app #1 — the implementation agents' voice** | Carries their outbound messages and receives the human's inbound. Posts through a **webhook with a per-agent display name**, so several agents share one bot but appear as distinct identities. |
| **Bot app #2 — the reviewer** | Separate application. Wakes on being named, runs the reviewer's reasoning, posts its reply in-channel itself. |
| **An inbound log** | Every message appended to a single append-only file on the server. **This is the read-tap** — agents tail one file rather than each holding a socket. |
| **A wake watcher, per agent session** | Tails that log; each matching line wakes the agent. Filters by name so only the addressed agent wakes. |
| **A dispatcher command** | One command any agent calls to post, taking its display name and an optional flag that @-mentions the human for a phone push. Keep the transport behind it so the channel can be swapped without touching every caller. |

**Gotchas we hit, each of which cost real work:**

- ★★ **A platform message-length cap will silently eat your longest, most important messages.** Discord caps a message and splits longer posts into several. Our reviewer's engage-gate ran **per piece**, and only the first piece carried his name — so **every piece after the first was discarded before it became work.** Long reviews arrived truncated **with no error on either side.** Fix: reassemble the pieces into one message *before* the gate. **Test with a message longer than the cap on day one**, because normal-length traffic will never reveal this.
- ★ **Cut only at whitespace when you must split.** A file reference or commit id torn mid-token doesn't throw — it points somewhere *plausible but wrong*, which is far worse than an error.
- ★ **Gate the reviewer deterministically, and make replies self-addressing.** Ours engages only when its name **leads** the message (a mention mid-sentence must not wake it), and its replies are auto-prefixed with the *addressee's* name so the wake routing catches them. Derive that prefix from who triggered the turn, not from what the model chose to write.
- ★ **Relay hand-off:** because replies are addressed to whoever triggered them, if you ask the reviewer something **on another agent's behalf**, the answer will be addressed to *you* and the other agent will never wake. Whoever asks owns relaying it. Better: let the agent who owns the work ask directly.
- ★ **The wake watcher is fragile and needs layered re-arming.** Ours dies when the agent's context is compacted. Three layers, all living *outside* the conversation: a session-start hook that re-injects the instruction on start/resume/compaction; the rule written in the auto-loaded rules file; and an hourly scheduled task whose completion itself wakes the session to re-check. **Verify liveness by whether wake events are actually arriving — not by asking the task list, which does not show this kind of task and will always read "absent", causing you to spawn a duplicate that double-wakes.**
- ★ **A circuit-breaker on agent-to-agent turns will strangle real work.** Ours capped the exchange at 6 turns; a normal overnight review is 30–50 and it silently swallowed sign-off requests mid-review. Set any such limit absurdly high — it exists only to bound a runaway loop, not to ration conversation.
- **Optional but cheap:** local speech-to-text on voice messages, so the human can talk to the crew from a phone.

---

## 7. ★★ THE RULES THAT EARN THEIR KEEP

These are the ones I would carry to any project unchanged. Each cost us something.

1. **AN ASSERTED ABSENCE NEEDS EVIDENCE OF PRESENCE.** "It's not there" inferred from an empty or failed search is the single most expensive error class we have. Never silence error output on a lookup — a wrong path then returns *empty*, and empty reads as *absent*. **A failed read must produce a refusal, not a recollection.** We enforce this with a pre-commit guard that blocks the dangerous command shape outright.
2. **AN ABSENCE THAT READS AS A VALID VALUE.** The generalisation of (1), and our most recurrent defect family — **five instances across three agents and five subsystems in one day.** A missing input silently becomes a default; a removed writer leaves a reader returning "false" forever; a guard that can't reach its data fails open and reports nothing. **A control that appears present but never fires is worse than no control, because it manufactures assurance.**
3. **"THAT'S A BUG" IS A HYPOTHESIS, NOT A VERDICT.** Three outcomes, never collapsed: a **real defect** (fix at root); **working as designed but nobody decided what should happen** (that's a scope question for the human, never a unilateral code change); **legacy that no longer fits current intent** (adapt or remove deliberately). The named fear: *"fixing" behaviour that was working perfectly and injecting new bugs we then chase for days.*
4. **INVESTIGATE BEFORE YOU ANNOUNCE — but announce symptoms freely.** A symptom is an observation and costs nothing to be wrong about. **A cause is a claim, and a claim sends people to work.** Before announcing a cause: check its arithmetic against the symptom, read the code, and **read the history and original intent of what you're judging**. On one day, eleven defect claims were announced and retracted across three agents; each pulled others into work that evaporated. *Exception: anything actively causing irreversible loss — announce immediately.*
5. **TRACING FORWARD FROM ONE ENTRY POINT CANNOT DISCOVER A SECOND ENTRY POINT.** Two independent mechanisms ran over the same queue, double-processing everything, **for seven months**, through two audits that both missed it — because path-tracing is satisfied by the *first sufficient explanation* at each step. The fix: at every component, take a **census** — who writes, who reads, who mutates, **who deletes** (highest yield), who schedules work against it. Then, if two things can drive it, check whether they respect each other.
6. **BEFORE DELETING, FIND THE READERS OF WHAT IT WROTE.** "Does anything still call this?" is the wrong question. A removed writer whose reader survives produces **no compile error and no failing test** — every automated check passes while a live dependency silently breaks.
7. **CHECK THE LEDGER BEFORE FILING A FINDING.** Reporting a deliberate, already-approved decision as a defect is worse than reporting nothing: it burns review cycles and impugns correct work. **If a code comment names its own origin — an issue number, a decision — follow it.**
8. **PREFER ROLLING WINDOWS TO SINGLE SNAPSHOTS.** A one-moment sample and the underlying distribution differed by **19 points** in one measurement. Label snapshots as snapshots; decide from windows.
9. **NO PATCHES.** Every fix structural and root-caused. A slow-but-correct start beats an instant one with a race in it.
10. **NEVER LEAVE LEGACY LINGERING.** Decide at the moment of discovery: delete it now (with full blast-radius verification and a log entry), or schedule it to a **named, dated** home. *"We'll get to it"* is not a disposition. Log what you deliberately left, so a later search doesn't read it as a missed sweep.
11. **SURFACE THINGS TO THE HUMAN; DON'T WAIT TO BE ASKED.** They have imperfect memory and that is *your* problem to solve.
12. **PLAIN LANGUAGE TO THE HUMAN, ALWAYS** — cause and effect, no jargon, no file paths, no function names. But **use the system's real names for its real components**; don't paraphrase a proper noun into something vaguer. Define a term once rather than substituting a fuzzier word.

---

## 8. ANTI-PATTERNS WE PAID FOR

| Anti-pattern | What it actually cost |
|---|---|
| Verifying a copy by comparing labels | Certified an empty backup **four times** |
| Believing a rule is followed because it is written | Every memory-dependent rule we have was eventually broken |
| One workspace, several agents | Commits capturing other agents' work, **both directions, same day** |
| A repository on cloud-sync storage | Silent data loss, a corrupted dependency tree, a deterministic crash |
| Deferring documentation to after the ship | Forgotten entirely; reconstructed later at much higher cost |
| Reorganising a doc and calling it updated | A whole batch's architecture change went unrecorded |
| An alert with no owner | Sat active for hours; the human had to notice it themselves |
| Assuming a component has one entry point | Seven months of double-processing, missed by two audits |
| Over-building a solution to a solved problem | Built a 929 MB copy that a 448 MB one already covered, then had to patch the new failure mode it introduced |
| Suppressing error output to keep logs clean | Hid the real reason a command silently did nothing |

---

## 9. ★ BUILD ORDER — what to stand up, in order

**Hour one (before any code is written):**
1. The rules file the agents auto-load, and each agent's working-memory file.
2. Identity registry — every agent knows which one it is.
3. One clone per agent on local disk, all on one shared branch; hosted remote is truth.
4. The reviewer agent, with **implement/review separation from the first commit**.

**Week one:**
5. The batch process (§4) and the Tier-1 document set.
6. Continuous integration, with "never push on red" as a hard rule.
7. The dependency map — start it now; retrofitting it is painful.
8. One shared communication channel; agents woken by it, not polling.

**Once the process is stable — not before:**
9. Backups, both kinds, **with reproduction verification from day one** (a backup you haven't restored from is a rumour).
10. Automated governance checking (documents required per batch, exceptions ledger).
11. Guards against the specific dangerous shapes you have *actually* hit. **Do not pre-build guards for hypothetical failures** — you will guard the wrong thing.

**Never:** a control whose failure is silent. If it can't fail loudly, it isn't a control.

---

## 10. WHAT I WOULD DO DIFFERENTLY

- **Write this document on day one.** These rules were paid for one incident at a time over five months and then reconstructed from scattered files; most of them are generic and could have been adopted for free.
- **Start with reproduction-verified backups.** We ran on a backup that was verified-but-empty and did not know it.
- **Never put the working tree on cloud-sync storage.** Everything about that decision cost more than it saved.
- **Build the dependency map before the system gets big.** Every audit that skipped it missed something.
- **Separate implement from review from the very first commit** — retrofitting independence into a reviewer that has been implementing is much harder than starting that way.
- **Make each agent's identity explicit and permanent immediately.** Inferred identity produces confident misattribution, which is expensive and embarrassing.
