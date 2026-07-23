# B-WS-SUBSCRIBE-CLASS-FILTER — PRE-AUDIT (#559)

**change-class: non_architecture** · **Owner:** CC-A · **Date:** 2026-07-23

> ⚠️ **WRITTEN AFTER THE BATCH SHIPPED.** The audit below genuinely happened — it is what caught the silent no-op and re-pointed OBJ-2 — but I recorded it across the scope file and the Langston thread instead of as its own document, and the governance checker correctly raised alert `786f0813`. The analysis is contemporaneous; the *document* is late.

---

## 1. ENTRY-POINT ENUMERATION (§9.5(a) — census, not a path trace)

**Who can subscribe on the crypto adapter?** `git grep subscribeToSymbols` (non-test) → **14 call sites**: 13 internal to `kraken-websocket-adapter.ts` + 1 external (`routes.ts:9996`). **All funnel through `subscribeToSymbols` (`:1063`)** — that method maps each symbol via `normalToKrakenSymbol` and drops nulls. This is the entry gate Kyle's directive names.

**Who drives the repeated subscribe?** Three consumers read the I8C open-positions provider: `i8cSubscribeAllOpenPositions` (startup), `i8cResubscribeAllOpenPositions` (reconnect), and `i8cRunSubscriptionAudit` (the 5s `i8cAuditInterval`, `:2577`). **Filtering the provider therefore covers all three at one site.**

## 2. ★ THE STORM SOURCE — MY FIRST NAMED TARGET WAS WRONG (caught before Langston ruled)

The scope's first draft blamed `autoSubscribeMissingSymbols` / the `:1884` `'missing'` filter. **Reading the full body proved that path INNOCENT:** `auditWebSocketCoverage` (`:1849`) classifies an unmappable symbol as `'unmappable'`, and `autoSubscribeMissingSymbols` re-subscribes only the `'missing'` bucket — xStock is already excluded there.

**The real source is `i8cRunSubscriptionAudit` (`:2596`)** — the method the 5s interval actually calls. Its loop tests only `subscribedSymbols.has(sym)`, with **no mappability or class awareness**; xStock can never enter `subscribedSymbols`, so it is flagged `missing_subscription`, pushed to `fixes`, and re-sent to `subscribeToSymbols` every 5s (`~:2637-2645`) ⇒ **~133,386 futile `SUBSCRIBE_SKIPPED`/day.** Langston independently re-derived this at the ref and confirmed.

## 3. ★★ THE FINDING THAT CHANGED THE FIX — THE APPROVED GUARD WOULD HAVE BEEN A SILENT NO-OP

The Step-1-approved shape was `resolveAssetClass(symbol, 'kraken') !== 'crypto_spot' → skip`. **Queried `active_open_positions`: all 15 xStock positions are stored in PLAIN form (`ARKK/USD`, `C/USD`, `BABA/USD`) — 0 of 15 carry an x-suffix.** And `resolveAssetClass`'s own code states plain `BASE/QUOTE` is *"indistinguishable from crypto by symbol alone."* ⇒ a symbol-based guard classifies every plain-form xStock as crypto, skips nothing, passes tsc + suite, and leaves the storm running — the **#568 "an absence that reads as a valid value"** class.

**⇒ The fix must use the AUTHORITATIVE stored `asset_class`**, which is discarded at the `subscribeToSymbols(string[])` / provider `() => Promise<string[]>` boundary. Hence: filter at the provider, where `getActiveOpenPositions` still carries the column.

**★ Honest limit (Langston's correction, on record):** I asserted the no-op more firmly than proven — `XSTOCK_SPOT_SYMBOLS.has(symbol)` (`asset-classes.ts:669`) is **runtime-populated from `xstock_spot_universe` at boot**, and I read the static/empty set. So "the guard skips nothing" is `RULED ON REPORTED FACT`. It does not change the disposition (the column fix is correct either way and strictly more robust) but the overclaim was mine.

## 4. RESOLVER COST + CALLER CHECKS (Langston's Q3/Q4)

- `resolveAssetClass` is **pure in-memory** (regex tests + set lookups, no I/O) ⇒ inline is fine, no cache needed.
- `routes.ts:9996` subscribes `[...paperPositions, ...liveTrades].map(p => p.symbol)` — the 15th caller, and it carries the same bare-symbol limitation (homed to #571).

## 5. BLAST RADIUS / SIM

- The provider serves the **crypto** adapter only; xStock rides `ws-equities.kraken.com` via `equity-spot-archiver.ts`, so filtering non-crypto here **cannot starve xStock** (Langston independently verified this before approving).
- **NOT touched:** the exit monitor's class-aware staleness rail (already correct); the xStock equities feed; the "unmanageable position" alerts (a separate rail — #526/#531/#569).
- SIM §2.1 (Kraken WebSocket Adapter) updated at close with the class-filtered provider + the "do NOT filter by symbol" warning.

## 6. GOVERNANCE APPLICABILITY

`RUNNING_ISSUES` (#559, #571) · `BATCH_CATALOG` · `PHASE_HISTORY` · `SYSTEM_IMPACT_MAP` — all updated at close. **SYSTEM_MANUAL: N/A** (a subscription-admission filter; no architecture/strategy/regime/filter-decision/pipeline/math change).
