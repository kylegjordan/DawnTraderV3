# B-LANGSTON-CLAUDEMD-RESIDUAL — scope (Step 1, r1)

change-class: architecture

> **Owner:** Infra Claude (CC-INFRA), with Langston (it is his instructions file). **Slotted by Kyle 2026-10-20** as Infra Claude's next batch, immediately after `B-LANGSTON-RELIEF`, started during that batch's 7-day window (`SPRINT_TO_LIVE_PLAN.md`, the row below `B-LANGSTON-RELIEF`). **Carries `B-LANGSTON-RELIEF` OBJ-3's ceiling** (Kyle 2026-10-20, option A; that batch's scope row OBJ-3a).
> **Folds in `B-RULES-1E-LANGSTON-SLIM`** (`#974`; "lean core + on-demand modules + ledger split", Infra Claude's since 2026-08-05; listed "parked by Kyle, deliberately undated" in `PRE_LIVE_SPRINT.md`). The ledger-split leg already shipped in `B-LANGSTON-RELIEF` OBJ-3. Kyle's 2026-10-20 instruction to slot this work is read as unparking the rest; he was told in chat, with the option to keep it parked.

## Why (measured 2026-10-20, Helsinki, `langston-size-watch --status`)

Every Langston invocation — each question, review or reply is a fresh `claude -p` — auto-loads three files:

| file | bytes | role |
|---|---|---|
| `/home/langston/CLAUDE.md` | 67,896 | persona + standing rules (harness auto-load) |
| `/home/langston/MEMORY.md` | 75,159 | composed memory, trimmed nightly since 2026-10-16 (`@MEMORY.md` at line 3) |
| `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md` | 9,052 | harness auto-memory index, title + link only since 2026-10-17 |
| **sum** | **152,107** | **ceiling 143,856 (row 2.8b, may only decrease) — over by 8,251** |

`B-LANGSTON-RELIEF` took the sum from 918,745 B to 152,107 B. The memory file now trims itself; the rules file has no such mechanism and is the largest remaining fixed cost. It has also grown: 63,750 B on 2026-08-05 (`RUNNING_ISSUES` `#651` B6) → 67,896 B now. **And it has no version history:** no copy lives in the repo, so an edit to it cannot be reviewed at a ref and cannot be rolled back from git (measured: `git ls-files` has no path for it).

Its sections, measured by byte count (25 `## ` sections under the title; largest first): how to read a governed artifact 7,970 · three-way communication 7,121 · personality/style 5,664 · system alerts per-turn check 4,408 · block thin scopes 4,075 · surfaced-issue scheduling 3,417 · dispatch anchoring 3,290 · expertise 2,903 · critical rules 2,876 · task-completion honesty 2,776 · the rest under 2,500 each.

## Objectives

| # | objective | done when |
|---|---|---|
| OBJ-1 | **Version his rules file — parity with Coltrane, whose `AGENTS.md` is already in the repo (`comms-infra/codex/AGENTS.md`, byte-identical to the live file, measured 2026-10-20).** The live `CLAUDE.md` is copied into the repo (`comms-infra/langston/CLAUDE.md`), byte-identical, and from then on it is changed only by a reviewed commit installed by hash — the same discipline as his tools. | Repo blob hash = live file hash; a written install procedure; the size watch and the load canary still read the live path unchanged. |
| OBJ-2 | **A per-section census, with a placement for each.** For each of the 25 sections: bytes; what it governs; WHEN it must be in his context — every invoke (identity, honesty, how he reads code, the alert check, refusal rules) or only for a kind of task (e.g. dispatch anchoring at Step 4, plan upkeep at Step 10); facts it states that may be stale; and one placement: **core** (always loaded), **module** (moved verbatim to a named file he reads when its trigger applies), or **correct/retire** (stale or superseded — only with Langston's ruling and Kyle's where it is his directive). | The census table exists, Langston has ruled on every row, and no row is "unplaced". |
| OBJ-3 | **Lean core + on-demand modules.** Sections placed "module" move VERBATIM to files under `/home/langston/rules/`; the core keeps, for each, a one-line pointer naming the file and the trigger ("before any Step-4 review, read rules/dispatch-anchoring.md"). Nothing is deleted; every moved paragraph is byte-identical in its module. | Every moved section's bytes are found verbatim in its module (diffed); the core names every module and its trigger; Langston confirms the core still tells him everything he must know before he knows what task he has. |
| OBJ-4 | **The ceiling is met** (carried from `B-LANGSTON-RELIEF` OBJ-3). | `langston-size-watch --status` shows the sum ≤ 143,856 for two consecutive daily runs; the byte delta of each change is stated. Lowering the ceiling to the new sum is a separate, deliberate act (row 2.8a) and NOT assumed here. |
| OBJ-5 | **He still receives what he needs.** The load canary's probe 1 counts the core's `## §N` sections and must be re-derived after the split; a check that a module is read when its trigger fires. | Canary `--self-test` passes and a live run returns LOADED after the change; one module-trigger case observed in a real review. |
| OBJ-6 | **Coltrane parity.** Measured: his auto-loaded set is one file, `/home/coltrane/.codex/AGENTS.md`, 14,446 B, under his own ceiling, and already versioned in the repo. | A written applies / does-not-apply per objective: OBJ-1 already met for him (it is the model); OBJ-2-5 do not apply unless his file approaches its ceiling. |

## Provenance read (Step 1.b)

- **Tier 1 — `/home/langston/CLAUDE.md` (behaviour changes):** corpora searched — `RUNNING_ISSUES.md` (`#651`, `#974`, `#1197`), `LANGSTON_ARCHITECTURE.md` (§4 files, change log), `PHASE_19_PLAN.md` rows 2.8a/2.8b, `PRE_LIVE_SPRINT.md` (parked list), `B_LANGSTON_RELIEF` scope/pre-audit. Its intent, from `LANGSTON_ARCHITECTURE.md`: his persona and standing rules, auto-loaded by the harness so a stateless invoke starts with them. `#651` (2026-08-05) records its last audited correction pass and names the slimming leg's home. The batch that created it (the 2026-05-06 move off OpenClaw) predates the repo copy convention; **its original text is not in git — `INFERRED-FROM-CODE` for anything before 2026-08-05.** Disposition: **(2) relevant, needs updating to today's intent** — the content stays, its loading changes.
- **Tier 2 — read, not changed:** `langston-size-watch` (measures the sum; unchanged), `langston-load-canary` (probe 1 re-derived, OBJ-5), `langston-memory-write` (unchanged), the privacy check (excludes lines present in the review branch — OBJ-1 adds his rules text to the branch, so its exclusion set grows; to be re-measured in Step 2).

## Design questions for Langston (Step 1 review)

1. OBJ-1: any line of your `CLAUDE.md` you would NOT want in the repo, where every session can read it? (Your memory has content you keep private; this file is meant to be your standing rules.)
2. OBJ-3: which sections must be present BEFORE you know the task (core), versus read when a trigger fires? The census proposes; you rule.
3. A risk to rule on: a module you fail to read when its trigger applies. Is a named trigger in the core enough, or does a module need a check that it was read?
4. Module location: `/home/langston/rules/` (yours, writable by you) or a root-owned read-only directory like the tools' `state/`?

## Out of scope

Lowering the ceiling (row 2.8a); his `MEMORY.md` (trimmed nightly by `B-LANGSTON-RELIEF`); his model; Coltrane's file contents.
