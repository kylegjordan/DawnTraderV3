# B-GOV (Governance-Hardening) — design notes (Claude Old / CC-A working file)

> Owner: Claude Old (CC-A). Seeded 2026-06-16 during the design discussion with Kyle. This is the running design state (survives compaction). Becomes the basis for the formal `BATCH_B_GOV_SCOPE.md`. Companion: `B_GOV_CCB_RESEARCH_HANDOFF.md` (Claude New's research, incoming) + Kyle's handoff brief.

## Locked decisions (Kyle 2026-06-16)
1. **Scope boundary:** build BOTH the document-close gate AND the pre-audit/workflow Verification-Ledger gate together in one B-GOV batch. (Plus the two additions below.)
2. **Verification Ledger strictness:** cite **state + dependency claims** (on/off/wired/dead/functioning + "X depends on / feeds / is consumed by Y") — NOT every factual claim. Expand later only if needed.
3. **CC-B research:** Claude New dumps its full research to `B_GOV_CCB_RESEARCH_HANDOFF.md` (pinged 2026-06-16).

## Two ADDITIONS Kyle raised (must be in scope)
A. **Umbrella / running-progress governance.** Big batches spawn sub-batches mid-flight + keep a running progress report open until all sub-batches close. Design: each sub-batch closes against ITS OWN diff when it lands (own pre-audit claims, own post-build check, own mini-close + a row in the running report); the running progress report is a REQUIRED always-current doc (parameterized doc-type, like the per-phase plan); the umbrella does a FINAL close where the gate confirms (a) every sub-batch closed clean + (b) roll-up docs landed (BATCH_CATALOG, PHASE_HISTORY, umbrella completion report). Nothing waits until the end to be governed.
B. **Post-implementation verification gate (NEW workflow gate — Kyle emphasis).** Enforce that post-implementation checks ARE done, with a checklist of verification TYPES matched to change type: staging-UI-navigated (§9.3), runtime logs, code/tests/types. The completion requires a "how I verified it works" block citing the method + evidence appropriate to the change. Ties to §9.3 (staging-verified = UI-navigated, not curl) + §5 outcomes-based.

## The model (plain language — "3 doors + 4 classes")
THREE automatic checkpoints ("doors") in every piece of work; a deterministic gate guards each, names exactly what's missing, self-heals (session fixes named gaps + re-runs; Kyle never in the routine loop):
- **Door 1 — START / DECLARE:** declare the change-class (phase / batch / sub-batch / hotfix) → picks the rulebook. Gate auto-bumps a "hotfix" that's secretly large (adds/removes file, migration, >~3-5 files, or hits architecture/strategy/regime/filter/signal-pipeline/math paths).
- **Door 2 — PRE-BUILD (Verification Ledger):** pre-audit must cite a PRIMARY source (file:line / query / compile probe / log) for every state+dependency claim. "A search said so" is NOT acceptable. Gate checks citations present+typed; auditor (sub-agent routine / Langston ambiguous) checks they're real + support the claim. Fixes the quick-search-was-wrong failure mode + forces SIM/SysManual to be genuinely consulted.
- **Door 3 — CLOSE (two checks):** (a) POST-BUILD verification block — proof it works, method matched to type (staging UI / runtime logs / code). (b) DOC-CLOSE manifest — fixed block listing every governance doc as updated | n/a:<reason>; gate cross-checks manifest vs the actual git diff so "applicable" is detected not self-reported; names the exact missing doc.

FOUR classes (the rulebook each applies):
- **Hotfix:** CHANGES_AND_FIXES line + close issue if any + quick post-check. No scope/full report. (Auto-bumps if large.)
- **Sub-batch:** own pre-audit claims + own post-build check + own mini-close vs its diff; row in the umbrella running report; lighter than standalone batch.
- **Batch:** full — scope, pre-audit (ledger), code review, post-build verification, completion report + manifest, all applicable docs.
- **Phase:** milestone of batches; adds the per-phase plan doc.

## Engine (one config, mechanical objective / auditor subjective)
- Single config = source of truth: each doc → `{ required_for: [classes], applies_when: <always | diff-glob | issue-ref | phase==N | milestone>, detect: <how> }`. CLAUDE.md just points at it (slim move-don't-delete, staged last in the batch).
- Gate = `scripts/governance-gate.mjs` (deterministic, seconds). Home order: script + `/close-batch` first → Stop hook (with stop_hook_active loop guard) + CI backstop second.
- HARD-gate objective (a required doc/citation/verification is absent); SOFT-flag subjective (content quality) so it never loops. `N/A with reason` is the escape valve.

## More refinements Kyle locked 2026-06-16 (round 2)
C. **Bump = RECLASSIFY + RENAME + RE-SLOT (not just stricter rules).** When the gate auto-bumps (hotfix→sub-batch/batch), it must (i) RENAME the item (e.g. "hotfix-6" → its new batch/sub-batch name) and (ii) SLOT the renamed item into ALL tracking docs current at that time: roadmap, the active per-phase plan, PHASE_HISTORY, BATCH_CATALOG. The bump is a full re-identification + registration event, gate-enforced (the rename + the new registrations become required items the gate checks).
D. **Document CREATION + AD-HOC / TEMPORARY docs are first-class (Kyle emphasis).** The system governs not just UPDATES but CREATION and RETIREMENT:
   - CREATE-required: entering a new phase REQUIRES creating that phase's plan doc (break into batches etc.); milestone docs required at their milestone.
   - AD-HOC / TEMPORARY docs: a batch/phase can REGISTER a temporary working doc into its own scope (example: Batch-24 assumed xStock was wired into active-trading, found it wasn't → created a separate doc within the umbrella plan to install the xStock piping into that sub-batch — a doc maintained TEMPORARILY within a batch of a phase). The config/manifest must let a session register such a doc as "required-while-this-scope-is-active," then RETIRE/ARCHIVE it (or PROMOTE it to permanent) at close. So the doc list is not a fixed permanent set — it supports per-scope, lifecycle-managed (create→maintain→retire/promote) docs.
   → Doc lifecycle in the config: CREATE (phase/milestone/ad-hoc) · UPDATE (existing) · RETIRE/ARCHIVE or PROMOTE (temporary at close).

## WHO IS THE CHECKER (Kyle question 2026-06-16) — answer
TWO distinct things, do NOT conflate:
- **The GATE = a deterministic SCRIPT (`scripts/governance-gate.mjs`), NOT an agent.** Plain code, runs in seconds, no LLM, no cost: reads config, compares manifest vs git diff, checks citations/verification-blocks present+typed, detects bump triggers, confirms required CREATE/RETIRE. This is ~90% of enforcement. Runs locally (Stop hook + `/close-batch`) AND in CI. It cannot be "skipped" — it's infrastructure.
- **The AUDITOR = LLM judgment, TIERED, NO new server agent needed:**
  - Routine closes → a FRESH local SUB-AGENT spawned by the running session (cheap, ephemeral, fresh-context, adversarial prompt: "find a doc that should've been updated but is marked N/A; verify each cited file:line actually supports its claim"). Independent-enough via fresh context + adversarial framing.
  - Ambiguous / architectural / high-stakes → the EXISTING Langston (already our independent reviewer on a separate box; truly independent). No 3rd standing agent — adds cost+maintenance for no gain.
  - The running session NEVER grades its own homework directly; the gate is mechanical + the auditor is a separate context.

## Open items to settle when CC-B research + Langston land
- Exact diff→applicability heuristics (conservative) + the hotfix size-bump threshold N.
- Auditor tiering (sub-agent routine vs Langston) — confirm split.
- Parameterized doc-types: per-phase plan (PHASE_19_PLAN→PHASE_20_PLAN) + the umbrella running-progress report.
- How far to slim CLAUDE.md §3/§9 in-batch vs fast-follow.

## Next steps
1. Receive `B_GOV_CCB_RESEARCH_HANDOFF.md` (CC-B). 2. Kyle confirms the plain-language model. 3. Draft `BATCH_B_GOV_SCOPE.md` → Langston Step-1. 4. Build (its own close = first live test of the gate).
