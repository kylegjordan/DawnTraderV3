# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + two-paragraph default; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt fix; §6 Langston comms; §6.5.0.a embedded-diff + no-gdrive dispatch pattern; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston verbatim relay + visibility. Kyle directive 2026-05-20: summaries TO KYLE go in THIS session, not Telegram-only. Langston-verbatim relays to Telegram STILL mandatory per §6.5 step 3.
5. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-21 PM — B79.0n.STORAGE CLOSED, NEXT IS B79.0n.MCE)

**B79.0n.STORAGE CLOSED 2026-05-21.** Deploy commit `ab3153ce5` (PM2 #310 at 14:59:28Z). Langston Step 4 RE-ACK + Step 8 ACK both clean.

**What shipped:**
- `storage.getScreenerFilters({mode, assetClass: AssetClass, filterPath?})` — REQUIRED assetClass, no silent crypto default.
- NEW `storage.getCanonicalScreenerConfig({mode, filterPath?})` helper for UI/diagnostic display with banner NEVER-for-routing docstring.
- NEW `SQEInput.assetClass` REQUIRED field; plumb through `getSQEThresholdsFromConfig` + `evaluateSignalQuality` + `SignalQualityEvaluatorService.getThresholds` with cache key extended `${mode}` → `${mode}:${assetClass}`.
- 38 caller sites updated (pre-audit 32 + 6 surfaced via compile-driven audit). Final: 10 (a) crypto-intentional + 1 (c) SQE bug fix + 21 (d) diagnostic helper + 6 already-correct.
- Seed migration `2026-05-21-b79-0n-storage-xstock-screener-filters-seed.sql` — 10 xStock rows cloned from crypto baseline (idempotent ON CONFLICT DO NOTHING). Coverage 12/12 on all 4 (asset_class, mode) combos post-deploy.
- upsertScreenerFilters Step 4 BLOCKER fix: REQUIRED-assetClass on data shape + UPDATE WHERE 3-clause `(mode, asset_class, filter_path)` (was 2-clause; would silently cross-corrupt rows post-seed).
- 2 new test files (8 tests total): required-assetclass.test.ts with `@ts-expect-error` upsert regression lock + sqe-asset-class-routing.test.ts with cache-isolation case.

**Langston review trail:** Step 1 ACK + 3 concerns A/B/C → Step 2 ACK + 4 asks (row count: 10 missing + arithmetic + RUNNING_ISSUES wording + cache-isolation test) → Step 2 RE-ACK APPROVED → Step 4 NOT YET ACK + 1 BLOCKER + 3 (d)→(a) reclassifications → Step 4 RE-ACK APPROVED → Step 8 ACK (independent staging verification: xStock cycle durations 1111/1142/1146/1160/**1288ms peak** — 19× under 25s ceiling).

**Dispatch infrastructure lesson (CLAUDE.md §6.5.0.a reaffirmed):** Step 4 RE-ACK v1 dispatch hung 10+ min on `git -C /mnt/gdrive` FUSE I/O — D-state stuck. v2 with embedded-diff inline + explicit "DO NOT git-grep against /mnt/gdrive — use ssh deploy@staging" at TOP completed cleanly. Pattern codified in ASSET_CLASS_ONBOARDING_WORKFLOW Step 4.9 + completion report §10(d).

**Umbrella rev 4 (commit ab3153ce5) — KEY ARTIFACT:** B72 prior-arc context section (§1.5) enumerates per-sub-batch what B72/B72.1/B72.2 already did + what remains. **STRATEGY (#5) + SCORING (#8) + MCE (#4) + EXECUTION (#15) shrink materially** because B72 wired their API-side modules. RTB/ORCHESTRATOR/PATTERN-DETECT/OBSERVABILITY shrink modestly. CONFIDENCE-CHAIN/TEC/TELEMETRY/RTB-REFRESH/POOL/WIRE-IN/ML-CALIBRATION no overlap. **New mandate:** every future sub-batch scope file MUST include a B72 prior-arc context section at Step 1.

**Stale-reference corrections (commit f6f823c60):** Kyle's "Are you sure B72 was not implemented?" surfaced that BATCH_CATALOG.md row 171 (pre-shipping planning entry) had been incorrectly read as authoritative. Row 171 + 4 POST_AUDIT_ROADMAP refs corrected to past-tense. Actual ship rows are 212-214 (B72.2 + B72.1 + B72 main).

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak 2026-05-31. No action.
- `283bd74e` — B-NEW-36 weekend_shutdown timer 2026-05-22 8:05 PM ET. No action.
- `d4b2e590` — **B79.0n.UD + STORAGE 24h crypto regression-lock soak fires 2026-05-22T11:55:57Z.** Same-day deploys (UD 11:51 UTC + STORAGE 14:59 UTC) share this baseline comparison. Thresholds: FX5 pool ±5%, signal gen ±5%, VTS ±5%, active-trade ±1-2/day OR ±15% 7d.
- `2af50871` — **B79.0n.UD 06:00 UTC cron self-fire review fires 2026-05-22T13:00:00Z.** Confirm run_id=2 exists with `triggered_by='cron_daily'`.

---

## NEXT IMMEDIATE STEP

**B79.0n.MCE** — sub-batch 4 of 18 in umbrella v4. Scope is "Market Context Engine asset-class plumbing." Per umbrella rev 4 §1.5 B72 prior-arc context, MCE **shrinks materially** because B72 already wired `regime_classifier` + `regime_age` + `dbs_calculation` + `cost_model`. Remaining work for MCE sub-batch: per-class seed rows where xStock needs different values + direct asset-class branching for non-lever code (friction estimates, indicator computations VWAP/ATR/EMA/BB/RSI, macro modifier per-class signal — RUNNING_ISSUES #123 deferred). Each scope file from here forward MUST include B72 prior-arc context section per umbrella rev 4 standing rule.

**Pending soak verifications tomorrow (2026-05-22):**
1. 11:55Z alert `d4b2e590` — 24h crypto regression comparison vs pre-deploy 24h baseline (covers UD + STORAGE)
2. 13:00Z alert `2af50871` — psql `discovery_runs ORDER BY run_id DESC LIMIT 3` to verify cron_daily fired for UD
3. Also check Supabase IO consumption at 489-symbol scale to confirm Small tier holds

### Recent commits (STORAGE chain)
- `ab3153ce5` — umbrella rev 4 (B72 prior-arc context per sub-batch; deploy commit)
- `f6f823c60` — B72 stale-reference corrections (BATCH_CATALOG row 171 + 4 POST_AUDIT_ROADMAP refs)
- `512429ab9` — Step 4 BLOCKER fix + 3 (d)→(a) reclassifications
- `c8c7143e4` — RTB resolveAssetClass-only fix
- `c8cb22e1c` — Step 3 implementation (24 files, 1153/-56 LOC)

### RUNNING_ISSUES touched at Step 10/11 close
- **NEW** — module_constants sqe_config per-class deferred to SCORING with explicit promote-to-active triggers per Langston Q-S2-4
- **NEW** — RtbSignal DB row lacks asset_class column (RTB batch #11 scope)
- **NEW** — xStock screener_filters rows placeholder-cloned from crypto (Phase 19 calibration)
- **NEW** — vts-runner/vts-service `assetClass?:` optional params flagged for STRATEGY #5
- **NEW** — tsconfig `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` flagged for future TS-hardening sweep

### Permissions reminder
`.claude/settings.local.json` `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. CLAUDE.md §5 #16 — load-bearing line; do NOT delete.

---

## REQUIRED PRE-READS (FIRST 3 MINUTES OF NEXT SESSION)

1. `DawnTraderV3/CLAUDE.md` (esp. §1 + §3.3 + §5 #15-16 + §6.5.0.a + §10.5)
2. This file
3. `Claude Comms and Packages/Batch Completion/B79_0n_STORAGE_COMPLETION_REPORT.md` (just-closed; see §2 B72 prior-arc context + §10 onboarding learnings)
4. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (rev 4 — §1.5 B72-prior-arc per sub-batch is mandatory reading before drafting MCE scope)
5. `1-system-manual/RUNNING_ISSUES.md` 4 new STORAGE entries (sqe_config per-class deferred + RtbSignal schema gap + placeholder-cloned thresholds + vts-runner optional assetClass)
6. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 4.9 (NEW — REQUIRED-assetClass storage API + cache key extension + getCanonicalScreenerConfig helper template)
