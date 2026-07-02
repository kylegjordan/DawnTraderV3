# B-TELEGRAM-DECOMM — Scope: retire the Telegram comms apparatus (#348)

change-class: non_architecture

**Owner:** Claude Old (CC-A) · **Reviewer:** Langston · **Kyle green-light:** 2026-07-02 (Desktop, after bake-check PASS)
**Trigger:** the scheduled bake-check alert `e4bb6055` (#348) fired 2026-07-02 12:00Z; CC-A acked + ran the evidence check.

## 0. Bake-check evidence (Step-7-style, gathered 2026-07-02)
Since the #333 cutover (2026-06-25 → 2026-07-02): **1,492 messages** through the Discord inbox (`/var/log/cc-discord-inbox.jsonl`), **0 parse errors**, traffic **every day** of the window (529/333/49/57/21/290/184/29 per day), all four bridge services `active`, and **zero error-level journal entries** for either Discord bridge across the whole window. Only anomaly: 1 Langston voice-transcription failure (1 of 3 voice events — the whisper leg, not the Discord transport). Verdict: **clean bake — PASS.** Discord is proven as the sole live backend; the Telegram rollback insurance is no longer paying for its complexity.

## 1. Objectives (numbered, verifiable)
1. **Stop + disable the two Telegram bridge services** on Helsinki (`langston-bridge.service`, `cc-comms-bridge.service`): `systemctl stop` + `disable`, unit files left in place but inert (or removed — Langston's call), verify `is-active` = inactive and no getUpdates polling remains (no 409 risk for any future bot use).
2. **Retire the Telegram leg of the outbound dispatcher:** `cc-send` keeps routing by `COMMS_BACKEND` but the `telegram` target now fails loudly with a clear "decommissioned 2026-07-02, see DELETED_COMPONENTS_LOG" message (per NO-PATCHES: no silent dead branch). `/etc/dawntrader/comms-active.env` stays `discord`.
3. **Archive, don't destroy:** copy `/usr/local/bin/langston-bridge.py` + `/usr/local/bin/cc-comms-bridge` (+ state files) to `/root/telegram-bridges-archive-2026-07-02/` on Helsinki AND commit copies to the repo at `1-system-manual/_archive/deleted-code/` with `.removed` suffix. Preserve `/var/log/cc-bridge-inbox.jsonl` (historical record — do NOT delete).
4. **Wake watcher simplification:** remove `cc-bridge-inbox.jsonl` from the multi-tail in the watcher command (MEMORY.md item 4.5 + CLAUDE.md §6.9) — both sessions re-arm with the 3-source tail thereafter.
5. **Governance/doc updates:** `DELETED_COMPONENTS_LOG.md` entry (what/why/blast-radius/archive paths/commit); CLAUDE.md §6 comms-backend banner + §6.5/§6.6/§6.8 rollback references updated from "rollback-only" to "decommissioned, archive at _archive/TELEGRAM_COMMS_APPARATUS_ARCHIVED_2026-07-01.md"; §8 Telegram set marked decommissioned; §8.2 runbook items 3-5/7-8 (Telegram-specific) marked historical; SIM "Discord Comms Fabric" updated; RUNNING_ISSUES #348 RESOLVED; shared MEMORY.md 4.5/4.6/4.8 trimmed of Telegram-rollback caveats; BATCH_CATALOG + PHASE_HISTORY rows; completion report.
6. **Resolve the alert:** `system-alerts resolve e4bb6055-... --by cc-session-2026-07-02` (ack already done — ack≠resolved per ALERT_HANDLING_PROTOCOL).

## 2. Explicitly OUT of scope / kept
- **Bot accounts + tokens:** left registered (BotFather) but unused; token env files remain on Helsinki (mode-640). Deleting the bot accounts is Kyle's call, zero-risk to defer.
- **Voice-archive prune timer** (`cc-voice-archive-prune.timer`): left running — it only prunes old files and self-empties; retire opportunistically later.
- **Telegram Discussion Archives/** in the repo: historical record, untouched.
- **The Discord fabric:** untouched.
- **Rollback after this batch = restore from archive + re-enable services** (documented in the DELETED_COMPONENTS_LOG entry) — no longer one-line, which is exactly the accepted trade of decommissioning after a clean bake.

## 3. Verification criteria
- `systemctl is-active` shows both Telegram bridges inactive/disabled; Discord bridges still active.
- A test `cc-send` post lands in `#general`; a deliberate `COMMS_BACKEND=telegram` test (then reverted) fails loudly with the decommission message.
- Wake watcher re-armed on the 3-source tail in BOTH CC sessions; a live Discord wake verified.
- Archives present in both locations; docs updated; #348 resolved; alert resolved.
- (No CI-relevant code paths — repo changes are docs/archive only; CI green on head regardless per §5.19.)
