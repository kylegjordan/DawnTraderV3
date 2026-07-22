# B-CREW-COORD — STEP-2 PRE-AUDIT (#554)

> **change-class: non_architecture.** Owner: Claude Analyst (CC-C). Reviewer: Langston.
> Scope: `B_CREW_COORD_SCOPE.md` (§2 substrate ruled + my v1 risk-claim corrected).
> **All statements below are from reads of the actual files, at the paths cited. Where I have NOT verified something, it says so.**

---

## 1. THE HOOK I AM EXTENDING — what it actually does

`.claude/hooks/guard-bare-commit.mjs` is a **PreToolUse hook on `Bash`**. Flow: parse the payload (`:178`, unparseable → allow) → non-Bash → allow (`:181`) → strip heredocs (`:67`) → split on unquoted separators (`:93`) → tokenise (`:140`) → identify a real `git` **executable** with `commit` as its **subcommand** (`:159`). If no such invocation → allow (`:232`). If the invocation is immediately preceded by the `CC_COMMIT_ATTESTED=1` token → allow (`:252`). Otherwise → **block, `process.exit(2)`** with a message teaching the procedure (`:290-304`).

**Two properties I must not break:**
- **FAIL-OPEN by design** (`:42`) — anything unparseable is allowed. The header states the consequence honestly: a green test run is only as trustworthy as its payloads are well-formed.
- **It parses rather than substring-matches**, because substring matching cannot distinguish an EXECUTION from a MENTION — it once blocked a Discord message that merely *quoted* the protocol. *A control whose false positives land on the people documenting it selects against its own upkeep* (Langston).

---

## 2. ★ THE HONEST LIMIT — A COORDINATION BOARD **CANNOT** CLOSE THE #557 RACE. Saying otherwise would oversell it.

CC-B filed **#557** (`B-SHARED-TREE-COMMIT-ATOMICITY`): the #540 procedure — `git add <paths>` → read `git diff --cached --name-only` → `CC_COMMIT_ATTESTED=1 git commit` — is only sound **if the index cannot change between the read and the commit.** With three sessions on one working tree it can, and it did: he swept three of my files into `fb16aec48` today, ~4 hours after warning me about that exact hazard.

**A board does not fix this.** The hook is *PreToolUse* — it fires **before** the command runs, so a board-check inside it is just another read that the same race can invalidate. **What the board genuinely buys:** earlier visibility of contention, a queryable answer to "is it safe to touch X", and serialized pushes. **What it does NOT buy: atomicity.** I want that stated in the scope so nobody later reads a green board as a guarantee — the same mistake as reading a passing freshness check as proof of correctness.

## 3. ★ CANDIDATE THAT *WOULD* CLOSE IT — **UNVERIFIED, DO NOT TREAT AS SOLVED**

Git supports a **per-invocation index** via the `GIT_INDEX_FILE` environment variable. If each session used its own index file, the shared-index hazard would be eliminated **by construction** rather than mitigated by convention — no sweeping possible, and #557's race window would not exist.

**I have NOT tested this here, and I am not going to assert it works.** Open questions I would need answered before proposing it: does it interact badly with the FUSE mount (#542) · does it require seeding from `HEAD` per invocation and what happens if that is skipped · do the existing hooks and `git status` behave sanely against a non-default index · does it change anything about what `git push` sends. **Langston: is this worth a bounded experiment, and if so should the experiment run somewhere other than the shared tree?** I deliberately did **not** run a live commit experiment on the shared tree while two sessions are actively committing — a stale `index.lock` from my test would land on them, which is precisely the class of unilateral risk I have been getting wrong today.

## 4. BLAST RADIUS

The hook fires on **every Bash command containing a `git commit`** — i.e. all three sessions, constantly. Adding a network call to Supabase therefore adds latency and a new failure mode to the most frequent governed operation in the project. **Non-negotiable:** short timeout, and **fail-open on any error** — unreachable DB must mean "commit proceeds with a warning", never "nobody can commit". *A coordination tool that can hard-block all committing when the database is down is a worse outage than the collisions it prevents.*

## 5. WHAT I AM NOT DOING

Not touching trading-path code · not replacing git or CI · not fixing #542 · **not claiming the board closes #557** · not building the `GIT_INDEX_FILE` route unless Langston rules the experiment worth running.

## 6. ASK

1. Rule on §3 — bounded experiment on `GIT_INDEX_FILE`, or out of scope for this batch?
2. Confirm §2's framing: the board is **mitigation + visibility**, explicitly **not** atomicity — and that this belongs in the scope so it cannot be over-read later.
3. Confirm §4's fail-open + timeout as hard constraints on the hook extension.
