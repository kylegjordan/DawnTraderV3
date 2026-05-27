# B79.0n.EXECUTION (#13) — SCOPE v1.1

**Status:** Langston Step 1 ACK CLEAN (2026-05-27 ~18:55Z, reply 4063 bytes). v1.1 folds in non-blocking additions A1-A6 from his review.
**From:** CC
**To:** Langston
**Date:** 2026-05-27
**Position:** Sub-batch #13 of 16 in B79.0n umbrella v4 — last per-class plumbing batch before WIRE-IN (#14, Phase 19a).
**Predecessor:** B79.0n.ORCHESTRATOR (#12) closed 2026-05-27 deploy `5e08568`.
**Per Kyle directive 16:18 UTC 2026-05-27:** proceed autonomously with Langston while he's away.

---

## §0. Pre-scope context

Step 1.a synthesis (`Claude Comms and Packages/Langston Design Asks/B79_0n_EXECUTION_ARCHITECTURAL_SYNTHESIS.md`) + Langston Step 1.a ACK (5196 bytes, 2026-05-27 ~18:44Z, relayed to Telegram topic 21 msg_ids 4282/4283). Narrow-scope hypothesis ACK'd with 4 additions absorbed below. Step 1.b probes completed 2026-05-27 ~18:50Z (TRADE_OPENED audit, position-record SSOT audit, fee/slippage dispatch probe, dormancy re-confirm).

**Headline finding from §1.a + §1.b combined:** EXECUTION is genuinely narrow. Prior batches (B79.TEC + B79.0n.STORAGE + B79.0n.CONFIDENCE-CHAIN + B79.0n.ORCHESTRATOR) absorbed most execution-layer per-class threading. What remains is audit + lock + visibility + 2 small drift cleanups + 1 event-payload additive field. Sizing-core risk/cap + fee/slippage dispatch defer to Phase 25/26 (calibration with evidence). Pre-execution validator stays WILDCARD per C-8 §3.4. Trading-engine + MicroExecutionService confirmed dormant — out of scope.

---

## §1. Step 1.b probe findings (informational, drive scope below)

### §1.1 Q4-A TRADE_OPENED event audit — NO WORK NEEDED

There is **no `TradeOpenedEvent` interface** in `server/lib/event-bus.ts`. `TRADE_OPENED` exists only as a narrative-feed event-type string in `server/services/narrative-feed.ts:23` with `TradeOpenedPayload` defined at lines 38-45 (fields: symbol, side, entryPrice, strategy, regime, positionSize?). `appendNarrativeEvent('TRADE_OPENED', …)` is called ONLY from test fixtures (`server/tests/integration/market_indicators_narrative.test.ts`). NO production emit path. The narrative-feed system is consumed by `routes.ts:8776+8814` (diagnostic endpoint) but is essentially dormant — no production code appends to it.

**Conclusion:** TRADE_OPENED is structurally absent in the eventBus pub/sub system. The narrative-feed payload gap exists but is dormant. No work in EXECUTION. Flag as RUNNING_ISSUES entry for future narrative-feed activation work.

### §1.2 Q4-B Position-record SSOT audit — 1 small cleanup site

Sites in `paper-execution-engine.ts` that touch `assetClass` on positions:

| Line | Site | Pattern | Status |
|---|---|---|---|
| 2147 | `createPaperSimOpenPosition({ assetClass: resolveAssetClass(signal.symbol, 'kraken'), … })` | Canonical SSOT write at entry | GOOD |
| 1219 | `(position as any).assetClass ?? resolveAssetClass(position.symbol, exchange)` | Fallback (read record first) | GOOD |
| 1376 | `safeResolveAssetClass(position.symbol, 'kraken')` for outcomeFeedback hook | **Re-resolves from symbol** when position.assetClass is available | **DRIFT — cleanup in CHUNK B** |
| 922 | `position.assetClass` strict read (B79.TEC NO_FALLBACK) | Direct record read with hard-fail | GOOD |
| 2032 | `resolveAssetClass(signal.symbol, 'kraken')` — entry path b67_2_1 MCE context | signal not position, pre-record | OK (different lifecycle phase) |
| 2543 | `assetClass: resolveAssetClass(signal.symbol, 'kraken')` — entry path sizing | signal not position, pre-record | OK |

**One drift site (line 1376).** Pattern fix: read `position.assetClass` directly (the position record carries it from entry per line 2147). Fits in the CHUNK B audit lock work.

### §1.3 Q4-C Fee/slippage dispatch probe — defer to Phase 25/26

Lines 126-127 in `paper-execution-engine.ts`:
```
private readonly SLIPPAGE_PERCENT = CANONICAL_SLIPPAGE * 100; // crypto default 0.05%
private readonly FEE_PERCENT      = DEFAULT_TAKER_FEE * 100;  // crypto default 0.26%
```
Both are HARDCODED class members imported from `server/config/exchange-defaults.ts` — WILDCARD class-invariant. Used at:
- Entry path: lines 1951, 1954 (entry slippage + entry fee)
- Close path: lines 1123, 1126, 1129 (exit slippage + exit fee + entry fee fallback)

xStock equity has structurally different fees/slippage than crypto (broker fees, slippage model). Per Langston Q4-C probe call: this means Phase 25/26 calibration will need **CODE work + config work** (not config-only) — switch class members to per-class dispatch using `getFrictionForAssetClass` from B79.0n.MCE.

**Decision:** OUT of EXECUTION scope (matches Q2 sizing-core defer logic — calibration concerns, not plumbing). Will be documented in scope §6 and flagged as RUNNING_ISSUES entry for Phase 25/26 awareness.

### §1.4 Q4-D Trading-engine + MicroExecutionService dormancy re-confirm — HOLDS

`git log --oneline server/services/trading-engine.ts server/services/micro-execution-service.ts` returns 1 entry: `384e48e Memory sync: B-NEW-43 scope rev3 (Phase 4) + Phase 0 in progress` — that commit's actual diff did NOT touch either file (memory sync only). Files dormant.

**Decision:** STAY OUT of EXECUTION scope per umbrella v4 (Phase 19a owns trading-engine rebuild + Kraken authenticated key restoration).

---

## §2. Chunks (numbered objectives)

### CHUNK A — TradeClosedEvent.assetClass additive field

**Files:**
- `server/lib/event-bus.ts` — interface `TradeClosedEvent` (line 24-31)
- `server/services/paper-execution-engine.ts` — emit site (line 1545)

**Changes:**
1. Add `assetClass?: string` field to `TradeClosedEvent` interface (mirror PromotionEvent C-7 comment from B79.0n.RTB at lines 40-50).
2. At emit site (line 1545), populate `assetClass: position.assetClass` (the position record already carries it from entry; no re-resolve needed).
3. Audit 3 listeners — none consume `assetClass` today:
   - `paper-execution-engine.ts:184-188` (self-handler, mode-filter only) — UNCHANGED
   - `c13-validation-service.ts:103-107` (collection into `session.tradeCloses`) — UNCHANGED
   - `c14-validation-service.ts:123-127` (collection into `session.tradeCloses`) — UNCHANGED

**Pattern:** Additive optional field. Zero handler breakage. Same C-7 doctrine as PromotionEvent — consumers that need to disambiguate read it, consumers that don't are unaffected.

**LOC:** ~10 (1 interface field + 1 emit-site line + ~8 comment).

**Acceptance:** TradeClosedEvent payload contains `assetClass: 'crypto_spot'` for crypto closes + `assetClass: 'xstock_spot'` for xstock closes when WIRE-IN flips active trading. Verified by regression-lock test (CHUNK E).

### CHUNK B — Position-record SSOT cleanup at outcomeFeedback hook

**File:** `server/services/paper-execution-engine.ts`

**Changes:**
1. Line 1376: replace `const _assetClass = safeResolveAssetClass(position.symbol, 'kraken');` with `const _assetClass = position.assetClass ?? safeResolveAssetClass(position.symbol, 'kraken');` — read record first, safeResolve fallback (defensive for legacy positions without the field).
2. Comment annotation documenting the SSOT pattern (write at entry line 2147, read everywhere else).

**LOC:** ~3 line change + ~5 comment.

**Acceptance:** Outcome-feedback hook prefers position.assetClass read; only falls back to safeResolveAssetClass when record field is missing. Regression-lock test asserts the read path (CHUNK E).

### CHUNK C — Diagnostic endpoint payload extension (KEEP URL per Langston Q3)

**File:** `server/routes.ts` (existing `/api/diagnostics/orchestrator-per-class-state` endpoint added in ORCHESTRATOR Step 3)

**Changes:**
1. KEEP URL `/api/diagnostics/orchestrator-per-class-state` (Langston Q3 ACK — continuity > misleading-URL-cost; the URL becomes slightly misleading as scope expands but breaking-change cost is higher than aesthetic cost).
2. Restructure response payload to nested-by-layer top-level keys:
   ```jsonc
   {
     "orchestrator": {
       "crypto_spot":  { "FINAL_SCORE_FLOOR": 0.45, "MAX_POSITION_PCT": 0.15 },
       "xstock_spot":  { "FINAL_SCORE_FLOOR": 0.45, "MAX_POSITION_PCT": 0.50 },
       "crypto_perp":  { "status": "CLASS_NOT_WIRED", "reason": "…" },
       "xstock_perp":  { "status": "CLASS_NOT_WIRED", "reason": "…" }
     },
     "execution": {
       "crypto_spot":  { "openPositions": <int>, "recentCloses24h": <int>, "feePercent": 0.26, "slippagePercent": 0.05 },
       "xstock_spot":  { "openPositions": <int>, "recentCloses24h": <int>, "feePercent": 0.26 /* SHARED-CRYPTO-WILDCARD, see §3 */, "slippagePercent": 0.05 /* SHARED-CRYPTO-WILDCARD */ },
       "crypto_perp":  { "status": "CLASS_NOT_WIRED" },
       "xstock_perp":  { "status": "CLASS_NOT_WIRED" }
     },
     "_meta": {
       "schemaVersion": 2,
       "coverage": ["orchestrator", "execution"],
       "lastReviewed": "2026-05-27",
       "knownGaps": [
         "fee/slippage dispatch is class-member wildcard (paper-execution-engine.ts:126-127); per-class dispatch deferred to Phase 25/26 calibration",
         "sizing-core risk-pct/max-position-pct mode-keyed not class-keyed; deferred to Phase 25/26"
       ]
     }
   }
   ```
3. Document the URL-vs-scope mismatch + nested-by-layer doctrine in System Manual §6.x (CHUNK F).

**LOC:** ~40 (mostly composing the execution-layer state object from existing storage queries).

**Acceptance:** GET returns nested-by-layer payload; old top-level keys NOT preserved for backward-compat (zero callers per ORCHESTRATOR Step 1.a probe — cheap break). Test asserts nested shape (CHUNK E).

### CHUNK D — System Manual §6 diagnostic-endpoints docs (reusable doctrine callout — kept distinct from F #4 per Langston A1)

**File:** `1-system-manual/SYSTEM_MANUAL.md` §6.x (diagnostic endpoints subsection — distinct callout)

**Changes:**
1. Add subsection documenting `/api/diagnostics/orchestrator-per-class-state` URL retention with expanded scope. Note: URL says "orchestrator" but payload covers orchestrator + execution + future layers. URL kept for continuity per B79.0n.EXECUTION Langston Step 1 ACK Q3.
2. Document the **nested-by-layer payload doctrine** for future layer additions (STORAGE, SQE, etc.) as reusable pattern.
3. Document the `_meta.knownGaps` + `_meta.lastReviewed` registry pattern as the canonical place to surface known-but-deferred per-class gaps to operators in real-time.
4. **Cross-reference note:** CHUNK F #4 (§19.7 EXECUTION batch summary) cross-references this §6.x doctrine section — no double-counting of governance work.

**LOC:** ~25 lines of docs.

### CHUNK E — Audit + regression-lock test suite (~8-10 tests)

**File(s):** new test file `server/tests/unit/b79-0n-execution-audit.test.ts` + extension of `server/tests/integration/b79-0n-orchestrator-cascade.test.ts`

**Tests (12 total per Langston A4):**
1. `TradeClosedEvent payload includes assetClass when emitted from xstock close` — assert event.assetClass === 'xstock_spot'
2. `TradeClosedEvent payload includes assetClass when emitted from crypto close` — assert event.assetClass === 'crypto_spot'
3. `c13/c14 listeners do NOT break on additive assetClass field` — assert no thrown, session.tradeCloses receives the event
4. `outcomeFeedback hook prefers position.assetClass read when available` — assert no safeResolveAssetClass call when position.assetClass is set
5. `outcomeFeedback hook falls back to safeResolveAssetClass when position.assetClass missing` — defensive path for legacy positions
6. `diagnostic endpoint returns nested-by-layer shape` — assert top-level keys `orchestrator` + `execution` + `_meta`
7. `diagnostic endpoint _meta.knownGaps includes fee/slippage + sizing-core deferral notes` — assert these stay surfaced
8. `entry-side assetClass population at line 2147 is canonical SSOT` — assert createPaperSimOpenPosition receives correct class for AAPLx/USD vs BTC/USD
9. `end-to-end AAPLx/USD trade open → close → outcomeFeedback uses xstock_spot key only` — semantic correctness across full lifecycle (integration test extension)
10. `crypto regression: BTC/USD trade open → close → outcomeFeedback uses crypto_spot key only` — guard against cross-class drift
11. **NEW per Langston A4:** `diagnostic endpoint execution-layer surfaces feePercent + slippagePercent values for crypto_spot AND xstock_spot` — schemaVersion 2 self-describing under test
12. **NEW per Langston A4:** `diagnostic endpoint surfaces CLASS_NOT_WIRED status for crypto_perp + xstock_perp` — guard against accidentally dropping not-wired variants in payload restructure

**LOC:** ~240 net new lines of test code.

### CHUNK F — Governance updates (Tier 1 + Tier 2 per CLAUDE.md §3)

**Files (8 docs per Kyle PATTERN-DETECT directive):**
1. `1-system-manual/BATCH_CATALOG.md` — add B79.0n.EXECUTION row
2. `1-system-manual/PHASE_HISTORY.md` — Phase 15c continuation entry
3. `1-system-manual/SYSTEM_IMPACT_MAP.md` — paper-execution-engine + event-bus + routes update (Recent additions section)
4. `1-system-manual/SYSTEM_MANUAL.md` — new §19.7 "B79.0n.EXECUTION" + §6.x diagnostic endpoints update (CHUNK D)
5. `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — close EXECUTION row
6. `1-system-manual/CHANGES_AND_FIXES.md` — CLOSURE-2026-05-XX entry
7. `1-system-manual/RUNNING_ISSUES.md` — new entries for fee/slippage dispatch deferral + narrative-feed dormancy + position-SSOT pattern audit
8. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — new §4.23 "Additive event-payload field pattern (TradeClosedEvent C-A)" — same doctrine as PromotionEvent C-7 from RTB; documents when this is safe (no exhaustive switch, no keyof enumeration) and when it's not. **PLUS new §4.24 "Deferred-gap registry closure rule" (per Langston A3):** when closing a gap surfaced in `_meta.knownGaps` (e.g. Phase 25/26 fee/slippage dispatch, sizing-core per-class risk-pct), the closure batch MUST remove the entry from the live endpoint payload AND bump `_meta.lastReviewed`. Without this rule the registry drifts and operators see stale "gap" claims after closure.

**Plus:** Phase 24 standing rule — completion report MUST include "Asset-class onboarding workflow learnings" 4-section block.

### CHUNK G — Local tsc + vitest + check-tsc-baseline verification gate

**Pre-push gate (acceptance criteria per Langston A6):**
- **AC-G1:** `cd /c/dev/DawnTraderV3 && npx tsc --noEmit` produces 494/494 baseline-unchanged — additive `assetClass?: string` field must not introduce new errors at any consumer. Hard-fail if delta != 0.
- **AC-G2:** `cd /c/dev/DawnTraderV3 && npx vitest run server/tests/unit/b79-0n-execution-audit.test.ts server/tests/integration/b79-0n-orchestrator-cascade.test.ts` — all 12 new tests green + integration test extension green.
- **AC-G3:** `npx tsx scripts/check-tsc-baseline.ts` — baseline manifest unchanged.
- **AC-G4:** CI all-4-green confirmation per CLAUDE.md §5 #19 before close — TypeScript Check + Test Suite + Build + Docker Build.

---

## §3. OUT of scope (deferred, with rationale)

| Item | Why deferred | Target phase |
|---|---|---|
| Sizing-core risk-pct / max-position-pct per-class | Calibration concern (needs evidence-derived values, not placeholders) | Phase 25 (archive-replay where possible) or Phase 26 (live evidence for xstock) |
| Fee/slippage dispatch per-class (paper-execution-engine.ts:126-127 class members) | Same logic — needs evidence-derived per-class values | Phase 25/26 calibration |
| Pre-execution validator goal-alignment + strategy-profile per-class | C-8 §3.4 wildcard lock — class-invariant today, EXISTS-gated divergence requires evidence | OBSERVABILITY (#16) bundle or Phase 26 |
| Trading-engine (live) per-class | Dormant per SIM §6.2 | Phase 19a |
| MicroExecutionService per-class | Dormant per SIM §6.6 | Post-launch (if ever activated) |
| Defense-in-depth weekend-pause at trade-open boundary | Upstream SQE filters weekend xstock signals; engine-boundary belt-and-suspenders not required | Defer indefinitely |
| Narrative-feed TRADE_OPENED/TRADE_CLOSED payload assetClass | No production emit path today; narrative-feed is dormant | Future narrative-feed activation batch (no current target) |

---

## §4. Size estimate (honest per Langston A6)

- **Production LOC:** ~50-60 (CHUNK A interface field + emit-site = ~10; CHUNK B SSOT cleanup = ~3 line + comment; CHUNK C route payload restructure = ~40 — was conservatively undercounted in v1)
- **Test LOC:** ~240 net new lines across 12 tests (per Langston A4 addition)
- **Docs LOC:** ~80 across 8 governance files (§19.7 + §6.x callout + §4.23 + §4.24 + 6 other doc rows)
- **Duration:** 1-2 days (unchanged — work envelope is correct, LOC accounting is just more accurate)
- **Risk profile:** LOW — additive optional field (PromotionEvent C-7 pattern), single drift cleanup, payload restructure with **zero existing callers verified across full repo per Step 1.b grep** (client/, server/tests/, scripts/, governance docs only — no production caller)

---

## §5a. CC answers to Langston Step 1 informationals (A5)

**A5-Q1: Narrative-feed dormancy — re-review trigger?** RUNNING_ISSUES entry (added in CHUNK F #7) will carry trigger condition: "Re-review when narrative-feed activation is scoped OR at next annual dormancy audit (whichever first)". Prevents stale-entry drift.

**A5-Q2: Weekend-pause defense-in-depth — upstream SQE filter class-aware or symbol-list-based?** Step 1.b probe finding: `server/services/session-lifecycle-controller.ts:48` imports `isXstockMarketOpenUTC` from `server/asset_classes/xstock_spot/market-hours.js`. The weekend-pause IS class-aware (per-class market-hours module owns the window definition) — NOT symbol-list-based. Generalizes naturally to future weekend-paused classes (commodities, FX, etc.) — each new class plugs in its own `market-hours.js`. Engine-boundary belt-and-suspenders correctly defer-able for EXECUTION; no PATTERN-DETECT class-onboarding implication.

## §5b. Asks for Langston Step 1 review

**A1.** Does §2 chunking ACK as scope v1? Any chunk you want collapsed, split, or reordered?

**A2.** CHUNK A pattern audit — happy with the additive-optional doctrine + zero-handler-change empirical (3 listeners verified mode-filter-only and collection-only)? Or want a stricter pre-cutover assertion?

**A3.** CHUNK C `_meta.knownGaps` registry — happy with documenting deferred per-class gaps in the live endpoint payload? Or prefer documenting in System Manual only with the endpoint just returning the live state? My lean: keep `_meta.knownGaps` in the payload — operators reading the diagnostic in real-time see what's promised vs deferred without having to consult docs.

**A4.** CHUNK E test count — 10 tests proposed. Cover the right surfaces? Anything to add or trim?

**A5.** §3 deferral list — anything you want pulled INTO EXECUTION instead of deferred? Or anything to flag as a tighter SLA?

**A6.** Anything else worth catching in scope before Step 2 pre-audit?

**Reply format:** numbered point-by-point on A1-A6 is fine. If you ACK clean, CC proceeds to Step 2 pre-audit drafting.

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b79-0n-execution/B79_0n_EXECUTION_SCOPE.md` after SCP. Embedded snippets above are sufficient for the code-review-style elements. Use `ssh staging` only for anything beyond the scope content (none expected at Step 1 review).
