# P19-B6.5f (reorg-B1) — Symbol-recognition completeness, BOTH classes

> **Batch:** P19-B6.5f · **reorg-board:** B1 · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-19
> **change-class: non_architecture** — recognition-path quote-currency coverage + a shared SSOT constant + a named observability alert. No new engine/component, no EV/regime/strategy/filter logic, no math change. (Diff touches `shared/asset-classes.ts`, a core-path file — flagging for Langston's under-declaration cross-check; the edits are regex-bound widening + a derived constant + an alert-metadata field, not engine logic. Over-rule to `architecture` if you disagree.)
> **Reviewer:** Langston — Step-1 PENDING. **This SUPERSEDES the crypto-only v1** (`P19_B6_5f_SCOPE.md`, Langston Step-1 PROCEED `09bf82da1`): the reorg (D1/D2, `P19_REORG_BOTH_CLASSES_PLAN_2026-06-19.md`) expands recognition completeness to BOTH asset classes, so the expanded surface needs fresh Step-1 sign-off.
> **Origin:** the P19-B6.5e crypto dry-run fired **6 critical `classify-fallthrough-active` alerts** (ETH/EUROP, ETH/PYUSD, XBT/EUROP, XBT/PYUSD, XRP/RLUSD, + the earlier A/EUR). Reorg-board B1; **ships FIRST** (the minimum for crypto trades to start opening is B1 + B2).

---

## 0. The defect — re-framed for BOTH classes

The two asset classes are recognized through **different mechanisms**, so "recognition completeness" means a different thing for each. The honest both-class picture:

### 0.1 Crypto — a REAL, currently-firing gap (the v1 finding, confirmed in code)
The base assets are obviously crypto (ETH/XBT/XRP); the **QUOTE leg** is what isn't recognized, so the pair fails classification and the active-path signal is silently skipped. There are TWO root causes, and a third drift driver:
1. **Narrow quote enumeration.** `server/services/utils/symbol-canonicalizer.ts:151` `knownQuotes = ['USD','USDT','EUR','GBP','JPY','CAD','AUD','CHF']` and the two resolver raw-form regexes `shared/asset-classes.ts:519` (`CRYPTO_SPOT_KRAKEN_RAW_1`) + `:522` (`CRYPTO_SPOT_KRAKEN_RAW_2`) all hardcode the **same narrow alternation** — missing the newer Kraken stablecoin quotes (EUROP, PYUSD, RLUSD, …).
2. **4-char quote-length cap.** `shared/asset-classes.ts:515` `CRYPTO_SPOT_CANONICAL` uses `[A-Z0-9]{3,4}` for the quote group, and `server/utils/symbol-normalize.ts:99,106` hardcode the same `{3,4}` — but EUROP / PYUSD / RLUSD are **5 chars**, so they fail the regex even once added to the alternation. Both must be fixed.
3. **★ NEW structural finding (sharpens the v1 NO-PATCHES answer).** `server/markets/kraken-asset-pairs-service.ts:121-143` ALREADY holds a broad `VALID_QUOTES` set (incl. USDT/USDC/PYUSD/DAI) AND a `dynamicQuotes` set discovered from the live AssetPairs feed. So the **universe-build path already knows the full quote set** — it is only the **downstream static recognition regexes** (canonicalizer + resolver) that drift narrow and drop the pair at classify time. This is the cleanest case for a single SSOT (§1 OBJ-2): the recognition regexes should not re-enumerate quotes by hand when a discovered set already exists.

### 0.2 xStock — the same failure mode does NOT bite the same way (exchange-gated by construction)
xStock spot is classified by **exchange context**, not by parsing the quote: `resolveAssetClass` returns `xstock_spot` for `exchange === 'kraken-equities'` unconditionally (`shared/asset-classes.ts:558-560`), and the WS feed uses plain `<TICKER>/<QUOTE>`. So a correctly-tagged xStock can never fall through on an "unknown quote." That means xStock recognition completeness is a **different axis** — and most of it is already handled (DB-driven universe Set via `xstockUniverseService`, the quarterly collision re-audit, the display-form + collision gates). Three things make this a genuine SHARED batch (D1/D2), not crypto-only wearing a both-class label:
1. **Shared latent length-bound gap.** `XSTOCK_SPOT_DISPLAY` (`shared/asset-classes.ts:211-213`, `^[A-Z]{1,5}x\/[A-Z]{3,4}$`) and `symbol-normalize.ts:106` hardcode the **same `{3,4}` quote cap**. Widening the crypto bound via a shared named constant should widen the xStock display bound too — pre-empting the identical 5-char-quote gap the moment any xStock ever quotes in a 5-char stablecoin. Fixing one class's bound and not the other's would be exactly the drift D2 forbids.
2. **Shared loud guard.** The named-unknown-quote alert (OBJ-3) routes through the central `safeResolveAssetClass` counter + hook, which BOTH classes already inherit — the named-quote enrichment must name the quote regardless of class, not be crypto-only.
3. **Shared SSOT.** The quote-currency SSOT constant (OBJ-2) feeds every recognition-path regex for both classes, so neither can drift.

### 0.3 Scope boundary — recognition-DECISION sites ONLY (NOT every quote list)
A codebase sweep found the quote-currency set enumerated in **~20 files**. The vast majority are **different-purpose lists** — stablecoin detection (`kraken.ts:747`, `paper-sim-diagnostic.ts`, `reb-*` harnesses), FX-equivalence (`fx-conversion-service.ts`), scanner quote-eligibility (`fx5-scanner.ts`, `active-filter-pool.ts`, `unified-filter-gateway.ts`), benchmark pairs (`benchmark-regex.ts`), volume tiers (`volume-classifier.ts`). **This batch touches ONLY the recognition-DECISION path** — the sites that determine whether a pair is recognized so it can ENTER the pipeline:
- `server/services/utils/symbol-canonicalizer.ts` (Pattern-2 `knownQuotes`)
- `shared/asset-classes.ts` (`CRYPTO_SPOT_CANONICAL`, `CRYPTO_SPOT_KRAKEN_RAW_1/2`, `XSTOCK_SPOT_DISPLAY`)
- `server/utils/symbol-normalize.ts` (the `{3,4}` quote matchers)
- `server/markets/kraken-asset-pairs-service.ts` `VALID_QUOTES` / `dynamicQuotes` (the discovered SSOT source — read-from, see OBJ-2 Q)

Consolidating the OTHER ~15 lists is a separate, larger refactor and is explicitly OUT (no speculative refactoring, §5 rule).

---

## 1. Objectives

**OBJ-1 — Enumerate Kraken's FULL current quote-currency set (data-driven, not the 3 observed — Langston requirement, NO-PATCHES).** Read the live Kraken `/0/public/AssetPairs` (public, no auth, no order path) and extract the complete distinct set of quote legs in use; reconcile against the current narrow `knownQuotes` AND against the existing `kraken-asset-pairs-service` `dynamicQuotes`. Candidates to verify against the live list: EUROP, PYUSD, RLUSD, USDC, USDG, DAI, USDP, TUSD, USDR (include only confirmed-real ones).

**OBJ-2 — ONE SSOT for the recognition-path quote set (the structural fix).** Replace the three hand-maintained narrow alternations (`symbol-canonicalizer.ts:151`, `asset-classes.ts:519`, `:522`) with a single exported constant — e.g. `KNOWN_QUOTE_CURRENCIES` — consumed by every recognition-path regex. Preference (Step-1 Q2): **source it from the `kraken-asset-pairs-service` discovered set** so it cannot drift from what the universe-builder already knows, with a curated fallback for boot-before-discovery. The loud guard (OBJ-3) catches any residual drift.

**OBJ-3 — Widen the quote-LENGTH bound via a shared named SSOT constant, for BOTH classes.** Introduce `QUOTE_LEN_MIN=3` / `QUOTE_LEN_MAX=5` (mirroring the B6.5d `TICKER_BASE_MIN_LEN` / `CRYPTO_SPOT_BASE_MAX_LEN` pattern) and feed it into **both** `CRYPTO_SPOT_CANONICAL` AND `XSTOCK_SPOT_DISPLAY` (and the `symbol-normalize.ts` matchers). One constant → no class-to-class or file-to-file drift. Re-verify collision precedence is untouched (the quote widen must not let a base-side ambiguity through; preserve the XSTOCK-before-crypto dispatch order).

**OBJ-4 — Loud NAMED alert on any UNRECOGNIZED quote (Langston requirement), class-agnostic.** When canonicalization/classification fails specifically because the quote leg is unknown, raise a named alert carrying the **specific unknown quote string + full pair + exchange + resolved-or-attempted asset class**, so the next gap is a one-line diagnosis instead of a silent fall-through. Distinct from the existing `classify-fallthrough-active` (which says "couldn't classify" without naming WHY). Fail-closed (still skip the pair), but observably. Fires for whichever class hit it.

**OBJ-5 — Prove the 6 crypto alerting pairs now classify `crypto_spot`** (ETH/EUROP, ETH/PYUSD, XBT/EUROP, XBT/PYUSD, XRP/RLUSD, A/EUR) on deployed code; resolve/ACK the 6 active critical alerts post-deploy.

**OBJ-6 — Verify xStock has NO analogous OPEN recognition gap (completeness check, not a code change unless one is found).** Confirm: (a) the `xstockUniverseService` boot fallback chain cannot leave `XSTOCK_SPOT_SYMBOLS` empty in a way that silently mis-routes a plain-form xStock (`AAPL/USD` on `exchange='kraken'`) to `crypto_spot`; (b) the widened display-bound (OBJ-3) doesn't loosen any xStock/crypto collision. If a real gap surfaces, fold its fix in (D2); if none, record the verification in the completion report.

**OBJ-7 — Tests:** new crypto quotes resolve `crypto_spot`; a 5-char quote passes the widened regex (both the crypto canonical AND the xStock display form); an unknown quote fires the named alert + still fail-closed-skips; collision precedence preserved (a B6.5d-style ORDER test); the SSOT constant is the single source (a test that the alternation derives from it, not a literal).

---

## 2. Scope guards
- **Do NOT** touch the LOCKED `server/exchanges/kraken/kraken.ts` for the AssetPairs read — use the existing `kraken-asset-pairs-service` / a read-only `/0/public/AssetPairs` query.
- **Do NOT** widen the BASE side (B6.5d owns that, `TICKER_BASE_MIN_LEN` / `CRYPTO_SPOT_BASE_MAX_LEN`); this batch is QUOTE-side only.
- **Do NOT** consolidate the ~15 non-recognition quote lists (stablecoin / FX / scanner / benchmark / volume) — out of scope (§0.3).
- This is **upstream of the EV gate** — unrecognized pairs are dropped from the active path ENTIRELY (they never reach EV). It is a coverage hole + observability fix, NOT a quality-gate or EV change.

## 3. Langston Step-1 questions
1. **Alert key (OBJ-4):** dedicated key `classify-unknown-quote:${quote}@${exchange}`, or extend `classify-fallthrough-active` metadata with the parsed quote? CC lean: dedicated key (dashboard separates "unknown quote" from other classify failures).
2. **SSOT source (OBJ-2):** consume the `kraken-asset-pairs-service` discovered `dynamicQuotes` as the recognition SSOT (data-driven, self-healing, with a curated boot-fallback), OR a curated static `KNOWN_QUOTE_CURRENCIES` list verified at this batch (simpler, deterministic, drift caught by the loud guard)? CC lean: data-driven from the already-existing discovered set — it removes the hand-maintained drift entirely, which is the v1's actual root cause.
3. **`QUOTE_LEN_MAX=5`:** confirm 5 covers the full live set, or set it data-driven from the longest quote the AssetPairs enumeration returns?
4. **Both-class bound widen (OBJ-3):** confirm you want `XSTOCK_SPOT_DISPLAY` widened in lockstep now (pre-empting the latent gap per D2), vs crypto-only-now + a noted xStock follow-up. CC lean: lockstep now (D2 — one constant, no second pass).
5. **xStock verification depth (OBJ-6):** is the boot-fallback + collision re-check sufficient, or do you want a live dry-run probe of a plain-form xStock through `resolveAssetClass` as evidence?

---
*On Step-1 PROCEED → Step-2 pre-audit (live AssetPairs quote enumeration + the regex/SSOT blast-radius + the xStock boot-fallback trace) → Step-3 implement → bench (tsc-baseline + vitest) → Step-4 Langston diff review → CI 4-green → deploy → prove the 6 pairs + resolve alerts + xStock verification → governance → close. THEN reorg-B2 (rung-1 target-floor + liquid-volatile universe).*
