# CC-A (OLD Claude) — SESSION TASK LIST — plain language, as of 2026-09-03

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
| **`B-JULY-RETENTION-SWEEP`** (plan row 6.9) | **Kyle's directive 09-01:** July's data never moved from hot to warm/cold storage; June needed a slicing script over several nights in early August (the failing July run says mode=sliced and stopped at an offset); July gets the same treatment | **NEXT** |
| OBJ-4 observation window (measurement gate) | the new pre-execution guard earns its keep or is deleted: at least fifty real firings, enumerated, judged by a session that did NOT write it | open; ~1-2 weeks of normal work |
| `#761` | the 30 August comms outage — cause unknown; evidence kept on the Helsinki box | folded into row 5 |
| `#571` `B-WS-SUBSCRIBE-BOUNDARY-CLASS` | the venue price-feed subscribe boundary; obligations #44 #45 #46 (09-02: a 13.8-minute post-restart gap with no alert) | Phase 19, mine |
| `#578` `B-TRADING-ENGINE-REMOVAL` | delete the legacy trading engine that runs in neither paper nor live mode (Kyle-ruled legacy, July) | **own batch, UNPLACED — to be given a row (see §4)** |
| `#582` `B-FINALSCORE-TELEMETRY-RETIRE` | retire the report-only readers of the retired score (the prerequisite for dropping its columns) | **own batch, UNPLACED — to be given a row (see §4)** |
| Langston's `AWAITING KYLE` block | 51 days waiting: should the new guards FAIL OPEN (warn and let the command run) or FAIL CLOSED (block)? plus two standing-rule proposals | to be put to Kyle in three sentences |
| the five event-wait alerts CC-A owns | acknowledged = silenced (#982); restored when the undo command exists | nothing urgent (Kyle 09-02) |
| `#990` (was #986) | GitHub began refusing anonymous downloads from both Hetzner servers; fixed 09-02 with two read-only deploy keys Kyle registered; left for Kyle: delete the stale Replit read/write key | resolved; Replit key = Kyle's click |

**Handed off 09-02:** `#558` A2 → CC-B / Phase 16 (Kyle) · `B-REGIME-INPUTS-LIVE` → CC-B, closed retroactively at `e3328d131`.

## 4. Placement debts — items discussed and NOT yet given a row (to be fixed in the next plan edit)
`B-INSTRUMENTS-OVER-RULES` (in flight, unplaced) · `B-TRADING-ENGINE-REMOVAL` (#578) · `B-FINALSCORE-TELEMETRY-RETIRE` (#582) · the database-catalog / industry-standard governance items Kyle raised (being recovered from the design asks and transcripts — §5 follows).

## 5. Database cataloguing and "governance to industry standard" — RECOVERY IN PROGRESS
*(This section is filled from the design asks, the remediation plan, the ledger and the session transcripts once the recovery finishes; nothing is listed here from memory.)*
