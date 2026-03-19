> **CRITICAL — REPLIT AUTONOMY CONSTRAINTS**
>
> You are receiving a batch of changes prepared by Claude Code (the System Cartographer).
> Your role is to **apply these changes exactly as specified**, validate them, and push.
>
> **DO NOT:**
> - Make any changes beyond what is specified in this document
> - Reformat, restructure, or "improve" any files
> - Add your own commits between batch application and validation
> - Modify any files not listed in this document
> - Run any automated tools that modify source code (linters, formatters, etc.)
>
> **DO:**
> - Apply changes exactly as written
> - Run validation after ALL changes are applied
> - Report results back to Kyle
> - Commit with the message provided at the bottom of this document

---

# Batch 19G Governance — INSTRUCTIONS

## Batch Type
Governance documentation update (no code changes).

## Files to Place (3 files)

### 1. CLAUDE_CODE_PROJECT_INSTRUCTIONS.md
- **Source**: `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` (in this zip)
- **Destination**: `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` (replace entire file)
- **Changes**: Phase 14.5 marked COMPLETE with all batches listed (19 core through 19G HF1). Last commit updated to `15e90f09`. Rules 23-26 added (post-implementation audit, batch reports ownership, DB queries via Replit Agent, replit-cmd screenshot limitation). Workflow updated with post-implementation audit step and scope checklist requirement. Batch 19G + HF1 investigation notes added.

### 2. DIRECTIVE_INDEX.md
- **Source**: `1-system-manual/directives/DIRECTIVE_INDEX.md` (in this zip)
- **Destination**: `1-system-manual/directives/DIRECTIVE_INDEX.md` (replace entire file)
- **Changes**: Added Batch 19E GOV, Batch 19G, and Batch 19G HF1 rows. Summary statistics updated.

### 3. SYSTEM_IMPACT_MAP.md
- **Source**: `1-system-manual/SYSTEM_IMPACT_MAP.md` (in this zip)
- **Destination**: `1-system-manual/SYSTEM_IMPACT_MAP.md` (replace entire file)
- **Changes**: Updated screener_filters table (new columns, 8 rows, 4-path architecture). FX5 scanner updated (DB-driven filters, OHLC pre-fetch for pattern pairs). Added hybrid-compatibility-registry.ts entry (section 1.7). VTS runner updated (hybrid buffer, pattern path parity, dedup=1). filters-with-override.tsx updated (4-column DB-driven table, legacy inputs removed). pattern-global-filters.ts noted as DELETED. system-guards.ts filter constants noted as DEPRECATED. Quick lookup table expanded with screener_filters and hybrid registry entries.

---

## Commit Message

```bash
bash REPLIT_PUSH_SCRIPT.sh "Batch 19G governance: CCPI Rules 23-26, post-implementation audit workflow, DB-driven filter docs"
```
