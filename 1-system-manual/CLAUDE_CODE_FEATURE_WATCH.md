# Claude Code Feature Watch — ledger

> **Purpose:** the daily `daily-claude-model-check` scheduled task (CLAUDE.md rule 21) scans Anthropic's official Claude Code changelog/news for NEW features + functionality, assesses whether they'd help DawnTrader's workflow, and surfaces useful ones to Kyle. **This file is the dedup ledger** — features already surfaced (or already adopted) are listed here so the daily check doesn't repeat them. The task appends a row when it surfaces something new.
>
> **How the task uses this:** read this file → compare the official changelog against it → message Kyle ONLY about genuinely-new, relevant features not already below → append what it surfaced.

## Already adopted / known (baseline as of 2026-06-16 — do NOT re-surface)

| Feature | Status for us | Notes |
|---|---|---|
| `bypassPermissions` mode | ADOPTED | Enabled via the app's Claude Code Settings → "Allow bypass permissions mode" (2026-06-16). Kills routine permission prompts. CLAUDE.md rule 16. |
| Remote Control (drive a local session from claude.ai/code or the Claude mobile app) | ADOPTED 2026-06-16 | "Enable remote control by default" ON. Lets Kyle view + send prompts + approve permission prompts from his phone. Local machine must stay awake. |
| Phone push notifications when blocked | ADOPTED 2026-06-16 | `PushNotification` tool reaches Kyle's phone when Remote Control connected + Kyle idle ≥60s. CC fires it when blocked awaiting Kyle. |
| Scheduled tasks / routines | IN USE | This very task; daily model check. |
| Background Monitors / tasks | IN USE | The CC wake watcher + study runners. |
| Sub-agents (Explore / claude-code-guide / general-purpose) | IN USE | Used for codebase surveys + Claude Code doc lookups. |
| MCP servers (Telegram bridge pattern, Chrome, etc.) | IN USE | |
| Hooks | KNOWN, not used | Evaluated; the bypassPermissions structural fix was preferred over per-event hooks. |
| Workflows (multi-agent orchestration) | KNOWN | Opt-in only; high token cost. Not standing-on. |

## WATCHING FOR — not yet shipped; surface to Kyle the moment it lands (Kyle directive 2026-06-17)

> The daily check should monitor these OPEN Anthropic feature requests / known gaps and tell Kyle as soon as any ships, since each removes a real friction we hit. Confirm via the official changelog/docs (+ the GitHub issue status) before surfacing.

- **Persistent / auto-enabled Remote Control on the DESKTOP APP.** Today the desktop app does NOT honor the `remoteControlAtStartup` auto-arm setting (the CLI does), and remote control dies on every reboot/update — so after a forced restart Kyle must manually re-arm `/remote-control` (a resumed session never auto-arms). Watch GitHub issues **#48949** (desktop ignores remoteControlAtStartup — OPEN, no maintainer reply), **#60790** (RC disconnects on resume after PC restart), **#30447 / #29116** (headless / daemon mode requests), **#60699** (in-session toggle). The win: Kyle wants remote control reachable from his phone at ALL times after a reboot with zero manual steps — none of the current community workarounds achieve this safely on Windows (token-only is binary-rejected; the one Windows Task-Scheduler project is unverified + still needs an interactive login). Surface + recommend adoption the day Anthropic ships desktop-app persistent/auto RC or a real headless mode. (Researched 2026-06-17 via official docs + community forum scan.)

## Surfaced to Kyle (task appends here — newest first)

- 2026-06-19 | Model deprecation/auto-update warning in print mode (-p) + agent frontmatter (CC 2.1.183) | Langston runs `claude -p --model claude-opus-4-8[1m]`; CC now emits a stderr warning the moment that model is deprecated or silently auto-updated to a different one — passive early-warning that directly reinforces rule-21 model discipline (the exact Fable-5-retired-under-us scenario) without waiting for the daily live test | (Kyle decision: pending)
- 2026-06-19 | Model allowlist enforcement: `enforceAvailableModels` + `availableModels` managed settings (CC 2.1.175/2.1.176) | Lets us pin Langston + the CC sessions to an approved model list and block silent redirects (incl. via `ANTHROPIC_DEFAULT_*_MODEL` env vars) — actively LOCKS us on Opus 4.8 rather than only monitoring daily; hardens against a silent swap off our chosen model | (Kyle decision: pending)
- 2026-06-17 | Nested sub-agents (a sub-agent can spawn its own sub-agents, up to 5 levels deep — CC 2.1.172) | A single pre-audit/codebase-survey dispatch can branch out and cover far more of the system autonomously, instead of CC sending helpers one at a time — faster, deeper SIM blast-radius traces with less hand-holding | (Kyle decision: pending)
- 2026-06-17 | Parameter-level permission rules `Tool(param:value)` (CC 2.1.178) | Permission allow/deny can now match the exact arguments of a command, not just its name — lets us block a specific destructive variant (e.g. a force-push) while the safe variant still auto-runs; tightens the §5/rule-16 safety posture we currently hand-roll at command-name granularity | (Kyle decision: pending)
