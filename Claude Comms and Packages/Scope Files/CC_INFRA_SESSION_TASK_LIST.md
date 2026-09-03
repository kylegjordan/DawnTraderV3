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

## 3. The Langston memory-FILE trim — a DIFFERENT job, handed to me by Kyle via Old Claude

**Already shipped:** the recall tool (Phase B), two-way Discord images so the sessions can see what Kyle posts, and the crew-status page.

| item | what it is FOR, plainly | state |
|---|---|---|
| **`#946` — Langston's memory file is over its size limit** | Everything in that file is re-read on **every single question we ask him**, so anything stale or bloated is paid for hundreds of times and can give him a wrong baseline. | ⛔ **OPEN and getting WORSE. Measured 49,224 bytes on 29 Aug; I measured 58,177 today — up ~18% in five days, against a 24,576 limit.** ⚠️ **~1,394 bytes of that growth is mine, added this morning** (Kyle's session-freshness ruling, which he needed). Filed under CC-A but Kyle assigned the work to me. |
| **`B-LANGSTON-LEDGER-SPLIT`** (governance queue **2.8**, placed 1 Sep) | His file contains a running ledger of past reviews. **That ledger alone is 34,605 bytes — larger than the whole file is allowed to be.** Moving it to its own separately-loaded file is the fix. Langston's own words: *"that is a batch, not an edit."* | **PLACED, not started.** Shared with Langston. **This is the piece that actually unblocks `#946`** — trimming around the ledger cannot get under the limit while the ledger is bigger than the limit. |

⭐ **My recommendation on the order: `B-LANGSTON-LEDGER-SPLIT` first.** It is the only one of the two that can succeed on the arithmetic.

---

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
