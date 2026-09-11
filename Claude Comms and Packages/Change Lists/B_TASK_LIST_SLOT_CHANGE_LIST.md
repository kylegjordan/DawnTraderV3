# B-TASK-LIST-SLOT — STEP 4 CHANGE LIST (P1 checker code, plus the P3/P4 documents)

**change-class: non_architecture · owner CC-A · `#1009` · plan row 4.57**
**READY AT: `18a8b29b6`** (the r4 matcher). Pre-audit r3 `3144f1141`.
**Code history:** `83fb5c47f` P1 → `0b2e396aa` test gap → `e2e715980` r2 (reader r1's six) → `33b62ee16` P3/P4 documents → `ad38011f2` r3 (reader r2's ten, plus a real-row regression the preview caught) → **`18a8b29b6` r4 (reader r3's four).**
⚠️ **READER ROUNDS ARE CAPPED AT THREE, AND THE r4 CORRECTIONS ARE THE ONE PIECE NO FRESH READER HAS SEEN.** They are listed in §4's round record; you are their first reader.

---

## ⛔ 0. THE DEPLOY FACT, FIRST — THE CHECKER WAS LIVE BEFORE THIS REVIEW

The staging governance checker is not deployed by `dt-deploy`: its unit carries `ExecStartPre=-/usr/bin/git -C /opt/governance-checker/DawnTraderV3 merge --ff-only origin/migration/aws-supabase`. **Every push to the review branch is live at the next 30-minute tick.** I learned this after pushing `83fb5c47f`. What had been done before that push: suite green, alert set pre-registered offline. **If you rule a defect, the revert is a push and goes live the same way.**

## 1. WHAT THE LIVE TICKS HAVE SHOWN

| tick (UTC) | code | result |
|---|---|---|
| 13:45:41 | `2cb78e9a0` (P1) | `opened=2` — **exactly the two pre-registered alerts** (`B-DRIFT-RUNTIME-PREDICATE`, `B-EXIT-BOOK-AGE-STAMP`), nothing else |
| 14:08 | — | CC-C added the row to its report (`ca842c27b`) and resolved its alert citing that commit |
| 14:15:41 | `6b3248a69` (P1) | `opened=1` — CC-C's real row graded present; mine still missing |
| 15:15 | `18a8b29b6` (r4) | **RESOLVED BY THE CHECKER ITSELF** — `opened=0`, alert `8ff33397` `resolved_by_claimed=governance-checker` at `15:15:51Z` with evidence `18a8b29b6`; no ledger-row keys left open. **The resolve path is verified live, on the r4 matcher.** |

## 2. FILES

| file | change |
|---|---|
| `scripts/governance-checker/config.mjs` | `LEDGER_ROWS.task_lists` — `names: /session[\s_-]*task[\s_-]*lists?/i` (matched on de-marked text), `sinceMs` `2026-09-05T05:45:00Z` (`bfdd1197f`), not env-overridable |
| `scripts/governance-checker/checker.mjs` | `ledgerRowInText` (pure) · `checkLedgerRows(batchId, io)` with injectable readers · the inherited batch-id edge stated |
| `scripts/governance-checker/poller.mjs` | `decideAlerts` block 3b · `decideOrphanSweep` ledger branch (default KEEP) · `makeVerifyLedgerRow`, used by `tick` |
| `scripts/governance-checker/poller.test.mjs` | S1-S6 · S3b · R1-R9 · Q1-Q14 · Z1-Z9 · CLR1-7 · VLR1-5; a no-rows stub at the pre-existing completion-report tests. **95 → 158 passed, 0 failed** |
| `scripts/governance-checker/ledger-rows-preview.mjs` | NEW — offline replica of the tick's enrolment steps only, no alert IO; not loaded by the poller |
| `scripts/governance-checker/README.md` | documents `gov-ledgerrow` |

## 3. THE MATCHER AT r4

```js
// config.mjs: names: /session[\s_-]*task[\s_-]*lists?/i
const LEDGER_TOKEN = /^(✅|N\/A|❌)/i;
const TIER_CELL = /^T1\b/i;
const nameText = (s) => s.replace(/[*`]/g, '').replace(/\u00a0/g, ' ');
export function ledgerRowInText(text, spec) {
  if (typeof text !== 'string') return false;
  let fence = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len && f[2].trim() === '') fence = null;
      continue;
    }
    if (f && !(f[1][0] === '`' && f[2].includes('`'))) { fence = { ch: f[1][0], len: f[1].length }; continue; }
    const body = line.replace(/^ {0,3}(> ?)+/, '');
    if (!/^ {0,3}\|/.test(body) || !spec.names.test(nameText(body))) continue;
    const rawCells = body.split('|').slice(1);
    const cells = rawCells.map((c) => c.replace(/[*`_\[\]★⭐]/g, '').trim());
    if (!TIER_CELL.test(cells[0] || '')) continue;
    const nameIdx = rawCells.findIndex((c) => spec.names.test(nameText(c)));
    const verdicts = cells.filter((c, i) => !(i === nameIdx && i <= 1) && LEDGER_TOKEN.test(c));
    if (verdicts.length && verdicts[0].startsWith('❌')) continue;
    if (verdicts.some((c) => c.split(/[\/·,;]/).some((seg) => seg.trim().startsWith('✅')))) return true;
  }
  return false;
}
```
**In words:** a ledger row is a table line (blockquote allowed) outside a CommonMark fence, naming the task lists (matched with `*` and `` ` `` removed) and whose **first** cell is the `T1` tier marker. Its verdict cells are the cells leading with `✅`, `N/A` or `❌`, except a naming cell in the document position (cell 0 or 1). It passes when the **first** verdict cell does not lead with `❌` and some verdict cell has a segment (split on `/ · , ;`) beginning with `✅`.

`checkLedgerRows`, block 3b, the orphan branch and `makeVerifyLedgerRow` are unchanged since `e2e715980`:
```js
export function checkLedgerRows(batchId, io = { findGlobDoc, completionReportCommitTime, showFile }) {
  const out = {};
  const reports = io.findGlobDoc(batchId, 'completion_report');
  const addedMs = reports.length ? io.completionReportCommitTime(batchId) : null;
  for (const [row, spec] of Object.entries(LEDGER_ROWS)) {
    if (addedMs === null || addedMs < spec.sinceMs) { out[row] = null; continue; }
    out[row] = reports.some((p) => ledgerRowInText(io.showFile(gitPath(p)), spec));
  }
  return out;
}
// decideAlerts, inside `if (s.hasCompletionReport)`:
      const rows = (opts.ledgerRowCheck || checkLedgerRows)(s.batchId);
      for (const [row, graded] of Object.entries(rows)) {
        const key = `gov-ledgerrow:${s.batchId}:${row}`;
        if (graded !== false || na.has(`${s.batchId}:${row}`)) { toResolveKeys.push(key); continue; }
        toOpen.push({ dedupeKey: key, severity: sev('warning'), title: …, body: … });
      }
export function makeVerifyLedgerRow(naConfirmed, check = checkLedgerRows) {
  return (bid, row) => check(bid)[row] !== false || naConfirmed.has(`${bid}:${row}`);
}
```
**Why the orphan branch is in scope:** the §9.5(a) census of who RESOLVES a checker alert found `decideOrphanSweep` handles only `gov-docgap:` and `gov-classundeclared:` — a ledger-row alert on a batch that left the 300-commit window would never resolve.

## 4. VERIFICATION

- **Suite:** 95 before the batch → **158 passed, 0 failed**. **Backtest `OBJ-11 GATE: PASS`.**
- **REAL POPULATION — every completion report the check grades today** (`ledger-rows-preview.mjs`, box cutoff, at `bf11b34e9` with the r4 matcher): `B-CANONICAL-BRIDGE-CHURN` pass · `B-DEPLOY-DRIFT-LINE` pass · `B-DRIFT-RUNTIME-PREDICATE` pass · `B-EXIT-BOOK-AGE-STAMP` pass → **would alert on none.** Reader r3 independently confirmed these are the only four reports naming the task lists, and that the last two reports before the cutoff also use `| T1 |` rows. ⚠️ **This preview is what caught the first r3 draft:** excluding EVERY cell that names the row made CC-C's real row (`B_EXIT_BOOK_AGE_STAMP:90`) alert. That exact line is test Q14.
- **Mutants — fourteen, each restored after, each caught:**

| mutant | caught by |
|---|---|
| tier marker allowed in any cell (the r3 behaviour) | Z1, Z2 |
| tier requirement removed | Q9, Z1, Z2 |
| name exclusion at any position (the r3 behaviour) | Z3 |
| name exclusion removed | Q1, Q13 |
| ❌ veto from any cell (the r3 behaviour) | Z9 |
| ❌ veto removed | R2 |
| separators back to `/` only | Z7 |
| names matched on raw, marked-up text | Z4, Z5 |
| segment rule → any ✅ in the cell | Q4 |
| blockquote strip removed | Q10 |
| fence close ignores character | Q7 |
| fence close ignores length | Q12 |
| backtick info-string rule removed | Q5 |
| date gate always "not graded" | CLR3-7 |

- **CI, per job:** `34604340172` at `83fb5c47f` and `34612270970` at `33b62ee16` — TypeScript Check · Test Suite · Build · Docker Build all `success`. At `18a8b29b6`: `34614216848` — all four `success`, per job. *(`34613283216` at `6a866fb62` was cancelled by a newer push, not failed.)* ⚠️ **CI does not run `poller.test.mjs`** (no job, no `package.json` script) — it runs by hand.
- **Fresh-context readers — the round record:**
  `REVIEWER r1: object (code at 0b2e396aa + change list) · what makes the code do other than claimed · six matcher misjudgements, checkLedgerRows and tick wiring untested, "replicates tick exactly" overstated · re-derived y (6 of 6 reproduced) — fixed at e2e715980`
  `REVIEWER r2: object (code at 33b62ee16 + change list) · same question, excluding r1's items · all four real rows correct; ten further shapes misjudged (name cell as verdict, ❌ rescued within a cell, fence edge cases, objectives row using the words, blockquoted table), "verdict cell" and "every report" wording not matching the code, inherited batch-id filename edge · re-derived y (10 of 10 reproduced) — fixed at ad38011f2; unclosed-fence case kept as a deliberate FAIL (CommonMark renders it as code)`
  `REVIEWER r3 (final, cap): object (code at ad38011f2 + change list) · same question · all four real reports correct and the only four naming the lists; ONE PASS WITH THE ROW ABSENT (T1 accepted at the start of any cell, so an objectives row with a "T1 …" notes cell passed); three correct-looking shapes alerted (document cell without "session" + verdict naming the filename; markup or NBSP inside the name; "·" separator, "★ ✅", a later "❌ none outstanding" notes cell); §5 item 5's "removing a row clears its alerts" is only half true · re-derived: the code paths read at the ref and each shape written as a failing test before the fix — fixed at 18a8b29b6, NOT re-read by a fresh reader (cap)`

## 5. JUDGEMENT CALLS — ATTACK THESE

1. **The `T1` tier marker is REQUIRED, and must be the FIRST cell.** It is what separates the ledger row from an objectives row naming the lists; all four real rows, and the last two before the cutoff, put it first. A ledger written without a tier column now alerts. The skill template has the column.
2. **Name match** `session task list(s)` (separator, markup and NBSP tolerant) or the `_SESSION_TASK_LIST` filename somewhere in the row. A row saying only "four task lists" with no filename anywhere alerts.
3. **Verdict tokens are ✅, N/A, ❌ only** (a leading ★/⭐ is stripped). ✓, ☑, `[x]`, "yes" and `⚠️ ✅ partial` alert — deliberate; workflow-10 defines two tokens. Say if you want synonyms.
4. **An unclosed fence hides every row after it** — deliberate, because that is how the report renders. Reader r3: a fence opened at ≤3 spaces and closed at ≥4 spaces (nested list) never closes; none of the 314 reports at the ref ends with a fence open.
5. **`null` resolves** (a report predating the row owes nothing). ⚠️ **CORRECTED (reader r3): removing a row from `LEDGER_ROWS` does NOT clear its open alerts for batches still in the window** — `decideAlerts` loops only over current rows, and the orphan sweep skips in-window batches. They clear when the batch ages out (the orphan verifier reads an unknown row as satisfied). A row removal therefore needs a manual resolve of its open alerts.
6. **Population:** inherits `completion_report`; progress reports excluded; a converted report counts from its conversion (rename reads as an add to the path-limited `--diff-filter=A` — control `8e7e1ba9c`).
7. **INHERITED, NOT CHANGED:** `batchIdToFileRegex` accepts a separator-led suffix, so a batch id can match a neighbour batch's report — the earliest sets the date and any can carry the row. Every doc-set check shares it; stated in code and in the SIM.
8. **Residual:** `tick()` has no unit test, so dropping the verifier argument at its call site is uncaught — the same exposure as the existing doc-gap orphan wiring.

## 6. P3 / P4 — DOCUMENTS ONLY (`33b62ee16`, wording aligned at `ad38011f2`)

- **Folder** `1-system-manual/`, written into `workflow-10-governance`'s Tier-1 task-list row. `CC_A_SESSION_TASK_LIST.md` moved; the one pointer I own updated. **No CC_C shell created — CC-C created and populated its own list at `ca842c27b`.** CC-B and CC-INFRA move their own; convention posted to the crew.
- **Shape:** the same row says each list leads with `OPEN AND STALLED`, and states what the checker grades.
- **SIM:** new *Session Task Lists* entry — writers, readers (no code readers), what the checker does and does not read, current locations, known gaps.
- **My own report:** `B_DRIFT_RUNTIME_PREDICATE_COMPLETION_REPORT.md` gains the table row the check correctly found missing.

## 7. NOT IN THIS CHANGE — HOMED

- Slot-time placement check, and the shared-`MEMORY.md` / Langston-`MEMORY.md` rows → plan row 4.8 `B-SLOT-PLACEMENT-CHECK`.
- The checker suite not running in CI → a residual in the completion report.
