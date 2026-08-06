# Governance tier list — updated inventory (design input for the B-RULES-1d governance skill; Kyle-directed 2026-08-07)

> **Provenance:** Kyle directed a full sweep of the repo's governance docs against `CLAUDE.md` §3's tier lists ("make sure all of the ones that need to be included, are included"), then amended the result twice in-session. This file is the durable record; the §3 amendment ships inside the governance-skills batch after Langston's review. Swept: all 40+ `1-system-manual/*.md`, repo root, `_archive/`, at `d0e4a65f1`-era head.

## TIER 1 — every batch (unchanged + one addition)
BATCH_CATALOG · PHASE_HISTORY · shared + per-session MEMORY · scope file · completion report
**➕ the Delivery Board card move** — the protocol's §4 folds card updates into the workflow; §3's checklist never absorbed it. A batch close verifies its card like it verifies the catalog row.

## TIER T — TEMPORARY / PHASE-SCOPED (NEW, Kyle 2026-08-07)
Tier-1-mandatory WHILE their arc is live; retire to read-only at arc close. **Each entry names its own exit event** — the self-removing notes scattered through §3 become one shelf.
- `PHASE_19_PLAN.md` — exit: Phase-19 close (also delete the §3 temp line + Langston's §14 twin).
- The xStock calibration WORKING LIST (in `MULTI_ASSET_VTS_EXPANSION_PLAN.md`) — exit: calibration completes.
- Future phase plans (25, 21, …) are born into this tier.

## TIER 2 — when applicable (current list + SEVEN additions)
Current: SYSTEM_MANUAL · SYSTEM_IMPACT_MAP · CHANGES_AND_FIXES · POST_AUDIT_ROADMAP · ADJUSTMENT_FRAMEWORK · AUTHORITY_BASELINE · RUNNING_ISSUES · MULTI_ASSET_VTS_EXPANSION_PLAN · ASSET_CLASS_ONBOARDING_WORKFLOW · STORAGE_POLICY · CLAUDE.md · CLAUDE_MD_RULE_HISTORY · BUILD_METHOD_PLAYBOOK (present since 2026-07-24 — Kyle's example was already listed; the drift was elsewhere) · LANGSTON_ARCHITECTURE · Langston MEMORY sync
**Additions (each with its trigger):**
- **➕ GOVERNANCE_EXCEPTIONS** — any na-skip; the checker grades from it yet it was absent from the list it enforces.
- **➕ DELETED_COMPONENTS_LOG** — every rule-18 removal.
- **➕ ALERT_HANDLING_PROTOCOL** — alert-process changes.
- **➕ DELIVERY_BOARD_PROTOCOL** — board-process changes.
- **➕ CLAUDE_CODE_FEATURE_WATCH** — rule-21 ledger + the per-run committed RUN LOG (B-RULES-1b C1).
- **➕ the governance checker's `config.mjs`** — it defines what the tiers MEAN mechanically; a tier change that skips it changes nothing.
- **➕ THE SKILLS FILES THEMSELVES (Kyle 2026-08-07)** — every skill (workflow, scope, pre-audit, implementation, deployment, verification, governance, error-investigation, alert-processing, provenance-read, Langston-dispatch, corrections-ledger) enters Tier 2 with trigger: *the process or rule it encodes changed*. **The governance skill's checklist includes verifying that a batch which changed a process also updated the skill that teaches it** — the SIM discipline applied to the skills layer.
**Joining when it lands: `ACTIVE_PATH_FLOW.md`** (CC-C's standing assignment, in construction; trigger = any change to the active trading path it maps).

## TIER 3 — RUNBOOKS & REFERENCE (NEW as a formal tier; read-when-needed, update-when-subject-changes, never per-batch)
REPO_TOPOLOGY_AND_SYNC · COMMS_BRIDGE · PERMISSION_PROMPT · TRANSCRIPT_TRIM · **➕ WAKE_WATCHER (created 2026-08-06; missing from §4's runbook list)** · CURRENT_SETTINGS_REGISTRY (auto-generated — listed so nobody hand-edits it) · frozen audits (RTB refresh, active-pipeline, AMR characterization) + `bridge/canonical/` — read-only history, never updated.

## HOUSEKEEPING (separate decision, not this batch)
~40 pre-governance relics at repo root (PHASE_27.*, Replit-era guides) → archive candidates. Three in-construction docs (`ACTIVE_PATH_FLOW` — CC-C's, `LEVER_INVENTORY`, `LEGACY_DEPRECATION_PLAN`) each need an owner-and-status line: visibly living or visibly parked.
