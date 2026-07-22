# B-WS-SUBSCRIBE-CLASS-FILTER — COMPLETION REPORT (#559)

**change-class: non_architecture** · **Owner:** CC-A · **Review:** Langston (Step-1 + Step-4 APPROVED, both re-read at the ref)
**Commit:** `71ec83f36` · **CI:** green (run 29967165478) · **Deployed + live-verified 2026-07-23**

> **SCOPE:** ships **OBJ-2** (the measured-storm kill). **OBJ-3** collapsed into OBJ-2. **OBJ-1** (bare-symbol entry gate) is **homed as a §13 continuation** — see §5.

---

## 1. WHAT WAS WRONG

The **crypto** Kraken WebSocket adapter (serves only `crypto_spot`) was repeatedly handed **xStock** symbols to subscribe to. xStocks ride a separate feed (`ws-equities.kraken.com`) and Kraken crypto `AssetPairs` has zero equity tickers, so every xStock maps to `null` (`SUBSCRIBE_SKIPPED`). The **I8C open-positions provider** returned ALL open positions incl. xStocks; the 5-second `i8cRunSubscriptionAudit` read it, found each xStock forever "missing" (it can never enter `subscribedSymbols`), and re-subscribed every 5s ⇒ **~133,386 futile skips/day.**

## 2. WHY THE OBVIOUS FIX WOULD HAVE BEEN A SILENT NO-OP (the pre-audit's main catch)

The Step-1-approved shape was a symbol-based guard: `resolveAssetClass(symbol, 'kraken') !== 'crypto_spot' → skip`. **Verified in the DB it would skip nothing:** all 15 xStock open positions are stored in **plain form** (`ARKK/USD`, `C/USD`, `BABA/USD`) — **0 of 15 carry an x-suffix** — and the resolver's own code says plain `BASE/QUOTE` is *"indistinguishable from crypto by symbol alone."* A symbol guard would classify every plain-form xStock as crypto, skip nothing, pass tsc + suite, and leave the storm running (the #568 "absence reads as valid value" class).

**★ Honest correction on the record (Langston caught it):** I stated the no-op conclusion more firmly than I'd proven — `XSTOCK_SPOT_SYMBOLS.has(symbol)` (a branch that *could* flip plain `C/USD` → xstock_spot) is **runtime-populated from the DB universe at boot**, and I read the static/empty set. So the "guard skips nothing" claim was `RULED ON REPORTED FACT`. It does not change the disposition — the authoritative-column fix is correct either way and strictly more robust — but the overclaim was mine.

## 3. WHAT SHIPPED (OBJ-2)

Filter the **I8C open-positions provider** (`active-execution-engine.ts:526`) — the **one confirmed storm source** — using the **AUTHORITATIVE stored `asset_class`**, not symbol re-resolution:

```
asValidAssetClass(p.assetClass) ?? safeResolveAssetClass(p.symbol, 'kraken')  // stamp → resolve
// null/unresolvable → deduped [CLASSLESS] WARN, then default crypto_spot (keep the row managed)
// keep only rows resolving to crypto_spot
```

- Matches the established `:308`/`:1030` idiom (Langston correction #1) so a null/legacy-class **real crypto** row still resolves and is kept — not silently dropped.
- Null branch **SURFACES** with a per-process deduped `[CLASSLESS]` WARN (Langston correction #2) — a class-less row is flagged, not silently guessed. **WARN-then-default, not WARN-then-drop:** dropping a real crypto position from its price feed would blind its exit evaluation — a safety-negative failure worse than the storm (Langston Q3 ruling).
- **One site covers all three provider consumers** — startup subscribe, reconnect resubscribe, and the 5s audit all read this provider.

## 4. VERIFICATION

- **tsc baseline:** clean, no regressions (clean private bench at origin head).
- **Tests:** 2417 passed vs 2413 pristine (+4 new fences in `b-ws-subscribe-class-filter.test.ts`); 10 collection failures identical both runs (no bench DB), A/B'd by stash.
- **CI:** green, run 29967165478.
- **★ LIVE PROOF (staging, 5-min window after the filtered provider registered at 23:49:24Z):**
  - xStock `[I8C-AUDIT][FIX]` lines after registration: **ZERO** (was ~9/min).
  - `SUBSCRIBE_SKIPPED` lines after registration: **ZERO**.
  - The 5s audit went **silent** — all 15 open positions are xStock, so the filtered provider returns an empty list and `i8cRunSubscriptionAudit` early-returns (no FIX, no SUMMARY). Correct behavior.
  - Crypto price flow **unaffected**: 7,176 crypto ticks in the window.

## 5. OBJ-1 HOMED (§13) — NOT shipped here

OBJ-1 (guard the bare-symbol `subscribeToSymbols` entry gate so the other ~14 callers can't admit a wrong class) is a **scope decision, bucket 2** — a bare-symbol mappability guard can't beat the on-the-way-out `SUBSCRIBE_SKIPPED` signal Kyle wants replaced. The real fix threads the authoritative class **through the subscription boundary** (`subscribeToSymbols` taking `{symbol, assetClass}`, or each provider filtering) — a boundary change, not a one-liner. **Homed as continuation `B-WS-SUBSCRIBE-BOUNDARY-CLASS` (#571), Phase 19, owner CC-A.** Bounded residual acknowledged (Langston): a genuinely-xStock row that is BOTH class-less AND unresolvable would default back to crypto and re-enter the storm for that one symbol — one WARN/symbol, exactly the case #571 cures.

## 6. GOVERNANCE FILES UPDATED

`RUNNING_ISSUES.md` (#559 OBJ-2 resolved + #571 filed) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `SYSTEM_IMPACT_MAP.md` (WS-subscription provider now class-filters) · scope file · this report.

## 7. STATUS

**OBJ-2 COMPLETE** — implemented, reviewed, CI-green, deployed, live-verified (storm dead, crypto unaffected). **OBJ-1 homed as #571.** #559 closable on OBJ-2; the boundary work tracks under #571.
