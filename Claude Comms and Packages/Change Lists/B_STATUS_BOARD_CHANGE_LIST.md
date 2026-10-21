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
