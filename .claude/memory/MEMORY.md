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

## CURRENT STATE — 2026-05-10 (Phase 24 CLOSED + B79.0i.a SHIPPED)

**xstock_spot fully onboarded** across 9 sub-batches + B79.0i.a (xStocks observation tab Phase 1) shipped 2026-05-10. PM2 #207 on `migration/aws-supabase` HEAD `c927924df`. All 5 verification gates PASS including Claude-in-Chrome G3 walkthrough.

**Canonical onboarding workflow** at `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — post-Kyle-directive 2026-05-10, contains ONLY standing rules + procedural checklist. Trial-and-error history lives in per-batch completion reports, not the workflow doc.

**5 architectural standing rules from Phase 24** (now in SYSTEM_MANUAL appendix):
1. Per-asset-class behavioral config DB-resolved with HARD-FAIL boot
2. Telemetry partitioning via separate-instance triad when distributions differ
3. Asset-class resolution is exchange-disambiguated, never canonical-form-disambiguated
4. Persistence-at-trade-open via `vts_open_trades` table (rehydrates on restart)
5. Ticker-collision gate (`XSTOCK_SPOT_KRAKEN_COLLISIONS`) on shared-exchange path

---

## NEXT STEP — B79.0i.b (Tue/Wed 2026-05-12/13)

Panels B (B73 Exit Ablation) + C (B67.0 Calibration Ablation with mandatory caveat banner) + D (Strategy Fire-Rate by Regime) on the existing xStocks tab. Parameterize 3 shared endpoints with OPTIONAL `?asset_class=`: `/api/analytics/exit-strategy-ablation`, `/api/analytics/factor-calibration`, `/api/analytics/ablation-comparison`. Crypto-regression invariant = structural + SQL-string equivalence when param omitted (per Langston scope-revision; NOT byte-diff on aggregate values). Required SQL-fixture-committed unit test covering all 3 aggregator paths including `drift-dashboard-aggregator.ts:1055` parameterization (no internal `'crypto_spot'` default — defaults live ONLY in route handlers, no silent fallbacks per Kyle directive). Also: Section M procedural recipe in `ASSET_CLASS_ONBOARDING_WORKFLOW.md` once .b closes (B80 implementer's blueprint for "stand up the dedicated observation tab"). exit_strategy_alternates.asset_class column verified present (default crypto_spot) — no migration needed.

## B79.0i.a CLOSED 2026-05-10 (commit c927924df, PM2 #207)

xStocks tab inside Machine Learning page (sibling to Filter Diagnostics + DBS Pair Tracking, positioned LAST). Panels A (Scanner Cycle Metrics) + E (Per-Pair Fresh-Tick Latency) shipped. 2 new sibling endpoints under `/api/xstocks/`. NO modifications to `/api/vts/*` or `/api/analytics/*` — crypto regression NONE by-construction. **Pre-audit Finding #1:** xstockSpotScanner does NOT track IMF/family/SQE/trade per-stage funnel counters yet (Day 1 = observability-only); Panel A is scanner-cycle metrics ONLY; full funnel deferred to a future B79.x batch. **Langston multi-step approval:** Step 1 (3 conditions applied) + Step 2 (4 conditions C1-C4 applied) + Step 4 APPROVE-ship (3 non-blocking nits). **5-gate verification all PASS** including G3 Claude-in-Chrome live UI walkthrough + N0/N1 rate-sanity check (delta=2 over 60s = exact 30s × 2 cadence) + G5 crypto Filter Diagnostics tab visually-identical post-deploy.

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
