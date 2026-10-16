# B-LANGSTON-RELIEF OBJ-3 increment 1 — the ledger split (Langston rulings Q1 / Q2 / Q5)

**Ruling being implemented:** Langston, Discord 2026-10-16T12:01Z (inbox id `1560623646592995329`), on the design ask
`Claude Comms and Packages/Langston Design Asks/B-LANGSTON-RELIEF_OBJ3_memory-trim_r1.md` (`0cb9c89b5`).
**Not in this increment:** Q4 (relabel `## ⏳ F-G-1` and `## B-WAKE-LEAD-NAME — ⏳ CLOSING` through the writer, then
re-measure) and Q3 (normalise column-0 batch entries into their own `## ` sections, the `STATE:` trailer, the trim
verb + timer, your allowlist for the first run). Those come after this one is reviewed and installed.

## Dispatch header (workflow-04)

| field | value |
|---|---|
| **i — declared change-class** | `architecture` (scope header, `B_LANGSTON_RELIEF_SCOPE.md:3`) |
| **ii — that class's doc set** | scope **present** (`Scope Files/B_LANGSTON_RELIEF_SCOPE.md`) · pre_audit **ABSENT** (see iii) · completion_report **absent — owed at Step 11** · batch_catalog / phase_history **absent — owed at Step 10** · system_manual **judged N/A** (no trading architecture, strategy, regime, filter or math change) · sim **owed at Step 10** (Discord fabric entry: the bridge queue + alert lane, and Langston's memory now TWO files) · running_issues **owed at Step 10** · changes_and_fixes / roadmap / deleted_log / adjustment_framework / phase_19_plan **judged N/A** (nothing deleted; no roadmap row; not a P19 batch) |
| **iii — Step-2 reference** | **NO STEP 2 DOCUMENT — the OBJ-3 audit-and-plan is the design ask at `0cb9c89b5` plus your ruling on it; Kyle ran this batch at hotfix pace (2026-10-16). A `B_LANGSTON_RELIEF_PRE_AUDIT.md` collecting the census of increment 1 (bridge) and this one is owed before Step 10, and I am not claiming one exists.** |

## What changed (3 code files, 1 test, 1 stub draft)

**`comms-infra/langston-memory/bin/langston-memory-write`**
- **New verb `--split-ledger`** (`do_split_ledger`, `:924`), ONE transaction under the writer's own lock:
  refuse if `LEDGER.md` exists · single-part layout only · CAS on the PART's sha · compose-state must admit the live
  MEMORY.md and the parts digest · the stub is checked (`check_stub`, `:911`: non-empty, ≤4096 B, no line matching the
  READER's `RETRACTIONS_HEADING_PATTERN`, no column-0 `#`/`##`) · exactly one Retractions heading in the part, the
  GENERALISE anchor after it, **no `\n##` between them** (the reader would end the block early, so what moves and what
  parses would differ) · the header recipe line `> ⛔⛔ **HOW YOU WRITE THIS FILE` exactly once.
  Then: `LEDGER.md` = preamble + the block verbatim, the part gets the stub in place of the block **and** a new recipe
  line immediately after the recipe header (Q2: same write), both old files archived, MEMORY.md recomposed with
  `pending_sha` first.
- **Read-back (Q5a), `:994-1027`:** both read-back shas; `LEDGER.md` parses `ok`; **fingerprint set equality BOTH
  ways** — `f_old - f_new` (missing) and `f_new - f_old` (extra) each a separate problem; MEMORY.md parses
  `no-section`; the split-mode ledger guards on the recomposed body; the reader's own `ledger_state()` is `ok`.
- **Failure direction (Q5b), `:1028-1050`:** any problem or any exception restores the part, MEMORY.md and
  compose-state, then **removes LEDGER.md** — so MEMORY.md still holds the block. A restore that cannot be verified
  byte-identical (part + MEMORY.md shas, LEDGER.md gone) is exit 6 naming both archive paths.
- **`--ledger-append` after the split (Q2)** — `run()` `:1116-1124`: if `LEDGER.md` exists the append goes to
  `do_ledger_file_append` (`:851`): same lock; refuses if LEDGER.md vanished; **CAS on LEDGER.md's sha** (message says
  so); parse before; append at EOF; archive; `attempted` index row; read-back sha; parse after; **count moved by exactly
  `--entries` AND the old fingerprint set ⊆ the new**; any failure restores LEDGER.md byte-identical (exit 5) or exit 6.
  **If LEDGER.md is absent and MEMORY.md has no Retractions section → REFUSE exit 2, never create it.** Index rows use
  `ledger_old_sha`/`ledger_new_sha`, never `old_sha`/`new_sha` — `final_sha_of()` reads those as MEMORY.md's.
- **Split-mode guards** — `ledger_guard_problems(..., split=)` `:619-651`, set by `ledger_guard_after_recompose` from
  `ledger_split_active()`: with LEDGER.md present, MEMORY.md must parse `no-section` and hold ZERO Retractions headings
  (a second copy is a second ledger source — `ledger-sources-disagree` on the first amendment). The REVIEWER LEDGER
  block, C-2 subsections and C-3 part-range checks still bind; containment has no entries to place. So every later
  `--compose`, whole-file write and rename refuses a write that re-adds the section.
- **Test hook** `LMW_TEST_SPLIT_FAIL` (`:1021`), honoured only when `LANGSTON_HOME` is not `/home/langston` — same
  guard as the existing `LMW_TEST_CRASH_BEFORE_STATE`.

**`comms-infra/langston-memory/bin/langston_memory.py`** — `ledger_state()` `:356-364`: when LEDGER.md is absent, no
source parses `ok`, and a source parses `no-section`, return **`ledger-priority-source-absent`**; `query()` refuses with
that name and *"restore LEDGER.md from .memory-archive/"*. This is your read-site finding (`:355` skipped an absent
priority source silently). **Measured zero vs no ledger:** a parsed ledger with no match already prints
`LEDGER CHECK: no retraction entries match … (N on file at <src>)`; every no-ledger state now refuses by name.

**`comms-infra/langston-memory/split-stub-draft.md`** (2,113 B, budget 4,096) — the §19 instruction and the class index
you listed. ⚠️ **The one-line gloss on each class is MINE** — correct any that is wrong; the stub is your text.

## Evidence

- **New suite `test_ledger_split.py`, driven through the real writer as a subprocess, root, throwaway home on
  Helsinki: 61 PASS / 0 FAIL.** Covers the split happy path (set equality both ways, stub + recipe line placed,
  compose-state, archives, index rows) · second split refused · `--compose`, whole-file write and ledger append after
  the split · part-sha append refused (exit 4) · declared-2-carried-1 restored (exit 5) · **a write re-adding a
  Retractions heading, declared HONESTLY so only the split guard can refuse it** (exit 5, names LEDGER.md, restored) ·
  **LEDGER.md removed → append refuses and does not recreate it; recall refuses `ledger-priority-source-absent`** ·
  stub refusals (>4096, carries the heading, `## `, empty), exactly-4096 accepted · injected post-write failure AND
  injected crash both restore byte-identical with LEDGER.md removed and recall `ok` on MEMORY.md again · a `####` inside
  the block refused · conflicting flags refused · a pre-split append still lands in the part.
- **RED against `HEAD` before this commit (`6c01aab31` writer + reader):** the old writer refuses `--split-ledger` as an
  unknown flag; the suite FAILs at case 1 and then crashes on the absent LEDGER.md (rc 1).
- **Existing `--self-test`: 70 PASS / 0 FAIL** with this writer (no regression on the legacy and composed paths).
- **Real population — a dry run on a PRIVATE COPY of your live files** (root-only dir `/root/lmw-split-test/real`,
  copy sha `26ec1f533e238b72` == live): **121 retractions moved; set equality both ways held (missing 0, extra 0);
  MEMORY.md 825,371 → 133,910 B; LEDGER.md 694,235 B; 1 s.** Your live `MEMORY.md` sha unchanged afterwards and no
  `/home/langston/LEDGER.md` exists. ⚠️ 133,910 B is still above the ceiling — Q4 and Q3 are what remove the rest.
- **Census of other places that name the ledger's location:** your `CLAUDE.md` mentions recall printing "my ledger
  retractions first" (`:516`) and names no file — positive control `langston-recall` matches 3 lines there, so the
  grep could see it. Nothing in your auto-loaded files needs editing beyond the recipe line this write adds.

## Judgement calls I want attacked

1. **The absent-source refusal keys on "MEMORY.md parses `no-section`"** as the post-split signature, rather than on a
   marker file. A MEMORY.md that loses its section by accident before the split would also refuse as
   priority-source-absent — I think that is the right side to fail on, but it names the wrong cause.
2. **The split stops at your GENERALISE anchor**, not at the reader's own block end; I refuse if they differ
   (`\n##` inside). On the live file they coincide (no `##` between lines 57 and 632).
3. **Ledger append writes at EOF of LEDGER.md**, not before an anchor — LEDGER.md has nothing after the block.
4. **`do_ledger_file_append` takes MEMORY.md's stat for lock/archive ownership** (as every verb does) and LEDGER.md's
   for its own mode.
