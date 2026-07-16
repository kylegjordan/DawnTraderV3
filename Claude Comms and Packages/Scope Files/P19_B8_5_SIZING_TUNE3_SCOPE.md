# P19-B8.5 sizing tune-3 — Kyle's exposure/slot spec (CC-A executing; CC-B on the xStock leg)

(This is a config-only TUNE within the open P19-B8.5 batch — it deliberately carries NO parseable class marker. The batch's authoritative declaration lives in P19_B8_5_SWITCH_ON_SCOPE.md [architecture]; this file sorting lexicographically first made the checker read the tune's header as the BATCH's class and fire gov-underdeclared:P19-B8.5 — de-collided 2026-07-16. The tune itself is non-architecture in nature: guardrail/constant values + an anchor mint through existing governed machinery.)

**Kyle directive (2026-07-16, verbatim intent):** portfolio exposure = 100% (100% of portfolio value can trade); each individual trade capped at 6.67%; paper anchor balance = $2,250 → 15 slots × ~$150 each.

## Root cause (measured — why tune-1/tune-2 never produced $150)
The active sizing formula (`active-position-sizing.ts:191-192`) is:
`maxNotional = portfolioValue × (maxTotalExposurePct/100) × (maxPositionPercentPct/100)`, and quantity is CLAMPED to `maxNotional × buffer(0.97)` (`active_sizing.max_position_buffer_factor`).
Live paper guardrails today: **maxTotalExposurePct=45, maxPositionPercentPct=20**, portfolioValue≈$2,394 → clamp = 2394 × 0.45 × 0.20 × 0.97 = **$209.0** — the exact uniform entry notional measured on ALL 13 open + recent closed positions (range $208.93–$209.52). Every trade's risk-based size exceeds the clamp, so ALL trades pin at the clamp; the tune-1/tune-2 **risk%** changes (3.00→2.70→1.95) were the wrong lever — risk% never binds. Also: 13 × $209 = $2,717 notional exceeds the $2,400 anchor (the "exposure budget" is only used to derive the per-trade clamp; total exposure is bounded by slots × clamp), which is the over-allocation Kyle spotted.

## Objectives
1. **OBJ-1 — guardrails (paper mode only):** `maxTotalExposurePct` 45 → **100**; `maxPositionPercentPct` 20 → **6.67**. Through the governed guardrails path (same route the B8.5 12→20 amendment used); live-mode rows untouched.
2. **OBJ-2 — anchor:** re-anchor the paper balance $2,400 → **$2,250** via the `measurement_override` sole-writer path (PAPER-ONLY + NOTE-REQUIRED rails, `b8-5-measurement-override.ts` pattern; note cites this scope + Kyle's 2026-07-16 directive).
3. **OBJ-3 — proof:** new opens after deploy pin at the new clamp. **Disclosed arithmetic:** 2250 × 1.00 × 0.0667 = $150.08 cap; × 0.97 buffer = **~$145.58 actual** — 15 slots × $145.58 = $2,184 = 97% of $2,250 (the buffer's intent: never fully drain). If Kyle wants exact-$150 fills, the alternative is maxPositionPercentPct=6.88 (buffered → $150.0); DEFAULT = implement Kyle's literal 6.67 and disclose.
4. **OBJ-4 — §9.3 UI verification (Kyle directive 2026-07-16, now mandatory for UI-visible changes):** navigate the staging paper page; confirm the strip shows the $2,250 anchor and new trades open at ~$146; screenshot-verify.

## Verification criteria
- Guardrail rows show 100 / 6.67 (paper) in the DB; live rows byte-identical.
- portfolio_anchor_events has the new measurement_override row ($2,250, note present).
- First post-deploy opens: entry notional ~$145.6 (±$1), NOT $209.
- Existing 13 open positions are NOT resized (they close on their own lifecycle — no retroactive mutation).
- UI: paper page strip + (once the Open Trades crash is fixed) the table render the new sizing.

## Blast radius
Config-only through existing governed machinery; no code/formula change. Consumers: the sizing clamp (all future paper opens), the exposure display. VTS untouched (mode-scoped guardrails). Existing open positions untouched. #436 caveat (throwing upsertGuardrails trio) — apply via the non-throwing route the B8.5 amendment used; verify post-write.
