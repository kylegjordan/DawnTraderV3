# B-TOKEN-WATCH-LIQ-SHED-HOTFIX — COMPLETION NOTE

change-class: hotfix · **Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1247` · **Parent:** `B-TOKEN-WATCH-BIRTH-CAP` (KD-90)
**Scope and record:** `Claude Comms and Packages/Scope Files/B_TOKEN_WATCH_LIQ_SHED_HOTFIX_SCOPE.md` (§6 holds the full record).

**What broke.** token-watch's liquidity reads (`pool_sol_reserves`, ~2.3k credits/hour since the follow-up switch-on) were spending the free Helius credit cycle (10-27 → 11-27) that the new-coin census needs. At 02:36Z on 11-16 the cycle was 854,007 of 1,000,000 spent and projected dry about 11-17 afternoon. The ledger's shed gate keys the calendar month, so it still allowed the spend.

**What was done.** `LIQUIDITY_AUDIT_CARVE` 190,000 → 20,000 (`953ce3af5`; comments re-headed `21118d692`), so liquidity sheds first, as the study's scope §5.1 orders. Births are never shed; the follow-up keeps running on its free source.

**Langston.** Gate (A) APPROVE AS IS at `953ce3af5` before staging (Discord `1571723150582874195`), with conditions C-1..C-5; C-2 and C-3 were folded into the parent and landed there (carve 0 by ruling (A); the installer's `import config` check).

**Installed.** 2026-11-16T03:07:10Z by `install_storage.sh` from the blob at `953ce3af5`; live `config.py` sha256 equals the blob.

**Verified once (§4).** Follow-up run 8 (05:35:42Z → 08:28:59Z, success, 0 errors) is the first run on the carve. Every one of its 9,707 pool reads was shed, none read by any other source; the vendor `rpc` counter held at 35,751 from 05:36Z to 08:47:44Z; the ledger's liquidity bucket held at 35,771. Control: vendor `webhooks` +316 against census births +320 over the same 18 minutes. The symptom is gone by the instrument that showed it.

**Residual.** Births alone still exhaust the cycle about 11-19 evening; that is the parent batch, at Step 4. Paced liquidity is a proposal for Kyle's list, not this hotfix.

**Governance files changed:** this note · the hotfix scope §6 · `BATCH_CATALOG.md` (one row) · `CHANGES_AND_FIXES.md` (`FIX-2026-11-16-A`, verified) · `RUNNING_ISSUES.md` (`#1247` line; stays open) · `GOVERNANCE_EXCEPTIONS.md` (row → open-retired) · `DEPLOY_WINDOWS.jsonl` (close row).
