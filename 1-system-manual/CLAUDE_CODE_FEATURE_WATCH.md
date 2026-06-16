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

## Surfaced to Kyle (task appends here — newest first)

*(none yet — task adds `- YYYY-MM-DD | <feature> | <one-line why it helps DawnTrader> | <Kyle's decision once known>` rows here)*
