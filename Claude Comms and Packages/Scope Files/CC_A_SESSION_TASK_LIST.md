# CC-A (OLD Claude) — SESSION TASK LIST, as of 2026-09-02 evening

> Kyle asked for the running list in one place (2026-09-02). **The authoritative ORDER is `PHASE_19_PLAN.md` §governance (rows 1-12); this file is the same list read from CC-A's seat, with what each item is FOR in plain language, what it fixes, and what is outside the queue.** When the two disagree, the plan wins and this file is corrected.

## A. The governance programme — what it is trying to fix, and where we are

**Kyle's diagnosis (2026-08-20 → 08-31):** every step of every batch burns time and tokens on sessions announcing mistakes, retracting them, then retracting the retraction — in chat, endlessly — and the rules written against it do not stop it because they fire at ANNOUNCE time while the mistake happens at MEASURE time. **The fix is not more rules; it is mechanisms** (hooks, formats, a second reader), plus a small set of behavioural rules that arrive before a session acts.

**Already shipped (the parts of the fix that exist today):**
| what | where | what it stops |
|---|---|---|
| Self-correction is ONE LINE + a `MISTAKE:` trailer on the commit; the reasoning goes in the commit or the issue, never in Kyle's chat | `CONDUCT.md` §7 (B-CONDUCT-FILE, 08-20) | the paragraph-long retractions in chat |
| Silence is the default; report only at a step boundary, in one fixed format with a `#` header | `CONDUCT.md` §5, §6 | the running narration of every wake and every Langston round-trip |
| "Review your own work against the OBJECT, not your memory" + the fresh-reader loop before anything goes to Langston | `CONDUCT.md` §6b; `workflow-02/-04/-07/-11`; Kyle's standing approval 08-27/08-31 | the announce-then-retract cycle: the correction happens BEFORE the announcement, in a reader round nobody narrates |
| `MISTAKE_PATTERNS.md` index + weekly pass; the top pattern promoted to `CONDUCT.md` §13 | B-MISTAKES-FILE, B-CLAUDEMD-SLIM | the same mistake re-learned by every session |
| **Hooks that fire at MEASURE time** — bad measurement shapes, stale fetch, uncited CI, result-vs-request, the whole-file alert read, the hook self-test | **B-MEASURE-GATE leg 2 — CLOSED 2026-09-02** | the "right name, wrong thing" class (44 % of one week's recorded mistakes) — the OBJ-4 live window now measures whether the guards are useful |
| Always-loaded instruction files slimmed; step detail moved into eleven step-skills | B-CLAUDEMD-SLIM, B-RULES-1a/1b | rules paid for on every compaction that fire once |

**Still to do in the programme — CC-A's rows, in plan order:**
| row | batch | what it is FOR (plain) | state |
|---|---|---|---|
| 1 | `B-RULES-1e` | the ORDER the instruction files load in — observe what loads before restructuring it | parked at its own Step 2 (pre-audit approved with conditions); resume after the items below that Kyle placed ahead of it |
| 4 | `B-REVIEWER-LOOP` (#758) | turn the fresh-reader loop from a discipline into a TOOL — one command that spawns the reader, records the round, and refuses a dispatch that skipped it | placed 08-28 |
| 5 | `B-CHUNK-ADDRESSING` (#749/#761) | long Discord dispatches split and lose their addressee; the comms outage of 08-30 is unexplained (#761) | placed 08-29 |
| 6 → leg 3 | `B-MEASURE-GATE` leg 3 | the `CLAUDE.md` rule-29 conversion sweep (the prose rules the hooks now enforce get pointers, not paragraphs) + #984 (a guard's own record field shape) + #984 (b)(c) (two commit forms the completion-report guard cannot see) | opens after leg 2's window is adjudicated |
| 6.5 | `B-STATE-ASSERTION-LINT` (#978) | a sentence that was TRUE WHEN WRITTEN and is wrong now — asserted live values with no read-site (the "Langston's model" line was wrong for 17 days) | placed 08-31 |
| 6.6 | `B-CLAIM-REDERIVE` (#981) | the agent that re-derives a CLAIM against the object at the end of a turn — the piece OBJ-6d could not be | placed 09-02, after leg 3 |
| 7 | `B-EXIT-LATCH-INVESTIGATION` (#732) | an INVESTIGATION, not a fix: are the hold-past-target trades a labelling artefact or a live exit defect | placed 08-27 |
| 8 | `B-GOV-REPORTING` | the reporting rules + the tier-ledger matrix's missing BLOCKED state (i-iii) · #980 the per-turn alert read is specified as a `tail` in four homes (iv) · #982 ack silences an event-wait alert and there is no `unack` verb (v) · #985 no change-class fits infrastructure work — CC-B's placed item now, tracked here (vi) | landed 08-26; items (iii)-(vi) open |
| 9 | `B-EOL-NORMALISE` (#751) | 119 files store CRLF; byte-cap checks on a working tree read falsely "over cap" | placed |
| 10 | `B-GATE-GUARD` + `B-ISSUE-BLOCK-GUARD` (#744/#745) | mechanise the sync gate and the issue-number blocks — **today produced TWO number collisions (#983, #986) in one day; this is the item that stops them** | placed — **recommend pulling forward** |
| 11 | `B-CREW-BOARD-REMOVAL` | delete the retired crew-board code | gated on Kyle |

**Not mine but in the same programme:** 2 `B-CROSS-SESSION-BLEED` (CC-B, closed 09-01) · 2.4 `B-ALERT-ACTOR-ALLOWLIST` (#987, CC-B, in flight) · 3 `B-GDRIVE-UNMOUNT` (Infra Claude) · 7.5 `B-HOOK-ESTATE-VERSION` (CC-C) · #946 Langston's memory trim (Infra Claude).

## B. Outside the governance programme — CC-A's other open items
| item | what it is | state |
|---|---|---|
| **`B-JULY-RETENTION-SWEEP`** (plan row 6.9) | **Kyle's directive 09-01:** July's hot→warm/cold storage move failed; June was done in early August with a slicing script (mode=sliced; the failing run 504'd at offset 182452224); July needs the same treatment, possibly over several nights | **NEXT after this list is agreed** — the only item Kyle placed by name this week |
| OBJ-4 live window (B-MEASURE-GATE) | ≥50 real guard fires, enumerated, adjudicated by a NON-author session; too few → the guard is deleted | opens now; ~1-2 weeks of normal work to accumulate |
| `#761` | the 08-30 comms outage — cause still unknown; evidence at `/root/evidence/761/` | folded into row 5 |
| `#571` `B-WS-SUBSCRIBE-BOUNDARY-CLASS` | the venue-feed subscribe boundary; obligations #44 #45 #46 (today: a 13.8-min post-restart gap with no alert) | Phase 19, mine |
| `#578` `B-TRADING-ENGINE-REMOVAL` | delete the legacy `TradingEngine` that runs in neither mode (Kyle-ruled legacy) | own batch, unplaced in the queue — needs a row |
| `#582` `B-FINALSCORE-TELEMETRY-RETIRE` | retire the report-only readers of the retired score (prerequisite for the Phase-B drop) | own batch, unplaced — needs a row |
| Langston's `AWAITING KYLE` block (fail-open vs fail-closed for the guards + two standing-rule proposals) | **51 days waiting on Kyle** — an undecided thing is the one class that cannot be refetched | owed to Kyle as a decision; will be re-presented in one short message |
| the five event-wait alerts I own (#602 verify, VC-2, retention knob, #605 pin proof, Wave C tiering) | acked = silenced (#982); restored by the `unack` verb when row 8 (v) lands | nothing urgent (Kyle 09-02) |
| **Replit deploy key** (`replit-dawntrader`, read/write, added 2026-03-22) | no private half exists on any of our machines; Replit frozen since 03-30 | **safe for Kyle to delete** |

**Handed off today:** `#558` A2 (retired-score cleanup) → CC-B / Phase 16 (Kyle) · `B-REGIME-INPUTS-LIVE` → CC-B, closed retroactively at `e3328d131`.

## C. What the list is NOT
It is not a schedule. Rows have positions, not dates (§9.4). Nothing here is "due"; the next item starts when the one before it closes, and Kyle re-orders by saying so.
