# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §1 plain-language rule; §6 + §8 Langston comms; §6.5 Step 3 verbatim Telegram relay).
2. Read this file.
3. Read `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` — **THE ACTIVE WORK PLAN.** Locked 2026-05-15; first code-touching batch is Phase 0 corporate-actions audit.
4. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for the broader context.
5. Kyle messages me here in Claude Desktop. For Kyle↔Langston visibility, tail `/var/log/cc-bridge-inbox.jsonl` on Hetzner.
6. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; dump trial-and-error history into workflow doc (standing rules only); use technical jargon in Kyle-facing summaries (plain language only).

---

## CURRENT STATE — 2026-05-15 (xStock Calibration Plan LOCKED + sequencing update, PM2 #282)

**SEQUENCING ORDER (Kyle directive 2026-05-15):**
1. **Crypto factor calibration finalization + B67.5 ship FIRST** (3-5 days). May 15 was the hard fence on crypto's calibration cohort per MULTI_ASSET_VTS_EXPANSION_PLAN.md; act on accumulated lever-ablation evidence before opening new asset-class work.
2. **xStock Calibration Plan Phase 0 corp-actions audit SECOND**, after B67.5 ships clean.

**xStock Calibration Plan v2 LOCKED 2026-05-15.** Canonical living plan now lives at `1-system-manual/XSTOCK_CALIBRATION_PLAN.md`. Picks up where `MULTI_ASSET_VTS_EXPANSION_PLAN.md` leaves off (items 3 / 4 / 6 from that doc's §4 sequencing table). Process: two CC sessions converged on plan structure; Langston two-round design review (round 1 substantive + 9-question answers + 8 corner-case scrutiny + timeline pushback → v2 + round 2 ACK with 3 inline clarifications: F-NOW migration scope, crypto-friction-review batch added, DBS backfill 7-day hard floor).

**Plan structure (locked):**
- Phase 0 (NEW pre-flight, parallel to A.1): corporate-actions + dividend ex-dates + halts verification. Production-risk gate — TEC is live on xStock VTS trades and a 2:1 split would cascade-trigger trailing stops.
- Phase A: DBS foundation for xStocks. Sector-classification with SPY fallback. Eleven SPDR sector ETFs (XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC). NO pre-emptive component-weight retune (load-bearing invariant). Sector mapping co-located on `XSTOCK_SPOT_REGISTRY` extended to `{ name, is24_7?, sector }`. Hard floor: <7 days archive depth → A.2 waits.
- Phase B: 7 sub-batches for threshold calibration. B.1 regime + time_of_day_class via NYSE clock + index-rebalance flag; B.2 IMF families; B.3 strategy gates (watchlist: pivot_shift / mean_reversion / range_trade); **B.4↔B.5 coupled-retune unit (friction + max-spread together; NO batch inserts between)**; B.6 TEC priors from archive replay; B.7 position sizing + sector concentration gate (2-3 positions/sector or 35-40% heat).
- Phase C: equity macro modifier. **Narrow start: VIX only.** Add DXY after first observation window. FRED + Yahoo; Polygon deferred.
- Phase D: strategy set scope. Keep 9 crypto carryovers + audit; ORB redesign (5/15/30/60min sweep); gap-fill YES; PEAD/sector-rotation/index-rebalance DEFER. **Earnings option (b): block opens 24h before / 4h after.**
- Phase E: factor identification + emitter implementation (wires xStock pipeline into `emitAblationRecord` — BATCH_82 fixed crypto call sites but xStock pipeline still bypasses it) + 14-day observation calibration (SERIALIZED).
- Phase F: two-stage. **F-NOW (~half day): plumbing verify + `calibration_state TEXT` column on `vts_open_trades` set at INSERT.** F-LATER (~20-30 days from start): real exit-ablation calibration once post-A-D trades accumulate.
- Phase G: cross-asset ranking parity (B81). Post-launch reference only. NOT in scope.
- Parallel batch: crypto-friction-review (3-5 days, runs in Phase B window; B81 prerequisite item 2).

**Timeline:** 35-45 days nominal, 55-65 conservative. Stack-up risks: DBS design call iteration, Phase 0 surfacing edge cases, strategy redesigns, gap-fill build, earnings-handling impl.

**Architectural principle locked into the plan (becomes workflow doc standing rule at plan close):** "Calibration dependency invariant — every new asset class calibrates upstream-to-downstream; Layer-1 starter values are deployment-validation only, not calibration-grade. Evidence collected on miscalibrated upstream cannot be used as calibration input for downstream stages."

---

## NEXT SESSION PLAN (post-compaction — immediate next step)

**SEQUENCING UPDATE 2026-05-15 (Kyle directive):** Crypto factor calibration finalization + B67.5 ship BEFORE xStock Calibration Plan Phase 0. Reasoning: May 15 was the planned hard fence on crypto's calibration cohort per MULTI_ASSET_VTS_EXPANSION_PLAN.md. Walking past the fence without acting on the two-plus weeks of accumulated lever-ablation evidence would be incoherent. Plus: the consumer-gate pattern B67.5 builds (downstream gate that reads the calibrated confidence number) becomes inherited infrastructure for xStock Phase E; doing xStocks first means building xStock factor calibration against an unused number.

**Priority 1 — Crypto factor calibration finalization + B67.5 batch.**
1. **Pull the analysis.** Run `computeFactorCalibration` on rolling_30d window; verify decision-grade gates per factor (n ≥ 150/bucket, spread ≥ 7pp, p < 0.05). Get per-lever verdict: positive lift / negative lift / decorative / still-accumulating.
2. **Decide factor set.** For each of the 8 levers (b67_1 macro modifier, b67_2 phase preference, b67_4 outcome feedback, b68_1 multi-tf agreement, b68_2 volume regime, b68_3 pair correlation, b68_4 freshness, b68_5 DBS sustainability): keep / retune / drop / wait-for-more-data. Iterate to consensus with Langston via file-first protocol.
3. **Design B67.5 gate.** Currently floor of 0.45 means confidence never goes low enough to gate a trade. B67.5 = the consumer gate that actually rejects based on calibrated confidence. Design call needs Langston review. Probably needs Kyle decision on the rejection threshold.
4. **Implement + ship B67.5.** Scope doc → pre-audit → Step 3 code → Langston review → ship → UI verify → completion report.
5. **Governance.** Update relevant docs; close the calibration cohort fence; update MEMORY before xStock Phase 0 starts.

Realistic time: 3-5 days, possibly longer if data is inconclusive (insufficient samples in some buckets → "keep accumulating N more days" rather than "finalize today"). If inconclusive, may need to start xStock Phase 0 in parallel anyway and finalize crypto on a slightly later date.

**Priority 2 — xStock Calibration Plan Phase 0 corporate-actions audit.** Sequenced AFTER crypto B67.5 ships. First code-touching batch of `1-system-manual/XSTOCK_CALIBRATION_PLAN.md`. Three sub-tasks (0.1 splits / 0.2 dividends / 0.3 halts) per the plan §1 Phase 0 procedures. Gate: if any surface real bugs, Phase 0 becomes hotfix batch before Phase A. A.1 DBS design call runs in parallel.

**Priority 3 — Out of scope this session:** Phase 16 §16.7 test suite recovery; §10d observability backfill; oscillator family removal; B80 crypto-perp (all sequenced after the xStock calibration plan completes).

---

## RECENT SHIPS (compressed summary — full detail in batch completion reports / commits)

**xStocks diagnostic data/UI sprint CLOSED 2026-05-14:**
- B-NEW-31 (`3e7a7ccbd`, PM2 #276) — Header/first-col freeze on Open + Closed Simulated Trades tables
- B-NEW-14 (`3e17ff31e` + `b5b057161`, PM2 #280) — max_bid_ask_spread peer global filter on xstock + tab strip wrap
- B-NEW-TZ (`82325e27b`, PM2 #281) — User timezone setting persists; Kyle's account set to Europe/Warsaw
- B-NEW-21 (`19de3bb4f`, PM2 #282) — `/api/xstocks/freshness` rewritten unnest+LATERAL; 13.8s → 88ms (157× speedup)

**BATCH_82 (2026-05-14, PM2 #275):** xstock_spot ablation + calibration data path repair. Type-system-enforced caller-resolves on `emitAblationRecord(assetClass)`. Composite (asset_class, time) indexes on both ablation tables. Endpoint speedups: xstock-ablation 954×, xstock-calibration 501×, crypto-ablation 63× regression. KNOWN GAP from BATCH_82: it fixed asset-class threading on crypto call sites only — xStock signal-emission path still bypasses `emitAblationRecord` entirely. Phase E.2 of the calibration plan addresses this.

**B83 hotfix (2026-05-14, commit `b4cde6b85`, PM2 #274):** `ReferenceError: tradeId is not defined` in `vts-runner.ts` second for-loop. 24hr silent pipeline stall; 85-trade backlog flushed on first post-fix cycle. `[B83-CYCLE]` permanent unconditional health-beat log replaces gated `if (resolved > 0)` anti-pattern.

**Plain-language rule (2026-05-14):** All Kyle-facing summaries plain English; no function names, file paths, code snippets, SQL, jargon. Reference exemplar: B-NEW-14 / B-NEW-21 explanations. CC↔Langston exchanges stay technical bidirectionally.

---

## OPERATIONAL FACTS

- xstocks: 260-pair universe + 24h DB-backed trade counts via `vts_open_trades` (B79.0g-tx soft-delete with 90d retention).
- 75-pair round-robin scan rotation. 3 pinned benchmarks: SPY/QQQ/GLD.
- xstock + perp feeds archived via B74 (renamed `xstock_*_ohlc_1m` / `xstock_*_ticker_snap` in B79.0e).
- Strategy registration: 10 enabled for xstock_spot (9 crypto carryovers + 1 ORB equity-native). xstock_spot BE-protect = **TRUE** in DB per Kyle directive (intentional).
- Active trading OFF (Phase 19 territory). VTS passive learning ON.
- TEC state persists across PM2 restarts via `/tmp/trailing-states.json`. Per-trade keyed (BATCH_80).
- `[B83-CYCLE]` log fires unconditionally per VTS exit cycle.
- DBS for xstock currently SYNTHESIZED NEUTRAL (DBS=0) — Phase A of calibration plan fixes this.
- `emitAblationRecord` wiring MISSING for xStock pipeline — Phase E.2 fixes this.
- xStock archive depth: started post-B79.0a (2026-05-08); pre-commit check at Phase A.2 with 7-day hard floor.

---

## LANGSTON RUNTIME + COMMS — see CLAUDE.md §6 + §8

Two systemd bridges on Hetzner `204.168.141.77`. Unified inbox `/var/log/cc-bridge-inbox.jsonl`. Send protocol = 3 steps (Telegram visibility + SSH-deliver via `claude -p --permission-mode bypassPermissions` with FRESH UUID per send + verbatim relay back to Telegram with `**LANGSTON SPEAKING:**` prefix). File-first for prompts >3KB; scp-stage to `/home/langston/inbox/<batch>/`.

Recently demonstrated working pattern (2026-05-15 calibration plan): v1 design ask staged to `/home/langston/inbox/xstock-calibration-plan/` → short pointer prompt via claude-cli → response captured to local task-output file → archived to `Langston Design Asks/<batch>_REPLY.md` → verbatim relay to Telegram in chunks (markdown parse can fail; fall back to plain text per §8.2 diagnostic runbook).

---

## Kyle Operating Directives (active, condensed)

- **NO PATCHES** (CLAUDE.md §5 #15). Long-term sustainable solutions only.
- **Per-asset-class config is the default** for behavioral knobs.
- **Backpressure: vertical-scale, never asset-class shedding.**
- **Each new asset class gets its OWN dedicated observation UI tab.**
- **No fallbacks for DB-governed settings.**
- **Kyle messages me in Claude Desktop.** Telegram = Kyle↔Langston + CC outbound visibility only.
- **Iterate with Langston to consensus** — escalate only on deadlock / scope expansion / new directive / risk boundary. Independently evaluate his feedback; never rubber-stamp.
- **Calibration is a mandatory onboarding step** (workflow Step 6b 2026-05-13).
- **"Staging verified" means UI-navigated, not curl-checked** (CLAUDE.md §9.3).
- **Numeric deltas / scaffolding-vs-functional declarations** must be top-of-report explicit (CLAUDE.md §9.1, §9.2).
- **Rename inventory protocol** (post-B83): grep-inventory OLD-name call sites pre-commit; per-row decision. Block-scope for-loop variables are unforgiving — TS won't catch.
- **Plain-language summaries to Kyle, every time** (CLAUDE.md §1 + §11). Reference bar: B-NEW-14 / B-NEW-21 / xStock plan summary. CC↔Langston exchanges stay technical bidirectionally.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` — **THE ACTIVE PLAN**
4. `1-system-manual/POST_AUDIT_ROADMAP.md`
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
6. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` (canonical blueprint; receives the calibration-dependency invariant + 9 other distilled items at plan close)
