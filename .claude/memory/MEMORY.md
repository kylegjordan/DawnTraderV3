# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — comms; §2 Step 10.b — Langston MEMORY sync mandatory; §6.5 Step 3 — Telegram verbatim relay mandatory).
2. Read this file.
3. Read `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — **this is the canonical blueprint for any new asset class onboarding.** Updated post-Phase-24 with numbered procedural checklist + Section L (ticker-collision check) + Section D.1 (code templates).
4. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for current phase.
5. Receive Kyle messages in this Claude Desktop conversation.
6. For Kyle ↔ Langston traffic visibility, tail `/var/log/cc-bridge-inbox.jsonl` on Hetzner.
7. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; wait on legacy-TS-baseline CI before deploying — Test+Build+Docker pass is enough; forget the no-touch fence on crypto_spot; dump every lesson into the workflow doc (only standing rules belong there per Kyle directive 2026-05-10).

---

## CURRENT STATE — 2026-05-11 (B79.0m.a SHIPPED + B79.0m.b IN-FLIGHT — pre-audit done, implementation 30% complete)

**B79.0m.a SHIPPED + VERIFIED on staging PM2 #216** (HEAD `0a9d85588`). Threshold authoring complete:
- 19 xstock_spot strategy_gates rows (10 enabled + 9 disabled, code constant DELETED, DB authoritative)
- 10 family-IMF screener_filters rows for xstock_spot
- screener_filters unique index extended to (mode, asset_class, filter_path)
- 3 regime classifier rows (TFS volatility/momentum scales halved + Path B sustainability)
- xStocks tab amber banner 🚨 "VTS evaluation pipeline NOT yet wired"
- CLAUDE.md §9.1 SCAFFOLDING-VS-FUNCTIONAL rule + §9.2 NUMERIC-DELTAS rule added

**B79.0m.b IN-FLIGHT** (partial commit `3b84dc756`). Pre-audit + initial implementation done:
- Pre-audit `BATCH_79_0m_b_PRE_AUDIT.md` Langston Step 2 APPROVED with R1-R6 applied
- MCE.computeContext extended with `assetClass` param + conditional DBS synth + per-class macro modifier
- b72-warmup adds mce_config to PREFETCH_MODULES
- TEC enablement SQL ready (xstock BE=true, trail=0.8× crypto; not yet applied to staging)
- Workflow doc updated with Phase 24 onboarding lessons retrospective

**ASSET_CLASS_ONBOARDING_WORKFLOW.md** updated with 7-step corrected sequence (Kyle directive — captured before forgetting, NOT a governance batch).

Crypto no-touch fence holds (10 factor families × 7-8/hr ±10% baseline).

## REMAINING B79.0m.b WORK (resume after compact)

Per pre-audit `BATCH_79_0m_b_PRE_AUDIT.md` (LANGSTON STEP 2 APPROVED). Architecture LOCKED. Just execute:

**1. Apply TEC migration to staging** `2026-05-11-b79-0m-b-xstock-tec-enable.sql`

**2. Build NEW xstock-side modules:**
- `server/asset_classes/xstock_spot/global-filter.ts` (~80 LOC) — global filter on fresh pairs; resolve config via `getScreenerFilters({mode, assetClass:'xstock_spot'})`; emit counter deltas; N/A applicability for stablecoin/quote_currency/market_cap gates
- `server/asset_classes/xstock_spot/imf-evaluator.ts` (~120 LOC) — 5 family paths + pattern path; reads family thresholds via `getScreenerFilters({mode, filterPath:'vts_<family>', assetClass:'xstock_spot'})`; uses existing `imf-metrics.ts` LQ/VN/DI helpers
- `server/asset_classes/xstock_spot/eval-cycle.ts` (~150 LOC) — orchestrator: market-hours gate → global filter → IMF → MCE.computeContext('xstock_spot', ..., undefined-DBS) → for each strategy in regime's allowed-AND-enabled set: callStrategyDetect → SQE evaluate → archive to signal_eval_archive → if pass open VTS trade

**3. Wire scanner.ts** — `xstockSpotScanner.runCycle` after freshness gate at line 290+, iterate fresh pairs (process ALL, no batching per Langston R6), call `evaluateXstockPairForVTS` per pair

**4. Export `registerOpenVtsTrade` helper** from vts-runner.ts — inserts + Map.set + setup-hash record. xstock eval-cycle calls this. Setup-hash key fix in same helper: `${assetClass}:${symbol}:${strategy}` (Langston R6 from rev2)

**5. Exit-path helper** `getOHLCSourceForTrade(trade)` per Langston Step 2 R1 — returns correct OHLC cache binding by trade.assetClass. Unit test BOTH branches.

**6. Banner removal** from `client/src/components/machine-learning/xstocks-tab.tsx`

**7. Skipped-signals asset_class field + filter** — fix the Filter Diagnostics leak. SkippedSignalEntry interface + caller writes + `getSkippedSignalsSummary(days, assetClass?)` filter. Crypto entries default crypto_spot.

**8. SQL migrations** (per Langston Q3 + Q4 answers):
- Per-strategy xstock thresholds for 9 non-ORB strategies — only volatility-sensitive (~30-50 rows), wildcard-keep scale-free pattern geometry with inline justification
- Regime classifier xstock-explicit rows for remaining 4 regime branches (RBS/IE/HVU/ST volatility/momentum scales)
- All tagged `updated_by='b79.0m.b-layer1-starter-equity-baseline'`

**9. Asset-class log tagging refactor** — helper `withAssetClass(msg, assetClass)` or inline; thread through all shared eval functions

**10. Tests:** 18-strategy null-DBS matrix asserting neutral 1.0 SQE outcome; exit-path xstock branch; TEC differentiation (`resolveTECConfig('crypto_spot').breakEvenEnabled===false` AND `resolveTECConfig('xstock_spot').breakEvenEnabled===true`); setup-hash assetClass-keyed

**11. Deploy + Verify (G1-G9):**
- G1 CI green
- G2 DB seeds via psql
- G3 PM2 boot logs include `[B79.0m.b][EVAL] symbol=... assetClass=xstock_spot ...` per pair
- G4 signal_eval_archive accumulating xstock rows; xstock VTS trade opens AND closes within 24h **OR** synthetic-injection escape valve per Langston R3 (R3-relaxed if quiet tape)
- G5 TEC differentiation: BE=true for xstock, BE=false for crypto; first xstock close logs `[BHF3] break_even_stop`
- G6 Filter Diagnostics tab isolation: crypto tab shows ZERO xstock; xStocks tab shows ONLY xstock; getSkippedSignalsSummary filtered; **banner removed**
- G7 crypto no-touch fence
- G8 SQE distribution sanity for xstock rows
- G9 xstock cycle p95 ≤ 1.3× crypto baseline (definition per Langston R4)

**12. Completion report + governance** — BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES (#92 RESOLVED + #94 B79.0n tracker), SIM, CHANGES_AND_FIXES, MEMORY 3-way sync per CLAUDE.md §2 Step 10.b

## Open Langston follow-ups logged (don't include in this batch)

- RUNNING_ISSUES candidate: per-asset-class DBS computation for xstock (Layer-3 driven)
- RUNNING_ISSUES candidate: unify crypto macro source to module_constants (currently CoinGecko-fed cache; xstock reads DB)
- RUNNING_ISSUES candidate: computeContext options-object refactor (Langston R5; too many positional params)
- RUNNING_ISSUES candidate (already #85): extend B79.TEC HARD-FAIL to all behavioral TEC keys (in scope of B79.0m.b's TEC work)

**Canonical onboarding workflow** at `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — post-Kyle-directive 2026-05-10, contains ONLY standing rules + procedural checklist. Trial-and-error history lives in per-batch completion reports, not the workflow doc.

**5 architectural standing rules from Phase 24** (now in SYSTEM_MANUAL appendix):
1. Per-asset-class behavioral config DB-resolved with HARD-FAIL boot
2. Telemetry partitioning via separate-instance triad when distributions differ
3. Asset-class resolution is exchange-disambiguated, never canonical-form-disambiguated
4. Persistence-at-trade-open via `vts_open_trades` table (rehydrates on restart)
5. Ticker-collision gate (`XSTOCK_SPOT_KRAKEN_COLLISIONS`) on shared-exchange path

---

## NEXT STEP — Resume B79.0m.b from `3b84dc756` per "REMAINING B79.0m.b WORK" above

Pre-audit Langston-APPROVED; architecture LOCKED. Just execute the 12 numbered steps. Start by re-reading the pre-audit file (`Claude Comms and Packages/Scope Files/BATCH_79_0m_b_PRE_AUDIT.md`) which has all decisions + Q1-Q6 answers from Langston Step 2. Then execute step 1 (apply TEC migration to staging) and proceed sequentially. Banner removal is at step 6; full G1-G9 verification at step 11.

After B79.0m.b: B79.0n (active-trading wire-in via signal-orchestrator). Then B79.3 (equity macro modifiers).

## Other open work (lower priority, after B79.0m.b)

- **#89 Kraken WS-equities (Path A/C pending Kyle commercial directive)** — Path B dead empirically; not actionable without Kyle decision
- **#93 governance-doc `tunable_status` schema-drift sweep** — own batch, no urgency
- **B79.3 equity macro modifiers** — RUNNING_ISSUES #94, sequences after B79.0m.b + B79.0n
- **B79.0n active-trading wire-in** — drafts after B79.0m.b closes
- **Section M procedural recipe** in ASSET_CLASS_ONBOARDING_WORKFLOW.md for B80 (deferred)

---

## PHASE 24 ARCHIVE — see BATCH_CATALOG.md for full history

Most recent before B79.0m: B79.0g-tx (atomic close-time soft-delete) PM2 #215. B79.0L (xStock unified Fri 8PM ET → Sun 8PM ET close) PM2 #214. B79.0m.a (threshold authoring + DB-driven strategy_gates + diagnostic fixes + CLAUDE.md §9.1/§9.2) PM2 #216.

---

## NO-TOUCH FENCE on crypto_spot through 2026-05-15

```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```
If cadence drops post-deploy → halt and revert.

---

## OPERATIONAL FACTS

- xstocks 24/5 ARCA-aligned + 10 Kraken Phase-1 24/7 names (TSLA, AAPL, SPY, QQQ, GLD, GOOGL, HOOD, MSTR, NVDA, CRCL — bypass ARCA gate). $1000 base → ~$150/trade sizing.
- Kraken WS-equities silent on weekends regardless of 24/7 marker (RUNNING_ISSUES #89). Future B79.x: REST polling fallback OR Kraken Pro feed-tier investigation.
- xstock + perp feeds archived via B74 (renamed to xstock_*_ohlc_1m / xstock_*_ticker_snap in B79.0e).
- B74 Kraken Futures REST live at `server/services/passive-archive/equity-perp-archiver.ts`.

---

## LANGSTON RUNTIME + COMMS (since 2026-05-06)

Two systemd bridges on Hetzner `204.168.141.77`. Unified inbox log `/var/log/cc-bridge-inbox.jsonl`.

**Send protocol (CC → Langston):** 3 STEPS. (a) `cc-comms-bridge send` Telegram visibility post; (b) SSH-deliver via `sudo -u langston /usr/local/bin/langston-call /tmp/prompt.txt /tmp/reply.txt` — auto-retries; defaults to fresh UUID per attempt; **for code-review work explicitly use `--permission-mode bypassPermissions` via direct claude-cli invocation** because watchdog wrapper uses `acceptEdits` which hangs on Bash tool use; (c) MANDATORY post Langston verbatim stdout reply to Telegram via `@LangstonDTBot` sendMessage prefixed `**LANGSTON SPEAKING:**`. Pattern in CLAUDE.md §6.5 Step 3.

**Hetzner GDrive FUSE recursive-grep is BROKEN.** Tell Langston explicitly "Read tool only, no Bash/Grep recursive ops." Stage diffs at `/tmp/` via scp.

**Langston context status:** each watchdog call uses fresh UUID per task — no long-running session accumulation. He doesn't approach context limits. No compaction needed.

**Langston MEMORY sync per batch — MANDATORY** (CLAUDE.md §2 Step 10.b). Mirror this MEMORY to `/home/langston/MEMORY.md` via SSH+scp. Same 200-line cap.

**OAuth token:** `/etc/langston/oauth.env`, valid 1 year (issued 2026-05-06).

---

## File-first comms protocol (CLAUDE.md §6.5.0, Kyle directive 2026-05-08)

For prompts >3KB OR multi-question reviews: stage at `Claude Comms and Packages/Langston Design Asks/<batch>_<topic>_<rev>.md`. Watchdog prompt is short pointer (under 1KB). Never shorten content to dodge API hang on large prompts — file-on-disk is the proper solution.

---

## Kyle Operating Directives (active, condensed)

- **NO PATCHES** (CLAUDE.md §5 #15). Long-term sustainable solutions only. Architecture decisions documented BEFORE implementation, same session.
- **Per-asset-class config is the default** for behavioral knobs. Wildcards only as starting placeholders.
- **Backpressure: vertical-scale, never asset-class shedding.**
- **Each new asset class gets its OWN dedicated observation UI tab** — don't stack panels under existing tabs.
- **Don't dump every lesson into workflow docs** (Kyle 2026-05-10). Only standing rules. Trial-and-error history lives in completion reports.
- **No fallbacks for DB-governed settings.** Sensitive credentials → staging `.env` via SSH only.
- **Kyle messages me here in Claude Desktop.** Telegram is for Kyle ↔ Langston + CC outbound visibility only.
- **No-touch fence on crypto_spot through 2026-05-15.**
- **Iterate with Langston to consensus** — escalate to Kyle only on deadlock / scope expansion / new directive / risk boundary.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` (canonical blueprint)
4. `1-system-manual/POST_AUDIT_ROADMAP.md` (current phase)
5. `Claude Comms and Packages/Batch Completion/BATCH_79_*_COMPLETION_REPORT.md` (most recent closures for trial-and-error history)
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
