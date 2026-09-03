# B-WAKE-QUIET — SCOPE (Step 1)

change-class: non_architecture

> **Owner CC-A · issue `#995` · plan `PHASE_19_PLAN.md` governance queue row 4.5 · parent `#694` piece (2).**
> ⚠️ **CLASS NOTE, stated rather than left to the checker:** this batch touches comms/session tooling only — the wake filter, the Helsinki push-notice script, the hourly heartbeat task. **No trading-path file, no schema, no formula.** `#985` records that infrastructure work has no change-class that fits it; `non_architecture` is declared here for the same reason `B-MEASURE-GATE` leg 2 was, and the diff is the evidence.

---

## 0. WHAT THIS BATCH IS FOR, IN ONE PARAGRAPH
Kyle cannot use his own system because the sessions narrate it to him. He raised it again on 2026-09-03 about Analyst Claude specifically. **Measured, it is not one session and not a changed setting: all three answer ~97% of automatic wakes with text, which `CONDUCT.md` §5 forbids in terms.** This batch does not add a rule — the rule exists and is auto-loaded in every session on every start. It changes **what arrives** and **what the session is told at the moment it arrives**, and then **re-measures the same rate** so the batch can be judged rather than believed.

## 1. THE MEASUREMENT THIS BATCH IS BUILT ON (do not re-derive; `#995` holds the full record)
Object: the last 12 MB of each session's largest transcript. Turn model: a user entry opens a turn, every assistant entry until the next user entry belongs to it, "spoke" = any assistant text in the turn.

| session | genuine wakes | spoke | real Kyle prompts | chars to Kyle from wakes |
|---|---|---|---|---|
| CC-C ANALYST | 73 | 71 (97%) | 7 | 48,384 |
| CC-B NEW | 44 | 43 (97%) | 37 | 16,033 |
| CC-A OLD | 94 | 93 (98%) | 25 | 64,131 |

**CC-C reads worst to Kyle on ratio (≈10 automatic wakes per real exchange); CC-A is worst on volume.** Wake mix for CC-C's 73: Langston 16 · alert-owner routings 14 · escalated push notice 21 · heartbeat 14 · crew posts 8 · **routine push notice 0** (piece (1) works).
⚠️ **Two denominator corrections are recorded on `#995`** (a first instrument attributed later text to a wake; the second pooled the session's own background-command completions and compaction summaries). **Use 73/7, not 83/13.**

## 2. MANDATORY 1.a — ARCHITECTURAL READ
- **`SYSTEM_IMPACT_MAP.md` "Discord Comms Fabric (Hetzner Helsinki)"** (added B-DISCORD 2026-06-20) — the two bridges, `cc-send`, the switch file, the inbox log. **Every object this batch edits except the heartbeat task is described there.**
- **`SYSTEM_IMPACT_MAP.md` "Claude Code Hook Layer (laptop sessions, NOT the app)"** (added B-MEASURE-GATE leg 2) — `fresh-rules.mjs` and `load-conduct.mjs` live here. **OBJ-1 already changed `fresh-rules.mjs`; the SIM entry needs its content update at Step 10.**
- **Upstream/downstream:** the filter is the ONLY consumer of the three Helsinki log tails; the notice script is a cron producer with no consumer but the filter; the heartbeat is a scheduled task producing into the same channel. **Blast radius is the four laptop sessions' wake behaviour and nothing server-side.** ⛔ **Shared state: the filter file is ONE file used by all four sessions, and a running watcher holds the code it loaded AT ARM TIME — so a filter edit does not take effect until each session re-arms.**

## 3. MANDATORY 1.b — PROVENANCE READ (original intent, then the disposition)
| thing | built when / by | ORIGINAL INTENT, from the introducing commit | disposition |
|---|---|---|---|
| `cc-wake-filter.py` + name routing | 2026-06-12, `241b257ce` / `803ade41b` / `5c400e197`, Kyle directive | *"wake CC on Kyle msgs + Langston alert completions + explicit summon channel"* — sessions could not be reached without Kyle prompting them | **(1) still relevant and correct.** The wake mechanism is doing its job; what is missing is what the session does after it. |
| the escalated push notice | 2026-07-24, `031cf2688` | *"a stale push gets a loud refusal from git, while stale rules get silence"* — the asymmetry IS the point | **(2) relevant, needed updating.** Narrowed by OBJ-1/2/3; the asymmetry is preserved and is now applied only to files that are actually rules. |
| `load-conduct.mjs` | 2026-08-20, `9d4832359` (B-CONDUCT-FILE) | put the behavioural rules where they arrive BEFORE the session acts, instead of below 100 KB of `CLAUDE.md` | **(2) relevant, needed updating** — it read the local copy with nothing refreshing it. OBJ-1 fixed the refresh side. |
| the hourly heartbeat task | Kyle 2026-07-13 (`CLAUDE.md` §6.9 "three reliability layers") | close the **mid-session idle-death gap**: a watcher can die silently and the session cannot tell, because a dead watcher delivers no wakes AND no error | **(2) relevant, needs updating.** The dead-man property is real and stays; it is only its unconditional hourly firing that is redundant. |
| `#694` piece (2) | 2026-08-18, Kyle-directed | *"a wake that is not addressed to me and not mine gets NO output at all"* — ruled **"a RULES fix not a filter fix"** | **(2) relevant, needs updating in light of new evidence** — the rule shipped and the rate is 97%. This batch supplies the mechanism piece (4) of `#694` demands, and does NOT restate the rule. |

## 4. DOES IT ALREADY EXIST / WAS IT ALREADY DECIDED (§9.5(b-ii))
- ✅ **Kyle's 2026-09-03 idea — *"it only reacts or comments if it has valuable input that could correct a mistake about to be made, or details the others do not have"* — ALREADY EXISTS VERBATIM as `CONDUCT.md` §5 exception (c), which he wrote on 2026-08-23.** ⛔ **NOT restated anywhere in this batch.** Kyle's own fallback applies: *"if it's not gonna work the way I've suggested, then we just leave it alone."*
- ⛔ **`#694` REFUSES blanket heartbeat suppression** — *"the dead-man proof… its cost is COMMENTARY, not the wake."* **OBJ-6 is CONDITIONAL suppression and must be argued as such, not as re-litigation.**
- ⛔ **The escalated notice waking mid-task is DELIBERATE** (`CLAUDE.md` §7.1) and is preserved.
- ★ **`#694`'s other pieces are effectively discharged elsewhere** — (3) the summary format is `CONDUCT.md` §6; (4) the mistakes file is `MISTAKE_PATTERNS.md` + the weekly pass; (5) the audit/plan merge is the renamed Step 2. **This batch is the last live piece of `#694`.**

## 5. OBJECTIVES — r3, AND THE HEADLINE IS A NEGATIVE RESULT
> ⛔⛔ **r3, 2026-09-03. A SECOND FRESH READER STRUCK BOTH OBJECTIVES r2 HAD REBUILT. I AM NOT REBUILDING THEM A THIRD TIME — I AM STRIKING THEM, AND THE STRIKE IS THIS BATCH'S MOST VALUABLE OUTPUT.**
> ★★ **WHAT IS NOW ESTABLISHED, AND IT REFRAMES THE WHOLE PROBLEM: AN INSTRUCTION DOES NOT MOVE THIS BEHAVIOUR AT ANY DISTANCE. ONLY NOT DELIVERING THE WAKE MOVES IT.**
> **RE-DERIVED INDEPENDENTLY OF THE READER (whole files, three transcripts, turn model as §1) — the heartbeat body has carried three imperatives since 2026-07-22, which IS the "instruction at the event" design, already installed and running for six weeks:**
>
> | | n | complied | rate |
> |---|---|---|---|
> | body delivered *"re-arm only if dead"* → session touched the filter | **574** | **2** | **0.3%** |
> | body delivered *"sweep the Discord inbox"* → session read the inbox | **352** | **41** | **11.6%** |
> | same 734 heartbeat turns → produced assistant TEXT | 734 | **636** | **86%** |
>
> **Positive control: the same parser finds the compliance it can detect (filter touched 2, inbox read 53 across all turns), so the near-zero is not the instrument.** ⇒ **the wake body reliably produces the narration we want to stop and reliably fails to produce the action it asks for.** ★ **Reader-measured and mine agree to within rounding (568/346 vs 574/352).**

| OBJ | state | detail |
|---|---|---|
| **1** ✅ **SHIPPED** | `CONDUCT.md` added to the escalated notice AND `fresh-rules.mjs` | control 12/12; it was on neither while being injected every session start from an unrefreshed local copy |
| **2** ✅ **SHIPPED** | rule-history archive off the escalation list | control: routes |
| **3** ✅ **SHIPPED** | the issues ledger off the escalation list (Kyle directed, Langston concurred; stays in `fresh-rules.mjs`) | log `08:14:01Z` on the routine path; mixed pushes still escalate. ★ **AND IT IS THE ONLY THING IN THIS BATCH MEASURED TO WORK: routine notices reaching CC-C = 0.** |
| **4 / 4′** ⛔⛔ **STRUCK — DO NOT REBUILD** | append *ACT, DO NOT REPORT* to the wake body | **REFUTED AT n=574 BY THE IDENTICAL MECHANISM ALREADY INSTALLED** (table above). ★ **And two mechanical defects on top, either of which alone would have made it unmeasurable:** the filter truncates at 400 chars (`cc-wake-filter.py:254`), so an APPENDED line is cut on **53%** of heartbeat deliveries (352 of 734 still carried the last instruction) — **and it is cut precisely on the BUSIEST hours, when the body is longest.** And the two categories it targets are **the LEAST verbose**: on CC-A and CC-B the untouched remainder carries MORE chars per wake. ⇒ **a perfectly-working OBJ-4′ moves the smaller half.** |
| **5** ⛔ **STRUCK** | address-position matching | Kyle 2026-09-03 is content to wake on a mention; 1 of 16. **Not worth a live-filter edit on its own.** |
| **6 / 6′** ⛔⛔ **STRUCK — THE NAMED CHANNEL HAS NEVER DELIVERED ANYTHING** | conditional heartbeat, then out-of-band delivery via `scheduled-tasks/wake-watcher-heartbeat-cc-a/` | **r2 said "the shape already exists on disk." It exists and has NEVER RUN — absent from the registry, no `lastRunAt` since creation 2026-07-13.** ⛔ **And the channel it relies on does not reach interactive sessions AT ALL: of 1,485 `task-notification` turn-openers in CC-A's whole transcript, 1,386 are its own Monitor and 99 are background shells/subagents — ZERO from ANY scheduled task** (positive control: 206 heartbeat wakes in the same file, all via Discord). ★ **Its origin is an unverified 2026-07-13 belief — *"its completion notification wakes this session hourly"* — which was replaced nine days later by the Discord variant. Reviving it re-creates the reason it was replaced.** |
| **7** ⏳ **KEEP** | the escalated body teaches the bare `#753` recipe (`git checkout origin/<branch> -- <paths>`) that `fresh-rules.mjs` was hardened against (`-uall :176`, residue `:253`, index-leak `:316`, cause named at `:290`) | **Object is the DISCORD body, not the wake line** — the recipe sits at offset 330-408 and is usually past the 400-char cut, so a woken session has often never seen it. Small, real, unaffected by everything struck above |
| **8** ⏳ **KEEP, REDEFINED — the deliverable is the INSTRUMENT, not a re-run** | commit the measurement as a script with its object definition | ⛔ **r2 said "re-run the §1 instrument" and NO SUCH ARTIFACT EXISTS.** The reader implemented §1's prose independently and got **217 wakes at 69 chars** where §1 says **73 at ~663** — **an order of magnitude apart, from the same description.** ⇒ **§1 is not reproducible and therefore cannot judge anything. Ship `scripts/analysis/wake_narration.py` with the window, the turn model and the categories fixed in code.** ⚠️ **And it must report completed-requests + API-error denominators: a session that cannot complete a request emits text-free wake turns, which bias the rate toward PASS — live today, `#997`.** |
| **9** ⏳ **KEEP, WIDENED BY THE READER** | mirror the unreviewable live objects into the repo | **`dt-push-notice.sh` is not in the tree — verified twice, independently.** ★ **AND NEITHER ARE THE 13 `~/.claude/scheduled-tasks/*/SKILL.md`, INCLUDING THE HEARTBEAT TASK THIS BATCH WOULD HAVE EDITED** — mirroring one while leaving the other is the exact defect OBJ-9 exists to close. ⛔ **THREE candidate homes already exist** (`comms-infra/`, `Claude Comms and Packages/comms-infra/`, `Claude Comms and Packages/Langston/`) — **name ONE or this adds a fourth.** "Mirror updated in the same commit" is necessary and not sufficient while the home is ambiguous |

## 6. WHAT THIS BATCH NOW CONCLUDES — put plainly, because it changes what Kyle should expect
⛔ **THE COMMENTARY PROBLEM HAS NO INSTRUCTION-SHAPED FIX. Three separate attempts are now on record and all three failed against measurement:** the RULE (`CONDUCT.md` §5, auto-loaded every session start — 97% speak rate) · the RULE RESTATED (`#694` piece 2, ruled "a rules fix not a filter fix" — same 97%) · the INSTRUCTION AT THE EVENT (the heartbeat's own body, six weeks, 574 deliveries — **0.3%**).
★ **THE ONE THING THAT WORKED IS DELIVERY: suppressing the routine push notice took CC-C's routine-notice wakes to ZERO, and OBJ-3 has just done the same for ledger-only escalations.** ⇒ **the lever is what ARRIVES, not what it says.**
⛔⛔ **AND THAT PUTS THE REMAINDER IN KYLE'S HANDS, NOT ENGINEERING'S.** What still arrives is traffic we have each judged worth delivering — Langston addressed to you, an alert routed to you by owner, a crew post naming you, the hourly proof-of-life. **Reducing it further is not a fix, it is a DECISION to stop delivering something we currently think a session should see.** ★ **That decision is his; this scope will not make it for him, and will not pretend a better-worded instruction is an alternative to it.**

## 7. DEPENDENCIES AND THE REVIEW GAP
⛔ **(a) OBJ-3 leans on `B-ISSUE-BLOCK-GUARD` (`#745`, queue row 10). If row 10 drifts, OBJ-3 is re-opened in the same turn** (Langston condition 2).
⛔ **(b) The review gap is now OBJ-9 and it is wider than r2 said** — see the table. **Until it closes, Langston's Step-4 gate cannot see the objects this batch edits, and §7.1's "GitHub is the source of truth" does not hold for them.**
★ **`cc-wake-filter.py` IS mirrored and IS current** (`comms-infra/laptop/`, normalised diff empty — verified twice; my first check reported CRLF as content drift, the `#751` signature, caught by the measurement hook).

## 8. STEP-1 STATE — AND THE CAP IS REACHED
Objectives 1-3 shipped ahead of this document under a direct Kyle instruction with Langston's concurrence — **recorded as an irregularity: the scope should have existed first.**
**r1 → r2 → r3 is the three-round cap and r3 ENDS ON AN OBJECT ROUND** (the 574/352/734 table above is mine, re-derived, not the reader's). ⛔ **Two rounds struck two objectives each, at the premises, both times. The correct response to that is not a fourth rebuild — it is to stop proposing mechanisms and report the negative result, which is what §6 now does.**
**REMAINING BUILD: OBJ-7, OBJ-8 (the instrument), OBJ-9 (the mirror + its home).** Everything else is struck or shipped.
