# B-COMMS-IMAGES — pre-audit (#657)

## Component census (per §9.5(a): writers/readers/mutators/deleters/schedulers at each hop)
- **`discord_common.py`** — shared by BOTH bridges (import `dc`). ADDS: media constants,
  `sanitize_filename`, `is_image_attachment`, `collect_image_meta`, `save_image_meta`,
  `_post_multipart_file`, `send_file`. No existing function modified — additions only, so the
  voice pipeline (only current caller of `download_attachment`) is untouched.
- **`discord-cc-bridge.py`** — `on_message` (Kyle-only handler): metadata on-loop, download via
  `run_in_executor` (gateway never blocks). `send()`: new `file=` branch; existing text path
  byte-unchanged when `--file` absent. New argparse arg. WRITERS to the inbox jsonl gain two
  OPTIONAL fields (`media_paths`, `media_failed`) — READERS census: the wake filter
  (`cc-wake-filter.py`), §10.5 readers, langston-recall's indexer, and the watchdog dedup all
  read `kind`/`text`/ids and tolerate unknown extra fields (json objects, no strict schema).
- **`discord-langston-bridge.py`** — enqueue: `image_atts` metadata set on `base` in
  on_message (metadata-only on-loop; worker downloads). ⚠ CENSUS CORRECTION (Step-4
  finding 1): the first diff ASSERTED this writer while not containing it — the reader
  shipped with no writer and the capability was dead-from-birth. The writer landed in the
  Step-4 fix commit. Recorded because a census asserting a nonexistent writer is the exact
  failure the census format exists to catch. `process_task`: prompt lines appended AFTER `addressed_prompt`
  is fully built (all three branches covered); reply path: `extract_attachments` strips/validates
  markers BEFORE the `len<3` ack check and BEFORE the recipient prefix; uploads AFTER the text
  posts. Queue/marker machinery (`lq.*`) reads `response` (the RAW reply) — [[ATTACH]] markers
  survive there harmlessly (parse_marker greps `[[QUEUE`/`[[ALERT` shapes only).
- **`cc-send`** — passthrough; telegram rollback path REFUSES `--file` (no silent drop).
- **NEW units** `cc-discord-media-prune.{service,timer}` — no existing unit touched.
- **Deleters:** the prune service is the ONLY deleter, scoped to `/var/log/cc-discord-media`,
  -type f, >60d, counted+logged. **Schedulers:** the one new timer. No other component
  schedules, reads, or deletes in that dir (grep: path appears nowhere else).

## State written vs read (§9.5(a-ii))
New state: media files on disk + two optional jsonl fields + prune log. No existing state's
writer is removed; no reader loses its writer. Removal of this batch would strand only its own
files (transit buffer, pruned).

## Deploy plan & blast radius
Repo commit → Langston Step-4 → push → scp both bridges + common + cc-send to /opt (byte-verify)
→ install units + `mkdir -p /var/log/cc-discord-media` (langston:langston 0775 — the
root-creates/langston-owns pattern from langston-call.log; BOTH bridge users can write) →
ANNOUNCED restart of both bridge services, queues verified idle → live controls per scope §V.
Rollback: dated `.pre-images-*` backups of all four files; units removable; media dir inert.

## Provenance
#657 (RUNNING_ISSUES, CC-B filing + CC-A transfer annotation); Telegram-era CCDT relay = the
regression baseline; Langston invocation #7 verbatim conditions in the PROMPT7 record
(`/home/langston/inbox/langston-memory-proposal/PROMPT7.md`) + this session's project docs
(`G:\My Drive\Langston\`). Board: B-COMMS-IMAGES card, owner Infra Claude.
