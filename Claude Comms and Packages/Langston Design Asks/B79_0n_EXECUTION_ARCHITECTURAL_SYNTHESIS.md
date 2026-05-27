# B79.0n.EXECUTION Step 1.a — Architectural Synthesis + Pre-Scope Discussion

**From:** CC
**To:** Langston
**Date:** 2026-05-27
**Re:** Step 1.a architectural read for EXECUTION (#13) — last per-class plumbing sub-batch before WIRE-IN (Phase 19a). Same pre-scope discussion pattern as ORCHESTRATOR Step 1.a: surfacing findings before drafting scope so we don't anchor on the wrong size envelope.

---

## Context

- **Per Kyle directive 16:18 UTC 2026-05-27:** proceed with EXECUTION autonomously while he's away; close it out, then revisit Phase 19/25 split.
- **Predecessor:** B79.0n.ORCHESTRATOR (#12) CLOSED 2026-05-27 deploy `5e08568`.
- **Position in umbrella v4:** last per-class plumbing batch in Phase 24. After EXECUTION closes, Phase 24 is done; WIRE-IN moves to Phase 19a per the Phase split discussion deferred for Kyle's return.
- **Status:** scope NOT yet drafted — this synthesis is the pre-scope pre-flight.

---

## §1. What I found in the code probe

### §1.1 paper-execution-engine.ts (2,629 LOC, 23 assetClass refs post-ORCHESTRATOR)

The execution engine is **CRITICAL blast radius** per SIM §6.1 — every paper trade flows through it. Reviewed entry-side, exit-side, and trade-close paths:

- **Entry-side (line 2147):** `assetClass: resolveAssetClass(signal.symbol, 'kraken')` populates the position record via `createPaperSimOpenPosition`. Already threaded by B79.TEC Finding 2 fix + ORCHESTRATOR Chunk B caller threading.
- **Sizing call site (line 2529):** `assetClass: resolveAssetClass(signal.symbol, 'kraken')` per-class dispatch key — already threaded by ORCHESTRATOR Chunk B.
- **Close path (line 1086):** `closePosition` is class-aware via the outcomeFeedback hook at lines 1377+ — B79.0n.CONFIDENCE-CHAIN added `safeResolveAssetClass(position.symbol, 'kraken')` + per-class `outcomeFeedbackStore.updateEma(_assetClass, regime, strategy, ...)`.
- **Exit decisions:** delegated to TEC (Trailing Exit Controller) which is per-class via B79.0n.TEC.
- **Monitoring loop (1.5s):** processes positions regardless of class; price-cache reads are class-agnostic (public Kraken feeds).

**Net finding:** the per-class threading on this file is structurally complete from prior batches. The only remaining surfaces are AUDIT + REGRESSION-LOCK + possibly a defense-in-depth weekend pause at trade-open (low-priority, deferred-defensible).

### §1.2 paper-position-sizing.ts (299 LOC, 7 assetClass refs post-ORCHESTRATOR)

**HIGH blast radius** per SIM §6.3 — determines capital at risk per trade.

ORCHESTRATOR Chunk B already threaded:
- `PaperPositionSizingParams.assetClass: AssetClass` REQUIRED
- `getPatternPoolGuardrailsForAssetClass(params.assetClass).MAX_POSITION_PCT` for pattern signals
- Both caller sites pass `resolveAssetClass(signal.symbol, 'kraken')` deterministically (no silent fallback)

**The sizing core math itself (lines 141-180) is GLOBAL today:**
- `riskPerTradePct = parseFloat(guardrails?.portfolioRiskPerTradePct || '1.50')` — mode-keyed via GuardrailsV2, NOT asset-class-keyed
- `maxPositionPercentPct` — same, mode-keyed
- `maxTotalExposurePct` — same, mode-keyed

Making the sizing core per-class would require:
- Schema change to `GuardrailsV2` (or `module_constants.paper_sizing.<class>.*` rows)
- Per-class baseline values backed by EVIDENCE — not placeholders
- Per-class divergence justification (e.g., xStock 0.5-2% intraday ATR vs crypto 2-8% may justify different risk%)

**My read:** sizing-core per-class is a CALIBRATION concern, not a plumbing concern. Belongs in Phase 25/26 calibration, not in EXECUTION. The plumbing (REQUIRED-assetClass on the sizing function + pattern-pool dispatch) is already done.

### §1.3 pre-execution-validator.ts (338 LOC, 2 wildcard reads)

**HIGH blast radius** per SIM §6.4 — blocks/allows every trade.

Lines 14-15 hold the two wildcard keys:
```
const _GOAL_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };
const _STRAT_PROFILE_KEY_BASE = { exchange: '*', assetClass: '*', regime: '*' } as const;
```

Per C-8 §3.4 lock convention from RTB: pre-execution gates (goal alignment + strategy profile) are class-invariant today. Per-class divergence requires EXISTS-gated explicit-row evidence first — bundled into OBSERVABILITY (#16) or Phase 26 calibration.

**My read:** STAYS WILDCARD. No EXECUTION scope here.

### §1.4 Trade-close hooks + TRADE_CLOSED event

- `closePosition` at line 1086+ — class-aware via outcomeFeedback hook (B79.0n.CONFIDENCE-CHAIN).
- `archiveExitDecision` call at the close path — already per-class via B70 archiver schema.
- `TRADE_CLOSED` event emitted at trade close — needs check if it carries `assetClass` in the event payload. Probe pending.

### §1.5 Trading engine (live) — `trading-engine.ts`

**DORMANT** per SIM §6.2. Contains placeholder code (Math.random fills, goal alignment, legacy signal orchestration). Status: deferred until paper mode stable. Per Kyle directive 2026-05-27: live-trading wire-in is Phase 19a, not Phase 24.

**My read:** OUT OF SCOPE for EXECUTION. Phase 19a owns the trading-engine rebuild + Kraken authenticated key restoration.

### §1.6 MicroExecutionService — `micro-execution-service.ts`

Status: experimental, dormant per Kyle. Cannot execute trades (`triggerSymbolCheck` is TODO stub).

**My read:** OUT OF SCOPE.

---

## §2. CC's narrow-scope hypothesis

EXECUTION is genuinely narrow — possibly narrower than ORCHESTRATOR. The execution-layer per-class threading work was done piecemeal by prior batches (B79.TEC + B79.0n.STORAGE + B79.0n.CONFIDENCE-CHAIN + B79.0n.ORCHESTRATOR). What's left is audit + lock + visibility, not new architecture.

### IN scope (proposed)

1. **Audit + regression-lock tests** covering the entry-side hook + close path + outcomeFeedback hook for end-to-end per-class correctness. Anchor test: AAPLx/USD opens a paper position → position record has `assetClass='xstock_spot'` → on close, outcomeFeedback updates xstock store key, not crypto.
2. **TRADE_CLOSED event payload audit** — confirm event carries `assetClass` (or add it if missing).
3. **Per-class diagnostic endpoint** — extend ORCHESTRATOR's `/api/diagnostics/orchestrator-per-class-state` OR add new `/api/diagnostics/execution-per-class-state` returning per-class open-position count, recent close count, sizing-cap values currently in effect.
4. **Documentation in System Manual §6.1 / §6.3 / §6.4** updating per-class status (most surfaces complete; sizing-core deferred to Phase 25; validator stays wildcard per C-8 lock).

### OUT of scope (deferred)

- **Sizing-core per-class risk-pct / max-position-pct** — calibration concern requiring evidence. Phase 25 (archive-replay where possible) or Phase 26 (live-trade evidence). Discussed in Kyle's Phase 19/25 split conversation.
- **Pre-execution validator per-class goal-alignment / strategy-profile** — stays wildcard per C-8 §3.4 lock. Deferred to OBSERVABILITY (#16) where shadow-data observability infrastructure exists.
- **Trading engine (live) per-class** — Phase 19a + post-launch.
- **Defense-in-depth weekend-pause at trade-open** — upstream SQE filters weekend xstock signals; defense-in-depth at the engine boundary would be belt-and-suspenders but isn't required. Defer.
- **MicroExecutionService per-class** — service is dormant; cannot execute trades anyway.

### Size estimate

1-2 days. ~10-30 LOC of production code changes (most being comment additions documenting per-class status + maybe the event payload audit), 5-10 new regression-lock tests, 1 diagnostic endpoint extension or addition.

---

## §3. Asks for Langston

**Q1.** Does §2 narrow-scope hypothesis match your understanding of EXECUTION's current state, given the prior batches' threading work absorbed most of it? Or am I missing a major surface that you had in mind for EXECUTION?

**Q2.** Should the sizing-core per-class work (`portfolioRiskPerTradePct`, `maxPositionPercentPct` per asset class) land in EXECUTION as a SCHEMA-only batch (add per-class rows to GuardrailsV2 or module_constants WITHOUT yet activating them), or defer entirely to Phase 25/26 calibration where the values get evidence-derived? My lean: defer entirely — adding empty per-class rows now without a consumer would just be infrastructure dead-weight, same antipattern as the dead ARM instances we cleaned up in ORCHESTRATOR.

**Q3.** Should the diagnostic endpoint be ADDED to the existing ORCHESTRATOR endpoint (`/api/diagnostics/orchestrator-per-class-state` becomes the umbrella endpoint covering all execution-layer per-class state), or be a NEW endpoint specific to EXECUTION? My lean: extend the existing one — the endpoint name doesn't precisely match its content anyway (it's becoming a per-class-state-of-the-system endpoint), and consolidation is preferable to endpoint proliferation.

**Q4.** Anything else worth probing in Step 1.a before drafting scope v1?

**Reply format:** numbered point-by-point on Q1-Q4 is fine. If you ACK the narrow-scope hypothesis, I draft scope v1.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b79-0n-execution/B79_0n_EXECUTION_ARCHITECTURAL_SYNTHESIS.md` after SCP. Use `ssh staging` for any inspection beyond what's in this synthesis.
