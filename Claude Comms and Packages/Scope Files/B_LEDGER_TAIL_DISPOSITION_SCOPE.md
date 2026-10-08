# B-LEDGER-TAIL-DISPOSITION — SCOPE (Step 1, r1)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1u**, after row 1s · **Issue:** `#1169` · **Placed by:** Langston, `B-CENSUS-OWNERLESS-REMAINDER` Step 2 (§9.4 disposition 3).

## 0. WHY
A `RUNNING_ISSUES` entry can say it is finished in a **trailing cell** — the text after the head line's last ` | ` — while its head still opens `OPEN`. The census reads only the FIRST status word after the number (`census.mjs` `statusWord`, `:117-134`), so such an entry counts as open forever; and the self-contradiction check runs only on entries with NO status head (`parseLedger`, the `if (e.words.has('OPEN') || closed) continue;` guard), so it cannot see that shape — the one it was built for.

**Measured at `b02ad8f6b`** (an ad-hoc read with the census's own `parseLedger` + `statusWord` over the last ` | ` cell of each `OPEN` head line of the 467 `openR1` entries): **29** heads end in a cell starting with a word. **21** of them say `OPEN` (consistent). **3** are not status cells at all — a ` | ` inside quoted code (`#453`, `#487` `pre_audit`; `#480` `grep`). **5 contradict the leading OPEN:** `#395` `RESOLVED (historical; … durable refactor recommended-scheduled)` · `#398` `RESOLVED (P19-B6.9)` · `#396` `PARKED (P19-B6.9 — telemetry-evidence + … re-trigger)` · `#324` `ADDRESSED (checker activated-in-shadow; live-paging gated on the 2 follow-ups below)` · `#569` `REWRITTEN — design question, prior defect claim RETRACTED …`. (Langston counted 3 at `a39ea496f`, the CLOSING-word ones outside row 1s's 48; the wider word set and the later ref account for the rest.)

## 1.a ARCHITECTURAL READ
`census.mjs` `parseLedger` / `statusWord` / the self-contradicting list (`b.selfContradicting`, body line "self-contradicting N", dry-run sub-list). No trading component; System Manual N/A. SIM: the census table's "owner sources" row and its neighbours, if the list's definition changes.

## 1.b PROVENANCE READ
- **`statusWord` — TIER 1.** `B-PLAN-CURRENCY-CHECK` (CLOSED 2026-09-30, mine): R1 = the first word after the number, deliberately simple; the widenings S1 (last status word on the line, within its last 150 characters) and S2 (the next non-blank line) apply only to entries with no status head. Disposition (1) for the rule itself — a first-word rule is right for the head; the trailing cell is a different statement.
- **The self-contradicting detector — TIER 1.** R2-Q7 (a), hand-checked at `c6751f5b3` against a cruder "anywhere on the line" rule; scoped to the head's own STATEMENT (the first bold span) and to no-status-head entries (Step 4 G7-2: "a count of THAT subset — never a ledger-wide figure"). **Disposition (2): relevant, needs updating** — the entries it exists to catch include a shape it cannot reach.
- **The trailing ` | STATUS` cell — TIER 2.** A June 2026 ledger convention (all five above are 2026-06-17 → 07-23 entries) that appended a table-style disposition cell to the head instead of editing the head's status word. INFERRED-FROM-CODE AND LEDGER — no rule defines it.

## 2. OBJECTIVES
| # | objective | check |
|---|---|---|
| **OBJ-1** | Each of the 5 contradicting entries is read and dispositioned with a citation: closed in place (head `✅ CLOSED`, "originally:", a citation line — row 1n's method), kept open with the head made consistent, or homed | a script over the ledger at the close commit: none of the 5 reads `OPEN` in its head while its trailing cell carries a contradicting word |
| **OBJ-2** | The census sees the shape | a new self-contradiction leg: an OPEN-headed entry whose head line's last ` | ` cell begins with a contradicting or disposition word (`CLOSED`, `RESOLVED`, `WITHDRAWN`, `RETRACTED`, `DONE`, `FIXED`, `PARKED`, `ADDRESSED`, `REWRITTEN`, `SUPERSEDED`) is listed, labelled by which leg found it. **Does not change any entry's open/closed status** — it lists; people decide. Tests with a positive control (a planted entry is listed) and the three noise cases (` | ` inside code) not listed. Measured on the live ledger before it ships: 5 at `b02ad8f6b`, expected 0 after OBJ-1. |
| **OBJ-3** | `#395`'s unscheduled follow-up is homed or withdrawn | its tail says "durable refactor recommended-scheduled" and no plan line names it; `setNullReason` is still in `server/` (`git grep` at the ref: `index.ts`, `routes.ts`, `xstock_spot/eval-cycle.ts`) — §9.4: a placed home or a withdrawal with its citation |
| **OBJ-4** | §6 still agrees | `recountS6` diffs `[]` at the close commit |

## 3. JUDGEMENT CALLS
1. **List, never auto-close.** A trailing cell that says RESOLVED is a claim, not proof (`#395`'s says "no live bug" and also "refactor scheduled"); the census surfaces it and a person closes it with a citation.
2. **The noise filter:** a trailing ` | ` inside backticks or a code span is not a cell — the leg ignores a tail whose ` | ` sits inside an open backtick span.
3. `#396` PARKED is legitimately open (a re-trigger on telemetry); OBJ-1 may keep it open by making its head say so (`OPEN — PARKED …`), not close it.

## 4. OUT OF SCOPE
The 21 consistent `OPEN` tails; any change to R1/S1/S2 open-status rules; fixing `setNullReason` itself (OBJ-3 homes it).

## 5. OBSERVATION
None — graded at the close commit; the W42 census confirms independently.
