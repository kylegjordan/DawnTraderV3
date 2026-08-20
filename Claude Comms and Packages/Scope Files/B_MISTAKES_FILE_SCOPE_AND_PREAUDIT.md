# B-MISTAKES-FILE — SCOPE **+** PRE-AUDIT, ONE DOCUMENT (r1)

change-class: `non_architecture`
**Owner:** CC-A · 2026-08-20 · **Home:** #694 piece (4) · **Issue for the work:** #731 (CC-A block 730-759)

> ★★ **THIS DOCUMENT IS ITSELF #694 PIECE (5) — THE WORKFLOW CHANGE, DEMONSTRATED RATHER THAN DESCRIBED.**
> Kyle: *"the audit must still be thorough, but the plan it produces belongs in the SAME document… Langston signs off once, on both."* So this is **Step-1 and Step-2 merged**: the audit findings come first and the plan falls out of them, ending in the plain-language summary. **If the format works, piece (5) lands by adoption and `CLAUDE.md` §2 is amended to match. If Langston finds it degrades either half, piece (5) is refuted and we keep two documents — that is a real possible outcome, not a formality.**

---

## 1. WHAT KYLE ASKED FOR (verbatim, from #694 piece 4)

**HIS DESIGN:** an append-only mistakes log · a **weekly pass** distils the COMMON causes · **startup reads only the SHORT distilled list, never the full log** · the rules file **REFERENCES** it rather than containing it.
**MY ADDITION, already recorded and still load-bearing:** ★ **each distilled entry MUST NAME THE MECHANISM THAT WOULD PREVENT IT — and when a mechanism ships (a hook, a gate, a refusal), THE ENTRY IS RETIRED.** ⇒ **the list SHRINKS as items convert into mechanisms.**
**And the reason the whole thing exists, his words:** *"we're not learning from any of it, we're just complaining about the mistakes we're making and then making those mistakes again."*

## 2. THE AUDIT — AND IT CHANGES THE DESIGN

### 2.1 ⛔ THE APPEND-ONLY LOG SHOULD NOT BE BUILT. IT ALREADY EXISTS.

**MEASURED.** **OBJECT:** commit messages on `migration/aws-supabase`. **POPULATION:** the **199** commits in `28c007163..HEAD` (an explicit range — ⚠️ `git log -200 --grep=X` does **NOT** mean "of the last 200": `-200` caps the OUTPUT *after* filtering, so it silently reports counts across ALL history against a denominator you think you set. **That error is in this audit's own working, caught by a control, and it is exactly the population trap this batch is about**).
**INSTRUMENT CONTROLLED:** negative control (`zzzznotathing`) → **0**; positive control (a string in one known commit) → **1**.

| marker present in the message | commits | share of 199 |
|---|---|---|
| `correct*` (corrected / correction) | **70** | **35%** |
| `withdraw*` | 15 | 8% |
| `retract*` | 11 | 6% |
| `mistake` | 7 | 4% |

⇒ ★★ **A THIRD OF ALL COMMITS ALREADY CARRY A SELF-CORRECTION, IN FULL, WITH THE REASONING.** Rule 28.a already mandates it (*"the reasoning, the mechanism and the lesson go in the COMMIT MESSAGE or the ISSUE ENTRY"*). **Building a separate append-only log would create a SECOND copy of a record that already exists — the #641 two-sources-of-truth failure this project keeps paying for**, and the copy would drift because nothing forces the two to agree.
⚠️ **What is genuinely MISSING is not the log. It is (a) a CONSISTENT MARKER so the existing record is greppable — four different wordings above, none mandated — and (b) the PATTERN layer above the instances.**

### 2.2 THE WEEKLY DISTILLATION PASS IS THE PART MOST LIKELY TO DIE

**Every procedure in this system that depends on somebody remembering to run it has been skipped at least once**, including rule 29(b) — **twice in one day, by me, on 2026-08-19**, while it sat auto-loaded. A weekly manual read of a growing log is exactly that shape, and it gets skipped first in a busy week — precisely when the mistakes are being made.
⇒ **the pass must be reducible to ONE command over a greppable marker, not a reading task.** With a mandated trailer it becomes `git log --grep` + a count. **That is the difference between a mechanism and a good intention** (#623 leg 2).

### 2.3 PROVENANCE READ (§2 1.b) — WHAT I WOULD TOUCH, AND WHAT IT WAS BUILT TO DO

| thing | original intent | disposition |
|---|---|---|
| **`CONDUCT.md` §7** (self-correction is one line) | B-CONDUCT-FILE, 2026-08-20, from Kyle's *"two or three, sometimes four paragraph"* complaint. Its job: **stop the chat cost** and push the reasoning into a durable record. | **(2) RELEVANT, NEEDS AN UPDATE** — it names the destination but not a FORMAT, which is why the record it produces is not greppable. Add the trailer; do not re-litigate the rule. |
| **`CLAUDE.md` rule 28.a** | Same origin; the authoritative long form. | **(1) STILL CORRECT** — one-line note only. |
| **`CLAUDE.md` §2** (11 steps) | The post-Replit workflow. Steps 1 and 2 are separate because Langston reviews scope BEFORE code exists and the pre-audit AFTER the SIM read. | **(2) NEEDS AN UPDATE *if* piece (5) is adopted** — and the reason they were separate is real, so **the merged doc must still put the SIM/census work BEFORE the plan**, which is why §2 of this document precedes §3. |
| **`.claude/hooks/*`** | Session-instruction estate; SIM Layer-9 entry added 2026-08-20. | **(1) CORRECT** — a new hook is only needed if the top-N block is NOT carried in `CONDUCT.md`; see §3.3. |

### 2.4 SIM / SYSTEM MANUAL APPLICABILITY — JUDGED, NOT SKIPPED
**SIM: APPLICABLE** *only if* a new hook ships (§3.3 says it should not). If the top-N block lives inside `CONDUCT.md`, **no new component exists** and the existing Layer-9 entry needs one line noting the file's new §13. **System Manual: NOT APPLICABLE** — no architecture, strategy, regime, filter, signal-pipeline or math change. Stated explicitly per the §9 anti-pattern.

### 2.5 BLAST RADIUS
`CONDUCT.md` (+~1 KB, against 3,858 B of cap headroom) · `CLAUDE.md` (rule 28.a, one line) · a new `1-system-manual/MISTAKE_PATTERNS.md` · `SYSTEM_IMPACT_MAP.md` (one line) · optionally `.claude/hooks/` (**recommended: NOT touched**). **No runtime code. No deploy. No UI surface** — stated, not skipped.

## 3. THE PLAN THAT FALLS OUT OF THE AUDIT

### 3.1 DON'T BUILD THE LOG — MAKE THE EXISTING ONE GREPPABLE
**Mandate a commit trailer, one line, on any commit that records a self-correction:**
```
MISTAKE: <pattern-slug> — <one line, what was wrong and what is true>
```
`<pattern-slug>` is drawn from `MISTAKE_PATTERNS.md`; a genuinely new pattern adds a slug. **This is the ONLY new discipline the batch introduces, and it replaces four inconsistent wordings with one greppable token.** ⚠️ **It does NOT change what rule 28.a already requires** — the reasoning was already going in the commit; this only makes it findable.

### 3.2 THE ARTIFACT IS A PATTERN INDEX, NOT AN INCIDENT LOG
`1-system-manual/MISTAKE_PATTERNS.md` — one entry per pattern, each carrying: **the slug · one-line description · the instance count with `git log --grep` as its own denominator · the MECHANISM that would prevent it · its status (`procedure` → `mechanism shipped` → `RETIRED`)**. **Instances are NOT copied in** — they are reachable by the grep. **The file is the pattern layer; git is the incident layer.**

### 3.3 THE SHORT LIST GOES IN `CONDUCT.md`, NOT IN A FIFTH AUTO-LOADED FILE
Kyle: *"startup reads only the short distilled list."* **Recommendation: a new `CONDUCT.md` §13 carrying the TOP 3-5 LIVE patterns only** (~1 KB), pointing at the full index. **A fifth auto-loaded file would add a hook, a SIM component and per-session overhead to carry ~10 lines** — the wrong trade when 3,858 B of headroom already exists in a file that loads at exactly the right moment. **One-in-one-out still binds:** if §13 pushes `CONDUCT.md` over cap, the loader says so loudly and something moves out.

### 3.4 THE WEEKLY PASS IS ONE COMMAND
`git log --grep='^MISTAKE:' --since=1.week` → group by slug → update counts in the index. **If a slug's mechanism has shipped, retire the entry and drop it from `CONDUCT.md` §13.** ★ **The list is designed to SHRINK. A list that only grows is a second rules file, which is the thing we are removing.**

### 3.5 SEED CONTENT — TODAY'S THREE, ALREADY EVIDENCED
1. **`silence-not-evidence`** — a check that CANNOT FAIL mistaken for a check that passed (3 instances 2026-08-19/20). **Mechanism: SHIPPED** — the wake filter's `else` announces unrouted lines. **⇒ this entry retires at the first pass, which is the design working.**
2. **`wrong-object`** — right name, wrong thing (measuring a worktree not a ref; a stale `origin/…` as a baseline; `-200` as a denominator — **including in §2.1 of this very document**). **Mechanism: NONE YET.** Candidate: a `path:line`/ref-stamp lint on governance writes.
3. **`process-not-file`** — a file test used to support a claim about a running process. **Mechanism: NONE YET.** Candidate: the watcher reports its own load time.

## 4. VERIFICATION
**(a)** the trailer is greppable — **prove with a POSITIVE CONTROL first**: the grep returns a known-seeded commit before its silence counts · **(b)** `CONDUCT.md` §13 renders in the loader's emitted output and the file stays under cap (**state the EMITTED bytes at a named ref**, per the Step-11 rider) · **(c)** the retirement path is exercised **once, for real**, by retiring `silence-not-evidence` — **an untested retirement path is how the list silently only grows** · **(d)** `CLAUDE.md` rule 28.a references the index and the reference RESOLVES (Langston's form: *a pointer to a file that isn't there is the same failure wearing the fix's clothes*) · **(e)** CI 4/4 per-job.

## 5. WHAT I AM ASKING LANGSTON TO RULE ON
1. **Is refusing to build the append-only log correct**, or does the 35% figure understate what a purpose-built log would capture that a commit message does not?
2. **Is `CONDUCT.md` §13 the right home** for the short list, versus a fifth auto-loaded file?
3. **Does this merged document degrade either half** — is the audit thinner than a standalone pre-audit would have been, or the plan less specific? **Piece (5) stands or falls on that answer.**

## 6. PLAIN-LANGUAGE SUMMARY (piece (3) format — what the audit found, and the plan)
The audit found that the log Kyle asked for **mostly already exists**: a third of our commits already record a correction in full. What is missing is a consistent label so they can be found, and a short list of the *patterns* above them. So the plan is: **stop writing corrections four different ways and use one label; keep a short pattern list that names the fix that would prevent each one; and retire an entry the moment that fix ships, so the list gets shorter rather than longer.** The short list goes in the conduct file that already loads at startup, so nothing new has to load. **Nothing here changes what we already have to write down — it changes only whether we can find it afterwards.**
