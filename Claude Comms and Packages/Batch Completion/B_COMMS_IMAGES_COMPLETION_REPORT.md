# B-COMMS-IMAGES — completion report (#657)
**Owner:** Infra Claude · **change-class:** non_architecture · commits `8b6b733ab` + `875664329` · deployed 2026-08-06 22:02Z

## Objectives (scope §Objectives) — all YES with evidence
1. **Inbound capture, both bridges — YES.** Live: Kyle-class message with red 64x64 test PNG →
   saved `/var/log/cc-discord-media/2026-08-06/1535045615686389790_0_step8-red.png`, `media_paths`
   on the inbox entry. Failure branch present (`media_failed` + "save FAILED" prompt line, #453).
2. **Langston sees — YES.** Step-8 control (1): his prompt listed the path; he Read it and
   reported "solid red, 64x64 — dimensions read from the PNG header, not eyeballed."
3. **Session uploads — YES.** The Step-8 dispatch itself was posted via `cc-send --file` (the
   red PNG rode it). Telegram backend refuses `--file` rather than dropping (code-verified).
4. **Langston uploads — YES.** Step-8 control (2): `[[ATTACH]]` of the blue outbox PNG uploaded,
   mirrored as `langston_outbound_media`. Control (3): `[[ATTACH /etc/passwd]]` probe stripped +
   refused loudly in-channel ("outside allowlist"); file never posted.
5. **Retention — YES.** `cc-discord-media-prune.timer` active (daily 03:40Z, counted deletions,
   find -P). Transit-buffer doctrine in scope + unit comment.

## Review trail
Design: Langston private invocation #7, PROCEED w/ binding conditions (d)/(e)/(f). Step-4 on the
diff: CHANGES-NEEDED — **1 blocker: the `image_atts` reader had NO WRITER (capability
dead-from-birth; caught by his writer/reader parity check against hash-verified live bases)** +
3 notes, all folded (`875664329`). Fast-pass: PROCEED. Step-8: he ran all three live controls
himself — 3/3 PASS. Pre-audit census corrected IN PLACE for the asserted-nonexistent-writer error.

## Deploy evidence
Atomic wait-then-deploy (idle window verified in-session after 3 aborted two-round-trip
attempts — lesson: check and act in ONE session). Backups `.pre-images-20260806-220224` (4 files,
both locations convention). Post-deploy sha256: 4/4 repo blob ↔ server identical
(`a0dd2005…`, `17a47421…`, `2abbf362…`, `50319dfe…`). Services active: both bridges + prune timer.
Allowlist dirs verified REAL directories at deploy (Step-4 note 3).

## ⚠ CI STATUS — close PENDS a green run (rule 19), and the red is NOT this batch's
At close-time the branch's Test Suite has been RED since 2026-08-06 20:46Z — **three runs, all
predating this batch's push (~21:57Z)**; Build/TypeScript/Docker green throughout. This batch
touches no `server/ shared/ client/ scripts/ drizzle/` paths (python bridges, shell, systemd
units, markdown only) and cannot reach the Test Suite. The red baseline is owned by the crew
sessions whose code landed in the failing window and was flagged to them in-channel at
close-time. **This report cites the green run id in an addendum when it exists; the batch is
FUNCTIONALLY COMPLETE + Step-8-verified but not formally closed until then.**

## Governance files changed
`BATCH_CATALOG.md` (entry) · `RUNNING_ISSUES.md` (#657 CLOSED annotation) · this report ·
scope + pre-audit (committed with the code, census correction recorded). Not applicable:
SYSTEM_MANUAL/SIM (no engine architecture; comms fabric detail lives with the SIM "Discord
Comms Fabric" section — one-line pointer update rides the next governance pass), PHASE_HISTORY
(letter batch, no phase change). Board: B-COMMS-IMAGES card → Verification pending Kyle ack +
green-CI addendum. Kyle's human-grade confirmation: repost the Fable-5 screenshot addressed to
Langston.
