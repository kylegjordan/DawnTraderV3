# B-COMMS-IMAGES — two-way Discord image support (#657)
change-class: non_architecture

**Owner:** Infra Claude (board card in Implementation; #657 absorbed — CC-B filing 2026-08-06,
CC-A ownership transfer in-channel same day). **Kyle directive (Desktop, 2026-08-06):** the crew
including Langston can SEE images posted to #general and can UPLOAD images themselves. Surfaced
live when Kyle's Fable-5 screenshot reached no session (bridges relay text only — a capability
REGRESSION vs the Telegram-era CCDT relay, unnoticed six weeks).

**Design review:** Langston, private invocation #7 (2026-08-06) — PROCEED with binding
conditions (d)/(e)/(f), all implemented; his Step-4 on the actual diffs gates the deploy.

## Objectives
1. **Inbound:** both bridges detect image attachments (content-type/extension allowlist),
   download OFF the gateway loop to `/var/log/cc-discord-media/<YYYY-MM-DD>/<msgid>_<i>_<name>`
   (filename SANITIZED — attacker-controlled), and record `media_paths` on the inbox jsonl
   entry. A failed save records `media_failed` and, for Langston, the prompt states
   "save FAILED" — never presented as an empty set (#453).
2. **Langston sees:** his invocation prompt lists THIS message's attachment paths for the
   Read tool (native multimodal read). Only the invoking message's media — no accumulation.
3. **Sessions upload:** `cc-send --file <path-on-helsinki>` (webhook multipart; single-message,
   content caps at 2000; refused loudly on missing/oversize file; telegram backend REFUSES).
4. **Langston uploads:** `[[ATTACH /path]]` markers in his reply — one path per marker,
   stripped ALWAYS; `realpath()` BEFORE an allowlist prefix check (`/home/langston/outbox/`,
   `/opt/langston-memory/exports/`); refusals appended to the posted message; upload failures
   announced in-channel; size cap `MEDIA_MAX_BYTES` = 24MiB (below Discord's 25MB), fail-closed.
5. **Retention:** media dir is a TRANSIT BUFFER, not an archive — daily systemd prune of
   files >60 days that LOGS a count, never follows symlinks; load-bearing evidence must be
   committed to the repo before it ages out.

## Verification criteria (Step-7/8)
- Kyle (or a session via `--file`) posts an image → path lands in the inbox jsonl entry;
  Langston, invoked on that message, describes the image's content correctly (proves native
  read). ★ The test image must ride a message that NAMES Langston — an image-only message
  never engages his bridge (name gate + empty-content return; by design, Step-4 note 2).
- At deploy: confirm both allowlist dirs exist as REAL directories (they are realpath'd at
  bridge startup — a symlinked allowlist dir would refuse everything; Step-4 note 3).

## Known limits (accepted)
- A voice note that ALSO carries an image loses the image on the CC-inbox side (the voice
  early-return precedes image capture; Step-4 note 4). Rare; revisit only if it ever bites.
- Langston emits `[[ATTACH]]` for an allowlisted file → it appears in #general; for a
  NON-allowlisted path → the message posts with the refusal note and no upload.
- `chmod 000` a saved image → next Langston invocation on it says save/read FAILED, not "no image".
- Timer scheduled; prune log line appears on first run.
- Announced restart; repo↔server byte-identical post-deploy; rollback = dated `.pre-*` backups.
