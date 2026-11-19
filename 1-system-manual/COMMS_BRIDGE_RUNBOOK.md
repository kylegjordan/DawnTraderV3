# COMMS BRIDGE RUNBOOK — "the bridge is misbehaving"

> **What this is:** the ordered diagnostic procedure for the Discord comms fabric, moved out of `CLAUDE.md` §8.2 per #564 (*operative→CLAUDE.md, depth→runbooks*). It is a **runbook** — you read it when something is broken, not on every turn.
>
> **Nothing removed.** Steps 3–5 and 7–8 are Telegram-era and HISTORICAL since the 2026-07-02 decommission; kept for the archive-restore case only.
>
> **Related:** `LANGSTON_ARCHITECTURE.md` (how the reviewer is built) · `CLAUDE.md` §6/§8 (the binding comms rules).

---

## Check in this order

Check in this order:

1. **Service status** — `ssh root@204.168.141.77 "systemctl is-active discord-cc-bridge.service discord-langston-bridge.service"`. Both should be `active`. If failed/activating: `journalctl -u <name>.service --no-pager -n 30`. (Items 3-5, 7-8 below are Telegram-era — HISTORICAL since the 2026-07-02 decommission; kept for the archive-restore case only.)
2. **OAuth token validity** — `wc -c /etc/langston/oauth.env` should be ~134 bytes. If expired (1-year limit), re-issue with `claude setup-token` from Kyle's laptop.
3. **getUpdates conflict (409)** — only one client at a time can long-poll. 409 in bridge log → something else polling the same token (common cause: OpenClaw not fully shut down). Check `systemctl --user status openclaw-gateway`.
4. **Bot privacy mode** — `curl https://api.telegram.org/bot<TOKEN>/getMe | jq .result.can_read_all_group_messages` should return `true`. Set via BotFather `/setprivacy → Disable`.
5. **Bot-to-bot block** (NOT a bug) — `@LangstonDTBot`'s getUpdates will NEVER see `@CCDTCommsBot`'s messages. Telegram platform rule. Use SSH+`claude -p` direct delivery for CC→Langston.
6. **claude-cli alive but no reply (>10 min, 0-byte reply file)** — two likely causes: (a) `acceptEdits` permission-mode hang on Bash tool use (kill PID with `kill -9`, re-invoke with `--permission-mode bypassPermissions` per the archived Telegram apparatus); (b) GDrive rclone cache lag on recently-written file (verify with `ssh root@204.168.141.77 'sudo -u langston ls -la <gdrive-path>'`; if "No such file", scp-stage to `/home/langston/inbox/<batch>/` and re-prompt).
7. **Session UUID conflict** — `Session ID already in use` means canonical bridge UUID is locked. Use `uuidgen` for fresh one-off. Verbatim relay (archived Telegram apparatus) still applies on the rollback path.
8. **Markdown send errors (400)** — Telegram rejects with "can't parse entities" → retry WITHOUT `parse_mode=Markdown` (plain text fallback). Bridge auto-falls-back; manual relays via curl need to handle this — `description` field names the offending character offset.
9. **Long `claude -p` reviews HANG while short ops still work — it's the box's GDrive mount, NOT Langston's model (diagnosed + fixed 2026-06-15).** Symptom: Langston returns instantly on short dispatches (inbox-file pointers, bridge sends) but a LONGER review that must READ repo source files (to verify a `file:line` ref) hangs for many minutes-to-hours; the box shows a sustained high **load average (~3+) with near-zero CPU from `claude`** (= processes stuck in **D-state I/O wait**). **Cause:** the rclone Google-Drive FUSE mount (`/mnt/gdrive`, systemd `rclone-gdrive.service`) has WEDGED — `timeout 5 ls /mnt/gdrive` hangs — so anything Langston reads from the gdrive-mounted repo blocks. Often compounded by **abandoned background watch-loops** from old batches still `stat`-ing the mount (e.g. a **54-day-old** `B63_ITEM18` `while true; stat …/B63_ITEM18_SQE_AUDIT.md; sleep 20` loop found 2026-06-15 — never killed at that batch's close). **STEP 1 — prove it's NOT his brain:** a fresh one-off `sudo -u langston … /usr/bin/claude -p --model claude-opus-4-8[1m] --permission-mode bypassPermissions "Reply with exactly: OK"` returns `OK` in seconds → model/token/API are healthy, so don't re-flip the model or touch OAuth. **FIX:** (a) sweep + kill stale loops: `ssh root@204.168.141.77 'ps -eo pid,etime,cmd | grep -E "while true|stat -c.*gdrive" | grep -v grep'` then `pkill -f "<unique-pattern>"`; (b) restart the mount: `systemctl restart rclone-gdrive.service` — if the stop hangs on a stuck unmount, `fusermount -uz /mnt/gdrive; umount -l /mnt/gdrive` then `systemctl start rclone-gdrive.service`; (c) re-test `timeout 8 ls /mnt/gdrive` → OK + `stat` a repo file (e.g. `/mnt/gdrive/Dawn Trader/.../CLAUDE.md`) → byte count. The mount being a clean systemd service means the restart re-applies the correct flags; the bridges + `/home/langston` + `/etc/langston` are on LOCAL disk so they're unaffected. **PREVENTION:** never leave a background watch-loop running past its batch (kill it at close); keep pointing Langston at `/home/langston/inbox/` files + `ssh staging`, NOT the gdrive-mounted repo, so a future stall can't hang him.

---

## Restarting Langston's bridge, and the gates for editing it (B-LANGSTON-RELIEF, 2026-10-17)

- ⛔ **RESTART ONLY WITH `ssh root@204.168.141.77 '/usr/local/sbin/langston-bridge-restart'`** — never a bare `systemctl restart discord-langston-bridge.service`. The bridge holds its queue in memory; a restart without a recovery floor drops every waiting message (measured 2026-10-17 04:35Z: nine dropped, repaired by hand). The helper writes the floor first, waits for a posted reply, and reads the bridge's own recovery line. Exit codes and options: the helper's own header, and the System Impact Map's Discord Comms Fabric entry. `--dry-run` prints the plan and changes nothing (it is not proof the installed bridges group is at branch head).
- **A deploy of the bridges group** (`deploy.sh --sha <sha> --only bridges`) installs the files and does not restart a running bridge — it prints `NOT RESTARTED` per unit. Restart with the helper afterwards.
- ⛔ **THE HAND-RUN GATE for any edit to `run_agent`, `stop_cleanly` or `save_state` in `discord-langston-bridge.py`:** on Helsinki, from a root-only dir holding the bridge and its modules at the ref under review, `/opt/discord-bridges/venv/bin/python3 test_bridge_clean_stop.py` — expected `0 FAIL`, exit 0. It cannot join CI (the bridge loads tokens and shared config at import), so the review dispatch and the completion report that cite it state the HOST and the REF. **Run any mutation of it under `setsid`**: a mutation that drops `start_new_session=True` makes `killpg` resolve to the runner's own group and kills your shell.
- **For any edit to `langston-bridge-restart`:** `python3 test_langston_bridge_restart.py` from `comms-infra/discord/` (offline; drives the follower against real processes). Then install, and confirm the installed copy is the reviewed one by hash.
- **Recovery probe** (`langston_bridge_recovery_probe.py`): writes only to a scratch dir and checks that it did not touch the live bridge log.

---

## COMMS DEPTH RELOCATED FROM `CLAUDE.md` §6 — 2026-08-23 (B-RULES-1c)

> **#564 PLACEMENT RULE:** `CLAUDE.md` keeps the OPERATIVE statement — what to do, what not to do, the decision — and every one of those statements now points HERE by anchor name. **What moved is diagnostic depth, measured evidence and dated change history**, which is what this runbook is for. `CLAUDE.md` §6 is read on every start and every compaction by every session; this file is read when something is broken.
> ⛔ **NOTHING WAS DELETED OR WEAKENED.** Each block below is VERBATIM. Langston’s standing condition — a single-homed rule may not be dropped or demoted without a named replacement landing in the same commit — is met by the surviving operative line plus this text, in this commit.

### §discord-mechanics-2026-06-20

> **★ Discord comms mechanics — additional behavior ON RECORD (changes 2026-06-20/21; not a full governance batch — documented here per Kyle so the four-way comms behavior is recorded):** (1) **The CC↔Langston circuit breaker is effectively REMOVED** (`BOT_TURN_LIMIT` 6 → 30 → **100,000**, `discord-langston-bridge.py`): a normal overnight CC↔Langston review is 30-50 messages, so any low cap silently swallowed legitimate work (it tripped at 6 mid-review and dropped NEW Claude's Step-4 sign-off requests). 100k is unreachable in real use but still bounds a pathological infinite-loop bug; Kyle posting anything resets it to 0. (2) **Relay hand-off (MEMORY §4.7):** because Langston's reply auto-leads with the name of whoever TRIGGERED his turn, if you ask him about something FOR the OTHER CC his answer leads with YOUR name and the other CC won't wake — so the asker OWNS relaying it to them (post naming the intended CC), or let that CC ask Langston directly. (3) Component-level detail lives in `SYSTEM_IMPACT_MAP.md` "Discord Comms Fabric"; the dated change record is `CHANGES_AND_FIXES.md` FIX-2026-06-20-A.

### §langston-dispatch-chunking-553

> **★ LENGTH IS NO LONGER A CONSTRAINT ON LANGSTON DISPATCHES (B-COMMS-CHUNK-FIX, #553, 2026-07-22).** Discord's hard cap is 2000 chars per message, and a longer post is split into separate messages. Langston's address gate ran **pre-enqueue**, and only the FIRST piece carries the leading "Langston" — so **every piece after the first was silently discarded before it ever became a task.** Long reviews reached him truncated, with no error on either side. The bridge now stamps a group marker on each piece and **reassembles them into ONE message before the gate**, so send Langston whatever length the work needs. **No sender does anything differently** — the fix is transparent; there is no flag, no command, no length discipline to remember.

### §chunking-known-properties

> **Two known properties, recorded not buried:** (1) pieces are cut **only at whitespace**, so a `file:line` ref, commit sha, path or URL can never be split across a seam — this matters because a mangled coordinate does not throw, it points somewhere *plausible but wrong*; (2) whitespace **at** a seam may normalise to a single newline, so a reassembled message is not guaranteed byte-identical in its blank lines. A genuinely unbreakable run (>1950 chars with no whitespace) is hard-cut and **logs a warning** rather than corrupting silently.

### §chunking-narrowness-original

> **⚠️ Know how NARROW that is, or you will assume it protects traffic it never touches:** reassembly applies **only** to a CC dispatch whose **opening list names Langston AND that exceeds 2000 chars** (`#1241`). Everything else — Langston's own replies (they lead with "OLD Claude —"/"Kyle —"), all Kyle-facing posts, and the §10.5 alert webhook — takes the untouched path and splits exactly as before, byte-identical.

### §telegram-ssh-deliver-archived

> **🗄 The legacy Telegram SSH-deliver apparatus** (file-first-via-scp, the two-step visibility+`claude -p` dance, hung-instance kill procedure, verbatim-relay) is **archived at `1-system-manual/_archive/TELEGRAM_COMMS_APPARATUS_ARCHIVED_2026-07-01.md`** — a HISTORICAL record, not a standby — the bridges were stopped and their unit files removed (#348). Reverting to Telegram is a restore-from-archive job, not a switch flip.

### §voice-transcription-pipeline

Kyle's voice messages are transcribed locally (whisper.cpp + `ggml-small.en`) and land in the inbox log as `kind: "voice_inbound"` (or `voice_inbound_failed` with a failure reason). On the live **Discord** path the discord-cc-bridge handles voice → `/var/log/cc-discord-inbox.jsonl`; the wake watcher (§6.9) picks it up like any inbound. The Telegram-era whisper pipeline detail (getFile → ffmpeg → whisper-cli, 30-day audio archive) is archived with the rest of the Telegram apparatus (`1-system-manual/_archive/TELEGRAM_COMMS_APPARATUS_ARCHIVED_2026-07-01.md`).

### §telegram-decommission-348

> **★ COMMS BACKEND — DISCORD ONLY · TELEGRAM IS DECOMMISSIONED (cutover #333 2026-06-25; decommission B-TELEGRAM-DECOMM #348 2026-07-02).** **`COMMS_BACKEND=discord` in `/etc/dawntrader/comms-active.env`** routes ALL of CC's outbound (`cc-send` + the §10.5 system alerts) to **Discord `#general`** — THE crew channel. Discord's decisive win is **native bot-to-bot messaging**: the two bots receive each other's messages, so **CC↔Langston is a normal in-channel exchange**. **The Telegram apparatus is GONE:** after a clean 7-day bake (1,492 msgs, 0 errors), the bridges (`langston-bridge`, `cc-comms-bridge`) were stopped, their unit files removed, and the scripts archived (Helsinki `/root/telegram-bridges-archive-2026-07-02/` + repo `1-system-manual/_archive/deleted-code/*.removed`); procedures archived at `1-system-manual/_archive/TELEGRAM_COMMS_APPARATUS_ARCHIVED_2026-07-01.md`; entry in `DELETED_COMPONENTS_LOG.md`. Setting `COMMS_BACKEND=telegram` now makes `cc-send` FAIL LOUDLY (no silent dead branch). Restoring Telegram = restore from the archive (a deliberate act, no longer one line — the accepted trade of decommissioning). **Live Discord mechanics:** display names **OLD Claude** (CC-A) / **NEW Claude** (CC-B); a Claude addressing Langston **leads the post with "Langston"** (his bridge engages only when his name is at the START of the post — a mid-sentence mention does NOT wake him); Kyle may name him anywhere; Langston's bridge **auto-leads every reply with the addressee's name** ("OLD Claude — …" / "NEW Claude — …" / "Kyle — …") so the CC wake-routing catches it (deterministic, from the triggering message's author, not his phrasing); the wake watcher reads the Discord inbox (`/var/log/cc-discord-inbox.jsonl`) and is **armed as a Bash `run_in_background` task that ends on the first message for the session** (see §6.9 + MEMORY session-start 4.5/4.6; the Monitor form retired 2026-09-30, `#1127`). System alerts (§10.5) feed into Discord with a dedicated always-engage path for Langston keyed off the alert's structured `category` marker. **To post on Discord:** `ssh root@204.168.141.77 'cc-send --sender "OLD Claude" --message "..."'` (backend-routed; add `--notify` to @-mention Kyle for a phone push), or the direct bridge call `'/opt/discord-bridges/venv/bin/python3 /opt/discord-bridges/discord-cc-bridge.py send --sender "OLD Claude" --message "..."'` (bypasses the backend switch — use for crew posts during a rollback test).

---

## Moved from CLAUDE.md — B-TOKEN-ECONOMY P5 (2026-11-19)

Verbatim passages moved out of the always-loaded rules file to cut what every session re-reads. Each block id is the pointer `CLAUDE.md` carries in its place. `scripts/crew-tooling/move-ledger-check.mjs` proves each block is here once, unchanged, and gone from `CLAUDE.md` (ledger: `Claude Comms and Packages/Change Lists/B_TOKEN_ECONOMY_MOVE_LEDGER.json`).

<!-- P5-MOVED id=P5-23 -->
### P5-23 — moved from CLAUDE.md, under "6. Three-Way Communication Protocol (Kyle ↔ Langston ↔ Claude Code)"

> **★ Discord behaviour on record (2026-06-20/21):** the CC↔Langston circuit breaker is **effectively removed** (`BOT_TURN_LIMIT` 100,000 — a normal overnight review is 30-50 messages and a low cap silently swallowed real work); the **relay hand-off** rule is §6.9/MEMORY §4.7; component detail is in `SYSTEM_IMPACT_MAP.md` "Discord Comms Fabric". *(The measured incidents and the dated change record: `COMMS_BRIDGE_RUNBOOK.md` §discord-mechanics-2026-06-20.)*
<!-- /P5-MOVED id=P5-23 -->

<!-- P5-MOVED id=P5-24 -->
### P5-24 — moved from CLAUDE.md, under "6.1 Send / receive architecture"

**Hetzner-side systemd services (24/7) — Discord (see §8 for full component detail):**
- `discord-cc-bridge.service` — CC's outbound to `#general` (`cc-send` → webhook with the `--sender` display name) + Kyle/voice inbound → `/var/log/cc-discord-inbox.jsonl`.
- `discord-langston-bridge.service` — invokes Langston's reasoning (`claude -p`, fresh session per message) when a message names him; posts his reply natively in-channel, auto-led with the addressee's name.

**Unified inbox log** `/var/log/cc-discord-inbox.jsonl` on Hetzner is the single read-tap point. Each line is a JSON entry with `kind` ∈ {inbound kinds, `langston_inbound`, `langston_outbound`, `langston_alert_inbound`, `cc_outbound`, voice kinds}. (The Telegram-era `cc-bridge-inbox.jsonl` is frozen history — kept on disk, no writers since the 2026-07-02 decommission.)
<!-- /P5-MOVED id=P5-24 -->

<!-- P5-MOVED id=P5-25 -->
### P5-25 — moved from CLAUDE.md, under "6.5 CC → Langston (AI-to-AI delivery) — Discord native"

> **★ LENGTH IS NO LONGER A CONSTRAINT ON A LANGSTON DISPATCH (#553).** Send him whatever length the work needs. **No sender does anything differently — there is no flag, no command and no length discipline to remember.** *(How it broke, and the reassembly mechanism: `COMMS_BRIDGE_RUNBOOK.md` §langston-dispatch-chunking-553.)*
> ⚠️ **KNOW HOW NARROW THAT IS:** reassembly applies **ONLY** to a CC dispatch whose **opening list names Langston AND that exceeds 2000 chars.** Langston’s own replies, every Kyle-facing post and the §10.5 alert webhook take the untouched path and split exactly as before. **A `file:line`, sha, path or URL can never be split across a seam** (cuts are whitespace-only), but a reassembled message is **not** byte-identical in its blank lines. *(Both properties in full, and the unbreakable-run case: `COMMS_BRIDGE_RUNBOOK.md` §chunking-known-properties.)*
<!-- /P5-MOVED id=P5-25 -->

<!-- P5-MOVED id=P5-42 -->
### P5-42 — moved from CLAUDE.md, under "6. Three-Way Communication Protocol (Kyle ↔ Langston ↔ Claude Code)"

> **★ COMMS BACKEND — DISCORD ONLY · TELEGRAM IS DECOMMISSIONED (#333 cutover 2026-06-25; #348 decommission 2026-07-02).** **`COMMS_BACKEND=discord` in `/etc/dawntrader/comms-active.env`** routes ALL of CC’s outbound (`cc-send` + the §10.5 alerts) to **Discord `#general`** — THE crew channel. Its decisive win is **native bot-to-bot messaging**, so **CC↔Langston is a normal in-channel exchange**. ⛔ **Setting `COMMS_BACKEND=telegram` now makes `cc-send` FAIL LOUDLY** — there is no silent dead branch, and **restoring Telegram is a restore-from-archive job, not a switch flip.** *(The decommission record, bake evidence and archive paths: `COMMS_BRIDGE_RUNBOOK.md` §telegram-decommission-348.)*
<!-- /P5-MOVED id=P5-42 -->

<!-- P5-MOVED id=P5-48 -->
### P5-48 — moved from CLAUDE.md, under "6. Three-Way Communication Protocol (Kyle ↔ Langston ↔ Claude Code)"

> **LIVE MECHANICS — all operative, all needed every day:** Discord display names — **the `--sender` value, and they are ALSO the wake-routing keys, so they must be exact:** **OLD Claude** (CC-A) · **NEW Claude** (CC-B) · **ANALYST Claude** (CC-C) · **Infra Claude** (CC-INFRA) · **PM Claude** (CC-PM). The permanent **registry names** bound to session IDs are, respectively, **Claude Old · Claude New · Claude Analyst · Infra Claude · PM Claude** in `(repo)/.claude/cc-session-roster.json`; those binding names and the Discord/wake forms are separate contracts even where a pair happens to be identical. ⚠️ **MEASURED on the live channel 2026-08-23, because this list was wrong twice:** it named only CC-A and CC-B for months, and a same-day fix added CC-C under the WRONG Discord form (“Claude Analyst”, which he has never posted under). Observed counts then: NEW 2114 · OLD 1829 · ANALYST 836 · Infra 31. ⛔ **THE WAKE RULE IS THE POST'S OPENING LIST (B-WAKE-OPENING-LIST, `#1241`, KD-20/KD-21, live 2026-11-06):** a session's post wakes the parties named in its **opening list** — `"Langston, Coltrane, OLD Claude — …"` wakes all three — and **a passing mention later in the post wakes nobody**. Kyle may sit in the list (`"Kyle, Langston — …"`) without being woken. **ONE rule, one file:** `address_list.py`, sha-pinned in every consumer (Langston's bridge, the sender, Coltrane's bot, each session's filter). **Kyle may name anyone anywhere** — his posts keep the name-anywhere rule. Langston’s bridge **auto-leads every reply with the addressee’s name** ("OLD Claude — …") so CC wake-routing catches it — deterministic, from the triggering message’s author, not his phrasing. The wake watcher reads `/var/log/cc-discord-inbox.jsonl` and is **armed as a Bash `run_in_background` task that ends on the first message for you** (§6.9 + MEMORY §4.5/4.6; the Monitor form retired 2026-09-30, `#1127`). §10.5 alerts reach Discord only through the dispatcher’s dedicated alerts webhook (`pushToDiscord` in `scripts/system-alerts.ts`; `shouldDeliverToDiscord` in `server/services/system-alerts.ts` decides which rows post), and Langston’s bridge always engages on that webhook’s id (`is_alert` against `alerts_webhook_id` in `discord-langston-bridge.py`), not on any `category` marker, sender name or body text.
<!-- /P5-MOVED id=P5-48 -->

<!-- P5-MOVED id=P5-50 -->
### P5-50 — moved from CLAUDE.md, under "6.7 Three-way discussion protocol (live)"

**Image relay:** images Kyle posts land in Discord `#general`; historical Telegram-relayed images remain on disk at `Claude Comms and Packages/CCDT Relay/images/<filename>` (frozen — no new arrivals since the 2026-07-02 decommission). Read either with the Read tool.
<!-- /P5-MOVED id=P5-50 -->

<!-- P5-MOVED id=P5-56 -->
### P5-56 — moved from CLAUDE.md, under "6.4 CC → Kyle"

For multi-line messages with shell metacharacters in the body, use the scp-the-body-to-a-file pattern (cat to a local file → scp to Helsinki `/tmp` → `cc-send --message "$(cat /tmp/…)"` inside single quotes so expansion happens remotely).
<!-- /P5-MOVED id=P5-56 -->
