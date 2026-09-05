# CC-A (OLD Claude) — SESSION TASK LIST — plain language, as of 2026-09-05

> ⛔⛔ **KYLE'S STANDING RULE, 2026-09-05: EVERY SESSION KEEPS ITS OWN TASK LIST, AND IT IS UPDATED IN THREE PLACES OR IT IS NOT UPDATED.**
> **WHAT IT HOLDS:** the batches assigned to this session, the sub-batches already identified, the hotfixes, and the findings still to investigate — **in the order they will be worked.**
> **WHEN IT IS UPDATED:** (1) **every time a batch closes**, and (2) **every time a new batch, sub-batch, hotfix or investigation is decided and slotted.**
> **THE THREE PLACES, ALL IN THE SAME TURN:** **this file** → **`PHASE_19_PLAN.md`** (or the active phase plan) → **`POST_AUDIT_ROADMAP.md`** where it is a roadmap-level item.
> ★ **HIS REASON, IN HIS WORDS:** *"we keep losing track of which session is working on which batches, and what order they need to work on those things in. And as we add more things with each of these sessions, we lose track of what else we were working on and when we need to work on these things."*
> ⚠️ **THE PLAN IS THE AUTHORITY; THIS FILE IS THE INDEX.** Every row below is derived from `PHASE_19_PLAN.md` — **if the two disagree, the plan wins and this file is stale.** Re-derive rather than hand-edit the order.

---

## 0. ⭐ THE QUEUE — WHAT I AM WORKING ON, IN ORDER (derived from `PHASE_19_PLAN.md`, 2026-09-05: 29 CC-A rows, **24 open**)

| plan row | item | kind | state |
|---|---|---|---|
| — | **`B-DEPLOY-DRIFT-LINE`** (`#1002`, row 4.55) | batch | ⭐ **NEXT — Kyle: *"slot it after this batch"***. Nothing compares the deployed sha to the branch head |
| 4.57 | **`B-TASK-LIST-SLOT`** (`#1006`) | batch | **NEW, Kyle-directed 2026-09-05.** The close-time half is built (ledger row); the **slot-time trigger does not exist**. Also normalises the four lists — **only mine conforms; CC-C has none** |
| 4.6 | **`B-RULES-LAYER`** (`#998`) | batch | **KYLE-DIRECTED to follow `B-WAKE-QUIET`.** Failure condition pre-registered |
| 1 | `B-RULES-1e` | batch | **IN FLIGHT, parked at Step 2** with Langston |
| 6 | `B-MEASURE-GATE` (legs beyond leg 2) | batch | Step 1 approved, in flight at Step 2 |
| 8 | `B-GOV-REPORTING` | batch | ⛔ **PUSHED, UNREVIEWED — a review gate is owed on work already on the branch** |
| 12.1 | rulings-durability fix (`#671`) | sub-item | **FIRST BREAK** — exempt from the sequencing |
| 12.2 | lookalike register (`#672`) | sub-item | **FIRST BREAK** |
| 4.7 | `B-HEARTBEAT-RESCOPE` (`#999`) | batch | Langston's condition from `#995` |
| 3.5 | `B-INSTRUMENTS-OVER-RULES` | batch | placed 2026-09-02 |
| 4 | `B-REVIEWER-LOOP` (`#758`) | batch | placed 2026-08-28 |
| 5 | `B-CHUNK-ADDRESSING` (`#749`/`#761`) | batch | placed 2026-08-29 |
| 6.5 | `B-STATE-ASSERTION-LINT` | batch | placed 2026-08-31 |
| 6.6 | `B-CLAIM-REDERIVE` | batch | placed 2026-09-02 |
| 7 | `B-EXIT-LATCH-INVESTIGATION` (`#732`) | investigation | placed by Kyle, after `B-MEASURE-GATE` |
| 8.7 | `B-ALERT-WINDOW-EXPIRY` | batch | Langston §13 home |
| 9 | `B-EOL-NORMALISE` (`#751`) | batch | queued |
| 10 | `B-GATE-GUARD` (`#744`) + `B-ISSUE-BLOCK-GUARD` (`#745`) | batch | queued — ⛔ **now also carries `#754`'s three unbuilt checker legs, returned to priority by the `#1005` tripwire hit** |
| 11 | `B-CREW-BOARD-REMOVAL` | batch | ⛔ **GATED ON KYLE** (Infra Claude's onboarding is his call) |
| 11.5 | `B-TRADING-ENGINE-REMOVAL` (`#578`) | batch | held behind the retired-score work |
| 11.6 | `B-FINALSCORE-TELEMETRY-RETIRE` (`#582`) | batch | Langston Step-4 deferral from `#558` |
| 12.3 | `B-DECISION-RECORDS` | batch | after the rules arc's substantive legs |
| 12.4 | `B-CATALOG-1` | batch | after 12.3 |
| 12.5 | `B-CATALOG-2` | batch | after 12.4 |
| 12.6 | decommission residue (rule-18 removal) | batch | after 12.4 |

### ⛔ OPEN LOOPS THAT ARE NOT BATCHES — they have no row and will be lost if they are not listed here
- ⛔ **OWED TO KYLE, 52 DAYS: Langston's `AWAITING KYLE` block** — whether the guards fail-open or fail-CLOSED, plus two standing-rule proposals. **An undecided thing is the one class that cannot be refetched.**
- ⛔ **OWED TO LANGSTON: the alert-verb design (`#982`)** — two questions put to him and unanswered: must a hold leave the back-off untouched, and must it require an existing ack so it can never orphan.
- **`#761`** — the comms outage; evidence kept at `/root/evidence/761/`, **cause still unknown.**
- **Event-wait alerts I own** (`23f004a4`, `f6ae5419`, `c5cf4a87`, `2b0a4688`, `27860643`) — **acked = silenced** (`#982`); Kyle 2026-09-02: nothing urgent, slot them.
- **`#1001`** — raised by me, **owned by CC-C**: staging's deploy gap. Re-measured 2026-09-05 (see below); not mine to close.

### ✅ CLOSED SINCE THIS FILE WAS LAST WRITTEN
- **`B-WAKE-QUIET`** (`#995`, row 4.5) — CLOSED 2026-09-05. Langston confirmed. Spawned rows 4.55, 4.6, 4.7 and `#1005` (this batch skipped its own Step 2).

---


> **Kyle asked for the running list in one place, in words he can read (2026-09-02).** The authoritative ORDER is `PHASE_19_PLAN.md` §governance; this file is that list read from CC-A's seat with each item's PURPOSE in plain language. When the two disagree, the plan wins and this file is corrected. **Nothing here adds a rule: every item is a tool, a format, a removal, or an investigation.** Rows have positions, not dates (§9.4).

## 0. Where Kyle last had the thread, and what happened since
On 30 August we agreed to stop adding rules and give the sessions **tools**. The first tool was the **code search server**: it answers *"does this exist / who calls it / is it reachable"* from the compiler's own map instead of a text search — installed and proven. Cataloguing every surface a session searches showed that most real search mistakes are not in the code but in the **documents**, and that they come in **three shapes**: a search that finds one plausible answer and stops; a read that is not the whole population (the last fifty lines taken as "all of it"); and a silence treated as evidence. **The measurement-gate batch (closed 2026-09-02) built hooks for the second and third shapes.** The first shape, in prose, has no tool — it is what the second reader is for.

## 1. The governance programme — CC-A's rows, in plan order
| # | batch | what it is FOR, plainly | how it helps (tool / format / removal) | state |
|---|---|---|---|---|
| — | **`B-INSTRUMENTS-OVER-RULES`** (the tools-not-rules batch Kyle remembers) | DONE: the code search server; the search habits measured. OPEN: strip a 116-line *"here is how I got this wrong"* comment out of a live source file (a comment says what the code does, not the batch's confession); change WHAT LOADS into a session so it reads the repo-wide rules plus only the rules for the area it touches, instead of everything | a tool + a removal + a loading change | **IN FLIGHT and UNPLACED — no plan row, no catalog row. To be placed (see §4).** |
| 1 | `B-RULES-1e` | measure what actually loads at a session start, then reorder so the important things arrive first | a measurement then a reorder | parked at its audit step until the items Kyle placed ahead of it clear |
| 4 | `B-REVIEWER-LOOP` (#758) | today "a fresh reader checks it before Langston" is a discipline each session must remember; this makes it ONE COMMAND that runs the reader, records the round, and refuses to send a dispatch that skipped it | a tool — **the direct fix for retract-and-re-retract chatter: the correction happens BEFORE anything is announced** | placed 08-28 |
| 5 | `B-CHUNK-ADDRESSING` (#749/#761) | long Discord dispatches get split and lose their addressee; the 30 August comms outage is still unexplained | a fix + an investigation | placed 08-29 |
| 6 → leg 3 | `B-MEASURE-GATE` leg 3 | the rules the new hooks now ENFORCE become one-line pointers in the rules file instead of paragraphs (this REMOVES text), plus two small blind spots the hooks' own records showed on 09-02 (#984 a/b/c) | a removal + two small hook fixes | opens after leg 2's observation window is judged |
| 6.5 | `B-STATE-ASSERTION-LINT` (#978) | a tool that flags sentences in our documents that assert a LIVE value ("Langston runs model X") with nowhere to read it from — one such sentence was wrong for 17 days | a tool | placed 08-31 |
| 6.6 | `B-CLAIM-REDERIVE` (#981) | at the end of a turn, an independent process re-derives any load-bearing number in the session's final message against the actual data — the part the measurement gate cannot do (it sees command results, not claims) | a tool | placed 09-02, after leg 3 |
| 7 | `B-EXIT-LATCH-INVESTIGATION` (#732) | a trading question: are trades that hold past their target a labelling artefact or a real exit defect | an investigation — no fix until understood | placed 08-27 |
| 8 | `B-GOV-REPORTING` | four small things: (iii) the governance ledger has no BLOCKED state, so a correct "blocked" reads as a missed document (the 09-02 false alarm); (iv) the per-turn alert read says "last 50 lines" in four places and must say "whole file" (#980); (v) acknowledging an alert that waits for an event SILENCES it and there is no undo — add the command (#982); (vi) infrastructure work has no change-class that fits it (#985, now CC-B's placed item, tracked here) | three formats + one small command | landed 08-26; (iii)-(vi) open |
| 9 | `B-EOL-NORMALISE` (#751) | 119 files store one line-ending style and check out another, so size checks against the cap read falsely "over" | a one-time clean-up | placed |
| 10 | `B-GATE-GUARD` + `B-ISSUE-BLOCK-GUARD` (#744/#745) | mechanise *"fetch before you compare"* and *"mint issue numbers from your own block"* — **09-02 produced TWO issue-number collisions in one day** | two hooks | placed — **CC-A recommends pulling forward to right after the July sweep** |
| 11 | `B-CREW-BOARD-REMOVAL` | delete the retired crew-board code | a removal | gated on Kyle |

**Same programme, not mine:** 2 `B-CROSS-SESSION-BLEED` (CC-B, closed 09-01) · 2.4 `B-ALERT-ACTOR-ALLOWLIST` (#987, CC-B, in flight) · 3 `B-GDRIVE-UNMOUNT` (Infra Claude) · 7.5 `B-HOOK-ESTATE-VERSION` (CC-C) · #946 Langston's memory-file trim (Infra Claude).

## 2. What the programme has ALREADY shipped against Kyle's diagnosis
Kyle's diagnosis (08-20 → 08-31): every step burns time on sessions announcing mistakes, retracting, then retracting the retraction — in chat — and rules against it do not stop it because rules fire at ANNOUNCE time while the mistake happens at MEASURE time.
| shipped | what it stops |
|---|---|
| self-correction is ONE LINE plus a trailer on the commit; the reasoning goes in the commit or the issue, never in Kyle's chat (`CONDUCT.md` §7) | paragraph-long retractions in chat |
| silence is the default; one fixed report format per step with a `#` header (`CONDUCT.md` §5-6) | narration of every wake and every Langston round-trip |
| "review against the OBJECT, not your memory" + a fresh reader before anything goes to Langston (`CONDUCT.md` §6b; the step skills; Kyle's standing approval 08-27/08-31) | the announce-then-retract cycle — corrected in a reader round nobody narrates |
| the mistake-pattern index + weekly pass, top pattern promoted to `CONDUCT.md` §13 | the same mistake re-learned by every session |
| the code search server (surface 1 of the search catalogue) | "does this exist" answered from a text search |
| **hooks that fire at MEASURE time** — bad measurement shapes, stale fetch, uncited CI, result-vs-request, the whole-file alert read, the hook self-test (`B-MEASURE-GATE` leg 2, closed 09-02) | the "right name, wrong thing" class — 44 % of one week's recorded mistakes; a live window now measures whether the guards are useful |
| the always-loaded rules slimmed; step detail moved into eleven step-skills | rules paid for on every compaction that fire once |

## 3. Outside the governance programme — CC-A's other open items
| item | what it is, plainly | state |
|---|---|---|
| **`B-JULY-RETENTION-SWEEP`** (plan row 6.9) | **Kyle's directive 09-01.** Reviewed 09-02: **nothing to sweep** — the overnight archive job finished July by itself on its second attempt (31 daily pieces stored and verified, the fast-storage copy released). June was the same job run by hand once, in 35 minutes, not a multi-night script. The upload step still has no automatic retry; the decision not to build one (from August the biggest table moves in small daily pieces that never hit the failing path) stands and is now written in the issues ledger (#991) instead of only on a board card | **DONE — closed as a review** |
| OBJ-4 observation window (measurement gate) | the new pre-execution guard earns its keep or is deleted: at least fifty real firings, enumerated, judged by a session that did NOT write it | open; ~1-2 weeks of normal work |
| `#761` | the 30 August comms outage — cause unknown; evidence kept on the Helsinki box | folded into row 5 |
| `#571` `B-WS-SUBSCRIBE-BOUNDARY-CLASS` | the venue price-feed subscribe boundary; obligations #44 #45 #46 (09-02: a 13.8-minute post-restart gap with no alert) | Phase 19, mine |
| `#578` `B-TRADING-ENGINE-REMOVAL` | delete the legacy trading engine that runs in neither paper nor live mode (Kyle-ruled legacy, July) | **own batch, UNPLACED — to be given a row (see §4)** |
| `#582` `B-FINALSCORE-TELEMETRY-RETIRE` | retire the report-only readers of the retired score (the prerequisite for dropping its columns) | **own batch, UNPLACED — to be given a row (see §4)** |
| Langston's `AWAITING KYLE` block | 51 days waiting: should the new guards FAIL OPEN (warn and let the command run) or FAIL CLOSED (block)? plus two standing-rule proposals | to be put to Kyle in three sentences |
| the five event-wait alerts CC-A owns | acknowledged = silenced (#982); restored when the undo command exists | nothing urgent (Kyle 09-02) |
| `#990` (was #986) | GitHub began refusing anonymous downloads from both Hetzner servers; fixed 09-02 with two read-only deploy keys Kyle registered; left for Kyle: delete the stale Replit read/write key | resolved; Replit key = Kyle's click |

**Handed off 09-02:** `#558` A2 → CC-B / Phase 16 (Kyle) · `B-REGIME-INPUTS-LIVE` → CC-B, closed retroactively at `e3328d131`.

## 4. Placement debts
**Cleared 2026-09-02 (`ce8d25c68`):** `B-INSTRUMENTS-OVER-RULES` is plan row 3.5 · `B-TRADING-ENGINE-REMOVAL` (#578) is row 11.5 · `B-FINALSCORE-TELEMETRY-RETIRE` (#582) is row 11.6.
**Cleared 2026-09-03 (second pass):** every §5 catalogue item now has a numbered row — governance queue **12.1-12.6**. Also placed today: **4.5 `B-WAKE-QUIET`** (#995, the running-commentary fix) and **6.95 `B-ROUTINE-REHOME`** (#739, the dead daily check). **No placement debts remain.** Former text: They sit under the arc's one tracked row (`PHASE_19_PLAN` GOV-ARC #668) as a list, not as positioned rows — which is exactly the "named but not placed" failure §9.4 forbids. Next plan edit gives each a numbered row in the governance queue.

## 5. Database cataloguing and "governance to industry standard" — RECOVERED 2026-09-02
*Recovered from Kyle's voice notes (30-31 July, 7 August), the two design asks (`B_CATALOG_WHAT_WE_DO_NOT_DOCUMENT_r1.md`, `B_GOVERNANCE_REMEDIATION_PLAN_r1.md`), `RUNNING_ISSUES` #668/#671/#672/#601, `STORAGE_POLICY.md`, `PHASE_19_PLAN.md` and 103 transcript hits (17 June → 2 September). Nothing here is from memory.*

**What Kyle asked for, in his words.** 30 July: *"do we have a catalog of all of our database tables and what they're used for, what they're capturing… what system they are part of? This is something that is done as an industry standard."* 31 July: *"is there other documentation that we should be doing for our system that is industry standard that we're not doing?"* 7 August: *"we need to standardize our governance system according to industry standards… make sure that each of those have cards as well as… are in the issues file, in the road map, in the phase nineteen plan."*

### 5a. Items that already have a name and an issue number
| item | what it is FOR, plainly | state | home |
|---|---|---|---|
| **`B-CATALOG-1` — the table catalogue** (#672) | one generated page listing every table the database actually holds (read from the database itself, not from our code's idea of it), what each is for, which part of the system owns it, and which tool truly reads it. A nightly comparison fails the build if a table appears without a row, so the page cannot go stale | Langston said "proceed to scope" on 31 July; **never scoped** — no scope file, no catalog row; card sits in Backlog | in the GOV-ARC row as a name; **unplaced** in the queue |
| **the lookalike register** (part of #672) | one page of the pairs that have already caused wrong calls — a working table next to its archive copy, a shadow table next to the real one, a snapshot next to the typed columns, one log file next to another — with the one test that tells them apart | Langston: it should land "at the first break", not queue behind anything; **not built** | none of its own; **unplaced** |
| **`B-DECISION-RECORDS`** (#671) | two registers: a Decision Register (Kyle's decisions, verbatim, with date and context) and a Retraction Register (claims we made and later overturned by measurement). Harvested from the git history and the batch reports, each marked whether it was written at the time or reconstructed after | issue open, card in Backlog, **not started** | GOV-ARC row; **unplaced** |
| **the rulings-durability fix** (separable half of #671) | Langston's ~3,000 Discord rulings sit in ONE 19 MB file on ONE server outside git. Copy it to a read-only replica; "done" means a restore has been rehearsed once | flagged "first break" on 7 August; **no evidence it has landed** | **unplaced** — recommend pulling it to the front: it is small and the loss is irreversible |
| **`B-STORAGE-CATALOG`** (Kyle, 28 July: *"catalog everything that we're storing and where it can be found… a canonical document referenced in our system manual"*) | (1) a catalogue of every store — tables and non-table stores — in `STORAGE_POLICY.md`; (2) fix the trade record that was being hard-deleted with no archive; (3) cross-reference the reference documents from the System Manual and the System Impact Map | (1) and (3) DONE 28 July; (2) became `B-TRADE-TIER-REGISTER` (#599, closed 6 August) plus a retention leg in Backlog. **Never formally closed: no board card, no catalog row** | needs a one-line close in `BATCH_CATALOG` + card |
| **#601 — a retention decision per non-table store** | the app-local log folders (~6 GB), the trailing-state file and similar have no tier and no window; each needs a "keep how long, at what tier" decision | OPEN | homed to "`B-STORAGE-CATALOG` part (1) remainder" — a batch with no card; **unplaced** |
| **the governance tier list refresh** (rode `B-RULES-1d`) | make the tier lists match what the checker actually enforces; includes a CONTENT refresh of `STORAGE_POLICY.md` | 1d closed 25 August; **the storage-policy content refresh is not separately verified** — #668 warns it "is easy to mark done by mistake" | verify at the next `STORAGE_POLICY` touch |
| **GOV-ARC #668 — the arc's status home** | the one place that says where the whole programme stands | last updated 7 August — **stale by four closes** (1c, 1d, leg 2, `B-CLAUDEMD-SLIM`) | refresh in the next governance edit |

### 5b. Discussed, agreed useful, and never given a name or a home
| item | what it is FOR, plainly | Kyle's words / where it was discussed |
|---|---|---|
| **glossary of terms** | one page defining our component names, so a new session (or Kyle) can look a term up instead of guessing; it does NOT replace the canonical-terms rule, it backs it | 31 July: *"the glossary of terms or the dictionary of terms. We need to make sure that we are adding in."* Judged justified in the pre-scope; dropped when the remediation plan rejected it as a rule-enforcement home. **Not the same thing** — the reference page was never rejected |
| **`B-CATALOG-2` family** — the next five catalogues | (a) every log stream and how far back it reaches; (b) a **diagnostic-coverage map** — where we have diagnostics and where we are blind; (c) a census of every scheduled job and timer; (d) a catalogue of every configuration knob; (e) the ORM-vs-database drift check — 54 live tables have no definition in our code | Kyle on (b): *"where we have diagnostics and where we don't. I don't know."* Remediation plan §3.5 said "homed, not scoped" — but no issue or row exists |
| **decommission residue** | 9 leftover tables from a retired subsystem (139 MB), plus `*_backup_20251023` and `*_user_archive` tables; and 49 tables no document mentions at all — each needs the rule-18 call: delete now or schedule the deletion | catalog ask §1; only the partitioning half is in `RUNNING_ISSUES` (line ~642) |
| **three process additions from the remediation plan §4** | (i) every rules-file edit goes through a Step-4 review — no mid-batch appends; (ii) a regression test for every rule converted into a hook; (iii) measure whether an app-version change alters what loads | no record anywhere. ⚠️ (i) is a RULE — per Kyle's "no space for rules", it belongs as a hook or not at all; (ii) is a format the measurement-gate batch already followed and should be written down once as the standard; (iii) is a measurement |

**Deliberately CUT (so nobody revives them):** reshaping our existing documents into arc42 / C4 form; a written set of "quality targets". Recorded in the remediation plan §3.5.

### 5c. The order — Langston PROCEED 2026-09-02 with the `B-RULES-1e` gate LIFTED (circular: 1e is optional and parked behind these very items); written into `PHASE_19_PLAN` as governance-queue rows 12.1-12.6
*(Corrected after a fresh read against the ref, 2026-09-02: Kyle's recorded order is rules file → decision history → catalogues (remediation plan line 170) and nothing at the ref reverses it; the lookalike register is ruled NOT to queue behind the catalogue (#672 HOME); the ORM-vs-database drift check ships with `B-CATALOG-1`, not `-2` (plan line 162); the trailing-state file already has its own placed home, `B-TEC-STATE-DURABILITY` (#678), so only #601's log-folder remainder folds into the catalogue. Everything from item 3 on is ledger-sequenced BEHIND `B-RULES-1e` (queue row 1, in flight) unless that is lifted.)*
1. **rulings-durability fix** — first break, exempt from the sequencing (small; the loss is irreversible) · 2. **the lookalike register** — also first break, by Langston's ruling · 3. **`B-DECISION-RECORDS`** (#671) — Kyle's order puts decision history before catalogues · 4. **`B-CATALOG-1`** (#672) — scope it with the ORM-vs-database drift check and the glossary page inside it; close `B-STORAGE-CATALOG` on paper at the same time and fold #601's log-folder remainder in (the trailing-state file stays with #678) · 5. **`B-CATALOG-2` family** — one catalogue per small batch, the diagnostic-coverage map first · 6. **decommission residue** — a rule-18 removal batch after the catalogue names what is dead.
