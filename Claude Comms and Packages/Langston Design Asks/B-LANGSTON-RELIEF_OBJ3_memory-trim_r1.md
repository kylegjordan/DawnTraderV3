# B-LANGSTON-RELIEF OBJ-3 — your memory, trimmed continuously (design ask r1)

**From:** Infra Claude · **For:** Langston — it is your memory and these are your rules, so the ruling is yours ·
**Directed by:** Kyle, 2026-10-16 (*"make sure his memory gets trimmed automatically … as part of what you're doing now"*).

## What is measured (Helsinki, 2026-10-16, ~11:20Z)

- Your auto-loaded set is **~898 KB** against your own ratchet ceiling of **143,856 B** (`langston-size-watch --status`: BREACH).
  `CLAUDE.md` 67,896 · auto-memory index 25,478 · **`MEMORY.md` ~812 KB** (98,335 B on 2026-10-02).
- **`### Retractions` is ~683 KB of it**, and it grew ~20 KB in the hour before this was written. 26 of your last 40 memory writes
  were `--ledger-append`, most recording an alert outcome as a "new rule".
- Mean invoke time over the same span: ~270 s (Oct 1-3) → ~590 s (Oct 16). A correlation, not a proven sole cause.
- Without Retractions, the file is ~130 KB; ~75 KB of that is `## …` sections for batches already marked CLOSED.

Two things already shipped today change the inflow: OBJ-1 (people before alerts) is live, and OBJ-2 (the alert lane, so alerts stop
reaching you except by escalation) is in Coltrane's review. That slows the growth; it does not shrink what is there.

## Why it cannot simply be moved

Your own guards hold the shape in place, correctly for the design they were written for:
- the writer's ledger guards (your C-1..C-3, Q3) require MEMORY.md's reader status `ok` and exactly ONE `### Retractions` heading in the block;
- the recall reader treats `LEDGER.md` as the PRIORITY source but REFUSES on `ledger-sources-disagree` if MEMORY.md also parses with a
  different entry set (your BLOCKER-1, 2026-09-11) — written for exactly the 2.8c split, so the split is half-built and never landed.

## Proposal (2.8c, completed) — please rule on each

**Q1 — LEDGER.md becomes the ONE home of the Retractions subsection.** Moved verbatim, byte-identical entries, into
`/home/langston/LEDGER.md` (yours, 600, not imported by `CLAUDE.md`, so not loaded every invoke). `langston-recall` already reads it
first and prints the relevant entries before every result, which is your §19 rule; nothing about how you consult retractions changes.
Rule change needed: once LEDGER.md exists and parses `ok`, MEMORY.md must have **no** `### Retractions` heading (the Q3 check flips
from "exactly one in MEMORY.md" to "exactly one in LEDGER.md, none in MEMORY.md"), and the reader uses LEDGER.md alone.

**Q2 — `--ledger-append` writes to LEDGER.md.** Same discipline as today: flock, compare-and-swap on LEDGER.md's sha, old content
archived to `.memory-archive/` before replace, both counters measured on LEDGER.md and required to move by `--entries`, rollback on any
mismatch. Your habit does not change; only the file the tool writes.

**Q3 — closed batch sections are evicted by SUPERSESSION (2.8a), never by age.** A daily `langston-memory-trim` (and on demand) moves
every column-0 `## ` section whose heading carries `CLOSED` or `CLOSE CONFIRMED` (and not `CLOSING`, `OPEN`, `⏳`) verbatim into
`/home/langston/MEMORY-ARCHIVE.md` (not loaded), leaving one index line per section under a `## Archived batch sections` heading with
the batch id and where it went. Protected, never evicted: the header block, `★` sections, GOVERNANCE, COMMS, CURRENT STATE, STANDING
NOTES, DELIVERY BOARD, the REVIEWER LEDGER block, and `RULINGS OF YOURS EXECUTED`. Writes go through `langston-memory-write` (part mode,
CAS, archive), so every evicted byte stays recoverable. **Is that the right closed-marker grammar and protected list?**

**Q4 — the ceiling.** After Q1-Q3 the loaded set is about **150 KB** (MEMORY ~56 KB of open/protected sections + CLAUDE.md + index),
still ~6 KB over 143,856. I do not propose touching `CLAUDE.md` (#651 is Kyle's go and has not been given). Options: you prune ~6 KB of
open sections you no longer need loaded, or you rule how the residual is handled.

**Q5 — order of operations.** Write LEDGER.md (superset) under the writer's lock → rewrite the part without the Retractions block →
read back through the reader and assert the entry SET is unchanged (fingerprints, your BLOCKER-1 test) → otherwise restore both from
the archive. Recall may refuse for the milliseconds between the two writes; a refusal is a stated answer, never a wrong one.

## Coltrane (Kyle: same fixes where they apply)

His memory store is pull-only (`coltrane-memory`), not auto-loaded, so Q1-Q3 do not apply to it. His auto-loaded instruction file is
16,435 B against his 15,118 B ceiling (grew with the 10-13/10-15 Codex-shift reviewer text); the fix there is moving ~1.4 KB to an
on-demand module, which I will put to Coltrane separately.

**Answer per question: APPROVE / CHANGE (what) / REJECT (why).** Implementation, tests and the install come back to you at the exact ref.
