# P19-B3 PRE-AUDIT — Part A (B3a: OrderPlacer port + #139 classify root-cause)

> **Phase 19 · Batch 3 · Step 2 pre-audit.** Author: Claude New (CC-B). For Langston Step-2 review.
> Scope ACK'd at Step 1 (2026-06-13). Sub-batched per Langston: **B3a = OrderPlacer port + #139 classify hardening** (this doc) → **B3b = #137 triage + active-path fixes** (Part B, follows; Langston gates the triage split).
> Working-style directive (Kyle 2026-06-13): thorough CODE-LEVEL audit, no dismissiveness on small findings, certainty before any cut, surface architecture-touching changes to Kyle BEFORE acting.

---

## §A1 — #139 ROOT-CAUSE: the symbol-classification surface (code-traced)

### A1.1 — Empirical ground truth
Staging live window: **zero** `unknown symbol pattern` / `did not match any registered pattern` / `COLLISION_RESOLVE` / `QUEUE_FALLBACK`. No pair fails classification today ⇒ the 9 throwing sites are a **latent** landmine, not an active leak. Fix = root-cause + defensive hardening (Kyle: not a silent skip).

### A1.2 — The 9 throwing `resolveAssetClass(symbol,'kraken')` sites in `vts-runner.ts`
Lines **1248, 1540, 1894, 1935, 1972, 2637, 3013, 3660, 3751** (4 sibling sites already use `safeResolveAssetClass` per B79.0n.PATTERN_DETECT). Provenance (single root):
- All pair symbols enter VTS via **`getIdealPoolPairs()`** (`vts-runner.ts:2058`) ← `fx5Scanner.getCurrentScanBatch('paper')` (or the Active-Filter-Pool cold-start fallback).
- Ingress normalizes EVERY raw symbol via **`normalizeToInternalSymbol()`** (line 2077/2126) and **drops unmappable symbols** before they enter VTS (line 2080-2085: `if (!mappingDetails.mappable) continue`).
- The normalized `canonicalSymbol` then flows to `generatePhase10Signal(symbol,…)` (sites 1248/1540/1894/1935/1972), `registerOpenVtsTrade(input)` (site 3013 `input.symbol`), and the close path `resolveOpenVirtualTrades` (site 2637 `trade.symbol`, read off the stored open trade). Cycle iterator sites 3660/3751 use `pair.symbol` straight from `getIdealPoolPairs`.

**⇒ symbols reaching all 9 sites are ALREADY ingress-normalized.** This is why nothing throws today.

### A1.3 — THE ROOT FINDING (Kyle's normalizer-mismatch instinct, CONFIRMED): two symbol systems with non-identical acceptance
There are **two independent symbol-form systems** that must agree but were built separately:
- **Ingress normalizer** — `server/markets/kraken-symbol-resolver.ts::normalizeInternal` (via `normalizeToInternalSymbol`). Produces `BASE/QUOTE` for anything it can parse (quotes it knows: USD/EUR/GBP/CHF/JPY/CAD/AUD/USDT/USDC/ETH/XBT; maps; or compact-parse), else returns the raw string **unchanged**. **No base-length bound.**
- **Classifier** — `shared/asset-classes.ts::resolveAssetClass`, which uses its OWN regexes, the binding one being `CRYPTO_SPOT_CANONICAL = /^[A-Z0-9]{2,10}\/[A-Z0-9]{3,4}$/`.

**Acceptance reconciliation (enumerated):**
- Quote-currency list difference is a **non-issue**: the ingress normalizer always emits a *slashed* `BASE/QUOTE`, so `CRYPTO_SPOT_CANONICAL` (quote = any `[A-Z0-9]{3,4}`) accepts USDC/USDT/ETH/XBT/etc. by length — the raw-form quote lists never apply to normalizer output. ✓ aligned.
- **CONCRETE GAP — base length.** `CRYPTO_SPOT_CANONICAL` caps the base at **10 chars** (`{2,10}`); the ingress normalizer has **no upper bound**. A token whose base is **≥11 chars** passes ingress (`LONGTOKENNAME/USD`) and then **fails classification → throws**. Also a 1-char base (`{2,…}` min 2) would fail, but 1-char bases are effectively nonexistent.
- **Fallback-unchanged path:** if `normalizeInternal` can't parse a symbol it returns it raw-unchanged; `getIdealPoolPairs` only drops it when `getSymbolMappingDetails` ALSO says unmappable. A "mappable-but-unparsed" form is an additional (narrow) divergence surface.

**Why dormant:** live Kraken spot bases are almost all ≤5 chars; nothing ≥11 is currently in the universe. The gap is real but unexercised — consistent with the zero-throw ground truth.

### A1.4 — LOCKED-MODULE constraint (surface to Kyle per his directive)
`kraken-symbol-resolver.ts` carries a header: **"🔒 LOCKED MODULE — DO NOT MODIFY. Changes require a formal directive."** ⇒ the fix must NOT modify the ingress normalizer. **Reconcile on the CLASSIFIER side instead** (widen/align `resolveAssetClass` acceptance to the normalizer's output space) + the loud-alarm backstop. If the normalizer side ever genuinely needs to change, that escalates to Kyle (architecture-touch) — flagged, not assumed.

### A1.5 — #139 FIX APPROACH (B3a)
1. **Normalize-before-classify is ALREADY satisfied** at ingress (`normalizeToInternalSymbol`) — confirmed, no new normalization needed at the 9 sites (they receive normalized symbols). Document this as the boundary; do NOT add redundant normalization.
2. **Classifier-side reconciliation** (no locked-module change): align `CRYPTO_SPOT_CANONICAL`'s base bound to the normalizer's real output range (raise `{2,10}` → an evidence-based max, e.g. the longest Kraken spot base + margin) + a unit test locking the alignment. This closes the demonstrable gap at the source per Kyle ("fix so the system recognizes it everywhere"), not a skip.
3. **Loud-alarm safety net (active-vs-passive per Langston A3):** switch the 9 throwing calls → `safeResolveAssetClass`; on null →
   - **VTS/passive path:** loud WARN **+ a telemetry counter** (e.g. `classify_fallthrough_total`), single-pair skip. No execution consequence.
   - **Active execution path (paper-active ON or live):** **system-alert** (named, surfaced via §10.5) + single-pair skip. Never a silent skip.
4. **Silent-misclassification cousin (OBJ-4d):** an xStock arriving on `exchange='kraken'` without `x`-suffix / universe-membership resolves as `crypto_spot` (a WARN-logged collision-resolve, not a throw). On the VTS path symbols are crypto-universe-sourced (`fx5Scanner` paper batch) so xStocks don't traverse these 9 sites today; confirm at implementation, and if unreachable on the active path, give it a concrete home (§9.4) rather than fix-here.

---

## §A2 — OrderPlacer execution port (B3a OBJ-1)

### A2.1 — The two seams (code-mapped)
| Seam | Location | Enclosing method | Reached from |
|---|---|---|---|
| **OPEN** | `createPaperSimOpenPosition(this.mode,{…})` `paper-execution-engine.ts:2196` | `executeSimulatedTrade` (1789) | `executePromotedSignal` (1724) ← `checkRtbPromotion` (1610) / `processSignal` (2471) |
| **CLOSE** | `closePosition(...)` `paper-execution-engine.ts:1104` | (is itself the method) | `checkOpenPositions:871` (exit-monitor cycle) + `forceClosePosition:573` (manual/forced) |

Engine is already mode-parametric (`private mode:'live'|'paper'`), so the port is a **typed extraction of these two seams**, not a rewrite. Current paper fill semantics: **synchronous, atomic, always-fills-fully** — `createPaperSimOpenPosition` writes the position immediately; `closePosition` computes P/L off a passed exit price with slippage+fees and writes the close. This is exactly P19-B2 invariant #1 (fill-confirmation lifecycle: paper sync-atomic vs live async/partial/rejectable).

### A2.2 — Design (Langston A2: two files)
- **`server/services/execution/types.ts`** — the `FillResult` discriminated union + the `OrderPlacer` port interface. Imported by the future live adapter (B7) WITHOUT importing the paper adapter.
  - `FillResult = { status:'filled', fillPrice, fillQty, fees, slippage, positionId? } | { status:'partial', fillQty, requestedQty, fillPrice, fees, remaining } | { status:'delayed', orderRef, submittedAt } | { status:'rejected', reason, code }`
  - `interface OrderPlacer { openOrder(req: OpenOrderRequest): Promise<FillResult>; closeOrder(req: CloseOrderRequest): Promise<FillResult>; }`
- **`server/services/execution/order-placer.ts`** — `PaperOrderPlacer implements OrderPlacer`: `openOrder` performs today's `createPaperSimOpenPosition` write and returns `{status:'filled',…}`; `closeOrder` performs today's `closePosition` math and returns `{status:'filled',…}`. Behavior-identical to current paper (pure structural extraction).
- **Caller adaptation:** `executeSimulatedTrade` calls `orderPlacer.openOrder(...)` and handles the `FillResult` (today always `filled`; the `partial/delayed/rejected` branches are written but, for paper, unreachable — they exist so live slots in). `closePosition`'s two callers route through `orderPlacer.closeOrder(...)`.

### A2.3 — Verification (B3a)
`tsc` clean; unit tests for each `FillResult` variant + the paper adapter's filled path; paper open→close still works end-to-end in the bench with no behavior change (pure extraction); full `vitest` green; staging boot clean.

---

## §A3 — BLAST RADIUS / SIM (B3a)
- `paper-execution-engine.ts` — SIM blast radius **HIGH** (determines paper-vs-live path). The port extraction is internal-structural; no signature change to `processSignal`/`executePromotedSignal` external API. SIM update needed: add the `execution/` port + `FillResult` contract to SIM as the new live-swap seam.
- `vts-runner.ts` — the 9 classify sites are read-only resolves feeding trade-record/ablation/archive tags; switching to safe-resolve + skip changes ONLY the unresolvable-symbol path (today never taken). No change to resolved-symbol behavior.
- `shared/asset-classes.ts` — widening `CRYPTO_SPOT_CANONICAL` base bound is additive (accepts a strict superset); existing matches unaffected. Unit test locks it.
- **No DB migration. No locked-module change.** Crypto/VTS behavior on resolved symbols unchanged.

---

## §A4 — OPEN ITEMS FOR LANGSTON (Step-2)
1. **Base-bound evidence:** OK to set the new `CRYPTO_SPOT_CANONICAL` base max from the live Kraken spot universe's longest base + margin (I'll pull the actual max), vs. a flat generous bound? Prefer evidence-based.
2. **Classifier reconciliation vs alarm-only:** agree the classifier widen is the right "root-cause" move (vs. leaving the regex and relying solely on the alarm)? My read: widen (fixes the seam) AND alarm (catches anything else) — both, per NO-PATCHES.
3. **A2.2 caller handling:** for paper, should the `partial/delayed/rejected` branches `throw new Error('unexpected non-filled FillResult in paper')` (fail-loud, since paper can't produce them today) or log+skip? Lean: fail-loud — a paper non-fill would itself be a bug.
4. **#137 triage (Part B):** confirm I produce the 66-file triage table next (B3b pre-audit) for your split-gate, after B3a port+classify lands.

---

## §A5 — LANGSTON STEP-2 CONDITIONS (APPROVED to implement, 2026-06-13 — folded, binding)
Langston verified all four load-bearing claims against the repo (base cap `{2,10}` at `asset-classes.ts:405`; locked-module header `:2`; throw `:489-491` / safe `:514-519`; seams `:2196`/`:1104`) and APPROVED Step-2 with three sharpening conditions + two housekeeping items:

- **C1 — base bound = FINITE generous ceiling, rationale = alarm-preservation (not universe-fit).** Sharper reason than "fits the universe": widening trades a *loud throw* for a *silent confident classification* — the alarm fires on null/throw, NOT on confident-but-wrong. So an unbounded/too-wide base bound would let an implausibly-long garbage/misclassified form classify as `crypto_spot` with no alarm. Keep the ceiling FINITE as a tripwire; size the margin for **plausible future legitimate tokens** (NOT "+2 over today's max" — that re-creates the divergence on the next listing = the patch we're killing); **document the ceiling as a garbage/collision guard** so a future legit token approaching it triggers a deliberate bump, not a silent re-trip. (Static-map longest base today = 6 chars `RENDER`; will pull the live auto-discovered universe max to set the bound on evidence.)
- **C2 — widen AND alarm; verify the alarm fires on the raw-unchanged path too.** The widen closes the base-length seam; the alarm must also cover the A1.3 "mappable-but-unparsed → raw-unchanged" path (which the widen does NOT address — the alarm is its only backstop). VERIFY at implementation that `safeResolveAssetClass`→null trips the alarm on BOTH surfaces, not just base-length.
- **C3 — fail-loud must be CONTAINED + the close-seam needs a written position-state rule.** A non-`filled` FillResult in paper is structurally impossible (sync/atomic/always-full at `:2196`) → a real bug → fail-loud is right, BUT this is the active-paper path: the throw must be **caught at the same cycle boundary as the classify-skip** (emit system-alert active / WARN+counter passive, skip the one trade) — **never an uncaught throw that stalls the exit-monitor cycle or drops the process.** **Close-seam state rule (written in design, per C3):** on a tripped/non-`filled` `closeOrder`, the position **stays OPEN (close NOT recorded) and is retried next exit-monitor cycle** — never half-closed/limbo. Open-seam fail-loud is safe as-is.
- **H1 (§9.4) — OBJ-4d gets a NAMED home AT confirmation, not floated.** When I confirm xStock-on-`kraken` silent-collision reachability on the active path during implementation, name its `RUNNING_ISSUES.md` home + batch/phase THEN (not "confirm at implementation" as an open loop). Reachability surfaces to watch: paper-engine open `:2222` `resolveAssetClass(signal.symbol,'kraken')` + close `:1238` (assetClass-fallback) — xStock positions DO traverse the paper engine, so confirm whether an off-universe xStock can reach these.
- **H2 — SIM update carries the WHY.** The base-bound ceiling rationale + the widen↔alarm-coverage interaction go into the SIM alongside the new `execution/` port seam (§A3), so the next reviewer sees why the ceiling is finite.

**Design decision locked (thin port):** the `OrderPlacer` wraps ONLY the fill (paper: slippage+fee math → `FillResult`); the engine retains the position write + all bookkeeping (P&L, learning capture, exit archive, trade-record update). Smallest faithful diff; the order-placement boundary is exactly what differs paper↔live.

**Note surfaced (don't dismiss):** `paper-execution-engine.ts:1238` close-path carries its OWN throwing `resolveAssetClass(position.symbol, exchange)` — guarded by `(position as any).assetClass ?? …` (position carries assetClass from open `:2222`) AND inside a try/catch, so low-risk, but it IS an active-path throwing site outside the vts-runner 9. Fold into the #139 active-path alarm sweep (treat consistently) or note as covered-by-guard; decide at implementation, record the call.

---

## §A6 — FULL BLAST-RADIUS AUDIT (Kyle directive 2026-06-13 — complete caller enumeration; reshapes #139)

A whole-repo caller enumeration (every system/component/function/helper touching the fix surface) + SIM + System Manual review surfaced three findings that **reshape the #139 fix** vs the §A1 first cut.

### PREVIOUSLY-STATED-VS-NOW (§9.2)
- **#139 throwing-classifier surface: PREVIOUSLY "9 throwing sites in vts-runner." NOW: ~21 throwing `resolveAssetClass` call sites across the ACTIVE path. REASON: blast-radius enumeration — signal-orchestrator (≈10: 415/458/531/583/752/1009/1043/1078/1365/1530/1874/2003), paper-execution-engine (133/1238/2107/2222/2671), ready_to_buy_service (626/655/878), expectancy/pre-execution-validator/realtime-paper-executor/market-context-engine/vts-service/routes.ts(2)/rtb-refresh, PLUS the 9 vts-runner. (~16 `safeResolveAssetClass` sites already exist.)**
- **Classifier regex: PREVIOUSLY "1 regex (`asset-classes.ts:405`) to widen." NOW: the regex is DUPLICATED verbatim at `server/utils/symbol-normalize.ts:74`. REASON: enumeration found the independent copy. Widening one alone RE-CREATES the divergence we're killing — both MUST widen in tandem.**

### Finding 1 — DUPLICATE classifier regex (CRITICAL, must-fix together)
`^[A-Z0-9]{2,10}\/[A-Z0-9]{3,4}$` exists at **both** `shared/asset-classes.ts:405` (`CRYPTO_SPOT_CANONICAL`, in `resolveAssetClass`) AND `server/utils/symbol-normalize.ts:74` (`normalizeCryptoSpot`'s "already-canonical?" gate). **Widen BOTH** to the same finite bound, same commit, with a cross-reference comment so they can't drift again. (symbol-normalize's `normalizeCryptoSpot` is mostly a pass-through that DEFERS crypto raw forms to the legacy canonicalizer, so the divergence's live impact is narrow — but consistency is the whole point of this fix per Kyle.) The two xStock regexes (`asset-classes.ts:182` `{2,5}`, `symbol-normalize.ts:96/103` `{1,5}`) are intentionally short (xStock tickers ≤5) — **do NOT widen those.**

### Finding 2 — FOUR symbol-handling modules (fragmentation; HOME it, don't consolidate in B3a)
(1) `shared/asset-classes.ts` (classifier regexes), (2) `server/services/utils/symbol-canonicalizer.ts` (legacy `toCanonical`), (3) `server/markets/kraken-symbol-resolver.ts` (`normalizeInternal` — LOCKED), (4) `server/utils/symbol-normalize.ts` (B79 `normalize`). Each has its own acceptance rules — the structural root of the "matched-up-across-all-parts" risk Kyle named. **Consolidating these is a real refactor, OUT of B3a scope.** → **§9.4 HOME: new `RUNNING_ISSUES` entry "symbol-form module consolidation" → Phase 20 hardening** (the widen+alarm makes B3a safe without it; consolidation is the durable de-fragmentation).

### Finding 3 — REVISED #139 fix (centralize, don't touch 21 sites)
The widen fixes the base-length seam for ALL ~21 callers at once (they share one `resolveAssetClass`). Converting all 21 throwing→safe is a large behavior change (many are intentional fail-fast at signal-mint; silently skipping in signal-orchestrator could drop signals) — NOT B3a. **B3a plan:**
1. **Widen both regexes** (Finding 1) — finite tripwire bound (Langston C1), evidence-sized.
2. **Centralize the loud alarm INSIDE `safeResolveAssetClass`** (`asset-classes.ts:508`, currently bare WARN at :517) → active-vs-passive (system-alert active / WARN+counter passive). Every one of the ~16 existing safe-sites then alarms for free; no 21-site edit.
3. **Switch the originally-scoped 9 vts-runner throwing sites → safe** (the #139 ask) so the VTS path skips-not-throws + alarms.
4. **HOME the remaining ~12 active-path throwing sites** (signal-orchestrator/RTB/etc.) → **§9.4: `RUNNING_ISSUES` "active-path throwing-resolve hardening" → P19-B4** (alongside the active-path wiring, where signal-drop semantics get designed). The widen + centralized alarm cover the structural risk now; the per-site conversion is deliberate work for when the active path turns on.

### Finding 4 — port seams confirmed LOW blast radius (proceed)
`executeSimulatedTrade` + `closePosition` are PRIVATE; sole callers are internal (`processSignal`→exec at :2707; `checkExitConditions`→close at :871; `requestManualStop`→close at :573) + `createPaperSimOpenPosition` external caller `trade-executor.ts:227` uses the storage interface directly (unaffected by the port). The thin-port extraction is internal-only — no external API breaks. **Port build proceeds independent of the #139 scope decision.**

### Governance targets (for Step-10)
SIM `1-system-manual/SYSTEM_IMPACT_MAP.md:637-643` (Asset Class Registry — update `resolveAssetClass` acceptance + add `execution/` port seam). System Manual `SYSTEM_MANUAL.md` §3.7/§3.9 (`closePosition`/`executeSimulatedTrade` flows) + the Phase-19 paper-sim-activation lines — add the OrderPlacer port + the widen/alarm rationale (Langston H2).

---

*Part A complete + Langston Step-2 conditions folded + FULL blast-radius audit (§A6, Kyle directive). #139 approach revised (widen-both-regexes + centralized alarm + switch-9 + home-the-rest). Port build proceeds. Part B (#137 triage) follows as B3b. — Claude New (CC-B), 2026-06-13.*
