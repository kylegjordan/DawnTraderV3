# B-MUTATING-ROUTES-AUTH — HOTFIX SCOPE (2026-10-21)

change-class: hotfix

**Owner:** CC-A. **Issue:** `#1228`. **Directive:** Kyle, 2026-10-21 (Desktop), option 2: *"Go with option 2."* — the routes that change something get the login check now; the read-only ones stay at plan row 197a (Infra Claude, end of the sprint).
**Path B** (found while auditing `B-STATUS-BOARD`, `Scope Files/B_STATUS_BOARD_PRE_AUDIT.md` §A4).

## 1. QUALIFYING TEST
1. **Broken now:** staging is reachable from the internet, and these routes answer and act with no login. Measured from the laptop over `https://188.245.193.8.sslip.io` with no token: `GET /api/vtp/status`, `/api/mbim/status` → 200 (control `/api/system/canonical-map` → 401). Anyone can stop the mini-book integrity monitor the server starts at boot (`server/index.ts:386`), run Kraken requests at will, rewrite AI conversation titles in the database, or push back a real auto-recovery.
2. **Harm from waiting:** Kyle owns the urgency call and made it (option 2).
3. **Blast radius small and proven:** §2.

## 2. BLAST-RADIUS AUDIT
**Mechanism:** there is no router-level auth anywhere (`apiRouter.use` adds only normalisation and trace, `server/routes.ts:370`, `:407`); each route opts in by naming `authenticateToken` (`server/routes.ts:181-244`). These routes do not. `authenticateToken` refuses with 401 when the header or token is missing or invalid, loads the user from the database, and calls `next()` (read at the ref).

**The set — every unauthenticated route under `/api` that writes state or triggers work** (census by a read-only helper agent, each handler re-read by me at the ref):
| route | what it does | callers (repo-wide) |
|---|---|---|
| `POST /api/vtp/start` `:798` / `stop` `:808` | starts/stops the verification test protocol: timers, log directory and summary files | none |
| `POST /api/mbim/start` `:829` / `stop` `:839` | starts/stops the mini-book integrity monitor (5-minute Kraken audits) | none (the server starts it at boot, `index.ts:386`) |
| `POST /api/mbim/audit` `:862` | runs one Kraken audit now | none |
| `POST /api/internal/active-engine/register-session` `:5725` / `deregister-session` `:5750` | overwrite/clear the in-memory simulation-session record, read by `routes.ts:5782`, `:11748`, `context-refresh-coordinator.ts:194`, `:300`, `system-health-service.ts:60` | none over HTTP; the engine uses the in-process function (`active-engine-service.ts:833`, `:1105`); the old HTTP caller was deleted |
| `PATCH /api/conversations/:id` `:13990` | writes an AI conversation's title and context size to the database | the client, `chat-container.tsx:190`, `chat-history-sidebar.tsx:83`, via `apiRequest`, **sends the token** |
| `POST /api/screener/test` `:14805` | a Kraken call steered by the request body | none |
| `POST /api/health/recovery/test` (`health.ts:203`, mounted `routes.ts:21329`) | runs `healthMonitor.executeRecovery`, which sets the recovery cooldown and can push back a real auto-recovery | `diagnostic-reports/phase-41F-G-recovery-validation.sh`, curl **with** a bearer token |
| `POST /api/back-audit/run` (`back_audit.ts:12`, mounted `:21373`) | ~25 internal calls to `/api/*/status` and a report file | none |
| `GET /api/audit/run` (`audit.ts:22`, mounted `:21346`) | runs the system audit and writes a report | none (named only in `dt-api`'s deny list, `comms-infra/staging/dt-api:122`) |
| `GET /api/signal-audit/run` (`signal-audit.ts:8`, mounted `:21351`) | runs the signal audit and writes a report | none (deny list only, `dt-api:123`) |

**Left out, with the reason:**
- `POST /api/market-context/analyze` `:14332` — it reads `req.user!.id` first and throws, so it returns 500 before any work, every time. Adding the login check would make it **work** and call the AI service from the dashboard's goals widget, which Kyle has put off-limits (2026-10-19). It is harmless as it stands; it stays with row 197a.
- `POST /api/kill-switch/check` `:14881` — returns 410 only.
- `POST /api/health/recovery/trigger` (`health.ts:144`) — logs and returns; no state.
- `POST /api/diagnostics/dse/reset` — unreachable: `apiRouter`'s catch-all (`routes.ts:21399`) answers first (live: `/api/diagnostics/dse/status` → 404).
- `/api/auth/*` — login must stay open; `/auth/register` already refuses with 403.
- The read-only `GET`s — row 197a.

**Other call sites with the same defect:** the census found no other unauthenticated `POST`/`PUT`/`PATCH`/`DELETE` under `/api` besides those above and `/auth/*`, including multi-line registrations. The `GET`s were checked for side effects on a filtered list only (external lookups: `/market/ticker`, `/stocks/*`, `/symbol/data`, `/crypto/search`, `/kraken/cache-stats`); those are reads with an outside call, and stay with row 197a.

**State this change writes:** none. It only adds a refusal in front of existing handlers. **Readers that could break:** a caller that calls one of these without a token. The census found one caller each for two routes, and both send the token. The back-audit's own internal calls go to `/api/*/status` routes, which this change does not touch.

**Larger design fault?** Yes, and named rather than patched: auth is opt-in per route with no router-level default, which is how 89 routes ended up open. That is the read-only remainder's batch (row 197a, `B-TOKEN-WATCH-AUTH`, Infra Claude), not this hotfix.

## 3. THE FIX
- The nine routes in `server/routes.ts` gain `authenticateToken` inline.
- The four sub-router routes get a guard registered on `apiRouter` **before** their routers are mounted: `apiRouter.post('/health/recovery/test', authenticateToken)`, `apiRouter.post('/back-audit/run', authenticateToken)`, `apiRouter.get('/audit/run', authenticateToken)`, `apiRouter.get('/signal-audit/run', authenticateToken)`. A refused request stops there; an accepted one passes on to the router's own handler. Nothing in the sub-routers changes.
- A unit test reads `server/routes.ts` at the ref and fails if any of the thirteen loses its check or a guard moves below its mount.

## 4. VERIFICATION, AFTER LANGSTON'S GATE AND THE DEPLOY
The same instrument that showed the defect: each of the thirteen, called from the laptop with no token, returns **401** (a refused request never reaches the handler, so nothing runs); control `/api/system/canonical-map` 401; and with a valid login the page that renames an AI conversation still works.
