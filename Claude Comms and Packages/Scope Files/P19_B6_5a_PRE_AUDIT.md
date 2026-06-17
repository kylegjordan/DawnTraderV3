# P19-B6.5a PRE-AUDIT — Per-Asset-Class Active Gate

> **Batch:** P19-B6.5a · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-17 · **For:** Langston Step-2 review
> **Scope:** `P19_B6_5_SCOPE.md` (Rev-2) · **Issue:** #235 · **Gate:** PHASE_19_PLAN §6 gate 10 (the B6.5a half)
> All file:line refs below are DIRECT reads (CLAUDE.md §2 step-2 discipline), not grep/memory.

---

## §1 THE PROBLEM (one paragraph)
Active trading is gated only on a **per-MODE** flag: `system_context.isEngineActive` (paper / live). There is **no per-asset-class dimension** anywhere in the state machine (grep `activeAssetClasses`/`isAssetClassActive` → 0 hits). The crypto active entry (`fx5-scanner.ts:543-555`) and the xStock active entry (`xstock_spot/active-dispatch.ts:122-123`) **both** gate on the same `getSystemContext('paper').isEngineActive`. So flipping paper `isEngineActive=true` co-activates BOTH crypto and the still-dormant/incomplete xStock active path. B7b is staged **crypto-first with xStock off** → **B7b itself cannot use the existing flag** without waking xStock. The per-class gate is therefore **missing B7b infrastructure**, and B6.5a builds it (Langston Step-1 ruling: Option C).

## §2 STATE-MACHINE GROUND TRUTH (direct reads)
- **SSOT:** `trading-state-sync.ts` — `isEngineActive(mode)` (`:347-349`) reads `system_context.isEngineActive`; `setEngineActive(userId, isActive, mode)` (`:238`) writes it (`:296`). Per-mode only. D5 (H1) made `setEngineActive` await the DB write FIRST then broadcast; the 30s guard runs `checkLivenessInvariants` (H2) emitting the `LIVENESS_SPLIT` witness.
- **Run-mode:** `run-mode-controller.ts` derives 3-mode RunMode (`vts`|`paper_sim`|`live`) PURELY from `tradingStateSync.isEngineActive('paper'|'live')` (`:78-88`). No asset-class dimension; explicitly avoids extending the 2-mode `TradingMode` type ("high blast radius — leave it alone", `:12-13`).
- **SIM registry (Cross-Cutting Runtime State…):** reader #1 (SSOT) = DB `getSystemContext(mode).isEngineActive` gating `fx5-scanner.ts:544` + `xstock_spot/active-dispatch.ts:124`; onboarding pattern (SIM:3086) = "gate the `<class>/active-dispatch.ts` connector on the authoritative `isEngineActive` flag." The per-class gate extends this registry.

## §3 PROPOSED DESIGN — an ADDITIONAL fail-closed AND-gate (NOT a replacement)
`isEngineActive(mode)` stays the **master per-mode switch** ("is active trading on at all for this mode"). Add a **per-(mode, asset_class) active flag**, DB-resolved, **default OFF (fail-closed)**. A class trades iff:
```
isEngineActive(mode) === true  AND  isAssetClassActive(mode, assetClass) === true
```
- **B7b crypto-first becomes expressible:** master ON + `crypto_spot` ON + `xstock_spot` OFF → crypto trades, xStock stays dormant **even with the master flipped** (closes the exact co-activation hole).
- **Composes with everything dormant:** xStock's existing `active-dispatch.ts` dormancy-by-authority gate gains `&& isAssetClassActive(mode,'xstock_spot')` (defaults false → unchanged dormant behavior, now explicit). NO-PATCHES: this is the durable mechanism B7b reuses, not a workaround.

**Gate-application sites (where the AND-condition lands — the class-specific entry points):**
| Site | File:line | Class | Action |
|---|---|---|---|
| Crypto scan entry | `fx5-scanner.ts:543-555` | crypto_spot | add `&& isAssetClassActive(mode,'crypto_spot')` to `tradingActive` |
| xStock dispatch entry | `active-dispatch.ts:122-123` | xstock_spot | add `&& isAssetClassActive('paper','xstock_spot')` to the dormancy gate |
| RTB admission (defense-in-depth) | `ready_to_buy_service.ts:593-594, 786-787` | per-signal | OPTIONAL: reject a queued signal whose `assetClass` is not active (belt-and-suspenders; the entry gates already prevent inactive-class signals) |

**Status/startup reads that are NOT gates (leave alone):** `routes.ts` status endpoints (`:4256, :6139, :13021`), `index.ts:255-258` (startup), `trading-bootstrap.ts:55-57` (stale-flag reconciliation), `feed-integrity-auto-check.ts`, `command-router.ts` (status). Enumerated to prove the gate surface is bounded to the 2 (+1 optional) entry points.

## §4 SCHEMA DECISION (open for Langston — Q-A)
`system_context` is per-mode (one row per `paper`/`live`). Three options for the per-class flag:
- **(A) JSONB column on `system_context`** — `active_asset_classes jsonb default '{}'::jsonb` (e.g. `{"crypto_spot": true, "xstock_spot": false}`). Pro: co-located with the master flag, one read already in hand at every gate (`getSystemContext(mode)` is already called), zero new table/query. Con: JSONB (typed accessor needed). **CC lean.**
- **(B) New table `asset_class_active` keyed (mode, asset_class)** — explicit rows, fail-closed when row absent/false. Pro: relational, easy to seed/admin. Con: a new read on every gate (hot path; fx5 scans every 30s — acceptable but adds a query) unless cached.
- **(C) `module_constants`** — reuse the DB-resolved-config pattern. Con: semantically it's runtime STATE (flippable at turn-on), not static config; mismatches the table's purpose.

CC lean = **A** (co-located, no extra hot-path query, fail-closed = missing key/false). Fits the existing `getSystemContext` read already present at both gates. **Q-A: A, B, or C?**

## §5 OTHER OPEN QUESTIONS
- **Q-B — RTB defense-in-depth:** gate at entry points only (simplest; inactive class never emits a signal), or ALSO reject-by-assetClass at RTB admission (belt-and-suspenders)? CC lean: entry-only for B6.5a + a comment at RTB noting the upstream guarantee; add RTB enforcement only if the audit (B6.5b) shows a path that injects past the entries.
- **Q-C — setter surface:** add `setAssetClassActive(mode, assetClass, bool)` to `trading-state-sync` (mirrors `setEngineActive`, same await-DB-first-then-broadcast discipline)? Or a thin storage helper + a routes endpoint for the dry-run to toggle? CC lean: a `trading-state-sync` method (consistency with the liveness SSOT) + a guarded internal route for B6.5b's dry-run.
- **Q-D — liveness witness:** should `checkLivenessInvariants` (H2) gain a per-class dimension (witness a class that is gate-OFF but somehow producing active signals)? CC lean: YES, lightweight — the xStock-isolation acceptance test (§6) is essentially this witness; reuse the `LIVENESS_SPLIT` counter pattern with a per-class label.
- **Q-E — default seed:** ship with BOTH classes OFF (pure fail-closed; the dry-run/B7b flips them explicitly), correct?

## §6 THE xStock-ISOLATION ACCEPTANCE TEST (gate-10 requirement, Langston Q4)
The B6.5a deliverable includes a test proving: with master `isEngineActive(paper)=true` + `crypto_spot` active + `xstock_spot` INACTIVE → the xStock `active-dispatch` path takes the dormant branch (counted skip) and emits ZERO xStock signals/opens, while crypto flows. Unit-level: assert `dispatchXstockActiveSignal` returns at the per-class gate (new counter) when `xstock_spot` inactive even though `isEngineActive` is true. This is also the live evidence B6.5b's dry-run captures (zero xStock rows during the crypto-only run).

## §7 BLAST RADIUS / SAFETY
- **DORMANT by construction:** default OFF means shipping B6.5a changes NOTHING about today's behavior (both classes already effectively off because `isEngineActive` is false in VTS). Even if `isEngineActive` were flipped, both classes default OFF → no trades. The gate only ever RESTRICTS.
- **Migration:** additive (JSONB column default `{}` or a new table) — no backfill risk, no destructive change.
- **SIM:** the new per-class flag is cross-cutting runtime state → a registry entry under "Cross-Cutting Runtime State, Singletons & Liveness Registry" (Step-10 governance).
- **Tests:** the isolation acceptance test + gate-on/off unit tests + a fail-closed (missing config → inactive) test.

---
*Step-2 pre-audit for Langston review. On PROCEED + Q-A/B/C/D/E rulings → Step-3 implementation.*
