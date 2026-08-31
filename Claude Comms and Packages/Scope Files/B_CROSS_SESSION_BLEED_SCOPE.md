# B-CROSS-SESSION-BLEED — SCOPE (r1)

change-class: non_architecture
**Owner:** CC-B (taken over from CC-A 2026-08-31) · **Issue:** #753 · **Queue:** governance position 2, Kyle-directed 2026-08-27 ahead of the measurement gate · **Status:** Step 1, awaiting Langston

---

## 0. THE MECHANISM IS ESTABLISHED. It is not "why does the hook stage things" — that was fixed. It is that **the fix cannot reach the sessions that need it.**

**★ THE FINDING, and it is structural rather than a coding error:**

> **`fresh-rules.mjs` runs from the session's OWN clone. A session that is behind therefore runs its own STALE COPY OF THE HOOK — and "behind" is simultaneously (a) the condition that makes the hook do the most work and (b) the condition that guarantees the fix is absent. The repair always lands one session late.**

**PROVEN, not inferred — three legs:**

1. **The reset fix landed `4a988bf32`, 2026-08-21.** (`git log -S` on the reset call, whole history, not path-limited.)
2. **My clone's HEAD was `0da05354f`, 2026-08-16 — five days EARLIER.** `git show 0da05354f:.claude/hooks/fresh-rules.mjs | grep reset` returns **only a line-36 comment about `git reset --hard`**; the `run(['reset','--quiet','--',path])` call is **absent**. The hook that executed on me had no index-clearing step.
3. **The consequence is preserved in the stash, which is why it was kept.** `git diff --name-status stash@{0}^1 stash@{0}^2` — the stash's second parent IS the index at stash time — lists **all nine files as staged** (8 × `M`, 1 × `A`). Not modified-only. **The reset demonstrably did not run.**

⇒ **CORRECTION TO THE HANDOVER PREMISE, stated because it is load-bearing:** the brief said *"That is exactly what you and CC-A both saw: ` M` entries, not staged ones."* **For my instance that is false — mine were staged.** The staging half is fixed *in the file at origin*; it was **not fixed in the copy that ran.**

**★ AND THIS UNIFIES THE WHOLE DATASET, which is the test of the explanation.** #753's own instance table records **instance 1 (2026-07-28, CC-B) as STAGED**; CC-A's recent instances are **modified-only**. That split has been unexplained. It is simply **whether the executing clone predated 2026-08-21**: before the fix ⇒ staged; after ⇒ modified-only. **One variable accounts for both populations.** *(Instance 1's stash was DROPPED after proving nothing was lost — which is why the cause survived three instances. Mine is kept.)*

## 0b. CORRECTION TO CC-A'S LEAD — the volume is NOT gap-proportional
CC-A's lead: *"3 files at 43 commits, 9 at 755 — two points is a suggestion, not a curve."* **It is not even a suggestion.** The hook iterates a **fixed five-entry list** (`fresh-rules.mjs:54-60`), and one of those entries is the **`.claude/hooks` DIRECTORY**. My nine files decompose exactly: **5 hook files (one directory entry) + settings + `RUNNING_ISSUES.md` + the rule-history file + `CLAUDE.md` = all five entries differing.** ⇒ **the ceiling is the watched list, not the commit count.** At 755 commits every entry differed, which is the maximum the hook can produce. **A larger gap cannot produce more files; it only makes all five differ.**

## 0c. THE UNUSED VARIABLE — the hook computes how far behind it is and never acts on it
`fresh-rules.mjs:88` computes `behind`; it is written to the log and **never gates anything**. There is no threshold, no cap, no "too far behind to refresh safely" branch. **That is the hook that the open question — *should it write anything at all when the session is behind?* — is actually about.**

## 1. PROVENANCE (MANDATORY 1.b) — TIER 1, behaviour changes here

**Corpora searched:** `git log --reverse` on the path (3 commits: `f67613ce9`, `ae7b8c7c6`, `4a988bf32`); `git log -S` on the reset call, not path-limited; `RUNNING_ISSUES` #753 and #756; `SYSTEM_IMPACT_MAP` (1 mention) and `SYSTEM_MANUAL` (**0** — not a registered trading component).

**Introducing commit `f67613ce9` (2026-07-24), QUOTED VERBATIM:**
> *"The problem, measured not theorised: each session loads CLAUDE.md from ITS OWN clone, so a session obeys whatever its folder last pulled. One session was 8 commits behind, running a pre-slim rulebook, and nothing told it or anyone else."*

and, on why the hooks themselves are in the watched list:
> *"the hooks and settings (executed rather than loaded, so a stale guard silently does not fire - worse than no guard)"*

★ **THE ORIGINAL INTENT IS THE PROBLEM ONE LEVEL UP.** The hook was built because *a session runs stale rules from its own clone*. **The hook is itself a file in that clone.** Its author explicitly identified "a stale guard silently does not fire" as the danger — and the only thing that can refresh the guard is the guard. **This is not a flaw the author missed; it is a fixed point the design cannot escape from inside.**

**DISPOSITION: (2) — RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT.** The hook does its job. What is missing is that **it cannot protect the run it is on**, and nothing reports that it failed to.

## 2. OBJECTIVES

**OBJ-1 — Make the hook state, in its own output, WHICH VERSION OF ITSELF RAN.**
The session is told what was refreshed; it is never told that the refresher was stale. **Verification:** on a clone deliberately set behind the fix, the printed block names the running hook's own commit/date and says plainly that a newer one has just been written for next start. *(This is the wake-condition Kyle named: anything we ship must report whether it is actually live per session.)*

**OBJ-2 — Decide and implement what the hook does when it cannot safely refresh itself.**
Options to be ruled at Step 1, NOT chosen unilaterally: **(a)** refresh everything except `.claude/hooks`, leaving guard updates to a deliberate pull; **(b)** refresh, and REFUSE to leave anything in the index by verifying the index is clean afterwards rather than assuming `reset` ran; **(c)** gate on `behind` — above a threshold, refresh nothing and report loudly. **Verification:** the chosen behaviour is exercised offline against a clone pinned before 2026-08-21 and one pinned after, and the index is asserted empty in both.

**OBJ-3 — Assert the post-condition instead of trusting the command.**
The current code runs `reset` inside a `try{}catch{}` whose catch is a bare comment. **Verification:** after the refresh loop, `git diff --cached --name-only` is empty, or the hook reports the leak by name. A guard that cannot tell whether it worked is the shape of every instance in #753.

**OBJ-4 — Record the four instances against one explanation.**
Update #753 with the staged-vs-modified split resolved by clone date. **Verification:** the entry states the rule and the four instances are each assigned to a side of 2026-08-21.

## 3. ⛔ SCOPE BOUNDARY — offline proof before the live path
This hook runs at **every session start for all four sessions**; a change reaches everyone on their next pull. **All testing happens in a throwaway clone, never in a live session's clone.** *(CC-A took comms down for four minutes last week testing a hook change in production and could not diagnose it afterwards.)* **The stash stays until Langston agrees the cause is established** — instance 1's stash was dropped after the content was proven safe, and that is precisely why this is instance four with no cause on record.

## 4. NOT IN SCOPE
The whole-filesystem-scan guard (**#756 — DELETED as unenforceable**), and any change to what the five watched entries are.

---

# r2 — SECOND-READER PASS (Kyle-directed). THREE CORRECTIONS, ONE OF THEM TO THE CENTRAL CLAIM.

A hostile second reader was run against r1's load-bearing points before Langston sees it. It refuted the central inference and one quote. Both refutations stand. **The corrected mechanism is SIMPLER than r1's and it removes the phrase "cross-session" from my instance entirely.**

## C1 — ⛔ r1's CENTRAL INFERENCE WAS WRONG: HEAD does not decide which hook runs. THE ON-DISK FILE DOES.
r1 said *"a session whose clone predates 2026-08-21 will execute the OLD hook."* **False.** The hook is a fresh `node` child process per invocation reading the **working-tree file**; that file is whatever the PREVIOUS run wrote, and the hook rewrites it from origin regardless of HEAD. A clone can sit at an old HEAD with a brand-new hook on disk.

**THE CORRECTED RULE:** **a clone's exposure is ONE RUN — the first session start after a hook fix reaches origin.** After that run the new hook is on disk and every later run is protected, *whatever HEAD says*.

★ **AND THAT IS WHY DORMANCY IS THE REAL VARIABLE, not the commit gap.** The window is bounded at one run but its TIMING is arbitrary: the fix landed 2026-08-21; my clone's next run was **2026-08-31**. **I hit a one-shot window ten days after it opened, because nothing ran in between.** The commit gap (755) is a *symptom* of the dormancy, not the cause of the staging.

## C2 — ★ MY NINE FILES ARE TWO SEPARATE EVENTS, TEN DAYS APART. r1 reported them as one.
The hook's own run log (`~/.claude/dt-fresh-rules.jsonl`, this clone, 45 runs) settles it:

| when | refreshed | result |
|---|---|---|
| **2026-08-16T22:40:24Z** | `RUNNING_ISSUES.md` | **staged it** — pre-fix hook, no reset. Then sat staged through 15 days of dormancy. |
| **2026-08-31T09:56:44Z** | `CLAUDE.md`, `.claude/hooks`, `settings.local.json`, `CLAUDE_MD_RULE_HISTORY.md` | **staged 8 files** (the hooks entry is a directory = 5 files). **Correctly SKIPPED `RUNNING_ISSUES.md` as already-dirty.** |

**1 + 8 = 9.** Same cause both times (the on-disk hook had no reset); **two occurrences, not one.**

## C3 — ⛔ MY OWN ATTRIBUTION FOR `RUNNING_ISSUES.md` WAS AN ARTIFACT OF MY TRACING METHOD.
r1 and the Discord post said the file traced to **`734262f17`**. **`734262f17` never touched `RUNNING_ISSUES.md`.** `git rev-list HEAD..origin` emits **newest-first**, and I took `head -1` — so I named **the newest commit still CARRYING that blob**, not its source. **Proof of the real source:** origin's `RUNNING_ISSUES.md` at the instant of my 08-16 run (`23ac6939d`) is blob `b8197398f…`, **byte-identical to what was in my index.** ⇒ **my own session staged it, from origin, on 2026-08-16.** *(The other attribution, `5997c4e56` for today's 8 files, was re-checked the same way and DOES hold — it was origin's head at run time and all three sampled blobs match.)*
⚠️ **The stash label still names `734262f17` and is now known-wrong metadata. It is NOT being amended — rewriting the label would edit the artifact. The correction lives here.**

## ★★ WHAT THIS DOES TO THE BATCH'S PREMISE — say it plainly
**Nothing in my instance was another session writing into my clone.** Every one of the nine files was **checked out from ORIGIN by my own hook**, and left in the index because that copy of the hook had no reset. ⇒ **for this instance the name "cross-session bleed" describes an appearance, not a mechanism.** The content belonged to other sessions only in the sense that *everything at origin does*.

**#753 says the mechanism "has never been established."** On this evidence it is: **the hook refreshes from origin and, before 2026-08-21, left the result staged.** The staged-vs-modified split across the four instances is entirely accounted for by whether the *executing on-disk hook* predated that fix — no second mechanism is required, and no session ever wrote into another's tree.

⚠️ **WHAT I HAVE NOT ESTABLISHED, stated so it is not read as covered:** I have proven this for **my two occurrences**. #753's instances 2 and 3 are CC-A's and I have not re-derived them at their refs. **If either shows content that was NEVER at origin, this explanation is incomplete and a second mechanism exists.** That check belongs in Step 2.

## CORRECTION TO r1's OWN CEILING FIGURE
r1 said nine files is the ceiling. **It is 14** — 4 single-file entries + the 10 files currently in the hooks directory. Nine was what *differed*, not the maximum.

## OBJECTIVES — UNCHANGED IN SUBSTANCE, RE-AIMED
OBJ-1/3 (report which version ran; assert the index is clean rather than trusting `reset`) are **strengthened** by C1: the one-run exposure is exactly the window in which a hook cannot vouch for itself. **OBJ-2's option (c) — gate on `behind` — is now the WEAKEST option**, because the commit gap is not the causal variable; **time-since-last-run is.** OBJ-4 must record the two-events split and the tracing artefact, not the r1 version.
