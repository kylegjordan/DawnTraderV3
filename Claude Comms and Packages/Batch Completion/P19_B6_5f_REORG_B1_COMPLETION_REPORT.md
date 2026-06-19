# P19-B6.5f (reorg-B1) — Completion Report

> **Batch:** P19-B6.5f · **reorg-board:** B1 · **Phase:** 19 · **change-class:** non_architecture (Langston-concurred) · **Author:** Claude New (CC-B) · **Date:** 2026-06-19
> **Title:** Both-class symbol-recognition completeness — close the crypto quote-recognition gap + apply the shared recognition discipline to xStock.
> **Commits:** code `b06eb9e5c` · change list `e5453029b` · scope `d78cef0ee` · pre-audit `194d4dc1a`.
> **Reviews:** Langston Step-1 PROCEED, Step-2 PROCEED, Step-4 PROCEED (all conditions implemented). Step-8 second-pass PENDING.

## PREVIOUSLY-STATED-VS-NOW
- None. (QUOTE_LEN_MAX=5 was data-derived at Step-2, not a revised prior number.)

## Objectives checklist
| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Enumerate the FULL live Kraken quote set (data-driven) | ✅ YES | live `/0/public/AssetPairs` 2026-06-19: 23 distinct legs; >4-char = EUROP/PYUSD/RLUSD; max=5. |
| OBJ-2 | ONE SSOT for the recognition quote set (kill drift) | ✅ YES | `KNOWN_QUOTE_CURRENCIES` (curated complete) + `setDiscoveredQuotes()` slot fed from live `dynamicQuotes`; `getRecognitionQuotes()` always-complete. |
| OBJ-3 | Widen quote-LENGTH via a shared named const, BOTH classes | ✅ YES | `QUOTE_LEN_MIN/MAX` feeds `CRYPTO_SPOT_CANONICAL` + `XSTOCK_SPOT_DISPLAY` + `symbol-normalize.ts` (lockstep, D2). |
| OBJ-4 | Loud NAMED unknown-quote alert, class-agnostic | ✅ YES | `ClassifyFallthroughMeta.unknownQuote` + dedicated `classify-unknown-quote:${exchange}` alert (storm-safe). |
| OBJ-5 | Prove the 6 alerting pairs classify crypto_spot | ✅ YES | staging re-probe on deployed code: ETH/EUROP, ETH/PYUSD, XBT/EUROP, XBT/PYUSD, XRP/RLUSD, A/EUR → all `crypto_spot`. |
| OBJ-6 | Verify xStock has NO analogous open gap | ✅ YES | live probe: 490-symbol universe loaded; AAPL/USD, AAPLx/USD, kraken-equities all `xstock_spot`; SUI/USD collision→crypto. No xStock code change beyond the lockstep display-bound widen. |
| OBJ-7 | Tests | ✅ YES | `p19-b6-5f-recognition.test.ts` — length-from-SSOT, self-healing list, 5-char both forms, named-unknown-quote+fail-closed, collision-order. vitest 128/128 (incl all related existing suites). |

## Verification (Step-7)
- **CI:** run `27837279938` — all 4 jobs GREEN (TypeScript Check, Test Suite, Build, Docker Build).
- **Bench:** tsc-baseline OK (no new errors above baseline); vitest 128/128.
- **Deploy:** staging `git pull` + `npm run build` (dist 5.4mb) + `pm2 restart` → online.
- **Live re-probe (deployed code):** the 6 previously-dropped pairs now classify `crypto_spot`; controls correct (ETH/USD→crypto, AAPL/USD→xstock, SUI/USD→crypto via collision); `ETH/TOOLONGQ` (unknown 8-char) still THROWs → fail-closed.
- **Eligibility-gate proof (Langston hold-me-to #1):** `universe-loader.ts` filters by `allowedQuotes` = `[USD, USDT, USDC]` (config), `wrongQuote`-excluding any other quote. So the newly-recognized EUROP/PYUSD/RLUSD-quoted pairs are **recognized but NOT traded** — recognition widened, trading universe unchanged. Locked by the green `b74-universe-loader` "filters out non-USD/USDT/USDC quotes" test.

## Known properties (Langston Step-4 note — logged here intentionally)
- **`classify-unknown-quote` dedups on EXCHANGE, not the quote string.** Deliberate storm-safety: a garbage feed can't spam one alert row per junk quote. Tradeoff: a *second distinct* unknown quote on the same exchange within the dedup window will not raise its OWN alert (the first names itself in the body; the alert's job is "something unrecognized is happening," not enumeration). Accepted by CC-B + Langston.

## Design notes
- **`CRYPTO_SPOT_CANONICAL` stays GENERIC (length-widened, NOT quote-list-validated)** — by design + Langston-confirmed. A list-validated canonical would re-drop a real newly-listed ≤5-char quote until the SSOT caught up = the exact bug this batch removes. Layering: slash-form = permissive-by-length; quote-LIST SSOT = compact/no-slash split + unknown-quote alert; trade-eligibility = downstream arbiter.
- **Self-healing:** `setDiscoveredQuotes()` fires at the tail of EVERY `refresh()` (not just boot) + rebuilds the raw-form regexes → a refresh-added Kraken quote is recognized without restart (Langston Step-3 condition).
- **Layering respected:** the slot mirrors `setClassifyFallthroughHook` — `shared/` never imports `server/`.

## Governance files changed
- `Claude Comms and Packages/Scope Files/P19_B6_5f_REORG_B1_SCOPE.md` (new) + `..._PRE_AUDIT.md` (new)
- `Claude Comms and Packages/Change Lists/P19_B6_5f_REORG_B1_CHANGELIST.md` (new)
- `Claude Comms and Packages/Batch Completion/P19_B6_5f_REORG_B1_COMPLETION_REPORT.md` (this)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — §17 liveness registry: recognition → `_discoveredQuotes` slot
- `1-system-manual/SYSTEM_MANUAL.md` — recognition-path note (quote SSOT + length bound + recognition≠eligibility)
- `1-system-manual/BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` §1 (B1→done) · `RUNNING_ISSUES.md` (B1 item closed)
- `.claude/memory/MEMORY_CC_B.md` (+ user-cache truth)

## Code files changed
`shared/asset-classes.ts` · `server/markets/kraken-asset-pairs-service.ts` · `server/services/utils/symbol-canonicalizer.ts` · `server/utils/symbol-normalize.ts` · `server/index.ts` · `server/tests/unit/p19-b6-5f-recognition.test.ts` (+278/−32).

## Next
reorg-B2 — rung-1 target-floor + liquid-volatile universe selector (the minimum, with B1, to get crypto trades opening at taker rates).
