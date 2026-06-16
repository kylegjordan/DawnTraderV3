# BATCH B-GOV — Governance Enforcement System — SCOPE (Step-1 DRAFT v1)

> **Owner:** Claude Old (CC-A). **From:** CC-A. **To:** Kyle (decider) + Langston (Step-1 review) + Claude New / CC-B (research peer).
> **Status:** Step-1 DRAFT v1, 2026-06-16. Built from Kyle's handoff brief + the CC-A design discussion (decisions in `Cross-Session Briefs/B_GOV_DESIGN_NOTES_CCA_2026-06-16.md`) + the cited research synthesis (`Cross-Session Briefs/B_GOV_RESEARCH_SYNTHESIS_CCA_2026-06-16.md`). CC-B's own research dump folds in as a revision if/when it lands.
> **Type:** Tooling + governance batch (new scripts/hooks/config + CLAUDE.md restructure). Touches NO trading code paths.

---

## §0 — Problem & why now

Our written governance is good; **enforcement is inconsistent** — docs that should update at batch-close sometimes don't, and it's only caught when Kyle asks. Root cause is structural, now officially confirmed by Anthropic: **"CLAUDE.md and memory are context, not enforced configuration… to block an action regardless of what Claude decides, use a hook"** + **"target under 200 lines… longer files reduce adherence."** Our CLAUDE.md is far over 200 lines, and Phase-19 compaction keeps summarizing the rules toward oblivion. **You cannot enforce a process with prose.** B-GOV moves enforcement into deterministic tooling. Sequence near-term — every batch until it lands keeps carrying the leak. **Nice property:** building this is itself a multi-doc batch, so its own close is the first live test of the gate.

## §1 — Architecture (two axes + an engine)

**Axis 1 — WHEN it checks ("3 doors"):**
- **Door 1 — DECLARE (start):** the work declares its change-class (phase / batch / sub-batch / hotfix); the gate picks the rulebook and auto-bumps an under-declared change.
- **Door 2 — PRE-BUILD (Verification Ledger):** the pre-audit must cite a PRIMARY source (`file:line` / query / compile probe / log) for every **state + dependency** claim. "A search said so" is NOT acceptable.
- **Door 3 — CLOSE (two checks):** (a) POST-BUILD verification block (method matched to change type); (b) DOC-CLOSE manifest cross-checked against the actual git diff.

**Axis 2 — HOW it enforces (the 6-layer stack, from research):**
| Layer | Mechanism | Enforces |
|---|---|---|
| L0 | slim CLAUDE.md (<200 lines) + `.claude/rules/` | intent only (no enforcement claimed) |
| L1 | `/close-batch` command | convenience: runs gate, scaffolds the manifest |
| L2 | `scripts/governance-gate.mjs` (config-driven, deterministic) | checkable facts |
| L3 | Stop hook → runs gate, blocks "done" until green (`stop_hook_active` guard + iteration ceiling) | "done" un-declarable while red |
| L4 | auditor (fresh sub-agent routine / Langston ambiguous), separate context | judgment: substantive-update-vs-date-bump, citation-supports-claim |
| L5 | CI backstop (gate runs on batch-close commits) + `permissions.deny` protecting gate config/hooks | the layer the model can't reach |

**The engine — one config is the source of truth.** Each governed doc → `{ required_for:[classes], applies_when:<always | diff-glob | issue-ref | phase==N | milestone | scope-registered>, lifecycle:<update|create|retire|promote>, detect:<how> }`. The gate reads the config; CLAUDE.md just points at it. Adding/changing a rule = a config edit, never a prose edit.

**The Checker (Kyle's question, answered):** the GATE is a deterministic SCRIPT (no LLM, runs in seconds, can't be argued with or forgotten). The AUDITOR is tiered LLM judgment — a fresh local sub-agent (adversarial prompt) for routine closes, the EXISTING Langston for ambiguous/architectural calls. **No new server agent.** Research confirms the auditor must be a SEPARATE context (don't grade your own work) — Langston already satisfies that.

## §2 — Numbered objectives (each with verification)

**Obj 1 — The config (`governance.config.json` or `.mjs`).** Single source of truth encoding: (a) every governed doc with its `required_for` / `applies_when` / `lifecycle` / `detect`; (b) the change-class definitions + the hotfix→sub-batch bump triggers; (c) the diff→applicability heuristics (conservative). Encode FROM current CLAUDE.md §3 (Tier-1/Tier-2 doc lists) + §9 (SIM/System-Manual discipline + the 2026-06-16 "reorganizing ≠ updating content" rule). **Verify:** a dry-run prints, for a sample diff, exactly which docs it deems required and why; reviewing the config alone tells you the whole policy.

**Obj 2 — The gate script `scripts/governance-gate.mjs`.** Deterministic, runs in <~3s, exit-code contract (0 green / non-zero red with a precise failure list naming exact docs/fields). Checks: manifest present + every governed doc row is `updated|n/a:<reason>`; manifest cross-checked vs `git diff` (a doc the diff proves applicable but marked n/a → FAIL naming it); required CREATE/RETIRE done; Verification-Ledger citations present + typed; post-build verification block present + typed. **Verify:** unit-tested against fixtures — a clean close passes; each violation class fails with the right message; runs identically locally + in CI.

**Obj 3 — Door 1: change-class declaration + auto-bump + RENAME + RE-SLOT.** A batch declares its class up front (a small `batch.meta` or header field). The gate infers from diff size/shape and **auto-bumps** a "hotfix" that's secretly large (adds/removes a file, a migration, >~N files [N to confirm], or hits architecture/strategy/regime/filter/signal-pipeline/math paths). On bump: the gate REQUIRES a rename (e.g. `hotfix-6` → its new batch/sub-batch name) AND re-registration into all then-current tracking docs (roadmap, active per-phase plan, PHASE_HISTORY, BATCH_CATALOG) — these become required items the gate verifies. **Verify:** a deliberately-under-declared hotfix fixture is caught + the gate names the rename + the 4 re-slot targets; a correctly-declared one passes.

**Obj 4 — Door 2: pre-audit Verification Ledger.** A structured block in the pre-audit: every **state + dependency** claim (on/off/wired/dead/functioning; "X feeds/consumes/depends-on Y") carries a citation of an accepted PRIMARY type (`file:line`, query, compile probe, log line). The gate hard-checks presence + type; "search result" is rejected as a type. **Verify:** a pre-audit with an uncited state claim FAILS naming it; one citing a `file:line` passes the gate; the auditor (Obj 9) separately confirms the citation supports the claim. This directly kills the quick-search-was-wrong failure mode + forces genuine SIM/System-Manual consultation (§9).

**Obj 5 — Door 3a: post-implementation verification block.** A "how I verified it works" block, method matched to change type: staging-UI-navigated (per §9.3, for UI), runtime logs (for behavior), code/tests/types (for pure code). The gate requires the block present + the method-type appropriate to the diff. **Verify:** a close lacking the block FAILS; a UI change whose only evidence is a curl (not a UI navigation) is flagged per §9.3; a code-only change passes on tests+types.

**Obj 6 — Door 3b: doc-close manifest.** A fixed block at the end of every completion report listing EVERY governed doc as `updated | n/a:<reason>`. The gate cross-checks it against the git diff. **Verify:** silent omission of an applicable doc becomes a FAIL naming the exact doc; a justified n/a passes.

**Obj 7 — Doc lifecycle: create / ad-hoc / temporary / retire / promote.** The config + gate govern not just UPDATES but CREATION and RETIREMENT: (a) entering a new phase REQUIRES creating that phase's plan doc; (b) a batch/phase can REGISTER a temporary working doc into its scope (the Batch-24 "xStock-piping" pattern), required-while-active, then RETIRE/ARCHIVE or PROMOTE at close. Parameterized doc-types resolve to the current context: the per-phase plan (`PHASE_19_PLAN` → `PHASE_20_PLAN` …) and the umbrella running-progress report. **Verify:** a new-phase fixture without its phase-plan FAILS; a registered temporary doc is required while its scope is open + the gate confirms it's archived/promoted at close.

**Obj 8 — Umbrella / sub-batch governance.** Each sub-batch closes against ITS OWN diff when it lands (own Verification Ledger, own post-build check, own mini-manifest) + adds a row to the umbrella running-progress report (a required always-current doc). The umbrella's FINAL close gate confirms (a) every sub-batch closed clean + (b) roll-up docs landed (BATCH_CATALOG, PHASE_HISTORY, umbrella completion report). **Verify:** an umbrella close with an unclosed sub-batch FAILS; the running-progress report stale vs the sub-batch set FAILS.

**Obj 9 — The auditor (L4), tiered.** `/close-batch` (or the gate's green exit) triggers an auditor pass: a fresh local sub-agent with an adversarial prompt ("find a doc that should be updated but is marked n/a; verify each cited file:line actually supports its claim") for routine closes; Langston for ambiguous/architectural/high-stakes. **Verify:** a "reorganized-but-not-updated" doc (the §9 anti-pattern) marked `updated` is caught by the auditor even though the gate (which only sees that the file changed) passed it.

**Obj 10 — Wiring: `/close-batch` + Stop hook + CI backstop.** Build order: (1) the gate script + `/close-batch` command first (prove the logic); (2) the Stop hook second — calls the gate, blocks "done" with the failure list as the reason, with the `stop_hook_active` guard AND an external iteration ceiling (counter), field-name verified against our installed Claude Code build; (3) CI backstop — the same gate on batch-close commits so anything that slips the local hook turns CI red. Protect the gate config + hook scripts via `permissions.deny`. **Verify:** the Stop hook blocks a red close and releases on green; a forced-loop fixture proves the guard+ceiling prevents the death-loop; CI fails a red batch-close commit.

**Obj 11 — Slim the CLAUDE.md (move-don't-delete, staged LAST).** Move the detailed Tier-1/Tier-2 lists (§3) + the SIM/System-Manual discipline (§9) into the gate's config (executable spec) + `.claude/rules/` path-scoped files + a linked `governance.md`; leave a SHORT pointer in CLAUDE.md. Use `.claude/rules/` (path-scoped) + skills for real context savings — NOT `@`-imports (which don't reduce context). Net zero rules lost; they're enforced mechanically. **Verify:** CLAUDE.md materially shorter (target the always-loaded core back toward/under the official 200-line guidance); the gate config + rules provably cover every rule moved; a before/after rule-inventory shows none dropped.

**Obj 12 — Governance for THIS batch = the first live test.** B-GOV closes THROUGH its own gate (dogfood). **Verify:** the gate, run on B-GOV's own close, passes only after B-GOV's own manifest + ledger + verification + doc-lifecycle are complete.

**Obj 13 — Periodic + closure-triggered KEY-DOC MAINTENANCE / CLEANUP (Kyle directive 2026-06-16).** The per-batch gate catches "was this doc updated"; this catches the slower drift the gate can't: bloat, disorganization, stale sections, and "touched-but-not-substantively-updated." (Motivating facts 2026-06-16: SYSTEM_MANUAL = 12,527 lines, CHANGES_AND_FIXES = 3,681, SIM = 3,070 — all heavily-committed but large + drift-prone; Kyle's read that CHANGES_AND_FIXES "hasn't been updated in a long time" — git shows it touched 35h ago / 40×/30d, BUT "touched in a bundled commit" ≠ "got a real, well-placed entry," which is exactly the gap this objective closes.) Two parts:
  - (a) **Scheduled periodic sweep** (recurring task, like the daily-model-check infra; cadence TBD — propose: triggered at each phase-close + a ~monthly floor). A DETECTOR flags, per key living doc (SIM, System Manual, roadmap, CHANGES_AND_FIXES, RUNNING_ISSUES, active phase plan): length over a threshold, stale/duplicate sections, touched-vs-substantively-updated mismatch, and **cross-doc consistency** (e.g. a closed batch with no corresponding CHANGES_AND_FIXES / BATCH_CATALOG entry). Findings open a CLEANUP PASS done by a session / auditor sub-agent — organization only; the §9 "reorganizing ≠ updating content" caution applies (cleanup ≠ a content update, and must not be mistaken for one).
  - (b) **Closure-triggered cleanup:** PHASE-close REQUIRES a cleanup/reconciliation pass of that phase's plan doc (it's being retired/archived anyway — clean it as part of closure, per Obj 7). UMBRELLA-batch-close REQUIRES a completion-report completeness + organization double-check: an auditor confirms the report is organized correctly AND includes every sub-batch's findings + steps + all required sections (per Obj 8).
  **Verify:** the sweep flags a doc over its length/staleness threshold + a closed-batch-missing-its-CHANGES_AND_FIXES-entry; a phase-close without its plan-cleanup FAILS the gate; an umbrella completion report missing a sub-batch's findings is caught by the completeness auditor.

## §3 — Change-class required-sets (to confirm with Langston/Kyle)
| Class | Required set |
|---|---|
| **Hotfix** | CHANGES_AND_FIXES line + RUNNING_ISSUES if it closes one + a quick post-build check. NO scope/full report. **Auto-bumps** if large (Obj 3). |
| **Sub-batch** | own Verification Ledger + own post-build check + own mini-manifest + umbrella running-report row. |
| **Batch** | full: scope + pre-audit (ledger) + code review + post-build verification + completion report + manifest + all applicable docs. |
| **Phase** | a milestone of batches + CREATE the per-phase plan doc. |

## §4 — Out of scope / explicitly deferred
- The notification-escalation system (10-min "still need you" timer) — already landed separately in CLAUDE.md §6.10; NOT part of B-GOV.
- Trading-code changes — none; B-GOV touches scripts/hooks/config/docs only.
- A full PreToolUse "no edit without an active task" gate (RFC-style) — possible future hardening; B-GOV focuses on the batch-CLOSE + pre-audit gates first.

## §5 — Gotchas baked in as TEST CASES (from research)
Stop-hook infinite-loop (guard + ceiling + verify field name); subagents bypass parent hooks → gate MUST also run in CI; model self-modifying settings/hooks → `permissions.deny` protection + a self-modification check; `cat >` heredoc bypassing a Write-matcher → match Bash / rely on CI; `@`-imports don't slim → use rules/skills; **exit 1 ≠ block — only exit 2 / `decision:block`.**

## §6 — Open items for Langston + CC-B to settle
1. The hotfix size-bump threshold N (Obj 3).
2. How aggressive the diff→applicability heuristics (conservative recommended; the n/a-with-reason valve + auditor cover the rest).
3. Auditor tiering split (which close-types go sub-agent vs Langston).
4. How far to slim CLAUDE.md in THIS batch vs a fast-follow (it's the constitution — careful, move-don't-delete).
5. Config format (`.json` vs `.mjs` for expressiveness of `detect` predicates).

## §7 — Governance (Tier-1 + applicable Tier-2) for B-GOV itself
BATCH_CATALOG + PHASE_HISTORY + MEMORY (+ Langston MEMORY) + this scope + pre-audit + completion report; SIM IF a component/cross-cutting-state is added (the gate/hook are new components → SIM entry); CLAUDE.md §3/§9 restructured (Obj 11) + a new `governance.md`. CI all-4-green. Its own close run through the gate (Obj 12).

## §8 — Sequencing
Near-term (Kyle: every batch until it lands keeps leaking). Step-1 (this scope) → Langston review + Kyle confirm → Step-2 pre-audit (consult SIM for every touched surface; confirm the Claude Code build's hook field names) → Step-3 build in the order of Obj 10 → Step-4 Langston code review → CI → Step-7/8 verify → governance close (dogfooded through the gate).

— CC-A (Claude Old), 2026-06-16
