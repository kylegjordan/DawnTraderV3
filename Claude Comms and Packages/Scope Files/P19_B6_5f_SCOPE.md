# P19-B6.5f — Canonicalizer quote-currency completeness + loud unknown-quote guard

> **Batch:** P19-B6.5f · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-18 · **Issue:** RUNNING_ISSUES P19-B6.5f
> **change-class: non_architecture** — symbol-canonicalizer coverage + a new observability alert; no new engine/component, no math change.
> **Reviewer:** Langston — Step-1 PENDING (the approach + 2 requirements are pre-agreed in his B6.5e dry-run-findings verdict; this scope operationalizes them).
> **Origin:** the P19-B6.5e crypto dry-run fired **6 critical `classify-fallthrough-active` alerts** on the ACTIVE path — ETH/EUROP, ETH/PYUSD, XBT/EUROP, XBT/PYUSD, XRP/RLUSD (+ the earlier A/EUR). **Ships FIRST (before B6.5g)** so B6.5g's dry-run runs on a clean canonical set with more eligible crypto pairs in play.

## 0. The defect — TWO confirmed QUOTE-side root causes (DISTINCT from B6.5d's single-letter BASE fix)
The base assets are obviously crypto (ETH/XBT/XRP); the **QUOTE leg** is what isn't recognized, so the pair fails classification and the active-path signal is skipped:
1. **`server/services/utils/symbol-canonicalizer.ts:151`** — `knownQuotes = ['USD','USDT','EUR','GBP','JPY','CAD','AUD','CHF']` is missing the newer Kraken stablecoin quote currencies (EUROP, PYUSD, RLUSD, …).
2. **`shared/asset-classes.ts` `CRYPTO_SPOT_CANONICAL`** — the quote group `[A-Z0-9]{3,4}` caps the quote at **4 chars**, but EUROP / PYUSD / RLUSD are **5 chars** → they fail the regex even if added to `knownQuotes`. Both must be fixed.

## 1. Objectives
**OBJ-1 — Enumerate Kraken's FULL current quote-currency set (NOT just the 3 observed — Langston requirement, NO-PATCHES).** Query the live Kraken `/0/public/AssetPairs` and extract the complete distinct set of quote legs actually in use; reconcile against the current `knownQuotes`. Candidates to verify: EUROP, PYUSD, RLUSD, USDC, USDG, DAI, USDP, TUSD, USDR (confirm each against the live list; include only real ones). Add the missing real quotes to `knownQuotes` as a documented SSOT list with provenance (date + "verified against live AssetPairs").

**OBJ-2 — Widen the `CRYPTO_SPOT_CANONICAL` quote-length bound** from `{3,4}` to accommodate the longest real quote (5), via a NAMED SSOT constant (mirror `TICKER_BASE_MIN_LEN` / `CRYPTO_SPOT_BASE_MAX_LEN` from B6.5d) — e.g. `QUOTE_LEN_MIN=3` / `QUOTE_LEN_MAX=5`. Re-verify collision precedence is untouched (the quote widen must not let a base-side ambiguity through). Sweep for any sibling regex that hardcodes the `{3,4}` quote group (the B6.5d `symbol-normalize.ts` shared-compiled-regex lesson — change the SSOT, not a copy).

**OBJ-3 — Loud NAMED alert on any UNRECOGNIZED quote (Langston requirement).** When canonicalization fails specifically because the quote leg is unknown, raise a named alert carrying the **specific unknown quote string** (+ the full pair + exchange) so the next gap is a one-line diagnosis instead of a silent fall-through. Distinct from the existing `classify-fallthrough-active` alert (which says "couldn't classify" without naming WHY) — this names the quote. Fail-closed (still skip the pair), but observably.

**OBJ-4 — Prove the 6 alerting pairs now classify `crypto_spot`** (ETH/EUROP, ETH/PYUSD, XBT/EUROP, XBT/PYUSD, XRP/RLUSD) on the deployed code; resolve/ACK the 6 active critical alerts post-deploy.

**OBJ-5 — Tests:** the new quotes resolve crypto_spot; a 5-char quote passes the widened regex; an unknown quote fires the named alert + still fail-closed-skips; collision precedence preserved (a B6.5d-style ORDER test).

## 2. Scope guards
- **Do NOT** touch the LOCKED `kraken.ts` for the live AssetPairs read — use the existing Kraken AssetPairs service / a read-only `/0/public/AssetPairs` query (public endpoint, no auth, no order path).
- **Do NOT** widen the BASE side (B6.5d owns that, `TICKER_BASE_MIN_LEN`); this batch is QUOTE-side only.
- This is upstream of the EV gate — these pairs are dropped from the active path ENTIRELY (they never reach EV). It's a coverage hole, not a quality-gate change.

## 3. Langston Step-1 questions
1. The named-unknown-quote alert (OBJ-3) — new dedicated alert key (e.g. `classify-unknown-quote:${quote}@${exchange}`), or extend the existing `classify-fallthrough-active` metadata with the parsed quote? I lean a dedicated key (so the dashboard separates "unknown quote" from other classify failures).
2. `QUOTE_LEN_MAX=5` — confirm 5 covers the full live set, or do you want me to set it from the longest quote the AssetPairs enumeration actually returns (data-driven bound)?
3. Any reason to enumerate the quote set at BUILD time (static) vs RUNTIME (refresh against live AssetPairs periodically)? CC lean: a curated static SSOT list (verified at this batch) + the loud guard catches drift — simpler + deterministic than a runtime quote-discovery loop.

---
*On Step-1 PROCEED → Step-2 pre-audit (live AssetPairs quote enumeration + the regex/knownQuotes blast-radius) → Step-3 implement → bench → Step-4 review → CI → deploy → prove the 6 pairs + resolve alerts → governance → close. THEN P19-B6.5g (EV-input integrity + gate-10).*
