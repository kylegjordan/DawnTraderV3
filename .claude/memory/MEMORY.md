# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + two-paragraph default; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt fix + #19 CI per-batch confirmation; §6.5.0.a embedded-diff + no-gdrive dispatch pattern; §10.5 alerts; §7.1 mirror).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston verbatim relay + visibility. Summaries TO KYLE go in THIS session; Langston-verbatim relays to Telegram STILL mandatory per §6.5 step 3.
5. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-23 PM — B-NEW-43 FULLY CLOSED. Next batch: B79.0n.STRATEGY = umbrella sub-batch 5 of 18.)

### B-NEW-43 (CI Recovery) — 🟢 FULLY CLOSED 2026-05-23

CI all-4-green at head commit. All 4 phases shipped + governance landed + RUNNING_ISSUES #135 staging wiring + end-to-end verified.

**Highlights:**
- Phase 1: 696 → 488 tsc errors (−208 / 30%), 18 chunks, baseline-comparison gate locks the win.
- Phase 2: 103 → 0 failing tests, 14 chunks, CI Postgres + db:migrate flow + initial-schema + initial-seed-data migrations + MANIFEST.txt skip-marker mechanism.
- Phase 3: CLAUDE.md §5 #19 — per-batch CI confirmation rule codified.
- Phase 4: system-alerts active-push (RUNNING_ISSUES #135 RESOLVED). Token scp'd Helsinki→staging (Kyle-authorized 2026-05-23). End-to-end verified — 3 test alerts delivered via Markdown-fail→plain-text-retry path.
- MCE 24h soak alert `616dfcf3` acked (CACHE_REFRESH is one-shot-per-restart by design; 3 firings in 32h all healthy + zero fail-hard throws).
- Full report: `Claude Comms and Packages/Batch Completion/B_NEW_43_COMPLETION_REPORT.md` + `B_NEW_43_PHASE_1_COMPLETION_REPORT.md`. BATCH_CATALOG + PHASE_HISTORY updated.

**Anti-graveyard:** 1 sanctioned `as unknown as` (chunk-4 req.mode boundary); zero new `as any`/`@ts-expect-error`/`@ts-ignore`/`!`.

**Latent bugs surfaced:** `BUG-2026-05-23-A` (paper-portfolio-manager userId-as-mode-key; pre-fix metrics SUSPECT) + `BUG-2026-05-23-B` (dead AI-Opps routes). Both in CHANGES_AND_FIXES.

### 🟢 NEXT BATCH: B79.0n.STRATEGY (umbrella sub-batch 5 of 18)

**Phase 24 (multi-asset VTS expansion, xStocks active-trading wire-in).** Umbrella scope at `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md`. Sub-batches 1-4 SHIPPED (HYGIENE, UNIVERSE-DISCOVERY, STORAGE, MCE); #5 STRATEGY is what we start.

**Scope coverage (from umbrella rev 4 §Tier 1 table):**
- Strategy engine + every quant detector method
- `_SE_KEY` resolver specificity
- Hybrid Integration Service (quant+pattern ensemble)
- Strategy Sync per-asset-class `strategy_settings` rows
- strategy-mapper.ts (Directive 11.4H.6G Canonical Regime-Strategy Enforcement) — per Langston umbrella-review item 7

**Dependencies:** STORAGE only (sub-batch 3, SHIPPED 2026-05-21).

**Why this sub-batch:** B72 already wired the API-side discipline (sync-read via `getCachedNumberRequired`, hard-fail on missing row) for `strategy.*` modules; STRATEGY's work is the per-class seed rows + REQUIRED-AssetClass type enforcement at strategy detect call sites + Hybrid Integration Service plumbing. Umbrella v4 §1.5 notes STRATEGY shrinks materially vs un-B72'd estimate because the API-side reads already exist.

**Scope file `B79_0n_STRATEGY_SCOPE.md` DOES NOT EXIST YET** — Step 1 of this batch is to WRITE it (per standard 11-step workflow per CLAUDE.md §2).

### Workflow to start B79.0n.STRATEGY (per CLAUDE.md §2):

1. **Step 1 Scope** — draft `Claude Comms and Packages/Scope Files/B79_0n_STRATEGY_SCOPE.md` covering the items above. Dispatch to Langston for ACK.
2. **Step 2 Pre-audit** — MANDATORY consult `1-system-manual/SYSTEM_IMPACT_MAP.md` for every component affected. Trace upstream/downstream/shared-state/background-execution/blast-radius. Document in `B79_0n_STRATEGY_PRE_AUDIT.md`. Dispatch to Langston.
3. **Steps 3-11** — implementation → Langston code review → push → CI green (per §5 #19 must be green before batch close) → staging deploy → first-pass verify → Langston second-pass verify → iterate → governance updates (BATCH_CATALOG, PHASE_HISTORY, SIM if components added, SYSTEM_MANUAL if architecture changes, CHANGES_AND_FIXES, RUNNING_ISSUES, MEMORY both, Langston MEMORY) → completion report.

### Active alerts (§10.5)
- 0 active-unacked.
- `c82c256c` SCHEDULED 2026-05-27 — B-NEW-35 7-day dedup soak. No action until trigger.
- `b83b1e4b` SCHEDULED 2026-05-31 — B-NEW-40 14-day soak. No action until trigger.

### Open follow-ups (not blocking next batch start)
- **Staging coordination SQL** must run on staging BEFORE next staging `db:migrate`: `psql "$DATABASE_URL" -f 1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql`. Without it, next staging db:migrate would conflict on initial-schema + initial-seed-data. (Operator action.)
- **Crypto-trade-rate-spike investigation hook (Kyle 2026-05-22):** check `module_constants` / `screener_filters` / regime-classifier rows scoped to `crypto_spot` for any unintended drift from xStocks onboarding batches. Could be picked up as a brief sidebar during STRATEGY pre-audit since STRATEGY touches `strategy_settings` rows.
- **MCE alert-body wording polish (Tier-3):** the next soak-verification alert template should replace "keeps appearing on refresh cycles" with "fires once per process restart; expect N entries for N restarts in window."
- **Phase 19 follow-ups registered to RUNNING_ISSUES #137** (b73 4 variant rewrites, b68-5 momentum-gate tests, b79-0d ORB rewrites, b-new-36 audit-row mock, schema-drift sites, etc.).
- **Phase 16 register** at RUNNING_ISSUES #136 entries (a)-(h).

### Recent commits (origin HEAD around `446285bb4` post-B-NEW-43)
- `446285bb4` — B-NEW-43 Phase 4 close: #135 RESOLVED + MEMORY sync
- `615311561` — Phase 4 hotfix: telegramSend recursion bug
- `c04279f6a` — B-NEW-43 BATCH CLOSE governance (completion report + BATCH_CATALOG + PHASE_HISTORY)
- `3ba5e6319` — Phase 4 (system-alerts active-push code)
- `cc4e74339` — Phase 3 (CLAUDE.md §5 #19)
- `b5fb9fe` — Phase 2 chunk 14 (CI all-4-green)
- `5191675a` — Phase 1 close governance
- `ccf58e6` — Phase 1 chunk 18

**Mirror workflow:** code on `C:/dev/DawnTraderV3` (inline `git -c user.name=kylegjordan -c user.email=kylegjordan@gmail.com` for commits). GDrive clone is governance-docs + `git pull`-only for code per CLAUDE.md §7.1.

### Parked items
- Roadmap sequencing changes (2026-05-21): Phase 25 (Adaptive Market Response, moved from §18.9 by Kyle 2026-05-23) + VTS partition + daily loss-budget — in POST_AUDIT_ROADMAP.
- Phase 19 runs BEFORE Phase 16 (Kyle approved 2026-05-23) — in POST_AUDIT_ROADMAP.
- Ops pending: xstock_spot BE-stop flip true→false.
- **NEW 2026-05-23:** Phase 19 candidate from Langston chunk-3 design ACK: extend `_migrations` ledger with `expected_order` integer matching MANIFEST position. Not for B-NEW-43; POST_AUDIT_ROADMAP candidate.

### Permissions reminder
`.claude/settings.local.json` `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. CLAUDE.md §5 #16 — load-bearing; do NOT delete.

---

## REQUIRED PRE-READS (next session)
1. `DawnTraderV3/CLAUDE.md` (§1 + §3.3 + §5 #15-19 + §6.5.0.a + §10.5 + §7.1 mirror)
2. This file
3. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` — Tier 1 table row 5 = STRATEGY scope summary
4. `Claude Comms and Packages/Batch Completion/B_NEW_43_COMPLETION_REPORT.md` — reference for closed batch
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` — pre-audit reference for strategy-engine + every quant detector + strategy-mapper + Hybrid Integration Service + Strategy Sync
