# P19-B8.5 — Step-2 PRE-AUDIT (THE SWITCH-ON)

**Owner:** CC-B · **Date:** 2026-07-14 · **Scope:** `P19_B8_5_SWITCH_ON_SCOPE.md` rev-2 (Langston Step-1 APPROVED; 4 conditions carried)

## §A — MODE-SCOPING ENUMERATION (Kyle directive 2026-07-14: "paper and live use the same pipes — make sure this doesn't apply to live mode at the same time")
Every B8.5 touchpoint × its live-mode effect, cited — proven, not assumed:

| Touchpoint | Mechanism | Live-mode effect |
|---|---|---|
| **The flip itself** | per-mode `system_context` rows — `isEngineActive` keyed by mode (`active-engine-service.ts:1133/:1160/:1194-1195` distinct paper flags); engine start routes permission-split `trade_live` vs `trade_paper` (`routes.ts:4314`) | ZERO — flipping paper sets the PAPER context row only; live start stays permission-gated + Phase-21-locked (verify the lock's citation at Step-4; #213's gate-bypassing legacy routes were physically deleted P19-B2) |
| **OBJ-8 validate leg** | wired INSIDE the paper open path, explicitly scoped `mode === 'paper'` at the seam (`active-execution-engine.ts:2437`, before `orderPlacer.openOrder`) | ZERO by construction — in live mode the REAL order is the venue contact (validate would be a redundant second API call); the leg no-ops for live, stated in-code |
| **strategy_gates seeding** | `isStrategyEnabledForAssetClass` keys (strategy, assetClass) — MODE-BLIND by design (`canonical-regime-strategy-map.ts:1203-1215`, absent row → default-open) | Seeding all-19 explicit `true` for crypto_spot = today's implicit default made EXPLICIT → zero behavior change in EITHER mode; live-mode row values get their own Phase-21 review (noted in the migration comment) |
| **Kraken-mirror anchor start** | B8.2: per-mode anchor rows; paper start reads live balances READ-ONLY; the live-mode anchor row untouched (proven by B8.2's synthetic re-anchor test — learning counts byte-identical, the paper row isolated) | ZERO — read-only mirror; no live write path |
| **Loss-budget trip / guardrails** | B6.8 per-mode guardrail separation (paper set complete + functional; live structure-present, wiring not required per Kyle 2026-06-16); auto-trip gated on the per-mode `isEngineActive` | trips/guards evaluate per-mode state only |
| **Evidence sink** | `switch_on_shadow_evidence` rows carry mode; writers live on the active path reached only by a STARTED engine | live rows impossible until a live engine starts (Phase 21) |
| **#237 NOT-NULL flip** | DDL on `rtb_signals.asset_class` | mode-neutral schema tightening; applies to any future writer equally (that is its point) |

## §B — THE 14-GATE WALK (evidence per gate)
| # | Gate | Evidence / disposition |
|---|---|---|
| 1 | Test suite green | ✅ standing (bench 2,248/0 at B8.5c close; CI 4-green head) |
| 2 | #153 xstock pattern cap | ◐ interim 0.15 stands (non-binding today; final = Phase-25/#153) — accepted interim per the checklist |
| 3 | #237 NOT-NULL | scheduled INSIDE this batch post-activation on observed-clean soak (OBJ-6 tail) |
| 4 | xStock pricing/staleness fitness | ◐ built (15s freshness + liquid-window + stall watchdog, knobs verified live: `xstock_fill_safety` 5 rows) — LIVE-EXERCISED at STAGE-2 |
| 5 | Kraken validate smoke | **superseded by OBJ-8** — the wired leg IS the real-venue contact; its first live validate round-trip at STAGE-1 discharges the gate with evidence |
| 6 | §19.0.5 capture hooks | pre-filter (`capturePreFilterReject` centralized), RTB TTL, TCL, paper admit — B5-built; VERIFY counters non-zero at STAGE-1 (the funnel v3 + archiver rows are the proof surface) |
| 7 | Loss-budget auto-trip | ✅ proven 2026-06-17 (5-case deterministic force-trip); live close-driven exercise = STAGE-1 watch item |
| 8 | #213 legacy routes | ✅ physically deleted (P19-B2) |
| 9 | Monitoring screens | ✅ built B8.1–B8.4c; §9.3 walk AT the flip (the dormant→alive render is OBJ-2's acceptance) |
| 10 | Crypto pipeline resurrection | B6.5a/b/c/e ✅; the closed-lifecycle proof on real EV inputs = **OBJ-4 of THIS batch** (the renumber made it the switch-on's own exit test; the B6.5e blocker was EV-input math, fixed by B7.2 + B8.5a) |
| 11 | Price-discovery-liveness | ✅ built B6.6, `enabled=true` for xstock_spot (verified live in module_constants) |
| 12 | **strategy_gates non-empty** | **FLIP BLOCKER, closes at Step-3:** crypto_spot = ZERO rows verified (xstock 19 rows / 9 true). Seed 19 explicit `true` rows for crypto_spot (exploration posture: full set trades in paper for data; the two sub-1.0-RR strategies stay flagged-for-watch per 25-19, NOT pre-disabled) + a startup ASSERT-NON-EMPTY per flipped class (fail-loud, no silent default-open for an active class) |
| 13 | Fill-quality gates per class | ✅ crypto depth gate knobs (4 rows) + xstock depth (4 rows) + xstock liveness `enabled` — all verified live in module_constants |
| 14 | Paper guardrail set | B6.8 shipped; FUNCTIONAL verify at STAGE-1 (settings render + a guardrail edit round-trips) — §9.3 item |

## §C — OBJ-8 DESIGN (the validate leg)
**Seam:** `active-execution-engine.ts:2437` — immediately BEFORE `this.orderPlacer.openOrder(...)`, scoped `mode === 'paper'`. **Rejection path:** reuses the existing loud pattern at `:2441-2444` with a DISTINCT stage `VALIDATE_REJECTED` (counted via `rtbMetricsService.recordOpenFailed`, archived, funnel-visible) — a paper fill NEVER happens on an order the venue would refuse. **Venue call:** `server/exchanges/kraken/kraken.ts` AddOrder with `validate: true` (method capability confirmed at Step-3; the call carries the REAL order params — pair, side, size, price — and executes NOTHING). **FAIL-MODE (the decision Langston takes as its own dispatch): fail-OPEN on API outage, fail-CLOSED on rejection.** A definitive validate REJECTION drops the open (that's the leg's job). An UNREACHABLE/erroring/timed-out API logs + counts `validate_skipped` and proceeds to the depth-walk — rationale: the depth-walk already guarantees fill honesty; validate adds well-formedness vetting, and a Kraken outage must not silently halt paper learning (the same posture as every other telemetry-adjacent venue call). Skips are VISIBLE (counted + archived) so a chronic skip rate is detectable, never silent. **Budget:** one API call per open attempt; opens are sparse (≤ concurrency caps) — no rate concern.

## §D — strategy_gates seeding (gate-12 close)
Migration seeds 19 rows `('strategy_gates','enabled',true,...)` for crypto_spot × each canonical strategy (SSOT: `STRATEGY_DISPLAY_NAMES`), `ON CONFLICT DO NOTHING`, + rollback + MANIFEST (bare filename). Startup assert: for each asset class whose engine is ACTIVE, `strategy_gates` rows must be non-empty — else fail-loud at engine start (no silent default-open for a trading class). Mode-blind by design (§A row 3).

## §E — AC1 / riders citations
AC1 leg-1 (CI rehydration): `server/tests/integration/telemetry_rehydration_e2e.test.ts` (B8.2-impl-3). Leg-2: deliberate live pm2 restart with open positions at STAGE-1 (byte-identical re-load + zero double-count asserted via DB snapshot diff pre/post). #419/#422/C4/C6 dispositioned at their stage touchpoints. Whole-day telemetry comparisons filter at 2026-07-14T10:14:49Z (FIX-2026-07-14-A).

## §F — Rollback per stage
STAGE-1: stop the paper engine (per-mode context flag) → system returns to VTS-only; the validate leg + seeding are inert with the engine off. STAGE-2: same per class. #237 DDL has its own rollback file. No irreversible step exists before Step-8.
