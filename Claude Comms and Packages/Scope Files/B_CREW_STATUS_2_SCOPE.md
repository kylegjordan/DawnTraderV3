# B-CREW-STATUS-2 — SCOPE r2: status capture that matches where Kyle left the session

**change-class:** `non_architecture` · **Owner:** CC-INFRA (Infra Claude) · 2026-08-17
**Revises:** B-CREW-STATUS (closed 2026-08-07, Langston Step-8 PROCEED)
**Gates:** Langston Step-1 **PROCEED w/ 7 conditions** → Step-2 **CHANGES-NEEDED, 3 blockers** → this r2.
**r1→r2 summary:** all three blockers discharged by measurement. **§2's headline was WRONG and is retracted in place** (§2.0). The audit is now a committed script, not a table. §11 maps every condition and blocker to where it landed.

---

## 1. THE PROBLEM, IN KYLE'S WORDS

> *"none of the descriptions for any of the sessions rings any bells, and that is the idea behind this tool… It currently takes me 5 to 10 minutes to pick the trail back up."*

Two confirmed wrong outputs: **NEW Claude** rendered as actively working off a 2h-old commit produced by a timer-driven chore, while Kyle had not directed it in 8 days; **ANALYST** rendered "reviewing trading rule logic" when the thread Kyle left was the crypto net-EV question.

**★ ROOT-CAUSE ORDERING, CORRECTED BY LANGSTON (Step-2 §2).** r1 attributed both to Kyle-vs-harness misclassification. **That attribution does not survive measurement.** Neither wrong output is caused by a misread turn: NEW's is layer-3 attribution plus recency anchoring; ANALYST's is layer 2 reading the *newest* narration. **Both are §4.3/§4.4 defects — recency anchoring, not classification.** The sections r1 was most confident in were hardening a path that largely held; the sections r1 flagged as weakest carry the actual defect. That reordering is the single most important change in r2.

Classification is *also* genuinely broken (§2.1) — but as a **latent corruption of the new trailhead feature**, not as the cause of what Kyle saw.

**Independent second defect (fixed, `9826b5870`):** attribution read each clone's log, but a clone holds everything **pulled** from the others — 11 of NEW Claude's 12 most recent commits were ANALYST's batch. Now filtered to locally-made commits via reflog.

**The finding that shaped the design.** Kyle confirmed the corrected trailheads, then: *"I'm struggling to remember what Old and New Claude were working on when I last left off with them."* ⇒ **the anchor alone is insufficient.** This tool is **memory restoration**, not status reporting. That reframing is what makes the layer boundaries non-arbitrary.

---

## 2. MEASUREMENT — RE-DONE AGAINST THE SHIPPED PREDICATE

**All numbers below are produced by `comms-infra/laptop/crew-status-audit.py`, committed at `81636ce56`.** Langston could not reach the corpus (it lives on Kyle's laptop, not Helsinki) and correctly refused to rule on reported numbers: *"a number that only exists as a table in a scope doc is an assertion."* Re-derivable by anyone with the corpus, Kyle included.

### 2.0 ★ RETRACTION — r1's §2 HEADLINE WAS WRONG

r1 claimed *"~7 of every 8 `user` turns is a machine"* and that **13** `origin.kind=="human"` scheduled-task records *"are precisely the timer-driven runs that made NEW Claude look busy."*

**Both claims are withdrawn.** The 7:8 ratio is a **raw-record** ratio, not the population the shipped filter admits — rule 29(a), right object, wrong denominator. And `crew-status.py:212` already excludes every turn whose extracted text begins with `<`. **Measured: ZERO scheduled-task and ZERO task-notification records evade it.** Langston's challenge was correct. Recorded here rather than silently corrected, because the retracted claim was the sole support for r1's §4.1 argument.

### 2.1 WHAT IS ACTUALLY TRUE — and it is a real defect I had missed

**Object:** records where `message.role=="user"`, non-sidechain, that the shipped predicate at `:212` **admits**. **Population:** all such records in the four session transcript dirs.

| session | admitted | NOT Kyle | rate |
|---|---|---|---|
| OLD Claude | 480 | 164 | 34.2% |
| NEW Claude | 628 | 301 | **47.9%** |
| ANALYST Claude | 645 | 226 | 35.0% |
| Infra Claude | 39 | 3 | 7.7% |
| **TOTAL** | **1,792** | **694** | **38.7%** |

**How every one of the 694 evaded:** 681 **compaction summaries**, 13 `isMeta`. **None is a scheduled task.**

Compaction summaries evade the tag test because they open with plain prose (*"This session is being continued from a previous conversation…"*), so the tool could present a **machine-written recap of a conversation as the last thing Kyle said** — precisely corrupting the trailhead this batch introduces.

**FIXED AND VERIFIED (`81636ce56`), structurally, not by heuristic:** `isCompactSummary` and `isMeta` are flags on the **record**. Post-fix: zero recaps on the page; OLD and NEW show their real instructions at 10d/9d, matching independently measured trailheads.

### 2.2 The structural discriminator — restated as MECHANISM, not count

`origin.kind` exists (**object:** `type=="user"`, string content, non-sidechain; **population:** 7,085 records): `task-notification` 5,343 · `human` 965 · absent 777.

Langston: *"not over-fitted — **mis-argued**."* The conjunction in §4.1 does **not** rest on a rate. It rests on a structural property: **the scheduler submits through the same code path as a typed prompt, so `origin.kind` cannot discriminate scheduler-from-Kyle by construction.** One instance suffices; sample size is irrelevant. *(Labelled **inferred from the 13 observations** — I have not read the harness source that implements it, per rule 29(c).)*

This survives §2.0: even though those 13 are already excluded by the tag test, the structural point stands. What it is no longer is evidence for r1's root-cause claim.

### 2.3 The fallback path is NOT small — Langston's own measurement

r1 called the no-`origin` path *"real but small"* (9 records). **Object:** `type=="user"` records in `/home/langston/.claude/projects/-home-langston/*.jsonl` (2,940 files). **Population:** 19,859. Result: **absent 19,852 (99.96%)** · `task-notification` 7 · `human` **0**. Positive control per 29(b): the same parse returned non-zero for `task-notification`, so the zero is real.

**Different population** — Claude Code CLI on Helsinki, not Desktop on Kyle's laptop. It does not contradict 965/777. What it establishes: **`origin` fill rate is a property of the writing surface and CLI version, not of the record type.** In one corpus the fallback is 11% and looks like an edge case; in a sibling corpus it carries 99.96% of traffic **and IS the classifier.** ⇒ §4.1 rule-1's second disjunct is built as a **first-class path with equal canary coverage** (§4.1).

### 2.4 Blocker 2 — MEASURED, DOES NOT REPRODUCE

The shipped reader takes newest-by-mtime and parses **that file only** (`:183-198`), while trailheads are 8–9 days old. Section B of the audit tests it directly: **for all four sessions the one-file read reaches the same trailhead as an all-files read.** Reported as **measured-not-reproduced**, not dismissed — it holds by luck, not design (OLD Claude has 2 transcript files and the newest happens to span far enough). §4.2 fixes it anyway, because the next session with more file churn breaks it silently.

---

## 3. WHAT THIS BATCH DOES NOT DO

The plain-language rewriting layer. Kyle: *"Once we figure out how to capture and display the right statuses, the richer, plain language version is next."* §4.5's citation rule enforces the boundary **mechanically** — if every sentence traces to a cited span, layer 2 is extracting; the moment it starts explaining, citations fail and drift is visible.

---

## 4. THE DESIGN

### 4.1 Turn classification
A `user` record is **KYLE** only if all hold:
1. `origin.kind == "human"`, **or** `origin` absent (**first-class fallback path** per §2.3 — same rigor, same canaries, not an exception branch);
2. content is not a whole-tag wrapper after **residual-after-tag-stripping** — generalises to marker types that do not exist yet, and correctly keeps `<system-reminder>` blocks *appended* to genuine turns;
3. `isCompactSummary` and `isMeta` are falsy (**§2.1 — the 38.7% contamination**).

**Canaries (all required):** unknown-tag reporter (denylist + complement = closed set) · rate anomaly against each session's historical human-turn band.

**★ VERSION PINNING IS PER-SOURCE.** Three CLI versions are live in this tool's runtime, measured by Langston: Desktop **2.1.219** writes the transcripts being classified · laptop PATH **2.1.87** runs the job · Helsinki **2.1.159** runs the model (`crew-status.py:623`). **The version governing §4.1 is the one that WROTE each transcript**, on a different machine from the one classifying. So: record the **writer's** version in each persisted fact (§4.7 provides the slot), and **fire the canary on writer-version change, not runner-version change.** Interacts with **#673** (§5).

### 4.2 Layer 1 — TRAILHEAD (a span, not a turn)
**Never skip, always extend.** Take the last KYLE turn unconditionally; if it does not restore the thread on its own, extend **backward** — to the assistant narration it responds to, then to prior Kyle turns — until self-sufficient. Failure mode becomes *too much context* (recoverable in seconds) rather than *wrong trailhead*. "Please continue." is **retained as a state signal**: Kyle was babysitting, not directing.

**★ FILE SET (blocker 2).** The search spans **all `*.jsonl` in the session dir**, ordered by the newest record timestamp *within* each file — **not by mtime**, which measures last write and not last content. Three distinct states, three renderings:

| state | test | rendering |
|---|---|---|
| in an older file | present on disk | **read it** — never abstain |
| compacted away | file present, turn absent, a compaction boundary covers the gap | *"the last message you typed here is older than what the transcript still keeps"* |
| absent from disk | no file covers the period | *"no transcript retained for that period"* |

**Never fall back to the newest available turn** — that is the original defect with a longer lookback.

**C6 exclusion — explicitly RETAINED, now unreachable.** `:222-225` skips a session whose newest transcript is the summariser's own. Since the model call moved to Helsinki (`734262f17`) the summariser writes its transcript under `/var/lib/crew-status-explainer` on the server and **creates no laptop transcript at all**, so the branch cannot fire. Kept as belt-and-braces at zero cost, and **stated** rather than removed silently, per Langston: *"an implicit change to a live exclusion is the kind of thing that survives a review by not being mentioned."*

### 4.3 Layer 2 — MID-FLIGHT STATE
**★ WINDOW, defined non-circularly (Langston's C1 answer, adopted).** r1's *"end of the directed work that followed"* was circular — you cannot locate that end without having already classified everything after it. Generalise §4.4's containment walk instead:

> **The layer-2 window is `[trailhead → the last record whose containing turn-chain roots at a KYLE turn at-or-after the trailhead]`.**

Walk forward from the trailhead; for each record walk **up** to its root `user` record; include it iff that root is KYLE and at-or-after the trailhead. Mechanical, terminating, uses only §4.1 plus the chain walk §4.4 needs anyway — and **defined by containment, not recency or proximity**, so it inherits §4.4's epistemic class rather than importing a weaker one.

**Degenerate case is first-class:** if Kyle spoke last and nothing ran after, the window is the response chain to that turn, possibly empty — and *"you spoke last here; nothing has run since"* is probably the single most useful line the board can print.

**★ MODEL, NAMED (Langston §7 — r1 never stated it).** Layer 2 currently runs on **haiku** (`crew-status.py:623`). On a task that is *recover a lost thread in the register the reader needs it back in*, model choice plausibly dominates every other decision here, and the cost argument is thin (~50 changes/day, one call per session). **Declared: layer 2 runs on `haiku` for r2's first build. If §7's acceptance test fails, MODEL TIER IS THE FIRST VARIABLE TO MOVE — not the prompt.**

**Cached per session, keyed on the trailhead anchor.** No new Kyle instruction ⇒ byte-identical output. For a memory aid, a summary that changes on every refresh actively degrades the recall it exists to support.

### 4.4 Layer 3 — SINCE THEN
"Since" = **since Kyle last directed**, not since the last board run. Locally-made commits only. **Chore-vs-directed by containment, not proximity:** a commit is emitted by a tool call inside a turn's response chain — walk **up** to the nearest preceding `user` record; harness ⇒ chore, Kyle ⇒ directed. Message shape and cadence may **corroborate**; never **decide**.

### 4.5 Provenance discipline
The hazard is **not** self-reference. **Transcripts quote other transcripts, and at the content layer quotation is indistinguishable from origination** — this session's transcript contains Kyle's instructions to OLD and NEW verbatim. Excluding the reading session repairs 1 of 4 instances and hides the rest.
1. **Attribution from record structure only.** A quoted Kyle line inside an assistant turn **is an assistant turn**.
2. **One session per model call.** Never batch sessions into one prompt.
3. **Citation grounding.** Every layer-2 claim carries a record ID resolving into that session's own transcript; uncited claims are dropped. A fabricated record ID does not resolve — which is what makes "self-consistent and hard to spot" falsifiable.
4. **All four sessions, same rules. No exclusions.**

### 4.6 Abstention — a sentence, never an empty field
A blank reads as breakage; a stated reason reads as the tool working.
1. **Never render an empty string.** One of a **closed set** of reasons; an unmatched reason is itself a canary.
2. **Distinguish *no data* from *data present but unlinkable*.** The first says "look elsewhere"; the second says "there is activity nobody can attribute" — an alarm, not a gap.
3. **Carry the count.** *"3 commits, unattributed"* is information; a silently shorter list is a lie by omission — the same failure class as the 104-commit misattribution.
4. **Phrased in Kyle's register**, not the tool's.

### 4.7 Persistence at observation time
**Every upstream source is mutable and prunable** — reflog expires (90d default, absent from a fresh clone), transcripts compact, clones get rebuilt. A tool whose job is remembering what Kyle forgot cannot re-derive the past from artifacts that are deleting it. **Trailhead, local-commit set and layer-2 summary persist to the `STORAGE_POLICY.md` §7.5 archive at first observation**, each stamped with the **writer CLI version and the classifier rule version** (§4.1).

**★ RECONCILIATION — a disagreement is a THIRD STATE, not a tie-break (Langston).** r1 left this open as persisted-vs-fresh. That is a false binary: picking either side destroys the signal the divergence carries, and the signal is the whole reason to persist.
- **Persist both. Render the persisted one** — that is what Kyle saw; this tool is memory restoration, not a live gauge.
- **Raise the divergence as its own item.**

A disagreement means either a bug persisted a bad fact or the source mutated; both are things to know, neither is a thing to resolve silently. Precedent in Langston's ledger: a frozen alert snapshot read 67.8% for eight days against a live 76.9%, and the harm was not which was right — it was that nothing surfaced that they differed. Version stamping turns most divergences into self-explaining migrations rather than alarms.

### 4.8 Ordering
**Sessions blocked on Kyle sort first**, then by last-Kyle-interaction. If the board still sorts by activity, dormant-but-busy sessions rise to the top again and the fix is cosmetically defeated. "Blocked on Kyle" is the one thing he cannot recover by reading anything else.

---

## 5. PRE-AUDIT READS, NAMED

- **Already exists?** `BATCH_CATALOG.md` — one crew-status entry (`:524`, `:527`), mine. **Corpora and terms named per #453:** `RUNNING_ISSUES.md` + `BATCH_CATALOG.md`, searched for `crew.?status` · `session (activity|status)` · `transcript.*(read|parse)` · `idle`. **Not a rebuild.**
- **★ TWO OPEN ISSUES THIS REVISION TOUCHES (r1 omitted both — Langston §6):**
  - **#670** (mine) — crew-status snapshots have **no cold hand-off; the warm tier grows unbounded.** §4.7 adds three new persisted record types to exactly that tier. Delta ≈ **+18 MB/yr gzipped** — a **policy-conformance** concern, not a capacity one, and it stays that way. Named rather than left as an unstated interaction.
  - **#673** — three live CLI versions. **§4.1's version pinning depends on it directly.**
- **`SYSTEM_IMPACT_MAP.md` — crew-status appears ZERO times** (Langston verified independently, three casings). Gap I created; closed by §6.
- **`SYSTEM_MANUAL.md`** — zero mentions, and correct: MANUAL documents trading architecture, SIM maps blast radius; crew-status is a *consumer of* the system, not a *participant in* it.
- **`STORAGE_POLICY.md` §7.5** (`:95-123`, Langston verified) — already governs the archive; §4.7 adds records under the same section, unchanged in kind.
- **Authorisation:** Kyle explicitly approved this tool reading Desktop transcripts. This revision reads them more deeply; §4.5 is the control.

---

## 6. SIM ENTRY (blocking)

One node `crew-status`, **read-only / non-trading**, edges enumerated — **the edges are the point**, since this tool's characteristic failure is upstream format drift and SIM earns its keep when someone changing the alert queue sees crew-status listed as a consumer.
**Inbound:** Discord inbox log · Desktop transcripts (4) · git clones (4) · GitHub board · staging alert queue. **Outbound:** Discord message write.
**Process fix:** Step-8 close item — *SIM entry created, or explicitly waived with a written reason.*

---

## 7. ACCEPTANCE TEST (written before build)

The defect was measured by Kyle's memory, so the fix is verified by Kyle's memory. **Run layers 1–3 on OLD Claude and NEW Claude, show Kyle; the bar is Kyle confirming it rings a bell.** Not my judgement, not a proxy metric. **I am explicitly the wrong judge** — reviewer and subject. The hand-reconstruction proved the *evidence is sufficient*; it did not prove an automated pass can *extract* it, having been done with unlimited attention and full context. **If it fails, §4.3's model tier moves first.**

---

## 8. VERIFICATION

1. **Classification:** re-run `crew-status-audit.py`; admitted-but-not-Kyle must be **0**, down from 694/1,792.
2. **Trailhead:** matches the four independently measured anchors; the three §4.2 states render distinctly. Positive control: a session with a deliberately split transcript set still resolves.
3. **Layer-2 window:** for a dormant session, contains **no** post-trailhead chore narration.
4. **Stability:** two consecutive runs with no new Kyle turn produce **byte-identical** layer-2 output.
5. **Abstention:** an unlinkable commit renders a reason sentence **with a count**, never a guess and never a blank.
6. **Persistence:** `git reflog expire --expire=now --all` in a **scratch clone**; previously-observed attribution must survive from the archive.
7. **★ Live proof with a stated predicate** (Langston: the only item in r1 that did not say what would make it fail): plant a sentinel Kyle-turn in a scratch transcript, run the job, and **require the sentinel text to appear as that session's trailhead**. **FAILS IF** the sentinel is absent, appears against the wrong session, or the run reports success while the page is unchanged.

---

## 9. OUT OF SCOPE
Plain-language rewriting (§3) · alert triage (other lanes) · any change to what the four sessions do.

## 10. OPEN — FOR THE REVIEWER
None withheld. The judgement I remain least sure of is §2.2's mechanism claim, which is **inferred, not source-read**; if the harness in fact tags scheduler submissions distinguishably, §4.1's conjunction is unnecessary and rule 1 alone suffices.

## 11. CONDITION & BLOCKER MAP

| item | source | landed |
|---|---|---|
| B1 re-measure vs shipped predicate; restate as mechanism | Step-2 | **§2.0 retraction, §2.1, §2.2** |
| B2 file set; absent/compacted/older-file | Step-2 | **§2.4 (measured), §4.2** |
| B3 commit the audit script | Step-2 | **`81636ce56`**, cited throughout §2 |
| C1 windows anchored to trailhead | Step-1 | §4.3, §4.4 |
| Provenance discipline | Step-1 | §4.5 |
| No exclusion of reading session | Step-1 | §4.5.4 |
| Abstention first-class | Step-1 | §4.6 |
| Persist derived facts | Step-1 | §4.7 |
| SIM entry | Step-1 | §6 |
| Acceptance = Kyle's recall | Step-1 | §7 |
| C1 window definition (non-circular) | Step-2 | §4.3 |
| Abstention rendering | Step-2 | §4.6 |
| §4.7 third-state reconciliation | Step-2 | §4.7 |
| Fallback first-class + per-source versions | Step-2 | §2.3, §4.1 |
| §5 names #670 and #673 | Step-2 | §5 |
| Name the model | Step-2 | §4.3 |
| Verification item 7 predicate | Step-2 | §8.7 |
| C6 retire-or-retain stated | Step-2 | §4.2 |
