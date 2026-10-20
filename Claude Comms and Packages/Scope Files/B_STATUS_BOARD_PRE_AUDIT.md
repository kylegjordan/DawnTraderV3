# B-STATUS-BOARD — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r1, 2026-10-21)

change-class: non_architecture
**Owner:** CC-A. **Issue:** `#1227`. **Scope:** `Scope Files/B_STATUS_BOARD_SCOPE.md` r3, Step 1 approved by Langston at `725a7f3f5`.
**Graded ref for every citation:** `origin/migration/aws-supabase` at the commit carrying this file.

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope r3, OBJ-3): 17 leading status words, 319 rows. NOW: 17 and 319, re-run at the ref — unchanged.**
- **PREVIOUSLY STATED (scope §1): "the checker's 30-minute tick reads the plan".** NOW, sharpened: a commit-subject read already exists, but it is capped at the last **300** commits (`gitFetchAndLog(n = 300)`, `poller.mjs:532`). An item whose last Step commit is older than that would read `no step recorded`. REASON: the board reads the whole history's subjects instead (A6).
- **PREVIOUSLY STATED (scope OBJ-1): each §0a cell may name several items.** NOW: the cells name **36 items**, of which **18 have a §4 row** and 18 do not. REASON: the item census in A9.
- **No other number in the scope moved.**

## 1. SOURCES READ
| # | source | read |
|---|---|---|
| 1 | code at the ref | `scripts/governance-checker/` (`poller.mjs`, `checker.mjs`, `census.mjs`, `config.mjs`, `README.md`, the unit file); `client/src/App.tsx`, `client/src/lib/api.ts`, `client/src/lib/queryClient.ts`, `client/src/pages/token-watch/TokenWatchPage.tsx`; `server/routes.ts` and the 14 sub-routers under `/api`; `comms-infra/laptop/crew-status*.py`, `crew_memory.py`, `crew_context.py`, `register-crew-status-task.ps1`, `comms-infra/discord/crew-status-post.py`. Two read-only helper agents enumerated the checker and the routes; every claim below that came from them was re-read or measured by me unless marked `NOT RE-READ` |
| 2 | runtime | staging, from the laptop over `https://188.245.193.8.sslip.io`, no login: five read-only `GET`s → 200, control `/api/system/canonical-map` → 401, `/api/status-board` → 404 (Langston, pre-state). `/var/lib/governance-checker` is `deploy:deploy`, files `0644`, and pm2's `dawntrader` runs as `deploy` (Langston, Step-1 PROCEED) |
| 3 | `SYSTEM_IMPACT_MAP.md` | the plan entry, the session task lists entry, the checker's Monday-gate entry; **no crew-status entry** (0 hits; control `governance checker` 5) |
| 4 | `SYSTEM_MANUAL.md` | **silent on the checker and on any status page** (`governance checker` 0, `status board`/`crew status` 0). Correct for its scope (trading architecture); not a gap |
| 5 | ledger and reports | `BATCH_CATALOG.md` (B-CREW-STATUS, B-DELIVERY-BOARD), `B_CREW_STATUS_COMPLETION_REPORT.md`, `B_CREW_STATUS_2_SCOPE.md`, `RUNNING_ISSUES.md` (`#670`, `#1200`, `#1228`), `DELETED_COMPONENTS_LOG.md:912`, `STORAGE_POLICY.md` §7.5 |
| 6 | `bridge/canonical/` | **no coverage** of a crew status page, a status board or the checker (0 files; control `regime` 10). Everything here is post-governance |

## 2. THE AUDIT

### A1 — The checker's tick has one wrapped step; everything else is fail-closed
`tick()` (`poller.mjs:1028-1262`): load state, resolve the graded sha (`resolveGradedRef` `:608-612`), fetch-fail early return, drift canary, batch states, the exceptions read (its own try/catch and early return, `:1126-1143`), the plan-line rule (its own catch inside `decidePlanLineTick`, `:497`), `decideAlerts`, the orphan sweep, `maybeRunWeekly` (`:1253`), then `saveState` (`:1257`). **Only the weekly legs are wrapped** (`:1000-1012`, again in `maybeRunWeekly` `:1021-1023`): a throw anywhere else ends the tick with no `lastTick`, by design, and the heartbeat fires.
⇒ The board writer must not become a new way to fail the gate. The weekly-leg pattern is the precedent: its own try/catch, a fixed-key failure alert opened once and resolved on the next success.

### A2 — The checker's file writes; the atomic helper exists
State: `writeStateAtomic` (`config.mjs:423-428`: temp file with pid, fsync, rename). The census box file is **not** atomic (`census.mjs:891-896`). Paths are environment-configured (`GOV_STATE_FILE`, `GOV_CENSUS_DIR`, defaults under `/var/lib/governance-checker/`). The unit runs as `User=deploy`.
⇒ The board file uses `writeStateAtomic`, path `GOV_BOARD_FILE`, default `/var/lib/governance-checker/status-board.json`. The app (as `deploy`) can read it (Langston's measurement).

### A3 — Neither plan reader sees §0a today, and both use the same section regex
Both readers find sections with `/^## (\d+)\./` (`checker.mjs:350`, `census.mjs:366`). `## 0a.` does not match, so its lines stay in section 0: `planRowsByBatch` ignores them; `parsePlan` pushes them to `sec[0]`, where the 2-cell rows fail the 3-cell §0 filter (`:371`). That is `#1200` exactly.
Header rules: §4 accepts many header lines, each strict-equal to `PLAN_LINE.s4Header` (`checker.mjs:355`, `:371`); §5 requires exactly one (`:362`, `:372`).
Callers: `planRowsByBatch` — `poller.mjs:497` (`decidePlanLineTick`), which `plan-lines-preview.mjs:114`, `:156` also call; tests `poller.test.mjs:1036-1125`. `parsePlan` — `census.mjs:559`, `:560`, `:628`, `:913`; tests `census.test.mjs:175-335`. Both test files run in CI as plain Node scripts (`.github/workflows/ci.yml:155`, `:166`).
⇒ One shared §0a reader in `checker.mjs`, imported by `census.mjs`, recognising `## 0a.` explicitly, with **one** header constant `PLAN_LINE.s0aHeader` and §5's exactly-one rule.

### A4 — The unauthenticated-route census (Langston N4, taken at Step 2)
**671 route handlers under `/api`; 89 with no auth middleware** (`server/routes.ts` 567 / 49; the 14 sub-routers 104 / 40). Method: there is no router-level auth anywhere (`apiRouter.use` adds only normalisation and trace, `server/routes.ts:370`, `:407`; `singleTenantGuard` at `server/index.ts:205` refuses a userId, it is not auth), so a route counts as covered only if it names `authenticateToken`, a local `requireAuth`, or `auditOrAuth` inline. Counted by a helper agent: **`NOT RE-READ` route by route**; I re-measured five `GET`s live (200 each, control 401) and read the state-changing `POST`s below.
- `server/routes.ts` (49): `GET /metrics` 416, `/metrics/slo` 436, `/logs/recent` 452, `/config` 468, `/metrics/snapshot` 509; `GET /system/health` 537 (and 15131, shadowed), `/system/health-sdpoe` 781, `/system/health-30fx` 5857, `/system/drive-status` 5900 (and 6018), `/system/drive-trend` 5922, `/system/drive-forecast` 5942, `/system/drive-guardrails` 5972, `/system/config` 6069, `/system/logs` 15532; `POST /vtp/start` 798, `/vtp/stop` 808, `GET /vtp/status` 818; `POST /mbim/start` 829, `/mbim/stop` 839, `GET /mbim/status` 849, `POST /mbim/audit` 862; `POST /auth/register` 876, `/auth/login` 942, `GET /auth/verify` 997, `POST /auth/refresh` 1017 (the last two check the token in the handler); `GET /market/ticker/:symbol` 4955; `POST /internal/active-engine/register-session` 5725, `/deregister-session` 5750; `GET /diagnostics/xstock-scanner` 7337, `/diagnostics/tec-bootstrap` 8415, `/diagnostics/i7-root/engine-status` 10360, `/diagnostics/i7-price/status` 10423, `/diagnostics/orchestrator-per-class-state` 13481; `PATCH /conversations/:id` 13990; `GET /market-context/latest` 14291, `/market-context/history` 14307, `POST /market-context/analyze` 14332; `GET /stocks/quote/:symbol` 14370, `/stocks/company/:symbol` 14381, `/stocks/search/:query` 14392, `/symbol/data` 14403, `/crypto/search/:query` 14510; `GET /maintenance/status` 14798, `POST /screener/test` 14805, `POST /kill-switch/check` 14881 (answers 410), `GET /kraken/cache-stats` 16299; `ALL *` 21399 (the 404 catch-all).
- sub-routers (40): `status.ts` 2; `token-watch.ts` 1 (`#1228`); `health.ts` all 10 incl. `POST /recovery/trigger` (logs only, `:144`) and `/recovery/test`; `vts.ts` 2 of 36 (`/open-trades`, `/internal/calibration` with an `x-internal-key` header); `audit.ts` all 4; `signal-audit.ts` all 3; `vts-predictive-adjustments.ts` all 7; `back_audit.ts` all 5 incl. `POST /run`; `dse.ts` all 5 (likely unreachable behind the catch-all — `/api/diagnostics/dse/status` → 404 live); `regime-map.ts` 1.
- **State-changing, read in the code, not called:** `/mbim/start` / `stop` start and stop the mini-book integrity monitor the server starts at boot (`server/index.ts:386`); `/vtp/start` / `stop`; the simulation-session register/deregister (an in-memory record, `server/routes.ts:5705-5721`). None places, moves or closes a trade or touches a balance in the code read.
⇒ For this batch: `GET /api/status-board` names `authenticateToken`, and a test pins it. The class is recorded on `#1228` for Kyle (**decision required — no work, on `#1228`**); it is not fixed here.

### A5 — The exceptions reader drops the reason
`parseExceptionsLegacy` (`poller.mjs:707-729`, the one in use; V2 is off, `config.mjs:334`) takes timestamp, batch id, type, value and confirmer from cells 1-5 and **never reads cell 6, the reason**. No code can see an open row's reason today.
⇒ The legacy parser additionally returns `openReason` per batch id (additive; no existing field changes), so OBJ-3(b) can show it. A test pins that the existing outputs are unchanged.

### A6 — Commit subjects: a reader exists but its window is too short
`gitFetchAndLog(n = 300)` (`poller.mjs:532-549`) and `gitLog(n = 200)` (`checker.mjs:136-154`) both read subjects at the graded sha with `--name-only`. **300 commits is about a day.** The full history is 13,380 commits and its subjects alone read in 0.28 s on the laptop (`git log --format='%H|%cI|%s'`). Both parsers split the line on `|`, so a subject containing `|` is cut (harmless for a leading `B-ID Step-N`).
⇒ A separate subjects-only read of the whole history at the graded sha, parsed for `^<batch-id>\b.*\bStep-(\d+)`. Langston's measure stands: about 70 % of subjects lead with an id and name a step; the rest show as no step, and the status cell remains the status.

### A7 — The page and the endpoint follow existing patterns
Client: a lazy import plus a `<Route>` inside `RequireAuth` (`App.tsx:41`, `:251`, `RequireAuth` `:119-151`); `useQuery` with the default `apiFetch`, which attaches the bearer token (`client/src/lib/api.ts:17`, `:46`). Pages handle phone width with Tailwind breakpoints (`TokenWatchPage.tsx:198`, `:216`); the shell's sidebar becomes an overlay under 768 px (`use-mobile.tsx`). Server: the file-backed read with `authenticateToken` at `server/routes.ts:1963-1979` is the model. **`server/routes/token-watch.ts` is not** (no auth, `#1228`).
⇒ `GET /api/status-board` in a new small router with `authenticateToken` on the route; `503` with a reason when the file is missing; the page at `/status-board`.

### A8 — Retiring the crew-status page: what it touches beyond itself
- **Files:** `comms-infra/laptop/crew-status.py`, `crew-status-audit.py`, `crew_memory.py`, `crew_context.py`, `register-crew-status-task.ps1`; `comms-infra/discord/crew-status-post.py`.
- **State it wrote:** on the laptop `~/.claude/crew-status.html`, `crew-status-archive/`, `crew-status-changed.json`, `crew-status-summaries.json`, `crew-status-pinged.json`, `crew-status-context.json`, `crew-status-work/`, `crew-status-task.log`; on Helsinki `/var/lib/crew-status/message.json` (the Discord message id); the Discord standing message; the scheduled task `DawnTrader Crew Status` (Disabled). **Readers: only the writers themselves**, plus the ssh-keyholder caller census.
- **Outside references that must change with it (Infra Claude's tooling):** `comms-infra/discord/deploy.sh:5,71` installs the poster; `comms-infra/helsinki/tests/deploy_tests.sh:150` asserts it is installed; the ssh-keyholder caller census lists crew-status (`capture_caller_processes.ps1:12`, `caller_capture_bindings.json:10`, `verify_caller_census.py:32,54-57`).
- **Docs that still read it as live:** `STORAGE_POLICY.md:121` (§7.5), `CC_INFRA_SESSION_TASK_LIST.md:21` (`#670`), `CLAUDE_CODE_FEATURE_WATCH.md:53`, Infra Claude's memory file.
- **Already scheduled and overdue:** `DELETED_COMPONENTS_LOG.md:912` placed `B-CREW-BOARD-REMOVAL` (CC-A, "due 2026-09-05") over `scripts/crew.ts` **and** `crew-status-post.py`. `scripts/crew.ts` is a different tool (the crew coordination board, `crew_coordination` table) and is not this batch's.
⇒ OBJ-6 removes the crew-status set and edits the three outside references in one commit with Infra Claude's review; `crew-status-post.py` leaves `B-CREW-BOARD-REMOVAL`'s list, which then holds `crew.ts` alone. Whether the snapshot archive is kept as history or deleted is Infra Claude's call (it is business data under `STORAGE_POLICY.md` §7.5).

### A9 — The §0a item census: 36 items
The 11 data rows name **36 items**; **18 have a §4 row** (their status and owner come from the row, one copy) and **18 do not** (their status moves into the new table). Built from the plan text at the ref, mapped against §4 by row id and batch id:
| stage | item | owner | §4 row | issue | note |
|---|---|---|---|---|---|
| 0 | B-LOSS-WINDOW-OPERATOR-CLOSES | CC-C | 183b | #1154 | |
| 0 | B-ENGINE-STOP-DURATION-COLUMN | CC-B | 2a0 | #1067 | row 173 is `MOVED` to 2a0 — an alias, not an item |
| 1 | B-PRICE-STALENESS-BOUND | CC-C | 33 | | the cell says "32/33"; **there is no row 32** |
| 1 | B-KRAKEN-PRIMARY-KEY-RESOLUTION | CC-C | 14a | #1076 | |
| 1 | #1047 (WS parse-error drops) | CC-C | 17 | #1047 | its HOME is row 17, `B-PRICE-SIDE-BY-JOB` |
| P1a | B-ENTRY-LEVEL-RECHECK | CC-B | 59 | #1168 | |
| P1a | B-CRYPTO-BIRTH-FEED | CC-B | 39a | #1060 | |
| CC-B list 1-5 | B-BOOK-CHECKSUM-CIRCUIT-BREAKER · B-ENTRY-GATE · B-PRICE-FEED-COVERAGE · B-PLAN-PRICE-BASIS · B-BOOK-TRUST-FLEET-GUARD | CC-B | none | #1220 · #1224 · #1222 · #1223 · #1226 | five items, status here |
| after CC-B list | B-BALANCE-SESSION-PAIRING | CC-C | none | | Kyle: waits behind CC-B's list |
| CC-A list 1 | B-STATUS-BOARD | CC-A | none | #1227 | |
| P1b | B-ENTRY-CONSUMPTION-FRESHNESS | CC-C | 40 | | closed 2026-10-15 |
| P1c | B-CLASS-LEG-FILL-MODE | CC-C | none | #1170 | closed 2026-10-15 |
| 2 | P-8e split (extrapolated-fill field) | CC-C | none | | part of `B-PRICE-SIDE-BY-JOB`'s pre-audit |
| 2 | B-XSTOCK-BID-TRIGGER-RELAND | CC-C | 2 | | |
| 2 | B-SPREAD-BLOWN-RELEASE-MOVEMENT | CC-C | none | #1199 | |
| 2 | B-CRYPTO-MARK-AGE-GATE | CC-C | 38 | | |
| 2 | B-EXIT-TICKER-LEG-ADAPTER-SIDES · B-STALE-BOOK-DEPTH-REFUSAL · B-EXIT-DECISION-RUNG-STAMP · B-DISPLAY-TRIGGER-PRICE | **see F1** | 65 · 8b · 113 · 3c | — · #1085 · — · #1152 | |
| 2 | [C3] with row 62 | CC-C | 62 | | |
| 3 | B-XSTOCK-LIVE-FEED | CC-C | 31 | #960, #1175 | moved out of the pre-sprint by Kyle 2026-10-07 |
| 3 | CORZ investigation | CC-C | none | | done |
| 3 | B-XSTOCK-BAR-AVAILABILITY | CC-C | none | #707 | |
| 3 | B-B75-EXPORT-COMPLETENESS | CC-A | none | #1195 | closed 2026-10-18 |
| 3 | B-B75-SCRIPT-TEST-HARNESS | CC-B | none | #1208 | |
| 3 | B-XSTOCK-SNAPSHOT-RETENTION | CC-C | none | #1194 | |
| 3 | B-CRON-MISSED-CATCHUP | CC-C | none | #691 | |
| 4 | B-OPEN-REFUSAL-DURABLE-ROW | CC-C | 8a | #1083 | |
| 4 | the main Dashboard 0-trades read | CC-B | none | #903 | **withdrawn by Kyle's 2026-10-19 rule** (the main Dashboard is off-limits) |
| 5 | PAPER-RESET-3000 at $820 + a new dashboard epoch | **see F2** | none | | |
| 5 | row 100, the learning-record restart | CC-B | 100 | | |
The "Out" line (rows 53 and 37) stays in the history text; they are not pre-sprint items.

**F1 — owner conflict, to settle with the owners before migrating:** §0a reads "65, 8b, 113, 3c (CC-B)"; §4 names CC-C for 65, 8b and 113 and CC-B for 3c. With one copy the row wins, so the board would show CC-C for three items §0a credits to CC-B. Asked of ANALYST Claude and NEW Claude at Step 3; recorded either way.
**F2 — no owner:** `PAPER-RESET-3000` names none (the `(CC-B)` at the end of that cell follows row 100). Asked at Step 3; until answered it shows `owner not named`.

### A10 — The writer and the page deploy on different clocks
Per the checker `README.md`, the box's `20-auto-redeploy.conf` merges `origin/migration/aws-supabase` fast-forward before every tick, so checker code merged to the branch is live within about 30 minutes, outside `dt-deploy` and any deploy hold. The page and endpoint need an app deploy. The repo copy of the unit still reads `GOV_SHADOW=1` while the box runs `0` (README `:31`) — a known drift, not this batch's.
⇒ The checker change is reviewed at a throwaway ref and pushed to the branch **only after Langston's Step-4 PROCEED**, because the push is the deploy. The page shows the data's age and the page build's commit separately (OBJ-4).

## 3. THE PLAN (every item names the finding it falls out of)
| # | step | from |
|---|---|---|
| P1 | **§0a reader** in `checker.mjs`: recognise `## 0a.`; `PLAN_LINE.s0aHeader` = `\| stage \| order \| item \| owner \| plan row \| issue \| agreed \| status \| waiting on \|`, exactly one header (§5's rule), strict-equal, throw `unreadable`; rows of exactly 9 cells; a `row`-status line whose `plan row` is `none` is refused, and a non-`row` status on a line with a §4 row is refused (one copy). Exported; `census.mjs` imports it, and its `sec[0]` stops receiving §0a lines. **Closes `#1200`.** | A3 |
| P2 | **The migration:** replace §0a's prose table with the 9-column table, 36 items per A9, closed items as closed, the withdrawn item as withdrawn with Kyle's 2026-10-19 rule cited, F1 and F2 settled with the owners; the old table moved under `### history` (unparsed, as text). A script diff in both directions: every row id, batch id and issue in the old text is in the new table or in a stated drop list. | A9, F1, F2 |
| P3 | **Descriptions file** `1-system-manual/STATUS_BOARD_DESCRIPTIONS.md`: one `### <batch id or row id>` heading per item and its text below; a length limit stated in the file; I write the starting set for the 36 items, each sent to its owner to correct. | scope OBJ-2 |
| P4 | **The writer** `status-board.mjs` in the checker: reads §0a (P1), §4 (`planRowsByBatch`), the exceptions' `openReason` (P5), the whole-history subjects (P6) and the descriptions (P3), all at the graded sha; maps leading words to the seven states (scope OBJ-3) and marks anything else `unrecognised`; writes `GOV_BOARD_FILE` with `writeStateAtomic`. Called after `maybeRunWeekly` inside its own try/catch, with a fixed-key `gov-board-failed` alert opened once and resolved on the next success (the weekly-leg pattern); a failure never stops the tick. | A1, A2 |
| P5 | `parseExceptionsLegacy` also returns `openReason` (cell 6); existing outputs unchanged, pinned by a test. | A5 |
| P6 | A subjects-only read of the whole history at the graded sha, parsed for the leading batch id and `Step-N`. | A6 |
| P7 | **The endpoint** `GET /api/status-board` (`authenticateToken`, `fs.readFile`, `503` with a reason when missing). | A4, A7 |
| P8 | **The page** `/status-board`: NOW, NEXT, the rest; plan row, issue, owner, description, state with the cell's own words, waiting-on, last recorded step; the could-not-read list; the data's age and ref and the page build's commit; a stale banner after an hour; phone-width layout. | A7, A10 |
| P9 | **Tests:** P1's header red/green, both readers returning one item set, the one-copy refusals; every live leading word (§4 and the new table) maps; the exceptions outputs unchanged plus `openReason`; the writer's failure does not throw out of the tick; the endpoint returns 401 without a token. | A1, A3, A4, A5 |
| P10 | **Retire crew-status** with Infra Claude: the six files and the three outside references in one commit; the laptop state and task removed; the Helsinki message file and the Discord standing message removed; `STORAGE_POLICY.md` §7.5 and the task list updated; `DELETED_COMPONENTS_LOG.md` entry with archives; `B-CREW-BOARD-REMOVAL`'s list reduced to `crew.ts`. | A8 |
| P11 | **Order of landing:** P1, P2, P5, P6, P3, P4, P9 as one checker change reviewed at a throwaway ref before any push (the push deploys it, A10); P7 and P8 as the app change, deployed with `dt-deploy`; P10 last, after the board is verified. | A10 |

Nothing in the plan is `UNAUDITED`.

## 4. IN PLAIN LANGUAGE
The audit read everything the board will touch. The checker that will keep the board current already runs every 30 minutes on staging, but one error anywhere in it stops that run. So the board's part is fenced off: if it fails, it raises its own alert and the rest of the checker carries on. The pre-sprint list holds 36 items, and about half of them have no row in the main plan, so their status moves into the new table. Two of those need their owners to confirm who owns them. A wider check found 89 of the app's 671 server addresses with no login check; that goes to Kyle on `#1228` and is not fixed here.
