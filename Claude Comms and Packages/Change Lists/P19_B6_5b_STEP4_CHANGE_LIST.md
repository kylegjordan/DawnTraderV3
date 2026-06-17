# P19-B6.5b — Step-4 Change List (Langston code review)

> **Commit:** `46fcd4321` on `migration/aws-supabase` (NOT pushed — awaiting your APPROVE). **Bench:** tsc baseline OK (no regressions); 19 targeted tests green (the 2 new B6.5b files + the 2 isolation files whose mocks were trimmed + B6.5a + B4a-C2/C3 = 45 tests across the affected set).
> **INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git/status on the mount.** Embedded diffs below are the load-bearing hunks; for anything else use `ssh staging 'cd /home/deploy/dawntrader && git show 46fcd4321 -- <file>'` after push, or read the committed files. Files: see the 11-file stat at the end.
> Implements your Step-2 ruling: F1-F4 + V1-as-F5, both-enforcement #320, witness-wire #321, F3 fires-not-just-deployed, homes named.

---

## F1a (#320 structural) — `server/services/fx5-scanner.ts` `scanMode`

The audited bypass: the tick handler down-converts a *local* `tradingActive` when crypto is gated OFF, but `scanMode` re-derives the **master** `isEngineActive` from `earlyContext` and gates pool population on THAT — so master ON + crypto OFF still populated the active crypto pool. Fix threads the per-class flag in:

```ts
const isEngineActive = earlyContext?.isEngineActive || false;
// P19-B6.5b (F1 / #320): per-class gate must propagate INTO pool population, not just the
// tick-handler scan-mode label. fx5 scans crypto → gate class 'crypto_spot'. Master axis
// (passive-learning + B5a capture) stays on isEngineActive — crypto keeps LEARNING while gated off.
const cryptoActivePoolEligible = isEngineActive && isAssetClassActiveInContext(earlyContext, 'crypto_spot');
if (isEngineActive && !cryptoActivePoolEligible) {
  console.log(`[FX5Scanner][P19-B6.5b][#320][${mode}] master engine ACTIVE but crypto_spot gated OFF → active pool NOT populated (passive/VTS); orchestrator sees no crypto signal.`);
}
// enforcePassiveModeIfStopped now driven by the COMBINED flag (clears pool when crypto gated off):
activeFilterPool.enforcePassiveModeIfStopped(mode, cryptoActivePoolEligible);
...
// pool-population gate (was `if (isEngineActive)`):
if (cryptoActivePoolEligible) {
  const poolStats = activeFilterPool.addSurvivors(mode, familyQualifiedUnion);
  ...
```
`earlyContext` is the full SystemContext already fetched in scanMode — no extra query.

## F1b + F2 (#320 defense-in-depth + #321 witness) — `server/core/rtb/ready_to_buy_service.ts`

New static import (no cycle — trading-state-sync does not import RTB):
```ts
import { tradingStateSync, isAssetClassActiveInContext } from '../../services/trading-state-sync.js';
```
**Admission chokepoint** — in `queueSQESignal`, right after `resolvedAssetClass` is set (after the existing stamp-missing throw):
```ts
const admissionContext = await storage.getSystemContext(input.mode);
if (!isAssetClassActiveInContext(admissionContext, resolvedAssetClass as AssetClass)) {
  tradingStateSync.witnessAssetClassEmissionWhileInactive(input.mode, resolvedAssetClass as AssetClass);
  console.warn(`[P19-B6.5b][#320][RTB_GATE_REJECT] ${resolvedAssetClass} signal reached queueSQESignal while its per-class active gate is OFF in ${input.mode} — REJECTED (defense-in-depth). symbol=${normalizedSymbol} strategy=${input.strategy} signalId=${input.signalId}`);
  return null;
}
```
Reads the SAME `isAssetClassActiveInContext` the entry gate uses (cannot reject a legitimately-active class) + wires the #321 witness (your hard requirement).

**Re-eval purge** — new helper, called once/cycle from BOTH `executePerSignalRefresh` and `executeRefreshCycle` (after their existing `isEngineActive` gate, using the context they already fetched), replacing the two "deferred to B6.5b" comments:
```ts
private async purgeInactiveClassSignals(mode, systemContext): Promise<number> {
  const queued = await this.getQueuedSignals(mode);
  let purged = 0;
  for (const sig of queued) {
    const cls = asValidAssetClass(sig.assetClass);
    if (cls && !isAssetClassActiveInContext(systemContext, cls)) {
      tradingStateSync.witnessAssetClassEmissionWhileInactive(mode, cls);
      await storage.deleteRtbSignals({ mode, id: sig.id });
      performanceMonitor.recordQueueRemove(1);
      this.signalRefreshStates.delete(this._refreshKey(mode, sig.signalId));
      purged++; console.warn(`[P19-B6.5b][#320][RTB_GATE_PURGE] queued ${cls} ${sig.symbol} purged — gate OFF in ${mode}`);
    }
  }
  return purged;
}
```
Clears stale queued signals if a class flips OFF mid-flight (the revert case), before re-rank/promotion.

## F3 (H16 cooldown) — `server/services/trade-safety.ts` `checkSymbolCooldown`

Was `storage.getTrades(mode, {status:'closed'})` (legacy `trades` table) for BOTH modes → silent no-op for paper (active-paper writes `paper_sim_trades`). Now mode-branched:
```ts
let lastTradeTime: number | null = null;
if (mode === 'paper') {
  const { trades: paperTrades } = await storage.getPaperSimTradesPaginated(mode,
    { symbol: trade.symbol, closedOnly: true, sortBy: 'closedAt', order: 'desc', limit: 1 });
  const last = paperTrades?.[0];
  const t = last?.closedAt ?? last?.openedAt ?? null;
  lastTradeTime = t ? new Date(t).getTime() : null;
} else {
  const lastTrades = await storage.getTrades(mode, { symbol: trade.symbol, status: 'closed' as const, limit: 1 });
  const last = lastTrades?.[0];
  const t = last ? (last.exitTime || last.entryTime) : null;
  lastTradeTime = t ? new Date(t).getTime() : null;
}
if (lastTradeTime === null) { /* no prior closed trade → ok:true */ }
```
Same pattern daily-loss-budget already uses for paper. Live keeps the legacy read (Phase-21 builds live).

## F5 (V1 / H14 ATR-zero floor) — `server/services/tec-evaluator.ts` `evaluateTECExit`

Was `if (!input.useTrailing) { stop/target }` — skipped when useTrailing=true; the trailing block only engages at `atr>0`; so useTrailing && atr<=0 = never closes on stop/target. Now a floor:
```ts
const atrUnavailableForTrailing = !(input.atr > 0);
if (!input.useTrailing || atrUnavailableForTrailing) {
  const viaAtrFloor = input.useTrailing && atrUnavailableForTrailing;
  if (currentPrice <= input.stopPrice) {
    if (viaAtrFloor) console.warn(`[TEC][P19-B6.5b][F5][ATR_FLOOR] ${input.symbol} stop_hit via hard floor (useTrailing but ATR<=0=${input.atr})...`);
    return { shouldExit: true, exitReason: 'stop_hit', exitPrice: input.stopPrice, resolvedConstants };
  }
  if (currentPrice >= input.targetPrice) { /* target_hit via floor, same warn */ }
}
```
With trailing ON + valid ATR (normal paper path), still skipped — trailing owns it, unchanged. **Forcing unit test** (`p19-b6-5b-tec-atr-floor.test.ts`): atr=0 + useTrailing=true → stop_hit + target_hit fire; price-between → no over-fire; useTrailing=false legacy path intact. **4 tests green.**

## F4 tests — 2 new files (10 tests, all green)
- `p19-b6-5b-tec-atr-floor.test.ts` (4) — F5 floor.
- `p19-b6-5b-crypto-isolation.test.ts` (6) — F2 witness increments `getLivenessSplitStats` (proves #321 wired+observable, per-mode keyed) + the gate-10 crypto-isolation PREDICATE (the exact `isEngineActive && isAssetClassActiveInContext(ctx,'crypto_spot')` boolean F1a uses): master ON + crypto OFF → not eligible; master ON + crypto ON → eligible; master OFF → not eligible; empty (dormant default) → not eligible.

**★ FLAG for your call (Q5 gate-10):** the full `queueSQESignal` admission *reject* is NOT unit-tested — importing `ReadyToBuyService` pulls central-clock / tcl_watchdog / SQE and is disproportionately brittle to mock. Its pieces ARE unit-tested (isAssetClassActiveInContext = 7 cases in B6.5a + here; the witness = here) and you review the 3-line composition. The reject is **integration-proven on staging during the dry-run REVERT** (flip crypto OFF with signals possibly queued → purge/reject fires + the `getAssetClassGateStats`/`LIVENESS_SPLIT` witness increments). The crypto-ON happy path won't exercise the reject (crypto is active), so the revert probe is the real reject test. Acceptable, or do you want the heavy-mock unit test?

## H-c dead-code (rule 18 / your Q4) — DELETED
`queueSignal` (RTB capacity-block variant, ~90 lines) + `RTBSignalInput` (used only by it) + `storage.insertRtbSignal` (interface+impl) + 2 test-mock stubs. **Verification:** repo-wide grep `server/client/shared/scripts` — `queueSignal` (excl. `queueSQESignal` substring) = def + 1 doc-comment, ZERO callers; `insertRtbSignal` = decl+impl+2 test stubs, ZERO callers (queueSignal itself used `upsertRtbSignal`). tsc baseline no-regression; the 2 isolation test files re-run green after the stub trim. Archived `_archive/deleted-code/p19-b6-5b-rtb-deadcode.removed`; `DELETED_COMPONENTS_LOG.md` entry. Left intentionally: `upsertRtbSignal` (live writer), `queueSQESignal` (live chokepoint, now F1b-guarded).

## NEXT (post-APPROVE): push → CI all-4-green → staging deploy → **the dry-run (Obj-2/3)**: flip `crypto_spot` ON (paper, fake money) + master ON → observe ≥1 FULL closed crypto lifecycle (open→exit→close→cooldown→telemetry) + fill-parity (depth-walk VWAP, depth gate, crypto_spot fees) + xStock-isolation (zero xStock opens, witness=0) + **F3 cooldown observed BLOCKING a re-entry** (your gate-10 addition) + **the reject/purge witnessed on revert** → revert. Then Step-8 (you) + governance + close gate-10.

---
*Step-4 dispatch. On APPROVE → push + CI + deploy + dry-run.*

### Files (11): fx5-scanner.ts (F1a) · ready_to_buy_service.ts (F1b/F2 + deadcode) · trade-safety.ts (F3) · tec-evaluator.ts (F5) · storage.ts (deadcode) · p19-b6-5b-tec-atr-floor.test.ts + p19-b6-5b-crypto-isolation.test.ts (new) · b79-0n-rtb-{fsm-,}isolation.test.ts (stub trim) · DELETED_COMPONENTS_LOG.md + _archive/deleted-code/p19-b6-5b-rtb-deadcode.removed
