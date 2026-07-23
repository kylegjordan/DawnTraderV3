# §7.1 AMENDMENT — DRAFT FOR LANGSTON'S OBJ-6 READ, THEN KYLE'S CONFIRMATION

> **Status: DRAFT v2. NOT APPLIED to `CLAUDE.md`.** Kyle decided the substance (2026-07-22/23); Langston's acceptance of the migration plan carried the amendment **in principle**, with one condition: **he reads the actual set-in-stone text before it lands.** This is that text.
>
> **⚠️ v1 OF THIS DRAFT IS SUPERSEDED AND WAS WRONG IN EVERY LOAD-BEARING DETAIL.** It described worktrees on per-session branches, branch-merging, and Google Drive receiving every push through a second push-URL. All three were overturned by implementation. Recorded rather than silently rewritten.
>
> **Why a draft and not a direct edit:** §7.1 is marked *"🔒 SET IN STONE — NEVER delete, NEVER edit out, NEVER reverse."* A rule carrying that clause changes by a visible, reviewed act.

---

## THE ONE THING THIS AMENDMENT MUST NOT DO

**It must not delete the incident record.** The 2026-06-01 divergence was real: Google Drive fell 42 commits behind and three items written in the Drive folder — including a Kyle directive — never reached GitHub. **That history is preserved verbatim at the end and marked SUPERSEDED, never removed.** The rule changes; the memory of why it existed does not.

---

## PROPOSED REPLACEMENT TEXT

> ### 7.1 Storage & sync workflow — THE canonical flow (Kyle directive 2026-07-22/23, superseding the 2026-06-01 rule; preserved history at the end)
>
> **THE FLOW:**
>
> > **Kyle's laptop — one INDEPENDENT CLONE per session, ALL ON THE SHARED REVIEW BRANCH → push → GitHub (`migration/aws-supabase`) → staging deploys the REVIEW branch → verified + approved advances `main`.**
> > **Backups fan out from there. They are NOT in the push path.**
>
> - **★★ THE ONE-DIRECTION RULE (Kyle directive 2026-07-23). FLOW IS ONE WAY; NOTHING EVER FLOWS BACK.**
>   - **The REVIEW branch accepts input from exactly ONE source: the clones on Kyle's laptop.** It **NEVER** pulls from `main`, **NEVER** from the Helsinki backup, **NEVER** from Google Drive, **NEVER** from staging.
>   - **From the review branch, everything moves OUTWARD only** — to staging, to `main`, to the backups.
>   - **`main` only ever advances FROM the review branch.** Nothing else may feed it.
>   - **Staging and both backups are TERMINAL.** They receive; they never send back. A copy that can write upstream is not a backup, it is a second author.
>   - **Why this is a rule and not a habit:** the 2026-06-01 incident was a *direction* failure — content existing in one place and not the other, with nobody able to say which way it should have travelled. One declared direction makes "which copy is right?" answerable by construction: the review branch is, always, and everything downstream is a consequence of it.
>
> - **★ GITHUB IS THE SOURCE OF TRUTH.** It is what staging deploys from, what CI grades, what Langston reviews at (`origin/migration/aws-supabase`), and what every `file:line` citation resolves against. **The laptop is authoritative for uncommitted work only — if it isn't pushed, it doesn't exist.** Stricter than the old rule, not looser.
> - **Each session works in its own INDEPENDENT CLONE on local NTFS** (`C:\DawnTraderV3-old` / `-new` / `-analyst`, plus a spare `C:\DawnTraderV3`). **Separate clones, NOT worktrees** — git forbids two worktrees on one branch, which would force per-session branches, whose failure mode is a **silent revert at merge** off a stale edit. Separate `.git` directories preserve the index isolation that kills **#557**.
> - **★ ALL CLONES SIT ON THE SAME BRANCH, AND GIT ENFORCES THE SYNC.** Pull to receive others' work; push to share yours. **Git REJECTS a push from a clone that is behind** — so staying current is structural, not remembered. A rejected push is the system working, not an error to route around. **PULL BEFORE PUSH is the documented workflow.**
> - **⚠️ STRUCTURAL SYNC DOES NOT WEAKEN THE REVIEW GATE.** Being on one branch makes pushing easier; it does **not** make Langston's Step-4 diff review optional. Nothing lands unreviewed because it was easy to push.
> - **★ GOOGLE DRIVE IS NOT A GIT REMOTE AND MUST NEVER BE ONE.** Git's own FAQ forbids putting *any portion* of a repository on cloud-sync storage ("missing objects… broken refs… data loss"). We proved it: a bare repo pushed to the `G:` drive reported success while holding **2.7 MB with no pack file at all**, `fsck` returning `invalid sha1 pointer`. Drive corruption is a documented class (Google's own support thread, 2025; same on OneDrive/iCloud). It is the same root cause as the `git commit -- <path>` segfault (#542) and the ~99%-destroyed `node_modules` (#567).
> - **BACKUPS — two, both verified by REPRODUCTION:** (1) a **bare mirror on the Helsinki server** — a real, clonable, browsable repository on a POSIX filesystem, the primary second copy; (2) a **`git bundle` single file on Google Drive** — the off-platform archive that survives losing GitHub or a server. One large sequential write is the only shape that mount survives.
> - **★ A BACKUP IS A SEPARATE REMOTE, NEVER A SECOND PUSH-URL ON `origin`.** A dual-URL push reports per-URL and non-atomically, and a dead backup leg **blocks the normal push outright** — measured, not theorised. Backups must never be able to stop work.
> - **★★ THE BACKUP GATE IS REPRODUCTION, NOT COMPARISON.** Comparing refs across remotes proves **the pointers agree and nothing more** — a ref is a 41-byte file, and that check **certified an empty backup four times**. `git bundle verify` proves internal consistency, not byte-identity to source. **PASS is earned only by cloning from the backup and matching a known path's object hash against source.** Ref-equality and `bundle verify` may serve as cheap pre-checks; neither is ever the gate.
> - **NOTHING CARRIES TO AN INDEPENDENT CLONE.** Verified absent from a fresh clone and required per-clone: **git identity** (set locally in the old repo, global empty — the first commit outright FAILS without it), remotes, **`http.postBuffer` 500 MB**, and untracked files such as `.claude/launch.json`. `node_modules` stay per-clone; never shared.
> - **Langston reviews from his OWN clone fetched from GitHub**, not the Drive mount — the ref he is meant to grade at regardless.
> - **`C:\dev` is RETIRED.** It existed solely because tests could not run on the Drive mount; every clone now runs them directly. Recorded in `DELETED_COMPONENTS_LOG.md`.
>
> **🚫 STILL FORBIDDEN, and for the original reason:** never author in a backup, never push from one, and never let any copy silently diverge without a **reproduction** check catching it.

---

## WHY THE OLD RULE IS REPLACED RATHER THAN OVERRIDDEN

**Re-derived from the ref (commit `b843d110a`), quoted verbatim from its own body:**

> *"The Google Drive clone's git pointer **froze 2026-05-28 (B-NEW-46)** and governance was committed from the `C:\dev` working copy **thereafter**, so a few items authored directly in the Google Drive folder never reached GitHub."*

**⇒ The bench-pushing the old rule forbids was the CONSEQUENCE, not the cause.** The authoritative tree's version control broke; people worked around a broken tool. **§7.1's own summary describes the SYMPTOM and never names the frozen pointer — so the rule as written would not have prevented the incident it was written after.** It was also enforced entirely by human discipline, which failed silently for 42 commits.

**The replacement's real safeguard is that git itself rejects a stale push, plus a reproduction-based backup gate.** Stated honestly: those **catch** divergence; they do not **prevent** a pointer freeze. And we now know the deeper fact the old rule never had — **a git repository on that mount is unsafe by construction**, which is why the working tree moved off it entirely.

---

## PRESERVED — the original incident record, SUPERSEDED but NOT DELETED

> **Why this is SET IN STONE:** on 2026-06-01 the direction was found INVERTED in practice — recent work had been edited + committed + pushed from the `C:\dev` test bench, leaving the Google Drive source-of-truth folder **42 commits stale** and one governance item (`POST_AUDIT_ROADMAP` row 25-11, a Kyle 2026-05-29 directive) stranded on GitHub, never reaching Google Drive. This violated the canonical "Google Drive, GitHub, and staging always synced at batch close" rule. It was recovered + resynced. This section exists so it NEVER recurs and must NEVER be deleted or edited out of this document.

**That paragraph stays in `CLAUDE.md` verbatim under a SUPERSEDED heading, with the corrected root cause noted beneath it.** The incident is why we are careful; only the prescription changed.

---

## WHAT LANGSTON IS BEING ASKED TO READ FOR (his OBJ-6 condition)

The **exact wording** above, before it becomes set-in-stone text. Specifically: that GitHub-as-source-of-truth, Drive-as-labelled-archive, **reproduction-not-comparison**, **backup-never-blocks-work**, and **pull-before-push without weakening Step-4** are all stated the way he ruled them — and that the 2026-06-01 record is preserved rather than erased.
