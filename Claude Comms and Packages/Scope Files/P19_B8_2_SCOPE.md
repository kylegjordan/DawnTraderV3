# P19-B8.2 SCOPE — Balance policy: Kraken-mirror start, auto re-anchor, ratio-tag, dollar-agnostic fence

change-class: architecture

**Batch:** P19-B8.2 (second sub-batch of the P19-B8 arc) · **CC-B** · Step-1 draft 2026-07-05
**Basis (all committed + locked):** `P19_B8_DESIGN_INTENTIONS_v1.md` §4 + CONSENSUS ADDENDUM (Kyle decisions A/A/A) · `P19_B8_BALANCE_POLICY_FIELD_RESEARCH.md` (13 sources) · OLD Claude's calibration constraints (Discord 2026-07-05, five points, quoted in OBJ-4) · the Step-1 architectural read (2026-07-05).
**Sequencing note:** B8.1 = deployed, pending Kyle self-verification (his 24h window); B8.2 proceeds in parallel per his directive. Nothing in B8.2 alters the deployed B8.1 surfaces except OBJ-6 (server response harmonization) and the start-modal flow.

---

## §A — THE FRICTION ESTIMATOR (first, per Langston's declared first-read)

**Purpose:** the auto re-anchor trigger (Kyle decision #1) must fire on measured EXECUTION-QUALITY divergence, not a balance multiple. This is the instrument.

**Model (square-root impact law, per the field-research pass):** estimated execution cost of an order of quote-notional `Q` on an asset with liquidity `L`:
`estCostBps(Q) = spread_half_bps + k_class × σ_class × √(Q / L)`
- `L` per class: **crypto** = rolling ADV proxy (`volume24h` at signal time, the same figure the pipeline already carries) with top-of-book depth (the WS mini-book `getBookForFill` read) as the intraday floor; **xStock** = the `xstock_qd_probe_history` rolling top-of-book depth (the B5c capture built exactly for this) with `market-volume-cache` ADV.
- `σ_class` = the volatility figure the slippage-fee-model already estimates; `spread_half_bps` from the same cost-metrics read the maker/taker decision uses. NO new data feeds — every ingredient verified present (read §6).
- **Divergence** = `estCostBps(paperTypicalOrder) − estCostBps(liveTypicalOrder)` where typicalOrder = risk%-sized order at each balance. PLUS the discrete leg: min-notional floors binding differently at the two balances (count of pool candidates blocked for one balance but not the other).

**Trigger (per-class, DB-governed — ADJUSTMENT_FRAMEWORK-registered knobs, rule 15 no hardcode):**
`module_constants friction_divergence`: `max_divergence_bps` (per assetClass), `min_notional_delta_max` (count), `eval_cadence` (per open + a daily aggregate). Crossing either bound → **AUTO RE-ANCHOR** (Kyle decision #1: triggered, not advisory): portfolio_state.balance := live Kraken balance, anchor-version increments, an info-severity system-alert + Discord note announces it plainly. Seeds are CONSERVATIVE PLACEHOLDERS pending Phase-25 calibration — stated as such (§9.2 discipline; no vibe numbers presented as calibrated).
- **Implementation shape:** a PURE module `server/core/math/friction-divergence.ts` (no I/O; inputs passed in) + a thin resolver for the knobs + one call site at trade-open (cheap: reuses already-fetched cost metrics) + a daily aggregate row for the B8.3 dashboard.
- **Re-anchor ≠ learning reset, structurally:** the re-anchor writes balance + anchor-version ONLY. Nothing in the learning/calibration path reads portfolio balance (that's exactly what OBJ-5 proves), so the separation is by construction, then verified by the fence test.
- **Launch-snap hook (Kyle decision #2):** the same re-anchor routine exposed as `reanchorToLive(reason)`; Phase-21's go-live sequence calls it once. Built + tested now, invoked at Phase 21.

## Objectives

### OBJ-1 — Kraken-mirror start flow
`mode='new'` start: fetch the REAL account balance via the EXISTING authenticated `KrakenService.getAccountBalance()` (kraken.ts:441 — private `/0/private/Balance`, signed, 60s cache; verified present) → display READ-ONLY in the start modal → confirm → start with that balance. NO free-text override (Kyle lean + field research S2/S4). **Fail-hard:** Kraken unreachable/keyless → start REFUSED with a plain-language error; NO fallback to persisted balance or any literal. `mode='continue'` — UNTOUCHED: resumes the persisted paper balance, never calls Kraken (an outage never blocks resume). The currently-disabled `/api/active-engine/confirm-balance` NO-OP endpoint (read §2): retire it (rule 18) — its modal flow is replaced by the read-only mirror confirm.
**Verify:** start-new on staging fetches + displays the real balance; pulling the network/key yields the refusal (not a ghost); continue path untouched (regression: resumes prior balance with zero Kraken calls in the log).

### OBJ-2 — Ghost-default deletion, ATOMIC with OBJ-1 + resume hardening (AC1 leg-1 home)
Delete ALL SEVEN enumerated ghosts (read §3): schema defaults `portfolio_state.balance "1000.00"` + `activeEngineSessions.startingBalance "10000"` (→ NOT NULL, migration with IF-EXISTS discipline **+ an explicit pre-migration NULL-row check: enumerate + disposition any existing NULL rows BEFORE the constraint lands** [Langston Step-1 watch-item]), routes.ts `:800` (:11293), `:10000` (:5408), `'1000'` (:12274), client `800`s (paper-trading-controls) — replaced by the OBJ-1 flow or honest absence. **Resume hardening — LAYERING RESOLVED (Langston Step-1 CHANGES-NEEDED):** the fail-loud invariant is OWNED BY THE APPLICATION LAYER — `resumeActiveEngines`/`ActivePortfolioManager.start()` refuses (plain error + alert, zero writes) whenever the balance is absent, NULL, or unparseable, BEFORE any engine state is touched; the schema NOT NULL constraint is the defense-in-depth BACKSTOP against future bad writes, not the invariant's home. **Test construction (both absent-balance shapes):** (a) MISSING-ROW case — constructible post-migration without violating NOT NULL: no portfolio_state row / no session row for the mode → integration test on the real DB asserts refusal; (b) NULL-IN-COLUMN case (legacy/corrupt read) — unit test with a stubbed storage read returning `startingBalance: null` → asserts the same refusal path. Staging verify uses shape (a). **The AC1 CI-rehydration leg ships HERE:** an integration test that seeds session+positions in the test DB, constructs a FRESH engine instance, calls resumeActiveEngines, asserts full state rehydration (positions, session id, balance) — kills the #404 dormant leg. (AC1 leg-2, the deliberate live restart with real positions, stays in B8.4 as the switch-on gate.)
**Verify:** grep-zero on the ghost literals; migration applied after a clean NULL-row precheck; both refusal tests green; the missing-row refusal reproduced on staging.

### OBJ-3 — Friction-divergence estimator + auto re-anchor (per §A)
Pure module + knobs + open-seam call + daily aggregate + the re-anchor routine + launch-snap hook + the announce path. ADJUSTMENT_FRAMEWORK gains the knob spec (registration is part of THIS batch's governance, not deferred).
**Verify:** unit tests on the pure module (monotonicity in Q, class separation, threshold edges); knob resolution fail-hard; a staged synthetic trigger (knobs temporarily tightened on staging) executes one full re-anchor: balance snaps, anchor-version increments, learning tables untouched (row-count + checksum proof), alert fires; knobs restored.

### OBJ-4 — Balance-ratio-at-open tag (OLD Claude's five constraints, verbatim adopted)
(1) STORAGE: stamp the RAW numeric ratio ONCE at open — same-vintage discipline (the `di_at_queue` precedent) — **together with the anchor value/version it was measured against** (his re-anchor trap: a later re-anchor must never reinterpret history); decimal columns carried open→closed sink; pre-B8.2 rows = honest NULL (the fee-mode NULL rule; never a guessed 1.0); NO stored buckets. (2) READERS: excluded-from-the-calibration-FIT, not excluded-from-learning — out-of-band rows stay fully queryable (they are the 25-16 config-study input). Segment, don't drop. (3) FILTERING: binary in-band/out-of-band with DB-governed band bounds; continuous down-weighting = Phase-25 refinement after the real distribution exists. (4) Anchor stamped with ratio (see 1). (5) **VTS rows: explicit decision — honest NULL** (the VTS has no live-account anchor semantics; its breadth mission is balance-independent) — stated, not defaulted.
**Verify:** first stamped rows carry ratio+anchor; VTS rows NULL; the calibration-reader filter exercised in a unit test.

### OBJ-5 — The dollar-agnostic decision-path fence (mechanical)
The read's 18-threshold enumeration (§5) is the DRAFT input — **the pre-audit RE-VERIFIES every row** (known agent misreads flagged: several guardrails listed as $-violations are ALREADY %-based per the direct schema read of guardrails_v2 — portfolioRiskPerTradePct, dailyLossKillSwitchPct, maxPositionPercentPct, maxTotalExposurePct; the confirmed real $ items are the LPCP $25 min-notional floor [PERMITTED boundary] and whatever the re-verify surfaces). Final classification per the locked formulation: PERMITTED boundary (order-sizing notional, exchange min-notional/min-order, exchange-side fee computation — admission test: "would the exchange reject or mis-size without a real amount here?"), VIOLATION→convert-to-relative (**each individual conversion surfaced to Kyle for sign-off** — his risk knobs, his call), MARKET-FILTER (asset-own volume/price screening — out of fence scope, documented as such). **The fence TEST ships in this batch:** a CI property test asserting no threshold/comparison outside the enumerated boundary carries a raw-dollar term (mechanical — static scan of the enumerated gate modules + a runtime assertion helper; if full automation proves impossible for some gate class, the deliberately-designed manual checklist is DECLARED in the scope review, per the locked condition). RUNNING_ISSUES entry names B8.2 as the fence's home.
**Verify:** the test fails when a seeded $-threshold is introduced into a fenced module (red-proof), passes on the real tree.

### OBJ-6 — #410: filter-diagnostics response harmonization (server-side)
Emit crypto-parity keys from the xStock endpoint (top-level `rolling24h` counters incl. `totalFamilyQualifiedUnique`, aligned family nesting) so the shared panel's dual-shape reads retire; the client shim removed once both endpoints serve the common shape. Schema versions bumped; zero visual change (the panel shows identical data from cleaner plumbing).
**Verify:** both endpoints' shapes diffed; the shim removed; both FD tabs render identically pre/post (visual check).

### OBJ-7 — Workflow close
Bench (tsc baseline + vitest incl. the new CI tests) → Langston Step-4 diff (he declared §A methodology his first read; the fence-test mechanics second) → CI 4-green → deploy → **full visual audit of the changed surfaces (the start-modal flow end-to-end, WITHOUT clicking final Start — switch-on stays B8.4) per Kyle's standing hard requirement** → Langston Step-8 (incl. the synthetic re-anchor proof review) → governance (SIM: friction-divergence module + re-anchor state + ratio-tag columns; SysManual: the balance-policy architecture §; ADJUSTMENT_FRAMEWORK: the knob spec; BATCH_CATALOG/PHASE_HISTORY/PHASE_19_PLAN; RUNNING_ISSUES: fence home + #410 RESOLVED; completion report).

## Out of scope (named)
Per-mode dashboards + three-balances labeling + metrics-strip move + the Live-page mode-badge oddity (B8.3); the switch-on + AC1 leg-2 + AC2 (B8.4); executing the launch snap (Phase 21 — only the hook lands); scenario balances (not built, per the locked design); continuous ratio down-weighting (Phase 25); estimator-knob CALIBRATION (Phase 25 — B8.2 ships conservative placeholders, stated as such).

## Blast radius (from the read)
Server: routes.ts start/confirm-balance region, active-engine-service resume path, storage portfolio-state writes, NEW pure friction-divergence module + knob resolver, schema (2 default-drops + ratio/anchor columns + migration), xstock FD endpoint emission (OBJ-6), kraken.ts UNTOUCHED (consumed as-is). Client: the start-modal flow (ConfirmBalanceModal repurposed → read-only mirror confirm; SimulationStartupModal balance leg), the FD panel shim removal. Engine trading logic (scan/detect/SQE/EV/sizing formulas): UNTOUCHED — the fence only PROVES existing behavior; any actual $→% conversion is Kyle-gated and enumerated separately.

## §B — Langston Step-1 conditions (verdict: PASS + one CHANGES-NEEDED, resolved above; these pins land at pre-audit BEFORE code)
1. **Re-anchor cooldown/hysteresis:** the trigger keys on paper↔live ORDER-SIZE divergence (both sides evaluated from the same anchor-eval read), NEVER on intraday live-balance jitter from fills; and although a re-anchor is self-damping (post-snap divergence collapses), a DB-governed `min_reanchor_interval` knob is ADDED anyway (cheap now vs an anchor-version storm + alert flood discovered in the B8.3 dashboard) — boundary-hover cannot re-fire inside the interval.
2. **"The balance" defined:** `getAccountBalance()` returns PER-ASSET balances — pre-audit pins the exact figure from the real response shape. Working recommendation: free USD (the deployable quote cash) as the mirror figure, with any non-USD holdings displayed alongside for honesty; final pin at pre-audit with the actual API payload.
3. **typicalOrder pinned:** per-open evaluation uses THIS open's real paper order Q vs the risk-EQUIVALENT live order Q — SAME risk% both sides (the configured per-trade risk knob), so the delta is purely the balance-driven Q difference; "typical" is reserved for the daily aggregate (median of the session's opens).
4. **Units:** `k_class·σ·√(Q/L)` resolves to bps (k carries the reconciliation; the module doc states k's units explicitly so the Phase-25 calibrator isn't guessing).
5. **OBJ-4 sequencing:** anchor-version storage (`portfolio_anchor_events` + current version on portfolio_state) lands BEFORE the first ratio row writes — the stamp depends on it.
6. **OBJ-5 fence legs:** static scan = the lead/defensible leg; any gate class the runtime helper cannot cleanly classify gets its manual checklist DECLARED at Step-4 (not discovered at Step-8); no test that passes by not checking.

## Riders
- The read's fence table rows for goals-preset/schema :285-291 are SUSPECTED MISREADS (pre-audit re-verifies against the actual schema — the Core Four are %-based per the direct 2026-07-04 read).
- `resumeActiveEngines` + heartbeat #404 adjacency: the CI leg here is the proof; the heartbeat's session.userId dormant-path gets checked in the same test.
- Anchor-version storage: smallest honest shape = a `portfolio_anchor_events` row (ts, mode, old_balance, new_balance, reason) + the current version id on portfolio_state; decided at pre-audit.
- Kyle sign-off list for any confirmed $→% conversions: assembled at pre-audit, presented BEFORE implementation.
