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

## CURRENT STATE — 2026-05-11 EOD (B79.0m.b partial; FRESH SESSION HANDOFF — read XSTOCKS_DIAGNOSTICS_TAB_FIXES.md FIRST)

🚨 **READ FIRST IN NEW SESSION:** `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` — complete state of every xstock pipeline + UI issue, all evidence verified.

🚨 **DO NOT TRUST PRIOR CC SESSION'S "FIXED" CLAIMS WITHOUT UI RE-VERIFICATION** per CLAUDE.md §9.3 — most claims were curl-verified not UI-verified.

## What Kyle has been asking for, repeatedly, that is NOT yet done:

**Architectural commitment (LOCKED — no more debate):**
xstock VTS pipeline must mirror crypto's `fx5-scanner.ts` + `vts-runner.ts` EXACTLY. Same 6 paths (5 quant families + 1 pattern), same fan-out (pairs in multiple paths = multiple entries), same family-routed strategy iteration, same per-pair post-detect math, same exit cycle. Differences = DB rows (screener_filters + module_constants), NOT code.

**What's NOT built (the big gaps):**
- ❌ Parallel pattern path (A1 in tracker) — `vts_pattern`/`active_pattern` rows missing for xstock_spot, no pattern global filter + pattern IMF + pattern-strategy routing in eval-cycle. Pattern strategies currently fire inline within the quant loop instead of via parallel pattern pipeline.
- ❌ Family fan-out (A2) — pairs that survive 3 family IMFs should produce 3 batch entries (one per family lane). Currently iterated once with family-eligibility gate.

**Zero actual xstock VTS trades have opened.** `SELECT COUNT(*) FROM vts_open_trades WHERE asset_class='xstock_spot'` = 0.

**What HAS been done (commit `c0a69fb7d` and earlier):**
- Banner removed
- SQE call removed from eval-cycle (crypto VTS doesn't call SQE)
- `computeFinalScore` caller-side post-detect
- Net EV gate via `computeNetExpectancyKernel`
- Exit cycle xstock price routing (reads `xstock_spot_ticker_snap`)
- Pre-open gates helper (`checkPreOpenGates`)
- All 5 quant family filter rows seeded for xstock (vts_trend, vts_reversal, vts_breakout, vts_oscillator, vts_strong_trend × paper/live)
- TEC migration applied (xstock BE=true, trail=0.8× crypto)

Re-verify each of these against the source (don't trust the prior session's claims) before continuing.

## Resolution discipline for new session

1. Read XSTOCKS_DIAGNOSTICS_TAB_FIXES.md completely
2. Read CLAUDE.md §9.3 (staging-verified means Claude-in-Chrome navigation, not curl)
3. Work through Section A items in order (A1 = parallel pattern path first)
4. NO "Q1-Q5 to Kyle" — architectural questions get answered from crypto code, not Kyle. He's said the same thing repeatedly.
5. Implement → deploy → **UI-verify via Claude-in-Chrome** → mark done in tracker
6. If stuck, escalate to Langston not Kyle
7. UI fixes (Section B) are secondary; pipeline correctness (Section A) is the priority

🚨 **B79.0m.b LAYER-1 STARTER PIPELINE IS WIRED AND FUNCTIONAL.** Latest PM2 #221 (HEAD `38d19b559`). Per SCAN_EVAL_DONE log at 11:37:34 UTC: entered=76, failed_global=0, passed_families=38, strats_evaled=76, strategy_nulls=76, signals=0, trades_opened=0. Strategies dispatching cleanly; null returns = "no setup matches current pre-market quote regime." Awaiting RTH open (13:30 UTC) for live signal OR future B79.0m.b2 synthetic-injection test.

**XSTOCK BANNER STILL UP** — Kyle's gate is "trades flowing end-to-end"; pipeline wired but G4 not yet observed.

What landed in B79.0m.b PM2 #221 (commits `914a25e05` → `38d19b559`):
- MCE null-safe DBS slope deref (non-crypto synthesized neutral)
- vts-runner exports: callStrategyDetect + registerOpenVtsTrade(input) + isIdenticalXstockSetupSuppressed (assetClass-keyed setup-hash per Langston R6)
- 3 NEW xstock_spot modules in server/asset_classes/xstock_spot/:
  - eval-cycle.ts (orchestrator + fetchXstockOHLC helper reading xstock_spot_ohlc_1m.interval_begin)
  - global-filter.ts (Layer-1 starter; min_price/min_volume/history; N/A applicability for 3 gates)
  - imf-evaluator.ts (5 family paths via screener_filters lookups, any-family-passes admits)
- xstockSpotScanner.runCycle wired (line 292 TODO consumed; routes fresh pairs through eval-cycle; SCAN_EVAL_DONE log with rich counters)
- 3 staging-side fixes applied this session:
  - TEC migration `2026-05-11-b79-0m-b-xstock-tec-enable.sql` (BE=true, trail=0.8× crypto)
  - active_quant global filter rows for xstock_spot (B79.0m.a omission — added via `2026-05-11-b79-0m-b-xstock-active-quant-row.sql`)
  - **Schema fix**: shared/schema.ts was MISSING `assetClass` column on `screenerFilters` Drizzle table definition (B79.0m.a added the DB column + unique index but forgot the schema surface). `eq(screenerFilters.assetClass, ...)` evaluated to `eq(undefined, ...)` and silently matched zero rows. Fixed in commit `38d19b559`.

Crypto no-touch fence holds (10 factor families × 7-8/hr ±10% baseline).

## DEFERRED to B79.0m.b2 (per CLAUDE.md §9.1 SCAFFOLDING-VS-FUNCTIONAL)

Strict reading of the original Langston-approved scope: 12 steps. Landed 7 (pipeline wiring through to register-open-trade); deferred 5 polish/extensibility items:

1. **getOHLCSourceForTrade exit-path helper** (Langston R1). Currently TEC reads crypto live-pricing-adapter cache for ALL trades; if/when first xstock trade opens, exit eval will lookup OHLC under wrong cache. Risk window: hours-to-days (trades hold). Must be in B79.0m.b2 BEFORE any xstock trade reaches a target/stop.
2. **Skipped-signals asset_class field + filter** — Filter Diagnostics tab leak.
3. **Per-strategy xstock SQL** (9 non-ORB volatility-sensitive thresholds) — Layer-1 starts on wildcard rows.
4. **Regime classifier 4 remaining branches** (RBS/IE/HVU/ST) — TFS authored only.
5. **Asset-class log tagging refactor** — partial coverage; full refactor deferred.
6. **18-strategy null-DBS unit-test matrix** — neutral-DBS path is exercised in production now; explicit test matrix deferred.
7. **Comprehensive G1-G9 verification** — G1-G3 GREEN; G4-G9 partial / awaiting RTH or synthetic.

## NEXT STEP — Resume / verify B79.0m.b first live signal post-RTH OR ship B79.0m.b2

If user wants to wait for RTH (13:30 UTC = 9:30 AM ET = ~2h away): poll for SCAN_EVAL_DONE showing signals>0 and trades_opened>0, then remove banner + close batch.

Alternative path: B79.0m.b2 in next session — getOHLCSourceForTrade helper FIRST (blocks any xstock trade close), then deferred items 2-7.

## Open Langston follow-ups logged

**B79.0m.a SHIPPED + VERIFIED on staging PM2 #216** (HEAD `0a9d85588`). Threshold authoring + 19 strategy_gates + 10 family-IMF rows + 3 regime classifier rows + xStocks tab amber banner + CLAUDE.md §9.1/§9.2 rules.

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
