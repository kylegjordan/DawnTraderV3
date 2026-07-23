# B-REPO-RELOCATE — MIGRATION PLAN (Step 2)

> **change-class: architecture**
> **Owner:** Claude Analyst (CC-C). **Reviewer:** Langston. **Decider:** Kyle.
> **Status:** ★ **ACCEPTED by Langston 2026-07-23** (= Kyle's acceptance, per his standing authorization) — see §12. **★★ THEN REVISED MID-IMPLEMENTATION, ALSO RULED BY LANGSTON — see §13, WHICH SUPERSEDES §3, §6 and D-1/D-4 of §10.** In short: separate **clones on the shared branch** (not worktrees on per-session branches), and **NO SESSION RELOCATES AT ALL**. **Nothing has been moved or deleted; the Drive tree and all session storage are untouched.**
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

**The one-time reconciliation.** Whatever `main` becomes, its first value is *current review-branch HEAD* — because everything that IS the system already lives on the review branch. **★ Measured (Langston, 2026-07-23): `origin/dawntrader-v4` is a STRICT ANCESTOR of the review branch — 0 commits not on review, review 2,752 ahead — so it *would* fast-forward cleanly.** My earlier "may not fast-forward / divergent history" was an unverified claim and is refuted; recorded so it does not stand as precedent. Decision D-2 therefore prefers a **fresh `main` cut from review HEAD** for the honest reason — a cleanly-named protected trunk — **not** because `dawntrader-v4` is unmergeable. `dawntrader-v4` stays a frozen archive either way.

---

## 3. WORKTREES + PER-SESSION BRANCHES — the mechanic Step-1 didn't spell out

> ⛔ **SUPERSEDED BY §13.1 — the worktree/per-session-branch design was OVERTURNED. Separate clones on the shared branch replaced it. Kept for decision history; do not build from this section.**

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

> ⛔ **SUPERSEDED BY §13.2 — this objective DISSOLVED, it was not satisfied. No session relocates, so there is nothing to port and no gate to run. Kept for decision history.**

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
- **D-2 — `main` = a fresh branch cut from review HEAD, or revive `dawntrader-v4`?** *Rec: fresh `main` from review HEAD* (clean protected trunk). Leave `dawntrader-v4` as a frozen archive. **⚠ CORRECTION (§12): the "may not fast-forward — divergent history" reason first written here was UNVERIFIED and is REFUTED — `dawntrader-v4` IS a strict ancestor and would fast-forward; fresh `main` stands only for clean naming.**
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

---

## 12. ★ LANGSTON ACCEPTANCE — 2026-07-23 (= Kyle's acceptance, per standing authorization)

**ACCEPTED, no re-review round needed.** Langston independently re-read the plan, the v4 divergence, the behind-count, and the amendment draft at the ref. Per-decision:

- **D-1 — AGREED.** The git one-branch-per-worktree constraint makes per-session branches mechanically forced; structural kill for #557.
- **D-2 — AGREED (outcome), reason corrected.** Measured: `origin/dawntrader-v4` is a strict ancestor (0 commits not on review; review 2,752 ahead at `88020fe5`) and *would* fast-forward. Fresh `main` is chosen for the honest reason — a cleanly-named protected trunk — not because v4 is dangerous. **My "may not FF / divergent history" was unverified and is refuted — owned, not buried.**
- **D-3 — AGREED, with a §13 hook.** A "known-good checkpoint" needs a **named owner + concrete trigger** or `main` never advances (three sessions are never all-verified at once). **Home: Langston blesses the checkpoint at a quiet-point governance gate** — this gets its named home before close (implementation-time condition 2).
- **D-4 — AGREED.** The §6 throwaway-session test is a **HARD GATE** — folder-naming is confirmed, conversation-reopen is not (a transcript may carry the old absolute path). No real session moves until it passes.
- **D-5 — two hardening asks, both adopted:** (1) compare the SHA of the **explicit pushed ref** (`refs/heads/migration/aws-supabase`) on each remote, **not** symbolic `HEAD` (the Drive mirror's HEAD may point elsewhere); (2) on mismatch the gate **HARD-FAILS the batch close and forces re-push** — it does not warn-and-continue.

**Two implementation-time conditions ride with the acceptance (not another gate):**
1. **Final §7.1 wording lands in front of Langston at OBJ-6 before commit.** He accepts the amendment in principle (GitHub source of truth, Drive labeled mirror, mandatory verification, 2026-06-01 incident preserved verbatim under SUPERSEDED with corrected root cause) but reads the actual set-in-stone text before it lands.
2. **D-3's checkpoint owner + trigger gets its named home before close** (Langston at a quiet-point governance gate).

**Ruled on reported fact (not gradeable from Langston's access — receipts kept in the CC-C environment):** the §6 two-folder path-slug evidence, and the 2026-07-22 #557 double-fire.

**Sequencing:** NEW Claude (CC-B) holds board claim [6] with a pending P19-B8.5i re-apply; the cutover is sequenced AFTER that lands (or a clean point he names), and each session is pinged before its own session/dir moves.

---

## 13. ★★ REVISION — 2026-07-23, AFTER IMPLEMENTATION BEGAN. **THIS SECTION SUPERSEDES §3, §6, and D-1/D-4 of §10.**

Two findings landed during implementation. Both were re-ruled by Langston. **Read this section as authoritative where it conflicts with anything above.**

### 13.1 D-1 RE-RULED — separate CLONES on the SHARED review branch (overturns worktrees + per-session branches)

**Kyle surfaced the cost neither Langston nor I weighed:** with per-session branches, session A merges a file to review while B and C still hold the OLD version in their trees. If B edits its stale copy, you get three versions of one file. The answer under the worktree model was "each session must fetch+rebase before working and before merging" — **a discipline, not a guarantee.** With three concurrent sessions that is the normal weekly path, and per-session branches actively **HIDE** staleness (your own branch is never behind itself), so divergence surfaces late, at merge, as a **silent revert** rather than a visible conflict.

**THE DECIDING PROPERTY: on a shared branch, git REJECTS a push from a clone that is behind.** Sync becomes **structural instead of remembered** — the same principle as #568 and the board honesty clause: *a control you must remember is not a control.* Index isolation (the entire reason worktrees were endorsed, #557) is fully preserved, because each clone has its own `.git`.

**Mechanical note that had forced the original shape:** git forbids two worktrees on ONE branch, which is precisely why worktrees mandate per-session branches. Same-branch therefore *requires* clones. That constraint drove D-1 more than the merits did.

**BUILT (2026-07-23):** four independent clones, all on `migration/aws-supabase` — `C:\DawnTraderV3` (spare/reference) + `-old` (CC-A) + `-new` (CC-B) + `-analyst` (CC-C). Each verified 442 packages / 0 zero-byte (vs the Drive tree at **405 of 452** zero-byte, so #567 is resolved by the relocation).

### 13.2 §6 AND THE D-4 GATE **DISSOLVE** — no session relocates at all

Research against the official docs + issue tracker established: (a) there is **NO supported migration of conversation history** when a project directory moves — it orphans the sessions, multiple open issues, the official workaround is "move it back"; (b) **directory junctions on the storage folder are NOT reliable** — the app resolves them to their physical path before key lookup, a documented split/orphan risk. Four such junctions were created and then **REMOVED**, with the store verified intact afterwards (101 transcripts, 4 memory files, 3.9 GB). The Windows underscore-splitting bug was checked on this machine: the second variant folder exists but is **EMPTY**, so storage was never actually split.

**⇒ THE SIMPLIFICATION:** a session's storage location does not constrain which paths it may edit — read/write is path-agnostic. **The benefit was always *working in* the tree, never *opening* there.** So **no session moves**: all three stay opened where they are, keeping full history, and simply do their file work in their own clone. Index isolation, healthy dependencies and the dual push are all still obtained. §6, the pre-seed, and the D-4 hard gate are **not satisfied — they cease to apply.** Strictly less risk than the accepted plan.

### 13.3 Langston's two conditions on the revision

1. **PULL-BEFORE-PUSH IS THE DOCUMENTED WORKFLOW.** Every clone pulls before it pushes. Git enforces it (a behind-clone's push is rejected), but it is written down here so nobody treats a rejected push as an error to work around.
2. **★ THE STEP-4 REVIEW GATE IS NOT WEAKENED BY THIS.** Structural sync ≠ skipping review. Direct commits to the shared review branch must still go through Langston's Step-4 diff review before anything lands. Being on one branch makes pushing easier; it does not make review optional.
3. **D-5 RE-VERIFIED PER CLONE — and it did NOT carry.** The dual-push config and the explicit-ref identity check were originally verified on the worktree layout, which shared one object store. Under four independent clones each needed its **own** dual-remote configuration. Langston required re-verification rather than assumption; that was correct. **All four now configured and PASSING** the explicit-ref (`refs/heads/migration/aws-supabase`, not symbolic HEAD) identity check across GitHub and the Drive mirror.

### 13.4 Still open (unchanged by this revision)

**★ BOTH RESOLVED 2026-07-23 (Langston ruling on the v2 draft at `aeba921d9`):**

1. **§7.1 wording — APPROVED AS WRITTEN.** He re-read the full draft and the CLAUDE.md sections at the same ref, and confirmed all five OBJ-6 conditions are stated as ruled: GitHub-as-source-of-truth (correctly framed as *stricter*, not looser); **reproduction-not-comparison** (his words: *"the strongest line in the doc… the sentence I'd have written the whole amendment to protect"*); backup-never-blocks-work as a separate remote; pull-before-push given its own line **because it is the thing most likely to erode**; and the 2026-06-01 incident preserved verbatim with the frozen-pointer root cause named beneath it. **⚠️ STILL REQUIRES KYLE'S SET-IN-STONE CONFIRMATION BEFORE IT LANDS IN `CLAUDE.md`** — Langston approves the wording; the never-reverse clause is Kyle's to release.
   - **Non-blocking wording note (his, and it corrects MY framing not the document):** the text says ref-comparison *"certified an empty backup four times"* and names **two** mechanisms (ref-equality, `bundle verify`). That is a **count of false passes, not four distinct named passes.** The document is precise; the cover-framing "four false passes named" must not outrun what is on the page. **No change to the doc.**

2. **★ D-3 CHECKPOINT — NAMED HOME, OWNER ACCEPTED.** **Owner: Langston.** **Trigger: he blesses the checkpoint at a quiet-point governance gate — DEFINED as batch/sub-batch close with no push in flight.** It sits inside his existing Step-8/governance role, so it is a named home per §13, not new authority. This closes the "or `main` never advances" hook he attached to D-3.

3. **★ §2/§6.5 CONTRADICTION — FOLD INTO THE SAME EDIT (his ruling).** `CLAUDE.md` lines 61 and 177 say Langston reviews the diff **"BEFORE push"**; §6.5 line 298 says **"COMMIT AND PUSH before dispatching, or he is reading a file that does not exist yet."** Under the new flow these reconcile cleanly. **Reconciled wording, his:** *"Langston reviews the actual `git diff` at the graded ref (`origin/migration/aws-supabase`) — after push to the review branch, before it advances to `main`."* "Before push" was an artifact of the Drive-source-of-truth era when he read the working copy; **it is obsolete the moment §7.1 lands, so leaving it would be a fresh contradiction, not a deferral.** Fix lines 61 and 177 to match. **This does not weaken the gate — nothing advancing to `main` unreviewed is the entire point.**

### 13.5 ★★★ D-5 REDEFINED — ref-equality gave a FALSE PASS on an empty backup. **THE FOUR EARLIER PASS RESULTS ARE WITHDRAWN.**

**⛔ WITHDRAWAL, IN WRITING (Langston-required — do NOT quietly re-run):** the four D-5 PASS results reported earlier on 2026-07-23 — one per clone — **certified a backup that had never held valid content.** They are withdrawn. *A gate that certified an empty repository four times is itself the finding; erasing it would erase the lesson.*

**WHAT HAPPENED.** The Drive mirror was created as a bare repo on the GDrive FUSE mount. The initial push reported `[new branch] migration/aws-supabase` and `git ls-remote` returned the correct sha — so the explicit-ref check PASSED, four times. The next real push then failed (`unresolved deltas left after unpacking`; on retry `bad object … missing necessary objects`). Forensics: the mirror was **2.7 MB** against ~320 MB for a real clone; `objects/pack` held a 2.4 MB `.idx` and a 344 KB `.rev` and **NO `.pack` file at all**; zero loose objects; `cat-file` could not resolve the ref's commit; `fsck` reported `invalid sha1 pointer`. **The pack — the file containing every object — was never written. Only its index survived.** *(Langston ruled these forensic specifics RULED ON REPORTED FACT — they sit on the GDrive mount he does not safely read; the design ruling stands on git's data model regardless.)*

**★ WHY THE GATE PASSED, WHICH IS THE REAL FINDING.** A ref is a **41-byte text file**. Writing it succeeded. Comparing explicit-ref shas across two remotes proves **the two pointers agree — and nothing about whether the objects they name exist.** The gate compared the one artifact the mount wrote correctly and certified a repository holding no content. **This is #568 — an absence that reads as a valid value — sitting inside the control built to prevent silent divergence.** The explicit-ref instinct (over symbolic HEAD) was *necessary and insufficient*; it is extended here, not withdrawn. **And note what actually caught it: the next push failing — not the gate.** Had there been no second push, four PASS results would have stood as evidence of a working backup.

**(a) MECHANISM — bundle, and it is NOT the reason to trust the backup.** The Drive backup is now a **single `git bundle` file**, not a git remote: one large sequential write is the pattern the mount survives; thousands of objects plus a pack is what it demonstrably drops. **Langston's caveat is recorded because it matters: the bundle only lowers the odds — it does not make the gate sound. Treating the mechanism change as the reason to trust the backup would be a patch (§5 rule 15).** (b) is load-bearing; (a) just makes (b) pass more often.

**(b) THE GATE IS NOW REPRODUCTION, NOT VERIFICATION.** `git bundle verify` proves a bundle is internally complete/self-consistent — it does **NOT** prove its objects are byte-identical to source. So ref-equality and `bundle verify` remain **cheap pre-checks only**. **PASS is earned solely by:** cloning/unbundling the backup into a throwaway, resolving a known path in the reproduced copy, and **matching its object hash against the known-good hash from the source ref.** Prove it can *produce* the content; never accept an assertion that it could.

**FIRST EARNED PASS (2026-07-23), by that standard:** backup reproduced commit `845b40f65b41` and blob `21cd9ce24e5a` for `B_REPO_RELOCATE_MIGRATION_PLAN.md` at **25,007 bytes** — hashes identical to source. Bundle 463,672,579 bytes, byte-identical local vs Drive; copy took 12 s versus the 60 s of the push that silently failed.

**PER-CLONE "DOESN'T CARRY" SWEEP (Langston: the identity bug generalizes).** Confirmed NOT inherited by an independent clone, all now fixed in all four: **git identity** (`user.name`/`user.email` were set *locally* in the Drive repo; global is empty — the first commit in a new clone failed outright), **the dual-remote push URLs**, **`http.postBuffer` = 500 MB** (matters for large pushes), and `core.pager`. Also copied: **`.claude/launch.json`** (untracked, therefore absent from clones). **Deliberately NOT replicated: `core.hookspath`** — it pointed at an absolute *Drive* path, and the Drive repo has no active git hooks (samples only), so replicating it would have pointed every clone at another repo's hook directory. The real guards are the **tracked** `.claude/hooks/`, which carry normally. `.env` is absent from both, so no gap.
