# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + two-paragraph default; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt fix; §6 Langston comms; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston verbatim relay + visibility. Kyle directive 2026-05-20: summaries TO KYLE go in THIS session, not Telegram-only. Langston-verbatim relays to Telegram STILL mandatory per §6.5 step 3.
5. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-21 PM — B79.0n.UNIVERSE-DISCOVERY CLOSED, NEXT IS B79.0n.STORAGE)

**B79.0n.UNIVERSE-DISCOVERY CLOSED 2026-05-21.** Deploy commit `c97ceec81` (PM2 #308). Step 8 Langston ACK clean (all 7 of 7 in-window gates reproduced independently via `ssh staging`). Three non-blocking findings concurred. One new watch item.

**What shipped:**
- Replaces hardcoded `XSTOCK_SPOT_REGISTRY` + deleted `xstocks-universe.json` with dynamic DB-backed universe populated by three-service chain (CoinGecko prime-mover + Kraken WS subscription probe ground-truth + Finnhub per-symbol enrichment).
- 3 new DB tables: `xstock_spot_universe` (PK symbol, sector CHECK constraint), `xstock_spot_universe_overrides` (preserves curator decisions), `discovery_runs` (forensic audit).
- 5-layer fallback at boot: live → DB snapshot → file cache → bootstrap → fail-fast.
- Daily 06:00 UTC cron + `POST /api/internal/universe-discovery/refresh` + `GET .../health`.
- Stale (>7d log-only) + delisted (>30d auto-`UPDATE is_delisted=true`) lifecycle anchored on `last_seen_at` (data arrival), not WS-accept.
- 35 new unit tests GREEN (5 enum integrity + 12 universe-service contracts + 18 Finnhub-industry regression locks).

**First live cycle:** run_id=1, manual_endpoint, duration 603 200 ms (Finnhub leg dominant ~9m50s), symbols_discovered=479, 489 active in DB. **15 sectors** (gate ≥7 ✓), **10.2% UNCATEGORIZED** (gate ≤20% ✓), **100% Finnhub enrichment** (gate ≥80% ✓).

**Empirical universe delta:** 260 (hardcoded pre-deploy) → 489 (DB post-cycle) = **+229** previously-uncatalogued Kraken-traded xStock pairs. Validates Kyle's architectural concern that manual maintenance was leaving real gaps.

**Identity-mechanism clarification for record (Kyle question 2026-05-21):** asset identity = symbol string + Kraken WS-accept (binary ground truth); industry classification = METADATA sector label applied AFTER universe inclusion; +229 new symbols are real distinct Kraken-traded pairs, NOT misclassifications.

**Infrastructure scaling absorbed cleanly (verified 12:26 UTC):** 9 of 10 sampled newly-discovered symbols received bars in the last hour (BABA 34, ASML 17, AMZN 12, etc.). Scanner cycle median ~373ms (down from ~530ms pre-discovery because cursor-rotated batches of 75 cap per-cycle work regardless of universe size). Expected steady-state OHLC write rate ~223k bars/24h (1.86× pre-discovery 120k). Supabase Small tier expected to fit; need 24h IO measurement.

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak 2026-05-31. No action.
- `283bd74e` — B-NEW-36 weekend_shutdown timer fire 2026-05-22 8:05 PM ET. No action.
- `d4b2e590` — **B79.0n.UD 24h crypto regression-lock soak fires 2026-05-22T11:55:57Z.** Thresholds: FX5 pool ±5%, signal gen ±5%, VTS trade rate ±5%, active-trade ±1-2/day OR ±15% 7d.
- `2af50871` — **B79.0n.UD 06:00 UTC cron self-fire review fires 2026-05-22T13:00:00Z.** Confirm run_id=2 exists with `triggered_by='cron_daily'`; check source_chain_status, error_log; compare sector distribution stability.

---

## NEXT IMMEDIATE STEP

**B79.0n.STORAGE** — sub-batch 3 of 18 in umbrella v3. Inherits the dynamic universe via `XSTOCK_SPOT_SYMBOLS` import. Operates at storage API layer.

**Pending soak verifications tomorrow (2026-05-22):**
1. 11:55Z alert `d4b2e590` — 24h crypto regression-lock comparison vs pre-deploy 24h baseline
2. 13:00Z alert `2af50871` — psql `discovery_runs ORDER BY run_id DESC LIMIT 3` to verify cron_daily fired
3. After both: also check Supabase IO consumption to confirm Small tier holds at 489-symbol scale

### Recent commits (B79.0n.UNIVERSE-DISCOVERY chain)
- `c97ceec81` — fix-forward 3: duplicate INSERT in seed migration (deploy commit)
- `3a6ae65cd` — fix-forward 2: biotech substring-collision
- `747f8779b` — Step 4 fix-forward Concerns A+B+C (heuristic expansion + WS-open timeout + UNCATEGORIZED gate)
- `b7b4b9c2f` — fix-forward: `db.execute<T>` generic constraint
- `230348507` — Phase B-F primary implementation

### RUNNING_ISSUES touched (Step 10/11 close)
- **#125 RESOLVED** — dynamic universe discovery (this batch IS the resolution)
- **#120 SUPERSEDED** — Kraken xStock universe-audit motivation rolls into daily background job
- **#126 OPEN** — Layer 3 file cache EACCES; relocate to `${HOME}/.dawntrader-cache/` per Langston Step 8 Option 2 preference (NO PATCHES doctrine)
- **#127 OPEN** — Finnhub re-enrichment monthly stable fields + daily fresh-listed only
- **#128 OPEN** — Cron self-fire one-shot watch (closes after tomorrow's verification)

### Permissions reminder
`.claude/settings.local.json` has `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. Addresses Claude Code v2.1.7+ regression where compound bash commands prompt even with allow rules. Per CLAUDE.md §5 #16.

---

## REQUIRED PRE-READS (FIRST 3 MINUTES OF NEXT SESSION)

1. `DawnTraderV3/CLAUDE.md` (esp. §1 + §3.3 Phase-24 learning rule + §5 #15 NO PATCHES + §6 Langston comms + §10.5 alerts)
2. This file
3. `Claude Comms and Packages/Batch Completion/B79_0n_UNIVERSE_DISCOVERY_COMPLETION_REPORT.md` (just-closed batch; see §10 onboarding learnings — esp. (b.bis) forward-looking items for next sub-batches + (b.tris) infrastructure scaling table)
4. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (umbrella v3)
5. `1-system-manual/RUNNING_ISSUES.md` #126 / #127 / #128 (open follow-ups from this batch)
6. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 4.8 (NEW — Dynamic universe discovery canonical pattern landed this batch)
