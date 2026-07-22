# B-CREW-COORD — STEP-1 SCOPE

> **change-class: non_architecture**
> **Owner:** Claude Analyst (CC-C). **Reviewer:** Langston (Step-1 ACK, then Step-2 pre-audit, then Step-4 diff).
> **Issue:** RUNNING_ISSUES **#554**. **Design input:** `1-system-manual/CREW_COORDINATION_AND_COMMS_PROPOSAL_2026-07-20.md` Part 2 + Part 4 (Langston-reviewed 2026-07-20; that doc is design input, this is the scope).
> **Predecessor:** B-COMMS-CHUNK-FIX (#553) — sequenced first per Kyle, because it unblocks the review channel this batch depends on.
> **Wrench:** called in `#general` 2026-07-22 on `.claude/hooks/guard-bare-commit.mjs`; **CLEARED by both CC-A and CC-B** (neither holding it, nothing staged against it).

---

## 0. WHY THIS EXISTS (Kyle's words, and the measured failures behind them)

Kyle: *"some sort of tool, scheduling tool for the Git pushes so that we're more coordinated… Otherwise, stuff's gonna get overwritten loudly or silently."*

Three CC sessions plus Langston share ONE working tree on a FUSE mount that is itself unreliable (#542). In a few hours on 2026-07-19 that produced: index.lock collisions between overlapping git operations; **two index sweeps in opposite directions** (`d090178d6` swept CC-B's 9-path set including a file Langston's conditional GO was holding; `5f291a17e` swept CC-A's paths back) — proving the hazard is bilateral, not one session's sloppiness; and a near-third sweep caught only by a manual staged-set check.

Today's controls — pull-before-push, explicit-paths-only, announce-in-channel, the commit guard — are **conventions plus one narrow hook.** The announce-in-channel convention has no enforcement and no queryable state: it works only if every session posts *and* every other session reads it in time. **A practice you have to remember is not a control.**

---

## 1. NUMBERED OBJECTIVES

**OBJ-1 — A coordination registry that does NOT live on the flaky mount.**
A `crew_coordination` table in Supabase Postgres: `id`, `session`, `kind` (`claim` | `push`), `paths text[]`, `status` (`active` | `released` | `expired`), `note`, `created_at`, `released_at`. Supabase is already the shared store, all parties reach it, it is off the FUSE mount, and it is **transactional** — an atomic claim eliminates a race a repo file structurally cannot.
*Verification:* table exists; two concurrent claims on the same path resolve to exactly one winner.

**OBJ-2 — Push serialization.**
At most one `active` push row at a time, enforced by a **partial unique index** (not by application logic). Others see the queue rather than colliding.
*Verification:* a second `push-begin` while one is active is refused by the database, demonstrated live.

**OBJ-3 — A `crew` CLI so the discipline is one line, not a query.**
`crew claim <paths…>` · `crew push-begin` · `crew release` · `crew board`. Runnable by all three CC sessions; **Langston is a read-only board READER, never a claimant** (settled with Langston 2026-07-20 — he never pushes, per who-holds-the-wrench).
*Verification:* each subcommand exercised from a CC session; `crew board` read from Helsinki.

**OBJ-4 — ★ THE ENFORCEMENT: extend the EXISTING `guard-bare-commit.mjs` to consult the board.**
This is what makes it a control rather than a courtesy (Langston, 2026-07-20: *the board without the hook consulting it is just a queryable convention with a nicer view*). Committing paths another session actively holds → blocked with a message naming who holds it and why. Committing shared paths you never claimed → warned and auto-recorded.
*Verification:* a real block demonstrated against a foreign claim; a real warn demonstrated on an unclaimed commit.

**OBJ-5 — Stale-claim reaping that SURFACES rather than silently clears.**
Claims older than N minutes with no release expire — because a session can die mid-work — but expiry is **visible on the board with its reason**, never a silent delete. (Same fail-loud principle as #553: a silently-cleared claim is the same class of invisible loss.)

**OBJ-6 — ADOPTION, as a first-class objective with a hard close gate (Kyle 2026-07-21).**
Per Part 4, most-automatic first: (1) the hook teaches the `crew` commands inline at the moment of the block, so a session cannot slip past it and learns it exactly when needed — **even a long-running session that never re-read its instructions**; (2) a CLAUDE.md rule, which auto-loads for every new session and for **Langston on every invocation**; (3) a MEMORY session-start line; (4) an in-channel "re-read this now" post for currently-running sessions, since instruction files reload only at session start or compaction.
**★ CLOSE GATE — do not declare adoption, prove it:** the batch is NOT closed until `crew board` shows real claims or pushes from **all three CC sessions**, cited in the completion report. Silent non-use reads as adoption; it isn't.

---

## 2. ★ OPEN QUESTION THAT COULD INVALIDATE THE SUBSTRATE CHOICE — for Langston at Step-1, before any code

**The proposal says "put the table in Supabase" and stops there. It does not say HOW the table is created, and that gap is load-bearing.**

This repo has **schema drift-detection** against a pg_dump'd initial schema. So a `crew_coordination` table created out-of-band — outside the Drizzle migration system — is at risk of being **reported as drift, or dropped by a future schema-sync**, which would silently destroy the coordination state the whole control depends on. That is a worse failure than having no tool: a board everyone trusts and that quietly empties.

Three candidate dispositions, and I do not want to pick unilaterally:
- **(a) Registered Drizzle migration**, table in the app's schema — versioned, reviewable DDL, drift-safe; cost is coupling crew tooling into the trading app's migration history and CI.
- **(b) Out-of-band table + an explicit drift-detector exclusion** — keeps crew tooling decoupled; cost is a new exclusion nobody maintains, and it only works if the exclusion mechanism actually exists.
- **(c) A separate schema (e.g. `crew.`) outside the app's namespace** — cleanest separation; depends on whether the drift tooling is schema-scoped.

**I have NOT yet verified which of these the drift tooling actually permits — that is Step-2 pre-audit work, and I will not assert it from memory** (the governed-read rule: an asserted absence or capability needs presence-evidence). Flagging it at Step-1 because if the answer is (a), the change-class arguably rises and CI becomes a gate — which changes this batch's shape before a line is written.

---

## 3. SECOND DESIGN QUESTION — the hook must not repeat its own history

`guard-bare-commit.mjs` has **twice** bitten the people documenting it: it blocked a Discord message whose body merely *quoted* the protocol, because substring matching cannot distinguish an EXECUTION from a MENTION; and its header claimed it ignored heredocs while the code parsed every prose line inside one as a command. Langston's ruling then was that this is not a regex to tighten but the wrong SHAPE of check — *a control whose false positives land on the people documenting it selects against its own upkeep.*

**So the board-consulting extension inherits two non-negotiables:** it must key off the **actually-staged path set** (`git diff --cached --name-only`) — real state, never text matched out of the command string — and it must stay **FAIL-OPEN**: if Supabase is unreachable, the commit proceeds with a warning. **A coordination tool that can hard-block all committing when the database is down is a worse outage than the collisions it prevents.**

---

## 4. SCOPE FENCE — what this deliberately does NOT do

Does not replace git or CI (advisory layer above them) · does not auto-merge or auto-resolve (it makes contention visible *before* the write and serializes pushes) · does not fix the #542 mount problem (separate infra issue; this only stops making it worse by removing concurrent writers) · does not touch any trading-path code.

---

## 5. ROLLBACK

Hook: revert the one file (the board consult is additive and fail-open, so reverting restores today's behaviour exactly). Table + CLI: drop/park — nothing in the trading system reads either, so removal cannot affect trading behaviour. **This property is deliberate and should be preserved through review: no trading code path may ever depend on the coordination board.**

---

## 6. ASK FOR STEP-1 ACK

Langston: rule on **§2 (which substrate disposition, given drift-detection)** and confirm **§3's fail-open + staged-path-set requirements** are the right constraints. If §2 lands on (a), say so explicitly — it changes the change-class and puts CI in the path, and I would rather re-declare at Step-1 than discover it at Step-5.
