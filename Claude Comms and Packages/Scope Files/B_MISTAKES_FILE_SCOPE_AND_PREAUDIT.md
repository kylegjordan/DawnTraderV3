# B-MISTAKES-FILE — SCOPE **+** PRE-AUDIT, ONE DOCUMENT (r3)

change-class: `non_architecture`
**Owner:** CC-A · 2026-08-20 · **Home:** #694 pieces (4) + (5) · **Issue:** #731 (CC-A block 730-759)

> **r1 → r2:** Langston returned **2 blockers, 3 riders**, and **ADOPTED piece (5)** with one structural requirement. ⛔ **BLOCKER-1 was that my headline number was measured on the WRONG OBJECT — in the document about wrong objects.** Both blockers are fixed below and the fix made the argument *stronger*, not weaker.

> ★★ **THIS DOCUMENT IS #694 PIECE (5) — THE WORKFLOW CHANGE, DEMONSTRATED RATHER THAN DESCRIBED.** Step-1 and Step-2 merged; Langston signs off once, on both.
> ✅ **ADOPTED (Langston r1 ruling 3), and his evidence is better than my argument was:** under two documents **the plan comes FIRST and the audit second**, so *an audit that overturns the design arrives after the Step-1 approval is already spent.* **This audit killed Kyle's design BEFORE a plan was built around it.** That is the ordering working.
> ⛔ **THE ONE STRUCTURAL HOLE, AND IT LEAKED ON FIRST USE: an item that appears only in the PLAN half never gets audited, because the audit half is already written.** **REQUIREMENT, now binding on this format: every §3 item back-references the §2 finding it falls out of, and anything in §3 with no §2 treatment is flagged `UNAUDITED` in-document.** The leak here was the weekly pass — introduced at r1 §3.4 with no §2 treatment, and it was *precisely* the risk §2.2 had identified. **Fixed at §2.6 below.**

---

## 1. WHAT KYLE ASKED FOR (verbatim, #694 piece 4)

**HIS DESIGN:** an append-only mistakes log · a **weekly pass** distils the COMMON causes · **startup reads only the SHORT distilled list, never the full log** · the rules file **REFERENCES** it rather than containing it.
**MY ADDITION, still load-bearing:** ★ **each distilled entry NAMES THE MECHANISM THAT WOULD PREVENT IT, and RETIRES when that mechanism ships** ⇒ **the list SHRINKS.**
**Why it exists, his words:** *"we're not learning from any of it, we're just complaining about the mistakes we're making and then making those mistakes again."*

## 2. THE AUDIT

### 2.1 ⛔ THE LOG SHOULD NOT BE BUILT — RESTATED ON THE RIGHT OBJECT (BLOCKER-1)

⛔⛔ **r1's headline was WRONG, and wrong in this batch's own signature way.** I reported *"35% of commits already carry a self-correction"* from `--grep=correct` — **which counts SUBSTRING PRESENCE, not a correction.** Langston named four counter-examples at the ref: `0e76a4c46` *"the design decision underneath is correct"* · `1e189a260` *"correct interval_begin column"* · `7dfa4ac77` *"now correctly"* · `5c2896938` *"suppressed correctly"*. **~18% of that row was adjectival.** ⇒ **I measured the presence of a WORD and reported it as the presence of a THING** — `wrong-object`, seed 2 of this very batch, committed inside the audit that defines it.

✅ **RE-DERIVED INDEPENDENTLY BY ME AT THE REF (not accepted on his report), and the conclusion gets STRONGER:**
**OBJECT:** commit messages, `28c007163..origin/migration/aws-supabase` (head `216d57f8b`). **POPULATION: 200** commits. ⚠️ *r1 said 199 — my count predated my own push; his 200 is right.*
**INSTRUMENT CONTROLLED:** negative control → 0; positive control → 1.

| row | count | share |
|---|---|---|
| substring `correct` — ⛔ **r1's wrong object, retained so the error is auditable** | 71 | 35% |
| `correct*` in its **RECORD** sense (`correction`/`corrected`) | **48** | 24% |
| ★ **RECORD-SENSE UNION** (correction·corrected·retract·withdraw·mistake·overturn·vacate·"I was wrong") | **72** | **36%** |
| union members **missed** by my four-word marker set | **1** | ⇒ **RECALL 98.6%** |

✅ **SETTLED — AND IT WAS A FALSE-NEGATIVE SET, NOT A SECOND METHOD (Langston r2).** He did not pick a boundary by preference; **he enumerated the delta and hand-read all ten.** My `\b(correction|corrected)\b` misses `corrections` (plural), `corrects`, `correcting` — **10/10 of the delta are genuine record-sense** (`4c283c834` *"fix both of Langston's blockers"* · `f456cf8e9` *"OBJ-3 cannot be done as scoped"* · `129954f25` *"control arm withdrawn"*). **His four adjectival counter-examples are all still excluded by it.**

★ **THE STANDARD, taken verbatim into the index: `\bcorrect(s|ed|ing|ion|ions)\b`.** Under it the union rises **72 → 74 (37%), loses nothing, and recall is unchanged at 73/74 = 98.6%** — the same single miss, `a66eab10c`.

⚠️ **MY RE-DERIVATION RETURNS EACH ROW +1** (201 commits · 49 · 59 · union 75 · recall 98.7%). **That is a RANGE difference, not a method difference: he read before my r2 push landed, so his endpoint is one commit earlier.** ⇒ **the population must be pinned by REF, not by description** — `28c007163..<stated ref>` — or the same query returns a different denominator to two readers on the same day. **Disclosed rather than reconciled to whichever number looked tidier; the conclusion is identical either way.**

★★ **AND THE RECALL FIGURE — NOT 36% — IS WHAT ACTUALLY SUPPORTS THE REFUSAL** (Langston's correction, and he is right): **72 genuine correction records already exist, and only ONE escapes the marker vocabulary.** ⇒ **the existing record is both DENSE and NEARLY-COMPLETELY ADDRESSABLE. A second store would duplicate it with nothing forcing the two to agree — the #641 shape.** What is missing is **a consistent MARKER** (four wordings, none mandated) and **the PATTERN layer.**

### 2.2 THE WEEKLY PASS IS THE PART MOST LIKELY TO DIE
**Every procedure here that depends on somebody remembering has been skipped at least once** — including rule 29(b), **twice in one day, by me, on 2026-08-19, while auto-loaded.** A weekly manual read of a growing log is that shape, and it is skipped first in a busy week — exactly when mistakes are being made.

### 2.3 ⚠️ THE GREP'S POPULATION IS **COMMITS-ONLY**, AND THAT IS A KNOWN GAP (RIDER-1)
**Rule 28.a's destination is *"the COMMIT MESSAGE **or** the ISSUE ENTRY."* A commit trailer covers only the first branch.** ⇒ **the class it structurally cannot hold is the mistake that produces NO COMMIT** — a claim retracted in review that never touched a file. ★ **Langston: *"that is most of my own ledger."*** **Unstated, the greppable record inherits 28.a's split and reads as complete.** **DISPOSITION (§3.1): mandate the trailer on the commit that CARRIES the issue entry, AND state the population limit in the index itself.**

### 2.4 CAP + HOME — VERIFIED, NOT ASSUMED (RULING 2)
`load-conduct.mjs` sets `CAP_BYTES = 16,384`; `CONDUCT.md` is 12,526 B at the ref ⇒ **3,858 B headroom, exact.** A fifth auto-loaded file would buy a hook **plus** a SIM component to carry ten lines.
⚠️ **TWO OBJECTS, BOTH TO BE STATED (his note):** the cap is checked on **`statSync().size` = FILE bytes**, while r1's verification (b) asked for **EMITTED** bytes. **Different objects.** Both go in the completion report.
⚠️ **AND §13-vs-index IS A TWO-COPY SHAPE — ACCEPTED KNOWINGLY, not overlooked:** Kyle's *"startup reads only the short list"* requires **containment**, not a reference. **The coupling is therefore a RULE, not a task for the pass: retiring an entry edits `CONDUCT.md` §13 AND `MISTAKE_PATTERNS.md` IN ONE COMMIT.**

### 2.5 PROVENANCE READ (§2 1.b)
| thing | original intent | disposition |
|---|---|---|
| `CONDUCT.md` §7 | B-CONDUCT-FILE 2026-08-20, from Kyle's *"two or three, sometimes four paragraph"* complaint; job = stop the chat cost, push reasoning into a durable record | **(2) NEEDS UPDATE** — names the destination, not a FORMAT; that is why the record is not greppable |
| `CLAUDE.md` r28.a | same origin, authoritative long form | **(1) CORRECT** — one line added |
| `CLAUDE.md` §2 | Steps 1/2 separate so Langston reviews scope before code exists, pre-audit after the SIM read | **(2) UPDATE — piece (5) ADOPTED**; the merged doc keeps audit-before-plan, which is the whole gain |
| `.claude/hooks/*` | session-instruction estate, SIM Layer-9 | **(1) CORRECT** — no new hook (§3.3) |

### 2.6 ★ THE WEEKLY PASS ITSELF — THE §2 TREATMENT r1 NEVER GAVE IT (BLOCKER-2)
⛔ **r1 §2.2 identified "procedures get skipped" as the central risk, then r1 §3.4 SHIPPED ONE. Reducing the pass to one command SHORTENS it; it does not ARM it.** **A pass that runs and records nothing is indistinguishable from a pass that was skipped** — the same absent-as-valid shape as §7(a) and as the three checks-that-could-not-fail.
⇒ **AUDITED CONCLUSION: the pass needs an OWNER, a CADENCE, a FIRING MECHANISM, and it MUST WRITE ITS RESULT BACK — including when it finds nothing.**
⛔ **AND ONE LEVEL UP: the TRAILER IS ITSELF A PROCEDURE, so by §3.2's own rule it must name the mechanism that would enforce it.** Candidates: a `commit-msg` hook, or a CI grep over the batch's own commits. **Named now, built later** — but **not left unnamed**, which is how §3.2's rule would be violated by the file that defines it.

### 2.7 ★ THE SEEDS, AND THE RETIREMENT CRITERION — THE §2 TREATMENT r2 NEVER GAVE THEM (CHANGE-2)

⛔⛔ **THE PIECE-(5) REQUIREMENT LEAKED A SECOND TIME, ONE SECTION BELOW WHERE I MADE IT BINDING** — and Langston caught it. r2's §3.5 was not inert content: it **asserted a disposition** (*seed 1, mechanism SHIPPED, retires at the first pass*) and **§4(c) hung the entire retirement rehearsal on it.**

⛔ **AND THE DISPOSITION WAS A CATEGORY ERROR.** The wake filter's `else` prevents **one instance, in one watcher.** §3.5 itself says the pattern has **THREE** instances — the other two (a grep shape never controlled for; a guard whose condition could not be true) are **untouched by that hook.** ⇒ **retiring `silence-not-evidence` at the first pass would retire a LIVE pattern** — and *"the list SHRINKS"* is an incentive pointing **exactly** that way.

★★ **THEREFORE THE RETIREMENT CRITERION, which the design was missing and which is the thing that keeps "the list shrinks" from becoming "the list lies":**
> **A mechanism retires a pattern only when it covers the pattern's INSTANCE CLASS — not the instance that surfaced it.**
> **Partial coverage is recorded as `mechanism: PARTIAL` and the entry STAYS LIVE.**

⇒ **§4(c) must rehearse retirement on a seed whose mechanism genuinely closes its class**, or on a deliberately-constructed throwaway. **It may NOT rehearse on seed 1.** *(Langston offered both fixes; taking BOTH — the criterion is the general repair, the rehearsal change is what unblocks §4(c) now.)*

## 3. THE PLAN (each item back-references its §2 finding — the piece-(5) requirement)

### 3.1 MAKE THE EXISTING RECORD GREPPABLE — *from §2.1, §2.3*
Commit trailer, one line, on any commit recording a self-correction — **including the commit that carries an ISSUE ENTRY, so 28.a's second branch is covered (§2.3):**
```
MISTAKE: <pattern-slug> — <one line: what was wrong, what is true>
```
**This replaces four inconsistent wordings with one token. It changes NOTHING about what 28.a already requires** — only whether it can be found. **The index states its own population limit: commits-only; the never-committed retraction is knowingly out of reach.**

### 3.2 THE ARTIFACT IS A PATTERN INDEX — *from §2.1*
`1-system-manual/MISTAKE_PATTERNS.md`: slug · one-line description · instance count **with its `git log --grep` as its own denominator** · **the MECHANISM that would prevent it** · status (`procedure` → `mechanism shipped` → `RETIRED`). **Instances are NOT copied in.** **Pattern layer = this file. Instance layer = git.**
⛔ **RIDER-3, and it is a boundary not a preference: Langston's MEMORY ledger is a THIRD, separate thing — his own ruling stream. NOBODY "syncs" this index against it.** Two of the three seeds are his shapes (`wrong-object` = his crypto-OBJ-6 and #675). **A sync would rebuild #641 in the one place he cannot audit.**

### 3.3 THE SHORT LIST LIVES IN `CONDUCT.md` §13 — *from §2.4*
Top **3-5 LIVE** patterns only (~1 KB into 3,858 B headroom), pointing at the full index. **Retirement edits §13 and the index IN ONE COMMIT (§2.4).** One-in-one-out still binds; over cap, the loader says so loudly.

### 3.4 THE WEEKLY PASS — OWNED, FIRED, AND IT WRITES BACK — *from §2.6*
**Command:** `git log --grep='^MISTAKE:' --since=1.week` → group by slug → update counts.
**OWNER: CC-A. CADENCE: weekly. FIRING: a self-chaining `verification` alert.**
⛔⛔ **CHANGE-1 (Langston r2) — r2 NAMED THE WRONG VERB, AND THE VERB *IS* THE ARMING MECHANISM.** r2 said *"re-arms on discharge, not a `resolve`, which is terminal"* — which **reads as *avoid resolve*, and doing that makes the pass never fire again, silently.** That is **BLOCKER-2 reappearing disguised as its own fix.**
**MEASURED: `system-alerts.ts:389` blocks a fresh mint while `a.state !== 'resolved'` ⇒ `resolve` is the ONLY verb that frees a `dedupe_key`; an `ack` silences the row permanently AND drops it out of the §10.5 sweep.**
✅ **CORRECT PATTERN, and it has a working precedent — the dt-deploy chain carries `dedupe_key: null` and mints the next row while resolving the current one (`f2c92489` resolved → `65bb4388` minted):**
> **NO `dedupe_key`. MINT THE NEXT SCHEDULED ROW *FIRST*, THEN RESOLVE THE CURRENT ONE WITH EVIDENCE.**
*(My earlier "resolve is terminal, avoid it" came from destroying a gating alert by resolving it. The lesson was real; the generalisation was wrong — the fix is ordering, not avoidance.)*
★ **THE PASS WRITES A DATED ROW TO `MISTAKE_PATTERNS.md` EVERY TIME, INCLUDING "no new instances"** — so **liveness is readable at the ref by anyone, and a missing row IS the alarm.** *(Same instrument design as `CLAUDE_CODE_FEATURE_WATCH.md`'s run log, which exists for exactly this reason.)*
**ENFORCEMENT MECHANISM FOR THE TRAILER (§2.6), named now, built in a follow-up: `commit-msg` hook or CI grep. `UNBUILT` until it ships, and the index says so.**

### 3.5 SEED CONTENT — *from §2.7* ⚠️ **(r2 shipped this section with NO §2 treatment and NO `UNAUDITED` flag — the piece-(5) requirement leaking again, one section below where I made it binding. §2.7 now exists.)**
1. **`silence-not-evidence`** — a check that CANNOT FAIL mistaken for one that passed. **3 instances, 2026-08-19/20.** **Mechanism: PARTIAL — the wake filter's `else` covers ONE instance in ONE watcher.** ⛔ **DOES NOT RETIRE.** *(r2 asserted "SHIPPED ⇒ retires at first pass". **That was a category error and §4(c) hung the whole retirement rehearsal on it** — see §2.7.)*
2. **`wrong-object`** — right name, wrong thing. Instances: worktree-not-ref · a stale `origin/…` baseline · `-200` as a denominator · ⛔ **and §2.1 of this document.** **Mechanism: NONE YET.**
3. **`process-not-file`** — a file test supporting a claim about a running process. **Mechanism: NONE YET.**

## 4. VERIFICATION
**(a)** the trailer is greppable — **POSITIVE CONTROL FIRST**: the grep returns a known-seeded commit before its silence counts · **(b)** **state BOTH byte objects (§2.4)** — `CONDUCT.md` FILE bytes vs loader-EMITTED bytes, at a named ref · **(c)** ⭐ **the retirement path is exercised FOR REAL once** — ⚠️ **NOT on `silence-not-evidence` (§2.7: partial coverage, stays live).** Rehearse on a **deliberately-constructed throwaway pattern whose mechanism demonstrably closes its whole class**, retired from **both** §13 and the index in one commit — **an untested retirement path is how a list silently only grows** · **(d)** the weekly alert **fires once and its dated row is present in the file** — *the row, not the alert's existence, is the proof* · **(e)** `CLAUDE.md` r28.a references the index and **the reference RESOLVES** · **(f)** CI 4/4 per-job.

## 5. FOR LANGSTON — r2
Both blockers fixed; all three riders taken. **I re-derived your numbers rather than accepting them** — 200 commits ✅, union 72 (36%) ✅, recall 98.6% ✅ (your ~99%). **One row still disagrees and is disclosed at §2.1**: your 58 vs my 48 for `correct` in record sense, a regex-boundary difference, not load-bearing. **Nothing else outstanding; board card being created.**

## 6. PLAIN-LANGUAGE SUMMARY (piece (3) format)
The audit found the log Kyle asked for **already exists**: 72 of our last 200 commits carry a real correction written out in full — and **only one of them uses wording our search would miss**. So the record is not just dense, it is almost completely findable already. Building a second one would give us two records with nothing keeping them honest with each other.
**The plan: one consistent label instead of four; a short list of the repeating *patterns* rather than the incidents; each entry naming the fix that would stop it, and deleted the moment that fix exists — so the list gets shorter.** The short list goes in the file that already loads at startup, so nothing new has to load. **And the weekly review that keeps it current is not left to memory: it is scheduled, owned, and has to write down what it found even when it found nothing — because a review that leaves no trace looks exactly like one that never happened.**
