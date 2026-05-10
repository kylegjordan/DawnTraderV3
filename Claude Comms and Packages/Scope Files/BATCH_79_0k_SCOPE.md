# BATCH 79.0k — Kraken WS-equities weekend silence: investigation + decision

> **Status:** AWAITING LANGSTON STEP 1 REVIEW (investigation batch — light scope)
> **Author:** Claude Code
> **Created:** 2026-05-10
> **Resolves:** RUNNING_ISSUES #89 (B79.0c finding)
> **Type:** Investigation + decision batch (not a pure code-implementation batch)

---

## 1. Why this batch

B79.0c WS probe pre-ship 2026-05-09 22:30 UTC empirically confirmed: 60-second subscription to `wss://ws-equities.kraken.com` ticker+ohlc channels for the 10 Kraken Phase-1 24/7 names (TSLA, AAPL, SPY, QQQ, GLD, GOOGL, HOOD, MSTR, NVDA, CRCL — all `BASExUSD` form) returned 201 messages but ZERO ticker / ZERO OHLC; CLOSE 1006 at end. Concurrent `crypto_spot` and `xstock_perp` flows continued normally.

**Operational impact:** the 10 Phase-1 24/7 names show up as "Stale" or "Dead" on the xStocks tab Per-Pair Fresh-Tick Latency panel during weekend windows. ARCA-aligned names are expected to be dead during weekends; the 24/7 names should NOT be — but they are, because the WS feed isn't sending data for them. This blocks claiming "24/7 names live in production" until the upstream feed is fixed or worked around.

**Pre-existing system handles the gap correctly:** the per-symbol predicate + scanner universe-filter (B79.0c) ship correct standalone. When data resumes, downstream signal evaluation works. So this is a feed-availability problem, not a system-correctness problem.

---

## 2. Investigation scope (Step 2 work — not implementation)

Three paths to evaluate. This batch's Step 2 deliverable is a decision matrix scoring each path on cost / complexity / coverage / risk; Step 3 is whichever path the matrix selects.

### Path A — Kraken Pro account / feed-tier upgrade

Probe whether a paid Kraken Pro tier unlocks an alternate WS feed for xstocks 24/7 names. This is largely a Kraken-support / docs question — no code work needed for the investigation itself.

**Investigation tasks:**
1. Read Kraken's public docs for ws-equities — confirm whether weekend behavior is documented (vs. a bug/limitation we're hitting)
2. Check if Kraken Pro or any paid tier mentions different feed access for 24/7 instruments
3. (If unclear from docs) ping Kraken support directly with the empirical finding: "WS subscription returns heartbeats only on weekends for 24/7 xstock names — is this expected?"

**Cost:** $X/month for Kraken Pro (TBD from docs). **Coverage:** unclear without docs read. **Complexity:** zero code. **Risk:** dependency on Kraken's response.

### Path B — REST polling fallback (mirror B74 equity-perp pattern)

B74's `server/services/passive-archive/equity-perp-archiver.ts` already implements the REST-polling pattern for futures: WS for ticker, REST for OHLC at `https://futures.kraken.com/api/charts/v1/trade/<sym>/1m`. Apply the same pattern to ws-equities: WS for normal hours when it works, REST polling fallback for weekends/silent windows.

**Investigation tasks:**
1. Confirm whether ws-equities has an equivalent REST endpoint (e.g., `https://api.kraken.com/0/public/OHLC?pair=AAPLxUSD`). The standard Kraken `/0/public/OHLC` REST endpoint may or may not include xstocks.
2. Test the REST endpoint with one of the 24/7 names on a weekend — does it return data when WS is silent?
3. If yes, scope out a `equity-spot-rest-fallback` module mirroring B74's structure.

**Cost:** zero (REST is free). **Coverage:** good if the REST endpoint exists. **Complexity:** medium — write the polling module + integrate with existing WS-only `equity-spot-archiver.ts`. **Risk:** low.

### Path C — Direct Kraken support query

Ping Kraken directly with the empirical finding to confirm whether the WS-equities silent-on-weekends behavior is intentional. Even if Path A or B is the eventual fix, this is informational — closes the open question.

**Cost:** zero. **Coverage:** zero (informational only). **Complexity:** zero code. **Risk:** none — pure info-gathering.

---

## 3. Recommended sequence

1. **Path C first (informational):** zero-cost; pings Kraken support and reads docs in parallel. Provides ground truth before committing to A or B.
2. **Path B second (default fallback):** zero-cost feed; integrates with existing infrastructure. Build it speculatively after Path C even if Kraken says weekend silence is intentional — REST fallback is good defensive coverage anyway.
3. **Path A last (commercial upgrade):** only if Path B's REST endpoint doesn't exist or doesn't cover weekends.

---

## 4. Step 3 implementation (conditional on Step 2 decision)

If Path B selected (most likely):
- New file `server/services/passive-archive/equity-spot-rest-fallback.ts` mirroring `equity-perp-archiver.ts:86-179` REST polling structure
- Integration point: `equity-spot-archiver.ts` — when WS is silent for >N seconds, kick off REST polling for the 10 24/7 names; persist into `xstock_spot_ohlc_1m` and `xstock_spot_ticker_snap` tables
- Configurable poll interval via module_constants (mirror B74 pattern: `data_archive.equity_spot.rest_poll_interval_ms` etc.)
- Tests: REST endpoint exists check, fallback activation logic, persistence integration

If Path A selected: configuration changes only (new credentials). Documentation update. No code changes likely.

---

## 5. Non-objectives + invariants

- **No change to xstockSpotScanner or signal-orchestrator integration** (that's #92, deferred to Phase 19).
- **No change to per-symbol 24/7 predicate** (B79.0c shipped correctly; just needs data flowing).
- **No change to FilterDiagnosticsPanel rendering** (the existing "Dead" / "Stale" / "Fresh" buckets correctly classify the gap; once data flows, the panel auto-corrects).
- **Crypto regression: NONE by-construction.** Fix is xstock_spot-only at the data-feed layer.
- **No-touch fence on crypto_spot through 2026-05-15 preserved.**

---

## 6. Verification (Step 7) — pending Path choice

Common across all paths:
- G1 CI green
- G2 PM2 logs clean post-deploy
- G3 xStocks tab Per-Pair Fresh-Tick Latency panel — at least the 10 24/7 names show "Fresh" during weekend windows (the actionable test)
- G4 crypto no-touch fence holds
- G5 (Path B specific) REST poll cadence matches configured interval; persistence into tables verified via SELECT count over 24h post-deploy

---

## 7. Open questions for Langston

Q1. **Sequence:** is "Path C → Path B → Path A as fallback" the right order? My read: yes — informational first, defensive REST fallback second, commercial upgrade last only if needed.

Q2. **Path B speculative build:** even if Kraken support confirms weekend silence is intentional (Path C reveal), should we build Path B anyway as defensive coverage? My read: yes — REST fallback is good infrastructure regardless of what Kraken's WS feed does.

Q3. **Path A commercial commitment:** if Paths B + C don't fully solve, is paying for Kraken Pro a directive call (Kyle) or a Langston/CC tactical decision? My read: directive call — material recurring cost.

Q4. **Sub-batch structure:** should this be ONE batch covering all chosen paths, or split (B79.0k for Path C investigation; B79.0k.1 for Path B implementation; B79.0k.2 for Path A configuration)? My read: B79.0k for investigation + decision (Step 2 deliverable = decision matrix); B79.0k.1 for whatever-path-is-chosen implementation if non-trivial.

Q5. **Test environment:** can we test Path B's REST endpoint right now (Saturday/Sunday) since that's exactly when the WS feed is silent? My read: yes — perfect timing window for the REST probe.

Q6. **Scope as-is OK for combined Step 1+2** (investigation batch with decision-matrix deliverable), or should we split Step 1 vs Step 2?

---

## 8. Governance

- BATCH_CATALOG.md row for B79.0k (and .k.1, .k.2 if split)
- PHASE_HISTORY.md sub-batch row
- RUNNING_ISSUES.md #89 marked RESOLVED (or closed as INFORMATIONAL if no implementation lands)
- BATCH_79_0c_COMPLETION_REPORT.md post-closure addenda noting the WS-equities investigation closed
- BATCH_79_0k_COMPLETION_REPORT.md
- MEMORY.md (CC + Langston) — drop next-step pointer
