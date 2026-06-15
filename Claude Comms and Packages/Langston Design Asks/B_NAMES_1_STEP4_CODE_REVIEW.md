# B-NAMES.1 (xStock — #298 backfill half) — Step-4 Code Review dispatch

**Batch:** B-NAMES.1 · **Date:** 2026-06-15 · **From:** Claude New (CC-B) · **Step:** 4
**Commit:** `8e1526a9f` on `migration/aws-supabase`. **CI:** run 27556282043 — all 4 GREEN.
**Bench:** tsc baseline OK (compile-driven probe — no regressions); vitest 1945/1945 (incl. 3 new).
**Deploy:** staging `8e1526a9f`, migration applied, **backfill updated all 33 rows**, HTTP 200, §9.3 UI-verified.

> **INFRASTRUCTURE NOTE:** do NOT `cd /mnt/gdrive` or run `git status`/`git log` on the gdrive mount. Everything is embedded below. For repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git show 8e1526a9f:<path>'`.

This closes the xStock half of #298 (your Step-1 split, C5 root-cause-the-echo + Q2 vetted-static-map both implemented). With B-NAMES (crypto) already closed, **#298 closes when you sign off here.**

---

## ROOT FIX — the discoverer stored the bare TICKER on a Finnhub miss (C5)

`xstock-universe-discoverer.ts` fell back to `?? symbol.split('/')[0]` at two sites, persisting e.g. PALL→'PALL'. Now `?? null`. A null name → `getXstockName` returns null → the UI hides the middle line (the #298 structural fix already shipped), never an echo.

```ts
// :603 (upsert path) — BEFORE → AFTER
- name: override?.name_override ?? finnhubMeta.name ?? symbol.split('/')[0],
+ name: override?.name_override ?? finnhubMeta.name ?? CURATED_XSTOCK_NAMES[symbol] ?? null,
// :638 (file-cache path) — same shape: meta?.name ?? CURATED_XSTOCK_NAMES[sym] ?? null
```

Nullable propagation (compile-driven probe enumerated the FULL surface — zero other consumers assume non-null):
- `XstockSpotEntry.name: string` → `string | null` (asset-classes.ts) + JSDoc.
- `DbUniverseRow.name: string` → `string | null` (universe-service.ts).
- file-cache parsed type `name: string` → `string | null`.
- `getXstockName` (`?.name ?? null`), `upsertUniverseRow` (`${finalEntry.name}` param), the `/api/xstocks/asset-names` endpoint (`if (entry.name)` guard), `rowsToEntries` — ALL already null-safe. No edits needed.
- DB column: migration `ALTER TABLE xstock_spot_universe ALTER COLUMN name DROP NOT NULL`.

## CURATED MAP — vetted static map for the bounded ETF set (Q2)

`CURATED_XSTOCK_NAMES` in `shared/asset-classes.ts` — 33 entries, the symbols Finnhub's company-profile endpoint misses (almost all ETFs; Finnhub covers operating companies, not funds — that's the structural reason, surfaced at audit). Wired into the fallback chain AFTER Finnhub, BEFORE null (Finnhub still wins for equities it covers; curated fills the fund gap). Sample:

```ts
'PALL/USD': 'abrdn Physical Palladium Shares ETF',
'SPY/USD':  'SPDR S&P 500 ETF Trust',
'QQQ/USD':  'Invesco QQQ Trust',
'TBLL/USD': 'Invesco Short Term Treasury ETF',     // web-verified
'TOTL/USD': 'SPDR DoubleLine Total Return Tactical ETF',  // web-verified
// ... 33 total: GLD/SLV/IWM/VT/VTI/TQQQ/XLE/XBI/ARKK/ARKG/IEMG/SCHF/PPLT/COPX/MOO,
//     the iShares MSCI country EW* series (AU/CA/DE/IT/CH/NL/ES/FR/SG/UK/BR), PARA, SAP
```

**The no-echo invariant is unit-tested** (the one place a careless future edit could reintroduce a ticker-echo): a test asserts no `CURATED_XSTOCK_NAMES` value equals its base ticker, + canonical-key shape, + the 5 key vetted entries.

## BACKFILL — the 33 existing rows (surgical, idempotent)

`scripts/b-names-1-xstock-name-backfill.ts` (`npm run b-names-1-backfill`) imports `CURATED_XSTOCK_NAMES` (SSOT — no name duplication) and `UPDATE ... WHERE symbol=$pair AND name = split_part(symbol,'/',1)` — only overwrites echoes, never a real name; re-run = no-op. **Ran at deploy: 33/33 updated.** Going forward the daily discovery cron re-applies the same map via the fallback chain.

## Verification
- Compile-probe: nullable `name` added ZERO tsc errors above baseline (the 3 type sites + 2 assignment sites were the whole blast radius).
- vitest 1945/1945. CI 27556282043 all-4-green.
- §9.3 UI (Claude-in-Chrome, staging ML page): **PALL now renders "abrdn Physical Palladium Shares ETF"** (your screenshot example); also PPLT/SLV/SPY/SCHF/XBI/TQQQ render their curated names. `/api/xstocks/asset-names` count=490, all named.

## Ask
Code-level sign-off on: the nullable-`name` propagation (anything I missed — the probe says no), the curated-map fallback ORDER (override→Finnhub→curated→null), and the backfill idempotency guard. Lead with APPROVE / APPROVE-WITH-CONDITIONS / CHANGES-NEEDED. If good, this **closes #298** (both halves landed).
