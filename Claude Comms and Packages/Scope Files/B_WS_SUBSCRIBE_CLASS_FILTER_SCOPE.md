# B-WS-SUBSCRIBE-CLASS-FILTER — SCOPE (#559)

**change-class: non_architecture**
**Owner:** CC-A · **Review:** Langston · **Date:** 2026-07-23 · **Issue:** #559

---

## 1. THE DEFECT (diagnosed 2026-07-22, `3a7d07e7c`)

The **crypto** Kraken WebSocket adapter (`wss://ws.kraken.com`, `kraken-websocket-adapter.ts`) is repeatedly handed **xStock** symbols to subscribe to. xStocks are not served by this feed — they have their own separate socket (`wss://ws-equities.kraken.com`, via `equity-spot-archiver.ts`), and Kraken's crypto spot `AssetPairs` contains **zero** equity tickers in any form (settled empirically last session — the "missing x-suffix" hypothesis was refuted). So every xStock symbol maps to `null` in `normalToKrakenSymbol` (`:1203` → `SUBSCRIBE_SKIPPED` `:1229`).

The waste comes from the **I8C subscription audit** (`i8cAuditInterval`, `setInterval(…, I8C_AUDIT_INTERVAL_MS=5000)`, `:2577`): every 5 seconds it reads the open-positions provider (which returns ALL open positions, including xStocks), computes which are "missing" a subscription (`:1884`), and re-subscribes them. xStock open positions are "missing" every single audit because they can never map ⇒ **~133,386 futile subscribe-skips per day.** The audit is CORRECT; it is being fed work that cannot succeed.

## 2. KYLE'S DIRECTIVE ON THE FIX LOCATION (2026-07-22 — corrects my first write-up)

My original scope proposed filtering the **one** provider call site to crypto-only. **Kyle rejected that as insufficient and named the right principle:** fix it at the **crypto subscriber's OWN ENTRY GATE, so a non-crypto asset class is NEVER ADMITTED IN — not blocked on the way out, never let in.** Rationale (mechanism over discipline, §5 rule 15): there are **14 `subscribeToSymbols` call sites** (13 internal to the adapter + `routes.ts:9996`); filtering one provider leaves every other caller able to admit a wrong class. A single guard at the gate covers all of them structurally.

## 3. THE GATE (architectural read — done at scope per §2 step 1.a)

- **`subscribeToSymbols(symbols)` at `:1063` is the single funnel.** All 14 callers pass through it; it maps each symbol via `normalToKrakenSymbol` and drops nulls. **This is the entry gate Kyle means.**
- **The class resolver** `resolveAssetClass` is exported from `shared/asset-classes.ts`. It is NOT yet imported in the adapter (only `krakenAssetPairsService` is).
- **The crypto adapter serves exactly one class: `crypto_spot`.** Any other class is categorically not its concern.

## 4. OBJECTIVES

**OBJ-1 — ENTRY-GATE CLASS GUARD (the structural fix, covers all 14 callers).** At the top of `subscribeToSymbols`, resolve each symbol's asset class; **drop any symbol whose class is not `crypto_spot` before it reaches `normalToKrakenSymbol`.** Nothing non-crypto can be admitted to the crypto adapter regardless of which caller sends it. **Logging: deduped** — one line per newly-rejected symbol, NOT one per call (the current per-symbol `SUBSCRIBE_SKIPPED` spam is part of what this removes).

**OBJ-2 — KILL THE 5-SECOND RETRY STORM AT SOURCE.** The entry-gate guard alone only moves *where* xStock is dropped (from the map to the guard) — the I8C audit would still re-call every 5s. So the I8C coverage audit (`:1848`) must classify a non-`crypto_spot` symbol as a terminal status (a new `wrong_class`, or reuse `unmappable`) that is **excluded from the "missing" re-subscribe set** (`:1884`). A symbol the crypto feed structurally cannot serve is not "missing" — it is "not ours," and must not be retried. This is what actually removes the 133k/day.

**OBJ-3 — (belt-and-suspenders, confirm with Langston) filter the I8C open-positions provider** at its registration site to crypto-class only, so the audit's candidate set never contains xStock in the first place. With OBJ-1+OBJ-2 this is redundant-but-cheap defense in depth; Langston to rule whether it earns its place or is noise.

**EXPLICITLY OUT OF SCOPE:** the xStock equities feed itself (separate socket, working); the exit monitor's class-aware staleness rail (already correct — `active-execution-engine.ts:~940`, do NOT touch); the "unmanageable position" alerts (that rail working correctly on thin names — #526/#531 family, not this).

## 5. VERIFICATION CRITERIA

- tsc baseline clean; full suite A/B'd against pristine on the bench.
- **Live on staging:** after deploy, the per-5s `SUBSCRIBE_SKIPPED` lines for xStock symbols **stop** (grep the log across a ≥5-min window — zero xStock skip lines where before there were ~9/min).
- The crypto feed still subscribes crypto symbols normally (crypto price ticks continue — `[I8C-WS-TICK][ACK]` for crypto pairs).
- An xStock open position still gets its price via the equities rail (the exit monitor's `getLatestEquityTick` path is untouched and still marks xStock positions).
- UI: Ready-to-Buy + Open Trades still render both classes (via Kyle's logged-in Chrome, §9.3).

## 6. OPEN QUESTIONS FOR LANGSTON (Step-1)

1. **New status vs reuse `unmappable`** for OBJ-2 — is there already an `unmappable` terminal status the audit excludes, or does xStock currently land in `missing`? (I read the enum at `:1816` but not the full audit body — Step-2 confirms.)
2. **OBJ-3 in or out** — does filtering the provider add real safety over OBJ-1+2, or is it redundant noise?
3. **Resolver cost** — `resolveAssetClass` per symbol per subscribe call: cheap enough inline, or cache the class on first resolve?
4. Any caller among the 14 that LEGITIMATELY needs to pass a non-crypto symbol to this adapter (there should be none — but confirm before making the guard hard).
