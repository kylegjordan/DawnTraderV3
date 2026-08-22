---
name: workflow-10-governance
description: STEP 10 ONLY of the DawnTrader batch workflow - Governance Updates. Use when updating the Tier 1 and Tier 2 governance documents a batch touched, including BATCH_CATALOG, PHASE_HISTORY, SYSTEM_MANUAL, SYSTEM_IMPACT_MAP and Langston's own MEMORY file. NOT for writing the completion report, which is step 11.
---

# STEP 10 — GOVERNANCE UPDATES

**Ends when:** every applicable Tier-1 and Tier-2 document has landed its CONTENT update.

## TIER 1 — EVERY BATCH, NO EXCEPTIONS
`BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` (while Phase 19 runs — §1 board + §5 decision log) · your `MEMORY_CC_<X>.md` · the scope document · the completion report.

## TIER 2 — WHEN APPLICABLE, JUDGED EXPLICITLY
`SYSTEM_MANUAL.md` (architecture, strategy logic, regime, filters, signal pipeline, math) · `SYSTEM_IMPACT_MAP.md` (any component added/removed/re-keyed, or cross-cutting state) · `CHANGES_AND_FIXES.md` · `POST_AUDIT_ROADMAP.md` · `RUNNING_ISSUES.md` · `STORAGE_POLICY.md` · `ADJUSTMENT_FRAMEWORK.md` · `AUTHORITY_BASELINE.md` · `ASSET_CLASS_ONBOARDING_WORKFLOW.md`.

## ⛔ THE ANTI-PATTERNS
- **"I'll update governance after the deploy."** No. Deferred governance becomes forgotten governance.
- **"We reorganised that doc recently so it must be current."** **Reorganising is not updating.** A TOC add, a history-archive move, a consolidation — none of them discharge the obligation to record THIS batch's change.
- **Skipping by default.** Use judgement on applicability — a display/data-quality service is SIM-scope, not System-Manual-scope — **but apply the judgement OUT LOUD and write it down.**

## 10.b — LANGSTON'S MEMORY
Sync `/home/langston/MEMORY.md` in the same turn you update your own: batch closure, sequencing changes, operational invariants. **His MEMORY auto-loads every invocation — stale memory means a wrong baseline at the next review.** Keep it ≤200 lines.

## ⛔⛔ IF A DOCUMENT STATES A NUMBER, CHECK IT AGAINST THE LIVE VALUE
**A governance document that asserts a constant, a threshold, a window size or a count is making a CLAIM ABOUT THE RUNNING SYSTEM — and it goes stale SILENTLY, because nothing compares the two.**
**MEASURED 2026-08-21:** `SYSTEM_MANUAL.md` ch.12 **and** `POST_AUDIT_ROADMAP.md` both state that the AMR's EV-gap window warms at **"30 obs/class."** The live value for crypto is **100**. Consequence: the AMR activation checklist item requiring *EV-gap window warm (30 obs/class)* is **UNSATISFIABLE AS WRITTEN** — and nobody noticed, because the document reads perfectly plausibly.
⇒ **When your batch touches a component, re-read every NUMBER the governance docs state about it and confirm each against the live value.** On divergence: **fix the doc, or fix the value, and say which** — never leave both standing. **A rule that a document and a database disagree about is not a rule.**

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

10. **Governance Updates** — Update ALL applicable Tier 1 + Tier 2 docs (see §3). If batch touched architecture/math → update SYSTEM_MANUAL.md. If batch touched components → update SYSTEM_IMPACT_MAP.md. Failing to update either when applicable = incomplete batch.

    **MANDATORY 10.b — Langston memory sync (Kyle directive 2026-05-07):** at the same time you update your own MEMORY.md, also update Langston's `/home/langston/MEMORY.md` on Hetzner with the batch closure block + sequencing changes + operational invariants. Langston's MEMORY auto-loads every `claude -p` invocation; stale MEMORY → wrong baseline at next review. Mirror your MEMORY structure (state block, recent-batch row, sequencing update, open-issue diff). Keep ≤200 lines. Sync via:

    ```bash
    cat > /tmp/langston_memory.md <<'EOF'
    [paste new MEMORY content]
    EOF
    scp /tmp/langston_memory.md root@204.168.141.77:/tmp/langston_memory.md
    ssh root@204.168.141.77 'sudo -u langston cp /tmp/langston_memory.md /home/langston/MEMORY.md && wc -l /home/langston/MEMORY.md'
    ```

    Update `/home/langston/CLAUDE.md` only when comms protocol or his persona changes (rare). **Repo-side docs reach Langston off the REVIEW BRANCH — so a doc he needs must be pushed, not merely saved** (`LANGSTON_ARCHITECTURE.md` §6).
