# REPO TOPOLOGY & SYNC — the full reference

> **What this is:** the DEPTH behind `CLAUDE.md` §7.1 — the conductor map, the measured evidence, the preserved incident records, and the reasoning for each choice.
>
> **Why it lives here and not in `CLAUDE.md` (#564, Langston-ruled: *"operative→CLAUDE.md, depth→runbooks"*):** `CLAUDE.md` auto-loads for every session AND for the reviewer on **every single invocation** — so every review pays for the whole rulebook before reading a line of the work. The OPERATIVE rules stay there. This evidence is valuable but nobody needs to carry it on every turn.
>
> **⚠️ NOTHING HERE IS DELETED OR OPTIONAL.** Kyle ruled NO-TRIM once already (#339): rules are not removed to save tokens. This is purely about *where the supporting evidence sits*. Every operative instruction remains in `CLAUDE.md` §7.1.
>
> **Set-in-stone content:** the 2026-06-01 incident record at the end must NEVER be deleted or edited out, per its own terms.

---

**THE FLOW:**

> **Kyle's laptop — one INDEPENDENT CLONE per session, ALL ON THE SHARED REVIEW BRANCH → push → GitHub (`migration/aws-supabase`) → staging deploys the REVIEW branch → verified + approved advances `main`.**
> **Backups and review copies fan out from there. They are NOT in the push path.**

#### ★★ THE ONE-DIRECTION RULE (Kyle directive 2026-07-23; Langston ruled on it separately from the rest of this section and approved it on its own merits). FLOW IS ONE WAY; NOTHING EVER FLOWS BACK.

- **The REVIEW branch accepts input from exactly ONE source: the clones on Kyle's laptop.** It **NEVER** takes content from `main`, from the Helsinki mirror, from Google Drive, or from staging.
- **From the review branch, everything moves OUTWARD only** — to staging, to `main`, to the backups (Langston reads off the branch directly; the one Hetzner backup doubles as his rare whole-tree-search fallback — no separate Langston copy).
- **`main` only ever advances FROM the review branch.** Nothing else may feed it.
- **Staging, both backups, and Langston's clone are TERMINAL IN NORMAL FLOW.** They receive; they never send back. **A copy that can write upstream is not a backup, it is a second author.**
- **★ The ONE exception is DISASTER RECOVERY (Langston, 2026-07-23).** If the review branch is CONFIRMED LOST, re-seeding it *from* a backup is the only reason a backup exists at all. That is a **Kyle-authorized EVENT, not a flow** — categorically different from the 2026-06-01 failure (concurrent authorship, nobody able to say which direction was correct). Without this carve-out, an absolute "never send back" would forbid the restore the backup exists to perform.
- **★ ENFORCED, NOT REMEMBERED (2026-07-23):** the Hetzner backup (`/srv/dawntrader-backup.git`, langston-owned) has its **push URL set to a deliberately invalid `DISABLED://…` value** — it had a live GitHub push URL it should never have had. A push from it now fails at git, not at somebody's memory. (Langston keeps no working clone at all — he reads off the branch; see below.)
- **Why this is a rule and not a habit:** 2026-06-01 was a *direction* failure — content in one place and not the other, with nobody able to say which way it should have travelled. One declared direction makes "which copy is right?" answerable by construction.

#### The working arrangement

- **★ GITHUB IS THE SOURCE OF TRUTH.** It is what staging deploys from, what CI grades, what Langston reviews at (`origin/migration/aws-supabase`), and what every `file:line` citation resolves against. **The laptop is authoritative for uncommitted work only — if it isn't pushed, it doesn't exist.** Stricter than the old rule, not looser.
- **Each session works in its own INDEPENDENT CLONE on local NTFS:** `C:\DawnTraderV3-old` (CC-A) · `C:\DawnTraderV3-new` (CC-B) · `C:\DawnTraderV3-analyst` (CC-C) · `C:\DawnTraderV3` (spare/reference, used by the Drive-archive script). **Separate clones, NOT worktrees** — git forbids two worktrees on one branch, which would force per-session branches whose failure mode is a **silent revert at merge** off a stale edit. Separate `.git` directories give each session its own index, which is what structurally kills **#557**.
- **A session's cwd does NOT have to change and nobody relocates.** Work in the clone by absolute path. Verified in practice: CC-C ran this entire migration from a session whose cwd was still the old Drive folder.
- **★ ALL CLONES SIT ON THE SAME BRANCH, AND GIT ENFORCES THE SYNC.** Pull to receive others' work; push to share yours. **Git REJECTS a push from a clone that is behind** — so staying current is structural, not remembered. **A rejected push is the system working, not an error to route around: pull, then push.** With three sessions pushing, *being behind is the normal state* — which is precisely why the old never-pull rule became unworkable and had to be replaced.
- **⚠️ STRUCTURAL SYNC DOES NOT WEAKEN THE REVIEW GATE.** Being on one branch makes pushing easier; it does **not** make Langston's Step-4 review optional. Nothing lands unreviewed because it was easy to push.
- **★ LANGSTON READS OFF THE REVIEW BRANCH — no working copy at all (Kyle directive 2026-07-23; this REPLACES the earlier "invoke-time-synced clone," which was over-built and is deleted).** The review branch on GitHub is the shared point of truth, so he reads off it directly. Two paths, both wired into `discord-langston-bridge.py`, which stamps the current graded sha (from `git ls-remote`) into the top of every invocation:
>   - **Default — a single file straight off GitHub at the EXACT reviewed commit:** `https://raw.githubusercontent.com/kylegjordan/DawnTraderV3/<sha>/<path>` (public repo, no auth, no local copy, and reading at the sha means a branch that moves mid-read can't fool him). This covers reading the files in a diff — the bulk of a review.
>   - **Fallback — whole-tree search only** (every caller / appears-nowhere-else / blast-radius census), which GitHub will not serve to an outside machine: **`dt-review grep '<pattern>'` | `dt-review show <path>` | `dt-review ls`** on Helsinki. **★ It PULLS FROM GITHUB FIRST, then searches, so he is never on stale files (Kyle directive 2026-07-23) — the rule is enforced in the tool, not left to memory; on a failed fetch it REFUSES to read rather than return possibly-stale bytes.** It reads the **one Hetzner backup** (`/srv/dawntrader-backup.git`, langston-owned, push-`DISABLED`, reproduction-gated every 15 min) — the backup doubles as the search fallback, so there is **no separate Langston copy**.
>   - Why the earlier clone was wrong: reading and searching at the ref never needed a working checkout (a bare repo serves both — measured), and single files come straight off GitHub because the repo is public. The only thing a working tree buys is **running** `tsc`/`vitest`, which Langston never does. Verified live 2026-07-23: he quoted the stamped sha, read CLAUDE.md off the raw URL, and ran `dt-review grep` (pull-before-read confirmed). Rollback for the bridge: `discord-langston-bridge.py.pre-syncfix-20260723`. **Never** `/mnt/gdrive` — that retired mount is what used to wedge his long reviews (§8.2 item 9).
- **`C:\dev` is RETIRED.** It existed solely because tests could not run on the Drive mount; every clone now runs `tsc` and `vitest` directly. Its six stashes + one never-committed file are archived at `root@204.168.141.77:/root/backups/dev-bench-stashes-2026-07-23/`. Recorded in `DELETED_COMPONENTS_LOG.md`.
- **NOTHING CARRIES TO AN INDEPENDENT CLONE.** Verified absent from a fresh clone and required per-clone: **git identity** (`user.name`/`user.email` were set *locally* in the old Drive repo, global is empty — the first commit outright FAILS without it), remotes, **`http.postBuffer` 500 MB**, and untracked files such as `.claude/launch.json`. `node_modules` are per-clone and never shared.

#### ★ GOOGLE DRIVE IS NOT A GIT REMOTE AND MUST NEVER BE ONE

Git's own FAQ forbids putting *any portion* of a repository on cloud-sync storage ("missing objects… broken refs… data loss"). **We proved it:** a bare repo pushed to the `G:` drive reported SUCCESS while holding **2.7 MB with no pack file at all**, `fsck` returning `invalid sha1 pointer`. Same root cause as the `git commit -- <path>` segfault (#542 — which does **NOT** reproduce on local NTFS, measured 2026-07-23) and the ~99%-destroyed `node_modules` (#567).

#### Backups — two, both gated by REPRODUCTION

| Copy | What | Cadence | Trigger |
|---|---|---|---|
| **Helsinki bare mirror** | `/root/backups/dawntrader.git` — a real, clonable repository on a POSIX filesystem. The PRIMARY second copy. | every **15 min** | server cron, `/usr/local/bin/dt-backup-sync.sh`; **pulls from GitHub itself** — does not need Kyle's laptop awake |
| **Google Drive archive** | ONE `git bundle` file, `G:\My Drive\Dawn Trader\DawnTraderV3-backup.bundle`. The off-platform archive that survives losing GitHub **and** the server. | **nightly 03:00** | Windows scheduled task "DawnTrader Drive Backup", `scripts/dt-drive-backup.ps1`; **only runs when the laptop is awake** |

- **The file NEVER moves and is never versioned by us** — same name, same path, overwritten in place. There is no archive location to track. (Kyle 2026-07-23, settling it: cadence stays nightly.)
- **★★ THE BACKUP GATE IS REPRODUCTION, NOT COMPARISON.** Comparing refs across remotes proves **the pointers agree and nothing more** — a ref is a 41-byte file, and that check **certified an empty backup four times**. `git bundle verify` proves internal consistency, not byte-identity to source. **PASS is earned only by cloning FROM the backup and matching a known path's object hash against source.** Ref-equality and `bundle verify` are cheap pre-checks; neither is ever the gate.
- **★ A BACKUP IS A SEPARATE REMOTE, NEVER A SECOND PUSH-URL ON `origin`.** A dual-URL push reports per-URL and non-atomically, and a dead backup leg **blocks the normal push outright** — measured, not theorised. **Backups must never be able to stop work.**

#### ★ WHO MOVES WHAT — the conductor map (Kyle's question, 2026-07-23; answered honestly including the gaps)

| Hop | Who / what drives it | Trigger |
|---|---|---|
| clone → **review branch** | **the session that did the work** | its own judgment — see the commit/push discipline below |
| review branch → **Helsinki mirror** | **automatic** | server cron, every 15 min, self-pulling |
| review branch → **Langston's clone** | **automatic** | server cron, every 5 min, self-pulling |
| review branch → **Drive archive** | **automatic** | laptop scheduled task, nightly 03:00 |
| review branch → **staging** | **the session that owns the batch** — deliberately manual | after its 4 CI checks are green; a deploy restarts live trading, so it is never on a timer |
| review branch → **`main`** | **the session that owns the batch**, as the LAST governance step | only after staging verification + Langston second-pass + Kyle's acknowledgement — i.e. at batch close. `main` is force-push- and delete-protected. |
| GitHub → **each session's clone** | **the session itself** | pull before push; git *rejects* a stale push, so this is enforced whenever you share work |

**THE TWO GAPS — one CLOSED, one DELIBERATELY NOT BUILT (both settled by Kyle, 2026-07-23, same day they were surfaced).**

- **(a) CLOSED — "someone else pushed" is now announced.** Git only refuses you when you try to share your *own* work, which is late. `/usr/local/bin/dt-push-notice.sh` (Helsinki cron, every 2 min) reads the review-branch ref with `git ls-remote` and, when it moves, posts ONE line to `#general` naming all three sessions so every armed watcher wakes. **★ It is minimal BY INSTRUCTION, not by laziness** — Kyle: *"We don't need all the commentary around what they pushed... They just need to understand that it's been pushed."* So it carries the new sha and nothing else: no subject, no file list, no author. A session that recognises the sha as its own push ignores it. First run initialises silently (announcing a push that already happened is how a notice trains people to ignore it). It is a READER of the branch and cannot write to it.
- **(b) NOT BUILT, and Kyle is right.** The proposal was to poke a session sitting on uncommitted work. His objection: *"they may be in the middle of making edits… telling them that they have unsaved work is telling them they're doing something they're already aware of."* Correct — an alert that fires during normal work is noise, and noisy alerts get ignored, which costs more than the gap. **The genuine case it was aimed at — work forgotten for a FORTNIGHT, not an hour — is already covered by check 4 of the batch-close sync gate below**, which forces an eyes-on review of untracked files before a batch can close. Machinery at the close, not a nag during the work. **Do not re-propose this without a new failure that check 4 demonstrably misses.**

**★ WHY LANGSTON HAS A CLONE AT ALL — the answer corrected on measurement (Kyle asked; CC-B caught my first answer; Langston ruled).** My original justification — *"he's a process on a Linux box, so a file must exist on a filesystem for him to read it"* — is **WRONG, and measured wrong**: a **bare** repository with **no working tree** serves both `git show <ref>:<path>` and `git grep <pattern> <ref>` (verified on `/root/backups/dawntrader.git`, `is-bare-repository` = true). **Reading and cross-tree searching at the ref never needed a checkout.** What genuinely needs files on disk is **EXECUTION** — `tsc`, `vitest`, and any tool that takes a directory. **Langston's ruling, and the condition attached to it: "a clone pinned to the graded SHA *is* read-at-the-ref — it's the ref materialised so grep/tsc/vitest can run, not a competing source. It only becomes the stale-worktree bug when it drifts… the clone is legitimate ONLY when pinned + verified to the graded SHA at each use."** That condition is what the invoke-time sync enforces. **Prefer `git show <ref>:<path>` / `git grep <ref>` for reads and searches** — they are ref-exact and **fail LOUD on a bad ref**, instead of silently returning whatever a working tree happens to be holding (the #546/#568 absent-as-valid class).

**★ THE SYNC GATE HAS A MATCHING HOLE, and this is the fix (CC-A's catch, 2026-07-23).** The batch-close gate below checks whether **committed** work is pushed. It says **nothing about work that was never committed** — which is exactly how that file stayed invisible for two weeks. **So the gate now requires an untracked check too, and `git diff HEAD` DOES NOT SHOW UNTRACKED FILES and does not say so (#542 corollary).**

**🔒 Batch-close sync gate (HARD — every batch, no exceptions).** From your OWN clone, all four must hold:
**0. ★ `git fetch origin` FIRST — the gate is INVALID without it (added 2026-07-24, measured).** `origin/<branch>` is a **local cached pointer** refreshed only by a fetch, so without this step check 1 compares you against your own stale copy. **Measured on `C:\DawnTraderV3-old`: reported behind 0; after a fetch, behind 3.** The gate built to prove sync could itself report a false in-sync — the absent-as-valid class (#546/#568) turning up inside its own detector.

1. `git rev-list --count HEAD..origin/migration/aws-supabase` = **0** (not behind), AND
2. `git rev-list --count origin/migration/aws-supabase..HEAD` = **0** (nothing committed-but-unpushed — Langston's 2026-06-12 catch: a one-directional check cannot see unpushed local commits), AND
3. `git status --porcelain --untracked-files=no` shows only intentional local config, AND
4. **`git status --porcelain | grep '^??'` reviewed by eye** — every untracked file either committed, deliberately ignored, or explicitly named as disposable. **An untracked file is invisible to checks 1–3.**

#### The crew coordination board — what it is FOR now

Separate clones dissolved the race the board was built for (**#557**, one session's commit sweeping up another's staged paths — now structurally impossible, not merely unlikely), and git's push rejection is a harder guarantee than the board's advisory push lock. **What remains, and it is the reason to keep it: git cannot warn two sessions IN ADVANCE that they are about to work the same file.** Git only discovers that at pull time, and the dangerous version merges cleanly while being semantically wrong. So: **claim shared paths before editing them** (`crew claim <path…> --note "<batch id>"`, release when done), treat the board as a *who-is-touching-what notice board*, and **do not treat it as a lock** — §5 rule 25.b's honesty clause still governs. It runs from any clone or from staging; `CREW_SESSION` has no default and refuses rather than guess.

**🚫 STILL FORBIDDEN, and for the original reason:** never author in a backup, never push from one, and never let any copy silently diverge without a **reproduction** check catching it.

---

**⛔ SUPERSEDED — the original 2026-06-01 incident record, PRESERVED VERBATIM, never deleted.** The rule changed; the memory of why it existed does not.

> **Why this is SET IN STONE:** on 2026-06-01 the direction was found INVERTED in practice — recent work had been edited + committed + pushed from the `C:\dev` test bench, leaving the Google Drive source-of-truth folder **42 commits stale** and one governance item (`POST_AUDIT_ROADMAP` row 25-11, a Kyle 2026-05-29 directive) stranded on GitHub, never reaching Google Drive. This violated the canonical "Google Drive, GitHub, and staging always synced at batch close" rule. It was recovered + resynced. This section exists so it NEVER recurs and must NEVER be deleted or edited out of this document.

**★ THE CORRECTED ROOT CAUSE, re-derived from the ref (commit `b843d110a`, quoted from its own body):** *"The Google Drive clone's git pointer **froze 2026-05-28 (B-NEW-46)** and governance was committed from the `C:\dev` working copy **thereafter**."* ⇒ **the bench-pushing the old rule forbade was the CONSEQUENCE, not the cause.** The authoritative tree's version control broke and people worked around a broken tool. The old rule described the symptom, never named the frozen pointer, and was enforced entirely by human discipline — which failed silently for 42 commits. **The replacement's real safeguard is that git itself rejects a stale push, plus a reproduction-based backup gate.** Stated honestly: those **catch** divergence; they do not **prevent** a pointer freeze. And we now know the deeper fact the old rule never had — **a git repository on that mount is unsafe by construction**, which is why the working tree moved off it entirely.
---