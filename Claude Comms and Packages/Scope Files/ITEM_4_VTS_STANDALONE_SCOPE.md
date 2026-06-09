# ITEM 4 — VTS Standalone Always-On Simulation Service + Storage-Architecture Decision — SCOPE (DRAFT v1)

> Between-Phase-24→19 plan **item 4** (Kyle directive 2026-06-08; readiness-checklist §5 + §5a). **Design-before-build (NO-PATCHES §5#15):** §5a requires a storage-architecture design + decision FIRST, before the standalone-VTS build. This scope covers BOTH, structured as Phase A (storage-architecture design/decision) → Phase B (standalone-VTS firehose build, gated on the Phase-A decisions + Kyle approval).
>
> **Status:** v2 — **Langston Step-1 consensus reached 2026-06-09** (agreed directionally with all six decisions; refinements adopted below). **No code, no build — scope only; awaiting Kyle approval.** Active trading OFF throughout. Author: Claude Code, 2026-06-09. Architectural read done at code + SIM + System Manual level (sources cited inline; Langston independently re-verified F2 against the live call sites).

---

## 0.5 LANGSTON STEP-1 CONSENSUS — ADOPTED REFINEMENTS (2026-06-09)
Langston re-verified F2 at code level (the 3 archivers read `getCurrentMode()` *inside themselves*; firehose write sites `vts-runner.ts:1943/2607/3616/3706` + `xstock_spot/eval-cycle.ts:546/633` and active site `signal-orchestrator.ts:1036` call the SAME archiver fns → contamination confirmed). He agreed with all six recommendations; these refinements are now part of the scope:

- **R-A (reframe, D1):** producer identity ALREADY exists in the rows via the **`source` column** (firehose=`'vts-runner'`, active=`'signal-orchestrator'`, scan=`'mce-cycle'`). So D1 is **"fix the mode derivation + canonicalize `source`," NOT "build a partition."** Two viable impls — decide in Phase A: (i) **override-don't-replace** — add an optional `mode` param to the 3 archivers; firehose callers pass `mode:'vts'`; active callers KEEP the `getCurrentMode()` default (it is correct for them); or (ii) **`source → mode` map inside the archiver** (zero caller edits). **Either way, canonicalize the fragmented firehose `source` vocabulary first** (`'vts-runner'`/`'vts'`/`'VTS'`/`'simulation'` all appear).
- **R-B (D2 lock):** **in-process-decoupled for item 4; separate PM2 process DEFERRED to Phase 19 entry** (a separate process only pays off once ingest-once-fan-out exists — else it needs its own Kraken connection = the duplicate-API-budget cost F6 wants to kill, paid while active is OFF for no benefit). **Honesty flag:** in-process decoupling insulates the firehose from *component* restarts (orchestrator/TEC bounce) but NOT a full `pm2 restart`/redeploy — see the amended criterion #3.
- **R-C (D3):** thin in-process fan-out **seam** now; real single-ingest staged to Phase-19-adjacent (it's what makes separate-process viable).
- **R-D (D4 — the genuinely-open fork):** **`pair_scan` shared-substrate question.** The MCE scan runs ONCE per cycle (`source:'mce-cycle'`) and feeds BOTH firehose and active — you cannot tag one scan row with one consumer's mode without mislabeling the other. **Decide explicitly in Phase A:** is `pair_scan` producer-agnostic substrate (tag once, like OHLC) or does each consumer get its own scan row? (Scope leaned OHLC-agnostic but never extended the reasoning to `pair_scan`.) ALSO: `macro-feed-archiver.ts` + `decision-provenance.ts` set no mode yet their tables have `mode NOT NULL` — **verify in Step 2 they aren't riding a silent DB default.**
- **R-E (D5):** model the firehose at its **real fan-out multiple** (many signals across strategies×regimes), not a flat 3× of today — firehose row-rates dominate; project per-producer rates + the **cold-tier (B2) growth curve** (cold never deletes; hot headroom is fine at ~5% of 200 GB).
- **R-F (D6 sequencing):** fold B70 into the tiered lifecycle, but **ship D1 (the small, correctness-critical Phase-19 blocker) FIRST; the D6 tiering migration follows as a separate deploy step** in the same scope — don't gate the mode-stamp fix behind the bigger data migration.
- **R-G (Q5):** **Phase A (the storage-architecture design doc) is its OWN sub-batch with its OWN Kyle sign-off**, then Phase B build (itself sequenced D1-then-D6). NO-PATCHES wants the architecture pinned before the build.
- **R-H (note, don't block):** `getCurrentMode()`'s cache is 5s-lazy — at the paper-on transition there's a ≤5s window where active rows could still read `'vts'`. The per-producer firehose stamp eliminates this for the firehose; a forced `refreshMode()` on the mode-transition event closes it for the active side. Note in Phase A.

---

## 0. GOAL (plain)
Build the VTS (passive-learning) simulator as an **always-on standalone service that keeps running regardless of trading state** — so when Phase 19 turns paper-active trading on (and later live), the broad continuous-learning data stream is never interrupted by the start/stop of active trading. AND, because we will soon have **three always-on data producers at once** (standalone-VTS firehose + paper-active + live), settle the **full data/storage picture first**: what each captures, the strict partition so calibration never pools sim vs paper vs live, and the hot/warm/cold tiering + volume projection with all three on.

---

## 1. ARCHITECTURAL FINDINGS (from the read — these ground the decisions)

**F1 — VTS today is the "firehose," already always-on, but in-process.** `vts-runner.ts` (~1,850 lines, SIM §7.1) is an autonomous 60-second dual-path (quant + pattern) simulator that deliberately generates MANY virtual signals/trades across strategies+regimes (the firehose). It runs **inside the main app process**, started at boot by `boot_orchestrator.ts` (`initializeVTSWithAutoStart` → `preloadPatternHistory` → `initVTSRunner` → `startAutonomousSimulation`). It is the EXCLUSIVE telemetry writer (M70). It does NOT depend on active trading being on — today active trading is OFF and VTS runs fine. **So "always-on" is partly already true; the real risk is Phase 19 putting active-trading in the same process, where active-trading restarts/debugging cycles would interrupt the firehose.**

**F2 — The sim/paper/live partition mechanism EXISTS but is derived from a single GLOBAL mode (the core gap).** Every B70 archive row already carries a `mode` column ∈ {`vts`,`paper_sim`,`live`} (mode-agnostic capture, Kyle directive 2026-05-04, SIM §B70) + a `source` per-hook column. BUT `run-mode-controller.ts:getCurrentMode()` derives ONE global system mode with strict precedence **`live > paper_sim > vts`** (verified at code level). **Consequence:** the instant paper-active turns on, `getCurrentMode()` returns `'paper_sim'` for the WHOLE process → the always-on VTS firehose's rows get mislabeled `'paper_sim'`, pooling firehose-sim with paper-selective data — exactly the contamination §5a says we must prevent. **The fix is structural: the `mode` tag must be stamped per-producer at the write site (the firehose always writes `'vts'`; paper writes `'paper_sim'`; live writes `'live'`), not read from a global flag.** The 3 enum values already exist; only the derivation is wrong for concurrency.

**F3 — Tiered storage already exists (B75, SIM §B75) — "move-not-delete," 3 tiers.** HOT (Supabase disk: 30d ticker / 365d OHLC) → WARM (Supabase Storage `dt-archive`, JSONL.gz, 365d) → COLD (Backblaze B2, JSONL.gz, indefinite — never deleted). `data_archive_manifest` is the SSOT state machine ("what exists, where"); `data_lifecycle` module_constants (18 rows) hold per-table retention/tier knobs; `database_monitor` watches the 200 GB Supabase Pro cap (65%/80% alarms). B-NEW-47 activated the B74 OHLC sweep (streaming, adaptive day-slicing). **So we do NOT design tiering from scratch — we extend an existing, working tiering system.**

**F4 — But the B70 telemetry-archive family is NOT yet tiered.** B70's 5 archive tables (`pair_scan_archive`, `signal_eval_archive`, `exit_decision_archive`, `macro_feed_archive`, + provenance) run Postgres-only with a 90-day partition-drop (`b70_postgres_retention_days=90`). Folding B70 into the `data_lifecycle` registry (export-to-warm/cold instead of drop) was explicitly deferred to "a future B75.x" (SIM §B75 forward-couples; RUNNING_ISSUES #67). With three producers all writing B70 rows, the 90-day DROP now conflicts with the "never drop data" policy.

**F5 — Volume baseline.** B70 ≈ 52 MB; B74 OHLC+ticker ≈ 5.12 GB live (the dominant store); provenance ≈ ~1.45 GB/mo (xStock) growing as crypto + more producers come on. Supabase Pro cap = 200 GB (currently ~5% used). Ingest today is per-consumer (VTS price-cache bucket; B74 archivers hold their own WS connections) — NOT yet the "ingest-once-fan-out" design.

**F6 — Design intent on record (roadmap 2026-06-05 update + readiness §5):** "ingest market data ONCE, fan out to N consumers (standalone-VTS / paper / live) → zero extra Kraken API calls." Two simulated jobs, not one: **firehose** (broad learning, drift, pattern-path negative-control) = THIS item, built pre-19; **shadow = paper mode** (selective one-best-per-cycle on sim fills) = built AS Phase 19, separate.

---

## 2. DECISIONS TO SETTLE (Phase A — the storage-architecture design; each with a recommendation + tradeoff)

**D1 — Mode tagging: per-producer stamp (RECOMMEND) vs keep global `getCurrentMode()`.** RECOMMEND: replace the global-mode read at each archive write-site with a **producer-stamped mode** — the firehose hooks pass `'vts'` explicitly; the paper-execution hooks pass `'paper_sim'`; the live hooks pass `'live'`. Keep `getCurrentMode()` only for genuinely system-global uses (if any). This is the one change that makes the sim/paper/live partition correct under concurrency. *Tradeoff:* touches the ~6 B70 hook sites (SIM §B70 hot-path hooks) — surgical, well-enumerated, telemetry-only.

**D2 — Process architecture: separate PM2 process vs in-process decoupled lifecycle.** Options: (a) **separate PM2 process** for the firehose (clean insulation from active-trading restarts + own Kraken API budget — the original Phase-19.0 "VTS process partition"); (b) **in-process but lifecycle-decoupled** (the firehose keeps running while active-trading components restart independently — simpler, no new process, but shares process fate / a full app restart still bounces it). RECOMMEND a decision driven by the ingest design (D3): if ingest-once-fan-out lands, a separate process is cleaner; if not, in-process decoupling may suffice for pre-19. **Flag for Langston + Kyle** — this is the biggest cost/complexity fork.

**D3 — Ingest-once-fan-out: build the single-ingest fan-out now, or keep per-consumer feeds for this item.** The end-goal is one market-data ingest → fan out to N consumers (zero extra API calls). Today feeds are per-consumer. RECOMMEND scoping the fan-out **interface/seam** now (so the firehose, paper, and live all consume from one ingest abstraction) but deciding how much of the actual unification ships in this item vs is staged. *Tradeoff:* full unification is a bigger surface; a thin fan-out seam de-risks without a big-bang rewrite.

**D4 — What each of the three producers captures + the partition keys.** Enumerate, per producer (firehose / paper / live), the data classes written (scan rows, signal-eval + provenance, exit decisions, trades, telemetry, OHLC substrate) and confirm the partition keys: `mode` (D1) + `source` + existing `asset_class` + `calibration_state`. Goal: every calibration query can cleanly select one producer's data and NEVER pool across producers. RECOMMEND: firehose = the current VTS write-set (broad); paper/live = the selective-pipeline write-set; OHLC substrate (B74) is shared/producer-agnostic (it's raw market data, not decisions).

**D5 — Retention + tier per stream, with all three producers on; volume projection.** Decide, per data class, the hot-retention window and whether it tiers to warm→cold or drops. RECOMMEND aligning everything to the existing B75 "move-not-delete" policy (no drops). Produce a volume projection for 3 concurrent producers against the 200 GB cap + the per-stream tier policy.

**D6 — Fold the B70 telemetry-archive family into the tiered lifecycle now (RECOMMEND) vs defer.** RECOMMEND folding B70's 5 tables into `data_lifecycle` (export-to-warm/cold instead of the 90-day DROP) as part of this item, since 3 producers × the "never drop" policy makes the current 90-day drop a data-loss path. This is the deferred RUNNING_ISSUES #67/#172 work; doing it here closes those. *Tradeoff:* adds the B70 tables to the sweep surface — but reuses the existing B-NEW-47 streaming sweep machinery (low new code).

---

## 3. SCOPE BOUNDARY (what this item IS / IS NOT)
- **IS:** (Phase A) a storage-architecture **design document + decisions** resolving D1–D6, Langston-reviewed, Kyle-approved BEFORE any build; (Phase B, gated on Phase A) the standalone-VTS firehose **lifecycle decoupling** + the **per-producer mode stamping** (D1) + the agreed tiering extension (D5/D6).
- **IS NOT:** the Phase-19 "shadow = paper mode" selective pipeline (that is Phase 19). NOT the active-trading wire-in. NOT a feed rewrite beyond the agreed D3 seam. Active trading stays OFF.
- **Design-before-build gate:** Phase B does not start until the Phase-A design doc is agreed with Langston AND approved by Kyle.

## 4. VERIFICATION CRITERIA (outcomes-based)
1. With paper-active simulated ON (test harness, not live), firehose archive rows still tag `mode='vts'` (NOT `'paper_sim'`) — the partition holds under concurrency.
2. A calibration-style query can select exactly one producer's rows with zero cross-producer pooling.
3. The firehose keeps producing cycles across a **component-level** active-trading restart (orchestrator / TEC / paper-engine bounce) with no gap in the data stream. **(Scope clarification per Langston R-B: item 4 targets COMPONENT-restart insulation via in-process decoupling; FULL-app-restart insulation requires the separate PM2 process, which is deferred to Phase 19 entry. This criterion is explicitly component-restart, not full-app-restart.)**
4. B70 tables (if D6 = fold-in) export to warm/cold instead of dropping at 90 days; `data_archive_manifest` shows the rows moved, not deleted.
5. Volume projection documented; `database_monitor` stays green under the 3-producer model.

## 5. OPEN QUESTIONS FOR LANGSTON (Step-1 iteration)
- Q1 (D2): separate PM2 process vs in-process decoupling for the firehose pre-19 — which, and why, given Phase 19 will add active-trading to the process?
- Q2 (D3): how much ingest-once-fan-out ships in item 4 vs is staged — is a thin fan-out seam enough pre-19, or does insulation require the real single-ingest now?
- Q3 (D1): any system-global consumer of `getCurrentMode()` that should KEEP the global semantics (so we don't blanket-replace it)?
- Q4 (D6): fold B70 into the tiered lifecycle in this item, or keep it a separate follow-on — does bundling it raise the blast radius too far for one batch?
- Q5: is Phase A (design doc) best delivered as its own sub-batch with its own Kyle sign-off, then Phase B as the build — or one combined scope?

## 6. GOVERNANCE / WORKFLOW (two-gate, per Langston R-G)
Step 1 (this scope) → Langston Step-1 iterate-to-consensus ✅ → **Kyle approval of THIS scope (HARD GATE #1 — Kyle directive: do not proceed past scope without approval)** → **Phase A = its own sub-batch:** Step 2 pre-audit (deep SIM per-component; resolves the R-D `pair_scan` fork + verifies the macro/provenance mode-population) → storage-architecture **design doc** (locks D1-impl choice, pair_scan disposition, tier/retention policy, volume+cold-curve projection) → **Kyle approval of the design doc (HARD GATE #2)** → **Phase B build:** D1 mode-stamp fix (ships FIRST) → D6 B70 tiering fold-in (separate deploy step) → standalone-VTS lifecycle decoupling → review/CI/deploy/verify/govern/close. Tier-2 docs in play: SIM (§B70/§B74/§B75/§7.1), System Manual (data pipeline + VTS), MULTI_ASSET_VTS_EXPANSION_PLAN (firehose working-list), data_lifecycle registry.
