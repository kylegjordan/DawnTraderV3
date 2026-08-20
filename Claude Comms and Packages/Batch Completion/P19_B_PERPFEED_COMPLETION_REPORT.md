# P19-B-PERPFEED — COMPLETION REPORT

**Batch:** P19-B-PERPFEED — crypto-perpetual FEED CAPTURE (capture-only; perp TRADING remains Phase 26)
**Owner:** CC-C (Claude Analyst) · **Reviewer:** Langston · **Directive:** Kyle 2026-08-17 ("I wanna start scanning all of that in, not just twenty one perpetuals")
**change-class:** architecture
**Dates:** scoped 2026-08-17 · Steps 1-4 closed 2026-08-18 · deployed 2026-08-18 (`f245ac3a7`) · capture switched ON 2026-08-19T21:22Z (Kyle-directed) · close-out sweep + hotfix 2026-08-20
**CI at close:** run **32371883918**, head `2f05a09b9`, **all 4 jobs GREEN** (TypeScript Check / Test Suite / Build / Docker Build)

---

## ⚠️ SCAFFOLDING-VS-FUNCTIONAL DECLARATION (§9.1)

> 🚨 **THIS BATCH DOES NOT MAKE CRYPTO-PERPETUAL TRADING FUNCTIONAL. NOTHING IN THE TRADING PIPELINE READS THIS DATA. Perp trading is Phase 26, post-launch.** What this batch delivers is the DATA SUBSTRATE — the price/quote history a future phase needs before perp strategies can be designed at all.

---

## PREVIOUSLY-STATED-VS-NOW (§9.2)

| Figure | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| Universe size | ~257 crypto perps (venue arithmetic: 276 PF_ − 16 equity − 3 FX) | **184 members** | The relevance filter (base must exist in OUR crypto_spot universe) is stricter than the venue list — measured at the first live recompute, not estimated. Of 300 venue instruments: 16 equity, 20 dated, 4 inverse, 74 refused UNCLASSIFIED (68 coins outside our universe + 6 commodity/FX perps). |
| Standing disk cost | ~50 GB/mo at 5 s pacing; ~27 GB/mo at 10 s | **≈19.5 GB/month** resident | Reported by the first live recompute at the seeded 10 s pacing over the real 184-member universe — the §4 gate's own instrument. |
| OBJ-2 landed-rows evidence | "first flushes verified (184 rows/flush, 368k-bar REST backfill)" | **376,648 OHLC rows / 184 symbols; 987,460 ticker rows** | ⛔ The previous claim was **REFUTED** — its instrument was the archiver's SCAN counter (write ATTEMPTS) while every flush was in fact throwing (#704). Corrected in the `STORAGE_POLICY.md` body at Langston's Step-4 condition, not stacked as a note. |

---

## OBJECTIVE CHECKLIST

| # | Objective | Status | Evidence |
|---|---|---|---|
| **OBJ-1** | Universe selection — dynamic, field-driven, ALL crypto perps | **YES** | First live recompute persisted 184 members from 300 venue instruments with every bucket counted (16/20/4/74). Cap 400 is a sanity bound, not a scope limit; the monthly recompute reports budget consumed rather than capping scope. |
| **OBJ-2** | Born-daily tables at 30-day hot retention | **YES** (after #704) | Both tables live, daily-partitioned from birth, 17 daily children present through 2026-09-03. **Landed rows measured by `count(*)` 2026-08-20T13:1xZ: 376,648 OHLC / 184 symbols (120 MB) and 987,460 ticker (308 MB)** — sizes summed over partition CHILDREN (a partitioned parent reports 0 bytes; stated because I nearly quoted the parent's 0). Retention seeded 30 d hot on both. ⚠️ The warm export→verify→drop round-trip for THESE tables is not yet exercised — first eligible ~2026-09-18. |
| **OBJ-3** | Generalize the equity-perp archiver into one engine + two facades | **YES** | `kraken-futures-archiver.ts` (new engine) with `equity-perp-archiver.ts` / `crypto-perp-archiver.ts` as facades; zero caller churn. Behaviour preservation measured across the cutover: xstock_perp kept writing (40 rows in the first 3 minutes, 12:17→12:20Z, `max(captured_at)` live) and its stats surface is unchanged. |
| **OBJ-4** | Canonicalizer + classification, refuse-and-log | **YES** | Field-driven classification (perpetuality via `lastTradingTime`; equity via the lowercase-x base; crypto positive requires crypto_spot membership joined through the venue's own altname table); UNCLASSIFIED refuses and logs — 74 refusals recorded rather than guessed. 24 unit tests incl. 14 collision pins, a 16-symbol equity negative control, and a source-order pin. |
| **OBJ-5** | Monitor visibility | **PARTIAL** | The passive-archive status endpoint carries the crypto_perp leg (cumulative counters, `wsConnected: true`, per-leg disk). ⚠️ Its `ohlcRowsInWindow` / `tickerRowsInWindow` read 0 for **every** leg including the pre-existing ones — an aggregator-window defect that predates this batch and is not crypto-perp-specific. §9.3 UI render-check of the panel NOT performed. Known limit 4. |
| **OBJ-7** | Retention fold-in | **YES** | The #685 sweep-column fix (`'ts'` → `interval_begin`) landed and was proven by a two-leg gate test: the NEGATIVE leg captured live pre-fix (the sweep FAILED on the synthetic partition), the POSITIVE leg completed post-deploy — export → warm object → checksum verified → hot partition dropped, `positive_leg_complete: true`, 2026-08-19T02:15Z. |
| **OBJ-8** | #440 takeover — per-class ticker throttle | **YES** | crypto_perp override live at 10,000 ms against the 4,000 ms global (boot log 2026-08-20T12:17:38Z); the other three legs continue at the global value. #440's home updated in RUNNING_ISSUES. |
| **OBJ-9** | July early-split acceleration | **YES** | Executed as the daily-slice path — the delete-in-place proposal was WITHDRAWN after measurement showed it frees zero bytes on the gauge (relief-shaped, no relief). May signal_eval: 10.33 M rows, 6.96 GB → 133 MB warm (52.2:1, 13.2 min wall-clock). June: sliced to 30 verified warm objects. **Database 152.4 GB → 122 GB across the two nights (78.9% → ~61% of the plan cap).** |
| **OBJ-10** | Storage-machinery deep audit + the 30-day default rule | **YES** | `STORAGE_POLICY.md` §2.5 carries Kyle's rule verbatim plus the retention==window invariant; §3 is complete with every table dispositioned; the four analytics tables restored 17 → 30 d once their backlog tiered (alert `c5ad11d1` discharged with read-back). Four dead `equity_*` retention keys deleted (DELETE 4, read-back 0). |
| **OBJ-11** | Warm-tier gauge | **PARTIAL** | Warm usage measured and reported (127 objects / 17 GB at the question; the arc has since added ~20 GB compressed). ⚠️ The automated warm-capacity CHECK is NOT built — gated on Kyle confirming the real quota and the Supabase SPEND-CAP setting, still outstanding. Known limit 5. |
| **OBJ-6** | Governance | **YES** | See the governance-files list below. |

---

## FIX-ON-FIND WORK CARRIED INSIDE THIS BATCH (rule 23)

- **#690 — feature-enrichment chronology.** The service assumed newest-first data while `storage.getPriceData` returns oldest-first, so RSI came out mirrored (27.02 against a true 72.98) and every window read the OLDEST rows available. Fixed to one chronological convention, with the ASC contract now stated AT `getPriceData` where the next reader looks. **Trading path verified CLEAN** — every strategy uses `strategy-helpers.ts:78`, which was already correct. Two dead modules deleted in the same pass (`saveEnrichedFeatures`; `data-normalization.ts`, Langston's sibling find). **Proven live by the designed instrument:** the 03:00Z formula audit now reports RSI **PASS at 0.01% deviation**, having reported FAIL at 62.98% for days.
- **#704 — this batch's own defect.** See known limit 1; found at post-deploy verification, fixed, deployed and verified same-turn.
- **#691 — the two silent daily crons.** Re-tested post-restart: `formula_audit_cron` fired 03:00:00.013 SUCCESS and `xstock_universe_discovery_cron` 06:00:00.040 SUCCESS ⇒ transient timer death confirmed, no code-level defect. Both alerts resolved with that evidence.

---

## KNOWN LIMITS (stated, not buried)

1. **#704 — this batch shipped a table that could not be written to, and it stayed that way ~15 h.** `crypto_perp_ohlc_1m` was created without the `(symbol, interval_begin)` UNIQUE its three siblings carry, so every writer flush threw on `ON CONFLICT` and dropped the already-drained batch: **368,841 bars scanned, 0 rows landed.** Root cause is a premise error in OBJ-2 — "column shape of the xstock_perp twins" silently excluded CONSTRAINTS, which are not declared in Drizzle for any of the four tables. **Actual data lost: nil** — the REST poller re-fetches a 2,000-bar window and the first post-fix poll recovered ~33 h (measured, not assumed). Fixed by migration plus a **derived** fence (`p19-perpfeed-ohlc-upsert-constraint-fence.test.ts`) whose subject is `Object.keys(tableForAssetClass)`, so a fifth asset class extends it automatically — a hardcoded name list would have passed green while the defect was live. **All three fence legs RAN in CI** (run 32371883918), including a with/without discrimination pair proving the probe can fail.
2. **The failure was invisible on the log everyone reads.** Success logs via `console.log`, failure via `console.error`; `out.log` — the file every runbook names and that I have cited as evidence in three batches — carried no trace of 4,802 consecutive failures. **Rule adopted, in Langston's general form: a positive control must match the STREAM and the SEVERITY CLASS of the absence it licenses.** My `out.log` control passed and was the wrong control: it proved that stream can carry a SUCCESS line, never that it could carry an ERROR one. `error.log` joins the post-deploy read-set and has the longer reach (daily, retain=14, vs `out.log`'s 6-8 rotations/day at 1 GB).
3. **#705 — a failed flush loses its batch with no retry**, on both writers (the buffer is spliced before the insert). Recoverable on OHLC (re-fetch); **UNRECOVERABLE on the ticker writer** — point-in-time snapshots, no re-fetch path, and the higher-volume leg. Rule-24 bucket 2: a scope decision, not a patch, because the naive re-buffer against a permanent error would have grown the buffer unbounded for 15 h. **Owner CC-C, due 2026-09-05.**
4. **OBJ-5 partial** — the panel's in-window row counts read 0 for every leg (pre-existing aggregator defect); the §9.3 UI render-check for the new leg was not performed.
5. **OBJ-11 partial** — the automated warm-capacity check is unbuilt, gated on **Kyle's Supabase quota + SPEND-CAP confirmation** (outstanding).
6. **Warm round-trip unexercised for the two NEW tables** — first eligible ~2026-09-18. The OHLC-family tier path itself is proven by the gate test, but not on these tables.
7. **The OHLC ×3 retention flip (365 → 30 d, ~14 GB) is ARMED, NOT EXECUTED** — Langston's condition (ii) gates it on the 2026-09-01 equality assertion (alert `3116a19d`). Deliberate, dated, and not forgotten.

---

## GOVERNANCE FILES CHANGED

- `1-system-manual/SYSTEM_IMPACT_MAP.md` — the P19-B-PERPFEED component table (P1-P9) plus the two stale B74/B74.1 equity-perp rows re-pointed at the facade
- `1-system-manual/SYSTEM_MANUAL.md` — venue-membership classification + the shared Kraken-Futures capture engine (Part VI architecture note)
- `1-system-manual/STORAGE_POLICY.md` — §2.5 rule + invariant; §3 rows for both new tables (born-30) and the four restored analytics tables; §9A registry; **OBJ-2 evidence line corrected to landed rows**
- `1-system-manual/RUNNING_ISSUES.md` — #687, #690, #691, #692, #693, #696, #697, #698, #699, #703, **#704**, **#705**; the #592 absorbed-into annotation; #440's home moved
- `1-system-manual/DELETED_COMPONENTS_LOG.md` — `saveEnrichedFeatures`, `data-normalization.ts`, `feature_snapshots` (table + schema + three storage methods), four dead `equity_*` retention keys
- `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — **R-VENUEFIELDS** (field-driven venue classification; four transferable learnings)
- `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — batch row (capture substrate landed early; §7.2 perp deltas untouched)
- `Claude Comms and Packages/Scope Files/P19_B_PERPFEED_SCOPE.md` + `_PRE_AUDIT.md` — the scope of record
- `Claude Comms and Packages/Scope Files/P19_B_PERPFEED_CLOSE_DECISION_NOTES.md` — the three decisions owed to Kyle
- **Owed before the batch is CLOSED:** `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md`, and the Langston MEMORY sync (§2 step 10.b)
