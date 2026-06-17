# BATCH P19-B6.5d — Asset-Class Stamp Integrity (scope + full audit)

> **Owner of SCOPE + AUDIT:** Claude Old (CC-A). **Owner of IMPLEMENTATION:** Claude New (CC-B) — Kyle directive 2026-06-17 (CC-A scopes, CC-B implements, so the two sessions don't collide on the shared tree).
> **Status:** Step-1 scope draft → Langston Step-1 review → hand to CC-B to implement (Step-3+) when it frees from B6.5c. NOT committed by CC-A.
> **Origin:** the live `classify-fallthrough-active` critical alert (`A/EUR@kraken` dropped on the active path). Investigating it surfaced a structural issue, NOT a one-off. Kyle directive 2026-06-17: **NO temporary patches** — find every place the asset class fails to follow the pair and fix them all in ONE real batch.

---

## PROVENANCE — the 26 re-derive sites were left DELIBERATELY by P19-B4a; B6.5d is the NAMED completion (Kyle asked 2026-06-17; history-verified)
Kyle's challenge — "a recent batch attached asset class to the pair; the 26 weren't missed, find why" — is correct. History:
- **The stamp-at-source architecture is P19-B4a (C1+C4)** (Kyle directive 2026-06-14; design `P19_B4a_STAMP_AT_SOURCE_rev1.md` + `P19_B4a_C4_CLASSIFY_HARDENING_rev1.md`; report `P19_B4a_COMPLETION_REPORT.md`), built on B69 (taxonomy + the "read the row, never re-resolve" note `asset-classes.ts:511-513`), B79.0f (collision gate), B79.0n.STORAGE (`SQEInput.assetClass` REQUIRED), P19-B3a (safe-resolve + `CRYPTO_SPOT_BASE_MAX_LEN`).
- **B4a-C4 CONSCIOUSLY scoped itself to the ~10 THROWING active-path sites with an adjacent stamp** (Langston-ratified): "6 of 10 have an upstream assetClass STAMP right next to them → prefer-stamp; the remaining 4 have no stamp → safe-skip/block." Everything else was intentionally out of that frame.
- **The 26 are NOT bugs-as-a-class:** (a) the **14 passive/VTS** sites are correct-by-design (resolve-once-at-entry, no upstream stamp, telemetry-acceptable — "Langston A3") → **B6.5d LEAVES them (OBJ-6); do NOT 'fix' them**; (b) crypto-only re-derives are **correct today** (hardcoded `kraken` is right for the crypto pipe — the error is latent, only a collision ticker via the xStock pipe misroutes, dormant until B7b); (c) the 2 kernel/leaf sites (`expectancy.ts:563`, `feePercentFor:155`) are an **explicit verbatim "future batch" deferral** in the code (`expectancy.ts:557-562`); (d) `SQE:227` is a scope-FRAME artifact — C4 keyed on THROWING sites and :227 already used the non-throwing `safeResolveAssetClass`, so it fell just outside C4's net (latent, not a live bug).
- **B6.5d IS that named future batch.** OBJ-4 is precisely the kernel-thread the `expectancy.ts:559` comment names; OBJ-3 finishes the prefer-stamp propagation; OBJ-1 is the NEW single-letter resolver gap (the live `A/EUR` trigger, distinct from the latent collision exposure). **B6.5d does not contradict B4a — it completes B4a's explicit deferral under the NO-PATCHES directive.**
- **Step-4 note:** B4a-C4 claimed "6 of 10 throwing sites → prefer-stamp," yet the audit still finds the 4 `signal-orchestrator.ts` throwing sites (1510/1692/2038/2142) re-deriving — reconcile B4a's exact converted-set vs the current state at Step-4 (likely those were the "no-stamp→safe-skip" four or out-of-frame; confirm none were converted-then-regressed).

---

## STEP-1 RECONCILIATIONS (Langston review 2026-06-17 — APPROVE-structural / CHANGES-NEEDED, all folded in)
- **§A1 inventory gap FIXED:** `ready_to_buy_service.ts:1243/1256` were in the §5 inventory but missing from OBJ-3's actionable list → added as OBJ-3 item 11 (OBJ-3 covers ~12 distinct call sites, not "10").
- **§A2 double-list RESOLVED:** `ready_to_buy_service.ts:1562` is USES-STAMP for its PRIMARY path (`asValidAssetClass(signal.assetClass) ?? …`); its issue is only the **tail `?? 'crypto_spot'` default**, which OBJ-5 (active-path) removes. Not a re-derive site; the silent tail-default is the only thing to fix there.
- **§A3:** at SQE:227 the OBJ-3 stamp-SWAP **replaces** the `?? 'crypto_spot'` default — ONE edit (noted in OBJ-3 + OBJ-5).
- **§B OBJ-5 SETTLED:** remove silent defaults — active = fail-closed + per-pair alert; passive = logged/counted (never silent). Instrument the OBJ-3 `??` fallback (`stamp-missing-active`).
- **§C OBJ-6 SETTLED:** leave-and-document the 14, EXCEPT swap the 2 throwing-variant passive sites (`market-context-engine.ts:1442`, `vts-service.ts:341`).
- **§D:** each SWAP asserts the stamp field is non-null at that point (folded into OBJ-3).
- **§E grep-method CONFIRMED (CC-A verified):** the audit keyed on the FUNCTION NAME; `resolveAssetClass`/`safeResolveAssetClass` both take `exchange` as a REQUIRED positional (no default-exchange call form possible), and there are NO aliased imports — so no call site was invisible to the sweep. `rtb-refresh-service.ts:344/348` is treated as ACTIVE-reachable (OBJ-5).
- **§F:** OBJ-5/6 decisions fold INTO the relevant implementation passes (not sequenced after); OBJ-1 tests ship WITH OBJ-1.
- **§G substantive risk → test (CC-A verified the order today):** collision-precedence is asserted in OBJ-7 (COLLISIONS checked before the widened crypto canonical).

---

## 0. The invariant (the thing this batch enforces everywhere)
**One SizingContext = one asset class = one pipe; the asset class is STAMPED at the pipe entry and CARRIED with the pair — it must NEVER be re-derived from the symbol string downstream.** (Already documented in `shared/asset-classes.ts` header + `signal-orchestrator.ts:191`.) The bug class: 26 sites ignore the carried stamp and re-derive via `safeResolveAssetClass(symbol, 'kraken')` / `resolveAssetClass(symbol, 'kraken')`, hardcoding the exchange — which mis-handles collision tickers (A=Vaulta/Agilent, T=Threshold/AT&T, + the 9 USD/8 EUR `XSTOCK_SPOT_KRAKEN_COLLISIONS`) and single-letter bases.

## 1. Stamp source of truth (what the re-derive sites SHOULD read)
- **Crypto pipe:** `signal-orchestrator.ts:1352-1361` → `sizingContext.assetClass = 'crypto_spot'`.
- **xStock pipe:** `xstock_spot/active-dispatch.ts:194/207` → `sizingContext.assetClass = 'xstock_spot'`.
- Propagated by `buildSizedSignalForStrategy` (`signal-orchestrator.ts:437-509`) onto the sized signal → `rtb_signals.asset_class` (`schema.ts:1885`) → position/trade rows → `signal.metadata.assetClass`. **So a stamped field is in scope at every SWAP site below.**

## 2. Numbered objectives + verification

### OBJ-1 — Single-letter ticker recognition (clears the live alert; resolver-PATTERN change, not a quality floor)
Widen the 3 resolver base floors from `{2,…}` to `{1,…}` via **MIN_LEN constants** (mirroring the existing `CRYPTO_SPOT_BASE_MAX_LEN`):
- `CRYPTO_SPOT_CANONICAL` `asset-classes.ts:496` `{2,15}`→`{1,15}`
- `XSTOCK_SPOT_DISPLAY` `asset-classes.ts:195` `{2,5}`→`{1,5}`
- `XSTOCK_PERP_RAW` `asset-classes.ts:188` `{2,6}`→`{1,6}` (no live single-letter xStock perp — label that test synthetic/forward-looking)
- **Verify:** `resolveAssetClass('A/EUR','kraken') === crypto_spot` (clears the alert), `'T/USD'` likewise; empty base `/USD` still throws; ceiling 15-ok/16-not stays green.

### OBJ-2 — Per-pair classify-fallthrough alert key
`server/index.ts:265` static `dedupe_key:'classify-fallthrough-active'` → per-pair `classify-fallthrough-active:${symbol}@${exchange}` (the hook already receives both args). Stops a distinct unclassifiable pair from being suppressed behind the first.
- **Verify:** two distinct unclassifiable pairs produce two alerts.

### OBJ-3 — SWAP the 10 stamp-available re-derive sites to prefer the carried stamp
Convert each to `asValidAssetClass(<in-scope stamp>) ?? safeResolveAssetClass(...)` (model: `paper-execution-engine.ts:2122`). Kills the latent xStock misroute AND the throwing-variant crash at once. The 10 (file:line → stamp to read):
1. `signal_quality_evaluator.ts:227` → `input.assetClass` (REQUIRED at :106) — **the SQE gate; highest value**
2. `routes.ts:11835` → `pos.assetClass` (also switch off the THROWING variant)
3. `routes.ts:12165` → `position.assetClass` (throwing)
4. `pre-execution-validator.ts:148` → `request.signal.assetClass` / `metadata.assetClass`
5. `signal-orchestrator.ts:1510` → `sizingContext.assetClass` (throwing)
6. `signal-orchestrator.ts:1692` → `sizingContext.assetClass` (throwing)
7. `signal-orchestrator.ts:2038` → `sizingContext.assetClass` (throwing; ORB xstock gate)
8. `signal-orchestrator.ts:2142` → `sizingContext.assetClass` (throwing; NetEV)
9. `paper-execution-engine.ts:1756` + `:2758` → `signal.metadata.assetClass`
10. `paper-execution-engine.ts:2784` (+ `:1760`) → `p.assetClass` (positions carry the stamp)
11. **`ready_to_buy_service.ts:1243`** → group-by `s.assetClass`; **`:1256`** → `bestSignal.assetClass` (AMR shadow grouping — were in §5 inventory but missing from this actionable list; Langston §A1). *(So this OBJ covers ~12 distinct call sites, not "10".)*
- **REQUIREMENT (Langston §D):** at EACH swap site, ASSERT the named stamp field is actually **non-null at that point** (not merely in scope) before trusting the `??`-left side — SQE's `input.assetClass` REQUIRED@:106 is the bar; apply the same check to the rest.
- **INSTRUMENT the `?? safeResolveAssetClass` fallback branch on active money sites (Langston §B):** emit `stamp-missing-active:${symbol}` — a missing stamp THERE is itself a pipe-entry bug; do NOT silently re-derive with hardcoded kraken (else OBJ-3 quietly reintroduces the OBJ-5 problem).
- **Verify:** at each, a collision ticker with an xstock_spot stamp resolves xstock_spot (not crypto); a unit test on the SQE gate (A/USD stamped xstock → xStock gate runs; A/EUR stamped crypto → crypto). No throwing variant left on an active-path money/route site.

### OBJ-4 — THREAD the 2 active-path sites that have no stamp in scope
1. `expectancy.ts:563` (`evaluateTradeExpectancy`) — add an `assetClass` param to the signature (+ `TradeMeta`), thread from all callers (which hold the stamp). Removes the in-code "future batch" deferral comment. Pricing/EV correctness for collisions.
2. `paper-execution-engine.ts:155` (`feePercentFor(symbol)`) — add an `assetClass` param; every caller already holds `asValidAssetClass(signal.metadata.assetClass)`. Money-boundary fee correctness.
- **Verify:** the threaded param is used (no internal re-derive); EV/fee correct for a collision ticker by class, not symbol.

### OBJ-5 — Remove silent `?? 'crypto_spot'` defaults (SETTLED Langston Step-1: REMOVE — no truly-silent default anywhere)
- **ACTIVE path** (`signal_quality_evaluator.ts:227`, `ready_to_buy_service.ts:1562` tail-default, `paper-execution-engine.ts:2229`, `rtb-refresh-service.ts:344/348` hardcoded crypto_spot — **treat rtb-refresh as ACTIVE-reachable** per Langston §E): **REMOVE the default, FAIL-CLOSED** — skip the signal + emit the OBJ-2 per-pair alert. An unclassifiable symbol on a money path must drop LOUDLY, never be masked as crypto and routed into the crypto pipe with crypto fees/sizing (rule #10 no-silent-fallback + #11 NO-PATCHES).
- **PASSIVE/VTS path** (`vts-runner.ts:1999/2667/3690/3781`): replace the silent default with a **logged/counted** default (or a `null`/`unknown` label) — keep fail-soft if needed but make mislabeled telemetry DETECTABLE, never silent (a silent crypto label poisons ML training data).
- **At SQE:227 the OBJ-3 SWAP REPLACES this default — ONE edit, not two** (don't leave the `?? 'crypto_spot'` dangling after the stamp-swap).

### OBJ-6 — Passive VTS THREAD sites (14) — LEAVE-AND-DOCUMENT (SETTLED Langston Step-1), EXCEPT swap the 2 throwing variants
**LEAVE the 14 as-is** (resolve-once-at-entry, correct-by-design for telemetry; threading a non-existent upstream stamp is invasive plumbing for zero money-correctness gain + telemetry-regression risk). They get OBJ-1 single-letter accuracy for free (same resolver). **DOCUMENT them in SIM (§18)** so a later grep doesn't read as a missed sweep.
**EXCEPTION — swap exactly these 2 (they are in the §5 THROWING-variant list; a throw crashes the cycle even on the passive path):** `market-context-engine.ts:1442` and `vts-service.ts:341` → safe NON-throwing `safeResolveAssetClass` variant (NO stamp threading — a targeted crash-fix that completes the §5 "remove all throwing variants" goal).

### OBJ-7 — Tests
- **OBJ-1 resolver tests land WITH OBJ-1** (Langston §F — it ships first as the alert-clearing change; it cannot go in untested).
- **★COLLISION-PRECEDENCE assertion (Langston §G — the substantive risk):** assert `XSTOCK_SPOT_KRAKEN_COLLISIONS` is consulted **BEFORE** the now-permissive single-letter `CRYPTO_SPOT_CANONICAL` (verified order today: DISPLAY → COLLISIONS → SYMBOLS → CANONICAL → raw), so the floor-widen can't let a single-letter crypto match shadow the xStock collision map. Test as the ORDER assertion, not just "A/EUR → crypto".
- **★Confirm no upstream relies on single-letter rejection as a malformed-symbol filter** — the widen now passes single-char garbage (e.g. `Z/USD`) through as crypto; verify nothing depended on the old reject.
- Case-sensitivity assertion: `XSTOCK_SPOT_DISPLAY` lowercase-`x` is case-sensitive and nothing upcases before it — note `fx5-scanner.ts:130` upcases; confirm the xStock path does not feed it pre-upcased.
- Single-letter crypto + xStock, BOTH collisions A/T explicitly (`A/EUR`→crypto, `Ax/USD`→xStock; `T/USD`→crypto, `Tx/USD`→xStock); empty base `/USD` still throws; ceiling 15-ok/16-not stays green.
- Stamp-preference tests at the SWAP sites (incl the non-null assertion); assetClass-param tests for the 2 THREAD'd functions; per-pair dedupe test.

### OBJ-8 — Governance (apply applicability explicitly)
- **SIM (content):** the classifier's matchable universe changed + the stamp-integrity invariant + per-pair dedupe is cross-cutting alert state → SIM content touch.
- **System Manual (content):** the base-length MIN rule + the "never re-derive downstream" invariant belong in the classifier section (the MAX rationale already lives there).
- **PHASE_19_PLAN §1/§5** (Phase-19 sub-batch, §14 temp rule). **DELETED_COMPONENTS_LOG** N/A (no deletions). RUNNING_ISSUES: close the underlying issue.

## 3. Acceptance criteria
- The `classify-fallthrough-active` critical alert (id `58367b27`) **clears post-deploy** and stays clear (A/EUR classifies crypto, flows again). **This is the headline Step-8 gate** (ack the alert only then).
- No active-path re-derive of a stamped pair remains (the 10 SWAP + 2 THREAD done); no throwing-variant on an active money/route site.
- CI all-4-green; bench tsc-no-regression + the new tests.

## 4. Sequencing / dormancy context
xStock active trading is DORMANT (per-class gate default-OFF, B6.5a) → the xStock-collision misroute is LATENT today, so there is no live-misroute emergency, but per NO-PATCHES we fix it all now rather than leave it for B7b. The crypto-default fallbacks (OBJ-5) and throwing-variant crashes (OBJ-3) are the live-fragility items. This batch must land BEFORE B7b xStock-activation regardless.

## 5. FULL AUDIT — 35 resolve call sites (the pre-audit inventory)

**Counts:** 35 sites / 13 files. USES-STAMP (correct): 9. RE-DERIVES (hardcoded kraken): 26 → SWAP 10, THREAD 16 (2 active + 14 passive-VTS).

**RE-DERIVE — SWAP (stamp in scope, one-line fix):** `signal_quality_evaluator.ts:227`, `routes.ts:11835`, `routes.ts:12165`, `pre-execution-validator.ts:148`, `signal-orchestrator.ts:1510/1692/2038/2142`, `paper-execution-engine.ts:1756/2758/2784` (+`:1760`), `ready_to_buy_service.ts:1243/1256`.

**RE-DERIVE — THREAD active (need plumbing):** `expectancy.ts:563`, `paper-execution-engine.ts:155`.

**RE-DERIVE — THREAD passive/VTS (telemetry, correct-by-design, OBJ-6):** `vts-runner.ts:980/1494/1999/2667/3043/3392/3690/3781`, `vts-service.ts:341/963`, `market-indicators.ts:271`, `market-context-engine.ts:1442`.

**USES-STAMP (correct — reference patterns):** `ready_to_buy_service.ts:710/744/981/1562`, `rtb-refresh-service.ts:337`, `paper-execution-engine.ts:1213/1327/1499/2122/2229/2277/2295`.

**Scripts (off live path, intended re-derive):** `scripts/b79-0n-rtb-backfill-asset-class.ts:111` (legacy-row backfill), `scripts/b5-amr-correctness-audit.ts:306` (audit-only).

**THROWING-variant sites (crash a route/cycle on a bad/single-letter symbol — live fragility today):** `routes.ts:11835/12165`, `signal-orchestrator.ts:1510/1692/2038/2142`, `market-context-engine.ts:1442`, `vts-service.ts:341`. OBJ-1 (single-letter widen) + OBJ-3 (swap to safe+stamp) together remove this.

## 6. Handoff to CC-B
After Langston Step-1, this scope + audit is staged to Claude New (it implements Step-3+). CC-A does NOT edit the shared code files (no collision). CC-A remains available for design questions / Langston liaison. Implementation order recommendation: OBJ-1 + OBJ-2 (clears the alert) → OBJ-3 SWAPs → OBJ-4 THREADs → OBJ-5/6 decisions → OBJ-7 tests → OBJ-8 governance.
