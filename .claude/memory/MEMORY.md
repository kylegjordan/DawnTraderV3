# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — comms; §2 Step 10.b — Langston MEMORY sync mandatory; §6.5 Step 3 — Telegram verbatim relay mandatory).
2. Read this file.
3. Read `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — **this is the active living plan for B78-B81.** Update before AND after every batch in this stretch.
4. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for current phase.
5. Receive messages from Kyle in this Claude Desktop conversation. No Telegram polling on Kyle's behalf.
6. For Kyle ↔ Langston traffic visibility, tail `/var/log/cc-bridge-inbox.jsonl` on Hetzner.
7. Acknowledge readiness in one line. Don't dump context.

**Do NOT:** confabulate; skip SIM in pre-audit; wait on legacy-TS-baseline CI before deploying — Test+Build+Docker pass is enough; forget the no-touch fence on crypto_spot during B78-B81 stretch.

---

## CURRENT STATE — 2026-05-07 (post-B77 close + plan pivot)

- **Branch:** `migration/aws-supabase`
- **Most recent HEAD:** `98e9024b9` (plan-doc commit). Earlier `4c340f9a4` (B76/B77 governance follow-up), `ed972a603` (B77 closure), `65c17bfd3` (B76 closure).
- **Live:** B70 + B72 + B75 + B76 (chain-final calibration framework) + B77 (`isBreakEvenTriggered` no-op fix).
- **DB-only UPDATEs (no commits):** `b67_5_post_composition_floor=0.20`, `b68_5_path_b_momentum_min=0.001`, `moonbag_qualifying_strategies=[]`, `break_even_enabled=false` (variant K). All FROZEN through 2026-05-15 per no-touch fence.
- **B76 chain-final marker live:** `realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'` on every new ablation row. Verified: b67_2 shift = -0.01555 across 128 samples (was 0.0000 by construction pre-B76).

---

## THE PIVOT (2026-05-07 evening Kyle directive)

**Skip Phase 16 (legacy cleanup). Use the 8-day observational window (until 2026-05-15) for Modularization + Multi-Asset VTS expansion.**

**Sequencing — 4 batches in the next 8 days:**
1. **B78** — Modularization phase. 8-module extraction across `(exchange, asset_class, filter, strategy, regime)`. Pure file/import refactor. Adds `AND asset_class='crypto_spot'` filter to drift-dashboard-aggregator's `computeFactorCalibration` to lock crypto_spot calibration window. Days 1-3. **Critical path.**
2. **B79** — Xstock_spot (Kraken XStocks Pro) into VTS + active-path wire-in (dormant). 24/5 weekend pause. Threshold derivation 3-layer (domain → cross-asset shadow-classify → 48-72h shadow-mode VTS). Days 4-5.
3. **B80** — Crypto_perp (Kraken Futures) into VTS + active-path wire-in (dormant). Funding-rate per-pair extension to macro modifier. Days 5-6.
4. **B81** — RTB ranking parity (`expectedNetReturnR` primitive, pool-relative normalization) + SQE asset-class threshold rows. Days 6-7.

**Active-trading wire-in IS in scope** for B79-B81 (codepath end-to-end ready). **Live-trading testing of new asset classes is NOT** — that's Phase 19. Phase 16 stays parked. Phase 19 picks up component-by-component after Phase 16.

**Hard fence (§2 of plan doc):** no-touch list on crypto_spot through 2026-05-15. Step-0 pre-flight + post-deploy SQL on every batch:

```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND captured_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```

If cadence drops post-deploy → halt and revert.

**Living plan doc:** `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md`. Update before each batch (sanity-check) and after (record what landed, threshold table population in §9, update log row in §12). Now Tier 2 mandatory per CLAUDE.md §3.

---

## OPERATIONAL FACTS (verified 2026-05-07)

- **Kraken XStocks Pro** = equity exchange. Tokenized 1:1 backed equities. **Fractional buying $1 minimum** → same `$1000 base → ~$150/trade` sizing as crypto. **24/5 trading** (closed weekends — VTS needs weekend-pause gate). Solana-settled (affects Phase 19 active-path custody, NOT VTS). Geographically clear from UAE.
- **Kraken Futures** = perp exchange (B74 KNOWN_NONEXISTENT_NAMES log: REST endpoint `https://futures.kraken.com/api/charts/v1/trade/<sym>/1m`). 24/7 trading. Funding rate is per-pair signal (NEW input to crypto_perp's macro modifier in B80).
- Both feeds **already scanning + archiving** in production (B69 + B74 work).

---

## LANGSTON RUNTIME + COMMS (since 2026-05-06)

Two systemd bridges on Hetzner `204.168.141.77`: `langston-bridge.service` + `cc-comms-bridge.service`. Unified inbox log `/var/log/cc-bridge-inbox.jsonl`.

**Send protocol:**
- Kyle ↔ main CC: this Claude Desktop conversation only.
- Kyle → Langston: DM `@LangstonDTBot` or post in topic 21.
- main CC → Kyle (visibility): `ssh root@204.168.141.77 'cc-comms-bridge send --thread-id 21 --message "..."'`
- main CC → Langston: TWO STEPS. (a) `cc-comms-bridge send` for visibility, (b) `ssh ... claude -p --session-id <FRESH_UUID> --model claude-opus-4-7 "..."` for delivery (Telegram bot-to-bot is BLOCKED). **(c) MANDATORY (Kyle directive 2026-05-07): post Langston's verbatim stdout reply to Telegram via `@LangstonDTBot`'s sendMessage** prefixed with `**LANGSTON SPEAKING:**`. CC summary (separately) supplements but does not replace verbatim relay. Pattern documented in CLAUDE.md §6.5 Step 3.
- Receiving: tail unified inbox log.

**Hetzner GDrive FUSE mount is BROKEN for recursive ops.** When delivering review requests to Langston referencing repo files, **stage diffs/files at `/tmp/` via scp first** and tell him explicitly NOT to touch `/mnt/gdrive/` or run `git`. His Read tool on absolute `/tmp/` paths works.

**Langston MEMORY sync per batch — MANDATORY (Kyle directive 2026-05-07):** Step 10.b in CLAUDE.md §2. Mirror CC's MEMORY.md to `/home/langston/MEMORY.md` via SSH+scp at every batch close. Same 200-line cap. His MEMORY auto-loads on every claude -p invocation.

**OAuth token:** `/etc/langston/oauth.env`, valid 1 year (issued 2026-05-06).

---

## RECURRING ANALYSIS RECIPE (trigger: "**run the calibration review**")

1. `GET /api/analytics/factor-calibration?window=rolling_7d` — 10-row factor table with predictive lift. Post-B76: aggregator filters chain-final cohort for b67_1_*/b67_2_*. Post-B78: aggregator scoped to `asset_class='crypto_spot'`.
2. `GET /api/analytics/exit-strategy-ablation?window=rolling_7d` — 12-variant table sorted by Sharpe.
3. **Verify recent fixes:** b68_5 lift drift; trailing-after-target DISABLED; liquidity_trap exclusion; floor 0.20; B72 sync-read API healthy; **B76 marker** present.
4. Plain-language interpretation + recommendations for B67.5 wiring (~2026-05-15).

---

## Calibration windows (active, LOCKED through 2026-05-15)

B67.4 cheap-tier · B68.2 volume regime · B68.3 pair correlation · B68.1 multi-TF — gates: tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket. **Pre-B76 reference lifts (24-48h ±1pp anchor):** b67_4 +2.95pp, b68_1 +5.71pp, b68_2 +4.13pp, b68_3 +4.13pp, b68_4 +2.94pp, b68_5 −1.78pp. If any flip post-B76 → revert via `git revert c8b8709ed 235237ffd` (hotfix first per Langston Step-8 correction).

---

## Recent batch history

| Batch | Date | Note |
|---|---|---|
| B70 + B72 | 2026-05-04→06 | Unified archive + 18/18 strategies DB-tunable |
| **B75** | 2026-05-06 | Hot/warm/cold tiered storage. DatabaseMonitor alarm CRITICAL→NORMAL |
| **B76** | 2026-05-06 | Chain-final calibration framework. RUNNING_ISSUES #54 RESOLVED |
| **B77** | 2026-05-07 | `isBreakEvenTriggered` no-op fix. RUNNING_ISSUES #71 RESOLVED |
| _B78-B81 in progress per plan doc_ | 2026-05-07→15 | Modularization + Multi-Asset VTS expansion |

---

## Open RUNNING_ISSUES

- OPEN: #39 (CI TS legacy → Phase 16), #43/#49/#50/#53 (4 calibration windows), #46 (passive archive index)
- DEFERRED: #12e, #40, #44, #45, #52
- RESOLVED 2026-05-06/07: #54 (B76), #55, #56–#69 (B70+B75 + hotfixes), #70/#71/#72 (B75 close + B77)

---

## Next session pickup priority (post-compact)

1. **B78 — Modularization phase** (per plan doc §5). Read plan doc first.
2. Run no-touch fence pre-flight SQL (§3 of plan doc) BEFORE first commit.
3. Read `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` §V to confirm 8-module target hasn't drifted.
4. Draft `BATCH_78_SCOPE.md` per plan doc §5.
5. Send to Langston combined Step-1+2 (with import-graph cycle ask).
6. Per Langston review → push → CI → deploy → verify (no-touch fence post-deploy) → governance (incl. plan-doc update + Langston MEMORY sync per CLAUDE.md §2 Step 10.b).

---

## Kyle Operating Directives (active)

- Don't pause to ask permission. Iterate with Langston through 11 steps.
- Visual UI verification via Claude-in-Chrome on UI-touching batches.
- Deploy after Test+Build+Docker pass — don't wait on legacy TS baseline.
- **NO WORKAROUNDS.** Fix things properly.
- **No fallbacks for DB-governed settings.** Cold-start warmup paths are NOT fallbacks.
- Sensitive credentials → staging `.env` via SSH only.
- **Post-mass-migration discipline:** grep for removed const + tsc check on touched files (or trust CI).
- Iterate with Langston to consensus; escalate to Kyle only on deadlock / scope expansion / new directive.
- **Kyle messages me here in Claude Desktop.** Telegram is for Kyle ↔ Langston + CC outbound visibility.
- **No-touch fence on crypto_spot through 2026-05-15.** No threshold/factor-chain/regime-classifier-math changes for crypto_spot.

---

## Session Behavior Invariants

- **New comms:** see CLAUDE.md §6.4–6.7. Telegram verbatim relay of Langston responses MANDATORY.
- **Hetzner GDrive FUSE broken for recursive ops** — stage diffs at /tmp/ via scp.
- VTS position sizing $1000 base → ~$150/trade. Same for tokenized equities.
- GDrive npm install fails EBADF — CI is verification gate.
- CoinGecko Demo API key in staging `.env` (don't commit).

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md` (especially §6 + §8 + §2 Step 10.b + §6.5 Step 3)
2. This file
3. `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — active living plan
4. `1-system-manual/POST_AUDIT_ROADMAP.md`
5. `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` — live DB-tunable settings
6. `Claude Comms and Packages/Batch Completion/BATCH_77_COMPLETION_REPORT.md` — most recent closure
7. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
