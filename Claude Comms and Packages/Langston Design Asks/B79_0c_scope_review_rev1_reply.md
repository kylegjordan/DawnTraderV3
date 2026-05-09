# B79.0c review

## Q1-Q5 calls

Q1 (symbol-set authority): **Concur — file constant.** This is Kraken product-catalog reference data, not a behavioral knob; pairing it with the master `XSTOCK_SPOT_SYMBOLS` set in the same file avoids a sync hazard across storage layers when Phase-2 names land.

Q2 (symbol normalization): **Concur — predicate accepts both forms, strips `/USD` internally.** Defensive normalization at a leaf module is good practice (not a patch); use a shared `normalizeBase()` helper if one already exists rather than open-coding the strip.

Q3 (scanner filter A vs B): **Concur — (A), branch inside `runCycle()`.** Matches "no work for closed names" intent; smaller DB read AND no downstream telemetry filtering for the 265 idle names. Test in obj 5 should assert universe size = exactly 10 during ARCA-closed cycle.

Q4 (callsite signature optional vs required): **Push back — go (A), required symbol.** Optional-with-ARCA-default creates a silent-bug class: a future 24/7 callsite that forgets to pass `symbol` would be wrongly closed weekends. The "back-compat for tests" reason is real but the fix is one line — update `b79-0a-data-freshness.test.ts:27` to pass a symbol in this batch. Mirrors production patterns and aligns with §8 #11 NO PATCHES (no fail-quiet fallback).

Q5 (WS archiver investigation depth): **Concur on phasing, tighten on honesty.** Ship the predicate + scanner filter regardless — the code is correct standalone. But add a stand-alone WS probe to `ws-equities.kraken.com` for `TSLAxUSD` BEFORE the ARCA reopen masks the test (we have a ~24h window to ground-truth this). Completion report must NOT claim "24/7 names enabled" unless the post-deploy DB query shows fresh ticks for those 10 names during the closed-ARCA window we're currently in. If WS silent → file RUNNING_ISSUE for REST-polling fallback or alternate feed; do not declare victory.

## Concerns / Additions

- **Test mock update in scope.** Per Q4, `b79-0a-data-freshness.test.ts:27` no-arg mock must be updated this batch — add to §2 Files-changed list.
- **Diagnostics endpoint clarity.** `/api/diagnostics/xstock-scanner` should surface the universe split explicitly (`current_universe_size: 10 (24/7 only)` vs `275 (ARCA open)`) so Step 8 verification doesn't rely on PM2 log grep alone.
- **Time-pressure framing.** Closed-ARCA window is the natural test env for the per-symbol code path. Once ARCA reopens 2026-05-10 22:00 UTC, the 10-name filter branch isn't exercised again until the following Friday close. Verification evidence MUST be captured during the current closed window — flag this in CC's Step 7 plan.
- **Crypto_spot no-touch baseline.** Pre-deploy `regime_factor_alternates` snapshot per PIA §4 query is required, not optional — captured BEFORE `pm2 restart`, compared 30min post-deploy. Confirm that's wired into CC's Step 6 sequence.
- **Honest completion-report wording.** If post-deploy DB shows 24/7 names still silent (Kraken WS gap), the report says "predicate + scanner filter shipped; live data flow blocked upstream; RUNNING_ISSUE filed" — NOT "24/7 names live."

## Verdict

approved-with-revisions

(Revisions: Q4 → required symbol + update test mock in same batch; add WS probe pre-ship if 24h window allows; completion-report honesty rule on live-data status; diagnostics endpoint surfaces universe split; capture closed-window evidence before ARCA reopen.)
