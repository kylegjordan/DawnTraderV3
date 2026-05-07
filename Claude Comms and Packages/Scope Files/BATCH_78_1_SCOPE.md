# BATCH 78.1 — Cycle break (DI inversion of ws-adapter ↔ live-pricing) + ws-adapter move

**Status:** DRAFT (rev 1) — pending Langston Step 1+2 review
**Workflow:** 11-step canonical
**Branch:** `migration/aws-supabase`
**Trigger:** Kyle no-deferrals directive 2026-05-07. B78 deferred this work; addressing it now while the modularization context is hot, before B79 starts.
**Pre-B78.1 HEAD:** `de827f37b` (B78 governance close)
**Critical-path?** YES — locks B78 deferrals into a named batch instead of orphan defer-list.
**Scope discipline:** cycle break + ws-adapter move ONLY. Friction extraction (B79 Day 0) and filter-as-first-class (B81 Day 0) are owned by their named batches per plan doc §4.

---

## §1. Trigger

`madge --circular` baseline (B78 pre-flight): cycle #10 of 47 is `services/kraken-websocket-adapter.ts ↔ services/live-pricing-adapter.ts`. Both files in `server/services/`; ESM tolerates the intra-package cycle today via mutable bindings. The B78 plan was to move ws-adapter into `server/exchanges/kraken/` alongside the rest of the kraken cohort, but doing so would convert the intra-package cycle into a cross-package cycle (Vite production tree-shake risk; PM2 cold-start ordering becomes load-order-dependent).

Langston rev 1 review (B78) called this HIGH-confidence: "the cycle break deserves a deliberate batch, not a side-effect of a directory move." Kyle's no-deferrals directive 2026-05-07 says: address now, not later.

## §2. Numbered objectives

1. **`server/services/kraken-websocket-adapter.ts` becomes leaf.** No imports of `live-pricing-adapter`. Cycle is broken on that side.
2. **`livePricingAdapter.updateFromWebSocket(...)` → emit `priceTick` event.** 4 call sites in ws-adapter (L569, L708, L841, plus broadcast site at L874 indirectly). The event payload is `{symbol: string, price: number, source: 'kraken_ws', traceId?: string, bid?: number, ask?: number, midpoint?: number}` — pass through whatever `updateFromWebSocket` already accepts.
3. **`livePricingAdapter.getTradingMode()` → injected getter callback.** ws-adapter exposes `bindTradingModeGetter(getter: () => 'paper' | 'live')`. Default behavior if no getter bound: `'paper'` (safe default — all today's live-trading is gated downstream of ws-adapter anyway).
4. **`live-pricing-adapter.ts` subscribes once at module-load.** Adds at the bottom of file (or at a designated init function): `krakenWebSocketAdapter.on('priceTick', livePricingAdapter.handleKrakenWsTick.bind(livePricingAdapter))` and `krakenWebSocketAdapter.bindTradingModeGetter(() => livePricingAdapter.currentTradingMode)`. The `handleKrakenWsTick` method is the renamed body of `updateFromWebSocket` — no behavioral change.
5. **`incrementRestFallbackBlocked()` and `incrementRestFallbackAllowed()` calls in `live-pricing-adapter.ts` (L449/L454) STAY** — they are calls FROM live-pricing TO ws-adapter, which is the kept direction post-cycle-break. No change needed there.
6. **ws-adapter MOVES to `server/exchanges/kraken/kraken-websocket-adapter.ts`** AFTER the cycle is broken, in the same commit. Internal imports re-pathed (e.g. `./context-bridge.js` → `../../services/context-bridge.js`; `./live-pricing-adapter.js` → REMOVED entirely; `../exchanges/kraken/kraken-pair-metadata-service.js` → `./kraken-pair-metadata-service.js` since both intra-package post-move).
7. **All callers of `kraken-websocket-adapter` updated to new path.** Pre-flight grep used B78 broader pattern: `from\s+['"](\\.\\.?/)+kraken-websocket-adapter`. Estimate: 5-10 caller files. Updated explicitly; re-export shim at old path is OPTIONAL safety net.
8. **Madge HARD GATE:** post-move cycle count must DROP from 47 (since cycles #10, #11, #12 all routed through ws-adapter). Acceptance criterion: ≤ 47 cycles AND cycle #10 absent from list. Save updated baseline at `Claude Comms and Packages/Change Lists/BATCH_78_1_MADGE_BASELINE.txt`.
9. **No-touch fence holds.** Pre-flight + post-deploy SQL on `asset_class='crypto_spot'` ablation cadence. Baseline post-B78 recovery: 24-29 rows/factor/hr. Acceptance: stays in 20-35 range post-B78.1.
10. **Behavioral verify (THIS IS DATA-FEED SURGERY — required, not optional):**
    - PM2 log side-by-side diff against pre-deploy baseline (~10 min window). Tick counts per pair must match within ±20% tolerance (price-tick rate is high, exact match unrealistic; magnitude check is the bar).
    - VTS 30s scan loop continues without missed cycles.
    - `live_prices:<symbol>` cache freshness ≤ 5s for top 10 pairs (no new staleness regression).
    - WebSocket broadcasts to clients still labeled with correct `mode: 'paper'|'live'` payload.
    - HTTP endpoint smoke: `/api/prices/<symbol>` returns within 200ms.
11. **Governance updates landed:** SIM (ws-adapter path moved), CHANGES_AND_FIXES, BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES (close any tracking; #73 + #74 from B78 stay open per their own timelines), plan doc §12 update-log row, all 3 MEMORY copies + Langston MEMORY sync per CLAUDE.md §2 Step 10.b.

## §3. Out of scope (explicit)

- **Friction extraction** — B79 Day 0 owns it.
- **Filter-as-first-class** — B81 Day 0 owns it.
- **Generalizing event-emitter pattern to other adapters** (Binance, etc.) — when those exchanges land.
- **Funding-rate WS feed** — B80 territory.
- **Active-trading order placement events** — Phase 19.
- **Removing the `incrementRestFallback*` cohesion smell** (counters in ws-adapter being incremented from live-pricing) — minor hygiene; not a cycle issue. Defer to a future hygiene batch.
- **Removing B78 re-export shims at old `services/kraken*` paths** — B81 Day 0 owns it (along with filter-as-first-class promotion which touches the same import surface).

## §4. Risk register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **EventEmitter listener leak** if subscriber registers multiple times (e.g. on hot-reload) → tick callback runs N times | medium | Subscription is registered ONCE at module-load (singleton import side-effect). Documented invariant in code comment. `removeAllListeners('priceTick')` defensive in `live-pricing-adapter` init if needed. |
| 2 | **Subscription order race** — if live-pricing subscribes BEFORE ws-adapter is initialized, no events flow | medium | ws-adapter initializes synchronously at import time (existing behavior); live-pricing import in `index.ts` startup chain comes AFTER ws-adapter is referenced, ensuring correct order. **Verify**: trace import order in `index.ts`. |
| 3 | **Behavioral drift in error paths** — today errors propagate through direct method-call chain; with events, errors in subscribers don't bubble back to ws-adapter | low | Subscriber wraps callback in try/catch + logs; ws-adapter doesn't depend on subscriber success (fire-and-forget). Already mostly the case (updateFromWebSocket calls don't propagate errors today; await is omitted). |
| 4 | **`getTradingMode` getter not bound** before first ws price tick → broadcast labels with default 'paper' incorrectly | low | Default to 'paper' is the SAFE default (today the system runs in paper mode anyway; live-trading enablement is Phase 19). If live-mode is enabled before the getter binds, broadcast payload is mislabeled briefly — annoying but not data-corrupting. **Mitigation**: bind the getter EARLY in `live-pricing-adapter.ts` module init, before any ws subscription handshake (ws subscriptions don't fire until handshake completes). |
| 5 | **Madge cycle count doesn't drop** — if other code somewhere creates a different ws-adapter ↔ * cycle | low | Pre-flight grep verified: only `live-pricing-adapter` imports ws-adapter today. Post-move, post-cycle-break: `madge --circular` is the gate. If cycle count doesn't drop, that's a finding to investigate before push. |
| 6 | **WS reconnection error path** — ws-adapter today might call live-pricing methods inside reconnect/error handlers (not in the 4 sites I grepped) | medium | Step-2 audit: full grep `livePricingAdapter\.` against the moved file post-move; any residual reference is a finding. |
| 7 | **Production data-feed regression invisible in CI** — CI runs against test fixtures, not real Kraken WS | HIGH (most consequential) | **Behavioral verify is the gate** (§2 obj 10). PM2 log side-by-side diff against pre-deploy baseline catches feed regressions. If tick rate drops materially or any pair stops streaming, halt + revert via `git revert` of the B78.1 commit. |

## §5. Files affected (preview)

**Modified (existing files):**
- `server/services/kraken-websocket-adapter.ts` — extends EventEmitter; replaces direct livePricingAdapter calls; adds bindTradingModeGetter; removes import of live-pricing-adapter. Then MOVED to `server/exchanges/kraken/kraken-websocket-adapter.ts`.
- `server/services/live-pricing-adapter.ts` — adds module-load subscription `krakenWebSocketAdapter.on('priceTick', ...)` + `bindTradingModeGetter(...)`. Renames `updateFromWebSocket` body to `handleKrakenWsTick` (or keeps name and just adds the subscription glue — minor stylistic call). Updates import path to ws-adapter's new location.
- 5-10 caller files: import path updates `from '...kraken-websocket-adapter.js'` → `from '...exchanges/kraken/kraken-websocket-adapter.js'`.

**Created (governance):**
- `Claude Comms and Packages/Scope Files/BATCH_78_1_SCOPE.md` (this file).
- `Claude Comms and Packages/Scope Files/BATCH_78_1_PRE_AUDIT.md` (Step 2).
- `Claude Comms and Packages/Change Lists/BATCH_78_1_MADGE_POSTMOVE.txt` (post-move cycle list, expected 44-46 cycles).
- `Claude Comms and Packages/Batch Completion/BATCH_78_1_COMPLETION_REPORT.md` (Step 11).

**Estimated diff stat:** ~10-15 file touches; ~80% are mechanical import-path edits or single-line callback registrations; ~20% is the substantive ws-adapter EventEmitter conversion.

## §6. Pre-flight no-touch fence (Step 0)

Captured 2026-05-07 ~01:00 UTC (post-B78 close, pre-B78.1):
```
factor_name                 | n_last_hour
b67_1_btc_dominance         | 29
b67_1_funding_rates         | 29
b67_1_mcap_momentum         | 29
b67_2_phase_preference      | 29
b67_4_outcome_feedback      | 29
b68_1_multi_tf_agreement    | 29
b68_2_volume_regime         | 29
b68_3_pair_correlation      | 29
b68_4_regime_age            | 29
b68_5_path_b_sustainability | 29
```

Healthy steady-state cadence post-B78. Repeat post-B78.1 deploy in Step 7 verification.

## §7. Verification (Step 7 + 8)

1. **HARD GATE: `madge --circular --extensions ts server/`** post-move. Cycle count must DROP (acceptance: ≤47, ideally 44-45 since #10/#11/#12 all routed through ws-adapter); cycle #10 must be ABSENT from list.
2. `npm run build` clean locally before push.
3. CI: TS Check + Test + Build + Docker all pass per Kyle directive (Build+Docker+Test green = clear to deploy; legacy TS Check baseline acceptable).
4. **Behavioral verify post-deploy** (data-feed surgery — required):
   - PM2 logs side-by-side diff against pre-deploy 10-min window. Tick counts per pair within ±20%.
   - VTS 30s scan loop confirms no missed cycles (look for `[VTS-RUNNER]` cycle logs every 30s).
   - HTTP endpoint smoke: `/api/prices/BTC%2FUSD` returns ≤200ms with fresh price.
   - WebSocket client smoke: connect to staging WS, subscribe, observe `price_updated` events with `mode` field labeled correctly.
   - No-touch fence post-deploy SQL on crypto_spot ablation cadence.
5. Visual UI smoke (Claude-in-Chrome): VTS dashboard live prices update; no stale-price banners.
6. **Langston Step-8 second-pass on the diff** + behavioral evidence — verifies the cycle is genuinely broken AND data-feed flow is intact.

## §8. Langston work delegation (per CLAUDE.md §6.7 + Kyle directive 2026-05-06)

| Task | When | Verification by CC |
|---|---|---|
| **Import-graph dep walk** on the proposed move list — confirm no other cycles intersect | Step 2 | I run `madge --circular` post-move; cross-check his findings. |
| **Step-1+2 scope review** | combined | standard. |
| **Step-4 diff review** — focus on: (a) is the EventEmitter inversion correct, (b) is the bindTradingModeGetter pattern sound, (c) any error-path drift, (d) listener-leak protection | Post-implementation | I show him diff at /tmp/. |
| **Step-8 behavioral verify** — independent inspection of PM2 log baselines | Post-deploy | Standard. |

## §9. Governance update list (Step 10)

Tier 1:
- `1-system-manual/BATCH_CATALOG.md` — B78.1 entry above B78.
- `1-system-manual/PHASE_HISTORY.md` — Phase 15c continuation row for B78.1.
- `Claude Comms and Packages/Scope Files/BATCH_78_1_SCOPE.md` (this).
- `Claude Comms and Packages/Batch Completion/BATCH_78_1_COMPLETION_REPORT.md`.
- All 3 MEMORY.md copies + Langston MEMORY sync (CLAUDE.md §2 Step 10.b).

Tier 2 (mandatory for B78.1):
- `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — §12 update-log row recording B78.1 ship + cycle count delta + behavioral-verify outcome.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — ws-adapter path updated; cycle break documented.
- `1-system-manual/SYSTEM_MANUAL.md` — Modularization Phase appendix updated to remove the "what B78 did NOT change" bullet about ws-adapter (it's now done).
- `1-system-manual/CHANGES_AND_FIXES.md` — INFRA-2026-05-07-C entry.
- `1-system-manual/RUNNING_ISSUES.md` — no new issues expected; verify #73/#74 from B78 still appropriately tracked.

## §10. Open questions for Langston Step 1 review

1. **bindTradingModeGetter vs always emit tradingMode in priceTick payload** — alternative design: skip the getter callback, instead include `tradingMode` directly in each priceTick event payload. Pro: no second binding API. Con: live-pricing has to ALSO subscribe to its own modeChange event to know the current mode (which it does already), and the priceTick payload grows by one field. Lean: the getter pattern is leaner, but symmetry argument for events-only is reasonable. Your call.
2. **Re-export shim at old `services/kraken-websocket-adapter.ts` path?** — B78 set the precedent of "no shim, callers updated, CI gate." Same precedent here. But ws-adapter is a singleton object referenced by `import { krakenWebSocketAdapter }` across many consumers — risk of CI miss is higher. Suggest a shim for the one-batch grace; remove in B81 alongside the other B78 shims. Confirm?
3. **Behavioral verify acceptance threshold** — I picked ±20% on tick counts. Is that the right tolerance for data-feed regression? Lower (±10%) might catch real regressions earlier; higher (±30%) reduces false alarm noise from natural market variance. Your read?
4. **Should B78.1 include a metric/log for "priceTick events emitted per minute" to make future regressions easier to spot?** — Tiny addition, ~5 lines. Lean YES. Confirm?

---

*End of BATCH_78_1_SCOPE.md rev 1. Pending Langston Step 1+2 combined review.*
