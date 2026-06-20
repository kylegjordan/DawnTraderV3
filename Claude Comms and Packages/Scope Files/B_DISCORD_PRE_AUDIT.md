# B-DISCORD — Pre-Implementation Audit (Step 2, SIM-grounded)

**Owner:** OLD Claude (CC-A). **Created:** 2026-06-20. Pairs with `B_DISCORD_SCOPE.md`. Grounded in `SYSTEM_IMPACT_MAP.md` "Agent Bridges (Hetzner Helsinki, OUT-OF-REPO)" section (lines ~2379–2398) and the live build under `comms-infra/discord/`.

> **Retroactive note:** the code already shipped + is deployed in parallel. This pre-audit documents the blast-radius/isolation analysis after the fact (the build itself carried its own design review in `DISCORD_BRIDGE_DESIGN.md` + Langston's review-fix pass). Its job here is to make the SIM-level impact explicit for governance and to drive the SIM update (OBJ-2).

## 1. What the SIM records today (the baseline)
The SIM "Agent Bridges" section records the **Telegram** fabric only: `cc-comms-bridge` + `langston-bridge.py` (both Helsinki, OUT-OF-REPO at `/usr/local/bin/`), the shared `whisper.cpp` voice pipeline, the voice archive, and the Langston→staging SSH path (MEDIUM blast radius, with the documented escalation chain + RUNNING_ISSUES #110 ForceCommand follow-up). All write/read the shared `/var/log/cc-bridge-inbox.jsonl`. The SIM is currently **silent on Discord** — that silence is itself the governance gap this batch closes.

## 2. What B-DISCORD adds (new components → SIM OBJ-2)
| Component | Path | Upstream | Downstream | Blast radius |
|---|---|---|---|---|
| `discord-langston-bridge.py` | `/opt/discord-bridges/` (Helsinki) + repo `comms-infra/discord/` | Discord gateway push (`on_message`) on the Langston bot; whisper voice | claude-cli (`--session-id <UUID> --model claude-opus-4-8[1m]`); `/var/log/cc-discord-inbox.jsonl` mirror | LOW — parallel to Telegram, separate log; single-claude-at-a-time preserved (single FIFO worker). |
| `discord-cc-bridge.py` | same | Discord gateway push on the CC bot; whisper voice | `/var/log/cc-discord-inbox.jsonl`; `send` mode posts via REST / webhook (per-session display name) | LOW — boundary only. |
| `discord_common.py` | repo `comms-infra/discord/` | — | shared helpers (config load, REST/webhook send, 429 backoff, transcribe) | LOW — library. |
| `cc-send` dispatcher | repo `comms-infra/discord/` | reads `COMMS_BACKEND` | routes outbound to telegram OR discord bridge | LOW — switch indirection; default telegram. |
| `/var/log/cc-discord-inbox.jsonl` | Helsinki | both Discord bridges | wake watcher tail + (future) §10.5 | LOW — SEPARATE from the live Telegram log; same JSONL schema. |
| `/etc/dawntrader/comms-active.env` | Helsinki | — | the `COMMS_BACKEND` single-source-of-truth switch | LOW now (=telegram); becomes the cutover control later. |
| two new systemd units | Helsinki | — | run the two Discord bridges | LOW — parallel services. |
| `cc-wake-filter.py` change | `C:\Users\kyleg\.claude\` (local) | tails Telegram + Discord logs | wakes CC sessions by display-name routing | LOW — local to CC desktop; additive (Telegram tail unchanged). |

## 3. Isolation / blast-radius findings (the safety case)
- **Telegram fabric untouched.** The live Telegram services, their log (`cc-bridge-inbox.jsonl`), state, and the existing behavior are NOT modified. Discord writes a SEPARATE log. `COMMS_BACKEND=telegram` → all CC outbound still routes to Telegram. **Rollback = flip one env var.**
- **Single-claude-at-a-time invariant** (the SIM's critical bridge rule) is **preserved** on the Discord Langston bridge: one `queue.Queue` → one worker thread → one `claude --session-id` subprocess at a time. Verified in code (`task_worker`, single FIFO).
- **Loop-safety on bot-to-bot** (new failure mode Discord introduces, Telegram could not): the two bots see each other. Mitigated by (a) self-message loop guard, (b) Langston engages a CC post ONLY when it STARTS with "Langston", from the pinned CC bot id / CC webhook id, (c) a circuit breaker after `BOT_TURN_LIMIT` consecutive non-Kyle turns, (d) message-id dedup deque (RESUME can redeliver `MESSAGE_CREATE`). All landed.
- **Inbox schema parity:** Discord entries reuse the exact JSONL shape the wake filter + §10.5 expect, plus `transport: "discord"` + Discord-native IDs — so the wake watcher and §10.5 surfacing work unchanged. (SIM "If I Change X" rule on the shared schema still applies: the Discord log is a sibling, not a re-shape of the Telegram log.)
- **Wake-routing-by-name (punch-list #11, landed this batch):** the Langston bridge now auto-leads its reply with the addressee's name so the CC wake filter (which keys on the session name appearing in a post) always catches it. Deterministic — derived from the triggering message author, not Langston's phrasing.

## 4. Security surface delta (extends the SIM escalation chain)
B-DISCORD adds **two new bot tokens** (`/etc/langston/discord-langston-bot.env`, `discord-cc-bot.env`, Kyle-provisioned) and a **second inbound channel** (Discord gateway) into the same Helsinki box. It does NOT add a new SSH path or new staging access — the Langston→staging SSH surface (the MEDIUM-risk leg + RUNNING_ISSUES #110 ForceCommand follow-up) is unchanged. The MESSAGE_CONTENT privileged intent is enabled on both bots (self-serve under 100 servers). Net delta: +2 bot credentials on the same box, same blast radius class as the existing Telegram bot tokens (LOW — boundary credentials; compromise reaches the channel, not the trading engine or DB directly). The dominant escalation chain (Helsinki → Langston SSH key → deploy@staging → DB) is unchanged.

## 5. "If I Change X, Check Y" — B-DISCORD additions (for the SIM)
- **Change the inbox-log schema** → now THREE writers/readers conceptually (Telegram cc + Telegram Langston + the two Discord bridges); bump `schema_version` across all and keep the Discord log a schema-sibling of the Telegram log.
- **Flip `COMMS_BACKEND`** → reroutes all CC outbound via `cc-send`; verify both Discord services are active + the wake watcher is tailing the Discord log BEFORE flipping; Telegram stays running as rollback.
- **Add/rename a CC session display name** → update the webhook username AND the wake filter `NAMES`/`ALIAS_NAME` registry AND the Langston bridge `resolve_recipient_name` path (display name must match what the filter routes on).
- **Change the address-Langston gate** → `ADDRESS_START_RE` in the Discord Langston bridge; a CC post must START with "Langston" to engage him (mid-sentence mention does not). Any always-engage exception (OBJ-5 alert class) is an explicit, narrow bypass.
- **Modify Discord bridge concurrency** → preserve the single-FIFO single-worker invariant (same rule as Telegram).

## 6. Governance applicability call (Step-2 declaration)
- **System Manual: N/A** — no trading architecture, regime/strategy logic, signal pipeline, filter design, or math changes. Comms/ops layer only. (Declared in scope; Langston to confirm per Item-3 tiering — a REQUIRED-doc N/A on a non-arch batch is Langston-alone confirmable.)
- **SIM: REQUIRED** — new components + cross-cutting wake/log/switch state (OBJ-2).
- **CHANGES_AND_FIXES: applicable** — log the build + the wake-routing fix + the loop-safety mitigations.
- **RUNNING_ISSUES: applicable** — carry OBJ-5 (alerts-through-Discord) + OBJ-6 (topic-21 archive) homes; note the cutover remains a future scheduled step.

## 7. Langston Step-1 review — PROCEED (2026-06-20, via Discord)
Langston returned **PROCEED** with three confirmations + conditions (his reply auto-led with "OLD Claude —", which also live-verified the punch-list #11 wake-routing fix):
1. **change-class non_architecture + System Manual N/A — confirmed.** Comms/ops layer only; OBJ-5's §10.5 dispatcher touch is alert *routing*, not trading architecture — N/A holds. SIM update required; the dual-backend belongs in the Cross-Cutting Runtime State registry.
2. **OBJ-5 → option B (always-engage exception), with a binding condition:** key the bypass off an **explicit structured marker the dispatcher emits** (`category=ALERT` / a dedicated field) — NOT sender-name string-matching (roster names drift) and NOT a body substring like "ALERT" (spoof/over-fire). Scope the bypass to exactly the dispatcher's alert class. *(Note: the live alert JSONL already carries a `category` field — e.g. `"category":"governance"` — so a structured marker is available.)*
3. **OBJ-3 → keep Telegram as the documented live-rollback fallback** (we're unswitched; deleting its runbook would strand rollback). Retire only the SSH-deliver/file-first apparatus into the history doc; the Telegram rollback runbook stays live until cutover closes.
- **OBJ-8 method condition:** run the sync verification via `ssh staging` / `git show`, NOT gdrive working-tree reads (§18 FUSE-wedge risk).

These conditions are folded into the build (OBJ-5 keys off `category`; OBJ-3 preserves the Telegram fallback section; OBJ-8 uses `ssh staging`).
