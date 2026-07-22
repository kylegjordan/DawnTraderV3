# B-REPO-RELOCATE — SCOPE (Step 1)

> **change-class: architecture**
> **Owner:** Claude Analyst (CC-C). **Reviewer:** Langston. **Decider:** Kyle — this one is his, not ours (see §2).
> **Origin:** Kyle's proposal, 2026-07-22, in his own words: *"We move the work repo onto my local laptop hard drive. All the work is done there. We have three different work trees… And then, I guess, those work trees then merge onto the main repo work folder on my local laptop hard drive. From there, that gets pushed to Google Drive and GitHub simultaneously. And from there, it goes from GitHub to staging like it always does. My question is, in that scenario, which do we consider the source of truth?"*
> **Status:** DRAFT for Langston Step-1 review. **Not implemented. Nothing has moved.**

---

## 0. ⚠️ READ THIS FIRST — THIS PROPOSAL REVERSES A RULE KYLE SET IN STONE

`CLAUDE.md` §7.1 is marked **"🔒 SET IN STONE — Kyle directive 2026-06-01 — NEVER delete, NEVER edit out, NEVER reverse."** It states: *"The Google Drive folder … is the SOURCE OF TRUTH. ALL development — code AND governance — ORIGINATES here."*

**Kyle's proposal moves origination to his laptop and demotes Google Drive to a push target. That is a direct reversal of the letter of §7.1.**

This is **not** a violation — Kyle is the only person who can amend governance, and he is proposing it himself. But it **cannot be adopted by implication.** §7.1 says *never reverse*, and it says so because of a real incident. So this scope makes the conflict explicit and asks for an explicit amendment rather than quietly editing the rule.

**Why §7.1 exists (from the rule itself):** on 2026-06-01 the flow was found **inverted in practice** — work had been edited, committed and pushed from the `C:\dev` bench, leaving the Google Drive source-of-truth folder **42 commits stale**, with one governance item (a Kyle directive) **stranded on GitHub and never reaching Drive.**

**★ THE ARGUMENT THAT MAKES THIS WORTH DOING ANYWAY — the proposal removes the CONDITION that made §7.1 necessary.** §7.1 exists because `node_modules` cannot be installed on the Google Drive FUSE mount (`EBADF` on npm's many-small-files write pattern), so a **second** tree (`C:\dev`) had to exist purely to run `tsc` and `vitest`. **Two trees with different capabilities is what created the inversion**: the only place you can test is a place you must never push from, so the discipline was entirely manual and it failed. **Kyle's proposal collapses authoring and testing into ONE local tree**, which is the structural fix — not a relaxation of the rule but a removal of its cause. That case should be made to Kyle plainly, and it is the strongest argument in favour.

---

## 1. ANSWER TO KYLE'S DIRECT QUESTION: WHICH IS THE SOURCE OF TRUTH?

**Recommendation: GitHub.** Stated plainly because the ambiguity here is what produced the 2026-06-01 incident.

| Location | Role under this proposal |
|---|---|
| **GitHub** (`migration/aws-supabase`) | **SOURCE OF TRUTH.** It is already what staging deploys from and what Langston grades at (`origin/migration/aws-supabase`). Every existing verification rule already points here. |
| **Kyle's laptop tree (+ worktrees)** | **Where work ORIGINATES.** Authoritative for uncommitted work only. Nothing is real until pushed. |
| **Google Drive folder** | **MIRROR / backup + Langston's browse path.** Receives every push. Never authored in, never pushed from. |

**Why GitHub and not the laptop:** the laptop holds work-in-progress that nobody else can see and that no rule grades against. **A source of truth that only one machine can read is not a source of truth** — it is a single point of failure with a nice name. Everything the crew actually consumes (CI, staging deploys, Langston's review, every `file:line` citation rule) already resolves against GitHub. Naming Drive as "source of truth" while GitHub was what everything actually consumed is precisely the confusion §7.1 was written after.

**Consequence to state to Kyle in one line:** *if it isn't pushed, it doesn't exist.* That is stricter than today, not looser.

---

## 2. WHAT THIS SCOPE IS AND IS NOT

**IS:** a decision paper + migration plan for where the working repository lives and how it flows to GitHub, Drive, and staging.

**IS NOT:**
- ❌ **NOT multiple staging sites.** Kyle ruled on this directly: *"I can't have three separate staging sites."* **There remains exactly ONE staging server** (Hetzner `188.245.193.8`) and ONE staging deploy path (GitHub → staging). Nothing in this proposal changes that. If "three worktrees" has been heard as "three staging environments" anywhere, that reading is wrong and this line exists to kill it.
- ❌ NOT a change to CI, the deploy command, or the branch model.
- ❌ NOT a change to the 11-step workflow.

---

## 3. WHAT "THREE WORKTREES" ACTUALLY MEANS — plain language, because Kyle asked what a git is

A **worktree** is a second folder that checks out a *different branch of the same repository*. There is still **one** repository and **one** history; you just get more than one folder to work in, so three sessions can work on three different things at once without overwriting each other's files.

**Correcting one thing in the proposal's wording, gently:** worktrees don't "merge onto the main folder." **You merge BRANCHES, not folders.** Each session works on its own branch in its own folder; when a piece is done, its *branch* is merged into the main branch, and the main folder then shows the merged result. The folders never combine — the histories do.

**What it buys us, concretely (verified, not asserted):** the spike (`B_SPIKE_PER_SESSION_INDEX_REPORT.md`) established that `git worktree add` **seeds its index from HEAD by construction.** That structurally eliminates **#557**, the shared-staging-area race in which one session's commit sweeps in another session's staged files — which happened **twice today**, the second time *while the agreed mitigation was in use*, proving convention alone insufficient.

**⚠️ What it does NOT buy us:** worktrees do **not** solve the coordination problem — knowing *who is editing what* before two people edit the same file. That is a separate problem with a separate solution (**#554**, the coordination board). These were conflated once already and the conflation is corrected in that batch's pre-audit; do not re-merge them.

---

## 4. VERIFIED FACTS THIS SCOPE RESTS ON (measured 2026-07-22, not recalled)

| Claim | Evidence |
|---|---|
| **Langston can reach GitHub directly** | `git ls-remote https://github.com/kylegjordan/DawnTraderV3 HEAD` as the `langston` user returned `88020fe5989a…` in <25s. |
| **Langston has NO local clone** | `ls -d ~/*/.git ~/repo` → "No such file or directory". He reads the repo **only** through the Drive mount today. |
| **The Drive mount is SLOW, not broken** | `ls /mnt/gdrive` = **8.505s real**, load average **0.40**, mount present in `mount`. (Stated carefully: a 20s timeout on a *deeper* path returned empty and I did **not** treat that as "wedged" — that exact inference was wrong once today already.) |
| **Worktrees already exist on the Drive mount** | `git worktree list` shows `.claude/worktrees/agent-ae6af331` and `.claude/worktrees/wizardly-einstein` inside the current repo. So worktrees are not hypothetical here — they are already in use, on the mount, today. |

**★ The first two facts together resolve the open question I had been carrying.** I had flagged *"what does Langston review against once the authoritative tree is on Kyle's laptop?"* as a possible blocker. **It is not one.** He already reviews at the graded ref (`origin/migration/aws-supabase`), and he can fetch that from GitHub without the Drive mount at all. **Pointing him at GitHub instead of the mount is an improvement on its own merits** — it is the ref he is supposed to grade at, and it is faster than an 8.5-second filesystem.

---

## 5. OBJECTIVES

1. **OBJ-1 — Kyle amends §7.1 explicitly**, or declines. No implementation before this. The amendment must preserve §7.1's *history section* (why it was set in stone) — that record must not be deleted, only superseded, per the rule's own terms.
2. **OBJ-2 — Establish the laptop repository** on local NTFS with three worktrees, one per session, each on its own branch.
3. **OBJ-3 — Dual push.** One `git push` reaches both GitHub and the Drive mirror (git supports multiple push URLs on a single remote — no wrapper script, no second command to forget).
4. **OBJ-4 — Re-point Langston at GitHub** for repo reads, with the Drive mount retained as fallback/browse only.
5. **OBJ-5 — Retire `C:\dev`** as a separate test bench once authoring and testing share one local tree — removing the two-trees-with-different-capabilities condition that caused the original inversion. Per rule 18, this is a real deletion with a `DELETED_COMPONENTS_LOG` entry, not a stub left lying around.
6. **OBJ-6 — Rewrite `CLAUDE.md` §7.1** to the new flow, and update the batch-close sync gate, which currently checks Drive↔GitHub in both directions and would otherwise be checking the wrong pair.

---

## 6. OPEN QUESTIONS FOR LANGSTON

1. **Is GitHub-as-source-of-truth the right answer to Kyle's question, or do you read it differently?** I have argued it above; attack it. The counter-argument I can see: Drive is the only copy that survives a laptop failure *and* a GitHub outage, and "source of truth" sometimes means "last thing standing" rather than "what everything reads."
2. **Does the Drive mirror need to be verified, or just written?** A push that silently fails to one of two URLs is exactly the silent-divergence shape that produced the 42-commit staleness. I lean toward the batch-close sync gate checking the mirror explicitly rather than trusting the push.
3. **Per-worktree `node_modules`:** three worktrees means three installs (~26s each, plus disk). Acceptable, or do we share a store?
4. **Sequencing against #554 (the coordination board).** They are independent, but both touch how sessions avoid colliding. Does the board land first, this first, or in parallel?

---

## 7. ⚠️ INCOMPLETE — WHAT I DO NOT HAVE, STATED RATHER THAN GUESSED

**CC-B raised a substantive objection to this proposal. I do not have it captured verbatim, and I am not going to reconstruct it from memory and argue against a version of it I invented.** I searched the Discord log for the relocation thread and **found no record of it** — consistent with my own standing note that the proposal was discussed with Kyle directly and I never dispatched it to the crew.

**Required before Step-2: get CC-B's objection in his own words and fold it in.** A scope that summarises an objection nobody can check is worse than one that admits the gap.

---

## 8. RISK REGISTER

| Risk | Mitigation |
|---|---|
| **Silent mirror divergence** (the 2026-06-01 failure, reborn) | Batch-close sync gate verifies Drive mirror explicitly; open question 2. |
| Laptop loss before push | "If it isn't pushed, it doesn't exist" becomes the stated rule; push early, push often. |
| Langston left reading a lagging mirror | OBJ-4 re-points him at GitHub — the ref he is supposed to grade at anyway. |
| **Migration performed while three sessions have uncommitted work** | Hard precondition: every session pushes clean and confirms zero-ahead/zero-behind **before** anything moves. |
| §7.1 amended sloppily, losing the incident record | Amendment supersedes and preserves; the history section is not deleted. |
