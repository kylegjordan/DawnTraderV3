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

## CURRENT STATE — 2026-05-10 (Phase 24 CLOSED + B79.0i.b CLOSED + B79.0j CLOSED — ORB rename + VTS dispatch fix)

**xstock_spot fully onboarded** + B79.0i.b (Filter Diagnostics + rich ablation tables) + B79.0j (ORB rename `risk_reward_ratio` → `target_range_multiple` + bonus VTS dispatch bug fix). PM2 #212 on `migration/aws-supabase` HEAD `fa4cbabdc`. RUNNING_ISSUES #90 RESOLVED. Crypto no-touch fence holds.

**Canonical onboarding workflow** at `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — post-Kyle-directive 2026-05-10, contains ONLY standing rules + procedural checklist. Trial-and-error history lives in per-batch completion reports, not the workflow doc.

**5 architectural standing rules from Phase 24** (now in SYSTEM_MANUAL appendix):
1. Per-asset-class behavioral config DB-resolved with HARD-FAIL boot
2. Telemetry partitioning via separate-instance triad when distributions differ
3. Asset-class resolution is exchange-disambiguated, never canonical-form-disambiguated
4. Persistence-at-trade-open via `vts_open_trades` table (rehydrates on restart)
5. Ticker-collision gate (`XSTOCK_SPOT_KRAKEN_COLLISIONS`) on shared-exchange path

---

## NEXT STEP — Kyle directive needed on B79.0k path forward + B79.0g-tx (#91) Step 2 pre-audit ready

**B79.0k (#89) findings (combined Step 1+2 SHIPPED 2026-05-10, no code):** Path B (REST polling fallback) DEAD via empirical probe — Kraken's `/0/public/AssetPairs` has ZERO xstock entries; no public REST endpoint exists for xStocks. Path A (Kraken Pro feed-tier subscription) is the only Kraken-native option remaining — **requires Kyle directive on commercial commitment**. Path C (Kraken support query) needs Kyle approval to send. Sub-batches B79.0k.1/.2/.3 conditional on directive. See `BATCH_79_0k_COMPLETION_REPORT.md`.

**B79.0g-tx (#91) status:** Langston Step 1 APPROVED Option B (closed-flag soft-delete) with 5 specific adjustments. Adjustments applied to scope file. Step 2 pre-audit ready to draft. Implementation ~50-80 LOC: schema migration (closed_at TIMESTAMPTZ + closed BOOLEAN + partial index) + replace `deleteOpenTrade` with `markOpenTradeClosed` (AWAITED, not fire-and-log) + bootstrap filter `WHERE closed=false` + `module_constants`-resolved GC retention (default 90 days). Deferred to next session for proper pre-audit + impl.

## B79.0g-tx Section M procedural recipe in ASSET_CLASS_ONBOARDING_WORKFLOW.md (still queued for B80)

After B79.0j shipped (#90 resolved) the next two open B79.x running issues:
1. **B79.0g-tx (#91)** — substantial refactor plumbing tx handle through `persistRealPriceTrade` in `vts-service.ts:697`. Wraps close-time DELETE-from-vts_open_trades + INSERT-to-paper_sim_trades + B73 hooks + B70 archive in single transaction. Affects multiple call sites. Needs proper Step 1 + 2 separate scope (not combined) given surface area.
2. **B79.0k (#89)** — Kraken WS-equities weekend silence investigation. Three paths to evaluate (Kraken Pro feed-tier / REST polling fallback mirror B74 pattern / direct Kraken support query). Investigation + decision; implementation depends on findings.

**#92 deferred to Phase 19** per Kyle clarification 2026-05-10: active trading not until Phase 19, so xstockSpotScanner orchestration wiring (which would populate funnel-rejection counters) isn't a near-term batch.

## Section M procedural recipe in ASSET_CLASS_ONBOARDING_WORKFLOW.md (still queued for B80)

Add Section M "Stand up the dedicated observation tab" with the procedural recipe B80 (crypto_perp) implementer follows: (1) export FilterDiagnosticsPanel from machine-learning.tsx if not done, (2) build new sibling endpoints under `/api/<asset_class>/` returning FilterDiagnosticsData v2.0 shape from the asset-class-specific scanner + signal_eval_archive, (3) add 2 ablation sibling endpoints (exit-strategy-ablation + factor-calibration) querying tables filtered by asset_class, (4) build new `<asset_class>-tab.tsx` with 5 sections, (5) wire tab into machine-learning.tsx Tabs group LAST. Defer until B80 actually starts.

## B79.0i.b CLOSED 2026-05-10 (commits 5dde28f52 + cdbd2a04b, PM2 #209)

Per Kyle pushback evening 2026-05-10, xStocks tab EXPANDED beyond the initial B79.0i.a (which was scanner+freshness only). New 5-section structure:
1. Scanner Cycle Header (xstock-specific)
2. Per-Pair Fresh-Tick Latency
3. **FULL FilterDiagnosticsPanel** (Pipeline Summary + Last Scan Filter Breakdown + 24h Rolling Aggregates + VTS Evaluation Detail by-strategy + Setup Nulls categorical + Pre-Evaluation Skips + Post-Signal Rejections + Filter Metric Ranges) — reused from crypto via export, scoped to xstock_spot via /api/xstocks/filter-diagnostics returning full FilterDiagnosticsData v2.0
4. B73 Exit Strategy Ablation (per-variant n + avg P/L + diff vs baseline + win-rate)
5. B67.0 Factor Calibration Ablation (with mandatory amber caveat banner showing live n vs decision-grade threshold 150)

3 NEW sibling endpoints under /api/xstocks/. Crypto regression NONE by-construction (no /api/vts/* or /api/analytics/* mods). G3 Claude-in-Chrome walkthrough verified all 5 sections render. **Finding #1 still stands** — funnel-rejection counters zero until xstockSpotScanner is wired through orchestration (future B79.x batch); strategy-level + null-reason aggregates ARE real from signal_eval_archive. Hotfix `cdbd2a04b` corrected factor-calibration to use jsonb `(real_decision->>'confidence')::numeric` extraction instead of nonexistent flat columns.

---

## PHASE 24 ARCHIVE (CLOSED 2026-05-10)

| Sub-batch | Commit | PM2 | Summary |
|---|---|---|---|
| B79 | `260cc8cc5` | #184 | Dormant scaffold + workflow doc |
| B79.TEC | `7eb4f5452` | #190 | Per-class TEC config + HARD-FAIL boot |
| B79.0a | `a327964a5` | #197 | Live scanner + telemetry triad + freshness helper |
| B79.0b | `54201bd32` | #198 | N3+N4 cleanup + SQE wildcard DELETE script |
| B79.0c | `e37679ebc` | #202 | Per-symbol 24/7 predicate (Kraken Phase 1) |
| B79.0d | `13178e9b5` | #203 | ORB real implementation (~210 lines) |
| B79.0f | `3ba99237a` | #204 | Collision disambiguation + 4862-row backfill |
| B79.0g | `fb42335f7` | #205 | vts_open_trades persistence + bootstrap-with-re-resolve |
| B79.0e | `aca52acdc` | #206 | equity_*→xstock_* (172 DB objects) |
| B79.0h | `963475be9` | n/a | Workflow + SIM/SYSTEM_MANUAL retrospective |
| B79.0i.a | `c927924df` | #207 | xStocks tab (Phase 1: Panel A scanner-cycle + Panel E freshness + 2 new endpoints) |
| B79.0i.b | `5dde28f52`+`cdbd2a04b`+`b9a1cdd4e` | #210 | xStocks tab: Filter Diagnostics mirror + rich ExitStrategyAblationSection + FactorCalibrationSection (reused via export+endpointBase prop). Aggregators parameterized with optional asset_class. "Shadow-mode" → "VTS Observation". |
| B79.0j | `418088c7a`+`fa4cbabdc` | #212 | ORB rename `risk_reward_ratio` → `target_range_multiple` (resolves RUNNING_ISSUES #90) + bonus VTS dispatch bug fix (B79.0d had missed `vts-runner.ts:callStrategyDetect` dispatch site for ORB — silently 100%-nulling on VTS path). |
| B79.0k | (governance only) | n/a | Investigation batch — Kraken WS-equities weekend silence. Decision matrix: Path B DEAD via probe (no public REST endpoint for xStocks), Path A needs Kyle directive (commercial), Path C needs Kyle approval (free). |

**Pending operator gates Sunday 2026-05-10/11:**
- ~11:24 UTC — B79.TEC.b `break_even_enabled` wildcard DELETE per checklist
- ~21:38 UTC — B79.0a SQE wildcards DELETE per checklist

**Open RUNNING_ISSUES post-Phase-24:** #89 Kraken WS-equities weekend silence, #90 ORB risk_reward_ratio rename, #91 B79.0g-tx atomic close-time tx.

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
