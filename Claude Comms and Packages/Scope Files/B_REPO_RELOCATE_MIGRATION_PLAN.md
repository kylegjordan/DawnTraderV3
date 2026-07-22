# B-REPO-RELOCATE — MIGRATION PLAN (Step 2)

> **change-class: architecture**
> **Owner:** Claude Analyst (CC-C). **Reviewer:** Langston. **Decider:** Kyle.
> **Status:** DRAFT for Langston Step-2 acceptance. **Nothing has moved.**
> **★ KYLE'S STANDING AUTHORIZATION (2026-07-23, verbatim):** *"Run the new laptop harddrive work tree to github review branch (and Google Drive) to staging and then to the main branch (when approved) plan. If he accepts, I accept. This is only for you and Langston. No need to get the other sessions' feedback."*
>
> **⇒ Langston's acceptance of THIS plan IS Kyle's acceptance.** That includes the §7.1 amendment (the set-in-stone rule): Kyle's "if he accepts, I accept" is his explicit sign-off, conditioned on Langston. Pairwise — CC-C + Langston — by Kyle's instruction; the other sessions are not consulted.

---

## 0. WHAT THIS ADDS BEYOND THE APPROVED STEP-1 SCOPE — stated honestly, not smuggled

The Step-1 scope (`B_REPO_RELOCATE_SCOPE.md`, Langston-APPROVED) settled: source of truth = **GitHub**; dual-push with **mandatory** mirror verification; **isolated** per-worktree installs; Langston gets a **GitHub-fed clone**; retire `C:\dev`; rewrite §7.1. It also left two things open (its §6 Q5/Q6): Option A (relocate) vs Option C (enforce §7.1's direction), and the OBJ-4 access mechanism.

**Kyle has now decided, and his decision resolves both open questions AND adds one new dimension:**

1. **Option A is chosen** — relocate to the laptop. Option C (leave Drive authoritative, add only a gate) is off the table by Kyle's call.
2. **NEW — a two-tier branch model.** Step-1 §2 explicitly said *"NOT a change to the branch model."* Kyle's authorized flow **is** a branch-model change: work flows **review branch → (staging, verified) → main branch (when approved)**. This plan surfaces that as new-beyond-approved-scope and is the main thing Langston is being asked to accept.
3. **NEW — moving the three live Claude sessions without losing them** (§6). Kyle's hard constraint: *"I do not want to [start fresh sessions]. There has to be a workaround."*

---

## 1. THE END-TO-END FLOW (the picture, one direction only)

```
  Kyle's laptop (local NTFS)
    ├─ worktree A  (OLD Claude / CC-A)   ── own branch
    ├─ worktree B  (NEW Claude / CC-B)   ── own branch
    └─ worktree C  (Analyst / CC-C)      ── own branch
           │  merge each session-branch  →  REVIEW branch
           ▼
   git push  ──►  GitHub  (review branch = migration/aws-supabase)      ← SOURCE OF TRUTH
             └─►  Google Drive mirror (review branch)                    ← durability copy, verified每 push
           │
           ▼
        Staging  (deploys the REVIEW branch, exactly as today)           ← where a batch is verified
           │
           ▼  batch verified on staging + approved
   REVIEW branch  ──merge──►  MAIN branch (protected)                    ← blessed, verified rollback trunk
```

**Reading the picture:** sessions author locally in isolated worktrees; every push lands on the **review branch** at GitHub **and** the Drive mirror together; staging keeps deploying the **review branch** (no deploy-path change at all); and a batch that is verified on staging and approved advances the **main branch**. Governance docs are ordinary tracked files, so they ride every push to GitHub **and** the Drive mirror automatically; they also physically land on staging but sit inert there (staging runs code, not docs).

---

## 2. THE BRANCH MODEL — the new decision

**Today:** `migration/aws-supabase` is the working branch (staging deploys it, Langston grades at `origin/migration/aws-supabase`, CI runs on it). `dawntrader-v4` is the nominal main, **FROZEN since 2026-03-30**, now **2,749 commits behind** (measured 2026-07-23, `git rev-list --count`). So there is effectively one live branch today.

**Proposed two-tier model:**

| Tier | Branch | Role |
|---|---|---|
| **Review / integration** | **`migration/aws-supabase`** (keep as-is) | Where all three sessions' work integrates. **Staging deploys THIS.** Drive mirrors THIS. Langston grades at THIS ref. **Nothing about the current review/deploy/citation path changes** — it is renamed in role only, not in name. |
| **Main / trunk** | **a protected `main`** (see decision D-2) | Receives only staging-**verified**, **approved** work. Never deployed anywhere; it is the known-good **rollback anchor** and the clean released-history record. Protected so no session can push to it directly. |

**Why staging deploys the REVIEW branch, not main** — this is the piece that resolves the ordering problem Kyle raised. A batch must be **verified on staging before it is allowed onto main**. If staging deployed main, you could never verify a batch before it reached main — the chicken-and-egg. Deploying the review branch means staging exercises work *before* it is blessed; main only ever advances to states that staging already proved good.

**How main advances — the honest operational nuance.** Three sessions push to the review branch continuously, so the review branch is essentially *never* in an "everything is verified" state — there is always something mid-flight. Therefore main does **not** advance per-individual-batch (you cannot cleanly lift one interleaved batch out). Instead **main fast-forwards to a review-branch commit that is a known-good checkpoint** — a point where the in-flight work up to it is verified/closed. In practice this is a periodic reconciliation at quiet points, not a per-commit merge. (Decision D-3.)

**The one-time reconciliation.** Whatever `main` becomes, its first value is *current review-branch HEAD* — because everything that IS the system already lives on the review branch. `dawntrader-v4` (2,749 behind, frozen) is legacy; it is not a clean base to build main from. Decision D-2 is whether main is a **fresh branch cut from review HEAD** (clean, my lean) or a **revived `dawntrader-v4`** (requires proving it can fast-forward — they may have divergent history; unverified).

---

## 3. WORKTREES + PER-SESSION BRANCHES — the mechanic Step-1 didn't spell out

Git **forbids two worktrees checked out on the same branch simultaneously.** So "three worktrees, one per session" mechanically **requires three session-branches** — each worktree sits on its own branch, and those branches merge into the review branch. This is stricter and cleaner than "everyone commits on migration/aws-supabase directly," and it is what structurally kills **#557** (the shared-staging-index race that fired twice on 2026-07-22): each worktree has its own index seeded from HEAD, so one session's commit can never sweep in another's staged files.

- **Alternative considered — three independent CLONES instead of worktrees.** Clones *can* all sit on the same branch (no shared-branch restriction), at the cost of more disk and no shared object store. Worktrees are lighter and are what Kyle named. **Recommendation: worktrees + per-session branches.** (Decision D-1.)
- **Per-worktree `node_modules` stay ISOLATED** — already ruled by Langston at Step-1 (a shared store reintroduces the cross-worktree coupling the worktrees exist to remove).

---

## 4. DUAL-PUSH + MANDATORY MIRROR VERIFICATION (carried from Step-1, unchanged)

One `git push` reaches **both** GitHub and the Drive mirror via two push-URLs on one remote — no wrapper, no second command to forget. **But** git reports success/failure **per-URL and non-atomically**: GitHub can succeed while Drive fails, which is the 42-commit divergence shape mid-flight. So **partial success is the default failure mode, not an edge case**, and the batch-close sync gate must **compare both remotes' HEADs explicitly** (`git ls-remote` each, compare SHAs) and **never trust the push exit code.** This replaces the current Drive↔GitHub bidirectional count check.

---

## 5. LANGSTON'S FILE ACCESS — a GitHub-fed clone (OBJ-4, his preferred mechanism)

Langston reviews at the graded ref, which needs a **local repository to fetch into** — `git show origin/<branch>:<path>` reads objects, and objects need somewhere to live. So he gets a **bare/mirror clone on his own box that he `git fetch --prune`es before each review**, fed from **GitHub, not the Drive mount.** This makes his read idiom identical to today, removes his dependency on the 8.5-second Drive mount, and points him at the exact ref he is supposed to grade at. **Proven 2026-07-22:** his box cloned the branch from GitHub and read file contents at the ref — ~320 MB, under three minutes. The Drive mount is retained as browse-only fallback.

---

## 6. MOVING THE THREE LIVE SESSIONS WITHOUT LOSING THEM — Kyle's hard constraint

Three things live in three different places, and only one is path-sensitive:

| Item | Where it lives | Effect of the move |
|---|---|---|
| **CLAUDE.md** | inside the repo | Travels with the repo automatically; every worktree gets it. **Nothing to do.** |
| **MEMORY files** (shared + `MEMORY_CC_A/B/C`) | (a) a copy inside the repo `.claude/memory/`; (b) the "live" copy the app auto-loads, in the app's own per-project storage | (a) travels with the repo. (b) is the path-sensitive one — **but its content is already safe**, because it is mirrored into the repo and committed daily. |
| **Session history** (each session's transcript; what lets a session resume) | the app's per-project storage folder | Path-sensitive — same folder as (b). |

**The risk, demonstrated not asserted.** The app files each project's memory + history under a folder **named after the repo's path on disk** (a literal path-slug). Evidence: the app's storage right now contains two near-identical folders differing by a **single character** in the path (`…DT-Clone-Repo…` vs `…DT-Clone_Repo…`) — live proof that a tiny path change makes the app treat it as a brand-new project with empty memory. **That is exactly the "start fresh" trap, and it is real.**

**The workaround (mechanism confirmed; end-to-end test gated).** Because the storage folder is just named after the path, before switching we **copy the existing per-project storage folder (memory + session history) to the new-path name.** A session opened at the new location then finds its memory and its whole history already there — nothing starts fresh. Under worktrees each session's folder is a distinct path, so each session's storage is pre-seeded into its own worktree's slug folder.

> **⚠️ HONEST CAVEAT — one thing I confirmed, one I did not.** I confirmed the folder **naming** is a predictable path-slug (the two-folder evidence above). I have **not** confirmed the app cleanly *reopens an old conversation* from copied files (a transcript may carry the old absolute path internally). **So the plan GATES the real move behind a 5-minute throwaway-session test:** create a scratch repo at a new path, pre-seed a copy, open a session there, confirm memory loads and a prior conversation resumes. Only after that passes do we move the three real sessions. **Same "verify before you build on it" discipline this crew runs on.**

**The running sessions are not force-closed.** Their live context is in the open conversation, not on disk, so moving files does not erase it. Two options to avoid any disruption to the three sessions open right now (Decision D-4): **(a)** point the old path at the new location (a directory junction) so their existing commands keep resolving during the transition; or **(b)** let each session roll onto the new location the next time it naturally restarts. Either way: no forced fresh start.

---

## 7. RETIRE `C:\dev` (OBJ-5, carried from Step-1)

Once authoring and testing share one local NTFS tree, the two-trees-with-different-capabilities condition that caused the 2026-06-01 inversion is gone. `C:\dev` is a real deletion with a `DELETED_COMPONENTS_LOG.md` entry per rule 18, not a stub left lying around. Testing (`tsc` baseline + `vitest`) runs in the local worktrees, which — unlike the Drive mount — can hold a healthy `node_modules`.

---

## 8. §7.1 REWRITE — the set-in-stone amendment

The replacement wording is already drafted for Kyle in `B_REPO_RELOCATE_AMENDMENT_DRAFT.md`: GitHub named source of truth; Drive an explicitly-labelled verified mirror; mirror verification mandatory; and — critically — the 2026-06-01 incident record **preserved verbatim under a SUPERSEDED heading, never deleted**, with the corrected root cause (the frozen git pointer, not the bench push) noted beneath it. Per Kyle's standing authorization, **Langston's acceptance of this plan carries the amendment**; the rewrite lands as OBJ-6 during implementation, and the batch-close sync gate is updated to the new both-remotes-HEAD check (§4).

---

## 9. MIGRATION RUNBOOK (ordered, reversible; nothing runs until Langston accepts + the §6 test passes)

1. **Precondition — clean trees.** Every session pushes clean; confirm **zero-ahead / zero-behind** for all three before anything moves. No session carries uncommitted work into the move.
2. **§6 portability test** — the 5-minute throwaway-session test passes (memory loads + a prior conversation resumes at a new path). **Hard gate.**
3. **Stand up the laptop repository** on local NTFS; create three worktrees, one per session, each on its own branch.
4. **Configure dual-push** (two push-URLs on one remote: GitHub + Drive mirror) and the both-remotes-HEAD verification check.
5. **Pre-seed each session's app storage** (memory + history) into its worktree's path-slug folder.
6. **Give Langston his GitHub-fed bare/mirror clone;** confirm `git fetch --prune` + `git show origin/<ref>:<path>` works from it.
7. **Establish `main`** (D-2) at review-branch HEAD; apply branch protection.
8. **Move the three sessions** (D-4: junction or natural-restart). Verify each loads memory + resumes.
9. **Retire `C:\dev`** with the deletion-log entry.
10. **Land §7.1 rewrite + sync-gate update;** full governance close.

**Reversibility:** through step 8 the Drive folder still exists untouched as today's authoritative tree; if anything fails we simply keep working from it and nothing is lost. The point of no return is only after the sessions are confirmed healthy at the new location.

---

## 10. DECISIONS FOR LANGSTON — each with my recommendation

- **D-1 — Worktrees + per-session branches, or three independent clones?** *Rec: worktrees + per-session branches* (lighter, shared object store, what kills #557; clones only needed if we wanted sessions on the same branch, which the per-session-branch model makes unnecessary).
- **D-2 — `main` = a fresh branch cut from review HEAD, or revive `dawntrader-v4`?** *Rec: fresh `main` from review HEAD* (clean; `dawntrader-v4` is 2,749 behind and may not fast-forward — divergent history unverified). Leave `dawntrader-v4` as a frozen archive.
- **D-3 — main advances by periodic known-good fast-forward, not per-batch merge?** *Rec: yes, periodic fast-forward to a verified/closed review checkpoint* (three concurrent sessions make per-batch extraction from an interleaved branch impractical).
- **D-4 — During-move continuity for the three open sessions: directory junction, or natural-restart rollover?** *Rec: natural-restart rollover after the §6 test passes*, with a junction available as belt-and-suspenders if any session must keep running through the move.
- **D-5 — Anything you want changed about the both-remotes-HEAD mirror-verification gate** replacing the current Drive↔GitHub bidirectional count check.

---

## 11. RISK REGISTER (deltas from Step-1)

| Risk | Mitigation |
|---|---|
| **Session memory/history lost on move** (Kyle's stated fear) | §6 path-slug pre-seed; **hard-gated behind the throwaway-session test**; Drive tree stays intact until sessions confirmed healthy. |
| **Silent mirror divergence** (2026-06-01 reborn) | Both-remotes-HEAD gate at batch close; never trust push exit code (§4). |
| **`main` reconciliation corrupts history** | Fresh `main` from review HEAD avoids the divergent-fast-forward question entirely (D-2). |
| **Branch-model change confuses the deploy path** | It does not change: staging still deploys the review branch (`migration/aws-supabase`) by the same command. Main is never deployed. |
| Laptop loss before push | "If it isn't pushed, it doesn't exist" is the stated rule; push early, push often; Drive mirror is the durability copy. |
