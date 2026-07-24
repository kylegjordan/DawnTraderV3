# B-RULES-FRESHNESS — SCOPE

**change-class: architecture**

> **⚠️ WRITTEN AFTER IMPLEMENTATION. That is a deviation and it is stated at the top rather than buried.** The work landed across 8 commits with **no batch id in any subject**, so the governance checker never attributed it and never fired — the absence of alerts here is not evidence of compliance, it is evidence the checker could not see it. **Langston reviewed none of it.** Kyle caught this by asking directly; I had not surfaced it. This scope exists to put the work through the gate it skipped, not to paper it over.
>
> **Why it happened, without excusing it:** the work was directed conversationally, in small increments, each of which felt like a continuation rather than a batch. That is exactly how a batch escapes the workflow — no single step feels large enough to warrant one.

---

## 1. WHAT THE BATCH DID

**Owner:** CC-C (Claude Analyst). **Dates:** 2026-07-24. **Directed by:** Kyle, conversationally, across one session.

**The problem, measured not theorised:** each session loads `CLAUDE.md` from ITS OWN clone, so a session obeys whatever its folder last pulled. Measured 2026-07-24: **CC-B sat 8 commits behind, running a pre-slim rulebook.** Nothing told it, nothing told anyone else. **A stale-rules session throws no error — it quietly obeys the wrong instructions**, which is the worst failure shape available.

---

## 2. OBJECTIVES + VERIFICATION

| # | Objective | How verified | Status |
|---|---|---|---|
| **OBJ-1** | Slim `CLAUDE.md` per **#564** — move diagnostic depth to runbooks, keep every rule | Heading + rule-number diff against the prior version: **28/28 rules present, 0 sections lost.** 664→613 lines, 135,090→122,590 bytes | ✅ |
| **OBJ-2** | Codify the **placement rule** so the next twenty rules do not re-grow the file | Written into §4 of `CLAUDE.md`, with the explicit guard that it is **NOT a licence to trim rules** (Kyle ruled NO-TRIM at #339) | ✅ |
| **OBJ-3** | Fix the **sync-gate false in-sync** — the gate compared against a stale cached pointer | Measured on `C:\DawnTraderV3-old`: reported behind **0**; after `git fetch`, behind **3**. Step 0 (fetch first) added and stated as making the gate INVALID without it | ✅ |
| **OBJ-4** | Auto-refresh the **four protected paths** at session start/resume/**compaction** | 5 behaviours tested: stale→refreshed; uncommitted edit preserved; **unpushed commit preserved**; silent when current; fail-open on error | ✅ |
| **OBJ-5** | **Automatic announcement** when a push changes the protected set | Live-tested against a real rules-changing push; verified the message that reached `#general` | ✅ |
| **OBJ-6** | Instrument it so "is it working?" is answerable | Every hook run appends to `~/.claude/dt-fresh-rules.jsonl`. **Shipped WITHOUT this first — a control with no trace is a rumour** | ✅ |
| **OBJ-7** | Document: the concrete instance + the portable lesson | `REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md` + `BUILD_METHOD_PLAYBOOK.md` Trap 3 | ✅ |
| **OBJ-8** | Governance close (this batch) | Scope + Langston Step-4 + catalog + phase history + completion report | ⏳ **IN PROGRESS** |

---

## 3. ★ THE FOUR PROTECTED PATHS — and why the playbook is NOT one

Kyle's set, and I got it wrong once by substituting the build playbook for the issues file:

| Path | Why it must never be stale |
|---|---|
| `CLAUDE.md` | the instructions — **the only one auto-loaded into context** |
| `.claude/hooks/` + `.claude/settings.local.json` | the guards themselves — **EXECUTED from disk, never in context**, so a stale copy means a guard **silently does not fire**, which is worse than no guard |
| `1-system-manual/RUNNING_ISSUES.md` | two sessions on stale copies claim the **same next issue number** — a collision already hit |
| `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md` | the rule narration — a rule without its origin gets argued away |

**The build playbook is deliberately excluded:** it is a reference read on demand, not something a session must be current on to act correctly. Including it would also have cost **~7,300 tokens per session** if imported.

---

## 4. ★ THE TWO DEFECTS I INTRODUCED AND THEN FOUND — the reason Step-4 matters

1. **Shipped with no logging.** A control that cannot be audited is a rumour, and "is it working?" was the very next question Kyle asked.
2. **★ It ate its own improvement.** I committed a corrected version locally, had not pushed, and the next run reverted it from origin. **"Differs from origin" is NOT the same question as "is stale" — a local commit AHEAD of origin is the newest version.** My first safety check covered only uncommitted edits, the case I had imagined. Both cases are now skipped, with different advice (one says *commit it*, the other says *push it*).

**Both were found by being bitten, not by reasoning.** That is precisely the argument for the review gate this batch skipped.

---

## 5. WHAT IS NOT SOLVED — stated so nobody assumes otherwise

- **No documented way to PURGE already-loaded rules** from a running session. Compaction re-injects the new copy but does not delete the old, so a session briefly holds both. Only `/clear` truly purges, and that ends the conversation.
- **Whether a session actually RE-READ after being told is not observable from outside.** It happens inside the session's reasoning. The honest proxy is *"the file was current and the session was told"* — weaker than proof. Any claim that sessions are "now following the new rules" would be a comfortable fiction.
- **Hook-vs-re-read ordering at compaction is UNDOCUMENTED.** Sidestepped rather than solved: the hook prints, so the fix is correct under either ordering.

---

## 6. FOR LANGSTON — what to review, at `origin/migration/aws-supabase`

Commits `4a3ef8500` → `2ca8b8845` (8). The load-bearing files:
- **`.claude/hooks/fresh-rules.mjs`** (NEW, runs in EVERY session on EVERY compaction — the highest blast-radius item here)
- **`.claude/settings.local.json`** (registers it)
- **`CLAUDE.md`** (§7.1 slimmed + §4 placement rule + sync-gate step 0 + Tier-2 update rules)
- `REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md`, `BUILD_METHOD_PLAYBOOK.md`, `LANGSTON_ARCHITECTURE.md`
- **NOT in the repo:** `/usr/local/bin/dt-push-notice.sh` on Helsinki (the announcement).

**Specific questions I want answered rather than a general nod:**
1. **Is the fail-open correct, or is it too quiet?** It swallows every error. A permanently-broken hook would look identical to a working one that found nothing. Should a repeated failure escalate?
2. **Is the four-path scope right** — anything that should be in it, or anything in it that should not be?
3. **Does the slim lose anything operative?** I verified 28/28 rules and 0 sections by diff, but a diff cannot judge whether a rule became harder to *find*.
4. **Is the retro-close acceptable**, or should something here be redone through the normal gate?
