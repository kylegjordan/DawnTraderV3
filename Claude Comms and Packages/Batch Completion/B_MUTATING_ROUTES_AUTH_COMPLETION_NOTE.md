# B-MUTATING-ROUTES-AUTH (#1228) — hotfix completion note (2026-10-21)

**Owner:** CC-A. **Class:** hotfix (Kyle 2026-10-21, option 2). **Scope:** `Scope Files/B_MUTATING_ROUTES_AUTH_SCOPE.md`.

**What broke.** Thirteen staging server addresses that change state or run work answered with no login: the order-book integrity monitor's start, stop and audit; the verification test protocol's start and stop; the simulation-session register and deregister; the AI conversation rename; the screener's Kraken test; the recovery test; and three audit runs. Found by the route census for `B-STATUS-BOARD` (89 of 671 `/api` routes have no auth).

**What was done.** The nine in `server/routes.ts` name `authenticateToken`; the four in sub-routers are guarded on `apiRouter` above their mounts. A structural test pins each check, each guard's position, and the order of the two `healthRouter` mounts across `routes.ts` and `index.ts` (Langston's addition).

**How it was verified.** After the deploy of `d307debe5`: every one of the thirteen returns 401 with no token. `GET /api/audit/run` was already refused at the web edge with 403, so it and three others were also called on the box at `127.0.0.1:5000`, each 401. The read-only control `/api/mbim/status` still answers (it stays at row 197a). Logged in, through Kyle's Chrome session, `POST /api/mbim/audit` and `GET /api/signal-audit/run` both returned 200, so accepted requests still reach their handlers. The logged-in conversation rename was **not** exercised: there is no conversation on staging.

**What Langston said.** PROCEED on `da317a433` after reviewing the actual diff (`dt-review show` of the sha), re-deriving the nine and the four, the five exclusions and the single mounts. One addition, made: the cross-file mount-order test, proved by swapping `index.ts:478` and `:484`. The rebased commit `965ada38e` has the same patch-id as the reviewed one.

**Governance ledger (hotfix doc set):**

| tier | document | verdict | line |
|---|---|---|---|
| T1 | `CHANGES_AND_FIXES.md` | ✅ | FIX-2026-10-21-A |
| T1 | `BATCH_CATALOG.md` | ✅ | one row |
| T1 | `SPRINT_TO_LIVE_PLAN.md` | ✅ | §0a CC-A item 1 reads VERIFIED with this note linked |
| T1 | the four session task lists | ✅ mine / N/A ×3 | `CC_A_SESSION_TASK_LIST.md` records the hotfix as done; the other three are not touched by it |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1228` annotated; open for the read-only remainder at row 197a |

**Records.** `CHANGES_AND_FIXES.md` FIX-2026-10-21-A; `BATCH_CATALOG.md`; `RUNNING_ISSUES.md` `#1228` (open for the read-only remainder, row 197a); `SPRINT_TO_LIVE_PLAN.md` §0a CC-A item 1. CI `39513246450`, four of four per job.
