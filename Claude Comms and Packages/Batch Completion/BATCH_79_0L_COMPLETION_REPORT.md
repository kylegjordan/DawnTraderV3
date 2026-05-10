# BATCH 79.0L — Completion Report (xStock market-hours unified close)

> **Status:** SHIPPED + verified
> **Author:** Claude Code
> **Created:** 2026-05-10
> **Commits:** `fe47ba370` (impl) + `e92839f34` (hotfix: empty-universe SQL guard)
> **PM2 deploy:** #214
> **Resolves:** RUNNING_ISSUES #89 (REFRAMED — see §3)

---

## 1. What shipped

**Schedule correction.** xStocks closed Fri 8PM ET → Sun 8PM ET (48-hour unified weekend window) per Kyle directive 2026-05-10. Applies to ALL xStocks including the previously-marked Phase-1 "24/7" set (which are actually 24/5+extended, not 24/7).

### Implementation summary

| File | Change |
|---|---|
| `server/asset_classes/xstock_spot/market-hours.ts` | Replaced UTC-day/hour math with DST-aware ET check via `Intl.DateTimeFormat(timeZone: 'America/New_York')`. Unified Fri 20:00 ET → Sun 20:00 ET close applies to ALL xStocks first. **Langston R1 catch:** old code reopened non-extended-hours names at Sun 22:00 UTC = 6 PM EDT, 2 hours too early — corrected to unified Sun 20:00 ET. Friday close kept at Fri 22:00 UTC for non-extended-hours (more restrictive than unified rule on Friday in EDT). |
| `server/asset_classes/xstock_spot/scanner.ts` | **Langston caveat catch:** scanner was scanning the extended-hours set during the unified weekend close (compute waste; freshness gate masked the bug but data was wasted). Now uses `extendedHoursOpen` probe to detect the unified weekend close window and produces empty universe. **Hotfix `e92839f34`:** initial deploy errored on `IN ()` SQL syntax when symbolList was empty; added empty-universe short-circuit before DB read. |
| `shared/asset-classes.ts` | JSDoc rewrite on `XSTOCK_SPOT_24_7_SYMBOLS` clearly stating these names are extended-hours, NOT 24/7. Constant name preserved for stability across many call sites; cosmetic rename queued for future batch. |
| `server/strategies/orb.ts` | Comment + log message updated from "24/7 name has no opening bell" to "extended-hours name has no daily opening bell" (Langston R3). |
| `client/src/components/machine-learning/xstocks-tab.tsx` | UI badge "24/7" → "Ext" with tooltip explaining schedule. Sub label "Extended-hours only" (Langston R4 phrasing). Class column tooltip explains schedule. |
| `server/tests/unit/b79-0L-market-hours-extended-hours.test.ts` (NEW) | 14 tests covering Fri-Sun unified close + DST boundaries (Nov 2026 EDT→EST transition + symbol normalization). |
| `server/tests/unit/b79-0b-market-hours.test.ts` (UPDATED per Langston R2) | Pre-existing Sun 22:00 UTC + Sun 23:00 UTC "open" assertions were WRONG under unified rule. Replaced with closed-at-22-23:00-UTC + new Mon 00:00 UTC reopen (= Sun 8 PM EDT) cases. Header comment notes B79.0L correction. |

### R5 ARCA-badge note (intentional non-change)

The `lastArcaOpen` flag wired to the "ARCA Open"/"ARCA Closed" badge on the xStocks tab Scanner panel is intentionally not changed. It reports ARCA-session truth (regular ARCA hours), not unified-window truth. Both pieces of information are useful for operators. Confirmed in this completion report so a future reviewer doesn't think it was missed.

---

## 2. Verification (5-gate)

| Gate | Result |
|---|---|
| **G1 CI** | Build + Docker green. TS+Test legacy-red baseline (zero new errors from B79.0L changes verified via `gh run view --log-failed | grep`). |
| **G2 schema** | N/A (no DB migration) |
| **G3 PM2 logs (post-restart PM2 #214 at 20:47 UTC)** | Zero `[B79.0a][SCAN_CYCLE_ERROR]` since restart; pre-restart errors (8 instances) were the `IN ()` syntax bug fixed in hotfix. |
| **G4 endpoint smoke** | `/api/xstocks/filter-diagnostics` returns `xstockScanner.lastUniverseSize: 0`, `cyclesCompleted: 7` after 3.5 min uptime, `lastError: None`. Scanner correctly skips empty universe during unified weekend close. |
| **G5 crypto regression** | NONE by-construction. All changes scoped to xstock_spot. No-touch fence on crypto_spot through 2026-05-15 preserved. |

---

## 3. RUNNING_ISSUES #89 closure framing (Langston R6)

**Resolution status: feed behavior was correct, schedule code was wrong.**

The B79.0c WS probe + B79.0k REST probe Saturday-silence findings were correct empirical observations. The inference was wrong: the silence reflects the market correctly being intentionally closed, not a Kraken feed bug. The bug was in our schedule code which incorrectly assumed Phase-1 names trade 24/7.

**Future archaeologist note:** if you find #89 and wonder "but Langston empirically observed dead WS on Saturday — did we ever explain it?" — YES. The feed behavior was correct. The bug was in `isXstockMarketOpenUTC()` treating Phase-1 names as always-open. Fix is B79.0L.

---

## 4. Crypto regression posture

NONE by-construction. All changes scoped to xstock_spot. No-touch fence on crypto_spot through 2026-05-15 preserved.

---

## 5. Pending follow-ups

- **B79.0g-tx (#91)** — atomic close-time tx (Langston Option B confirmed; Step 2 pre-audit + impl deferred to next session)
- **#92 deferred to Phase 19** — xstockSpotScanner orchestration wiring
- **B79.TEC.b operator gate ~11:24 UTC Sunday** (manual)
- **B79.0a SQE wildcards DELETE ~21:38 UTC Sunday** (manual)
- **Cosmetic rename `XSTOCK_SPOT_24_7_SYMBOLS` → `XSTOCK_SPOT_EXTENDED_HOURS_SYMBOLS`** — deferred per Langston Q2 to a future sweep batch

---

## 6. Governance updates

- BATCH_CATALOG.md — B79.0L row added
- PHASE_HISTORY.md — Phase 24 sub-batch table extended
- RUNNING_ISSUES.md — #89 RESOLVED with Langston R6 closure framing
- BATCH_79_0L_SCOPE.md (in repo, Langston-approved with R1-R6)
- BATCH_79_0L_COMPLETION_REPORT.md — this file
- MEMORY.md (CC + Langston via Hetzner scp) — drop next-step pointer; add B79.0L closure row
