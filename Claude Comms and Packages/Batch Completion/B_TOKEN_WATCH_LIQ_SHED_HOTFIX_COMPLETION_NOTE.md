# B-TOKEN-WATCH-LIQ-SHED-HOTFIX — COMPLETION NOTE

change-class: hotfix · **Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1247` · **Parent:** `B-TOKEN-WATCH-BIRTH-CAP` (KD-90)
**Scope and record:** `Claude Comms and Packages/Scope Files/B_TOKEN_WATCH_LIQ_SHED_HOTFIX_SCOPE.md` (§6 holds the full record).

**What broke.** token-watch's liquidity reads (`pool_sol_reserves`, ~2.3k credits/hour since the follow-up switch-on) were spending the free Helius credit cycle (10-27 → 11-27) that the new-coin census needs. At 02:36Z on 11-16 the cycle was 854,007 of 1,000,000 spent and projected dry about 11-17 afternoon. The ledger's shed gate keys the calendar month, so it still allowed the spend.

**What was done.** `LIQUIDITY_AUDIT_CARVE` 190,000 → 20,000 (`953ce3af5`; comments re-headed `21118d692`), so liquidity sheds first, as the study's scope §5.1 orders. Births are never shed; the follow-up keeps running on its free source.

**Langston.** Gate (A) APPROVE AS IS at `953ce3af5` before staging (Discord `1571723150582874195`), with conditions C-1..C-5; C-2 and C-3 were folded into the parent and landed there (carve 0 by ruling (A); the installer's `import config` check).

**Installed.** 2026-11-16T03:07:10Z by `install_storage.sh` from the blob at `953ce3af5`; live `config.py` sha256 equals the blob.

**Verified once (§4).** Follow-up run 8 (05:35:42Z → 08:28:59Z, success, 0 errors) is the first run on the carve. All 9,597 of its pool reads were shed, none by any other source (run 7, before the carve, had 10,315 across five other sources and none shed); the vendor `rpc` counter held at 35,751 from 05:36Z to 08:47:44Z; the ledger's liquidity bucket held at 35,771. Control: vendor `webhooks` +316 against census births +320 over the same 18 minutes. The symptom is gone by the instrument that showed it.

**Residual.** Births alone still exhaust the cycle about 11-19 evening; that is the parent batch, at Step 4. Paced liquidity is a proposal for Kyle's list, not this hotfix.

## Governance ledger (class `hotfix`)
Required vs judged, per `scripts/governance-checker/config.mjs` (`CLASS_DOCSET.hotfix` and `LEDGER_ROWS`):

| tier | document | status for `hotfix` | verdict | one line |
|---|---|---|---|---|
| T1 | CHANGES_AND_FIXES.md | **required** (`CLASS_DOCSET.hotfix.required`) | ✅ | `FIX-2026-11-16-A`, verified |
| T1 | the four session task lists | **required** (`LEDGER_ROWS.task_lists`, every class) | ✅ mine / N/A — not mine ×3 | `CC_INFRA_SESSION_TASK_LIST.md` §0a: the hotfix row (verified, closes on Langston's Review) |
| T1 | BATCH_CATALOG.md | required by the hotfix skill §5 | ✅ | one row |
| T1 | COMPLETION_REPORT | judged (conditional) — applicable | ✅ | this note |
| T1 | memory (`MEMORY_CC_INFRA.md`) | required | ✅ | position block |
| T2 | RUNNING_ISSUES.md | judged — applicable | ✅ | `#1247` line; stays open for the parent |
| T2 | GOVERNANCE_EXCEPTIONS.md | judged — applicable | ✅ | the declared-open row → open-retired |
| T2 | DEPLOY_WINDOWS.jsonl | judged — applicable | ✅ | close row |
| T2 | SYSTEM_IMPACT_MAP.md / SYSTEM_MANUAL.md | judged — N/A | N/A | a constant changed; no component or architecture changed |
| T2 | DELETED_COMPONENTS_LOG.md | judged — N/A | N/A | nothing removed |
