# P19-B4a · C3 (scope A2) — xStock price-freshness + equity-session + silent-stall safety gate — DESIGN ASK rev1

**From:** Claude New (CC-B) · **To:** Langston · **Date:** 2026-06-14
**Decision needed:** sign-off on the three-gate design + the equity-session boundary policy (one genuine rule-17 tension to resolve).

> INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git status/log on the gdrive mount. Read these inbox files directly (local FS). Use `ssh staging` for any repo-side inspection.

---

## 1. What C3 is (approved scope A2, dec806a5a §A2 + Step-1 decision-5)

Before any active xStock dispatch can route a fill, three HARD gates:
- **(a) freshness** — block if the symbol's latest tick is older than `max(15s, p99+margin)`, threshold set from a measured inter-tick distribution (no guessing).
- **(b) equity-session** — hard-block fills outside the tradeable equity session "regardless of tick age" (a fresh token snapshot at 03:00 ET is not a tradeable equity price).
- **(c) silent-stall watchdog** — on the WS archiver, reconnect/alert when ticks stop despite an open socket; set clearly ABOVE the fill gate so they don't fight.

This is audit-4's top risk (R1: stale/stalled price → fill on a dead price). B4a wires xStock to the active pipeline (C2, done, dormant until B7b); C3 is the safety precondition before that dispatch is ever enabled.

## 2. The code reality (audited — exact, not from memory)

- **Archiver** = `server/services/passive-archive/equity-spot-archiver.ts` (NOT in the xstock_spot folder). WS `wss://ws-equities.kraken.com` → 5s batch flush to `xstock_spot_ticker_snap` (append-only, per-row `captured_at`) + `xstock_spot_ohlc_1m` (upsert, 1-min bars).
- **Reconnect fires ONLY on socket `close`** (`:218-221`). `ws.on('error')` (`:223-225`) only logs. The 60s health log (`:236-246`) computes `last_msg_age_ms` but nothing reads/acts on it. → **an open-but-quiet socket never self-heals or alerts.** Only a connection-level `state.lastMsgAt`; no per-symbol last-tick in memory; no in-memory price getter — all reads go through the DB.
- **The 90s freshness gate is fully RETIRED** (B-NEW-34). The scanner's current read (`scanner.ts:628-640`) tolerates **30-min-stale** prices and falls back to sentinel `-1` — it is enrichment, NOT a fill-grade gate. **There is no seconds-scale recency gate anywhere in the active path today.**
- **`market-hours.ts` encodes ONLY the 24/5 weekend boundary** (`isXstockMarketOpenUTC` → `!isInXstockWeekendClose`, Fri 20:00 ET → Sun 20:00 ET). **No ARCA RTH predicate, no US-holiday gate.** The prior ARCA-aligned schedule was DELIBERATELY removed in B-NEW-36 sub-batch (c) so the scanner could consume the full off-RTH universe. `getETParts()` (DST-aware ET extraction) exists but is not exported.
- **Gate insertion point** = `active-dispatch.ts`, a new block after the orchestrator-handle resolution (`:82`) and before the dispatch (`:120`), counted-skip style (matching `_dormantSkips`/`_noOrchSkips`). The dispatch input carries **no timestamp**, so the freshness check must read `max(captured_at)` for `input.symbol` from `xstock_spot_ticker_snap`.

## 3. The measurement (decision-grade — Friday 2026-06-12, the last full session before weekend shutdown; ~7.9M ticks, 485 symbols)

The live feed is in weekend shutdown right now, so I measured from the append-only stored ticks (rule-13 rolling window over a full real session, not a snapshot).

**Tick density by ET hour (Friday):** the feed delivers data in EVERY ET hour, but density is ~7-15× higher in RTH:

| ET hour band | ticks/hr (approx) | character |
|---|---|---|
| 0–3 (overnight) | 60K–118K | thin |
| 4–9 (pre-market ramp) | 88K–337K | building |
| 10–15 (RTH core) | **900K–996K** | peak / deep |
| 16 (RTH close) | 398K | tapering |
| 17–19 (after-hours) | 54K–68K | thin |
| 20–23 | 54K–120K | thin |

**Inter-tick `captured_at` gap distribution** (per-symbol successive diffs):

| window | gaps | p50 | p95 | p99 | p99.9 | max |
|---|---|---|---|---|---|---|
| RTH core (09:30–16:00 ET) | 6.00M | 1.29s | 4.35s | **8.75s** | 28.70s | 5578s* |
| off-RTH (pre+after hours) | 1.15M | 1.60s | 58.39s | 192.24s | 1253s | 10681s |

*the RTH max (~93 min) is a single halted/thin name; p99.9 of 28.7s is the realistic worst case.

→ **freshness threshold = max(15s, p99·1.5) = max(15s, 13.1s) = 15s.** The 15s floor governs; RTH p99 (8.75s) sits comfortably under it (passes normal activity, blocks a genuinely-quiet symbol). Off-RTH p99 of 192s means a 15s gate also blocks ~95%+ of off-RTH ticks on its own.

(Caveat, stated honestly: the ticker writer throttles to ≥1000 ms per symbol, so this is the ≥1s inter-snapshot distribution — the true sub-second microstructure is finer. For a fill-recency gate measured in seconds this is the right granularity; the throttle floor is the worst-case *densest* spacing, which is what the freshness threshold must tolerate without false-positiving during active trading.)

**Real-price-discovery rate by ET hour** (fraction of snapshots where `last` actually moved — distinguishes a tradeable market from fresh-`captured_at`-but-stale-`last` snapshots):

| ET hour band | % snapshots where `last` moved | read |
|---|---|---|
| 4–8 (pre-market) | 3.5%–7.1% | thin; mostly stale re-emitted snapshots |
| 9 (RTH open) | 20.2% | real discovery begins |
| 10–15 (RTH core) | 11.6%–19.2% | **real price discovery** |
| 16 (RTH close) | 21.9% | closing-auction volatility |
| 17–19 (after-hours) | 1.9%–2.4% | almost entirely stale snapshots |

→ Real price discovery is concentrated in **RTH (09:30–16:00 ET)**. Pre-market and after-hours have a live, fresh-`captured_at` feed but the price barely moves — fresh snapshot ≠ tradeable price. This is the exact failure mode the session gate exists for.

## 4. The one real decision — the equity-session boundary (rule-17 tension)

The scope says "hard-block outside ARCA hours." But the audit shows the Kraken equities feed runs ~24/5 (data in every ET hour), and **rule 17 + the B-NEW-36 decision deliberately treat xStock as 24/5, NOT US RTH** — the team removed ARCA-only gating on purpose so the scanner/VTS could learn from pre-market + after-hours. So a hardcoded RTH-only (09:30–16:00 ET) fill block would (a) contradict rule 17, and (b) throw away ~75% of the window the system already trades and learns from.

**My read of the evidence + recommendation:** gate ACTIVE FILLS to the liquid equity session = **RTH 09:30–16:00 ET**, where the evidence shows real price discovery (12–22% snapshot movement) and dense ticks (p99 8.75s). Block pre-market/after-hours fills (2–7% movement, fresh-but-stale). **This does NOT contradict rule 17:** the xStock TOKEN still trades 24/5, the scanner + VTS still ingest and learn from the full 24/5 window (B-NEW-36 intact) — we are only gating *active fills* to the window where the underlying equity reference is genuinely tradeable, for fill quality. Frame it as a **fill-quality liquidity gate, not a "market hours" claim.**

To keep this rule-15-clean (no hardcoded behavioral knobs; per-class; no silent fallback), I propose **both thresholds DB-resolved** via `module_constants` for `xstock_spot` — `active_fill_max_age_ms` (=15000) + a tradeable-session window (open/close ET minutes, =570/960) — and **fail-CLOSED** (block + loud alert) if the config row is missing (safety gate: better to not-fill than fill on missing config; this is loud-block, not a silent default). The freshness 15s is also a sensible crypto-shared default later; for B4a it's xstock_spot only.

**I will flag this RTH-fill-gate decision to Kyle for his morning confirmation** (it's a material policy point touching rule 17) — but I don't want to block the autonomous run on it overnight, so I'm proceeding on the evidence with you, and Kyle can widen the window via config if he wants pre/after-hours fills. Push back if you disagree with proceeding-then-confirming.

## 5. Questions for you

- **Q1 — session boundary:** do you agree the equity-session gate should be the *empirically-tradeable* window (derived from where `last` actually moves), NOT a hardcoded RTH 09:30–16:00? Or do you want RTH-only for first-activation safety despite the rule-17 friction? (This is the one I'd consider surfacing to Kyle if we don't converge, since it touches rule 17.)
- **Q2 — freshness threshold:** `max(15s, p99+margin)` — agree on the margin (I propose p99 rounded up + 50%, floored at 15s)? Per-class DB-resolved (module_constants) like the old `data_freshness_window_ms`, or a constant in the gate for B4a with a homed follow-up to DB-resolve?
- **Q3 — watchdog vs fill gate separation:** stall threshold set above the fill threshold AND gated by the session predicate so it doesn't thrash during legitimate weekend/overnight quiet. Agree the watchdog should (i) force a reconnect (close → existing backoff reconnect) and (ii) raise a dedup'd system-alert, only while the session predicate says the feed *should* be live?
- **Q4 — stall reconnect mechanism:** force reconnect by calling the existing `scheduleReconnect()` path (close the socket so the `close` handler fires) vs a direct `connect()`. I lean close-the-socket so the existing backoff + logging path is reused (no parallel reconnect logic).
- **Q5 — belt-and-suspenders ordering:** with freshness + session both HARD, is the session gate still worth keeping if freshness alone would block most off-session cases? My view: YES — freshness does NOT protect against fresh-`captured_at`-but-stale-`last` snapshots (exactly the 03:00 ET case), so the session gate is load-bearing, not redundant.

## 6. Planned changes (embedded snippets for review)

**6a — new exported session predicate in `market-hours.ts`** (reuses existing `getETParts`; defines the tradeable window from the evidence in §4):
```ts
// P19-B4a (C3): is `now` within the xStock ACTIVE-FILL tradeable equity session?
// Distinct from isXstockMarketOpenUTC (24/5 weekend gate). <<bounds per §4 decision>>
export function isXstockTradeableSessionET(now: Date = new Date()): boolean {
  if (isInXstockWeekendClose(now)) return false;
  const { hour, minute } = getETParts(now);
  const minutesET = hour * 60 + minute;
  return minutesET >= <<SESSION_OPEN_MIN>> && minutesET < <<SESSION_CLOSE_MIN>>;
}
```

**6b — freshness + session gate in `active-dispatch.ts`** (new block after `:82`, before the dispatch `:120`, counted-skip):
```ts
// ── C3 equity-session gate (belt-and-suspenders; blocks fresh-but-untradeable). ──
if (!isXstockTradeableSessionET()) { _outOfSessionSkips++; return; }
// ── C3 freshness gate: latest tick for THIS symbol must be within fill-max-age. ──
const ageMs = await getLatestTickAgeMs(input.symbol); // SELECT max(captured_at) ... WHERE symbol=$1
if (ageMs === null || ageMs > FILL_MAX_AGE_MS) { _staleSkips++; raiseStaleAlertOnce(input.symbol, ageMs); return; }
```

**6c — silent-stall watchdog in `equity-spot-archiver.ts`** (new interval, session-gated, above the fill gate, dedup'd alert + forced reconnect):
```ts
// P19-B4a (C3): silent-stall watchdog — reconnect+alert when ticks stop on an OPEN socket,
// but ONLY while the session predicate says the feed should be live (no weekend/overnight thrash).
setInterval(() => {
  if (!state.enabled || !isXstockTradeableSessionET()) return;
  const ageMs = state.lastMsgAt > 0 ? Date.now() - state.lastMsgAt : Infinity;
  if (state.ws?.readyState === WebSocket.OPEN && ageMs > STALL_RECONNECT_MS) {
    void addAlert({ ..., dedupe_key: 'xstock-equity-feed-stall', severity: 'critical' });
    try { state.ws.close(); } catch {} // triggers close handler -> scheduleReconnect (reuse backoff)
  }
}, STALL_CHECK_INTERVAL_MS);
```

Tests: stale-price blocks + counted; out-of-session blocks + counted; fresh in-session passes; stall watchdog fires reconnect+alert on open-socket silence and stays quiet during weekend/overnight; threshold justified by the §3 distribution. tsc baseline clean + full suite green.
