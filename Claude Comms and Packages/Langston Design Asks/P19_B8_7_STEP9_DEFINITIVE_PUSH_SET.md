# P19-B8.7 Step-9 — THE DEFINITIVE PUSH SET (single artifact, supersedes all prior sections for the GO read)

**From:** NEW Claude · 2026-07-17 ~14:4xZ · **Base ref: 058ebe2d4** (current origin head — OLD Claude's second B8.9 commit; verified = local HEAD).

This is the COMPLETE diff surface of my push, generated fresh against that HEAD in one pass — no supersession archaeology needed; grade THIS document alone. The prior artifacts remain for narrative/ruling history only.

## Surface enumeration (everything my commit will stage — nothing else)

MODIFIED (13): ready-to-buy-table.tsx · trade-history-tab.tsx · vts-closed-trades-table.tsx · vts-open-trades-table.tsx · vts-shared.tsx · live-trading.tsx · paper-trading.tsx · eval-cycle.ts (xstock) · active-filter-pool.ts · fx5-scanner.ts · vts-runner.ts · export-csv.ts · RUNNING_ISSUES.md (+#527/#528/#529 only) · DELETED_COMPONENTS_LOG.md (+#528 entry only)
NEW (3): client/src/lib/paper-trade-adapter.ts (§B below — the object you verified, blob 2b8a68c4…) · client/src/components/trading/paper-open-trades-tab.tsx (§C) · server/tests/unit/paper-trade-adapter.test.ts (§D)
DELETED (1): client/src/components/trading/active-trades-v2.tsx (+ archive copy added under _archive/deleted-code/)
EXPLICITLY NOT IN MY DIFF: server/routes.ts — zero changes; the server venue-quiet half is OLD Claude's COMMITTED code at b28cf7074/058ebe2d4 (re-confirm it at the ref yourself per your #452 discipline — it is not mine to hand you). Also not staged: .claude/settings.local.json (local config), the four governance docs showing line-ending-only noise (empty content diffs).
Goverance-content docs (BATCH_CATALOG/PHASE_HISTORY/PHASE_19_PLAN/SIM/SysManual incl. your §5 xStock-friction SIM note) land in the GOVERNANCE commit at batch close per workflow — after deploy + §9.3, listed in the completion report.

## §A — FULL CUMULATIVE DIFF (working tree vs 058ebe2d4)

```diff
diff --git a/1-system-manual/DELETED_COMPONENTS_LOG.md b/1-system-manual/DELETED_COMPONENTS_LOG.md
index 81e210676..da90f2029 100644
--- a/1-system-manual/DELETED_COMPONENTS_LOG.md
+++ b/1-system-manual/DELETED_COMPONENTS_LOG.md
@@ -6,6 +6,18 @@
 
 ---
 
+## 2026-07-17 — P19-B8.7 Step-9 (#528): `active-trades-v2.tsx` (1,362 lines) — the bespoke paper Open Trades tab, superseded by the shared VTS-mirror table + adapter
+
+**Why:** Kyle's layout-identity directive + Langston's shared-component ruling (B): the paper Open Trades tab now mounts the SHARED `vts-open-trades-table.tsx` through the pure `paper-trade-adapter.ts`, with the paper shell (IntegrityBanner, count header, mutations, WS refresh) preserved verbatim in the NEW `paper-open-trades-tab.tsx`. The bespoke file is retired per rule 18. **The rule-23 FIX-ON-FIND on record (Langston-required verbatim quote):** this file's WS price-overlay recomputed P/L client-side on every tick using hardcoded constants — `const FEE_PERCENT = 0.0010; // 0.10%` and `const SLIPPAGE_PERCENT = 0.0015; // 0.15%` (`:1125-1126`, commented "same as backend", which they were NOT — fees are DB-governed per-mode/per-class) — so displayed net P/L between server refreshes was computed on fantasy friction. The recompute was DELETED (not constant-patched) in the rewire: server-authoritative numbers + 3s-throttled WS invalidation.
+
+**Blast-radius verification (PROVEN safe):** both mount sites (`paper-trading.tsx`, `live-trading.tsx`) swapped to `PaperOpenTradesTab` in the same batch; repo-wide grep for `active-trades-v2|ActiveTradesV2` post-swap → ZERO importers. Nothing survives unaccounted: shell → `paper-open-trades-tab.tsx` (IntegrityBanner moved verbatim); table markup → the shared components (all columns preserved or Kyle-ruled removed); the B8.9 venue-quiet cell edits OLD Claude briefly carried here were reverted by him pre-push (b28cf7074) — the behavior lives in the shared table via the portable `venue-quiet-price-cell.tsx` + the server's `priceVenueQuiet` (the recorded carry obligation, discharged). `tsc`-baseline clean post-removal.
+
+**Deletion sequencing note:** delete deliberately deferred ~½ day after the mounts were swapped — OLD Claude had in-flight B8.9 edits inside the file (wrench protocol); trigger = his b28cf7074 push (which reverted those edits), per the #528 rider.
+
+**Archive:** `1-system-manual/_archive/deleted-code/active-trades-v2.P19-B8.7-Step9.tsx.removed`. Commit: (this batch's push).
+
+---
+
 ## 2026-07-08 — B-STORAGE-HARDEN Wave C (OBJ-2): `b70-retention-sweep.ts` — the DROP-only B70 analytics retention sweep
 
 **Why:** the B70 analytics tables (`signal_eval_archive`, `pair_scan_archive`, `exit_decision_archive`, `macro_feed_archive`, `signal_eval_provenance`) were DROP-only at 90 days via this standalone cron script — it deleted whole monthly partitions with NO warm/cold tiering, violating Kyle's 2026-05-06 "we don't ever drop data" directive (RUNNING_ISSUES #430 V1, an oversight — B70 shipped 2 days before the never-drop/tiered-storage system). Wave C routes these 5 tables through the SAME proven B75 export→warm→cold move-not-delete path (added to `b75-retention-sweep.ts`'s partitioned-archive inventory + per-table `data_lifecycle.<table>.hot_retention_days=90`). With tiering owning them, the DROP-only sweep is retired per rule 18 (a paused/commented DROP script is a re-entry hazard the next person greps and misreads).
diff --git a/1-system-manual/RUNNING_ISSUES.md b/1-system-manual/RUNNING_ISSUES.md
index f8ec9a0b7..442610b89 100644
--- a/1-system-manual/RUNNING_ISSUES.md
+++ b/1-system-manual/RUNNING_ISSUES.md
@@ -13,6 +13,9 @@
 
 > Source: `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md` (3-way APPROVED) + the fee 3-way. Reorg plan: `Scope Files/P19_REORG_BOTH_CLASSES_PLAN_2026-06-19.md`.
 
+- **#529 OPEN 2026-07-17 (Kyle directive — "run the strategy-weighting investigation just before the runtime audit; I don't want to answer that question during that batch"; CC-B) — B-STRATEGY-WEIGHT-INVESTIGATION: the L9/L10 chain, functioning or degenerate, kill-or-keep.** Surfaced by the RTB S.Wgt column showing EVERY signal at exactly 20%: the L9 strategy-confidence weight (per-strategy reliability Wₛ from L8 calibration coefficients, `strategyWeights.ts`) resolves to a hardcoded `return 0.2` fallback (`:188`, `:205`) or the equal-weight degenerate case (`:63-65`) for every strategy — the display column is REMOVED (this batch), but the metric is NOT dead: the weights feed the L10 exposure-bias multipliers (`strategyBias.ts computeExposureBias :59` consumes the weights bundle; `getExposureMultiplierSync` is imported by signal-orchestrator, vts-runner, rtb-refresh-service). WORK: trace whether L8 calibration ever populates real coefficients (or the chain has been running degenerate since birth); whether the exposure multiplier actually moves decisions today or multiplies by 1.0 everywhere; then Kyle's dead-metric rule applies — full kill (calc/storage/callers) if degenerate-by-construction, or repair/recalibrate if genuinely load-bearing. Also sweep the orchestrator's per-signal `strategyWeight` metadata attach (`:924/:979`) + the route serialization (display-dead post this batch). **HOME (§9.4, Kyle-sequenced 2026-07-17): its OWN batch immediately BEFORE the #522 end-of-Phase-19 FULL RUNTIME PIPELINE AUDIT — deliberately NOT inside it (Kyle: answer this question before that batch, not during). OPEN (homed, sequenced).**
+- **#528 OPEN 2026-07-17 (Langston Step-4 condition on the B8.7 Step-9 final piece; CC-B) — RULE-18 DELETE of `active-trades-v2.tsx` (1,376 lines), SEQUENCED rider: fires when OLD Claude's P19-B8.9 push lands.** The Step-9 rewire swapped BOTH page mounts to `paper-open-trades-tab.tsx` (shared VTS-mirror table + adapter), orphaning the file (zero importers verified by grep). The delete is deferred ONLY because CC-A has uncommitted B8.9 venue-quiet edits INSIDE it (deleting a file mid-another-session's-edit is the wrench-protocol collision); it is NOT a floating promise: **THIS BATCH (P19-B8.7 Step-9) DOES NOT CLOSE with the file still present** (Langston's explicit gate). At delete: DELETED_COMPONENTS_LOG entry MUST quote the hardcoded `FEE_PERCENT = 0.0010` / `SLIPPAGE_PERCENT = 0.0015` client P/L-recompute constants VERBATIM (the rule-23 fix-on-find that motivated deleting rather than patching), archive to `_archive/deleted-code/*.removed`. Nothing in the file survives unaccounted: shell → paper-open-trades-tab (IntegrityBanner verbatim, mutations preserved); markup → shared components; venue-quiet cells → the shared-table carry. **HOME: this batch, trigger = B8.9 push complete. OPEN (homed, dated).**
+- **#527 OPEN 2026-07-17 (Langston Step-4 condition on the B8.7 Step-9 final piece — residual (a) of the §9.2 VTS cost-split correction; CC-B) — WIRE the xStock eval-cycle caller to pass the friction COMPONENTS into `buildVirtualTradeFromSignal`.** Step-9 captures `costFeeFraction/costSlippageFraction/costSpreadFraction` at the crypto inline VTS build sites and added the OPTIONAL passthrough inputs to `buildVirtualTradeFromSignal` — but the xStock eval-cycle call site does not pass them yet, so xStock VTS rows render em-dashes in the new cost 5-col split (honest, never fabricated). WORK: the one-call-site diff (xstock eval-cycle → pass the three fractions from its cost metrics), presented to Langston BEFORE the batch closes (his named condition). Companion invariant he ratified: NO BACKFILL ever — a blended `frictionCost` scalar cannot be honestly decomposed; pre-deploy rows stay em-dash. **HOME: this batch (P19-B8.7 Step-9), before close. OPEN (homed, dated).**
 - **#526 OPEN 2026-07-17 (CC-A escalation of the accumulating equity_tick_stale alert family; CC-B owns — it is the marks-fix skip rail's alert) — VENUE-QUIET ALERT NOISE: the per-symbol unmanageable-position alarm re-mints every overnight thin-liquidity window.** MEASURED: 7 open alerts accumulated overnight 07-16/17 (ROP/BSX/DDOG/SHOP/AMGN/UBER/TYL, all the 40-skip signature, windows 20:36–22:51Z) — every one STALE-BY-RECOVERY when triaged (03:3xZ: PRICE_SKIP 3 per 8,000 log lines, UBER+BSX pricing live; BSX had already self-recovered once at 20:37Z and re-alerted on the NEXT quiet window because resolved alerts don't dedupe — correct addAlert semantics, wrong fit for a RECURRING benign condition). The rail itself is CORRECT (a position genuinely cannot exit on a quiet venue; detection stands); the defect is alert ECONOMICS: xStocks trade 24/5 but go per-symbol quiet overnight, so the current design mints up to N-positions × M-windows alerts per night, training everyone to skim them — alert fatigue is how the real one gets missed. WORK: quiet-hours-aware rail behavior — options for the scope: a per-class VENUE-QUIET state that batches per-symbol events into ONE standing alert per window (resolve-on-venue-resume), and/or an overnight suppression window knob (DB-governed, per-class) with the skip streak still logged, and/or threshold escalation only if a position stays unpriceable INTO liquid hours (the genuinely alarming case). Exit-monitor behavior unchanged — this is alerting design only. **HOME (§9.4): a named small batch B-VENUE-QUIET-ALERTING, owner CC-B, sequenced after the B8.7 Step-9 close (before the weekend gap would re-mint the family Fri night); Langston gates the design. OPEN (homed, dated).**
 - **#525 OPEN 2026-07-17 (Kyle directive — "if we retired it, the calculation, storage, calling of it should be completely deleted"; CC-B) — FINALSCORE FULL PURGE: calculation + storage + every caller.** The DISPLAY columns are gone everywhere as of the Step-9 deletion set (VTS open/closed Final/Hybrid, paper open FinalScore+Conf, the RTB column + its fabricated route fields). The DEEP purge is structural and needs its own scope + Langston rulings because finalScore still has LIVE machinery: the SQE computes/stores it (rtb_signals.final_score + VTS rows), the refresh re-derives it (decay/hybrid), the 3-arm ranker's `confidence` CONTROL arm reads it (ready_to_buy_service :1888), the exploration/shadow evidence captures reference it (FINALSCORE_SHADOW — the §9.1 switch-on proofs), and the Phase-25 blueprint retires it as part of the ratified scoring redesign. Deliverables: enumerate every reader/writer (path:line); disposition the ranker control arm (retire or re-key); disposition the shadow evidence (its capture purpose may already be discharged); DB column retirement w/ migration; the same treatment extends to EVERY metric ruled dead (Kyle: "this goes for any metric we have decided is dead"). **HOME (§9.4): named batch B-FINALSCORE-PURGE, owner CC-B, sequenced with/into the Phase-25 scoring-redesign migration window (the blueprint's §9 migration checklist is the natural vehicle) — OR earlier if Kyle wants it pre-Phase-25; Langston gates the scope. OPEN (homed).**
 - **#524 OPEN 2026-07-16 (Langston Step-8 §13 condition on B-STAGING-LIVENESS-WATCH; CC-B) — ENGINE-LEG ALARM END-TO-END DRILL, dated slot: the WEEKEND xStock gap, Saturday 2026-07-19.** The watchdog's engine-halt alarm (expected=true/running=false → 2-tick → alert) was validated by parts (both liveness states read live; the emit path drilled via the http leg) but the engine trigger→notify chain never fired end-to-end — and catching a silently-dead engine is the watchdog's reason to exist, so it cannot be logged "verified" without the drill (Langston: not a close blocker; a §13 obligation). DRILL: during the Sat 07-19 xStock market gap (minimizes soak impact; crypto exit-monitoring pauses only for the drill window), stop the engine via the API (state-preserving), leave `isEngineActive` true is NOT possible via the stop route — so the drill seeds the watchdog state/uses a synthetic liveness target the way the http drill did, OR stops the engine at the process level; the drill design picks the honest variant and records it. Then: 2 ticks → engine-halt alert fires → continue-restart → recovery observed. **HOME: dated task, owner CC-B, Saturday 2026-07-19 (a scheduled alert will be armed to fire that morning). OPEN (homed, dated).**
diff --git a/client/src/components/trading/ready-to-buy-table.tsx b/client/src/components/trading/ready-to-buy-table.tsx
index 7297fdd3e..66e3cfe1c 100644
--- a/client/src/components/trading/ready-to-buy-table.tsx
+++ b/client/src/components/trading/ready-to-buy-table.tsx
@@ -5,11 +5,14 @@ import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { RefreshCw, TrendingUp, ArrowUpDown, Clock } from "lucide-react";
 import { cn, formatEntryFeeMode } from "@/lib/utils";
+import { VenueQuietPrice } from "./venue-quiet-price-cell";
 import { useWebSocket } from "@/hooks/use-websocket";
 import { getFrictionColorClasses, getRegimeBadgeClassName, getFrictionLabel, formatRegimeTitle } from "@/utils/frictionColor";
 // P19-B8.7 Step-9: the same stacked symbol-cell name source the VTS tables use.
 import { getAssetName } from "@shared/asset-names";
 import { useAssetNameOverlays } from "@/hooks/use-asset-name-overlays";
+// Kyle 2026-07-17: Duration column reuses the VTS minutes formatter (1h 5m / 2d 3h).
+import { formatDuration } from "@/components/vts/vts-shared";
 
 interface TradingSignal {
   id: string;
@@ -34,6 +37,9 @@ interface TradingSignal {
   volume24h: number | null;
   status: 'active' | 'reconfirmed' | 'promoted' | 'expired' | 'executed';
   detectedAt: string;
+  // Kyle 2026-07-17: queue-entry timestamp (rtb_signals.queued_at, rides the
+  // route's row spread) — the Duration column's anchor.
+  queuedAt?: string | null;
   estimatedQuantity?: number;
   estimatedValue?: number;
   marketRegime?: string;
@@ -42,6 +48,11 @@ interface TradingSignal {
   // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode snapshot carried on rtb_signals.
   chosenEntryMode?: string | null;
   entryFeeRate?: number | string | null;
+  // P19-B8.9 (OBJ-5): venue-quiet state for the Current column — server-side cache
+  // peek (never a fetch): true when no venue-tagged price fresher than the quiet
+  // threshold is held for this symbol.
+  priceVenueQuiet?: boolean;
+  priceAgeMs?: number | null;
 }
 
 interface TradingSignalsResponse {
@@ -49,7 +60,9 @@ interface TradingSignalsResponse {
   timestamp: string;
 }
 
-type SortField = 'rank' | 'symbol' | 'rankScore' | 'strategyWeight' | 'volume' | 'price' | 'strategy' | 'entry' | 'target' | 'stop' | 'quantity' | 'status' | 'marketRegime' | 'marketFriction' | 'dbs' | 'netEv';
+// Kyle 2026-07-17: 'strategyWeight' REMOVED with its column (S.Wgt — degenerate
+// display, see the header comment at the removal site); 'queueAge' added (Duration).
+type SortField = 'rank' | 'symbol' | 'rankScore' | 'volume' | 'price' | 'strategy' | 'entry' | 'target' | 'stop' | 'quantity' | 'status' | 'marketRegime' | 'marketFriction' | 'dbs' | 'netEv' | 'queueAge';
 type SortDirection = 'asc' | 'desc';
 
 export default function ReadyToBuyTable() {
@@ -150,9 +163,10 @@ export default function ReadyToBuyTable() {
         aValue = a.chosenNetEv != null ? Number(a.chosenNetEv) : -Infinity;
         bValue = b.chosenNetEv != null ? Number(b.chosenNetEv) : -Infinity;
         break;
-      case 'strategyWeight':
-        aValue = a.strategyWeight ?? 0;
-        bValue = b.strategyWeight ?? 0;
+      case 'queueAge':
+        // Older queue entry = larger age; missing timestamp sorts newest.
+        aValue = a.queuedAt ? Date.now() - new Date(a.queuedAt).getTime() : 0;
+        bValue = b.queuedAt ? Date.now() - new Date(b.queuedAt).getTime() : 0;
         break;
       case 'symbol':
         aValue = a.symbol;
@@ -317,7 +331,13 @@ export default function ReadyToBuyTable() {
                   {/* Kyle 2026-07-17: RankingScore sits NEXT TO Rank. */}
                   <SortHeader field="rankScore" label="RankingScore" />
                   <SortHeader field="symbol" label="Symbol" />
-                  <SortHeader field="strategyWeight" label="S.Wgt" />
+                  {/* Kyle 2026-07-17: S.Wgt column REMOVED — the displayed value was
+                      degenerate (every row at the 0.2 equal-weight/fallback), so it
+                      conveyed nothing. The L9 weight MACHINERY is NOT dead (it feeds
+                      the L10 exposure-bias multipliers) — its functioning-vs-degenerate
+                      investigation is #529 (B-STRATEGY-WEIGHT-INVESTIGATION), its own
+                      batch sequenced immediately BEFORE the #522 runtime audit (Kyle);
+                      full metric retirement only after that trace. */}
                   <SortHeader field="price" label="Price" />
                   <SortHeader field="entry" label="Entry" />
                   <SortHeader field="target" label="Target" />
@@ -333,6 +353,8 @@ export default function ReadyToBuyTable() {
                   <SortHeader field="netEv" label="Net EV" />
                   {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column — non-sortable */}
                   <th className="text-left py-2 px-3 font-medium" data-testid="header-entry-fee-mode">Entry Fee Mode</th>
+                  {/* Kyle 2026-07-17: time in the ready-to-buy queue (queued_at → now). */}
+                  <SortHeader field="queueAge" label="Duration" />
                   <SortHeader field="status" label="Status" />
                 </tr>
               </thead>
@@ -370,6 +392,19 @@ export default function ReadyToBuyTable() {
                           {rank}
                         </span>
                       </td>
+                      {/* Kyle 2026-07-17 (screenshot): the CELL order now matches the
+                          header order — RankingScore BEFORE Symbol. The rebuild had
+                          reordered only the headers, so scores rendered under "Symbol"
+                          and symbols under "RankingScore". S.Wgt cell REMOVED with its
+                          column (degenerate display; see the header-side comment). */}
+                      <td className="text-right py-3 px-3" data-testid={`text-ranking-score-${index}`}>
+                        <span className={cn(
+                          "font-semibold font-mono",
+                          rankScore !== null && rankScore > 0 ? "text-success" : "text-muted-foreground"
+                        )}>
+                          {rankScore !== null && !isNaN(rankScore) ? rankScore.toFixed(4) : '—'}
+                        </span>
+                      </td>
                       {/* P19-B8.7 Step-9: stacked symbol cell — symbol + display name +
                           class badge, the same getAssetName composition the VTS
                           tables use (Kyle's stacked-name directive). */}
@@ -386,30 +421,23 @@ export default function ReadyToBuyTable() {
                           )}
                         </div>
                       </td>
-                      {/* P19-B8.7 Step-9: the ATTACHED rank key (RankingScore) — the
-                          number that actually orders promotion, any config arm.
-                          FinalScore + ML Conf cells REMOVED (inert / fabricated). */}
-                      <td className="text-right py-3 px-3" data-testid={`text-ranking-score-${index}`}>
-                        <span className={cn(
-                          "font-semibold font-mono",
-                          rankScore !== null && rankScore > 0 ? "text-success" : rankScore !== null ? "text-muted-foreground" : "text-muted-foreground"
-                        )}>
-                          {rankScore !== null && !isNaN(rankScore) ? rankScore.toFixed(4) : '—'}
-                        </span>
-                      </td>
-                      <td className="text-right py-3 px-3" data-testid={`text-strategy-weight-${index}`}>
-                        <span className={cn(
-                          "font-semibold",
-                          (signal.strategyWeight ?? 0) >= 0.5 ? "text-amber-600" : (signal.strategyWeight ?? 0) >= 0.3 ? "text-amber-400" : "text-muted-foreground"
-                        )}>
-                          {signal.strategyWeight !== null && !isNaN(signal.strategyWeight) ? `${(signal.strategyWeight * 100).toFixed(1)}%` : '—'}
-                        </span>
-                      </td>
+                      {/* P19-B8.9 (OBJ-5): the stored row price wears the venue-quiet badge
+                          when we hold no fresh venue-tagged value for the symbol (server-side
+                          cache peek — never a fetch). */}
                       <td className="text-right py-3 px-3 font-mono" data-testid={`text-price-${index}`}>
-                        {!isNaN(currentPrice) 
-                          ? `$${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}`
-                          : '—'
-                        }
+                        {signal.priceVenueQuiet ? (
+                          <VenueQuietPrice
+                            price={!isNaN(currentPrice) ? currentPrice : null}
+                            ageMs={signal.priceAgeMs}
+                            decimals={currentPrice < 1 ? 4 : 2}
+                            className="text-right"
+                            testId={`cell-current-venue-quiet-${index}`}
+                          />
+                        ) : (
+                          !isNaN(currentPrice)
+                            ? `$${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}`
+                            : '—'
+                        )}
                       </td>
                       <td className="text-right py-3 px-3 font-mono font-semibold text-success" data-testid={`text-entry-${index}`}>
                         {!isNaN(entryPrice) 
@@ -513,6 +541,16 @@ export default function ReadyToBuyTable() {
                       <td className="py-3 px-3 text-xs" data-testid={`text-entry-fee-mode-${index}`}>
                         {formatEntryFeeMode(signal.chosenEntryMode, signal.entryFeeRate)}
                       </td>
+                      {/* Kyle 2026-07-17: time in the queue since queued_at; the 30s
+                          auto-refresh keeps it current. Missing timestamp → em-dash. */}
+                      <td className="py-3 px-3 text-xs whitespace-nowrap" data-testid={`text-queue-age-${index}`}>
+                        {signal.queuedAt ? (
+                          <span className="inline-flex items-center gap-1">
+                            <Clock className="w-3 h-3 text-muted-foreground" />
+                            {formatDuration(Math.max(0, Math.floor((Date.now() - new Date(signal.queuedAt).getTime()) / 60000)))}
+                          </span>
+                        ) : '—'}
+                      </td>
                       <td className="py-3 px-3" data-testid={`text-status-${index}`}>
                         <span className={cn(
                           "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
diff --git a/client/src/components/trading/trade-history-tab.tsx b/client/src/components/trading/trade-history-tab.tsx
index 83823f4b1..116401d63 100644
--- a/client/src/components/trading/trade-history-tab.tsx
+++ b/client/src/components/trading/trade-history-tab.tsx
@@ -1,169 +1,37 @@
-import { useState, useRef, useEffect, useCallback } from "react";
+import { useState } from "react";
 import { useQuery } from "@tanstack/react-query";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
-import { Badge } from "@/components/ui/badge";
 import { Input } from "@/components/ui/input";
 import { Button } from "@/components/ui/button";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
-import { Skeleton } from "@/components/ui/skeleton";
-import { cn, formatEntryFeeMode } from "@/lib/utils";
 import { useTradingMode } from "@/contexts/trading-mode-context";
 import { apiFetch } from "@/lib/api";
-import { getFrictionColorClasses, getRegimeBadgeClassName, getFrictionLabel, formatRegimeTitle } from "@/utils/frictionColor";
-import { AssetClassBadge } from "@/components/ui/asset-class-badge";
-import { 
-  TrendingUp, 
-  TrendingDown, 
-  Target, 
-  Shield, 
-  Clock,
-  BarChart3,
-  Award,
-  AlertTriangle,
+// P19-B8.7 Step-9: the table is the shared VTS-mirror component + pure adapter;
+// the bespoke markup and its helpers (DualScrollTable, SortableHeader, strategy
+// color/name maps, formatters) are deleted with it (rule 18).
+import { ClosedTradesTable } from "@/components/vts/vts-closed-trades-table";
+import { adaptPaperClosedTrade } from "@/lib/paper-trade-adapter";
+import { useAssetNameOverlays } from "@/hooks/use-asset-name-overlays";
+import {
   RefreshCw,
   ChevronLeft,
   ChevronRight,
   ChevronsLeft,
   ChevronsRight,
-  ArrowUpDown,
-  ArrowUp,
-  ArrowDown
 } from "lucide-react";
 
-function formatNumber(value: number | string, decimals: number = 2): string {
-  const num = typeof value === 'string' ? parseFloat(value) : value;
-  if (isNaN(num)) return '-';
-  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
-}
+// P19-B8.7 Step-9 (rule 18): the bespoke table helpers that lived here —
+// formatNumber, DualScrollTable, the strategyColors/strategyNames maps,
+// formatDuration, SortableHeader — are DELETED with the bespoke markup; the
+// shared vts-closed-trades-table.tsx + vts-shared.tsx now own the rendering.
 
-// Phase 8.8.3-C2: Dual scroll bar component - provides scroll at top and bottom
-function DualScrollTable({ children }: { children: React.ReactNode }) {
-  const topScrollRef = useRef<HTMLDivElement>(null);
-  const bottomScrollRef = useRef<HTMLDivElement>(null);
-  const contentRef = useRef<HTMLDivElement>(null);
-  const [scrollWidth, setScrollWidth] = useState(0);
-  
-  useEffect(() => {
-    if (contentRef.current) {
-      setScrollWidth(contentRef.current.scrollWidth);
-    }
-  }, [children]);
-  
-  const syncScroll = useCallback((source: 'top' | 'bottom') => {
-    if (!topScrollRef.current || !bottomScrollRef.current) return;
-    const scrollLeft = source === 'top' 
-      ? topScrollRef.current.scrollLeft 
-      : bottomScrollRef.current.scrollLeft;
-    topScrollRef.current.scrollLeft = scrollLeft;
-    bottomScrollRef.current.scrollLeft = scrollLeft;
-  }, []);
-  
-  return (
-    <div>
-      {/* Top scroll bar */}
-      <div 
-        ref={topScrollRef}
-        className="overflow-x-auto overflow-y-hidden h-3 border-b border-border/50"
-        onScroll={() => syncScroll('top')}
-      >
-        <div style={{ width: scrollWidth, height: 1 }} />
-      </div>
-      {/* Table container */}
-      <div 
-        ref={(el) => { 
-          (bottomScrollRef as any).current = el; 
-          (contentRef as any).current = el;
-        }}
-        className="overflow-x-auto"
-        onScroll={() => syncScroll('bottom')}
-      >
-        {children}
-      </div>
-    </div>
-  );
-}
-
-// P19-B8.7 (OBJ-2): colors are COSMETIC ONLY — cell visibility never depends on this
-// map (the render fallback carries its own text color). Keys fixed to the canonical
-// strategy ids (range_trading was a dead key — canonical is range_trade); unlisted
-// canonical strategies simply render on the neutral fallback.
-const strategyColors: Record<string, string> = {
-  vwap_pullback: "bg-primary/10 text-primary",
-  abcd_long: "bg-chart-2/10 text-chart-2",
-  sma_trend_ride: "bg-chart-3/10 text-chart-3",
-  vwap_bounce: "bg-blue-500/10 text-blue-600",
-  dhma: "bg-purple-500/10 text-purple-600",
-  breakout: "bg-orange-500/10 text-orange-600",
-  mean_reversion: "bg-green-500/10 text-green-600",
-  range_trade: "bg-cyan-500/10 text-cyan-600",
-  liquidity_trap: "bg-rose-500/10 text-rose-600"
-};
-
-const strategyNames: Record<string, string> = {
-  vwap_pullback: "VWAP Pullback",
-  abcd_long: "ABCD Long",
-  sma_trend_ride: "SMA Trend Ride",
-  vwap_bounce: "VWAP Bounce",
-  dhma: "DHMA",
-  breakout: "Breakout",
-  mean_reversion: "Mean Reversion",
-  range_trade: "Range Trade",
-  liquidity_trap: "Liquidity Trap"
-};
-
-function formatDuration(ms: number): string {
-  if (ms <= 0) return '-';
-  const seconds = Math.floor(ms / 1000);
-  const minutes = Math.floor(seconds / 60);
-  const hours = Math.floor(minutes / 60);
-  const days = Math.floor(hours / 24);
-
-  if (days > 0) return `${days}d ${hours % 24}h`;
-  if (hours > 0) return `${hours}h ${minutes % 60}m`;
-  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
-  return `${seconds}s`;
-}
-
-// P19-B8.7 (OBJ-6): AnalyticsPanel DELETED — see the removal note at the render site.
-function SortableHeader({ 
-  column, 
-  label, 
-  currentSort, 
-  currentOrder, 
-  onSort,
-  align = 'left'
-}: { 
-  column: string; 
-  label: string; 
-  currentSort: string; 
-  currentOrder: 'asc' | 'desc'; 
-  onSort: (col: string) => void;
-  align?: 'left' | 'right';
-}) {
-  const isActive = currentSort === column;
-  return (
-    <th 
-      className={cn(
-        "p-3 text-sm font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 select-none",
-        align === 'right' ? 'text-right' : 'text-left'
-      )}
-      onClick={() => onSort(column)}
-    >
-      <div className={cn("flex items-center gap-1", align === 'right' && "justify-end")}>
-        {label}
-        {isActive ? (
-          currentOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
-        ) : (
-          <ArrowUpDown className="w-3 h-3 opacity-40" />
-        )}
-      </div>
-    </th>
-  );
-}
 
 export function TradeHistoryTab() {
   const { isPaper } = useTradingMode();
-  
+
+  // Company/coin name overlays for the shared table's stacked symbol cell.
+  useAssetNameOverlays();
+
   // Phase 8.8.3-C-FINAL PART 6: Pending filters (user edits these)
   const [pendingFilters, setPendingFilters] = useState({
     symbol: '',
@@ -182,11 +50,13 @@ export function TradeHistoryTab() {
     dateTo: ''
   });
   
-  // Phase 8.8.3-C5: Pagination and sorting state
+  // Phase 8.8.3-C5: Pagination state. P19-B8.7 Step-9: the API sort became a
+  // fixed closedAt-desc default when the bespoke sortable headers died — the
+  // shared table sorts the current page client-side.
   const [page, setPage] = useState(0);
   const [pageSize, setPageSize] = useState(25);
-  const [sortBy, setSortBy] = useState<string>('closedAt');
-  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
+  const sortBy = 'closedAt';
+  const order: 'asc' | 'desc' = 'desc';
   
   // Phase 8.8.3-C-FINAL PART 6: Apply filters handler
   const handleApplyFilters = () => {
@@ -266,22 +136,9 @@ export function TradeHistoryTab() {
   const totalCount = paginatedData?.totalCount || 0;
   const totalPages = Math.ceil(totalCount / pageSize);
   
-  // Phase 8.8.3-C5: Handle column sorting
-  const handleSort = (column: string) => {
-    if (sortBy === column) {
-      setOrder(order === 'asc' ? 'desc' : 'asc');
-    } else {
-      setSortBy(column);
-      setOrder('desc');
-    }
-    setPage(0); // Reset to first page on sort change
-  };
-
-  const getSymbolColor = (symbol: string) => {
-    if (symbol.includes('BTC')) return 'text-orange-500';
-    if (symbol.includes('ETH')) return 'text-blue-500';
-    return 'text-primary';
-  };
+  // P19-B8.7 Step-9: the API-level column-sort handler + getSymbolColor died with
+  // the bespoke headers (rule 18) — the shared table sorts the current page
+  // client-side; the query keeps its closedAt-desc default ordering.
 
   return (
     <div className="space-y-6">
@@ -414,308 +271,18 @@ export function TradeHistoryTab() {
             </div>
           ) : (
             <>
-              <DualScrollTable>
-                <table className="w-full text-sm">
-                  <thead>
-                    <tr className="border-b border-border">
-                      {/* Phase 8.8.3-C2A: Final column order per directive */}
-                      <SortableHeader column="symbol" label="Symbol" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class</th>
-                      <SortableHeader column="strategyName" label="Strategy" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pool</th>
-                      {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entry Fee Mode</th>
-                      {/* P19-B8.7 (OBJ-4): VTS-mirror columns */}
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">B/S</th>
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider" title="Trailing-exit engine state at close.">TEC State</th>
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Signal/Pattern</th>
-                      <SortableHeader column="quantity" label="Qty" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="entryPrice" label="Entry" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="exitPrice" label="Exit" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider" title="The target and stop this trade was closed against (target = target_exit_price; stop = original_stop_price).">Target/Stop</th>
-                      <SortableHeader column="closeReason" label="Reason" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="grossPnl" label="Gross P/L" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="entryFee" label="Entry Fee" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="entrySlippage" label="Entry Slip" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="exitFee" label="Exit Fee" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="exitSlippage" label="Exit Slip" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="totalCost" label="Total Cost" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="netPnl" label="Net P/L" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="confidence" label="Conf" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="marketRegime" label="Regime" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="marketFrictionScore" label="Friction" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="openedAt" label="Opened" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="closedAt" label="Closed" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Duration</th>
-                    </tr>
-                  </thead>
-                  <tbody className="divide-y divide-border">
-                    {filteredTrades.map((trade: any) => {
-                      // Phase 8.8.3-C2: Parse P/L and cost fields
-                      const grossPnl = parseFloat(trade.grossPnl || trade.pnl || '0');
-                      const netPnl = parseFloat(trade.netPnl || trade.pnl || '0');
-                      const entryFee = parseFloat(trade.entryFee || '0');
-                      const exitFee = parseFloat(trade.exitFee || '0');
-                      const entrySlippage = parseFloat(trade.entrySlippage || '0');
-                      const exitSlippage = parseFloat(trade.exitSlippage || '0');
-                      const totalCost = parseFloat(trade.totalCost || '0');
-                      const isNetProfit = netPnl >= 0;
-                      const isGrossProfit = grossPnl >= 0;
-                      
-                      const formatTimestamp = (dateStr: string | null) => {
-                        if (!dateStr) return '-';
-                        const d = new Date(dateStr);
-                        return d.toLocaleString('en-US', { 
-                          month: 'short', 
-                          day: 'numeric', 
-                          hour: '2-digit', 
-                          minute: '2-digit'
-                        });
-                      };
-                      
-                      return (
-                        <tr key={trade.id} className="hover:bg-muted/50" data-testid={`trade-history-${trade.id}`}>
-                          {/* 1. Symbol - C2A */}
-                          <td className="p-2">
-                            <span className={cn("text-sm font-semibold", getSymbolColor(trade.symbol))}>
-                              {trade.symbol}
-                            </span>
-                          </td>
-                          
-                          {/* B69: Asset Class */}
-                          <td className="p-2">
-                            <AssetClassBadge assetClass={(trade as any).assetClass} />
-                          </td>
-
-                          {/* 2. Strategy - C2A.
-                              P19-B8.7 (OBJ-2, Kyle 2026-07-16): the column read as BLANK —
-                              the text was rendering WHITE-on-white. Any strategy missing from
-                              the (stale, 9-key) strategyColors map fell to a "bg-muted/10"
-                              override that killed the Badge's default background but kept its
-                              default text-primary-foreground (white). Visibility must NEVER
-                              depend on a hand-maintained color map: the fallback now carries
-                              its own text color, and an unmapped strategy renders its raw
-                              canonical name (the same rule the VTS tables use). */}
-                          <td className="p-2">
-                            <Badge className={cn("text-xs", strategyColors[trade.strategyName as keyof typeof strategyColors] || "bg-muted/20 text-foreground")}>
-                              {strategyNames[trade.strategyName as keyof typeof strategyNames] || trade.strategyName || '—'}
-                            </Badge>
-                          </td>
-
-                          {/* Batch 19E: Source Pool */}
-                          <td className="p-2">
-                            {(trade as any).sourcePool ? (
-                              <Badge className={cn("text-xs",
-                                (trade as any).sourcePool?.startsWith('quant') ? "bg-blue-500/10 text-blue-600" :
-                                (trade as any).sourcePool === 'pattern' ? "bg-purple-500/10 text-purple-600" :
-                                "bg-gray-500/10 text-gray-600"
-                              )}>
-                                {((trade as any).sourcePool as string).toUpperCase()}
-                              </Badge>
-                            ) : <span className="text-muted-foreground text-xs">—</span>}
-                          </td>
-
-                          {/* P19-B7.2b (OBJ-C): Entry Fee Mode (maker/taker) — NULL renders em-dash */}
-                          <td className="p-2 text-xs" data-testid={`text-entry-fee-mode-${trade.id}`}>
-                            {formatEntryFeeMode((trade as any).chosenEntryMode, (trade as any).entryFeeRate)}
-                          </td>
-
-                          {/* P19-B8.7 (OBJ-4): B/S · TEC State · Signal/Pattern (VTS-mirror; em-dash when absent) */}
-                          <td className="p-2">
-                            <span className={cn("text-xs font-semibold uppercase", trade.side === 'sell' ? "text-red-600" : "text-green-600")}>
-                              {trade.side === 'sell' ? 'S' : 'B'}
-                            </span>
-                          </td>
-                          <td className="p-2">
-                            {(trade as any).tradeMode
-                              ? <Badge variant="outline" className="text-xs">{(trade as any).tradeMode}</Badge>
-                              : <span className="text-muted-foreground text-xs">—</span>}
-                          </td>
-                          <td className="p-2 text-xs">
-                            {(trade as any).patternType
-                              ? <span className="font-medium">{String((trade as any).patternType)}</span>
-                              : <span className="text-muted-foreground">—</span>}
-                          </td>
-
-                          {/* 3. Quantity - C2A */}
-                          <td className="p-2 text-right font-mono text-xs">
-                            {trade.quantity ? formatNumber(trade.quantity, 4) : '-'}
-                          </td>
-                          
-                          {/* 4. Entry - C2A */}
-                          <td className="p-2 font-mono text-xs">
-                            {trade.entryPrice ? `$${formatNumber(trade.entryPrice, 4)}` : '-'}
-                          </td>
-                          
-                          {/* 5. Exit - C2A */}
-                          <td className="p-2 font-mono text-xs">
-                            {trade.exitPrice ? `$${formatNumber(trade.exitPrice, 4)}` : '-'}
-                          </td>
-
-                          {/* P19-B8.7 (OBJ-4): Target/Stop pair (target_exit_price / original_stop_price) */}
-                          <td className="p-2 font-mono text-xs whitespace-nowrap">
-                            <span className="text-green-600">{(trade as any).targetExitPrice ? `$${formatNumber((trade as any).targetExitPrice, 4)}` : '—'}</span>
-                            {' / '}
-                            <span className="text-red-600">{(trade as any).originalStopPrice ? `$${formatNumber((trade as any).originalStopPrice, 4)}` : '—'}</span>
-                          </td>
-                          
-                          {/* 6. Reason - C2A; B65.2 + HF3: trailing_stop_hit, moonbag_timeout, break_even_stop */}
-                          <td className="p-2">
-                            <div className="flex items-center gap-1">
-                              <Badge
-                                variant="outline"
-                                className={cn(
-                                  "text-xs",
-                                  trade.closeReason === 'target_hit' && "bg-green-500/20 text-green-600 border-green-500/50",
-                                  trade.closeReason === 'trailing_stop_hit' && "bg-emerald-500/20 text-emerald-600 border-emerald-500/50",
-                                  trade.closeReason === 'moonbag_timeout' && "bg-amber-500/20 text-amber-600 border-amber-500/50",
-                                  trade.closeReason === 'break_even_stop' && "bg-slate-500/20 text-slate-600 border-slate-400/50",
-                                  trade.closeReason === 'stop_hit' && "bg-red-500/20 text-red-600 border-red-500/50",
-                                  // P19-B7.2c: a dropped pending maker (visible, excluded from stats)
-                                  trade.closeReason === 'never_filled' && "bg-slate-500/20 text-slate-400 border-slate-500/40"
-                                )}
-                              >
-                                {!trade.closedAt ? 'Open' :
-                                 trade.closeReason === 'never_filled' ? 'Never filled — dropped' :
-                                 trade.closeReason === 'target_hit' ? 'Target' :
-                                 trade.closeReason === 'trailing_stop_hit' ? 'Trail' :
-                                 trade.closeReason === 'moonbag_timeout' ? 'M.Cap' :
-                                 trade.closeReason === 'break_even_stop' ? 'BE Protect' :
-                                 trade.closeReason === 'stop_hit' ? 'Stop' :
-                                 trade.closeReason === 'manual_close' ? 'Manual' :
-                                 trade.closeReason === 'manual_stop' ? 'M.Stop' :
-                                 trade.closeReason === 'engine_stop_cleanup' ? 'Engine' :
-                                 trade.closeReason === 'hard_reset' ? 'Reset' :
-                                 trade.closeReason === 'hard_stop' ? 'H.Stop' :
-                                 trade.closeReason === 'force_close' ? 'Force' :
-                                 trade.closeReason || '?'}
-                              </Badge>
-                              {/* B65.2: Moonbag badge for trades that entered TRAILING_TAKE mode */}
-                              {/* B65.4: rung count appended (MB×N) when ladder data is present */}
-                              {(trade as any).tradeMode === 'TRAILING_TAKE' && (
-                                <Badge
-                                  variant="outline"
-                                  className="text-[10px] bg-yellow-500/20 text-yellow-700 border-yellow-500/50"
-                                  title={`Trade entered moonbag (trailing) mode after hitting target. Ratcheted through ${(trade as any).ladderRungsHit ?? 1} ladder rung${((trade as any).ladderRungsHit ?? 1) === 1 ? '' : 's'} before exit.`}
-                                >
-                                  🌙 MB×{(trade as any).ladderRungsHit ?? 1}
-                                </Badge>
-                              )}
-                            </div>
-                          </td>
-                          
-                          {/* 7. Gross P/L ($ + %) stacked - C2A */}
-                          <td className="p-2 text-right">
-                            <div className="space-y-0.5">
-                              <div className={cn("font-mono text-xs font-semibold", isGrossProfit ? "text-green-600" : "text-red-600")}>
-                                {isGrossProfit ? '+' : '-'}${formatNumber(Math.abs(grossPnl))}
-                              </div>
-                              <div className={cn("font-mono text-xs", isGrossProfit ? "text-green-600" : "text-red-600")}>
-                                {isGrossProfit ? '+' : ''}{formatNumber((grossPnl / (parseFloat(trade.quantity || '1') * parseFloat(trade.entryPrice || '1'))) * 100)}%
-                              </div>
-                            </div>
-                          </td>
-                          
-                          {/* 8. Entry Fee - C2A */}
-                          <td className="p-2 text-right font-mono text-xs text-muted-foreground">
-                            {entryFee > 0 ? `$${formatNumber(entryFee, 2)}` : '-'}
-                          </td>
-                          
-                          {/* 9. Entry Slippage - C2A */}
-                          <td className="p-2 text-right font-mono text-xs text-orange-600">
-                            {entrySlippage !== 0 ? `$${formatNumber(Math.abs(entrySlippage), 2)}` : '-'}
-                          </td>
-                          
-                          {/* 10. Exit Fee - C2A: Show positive value */}
-                          <td className="p-2 text-right font-mono text-xs text-muted-foreground">
-                            {exitFee !== 0 ? `$${formatNumber(Math.abs(exitFee), 2)}` : '-'}
-                          </td>
-                          
-                          {/* 11. Exit Slippage - C2A: Show positive value */}
-                          <td className="p-2 text-right font-mono text-xs text-orange-600">
-                            {exitSlippage !== 0 ? `$${formatNumber(Math.abs(exitSlippage), 2)}` : '-'}
-                          </td>
-                          
-                          {/* 12. Total Cost - C2A */}
-                          <td className="p-2 text-right font-mono text-xs font-medium text-red-600">
-                            {totalCost > 0 ? `$${formatNumber(totalCost, 2)}` : '-'}
-                          </td>
-                          
-                          {/* 13. Net P/L ($ + %) stacked - C2A */}
-                          <td className="p-2 text-right">
-                            <div className="space-y-0.5">
-                              <div className={cn("font-mono text-xs font-semibold", isNetProfit ? "text-green-600" : "text-red-600")}>
-                                {isNetProfit ? '+' : '-'}${formatNumber(Math.abs(netPnl))}
-                              </div>
-                              <div className={cn("font-mono text-xs", isNetProfit ? "text-green-600" : "text-red-600")}>
-                                {isNetProfit ? '+' : ''}{formatNumber(parseFloat(trade.netPnlPercent || trade.pnlPercent || '0'))}%
-                              </div>
-                            </div>
-                          </td>
-                          
-                          {/* 14. Confidence - C2A */}
-                          <td className="p-2 text-right">
-                            {(() => {
-                              const rawConf = parseFloat(trade.confidence || '0');
-                              const confidence = rawConf > 1 ? rawConf : rawConf * 100;
-                              const confColor = confidence >= 80 ? 'text-green-600' : 
-                                               confidence >= 60 ? 'text-blue-600' : 
-                                               confidence >= 40 ? 'text-orange-500' : 'text-red-600';
-                              return (
-                                <span className={cn("font-mono text-xs font-medium", confColor)}>
-                                  {trade.confidence ? `${formatNumber(confidence, 0)}%` : '-'}
-                                </span>
-                              );
-                            })()}
-                          </td>
-                          
-                          {/* 15. Market Regime - 11.4B */}
-                          <td className="p-2">
-                            {trade.marketRegime ? (
-                              <Badge variant="outline" className={cn("text-xs", getRegimeBadgeClassName(trade.marketRegime))}>
-                                {formatRegimeTitle(trade.marketRegime)}
-                              </Badge>
-                            ) : (
-                              <span className="text-muted-foreground text-xs">—</span>
-                            )}
-                          </td>
-                          
-                          {/* 16. Market Friction - 11.4B */}
-                          <td className="p-2">
-                            {trade.marketFrictionScore !== undefined && trade.marketFrictionScore !== null ? (
-                              <span className={cn(
-                                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
-                                getFrictionColorClasses(trade.marketFrictionScore).badge
-                              )}>
-                                {getFrictionLabel(trade.marketFrictionScore)}
-                              </span>
-                            ) : (
-                              <span className="text-muted-foreground text-xs">—</span>
-                            )}
-                          </td>
-                          
-                          {/* 17. Opened - C2A */}
-                          <td className="p-2 text-xs font-mono whitespace-nowrap">
-                            {formatTimestamp(trade.openedAt)}
-                          </td>
-                          
-                          {/* 16. Closed - C2A */}
-                          <td className="p-2 text-xs font-mono whitespace-nowrap">
-                            {formatTimestamp(trade.closedAt)}
-                          </td>
-
-                          {/* P19-B8.7 (OBJ-4): Duration (VTS-mirror) */}
-                          <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
-                            {trade.openedAt && trade.closedAt
-                              ? formatDuration(new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime())
-                              : '—'}
-                          </td>
-                        </tr>
-                      );
-                    })}
-                  </tbody>
-                </table>
-              </DualScrollTable>
+              {/* P19-B8.7 Step-9: the paper history table is now the SHARED
+                  VTS-mirror ClosedTradesTable (vts-closed-trades-table.tsx), fed
+                  through the pure adapter (paper-trade-adapter.ts) — one layout for
+                  VTS and paper (Kyle's layout-identity directive; Langston
+                  shared-component ruling B). Server-side filter/pagination stay on
+                  this shell; the shared table's column sort orders the CURRENT PAGE
+                  client-side. The old ~300-line bespoke table markup is deleted
+                  (rule 18). */}
+              <ClosedTradesTable
+                trades={filteredTrades.map(adaptPaperClosedTrade)}
+                emptyLabel="No trades match your filters"
+              />
               
               {/* Phase 8.8.3-C5: Pagination controls */}
               {totalPages > 1 && (
diff --git a/client/src/components/vts/vts-closed-trades-table.tsx b/client/src/components/vts/vts-closed-trades-table.tsx
index d318d4432..f8a7e8bff 100644
--- a/client/src/components/vts/vts-closed-trades-table.tsx
+++ b/client/src/components/vts/vts-closed-trades-table.tsx
@@ -24,9 +24,30 @@ import {
   isBenchmarkSymbol,
 } from "./vts-shared";
 
-type ClosedSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'resultType' | 'grossProfitValue' | 'netProfitValue' | 'finalScore' | 'expectedEdge' | 'regimeWeight' | 'exitTime' | 'durationMinutes';
+// P19-B8.7 Step-9: 'finalScore' removed with its column (retired metric, piece 2.7).
+type ClosedSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'resultType' | 'grossProfitValue' | 'netProfitValue' | 'expectedEdge' | 'regimeWeight' | 'exitTime' | 'durationMinutes';
 
-export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
+/**
+ * P19-B8.7 Step-9: this table is now the SHARED closed-trades component — the
+ * VTS tab AND the paper mode page both mount it (paper rows arrive via
+ * client/src/lib/paper-trade-adapter.ts). Paper-only affordances ride the two
+ * OPTIONAL append props, which DEFAULT OFF — the VTS mount passes nothing and
+ * renders exactly as before (Langston shared-component ruling B, condition 1).
+ */
+export function ClosedTradesTable({
+  trades,
+  extraHeaders,
+  renderExtraCells,
+  emptyLabel = "No closed trades in the last 7 days",
+}: {
+  trades: ClosedTrade[];
+  /** Appended <th> nodes rendered AFTER the standard columns. Default OFF. */
+  extraHeaders?: React.ReactNode;
+  /** Appended <td> nodes per row, matching extraHeaders. Default OFF. */
+  renderExtraCells?: (trade: ClosedTrade, index: number) => React.ReactNode;
+  /** Empty-state text; default keeps the VTS wording. */
+  emptyLabel?: string;
+}) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const topScrollRef = useRef<HTMLDivElement>(null);
   const [sortField, setSortField] = useState<ClosedSortField | null>(null);
@@ -54,11 +75,13 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
         case 'dollarValue': aVal = a.dollarValue ?? 0; bVal = b.dollarValue ?? 0; break;
         case 'entryPrice': aVal = a.entryPrice; bVal = b.entryPrice; break;
         case 'resultType': aVal = a.resultType; bVal = b.resultType; break;
-        case 'grossProfitValue': aVal = a.grossProfitValue ?? 0; bVal = b.grossProfitValue ?? 0; break;
-        case 'netProfitValue': aVal = a.netProfitValue ?? 0; bVal = b.netProfitValue ?? 0; break;
-        case 'finalScore': aVal = a.finalScore; bVal = b.finalScore; break;
-        case 'expectedEdge': aVal = a.expectedEdge; bVal = b.expectedEdge; break;
-        case 'regimeWeight': aVal = a.regimeWeight; bVal = b.regimeWeight; break;
+        // NaN-safe: adapter rows carry NaN for genuinely-null P/L (em-dash cells).
+        case 'grossProfitValue': aVal = Number.isFinite(a.grossProfitValue) ? a.grossProfitValue : 0; bVal = Number.isFinite(b.grossProfitValue) ? b.grossProfitValue : 0; break;
+        case 'netProfitValue': aVal = Number.isFinite(a.netProfitValue) ? a.netProfitValue : 0; bVal = Number.isFinite(b.netProfitValue) ? b.netProfitValue : 0; break;
+        // P19-B8.7 Step-9: finalScore sort case deleted with its column (retired
+        // metric, piece 2.7); edge/weight coalesce for adapter rows without them.
+        case 'expectedEdge': aVal = a.expectedEdge ?? 0; bVal = b.expectedEdge ?? 0; break;
+        case 'regimeWeight': aVal = a.regimeWeight ?? 0; bVal = b.regimeWeight ?? 0; break;
         case 'exitTime': aVal = new Date(a.exitTime).getTime(); bVal = new Date(b.exitTime).getTime(); break;
         case 'durationMinutes': aVal = a.durationMinutes; bVal = b.durationMinutes; break;
       }
@@ -97,7 +120,8 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
         onScroll={handleTopScroll}
         style={{ scrollbarWidth: 'thin' }}
       >
-        <div style={{ width: '2300px', height: '1px' }} />
+        {/* initial spacer width only; the HF7 effect re-syncs it to the real scrollWidth */}
+        <div style={{ width: '2800px', height: '1px' }} />
       </div>
       <div
         ref={scrollRef}
@@ -108,7 +132,7 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
         {/* B-NEW-31 (2026-05-14): outer container scrolls both axes with bounded
             max-height so the sticky thead + sticky first-column work correctly.
             Mirrors the OpenTradesTable freeze logic. */}
-        <table className="w-full min-w-[2400px] text-sm">
+        <table className="w-full min-w-[2800px] text-sm">
           <thead className="sticky top-0 bg-card z-20">
             <tr className="border-b border-border">
               {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
@@ -122,6 +146,10 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
               <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source Pool</th>
               {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
               <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="The maker/taker entry fee-mode this trade opened on (entry-side fee only). '—' for trades opened before this column existed.">Entry Fee Mode</th>
+              {/* P19-B8.7 Step-9: the B8.6 maker target-exit cohort stamps — which fee
+                  the EXIT actually paid, and whether a resting maker exit filled or
+                  converted to taker. '—' on rows without the stamps (VTS, pre-B8.6). */}
+              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Which fee mode the EXIT actually paid: maker = resting target-exit filled; taker = market exit (stops, converts, timeouts). 'fill'/'convert' shows the resting-exit outcome. '—' for rows without the stamps.">Exit Fee Mode</th>
               {/* B65.2-HF2c: TEC State column on Closed Simulated Trades for parity with Open table */}
               <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Trailing-exit mode the trade ended in. TARGET = closed at static target/stop/timeout; MOONBAG = flipped into trailing mode at target and closed via trailing stop or moonbag-duration cap.">TEC State</th>
               {/* B.2.UI (2026-06-02): entry-liquidity captured at trade-open.
@@ -133,7 +161,14 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
               <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
               <SortableHeader label="Result" field="resultType" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="center" />
               <SortableHeader label="Gross P/L" field="grossProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
-              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Costs</th>
+              {/* P19-B8.7 Step-9 (Kyle cost-transparency ruling): Costs is now a
+                  5-col REALIZED split. Rows without a breakdown (VTS today) show
+                  the total + em-dashes. */}
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side fee actually charged at open.">Entry Fee</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side slippage vs the intended price.">Entry Slip</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Exit-side fee actually charged at close.">Exit Fee</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Exit-side slippage vs the target exit price.">Exit Slip</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Total realized round-trip cost: entry fee + entry slip + exit fee + exit slip.">Total Costs</th>
               <SortableHeader label="Net P/L" field="netProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
 
               {/* P19-B8.7 Step-9 (Kyle 2026-07-17 ruling): FinalScore RETIRED — column removed. */}
@@ -146,13 +181,17 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
               <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl DBS</th>
               <SortableHeader label="Entry/Exit Time" field="exitTime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
               <SortableHeader label="Duration" field="durationMinutes" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
+              {/* P19-B8.7 Step-9: paper-only appended columns (default OFF) */}
+              {extraHeaders}
             </tr>
           </thead>
           <tbody>
             {sortedTrades.length === 0 ? (
               <tr>
-                <td colSpan={27} className="px-3 py-8 text-center text-muted-foreground">
-                  No closed trades in the last 7 days
+                {/* colSpan 33 = 32 standard columns post cost-split/exit-mode + headroom
+                    for appended paper columns (browsers clamp overshoot). */}
+                <td colSpan={33} className="px-3 py-8 text-center text-muted-foreground">
+                  {emptyLabel}
                 </td>
               </tr>
             ) : (
@@ -243,6 +282,24 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
                       ) : null}
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: Exit Fee Mode — the B8.6 exit_fee_mode stamp plus
+                      the resting-exit outcome (fill/convert). '—' when unstamped. */}
+                  <td className="px-3 py-2 text-xs whitespace-nowrap">
+                    {trade.exitFeeMode ? (
+                      <div className="flex flex-col gap-0.5">
+                        <span className={trade.exitFeeMode === 'maker' ? 'text-emerald-400' : 'text-muted-foreground'}>
+                          {trade.exitFeeMode.toUpperCase()}
+                        </span>
+                        {trade.exitRestOutcome && (
+                          <span className="text-[10px] text-muted-foreground">
+                            {trade.exitRestOutcome === 'fill' ? 'rested — filled' : trade.exitRestOutcome === 'convert' ? 'rested — converted' : trade.exitRestOutcome}
+                          </span>
+                        )}
+                      </div>
+                    ) : (
+                      <span className="text-muted-foreground">—</span>
+                    )}
+                  </td>
                   {/* B65.2-HF2c: TEC State column on Closed — TARGET vs MOONBAG end-state */}
                   {/* B65.4 (2026-04-25): MOONBAG badge shows ladder rung count (MB×N) when present */}
                   <td className="px-3 py-2">
@@ -309,30 +366,48 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
                     )}
                   </td>
                   <td className="px-3 py-2 text-right">
+                    {/* P19-B8.7 Step-9 (Langston note 2): a genuinely-null P/L arrives
+                        as NaN from the adapter — em-dash, never a fabricated $0.00. */}
                     <div className="flex flex-col gap-0.5">
                       <span className={`font-mono text-xs ${getProfitColor(trade.grossProfitValue)}`}>
-                        ${trade.grossProfitValue.toFixed(2)}
+                        {Number.isFinite(trade.grossProfitValue) ? `$${trade.grossProfitValue.toFixed(2)}` : '—'}
                       </span>
                       <span className={`text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                         {trade.grossProfitPercent}
                       </span>
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: realized cost 5-col split. Breakdown absent →
+                      em-dash (never a fabricated 0); the total renders either way. */}
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costEntryFee != null ? `$${trade.costEntryFee.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costEntrySlippage != null ? `$${trade.costEntrySlippage.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costExitFee != null ? `$${trade.costExitFee.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costExitSlippage != null ? `$${trade.costExitSlippage.toFixed(4)}` : '—'}
+                  </td>
                   <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                     ${trade.costs.toFixed(4)}
                   </td>
                   <td className="px-3 py-2 text-right">
                     <div className="flex flex-col gap-0.5">
                       <span className={`font-mono text-xs ${getProfitColor(trade.netProfitValue)}`}>
-                        ${trade.netProfitValue.toFixed(2)}
+                        {Number.isFinite(trade.netProfitValue) ? `$${trade.netProfitValue.toFixed(2)}` : '—'}
                       </span>
                       <span className={`text-xs ${getProfitColor(trade.netProfitValue)}`}>
                         {trade.netProfitPercent}
                       </span>
                     </div>
                   </td>
-                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge.toFixed(2)}</td>
-                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight.toFixed(2)}</td>
+                  {/* P19-B8.7 Step-9: absent values render an em-dash, never a
+                      fabricated 0.00 (adapter rows may lack metadata-sourced numbers). */}
+                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge != null ? trade.expectedEdge.toFixed(2) : '—'}</td>
+                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight != null ? trade.regimeWeight.toFixed(2) : '—'}</td>
                   <td className="px-3 py-2 text-xs">{trade.globalRegime || '\u2014'}</td>
                   <td className="px-3 py-2 text-right font-mono text-xs">{trade.pairFriction != null ? getFrictionLabel(Math.round(trade.pairFriction)) : '\u2014'}</td>
                   <td className="px-3 py-2 text-right font-mono text-xs">{trade.globalFriction != null ? getFrictionLabel(Math.round(trade.globalFriction)) : '\u2014'}</td>
@@ -368,6 +443,8 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
                       {formatDuration(trade.durationMinutes)}
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: paper-only appended cells (default OFF) */}
+                  {renderExtraCells?.(trade, idx)}
                 </tr>
               ))
             )}
diff --git a/client/src/components/vts/vts-open-trades-table.tsx b/client/src/components/vts/vts-open-trades-table.tsx
index ab63f4e24..551fc7bdd 100644
--- a/client/src/components/vts/vts-open-trades-table.tsx
+++ b/client/src/components/vts/vts-open-trades-table.tsx
@@ -8,6 +8,12 @@ import { Clock } from "lucide-react";
 import { format } from "date-fns";
 import { getFrictionLabel } from "@/utils/frictionColor";
 import { formatEntryFeeMode } from "@/lib/utils";
+// P19-B8.7 Step-9 (B8.9 carry, reconciled to OLD Claude's pushed b28cf7074): the
+// venue-quiet Current-price treatment is ONE portable renderer driven by the
+// SERVER's single age-aware priceVenueQuiet boolean (no client-side source
+// classification — the age-blind helper was removed with his push). Paper
+// adapter rows carry priceVenueQuiet/priceAgeMs; VTS rows don't (normal render).
+import { VenueQuietPrice } from "@/components/trading/venue-quiet-price-cell";
 import {
   type OpenTrade,
   type OpenSortField,
@@ -23,7 +29,28 @@ import {
   isBenchmarkSymbol,
 } from "./vts-shared";
 
-export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
+/**
+ * P19-B8.7 Step-9: this table is now the SHARED open-trades component — the VTS
+ * tab AND the paper mode page both mount it (paper rows arrive via
+ * client/src/lib/paper-trade-adapter.ts). Paper-only affordances (Slot, Actions,
+ * …) ride the two OPTIONAL append props, which DEFAULT OFF — the VTS mount
+ * passes nothing and renders exactly as before (Langston shared-component
+ * ruling B, condition 1).
+ */
+export function OpenTradesTable({
+  trades,
+  extraHeaders,
+  renderExtraCells,
+  emptyLabel = "No open simulated trades",
+}: {
+  trades: OpenTrade[];
+  /** Appended <th> nodes rendered AFTER the standard columns. Default OFF. */
+  extraHeaders?: React.ReactNode;
+  /** Appended <td> nodes per row, matching extraHeaders. Default OFF. */
+  renderExtraCells?: (trade: OpenTrade, index: number) => React.ReactNode;
+  /** Empty-state text; default keeps the VTS wording. */
+  emptyLabel?: string;
+}) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const topScrollRef = useRef<HTMLDivElement>(null);
   const [sortField, setSortField] = useState<OpenSortField | null>(null);
@@ -52,9 +79,10 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
         case 'entryPrice': aVal = a.entryPrice; bVal = b.entryPrice; break;
         case 'grossProfitValue': aVal = a.grossProfitValue ?? 0; bVal = b.grossProfitValue ?? 0; break;
         case 'netProfitValue': aVal = a.netProfitValue ?? 0; bVal = b.netProfitValue ?? 0; break;
-        case 'finalScore': aVal = a.finalScore; bVal = b.finalScore; break;
-        case 'expectedEdge': aVal = a.expectedEdge; bVal = b.expectedEdge; break;
-        case 'regimeWeight': aVal = a.regimeWeight; bVal = b.regimeWeight; break;
+        // P19-B8.7 Step-9: finalScore sort case deleted with its column (retired
+        // metric, piece 2.7); edge/weight coalesce for adapter rows without them.
+        case 'expectedEdge': aVal = a.expectedEdge ?? 0; bVal = b.expectedEdge ?? 0; break;
+        case 'regimeWeight': aVal = a.regimeWeight ?? 0; bVal = b.regimeWeight ?? 0; break;
         case 'entryTime': aVal = new Date(a.entryTime).getTime(); bVal = new Date(b.entryTime).getTime(); break;
         case 'durationOpenMinutes': aVal = a.durationOpenMinutes; bVal = b.durationOpenMinutes; break;
       }
@@ -93,7 +121,8 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
         onScroll={handleTopScroll}
         style={{ scrollbarWidth: 'thin' }}
       >
-        <div style={{ width: '2300px', height: '1px' }} />
+        {/* initial spacer width only; the HF7 effect re-syncs it to the real scrollWidth */}
+        <div style={{ width: '2700px', height: '1px' }} />
       </div>
       <div
         ref={scrollRef}
@@ -105,7 +134,7 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
             max-height so the sticky thead + sticky first-column work correctly. Header
             stays pinned on vertical scroll; Symbol column stays pinned on horizontal
             scroll. Top-left corner uses z-30 so it sits above both axes. */}
-        <table className="w-full min-w-[2400px] text-sm">
+        <table className="w-full min-w-[2700px] text-sm">
           <thead className="sticky top-0 bg-card z-20">
             <tr className="border-b border-border">
               {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
@@ -130,7 +159,14 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
               <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
               <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dist. T/S</th>
               <SortableHeader label="Gross P/L" field="grossProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
-              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Costs</th>
+              {/* P19-B8.7 Step-9 (Kyle cost-transparency ruling): Costs is now a
+                  5-col split — entry fee/slip + estimated exit fee/slip + total.
+                  Rows without a breakdown (VTS today) show the total + em-dashes. */}
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side fee actually charged at open.">Entry Fee</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side slippage vs the intended price.">Entry Slip</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="ESTIMATED exit-side fee (realized at close).">Est Exit Fee</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="ESTIMATED exit-side slippage (realized at close).">Est Exit Slip</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Total round-trip cost estimate: entry fee + entry slip + est exit fee + est exit slip.">Total Costs</th>
               <SortableHeader label="Net P/L" field="netProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
 
               <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rank</th>
@@ -146,13 +182,18 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
               <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl DBS</th>
               <SortableHeader label="Entry Time" field="entryTime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
               <SortableHeader label="Duration" field="durationOpenMinutes" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
+              {/* P19-B8.7 Step-9: paper-only appended columns (default OFF) */}
+              {extraHeaders}
             </tr>
           </thead>
           <tbody>
             {sortedTrades.length === 0 ? (
               <tr>
-                <td colSpan={28} className="px-3 py-8 text-center text-muted-foreground">
-                  No open simulated trades
+                {/* colSpan 33 = 32 standard columns post cost-split + 1 headroom for
+                    appended paper columns (browsers clamp overshoot to the row width;
+                    matches the closed table's 32+1 pattern — Langston Step-4 note 1). */}
+                <td colSpan={33} className="px-3 py-8 text-center text-muted-foreground">
+                  {emptyLabel}
                 </td>
               </tr>
             ) : (
@@ -286,9 +327,16 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                   <td className="px-3 py-2 text-right">
                     <div className="flex flex-col gap-0.5">
                       <span className="font-mono text-xs">${trade.entryPrice.toFixed(4)}</span>
-                      <span className={`font-mono text-xs ${trade.currentPrice === null ? 'text-yellow-500' : 'text-muted-foreground'}`}>
-                        {trade.currentPrice !== null ? `$${trade.currentPrice.toFixed(4)}` : 'Stale'}
-                      </span>
+                      {/* P19-B8.7 Step-9 (B8.9 carry): the server's age-aware quiet
+                          verdict drives the treatment — one notion, no per-surface
+                          drift. Rows without the flag (VTS) render exactly as before. */}
+                      {trade.priceVenueQuiet ? (
+                        <VenueQuietPrice price={trade.currentPrice} ageMs={trade.priceAgeMs} decimals={4} className="text-xs" />
+                      ) : (
+                        <span className={`font-mono text-xs ${trade.currentPrice === null ? 'text-yellow-500' : 'text-muted-foreground'}`}>
+                          {trade.currentPrice !== null ? `$${trade.currentPrice.toFixed(4)}` : 'Stale'}
+                        </span>
+                      )}
                     </div>
                   </td>
                   <td className="px-3 py-2 text-right">
@@ -317,6 +365,20 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                       <span className="text-xs text-muted-foreground">-</span>
                     )}
                   </td>
+                  {/* P19-B8.7 Step-9: cost 5-col split. Breakdown absent → em-dash
+                      (never a fabricated 0); the total renders either way. */}
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costEntryFee != null ? `$${trade.costEntryFee.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costEntrySlippage != null ? `$${trade.costEntrySlippage.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costExitFee != null ? `$${trade.costExitFee.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costExitSlippage != null ? `$${trade.costExitSlippage.toFixed(4)}` : '—'}
+                  </td>
                   <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                     ${trade.costs.toFixed(4)}
                   </td>
@@ -334,9 +396,11 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                       <span className="text-xs text-muted-foreground">-</span>
                     )}
                   </td>
-                  <td className="px-3 py-2 text-right font-mono text-xs text-purple-400">{(trade.rankingScore ?? 0).toFixed(2)}</td>
-                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge.toFixed(2)}</td>
-                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight.toFixed(2)}</td>
+                  {/* P19-B8.7 Step-9: absent values render an em-dash, never a
+                      fabricated 0.00 (adapter rows may lack metadata-sourced numbers). */}
+                  <td className="px-3 py-2 text-right font-mono text-xs text-purple-400">{trade.rankingScore != null ? trade.rankingScore.toFixed(2) : '—'}</td>
+                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge != null ? trade.expectedEdge.toFixed(2) : '—'}</td>
+                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight != null ? trade.regimeWeight.toFixed(2) : '—'}</td>
                   <td className="px-3 py-2 text-xs">{trade.globalRegime || '\u2014'}</td>
                   <td className="px-3 py-2 text-right font-mono text-xs">{trade.pairFriction != null ? getFrictionLabel(Math.round(trade.pairFriction)) : '\u2014'}</td>
                   <td className="px-3 py-2 text-right font-mono text-xs">{trade.globalFriction != null ? getFrictionLabel(Math.round(trade.globalFriction)) : '\u2014'}</td>
@@ -369,6 +433,8 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                       {formatDuration(trade.durationOpenMinutes)}
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: paper-only appended cells (default OFF) */}
+                  {renderExtraCells?.(trade, idx)}
                 </tr>
               ))
             )}
diff --git a/client/src/components/vts/vts-shared.tsx b/client/src/components/vts/vts-shared.tsx
index 775d0ce7a..23b6ccba3 100644
--- a/client/src/components/vts/vts-shared.tsx
+++ b/client/src/components/vts/vts-shared.tsx
@@ -29,10 +29,16 @@ export interface OpenTrade {
   netProfitValue: number;
   netProfitPercent: string;
   rankingScore?: number; // Batch 47f15: Cross-family desirability score
-  finalScore: number;
-  hybridScore: number;
-  expectedEdge: number;
-  regimeWeight: number;
+  // P19-B8.7 Step-9: OPTIONAL since the Final/Hybrid cells were deleted (Kyle's
+  // FinalScore retirement, piece 2.7); the paper adapter omits them entirely.
+  // Full field death rides #525 (B-FINALSCORE-PURGE).
+  finalScore?: number;
+  hybridScore?: number;
+  // P19-B8.7 Step-9: OPTIONAL — the paper adapter sources these from signal
+  // metadata, which is absent on some rows (em-dash render, never a fabricated
+  // number). The VTS serializer always provides them, so VTS is unaffected.
+  expectedEdge?: number;
+  regimeWeight?: number;
   entryTime: string;
   durationOpenMinutes: number;
   globalRegime: string | null;
@@ -67,6 +73,18 @@ export interface OpenTrade {
   state?: string;
   mtTwin?: boolean;
   mtPairId?: string | null;
+  // P19-B8.7 Step-9: cost 5-col breakdown (entry fee/slip + ESTIMATED exit
+  // fee/slip). Present on paper adapter rows; absent (em-dash) until the VTS
+  // serializer carries a split. `costs` stays the single total either way.
+  costEntryFee?: number | null;
+  costEntrySlippage?: number | null;
+  costExitFee?: number | null;
+  costExitSlippage?: number | null;
+  // P19-B8.7 Step-9 (B8.9 carry, b28cf7074 reconciled): the SERVER's single
+  // age-aware venue-quiet verdict + price age for the Current cell. Paper rows
+  // carry these; VTS rows don't (normal render).
+  priceVenueQuiet?: boolean;
+  priceAgeMs?: number | null;
 }
 
 export interface ClosedTrade {
@@ -92,10 +110,16 @@ export interface ClosedTrade {
   netProfitValue: number;
   netProfitPercent: string;
   rankingScore?: number; // Batch 47f15: Cross-family desirability score
-  finalScore: number;
-  hybridScore: number;
-  expectedEdge: number;
-  regimeWeight: number;
+  // P19-B8.7 Step-9: OPTIONAL since the Final/Hybrid cells were deleted (Kyle's
+  // FinalScore retirement, piece 2.7); the paper adapter omits them entirely.
+  // Full field death rides #525 (B-FINALSCORE-PURGE).
+  finalScore?: number;
+  hybridScore?: number;
+  // P19-B8.7 Step-9: OPTIONAL — the paper adapter sources these from signal
+  // metadata, which is absent on some rows (em-dash render, never a fabricated
+  // number). The VTS serializer always provides them, so VTS is unaffected.
+  expectedEdge?: number;
+  regimeWeight?: number;
   entryTime: string;
   exitTime: string;
   durationMinutes: number;
@@ -132,6 +156,15 @@ export interface ClosedTrade {
   mtTwin?: boolean;
   mtPairId?: string | null;
   countsInAggregates?: boolean;
+  // P19-B8.7 Step-9: realized cost 5-col breakdown + the B8.6 maker target-exit
+  // cohort stamps (exit_fee_mode / exit_rest_outcome). Present on paper adapter
+  // rows; em-dash on VTS rows until their serializers carry them.
+  costEntryFee?: number | null;
+  costEntrySlippage?: number | null;
+  costExitFee?: number | null;
+  costExitSlippage?: number | null;
+  exitFeeMode?: string | null;
+  exitRestOutcome?: string | null;
 }
 
 // Batch 19H: Filter Pipeline Diagnostics types
@@ -345,7 +378,8 @@ export function isBenchmarkSymbol(symbol: string): boolean {
   return BENCHMARK_BASE_COINS.includes(base);
 }
 
-export type OpenSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'grossProfitValue' | 'netProfitValue' | 'finalScore' | 'expectedEdge' | 'regimeWeight' | 'entryTime' | 'durationOpenMinutes';
+// P19-B8.7 Step-9: 'finalScore' removed with its column (retired metric, piece 2.7).
+export type OpenSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'grossProfitValue' | 'netProfitValue' | 'expectedEdge' | 'regimeWeight' | 'entryTime' | 'durationOpenMinutes';
 export type SortDirection = 'asc' | 'desc';
 
 export function SortableHeader({
diff --git a/client/src/pages/live-trading.tsx b/client/src/pages/live-trading.tsx
index e7ac93475..6fcdfd68c 100644
--- a/client/src/pages/live-trading.tsx
+++ b/client/src/pages/live-trading.tsx
@@ -9,7 +9,9 @@
 import ModeTradingPage, { type ModeTradingPageConfig } from "@/pages/mode-trading";
 import { Badge } from "@/components/ui/badge";
 import { Lightbulb, LineChart, TrendingUp, BarChart3, History, Ghost, LayoutDashboard } from "lucide-react";
-import ActiveTradesV2 from "@/components/trading/active-trades-v2";
+// P19-B8.7 Step-9: the Open Trades tab is the shared VTS-mirror table behind the
+// paper shell (replaces active-trades-v2, deleted — rule 18). Dormant on live.
+import PaperOpenTradesTab from "@/components/trading/paper-open-trades-tab";
 import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
 import { ExecutionMetricsPanel } from "@/components/trading/execution-metrics";
 import { TradeHistoryTab } from "@/components/trading/trade-history-tab";
@@ -48,7 +50,7 @@ const config: ModeTradingPageConfig = {
         </>
       ),
     },
-    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <ActiveTradesV2 mode="live" /> },
+    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <PaperOpenTradesTab mode="live" /> },
     { key: "closed", label: "Closed Trades", shortLabel: "Closed", icon: History, render: () => <TradeHistoryTab /> },
     { key: "shadows", label: "Shadows", shortLabel: "Shadow", icon: Ghost, render: () => <ShadowTradesTab /> },
   ],
diff --git a/client/src/pages/paper-trading.tsx b/client/src/pages/paper-trading.tsx
index e357d32aa..d524bd191 100644
--- a/client/src/pages/paper-trading.tsx
+++ b/client/src/pages/paper-trading.tsx
@@ -8,7 +8,9 @@
  */
 import ModeTradingPage, { type ModeTradingPageConfig } from "@/pages/mode-trading";
 import { Lightbulb, LineChart, TrendingUp, BarChart3, History, Ghost, LayoutDashboard } from "lucide-react";
-import ActiveTradesV2 from "@/components/trading/active-trades-v2";
+// P19-B8.7 Step-9: the Open Trades tab is the shared VTS-mirror table behind the
+// paper shell (replaces active-trades-v2, deleted — rule 18).
+import PaperOpenTradesTab from "@/components/trading/paper-open-trades-tab";
 import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
 import { ExecutionMetricsPanel } from "@/components/trading/execution-metrics";
 import { TradeHistoryTab } from "@/components/trading/trade-history-tab";
@@ -45,7 +47,7 @@ const config: ModeTradingPageConfig = {
         </>
       ),
     },
-    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <ActiveTradesV2 mode="paper" /> },
+    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <PaperOpenTradesTab mode="paper" /> },
     { key: "closed", label: "Closed Trades", shortLabel: "Closed", icon: History, render: () => <TradeHistoryTab /> },
     { key: "shadows", label: "Shadows", shortLabel: "Shadow", icon: Ghost, render: () => <ShadowTradesTab /> },
   ],
diff --git a/server/asset_classes/xstock_spot/eval-cycle.ts b/server/asset_classes/xstock_spot/eval-cycle.ts
index e1828f9e3..35b1eaf4c 100644
--- a/server/asset_classes/xstock_spot/eval-cycle.ts
+++ b/server/asset_classes/xstock_spot/eval-cycle.ts
@@ -636,7 +636,13 @@ export async function evaluateXstockPairForVTS(
         const entryPrice = strategySignal.entryPrice;
         const takeProfit = strategySignal.targetPrice;
         const stopLoss = strategySignal.stopPrice;
-        const spread = 0.001;
+        // P19-B8.7 Step-9 FIX-ON-FIND (rule 23): `const spread = 0.001` DELETED.
+        // It was CRYPTO's spread constant hardcoded into the xStock lane — below
+        // even this class's own static default (0.0012, friction.ts:37, the
+        // observed 12bps mid-range) — and it silently overrode the per-symbol
+        // MEASURED spread that getCachedCostMetrics already serves for xstock
+        // (B-5 AMR Obj-12: measured-with-fallback + spreadSource provenance).
+        // The friction blend below now consumes costMetrics.spread.
         const hybridScore = computeRealHybridScore(strategyKey, mceContext.indicators, ohlc as any, regime);
         // B79.0n.SCORING (2026-05-26): assetClass threaded for per-class cache-key isolation.
         // xstock_spot file — hardcoded class literal matches file scope.
@@ -715,7 +721,10 @@ export async function evaluateXstockPairForVTS(
         // B79.0n.MCE: assetClass REQUIRED — this is the xStock eval cycle, so
         // the file-level ASSET_CLASS constant ('xstock_spot') is passed directly.
         const costMetrics = getCachedCostMetrics(symbol, ASSET_CLASS);
-        const totalFriction = (costMetrics.fee * 2) + (costMetrics.slippage * 2) + spread;
+        // P19-B8.7 Step-9 (rule 23): costMetrics.spread — per-symbol MEASURED
+        // when the friction-sample store has a fresh sample, the class static
+        // default (0.0012) otherwise. Was a hardcoded 0.001 (crypto's constant).
+        const totalFriction = (costMetrics.fee * 2) + (costMetrics.slippage * 2) + costMetrics.spread;
         // P19-B8.5b (OBJ-3, #500): the predictiveConfidence×100 DI proxy is DELETED (rule 18 —
         // FINDING B's second site; the crypto twin died at vts-runner in the same diff). The
         // kernel now consumes the LANE-NATIVE real DI: the imf-evaluator's own computed value
@@ -976,6 +985,13 @@ export async function evaluateXstockPairForVTS(
           dollarValue,
           quantity,
           frictionCost: totalFriction,
+          // P19-B8.7 Step-9 (#527): the components behind totalFriction, for the
+          // UI cost 5-col split — the SAME three terms summed into the blend
+          // above (post rule-23 fix: costMetrics.spread, measured-with-fallback),
+          // so the split reconciles to frictionCost exactly.
+          costFeeFraction: costMetrics.fee,
+          costSlippageFraction: costMetrics.slippage,
+          costSpreadFraction: costMetrics.spread,
           regime,
           regimeScore: regimeScoreRaw,
           signalType: stratDef.signalType,
diff --git a/server/services/active-filter-pool.ts b/server/services/active-filter-pool.ts
index 15d47aaa8..b1eded12a 100644
--- a/server/services/active-filter-pool.ts
+++ b/server/services/active-filter-pool.ts
@@ -340,6 +340,15 @@ class ActiveFilterPoolService {
       currentPrice: number;
       volume24h: number;
       dailyRange: number;
+      // P19-B8.7 rider (Kyle 2026-07-17, code-confirmed): the pattern intake DROPPED
+      // the B63 DBS/DI the scanner had already computed — this writer had no fields
+      // for them, so pattern-lane signals queued with NULL dbs/di UNLESS the same
+      // symbol happened to sit in the quant pool (lookup order luck). Same optional
+      // shape as addSurvivors; absent stays honest-undefined, never fabricated.
+      dbsScore?: number;
+      dbsCategory?: string;
+      dbsSlope?: number;
+      DI?: number;
     }>
   ): {
     added: number;
@@ -379,6 +388,13 @@ class ActiveFilterPoolService {
         source: mode,
         sourcePool: 'pattern',       // Phase 14.5: pattern pool origin
         assetClass: 'crypto_spot',   // Phase 14.5: default asset class
+        // P19-B8.7 rider: carry the scanner's B63 DBS + DI onto pattern entries
+        // (parity with addSurvivors) so pattern-lane signals queue with a real
+        // dbs_score_at_queue / di_at_queue instead of a coverage-luck NULL.
+        dbsScore: survivor.dbsScore,
+        dbsCategory: survivor.dbsCategory,
+        dbsSlope: survivor.dbsSlope,
+        di: survivor.DI,
         fx5Snapshot: {
           volume24h: survivor.volume24h,
           dailyRange: survivor.dailyRange,
diff --git a/server/services/fx5-scanner.ts b/server/services/fx5-scanner.ts
index f61cd2ffa..d5942b34f 100644
--- a/server/services/fx5-scanner.ts
+++ b/server/services/fx5-scanner.ts
@@ -1423,6 +1423,14 @@ export class Fx5ScannerService {
             currentPrice: s.currentPrice ?? 0,
             volume24h: s.volume24h ?? 0,
             dailyRange: s.dailyRange ?? 0,
+            // P19-B8.7 rider (Kyle 2026-07-17): patternPoolSurvivors are built by
+            // merging the B63-CLASSIFIED pair (spread at :1267), so the scanner's
+            // DBS + DI are in hand RIGHT HERE — the old map dropped them at the
+            // pool door, which is why pattern signals queued with NULL dbs/di.
+            dbsScore: (s as any).dbsScore,
+            dbsCategory: (s as any).dbsCategory,
+            dbsSlope: (s as any).dbsSlope,
+            DI: (s as any).DI,
           })));
           console.log(`[14.5][PATTERN_POOL] Pattern pool populated: added=${patternStats.added}, skipped=${patternStats.skipped}`);
         }
diff --git a/server/services/vts-runner.ts b/server/services/vts-runner.ts
index 2a90c1f7e..69c02c6cd 100644
--- a/server/services/vts-runner.ts
+++ b/server/services/vts-runner.ts
@@ -553,6 +553,14 @@ interface Phase10TradeRecord {
   // Optional — pre-B7.2b records lack it (UI renders NULL as an em-dash).
   chosenEntryMode?: 'taker' | 'maker';
   entryFeeRate?: number;
+  // P19-B8.7 Step-9: the friction COMPONENTS behind frictionCost (per-leg
+  // fractions from getCachedCostMetrics), captured at open so the UI cost 5-col
+  // split renders honestly. frictionCost stays the blended round-trip scalar
+  // (fee×2 + slippage×2 + spread). Absent on pre-B8.7 records → em-dash, never
+  // a back-derived fabrication.
+  costFeeFraction?: number;
+  costSlippageFraction?: number;
+  costSpreadFraction?: number;
 }
 
 /**
@@ -1995,6 +2003,11 @@ async function generatePhase10Signal(
     dollarValue,      // Directive 11.6H: Fixed USD exposure
     quantity,         // Directive 11.6H: Variable coin units
     frictionCost,
+    // P19-B8.7 Step-9: the components behind frictionCost, persisted (context
+    // jsonb) so the UI cost 5-col split renders honestly. Fractions, per leg.
+    costFeeFraction: costMetrics.fee,
+    costSlippageFraction: costMetrics.slippage,
+    costSpreadFraction: costMetrics.spread,
     regime,
     regimeScore: regimeScoreRaw,
     signalType,
@@ -2195,6 +2208,11 @@ async function generatePhase10Signal(
     regimeWeight,
     decayPenalty,
     frictionCost,
+    // P19-B8.7 Step-9: friction components onto the closed-archive record too,
+    // so the closed-trades cost 5-col split renders honestly.
+    costFeeFraction: costMetrics.fee,
+    costSlippageFraction: costMetrics.slippage,
+    costSpreadFraction: costMetrics.spread,
     entry: entryPrice,
     exit: undefined, // Directive 11.6: Exit determined by real price resolution
     profit: undefined, // Directive 11.6: P&L calculated at exit
@@ -3859,6 +3877,12 @@ export interface RegisterOpenVtsTradeInput {
   dollarValue: number;
   quantity: number;
   frictionCost: number;
+  // P19-B8.7 Step-9: optional friction components behind frictionCost (per-leg
+  // fractions). Callers with cost metrics in hand pass them so the UI cost 5-col
+  // split renders; absent → em-dash (never back-derived from the blend).
+  costFeeFraction?: number;
+  costSlippageFraction?: number;
+  costSpreadFraction?: number;
   regime: MarketRegimeType;
   regimeScore: number;
   signalType: CanonicalSignalType;
@@ -3991,6 +4015,11 @@ export async function registerOpenVtsTrade(input: RegisterOpenVtsTradeInput): Pr
     dollarValue: input.dollarValue,
     quantity: input.quantity,
     frictionCost: input.frictionCost,
+    // P19-B8.7 Step-9: friction-component passthrough (cost 5-col split).
+    // Absent (caller without cost metrics) → undefined → em-dash.
+    costFeeFraction: input.costFeeFraction,
+    costSlippageFraction: input.costSlippageFraction,
+    costSpreadFraction: input.costSpreadFraction,
     regime: input.regime,
     regimeScore: input.regimeScore,
     signalType: input.signalType,
@@ -5555,6 +5584,24 @@ export async function getOpenVirtualTradesForML(): Promise<Array<{
       grossProfitValue: parseFloat(grossProfitValue.toFixed(2)),
       grossProfitPercent: (parseFloat(grossProfitPercent) >= 0 ? '+' : '') + grossProfitPercent + '%',
       costs: parseFloat(costsDollar.toFixed(4)),
+      // P19-B8.7 Step-9: cost 5-col split, derived from the captured friction
+      // COMPONENTS (never back-derived from the blend). Convention: the spread
+      // cost is allocated HALF to each slip leg, so the four columns sum exactly
+      // to `costs` (frictionCost = fee×2 + slippage×2 + spread). Rows opened
+      // before the components were captured render em-dashes.
+      ...(() => {
+        const _f = trade.costFeeFraction, _s = trade.costSlippageFraction, _sp = trade.costSpreadFraction;
+        if (typeof _f !== 'number' || typeof _s !== 'number' || typeof _sp !== 'number'
+            || !isFinite(_f) || !isFinite(_s) || !isFinite(_sp)) {
+          return { costEntryFee: null, costEntrySlippage: null, costExitFee: null, costExitSlippage: null };
+        }
+        return {
+          costEntryFee: parseFloat((tradeDollarValue * _f).toFixed(4)),
+          costEntrySlippage: parseFloat((tradeDollarValue * (_s + _sp / 2)).toFixed(4)),
+          costExitFee: parseFloat((tradeDollarValue * _f).toFixed(4)),
+          costExitSlippage: parseFloat((tradeDollarValue * (_s + _sp / 2)).toFixed(4)),
+        };
+      })(),
       netProfitValue: parseFloat(netProfitValue.toFixed(2)),
       netProfitPercent: (parseFloat(netProfitPercent) >= 0 ? '+' : '') + netProfitPercent + '%',
       // Batch 47f15: Compute ranking score for display (same formula as RTB queue)
diff --git a/server/utils/export-csv.ts b/server/utils/export-csv.ts
index ab6160196..e37ee0b6b 100644
--- a/server/utils/export-csv.ts
+++ b/server/utils/export-csv.ts
@@ -86,6 +86,14 @@ export async function getClosedVTSTradesFromLogs(days: number = 7): Promise<Arra
   grossProfitValue: number;
   grossProfitPercent: string;
   costs: number;
+  // P19-B8.7 Step-9: cost 5-col split, derived from the friction COMPONENTS
+  // captured at open (costFee/Slippage/SpreadFraction on the record). Spread is
+  // allocated half to each slip leg so the four columns sum exactly to `costs`.
+  // null on records opened before the components were captured (em-dash).
+  costEntryFee: number | null;
+  costEntrySlippage: number | null;
+  costExitFee: number | null;
+  costExitSlippage: number | null;
   netProfitValue: number;
   netProfitPercent: string;
   finalScore: number;
@@ -208,6 +216,7 @@ export async function getClosedVTSTradesFromLogs(days: number = 7): Promise<Arra
               resultType: 'never_filled',
               countsInAggregates: false,
               grossProfitValue: 0, grossProfitPercent: '0.00%', costs: 0,
+              costEntryFee: null, costEntrySlippage: null, costExitFee: null, costExitSlippage: null,
               netProfitValue: 0, netProfitPercent: '0.00%',
               finalScore: 0, hybridScore: 0, expectedEdge: 0, regimeWeight: 0,
               entryTime: new Date(trade.entryTime).toISOString(),
@@ -312,6 +321,21 @@ export async function getClosedVTSTradesFromLogs(days: number = 7): Promise<Arra
             grossProfitValue: parseFloat(grossProfitValue.toFixed(2)),
             grossProfitPercent: (parseFloat(grossProfitPercent) >= 0 ? '+' : '') + grossProfitPercent + '%',
             costs: parseFloat(costsDollar.toFixed(4)),
+            // P19-B8.7 Step-9: cost 5-col split from the captured components
+            // (spread halved into each slip leg — sums exactly to `costs`).
+            ...(() => {
+              const _f = trade.costFeeFraction, _s = trade.costSlippageFraction, _sp = trade.costSpreadFraction;
+              if (typeof _f !== 'number' || typeof _s !== 'number' || typeof _sp !== 'number'
+                  || !isFinite(_f) || !isFinite(_s) || !isFinite(_sp)) {
+                return { costEntryFee: null, costEntrySlippage: null, costExitFee: null, costExitSlippage: null };
+              }
+              return {
+                costEntryFee: parseFloat((tradeDollarValue * _f).toFixed(4)),
+                costEntrySlippage: parseFloat((tradeDollarValue * (_s + _sp / 2)).toFixed(4)),
+                costExitFee: parseFloat((tradeDollarValue * _f).toFixed(4)),
+                costExitSlippage: parseFloat((tradeDollarValue * (_s + _sp / 2)).toFixed(4)),
+              };
+            })(),
             netProfitValue: parseFloat(netProfitValue.toFixed(2)),
             netProfitPercent: (parseFloat(netProfitPercent) >= 0 ? '+' : '') + netProfitPercent + '%',
             finalScore: trade.finalScore || trade.signal?.finalScore || 0,
diff --git a/client/src/components/trading/active-trades-v2.tsx b/client/src/components/trading/active-trades-v2.tsx
deleted file mode 100644
index f99f1d536..000000000
--- a/client/src/components/trading/active-trades-v2.tsx
+++ /dev/null
@@ -1,1362 +0,0 @@
-import { useState, useMemo, useEffect, useRef, useCallback } from "react";
-import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
-import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
-import { Button } from "@/components/ui/button";
-import { Badge } from "@/components/ui/badge";
-import { Skeleton } from "@/components/ui/skeleton";
-import { cn, formatEntryFeeMode } from "@/lib/utils";
-import { useTradingMode } from "@/contexts/trading-mode-context";
-import { useToast } from "@/hooks/use-toast";
-import { useWebSocket } from "@/hooks/use-websocket";
-import { apiFetch } from "@/lib/api";
-import { getFrictionColorClasses, getRegimeBadgeClassName, getFrictionLabel, formatRegimeTitle } from "@/utils/frictionColor";
-import { AssetClassBadge } from "@/components/ui/asset-class-badge";
-import {
-  ArrowUpDown,
-  ArrowUp, 
-  ArrowDown, 
-  X, 
-  AlertTriangle, 
-  CheckCircle2,
-  Clock,
-  Target,
-  Shield,
-  Trash2,
-  RefreshCw,
-  Beaker,
-  Wifi,
-  WifiOff,
-  RotateCcw
-} from "lucide-react";
-import {
-  AlertDialog,
-  AlertDialogAction,
-  AlertDialogCancel,
-  AlertDialogContent,
-  AlertDialogDescription,
-  AlertDialogFooter,
-  AlertDialogHeader,
-  AlertDialogTitle,
-  AlertDialogTrigger,
-} from "@/components/ui/alert-dialog";
-import {
-  Tooltip,
-  TooltipContent,
-  TooltipProvider,
-  TooltipTrigger,
-} from "@/components/ui/tooltip";
-
-// Phase 8.8.5-E: Volume tier data from VolumeClassifier
-interface VolumeTierData {
-  symbol: string;
-  tier: 'HIGH' | 'MID' | 'LOW';
-  volume24h: number;
-}
-
-// Phase 8.8.5-E: WebSocket health metrics for Source column
-interface WsHealthMetrics {
-  symbolHealth: Record<string, {
-    source: 'WS' | 'REST';
-    cached: boolean;
-    blocked: boolean;
-    lastTickMs: number;
-  }>;
-}
-
-// Phase 8.8.5-E: Source display states
-type SourceDisplayState = 'WS' | 'WS (cached)' | 'REST' | 'REST (blocked)';
-
-// Phase 8.8.5-E: Source state tooltips
-const SOURCE_TOOLTIPS: Record<SourceDisplayState, string> = {
-  'WS': 'Real-time WebSocket feed - prices update instantly',
-  'WS (cached)': 'WebSocket feed using cached data - no recent ticks received',
-  'REST': 'REST API fallback - polling for price updates',
-  'REST (blocked)': 'REST API blocked by rate limiter - cooldown active',
-};
-
-interface ActiveTrade {
-  id: string;
-  symbol: string;
-  strategy: string;
-  side: string;
-  quantity: number;
-  entryPrice: number;
-  intendedEntryPrice: number; // Signal price before slippage
-  currentPrice: number;
-  unrealizedPnl: number;
-  unrealizedPnlPercent: number;
-  // Phase 8.8.3-C2: P/L breakdown
-  grossPnl: number;
-  grossPnlPercent: number;
-  netPnl: number;
-  netPnlPercent: number;
-  // Phase 8.8.3-C2: Cost breakdown
-  entryFee: number;
-  entrySlippage: number;
-  estExitFee: number;
-  estExitSlippage: number;
-  estTotalCost: number;
-  takeProfit: number;
-  stopLoss: number;
-  distanceToTP: number;
-  distanceToSL: number;
-  distanceToTPDollars: number; // CR-001: Dollar-based distance
-  distanceToSLDollars: number; // CR-001: Dollar-based distance
-  finalScore: number;
-  holdingDurationMs: number;
-  slotNumber: number;
-  maxSlots: number;
-  health: 'green' | 'yellow' | 'red';
-  openedAt: string;
-  confidence: number;
-  positionValue: number;
-  metadata?: any;
-  // Phase 8.8.3-I9: New fields
-  sourceLabel?: 'WS' | 'REST';
-  frequency?: 'High' | 'Medium' | 'Low' | 'Very Low';
-  avgIntervalMs?: number;
-  volume24h?: number;
-  volumeBucket?: 'High' | 'Medium' | 'Low' | 'Very Low';
-  // Directive 9.2: Trade mode for trailing exit system
-  tradeMode?: 'TARGET' | 'TRAILING_TAKE';
-  // Directive 11.4B: Market context fields
-  marketRegime?: string;
-  marketFrictionScore?: number;
-  marketFrictionLabel?: string;
-  // Batch 19E: Source pool tracking
-  sourcePool?: string | null;
-  // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode the position opened on.
-  chosenEntryMode?: string | null;
-  entryFeeRate?: number | string | null;
-  // P19-B7.2c: 'pending' = a resting maker order holding a slot, not yet filled.
-  state?: string;
-  makerLimitPrice?: string | number | null;
-  makerDeadline?: string | null;
-}
-
-interface PortfolioSummary {
-  startingBalance: number;
-  currentBalance: number;
-  realizedBalance: number; // Starting Balance + Realized P/L (renamed from cashBalance)
-  totalPositionValue: number;
-  netPnl: number;
-  netPnlPercent: number;
-}
-
-interface IntegrityStatus {
-  systemCount: number;
-  maxOpenTrades: number;
-  slotsAvailable: number;
-  status: 'OK' | 'OVER_LIMIT';
-}
-
-interface ActiveTradesResponse {
-  ok: boolean;
-  positions: ActiveTrade[];
-  integrity: IntegrityStatus;
-  portfolio: PortfolioSummary;
-}
-
-// Phase 8.8.3-C2: Updated sort fields for new P/L breakdown columns
-// Directive 11.4B: Added marketRegime and marketFriction
-type SortField = 'symbol' | 'strategy' | 'intendedEntryPrice' | 'entryPrice' | 'currentPrice' | 
-                  'grossPnl' | 'grossPnlPercent' | 'netPnl' | 'netPnlPercent' | 
-                  'entryFee' | 'entrySlippage' | 'estExitFee' | 'estExitSlippage' | 'estTotalCost' |
-                  'holdingDurationMs' | 'distanceToTP' | 'distanceToSL' | 'distanceToTPDollars' | 'distanceToSLDollars' | 'slotNumber' | 
-                  'health' | 'confidence' | 'finalScore' | 'quantity' | 'volume24h' | 'takeProfit' | 'stopLoss' | 'positionValue' |
-                  'marketRegime' | 'marketFriction';
-type SortDirection = 'asc' | 'desc';
-
-const strategyColors: Record<string, string> = {
-  vwap_pullback: "bg-primary/10 text-primary",
-  abcd_long: "bg-chart-2/10 text-chart-2",
-  sma_trend_ride: "bg-chart-3/10 text-chart-3",
-  vwap_bounce: "bg-blue-500/10 text-blue-600",
-  dhma: "bg-purple-500/10 text-purple-600",
-  breakout: "bg-orange-500/10 text-orange-600",
-  mean_reversion: "bg-green-500/10 text-green-600",
-  liquidity_trap: "bg-red-500/10 text-red-600"
-};
-
-const strategyNames: Record<string, string> = {
-  vwap_pullback: "VWAP Pullback",
-  abcd_long: "ABCD Long",
-  sma_trend_ride: "SMA Trend Ride",
-  vwap_bounce: "VWAP Bounce",
-  dhma: "DHMA",
-  breakout: "Breakout",
-  mean_reversion: "Mean Reversion",
-  liquidity_trap: "Liquidity Trap"
-};
-
-function formatDuration(ms: number): string {
-  const seconds = Math.floor(ms / 1000);
-  const minutes = Math.floor(seconds / 60);
-  const hours = Math.floor(minutes / 60);
-  const days = Math.floor(hours / 24);
-
-  if (days > 0) return `${days}d ${hours % 24}h`;
-  if (hours > 0) return `${hours}h ${minutes % 60}m`;
-  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
-  return `${seconds}s`;
-}
-
-// Phase 8.8.3-C2: Dual scroll bar component - provides scroll at top and bottom
-function DualScrollTable({ children }: { children: React.ReactNode }) {
-  const topScrollRef = useRef<HTMLDivElement>(null);
-  const bottomScrollRef = useRef<HTMLDivElement>(null);
-  const contentRef = useRef<HTMLDivElement>(null);
-  const [scrollWidth, setScrollWidth] = useState(0);
-  
-  useEffect(() => {
-    if (contentRef.current) {
-      setScrollWidth(contentRef.current.scrollWidth);
-    }
-  }, [children]);
-  
-  const syncScroll = useCallback((source: 'top' | 'bottom') => {
-    if (!topScrollRef.current || !bottomScrollRef.current) return;
-    const scrollLeft = source === 'top' 
-      ? topScrollRef.current.scrollLeft 
-      : bottomScrollRef.current.scrollLeft;
-    topScrollRef.current.scrollLeft = scrollLeft;
-    bottomScrollRef.current.scrollLeft = scrollLeft;
-  }, []);
-  
-  return (
-    <div>
-      {/* Top scroll bar */}
-      <div 
-        ref={topScrollRef}
-        className="overflow-x-auto overflow-y-hidden h-3 border-b border-border/50"
-        onScroll={() => syncScroll('top')}
-      >
-        <div style={{ width: scrollWidth, height: 1 }} />
-      </div>
-      {/* Table container */}
-      <div 
-        ref={(el) => { 
-          (bottomScrollRef as any).current = el; 
-          (contentRef as any).current = el;
-        }}
-        className="overflow-x-auto"
-        onScroll={() => syncScroll('bottom')}
-      >
-        {children}
-      </div>
-    </div>
-  );
-}
-
-// Phase 8.8.3-I9 D1: Format numbers with commas
-function formatNumber(value: number, decimals: number = 2): string {
-  return value.toLocaleString('en-US', { 
-    minimumFractionDigits: decimals, 
-    maximumFractionDigits: decimals 
-  });
-}
-
-// Phase 8.8.3-I9 A2: Format volume with units (M/K) - coin count, not dollar amount
-// P19-B8.5 (soak fix): absent volume renders an honest em-dash — this helper sits on
-// the whole-page render path, so an undefined here must never throw.
-function formatVolume(volume: number | null | undefined): string {
-  if (volume == null || !Number.isFinite(volume)) {
-    return '—';
-  }
-  if (volume >= 1000000) {
-    return `${(volume / 1000000).toFixed(1)}M`;
-  } else if (volume >= 1000) {
-    return `${(volume / 1000).toFixed(0)}K`;
-  }
-  return `${volume.toFixed(0)}`;
-}
-
-function HealthIndicator({ health }: { health: 'green' | 'yellow' | 'red' }) {
-  const colors = {
-    green: 'bg-green-500',
-    yellow: 'bg-yellow-500',
-    red: 'bg-red-500'
-  };
-  
-  return (
-    <div className={cn("w-3 h-3 rounded-full", colors[health])} 
-         title={health === 'green' ? 'Profitable' : health === 'yellow' ? 'Breakeven' : 'Losing'} 
-    />
-  );
-}
-
-function SortableHeader({ 
-  field, 
-  label, 
-  currentSort, 
-  currentDirection, 
-  onSort 
-}: { 
-  field: SortField; 
-  label: string; 
-  currentSort: SortField; 
-  currentDirection: SortDirection;
-  onSort: (field: SortField) => void;
-}) {
-  const isActive = currentSort === field;
-  
-  return (
-    <th 
-      className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/50 select-none"
-      onClick={() => onSort(field)}
-    >
-      <div className="flex items-center gap-1">
-        {label}
-        {isActive ? (
-          currentDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
-        ) : (
-          <ArrowUpDown className="w-3 h-3 opacity-30" />
-        )}
-      </div>
-    </th>
-  );
-}
-
-function TradeRow({ 
-  trade, 
-  onClose, 
-  isClosing,
-  volumeTierDisplay,
-  sourceDisplayState 
-}: { 
-  trade: ActiveTrade; 
-  onClose: (id: string) => void;
-  isClosing: boolean;
-  volumeTierDisplay: { tier: string; volume: string };
-  sourceDisplayState: SourceDisplayState;
-}) {
-  const [baseCurrency, quoteCurrency] = trade.symbol.includes('/') 
-    ? trade.symbol.split('/') 
-    : [trade.symbol.slice(0, 3), trade.symbol.slice(3)];
-
-  // B3: Calculate position value
-  const positionValue = trade.quantity * trade.currentPrice;
-
-  return (
-    <tr className="transition-colors hover:bg-muted/30 border-b border-border/50">
-      {/* 1. Symbol */}
-      <td className="px-3 py-3">
-        <div className="flex items-center gap-2">
-          <HealthIndicator health={trade.health} />
-          <div>
-            <div className="font-semibold text-sm">{baseCurrency}<span className="text-muted-foreground">/{quoteCurrency}</span></div>
-          </div>
-        </div>
-      </td>
-      
-      {/* B69: Asset Class */}
-      <td className="px-3 py-3">
-        <AssetClassBadge assetClass={(trade as any).assetClass} />
-      </td>
-
-      {/* 2. Slot */}
-      <td className="px-3 py-3">
-        <Badge variant="outline" className="font-mono text-xs">
-          {trade.slotNumber}/{trade.maxSlots}
-        </Badge>
-      </td>
-      
-      {/* 3. Strategy */}
-      <td className="px-3 py-3">
-        <div className="flex flex-col gap-1">
-          <Badge className={cn("text-xs font-medium", strategyColors[trade.strategy] || "bg-gray-500/10 text-gray-600")}>
-            {strategyNames[trade.strategy] || trade.strategy}
-          </Badge>
-          {/* Directive 9.2: Trade Mode Indicator */}
-          {/* P19-B7.2c: a resting maker order shows PENDING (holds a slot, not filled)
-              until the real price trades through its limit or the deadline drops it. */}
-          {trade.state === 'pending' ? (
-            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
-              PENDING
-            </span>
-          ) : (
-          <span className={cn(
-            "px-2 py-0.5 rounded text-xs font-bold",
-            trade.tradeMode === 'TRAILING_TAKE'
-              ? 'bg-amber-100 text-amber-700 border border-amber-300'
-              : 'text-gray-500'
-          )}>
-            {trade.tradeMode === 'TRAILING_TAKE' ? 'MOONBAG' : 'Targeting'}
-          </span>
-          )}
-        </div>
-      </td>
-
-      {/* Batch 19E: Source Pool */}
-      <td className="px-3 py-3">
-        {trade.sourcePool ? (
-          <Badge className={cn("text-xs font-medium",
-            trade.sourcePool?.startsWith('quant') ? "bg-blue-500/10 text-blue-600" :
-            trade.sourcePool === 'pattern' ? "bg-purple-500/10 text-purple-600" :
-            "bg-gray-500/10 text-gray-600"
-          )}>
-            {trade.sourcePool.toUpperCase()}
-          </Badge>
-        ) : <span className="text-muted-foreground">—</span>}
-      </td>
-
-      {/* P19-B7.2b (OBJ-C): Entry Fee Mode (maker/taker) — NULL renders em-dash */}
-      <td className="px-3 py-3">
-        <span className="text-xs font-medium" data-testid={`text-entry-fee-mode-${trade.id}`}>
-          {formatEntryFeeMode(trade.chosenEntryMode, trade.entryFeeRate)}
-        </span>
-      </td>
-
-      {/* P19-B8.7 (OBJ-4): B/S · TEC State · Signal/Pattern (VTS-mirror; em-dash when absent) */}
-      <td className="px-3 py-3">
-        <span className={cn("text-xs font-semibold uppercase", trade.side === 'sell' ? "text-red-600" : "text-green-600")}>
-          {trade.side === 'sell' ? 'S' : 'B'}
-        </span>
-      </td>
-      <td className="px-3 py-3">
-        {trade.tradeMode
-          ? <Badge variant="outline" className="text-xs">{trade.tradeMode}</Badge>
-          : <span className="text-muted-foreground text-xs">—</span>}
-      </td>
-      <td className="px-3 py-3 text-xs">
-        {(trade as any).patternType
-          ? <span className="font-medium">{String((trade as any).patternType)}</span>
-          : <span className="text-muted-foreground">—</span>}
-      </td>
-
-      {/* 4. Qty / Value (stacked) */}
-      <td className="px-3 py-3">
-        <div className="text-xs space-y-0.5">
-          <div className="font-mono text-sm">{formatNumber(trade.quantity, 6)}</div>
-          <div className="font-mono text-muted-foreground">${formatNumber(positionValue, 2)}</div>
-        </div>
-      </td>
-      
-      {/* 5. Entry (Signal) - C2A: Signal price only.
-          P19-B8.5 (soak fix): every price cell below renders an honest em-dash when the
-          number is absent instead of crashing the page — pending-maker (B7.2c) and
-          just-promoted rows can legitimately lack a fill/mark price for a tick, and one
-          undefined .toFixed() here took down the WHOLE paper page via the tab error
-          boundary ("Cannot read properties of undefined (reading 'toFixed')", Kyle
-          2026-07-15). */}
-      <td className="px-3 py-3">
-        <div className="font-mono text-sm">
-          {(trade.intendedEntryPrice ?? trade.entryPrice) != null
-            ? `$${(trade.intendedEntryPrice ?? trade.entryPrice).toFixed(6)}`
-            : <span className="text-muted-foreground">—</span>}
-        </div>
-      </td>
-
-      {/* 6. Target Exit (TP) - C2A: Restored */}
-      <td className="px-3 py-3">
-        <div className="flex items-center gap-1">
-          <Target className="w-3 h-3 text-green-500" />
-          <span className="font-mono text-sm text-foreground">
-            {trade.takeProfit != null ? `$${trade.takeProfit.toFixed(6)}` : '—'}
-          </span>
-        </div>
-      </td>
-
-      {/* P19-B8.7 (OBJ-4): Stop (SL) — VTS shows Target/Stop as a pair */}
-      <td className="px-3 py-3">
-        <div className="flex items-center gap-1">
-          <Shield className="w-3 h-3 text-red-500" />
-          <span className="font-mono text-sm text-foreground">
-            {trade.stopLoss != null ? `$${trade.stopLoss.toFixed(6)}` : '—'}
-          </span>
-        </div>
-      </td>
-
-      {/* 7. Current Price - C2A: Colored based on entry comparison */}
-      <td className="px-3 py-3">
-        <div className={cn(
-          "font-mono text-sm font-medium",
-          trade.currentPrice > (trade.intendedEntryPrice ?? trade.entryPrice) ? "text-green-600" :
-          trade.currentPrice < (trade.intendedEntryPrice ?? trade.entryPrice) ? "text-red-600" : "text-foreground"
-        )}>
-          {trade.currentPrice != null ? `$${trade.currentPrice.toFixed(6)}` : <span className="text-muted-foreground">—</span>}
-        </div>
-      </td>
-
-      {/* 8. Distance (stacked: TP on top, SL on bottom) - Per-coin $ difference from Entry */}
-      <td className="px-3 py-3">
-        <div className="text-xs space-y-0.5">
-          {(() => {
-            const entryPrice = trade.intendedEntryPrice ?? trade.entryPrice;
-            if (entryPrice == null || trade.takeProfit == null || trade.stopLoss == null) {
-              return <span className="text-muted-foreground">—</span>;
-            }
-            const tpDistance = trade.takeProfit - entryPrice;
-            const slDistance = entryPrice - trade.stopLoss;
-            return (
-              <>
-                <div className="flex items-center gap-1">
-                  <Target className="w-3 h-3 text-green-500" />
-                  <span className="font-mono text-green-600">
-                    +${tpDistance.toFixed(6)}
-                  </span>
-                </div>
-                <div className="flex items-center gap-1">
-                  <Shield className="w-3 h-3 text-red-500" />
-                  <span className="font-mono text-red-600">
-                    -${slDistance.toFixed(6)}
-                  </span>
-                </div>
-              </>
-            );
-          })()}
-        </div>
-      </td>
-      
-      {/* 9. Gross P/L (stacked: $ on top, % on bottom) - C2A */}
-      <td className="px-3 py-3">
-        <div className="text-xs space-y-0.5">
-          <div className={cn(
-            "font-mono text-sm font-semibold",
-            (trade.grossPnl || 0) >= 0 ? "text-green-600" : "text-red-600"
-          )}>
-            {(trade.grossPnl || 0) >= 0 ? '+' : '-'}${formatNumber(Math.abs(trade.grossPnl || 0), 2)}
-          </div>
-          <div className={cn(
-            "font-mono text-xs",
-            (trade.grossPnlPercent || 0) >= 0 ? "text-green-600" : "text-red-600"
-          )}>
-            {(trade.grossPnlPercent || 0) >= 0 ? '+' : ''}{(trade.grossPnlPercent || 0).toFixed(2)}%
-          </div>
-        </div>
-      </td>
-      
-      {/* 10. Entry Fee - C2A */}
-      <td className="px-3 py-3">
-        <div className="font-mono text-xs text-muted-foreground">
-          ${formatNumber(trade.entryFee || 0, 2)}
-        </div>
-      </td>
-      
-      {/* 11. Entry Slippage - C2A */}
-      <td className="px-3 py-3">
-        <div className="font-mono text-xs text-orange-600">
-          ${formatNumber(trade.entrySlippage || 0, 2)}
-        </div>
-      </td>
-      
-      {/* 12. Exit Fee - C2A: Show positive value */}
-      <td className="px-3 py-3">
-        <div className="font-mono text-xs text-muted-foreground">
-          ${formatNumber(Math.abs(Number(trade.estExitFee) || 0), 2)}
-        </div>
-      </td>
-      
-      {/* 13. Exit Slippage - C2A: Show positive value */}
-      <td className="px-3 py-3">
-        <div className="font-mono text-xs text-orange-600">
-          ${formatNumber(Math.abs(Number(trade.estExitSlippage) || 0), 2)}
-        </div>
-      </td>
-      
-      {/* 14. Total Cost - C2A */}
-      <td className="px-3 py-3">
-        <div className="font-mono text-xs font-medium text-red-600">
-          ${formatNumber(Math.abs(Number(trade.estTotalCost) || 0), 2)}
-        </div>
-      </td>
-      
-      {/* 15. Net P/L (stacked: $ on top, % on bottom) - C2A */}
-      <td className="px-3 py-3">
-        <div className="text-xs space-y-0.5">
-          <div className={cn(
-            "font-mono text-sm font-semibold",
-            (trade.netPnl || 0) >= 0 ? "text-green-600" : "text-red-600"
-          )}>
-            {(trade.netPnl || 0) >= 0 ? '+' : '-'}${formatNumber(Math.abs(trade.netPnl || 0), 2)}
-          </div>
-          <div className={cn(
-            "font-mono text-xs",
-            (trade.netPnlPercent || 0) >= 0 ? "text-green-600" : "text-red-600"
-          )}>
-            {(trade.netPnlPercent || 0) >= 0 ? '+' : ''}{(trade.netPnlPercent || 0).toFixed(2)}%
-          </div>
-        </div>
-      </td>
-      
-      {/* P19-B8.7 Step-9 (Kyle 2026-07-17 ruling): FinalScore + Confidence cells
-          REMOVED — FinalScore is retired (no column in any table, any mode); the
-          ML confidence feeds nothing in ranking (severed B8.5a). */}
-
-      {/* 17. Volume (24h) - Phase 8.8.5-E: Format as "TIER (volume)" from VolumeClassifier */}
-      <td className="px-3 py-3">
-        <div className={cn(
-          "font-mono text-sm font-medium",
-          volumeTierDisplay.tier === 'HIGH' ? "text-green-600" :
-          volumeTierDisplay.tier === 'MID' ? "text-blue-600" : "text-orange-600"
-        )}>
-          {volumeTierDisplay.tier} ({volumeTierDisplay.volume})
-        </div>
-      </td>
-      
-      {/* 18. Source - Phase 8.8.5-E: Display WS/WS (cached)/REST/REST (blocked) with tooltip */}
-      <td className="px-3 py-3">
-        <TooltipProvider>
-          <Tooltip>
-            <TooltipTrigger asChild>
-              <div className="flex items-center gap-1 cursor-help">
-                {sourceDisplayState.startsWith('WS') ? (
-                  <Wifi className={cn(
-                    "w-3 h-3",
-                    sourceDisplayState === 'WS' ? "text-green-500" : "text-yellow-500"
-                  )} />
-                ) : (
-                  <WifiOff className={cn(
-                    "w-3 h-3",
-                    sourceDisplayState === 'REST' ? "text-orange-500" : "text-red-500"
-                  )} />
-                )}
-                <span className={cn(
-                  "font-medium text-xs",
-                  sourceDisplayState === 'WS' ? "text-green-600" :
-                  sourceDisplayState === 'WS (cached)' ? "text-yellow-600" :
-                  sourceDisplayState === 'REST' ? "text-orange-600" : "text-red-600"
-                )}>
-                  {sourceDisplayState}
-                </span>
-              </div>
-            </TooltipTrigger>
-            <TooltipContent side="top" className="max-w-xs">
-              <p className="text-xs">{SOURCE_TOOLTIPS[sourceDisplayState]}</p>
-            </TooltipContent>
-          </Tooltip>
-        </TooltipProvider>
-      </td>
-      
-      {/* 19. Market Regime - Directive 11.4B */}
-      <td className="px-3 py-3">
-        {trade.marketRegime ? (
-          <Badge variant="outline" className={cn("text-xs", getRegimeBadgeClassName(trade.marketRegime))}>
-            {formatRegimeTitle(trade.marketRegime)}
-          </Badge>
-        ) : (
-          <span className="text-muted-foreground text-xs">—</span>
-        )}
-      </td>
-      
-      {/* 20. Market Friction - Directive 11.4B */}
-      <td className="px-3 py-3">
-        {trade.marketFrictionScore !== undefined && trade.marketFrictionScore !== null ? (
-          <span className={cn(
-            "inline-flex items-center px-2 py-1 rounded text-xs font-medium",
-            getFrictionColorClasses(trade.marketFrictionScore).badge
-          )}>
-            {getFrictionLabel(trade.marketFrictionScore)}
-          </span>
-        ) : (
-          <span className="text-muted-foreground text-xs">—</span>
-        )}
-      </td>
-      
-      {/* P19-B8.7 (OBJ-4): Edge · Rank · Regime Wt — decision-time metadata; em-dash when absent */}
-      <td className="px-3 py-3 text-xs font-mono">
-        {Number.isFinite(Number(trade.metadata?.netExpectedEdge)) ? Number(trade.metadata.netExpectedEdge).toFixed(4) : <span className="text-muted-foreground">—</span>}
-      </td>
-      <td className="px-3 py-3 text-xs font-mono">
-        {Number.isFinite(Number(trade.metadata?.rankingScore)) ? Number(trade.metadata.rankingScore).toFixed(4) : <span className="text-muted-foreground">—</span>}
-      </td>
-      <td className="px-3 py-3 text-xs font-mono">
-        {Number.isFinite(Number(trade.metadata?.regimeWeight)) ? Number(trade.metadata.regimeWeight).toFixed(2) : <span className="text-muted-foreground">—</span>}
-      </td>
-
-      {/* 21. Duration */}
-      <td className="px-3 py-3">
-        <div className="flex items-center gap-1 text-sm text-muted-foreground">
-          <Clock className="w-3 h-3" />
-          {formatDuration(trade.holdingDurationMs)}
-        </div>
-      </td>
-
-      {/* P19-B8.7 (OBJ-4): Opened (entry time) — VTS-mirror */}
-      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
-        {trade.openedAt ? new Date(trade.openedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
-      </td>
-      
-      {/* 22. Actions */}
-      <td className="px-3 py-3">
-        <Button
-          size="sm"
-          variant="destructive"
-          onClick={() => onClose(trade.id)}
-          disabled={isClosing}
-          className="px-2 py-1 h-7 text-xs"
-        >
-          <X className="w-3 h-3 mr-1" />
-          Close
-        </Button>
-      </td>
-    </tr>
-  );
-}
-
-function IntegrityBanner({ 
-  integrity, 
-  uiCount, 
-  portfolio,
-  openTradesNetPnlSum,
-  onClearStranded,
-  isClearing,
-  onResetAll,
-  isResetting
-}: { 
-  integrity: IntegrityStatus; 
-  uiCount: number;
-  portfolio: PortfolioSummary;
-  openTradesNetPnlSum: number;
-  onClearStranded: () => void;
-  isClearing: boolean;
-  onResetAll: () => void;
-  isResetting: boolean;
-}) {
-  const isMismatch = integrity.systemCount !== uiCount;
-  const status = isMismatch ? 'MISMATCH' : integrity.status;
-  
-  return (
-    <div className={cn(
-      "p-4 rounded-lg border mb-4",
-      status === 'OK' ? "bg-green-500/5 border-green-500/20" :
-      status === 'MISMATCH' ? "bg-yellow-500/10 border-yellow-500/30" :
-      "bg-red-500/10 border-red-500/30"
-    )}>
-      <div className="flex flex-wrap items-center justify-between gap-4">
-        <div className="flex flex-wrap items-center gap-6 text-sm">
-          <div className="flex items-center gap-2">
-            <span className="text-muted-foreground">System Active Trades:</span>
-            <span className="font-bold">{integrity.systemCount}</span>
-          </div>
-          <div className="flex items-center gap-2">
-            <span className="text-muted-foreground">UI Active Trades:</span>
-            <span className="font-bold">{uiCount}</span>
-          </div>
-          <div className="flex items-center gap-2">
-            <span className="text-muted-foreground">Guardrail Max:</span>
-            <span className="font-bold">{integrity.maxOpenTrades}</span>
-          </div>
-          <div className="flex items-center gap-2">
-            <span className="text-muted-foreground">Slots Available:</span>
-            <span className={cn("font-bold", integrity.slotsAvailable > 0 ? "text-green-600" : "text-red-600")}>
-              {integrity.slotsAvailable}
-            </span>
-          </div>
-          {/* Phase 8.8.4-A.2: Portfolio Value (unrealized) = Current Balance + Unrealized Net P/L */}
-          <div className="flex items-center gap-2">
-            <span className="text-muted-foreground">Portfolio Value (unrealized):</span>
-            <span className={cn("font-bold", ((portfolio.realizedBalance ?? 0) + openTradesNetPnlSum) >= (portfolio.startingBalance ?? 0) ? "text-green-600" : "text-red-600")}>
-              ${((portfolio.realizedBalance ?? 0) + openTradesNetPnlSum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
-            </span>
-          </div>
-        </div>
-        
-        <div className="flex items-center gap-3">
-          {status === 'OK' ? (
-            <div className="flex items-center gap-2 text-green-600">
-              <CheckCircle2 className="w-4 h-4" />
-              <span className="text-sm font-medium">Status: OK</span>
-            </div>
-          ) : status === 'MISMATCH' ? (
-            <div className="flex items-center gap-2 text-yellow-600">
-              <AlertTriangle className="w-4 h-4" />
-              <span className="text-sm font-medium">MISMATCH - Possible Stranded Trade</span>
-            </div>
-          ) : (
-            <div className="flex items-center gap-2 text-red-600">
-              <AlertTriangle className="w-4 h-4" />
-              <span className="text-sm font-medium">OVER LIMIT</span>
-            </div>
-          )}
-          
-          <Button
-            size="sm"
-            variant="outline"
-            onClick={onClearStranded}
-            disabled={isClearing}
-            className="text-xs border-red-200 text-red-600 hover:bg-red-50"
-          >
-            {isClearing ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
-            Clear Stranded
-          </Button>
-          
-          {/* Phase 8.8.3-I9 Part C: Clear & Reset All Button */}
-          <AlertDialog>
-            <AlertDialogTrigger asChild>
-              <Button
-                size="sm"
-                variant="outline"
-                className="text-xs border-orange-200 text-orange-600 hover:bg-orange-50"
-                data-testid="button-clear-reset-all"
-              >
-                <RotateCcw className="w-3 h-3 mr-1" />
-                Clear & Reset All
-              </Button>
-            </AlertDialogTrigger>
-            <AlertDialogContent>
-              <AlertDialogHeader>
-                <AlertDialogTitle>Reset Paper Trading Session?</AlertDialogTitle>
-                <AlertDialogDescription>
-                  This will close all open positions and refresh session state. 
-                  Your trade history will remain intact for review.
-                </AlertDialogDescription>
-              </AlertDialogHeader>
-              <AlertDialogFooter>
-                <AlertDialogCancel>No</AlertDialogCancel>
-                <AlertDialogAction 
-                  onClick={onResetAll}
-                  disabled={isResetting}
-                  className="bg-orange-600 hover:bg-orange-700"
-                >
-                  {isResetting ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
-                  Yes, Reset All
-                </AlertDialogAction>
-              </AlertDialogFooter>
-            </AlertDialogContent>
-          </AlertDialog>
-        </div>
-      </div>
-    </div>
-  );
-}
-
-/**
- * Phase 8.8.3-I7: Normalize symbol for cache key matching
- * Strips slashes and uppercases - must match backend internalSymbol format after slash removal
- */
-const normalizeSymbol = (s: string) => s.replace('/', '').toUpperCase();
-
-// P19-B8.5 (soak fix): accept a page-pinned mode. The B8.1 three-mode-page design pins
-// each page's mode via its config, but this component alone still read the GLOBAL
-// header toggle — so on the /paper-trading page a browser whose global toggle sat on
-// 'live' (the default for a fresh session) rendered the "only available in Paper
-// Trading mode" card instead of the table. The page passes mode="paper"; the global
-// toggle remains the fallback for any legacy un-pinned usage.
-export default function ActiveTradesV2({ mode }: { mode?: 'paper' | 'live' } = {}) {
-  const { isPaper: globalIsPaper } = useTradingMode();
-  const isPaper = mode ? mode === 'paper' : globalIsPaper;
-  const { toast } = useToast();
-  const queryClient = useQueryClient();
-  const { messages, isConnected } = useWebSocket();
-  
-  const [sortField, setSortField] = useState<SortField>('slotNumber');
-  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
-  
-  // Phase 8.8.3-I9 Part C: Reset Session Mutation
-  const resetSessionMutation = useMutation({
-    mutationFn: async () => {
-      return await apiFetch('/api/active-engine/reset', { method: 'POST', body: JSON.stringify({ mode: 'paper' }) });
-    },
-    onSuccess: (result: any) => {
-      toast({
-        title: "Session Reset",
-        description: result?.message || "Paper trading session has been cleared. Set new balance when you restart trading.",
-      });
-      // Invalidate relevant queries
-      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
-      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
-      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/portfolio-summary'] });
-      // Directive 8.8.4-C.14.D: Clear RTB signals table
-      queryClient.invalidateQueries({ queryKey: ['/api/trading-signals'] });
-      console.log('[8.8.4-C.14.D][RESET] Invalidated /api/trading-signals query');
-    },
-    onError: () => {
-      toast({
-        title: "Error",
-        description: "Failed to reset session",
-        variant: "destructive",
-      });
-    }
-  });
-  
-  // Phase 8.8.3-B3.6: Local state for real-time price updates from WebSocket
-  const [livePrices, setLivePrices] = useState<Record<string, { price: number; timestamp: string }>>({});
-  const [wsConnectionStatus, setWsConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
-  
-  // Phase 8.8.3-I7-PRICE-FIX (C3): Track last data refresh for diagnostics
-  const [lastDataRefreshAt, setLastDataRefreshAt] = useState<string | null>(null);
-  
-  const { data, isLoading, refetch } = useQuery<ActiveTradesResponse>({
-    queryKey: ['/api/active-engine/active-trades'],
-    enabled: isPaper,
-    refetchInterval: 10000, // Phase 8.8.3-B3.6: 10 second refresh for metadata only (prices from WS)
-    refetchIntervalInBackground: true, // Continue refreshing even when tab is not focused
-    staleTime: 5000, // Mark data as stale after 5 seconds
-    refetchOnWindowFocus: true
-  });
-  
-  // Phase 8.8.5-E: 30-second polling for VolumeClassifier tier assignments
-  // P19-B8.5 (soak fix, Kyle 2026-07-15): the server's getAllTiers() returns BARE TIER
-  // STRINGS keyed mostly by slash-form symbol — it retains no per-symbol volume. The
-  // previous {tier, volume24h} object type here never matched the real contract; a
-  // truthy string's .volume24h is undefined, and formatVolume(undefined).toFixed()
-  // crashed the whole paper page the first time a symbol key matched (USD/CHF).
-  const { data: volumeTiersData } = useQuery<{
-    ok: boolean;
-    tiers: Record<string, 'HIGH' | 'MID' | 'LOW'>;
-  }>({
-    queryKey: ['/api/diagnostics/8.8.5/volume-tiers'],
-    enabled: isPaper,
-    refetchInterval: 30000, // 30-second polling per directive
-    refetchIntervalInBackground: true,
-    staleTime: 25000,
-  });
-  
-  // Phase 8.8.5-E: 30-second polling for WebSocket health metrics
-  const { data: wsHealthData } = useQuery<{
-    ok: boolean;
-    metrics: {
-      symbolSources?: Record<string, { source: 'WS' | 'REST'; cached: boolean; blocked: boolean }>;
-    };
-  }>({
-    queryKey: ['/api/diagnostics/8.8.5/health'],
-    enabled: isPaper,
-    refetchInterval: 30000, // 30-second polling per directive
-    refetchIntervalInBackground: true,
-    staleTime: 25000,
-  });
-  
-  // Phase 8.8.5-E: Helper to get source display state for a symbol
-  const getSourceDisplayState = useCallback((symbol: string, tradeSourceLabel?: 'WS' | 'REST'): SourceDisplayState => {
-    const normalized = normalizeSymbol(symbol); // Use normalizeSymbol for consistent uppercase + slash removal
-    const healthInfo = wsHealthData?.metrics?.symbolSources?.[normalized];
-    
-    if (healthInfo) {
-      if (healthInfo.source === 'WS') {
-        return healthInfo.cached ? 'WS (cached)' : 'WS';
-      } else {
-        return healthInfo.blocked ? 'REST (blocked)' : 'REST';
-      }
-    }
-    
-    // Fallback to trade's sourceLabel if health data not available
-    return tradeSourceLabel === 'WS' ? 'WS' : 'REST';
-  }, [wsHealthData]);
-  
-  // Phase 8.8.5-E: Helper to get volume tier display for a symbol
-  // Uses VolumeClassifier API data, falls back to trade's own volumeBucket/volume24h
-  const getVolumeTierDisplay = useCallback((
-    symbol: string, 
-    fallbackVolume?: number, 
-    fallbackBucket?: 'High' | 'Medium' | 'Low' | 'Very Low'
-  ): { tier: string; volume: string } => {
-    const normalized = normalizeSymbol(symbol); // Use normalizeSymbol for consistent uppercase + slash removal
-    // The classifier map keys are mostly slash-form ('EUR/USD') with some normalized
-    // entries from setTier callers — try both. The value is the tier string itself;
-    // volume always comes from the trade's own data (the classifier retains none).
-    const classifierTier = volumeTiersData?.tiers?.[symbol] ?? volumeTiersData?.tiers?.[normalized];
-
-    if (classifierTier) {
-      return {
-        tier: classifierTier,
-        volume: formatVolume(fallbackVolume),
-      };
-    }
-    
-    // Fallback to trade's own volume data per directive 8.8.5-E
-    const bucketToTier: Record<string, string> = {
-      'High': 'HIGH',
-      'Medium': 'MID',
-      'Low': 'LOW',
-      'Very Low': 'LOW',
-    };
-    
-    return {
-      tier: bucketToTier[fallbackBucket || 'Medium'] || 'MID',
-      volume: formatVolume(fallbackVolume),
-    };
-  }, [volumeTiersData]);
-  
-  // Phase 8.8.3-I7-PRICE-FIX (C3): Log when data is refreshed
-  useEffect(() => {
-    if (data?.positions) {
-      const ts = new Date().toISOString();
-      setLastDataRefreshAt(ts);
-      console.debug('[I7-PRICE-FIX][UI_ACTIVE_TRADES_UPDATE]', { ts, positions: data.positions.length });
-    }
-  }, [data]);
-  
-  // Phase 8.8.3-B3.6: WebSocket subscription for real-time price updates
-  useEffect(() => {
-    if (!isPaper || messages.length === 0) return;
-    
-    const lastMessage = messages[messages.length - 1];
-    
-    // Handle price_updated events for real-time price display (no full refetch needed)
-    if (lastMessage.type === 'price_updated' && lastMessage.payload?.symbol) {
-      const { symbol, price, timestamp, traceId } = lastMessage.payload;
-      const normalized = normalizeSymbol(symbol);
-      console.log(`[I6-UI] Price update received: ${symbol} -> ${normalized} = $${price}`);
-      
-      // Phase 8.8.3-I7-WS-C (C2 Stage 5): Log UI receive event
-      if (traceId) {
-        console.log(`[I7-WS-C][5] UI_RECEIVE ${JSON.stringify({ trace_id: traceId, internal_symbol: normalized, price })}`);
-      }
-      
-      setLivePrices(prev => ({
-        ...prev,
-        [normalized]: { price, timestamp, traceId }
-      }));
-      return; // Don't trigger full refetch for price updates
-    }
-    
-    // Handle WebSocket price engine status updates
-    if (lastMessage.type === 'ws_price_engine') {
-      setWsConnectionStatus(lastMessage.payload?.status === 'connected' ? 'connected' : 'disconnected');
-      return;
-    }
-    
-    // Listen for trade-related WebSocket events that require full refetch
-    const tradeEventTypes = [
-      'active_trade_closed',
-      'trade_opened',
-      'trade_closed',
-      'position_update',
-      'active_trade_executed',
-      'trading_state_changed',
-      'scan_tick'
-    ];
-    
-    if (tradeEventTypes.includes(lastMessage.type)) {
-      // Invalidate and refetch on trade events
-      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
-    }
-  }, [messages, isPaper, queryClient]);
-  
-  // Phase 8.8.3-A1: Updated to use standardized success response
-  const closeTradeMutation = useMutation({
-    mutationFn: async (id: string) => {
-      return await apiFetch(`/api/active-engine/close-trade/${id}`, {
-        method: 'POST',
-        headers: { 'Content-Type': 'application/json' },
-        body: JSON.stringify({ reason: 'manual_close' })
-      });
-    },
-    onSuccess: (result) => {
-      console.log('[8.8.3-A1][DEBUG] Close trade response:', result);
-      // Check for success (supports both new 'success' and legacy 'ok' fields)
-      const isSuccess = result?.success === true || result?.ok === true || result?.closedTradeId;
-      if (isSuccess) {
-        const pnl = result?.pnl ?? 0;
-        toast({
-          title: "Trade Closed",
-          description: result?.message || `P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
-        });
-      } else {
-        console.error('[8.8.3-A1][ERROR] Close trade failed:', result);
-        toast({
-          title: "Error",
-          description: result?.error || "Failed to close trade",
-          variant: "destructive",
-        });
-      }
-      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
-    },
-    onError: (error) => {
-      console.error('[8.8.3-A1][ERROR] Close trade mutation error:', error);
-      toast({
-        title: "Error",
-        description: "Failed to close trade",
-        variant: "destructive",
-      });
-    }
-  });
-  
-  // Phase 8.8.3-A3: Updated to use standardized success response
-  const clearStrandedMutation = useMutation({
-    mutationFn: async () => {
-      return await apiFetch('/api/active-engine/force-clear-stranded', { 
-        method: 'POST',
-        headers: { 'Content-Type': 'application/json' }
-      });
-    },
-    onSuccess: (result) => {
-      console.log('[8.8.3-A3][DEBUG] Clear stranded response:', result);
-      // Check for success (supports both new 'success' and legacy 'ok' fields)
-      const isSuccess = result?.success === true || result?.ok === true;
-      if (isSuccess) {
-        toast({
-          title: "Stranded Trades Cleared",
-          description: result.message || `Cleared ${result.strandedClosed || result.clearedCount || 0} stranded trades`,
-        });
-      } else {
-        console.error('[8.8.3-A3][ERROR] Clear stranded failed:', result);
-        toast({
-          title: "Error",
-          description: result?.error || "Failed to clear stranded trades",
-          variant: "destructive",
-        });
-      }
-      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
-    },
-    onError: (error) => {
-      console.error('[8.8.3-A3][ERROR] Clear stranded mutation error:', error);
-      toast({
-        title: "Error",
-        description: "Failed to clear stranded trades",
-        variant: "destructive",
-      });
-    }
-  });
-  
-  const handleSort = (field: SortField) => {
-    if (sortField === field) {
-      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
-    } else {
-      setSortField(field);
-      setSortDirection('asc');
-    }
-  };
-  
-  // Phase 8.8.3-B3.6: Merge live prices from WebSocket with REST data
-  const positionsWithLivePrices = useMemo(() => {
-    if (!data?.positions) return [];
-    
-    return data.positions.map(position => {
-      const symbolNorm = normalizeSymbol(position.symbol);
-      const livePrice = livePrices[symbolNorm] as { price: number; timestamp: string; traceId?: string } | undefined;
-      if (livePrice) {
-        // Update price and recalculate P/L (including cost-adjusted metrics)
-        const newCurrentPrice = livePrice.price;
-        const positionValue = position.quantity * newCurrentPrice;
-        
-        // Fee/slippage constants (same as backend)
-        const FEE_PERCENT = 0.0010; // 0.10%
-        const SLIPPAGE_PERCENT = 0.0015; // 0.15%
-        
-        // Recalculate exit costs based on new price
-        const newEstExitFee = positionValue * FEE_PERCENT;
-        const newEstExitSlippage = positionValue * SLIPPAGE_PERCENT;
-        const newEstTotalCost = (position.entryFee || 0) + (position.entrySlippage || 0) + newEstExitFee + newEstExitSlippage;
-        
-        // Gross P/L = price difference * quantity
-        const newGrossPnl = (newCurrentPrice - position.entryPrice) * position.quantity;
-        const newGrossPnlPercent = ((newCurrentPrice - position.entryPrice) / position.entryPrice) * 100;
-        
-        // Net P/L = Gross P/L - Total Costs
-        const newNetPnl = newGrossPnl - newEstTotalCost;
-        const entryValue = position.quantity * position.entryPrice;
-        const newNetPnlPercent = entryValue > 0 ? (newNetPnl / entryValue) * 100 : 0;
-        
-        const newHealth = newGrossPnlPercent > 1 ? 'green' : newGrossPnlPercent < -1 ? 'red' : 'yellow';
-        
-        // Phase 8.8.3-I7-WS-C (C2 Stage 6): Log UI apply to position event
-        if (livePrice.traceId) {
-          console.log(`[I7-WS-C][6] UI_APPLY_TO_POSITION ${JSON.stringify({ 
-            trace_id: livePrice.traceId, 
-            position_symbol: position.symbol, 
-            applied_price: newCurrentPrice 
-          })}`);
-        }
-        
-        return {
-          ...position,
-          currentPrice: newCurrentPrice,
-          unrealizedPnl: newGrossPnl,
-          unrealizedPnlPercent: newGrossPnlPercent,
-          grossPnl: newGrossPnl,
-          grossPnlPercent: newGrossPnlPercent,
-          netPnl: newNetPnl,
-          netPnlPercent: newNetPnlPercent,
-          estExitFee: newEstExitFee,
-          estExitSlippage: newEstExitSlippage,
-          estTotalCost: newEstTotalCost,
-          health: newHealth as 'green' | 'yellow' | 'red',
-          distanceToTP: position.takeProfit - newCurrentPrice,
-          distanceToSL: newCurrentPrice - position.stopLoss
-        };
-      }
-      return position;
-    });
-  }, [data?.positions, livePrices]);
-  
-  // Phase 8.8.3-I7-PM-FOCUS (C2): Deduplicate positions by symbol+side
-  // Backend duplicate guard should prevent duplicates, but this is a UI safeguard
-  const dedupedPositions = useMemo(() => {
-    const byKey = new Map<string, ActiveTrade>();
-    
-    positionsWithLivePrices.forEach(pos => {
-      const key = `${pos.symbol}:${pos.side}`;
-      if (!byKey.has(key)) {
-        byKey.set(key, pos);
-      } else {
-        // Keep the one with the earlier openedAt time
-        const existing = byKey.get(key)!;
-        if (new Date(pos.openedAt) < new Date(existing.openedAt)) {
-          byKey.set(key, pos);
-        }
-        console.log(`[I7-PM-FOCUS][UI_DEDUP] Filtered duplicate: ${pos.symbol} (keeping earliest entry)`);
-      }
-    });
-    
-    return Array.from(byKey.values());
-  }, [positionsWithLivePrices]);
-
-  const sortedPositions = useMemo(() => {
-    if (!dedupedPositions.length) return [];
-    
-    return [...dedupedPositions].sort((a, b) => {
-      let aVal: any = a[sortField];
-      let bVal: any = b[sortField];
-      
-      if (sortField === 'health') {
-        const healthOrder = { green: 0, yellow: 1, red: 2 };
-        aVal = healthOrder[a.health];
-        bVal = healthOrder[b.health];
-      }
-      
-      if (typeof aVal === 'string') {
-        aVal = aVal.toLowerCase();
-        bVal = bVal.toLowerCase();
-      }
-      
-      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
-      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
-      return 0;
-    });
-  }, [dedupedPositions, sortField, sortDirection]);
-
-  if (!isPaper) {
-    return (
-      <Card>
-        <CardContent className="p-8 text-center">
-          <p className="text-muted-foreground">Active Trades panel is only available in Paper Trading mode</p>
-        </CardContent>
-      </Card>
-    );
-  }
-
-  if (isLoading) {
-    return (
-      <Card>
-        <CardHeader>
-          <CardTitle>Active Trades</CardTitle>
-        </CardHeader>
-        <CardContent>
-          <div className="space-y-4">
-            {Array.from({ length: 3 }).map((_, i) => (
-              <Skeleton key={i} className="h-16 w-full" />
-            ))}
-          </div>
-        </CardContent>
-      </Card>
-    );
-  }
-
-  const positions = sortedPositions;
-  const integrity = data?.integrity || { systemCount: 0, maxOpenTrades: 15, slotsAvailable: 15, status: 'OK' as const };
-  const portfolio = data?.portfolio || { startingBalance: 0, currentBalance: 0, realizedBalance: 0, totalPositionValue: 0, netPnl: 0, netPnlPercent: 0 };
-
-  // Calculate sum of all open trades' Net P/L for the green bar display
-  const openTradesNetPnlSum = positions.reduce((sum, pos) => sum + (parseFloat(String(pos.netPnl)) || 0), 0);
-
-  return (
-    <section data-testid="active-trades-v2" data-last-update-at={lastDataRefreshAt || ''}>
-      <div className="flex items-center justify-between mb-4">
-        {/* P19-B8.3c: the open-trade COUNT restored atop the tab (dropped in the
-            B8.1 restructure). `positions` is mode-scoped, so it reflects the active mode. */}
-        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Active Trades <span className="text-base font-normal text-muted-foreground" data-testid="active-trades-count">({positions.length})</span></h2>
-        <div className="flex items-center gap-3">
-          <div className={cn(
-            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
-            isConnected ? "text-green-600 bg-green-500/10" : "text-red-600 bg-red-500/10"
-          )}>
-            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
-            <span>{isConnected ? "Connected" : "Offline"}</span>
-          </div>
-          
-          {/* P19-B8.3 (OBJ-6): the badge names the ACTUAL mode — the hardcoded
-              "Paper Trading" string read wrong on the Live page (B8.1 carry). */}
-          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10">
-            <Beaker className="w-4 h-4 text-blue-600 dark:text-blue-400" />
-            <span className="text-sm font-medium text-blue-600 dark:text-blue-400" data-testid="open-trades-mode-badge">
-              {isPaper ? "Paper Trading" : "Live Trading"}
-            </span>
-          </div>
-        </div>
-      </div>
-      
-      <IntegrityBanner 
-        integrity={integrity} 
-        uiCount={positions.length}
-        portfolio={portfolio}
-        openTradesNetPnlSum={openTradesNetPnlSum}
-        onClearStranded={() => clearStrandedMutation.mutate()}
-        isClearing={clearStrandedMutation.isPending}
-        onResetAll={() => resetSessionMutation.mutate()}
-        isResetting={resetSessionMutation.isPending}
-      />
-      
-      <Card className="rounded-xl border shadow-sm overflow-hidden">
-        {positions.length === 0 ? (
-          <div className="p-8 text-center min-h-[200px] flex flex-col items-center justify-center gap-2">
-            <div className="text-4xl mb-2">📭</div>
-            <p className="text-muted-foreground font-medium">No active trades</p>
-            <p className="text-xs text-muted-foreground">
-              {integrity.slotsAvailable} slots available for new positions
-            </p>
-          </div>
-        ) : (
-          <DualScrollTable>
-            <table className="w-full">
-              <thead className="bg-muted/50 sticky top-0">
-                <tr>
-                  {/* Phase 8.8.3-C2A: Final column order per directive */}
-                  <SortableHeader field="symbol" label="Symbol" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class</th>
-                  <SortableHeader field="slotNumber" label="Slot" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="strategy" label="Strategy" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pool</th>
-                  {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entry Fee Mode</th>
-                  {/* P19-B8.7 (OBJ-4): VTS-mirror columns — B/S, TEC State, Signal/Pattern */}
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">B/S</th>
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider" title="Trailing-exit engine state: TARGET = aiming at the original target; TRAILING = moonbag.">TEC State</th>
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Signal/Pattern</th>
-                  <SortableHeader field="quantity" label="Qty / Value" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="intendedEntryPrice" label="Entry" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="takeProfit" label="Target (TP)" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="stopLoss" label="Stop (SL)" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="currentPrice" label="Current" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dist</th>
-                  <SortableHeader field="grossPnl" label="Gross P/L" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="entryFee" label="Entry Fee" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="entrySlippage" label="Entry Slip" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="estExitFee" label="Exit Fee" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="estExitSlippage" label="Exit Slip" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="estTotalCost" label="Total Cost" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="netPnl" label="Net P/L" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  {/* P19-B8.7 Step-9 (Kyle ruling): FinalScore + Conf headers REMOVED. */}
-                  <SortableHeader field="volume24h" label="Volume" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
-                  <SortableHeader field="marketRegime" label="Regime" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <SortableHeader field="marketFriction" label="Friction" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  {/* P19-B8.7 (OBJ-4): decision-time telemetry mirrored from the VTS set (metadata-sourced; em-dash when absent) */}
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edge</th>
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rank</th>
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Regime Wt</th>
-                  <SortableHeader field="holdingDurationMs" label="Duration" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opened</th>
-                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
-                </tr>
-              </thead>
-              <tbody>
-                {positions.map((trade) => (
-                  <TradeRow 
-                    key={trade.id} 
-                    trade={trade} 
-                    onClose={(id) => closeTradeMutation.mutate(id)}
-                    isClosing={closeTradeMutation.isPending}
-                    volumeTierDisplay={getVolumeTierDisplay(trade.symbol, trade.volume24h, trade.volumeBucket)}
-                    sourceDisplayState={getSourceDisplayState(trade.symbol, trade.sourceLabel)}
-                  />
-                ))}
-              </tbody>
-            </table>
-          </DualScrollTable>
-        )}
-      </Card>
-    </section>
-  );
-}
```

## §B — NEW FILE paper-trade-adapter.ts (the verified object, byte-identical)

```typescript
/**
 * P19-B8.7 Step-9 — the paper→VTS-shape trade adapter (PURE, no React, no I/O).
 *
 * The paper open/closed tabs mount the SAME shared table components the VTS
 * tabs use (Langston shared-component ruling B, 2026-07-17). Those components
 * consume the VTS OpenTrade/ClosedTrade shapes; the paper API rows carry the
 * same facts under different names/encodings. This module is the single seam:
 * one function per table, mapping a paper row to the VTS shape — matching the
 * VTS serializer's EXACT wire formats (vts-runner.ts buildOpenTradeRow):
 *   distanceToTarget  '+X.XX%' (signed) | 'N/A' when no target
 *   distanceToStop    'X.XX%' (unsigned) | 'N/A' when no stop
 *   gross/net %       '+X.XX%' (signed)
 *   dollarValue 2dp · quantity 6dp · costs 4dp · entryTime/exitTime ISO
 *
 * Honesty rules (B8.7 no-fabrication):
 *  - metadata-sourced fields absent → undefined/'—' (cells render em-dash),
 *    NEVER a fabricated number (the deleted mlConfidence ?? ngc×0.9 lesson).
 *  - #515-family global/pair context (globalRegime, frictions, DBS) is NOT
 *    captured on paper rows today → explicit null, rendered '—'.
 *
 * Relative type-only imports on purpose: vitest has no '@' alias, and a
 * type-only import of the .tsx is erased at runtime, keeping this module
 * loadable in the node test environment.
 */
import type { OpenTrade, ClosedTrade } from "../components/vts/vts-shared";

// ---------------------------------------------------------------------------
// Input row shapes (what the paper routes actually serialize)
// ---------------------------------------------------------------------------

/** One enriched position row from GET /api/active-engine/active-trades. */
export interface PaperActiveTradeRow {
  id: string;
  symbol: string;
  strategy: string;
  assetClass?: string | null;
  patternType?: string | null;
  side?: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  grossPnl: number;
  grossPnlPercent: number;
  netPnl: number;
  netPnlPercent: number;
  entryFee?: number;
  entrySlippage?: number;
  estExitFee?: number;
  estExitSlippage?: number;
  estTotalCost: number;
  takeProfit: number;
  stopLoss: number;
  holdingDurationMs: number;
  openedAt: string;
  metadata?: Record<string, unknown> | null;
  volume24h?: number;
  positionValue: number;
  tradeMode?: string;
  chosenEntryMode?: string | null;
  entryFeeRate?: number | null;
  state?: string;
  // paper-only affordances the shared components take as OPTIONAL props
  slotNumber?: number;
  maxSlots?: number;
  health?: unknown;
  confidence?: number;
  frequency?: string;
  sourceLabel?: string;
  // The server's age-aware venue-quiet verdict + price age (B8.9 carry,
  // b28cf7074: /active-engine/active-trades now serializes the boolean).
  priceVenueQuiet?: boolean;
  priceAgeMs?: number;
}

/** One raw closed_trades row from GET /api/active-engine/trades?paginated=true.
 *  Drizzle serializes decimal columns as STRINGS — every numeric passes
 *  through num()/pct() below. */
export interface PaperClosedTradeRow {
  id: string;
  symbol: string;
  assetClass?: string | null;
  strategyName: string;
  side?: string;
  quantity: string | number;
  entryPrice: string | number;
  exitPrice?: string | number | null;
  stopLoss?: string | number | null;
  takeProfit?: string | number | null;
  grossPnl?: string | number | null;
  netPnl?: string | number | null;
  netPnlPercent?: string | number | null;
  totalCost?: string | number | null;
  entryFee?: string | number | null;
  exitFee?: string | number | null;
  entrySlippage?: string | number | null;
  exitSlippage?: string | number | null;
  exitFeeMode?: string | null;
  exitRestOutcome?: string | null;
  openedAt: string | Date;
  closedAt?: string | Date | null;
  closeReason?: string | null;
  signalType?: string | null;
  patternType?: string | null;
  sourcePool?: string | null;
  tradeMode?: string | null;
  chosenEntryMode?: string | null;
  entryFeeRate?: string | number | null;
  pairIdHash?: number | null;
  regimeConfidenceRaw?: number | null;
  macroModifierValue?: number | null;
  phase?: string | null;
  phaseAgeSeconds?: number | null;
  strategyPhaseWeight?: number | null;
  regimeConfidenceModulated?: number | null;
  metadata?: Record<string, unknown> | null;
}

/** OpenTrade plus the loose TEC fields the shared open table reads off the
 *  row (the VTS serializer emits them outside the declared interface), plus
 *  the cost 5-col breakdown (present on paper rows; the shared Costs cell
 *  renders the split when these exist, the single total + em-dashes when not). */
export type AdaptedOpenTrade = OpenTrade & {
  tradeMode?: string;
  breakEvenLatched?: boolean;
  targetLatched?: boolean;
  engineStopPrice?: number | null;
  costEntryFee?: number | null;
  costEntrySlippage?: number | null;
  costExitFee?: number | null;
  costExitSlippage?: number | null;
  // Paper-only affordances carried through for the appended columns (the shared
  // table sorts internally, so extras must ride the row — index math would lie).
  id?: string;
  slotNumber?: number;
  maxSlots?: number;
  sourceLabel?: string;
};

/** ClosedTrade plus the realized cost 5-col breakdown (closed_trades columns
 *  entry_fee / entry_slippage / exit_fee / exit_slippage). */
export type AdaptedClosedTrade = ClosedTrade & {
  costEntryFee?: number | null;
  costEntrySlippage?: number | null;
  costExitFee?: number | null;
  costExitSlippage?: number | null;
  // P19-B8.6 maker target-exit cohort stamps for the maker-exit columns.
  exitFeeMode?: string | null;
  exitRestOutcome?: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decimal-string/number → finite number, else null. Never coerces to 0. */
function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Signed percent string matching the VTS wire format: '+2.35%' / '-0.80%'. */
function signedPct(v: number | null): string {
  if (v === null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

/** metadata scalar → number when it genuinely is one, else undefined. */
function metaNum(meta: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function metaStr(meta: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ---------------------------------------------------------------------------
// Open trades
// ---------------------------------------------------------------------------

export function adaptPaperOpenTrade(row: PaperActiveTradeRow): AdaptedOpenTrade {
  const meta = row.metadata ?? null;
  const priceForCalc = Number.isFinite(row.currentPrice) && row.currentPrice > 0 ? row.currentPrice : row.entryPrice;

  // Same formulas + formats as the VTS serializer (vts-runner buildOpenTradeRow).
  const distanceToTarget =
    row.takeProfit > 0 && priceForCalc > 0
      ? signedPct(((row.takeProfit - priceForCalc) / priceForCalc) * 100)
      : "N/A";
  const distanceToStop =
    row.stopLoss > 0 && priceForCalc > 0
      ? (((row.stopLoss - priceForCalc) / priceForCalc) * 100).toFixed(2) + "%"
      : "N/A";

  return {
    symbol: row.symbol,
    assetClass: row.assetClass ?? undefined,
    // Metadata-sourced context; absent → '—' (string fields) / undefined (numbers).
    regime: metaStr(meta, "regime") ?? "—",
    strategy: row.strategy,
    signalType: metaStr(meta, "signalType") ?? "—",
    patternType: row.patternType ?? metaStr(meta, "patternType") ?? null,
    pool: (metaStr(meta, "pool") ?? "—").toUpperCase(),
    sourcePool: metaStr(meta, "sourcePool"),
    dollarValue: parseFloat(row.positionValue.toFixed(2)),
    quantity: parseFloat(row.quantity.toFixed(6)),
    entryPrice: row.entryPrice,
    exitPrice: null,
    target: row.takeProfit,
    stopLoss: row.stopLoss,
    currentPrice: Number.isFinite(row.currentPrice) ? row.currentPrice : null,
    distanceToTarget,
    distanceToStop,
    grossProfitValue: parseFloat((num(row.grossPnl) ?? 0).toFixed(2)),
    grossProfitPercent: signedPct(num(row.grossPnlPercent)),
    costs: parseFloat((num(row.estTotalCost) ?? 0).toFixed(4)),
    netProfitValue: parseFloat((num(row.netPnl) ?? 0).toFixed(2)),
    netProfitPercent: signedPct(num(row.netPnlPercent)),
    rankingScore: metaNum(meta, "rankingScore"), // inert shadow value — display only
    // finalScore/hybridScore OMITTED on purpose (retired metric, piece 2.7 / #525).
    expectedEdge: metaNum(meta, "expectedEdge"),
    regimeWeight: metaNum(meta, "regimeWeight"),
    entryTime: row.openedAt,
    durationOpenMinutes: Math.floor((num(row.holdingDurationMs) ?? 0) / 60000),
    // #515 family: global/pair context is not captured on paper rows today.
    globalRegime: null,
    pairFriction: null,
    globalFriction: null,
    pairDirectionalBias: null,
    globalDirectionalBias: null,
    pairDirectionalBiasScore: null,
    globalDirectionalBiasScore: null,
    // Entry-liquidity: paper rows carry 24h volume only (crypto convention);
    // 0/absent → null → '—'.
    entryLiquidityValue: (num(row.volume24h) ?? 0) > 0 ? (num(row.volume24h) as number) : null,
    entryLiquidityKind: (num(row.volume24h) ?? 0) > 0 ? "volume_qty" : null,
    chosenEntryMode: row.chosenEntryMode ?? null,
    entryFeeRate: num(row.entryFeeRate),
    state: row.state ?? "open",
    // TEC state: paper serializes tradeMode only; latch flags aren't on the row —
    // left undefined (cell renders the mode without latch badges), never guessed.
    tradeMode: row.tradeMode ?? "TARGET",
    // Cost 5-col breakdown (entry fee/slip + ESTIMATED exit fee/slip on open rows).
    costEntryFee: num(row.entryFee),
    costEntrySlippage: num(row.entrySlippage),
    costExitFee: num(row.estExitFee),
    costExitSlippage: num(row.estExitSlippage),
    // The server's venue-quiet verdict → the shared Current cell renders the
    // quiet treatment (B8.9 carry; server-decided, age-aware, one notion).
    priceVenueQuiet: row.priceVenueQuiet === true,
    priceAgeMs: num(row.priceAgeMs),
    // Paper-only affordances for the appended Slot/Source/Actions columns.
    id: row.id,
    slotNumber: row.slotNumber,
    maxSlots: row.maxSlots,
    sourceLabel: row.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// Closed trades
// ---------------------------------------------------------------------------

export function adaptPaperClosedTrade(row: PaperClosedTradeRow): AdaptedClosedTrade {
  const meta = row.metadata ?? null;
  const quantity = num(row.quantity) ?? 0;
  const entryPrice = num(row.entryPrice) ?? 0;
  const notional = quantity * entryPrice;
  const grossPnl = num(row.grossPnl);
  const openedAt = new Date(row.openedAt);
  const closedAt = row.closedAt ? new Date(row.closedAt) : null;

  return {
    symbol: row.symbol,
    assetClass: row.assetClass ?? undefined,
    regime: metaStr(meta, "regime") ?? "—",
    strategy: row.strategyName,
    signalType: row.signalType ?? "—",
    patternType: row.patternType ?? null,
    pool: (metaStr(meta, "pool") ?? "—").toUpperCase(),
    sourcePool: row.sourcePool ?? undefined,
    dollarValue: parseFloat(notional.toFixed(2)),
    quantity: parseFloat(quantity.toFixed(6)),
    entryPrice,
    exitPrice: num(row.exitPrice) ?? 0,
    target: num(row.takeProfit) ?? 0,
    stopLoss: num(row.stopLoss) ?? 0,
    // closeReason uppercased lands on the shared badge/label maps directly
    // ('target_hit' → TAKE PROFIT, 'trailing_stop_hit' → TRAIL STOP, …).
    resultType: (row.closeReason ?? "UNKNOWN").toUpperCase(),
    // Genuinely-null P/L → NaN (the cells isFinite-guard to an em-dash), never a
    // fabricated $0.00 next to a '—%' (Langston Step-4 note 2 — symmetry).
    grossProfitValue: grossPnl !== null ? parseFloat(grossPnl.toFixed(2)) : NaN,
    grossProfitPercent:
      grossPnl !== null && notional > 0 ? signedPct((grossPnl / notional) * 100) : "—",
    costs: parseFloat((num(row.totalCost) ?? 0).toFixed(4)),
    netProfitValue: num(row.netPnl) !== null ? parseFloat((num(row.netPnl) as number).toFixed(2)) : NaN,
    netProfitPercent: signedPct(num(row.netPnlPercent)),
    rankingScore: metaNum(meta, "rankingScore"),
    // finalScore/hybridScore OMITTED (retired metric).
    expectedEdge: metaNum(meta, "expectedEdge"),
    regimeWeight: metaNum(meta, "regimeWeight"),
    entryTime: openedAt.toISOString(),
    exitTime: closedAt ? closedAt.toISOString() : "",
    durationMinutes: closedAt ? Math.max(0, Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000)) : 0,
    globalRegime: null,
    pairFriction: null,
    globalFriction: null,
    pairDirectionalBias: null,
    globalDirectionalBias: null,
    pairDirectionalBiasScore: null,
    globalDirectionalBiasScore: null,
    pairIdHash: row.pairIdHash ?? null,
    regimeConfidenceRaw: row.regimeConfidenceRaw ?? null,
    macroModifierValue: row.macroModifierValue ?? null,
    phase: (row.phase as ClosedTrade["phase"]) ?? null,
    phaseAgeSeconds: row.phaseAgeSeconds ?? null,
    strategyPhaseWeight: row.strategyPhaseWeight ?? null,
    regimeConfidenceModulated: row.regimeConfidenceModulated ?? null,
    entryLiquidityValue: metaNum(meta, "entryLiquidityValue") ?? null,
    entryLiquidityKind:
      (metaStr(meta, "entryLiquidityKind") as ClosedTrade["entryLiquidityKind"]) ?? null,
    chosenEntryMode: row.chosenEntryMode ?? null,
    entryFeeRate: num(row.entryFeeRate),
    // never_filled dropped-pending rows are visible but excluded from stats,
    // same convention as VTS (B7.2c).
    countsInAggregates: (row.closeReason ?? "") !== "never_filled",
    // Realized cost 5-col breakdown + B8.6 maker target-exit cohort stamps.
    costEntryFee: num(row.entryFee),
    costEntrySlippage: num(row.entrySlippage),
    costExitFee: num(row.exitFee),
    costExitSlippage: num(row.exitSlippage),
    exitFeeMode: row.exitFeeMode ?? null,
    exitRestOutcome: row.exitRestOutcome ?? null,
  };
}
```

## §C — NEW FILE paper-open-trades-tab.tsx

```tsx
/**
 * P19-B8.7 Step-9 — the paper Open Trades tab, rebuilt on the SHARED VTS-mirror
 * table (Langston shared-component ruling B). Replaces active-trades-v2.tsx.
 *
 * What this keeps from the old tab (the SHELL): the count header, WS-connection
 * + mode badges, the IntegrityBanner (system-vs-UI count, guardrail cap, slots,
 * Clear Stranded / Clear & Reset All actions), the 10s active-trades query, and
 * WS-driven refresh.
 *
 * What changed (and why):
 *  - The table itself is the shared OpenTradesTable (vts-open-trades-table.tsx),
 *    fed through the pure adapter (paper-trade-adapter.ts) — one layout for VTS
 *    and paper, per Kyle's layout-identity directive. Paper-only columns (Slot,
 *    Source, Actions) ride the append props, default OFF for the VTS mount.
 *  - FIX-ON-FIND (CLAUDE.md rule 23): the old tab recomputed P/L client-side on
 *    every WS price tick using HARDCODED fee/slippage constants (0.10%/0.15%,
 *    commented "same as backend") that do NOT match the DB-governed fee model.
 *    That recompute is DELETED — prices/P&L are server-authoritative; WS price
 *    ticks now trigger a throttled (3s) query invalidation instead, the same
 *    pattern the portfolio metrics strip uses.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiFetch } from "@/lib/api";
import { useAssetNameOverlays } from "@/hooks/use-asset-name-overlays";
import { OpenTradesTable } from "@/components/vts/vts-open-trades-table";
import { adaptPaperOpenTrade, type PaperActiveTradeRow, type AdaptedOpenTrade } from "@/lib/paper-trade-adapter";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Beaker,
  Wifi,
  WifiOff,
  RotateCcw,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface IntegrityStatus {
  systemCount: number;
  maxOpenTrades: number;
  slotsAvailable: number;
  status: 'OK' | 'OVER_LIMIT';
}

interface PortfolioSummaryLite {
  startingBalance: number;
  currentBalance: number;
  realizedBalance?: number;
  totalPositionValue: number;
  netPnl: number;
  netPnlPercent: number;
}

interface ActiveTradesResponse {
  ok: boolean;
  positions: PaperActiveTradeRow[];
  integrity: IntegrityStatus;
  portfolio: PortfolioSummaryLite;
}

// The integrity/actions banner, moved verbatim from active-trades-v2.tsx
// (that file is deleted with this rewire — rule 18).
function IntegrityBanner({
  integrity,
  uiCount,
  portfolio,
  openTradesNetPnlSum,
  onClearStranded,
  isClearing,
  onResetAll,
  isResetting,
}: {
  integrity: IntegrityStatus;
  uiCount: number;
  portfolio: PortfolioSummaryLite;
  openTradesNetPnlSum: number;
  onClearStranded: () => void;
  isClearing: boolean;
  onResetAll: () => void;
  isResetting: boolean;
}) {
  const isMismatch = integrity.systemCount !== uiCount;
  const status = isMismatch ? 'MISMATCH' : integrity.status;

  return (
    <div className={cn(
      "p-4 rounded-lg border mb-4",
      status === 'OK' ? "bg-green-500/5 border-green-500/20" :
      status === 'MISMATCH' ? "bg-yellow-500/10 border-yellow-500/30" :
      "bg-red-500/10 border-red-500/30"
    )}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">System Active Trades:</span>
            <span className="font-bold">{integrity.systemCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">UI Active Trades:</span>
            <span className="font-bold">{uiCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Guardrail Max:</span>
            <span className="font-bold">{integrity.maxOpenTrades}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Slots Available:</span>
            <span className={cn("font-bold", integrity.slotsAvailable > 0 ? "text-green-600" : "text-red-600")}>
              {integrity.slotsAvailable}
            </span>
          </div>
          {/* Phase 8.8.4-A.2: Portfolio Value (unrealized) = Current Balance + Unrealized Net P/L */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Portfolio Value (unrealized):</span>
            <span className={cn("font-bold", ((portfolio.realizedBalance ?? 0) + openTradesNetPnlSum) >= (portfolio.startingBalance ?? 0) ? "text-green-600" : "text-red-600")}>
              ${((portfolio.realizedBalance ?? 0) + openTradesNetPnlSum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status === 'OK' ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">Status: OK</span>
            </div>
          ) : status === 'MISMATCH' ? (
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">MISMATCH - Possible Stranded Trade</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">OVER LIMIT</span>
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={onClearStranded}
            disabled={isClearing}
            className="text-xs border-red-200 text-red-600 hover:bg-red-50"
          >
            {isClearing ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
            Clear Stranded
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-orange-200 text-orange-600 hover:bg-orange-50"
                data-testid="button-clear-reset-all"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Clear & Reset All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Paper Trading Session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will close all open positions and refresh session state.
                  Your trade history will remain intact for review.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>No</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onResetAll}
                  disabled={isResetting}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {isResetting ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Yes, Reset All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

export default function PaperOpenTradesTab({ mode }: { mode?: 'paper' | 'live' } = {}) {
  const { isPaper: globalIsPaper } = useTradingMode();
  const isPaper = mode ? mode === 'paper' : globalIsPaper;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { messages, isConnected } = useWebSocket();

  // Company/coin name overlays for the stacked symbol cell (B-NAMES home).
  useAssetNameOverlays();

  const { data, isLoading } = useQuery<ActiveTradesResponse>({
    queryKey: ['/api/active-engine/active-trades'],
    enabled: isPaper,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  // WS-driven refresh: trade events invalidate immediately; price ticks are
  // throttled to 3s (server-authoritative numbers — no client P/L recompute).
  const [lastPriceRefresh, setLastPriceRefresh] = useState(0);
  useEffect(() => {
    if (!isPaper || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.type === 'price_updated') {
      const now = Date.now();
      if (now - lastPriceRefresh > 3000) {
        queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
        setLastPriceRefresh(now);
      }
      return;
    }
    const tradeEventTypes = [
      'active_trade_closed', 'trade_opened', 'trade_closed',
      'position_update', 'active_trade_executed', 'trading_state_changed', 'scan_tick',
    ];
    if (tradeEventTypes.includes(last.type)) {
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
    }
  }, [messages, isPaper, queryClient, lastPriceRefresh]);

  const closeTradeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiFetch(`/api/active-engine/close-trade/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_close' }),
      });
    },
    onSuccess: (result: any) => {
      const isSuccess = result?.success === true || result?.ok === true || result?.closedTradeId;
      if (isSuccess) {
        const pnl = result?.pnl ?? 0;
        toast({ title: "Trade Closed", description: result?.message || `P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` });
      } else {
        toast({ title: "Error", description: result?.error || "Failed to close trade", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to close trade", variant: "destructive" });
    },
  });

  const clearStrandedMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/active-engine/force-clear-stranded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (result: any) => {
      const isSuccess = result?.success === true || result?.ok === true;
      if (isSuccess) {
        toast({ title: "Stranded Trades Cleared", description: result.message || `Cleared ${result.strandedClosed || result.clearedCount || 0} stranded trades` });
      } else {
        toast({ title: "Error", description: result?.error || "Failed to clear stranded trades", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear stranded trades", variant: "destructive" });
    },
  });

  const resetSessionMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/active-engine/reset', { method: 'POST', body: JSON.stringify({ mode: 'paper' }) });
    },
    onSuccess: (result: any) => {
      toast({ title: "Session Reset", description: result?.message || "Paper trading session has been cleared. Set new balance when you restart trading." });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/portfolio-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trading-signals'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset session", variant: "destructive" });
    },
  });

  // Symbol+side dedup safeguard (kept from the old tab — I7-PM-FOCUS).
  const rows = useMemo(() => {
    const byKey = new Map<string, PaperActiveTradeRow>();
    (data?.positions ?? []).forEach((pos) => {
      const key = `${pos.symbol}:${pos.side ?? 'buy'}`;
      const existing = byKey.get(key);
      if (!existing || new Date(pos.openedAt) < new Date(existing.openedAt)) {
        byKey.set(key, pos);
      }
    });
    return Array.from(byKey.values());
  }, [data?.positions]);

  const trades = useMemo(() => rows.map(adaptPaperOpenTrade), [rows]);

  if (!isPaper) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Active Trades panel is only available in Paper Trading mode</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const integrity = data?.integrity || { systemCount: 0, maxOpenTrades: 0, slotsAvailable: 0, status: 'OK' as const };
  const portfolio = data?.portfolio || { startingBalance: 0, currentBalance: 0, realizedBalance: 0, totalPositionValue: 0, netPnl: 0, netPnlPercent: 0 };
  const openTradesNetPnlSum = rows.reduce((sum, pos) => sum + (Number(pos.netPnl) || 0), 0);

  return (
    <section data-testid="paper-open-trades-tab">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
          Active Trades <span className="text-base font-normal text-muted-foreground" data-testid="active-trades-count">({rows.length})</span>
        </h2>
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            isConnected ? "text-green-600 bg-green-500/10" : "text-red-600 bg-red-500/10"
          )}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isConnected ? "Connected" : "Offline"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10">
            <Beaker className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400" data-testid="open-trades-mode-badge">
              {isPaper ? "Paper Trading" : "Live Trading"}
            </span>
          </div>
        </div>
      </div>

      <IntegrityBanner
        integrity={integrity}
        uiCount={rows.length}
        portfolio={portfolio}
        openTradesNetPnlSum={openTradesNetPnlSum}
        onClearStranded={() => clearStrandedMutation.mutate()}
        isClearing={clearStrandedMutation.isPending}
        onResetAll={() => resetSessionMutation.mutate()}
        isResetting={resetSessionMutation.isPending}
      />

      <Card className="rounded-xl border shadow-sm overflow-hidden p-2">
        <OpenTradesTable
          trades={trades}
          emptyLabel="No open trades"
          extraHeaders={
            <>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Engine slot this position occupies, out of the guardrail cap.">Slot</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Price feed this row's Current value came from (WS = live Kraken WebSocket; REST = polling fallback).">Source</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actions</th>
            </>
          }
          renderExtraCells={(trade) => {
            const t = trade as AdaptedOpenTrade;
            return (
              <>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {t.slotNumber != null ? `${t.slotNumber}${Number.isFinite(Number(t.maxSlots)) ? ` / ${t.maxSlots}` : ''}` : '—'}
                </td>
                <td className="px-3 py-2 text-xs font-mono">{t.sourceLabel ?? '—'}</td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-red-600 hover:bg-red-50"
                    disabled={closeTradeMutation.isPending || !t.id}
                    onClick={() => t.id && closeTradeMutation.mutate(t.id)}
                    data-testid={`close-trade-${t.symbol}`}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Close
                  </Button>
                </td>
              </>
            );
          }}
        />
      </Card>
    </section>
  );
}
```

## §D — NEW FILE paper-trade-adapter.test.ts

```typescript
/**
 * P19-B8.7 Step-9 — paper→VTS-shape adapter tests.
 *
 * Pins the three contracts the shared-table mount depends on:
 *  1. Wire-format parity with the VTS serializer (signed '+X.XX%' strings,
 *     'N/A' sentinels, decimal precisions) — the shared cells must not be able
 *     to tell a paper row from a VTS row.
 *  2. No-fabrication honesty: absent metadata → '—'/undefined/null, NEVER an
 *     invented number (the deleted mlConfidence ?? ngc×0.9 lesson).
 *  3. Retired-metric fence: finalScore/hybridScore are NEVER emitted (#525).
 *
 * The adapter lives in client/src (imported relatively — vitest has no '@'
 * alias) but is pure TS with type-only React-side imports, so it runs clean
 * in the node environment.
 */
import { describe, it, expect } from 'vitest';
import {
  adaptPaperOpenTrade,
  adaptPaperClosedTrade,
  type PaperActiveTradeRow,
  type PaperClosedTradeRow,
} from '../../../client/src/lib/paper-trade-adapter';

const baseOpenRow: PaperActiveTradeRow = {
  id: 't-1',
  symbol: 'LTC/USD',
  strategy: 'vwap_pullback',
  assetClass: 'crypto_spot',
  patternType: null,
  quantity: 12.3456789,
  entryPrice: 100,
  currentPrice: 102,
  grossPnl: 24.691,
  grossPnlPercent: 2.0,
  netPnl: 20.5,
  netPnlPercent: 1.66,
  entryFee: 1.0,
  entrySlippage: 0.5,
  estExitFee: 2.0,
  estExitSlippage: 0.69105,
  estTotalCost: 4.19105,
  takeProfit: 105,
  stopLoss: 98,
  holdingDurationMs: 185_000, // 3m05s
  openedAt: '2026-07-17T04:00:00.000Z',
  metadata: {
    regime: 'TREND_FRIENDLY_STABLE',
    signalType: 'QUANT',
    pool: 'ideal',
    sourcePool: 'quant',
    rankingScore: 0.42,
    expectedEdge: 0.031,
  },
  volume24h: 54321,
  positionValue: 1259.259,
  tradeMode: 'TARGET',
  chosenEntryMode: 'maker',
  entryFeeRate: 0.004,
  state: 'open',
};

const baseClosedRow: PaperClosedTradeRow = {
  id: 'c-1',
  symbol: 'US/USD',
  assetClass: 'xstock_spot',
  strategyName: 'orb_breakout',
  quantity: '3.5',
  entryPrice: '200',
  exitPrice: '206',
  stopLoss: '196',
  takeProfit: '206',
  grossPnl: '21',
  netPnl: '15.4',
  netPnlPercent: '2.2',
  totalCost: '5.6',
  entryFee: '2.8',
  exitFee: '2.8',
  entrySlippage: '0',
  exitSlippage: '0',
  exitFeeMode: 'maker',
  exitRestOutcome: 'fill',
  openedAt: '2026-07-16T14:00:00.000Z',
  closedAt: '2026-07-16T15:30:00.000Z',
  closeReason: 'target_hit',
  signalType: 'QUANT',
  patternType: null,
  sourcePool: 'quant',
  chosenEntryMode: 'taker',
  entryFeeRate: '0.008',
  metadata: { regime: 'IMPULSE_EXPANSION', pool: 'rotational' },
};

describe('adaptPaperOpenTrade — VTS wire-format parity', () => {
  it('formats distances exactly like the VTS serializer (signed target, unsigned stop)', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    // (105-102)/102*100 = 2.9412 → '+2.94%'; (98-102)/102*100 = -3.9216 → '-3.92%'
    expect(t.distanceToTarget).toBe('+2.94%');
    expect(t.distanceToStop).toBe('-3.92%');
  });

  it('emits N/A when target/stop are zero, like VTS', () => {
    const t = adaptPaperOpenTrade({ ...baseOpenRow, takeProfit: 0, stopLoss: 0 });
    expect(t.distanceToTarget).toBe('N/A');
    expect(t.distanceToStop).toBe('N/A');
  });

  it('signs the percent strings and applies VTS decimal precisions', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.grossProfitPercent).toBe('+2.00%');
    expect(t.netProfitPercent).toBe('+1.66%');
    expect(t.dollarValue).toBe(1259.26);   // 2dp
    expect(t.quantity).toBe(12.345679);    // 6dp
    // 4dp — (4.19105).toFixed(4) = '4.1910' (the double sits just under the
    // midpoint), same parseFloat(toFixed(4)) path the VTS serializer runs.
    expect(t.costs).toBe(4.191);
  });

  it('maps DIRECT + metadata-sourced fields', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.symbol).toBe('LTC/USD');
    expect(t.assetClass).toBe('crypto_spot');
    expect(t.regime).toBe('TREND_FRIENDLY_STABLE');
    expect(t.pool).toBe('IDEAL'); // uppercased like VTS
    expect(t.sourcePool).toBe('quant');
    expect(t.target).toBe(105);
    expect(t.exitPrice).toBeNull();
    expect(t.durationOpenMinutes).toBe(3);
    expect(t.chosenEntryMode).toBe('maker');
    expect(t.entryFeeRate).toBe(0.004);
    expect(t.state).toBe('open');
    expect(t.tradeMode).toBe('TARGET');
    expect(t.entryLiquidityValue).toBe(54321);
    expect(t.entryLiquidityKind).toBe('volume_qty');
  });

  it('passes the cost 5-col breakdown through (split renders only when present)', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.costEntryFee).toBe(1.0);
    expect(t.costEntrySlippage).toBe(0.5);
    expect(t.costExitFee).toBe(2.0);
    expect(t.costExitSlippage).toBe(0.69105);
    const bare = adaptPaperOpenTrade({ ...baseOpenRow, entryFee: undefined, entrySlippage: undefined, estExitFee: undefined, estExitSlippage: undefined });
    expect(bare.costEntryFee).toBeNull();
    expect(bare.costExitSlippage).toBeNull();
  });
});

describe('adaptPaperOpenTrade — no-fabrication honesty', () => {
  it('renders em-dash strings / undefined numbers when metadata is absent — never invents', () => {
    const t = adaptPaperOpenTrade({ ...baseOpenRow, metadata: null });
    expect(t.regime).toBe('—');
    expect(t.signalType).toBe('—');
    expect(t.pool).toBe('—');
    expect(t.sourcePool).toBeUndefined();
    expect(t.rankingScore).toBeUndefined();
    expect(t.expectedEdge).toBeUndefined();
    expect(t.regimeWeight).toBeUndefined();
  });

  it('emits null (not 0) for absent entry-liquidity and #515 global/pair context', () => {
    const t = adaptPaperOpenTrade({ ...baseOpenRow, volume24h: 0 });
    expect(t.entryLiquidityValue).toBeNull();
    expect(t.entryLiquidityKind).toBeNull();
    expect(t.globalRegime).toBeNull();
    expect(t.pairFriction).toBeNull();
    expect(t.globalFriction).toBeNull();
    expect(t.pairDirectionalBiasScore).toBeNull();
  });

  it('NEVER emits the retired finalScore/hybridScore (#525 fence)', () => {
    const t = adaptPaperOpenTrade(baseOpenRow) as Record<string, unknown>;
    expect('finalScore' in t).toBe(false);
    expect('hybridScore' in t).toBe(false);
  });
});

describe('adaptPaperClosedTrade — decimal-string rows', () => {
  it('parses drizzle decimal strings and computes derived fields', () => {
    const t = adaptPaperClosedTrade(baseClosedRow);
    expect(t.strategy).toBe('orb_breakout');
    expect(t.quantity).toBe(3.5);
    expect(t.entryPrice).toBe(200);
    expect(t.exitPrice).toBe(206);
    expect(t.dollarValue).toBe(700); // 3.5 × 200
    // gross% = 21/700*100 = 3.00
    expect(t.grossProfitPercent).toBe('+3.00%');
    expect(t.netProfitPercent).toBe('+2.20%');
    expect(t.costs).toBe(5.6);
    expect(t.durationMinutes).toBe(90);
    expect(t.entryTime).toBe('2026-07-16T14:00:00.000Z');
    expect(t.exitTime).toBe('2026-07-16T15:30:00.000Z');
    expect(t.entryFeeRate).toBe(0.008);
  });

  it('uppercases closeReason so the shared result badge/label maps hit directly', () => {
    expect(adaptPaperClosedTrade(baseClosedRow).resultType).toBe('TARGET_HIT');
    expect(
      adaptPaperClosedTrade({ ...baseClosedRow, closeReason: 'trailing_stop_hit' }).resultType,
    ).toBe('TRAILING_STOP_HIT');
    expect(adaptPaperClosedTrade({ ...baseClosedRow, closeReason: null }).resultType).toBe('UNKNOWN');
  });

  it('carries the realized cost breakdown + B8.6 maker-exit cohort stamps', () => {
    const t = adaptPaperClosedTrade(baseClosedRow);
    expect(t.costEntryFee).toBe(2.8);
    expect(t.costExitFee).toBe(2.8);
    expect(t.costEntrySlippage).toBe(0);
    expect(t.costExitSlippage).toBe(0);
    expect(t.exitFeeMode).toBe('maker');
    expect(t.exitRestOutcome).toBe('fill');
  });

  it('marks never_filled rows visible-but-excluded, like VTS (B7.2c)', () => {
    expect(adaptPaperClosedTrade(baseClosedRow).countsInAggregates).toBe(true);
    expect(
      adaptPaperClosedTrade({ ...baseClosedRow, closeReason: 'never_filled' }).countsInAggregates,
    ).toBe(false);
  });

  it('never coerces missing numerics to fabricated values or emits retired metrics', () => {
    const t = adaptPaperClosedTrade({
      ...baseClosedRow,
      grossPnl: null,
      netPnl: null,
      metadata: null,
    }) as Record<string, unknown>;
    expect(t.grossProfitPercent).toBe('—');
    // Null P/L → NaN, which the cells isFinite-guard to an em-dash — never $0.00
    // beside a '—%' (Langston Step-4 note 2).
    expect(Number.isNaN(t.grossProfitValue)).toBe(true);
    expect(Number.isNaN(t.netProfitValue)).toBe(true);
    expect(t.regime).toBe('—');
    expect('finalScore' in t).toBe(false);
    expect('hybridScore' in t).toBe(false);
    expect(t.rankingScore).toBeUndefined();
  });
});
```

## §E — the DELETED file: content is archived at 1-system-manual/_archive/deleted-code/active-trades-v2.P19-B8.7-Step9.tsx.removed (1,362 lines; the DELETED_COMPONENTS_LOG entry in §A carries the verbatim FEE/SLIPPAGE quote + blast radius).

Bench at THIS tree state on the 058ebe2d4-pulled bench: tsc baseline OK · 19/19 (adapter 13 + venue 6).
