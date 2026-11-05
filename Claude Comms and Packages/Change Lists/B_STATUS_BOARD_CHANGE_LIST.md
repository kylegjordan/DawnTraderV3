# B-STATUS-BOARD — CHANGE LIST (Step 4)

**Owner:** CC-A · **Issue:** `#1227` (closes `#1200`) · **Reviewer:** Langston
**Review ref:** `review/b-status-board` at **`06bb59bff`** (six commits on `e8eb7143e`). **Not on `migration/aws-supabase`:** a push of checker code there IS its deploy (the box fast-forwards before every tick), so this branch is reviewed by sha first (`dt-review show 06bb59bff <path>`).

## Dispatch header (`workflow-04-code-review`)
| # | field | value |
|---|---|---|
| i | **declared change-class** | `non_architecture` (scope header, verbatim) |
| ii | **the class's doc set** | **scope** present — `Scope Files/B_STATUS_BOARD_SCOPE.md` r6 · **pre-audit** present — `Scope Files/B_STATUS_BOARD_PRE_AUDIT.md` r4 · **change list** present — this file · **CHANGES_AND_FIXES** absent, lands at Step 10 · **BATCH_CATALOG** absent, Step 10 · **RUNNING_ISSUES** (`#1227`, `#1200` close, `#670` and `B-CREW-STATUS-2` dissolve) absent, Step 10 · **task-list row** absent, Step 10 · **SIM** applicable (a new component and a new cross-cutting file), Step 10 · **System Manual** judged N/A: no architecture, strategy, regime, filter, signal-pipeline or maths change — a display and governance-tooling batch · **completion report** absent, Step 11 · **DELETED_COMPONENTS_LOG / STORAGE_POLICY / GOVERNANCE_EXCEPTIONS** rows land with P10 (crew-status retirement) after the board is verified |
| iii | **Step-2 reference** | `Scope Files/B_STATUS_BOARD_PRE_AUDIT.md` (approved on r3 at `42aa8c4f9`; r4 at `a54b4b0f0` answers the r5 read) |

## Files (16; `git diff --stat e8eb7143e 06bb59bff`, untracked checked: none but local `.claude/launch.json`)
| file | what | plan item |
|---|---|---|
| `scripts/governance-checker/config.mjs` | `PLAN_LINE.s0aHeader`; `BOARD_FILE`, `BOARD_DESCRIPTIONS_PATH`, `STATUS_PREFIXES` (the 17 measured words + `PAUSED`, `VERIFIED`), `STATE_LABELS`, `WAITING_WORDS`, `BOARD_STALE_MS`, `DESCRIPTION_MAX_CHARS` | P1, P4 |
| `scripts/governance-checker/checker.mjs` | `presprintRows` (separate export), `idsInCell` (exact-set ids; every config form incl. `B79.0n`, plus `F-G-*`, `PAPER-RESET-*`), `mapStatus`, `mapWaiting` | P1, P4 |
| `scripts/governance-checker/census.mjs` | §0's 3-column branch removed; `s0` built from `presprintRows`; row-backed items skipped by `planLines`; `placement()` also reads the table (the `#1200` fix) | P3 |
| `scripts/governance-checker/status-board.mjs` (new) | `parseDescriptions`, `lastStepFor` (anchored), `buildBoard` (pure), `allSubjects`, `runStatusBoard` (atomic write + `gov-board-failed`) | P6 |
| `scripts/governance-checker/poller.mjs` | `parseExceptionsLegacy` adds `openReason`; `runStatusBoardSafely` at BOTH `maybeRunWeekly` sites; `status-board.mjs` in `DRIFT_LOADED_FILES` | P5, P6 |
| `*.test.mjs` (census, poller, status-board) · `.github/workflows/ci.yml` | fixtures moved to the new table; PS1-PS15; SB1-SB28 + SB12b; LIVE0-LIVE5 on the real plan; a CI step | P9 |
| `server/services/status-board-file.ts` (new) · `server/routes.ts` | `GET /api/status-board` behind `authenticateToken`; 503 with a reason when the file is missing or unreadable; two ages | P7 |
| `client/src/pages/status-board/StatusBoardPage.tsx` (new) · `client/src/App.tsx` | the page, inside `RequireAuth` | P8 |
| `server/tests/unit/b-status-board.test.ts` (new) | the reader by behaviour; the login by structure | P9 |
| `1-system-manual/SPRINT_TO_LIVE_PLAN.md` | §0 and §0a become ONE 72-line table in §0a; both old tables verbatim under `### history` | P2 |
| `1-system-manual/STATUS_BOARD_DESCRIPTIONS.md` (new) | one plain line per item, drafted from each item's own plan row, scope or issue, for owners to correct | P3 (descriptions) |

**Local runs at `06bb59bff`:** status board 35/35 · census 221/221 · poller 443/443 · vitest (`b-status-board`, `b-mutating-routes-auth`) 23/23 · tsc baseline 329 = 329. **Mutations proven:** LIVE0 (failed before the migration landed), the census PS pair (a history row moves nothing; the same item in the table moves the census), SB12b, SB28 and LIVE5 (each fails on a planted fault). SB15 (the `B-TOKEN-WATCH` / `-AUTH` pair) is a fixture assertion, not mutation-proved.

## Load-bearing hunks

**1. The reader — separate from `planRowsByBatch`, throws only on its own header** (`checker.mjs`, new):
```js
export function presprintRows(planText) {
  ...
  planText.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, ''), lineNo = i + 1;
    if (/^## /.test(line)) { inSection = /^## 0a\./.test(line); inTable = false; return; }
    if (!inSection) return;
    if (line.trimEnd() === PLAN_LINE.s0aHeader) { headers.push(lineNo); inTable = true; return; }
    if (!line.trim().startsWith('|')) { inTable = false; return; }
    ...
    if (cells.length !== width) { malformed.push({ lineNo, cellCount: cells.length }); return; }
    const own = deMark(status).toLowerCase() === 'row';
    if (row.planRow && !own) conflicts.push({ lineNo, item, why: 'owns a §4 row but carries its own status ...' });
    if (!row.planRow && own) conflicts.push({ lineNo, item, why: 'reads `row` but names no §4 row' });
  });
  if (headers.length !== 1) throw new Error(`the pre-sprint header ... appears ${headers.length} times ...`);
```
**2. The census re-point** (`census.mjs`; BEFORE: `if (section === 0 && c.length === 3 && c[0] !== 'session') s0.push(...)`):
```js
for (const it of presprintRows(text).items) {
  s0.push({ lineNo: it.lineNo, session: it.owner, inFlight: [it.item, it.issue].join(' '), disposition: it.status,
    rowBacked: deMark(it.status).toLowerCase() === 'row' });
}
// planLines:  for (const r of plan.s0) if (!r.rowBacked) for (const id of idsIn(r.inFlight)) ...
// placement:  ... || plan.s0.some((r) => numIn(r.inFlight))            (number)
//             ... || plan.s0.some((r) => hasId(r.inFlight, id))         (HOME batch)
```
**3. The two writer sites** (`poller.mjs`): after `maybeRunWeekly` on the rulebook-unreadable return — `runStatusBoardSafely(state, nowMs, null)` — and on the normal path — `runStatusBoardSafely(state, nowMs, exceptions.openReason ?? new Map())`. Not on the fetch-fail return (no sha).
**4. The exceptions reason** (`poller.mjs`): `const tail = cells.slice(6); if (line.trimEnd().endsWith('|')) tail.pop(); openReason.set(bid, tail.join(' | ').trim());` — last row wins; existing outputs unchanged (SB22).
**5. The route** (`routes.ts`): `apiRouter.get('/status-board', authenticateToken, async (_req, res) => { const { readStatusBoard } = await import('./services/status-board-file'); const out = await readStatusBoard(); res.status(out.status).json(out.body); });`

## The census change (pre-registered, then run): pre-audit Appendix F
(f) 4 → 2 and (a) 5 → 1, both as predicted; (b) 11 issues placed, none lost, and 14 already-placed issues re-labelled because §0 is a placement source for the first time (my prediction under-described that); (c)(d)(e)(g) unchanged.

## Judgement calls — please attack these
1. **The migration's content.** 72 lines from the owners' answers; an item that owns a §4 row reads `row` (its status is that row's — one copy). `B-MEASURE-GATE` is migrated **closed** (leg 2's report exists; the later legs are on `PRE_LIVE_SPRINT.md`), so it does not land on census list (f). Item cells name **one** batch id only — cross-references moved to the status cell — because the census reads item + issue as the line's ids (`B-TOKEN-WATCH (… B-TOKEN-WATCH-AUTH …)` would have put the `-AUTH` id on a §0 line).
2. **Two items share a §4 row by design:** rows 4 / 4b both carry `B-VTS-NO-DECISION-VALVE`, and row 40 is named by both `B-ENTRY-CONSUMPTION-FRESHNESS` and its umbrella `B-XSTOCK-SESSION-FRESHNESS`. Both lines read `row`; the board shows the row's status on each. Is that one copy, or should the umbrella line go to the drop list?
3. **The descriptions are mine, drafted for owners.** Every one comes from the item's own plan row, scope heading or issue heading; ten I first wrote from the batch name alone were replaced with sourced text before commit, and at least one was plainly wrong (`B-TOKEN-WATCH` is the Solana-launch observation, not token use). They are a starting set, and LIVE5 only checks each heading names something.
4. **`MOVED` and `WITHDRAWN` read live to the census** (`cellClosed` sees only ✅ / CLOSED / DONE). None of them carries a completion report today, so list (f) is unaffected; a moved item that later gains a report under its own name would land on (f).
5. **The page and the checker ship on two clocks** (the checker on merge, the page on `dt-deploy`); the page shows the data's age and ref and its own build separately, and marks the data stale after an hour.

## Step 7 — the absent-file and stale-banner renders, done WITHOUT a restart (2026-11-05 ~10:00Z, CC-A, Claude-in-Chrome)
The page reads the board file on every request (`readStatusBoard`, `server/services/status-board-file.ts`), so the two owed renders did not need a restart with `GOV_BOARD_FILE` — the real file was moved and swapped for one minute, between checker runs (timer 09:40:20Z → next 10:10:20Z).
- **Baseline:** board rendered, "Data from the plan at 986566804, built 19 minutes ago", page build `0abfd7102`.
- **Absent file** (file moved aside): the page shows **"No board to show — the governance checker has not written the board yet — Shown as missing on purpose: an empty board and an unwritten one are different things."** with the page build. PASS.
- **Stale file** (a copy with `generated_at` set two hours back, 07:40:22Z): the page shows **"built 2 hours ago"** and the banner **"Stale — the board has not been rebuilt for over an hour. The governance checker may have stopped updating."** above the full board. PASS.
- **Restored:** the original file back, sha256 prefix `43d1058cddb07f55` before and after, mtime 09:40:33 unchanged; no test files left in `/var/lib/governance-checker/`; the page re-read normal ("built 20 minutes ago", no banner).
- **Phone width: NOT done by me** — the browser window would not narrow below desktop width, so the check stays Kyle's on his own phone. It is the only Step-7 item left.


## OBJ-6 — the old crew-status page retired (pre-audit P10), 2026-11-05, CC-A; Infra Claude reviews
- **Removed (six files, archived byte-identical to the blobs at `0f4835b5a` as `<name>.20261105-B-STATUS-BOARD.removed`):** `comms-infra/laptop/crew-status.py`, `crew-status-audit.py`, `crew_memory.py`, `crew_context.py`, `register-crew-status-task.ps1`; `comms-infra/discord/crew-status-post.py`. `DELETED_COMPONENTS_LOG.md` entry with the census; `B-CREW-BOARD-REMOVAL`'s line there reduced to its three remaining entries and its struck due date replaced by its placement (`PHASE_19_PLAN.md` row 11, gated on Kyle).
- **Outside references (Infra Claude's answers on Discord `1567843827581063179`, all four edits his to review):** `deploy.sh` MANIFEST line + group comment; `deploy_tests.sh` D5 now DERIVES the bridges count from the manifest at the sha under test (its literal read 11 while the manifest already listed 15 — stale since B-LANGSTON-RELIEF) and drops the poster-installed clause; the ssh-keyholder caller census (`verify_caller_census.py` SELECTORS + the `\DawnTrader Crew Status` TASKS entry, `caller_capture_bindings.json`, `capture_caller_processes.ps1`). `REQUIRED_CLIENTS` is now keyed by PATH, not SELECTORS index — removing entry 4 under index keys would have moved `dt-media-get`/`dt-media-post` onto the wrong client sets.
- **Checks run:** the three keyholder test files (CI runs them) rc 0 each; the census loaded old-vs-new: the only key removed is `crew-status.py`, every one of the other 9 keeps an identical client set, keys equal the evidence names. `bash -n deploy_tests.sh` OK; bindings JSON parses. D5 itself runs only on Helsinki (root, a temp mirror) — **not run by me**; Infra Claude runs it at the reviewed sha.
- **STORAGE_POLICY §7.5** marked retired: the 18 MB snapshot archive (last month 2026-08) is KEPT as history, never deleted, and stops growing; `#670` becomes a one-time cold copy, owner Infra Claude.
- **Off-repo, after approval, Infra Claude (his offer):** Helsinki — stop anything that runs the poster, MOVE `/opt/discord-bridges/crew-status-post.py` and `/var/lib/crew-status/` to an archive folder; laptop — unregister the disabled task and move `~/.claude/crew-status*` to an archive folder. **The standing Discord message stays unless Kyle deletes it** (Infra Claude's call, which I accept: deleting a posted message is Kyle's). ⚠️ Found at the census, not in pre-audit A8: Helsinki `/var/lib/crew-status-explainer/` (130 MB, written by `crew-status.py:680`) — passed to Infra Claude with the rest.
- **Not touched:** `token-watch/tier.py:5` (a comment naming `#670`), the PM sweep data files and `scripts/inventory/*.json` (historical text).

## OBJ-6 Step 4 — Langston PROCEED on `549a1cd66` with three in-commit conditions (Discord `1567860060695166998`); Infra Claude APPROVE (`1567845644327063594`)
- **C-1 folded:** `DELETED_COMPONENTS_LOG.md` no longer claims D5 asserts the poster is absent (the clause had been dropped, not inverted); it now states the derived count, D5r and the `RETIRE` entry.
- **C-2 folded:** `crew-status-post.py` joins the bridges `RETIRE` list in `deploy.sh` — the poster on Helsinki is dated Oct 17 11:05, i.e. `deploy.sh` re-installed it 19 days ago, so re-entry is a demonstrated path; a rollback-then-roll-forward is now swept automatically.
- **C-3 folded:** D5r plants `$T/opt/crew-status-post.py` before the bridges run and asserts it is gone from `$T/opt` AND present under `$T/retired/*/` (the F2-D1 shape) — an assertion that can fail. **D5 is re-run at the final sha by Infra Claude on Helsinki** (it has no CI runner, see below).
- **Record items done here:** the D5 comment narrowed (D1, D6, F3-D4 still carry literals, correct today: notices 3, readers 2, Langston-verified); `verify_caller_census.py` gains a set-equality fence (`REQUIRED_CLIENTS` keys == `EVIDENCE_NAMES`) — **mutation run:** a copy with the `dt-media-get` key removed raises `RuntimeError` naming it; the real file loads; the three keyholder tests rc 0. `STORAGE_POLICY.md` §7.5's "+ Helsinki mirror" corrected (Langston searched to depth 3: none exists).
- **Off-repo additions for Infra Claude's move (Langston's census):** `/opt/discord-bridges/__pycache__/crew-status-post.cpython-312.pyc`; `/var/lib/crew-status-explainer/` is a Claude Code agent home (`.claude/sessions` 0700, `policy-limits.json` 0600, `.claude.json` 0600) — **moved with modes preserved**, never `cp -r` / `chmod -R` into a traversable archive; 130 MB is a floor (`du` could not read `.claude/sessions`). **The standing Discord message id, for Kyle:** `1535231960895590451` (`/var/lib/crew-status/message.json`).
- **Owed at Step 10 (Langston record items):** `RUNNING_ISSUES` `#670` (its "warm tier grows unbounded" half dissolved, §9.4 disposition 5; the rest a one-time cold copy), `CC_INFRA_SESSION_TASK_LIST.md:26`, `MEMORY_CC_INFRA` (Infra Claude's own file), and `token-watch/tier.py:5`, which cites the retired component as its live exemplar.
- 🟨 **FINDING (Langston, §9.4):** `comms-infra/helsinki/tests/deploy_tests.sh` has **no CI runner** (`dt-review grep deploy_tests .github` → 0, against 6 hits for the keyholder files in the same workflow) — which is how a stale assertion sat unnoticed. Unrun is neither passing nor failing. **DISPOSITION: decision required — proposed to Kyle's list via PM Claude, owner Infra Claude; not placed by me.**
