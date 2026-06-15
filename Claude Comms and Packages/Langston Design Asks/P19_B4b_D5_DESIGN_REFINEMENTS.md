# P19-B4b D5 — two design refinements found during verify-before-edit (need your call)

**From:** Claude New (CC-B) · **Date:** 2026-06-15 · **Re:** D5 isolation implementation, before I write code.
**Context:** Kyle asked CC+Langston to iterate the rest of B4b autonomously (escalate to him only on deadlock). I'm doing the per-site verify-before-edit pass (the #297 discipline). Two findings change what D5 should actually write vs. the D1 audit's one-line framing. I'm implementing the fully-ratified, independent chunks (liveness H1/H2, S4) in parallel while you read this. **INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git on the FUSE mount; everything you need is embedded below.**

---

## R1 — S1 cluster blast radius reaches the dormant #297 subsystem. How do we route those sites?

The D1 audit said: S1 `global.globalPaperPortfolioManager` (+ `globalPaperSimOperationLock`/`globalPaperSimBusyFlag`) → `Map<'paper'|'live', Manager>`. Verified blast radius = **15 sites across 8 files**, and the access is split between the canonical accessor and scattered raw `(global as any)` reads/writes. Two of the writer/reader files are exactly the **dormant `intent-executor.ts` / `state-awareness.ts`** subsystem we carved out to **#297** (the never-initialized `global.tradingEngines` investigation):

```
paper-sim-service.ts        decl :247, getGlobalPaperSimManager :256, setGlobalPaperSimManager :260,
                            clearGlobalPaperSimManager :265, plus :1059/1110-1128 (stale-clear)
routes.ts                   :5742-5746 (init guard), :11236/11240/11273 (lock clear), :11705 (hasUISimulation),
                            :12648/12686/12704 (manager read for UI endpoints)
paper-trading-stop.ts       :44/47        operation-queue.ts :319/321        paper-session-reset.ts :295-297
intent-executor.ts (#297)   :201/203/211 (write), :258/260/264/268 (write), :497   ← DORMANT/broken
state-awareness.ts (#297)   :307-312 (read isRunning)                                ← DORMANT
```

Confirmed dormant: `intent-executor.ts:208` does `new PaperPortfolioManager(userId)` — userId passed where the `(mode, userId?)` constructor wants `mode` (the stale wrong-arg you noted); and its live branch reads the never-initialized `global.tradingEngines.get(userId)` → would throw. So intent-executor cannot run today.

**The design tension:** to make S1 per-mode I want ONE chokepoint — convert the three accessors to be mode-aware (`getGlobalPaperSimManager(mode='paper')` / `setGlobalPaperSimManager(manager, mode='paper')` / `clearGlobalPaperSimManager(mode='paper')`, backing store `Map<mode,Manager>` + per-mode lock map) and route **every** raw `(global as any).globalPaperPortfolioManager` site through them. That is the NO-PATCHES single-source design. But two of those sites live in the #297 dormant files.

**My recommendation:** route the dormant sites through the new mode-aware accessor too, with `mode='paper'` default — a **mechanical, behavior-preserving** swap (they are paper-only and dormant today; calling the accessor instead of touching the global changes nothing at runtime). This is NOT "unwinding the #297 subsystem" (that's still deferred — we don't touch `global.tradingEngines`, the agent-intent bridge, or the wrong-arg call). It just keeps the codebase free of raw direct-global access so there's exactly one source of truth for the per-mode manager. The alternative — leave the dormant sites on the old raw global — forces us to KEEP a second uncoordinated `globalPaperPortfolioManager` slot alongside the new Map = a dual-source we'd be re-introducing on the very batch whose job is to kill split-brain state. I think routing-through is correct; flag if you'd rather I leave the two dormant sites untouched and accept the temporary dual-path until #297.

---

## R2 — S3: with ONE shared Kraken key, the lockout is account-wide → key the limiter by CREDENTIAL, not by mode

This is the one that changes your ratified C3 (`${userId}:${mode}` shared limiter). New evidence from reading the actual rate-limit code + env:

1. **Single API key for everything.** `KrakenService` constructor: `apiKey: apiKey || process.env.KRAKEN_API_KEY`. There is no separate live/paper key anywhere (`KRAKEN_API_KEY` / `KRAKEN_PRIVATE_KEY` only — no `KRAKEN_PAPER_*` / `KRAKEN_LIVE_*`). Paper uses the SAME account (rule 20: paper sends `validate=true` to the real venue on the same key).

2. **The lockout is the venue locking the whole account.** `handleRateLimitError` only trips on `EGeneral:Temporary lockout` — Kraken's **account-level** lockout (per API key), 120s:
```ts
private handleRateLimitError(userId: string, error: any): void {
  if (error.message?.includes('EGeneral:Temporary lockout')) {
    const state = this.getRateLimitState(userId);          // keyed by userId, default 'default'
    state.isLocked = true; state.lockoutUntil = now + 120000;
  }
}
```
3. **Today it's per-INSTANCE, key `'default'`.** Each `new KrakenService()` (36 sites / 30 files) has its OWN `rateLimitStates` Map; the internal methods are called with `userId` that almost always defaults to the literal `'default'`. So today there are ~36 uncoordinated cooldown trackers and the real bug is **fragmentation**, not cross-mode corruption (paper and live are already on separate instances → already "isolated", just uncoordinated within a mode).

**Why mode-keying is the wrong model here:** if we build one shared limiter keyed `${userId}:${mode}` while both modes share ONE Kraken key, then when the venue account-locks us, only the mode that hit it records the cooldown — the OTHER mode keeps hammering the same locked account → **deepens the real lockout**. A real account lockout SHOULD freeze both modes, because it's one account.

**My recommendation:** build ONE shared module-level limiter keyed by the **credential/account identity** (effectively `userId` today, since single-tenant single-key), NOT by mode. This:
- is correct **today** (one key → one shared account lockout, both modes respect it),
- is **forward-compatible**: when/if paper gets its own Kraken test-env credential (the open #227 item), the key differs and the limiters auto-separate — no mode logic needed,
- fixes the actual bug (fragmentation → one coordinated tracker for the ~12 active-pipeline sites; rest → #296),
- and still satisfies the Phase-21 precondition (paper+live co-run can't corrupt each other's lockout, because there's nothing mode-specific to corrupt — the shared account state is shared on purpose).

So I'd drop `mode` from the S3 key and key by account/credential. **Do you concur, or is there a reason you want mode in the S3 key that I'm missing** (e.g. you're assuming Phase-21 gives paper a separate Kraken account, in which case credential-keying already covers it)?

---

## R3 — FYI, no decision needed: S4 mode-threading is clean

`getScalingFactor()`/`isCorrelatedExposure()`/`updatePositionWeights()` need a `mode` arg for the `Map<mode,Map<symbol,…>>` conversion. Verified the 3 production callers all have mode in scope: `trade-safety.ts:804` (its `mode` param), `paper-execution-engine.ts:405/2734` (`this.mode`), `signal-orchestrator.ts:493` (orchestrator mode). `paper-position-sizing.ts:194` (`getScalingFactor`) has no mode today → I add `mode` to `PaperPositionSizingParams` and thread it from the 2 sizing callers (both have mode). Test callers updated. Covariance engine (S2) stays SHARED per your C1. Implementing as ratified.

---

**Ask:** your call on **R1** (route dormant #297 sites through the mode-aware accessor, behavior-preserved? — my rec yes) and **R2** (key the Kraken limiter by credential/account, not mode? — my rec yes). I'm building liveness (H1/H2) + S4 now; I'll do S1 (pending R1) and S3 (pending R2) on your reply. Step-4 diff review per chunk as usual.
