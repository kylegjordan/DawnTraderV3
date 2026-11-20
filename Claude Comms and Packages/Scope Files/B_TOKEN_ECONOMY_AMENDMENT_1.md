# B-TOKEN-ECONOMY — AMENDMENT 1 (Step 1, scope widened by KD-108)

change-class: non_architecture (unchanged; OBJ-13 touches the alert lane on the Langston box and is cross-checked with Infra Claude at Step 2)

Kyle approved this widening on 2026-11-20 (KD-108, `1-system-manual/pm/DECISIONS.md`). The original objectives OBJ-0 to OBJ-10 stand. OBJ-3 (Codex compaction cap), OBJ-4 (Codex helper roles) and OBJ-6 (Codex alert read) already carry a Codex leg; this amendment makes that parity a rule for every leg.

## Measurements behind it (2026-11-20, PM)
- **Langston, per invoke:** 144,666 B always loaded (`langston-size-watch --status`): CLAUDE.md 57,049 B, MEMORY.md 73,856 B, harness memory index 13,761 B. Every invoke is a fresh `claude -p` on `claude-opus-5[1m]`. Invokes: 74 on 11-15 and 128 on 11-16 (`/var/log/discord-langston-bridge.log`, lines matching "invoking claude (prompt"). About 55 KB is a candidate to move: "Kept lines from closed batches" (22,143 B), the REVIEWER LEDGER (11,862 B, to be compressed to the rulings still live), closed-batch sections (about 8 KB), and mirrors of project rules (sections 5, 13 and 10.5 of his CLAUDE.md). This is a Sonnet helper's read and must be re-derived at Step 2.
- **The alert lane** (`alert_lane.py`, `claude-sonnet-5-5`) loads its own 3,777 B CLAUDE.md, not Langston's files.
- **Helper start load:** the first turns of the last six Sonnet helpers in the PM session read 85,422 to 87,725 cache tokens (`~/.claude/projects/C--DawnTraderV3-pm/994e6488-…/subagents/*.jsonl`, `usage` on the first assistant record). The PM session's own context report puts tool descriptions at about 35k of that (system tools 21,354 plus MCP tools 13,818).

## New objectives

**OBJ-11 — Trim Langston's always-loaded notes, nothing lost.**
- Infra Claude and Langston make the edits; the files are theirs to keep. PM proposes the list.
- Closed-batch material and mirrored rules move verbatim to an on-demand archive, which his CLAUDE.md names as a pointer.
- Write a byte ceiling plus one-in-one-out beside it, in the form CONDUCT uses.
- **Proof:**
  - a move ledger with every moved passage found at its destination;
  - `langston-size-watch` shows the new total and its ceiling;
  - one real review after the trim passes with no missing-rule refusal.

**OBJ-12 — Cut the helper start load.**
- Give the Sonnet `general-purpose` agent definition an explicit, narrow tool list.
- Rewrite the CLAUDE.md delegation rule: a helper is for a big, self-contained read whose answer is short, never for a small lookup.
- **Codex leg:** each `[agents]` role carries minimal instructions and tools.
- **Proof:** the first-turn cache tokens of a new helper, measured the same way as the baseline above, fall below the 85–88k baseline. The served model is still Sonnet.

**OBJ-13 — Alerts routed to one owner by a helper.**
- When an alert is new and has no owner, the alert lane's cheaper-model helper assigns one from:
  - (a) the batch or system the alert names, read against `OPEN_BATCH_REGISTER.md`;
  - (b) the session that most recently committed to the affected code;
  - (c) a fallback owner, agreed at Step 2.
- It records the owner in the existing `[[ALERT … owner=…]]` form, so the OBJ-6 split shows that alert only to its owner.
- An alert is never left unassigned.
- **Proof:**
  - a seeded test alert gets an owner and appears in that session only;
  - a count of currently unowned due alerts goes to zero.

**OBJ-14 — PM's alert role is follow-up, not narration.**
- The PM clone gets no per-prompt alert list.
- On its hourly wake, PM runs one quiet check. It speaks only when a critical alert, or one left unhandled past its window, needs following up. The order of the follow-up is: has the owner received it, then is the owner acting.
- **Proof:**
  - PM prompts carry no alert list;
  - a seeded stale alert produces exactly one PM follow-up to its owner.

**OBJ-15 — Codex and Coltrane parity, mechanism by mechanism.**
- Write a parity table. Each row is one mechanism:
  - compaction cap;
  - always-loaded bytes and byte ceiling;
  - per-prompt alert read;
  - once-per-session warnings;
  - cheaper-model helpers;
  - the stateless reviewer's per-invoke load (Langston ↔ Coltrane);
  - alert routing.
- For each row, give the Claude mechanism, the Codex or Coltrane mechanism, its state, and its proof — or the recorded reason none applies.
- Coltrane's per-invoke load is measured and trimmed under the same rule as OBJ-11.
- **Proof:** the table is at the ref with every row filled. Each Codex/Coltrane row carries an observed control, not documentation.

## Order
OBJ-6 comes first, since OBJ-13 and OBJ-14 build on it. Then OBJ-12, OBJ-11, OBJ-13, OBJ-14. OBJ-15 is filled in as each leg lands.
