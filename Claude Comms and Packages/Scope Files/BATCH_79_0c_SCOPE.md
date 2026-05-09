# BATCH 79.0c — Per-symbol 24/7 xstock support (SCOPE rev 2)

**Status:** rev 2 2026-05-09 22:30 UTC after Langston pre-impl review (verdict: approved-with-revisions). Reply archived at `Claude Comms and Packages/Langston Design Asks/B79_0c_scope_review_rev1_reply.md`. 5 revisions applied — see §7.
**Phase:** 24 (Multi-Asset VTS Onboarding). Sub-batch after B79.0b close, before B79.0d (ORB IMPL).
**Branch:** `migration/aws-supabase` HEAD `54201bd32`.
**Workflow:** 11-step canonical (full).
**Time-pressure:** ARCA reopens for 24/5 names Sunday 2026-05-10 22:00 UTC (~24h). 24/7 names should be flowing continuously NOW. Implementation must ship + deploy + verify before that window.

---

## §0 — Problem statement

Kraken Pro **Phase 1 announcement (2025-12-03):** ten xStock tokens trade **24/7**, not the ARCA-aligned 24/5 schedule the rest follow. Names:

```
TSLAx, QQQx, SPYx, NVDAx, CRCLx, AAPLx, HOODx, MSTRx, GLDx, GOOGLx
```

Source: https://blog.kraken.com/news/xstocks-247-trading

Current `isXstockMarketOpenUTC(now)` in `server/asset_classes/xstock_spot/market-hours.ts:34` is **symbol-blind** — returns false for ALL xstock_spot symbols during weekends + Friday 22:00–Sunday 22:00 UTC. Effect: the 10 24/7 names are blocked from scanner / SQE / freshness / TEC during the ARCA-closed window even though Kraken's matching engine accepts trades on them.

**Secondary concern flagged in MEMORY:** xstock_spot WS archiver appears silent (`equity_spot_ticker_snap` last write 2026-05-09 11:12 UTC; `equity_spot_ohlc_1m` last write 2026-05-09 00:15 UTC). Two hypotheses: (a) Kraken WS goes silent on weekends regardless of 24/7 marker — server-side feed gap; (b) connection dropped + reconnect failing silently. B79.0c includes investigation, not necessarily fix (fix scope depends on root cause).

---

## §1 — Numbered objectives

| # | Objective | Verification |
|---|---|---|
| 1 | `XSTOCK_SPOT_24_7_SYMBOLS` set added to `shared/asset-classes.ts` containing the 10 Kraken Phase-1 names. Reference data (not behavioral knob — file constant is correct). | `grep XSTOCK_SPOT_24_7_SYMBOLS shared/asset-classes.ts` returns the set definition with all 10 names + a comment citing Kraken's 2025-12-03 announcement |
| 2 | `isXstockMarketOpenUTC` extended to per-symbol predicate. **rev 2 (Langston Q4 push-back):** symbol param REQUIRED, not optional. New signature: `isXstockMarketOpenUTC(symbol: string, now?: Date): boolean`. When `symbol` is in `XSTOCK_SPOT_24_7_SYMBOLS` → `true` always; otherwise apply existing ARCA schedule. No-arg back-compat removed — fail-loud rather than fail-quiet. | Unit tests cover (a) 24/7 name + Saturday → true, (b) 24/7 name + Friday 23:00 UTC → true, (c) 24/5 name + Saturday → false, (d) 24/5 name + Tuesday 14:00 UTC → true, (e) symbol normalization (canonical `TSLAx/USD` ≡ bare `TSLAx`), (f) TS compile fails when symbol arg omitted (rev 2) |
| 3 | 4 callsites updated to pass `symbol` REQUIRED: `xstock_spot/scanner.ts:188`, `core/filters/signal_quality_evaluator.ts:181`, `utils/data-freshness.ts:95`, `services/trailing-exit-controller.ts:648`. Each callsite has the symbol in local scope already. **rev 2:** `b79-0a-data-freshness.test.ts:27` mock updated to pass symbol arg in same batch (Langston add'l #1). | `grep -n "isXstockMarketOpenUTC()" server/` returns ZERO hits anywhere (incl. tests) |
| 4 | Scanner per-symbol filtering during ARCA-closed window. Currently scanner short-circuits the entire cycle on `!isXstockMarketOpenUTC()`. Changed: when ARCA is closed, scanner still runs but filters the universe to `XSTOCK_SPOT_24_7_SYMBOLS` only — the 10 24/7 names continue to flow, the other ~265 are skipped per-symbol. When ARCA is open, full 275-symbol universe scans normally. | New scanner log line `[B79.0c][SCAN_24_7_ONLY] tick=N filtered=265` during weekend cycles; full scan otherwise. Stack against PM2 logs Sunday post-deploy. |
| 5 | Boundary tests added for per-symbol predicate AND scanner filter behavior. Test file `server/tests/unit/b79-0c-market-hours-per-symbol.test.ts` covers the 6 cases above + a separate test asserting scanner cycle filters universe correctly when ARCA closed but 24/7 names exist. | `npm test b79-0c` shows new test file passing; CI green. |
| 6 | xstock_spot WS archiver gap **investigated and root cause documented**. Output: a §6 in the completion report identifying whether (a) Kraken WS goes silent weekends regardless, (b) 24/7 names DO flow but archiver dropped, or (c) full-feed silent + needs reconnect. If fix is in-scope, ship in this batch; if larger refactor, file as RUNNING_ISSUES entry + queue for B79.0c.1 / B79.0d-adjacent. | Live verification: `SELECT MAX(captured_at) FROM equity_spot_ticker_snap WHERE symbol IN ('TSLAx','QQQx','AAPLx',...)` post-deploy. If NOT updating during weekend → the archiver itself blocks 24/7 names; if updating → upstream feed quiet, Kraken-side. |
| 7 | No-touch fence on crypto_spot still holds post-deploy. | `regime_factor_alternates` cadence check ≥80% of pre-deploy baseline within 30min |
| 8 | CI 4 checks green; staging deploy successful; HTTP 200 on `/api/diagnostics/xstock-scanner` | curl + log + UI |

---

## §2 — Files changed

### Modified
- `shared/asset-classes.ts` — add `XSTOCK_SPOT_24_7_SYMBOLS` set (10 names)
- `server/asset_classes/xstock_spot/market-hours.ts` — REQUIRED symbol param + 24/7 branch
- `server/asset_classes/xstock_spot/scanner.ts:188` — pass symbol, filter universe per-cycle (option A — branch inside `runCycle()`)
- `server/core/filters/signal_quality_evaluator.ts:181` — pass `canonicalSymbol`
- `server/utils/data-freshness.ts:95` — pass `_symbol` (un-prefix → `symbol`, wire to predicate)
- `server/services/trailing-exit-controller.ts:648` — pass `update.symbol`
- `server/tests/unit/b79-0a-data-freshness.test.ts:27` — update no-arg mock to pass symbol (rev 2 / Langston add'l #1)
- diagnostic endpoint at `/api/diagnostics/xstock-scanner` — surface `current_universe_size` + `arca_open` boolean (rev 2 / Langston add'l #2)

### Added
- `server/tests/unit/b79-0c-market-hours-per-symbol.test.ts` — boundary + scanner behavior tests

### Investigated (no change unless cheap fix in-scope)
- `server/services/passive-archive/equity-spot-archiver.ts` — diagnose archiver silence

---

## §3 — Open questions for Langston (please answer Q1–Q5)

**Q1 — Symbol set authority.** I'm hardcoding the 10 Kraken Phase-1 names as a TS const. Alternative is a DB-resolved row in `module_constants.market_data.xstock_spot.always_open_symbols`. CLAUDE.md §5 #15 corollary says "behavioral knobs are DB-resolved" — but this is reference data (Kraken's product catalog), not a tuning parameter. **My call: file constant.** When Kraken adds names (Phase 2), it's a code change anyway because we also need them in `XSTOCK_SPOT_SYMBOLS` master list. Concur or DB-resolve?

**Q2 — Symbol normalization.** The `XSTOCK_SPOT_SYMBOLS` set in `shared/asset-classes.ts` uses canonical `BASE/USD` form (e.g. `TSLAx/USD`). The Kraken WS feed and internal logs sometimes use bare `TSLAx`. The 4 callsites pass different shapes — scanner.ts uses raw symbol from `XSTOCK_SPOT_SYMBOLS` (canonical), SQE uses `canonicalSymbol = normalizeInternal(input.symbol)`, data-freshness uses `_symbol` (caller-provided), TEC uses `update.symbol`. **Plan:** the predicate accepts either shape — internally strips `/USD` suffix and compares to a base set `{TSLAx, QQQx, SPYx, ...}`. Concur, or do you want strict canonical-form-only with normalization upstream?

**Q3 — Scanner universe filtering implementation.** Two designs:
- **(A)** Inside `runCycle()`, after the ARCA-open check, branch: if closed → set `symbolList = XSTOCK_SPOT_24_7_SYMBOLS`; if open → full universe. Single batched DB query stays one round-trip.
- **(B)** Always scan full universe; filter at result-iteration time before telemetry update.

(A) is cheaper (smaller DB read during weekends) and matches the "no work for closed names" intent. (B) is uniform code path. **My call: (A).** Concur?

**Q4 — Per-symbol callsite signature.** Each callsite now passes a symbol. Should I:
- **(A)** Always require symbol — make it positional first arg, no default; update tests/mocks accordingly.
- **(B)** Keep it optional — back-compat for any caller that doesn't have a symbol, defaulting to old ARCA-only semantics.

(A) is stricter / fail-loud. (B) is safer for any unidentified caller. **My call: (B) — symbol optional + when omitted → ARCA-only (current behavior).** This matches the back-compat row in §1 obj 2 and avoids breaking the no-arg test mock pattern in `b79-0a-data-freshness.test.ts:27`. Concur?

**Q5 — WS archiver investigation depth.** If the root cause is "Kraken WS goes silent for ALL xstocks weekends including the 24/7 names," that's a Kraken-side feed issue we can't fix code-side; the 10 24/7 names will be pseudo-stale during weekends and ride the freshness gate. If root cause is "archiver dropped connection + isn't reconnecting," that's a code fix and arguably should block this batch (we'd have no live data for the 10 names even after enabling them). **My call:** investigate first via DB queries + Kraken WS connection log + reconnect-attempt logs. If (a) → document + accept (24/7 names will need a separate Kraken Pro connection or REST fallback in a follow-up batch). If (b) → fix this batch. Block ship on what level of fidelity?

---

## §4 — Verification plan

Step 7 (CC):
- Unit tests pass via `npm test b79-0c`
- PM2 log line `[B79.0c][SCAN_24_7_ONLY]` during ARCA-closed cycle (we are currently in that window)
- DB query: `SELECT symbol, COUNT(*) FROM equity_spot_ticker_snap WHERE captured_at > NOW() - INTERVAL '15 minutes' GROUP BY symbol ORDER BY symbol;` — observe whether 24/7 names show ANY recent ticks (even during ARCA-closed window)
- Crypto_spot no-touch fence: `regime_factor_alternates` 30-min cadence per factor steady
- HTTP 200 on `/api/diagnostics/xstock-scanner`

Step 8 (Langston):
- Independent review of unit test results + PM2 log + DB query output
- Confirm scope objectives 1–8 verifiably met

---

## §5 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Kraken adds Phase-2 names later → silent gap | Hardcoded list flagged with Kraken announcement-date comment; future Kraken-update batch must update both sets simultaneously |
| Symbol normalization drift across callsites | Q2 decision (predicate handles both forms) shields callsite-specific shape |
| TEC stop-freeze on a 24/7 name now allows updates during ARCA-closed → could trigger stop on stale data | Freshness gate (obj 3 callsite) still enforces; stale 24/7 names skip stop-eval anyway via `isPairDataFresh` |
| Crypto_spot no-touch broken | Scope is xstock-only by file path + asset-class branching; no crypto path touched |
| WS archiver still silent post-deploy | Q5 decision — if (a) accept + queue follow-up; if (b) block ship until fixed |

---

## §6 — Out of scope (explicit)

- Live-equity-WS-pricing (B79.5)
- Q-D AAPLx-vs-AAPL probe (B79.0a candidate, separate batch)
- Sector classification yfinance script (B79.x)
- Equity holiday calendar overrides (deferred per market-hours.ts §3 comment)
- equity_*→xstock_* table rename (B79.0e, separate batch)
- ORB strategy implementation (B79.0d, separate batch)

---

---

## §7 — rev 2 revisions (Langston review 2026-05-09 22:25 UTC, verdict: approved-with-revisions)

1. **Q4 changed → REQUIRED symbol param.** Optional creates a silent-bug class (forgotten 24/7 callsite would be wrongly closed weekends). Test mock `b79-0a-data-freshness.test.ts:27` updated this batch.
2. **Stand-alone WS probe to `ws-equities.kraken.com` for `TSLAxUSD` BEFORE ARCA reopen.** Closed-ARCA window currently active = natural test env for the per-symbol predicate. Once ARCA reopens 2026-05-10 22:00 UTC, the 10-name filter branch isn't exercised again until next Friday close. CC must capture closed-window verification evidence pre-reopen.
3. **Diagnostics endpoint surfaces universe split.** `/api/diagnostics/xstock-scanner` returns `current_universe_size` (10 vs 275) + `arca_open: bool`. Step 8 verification doesn't have to grep PM2 logs.
4. **Pre-deploy regime_factor_alternates baseline mandatory** (already in PIA §4 but elevated to ship-blocking). Snapshot BEFORE pm2 restart; compare 30min after. <80% emissions → revert.
5. **Honest completion-report wording.** If post-deploy DB shows 24/7 names still silent (Kraken WS gap), report says "predicate + scanner filter shipped; live data flow blocked upstream; RUNNING_ISSUE filed" — NOT "24/7 names live."

*End BATCH_79_0c_SCOPE.md rev 2.*
