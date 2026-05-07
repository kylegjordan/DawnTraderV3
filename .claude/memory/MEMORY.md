# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — comms; §2 Step 10.b — Langston MEMORY sync mandatory; §6.5 Step 3 — Telegram verbatim relay mandatory).
2. Read this file.
3. Read `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — **active living plan for B79–B81.**
4. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for current phase.
5. Receive messages from Kyle in this Claude Desktop conversation. No Telegram polling on Kyle's behalf.
6. For Kyle ↔ Langston traffic visibility, tail `/var/log/cc-bridge-inbox.jsonl` on Hetzner.
7. Acknowledge readiness in one line. Don't dump context.

**Do NOT:** confabulate; skip SIM in pre-audit; wait on legacy-TS-baseline CI before deploying — Test+Build+Docker pass is enough; forget the no-touch fence on crypto_spot.

---

## CURRENT STATE — 2026-05-07 (post-B78.2 close)

- **Branch:** `migration/aws-supabase`
- **Most recent HEAD:** `5ec57cbd3` (B78.2 ping hotfix). Previous: `5c3ce00b3` (B78.2 initial), `5348fd005` (B78.1 governance close).
- **Live:** B70 + B72 + B75 + B76 + B77 + B78 + B78.1 + **B78.2 (Kraken WS v1→v2 ping/subscribe format fix; RUNNING_ISSUES #76 RESOLVED).**
- **Watchdog:** `/usr/local/bin/langston-call` on Hetzner. Validated under load: 3 round-trips for B78.2 with 25s/35s/2m45s response times. **Tuning learning (B79):** default 60s first-byte timeout TOO TIGHT for substantive scope reviews (>200 lines + multi-file reads). Use `--first-byte-timeout 180` for substantive batches; default OK for surgical fixes.
- **Sequencing reset:** B79 (xstock_spot) is next.
- **DB-only UPDATEs (no commits):** all unchanged. No-touch fence holds.

### B78 quick reference (just shipped)

- **Created:** `server/asset_classes/{crypto_spot,crypto_perp,xstock_spot}/{pattern-pool-filters,regime-thresholds,friction,index}.ts` + `server/exchanges/kraken/`. crypto_spot live; perp + xstock are placeholders for B79/B80.
- **Moved:** `kraken{,-pair-metadata-service,-data-documenter}.ts` to `exchanges/kraken/`; `pattern-filter-profile.ts` to `asset_classes/crypto_spot/pattern-pool-filters.ts`.
- **Extracted:** 14 regime-classifier branch-condition constants to `crypto_spot/regime-thresholds.ts` (leaf, no imports). Threshold-vs-formula trap respected per pre-audit §2.
- **Aggregator filter:** `drift-dashboard-aggregator.ts` L1054 `AND asset_class='crypto_spot'`. Locks calibration cohort.
- **Deferred:** ws-adapter move (cycle with live-pricing-adapter); friction extraction (cost-model is exchange-keyed; defer to B79/B80).
- **Madge:** 47 → 47 cycles. HARD GATE green.
- **CI:** Build+Docker green; Test 59/995/5/1059 (identical to baseline). PM2 #180.
- **Langston:** 4 review rounds (rev 4 APPROVED), Step-4 APPROVED, Step-8 APPROVED to close.
- **Forward-watch:** RUNNING_ISSUES #74 — verify crypto_spot ablation cadence ~9-10/factor/hr at +30min and +24h. Revert via `git revert 57220ab4b e814461d6` if drop.

---

## SEQUENCING — B78–B81 stretch (8 days, until 2026-05-15)

| Batch | Status | Description |
|---|---|---|
| **B78** | **SHIPPED 2026-05-07** | Modularization scaffolding. Critical path. |
| **B79** | NEXT | xstock_spot (Kraken XStocks): VTS + active-path wire-in (dormant). 24/5 weekend-pause. 3-layer threshold derivation. Days 4-5. |
| **B80** | After B79 | crypto_perp (Kraken Futures): VTS + active-path wire-in. Funding-rate per-pair extension to macro modifier. Days 5-6. |
| **B81** | After B80 | RTB ranking parity (`expectedNetReturnR` primitive, pool-relative normalization) + SQE asset-class thresholds. Days 6-7. Removes B78 re-export shims (RUNNING_ISSUES #73). |

**Active-trading wire-in IS in scope** for B79-B81 (codepath end-to-end). Live-trading testing of new asset classes is Phase 19.

**Hard fence:** no-touch on crypto_spot through 2026-05-15. Step-0 pre-flight + post-deploy SQL on every batch (column is `evaluated_at`, not `captured_at`):

```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```

If cadence drops post-deploy → halt and revert.

---

## OPERATIONAL FACTS (verified 2026-05-07)

- **Kraken XStocks Pro** = equity exchange. Tokenized 1:1 backed equities. **Fractional buying $1 minimum** → same `$1000 base → ~$150/trade` sizing as crypto. **24/5 trading** (closed weekends — VTS needs weekend-pause gate). Solana-settled (affects Phase 19 active-path custody, NOT VTS).
- **Kraken Futures** = perp exchange. REST endpoint `https://futures.kraken.com/api/charts/v1/trade/<sym>/1m` (B74). 24/7 trading. Funding rate is per-pair signal (NEW input to crypto_perp's macro modifier in B80).
- Both feeds **already scanning + archiving** in production (B69 + B74).
- **B74 file note:** Kraken Futures work lives at `server/services/passive-archive/equity-perp-archiver.ts` — not a `kraken-futures-*` file. Plan/scope misattribution corrected in B78 governance.

---

## LANGSTON RUNTIME + COMMS (since 2026-05-06)

Two systemd bridges on Hetzner `204.168.141.77`. Unified inbox log `/var/log/cc-bridge-inbox.jsonl`.

**Send protocol:**
- Kyle ↔ main CC: this Claude Desktop conversation only.
- Kyle → Langston: DM `@LangstonDTBot` or post in topic 21.
- main CC → Kyle: `cc-comms-bridge send --thread-id 21`.
- main CC → Langston: 3 STEPS. (a) `cc-comms-bridge send` for visibility, (b) SSH-deliver via watchdog wrapper `sudo -u langston /usr/local/bin/langston-call /tmp/prompt.txt /tmp/reply.txt` — auto-retries on hang (60s first-byte / 30s idle / 5 max attempts; logs `/var/log/langston-call.log`). Defaults to fresh UUID per attempt. (c) **MANDATORY** post Langston's verbatim stdout reply to Telegram via `@LangstonDTBot`'s sendMessage prefixed `**LANGSTON SPEAKING:**`. Pattern in CLAUDE.md §6.5 Step 3.
- Receiving: tail unified inbox log.

**Hetzner GDrive FUSE mount is BROKEN for recursive ops.** Stage diffs/files at `/tmp/` via scp. Tell Langston explicitly NOT to use `ls -R` or `git status`.

**Langston MEMORY sync per batch — MANDATORY** (CLAUDE.md §2 Step 10.b). Mirror this MEMORY to `/home/langston/MEMORY.md` via SSH+scp. Same 200-line cap.

**OAuth token:** `/etc/langston/oauth.env`, valid 1 year (issued 2026-05-06).

---

## RECURRING ANALYSIS RECIPE (trigger: "**run the calibration review**")

1. `GET /api/analytics/factor-calibration?window=rolling_7d` — 10-row factor table. Post-B76: aggregator filters chain-final cohort. **Post-B78: aggregator scoped to `asset_class='crypto_spot'`.**
2. `GET /api/analytics/exit-strategy-ablation?window=rolling_7d` — 12-variant table sorted by Sharpe.
3. **Verify recent fixes:** b68_5 lift drift; trailing-after-target DISABLED; liquidity_trap exclusion; floor 0.20; B72 sync-read API healthy; B76 marker present.
4. Plain-language interpretation + recommendations for B67.5 wiring (~2026-05-15).

---

## Calibration windows (active, LOCKED through 2026-05-15)

B67.4 cheap-tier · B68.2 volume regime · B68.3 pair correlation · B68.1 multi-TF — gates: tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket. **Pre-B76 reference lifts (24-48h ±1pp anchor):** b67_4 +2.95pp, b68_1 +5.71pp, b68_2 +4.13pp, b68_3 +4.13pp, b68_4 +2.94pp, b68_5 −1.78pp. If any flip post-B76/B78 → revert.

---

## Recent batch history

| Batch | Date | Note |
|---|---|---|
| B70 + B72 | 2026-05-04→06 | Unified archive + 18/18 strategies DB-tunable |
| B75 | 2026-05-06 | Hot/warm/cold tiered storage |
| B76 | 2026-05-06 | Chain-final calibration framework. RUNNING_ISSUES #54 RESOLVED |
| B77 | 2026-05-07 | `isBreakEvenTriggered` no-op fix. RUNNING_ISSUES #71 RESOLVED |
| **B78** | **2026-05-07** | **Modularization scaffold. Asset_class + exchange extraction. Pure refactor.** |

---

## Open RUNNING_ISSUES

- OPEN: #39 (CI TS legacy), #43/#49/#50/#53 (4 calibration windows), #46 (passive archive index), #55 (B69.x/B73.3 verification), **#73 (B78 shim cleanup B81), #74 (B78 24-48h cadence forward-watch)**
- DEFERRED: #12e, #40, #44, #45, #52
- RESOLVED 2026-05-06/07: #54 (B76), #55, #56–#69, #70/#71/#72

---

## Next session pickup priority (POST-COMPACT 2026-05-07 evening)

**B79 RE-SCOPED to canonical asset-class onboarding lab per Kyle directive 2026-05-07 evening. Phase 24 NEW.**

1. **Pre-implementation audit (PIA) per CLAUDE.md §2 Step 2** — gate before B79 implementation kickoff. Read these in order:
   - `Claude Comms and Packages/Scope Files/BATCH_79_SCOPE.md` **rev 6** (~900 lines) — CONSENSUS reached with Langston (rev 3 deep review + rev 5 pushback iteration; no Kyle escalation needed).
   - `Claude Comms and Packages/Scope Files/BATCH_79_PLAIN_LANGUAGE_SUMMARY.md` — Kyle's plain-language summary.
   - `1-system-manual/SYSTEM_IMPACT_MAP.md` for all components in PIA list (rev 4 §10):
     market-scanner.ts, adaptive-scan-manager.ts, pair-failure-tracker.ts, adaptive-ratio-manager.ts, directional-bias.ts, market-regime.ts, market-context-engine.ts, signal-quality-evaluator, cost-model.ts, paper-execution-engine.ts, trailing-exit-controller.ts, live-pricing-adapter (scope-clarification only), equity-spot-archiver.ts, drift-dashboard-aggregator.ts, portfolio-risk-manager.ts.
   - Schemas to audit: screener_filters (col add), module_constants, paper_sim_trades, signal_eval_archive, regime_factor_alternates, paper_sim_open_positions.
   - **TELEMETRY PARTITIONING AUDIT (Langston rev 3 PIA blocker):** PairFailureTracker / AdaptiveRatioManager / predictiveConfidence rolling-window — verify all partition by asset_class. Any non-partitioning component is a B79 hard blocker.
2. Write PIA report at `Claude Comms and Packages/Scope Files/BATCH_79_PRE_AUDIT.md`. Send to Langston via watchdog `--first-byte-timeout 240` for deep review.
3. **Build NEW Tier-2 governance doc:** `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — template per scope §6.2. Section H.1 worked example = xstock_spot (B79). Reusable for B80 + future asset classes.
4. **Implement B79 single-batch per Langston rev 3 §F.** Sub-batches B79.1/.2/.3 trigger ONLY on shadow-mode evidence, not pre-scheduled.
5. **Confirm B78 + B78.2 forward-watch (RUNNING_ISSUES #74):** at +24h from B78.2 deploy at 14:18 UTC 2026-05-07 — re-run no-touch fence SQL + grep for `Method(s) not found` recurrence. If clean → close #74.

**Phase 24 = B79 + sub-batches.** Phase 25 = B80 + sub-batches. Out-of-sequence with 15c (consistent with roadmap pattern).

**Subagent already implemented (in working tree, NOT committed):** initial code from B79 rev 2 scope. **Subagent work needs reconciliation against rev 6 scope BEFORE commit** — rev 6 added: pattern-pool path now ENABLED with 3 file-based strategies (was scope-disabled in rev 2), ORB strategy file gated on Q-D, dedicated scanner architecture, scripted sector mapping, etc.

**Q-D AAPLx-vs-AAPL probe is its own pre-implementation stage** — must run BEFORE implementation push. Methodology in scope §-2 + §3 (yfinance 1m underlying, 4-window correlation, 3-tier decision tree).

**Post-PIA implementation key items (not yet done):**
- screener_filters schema migration (asset_class + tunable_status cols) + xstock_spot row (NO max_price cap per Kyle)
- Dedicated equity scanner instance (Langston rev 3 §C)
- Telemetry partitioning fixes (per audit findings)
- Stage-by-stage threshold seeds (multi_tf_agreement, correlation_matrix, macro_modifier=1.0; rest pending_layer_3-tagged)
- Symbol-normalizer utility (server/utils/symbol-normalize.ts)
- Asset-class-aware data-freshness gate
- Forward-watch dashboard requirement
- Failure mode taxonomy (LULD halts, circuit breakers, dividends, splits, earnings)
- TEC stop-freeze for market-closed periods
- Sector classification per xStock for portfolio-cluster

--- Run pre-flight no-touch fence. Layer 1 domain-knowledge thresholds (~1-2h), Layer 2 cross-asset shadow-classify (~2-3h), Layer 3 shadow-mode VTS (48-72h, ongoing during B80/B81). Weekend-pause logic gate. Strategy detect audit per asset class.
3. Draft `BATCH_79_SCOPE.md` per plan doc §6.
4. Send to Langston combined Step-1+2.
5. Per Langston review → push → CI → deploy → verify → governance (incl. plan-doc §9 threshold table population + SIM update + Langston MEMORY sync).

---

## Kyle Operating Directives (active)

- Don't pause to ask permission. Iterate with Langston through 11 steps.
- Visual UI verification via Claude-in-Chrome on UI-touching batches.
- Deploy after Test+Build+Docker pass — don't wait on legacy TS baseline.
- **NO WORKAROUNDS.** Fix things properly.
- **No fallbacks for DB-governed settings.**
- Sensitive credentials → staging `.env` via SSH only.
- Iterate with Langston to consensus; escalate to Kyle only on deadlock / scope expansion / new directive.
- **Kyle messages me here in Claude Desktop.** Telegram is for Kyle ↔ Langston + CC outbound visibility.
- **No-touch fence on crypto_spot through 2026-05-15.**

---

## Session Behavior Invariants

- **Telegram verbatim relay of Langston responses MANDATORY** (CLAUDE.md §6.5 Step 3).
- **Hetzner GDrive FUSE broken for recursive ops** — stage diffs at /tmp/ via scp.
- VTS position sizing $1000 base → ~$150/trade. Same for tokenized equities.
- GDrive npm install fails EBADF — CI is verification gate.
- CoinGecko Demo API key in staging `.env` (don't commit).
- **B78 lesson:** pre-flight grep needs broad pattern (`['"](\\.\\.?/)+kraken(?:\\.|$|['"])` not narrow `services/kraken`); same-name strings drift across scope-doc sections invisibly across revisions — search-replace ALL instances after each.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md` (§6 + §8 + §2 Step 10.b + §6.5 Step 3)
2. This file
3. `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md`
4. `1-system-manual/POST_AUDIT_ROADMAP.md`
5. `1-system-manual/CURRENT_SETTINGS_REGISTRY.md`
6. `Claude Comms and Packages/Batch Completion/BATCH_78_COMPLETION_REPORT.md` (most recent closure)
7. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
