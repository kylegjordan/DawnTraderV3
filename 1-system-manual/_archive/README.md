# System Manual Archive

This folder contains governance documents that have been **retired** from active maintenance but preserved for historical reference.

> **If you are looking for current governance**, don't read anything in this folder. Use the live docs instead:
> - **`CLAUDE.md`** (repo root) — identity, workflow, rules
> - **`.claude/memory/MEMORY.md`** — current state
> - **`1-system-manual/BATCH_CATALOG.md`** — batch history
> - **`1-system-manual/PHASE_HISTORY.md`** — phase status
> - **`1-system-manual/SYSTEM_MANUAL.md`** — architecture reference
> - **`1-system-manual/SYSTEM_IMPACT_MAP.md`** — component dependency map
> - **`1-system-manual/CHANGES_AND_FIXES.md`** — bug/fix registry
> - **`1-system-manual/POST_AUDIT_ROADMAP.md`** — phase-level roadmap

## Archived documents

| File | Active from | Retired | Reason | Superseded by |
|---|---|---|---|---|
| `CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` (CCPI) | Phase 12 governance implementation | 2026-04-20 | Auto-loaded `CLAUDE.md` at repo root (introduced 2026-04-14) absorbed CCPI's role as the "read at session start" document. CCPI was kept as backup Tier 1 for ~4 batches but was never updated across B61, B62, or the post-B62 plan work. By 2026-04-20 it was stale across multiple live-state dimensions. Formal retirement eliminates the duplicate-governance sync problem. | `CLAUDE.md` + `MEMORY.md` + `BATCH_CATALOG.md` + `PHASE_HISTORY.md` + `SYSTEM_MANUAL.md` + `SYSTEM_IMPACT_MAP.md` + `CHANGES_AND_FIXES.md` |

## Rules for this folder

1. **Do not edit archived files.** They are preserved as-is at the point of retirement.
2. **Do not cite archived files as governance authority** in new batch work.
3. **Do not add new files here** unless you are formally retiring a previously-live governance doc. Document the retirement in the table above.
4. **Historical queries only** — this folder answers "what did governance look like during Phase X?" not "what is governance now?"

---

*This folder is scoped for occasional archaeological reference, not ongoing operations.*
