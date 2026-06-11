# B-4.7 COMPLETION REPORT — Per-asset-class regime (#162) + canonical map per-class source (#163)

**Closed:** 2026-06-11 (~01:45Z). Interphase item 4.7 (was B-NEW-48). Two chunks, two Step-4 reviews, two deploys per Langston's diff-A ruling (chunk A shipped alone — C1 was bleeding daily).
**Deploys:** chunk A `b8ab812de` (~00:14Z) · chunk B `2c986c231` (~01:03Z). **CI:** all-4 GREEN both pushes (final run **27316654854**). **Step 8:** Langston **CONFIRMED** (independently re-proved the bridge invariant on staging).

## PREVIOUSLY-STATED-VS-NOW (§9.2)
- **PREVIOUSLY: 56 consumer files (#163 entry, grep count 2026-05-31). NOW: 8 production importers re-pointed.** REASON: the 56 was a raw grep over all of /server including tests/comments; the pre-audit's compile-driven probe found the true production import surface.
- **PREVIOUSLY (scope): friction sample floor ≥50 (mixed pool). NOW: ≥10 same-class pool members.** REASON: 50 was sized for the ~250-name mixed pool; 10 same-class sampled books is the honest minimum for the ~75-name xStock cohort. Langston APPROVED with the note that the floor gates fallback selection only — `sampleSize` rides the payload so thin samples are visible.
- **PREVIOUSLY (chunk-B v1): isValidCanonicalCombination over the class-tree union. NOW: over base ∪ trees, after an override-semantics SPLIT.** REASON: Langston diff-B R1/R2 — see "What review caught" below.

## Scope objectives
| # | Objective | Result |
|---|---|---|
| 1 | Per-class dominant regime — mixed votes deleted, getDominantRegimeForClass (MIN 5 / null = CLASS_IDLE) in BOTH sources | **YES** — MCE + telemetry; deletion locked by regression test; live proof at deploy+1min: xStock vote LIVE STRUCTURAL_TRANSITION 42% while crypto IDLE_OR_WARMING |
| 2 | Per-class consumer surface: getMarketIndicators(assetClass) REQUIRED, voteStatus marker, per-class friction/DBS/transitions, per-class API + UI showing both classes | **YES** — incl. NO_SAMPLE honest-null friction (synthetic 25 default gone), idle suppression + silent re-seed (independent friction idle flag per diff-A R1), `[class]`-labeled events, perClass API payloads, two-badge analytics header (§9.3 Claude-in-Chrome verified: CRYPTO 69% + XSTOCK 45% independent votes; existing Overview panel renders unchanged) |
| 3 | VTS stamps class-true with at-open preservation; vts epoch bump | **YES** — open-stamp per-class getters; the silent `?? regime` substitution removed; ALL close-time re-resolutions removed; vts calibration epoch → **3** |
| 4 | #163 map restructure: per-class source materialization, helper split, bridge reads trees, byte-identical exit gate | **YES** — bridge JSON **byte-identical** (4,361 bytes, timestamps masked; Langston re-ran the generator on staging independently: md5 `cf5ad3c3448d39a927ad9924756b56c6`) + 9/9 contract tests + 6 new membership/two-surface locks |
| 5 | Crypto behavior preserved | **YES** — byte-identical bridge JSON; eval-loop membership exactly pre-batch for crypto after the override split; tsc baseline OK; full vitest = the identical pre-existing 12-fail set (1,660 pass) |

## What review caught (the iterate-to-correct record)
1. **Diff-A (Langston R1):** the friction transition tracker shared the regime tracker's idle flag READ-ORDER-DEPENDENTLY — it would have compared the Friday-close friction band against the Sunday-reopen band and emitted a false transition most xStock reopens. Fixed with an independent `frictionWasIdle` flag covering idle AND NO_SAMPLE gaps; lock 6 added.
2. **Diff-B (Langston R1/R2 — the batch's biggest catch):** the bridge's ASSET_CLASS_OVERRIDES conflated class-INELIGIBILITY with favored-LIST curation. The naive tree re-point would have **silently disabled the quant-strong_trend lane** (strong_bull_trend excluded from every materialized tree; the VTS eval loop derives entirely from the tree) — a live strategy (ESPORTS/USD admit 2026-06-08) functionally dead with the byte-identity gate blind to it. Fixed structurally: exclude semantics SPLIT (`excludeStrategies` = out of the eval tree; `favoredListExcludes` = in the tree, subtracted only at bridge derivation); validation domain = base ∪ trees (never narrower than pre-batch; historical ST+orb rows validate). Byte-identity re-proven post-split.
3. **Diff-B R3:** selectContextAwareStrategy's silent adaptive_flow fallback on unwired classes → now THROWS (B80 perp-onboarding guard).
4. **CI iteration 1:** vote unit tests shared singleton caches with sibling suites in the same worker — fixed with vitest-guarded `_clearCacheForTests`/`_clearPairTelemetryForTests`.
5. **CI iteration 2/3:** a CI-only integration suite (local DB-absence masked it) still called the old signatures + asserted friction-is-always-a-number; re-pointed + null-contract-aware.
6. **Step-8 (Langston):** my bridge byte-check evidence had a hole (the deployed file predated chunk B — the generator preserves timestamps on unchanged content); he re-proved the invariant by independent generator run against HEAD. Also surfaced **#220** (pre-existing frozen `setNullReason` stderr anomaly, 64,494 entries — evidence captured, stale stderr flushed).

## One intended behavior delta
xstock TFS evaluation now includes **orb** — the B79.0n.STRATEGY hand-authored add previously lived only in the bridge JSON (getClassMap consumers) and never reached the VTS eval loop. It reaching the loop is the point of #163.

## Outstanding tails
- **R2 full closure:** first fresh TFS/IE strong_bull_trend admit through chunk-B code (both classes sat in STRUCTURAL_TRANSITION all post-deploy) — system-alert `b47_sbt_fresh_admit` fires 2026-06-12T19:00Z.
- **#217** CONTEXT_BONUS wire-or-remove at AMR scoping (per-class regime now exists to wire it correctly).

## Governance files changed (Step 10)
`RUNNING_ISSUES.md` (#162/#163 RESOLVED w/ closure narratives; #217/#218/#219/#220 OPENED; header) · `PHASE_24_TO_19_READINESS_CHECKLIST.md` (4.7 ✅) · `POST_AUDIT_ROADMAP.md` (next-line) · `PHASE_HISTORY.md` (batch block) · `BATCH_CATALOG.md` (row) · `SYSTEM_IMPACT_MAP.md` (§1.5 rankingScore intent-vs-wiring correction — contextBonus DECLARED-NEVER-WIRED; MCE getDominantRegime → per-class; getGlobalFriction stale-hold note) · `SYSTEM_MANUAL.md` (Chapter-3 per-class-regime banner: vote semantics, CLASS_IDLE, two-surface override semantics, validation domain) · `CHANGES_AND_FIXES.md` (FIX-2026-06-11-B) · `MULTI_ASSET_VTS_EXPANSION_PLAN.md` (record + WORKING-LIST review: no new reset items) · `bridge/canonical/*` (generator-format commit, Step-8 housekeeping) · MEMORY.md 3-way (truth + in-repo + Langston Helsinki).

## Epoch statement
vts calibration epoch **2 → 3** at chunk-A deploy (per-source rule: globalRegime/globalFriction stamp semantics changed; paper_sim/live untouched at 2). Chunk B has no epoch implication by construction (byte-identical contract).
