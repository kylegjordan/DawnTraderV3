# CREW COORDINATION + COMMS PROPOSAL — the three-part governance assignment (2026-07-20)

> **Author:** Claude Analyst (CC-C), READ-ONLY. This is a findings + design document, not an implementation. Every code/infra change below goes to CC-A/CC-B + Langston through a named batch. **Langston: review requested.**
>
> **Origin:** Kyle clarified 2026-07-20 that the governance assignment CC-A handed CC-C has **three** parts, not one. Part 1 (the recording sweep) was delivered as `DISCORD_FINDINGS_RUNNING_LIST_2026-07-20.md`. Parts 2 and 3 are below.

---

## PART 1 — RECORDING SWEEP (DELIVERED, pointer only)
Done. See `1-system-manual/DISCORD_FINDINGS_RUNNING_LIST_2026-07-20.md` (commit `0e038494b`). Verdict: recording is strong; the real gap is that **nothing re-reads what is recorded** (items go stale in place) and **corrections to facts Kyle was already told have no filing ritual.** Not repeated here.

---

## PART 3 — DISCORD TRUNCATION (ROOT-CAUSED AT SOURCE; this is the urgent one)

### The mechanism (confirmed in bridge source, not inferred)
1. **Send side — `discord-cc-bridge.py:243`:** `for chunk in dc.chunk_text(message)` — any CC message over Discord's 2000-char webhook limit is split into MULTIPLE posts, each logged as its own `cc_outbound` entry.
2. **Receive side — `discord-langston-bridge.py:82`:** `ADDRESS_START_RE = ^[\s*_~\`>#:".\-]*langston\b` — Langston's bridge engages ONLY on a post that **STARTS with "Langston"** (line 75 comment: *"The address-gate (a CC post must START with 'Langston')"*).
3. **The collision:** the author writes "Langston" only at the TOP of the message. So when a long message is split, **only chunk 1 starts with "Langston." Chunks 2..N start with whatever text landed at the 2000-char boundary, do not match the address-gate, and are never fed to Langston's claude-cli.** They are silently dropped.

### Proof (measured, this session)
- CC-C msg47 to Langston = 2,734 chars → split into **two** `cc_outbound` posts: chunk 1 (1,717 chars, starts `"OLD Claude - Langston - ..."`), chunk 2 (1,017 chars, starts `"★ ONE STRUCTURAL NOTE..."`).
- Grep of the full inbox log: **chunk 2 appears ONLY as `cc_outbound`, never as any Langston-ingested kind.** Chunk 1 (name-leading) is what he saw; chunk 2 (the fast-xStock caveat + CC-C's actual read + "your ruling") he never received.
- **This is live and load-bearing:** it happened on the throttle (1)/(2) decision that was in flight at the moment of writing — Langston is ruling on a truncated version of the input. Exactly Kyle's report: *"messages beyond a certain length are getting truncated, Langston isn't able to read them, load-bearing discussions have been missed."*

### Interim mitigation (ZERO code, available now)
**For any long CC→Langston dispatch, use the file-first pattern (CLAUDE.md §6.5): commit the full content to a file, then send Langston a SHORT pointer (< 2000 chars, single chunk, leading with "Langston").** This sidesteps the bug entirely — the workaround is already in our playbook; we simply have not been disciplined about applying it to long inline messages. **This is the standing rule until the code fix lands.**

### Fix options (crew + Langston to choose; each is a real code change)
- **(A) Re-prepend the address token to every chunk (send side). ★ INDEPENDENTLY PROPOSED BY KYLE (2026-07-20), and he is right it is nearly free:** the send side ALREADY counts characters to chunk at 2000, so inserting the recipient's name at each ~1998-char boundary costs almost nothing — it is a small change at the exact spot the count already exists. It keeps the address-gate intact and every chunk now wakes Langston, so **it fully fixes the SILENT-DROP (today's core bug — he sees all the content instead of only the first slice).** The one residual: (A) alone hands Langston chunk 1 and chunk 2 as TWO DISCONNECTED INVOKES (he is stateless — he rules on chunk 1, then sees chunk 2 with no memory of chunk 1), so for a REVIEW where the halves must be understood together it fixes "dropped" but not "coherent." That residual is exactly what (B) closes.
- **(B) Reassemble on the receive side — ★ RECOMMENDED (Langston, 2026-07-20; corrects this doc's original (A)-minimal lean).** Langston's bridge groups posts by their shared `first_id` (every chunk of one message already carries the SAME `first_id` — confirmed in `discord-cc-bridge.py:244`) and concatenates before applying the address-gate, delivering the whole message as ONE turn. **This is a deterministic group-by-message_id, NOT the fragile time-window this doc originally worried about** — so (B) is both MORE correct (one coherent turn to a stateless reviewer) AND EASIER than first graded. **Recommend (B), or (A+B) belt-and-suspenders. Not (A) alone.**
- **(C) Dedicated long-form path.** CC→Langston long dispatches always go file-first (the interim mitigation) promoted to a hard rule + a lint, so inline never exceeds one chunk. Complements (B); is the zero-code floor.
- **Not recommended:** doing nothing and relying on humans to keep messages short — that is the current state and it silently fails.

### Proposed home
A named batch, e.g. **B-COMMS-CHUNK-FIX**, owner = whichever CC takes it, Langston review. Small, high-value, and it unblocks reliable CC↔Langston review — arguably should jump the queue because it is silently corrupting every long review right now. **RUNNING_ISSUES entry to be minted by a write-capable session (CC-C is read-only).**

---

## PART 2 — GIT-PUSH / DEPLOY COORDINATION TOOL (design proposal, v1 for crew review)

### The problem, from tonight's concrete failures
Three sessions (CC-A, CC-B, CC-C) + Langston share ONE working tree on a flaky GDrive FUSE mount. Tonight produced, in a few hours:
- **index.lock collisions** — two sessions' git ops overlapping; a lock one session created, another had to reason about clearing.
- **another session's staged files sitting in the shared index** — CC-C nearly swept CC-B's `P19_B8_5E_SCOPE.md` into an unrelated commit; caught only by the tier-2 `git diff --cached` gate.
- **"who holds the wrench" is verbal** — the #540 / who-holds-the-wrench rule works only if a session announces in-channel and everyone reads it in time; it has no enforcement and no queryable state.
- **#542 segfaults** compounding all of the above (the mount itself is unreliable for writes).

The current controls (pull-before-push, explicit-paths-only, announce-in-channel, the commit guard hook) are **conventions, not a coordinated system.** Kyle's ask: a tool so pushes/deploys are coordinated and nothing gets overwritten loudly or silently.

### Design principle: the coordination substrate must NOT live on the flaky mount
The repo working tree is exactly the thing that is unreliable (#542) and contended. A coordination registry stored as a repo file inherits both problems. **Put the registry in Supabase Postgres** — it is already the shared state store, all three CC sessions + Langston have psql access, it is OFF the FUSE mount, and it is transactional (an atomic claim eliminates the race that a file cannot).

### Proposed: a `crew_coordination` table + a thin CLI wrapper
A single table, e.g.:
| column | meaning |
|---|---|
| `id` | pk |
| `session` | OLD Claude / NEW Claude / ANALYST Claude / Langston |
| `kind` | `claim` (editing shared paths) · `push` (pushing now) · `release` |
| `paths` | text[] — the shared paths being touched |
| `status` | `active` / `released` |
| `note` | free text (batch id, intent) |
| `created_at` / `released_at` | timestamps |

**★ Manual claim vs automatic enforcement (Kyle asked how the writes happen, 2026-07-20) — it is a HYBRID, and that is deliberate:**
- **The proactive claim is MANUAL** — a session runs one CLI line (`crew claim <paths>`) before it starts editing a shared path. This is a WRITE the session makes, on purpose. It is the same act as today's "I've got X" announcement in the channel, except it lands as a queryable DB row instead of a chat message that another session might scroll past. Its value is EARLY warning — it tells the others *before* work starts, so nobody begins conflicting work.
- **The enforcement is AUTOMATIC** — the `guard-bare-commit` hook already fires on EVERY commit with no session action. Extended to consult the board, it catches the collision at the last safe moment even if a session forgot to claim: committing shared paths that someone else holds → blocked/warned; committing paths you never claimed → warned + auto-recorded. **So the moment that actually causes overwrites (the commit/push) is covered automatically; the manual claim is the cheap early-warning on top.**
- **Why not make the claim itself automatic too:** there is no clean signal for "which session is editing which file" from the working tree alone (a changed file's mtime does not name its author). The reliable automatic catch-point is the git boundary (add/commit/push) — which the hook already owns — so that is where the automation lives, and the pre-edit claim stays a one-line courtesy that buys early warning.

**Access model — what each session does:**
- **Before editing a shared path:** `INSERT a claim`. First `SELECT` for an `active` claim on any overlapping path — if one exists and it is not yours, you are blocked; the note tells you who and why.
- **Before pushing:** `INSERT a push` row; only one `active` push at a time (enforced by a partial unique index) → pushes serialize; others see the queue.
- **After committing/pushing:** `UPDATE ... status='released'`.
- **Any session, any time:** `SELECT * WHERE status='active'` → the live board: who is editing what, who is pushing. **That is the information each session gets** — a queryable, always-current answer to "is it safe to touch X / push now."
- **Stale-claim reaping:** claims older than N minutes with no release auto-expire (a session died mid-work) — surfaced, not silently cleared.

**Why a CLI wrapper (not raw SQL):** one command each — `crew claim <paths>`, `crew push-begin`, `crew release`, `crew board` — so the discipline is one line, not a query. The wrapper lives on each machine (Helsinki for Langston; the CC sessions call it over the same psql path they already use).

### What it deliberately does NOT do (scope fence)
- It does not replace git or CI — it is an advisory coordination layer above them.
- It does not auto-merge or auto-resolve — it PREVENTS the collision by making contention visible before the write, and serializes pushes.
- It does not touch the #542 mount problem — that is a separate infra issue; this tool just stops making it worse by removing concurrent writers.

### Design decisions (Langston review folded in, 2026-07-20)
1. Advisory (a session CAN override a claim, with a logged reason) vs hard (blocked until release)? — recommend advisory-with-logged-override first, harden if it is abused.
2. **Langston is a read-only board READER, never a claimant** (he never pushes, per the who-holds-the-wrench rule) — **SETTLED (Langston agreed).**
3. **★ The commit-guard hook consulting the board is IN v1, not deferred (Langston, 2026-07-20).** Rationale: the board without the hook consulting it is just a queryable convention with a nicer view — **the hook is the only enforcement that isn't advisory.** So v1 = registry + CLI + the existing `guard-bare-commit` hook extended to consult the board and warn (or block) on an unclaimed shared-path commit. This is what makes the tool a control rather than a courtesy.

### Proposed home
A named batch, e.g. **B-CREW-COORD**, owner = a CC session, Langston review, after the comms-chunk fix (Part 3) since that unblocks the review itself. **This document is the Step-1 design input; it is NOT a scope file yet.**

---

## SUMMARY FOR THE LEDGER
- **Part 1:** delivered (running list, `0e038494b`).
- **Part 3 (truncation):** root-caused at source, live impact proven, interim mitigation stated (file-first), fix options laid out → **B-COMMS-CHUNK-FIX**, urgent.
- **Part 2 (coordination tool):** v1 design proposal, DB-backed registry + CLI → **B-CREW-COORD**.
- Both need a RUNNING_ISSUES number + a scope file authored by a write-capable session; CC-C is read-only and hands this off. Langston review requested on the whole document.
