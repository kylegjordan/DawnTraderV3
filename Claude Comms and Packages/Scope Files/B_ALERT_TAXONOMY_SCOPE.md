# B-ALERT-TAXONOMY — Scope (Step-1)

change-class: non_architecture
**Owner:** CC-A · **Reviewer:** Langston · **Date:** 2026-07-10
**Trigger:** Kyle directive 2026-07-10 — *"when it is the governance checker that is sending messages, it doesn't just say system alert… a system alert should be specifically for errors that are happening related to the system. A governance issue… should be labelled something else, and then the alarms that we set so that we don't forget to do something, that should be something else."*

> Presentation + classification of §10.5 alerts. No engine/strategy/regime/signal-pipeline/schema change. Alerts live in a JSONL file, not a live table.

## Problem
Every §10.5 alert renders with one hard-coded header — `scripts/system-alerts.ts:84`: `🚨 **SYSTEM ALERT — <SEVERITY>**` — regardless of what it actually is. So a governance-checker doc-gap, a scheduled "go look at the results" reminder, and a real feed breakage all shout **SYSTEM ALERT**. Kyle can't distinguish a genuine system error from governance bookkeeping or a calendar alarm.

## ★ Second defect found while scoping (arguably the more important one)
**`info`-severity alerts NEVER reach Discord.** `scripts/system-alerts.ts` gates the webhook post to `warning` + `critical` only (line ~136: *"info skips"*). But **scheduled reminders are typically `info`** — e.g. the Aug-1 Wave-D forward-coverage verification I scheduled is `category=verification, severity=info`, so it would fire into the queue and **never post to Discord**. The alarms we set precisely so we don't forget are the class least likely to reach Kyle. Fixing the labels without fixing this would be cosmetic.

## Proposed taxonomy (3 classes; Kyle delegated the naming)
| Class | Display | Categories mapped | Discord posting rule |
|---|---|---|---|
| **system** | 🚨 **SYSTEM ALERT — <SEV>** | `breakage`, `health_check` | warning + critical (unchanged) |
| **governance** | 📋 **GOVERNANCE CHECK — <SEV>** | `governance` | warning + critical (unchanged) |
| **reminder** | ⏰ **SCHEDULED REMINDER** | `one_off`, `recurring`, `soak_verification`, `verification` | **POSTS AT ANY SEVERITY** (incl. `info`) — a reminder coming due IS the signal |

Alternates if Kyle prefers: *GOVERNANCE ISSUE* / *FOLLOW-UP DUE* / *TIMER DUE*.

## Objectives
- **OBJ-1 — Class the alert.** In `server/services/system-alerts.ts`: add an exported `alertClassOf(category)` → `'system' | 'governance' | 'reminder'` plus display metadata (emoji + label). **Also fix a real type/runtime mismatch: `'verification'` is written at runtime by the CLI (`npm run system-alerts -- add --category verification`) but is NOT in the `AlertCategory` union** — it fails `tsc` for any typed caller (hit this building the freshness monitor). Add it.
- **OBJ-2 — Render by class.** `scripts/system-alerts.ts` `formatAlertTextDiscord()` uses the class label/emoji instead of the hard-coded `SYSTEM ALERT`.
- **OBJ-3 — Fix the severity gate for reminders.** The `reminder` class posts regardless of severity; `system` + `governance` keep the warning/critical gate. (Otherwise scheduled alarms are invisible — the defect above.)
- **OBJ-4 — Make Langston's routed-alert prompt class-aware.** `comms-infra/discord/discord-langston-bridge.py:357` currently hard-codes *"[Discord SYSTEM ALERT — routed to you from the §10.5 alert dispatcher…]"*. Governance doc-gaps and calendar reminders should not be framed to him as system errors — his triage posture differs per class.
- **OBJ-5 — Verify the Telegram-era handler is dead.** `infra/helsinki/langston-alert-handler.sh:66` also hard-codes `SYSTEM ALERT` and references Telegram; MEMORY says it was archived + removed at B-TELEGRAM-DECOMM-2. Confirm it's not live; if it is, retire it per rule 18 (don't leave legacy lingering).

## Verification (Step-7)
- Fire one alert of each class on staging; confirm Discord shows the right header (🚨 / 📋 / ⏰) and that an **`info`-severity reminder actually posts** (it does not today).
- Confirm existing `breakage`/`health_check` behavior is unchanged (still warning+critical only).
- `tsc` clean (incl. the `'verification'` union fix); CI 4-green; deploy; governance (SIM comms/alerts entry, CHANGES, RUNNING_ISSUES for the info-gate defect, BATCH_CATALOG/PHASE_HISTORY, completion).

## Open questions for Langston (Step-1)
1. Class names — `SYSTEM ALERT` / `GOVERNANCE CHECK` / `SCHEDULED REMINDER`. Agree, or prefer *GOVERNANCE ISSUE* / *FOLLOW-UP DUE*?
2. Category→class mapping: is `health_check` rightly **system** (archival watchdog, feed stalls = real degradation), even though a clean weekly freshness report also uses it? Or should a 4th **📊 REPORT** class exist for recurring informational summaries (the #441 weekly report is `health_check`+`info` — under the proposal it'd be a system-class alert that never posts)?
3. The reminder-posts-at-any-severity change — agree that's the right fix rather than forcing every reminder to `warning` (which would pollute severity semantics)?
4. `non_architecture` right? (presentation + classification; no pipeline/schema change)
