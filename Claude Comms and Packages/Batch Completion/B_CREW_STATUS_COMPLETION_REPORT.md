# B-CREW-STATUS — completion report
**Owner:** Infra Claude · **change-class:** non_architecture · **Directive:** Kyle, 2026-08-07

> *"With four sessions working on different parts of the system, it is difficult to track who is
> currently working on what, where in that batch they are, what were my last comments to that
> session… it takes me several minutes to get back up to speed."*

## Objectives — met, with evidence
1. **One page, all four sessions.** Local, self-refreshing every 30s. ✔
2. **Four plain-language lines each** (now / next step / next batch / just finished), describing
   the WORK not the label, 1–2 sentences. ✔
3. **"Needs you" at the top**, with the three signals kept SEPARATE per Langston's ruling:
   waiting-on-Langston (exact), unanswered ask to Kyle (checks BOTH Discord and Desktop), and
   the board's own Blocked-on shown as a fact *about the board* with a stale-warning. ✔
4. **Kyle's last directive per session, on the right surface.** Live run: all four resolved from
   **Desktop transcripts** — invisible to any Discord-only watcher, which is the gap that made
   this batch necessary. ✔
5. **Interruption tracking** (Kyle's most substantive addition): the page shows the batch AND
   what pulled the session off it, who is holding it, tagged *inferred from traffic* on both
   surfaces. ✔
6. **Per-session last-CHANGED stamp** — moves only when meaning changes; a 60s poll that
   re-reads identical facts is not activity. ✔
7. **Discord surface without a manual step.** Pinning REMOVED (see below); one message edited in
   place with a permanent URL, plus a separate short message posted ONLY when something NEWLY
   needs Kyle. ✔
8. **Snapshots archived as business data**, hot→warm, deduped so only real changes are written. ✔

## The design constraint, and why it holds
Kyle diagnosed the failure mode of the obvious solution himself: anything requiring four sessions
to remember an extra step will rot, because discipline is the scarce resource. So the job
**derives** state from six artifacts the sessions already emit. **No session does anything
differently.** That is the whole architecture, and every review decision below follows from it.

## Review trail — Langston, invocations #13–#17
Step-1/2 PROCEED-with-revisions → Step-4 **CHANGES-NEEDED (C1–C7)** → single-item bounce on
C4b/C4c → PROCEED → task-definition PROCEED with two riders. He re-verified the two measured
defects **by execution against the full live population** (8,603 log rows, 23 distinct senders)
rather than by reading the diff — and banked a property I had not claimed: `Crew Status` appears
**zero** times in the log the job reads, so the job's output provably cannot become its input.

**His catches that changed the build (not a complete list — the load-bearing ones):**
- **C6, the best of them, which my own R1 analysis missed entirely.** `claude -p` writes its own
  transcript under a cwd-derived slug, and `G--My-Drive` is a mapped session dir *on this
  laptop* — so the summariser's own prompt would have been read back as **"Kyle last said"**,
  with a fresh timestamp that also cleared real unanswered-ask flags. R1 closed the Discord
  self-input door; this was the transcript door. Fixed structurally: the scheduled task pins a
  non-mapped working directory, plus a preamble skip.
- **C1**, measured in the live log: the channel carries **both word orders** (`Claude Analyst`
  ×24 alongside `ANALYST Claude` ×471), and my identity map keyed only one — he found a real
  waiting-on-Langston dispatch being dropped, on the exact field the page exists for.
- **C2**, and my first fix for it did not work: the archive dedupe was dead code, then still
  broken because the summariser ran every cycle and model text is never byte-identical. Root
  cause was that the scope said "summarise only on change" and the build never implemented it.
- **The classification ruling**, which refuted my own argument using my own census: two of six
  sources (board, alert queue) **mutate in place with no history**, so these snapshots are their
  only time-series — business data, not a derived convenience.

## Pinning: removed by design
Two faults were stacked. My poster used `/messages/{id}/pin`, which is not the v10 endpoint
(`/channels/{id}/pins/{msg}` is), so **a 404 of mine masked a real 403**. Measured: neither the
CC bot nor the Langston bot holds `MANAGE_MESSAGES`, and neither can grant it. Kyle ruled the
design: *"a tool that needs me to remember a manual step is a tool I won't use."* Replaced by the
permanent-URL + needs-you-ping pattern, which requires nothing of him at all.

## Named runtime dependencies (Langston rider 1)
The job shells out to **`claude` on PATH — measured 2.1.87**, the stale standalone, not the
2.1.219 the desktop sessions run; and to **`python` on PATH**, the same dependency class one line
above it. Both degrade honestly (an error line every cycle in the task log; "summaries
unavailable" on the page with every exact field still rendering). **Deliberately NOT pinned:** a
per-job pin forks CC-A's lane and would become the lingering survivor when the shared-binary fix
lands. ⚠ **Open:** CC-A's PATH-binary finding is not yet in RUNNING_ISSUES; asked in-channel for
the number rather than minting one in his lane. **This report must cite it before close.**

## ★ Lessons — the pattern that produced every defect in this batch
**INTENDED-AS-DONE.** Four instances in three hours, one taxonomy:
1. An **edit** reported as landed that never matched (C4c — a `.replace()` with no assertion).
2. A **script** that printed success unconditionally without checking the edit applied.
3. A **dispatch** I told Kyle was sent when I had only committed the file.
4. A **registration script** that printed `REGISTERED` before verifying the task existed — and
   did exactly that when the first attempt failed outright.
The distinguishing detail: the patch script using an **asserting** helper landed all 17 of its
edits; every silent miss came from an unasserted replace. **The rule taken from it: an edit that
cannot prove it matched is not an edit, it is an intention — and the proof must be read out of
the ARTIFACT, not the source.** Langston's framing: *"the write-side twin of my read-side rule —
I verify claims at the ref, you verify edits at the artifact."*

**And the second pattern: live proof is a step, not a ceremony.** Five defects ran completely
clean and were only wrong when the OUTPUT was read — reversed commit iteration showing yesterday's
batch, a false positive on the needs-you list within minutes of it existing, Windows pipe
encoding that would have written mojibake into a permanent archive, a CLI that needed the `.cmd`
wrapper, and a 6 KB prompt that had to leave the command line entirely because real Discord text
is full of `& | > %`.

**Also recorded:** I minted a **duplicate issue number** (#665, already CC-C's) and pushed it —
the exact collision the repo runbook names. Renumbered to #670. Notably **not** an isolated
lapse: CC-B hit the same collision **twice within minutes** the same day (#669's own heading
records it). Three sessions, one shared counter, no atomic allocation — surfaced to the crew as
a systemic gap rather than filed as three individual mistakes.

## Governance
`STORAGE_POLICY.md §7.5` (the archive, with the substrate warning: do NOT move this into the
database against #660) · `RUNNING_ISSUES #670` (the cold hand-off, owner + gate) · scope +
pre-audit (revised in body after review, not appended) · board card · this report.
**Kyle's correction folded in:** the archive system already exists OUTSIDE Langston, so the disk
tiers are a **staging post** and the cold hop routes into the existing tier — not a rival system.
