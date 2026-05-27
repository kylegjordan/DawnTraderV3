# B79.0n.EXECUTION (#13) — Step 2 Pre-Audit

**Status:** DRAFT — pending Langston Step 2 ACK
**From:** CC
**To:** Langston
**Date:** 2026-05-27
**Predecessor:** Scope v1.1 (Step 1 ACK clean 2026-05-27 ~18:55Z)
**Per CLAUDE.md §2:** per-component SIM consultation + upstream/downstream/shared-state/background-execution/blast-radius enumeration for every affected component.

---

## §1. Components touched + blast-radius matrix

| # | Component | Chunk | Blast radius | SIM section |
|---|---|---|---|---|
| 1 | `server/services/paper-execution-engine.ts` | A (emit site L1545) + B (SSOT cleanup L1376) | **CRITICAL** | §6.1 |
| 2 | `server/lib/event-bus.ts` | A (interface) | MEDIUM | §6.x event bus surface |
| 3 | `server/routes.ts` | C (endpoint payload restructure) | LOW | §6.4 diagnostic endpoints |
| 4 | `server/services/c13-validation-service.ts` | NO CHANGE (listener verified safe) | NONE | §validation-services |
| 5 | `server/services/c14-validation-service.ts` | NO CHANGE (listener verified safe) | NONE | §validation-services |
| 6 | `server/services/narrative-feed.ts` | NO CHANGE (dormant, documented) | NONE | not in SIM (proper — dormant) |
| 7 | `server/services/session-lifecycle-controller.ts` | NO CHANGE (A5 informational confirm) | NONE | §weekend-lifecycle |
| 8 | `server/services/trading-engine.ts` | OUT (dormant — Phase 19a) | NONE | §6.2 |
| 9 | `server/services/micro-execution-service.ts` | OUT (dormant) | NONE | §6.6 |

---

## §2. Per-component analysis

### §2.1 paper-execution-engine.ts (CHUNK A emit + CHUNK B SSOT cleanup) — CRITICAL blast radius

**SIM §6.1 reference:** Paper Execution Engine — every paper trade flows through `executePaperSimSignalWithRiskCheck` (entry) and `closePosition` (exit). 2,629 LOC, 23 assetClass refs post-ORCHESTRATOR.

**Upstream feeders (entry-side):**
- `signal-orchestrator.ts` calls `executePaperSimSignalWithRiskCheck(signal, …)` — signal carries `signal.symbol`, `signal.strategyName`
- `resolveAssetClass(signal.symbol, 'kraken')` deterministic at entry (line 2147 SSOT write into position record)
- `getModuleConstantsService()` for per-class guardrail reads (B79.0n.MCE)

**Upstream feeders (close-side):**
- 1.5s monitoring loop iterates `getAllPaperSimOpenPositions(this.mode)` → `checkExitConditions(position)` (line 875+)
- Exit decisions delegated to TEC via `evaluateTECExit({ tradeId: position.id, assetClass: position.assetClass, … })` (B79.TEC NO_FALLBACK)
- `safeResolveAssetClass(position.symbol, 'kraken')` at line 1376 outcomeFeedback hook — **DRIFT site for CHUNK B**

**Downstream consumers (entry-side):**
- `storage.createPaperSimOpenPosition({ assetClass, … })` — writes position record with assetClass
- `paper-position-sizing.ts` REQUIRED-assetClass per ORCHESTRATOR Chunk B
- `pre-execution-validator.ts` wildcard reads (out of scope per C-8 §3.4)

**Downstream consumers (close-side):**
- `eventBus.emitTradeClosed({ … })` at line 1545 — **CHUNK A adds `assetClass: position.assetClass` to payload**
  - 3 listeners verified safe (CHUNK A audit): self-handler (mode-filter only), c13-validation (collection only), c14-validation (collection only). Zero handlers consume assetClass today.
- `archiveExitDecision(…)` already per-class via B70 archiver schema
- `outcomeFeedbackStore.updateEma(_assetClass, regime, strategy, …)` at line 1377+ — **CHUNK B switches `_assetClass` source from re-resolve to position.assetClass read** (with safeResolveAssetClass defensive fallback for legacy positions)

**Shared state:**
- In-memory buffers: `engineSessionStart: Map<TradingMode>` (mode-keyed), `priceHistory: Map<symbol>` (symbol-keyed), `lastPriceTickTime: Map<symbol>` (symbol-keyed). All class-irrelevant — no per-class refactor needed (Step 1.b Q4-A finding).
- `this.SLIPPAGE_PERCENT` (line 126) + `this.FEE_PERCENT` (line 127) — class-member WILDCARD. **OUT of EXECUTION scope** (Phase 25/26 calibration per scope §3 + `_meta.knownGaps`).

**Background execution:**
- 1.5s monitoring loop (price-tick + exit-condition check)
- Continuous promotion loop (Directive 8.8.8) bound to TCL_ACTIVATED + TRADE_CLOSED events
- Both class-agnostic at the loop level; class-specific logic only inside per-position handling

**Blast radius:**
- CHUNK A emit-site change: ONLY adds an optional field to event payload. Zero behavior change for any of 3 listeners. Same C-7 pattern empirically validated for PromotionEvent.
- CHUNK B SSOT cleanup: identical semantic — `safeResolveAssetClass(position.symbol, 'kraken')` and `position.assetClass` return the same value for all in-flight positions (since position.assetClass was written from resolveAssetClass at entry line 2147). Cleanup is preference for read-from-record discipline; defensive fallback preserves legacy-position safety.

**Risk register (none new):**
- B79.TEC keying invariant at line 1000 already enforces no-cross-class drift via runtime check. CHUNK A/B do not weaken this.
- No new throws or error paths introduced.

### §2.2 event-bus.ts (CHUNK A interface field) — MEDIUM blast radius

**SIM reference:** event-bus is the inter-service pub/sub channel for `TRADE_CLOSED`, `PROMOTION`, `TCL_ACTIVATED`, `SLOT_OPENED`, `RTB_THRESHOLD_MET`, `FAILSAFE_TRIGGER`. PromotionEvent already has `assetClass?: string` per B79.0n.RTB C-7 (line 50).

**Upstream feeders (TradeClosedEvent only):**
- 1 emit site: `paper-execution-engine.ts:1545`

**Downstream consumers (TradeClosedEvent only):**
- 3 listeners verified at scope §2 CHUNK A:
  - `paper-execution-engine.ts:184-188` — self-handler, `event.mode` filter only, calls `checkRtbPromotion()` (class-agnostic at the call level)
  - `c13-validation-service.ts:103-107` — pushes event into `session.tradeCloses` array, logs `event.symbol` + `event.pnl`
  - `c14-validation-service.ts:123-127` — identical to c13

**Shared state:** event-bus uses `EventEmitter` from Node `events` module with internal queue processor (200ms tick). Queue is type-agnostic. Adding optional field doesn't alter queue semantics.

**Background execution:** event-bus runs a 200ms queue processor that dequeues events and emits them. No state machine to update; the interface field is transparent to the queue.

**Blast radius:** ADDITIVE OPTIONAL — same risk envelope as PromotionEvent.assetClass C-7 from RTB. Verified empirically:
- No listener uses `keyof TradeClosedEvent` enumeration
- No listener does exhaustive-switch on `TradeClosedEvent` shape
- No JSON.stringify / structured-clone / telemetry-emit consumer hit (Step 1.b A2 grep — zero production hits)

**Risk register (none new):** Same C-7 doctrine. Documented in new ASSET_CLASS_ONBOARDING_WORKFLOW §4.23 (CHUNK F #8).

### §2.3 routes.ts (CHUNK C endpoint payload restructure) — LOW blast radius

**SIM §6.4 reference:** Pre-execution gates + diagnostic endpoints. The `/api/diagnostics/orchestrator-per-class-state` endpoint was added in B79.0n.ORCHESTRATOR Step 3.

**Upstream feeders:** None — this is a GET endpoint with no path parameters.

**Downstream consumers:** **ZERO production callers** verified via Step 1.b A6 thorough grep across `client/`, `server/tests/`, `scripts/`. Found ONLY in `server/routes.ts` (definition site). Top-level-key restructure is safe.

**Payload schema change v1 → v2:**
- v1: flat top-level keys (e.g., `crypto_spot.FINAL_SCORE_FLOOR`)
- v2: nested by layer `{ orchestrator: {…}, execution: {…}, _meta: { schemaVersion: 2, coverage: […], lastReviewed, knownGaps: [] } }`

**Shared state:** Endpoint reads from `getModuleConstantsService()` (per-class) + storage queries for open-position counts + recent-close-count + fee/slippage from `exchange-defaults.ts` (currently wildcard).

**Background execution:** None — request-scoped synchronous handler.

**Blast radius:** LOW — zero existing callers, schemaVersion 2 self-describing. Operators reading the endpoint get the restructured payload starting at deploy time; no client-side migration needed.

**Risk register (one new):** RUNNING_ISSUES entry for **URL-vs-scope mismatch awareness** — URL says "orchestrator" but payload covers orchestrator + execution. Documented in System Manual §6.x (CHUNK D) + `_meta.coverage` field surfaces scope inline.

### §2.4 c13-validation-service.ts + c14-validation-service.ts (NO CHANGE — listeners verified) — NONE blast radius

**SIM reference:** Both are Phase 8.8.4-C.13 and C.14 validation collectors that observe TRADE_CLOSED + PROMOTION events into per-session arrays for post-session reporting.

**Verification (Step 1.b CHUNK A audit):**
- `c13-validation-service.ts:103-107` reads ONLY `event.mode` (filter) + `event.symbol` (log) + `event.pnl` (log). Pushes whole event into `session.tradeCloses` array.
- `c14-validation-service.ts:123-127` identical pattern.
- Neither reads `event.assetClass`. Neither does keyof enumeration. Neither destructures with strict shape. Additive field is safe.

**Future:** PHASE 19a active-trading wire-in or Phase 25/26 calibration may add per-class assertions on `event.assetClass`. The additive field makes this trivially possible without breaking change.

### §2.5 narrative-feed.ts (NO CHANGE — dormant, documented) — NONE blast radius

**SIM reference:** Not currently in SIM (correct — dormant infrastructure path).

**Verification (Step 1.b Q4-A audit):**
- `TradeOpenedPayload` (lines 38-45) and `TradeClosedPayload` (lines 60-65) defined but only invoked from test fixtures
- `appendNarrativeEvent` has zero production callers in `server/services/` or `server/core/`
- Consumed by routes.ts:8776+8814 (diagnostic endpoint) for narrative-feed display, but no production code appends

**Decision:** OUT of EXECUTION scope. RUNNING_ISSUES entry (CHUNK F #7) flags: "Narrative-feed TRADE_OPENED/TRADE_CLOSED payload lacks assetClass; dormant — re-review when narrative-feed activation is scoped OR at annual dormancy audit."

### §2.6 session-lifecycle-controller.ts (NO CHANGE — A5 informational confirm) — NONE blast radius

**Step 1.b A5 probe finding:** Line 48 imports `isXstockMarketOpenUTC` from `server/asset_classes/xstock_spot/market-hours.js`. Weekend-pause IS class-aware (per-class market-hours module owns the window definition). NOT symbol-list-based. Generalizes naturally to future weekend-paused classes — each new class plugs in its own `market-hours.js`.

**Implication:** Engine-boundary defense-in-depth weekend-pause correctly defer-able for EXECUTION; no PATTERN-DETECT class-onboarding implication.

### §2.7 trading-engine.ts + micro-execution-service.ts (OUT — dormant) — NONE blast radius

**SIM §6.2 + §6.6 reference:** Both dormant per Kyle directive 2026-05-27 (live-trading wire-in is Phase 19a).

**Step 1.b Q4-D dormancy re-confirm:** `git log` on both files returns only `384e48e Memory sync: B-NEW-43 scope rev3` (diff did not touch these files). Dormancy holds.

**Decision:** OUT of EXECUTION scope. Phase 19a owns trading-engine rebuild + Kraken authenticated key restoration.

---

## §3. Cross-cutting risk register

### §3.1 Same-symbol-across-classes scenario (post-RTB C-7)

Post-B79.0n.RTB, the system structurally supports same symbol traded across multiple classes (e.g., a hypothetical xstock_perp AAPLx perpetual + xstock_spot AAPLx spot). Today this is theoretical (both perp classes return CLASS_NOT_WIRED), but the TradeClosedEvent additive field future-proofs disambiguation for that scenario without an event-shape break.

### §3.2 Legacy-position safety on CHUNK B SSOT cleanup

If any in-flight positions exist at deploy time without `position.assetClass` populated (legacy positions from pre-B79.TEC), the `position.assetClass ?? safeResolveAssetClass(position.symbol, 'kraken')` fallback handles it. The defensive fallback is `safeResolveAssetClass` (returns null on unregistered, doesn't throw), and the existing outcomeFeedback hook code path at line 1376+ handles null-class skip semantics. No regression.

### §3.3 ORCHESTRATOR diagnostic endpoint payload break

Step 1.b A6 grep confirmed ZERO callers across full repo. The v1 → v2 payload restructure is technically a breaking change at the endpoint contract level, but no consumer exists to break. The break is operationally invisible.

### §3.4 Test infrastructure already mocks per-class behavior

Existing test fixtures (`b79-0n-orchestrator-cascade.test.ts` from ORCHESTRATOR) use key-aware DB mocks that differentiate crypto_spot vs xstock_spot guardrail values. CHUNK E tests can extend these fixtures with same mocking approach.

---

## §4. Open questions for Langston Step 2 review

**B1.** Per-component analysis sufficient for Step 2? Anything you want deeper coverage on (background-execution loops, shared-state Maps, etc.)?

**B2.** Risk register §3 — anything missing? My read is: §3.1 future-proofing is the most consequential (CHUNK A enables it); §3.2 legacy-position safety is the only "could fail" path; §3.3 endpoint break is operationally invisible; §3.4 test infra is reuse.

**B3.** Should the legacy-position safety scenario (§3.2) get an explicit regression-lock test in CHUNK E? My lean: test #5 already covers it ("outcomeFeedback hook falls back to safeResolveAssetClass when position.assetClass missing"). Could expand to also assert no-throw on null-class skip.

**B4.** SIM §6.x diagnostic-endpoints subsection (CHUNK D) — propose placement BEFORE the §6.4 pre-execution-validator entry (where SIM currently documents wildcard reads), so the diagnostic-endpoint doctrine sits adjacent to the per-class state it surfaces. OK?

**B5.** Anything else worth catching before Step 3 implementation kick-off?

**Reply format:** numbered point-by-point on B1-B5 is fine. If you ACK clean, CC proceeds to Step 3 chunked implementation A-G.

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b79-0n-execution/B79_0n_EXECUTION_PRE_AUDIT.md` after SCP. The architectural synthesis + scope v1.1 in the same inbox folder give full context. Use `ssh staging` only for inspection beyond the pre-audit content.
