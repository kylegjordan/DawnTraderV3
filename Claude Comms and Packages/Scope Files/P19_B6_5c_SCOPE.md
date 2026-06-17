# P19-B6.5c — SCOPE: crypto signal → ready-to-buy REPAIR

> **Batch id:** `P19-B6.5c` (own repair sub-batch; full 11-step). **Phase:** 19. **Predecessor:** B6.5b (CLOSED on its own scope — gate + F1–F5, dry-run-proven deploy-clean). **Gate-10 (≥1 FULL closed crypto lifecycle) is BLOCKED on this batch.** B7b stays HARD-GATED on B6.5-green.
>
> 🚨 **THIS BATCH *DOES* MAKE THE CAPABILITY FUNCTIONAL.** It is the repair that lets a crypto active-paper signal actually reach the ready-to-buy queue (today: ZERO do). It is NOT scaffolding. After this batch + a green gate-10 re-run, the front-to-RTB path is functional in paper mode (still dormant by the per-class gate until B7b turns it on).
>
> **Author:** Claude New (CC-B). **Status:** Step-1 DRAFT for Langston ACK + design rulings D1–D5. **Grounding:** this scope was written from a direct read of the SSOT (`canonical-regime-strategy-map.ts`), `pattern-recognizer.ts`, the two orchestrator call sites, `SYSTEM_IMPACT_MAP.md`, `SYSTEM_MANUAL.md` Ch.2/Ch.5, the find-everywhere strategy-name sweep, and the **live staging DB** (rtb_signals schema + strategy_type enum) — per Kyle's directive 2026-06-17 to scope this thoroughly and NOT assume system knowledge.

---

## 0. PREVIOUSLY-STATED-VS-NOW (mandatory deltas — §9.2)

- **PREVIOUSLY STATED (B6.5c design ask, Q-B/Q-C):** fix Break #2 by extending `LEGACY_TO_CANONICAL` with `pattern_*→canonical` aliases (e.g. `pattern_abcd→abcd_long`) + apply `normalizeStrategy` at the source; orphan-3 (pinbar/engulfing/three_soldiers) possibly added as **new canonical strategies (19→22)**. **NOW:** that approach was itself the pattern-vs-strategy conflation Kyle flagged and is **withdrawn**. Patterns are NOT strategies and we do NOT invent strategies. The correct fix uses the **existing** regime-aware resolver `selectContextAwareStrategy()`. **REASON:** `abcd_long` is a QUANT strategy (patternType `null`); the ABCD *pattern* actually feeds `volatility_edge` (HYBRID, in IMPULSE_EXPANSION) — a flat `pattern_abcd→abcd_long` alias would mis-attribute. Pattern→strategy is **regime-dependent** (e.g. PINBAR → `reverse_impulse` in HVU, `support_bounce` in RBS), so no flat alias is correct.
- **PREVIOUSLY STATED (design ask):** Break #2 blast radius = the RTB dedup/insert (8,503 drops). **NOW:** the `pattern_*` value also flows downstream to **`paper_sim_trades.strategy_name`** (paper-execution-engine) and **`trades.strategy`** (trade-executor, live/Phase-21) — both `strategy_type` enum columns that would ALSO reject. **REASON:** find-everywhere sweep traced the full flow; a fix only at the RTB insert would relocate the failure downstream — confirming the fix must be at the **source**.
- **NEW (not in the design ask):** the B6.5b dry-run also fired a **critical active-trading alert** — `A/EUR@kraken` could not be classified to an asset class and was safe-skipped (the B4a classify-hardening escalation hook working as designed). This is a **third** dry-run finding; its root cause + home are scoped here (Objective 4 / D5).

---

## 1. Background — what the B6.5b dry-run proved

The B6.5b dry-run turned crypto active-paper ON for the first time since Phase 8, then reverted. It **proved the front half is healthy**: the scanner finds eligible crypto coins → builds candidate signals → the pools populate → the signal orchestrator evaluates regime + strategies → SQE scores — all fire for crypto with no crash, and the B3b landmine-2 fix holds (signals are no longer silently swallowed before the queue). The break is **entirely at the ready-to-buy insert**: ZERO signals reached the queue; ~25k were dropped at the DB write across two distinct root causes, neither of which is B6.5b's own F1–F5 code (no `RTB_GATE_REJECT` in the logs — verified). B6.5c is the repair those findings demand.

---

## 2. Architectural grounding (verified — patterns are NOT strategies)

This section is the corrected mental model, confirmed against the SSOT and the System Manual (which states verbatim: *"Pattern recognition is the detection service … the pattern strategies are specific trading strategies that USE pattern detection"* — patterns are TRIGGERS, not strategies).

- **The 19 canonical strategies** are fixed (`STRATEGY_DISPLAY_NAMES` / `STRATEGIES` const in `canonical-regime-strategy-map.ts`). We do not add to them.
- **The 6 detected patterns** (`pattern-recognizer.ts`: PINBAR, ENGULFING, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR, ABCD) normalize to canonical pattern *types* via `normalizePatternToCanonical()` (`PATTERN_TO_CANONICAL`): e.g. THREE_SOLDIERS→MORNING_STAR, HAMMER/SHOOTING_STAR→PINBAR, DOJI→TRI_STAR.
- **Each strategy declares the pattern it consumes** via its `patternType` field in the regime map. QUANT strategies have `patternType: null`. A pattern feeds a strategy only where a PATTERN/HYBRID strategy in that regime declares the matching `patternType`.
- **The tie is regime-dependent and class-scoped.** `selectContextAwareStrategy(regime, detectedPattern, symbolHash, assetClass)` already encodes it: it reads the per-class materialized regime tree, normalizes the pattern, and returns the consuming canonical strategy. Examples (crypto_spot):
  - PINBAR → `reverse_impulse` (HVU) / `support_bounce` (RBS)
  - ENGULFING → `defensive_hedge` (HVU)
  - INSIDE_BAR → `inside_bar_reversal` (HVU)
  - MORNING_STAR (incl. THREE_SOLDIERS) → `morning_star` (TFS, ST)
  - ABCD → `volatility_edge` (IE)
  - TRI_STAR → `adaptive_flow` (RBS)
- **VTS already does this correctly** — `vts-runner.ts:1050` calls `selectContextAwareStrategy`. The xStock eval-cycle does too. **Only the crypto active orchestrator's pattern path is wrong** — it fabricates `pattern_*` instead of resolving the consuming strategy.

---

## 3. Break #1 — leftover NOT-NULL `cwqi` column (DB drift; dominant, ALL strategies)

**Symptom (dry-run):** `null value in column "cwqi" of relation "rtb_signals" violates not-null constraint` — 16,930 drops, every strategy including pure-quant `breakout`.

**Confirmed root cause (live staging DB, this batch):** `rtb_signals.cwqi` exists on staging — `data_type=numeric, is_nullable=NO, column_default=null`. The code removed `cwqi` from the schema (`shared/schema.ts` has no `cwqi`; `legacy/metrics_archive.ts` documents *"cwqi: Removed from rtb_signals table"*), so the Drizzle insert no longer sends it → every row violates the NOT-NULL constraint. I verified `cwqi` is the **only** drifted column of the 10 NOT-NULL-no-default columns on `rtb_signals` (the other 9 — mode, signal_id, symbol, strategy, entry_price, stop_price, confidence, risk_score, expected_return — are all genuinely populated by `upsertRtbSignal`). Code-side, `cwqi` appears ONLY in `legacy/metrics_archive.ts` (archival constants/comments) and unit tests that assert its removal — nothing writes or reads it.

**Fix:** a schema-drift migration `ALTER TABLE rtb_signals DROP COLUMN cwqi;` written as a proper migration (so the drift reconciles on any box, not just staging), with a tested rollback, MANIFEST registration, and a `DELETED_COMPONENTS_LOG.md` entry (rule 18). → **Decision D1.**

---

## 4. Break #2 — pattern recognizer fabricates non-canonical `pattern_*` strategy names

**Symptom (dry-run):** `invalid input value for enum strategy_type: "pattern_abcd"` — 8,503 drops, pattern-pool only (also `pattern_pinbar / pattern_inside_bar / pattern_morning_star / pattern_engulfing / pattern_three_soldiers`).

**Confirmed root cause:** `pattern-recognizer.ts:586` (`patternToTradeSignal`) sets `strategy: \`pattern_${pattern.pattern.toLowerCase()}\``. These strings are not in the `strategy_type` enum. P19-B3b cast the value past the TypeScript union at the orchestrator (`signal-orchestrator.ts:1538`) — *"not a silencing cast"* per its comment — but **never canonicalized the runtime value**, so the DB rejects it. Both orchestrator call sites are affected:
- **Site 1** (`signal-orchestrator.ts:1527`, pattern-pool eval): has `context` from MCE (regime in scope); builds `strategy: (tradeSignal.strategy || patternSig.pattern)` = `pattern_*`.
- **Site 2** (`signal-orchestrator.ts:2049`, `evaluateMarket` pattern loop): builds `strategy: tradeSignal.strategy` = `pattern_*`, and additionally **sizes it under the wrong strategy** — `buildSizedSignalForStrategy(..., 'breakout', ...)` at line 2068 (sizing as `breakout` while labeling `pattern_*`).

**Blast radius (find-everywhere sweep):** the same `pattern_*` value, if it got past RTB, also reaches `paper_sim_trades.strategy_name` (`paper-execution-engine.ts:2301`) and `trades.strategy` (`trade-executor.ts`) — both enum columns — and silently mis-buckets the plain-varchar `trading_signals.strategy` + every per-strategy stats/aggregation reader (which key on canonical names). Hence: fix at the source.

**Fix (corrected):** resolve the detected pattern to its consuming **canonical** strategy via the existing `selectContextAwareStrategy(regime, patternSig.pattern, symbolHash, 'crypto_spot')`, so a real canonical strategy key flows everywhere; remove the `pattern_*` fabrication and the now-unneeded union casts; fix the site-2 `'breakout'` sizing mismatch. → **Decisions D2, D3, D4.**

---

## 5. Break #3 — `A/EUR@kraken` classify fall-through → **OWNED BY B6.5d (Claude Old), NOT this batch**

**Symptom (dry-run, critical active alert 58367b27, still active/unacked by design):** *"A symbol could not be classified to an asset class on the active path: A/EUR@kraken. The signal/operation was skipped."* This is the B4a classify-hardening escalation hook (C4) firing as designed: `resolveAssetClass` returned null → safe-skipped → critical alert.

**RESOLVED — homed to B6.5d.** While CC-B was compacting, Claude Old (CC-A) + Langston converged a design and branched this into its own batch **B6.5d**: widen the crypto resolver pattern to admit single-letter / unrecognized-but-well-formed Kraken bases (A/EUR is a REAL Kraken pair — Vaulta, ex-EOS — so it should classify as crypto BY INFERENCE, per Langston's NO-PATCHES read: fix the classification LOGIC, do not seed `A` into an allowlist) + a per-pair dedupe_key (the current generic `classify-fallthrough-active` key would silently suppress the NEXT missing symbol) + a quality-evaluator stamp-swap. B6.5d edits `shared/asset-classes.ts`, `server/index.ts`, `server/core/filters/signal_quality_evaluator.ts` (+test) — **disjoint from B6.5c's files** (confirmed file-boundary handshake with Claude Old). The broader structural fix ("every step trusts the stamped asset class" + xStock symmetry) is the named batch **B6.5e**, gated before B7b. **B6.5c drops this entirely;** the alert stays active until B6.5d lands (neither CC nor Langston acks it).

---

## 6. Numbered objectives + verification criteria

1. **Drop the drifted `cwqi` column.** *Verify:* migration applied on staging; `information_schema` shows `cwqi` gone from `rtb_signals`; rollback script tested; MANIFEST + DELETED_COMPONENTS_LOG updated. Post-deploy, ZERO `cwqi … not-null` errors in the log during the gate-10 re-run.
2. **Crypto pattern signals carry a canonical strategy name.** *Verify:* the orchestrator's pattern path emits one of the 19 canonical keys (resolved by regime+class), never `pattern_*`; the union casts at 1538/2054 removed; tsc clean without them. Unit tests prove the regime-dependent resolution (PINBAR→reverse_impulse in HVU / support_bounce in RBS; ABCD→volatility_edge in IE; etc.) and the no-match behavior (D3).
3. **Site-2 sizing corrected.** *Verify:* the pattern signal is sized under its resolved canonical strategy (not hardcoded `'breakout'`); no `pattern_*` reaches `buildSizedSignalForStrategy`, `paper_sim_trades`, or `trades`.
4. **(MOVED to B6.5d — not a B6.5c objective.)** The A/EUR classify fall-through is owned by Claude Old's B6.5d (see §5). B6.5c does not address it; its alert stays active until B6.5d lands.
5. **Gate-10: ≥1 FULL closed crypto lifecycle.** *Verify:* a reverted crypto-only dry-run shows a signal go open → exit → close → cooldown → telemetry, with fill-path parity (depth-walk VWAP, crypto_spot fees), xStock isolation (zero xStock opens, witness=0), and the F3 cooldown observed blocking a re-entry. Then revert (both modes dormant, `active_asset_classes={}`).
6. **Governance complete for BOTH B6.5b and B6.5c.** *Verify:* BATCH_CATALOG + PHASE_HISTORY + PHASE_19_PLAN + RUNNING_ISSUES + completion report(s); SIM content update (it is currently **silent** on the cwqi/rtb_signals schema, the pattern→strategy routing contract, and still says "17 strategies" — close all three) + System Manual content update (also carries a stale "17 Strategies" heading — fix to 19); 3-way MEMORY sync; CI all-4-green cited.

---

## 7. Design decisions for Langston (need rulings D1–D5)

**D1 — cwqi disposition.** Agree: DROP COLUMN via migration (+ tested rollback + MANIFEST + DELETED_COMPONENTS_LOG), not "make it nullable"? (CC lean: DROP — code already removed it; nullable would leave dead drift. This matches your Q-A lean.)

**D2 — fix LOCATION for pattern→canonical.** Two options:
- **(a) At the orchestrator (CC lean).** Resolve the canonical strategy at the two call sites via `selectContextAwareStrategy(regime, patternSig.pattern, hash, 'crypto_spot')` and use it as the signal's strategy + sizing key. Keeps `pattern-recognizer.ts` (Directive 10.2 LOCKED) untouched; puts canonicalization where the regime context already lives. Requires deciding what `patternToTradeSignal`'s own `strategy` field becomes (CC lean: stop emitting `strategy` from it — return geometry/confidence only — so the fabricated `pattern_*` is removed at root, not overridden downstream).
- **(b) Inside `patternToTradeSignal`.** Thread `regime` (+ `symbolHash`) into it and call `selectContextAwareStrategy` there. More centralized, but edits a LOCKED file and adds a new import into the recognizer. VTS does NOT call `patternToTradeSignal` (it uses `selectContextAwareStrategy` directly), so "fix at source for VTS too" is already satisfied either way.

Which do you prefer? (CC lean: **(a)** — keeps the LOCKED recognizer pure and removes the `pattern_*` fabrication at its origin by having the recognizer not assert a strategy at all.)

**D3 — no-match behavior (THE wrinkle).** When a detected pattern has no PATTERN/HYBRID strategy with the matching `patternType` in the current regime+class, `selectContextAwareStrategy` today falls back: hybrid_fallback → pattern_fallback → diversity → primary. That can attribute the pattern to a strategy that did NOT consume it (stats pollution; conflicts with your Q-C "never map-to-nearest-canonical"). Options:
- **(a) exact-match-or-drop (CC lean).** Emit the pattern signal ONLY under the strategy whose `patternType` matches the detected canonical pattern in this regime+class; if none, DROP it with an observable counter. The QUANT path independently evaluates the regime's quant strategies, so nothing is lost, and per-strategy NetEV/stats stay clean. Matches Kyle's "patterns feed THEIR strategies" model exactly.
- **(b) keep the existing fallback chain** (confluence intent: "the pattern adds confluence to the regime's hybrid").

Which? (CC strong lean: **(a)**, with a drop counter — cleanest for stats integrity and aligns with your Q-C.)

**D4 — the separate pattern loop vs. the activeStrategies dispatch.** The orchestrator already evaluates HYBRID/PATTERN strategies in its `activeStrategies` dispatch via the strategy-engine `detect*()` + `buildPatternInputForStrategy(...)` (e.g. `detectVolatilityEdge`, `detectAdaptiveFlow`). The separate `patternToTradeSignal` loop (sites 1 & 2) emits a *second*, raw PATTERN signal. Is that loop intended to coexist (raw pattern signal alongside the strategy-evaluated one), or is it redundant emission that B3b accidentally left producing `pattern_*`? Pre-audit will map this precisely; I want your read on whether the right end-state is "canonicalize the loop's output" (D2/D3) or "the loop is redundant and should be removed" (rule 18). (CC lean: confirm in pre-audit; default to canonicalize-the-output unless the pre-audit proves true redundancy.)

**D5 — RESOLVED (no ruling needed).** The A/EUR classify finding is owned by Claude Old's **B6.5d** (resolver-pattern widen + per-pair dedupe_key + quality-evaluator stamp-swap; files disjoint from B6.5c — confirmed file-boundary handshake). Broader structural fix = **B6.5e** (gated before B7b). B6.5c drops it.

---

## 8. Sequencing & gate

B6.5b stays CLOSED on its own scope. B6.5c is the repair; **gate-10 re-runs the dry-run after B6.5c lands**. B7b remains HARD-GATED on B6.5-green (PHASE_19_PLAN §1 + §6 gate 10). Full 11-step: this scope → Langston ACK + D1–D5 → pre-audit (Step 2) → implement (Step 3) → Step-4 diff → CI → deploy → gate-10 dry-run → Step-8 → governance (both B6.5b + B6.5c) → close → then the two items still owed to Kyle (B6.5b findings summary + the paper-kill 50%-vs-20%-cap surface).

*— Claude New (CC-B), Step-1 draft. On ACK + rulings → Step-2 pre-audit.*
