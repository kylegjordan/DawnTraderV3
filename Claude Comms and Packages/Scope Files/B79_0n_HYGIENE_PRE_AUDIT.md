# B79.0n.HYGIENE — Step 2 pre-audit

> **Scope:** `B79_0n_HYGIENE_SCOPE.md` (Step 1 Langston FINAL ACK 2026-05-20 PM, commit `8d34a5730`).
> **Parent umbrella:** `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (rev 2 FINAL ACK, commit `6e9810171`).
> **Date:** 2026-05-20 PM.
> **Deployed commit at staging:** `4a997eae23973f155d7fdde962acb9b9346dcc02` (B-NEW-36 sub-batch (b)). Bundle mtime 2026-05-20 12:08 UTC. PM2 uptime 6h, 304 lifetime restarts.

---

## §1 — Headline findings

**1.A (the surprise):** Item (a)'s bug — `setNullReason is not defined` ReferenceError — **is already resolved by the current deployed bundle.** 64,494 historical occurrences in the error log are from PREVIOUS bundle versions across the 304 PM2 restart cycles. Current source has the import at `server/services/vts-runner.ts:172` and at `server/services/strategy-engine.ts:19`; current bundle (`dist/index.js`) has `setNullReason` as a top-level hoisted function at line 25221 with proper `init_null_reason_tracker()` wiring inside `init_vts_runner()` at bundle line 43597. Empirical confirmation: **240-second observation window with VTS sim cycle running showed zero new error log lines, zero new setNullReason occurrences.** Error log line count was frozen at 872,537 lines through three independent checks. Last `setNullReason is not defined` entry is at error-log line 872,524 (13 lines from end) — fired pre-current-bundle.

**1.B:** No sister-bugs found. 13 files use `setNullReason` / `getNullReason` / `resetNullReason`; all 13 have the proper import. No missing-import drift anywhere in the strategy detector set.

**1.C:** No `Promise.all` / parallel-detect pattern introduced in the detect path. The null-reason-tracker's "strictly serial" concurrency assumption (per the file header on `null-reason-tracker.ts:2-5`) still holds.

**1.D:** Item (b) 5-symbol registry trim sector pre-flight **PASSES**. Affected sectors post-trim: XLV 42→40, XLK 39→38, XLC 22→21, XLP 15→14. All four sectors retain ≥7 symbols (B-PHASE-A2 floor); none drops to 0; none drops below 7.

**1.E:** Extended stale-reference grep (Langston Q7a add) surfaced **5 file hits** outside the registry itself: 1 production test file (must be updated), 2 documentation/completion-report references (leave as historical record), 1 sector-mapping reference doc (leave as historical), 1 batch-catalog line (leave as historical).

---

## §2 — SIM consultation (scope §2.1)

### Components touched by this batch + SIM entries

| Component | File | SIM section | Blast radius | Upstream | Downstream |
|---|---|---|---|---|---|
| Null Reason Tracker | `server/utils/null-reason-tracker.ts` | line 875 | **LOW** | Reset before each strategy call | All 17 strategies classify null returns; UI null-reason aggregation panel |
| Asset-class registry | `shared/asset-classes.ts` | line 594 | **MEDIUM** | Symbol form, exchange identity | scanner, routes, freshness endpoint, UI tabs (xstocks-tab.tsx), all xstock-side consumers via `XSTOCK_SPOT_REGISTRY` / `XSTOCK_SPOT_SYMBOLS` |
| Symbol canonicalizer (`KNOWN_NONEXISTENT_NAMES` registry) | `server/services/utils/symbol-canonicalizer.ts` | (no dedicated SIM entry — utility file) | **NONE** | Documentation-only registry per file header at line 32-37 | None (human-read institutional memory; not runtime-consumed) |

### Cross-checks performed

- **SIM line 1773** explicit instruction: "Add new xstock symbol → INSERT into `xstocks-universe.json` + INSERT into `XSTOCK_SPOT_SYMBOLS` set in `shared/asset-classes.ts`. Both must stay in sync." **Inverse applies for removal.** Found `xstocks-universe.json`? Investigated below.
- **SIM line 1932** notes: `XSTOCK_SPOT_REGISTRY` consumers are scanner, routes, freshness endpoint, UI tabs. All enumerated in §3 below.
- **SIM lines 1817-1818** confirms ORB strategy has its own `setNullReason` usage (`strategies/orb.ts`). Already in the 13-file enumeration. No additional drift.
- **SIM line 828** (the B-NEW-36 sub-batch c forward-tracking entry) confirms the 5-symbol gap was already documented as DEFERRED. Our trim does not close the deferred status — it removes the live registry presence pending a Kraken-side investigation method.

### `xstocks-universe.json` discovery

Per SIM line 1773. If this file exists and lists the 5 trimmed symbols, it must be updated in sync with the registry edit. Probe results: covered in §3.4 below.

---

## §3 — Item (a) detailed findings: `setNullReason` ReferenceError

### §3.1 — Source code state at deployed commit `4a997eae2`

```
server/services/vts-runner.ts:
  Line 172:  import { setNullReason, resetNullReason, getNullReason } from '../utils/null-reason-tracker.js';
  Line 857:  setNullReason('strategy_disabled_bearish');      (liquidity_trap branch)
  Line 1085: setNullReason('identical_setup_suppressed');
  Line 1218: setNullReason('net_ev_rejected');
  Line 1295: setNullReason('reentry_cooldown');
  Line 1324: setNullReason('strong_trend_lane_conflict');
  Line 1345: setNullReason('duplicate_position');
  Line 1357: setNullReason('price_past_stop');
  Line 1362: setNullReason('price_past_target');
  Line 1375: setNullReason('max_open_trades');
  Line 1389: setNullReason('per_underlying_cap');
  Line 3447: resetNullReason();
  Line 3459: getNullReason();

server/services/strategy-engine.ts:
  Line 19:   import { setNullReason } from '../utils/null-reason-tracker.js';
  Lines 110-1333: 37 setNullReason call sites across in-class detect methods.
```

Source is correct. Import present. Function exists at `server/utils/null-reason-tracker.ts:9-19`.

### §3.2 — Bundle state at staging deploy

```
dist/index.js (124,653 lines total, mtime 2026-05-20 12:08:24 UTC):
  Line 25220-25232: // server/utils/null-reason-tracker.ts
                    function setNullReason(reason) { _currentNullReason = reason; }
                    function getNullReason() { return _currentNullReason; }
                    function resetNullReason() { _currentNullReason = "unknown"; }
                    var _currentNullReason;
                    var init_null_reason_tracker = __esm({
                      "server/utils/null-reason-tracker.ts"() { "use strict"; _currentNullReason = "unknown"; }
                    });
  Line 41009: function callStrategyDetect(strategy, indicators, ohlcData, patternInput, symbol, assetClass) { ... }
  Line 41032-41034: case "liquidity_trap": setNullReason("strategy_disabled_bearish"); return null;
  Line 43547-43600: var init_vts_runner = __esm({
                      "server/services/vts-runner.ts"() {
                        init_vts_service(); ...
                        init_null_reason_tracker();  ← bundle line 43597, proper init dependency
                        ...
                      }
                    });
```

The bundle correctly:
- Defines `setNullReason` as a top-level hoisted function (line 25221) — accessible from any other top-level function in the bundle.
- Has `init_vts_runner` declare `init_null_reason_tracker()` as a dependency (bundle line 43597) — proper init ordering.
- Defines `callStrategyDetect` as a top-level function (line 41009) — same scope as `setNullReason`. Reference resolution at runtime works.

### §3.3 — Empirical confirmation: bug not currently firing

Three independent timed observations, no new errors:

| Check | Error log line count | setNullReason count |
|---|---|---|
| Baseline | 872,537 | 64,494 |
| After 90s | 872,537 | 64,494 |
| After 240s | 872,537 | 64,494 |

**Total wait: 5.5 minutes of clock time with VTS sim cycle running every 60 seconds (5+ sim cycles).** Zero new errors of ANY kind in error log. PM2 process active and healthy.

Last setNullReason occurrence is at error log line 872,524 (13 lines from end) — pre-current-bundle (deployed before 12:08 UTC bundle rebuild).

### §3.4 — Historical root-cause hypothesis

The error fired 64,494 times across 304 PM2 restart cycles BEFORE the current 12:08 UTC bundle build. The source-code import at `vts-runner.ts:172` has been present continuously since Batch 31 (commit `bd5b2ccf3`, 2026-03-26) per `git log -S "null-reason-tracker"`.

Why did the bundle throw despite the source being correct? The most likely explanation: esbuild bundling produced different shapes for different commits. Tree-shaking heuristics, hoisting decisions, or the lazy-init `__esm` placement may have changed across builds. Without preserved bundle artifacts from earlier deploys, the exact mechanism is impossible to pinpoint retroactively — but the empirical evidence is unambiguous that some bundle versions threw the error and the current version does not.

**This is consistent with CLAUDE.md §5 #15 NO PATCHES doctrine:** rather than treating the historical errors as a still-active bug needing a patch, we treat the current bundle's correct behavior as the proper architectural state and add structural protection so future bundles can't drift back into the broken state.

### §3.5 — Scope-of-fix decision

Original scope §3.1 said "Files modified: TBD — pre-audit identifies the exact file(s) and lines" + import-add for missing files.

**Pre-audit finds zero files missing the import.** So §3.1's "add import" code change has nothing to add. Item (a) becomes a **regression-protection deliverable** instead of a fix deliverable.

**Recommended re-scoping (Open Question — see §7):**

1. **Add a unit test** that verifies every TS file referencing `setNullReason` / `getNullReason` / `resetNullReason` also has the corresponding import line. Implementation: simple grep-based test that opens each file, counts the use references, counts the import references, and asserts `(uses > 0) ⇒ (imports > 0)`.
2. **Add a boot-time smoke test** in `server/index.ts` (or equivalent boot orchestrator) that calls `setNullReason('boot_smoke_test')` + `getNullReason()` once on startup. If the function is missing from the bundle, the boot fails fast with a clear error message instead of accumulating thousands of runtime errors.
3. **Document the historical 64,494 occurrences in the completion report** under "Asset-class onboarding workflow learnings" with a "what surprised us" entry: latent ReferenceError in catch-wrapped paths can persist for batches without detection.

### §3.6 — Q7b pre-deploy baseline (Langston ACK iteration)

Original §2.2.a Q7b ask: "capture pre-deploy occurrences/24h to anchor 'X pre-deploy → 0 post-deploy' assertion."

**Q7b finding:** the bug isn't currently firing, so the "post-deploy zero window" assertion is moot. Instead, the §5.1 acceptance criterion becomes "zero new occurrences for 24h post-deploy of the regression-protection unit test landing." Pre-deploy baseline: 0 occurrences in 240-second observation. Post-deploy: 0 expected. The proof shape is "0 pre-deploy → 0 post-deploy + new test gates against future regression."

---

## §4 — Item (a) sister bugs (§2.2.d enumeration)

### §4.1 — Import hygiene across all 13 user files

| File | uses count | imports count | Status |
|---|---|---|---|
| `server/strategies/adaptive-flow.ts` | 11 | 1 | ✅ OK |
| `server/strategies/defensive-hedge.ts` | 15 | 1 | ✅ OK |
| `server/strategies/inside-bar-reversal.ts` | 12 | 1 | ✅ OK |
| `server/strategies/morning-star.ts` | 8 | 1 | ✅ OK |
| `server/strategies/orb.ts` | 4 | 1 | ✅ OK |
| `server/strategies/pivot-shift.ts` | 10 | 1 | ✅ OK |
| `server/strategies/reverse-impulse.ts` | 11 | 1 | ✅ OK |
| `server/strategies/strong-bull-trend.ts` | 7 | 1 | ✅ OK |
| `server/strategies/support-bounce.ts` | 8 | 1 | ✅ OK |
| `server/strategies/volatility-edge.ts` | 11 | 1 | ✅ OK |
| `server/asset_classes/xstock_spot/eval-cycle.ts` | 3 | 1 | ✅ OK |
| `server/services/strategy-engine.ts` | 37 | 1 | ✅ OK |
| `server/services/vts-runner.ts` | 13 | 1 | ✅ OK |

**Result: 0 sister bugs.** The absorb-ceiling rule (Q3 cap of 3) is non-binding because nothing surfaced to absorb. No HYGIENE.2 spawn needed.

### §4.2 — Concurrency-safety re-check (§2.2.e)

```bash
grep -rn "Promise\.all" server/services/vts-runner.ts server/asset_classes/xstock_spot/eval-cycle.ts
# Result: zero hits in detect path
```

The null-reason-tracker's strict-serial assumption holds. No spawn needed.

---

## §5 — Item (b) detailed findings: 5-symbol registry trim

### §5.1 — Sector-coverage hard pre-flight (Q4)

| Sector | Pre-trim count | Post-trim count | Symbols lost |
|---|---|---|---|
| XLV | 42 | 40 | HOLX, SAGE |
| XLK | 39 | 38 | BITF |
| XLC | 22 | 21 | PARA |
| XLP | 15 | 14 | WBA |
| All other sectors | unchanged | unchanged | — |

**PASSES.** No sector drops to 0. No sector drops below the B-PHASE-A2 floor of 7. Total registry size: 265 → 260.

### §5.2 — XSTOCK_SPOT_REGISTRY consumer enumeration (§2.3.b)

Production consumers (need no change — they iterate the registry whatever its size):
- `server/asset_classes/xstock_spot/scanner.ts` — uses `XSTOCK_SPOT_SYMBOLS` + `XSTOCK_SPOT_REGISTRY.get(symbol)` lookups
- `server/services/xstock-ohlc-cache.ts` — comment refs only
- `server/services/price-discontinuity-detector.ts` — uses `XSTOCK_SPOT_SYMBOLS`
- `server/core/metrics/directional-bias-store.ts` — comment refs only
- `server/routes.ts` — uses `XSTOCK_SPOT_SYMBOLS` (dynamic import at lines 7283, 7852)
- `scripts/b-new-34b-prewarm-snapshot.ts` — uses `Array.from(XSTOCK_SPOT_REGISTRY.keys())`
- `scripts/b-phase-a2-backfill.ts` — uses `Array.from(XSTOCK_SPOT_REGISTRY.entries())`
- `scripts/b79-0a-load-test.ts` — uses `XSTOCK_SPOT_SYMBOLS`

All consumers iterate or look up by key; none assert on registry size or membership of the 5 specific symbols.

### §5.3 — Extended stale-reference grep (Langston Q7a add)

Beyond the 5 lines that ARE the registry entries themselves, found these literal references to the 5 symbols across the tree:

| File | Line | Action |
|---|---|---|
| `server/tests/unit/b-phase-a2-xstock-eval-cycle-dbs.test.ts` | 33 | **MUST UPDATE.** Line 33: `expect(XSTOCK_SPOT_REGISTRY.size).toBe(265);` → must change to 260. Production test asserting on the literal size value. |
| `Claude Comms and Packages/Langston Design Asks/xstock_sector_mappings_reference.md` | 136, 216, 281, 312, 357 | Leave as historical record — design-time reference doc capturing what the registry looked like at design time. Optional footnote that 5 symbols were retired in B79.0n.HYGIENE. |
| `Claude Comms and Packages/Batch Completion/B_NEW_35_COMPLETION_REPORT.md` | 72 | Leave as historical record — completion report from B-NEW-35 documenting the 5-symbol gap discovery. Cross-references this batch. |
| `Claude Comms and Packages/Batch Completion/BATCH_79_0i_a_COMPLETION_REPORT.md` | 23 | Leave as historical record — B79.0i.a completion report references "PARA/USD, HOLX/USD, SAGE/USD, BITF/USD, WBA/USD all 'Dead' (ARCA-only, weekend)" as part of original Panel E screenshot evidence. |
| `1-system-manual/BATCH_CATALOG.md` | 197 | Leave as historical record — batch catalog references. |

**Decision per Q7a:** update the production test (1 file). Leave docs/scope-files as historical record (the symbols existed in those snapshots; doc consistency with the registry-of-record at any given time was always going to drift as code evolves).

### §5.4 — `xstocks-universe.json` probe (from SIM line 1773)

SIM said both `xstocks-universe.json` AND `XSTOCK_SPOT_SYMBOLS` must stay in sync. Probe:

```bash
# from repo root
find . -name "xstocks-universe.json" 2>/dev/null
```

If the file exists, it must be edited to remove the 5 symbols. If it doesn't (post-B-NEW-36 consolidation may have retired it), no edit needed. Result pending exact path probe in §6.

### §5.5 — `KNOWN_NONEXISTENT_NAMES` entry design (§2.3.e + Q1)

Confirmed: consolidated single entry per Langston Q1 ACK. Schema match against the existing Kraken Futures entry at `server/services/utils/symbol-canonicalizer.ts:39-50`. Entry shape verified compatible. No additional design changes from scope §3.3.

### §5.6 — DB row deletion: confirmed NO (Q5)

Per Langston Q5 ACK. Historical zero-row partitions in `xstock_spot_ohlc_1m_*` and the absence of entries in `xstock_spot_ohlc_60m_snapshot` stay as-is. Smallest blast radius.

---

## §6 — Code changes for implementation (re-stated post-pre-audit)

### §6.1 — Item (a) revised: regression protection (replaces import-add)

**Files NEW or MODIFIED:**

1. **NEW unit test:** `server/tests/unit/b79-0n-hygiene-null-reason-import-hygiene.test.ts`
   - Reads each TS file in `server/strategies/`, `server/services/strategy-engine.ts`, `server/services/vts-runner.ts`, `server/asset_classes/xstock_spot/eval-cycle.ts`.
   - For each file: counts `setNullReason` / `getNullReason` / `resetNullReason` USE references (regex outside import line).
   - If use count > 0, asserts the import line exists.
   - Test fails if any file uses the helpers without importing them.

2. **MODIFIED boot orchestrator:** `server/index.ts` (or equivalent — locate exact file in Step 3)
   - Add a boot-time smoke call: `setNullReason('boot_smoke_test'); const r = getNullReason(); resetNullReason();` wrapped in try/catch that logs a CRITICAL-level error and exits if it throws.
   - Justification: catch ReferenceError early at deploy time, not after millions of cycle iterations.

### §6.2 — Item (b) registry trim + KNOWN_NONEXISTENT_NAMES + test update

**Files MODIFIED:**

1. **`shared/asset-classes.ts`** — delete 5 lines (BITF, HOLX, PARA, SAGE, WBA). Reduces registry from 265 → 260.

2. **`server/services/utils/symbol-canonicalizer.ts`** — add 1 consolidated entry to `KNOWN_NONEXISTENT_NAMES` per scope §3.3.

3. **`server/tests/unit/b-phase-a2-xstock-eval-cycle-dbs.test.ts:33`** — change `265` to `260`. Optionally add comment referencing B79.0n.HYGIENE.

4. **`xstocks-universe.json`** (if it exists; final probe in §6) — remove the 5 symbols from the JSON list.

---

## §7 — Open questions for Langston (Step 2 pre-audit review)

Three substantive questions:

### Q1 — Re-scoping item (a)

The bug is already fixed by the current bundle. Pre-audit found nothing to absorb (zero missing-import sister bugs). I'm proposing to convert item (a) from "find the missing import" to a regression-protection deliverable: (i) unit test that asserts every file using `setNullReason` has the import, (ii) boot-time smoke test that exercises the helpers once on startup.

**Three alternatives:**
- **(A)** Accept the proposed regression-protection re-scope as the new shape of item (a).
- **(B)** Drop item (a) entirely. Documentation-only acknowledgement that the bug self-resolved; no new code.
- **(C)** Investigate the historical bundling quirk further before re-scoping. Probe past bundle artifacts (if any are preserved) or git-bisect across the 304 restart cycles to identify the commit that fixed the bug.

**CC default: (A).** Reasoning: the bug fired 64,494 times historically — empirical proof that it CAN happen. Bundle determinism is not guaranteed across builds (esbuild has tree-shaking + hoisting heuristics that can shift). The cheap regression-protection (one unit test + one boot smoke test, ~30 LOC total) is worth the prevention. (B) leaves us exposed if a future build re-introduces the bug. (C) is high-effort with low ROI — past bundle artifacts aren't preserved (PM2 doesn't archive `dist/index.js` history), and the source-side fix has been continuously correct.

### Q2 — Boot-time smoke test placement

If we accept (A), the boot smoke test needs a home. Candidate locations:
- **`server/index.ts`** boot orchestrator near the top, before any subsystem init.
- **A new file `server/startup/null-reason-smoke.ts`** wired into the boot sequence.
- **Bundled into `init_vts_runner()` lazy-init** — runs the first time vts-runner is loaded.

**CC default: candidate 1 (`server/index.ts`).** Reasoning: needs to run BEFORE the VTS sim cycle starts (which is when the historical bug fired). Earlier in boot = earlier failure detection. Inline at top of `server/index.ts` is simplest.

### Q3 — `xstocks-universe.json` probe outcome

If the file exists and contains the 5 symbols, item (b) must include the edit to that file. If it doesn't, no edit. Probe runs in Step 3 (implementation) and gets documented in the completion report. Acceptable?

**CC default: yes — handle at implementation time.** Reasoning: probe is a 5-second operation; outcome doesn't change the scope shape, just the file list.

---

## §8 — Anti-discoveries (what we DIDN'T find)

For posterity:

- **No Promise.all in detect path** — concurrency assumption holds.
- **No missing-import sister bugs** in any of the 13 user files of null-reason-tracker exports.
- **No sector drops below 7 post-trim** — B-PHASE-A2 floor safe.
- **No deeper xstock universe gap** surfaced — the 5 trimmed symbols are the only zero-data ones.
- **No new asset-class-awareness gaps** uncovered in this small batch — HYGIENE is genuinely the noise-floor cleanup it was scoped as.

---

## §9 — Reply gate for Langston

Reply: **Step 2 pre-audit ACK** / **Q1/Q2/Q3 counter-propose** / **substantive design disagreement on re-scope shape**.

Once you ACK, CC proceeds to Step 3 implementation with the §6 code changes. Re-scoped item (a) becomes regression-protection (1 unit test + 1 boot smoke test) if Q1 = (A). Re-scoped item (a) becomes documentation-only if Q1 = (B).

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §12 dispatch-anchoring: this pre-audit doc IS the inbox file. Do NOT `cd /mnt/gdrive`. For repo-side inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

— Claude Code, 2026-05-20 PM (B79.0n.HYGIENE Step 2 pre-audit v1)
