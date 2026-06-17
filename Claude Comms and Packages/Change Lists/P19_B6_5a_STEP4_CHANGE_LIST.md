# P19-B6.5a Step-4 Change List — Per-Asset-Class Active Gate (for Langston code review)

> **Batch:** P19-B6.5a · **Local commit (NOT pushed — awaiting your APPROVE):** see `P19_B6_5a_STEP4_full.diff` (staged alongside this file).
> **Bench:** tsc-baseline NO-regression + **47 targeted tests green** (11 new B6.5a + the 2 corrected C2/C3 + b70-run-mode + b5a-reject + item4-switch-cleave). DORMANT (both classes default OFF).
> **INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git on the gdrive mount. Read the staged files in `/home/langston/inbox/P19-B6.5/` directly; use `ssh staging` for any repo inspection.**

Implements your Step-2 PROCEED rulings: Q-A=JSONB on `system_context`; Q-B=entry-only (RTB defense-in-depth → #320/B6.5b); Q-C=setter on `trading-state-sync` mirroring `setEngineActive` H1; Q-D=per-class witness reusing LIVENESS_SPLIT; Q-E=both classes default OFF.

---

## 1. Migration (additive, fail-closed) — `2026-06-17-p19-b6-5a-per-class-active-gate.sql`
```sql
ALTER TABLE system_context
  ADD COLUMN IF NOT EXISTS active_asset_classes jsonb NOT NULL DEFAULT '{}'::jsonb;
```
Rollback drops the column. Registered in MANIFEST (forward only). `schema.ts`: `activeAssetClasses: jsonb("active_asset_classes").notNull().default(sql\`'{}'\`)` after `isEngineActive`.

## 2. The single typed gate read (pure, fail-closed) — `trading-state-sync.ts`
```ts
export function isAssetClassActiveInContext(context: SystemContext | undefined, assetClass: AssetClass): boolean {
  const map = (context?.activeAssetClasses ?? {}) as Record<string, unknown>;
  return map[assetClass] === true;   // missing ctx / missing key / non-true → FALSE
}
```
The two active-path gates call this with the SystemContext they already hold (no extra query, no raw JSONB at the call site). The async `isAssetClassActive(mode,class)` method delegates to it (try/catch → fail-closed FALSE on read error).

## 3. Setter — H1 write-then-broadcast (mirrors setEngineActive) — `trading-state-sync.ts`
```ts
async setAssetClassActive(userId, mode, assetClass, isActive): Promise<void> {
  const context = await storage.getSystemContext(mode);
  const current = { ...((context?.activeAssetClasses ?? {}) as Record<string, boolean>) };
  current[assetClass] = isActive;                       // read-merge-write: never clobbers siblings
  await storage.updateSystemContext(mode, { activeAssetClasses: current, updatedAt: new Date() }); // DB FIRST (awaited)
  try { /* contextBridge.broadcast(...) */ } catch { /* state already committed → don't fail the flip */ }
}
```
+ `recordAssetClassGateDecision(mode,class,allowed)` / `getAssetClassGateStats()` (per-class allow/skip witness) + `witnessAssetClassEmissionWhileInactive(mode,class)` → `recordLivenessSplit('asset-class-gate:…')` (Q-D hard witness).

## 4. Gate at the two class ENTRY points
**Crypto — `fx5-scanner.ts` (after activeMode is resolved, contexts in hand):**
```ts
if (tradingActive) {
  const activeCtx = activeMode === 'live' ? liveContext : paperContext;
  const cryptoActive = isAssetClassActiveInContext(activeCtx, 'crypto_spot');
  tradingStateSync.recordAssetClassGateDecision(activeMode, 'crypto_spot', cryptoActive);
  if (!cryptoActive) tradingActive = false;   // → falls to PASSIVE/VTS scan (same as engine-off)
}
```
**xStock — `active-dispatch.ts` (right after the master isEngineActive check):**
```ts
const xstockActive = isAssetClassActiveInContext(paperCtx, 'xstock_spot');
tradingStateSync.recordAssetClassGateDecision('paper', 'xstock_spot', xstockActive);
if (!xstockActive) { _classDormantSkips++; return; }   // master ON but class OFF = expected pre-B7b
```
`classDormantSkips` added to `getXstockActiveDispatchStats()`.

## 5. RTB upstream-guarantee comments (Q-B / #320) — `ready_to_buy_service.ts:~593, ~792`
Comment-only at both engine-active checks: per-class gating is enforced upstream; the B6.5b audit must PROVE no signal reaches the queue past the entries, else RTB per-signal enforcement goes in.

## 6. Tests — `p19-b6-5a-per-class-active-gate.test.ts` (11) + 2 corrected
- 7 pure fail-closed cases (undefined ctx, empty map, missing column, present-true, **cross-class isolation**, explicit-false, non-boolean-truthy).
- accessor+setter round-trip (flip without clobbering the sibling).
- **xStock-ISOLATION acceptance (gate 10):** master ON + crypto active + xStock INACTIVE → xStock dispatch takes the class-dormant branch, `classDormantSkips++`, `dispatched` unchanged, orchestrator NEVER reached. Plus master-OFF (master branch, not class branch) + xStock-active (passes the gate) cases.
- The 2 existing C2/C3 mocks gained `activeAssetClasses: { xstock_spot: true }` (the new gate runs before their post-gate assertions — without it they fail-close, which is the correct new behavior).

---

## QUESTIONS FOR YOU
1. **Q-D witness shape** — I implemented per-class as: a gate-decision allow/skip counter (`getAssetClassGateStats`, the observable xStock-silence proof) PLUS a `witnessAssetClassEmissionWhileInactive` that records a real `LIVENESS_SPLIT` for the hard breach case. I did NOT wedge a per-class arm into `checkLivenessInvariants` (H2) since the entry gate prevents emission-while-off by construction (so H2 has nothing to compare). Acceptable, or do you want it folded into the 30s H2 invariant sweep?
2. **Setter broadcast** — I send a lightweight `trading_state_changed` with an `assetClassGate` payload after the DB commit. The gates re-read the DB SSOT each cycle (don't depend on the broadcast), so the broadcast is advisory. OK, or drop it to avoid a payload-shape addition?
3. Anything else before I push to CI + deploy.
