# B-5.1 COMPLETION REPORT — AMR input-integrity fixes (#222 / #223 / #224 + the Note-3 gate gap)

**Date:** 2026-06-12 · **Author:** Claude New (CC-B) · **Status:** COMPLETE (pending Kyle ACK)
**Code commit:** `56def88c9` · **Deployed:** `5737b1ddb` · **⏱ Deploy timestamp: `2026-06-12T01:01:56Z`** (the D1/D2 boundary record — see §4)
**CI:** `27383817109` (code commit) + `27387317555` (staging head) — both all-4-green
**Langston:** scope ACK (D1/D2/D3 + Notes 1-4) → pre-audit pins (Note-2/Note-3) → Step-4 R1 APPROVE → reader-walk addendum **OK-DEPLOY** (independent grep) → Step-8 **CONFIRMED** (independently re-ran audit script, ledger query, log greps)

**Origin (standing lesson):** Kyle's fix-now directive — the three B-5 Step-8 findings were NOT left as registered side notes: *"we just spend all this time building this new system... it's supposed to be learning now, and now it's just learning corrupt and incorrect information... let's fix them now."* Recorded as permanent feedback memory + this batch.

## PREVIOUSLY-STATED-VS-NOW (§9.2)

1. **PREVIOUSLY STATED:** post-fix crypto DBS "settles ~0.227-region" (vs 0.2833 contaminated baseline). **NOW:** 0.508 (UP_MODERATE) at n=180 mid-refill, ~7.5h after the baseline measurement. **REASON:** the expectation was pinned to a single-moment snapshot of a live market quantity; the market moved between measurement and deploy. Per critical rule 13 (snapshots are not decision-grade), the integrity criterion is the registry-based purity probe (PASS) + the allowlist diff + the class-generic unit test — not a stale score pin.
2. **PREVIOUSLY STATED:** "no live crossed-quote event yet (0 rejection lines)" in the Step-8 evidence rev1. **NOW:** the guard fired 18× in the first ~10 minutes. **REASON:** the rejection log emits via `console.warn` → stderr → `error.log`; the first grep checked `out.log`. Langston's Step-8 caught it; independently re-verified. Upgrades the evidence rather than weakening it.
3. **PREVIOUSLY STATED (B-5 era):** "24 equity symbols" in the contaminated baseline. **NOW:** ≥1 overcount — GRASS/USD is a genuine Kraken crypto token (registry adjudicates it crypto_spot). **REASON:** the baseline list was a name-pattern heuristic; the permanent probe uses `safeResolveAssetClass`, not name lists.

## Objectives (scope `B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md`)

| # | Objective | Verdict | Evidence |
|---|---|---|---|
| O1 | #222 crypto DBS equity contamination: root-cause + structural fix | **YES** | Root cause `market-context-engine.ts:1395` un-class-gated `updatePair` (B63-era; the ONLY production call site — **Note-1 grep statement: one production hit, grep-verified at review and re-verified by Langston's independent grep at Step-8 window**). Fix = `crypto_spot` allowlist. Post-restart refill PURE: `probe_dbs_class_purity` PASS n=180, zero non-crypto (registry-based). Class-generic regression test (xstock + synthetic class strings cannot write). |
| O2 | #223 negative-spread writer guard at the chokepoint | **YES** | Field-level drop in `setCostMetrics` (both writers covered). Prior-good retained on existing entries; first-write-crossed → null, nothing fabricated; zero accepted; throttled log. 4-test unit matrix green. **18 live rejections in the first 10 min** (all −1 stale-ask sentinels). All 7 reader call sites proven miss-safe at call-site level (pre-audit ADDENDUM + Langston grep — one extra site `tec-costs.ts:86` found, same never-null class, added to SIM §2.5). |
| O3 | #224 restart-transient CALM → honest IDLE | **YES** | Friction WARMING/NO_SOURCE → IDLE with `friction_warming`/`friction_no_source` staleness; LOW_VOLUME_THIN + MARKET_CLOSED stay LIVE. Live ledger proof from the deploy restart: first cycle BOTH classes IDLE (xstock `friction_warming` — the exact pre-fix false-CALM transient); first LIVE reads CHOPPY→DEFENSIVE (crypto, 01:03:02Z) and STORMY→SURVIVAL (xstock, 01:03:32Z), both ≤ NORMAL per the post-IDLE cap. |
| O3+ | Note-3 4th gap: fail-closed `no_posture` under enforce+null | **YES** | `enforce` + `mode===null` → blocked with gate `no_posture` (entry-side only; exits never gated; posture in-memory-only). `dry_run` unchanged. 2 unit tests (enforce blocked / dry_run skipped). The ungated ACTIVE-restart window is CLOSED — the IDLE extension cannot widen what no longer exists. |
| V | 13-leg audit re-run post-deploy | **YES** | ALL 13 SCORED LEGS PASS (run 2026-06-12T01:07:49Z on staging), incl. the two new B-5.1 probes (`probe_dbs_class_purity`, vacuous-PASS-proofed per Langston R1(b): empty store → SKIP). |

**Known blind spot recorded (N3):** the purity probe resolves symbols via `safeResolveAssetClass(symbol, 'kraken')`, which resolves collision-set names (DASH, CVX, SUI — symbols existing in both the crypto and xstock universes) as crypto_spot by design. A hypothetical leak of a collision-set xstock written under its collision name would be invisible to the probe. Acceptable: the allowlist fix makes ANY xstock-lane write structurally impossible regardless of name, and the unit test locks the store-level behavior — the probe is a second lock, not the only one.

## §4 The boundary timestamp (D1 + D2 conditions honored)

**`2026-06-12T01:01:56Z`** — recorded here and in CHANGES_AND_FIXES FIX-2026-06-12-B:
- **D1 (intra-epoch-4 boundary):** vts rows stamped with crypto `globalDirectionalBias[Score]` BEFORE this instant carry the equity-contaminated aggregate; AFTER, the clean one. No epoch bump — same-formula input cleanup, not a units/formula change (contrast: the Finding-A2 units bug DID bump epochs).
- **D2 (shadow-week annotation):** the AMR shadow-week review must attribute any crypto dbs-input step-change at this timestamp to the fix landing, not to a market event.

## Pre-deploy contamination baseline (for the record)

Captured 2026-06-11 ~17:30Z: store n=462, 24 equity-looking symbols (SPY/QQQ/NVDA/AAPL/TSLA/MU/META/MSFT/GOOGL/AMZN/COIN/MSTR/HOOD/PLTR/AMD/INTC/CRCL/ARM/ASTS/GRASS/CLSK/IWM/GLD/TQQQ) at 52.0% weight, contaminated score 0.2833. (GRASS overcount noted in PREVIOUSLY/NOW #3.)

## Process record (Kyle's workflow challenge — folded into the batch)

Kyle challenged whether the full SIM/Manual consultation was truly done for these "small" fixes ("This is where bugs get buried"). The gap found: the cost-cache reader walk was asserted, not enumerated. Closed BEFORE deploy: all reader call sites walked and proven at call-site level (pre-audit ADDENDUM), confirmed exhaustive by Langston's independent grep. **Standing rule recorded in CHANGES_AND_FIXES (vs the BUG-2026-05-06-A precedent): a component outside the current batch's fresh documentation gets the explicit SIM walk, regardless of diff size. Enumerate, don't assert.**

## Governance files changed (Step 10)

1. `1-system-manual/RUNNING_ISSUES.md` — #222/#223/#224 → ✅ RESOLVED (header updated)
2. `1-system-manual/CHANGES_AND_FIXES.md` — FIX-2026-06-12-B (boundary timestamp + process lesson vs BUG-2026-05-06-A)
3. `1-system-manual/SYSTEM_IMPACT_MAP.md` — §2.5 Cost Cache rewritten (path corrected, 7-reader proven table incl. tec-costs:86, write guard, blast radius LOW→MEDIUM) + B-5.1 deltas section (allowlist write gate / IDLE extension / no_posture split / friction-prerequisite)
4. `1-system-manual/SYSTEM_MANUAL.md` — Ch12.1 warm-up honesty + no-posture gate paragraph; 12.1 inputs line (writer guard); 12.6 open items → status update (3 resolved struck through, still-open list incl. weight-cap question)
5. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — friction source = AMR LIVE prerequisite (+ DBS allowlist inheritance note)
6. `1-system-manual/BATCH_CATALOG.md` — B-5.1 row
7. `1-system-manual/PHASE_HISTORY.md` — B-5.1 paragraph
8. `.claude/memory/MEMORY.md` (mirror) + user-cache truth file — state block update
9. Langston `/home/langston/MEMORY.md` — batch closure sync (§10.b)

**Not applicable:** POST_AUDIT_ROADMAP (no sequencing change — B-4.6-B remains next), ADJUSTMENT_FRAMEWORK, AUTHORITY_BASELINE, MULTI_ASSET_VTS_EXPANSION_PLAN xStock-15min working list (no bar-interval-coupled item touched). No migration shipped (no schema change). No UI surface changed (the B-5 panel's IDLE legend row already covers warm-up IDLE — no Claude-in-Chrome pass claimed).

## Sync gate

GoogleDrive `git status` clean + `git rev-list --count HEAD..origin/migration/aws-supabase` = 0 + staging at the pushed head — verified at the governance push (final section of this batch's closing commit).
