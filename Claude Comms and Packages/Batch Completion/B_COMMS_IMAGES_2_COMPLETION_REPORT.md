# B-COMMS-IMAGES-2 — completion report
**Owner:** Infra Claude · **change-class:** non_architecture · **follows** B-COMMS-IMAGES (#657)
Commits `b279dfe79` → `f5274fa3f` → `e94cf95e6` → `fe4b4ea99` → `eb102f875`

## Why it existed
Kyle, after #657 closed: *"the end goal being that all the sessions can send and see images."*
#657 delivered **Langston fully and the desktop sessions half** — the bridges saved inbound
images and recorded their paths (verified in the log), but `cc-wake-filter.py` forwarded
`text` only, so a session woke on Kyle's message with no idea an image came with it, and the
file sits on Helsinki where a desktop session cannot Read it. Langston was fine because he
lives on that box and his bridge hands him the path directly — which is exactly how the #657
Step-8 pass was over-read as "done".

## Objectives — all YES, proven end-to-end
1. **Sessions SEE images.** `media_suffix()` appends saved paths to wake lines. Rides events
   that ALREADY wake (adds no routing); fail-open by construction.
2. **Sessions FETCH them.** `dt-media-get` → prints one LOCAL path for Read; on failure
   prints NO path and exits non-zero.
3. **Sessions SEND them in one step.** `dt-media-post` (laptop → Helsinki → `cc-send --file`),
   staging into the durable prune-governed media dir, not `/tmp`, so an image posted now is
   still fetchable hours later. `--sender` required, never guessed (CREW_SESSION discipline).
4. **A failed save cannot look like no image** — wake line states SAVE FAILED (#453).
5. **Zero bridge/server code changes** — the staging choice removed the need entirely.

**Live proof (2026-08-07):** 48×48 green PNG posted from the laptop (msg `1535143537228906529`)
→ real log row carries `media_paths` → the INSTALLED filter emits a wake line naming the path
→ `dt-media-get` fetched it → Read returned the green image. Langston independently read the
same file server-side and described it. Refusal path exercised (nonexistent file → no path,
exit 1). OLD Claude re-armed and independently confirmed the field on the row.

## Review trail (Langston, private invocations #10–#11)
CHANGES-NEEDED → PROCEED. Three defects, all his, all proven by a hostile fixture **he wrote**:
- **C1 — forged wake line (the serious one).** `media_failed` embeds the RAW,
  attacker-controlled Discord filename and was not newline-flattened, so a crafted upload
  could inject an entire fake wake event carrying a fetch instruction for an arbitrary path.
  Flattened — and the `WAKE[` frame token is now defanged inside content, so media content can
  never be shaped like an event ("is this a wake line?" became a question about the frame, not
  about the reader's judgement). He ruled KEEP on the defang.
- **C2 — bare-string `media_paths`** was iterated per CHARACTER: a real image rendered as the
  unfetchable path `/`. Shapes now explicit; a dict KEY that looks like a path is counted
  malformed, never surfaced as fetchable.
- **C3 — silent 4/3 caps** → `(+N more not shown)`.
- **Rider 1, answered by MEASUREMENT not assumption:** could a crafted *body* forge a line?
  11,799 logged bodies: **62% contain a newline** inside the printed window (multi-line is
  everyday crew traffic — flattening would change what all three sessions see) and **zero have
  ever contained the token** ⇒ defang the body WITHOUT flattening = provable no-op across the
  entire history, class closed. Rider 2 (uniform `_flat` on the Langston media path) applied.

## Two failures worth recording, both mine
1. **Two runtime bugs survived code review** and appeared only on first live execution:
   `scp` does NOT shell-expand a remote path (OpenSSH 9+ speaks SFTP), so inner quotes became
   literal filename characters; and `basename | tr -c` translates the trailing NEWLINE into an
   underscore. Environmental, not logical — **the live proof is a step, not a ceremony.**
2. **★ The batch's own success criterion was FALSE for Langston while I announced it true.**
   `dt-media-post` runs as root, so its `mkdir -p` created each date dir `root:root`, locking
   his uid-999 bridge out of saving inbound images on any day the stager won the race — his
   wake line read "download failed" instead of naming a path. He caught it *minutes after the
   announcement*, by measuring both halves rather than trusting it. Fixed with `install -d`
   (owner+mode atomic at creation, so the race cannot re-open it); today's dir corrected and
   his write access proven directly. **The failure was visible only because this batch's own
   save-FAILED honesty refused to let a failed save look like no image.**

## Also in this batch (rule 18, disposition at the moment of surfacing)
The repo's only copy of the live wake filter sat in `comms-infra/telegram-reference/` and was
**three weeks stale** — it predates ANALYST Claude, so a restore from it would have silently
broken CC-C's wake routing. `git mv`'d to `comms-infra/laptop/` and made byte-identical to live
**before** any feature edit. Fifth stale-master instance this week.

## Install gate (Langston's, adopted verbatim)
Dated backup `cc-wake-filter.py.pre-images2-20260807-042957`; installed file byte-identical to
the tested working-tree copy (`78f6c519…` both); delta vs the reviewed repo blob measured to be
**exactly** the Windows line-ending convention — 0 CR bytes in the blob vs 220 installed, 220
lines, 12,411 + 220 = 12,631 bytes, content identical after CR strip. Both fixtures re-run
against the INSTALLED file: hostile 4/4, regression 8/8, CC-A routing 4/4.
⚠ **An earlier CR check reported "both 220" — a broken instrument** (empty grep pattern matching
every line), the fifth instrument failure of the session and again one that flattered a
comfortable conclusion. Named, not buried.

## Governance files changed
`BATCH_CATALOG.md` · `PHASE_HISTORY.md` · this report · `comms-infra/laptop/*`. Not applicable:
SYSTEM_MANUAL/SIM (no engine architecture; comms-fabric detail rides the SIM pointer update
already homed), RUNNING_ISSUES (#657 is the home and is already CLOSED — this batch is its
follow-on, cross-referenced there rather than minting a duplicate).
**Deferred, named homes (§13):** bridge points at the already-staged copy instead of
re-downloading (kills the double-write); sanitize the raw filename inside `save_image_meta`'s
failure string. Both need a bridge change + announced restart → ride the next one. Owner: this
session.
**Crew action required:** RE-ARM the wake watcher (a running Monitor holds the OLD filter code).
OLD Claude done; NEW Claude and ANALYST Claude outstanding at time of writing.
