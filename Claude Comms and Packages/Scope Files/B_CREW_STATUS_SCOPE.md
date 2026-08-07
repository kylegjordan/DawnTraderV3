# B-CREW-STATUS — one page that answers "who is doing what, and who is waiting on me?"
change-class: non_architecture

**Owner:** Infra Claude · **Directive:** Kyle, 2026-08-07 (Desktop).
> *"With four sessions working on different parts of the system, it is difficult to track who is
> currently working on what, where in that batch they are, what were my last comments to that
> session... it takes me several minutes to get back up to speed."*

> **Revised in body (not appended) after Langston's Step-1/2 review, invocation #13 — PROCEED with
> revisions.** A correction stacked on wrong text propagates the wrong text, so the wrong text is
> gone. What changed and why is recorded in §7.

## 0. The design constraint that decides everything
Kyle named the failure mode of the obvious solution himself: **anything that requires the four
sessions to remember an extra step will rot**, because discipline is the scarce resource (his
words: *"these sessions are not super disciplined"*, and this session proved it twice by skipping
its own Step-1 artifacts). Therefore:

**★ DERIVE THE STATE. NEVER ASK FOR IT.** No session does anything differently. Every input is
an artifact the sessions already emit as a side-effect of work they already do.

## 1. Objectives
1. **One page**, opened from a bookmark, showing all four sessions at a glance.
2. Per session, in **plain language, 1–2 sentences each, describing the WORK not the label**
   (Kyle: enough context to recognise a batch by what was done, not by its id):
   **Now** (+ workflow step) · **Next in this batch** · **Next batch** · **Just finished**.
3. **★ "UNANSWERED ASKS" AT THE TOP** — see §3, which replaces the earlier "blocked flag" wording.
4. **What Kyle last said to each session, and whether they acted since** — including his **Desktop**
   messages (he approved transcript reading 2026-08-07), not only Discord.
5. **Auto-refresh** — Kyle never presses reload.
6. **Discord delivery** for phone: ONE message, edited in place. See §5 on identity — the earlier
   "pinned" assumption did not survive contact with how the channel actually works.
7. **History retained** (Kyle: *"I would like to hold on to these updates"*) — §4.

## 2. Sources (all pre-existing; zero new session effort)
| Source | Gives us | Exactness |
|---|---|---|
| `/var/log/cc-discord-inbox.jsonl` | who said what to whom, when | **exact** |
| Desktop session transcripts (laptop) | Kyle's real directives per session | **exact** |
| `git log` on the review branch | batch id + workflow step | **exact** |
| Delivery board (GitHub Projects) | card status, owner, blocked-on | **exact, but see §3** |
| `system-alerts` queue | alerts owed, per owner | **exact** |
| `BATCH_CATALOG.md` / completion reports | what a finished batch actually DID | **exact** |

**Proven before scoping:** the waiting-on-Langston derivation returned correct answers for all
four sessions against real traffic. **Trap caught pre-build:** one session appears under two names
(`NEW Claude` / `NEW Claude#0000`) — identity must be normalised or every count double-reports.
**Rotation (Langston d1 — an asserted absence needs presence-evidence):** verified 2026-08-07 that
NO logrotate stanza names the inbox log (21 MB, no rotated siblings). That is *no rotation
configured today*, not a guarantee — so the reader handles a shrunk/rotated file rather than
assuming monotonic growth, and says so if it sees one.

## 3. "UNANSWERED ASKS" — the field that must never be confidently wrong (Langston ruling, (c))
The earlier draft called this "blocked on Kyle or Langston" and would have merged three signals of
different quality into one flag. Replaced with three separately-sourced statements:
- **Waiting on Langston — EXACT.** Last dispatch addressed to him with no later reply addressed
  back. Proven on real traffic.
- **Unanswered ask to Kyle — NEAR-EXACT, and it must check BOTH surfaces.** The session's last
  message carries an ask to Kyle and Kyle has not answered **on Discord *or* in that session's
  Desktop transcript**. A Desktop answer that failed to clear the flag would make the page
  confidently wrong within hours — the exact failure this field exists to avoid.
- **Board "Blocked on" — DISPLAYED AS A FACT ABOUT THE BOARD, never merged.** Rendered with
  provenance ("board card says blocked on Kyle, set <date>"). ⚠ The board field is maintained by
  session discipline — the very resource §0 says is scarce — so **it will rot**. Attributed to its
  source, a rotted field is visibly stale; laundered into a unified flag, it is a lie.
- **A model read of traffic: NEVER.** A load-bearing "needs you" must not be model-derived. This
  field is the page's whole reason to exist.
- **★ The empty state states the instrument's reach.** Never "nobody needs you." Instead: *"no
  unanswered asks detected — this sees explicit asks in traffic and board flags; a session waiting
  silently will not appear here."* The silence of an instrument is evidence only within its stated
  reach.

## 4. Retention — BUSINESS DATA, retain-and-tier (Langston ruling, (a))
**The classification is settled and my operational-side argument was refuted by my own census.** I
had argued these are derived, since every input is separately retained. False: **two of the six
sources are mutable with no history** — the delivery board (cards move, single-select fields
overwrite) and the alert queue (ack/resolve mutate in place). A past board state is unrecoverable
from anywhere else, so **these snapshots are the only time-series of those two sources** — a
primary record, before the summaries even enter the argument. `STORAGE_POLICY §5.5`'s own predicate
("a structured record you might re-analyse from → never-drop, tiered") lands them on the business
side independently of Kyle's directive.

- **HOT:** current month, uncompressed, Helsinki + laptop.
- **WARM:** monthly `.jsonl.gz` on Helsinki. ~10 KB × ~50 changes/day ≈ **180 MB/yr raw, ~18 MB/yr
  gzipped**; 54 GB free.
- **COLD:** not built. **Homed in RUNNING_ISSUES with owner (Infra Claude) and gate (the
  credential-placement decision — B2 keys live on staging, not Helsinki)**, per Langston: a named
  follow-up without a numbered home is the open loop §13 exists to close.
- **★ Written INTO `STORAGE_POLICY.md` as a §F-style row**, stating explicitly that its tier
  *substrate* differs from §1 (disk + gz, not Supabase/B2) **so nobody later "fixes" it into the
  database against #660**. An unacknowledged monotonically-growing store is the F.2 failure class
  the policy just documented; this batch does not mint a new instance of it.
- **★ NOT the database.** #660 projects the cap breaching ~2026-09-19.

## 5. Architecture — ONE moving part, and the identity decision made BEFORE code
A single scheduled job **on the laptop** (Windows Scheduled Task — survives session close,
compaction and reboot, unlike an in-session watcher which dies to all three). It pulls Helsinki
facts over ssh, reads local transcripts + board + git, derives the exact fields, calls a small
model **only for the prose lines and only when evidence changed**, then writes the page, updates
the Discord message, and archives the snapshot.

**★ AUTHOR IDENTITY — decided, because the two properties are in tension (Langston e1).** The CC
bridge posts via **webhook** when given a sender name; a webhook message can be edited by webhook
token but **cannot be pinned**, and a bot token **cannot edit a webhook's message**. So
"edited in place *and* pinned via the existing send path" was not achievable as assumed.
**Decision: BOT-AUTHORED**, via a dedicated poster that does *not* route through `cc-send`.
This buys three things at once: edit *and* pin with one credential; the message never passes
through `cc-send`'s `append_inbox`, so **it never enters the log the job itself reads**; and the
existing crew send path is untouched.

**Cadence:** exact facts every **60 s** (Task Scheduler's repetition floor — no sub-minute
attempt); summaries only on change; page self-refreshes every 30 s.
**Honest limit:** laptop off ⇒ nothing updates, so page and Discord message **state their own age**
and go visibly stale rather than quietly wrong.

## 6. Verification criteria
- **★ Feedback-loop proof (Langston R1):** edit the status message with content containing all four
  session names **and a leading "Langston"**, then assert **zero wakes and zero derivation change**.
- The derivation is re-run against traffic that **includes the running job's own messages** — the
  population the shipped code actually reads, not the pre-build population.
- `@everyone` inside a quoted message produces **no ping** (`allowed_mentions: {parse: []}` on the
  create *and* every edit).
- A source that fails to read renders **FAILED**, never empty.
- The needs-you block is never the thing truncated when content is long.
- Kyle's Desktop directive to a session appears in that session's row; a Desktop answer clears the
  unanswered-ask flag.
- A snapshot lands in the archive; the monthly roll-up produces a `.gz`.

## 7. Blast radius, and what the review changed
**Nothing on the trading path.** No app change, no deploy, no bridge change, no CI, no DB. Reads
are read-only. Rollback: stop the task; delete one Discord message.
**Verified, having been challenged:** neither bridge defines an edit handler, so **message edits do
not re-enter the inbound path at all**; and the CC bridge logs *only Kyle's* messages, so a
bot-authored status post is not mirrored into the inbox log. Both were assumptions until measured.
**★ The page is Kyle-facing output, NEVER evidence — no session may cite it** (Langston d2): a
derived artifact quietly becoming a source is the #641 two-sources-of-truth shape, and this one is
mirrored to Helsinki where sessions can find it.
**Credential surface (Langston d3):** the laptop→Helsinki ssh path is a real surface that the
earlier "no new credential" claim did not cover — that claim was scoped to the bot token. If a key
is minted for the task it is read-only and command-restricted where feasible; stated, not glossed.
