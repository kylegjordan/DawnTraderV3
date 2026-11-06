# B-TRANSCRIPT-ARCHIVE — design r1b (KD-34, design only; KD-46 gate for the shorter-conversation trial)

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
3. **the exact ref, in §5's format** (Langston r1b): *"ref: read `git rev-parse origin/<branch>` and `git rev-parse HEAD` (was `<sha>` / `<sha>` at `<UTC>`)"*, the pointer plus a stamped reading, never a bare value;
4. the next gate and who holds it;
5. dirty state (`git status --porcelain`, any `??` named);
6. the open dispatches, with message ids;
7. the rulings received, with message ids;
8. the evidence paths;
9. the dead ends;
10. pending commitments ("I said I would …");
11. **the archive link**: the archived file and its line range for the conversation just ended;
12. **withdrawn claims** (Langston r1b), a REQUIRED field, explicit `none` if there are none: anything the session PUBLISHED and then withdrew, with the original and the correction. Dead ends (item 9) are approaches that failed; a retraction is a published claim that was overturned. Without it, a recall hits the published version and the next session re-asserts an overturned figure;
13. **open observation windows and pre-registered triggers the session owns**, each with the instrument that fires it, written as "the owner remembers" where that is the truth, or explicit `none`. A restart is exactly the event that kills a trigger whose only carrier was memory (Langston: on B-SILENT-STRATEGY-CENSUS, one of three pre-registered triggers had a carrier that fires);
14. **the active pack** (Coltrane r1): the scope, pre-audit, design or review pack in hand — its **path, the section or gate, and the exact ref** — or an explicit `none`. The brief (item 2) is the ask; the pack is the artifact the work is graded against, and the two are not the same thing.
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
  - **STALE is EVENT-driven** (Langston r1b): any DRIFT leg (the ref moved, the dirty state differs, a new reply arrived on an open dispatch, a new due alert) prints **`STALE (drift) — <the leg>`**. A handoff **older than 12 h with no drift** prints a separate, quieter **`AGED (backstop, no drift found)`**. The two are never printed the same way, so the age arm cannot train people to skip the banner the real drift lines share.
  - **The guard says when it could not look** (Langston r1b): if a leg cannot be read (`git fetch` fails, the inbox is unreachable, the alert read fails), it prints **`GUARD FAILED — <leg> not checked`**. **A missing guard banner is itself treated as STALE**, so a dead hook never renders as all-clear (the 404-as-zero-drift shape).
  - **Discharge** (Langston r1b): `STALE` clears only when the drifted field is re-derived and corrected in a new handoff, **never because the session read the banner**. A self-clear on acknowledgement would be an ack silencing an alarm.
- **The hook also VALIDATES** that the pack path and ref (item 12) and the archive link (item 11) exist and resolve, rather than trusting them.
- **The pilot test (Coltrane's drill, corrected at r1a — the r1 version was circular).** The hook checked only the dispatches the handoff listed, so it could never discover one the handoff OMITTED. The drill therefore plants an **action-changing omission in an independently enumerated population**:
  - **Omission run:** the authoritative source holds **2 open dispatches**, and the handoff records **1 of 2**. The one omitted is the dispatch **holding the next gate** (for example, an unanswered review request that blocks a deploy), with a unique message id; the listed one is the positive control. The hook must derive the 2-message population **independently** (from the inbox log's `cc_outbound` rows for this session since its start, with no later reply addressed to it), report **`MISSING_OPEN_DISPATCH <exact id>`**, and mark the handoff **`STALE/BLOCKED`**.
  - **Stale-ref run, separately:** `origin/<branch>` advances after the handoff is written, and the hook must print the exact old and new shas. **One mutation per run**, so catching the ref cannot hide a failure to catch the omission.
  - **Guard-failure run** (Langston r1b): `git fetch` is made to fail (an unreachable remote in a scratch clone), and the hook must print `GUARD FAILED — ref not checked` and treat the handoff as STALE.
  - **Aged-backstop run** (Langston r1b): a handoff backdated past 12 h with no drift must print `AGED (backstop, no drift found)` and NOT `STALE (drift)`. The pilot's restarts will be hours apart, so the age arm is exercised by this planted handoff or it is dropped, never shipped untested.
  - **A positive control for EVERY leg** (Langston r1b): the alert leg and the dirty-state leg are each shown returning a known-present item (a planted due alert, a planted untracked file), not merely running. The dispatch and ref legs have theirs above.
  - **Each run goes green → planted mutation red for the RIGHT reason → restored green.** Printing some DRIFT line is not a pass. If any leg fails, the trial does not proceed.
- **What a passing hook means (Coltrane):** **"safe to resume and re-derive"**, never "every inherited claim is true". It proves the machine-re-derivable fields only; it cannot prove that judgements, dead ends or promises are complete.
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
- **Langston, r1 position (msg `1568067564578279485`, ruled on r1a at `aeb7b8902`): CONFIRMED, subject to five changes, all folded at r1b.** §7.1's split is right because a REDACTED archive can never be the record, so the raw `.jsonl` must be. §4: withdrawn claims (item 12) and owned observation windows and triggers with their instruments (item 13) added; item 3 put in §5's pointer-plus-reading format. §5: `GUARD FAILED` with a missing banner treated as STALE; STALE event-driven, with the 12 h age arm printed separately as `AGED` and exercised by a planted backdated handoff; a positive control for the alert and dirty-state legs; `STALE` discharged only by a corrected re-derived field, never by reading it. **§7.4: his transcripts are a LATER phase, named, not folded:** his side has no conversation and no restart, so §4 has no subject there; `langston-recall` covers his capture; and his real gap, LEDGER.md not being auto-loaded, belongs with `B-LANGSTON-CLAUDEMD-RESIDUAL`. The unconfirmed Drive backup in §0 is the right form.
- **Coltrane, r1 (cc_outbound 2026-11-05T23:23:44Z, read at `64560d72e`): CONFIRMS the design with one field and the drill changed.** §4 carried 9 of his 10 items; the missing one is the active pack (now item 12). The r1 planted-omission test was circular, because the hook checks only the dispatches the handoff names. His replacement drill (independently enumerated population, 2 dispatches with 1 omitted, the omitted one gate-holding; a separate stale-ref run; one mutation per run; green → red for the right reason → green) is now §5. Also adopted: the hook validates that the pack and archive links resolve, and a pass means "safe to resume and re-derive". **Folded at r1a.**

## 9. Consensus
**REACHED, 2026-11-06 ~01:15Z (r1b): Infra Claude, Coltrane (confirmed r1, his two changes folded at r1a) and Langston (confirmed r1a, his five changes folded at r1b).** The raw `.jsonl` is the record and the archive is a derived, redacted, searchable copy. Capture at restart, at compaction and nightly; it lives outside the repo, backed up to Drive (never the private folder). `dt-recall`: a hit is a lead, a miss is not evidence. The handoff carries 14 fields: Langston's three in pointer form, Coltrane's list, withdrawn claims, owned triggers with their instruments, and the active pack. A `SessionStart` drift guard is event-driven, says `GUARD FAILED` when it cannot look, discharges only on a corrected field, and is proven by a five-run drill (omitted gate-holding dispatch, stale ref, guard failure, aged backstop, and a positive control per leg), each run green, then red for the right reason, then green. **A pass means "safe to resume and re-derive".** Langston's and Coltrane's own transcripts are a later phase. **This consensus is the starting point for the B-TRANSCRIPT-ARCHIVE scope (order 4b, KD-47), with Kyle's 09-29 terms: a one-day sample to him before the full run, and all history kept.**
