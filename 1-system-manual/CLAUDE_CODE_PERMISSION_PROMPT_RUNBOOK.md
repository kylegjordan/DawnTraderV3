# RUNBOOK — Claude Code permission-prompt regression (extracted from CLAUDE.md rule 16, 2026-07-22)

> **Why this file exists:** this content was ~8,000 bytes inside `CLAUDE.md` §5 — **a quarter of the entire Critical Rules section, and ~7% of the whole always-loaded file.** It is TROUBLESHOOTING REFERENCE, not a governance invariant: you read it when prompts start appearing, which is rare, but every session and **every one of Langston's invocations** paid for it on every load.
> **Nothing was deleted.** The full text is preserved verbatim below. `CLAUDE.md` rule 16 now carries the operative one-liner plus a pointer here.
> **Extraction principle (Kyle directive 2026-07-22, the slim pass):** an always-loaded file should carry *what you must not get wrong*, not *how to fix a thing that rarely breaks*. Diagnostic depth belongs in a runbook the reader opens on purpose.

---

16. **Claude Code permission-prompt regression workaround (Kyle directive 2026-05-20).** If Claude Code v2.1.7+ starts prompting for previously-allowed operations (especially compound `&&`, output redirection, brace/quote expansions), edit `.claude/settings.local.json`:

    ```json
    {
      "defaultMode": "bypassPermissions",
      "permissions": {
        "defaultMode": "bypassPermissions",
        "allow": [
          "Bash(*)", "Bash(git:*)", "Bash(ssh:*)", "Bash(cd:*)",
          "Bash(cat:*)", "Bash(printf:*)", "Bash(grep:*)",
          "Bash(curl:*)", "Bash(python:*)", "Bash(python3:*)",
          "Bash(npm:*)", "Bash(node:*)", ...
        ],
        "deny": [
          "Bash(git push --force:*)", "Bash(git reset --hard:*)",
          "Bash(rm -rf /:*)", "Bash(rm -rf ~:*)", "Bash(sudo:*)"
        ]
      }
    }
    ```

    **Load-bearing details:**
    - The **TOP-LEVEL `"defaultMode": "bypassPermissions"` at line 2** (outside the `permissions` block) is THE LINE THAT WORKS. If deleted or moved inside `permissions` only, prompts return. Must be at ROOT level between opening `{` and `"permissions":`.
    - Also set `"defaultMode": "bypassPermissions"` INSIDE the `permissions` block (belt-and-suspenders — different CLI versions read from different locations).
    - Use canonical colon-prefix syntax `Bash(cmd:*)`, NOT space-form `Bash(cmd *)`.
    - Explicitly include `Bash(cd:*)` — without it, every `cd ... && ...` compound triggers the hardcoded check.
    - Deny list still applies on top of `bypassPermissions` (force-push, reset-hard, sudo, rm-rf still blocked).
    - Catastrophic patterns (`rm -rf /`, `rm -rf ~`) ALWAYS prompt regardless — hardcoded.

    **★ SESSION-MODE + PROTECTED PATHS (diagnosed 2026-06-16) — the file isn't the whole story:**
    1. **A running session's live mode can differ from the file's `defaultMode`.** The file sets the mode a session *starts* in; the live mode (bottom bar, e.g. "Accept edits") is per-session, and in `acceptEdits` Bash + sensitive writes still prompt. **PRIMARY FIX: turn ON "Bypass Permissions" in the Claude app's Settings** (the app-level toggle; the yellow in-app banner points to it). `bypassPermissions` is NOT reachable via `Shift+Tab` mid-session — a drifted session must be relaunched (or launched with `--permission-mode bypassPermissions`), not keyboard-cycled. (Some older builds didn't reliably honor the file `defaultMode` or allow bypass writes to `.claude/`; updating the app helps but the Settings toggle is the fix — don't block on a version bump.)
    2. **Protected paths still prompt in non-bypass modes:** the **top-level `~/.claude/`** plus `.git/`, `.vscode/`, `.idea/`, shell rc files. The **`~/.claude/projects/<project>/memory/`** subtree is NOT trapped (MEMORY.md is edited there every batch without prompts). **Scratch/continuity files are legitimate — DO NOT delete another session's scratch files;** the only fix is *location*: write them under `~/.claude/projects/<project>/memory/` or a gitignored repo scratch dir, NEVER the top-level `~/.claude/` (that placement was the exact 2026-06-16 trigger). Throwaway temp → `/tmp`.

    **★★ THE "REVERTS TO MANUAL" PROBLEM IS A KNOWN UPSTREAM REGRESSION, SCOPED TO ROUTINES/SCHEDULED TASKS — NOT to interactive sessions (diagnosed 2026-07-22; Kyle's pushback was correct and an earlier CC root-cause here was WRONG).** Kyle's interactive sessions (OLD/NEW/ANALYST Claude) hold `bypassPermissions` indefinitely; only the scheduled routines fall back to Manual. Three OPEN upstream issues, all still reproducing on **2.1.215 (our version)**:
    - **[#77817](https://github.com/anthropics/claude-code/issues/77817)** (bug/regression/area:routines) — **v2.1.206 stopped scheduled-task runs inheriting `permissions.defaultMode`.** Each routine now carries its OWN permission mode, and every pre-existing routine was silently downgraded to Manual with no migration and no changelog warning. Session transcripts confirm: runs launched by ≤2.1.205 have `"permissionMode":"bypassPermissions"`, runs from ≥2.1.206 have `"default"`, with zero settings changes. **Consequence: NO settings file — project or user-level — can fix a routine. The inheritance path itself is what broke.**
    - **[#76469](https://github.com/anthropics/claude-code/issues/76469)** (bug/has repro/area:routines) — **routines created via NATURAL LANGUAGE (i.e. by asking a session, which is how ours were made via `mcp__scheduled-tasks__create_scheduled_task`) cannot have their permission mode changed:** set "Bypass permissions" in the Edit form, click Save, and it silently reverts. **Routines created through the app's Routines → New routine FORM save the mode correctly.** ★ **This is the actual workaround: recreate a routine through the form, don't ask a session to create it.**
    - **[#76141](https://github.com/anthropics/claude-code/issues/76141)** (bug/area:permissions/area:routines) — "Always allow" clicked during a scheduled run persists to no settings file, so the same prompt returns next run.
    Do NOT re-diagnose this as a settings problem, and do not tell Kyle a settings change will fix a routine — it will not until upstream ships a fix. Re-check these three issues for a fix version before spending time on it again.

    **Still-true mechanics (verified in the shipped CLI, useful background) — bypass is a LAUNCH-TIME property, not a toggle.** `s67({permissionMode, allowDangerouslySkipPermissions, ...})` computes **`isBypassPermissionsModeAvailable = (resolvedLaunchMode === "bypassPermissions" || --dangerously-skip-permissions) && !<statsig gate> && !<permissions.disableBypassPermissionsMode>`**. Consequences:
    - **If a session did NOT launch in bypass, it can NEVER be switched into bypass.** The app's Mode menu still LISTS "Bypass permissions", but selecting it is rejected (`"Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions"`) and the UI snaps back to Manual. **That is the exact "it keeps reverting" symptom** — for a mid-session pick it is not a bug and no setting fixes it. Same for a scheduled task/routine session that launched without it.
    - **For INTERACTIVE sessions the fix is at LAUNCH (this does NOT help routines — see #77817 above):** `permissions.defaultMode: "bypassPermissions"` in **USER-level `~/.claude/settings.json`** (added 2026-07-22; backup `~/.claude/settings.json.bak-pre-bypass-20260722`). This is the durable home — outside the repo, so no branch switch / worktree / app update can strip it, and it applies to sessions launched anywhere (worktrees under `.claude/worktrees/` are SEPARATE project roots and never read the main project's `settings.local.json` — a real prior gap). Project `.claude/settings.local.json` keeps its copy; the user-level file is the belt.
    - **The app Settings toggle persists nothing findable** — the desktop app's own config (`%APPDATA%/Claude/config.json`, Preferences, Local Storage) holds NO permission-mode key. Do not rely on it.
    - **A live session keeps the mode it launched with.** Compaction does not change it and does not adopt a newly-changed setting — the mode is in-session state. Relaunch is the only reliable adoption path.
    - **Remote Control sessions can never be bypass:** with `CLAUDE_CODE_REMOTE` set the CLI explicitly ignores a settings `defaultMode` of `bypassPermissions` (`"not supported in CLAUDE_CODE_REMOTE — only acceptEdits and plan are allowed"`). Driving a session from phone/web WILL prompt. Not fixable by config.
    - **Verified NOT the cause:** the remote org kill-switch `tengu_disable_bypass_permissions_mode` is `false` for this account, and `permissions.disableBypassPermissionsMode` is unset. Check both before re-diagnosing.

    Working file at `.claude/settings.local.json` (commit `39b033738`). If a future update breaks this, go straight to the structural `bypassPermissions` fix, not individual rules. See history doc §5.16.

