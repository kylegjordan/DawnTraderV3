# B-XSTOCK-DBS-TO-STRATEGIES — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (`#1235`)

change-class: architecture · **Scope:** `B_XSTOCK_DBS_TO_STRATEGIES_SCOPE.md` r4 (`020fdb698`), Langston PROCEED 2026-11-05 at `7d8f7c9cd` with eight Step-2 conditions (A)-(H) · **Read at:** `origin/migration/aws-supabase` `37d24e84f` · **Written:** 2026-11-05 · **Owner:** CC-B

## 0. PREVIOUSLY STATED vs NOW
| # | previously stated | now | reason |
|---|---|---|---|
| 1 | "95 of 521 xStock paper trades … guards exist to refuse" (`#1235`, scope §0) | **95 of 520** | the window is now pinned, opened 2026-10-06 15:52:57Z → 2026-11-04 00:00Z (§2.H). The 521 was an open-ended read taken on 11-04. |
| 2 | "about one xStock open in five refused" (scope §2, §7) | **18.3 % of xStock paper opens in that window carried a score the guards refuse** | (H): the object and method are now stated, and it is a backward-looking count. It is NOT a forecast of the refusal rate after the deploy. |
| 3 | "Blast radius: xStock only. Crypto … nothing on crypto changes" (scope §2) | **Behavior: intended-identical on crypto. Code: crypto IS touched**, at two sites (OBJ-1b `volatility_edge`, live on crypto; OBJ-1c the strong-trend attach site) | Langston (A). The blast radius is written out in §2.A. |
| 4 | OBJ-1b key "`*`/`*`/`*`" (scope §4) | **`exchange='*' / asset_class='*' / strategy='volatility_edge' / regime='*'`** | Langston (B); matches the four sibling rows, measured. |
| 5 | sma_trend_ride guard "confirmed first at Step 2, or one-directional" | **confirmed FIRST: test is bidirectional** | read at the ref (§1.4); Langston re-derived the same. |

## 1. THE AUDIT — six sources, named
**Sources read:**
1. **Code at the ref:** `eval-cycle.ts`, `vts-runner.ts`, `signal-orchestrator.ts`, `strategy-engine.ts`, the five strategy files, `module-constants-service.ts`, `b72-warmup.ts`, `archive-config.ts`, `signal-eval-archiver.ts`, `dt-deploy.sh`, `MANIFEST.txt`, and the B72 consistency test.
2. **Runtime and database (staging, read-only):**
   - `module_constants`;
   - `signal_eval_archive`, xStock, 2026-11-04 14:30-21:00Z;
   - `closed_trades`, xStock paper.
3. **System Impact Map:**
   - `:609` (B63 Item 12 override plumbing);
   - `:1690` (the override row, stale — see (r4-5));
   - `:2847-2870` (the eval-cycle entry, blast radius HIGH);
   - `:120` (the scanner's strong-DBS bypass fence; unrelated to detect input);
   - `:2154` / `:2179` / `:2214` / `:2232` (the signal-eval archive and its `features`).
4. **System Manual:**
   - `:12533` onward (the xStock eval pipeline), which is silent on the detect input — the gap this batch closes;
   - `:12821` (the xStock DBS configuration);
   - `:11628` (the B63 geometry override).
5. **Ledger and reports:** `#1235`, `#560`, `#549`, `#550`, `#1037` (am.4: the Drift Dashboard is not opened at Step 7), and `#661` leg 3 (a skipped suite is not a pass).
6. **`bridge/canonical/`:** consulted for intent; no coverage. The xStock loop and its DBS postdate the governance change.

### 1.1 Entry points, enumerated first (repo-wide, tests excluded)
- **Strategy detect is reached from exactly three places:**
  - `eval-cycle.ts:569` (xStock VTS, which also feeds xStock paper through `dispatchXstockActiveSignal`);
  - `vts-runner.ts:1892` (crypto VTS);
  - `signal-orchestrator.ts` (crypto active, which calls `strategyEngine.detect*` directly, e.g. `:3182`).
- **Instrument:** `git grep "callStrategyDetect("` gives the two dispatcher callers; the orchestrator's direct calls come from reading `:2432-3375`. **Exactly one xStock entry point.**
- **`strongTrendGeometryOverride`** is attached at exactly one site (`vts-runner.ts:1835`), read at exactly one (`strategy-engine.ts:243`) and typed at `:142` (`git grep` census; Langston re-derived the same).

### 1.2 Census at each component touched
| component | writes / creates | reads | mutates | deletes | scheduled by |
|---|---|---|---|---|---|
| the xStock detect input object | `eval-cycle.ts:571` (today `mceContext.indicators`; after OBJ-1, a new object) | the strategies via `callStrategyDetect` | none | n/a | the xStock scanner cycle, ONE scheduler |
| `mceContext.indicators` | MCE `:1432-1443` | eval-cycle `:592-599`, `:672`, `:739`, `:1199`, `:1327-1329` | **none after OBJ-1** (the new object is a spread copy) | n/a | per evaluation |
| `strategy_dbs_routing_guards.dbs_min_threshold` | seeds `2026-04-22b:159-162` + `2026-05-05-b72:40-43`; the new migration | morning_star, reverse_impulse, defensive_hedge, strong_bull_trend; volatility_edge after OBJ-1b | none in code | rollback only | warmed by `b72-warmup.ts:31` |
| the vwap_pullback override constants (new) | the new migration | `vts-runner.ts` attach site only, inside `isStrongTrendLane` | none | rollback only | warmed by `b72-warmup.ts:89` (`strategy.vwap_pullback`) |
| `signal_eval_archive.features.detectDbsScore` (new key) | eval-cycle's eight post-detect `archiveSignalEval` sites (`:618`, `:762`, `:872`, `:921`, `:977`, `:1032`, `:1073`, `:1229`) | the Step-7 queries | none | partition retention | per evaluation |

**Readers of `features` (OBJ-3b safety):** `git grep "features *->>?"` over `server/` and `scripts/` returns three scripts. All three read named keys (`detailReason`, `sourcePool`), so an additive key cannot break them. A whole-object hash or equality read was searched for and none found. ⚠️ `NOT RE-READ` by a second reader.

### 1.3 (C) What a throw out of detect does — the real blast radius of a missing or misshaped row
| path | what catches it | what is lost |
|---|---|---|
| xStock VTS (+ paper) | `eval-cycle.ts:568-583` try/catch → `counters.errors++`, `console.warn [B79.0m.b2][EVAL_DETECT_FAIL]`, `continue` | **that one (symbol, strategy)** — silently, no page |
| crypto VTS | **no catch at `vts-runner.ts:1892`**; it propagates out of `generatePhase10Signal` to the per-pair try at `:5622` → `:6204` `console.warn [11.0E.1][VTS] Strategy execution failed` | **every remaining strategy for that pair, that cycle** |
| crypto active | the per-symbol try at `signal-orchestrator.ts:2432` → `:3375` `console.error [37.A][SIGNAL] Error evaluating strategies` | **every remaining strategy for that symbol, that cycle** |

⇒ **On crypto, a missing `volatility_edge` row would not silence one strategy. It would cut every strategy evaluated after it, for every crypto symbol, on both the VTS and the trading path. Nothing pages.** The four siblings already carry the same exposure today. It is accepted, and fenced three ways, all of which this batch keeps:
- (i) **Deploy order:** `dt-deploy.sh:241-253` runs `db:migrate` BETWEEN build and `pm2 restart`, so the rows exist before the new code runs.
- (ii) **Warm cache:** the module is in `PREFETCH_MODULES`, so the cache is warm.
- (iii) **Row check:** the B72 consistency test checks the rows, but is SKIPPED in CI (`describe.skipIf`), so Step 7 runs it against staging.

**Plan item P7 adds the observation that would catch it** (below).

### 1.4 Guard order — the exactness premise of OBJ-4(a)
- **morning_star:** guards at `:103` and `:112` are the first checks after the config reads, before `parseCandles` and before `no_pattern` (`:127`).
- **vwap_pullback:** `strategy-engine.ts:171`, first after its module read.
- **sma_trend_ride:** `:473`, first after its module reads, ahead of `insufficient_data` (`:490`).

All three are bidirectional-testable (Langston re-derived the same).

### 1.5 The evidence for the change, re-derived
- **(H) The 95.** Read 2026-11-05 ~02:45Z.
  - **Object:** `closed_trades`.
  - **Population:** `mode='paper'`, `asset_class='xstock_spot'`, `opened_at` from 2026-10-06 15:52:57Z (the reset) to 2026-11-04 00:00Z. **n = 520**, with 0 null scores.
  - **Score used:** `metadata.pairDirectionalBiasScore`, the scanner's score carried to the queue at signal birth (`#560`). This is the same `propagatedDbs` value OBJ-1 will hand detect, for that symbol and cycle. ⚠️ **Assumed, not measured:** that the carried value equals the detect-time value. The detect-time value was never recorded; OBJ-3b is what records it from now on.
  - **Numerator:**
    - vwap_pullback + sma_trend_ride with score ≤ −0.35: **56**;
    - morning_star with |score| ≥ 0.35: **39**;
    - strong_bull_trend, defensive_hedge, reverse_impulse, volatility_edge: 0.
  - **Total 95 / 520 = 18.3 %.**
  - It is a count of trades that should not have opened. **It does not predict how many evaluations the guards will refuse after the deploy;** OBJ-4 measures that.
- **(E) The archive switch.** `signal-eval-archiver.ts:316-322` drops every `strategy_internal` row when `signalEvalPreFilterEnabled` is false. That flag comes from `module_constants` `b70_signal_eval_pre_filter_capture` (`archive-config.ts:85`; default true) and is printed at startup (`data-archive-bootstrap.ts:65`, `pre_filter=`). It is read at the deploy and at the measurement.
- **(F) The spread.** `TechnicalIndicators` (`strategy-engine.ts:124-145`) declares no `volatility`, `momentum` or `adx`, and no strategy reads them. Keeping them in the spread is hygiene, not a second fix, and the report will say exactly that.

## 2. THE PLAN — every item names the audit finding it falls out of
| # | item | falls out of |
|---|---|---|
| **P1** | `eval-cycle.ts:571`: `const detectIndicators = { ...mceContext.indicators, dbsScore: propagatedDbs?.score, dbsCategory: propagatedDbs?.category, dbsSlope: propagatedDbs?.slope }`, passed to `callStrategyDetect`. `mceContext.indicators` is untouched. | §1.2 row 1-2, scope OBJ-1 |
| **P2** | `features.detectDbsScore` (`detectIndicators.dbsScore ?? null`) at all EIGHT post-detect archive sites listed in §1.2. **(G):** the scope's "every archived xStock evaluation" means these eight, so that a signal row with a refusable score is detectable as a disagreement. | §1.2 row 5, OBJ-3b, (G) |
| **P3** | OBJ-3 counters on the xStock cycle summary: `dbsCarriedEvals` / `detectEvals` (coverage) and `dbsStrongEvals` (≥ 0.35 share of those). | OBJ-3 |
| **P4** | `volatility-edge.ts:94`: `getCachedNumberRequired('strategy_dbs_routing_guards','dbs_min_threshold',{exchange:'*',assetClass,strategy:STRATEGY_KEY,regime:'*'})`, `>=` arm only (C2). | §1.2 row 3, OBJ-1b, (B) |
| **P5** | `vts-runner.ts:1835-1837`: inside the `isStrongTrendLane` true arm only, read `strong_trend_override_stop_atr_mult` and `strong_trend_override_target_r_multiple` from `strategy.vwap_pullback` with `{exchange:'*', assetClass:_assetClass, strategy:'vwap_pullback', regime:'*'}`. No literal remains. | §1.1, §1.2 row 4, OBJ-1c, (r4-1/2) |
| **P6** | ONE migration, `2026-11-05-b-xstock-dbs-to-strategies.sql`, plus a rollback file, a MANIFEST line and a count assertion of **exactly 3** inserted rows. The rows: `strategy_dbs_routing_guards / dbs_min_threshold / * / * / volatility_edge / * = 0.35`; `strategy.vwap_pullback / strong_trend_override_stop_atr_mult / * / crypto_spot / vwap_pullback / * = 4.0`; `… target_r_multiple … = 3.0`. Appending it to `MANIFEST.txt` makes a fresh database receive the rows after both existing seeds (Langston's seed-file item: both seeds ARE in the manifest, lines 41 and 74). | §1.2 rows 3-4, (B), seed-file item |
| **P7** | **The observation that would catch a missing row** ((C), and Langston's r1b note): Step 7 counts `[B79.0m.b2][EVAL_DETECT_FAIL]`, `[11.0E.1][VTS] Strategy execution failed` and `[37.A][SIGNAL] Error evaluating strategies` over the first session, against the same count over the session before the deploy. **PASS = no increase, and none naming `dbs_min_threshold` or the new constants.** No new alert is built here: a config-missing page is a wider decision (`#1239`'s family), recorded, not folded. | §1.3 |
| **P8** | The B72 consistency test: `volatility_edge` joins `STRATEGIES` (`:34`), and the four "all 4" titles (`:55`, `:72`, `:94`, `:112`) are renamed. **Run against staging at Step 7** (skipped in CI, `#661` leg 3). | (r4-3), C1 |
| **P9** | Unit tests: (a) the detect input carries the three fields, and a mutation removing them goes red; (b) with `propagatedDbs` undefined the fields are absent, not 0; (c) the ten MCE fields are preserved; (d) `detectDbsScore` is written at the strategy-null site, plus a source fence for all eight; (e) volatility_edge reads the row (a mock at 0.20 refuses at 0.25), and a source fence finds no literal 0.35 at that guard; (f) the strong-trend attach reads the rows (mock 5.0 / 2.0), the non-strong-trend path with no row does not throw, and a source fence finds no `4.0` / `3.0` literal at the attach. | OBJ-1, 1b, 1c, 3b |
| **P10** | Step 7, as pre-registered in scope OBJ-4, **with the four Step-2 additions:** (D) a third arm: a row with a null `detectDbsScore` must carry NEITHER exclusion reason; (E) read `pre_filter` at the deploy and at the measurement, and a zero population is FAIL, never PASS; (a) is bidirectional for sma_trend_ride; P7's log counts. ⛔ **The Drift Dashboard is not opened** (`#1037` am.4). | (D), (E), §1.4, §1.3 |
| **P11** | Step 10: System Manual (the xStock detect input: what it receives, why it spreads, and that it is the same score as the regime's); System Impact Map (the eval-cycle entry, the two settings, the archive key, and the **`:1690` correction**: no `paper-execution-engine` consumer, and `strategy-engine` reads, it does not attach); `LEVER_INVENTORY` (judged: the B63 group gains a member and two levers leave code). | §1 sources 3-4, (r4-5) |
| **UNAUDITED** | — none. Every item above has a finding. | |

## 3. Risks that remain, stated
- **A step change in xStock behavior is the point, and it lands in live paper trading at once.** Mitigation: (a) is exact, so a wiring error shows on the first session. Rollback is the code plus the migration rollback.
- **Module-constant completeness tests** may expect every `strategy.vwap_pullback` constant to exist for both classes. P5's two constants are crypto-only by design. **Checked in Step 3 by running the full suite before the push**; if a per-class completeness test exists, the xStock absence is declared there rather than seeded with a guessed value (F2's xStock half is Kyle's).
- **F2's xStock half stays open** (Kyle decision, via PM Claude 2026-11-05).
