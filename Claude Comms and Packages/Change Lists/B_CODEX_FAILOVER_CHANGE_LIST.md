# B-CODEX-FAILOVER (#1192, sprint row 1y) — CHANGE LIST (Step 4, r1)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` — crew tooling; one code change to the actor table (no trading path) |
| **(ii) DOC SET** | SCOPE — **absent** · PRE_AUDIT — **absent** · COMPLETION_REPORT, BATCH_CATALOG, PHASE_HISTORY — absent, Step 10-11 · SYSTEM_IMPACT_MAP — **owed at Step 10** (actor table gains `codex` tag + 5 actors; a new Helsinki component, crew-switch) · SYSTEM_MANUAL — N/A (no trading logic) · RUNNING_ISSUES — present (`#1192`) · SPRINT_TO_LIVE_PLAN row 1y — present · DELETED_COMPONENTS_LOG — N/A |
| **(iii) STEP-2 REFERENCE** | **NO STEP 2 — Kyle-directed fast path (2026-10-13, at 87% of his weekly Claude allowance): the crew must be switchable before it runs out. Scope and pre-audit are written retroactively at Step 10 from this change list and your rulings.** |

## Kyle's decisions this batch implements (2026-10-13, Desktop)
1. **No shift limits.** Codex sessions run the whole workflow and deploy; you review the shift's changes when Claude returns. (Supersedes the §4 no-land list you corrected at `f8362f069`.)
2. **A handover on every switch, both directions.** 3. **One trigger, with a guarantee each session gets it.** 4. **Discord names in both word orders.** 5. **No scheduled Codex check-ins** — he opens the Codex sessions he needs, and may not open all of them.

## C1 — `bac793f92`: the Codex crew + Coltrane become canonical actors
`server/services/system-alerts.ts`: `AlertActorTag` gains `'codex'`; `ALERT_ACTORS` gains `codex-a|codex-b|codex-c|codex-infra` (tag `codex`) and `coltrane` (tag `human`). Aliases, both word orders: `old codex|codex old|old-codex|codex-old → codex-a` (same for new/analyst/infra; `codex-infra`'s own alias dropped — it IS canonical). `scripts/dt-deploy.sh`: table, `USAGE`, `DEPLOY_ACTOR_LIST` (the derived non-machine set is now 11). Tests: the parity expected set; the tag list; both orders resolve. Local 39/39 in the three actor suites; tsc baseline 337 = 337. CI `38367705222` at `bac793f92`: success.
⚠️ `dt-deploy.sh` does not install itself (`#1004`): after the deploy, install `/usr/local/bin/dt-deploy` by hand and match its sha256 to the blob.

## C2 — `33fed96c4`: `comms-infra/crew-switch/` + `AGENTS.md`
**`crew-switch.py`** — `watch` follows the inbox log; a message **from Kyle's `author_id`, source `discord-cc-bridge`, kind `''` or `voice_inbound`**, matching `^\W*switch\s+(the crew\s+)?(over\s+)?to\s+(codex|claude)\W*$` starts a switch (first run seeks to EOF — no replay). `start` writes `/etc/dawntrader/crew-mode.env` and posts (sender `Crew switch`) a HANDOVER ORDER naming every outgoing session + an ON-DUTY notice naming the incoming crew and reviewer. `ack <id> <name>` (either order); COMPLETE = every **outgoing** session confirmed → Kyle notified; incoming tracked, never nagged. `nag` (5-min timer): first re-send at 15 min, then hourly, naming only the missing outgoing sessions + a `--notify` to Kyle. State `/var/lib/crew-switch/state.json` under `flock`. **Not yet installed.**
**The guarantee, stated honestly:** confirmation + escalation, not assumed delivery — a closed Claude window and every Codex session can be reached only by Kyle; the checklist tells him exactly who.
`test_crew_switch.py`: **30 passed, 0 failed** on Helsinki (0700 temp dir, fake `cc-send`, removed after): trigger matches/non-matches, aliases, both directions, refusals, nag timing and naming, completion notify.
**`AGENTS.md`:** §4 limits removed (deploy under your own actor once C1 is live; until then Kyle deploys); step 0 = `crew-switch status` + ack; alerts routed to the Claude counterpart are the Codex session's, acted on under its own actor; names both orders; §5 = the switch.

## JUDGEMENT CALLS TO ATTACK
1. **The trigger matches Kyle's `author_id` only, and the exact phrase only** — a sentence containing "switch to codex" does not fire. Too strict for voice transcription?
2. **COMPLETE counts outgoing only.** Incoming never blocks or nags. Right, given Kyle may open only some Codex sessions?
3. **`coltrane` tagged `human`** (like `langston`), so he can deploy. Should the reviewer be in the deploy set at all?
4. **The Command Center session is not in the crew lists** (its own rules say hands off DawnTrader).
