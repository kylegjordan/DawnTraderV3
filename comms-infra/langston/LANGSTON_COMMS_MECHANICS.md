# Langston — communication mechanics (read on demand)

> Moved word for word out of `LANGSTON_CLAUDE.md` §5.1–§5.3 by B-TOKEN-ECONOMY amd-1 P2, from ref 1e22a5d6e5df7f187da4b9e546f053d30f00f599. That file keeps the escalation criteria, the stateless boundary, the Telegram-decommissioned block and the dead alert-log line (§5.3 item 2), plus a pointer here. Section references (§N) below are to `LANGSTON_CLAUDE.md`. Each block's title line is added for findability; the text between the title and the closing marker is the moved passage, checked by `scripts/crew-tooling/move-ledger-check.mjs --ledger "Claude Comms and Packages/Change Lists/B_TOKEN_ECONOMY_AMD1_P2_MOVE_LEDGER.json" --dupes`. §5.3 is split into two blocks because its item 2 stayed loaded.

<!-- P2-MOVED id=P2C1 -->
### 5.1 Large-content protocol — FILE-FIRST, never shorten content (Kyle directive 2026-05-08)

When Claude Code sends you a substantive design ask, scope draft, diff review, or multi-question request, the full content arrives as a **staged file**, referenced from the Discord post — because you are stateless per-invoke and Discord messages get truncated at relay for long bodies. The fix is content-on-disk, not content-cutting.

**What you do when a dispatch points at a file:**

1. Use the **Read tool** to load it. **Preferred location: `/home/langston/inbox/<batch>/` (local disk, fast).** A gdrive-mount path (`/mnt/gdrive/...`) also works but can hang when the mount wedges (§18) — prefer inbox staging.
2. Process the full content — Q1, Q2, ... QN, all of it. NO size cap on what you read.
3. Reply normally in-channel (your Discord reply posts automatically).

**Why NEVER ask Claude Code to shorten the ask:** when content gets cut, details get missed, architectural decisions get rushed, scope gets contaminated. Cutting content is a patch (against CLAUDE.md §8 #11 NO PATCHES); reading from disk is the proper solution.

**Canonical committed home:** `Claude Comms and Packages/Langston Design Asks/<batch-id>_<topic>_<rev>.md` in the DawnTrader repo (committed = reviewable + versioned), staged to your inbox for the actual read.
<!-- /P2-MOVED id=P2C1 -->

<!-- P2-MOVED id=P2C2 -->
### 5.2 Voice notes

A voice note in `#general` is transcribed on the box; if it names you it arrives as your prompt like text. A failure appears in the inbox log as a `*_voice_failed` row.
<!-- /P2-MOVED id=P2C2 -->

<!-- P2-MOVED id=P2C3 -->
### 5.3 Waking the CC sessions — wake channel + name routing (Kyle directive 2026-06-11/12; Discord model) — intro and item 1

Each OPEN CC desktop session runs a watcher that wakes it on:

1. **Your Discord replies** — the watcher tails `/var/log/cc-discord-inbox.jsonl`, and your bridge auto-leads every reply with the addressee's name, so naming "OLD Claude" / "NEW Claude" in your post IS the wake. The normal path.
<!-- /P2-MOVED id=P2C3 -->

<!-- P2-MOVED id=P2C4 -->
### 5.3 Waking the CC sessions — wake channel + name routing (Kyle directive 2026-06-11/12; Discord model) — item 3, name routing, limitation

3. **The wake file** (backup summon): `echo "OLD Claude: <reason + file pointer>" >> /var/log/cc-wake.log`.

**Name routing (`#1241`):** a session's post wakes only the sessions in its opening list; Kyle's post wakes any he names, all if none. Bindings are permanent, in `.claude/cc-session-roster.json`; names never transfer without Kyle.

**Limitation:** only OPEN desktop sessions wake. No response in ~10 min → assume it is closed; your post stays in `#general` and the session reads the inbox at its next start.
<!-- /P2-MOVED id=P2C4 -->
