# P19-B7.2c Completion Report — Post-promotion PENDING maker-fill lifecycle (paper + VTS) + twins + never-filled records

**Batch:** P19-B7.2c · **change-class: architecture** · **Closed:** 2026-07-02 · **Implementer:** Claude New (CC-B) · **Reviewer:** Langston
**Head:** `b48aef51f` (build) + the governance close commit · **CI:** run `28612927459` all-4-green · **Deploy:** staging restart#432, HTTP 200, `npm run db:migrate` applied
**Scope:** `Scope Files/P19_B7_2c_SCOPE.md` (+ `P19_B7_2c_PRE_AUDIT.md`) · **Step-4 artifact:** `Langston Design Asks/P19_B7_2c_STEP4_FULL.diff` (1428 lines, 17 files, +784/−29)

---

## PREVIOUSLY-STATED-VS-NOW (§9.2)

- **PREVIOUSLY STATED:** timeout = TIERED diminishing-returns → convert-to-taker-if-[11.8B]-positive else drop (the #412 original model). **NOW:** timeout = **DROPPED, period — no convert re-evaluation.** REASON: Kyle simplification 2026-07-02 ("if it times out, it's dropped — that's the right way to handle that"); Langston independently showed the convert valve is provably near-vacuous ~1h after generation.
- **PREVIOUSLY STATED:** 3 EV-snapshot columns on the pending row (for the convert re-check). **NOW:** CUT — zero columns; the marketable-at-placement fallback reads the STORED gen-time `taker_net_ev` (no kernel re-run). REASON: no convert = no re-check to snapshot for.
- **PREVIOUSLY STATED (Step-4 dispatch):** vitest 2133 pass / 9 failed files. **NOW:** same at close (the one interim "4 failed" run was a flake — clean on rerun; the 9 failed FILES are the known pre-existing no-DB-on-bench pg-pool collection errors, proven on base at B7.2b).

## Kyle decisions locked in this batch

1. Timeout = dropped, period (no convert).
2. Marketable-at-placement → stored gen-time taker-check ("fires off on the taker… I'm okay with that functionality in plumbing being put in").
3. VTS twins ("open both maker and taker in the VTS… learning from all the data") + "chosen / not chosen" shown under the fee mode in open+closed tables.
4. Never-filled trades SHOW in the closed records ("here was a trade that was open. It never actually traded.") — implemented visible-≠-counted.
5. Timeout realistic at ~1h (`maker_max_pending_ms` = 3,600,000 both classes).

## Objectives — verification

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Maker-chosen promotion opens PENDING holding a slot; fills ONLY on honest side-aware trade-through; taker-chosen fills immediately | **YES** | Shared pure `server/core/trading/pending-maker-logic.ts` (both engines import — parity by construction); paper placement bifurcation + `_processPendingMaker` pre-pass (pending SKIPS TEC eval); VTS `buildVirtualTrade` bifurcation + resolve pre-pass; 11 unit tests (`p19-b7-2c-pending-maker.test.ts`) incl. side-aware fill, R2 fill-wins, null/zero-price-never-fills |
| 2 | Hard timeout = DROPPED, no convert | **YES** | `evaluatePendingMaker` outcome union = `fill\|drop\|rest` (no convert member — test-pinned); `maker_max_pending_ms` seeded 3.6M ms both classes (Langston verified in Supabase) |
| 3 | Marketable-at-placement → stored-taker check | **YES** | `isMarketableAtPlacement` → paper reads `signal.takerNetEv` (verbatim row carry, zero recompute) / VTS reads `_vtsMtDecision.takerNetEV`; negative → `MAKER_MARKETABLE_DROPPED` (new OpenFailStage) / `maker_marketable_dropped` (VTS null-reason) |
| 4 | VTS twins, integrity-fenced | **YES** | Typed `mtTwin`/`mtPairId` (context-carried, rehydrate-surviving — Langston verified the context spread); slot cap counts non-twins only; per-underlying gate skips twins; close cascade short-circuits → `persistTwinClosedRecord` (JSON-only, `countsInAggregates=false`, `fillRateCaveat='trade_through_floor'`); `twin_enabled` numeric kill-knob; degenerate twins skipped |
| 5 | Never-filled visible-≠-counted (both stores, both UIs) | **YES** | Typed discriminators (paper `closeReason='never_filled'`, VTS `resultType='never_filled'`); VISIBLE in paper Trade History + ML Closed ("Never filled — dropped" badges); EXCLUDED from win-rate/expectancy/ML; COUNTED in the fill-rate denominator; **paper exclusion enforced at the storage chokepoint** (default SQL `IS DISTINCT FROM 'never_filled'` in `getPaperSimTrades`/`Global`/`BySymbol`, `includeNeverFilled` opt-in) — Langston condition-4 typed-guard option |
| 6 | xStock weekend honesty (R3) | **YES** | Both drop paths guard `isXstockMarketOpenUTC` — a shut book can't honestly fill, the drop waits for the first open tick |
| 7 | UI | **YES (§9.3)** | Chrome on staging: ML Open Trades renders the stacked Entry-Fee-Mode cell live ("Taker (0.80%) / chosen"; legacy em-dash); PENDING badge + twin line + never-filled badges are the same typed-keyed cells, first live render rides #433 |
| 8 | Inert Phase-25 tier | **YES** | `maker_late_fill_haircut_pct` seeded 0, read by NOTHING; `makerFillPrice(limit)=limit` arity-pinned (`length===1` test) |

## Langston review record

- **Step-4: APPROVE for push** (read all 1428 lines + independently verified 5 load-bearing off-diff assumptions: CHECK satisfied on drop, twin tags survive rehydrate, `taker_net_ev` live data, ON CONFLICT target, no cash-ledger leak), **+ 4 close-conditions**.
- **His first-pass zero-price concern → FIXED in the shipped code:** `_processPendingMaker` nulls non-positive prices (mirrors the VTS `price > 0` guard) so a glitch 0-tick can never spuriously fill.
- **Step-8: PASS — "cleared for close"** (independent verification off the staging tree + Supabase: migration columns/CHECK/6 seeds line-for-line; condition-4 typed guard at storage.ts:3263/3287/3403; condition-3 grep-clean; condition-2 governance content verified once the close commit pushed).

**The 4 conditions, dispositioned:**
1. **Paper maker-fee cash accounting** — Langston's own off-diff check: paper has NO running cash balance debited at placement; P&L derives from closed trades; `never_filled` excluded from every aggregate path → the placement-time maker fee on a dropped pending is inert (no phantom friction). The fill side applies the maker fee via the row's `entryFee`. **Live-exercise proof deferred (pre-agreed) to the B8/B9 paper turn-on.**
2. **Governance content** — LANDED (list below): SYSTEM_MANUAL new §P19-B7.2c + the stale convert-sketch corrected; SIM Cross-Cutting registry callout; ADJUSTMENT_FRAMEWORK new lever row incl. the RE-PURPOSED `maker_time_budget_ms`.
3. **§15 legacy** — `resolveMakerTimeBudgetMs` has ZERO callers (grep-clean; **left intentionally** as the documented Phase-25 fill-rate accessor — recorded here per rule 18); the make-then-take lifecycle code was fully deleted at B7.2b (Langston verified then); the stale "convert-safety baseline" comment at `ready_to_buy_service.ts:139` swept in this batch.
4. **Never-filled exclusion completeness** — implemented the typed-guard option (storage chokepoint default SQL exclusion); no per-reader string check to forget.

**Step-8 riders (non-blocking, homed):** first-occurrence evidence + pending-notional exposure eyeball → **RUNNING_ISSUES #433** (CC-B, this week). The cosmetic `openedAt`-at-placement note added as a code comment near the fill (a true in-market duration = Phase-25 `filledAt` decision).

## Honest boundaries

- 🚨 **PENDING/twin/never-filled behavior is LIVE on the VTS immediately but DORMANT on paper until active trading turns on (B8)** — the paper monitor pre-pass runs only when paper positions exist.
- At close, no pending/twin/never_filled row had yet occurred naturally (no new VTS open since restart#432 — fee wall; a hard-drop takes ≥1h by definition). First-occurrence evidence = #433.
- The marketable fallback's stored `taker_net_ev` is a ≤~30s-stale gen-time number — a documented approximation; Phase-21 real resting orders retire it.
- This build's CI run also **repaired a manifest-drift Test-Suite red** caused by my pre-compaction memory commit accidentally sweeping in the migration `.sql` without its MANIFEST line (two red runs `28611532271`/`28611747090`; the batch commit registered the MANIFEST line → green).

## Issues

- **#412 RESOLVED** (this batch, with the Kyle simplification recorded in the entry).
- **#414 CLOSED-overtaken** (no convert branch exists in any form; ordering analysis preserved for a hypothetical Phase-21 re-introduction).
- **#433 OPENED** (soak evidence + exposure eyeball; CC-B, this week).

## Governance files changed (this batch)

1. `1-system-manual/SYSTEM_MANUAL.md` — NEW §"P19-B7.2c — Post-promotion PENDING maker-fill lifecycle + VTS twins" + the stale B7.2b convert-sketch sentence corrected
2. `1-system-manual/SYSTEM_IMPACT_MAP.md` — Cross-Cutting Runtime State registry: B7.2c callout (pending lifecycle state, twin predicate discipline on `openVirtualTrades`, storage typed guard, new knobs)
3. `1-system-manual/ADJUSTMENT_FRAMEWORK.md` — NEW lever row (`maker_max_pending_ms` / `maker_late_fill_haircut_pct` / `twin_enabled`) + the RE-PURPOSED `maker_time_budget_ms` documented
4. `1-system-manual/RUNNING_ISSUES.md` — #412 RESOLVED · #414 CLOSED-overtaken · #433 OPENED
5. `1-system-manual/BATCH_CATALOG.md` — P19-B7.2c row
6. `1-system-manual/PHASE_HISTORY.md` — plain-language shipped paragraph
7. `1-system-manual/PHASE_19_PLAN.md` — §1 board (B7.2c ✅ DONE) + §5 decision log (Kyle simplification recorded)
8. `drizzle/migrations/MANIFEST.txt` — `2026-07-01-p19-b7-2c-pending-maker.sql` registered (rollback kept out per convention)
9. `Claude Comms and Packages/Scope Files/P19_B7_2c_SCOPE.md` + `P19_B7_2c_PRE_AUDIT.md` — simplification banner + hygiene (pushed pre-build)
10. This report
11. `MEMORY_CC_B.md` (truth + repo mirror) + Langston `/home/langston/MEMORY.md` sync (§10.b)

**Sync gate:** Google Drive `git status` clean of batch files; `rev-list` both directions 0 at close; staging deployed at the pushed head.
