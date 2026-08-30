# B-INSTRUMENTS-OVER-RULES — SCOPE

change-class: non_architecture

**Owner:** CC-A · **Opened:** 2026-08-30 · **Directive:** Kyle, 2026-08-30 — *"Yes, please scope it as a batch."*
**Placement:** `PHASE_19_PLAN.md` §governance queue — **position TBD, and it is the batch's own OBJ-7 to recommend it** (Kyle is holding the pricing-feed work pending that recommendation).
**Gate:** Langston, Step 1.

> ⛔ **KYLE'S QUESTION, WHICH THIS BATCH EXISTS TO ANSWER, IN HIS WORDS:** *"I'm not sure that I can trust the way that it's currently working through these batches … I don't trust that the sessions are able to digest everything that they need to … We've been building this governance and build system, and maybe it's not the right setup anymore. And if it's not, then what is?"*

---

## 1. THE MEASUREMENT THAT PRODUCED THIS BATCH

**Object:** `B-SCANNER-EGRESS-NORMALISE`, CC-C, the Bitcoin/Dogecoin symbol fix. **Population:** every commit from Step-1 scope `c565ed1d2` to close `fc0043739`. **Measured at the ref, not from the transcript.**

| measure | value |
|---|---|
| commits, scope → close | **18** |
| of those, correcting the batch's own error | ⛔ **10 (56%)** |
| **executable lines shipped** | ⛔ **9** |
| comment lines shipped alongside | **116 — 93% of the diff** |
| governance/process document lines | **1,096** |
| Langston Step-4 rounds | **4** |
| fresh-context readers | **3** |

✅ **AND THE RESULT IS CORRECT. I VERIFIED IT MYSELF AT THE LIVE RUNTIME, WITH CONTROLS** — `/api/vts/filter-diagnostics`, 337 symbols in the live scan: `BTC/USD` **PRESENT**, `DOGE/USD` **PRESENT**, the broken venue forms `XBT/USD` and `XDG/USD` **absent**; controls `ETH/USD`, `ADA/USD`, `SOL/USD` all present, proving the list was populated and the check could have failed.
⇒ ⛔ **THIS BATCH IS NOT ABOUT A BAD OUTCOME. THE OUTCOME WAS RIGHT. IT IS ABOUT THE COST OF REACHING IT, WHICH WAS ~120:1 PAPERWORK-TO-CODE.**

**★ TWO COMMITS NAME KYLE AS THE MECHANISM THAT BROKE THE LOOP, AND THAT IS THE FINDING BEHIND THE FINDING:**
- `b9849080f` — *"Root cause is in the resolver, not the scanner — **and Kyle's instruction is what found it**"*
- `218dbfb72` — *"**The provenance read Kyle ordered**"*
⇒ ⛔⛔ **THE MANDATORY 1.b PROVENANCE READ DID NOT FIRE FROM THE WORKFLOW. IT FIRED BECAUSE KYLE TOLD IT TO.** Kyle's own suspicion — *"I don't know that it's doing the provenance"* — is **CONFIRMED on this batch.** ⚠️ **One batch is one observation; OBJ-6 measures whether it generalises rather than asserting it.**

**★ AND THE 93% COMMENT FIGURE IS NOT STYLE — IT IS THE GOVERNANCE CULTURE LEAKING INTO PRODUCTION SOURCE.** The comment block narrates the batch's own review history *inside `market-scanner.ts`*, e.g. *"my first version of this comment said … WHICH IS FALSE and shipped as such for one commit"* and *"my 'it does nothing for Dogecoin' was measured with an instrument that CANNOT SEE VTS."* **A future reader of that file inherits a confessional, not an explanation.**

---

## 2. THE DIAGNOSIS — AND WHY IT IS NOT "THE MODEL GOT WORSE"

⛔⛔ **WE BUILT A FEEDBACK LOOP WITH NO PRUNING LOOP. EVERY MISTAKE BECOMES A PERMANENT RULE; NOTHING EVER REMOVES ONE.** That was correct at ten rules. **MEASURED at the ref today, the always-loaded set:**

| file | bytes at `origin/migration/aws-supabase` |
|---|---|
| `CLAUDE.md` | **113,007** |
| `CONDUCT.md` | 24,417 |
| shared `MEMORY.md` | 18,796 |
| own `MEMORY_CC_<X>.md` | ~25,942 |
| **total, every session, every start AND every compaction** | **~182,000 B** |

**★ ANTHROPIC'S OWN PUBLISHED GUIDANCE SAYS WHAT THAT DOES, and it is the mechanism, not an opinion** (`anthropic.com/engineering/effective-context-engineering-for-ai-agents`): *"as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"* — **context rot**. It warns against *"hardcoding complex, brittle logic in their prompts,"* which *"creates fragility and increases maintenance complexity over time,"* and against *"stuffing a laundry list of edge cases into a prompt."*
⇒ ⛔ **THE MISTAKES PRODUCE RULES AND THE RULES PRODUCE MISTAKES. That is the wall Kyle is describing, and it is self-inflicted, which also makes it fixable.**

**★ AND A RULE WE HAVE NEVER ONCE APPLIED** (`code.claude.com/docs/en/large-codebases`): *"Revisit after major model releases: instructions that worked around an older model's limitation may become overhead once a newer model handles the case on its own."* **Most of this rulebook was written under Opus 4.x. We run Opus 5. Not one rule has ever been retired on those grounds.**

### 2.1 ⛔ WHAT I AM **NOT** PROPOSING — TWO THINGS ALREADY DECIDED, NAMED SO THEY ARE NOT RE-LITIGATED (§9.5(b-ii))

| already decided | ruling | what this batch does instead |
|---|---|---|
| **Trim `CLAUDE.md` by deleting rules** | ⛔ **`#339` — KYLE RULED NO-TRIM** (nothing deleted or made unfindable); `#564` then produced the PLACEMENT rule (operative statement stays, depth moves to a runbook) | ✅ **OBJ-3 changes what LOADS, not what EXISTS.** No rule is deleted. **A rule that no longer earns its always-loaded slot moves to a skill or a scoped file — the `#564` mechanism, applied to the whole file rather than one section.** |
| **Grade findings by SEVERITY to shrink the pile** | ⛔ **LANGSTON RULED AGAINST IT** (`B_REVIEWER_LOOP_SCOPE.md` F3): *"I'd rather enforce the existing rule than add a severity field nobody calibrates"* — the axis is DISPOSITION, not severity | ⚠️ **OBJ-4 IS A DIFFERENT OBJECT AND I AM FLAGGING IT FOR HIS RULING RATHER THAN ASSUMING IT CLEARS.** He rejected grading **FINDINGS**. OBJ-4 scales the **REVIEW APPARATUS** to the change. **If he reads that as the same ruling, OBJ-4 dies and I will not argue it twice.** |

### 2.2 ⛔ WHAT THIS BATCH DOES **NOT** OWN — `B-REVIEWER-LOOP` ALREADY HAS IT

**`B-REVIEWER-LOOP` (#758, queue 4) already owns the review-QUALITY half** — P1 approach-round, P2 mechanism-claims-cited, P3 the cap's stated reason, P4 the reviewer/receiver split, P6 *"measure exactly one number: REBUILD-ROUNDS PER BATCH."*
⇒ ★ **P6 IS ALREADY THE METRIC FOR EXACTLY WHAT KYLE IS COMPLAINING ABOUT.** ⛔ **This batch must not duplicate it. The split is: `B-REVIEWER-LOOP` makes each round better; THIS batch reduces how many rounds are needed at all, by removing the error class that generates them.**

---

## 3. MANDATORY 1.a — ARCHITECTURAL READ

**Corpora read:** `SYSTEM_IMPACT_MAP.md` §*Session-Instruction Loading Estate (`.claude/hooks/*` SessionStart)* at `:985`, added by `B-CONDUCT-FILE` 2026-08-20; `SYSTEM_MANUAL.md` — **judged NOT APPLICABLE and the judgement is stated rather than skipped: this batch changes no architecture, strategy logic, regime, filter, signal-pipeline or math.**

**The estate this batch touches — five SessionStart hooks, in registration order:**

| # | hook | blast radius per SIM |
|---|---|---|
| 1 | `fresh-rules.mjs` | **MEDIUM** — can restage files into a session |
| 2 | `session-reminder.mjs` | LOW |
| 3 | `load-own-memory.mjs` | LOW |
| 4 | `load-conduct.mjs` | **MEDIUM** — every session's conduct depends on it |
| 5 | `log-instructions-loaded.mjs` | LOW — **registered LAST deliberately, so it observes the full set** |

✅ **HOOK 5 IS THE INSTRUMENT THIS BATCH MEASURES ITSELF WITH** — `~/.claude/instructions-loaded.jsonl` records the actual loaded-set per session start. ⛔ **OBJ-3's success criterion reads THAT SINK, never a stored figure** (`B-RULES-1a` OBJ-1 built it for exactly this).

> **⚠️ FOUND DURING THE 1.a READ — OUT OF SCOPE, DISPOSITION DECLARED (§9.4).** The SIM's estate section asserts *"`CONDUCT.md` is capped at **16,384 B** (~4k tokens)"*. **The live cap is 24,576 B** and the file is at 24,417. **A stale figure in the map of the estate this batch edits.** ⇒ **DISPOSITION 1 — FOLDED INTO THIS BATCH** (OBJ-5's SIM update corrects it). ★ *It is the `#739`/`#740` class again: a governance doc asserting a live value instead of naming where to read it.*

---

## 4. MANDATORY 1.b — PROVENANCE READ

**Corpora searched, named:** `BATCH_CATALOG.md` · `RUNNING_ISSUES.md` · `PHASE_19_PLAN.md` · `POST_AUDIT_ROADMAP.md` · `CLAUDE_CODE_FEATURE_WATCH.md` · the completion reports · `B_REVIEWER_LOOP_SCOPE.md` · `SYSTEM_MANUAL_OVERVIEW.md` · `LEGACY_DEPRECATION_PLAN.md`. **Searched by SYMBOL and CAPABILITY, not by symptom**, per the rule that cost seven weeks on `#174`.

### TIER 1 — behaviour this batch changes

**(a) The always-loaded rulebook (`CLAUDE.md`).** **Original intent, quoted from Kyle verbatim** (`MEMORY_CC_A.md`, the governing instruction of the whole programme): *"all of these little rules … are only going to cause more instruction-file bloat. Note the rules we want followed, but then … have them enforced by runbooks."*
⇒ ⛔⛔ **DISPOSITION (2) — RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT. AND THE UPDATE IS TO FINALLY DO WHAT KYLE ALREADY DIRECTED.** ★ **His instruction was RECORDED and then not carried out: we kept noting rules AND kept them in the always-loaded file. This batch is not a new idea — it is the unexecuted half of a directive already given.**

**(b) The `B-RULES-1a → 1e` programme.** Intent: reduce bytes loaded at session start; **the approved success metric is already *"BYTES ACTUALLY LOADED AT SESSION START, not a gameable line count."*** ⇒ **DISPOSITION (1) — STILL RELEVANT AND CORRECT. This batch does not replace it; OBJ-3 is its missing lever.**

**(c) The five-disposition rule (§9.4).** Intent (Kyle 2026-06-13, trigger corrected 2026-08-27): no surfaced issue may be left without a declared home. ⇒ **DISPOSITION (1) — CORRECT AND STAYS.** ⚠️ **But OBJ-4 must state its interaction honestly: §9.4 converts every reviewer observation into committed work, which is *why* three readers on a nine-line fix produced a saga. The rule is right; it was never sized for three readers per batch.**

### TIER 2 — read or called, one-line intent

- **`log-instructions-loaded.mjs`** — built at `B-RULES-1a` OBJ-1 to make the loaded set measurable rather than asserted. **DISPOSITION (1).**
- **`fresh-rules.mjs`** — keeps a session's rulebook current against the branch. **DISPOSITION (1)**, with a live defect already homed at `#753` (it wrote origin content into a behind-HEAD tree twice on 2026-08-29). **Not this batch's to fix — `B-CROSS-SESSION-BLEED`, queue 2.**
- **Code intelligence / language server for CC sessions** — ⛔ **NO PROVENANCE EXISTS: IT HAS NEVER BEEN PROPOSED, DECIDED OR REJECTED HERE, AND I RAN THE CONTROL BEFORE SAYING SO.** `CLAUDE_CODE_FEATURE_WATCH.md` — **the authoritative dedup ledger for exactly this class** — contains one `LSP` occurrence and it is a passing Claude Code release-note mention of an internal memory leak, not a proposal. **The 26 other `LSP` occurrences are the Replit-era LSP *audit* (Dec 2025) and roadmap item `16.5 LSP Error Resolution` — *"delete legacy files causing LSP errors."* That is consuming an LSP's ERROR OUTPUT; this batch is giving sessions its LOOKUP capability. Different object, named so nobody mistakes one for the other.** ⇒ **DISPOSITION (3) — A CAPABILITY THAT SHOULD BE CONNECTED AND NEVER HAS BEEN.**
  ⚠️ **`INFERRED-FROM-CODE` where it belongs: my word-boundary grep first returned 38 hits for `lsp` and 26 were substring noise (`colSpan`, `goalsPresetName`). The count above is the word-boundary figure with a `NO-TRIM` positive control returning 4.**

---

## 5. OBJECTIVES

> ⛔ **ORDERED BY LEVERAGE. OBJ-1 IS THE BATCH; IF ONLY ONE THING SHIPS, IT IS OBJ-1.**

### **OBJ-1 — GIVE THE SESSIONS AN INSTRUMENT FOR THE ERROR CLASS THAT ACTUALLY BITES: "DOES THIS EXIST / WHO CALLS THIS / IS THIS REACHABLE"**

⛔⛔ **THIS IS THE HIGHEST-LEVERAGE CHANGE AVAILABLE AND NO RULE CAN SUBSTITUTE FOR IT.** **MEASURED, this week, `#946` and the `B-CLAUDEMD-SLIM` completion report: SIX separate instruments called content "absent" in one day and ALL SIX WERE WRONG — and FOUR of the six were BETTER MATCHERS than the one before.** ⇒ **a better matcher is provably not the fix.** The same class produced CC-C's `#906`-premise-is-stale, the LOCKED-module edit, and the "it does nothing for Dogecoin" reversal — **all reachability questions answered by reading text.**
★ **A language server answers them as FACT, from the compiler's own symbol graph.**

**VERIFICATION:** ✅ the plugin is installed and a session demonstrates a **find-references** result on a symbol where `git grep` gives a **different** answer — the discriminating test, not a confirming one. ⛔ **A test both methods pass proves nothing** (`CONDUCT.md` §6b: *would this check have come out differently if I were wrong?*).
**PREREQUISITE ALREADY SATISFIED, MEASURED:** `node_modules/typescript/lib/tsserver.js` **is present** and TypeScript **5.6.3** is the repo's own dependency — the language-server binary the plugin requires is already on the machine.
⚠️ **HONEST LIMIT: install is `/plugin install typescript-lsp@claude-plugins-official`, an INTERACTIVE terminal action, and the org plugin catalogue search returned EMPTY — which is the ORG catalogue, NOT the official marketplace, so it does not refute availability and I will not claim it does. Availability against the official marketplace is unproven until tried. KYLE ACTION, not mine.**

### **OBJ-2 — STOP THE CONFESSIONAL IN PRODUCTION SOURCE**
**A source comment states what the code does and why it is that way. It does NOT narrate the batch's own review history.** The 116-line block in `market-scanner.ts` is the object. ⛔ **The evidence is not deleted — it moves to the completion report and `RUNNING_ISSUES`, where it already partly lives.**
**VERIFICATION:** the surviving comment explains the fix to a reader who has never heard of this batch, and contains **no first-person reference to the author's own corrections**. **Langston judges it; I do not grade my own prose.**

### **OBJ-3 — CHANGE WHAT LOADS, NOT WHAT EXISTS**
⛔ **NO RULE IS DELETED — `#339` NO-TRIM binds.** Apply the `#564` placement rule to the whole file and adopt the mechanism Anthropic documents for this exact problem: **per-directory `CLAUDE.md` and path-scoped rules, so a session loads repository-wide rules PLUS only what its work touches.**
**VERIFICATION:** ✅ **read from `~/.claude/instructions-loaded.jsonl` — the live sink, never a stored figure.** Target stated as a measured before/after at a session start, not asserted. ⛔ **PAIRED NEGATIVE CONTROL, MANDATORY: a session working in a scoped area must still load the repo-wide rules — proven by naming a rule that MUST survive and showing it present. A reduction that silently drops a binding rule is a REGRESSION, not a win.**

### **OBJ-4 — SIZE THE REVIEW TO THE CHANGE ⚠️ GATED ON LANGSTON, AND IT MAY DIE HERE**
**Nine executable lines received three fresh readers and four review rounds.** Proposal: the apparatus scales with the change; the heavy version is reserved for what earns it — **and the pricing-feed and reachability work is exactly what earns it.**
⛔⛔ **LANGSTON MAY RULE THIS IS HIS OWN F3 UNDER A NEW NAME. I HAVE STATED THE DISTINCTION IN §2.1 AND WILL NOT ARGUE IT TWICE.** ⚠️ **AND THE HONEST RISK, NAMED BY ME AND NOT WAITING FOR HIM TO FIND IT: this objective reduces scrutiny, and every other objective here increases capability. It is the only one that could make quality WORSE. If it ships it needs `B-REVIEWER-LOOP` P6's rebuild-rounds metric watching it.**

### **OBJ-5 — GOVERNANCE**
Per the change-class matrix (`d8d4999bb`). ⚠️ **`SYSTEM_IMPACT_MAP.md` is `judged` for `non_architecture` and I am marking it REQUIRED BY JUDGEMENT anyway** — this batch edits the estate the SIM documents, and OBJ-5 carries the §3 stale-cap correction. **Using the class to dodge an applicable doc is the exact failure the matrix was built to expose.**

### **OBJ-6 — MEASURE WHETHER THE 1.b SKIP GENERALISES**
⛔ **ONE BATCH IS ONE OBSERVATION.** Across the last N closed batches, in how many did a provenance read actually happen, and in how many did it happen only because Kyle ordered it? **Deliverable is a NUMBER with its population, or an explicit "the instrument cannot see this" refusal.** ⚠️ **If the skip does NOT generalise, this batch says so and the §1 finding is narrowed to CC-C.**

### **OBJ-7 — THE RECOMMENDATION KYLE IS HOLDING FOR**
**Kyle is holding the pricing-feed work pending this.** Deliverable: **hold, or build in parallel** — with the reasoning stated. ⛔ **DELIVERED AT STEP 1 CLOSE, NOT AT BATCH CLOSE** — he is blocked now, and making him wait for the whole batch would be this batch committing the failure it is diagnosing.

---

## 6. WHAT WOULD FALSIFY THIS BATCH'S PREMISE

★ **STATED UP FRONT SO IT CANNOT BE RATIONALISED AWAY LATER:**
1. **If OBJ-6 finds the provenance read fires normally on most batches**, the §1 diagnosis is CC-C-specific, not systemic — and this batch is over-scoped.
2. **If OBJ-3's measured reduction is small**, then instruction volume is not the binding constraint and the diagnosis in §2 is wrong. **Say so; do not re-frame the target.**
3. **If the language server cannot be installed**, OBJ-1 dies and **the batch's leverage dies with it** — the rest is worth materially less, and this scope should not be salvaged by inflating OBJ-3.
⚠️ **The one thing that will NOT falsify it: that the Bitcoin fix worked. It did. This batch never claimed otherwise.**

---

## 7. SOURCES
`anthropic.com/engineering/effective-context-engineering-for-ai-agents` · `code.claude.com/docs/en/large-codebases` · `code.claude.com/docs/en/best-practices` · `claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start`
