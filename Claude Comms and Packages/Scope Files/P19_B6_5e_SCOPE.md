# P19-B6.5e — TCL → paper-execution-engine OPEN-PATH silent-failure repair (OWNS gate-10)

> **Batch:** P19-B6.5e · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-18 · **Issue:** #325 (carry-ins #327, JC#4)
> **change-class: non_architecture** — repair + observability of an EXISTING (dormant-since-Phase-8) open path; no new engine/component. ⚠️ NOTE for Langston cross-check: OBJ-1 touches the paper-execution-engine open **control flow** (return contract) + the shared `rtb-metrics-service` invariant. If you judge that crosses into `architecture`, up-declare — I default `non_architecture` because the path + the invariant already exist; this batch makes the existing path honest, it does not add architecture.
> **Reviewer:** Langston — Step-1 PENDING.
> **Predecessor evidence:** `P19_B6_5b_5c_COMPLETION_REPORT.md §3` (the gate-10 dry-run that surfaced this) + `P19_B6_5_AUDIT.md §1` (H11 depth-warmth, H14 ATR-floor) + the Step-1.a architectural read embedded below.

---

## 0. The break, in one paragraph (evidence-grounded)

The B6.5c crypto-only dry-run (crypto_spot flipped ON in paper, reverted) proved the front half is healthy — a crypto signal scans, classifies, scores, queues, promotes, and **sizes correctly** (`AUD/USD inside_bar_reversal` sized $102.20, `success=true`, guardrails loaded, portfolio $878). Then **the open vanishes**: the system's own invariant monitor logs `[8.8.3-I3][INVARIANT_CHECK][MISMATCH] attempts=11, opened=0, blocked=0, reasonSum=0`, `paper_sim_trades` stays 0, and there is **no error, no block, no reason**. The open path has been dormant since the last active-paper run (end-Phase-8, ~2025-12-30) and has accreted ~6 months of change around it (B3b landmines, B4a stamp, B4b D5 isolation, **B4b.1 depth-walked fill + depth-sufficiency gate**). The repair is to make the open stage HONEST (no silent failure possible) and then root-cause + fix the one accreted step that actually blocks the crypto open.

## 1. Step-1.a architectural read — the open path + WHY it's silent (verified in code 2026-06-18)

**Call chain (confirmed):** `checkRtbPromotion` (paper-execution-engine.ts:1706, the TCL-driven promote loop) → per signal `executePromotedSignal` (:1827) → `processSignal` (:2693) → **`executeSimulatedTrade` (:1892)** → `checkGuardrailRisk` (:1957, which fires `rtbMetricsService.recordAttempt` at trade-safety.ts:674) → [post-guardrail open section] → `rtbMetricsService.recordOpen` (:2574).

**The accounting (rtb-metrics-service.ts):** `recordAttempt` (start of guardrail check) · `recordBlock` (each guardrail fail, in trade-safety) · `recordOpen` (only after the trade actually opens, paper-execution-engine:2574). The I3 invariant = `attemptsTotal === openedTotal + blockedTotal` (and `blockedTotal === Σ byReason`).

**WHY the failure is silent (the structural root cause):** because the attempt is recorded *inside* `checkGuardrailRisk`, `attempts=11` PROVES the flow reached :1957 and entered `executeSimulatedTrade`. `blocked=0` PROVES no *guardrail* blocked it (the 11 passed guardrails). So the break is one of the **post-guardrail early-exits**, every one of which is a bare `return;` (the method is `void`-returning) that records **neither** `recordOpen` **nor** `recordBlock`:

| # | Stage · line | Exit · log tag | Records a block? |
|---|---|---|---|
| a | Net-Expectancy gate reject · 2044 | `return` · `[11.8B][EV_BLOCK]` | ❌ no rtb-metrics block |
| b | quantity ≤ 0 · 2125 | `return` · `[8.8.3-F][RISK_REJECT]` | ❌ (ruled out — sizing succeeded $102.20) |
| c | unclassifiable open · 2133 / 2314 | `return` · `[OPEN_SKIP]`/`[TRADE_SKIP]` | ❌ (ruled out — B6.5d fixed crypto classify) |
| d | **depth-sufficiency gate block · 2142** | `return` · `[P19-B4b.1][DEPTH_GATE_BLOCK]` + `recordDepthGateBlock` | ❌ **own counter, NOT rtb-metrics** ← LEADING |
| e | fill rejected / non-filled / zero · 2155/2159/2173 | `return` · `[OPEN_FILL_*]` | ❌ no rtb-metrics block |
| f | duplicate-position guard · 2211 | `return` · `[DUP_GUARD_BLOCK]` | ❌ no rtb-metrics block |
| g | trade-insert throw · 2264 try → 2611 catch re-throws | throws → `executePromotedSignal` catch (:1879) → `{success:false}` | ❌ no rtb-metrics block |

And `executePromotedSignal` (:1827) compounds it: it detects success **indirectly** by counting `getPaperSimTradesBySymbol` before (:1836) vs after (:1866) — so ANY of (a)–(g) → "no new trade" → `{success:false, error:'No new trade created…'}` → the promote loop logs `⚠️ Failed to execute promoted signal` and `failedCount++`, touching **nothing** in rtb-metrics. **Net: the entire post-guardrail open stage is invisible to the I3 invariant.** That is the silent failure — not a missing log, a missing *accounting contract*.

**The leading functional suspect (d):** the depth-sufficiency gate + depth-walked fill are the NEWEST accretion (B4b.1, `b74526dc3`), post-dating the Phase-8 baseline. For crypto the gate reads the live Kraken WS mini-book via `krakenWebSocketAdapter.getBookForFill(symbol)` (depth-source.ts:42-45); if that symbol's book isn't subscribed/warm at open time it returns `null` → `assessWarmth` → `no_book` → gate blocks → silent skip. Audit H11 already flagged "crypto book-warmth at open-time is the one thing to watch." **The dry-run never greps the open-path tags** (it watched only the I3 invariant + `paper_sim_trades` count), which is exactly why the firing stage was never named — OBJ-1 makes it name itself.

## 2. Objectives

**OBJ-1 — Make the post-guardrail open stage OBSERVABLE so a silent open-failure is structurally impossible (the NO-PATCHES core).** Two coupled changes:
- **(1a) `executeSimulatedTrade` returns a typed outcome, not `void`.** `OpenOutcome = { opened: true; tradeId: string } | { opened: false; stage: OpenFailStage; reason: string }`. Every post-guardrail early-exit returns a labelled `{ opened:false, stage, reason }`. `executePromotedSignal` consumes the outcome DIRECTLY and DELETES the brittle trade-count-delta success inference (:1836/:1866).
- **(1b) Fold post-guardrail open-stage failures into the RTB metrics accounting** so the I3 invariant reconciles. **Recommended shape:** add a THIRD counter `openFailedTotal` + `openFailedByStage` to `rtb-metrics-service`, invariant becomes `attemptsTotal === openedTotal + blockedTotal + openFailedTotal` (keeps "blocked" semantically = *guardrail* block; "openFailed" = post-guardrail open-stage failure — honest, not overloaded). Update the I2/I3 log + `/api/diagnostics/rtb-metrics`. (Alternative Langston may prefer: record each as `recordBlock` with new reason codes. I lean new-counter for semantic cleanliness — **your call, JC-A**.) The existing `recordDepthGateBlock` per-class counter stays as the fine-grained breakdown.
- **Outcome:** after OBJ-1 the dry-run's I3 line reads e.g. `attempts=11, opened=0, blocked=0, openFailed=11 (DEPTH_GATE:11)` — self-diagnosing.

**OBJ-2 — Root-cause + repair the ACTUAL crypto open break (NO PATCHES).** Run the contained crypto-only dry-run (§3) with OBJ-1 instrumentation; read the now-reasoned `openFailedByStage` + the open-path tags to name the exact failing stage; fix the **structural** root cause. Leading hypothesis = stage (d) depth-gate `no_book`: the crypto WS book is not subscribed/warm for a just-promoted symbol at open time → the proper fix is to ensure the promoted symbol's Kraken WS book is subscribed + warm BEFORE the open attempt (a subscription-lifecycle fix via the existing `krakenWebSocketAdapter` public API — **NOT** a gate bypass, **NOT** an edit to the LOCKED `kraken.ts`). The fix is evidence-driven: the scope commits to root-causing whatever stage the instrumentation names, NO-PATCHES.

**OBJ-3 — Gate-10: prove ≥1 FULL closed crypto lifecycle.** In the contained dry-run, observe one crypto trade go open → TEC manage → exit → close → cooldown applied → telemetry, with `paper_sim_trades.strategy_name` CANONICAL and `asset_class='crypto_spot'` end-to-end, and the I3 invariant landing `opened≥1`. xStock-isolation holds (0 xStock rows; `LIVENESS_SPLIT` witness = 0). **This DISCHARGES the B7b hard-gate** (PHASE_19_PLAN §1 board / §6 gate 10). (The exit side is already armed: B6.5b F5 ATR-floor closed the never-closing H14 hole.)

**OBJ-4 — #327: remove the dead dynamic `resolveAssetClass` import at `signal-orchestrator.ts:1153`** (one-liner; blast-radius verified — the fire-and-forget archive block writes `sizingContext.assetClass`, the dynamic import is unused). Per never-leave-legacy rule 18 → delete-on-the-spot + `DELETED_COMPONENTS_LOG`.

**OBJ-5 — Decide JC#4 `[STAMP_MISSING_ACTIVE]` disposition from the dry-run's observed rate** (B6.5d carry): root-cause if the rate is non-zero (a pipe-entry bug — NO PATCHES); a throttled counter only if the dry-run proves a clean zero; never silenced. Recorded in the completion report.

**OBJ-6 — Tests.** Unit: `executeSimulatedTrade` returns the typed outcome on each post-guardrail exit (table-driven over stages a/d/e/f); rtb-metrics invariant holds with `openFailed` (attempts = opened + blocked + openFailed); depth-gate `no_book` produces an `openFailed{stage:DEPTH_GATE}` not a vanish; #327 byte-identity. NEGATIVE dormancy: nothing fires when engines off.

## 3. Dry-run envelope (contained, time-boxed, REVERTED — reuse B6.5 §5)

Staging paper mode, fake money, internal validate-vetted fills, NO real orders. Pre-flight: confirm dormant baseline (`is_engine_active=f`, `active_asset_classes={}` both modes — re-verified at Step-2); arm daily-loss kill (20% cap, present); crypto_spot the ONLY active class, xStock OFF; tiny balance + hard position cap. Flip: `setAssetClassActive(…, 'paper', 'crypto_spot', true)` + start paper engine. Observe the funnel + the I3 line + open-path tags. Revert: `setAssetClassActive(…, false)` + stop engine; verify `active_asset_classes={}` + paper_sim cleaned. (The PERMANENT flip is B7b, Kyle-gated; this staging/paper/fake-money dry-run is NOT Kyle-gated.)

## 4. Out of scope / homed
- **B7b activation** (permanent crypto-first flip) — Kyle-gated; B6.5e only DISCHARGES its gate.
- **#326 B63 DBS-not-propagated** — stays homed to "P19 pre-go-live DBS-propagation hardening" (gated before B7b).
- **xStock open path** — not exercised (xStock OFF); xStock book-warmth is a B7-era concern.
- If the open-side surface proves large (multiple accreted breaks, not one), **promote to a full P19-B7** per Langston's B6.5c ruling — flagged at Step-2/Step-3, not silently absorbed.

## 5. Langston Step-1 questions
1. **JC-A:** OBJ-1b shape — new `openFailedTotal` counter (my lean, semantic cleanliness) vs folding into `recordBlock` with new reason codes? Either keeps the invariant honest; I want your call before I touch the shared metrics singleton.
2. **Change-class:** do you accept `non_architecture`, or up-declare given the open-control-flow + invariant touch?
3. **Anything in the (a)–(g) candidate set you'd weight differently than depth-gate-leading** before I run the dry-run (e.g. you suspect EV-gate or dup-guard for crypto)?

---
*On Step-1 PROCEED → Step-2 pre-audit (SIM cross-cutting-state read for rtb-metrics singleton + the WS book subscription liveness) → Step-3 implement OBJ-1, dry-run to pinpoint, OBJ-2 fix, prove OBJ-3, fold #327/JC#4 → Step-4 embedded-diff review → CI → deploy → dry-run gate-10 → governance → close.*
