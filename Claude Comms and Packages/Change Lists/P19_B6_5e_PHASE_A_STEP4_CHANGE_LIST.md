# P19-B6.5e Phase A — Step-4 Change List (open-stage observability + #327)

> **For Langston (Step-4 code review, BEFORE push).** Implementer: Claude New (CC-B). Commit `0dd25ff4c` (local; NOT pushed). Scope `P19_B6_5e_SCOPE.md` + pre-audit `P19_B6_5e_PRE_AUDIT.md` (your Step-1 PROCEED + JC-A "new openFailed counter" folded in).
> **INFRASTRUCTURE NOTE: do NOT `cd /mnt/gdrive` or run `git status`/`git log` on the gdrive mount.** Read the embedded snippets below + the raw diff at `/home/langston/inbox/p19-b6-5e/p19-b6-5e-phaseA.diff` (Read-tool, local FS). For any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.
> **Diffstat:** 4 files, +268 / −65. New test: `p19-b6-5e-open-failed-invariant.test.ts` (6 tests). **Bench:** tsc-baseline CLEAN (no regressions; paper-execution-engine even 3→1); 30 tests green (6 new + depth-gate + B6.5d asset-class). Docker unavailable locally → DB-backed suite defers to CI (same as prior batches).
> **★ This is PHASE A only — the INSTRUMENTATION. It does NOT yet fix the crypto open break.** Per your Step-1 note 1, Phase A deploys FIRST, THEN the OBJ-2 dry-run names the stage, THEN the root-cause fix (Phase B) is its own diff + review. Gate-10 (OBJ-3) closes after Phase B.

The invariant Phase A enforces: **a post-guardrail open-stage failure can no longer vanish from the I3 accounting.** `attempts === opened + blocked + openFailed`. JC-A shape = a NEW third counter (not folded into `recordBlock`) so "blocked" stays semantically = guardrail block.

---

## OBJ-1a — rtb-metrics-service.ts: the 3rd term (NEW `openFailedTotal` + `openFailedByStage`)
```ts
export type OpenFailStage =
  | 'DRY_RUN' | 'GUARDRAIL_BLOCK'   // return-only labels — NOT recorded (DRY_RUN pre-attempt; GUARDRAIL_BLOCK already counted via recordBlock)
  | 'EV_REJECT' | 'SIZING_INVALID' | 'UNCLASSIFIABLE' | 'DEPTH_GATE'
  | 'FILL_REJECTED' | 'DUP_POSITION' | 'TRADE_INSERT_ERROR' | 'OTHER';

recordOpenFailed(symbol, strategy, stage: OpenFailStage, reason: string): void {
  this.stats.openFailedTotal++;
  this.stats.openFailedByStage[stage] = (this.stats.openFailedByStage[stage] || 0) + 1;
  // per-symbol/strategy rollups have only attempts/opened/blocked → fold open-fails into
  // `blocked` with an `OPEN_<stage>` reason key so those funnels still reconcile (global keeps it separate).
  if (this.bySymbol[symbol]) { this.bySymbol[symbol].blocked++; this.bySymbol[symbol].byReason[`OPEN_${stage}`] = ...; }
  if (this.byStrategy[strategy]) { this.byStrategy[strategy].blocked++; }
  console.log(`[8.8.3-I3][OPEN_FAILED] stage=${stage} symbol=${symbol} strategy=${strategy} reason=${reason} ...`);
}
```
**I3 invariant (logInvariantCheck) + I2 (getSummary) updated:** `expectedTotal = openedTotal + blockedTotal + openFailedTotal`; the `[8.8.3-I3][INVARIANT_CHECK]` line now prints `openFailed=N [STAGE:n,...]`; `breakdownValid` also checks `stageSum === openFailedTotal`. `reset()` + `initializeBlockReasons()` init the new fields. `recordDepthGateBlock` (depth-source `_gateBlocks`) is UNCHANGED — it stays as the fine-grained per-class counter underneath the coarse `openFailedByStage`.

## OBJ-1b — paper-execution-engine.ts: typed `OpenOutcome` (was silent `void`)
```ts
export type OpenOutcome = { opened: true; tradeId: string } | { opened: false; stage: OpenFailStage; reason: string };
```
**`executeSimulatedTrade(...): Promise<OpenOutcome>`** (was `Promise<void>`). Every post-guardrail early-exit now records + returns. Representative (the LEADING suspect, depth gate):
```ts
if (!_gate.pass || !_gate.snapshot) {
  console.warn(`[P19-B4b.1][DEPTH_GATE_BLOCK:${this.mode}] ...`);
  recordDepthGateBlock(_openClass, _gate.reason);                                  // unchanged fine-grained counter
  rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'DEPTH_GATE', _gate.reason);  // NEW: folds into I3
  return { opened: false, stage: 'DEPTH_GATE', reason: _gate.reason };
}
```
Same pattern at: EV gate (`EV_REJECT`), sizing≤0 / no-portfolio (`SIZING_INVALID`), unclassifiable open/trade (`UNCLASSIFIABLE`), fill rejected/non-filled/zero (`FILL_REJECTED`), dup-guard (`DUP_POSITION`). Success path now `return { opened: true, tradeId: trade.id }`. The **trade-insert catch STOPS re-throwing** → records `TRADE_INSERT_ERROR` + returns typed (was: `throw err` → swallowed by processSignal's catch). Guardrail-block exit returns `{stage:'GUARDRAIL_BLOCK'}` WITHOUT recordOpenFailed (already counted). DRY_RUN exit returns `{stage:'DRY_RUN'}` (pre-attempt, not counted).

**`processSignal(...): Promise<OpenOutcome>`** (was `void`): threads the outcome — `return await this.executeSimulatedTrade(signal, settings)`; its pre-attempt guard-returns (engine-off, killswitch, AMR gate, confidence floor, fallback-sizing-fail) return labelled `{opened:false,...}` (no recordOpenFailed — before recordAttempt). Catch returns `{stage:'OTHER'}`.

**`executePromotedSignal`** — the brittle inference DELETED:
```ts
// BEFORE: count trades before/after, infer "newTrade ? success : 'No new trade created'"
// AFTER:
const outcome = await this.processSignal(promotedSignal);
if (outcome.opened) return { success: true, tradeId: outcome.tradeId };
return { success: false, error: `${outcome.stage}: ${outcome.reason}` };
```
(`processSignal`'s only meaningful caller is here; the `intent-executor.ts` legacy calls — #297 dead subsystem — ignore the return, so the type widening is safe.)

## OBJ-4 — #327 dead dynamic import removed (signal-orchestrator.ts)
```ts
-      const { resolveAssetClass } = await import('../../shared/asset-classes.js');   // unused — archive writes sizingContext.assetClass
```
Verified: the only `resolveAssetClass` binding in the file; no call site (grep — all other refs are comments). Per rule 18.

---

## ⚠️ Judgment calls to ratify
1. **JC-A shape applied as you ruled** — new `openFailedTotal` counter, NOT routed through `recordBlock`. The per-symbol/strategy rollups (which physically have only 3 fields) fold open-fails into their `blocked` with an `OPEN_<stage>` reason key so those drill-downs still reconcile, while the GLOBAL I3 keeps the clean 3-term split. Agree with that asymmetry, or do you want the per-symbol struct widened with its own openFailed field (bigger surface)?
2. **Catch no longer re-throws** (trade-insert) — now records `TRADE_INSERT_ERROR` + returns typed instead of `throw err`. This removes the last swallowed-throw layer (processSignal's catch used to absorb it). Any caller you know of that RELIED on processSignal throwing on a trade-insert error? (I found none — the only live caller is executePromotedSignal which treats it as `success:false`.)
3. **processSignal return-type widened void→OpenOutcome** — legacy `intent-executor.ts` callers (#297) ignore the result. Acceptable, or do you want a thin dedicated method to avoid touching the public `processSignal` signature?

Acceptance gate (this phase): tsc-baseline clean ✓, 6 new tests ✓, no regression ✓. On your APPROVE → push + CI all-4-green → deploy → run the contained crypto dry-run → the `[8.8.3-I3]` line will now read e.g. `openFailed=11 [DEPTH_GATE:11]`, naming the stage → Phase B root-cause fix.
