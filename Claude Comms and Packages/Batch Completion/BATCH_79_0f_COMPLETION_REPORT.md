# BATCH 79.0f — Asset-class collision disambiguation (COMPLETION REPORT)

**Status:** CLOSED 2026-05-10. All 9 objectives verified. Deploy on PM2 #204.
**Phase:** 24 (Multi-Asset VTS Onboarding) — sub-batch 6.
**Workflow:** 11-step canonical (full).
**Branch:** `migration/aws-supabase`. Commits: `e6fd7350f` (impl + audit + backfill).
**Trigger:** Live bug surfaced by Kyle 2026-05-10 ~14:14 UTC — SUI/USD crypto trade displaying as "xStock Spot" tag in Machine Learning UI.

---

## §1 — Numbered objectives — outcomes

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Resolver distinguishes via x-suffix disambiguation | YES | `XSTOCK_SPOT_DISPLAY` x-suffix branch retained at line 358; new `XSTOCK_SPOT_KRAKEN_COLLISIONS` branch routes collision tickers without x to crypto + WARN |
| 2 | Fail-loud on ambiguous form | YES (Q1=B) | Crypto-prefer with WARN log, not throw — Langston Q1 lock (B74 invariant: xStock ingestion always uses kraken-equities exchange, never plain kraken). |
| 3 | Drop unconditional membership-fast-path for collisions | YES | Collision check fires before non-collision membership lookup |
| 4 | UI display layer reads asset_class from row | YES (verified) | `client/src/components/ui/asset-class-badge.tsx` reads `trade.assetClass` directly; no client-side re-resolve |
| 5 | VTS trade record persists asset_class | YES (already true) | `OpenVirtualTrade.assetClass` field set at trade-open via `safeResolveAssetClass(symbol, 'kraken')` (vts-runner.ts:1316+1328); B79.0f's resolver fix means new trades get correct value |
| 6 | Sweep historical mis-tagged rows | YES — backfilled | 4862 rows in signal_eval_archive: DASH/USD 337, MET/USD 1598, OPEN/USD 44, SUI/USD 2883. Other tables clean (0 rows). Verification SELECT post-fix returns 0. |
| 7 | Boundary tests | YES | `b79-0f-asset-class-collisions.test.ts` 33 cases (collision-set integrity 4 + 9 USD collision 9 + 8 EUR collision 8 + disambiguating-form 3 + non-collision xStock 4 + pure crypto 5) |
| 8 | No-touch fence on crypto_spot | YES | 20 emissions/factor/5min post-deploy (cadence resumed within 60s of restart) |
| 9 | CI 4 checks gate | PASS (3/4 + legacy) | Build + Docker green; Test 1086+33 = ~1119 passing / 59 legacy baseline / 5 skipped; TS legacy storage.ts only |

---

## §2 — Files changed

### Modified
- `shared/asset-classes.ts` — `XSTOCK_SPOT_KRAKEN_COLLISIONS` set (17 entries: 9 USD + 8 EUR pre-emptive); resolver kraken branch with collision gate + WARN log
- `server/strategies/orb.ts` — re-applied B79.0d Step 4 F1/F2/F3 doc fixes (lost in commit `16e0743c7`)

### Added
- `server/tests/unit/b79-0f-asset-class-collisions.test.ts` (33 cases)
- `scripts/b79-0f-collision-audit.sql` (read-only audit; UPDATE block commented out)
- `scripts/b79-0f-collision-backfill.sql` (one-shot UPDATE; applied to staging)
- `scripts/b79-0d-orb-thresholds-seed.sql` (force-added; was caught by `*.sql` gitignore on first ship)

### Documentation
- `Claude Comms and Packages/Scope Files/BATCH_79_0f_SCOPE.md` rev 2
- `B79_0f_scope_review_rev1.md/_reply.md`
- `B79_0f_step4_code_review.md/_reply.md`
- `Change Lists/B79_0f_diff.txt` (527 lines)

---

## §3 — Governance updates (Step 10)

- [x] `1-system-manual/BATCH_CATALOG.md` — B79.0f row added above B79.0d (sequencing TBD with B79.0e/B79.0g landing)
- [x] `1-system-manual/CHANGES_AND_FIXES.md` — INFRA-2026-05-10-A entry (collision backfill — DASH/USD 337, MET/USD 1598, OPEN/USD 44, SUI/USD 2883 = 4862 rows in signal_eval_archive). Per Langston rev 2 #5 paper-trail rule.
- [x] `1-system-manual/SYSTEM_IMPACT_MAP.md` — resolver entry updated with collision-set behavior + provenance
- [x] `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — quarterly XSTOCK_SPOT_KRAKEN_COLLISIONS re-audit standing rule (Langston rev 2 #2)
- [x] `.claude/memory/MEMORY.md` 3-way sync
- Standing-rule comment placeholder `§10c.X` resolved to actual section number on plan-doc update

---

## §4 — Step 7 verification — RESULTS

| Criterion | Status | Evidence |
|---|---|---|
| HTTP 200 staging | ✅ PASS | curl /api/diagnostics/xstock-scanner 200 post-restart |
| All B79.0f tests pass | ✅ PASS | 33 new cases passing in CI (commit `e6fd7350f`) |
| Test Suite zero new regressions | ✅ PASS | Legacy 59 baseline unchanged |
| No-touch fence on crypto_spot | ✅ PASS | 20 emissions/factor/5min (cadence resumed within 60s) |
| Collision backfill verified | ✅ PASS | 4862 rows flipped; post-fix audit returns 0 mis-tagged |
| Live SUI/USD trade purged | ✅ PASS | PM2 restart cleared in-memory `openVirtualTrades` Map; future trades open with corrected resolver |
| Langston Step 1 review | ✅ APPROVED-WITH-REVISIONS | All 5 revisions applied (provenance, quarterly re-audit, audit read-only, backfill paper-trail, B79.0g split) |
| Langston Step 4 review | ✅ APPROVED ship-as-is | F1 (`§10c.X` placeholder resolved), F2 (WARN dedup deferred to B79.0g), F3 (backfill wording fine) — all non-blocking |

---

## §5 — Plain-language summary (Kyle)

**The bug.** SUI/USD crypto trade displayed "xStock Spot" tag in the Machine Learning UI. Root cause: ticker collision — `SUI` is BOTH Sun Communities (NYSE equity, in our xStock catalog) AND Sui Network (crypto). Both produce the same canonical `SUI/USD` form, and our resolver had a fast-path membership check that returned `xstock_spot` for any symbol in `XSTOCK_SPOT_SYMBOLS` regardless of disambiguating context.

**What B79.0f does.** Three things:

1. **Identifies the full collision surface.** Live Kraken `/0/public/AssetPairs` query intersected with `XSTOCK_SPOT_SYMBOLS`: 9 USD-quote tickers (BDX, CVX, DASH, EDU, MET, OPEN, PEP, SUI, T) collide today; 8 EUR-quote pre-emptively locked in case `XSTOCK_SPOT_SYMBOLS` ever extends to /EUR. New `XSTOCK_SPOT_KRAKEN_COLLISIONS` const carries provenance comment + standing rule for quarterly re-audit.

2. **Hardens the resolver.** When a collision ticker hits the regular `kraken` exchange path WITHOUT the `x` suffix that disambiguates xStock display form, resolver now returns `crypto_spot` + emits `[B79.0f][COLLISION_RESOLVE]` WARN log. The display-form path (`SUIx/USD`) still resolves to xstock_spot. Non-collision xStock tickers (AAPL, TSLA, etc.) keep the membership fast-path. Crypto pairs unaffected.

3. **Backfills historical mis-tagged rows.** Audit found 4862 rows in `signal_eval_archive` tagged `xstock_spot` for collision symbols (all timestamped after 2026-05-07 21:51 UTC — exactly when B79 deploy populated `XSTOCK_SPOT_SYMBOLS` and the resolver started preferring xstock_spot for collision tickers). One-shot UPDATE flipped them to `crypto_spot`. Other tables clean.

**Verification.** Tests lock the regression. The live SUI/USD trade visible in your screenshot was an in-memory record carrying stale `assetClass='xstock_spot'` from pre-fix resolver — PM2 restart on B79.0f deploy cleared in-memory state. Future trades on collision tickers open with correct asset_class. Crypto no-touch fence held (20 emissions/factor/5min post-deploy).

**Process notes.**
- Langston independently arrived at the persistence-as-real-fix point during scope review ("UI re-resolve is fundamentally a patch — NO PATCHES doctrine") which aligned with your earlier observation. Persistence-at-trade-open is queued as B79.0g (next sub-batch, scope drafted + dispatched to Langston in parallel).
- Caught + reapplied B79.0d Step 4 F1/F2/F3 doc fixes that were lost in the previous commit cycle (Edit calls applied to working tree but never `git add`-ed before commit `16e0743c7`). Now landed under B79.0f sha; B79.0d completion-report attribution updated.

---

*End BATCH_79_0f_COMPLETION_REPORT.md.*
