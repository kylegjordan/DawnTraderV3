# B79.0n.HYGIENE — Step 1 scope (sub-batch 1 of 17 in B79.0n umbrella arc)

> **Parent umbrella:** `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (rev 2 Langston FINAL ACK, commit `6e9810171`).
> **Position:** sub-batch 1 of 17 — first in locked sequence. Independent (no STORAGE dep). Sized as "small, fast, clears noise before bigger work."
> **Phase:** Phase 24 (multi-asset onboarding) — CLAUDE.md §3.3 learning-capture rule applies.
> **Active trading status:** stays OFF (per umbrella §0 — entire arc is end-to-end-ready architecture; live enablement is the Phase 19 gate).

---

## §1 — Objective

Two small hygiene fixes that have been blocking pipeline log signal and registry cleanliness; getting them out of the way before STORAGE (the foundational asset-class-awareness batch) so the bigger work isn't competing with log-noise diagnostics.

**(a) `setNullReason is not defined` ReferenceError (RUNNING_ISSUES #121).** PM2 error log has repeated stack traces at the `callStrategyDetect → generatePhase10Signal → runPhase10SimulationCycle` path, observed on crypto_spot symbols including NIGHT/USD and USELESS/USD. The helper IS correctly defined at `server/utils/null-reason-tracker.ts:9-19` (named exports `setNullReason` / `getNullReason` / `resetNullReason`). The error therefore points to one or more strategy detector files that call `setNullReason(...)` without importing the helper — a missing-import bug, not a renamed-helper bug. The fix is finding the offending file(s) and wiring the imports. Sister-issue tracking debt (umbrella §2.5 category-c bug-found-in-passing): pre-audit also enumerates whether any other strategy detector silently fails an analogous undefined-helper path.

**(b) 5-symbol Kraken-gap registry trim (RUNNING_ISSUES #120, currently DEFERRED).** Five symbols (BITF / HOLX / PARA / SAGE / WBA) have zero OHLC rows in `xstock_spot_ohlc_1m` partitions for both April AND May 2026 across our 2-month archive window. B-NEW-36 sub-batch (c) traced the cause to Kraken's xStock product not carrying these via WS-equities — but could not positively confirm "non-existent on Kraken side" because Kraken's public AssetPairs API doesn't index xStocks at all (their xStock instruments route exclusively through `wss://ws-equities.kraken.com` and there's no public introspection endpoint). #120 remains DEFERRED for full closure pending a Kraken-side investigation method. This sub-batch does NOT close #120 — it removes the 5 dead-weight symbols from `shared/asset-classes.ts:XSTOCK_SPOT_REGISTRY` so the live universe reflects what Kraken actually carries, AND logs them to `KNOWN_NONEXISTENT_NAMES` per CLAUDE.md §5 #14 with a clear "deferred pending Kraken-side investigation" annotation so the institutional memory entry references back to the open issue. Scanner active universe is unaffected (scanner already reads 73-74 of 75 rotation universe per cycle); this is dead-weight cleanup, not a behavioral change.

**Why this batch is in the asset-class-awareness arc:** the umbrella §0 framing says "the entire active-trading pipeline has systemic asset-class-awareness gaps." HYGIENE itself doesn't add asset-class branching, but (a) the `setNullReason` reference error is contaminating the VTS simulation log signal that STORAGE will need to read cleanly to verify its silent-crypto-fallback audit, and (b) the registry trim removes 5 zero-data xstock_spot symbols whose presence pollutes any future xstock_spot-specific telemetry. Clearing the noise floor first is what makes this sub-batch a precondition for the rest of the arc.

---

## §2 — Pre-audit checklist (Step 2 — runs before any code edits)

### §2.1 — Standard 11-step disciplines (CLAUDE.md §2 + umbrella §2.1)

- [ ] Read `1-system-manual/SYSTEM_IMPACT_MAP.md` for every component this batch touches:
    - Strategy detector files in `server/strategies/` + in-class `detect*` methods in `server/services/strategy-engine.ts`
    - `server/utils/null-reason-tracker.ts` (helper module)
    - `shared/asset-classes.ts` (`XSTOCK_SPOT_REGISTRY` + `XSTOCK_SPOT_SYMBOLS` set derived from it)
    - `server/services/utils/symbol-canonicalizer.ts` (`KNOWN_NONEXISTENT_NAMES` registry)
    - For each: trace upstream feeders, downstream consumers, shared state, background execution, blast radius.
- [ ] Read `1-system-manual/SYSTEM_MANUAL.md` for the canonical architecture of the strategy detector → null-reason-tracker → Phase 10 simulation flow.
- [ ] Document the analysis in `BATCH_B79_0n_HYGIENE_PRE_AUDIT.md`.

### §2.2 — `setNullReason` reference-error root-cause trace (in-scope item (a))

- [ ] **Step 2.2.a — instrumented PM2 capture.** SSH staging, tail PM2 error log, grep for the specific ReferenceError stack and capture FULL stack trace + symbol context. Compare against `dist/index.js:34492` to back-map to source file. Document: file path, function name, line number(s) where `setNullReason` is called without import.

```bash
ssh root@188.245.193.8 'su - deploy -c "pm2 logs dawntrader --err --lines 500 --nostream 2>&1 | grep -B 2 -A 20 \"setNullReason is not defined\" | head -200"'
```

- [ ] **Step 2.2.a (cont.) — pre-deploy baseline count (Langston Q7b add 2026-05-20).** From the same log buffer, capture the count of `setNullReason is not defined` occurrences per 24h pre-deploy. This anchors the §5.1 criterion 1 zero-window assertion: "X pre-deploy → 0 post-deploy" is the proof shape. If pre-deploy fires only 1x/week, a 24h post-deploy zero window is statistically weak and the window expands per pre-audit judgement.

```bash
ssh root@188.245.193.8 'su - deploy -c "pm2 logs dawntrader --err --lines 5000 --nostream 2>&1 | grep -c \"setNullReason is not defined\""'
```

- [ ] **Step 2.2.b — grep for ALL `setNullReason` call sites in the source tree.**

```bash
# In repo root, identify every call site:
grep -rn "setNullReason" server/ --include="*.ts" | grep -v ".test.ts" | grep -v "node_modules"
```

- [ ] **Step 2.2.c — for each call site, verify the file has the import.** Expected import shape: `import { setNullReason } from '../utils/null-reason-tracker';` (relative path varies). Any call site missing the import is a bug.
- [ ] **Step 2.2.d — sister-bug enumeration (umbrella §2.5 category-c).** While the file is open, grep for other named exports from `null-reason-tracker.ts` (`getNullReason`, `resetNullReason`) and verify those have imports where called. Also grep for any other shared-utility helpers commonly called from strategy detectors (`recordRejection`, `markGated`, `setStratNullCategory` etc.) and verify import hygiene across the strategy detector set. Document any other missing-import bugs surfaced; decide per-bug whether to absorb into this batch (small + contained) or spawn separately.
- [ ] **Step 2.2.e — concurrency-safety re-check.** The null-reason-tracker module-doc says "safe ONLY because the VTS evaluation pipeline is strictly serial." Verify that no `Promise.all` / parallel-detect pattern has been introduced since the assumption was written (B31). If concurrent execution has appeared anywhere in the detect path, that's a deeper bug than HYGIENE can absorb — flag and spawn separately.

### §2.3 — 5-symbol Kraken-gap registry trim audit (in-scope item (b))

- [ ] **Step 2.3.a — confirm symbol set.** Read `shared/asset-classes.ts:271-540` to confirm exact line numbers and entries for the five symbols. Lines as of commit `6e9810171`: BITF/USD line 306, HOLX/USD line 386, PARA/USD line 451, SAGE/USD line 482, WBA/USD line 527.
- [ ] **Step 2.3.b — `XSTOCK_SPOT_SYMBOLS` consumer audit.** `XSTOCK_SPOT_SYMBOLS` (line 544) is derived from the registry via `new Set(XSTOCK_SPOT_REGISTRY.keys())`. Grep every consumer of `XSTOCK_SPOT_SYMBOLS` and `XSTOCK_SPOT_REGISTRY` to confirm none of them have side effects from removing 5 keys.

```bash
grep -rn "XSTOCK_SPOT_REGISTRY\|XSTOCK_SPOT_SYMBOLS" server/ shared/ scripts/ --include="*.ts"
```

- [ ] **Step 2.3.b (cont.) — extended stale-reference grep (Langston Q7a add 2026-05-20).** Beyond registry consumers, grep the entire tree for stale literal references to the 5 symbols. Likely hits: test fixtures, scope files, dev scripts, comments. A test fixture asserting `XSTOCK_SPOT_REGISTRY.has('BITF/USD')` would fail post-trim. Per-hit decision: source-code references get updated; docs/scope-file historical references usually fine to leave with a footnote.

```bash
grep -rn "BITF/USD\|HOLX/USD\|PARA/USD\|SAGE/USD\|WBA/USD" server/ shared/ scripts/ tests/ --include="*.ts" --include="*.md"
```

- [ ] **Step 2.3.c — sector-coverage gate re-check.** B-PHASE-A2's "sector-coverage 7" floor depends on sector diversity across the registry. Confirm that removing the 5 symbols still satisfies coverage of ≥7 sectors. Specifically: BITF (XLK cryptoAdjacent), HOLX (XLV), PARA (XLC), SAGE (XLV), WBA (XLP) — verify each of those sectors has ≥1 other symbol remaining post-trim.
- [ ] **Step 2.3.d — backfill table / snapshot table impact.** `xstock_spot_ohlc_60m_snapshot` (B-NEW-34b) has 260 distinct symbols populated (gap was the 5 we're trimming). No DB row deletion needed; the symbol set in the registry only controls forward scanning, not historical data.
- [ ] **Step 2.3.e — `KNOWN_NONEXISTENT_NAMES` entry design.** Read `server/services/utils/symbol-canonicalizer.ts:39-50` for the existing entry shape. New entry must match the `as const` schema (exchange / type / badName / badContext / correctAlternative / dateDiscovered / reason / ref). One entry per of the 5 symbols OR one consolidated entry covering all 5 — decide based on whether they share enough context. Currently leaning toward ONE consolidated entry because the bad-context and reason are identical across the 5; cross-references to RUNNING_ISSUES #120 + B-NEW-36 sub-batch (c) trace results.

### §2.4 — Step 4.5 (writer/reader asset-class enumeration) — N/A for this batch

Neither in-scope item adds new storage-API call sites or new asset-class branching. Step 4.5 discipline does not apply to HYGIENE. STORAGE will be the first sub-batch where this fully exercises.

### §2.5 — Step 4.6 (block-scope rename audit) — N/A for this batch

No renames in scope. N/A.

### §2.6 — Step 4.7 (scan-cycle read-side data-completeness) — N/A for this batch

No scan-cycle read-side changes. N/A.

### §2.7 — Umbrella §2.5 obvious-bug-in-passing review

Pre-audit explicitly surfaces (and documents) any category-c bug-found-in-passing during the §2.2 grep and §2.3 audit. For each: decide absorb-into-this-batch vs spawn-separately based on size + containment + Phase-19-risk. Document decisions in pre-audit + completion report.

**Absorb-ceiling (Langston Q3 counter-propose 2026-05-20 — accepted by CC):** cap at **3** missing-import absorptions of the same shape as item (a) (single-file, single-line import-add, ≤5 LOC each, no behavioral logic change). 4+ → spawn a sibling HYGIENE.2 batch because "small, fast" framing stops being honest past 3 + primary fix. Any non-import-shape bug (renamed helper, logic, concurrency including the §2.2.e Promise.all check) → spawn regardless of size.

---

## §3 — Code changes

### §3.1 — `setNullReason` ReferenceError fix (item (a))

**Files modified:** TBD — pre-audit identifies the exact file(s) and lines.

**Change shape (typical case):**
```typescript
// Top of the offending strategy detector file:
+ import { setNullReason, getNullReason } from '../utils/null-reason-tracker';
//                                                  ^ adjust relative path per file location
```

If pre-audit surfaces 1 file: single import-add. If pre-audit surfaces N files: import-add to each. No behavioral change beyond restoring the tracker semantics. Document the actual file:line list in the completion report.

### §3.2 — 5-symbol registry trim (item (b))

**File modified:** `shared/asset-classes.ts`

**Lines deleted (5 lines, by current line number; will shift down as deletions stack):**
- Line 306: `['BITF/USD', { name: 'Bitfarms', sector: 'XLK', cryptoAdjacent: true }],`
- Line 386: `['HOLX/USD', { name: 'Hologic', sector: 'XLV' }],`
- Line 451: `['PARA/USD', { name: 'Paramount Global', sector: 'XLC' }],`
- Line 482: `['SAGE/USD', { name: 'Sage Therapeutics', sector: 'XLV' }],`
- Line 527: `['WBA/USD', { name: 'Walgreens Boots Alliance', sector: 'XLP' }],`

Post-trim registry size: 265 → 260 entries. Matches the populated count in `xstock_spot_ohlc_60m_snapshot`.

### §3.3 — `KNOWN_NONEXISTENT_NAMES` entry

**File modified:** `server/services/utils/symbol-canonicalizer.ts`

**Lines added (inside the `KNOWN_NONEXISTENT_NAMES` `as const` array, before `] as const;` on line 50):**

```typescript
  {
    exchange: 'Kraken (xStock product / ws-equities feed)',
    type: 'xStock symbol with zero data in 2-month archive window',
    badName: 'BITF/USD, HOLX/USD, PARA/USD, SAGE/USD, WBA/USD',
    badContext: 'Five xStock symbols in shared/asset-classes.ts:XSTOCK_SPOT_REGISTRY had zero OHLC rows in both xstock_spot_ohlc_1m (April + May 2026) and xstock_spot_ohlc_60m_snapshot (260 of 265 symbols populated). Tickers are valid US equities (Bitfarms / Hologic / Paramount Global / Sage Therapeutics / Walgreens Boots Alliance).',
    correctAlternative: 'No positive confirmation available. Kraken public AssetPairs API does not index xStocks at all (their xStock instruments route exclusively through wss://ws-equities.kraken.com with no public introspection endpoint). B-NEW-36 sub-batch (c) confirmed AssetPairs returns EQuery:Unknown asset pair for ALL xStock symbols including known-good AAPL/TSLA/AMZN. Operationally: do NOT re-add these five to XSTOCK_SPOT_REGISTRY without first verifying Kraken-side support via a method that surfaces in a future "Kraken xStock universe audit" mini-batch.',
    dateDiscovered: '2026-05-20',
    reason: 'Zero rows across 2 months in our archive despite registry inclusion. xStock product carries only a subset of US-listed equities and the subset has shifted at least once during this archive window (possible delisting, never-tokenized, or different symbol form on Kraken side — unverifiable via public API).',
    ref: 'RUNNING_ISSUES #120 (DEFERRED — Kraken-side investigation gated). B-NEW-36 sub-batch (c) trace report 2026-05-20. B79.0n.HYGIENE registry trim 2026-05-20.',
  },
```

**Note on the array shape:** the existing entry is `badName: string` (singular). This new entry uses `badName: 'BITF/USD, HOLX/USD, PARA/USD, SAGE/USD, WBA/USD'` (comma-separated multi-symbol form). Acceptable since the field is plain string and the registry is documentation-only (not runtime-consumed); the consolidated form keeps the institutional-memory entry compact. Alternative shape (5 separate entries) discussed in §9 open questions.

### §3.4 — Files NOT modified in this batch

- No DB migration. No schema change. Registry is in-process TypeScript only.
- No `xstock_spot_ohlc_*` table row deletions. Historical data preserved as-is.
- No scanner code changes. Active universe shrinks from 73-74 of 75 to 73-74 of 70 automatically.
- No B-PHASE-A2 telemetry change. Sector floor computation uses live registry; reads will reflect the smaller set on next scanner cycle.

---

## §4 — Unit tests

### §4.1 — `setNullReason` import fix

- [ ] Unit test for each file where the import was added: smoke-test that the detector's `null` return path correctly sets the reason without throwing. Test shape (TBD per file): mock the detector inputs that force a null return, call it, verify no ReferenceError thrown and `getNullReason()` returns the expected reason string.

### §4.2 — Registry trim

- [ ] Unit test: `XSTOCK_SPOT_REGISTRY.has('BITF/USD')` returns `false` (and same for HOLX / PARA / SAGE / WBA).
- [ ] Unit test: `XSTOCK_SPOT_REGISTRY.size === 260`.
- [ ] Unit test: `XSTOCK_SPOT_SYMBOLS.size === 260` (derived set stays in sync).
- [ ] Unit test: per-sector coverage gate — count distinct sectors across remaining 260 entries; assert `>= 7` (B-PHASE-A2 floor).
- [ ] Unit test: each of the 5 sector-coverage assertions individually — XLK / XLV / XLC / XLP each have ≥1 remaining entry (XLV had 2 before, must have ≥1 after; etc.). Specific counts confirmed in pre-audit.

### §4.3 — `KNOWN_NONEXISTENT_NAMES` entry

- [ ] Unit test: the new entry exists in the array (assert by `badName` substring match for one of the five).
- [ ] Unit test: `KNOWN_NONEXISTENT_NAMES.length === 2` (was 1 with the Kraken Futures `candles_trade_1m` entry; now 2).

---

## §5 — Acceptance criteria

### §5.1 — Functional gates (in-scope items)

1. **`setNullReason` ReferenceError eliminated from PM2 error log.** Step 7 verification: SSH staging, grep PM2 error log over a 24h post-deploy window, assert ZERO instances of `setNullReason is not defined`. Window: 24h post-deploy.
2. **Registry trim verifiable.** Step 7 verification: deploy code; restart PM2; `xstock_spot` scanner active universe rotates through 260 symbols only; `/api/xstocks/filter-diagnostics` shows total-symbols=260 (was 265).
3. **`KNOWN_NONEXISTENT_NAMES` entry committed.** Step 7 verification: `grep -n "BITF/USD, HOLX/USD" server/services/utils/symbol-canonicalizer.ts` returns the new entry.

### §5.2 — Crypto regression-lock (umbrella §2.2 — per-metric thresholds)

- [ ] **FX5 pool size** stays within ±5% of pre-deploy 24h baseline. (Should be unaffected — registry trim is xstock_spot-side only.)
- [ ] **Signal generation rate** stays within ±5% of pre-deploy 24h baseline. (Should be unaffected.)
- [ ] **VTS trade rate** stays within ±5% of pre-deploy 24h baseline. (Setting `setNullReason` fix may MARGINALLY change null reason distributions for affected detectors but does not change null-vs-not-null decisions. VTS trade rate should be unaffected.)
- [ ] **Active trade-open rate** within ±1-2 absolute trades/day OR ±15% over 7-day rolling window. (Pre-WIRE-IN: crypto-only baseline. Active trading is OFF; this metric reads from VTS sim closures only — should be unaffected by hygiene fixes.)

### §5.3 — UI verification (CLAUDE.md §9.3 "STAGING-VERIFIED means UI-navigated")

- [ ] Navigate via `mcp__Claude_in_Chrome__navigate` to staging xStocks Diagnostics tab. Verify total-symbols count is now 260, not 265.
- [ ] No UI regression elsewhere — crypto Pipeline Summary, xStocks Pipeline Summary, regime panels all render normally.

---

## §6 — Crypto-regression invariant (umbrella §2.3 — by-construction proof)

**By construction, no part of this batch alters crypto runtime behavior:**

1. **(a) `setNullReason` fix** is restoration of pre-existing behavior. Before the import-add: detector throws `ReferenceError` and the catch-block-wrapped sim-cycle continues with the offending pair skipped + a noisy stack trace. After the import-add: detector returns `null` cleanly with a real null-reason recorded. The set of decisions made on crypto pairs is materially identical (a `null` return → no signal generation for that pair on that cycle either way); only difference is the absence of catch-block noise and proper null-reason categorization. No crypto path changes routing, gating, sizing, or execution.

2. **(b) Registry trim** removes 5 xstock_spot symbols. xstock_spot has no overlap with `fx5-scanner.ts` (the crypto scanner), `signal-orchestrator.ts` crypto routing, or any crypto execution path. Zero touch to crypto pairs.

3. **(c) `KNOWN_NONEXISTENT_NAMES` entry** is a documentation-only addition (the constant is read by humans, not runtime code per the file header). Zero runtime effect on any asset class.

Step 7 crypto regression-lock metric checks (§5.2) provide the empirical confirmation.

---

## §7 — Deferred follow-ups (umbrella §2.5 category-b items found during pre-audit)

Filled in during pre-audit (Step 2). Placeholder structure:

- **Deferred (b):** \<item\> — reason: \<why deferring is the right call\> — destination: \<next-batch / Phase-19-followup / standalone-batch\>.
- **Absorbed (c):** \<item\> — reason: \<why absorbing into this batch is the right call\> — implementation note: \<line ref\>.
- **Sister-issue spawned:** \<item\> — reason: \<why this needs its own batch even though we found it here\> — RUNNING_ISSUES entry filed: #N.

Specifically expected:

- **Sister bug enumeration outcome from §2.2.d** — list of any other missing-import or undefined-helper patterns in the strategy detector set. Decision per item.
- **Concurrency-safety re-check outcome from §2.2.e** — if any `Promise.all` / parallel-detect pattern has appeared, that's spawned as its own batch (NOT absorbed into HYGIENE).

---

## §8 — Asset-class onboarding workflow learnings (CLAUDE.md §3.3)

Placeholder. Filled during Step 11 completion report. Expected categories:

- **(a) What worked well** — patterns / shapes / call-site conventions reusable for next asset class. Specific to HYGIENE: the import-hygiene-grep pattern (§2.2.b-c) generalizes — every new asset-class onboarding should verify all named exports from shared utilities have imports at every call site.
- **(b) What surprised us** — pitfalls. Specific to HYGIENE: latent `ReferenceError`s in catch-wrapped paths can persist for batches without being detected.
- **(c) Recurring structural patterns** observed across asset-class boundaries. Specific to HYGIENE: registry-vs-source-feed mismatch (registry has N entries; source carries M ≤ N). Generic to all asset classes that have a curated symbol registry + an external data feed.
- **(d) Concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`** — possible additions: "Step X.Y: verify registry symbols all have data in source archive table" + "Step X.Y: import-hygiene grep before declaring detector set complete." Specific text drafted in completion report.

If nothing substantive emerges, the section says exactly that (per CLAUDE.md §3.3 — empty is acceptable, no filler).

---

## §9 — Open questions for Langston (Step 1 ACK gate)

**(Q1) `KNOWN_NONEXISTENT_NAMES` entry shape — consolidated vs split?** §3.3 above proposes ONE consolidated entry covering all 5 symbols (single string `badName: 'BITF/USD, HOLX/USD, PARA/USD, SAGE/USD, WBA/USD'`). Alternative shape: 5 separate entries, one per symbol, identical context fields. Consolidated keeps the registry compact and reads naturally as "five symbols, one cause"; split is more grep-friendly per-symbol. CC default: consolidated. Confirm or push back.

**(Q2) `setNullReason` fix — pre-audit before scope finalization?** §2.2.a says "instrumented PM2 capture to identify the file." That investigation IS the pre-audit step (Step 2 of the 11-step workflow). Once pre-audit identifies the actual file(s), §3.1 fills in with the concrete file:line list. Does Langston want a separate "scope rev 2" before implementation, or is "scope says find via grep + fix imports + add tests" sufficient for Step 1 ACK with the file list to land in pre-audit?

**(Q3) Sister-bug enumeration (§2.2.d) — absorb threshold?** §2.7 says CC decides absorb vs spawn per-bug based on size + containment. Langston: is there a hard ceiling (e.g., "if more than 3 sister bugs surface, spawn them all" or "if any sister bug touches more than 2 files, spawn it")? CC default heuristic: a missing-import bug is single-file, low-risk, ≤5 LOC fix → absorb up to ~5 of them; anything broader (renamed helpers, logic bugs, concurrency issues) → spawn.

**(Q4) Sector-coverage post-trim — preflight required?** §2.3.c asks pre-audit to confirm each affected sector still has ≥1 remaining symbol. Should this be a HARD pre-flight (block implementation if any sector drops to 0) or just a documented check? CC default: hard pre-flight; if any sector would drop to 0, that surfaces a deeper xstock_spot universe gap that needs Kyle's call before trim proceeds.

**(Q5) DB row deletion — explicit confirm.** §3.4 says no `xstock_spot_ohlc_*` row deletion. Confirm Langston agrees historical zero-row partitions for the 5 symbols stay in place untouched (smallest blast radius; never re-emitted by scanner; benign).

**(Q6) Unit-test granularity (§4.2).** Five sector-coverage assertions (one per affected sector — XLK / XLV / XLC / XLP — note XLV appears twice; technically 4 distinct sectors across 5 symbols). Is per-sector explicit assertion overkill, or right level of paranoia? CC default: keep per-sector explicit (catches regressions if someone later removes the OTHER XLV symbol unaware that B79.0n.HYGIENE depended on it). Confirm.

**(Q7) Anything in HYGIENE that CC missed that should be in scope?** Per umbrella §2.6 (combine/split autonomy), Langston is welcome to push for combining HYGIENE with STORAGE if the case is strong. CC's current position: keep separate because (a) STORAGE is large and risky, (b) HYGIENE shouldn't be gated on STORAGE's reviews, (c) HYGIENE clears the noise floor that STORAGE's silent-fallback audit will read against.

---

**Reply gate:** **Step 1 ACK** / **specific scope additions/regroupings** / **substantive design disagreement**.

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §12 dispatch-anchoring: this scope file IS the inbox file. Do NOT `cd /mnt/gdrive`. For repo-side inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

— Claude Code, 2026-05-20 PM (B79.0n.HYGIENE Step 1 v1)

---

## §10 — Langston Step 1 ACK + iteration outcomes (2026-05-20 PM)

**Status: Step 1 ACK.** Langston ACK'd scope as sound and "sized correctly as small, fast, clears noise before STORAGE." Verbatim reply relayed to Telegram topic 21 per CLAUDE.md §6.5 step 3.

**Q1-Q2, Q4-Q6: agreed as scoped.** No changes.

**Q3 (counter-propose accepted by CC):** Absorb-ceiling tightened from "up to ~5 missing-import absorptions" to **3** (same-shape only). 4+ → spawn HYGIENE.2. Non-import-shape bugs spawn regardless of size. Edit landed in §2.7.

**Q7a (Langston add — accepted by CC):** Extended stale-reference grep added to §2.3.b. Catches test fixtures / scope-file references / comments holding stale literal references to the 5 symbols.

**Q7b (Langston add — accepted by CC):** Pre-deploy baseline count for `setNullReason is not defined` added to §2.2.a. Anchors §5.1 criterion 1 zero-window assertion as "X pre-deploy → 0 post-deploy" proof shape.

**Consensus achieved.** Step 2 pre-audit proceeds. Langston will review pre-audit doc + §2.2.d sister-bug enumeration + §2.2.e concurrency check before Step 4.

— Claude Code, 2026-05-20 PM (B79.0n.HYGIENE Step 1 v1 — Langston ACK iteration outcomes)
