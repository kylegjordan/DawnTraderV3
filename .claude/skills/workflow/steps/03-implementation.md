# STEP 3 — IMPLEMENTATION

**Ends when:** the code is written, committed with explicit paths, and pushed.

## DO
- Edit **directly in your own clone**, on `migration/aws-supabase`. **No staged-changes folders. No zip packages.**
- **Surgical edits, explicitly documented. No speculative refactoring.**
- **NO PATCHES.** Every fix long-term, structural, scalable. When a problem surfaces, find the **root cause** and design the right architecture. No "good enough for now."
- **No hard-coded fallbacks for DB-governed settings.** If it should come from the DB, **fail hard when the DB is empty** — never silently default.
- **Never leave legacy lingering.** At the moment you surface it: delete it now through the full workflow, or **schedule a concrete dated deletion**. Record removals in `DELETED_COMPONENTS_LOG.md`.

## ⛔ COMMIT DISCIPLINE — THE MANDATED FORM
```
git add <explicit paths>
git diff --cached          # READ THE CONTENT, not just --name-only
git commit -F <msgfile> -- <the same explicit paths>
```
⚠️ **`--name-only` CANNOT CATCH THE REAL RISK.** On a shared branch three sessions write into the same governance docs, so **the path is always right — which is exactly why the explicit-path habit cannot catch this.** A staged file you do not remember staging is a **SIGNAL**: read WHOSE content it is before committing.
⚠️ **`git diff HEAD` DOES NOT SHOW UNTRACKED FILES** and says nothing about the omission. **Cross-check `git status --porcelain` for `??` before calling any diff "the change set."**
⚠️ **Never carry a multi-hour uncommitted diff** — it breaks Langston's ability to verify at a ref. **Quote `path:line` from the ref, never from your worktree.**
