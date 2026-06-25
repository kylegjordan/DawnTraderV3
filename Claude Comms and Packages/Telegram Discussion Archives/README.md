# Telegram Discussion Archives — index

This folder preserves the **Telegram comms history** of the Kyle ↔ Claude Code ↔ Langston crew, kept searchable and re-readable after the permanent **Discord cutover** (#333, 2026-06-25). Telegram is no longer the live channel — Discord `#general` is (see `CLAUDE.md` §6). Telegram bridges remain running as instant rollback until a clean bake, then decommission.

## Authoritative files (read these)

| File | Period | What it is |
|---|---|---|
| **`TOPIC_21_ARCHIVE_2026-05-06_to_2026-06-21_CUTOVER-FINAL.md`** | 2026-05-06 → 2026-06-21 | **The complete, human-readable topic-21 record.** Rendered by day, with timestamps + speaker labels (Kyle / CC / Langston / voice). Read this to re-read the discussion. |
| **`TOPIC_21_INBOX_RAW_2026-05-06_to_2026-06-25_CUTOVER-FINAL.jsonl`** | 2026-05-06 → 2026-06-21 | **The raw unified-inbox log** (one JSON object per line). The greppable source of truth the markdown is rendered from. Use for exact-text search / programmatic queries. |
| `CC_Sessions_Topic21_2026-03-19_to_2026-03-20.md` | 2026-03-19 → 2026-03-20 | Early topic-21 session capture (pre-OpenClaw-decommission era). |

## Superseded (kept for history; do not cite as current)

- `TOPIC_21_ARCHIVE_2026-05-06_to_2026-06-19.md` — partial; superseded by the `…_2026-06-21_CUTOVER-FINAL.md` above.
- `TOPIC_21_INBOX_RAW_2026-05-06_to_2026-06-19.jsonl` — partial; superseded by the `…_2026-06-25_CUTOVER-FINAL.jsonl` above.

## How to search

- **Text search (any tool / grep):** the `.jsonl` is one record per line — `grep -i "fee ladder" *CUTOVER-FINAL.jsonl`.
- **Reading by date:** the `…CUTOVER-FINAL.md` is organised under `## YYYY-MM-DD` day headers; jump to a date.
- **Record shape:** each `.jsonl` line has `ts`, `kind` (`cc_outbound`, `langston_inbound`/`outbound`, `voice_inbound`, empty = Kyle inbound, etc.), optional `sender_username`, and `text`.

## Why this exists

Topic 21 ("Batch Implementation") was the primary crew channel from the OpenClaw → Claude-Code-under-Max migration (2026-05-06) until the Discord cutover (2026-06-25). Telegram bot-to-bot is blocked at the platform level, which is why the old workflow needed the SSH-deliver apparatus (`CLAUDE.md` §6.5, now legacy/rollback-reference). Discord's native bot-to-bot messaging removed that constraint. This archive is the frozen pre-Discord record so nothing from that period is lost when Telegram is eventually decommissioned (per `CLAUDE.md` §5 rule 18, that removal will be logged in `DELETED_COMPONENTS_LOG.md`).
