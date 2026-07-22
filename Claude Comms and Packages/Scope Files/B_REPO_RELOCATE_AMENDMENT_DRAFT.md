# §7.1 AMENDMENT — DRAFT FOR KYLE'S SIGN-OFF

> **Status: DRAFT. NOT APPLIED. Nothing has moved.** Kyle decided the substance on 2026-07-22 (*"Yes. Let's change the repo… so that the folder sits on the local hard drive"*). This is the proposed WORDING for his confirmation before it goes into `CLAUDE.md`.
>
> **Why a draft and not a direct edit:** §7.1 is marked *"🔒 SET IN STONE — NEVER delete, NEVER edit out, NEVER reverse."* A rule carrying that clause should be changed by a visible, confirmed act — not edited by the session that argued for the change.

---

## THE ONE THING THIS AMENDMENT MUST NOT DO

**It must not delete the incident record.** The 2026-06-01 divergence was real: Google Drive fell 42 commits behind, and three items written in the Drive folder — including a Kyle directive — never reached GitHub. **That history is preserved verbatim below and marked SUPERSEDED, never removed.** The rule changes; the memory of why it existed does not.

---

## PROPOSED REPLACEMENT TEXT

> ### 7.1 Storage & sync workflow — THE canonical flow (Kyle directive 2026-07-22, superseding the 2026-06-01 rule; see the preserved history at the end)
>
> **THE FLOW IS ONE DIRECTION ONLY:**
>
> > **Kyle's laptop (local disk) — one repository, one worktree per session → merge branches → push → BOTH GitHub AND the Google Drive mirror → GitHub → staging.**
>
> - **The laptop repository is where ALL work ORIGINATES** — code and governance. Each session works in its own **worktree** (a separate folder checking out its own branch of the same repository). Branches merge; folders never combine.
> - **★ GITHUB IS THE SOURCE OF TRUTH.** It is what staging deploys from, what CI grades, what Langston reviews at (`origin/migration/aws-supabase`), and what every `file:line` citation resolves against. **The laptop is authoritative for uncommitted work only — if it isn't pushed, it doesn't exist.** That is stricter than the old rule, not looser.
> - **Google Drive is a MIRROR.** It receives every push. It is **never authored in and never pushed from.** Its value is durability — a copy that survives a laptop failure — **not authority.** Do not conflate the two roles.
> - **★ THE MIRROR MUST BE VERIFIED, NOT ASSUMED.** One remote carrying two push URLs reports success **per-URL and non-atomically** — GitHub can succeed while Drive fails. **Partial success is the DEFAULT failure mode of a dual-URL push, not an edge case.** The batch-close gate compares both HEADs (`git ls-remote` each, compare SHAs) and **never trusts the push exit code.**
> - **Per-worktree `node_modules` stay ISOLATED.** A shared store reintroduces exactly the cross-worktree coupling the worktrees exist to remove.
> - **Langston reviews from his OWN clone on his own machine, fetched from GitHub** — not from the Drive mount. *(Proven 2026-07-22: his box cloned the branch and read file contents at the ref; ~320 MB, under three minutes.)* This is faster than the mount, which measured **8.5 seconds** to list a single directory, and it is the ref he is supposed to grade at regardless.
> - **`C:\dev` is RETIRED.** Authoring and testing now share one local tree, which removes the two-trees-with-different-capabilities condition entirely. Recorded in `DELETED_COMPONENTS_LOG.md`.
>
> **🚫 STILL FORBIDDEN, and for the original reason:** never author in the mirror, never push from the mirror, and never let any tree silently diverge without the batch-close gate catching it.

---

## ⚠️ THE PART THAT MATTERS MOST — WHY THE OLD RULE IS BEING REPLACED RATHER THAN JUST OVERRIDDEN

**Re-derived from the ref on 2026-07-22 (commit `b843d110a`), and independently re-read by Langston. Quoted verbatim from that commit's own body:**

> *"The Google Drive clone's git pointer **froze 2026-05-28 (B-NEW-46)** and governance was committed from the `C:\dev` working copy **thereafter**, so a few items authored directly in the Google Drive folder never reached GitHub."*

**⇒ The bench-pushing that the old rule forbids was the CONSEQUENCE, not the cause.** The authoritative tree's version control broke; people worked around a broken tool. The divergence ran in **both** directions — GitHub ahead by 42 commits, **and** three items stranded in Drive that never reached GitHub.

> **★ THE SENTENCE THAT JUSTIFIES THE AMENDMENT: §7.1's own summary describes the bench-push SYMPTOM and never names the frozen pointer — so the rule as written would not have prevented the incident it was written after.**

It was also enforced entirely by human discipline, and that discipline failed silently for 42 commits. **The replacement's real safeguard is therefore the machine-checked both-directions divergence gate, not the direction of the arrows.** ⚠️ Stated honestly: **that gate CATCHES divergence — it does not PREVENT a pointer freeze.** It would have surfaced 06-01 within one batch instead of 42 commits. That is the claim; it must not inflate beyond it.

---

## PRESERVED — the original rule's incident record, SUPERSEDED but NOT DELETED

> **Why this is SET IN STONE:** on 2026-06-01 the direction was found INVERTED in practice — recent work had been edited + committed + pushed from the `C:\dev` test bench, leaving the Google Drive source-of-truth folder **42 commits stale** and one governance item (`POST_AUDIT_ROADMAP` row 25-11, a Kyle 2026-05-29 directive) stranded on GitHub, never reaching Google Drive. This violated the canonical "Google Drive, GitHub, and staging always synced at batch close" rule. It was recovered + resynced. This section exists so it NEVER recurs and must NEVER be deleted or edited out of this document.

**That paragraph stays in `CLAUDE.md` verbatim, under a SUPERSEDED heading with the corrected root cause noted beneath it.** The incident is why we are careful; only the prescription changed.

---

## WHAT KYLE IS BEING ASKED TO CONFIRM

1. **The substance** — already decided: the working repository moves to the laptop, three worktrees, dual push, GitHub → staging unchanged.
2. **GitHub as the named source of truth** (rather than the laptop). Reasoning in the scope §1; Langston agreed.
3. **That this wording supersedes rather than deletes** the 2026-06-01 record.

**Still outstanding before implementation, and neither is Kyle's to supply:** New Claude's objection in his own words (Langston's Step-2 precondition), and Langston's Step-2 review of the migration plan itself.
