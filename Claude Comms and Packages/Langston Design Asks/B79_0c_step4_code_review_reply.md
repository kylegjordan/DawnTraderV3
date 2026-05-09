# B79.0c Step 4 review

## Verdict
approved-with-revisions

## Findings
- **F1 (must-fix, correctness):** Kraken-pair normalizer regex `/^([A-Z]+)x?(USD[A-Z]?)$/i` is broken. Greedy `[A-Z]+` + `i` flag means `[A-Z]` matches lowercase `x`. For `TSLAxUSD`: backtracks to longest `[A-Z]+` that lets the tail match → `TSLAx` (5 chars, `x?` empty, `USD[A-Z]?`=`USD`). Result: `TSLAx/USD` — NOT in XSTOCK_SPOT_24_7_SYMBOLS. TSLA passed as `TSLAxUSD` falls through to ARCA-only and freezes weekends. Same for `AAPLxUSDC` → `AAPLx/USDC`. Fix: drop the `?` (Kraken-pair form always has `x` per your own comment) → `/^([A-Z]+)x(USD[A-Z]?)$/i`. Or non-greedy `[A-Z]+?`. Add unit assertion `normalize('TSLAxUSD') === 'TSLA/USD'` — if the existing normalization describe block doesn't catch this on `npm test`, the test isn't exercising the path.
- **F2 (nit):** Scanner uses magic string `'NON_24_7_SAMPLE/USD'` as ARCA-probe symbol. Works (underscore + digit prevent regex match), but brittle. Prefer caching first entry of `XSTOCK_SPOT_SYMBOLS \ XSTOCK_SPOT_24_7_SYMBOLS` at module load. Not blocking.
- **F3 (nit):** `cyclesSkippedMarketClosed++` increments on cycles that aren't actually skipped (universe is just narrowed). Comment notes "legacy counter, retained for compat" — fine, but operator on Step 8 will misread. Add a parallel `cyclesNarrowedTo24_7` before B79.0d.

## Specific checks
- Q4 required-arg applied: yes — `(symbol: string, now: Date = new Date())`, no symbol default. Zero no-arg callsites in diff.
- Normalizer regex correctness (TSLAxUSD→TSLA/USD, TSLAx/USD→TSLA/USD): no — see F1. The canonical-with-x branch `/^([A-Z]+)x\/(USD[A-Z]?)$/i` IS correct (mandatory `x\/` forces correct backtrack). Kraken-pair branch is broken.
- Universe-branch in scanner.runCycle: yes — full `XSTOCK_SPOT_SYMBOLS` when ARCA-open or hostile-sim, restricted to `XSTOCK_SPOT_24_7_SYMBOLS` otherwise. Early-return removed; logic right.
- Diagnostics fields surfaced: yes — `lastUniverseSize` + `lastArcaOpen` on `ScannerDiagnostics`, written each cycle.
- Callsite count = 4 production: yes — scanner.ts (universe gate), SQE:182, data-freshness:97, TEC:650.

## Ship recommendation
ship after F1 fix. One-char regex change + one unit assertion. F2/F3 ride into B79.0d.

WS-probe 0/0 over 60s confirms scope-review hypothesis (a) — Kraken WS silent on weekends regardless of 24/7 designation. Phase 2+ planning must not assume the predicate change alone unblocks weekend signal flow; Kraken-side investigation (account/subscription/feed) needed before weekend live capture is meaningful. Flag this caveat explicitly in the Step 11 completion report.
