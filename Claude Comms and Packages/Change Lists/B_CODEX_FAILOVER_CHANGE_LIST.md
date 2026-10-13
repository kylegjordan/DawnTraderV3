# B-CODEX-FAILOVER (#1192, sprint row 1y) — CHANGE LIST (Step 4, r3)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` — crew tooling; one code change to the actor table (no trading path) |
| **(ii) DOC SET** | SCOPE — **absent** · PRE_AUDIT — **absent** · COMPLETION_REPORT, BATCH_CATALOG, PHASE_HISTORY — absent, Step 10-11 · SYSTEM_IMPACT_MAP — **owed at Step 10** (actor table gains the `codex` tag + 5 actors; a new Helsinki component, crew-switch, which also starts/stops Langston's bridge) · SYSTEM_MANUAL — N/A (no trading logic) · RUNNING_ISSUES — present (`#1192`) · SPRINT_TO_LIVE_PLAN row 1y — present · DELETED_COMPONENTS_LOG — N/A · board card — **owed** (none exists; Langston measured) |
| **(iii) STEP-2 REFERENCE** | **NO STEP 2 — Kyle-directed fast path (2026-10-13, at 87% of his weekly Claude allowance). Accepted by Langston for this batch on one condition: the retroactive scope and pre-audit written at Step 10 are LABELLED as not having gated the work and are never cited as though they did (`#1005`).** |

## Kyle's decisions (2026-10-13, Desktop)
1. **No shift limits** — Codex runs the whole workflow and deploys under its own names; Langston reviews everything a shift changed when Claude returns.
2. **A handover on every switch, both directions.** 3. **One trigger, with a guarantee every session gets it** (confirmation + escalation). 4. **Names in both word orders.** 5. **No scheduled Codex check-ins** — he opens the Codex sessions he needs.
6. **Langston must really shut down on a switch to Codex** — telling him did not work before.
7. **Manual on/off for Langston and for any single session**; Coltrane is never switched off (reviewer on a Codex shift, called-by-name second reviewer on a Claude shift).

## C1 — `bac793f92`: the Codex crew + Coltrane become canonical actors (approved r1)
`server/services/system-alerts.ts`: `AlertActorTag` gains `'codex'`; `ALERT_ACTORS` gains `codex-a|codex-b|codex-c|codex-infra` (tag `codex`) and `coltrane` (tag `human`). Aliases in both orders (`old codex|codex old|old-codex|codex-old → codex-a`, …; `codex-infra`'s self-alias dropped). `scripts/dt-deploy.sh`: table, `USAGE`, `DEPLOY_ACTOR_LIST` — the derived non-machine set is **11 canonical + 22 aliases = 33** (Langston enumerated). Tests: parity expected set, tag list, both orders. ⚠️ `dt-deploy.sh` does not install itself (`#1004`): install by hand after the deploy and match sha256 to the blob.

## C2 — `comms-infra/crew-switch/` (r3 replaces r1/r2 wholesale)
**`crew-switch.py`** — state in ONE file, `/var/lib/crew-switch/state.json` (mode, per-session `duty`, open `orders`, `history`); no `crew-mode.env` (condition (d)).
- **`watch`**: follows `/var/log/cc-discord-inbox.jsonl`; only Kyle's own messages (`author_id`, `discord-cc-bridge`, kind `''|voice_inbound`). `classify()`: `SWITCH TO CODEX|CLAUDE` · `LANGSTON ON|OFF` · `<session> ON|OFF` (either order) · `COLTRANE …` → "never switched off" reply · a **short** (≤60 chars) near-miss → "did NOT act" reply, no phone ping. The offset is advanced **before** dispatch, and every dispatch runs through `safe()` (B1). `getsize` guarded.
- **`start <crew>`**: if the crew is **already** on the target, it **reports status and who is still missing, keeps the order open and the nag armed**, and reconciles Langston (BLOCKER-1, finding 1). Otherwise it supersedes open orders (B2), opens a crew order, sets duty, and switches Langston (`stop`+`disable` / `enable`+`start`). **Posts in order of importance:** handover order first, on-duty notice, Langston state, superseded notes (finding 3); `post_all` tries every post and raises only at the end.
- **`set_langston`**: reads back **both** `is-active` and `is-enabled`; good only if both match the target **and** no verb failed; errors are never discarded (BLOCKER-2).
- **`langston <on|off>`**: Langston alone; read back; Kyle pinged on any mismatch.
- **`session <name> <on|off>`**: ON hands the counterpart OFF (OLD Claude and OLD Codex share one folder) — a one-session order chased like a crew order; if the counterpart is not on duty there is nothing to hand over. OFF sends the session a stand-down order.
- **`ack`**, **`status`** (mode, on-duty list, Langston `active/enabled`, open orders), **`nag`** (15 min, then hourly; EXPIRED after 24 h with one Kyle ping).
- Units: `crew-switch-watch.service`, `crew-switch-nag.{service,timer}`. **Not yet installed.**

**`test_crew_switch.py`: 35 passed, 0 failed** on Helsinki (0700 temp dir, fake `cc-send`, fake `systemctl`, **fake unit name** — finding 2 — and an assert that refuses to run otherwise; removes its own temp dir). Covers: classify (commands, short near-miss, long conversation ignored); the switch to Codex (Langston `inactive/disabled`, handover order first); **BLOCKER-1** (a repeated command keeps the order open, reports who is missing, the nag still fires); **BLOCKER-2** (stopped-but-enabled and started-but-disabled both NOT good, Kyle pinged with the failed verb); completion; LANGSTON ON/OFF; session ON with and without a handover; session OFF; supersede; expiry; B1 (a failing post never kills dispatch; the watcher advances its offset first and survives); refusals. Langston's live bridge read `active/enabled` before and after the run.

**`AGENTS.md`**: no shift limits; step 0 = `crew-switch status` (orders and the on-duty list; off duty ⇒ do nothing); Coltrane wakes on his name; alerts of the Claude counterpart are the Codex session's, under its own actor; §5 = the orders.

## INCIDENT, OWNED
At 08:46:43Z a first run of the r2 tests missed the fake `systemctl` and **stopped and disabled Langston's live bridge**; re-enabled and started by ~08:47:00Z (~20 s; his bridge backfilled 26 messages). `MISTAKE: fixture-not-process` trailer on `5c6296f82`. Two guards now (fake binary + fake unit name).

## JUDGEMENT CALLS TO ATTACK
1. A session ON order completes on the **counterpart's** hand-over only; the incoming session's confirmation is tracked, never chased.
2. The near-miss reply only fires on messages ≤60 characters.
3. `LANGSTON ON` while the crew is on Codex leaves the crew on Codex — Langston and Coltrane can both be on.
