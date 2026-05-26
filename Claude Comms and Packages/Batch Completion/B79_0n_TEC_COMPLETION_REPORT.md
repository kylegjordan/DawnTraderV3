# B79.0n.TEC — Completion Report

**Status:** CLOSED with B79.0n.TEC.b follow-up explicitly queued.
**Date closed:** 2026-05-26.
**Sub-batch:** #9 of 18 in B79.0n umbrella v4 (parallel-eligible, shipped alongside SCORING #8).
**Deploy commit chain:** Step 6 initial deploy at `ceeaa15c6` (TEC migrations + code chunks); R-5 hotfix-deploy at `29bfda74f` (added `assetClass=` + threshold tags to SQE_EVAL log line — shared with SCORING).
**CI status:** All 4 GREEN at cumulative HEAD `9952111f8`, run `26428529329` (2m35s).
**PM2 restart:** 322, pid `1696860`, created `2026-05-26T03:56:27Z` (post-R-5-pull restart).

---

## §1 Scope objectives — checklist (14 objectives + 3 C-items)

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Migration 1: 32 new rows seeding per-class config | ✅ YES | DB probe confirms 44 rows total = 11 keys × 4 active classes. Idempotent A.2 backfill (added in hotfix `e7aa96c7a` for CI's initial-schema baseline) skipped on staging (B79.0n.TEC stamp count=32) — assertion passes by counting all per-class rows. |
| OBJ-2 | Migration 2: EXISTS-gated wildcard retirement | ✅ YES | Post-deploy DB: 0 rows with `asset_class='*'` for `trailing_exit`. EXISTS-gate confirmed all 4 active classes × 11 keys present before DELETE. |
| OBJ-3 | Per-class HARD-FAIL extension | ⚠️ PARTIAL → B79.0n.TEC.b | Kill-switch HARD-FAIL preserved on `break_even_enabled` via `hasExplicitAssetClassRow`. Other 10 keys SOFTENED to observable `pick(key, TEC_DEFAULTS.x)` with per-key counter (Langston ACK Option A; B79.0n.TEC.b restores strict throw after 48h verify-gate). |
| OBJ-4 | Remove `pick → DEFAULTS` silent fallback | ⚠️ PARTIAL → B79.0n.TEC.b | Soft-fallback retained with WARN-every-100 logging + per-key counter via `getTECPickFallbackStats()`. Same destination as OBJ-3. |
| OBJ-5 | tec-evaluator.ts consolidation (D-3) | ✅ YES | `resolveTECConstants` now sync (per-class cache lookup); `evaluateTECExit` caller dropped `await`; `getModuleConstants` import removed. Zero duplicate DB round-trips per exit-cycle. R-2 grep clean (1 internal caller + 1 export; no consumers remain). |
| OBJ-6 | Comment chronology fix (D-1) | ✅ YES | `trailing-exit-controller.ts:107` updated with full chronology citing `kyle-directive-2026-05-21-disable-xstock-be` (D-1 Hypothesis 2 — root-caused via DB probe). |
| OBJ-7 | TEC_DEFAULTS demoted to type-template-only | ✅ YES | Comment flag added; production paths read from per-class cache; const remains for type inference + test fixture seeding. |
| OBJ-8 | `getTECPickFallbackStats()` diagnostic accessor | ✅ YES | Exposed for 48h verify-gate evidence. Counter currently at 0 across all 11 keys after 69m uptime. |
| OBJ-9 | All 4 CI checks GREEN | ✅ YES | Run `26428529329` (TypeScript Check / Test Suite / Build / Docker Build) at `9952111f8`. |
| OBJ-10 | Anti-graveyard preserved | ✅ YES | No new `as any` / `@ts-ignore` / `!` in production. `@ts-expect-error` confined to test fixtures (unchanged). |
| OBJ-11 | Local tsc baseline preserved | ✅ YES | CI `tsc --noEmit` passes; baseline 494 unchanged. |
| OBJ-12 | Crypto regression check vs 24h baseline (Langston C-2) | ✅ YES | Pre-deploy: VTS opened 144 / closed 102 (24h). Post-deploy at 38min: crypto_spot 130/24h vs 7d-avg 109.9/day (+18%, within 7d-rolling tolerance per CLAUDE.md §5 #13); xstock_spot 27/24h vs 63.6/day (−58%, but B-NEW-36 weekend_shutdown expected). Both classes within day-of-week variance. |
| OBJ-13 | Phase 24 onboarding learnings (§3.3) | ✅ YES | See §3 below. |
| OBJ-14 | Step 10 governance — 8 docs ACTUALLY edited | ✅ YES | See §6 below. |
| C-1 | Perp-activation pre-flight checklist | ✅ YES | `RUNNING_ISSUES.md` entry added: "perp activation pre-flight checklist must include TEC per-class row audit + scoring per-class threshold audit." |
| C-2 | Baseline numbers in completion report | ✅ YES | Pre-deploy + post-deploy snapshots cited in OBJ-12. |
| C-3 | Wildcard-consumer scan covered | ✅ YES | D-4 grep returned zero direct-wildcard consumers; Migration 2 single-batch confirmed safe; covered C-3 by extension. |

---

## §2 Workflow narrative (highlights)

Five-round CI iteration before green:
1. **TEC initial push (`2f7d66fed`)** — MANIFEST drift (SCORING line in MANIFEST but file absent).
2. **Manifest hotfix (`a26d19348`)** — CI ran; tests failed because 11-key HARD-FAIL throws on test fixtures providing per-class `break_even_enabled` + wildcard for the other 10 keys.
3. **Migration A.2 backfill (`e7aa96c7a`)** — idempotent rows for crypto_spot + xstock_spot hot keys (existed on staging from B79.0m.b era, absent from CI's initial-schema baseline). Migrations applied; tests still failed (tests mock `db.js` — migrations don't seed the mocked rowset).
4. **HARD-FAIL retreat (`69f3aea66`)** — softened strict `requireKey<T>` to observable `pick(key, TEC_DEFAULTS.x)` with per-key counter. CI passed. 7 test fixtures unchanged.
5. **MEMORY commit (`9952111f8`)** — cumulative CI passed (the cascade-cancel pattern meant only the latest push's CI mattered).

Step 6 deploy at `ceeaa15c6` (pre-R-5). Step 7 first-pass GREEN: 44 TEC rows / 0 wildcard / 0 counter fires / FX5 cycling normally. **Side effect:** pre-deploy `TEC_STALE_FAIL_CLOSED` errors firing every 60s through 02:46 UTC (B-NEW-40 stale-cache fence) STOPPED post-restart — clean cutover.

Step 8 Langston second-pass NOT-ACK first time: R-5 commit `29bfda74f` (added `assetClass=` + threshold tags to SQE_EVAL log line) was committed/pushed but never `git pull`ed to staging. Fixed: pulled, rebuilt, restarted at 03:56:27Z (restart 322). Re-dispatched.

Step 8 re-verification: 4 GREEN gates + 1 held item (R-5 runtime emission). After 69 minutes post-restart, 0 SQE_EVAL fires occurred — signal-orchestrator + FX5 + VTS all alive but produced 0 non-null candidates in current market regime. Dispatched schema-parity-only ACK request; Langston ACKed.

---

## §3 Asset-class onboarding workflow learnings (Phase 24 standing rule per CLAUDE.md §3.3)

**(a) What worked well:**
- 3-way MEMORY sync discipline (truth file + in-repo + Langston Helsinki) preserved continuity across 12+ commits and multiple iteration rounds.
- File-first dispatch protocol with embedded-diff change-lists per CLAUDE.md §6.5.0.a — Langston ACKs returned in 1-5 min consistently.
- Langston Step 1/2/4/8 review gates surfaced concrete gaps each round (D-decisions; HARD-FAIL retreat tradeoff; R-5 build-vs-runtime gap; SHA mislabel).
- Counter-based observability (`getTECPickFallbackStats()`) as the 48h verify-gate evidence mechanism — same pattern as SQE static-mirror fallback counter, symmetric verification surface.

**(b) What surprised us:**
- **CI's initial-schema pg_dump baseline is NOT a steady-state production snapshot.** It captures the rowset at a specific moment, missing rows that staging had at the time but pre-dump migrations had previously seeded. The TEC hot-keys for crypto_spot + xstock_spot existed on staging from B79.0m.b but weren't in the pg_dump — required idempotent A.2 backfill block in Migration 1.
- **7 TEC test fixtures use mocked-db pattern providing per-class `break_even_enabled` + wildcard for the rest.** Strict 11-key HARD-FAIL extension broke all 7 fixtures simultaneously. The fixtures encode assumptions about wildcard resolution semantics that were valid pre-B79.0n.TEC; updating all 7 would have been ~300+ row inserts of seed-helper surgery.
- **Commit + push ≠ deployed.** The R-5 follow-up commit (`29bfda74f`) was created AFTER the initial Step 6 deploy and was never pulled to staging — only Langston's Step 8 SHA-cross-check caught this. Future Step 6 deploys must verify the staging HEAD matches the intended commit before completion.

**(c) Recurring structural patterns:**
- **Two-step promotion-then-retire pattern** (per §4.15 codified in SCORING.b — same applies here as TEC.b): ship seed migration + observable counter, wait 48h with zero counter fires, then ship strict-throw extension. Mirror this for any future module-constants per-class extension.
- **Test fixture incompatibility on HARD-FAIL extension**: when extending HARD-FAIL coverage to additional keys, audit ALL test fixtures consuming the affected module's `primeXConfig()` boot path. Either update fixtures atomically OR adopt soft-fallback counter + defer strict throw to follow-up batch.
- **Deploy-SHA drift**: when multiple commits land between Step 6 and Step 8 (e.g., R-5 follow-up), the actual deployed SHA may not match the latest commit. Document the actual SHA chain in completion report, not the latest commit.

**(d) Concrete edits to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`:**
- New §4.16 entry: "All-keys HARD-FAIL coverage for module-constants per-class surfaces" — codifies the all-keys discipline with the test-fixture audit requirement.
- New §4.17 entry: "Step 6 deploy-SHA verification — verify staging HEAD matches intended commit after `git pull`. If a follow-up commit (e.g., R-5 hotfix) lands between Step 6 and Step 8, re-deploy + re-verify before dispatching Step 8."
- New §4.18 entry: "CI initial-schema pg_dump may diverge from staging state — when adding per-class rows that depend on prior migrations, include idempotent `ON CONFLICT DO NOTHING` backfill blocks so CI's fresh-DB baseline matches staging's accumulated state."

---

## §4 Risks / open items

| Risk | Disposition |
|---|---|
| **R-5 runtime emission deferred** | Schema-parity verified at build time; runtime evidence DEFERRED until first genuine SQE_EVAL fire (regime shift OR sub-batch 18 active-trading flip). Whoever observes first post-hold fire should sanity-check emitted payload matches v2 schema; schema-mismatch would re-open. |
| **B79.0n.TEC.b SLA** | 7 days from 48h verify-gate close per Langston Step 4 condition #1. Counter must stay at 0 across 48h post-deploy (current: 0 at 69m). If counter fires, root-cause before .b lands. |
| **48h static-mirror-fallback verify-gate** | Independent clock continues; SQE counter at 0 (no fires since deploy). Same gate semantics as SCORING.b. |
| **C-1 perp-activation pre-flight** | RUNNING_ISSUES entry tracks. No perp activation in near-term roadmap per umbrella v4. |

---

## §5 R-4 no-touch-fence sentence (Langston Step 2 ACK)

Although Migration 1's A.2 idempotent backfill block inserted rows for `crypto_spot` + `xstock_spot` that existed on staging from B79.0m.b era, this IS within the no-touch fence: the inserts are `ON CONFLICT DO NOTHING` so staging's existing values are preserved verbatim (e.g., xstock_spot.trail_distance_atr_multiplier=0.8 from B79.0m.b's empirical equity-baseline). The block adds rows only on CI's fresh-DB baseline. Zero behavior change on staging.

---

## §6 Step 10 governance — 8 docs ACTUALLY edited (per Kyle PATTERN-DETECT directive)

| Doc | Edit |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New row: B79.0n.TEC closure |
| `1-system-manual/PHASE_HISTORY.md` | New row: umbrella v4 row 9 close |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | New "Recent Additions (B79.0n.TEC)" section |
| `1-system-manual/SYSTEM_MANUAL.md` | TEC HARD-FAIL doctrine extended; soft-fallback counter pattern codified |
| `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` | New §4.16 / §4.17 / §4.18 entries per §3(d) above |
| `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` | New row: umbrella v4 row 9 close (partial — .b follow-up queued) |
| `1-system-manual/CHANGES_AND_FIXES.md` | New entry: B79.0n.TEC shipped + D-1 chronology resolved + 5-round CI iteration narrative |
| `1-system-manual/RUNNING_ISSUES.md` | New entries: #85 closed (deferred-from-B79.TEC HARD-FAIL extension), B79.0n.TEC.b deferred (strict 11-key HARD-FAIL restoration after 48h verify-gate), C-1 perp-activation pre-flight checklist |

---

*B79.0n.TEC CLOSED with B79.0n.TEC.b explicitly queued for 7d-after-48h-verify-gate-close per Langston SLA. Active-trading impact zero today (paper_sim_trades + trades both empty); deferred runtime evidence does not affect current operations.*
