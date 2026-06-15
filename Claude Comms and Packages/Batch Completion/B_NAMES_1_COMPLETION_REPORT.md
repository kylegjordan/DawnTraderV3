# B-NAMES.1 (xStock — #298 backfill half) — Completion Report

**Batch:** B-NAMES.1 (xStock) · **Date:** 2026-06-15 · **Author:** Claude New (CC-B)
**Commit:** `8e1526a9f` · **CI:** run `27556282043` all-4-green
**Deploy:** staging `8e1526a9f` → migration applied → backfill ran (33/33) → build → restart → HTTP 200 → §9.3 UI-verified.

> **This batch CLOSES RUNNING_ISSUES #298.** B-NAMES (crypto) shipped the crypto half earlier today; B-NAMES.1 ships the xStock half. Both halves are now live + UI-verified.

---

## Objective (B_NAMES_SCOPE.md §6 / #298 / Langston Step-1 C5 + Q2)

Fix the xStock Symbol-column ticker-echo (Kyle's screenshot: PALL showing "PALL"): root-cause the discovery name-fetch that stored the ticker, and fill the bounded set of xStock names Finnhub misses.

| Deliverable | Status | Evidence |
|---|---|---|
| **Root-cause the ticker-echo (C5)** | **YES** | Discovery name-fetch stored the bare ticker on a Finnhub miss (Finnhub's company-profile endpoint covers operating companies, not the ETFs that are most of these). Now stores `?? null` at both sites (`discoverer.ts:603` upsert, `:638` file-cache). `XstockSpotEntry.name` → `string\|null`; DB column dropped NOT NULL. A null name → `getXstockName` returns null → UI hides the line, never an echo. |
| **Nullable-`name` blast radius** | **YES — clean** | Compile-driven probe: zero new tsc errors above baseline. The 3 type sites (`XstockSpotEntry.name`, `DbUniverseRow.name`, file-cache parsed type) + 2 assignment sites were the whole surface; `getXstockName`/`upsertUniverseRow`/the `/api/xstocks/asset-names` `if(entry.name)` guard/`rowsToEntries` already null-safe. |
| **Curated Backed-ETF map (Q2)** | **YES** | `CURATED_XSTOCK_NAMES` (33 vetted entries) in `shared/asset-classes.ts`, wired into the discoverer fallback `override → Finnhub → curated → null`. Vetted static map (Langston's call over a flaky stock API); TBLL/TOTL web-verified. No-echo invariant unit-tested. |
| **Backfill the existing 33 rows** | **YES** | `scripts/b-names-1-xstock-name-backfill.ts` (`npm run b-names-1-backfill`) — imports the map (SSOT, no name dup), idempotent `WHERE name = split_part(symbol,'/',1)`. Ran at deploy: **33/33 rows updated** (logged each). |

## Verification

- ✅ **§9.3 UI (Claude-in-Chrome, staging ML page): PALL now renders "abrdn Physical Palladium Shares ETF"** — Kyle's exact screenshot example — plus PPLT (Platinum), SLV (iShares Silver Trust), SPY (SPDR S&P 500 ETF Trust), SCHF (Schwab International Equity ETF), XBI (SPDR S&P Biotech ETF), TQQQ (ProShares UltraPro QQQ). All were ticker-echoes (hidden) pre-batch.
- ✅ `/api/xstocks/asset-names` count=490, all xStock symbols named.
- ✅ **Close-verify (Langston's Step-4 condition):** ran a discovery refresh, then scanned the live overlay → **ZERO exact bare-ticker echoes across all 490 names** (the root-cause bug is gone). The lone case-insensitive match (LYFT→"Lyft") is a real company name the client `realName` guard hides because it re-cases to the ticker — acceptable (adds nothing visually). **Discovery surfaced a separate PRE-EXISTING infra gap (#299):** `writeFileCache` has been EACCES-failing on staging since ≥06-12 (`deploy` can't `mkdir /var/lib/dawntrader`), so the layer-3 file cache is never written on this box — the file-cache echo fix is therefore unobservable on staging (correct for any writable environment) and the durability fallback is absent. NOT a B-NAMES.1 bug; homed #299 for an ops fix.
- ✅ Compile-driven probe tsc-baseline-clean · vitest 1945/1945 (incl. 3 new) · CI all-4-green · deploy HTTP 200.
- ✅ Backfill idempotent (re-run = 0 rows matched); going forward the daily discovery cron re-applies the same map via the fallback chain.

## Langston gates
- **Step-1** APPROVE-WITH-CONDITIONS (split ratified; **C5** root-cause-the-echo → store null; **Q2** vetted static map over a flaky stock API).
- **Step-4** CHANGES-NEEDED → fixed in-batch → APPROVE. Langston caught a real miss: the dispatch claimed both discoverer fallback sites were converted to `?? CURATED ?? null`, but only Stage-5 (`:603`, DB upsert) had landed — Stage-8 (the layer-3 file-cache writer) still recomputed `name ?? sym.split('/')[0]`, leaving the ticker-echo latent on the cold-start fallback path. The compile-driven probe couldn't surface it (`string` trivially assignable to `string\|null`) and the no-echo unit test doesn't cover that path — a sharp catch. **Fixed his "better still" way** (commit `ce9b8b9a3`, CI `27556937761` all-4-green): Stage-5 captures each computed `finalEntry` into a Map; Stage-8 reuses it verbatim (`Array.from(computedEntries.entries())`) — a single source of name computation, so the file cache can never recompute-diverge or re-echo. On-disk cache re-stamped via a discovery refresh. **Lesson recorded:** verify with the actual diff, not a claim that an edit landed (the dispatch over-claimed two-site coverage).

## Governance files changed
- `1-system-manual/RUNNING_ISSUES.md` — #298 → **RESOLVED** (both halves shipped + UI-verified) + **#299 OPEN** (pre-existing `writeFileCache` EACCES on staging → layer-3 fallback non-functional; surfaced during close-verify, homed for an ops fix).
- `1-system-manual/BATCH_CATALOG.md` — new B-NAMES.1 row.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — Layer-2.7 sibling note → **LANDED** + #298 CLOSED.
- MEMORY (3-way: user-cache truth + in-repo mirror + Langston Helsinki).
- `Claude Comms and Packages/Batch Completion/B_NAMES_1_COMPLETION_REPORT.md` (this) + `Langston Design Asks/B_NAMES_1_STEP4_CODE_REVIEW.md`.

## Next
**#298 is CLOSED.** Resume the paused **P19-B4b D5** split-brain isolation implementation (the heavier Phase-19 thrust): S1 cluster `Map<mode,Mgr>` + locks / liveness DB-SSOT (fold 5 readers, H1-commit-broadcast + H2-settling-guard) / S3 shared `${userId}:${mode}` Kraken limiter + 12 active-pipeline sites / S4 `Map<mode,Map>` / S6 mode-prefix — each verify-before-edit per the #297 lesson; Langston Step-4 per chunk. B6.5 (crypto-resurrect #235) + B6.6 (liveness #236) still hard-gate B7b.
