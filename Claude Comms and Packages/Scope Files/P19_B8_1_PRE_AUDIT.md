# P19-B8.1 PRE-AUDIT — Step-2 (three mode pages: the trading-UI reorganization)

**Batch:** P19-B8.1 · change-class: architecture · **CC-B, 2026-07-03**
**Scope basis:** `P19_B8_1_SCOPE.md` (Langston Step-1 APPROVED ×2, reconciled; metrics-strip boundary pinned). This pre-audit discharges his two hard gates (endpoint pinning; defect-(d) root cause DETERMINED) + the four Step-1 riders, with live staging evidence.

---

## 1. ★ SCOPE CORRECTION from the consumer re-trace (rider 1 — the re-trace did its job)

**The OBJ-4.1 delete set SHRINKS.** The full trace (agent, file:line evidence) found `pattern-pool-dispatch.ts` is NOT display-only: its export `getPatternPoolGuardrailsForAssetClass()` is consumed by **the SQE** (`core/filters/signal_quality_evaluator.ts:35`) and **`active-position-sizing.ts:33`** — both HOT trading-path callers — plus an orchestrator-cascade integration test. Additionally `active-filter-pool.ts:24` imports the `SourcePool`/`AssetClass` types from `crypto_spot/pattern-pool-filters.ts`, and both per-class `pattern-pool-filters.ts` modules are re-exported through their class `index.ts` barrels.

**CORRECTED delete set (final):**
| Item | Disposition |
|---|---|
| `client/src/components/trading/pattern-scanning.tsx` | DELETE (display tab; sole UI consumer) |
| `/api/pattern-pool` route block (`routes.ts:~13028-13097`) | DELETE (its only consumer is the tab) |
| `pattern-pool-dispatch.ts` | **KEEP — corrected** (SQE + sizing consumers) |
| both `pattern-pool-filters.ts` + barrel exports | KEEP (pattern path + types) |
| `active-filter-pool.ts` type import | KEEP (untouched) |

The route deletion is still justified: the route's ONLY caller is the tab (`pattern-scanning.tsx:59`). The dispatcher stays because trading logic — not the display — depends on it. §15/DELETED_COMPONENTS_LOG entries scoped accordingly.

## 2. Endpoint pinning — the manifest contract (hard gate 1, DISCHARGED)

Verbatim from current code (post-RENAME), per tab component:

| Tab (manifest slot) | Component | Endpoint(s) — verbatim | Family | Mode condition today |
|---|---|---|---|---|
| Open Trades (active) | `active-trades-v2.tsx` | `/api/active-engine/active-trades` (:835) + diagnostics `/api/diagnostics/8.8.5/volume-tiers` (:848), `/api/diagnostics/8.8.5/health` (:862); reset mutation `/api/active-engine/reset` (:803) | active | `enabled: isPaper` (:836/:849/:863) |
| Closed Trades (active) | `trade-history-tab.tsx` | `/api/active-engine/trades/analytics?range=` (:219), `/api/active-engine/trades?…` (:538) | active | paper-implied |
| Ready to Buy | `ready-to-buy-table.tsx` | `/api/trading-signals` (:71) | active (RTB pool) | mode-neutral today — manifest adds explicit mode |
| Shadows | `shadow-trades-tab.tsx` | `/api/shadow-trades/by-cycle?mode={paper\|live}&…` (:96) | shadow layer | mode param ALREADY dual — manifest-ready as-is |
| Open Trades (VTS) | ML page `OpenTradesTable` | `/api/vts/ml/open` (:3546) | VTS | — |
| Closed Trades (VTS) | ML page `ClosedTradesTable` | `/api/vts/ml/closed?days=7` (:3558) | VTS | — |
| Crypto Filter Diagnostics | `FilterDiagnosticsPanel` | `/api/vts/filter-diagnostics` (:3627) | VTS today — see §6 open item | — |
| xStock Filter Diagnostics | `xstocks-tab.tsx` | `/api/xstocks/filter-diagnostics` (:254) + `/api/xstocks/freshness` (:261) | VTS/xstock | — |
| (top-bar, stays) | `top-bar.tsx` | `/api/system/config` (:81), `/api/active-engine/portfolio-summary` (:106, `enabled: currentMode==='paper'` :112), `/api/active-engine/status` (invalidation) | mixed | strip UNTOUCHED this batch |

**Manifest consequence:** the `enabled: isPaper` conditions currently hardwired in components migrate INTO the manifests (the Live manifest points at the same active endpoints but renders dormant states until Phase 21 — the mode axis comes from the manifest, not component-local checks).

## 3. Top-bar leaves-vs-stays (rider 2, DISCHARGED)

**LEAVES this batch:** the trading ON/OFF toggle + LIVE/PAPER mode selector (desktop :698-769 + mobile :610-695), the four mode-specific modals (Live-confirm :919, Stop-live :925, Balance-confirm :931, Simulation-startup :940 — they move WITH the toggle into the Paper page's control block; the Balance-confirm flow itself is UNCHANGED until B8.2), the passive-learning chip (:759-768 — moves to the VTS page header where it honestly belongs).
**STAYS:** menu button, both clock displays (:774-871), **the portfolio metrics strip (:876-916) — pinned boundary, untouched until B8.3**, `/api/system/config` read.

## 4. Defect (d) — ROOT CAUSE DETERMINED (hard gate 2, DISCHARGED — with live staging evidence)

**The error is LIVE, not stale — hypothesis 4 rejected, and all three original hypotheses rejected too.** Evidence chain:
- The default `~/.pm2/logs/*` files are DEAD (out.log last written Apr-3; error.log empty since the Jun-26 truncation) — pm2 logs live at **`/var/log/dawntrader/{out,error}.log`** (pm2 show). (Process-hygiene finding worth its own note — earlier "zero occurrences" greps hit dead files.)
- Real error.log: **6,140 lifetime** "is not warm" lines; **14 SINCE restart#440** (01:22 today); **latest 15:43 UTC today**; and a SECOND module fails identically: `amr_friction_sample` (`[11.4A][MarketIndicators] Error computing global friction`). Emitters: `[B62][MarketIndicators] Global DBS unavailable` (caught + degraded) and `[B79.0a][SCAN_CYCLE_ERROR]` (xstock scanner catch → `diag.lastError`, scanner.ts:1112-1115).
- `dbs_calculation` IS in `PREFETCH_MODULES` (b72-warmup.ts:43) and boot warmup SUCCEEDED (server is up; warmup hard-fails on zero rows). So "stale deployed list / pre-warmup read / wrong module key" are all wrong.

**THE ACTUAL ROOT CAUSE — a delete-then-refetch race in the 60s background refresher** (`module-constants-service.ts`): `prefetchModule()` does `cache.delete(moduleName)` FIRST (:312-313, "bypass TTL") and only re-populates after the async DB read returns. The background refresher re-prefetches EVERY cached module EVERY 60s (:464-475). **Between the delete and the DB read completing, any sync reader of that module finds `!cached` and throws** (:333-335). The window widens with Supabase latency; ~14 hits/14.5h ≈ the expected collision rate for the busiest sync-read modules (dbs_calculation per xstock cycle, amr_friction_sample per MarketIndicators tick). Deterministic, matches every observation (intermittent, multi-module, healthy boot, healthy cycles between hits).

**Fix design (NO-PATCHES, for Step-3):** swap-on-success — `prefetchModule` reads fresh from DB FIRST and atomically REPLACES the cache entry (no delete-first); readers serve the existing (possibly just-expired) entry while a refresh is in flight (stale-while-revalidate; a 60s-stale constant is strictly better than a throw). Blast radius: `module-constants-service.ts` only — every module_constants consumer benefits; no behavior change other than eliminating the throw window. Boot semantics unchanged (first prefetch still hard-fails on zero rows).
**Secondary (the visible symptom):** the scanner's `diag.lastError` is never cleared on subsequent healthy cycles — fix: clear it (or timestamp it) on cycle success so the panel can't show a forever-stale error. Both fixes ride in OBJ-6(d); the three-proof retirement (emitter identified ✓, dated vs restart ✓ — live, not survivor, root-caused ✓) recorded here.
**Rider for the record:** `amr_friction_sample` benefits from the same fix automatically (same race, same seam) — no separate item needed; named so it isn't a surprise in Step-8 logs.

## 5. Defects (a)/(b)/(c) — root-cause paths (from the architectural read, for Step-3)
- **(a)** crypto FD "Trades Opened (24h)": in-memory since-process-start counter (`getVTSEvalRolling24h`, vts.ts:1566 path) — resets on restart, no DB fallback. Fix: DB-backed 24h rolling count from `vts_open_trades` (crypto_spot), mirroring the xStock endpoint's DB pattern. NOT the same root as b/c — Langston's verify-THRICE stands (a is counter-persistence; b/c are unwired accumulators).
- **(b)+(c)** xStock "Family-Qualified (Unique)"=0 + rolling-24h "Pairs Scanned"=0: the eval-cycle lifetime accumulator fields (`familyQualifiedUnique`, `pairsEntered`) never wired (routes.ts:7793/:7816 fallback chains exhaust to 0). One fix in `xstock_spot/eval-cycle.ts` accumulators; two distinct proofs at Step-8.

## 6. SIM/component discipline items
- **"Could this live in an existing component?"** (standing pre-audit check): the ModeTradingPage shell EXTENDS the proven FilterDiagnosticsPanel parameterization pattern — no duplication of an existing mechanism; the manifests REPLACE component-local mode hardwiring (a consolidation, not a parallel path). The shadow tab already takes `mode` as a param — manifest-ready without change.
- **SIM gaps to close in OBJ-7 governance (read finding):** SIM is silent on the ML-page tab structure, FilterDiagnosticsPanel, and the shadow tab — this batch documents the new three-page architecture in SIM (content update, not reorganization).
- **Open item for Step-3 (flagged, small):** `/api/vts/filter-diagnostics` (crypto) vs `/api/xstocks/filter-diagnostics` (xstock) are asymmetric route families; the manifests pin them as-is this batch (no route renames — keeping B8.1 zero-server-API-change except the pattern-pool route deletion and the defect fixes).
- **#404 adjacency:** none — heartbeat untouched (stated per scope rider).

## 7. Blast radius (delta vs scope)
Unchanged from scope EXCEPT: (i) delete set shrinks per §1 (dispatcher/filters stay); (ii) defect-(d) fix lands in `module-constants-service.ts` (shared service — positive-only change eliminating a throw window) + a one-line scanner lastError-lifecycle fix, NOT the b72 boot seam; (iii) the dead-default-pm2-logs finding is recorded (ops hygiene — candidate one-liner for RUNNING_ISSUES if Langston concurs it needs a home).
