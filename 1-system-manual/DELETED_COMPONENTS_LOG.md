# DELETED COMPONENTS LOG

> **Tier-2 governance (Kyle directive 2026-06-13).** When legacy code is removed, it is recorded here — never left stubbed/commented/deprecated/lingering in the live tree. Each entry: what was removed, why, the blast-radius verification that proved it safe, the archive copy path, and the removal commit. Archived copies live under `1-system-manual/_archive/deleted-code/` with a `.removed` suffix (non-compilable). The git history is the authoritative full archive; the `_archive` copy is for quick browsing.
>
> **Why this exists:** lingering legacy code creates confusion and the risk that dead paths accidentally re-enter the live system. See CLAUDE.md §5 rule 18 (legacy-removal policy, 2026-06-13 strengthening).

---

## 2026-06-13 — Legacy live-trading STUB cluster (P19-B2)

**Removed:** the pre-cleave `LiveTradingService` stub and its orphaned surface.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `live-trading-service.ts` | `server/services/live-trading-service.ts` | Phase 22.3 / Phase 41F stub. On "activate" it built a **fake placeholder object** `{ userId, mode:'live', isRunning:true }` — no Kraken, no TEC, no execution. Its own comments: *"Initialize trading engine (placeholder for now)… In production this would initialize the actual TradingEngine."* Also emitted a misleading "live trading active" broadcast off the do-nothing object (operator-integrity hazard). |
| 4 legacy routes | `server/routes.ts` `/live-trading/{start,stop,status,approve}` | Orphaned HTTP endpoints wiring to the stub. **No client/server caller** (verified). |
| Dead approval branch | `server/routes.ts` `if (approval.action === 'start_live_trading')` | Imported the stub's `activateLiveTrading`. The `start_live_trading` approval action is **never emitted anywhere** in the live tree (verified — appears only as a permission-type string and in an old context doc). |
| Test-harness scenario | `server/services/auto_test_harness.ts` | `createLiveTradingScenario()` + its registration + the `./live-trading-service` imports. Exercised the stub only. |

**Why removed:** legacy userId-coupled stub predating the June-10 three-way (VTS/paper/live) cleave; contradicts the mode-based architecture; carried an active false-"live-ON" broadcast bug. Kyle directive 2026-06-13: delete now, do not leave lingering.

**Blast-radius verification (certainty-before-cutting):**
- The **modern** live-start path (the Phase-21-gated engine start, `routes.ts` 409 `LIVE_ENGINE_PHASE21_GATED`) does **NOT** use this file — it is untouched.
- The client UI "Confirm & Start Live Trading" button (`top-bar.tsx` → `useTrading().startTrading({type:'live'})`) routes to the **modern gated path**, NOT the legacy `/live-trading/*` routes — UI unaffected.
- `start_live_trading` approval action has **no emitter** in the live tree — the approval branch was dead.
- `auto_test_harness` keeps its other scenarios (paper-sim start/stop, heartbeat); only the live-trading scenario was removed.
- **Left intentionally (forward-looking Phase-21 permission taxonomy — NOT dead executable code; do not mistake for a missed sweep when grepping `start_live_trading`):** `client/src/hooks/useUserRole.ts` permission-type strings (`start_live_trading`/`stop_live_trading`); `shared/schema.ts:181` (`"startLiveTrading": true` default-permission flag); `server/config/permissions.ts:202` (`'start_live_trading': 'trade_live'` permission→capability mapping — Langston Step-4 catch). All three are the permission MODEL Phase-21 live will use, independent of which file implements live.

**Archive copy:** `1-system-manual/_archive/deleted-code/live-trading-service.ts.20260613-P19B2.removed`
**Removal commit:** _(recorded at P19-B2 close)_
**Reviewed by:** Langston (Step-4 diff review) — _pending_
