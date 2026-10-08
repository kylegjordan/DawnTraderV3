# B-LEDGER-TAIL-DISPOSITION — SCOPE (Step 1, r2 — r1 `8d66c1fb6` SENT BACK by Langston 2026-10-08: one blocker, three conditions, folded below)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1u**, after row 1s · **Issue:** `#1169` · **Placed by:** Langston, `B-CENSUS-OWNERLESS-REMAINDER` Step 2 (§9.4 disposition 3).

## 0. WHY
A `RUNNING_ISSUES` entry can say it is finished in a **trailing cell** — the text after the head line's last ` | ` — while its head still opens `OPEN`. The census reads only the FIRST status word after the number (`census.mjs` `statusWord`, `:117-134`), so such an entry counts as open forever; and the self-contradiction check runs only on entries with NO status head (`parseLedger`, `census.mjs:169`: `if (e.words.has('OPEN') || closed) continue;`), so it cannot see that shape — the one it was built for. (`selfContradicting` is **0** at `8d66c1fb6`, Langston.)

**Measured at `b02ad8f6b`** (an ad-hoc read with the census's own `parseLedger` + `statusWord` over the last ` | ` cell of each `OPEN` head line of the 467 `openR1` entries): **29** heads end in a cell starting with a word. **21** of them say `OPEN` (consistent). **3** are not status cells at all — a ` | ` inside quoted code (`#453`, `#487` `pre_audit`; `#480` `grep`). **5 carry a word other than OPEN:** `#395` `RESOLVED (historical; … durable refactor recommended-scheduled)` · `#398` `RESOLVED (P19-B6.9)` · `#396` `PARKED (P19-B6.9 — telemetry-evidence + … re-trigger)` · `#324` `ADDRESSED (checker activated-in-shadow; live-paging gated on the 2 follow-ups below)` · `#569` `REWRITTEN — design question, prior defect claim RETRACTED …`. **⛔ ONLY TWO OF THE FIVE ARE CONTRADICTIONS (Langston, BLOCKER-1, read all five tails):** `#395` and `#398` say RESOLVED. `#396`'s tail says it re-triggers on telemetry and `#324`'s says live-paging is still gated — both open by their own words; `#569`'s `REWRITTEN` is an edit to the entry, not a disposition of the issue (the live off-hours design question Kyle ruled on 2026-09-03). The three words r1 added (PARKED, ADDRESSED, REWRITTEN) were exactly the three that are not contradictions. **The set this batch delivers is {`#395`, `#398`}** (plan row 1u's `#396` is open by its own words and is not touched).

## 1.a ARCHITECTURAL READ
`census.mjs` `parseLedger` / `statusWord` / the self-contradicting list. **Reach, as a property of the code (Langston):** `selfContradicting` reaches only the census record, the body line and the dry-run sub-list (`census.mjs:603`, `:622`, `:637`, `:678`, `:829`); nothing gates, closes or pages on it. No trading component; System Manual N/A. SIM: the census table's "owner sources" row and its neighbours, if the list's definition changes.

## 1.b PROVENANCE READ
- **`statusWord` — TIER 1.** `B-PLAN-CURRENCY-CHECK` (CLOSED 2026-09-30, mine): R1 = the first word after the number, deliberately simple; the widenings S1 (last status word on the line, within its last 150 characters) and S2 (the next non-blank line) apply only to entries with no status head. Disposition (1) for the rule itself — a first-word rule is right for the head; the trailing cell is a different statement.
- **The self-contradicting detector — TIER 1.** R2-Q7 (a), hand-checked at `c6751f5b3` against a cruder "anywhere on the line" rule; scoped to the head's own STATEMENT (the first bold span) and to no-status-head entries (Step 4 G7-2: "a count of THAT subset — never a ledger-wide figure"). **Disposition (2): relevant, needs updating** — the entries it exists to catch include a shape it cannot reach.
- **The trailing ` | STATUS` cell — TIER 2.** A June 2026 ledger convention (all five above are 2026-06-17 → 07-23 entries) that appended a table-style disposition cell to the head instead of editing the head's status word. INFERRED-FROM-CODE AND LEDGER — no rule defines it.

## 2. OBJECTIVES
| # | objective | check |
|---|---|---|
| **OBJ-1** | `#395` and `#398` are read and dispositioned with a citation — closed in place (head `✅ CLOSED`, "originally:", a citation line — row 1n's method) or, if the reading finds them still live, the head made consistent and the tail corrected | a script over the ledger at the close commit: neither reads `OPEN` in its head while its trailing cell begins with a `CONTRADICTS` word |
| **OBJ-2** | The census sees the shape | a new leg of the self-contradiction list: an entry with an `OPEN` head (status word) whose head line's last ` \| ` cell begins — `statusWord(cell)` — with a word in the file's existing `CONTRADICTS` set (`census.mjs:109`; no second vocabulary). The leg's loop sits **BEFORE** the `:169` `continue` (it must visit OPEN-headed entries, which that guard skips). Listed with `reason: "trailing cell …"` so the two legs are distinguishable. **Lists; never changes an entry's status.** A tail whose last ` \| ` sits inside an open backtick span (odd backtick count before it) is not a cell. **Tests:** a planted **OPEN-headed** entry with `\| RESOLVED (…)` is listed (Langston C1 — a no-status-head plant would list through the old leg and prove nothing); a planted OPEN-headed entry whose code span holds ` \| RESOLVED` is **not** listed, and is listed when the filter is deleted (C2 — the three live noise tails statusWord to PRE/PRE/GREP and cannot exercise it); `\| PARKED …` and `\| OPEN …` tails not listed. **Measured on the live ledger before it ships:** `{#395, #398}` at `8d66c1fb6`; 0 after OBJ-1. |
| **OBJ-3** | `#395`'s unscheduled follow-up is homed or withdrawn | its tail says "durable refactor recommended-scheduled"; no plan line names it (Langston, positive-controlled: 0 hits for `setNullReason` in the live plans, `#395` hits row 1u). **The size of what would be homed (C3, re-derived):** `git grep -w setNullReason 8d66c1fb6 -- server` = **179 lines in 19 files** — `strategy-engine.ts` 46, `vts-runner.ts` 18, eleven strategy files 8-15 each, `index.ts`, `routes.ts`. (r1 named three files from an unanchored grep; `xstock_spot/eval-cycle.ts` has none — it matched `resetNullReason`.) §9.4: a placed home or a withdrawal with its citation. |
| **OBJ-4** | §6 still agrees | `recountS6` diffs `[]` at the close commit |

**Not this batch, named (Langston):** a head that does not ECHO its tail's disposition (`#396` PARKED, `#324` ADDRESSED, `#569` REWRITTEN) is a tidiness class, not a contradiction; mixing it into the same list would put a legitimate judgement and a missed obligation in one cell. Not listed, not edited here.

## 3. JUDGEMENT CALLS
1. **List, never auto-close** — and already true of the list in code (§1.a reach). A trailing cell that says RESOLVED is a claim, not proof (`#395`'s says "no live bug" and also "refactor scheduled"); the census surfaces it and a person closes it with a citation.
2. **The noise filter:** a trailing ` | ` inside backticks or a code span is not a cell — the leg ignores a tail whose ` | ` sits inside an open backtick span.
3. ~~`#396` kept open with a consistent head~~ — dissolved: under `CONTRADICTS` it is never listed, and it is not touched (Langston).

## 4. OUT OF SCOPE
The 21 consistent `OPEN` tails; any change to R1/S1/S2 open-status rules; fixing `setNullReason` itself (OBJ-3 homes it).

## 5. OBSERVATION
None — graded at the close commit; the W42 census confirms independently.
