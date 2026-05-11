# B79.0m.b2 — Scope + Pre-Audit Review (rev1)

> **From:** Claude Code
> **To:** Langston
> **Workflow step:** Step 1 (Scope) + Step 2 (Pre-Audit) combined review
> **Created:** 2026-05-11
> **Source docs (committed):**
> - `Claude Comms and Packages/Scope Files/BATCH_79_0m_b2_SCOPE.md`
> - `Claude Comms and Packages/Scope Files/BATCH_79_0m_b2_PRE_AUDIT.md`
> **Required reading via your GDrive mount before reply.**

---

## TL;DR — what changed since B79.0m.b shipped

PM2 #221 wired the Layer-1 xstock pipeline (`38d19b559`). It runs but **no trades open**: 0 rows in `vts_open_trades WHERE asset_class='xstock_spot'` 24h post-ship. Root cause = the pipeline is still architecturally divergent from crypto in two places:

1. **Pattern path is missing entirely.** No `vts_pattern`/`active_pattern` rows for `xstock_spot` in `screener_filters` (vs 4 rows for `crypto_spot`). No parallel pattern-global-filter + pattern-IMF gate in `eval-cycle.ts`. Pattern strategies (`morning_star`, `inside_bar_reversal`, `pivot_shift`) currently invoke from inside the quant loop without their own routing — they fire as quant-tagged events, not pattern-tagged.
2. **Family fan-out is gate-filtering, not fan-out.** Each pair is iterated once with a family-eligibility gate. Crypto produces one VTS-batch entry per family the pair qualified for (`fx5-scanner.ts:1607-1643`); xstock produces one entry per pair.

Kyle's directive yesterday + reiterated today: **lock the architecture to crypto-mirror.** No more "should we...?" questions; copy-paste the shape, swap in DB-resolved values.

---

## Three additional findings surfaced during this batch's audit

### Finding 1 — Strategy count: it's 10, not 7

The xStocks UI tab `BY STRATEGY` table showed 7. DB authoritative count is 10 enabled (`module_constants.strategy_gates` where `asset_class='xstock_spot'` AND `enabled=true`):

```
breakout, inside_bar_reversal, mean_reversion, morning_star, orb,
pivot_shift, range_trade, sma_trend_ride, vwap_bounce, vwap_pullback
```

UI was showing only invoked strategies. 3 missing from UI (`breakout`, `sma_trend_ride`, `vwap_bounce`) hadn't fired against the regimes the xstock pairs were classified into. UI fix is in Section B of the handoff and out of scope here.

### Finding 2 — ORB violates LONG-only invariant

[`server/strategies/orb.ts:254-264`](server/strategies/orb.ts:254) has an unconditional `else { direction = 'SELL' }` branch on down-break. Other LONG-only strategies (`inside_bar_reversal`, `morning_star`, `pivot_shift`) gate at detect; ORB does not. Once the pattern path lets more regime/pair combos hit ORB in xstock, SHORT trades will leak.

Bundled fix into this batch: replace down-break branch with `setNullReason('sell_disabled_long_only'); return null;` mirroring `inside-bar-reversal.ts:131-134`. Crypto impact = zero (ORB never produced an admitted signal on crypto in the last 7d archive; verified pre-deploy).

### Finding 3 — ORB has no `STRATEGY_FAMILY_MAP` entry

ORB therefore bypasses the family-eligibility gate entirely. Adding `orb: 'breakout'` per its `signalType='QUANT'` + Opening-Range-Breakout semantics. This routes ORB through the breakout family lane (alongside `breakout`, `vwap_bounce`). Crypto regression risk acknowledged in pre-audit §0.3 and mitigated by pre/post-deploy SQL.

---

## Locked scope (5 objectives) — please review the full scope doc

1. **Pattern path** — 2 new `screener_filters` rows (paper + live, cloned from crypto), 2 `module_constants.pattern_pool_gates.xstock_spot.*` rows (`final_score_floor=0.45`, `max_position_pct=0.50`), new `pattern-filter.ts` module, refactor `eval-cycle.ts` to run pattern global + pattern IMF in parallel with the quant chain. Pattern survivors tagged `sourcePool='pattern'`. Pattern strategies fire ONLY on the pattern lane (eligibility via `STRATEGY_FAMILY_MAP[strategy] === 'pattern'`).
2. **Family fan-out** — one iteration per qualifying family. A pair passing 3 family IMFs produces 3 entries (`xstock-trend`, `xstock-reversal`, etc.) plus 1 more if pattern path also admits. Mirrors `taggedVtsSurvivors` in `fx5-scanner.ts`.
3. **ORB LONG-only + family-map entry** — described above.
4. **B73 replay asset-class branch** — `fetchOhlcForReplay` in `exit-strategy-replay-service.ts` currently hits `ohlcCache.getOHLCData` (Kraken crypto REST). Branch to query `xstock_spot_ohlc_1m` for xstock symbols. Caller threads `assetClass` from trade row. Async fire-and-forget, off-latency-path.
5. **Schema-file drift fix** — production `screener_filters` unique index is `(mode, asset_class, filter_path)`; Drizzle schema declares `(mode, filterPath)`. Closing source-of-truth drift; no DB migration required.

**Explicitly out of scope** (deferred to subsequent sub-batches):
- xStocks UI tab fixes (Section B in handoff)
- Per-strategy threshold authoring for 9 non-ORB strategies (calibration territory)
- Family threshold recalibration (VN dominance at 31% of family-IMF rejections — Layer-3 evidence-driven)
- Regime classifier 4 remaining branches (RBS/IE/HVU/ST)
- B73 ablation panel for xstock_spot
- Asset-class log-tag refactor

---

## Three architectural questions (true ambiguities, code-resolution exhausted)

**Q-L1.** Pattern path + fan-out joint semantics: when a pair passes pattern IMF AND ≥1 family IMF, the plan emits `1 (pattern) + N (family lanes)` separate eval entries. Each entry runs its lane's eligible strategies. A pair appearing in BOTH a family lane AND the pattern lane produces duplicate rows in `signal_eval_archive` per crypto's `fx5-scanner.ts:1607-1643` behavior. **Confirm or flag.**

**Q-L2.** ORB family-map entry — committing to `orb: 'breakout'`. Alternative was `orb: 'pattern'` (since "Opening Range Breakout" could be considered an intraday formation). Read: ORB's `signalType='QUANT'` + range-breakout geometry argues for `breakout`; the `pattern` family is reserved for `scanPatterns()`-detected technical chart formations (Morning Star, Inside Bar, etc.). **Confirm or flag.**

**Q-L3.** B73 replay branching adds a per-closed-trade Drizzle query for xstock symbols to `xstock_spot_ohlc_1m` (potentially 10,080 rows × ~10 cols over 7d). The table is 13-partitioned. The replay is async fire-and-forget on close. **Concerns about the partition pruning / index coverage / async behavior at scale?** Per-day xstock close rate will be in the 1-10 range Layer 1, scaling to maybe 50-100 closes/day as the pipeline matures. Per-trade query cost should be bounded by `(symbol, interval_begin DESC)` index — confirm the index covers the partitioned table correctly.

---

## What I'm asking you to do

1. Read the full scope + pre-audit docs at the paths above.
2. Confirm or revise the architectural commitment (pattern path shape, fan-out semantics, ORB fixes).
3. Answer Q-L1 through Q-L3.
4. Surface any hidden-crypto-assumptions I missed in the §0 SIM audit (the workflow's Step 4 audit — I covered Q1-Q5 across the 6 components touched, but you've got historical context on edge cases I may not have surfaced).
5. Flag anything in scope or pre-audit you want changed before I write code.

**Reply file (verbatim back to Telegram per CLAUDE.md §6.5 Step 3):** save your reply to `Claude Comms and Packages/Langston Design Asks/B79_0m_b2_scope_review_rev1_reply.md` so the paper trail is preserved.

---

*End B79.0m.b2 scope + pre-audit review ask, rev1.*
