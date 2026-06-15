# P19-B4b — Pre-Audit + D1 Split-Brain Audit (read-only)

**Batch:** P19-B4b (= D1 split-brain audit + D5 per-mode isolation) · **Date:** 2026-06-15 · **Author:** Claude New (CC-B) · **Step:** 2 (Pre-Implementation Audit) + the D1 read-only audit deliverable.
**Status:** _pending Langston Step-2 review._ Langston Step-1 = APPROVE-WITH-CONDITIONS (decomposition B4b = D1+D5, B4b.1 = D2+D3+D4 ratified). "Send me D1 first."
**Gate purpose:** This audit is the hard precondition for Phase-21 (paper + live co-run). A missed split-brain singleton = one mode's positions/exposure/lockouts corrupting the other's. Read-only; no files edited.

---

## 0. Scope of this document

B4b = **D1** (this read-only split-brain audit + the liveness-consolidation + isolation DESIGN) + **D5** (the implementation of that design). Per the workflow this doc is both the **Step-2 pre-audit** (SIM consultation + blast-radius + boundary decision) and the **D1 audit deliverable** (the enumerated classification + isolation design Langston reviews at Step-4). D5 implements §4 + §5 below. The depth-fidelity work (D2/D3/D4) is **B4b.1**, depth-feed-gated (boundary confirmed in §6).

---

## 1. Method

Read-only code audit (path:line evidence) across the active-trading pipeline + `SYSTEM_IMPACT_MAP.md` consultation. Scanned for every mutable process-global / module-singleton / static field the pipeline touches; classified each **PER-MODE-SAFE** vs **SPLIT-BRAIN-RISK**; designed keyed (NOT cloned) isolation honoring the §8-#11 anti-backpressure rule (no 2× compute — smarter keying, never engine cloning).

---

## 2. Shared-singleton inventory (D1 core)

| # | Singleton · file:line | State | Keying today | Class | Isolation (keyed, not cloned) |
|---|---|---|---|---|---|
| **S1** | `global.globalPaperPortfolioManager` · `paper-sim-service.ts:247,256-267` | active manager; holds **MAX_OPEN_POSITIONS / MAX_PORTFOLIO_EXPOSURE_PERCENT / MAX_DRAWDOWN** (`paper-portfolio-manager.ts:57-59`) | **global (one slot)** | 🔴 **WORST** | `Map<'paper'\|'live', Manager>`. Manager already carries `this.mode` + reads positions per-mode → key the holder, no compute dup. |
| **S2** | `covarianceEngine` · `utils/covariance-engine.ts:313` (`returnHistory: Map<symbol,number[]>` :40) | rolling return history → covariance/correlation | **symbol only** | 🔴 RISK | `Map<mode, Map<symbol,…>>`. Pools overlap heavily → only the union recomputes, not 2×. |
| S2-note | pool→engine path · `paper-execution-engine.ts:382-402` | reads pool by mode, writes engine by symbol | mode-in/symbol-out | 🔴 contributing | the exact "union of pools" leak; fixed at S2. |
| **S3** | `KrakenService.rateLimitStates` · `exchanges/kraken/kraken.ts:75,105-135` (`Map<userId,…>`) | 120s REST lockout state | **userId** (per-instance; `new KrakenService()` at 30+ sites) | 🟠 RISK (also **O-2**) | single shared limiter keyed `${userId}:${mode}`, built ONCE in D5, consumed by both lanes (Langston C3). A live lockout must never freeze paper. |
| **S4** | `riskConcentrationAnalyzer` · `risk-concentration.ts:377` (`positionWeights`/`concentrationScores: Map<symbol,…>`) | per-symbol weights + concentration | **symbol only** | 🔴 RISK | `Map<mode, Map<symbol,…>>`. Different open positions per mode → symbol-only cross-contaminates. |
| **S6** | RTB `signalRefreshStates` · `ready_to_buy_service.ts:360,505-516` (`Map<signalId,…>`) | per-signal refresh latch | **signalId** | 🟡 RISK (low, conditional) | safe IFF signalId is globally unique across modes (verify in D5); else key `${mode}:${signalId}`. Other RTB maps already `Map<mode,…>` (safe). |
| **S8** | `tcl_watchdog` `currentPoolSize` · `tcl_watchdog.ts:31-35` (module `let`) | last pool size from bus | **global scalar** | 🟡 RISK (minor) | `Map<mode,number>` if pool bus is mode-tagged; advisory only. |
| **S13** | `vtsModeAudit.currentState.tradingActive` · `vts-mode-audit.ts:76-80,115-156` | single "trading active" bool | **global bool** | 🟠 RISK (= **liveness reader #4**) | derive per-mode (see §3). |
| **PER-MODE-SAFE (already keyed — listed so omission ≠ missed sweep):** | | | | | |
| S5 | `restRateLimiter` · `market-data/rest-rate-limiter.ts` | market-data fetch throttle | symbol/endpoint | 🟢 SAFE | feed, not trade-state; intentionally shared (both modes mark off same prices). |
| S7 | `tclWatchdog.states` · `tcl_watchdog.ts:53-54` | TCL state | **mode** | 🟢 SAFE | reference pattern. |
| S9 | `activeFilterPool` · `active-filter-pool.ts:59-79` | active symbol pools | explicit paper/live | 🟢 SAFE | already separated. |
| S10 | `ModeRegistry` engine/micro maps · `mode-registry.ts:36-88` | engine + micro instances | **mode** | 🟢 SAFE | canonical registry. |
| S11 | `globalLiveEngine`/`globalPaperEngine` · `routes.ts:102-103` | TradingEngine per mode | **mode** | 🟢 SAFE | |
| S12 | `MicroExecutionService.symbolCooldowns` · `micro-execution-service.ts:47` | micro cooldown | symbol (service per-mode-instanced; live disabled) | 🟢 SAFE today | safe because instance is mode-scoped. |
| S14 | `UnifiedPriceCache` · `price-cache.ts:447` | price cache | symbol | 🟢 SAFE | feed, intentionally shared. |

---

## 3. Liveness readers — there are FOUR, not three (advances #214)

The system has multiple independent answers to "is (paper|live) active right now?":

- **(a) DB flag** `getSystemContext(mode).isEngineActive` — the authoritative gate B4a already uses (`active-dispatch.ts`; SIM §2949). Written **async via `setTimeout(…,0)`** in `setEngineActive` (`trading-state-sync.ts:271-293`) — **this deferred write is the divergence root cause:** the DB trails the instant broadcast by a tick.
- **(b) engine/orchestrator presence** `getEngine(mode)!==null` / `getOrchestratorByMode(mode)!==null` (`mode-registry.ts:71`, `paper-sim-service.ts:290`) — can say "running" while the DB flag says "stopped" (or vice-versa); `resetStaleEngineFlagsOnStartup` reconciles only at boot.
- **(c) `tradingStateSync.currentMode` cache** (`trading-state-sync.ts:25,143-145`) — per-user mode cache read as a liveness proxy; can lag.
- **(d) `vtsModeAudit.tradingActive`** (`vts-mode-audit.ts:76-126`) — fed from the cluster-bus broadcast (fires before the DB write); if a broadcast drops, it sticks indefinitely (no reconciliation loop touches it).

Plus the SIM's own overlapping list (§2882, #214): `getGlobalSession()` (`routes.ts:5774`, correct) and legacy **`global.tradingEngines`**. **⚠️ CORRECTION 2026-06-15 (verify-before-cut, D5 chunk-1 entry):** the D1 subagent's "DEAD / zero non-test writers" claim was **WRONG**. Direct grep shows `global.tradingEngines` is referenced by **five live files** — `intent-executor.ts:233,239,281,463,476` (incl. unguarded `.set()` writers), `health-monitor.ts:444` (wired at boot, `index.ts:1434`), `context-refresh-coordinator.ts:198,304`, `state-awareness.ts:317`, `routes.ts:4059` (live-mode force-stop branch) — AND it is **NEVER initialized anywhere** (broad assignment grep empty). So it is a *vestigial never-initialized global* (always `undefined`; most readers guard via `if(!x)`/`?.`, but `intent-executor.ts:239` + `routes.ts:4059` are unguarded latent-throws if those dormant paths ever run). It is **NOT a clean zero-writer deletion** — removal requires unwinding the whole dormant "live-engine / agent-intent" subsystem (intent-executor, state-awareness, the `server/agent/bridge` layer). **RE-DISPOSITION (rule 18 — schedule, don't cut on the spot): REMOVED from D5; homed as RUNNING_ISSUES #297** (investigate agent-subsystem liveness → then remove the global + all references together).

**Consolidation design (D5):** SSOT = the **DB `system_context.isEngineActive` per mode**. (1) make the write **synchronous-before-broadcast** (kill the `setTimeout(…,0)` deferral — the root gap); (2) demote (b)/(c)/(d) to derived/reconciliation-only (presence becomes a *health assertion*, not a truth source); (3) add a per-mode **divergence INVARIANT-CHECK** in the existing 30s reconciliation guard: assert DB-flag == engine-presence == orchestrator-presence == vtsAudit-active; any mismatch → `LIVENESS_SPLIT` counter + alert (B3b observable-counter discipline). This invariant is the witness Phase-21 needs: if it trips during a co-run dry-run, the flip is blocked. **Delete dead `global.tradingEngines` in the same pass.**

---

## 4. SIM consultation (Step-2 mandatory) — 4 governance gaps surfaced

`SYSTEM_IMPACT_MAP.md` is **strong on the liveness axis, silent on the state-singleton axis:**
- ✅ **Liveness split DOCUMENTED** — §2882 (#214 "three globals answer 'is paper running'… consolidate to ONE, Phase-19 prep") + §2949 (B4a's gate-on-`isEngineActive`-not-presence rule). This audit extends #214 from 3 → 4+ readers and names the deferred-write root cause.
- 🚩 **SIM SILENT (gap 1):** `covarianceEngine` (S2) as a mode-blind singleton.
- 🚩 **SIM SILENT (gap 2):** `riskConcentrationAnalyzer` (S4) as a mode-blind singleton.
- 🚩 **SIM SILENT (gap 3):** `globalPaperPortfolioManager` as the **holder of portfolio-heat/exposure ceilings** (S1) — the SIM lists it only as a liveness liar, not as the worst state-leak.
- 🚩 **SIM SILENT (gap 4):** Kraken `rateLimitStates` (S3) userId-keyed limiter as a split-brain item.

These 4 silences are **governance findings to fold into the SIM during D5** (§9 SIM discipline). Homed in §5.

---

## 5. Isolation design summary + issue homing (for D5)

Ranked worst→least (all keyed-not-cloned):

| Rank | Item | Exact change | Home |
|---|---|---|---|
| 1 | **S1 portfolio-manager / heat** | global slot → `Map<'paper'\|'live', Manager>` (heat ceilings live in the manager → one slot = cross-mode budget leak) | D5 |
| 2 | **RTB cooldown/refresh (S6) + liveness gate** | verify signalId uniqueness; DB-flag SSOT + invariant-check (Langston: RTB cooldown = worst leak) | D5 + #214 |
| 3 | **S3 Kraken limiter / O-2 paper lane** | one shared limiter `${userId}:${mode}`, built once, both lanes consume (Langston C3) | D5 |
| 4 | **S2 covarianceEngine** | `Map<mode, Map<symbol,…>>`, recompute union only | D5 |
| 5 | **S4 riskConcentrationAnalyzer** | `Map<mode, Map<symbol,…>>` | D5 |
| 6 | **S13 vtsAudit / S8 poolSize** | per-mode-derived bool / `Map<mode,number>` | D5 |

**Issue homing (§9.4 — every surfaced item gets a concrete home NOW):**
- **#214** (liveness consolidation) — advanced by this audit; the D5 SSOT + invariant-check + dead-`global.tradingEngines` deletion is its closure work.
- **4 SIM gaps (S1-heat, S2, S3, S4)** — fold into SIM at D5 governance (tracked in this pre-audit; no separate issue number needed — they close when D5's SIM update lands).
- **Dead `global.tradingEngines`** — rule-18 removal candidate; **HOME = D5** (delete during liveness consolidation, full blast-radius verify + DELETED_COMPONENTS_LOG).
- **Co-run gate (Langston C6/O5)** — numbered hard-blocker into PHASE_19_PLAN §5 + POST_AUDIT_ROADMAP Phase-21 at D5/B4b governance.

---

## 6. B4b/B4b.1 boundary decision (resolves O1)

**Confirmed: D2+D3+D4 → B4b.1 (the depth-walk substrate is partly net-new).** Evidence:
- **xStock depth today = top-of-book USD scalar, not a walkable ladder.** `xstock_spot/scanner.ts:660-690` builds `{askDepthUsd,bidDepthUsd}` per symbol from a ~20-min median of *top-of-book* `price×qty`; `imf-liquidity.ts:52-59` reduces it to one log-scaled number; migration `2026-05-30-b-1-5-xstock-depth-liquidity.sql` gates on `min_depth_usd`. **One level — not the multi-level ladder D3 needs.**
- **Crypto HAS an L2 book structure already, underused.** `kraken-websocket-adapter.ts:129` declares `orderBooks = Map<symbol,{bids:Map<number,number>,asks:Map<number,number>}>` with a full `book` snapshot/update handler (`:450-451,688-722`) + subscription path (`:1112`). So the crypto ladder transport + book-maintenance **exists**; what's net-new is (a) turning on the `book` subscription for the active set (today crypto is ticker-only) and (b) a depth-walk consumer reading `orderBooks` for tiered slippage + partial fills.

**O1 answer (matches Langston):** the reusable contract is the **`{askDepthUsd,bidDepthUsd}` top-of-book interface**; the depth-WALK is deeper than either class exposes today (xStock top-of-book-only; crypto ladder Map unwired into fills). So **D1+D5 (this audit + isolation, zero feed dependency) ship as B4b — the Phase-21 precondition; D2+D3+D4 → B4b.1** (a crypto `book`-channel consumer on top of a reusable top-of-book interface — not pure interface reuse).

---

## 7. Uncertainties (flagged, not guessed — resolve in D5)

- **S6 signalId cross-mode uniqueness** — appears DB-row-derived (`ready_to_buy_service.ts:1464`); D5 must confirm before deciding if `signalRefreshStates` needs a `${mode}:` prefix. If unique → S6 downgrades to PER-MODE-SAFE.
- **S3 shared-vs-ad-hoc Kraken instances** — `new KrakenService()` at 30+ sites means the limiter map is per-instance and *not shared today* (a separate correctness gap: a lockout learned on one instance is invisible to the next). Classified RISK on the forward-looking O-2 shared-limiter design; Langston to confirm O-2 is a NEW shared limiter, not 30 more ad-hoc instances.

---

## 8. Ask (Langston Step-2)

PROCEED on D1 (this audit) → D5 (the isolation implementation per §5), confirming: (1) the SSOT-on-DB-flag + synchronous-write + invariant-check liveness design; (2) the 6-item keyed-isolation table; (3) deleting dead `global.tradingEngines` in D5 under rule-18; (4) the B4b/B4b.1 boundary (§6). Flag any singleton this audit missed.

---

## 9. Langston Step-2 verdict + resolutions (2026-06-15) — PROCEED-WITH-CONDITIONS (all resolved)

Langston: **PROCEED on D1→D5**, 3 of 4 asks confirmed outright, with the resolutions below (review at `P19_B4b_STEP2_LANGSTON_REVIEW.md`). All flagged items are now resolved by read-only code checks — D1 audit is FINAL.

**Liveness SSOT — CONFIRMED + 2 hardening conditions (fold into D5):**
- **H1 — broadcast ordered ON COMMIT, not on call.** The broadcast fires only as a `.then()` of the *resolved* DB write; if the write throws, the broadcast must NOT fire. (A synchronous-but-unawaited write reintroduces the race with a smaller window.)
- **H2 — settling guard on the invariant-check.** Add a transition-in-progress flag / "no flip within last N s" suppressor before incrementing `LIVENESS_SPLIT`, so legitimate in-flight start/stop transitions straddling a tick don't false-positive (otherwise Phase-21's co-run gate is untrustworthy on its first real start/stop).

**C1 — S2 covarianceEngine RECLASSIFIED → PER-MODE-SAFE (Langston catch, confirmed in code).** `covariance-engine.ts:74` `updateFromPrices(symbol, prices)` → `calculateReturns(prices)` (`:76`) → stores **price-derived MARKET returns** in `returnHistory: Map<symbol, number[]>`. Market returns are **mode-invariant** (both modes observe identical prices per symbol), so the return history + pairwise covariance matrix is shared-safe like S5/S14. **Keying it `Map<mode,…>` would duplicate return-history + pairwise compute for every overlapping symbol = the exact 2× engine-dup the §8-#11 anti-backpressure rule forbids.** → **S2 (and S2-note) DROP from the isolation list; leave SHARED.** The only mode-specific part is the *portfolio-weighted* query, which already lives per-mode in S4. **Isolation list shrinks 6 → 5.**

**M1 — daily-loss / kill-switch: NOT a module-level global (resolved).** Kill-switch is DB-backed: threshold = the per-mode guardrail `dailyLossKillSwitchPct` (read + logged separately for paper vs live, `index.ts:1154/1158`); events = the `killSwitchEvents` DB table (`storage.ts:2136`). No module-level in-memory daily-loss accumulator exists → Langston's highest-consequence worry (live losses tripping the paper kill-switch via a shared counter) does not materialize. **Residual D5 verify (low):** confirm the trip computation (`storage.ts:905 isKillSwitchTripped`) reads per-mode P&L and that `killSwitchEvents` userId-keying doesn't conflate modes. Not a new split-brain global.

**M2 — trade-identity / dedup / clustering registry: NO separate global (resolved).** No module-level dedup/clustering Map exists outside the audited items. Dedup = the DB-backed, mode-separated RTB mechanism `(symbol, strategy, createdAt)` (S6); recently-traded lookups = per-mode storage (`getRecentTrades`); exposure-stacking + symbol-clustering prevention live in the per-mode manager (S1) + risk-concentration (S4) + the per-mode-instanced `symbolCooldowns` (S12). All already audited per-mode. **No new item.**

**S3 / O-2 blast-radius — REAL, homed separately (Langston note).** `new KrakenService()` appears at **35 non-test call-sites across ~29 files** (most are scripts/diagnostics; the active-pipeline subset that co-runs paper+live is ~12: paper-execution-engine, paper-portfolio-manager, paper-sim-service, signal-orchestrator, trading-engine, fx5-scanner, price-cache, ohlc-cache, risk-concentration, trading-state-sync, unified-filter-gateway, cost-metrics). **DECISION:** D5 builds the ONE shared `${userId}:${mode}` limiter + migrates the **active-pipeline subset** (the only sites that can co-run and corrupt each other's lockout). The full 35-site consolidation (incl. scripts/diagnostics that never co-run) is homed as **RUNNING_ISSUES #296** so the residual isn't read as covered. This keeps D5 scoped to the split-brain-relevant sites.

**~~Dead `global.tradingEngines` deletion~~ — REVERSED on verify-before-cut (see §3 correction).** Langston's Step-2 confirmed the deletion based on the audit's "zero writers" claim, which direct grep falsified (5 live referencing files incl. unguarded writers; never-initialized vestigial global). **Removed from D5; homed RUNNING_ISSUES #297** (agent-subsystem liveness investigation first). This is a record-correction back to Langston — the deletion does NOT proceed in D5.

**B4b/B4b.1 boundary — CONFIRMED** (§6 stands).

### FINAL D5 isolation list (post-resolution) — 5 items, not 6
1. **S1** portfolio-manager/heat → `Map<'paper'|'live', Manager>` (worst leak; holds heat ceilings).
2. **Liveness** → DB `isEngineActive` SSOT + commit-ordered broadcast (H1) + settling-guarded invariant-check (H2). **(`global.tradingEngines` deletion REMOVED — not dead; → #297 investigation.)**
3. **S3** → ONE shared `${userId}:${mode}` Kraken limiter, migrate the ~12 active-pipeline sites (rest → #296).
4. **S4** riskConcentrationAnalyzer → `Map<mode, Map<symbol,…>>` (position-weighted, genuinely mode-specific).
5. **S6/S8/S13** → verify signalId uniqueness (S6); `Map<mode,number>` poolSize (S8); per-mode-derive vtsAudit.tradingActive (S13).
   - **~~S2 covarianceEngine~~ — DROPPED (shared-safe; keying would violate anti-backpressure).**

Plus: 4 SIM governance-gap additions (S1-heat, S2-now-documented-as-safe, S3, S4) at D5 governance.
