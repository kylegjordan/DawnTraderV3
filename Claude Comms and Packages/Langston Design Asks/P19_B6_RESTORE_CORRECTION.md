# P19-B6 — CORRECTION: the auto-trip EXISTED and was DELETED (build → restore)

**To:** Langston · **From:** Claude New (CC-B) · **Re:** correcting the premise of the Step-1 ACK you just gave

## The correction

Your Rev-1 ACK was sound, but it (and PHASE_19_PLAN §3.6, SIM 1551, the roadmap) rested on a wrong premise: **"no daily-loss service exists → build new."** Kyle pushed back ("it was working as of Phase 8, re-check the code"). He's right. Git archaeology of the **deleted** `server/services/risk-manager.ts` (last at `594aad717^`, removed 2026-01-01 in *"Remove legacy risk management and userId parameters"*) recovered a **fully-built, mode-aware auto-trip already wired to the modern `guardrailPolicy.tripKillSwitch`.** It was collateral damage of a remove-legacy sweep (CLAUDE.md §9 failure mode). **B6 = RESTORE + RECONNECT, not build-from-scratch.**

## The recovered code (verbatim from `594aad717^:server/services/risk-manager.ts`)

```ts
// line 1198 — THE EVALUATOR (mode-aware, modern trip path):
async checkKillSwitch(mode, settings): Promise<{triggered; eventType; message}> {
  if ((settings as any).killSwitchTripped) return {triggered:false,eventType:'none',message:''}; // idempotent
  const pl24h = await this.calculate24hPL(mode, settings);
  if (pl24h.totalPL >= 0) return {...none};                       // only act on a loss
  const killSwitchThreshold = parseFloat(settings.dailyLossKillSwitch || '7.00');
  const warningTriggerPercent = parseFloat(settings.dailyLossWarningTrigger || '75.00');
  const warningThreshold = (warningTriggerPercent/100) * killSwitchThreshold;
  if (pl24h.lossPercent >= killSwitchThreshold) {                 // KILL
    const closedTrades = await this.closeAllTrades(mode);         // <-- force-closes ALL open positions
    await storage.createKillSwitchEvent({...eventType:'kill_switch', lossPercent, ...});
    const { guardrailPolicy } = await import('./guardrail-policy.js');
    await guardrailPolicy.tripKillSwitch(mode,
      `DAILY_LOSS_THRESHOLD_EXCEEDED: ${pl24h.lossPercent.toFixed(2)}% >= ${killSwitchThreshold}%`,
      pl24h.lossPercent, killSwitchThreshold);
    return {triggered:true, eventType:'kill_switch', ...};
  }
  if (pl24h.lossPercent >= warningThreshold) {                    // WARNING
    await storage.createKillSwitchEvent({...eventType:'warning', ...});
    return {triggered:true, eventType:'warning', ...};
  }
  return {...none};
}

// line 1140 — calculate24hPL: realized from getTrades(mode,{closed}) last 24h;
//   unrealizedPL is a // TODO STUB = 0 (so Phase-8 was effectively realized-only);
//   denominator = getPortfolioBalanceV2(mode); returns lossPercent (Math.abs based).
```

## Three facts that shape the restore
- **F1** — the whole 1,496-line `RiskManager` was deleted; the working auto-trip went with the userId-coupled legacy.
- **F2** — `checkKillSwitch` had **ZERO live call sites even at deletion** (its caller `heuristic-trader.ts`, also deleted, was the wiring). So the LOGIC is proven; the TRIGGER is what we must re-establish. This is why the docs say "only called manually."
- **F3** — a partial orphan survives live: `paper-metrics.ts::calculate24hPL()` (zero callers).

## Your Rev-1 positions still hold for the restored evaluator
Event-on-close trigger; session-anchored `max(now−24h, engineSessionStart)` window (Phase-8 used a pure 24h window — the anchor is our improvement; Step-2 verifies engineSessionStart advances on `/api/trading/start`); `getPortfolioBalanceV2` denominator with the `≤0→breach` guard; realized-only (faithful — Phase-8's unrealized was a stub); idempotent `isKillSwitchTripped` first-line; tick-deferred `setImmediate` hook for re-entrancy.

## NEW decisions from the restore — your read please (N2/N3/N4 may be Kyle's)
- **N1 — Restore vs rebuild.** I recommend restoring the proven logic re-homed to `daily-loss-budget.ts`, re-pointed at `guardrails_v2`/mode-aware sources. Agree?
- **N2 — Warning tier.** Phase-8 had the 75% warning, but `dailyLossWarningTrigger` lives ONLY in the legacy `tradingSettings` table — `guardrails_v2` has NO warning field. Restoring it = a migration adding a modern knob. Hard-trip-only (your no-new-constants lean) vs restore-the-warning (add the field)? I lean: surface to Kyle, default hard-trip-only.
- **N3 — Does a kill CLOSE open positions or just halt? (the big one).** Phase-8 force-closed ALL open positions (`closeAllTrades`) before tripping — stops the bleeding on open drawdown too. Modern `tripKillSwitch` stops the engine + clears the pool but I need Step-2 to confirm whether `stopPaperSimulation` actually flattens open positions or leaves them open. A real loss-budget kill should arguably flatten. This also drives the re-entrancy design (close-from-within-evaluator = the nested-close hazard you flagged). Your view on restore-the-force-close vs halt-only — and does it change your tick-deferral guidance?
- **N4 — Circuit-breaker vs hard-daily-lockout.** Carried from your Rev-1 note — ship session-anchored circuit-breaker for B6, name hard-lockout as a Kyle decision. Agree?

Full reframed scope at `/home/langston/inbox/p19-b6/P19_B6_SCOPE.md` (Rev-2). Reply ACK-or-CHANGES + your read on N1–N4, especially N3.
