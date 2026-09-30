# B-CREDENTIALS-PRIVATE-REPO — STEP 4 CHANGE LIST, INCREMENT 2: OBJ-1 (the crew login)

**Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1023` · **READY AT:** NOT YET — round 3's should-fixes are open (below); the code at `82dc4edd2` is what round 3 read · **First build:** `bd698603a` (code) + `8cc41792b` (exec bits) · **Nothing is installed** — Step 6 follows this review. **Deadline:** the agents' stored staging session stopped refreshing at 2026-09-30 04:40Z and lapses 2026-10-06 04:40Z.

## THE THREE HEADER FIELDS
| # | field | value |
|---|---|---|
| **i** | **DECLARED CHANGE-CLASS** | `non_architecture` (scope header, `B_CREDENTIALS_PRIVATE_REPO_SCOPE.md:3`) |
| **ii** | **THAT CLASS'S DOC SET** | the table below — every row, with its state at this increment |
| **iii** | **THE STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md` — your PROCEED WITH CONDITIONS 2026-09-29T17:30Z at `3c293f168`, recorded §6 at `8309ba598`; OBJ-1 is §2.2 items 1-10 and conditions C1-C11 |

| doc | non_architecture | state at this increment |
|---|---|---|
| the batch `SCOPE` | REQUIRED | **present** — §2.1 is OBJ-1's design; the Step-3 deltas below go into its STEP-3 AMENDMENT at Step 10 |
| the batch `PRE_AUDIT` | REQUIRED | **present** — field iii |
| `COMPLETION_REPORT` | REQUIRED | **present as the progress report** (`Batch Completion/B_CREDENTIALS_PRIVATE_REPO_PROGRESS_REPORT.md`); converts at close |
| `BATCH_CATALOG.md` · `PHASE_HISTORY.md` | REQUIRED | **absent — due at close** (`#1023` open: OBJ-1, GB-8, OBJ-6) |
| `SYSTEM_MANUAL.md` | judged | **applicable, due at Step 10** — §3 Authentication is stale in load-bearing places (D-13) and gains the crew login |
| `SYSTEM_IMPACT_MAP.md` | judged | **applicable, due at Step 10** — the new components (dt-api, dtapi, dtmint, the setter, dt-install-drift, dt-unit-failure@), the login limiter's loopback bucket, the SIM 10.2 "all routes require JWT" line (D-13) |
| `RUNNING_ISSUES.md` | judged | **applicable, due at Step 10** — `#1023` progress; `#1022` gains the §9.4 item below; `#1092` gets the re-measured user order (OBJ-1(h)) |
| `DELETED_COMPONENTS_LOG.md` | judged | **applicable, due at Step 6/10** — the two Helsinki password files and `agent-staging-session`'s public-host login retire |
| `CHANGES_AND_FIXES.md` · `ADJUSTMENT_FRAMEWORK.md` · `POST_AUDIT_ROADMAP.md` | judged | N/A — no trading-system behaviour, parameter or phase changes |
| `PHASE_19_PLAN.md` | — | N/A — not a P19 batch |
| `SPRINT_TO_LIVE_PLAN.md` — my row | REQUIRED (has a row) | **due at Step 10** |
| shared `MEMORY.md` + `MEMORY_CC_INFRA.md` · Langston's `MEMORY.md` | REQUIRED | mine at each step; **Langston's: due at Step 10** (his `staging` access changes: `sudo -n -u dtapi /usr/local/bin/dt-api GET …` replaces any password) |
| my session task list | REQUIRED | **due at Step 10** |
| `LANGSTON_ARCHITECTURE.md` · `CLAUDE.md` §7 | judged | **applicable, due at Step 10** — §7's "credentials serve the authenticated API call" becomes `dt-api`; no password in the file |

## ONE GATE PER DISPATCH
- **GATE 1-1 — THE ACCESS TOOL:** `comms-infra/staging/dt-api`, `sudoers-dtapi`, `dtmint-authorized_keys`, the census, C1/C3-C7/C10/C11.
- **GATE 1-2 — THE SETTER, THE INSTALL CHECK AND THE AGENTS' MINT:** `dt-api-set-crew-password`, `dt-install-drift` + its units + `dt-unit-failure-alert`, `comms-infra/agent-staging-session` + unit, C2-C4/C7/C8, the install plan.


## THE FRESH-READER RECORD
- `REVIEWER r1: object (8cc41792b) · 3 object readers (dt-api; setter; drift+paging+mint) + 1 claim-only (5 claims) · 3 blockers (setter reconcile deleting the only copy of the old value; agent-staging-session chown-by-path root escalation; drift hourly-against-HEAD) + ~30 should-fix/minor · fixed at 4659ce6eb · re-derived y (each fix has a mutation control)`
- `REVIEWER r2: object (718892dee) · 3 fresh object readers, none shown r1 · 2 blockers (the alert's dedupe class never read under systemd's %N name; a Ctrl-C during (7) restoring from deleted material) + ~20 should-fix/minor · fixed at `d53b5047f` (+ `82dc4edd2`, an exec bit) · re-derived y`
- `REVIEWER r3: object (82dc4edd2) · 3 fresh object readers, none shown r1-r2 · 0 blockers · 15 should-fix + ~22 minor · NOT YET FIXED — the cap is reached; the list below is the first work of the next session, then the full round record goes to Langston with the dispatch`

**Where I did NOT do what a reviewer proposed — rule on these first:**
1. **The setter's interrupts are acted on only at checkpoints BEFORE the commit point; after (4) a SIGTERM/SIGINT is ignored and the run finishes** (r2's blocker, fixed by design rather than by guarding each statement). The cost: a person cannot abort the (6) wait of up to 900 s. I judged finishing a verified change safer than any abort path after it.
2. **A committed change that is not yet installed is PENDING, and pages only after 7 days** (r1 drift blocker). A shorter clock pages through every review; a longer one hides a forgotten install. The age is the OLDEST commit since the install (r2).
3. **`token-refused` pages are recorded and alerted but NOT sticky; wrong-password / missing-row / login-failing / malformed-login pages ARE sticky** (r2). A DB blip heals; a wrong password does not.
4. **"login-failing" needs two failed loopback logins at least 10 minutes apart with no success between** (r2: two a minute apart is an app restart).
5. **Not built: a direct-append fallback when the alert CLI itself fails** (r2 minor). The staging watchdog has one; I left this path with the journal as its floor and state it.
6. **Not built: hashing the host key's VALUE in root's known_hosts** (r2 minor). The mint pages on its own failure.
7. **The ledger is dtapi:dtapi 0600, not "root-owned" as §2.2 item 4 said** — dt-api must append to it. So the budgeted account can rewrite the budget's record. Accident guard, stated.

## WHAT CHANGED FROM THE PRE-AUDIT, AT STEP 3 (amendments for the scope's STEP-3 AMENDMENT at Step 10)
| pre-audit said | built | why |
|---|---|---|
| drift check hashed against "its committed copy" | against the blob at the RECORDED INSTALLED sha (`/var/lib/dt-install-drift/installed.sha`, which must be on the reviewed branch); later commits are PENDING | the branch head moves in review; r1 |
| drift check daily | daily (05:15Z) — the first build was hourly and was wrong | r1 |
| the page (C6) | stderr to the caller + `page.json` + the daily drift run raising ONE ALERT PER FAILURE CLASS through `dt-unit-failure@` (a new class is a new alert) | GB-7: who it reaches; r1/r2 dedupe |
| mint reuse checked with `/api/auth/verify` | checked with `GET /api/settings` (runs the DB user lookup); verify only classifies a 401 | verify is signature-only (r1) |
| exit 3 = "not sent" | exit 3 = not sent OR sent-and-never-answered; a request sent AND answered 401 whose re-mint then fails exits **1** with the app's body | r2 |
| `LOCK_TIMEOUT` for callers | 90 s (a slow mint can hold the lock ~50 s); the setter waits 120 s | r2 |
| read denylist (b) | the Step-3 census: **26** routes (list below) | C1 |
| grammar | as r4, with the path match CASE-INSENSITIVE (Express is) and any `.`/`..`/empty segment refused (C10) | the suite caught the first build refusing `/API/...` as malformed |

## THE CENSUS (C1) — GETs that run work
**Method:** every `.get(` definition in `server/routes.ts` (367) and the 15 mounted sub-router files (75 more; 442 total), each handler body read and followed one level into what it calls. **Control:** `GET /api/system/formula-audit`, which no path match finds (it has no `/run`) — found. A claim-only reader then hunted the other way and added three test harnesses; its recall on the known positives was ~10 of 23, so **its silence past one call level is weak evidence (C11).**
**Denied (26):** `/api/audit/run` · `/api/signal-audit/run` · `/api/system/formula-audit` · `/api/system/formula-audit/run` · `/api/system/feed-health/run` · `/api/reb-2-12/run` · `/api/reb-2-12/run-all` · `/api/reb-2-14/run` · `/api/reb-2-15/run` · `/api/reb-2-14-15/run-all` · `/api/execution/timing/export` · `/api/diagnostics/kraken-documentation` · `/api/vts/export` · `/api/vts/audit` · `/api/vts/skipped-signals/export` · `/api/database/status` · `/api/filters/diagnostics` · `/api/active-engine/diagnostics/scan` · `/api/active-engine/filtered-pairs` · `/api/learning/profile/:id/evaluate` · `/api/strategic/recommendations` · `/api/diagnostics/tec/costs` · `/api/diagnostics/tec/costs/:symbol` · `/api/test/kraken-balance` · `/api/test/finnhub-feed` · `/api/learning/fallback-test`.
**Allowed ON PURPOSE, stated:** ordinary dashboard reads whose side effect is incidental and which the website triggers on every load — the price refresh on a stale price (`/api/active-engine/active-trades`, `portfolio-summary`, `flatten-precheck`, `/api/diagnostics/i7-price/status`), the cost-cache fill (`/api/pairs/ranked`, `/api/system/entropy`), a cached recompute or broadcast (`/api/state/summary`, `/api/state/debug`, `/api/system/health`), a first-run config row (`/api/system/config`). **Judgement call to attack:** where I drew that line.
**Corrected at r1:** `GET /api/admin/users` returns a SANITISED list — only `GET /api/user/profile` returns a hash. `/api/admin/*` stays denied as an account route.

## C10 — MEASURED ON STAGING'S OWN EXPRESS (4.21.2), not reasoned
`tests/c10_express_variants.js`, run on staging as deploy against the installed express, 5 routes × 19 spellings. **Express routes to the handler:** upper/mixed case, a trailing `/`, `?x=1`, `/?x=1`, **`/api//x`** and **`#x`**. **It does NOT route:** `/.`, `/./`, `/x/..`, `/./x`, `%2d`, `;x`, `%20`, `//` at the end, `//api`. ⇒ **every spelling Express accepts is either denied by name (case, trailing `/`, query — canonicalised) or refused as malformed (`//`, `#`)**; the suite asserts each.

## C1-C11 — WHERE EACH LANDED
| cond | where | evidence |
|---|---|---|
| C1 census control | the list above | control found; pinned in the suite so dropping an entry FAILS it |
| C2 bcrypt shape | setter `hash_value` | MEASURED on staging: python3-bcrypt 3.2.2 `gensalt()` → `$2b$12$` (your hypothesis was right), `gensalt(rounds=10)` → `$2b$10$`; the live row's current prefix `$2b$10$`. Shape + length asserted; (3)'s login is the proof |
| C3 name the bucket | every login writes `bucket: loopback` to the ledger | the 127.0.0.1 key: no X-Forwarded-For is ever sent (a mutation adding one is killed) |
| C4 headers | draft-6 `RateLimit-Remaining`/`RateLimit-Reset` MEASURED in staging's `dist/index.mjs` (`standardHeaders:true` → draft-6); the window is fixed per key (`:71`, `:132`, `:150`); ANY ledgered login that left the bucket at 0 blocks dt-api until its reset; the setter waits before (6) | suite + mutation |
| C5 grammar binds args only | `parse()` vs the internal login/verify/settings calls | by construction |
| C6 three cases + who is paged | `classify_401`: route's own 401 / dead token (re-mint) / signature-valid-but-refused (page: `crew-user-missing` drops the token; `token-refused`) | suite; the alert path is tested with the unit name systemd really passes (r2) |
| C7 lock timeout | 90 s callers / 120 s setter; own refusal text | suite |
| C8 stale mirror is health | drift: SOURCE line when the source is stale or the installed sha is not fetched yet; INSTALL only when present-but-not-ancestor | suite |
| C9 | OBJ-4 drift, not this increment | — |
| C10 | above | measured |
| C11 | dt-api header + README | stated |

## TESTS — all on Helsinki as root, each running a copy of the COMMITTED file that differs only in its CONSTANTS block (asserted)
- dt-api **333/333** · setter **125/125** · install-drift **32/32** · alert **9/9** · staging-session **11/11**.
- Mutation controls: dt-api **31/31** killed · setter **20/20** (one retired as an equivalent mutant, stated in the runner) · install-drift + alert + staging-session **22/22**.
- Mutation controls (each breaks ONE property; the runner refuses to report unless the unmutated suite passes, and counts a crash as a problem, not a kill): see "MUTATIONS" below.
⚠️ **Two of my own instrument failures, caught by those rules:** the first mutation run reported 20/20 kills against a suite that did not parse; a later run died on Windows line endings in the stand-in `psql`. Both now fail loudly.

## §9.4 — TWO FINDINGS OUTSIDE THE SCOPE
1. **`GET /api/diagnostics/kraken-documentation` APPENDS to `replit.md`, a tracked file, in the deployed tree** — one call would make `dt-deploy` refuse every later deploy (dirty worktree). No caller anywhere. **DISPOSITION: added to `B-SEC-HARDEN` (`#1022`, mine) to delete under rule 18; dt-api denies it meanwhile.**
2. **`GET /api/files/download/:category/:filename` has no containment check** (`routes.ts` the route; `file-persistence.ts` `readFile`/`fileExists`: `path.join(BASE_PATHS[category], filename)` with the Express-decoded param) — **any logged-in caller could read files outside the folder, including the app's `.env`.** nginx access logs, all 15 rotations: **0** requests to it (control: 1,392 to `/api/settings`). dt-api cannot reach it with a traversal (`%` and `..` refused). **DISPOSITION PROPOSED: a hotfix (`workflow-hotfix`) — a one-function containment check — because the published password was live until 09-29 and a token issued from it lasts 7 days; otherwise item on `#1022`. Your call.**

## THE INSTALL PLAN (Step 6) — run only after both gates clear
**Staging:** record `sudo -l -U deploy` → accounts (`dtapi` system/nologin; `dtmint` `/bin/sh`, password field `*`) → dirs → every file from the governance clone AT THE REVIEWED SHA → `visudo -cf` then `install -m 0440` → `daemon-reload` → run-only PGPASSFILE → **the setter** → `installed.sha` → `enable --now` the timer → `dt-install-drift` by hand must PASS → `sudo -l -U deploy/dtmint` after (stored).
**Helsinki:** `agent-staging-session` + units + drift + drop-ins; root's known_hosts already holds staging's key (measured); `installed.sha`; `enable --now`; run the mint once; `--check` both agents via `GET /api/settings`; `dt-install-drift` PASS; the two password files **moved** (not deleted) to the rollback dir and logged in `DELETED_COMPONENTS_LOG`.
**Then Step 7:** OBJ-1(a)-(h) as amended; (d)'s limiter control runs only when no mint is due (it locks loopback logins for 15 min).

## HONEST LIMITS
- Everything here is an accident guard while `deploy` holds `NOPASSWD: ALL` (`#1102`).
- Reads are default-allow against a one-level census (C11).
- The setter's hash is a SQL literal: on a server-side SQL error it can appear in Supabase's own log and, during the UPDATE, in `pg_stat_activity`. Client-side output is scrubbed.
- A loopback login outside the ledger (e.g. `CLAUDE.md` §7's curl) spends the bucket unseen; the setter then fails safe (restores a verified value).

## ROUND 3 — OPEN FINDINGS (0 blockers; the fix list for the next session, each to be re-derived at the object first)
**dt-api**
- S1 `login-failing` has no UPPER bound on the gap: two self-healed failures a day apart (a mint during a restart, then a brief 5xx) make a sticky page; and every non-200/401/404/429 status (400/403/3xx) lands on the 5xx branch. ⇒ bound the window (e.g. both failures inside 60 min) and classify statuses.
- S2 the page merge keeps the FIRST kind, so a later STICKY cause (`crew-password-wrong` after a standing `token-refused`) is hidden from the drift class and the refusal text. ⇒ the class must reflect the worst/sticky cause; stickiness must be read from the kind too (a hand-written page has no flag).
- minors: an unguarded negative-cache write bypasses the page; `classify_401`'s token unlink runs outside the lock; `/api/settings` as the probe mixes auth with handler health (a handler 500 blocks the mint daily); non-object JSON bodies raise; BrokenPipe on stdout exits 3; the query grammar cannot express `?symbol=BTC/USD` (spec limit — name it to Langston).
**setter**
- S1 reconcile's live login accepts an env naming ANOTHER user → can delete the only copy of the new value and exit 0. ⇒ require `DT_API_USER == CREW_USER`.
- S2 in phases saved/temp-written a CHANGED row means someone else changed it; the code then restores over their change. ⇒ page and stop, do not restore.
- S3 the reconcile's third login treats 429/5xx/no-answer as "refused" → sticky page + over budget. ⇒ not an answer = exit 3, no page.
- S4 a failure at (6) clears the page at (5) and restores without a durable page. ⇒ re-raise the page on that restore.
- S5 an env-restored reconcile exits 0 while a sticky page still blocks dt-api. ⇒ clear the page when the restored value logs in.
- minors: exit-code contract (checkpoint interrupt → 3; orphan → 2; uncaught `ensure_state`/lock errors; (7) errors); restore the env copy's existence BEFORE the DB; reconcile temp-ok path order; PDEATHSIG fork race; hash as SQL literal (stated); PGPASSFILE not removed on `pg_env` refusals + prefix check; `PGSSLMODE=require` (no cert check — use `verify-full` with the system CA if Supabase's chain validates); dt-api `die()` texts inside the setter; the (6) wait's +2 margin cut at 900; fsync `/etc/dt-api` after the temp env; `durable_page` overwrites the first cause.
**install-drift / alert / mint**
- S1 = dt-api S2 (the class from the first page kind).
- S2 one key per CLASS still swallows a new failure of the same class on a different file. ⇒ key per (class, subject).
- S3 the paging INSTANCE (`dt-unit-failure@dt-install-drift.service`, `agent-unit-failure@…`) is not checked, only a `@probe` instance. ⇒ check the real instances.
- S4 staging's freshness stamp is FETCH_HEAD, which a FAILED fetch still refreshes — the stale check can never fire there (after the flip the checker's fetch fails). ⇒ use the ref's own movement or the checker's fetch-ok signal.
- S5 a script that cannot start leaves the LAST run's classes file. ⇒ `ExecStartPre=` clears it.
- S6 two install flows own the same Helsinki files (the systemd README flow and `installed.sha`). ⇒ drop the shared files from this manifest, or make `installed.sha` per-file.
- S7 a failure of the paging step itself is silent. ⇒ OnFailure on the failure unit (journal-only floor) or a direct-append fallback.
- S8 a git error reads as "waited over 7 days"; both rev-parses failing is a silent skip. ⇒ SOURCE, never PENDING-STALE.
- minors: empty dtapi shadow field passes; sudoers `@include`/`%group` gaps; stamp/page read by path (FIFO); a hand run within 30 min of an install fails SOURCE (document the wait); README overstates dtmint's protection; `.gitattributes` has no `eol=lf` for these trees (the shebangs break from a Windows copy — measured this session); the README points at this change list.

## THE FILE-ROUTE FINDING — LANGSTON RULED 2026-09-30T00:33Z, KYLE APPROVED THE PROBE
- **Ruling:** hotfix YES for an EDGE mitigation, NO for an app deploy (a named-sha deploy still drags 72 h of others' pending work — `#1001` shape). **The edge rule is an ALLOWLIST** — the final segment must match `^[A-Za-z0-9_.-]+\.json$` for the report routes (and the download route's own allowed shape), case-insensitive on the path; name which layer terminates (Caddy vs nginx) by the probe; file the repo-canonical mirror of the nginx change in the same turn (`#1004`). **B (a containment check in the three handlers) rides the next normal deploy**, placed first in `B-SEC-HARDEN` (`#1022`) — the plan row must be NAMED. **Pre-registered flip:** if the pre-block probe shows reach from outside AND the census finds a secret-bearing file, B becomes its own coordinated deploy that day.
- **The census he asked for (done, 2026-09-30 ~00:50Z):** every `.json` readable by the app account under `/home/deploy /tmp /etc /opt /srv /var/lib /var/log /usr/local` (node_modules, .git and caches pruned): **6,861 files; 0 with a token-shaped value** (sk-, ghp_, AKIA, AIza, private-key block, JWT, bcrypt) — the scan's control, a planted file, was found. Six files carry a `password` KEY: four are the users-table column definition in schema snapshots; two are `docs/audits/phase-8.8.1-8.8.2-audit.json` (`auditMetadata.testCredentials.password`), whose value hashes to the **published, since-rotated** testuser123 password (sha256 prefix `6faba6e4ed72` both) — dead, and OBJ-2's literal sweep. ⇒ **the census side of the flip condition is NOT met.**
- **Kyle, 2026-09-30:** "The test is fine" — the one benign probe (read `package.json` through route #1 before and after the block, our staging only) is approved. **Not yet run.**
- His two additions for `#1022`: the unsanitised `Content-Disposition` filename (not live — Node rejects CR/LF); `GET /api/audit/run` is a second anonymous surface in the same router.
- His alert routing: disk `5c2e53a2` → CC-B, leave active until the 10-01 relief lands; `d9caf6f5` + `9acca871` → CC-A; `1ae9a06b` → CC-C; `dff68e3b` → Kyle.
