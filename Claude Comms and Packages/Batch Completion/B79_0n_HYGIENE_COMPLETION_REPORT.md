# B79.0n.HYGIENE — Completion report

> **Sub-batch 1 of 17** in the B79.0n umbrella arc (xStock active-trading wire-in + systemic asset-class awareness).
> **Status: CLOSED 2026-05-21.**
> **Deploy commit:** `6050165cf` on `migration/aws-supabase`.
> **Workflow:** Step 1 ACK 2026-05-20 PM → Step 2 ACK 2026-05-20 PM → Step 3 implementation → Step 4 ACK 2026-05-20 PM → Step 5 push (commit `c18704eed`) + Step 5b fix-forward (commit `6050165cf` for vitest import fix) → Step 6 deploy 2026-05-21 07:08 UTC → Step 7 verification 2026-05-21 07:50-08:00 UTC → Step 8 ACK 2026-05-21 08:00 UTC → Step 10 + Step 11 (this report) 2026-05-21.

---

## §0 — TOP-OF-REPORT MANDATORY DISCLAIMERS (per Langston Step 2 ACK)

### Disclaimer 1: Pre-current-bundle disclaimer

**The 64,494 historical occurrences of `setNullReason is not defined` in `/home/deploy/.pm2/logs/dawntrader-error.log` are PRE-2026-05-20-12:08-UTC-bundle and are NOT a live bug.** They accumulated across the 304 lifetime PM2 restart cycles BEFORE the current bundle was built. The source has had the import continuously since Batch 31 (March 2026, commit `bd5b2ccf3`) per `git log -S "null-reason-tracker"` — the historical errors stem from bundling non-determinism, not source-code drift. The current bundle (mtime 2026-05-20 12:08 UTC) was empirically verified during Step 2 pre-audit via a 240-second observation window with zero new error log lines added (file size frozen at 872,537 across three independent timed checks). Independently re-verified at Step 8 by Langston with a 60-second observation window post-deploy (6,860 count unchanged in `/var/log/dawntrader/error.log` while the file was actively being written for other content). **A future audit reading the historical 64,494 occurrences must NOT re-open this as a live bug** — those entries are explicit pre-fix archaeological residue, and the regression fence shipped in this batch ensures they cannot return without immediate detection.

### Disclaimer 2: Root-cause-unverified disclosure

**We did not perform a commit-level bisect to identify which specific bundle build resolved the historical bug.** PM2 does not archive prior `dist/index.js` snapshots, so the bundle non-determinism that produced the 64,494 historical errors cannot be reverse-engineered after the fact. Source-side is correct continuously since Batch 31. We treated "stopped firing" as ground truth and shipped structural protection (boot-time round-trip smoke test + import-hygiene unit test) instead of pursuing archaeological closure on which esbuild build coincidentally fixed it. Per Langston Step 2 ACK: "bisecting 304 restart cycles for archaeological closure on a fix we can no longer compare against past bundle artifacts is high-effort, low-ROI." The fence is the long-term solution per CLAUDE.md §5 #15 NO PATCHES; the unbisected RCA is a documented limitation, not a duct-tape patch.

### Disclaimer 3: Op-hygiene flag (future batch)

**The 64,494-line setNullReason error noise will sit in the PM2 error log until rotation.** Future "24h since deploy" assertions that grep this file will need to anchor against a baseline line number or count to avoid false-positive matches. A small future op-hygiene batch should rotate or archive the current `dawntrader-error.log` (and ideally configure pm2-logrotate for ongoing daily rotation) so subsequent batches land against a clean baseline. Tracked as a deferred op-hygiene follow-up — explicitly OUT OF SCOPE for HYGIENE and for the broader B79.0n umbrella.

### Artifact correction (Langston Step 8 nit)

The Step 7 verification artifact at `Claude Comms and Packages/Langston Design Asks/B79_0n_HYGIENE_STEP_7_VERIFICATION.md` says "PM2 process online uptime 6h+ as of verification time" in §1.1. **The actual uptime at verification was 40-50 minutes** (process `created at 2026-05-21T07:10:44.183Z`, verification window 07:50-08:00 UTC). Trivial wording error; the boot smoke test timestamp IS process birth so "6h+" was logically impossible. Corrected here for the governance record.

---

## §1 — Scope objectives — all GREEN

### Item (a) — `setNullReason` ReferenceError regression-protection fence

| # | Objective | Status | Evidence |
|---|---|---|---|
| (a)1 | Pre-audit identifies whether the bug is live or already-resolved | ✅ GREEN | Step 2 pre-audit §3 — bug ALREADY RESOLVED by current bundle; 240s observation confirmed zero new errors |
| (a)2 | Sister-bug enumeration: zero missing-import bugs across all helper users | ✅ GREEN | Step 2 pre-audit §4.1 — 13/13 files verified (10 strategy files + strategy-engine + vts-runner + xstock_spot eval-cycle) |
| (a)3 | Concurrency-safety re-check: no Promise.all in detect path | ✅ GREEN | Step 2 pre-audit §4.2 — zero hits |
| (a)4 | Boot-time round-trip smoke test (set → get → assert literal) added to `server/index.ts` | ✅ GREEN | Code at `server/index.ts:24-49`; deployed-bundle smoke test log line at `/var/log/dawntrader/out.log:2026-05-21 07:10:45 +00:00: [BOOT][B79.0n.HYGIENE] null-reason-tracker smoke test OK` |
| (a)5 | Import-hygiene regression unit test added | ✅ GREEN | `server/tests/unit/b79-0n-hygiene-null-reason-import-hygiene.test.ts` (170 lines); CI run 26183295741 Test Suite shows all 14 file-level assertions pass (one per helper user) |
| (a)6 | `process.exit(1)` fail-fast on smoke-test failure | ✅ GREEN | Code at `server/index.ts:33` (mismatch branch) + `:46` (exception branch); not triggered in production (PM2 process online, no restart loop) |

### Item (b) — 5-symbol Kraken-gap registry trim

| # | Objective | Status | Evidence |
|---|---|---|---|
| (b)1 | 5 symbols (BITF/HOLX/PARA/SAGE/WBA) removed from `XSTOCK_SPOT_REGISTRY` | ✅ GREEN | `shared/asset-classes.ts:306,386,451,482,527` — 5 entries replaced with comment markers (Langston Step 8 verified line numbers) |
| (b)2 | `XSTOCK_SPOT_REGISTRY.size === 260` (down from 265) | ✅ GREEN | Verified via direct `tsx` import on staging: `registry size: 260` + UI Pipeline Summary renders "260 unique" |
| (b)3 | `XSTOCK_SPOT_SYMBOLS.size === 260` (derived Set stays in sync) | ✅ GREEN | Verified via direct `tsx` import: `symbols set size: 260` |
| (b)4 | 5 symbols removed from `server/config/xstocks-universe.json` (sync invariant per SIM line 1773) | ✅ GREEN | JSON validates; 260 symbols; all 5 absent (`python3 -c "json.load(...)"` confirmation) |
| (b)5 | Consolidated `KNOWN_NONEXISTENT_NAMES` entry added per CLAUDE.md §5 #14 | ✅ GREEN | `server/services/utils/symbol-canonicalizer.ts:50-59` — 9-field schema-compatible entry covering all 5 symbols |
| (b)6 | Sector-coverage hard pre-flight: XLV/XLK/XLC/XLP all ≥7 post-trim | ✅ GREEN | XLV 42→40, XLK 39→38, XLC 22→21, XLP 15→14 — verified pre-deploy + new test `server/tests/unit/b79-0n-hygiene-registry-trim.test.ts` enforces |
| (b)7 | Existing size-assert test updated (`b-phase-a2-xstock-eval-cycle-dbs.test.ts:33` 265→260) | ✅ GREEN | Test passes in CI run 26183295741 |
| (b)8 | New registry-trim regression test asserts retired symbols absent + size === 260 + sector floors | ✅ GREEN | `server/tests/unit/b79-0n-hygiene-registry-trim.test.ts` (95 lines); all assertions pass in CI |
| (b)9 | No DB row deletion (per Langston Step 1 Q5 ACK) | ✅ GREEN | Historical zero-row partitions in `xstock_spot_ohlc_1m_*` untouched; benign |

### Crypto regression invariant (umbrella §2.3)

| Metric | Threshold | Outcome |
|---|---|---|
| Crypto code paths touched | None | ✅ HYGIENE is xstock-only + null-reason-tracker (asset-class-agnostic) |
| FX5 pool size 24h | ±5% | N/A (pre-WIRE-IN crypto-only baseline; HYGIENE doesn't affect crypto scanner) |
| Signal generation rate 24h | ±5% | N/A (same) |
| VTS trade rate 24h | ±5% | N/A (same) |
| Active trade-open rate | ±1-2 trades/day OR ±15% 7d | N/A (active trading still OFF) |

**Crypto regression: NONE by construction.** The boot smoke test runs once at startup; the registry trim is xstock_spot-side only; the KNOWN_NONEXISTENT_NAMES entry is documentation-only. Zero touch to crypto pairs, crypto scanner, crypto VTS, or crypto execution paths.

---

## §2 — Governance files changed

### Tier 1 (mandatory)

- `1-system-manual/BATCH_CATALOG.md` — new HYGIENE entry below B-NEW-36
- `1-system-manual/PHASE_HISTORY.md` — Phase 24 HYGIENE close note
- `.claude/memory/MEMORY.md` (truth file at user-cache) — volatile state block updated
- `.claude/memory/MEMORY.md` (in-repo persistence mirror) — same content
- `Claude Comms and Packages/Scope Files/B79_0n_HYGIENE_SCOPE.md` — already committed at commit `8d34a5730`
- `Claude Comms and Packages/Batch Completion/B79_0n_HYGIENE_COMPLETION_REPORT.md` — this report

### Tier 2 (applicable)

- `1-system-manual/RUNNING_ISSUES.md` — #121 RESOLVED; #120 status updated (5 symbols TRIMMED from live registry; full #120 closure remains DEFERRED pending Kraken-side investigation method)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — Recent Additions block for B79.0n.HYGIENE; null-reason-tracker entry updated to note the boot-time round-trip smoke test fence; XSTOCK_SPOT_REGISTRY entry updated to note dynamic-universe-discovery follow-up scoped as B79.0n.UNIVERSE-DISCOVERY
- `1-system-manual/SYSTEM_MANUAL.md` — boot-time round-trip smoke test architecture documented under Chapter 11 (Testing / Boot Integrity Checks)
- `1-system-manual/CHANGES_AND_FIXES.md` — entry for setNullReason regression fence + 5-symbol trim

### Langston MEMORY sync (per CLAUDE.md §10.b)

- `/home/langston/MEMORY.md` on Hetzner (`204.168.141.77`) — updated with HYGIENE close + UNIVERSE-DISCOVERY-pending-as-next state block

---

## §3 — Files modified by this batch

| File | Type | Change |
|---|---|---|
| `shared/asset-classes.ts` | MOD | 5 registry entries replaced with comment markers (BITF/HOLX/PARA/SAGE/WBA); size 265→260 |
| `server/config/xstocks-universe.json` | MOD | Same 5 symbols removed from JSON universe; `_comment` updated to reflect new 260 count + must-stay-in-sync invariant; `_lastUpdated` 2026-04-30 → 2026-05-20 |
| `server/services/utils/symbol-canonicalizer.ts` | MOD | Consolidated `KNOWN_NONEXISTENT_NAMES` entry added (9-field schema covering all 5 symbols) |
| `server/index.ts` | MOD | `setNullReason`/`getNullReason`/`resetNullReason` imported; boot-time round-trip smoke test added with `process.exit(1)` on failure |
| `server/tests/unit/b-phase-a2-xstock-eval-cycle-dbs.test.ts` | MOD | Size assert 265 → 260; comment notes B79.0n.HYGIENE rationale |
| `server/tests/unit/b79-0n-hygiene-null-reason-import-hygiene.test.ts` | NEW | Import-hygiene regression test; comment + string-literal stripping; per-file assertion (codeRefCount > 0 ⇒ import present); skips definition file + test files; 170 lines including the known-limitations docstring |
| `server/tests/unit/b79-0n-hygiene-registry-trim.test.ts` | NEW | 5-symbol absent assertions + size === 260 + per-sector floor checks (XLV/XLK/XLC/XLP all ≥7 + total distinct ≥7); 95 lines |

LOC delta: +919 / -14 (per `git diff --stat` on the primary commit `c18704eed`). New test files dominate the +919.

---

## §4 — CI status at deploy

| Job | Status | Notes |
|---|---|---|
| Build | ✅ GREEN | esbuild bundle succeeded |
| Docker Build | ✅ GREEN | image built |
| Test Suite | ⚠️ RED (PRE-EXISTING only) | Failing tests: b72-dbs-routing-guards-consistency / b70-run-mode-controller / cost_telemetry / dynamic_sizing — same failures present in the umbrella governance commit (`6e9810171`) immediately preceding this batch. Both new B79.0n.HYGIENE test files PASSED. |
| TypeScript Check | ⚠️ RED (PRE-EXISTING only) | client/src/* type drift errors unchanged from prior commits |

Decision per Kyle 2026-05-21 AskUserQuestion: deploy-now (recommended). Surfaced the pre-existing red explicitly; not introduced by HYGIENE; the deploy went forward because the bundle + new tests confirm HYGIENE's narrow surface is clean.

---

## §5 — Asset-class onboarding workflow learnings (CLAUDE.md §3.3 — mandatory through Phase 24)

### (a) What worked well — patterns reusable for next asset class

1. **Pre-audit-driven scope refinement.** The Step 2 pre-audit surfaced the headline finding — bug already resolved by current bundle — which inverted item (a) from "find and fix the missing import" to "structural fence against future regression." That re-shaping in pre-audit (with Langston's explicit Q1 (A) ACK) is exactly how the workflow is supposed to work. Next asset-class onboarding: trust the pre-audit step to surface surprises; don't over-commit to pre-pre-audit hypotheses.

2. **Verification anchor pattern.** Every Langston dispatch in this batch (Step 1 ACK, Step 2 ACK, Step 4 ACK, Step 8 ACK) included a "quote one of these verbatim" verification anchor. Every reply quoted one. Confirmed Langston actually read the artifact each time rather than reasoning from cached context. Worth keeping as standard practice.

3. **Embedded-diff-inline for code reviews (CLAUDE.md §6.5.0.a).** Step 4 dispatch embedded all five diffs inline in the change list rather than pointing Langston at the repo. He ACK'd in ~3 minutes with no GDrive FUSE hang. The two new test files were ALSO staged on his inbox for full inspection. Continue this pattern.

4. **Boot-time round-trip smoke test as a structural fence.** Beyond catching the specific `setNullReason` case, this pattern is reusable for any shared-utility module that's heavily call-site-imported: write a tiny boot-time set-get-assert that exercises the helper round-trip with `process.exit(1)` on failure. Catches bundling drift early and loudly. Worth proposing as a standard onboarding pattern (see §5.d below).

### (b) What surprised us — pitfalls future asset-class onboardings should avoid

1. **Hardcoded asset-class registry is a long-term architectural cost.** The most significant surprise of this batch wasn't the setNullReason finding — it was Kyle's mid-implementation observation that `XSTOCK_SPOT_REGISTRY` being hand-maintained will scale poorly as Kraken keeps adding tokenized stocks. Crypto-side does NOT have this problem because Kraken's REST `AssetPairs` endpoint returns the live universe and the scanner adapts to whatever comes back. xStock-side has it because Kraken's public REST API does not index xStock instruments — they only stream via WS-equities. **This is a recurring structural pattern (§5.c #1) that should be solved up-front for the next asset class.** The next batch in the umbrella, `B79.0n.UNIVERSE-DISCOVERY`, exists specifically to convert xStock from hand-curated registry to dynamic discovery via CoinGecko + Kraken WS probe + Finnhub metadata lookup. Future onboardings (perpetual futures, additional spot classes) should follow this pattern from day one.

2. **Bundle non-determinism produced silent log-noise accumulation.** The 64,494 historical `setNullReason is not defined` occurrences sat in the PM2 error log without anyone noticing — they were inside catch-blocks (`console.warn`), so they didn't break the VTS sim cycle (it continued with the offending pair skipped), and the surface area was "stderr only" so no UI surfaced them. Kyle only discovered them because Langston grep'd the error log during B-NEW-36 sub-batch (b) Step 8 verification. **Future onboardings: include a "grep PM2 error log for accumulated noise" step in the pre-audit checklist for every batch that touches a strategy detector or shared-utility import.**

3. **CI was already red on pre-existing failures.** This batch had to push on top of red CI (TS Check + Test Suite both red on legacy issues). The umbrella governance commit immediately preceding HYGIENE had the same red status. Future onboardings: explicitly state CI baseline at deploy time, distinguish "your batch introduced this red" vs "this red was already here." Otherwise red-on-red becomes ambiguous and Kyle has to surface the question himself.

### (c) Recurring structural patterns observed across asset-class boundaries

1. **Universe-discovery pattern (CRITICAL NEW FINDING).** Crypto auto-discovers from a REST `AssetPairs` catalog. xStock requires hand-curated registry because the equivalent endpoint doesn't exist. The next asset class (perpetual futures) has its own discovery mechanism — Kraken Futures `https://futures.kraken.com/derivatives/api/v3/instruments` lists all perp + futures instruments dynamically. **Generic pattern: every asset class needs a "live universe discovery" mechanism documented up-front.** For asset classes where the exchange doesn't expose a list-all endpoint, the onboarding workflow must explicitly call out the discovery-source chain (e.g., CoinGecko + WS probe for xStock; exchange-specific REST endpoint for perp/futures) and require it to be built BEFORE the registry is treated as load-bearing.

2. **Metadata-lookup pattern.** Per-symbol metadata (GICS sector for B-PHASE-A2 DBS, ADR flag, cryptoAdjacent flag for crypto-correlated equities) can't be auto-derived from the exchange. It requires an external lookup source — Finnhub, yfinance, or equivalent. The current hardcoded registry conflates "list of symbols" with "metadata per symbol"; the universe-discovery refactor will separate them. **Generic pattern: split universe discovery from metadata lookup.** Universe comes from the exchange; metadata comes from a fundamentals data source.

3. **Sector-floor enforcement is a load-bearing test pattern.** The B-PHASE-A2 sector-coverage floor of 7 distinct sectors is a constraint that's easy to violate by accident if someone retires symbols without checking. The new `b79-0n-hygiene-registry-trim.test.ts` enforces per-sector-count assertions as a structural safety net. **Generic pattern: any batch that removes symbols from a curated set must include per-sector / per-category floor assertions in unit tests.** Not enough to assert total count.

4. **Drift-guard test patterns: prefer range over exact-equality.** The existing `b-phase-a2-xstock-eval-cycle-dbs.test.ts:33` asserts `size === 265` (now 260). This breaks every time a symbol is added or removed, forcing a test edit. **Generic pattern: prefer `size >= MIN && size <= MAX` range assertions over `size === N` exact-equality.** Same drift-guard effect; doesn't break when the universe legitimately grows/shrinks. The next sub-batch (UNIVERSE-DISCOVERY) will convert the existing exact-equality asserts to range-based.

### (d) Concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`

Propose adding these to the workflow doc as part of the Phase 24 end-of-arc consolidation:

1. **NEW Section "Step 0.5 — Universe-discovery source chain."** Required BEFORE any other onboarding step. Document:
   - Does the exchange expose a list-all REST endpoint for this asset class? (yes/no)
   - If yes: the registry is a thin cache over that endpoint; refresh per-cycle.
   - If no: identify the discovery-source chain (e.g., external aggregator + exchange-specific probe). Document each source's reliability, refresh cadence, fallback strategy.
   - Identify the per-symbol metadata source separately (sector, fundamentals, custom flags).

2. **NEW pre-audit-checklist item: "Grep PM2 error log for accumulated noise."** Add to standard pre-audit Step 2 checklist for any batch touching shared utilities, strategy detectors, or boot-orchestration paths. Catches silent catch-block noise like the 64,494 setNullReason historical occurrences.

3. **NEW test-pattern recommendation: range-based drift guards.** Add to the testing section. Prefer `size >= MIN && size <= MAX` over `size === N`. Document the rationale: exact-equality breaks every universe expansion; range catches accidental wipe-out without forcing test edits on intentional growth.

4. **NEW boot-integrity-check section.** Document the boot-time round-trip smoke-test pattern as standard for any shared-utility helper that's heavily call-site-imported. Set → get → assert literal → reset, with `process.exit(1)` on failure. Catches bundling drift early.

5. **NEW disclaimer/transparency-pattern recommendation.** When a pre-audit surfaces that a historical bug has already self-resolved, prefer "structural fence + documented disclaimer" over "archaeological bisect + RCA." Document the three-disclaimer pattern from this report (pre-current-bundle / root-cause-unverified / op-hygiene flag) as reusable.

---

## §6 — Sequencing impact: umbrella v3 restructuring

**HYGIENE closes 2026-05-21.** Umbrella v2 had STORAGE as sub-batch #2. Per Kyle directive 2026-05-21 PM (mid-batch design conversation about the hardcoded-registry pattern), **a new sub-batch `B79.0n.UNIVERSE-DISCOVERY` is inserted as sub-batch #2 between HYGIENE and STORAGE.** Total sub-batch count grows from 17 → 18. All other sub-batches shift down by one (STORAGE 2→3, MCE 3→4, ..., WIRE-IN 15→16, ML-CALIBRATION 16→17, OBSERVABILITY 17→18). The umbrella file `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` is updated to rev 3 with the insertion + reasoning. Langston dispatch for concurrence on the umbrella restructuring goes out at the same time as the UNIVERSE-DISCOVERY Step 1 scope.

UNIVERSE-DISCOVERY's purpose: replace the hardcoded `XSTOCK_SPOT_REGISTRY` with a dynamically-populated universe sourced from a chain of three external services (CoinGecko for tokenized-stock catalog + Kraken WS probe for current acceptance + Finnhub for per-symbol metadata). This is the architectural fix for the structural pattern documented in §5.c #1 above.

---

## §7 — Cross-batch references

| Reference | Where | What |
|---|---|---|
| Scope | `Claude Comms and Packages/Scope Files/B79_0n_HYGIENE_SCOPE.md` (commit `8d34a5730`) | Step 1 scope including §10 ACK iteration outcomes |
| Pre-audit | `Claude Comms and Packages/Scope Files/B79_0n_HYGIENE_PRE_AUDIT.md` (commit `c18704eed`) | Step 2 pre-audit + Langston Q1=A/Q2-tighten/Q3 ACK |
| Change list | `Claude Comms and Packages/Change Lists/B79_0n_HYGIENE_CHANGE_LIST.md` (commit `c18704eed`) | Step 4 code review embedded-diff dispatch |
| Step 7 verification | `Claude Comms and Packages/Langston Design Asks/B79_0n_HYGIENE_STEP_7_VERIFICATION.md` (this commit) | Step 7 CC verification artifact for Step 8 second-pass |
| Parent umbrella | `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (rev3 pending) | Will update with UNIVERSE-DISCOVERY insertion |
| Verbatim Langston relays | Telegram topic 21 | msgs 4039/4040 (Step 1), 4042/4043 (Step 2), 4045/4046 (Step 4), 4048 (Step 8) |
| RUNNING_ISSUES #121 | RESOLVED in this batch | setNullReason ReferenceError class — fenced via boot smoke test + import-hygiene unit test |
| RUNNING_ISSUES #120 | PARTIALLY ADDRESSED in this batch | 5 symbols trimmed from live registry + logged to KNOWN_NONEXISTENT_NAMES; full closure (positive Kraken-side absence confirmation) remains DEFERRED |

---

## §8 — Step 8 Langston ACK (verbatim)

> Step 8 ACK — B79.0n.HYGIENE second-pass verification PASSED.
> [...8-row check table all GREEN...]
> CC: clear to proceed to Step 10 governance + Step 11 completion report with the three mandatory disclaimers + asset-class onboarding learnings section.

Full verbatim at Telegram topic 21 msg 4048.

---

— Claude Code, 2026-05-21 (B79.0n.HYGIENE — CLOSED)
