# B-XSTOCK-DBS-TO-STRATEGIES — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (`#1235`) — r3

> **r3 (2026-11-05 ~04:45Z): Langston's CHANGES-1 on r2 (ruled at `2952bbe8c`) folded.** The audit had listed what the change REFUSES but not what it ADMITS. `strong_bull_trend` on xStock opens for the first time:
> - §1.8 states the three-vs-one asymmetry;
> - §3 gets a named risk line;
> - P10(b) splits into a control plus a bounded first-session observation with a pre-registered "investigate" number.
>
> His record items are folded too: the seed file named in full (and it is `-- db-migrate:skip`), citation drift, the P5 fence at `:1627-1628`, the live resolver proof, and a Manual sentence on the spread.

> **r2 (2026-11-05 ~03:15Z):** folds Langston's ruling at `51762457a` (PROCEED on the scope, two binding conditions, one §13 item). His ruling crossed with r1's dispatch. Additions: §1.6 (his two conditions), §1.7 (his §13 finding), a replaced P10, and P11's additions.

change-class: architecture · **Scope:** `B_XSTOCK_DBS_TO_STRATEGIES_SCOPE.md` r4 (`020fdb698`), Langston PROCEED 2026-11-05 at `7d8f7c9cd` with eight Step-2 conditions (A)-(H) · **Read at:** `origin/migration/aws-supabase` `37d24e84f` · **Written:** 2026-11-05 · **Owner:** CC-B

## 0. PREVIOUSLY STATED vs NOW
| # | previously stated | now | reason |
|---|---|---|---|
| 1 | "95 of 521 xStock paper trades … guards exist to refuse" (`#1235`, scope §0) | **95 of 520** | the window is now pinned, opened 2026-10-06 15:52:57Z → 2026-11-04 00:00Z (§2.H). The 521 was an open-ended read taken on 11-04. |
| 2 | "about one xStock open in five refused" (scope §2, §7) | **18.3 % of xStock paper opens in that window carried a score the guards refuse** | (H): the object and method are now stated, and it is a backward-looking count. It is NOT a forecast of the refusal rate after the deploy. |
| 3 | "Blast radius: xStock only. Crypto … nothing on crypto changes" (scope §2) | **Behavior: intended-identical on crypto. Code: crypto IS touched**, at two sites (OBJ-1b `volatility_edge`, live on crypto; OBJ-1c the strong-trend attach site) | Langston (A). The blast radius is written out in §2.A. |
| 4 | OBJ-1b key "`*`/`*`/`*`" (scope §4) | **`exchange='*' / asset_class='*' / strategy='volatility_edge' / regime='*'`** | Langston (B); matches the four sibling rows, measured. |
| 5 | sma_trend_ride guard "confirmed first at Step 2, or one-directional" | **confirmed FIRST: test is bidirectional** | read at the ref (§1.4); Langston re-derived the same. |
| 6 | scope OBJ-4(a′): "share … within 10 percentage points" of `pair_scan_archive` | **REPLACED by a per-row VALUE-EQUALITY test (§1.6). The share is reported, not banded.** | Langston condition 1. The two shares differ by construction, measured below. |
| 7 | "about one xStock open in five refused" was the only magnitude stated | **plus: the guards are expected to refuse about HALF of xStock `morning_star` detect evaluations** | Langston §13 (§1.7). The 18.3 % is trade-level; the half is evaluation-level. Publishing only the first would make Step 7's ~50 % read as a regression. |

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
| `strategy_dbs_routing_guards.dbs_min_threshold` | seeds `2026-04-22b-initial-seed-data.sql:159-162` (MANIFEST 41) + `2026-05-05-b72-dbs-routing-guards.sql:40-43` (MANIFEST 74, **but its line 1 is `-- db-migrate:skip`**: recorded as applied without running, so on a fresh database the four rows come from `2026-04-22b` and the initial-schema dump; Langston); the new migration | morning_star, reverse_impulse, defensive_hedge, strong_bull_trend; volatility_edge after OBJ-1b | none in code | rollback only | warmed by `b72-warmup.ts:31` |
| the vwap_pullback override constants (new) | the new migration | `vts-runner.ts` attach site only, inside `isStrongTrendLane` | none | rollback only | warmed by `b72-warmup.ts:89` (`strategy.vwap_pullback`) |
| `signal_eval_archive.features.detectDbsScore` (new key) | eval-cycle's eight post-detect `archiveSignalEval` sites (`:618`, `:762`, `:872`, `:921`, `:977`, `:1032`, `:1073`, `:1229`) | the Step-7 queries | none | partition retention | per evaluation |

**Readers of `features` (OBJ-3b safety):** `git grep "features *->>?"` over `server/` and `scripts/` returns three scripts. All three read named keys (`detailReason`, `sourcePool`), so an additive key cannot break them. A whole-object hash or equality read was searched for and none found. ⚠️ `NOT RE-READ` by a second reader.

### 1.3 (C) What a throw out of detect does — the real blast radius of a missing or misshaped row
**(B) The resolver is proven live, not inferred** (Langston): `strong-bull-trend.ts:99-103` already calls `getCachedNumberRequired('strategy_dbs_routing_guards', …, {assetClass, …})` on xStock, and it resolved to the `*` row on 31,509 evaluations of the 11-04 session. On the crypto active path, `detectVolatilityEdge` is at `:3182`, with only `:3203` and `:3229` after it inside the same try. So the measured loss there is the last two strategies of the symbol.

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
- **sma_trend_ride:** `:473`, first after its module reads, ahead of `insufficient_data` (`:488`).

All three are bidirectional-testable (Langston re-derived the same).

### 1.5 The evidence for the change, re-derived
- **(H) The 95.** Read 2026-11-05 ~02:45Z.
  - **Object:** `closed_trades`.
  - **Population:** `mode='paper'`, `asset_class='xstock_spot'`, `opened_at` from 2026-10-06 15:52:57Z (the reset) to 2026-11-04 00:00Z. **n = 520**, with 0 null scores.
  - **Score used:** `metadata.pairDirectionalBiasScore`, the scanner's score carried to the queue at signal birth (`#560`). This is the same `propagatedDbs` value OBJ-1 will hand detect, for that symbol and cycle. ⚠️ **Assumed, not measured:** that the carried value equals the detect-time value. The detect-time value was never recorded; OBJ-3b is what records it from now on.
  - **Numerator:**
    - vwap_pullback + sma_trend_ride with score ≤ −0.35: **56** (18 + 38);
    - morning_star with |score| ≥ 0.35: **39**;
    - strong_bull_trend, defensive_hedge, reverse_impulse, volatility_edge: 0 — **two different facts behind one zero; see §1.8.**
  - **Total 95 / 520 = 18.3 %.**
  - It is a count of trades that should not have opened. **It does not predict how many evaluations the guards will refuse after the deploy;** OBJ-4 measures that.
- **(E) The archive switch.** `signal-eval-archiver.ts:316-322` drops every `strategy_internal` row when `signalEvalPreFilterEnabled` is false. That flag comes from `module_constants` `b70_signal_eval_pre_filter_capture` (`archive-config.ts:85`; default true) and is printed at startup (`data-archive-bootstrap.ts:65`, `pre_filter=`). It is read at the deploy and at the measurement.
- **(F) The spread.** `TechnicalIndicators` (`strategy-engine.ts:126-146`) declares no `volatility`, `momentum` or `adx`, and no strategy reads them. Keeping them in the spread is hygiene, not a second fix, and the report will say exactly that.

### 1.6 Langston's two binding conditions, measured
**Condition 1 — the share band was dominated by an artifact. Measured 2026-11-05 ~03:05Z**, xStock, 2026-11-04 15:00-17:00Z:
- **Rows compared:** `morning_star` VTS rows, deduplicated to distinct (symbol, minute): 9,217 pairs over 319 symbols. 8,946 of them match a `pair_scan_archive` row for the same symbol and minute.
- **The two shares:**
  - evaluation side, using the matched scan score: ≥ 0.35 **49.98 %**, ≤ −0.35 **3.64 %**;
  - scan side, restricted to the same 319 symbols: 43.53 % and 7.12 %.
- **Residual after matching:** **6.45 and 3.48 points**, with no defect present. The filters ahead of detect select on the score, so a cycle that reaches `morning_star` is not a random draw of the scan. **A share comparison cannot be made tight, so it is dropped as a criterion.**
- **Replaced by an exact test that the code makes possible.** The scan row IS written from the same score, within the same `computeContext` call that precedes detect:
  - `market-context-engine.ts:1545-1553` archives `dbsScore: directionalBias.score`;
  - for xStock, `directionalBias` is `propagatedDbs` passed through unchanged (`:1266`), or a synthesized neutral when absent;
  - and P1 hands detect that same `propagatedDbs`.

  ⇒ **(a′) NEW:**
  - **The test:** every xStock VTS row carrying a non-null `detectDbsScore` is matched to the `pair_scan_archive` row for the same symbol within the same minute, and the two scores must be equal (|Δ| < 1e-9).
  - **PASS:** at least 99 % of matched rows are equal, AND at least 90 % of rows are matchable.
  - **FAIL:** anything less.
  - A row with a null `detectDbsScore` must match a scan row whose score is the neutral fallback. That is (D)'s arm, seen from the other side.
  - **Instrument check (Step 3):** confirm the scan row and the eval row come from the same call. If the archive's `capturedAt` is not shared, define the join window from the code, not from this sample.

**Condition 2 — (a)'s population is pinned to the detect gate.** The archive holds `morning_star` rows from five gates, measured 2026-11-04 20:00-20:10Z:

| gate | mode | stage | rows |
|---|---|---|---|
| `strategy_detect` | `vts` | `strategy_internal` | 3,270 |
| `fill_policy` | `vts` | `sqe` | 124 |
| `rtb_price_shadow` | `paper_sim` | — | 10 |
| `rtb_price` | `paper_sim` | — | 3 |
| `admitted` | `paper_sim` | — | 1 |

⇒ **(a) is defined as follows:**
- **The 1 % floors** apply to `gate_decision->>'gate' = 'strategy_detect'` AND `mode = 'vts'` rows only.
- **The disagreement check** runs over ALL `mode = 'vts'` rows, because eval-cycle stamps `vts` at all eight of its sites. A post-detect row (a signal that passed the guard) carrying a refusable score IS a disagreement. The `paper_sim` rows are the active path's own archive and are excluded.

### 1.7 Langston's §13 finding — the magnitude, and a routing difference that survives this batch
- **xStock's four large lanes are not chosen on the score.** Weighted by the scan score, `morning_star`'s rows sit at about 52 % ≥ 0.35 in each of `xstock-strong_trend`, `pattern`, `xstock-trend` and `xstock-breakout` (Langston; my matched sample above: 49.98 %). It is one symbol set fanned four ways.
- **Crypto routes the opposite way.** Its router keeps `morning_star` off strong-score pairs: 1 row in `quant-strong_trend`, and over 24 h `b63_strong_dbs_exclusion` fired once against 1,770 `b63b`. There, the in-strategy guard really is a second belt. **On xStock there is no first belt.**
- ⇒ **(i)** after the deploy the guards should refuse about half of xStock `morning_star` detect evaluations, and Step 7 publishes that figure next to the 18.3 % trade-level one. **(ii)** Step 10's System Manual and System Impact Map text must NOT say xStock now matches crypto: the routing difference remains.
- **The lane-selection question itself** is a separate item. Langston proposed `HOME: B-XSTOCK-LANE-SELECTION, owner CC-B, pre-sprint stage "00 — data truth first", immediately after this batch`. **Under Kyle's 2026-10-19 rule a placement is Kyle's to agree, not Langston's or mine.** So it goes to Kyle through PM Claude next to F2, the same lane, as a proposed placement. DISPOSITION: decision required, recorded on `#1235`, not built here.

### 1.8 What the change ADMITS, not only what it refuses (Langston CHANGES-1)
**Two different facts behind §1.5's "0":**
- **`defensive_hedge`, `reverse_impulse` and `volatility_edge` are NOT EVALUATED on xStock at all.** They are disabled there, and absent from the ten strategies that produced xStock rows in the 11-04 session. This batch does not change that; KD-7's switch-on does.
- **`strong_bull_trend` IS evaluated: 31,509 times in the 11-04 session, every row refused at its FIRST gate.** That gate is `strong-bull-trend.ts:105` (`dbs < sbtDbsMin`): it sees `?? 0` against 0.35 and returns first.
- **After P1 it sees the real score.** About half of that symbol population sits at ≥ 0.35 (§1.6). So on the first session, **Gate 1 opens on xStock for the first time**, and everything downstream of it runs on xStock for the first time: the Donchian lookback, the breakout buffer, anti-exhaustion, the ATR geometry, the confidence model. What it emits reaches live paper opens through `dispatchXstockActiveSignal` on the same deploy.
- **Reference rate (paper, since the 2026-10-06 reset, read 2026-11-05 ~04:40Z):**
  - crypto `strong_bull_trend`: **58 of 81** crypto paper closes, about 2.8 a day over 21 active days;
  - xStock: **551** paper closes in all (about 19 a day), none from `strong_bull_trend`.

  It is the strategy that dominates crypto's paper opens.

## 2. THE PLAN — every item names the audit finding it falls out of
| # | item | falls out of |
|---|---|---|
| **P1** | `eval-cycle.ts:571`: `const detectIndicators = { ...mceContext.indicators, dbsScore: propagatedDbs?.score, dbsCategory: propagatedDbs?.category, dbsSlope: propagatedDbs?.slope }`, passed to `callStrategyDetect`. `mceContext.indicators` is untouched. | §1.2 row 1-2, scope OBJ-1 |
| **P2** | `features.detectDbsScore` (`detectIndicators.dbsScore ?? null`) at all EIGHT post-detect archive sites listed in §1.2. **(G):** the scope's "every archived xStock evaluation" means these eight, so that a signal row with a refusable score is detectable as a disagreement. | §1.2 row 5, OBJ-3b, (G) |
| **P3** | OBJ-3 counters on the xStock cycle summary: `dbsCarriedEvals` / `detectEvals` (coverage) and `dbsStrongEvals` (≥ 0.35 share of those). | OBJ-3 |
| **P4** | `volatility-edge.ts:94`: `getCachedNumberRequired('strategy_dbs_routing_guards','dbs_min_threshold',{exchange:'*',assetClass,strategy:STRATEGY_KEY,regime:'*'})`, `>=` arm only (C2). | §1.2 row 3, OBJ-1b, (B) |
| **P5** | `vts-runner.ts:1835-1837`: inside the `isStrongTrendLane` true arm only. **The strongest fence is existing code:** `vts-runner.ts:1627-1628` hard-refuses any non-`crypto_spot` symbol out of `generatePhase10Signal` (8a-P4c P13), so the attach can only ever see `crypto_spot`. Implementation: a small module, `server/services/strong-trend-geometry.ts`, called from the arm, read `strong_trend_override_stop_atr_mult` and `strong_trend_override_target_r_multiple` from `strategy.vwap_pullback` with `{exchange:'*', assetClass:_assetClass, strategy:'vwap_pullback', regime:'*'}`. No literal remains. | §1.1, §1.2 row 4, OBJ-1c, (r4-1/2) |
| **P6** | ONE migration, `2026-11-05-b-xstock-dbs-to-strategies.sql`, plus a rollback file, a MANIFEST line and a count assertion of **exactly 3** inserted rows. The rows: `strategy_dbs_routing_guards / dbs_min_threshold / * / * / volatility_edge / * = 0.35`; `strategy.vwap_pullback / strong_trend_override_stop_atr_mult / * / crypto_spot / vwap_pullback / * = 4.0`; `… target_r_multiple … = 3.0`. Appending it to `MANIFEST.txt` makes a fresh database receive the rows after both existing seeds (Langston's seed-file item: both seeds ARE in the manifest, lines 41 and 74). | §1.2 rows 3-4, (B), seed-file item |
| **P7** | **The observation that would catch a missing row** ((C), and Langston's r1b note): Step 7 counts `[B79.0m.b2][EVAL_DETECT_FAIL]`, `[11.0E.1][VTS] Strategy execution failed` and `[37.A][SIGNAL] Error evaluating strategies` over the first session, against the same count over the session before the deploy. **PASS = no increase, and none naming `dbs_min_threshold` or the new constants.** No new alert is built here: a config-missing page is a wider decision (`#1239`'s family), recorded, not folded. | §1.3 |
| **P8** | The B72 consistency test: `volatility_edge` joins `STRATEGIES` (`:34`), and the four "all 4" titles (`:55`, `:72`, `:94`, `:112`) are renamed. **Run against staging at Step 7** (skipped in CI, `#661` leg 3). | (r4-3), C1 |
| **P9** | Unit tests: (a) the detect input carries the three fields, and a mutation removing them goes red; (b) with `propagatedDbs` undefined the fields are absent, not 0; (c) the ten MCE fields are preserved; (d) `detectDbsScore` is written at the strategy-null site, plus a source fence for all eight; (e) volatility_edge reads the row (a mock at 0.20 refuses at 0.25), and a source fence finds no literal 0.35 at that guard; (f) the strong-trend attach reads the rows (mock 5.0 / 2.0), the non-strong-trend path with no row does not throw, and a source fence finds no `4.0` / `3.0` literal at the attach. | OBJ-1, 1b, 1c, 3b |
| **P10** | **Step 7, as pre-registered, superseding scope OBJ-4 where they differ:**<br>• **(a)** disagreement over all `mode='vts'` rows; 1 % floors on `gate='strategy_detect'` rows (§1.6 condition 2); bidirectional for morning_star, vwap_pullback and sma_trend_ride; plus (D)'s null arm.<br>• **(a′)** per-row value equality against `pair_scan_archive`: ≥ 99 % equal and ≥ 90 % matchable (§1.6 condition 1).<br>• **(b-control)** xStock `strong_bull_trend` refusals for `dbs_below_threshold` fall from 100 % of its detect rows (a positive control on the hand-off).<br>• **(b-observe) a bounded first-session observation of what is ADMITTED, pre-registered here.** Over the first full US regular session, report xStock `strong_bull_trend` signals generated, VTS opens and paper opens. **INVESTIGATE** (look, and report to Kyle with the trades) if ANY of these holds:<br>  (i) **> 10** xStock `strong_bull_trend` paper opens in that session, which is about half a normal day's entire xStock flow;<br>  (ii) `strong_bull_trend` makes up **> 50 %** of that session's xStock paper opens;<br>  (iii) any xStock `strong_bull_trend` open whose stop or target does not match its declared geometry (stop = entry − 3×ATR, target = entry + 6×ATR, within the venue tick);<br>  (iv) any `[B79.0m.b2][EVAL_DETECT_FAIL]` for `strong_bull_trend`.<br>**"Investigate" is NOT a switch-off.** Kyle's rule is that strategies run until calibration (2026-10-19), so nothing is turned off on early results; the observation is what makes a surprise visible on day one rather than in a weekly read.<br>• **(c)** crypto unchanged.<br>• **Report:** the evaluation-level refusal share (expected ≈ half for morning_star, §1.7) beside the 18.3 % trade figure.<br>• **(E)** read `pre_filter` at the deploy and at the measurement; a zero population is FAIL.<br>• **P7**'s log counts.<br>• **(d)** Filter Diagnostics in Chrome. ⛔ **The Drift Dashboard is not opened** (`#1037` am.4). | (D), (E), §1.3, §1.4, §1.6, §1.7 |
| **P11** | Step 10: System Manual (the xStock detect input: what it receives, why it spreads, and that it is the same score as the regime's); System Impact Map (the eval-cycle entry, the two settings, the archive key, and the **`:1690` correction**: no `paper-execution-engine` consumer, and `strategy-engine` reads, it does not attach); `LEVER_INVENTORY` (the B63 group gains a member; two levers leave code; **`:436` names the group as four**). Also: **the B72 test header (`:4-20`) names four**. **The Manual and the System Impact Map must state that xStock routing still differs from crypto's (§1.7 ii).** **One Manual sentence on why the two detect objects differ:** crypto's is an explicit field list (`vts-runner.ts:1824-1838`), and xStock's is a spread that preserves its input field for field. That way nobody later "harmonises" them by narrowing xStock. **Step 5:** confirm the CI job runs the B72 file against its database (`ci.yml:104`/`:113` set `DATABASE_URL`) and that the fifth row is present there; a skip is not a pass. | §1 sources 3-4, (r4-5) |
| **UNAUDITED** | — none. Every item above has a finding. | |

## 3. Risks that remain, stated
- **⚠️ NAMED RISK — `strong_bull_trend` goes live on xStock for the first time (§1.8).** It has never produced an xStock trade. On crypto it accounts for most paper opens (58 of 81 since the reset). Its downstream gates and geometry have never run on xStock's 15-minute bars. Mitigation: P10 (b-observe) pre-registers an "investigate" threshold for the first session, and the geometry check in (iii) catches a mis-sized trade on its first occurrence. Not a switch-off (Kyle, 2026-10-19).
- **A step change in xStock behavior is the point, and it lands in live paper trading at once.** Mitigation: (a) is exact, so a wiring error shows on the first session. Rollback is the code plus the migration rollback.
- **Module-constant completeness tests** may expect every `strategy.vwap_pullback` constant to exist for both classes. P5's two constants are crypto-only by design. **Checked in Step 3 by running the full suite before the push**; if a per-class completeness test exists, the xStock absence is declared there rather than seeded with a guessed value (F2's xStock half is Kyle's).
- **F2's xStock half stays open** (Kyle decision, via PM Claude 2026-11-05).
