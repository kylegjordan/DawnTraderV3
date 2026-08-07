# B-CREW-STATUS — one page that answers "who is doing what, and who is waiting on me?"
change-class: non_architecture

**Owner:** Infra Claude · **Directive:** Kyle, 2026-08-07 (Desktop).
> *"With four sessions working on different parts of the system, it is difficult to track who is
> currently working on what, where in that batch they are, what were my last comments to that
> session... it takes me several minutes to get back up to speed."*

## 0. The design constraint that decides everything
Kyle named the failure mode of the obvious solution himself: **anything that requires the four
sessions to remember an extra step will rot**, because discipline is the scarce resource (his
words: *"these sessions are not super disciplined"*, and this session proved it twice tonight by
skipping its own Step-1 artifacts). Therefore:

**★ DERIVE THE STATE. NEVER ASK FOR IT.** No session does anything differently. Every input is
an artifact the sessions already emit as a side-effect of work they already do.

## 1. Objectives
1. **One page**, opened from a bookmark, showing all four sessions at a glance.
2. Per session, in **plain language, 1–2 sentences each, describing the WORK not the label**
   (Kyle: enough context to recognise a batch by what was done, not by its id):
   - **Now:** what they are working on + which workflow step.
   - **Next in this batch:** the next step.
   - **Next batch:** what they pick up when this closes.
   - **Just finished:** one line on the previous batch, for historical context.
3. **★ BLOCKED FLAG:** is this session holding for **Kyle** or for **Langston**? A "needs you"
   list sits at the TOP of the page — the answer to *who do I need to talk to* must be the first
   thing visible, not something Kyle assembles.
4. **What Kyle last said to that session, and whether they have acted since** — including his
   **Desktop** messages (he approved transcript reading 2026-08-07), not only Discord.
5. **Auto-refresh** — Kyle never presses reload.
6. **Discord delivery** for phone: ONE message, EDITED IN PLACE and pinned. Not a growing thread.
7. **History retained** (Kyle: *"I would like to hold on to these updates"*) — see §4.

## 2. Sources (all pre-existing; zero new session effort)
| Source | Gives us | Exactness |
|---|---|---|
| `/var/log/cc-discord-inbox.jsonl` | who said what to whom, when | **exact** |
| Desktop session transcripts (laptop) | Kyle's real directives per session | **exact** |
| `git log` on the review branch | batch id + workflow step (commit subjects carry both) | **exact** |
| Delivery board (GitHub Projects) | card status, owner, blocked-on | **exact** |
| `system-alerts` queue | alerts owed, per owner | **exact** |
| `BATCH_CATALOG.md` / completion reports | what a finished batch actually DID | **exact** |

**Proven before scoping, not assumed:** the waiting-on-Langston derivation (last dispatch to him
with no later reply addressed back) was run against real traffic and returned correct answers for
all four sessions. Also caught pre-build: the same session appears under two names in the log
(`NEW Claude` vs `NEW Claude#0000`) — identity must be normalised or every count double-reports.

## 3. Architecture — ONE moving part
A single scheduled job **on the laptop** (Windows Scheduled Task, same vehicle as the existing
nightly Drive backup — survives session close, compaction, and reboot, unlike an in-session
watcher which dies with all three):
1. Pulls the Helsinki-side facts over ssh (Discord log, alert queue).
2. Reads local Desktop transcripts + the board + git.
3. Normalises identity, derives the exact facts.
4. Calls a **small cheap model** to write the plain-language lines — only when the underlying
   evidence CHANGED (an idle session costs nothing).
5. Writes the HTML page locally + updates the pinned Discord message + archives the snapshot.

**Cadence:** exact facts every **60 s**; summaries only on change; page self-refreshes every 30 s.
**Honest limit:** when the laptop is off, nothing updates — so the page and the Discord message
both **state their own age**, and go visibly stale rather than quietly wrong.

## 4. Retention (Kyle-directed) — and the §5.5 question for Langston
Snapshots are appended as JSONL (one record per change), mirrored to Helsinki for durability:
- **HOT:** current month, uncompressed, on Helsinki + laptop.
- **WARM:** monthly `.jsonl.gz` on Helsinki. Measured estimate: ~10 KB × ~50 changes/day ≈
  **180 MB/yr raw, ~18 MB/yr gzipped**; Helsinki has 54 GB free.
- **COLD:** ⚠ **NOT BUILT — named follow-up.** `STORAGE_POLICY §4` puts cold in Backblaze B2, but
  the credentials live on **staging**, not Helsinki, so genuine cold archival means extending
  crew credential infrastructure — not mine to do unilaterally. Owner: Infra Claude; gate: a
  Kyle/crew decision on credential placement. **At the measured volume this is a policy-conformance
  item, not a capacity risk** (warm-on-disk has a multi-decade horizon at this size).
- **★ EXPLICITLY NOT the database.** `#660` projects the Supabase cap breaching ~2026-09-19; adding
  a table there now, however small, works against the session fighting that.
- **★ QUESTION FOR LANGSTON (§5.5):** the policy's one deliberate exception is that *operational
  process logs* are rotate-and-discard while *business data* is tiered. Which are these? My read:
  the snapshots are **derived** (every input is separately retained), which argues "operational" —
  **but** the plain-language summaries are synthesised artifacts that cannot be re-derived
  identically later (different model, aged sources), which argues they are a genuine record.
  I lean retain-and-tier per Kyle's explicit instruction; I want your ruling on the classification
  so the policy stays coherent rather than quietly gaining an unclassified third category.

## 5. Verification criteria
- The blocked-flag is **correct on real traffic** for all four sessions, checked against the raw
  evidence by hand at least once.
- A source that fails to read renders **FAILED**, never empty (an absence and an unread source
  must never look alike).
- Every claim on the page carries its evidence + timestamp; exact facts are visually distinct
  from model-written summaries.
- Kyle's Desktop directive to a session appears in that session's row.
- The page updates without a manual refresh; the Discord message EDITS rather than re-posts.
- A snapshot lands in the archive; the monthly roll-up produces a `.gz`.

## 6. Blast radius
**Nothing on the trading path.** No app change, no staging deploy, no bridge change, no CI
dependency. Reads are read-only. The single write to shared infrastructure is one Discord message
(created once, then edited). The laptop job is independently killable and its absence degrades to
a stale-but-labelled page. Rollback: stop the scheduled task; delete one Discord message.
