# B-XSTOCK-FEED-LIVENESS — Pre-Implementation Audit (#594)

**Owner:** CC-B · **change-class:** `non_architecture` · **Date:** 2026-07-31
**Scope:** `B_XSTOCK_FEED_LIVENESS_SCOPE.md` · **Written BEFORE implementation** — deliberately, because #605's audit was skipped and that is exactly where its one near-miss should have been caught.

---

## 1. Components touched

| component | role |
|---|---|
| `server/services/passive-archive/equity-spot-archiver.ts` · `handleMessage` | **read-only in this batch** — its `state.lastMsgAt = Date.now()` stamp **stays where it is** (see §3) |
| same file · `parseOhlcBar` / `parseTickerSnap` | **modified** — new `lastDataMsgAt` stamped here, i.e. only where a PRICE arrived |
| same file · `runStallWatchdogTick` | **modified** — thresholds on `lastDataMsgAt` instead of `lastMsgAt` |
| same file · `ArchiverState` | **modified** — one added field |
| `poller.test.mjs`-equivalent unit coverage | **new fences** |

## 2. Blast radius — measured, not assumed

★ **`lastMsgAt` HAS NO EXTERNAL READER.** Repo-wide, the module is imported for exactly three things:
- `getLatestEquityTick` → `active-execution-engine.ts:141` — ⚠️ **a LIVE TRADING path (xStock marks; the only venue price source for tokenized equities)**
- `getEquitySpotStats` → `drift-dashboard-aggregator.ts:848` — **verified it returns `connected` / `configuredSymbols` / `cumulativeOhlcRows` / `cumulativeTickerSnaps` ONLY. It does NOT expose `lastMsgAt`.**
- `startEquitySpotArchiver` → `passive-archive-bootstrap.ts:26`

⇒ **`lastMsgAt`'s consumers are entirely in-file: the 60s health log, and the watchdog.** Adding a parallel field cannot reach the marks path or the dashboard. **Same shape as #605's census — two internal consumers, zero external surface.**

⚠️ **BUT NOTE WHAT THE FILE DOES CARRY: `getLatestEquityTick` feeds live trading.** This batch does not touch it, and that is a constraint on implementation, not a reassurance — **any change to `handleMessage`'s early lines sits upstream of the mark cache.**

## 3. ★ The ordering/semantics hazard this audit exists to find

**`lastMsgAt` is NOT broken and must NOT be repointed.** Provenance (in the scope, from `ce4a7e408` B74 2026-05-01): at introduction its only consumers were the stamp and a **health-log line**, and that commit contained **zero** occurrences of `runStallWatchdogTick`. ⇒ it answers *"is this socket still talking?"*, for which stamping on **any** frame — heartbeats included — is **correct**.
⇒ ★ **THE INSTINCTIVE FIX (move the stamp into the parsers) WOULD SILENTLY INVERT THE HEALTH LOG:** a chattering-but-dataless socket would begin reporting as stale, and the one line whose job is connection-liveness would stop answering it. **Nothing throws; no test fails.** ⇒ **the fix must ADD a field, never REPOINT the existing one** — and a regression fence asserts the health-log value is unchanged.

## 4. Session-dependent thresholds — do not assume one constant

`market-hours.ts:115` records that the watchdog **selects its RTH-vs-off-RTH stall threshold** by session. ⇒ **the new `lastDataMsgAt` must be thresholded through the SAME session selection, not against a single constant** — otherwise the fix silently tightens or loosens the alarm outside RTH. ⚠️ **And rule 17 binds: xStocks trade 24/5, NOT US RTH** — "off-hours" is not a licence to go quiet Sunday-through-Friday. The existing weekend guard (`isInXstockWeekendClose`) stays untouched.

## 5. Sibling archivers — flagged, deliberately NOT scoped
`crypto-spot-archiver.ts:148` and `equity-perp-archiver.ts:165` stamp `lastMsgAt` the **same way**. **Neither has a watchdog, so neither has a defect today** — recorded so a later grep does not read as a missed sweep, and flagged because **any watchdog added to them later inherits this exact trap.**

## 6. Background execution
The archiver runs under the app process (PM2, `dawntrader`), started from `passive-archive-bootstrap.ts`. **A deploy restarts live trading**, so this ships through the normal gate — ⚠️ **and #621 applies: the staging deploy pulls branch HEAD, so the deploy must name the reviewed sha.**

## 7. Verification posture
⚠️ **`grep '[STALL]'` across all retained out logs currently returns ZERO hits, ever.** ⇒ **absence of `[STALL]` after the fix proves nothing** — the *provoked* case is the evidence, and the fence must FAIL with the fix reverted. **Emit on stderr** (`error.log` ≈14-day retention) — `console.log` → `out.log` is ~2 days and the evidence evaporates before anyone asks.
★ **And per #625's recorded trap: state the instrument's reach before reading its silence.**
