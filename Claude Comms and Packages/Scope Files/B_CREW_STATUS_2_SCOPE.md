# B-CREW-STATUS-2 — SCOPE r1: status capture that matches where Kyle left the session

**change-class:** `non_architecture` · **Owner:** CC-INFRA (Infra Claude) · 2026-08-17
**Revises:** B-CREW-STATUS (closed 2026-08-07, Langston Step-8 PROCEED)
**Gate:** Langston Step-1 ruling **PROCEED with 7 blocking conditions** (this document folds all 7 in; §9 maps each to where it landed)

---

## 1. THE PROBLEM, IN KYLE'S WORDS AND IN NUMBERS

> *"none of the descriptions for any of the sessions rings any bells, and that is the idea behind this tool… It currently takes me 5 to 10 minutes to pick the trail back up."*

**Root cause, measured: the board could not tell Kyle from the harness.** Session transcripts carry harness-injected turns in the **same `type:"user"` channel** as messages Kyle types. Measured real-vs-injected `user` turns:

| session | real Kyle | harness | last REAL Kyle instruction |
|---|---|---|---|
| OLD Claude | 269 | 1,912 | **9 days ago** |
| NEW Claude | 276 | 2,270 | **8 days ago** |
| ANALYST Claude | 366 | 1,706 | minutes ago |

**~7 of every 8 `user` turns is a machine.** The board anchored on the newest movement, so it narrated automation. Two confirmed wrong outputs: NEW Claude rendered as actively working off a 2h-old commit produced by a **timer-driven chore** (Kyle had not directed it in 8 days); ANALYST rendered "reviewing trading rule logic" when the thread Kyle left was the crypto net-EV question.

**A second, independent defect (fixed 2026-08-17, `9826b5870`):** attribution read each session's clone, but a clone holds everything **pulled** from the others — 11 of NEW Claude's 12 most recent commits were ANALYST's batch, so the board reported ANALYST's work as NEW's. Now filtered to locally-made commits via reflog.

**The finding that shaped the design.** Kyle confirmed the corrected trailheads, then said: *"I'm struggling to remember what Old and New Claude were working on when I last left off with them."* ⇒ **the anchor alone is insufficient.** A verbatim instruction from 9 days ago does not restore a lost thread. The tool is **memory restoration**, not status reporting — that reframing is what makes the layer boundaries below non-arbitrary (Langston).

---

## 2. ★ SCHEMA AUDIT — THE RESULT INVERTS THE OBVIOUS CONCLUSION

Langston required this before Step-2: *"audit the raw JSONL record schema for a structural discriminator… If one exists, you should not ship a heuristic at all."*

**A structural field exists: `origin.kind`.** Measured across 7,085 `user` records in four sessions:

| `origin.kind` | count |
|---|---|
| `task-notification` | 5,343 |
| `human` | 965 |
| *(field absent)* | 777 |

**But it is NOT sufficient on its own, and it fails in the exact direction that caused the original defect.** 13 records carry `origin.kind == "human"` while their content is a `<scheduled-task …>` wrapper — the scheduler submits through the same path as a typed prompt. **Those 13 are precisely the timer-driven runs that made NEW Claude look busy.** Using the structural field alone would have reproduced the defect this batch exists to fix.

The two signals fail in **opposite** directions:
- **Text denylist alone** — 0 false admits measured, but it is a denylist and decays silently as new marker types appear (Langston's (a)).
- **`origin` alone** — would admit 13 automation runs as Kyle.

⇒ **Neither alone. The rule is a conjunction**, specified in §4.1. This is the load-bearing finding of the audit and the reason it was worth doing before building.

**The 777 records with no `origin`, categorised:** 681 compact summaries · 58 tag-wrapped · 29 `isMeta` · **9 plain prose that are genuine Kyle turns** — all historical (April–May, CLI ≤ v2.1.128) except two trivial test strings and one slash-command invocation. So the fallback path is real but small, and must not be silently dropped.

---

## 3. WHAT THIS BATCH DOES NOT DO

The plain-language rewriting layer — batch purpose, intent, planned outcome, sub-batch lists. Kyle sequenced it explicitly: *"Once we figure out how to capture and display the right statuses, the richer, plain language version is next."* **Capture first.** §4.5's citation rule enforces the boundary mechanically rather than by intention (Langston: layer 2 "extracts and stitches"; the moment it starts *explaining*, citations fail and the drift is visible).

---

## 4. THE DESIGN

### 4.1 Turn classification (replaces the denylist)
A `user` record is **KYLE** only if **all** hold:
1. `origin.kind == "human"`, **or** `origin` is absent and the content is not tag-wrapped;
2. content is **not** a whole-tag wrapper after stripping — residual-after-tag-stripping, which generalises to marker types that do not exist yet, and correctly keeps `<system-reminder>` blocks *appended* to genuine turns (Langston);
3. `isCompactSummary` and `isMeta` are falsy.

Otherwise **HARNESS**. Two canaries, both required:
- **Unknown-tag reporter** — any turn opening with `<identifier` not in the known set is reported, not silently classified. Denylist + complement = closed set.
- **Rate anomaly** — the measured ~1:8 real:harness ratio is itself the instrument; alert when a session's human-turn rate leaves its historical band.
- CLI **version is pinned** alongside the rule and re-validated on change.

### 4.2 Layer 1 — TRAILHEAD (a span, not a turn)
**Never skip, always extend** (Langston, replacing the ≤25-char heuristic). Take the last KYLE turn unconditionally; test whether a reader who lost the thread could reconstruct from it; if not, extend **backward** — first to the assistant narration it responds to, then to prior Kyle turns — until self-sufficient. Failure mode becomes *too much context* (recoverable in seconds) rather than *wrong trailhead* (the §1 defect). Content-free turns like "Please continue." are **retained as a state signal** — they mean Kyle was babysitting rather than directing.

**If the trailhead is unrecoverable** (compaction; 9 days is inside range) the board states *"trailhead not recoverable from retained transcript"* and stops. **It must never fall back to the newest available turn** — that is the original defect with a longer lookback.

### 4.3 Layer 2 — MID-FLIGHT STATE
What the session was in the middle of, from **its own narration** (already written in the register Kyle needs it back in). **Window is `[trailhead → end of the directed work that followed it]` — anchored by layer 1, never by recency.** For a 9-day-dormant session the most recent narration is chores; reading it would re-import the §1 defect one layer down, where plausible prose makes it harder to see (Langston C1).

**Cached per session, keyed on the trailhead anchor.** No new Kyle instruction ⇒ byte-identical output. For a memory aid, a summary that changes on every refresh actively degrades the recall it exists to support (Langston (f)).

### 4.4 Layer 3 — SINCE THEN
"Since" means **since Kyle last directed**, not since the last board run. Locally-made commits only. **Chore-vs-directed by containment, not proximity:** a commit is emitted by a tool call inside a specific turn's response chain — walk **up** to the nearest preceding `user` record; harness ⇒ chore, Kyle ⇒ directed. That is "the commit was emitted while executing that turn", not "it happened near one" — a different epistemic class. Message shape and cadence may **corroborate**; they may never **decide**.

### 4.5 Provenance discipline (blocking — and it is not about "self")
The hazard is **not** self-reference. **Transcripts quote other transcripts, and at the content layer quotation is indistinguishable from origination** — this session's transcript contains Kyle's instructions to OLD and NEW verbatim. Exclusion of the reading session repairs 1 of 4 instances and hides the rest.
1. **Attribution from record structure only** — which role field, in which session file. Never from content that *looks like* an instruction. A quoted Kyle line inside an assistant turn **is an assistant turn**.
2. **One session per model call.** Never batch sessions into one prompt.
3. **Citation grounding.** Every layer-2 claim carries a record ID resolving into that session's own transcript; uncited claims are dropped. This is what makes "self-consistent and hard to spot" falsifiable — a fabricated record ID does not resolve.
4. **All four sessions, same rules.** No exclusions.

### 4.6 Abstention as a first-class output
Across all three layers: when a link cannot be made, label it **unattributed** and render it as such. **No fallback-to-newest. No proximity-decided attribution.** The entire §1 defect family is confident wrong attribution; "I don't know what produced these 3 commits" costs Kyle nothing, one more wrong attribution costs the board its remaining trust.

### 4.7 Persistence at observation time
**Every upstream source is mutable and prunable** — reflog expires (90d default, and absent from a fresh clone), transcripts compact, clones get rebuilt. A tool whose job is remembering what Kyle forgot is currently re-deriving the past from artifacts that are deleting it. **Trailhead, local-commit set, and layer-2 summary are persisted to the `STORAGE_POLICY.md` §7.5 archive the first time they are observed.** Cheap now; the 104-commit misattribution is one `git clone` away from returning in an undetectable form, because the evidence that would reveal it lives in the artifact that got destroyed.

### 4.8 Ordering
**Sessions blocked on Kyle sort first**, then by last-Kyle-interaction. If the board still sorts by activity, dormant-but-busy sessions rise to the top again and the fix is cosmetically defeated (Langston C2). "Blocked on Kyle" is the one thing he cannot recover by reading anything else.

---

## 5. PRE-AUDIT READS, NAMED

- **Already exists?** `BATCH_CATALOG.md` — one crew-status entry (mine). `RUNNING_ISSUES.md` — no prior work by any session on session-activity/status detection. **Not a rebuild.**
- **`SYSTEM_IMPACT_MAP.md` — crew-status appears ZERO times.** Gap I created; closed by §6.
- **`SYSTEM_MANUAL.md`** — zero mentions, correct: MANUAL documents trading architecture, SIM maps blast radius, and crew-status is a *consumer of* the system, not a *participant in* it (Langston).
- **`STORAGE_POLICY.md` §7.5** — already governs the snapshot archive; §4.7 adds records under the same section, unchanged in kind.
- **Authorisation:** Kyle explicitly approved this tool reading Desktop transcripts. This revision reads them more deeply; §4.5 is the control.

---

## 6. SIM ENTRY (blocking)

One node `crew-status`, marked **read-only / non-trading**, with edges enumerated — **the edges are the point**, since this tool's characteristic failure is upstream format drift and SIM earns its keep when someone changing the alert queue sees crew-status listed as a consumer.
**Inbound:** Discord inbox log · Desktop session transcripts (4) · git clones (4) · GitHub project board · staging alert queue. **Outbound:** Discord message write.
**Process fix:** add a Step-8 close item — *SIM entry created, or explicitly waived with a written reason*. Langston has accepted that this passed his Step-8 without such a check existing.

---

## 7. ACCEPTANCE TEST (blocking — written before build, per Langston (h))

The defect was measured by Kyle's memory (*"none of them ring any bells"*), so the fix is verified by Kyle's memory. **Exit test: run layers 1–3 on OLD Claude and NEW Claude, show Kyle, and the bar is Kyle confirming it rings a bell.** Not my judgement of the output, and not a proxy metric. **I am explicitly the wrong judge** — reviewer and subject. The hand-reconstruction proved the *evidence is sufficient*; it did not prove an automated pass can *extract* it, because it was done with unlimited attention and full context.

---

## 8. VERIFICATION

1. Classification: re-run the §2 audit post-build; the 13 scheduled-task records must classify HARNESS and the 9 historical prose turns must classify KYLE.
2. Trailhead: matches the four independently measured anchors; a session with a compacted trailhead reports unrecoverable rather than substituting.
3. Layer 2 window: for a dormant session, contains **no** post-trailhead chore narration.
4. Stability: two consecutive runs with no new Kyle turn produce byte-identical layer-2 output.
5. Abstention: an unlinkable commit renders `unattributed`, never a guess.
6. Persistence: kill the reflog (`git reflog expire --expire=now --all` in a scratch clone) and confirm previously-observed attribution survives from the archive.
7. Live proof, per the canary rule: a load test that **can fail**.

## 9. CONDITION MAP

| Langston condition | landed in |
|---|---|
| C1 layers 2/3 anchored to trailhead | §4.3, §4.4 |
| Provenance discipline | §4.5 |
| No exclusion of reading session | §4.5.4 |
| Abstention first-class | §4.6 |
| Persist derived facts | §4.7 |
| SIM entry | §6 |
| Acceptance = Kyle's recall | §7 |
| *(rec)* schema audit before heuristic | §2 — **done, result changed the design** |
| *(rec)* span-extension, canaries, cache, sort key | §4.2, §4.1, §4.3, §4.8 |

## 10. OUT OF SCOPE
Plain-language rewriting (§3) · alert triage (other lanes) · any change to what the four sessions do.
