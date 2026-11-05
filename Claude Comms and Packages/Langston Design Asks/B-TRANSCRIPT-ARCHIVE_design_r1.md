# B-TRANSCRIPT-ARCHIVE — design r1 (KD-34, design only; KD-46 gate for the shorter-conversation trial)

> Owner: Infra Claude. Deciders: Infra Claude + Langston + Coltrane; PM Claude records. **Design only, nothing is built.** Placement is Kyle's (PM is taking it to him). Inputs: `SPRINT_TO_LIVE_PLAN.md:145` (Kyle 2026-09-29, the archive as asked), `1-system-manual/pm/decisions/2026-11-05_cheaper-helpers-and-short-conversations.md` (the trial and the three positions), and KD-46's condition, in Kyle's words: *"everything a session works on, decides, implements, etc., when it gets removed by a restart, it gets stored somewhere where it can be searched and referenced when needed."*

## 0. What already exists (measured 2026-11-06 ~00:10Z, laptop)
- **A restart removes nothing from disk.** Each conversation is one append-only `.jsonl` under `C:\Users\kyleg\.claude\projects\<slug>\`. A restart starts a new file; compaction trims the live context, never the file (`CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md:12`). The **raw record is already complete**. What is missing is a form you can **read and search**, an **index**, and a **link from each restart's handoff to the conversation it ended**.
- Volume today: analyst 1.6 GB, new 1.6 GB, old 1.2 GB, infra 304 MB, pm 57 MB (`du -sh`, per project folder).
- **The nightly Drive backup of transcripts is UNCONFIRMED.** `CLAUDE.md` §3.1 says conversations are "trimmed and backed up nightly to Google Drive", but the repo's scheduled-task set holds only `transcript-bloat-check` (a biweekly size check), and I found no backup job. **This is not an absence claim:** Step 2 reads the laptop's live scheduled tasks and Drive before saying either way. Kyle's plan row already says "confirm or set up".

## 1. What is captured, and when
**The source is always the raw `.jsonl`** (never re-typed), and the raw files are kept. **The archive is a derived, readable copy**, rebuildable from the raw at any time.
| when | what | why |
|---|---|---|
| **at each restart** (the trial's break point) | the ending conversation is distilled at once, up to its last line, by the restart procedure itself, before the new conversation starts | KD-46: what a restart "removes" from the session's head must be searchable the moment it is gone, not the next morning |
| **at each compaction** (`PreCompact` hook) | the same distill, up to the compaction point | compaction is today's main "forgetting" event and is not a restart |
| **nightly** | every transcript on the laptop, **incrementally** from a stored byte offset per file, plus the raw `.jsonl` to the backup | catches live sessions, crashes, and anything a hook missed (hooks fail open) |
**The readable form** (Kyle's spec, `:145`): one text file per conversation, holding:
- Kyle's messages and the session's replies, timestamped;
- **each ACTION as ONE line**: time · tool · the session's own one-line description · the file edited, commit sha, or command cut to one line · a one-line error when it failed;
- compaction summaries kept whole;
- raw tool output dropped (the raw `.jsonl` keeps it).
**Redaction before anything is written:** base64 blobs, and anything matching the secret patterns (API keys, `sk-ant-…`, B2 keys, bearer tokens, private-key blocks) becomes `[REDACTED <kind>]`. **A transcript has carried a live token before** (Langston's argv catch, 2026-09-01).

## 2. Where it lives
- `C:\Users\kyleg\.claude\transcript-archive\` — **outside every repo**: transcripts carry Kyle's private messages and possibly secrets, and the repo will go private but is still shared. Layout: `<alias>\<YYYY-MM-DD>_<session-id8>.md`, plus `INDEX.md` (one line per conversation: alias, session id, first and last time, size, batches named, first topic line), `ACTIONS.tsv` (every action line, all sessions, so one search spans the crew), and `handoff\<alias>\<UTC>.md` (§4).
- **Backup:** the nightly job copies the archive AND the raw `.jsonl` to a named Drive folder under `G:\My Drive\Dawn Trader\` (**never** the private `Misc\I.T. and Security` folder — Kyle's standing rule). **Duplicates are removed only after the archive is checked** (Kyle's order), and **ALL history is kept**.
- **Reach:** the four laptop sessions read it directly. Langston and Coltrane do not, by design, and the review gates do not need it: they rule off code at a fixed ref. *(Their own transcripts on Helsinki are a separate phase, if wanted.)*

## 3. How a session searches it
One command, `dt-recall`, read-only:
- `dt-recall "<words>" [--alias CC-B] [--since 2026-11-01] [--batch B-X] [--actions]`;
- it returns `file:line`, the timestamp and two lines of context;
- `--actions` searches `ACTIONS.tsv`: "which commit touched `liveness.py`", "when did OLD Claude deploy". Plain text search, no embeddings.
- **The rule that comes with it (Langston, the pack's guardrail): a recall hit is a LEAD, never a fact.** The archive records what a session SAID or DID; current truth is re-read at the ref, in the database, or in the log. **"Not found in the archive" is never evidence** (#453): the archive can lag, and redaction can hide a match.

## 4. The restart handoff, and how it links to the archive
Before any break, the session writes `handoff\<alias>\<UTC>.md`. **Its fields are Langston's three plus Coltrane's list:**
1. **position**: the `STEP: N of 11 · NEXT STEP` line, per batch;
2. **the job's brief**: what Kyle or PM asked, in their words, with the message id;
3. **the exact ref**: branch, `HEAD`, and `origin/<branch>` at the moment of writing;
4. the next gate and who holds it;
5. dirty state (`git status --porcelain`, any `??` named);
6. the open dispatches, with message ids;
7. the rulings received, with message ids;
8. the evidence paths;
9. the dead ends;
10. pending commitments ("I said I would …");
11. **the archive link**: the archived file and its line range for the conversation just ended.
**The new conversation's `SessionStart` hook injects the latest handoff** (the `load-own-memory.mjs` pattern), and the session's own `MEMORY_CC_<X>.md` position block points at it. **Break points (both reviewers): a finished step, never mid-diff, mid-test, mid-deploy or with an unresolved decision.**

## 5. Staleness of written state — the guard
Langston named the real cost: *"stale written state that sounds certain."* So:
- **Every live value in a handoff is written as a POINTER plus a stamped reading:** *"ref: read `git rev-parse origin/migration/aws-supabase` (was `abc123` at 23:10Z)"*. Never the value alone (the shared `MEMORY.md` lesson).
- **The `SessionStart` hook re-derives and prints DRIFT lines** before the session acts:
  - the handoff's `origin` sha against a fresh `git fetch` + `rev-parse`;
  - `HEAD` against the handoff;
  - `git status --porcelain` against the recorded dirty state;
  - each open dispatch, checked in the inbox for a reply since the handoff;
  - the due alerts, from the existing hook.
  - A handoff **older than 12 h**, or with any DRIFT line, is printed as **STALE — re-derive before acting**.
- **The pilot test (Coltrane's drill):** a handoff with a **planted omission** (an open dispatch left out, a stale ref) must be caught by the hook's drift lines on restart. If it is not, the trial does not proceed.
- **Honest limit:** the hook proves the facts it CAN re-derive (git, inbox, alerts). A written judgement ("this approach failed because…") cannot be re-derived, and stays labelled as the earlier session's claim.

## 6. Order of work (for the batch's Step 2 to confirm)
1. Confirm or build the nightly raw backup.
2. Build the distiller and redaction, and show Kyle **a one-day sample before running it over everything** (his rule).
3. The full archive, `INDEX.md`, `ACTIONS.tsv`, and `dt-recall`.
4. The handoff file, the `SessionStart` injection and the drift guard.
5. Hand over to the trial: ONE session at 400k for two weeks, with the restart cost measured (Langston).

## 7. Questions for Langston and Coltrane
1. Is "the raw `.jsonl` is the record, the archive is a derived readable copy" the right split, or should the archive itself be the record?
2. The handoff field list (§4): what is missing, and what would you drop?
3. The staleness guard (§5): is "pointer plus stamped reading, re-derived by the hook, 12 h staleness" enough to make a handoff safe to act on? What would the planted-omission drill need to cover?
4. Should Langston's and Coltrane's own Helsinki transcripts be in scope for this batch, or a later phase?

## 8. Positions
- **Infra Claude (owner), r1:** as written above.
- **Langston:**
- **Coltrane:**

## 9. Consensus
