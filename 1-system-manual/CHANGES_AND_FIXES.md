# DawnTrader: Changes, Fixes & Improvements Registry

---

## FIX-2026-06-20-A — B-DISCORD: Discord comms fabric (parallel, unswitched) + Langston wake-routing fix

**Class:** comms/ops infrastructure (non_architecture; no trading-engine/regime/strategy/signal/math touch). **Shipped:** 2026-06-19/20. Langston Step-1 PROCEED + OBJ-5 design approved (both via Discord). **Batch OPEN** — OBJ-5 (alerts→Discord) is now CODE-COMPLETE both sides (bridge always-engage on the alerts `webhook_id`, commit `383d5c04e`, deployed+verified inert; staging `pushToDiscord` direct-POST, commit `e4b5499be`, tsc clean) but INERT until a one-time Kyle webhook provisioning (URL→staging secret, ID→bridge config); final completion report + close deferred until activated+verified (#332). *(CI is red on the branch from reorg-B2's `telemetry_history.source` migration drift — NEW Claude's batch, not this change.)*

1. **Discord comms fabric built + deployed in PARALLEL with Telegram (NOT switched).** Native bot-to-bot messaging (the Telegram platform blocker) makes CC↔Langston an in-channel `on_message` exchange, obsoleting the §6.5 SSH-deliver/file-first/hung-instance apparatus. Components in-repo at `comms-infra/discord/` (`discord_common.py`, `discord-cc-bridge.py`, `discord-langston-bridge.py`, `cc-send`, two `.service` units, `comms-active.env`), deployed to Helsinki `/opt/discord-bridges/` (venv, discord.py 2.7.1). Separate inbox log `/var/log/cc-discord-inbox.jsonl`; switch `COMMS_BACKEND=telegram` (single source of truth `/etc/dawntrader/comms-active.env`); Telegram stays the live instant-rollback backend. Display names OLD Claude (CC-A) / NEW Claude (CC-B) via per-session webhook usernames. Loop-safety: self-guard, start-with-"Langston" address gate, circuit breaker, message-id dedup.
2. **Langston bridge auto-leads every reply with the addressee's name — WAKE-ROUTING FIX.** Live failure observed: Langston answered NEW Claude's scope but named no one, so NEW Claude's wake watcher (keys on the session name appearing in a post) never fired and he sat waiting on a reply that had landed. Fix (deterministic, NOT prompt-reliant): `resolve_recipient_name()` derives the addressee from the triggering message's author (Kyle / OLD Claude / NEW Claude via webhook display name) and prepends `"<name> — "` to the outgoing reply, double-name-guarded. Deployed + restarted (`*.bak-20260620`); **live-verified** (Langston's next reply auto-led "OLD Claude —" and woke CC-A). Commit `ca8aa9aa1`.
3. **Follow-on comms-infra changes (2026-06-20/21, surfaced through live use of the parallel Discord run):** (a) **Circuit breaker effectively removed** — `BOT_TURN_LIMIT` 6 → 30 → **100,000** (`discord-langston-bridge.py`, commit `eb2a92a75`+): a real overnight CC↔Langston review is 30-50 msgs; the cap of 6 tripped mid-review and SILENTLY dropped NEW Claude's reorg-B2 Step-4 sign-off requests (`bot_turns 7/8/9` in the bridge log). 100k is unreachable in normal use, still bounds a pathological loop; Kyle posting resets it. (b) **Relay hand-off rule** (MEMORY §4.7 + CLAUDE.md §6 banner): the asker owns relaying a Langston answer that's meant for the OTHER CC (his reply auto-leads with the asker's name, so the intended CC won't wake otherwise). (c) **System alerts → Discord (OBJ-5) keyed off a dedicated alerts webhook_id** rather than the body `category` substring (Langston-approved structured marker; spoof-resistant) — bridge + staging both built, inert until provisioned.
4. **Governance:** SIM (new Discord comms section + dual-backend Cross-Cutting Runtime State), CLAUDE.md §6 Discord banner (model + parallel status + Telegram-fallback posture + the mechanics-on-record block) + §6.11 transcript-repair pointer, topic-21 searchable archive (654 entries), this entry, RUNNING_ISSUES (OBJ-5 blocked-on-Kyle + cutover-future), BATCH_CATALOG, PHASE_HISTORY. Scope `B_DISCORD_SCOPE.md`, pre-audit `B_DISCORD_PRE_AUDIT.md`, punch list `B_DISCORD_FOLLOWUPS_2026-06-20.md`.

---

## FIX-2026-06-14-A — P19-B4a: xStock active-path wire-in + feed-safety (stamp-at-source collision root-fix + reb-2-12F source-text-coupling removal + pattern-cap interim correction + calibration_state tag)

**Class:** asset-class-correctness (collision-mislabel structural root-fix) + diagnostic-coupling removal + risk-floor correction. **Fixed:** 2026-06-14 (commits per chunk: C1 `89b76c8b8`/`755857016`, C2 `d37e9cc9e`, C3 `df00c27c8`, C4 `450383164`, C5 `da83a48ad`, C6 `0cd3e0575`, C8 `71690d99e`), Langston Step-4 review. **Active trading OFF; the xStock active-dispatch path is DORMANT until P19-B7b flips `system_context.isEngineActive` (CLAUDE.md §9.1).**

1. **(C1/C4) Collision-mislabel-via-resolve-from-symbol — STRUCTURAL ROOT-FIX (stamp-at-source).** The active signal-build path re-derived asset class from the symbol (`resolveAssetClass(rawSignal.symbol)`) at ~9 sites inside `buildSizedSignalForStrategy`. For the **17 collision tickers** (9 USD + 8 EUR — e.g. `SUI/USD`, identical canonical form as BOTH an xStock and a crypto pair) this is **wrong-by-construction**: `resolveAssetClass` always returns `crypto_spot` for them (the collision rule), so a collision xStock would silently read CRYPTO friction at the Net-EV gate. Fix: `SizingContext.assetClass` is now a REQUIRED field stamped ONCE at the per-pipe entry chokepoint (crypto `evaluateMarket`; xStock dispatch connector) and is the SINGLE source of truth — every build site reads `sizingContext.assetClass`, never re-resolves. Invariant: one `SizingContext` = one class = one pipe. Fail-loud both ways: a build-site assert (names pipe+symbol+strategy) + an RTB-write throw on missing/invalid (catches an as-any / JSON-boundary loss). `resolveAssetClass` survives ONLY for stored-row / diagnostic re-resolution (its collision rule kept there). C4 hardens the remaining consumer sites: prefer the upstream stamp via `asValidAssetClass` (present-but-invalid → null → fallback → safe-skip), with an active-only escalation hook (`setClassifyFallthroughHook`) and a #230 vts-runner fall-through hard-skip. Regression-locked by a `SUI/USD` two-pipe test (xStock pipe → `xstock_spot`, crypto pipe → `crypto_spot` — could not pass under resolve-from-symbol).
2. **(C5) reb-2-12F diagnostic source-text-coupling REMOVED.** Disposing the orchestrator's hardcoded `enabledStrategies` allowlist (two inline `[9]` literals + a `Set` + two dead public methods) surfaced a fragile coupling: the `/reb-2-12F/strategy-health` diagnostic (`routes.ts:10617`) was **regex-parsing the orchestrator SOURCE TEXT** for the deleted `Set` to learn which strategies were wired. Re-pointed at `STRATEGY_DISPLAY_NAMES` (the canonical SSOT) — a diagnostic now reads a data structure, not source code. DELETED_COMPONENTS_LOG entry added for the disposed machinery.
3. **(C8) xStock pattern cap 0.50 → 0.15 — INTERIM risk-floor correction, NOT a calibrated value.** `module_constants.pattern_pool_gates.xstock_spot.pattern_max_position_pct` was an unjustified `0.50` placeholder — 3.3× crypto's validated `0.15` and pointing the WRONG direction (xStock is LESS liquid than crypto, so its single-position concentration cap should be ≤ crypto's). A shadow-evidence validation of the cap *binding* is impossible pre-activation (no active-paper xStock position sizes exist). Interim correction to `0.15` (risk-reducing, crypto-aligned, DB-adjustable). **The final per-class evidence-calibrated value remains a Phase-25 / B7b pre-flight item (#153).**
4. **(C6) `calibration_state` column is INERT until a future write-path batch.** `paper_sim_trades` + `paper_sim_open_positions` gained `calibration_state TEXT NOT NULL DEFAULT 'pre_calibration_xstock_2026_05'` (Postgres fast-default auto-backfills every existing row; mirrors F-NOW's VTS-side tag). **NOTE:** there is no write-path code — the NOT-NULL DEFAULT tags everything uniformly today; the column does nothing until a future batch transitions rows to other calibration eras. Schema-only, telemetry-grade.
5. **(C7) DEFERRED — RTB `asset_class SET NOT NULL` → #237 (B7b post-activation).** The 48h zero-null soak would be vacuous while the only `rtb_signals` writer (the active orchestrator path) is dormant; the substantive A4 deliverable (the resolver-backed write, C1) shipped.

**Governance:** SIM (Recent Additions P19-B4a + §4.1 + stale-path/stale-wiring corrections), SYSTEM_MANUAL (stamp-at-source SSOT invariant + active-path strategy gate + rule-20 paper-fill correction), this entry, RUNNING_ISSUES (#236/#237/#153 dispositions), ASSET_CLASS_ONBOARDING_WORKFLOW (stamp-at-source + reachability + confidence-trap learnings), MULTI_ASSET_VTS_EXPANSION_PLAN (working list), BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN, completion report.

---

## FIX-2026-06-13-A — P19-B1: test-suite to TRUE green (12-fail/141-skip → 0/0 both environments) + TEC.b strict restore SHIPPED (#141) + 2 latent production-tooling bugs

**Class:** test-infrastructure correctness + config-resolution strictness. **Fixed:** 2026-06-13, commits `cc5f6d627`+`5a4926062` (CI `27450164011` green), deployed 00:21:28Z, Langston Step-2 PROCEED + Step-4 APPROVE.

1. **Bench/CI parity (Bucket A):** the "59/12 pre-existing failures" story was FALSE — CI has been zero-tolerance green since B-NEW-43; all bench failures were environment (no local DB / Windows). Fix: Docker Desktop (Kyle-approved install) + `docker-compose.test-db.yml` (pgvector/pg17 ci.yml mirror) + runbook. 134 of the 141 "skipped" tests were DB-collapsed file contents — all run and pass now.
2. **Latent bug — `scripts/db-migrate.ts`:** `URL.pathname` doubled the Windows drive (`C:\C:\`); `fileURLToPath` fix, behavior-identical on Linux (+ fixes percent-encoded paths). Never seen before because the script had only ever run on Linux.
3. **Latent bug — `regime_mapping_integrity.test.ts`:** beyond the Windows separator mismatch, the scan regex carried the `g` flag → stateful `lastIndex` could silently SKIP violations on any platform after a match. Both fixed; guard-the-guard verified (planted violation caught + named, re-green after removal).
4. **Pattern-filter hermeticity (Bucket C):** all 7 failures = ONE unmocked B-NEW-34 DB read (`pattern-filter.ts:247`), masked in CI by its real DB since 2026-05-23. Fixed via `_seedModuleCacheForTests` (real resolver exercised). Zero production regressions — both review drift-hypotheses refuted with evidence. Systemic mask survives → #226 (unit/integration tier separation).
5. **TEC.b strict restore (#141, Bucket D):** `pick`→`requireKey` all 11 keys, scaffolding deleted (zero-consumer sweep), `ALL_TEC_KEYS` exported, 5-test strict regression lock incl. 12th-key fixture tripwire, 8 stale fixtures repaired across 6 files (blast radius MEASURED at exactly the park-record +50 before repair), obsolete defaults-backfill test REWRITTEN to lock the strict contract. Deploy proof: `[TEC_PRIME] bootstrap complete — 4 active classes warmed in 29ms`, zero TEC throws.
6. **Skip audit (Bucket E):** 7 parked-stale skips DELETED with replacement coverage verified first (universe-service Layers 2+4 + daily discovery health check); 5 b72 skips legitimately conditional (run with DB present).

**Final state:** 1880/1880 tests, 161/161 files, 0 failed, 0 skipped — bench AND CI. Every future red is a real signal.

---

## FIX-2026-06-12-C — B-4.6-B chunk B: scan-stall eliminated (yields + the Batch-44 persistDiagnostics root cause DELETED per Kyle's legacy ruling)

**Class:** event-loop starvation (scan stalls 200-700ms every 30s sweep; the 2026-06-09 cron-miss source). **Found:** item-4 throughput study caveat-0 → chunk-A instrument soak → chunk-B iterations. **Fixed:** 2026-06-12, commits `ff0b0e36e` (yields) → `7a28ac307`+`31e39bbf6` (attribution instruments) → `c1a252bbe` (root-cause JSONL, superseded) → `b35f7e5fe` (deletion, FINAL), all CI-green, final deploy 13:55:57Z. Langston full-cycle: Step-4 APPROVE (judgment calls ratified) → iteration-4 APPROVE (attribution chain) → iteration-5 APPROVE (deletion) → Step-8.

1. **Cooperative yields (shipped, working):** elapsed-gated (20ms) `setImmediate` macrotask yields at pair/batch boundaries ONLY (granularity lock — never mid-pair) in the crypto prefetch loop (batch-of-10 boundaries), the xstock DBS pre-loop + eval loop (symbol boundaries; the pre-loop was a ratified ADDITION beyond the pre-audit's three named loops — a NEW interleave class, mutation-harmless on 15-minute bars + the store's publish floors), and the vts eval loop (resolve loop untouched per C1). Verified: all four instrumented segments collapsed to <17ms max spans (from 95/72/32/25.5ms); counters and cadence byte-identical; `[4.6B][YIELD]` lane counts on the METRIC stream.
2. **PREVIOUSLY/NOW (soak attribution corrected, Langston-confirmed):** PREVIOUSLY: the chunk-A soak attributed the 200-700ms interval max to the cumulative crypto-prefetch run. NOW: that was PARTIAL — the prefetch was a real contiguous-block contributor (fixed by the yields), but the interval MAX was `fx5-scanner persistDiagnostics()` (Batch 44): a `JSON.stringify` of the FULL 24h diagnostics history (20-30MB daily files) + `fs.writeFileSync` EVERY 30s cycle, sitting between two log lines no instrument covered. Attribution chain: iteration-2 cleared GC (max 19-47ms) + main-filter/19F wraps; iteration-3's 50ms STALL watchdog bracketed the block exactly between `[19H][DIAG]` and `[19F][VTS_PARITY]`; magnitude confirmed on disk (24MB at 02:28Z).
3. **The root cause was DELETED, not optimized (Kyle ruling 2026-06-12):** "check to see if it is legacy and therefore can be deleted instead of creating a fix for a fix." Legacy check (enumerate-don't-assert; Langston independent grep concurred): the disk files' ONLY consumer anywhere was the scanner's own boot rehydrate — no script, alert, trading logic, or client read them; the layer existed solely so the diagnostics panel's 24h trend survives restarts (a rider on the March Batch-44 routing fix, never in the SIM). Iteration-4's interim JSONL persist (async O(1) append + retention sweep) shipped, then was superseded same-day by iteration-5's full deletion: `persistDiagnostics` + `rehydrateDiagnostics` + DIAG_DIR + fs/path imports removed (~90 lines), tombstone comment records the ruling. **Scan diagnostics are now IN-MEMORY ONLY** — the 24h panel trend resets at restart and refills over the day; last-scan numbers refill in one 30s cycle. The live consumers (filter-diagnostics endpoint, panel, vts-runner trace stamps) are untouched.
4. **Disk telemetry (rule 7 — what actually happened):** the 1.6GB of unread legacy daily files was removed by the iteration-4 retention sweep at ITS deploy (73 files, 02:39Z); the iteration-5 deploy removed only the residual ~12MB JSONL, after the restart per Langston's ordering note.
5. **Acceptance evidence (CORRECTED per Langston Step-8 — his full-window read, CC-reverified):** pre-fix baseline 179 intervals, max 229-574ms median 319, 0/179 under 50; one ~200-700ms stall PER 30s SWEEP (~120/hour; 18h soak 1073/1076 intervals >200ms). Post-fix 11.5h window (691 intervals): **96 STALL (≥150ms) events ≈ 8/hour — a ~15× rate reduction and the once-per-sweep cadence GONE** (scattered singles, p50 gap 191ms, max 554ms); ELD p99 worst 26.61ms across all intervals (p99 clause: PASS, huge margin); **29/691 intervals ≥250ms max (worst 507.77) — the obj-3 max clause FAILS on the reclassified residual family**. Zero actual cron misses in the window (verifier no-ops only). **Obj-3 disposition: PARTIAL** — scan-starvation objective achieved (Langston concurs); the residual single-event family (#225, quantified baseline above) is the remaining path: either #225's resolution becomes the gate-pass path, or Kyle explicitly accepts a gate amendment (his call — a scoped gate clause is not ours to waive). Formal 24h read rules on the gate AS WRITTEN (alert re-issued with the corrected framing). **§9.2 process note:** CC's first close-out figures ("9 stalls/11h", "max 114-182ms") were a ~80-minute windowed count wrongly extrapolated + snapshot tails (rule 13) — Langston's Step-8 full-window scan caught both before governance landed; same failure shape as BUG-2026-05-06-A, same fix: enumerate the full window, don't extrapolate.
6. **Permanent instrumentation kept (Langston-endorsed):** the ELD histogram + segment spans + GC observer + the 50ms STALL watchdog (`[4.6B][STALL]` logs each ≥150ms blockage window's wall-clock bounds — the standing tripwire that names any future blocker; it found this one).
7. **Telemetry-interpretation notes (Langston Step-4):** `dbs_compute_ms` in CYCLE_DBS_TIMING now includes injected macrotask turns — a post-deploy rise vs B-PHASE-A2 historicals is NOT a regression; the `yields=` count on that line covers the DBS pre-loop only (full xstock count = the `[4.6B][YIELD] lane=xstock_cycle` aggregate).

---

## FIX-2026-06-12-B — B-5.1: AMR input-integrity fixes (#222/#223/#224 + the Note-3 gate gap), same-day per Kyle's fix-now directive

**Class:** learning-input correctness (3 input-corruption sources + 1 fail-open gate). **Found:** B-5 Step-8 / Obj-15a audit (FIX-2026-06-12-A's "NEW from the surface" tail). **Fixed:** 2026-06-12, code commit `56def88c9` (CI `27383817109` green), deployed `5737b1ddb`, Langston Step-4 APPROVE + addendum OK-DEPLOY + Step-8 CONFIRMED. **⏱ DEPLOY TIMESTAMP `2026-06-12T01:01:56Z` is a dual boundary record:** (D1) the intra-epoch-4 boundary for crypto DBS-stamped rows — vts rows stamped with crypto `globalDirectionalBias[Score]` BEFORE this instant carry the equity-contaminated aggregate, AFTER carry the clean one (no epoch bump: same-formula input cleanup, not a units/formula change); (D2) the AMR shadow-week evidence annotation — any crypto DBS-input step-change at this timestamp is the fix landing, not a market event.

1. **(#222) Crypto DBS equity contamination — root cause + allowlist.** `market-context-engine.ts:1395` called `directionalBiasStore.updatePair` un-class-gated (B63-era, when only crypto flowed; xstocks entered computeContext at B79.0m.b; B79.0n.MCE class-keyed the cache but missed this write). 24 equity-looking symbols carried 52.6% of crypto global DBS weight with consolidated-tape volumes. Fix: `if (assetClass === 'crypto_spot')` allowlist (Note-1 decision: allowlist over denylist — any future class excluded by default). Verified: post-restart refill pure — permanent `probe_dbs_class_purity` audit leg (registry-based `safeResolveAssetClass`) PASS n=180 zero non-crypto; class-generic regression test (xstock + synthetic class can't write). Baseline-note: the heuristic "24 equity symbols" list overcounted ≥1 (GRASS/USD is a genuine Kraken crypto token). Weight-cap (`GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT=1.0`) deliberately not bundled — Phase-19-prep design question.
2. **(#223) Negative-spread writer guard at the chokepoint — fired live 18× in the first 10 min.** `setCostMetrics` now drops a negative `data.spread` at the FIELD level (crossed/stale book = non-measurement): existing entry keeps prior good spread while siblings update; no existing entry → `null`, nothing fabricated (stamping DEFAULT_SPREAD would inflate friction-sampler n with invented data — a cache miss is the honest state); zero stays accepted (locked book IS a measurement); once-per-symbol-per-5min rejection log. Covers both writers (market-scanner, fx5-scanner). 4-test unit matrix. **Live proof:** 18 rejections in `error.log` by 01:12Z (ALEO/EUR, AURA/EUR, BABYSHARK/EUR, CGN/EUR, ... — all the −1 sentinel: stale tickers with missing ask). **Evidence-process note (Langston Step-8 catch):** the rejection line emits on stderr → `error.log`; CC's first grep checked `out.log` and wrongly reported "no live event yet" — corrected and independently re-verified before close.
3. **(#224) Friction warm-up → IDLE + the Note-3 4th gap (fail-closed `no_posture`).** Friction `null` with reason WARMING/NO_SOURCE now classifies IDLE (staleness `friction_warming`/`friction_no_source`); LOW_VOLUME_THIN + MARKET_CLOSED stay LIVE (measured absence ≠ warm-up). Pre-audit investigation of Langston's Note-3 found the REAL gap: amr-gates' null-mode branch under `enforce` returned allowed/skipped — an ungated ACTIVE-restart window the IDLE extension would have WIDENED. Now: `enforce`+null → fail-closed block, gate `no_posture`, entry-side only (all 4 gate sites are entry-side; exits never gated; posture is in-memory-only — no persisted-posture hazard); `dry_run`/shadow unchanged. **Live proof from the deploy restart itself:** first ledger cycle both classes IDLE (xstock `friction_warming` — the exact transient that used to stamp false CALM); first LIVE reads CHOPPY→DEFENSIVE (crypto) / STORMY→SURVIVAL (xstock), both ≤ NORMAL per the post-IDLE cap.

**Verification:** 13/13 audit legs PASS post-deploy (run 01:07:49Z); Langston Step-8 independently re-ran the audit script, ledger query, and log greps — CONFIRMED. §9.2 PREVIOUSLY/NOW: the scope's "DBS settles ~0.227" expectation was superseded — pinned to a 7.5h-stale snapshot of a live market quantity (critical rule 13); the integrity criterion is the purity probe + diff + tests.

**⚠ Process lesson (Langston Step-8 record item — same failure shape as BUG-2026-05-06-A: assertion standing in for enumeration):** the original pre-audit blast-radius line "O2: readers unchanged" was an ASSERTION about an old component (cost cache, SIM §2.5) outside the batch's fresh documentation. Kyle challenged it; the explicit reader walk was then done pre-deploy — 7 call sites proven miss-safe at call-site level (pre-audit ADDENDUM), confirmed exhaustive by Langston's independent grep. **The rule: a component outside the current batch's fresh documentation gets the explicit SIM walk, regardless of diff size. Enumerate, don't assert.**

---

## FIX-2026-06-12-A — B-5 Obj-15a correctness audit: EV-gap/outcome-EMA units bug + xstock AMR stamp gap + legacy wildcard AGGRESSIVE row

**Class:** learning-data correctness (2 capture bugs + 1 silent-fallback governance row). **Found:** B-5 Obj-15a correctness audit (Kyle-ordered, pre-pinned pass bars) + Langston Step-8. **Fixed:** 2026-06-12, commit `31d402735`, deploy `03bbe2ce8`, CI green (`27380747228`/`27380875222`), migration `2026-06-12a-b5-evgap-units-epoch.sql`.

1. **(A2 — the big one) Realized-percent UNITS bug in the VTS close hook.** `vts-service.ts` computed `netPnlPct = (pnl/notional)×100`, assuming `pnl` in dollars — but the only caller (vts-runner close, :2451) passes the realized NET FRACTION of entry price (it keeps `dollarPnl` separate). Realized percent was understated ~notional (~100×). Consumers: the B67.4 per-(regime,strategy) outcome EMA accrued the wrong realized side **since 2026-05-01**, and the B-5 EV-gap input would have been permanently suppressed once warmed (realized/predicted ratio ≈ 1/notional → FAVORABLE never reachable). Fix: `netPnlPct = pnl × 100` + vts calibration-epoch bump BOTH classes (crypto class row materialized at 4, xstock 4→5) so the outcome store's epoch-mismatch Welford reset partitions polluted streams. EMA wash-out at alpha=0.10: polluted influence <10% in ~22 obs/key — no state reset needed (Langston flag, checked). Live proof (Langston Step-8): ASTS/USD target-hit logged +9.65% and the store recorded w_mean=9.6542 (old code: ~0.0965); epoch tuples reset to w_count=1.
2. **(B) xStock at-open AMR stamp never persisted.** The inline crypto VTS open stamps `amrClassification/amrMode` (vts-runner:1528) but the xstock lane opens via `registerOpenVtsTrade`, which only took the stamps from caller input — never passed. Audit evidence: 19 post-deploy entries, the 1 stamped row crypto, all 18 nulls xstock. Fix: default-resolve in the register function (the same B-NEW-22 `??` pattern used by its 5 neighboring context fields). Live proof: fresh xstock open CLSK/USD stamped CALM/NORMAL; pre-restart ARM/USD unstamped (clean control).
3. **(Side-probe b) Legacy wildcard `governance_modes */aggressive_mode_confidence_floor` (0.80, b72-era 2026-05-05) DELETED.** Inert for the two live classes (b5-amr class rows at 0.60 win via most-specific-wins) but would have silently served any FUTURE class pre-seeding — §5.15 silent-fallback violation + B-5 contract violation (class-less AGGRESSIVE access throws). Post-delete probe: zero wildcard rows.

**Audit verdict that found these:** all core recompute legs PASS at zero deviation vs the §7 R4 pre-pinned bars (vote EXACT both classes; DBS weighted-median 1e-6 over 433/416 entries; friction EXACT over 496/360 samples; 488 trades' expectedEdge formula EXACT; VIX z 1e-6 over 77 obs; the 114 expectedEdge==netProfit rows proven benign sim-fill-at-target tautology, 0 unexplained). Permanent one-pass audit-dump surface shipped (`/api/diagnostics/amr/audit-dump`, AUD-1) for repeatable audits. NEW from the surface: #222 (crypto DBS equity-symbol contamination at 52.6% weight — pre-existing, root-cause follow-up), #223 (negative-spread writer root cause), #224 (restart-transient CALM, Phase-19 design item).

---

## FIX-2026-06-11-A — B-4.5: model priced ~Kraken-Tier-6 fees at a Tier-1 account (3 baked-in copies)

**Class:** systematically optimistic EV model (admission realism). **Found:** Kraken July-2026 cross-platform tier analysis (2026-06-08 brief) + B-4.5 sweep. **Fixed:** 2026-06-11, deploys `cad335cf0` + `86cff45c4` (R1), CI green both.

The cost model hard-coded taker 0.26%/maker 0.16% — the ~Tier-6 schedule (~$100K 30-day volume). The account's verified standing is **Tier 1: 0.80%/0.40%**. Real round-trip friction ≈2.5× modeled (0.72% → 1.80% crypto / 1.82% xstock) — the EV gate admitted trades that are EV-negative at true fees. THREE copies existed: (1) `exchange-defaults.ts` constants + the importer web (12 files), (2) `xstock_spot/friction.ts` hardcoded literals, (3) **`system_context.maker_fee_pct/taker_fee_pct` schema-column DEFAULTS** (Phase-27 era, auto-stamped, never operator-set — surfaced by Langston's Step-4 verification item firing; because the validator honors explicit values, this residue silently defeated the fix on the active-trading surface until R1 NULLed the values + dropped the defaults at BOTH layers, DB + Drizzle schema). Fees are now DB-governed (`fee_model`, fail-hard, single merge site, NaN tombstones); taker priced both legs (maker = Phase-19 direction-B evaluation). Epoch bump all 3 sources at deploy (vts/paper_sim/live → 2). Expected, intended shift: VTS/would_admit admit rates DROP (realism, not regression) — 24h comparison at the 06-11T19Z soak touchpoint, where the MAX_COST_BOUND 0.01→0.02 spread-unclamping is a known second mover.

## CLOSURE-2026-06-10 (latest) — ITEM 4: VTS / paper / live separated into independent standalone systems (+ labeled learning substrate + throughput study + 4.6-A disk hygiene)
**Four deploys** `b80c5e1a3` → `becf000dc` → `e5b91332f` → `acf683c5d` (+ 4.6-A switch `8fbd5295e`; green CI head `2bb87d6e3`), every one Langston Step-4-reviewed PRE-push, CI all-4-green, staging-verified; **umbrella report `ITEM_4_UMBRELLA_COMPLETION_REPORT.md`**; Kyle Gate-2 approved the design with 3 locked decisions (three-tier learning w/ pooling PARKED; uniform retention; kill-switch = paper+live, VTS none). **The structural fixes:** (D1) the 3 B70 archivers took their `mode` from a WRITE-TIME `getCurrentMode()` lookup — under concurrency every VTS row written during active paper would be MISLABELED `paper_sim`; now the producer's carried tag is REQUIRED (lookup deleted), `pair_scan_archive` stamps `'shared'` (producer-agnostic substrate). PROVEN: 11,307 eval rows during 33 min of live active paper, ALL `mode='vts'`, zero cross-stamps. (D1b) `hybridConfluenceBuffer` was shared mutable cross-producer state with no source dimension (VTS patterns boosting real trading, decay-clock cross-refresh, active→VTS training leak) — key now source-namespaced. (D9) `outcomeFeedbackStore` had no source dimension (a paper close would blend into VTS-trained EMAs) — key now `(source, assetClass, regime, strategy)`, source REQUIRED, SOURCE-MATCHED reads, Welford + per-source CALIBRATION EPOCHS (ADJUSTMENT_FRAMEWORK section) alongside the retained EMA (zero factor change), 30/30 disk keys re-homed `vts_`. (O1) VTS's 3 `tradingActive` kill-guards removed — standalone always-on producer, lifecycle guard added; 60.0s cadence EXACT through every paper start/stop incl. a 33-min sustained window. (O2/O3) per-mode start/stop; **live start HARD-GATED 409 `LIVE_ENGINE_PHASE21_GATED` until Phase 21 flips `live_engine_enabled` to NUMERIC 1 — ★ the Step-4 catch: jsonb booleans are INVISIBLE to the B72 numeric resolver; a boolean seed would have worked today by accident then silently BRICKED the Phase-21 flip** (strict `=== 1` + lock test + roadmap 19-17b). (2b) `would_admit_v0` bridge live — every VTS eval row stamped with paper's admit verdict (the comparison-tier precondition). **Step-6 throughput study (natural load): ALL 6 GATES PASS** — compute-once EXACT (pair_scan rows = MCE computes: 59,866=59,866 / 3,042=3,042), queues flat-zero, lag p99 28ms concurrent, no backpressure/error spike; **capacity: keep CPX22, no Supabase bump, in-process GO** (separate-VTS-process parked decision RESOLVED not-needed pre-19). **Item 4.6-A same morning (Kyle-approved; Langston root-cause):** stale `tec-pg-capture` disabled (systemd-first — `Restart=on-failure` would have respawned a plain kill), 66,032 stale diag files (476MB) removed, 43.46GB `out.log` truncated zero-downtime, per-pair MCE debug line behind default-OFF `MCE_PER_PAIR_LOG` — **disk 80%→24%**. **New issues:** #211 finalScore-drift, #212 paper-admit-only capture, #213 legacy `/live-trading/*` routes bypass the gate (lying-state; gate-or-retire before Ph21), #214 `health_engine` ENGINE block reads legacy `global.tradingEngines` (lying `isRunning:false` + zero paper liveness signal; consolidate 3 registries → ONE truth source, **Phase-19 prep**). #210 (step-2-before-active-trading HARD GATE) RESOLVED. Remaining 4.6-B: the 306-pair scan chunk/off-lane fix (scoped from the study; `monitorEventLoopDelay` instrumentation required; lands before 4.5/4.7). Governance: System Manual (Ch5 control-plane banner + Ch6 arc-close banner + b67_4 key supersession), SIM (steps 1/2/2b/3/6 + 4.6-A entries), RUNNING_ISSUES, ADJUSTMENT_FRAMEWORK, BATCH_CATALOG, PHASE_HISTORY, roadmap (19-17b + item-4 close + 4.6), readiness checklist, Gate-2 packet §6 resolutions, MULTI_ASSET plan, 4 step reports + steps-4-6 + umbrella + 4.6-A record, MEMORY 3-way. Active trading OFF throughout (study window = the documented transient).

## CLOSURE-2026-06-08 — B-NEW-54: retire the legacy ML predictive microservice (between Phase-24→19 ITEM 3)
**Head** `87865efd7`; CI run `27174803163` all-4-green; staging cutover clean (pm2 only `dawntrader`, dump.pm2 0/0, `pgrep ml_service.py`=0, `/api/health` 200 with no `mlService`, dashboard Chrome-clean); Langston Step-4 (code) + Step-8 (verify) **APPROVE**. **Reframed fix → REMOVE (Kyle 2026-06-08):** the Phase-8-era Python ML predictive microservice was **DECORATIVE** — its promotion/profit predictions were fetched fire-and-forget in the signal orchestrator, logged, and DISCARDED (no decision consumed them); the real ML is a future Phase 17/18 design; the roadmap lists predictive-learning teardown of these placeholder services. **Deleted** `services/ml_service.py` + `server/services/ml-service-client.ts` + `services/requirements.txt`. **Stripped** all ML lifecycle from `boot_orchestrator.ts` (VTS init + autonomous-sim + graceful shutdown preserved; degraded-mode-first; ~348→~140 lines). Removed the fire-and-forget block from `signal-orchestrator.ts`, the `mlService` field from `/api/health`, the `dawntrader-ml` PM2 app, **all ML steps from the `Dockerfile`** (python3/venv install + `/opt/ml-venv` pip + `COPY services` + `EXPOSE 5001` — the CI Docker-Build fix, since `services/` no longer exists), and `ML_SERVICE_*` from `.env`/`.env.example`. **Neutered** drift-detector `triggerRecalibration` → logged no-op + `recalibration_skipped` BEFORE touching `recalibrationInProgress` (no `recalibrationPending`/`isRecalibrating` latch); `POST /api/vts/retrain/:strategy` now returns the honest retired body (`success:false, retired:true`) instead of fake success (Langston Step-4 orphan #1). **Staging:** the orphaned detached helper PIDs (216182 bash-wrapper / 216183 python — un-PM2-killable because launched via `bash -c '… &'` → reparented to init) terminated; `/opt/ml-venv` + in-repo `ml_venv` + `models/*.pkl`/`model_versions.json` removed; **`logs/vts_calibration.json` PRESERVED** (TS calibration store, not an ML artifact — Langston Step-2 gate). **The 184k restart counter** was cumulative-historical (`unstable_restarts:0`, ~49d uptime), NOT a live crash loop — the helper was actually un-restartable (its interpreter `/usr/bin/python3.12` was `(deleted)` by an OS upgrade; in-repo `ml_venv/bin/python3` gone) and `/metrics` 500'd (psutil never installed in the B54 hand-build); retirement removes process + symptom. **LEFT for the Phase-16 register (#174):** `ml-calibration.ts` (decoupled/decorative), `retraining-freeze-controller.ts` (orphaned-after-edit), `/api/vts/internal/calibration` + `INTERNAL_SERVICE_KEY` (dormant-but-functional). Bench: tsc 475 vs 494 (−1 fixed, no regressions); vitest identical to clean baseline (12 pre-existing failures, 0 added). Governance: SIM (§7.3/7.4/7.5/9.1/PM2 row), System Manual Ch6, RUNNING_ISSUES (#24 superseded + #174 register), BATCH_CATALOG, PHASE_HISTORY, VTS-plan (F.2 resolved-via-removal), readiness-checklist (item 3 done), completion report. Active trading OFF.

## CLOSURE-2026-06-08 — B-NEW-53.2: xStock admitted at-entry-context block via payload-hoist (RUNNING_ISSUES #208)
**Commit** `a6767cd75`; CI run `27125059665` all-4-green; deployed staging (HTTP 200, clean boot); Langston Step-4 **APPROVE-TO-PUSH**. The deferred xStock counterpart of B-NEW-53.1 — xStock admitted rows in `signal_eval_archive.features` were scoring-metadata-only (no at-entry economics/context) because the xStock archive hook (`eval-cycle.ts:703`) fires BEFORE `registerOpenVtsTrade` (L727), so there was no in-scope open-trade record to read (a DISTINCT mechanism from the crypto #207 wrong-object read). **Fix (payload-hoist, NOT reorder):** the `registerOpenVtsTrade` payload is built as a named `const xOpenTrade` ABOVE the archive hook (the `dollarValue`/`quantity` consts moved up; hoist verified side-effect-free — Langston rider a); the admitted `features` block reads the at-entry economics+context **purely from `xOpenTrade`** — the SAME object register then receives, which structurally eliminates archive/row drift (better than two parallel literals) — and mirrors the crypto B70.2 key set. Reorder-archive-after-register was rejected (would couple admitted-archival to trade-open success — a contract change). **Settled fields (Langston rider b):** `expectedEdge = kernelResult.netEV` captured raw — but ⚠️ **UNITS DIFFER**: xStock netEV is **price-space** (`pWin·|tgt−entry| − pLoss·|entry−stop| − friction`, scales with asset price) vs crypto's `expectedEdge` which is **score/return-space** (`finalScore·(|tgt−entry|/entry) − friction`). Different formula AND units → **NEVER pool or compare cross-class**. This is safe because the never-pool rule is enforced **at code level**, not just prose: the HCE engine (`scripts/hce/hce_study.py`) tags each trade's `asset_class` and every analysis stage loops `for ac in ['crypto_spot','xstock_spot']` separately (L262/318/371/431). Also captured `netRewardToRisk` (the kernel's native scale-free metric) as the correct Phase-25 within-class selectivity normalizer — recorded now because the at-entry kernel result only exists at this moment (NO-PATCHES: avoids a future backfill). `pairIdHash`/`strategyPhaseWeight`/the 5 global-market-structure fields = documented `null` (crypto-only cohort marker / no phase-preference on xStock / crypto-market aggregates that `registerOpenVtsTrade` default-resolves onto the row POST-hook per B-NEW-22). **Telemetry-only, NO migration** (features JSONB). tsc no new baseline errors; vitest no new failures. **Langston non-blocking notes (recorded):** (1) if `mceContext.directionalBias` is ever undefined, the archive captures `null` while register may default-resolve a real `pairDirectionalBias`/score onto the row — a rare single-field archive/row divergence, low-impact; (2) backlog — register default-resolving *crypto* global aggregates onto *xStock* rows (pre-existing B-NEW-22) is arguably wrong-context for xStock; a separate future per-`ac`-global-resolve item, not this batch. **Live-data confirmation** alert-gated on the sparse xStock admitted cadence. Files: `eval-cycle.ts` only. Governance: RUNNING_ISSUES #208 resolved, this entry, SIM (B70.2 xStock note → realized), BATCH_CATALOG, PHASE_HISTORY, completion report. Active trading OFF.

---

## CLOSURE-2026-06-08 — B-NEW-53.1: admitted-`features` read from the open-trade SSOT, not the lean `tradeRecord` (RUNNING_ISSUES #207)
**Commit** `53a208880`; CI all-4-green (run `27112656601`); deployed to staging (HTTP 200, clean boot); Langston Step-4 **APPROVE-TO-PUSH (choice c)**. Same-day root-cause fast-follow to the #207 latent B70.2 bug surfaced during B-NEW-53 crypto-enable. **Bug (confirmed live, 0 of 145 crypto admitted rows in 24h):** the B70.2 admitted-`features` JSONB block in `vts-runner.ts` read 13 fields off `tradeRecord` (the lean `Phase10TradeRecord`, which declares `entry` not `entryPrice` and never carries `stopLoss`/`takeProfit`/`quantity`/`expectedEdge`/`atrAtOpen`/`pairIdHash`/`regimeConfidenceRaw`/`macroModifierValue`/`phase`/`phaseAgeSeconds`/`strategyPhaseWeight`/`regimeConfidenceModulated`) → `undefined` → `JSON.stringify` dropped the keys → every crypto admitted row archived hollow economics since 2026-05-05. **B-NEW-53 provenance was UNAFFECTED** (it sources the real detect-output locals). **Root-cause fix (NOT a patch):** the 13 reads now point at the in-scope `persistedTrade` open-trade SSOT (`OpenVirtualTrade`, already fetched at the hook) — `persistedTrade?.<field> ?? null` — the record that genuinely computes + persists every one of these at trade-open; `expectedEdge?: number` added to the `OpenVirtualTrade` interface (it was already written to the literal + DB, the interface merely under-declared it). `?? null` (not `?? undefined`) is deliberate — `null` preserves the JSONB key as explicitly-empty so the post-launch Trend Mining Engine's column-presence queries stay honest (Langston catch). **Telemetry-only, NO migration** (`features` JSONB `schema_version` — additive). Realizes the SIM-documented B70.2 behavior ("admitted-row features mirror open-trades CSV") that the wrong-object read had silently defeated. **Evidence the fix is type-correct:** tsc TS2339 in `vts-runner.ts` dropped **25→8** (the broken reads were literally type errors absorbed by the baseline); vitest no new failures. **⚠️ KNOWN-NULL WINDOW (mandatory for Phase-25):** crypto admitted rows in `signal_eval_archive.features` are hollow for these 13 fields across **2026-05-05 → 2026-06-08 (B-NEW-53.1 deploy)**. Phase-25 calibration queries that read at-entry economics from admitted-row `features` MUST exclude/handle this window — those NULLs are a capture gap, not meaningful data. (The trades that opened carry their own `vts_open_trades` SSOT; no backfill — re-deriving open-time MCE context would be silently-wrong approximation.) **Live-data confirmation ★ GREEN 2026-06-08:** the first post-deploy crypto admitted row (ESPORTS/USD `strong_bull_trend`, 02:38Z) populated all 13 fields at 100%, sane (entry 0.0826, stop 0.0609, target 0.1260, phase LATE) — vs the deterministic 0/145 blank before the fix. A broader re-confirm system-alert (2026-06-08T14:00Z) re-checks across the accrued sample. **Follow-ups:** #208 (xStock admitted at-entry context absent — DISTINCT mechanism, no in-scope SSOT record at its hook → DEFER to B-NEW-53.2) + #209 (ratchet `.tsc-baseline.json` down to lock the regression guard — regenerate on Linux/staging, not the Windows bench). Files: `server/services/vts-runner.ts` only. Governance: RUNNING_ISSUES (#207 resolved + #208/#209), this entry, SIM note, BATCH_CATALOG, PHASE_HISTORY, completion report. Active trading OFF.

---

## CLOSURE-2026-06-07 — B-NEW-53: decision-provenance capture (the general forward fix for #206 / RI-a / W2.0a-Mode-A)
**DEPLOYED staging 2026-06-07, commit `b1dbb2c43`, CI all-4-green (run `27098783612`), migration applied cleanly, HTTP 200; Langston Step-4 APPROVE-TO-PUSH + Step-8 PASS.** Kyle-directed (2026-06-07): build the CAPTURE now (pre-Phase-19, roadmap 19-20), run the STUDY in Phase-25 — decoupled. Closes the backward-replay wall three studies hit (W2.0a Mode-A geometry anchors, RI-a stop-anchor gap, W2.0b entry-trigger — all capped ~80% because the engine's exact decision-time inputs were never persisted). **One unified layer:** new `signal_eval_provenance` (1:1 sibling of `signal_eval_archive` keyed `(captured_at, archive_id)`, partitioned, 90d retention) stores the in-progress FORMING bar BY VALUE + a settled-bar-set reference (settled bars already in `xstock_spot_ohlc_15m_snapshot` → referenced, not duplicated) + the resolved stop/target LEVELS (the RI-a checksum — satisfies #206 AND RI-a together); `module_constants_version` (hash→resolved-set, upsert-on-novel) makes the constants confound a permanent non-issue. **Amortized id (Langston C2):** a block allocator draws from `signal_eval_archive_id_seq` so the base + provenance rows share an id with no hot-path DB round-trip; BLOCK_SIZE 3000 so a scan cycle never drains mid-cycle (Langston's catch: the hooks only `await import()`, a microtask, so an in-flight refill can't land mid-cycle — a small block would bias the coverage hole to end-of-scan order). Base archive row is never lost (batch-writer emits SQL `DEFAULT` for a missing app-id). **4 capture hooks live in `xstock_spot/eval-cycle.ts`** (the pre-audit's `vts-runner` citation was the crypto path — corrected). xStock-only at launch (per-class fail-closed flag; crypto off). Coverage% is reported SEPARATELY from parity% (Langston C1 — independent drop-oldest buffers can desync). **Runtime proof pending tonight's xStock reopen** (alert `B-NEW-53 runtime proof`, 2026-06-08T01:30Z: rows landing + coverage% + B-PHASE-A2 cycle timing unchanged); a second alert (2026-07-05) runs the post-accrual proof-of-capture parity re-run that resurfaces "resume the Phase-25 entry-trigger sweep (25-12)". Storage ~1.45 GB/mo xStock (~22% on the archive); settled-bar reference horizon safe (`xstock_spot_ohlc_1m.hot_retention_days=365` ≫ 90d). Additive, telemetry-only, active trading OFF. 8 new unit tests; tsc baseline green. Files: migration `2026-06-07-b-new-53-decision-provenance.sql` (+rollback) + `archive-id-allocator.ts` + `decision-provenance.ts` (new) + archive-batch-writer / archive-config / signal-eval-archiver / eval-cycle / b70 partition-creator+retention-sweep+export / drift-dashboard / data-archive-bootstrap (mod). Governance: BATCH_CATALOG, PHASE_HISTORY, SIM, RUNNING_ISSUES #206 (capture built; study Phase-25), this entry, completion report `BATCH_B_NEW_53_COMPLETION_REPORT.md`. **★ CRYPTO-ENABLE follow-on (commit `0350cbc69`, same day):** Kyle directed capturing crypto decision data too (for Phase-25). Extracted a shared `buildBarProvenance` helper (DRY; xStock `eval-cycle.ts` refactored to use it, behavior-preserving), threaded the 3 crypto hooks in `vts-runner.ts` (admitted uses the detect-output `stopLoss`/`takeProfit` locals, the two rejects forming-bar-only), migration flips the `crypto_spot` flag on. Langston Step-4 APPROVE; CI green; deployed; crypto trades 24/7 so verified live within minutes. **Surfaced a pre-existing latent bug (RUNNING_ISSUES #207):** `Phase10TradeRecord` never declares/sets `stopLoss`/`takeProfit`/`entryPrice`/`quantity`/etc., so the B70.2 admitted-`features` block has archived `undefined` economics on crypto admitted rows since 2026-05-05 — provenance is unaffected (sources the real detect-output locals); root-cause fix = **B-NEW-53.1** same-day fast-follow per Langston.

## NOTE-2026-06-06 (B.5 W2.0b) — entry-trigger detect-replay INCONCLUSIVE-by-backward-data; forward decision-provenance instrument specced

B.5 W2.0b built a read-only detect-replay harness (`scripts/b5-w20b-entry-replay.ts`) to sweep xStock entry-trigger thresholds behind a hard parity gate (replay must reproduce the live fire/no-fire decision ≥99% first). The harness runs correctly but **cannot clear the gate on historical data** — vwap_pullback Tier-1 parity maxed at 80% (1m-rebuild 62% → live 15m-snapshot settled bars 80%; currentPrice/ticker ruled out; constants confound closed). Root cause: the engine's exact decision-time inputs (esp. the in-progress **forming bar**, built from a live tick overlay) were **never persisted** — the same wall W2.0a Mode-A and the RI-a stop-anchor gap hit. Per Langston's pre-committed stop, we logged INCONCLUSIVE rather than chase the un-persisted forming bar (patch trap). **Forward fix (general, Langston-directed): a one-time decision-provenance capture on `signal_eval_archive` (exact ohlcData settled+forming + resolved constants per decision) → every future calibration study becomes exact-replayable.** Logged RUNNING_ISSUES #206 (Phase-19, bundle with RI-a). Consequence: xStock entry-trigger calibration is DATA-BLOCKED until it accrues; geometry was already keep-baseline (W2.0a) → per-strategy calibration largely data-blocked. Writeup: `Claude Comms and Packages/Scope Files/B_5_W20b_CONCLUSION.md`. Nothing deployed; active trading OFF.

---

## NOTE-2026-06-04 (B.4 foundation — IN-FLIGHT; fold into closure at Step-11) — xStock 15m recalibration recorded residuals

**Two recorded decisions from the xStock 60m→15m foundation recalibration (Langston conditions, 2026-06-04). Active trading OFF; xStock-scoped; crypto untouched.**

- **VN/DI residual — vn_max 0.95/0.98 intentionally LEFT ~1.25pp TIGHTER at 15m.** The IMF-screen recalibration (`scripts/b4-vndi-recalib-study.ts`, `B_4_VNDI_RECALIB_STUDY_RESULTS.md`) found VN nearly bar-invariant (median ratio 0.993). Of the vn_max edges, only `vn_max=0.85` drifts meaningfully and it drifts LOOSER (+3.4pp) — restored to 0.826. The `vn_max` 0.95 and 0.98 edges drift slightly TIGHTER (−1.25pp). They are LEFT untouched: tighter is lens-conservative (CALIBRATION-LENS asymmetry — a too-tight risk screen is safe, too-loose is dangerous), and the percentile-preserving candidates (0.980/0.998) would LOOSEN them toward the 1.0 clamp where vn_max stops filtering — the forbidden direction. **Revisit if Phase-19 paper-active flags over-selectivity on the active_strong_trend / vts_pattern / vts_quant / vts_strong_trend families.** (di_min 0–15 and di_max=100 are inert at both bar sizes — left untouched; not a residual.)

- **DBS recompute sentinel handling + study-filter footing.** The 15m DBS history recompute (`scripts/b4-dbs-15m-recompute.ts`) INSERTS sentinel-zero (computed-but-degenerate, flat-price) bars WITH the `sentinel_zero` flag rather than skipping them (Langston Step-4 Q1) — preserving the absence-vs-degenerate distinction the column encodes and 60m-archive parity; "cleaner distribution" is recoverable at query time via `WHERE NOT sentinel_zero`. (atr≤0 bars ARE skipped — uncomputable, different semantics.) **Footing check (Langston Q1 condition):** the regime recalibration study (`scripts/b4-regime-recalib-study.ts:334`) does NOT filter `sentinel_zero` — it pushes `|DBS|` for every atr>0 window into the distribution, so the SIGNED-OFF DBS regime thresholds (RBS_DBS_MAX 0.16, IE_DBS_STRONG 0.51, TFS_DBS_MODERATE 0.35) include rare degenerate |DBS|=0 values. Impact is **negligible** — sentinel-zero arises only from genuinely flat-price bars (the length guard never trips when window length == lookback 192), not from short windows. Insert-with-flag therefore keeps the study `|DBS|` distribution and the `xstock_dbs_backfill` table on the SAME footing (both include sentinels). The VN/DI study has no sentinel concept (it computes VN/DI, not DBS; null DI is filtered). No threshold re-derivation needed.

---

## CLOSURE-2026-06-06 (latest) — B-NEW-52: retire fire-once weekend cron; make poll-reconcile the SSOT for the xStock weekend lifecycle

**Commit** `6a8e5fd9c`; CI all-4-green; deploy HTTP 200. **Kyle-directed structural fix for the 3rd recurrence of weekend-timer staleness** (last real cron fire 2026-05-23; 2026-05-30 missed; the 2026-06-06 fire only happened because a deploy luckily re-armed the timer ~20 min before the Friday boundary). B-NEW-49/50/51 added monitoring that reliably DETECTED the misses but kept the fragile alarm. Kyle: "we keep being convinced it's fixed and it keeps breaking… if the backup is the best way, why not make that the primary and remove the other one." **Root-cause class (NO-PATCHES):** a fire-once-a-week in-process `node-cron` alarm cannot survive the multiple mid-week deploys/restarts the app sees; the once-weekly arming repeatedly fails to survive a restart. Every prior fix patched AROUND the alarm (observability, deploy-state arming) instead of removing it — so this removes the fragile dependency entirely rather than chase the exact internal failure a 4th time. **The fix:** retire the two weekend crons and make the two ALREADY-EXISTING restart-proof reconcilers the single source of truth — (1) boot reconciliation (every start reconciles weekend-window-vs-scanner-state, covers mid-window restarts) + (2) the continuous 30-second poll-reconcile (`scanner.ts` clock-tick → `reconcileWindowState`, runs ABOVE the `if(isPaused)return` early-out so it works while paused), which already calls the SAME shared `runWeekendShutdownCore`/`runWeekendRestartCore` (full shutdown = scanner pause + mark trades `weekend_suspended`; mirrored for Sunday restart) and is idempotent via an `inFlight` mutex. A continuous self-correcting loop is strictly more reliable than a fire-once alarm and cannot be knocked out by a restart. **Code (`session-lifecycle-controller.ts`):** removed `registerTimers()` (registered ONLY the 2 weekend crons) + its `init()` call + dead callbacks `runWeekendShutdown`/`runWeekendRestart` + `writeMissedCronAlert` (fn + 2 calls — else a weekly FALSE breakage alarm now that poll IS the normal path) + `node-cron`/`cronRegistry`/`logCronArm` imports; `TriggerSource` narrowed `'cron'|'poll'|'boot'`→`'poll'|'boot'`; flipped `runShutdownFromPoll`/`runRestartFromPoll` to `runPrewarm:true` (folds the boundary OHLC pre-warm into the poll path so 60m+15m snapshots stay warm for DBS at Sunday reopen). KEPT unchanged: the two `*Core` methods, the poll calls, boot reconciliation. **`xstock_spot/scanner.ts`:** extracted the inline clock-tick closure → named `handleTick()` (PURE refactor) with the reconcile-block byte-for-byte ABOVE `if(isPaused)return` (Sunday-reopen invariant preserved) + test seams. **CRON-FIRE-VERIFIER:** no edit — it derives its expected-set dynamically from `cronRegistry.getAll()`, so removing the registrations auto-deregisters weekend_shutdown/restart (no more stale-flagging; supersedes the weekend-job angle of #164/#165/#198). New `b-new-52-reconcile-ordering.test.ts` (restart-while-paused + idempotency). tsc 493 baseline (0 net new); 23/23 affected + 35/35 cron-infra green. **Step-7 proven:** post-deploy boot showed 0 weekend-cron-register lines + scanner still correctly weekend-paused via boot-reconcile (NOT cron), no errors. Langston **Step-8 GREEN/CLOSED 2026-06-06** (natural Sunday-reopen test accepted, no test-hook; Sunday alert `4cdec46d` independently confirmed live; restart-core ordering verified prewarm→resume→unsuspend→audit with prewarm error non-blocking — a prewarm trip degrades telemetry, not the reopen). **Runtime proof pending:** alert `4cdec46d` fires Sun 2026-06-07 8:10 PM ET (first-ever real prod poll-triggered reopen) → 5-point checklist → ack; failing checklist item (1)/(2) reopens B-NEW-52, not Step-8. **#202 deploy-hygiene recurred** (staging dirty tree aborted the 1st `git pull`; cleared via `git checkout`+`rm`). Active trading OFF.

---

## CLOSURE-2026-06-02 — B-NEW-51: cron-fire-evidence verifier cadence-aware staleness + root-level alert dedup

**Commit** `c7529f146`; CI `26830180190` all-4-green; deploy HTTP 200, PM2 #344. **Fixes the every-15-min `weekend_shutdown` stale-alert spam** (16+ identical alerts in one afternoon, each auto-routed to Langston → alert desensitization, Kyle flagged). Two structural root causes (NO-PATCHES): **(1) calendar-blind staleness** — the B-NEW-49 verifier computed `expected_by = lastFire + intervalSeconds × 1.5`, so for the weekly `0 20 * * 5` it expected the WEEKEND timer to have fired by TUESDAY (`2026-05-23 + 10.5d = 2026-06-02T12:00Z`). Fix = NEW `computePrevFire()` (cron-parser `.prev()`) → verifier judges against the schedule's ACTUAL most-recent calendar occurrence (`stale iff lastFire < prevOccurrence − 10-min latency grace`; 5-min process boot-grace; interval×1.5 fallback only for unparseable exprs). **(2) no dedup** — `addAlert` always created a new UUID, so the 15-min re-check re-created the same alert each cycle. Fix = root-level optional `dedupe_key` on `addAlert` (suppress new alert when a NON-terminal — scheduled/active/acknowledged — same-key alert exists; `resolved` doesn't block; backward-compatible; benefits ALL alert sources). Verifier passes `cron_stale:<job>:<prevOccurrence>` → exactly ONE alert per genuinely-missed occurrence, auto-clears on next fire. **Reconciliation:** the symptom Langston first attributed to "the Jan-2027 startup miscalculation" was already fixed in B-NEW-50; the live noise was the verifier's own cadence-blindness + spam. 13 legacy alerts resolved post-deploy. tsc 493 (0 net new); 28/28 targeted tests (NEW system-alerts-dedup suite). Langston Step-1 + Step-4 approved. Documented contracts: resolve-while-broken re-surfaces (intentional); newly-registered-cron `no_fires_ever` edge (RUNNING_ISSUES #198). Bundled: B.2.UI cosmetic whole-number crypto quantities (`39c5e578c`). Active trading OFF.

---

## CLOSURE-2026-06-01 (latest) — B-XSTOCK-CALIB F-NOW: calibration_state tag plumbing (VTS-only) + audit-miss recovery

**Commit** `cdac422b9`; migration `2026-06-01-f-now-calibration-state.sql`; CI `26757161780` all-4-green; deploy HTTP 200. Phase-24 plumbing so Phase 25 can exclude the pre-calibration xStock cohort. **VTS-only** (Kyle 2026-06-01): tags `vts_open_trades` only, not the active-paper path. Added `calibration_state` to `vts_open_trades` (NOT NULL DEFAULT `'pre_calibration_xstock_2026_05'`, fast-default back-stamped 1,793 xStock + 2,005 crypto rows) + `exit_strategy_alternates` (nullable; 17,184 xStock VTS rows backfilled in-migration); replay writer propagates via NEW `resolveCalibrationState(ctx.vtsOpenTradeId)` keyed on the open id (`originalSignalId`), NOT the exit-time-rebuilt `trade_id` (buried linkage at vts-service.ts:816). **AUDIT-MISS-2026-06-01-A (recovered):** the v1 pre-audit consulted the impact map by grep-and-cite + skipped the System Manual, so it failed to surface that the exit-ablation aggregator feeds the LIVE xStocks-tab "Exit Strategy Ablation" panel — the as-built unconditional xStock exclusion would have EMPTIED it (all 1,432 xStock trades are pre-cal). Kyle pushback → proper SIM + System-Manual upstream/downstream read → exclusion reworked **OPT-IN** (`buildCalibrationClause(assetClass, excludePreCalibration)`, default-off, INERT until Phase-25 caller; §9.1 scaffolding). Single TS tag const + migration cross-ref. fail-open direction (NULL → included) + asset-class-scoped-reads-only documented. tsc 493 (0 net new), 10/10 tests. Langston Step 1+2 ACK-w-rev → Step-4 ACK → opt-in re-confirm ACK. Active trading OFF.

## CLOSURE-2026-06-01 (later) — B-NEW-47: B75 tiered-storage sweep activation — streaming I/O + adaptive per-day slicing (RUNNING_ISSUES #161)

**Problem.** The B75 hot→warm archive sweep was built but its cron was never installed, so the 6 B74 ticker/OHLC tables grew unbounded (`xstock_spot_ticker_snap_2026_05` = 31 GB / 96 M rows; DB 57 GB / 200 GB ceiling; ~50 GB/mo). Naively scheduling it would OOM: the sweep `fs.readFileSync`'d the whole monthly partition into one Buffer before upload, and a single object exceeds the Supabase 5 GB project upload cap.

**Fix (NO-PATCHES, fix-then-activate).** (1) **Streaming both directions** — new `uploadWarmFile` (TUS, 6 MiB chunks via `fs.read` at offset, peak mem ~6 MiB) + `downloadWarmFile` (pipe response→file, checksum the on-disk bytes). Buffer methods kept + comment-marked for small ctx-bridge payloads. (2) **Adaptive per-day slicing** — partitions ≥ DB-governed `slice_threshold_hot_bytes` (3 GiB) export as N `YYYY-MM-DD` warm objects (≈150–500 MB each), each with its own manifest row; below threshold stays one `YYYY-MM` object. (3) **DROP gate** — the hot partition is DROPped only after EVERY distinct date present has a download-verified manifest row; drop + state-flip run in one transaction (no dropped-but-stuck-`verified` window). (4) **Resume invariant guard** (`deriveModeFromLabels`) re-derives whole-vs-sliced from existing rows so a month never mixes month + day labels. (5) **Failure→system-alert** (`critical` on checksum mismatch, `warning` on transient); hot partition never dropped on failure. New pure module `sweep-slicing.ts` + 16 tests. Migration seeds `slice_threshold_hot_bytes`.

**Verification.** tsc 493 baseline (0 new). 16 new tests pass; full-suite failures proven pre-existing (git-stash at clean HEAD). CI all-4-green (`26730239909`). Deploy `e984aef` + `db:migrate`, HTTP 200. **Attended force-sweep of the 31 GB May spot-ticker: 30 day-slices, 0 failures, DB 57 GB → 26 GB (31.3 GB freed, 6.2 GB archived ≈5× compression).** Cron installed ROOT crontab `15 2 * * *`. Sunday-resume + scanner verified healthy alongside. Langston Step-2 + Step-4 APPROVED-W-REVISIONS (atomic drop tx, sliced-row size accounting, REPEATABLE-READ comment — all folded). Spawned RUNNING_ISSUES #169–#172. Cold rotator stays dry-run; retention kept 30; Kyle declined monthly→daily re-partitioning.

---

## CLOSURE-2026-06-01 — B-NEW-50: node-cron next-fire readout fix (RUNNING_ISSUES #165) + BUG-2026-06-01-A ESM-bundle hotfix

**Risk class:** RESOLVED (observability-only; firing path untouched; active trading OFF). Commit `6372a2d` + hotfix `63bc69d`; staging-verified; Langston Step-1/4/8 CONFIRMED.

- **#165 root cause (proven):** node-cron 4.2.1 `MatcherWalker.matchNext()` (matcher-walker.js:84-89) advances the weekday-reconcile loop by a whole YEAR per iteration → any day-of-week schedule whose next hit is ≥~2 days out returns the next Jan-1st landing on that weekday (Fri→2027, Tue→2030…), in BOTH NY and UTC. Broader than the original "Friday-NY" framing. **Introspection-only** — firing uses `TimeMatcher.match(now)` + a 24h heartbeat-delay cap (runner.js:178) and is correct + self-correcting (live dow-fire test + the Sun 00:00 UTC `weekend_restart` firing via cron both confirm). The May 29 non-fire was the 30h outage, not this bug.
- **Fix = cron-parser shim:** new `server/services/cron-next-fire.ts` `computeNextFire()` (failure-safe, single-entry-point) backed by `cron-parser` (promoted to direct dep @4.9.0). `cron-arm-logger.ts` + `cron-arm-smoke-test.ts` classify/log off it; node-cron's raw `getNextRun()` retained ONLY as a labelled `raw_nodecron_next=… [UNTRUSTED ncv=4.2.1]` diagnostic (drift detector). node-cron scheduling/firing untouched. 8 regression-lock tests (5+6-field, NY+UTC, tz-fallback, bad-expr) + arm-logger/smoke-test updated. tsc 493 baseline; 31/31 cron + 19/19 lifecycle tests green.

- **BUG-2026-06-01-A — ESM-bundle named-import crash (deploy hotfix):** the first deploy (`6372a2d`) crash-looped staging at boot: `SyntaxError: Named export 'parseExpression' not found` — `import { parseExpression } from 'cron-parser'` (a CommonJS-only package) is unresolvable as a named ESM import in the production `esbuild --format=esm --packages=external` bundle (Node's ESM loader can't statically detect CJS named exports). It passed tsc + vitest + CI Build + Docker Build (none execute the bundle). Hotfix `63bc69d`: `import cronParser from 'cron-parser'; const { parseExpression } = cronParser;` — validated against Node's ESM loader directly (`scratch/cronparser-esm-test.mjs`). ~3-min staging outage; NO trades affected (Sunday resume had already fired at 00:00 UTC under the prior working code). Structural pipeline gap logged as RUNNING_ISSUES #168 + verification-gap learning in ASSET_CLASS_ONBOARDING_WORKFLOW.

---

## CLOSURE-2026-05-27 (evening) — B79.0n.EXECUTION: TradeClosedEvent additive assetClass + position-record SSOT cleanup + diagnostic endpoint v2 nested-by-layer payload

**Risk class:** RESOLVED (last per-class plumbing surface before WIRE-IN). 3 surgical changes plus 1 new test file land the additive `assetClass?: string` field on `TradeClosedEvent` (same C-7 doctrine as `PromotionEvent.assetClass` from B79.0n.RTB), one outcomeFeedback hook drift cleanup, and one diagnostic endpoint payload restructure. Sub-batch 13 of 16 in B79.0n umbrella v4 arc — **LAST per-class plumbing sub-batch before WIRE-IN (#14, Phase 19a)** per Kyle directive 2026-05-27.

**Sub-issues closed in this batch:**

- **TradeClosedEvent missing assetClass field** — `server/lib/event-bus.ts:24-51` gains optional `assetClass?: string` field with C-7 doctrine comment. Emit site at `paper-execution-engine.ts:1545` populates from `position.assetClass` (canonical SSOT read from L2147 entry write, NOT re-resolved). Canary log `[B79.0n.EXECUTION][EMIT_TRADE_CLOSED] mode=… class=… symbol=… tradeId=…` added per Langston Step 2 B2 mitigation. All 3 listeners verified safe via Step 1.b A2 grep (zero JSON.stringify/structured-clone/telemetry-emit production hits): paper-execution-engine self-handler at L184-188 reads only `event.mode` filter, c13-validation-service at L103-107 pushes whole event into `session.tradeCloses` array, c14-validation-service at L123-127 identical to c13. Zero handler breakage.

- **outcomeFeedback hook drift at `paper-execution-engine.ts:1376`** — switched from `safeResolveAssetClass(position.symbol, 'kraken')` re-resolve to `position.assetClass ?? safeResolveAssetClass(position.symbol, 'kraken')` belt-and-suspenders fallback per Langston Step 1.a Q4-B audit + Step 2 B2 reframe. Defensive NOT load-bearing — L922 B79.TEC NO_FALLBACK hard-fails BEFORE flow reaches L1376 if position.assetClass missing; `??` short-circuits to record-read on happy path. Zero runtime cost. Fallback locks safe behavior against future caller paths that might bypass L922 invariants.

- **Diagnostic endpoint payload restructure v1 → v2 nested-by-layer** — `/api/diagnostics/orchestrator-per-class-state` URL retained per Langston Q3 ACK (continuity over misleading-URL cost; zero callers verified across client/server/scripts via Step 1.b A6 thorough grep, found ONLY in server/routes.ts definition site). Payload restructured to `{ orchestrator: {...}, execution: {...}, _meta: { schemaVersion: 2, coverage: ['orchestrator','execution'], lastReviewed: '2026-05-27', knownGaps: [...] } }`. Execution layer surfaces openPositions per class + recentCloses24h + wildcard feePercent/slippagePercent + CLASS_NOT_WIRED for perp variants. `_meta.knownGaps` inline-surfaces 3 deferred items (fee/slippage dispatch class-member wildcard, sizing-core risk-pct/max-position-pct mode-keyed, narrative-feed assetClass) — operators see deferrals without consulting docs. Closing a `knownGaps` entry MUST remove from array + bump `lastReviewed` per new ASSET_CLASS_ONBOARDING_WORKFLOW §4.24 governance rule.

- **CHUNK E test coverage** — new `server/tests/unit/b79-0n-execution-audit.test.ts` (138 LOC / 12 source-file regression-lock tests): 4 CHUNK A (interface field + comment doctrine + emit populates + canary log present) + 1 CHUNK B (SSOT read with no-throw skip semantics per Langston B3) + 7 CHUNK C (URL retained + nested top-level keys + _meta surfaces + knownGaps array + execution-layer fields + perp CLASS_NOT_WIRED + exchange-defaults import). All 12 green in 631ms.

**Step 1.b probe outcomes (informational, drove scope):**
- (Q4-A) TRADE_OPENED audit — no production emit path. `TradeOpenedEvent` doesn't exist in eventBus; narrative-feed defines `TradeOpenedPayload` but `appendNarrativeEvent` called only from test fixtures — NO WORK NEEDED.
- (Q4-B) Position-record SSOT audit — 1 drift site at L1376 (CHUNK B) plus 1 already-correct fallback at L1219 plus 1 strict read at L922 (B79.TEC NO_FALLBACK).
- (Q4-C) Fee/slippage dispatch — WILDCARD class-member at `paper-execution-engine.ts:126-127` (`SLIPPAGE_PERCENT` + `FEE_PERCENT` hardcoded from `exchange-defaults.ts` crypto defaults). Defer to Phase 25/26 calibration per same logic as sizing-core defer (needs evidence not placeholders). Documented in `_meta.knownGaps`.
- (Q4-D) Trading-engine + micro-execution-service dormancy holds — last touched in B-NEW-43 memory sync commit only (no production code change). Stay OUT per umbrella v4 Phase 19a ownership.

**Implementation sequence per Langston Step 2 B5 #3:** B → A → C → E. B (SSOT cleanup) validates position-record discipline BEFORE A (interface + emit) propagates the value downstream. C (payload restructure) and E (tests) follow.

**Verification gates met:**
- AC-G1 (`npx tsc --noEmit`): 494/494 baseline-unchanged
- AC-G2 (`npx vitest run`): 12/12 pass on new file + 19/19 ORCHESTRATOR consumer-swaps + dispatcher regression
- AC-G3 (`node scripts/check-tsc-baseline.mjs`): OK — no regressions above baseline
- AC-G4 (CI run `26527276989`): all 4 jobs GREEN at 2m17s (TypeScript Check + Test Suite + Build + Docker Build)

**Step 4 Langston code review ACK CLEAN** on all 5 C-asks (cast pattern at emit site / belt-and-suspenders fallback / try/catch graceful-degrade / integration test deferred to Step 7 staging probe / nothing else worth catching). 3 non-blocking follow-ups added as RUNNING_ISSUES entries.

**Step 7 first-pass + Step 8 Langston second-pass verification GREEN.** HTTP 200 in 16ms; diagnostic endpoint v2 payload verified (5 top-level keys, xstock 0.50 cap visible in orchestrator layer, perp CLASS_NOT_WIRED in BOTH layers, _meta with schemaVersion 2 + coverage + lastReviewed + 3 knownGaps surfaced); PM2 #326 stable ~2m uptime; paper_sim_open_positions COUNT=0 + paper_sim_trades total-ever COUNT=0 matches endpoint exactly; zero error-log hits on `fatal|uncaught|B79.0n.EXECUTION.*ERROR` grep. Langston Step 8 ACK GREEN at all 5 probes.

**Langston C4 4-surface checklist status:** surfaces 3 (counter shape) + 4 (perp CLASS_NOT_WIRED regression) verified today. Surfaces 1 (canary log on close) + 2 (outcomeFeedback EMA store key after close) DEFERRED to WIRE-IN — non-testable today since active trading is off and paper_sim_trades is empty by design. Same structural gap as RTB + ORCHESTRATOR Step 7 closures. Canary log code path source-locked in CHUNK E test #4 so the code is provably correct; runtime invocation is the only gap and requires active trading on.

**Active-trading impact today ZERO.** Crypto regression: NONE by construction (additive optional field + defensive fallback + URL retained + payload restructure with zero callers).

**Asset-class onboarding workflow learnings (Phase 24 standing rule):**

(a) **What worked well:** Two-round Step 1.a pre-scope discussion (CC architectural synthesis → Langston ACK + Q4 additions → CC Step 1.b probes resolving all 4 Q4 items → scope v1 drafted with full context) prevented scope drift. Implementation sequence B → A → C → E (Langston B5 #3 recommendation) caught any SSOT discipline gaps before they propagated to the emit site. Source-file regression-lock test pattern (12 tests via readFileSync + regex) gave fast coverage without requiring full DB fixtures.

(b) **What surprised us:** TRADE_OPENED was genuinely dormant — narrative-feed system has the payload type but no production emit path. Avoided unnecessary work via Step 1.b grep. Fee/slippage dispatch was identified as a Phase 25/26 calibration concern (not Phase 24 plumbing) using the same defer logic as sizing-core, surfaced inline via `_meta.knownGaps` so operators see it without consulting docs.

(c) **Recurring structural patterns:** (i) Additive-optional event-payload field for asset-class disambiguation (now applied 2x: PromotionEvent C-7 from RTB + TradeClosedEvent C-A from EXECUTION) — codified in §4.23. (ii) Belt-and-suspenders fallback at SSOT read sites (defensive NOT load-bearing when an upstream NO_FALLBACK invariant exists) — Langston Step 2 B2 reframe pattern. (iii) Inline knownGaps registry in diagnostic payload (surfaces deferrals to operators without doc lookup) — codified in §4.24. (iv) URL-retention-with-payload-restructure when callers are zero (Langston Q3 doctrine — continuity > misleading-URL cost) — applied to `/api/diagnostics/orchestrator-per-class-state` v1 → v2.

(d) **Concrete edits proposed to ASSET_CLASS_ONBOARDING_WORKFLOW.md (applied as part of this batch's Step 10):** new §4.23 "Additive event-payload field pattern (C-7 + C-A doctrine)" + new §4.24 "Deferred-gap registry closure rule" (closing a gap from `_meta.knownGaps` MUST remove the entry from the payload AND bump `_meta.lastReviewed`; ANY per-class-state batch touching the endpoint must also bump `lastReviewed` even if knownGaps unchanged per Langston Step 4 C5 #1).

**Reference:** `Claude Comms and Packages/Scope Files/B79_0n_EXECUTION_SCOPE.md` v1.1 + `B79_0n_EXECUTION_PRE_AUDIT.md` + `Claude Comms and Packages/Change Lists/B79_0n_EXECUTION_STEP4_CHANGE_LIST.md` + Langston review trail at `Claude Comms and Packages/Langston Design Asks/B79_0n_EXECUTION_*.md` + `B79_0n_EXECUTION_COMPLETION_REPORT.md` (this batch — Step 11).

---

## CLOSURE-2026-05-27 (afternoon) — B79.0n.ORCHESTRATOR: per-class consumer-site swap pattern + POOL skip cleanup + new dispatcher file + per-class diagnostic endpoint

**Risk class:** RESOLVED (per-class plumbing — closes the last 3 production consumer sites that imported `PATTERN_POOL_GUARDRAILS` directly from `crypto_spot/`). xstock pattern signals now route to xstock's 0.50 position cap via dispatcher (real behavioral correction; takes effect at WIRE-IN #14). Sub-batch 12 of 16 in B79.0n umbrella v4 arc — **renumbered from #13 after POOL (#12) SKIPPED 2026-05-27** per Kyle directive.

**Sub-issues closed in this batch:**

- **New dispatcher at `server/asset_classes/pattern-pool-dispatch.ts`.** Mirrors B79.0n.MCE `getFrictionForAssetClass` co-location pattern. Exhaustive switch on 8-member AssetClass union + `_exhaustive: never` + `[CLASS_NOT_WIRED]` throws for 6 non-spot classes with activation breadcrumbs + explicit `PatternPoolGuardrails` return type.
- **Consumer-site swap #1 — `paper-position-sizing.ts`:** `sizePaperPositionForSignal` signature gains REQUIRED `assetClass: AssetClass` field; 2 callers threaded with `resolveAssetClass(signal.symbol, 'kraken')` deterministic per Langston Step 2 Probe 8 ACK no-silent-fallback; line 145 reads `getPatternPoolGuardrailsForAssetClass(params.assetClass).MAX_POSITION_PCT * 100`. xstock pattern signals correctly route to 0.50 cap (DB-resolved) instead of crypto-bound 0.15.
- **Consumer-site swap #2 — `signal_quality_evaluator.ts`:** line 28 import swap + line 285 reads `getPatternPoolGuardrailsForAssetClass(input.assetClass).FINAL_SCORE_FLOOR`. `input.assetClass` already REQUIRED per B79.0n.STORAGE — no fallback needed.
- **Consumer-site swap #3 — `routes.ts:12645` `/pattern-pool` endpoint:** gains optional `?assetClass=` query param with 400-on-invalid validation; per-class dispatcher call returns matching guardrails.
- **Dead-import cleanup at `signal-orchestrator.ts:101`:** Step 1.a probe found `PATTERN_POOL_STRATEGIES + PATTERN_POOL_GUARDRAILS` unused; kept `DEFAULT_ASSET_CLASS` (live at lines 670 + 1397).
- **POOL skip cleanup at `asset-class-instances.ts`:** 3 dead factory ARM constructions deleted (xstock_spot/xstock_perp/crypto_perp) + `ratioManager` field removed from `AssetClassInstances` interface + AdaptiveRatioManager import removed. Crypto's module-level `adaptiveRatioManager` singleton at `adaptive-ratio-manager.ts:307` UNTOUCHED — live ARM for crypto's FX5 scanner.
- **3 POOL test file dispositions:** DELETE `b79-0n-telemetry-arm-injection.test.ts` (95 LOC tested removed contract); REFACTOR `b79-0a-arm-injection.test.ts` (removed injected-telemetry test; kept crypto singleton-fallback tests); REFACTOR `b79-0b-asset-class-instances.test.ts` + `b79-0n-telemetry-factory.test.ts` (7 `.ratioManager` refs → `.failureTracker`/`.scanManager`/`.telemetry` assertions).
- **NEW `/api/diagnostics/orchestrator-per-class-state` endpoint** — no-auth public (B79.0a pattern); returns per-class JSON `{ patternPoolGuardrails: {...} }` for wired classes + `{ status: 'CLASS_NOT_WIRED', reason }` for perps. Step 8 verify-gate target.
- **27 new tests** across 3 files (11 unit dispatcher + 7 unit consumer-swaps + 8 integration cascade). Integration §1 key-aware DB mock catches wrong-value-threaded-correctly bug class per Langston Q1 refinement.

**Step 1.a 2-round iteration with Langston:** Langston Q2 push back on F-1 lever audit deferral pushed back on shadow-data pollution argument — CC refined Q2 surface (cost-model.ts + market-regime.ts ARE already proper dispatchers per B79.0n.MCE; signal-orchestrator.ts had 2 dead + 1 live import) → 2 real swaps + 1 diagnostic + 1 dead-import cleanup. Langston Q2(b) pull-in ACK. Step 2 Probe 7 corrected: fx5-scanner.ts:74 is ATR loop body NOT import; B54 Fix 4 explicitly removed PATTERN_POOL_THRESHOLDS import; `pattern-filter-profile.ts` shim has ZERO live consumers (RUNNING_ISSUES #73 already tracking B81 deletion). Step 2 Probe 8 ACK: symbol-only `resolveAssetClass(signal.symbol, 'kraken')` deterministic at both call sites.

**No deploy hotfixes.** Single-pass deploy clean: `git pull` → `npm install` (up-to-date) → `npm run build` (1 pre-existing warning) → `pm2 restart`. Step 7 first-pass verification GREEN: HTTP 200, diagnostic endpoint returns correct 4-class shape with xstock_spot showing 0.50 MAX_POSITION_PCT (behavioral correction observable), zero error-log hits. Step 8 Langston second-pass ACK GREEN — all 5 probes passed.

**Active-trading impact:** ZERO today (active trading off). Behavioral correction (xstock pattern signals routing to 0.50 cap vs crypto's 0.15) takes effect at WIRE-IN (#14); Phase 19 calibration validates xstock's 0.50 placeholder value.

**Crypto regression:** NONE by construction. Crypto signals continue reading the same DB-resolved values via the dispatcher; only the routing layer changes.

**Minor cosmetic note (non-blocking, deferred to Phase 16):** the perp `reason` field in `/api/diagnostics/orchestrator-per-class-state` truncates to `"[B79."` because the endpoint code uses `err.message.split('.')[0]`. The dots inside `[B79.0n.ORCHESTRATOR]` break the split early. Flag for future polish.

**Reference:** `Claude Comms and Packages/Scope Files/B79_0n_ORCHESTRATOR_SCOPE.md` v1 (commit `5e08568` after rebase) + `Claude Comms and Packages/Scope Files/B79_0n_ORCHESTRATOR_PRE_AUDIT.md` + `Claude Comms and Packages/Change Lists/B79_0n_ORCHESTRATOR_STEP3_CHANGE_LIST.md` + Langston review trail at `Claude Comms and Packages/Langston Design Asks/B79_0n_ORCHESTRATOR_*.md` + `B79_0n_ORCHESTRATOR_COMPLETION_REPORT.md` (this batch — Step 11).

---

## CLOSURE-2026-05-27 — B79.0n.RTB: per-class queue partitioning + cadence seed + LOCKED-module bucket refactor + rtb_queue_refresher retirement

**Risk class:** RESOLVED (proactive plumbing — extends per-class discipline through the RTB queue layer + cadence behavior + closes the `RtbSignal` asset_class schema gap filed by B79.0n.STORAGE as Tier 3). **Combines former sub-batch #11 RTB + former #12 RTB-REFRESH** per Kyle directive 2026-05-27 (same surface; combine reduces sequencing risk + duplicate Step 1/2 work). Per Langston Step 4 review CLEAN-WITH-R1 (R1 landed) + Step 8 second-pass GREEN.

**Sub-issues closed in this batch:**

- **Schema gap (B79.0n.STORAGE Tier 3 follow-up #2 RESOLVED).** `rtb_signals` table previously had no `asset_class` column; per-class identity inferable only via `metadata.assetClass` jsonb extraction at read time. Closed via 4-phase production-safe migration pattern (B-NEW-35 promote-then-retire precedent): Phase 1 `ADD COLUMN asset_class VARCHAR(32) NULL` + 4 module_constants `rtb_config.refresh_interval_ms = 30000` seed rows → Phase 2 backfill script with dual-path `metadata->>'assetClass'` jsonb-first + `resolveAssetClass(symbol, 'kraken')` fallback (idempotent via `WHERE asset_class IS NULL`) → Phase 3 `ADD CONSTRAINT ... CHECK (asset_class IS NOT NULL)` + `CREATE INDEX rtb_signals_mode_asset_class_status_idx ON (mode, asset_class, status)` (precondition gate: 0 nulls) → Phase 4 `SET NOT NULL` contingent on §6.4 48h zero-null gate. Table empty pre-migration (0 rows) so Phase 3 precondition trivially passed.
- **Per-class bucket partitioning (LOCKED-module override, Langston C-1 Option A).** `rtb-refresh-service.ts` `signalBuckets` topology refactored from global `Map<number, Set<string>>` (10 buckets sharded by signal-key hash) to nested `Map<AssetClass, Map<number, Set<string>>>` per-class. `lastBucketAssignment: Map<string, { assetClass: AssetClass; bucketIndex: number }>` tracks per-signal assignment with assetClass. `RTB_ACTIVE_CLASSES: readonly AssetClass[] = ['crypto_spot','crypto_perp','xstock_spot','xstock_perp']` const + non-active-class warn path. `assignSignalsToBuckets` resolves assetClass: signal-row-column → `resolveAssetClass(symbol,'kraken')` fallback → non-active-class default-to-crypto_spot warn. `refreshModeSignals` aggregates per-class buckets at given index via `bucketKeysAtIndex` Set union. Option A chosen over Option B (global + tagging) per Langston starvation scenario walkthrough — under shared CPU pressure, Option B starves xstock under crypto's larger volume; Option A nesting guarantees per-class slice survives starvation.
- **Shared global ACT pool preserved (Langston C-2).** Adaptive Concurrency Tuner (pool 3-10 default 5) untouched. ACT measures process-level CPU, not asset-class metric; per-class isolation comes from Option A nested buckets, not from ACT split. **LOCKED-module override scope**: per-class bucket allocation + getBucketStats fix authorized; algorithm/cadence/ACT scaler rewrites OUT of scope.
- **`_RTB_GK` wildcard preserved at 8 FSM-threshold read sites (Langston C-8 §3.4 lock).** `_RTB_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }` resolver at lines 149/163/186/205/212/215/218/1090/1458 in `ready_to_buy_service.ts` — all FSM thresholds (TCL barrier, signal threshold live, promotion gates) class-invariant today. Per-class divergence requires EXISTS-gated explicit-row evidence (e.g., xstock active-trading observability evidence) before promoting the wildcard to per-class seeds — bundled into B79.0n.OBSERVABILITY (#18) or sub-batch 18 active-trading flip.
- **Cadence seed (4 rows, uniform 30000ms per Kyle directive).** `INSERT INTO module_constants (module_name='rtb_config', exchange='*', asset_class=<class>, strategy='*', regime='*', constant_name='refresh_interval_ms', value='30000'::jsonb)` for all 4 active classes. Per-class plumbing operationally live — xstock value can change via DB-only `UPDATE` later without code change once xstock calibration evidence accumulates. Phase 19 calibration gate.
- **Per-class observability accessors.** New `getQueueDepth(): Record<AssetClass, Record<TradingMode, number>>` returns hierarchical count Map. `getQueuedSignals(mode, assetClass?)` + `getRankedSignals(mode, limit, assetClass?)` gain optional asset-class filter for hot read paths via new `rtb_signals_mode_asset_class_status_idx` composite index.
- **`PromotionEvent.assetClass?: string` additive field (Langston C-7).** Optional-additive on `server/lib/event-bus.ts` PromotionEvent interface — safe for 3 consumers; no event-bus schema migration required.
- **Legacy `rtb_queue_refresher.ts` RETIRED (Kyle directive 2026-05-27).** File deleted. Zero production callers verified via Grep across server/client/shared. `ReadyToBuyService.startRefreshCycle` is canonical via `PaperExecutionEngine` lifecycle. `server/index.ts` retired-comment block at line 1329 references the deletion + new boot pre-warm enumeration code at lines ~80-110.
- **Boot pre-warm + HARD-FAIL.** `server/index.ts` enumerates 4 active classes + cadence values at boot; HARD-FAIL via `process.exit(1)` if any rtb_config.refresh_interval_ms row missing. Log line: `[B79.0n.RTB][BOOT] 4-class refresh cadence loaded: crypto_spot=30000ms crypto_perp=30000ms xstock_spot=30000ms xstock_perp=30000ms` (verified at 11:10:31Z post-deploy).
- **`tcl_watchdog.checkSignalThresholdLive` JSDoc documents NEW-Q1 + NEW-Q2 decisions.** NEW-Q1 (global count tiebreak — wait-then-promote semantics preserved); NEW-Q2 (lock acquisition order — assetClass lock obtained AFTER mode lock per existing invariant).
- **N1 + N2 inline warns (Langston Step 4 non-blocking notes folded inline at fix-up commit).** N1: `queueSQESignal` warn before `enrichedMetadata` build when `!input.assetClass` (surfaces upstream caller-threading gaps). N2: `assignSignalsToBuckets` catch path on `resolveAssetClass` throw emits warn matching the non-active-class warn convention. Captures error message via `(err as Error)?.message ?? String(err)`.
- **`getBucketStats()` bug fix (test-surfaced).** Pre-batch called `signalBuckets.get(i)` with number when keyed by AssetClass post-refactor; fixed in same chunk to aggregate per-class sizes at each index. Surfaced via `b79-0n-rtb-locked-module.test.ts`.

**Hotfixes during deploy:**

- **`298cb2e` — MANIFEST.txt drift.** CI failure on first Step 3 push surfaced missing entries `2026-05-27-b79-0n-rtb-phase1.sql` + `2026-05-27-b79-0n-rtb-phase3.sql`. Added to MANIFEST.txt at positions 115-116 → CI green on next push. Same pattern from SCORING+TEC iteration codified as ASSET_CLASS_ONBOARDING_WORKFLOW §4.16.
- **`a4ac36c` — package.json `b79-0n-rtb-backfill` script + N1+N2 folded inline.** Langston Step 4 review R1 blocking revision: change-list footnote "CC will handle pre-deploy" contradicts Step 4 gate purpose (anything shipping to staging must be in reviewed HEAD). One-line additive script entry pointing at `scripts/b79-0n-rtb-backfill-asset-class.ts`. N1+N2 non-blocking notes folded inline same commit per "handle inline at your judgment" Langston guidance.
- **`6fd6bca` — backfill script dotenv import.** Step 6 deploy surfaced `Error: DATABASE_URL must be set. Did you forget to provision a database?` on `npm run b79-0n-rtb-backfill`. The script imports `server/db.ts` which throws on missing env; db-migrate.ts handled this via `import 'dotenv/config'` at line 37 but backfill missed the same pattern. One-line additive `import 'dotenv/config'` at top → backfill ran clean as NO-OP against empty table.

**Step 6 deploy sequence:** `git pull origin migration/aws-supabase` (a4ac36c5a → 6fd6bcac6) → `npm install` (1s, up-to-date) → `npm run db:migrate` (Phase 1 + Phase 3 in MANIFEST order; table empty so Phase 3 precondition trivially passed with 0 nulls) → `npm run b79-0n-rtb-backfill` NO-OP clean → `npm run build` (1 pre-existing warning, 5.1mb output) → `pm2 restart dawntrader` (PM2 #324 online).

**Step 7 first-pass verification GREEN.** HTTP 200; boot pre-warm log at 11:10:31Z; HARD-FAIL gate held; retire-line at 11:10:34Z; `_migrations` ledger shows both Phase 1 + Phase 3 applied 11:09:21Z; `\d rtb_signals` confirms column + CHECK + index; 4 module_constants rows present; zero error-log hits on `fatal|uncaught|throw|asset_class.*null|B79.0n.RTB.*ERROR` grep; UI login screen renders cleanly.

**Crypto regression: NONE by construction.** Every silent crypto default became explicit `'crypto_spot'` literal; class-invariant FSM thresholds via wildcard `_RTB_GK`; ACT pool unchanged; shared cadence value 30000ms unchanged from prior `REFRESH_INTERVAL_MS` constant.

**Active-trading impact today ZERO.** paper_sim_trades + trades both empty; per-class buckets stay empty until scanner pipeline emits signals; structural pre-warm-only exercise. Active signal flow lands in WIRE-IN (#16).

**Reference:** `Claude Comms and Packages/Scope Files/B79_0n_RTB_SCOPE.md` v2.2 (commit `239723058`), `B79_0n_RTB_PRE_AUDIT.md` v1 (commit `97572094e`), `B79_0n_RTB_STEP3_CHANGE_LIST.md` (commit `7650879ea`), `B79_0n_RTB_STEP4_R1_REACK.md` + `B79_0n_RTB_STEP8_VERIFY.md` Langston review trail, `B79_0n_RTB_COMPLETION_REPORT.md` (this batch — Step 11).

---

## CLOSURE-2026-05-25 — B79.0n.CONFIDENCE-CHAIN: confidence-modulator chain per-class plumbing + outcome-feedback store key migration + esbuild dynamic-require hotfix

**Risk class:** RESOLVED (proactive plumbing — closes silent-crypto-fallback at the confidence-modulator chain). Per-class disposition decisions D-1 through D-5 (Langston Step 1 ACK ✅ AGREE) cover the 4 F-2 modulators with behavioral divergence: macro xstock no-op, pair-correlation reference symbol per class, phase-preference per-class JSONB blob, outcome-feedback per-class store key. R-10 (paper-execution close-hook silently-wrong-class) + R-11 (mid-refresh stale-mix read) both mitigated.

**Sub-issues closed in this batch:**

- **Per-class plumbing on 9 modulator modules** — 65 new `xstock_spot` rows + 2 new global flag constants seeded via migration `2026-05-25-b79-0n-confidence-chain-per-class-seed.sql` (idempotent BEGIN/COMMIT, rollback companion).
- **7 modulator surface APIs REQUIRED-`assetClass: AssetClass`** — type-system enforcement at compute + builder layer; metadata.asset_class stamping for dashboard / replay filterability.
- **MCE atomic Map-replace pattern (R-11)** — `ReadonlyMap<AssetClass, T>` cache fields swapped atomically per refresh cycle; readers see complete-state old map OR complete-state new map, never partial.
- **R-10 trade-close hook fix** — `paper-execution-engine.ts:1371` + `vts-service.ts:929` resolve `assetClass` from `position.symbol` / `tradeData.symbol` via `safeResolveAssetClass + skip-on-null` before `outcomeFeedbackStore.updateEma`. Prevents silent crypto-key contamination of xstock EMA data at trade close.
- **Outcome-feedback store key shape + path move** — internal Map key `<regime>_<strategy>` → `<assetClass>_<regime>_<strategy>`; persistent path `/tmp/b67-4-outcome-feedback.json` → `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json`; first-boot disk-load migration re-keys legacy entries under `crypto_spot_` prefix; HARD-FAIL on corrupt new-path data (no silent fallback to legacy). Same path move for `regime-phase-store.json`. Survives pm2 restart.

**Hotfixes during deploy:**

- **`da92a79` — MANIFEST.txt drift.** CI caught the missing migration entry in `drizzle/migrations/MANIFEST.txt`; added the filename + redeployed.
- **`b6e45a8` — esbuild dynamic-require fix.** Step 7 first-pass verification caught `Dynamic require of "path" is not supported` errors from `saveToDisk()` inside `OutcomeFeedbackStore` + `RegimePhaseStore`. Root cause: esbuild ESM bundle output doesn't support runtime `require()`. Fix: replaced inline `const path = require('path')` with top-of-file `import * as path from 'path'` in both store files. The persistence-store call sites were previously-undocumented dynamic-require externals — worth noting in the next esbuild config audit per Langston Step 8 observation.

**Reference:** `Claude Comms and Packages/Scope Files/B79_0n_CONFIDENCE_CHAIN_SCOPE.md` v1 (commit `8293ed5d2`), `B79_0n_CONFIDENCE_CHAIN_PRE_AUDIT.md` v1.1 (commit `aa8a81f49`), `B79_0n_CONFIDENCE_CHAIN_STEP3_CHANGE_LIST.md` (commit `3efb745`), `B79_0n_CONFIDENCE_CHAIN_COMPLETION_REPORT.md` (this batch — Step 11).

---

## CLOSURE-2026-05-24-B — BUG-008 (pattern_pool_gates xstock_spot naming drift) + ANOMALY-PROD-2026-05-24 (H/USD vts-runner fail-hard throw) RESOLVED-BY B79.0n.PATTERN-DETECT

**Risk class:** RESOLVED. Both issues surfaced during B79.0n.PATTERN-DETECT execution (Step 2 pre-audit for BUG-008; Langston Step 8 verification for ANOMALY-PROD-2026-05-24) and were fixed in-batch as collateral cleanup.

**BUG-008 — Pattern-pool gates F-2 lever naming drift on xstock_spot.** The xstock-side `module_constants.pattern_pool_gates.xstock_spot.*` rows seeded by `2026-05-07-b79-xstock-module-constants.sql` (B79_inherit_crypto era) used divergent constant names (`final_score_floor`, `max_position_pct`) from the crypto-side convention (`pattern_final_score_min`, `pattern_max_position_pct`). Same semantic levers, different names. Violated the umbrella architectural pattern (per-class scoping belongs on the `asset_class` column, not on the `constant_name` column). Pre-audit §-0 grep cross-check verified zero current production consumers of the legacy names (rows were forward-loading scaffolding with no readers wired yet). **Fix:** migration `2026-05-24b-b79-0n-pattern-detect-naming-converge.sql` renames the 2 rows to match crypto convention via BEGIN/COMMIT-wrapped idempotent UPDATEs + seeds 2 NEW xstock RSI bound rows (`pattern_rsi_min=15`, `pattern_rsi_max=85` cloned from crypto defaults per Langston Q-C(a)); paired rollback file at `-rollback.sql`. The xstock-side `xstock_spot/pattern-pool-filters.ts` rewritten to mirror crypto's `Object.defineProperty` getter pattern reading from the renamed rows via `getCachedNumberRequired` resolver. Legacy `XSTOCK_SPOT_PATTERN_*` literal exports preserved as `@deprecated` shim for Phase 16 removal (#136 (u)).

**ANOMALY-PROD-2026-05-24 — H/USD fail-hard throw at vts-runner `resolveAssetClass(...)` call sites.** Langston Step 8 second-pass verification flagged a `Error: [B69][resolver] kraken spot symbol=H/USD did not match any registered pattern` throw originating from a `resolveAssetClass(...)` call inside `vts-runner.ts:913` (`generatePhase10Signal` MCE call — B79.0n.MCE era, May 22) bubbling up uncaught through `Timeout._onTimeout` and aborting strategy execution for that cycle's H/USD pair. 1 occurrence in 4 minutes post-deploy. Investigation: my PATTERN-DETECT batch added 4 more `resolveAssetClass(...)` call sites in vts-runner that would have thrown identically on H/USD, but were architecturally shadowed by the pre-existing line 913 throw (line 913 throws first → function aborts before new lines run). **Fix (Step 9 iteration commit `c0479b2`):** capture-and-reuse refactor at 2 vts-runner function/loop scopes. At entry to `generatePhase10Signal` (line 908): capture `_assetClass = safeResolveAssetClass(symbol, 'kraken')` once; null → return null (skip pair cleanly, no throw). Reused for MCE call (was 913), my scanPatterns (was 944), my selectContextAwareStrategy (was 977). At entry to outer `for (const pair of pairs)` loop (~line 3217): capture `_pairAssetClass` once; null → continue. Reused for outer MCE call (was 3226), my outer-scanPatterns (was 3262), my inner-scanPatterns (was 3325). **Net effect:** 6 throwing call sites consolidated to 2 capture calls; H/USD throws ELIMINATED (post-iteration soak: 0 "Strategy execution failed for H/USD" Error stack-traces vs 3 in equivalent pre-iteration window); COLLISION_RESOLVE WARN amplification for collision-set symbols (DASH/SUI) reduced ~33% (54/min → 36/min). **Out of scope (Phase 19 follow-up):** 10+ OTHER pre-existing throwing `resolveAssetClass(...)` call sites elsewhere in vts-runner (lines 1175, 1451, 1591, 1761, 1797, 1838, 1874, 3499, 3587). RUNNING_ISSUES #139 entry filed.

**Crypto regression:** NONE-by-construction. Crypto symbols that resolve successfully (the overwhelming majority) see identical behavior at all 6 sites. The only behavioral change is for B69-unregistered symbols (H/USD-style) which now skip cleanly instead of throwing.

**Cross-references:** `B79_0n_PATTERN_DETECT_SCOPE.md` §-1.4 (BUG-008 architectural finding) + `B79_0n_PATTERN_DETECT_PRE_AUDIT.md` §-0 (Q-B grep verification) + `B79_0n_PATTERN_DETECT_COMPLETION_REPORT.md` §2 (Step 9 iteration narrative).

---

## CLOSURE-2026-05-24-A — BUG-007 (Hybrid Strategy Types legacy taxonomy) + RISK-014 (Strategy Sync 8/17-stale coverage) RESOLVED-BY B79.0n.STRATEGY

**Risk class:** RESOLVED. Both issues were documented as legacy concerns in SYSTEM_MANUAL Chapter 2 (§1851 + §1878 respectively) since the canonical regime-strategy map was wired in Batch 13 + Directive 12.3.2. They sat as known-stale for ~3 months until the B79.0n.STRATEGY per-asset-class plumbing batch surfaced them as collateral cleanup opportunities — both fixed in the same atomic commit (`af99bd5` / `85ea78e`).

**BUG-007 — Hybrid Strategy Types in hybrid-integration.ts Are Legacy.** `selectHybridStrategy()` returned legacy taxonomy strings (H1_TREND_SNIPER / H2_SLINGSHOT / H3_GATECRASHER / H4_MOMENTUM_LINK) that didn't match the canonical hybrid strategies (pivot_shift / reverse_impulse / defensive_hedge / adaptive_flow / volatility_edge). **Fix:** replaced the quant-driven lookup with a pattern-driven map (PATTERN_TO_HYBRID — MORNING_STAR → pivot_shift, PINBAR → reverse_impulse, ENGULFING → defensive_hedge, TRI_STAR → adaptive_flow, ABCD → volatility_edge) + added a `quant_fallback` marker for non-hybrid quant signals. Updated `HybridStrategyType` union in `server/types.ts`. Updated 3 unit tests in `hybrid-integration.test.ts` to assert canonical taxonomy + added regression-lock test in NEW `b79-0n-hybrid-integration-canonical.test.ts` (6 tests including legacy-taxonomy-never-returned assertion).

**RISK-014 — Strategy Sync Only Covers 17 of 19 Strategies.** `CORE_STRATEGIES` const in `strategy-sync.ts` was 17 entries pre-batch (missing `strong_bull_trend` from B63 + `orb` from B79.0d). Sync would skip seeding strategy_settings rows for those two strategies on app startup, so they couldn't be UI-toggle-enabled even when they were live in code paths. **Fix:** expanded CORE_STRATEGIES to 19 entries. Also added per-asset-class outer loop (`SYNC_ASSET_CLASSES = ['crypto_spot', 'xstock_spot']`) so sync seeds rows for both classes. Also added `'orb'` to `strategyTypeEnum` in `shared/schema.ts` (which closed the schema-vs-code mismatch surfaced when sync started inserting 'orb' rows).

**Side effect — `STRATEGIES` const completion** at `canonical-regime-strategy-map.ts:364-388`: was 17 entries, now 19 (added STRONG_BULL_TREND + ORB) — matches `STRATEGY_DISPLAY_NAMES` SSOT at lines 402-405.

**Side effect — inside-bar-reversal.ts SELL dead-code cleanup** (server/strategies/inside-bar-reversal.ts): the SELL branches (RSI filter + price-calc) were unreachable since B79.0m.b2 added LONG-only enforcement at lines 131-135. TypeScript's TS2367 narrowing surfaced the dead code after my AssetClass import added to the file. Removed the SELL branches; kept `IB_SELL_RSI_MIN` module_constant for Phase 16 cleanup.

**SYSTEM_MANUAL Chapter 2** (lines 1225-1900) — has additional stale references to the pre-Batch-13 DSS architecture, 17-strategy count, and old regime names (BULL_STABLE, BEAR_VOLATILE, etc.) that pre-date the canonical 5-regime model. **Marked as in-flight follow-up for next Phase 16 governance review** — too large to rewrite in this batch.

**Confirmation:** B79.0n.STRATEGY Step 8 second-pass (Langston) verified zero `H1_TREND_SNIPER` references in staging PM2 logs; `CORE_STRATEGIES.length === 19` verified via `strategy_settings.xstock_spot` row count of 38 (= 19 × 2 modes); `STRATEGIES` const completion verified via `STRATEGIES.STRONG_BULL_TREND` + `STRATEGIES.ORB` being addressable.

---

## BUG-2026-05-23-A — Paper-portfolio-manager + paper-48hr-simulation userId-passed-as-mode-key latent bug (B-NEW-43 Phase 1 chunk 1)

**Risk class:** LATENT — silent empty-data path masked by `continue-on-error: true` on the typecheck job. Historical metrics from these two surfaces are SUSPECT (the bug had been live an unknown long period — both surfaces predate the mode-based architecture).

**What landed (commit `387b2d3`, B-NEW-43 Phase 1 chunk 1, pushed 2026-05-22):**

- `server/storage.ts` — added the missing `TradingMode` import from `./lib/event-bus`. The missing import cleared 40 TS2304 errors and surfaced the latent bug below.
- `server/services/paper-portfolio-manager.ts` — 7 sites: storage API call sites that expect a `TradingMode` key were being passed `this.userId` instead. The `TradingMode` import made the contract visible. Per Kyle directive (remove legacy userId dependency), the call sites were updated to pass `this.mode`.
- `server/services/paper-48hr-simulation.ts` — 3 sites: same shape. Updated to pass the literal `'paper'`.

**Why this had been silent:** the storage layer's mode-keyed lookup APIs accepted a generic string and returned an empty result on no-match. With userId passed where a mode key was expected, the lookups always returned empty. The 48-hour-paper-simulation reports and the paper portfolio metrics surfaces have been running on empty data for the period during which both files have existed in their current shape. The pre-fix typecheck `continue-on-error: true` setting (removed in B-NEW-43 chunk 5) was the silent-regression mechanism — the TS error was emitted on every build but suppressed.

**Historical-metrics implication (per Langston Phase-1-close note 2, 2026-05-23):** any pre-fix portfolio history or 48h-paper-simulation report drawn from these surfaces should be treated as not reflecting actual data. If a future audit needs accurate historical numbers from those surfaces, this fix is the demarcation line.

**Cross-references:** B-NEW-43 Phase 1 chunk 1 in `Claude Comms and Packages/Batch Completion/B_NEW_43_PHASE_1_COMPLETION_REPORT.md`. The two files themselves are flagged in RUNNING_ISSUES #136(a) + #136(b) as Phase-16 removal candidates — Kyle 2026-05-22 ("definitely legacy, should be marked for removal/deletion" and "not sure what it does — possibly dashboard-related — probably can be looked at for deletion"). The userId-coupling that produced this bug is the same pattern that makes both files Phase-16 register entries.

---

## BUG-2026-05-23-B — Five dead AI-Opportunities route handlers deleted (B-NEW-43 Phase 1 chunk 2)

**Risk class:** DEAD-CODE REMOVAL. Routes returned HTTP 500 when called because the underlying `aiOpportunitiesService` was removed in a prior cleanup but the route handlers were orphaned.

**What landed (commit `bf78c46`, B-NEW-43 Phase 1 chunk 2, pushed 2026-05-22):**

- `server/routes.ts` — 5 AI-Opportunities route handlers deleted (Kyle-approved removal).
- 3 genuine missing imports added: `dailyBriefService`, `semanticMemory`, `systemAlerts`.

**Companion orphan in frontend (flagged for Phase 16 removal — RUNNING_ISSUES #136(c)):** `client/src/components/ai/ai-opportunities-tab.tsx` + `client/src/components/ai/validation-reports-tab.tsx` consume the now-deleted endpoints. UI was already non-functional pre-fix (endpoints 500'd). Components are now fully orphaned.

---

## BUG-2026-05-20-A — Off-hours session-lifecycle controller closes #116 by side-effect + pre-emptively avoids CHECK-constraint trade-close failure (B-NEW-36 sub-batch (b))

**Risk class:** PRE-EMPTIVE FIX (critical guard caught at pre-audit Step 2 §4.1 — would have manifested as a CHECK-constraint violation on every trade close post-deploy if missed) + RESOLVED-BY-SIDE-EFFECT of #116 TEC stale fail-closed log noise for xstock_spot during weekend window.

**What landed (commit `4a997eae2`, deploy 2026-05-20 ~12:05 UTC):**

- NEW DB column `vts_open_trades.state VARCHAR(32) NOT NULL DEFAULT 'open'` with CHECK constraint `vts_open_trades_state_consistency` enforcing closed↔state AND state↔asset_class consistency (weekend_suspended xstock_spot-only).
- `markOpenTradeClosed` extended to atomically set `state='closed'` in the same UPDATE — without this extension every trade close would have failed the CHECK on deploy. Pre-audit §4.1 critical guard.
- NEW `server/services/session-lifecycle-controller.ts` with two `node-cron` scheduled timers (Fri 8PM ET shutdown + Sun 8PM ET restart, `timezone: 'America/New_York'`), boot-time affirmative state reconciliation per Langston Q7+Q7.1, Q6 pre-warm circuit-breaker.
- NEW `scheduled_tasks_audit` forensic table for operator visibility into timer fires + boot reconciliations.
- Scanner `pause()`/`resume()` methods preserving `clockTickHandler` reference (graceful-drain semantics distinct from `stop()`/`start()`).
- VTS sim cycle iteration filter `if (t.state === 'weekend_suspended') continue;` in both symbol-collection and per-trade evaluation loops.
- `runPrewarm()` extracted as named export from B-NEW-34b pre-warm script for in-process invocation from the scheduled hooks.

**Side-effect on #116:** sim cycle no longer routes weekend-suspended xstock_spot trades to TEC eval during the Fri 8PM ET → Sun 8PM ET window — eliminates the `TEC_STALE_FAIL_CLOSED` log spam for that asset class in that window. Crypto_perp + xstock_perp residual fail-closed noise still open (#116 marked PARTIALLY RESOLVED).

**Critical guards verified post-deploy:** boot reconciliation audit row `status='success'` with `insideWeekendWindow=false` / `scannerAction='none'` / `tradesAffected=0` for Wed mid-day UTC deploy time; 162 open trades all `state='open'`, 924 closed all `state='closed'`, zero `weekend_suspended` rows. CHECK constraint deployed with both R1+R1.1 clauses verified via `pg_get_constraintdef`. Scanner running mid-week (73 pairs in latest cycle post-restart).

**Cross-references:** `BUG-2026-05-20-A` here; SYSTEM_MANUAL.md "Off-hours session-lifecycle architecture (B-NEW-36 sub-batch (b), 2026-05-20)"; SYSTEM_IMPACT_MAP.md "Recent Additions (B-NEW-36 — Off-hours session-lifecycle controller + ledger reconciliation + universe-split cleanup, 2026-05-20)"; `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` (rev 4 Langston FINAL ACK) + `B_NEW_36_PRE_AUDIT.md` (§1-§8 + §9 re-validation block) + `Claude Comms and Packages/Batch Completion/B_NEW_36_b_COMPLETION_REPORT.md`. Langston Step 4 + Step 8 CLEAN ACK both relayed verbatim to Telegram topic 21.

---

## BUG-2026-05-19-B — Source-side dedup for B74 WS-archived OHLC tables (B-NEW-35)

**Severity:** Structural correctness + capacity. Recurring 25-second SCAN_TIMEOUT on every scanner cycle for ~7 days pre-fix; Supabase Disk IO burst budget at 100%/day; B-NEW-34b snapshot pre-warm hitting 26 statement_timeouts on the heaviest blue-chip names.

**Surfaced by:** B-NEW-34 diagnostic queries (2026-05-15) — empirical 18-56× row duplication in `xstock_spot_ohlc_1m` per `(symbol, interval_begin)` (AAPL/USD 4876 rows for 103 distinct minutes; one minute holding 227 rows with 227 distinct OHLCV tuples and $1.78 close spread). Mitigated symptomatically by the B-NEW-34 aggregator's DISTINCT ON CTE; the snapshot architecture in B-NEW-34b could not bridge the heavy-symbol pre-warm cost. Kyle directive 2026-05-19 ("we shouldn't be satisfied with these blue chip xStocks not populating") re-sequenced B-NEW-35 ahead of B-NEW-36.

**Fixed by:** B-NEW-35 (canonical deploy hash `f001002d9`, deployed 2026-05-20 to staging; Phase 3 code-deploy + in-buffer Map dedup hotfix). Three-phase rollout: Phase 1 cleanup migrations (multi-rev SQL across xstock_spot + xstock_perp + crypto_spot, finalized as per-symbol DELETE pattern via `/tmp/dedup_per_symbol.sh` bash-loop on staging — see institutional-memory note below); Phase 2 ADD UNIQUE constraints on `(symbol, interval_begin)` for all three partitioned tables during `pm2 stop dawntrader` window; Phase 3 code-deploy of UPSERT clause + in-buffer Map dedup hotfix.

**Verified by:** Langston SSH+claude-cli independent verification 2026-05-20 ~07:30 UTC against staging at `f001002d9` — all 8 empirical checks passed (row counts match expected at 277,970 / 1,604,733 / 2,492,118 for xstock_perp / xstock_spot / crypto_spot May partitions; zero duplicate `(symbol, interval_begin)` rows in any of the 3 tables; UNIQUE constraints present on all 3; in-buffer Map dedup confirmed at `ohlc-batch-writer.ts:105-114`; zero `ERROR/FATAL/ON CONFLICT/duplicate key` events in `/var/log/dawntrader/out.log`; scanner cycle wallclock last-20 median ~530ms — better than CC's ~1.3s report; DBS telemetry firing per cycle 1-8ms with 73-74/75 pairs covered).

**The three-layer dedup protection now landed:**

1. **PostgreSQL UNIQUE constraint on `(symbol, interval_begin)` for `xstock_spot_ohlc_1m`, `xstock_perp_ohlc_1m`, `crypto_spot_ohlc_1m`** (parent tables; cascades automatically to all existing + future partitions per PG partitioned-table semantics).
2. **Drizzle `.onConflictDoUpdate({ target: [table.symbol, table.intervalBegin], set: { open/high/low/close/volume/vwap/tradeCount: sql\`EXCLUDED.*\`, capturedAt: sql\`NOW()\` } })`** at `server/services/passive-archive/ohlc-batch-writer.ts:147-164`. Replaces prior plain `db.insert(table).values(slice)`.
3. **In-buffer Map dedup before chunked INSERT** at `server/services/passive-archive/ohlc-batch-writer.ts:105-114`. Map keyed on `${symbol}::${intervalBegin_iso}` with insertion-order last-wins semantics. Required because PostgreSQL throws "ON CONFLICT DO UPDATE command cannot affect row a second time" when a single INSERT contains multiple rows that share the conflict-target key — and Kraken WS routinely delivers multiple updates per minute that all land in the same 5-second buffer. Latest WS update IS the correct cumulative OHLCV per Kraken contract, so dropping earlier updates is semantically correct.

**Cleanup volume:** ~23.2M duplicate rows removed across the three tables (~84% reduction). xstock_perp May partition: 3.22M rows deleted (97% reduction). xstock_spot May partition: 14M+ deleted across main pass + retry + SPY per-day chunked path. crypto_spot May partition: 6.4M+ deleted. April partitions already clean from prior runs.

**Post-fix steady state:** xstock_perp_2026_05 = 278,240 rows; xstock_spot_2026_05 = 1,605,953 rows; crypto_spot_2026_05 = 2,494,122 rows (captured 2026-05-20 ~09:50 UTC). Pre-warm post-fix: 265 symbols in 206 seconds with zero failures (vs 9+ hours and 26 statement_timeouts pre-fix). Scanner cycle wallclock: median ~530ms over last 20 cycles, range 275-1077ms (vs 25-second SCAN_TIMEOUT pre-fix — >40× recovery). Supabase Disk IO burst budget: write IO ~20× lower from dedup; read IO ~5× lower from DISTINCT ON cost vanishing.

**Supabase tier sequencing during deploy:** Micro → Small ($15/mo, Kyle upgrade during dedup) → Medium ($60/mo, needed for SPY chunked path) → Small (back to $15/mo post-ship). Small is comfortable long-term post-structural-fix.

**Institutional-memory items now codified in SYSTEM_IMPACT_MAP:**

- Postgres `statement_timeout` is enforced cumulatively across a PL/pgSQL DO-block LOOP regardless of internal COMMIT statements; bounded-subset dedup on Supabase tables > 1M rows MUST use bash-per-symbol pattern (separate `psql` invocation per symbol = fresh per-call budget). Multiple SQL revisions (EXISTS self-join, ROW_NUMBER + `SET statement_timeout`, recursive CTE skip-scan, per-symbol ROW_NUMBER inside DO block) all failed within Supabase's 2-minute cap even on Medium tier; bash-per-symbol pattern succeeded.
- ADD UNIQUE on actively-written partitioned tables requires `pm2 stop dawntrader` window or fresh duplicates landed in the lock-acquisition window will fail the constraint. Working sequence: stop → final dedup sweep → ADD CONSTRAINT in one transaction → start.
- The "ON CONFLICT DO UPDATE command cannot affect row a second time" failure mode: any archiver that buffers multi-tick updates per minute and uses UPSERT must dedup the buffer BEFORE the chunked INSERT call. Caught live mid-deploy and resolved same-deploy via Map-based pre-flush dedup.

**Five-symbol snapshot gap finding (folded into B-NEW-36 sub-batch c):** `xstock_spot_ohlc_60m_snapshot` has 260 distinct symbols (not 265 registry-listed). BITF, HOLX, PARA, SAGE, WBA have zero rows in both April AND May 2026 source partitions — empirical Kraken-side absence under our canonical symbol form, not a B-NEW-35 bug. Filed as RUNNING_ISSUES #120 + assigned to B-NEW-36 sub-batch (c) universe-split cleanup. Possible causes: Kraken delisted, canonical symbol-form drift, or never included in Kraken's xStock product. None of the five are in the designated-24/7 set; scanner active universe unaffected (73-74 of 75 universe per cycle).

**Soak verification scheduled:** alert `c82c256c-66e3-4ce4-a6c9-c8ef4041bdbf` triggers 2026-05-27T07:00:00Z — verifies zero duplicate `(symbol, interval_begin)` rows persist across all three `_ohlc_1m` tables 7 days post-ship AND Supabase Disk IO burst budget consumption stays under 30%/day (was 100%/day pre-fix).

**Files changed:** see B_NEW_35_COMPLETION_REPORT.md §5 for the full enumeration. Key code at `server/services/passive-archive/ohlc-batch-writer.ts`; key migrations at `drizzle/migrations/2026-05-19-b-new-35-phase{1,2}-*.sql`; governance updates landed in this batch close to SYSTEM_MANUAL.md ("Source-side dedup architecture" chapter), SYSTEM_IMPACT_MAP.md (B-NEW-35 Recent Additions block, six new component entries), BATCH_CATALOG.md (B-NEW-35 row), PHASE_HISTORY.md (Phase 24 EXTENDED 2 row), RUNNING_ISSUES.md (#118 closure update + #120 new), MULTI_ASSET_VTS_EXPANSION_PLAN.md (B-NEW-35 row).

**Cross-references:** `BUG-2026-05-19-B` here; SYSTEM_MANUAL.md "Source-side dedup architecture (B-NEW-35, 2026-05-20)"; SYSTEM_IMPACT_MAP.md "Recent Additions (B-NEW-35 — Source-side dedup for B74 WS-archived OHLC tables, 2026-05-20)"; `Claude Comms and Packages/Scope Files/B_NEW_35_SCOPE.md` (rev 2 Langston Step 1 ACK) + `B_NEW_35_PRE_AUDIT.md` + `Claude Comms and Packages/Batch Completion/B_NEW_35_COMPLETION_REPORT.md`.

---

## ENHANCE-2026-05-17-A — xStock DBS foundation wired (B-PHASE-A2)

**Severity:** Foundation work (RESOLVED via Phase A.2 ship).
**Surfaced by:** v2 xStock Calibration Plan §A (Langston-locked 2026-05-15).
**Implemented by:** B-PHASE-A2 (commits `e84657110` → `a418a7731` on `migration/aws-supabase`, deployed 2026-05-17T22:16Z to staging PM2 #294).
**Verified by:** Langston Step 4 CLEAN ACK on `e7f9902f2` + Step 8 CLEAN ACK on `a418a7731`.

**The pre-existing gap:** xStock eval-cycle at `eval-cycle.ts:327` passed `undefined` as `propagatedDbs` to `mce.computeContext()`. MCE's non-crypto branch synthesized a neutral DBS (`score=0`, category=NEUTRAL, sentinelZero=true) for every xStock pair. Net effect: the regime classifier ran with no directional signal on xStocks; Path-B sustainability gate was dead-code on xStocks (TFS admitted only via Path-A momentum + DX); confidence modifiers defaulted to 1.0 for every xStock trade.

**Structural fix:**

1. **NEW `xstockDirectionalBiasStore` singleton** — second instance of the same `DirectionalBiasStore` class, constructed with `{mode: 'xstock', assetClassForKnobs: 'xstock_spot'}`. mode='xstock' branch applies sector partition (GICS-only counting) + dual floors (global ≥30 AND sector-coverage ≥7).
2. **Pre-cycle DBS compute in `xstock_spot/scanner.ts`** — for each symbol with sufficient OHLC + ATR + registry sector: compute pair DBS via shared `computeDirectionalBias()`, feed the new store, stash in `dbsBySymbol` Map for thread-down.
3. **`evaluateXstockPairForVTS` signature extended** with `propagatedDbs?` param. Scanner call-site at `scanner.ts:495` passes `dbsBySymbol.get(symbol)`. MCE non-crypto branch reads it end-to-end (verified in pre-audit §3 trace at lines 905, 973, 976, 997, 1048; no hidden `assetClass === 'crypto_spot'` guards).
4. **`XSTOCK_SPOT_REGISTRY` shape extended** with REQUIRED `sector: XstockSector` field + optional `adr` / `cryptoAdjacent` flags. All 265 entries mapped to GICS sectors (11 standard + 3 special buckets INDEX_PROXY / BROAD_ETF / INTL_ETF). TypeScript compile-fails any future entry missing sector.
5. **`module_constants` migration** — 8 xstock_spot DBS knobs (min_sample_count=30, sector_coverage_floor=7, plus 6 byte-identical-to-crypto weights/periods). Idempotent ON CONFLICT DO UPDATE. Crypto wildcard rows untouched.
6. **NEW `xstock_dbs_backfill` table** with component-aware schema (slope_component, return_component, ema_component, final_score, sentinel_zero, atr, volume_24h_usd). Backfill script populated 31,481 rows across 260 of 265 symbols, all 14 sector tags exercised. DBS score distribution healthy (38% up / 42% down / 20% neutral, range -1.00 to +0.99, avg -0.006, 0 sentinels).

**Mirror invariant honored:** DBS component weights (0.40 slope / 0.35 return / 0.25 ema) + lookback (48 bars) + EMA periods (12/26) + category thresholds + confidence-modifier ranges all byte-identical to crypto. No pre-emptive equity-tune (calibration-dependency invariant per v2 plan §A.2). Retune happens post-A.3 evidence-gated.

**Test coverage:** +2 passing test files vs B-NEW-42b CI baseline (13/77 vs 13/75). New tests: `b-phase-a2-xstock-dbs-store.test.ts` (11 cases — two-instance independence, dual-floor mechanics, sentinel exclusion, INDEX_PROXY aggregation exclusion) + `b-phase-a2-xstock-eval-cycle-dbs.test.ts` (24 cases — registry completeness + 15 D17 high-profile-name asserts + special bucket + flag set spot-check).

**Step 7 first-pass verification:**
- Backfill 31,481 / 260 / 14 confirmed via psql
- DBS score distribution healthy (0 sentinels)
- module_constants 8 rows applied; crypto wildcard untouched
- PM2 #294 boot clean; no `getSectorCoverageFloor` / `xstockDirectionalBiasStore` / `SECTOR_MISSING` errors
- Live ARCA-open telemetry verification scheduled (alert `7b33b931` fires 2026-05-18T13:35Z when ARCA opens Monday)

**Step 8 Langston independent second-pass:** all 5 verification items reproduced exactly — db state row counts, wildcard isolation, components-sum invariant (31,481 / 31,481 exact match, 21 clamped per design rev2 §3, 0 unexplained diffs), application liveness, endpoint reachability.

**Two Step-10 governance findings logged in RUNNING_ISSUES:**
- **#114** — Crypto DBS floor counts sentinel-zero entries (asymmetric vs xstock's stricter rule from day one).
- **#115** — Crypto's other 7 `dbs_calculation` knobs are code-defaulted rather than DB-governed (only `min_sample_count` exists as wildcard row). Pre-existing asymmetry, surfaced by Langston Step 8.

**Phase E pre-requisite queued:** all 11 SPDR sector ETFs (XLK/XLE/XLV/XLF/XLI/XLP/XLY/XLU/XLB/XLRE/XLC) MISSING from xStock registry. **B-PHASE-E-PRE-1 placeholder batch** queued for offline FRED+Yahoo feed integration before Phase E sector-correlation factor work can run. Estimated 5-7 days.

**Lessons (carries forward to PHASE_HISTORY):**
- **Constructor-option discriminator beats partition-key.** Initial design rev1 framed the two-store pattern as instances sharing class shape. Langston Step 1 R4 review surfaced that `publishSnapshot()` behavior diverges between modes (sector partition + dual floors for xstock), requiring an explicit `mode` discriminator in the constructor. Final shape: `new DirectionalBiasStore({mode, assetClassForKnobs})`. Cleaner future-proofing for asset class 3 (registry-of-stores remains a 15-min refactor).
- **Pre-audit code-level rigor catches design assumptions before implementation.** Step 2 deepening (per Kyle directive) caught the `getSectorCoverageFloor` silent-fallback pattern AND the volume column omission AND the slope semantics question — all surfaced at pre-audit code-trace stage, not at Step 4 review. Sub-task A would have shipped the silent fallback otherwise.
- **No silent fallbacks for DB-governed settings (CLAUDE.md §8 #10).** Sub-task A's first draft used try/catch with hardcoded 7 fallback for `sector_coverage_floor`. Langston Step 4 flagged as BLOCKER. Strict `getCachedNumberRequired` matches `getGlobalDbsMinSampleCount` shape; missing row = loud crash, not silent degradation.

**Cross-references:**
- Design rev2: `Claude Comms and Packages/Langston Design Asks/B_PHASE_A1_DBS_design_ask_rev2.md`
- Sector reference doc: `Claude Comms and Packages/Langston Design Asks/xstock_sector_mappings_reference.md`
- Scope rev2: `Claude Comms and Packages/Scope Files/B_PHASE_A2_DBS_SCOPE.md`
- Pre-audit rev2: `Claude Comms and Packages/Scope Files/B_PHASE_A2_DBS_PRE_AUDIT.md`
- Completion report: `Claude Comms and Packages/Batch Completion/B_PHASE_A2_COMPLETION_REPORT.md`
- Store code: `server/core/metrics/directional-bias-store.ts`
- Scanner pre-cycle DBS: `server/asset_classes/xstock_spot/scanner.ts:467+`
- Eval-cycle threading: `server/asset_classes/xstock_spot/eval-cycle.ts:265,327`
- Migration: `drizzle/migrations/2026-05-17-b-phase-a2-dbs-xstock-constants.sql`
- Backfill table: `drizzle/migrations/2026-05-17-b-phase-a2-dbs-backfill-table.sql`
- Backfill script: `scripts/b-phase-a2-backfill.ts`

---

## BUG-2026-05-17-B — TEC structural gaps closed by B-NEW-42b price-discontinuity sentinel

**Severity:** Operational risk (RESOLVED via structural fix).
**Surfaced by:** B-NEW-42 Phase 0 audit (2026-05-17 morning).
**Fixed by:** B-NEW-42b (commit `d8e0f5885`, deployed 2026-05-17T20:10:00Z to staging PM2 #293).
**Verified by:** Langston Step 8 PASS (2026-05-17).

**The three gaps:**

1. **Forward split (50% drop) fires stop on synthetic non-event.** `shouldClosePosition` naive `currentPrice <= currentStopPrice` check. Every protected long xStock position with a stop above price/2 would fire simultaneously on a 2:1 split. Partial existing defense: B79.0L weekend market-hours gate covers most splits (overnight-effective); intra-week effective-date case was undefended.

2. **Reverse split (2× jump) phantom-promotes to TRAILING_TAKE.** Target-lock latch fires when current price crosses target; 1:2 reverse-split jump from $50 → $100 with target $80 in path satisfies the condition. Trade incorrectly enters moonbag mode based on a unit-count change, not a value change. Same partial defense as #1 (weekend gate).

3. **Halt resume gap fires stop at unfillable price.** Intra-RTH halt resolves with a price gapped down through stop. `shouldClosePosition` clamps exit to pre-halt stop level — a price that was never tradeable. System books fictitious PnL. **No existing defense; this was the load-bearing exposure.** 462 candidate halt-resume-gap events observed in 7-day archive (avg 1.10% magnitude, max 4.6% on EDU/USD 2026-05-11).

**Structural fix:** new `server/services/price-discontinuity-detector.ts` sentinel consumed by TEC at `shouldClosePosition` + `updatePosition` target-lock gate via a single hoisted consultation per logical tick in `tec-evaluator.ts`. Four kinds: `halt_resume_gap`, `corp_action`, `ex_dividend` (curated calendar), `cold_start` (fail-safe-skip first call per symbol). State machine IDLE / DISCONTINUITY_ACTIVE / CLEARING with stateless 5min HARD_CEILING timestamp comparison + lazy 24h eviction gated on IDLE state.

**Test coverage:** 76/76 passing — detector unit (13), B-NEW-42 assertion-inverted (6, with `entry.activeKind` assertion to catch future cold_start drift), crypto regression (55+, all green).

**Lessons:**
- **Double-consultation per logical tick is a non-obvious state-machine bug.** Pre-Step-4-review code consulted detector independently in `updatePosition` (target-lock) and `shouldClosePosition` (stop-check); both within microseconds; second consult advanced IDLE → DISCONTINUITY_ACTIVE → CLEARING on the same tick. Fix: hoist to one call per logical tick in `tec-evaluator.ts`.
- **Cold-start fail-safe-skip is non-negotiable for sentinel-based stop-check gating.** Defaults `{active: true, kind: 'cold_start'}` on first call per symbol; protects against unfillable-fill during process-restart-during-halt blind window. Cost: one tick of stop-check delay (operationally trivial).
- **Detector-owned cache cleaner than caller-side prev-tick propagation.** Initial scope rev2 specified caller-propagation; pre-audit §3 refined to detector-owned cache. Outcome structurally equivalent; caller-side surface unchanged; silent-disable failure mode (caller forgets to plumb prevPrice) structurally eliminated.

**Cross-references:**
- Scope: `Claude Comms and Packages/Scope Files/B_NEW_42B_SCOPE.md`
- Pre-audit: `Claude Comms and Packages/Scope Files/B_NEW_42B_PRE_AUDIT.md`
- Completion report: `Claude Comms and Packages/Batch Completion/B_NEW_42B_COMPLETION_REPORT.md`
- Detector code: `server/services/price-discontinuity-detector.ts`
- Curated dividend calendar: `1-system-manual/audits/b-new-42/dividend-calendar-seed.json`
- ADJUSTMENT_FRAMEWORK Appendix A (8 new knobs)
- B-NEW-42 audit findings: `1-system-manual/audits/b-new-42/audit-report.md`

---

## DESIGN-2026-05-17-A — TFS sustainability gate: design-intent-vs-shipped scope contraction (DECISION RECORD, not a bug)

**Severity:** Process-governance. Not a defect, not a fix — a design-decision-history record captured per Kyle directive 2026-05-17 so the implicit deferral is auditable when Phase 19 opens.

**Discovery:** During the three-way Kyle/CC/Langston session 2026-05-17 on whether to redesign the TFS sustainability gate ("path B sustainability" in B67.5/B68.5), Kyle asked the structural question: what is the gate FOR? His recollection of the original framing was broader than the shipped implementation — he remembered it being about regime classification, strategy selection, or position sizing nuance, NOT confidence modification. Langston confirmed Kyle's recollection: original design rationale in the B67.5/B68.5 scoping discussions explicitly mentioned "preventing late-trend entries" and "adding nuance to regime handling." At implementation time, the actual code hook landed only in the confidence pipeline (signal-orchestrator path B → confidence dampening → post-composition floor interaction). The broader stage-aware redesign was deferred — but the deferral was implicit, never explicitly tagged as deferred work.

**Why it matters:** Step 1 baseline analysis 2026-05-17 on 3,992 b68_5 ablation rows from the 16-day window 2026-05-01 → 2026-05-16 CONFIRMED B-NEW-37 forensic at scale: the gate is a uniform confidence dampener (Δconf 0.4477 for winners vs 0.4423 for losers — functionally identical), blocks path B in only 0.9% of trades, win rate uniform across gate-action categories. Concluding "drop the gate" from this alone would be correct under the SHIPPED-implementation framing, but premature under the ORIGINAL-design-intent framing. The structural question "what is the gate for" had to be answered before the methodology question "is the gate's input the right signal" could be resolved.

**Resolution (2026-05-17 Kyle directive — three-way converged):**

- Table value-scope decision until Phase 19, where stage-aware regime/strategy/sizing redesign would naturally be designed alongside any sustainability classifier work.
- Add Phase 19 roadmap line item (POST_AUDIT_ROADMAP §19.0.3) with three-fork decision tree: full redesign / narrow TEC routing hook / deprecate gate. Each fork shares the same prerequisite (classifier validation).
- Add RUNNING_ISSUES #111 as discoverable open-decision tracker.
- Document the design-intent-vs-shipped gap in this entry so the implicit deferral is auditable.
- VTS continues persisting sustainability score on every trade — data capture for future ML training continues during deferral.

**Methodology pivot also captured (Kyle directive 2026-05-17):** Original Step 1 methodology measured trade-outcome win/loss as success criterion. Kyle's challenge: that's a downstream proxy contaminated by entry/exit/sizing/friction + the VTS confidence inversion noise. The correct success criterion for the classifier is **forward-trend-continuation accuracy** (does the gate's "sustainable" verdict correlate with actual price-action continuation N minutes later, independent of trade outcome). This pivot applies to any classifier-validation work in Phase 19.

**Lesson captured:** when implementation contracts a feature's scope vs. design intent, the contraction must be explicitly tagged as deferred work (RUNNING_ISSUES entry + roadmap line item) at the implementation batch — not left implicit. The 2026-05-17 surfacing of this gap required a multi-session research effort that could have been avoided if B67.5/B68.5 had explicitly tagged the broader stage-aware redesign as Phase-19-deferred at ship time.

**Files referenced:**
- `Claude Comms and Packages/Langston Design Asks/TFS_SUSTAINABILITY_GATE_RESEARCH_DESIGN_2026-05-17_rev2.md` (methodology lock — APPROVED rev2)
- `Claude Comms and Packages/Langston Design Asks/TFS_SUSTAINABILITY_STEP1_BASELINE_2026-05-17.md` (Step 1 baseline confirming B-NEW-37 at scale)
- `Claude Comms and Packages/Langston Design Asks/TFS_SUSTAINABILITY_VALUE_PROPOSITION_2026-05-17.md` (value-scope decision)
- `1-system-manual/RUNNING_ISSUES.md` #111 (open-decision tracker)
- `1-system-manual/POST_AUDIT_ROADMAP.md` §19.0.3 (Phase 19 decision tree)

---

## INFRA-2026-05-17-B — B-NEW-41: voice transcription (whisper.cpp) + Langston staging SSH access

**Severity:** LOW — pure agent-infrastructure work. Zero touch on trading system, DB, strategies, signals.

**Trigger:** Kyle directive 2026-05-17 (quick-win batch combining two independent deliverables: voice notes for both bots + resolving B-NEW-40 RUNNING_ISSUES #108 Langston-no-staging-SSH gap).

**Changes:**

1. **Whisper.cpp self-host on Hetzner Helsinki (`204.168.141.77`):**
   - Source pinned to `https://github.com/ggml-org/whisper.cpp` tag `v1.8.4` commit SHA `9386f239401074690479731c1e41683fbbeac557`.
   - Build path: `/opt/whisper.cpp/build/bin/whisper-cli` (CMake build, renamed from upstream `main` → `whisper-cli` in v1.8.x).
   - Model: `ggml-small.en.bin` (487MB, sha256 `c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d`) at `/opt/whisper.cpp/models/`. English-only, ~0.75x real-time on CPX22 4 vCPU with `-t 3`.
   - Smoke test: JFK clip (11s audio) transcribed in 8.3s wallclock with verbatim accuracy.
   - Permissions: root:root, 0755 binary, 0644 model — readable+executable by `langston` group.

2. **`cc-comms-bridge` voice handler:** detects `update.message.voice` + `update.message.audio`, downloads via `getFile` (20MB Telegram cap), transcribes via whisper-cli subprocess, writes `kind: "voice_inbound"` JSONL entry to `/var/log/cc-bridge-inbox.jsonl` (with `schema_version: 1`, `transcription_duration_ms`, `audio_duration_s`, `audio_archive_path`, `file_id`). 100-char ACK preview posted back to chat. Worker-thread pattern (`queue.Queue` + single daemon=True consumer) keeps main poll loop unblocked. Allowlist: DM-with-bot OR topic 21 of Dawn Trader HQ group (`-1003575211453`). Failure-path: `kind: "voice_inbound_failed"` entry + user-facing fallback notice.

3. **`langston-bridge.py` unified task queue (Step 2 Rev 1 critical correctness fix):** ALL inbound (text + voice) now routes through a single `task_q` consumed by one worker thread. Guarantees single-claude-at-a-time invariant — two concurrent `claude --session-id <same UUID>` subprocesses cannot run simultaneously (would otherwise corrupt session state). Main poll loop is now a pure enqueuer.

4. **Voice archive infrastructure:**
   - Root: `/var/log/cc-bridge-voice-archive/<YYYY-MM-DD>/<msg_id>.ogg`.
   - Logrotate: 30-day daily retention (`/etc/logrotate.d/cc-bridge-voice-archive`).
   - Cron prune: `cc-voice-archive-prune.timer` runs daily 04:00 UTC, removes oldest files when total dir size exceeds 5GB ceiling. Defense against unexpected volume spikes.

5. **Langston SSH access to staging (resolves B-NEW-40 #108):**
   - ed25519 keypair generated on Helsinki: `/home/langston/.ssh/id_ed25519`. Fingerprint `SHA256:gvtY9j7vBwXruVXaGNLhot/lWac/zVt3omObdSTHIQs langston@helsinki`.
   - Pubkey installed on staging at `/home/deploy/.ssh/authorized_keys` with `from="204.168.141.77"` IP restriction (Helsinki static IPv4).
   - Hostkey pre-pinned via `ssh-keyscan` from CC side, written to `/home/langston/.ssh/known_hosts` (defense against first-connection MITM).
   - SSH config alias `staging` added at `/home/langston/.ssh/config` for ergonomic future use.
   - Verified working: `tail /var/log/dawntrader/out.log`, `pm2 list`, `curl localhost:5000/api/health` all succeed from Helsinki via deploy user.

6. **CLAUDE.md §10.5 dual-update:** both project-root `CLAUDE.md` AND Langston-side `/home/langston/CLAUDE.md` updated to distinguish per-turn alerts check paths: CC uses `ssh root@188.245.193.8`, Langston uses `ssh deploy@188.245.193.8` (via new keypair).

**Defense-in-depth posture (Q5 reconsidered post-Langston-pushback):** `deploy` user chosen over original `root` proposal. Helsinki compromise → deploy-level read access on staging only (logs, pm2 read, localhost curl). Strictly less than CC's root path. Explicit escalation chain documented in SIM: Helsinki → Langston key → deploy@staging → `.env` → `DATABASE_URL` → DB read/write. Recommended follow-up: ForceCommand wrapper to restrict pubkey to specific commands (RUNNING_ISSUES #110).

**Verification:**
- V1 ✅ Whisper smoke (jfk.wav transcribed correctly, 8.3s wallclock)
- V6 ✅ Langston SSH to staging (`ssh staging '...'` succeeds, all read ops work)
- V8 ✅ Both bridges restart clean (tasks=2 confirms main + worker threads spawned per boot log)
- V2-V5, V7, V9 ⏳ Kyle-in-the-loop / Step 8 / post-archive-files

**Langston review trail (all APPROVED):** Step 1 (4 rev rounds applying 8 revisions + Q5 reconsideration), Step 2 (2 rev rounds with critical Rev 1 unified-queue fix), Step 4 (clean approval after verifying single-claude-at-a-time invariant via trace + first live SSH §10.5 check).

### Step 7 first-pass hotfixes (2026-05-17, Kyle voice testing)

Three sub-batch hotfixes applied during Step 7 when Kyle's actual voice notes surfaced gaps not caught in pre-audit. **All three hotfixes deployed live to Hetzner Helsinki via direct `scp` + `systemctl restart` (no GitHub roundtrip; in-repo CI is pre-existing red and Helsinki box is operational infrastructure outside the deploy pipeline).**

**Hotfix-1 — ffmpeg Ogg→WAV preprocessor.** Pre-audit §3.2 assumed `whisper-cli` handled Telegram's Opus-in-Ogg natively; v1.8.4's standalone CLI only reads WAV (verified by direct test on Kyle's archived msg 3918 — "failed to read audio data as wav (Unknown error)"). Fix: `apt-get install -y ffmpeg`; both bridges now run `ffmpeg -loglevel error -y -i <audio> -ar 16000 -ac 1 -c:a pcm_s16le <wav>` before invoking whisper-cli on the converted WAV. Adds 30s `FFMPEG_TIMEOUT_S` budget; intermediate WAV cleaned up regardless of outcome. Verified via re-transcription of msg 3918 returning correct text "Are you receiving this message? Please transcribe it if you get it." in 7.7s wallclock. **Lesson:** smoke-test format-handling claims with real production audio samples, not just bundled samples (jfk.wav happens to be WAV which masked the limitation).

**Hotfix-2 — per-bridge archive subdir + silent-in-group UX.** Two bugs surfaced when Kyle posted his second voice note in topic 21: (a) cc-bridge runs as `root` per systemd; langston-bridge runs as `langston`; both tried to write the same archive path → `PermissionError: [Errno 13] Permission denied: '/var/log/cc-bridge-voice-archive/2026-05-17/3920.oga'`. (b) Both bots posted user-facing notices in topic 21 (one ACK, one failure), confusing UX. **Fixes:** (a) langston-bridge's `VOICE_ARCHIVE_ROOT` switched to `/var/log/cc-bridge-voice-archive/langston/` subdir (langston:langston owned). cc-bridge keeps original path. No collision possible. (b) langston-bridge's voice handler now distinguishes DM vs group via `chat.type == 'private'`: in DM keeps full UX (preview ACK + fallback notice on failure); in topic 21 is silent on success ACK and silent on failure notice — CC handles user-facing message there; Langston speaks only via the actual claude-cli reply (and only if non-[SILENT]). Removed the "Now invoking Langston..." over-promise suffix from CC's ACK per Langston Step 4 obs #1.

**Hotfix-3 — session UUID auto-rotate + bridge-error silent-in-group.** claude-cli intermittently rejects langston-bridge's canonical session UUID with `Error: Session ID f8dd5e4c-... is already in use` even when no other claude process is running (timing-sensitive internal lock; transient — same UUID worked fine on direct retest a minute later). **Fix:** `invoke_claude` detects "already in use" in stderr, generates a fresh `uuid.uuid4()`, persists to `/home/langston/.langston-bridge-state.json` via existing `save_state`, retries once. Lossy on prior conversation history but Langston's CLAUDE.md+MEMORY auto-load on every session start, so persona/state recover. **Also fixed:** bridge-error wrapped responses (`_Langston bridge error: claude returned exit code N_`) suppressed from group chat posts when chat is not DM. Still mirrored to inbox JSONL for debugging. DMs still surface errors visibly. Verified live: post-hotfix Langston cleanly responded to Kyle in topic 21 (msg 3928 "This is a test message. Please transcribe it." echo + msg 3933 "Acknowledged — third system message received. Standing by...").

**Verification (Step 7 V2-V4):**
- V2 ✅ DM with @CCDTCommsBot: msg 63 "Are you able to transcribe these messages?" transcribed cleanly to inbox.
- V3 ✅ topic 21: 4 voice notes (msgs 3920, 3923, 3926, 3929, 3931) all transcribed cleanly. Langston responded in-thread cleanly post-hotfix-3.
- V4 (DM with @LangstonDTBot): not explicitly retested but same code path as V3-Langston-side which works.

**Files changed by hotfixes (on Hetzner Helsinki, not in repo):**
- `/usr/local/bin/cc-comms-bridge` — ffmpeg step + ACK suffix removed
- `/usr/local/bin/langston-bridge.py` — ffmpeg step + archive subdir + DM-vs-group conditional + session-UUID rotate + bridge-error-silent-in-group
- `/var/log/cc-bridge-voice-archive/langston/` — new langston:langston subdir
- `/usr/bin/ffmpeg` — installed via apt

---

## INFRA-2026-05-17-A — B-NEW-40: pg pool keepalive + TEC refresh timeout (silent-TCP-death root-cause fix)

**Severity:** HIGH — recurring production stall, requires PM2 restart to clear, blocks all VTS exit cycles and ablation emissions when triggered.

**Symptom:** `[TEC_STALE_FAIL_CLOSED]` cascade on staging, two incidents 18h apart (2026-05-15 17:13 UTC and 2026-05-16 11:14 UTC). Each event cascade: `evaluateTECExit` → `isMoonbagQualifier` → `resolveTECConfig` throws → `resolveOpenVirtualTrades` throws → `runPhase10SimulationCycle` throws → VTS exit loop dies → no new VTS trades created → no new ablation emissions → trades-open inflow stops. Cleared only by PM2 restart; recurs on a 12–18h cadence.

**Root cause (verified by CC + Langston converged review, 2026-05-17):** two stacked contributors.

1. **Network layer — silent TCP path death.** Long-idle pg-pool connections between Hetzner Falkenstein and Supabase Frankfurt lose state at intermediate hops without TCP RST. With pg-pool's default `keepAlive: false`, the OS never probes the socket. The pool reuses the dead-but-ESTABLISHED connection for a query; the query write succeeds (lands in the local kernel buffer) but the response never returns. No socket error, no statement timeout. Pre-May 8 heartbeat-cycle slowdowns of 14.9s and 96.9s observed in April logs confirm the network condition existed before B79.TEC; it was absorbed silently by the old await-based TEC architecture.

2. **Code amplifier introduced by B79.TEC (2026-05-08, commit `01fa39912`).** The per-asset-class fire-and-forget refresh pattern with `tecConfigRefreshInFlight` coalescer Map + 5-min staleness ceiling converts a single hung promise into a permanent fail-closed state. When the underlying `refreshTECConfigForClass` await neither resolves nor rejects, the chained `.catch` and `.finally` never fire — the Map entry stays populated forever, blocking every future refresh attempt. After 5 minutes of staleness, every `resolveTECConfig` call throws `TEC_STALE_FAIL_CLOSED` until PM2 restart. Smoking gun: 0 `[TEC_REFRESH_FAIL]` log events across 4832 `[TEC_STALE_FAIL_CLOSED]` events (strict regex grep). Architectural fingerprint: exact-duplicate-duration clustering (4 events at precisely 96,983ms, 4 events at precisely 8,943ms) is the signature of "one hung promise traps the Map; every subsequent read re-evaluates the same staleness check against the same fixed timestamp" — distinct from a recurring network blip which would produce a distribution of durations.

**Fix (B-NEW-40, 2026-05-17):** five mitigation layers in one batch.

1. **Pool config hardening** (`server/db.ts`): `keepAlive: true` + `keepAliveInitialDelayMillis: 10_000` (OS TCP probes detect dead sockets within ~12 min instead of 2+ hours; in-flight queries on detected-dead clients reject cleanly with no silent retry, aligns with CLAUDE.md §5 #15 "no silent fallbacks"), `query_timeout: 30_000` (pg-client-side abort on any query >30s), `idleTimeoutMillis: 30_000` (lower connection churn; resilience comes from keepAlive layer), explicit `max: 10` (matches default, surfaces ceiling for operators), `application_name: 'dawntrader_main'` (tags connection class for DB-side diagnosability). Boot emits `[DB_POOL_INIT]` log line.

2. **Refresh-promise timeout fence** (`server/services/trailing-exit-controller.ts:~235`): `Promise.race([refreshTECConfigForClass(assetClass), timeoutAfter45s])`. On timeout-path rejection, existing `.catch` increments `tecRefreshFailCount` and logs `[TEC_REFRESH_TIMEOUT]` (distinct tag from `[TEC_REFRESH_FAIL]` for path attribution); `.finally` clears the in-flight Map. 45s budget = pool `query_timeout` (30s) + 15s slack for event-loop scheduling + GC. Plain `setTimeout` per Central Clock audit (per-call one-shot, not a recurring schedule).

3. **TEC diagnostic endpoint** (`server/routes.ts` + `getTECDiagnostics()` in `trailing-exit-controller.ts`): NEW `/api/diagnostics/tec-config` route (auth-gated, read-only). Surfaces per-class state + Central Clock health. Operational visibility at incident time without needing a DB query.

4. **Hostile-scenario test** (`server/tests/unit/b-new-40-tec-refresh-hang.test.ts` — NEW): simulates hung refresh via mock returning `new Promise(() => {})`; asserts (a) inFlight Map releases within 45s+ε, (b) `tecRefreshFailCount` increments by 1, (c) `[TEC_REFRESH_TIMEOUT]` logs exactly once, (d) cached config returned until 5-min ceiling, (e) past ceiling throws `TEC_STALE_FAIL_CLOSED`.

5. **`tec-pg-capture` systemd unit on staging** (`/usr/local/bin/tec-pg-capture`): adds `ss -tnpi state established '( dport = 5432 )'` capture per 60s tick after `TEC_STALE_FAIL_CLOSED` log-tail trigger. Output to `/var/log/dawntrader/tec_diag/ss_<ts>.txt`. Direct evidence of TCP socket state at incident time.

**Central Clock alignment audit (Kyle directive 2026-05-17):** zero new recurring schedules introduced, zero competing timers. Pool config is kernel/library layer; refresh timeout is per-call one-shot; diagnostic endpoint is request-driven; bash capture is event-driven by log tail. No Central Clock subscription required.

**SIM governance gap closed:** new "Recent Additions (B-NEW-40)" section in `SYSTEM_IMPACT_MAP.md` documents both B-NEW-40's changes AND the B79.TEC config-cache subsystem (cache maps, `primeTECConfig`, `hasExplicitAssetClassRow` invariant, 45s `Promise.race` fence, `CONFIG_MAX_STALENESS_MS` ceiling, canonical log signatures, bidirectional link to `server/db.ts` SIM entry).

**Langston Step 1 + Step 2 sign-off:** APPROVED 2026-05-17 with 5 corrections applied (idleTimeoutMillis framing rewrite, keepAlive failure-mode line, hostile-test expanded to 5 assertions, `application_name` in SIM, plain-language paragraph in scope).

**Verification:** 14-day staging soak. Zero `TEC_STALE_FAIL_CLOSED` events = cause closed. If one fires, the `ss` capture identifies whether the dead-socket signature is still present (would indicate keepalive isn't reaching the actual failure mode and we need a network-layer follow-up).

**References:**
- `Claude Comms and Packages/Scope Files/B_NEW_40_SCOPE.md` (Step 1 scope, Langston-approved)
- `Claude Comms and Packages/Scope Files/B_NEW_40_PRE_AUDIT.md` (Step 2 pre-audit with §2.6 Central Clock audit + §1.1 architectural-fingerprint evidence)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` "Recent Additions (B-NEW-40 — pg pool keepalive + TEC refresh timeout, 2026-05-17)"
- `Claude Comms and Packages/Langston Design Asks/TEC_STALE_INVESTIGATION_2026-05-16_rev1.md` + `..._2026-05-17_rev2.md` (Langston reviews)

### Post-session deploy follow-up (2026-05-17 EOD, Kyle bug report)

Kyle reported end-of-day 2026-05-17 that the System Alerts tab was not visible in his browser. Investigation: dist/public was last built at 12:46:47Z (the original B-NEW-40 deploy). Although that build INCLUDED the `authFetch`→`apiFetch` hotfix (commit `62890eaf0` at 12:43:14Z landed pre-deploy), Kyle's browser session was not seeing the rendered tab. Re-deploy at 2026-05-17T16:11Z (PM2 #291, commit `c72ddf8dc` HEAD) resolved cleanly; Claude-in-Chrome re-verification confirmed the tab now renders with the soak alert correctly populated. Root cause not isolated with certainty (likely browser-side cache of older HTML predating the deploy, or transient asset-hash mismatch). **Process correction captured as Lesson #6 in PHASE_HISTORY Phase 24 INFRASTRUCTURE HARDENING block:** when ANY hotfix follows the initial deploy in the same session, OR when the session continues to other work that doesn't touch staging-side code, re-run `git pull && npm run build && pm2 restart dawntrader` as the LAST step before declaring UI surfaces "live to Kyle," AND re-do Claude-in-Chrome verification at end-of-session — not just at the intra-session Step 7 verification point.

---

## FINDING-2026-05-15-A — B-NEW-37 forensic surfaces TWO interacting defects in the modulation chain

**Date:** 2026-05-15/16 | **Commits:** `2331a21bb` + `ba893d9e1` | **PM2:** no restart (out-of-band CLI)

**Per Langston Step 8 framing:** "CHANGES_AND_FIXES gets a `FINDING-2026-05-15-A` entry tagging the b68_5 uniform-haircut and 0.20 floor concentration as separate but interacting defects."

**Defect 1 — `module_constants.regime_classifier.b67_5_post_composition_floor = 0.20` (set by B70.3b 2026-05-05 as visibility-window override; code default is 0.4; original pre-B70.3b value was 0.45).**

- Empirical impact (B-NEW-37 Phase 4): 15.4% of b76 trades pinned at exactly 0.200. Pinned-trades WR = 34.5%; free-floating WR = 23.6%. **11pp gap — the floor is actively concentrating winners while free-floating trades drift inverted at the top deciles.**
- B70.3b's change log labelled this as "Pure visibility — no consumer reads `regimeConfidenceModulated` until B67.5" and "until B67.5 lands and re-tunes based on real distribution data" (SIM §B70.3b line 1246).
- The 0.20 setting is anomalously low compared to peer floors in `module_constants` (pwin_floor=0.4, winrate_floor_low=0.4, pattern_pool_gates.final_score_floor=0.45, mode-based confidence floors 0.60-0.80).
- **Fix candidate (B-NEW-39 Phase 1):** revert via SQL UPDATE to 0.45 (original) or 0.40 (code default). One-line config change. Verification via re-running B-NEW-37 forensic CLI — expect pinned-WR-vs-free-WR gap to narrow + decile-1 to no longer be a pure floor-pinned cluster.

**Defect 2 — b68_5 Path-B sustainability gate is uniformly over-aggressive (~0.40 confidence haircut on every signal).**

- Empirical impact (B-NEW-37 Phase 3): Δconf (real - alt) = -0.406 for winners (n=222) and -0.391 for losers (n=241). MW-U p=0.094 (not statistically significant — gate doesn't preferentially suppress winners).
- Per Langston Q4 verdict matrix → **Scenario B: uniform-too-aggressive — recalibrate, don't DROP.** The gate has directional value (mostly correct sign even if compressed) but the magnitude erases the predictive signal that exists in the alt (gate-off) distribution. The -0.40 haircut compresses everything toward floor, then the 0.20 floor catches the compressed signal and accidentally concentrates winners.
- **Fix candidate (B-NEW-39 Phase 2):** cap the gate's downward push at ~0.10-0.15. Recalibration target per Langston: "still in the neighborhood of the ~0.37 multiplier intuition from B-NEW-33 Step 8."

**Interaction between Defect 1 and Defect 2:** the b68_5 gate compresses chain output by 0.40, pushing many trades below the 0.20 floor. The floor catches them and pins them at 0.20. Trades that the gate WOULD have driven to (e.g.) 0.05-0.15 land at 0.20. Trades that DIDN'T need much gate suppression land in the 0.30-0.50 free-floating band. The high pre-confidence winners get gate-compressed below 0.20 and floor-pinned; the low pre-confidence losers stay free-floating. **Net effect: inversion at the top decile, winners concentrated at the floor.**

**Per-modulator factor analysis (Phase 2):** all 6 multiplicative levers near-neutral. b67_2_phase_preference (ratio 1.006, inert), b67_4_outcome_feedback (1.005, correct sign p=0.007), b68_1_multi_tf_agreement (1.007, correct sign p=0.020), b68_2_volume_regime (1.000, inert), b68_3_pair_correlation (0.999, inert), b68_4_regime_age (0.991, inert). **NO single-lever sign flip exists.** The diagnosis is not "a modulator is broken" — it's "two interacting structural defects (floor + b68_5 magnitude) create the inversion".

**Bonus fix shipped:** `scripts/b-new-36-cohort-diagnostic.ts` `classifyShape()` gained segment-based monotonic-down/up fallback (Langston Step 8 of B-NEW-36 todo).

**Hand-off:** **CLOSE B-NEW-37 at Step 9. SPAWN B-NEW-39** with three-phase sequential scope (floor revert → b68_5 recalibrate → conditional raw-classifier forensics with potential B-NEW-40 splitoff). **B-NEW-38 (stratified B-NEW-33 re-run) stays blocked through B-NEW-39.** B67.5 consumer-gate design unblocks after B-NEW-39.

**Crypto regression: NONE** by construction (out-of-band CLI; read-only; no PM2 restart; no aggregator changes).

---

## INFRA-2026-05-15-C — B-NEW-36 cohort diagnostic surfaces b76 confidence-inversion (CRITICAL system bug suspicion)

**Date:** 2026-05-15 | **Commits:** `bb508ce29` (initial impl) + `390e23ced` (chunked-load hotfix) | **PM2:** no restart (out-of-band CLI)

**What this batch found:** the b76 confidence framework is **inversely correlated with realized win rate**. Splitting the 8,926 b76 matched rows into deciles by `real_decision.confidence`:

| Decile | Confidence range | n | WR |
|---|---|---:|---:|
| 1 (floor-pinned) | 0.200 | 892 | 35.3% |
| 2 | 0.200-0.210 | 893 | 40.5% |
| 5 | 0.259-0.295 | 893 | 32.3% |
| 9 | 0.422-0.493 | 893 | **6.7%** |
| 10 | 0.493-0.839 | 893 | **11.2%** |

WR drops monotonically across deciles 2-9. Higher modulated confidence corresponds to LOWER realized WR. The system rates trades as "high confidence" and those trades subsequently win less often than trades it rates as "low confidence". This survives single-strategy stratification (strong_bull_trend n=5514 alone is monotonic-down) AND single-phase stratification (LATE n=2184 is monotonic-down). Not noise.

**Why this matters operationally:** B67.5 was meant to wire the modulated confidence chain into 7 live consumer sites. If we ship B67.5 against an inverted signal, the consumer gates would REDUCE realized WR — actively harm the bot. Pre-B67.5 the chain is decorative (no consumer reads modulated confidence yet) so the inversion has no live impact today.

**Other findings (chi-square at p≈0 on all 6 valid dimensions):**
- Hour-of-day: 21:00 UTC = 79.5% unmatched rate; 22:00 UTC = 61.4%; morning hours (03-07 UTC) = 23-28%. The signal-orchestration layer is dropping evening UTC signals at much higher rates than morning signals.
- Day-of-week: Thu 70.1% unmatched, Fri 68.8%, Tue 54.4%, Mon 24.9%, Sun 20.9%. The weekday pattern is highly imbalanced.
- Strategy: vwap_pullback 65.1% unmatched, strong_bull_trend 44.9%, support_bounce 23.1%.
- sourcePool, regimeLabel, symbol: all highly significant skew.
- (`phase_at_entry` chi-square at p=0 is **instrumentation artifact** — that field only exists on `replay_outcome` of matched rows, so all unmatched are null by construction. Excluded from selection-bias evidence per Langston Step 8.)

**Decision rule outcome:** Phase 5 of the diagnostic pre-committed three possible recommendations (A: framework split resolves → b76-only re-run; B: sourcePool split resolves → per-pool verdicts; C: persists → sub-cohort). **Outcome C — non-monotonicity persists across framework + sourcePool + regime + strategy stratification.** Default recommendation was sub-cohort B-NEW-33 re-run on b76 + TFS + quant-strong_trend + post-stall. **Overridden by Langston Step 8 verdict:** the more useful next step is forensics on the inversion itself, not a re-run on a buggy chain.

**Langston Step 8 verdict APPROVED for closure with sequencing change:**
- **B-NEW-37 (inversion forensics) FIRST.** Trace b76 chain-composition; check each modulator's sign convention; compare train-vs-serve confidence-WR; verify the inversion is post-b76-cutover. Identify which specific modulator or feature is the bug source.
- **B-NEW-38 (stratified B-NEW-33 re-run) AFTER B-NEW-37 lands.** Re-run on corrected or known-good baseline.
- **B67.5 BLOCKED through both batches** (~3-5 calendar days delay; worth it to avoid shipping consumer gate on inverted signal).

Root cause priors per Langston (in order): (1) label-flip in b76 training/calibration, (2) feature-polarity error in one or more modulator inputs, (3) train-vs-serve distribution mismatch, (4) rank-vs-calibration drift. (1) and (2) are primary — both inspectable via training-script read + a single SQL of training labels vs realized outcomes on a holdout.

**Parity check (Phase 6 of diagnostic):** diagnostic's tertile-collapsed WRs for `b67_4_outcome_feedback` match B-NEW-33 verdict report exactly (17.3% / 25.7% / 20.4%, n=2192). Methodology validated.

**Bonus fix for B-NEW-37:** the `classifyShape()` function in `scripts/b-new-36-cohort-diagnostic.ts` lacks a `monotonic-down` detection branch — b76's clear monotonic-down shape was mis-labeled "undefined". One-line fix.

**B-NEW-37 spawned** via `mcp__ccd_session__spawn_task` with full scope including root cause priors, sequencing notes, and reference docs.

**Crypto regression:** NONE by-construction (read-only CLI; no DB writes; no PM2 restart; no aggregator changes).

**Files touched:** `scripts/b-new-36-cohort-diagnostic.ts` (NEW, ~500 LOC), `package.json` (script entry).

---

## INFRA-2026-05-15-B — B-NEW-33 crypto factor-calibration backtest + nightly-cron unblock

**Date:** 2026-05-15 | **Commit:** `892da2f27` | **PM2:** no restart required (out-of-band CLI; cron change applies on next nightly run)

**What broke:** `b67:replay-ablation` nightly cron stuck since 2026-05-11. Each run loaded 5000 of 33,049 pending rows, matched 0 against the JSONL source-of-truth, left unmatched rows pending (line 311 explicitly: "Don't mark as completed — leave for next pass when the trade closes"). Result: each night the same ~5000 stale-unmatchable rows re-fetched while the matchable ones beneath the ceiling never got processed. By 2026-05-15 the live `/api/analytics/factor-calibration` panel was showing decision-grade rows only for the ~7,593 replays that landed pre-stall (peak May 3-5).

**Two root causes:**
1. **Source coverage gap.** Cron's JSONL source filed closed trades by CLOSE-DATE filename, not OPEN-DATE. Trades opening one day and closing 1-3 days later existed in their close-day file, which the OPEN-day natural-key search wouldn't load if it walked from open-date. (Coverage worked accidentally pre-May-11 because most trades closed same-day; B79.0g-tx's soft-delete shift in the closure cascade made the cross-day pattern more visible.) Empirical confirmation: SUI/USD reverse_impulse opened 2026-05-12, closed 2026-05-14 — exists only in `2026-05-14.json` not `2026-05-12.json`.
2. **No-progress dead-lock.** Cron loaded 5000 pending rows per pass via `LIMIT 5000` with no ORDER BY. Unmatched rows stayed pending. Same rows re-fetched nightly. Matchable rows beneath the ceiling were unreachable.

**Structural fix per Langston APPROVE 2026-05-15 + 4 implementation conditions:**

1. **Extract shared replay logic into `server/services/factor-replay-core.ts`.** Both the nightly cron (`server/scripts/replay-ablation.ts`) and the new one-shot CLI (`scripts/b-new-33-factor-backtest.ts`) consume it. No drift between the two paths.

2. **Dual canonical source.** Primary: `vts_open_trades WHERE closed=true AND opened_at >= 2026-05-11` (post-B79.0g-tx canonical truth). Fallback: JSONL files for trades opened before the cutoff. The matcher tries DB first, falls back to JSONL. Closest-by-time tiebreak within ±5min tolerance window (per Langston Q5).

3. **Unmatched rows are MARKED `unreplayable_real_rejected` with near-miss diagnostics.** No more pending-row pileup. Cron's nightly delta-only workload becomes bounded by the day's new emissions (~500 rows).

4. **One-shot CLI tool `npm run b-new-33:factor-backtest`.** Unbounded drain mode (no 5000 limit), then computes per-lever verdicts: tertile-WR split on `real_decision.confidence` + chi-square 2×2 (df=1) p-value (per Langston Q3 — simplified from Fisher's exact since n≥150 is the gate) + decision-grade gate (n≥150/bucket AND |spread|≥7pp AND p<0.05 per Langston Q2). Markdown output to stdout + `Claude Comms and Packages/Batch Completion/B-NEW-33_VERDICTS.md`.

5. **Negative-control test (Langston condition 3).** `--dry-run-synthetic` flag generates 1000 noise rows; verdict math correctly produces INCONCLUSIVE for all factors. Catches verdict-math regressions where a degenerate lever accidentally gets a false KEEP.

**Live drain on staging (2026-05-15 15:42 UTC):**
- 33,049 pending rows processed in single pass
- 13,830 matched (41.8%)
- 19,219 marked `unreplayable_real_rejected` (signal emitted but no closed trade — rejected at gates downstream of signal generation)
- Post-drain DB state: pending=0, all 40,642 crypto_spot rows have `replay_completed_at` set

**Per-lever verdicts (16-day cohort, 2026-04-30 → 2026-05-15):** all 10 crypto factors return INCONCLUSIVE. 8 of 10 fail on spread<7pp gate (tertile WR spread 1.0pp - 4.2pp range; none reach the 7pp decision-grade floor). 2 of 10 marked dormant (mean abs confidence shift < 0.01). Notable: tertile WRs are non-monotonic across all 10 (low ~17% → mid ~26% → high ~21%) suggesting confidence clustering or non-linear factor effects. b68_5_path_b_sustainability shows predictive_lift = -6.1pp (lever may actually be harming the signal) — flagged for B67.5 design consideration.

**Cron health post-restructure:** nightly run from 2026-05-16 onwards processes ~500 fresh emissions per day (the system's typical daily ablation-row output). The `LIMIT 5000` retained gives 10× safety margin. Expected log pattern: `Pending rows: vts_trade=~500 ... matched=~150 unmatched=~350 ... Done. pending_vts=0`.

**Watch items for ops:** monitor `/var/log/dawntrader/replay-ablation.log` next 3 nights. If pending_vts stays > 0 after the run, that signals a fresh accumulation problem.

**Crypto regression:** NONE by construction (out-of-band CLI; reads existing tables; writes only to `regime_factor_alternates.replay_outcome` + `replay_completed_at` columns; cron refactor preserves outcome row shape consumed by `computeFactorCalibration`).

**Hands-off to B67.5:** the verdict file informs B67.5 consumer-gate design. Three paths under Langston Step 8 review: (a) hold and recohort to a full 30-day window, (b) relax thresholds, (c) pivot to combination/interaction analysis. Awaiting Langston recommendation.

**Parity check addendum (Kyle directive 2026-05-15 evening).** After the all-INCONCLUSIVE verdict, Kyle questioned whether methodology had drifted from the canonical aggregator that had previously shown 5-6 active levers in the UI panel. Built `scripts/b-new-33-parity-check.ts` to run both calculations on the same pre-drain row set. **Result: confidence-shift values (top table of the UI panel) match the May 5/6 screenshot exactly to within rounding** (e.g. b68_5: 0.4457 → 0.4456; b68_4: 0.0149 → 0.0149). Predictive-lift values are in the same direction and similar magnitude; small numerical differences explained by cohort-size delta (screenshot had ~700 rows/factor; pre-drain analysis includes through May 10 ≈ 800-850/factor). **Methodology is sound — no calculation drift.** The divergence is at the verdict-labeling LAYER: the screenshot used approximately a +3pp lift floor as "DECISION-GRADE WIN"; my CLI applies Langston's locked 7pp + p<0.05 gate. **Kyle decision: HOLD the 7pp gate (Option 1).** B-NEW-36 diagnostic spike (tertile non-monotonicity + 58% unmatched-rate audit) runs FIRST. B67.5 wires nothing this cycle. Parity report committed at `Claude Comms and Packages/Batch Completion/B-NEW-33_PARITY_CHECK.md`.

---

## INFRA-2026-05-15-A — B-NEW-34 xstock scanner 60-min bar parity + B74 dup-row workaround

**Date:** 2026-05-15 | **Commits:** `756b64e49` (initial impl) → `a7545d595` (hotfix 1: drizzle IN-literal) → `88e34bd67` (hotfix 2: cache depth) → `1ee3ceb27` (hotfix 3: DISTINCT ON aggregator + 240m warm-fetch suspended) | **PM2:** #283→#284→#285→#286→#287 | **Migration script:** `scripts/b-new-34-xstock-60min-parity.sql`

**What broke (the pre-existing condition that triggered the batch):**
Pre-B-NEW-34 the xstock scanner was producing 26 pairs scanned per cycle in steady state (target ≥70). Investigation across the 7-day window post-rotation commit `dd5810c32` (2026-05-12) showed the actual proximate cause was the 75-pair rotation interacting with a 90-second ticker_snap freshness gate, NOT the freshness batch (B79.0a, 2026-05-08) as initially suspected. On 60-min-class swing-trading decisions, requiring fresh ticker data inside a 90-second window is a hidden gate that filters even liquid names during minor data lulls. The architecture decision Kyle locked 2026-05-15 was to drop the freshness gate entirely and switch to 60-minute bar parity with crypto, mirroring the documented swing-trading premise of the system.

**What this batch did:**
Switched xstock scanner to canonical 60-minute bar interval via local SQL aggregation from the B74 archive table `xstock_spot_ohlc_1m`. Source path: Kraken has NO equities REST API at any subscription tier (B79.0k verdict re-verified 2026-05-15 via live probe of `pair=TSLAxUSD&interval=60` returning `EGeneral:Invalid arguments`). Two new files: `server/asset_classes/xstock_spot/ohlc-aggregator.ts` (single-SQL rollup with epoch-floor UTC alignment) + `server/services/xstock-ohlc-cache.ts` (asset-class-scoped 5-min TTL, separate instance from crypto ohlcCache). Filter floor 60 → 24 bars via new module_constants row `xstock_spot.min_ohlc_history_bars=24` (single SSOT for global-filter + pattern-filter). `data_freshness_window_ms` row DELETED. ORB disabled (intraday-bar strategy, incompatible with 60-min architecture, revisit Phase D of XSTOCK_CALIBRATION_PLAN.md).

**Two postgres-TZ bugs caught by Langston Step 4 R4 review (both load-bearing):**
1. `date_trunc('hour', timestamptz)` is silently session-TZ-dependent — would produce wrong bucket boundaries on any non-UTC postgres session. Fixed to `to_timestamp(floor(extract(epoch from t)/3600)*3600)`.
2. `to_timestamp(floor(epoch/N)*N) AT TIME ZONE 'UTC'` downcasts timestamptz to TZ-naive `timestamp` — the pg driver then renders without `+00` suffix and `new Date()` would interpret it as host-local TZ. Would break on any non-UTC Node host (Hetzner is UTC today but laptop dev / CI runners / future regions wouldn't be). Fixed by dropping the AT TIME ZONE clause; epoch-floor returns plain timestamptz, UTC-anchored.

**Three structural hotfixes (NO PATCHES doctrine — every fix is the long-term right answer):**
1. **Hotfix 1 (`a7545d595`):** drizzle `WHERE symbol = ANY(${array})` throws "op ANY/ALL requires array on right side" because the `sql` template doesn't auto-bind JS arrays to postgres array params. Fix: build literal IN-list with single-quote escaping (symbols sourced from hardcoded `XSTOCK_SPOT_SYMBOLS` const Set; no user input). Mirrors the existing scanner.ts:337-339 workaround.
2. **Hotfix 2 (`88e34bd67`):** initial cache depth 200 bars / 60-min + 60 bars / 240-min produced workload too large for postgres `statement_timeout=2min`. Reduced to 60/30 bars (still well above 24-bar filter floor + B68.1's 30-bar `min_higher_tf_samples` threshold). ~4× faster on rollup queries.
3. **Hotfix 3 (`1ee3ceb27`):** post-hotfix-2 SCAN_TIMEOUTs persisted. Diagnostic queries surfaced **B74 archive is writing 18-56× duplicate rows per (symbol, interval_begin)** — every intra-minute tick produces a fresh row rather than upserting one closed bar. Empirical (AAPL/USD over 2h): 4876 rows for 103 distinct minutes; one specific minute with 227 distinct OHLCV tuples, $1.78 close spread. Aggregator rewritten with `DISTINCT ON (symbol, interval_begin) ORDER BY captured_at DESC, id DESC` CTE picking the latest-tick (closed-bar) snapshot per minute. 240-min warm-fetch SUSPENDED (commented in scanner.ts) — not yet consumed by any canonical path; will be re-enabled once B-NEW-35 source-side dedup lands.

**ANALYZE discovery (also during hotfix 3 diagnosis):**
`xstock_spot_ohlc_1m_2026_05` partition had `last_analyze=NULL` despite 13.5M live rows in 3.4GB on disk. The planner was using default statistics and likely choosing sequential scans against indexed-but-not-analyzed pages. Manual `ANALYZE VERBOSE xstock_spot_ohlc_1m_2026_05` completed during diagnosis; planner switched to bitmap-index-scan post-ANALYZE. **Filed as a separate watch item:** verify the autovacuum/auto-analyze settings for partitioned tables are firing correctly. If not, partition-creation procedure may need explicit `ANALYZE` step.

**B-NEW-35 spawned** for the structural fix at the B74 archive write side: add UNIQUE constraint on `(symbol, interval_begin)` per partition + cleanup migration to DELETE 18-56× duplicates + writer rewrite to `INSERT ... ON CONFLICT DO UPDATE`. Once B-NEW-35 lands: (i) DISTINCT ON CTE in `ohlc-aggregator.ts` becomes redundant and is removed; (ii) 240-min warm-fetch in `scanner.ts:runCycle` is re-enabled.

**Staging verified live via Claude-in-Chrome (CLAUDE.md §9.3):**
xStocks tab Scanner Cycle Metrics post-PM2 #287 shows LAST CYCLE DURATION=675ms (down from 25s+ timeouts), PAIRS SCANNED (LAST CYCLE)=64 of 75 attempted (up from 26 pre-deploy), 10 consecutive healthy cycles, no SCAN_TIMEOUT after restart. Insufficient_history=11-17 per cycle (thinly-traded or newly-added names with <24 hourly bars — expected).

**Pre-flight C calibration debt (~12 indicator/threshold concerns) deferred to Phase B of XSTOCK_CALIBRATION_PLAN.md rev 2:**
Bar-interval change from 1-minute to 60-minute changes the meaning of any rolling-window threshold expressed in periods. 300-period Z-score window was 5 hours on 1-min bars; now 12.5 days on 60-min bars (samples regime-stable vs intraday-momentum). VN dominance, family-IMF thresholds, LQ thresholds, DI windows, ATR-distance multipliers ALL re-evaluated against 60-min bar evidence post-RTH 2026-05-19+.

**`pairsScannedLastCycle` semantic shift:**
Was "pairs with fresh ticker tick within 90s freshness window"; now "pairs with ≥24 hourly bars available in OHLC archive". Caller-side UI labels (xStocks tab) unchanged; numeric meaning is the canonical one going forward.

**Crypto regression:** NONE by-construction (separate `xstockOhlcCache` instance, asset-class-scoped aggregator, crypto `ohlcCache` + Kraken REST path untouched).

**Files touched:** 10 in initial impl (aggregator + cache + scanner + eval-cycle + global-filter + pattern-filter + data-freshness + tests + migration SQL + xstocks-tab banner) + 2 in hotfix 1 + 2 in hotfix 2 + 2 in hotfix 3.

---

## INFRA-2026-05-14-A — BATCH_82 xstock_spot ablation + calibration data path repair (5th crypto-first incident closure)

**Date:** 2026-05-14 | **Commits:** `dbdde1bfe` (Step 3 impl) + governance commit (Step 10) | **PM2:** #275 | **Deploy timestamp:** 2026-05-14T11:28:24Z

**What broke:** Pre-B82, two writer sites hardcoded `assetClass='crypto_spot'` regardless of caller intent — `factor-ablation-emitter.ts:236` (row builder) + `exit-strategy-replay-service.ts:264` (SQL VALUES literal). Every xstock VTS-emitted ablation/replay row since 2026-05-11 was silently mis-tagged crypto_spot. `/api/xstocks/exit-strategy-ablation?window=rolling_7d` returned `totalTrades:0, variants:[]` after 133.6 seconds; `/api/xstocks/factor-calibration` same shape at 38.1s. UI panels stuck on perpetual "Loading...".

**5th instance of crypto-first / asset-class-lost pattern** (after B-NEW-20/22/25/26).

**Structural fix (type-system-enforced caller-resolves, NOT silent fallback):**
1. `emitAblationRecord(..., assetClass: AssetClass)` REQUIRED parameter (NO default — compile fails if caller forgets). Both callers updated.
2. `ReplayContext.assetClass: AssetClass` non-nullable. Drop `?? 'crypto_spot'` fallback at line 264 (SQL bind) + line 294 (OHLC fetch).
3. Composite indexes via manual SQL: `(asset_class, created_at)` on `exit_strategy_alternates` + partial `(asset_class, evaluated_at) WHERE replay_completed_at IS NOT NULL` on `regime_factor_alternates`. Drizzle txn-wrap incompatible with `CONCURRENTLY` — script at `server/migrations/manual/B82_asset_class_indexes.sql`.
4. UI empty-state per-section copy with `ASSET_CLASS_REGISTRY.displayName` ("xStock Spot" not raw enum). Explicit `assetClass: AssetClass` prop (per Langston Q3 — explicit-prop scales for N asset classes).

**Endpoint speedups (curl-verified post-deploy):** xstock-ablation **954×** (133.6s → 0.14s), xstock-calibration **501×** (38.1s → 0.076s), crypto-ablation regression test **63×** (36.7s → 0.577s).

**Live UI verification 2026-05-14 11:40 UTC** via Claude-in-Chrome — both panels render "No xStock Spot data yet — accumulating" empty-state with displayName.

**Activation thresholds:** Exit Strategy Ablation = 1 closed xstock trade (12 variant rows). Factor Calibration = 1 trade + 1 nightly replay-ablation cron run.

**No-backfill Option β** (Kyle directive). 4-day contamination window rolls off rolling_30d by 2026-06-15.

**Same-batch governance ship:** `/home/langston/.claude/CLAUDE.md` stale 2026-05-06 loader rewritten (referenced retired CCPI + DT_Staged_Changes + batch zip + INSTRUCTIONS.md). 3 new SIM "If I Change X, Check Y" entries. `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10d observability backfill batch filed (commit `32ed09cd9`).

**Langston trail:** scope rev1 REVISE → rev2 APPROVE; pre-audit rev1 REVISE → rev2 APPROVE; Step 4 code review APPROVE-PUSH; Step 8 APPROVE-CLOSE.

See `BATCH_82_COMPLETION_REPORT.md` for full detail.

---

## INFRA-2026-05-14-B — B83 hotfix: ReferenceError tradeId in resolveOpenVirtualTrades (24hr silent pipeline stall)

**Date:** 2026-05-14 | **Commit:** `b4cde6b85` | **PM2:** #274

**What broke:** BATCH_80 Phase 1 (commit `8ace0b859`, 2026-05-13) renamed `getTrailingState(symbol)` → `getTrailingState(tradeId)` correctly in the FIRST for-loop of `resolveOpenVirtualTrades`. The SECOND for-loop destructures `for (const { id, trade, exitPrice, exitReason } of tradesToClose)` — iteration variable is `id`, NOT `tradeId`. Three references inside that loop body at lines `:2349` / `:2570` / `:2572` referenced an out-of-scope name. **TypeScript didn't catch it** because `tradeId` is a valid identifier elsewhere in the same module — compiler resolved against module scope. At runtime, JS threw `ReferenceError: tradeId is not defined` every cycle where `tradesToClose.length >= 1` → entire function aborted at the first iteration of the second loop → **ZERO trades closed for ~24 hours**.

**Detection:** Required **runtime instrumentation** because static analysis couldn't surface it. Added `[B83-DIAG]` per-trade decision logging + `[B83-CYCLE]` unconditional per-cycle summary log (replaces the gated `if (resolved > 0)` anti-pattern — success had a log line, failure had silence). The B83-CYCLE log line ships as PERMANENT health-beat.

**Fix:** Three single-character changes `tradeId` → `id` at lines 2349/2570/2572 of `vts-runner.ts`.

**Verification:** 85 trades closed cleanly via natural exit rules on first post-fix cycle (10:02:56 UTC). Pre-fix backlog flushed (84 closes in one cycle: AKT/EUR -10.07%, ARKM/USD -5.47%, EUL/USD -4.67%, ZBT/USD -7.16%, ICNT/USD -4.33%, SXT/USD -9.22%, plus trailing-stop winners; +1 EWZ/USD on second cycle).

**Why this hit production undetected for 24 hours:**
1. BATCH_80 code review missed the second for-loop variable mismatch.
2. TypeScript module-scope vs block-scope resolution — compiler doesn't flag block-scope shadowing when same-name outer-scope identifier exists.
3. Silent error swallowing — unhandled rejection logged at error.log level but no alert paged.
4. Gated success-only logs hid the failure. **B83-CYCLE permanent unconditional log fixes this anti-pattern.**

**Governance added in same stretch:**
1. **SIM "Rename invariants" section** (NEW): 5-step protocol mandatory for any cross-module identifier rename. Starter inventory of 7 identifier families.
2. **Block-scope for-loop lesson** added to SIM "If I Change X, Check Y" — block-scoped iteration variables DO NOT participate in module-scope identifier visibility.
3. **`MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10d observability backfill batch** filed: exit-cycle health dashboard + multi-API rate-limit dashboards (Kraken Public/Private/WS/Futures + CoinGecko + Supabase + Anthropic + Telegram + GitHub + Finnhub) + System Monitoring page reorganization + code-side hardening.

---

## UI-2026-05-13-A — xStocks Filter Diagnostics tab UI sprint (Phase 24 follow-on, 17 fixes 2026-05-12 → 2026-05-13)

**Trigger:** Kyle catalog of UI issues against the xStocks Filter Diagnostics tab post-B79.0m.b2. One-by-one diagnose-and-fix workflow (NOT a full batch — per Kyle directive 2026-05-12). Canonical tracker: `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md`.

**Architectural-parity defenses landed (missed in original B79.0a → B79.0m.b2 ship):**
- Cycle-scoped `screener_filters` config cache (1638 redundant lookups per cycle → 7). Commit `e3e8492bf`.
- 25s `SCAN_TIMEOUT_MS` + `Promise.race` (matches crypto fx5-scanner.ts:572-624). Commit `73ff21052`.
- 75-pair round-robin rotation with 3 pinned benchmarks (SPY/QQQ/GLD). ~1m 45s full universe sweep. Commit `dd5810c32`.
- Constant-name typo fix (`di_to_pwin_scaling_factor` → `di_pwin_factor`) — kernel-fail log spam saturating event loop. Commit `f86295cb9`.

**Pipeline architecture:**
- Parallel quant + pattern global filters (B-NEW-1 follow-up, commit `73ab29eb5`).
- Quant global threshold tightening + 24h dollar-volume wired from `xstock_spot_ticker_snap` (was hardcoded volume=0 silently skipping the gate). Commits `37dc1cee7` + migration `2026-05-12-b-new-1-xstock-global-tighten.sql`.
- ↩ max_bid_ask_spread REVERTED (`7892af79a`) — adding bid/ask columns to ticker_snap SELECT caused 130× query slowdown. Needs separate batched query design (B-NEW-14 deferred).

**UI / data-surfacing fixes — backend → panel field-name + math corrections (full list in tracker):**
B-NEW-3 (`38878c59a`), B-NEW-4 (`92f4d8ef9` + `257bc5752`), B-NEW-5 (`305129326`), B-NEW-6 (incidentally fixed), B-NEW-7 (`494db9b65`), B-NEW-8 (`7d7b61ff1` + `257bc5752`), B-NEW-9 + B-NEW-13 (`54f9286bf` + `e3811aba4` + `5569e9cc7` + `1d06a6832` + `1027485c6` — culminates in DB-backed 24h trade counts via `vts_open_trades.signal_type` split; 13 QUANT + 1 PATTERN live), B-NEW-10 (`b87635ec8` — all 10 enabled strategies show, dormant zero-rows), B-NEW-11 (`a6da4aaec` — Section Total row + drift indicator), B-NEW-12 (`9c9d14b47`), B-NEW-12.b (`cf260480b` — real fix for Quant column %>100%, eval-cycle maintains per-lane null aggregates), B-NEW-17 (`84183086c` + `717a4ada8` — Pre-Eval Skips total + Last Scan rows + 24h per-pool split). Max Price → "—" (`1835fb03b`). Pinned benchmarks SPY/QQQ/GLD only (`2deb4259a`).

**Standing rule added to ASSET_CLASS_ONBOARDING_WORKFLOW.md (commit `0bfc50242`):**
New **Step 6b — Calibration cycle (MANDATORY)** with 3 sub-cycles (regime classifier / filter thresholds / strategy gate testing). Each has observation window + tuning surface + exit criteria. Initial Layer-1 seed values are domain-knowledge starters, not production-tuned — empirical calibration is required before the asset class moves to Phase 19 active-trading consideration.

**Verified live (PM2 #262, HEAD `717a4ada8`):**
- 14 xstock trades opened in last 24h DB-backed (13 QUANT + 1 PATTERN).
- Cycle time ~10-17s under 25s timeout (33% margin).
- Math coherent within each scope: pool column %s sum ≤ 100%; Setup Nulls Section Total ≈ 99.9% of totalStratNulls.
- 10 strategies visible (5 active + 5 dormant regime-gated).
- No crypto-side regression: `regime_factor_alternates` cadence holds, no-touch fence respected.

**Deferred (tracked):**
- B-NEW-14: bid/ask spread filter — separate-batched-query redesign needed.
- B-NEW-15/16/18: Layer-3 calibration items (DI band, trend+breakout threshold differentiation, regime+family classifier redistribution).

---

## INFRA-2026-05-11-A — B79.0g-tx atomic close-time soft-delete + pre-audit schema-paste rule

**Trigger:** RUNNING_ISSUES #91 — B79.0g shipped close-time DELETE-from-vts_open_trades as fire-and-log async, not atomic with the closed-trade row creation. B79.0g-tx ships the soft-delete pattern (Option B) as the proper resolution after rejecting Option C (full tx through `persistRealPriceTrade`) as a regression-masquerading-as-a-fix.

**Resolution:**
- Schema: `closed BOOLEAN NOT NULL DEFAULT false` + `closed_at TIMESTAMPTZ` + partial index `WHERE closed=false` (CREATE INDEX CONCURRENTLY outside tx).
- Service: `deleteOpenTrade` → `markOpenTradeClosed` awaited UPDATE (idempotent via `WHERE closed=false`); rehydrate + bootstrap COUNT filters `WHERE closed=false` (Q4 re-resolve semantic preserved); new `sweepClosedOpenTrades` boot-time CTE DELETE with HARD-FAIL [CONFIG_MISSING]+null on missing module_constants row.
- Close-site (vts-runner.ts:2375-2402): Map.delete FIRST then awaited UPDATE in try/catch with NO re-throw. Map gate is the correctness invariant against re-executing the non-idempotent close cascade (Langston pre-audit R1, critical).
- Boot path (server/index.ts:661-686): own try/catch with [SWEEP_FAIL] label (Langston pre-audit R2).
- Seed: `module_constants.data_lifecycle.vts_open_trades.closed_gc_retention_days = 90` (wildcard scope; system knob, not per-asset behavioral).

**Commits:** `79774aa51` (impl) + `e32e101ee` (test-mock hotfix) + `bd299b8f7` (seed-SQL column-list hotfix).

**Test-mock snag (hotfix `e32e101ee`):** initial 2/13 b79-0g-tx tests failed with `TypeError: Cannot read properties of undefined (reading 'sql')` because `mockExecute.mockImplementationOnce` overrides bypassed the default mock's `dbCalls.push(...)` capture path. Replaced with a `dbReturnOverrides` queue the default mock consumes via `.shift()` — capture path always runs. No behavioral code change.

**Seed-SQL snag (hotfix `bd299b8f7`):** pre-audit §1.5 paraphrased a phantom `tunable_status` column reference from `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Section C. Actual `module_constants` schema has 9 columns: `(module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_at, updated_by)` — no `tunable_status`. Caught at psql-INSERT time as a deploy-blocking error (not silent data corruption). 3-LOC hotfix corrected column list + ON CONFLICT key order to match the actual PK index.

**Standing rule (Langston Step 8 verbatim):** "future pre-audit §1.5 schema sections must paste `\d <table>` output, not paraphrase from workflow docs." Tracked in new RUNNING_ISSUES #93 for the broader governance-doc schema-drift sweep (ASSET_CLASS_ONBOARDING_WORKFLOW Section C + SYSTEM_MANUAL appendix + CURRENT_SETTINGS_REGISTRY may have additional stale references).

**Verification:** PM2 #215 boot logs clean — `[B79.0g][REHYDRATE] loaded 113 open VTS trades from DB` + `[B79.0g-tx][GC_SWEEP] retention=90d swept=0 closed-rows`; all 13 b79-0g-tx tests pass on CI; crypto no-touch fence held at 10 factor families × 8/hr. Langston Step 8 APPROVED with 2 non-blocking observations.

**Lesson logged:** R1 was the high-value catch — my initial pre-audit pattern (UPDATE before Map.delete; re-throw on failure) would have shipped a latent double-execute bug on any transient Postgres blip during close-time UPDATE. Map.delete-first preserves the correctness invariant; soft-delete is observability + bounded-history, not close-cascade atomicity.

---

## INFRA-2026-05-10-B — B79.0i.b factor-calibration jsonb schema-extraction hotfix

**Trigger:** B79.0i.b initial deploy of `/api/xstocks/factor-calibration` errored with `column "real_confidence" does not exist`. The custom xstocks endpoint query referenced flat `real_confidence` and `alt_confidence` columns assumed from naming convention.

**Root cause:** I assumed the column shape from the variable name (`avgRealConfidence`, `avgAltConfidence`) without verifying schema. The actual `regime_factor_alternates` table stores the data as jsonb columns: `real_decision` (jsonb) and `alternate_decision` (jsonb), each with a `confidence` key inside the JSON object. Confidence values must be extracted via `(real_decision->>'confidence')::numeric`.

**Fix:** Commit `cdbd2a04b` corrected the SQL extraction:
```sql
AVG(
  COALESCE((real_decision->>'confidence')::numeric, 0)
  - COALESCE((alternate_decision->>'confidence')::numeric, 0)
)::text AS avg_shift
```

**Subsequent rev2 (`b9a1cdd4e`) sidesteps the issue entirely** by deleting the custom xstocks-side query and reusing the shared `computeFactorCalibration` aggregator (which already had the correct jsonb extraction at `drift-dashboard-aggregator.ts:1048`). The reusable-aggregator path is the right pattern.

**Standing rule (added to `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Section M caveats):** Always run `psql \d <table>` on staging before writing aggregator SQL. Do not assume column shape from naming convention. Prefer reusing an existing shared aggregator over duplicating the SQL — duplicate SQL gets the schema wrong; the original is already correct.

**Files:** `server/routes.ts` (hotfix `cdbd2a04b`); subsequently rewritten in `b9a1cdd4e`.

---

## INFRA-2026-05-10-A — Asset-class collision backfill (4862 rows, signal_eval_archive)

**Trigger:** B79.0f resolver disambiguation surfaced historical mis-tagging for ticker-collision symbols (Sun Communities SUI equity vs Sui Network SUI crypto; analogous for BDX/CVX/DASH/EDU/MET/OPEN/PEP/T). Pre-B79 the resolver returned crypto_spot for these tickers; B79 ship 2026-05-07 21:51 UTC populated `XSTOCK_SPOT_SYMBOLS` and the `XSTOCK_SPOT_SYMBOLS.has(symbol)` fast-path started preferring xstock_spot for collision tickers on regular `kraken` exchange.

**Audit (2026-05-10):**
- signal_eval_archive: 4862 mis-tagged rows
  - DASH/USD: 337 (first 2026-05-07 21:55 UTC, last 2026-05-10 00:17 UTC)
  - MET/USD:  1598 (first 2026-05-07 21:53 UTC, last 2026-05-09 22:21 UTC)
  - OPEN/USD: 44   (first 2026-05-08 15:02 UTC, last 2026-05-09 03:09 UTC)
  - SUI/USD:  2883 (first 2026-05-07 21:51 UTC, last 2026-05-10 00:18 UTC)
- trading_signals: 0
- regime_factor_alternates: 0
- exit_strategy_alternates: 0
- paper_sim_trades: 0

**Backfill applied 2026-05-10 (`scripts/b79-0f-collision-backfill.sql`):** single UPDATE flipped all 4862 rows xstock_spot → crypto_spot. Verification SELECT post-UPDATE returns 0 mis-tagged.

**Standing rule:** quarterly re-audit of `XSTOCK_SPOT_KRAKEN_COLLISIONS` against Kraken `/0/public/AssetPairs` (calendar trigger in MULTI_ASSET_VTS_EXPANSION_PLAN.md §10c.X). Kraken adds tokens regularly; new collisions can emerge.

**Paper-trail per Langston rev 2 #5:** per-table row counts above + commit reference (`e6fd7350f`).

---

## INFRA-2026-05-09-E — Kraken WS-equities silent on weekends (incl. 24/7 names)

**Trigger:** B79.0c WS probe pre-ship 2026-05-09 22:30 UTC. Subscribed to `wss://ws-equities.kraken.com` ticker+ohlc channels for all 10 Kraken Phase-1 24/7 names (TSLA, AAPL, SPY, QQQ, GLD, GOOGL, HOOD, MSTR, NVDA, CRCL — `BASExUSD` form). 60-second window returned 201 messages but ZERO ticker / ZERO OHLC. CLOSE 1006 (abnormal closure) at end of window. Pre-test DB freshness: `equity_spot_ticker_snap` last write 2026-05-09 11:12 UTC (10h+ stale); `equity_spot_ohlc_1m` last write 2026-05-09 00:15 UTC (22h+ stale). Concurrent flows healthy: `crypto_spot` 8/cycle, `xstock_perp` 38/cycle.

**Root cause (hypothesis):** Kraken WS-equities feed sends WS-protocol heartbeats + subscribe-acks but no actual ticker/OHLC data on weekends, regardless of the 24/7 trading marker on the 10 Phase-1 names. The exchange's matching engine accepts trades on these names 24/7, but the public WS data feed appears to be ARCA-aligned. Post-deploy verification observed a single tick burst per name on WS reconnect (post-restart), then silence — consistent with the same hypothesis.

**B79.0c shipped:** the per-symbol predicate + scanner universe-filter (system handles 24/7 names CORRECTLY when WS data resumes). What B79.0c did NOT do: unblock the upstream feed. Until Kraken's feed is investigated/fixed/replaced, the 10 24/7 names will be functionally stale during weekends just like the other 265 names (freshness gate rejects after 90s).

**Follow-up (RUNNING_ISSUES #89, B79.x candidate):** investigate alternative paths — (a) Kraken Pro account credentials may unlock a different feed-tier; (b) REST polling fallback (mirror B74's Kraken Futures REST pattern using equities REST endpoint if it exists); (c) direct probe to Kraken support/docs.

**Standing rule:** completion reports for any sub-batch claiming "asset class X live" must verify with post-deploy DB query showing fresh ticks for the actual symbol set. Don't infer live-data status from "WS connected" alone — connection != data flow.

---

## INFRA-2026-05-09-A — Langston bridge "Session ID already in use" (UUID rotation)

**Trigger:** Kyle messaged `@LangstonDTBot` (DM + topic 21 mentions); bridge daemon replied with `Error: Session ID 128e2dff-12d9-481c-b6cb-89e352c106eb is already in use` instead of Langston's actual response. Visible in screenshots 2026-05-09 ~11:46 UTC.

**Root cause:** Earlier in 2026-05-09 work, my CC watchdog calls used the canonical Langston session UUID `128e2dff-...` which wrote to `~/.claude/projects/-home-langston/128e2dff-12d9-481c-b6cb-89e352c106eb.jsonl`. The claude-cli's session-lock check sees that file, treats the session as "in use," and refuses to start a new instance — even after the prior process exited cleanly. Bridge daemon caught the error, posted it back to Telegram as Langston's "reply."

**Fix (live on Hetzner; permission-only change, no code commit):**
- Generated fresh UUID via `python3 -c "import uuid; print(uuid.uuid4())"` → `f8dd5e4c-a381-44c4-b8ab-183eec0517e8`
- Updated `/home/langston/.langston-bridge-state.json` `session_id` field
- `systemctl restart langston-bridge` — daemon picks up new UUID
- PING test: 5s roundtrip success

**Standing rule (added to `CLAUDE.md` §6.5 and `MEMORY.md` invariants on next pass):** CC's watchdog calls MUST use FRESH per-call UUIDs (already the design, but the bridge state's canonical UUID was being reused once for context-persistence). NEVER pass Langston's bridge canonical UUID to a CC-side call — it locks the session-state file and the bridge can't recover until rotation.

**Lesson:** the claude-cli's "session-already-in-use" check is permanent until the session-state file is moved/deleted. There is no graceful timeout. Treat session UUIDs as exclusive-write locks.

---

## INFRA-2026-05-09-B — `/var/log/cc-bridge-inbox.jsonl` permission denied (langston user mirror writes)

**Trigger:** Earlier today's investigation noticed `langston-bridge.log` showing `mirror write failed: [Errno 13] Permission denied: '/var/log/cc-bridge-inbox.jsonl'` after every Langston handle. CC could see Kyle's inbound messages (cc-comms-bridge wrote them as root) but NEVER saw Langston's outbound or my own CC outbound — those mirrors were silently dropped.

**Root cause:** `/var/log/cc-bridge-inbox.jsonl` was created by `cc-comms-bridge.service` running as root → file mode 644 root:root. The `langston-bridge.service` runs as user `langston` and tried to append mirror lines → EACCES.

**Fix (live on Hetzner):**
- `chgrp langston /var/log/cc-bridge-inbox.jsonl`
- `chmod g+w` → mode 664 root:langston
- Both daemons can now append; verified via subsequent outbound mirrors landing in the log

**Standing rule:** when adding a new bridge daemon that writes to a shared log, ensure the log file's group is set to a group both users belong to (or grant write via ACL). Document the expected file mode in the bridge's source-controlled script.

---

## INFRA-2026-05-09-C — `cc-comms-bridge.py` missing auto-ACK (OpenClaw-era feature regression)

**Trigger:** Kyle's UX report 2026-05-09 ~22:00 UTC: "the CCDT communicator was supposed to copy and paste all messages that I sent in the group into your inbox so that you knew about them... and when he did that, he would always leave a quick message saying, I've received this message and I'm pasting it into the inbox."

**Root cause:** OpenClaw (decommissioned 2026-05-06 per CLAUDE.md §8.1) had an auto-ACK behavior on inbound messages. When migrating to the Python `cc-comms-bridge.py`, the inbox-log-write logic was carried over but the auto-ACK reply logic was NOT. Silent feature regression — Kyle's messages were captured but he received zero UX confirmation.

**Fix (committed to repo at `Claude Comms and Packages/comms-infra/cc-comms-bridge.py`; live on Hetzner via scp + systemctl restart):**
- Added auto-ACK call after `append_inbox(entry)` in the poll loop. Reply text: `"✅ Logged (msg <id>) — CC will see this at next session start. For real-time, use the Claude Desktop conversation."`
- Skips bot messages (`entry["sender_is_bot"]`) so we don't loop on CCDTCommsBot's own outbound or LangstonDTBot's responses
- Topic-21 fallback: if the originating thread is bot-locked (e.g. Telegram returns 400 `TOPIC_CLOSED` for forum supergroup `# General` topic), the ACK falls back to topic 21 (Batch Implementations) with a reference back to the original chat/thread. Guarantees Kyle gets an ACK SOMEWHERE.

**Verification:** Kyle re-tested in topic 21 (msg 3756 → CCDTCommsBot ACK msg 3757 → Langston response "Yes, receiving you loud and clear" landed). End-to-end working.

**Standing rule (codify in CLAUDE.md §6.6 next governance pass):** any bridge daemon migration MUST preserve user-facing UX behaviors of the predecessor. Auto-ACK is part of the comms-infra contract Kyle relies on; future migrations test for it before decommissioning.

---

## INFRA-2026-05-09-D — `# General` topic in forum supergroup blocks bot replies (TOPIC_CLOSED)

**Trigger:** First auto-ACK patch (INFRA-2026-05-09-C above) initially failed for messages sent in the `# General` topic of the Dawn Trader HQ supergroup. Telegram returned `400 Bad Request: TOPIC_CLOSED`. Kyle's first re-test failed silently because the ACK couldn't post.

**Root cause:** Telegram forum supergroups have a special pseudo-topic `# General` (the default thread). Admins can lock it to bot replies. In Dawn Trader HQ, `# General` is admin-locked; bots can READ but not POST.

**Fix (folded into INFRA-2026-05-09-C patch via topic-21 fallback):** ACK code attempts the originating thread first; on any 400 (TOPIC_CLOSED or otherwise) for supergroup chats, falls back to topic 21 with a reference link back to the original message. Verified working on Kyle's re-test.

**Lesson:** when implementing a bot reply that mirrors arbitrary inbound, never assume bot has write permission in the originating thread of a forum supergroup. Always have a known-good fallback channel.

---

## INFRA-2026-05-08-A — B79.0a column-name bug (last vs. price)

**Trigger:** First load-test run on staging (post-B79.0a Step 3 push) returned `error: column "price" does not exist`. Surfaced during process-gap backfill (deploy had pre-empted the load-test gate per Langston Step 4 #1).

**Root cause:** B79.0a scanner.ts + Q-D probe + load test all wrote `SELECT … price::text AS price` against `equity_spot_ticker_snap`. Schema has NO `price` column — the price field is `last numeric(20,8)`. Initial draft was authored from memory of crypto-spot ticker tables which use `price`; B69+ equity-spot schema uses `last`.

**Fix (commit `11b7ab0ff`):** all 3 query sites updated to `last::text AS price` (alias preserves the contract for callers iterating `row.price`).

**Lesson:** when authoring queries against unfamiliar schemas, run `\d <table>` FIRST. Memory-from-pattern is the trap.

---

## INFRA-2026-05-08-B — B79.0a drizzle PG-array binding (literal IN-list)

**Trigger:** Post column-fix, load test surfaced `error: op ANY/ALL (array) requires array on right side` and then `cannot cast type record to text[]` when attempting `${symbolList}::text[]`.

**Root cause:** Drizzle's `sql` template tag interpolates JS arrays as positional parameter tuples, not as PostgreSQL `text[]` arrays. Casting `${symbolList}::text[]` doesn't help because the inner shape is still a record.

**Fix (commit `7ec3aa4ef`):** literal IN-list with `sql.raw` injection. `XSTOCK_SPOT_SYMBOLS` is a hardcoded `const Set` (not user input) so injection is safe.

**Lesson:** drizzle's `sql` template ≠ pg-pool's parameter binding. For multi-element arrays in raw SQL, use the literal-list-with-escaping pattern OR drizzle's query-builder `inArray()` operator (not both).

---

## INFRA-2026-05-08-C — B79.0a statement timeout on 13-partition table (5-min recency constraint)

**Trigger:** Post array-binding fix, load test threw `canceling statement due to statement timeout` on every cycle. Query had to scan 13 monthly partitions of `equity_spot_ticker_snap` for the latest tick across 265 symbols.

**Root cause:** `SELECT DISTINCT ON (symbol) … ORDER BY symbol, captured_at DESC` against the partitioned table planned a multi-partition scan that exceeded the default 15s `statement_timeout`.

**Fix (commit `f27fb5b63`):** added `WHERE captured_at > NOW() - INTERVAL '5 minutes'` recency constraint. Reduces the partition-scan horizon to the most-recent partition (13 → 1) and lets the per-partition index handle the per-symbol latest-row lookup. Post-fix load test: 20-cycle run with steady-state ~72ms / cycle (DECISION: SHIP).

**Why 5 minutes:** the freshness gate (`isPairDataFresh`) rejects anything > 90s old, so any tick older than ~5min is already stale by definition. 5min covers any reasonable future freshness ceiling B79.x calibration might pick.

**Lesson:** partition-pruning is a planner heuristic that needs an explicit time bound on the partition key. `DISTINCT ON` without recency constraint defeats partition pruning.

---

## INFRA-2026-05-08-D — B79.0a hostile-sim staging-override (HOSTILE_SIM_OVERRIDE)

**Trigger:** Step 7+8 hostile-sim verify on staging hit `[HOSTILE_SIM_BLOCKED]` because Langston's Q5 design checked `NODE_ENV !== 'production'` — staging uses `NODE_ENV=production` for parity with real prod. The double-flag goal (prevent accidental enablement in prod) was sound but had no escape hatch for staging tests.

**Fix (commit `ef77f7374`):** added `HOSTILE_SIM_OVERRIDE=1` second flag. Activation requires BOTH `BACKPRESSURE_TEST_MODE=1` AND `(NODE_ENV !== 'production' OR HOSTILE_SIM_OVERRIDE=1)`. The double-flag preserves the prod-safety intent: a single env-var leak still can't enable the test in real production.

**Activation contract (per Langston Step 8 #2 — capture in ops doc):**
- **Real production:** never set either flag. Verify via `[HOSTILE_SIM_ACTIVE]` log absence.
- **Staging (NODE_ENV=production for parity):** set both `BACKPRESSURE_TEST_MODE=1` AND `HOSTILE_SIM_OVERRIDE=1`. Confirm `[HOSTILE_SIM_ACTIVE]` log fires at boot. Unset both + restart to disable.
- **Dev (NODE_ENV != production):** `BACKPRESSURE_TEST_MODE=1` alone is sufficient.

**Behavioral verify post-deploy 2026-05-08:**
- `[HOSTILE_SIM_ACTIVE]` log fired at 21:53:44.
- `[B79.0a][SCAN_CYCLE_DONE] tick=60 duration_ms=28074` — cycle ran the artificial 28s sleep + ~74ms DB round-trip; total stayed under the 30s tick anchor (no skip per Langston Step 4 #2 design).
- `[B79.0a][BACKPRESSURE_OBSERVED] tick=30 duration_ms=28143 exceeded 25s budget …` fired on every cycle as designed.
- Cycles continued emitting (verified `tick=30` and `tick=60` both completed); no skipping per `#81` policy.

---

## INFRA-2026-05-07-E — B78.2 Kraken WS v1→v2 format fix (RUNNING_ISSUES #76 RESOLVED) (SHIPPED 2026-05-07)

**Trigger:** RUNNING_ISSUES #76 surfaced during B78.1 behavioral verify — kraken-websocket-adapter has been generating "Method(s) not found" rejection log lines every ~21s since 2026-04-03 (49,175 health-checks all reporting "Subscribed Symbols: 0"; 142,079 historical rejection lines). System silently functioning via B74 archivers + REST fallback. Per Langston Step-8 sequencing call (B78.1): B78.2 must precede B79 Day 0.

**Investigation path (instructive):**
1. Initial scope assumed `subscribeToBookChannel` at L2292 (only v1-format `{event:'subscribe', pair, subscription:{name,depth}}` site found via grep) was the failing path. Risk #4 in scope §4 pre-emptively flagged: "if errors continue at same rate, issue is elsewhere."
2. Initial deploy `5c3ce00b3` (L2292 v1→v2 fix). Error stream **continued unchanged**. Risk #4 materialized.
3. Diagnosis: error cadence `~21s` ≈ matched `PING_INACTIVITY_MS = 20000` exactly. Source identified as ping at L2767 (`{event:'ping'}` v1 envelope). The v2 endpoint's generic rejection echo uses `method:"subscribe"` label regardless of intended method (Kraken default), which had misled the initial scope.
4. Hotfix `5ec57cbd3` (L2767 ping v1→v2). Error stream STOPPED at deploy boundary.

**Shipped (commits `5c3ce00b3` + `5ec57cbd3`; PM2 #182 → #183):**
- `server/exchanges/kraken/kraken-websocket-adapter.ts:2292-2299` — `subscribeToBookChannel` v1→v2 (`{event:'subscribe', pair:[krakenPair], subscription:{name:'book', depth:1}}` → `{method:'subscribe', params:{channel:'book', symbol:[krakenPair], depth:1}}`). Latent bug; would have surfaced when channel-switch path activated.
- `server/exchanges/kraken/kraken-websocket-adapter.ts:2767` — keep-alive ping v1→v2 (`{event:'ping'}` → `{method:'ping'}` per [Kraken WS v2 ping spec](https://docs.kraken.com/api/docs/websocket-v2/ping)). **The actual root cause** — fired every 20s for 5 weeks generating ~142K rejection log lines.

**Behavioral verify post-deploy:**
- Last v1-rejection error: 14:16:48 UTC (pre-deploy)
- First v2-format ping accepted: 14:20:09 UTC (post-deploy)
- Zero "Method(s) not found" since deploy
- v2 pings flowing every 20s as expected: `[8.8.5][PING] Sent keep-alive ping (v2 format)`
- No-touch fence healthy throughout (27-28/factor/hr crypto_spot)
- B78.1 wiring + EventEmitter inversion unaffected (markers logged, getter bound)

**"Subscribed Symbols: 0" REFRAMED as NOT-A-BUG:** SQL query confirmed `paper_sim_open_positions` is empty on staging. The I8C subscribe path (`i8cSubscribeAllOpenPositions`) is position-gated by design — with 0 open positions, no subscriptions are needed. When positions open, B78.1's EventEmitter wiring will exercise the path naturally and `priceTickEventsPerMinute > 0` will follow. **This was Risk #4 secondary case; reframed correctly to remove the apparent symptom from #76's scope. No B78.3 needed.**

**Langston review trail (compressed workflow per scope §7):**
- Step-1+2 combined: APPROVED rev 1 in ~2m45s via watchdog. Risk #4 honestly named in scope; reviewer noted "that's the right disclosure."
- Step-4 folded into Step-8 per scope decision (8-line block; equivalence verified against working in-file paths + Kraken docs).
- Step-8: APPROVED to close in 25 SECONDS via watchdog. Three pre-close items: (1) ≥1hr clean-log window (deferred to T+24h forward-watch alongside #74), (2) governance bundle (this entry), (3) #76 closure cites Kraken WS v2 ping spec (cited inline above).

**Watchdog `langston-call` validated under load:** 3 round-trips for B78.2 with 35s/2m45s/25s response times (vs prior-path 22-min hang on B78.1 Step-1+2 first attempt). Hang-rate observability now persistent at `/var/log/langston-call.log`.

**Lessons:**
1. **Kraken's v2 generic rejection echo uses `method:"subscribe"` label regardless of intended method.** The error response shape misled initial diagnosis — we assumed the failing message had `method:"subscribe"` in its request, when actually any unrecognized envelope (including v1 ping) gets that response. **Future:** when Kraken v2 returns "Method(s) not found", do NOT assume the failing send was a subscribe. Consider all v1-format senders in the file.
2. **Risk #4 honesty paid off.** The scope explicitly named "fix doesn't resolve the failures because the actual sender is a different path I haven't found" as a medium-likelihood risk. When that materialized post-deploy, the response was "diagnose deeper, hotfix in same batch" rather than "scope creep into B78.3." Outcome: same-batch resolution in ~30 min.
3. **Compressed workflow accelerates surgical fixes.** B78.2 Step-1+2 + Step-8 combined ran in ~3 minutes total review time via watchdog. The full 11-step workflow is calibrated for higher-risk batches; surgical fixes can compress safely when risk register honestly captures the failure modes.
4. **Behavioral verify must define "success" precisely.** Initial scope's success criterion was `priceTickEventsPerMinute > 0`. Post-fix that stayed at 0 — but for a CORRECT reason (no positions to subscribe). The "fix the noise" goal was satisfied; the "make ticks flow" goal was misframed (it's gated on a different system state). **Future:** when defining behavioral verify, separate "fix the symptom" from "exercise the new path" — they're independent.

---

## INFRA-2026-05-07-D — B78.1 Cycle break + watchdog + RUNNING_ISSUES #76 discovery (SHIPPED 2026-05-07)

**Trigger:** Kyle no-deferrals directive 2026-05-07 evening — address all 3 B78 deferrals via named batches. B78.1 = cycle break (own batch because data-feed surgery doesn't fit B79 asset-class population).

**Shipped (commits `bcbea1896` + 2 hotfixes `ee7c8dc3e` + `fb9a58667`; PM2 #181):**
- **EventEmitter inversion** of `kraken-websocket-adapter ↔ live-pricing-adapter` (madge cycle #10 of 47, present since at least 2026-04-03 per log archaeology). ws-adapter `extends EventEmitter`, emits `priceTick` events at 3 sites (replacing `livePricingAdapter.updateFromWebSocket(...)` calls). Trading-mode label resolved via injected getter (`bindTradingModeGetter`); warns ONCE if unbound (per CLAUDE.md §8.10 no-silent-fallbacks). live-pricing-adapter at module-load registers `krakenWebSocketAdapter.on('priceTick', updateFromWebSocket)` + `bindTradingModeGetter(() => getTradingMode())`. Reverse direction (live-pricing → ws-adapter for `incrementRestFallback*`) STAYS — that was the kept import direction; not a cycle anymore.
- **ws-adapter moved** from `server/services/kraken-websocket-adapter.ts` to `server/exchanges/kraken/kraken-websocket-adapter.ts` (the original B78 plan, now safely possible). Internal imports re-pathed (one level deeper from new location).
- **8 caller files updated** to new import path: `server/index.ts`, `server/routes.ts`, `server/services/live-pricing-adapter.ts`, `server/services/paper-execution-engine.ts`, `server/services/paper-session-reset.ts`, `server/services/paper-sim-service.ts`, `server/services/verification-test-protocol.ts`, `server/services/monitoring/mini-book-integrity-monitor.ts`.
- **NEW priceTickEventsPerMinute metric** — `[B78.1][WS_TICK_RATE]` log line every 60s reporting tick emission rate. Future regression detection without log archaeology.
- **NEW infrastructure: watchdog `langston-call`** — `/usr/local/bin/langston-call` on Hetzner. Auto-detects API hangs (60s first-byte / 30s idle / 5 max attempts; fresh UUID per attempt). Brought Step-8 review latency from 22-min hang → 35-sec success. Source archived at `Claude Comms and Packages/Langston/langston-call.sh`. Logs every attempt to `/var/log/langston-call.log` for hang-rate observability.

**Hotfix history within B78.1 close window:**
- `ee7c8dc3e` — fix 2 dynamic-import paths missed by sed (L1736 + L2455). Static `import { } from '...'` lines were updated by sed but `await import('...')` dynamic imports use a different syntax shape and the sed pattern didn't catch them.
- `fb9a58667` — fix remaining 2 dynamic kraken-symbol-resolver imports (L1813 + L1967). Edit's default replace-once mode silently fixed one when there were two on different sites.

**Madge HARD GATE (per Langston rev 1 tightened acceptance):** 47 → 46 cycles. Cycle #10 ABSENT from list. Strict-`<47` criterion met. Baseline saved at `Claude Comms and Packages/Change Lists/BATCH_78_1_MADGE_POSTMOVE.txt`.

**Behavioral verify post-deploy:** B78.1 wiring exercised live in PM2 logs:
- `[B78.1][WS_ADAPTER] tradingMode getter bound by consumer` ✓
- `[B78.1][PRICING] subscribed to ws-adapter priceTick events + bound tradingMode getter` ✓
- `[B78.1][WS_TICK_RATE] priceTickEventsPerMinute=0` firing every 60s ✓
- NO warn-once spam (getter bound successfully)
- HTTP 200, ablation cadence 25/factor/hr on crypto_spot (healthy, B78 baseline)
- No-touch fence holds.

**NEW DISCOVERY filed as RUNNING_ISSUES #76 — pre-existing kraken-websocket-adapter subscribe failure (5+ weeks old, surfaced during B78.1 behavioral verify):**
- `priceTickEventsPerMinute=0` reflects an upstream Kraken WS subscribe bug, NOT a B78.1 regression.
- Evidence: 49,175 PM2 health-check log lines all show "Subscribed Symbols: 0"; 142,079 historical "[I7-WS-RAW] Method(s) not found" subscribe-rejection lines; first such error at **2026-04-03 07:01:34** (~5 weeks before B78.1).
- System functions because B74 passive archivers (separate WS connections) carry their own data and `live-pricing-adapter.fetchFromKrakenRest` REST fallback fills price gaps for top-tier pairs. VTS evaluation continues via REST + B74 paths.
- **B78.2 owns the fix** (per Langston Step-8 sequencing call) — must precede B79 Day 0 because (a) without flowing ticks B78.1 inversion isn't end-to-end-validated, (b) stacking xstock_spot on a broken WS path adds confounding variables. ETA 1-2hr; Kraken WS v2 protocol likely changed the `subscribe` method format; targeted message-shape fix.

**Langston review trail (new watchdog path):**
- Step-1+2 rev 1: REVISE with 2 minor revisions (warn-once on unbound mode getter; tighten madge gate to strictly <47; ±20% with 8/10 pair floor; add priceTickEventsPerMinute metric). Initial Step-1+2 invocation hung at 22min — strace evidence showed pure epoll wait, zero file reads on staged content. Killed; retried with lean prompt + watchdog scaffold; came back in 5min.
- Step-1+2 rev 2: APPROVED via watchdog.
- Step-4 (combined into Step-8 since the diff is mechanical and re-export-shim-free per B78 precedent): no separate code review.
- Step-8: **APPROVED to close** in 35s via watchdog. Sequencing call: B78.2 must PRECEDE B79 Day 0 (not parallel) — at 1-2hr it won't materially delay B79; xstock_spot on broken WS path adds confounding variables.

**Lessons logged:**
1. **Pre-flight grep for moves needs both static AND dynamic import patterns.** Static `import { } from '...'` and `await import('...')` use different syntax shapes; sed pattern that matches one misses the other. Future modularization batches grep BOTH `import\(.*\)from` AND `await import\(` separately.
2. **Watchdog scaffolds for AI-as-oracle workflows pay back fast.** ~30 min build cost recovered immediately on the first prevented hang. The OpenClaw architecture was effectively this pattern (single-turn oracle, no agentic loop overhead); we re-discovered why that shape works for review tasks.
3. **Behavioral verify can surface pre-existing bugs.** Without B78.1's `[WS_TICK_RATE]` metric we'd never have noticed the 5-week-old WS subscribe failure — it was masked by REST fallback graceful degradation. The metric paid for itself on its first day of life.
4. **Edit tool replace_all=false is silent on multi-match.** Future grep-then-Edit workflows on multiple-occurrence strings should use replace_all=true OR add unique context to the old_string. The 2nd hotfix in B78.1 was caused by this gotcha.

---

## INFRA-2026-05-07-B — B78 Modularization Phase: asset-class + exchange extraction (SHIPPED 2026-05-07)

**Trigger:** Kyle directive 2026-05-07 — skip Phase 16 cleanup; use the 8-day observational window (until 2026-05-15) to ship B78 (Modularization) + B79 (xstock_spot) + B80 (crypto_perp) + B81 (RTB ranking parity). B78 is the structural prerequisite — without it, B79/B80 would shoehorn new asset-class logic into crypto-shaped files. Pre-existing modularization driver: synthesis doc `Claude Comms and Packages/Scope Files/MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` Part II + Part V (asset_class + exchange + filter as orthogonal dimensions in the resolution hierarchy).

**Critical contract:** ZERO behavioral change on `asset_class='crypto_spot'`. Pure file/import refactor + one aggregator-query scope filter. No-touch fence on crypto_spot calibration windows (per Kyle directive: B67.5 consumer-wiring window opens 2026-05-15; until then no threshold/factor-chain/regime-classifier-math changes for crypto_spot).

**Shipped (commits `e814461d6` initial + `57220ab4b` hotfix):**
- **Created module scaffolding:** `server/asset_classes/{crypto_spot,crypto_perp,xstock_spot}/{pattern-pool-filters,regime-thresholds,friction,index}.ts` (12 files; crypto_perp and xstock_spot get `NotImplementedError` placeholders for B79/B80 population). `server/exchanges/kraken/` directory.
- **Moved kraken cohort:** `server/services/kraken.ts`, `kraken-pair-metadata-service.ts`, `kraken-data-documenter.ts` → `server/exchanges/kraken/` (git renames, history preserved).
- **Moved + renamed pattern-filter-profile:** `server/config/pattern-filter-profile.ts` → `server/asset_classes/crypto_spot/pattern-pool-filters.ts` (specific filename leaves room for future `regime-filters.ts`, `liquidity-filters.ts`, `market-hours-filter.ts` per Synthesis §3.3 first-class filter family — not yet promoted to first-class `module_name='filter:X'` rows; deferred past B81).
- **Extracted regime-classifier branch-condition constants** into `server/asset_classes/crypto_spot/regime-thresholds.ts` (leaf module — `// NO IMPORTS ALLOWED` invariant). 14 named exports: RBS_VOL_MAX/RBS_DX_MAX/RBS_DBS_MAX, IE_VOL_MIN_PATH_A/IE_DX_MIN_PATH_A/IE_VOL_MIN_PATH_B/IE_DBS_STRONG, TFS_MOM_MIN_PATH_A/TFS_DX_MIN/TFS_DBS_MODERATE, HVU_VOL_MIN/HVU_MOM_NEG_PATH_A/HVU_DX_STRONG/HVU_MOM_NEG_PATH_B. **Threshold-vs-formula trap respected:** literals `0.012`, `0.015` (×2), `0.45` appear in BOTH branch CONDITIONS and confidence FORMULAS — only branch-condition instances replaced; formula-anchor instances preserved inline (Langston Step-4 confirmed verified per-line replace-vs-stay sites; e.g. `0.012` at line 200 (branch) → `RBS_VOL_MAX`, but `0.012` at line ~216 in `0.75 + (0.012 - vol) * 12` STAYS).
- **Aggregator scope filter:** `server/services/drift-dashboard-aggregator.ts` `computeFactorCalibration` query at L1054 gets `AND asset_class = 'crypto_spot'` — locks calibration cohort to crypto_spot regardless of B79+ xstock/perp data accumulation. B76 chain-final filter at L504 untouched.
- **Updated 24 caller import paths** across `server/services/`, `server/services/market-data/`, `server/services/monitoring/`, `server/scripts/`, `server/index.ts`, `server/routes.ts`, `server/startup/portfolio-initializer.ts`, `server/core/filters/signal_quality_evaluator.ts`, `server/core/metrics/cost-metrics.ts`. Initial commit missed 23 intra-services callers (pre-flight grep used pattern `(\\.\\.?/)+services/kraken` which doesn't match bare `./kraken[.js]`); hotfix added them.

**Deferred per Langston rev 1 review:**
- **`kraken-websocket-adapter.ts` move** — `madge --circular` confirmed bidirectional cycle with `live-pricing-adapter.ts` (cycle #10 of 47). Currently masked because both intra-package in `server/services/`. The B78 move would have converted it into a cross-package cycle (Vite production build at risk). Cycle break gets its own dedicated batch where DI inversion is the explicit objective, not a side-effect of a directory move.
- **Per-pair friction extraction** — `cost-model.ts` is at `server/core/math/` (not `server/utils/` as scope rev 1 claimed) and imports cross-cutting defaults from `server/config/exchange-defaults.ts`. Both are exchange-keyed not asset-class-keyed; extracting now would invert the resolution hierarchy (`exchange` is more specific than `asset_class` per Synthesis §3.2). B79 and B80 will introduce per-asset-class friction modules when xstock_spot/crypto_perp friction shape becomes real.

**Madge HARD GATE (Langston §D item 5):** baseline 47 cycles captured pre-move (`Claude Comms and Packages/Change Lists/BATCH_78_MADGE_BASELINE.txt`); post-move 47 cycles, zero diff in cycle list. No new cross-package cycles introduced.

**Re-export shims** at old paths exist in working tree (deprecation comments noting B81 removal) but were not committed — all 24 callers updated to new paths so functionally unused. Langston Step-4 cleared "no shims acceptable, CI build is the gate." See RUNNING_ISSUES #73 for B81 cleanup tracking.

**B74 file misattribution:** scope listed `kraken-futures-*` movable but no such file exists on disk. B74 work is at `server/services/passive-archive/equity-perp-archiver.ts` — different cohort, naming convention, and module boundary. Not moved.

**Langston review trail (4 rounds total — same-session caching kept latency minutes per round once Step-1+2 baseline loaded):**
- Step-1+2 combined (scope + import-graph delegated cycle audit): **REVISE rev 1** with 6 items (ws-adapter cycle defer, friction defer, risk row #6, pattern-pool-filters rename, madge HARD GATE, threshold-vs-formula trap table); **REVISE rev 2** (2 propagation misses A+B — naming unification across all 3 sections + stale cost-model row); **REVISE rev 3** (line 69 brace-expansion + footer rev/status); **APPROVED rev 4**.
- Step-4 code review (full diff + new files + repo-wide grep for stale old-path references): **APPROVED**, no revisions. Confirmed (a) per-line trap-table replace sites correct, (b) zero residual grep, (c) crypto_spot/regime-thresholds.ts is leaf, (d) aggregator filter at the L1054 query (not L504), (e) placeholder scaffolds inert (no throw on import), (f) crypto_spot/index.ts re-exports the 3 submodules.
- Step-8 second-pass verify: TBD post-deploy.

**CI gate (run `25491625912` on hotfix):** Build ✓, Docker Build ✓, Test Suite identical to baseline (59 failed / 995 passed / 5 skipped from 1059 — same exact counts as B77 close), TypeScript Check pre-existing legacy. Per Kyle directive: Build+Docker+Test green = clear to deploy. Confirmed.

**Live verify (post-deploy):** PM2 restart #180 at ~22:58 UTC. Clean boot; HTTP 200; PM2 errors are pre-existing noise only (EACCES /home/runner from MarketDataHealthCheck + ethical-reasoner audit-trail warnings — both pre-date B78). Post-deploy no-touch fence SQL: 10 factors arriving on `asset_class='crypto_spot'` (2/factor at ~12min into 1h window — recovers as window fills). 24-48h forward-watch tracked at RUNNING_ISSUES #74.

**Enables B79 (xstock_spot — Days 4-5)** to populate `server/asset_classes/xstock_spot/*` with weekend-pause logic (24/5 calendar), threshold derivation (3-layer: domain-knowledge → cross-asset shadow-classify → 48-72h shadow-mode VTS), strategy gate audit (some strategies don't apply to equity microstructure), SQE asset-class threshold rows, friction model. **Enables B80 (crypto_perp — Days 5-6)** to populate `server/asset_classes/crypto_perp/*` with funding-rate per-pair extension to macro modifier (B67.1).

**Lesson — pre-flight grep precision matters.** The pre-flight caller-fan-out grep used `(\\.\\.?/)+services/kraken` which only matches `services/kraken*` patterns (e.g. callers in `server/scripts/` using `../services/kraken`). Intra-services callers using bare `./kraken` or `./kraken.js` were missed. The CI Build job caught this (would have crashed at runtime); but a tighter pre-flight pattern (`['"](\\.\\.?/)+kraken(?:\\.|$|['"])`) would have caught all 24 callers in one pass. Future modularization batches should use the broader pattern.

**Lesson — scope contradictions surface after multiple revisions.** B78 went 4 review rounds, each catching a real propagation/contradiction miss I owned: (1) ws-adapter cycle, (2) cost-model path + naming inconsistency between §2 #1 / §2 #3 / §5, (3) line 69 brace expansion still using rejected name, (4) footer rev label stale. Lesson: after each revision, search-and-replace ALL instances of the changed concept, not just the section the reviewer pointed at. Same-name strings in scope docs can drift across sections invisibly.

---

## OPS-2026-05-07-A — B77 `isBreakEvenTriggered` no-op fix (RESOLVED 2026-05-07)

**Trigger:** RUNNING_ISSUES #71 — `break_even_trigger_r` `module_constants` row plumbed through `TrailingExitConfig` + `TECExitDecision.resolvedConstants` for diagnostics since B65.1 but **never consulted by runtime**. `isBreakEvenTriggered(currentPrice, entryPrice, ATR)` in `server/utils/analysis-utils.ts:357-364` hardcoded `gain >= ATR` (1×ATR exactly). The constant has been a silent no-op for ~2 weeks. Surfaced during B75 close variant-K implementation. Variant K (`break_even_enabled=false`) keeps BE off in production today, so there's no live trader-impacting bug — but #71 had to close before any future BE re-enable to avoid silent miscalibration on non-1.0 trigger thresholds.

Kyle directive 2026-05-06: "I'd like issue 71 fixed so it works as intended either as a part of B76 or just after, otherwise we forget about it." Standalone batch per Langston single-purpose discipline.

**Fix shipped (commit `ee7522b4d`):** Threaded `breakEvenTriggerR: number = 1.0` 4th argument explicitly through `isBreakEvenTriggered`. Gate becomes `gain >= ATR * breakEvenTriggerR`. Default 1.0 preserves pre-B77 behavior for any caller that omits the argument. Single live caller `trailing-exit-controller.ts:451` updated to pass `cachedConfig.breakEvenTriggerR` (already DB-governed via `pick('break_even_trigger_r', TEC_DEFAULTS.breakEvenTriggerR)` at L111 — no new wiring needed; Langston Step-8 nit on B76 confirmed). Console log line updated to print actual multiplier value (was hardcoded "1×ATR gain").

**Tests:** 3 new cases in `server/tests/unit/trailing-exit.test.ts` cover (a) multiplier > 1.0 (1.5×ATR threshold; gain=3 against ATR=2 triggers; gain=2.99 doesn't), (b) multiplier < 1.0 (0.5×ATR threshold; gain=1 triggers; gain=0.99 doesn't), (c) default-arg back-compat (omitting matches passing 1.0). Plus updated existing 1×ATR test description. All 3 passed in CI alongside existing trailing-exit suite.

**Zero behavioral change at current settings.** `module_constants.trailing_exit.break_even_trigger_r = 1.0` (seeded value) AND `break_even_enabled = false` (variant K) — the BE-latch path doesn't even execute today. The fix only matters when (a) BE is later re-enabled AND (b) `break_even_trigger_r` is set to a value other than 1.0.

**Langston review trail:** Step-1+2+4 combined. **APPROVED.** Math + boundary tests verified by inspection. Surface area matches B76 Step-8 spec exactly. Recommended-not-blocking smoke test (briefly re-enable BE with `break_even_trigger_r=1.5` to observe latch line print "1.5×ATR gain") — performed in Step-7 verification. Non-blocking nit filed for future cleanup batch (`.toFixed(2)` on console-interpolated multiplier to avoid FP-representation drift on values like 1.7 → 1.6999999999999998).

**Verify post-deploy:** Smoke test pattern — `UPDATE module_constants` `break_even_trigger_r` 1.0 → 1.5; wait 60s for sync-read refresh; `break_even_enabled` false → true; observe BE-latch fires in PM2 logs with "1.5×ATR gain" line; revert both settings.

**Lesson:** "plumbed but not consumed" is a class of bug worth grepping for. The constant existed in three places (DB row, `TrailingExitConfig` interface, `TECExitDecision.resolvedConstants`) but the function that should have consulted it never did. Future audits should grep config-resolution code for "constant declared in module_constants ↔ constant actually referenced in runtime path" to catch silent regressions early. A `module_constants` row whose value never changes from its default could be a legitimate stable knob OR an unconsumed constant — disambiguate by greping the runtime path.

---

## INFRA-2026-05-06-C — B76 Chain-Final Calibration Framework Refactor (RESOLVED 2026-05-06)

**Trigger:** RUNNING_ISSUES #54 — calibration aggregator's `shift = real - alt` metric was structurally not measuring per-factor effect. Pre-B76 `realDecision.confidence` stored raw classifier value while each `buildXAlternate` was called with `_modulatedConfChain` AT THE TIME the factor fired (mid-chain), then divided out its own factor. That captured "remove this factor up to here, then never apply later factors" — NOT "as-if-this-factor-absent-but-all-others-still-applied". `b67_2_phase_preference` showed +0.0pp predictive lift by construction (FIRST in chain → without-factor == baseConf == real). `b67_1_macro_modifier` same problem. Multiplicative B68.x factors had non-zero shifts but magnitude was not a clean per-factor measurement. Predictive-lift column (REAL spread − ALT spread) was the only trustworthy per-factor metric because it cancels first-order bias inside each factor's bucket distribution. **B67.5 consumer wiring window opens 2026-05-15 — without trustworthy per-factor lift, the gating decision (which factors graduate from observational to active) is being made on structurally biased data.**

**Fix shipped (commit `235237ffd`):** Two-pass stash-then-build pattern in both orchestrator emit paths (Langston Step-1 architecture call: discriminated-union over closures for purity, auditability, debuggability, no orchestrator-frame state leakage).

- **PASS 1** at each factor's fire point: compute factor, multiply into `_modulatedConfChain`, push a `FactorAlternateInput` discriminated-union record (8 kinds: `b67_1`, `b67_2`, `b67_4`, `b68_1`, `b68_2`, `b68_3`, `b68_4`, `b68_5`) onto a stash array. NO build helper called here.
- **PASS 2** after final post-floor clamp on `_modulatedConfChain`: call `buildAllAlternates(stash, chainFinalConfidence, regimeLabel)` from new `server/services/factor-ablation-builders.ts` (~210 LOC). Dispatch via TS-exhaustiveness-checked switch to existing `buildXAlternate` helpers, each computing `alt.conf = realConfidenceFinal / factor` for divide-out factors (or label-counterfactual for B68.5 — re-runs `calculatePairRegime` with gate disabled).
- **`emitAblationRecord`** now persists chain-final `realDecision.confidence`. Raw classifier value preserved at `realDecision.metadata.predictiveConfidenceRaw` for back-compat (Step-2 grep audit cited single production read site at `drift-dashboard-aggregator.ts:1048`).
- **`CALIBRATION_FRAMEWORK_VERSION = 'b76_chain_final' as const`** exported from `factor-ablation-emitter.ts` per Langston §6 revision (prevents string-literal drift). Persister stamps every row at `realDecision.metadata.calibrationFrameworkVersion`.
- **NEW `buildB67_2Alternate`** in `server/core/metrics/regime-phase.ts` — extracted from inline blocks duplicated in both orchestrators (signal-orchestrator.ts:733 + vts-runner.ts:1517). Divide-by-weight semantics. Metadata key rename `confidence_with_phase_pref` → `confidence_with_factor` for uniformity with other helpers.
- **`drift-dashboard-aggregator.ts`:** removed two `factor_name NOT IN ('b67_1_macro_modifier', 'b67_2_phase_dimension')` filters at L504 (computeAblationComparison) + L1052 (computeFactorCalibration); replaced L1052 with version-filter logic per Langston §4 revision: `keep row IF (factor not in 6 sensitive names) OR (has chain-final marker)` — so b67_1_*/b67_2_* surface trustworthy shifts post-B76 and pre-B76 structurally-biased rows are excluded. Other 7 factors don't need version filter (predictive lift cancels first-order bias).
- **NEW `b76-chain-final-emit.test.ts`** vitest suite covering CALIBRATION_FRAMEWORK_VERSION literal, divide-out semantics for B67_4/B67_2/B68_1/B68_2/B68_3/B68_4, edge cases (factor=0 fall-through; factor=1.0 idempotent; penalty<1.0 → alt > real; boost>1.0 → alt < real), buildAllAlternates dispatcher (b67_1 expands to 3; empty inputs → empty output).
- **B68.5 7th-arg semantic shift:** pre-B76 was `baseConf`; post-B76 is chain-final reference attached for completeness. Label-counterfactual computation unchanged — does NOT use 7th arg for divide-out math.

**Zero formula/weight/threshold change. No DB migration. No new `module_constants`.** Pure plumbing per Langston's single-purpose fence.

**Langston review trail:** Step 1 scope APPROVED-WITH-REVISIONS (architecture two-pass stash-then-build over deferred-closure validated; CALIBRATION_FRAMEWORK_VERSION TS const + version-filter on b67_1/b67_2 queries). Step 2 pre-audit + Step 4 code review combined APPROVED-WITH-REVISIONS — one BLOCKER (.js ESM extensions on value imports in `factor-ablation-builders.ts` and the new import block in `regime-phase.ts` — would have crashed orchestrator at first signal eval since Node's ESM strict resolution fails on extension-less paths) fixed pre-push. Hetzner GDrive FUSE mount discovered broken for recursive ops during Langston review (his git log/status hung 30+ min in disk-wait); switched to staging diffs at `/tmp/` and instructing Langston to use Read tool against absolute /tmp/ paths only.

**Verify post-deploy:** SQL spot-check `SELECT factor_name, COUNT(*) FROM regime_factor_alternates WHERE real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final' GROUP BY factor_name`. Within 24h all 10 factor names should be present (b67_1×3 + b67_2 + b67_4 + b68_1/2/3/4/5). Within 24-48h: b67_1_*/b67_2_phase_preference rows show non-zero shift (was 0 by construction pre-B76); predictive lift on B68.1/.2/.3/B67.4 preserves sign + stays within ±1pp of pre-B76 values. Drift dashboard factor calibration table now surfaces previously-frozen `b67_1_macro_modifier` + `b67_2_phase_dimension` rows with non-zero data.

---

## OPS-2026-05-06-A — Variant K applied (BE-stop disabled) + latent isBreakEvenTriggered no-op surfaced (RESOLVED 2026-05-06)

**Trigger:** B75 close Exit Strategy Ablation calibration analysis. 7-day window n=1256 per variant, READY status. Variant K (`no_BE_no_trail`) showed Sharpe 2.13 / mean +0.482% / WR 68.6% vs current state J (BE on, trailing-after-target off) at Sharpe 0.39 / mean +0.428% / WR 55.7%. Δ vs A baseline +0.078% per trade × 1256 trades/week ≈ +98 P&L%/week extrapolated. Kyle directive 2026-05-06: implement variant K.

**Latent bug discovered during implementation:** the `trailing_exit.break_even_trigger_r` module_constant (seeded B65.1, value 1.0) was being plumbed into `TrailingExitConfig.breakEvenTriggerR` and into `TECExitDecision.resolvedConstants` for diagnostics — but **never actually consulted by the runtime**. `isBreakEvenTriggered(currentPrice, entryPrice, ATR)` in `server/utils/analysis-utils.ts:357-364` hardcodes `gain >= ATR` (1×ATR exactly), no R multiplier. So the constant has been a no-op since B65.1 (~2026-04-23, ~2 weeks). All BE-latch behavior matched the seeded value of 1.0 by coincidence. If the constant had been changed to e.g. 1.5 expecting the BE-latch to fire later, it would have silently continued at 1.0. Logged but **not fixed in B75 close** — variant K disables BE entirely so the multiplier becomes moot. Future batch can either (a) thread `breakEvenTriggerR` through `isBreakEvenTriggered`, or (b) deprecate the constant as a documented no-op.

**Resolution (B75 close):**
- Code commit `d6d2430ce`: added `breakEvenEnabled: boolean` to `TrailingExitConfig` (default `true` for back-compat). Trailing-exit-controller's BE-latch block at `trailing-exit-controller.ts:438` now gated on `cachedConfig.breakEvenEnabled`. Single point of control; the only place `breakEvenLatched` flips true.
- DB UPDATE: `INSERT module_constants` (`trailing_exit`, `break_even_enabled`, `false`, `kyle-2026-05-06-disable-be-stop-variant-k`).
- PM2 #177 restart (clears 60s TEC config cache + reloads bundle).

**Reversibility:** seconds via `UPDATE module_constants SET value='true' WHERE module_name='trailing_exit' AND constant_name='break_even_enabled'`. Cache picks up within 60s OR PM2 restart for instant.

**Verification at deploy:** PM2 logs grep `BREAK-EVEN latched` post-#177 should show zero new latch firings (open trades from pre-#177 retain `breakEvenLatched=true` state). New trades opened post-#177 must never log a BE-latch.

**Forward monitoring:** 24h window of Exit Strategy Ablation should show variant J stats trend toward variant K stats over the next 1-3 days as the live system's exit-reason distribution shifts away from `break_even_stop` toward `target_hit` and `stop_hit`. If trend doesn't materialize → revert via DB UPDATE and investigate.

**Linked:** B75 close exit-ablation finding §H.1 of `BATCH_75_COMPLETION_REPORT.md`. Future batch should either fix the no-op `break_even_trigger_r` consultation OR deprecate the constant.

---

## INFRA-2026-05-06-B — B75 Data Lifecycle / Tiered Storage shipped (RESOLVED 2026-05-06)

**Trigger:** Supabase auto-expanded staging DB disk 12 → 18 GB on 2026-05-06 05:10 UTC. DB at 10.0 GB / 18 GB. Daily growth ~1.4 GB/day, ~75% from B74 passive-archive tables. At current rate hits 200 GB Pro auto-expand cap by ~September 2026. Internal `DatabaseMonitor` alarm firing "88.7% of 10 GiB" because hardcoded threshold was stale post-auto-expand.

**Resolution (B75):** Tiered hot/warm/cold storage architecture per Kyle directive: "we don't ever drop data." Move-not-delete tiers preserving full-fidelity data indefinitely at ~$0.001/GB-month cold-tier cost. HOT=Supabase disk (30d ticker / 365d OHLC / 14d ctx-bridge). WARM=Supabase Storage JSONL.gz (~6× cheaper, 365d retention). COLD=Backblaze B2 (~125× cheaper, indefinite, never deleted).

**Components shipped (commits `f4e6a73f6` + hotfix `b2f9f531a`, PM2 #172 → #174):** `data_archive_manifest` table with state machine (`pending → uploaded → verified → active → migrating → migrated`); `data_lifecycle` module (18 rows); `database_monitor` module (3 rows; `plan_cap_mb=204800` against 200 GB Pro cap, stable across auto-expansions); `b75-retention-sweep.ts` (cron 02:15 UTC, export-then-drop fence with REPEATABLE READ snapshot + post-upload re-read checksum verify + min/max_ts verify); `context-bridge-log-ttl.ts` (cron 02:30 UTC, month-grouped export + DELETE rounded to month-start so partial-month rows never deleted, tail VACUUM); `b75-rehydrate.ts` CLI (manifest-driven analytics restore); `b75-cold-rotator.ts` (cron 03:00 UTC monthly, dry-run until B2 creds); `storage-client.ts` (native fetch wrapper, zero new npm deps, 45 MB upload guard); `database-monitor.ts` parameterized — **alarm transitioned CRITICAL (88.7% / 10 GiB stale) → NORMAL (5.2% / 200 GB plan cap)** verified live; `b70-b62-relabel-runner.ts` header guard added.

**Renumber note:** Originally drafted as B73. Step 2 pre-audit grep found B73 was already shipped 2026-04-29 (Exit-Strategy Ablation Framework + B73.1/.2/.3 + 5 source files using `b73-` prefix). Kyle confirmed renumber to B75. Original B73 scope file restored.

**Hotfix `b2f9f531a`:** Supabase rolled out new Publishable/Secret API key system mid-2025. The new `sb_secret_*` format is not a JWT — Storage API rejects it as "Invalid Compact JWS" if sent only as `Authorization: Bearer`. Fix is sending both `apikey` and `Authorization: Bearer` headers. Caught during dt-archive bucket provisioning post-PM2 #173.

**Pending external (non-blocking):**
- ~~SUPABASE_SERVICE_ROLE_KEY in staging .env~~ — RESOLVED 2026-05-06 (Kyle action via SSH).
- Backblaze B2 account + 4 env vars + flip `data_lifecycle.cold_rotator_dry_run=false` — pending Kyle action; cold rotator stays dry-run until.

**B75.x deferred follow-ups (logged for future batches):** keyset pagination (LIMIT/OFFSET → keyset cursor) for performance with 10M+ row partitions; multipart/TUS upload for >45 MB warm objects; partition `context_bridge_log` (B75.1); partition `execution_attempt_audit` + `walter_memory` (B75.2); Phase 2 cold-rotator wiring; migrate `data_archive.b70_postgres_retention_days` into `data_lifecycle` registry.

**Langston review trail:** Step 1 rev 1 + rev 2 + Step 2 pre-audit + Step 4 code review (B1 drop `updated_at` + B2 round delete cutoff to month-start fixes applied pre-push). **First batch end-to-end on the new Langston-on-Claude-Code bridge architecture.** SDK session-lock contention discovered + workaround documented in CLAUDE.md §8.2.

**Linked records:** scope `BATCH_75_SCOPE.md` (rev 3); pre-audit `BATCH_75_PRE_AUDIT.md`; completion report `BATCH_75_COMPLETION_REPORT.md`; PHASE_HISTORY entry under "Phase 15c continuation 2026-05-06"; BATCH_CATALOG row.

---


> **Author**: Claude Code (System Cartographer)
> **Created**: 2026-02-15
> **Purpose**: Tracks all bugs, architectural issues, inefficiencies, and recommended changes discovered during the systematic repository audit. Each item includes severity, location, verification status, and recommended timing (pre-MCE vs during-MCE vs post-MCE).
> **This is NOT the System Manual.** This is the action registry.

---

## How This Document Is Used

- Items are added during each audit phase
- Each item is verified against source code before inclusion
- Kyle reviews and prioritizes items
- ChatGPT / Replit can be consulted for second opinions
- Items marked "during-MCE" should be bundled into MCE directives
- Items marked "pre-MCE" are standalone fixes that should happen first

---

## Severity Levels

| Level | Meaning |
|-------|---------|
| **CRITICAL** | Produces incorrect results in the active trading path. Must fix. |
| **HIGH** | Significant architectural issue that will cause problems at scale or during integration. |
| **MEDIUM** | Inefficiency, duplication, or maintainability issue. Fix during related work. |
| **LOW** | Minor issue, cosmetic, or optimization opportunity. |

---

## BUGS

### INFRA-2026-05-06: Langston runtime migrated OpenClaw → Claude Code under Max OAuth — **SHIPPED**
- **Severity**: INFRA (cost + capability optimization, not a bug fix)
- **Trigger**: Langston via OpenClaw was costing ~$50/2-day in Anthropic API charges (~$750/mo). Kyle wanted to leverage his existing Max subscription.
- **Action**: Built two custom Python long-polling bridges on Hetzner `204.168.141.77`:
  - `langston-bridge.service` (`/usr/local/bin/langston-bridge.py`) — polls `@LangstonDTBot` getUpdates, invokes `claude -p --session-id <UUID> --model claude-opus-4-7` per inbound, posts replies, mirrors all in/out/silent to `/var/log/cc-bridge-inbox.jsonl`. No @-mention required in topic 21; Langston judges per his CLAUDE.md §11 and outputs `[SILENT]` to skip Telegram post.
  - `cc-comms-bridge.service` (`/usr/local/bin/cc-comms-bridge`) — polls `@CCDTCommsBot` getUpdates, writes inbound to shared log, provides `cc-comms-bridge send` CLI for outbound. Mirrors my outbound for Langston's visibility.
- **OpenClaw decommissioned**: both Telegram accounts (`default`, `ccdt-relay`) disabled in `/root/.openclaw/openclaw.json`. Gateway idle but not stopped (optional cleanup).
- **Bot-to-bot Telegram block**: documented as a platform constraint, not a bug. Workaround: shared filesystem log + SSH+`claude -p --session-id <UUID>` for AI-to-AI delivery (replaces OpenClaw `--deliver`).
- **Cost**: $200/mo Max sub replaces ~$750/mo API. Savings ~$550/mo.
- **Model**: Opus 4.7 with 1M context (auto-upgraded by Max plan; verified via SDK `modelUsage.contextWindow: 1000000`).
- **OAuth token**: `/etc/langston/oauth.env`, valid 1 year (issued 2026-05-06). Rotate by 2027-04 via `claude setup-token` from Kyle's laptop.
- **Persona migration**: 7 OpenClaw identity files (BOOTSTRAP/SOUL/IDENTITY/USER/AGENTS/TOOLS/MEMORY, 1368 lines total) compressed into `/home/langston/CLAUDE.md` (261 lines, includes §11 "When to respond in the group" rules) + `/home/langston/MEMORY.md` (mirrors project MEMORY.md, ≤200 lines).
- **Smoke test**: Kyle DM'd `@LangstonDTBot` with status check; coherent identity-aware response in <2 min. 1M-context research task delivered via SSH (Langston confirmed Max auto-upgrades Opus to 1M context, no flag needed).
- **Governance**: project `CLAUDE.md` §6 + §8 rewritten with new send/receive protocol + operations + diagnostic runbook. SYSTEM_MANUAL.md §27 marked SUPERSEDED with pointer to new canonical reference. MEMORY.md updated. Langston's CLAUDE.md/MEMORY.md updated.
- **Lesson**: Max plan supports headless agentic loops via OAuth tokens (`claude setup-token`) and supports Opus 4.7 1M context in `claude -p` mode without flag. Trust SDK `modelUsage.contextWindow` over the model's text self-description.

### BUG-2026-05-06-A: B72 main shipped without covering 9 in-class quant strategies; B72.1 audit reinforced wrong conclusion — **RESOLVED**
- **Severity**: HIGH (governance + materially incomplete lever sweep on highest-volume strategy in the system)
- **Location**: `server/services/strategy-engine.ts:87–1344` (the missed `detect*` methods); `LEVER_INVENTORY.md §13.1` and `BATCH_72_COMPLETION_REPORT.md §K.3` (the wrong conclusions that needed correction)
- **Problem**: B72 main's lever inventory pass enumerated `server/strategies/` filesystem and identified 9 strategies, but did NOT enumerate the 9 in-class `detect*` methods (`detectVWAPPullback`, `detectABCDLong`, `detectSMATrendRide`, `detectBreakout`, `detectMeanReversion`, `detectRangeTrading`, `detectVWAPBounce`, `detectLiquidityTrap`, `detectDHMA`) inside `strategy-engine.ts`. Their 131 hardcoded parameters never made it into `module_constants`. B72.1 closure audit then doubled down on the gap by reading only the exit-condition `switch` block at `strategy-engine.ts:903` and concluding the 9 in-class strategies were "exit-only stubs / dead code candidates" — without reading the actual `detect*` methods in the same file at lines 87–1344. CLAUDE.md "17 canonical strategies" was also stale (actual is 18 — B63 added strong_bull_trend).
- **Why it mattered**: `vwap_pullback` alone produced 26,540 evaluations / 7d on staging — the highest-volume strategy in the system. B72's "comprehensive lever sweep" claim was materially incomplete. Five additional vts-runner-vs-signal-orchestrator parameter discrepancies (`breakout.volumeMultiplier` 1.5/2.0, `mean_reversion.deviationThreshold` 2.0/2.5, `range_trade` triplet) were also unaddressed.
- **Fix**: B72.2 (`eeabb7147` SQL seed + `6c42dc370` Slices 2-5 wiring). Seeded 131 rows under 9 new `strategy.<key>` modules; refactored all 9 `detect*` methods to read from `module_constants`; stripped dispatcher param-object literals across 4 dispatcher files. Coverage now 18/18 canonical strategies DB-tunable. B72.1 §13.1 + §K.3 corrected with appendix sections noting the original conclusion was wrong.
- **Lesson**: filesystem-grep audits miss in-class methods. Strategy enumeration must use `STRATEGY_DISPLAY_NAMES` (canonical SSOT in `canonical-regime-strategy-map.ts`) as the authoritative list, and grep for `detect<StrategyName>(` patterns class-wide AND filesystem-wide. Audit conclusions that contradict production telemetry (e.g. "this strategy is dead code" when the DB shows 26k evaluations / 7d) must trigger a re-audit, not be shipped. Kyle's pushback caught this — the workflow needs an independent challenge gate before audit conclusions become governance truth.

### BUG-2026-05-05-E: B72 warmup wired AFTER Boot Orchestrator initialization — **RESOLVED**
- **Severity**: HIGH (silent operational failure — VTS pipeline dormant)
- **Location**: `server/index.ts` ordering of `bootOrchestrator.initialize()` vs `warmModuleConstantsForSyncCallers()`
- **Problem**: VTS auto-start runs INSIDE `bootOrchestrator.initialize()` and triggers `pruneReentryMaps → getSetupHashExpiryMs → getCachedNumberRequired('vts_runner', ...)` against cold cache. `[BOOT][VTS] Auto-start failed: First cycle failed: module_constants: module 'vts_runner' is not warm`. Server stays online but VTS pipeline never recovers — strategies never evaluated, 0 open simulated trades for 1+ hour windows. Witnessed PM2 #155 → #161.
- **Root cause**: b72-warmup wired to run after Boot Orchestrator init, but Boot Orchestrator's VTS auto-start is the first sync caller of the new module_constants API. Ordering violated the implicit invariant that warmup precedes any sync caller.
- **Fix**: commit `c1afdfac` — moved warmup BEFORE `bootOrchestrator.initialize()`. Verified `[B72][INIT_OK] (pre-orchestrator)` precedes `[VTS_RUNNER] INIT_OK` on PM2 #162+.
- **Lesson**: boot-time hard-fail discipline only works when warmup actually runs first. For any future sync-read API addition, audit the FULL boot sequence — not just the obvious caller.

### BUG-2026-05-05-F: B72 vts-runner.ts `VTS_MAX_CONCURRENT_PER_COMBO` undefined at 2 callsites — **RESOLVED**
- **Severity**: HIGH (every VTS strategy execution thrown silently)
- **Location**: `server/services/vts-runner.ts:1289` (DUP_GUARD log) + `:2887` (outer-loop dup pre-check)
- **Problem**: Slice 2d removed `const VTS_MAX_CONCURRENT_PER_COMBO = 1` and replaced the primary callsite with `getVtsMaxConcurrentPerCombo()`. Two additional sites (a console.log interpolation at L1289 and an outer-loop duplicate-check at L2887) were missed. Every VTS strategy execution raised `ReferenceError: VTS_MAX_CONCURRENT_PER_COMBO is not defined`. detected=15-21 per cycle, signals=0.
- **Fix**: commit `4ad40b95` — both sites now use `getVtsMaxConcurrentPerCombo()`.

### BUG-2026-05-05-G: B72 expectancy.ts `FRICTION_SAFETY_BUFFER` / `ROI_MIN` / `ROI_MAX` undefined at 2 callsites — **RESOLVED**
- **Severity**: HIGH (every signal that reached ROI gate threw silently)
- **Location**: `server/core/calculations/expectancy.ts` `isSignalProfitable` (L291) + `getROIDetails` (L414+)
- **Problem**: Slice 2a removed the imports for ROI_FLEX_MULTIPLIER / ROI_MIN / ROI_MAX / FRICTION_SAFETY_BUFFER from `adaptive-thresholds.ts` and migrated `getDynamicROIThreshold` to read from module_constants. Two other consumers (`isSignalProfitable` friction floor, `getROIDetails` validation result) were missed. Every signal that reached the ROI gate threw `ReferenceError: FRICTION_SAFETY_BUFFER is not defined` → `signals=0 stratNulls=147` despite 18+ detections per cycle.
- **Fix**: commit `1a3038a4` — both functions now read via `getCachedNumberRequired('expectancy_gates', ...)`.
- **Pattern note (E + F + G shared root cause)**: mass-migration grepped primary callsites but missed (a) string-interpolated log lines, (b) sibling functions in the same file, (c) helper functions reachable from migrated entry points. **Mitigation**: post-migration, do `grep -rn "<OLD_CONST_NAME>" server/ --include="*.ts"` on every removed const before push. TypeScript build error would have caught these; the legacy-baseline TS Check failure masks new errors. Recommend `tsc --noEmit` on touched files before push as a personal CI step.

### BUG-2026-05-03-A: B69 Ticker Snap Retag Statement Timeout on Large Tables — **OPEN (deferred)**
- **Severity**: MEDIUM (existing rows have stale `equity_spot`/`equity_perp` values; new rows correctly use `xstock_*`)
- **Location**: `equity_spot_ticker_snap` (~4M rows), `equity_perp_ticker_snap` (~1.8M rows)
- **Problem**: B69 retag script (`npm run db:b69-retag`) uses PL/pgSQL loop with 5000-row batches to UPDATE `asset_class` from `equity_spot` → `xstock_spot` (and `equity_perp` → `xstock_perp`). On Supabase's connection pooler (pgbouncer), the statement timeout kills the UPDATE after the configured limit. After the timeout, Supabase pooler enters read-only mode ("cannot execute UPDATE in a read-only transaction") requiring connection reset. OHLC tables (1.2M + 260k rows) were successfully retagged before the timeout hit on ticker snap tables.
- **Detection**: B69 Step 7 verification — retag script output showed `SET` then `ERROR: canceling statement due to statement timeout`.
- **Workaround**: Run the retag SQL directly via Supabase SQL Editor (bypasses pgbouncer pooler, uses direct connection with longer/no timeout). Alternatively, reduce batch size to 1000 rows and add `pg_sleep(0.1)` between batches.
- **Impact**: Read queries filtering by `asset_class = 'xstock_spot'` will miss historical ticker rows until retag completes. New rows inserted after B69 deploy correctly use `xstock_*` values. No impact on OHLC tables (fully retagged). No impact on trading pipeline (ticker archive is passive/observational only).
- **Status**: OPEN — deferred to next Supabase SQL Editor session. Non-blocking.

### BUG-2026-04-30-I: B74 Equity Perp OHLC at 0 rows (Kraken Futures WS has no candle feed) — **RESOLVED**
- **Severity**: HIGH (perp OHLC table empty for 1+ hours despite WS connection healthy)
- **Location**: `server/services/passive-archive/equity-perp-archiver.ts`
- **Problem**: B74 v1 implemented Kraken Futures perp OHLC capture via WS subscription `feed: 'candles_trade_1m'`. That feed name does not exist on Kraken Futures WS — Kraken Futures has no candle/kline subscription feed at all. WS connection accepted the subscription request without error but returned no candle data. Symptom: ticker stream populated 1,478 rows / 10 syms while OHLC table stayed at 0 rows.
- **Detection**: B74 Step-7 verification — DB row count zero for `equity_perp_ohlc_1m` despite all other 5 tables capturing data.
- **Fix** (`b8eba807` 2026-04-30, B74.1): rewrote equity-perp-archiver to dual-path. WS for ticker only (was already working); REST polling at `https://futures.kraken.com/api/charts/v1/trade/<sym>/1m` every 60s with per-symbol last-seen-interval dedup map, 100ms inter-symbol space-out. Endpoint returns 2000 1-min candles per call (~5.5 days back) → initial poll provides historical backfill in addition to ongoing capture.
- **Lesson**: For exchange WS protocols, verify feed/channel names against live-probe behavior, not just docs. The Kraken Futures WS docs at the time of B74 v1 listed candle-related fields under message schemas without explicitly enumerating which feeds emit them — easy to assume a subscription name that doesn't actually exist. When in doubt, REST endpoints are the canonical truth for historical/aggregated data.

### BUG-2026-04-30-J: B74 Bulk Insert Exceeds Postgres 65,535-Parameter Bind Limit — **RESOLVED**
- **Severity**: HIGH (initial perp REST backfill of 20,000 rows silently dropped)
- **Location**: `server/services/passive-archive/ohlc-batch-writer.ts` + `ticker-batch-writer.ts`
- **Problem**: Drizzle `db.insert(table).values(rows)` builds a single parameterized INSERT statement. With OHLC rows having ~12 columns, 20,000 rows = 240,000 parameter placeholders → exceeds PostgreSQL's hard 65,535 bind-message parameter limit → query fails. Drizzle does NOT auto-chunk by default (verified during B74.1 verification). Surfaced when equity-perp's first REST poll buffered 20,000 historical bars (2000 candles × 10 symbols) and the entire batch was silently dropped; only subsequent 60s polls (~10 new bars) succeeded.
- **Detection**: B74.1 verification — log showed `polled 10 symbols, 20000 new bars` but DB row count was only 10 after several flush cycles.
- **Fix** (`b9c4ebbb` 2026-04-30): chunk batch inserts in CHUNK_SIZE=1000 rows in both `ohlc-batch-writer.ts` and `ticker-batch-writer.ts`. With ~12 OHLC columns × 1000 rows = 12,000 parameters per chunk — comfortable headroom under the 65,535 limit. Multiple smaller INSERTs per flush cycle, partition routing still automatic.
- **Lesson**: When using ORM bulk-insert helpers, verify chunking behavior against the underlying DB's parameter limits. Drizzle/Postgres pattern is to chunk explicitly in caller code. Alternative is `pg-format` or `COPY`-style bulk import for very large batches; for B74's typical 100-1000 row buffers chunking is sufficient.

### BUG-2026-04-30-F: B74 Config Path via `import.meta.url` Doesn't Survive esbuild Bundle — **RESOLVED**
- **Severity**: HIGH (B74 archivers silently failed to start at boot)
- **Location**: `server/services/passive-archive/universe-loader.ts`
- **Problem**: Universe-loader resolved JSON config paths via `path.dirname(fileURLToPath(import.meta.url))` + relative `../../config`. In dev this resolves correctly inside `server/services/passive-archive/`. After esbuild bundles to single-file `dist/index.js`, `import.meta.url` resolves to `dist/` and the relative path doesn't reach `server/config/`. Universe-loader threw ENOENT, bootstrap's per-archiver `.catch()` swallowed the error to a log line that wasn't surfacing distinctly. Symptom: `[B74][bootstrap] passive archive pipeline started` log printed, but no `[B74][universe] equity_spot loaded: ...` follow-up; 60s health logs showed `connected=false` for all archivers; tables stayed empty.
- **Detection**: Kyle observation post-B74 deploy that DB row counts were 0; investigated PM2 logs and found bootstrap completed without universe-load logs.
- **Fix** (`bd60add3` 2026-04-30): switched to `process.cwd()`-based path. The dawntrader app is always launched from project root by PM2, so cwd is `/home/deploy/dawntrader/` — stable in both dev and prod.
- **Lesson**: When a project bundles via esbuild to a single dist file, `import.meta.url`-based path resolution is a known footgun. Use `process.cwd()` or absolute paths for runtime-resolved files (configs, fixtures). Add a runtime-test step (not just `npm run check`) before declaring a feature shippable — the bundled output has different path semantics than source-tree TypeScript.

### BUG-2026-04-30-G: B74 Migration Partition Off-By-One on Deploy Day — **RESOLVED**
- **Severity**: HIGH (all inserts failed for hours until UTC midnight rolled over)
- **Location**: `drizzle/migrations/2026-05-01-b74-passive-archive-tables.sql` DO block
- **Problem**: Migration's DO block pre-created 12 monthly partitions starting from `DATE '2026-05-01' + (i || ' months')::INTERVAL` — covering May 2026 through April 2027. But the migration was applied on 2026-04-30 22:31 UTC (still April). Postgres has no partition for the current month → all inserts fail with `ERROR: no partition of relation "equity_spot_ohlc_1m" found for row` for ~1.5 hours until UTC midnight rolls into May 2026 (which IS pre-created). Bootstrap's headroom check passed because it queried the LATEST partition end date (2027-05-01, > 2 months ahead) without verifying CURRENT-month coverage.
- **Detection**: Manual `INSERT INTO equity_spot_ohlc_1m ... VALUES (... NOW() ...)` returned the partition error after observing that DB row counts were 0 despite archivers reporting `rows_persisted_60s` non-zero.
- **Fix** (`778cd4ed` 2026-04-30): bootstrap's `checkPartitionHeadroom` now ALSO ensures current-month partition exists, creating it inline with `[B74][partitions][SELF-HEAL] created missing CURRENT-month partition` warn log if missing. Catches both this off-by-one AND any future monthly-cron miss. Manually created the 2026-04 partitions on staging during the incident.
- **Lesson**: Time-relative migration logic (date arithmetic from a hardcoded anchor) is fragile when deploy day doesn't match the anchor. Either: (a) pre-create partitions starting from `date_trunc('month', NOW())` in the DO block, OR (b) add bootstrap-time self-heal that ensures critical partitions exist regardless of migration timing. We chose (b) because (a) requires post-migration restart to re-run. Bootstrap-time self-heal is more robust for the live system.

### BUG-2026-04-30-H: FNV-1a Hash Low-Bit Bias Causes Imbalanced WS Sharding — **RESOLVED**
- **Severity**: MEDIUM (one shard exceeded recommended 300-symbol limit)
- **Location**: `server/services/passive-archive/crypto-spot-archiver.ts` — `fnv1aHash()` function, used for `hash(symbol) % shardCount` sharding
- **Problem**: Bare FNV-1a 32-bit hash has weak avalanche on the low bits. When inputs share suffixes (all 380 crypto pairs end in `/USD`, `/USDT`, or `/USDC`), the hashed values cluster on the low bits — `% 2` produced 364/16 shard distribution (96%/4% bias) instead of expected ~190/190.
- **Detection**: Bootstrap logs showed `[B74][crypto-spot][shard0] subscribed ... for 364 symbols` and `[shard1] for 16 symbols`. Shard0 exceeded the 300-symbol Kraken WS v2 recommended limit per Langston cc-inbox #869 Q3.
- **Fix** (`778cd4ed` 2026-04-30): added Murmur3 fmix32 finalizer (xor-shift-multiply three times) after the FNV-1a main loop. The avalanche function spreads the bits uniformly so `% shardCount` distributes evenly. Post-redeploy: 180/201 split — both shards under the 300 recommended limit.
- **Lesson**: For hash-mod sharding with small modulo (especially `% 2` or `% 4`), bare FNV-1a is insufficient. Always apply a finalizer (Murmur3 fmix32 is the standard) when the input domain has suffix or prefix bias. Pattern is well-documented but easy to miss when implementing from scratch.

### BUG-2026-04-30-D: B73 Variant Collapse Persists After B73.1 (1-min OHLC vs Live TEC Tick Resolution) — **RESOLVED**
- **Severity**: HIGH (B73 framework still un-decision-grade despite morning hotfix; ALL variants on ALL trades collapse to identical inherited values)
- **Location**: `server/services/exit-strategy-replay-service.ts` (OHLC fetch window + ATR derivation) + `server/services/exit-strategy-replay.ts` (variant trigger thresholds)
- **Problem**: Variant A pass-through worked (B73.1) and TIMEOUT inheritance worked (B73.1) — but variants B-L STILL all fell into the inheritance path because no variant level ever fired within the OHLC replay window. Diagnosed by direct Kraken OHLC pull on AIXBT/USD trade (90 min duration, real exit `break_even_stop` at 0.03079): max bar high was 0.03164 (+0.5% above entry), but BE trigger threshold (entry + 1×ATR_proxy) was at 0.033586 (+5.9% above entry). No 1-min bar's high ever crossed the trigger level. Yet the live trade DID latch BE in real life — meaning live TEC monitored price at sub-minute resolution via the pricing-service tick cache and saw a brief price spike that the 1-min OHLC aggregate doesn't expose. Two compounding root causes: (1) ATR proxy `(target − entry) / 1.5` is wildly larger than the typical 1-min bar range (live ATR is computed on a different timeframe and reflects 1-hour-scale ranges, ~2-5% of price), so triggers were unreachable at bar resolution; (2) OHLC window capped at `exitTime + 1h` was too short to let Variants F (no_BE_stop) and K (no_BE_no_trail) see whether the original target would eventually have hit after the live BE_stop closed the trade.
- **Detection**: Kyle observation 2026-04-30 afternoon — UI showed all 12 variants with identical Mean P&L = -0.487 across 5 closed trades.
- **Fix** (`a98ce7ff` 2026-04-30, B73.2): per Langston cc-inbox #866: (a) Bar-derived ATR — recompute from 14 1-min bars BEFORE entry as 14-period TR average. Variant trigger thresholds use this instead of the proxy. Replay ATR ≠ live ATR; framework now answers "what would variant X have done with bar-resolution thresholds" not "what would variant X have done in the live world" — acceptable trade-off for variant-comparability per Langston Q1. (b) Extended OHLC window to `entryTime + maxHoldMs` (7d) regardless of actual exit. Pagination enabled (10080 candle cap, 14 batches × 720 candles, 500ms delay). Async fire-and-forget so 7s pagination doesn't block trade-close. (c) Both `atr_live` and `atr_bar_derived` logged in metadata of every variant row for diagnostic validation of live↔bar ATR divergence. Wiped 180 useless inherited-only rows.
- **Verification**: Pending — first new VTS close post-deploy (PM2 #119) will populate 12 rows; expect Variants B-L to differentiate now that triggers fire at bar resolution AND F/K can see post-exit reality.
- **Lesson**: Replay frameworks running on 1-min OHLC cannot reproduce sub-minute price movements that drive live exits. The choice is either (i) match live data fidelity (heavy infra: tick cache replay), (ii) accept the limitation and document it (no variant divergence visible), or (iii) intentionally degrade replay thresholds to bar-resolution scale so variants stay internally comparable. We chose (iii) for B73 — Sharpe paired-diff metric requires comparability not absolute fidelity. When designing future ablation frameworks, decide upfront which fidelity property matters and pick data resolution accordingly.

### BUG-2026-04-30-E: B67 Factor Ablation Comparison Panel Was Decoratively Dead Pre-B67.5 — **RESOLVED**
- **Severity**: MEDIUM (UI implied analysis when none was happening; eroded user trust in the framework)
- **Location**: `client/src/pages/analytics.tsx` (`AblationComparisonSection`) + understanding gap in panel's purpose
- **Problem**: Factor Ablation Comparison panel showed columns for "Both Admit", "Real Admit / Alt Reject", "$ Saved if Alt Active" — all of which require the alternate decision to produce a DIFFERENT admit/reject outcome from reality. Pre-B67.5, no downstream consumer (Kelly sizer, admission gates) reads the confidence value, so REAL and ALT decisions ALWAYS produce the same admit/reject outcome. Result: every column except total/replayed/pending always reads zero, making the panel look broken or non-functional. The 14-day calibration window seemed to be collecting nothing useful. **The actual analysis Kyle wanted — does each factor materially shift confidence values, and does high confidence correlate with better trade outcomes — IS captured in `regime_factor_alternates.alternateDecision.confidence` for every signal but was never surfaced in any UI panel.**
- **Detection**: Kyle observation 2026-04-30 afternoon: "we set up this ablation table with all these different rows... my assumption was that there were calculations being done in the background based on running the numbers with that variable involved or without it involved... but you're telling me that we're putting in all these levers, and we're not going to get anything out of it."
- **Fix** (`a98ce7ff` 2026-04-30): NEW `computeFactorCalibration()` aggregator function in `drift-dashboard-aggregator.ts` + `GET /api/analytics/factor-calibration` endpoint + new `FactorCalibrationSection` UI panel rendered ABOVE the existing Factor Ablation Comparison. Two sub-views per factor: (1) confidence-shift distribution table (avg REAL conf, avg ALT conf, avg shift, avg |shift|, max |shift|, % trades with shift=0); (2) tertile WR analysis splitting closed VTS trades into 3 equal-size buckets by REAL confidence, computing WR per bucket, plus same on ALT confidence, plus predictive lift = REAL spread − ALT spread. Decision-grade gate at n ≥ 150 per tertile bucket per Langston cc-inbox #856. Existing Factor Ablation Comparison panel labelled SUBSTRATE with explanatory pre-B67.5 note pointing readers to the calibration panel; left in UI per Kyle directive (will become useful post-B67.5).
- **Verification**: Endpoint responds with structurally correct payload; with n=1 today the tertile splits show 0/0/1 (expected). Will populate as trades accumulate over the 14d window.
- **Lesson**: When building telemetry/ablation UI, the analytical question the user wants answered ("does this lever add value?") is often answerable on captured DATA without needing the consumer-side wiring. Do not gate the analysis surface on the consumer rollout. Build the predictive-value view on day one of telemetry collection so the user can monitor evolution mid-window and make early decisions.

### BUG-2026-04-30-A: B67.0 Factor Ablation Replay Join Broken (0/1406 matches) — **RESOLVED**
- **Severity**: HIGH (factor ablation table un-decision-grade for 6 days)
- **Location**: `server/services/vts-runner.ts:1474-1488` emit + `server/services/vts-service.ts:769-770` JSONL write + `server/scripts/replay-ablation.ts:80-127` index
- **Problem**: Two different code paths produced different VTS-trade IDs. Factor-ablation-emitter wrote `vts_trade_id = signal.id = vsig_p10_<ts>_<rand>` (vts-runner format). Persisted JSONL wrote `signal.id = vts_<sym>_<strategy>_<ts>` (vts-service format). The replay-ablation cron job indexed JSONL by `signal.id` and joined on `vts_trade_id` — these never matched, so 1406 pending rows remained pending across 6 days with `matched=0` every nightly run.
- **Detection**: Kyle 2026-04-30 morning observation that Factor Ablation Comparison panel showed Total + Pending columns only, all stats columns at 0.
- **Fix** (`3afd8ed2` 2026-04-30, B67.0.1): switched join from ID-based to natural-key tuple `(pair_symbol, evaluated_at±60s, strategy)` — derived from same source data on both emit and JSONL sides, immune to ID-format drift. Added `strategy` column to `regime_factor_alternates` + composite index. Updated emitter signature + both call sites (vts-runner, signal-orchestrator) to pass strategy. Rewrote `buildVtsTradeIndex` to key by `(symbol|strategy)` with `findVtsTradeByNaturalKey` doing ±60s tolerance match. Wiped 1477 NULL-strategy pre-fix rows. Per Langston cc-inbox #864 Q1.
- **Verification**: ad-hoc `npm run b67:replay-ablation` post-deploy matched 4 rows (FLOW/USD strong_bull_trend close); API now returns `bothAdmit=1 replayed=1` per factor (was 0).
- **Lesson**: When two code paths mint IDs for the same logical entity, prefer a natural-key derived from shared source data (symbol + entry_time + strategy) over ID-based joins. ID-based joins work only as long as both sides use the same generator; under refactor pressure they silently break and the failure surface (0 matches) looks identical to "no data yet."

### BUG-2026-04-30-B: B73 Exit-Strategy Ablation Variant Collapse (11/12 identical) — **RESOLVED**
- **Severity**: HIGH (exit-strategy ablation un-decision-grade despite running cleanly)
- **Location**: `server/services/exit-strategy-replay.ts` (Variant A simulation + `timeoutExit`) + `server/services/vts-service.ts:891-919` B73 hook (ATR proxy)
- **Problem**: Across 39 trades, every variant exited on the same bar at the same price (only Variant H's tighter trail ever produced a `TRAIL_hit`, 2 of 39). Three structural causes: (a) **ATR proxy** `atr = (target-entry)/1.5` mis-scaled BE triggers — real TEC may use a different `target_lock_r`, so BE never fired in replay and all BE variants behaved like F (no_BE_stop); (b) **TIMEOUT exit** synthesized last-bar mid `(high+low)/2` — identical for all 12 variants, producing the artificial 12-way tie on the 64% of trades that hit TIMEOUT; (c) **Variant A re-simulated** instead of being live truth — sample SL_hit row had `baseline_pnl_pct=+0.62%` (real BE_stop exit) but A returned `-0.11% SL_hit`, breaking the paired-diff Sharpe vs A baseline.
- **Detection**: Kyle 2026-04-30 morning observation that Exit-Strategy Ablation panel showed all variants with near-identical stats except H.
- **Fix** (`3afd8ed2` 2026-04-30, B73.1): (a) Plumbed real `atrAtOpen` through `vts-service.persistRealPriceTrade` to B73 hook (drop the `/1.5` proxy as primary; kept as fallback for legacy open trades). (b) `timeoutExit()` now inherits realized exit values (`actualExitPrice`/`actualExitTime`/`actualExitReason`/`actualPnlPct`) instead of synthetic mid — non-firing variants register zero diff vs A, real differentiation only when a variant actually fires. (c) New `mkVariantAFromRealized` returns realized values directly — A is no longer simulated; it IS live truth. Wiped 480 bad pre-fix rows. Tests rewritten for new semantics. Per Langston cc-inbox #864 Q2(a)+(b)+(c).
- **Verification**: First post-fix close (BIO/USD strong_bull_trend) populated 12 rows with `source: realized_truth` for A and `source: realized_inherited` for B-L, with metadata explaining why each didn't fire (`be_latched: false`, `trail_active: false`, `phase: pre`).
- **Lesson**: Ablation framework Variant A baseline must equal realized P&L by construction, not re-simulation. Re-simulation will diverge from live behavior under any model imprecision (1-min OHLC vs sub-second tick monitoring, ATR proxy vs real ATR, hit-check ordering vs real-time stop semantics) — and that divergence breaks the paired-diff metric the framework is designed around.

### BUG-2026-04-30-C: drift-dashboard Aggregator Field-Name Drift — **RESOLVED**
- **Severity**: MEDIUM (UI showed 0 counts despite replay populating rows correctly)
- **Location**: `server/services/drift-dashboard-aggregator.ts:484-495`
- **Problem**: Aggregator queried `replay_outcome->>'notes' = 'admit_admit_no_delta'` and `replay_outcome->>'alternateOutcome'`, but `replay-ablation.ts` writes `notes='pre_b67_5_both_admit'` and `outcome='admitted_breakeven|admitted_won|admitted_lost'`. Strings were never aligned — likely never were aligned because B67.0 shipped with empty alternates and B67.1+ filled them later with a different shape than what the aggregator query expected.
- **Detection**: While verifying B67.0.1 fix end-to-end — replay matched 4 rows but `bothAdmitCount=0` in API response.
- **Fix** (`f6a0bb87` then `67cf66d9` for backtick-in-template build error, 2026-04-30): aligned aggregator query to actual emitter shape — `outcome` LIKE 'unreplayable_%' instead of `alternateOutcome`, `notes='pre_b67_5_both_admit'` instead of `'admit_admit_no_delta'`, `outcome='unreplayable_real_rejected'` for realRejectAltAdmitCount.
- **Verification**: API now returns `bothAdmit=1 replayed=1` per factor matching DB count.
- **Lesson**: Aggregator and emitter for the same JSONB column should share a schema-like contract (TypeScript types or constants). String drift between the two is invisible until users complain about UI counts. Add explicit aggregator-emitter contract test in B72 lever-sweep batch.

### BUG-001: VTS Signal Generation Is Generic — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Phase 14.1, Batch 15 HF6-HF7, Batch 16 HF8 `052fb224`, Batch 17 HF9 `f9fa56c6`)
- **Location**: `server/services/vts-runner.ts`
- **Problem**: ~~Generates random regime-adjusted scores instead of real strategy-specific calculations~~ VTS now wired to real strategy detect functions (HF6). Volume=0 bug fixed (HF6B). Regime classification recalibrated for crypto DX values (HF7). VTS timeframe aligned to 60-min (matching orchestrator), OHLC increased to 100 candles, BTC candles provided for defensive_hedge, strategy params relaxed, duplicate FinalScore checks removed from paper-execution-engine + RTB, return type fixed, confidence floor centralized to SQE, analytics tab wired to /api/regime-map (HF8). DSS fully deleted (superseded by MCE + detect functions), governance gate (11.7R-E) migrated to SQE, VTS IMF filters relaxed (LQ>=25, VN<=0.80, rho<=0.95) with filterTier tagging, closed trades context columns fixed, stale regime names fixed in telemetry-aggregator (HF9). OHLC cache (5-min TTL) eliminates redundant Kraken API calls for both VTS and orchestrator, orchestrator migrated to priceCache for ticker data, BATCH_SIZE increased to 300 pairs, filterTier added to export-csv push object (Batch 18 `4b6b2fa9`).
- **Impact**: VTS now produces real strategy-specific entry/stop/target from StrategyEngine detect functions. VTS and orchestrator use same 60-min timeframe — ML learning transfers directly. Mean_reversion and range_trade strategies confirmed firing in production (~2 trades/cycle). Phase 14.1B (timeframe alignment) eliminated from roadmap.
- **Remaining work**: ~~DSS pre-selector~~ DSS deleted entirely — MCE regime filtering + detect functions cover all DSS functionality. ~~Secondary metrics programmatic format~~ Deemed redundant — detect functions already evaluate these conditions internally; left as documentation in canonical-regime-strategy-map.ts. Pattern/hybrid strategies structurally unable to fire — returns "No pattern signal" across all pairs (Phase 14.5 needed). `config/vts.json` `pairsPerCycle` field is NOT consumed by vts-runner.ts — pair count comes from FX5 scanner output (now including relaxed-filter pairs via VTS IMF relaxation).
- **Phase Found**: Pre-audit (v1.0)

### ~~BUG-002~~: Active Trading Path Uses Legacy DSS Regime Model — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Directive 12.3.1 Batch 13 `4d8ef060` + Phase 13 Batch 14 `8f26369a`)
- **Location**: `server/services/dynamic-strategy-selector.ts`, `server/services/signal-orchestrator.ts`
- **Problem**: ~~Uses `SYSTEM_GUARDS.STRATEGY_MAP` (6 regimes, 9 quant) instead of canonical map (5 regimes, 17 strategies)~~ DSS rewired to `calculatePairRegime()` in Batch 13. Signal orchestrator now uses MCE (`computeContext()`) for regime + indicators in Batch 14. All 17 strategies reachable.
- **Resolution**: Batch 13 rewired DSS to canonical map. Batch 14 installed MCE as centralized regime/indicator service — signal orchestrator calls `MCE.computeContext()` instead of DSS for regime. `CANONICAL_REGIME_STRATEGY_MAP` is the sole strategy routing authority.
- **Phase Found**: Pre-audit (v1.0)

### ~~BUG-003~~: Signal Orchestrator Legacy Strategy Map — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Directive 12.3.1 Batch 13 `4d8ef060` + Phase 13 Batch 14 `8f26369a`)
- **Location**: `signal-orchestrator.ts`
- **Problem**: ~~Reads from `SYSTEM_GUARDS.STRATEGY_MAP`, complementary layer to DSS both using legacy source~~ Signal orchestrator now uses `mceContext.regime.allowedStrategies` from MCE, which looks up strategies via `CANONICAL_REGIME_STRATEGY_MAP`. Legacy `getRegimeAllowedStrategies()` no longer called for regime routing.
- **Resolution**: Batch 13 wired DSS to canonical map. Batch 14 replaced DSS regime call + inline VWAP/SMA with MCE's `computeContext()`. Strategy filtering now uses MCE's pre-computed `allowedStrategies`.
- **Phase Found**: Pre-audit (v1.0)

### BUG-004: DI Probability Divergence — NGC Masquerading as Directional Integrity — **RESOLVED**
- **Severity**: CRITICAL
- **Location**: `signal-orchestrator.ts` line 1127 (was line 1128)
- **Code**: `const DI = calculateDirectionalIntegrity(closePrices);`
- **Status**: **RESOLVED** — Directive 12.1.1, Batch 1, commit `ea6551af` (2026-02-22)
- **Resolution**: Replaced `DI = normalizedConf * 100` with `calculateDirectionalIntegrity(closePrices)` — geometric DI from OHLC close prices already in scope. DSS path and Expectancy Gate path now use the same DI source.
- **Original Problem**: The DSS kernel call converted NGC (blended confidence score) into a fake DI value. The kernel uses DI to compute `Pwin = 0.40 + DI/200`. Pwin was driven by blended confidence, NOT by price path geometry as designed.
- **Verified**: Yes — code-confirmed 2026-02-15, corroborated by ChatGPT grounded review
- **Phase Found**: Phase 1 (ChatGPT review)

### BUG-005: cost-model.ts getCostMetricsCache() Returns Empty Map
- **Severity**: LOW
- **Location**: `server/core/math/cost-model.ts` — `getCostMetricsCache()`
- **Problem**: Calls `getCacheStats()` but then ignores the result and returns `new Map()` unconditionally
- **Impact**: Does not affect runtime cost calculations. Breaks cache introspection/diagnostics only.
- **Verified**: Yes
- **Timing**: During MCE or anytime (trivial fix)
- **Fix**: Return actual cache contents from cost-cache.ts
- **Phase Found**: Phase 1

---

## ARCHITECTURAL RISKS

### ~~RISK-001~~: VTS/Active Trading Regime Math Drift — **RESOLVED**
- **Severity**: ~~HIGH → CRITICAL~~ **RESOLVED** (Directive 12.3.1, Batch 13, commit `4d8ef060`)
- **Location**: ~~VTS uses `market-regime.ts` `calculatePairRegime()` (Engine #2), active trading uses DSS `volNoise/trendSlope` (Engine #1)~~ Both VTS and active trading now use `calculatePairRegime()` from `market-regime.ts`.
- **Impact**: ~~Same pair gets different regimes depending on code path.~~ Regime models unified. VTS ML calibration and production use the same 5-regime canonical model.
- **Resolution**: DSS rewired to call `calculatePairRegime()` (Directive 12.3.1). Engine #1 (DSS legacy) replaced with Engine #2 (canonical).
- **Phase Found**: Pre-audit, deepened Phase 2 (ChatGPT/Replit analysis)

### ~~RISK-002~~: OHLC Indicator Computation Duplication — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Location**: ~~VWAP, SMA computed independently in signal-orchestrator.ts AND strategy-engine.ts~~ MCE now centralizes VWAP/SMA/ATR computation. Signal orchestrator and VTS runner both call `MCE.computeContext()`.
- **Resolution**: Market Context Engine (MCE) installed as centralized indicator service (Batch 14). Signal orchestrator's inline VWAP/SMA computation replaced with MCE pre-computed values. VTS runner's direct `calculatePairRegime()` calls replaced with MCE. Note: strategy-engine.ts retains internal VWAP/SMA methods — these operate on different data subsets (session candles, specific SMA lengths) and are not the same duplication MCE fixes.
- **Phase Found**: Pre-audit

### ~~RISK-003~~: DSS Gating Prevents PATTERN and HYBRID Strategies — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Directive 12.3.1 + 12.3.2, Batch 13, commit `4d8ef060`)
- **Location**: ~~DSS limits to 9 quant strategies, blocking pattern-recognizer.ts and hybrid-integration.ts~~ DSS now uses canonical map with 17 strategies (9 quant + 3 pattern + 5 hybrid). 8 new strategy modules implemented.
- **Resolution**: DSS rewired to `CANONICAL_REGIME_STRATEGY_MAP` (12.3.1). 8 new strategy modules created in `server/strategies/` (12.3.2). Signal orchestrator wired with evaluation blocks for all new strategies.
- **Phase Found**: Pre-audit

### ~~RISK-004~~: Strategy Key Mismatch — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Phase 14.1, Batch 15, HF6B commit `ae431e17`)
- **Location**: `server/services/vts-runner.ts` line 363
- **Resolution**: Added `case 'range_trade':` fallthrough alias alongside existing `case 'range_trading':` in VTS callStrategyDetect(). Both names now route to detectRangeTrading().
- **Phase Found**: Pre-audit

### RISK-005: HybridScore Falls Back to Confidence
- **Severity**: MEDIUM
- **Location**: `signal-orchestrator.ts` line 498
- **Impact**: Effective FinalScore for QUANT signals is 0.7 × confidence + 0.1 (regime absent)
- **Timing**: During MCE (PAD-001)
- **Phase Found**: Pre-audit, verified Phase 1

### RISK-006: RegimeWeight Defaults to 0.5
- **Severity**: MEDIUM
- **Location**: `signal-orchestrator.ts` line 499
- **Impact**: Regime classification has no influence on signal ranking
- **Timing**: During MCE (PAD-002)
- **Phase Found**: Pre-audit, verified Phase 1

### RISK-007: Confidence Scale Inconsistency
- **Severity**: MEDIUM
- **Location**: Strategy engine outputs 0-1, some validation checks expect 0-100
- **Timing**: During MCE (PAD-003)
- **Phase Found**: Pre-audit

### RISK-008: Engine Not Integration-Tested Since Phase 8
- **Severity**: HIGH
- **Location**: System-wide
- **Impact**: Runtime errors expected on first reactivation
- **Timing**: Pre-live
- **Phase Found**: Pre-audit

### RISK-009: Dual Friction Models in Signal Orchestrator — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.2, Batch 2 (2026-02-22), commit `8393a1ef`
- **Severity**: HIGH
- **Location**: `signal-orchestrator.ts` lines 557 and 1122 (pre-fix)
- **Problem**: Two different friction calculations in the same file:
  - Line 557: `computeTotalRoundTripCost(fee, slippage, spread)` from cost-model.ts — **CORRECT**
  - Line 1122: `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100` flat percentage — **INCORRECT**
- **Resolution**: All `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` friction consumers replaced with `getCachedCostMetrics(symbol)` + `computeTotalRoundTripCost()` from cost-model.ts:
  - signal-orchestrator.ts DSS evaluation loop (line ~1122) — now uses per-pair cost metrics
  - signal-orchestrator.ts DSS_TRADE_SNAPSHOT capture (line ~1165) — now uses per-pair cost metrics
  - expectancy.ts `evaluateTradeExpectancy()` (line ~520) — now calls cost-model directly instead of `calculateFriction()`
  - analysis-utils.ts `calculateFriction()`, `calculatePerUnitFriction()`, `getFrictionRate()` — ~~marked `@deprecated`, zero runtime callers~~ **PHYSICALLY REMOVED** (Directive 12.2.5, Batch 11, commit `b3a1526c`). vts-service.ts (last active caller) migrated to canonical cost model.
- **Impact of fix**: The old code underestimated friction by 72× (0.01% vs 0.72% for default cost metrics). The DSS NetEV gate now correctly accounts for real trading costs.
- **Phase Found**: Phase 1 (ChatGPT review, Kyle-confirmed)

### RISK-010: Rolling Normalization Is Legacy Infrastructure — **RESOLVED**
- **Status**: **RESOLVED** — Batch 55, commit `f52c87e1` (2026-04-10)
- **Resolution**: RollingNormalizer class and all 3 instances removed from quality_index.ts as part of full CWQI/NGC purge. AdaptiveRelevance linkage removed. All rolling normalization infrastructure eliminated.
- **Severity**: MEDIUM
- **Location**: `quality_index.ts` — RollingNormalizer class (lines 108-205), 3 instances (lines 207-209)
- **Problem**: Since NGC is legacy (Kyle-confirmed), the rolling normalization infrastructure serving NGC is also legacy. Three RollingNormalizer instances exist (NGC, ProfitRate, ExpectedReturn) with 500-sample/60-minute sliding windows. The smoothing factor is driven by VTS learning parameters via adaptive relevance — unnecessary coupling.
- **Phase Found**: Phase 1 (ChatGPT review, Kyle-confirmed as legacy)

---

## UNIFICATION RECOMMENDATIONS

### UNIFY-001: Friction Model Consolidation — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.2 (Batch 2) + Directive 12.2.5 (Batch 11, commit `b3a1526c`)
- **Current State**: `cost-model.ts` is the canonical friction provider for ALL friction calculations:
  - ✅ `calculateFriction()`, `calculatePerUnitFriction()`, `getFrictionRate()` **REMOVED** from analysis-utils.ts (Directive 12.2.5, Batch 11)
  - ✅ `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` removed from signal-orchestrator.ts friction paths (Directive 12.1.2, Batch 2)
  - ✅ `computeTotalRoundTripCost()` used in signal-orchestrator.ts, expectancy.ts, and vts-service.ts
  - ✅ `vts-service.ts` migrated from `calculateFriction()` to canonical `getCachedCostMetrics()` + `computeTotalRoundTripCost()` (Batch 11)
  - ⬜ `cost-metrics.updateCostData()` costFactor calculation for sizing — not yet addressed (separate concern, non-blocking)
- **Remaining work**: costFactor sizing path (separate concern, tracked independently)
- **Phase Found**: Phase 1

### UNIFY-002: Confidence Authority Consolidation (NGC Is Legacy — Kyle Confirmed) — **RESOLVED**
- **Status**: **RESOLVED** — Batch 55, commit `f52c87e1` (2026-04-10)
- **Resolution**: All CWQI/NGC computation, rolling normalization, AdaptiveRelevance linkage, NGC confidence carrier paths, and exported SQE thresholds (MIN_NGC, MIN_CWQI, MAX_RISK, MIN_PROFIT_RATE) removed. quality_index.ts gutted to retain only active signal metric helpers. 116 files changed, 8261 lines removed in full Walter/CWQI/NGC purge.
- **Original State**: NGC was a legacy metric that was not fully removed. Kyle confirmed: "Anywhere where we have NGC in the code is a mistake. NGC is not a calculation that we want to be using anymore."
  - **NGC** (Phase 8.8): Blended from base confidence, volatility, risk, profitRate via rolling normalization. Stateful, adaptive. **LEGACY — should not be active.**
  - **PredictiveConfidence** (Phase 11): Planned as sole confidence authority. Deterministic. **TARGET state.**
- **Phase Found**: Phase 1 (Kyle-confirmed 2026-02-15)

### UNIFY-003: DI Source Consolidation — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.1, Batch 1 (2026-02-22)
- **Resolution**: NGC-derived DI path eliminated. Signal orchestrator now uses `calculateDirectionalIntegrity(closePrices)` — the same geometric function used by the Expectancy Gate. All DI inputs to the kernel now come from geometric calculation.
- **Original State**: Two DI sources feeding the same kernel:
  - Geometric DI: `calculateDirectionalIntegrity(prices)` — correct, from price data
  - NGC-derived DI: `normalizedConf * 100` — incorrect repurposing of confidence as DI
- **Phase Found**: Phase 1

---

## PHASE 2 FINDINGS

### RISK-011: Strategy Signal Audit Engine Uses Stale Metric Definitions — **RESOLVED**
- **Status**: **RESOLVED** — Batch 55, commit `f52c87e1` (2026-04-10)
- **Resolution**: strategy-signal-audit-engine.ts removed as part of full Walter/CWQI/NGC purge. All stale NGC/CWQI recomputation eliminated.
- **Severity**: MEDIUM
- **Location**: `server/services/strategy-signal-audit-engine.ts`
- **Problem**: Recomputed NGC, CWQI, and DI using simplified formulas that did not match actual pipeline computations. Since NGC was legacy (Kyle-confirmed), the entire audit engine's purpose was questionable.
- **Phase Found**: Phase 2

### RISK-012: Static Confidence Values Reduce FinalScore Discrimination
- **Severity**: LOW
- **Location**: `server/services/strategy-engine.ts` (all 8 strategies)
- **Problem**: 7 of 9 strategies return hardcoded confidence (0.65–0.75). Only VWAP Pullback (0.7–0.9) and DHMA (dynamic 0.1–0.95) produce variable confidence. Since FinalScore uses confidence at 30% weight, invariant confidence inputs reduce FinalScore's ability to distinguish signal quality.
- **Impact**: FinalScore rankings between strategies are dominated by HybridScore and RegimeWeight rather than signal-specific confidence.
- **Timing**: Post-MCE enhancement — make confidence dynamic based on signal quality indicators
- **Phase Found**: Phase 2

### RISK-013: Oversimplified Bullish Reversal Detection
- **Severity**: LOW
- **Location**: `server/services/strategy-engine.ts`, `detectBullishReversal()` method
- **Problem**: Volume check is `volume > 0` — trivially true for any non-zero volume. Reversal detection is effectively just "price within 2% of 24h low" with no volume comparison.
- **Impact**: Affects VWAP Pullback and Mean Reversion entry quality — may trigger on noise.
- **Timing**: Pre-MCE candidate (simple fix: compare volume to 1.5× average)
- **Phase Found**: Phase 2

### ~~BUG-006~~: DSS Uses Legacy SYSTEM_GUARDS.STRATEGY_MAP Instead of Canonical Map — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Directive 12.3.1, Batch 13, commit `4d8ef060`)
- **Location**: `server/services/dynamic-strategy-selector.ts`
- **Problem**: ~~DSS imports `SYSTEM_GUARDS.STRATEGY_MAP`~~ DSS now calls `calculatePairRegime()` from `market-regime.ts` and uses `CANONICAL_REGIME_STRATEGY_MAP` for strategy routing.
- **Resolution**: DSS `determineRegimeFromOHLC()` calls `calculatePairRegime()`. `getCandidatesForRegime()` uses canonical map with 17 strategies across 5 regimes. EXTREME_NOISE preserved as pre-filter (volNoise > 0.6), not a regime. Signal orchestrator converts Kraken OHLC to `OHLCData[]` and calls DSS for canonical regime classification. All 17 strategies (9 quant + 3 pattern + 5 hybrid) now flow through the trading pipeline.
- **Kyle-confirmed**: 2026-02-16
- **Phase Found**: Phase 2

### BUG-007: Hybrid Strategy Types in hybrid-integration.ts Are Legacy
- **Severity**: HIGH
- **Location**: `server/services/hybrid-integration.ts`, `selectHybridStrategy()` method
- **Problem**: Maps to legacy types (H1_TREND_SNIPER, H2_SLINGSHOT, H3_GATECRASHER, H4_MOMENTUM_LINK) that don't exist in the canonical map. The canonical hybrids are: pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge.
- **Fix**: Replace `selectHybridStrategy()` with canonical hybrid selection logic from `canonical-regime-strategy-map.ts`
- **Timing**: Concurrent with BUG-006
- **Phase Found**: Phase 2

### ~~RISK-014~~: Strategy Sync Only Covers 8 Quant Strategies — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Directive 12.3.2, Batch 13, commit `4d8ef060`)
- **Location**: `server/services/strategy-sync.ts`, CORE_STRATEGIES array
- **Resolution**: CORE_STRATEGIES updated to include all 17 canonical strategies (9 quant + 3 pattern + 5 hybrid). `range_trading` renamed to `range_trade` (canonical name). `dhma` added (was missing from original 8).
- **Phase Found**: Phase 2

### ~~RISK-015~~: Strategy Key Mismatch: `range_trading` vs `range_trade` — **RESOLVED**
- **Severity**: ~~LOW~~ **RESOLVED** (Directive 12.3.2, Batch 13, commit `4d8ef060`)
- **Location**: strategy-engine.ts, strategy-sync.ts, signal-orchestrator.ts
- **Resolution**: Canonical name is `range_trade`. Both `range_trading` (legacy alias) and `range_trade` are accepted in enabledStrategies. strategy-sync.ts uses canonical `range_trade`.
- **Phase Found**: Phase 2

### ~~BUG-008~~: Four Parallel Regime Classification Systems With No Cross-Reference — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Batch 13 `4d8ef060` + Batch 14 `8f26369a`)
- **Locations**:
  - ~~Engine 1~~: `server/services/dynamic-strategy-selector.ts` — **REPLACED** (Batch 13). DSS now calls `calculatePairRegime()`.
  - Engine 2: `server/core/metrics/market-regime.ts` — `calculatePairRegime()`. **CANONICAL — sole pair-level authority via MCE.**
  - Engine 3: `server/core/metrics/market-regime.ts` — `getNormalizedRegime()`. **Advisory only. Preserved for ML.**
  - ~~Engine 4~~: `server/services/market-profiler.ts` + `server/services/adaptive-regime.ts` — **REMOVED** (Batch 14). MCP/ARE deleted along with all 14+ L12-L20 consumer services.
- **Resolution**:
  - Batch 13 (Directive 12.3.1): Engine #1 (DSS legacy) replaced — now calls `calculatePairRegime()` (Engine #2). Active trading and VTS unified on same regime model.
  - Batch 14 (Phase 13 MCE): Engine #4 (MCP/ARE) fully removed. All 17 L-series services + 9 routes deleted. MCE installed as centralized indicator/regime service. Only Engine #2 (canonical, via MCE) and Engine #3 (advisory) remain. System now has ONE regime authority.
  - Batch 14-hotfix: `strategy_type` PostgreSQL enum expanded 9 → 18 values to match 17 canonical strategies.
- **Phase Found**: Phase 2 (ChatGPT/Replit review + Claude Code deep trace, Kyle-confirmed legacy 2026-02-16)

### ~~RISK-016~~: MCP/ARE Legacy System Creates Parallel Strategy Authority — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Location**: ~~`server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`~~ Both files DELETED.
- **Resolution**: MCP/ARE and all 14+ consumer services (the entire L12-L20 cluster) removed in Batch 14. No migration needed — the L-series was a closed supervisory loop with zero downstream impact on the active trading path. MCE installed as the sole centralized regime/indicator service.
- **Phase Found**: Phase 2 (Claude Code deep trace, ChatGPT verification, Kyle-confirmed legacy 2026-02-16)

### RISK-017: Bridge JSON Staleness Risk
- **Severity**: MEDIUM
- **Location**: `bridge/canonical/mapping-regime-strategy.json`, `server/core/strategy-mapper.ts`, `server/scripts/sync-canonical-bridge.ts`
- **Problem**: Bridge JSON is generated by sync script from canonical TS map. No automated staleness check — if TS is updated without re-running sync, `strategy-mapper.ts` serves stale data at runtime.
- **Fix**: Add hash/version comparison at startup, or have `strategy-mapper.ts` import directly from TS instead of JSON.
- **Timing**: Concurrent with BUG-006 fix
- **Phase Found**: Phase 2 (ChatGPT review, validated by Claude Code)

### RISK-018: Drift Detector Has No Calibration Baselines for Pattern/Hybrid Strategies
- **Severity**: MEDIUM
- **Location**: `server/services/drift-detector.ts`
- **Problem**: Monitors α/β/σ drift per strategy with 10-snapshot rolling window. When 8 new strategies (3 pattern + 5 hybrid) are activated via canonical wiring, drift detector has no historical baselines. First check will either error, skip, or falsely report drift.
- **Fix**: Initialize baseline snapshots during canonical wiring deployment. Consider warm-up period where drift detection is advisory-only for new strategies.
- **Timing**: Concurrent with BUG-006 fix
- **Phase Found**: Phase 2 (ChatGPT review, validated by Claude Code)

### ~~RISK-019~~: MCP Uses Stubbed Metrics for Regime Classification — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Location**: ~~`server/services/market-profiler.ts`, `classifyRegime()` method~~ File DELETED.
- **Resolution**: MCP/ARE removed entirely in Batch 14 (L12-L20 full removal). Stubbed metrics no longer feed any system. MCE uses real OHLC-derived indicators (VWAP, SMA, ATR, volatility, momentum, ADX) via `calculatePairRegime()`.
- **Phase Found**: Phase 2 (ChatGPT verification, Claude Code confirmed)

### ~~RISK-020~~: MCP/ARE Is Legacy Predecessor System, Never Decommissioned — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Location**: ~~`server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`~~ Both files DELETED.
- **Historical Context**: MCP/ARE was built Dec 27, 2025 under Directive 8.8.4-L12 as the original regime-to-strategy system. It was immediately LOCKED. Starting Jan 2026, the canonical regime map (Directive 11.7F) and DSS were built as replacement systems. Each new system was designed in isolation — neither acknowledged MCP/ARE's existence. MCP/ARE was left running in the background, feeding T1/T2/R1/V1/C1 classifications to 14+ services, while newer systems were built alongside it without coordination. The LOCK designation made it invisible during architectural discussions.
- **Problem**: ~~MCP/ARE continues to run on a 15-minute timer, computing regime classifications with stubbed metrics (RISK-019), applying strategy weights via its own matrix, and feeding exposure/risk multipliers to 14+ services~~ MCP/ARE and all L12-L20 consumer services fully removed.
- **Resolution**: Entire L12-L20 autonomy/RL cluster removed in Batch 14 (Phase 13). 17 L-series services, 9 route files, 1 M-series service, 2 utilities deleted (~8,200 lines). The cluster was a closed supervisory loop — none of its outputs reached the active trading path. MCE installed as centralized replacement.
- **Phase Found**: Phase 2 (Claude Code deep trace, ChatGPT/Replit verification, Kyle-confirmed legacy 2026-02-16)

---

## PHASE 3 FINDINGS

### BUG-009: Two Parallel Scanning Systems Running Simultaneously
- **Severity**: CRITICAL
- **Locations**:
  - `server/services/market-scanner.ts` — `MarketScanner` class (lines 385-1013)
  - `server/routes.ts` — line 87: `const marketScanner = new MarketScanner();` (instantiated at boot)
  - `server/routes.ts` — line 371: `marketScanner.startHourlyScanning()` (actively started)
  - `server/startup.ts` — lines 36, 57: Listed as core initialized service
- **Problem**: DawnTrader runs TWO independent scanning systems simultaneously:
  1. **FX5 Scanner** (30s cycles): `collectAdaptiveBatch()` → Active Filter Pool → Signal Orchestrator. Modern, adaptive, telemetry-driven.
  2. **MarketScanner class** (10-min cycles): Kraken OHLC → direct StrategyEngine → database signal storage. Legacy, per-user watchlists, 8 quant strategies only.
- **Impact**:
  - Double Kraken API load (both scanners call getTicker, getOHLCData independently)
  - Conflicting signal generation through completely different pipelines with no deconfliction
  - Conflicting cleanup operations (MarketScanner has its own expire/clean/archive routines)
  - Wasted computation (10-min scanner evaluates pairs FX5 already evaluates every 30s with better filtering)
- **Verified**: Yes — code-confirmed 2026-02-16. Initial Phase 3 audit incorrectly stated MarketScanner was "believed to be disconnected." ChatGPT flagged this assumption; grep verification proved it is actively instantiated and started in production boot sequence.
- **Fix**: Stop instantiating MarketScanner class in `server/routes.ts`. Remove `startHourlyScanning()` call. Remove from `startup.ts` service list. The `collectAdaptiveBatch()` function in the same file must NOT be removed.
- **Status**: **RESOLVED** — Directive 12.2.2, Batch 9 (commit `8b6bb540`). MarketScanner class removed. Only FX5 Scanner runs now.
- **Timing**: Pre-MCE — standalone fix, zero dependencies on MCE
- **Phase Found**: Phase 3 (ChatGPT review correction)

### RISK-021: Volume Bucket Threshold Inconsistency Between Modules
- **Severity**: LOW-MEDIUM (LOW today if buckets are never cross-compared; MEDIUM if risk guardrails, position sizing, UI dashboards, drift detector, or ML features ever reference bucket labels)
- **Locations**:
  - `server/services/active-filter-pool.ts` — `getSymbolVolumeInfo()`: High > $50M, Medium ≥ $10M, Low ≥ $1M, Very Low < $1M
  - `server/services/market-volume-cache.ts` — `classifyVolume()`: High ≥ $5M, Medium ≥ $500K, Low ≥ $50K, Very Low < $50K
- **Problem**: Two different volume bucketing schemes. A pair classified as "High" by market-volume-cache ($5M+) would be "Low" by Active Filter Pool ($50M+ required).
- **Fix**: Consolidate to a single volume bucketing function with explicit scope parameters, OR document that these serve intentionally different scopes.
- **Timing**: Anytime
- **Phase Found**: Phase 3

### RISK-022: adaptive-pool-config.ts Name Misleads About Its Purpose
- **Severity**: LOW
- **Location**: `server/services/adaptive-pool-config.ts`
- **Problem**: File name suggests scanning pool configuration. Actual content is ACT (Adaptive Concurrency Tuner) — controls concurrent signal processing slots (MIN=3, MAX=10), completely unrelated to scanning. Actual scanning pool config is in `SCANNER_PARAMS` within `adaptive-scan-manager.ts`.
- **Fix**: Rename to `act-concurrency-config.ts` or `signal-processing-pool-config.ts`
- **Timing**: Anytime
- **Phase Found**: Phase 3

### RISK-023: Adaptive Scanning Pipeline Depends on VTS Telemetry Integrity
- **Severity**: MEDIUM
- **Location**: `adaptive-ratio-manager.ts` → `telemetry-aggregator.ts` → VTS
- **Problem**: The entire adaptive scanning feedback loop depends on VTS telemetry health. If VTS is paused, misconfigured, or data-lagged: Ideal pool quality degrades, ratio manager biases toward default (0.7), batch composition becomes stale. The adaptive benefit is silently lost with no health check or alert.
- **Fix**: Add telemetry freshness check — emit warning when pool performance data is older than X cycles. Add VTS telemetry health to system health endpoint.
- **Timing**: Pre-MCE or during MCE
- **Phase Found**: Phase 3 (ChatGPT review)

### RISK-024: Cost Cache Synchronization Coupling
- **Severity**: LOW-MEDIUM
- **Location**: FX5 Scanner → `cost-cache.ts` (TTL: 5 min) → `cost-model.ts`
- **Problem**: FX5 writes spread data every 30s; cost cache TTL is 5 min; cost model depends on fresh cache. If scan errors/restarts cause cache misses, or symbol normalization diverges between writer and reader, friction scores revert to defaults silently.
- **Mitigations**: 30s refresh >> 5-min TTL; writes cover ALL evaluated pairs. Risk is low under normal operation.
- **Fix**: Verify symbol normalization consistency. Add "cache miss" metric to detect silent fallback.
- **Timing**: Anytime
- **Phase Found**: Phase 3 (ChatGPT review)

### RISK-025: History Filter Sequential Async Risk
- **Severity**: LOW
- **Location**: `market-scanner.ts` `collectAdaptiveBatch()` lines 1280-1286
- **Problem**: History filter calls Kraken OHLC per-pair sequentially over 300 pairs (Batch 18 — was 100). Cold cache (post-restart) could make up to 300 sequential API calls, potentially violating M31 (30s runtime limit).
- **Mitigations**: Results cached 24h per pair. Cache miss with error conservatively fails (null = fail). After first cycle, nearly all cached. OHLC cache (Batch 18) provides 5-min TTL caching for standard OHLC fetches, though history filter uses daily candles (different interval).
- **Fix**: Consider pre-warming cache during boot or batching history checks.
- **Timing**: Post-MCE (low priority, mitigations adequate)
- **Phase Found**: Phase 3 (ChatGPT review)

### RISK-026: DSE Diagnostics Use Legacy Regime Names
- **Severity**: LOW
- **Location**: `server/core/risk/dynamic-sizing-engine.ts` lines 287-288
- **Problem**: `getDSEDiagnostics()` references 6 regime names including `EXTREME_NOISE` and `LOW_VOL_CHOP` which do not match the canonical 5-regime taxonomy (`BULL_QUIET`, `BULL_VOLATILE`, `BEAR_QUIET`, `BEAR_VOLATILE`, `CHOPPY`). These are display/diagnostic only and do not affect sizing math.
- **Fix**: Update regime names in diagnostics to match canonical names
- **Timing**: Anytime (cosmetic, no trading impact)
- **Phase Found**: Phase 4

### RISK-027: GASP Is Itself Legacy — L-Series Autonomy Cluster (SUPERSEDED)
- **Severity**: MEDIUM → **RECLASSIFIED** (Kyle Addendum, 2026-02-16)
- **Location**: `server/services/gasp-coordinator.ts`
- **Original Problem**: GASP depends on legacy subsystems (MOF, DCE, APR-SLE, MCP).
- **Updated Status**: Kyle confirmed (2026-02-16) that GASP is itself legacy — part of the L-Series Autonomy Cluster. GASP is a supervisory layer that does NOT touch the active trade flow. It forms a closed loop with MOF/MACO/ECS/DCE/APR-SLE/MCP. No metric source migration needed — the entire L-Series cluster (GASP + all its sources) will be removed together in a coordinated wave.
- **Fix**: Remove GASP with entire L-Series autonomy cluster. No intermediate migration needed.
- **Timing**: During L-Series cluster removal wave
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### RISK-028: Goal Alignment Logic Is Formally Deprecated — Must Be REMOVED
- **Severity**: LOW → **MEDIUM** (elevated: formal deprecation directive, Kyle Addendum 2026-02-16)
- **Location**: `server/services/pre-execution-validator.ts` — entire goal alignment gate
- **Original Problem**: Only 3 of 17 strategies had risk profiles, making goal alignment flat for most strategies.
- **Updated Status**: Kyle formally deprecated Goal Alignment (2026-02-16). The Goals tab has already been removed from the UI. This is Walter-era legacy logic. Must be **REMOVED entirely** — not expanded, not defaulted to neutral, but deleted.
- **Removal scope**: `computeGoalAlignmentScore()`, `strategyRiskProfile` map, goal alignment gate logic, Walter/Bob provenance references. Check `profitability_vs_consistency` field in system_context for other consumers — remove if none.
- **Fix**: Delete all goal alignment code. Pre-Execution Validator becomes a two-gate system (risk checks + fee-aware profitability).
- **Timing**: Pre-MCE or during MCE — standalone removal, no MCE dependency
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### RISK-029: Paper Portfolio Manager Uses Hardcoded Starting Capital — ACCEPTED
- **Severity**: LOW-MEDIUM → **LOW** (Kyle accepted, 2026-02-16)
- **Location**: `server/services/paper-portfolio-manager.ts` lines 539-541, 670-672
- **Problem**: `checkPortfolioHealth()` and `calculateMaxDrawdown()` assume `startingCapital = 10000` (hardcoded) for exposure and drawdown calculations.
- **Kyle Decision (2026-02-16)**: Hardcoded $10,000 is acceptable for now. Optional future: throw error if portfolio_state.balance is missing.
- **Fix**: No immediate action. Optional future enhancement.
- **Timing**: Post-MCE (optional)
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### RISK-030: Coherency Rules YAML vs Database CHECK Constraint Mismatch
- **Severity**: LOW
- **Location**: `audit/coherency_rules.yaml` line 253 vs RULE_007
- **Problem**: The YAML's database enforcement section specifies `daily_loss_kill_switch_pct >= 1.00 AND <= 20.00` as a CHECK constraint, but RULE_007 in the same YAML and the guardrail-policy code both enforce `1.00-25.00`. The database constraint is stricter than the application rule.
- **Fix**: Align database CHECK constraint to match RULE_007 (1.00-25.00)
- **Timing**: Anytime (database migration needed)
- **Phase Found**: Phase 4

### RISK-031: EXECUTION_CONFIG.MAX_POSITION_RISK Contradicts Guardrails — DEFERRED
- **Severity**: MEDIUM
- **Location**: `server/config/execution-config.ts` line 15, `server/core/risk/dynamic-sizing-engine.ts` line 211
- **Problem**: `EXECUTION_CONFIG.MAX_POSITION_RISK = 0.02` (2%) is used by DSE as a hard cap on position size. However, `guardrails_v2.maxPositionPercentPct` defaults to 10% (live) or 30% (paper). The DSE cap at 2% is far stricter, meaning the guardrail's UI-visible `maxPositionPercentPct` may never be the binding constraint.
- **Kyle Decision (2026-02-16)**: Confirmed this is a real conflict. Do NOT change during audit phase. Add to cleanup docket for post-audit architecture session.
- **Fix**: Clarify whether DSE should use `maxPositionPercentPct` from guardrails_v2 or keep layered. Resolve during post-audit architecture session.
- **Timing**: Post-audit architecture session (deferred per Kyle)
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### BUG-010: TradingEngine Simulates Partial Fills With Math.random() in Live Mode — DEFERRED
- **Severity**: CRITICAL → **INFORMATIONAL** (Kyle, 2026-02-16: live mode deferred)
- **Location**: `server/services/trading-engine.ts` lines 346-388
- **Code**: `const isPartialFill = Math.random() < 0.1; // 10% chance`
- **Problem**: After placing a live market order via Kraken API, the engine simulates partial fills using random numbers instead of querying actual order status.
- **Impact**: In live trading, position quantity tracking would be randomly wrong. Non-blocking: paper mode is authoritative; live mode is deferred.
- **Kyle Decision (2026-02-16)**: Live mode execution is deferred. Paper mode is authoritative. Informational until live refactor. Future decision: refactor TradingEngine or rebuild from paper core.
- **Timing**: Deferred until live mode refactor
- **Fix**: Replace Math.random() logic with actual Kraken order status query.
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### BUG-011: TradingEngine Simulates Slippage/Fees With Math.random() in Live Mode — DEFERRED
- **Severity**: CRITICAL → **INFORMATIONAL** (Kyle, 2026-02-16: live mode deferred)
- **Location**: `server/services/trading-engine.ts` lines 391-393
- **Code**: `entrySlippage = Math.random() * 0.1; // 0-0.1% slippage`
- **Problem**: Entry slippage is assigned a random value and fees use a hardcoded taker rate instead of actual values from the fill response.
- **Kyle Decision (2026-02-16)**: Same as BUG-010 — live mode deferred. Informational.
- **Timing**: Deferred until live mode refactor
- **Fix**: Derive actual slippage from fill response. Same issue in `closeTrade()` at line 648.
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### BUG-012: TradingEngine Contains Second Active Goal Alignment Location
- **Severity**: HIGH
- **Location**: `server/services/trading-engine.ts` lines 128-254
- **Code**: `signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);`
- **Problem**: The TradingEngine computes Goal Alignment scores via `calculateGoalAlignmentScore()` and applies them to FinalScore with a 30% weight. Kyle formally deprecated Goal Alignment in Phase 4 (RISK-028), but the deprecation directive only referenced `pre-execution-validator.ts`. This is a second, independent implementation in the live-capable engine.
- **Impact**: If TradingEngine is used (live mode), FinalScore is modified by deprecated Goal Alignment logic, potentially overriding or conflicting with the canonical FinalScore from SQE.
- **Verified**: Yes — code-confirmed 2026-02-16
- **Timing**: **Pre-MCE** — should be removed alongside RISK-028 (Goal Alignment formal removal)
- **Fix**: Remove `calculateGoalAlignmentScore()` method and Goal Alignment score computation from `processSignal()`. Use FinalScore directly from signal without modification.
- **Phase Found**: Phase 5

---

### RISK-032: MicroExecutionService triggerSymbolCheck() Is a TODO Stub — ACCEPTED
- **Severity**: MEDIUM → **ACCEPTED** (Kyle, 2026-02-16: experimental/dormant)
- **Location**: `server/services/micro-execution-service.ts` — `triggerSymbolCheck()` method
- **Problem**: The method that should trigger execution when significant price deltas are detected is unimplemented.
- **Kyle Decision (2026-02-16)**: MicroExecutionService is an experimental micro-price execution prototype. Paper-only, dormant, non-interfering. Leave hidden. No removal required. Revisit only if micro-price trading becomes intentional.
- **Timing**: No action — accepted as dormant
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### RISK-033: trade-flow.ts StrategyType Lists 9 Strategies vs 17 Canonical
- **Severity**: LOW
- **Location**: `server/types/trade-flow.ts` lines 22-31
- **Problem**: The `StrategyType` union type only includes 9 strategies (the same set used by DSS/SignalOrchestrator). The canonical system defines 17 strategies (5 quant + 5 pattern + 5 hybrid + 2 special). This creates a TypeScript enforcement point where 8 strategy types cannot be properly typed through the trade flow layer.
- **Impact**: Low — consistent with BUG-002/BUG-003 (legacy strategy map) and will be resolved when those bugs are fixed. However, any MCE fix to BUG-002/003 must also update this type definition.
- **Timing**: Concurrent with BUG-002/003 fix
- **Fix**: Update `StrategyType` to include all 17 canonical strategies when legacy strategy map is replaced.
- **Phase Found**: Phase 5

### RISK-034: Failed RTB Promotion Does Not Restore Signal to Queue
- **Severity**: LOW
- **Location**: `server/services/paper-execution-engine.ts` — `checkRtbPromotion()` lines 1344-1375
- **Problem**: Per Directive A3.R1, signals are removed from the RTB queue BEFORE trade execution to prevent double-activation. If `executePromotedSignal()` subsequently fails, the signal is permanently lost — not restored to the queue.
- **Impact**: Low in practice — promotion failures should be rare, and new signals are continuously generated. However, in low-liquidity conditions with few signals, losing a valid signal could delay execution.
- **Timing**: Post-MCE (optional improvement)
- **Fix**: Consider adding a dead-letter queue or retry mechanism for failed promotions. Alternatively, add metrics to track promotion failure rate.
- **Phase Found**: Phase 5

### RISK-035: max_holding_period Exit Maps to Close Reason 'UNKNOWN'
- **Severity**: LOW
- **Location**: `server/services/paper-execution-engine.ts` — `closePosition()` close reason map
- **Code**: `'max_holding_period': 'UNKNOWN'`
- **Problem**: The `max_holding_period` exit condition maps to 'UNKNOWN' instead of a specific close reason enum value like 'MAX_HOLD'. This reduces diagnostic clarity when analyzing trade outcomes.
- **Timing**: Anytime (trivial fix)
- **Fix**: Add 'MAX_HOLD' to the close reason enum and map `max_holding_period` to it.
- **Phase Found**: Phase 5

### RISK-036: TradingEngine closeTrade() Uses Math.random() for Exit Slippage in Live Mode — DEFERRED
- **Severity**: MEDIUM → **INFORMATIONAL** (Kyle, 2026-02-16: live mode deferred)
- **Location**: `server/services/trading-engine.ts` line 648
- **Code**: `exitSlippage = Math.random() * 0.1;`
- **Problem**: Same class of issue as BUG-011 but on the exit side.
- **Kyle Decision (2026-02-16)**: Same as BUG-010/011 — live mode deferred. Informational.
- **Timing**: Deferred until live mode refactor — bundled with BUG-010/BUG-011
- **Fix**: Derive actual exit slippage from fill response.
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### RISK-037: NLAI System Is Legacy Conversational Control Infrastructure — **RESOLVED**
- **Severity**: MEDIUM → **FORMALLY DEPRECATED** (Kyle, 2026-02-16) → **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.2.7, Batch 4, commit `5d5c2051` (2026-02-24)
- **Resolution**: All 5 NLAI files deleted (nlai-interpreter.ts, contextual-nlai-interpreter.ts, nlai-execution-broker.ts, nlai-action-registry.ts, execution-policy-controller.ts). All references cleaned from 6 consuming files (routes.ts, live-trading-service.ts, auto_test_harness.ts, paper-sim-service.ts, config-update-service.ts, cognitive-tuner.ts). ActionResult type inlined in live-trading-service.ts. Chat handler in routes.ts now routes directly to intent-parser + command-router.
- **Original Problem**: NLAI (Natural Language Action Interpreter) was Walter AI's command bridge. It parsed chat commands, routed through execution broker, called service functions for guardrails/goals/watchlist/start-stop. Walter has been deprecated, conversational goal system removed, Goals tab removed.
- **Phase Found**: Phase 5 Addendum (Kyle directive)

### BUG-013: ML Service Client PredictionInput References Removed Phase-10 Fields
- **Severity**: MEDIUM
- **Location**: `server/services/ml-service-client.ts` — `PredictionInput` interface (line 30-31)
- **Problem**: The `PredictionInput` interface still references `ngc` (Normalized Global Confidence) and `cwqi` (Composite Weighted Quality Index), both of which were removed in Phase 10 in favor of `finalScore`, `hybridScore`, `predictiveConfidence`, and `regimeWeight`.
- **Impact**: If the Python ML service is re-enabled, it will receive stale field names. Callers must currently map Phase-10 metrics to legacy field names.
- **Verified**: Yes — interface confirmed in ml-service-client.ts
- **Timing**: During MCE or anytime (interface update only)
- **Fix**: Update `PredictionInput` to use Phase-10 canonical field names; update Python ML service to accept new fields
- **Phase Found**: Phase 6

### BUG-014: Retraining Freeze Controller Activates Phase 10 Freeze on Every Restart
- **Severity**: LOW
- **Location**: `server/services/retraining-freeze-controller.ts` — constructor (line 64)
- **Problem**: `activatePhase10Freeze()` is called unconditionally on every instantiation, imposing a 1-hour ML retraining block on every server restart. This was designed as a one-time deployment measure for the Phase 10.0 friction correction (0.26% → 0.50%) but persists as a stale artifact.
- **Impact**: Every restart delays ML calibration by 1 hour unnecessarily. In development, this may mask calibration issues.
- **Verified**: Yes — `this.activatePhase10Freeze()` confirmed in constructor
- **Timing**: Pre-MCE (easy fix — remove or gate behind config flag)
- **Fix**: Remove `activatePhase10Freeze()` from constructor, or gate behind a `PHASE10_FREEZE_ENABLED` environment variable
- **Phase Found**: Phase 6

### BUG-015: Dual Shutdown Handlers Create ML Service Shutdown Race Condition
- **Severity**: MEDIUM
- **Location**: `server/index.ts` (lines 1228-1259) and `server/core/boot_orchestrator.ts` (lines 51-73)
- **Problem**: Both `server/index.ts` and `server/core/boot_orchestrator.ts` independently register `SIGTERM`/`SIGINT` handlers. The boot orchestrator registers first (in constructor) and manages ML service shutdown (SIGTERM → 5s timeout → SIGKILL) and VTS Runner stop. The index.ts handler registers later and manages core services (RTB, DataAggregator, CentralClock, PriceCache, SystemHealth) and calls `process.exit(0)`. Since Node.js allows multiple handlers per signal, **both execute on shutdown**, but since index.ts calls `process.exit(0)`, the boot orchestrator's ML service graceful shutdown (which requires up to 5 seconds to send SIGTERM then SIGKILL) may be truncated or never complete.
- **Impact**: ML Python microservice may not receive graceful shutdown signal, potentially leaving orphaned processes. VTS Runner may not flush pending data.
- **Verified**: Yes — both handlers confirmed in source. Boot orchestrator: `process.on('SIGTERM', ...)` in constructor. Index.ts: `process.on('SIGTERM', ...)` in main IIFE.
- **Kyle Decision (Phase 7 Addendum)**: Post-audit investigation. No immediate change required.
- **Timing**: Post-audit cleanup (consolidate into single shutdown handler)
- **Fix**: Remove shutdown handler from boot_orchestrator.ts, add ML service and VTS shutdown to the index.ts handler **before** `process.exit(0)`, or use a coordinated shutdown controller.
- **Phase Found**: Phase 7

---

## ARCHITECTURAL RISKS (continued)

### RISK-038: VTS ML Calibration Performance Multiplier Is Noise-Modulated
- **Severity**: HIGH
- **Location**: `server/services/ml-calibration.ts` — `analyzePerformance()`
- **Problem**: The ML Calibration Service computes `performanceScore = finalScore × 0.5 + predictiveConfidence × 0.3 + regimeWeight × 0.2` to modulate the magnitude of weight adjustments. However, `finalScore` and `predictiveConfidence` are derived from **simulated** data in the VTS Runner (`simulateHybridScore()`, `simulatePredictiveConfidence()`), not from real strategy indicator calculations.
- **Consequence**: The **direction** of weight adjustments (INCREASE/DECREASE) is based on real win rate data (valid), but the **magnitude** of adjustments is modulated by noise. This may cause over- or under-adjustment of strategy weights.
- **Note**: This is downstream of BUG-001 (VTS signal generation is generic). Fixing BUG-001 would resolve this risk.
- **Timing**: During MCE (MCE-5 phase, bundled with BUG-001)
- **Phase Found**: Phase 6

### RISK-039: Reward Evaluator Output Is Not Consumed by Scoring Pipeline
- **Severity**: MEDIUM
- **Location**: `server/services/reward-evaluator.ts`
- **Problem**: The Reward Evaluator computes per-strategy, per-regime rewards (`R = α₁ × profit_rate + α₂ × win_rate − α₃ × drawdown`) every 30 minutes, but the audit found **no downstream consumer** of these reward values in any scoring, selection, or trading logic. The rewards are computed, persisted to disk, and emitted as events, but not consumed.
- **Kyle Decision (Phase 6 Addendum)**: Confirmed observability-only. Not harmful. Not integrated. Not a priority to connect.
- **Timing**: Post-MCE (architecture decision, low priority)
- **Phase Found**: Phase 6

### RISK-040: Five Walter-Era Learning Services — CONFIRMED LEGACY — **RESOLVED**
- **Status**: **RESOLVED** — Batch 55, commit `f52c87e1` (2026-04-10)
- **Resolution**: All remaining Walter-era learning services removed as part of full Walter/CWQI/NGC purge (116 files changed, 8261 lines removed). continuous-learning.ts, learning-coordinator.ts, learning-bridge.ts, learning-gate-validator.ts all deleted. All consuming service references cleaned.
- **Severity**: MEDIUM → **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum)
- **Location**: `server/services/continuous-learning.ts`, `learning-cycle-service.ts`, `learning-coordinator.ts`, `learning-bridge.ts`, `learning-gate-validator.ts`
- **Problem**: These 5 services formed a complete learning subsystem built for the Walter/Bob AI ecosystem with zero connection to the canonical VTS/ML pipeline.
- **Phase Found**: Phase 6 (confirmed by Phase 6 Addendum)

### RISK-041: Calibration β Coefficient Clamped to Conservative Range
- **Severity**: LOW
- **Location**: `server/utils/calibration.ts` — `linearFit()` (line 99)
- **Problem**: The linear fit clamps β to [0.05, 0.5], preventing the calibration from learning relationships with slopes greater than 0.5, even when data supports steeper slopes. This biases all calibrated profit predictions toward conservatism.
- **Note**: Conservative bias may be intentional (safer to under-predict than over-predict). Document this as a design decision or widen the range.
- **Timing**: Post-MCE (design decision)
- **Phase Found**: Phase 6

### RISK-042: VTS Service / VTS Runner Trade Duration Mismatch
- **Severity**: LOW
- **Location**: `server/services/vts-service.ts` (3-hour TRADE_DURATION) vs `server/services/vts-runner.ts` (24-hour MAX_HOLD_MS)
- **Problem**: The VTS Service defines a 3-hour trade window for legacy random simulation, while the VTS Runner uses a 24-hour max hold for real-price resolution. Since Directive 11.6D deprecated the VTS Service's trade resolution, the 3-hour window is dead code.
- **Impact**: None currently — the 3-hour window is only used by deprecated methods.
- **Timing**: Anytime (cleanup, bundled with VTS Service legacy method removal)
- **Phase Found**: Phase 6

### RISK-043: Strategy-Specific Signal Logic Is Not Implemented — Artificial Strategy Differentiation
- **Severity**: **CRITICAL** (Kyle, Phase 6 Addendum — "the core architectural problem in Phase 6")
- **Location**: `server/services/vts-runner.ts` — `generatePhase10Signal()`, `simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()`
- **Problem**: Although multi-strategy simulation (Directive 11.8C) is correctly implemented — iterating over ALL strategies compatible with a pair's regime — the underlying `generatePhase10Signal()` uses **identical generic scoring logic for ALL strategies**. Specifically:
  - `simulateHybridScore()` — regime-based lookup + random noise, NOT strategy-specific
  - `simulatePredictiveConfidence()` — derived from hybridScore, NOT strategy-specific
  - `simulateDecayPenalty()` — `Math.random() * 0.15`, fully random
  - FinalScore — identical formula for all strategies
  - Stop/Target logic — volatility-based, NOT strategy-specific
  - Entry logic — current market price for all strategies
- **Consequence**: The system simulates N strategies per pair, but all N produce signals from the same generic math. Only randomness and metadata labels differ. This means:
  - Per-strategy calibration is statistically diluted — calibration learns noise, not structural edge
  - Strategy comparisons are partially artificial — "Breakout" vs "Mean Reversion" produce effectively identical signals
  - ML magnitude adjustments are noisy
  - True structural edge cannot emerge
- **Relationship to BUG-001**: BUG-001 flagged simulated scoring inputs. RISK-043 is the deeper problem — even if scoring were real, all strategies would still use the same scoring logic. Strategy-specific signal generators are the prerequisite.
- **Required correction**: Each strategy must have unique entry logic, unique stop logic, unique target logic, and unique confidence modeling. This is MCE-level work.
- **Timing**: During MCE (MCE-5 phase or dedicated strategy engine sprint)
- **Phase Found**: Phase 6 Addendum (Kyle directive)

### RISK-044: Lazy Loader Contains LATTI Removal Stub — RESOLVED
- **Severity**: LOW
- **Location**: `server/startup/lazy-loader.ts` — LATTI Manager section (lines 37-40)
- **Problem**: The lazy loader still references the removed LATTI system (Directive 11.8B-B) with a stub function that logs a removal notice. This is correct transitional behavior but should be cleaned up once all references to LATTI are confirmed removed.
- **Impact**: None — the stub is harmless and produces only an informational log line.
- **Kyle Decision (Phase 7 Addendum)**: Part of broader LATTI/coherence residue investigation. Confirm whether residual `lattiManaged`, `lockedByUser`, `manualOverride` fields still serve active purpose. If LATTI is fully removed, eliminate all residual flags.
- **Timing**: Post-audit cleanup (bundled with LATTI file cleanup)
- **Phase Found**: Phase 7
- **Status**: **RESOLVED** — Directive 12.2.8, Batch 10 (commit `189fe0b2`). Lazy-loader stub removed. Remaining LATTI references: DB column names only (`tunedByLatti`, `managedByLottie`) — renaming requires migration.

### RISK-045: Schema Validator Defined But Call Site Unknown
- **Severity**: LOW
- **Location**: `server/bootstrap/schema-validator.ts` (Directive 11.7F)
- **Problem**: The schema validator (`validateSchemaVersions()`, `validateSchemaVersionsStrict()`) is defined but is not called from `server/index.ts` or any other startup file in the Phase 7 audit scope. The expected schema version `regime-mapping/v1.4b` is hardcoded. If this validator is not invoked during startup, schema mismatches between canonical TypeScript definitions and bridge JSON files would go undetected at runtime.
- **Impact**: Potential silent schema drift if validator is not called in CI/CD or elsewhere.
- **Timing**: Pre-MCE (verify call site; if missing, add to startup or CI/CD)
- **Phase Found**: Phase 7

### RISK-046: Health Monitor Auto-Recovery Actions Are All Placeholders
- **Severity**: MEDIUM
- **Location**: `server/services/health-monitor.ts` — `executeRecovery()`, `triggerAutoRecovery()`, Phase 41F-G
- **Problem**: The Phase 41F-G auto-recovery framework has a full implementation architecture (cooldown, circuit breaker, planned actions, dry-run mode, event emission) but **every recovery action handler is a placeholder**. Recovery handlers for queue purge, WebSocket reconnect, engine restart, market data reconnect, and queue flush all end with `success = true` after a `console.log`. No actual corrective action is taken.
- **Consequence**: The health monitor correctly detects anomalies, evaluates thresholds (Phase 41F-F), and tracks recovery history, but the system **cannot self-heal**. The circuit breaker and cooldown mechanisms protect against repeated recovery attempts, but there is nothing to recover from since no real action is taken.
- **Impact**: Degraded-to-critical conditions are detected and logged but require manual intervention.
- **Timing**: Post-MCE (enhance recovery handlers when stable enough to trust automated restarts)
- **Phase Found**: Phase 7

### RISK-048: routes.ts Is 23,349-Line Monolithic Router — Extreme Architectural Accumulation
- **Severity**: INFORMATIONAL
- **Location**: `server/routes.ts`
- **Problem**: The main router file contains ~635 inline API endpoints, 40+ service imports, full JWT auth middleware, rate limiting, WebSocket server, CSV generation, tax reporting, and the registration code for all 26 modular route files — all in a single 23,349-line file. This is the largest file in the entire codebase and the most extreme monolithic accumulation point.
- **Impact**: Same class of issue as RISK-047 (index.ts at 1,260 lines). High coupling, poor separation of concerns, difficulty testing individual route groups in isolation. Route changes require editing a 23K-line file.
- **Timing**: Post-audit cleanup (refactoring opportunity, not urgent)
- **Phase Found**: Phase 8

### RISK-049: Hardcoded JWT Fallback Secret in 9 Route Files — **RESOLVED**
- **Severity**: **CRITICAL** (security — if JWT_SECRET env var not set, auth is trivially bypassable)
- **Location**: `server/routes/market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `calibration.ts`, `paper_validation.ts`
- **Status**: **RESOLVED** — Directive 12.1.3, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: JWT fallback secrets removed from all 12 route files (9 original + regime-archive.ts + routes.ts JWT_SECRET + routes.ts JWT_REFRESH_SECRET). Server now throws a fatal error and refuses to start if `JWT_SECRET` or `JWT_REFRESH_SECRET` environment variables are not set. Fail-hard, fail-closed.
- **Original Problem**: If the `JWT_SECRET` environment variable was not set, all 9 route files fell back to a hardcoded string visible in source code. Any attacker who knew this string could forge valid JWT tokens.
- **Kyle Decision (Phase 8 Addendum, ADD-2)**: Eliminate fallback values entirely. Fail hard if `JWT_SECRET` is not defined.
- **Phase Found**: Phase 8

### RISK-050: Inconsistent JWT Fallback Secret in regime-archive.ts — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/routes/regime-archive.ts`
- **Status**: **RESOLVED** — Directive 12.1.3, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: Fallback secret removed. `regime-archive.ts` now uses the same fail-hard pattern as all other route files. No more inconsistent authentication behavior.
- **Original Problem**: Used a different fallback secret (`'your-secret-key'`) than all other route files. Tokens would be incompatible across endpoints if env var was missing.
- **Phase Found**: Phase 8

### RISK-051: Auth Bypass via `x-internal-audit` Header in 4 Route Files — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/routes/pricing.ts`, `calibration.ts`, `regime-archive.ts`, `paper_validation.ts`
- **Status**: **RESOLVED** — Directive 12.1.3, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: All `x-internal-audit` and `x-validation-session` bypass header checks removed from all 4 files. The `auditOrAuth` middleware functions now enforce JWT authentication on every request with no bypass path. Replit confirmed no dependency on these headers before removal.
- **Original Problem**: Any request with `x-internal-audit: true` header bypassed JWT authentication entirely. `calibration.ts` and `regime-archive.ts` also accepted `x-validation-session` as a second bypass.
- **Kyle Decision (Phase 8 Addendum, ADD-3)**: Remove entirely (option c selected).
- **Phase Found**: Phase 8

### RISK-052: 13 Route Files Have Zero Authentication
- **Severity**: MEDIUM-HIGH
- **Location**: `health.ts`, `status.ts`, `dse.ts`, `signal-audit.ts`, `audit.ts`, `back_audit.ts`, `provenance-debug.ts`, `vts-predictive-adjustments.ts`, `dce.ts`, `gasp.ts`, `mof.ts`, `pdc-ecs.ts`, `apr-sle.ts`
- **Problem**: 13 of 26 route files have no authentication middleware on any endpoint. This includes files with destructive/mutating operations: `health.ts` (POST recovery trigger, fault injection), `dse.ts` (POST reset), `audit.ts` (state-changing GET), `gasp.ts` (reset, rollback, recalibrate with unbounded inputs), `mof.ts` (evolve, reset), `pdc-ecs.ts` (reset, recalibrate), `apr-sle.ts` (reset, recalibrate), `provenance-debug.ts` (enable/disable debug, clear traces).
- **Mitigating factor**: L-Series files (dce, gasp, mof, pdc-ecs, apr-sle) will be removed with Wave 6. `status.ts` intentionally has no auth for health probes. `vts-predictive-adjustments.ts` is read-only.
- **Kyle Decision (Phase 8 Addendum, ADD-1)**: Standardize permission enforcement across all routes. L-Series files removed with Wave 6. Active files must have auth added during auth consolidation.
- **Timing**: For L-Series files → remove with Wave 6. For active files → add auth during ADD-1 consolidation.
- **Phase Found**: Phase 8

### RISK-053: Duplicated Auth Middleware Across 8+ Route Files
- **Severity**: MEDIUM
- **Location**: All route files with `requireAuth` copy-pasted inline
- **Problem**: The `requireAuth` function and `AuthenticatedRequest` interface are copy-pasted identically in 8+ route files instead of being imported from a shared module. Each copy duplicates JWT verification, the hardcoded fallback secret, and error handling. This middleware is NOT equivalent to the main `authenticateToken` middleware in routes.ts (which additionally fetches user from database on every request — fail-closed). Only `learning.ts` (unmounted) correctly imports from `../middleware/auth`.
- **Impact**: Security policy changes require updating 9+ files. Inconsistency between route-file auth (JWT only) and routes.ts auth (JWT + DB verification). Any security fix must be applied to all copies.
- **Kyle Decision (Phase 8 Addendum, ADD-1)**: Part of auth layer consolidation. Centralize to single middleware module with RBAC enforcement.
- **Timing**: During route cleanup or post-audit — refactor to centralized middleware module.
- **Phase Found**: Phase 8

### RISK-055: RBAC Not Enforced in Modular Route Files — Phase 8 Addendum ADD-1
- **Severity**: HIGH
- **Location**: All 8 route files with copy-pasted `requireAuth`: `market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `regime-archive.ts`
- **Problem**: The copy-pasted `requireAuth` middleware verifies JWT token validity but **never checks the user's role or permissions**. It decodes the token and attaches `req.user = { id, username }` — no role field is extracted or validated. Any authenticated user (including `viewer` role) can access all mutating endpoints in these files. Examples: `vts-audit.ts` POST `/update-mode` allows any user to switch system mode; `market.ts` POST `/regime/refresh` allows any user to force regime recheck; `calibration.ts` POST `/ml/trigger` allows any user to trigger ML calibration.
- **Contrast**: routes.ts uses `authenticateToken` (DB-backed) + `requireEditor`/`requireOwner` guards on mutating endpoints.
- **Kyle Decision (Phase 8 Addendum, ADD-1)**: Standardize permission enforcement across all routes. All mutating endpoints must enforce at minimum `editor` role. All admin/destructive operations must enforce `owner` role.
- **Timing**: During auth consolidation (post-audit or pre-MCE)
- **Phase Found**: Phase 8 Addendum

### RISK-056: No API Versioning — Phase 8 Addendum ADD-4
- **Severity**: LOW
- **Location**: All endpoints use unversioned `/api/*` paths
- **Problem**: No API versioning namespace. All endpoints use `/api/*` directly. Any breaking change to endpoint contracts requires coordinating frontend and backend deployments simultaneously. No path for graceful API migration.
- **Kyle Decision (Phase 8 Addendum, ADD-4)**: Introduce `/api/v1/` namespace before next major refactor.
- **Implementation**: Mount existing apiRouter at both `/api/v1` and `/api` (backward-compatible), migrate frontend, then deprecate unversioned paths.
- **Timing**: Post-audit cleanup (bundled with routes.ts refactoring)
- **Phase Found**: Phase 8 Addendum

### BUG-016: REST Violation — GET Method for State-Changing Operation in audit.ts
- **Severity**: LOW
- **Location**: `server/routes/audit.ts` — GET `/api/audit/trigger`
- **Problem**: Uses GET method for a state-changing operation (triggers system audit). GET requests should be idempotent per HTTP specification. This means browser prefetch, link crawling, or caching proxies could inadvertently trigger audits.
- **Timing**: Anytime (change to POST)
- **Phase Found**: Phase 8

### BUG-017: Internal Service Key Guard Bypass in rl.ts
- **Severity**: MEDIUM
- **Location**: `server/routes/rl.ts` — GET `/api/rl/internal/buffer`
- **Code**: `const expectedKey = process.env.INTERNAL_SERVICE_KEY; if (expectedKey && internalKey !== expectedKey) { ... }`
- **Problem**: If `INTERNAL_SERVICE_KEY` env var is empty string or not set, the guard is bypassed entirely (empty string is falsy in JavaScript). The internal buffer endpoint, intended only for ML service-to-service communication, becomes publicly accessible.
- **Kyle Decision (Phase 8 Addendum, ADD-3)**: Part of header bypass removal. Internal service auth must be fail-closed.
- **Timing**: Pre-MCE (change to fail-closed: reject if env var is not set)
- **Phase Found**: Phase 8

### RISK-054: vts.ts Route File at 1,425 Lines / 37 Endpoints
- **Severity**: LOW
- **Location**: `server/routes/vts.ts`
- **Problem**: Oversized route file with 37 endpoints covering VTS status, configuration, tuning, simulation control, and audit functions. Should be split into logical groupings (VTS core, VTS config, VTS audit). Contains functional overlap with `vts-audit.ts` (which adds 6 more endpoints at the same mount point).
- **Timing**: During VTS refactor or post-audit cleanup
- **Phase Found**: Phase 8

### RISK-047: Server Entry Point Is 1,260-Line Single File — Architectural Accumulation
- **Severity**: INFORMATIONAL
- **Location**: `server/index.ts`
- **Problem**: The entire server boot sequence, middleware configuration, route mounting, service initialization (~40+ services), lazy loading, scheduler registration, config audit telemetry, and graceful shutdown are all in a single 1,260-line file. This is a maintainability observation, not an active defect — the code is functional and well-organized with clear section comments.
- **Impact**: High coupling makes it harder to reason about boot order dependencies and to test individual startup modules in isolation.
- **Kyle Decision (Phase 7 Addendum)**: "Phase 7 does not indicate instability. It indicates architectural accumulation." Acknowledged as hygiene candidate for post-audit cleanup, not emergency defect.
- **Timing**: Post-audit cleanup (refactoring opportunity, not urgent)
- **Phase Found**: Phase 7

---

## PHASE 9 FINDINGS

### BUG-018: Dead History Import in App.tsx
- **Severity**: LOW
- **Location**: `client/src/App.tsx` — line 7
- **Code**: `import History from "@/pages/history";`
- **Problem**: `History` page component is imported but never rendered in any route. The history page was superseded by the Trade History tab in `active-trades.tsx`, but the import was never removed.
- **Impact**: Unnecessary bundle inclusion of a 253-line dead page component.
- **Verified**: Yes — grep confirmed `History` only appears on the import line in App.tsx, not in any JSX.
- **Timing**: Anytime (trivial fix — remove import)
- **Fix**: Remove the import statement.
- **Phase Found**: Phase 9

### BUG-019: Dead Watchlist Import in active-trades.tsx
- **Severity**: LOW
- **Location**: `client/src/pages/active-trades.tsx` — line 4
- **Problem**: `Watchlist` component is imported but never rendered in JSX. `useQuery` is also imported but never called in the page component. These are remnants from a previous page layout that was refactored into tabs.
- **Impact**: Unnecessary imports, potential bundle size.
- **Timing**: Anytime (trivial fix)
- **Fix**: Remove unused imports.
- **Phase Found**: Phase 9

### BUG-020: Simulated Current Price in Active Trades Component — **RESOLVED**
- **Severity**: MEDIUM
- **Location**: `client/src/components/trading/active-trades.tsx` — line 30
- **Status**: **RESOLVED** — Directive 12.1.4, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: Removed `entryPrice * 1.02` simulated price. Component now shows entry price with "(entry)" label and "Awaiting live price" for P/L column. The v2 component (`active-trades-v2.tsx`) already fetches real prices via WebSocket and is the correct production implementation.
- **Original Problem**: Current price was simulated as a hardcoded 2% gain above entry price. Users saw fabricated green P/L numbers with no connection to market reality.
- **Phase Found**: Phase 9

### BUG-021: system-config.tsx Uses Raw fetch() Instead of apiFetch
- **Severity**: LOW
- **Location**: `client/src/pages/system-config.tsx`
- **Problem**: Uses `fetch()` with `localStorage.getItem('token')` for API calls instead of the centralized `apiRequest` / `apiFetch` utilities. This bypasses the standard auth flow (token refresh, 30s timeout, 401 retry, `x-app-mode` header, request tracing).
- **Impact**: Config page could fail silently on expired tokens (no auto-refresh), has no timeout protection, and is missing the trading mode header.
- **Timing**: Anytime (moderate fix — refactor to use apiRequest)
- **Fix**: Replace raw `fetch()` calls with `apiRequest` from `@/lib/queryClient`.
- **Phase Found**: Phase 9

---

### RISK-057: 123 Console.log Statements Across Frontend — Production Logging Concern
- **Severity**: MEDIUM
- **Location**: Throughout `client/src/` — top offenders: `top-bar.tsx` (30), `api.ts` (16), `performance-profiler.ts` (12), `use-websocket.tsx` (11), `active-trades-v2.tsx` (11)
- **Problem**: 123 `console.log` statements persist in production code. Several are in high-frequency render paths (Phase 35.2A goal widgets log on every render, `api.ts` logs every API call). This causes:
  - Performance degradation on high-frequency components
  - Information leakage (API tokens, trading states, internal metrics visible in browser console)
  - Console noise obscures real errors
- **Fix**: Replace with conditional dev-mode logging (`import.meta.env.DEV && console.log(...)`) or remove entirely. The Vite build will tree-shake dev-only code.
- **Timing**: Pre-MCE (easy batch fix)
- **Phase Found**: Phase 9

### RISK-058: ~460 Server Endpoints Have No Frontend Consumer (ADD-5 Census)
- **Severity**: INFORMATIONAL
- **Location**: System-wide — frontend references ~291 of ~750 server endpoints
- **Problem**: The ADD-5 Endpoint Census found that approximately 460 server endpoints (~61% of total) have NO frontend consumer. Some of these serve legitimate purposes (internal service-to-service communication, scheduled jobs, external integrations), but many are likely dead API surface from removed features.
- **Recommended action**: During post-audit cleanup, use this census to identify and remove dead endpoints — particularly those in L-Series route files (already targeted for Wave 6), Walter routes (Wave 3), and speculative endpoints that were never implemented.
- **Timing**: Post-audit cleanup (use census data during Wave 3/6/8 removals)
- **Phase Found**: Phase 9

### RISK-059: enhanced-system-monitoring.tsx References ~60 Speculative/Aspirational API Endpoints
- **Severity**: LOW
- **Location**: `client/src/components/system/enhanced-system-monitoring.tsx`
- **Problem**: This single component references approximately 60 API endpoints, many across speculative/aspirational namespaces that almost certainly do not exist on the server: `/api/ethics/*`, `/api/collaboration/*`, `/api/federation/*`, `/api/knowledge/*`, `/api/oversight/*`, `/api/alignment/*`, `/api/introspection/*`, `/api/reasoning/*`. These were likely added as UI scaffolding for features that were never implemented.
- **Impact**: All calls to non-existent endpoints return 404s. React Query handles this gracefully (error states), but the dead references add unnecessary network requests and console noise.
- **Fix**: Audit which endpoints actually exist on the server. Remove references to non-existent endpoints. Consider whether this component should be simplified.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 9

### RISK-060: Walter Frontend Integration Will Break on Backend Removal (Wave 3) — RESOLVED
- **Status**: **RESOLVED** — Directive 12.2.3 Sub-Batch B, Batch 6 (2026-02-26), commit `1ea3bb38`
- **Severity**: MEDIUM (planning concern)
- **Location**: 7+ frontend files with Walter dependencies
- **Resolution**: Frontend Walter cleanup was absorbed into Sub-Batch B (Batch 6) alongside the backend removal. 5 frontend files deleted (`walter.tsx`, `walter-floating-assistant.tsx`, `walter-approvals.tsx`, `chat-file-attachment.tsx`, `useWalterPreferences.tsx`). App.tsx modified (removed Walter route, floating assistant render, getPageContext). sidebar.tsx modified (removed Walter nav item). Backend and frontend were removed in a single coordinated batch, preventing the broken-state window.
- **Phase Found**: Phase 9

### RISK-061: Per-TradeRow Settings Fetch Creates N+1 Query Pattern
- **Severity**: LOW
- **Location**: `client/src/components/trading/active-trades.tsx` — `TradeRow` component
- **Problem**: Each `TradeRow` component independently fetches `/api/settings` (for timezone information) with a 5-minute stale time. If there are 10 active trades, this creates 10 independent `useQuery` calls for the same endpoint. While React Query deduplicates concurrent requests, this is an anti-pattern that wastes query cache entries and could cause unnecessary re-renders.
- **Fix**: Lift the settings query to the parent component and pass timezone as a prop.
- **Timing**: Anytime (low priority optimization)
- **Phase Found**: Phase 9

### RISK-062: AJ16/AJ17 Naming Inconsistency in Diagnostics Card
- **Severity**: LOW
- **Location**: `client/src/components/goals/aj17-diagnostic-card.tsx`
- **Problem**: The file name and API paths reference "AJ17" while the card title and toast messages display "AJ16". This naming inconsistency could confuse developers maintaining the code.
- **Fix**: Align naming to a single identifier.
- **Timing**: Anytime (cosmetic)
- **Phase Found**: Phase 9

---

## PHASE 9 ADDENDUM — Kyle's Directives (2026-02-17)

> **Kyle's Final Position**: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit."

### RISK-063: JWT Token Storage in localStorage — XSS Exposure Risk (Phase 9 Addendum ADD-1)
- **Severity**: MEDIUM (security)
- **Location**: `client/src/lib/auth.ts` — `saveTokens()`, token retrieval throughout `api.ts`
- **Problem**: JWT access tokens and refresh tokens are stored in `localStorage`. This is the simplest storage mechanism but has a known security trade-off: any XSS vulnerability in the application (including third-party dependencies) allows an attacker to read and exfiltrate JWT tokens from `localStorage`. The 12-hour access token lifetime gives a large exploitation window.
- **Contrast**: `httpOnly` cookies cannot be read by JavaScript, preventing token exfiltration via XSS. A hybrid approach (httpOnly refresh cookie + in-memory access token) minimizes both XSS and CSRF risks.
- **Kyle Directive (Phase 9 Addendum ADD-1)**: Document this risk. Recommend future migration to secure cookie or hybrid approach.
- **Recommended migration path**:
  1. Move `refreshToken` to an `httpOnly`, `Secure`, `SameSite=Strict` cookie
  2. Keep `accessToken` in memory only (not localStorage) — short-lived, re-obtained via refresh cookie
  3. Add CSRF protection if cookie-based auth is adopted
  4. Reduce access token lifetime from 12 hours to 15–30 minutes
- **Timing**: Post-audit (future security improvement — not urgent for paper-only mode)
- **Phase Found**: Phase 9 Addendum

### RISK-064: Monolithic Pages Require Component Decomposition (Phase 9 Addendum ADD-2)
- **Severity**: MEDIUM (maintainability)
- **Location**: `ai-transparency.tsx` (2,074 lines), `machine-learning.tsx` (1,985 lines), `analytics.tsx` (1,939 lines), `top-bar.tsx` (1,042 lines)
- **Problem**: Four frontend files exceed 1,000 lines each. These are unmaintainable monoliths where individual sections are tightly coupled. Bug fixes, feature changes, and code review are significantly harder in files this large.
- **Kyle Directive (Phase 9 Addendum ADD-2)**: Flag these files for component decomposition.
- **Decomposition strategy**: Each major section (tab, panel, data view) should be extracted into a standalone component with clear props/data contracts.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 9 Addendum

### RISK-065: No Centralized Polling Policy — Ad-Hoc Refresh Intervals (Phase 9 Addendum ADD-3)
- **Severity**: LOW
- **Location**: Throughout all hooks and components with `useQuery` refetch intervals
- **Problem**: Every hook and component defines its own polling interval ad-hoc. There is no centralized polling policy or shared constants. Intervals range from 5s (trading status) to 3,600s (database status) with no documented rationale for the specific values. Some inconsistencies: watchlist scan diagnostics polls at 10s (too aggressive for informational data), KillSwitchBanner polls `/api/settings` at 15s (could be WebSocket-driven instead).
- **Kyle Directive (Phase 9 Addendum ADD-3)**: Define standard refresh tiers:
  - **Critical** (5s): Trading status, real-time state
  - **Semi-critical** (15–30s): Health, active trades, alerts
  - **Informational** (60s+): Portfolio, briefs, settings
- **Fix**: Create a `POLLING_TIERS` constant in `lib/` that all hooks reference. Enforce via code review.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 9 Addendum

### Phase 9 Addendum ADD-4: Remove Speculative Endpoints
- **Status**: Directive — linked to RISK-059
- **Kyle Directive**: Clean `enhanced-system-monitoring.tsx`. Remove the ~60 speculative/aspirational API endpoints that generate unnecessary 404 network requests. Simplify the component to match actual system capabilities.
- **Timing**: Post-audit cleanup (can be bundled with ADD-2 decomposition)

### Phase 9 Addendum ADD-5: Remove Simulated Price Display — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.4, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Kyle Directive**: Replace `entryPrice * 1.02` hardcoded simulation with real price feed from price cache or WebSocket price stream.
- **Resolution**: Simulated price removed. Shows entry price with honest "Awaiting live price" label. Full live price integration exists in v2 component.
- **Kyle's elevation**: BUG-020 timing confirmed as Pre-MCE by Kyle.

---

## REGISTRY METADATA

| Metric | Count |
|--------|-------|
| Total Bugs | 21 |
| Critical Bugs | 7 (BUG-001 through BUG-004, ~~BUG-006~~ RESOLVED, BUG-008 partial, ~~BUG-009~~ RESOLVED) |
| Informational Bugs | 2 (BUG-010, BUG-011 — deferred, live mode not in scope) |
| High Bugs | 2 (BUG-007, BUG-012) |
| Medium Bugs | 4 (BUG-013, BUG-015, BUG-017, BUG-020) |
| Low Bugs | 6 (BUG-005, BUG-014, BUG-016, BUG-018, BUG-019, BUG-021) |
| Architectural Risks | 65 (RISK-001 through RISK-065) |
| Critical Architectural Risks | 2 (RISK-043 — artificial strategy differentiation; ~~RISK-049~~ RESOLVED) |
| Informational Risks | 3 (RISK-047 — monolithic index.ts; RISK-048 — monolithic routes.ts; RISK-058 — endpoint census) |
| Phase 9 Addendum Risks | 3 (RISK-063 — XSS token exposure; RISK-064 — monolithic pages; RISK-065 — no polling policy) |
| Phase 9 Addendum Directives | 2 (ADD-4 — remove speculative endpoints; ADD-5 — remove simulated price) |
| Unification Recommendations | 3 |
| Kyle-Accepted/Deferred | 6 (RISK-029 accepted, RISK-031 deferred, RISK-027 superseded, BUG-010/011 deferred, RISK-032 accepted, RISK-036 deferred) |
| Formally Deprecated | 2 (RISK-028 — Goal Alignment, BUG-012 — Goal Alignment Location 2). ~~RISK-037~~ RESOLVED. |
| Confirmed Legacy | 1 (RISK-040 — 5 Walter-era learning services, confirmed Kyle Phase 6 Addendum) |
| Live Mode Deferred | 3 (BUG-010, BUG-011, RISK-036 — informational until live refactor) |
| Items Pre-MCE Timing | 20 (BUG-004, BUG-006, BUG-007, BUG-008, BUG-009, BUG-012, BUG-014, BUG-017, BUG-020, RISK-013, RISK-014/015, RISK-016/017/018, RISK-023, RISK-028, RISK-037, RISK-045, RISK-049, RISK-050, RISK-051, RISK-057) |
| Items During-MCE/Wave 6 | 18 (includes RISK-019, RISK-020, RISK-038, RISK-043) |
| Items L-Series Cluster Removal | 2 (RISK-027 — entire GASP removed with cluster; RISK-052 partially — L-Series route files) |
| Items Post-MCE/Anytime | 36 (includes RISK-021 through RISK-026, RISK-029, RISK-030, RISK-033, RISK-034, RISK-035, RISK-039, RISK-041, RISK-042, RISK-044, RISK-046, RISK-047, RISK-048, RISK-052 active files, RISK-053, RISK-054, RISK-055, RISK-056, RISK-058, RISK-059, RISK-060, RISK-061, RISK-062, RISK-063, RISK-064, RISK-065, BUG-016, BUG-018, BUG-019, BUG-021) |
| Items Post-Audit Architecture | 1 (RISK-031 — DSE cap authority) |
| Post-Audit Infrastructure Investigation | 9 systems flagged (Kyle Phase 7 Addendum — scheduler tasks, MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI residuals, CLE/CWA, Ethical Principles, Phase 17.0 Cluster) |

**Phase 4 Addendum applied**: RISK-027 superseded (GASP itself is legacy), RISK-028 elevated to formal deprecation, RISK-029 accepted by Kyle, RISK-031 deferred to post-audit.

**Phase 5 additions**: BUG-010/011 (TradingEngine placeholder code), BUG-012 (Goal Alignment second location), RISK-032 through RISK-036.

**Phase 5 Addendum applied**: NLAI formally deprecated (RISK-037). BUG-010/011/RISK-036 reclassified as informational (live mode deferred per Kyle). RISK-032 accepted (MicroExecution experimental/dormant). "Must Fix Before Live Trading" category replaced with "Live Mode Deferred" category.

**Phase 6 additions**: BUG-013 (ML Service Client stale interface), BUG-014 (retraining freeze stale deployment), RISK-038 through RISK-042.

**Phase 6 Addendum applied**: RISK-043 added (CRITICAL — artificial strategy differentiation, Kyle: "core architectural problem in Phase 6"). RISK-040 upgraded from POTENTIAL LEGACY to CONFIRMED LEGACY (5 Walter-era learning services). RISK-039 confirmed observability-only. BUG-014 confirmed for removal/manual trigger.

**Phase 7 additions**: BUG-015 (dual shutdown handlers race condition), RISK-044 through RISK-047. Three potential legacy systems flagged for Kyle confirmation: Phase 17.0 Cluster System (TaskRouter + TaskWorker), CLE/CWA scheduler tasks, Ethical Principles Seeder.

**Phase 7 Addendum applied**: Kyle's position: "Phase 7 infrastructure is stable. No hidden kill switches, no silent trade shutdown mechanisms. However, architectural accumulation requires post-audit cleanup." All 3 potential legacy systems reclassified from "AWAITING KYLE CONFIRMATION" to "POST-AUDIT CLEANUP INVESTIGATION REQUIRED." 6 additional systems added to post-audit investigation list: MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI/coherence residual flags, background scheduler tasks. New registry category added: "Post-Audit Infrastructure Investigation" (9 systems). BUG-015 timing updated from "Pre-MCE" to "Post-audit investigation." RISK-047 acknowledged as architectural accumulation.

**Phase 8 additions**: BUG-016 (REST violation — GET mutates state in audit.ts), BUG-017 (rl.ts internal service key bypass), RISK-048 through RISK-054. Major security findings: RISK-049 (CRITICAL — hardcoded JWT fallback in 9 files), RISK-050 (inconsistent JWT secret in regime-archive.ts), RISK-051 (x-internal-audit header bypass in 4 files), RISK-052 (13 unauthenticated route files), RISK-053 (duplicated auth middleware in 8+ files). Architecture: RISK-048 (routes.ts at 23,349 lines — largest file in codebase), RISK-054 (vts.ts at 1,425 lines / 37 endpoints).

**Phase 8 Addendum applied**: Kyle's position: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk." Five directives issued:
- **ADD-1 (RISK-055)**: RBAC enforcement inconsistency — modular route files verify JWT only but do not enforce role checks. Standardize permission enforcement across all routes.
- **ADD-2 (RISK-049/050)**: Remove JWT fallback secrets entirely. Fail hard if `JWT_SECRET` is not defined.
- **ADD-3 (RISK-051, BUG-017)**: Remove `x-internal-audit` header bypass. Replace with proper internal service key validation, signed internal JWT, or remove entirely.
- **ADD-4 (RISK-056)**: Create API versioning plan. Introduce `/api/v1/` namespace before next major refactor.
- **ADD-5**: Post-audit endpoint census — during Phase 9, cross-reference frontend usage against all endpoints, mark unused for removal.
Kyle decisions added to RISK-049, RISK-050, RISK-051, RISK-052, RISK-053, BUG-017. RISK-055 (RBAC gap) and RISK-056 (API versioning) added. Total: 17 bugs, 56 risks.

**Phase 9 additions**: BUG-018 (dead History import in App.tsx), BUG-019 (dead Watchlist import in active-trades.tsx), BUG-020 (simulated current price in active trades), BUG-021 (system-config bypasses apiFetch), RISK-057 through RISK-062. ADD-5 Endpoint Census completed: ~291 frontend endpoints vs ~750 server endpoints — ~460 endpoints with no frontend consumer. Major findings: 123 console.log statements (RISK-057), enhanced-system-monitoring.tsx references ~60 speculative endpoints (RISK-059), Walter frontend integration requires coordinated cleanup wave (RISK-060). Total: 21 bugs, 62 risks.

**Phase 9 Addendum applied**: Kyle's position: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit." Five directives issued:
- **ADD-1 (RISK-063)**: JWT tokens in localStorage create XSS exposure risk. Document and recommend migration to httpOnly cookie or hybrid approach. MEDIUM severity.
- **ADD-2 (RISK-064)**: Four monolithic pages (ai-transparency 2,074, machine-learning 1,985, analytics 1,939, top-bar 1,042 lines) flagged for component decomposition. MEDIUM severity.
- **ADD-3 (RISK-065)**: No centralized polling policy. Define standard refresh tiers: Critical (5s), Semi-critical (15–30s), Informational (60s+). LOW severity.
- **ADD-4**: Remove speculative endpoints from enhanced-system-monitoring.tsx (~60 aspirational API endpoints). Directive linked to RISK-059.
- **ADD-5**: Remove simulated price display (`entryPrice * 1.02`). Replace with real price feed. Directive linked to BUG-020. Kyle confirmed Pre-MCE timing.
Total: 21 bugs, 65 risks.

---

## PHASE 10 FINDINGS

### RISK-066: Zero Frontend Test Coverage — 189 Frontend Files With No Tests
- **Severity**: HIGH
- **Location**: `client/src/` — all 189 frontend files (25 pages, 133 components, 14 hooks, 9 lib, 2 contexts, 2 utils)
- **Problem**: No `*.test.tsx`, `*.spec.tsx`, or any test files exist under `client/`. React Testing Library is not installed. No component tests, integration tests, or snapshot tests exist for any frontend code. The entire frontend — including authentication flows, trading mode switching, WebSocket reconnection, and RBAC enforcement — has zero automated test coverage.
- **Impact**: Frontend regressions can only be caught manually or through the 3 Playwright E2E tests (which cover config snapshot and paper trading flow only, not individual component behavior).
- **Recommended**: Install `@testing-library/react` and `@testing-library/jest-dom`. Add Vitest config for client-side tests. Start with critical path components: auth flow, trading mode context, RBAC hook, WebSocket singleton.
- **Timing**: Post-audit (medium-term investment)
- **Phase Found**: Phase 10

### RISK-067: No CI/CD Pipeline — Tests Never Run Automatically
- **Severity**: HIGH
- **Location**: Repository root — no `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, or any CI/CD configuration
- **Problem**: The 60 test files are never automatically executed. No pipeline runs tests on pull requests, merges, or deployments. Tests only run when a developer manually invokes `npx vitest` or `npx playwright test`. This means regressions can be introduced without any automated safety net.
- **Impact**: Test suites may be silently broken. Schema version conflicts between tests may go undetected. Architectural invariant tests (codebase scanning) provide no value unless someone remembers to run them.
- **Recommended**: Create a GitHub Actions or GitLab CI pipeline that runs `vitest` on every push. Add Playwright E2E tests as a separate pipeline stage (requires running server).
- **Timing**: Post-audit (should be one of the first infrastructure improvements)
- **Phase Found**: Phase 10

### RISK-068: No Test Scripts in package.json — No Standard Entry Point
- **Severity**: MEDIUM
- **Location**: `package.json` — `"scripts"` section
- **Problem**: No `"test"`, `"test:unit"`, `"test:e2e"`, or `"test:integration"` scripts are defined. The only scripts are `dev`, `build`, `start`, `check`, `db:push`. New developers have no obvious way to discover or run the test suite. CI/CD pipelines cannot use the standard `npm test` command.
- **Fix**: Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:ui": "vitest --ui"`, `"test:e2e": "playwright test"`, `"test:coverage": "vitest run --coverage"`
- **Timing**: Anytime (trivial fix)
- **Phase Found**: Phase 10

### RISK-069: Schema Version Conflicts Across Tests — Staleness Gradient
- **Severity**: MEDIUM
- **Location**: Multiple test files assert different schema versions
- **Problem**: `schema_v1_5.test.ts` asserts `SCHEMA_VERSION === 'v1.5.0'` while `telemetry_persistence_sql.test.ts` asserts v1.5.2, `net_expectancy.test.ts` asserts v1.5.7, and `cost_cache.test.ts` asserts v1.5.8. If the shared `SCHEMA_VERSION` constant is at v1.5.8, then `schema_v1_5.test.ts` will fail. Multiple schema version assertions across different test files create a staleness gradient where older tests break silently.
- **Recommended**: Audit all schema version assertions. Remove version pinning from older tests or update them to match current versions. Consider making schema version assertions reference a single source of truth rather than hardcoded strings.
- **Timing**: Post-audit (should be addressed before enabling CI/CD)
- **Phase Found**: Phase 10

### RISK-070: Test Files for Deprecated Walter/Bob Systems — Will Break on Removal — RESOLVED
- **Status**: **RESOLVED** — Directive 12.2.3 (Batches 5-7B, completed 2026-02-26)
- **Severity**: LOW (planning concern)
- **Location**: `server/tests/diagnostic-system.test.ts` (466→414→~285 lines), `server/tests/phase-6.0-simulations.test.ts` (136→65 lines, cleaned in Batches 5+6)
- **Resolution (Walter)**: All Walter imports and test blocks removed from both test files in Batch 6. `phase-6.0-simulations.test.ts` retains only 2 Bob diagnostic tests (deferred to Bob cleanup batch). `diagnostic-system.test.ts` retains Tests 1-7 and 9+ (diagnostic-controller/bob-inspector tests); Test 8 (walterPatchAnalyst) removed.
- **Resolution (Bob)**: Batch 7B removed bobInspector import and Tests 4-7 from diagnostic-system.test.ts (~129 lines). All Walter/Bob test dependencies now fully removed.
- **Remaining**: `paper_validation_engine.ts` DCE/GASP references remain for Wave 6 (L-Series removal).
- **Phase Found**: Phase 10

### RISK-071: Standalone Test Scripts Not Discoverable by Test Framework
- **Severity**: LOW
- **Location**: `server/tests/diagnostic-system.test.ts`, `server/tests/live-pricing-validation.ts`, `server/tests/system-verify.ts`, `server/tests/test-force-trade.ts`
- **Problem**: Four test files use standalone script patterns (custom `main()`, `process.exit()`, shebang lines) rather than Vitest `describe`/`it` blocks. Some have `.test.ts` extensions despite not being framework tests, causing confusion. These cannot be discovered or executed by `vitest run` and require manual invocation via `tsx`. They also require a running server and database, making them environment-dependent.
- **Recommended**: Either convert to Vitest tests with proper setup/teardown, or rename to `*.script.ts` to distinguish from framework tests.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 10

### RISK-072: No Mocking Infrastructure — All Tests Require Real Dependencies
- **Severity**: LOW
- **Location**: All 60 test files
- **Problem**: No mocking framework is used anywhere in the test suite. Every test imports and exercises real service code. Integration and system tests require a running database and server. This makes tests high-fidelity but also fragile, slow, and impossible to run in isolated CI environments without full infrastructure.
- **Impact**: Cannot run tests in lightweight CI containers. Test failures cascade when shared services have initialization issues. Database state leaks between tests.
- **Recommended**: For critical path tests, introduce `vi.mock()` for external dependencies (database, Kraken API). Keep the current real-import approach for integration tests but add a separate "unit" tier that runs without infrastructure.
- **Timing**: Post-audit (long-term investment)
- **Phase Found**: Phase 10

---

## PHASE 11 FINDINGS

### RISK-073: ~71 Legacy Tables (~44% of Schema) — Dead Database Surface
- **Severity**: MEDIUM (capacity/maintenance)
- **Location**: `shared/schema.ts` — tables from Phases 8.6–18 (L-Series cognitive architecture, ethics/governance, distributed cluster), Walter tables, paper-specific duplicates
- **Problem**: Of ~160 tables defined in schema.ts, approximately 71 (~44%) serve deprecated or aspirational systems: 32 L-Series cognitive tables (Phases 8.6–10.0), 16 ethics/governance tables (Phases 11–16), 9 distributed cluster tables (Phases 17–18), 10 Walter tables, 3 paper-specific duplicate tables, and 1 superseded guardrails V1 table. These tables exist in the database consuming storage overhead and add 2,000+ lines to the schema definition.
- **Impact**: Schema file complexity (4,836 lines), ~40 legacy enum definitions that cannot be dropped while referencing tables exist, potential stale data accumulation, developer confusion about which tables are active.
- **Recommended**: After confirming tables are empty (zero rows), drop legacy tables in coordinated waves matching the existing removal plan (Wave 3 for Walter, Wave 6 for L-Series, etc.). Remove corresponding enum definitions after table drops.
- **Timing**: Post-audit cleanup (coordinate with existing removal waves)
- **Phase Found**: Phase 11

### RISK-074: Dual Migration Directories — Untracked Migration Files
- **Severity**: MEDIUM
- **Location**: `migrations/` (4 files, journal tracked) and `drizzle/migrations/` (5 files, no journal)
- **Problem**: Two separate migration directories exist. The Drizzle Kit journal (`migrations/meta/_journal.json`) only tracks 2 of the 4 files in `migrations/`. The 5 files in `drizzle/migrations/` have no journal at all. This means 7 of 9 total migration files are not tracked by the migration system. The primary migration mechanism (`drizzle-kit push`) bypasses migration files entirely, comparing schema.ts directly to the live database.
- **Impact**: No reliable migration history. Cannot reconstruct schema state at any point in time. Cannot replay migrations on a fresh database. No rollback capability.
- **Recommended**: Consolidate to a single migration directory. Ensure all migrations are tracked in the journal. Consider switching from `drizzle-kit push` to `drizzle-kit generate` + `drizzle-kit migrate` for a more controlled workflow.
- **Timing**: Post-audit (recommended before any production deployment)
- **Phase Found**: Phase 11

### RISK-075: No Database Pruning or Archival Strategy — 10 GB Limit
- **Severity**: MEDIUM
- **Location**: Neon PostgreSQL instance (10 GB limit), `server/services/database-monitor.ts`
- **Problem**: The database monitor checks size daily against a 10 GB Neon limit (warning at 6.5 GB, critical at 8 GB), but there is no mechanism to archive or prune old data. Active tables that grow continuously include: `telemetry_history`, `paper_sim_trades`, `paper_sim_trade_logs`, `execution_attempt_audit`, `rtb_signals`, `safety_telemetry`, `error_logs`, `kill_switch_events`, and various audit/log tables. With no TTL, retention policy, or archival process, these tables will grow until they hit the 10 GB limit.
- **Impact**: Eventually the database will fill up and operations will fail. Legacy tables with stale data compound the problem by consuming space that active tables need.
- **Recommended**: Implement retention policies for log/telemetry tables (e.g., 90-day rolling window). Drop legacy tables to reclaim space. Consider moving historical data to a separate archive database or file-based storage.
- **Timing**: Post-audit (should be addressed before sustained paper trading generates significant data)
- **Phase Found**: Phase 11

### RISK-076: storage.ts Monolith — Third-Largest File in Codebase
- **Severity**: LOW (maintainability)
- **Location**: `server/storage.ts` (4,580 lines)
- **Problem**: The data access layer is a single monolithic file containing all CRUD operations for all domains (trading, Walter, AI, goals, telemetry, diagnostics, etc.). At 4,580 lines, it is the third-largest file in the codebase after `routes.ts` (23,349) and `schema.ts` (4,836). Like `routes.ts`, this is an architectural accumulation pattern where each new feature added methods to the same file.
- **Impact**: Difficult to navigate, review, and test. Walter-related storage methods will become dead code on Wave 3 removal. No domain-specific boundaries.
- **Recommended**: Consider splitting into domain-specific storage modules (trading-storage.ts, walter-storage.ts, telemetry-storage.ts, etc.) during post-audit refactoring. This is a lower priority than routes.ts decomposition.
- **Timing**: Post-audit (anytime)
- **Phase Found**: Phase 11

### RISK-077: ~50 Untyped jsonb Columns — No ORM-Level Validation
- **Severity**: LOW
- **Location**: Throughout `shared/schema.ts` — ~50 columns use `jsonb` type
- **Problem**: Only 1 of approximately 50 jsonb columns uses Drizzle's `$type<>()` for TypeScript type safety (`system_config.systemFlags`). All other jsonb columns accept arbitrary JSON at the ORM level. Validation, if any, happens only at the application layer. This means malformed JSON can be written to the database without ORM-level rejection.
- **Impact**: Data integrity risk for jsonb columns. TypeScript provides no compile-time safety for jsonb reads/writes. JSON schema changes are not versioned.
- **Recommended**: Add `$type<>()` annotations to critical jsonb columns (at minimum: `strategy_settings.params`, `screener_filters.filterOverrides`, `system_context.metadata`).
- **Timing**: Post-audit (incremental improvement)
- **Phase Found**: Phase 11

### RISK-078: ~200+ Indexes Without Usage Audit
- **Severity**: MEDIUM
- **Location**: `shared/schema.ts` — index definitions across ~160 tables
- **Problem**: Over 200 indexes are defined but no `pg_stat_user_indexes` audit has been performed. Unused indexes consume storage, slow writes (every INSERT/UPDATE/DELETE must maintain the index), and increase vacuum overhead. Legacy table indexes (~71 tables worth) are maintained on every write operation even though the tables may be inactive.
- **Impact**: Write performance degradation, wasted storage, increased vacuum time. Particularly impactful on high-volume append-only tables (telemetry_history, execution_attempt_audit, paper_sim_trade_logs).
- **Recommended**: Run `pg_stat_user_indexes` to identify zero-scan indexes. Drop unused indexes. Review for duplicate/overlapping indexes.
- **Timing**: Post-audit (Phase E of database cleanup)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

### RISK-079: No Table Partitioning for Append-Only Tables
- **Severity**: MEDIUM
- **Location**: `shared/schema.ts` — `telemetry_history`, `paper_sim_trade_logs`, `execution_attempt_audit`, `safety_telemetry`, `error_logs`, `ai_audit_log`, `ai_transparency_log`
- **Problem**: High-volume append-only tables are not partitioned. All data is stored in a single heap per table. Queries on recent data must scan entire tables. Retention (deleting old rows) requires expensive DELETE operations rather than simple partition drops.
- **Impact**: Growing query latency as tables accumulate data. Difficult data retention. Vacuum overhead increases linearly with table size.
- **Recommended**: Implement time-based partitioning (monthly) for high-volume append-only tables. This enables efficient queries on recent data, simple retention via partition drops, and faster vacuum.
- **Timing**: Post-audit (Phase E of database cleanup)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

### RISK-080: Migration Drift — Schema Not Reconstructable from History
- **Severity**: MEDIUM
- **Location**: `migrations/`, `drizzle/migrations/`, `drizzle.config.ts`
- **Problem**: The database schema cannot be reconstructed from migration history alone. The initial migration captures schema at one point, but subsequent changes were applied via `drizzle-kit push` without generating migration files. 7 of 9 migration files are untracked. This means a fresh database cannot be reliably set up by replaying migrations, and there is no way to verify what schema version is running.
- **Impact**: Disaster recovery requires pg_dump, not migration replay. Cannot verify schema state. Cannot set up new environments reproducibly.
- **Recommended**: Perform migration rebaseline — generate a fresh baseline migration from current schema.ts. Archive old migration files. Switch to `drizzle-kit generate` + `drizzle-kit migrate` workflow.
- **Timing**: Post-audit (Phase D of database cleanup, recommended before production deployment)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

### RISK-081: LATTI Residual Fields in system_context Table — PARTIALLY RESOLVED
- **Severity**: LOW
- **Status**: **PARTIALLY RESOLVED** — Directive 12.2.1, Batch 8 (2026-02-27), commit `8086264c`
- **Location**: `shared/schema.ts` — `system_context` table, `server/storage.ts`
- **Problem**: The `system_context` table contains fields that are remnants of the deprecated LATTI (Latent Attention Through Transparent Intent) system. While the table itself is active (stores engine state and trading mode), LATTI-specific fields for coherence tracking, attention management, and intent tracking are dead weight. These fields have default values that are maintained but serve no active purpose.
- **Impact**: Schema noise, confusing field semantics for developers, potential for stale LATTI defaults to leak into active code paths.
- **Recommended**: Audit system_context columns, identify LATTI-specific fields, remove them in a targeted migration.
- **Timing**: During Wave 6 or dedicated cleanup pass
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)
- **Resolution**: Batch 8 removed 3 LATTI-specific ORM field definitions from `systemContext` in `schema.ts` and deleted the `lattiBaselineHistory` table ORM definition (+ insert schema + types). Physical database columns and table remain in Neon (no migration was run — only ORM definitions removed). Remaining LATTI-branded DB columns (`tunedByLatti`, `managedByLottie`, etc.) are still referenced by active code (`adaptive-guardrails.ts`) and cannot be removed without a migration + code update.

### RISK-082: No Data Retention Policy — Unbounded Row Growth
- **Severity**: MEDIUM
- **Location**: All log/telemetry/audit tables
- **Problem**: No data retention policy exists for any table. Every row ever written is preserved indefinitely. Given the 10 GB Neon limit, this is unsustainable — particularly for high-volume tables that grow with every trading cycle (telemetry_history, paper_sim_trade_logs, execution_attempt_audit, safety_telemetry, error_logs, RTB signals).
- **Impact**: Eventual database full condition, performance degradation as tables grow, inability to reclaim space from legacy data.
- **Recommended**: Define retention tiers: Hot (0–30 days, full fidelity), Warm (30–90 days, aggregate summaries), Cold (90+ days, archive or delete). Implement automated pruning via scheduled jobs.
- **Timing**: Post-audit (Phase E of database cleanup, should precede sustained trading)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

---

## PHASE 11 ADDENDUM — CORTEX AND TAB CATALOG FINDINGS

### RISK-083: Cortex System — Active but Undocumented Walter Dependency — **RESOLVED**
- **Severity**: MEDIUM
- **Location**: `server/services/cortex/cortex-core.ts` (393 lines), `cortex-config.yaml`, `cortex-memory.json`, `cortex-registry.json`, `analytics-scheduler.ts` (250 lines)
- **Problem**: The Cortex system is an ACTIVE in-memory caching/orchestration layer sitting between Bob modules and Walter. It maintains a TTL-based memory cache, performs snapshot syncs, and runs a 15-minute analytics cycle. It is initialized at startup via lazy-loader.ts, exposes 4 API endpoints (`/api/cortex/status`, `/api/cortex/snapshot`, `/api/cortex/flush`, `/api/cortex/force-sync`), and is consumed by 9+ service files (config-change-handler.ts, context-refresh-coordinator.ts, contextual-nlai-interpreter.ts, corpus-domain-service.ts, phase-8.6.5-enhancements.ts, purpose-layer.ts, bob-config.ts, autonomy-controller.ts, system-truth-diagnostic.ts). Despite being architecturally coupled to both Bob and Walter, Cortex was not mentioned in any prior audit phase. It must be included in Wave 3 (Walter/Bob removal) scope.
- **Impact**: If Walter/Bob are removed without removing Cortex, the Cortex system will continue running, consuming memory, executing 15-minute analytics cycles, and maintaining stale cache data with no consumers. The 9+ importing services would also need to be audited for Cortex dependencies.
- **Recommended**: Add Cortex to Wave 3 removal scope. 6 files to remove, 4 API endpoints to remove, 9+ consuming services to audit and decouple.
- **Timing**: During Wave 3 (Walter/Bob removal)
- **Phase Found**: Post-audit investigation (Cortex audit 2026-02-17)
- **Resolution**: Directive 12.2.3 Sub-Batch C (Batches 7A + 7B + 7B-hotfix, commit `39dc23b1`). All 5 Cortex files deleted (cortex-core.ts, analytics-scheduler.ts, cortex-config.yaml, cortex-memory.json, cortex-registry.json). All 4 API endpoints removed from routes.ts. All 9+ consuming services surgically decoupled. Cortex is fully removed.

### BUG-022: Duplicate Tab Value "learning" in enhanced-system-monitoring.tsx
- **Severity**: LOW
- **Location**: `client/src/pages/enhanced-system-monitoring.tsx` (~line 1300+ and ~line 2800+)
- **Problem**: Two separate `<TabsTrigger>` components share the same `value="learning"` attribute. In a Radix UI Tabs component, duplicate values cause the second tab to be unreachable — clicking it activates the first tab's content panel instead. The second "learning" tab (likely "Adaptive Learning" or similar) is effectively dead UI.
- **Impact**: One of the 27 tabs in enhanced-system-monitoring.tsx is unreachable. Minor UI bug but indicates the page has grown beyond maintainable complexity.
- **Verified**: Yes — discovered via automated tab catalog audit
- **Timing**: Post-audit (anytime)
- **Fix**: Rename the second tab's value attribute to a unique identifier (e.g., `"adaptive-learning"` or `"learning-metrics"`)
- **Phase Found**: Post-audit investigation (Tab catalog 2026-02-17)

### BUG-023: Regime Archive Data Wiped on Every Server Restart — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/index.ts` (startup sequence), `client/src/pages/machine-learning.tsx` (debug UI)
- **Status**: **RESOLVED** — Batch 18C, commit `c42283f1` (2026-03-10)
- **Resolution**: Three compounding issues fixed in 11 surgical edits across 2 files:
  1. **Primary**: Removed `clearArchiveForFreshStart()` call from server startup (index.ts). This function deleted all archive JSON files and reset the manifest on every Replit restart, destroying weekly archive data created by the cron job.
  2. **Secondary**: Removed debug UI scaffolding from machine-learning.tsx — yellow test button, `[DIAG]` console.log statements, WeakMap handler identity tracking, DOM visibility checks, mount/unmount trackers, render counters.
  3. **Minor**: Removed duplicate regime-archive route mount from index.ts (was mounted in both index.ts and routes.ts). Removed unused `regimeArchiveRouter` import.
- **Original Problem**: The Regime Archive tab on the Machine Learning page showed 0 records. A debug test button was visible in production UI. Root cause: `clearArchiveForFreshStart()` in the startup sequence wiped all archive data every time the server restarted (which happens frequently on Replit).
- **Phase Found**: Post-Batch 18 investigation (2026-03-10)

### BUG-024: VTS Pipeline Starved — Batch Size Hardcode + Relaxed Filter Dead Path — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/services/market-scanner.ts` (batch size), `server/config/system-guards.ts` (VTS thresholds)
- **Status**: **RESOLVED** — Batch 18E, commit `5d774fb2` (2026-03-10)
- **Resolution**: Two compounding bugs fixed in 4 surgical edits across 3 files:
  1. **Primary**: `targetBatchSize = 100` hardcoded in market-scanner.ts line 512. This Directive 11.4C-R2 refill mechanism was written when BATCH_SIZE was 100 and was missed during Batch 18's increase to 300. Changed to `SCANNER_PARAMS.BATCH_SIZE`.
  2. **Secondary**: `VTS_IMF_THRESHOLDS.VN_MAX = 0.80` matched `IMF_THRESHOLDS.VN_MAX = 0.80` (passive learning strict threshold), creating zero gap between strict and relaxed filtering. Market VN values are 0.82-1.00 on 60-min candles. VN_MAX raised to 0.95 to create a meaningful 0.80-0.95 relaxed gap. Stale "100-pair" comments fixed in adaptive-scan-manager.ts.
- **Original Problem**: VTS producing zero new simulated trades per session. FX5 scanner sometimes scanning only 100 pairs (should be 300). Log showed "0 relaxed-filter" pairs consistently. VTS received 1-45 non-benchmark pairs per cycle, all producing null from strategy detect functions.
- **Additional Findings (NOT bugs)**: 252 "conditions not met" nulls (expected — 8 pattern strategies require Phase 14.5 dual-path). sigma and VN data quality issues traced to priceHistory empty arrays — root cause fixed in Batch 18F (BUG-025).
- **Phase Found**: Post-Batch 18 investigation (2026-03-10)

### BUG-025: FX5 Scanner VN/σ/DI Computed on Empty Arrays — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/services/fx5-scanner.ts` (lines 502, 528-568)
- **Status**: **RESOLVED** — Batch 18F, commit `9de4afc7` (2026-03-10)
- **Resolution**: Three surgical edits in fx5-scanner.ts:
  1. **Import**: Added `import { ohlcCache } from './ohlc-cache.js'` — gives FX5 access to the OHLC cache singleton (Batch 18, 5-min TTL, ~720 60-min candles per symbol).
  2. **Pre-fetch loop**: Replaced `imfModule` dynamic import (passive-learning-only, VTS-cache-dependent, limited coverage) with universal OHLC pre-fetch loop that runs sequentially for all post-global-filter survivors (~60-70 per cycle). Results stored in `Map<string, number[]>` for synchronous access inside `.map()` chain.
  3. **IMF calculation block**: Replaced 3-branch conditional (passive+OHLC, passive+ticker, active+ticker) with single OHLC-first path. VN, DI, and Sigma now computed from real ~720 close prices. LQ unchanged (uses ticker-derived volume/trades/spread). Falls back to ticker data if OHLC unavailable.
- **Original Problem**: `priceHistory` and `history` fields declared in market-scanner.ts BatchResult interface but NEVER populated. `const prices = s.priceHistory || s.history || []` always resolved to `[]`. `calculateVolNoise([])` returned 0.5 (pairs passed VN≤0.60 strict filter for wrong reason — no data, not low noise). `calculateSigma([])` returned 0. `calculateDirectionalIntegrity([])` returned 0.5. The entire IMF classification operated on fabricated metrics.
- **Phase Found**: Post-Batch 18E investigation (2026-03-10)

### BUG-026: LQ (Log Liquidity) Saturates at 100 for All Crypto Pairs — **RESOLVED**
- **Severity**: MEDIUM
- **Location**: `server/services/fx5-scanner.ts` (LQ calculation)
- **Status**: **RESOLVED** — Batch 18G, commit `f82b7b66` (2026-03-10)
- **Resolution**: Two surgical edits in fx5-scanner.ts:
  1. **ohlcDataMap expanded**: `Map<string, number[]>` changed to `Map<string, { prices: number[], avgVolumeUSD: number }>`. Pre-fetch loop now computes per-candle average USD volume using `typicalPrice × volume` (same formula as imf-metrics.ts).
  2. **LQ formula replaced**: When OHLC data available, uses `log10(avgVolumeUSD + 1) * 10` instead of `calculateLogLiquidity(volumeUSD, tradeCount, spread)`. Standard formula retained as fallback when OHLC unavailable.
- **Original Problem**: The standard `calculateLogLiquidity(V, C, S)` in analysis-utils.ts uses `10 * (ln(V*C) - ln(S/C) - 10)` capped at `Math.min(100, raw)`. For crypto, 24h aggregate volume is so large that the formula always hits 100. All pairs showed LQ=100.0 — BTC/USD, memecoins, micro-caps, everything identical. The LQ≥40 filter (strict) and LQ≥25 filter (VTS) never excluded anything.
- **Fix Approach**: Per-candle volume on 60-min candles is ~1/24th of 24h volume, and `log10` instead of `ln` produces values in the 30-60 range — exactly where LQ thresholds can discriminate. Unified across both VTS and active trading paths.
- **Phase Found**: Post-Batch 18F monitoring (2026-03-10)

### BUG-027: VTS In-Memory Map Accumulates Stale Positions Indefinitely — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Batch 18I, commit `3d907032`, 2026-03-11)
- **Location**: `server/services/vts-runner.ts`, `resolveOpenVirtualTrades()` method
- **Problem**: The `openVirtualTrades` Map holds open VTS trades in memory. When price data is unavailable for a symbol (cache miss, API rate limit, delisted pair), the code executed `continue` BEFORE reaching the 24-hour timeout check. Trades with unavailable prices were never closed, accumulating indefinitely. DUP_GUARD checks found stale entries and blocked new trades on those symbol+strategy combos.
- **Impact**: 47 stale positions observed, ~1,041 DUP_GUARD blocks/day (47 combos x ~22 cycles). VTS throughput degraded over time as more symbol+strategy combos became blocked.
- **Resolution**: Moved timeout check (`holdDurationMs > MAX_HOLD_MS`) BEFORE the price availability check. Trades older than 24 hours are force-closed using live price if available, or entry price as fallback (0% gross P&L minus friction).
- **Phase Found**: Post-Batch 18H monitoring (2026-03-11)

### PERF-001: Pattern-Path Volume Confirmation Too Strict — Hard Gate Blocking Reversal Signals — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Batch 57, commit `ce5378f6`, 2026-04-11)
- **Location**: `server/services/strategies/support-bounce.ts`, `server/services/strategies/reverse-impulse.ts`
- **Problem**: All 8 pattern strategies had hard volume gates requiring 1.2-1.3x mean volume per candle. Quant strategies (mean_reversion, range_trading) had no such gate. Pattern pool admits lower-liquidity pairs via relaxed FX5 filters, which then hit the per-candle volume gate. In crypto's spiky volume environment, legitimate reversal setups were blocked by the strict threshold. "Volume Confirmation Failed" was the #1 pattern-path null reason (1,460 pattern vs 304 quant).
- **Impact**: Valid reversal signals on support_bounce and reverse_impulse blocked despite otherwise qualifying setups. Pattern-path signal generation suppressed disproportionately vs quant path.
- **Resolution**: Converted hard volume gate to graduated confidence factor for support_bounce and reverse_impulse. Scale: >=2.0x mean volume: bonus, >=1.2x: small bonus, >=0.8x: neutral, <0.8x: penalty. Breakout strategies (volume_expansion, breakout_fade, etc.) retain hard gates where volume confirmation is structurally essential.

### PERF-002: support_bounce Cluster Tolerance Too Strict for Crypto Support Zones — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Batch 57, commit `544955f0`, 2026-04-11)
- **Location**: `server/services/strategies/support-bounce.ts`
- **Problem**: SB_CLUSTER_TOLERANCE_BASE was set to 0.5%, which is too tight for crypto's wider support zones. Legitimate support bounces were rejected because nearby lows didn't cluster within the narrow tolerance, producing "No Valid Range" null reasons. Crypto pairs exhibit wider price dispersion around support levels than forex, requiring a more permissive clustering threshold.
- **Impact**: Valid support_bounce signals rejected at the cluster-detection stage. Contributed to the 10K "No Valid Range" null reasons observed in quant-pool diagnostics.
- **Resolution**: Widened SB_CLUSTER_TOLERANCE_BASE from 0.5% to 0.7%. Also added separate abcd_structure_not_found null reason for abcd_long to distinguish structural failures from generic "No Pattern Detected".
- **Phase Found**: Batch 57 pool-split null reason analysis (2026-04-11)

### BUG-029: Pattern-Strategy Mismatch — Global Best Pattern Sent to All Strategies — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Batch 57, commits `fb15bd34`, `b2822a3f`, 2026-04-10 to 2026-04-11)
- **Location**: `server/services/vts-runner.ts`, `server/services/signal-orchestrator.ts`, `server/services/strategies/adaptive-flow.ts`
- **Problem**: Both VTS and active trading path sent the single globally-strongest detected pattern to ALL strategies during signal generation. Each strategy received the same `patternInput` regardless of whether the pattern matched that strategy. Result: strategies that required a specific pattern (e.g., adaptive-flow needs THREE_SOLDIERS/MORNING_STAR) received mismatched patterns and returned "No Pattern Detected" nulls. Active trading path was worse — no strategy filtering at all. Additionally, adaptive-flow.ts had a pre-existing canonicalization bug: THREE_SOLDIERS canonicalizes to MORNING_STAR but the strategy only accepted THREE_SOLDIERS.
- **Impact**: ~125K "No Pattern Detected" nulls per 24h. "No Pattern Detected" was the #1 null reason at 38% of all pattern-path nulls. After fix, dropped to negligible. Post-fix, "Volume Confirmation Failed" became #1 pattern-path null reason (302 pattern vs 42 quant).
- **Resolution**: Batch 57 introduced `buildPatternInputForStrategy()` in signal-orchestrator.ts — each strategy now receives only its matching pattern. VTS runner updated with same per-strategy pattern routing. adaptive-flow.ts updated to accept both THREE_SOLDIERS and MORNING_STAR.
- **Phase Found**: Batch 57 investigation (2026-04-10)

### BUG-028: Fee Constants Fragmented — 4 Files Using Hardcoded Pre-Unification Values — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Batch 18J, commit `5eae1601`, 2026-03-11)
- **Location**: `paper-execution-engine.ts`, `routes.ts` (2 locations), `adaptive-thresholds.ts`, `cost-metrics.ts`
- **Problem**: The canonical fee source (`exchange-defaults.ts`, Directive 11.3B) correctly defines `DEFAULT_TAKER_FEE = 0.0026` (0.26%) and `DEFAULT_SLIPPAGE = 0.0005` (0.05%). However, 4 files still had OLD hardcoded values: paper-execution-engine (FEE=0.10%, SLIP=0.15%), routes.ts 2 locations (FEE=0.10%, SLIP=0.15%), adaptive-thresholds (FEE=0.10%, SLIP=0.15%), cost-metrics (FEE=0.25%). Paper trading was undercharging fees by ~0.16% per side (0.32% round trip), making paper results systematically more profitable than real trading.
- **Impact**: Paper trade P&L calculations showed inflated profits. The friction floor in `isSignalProfitable()` was 0.00365 instead of the correct 0.00575, allowing marginal signals through.
- **Resolution**: All 4 files migrated to import from `exchange-defaults.ts` using `DEFAULT_TAKER_FEE * 100` for percentage-based consumers and `DEFAULT_TAKER_FEE` for decimal-based consumers. cost-metrics.ts DEFAULT_FEE also corrected from 0.0025 to 0.0026.
- **Phase Found**: Batch 18J fee constant audit (2026-03-11)

---

## REPLIT LSP AUDIT CROSS-REFERENCE FINDINGS

### RISK-084: Deprecated RiskManager Class — 12 Import Locations, Not Removed
- **Severity**: MEDIUM
- **Location**: `server/services/risk-manager.ts`, imported in 7 files across 12 locations
- **Problem**: RiskManager was deprecated in Phase 8.8.3-H4, replaced by `checkGuardrailRisk()` from `trade-safety.ts`. However, it was never removed. It is still imported and instantiated in: `routes.ts` (4 locations), `test-guardrails.ts` (2), `paper-sim-diagnostic.ts` (3), `heuristic-trader.ts` (2 — dynamic import), `behavioral-template.ts` (2), `trading-state-sync.ts` (2 — dynamic import), `daily-brief.ts` (3).
- **Impact**: Deprecated risk management logic may still be exercised. Consumers may be calling outdated risk calculations that don't align with Guardrails V2 percentage-based model. Creates confusion about which risk management path is authoritative.
- **Recommended**: Systematic replacement across all 12 import locations. Replace with `checkGuardrailRisk()` from trade-safety.ts, then delete risk-manager.ts.
- **Timing**: Pre-MCE or during Wave 3 cleanup
- **Phase Found**: Replit LSP audit (Dec 2025), cross-referenced Feb 2026

### RISK-085: ~620 TypeScript LSP Errors Across Codebase
- **Severity**: LOW (informational)
- **Location**: Codebase-wide, concentrated in `routes.ts` (~211 errors), `storage.ts` (~66 errors), Walter services
- **Problem**: Replit LSP analysis (updated Jan 2, 2026) found ~620 TypeScript errors. Primary categories: type mismatches in routes.ts (211), schema mismatches in storage.ts (66), null/undefined parameter issues, Walter service type issues. The 211 errors in routes.ts and 66 in storage.ts are structural — tied to the monolithic file architecture already flagged in RISK-048 and RISK-076.
- **Impact**: TypeScript errors indicate potential runtime type safety issues. While many may be benign (type widening, strict null checks), some could indicate real bugs. The high error count also makes it harder to identify new genuine errors during development.
- **Recommended**: Address during routes.ts decomposition (RISK-048) and storage.ts modularization (RISK-076). A targeted pass on null/undefined parameter issues could be done independently.
- **Timing**: Post-audit (incremental, tied to monolith decomposition)
- **Phase Found**: Replit LSP audit (Dec 2025), cross-referenced Feb 2026

---

## Batch 58 — Phase 11 Finalization (2026-04-11)

### INFRA-001: Adjustment Registry + Authority Baseline — **IMPLEMENTED**
- **Severity**: MEDIUM (governance infrastructure)
- **Location**: `server/config/adjustment-registry.ts` (new), `server/config/authority-baseline.ts` (new), `server/core/boot_orchestrator.ts` (modified), `server/routes.ts` (modified)
- **What**: Phase 11 Finalization (Directives 11.8B-E + 11.8C). Created the Adjustment Framework governance document defining three tiers (evidence-adjustable / supervised / constitutional), parameter hierarchy, evidence-gating with three-mode hierarchy (Live > Paper > VTS), and safety guarantees. Created Authority Baseline V1.0 snapshot of all adjustable parameters (24 screener_filters rows, 150+ strategy constants, shared config). Implemented code-level parameter registry with bounds validation (log-only mode) and audit logging.
- **Files created**: `adjustment-registry.ts` (parameter bounds, validation, audit logging), `authority-baseline.ts` (baseline loader, drift detection), `ADJUSTMENT_FRAMEWORK.md`, `AUTHORITY_BASELINE.md`, `authority-baseline-v1.json`
- **Files modified**: `boot_orchestrator.ts` (startup validation + baseline load), `routes.ts` (log-only validation on `/api/filters-v2` PUT)
- **Impact**: No trading logic changes. No threshold changes. Validation is log-only (warns but never blocks). Startup validation is non-blocking. Baseline loader degrades gracefully if file missing.
- **Phase Found**: Phase 11.8B-E/11.8C (Batch 58)

---

## REGISTRY METADATA

| Metric | Count |
|--------|-------|
| Total Bugs | 28 |
| Critical Bugs | 7 (BUG-001 through BUG-004, ~~BUG-006~~ RESOLVED, BUG-008 partial, ~~BUG-009~~ RESOLVED) |
| Informational Bugs | 2 (BUG-010, BUG-011 — deferred, live mode not in scope) |
| High Bugs | 2 (BUG-007, BUG-012) |
| Medium Bugs | 6 (BUG-013, BUG-015, BUG-017, BUG-020, ~~BUG-027~~ RESOLVED, ~~BUG-028~~ RESOLVED) |
| Low Bugs | 7 (BUG-005, BUG-014, BUG-016, BUG-018, BUG-019, BUG-021, BUG-022) |
| Architectural Risks | 85 (RISK-001 through RISK-085) |
| Critical Architectural Risks | 2 (RISK-043 — artificial strategy differentiation; ~~RISK-049~~ RESOLVED) |
| Informational Risks | 3 (RISK-047 — monolithic index.ts; RISK-048 — monolithic routes.ts; RISK-058 — endpoint census) |
| Phase 9 Addendum Risks | 3 (RISK-063 — XSS token exposure; RISK-064 — monolithic pages; RISK-065 — no polling policy) |
| Phase 9 Addendum Directives | 2 (ADD-4 — remove speculative endpoints; ADD-5 — remove simulated price) |
| Phase 10 Risks | 7 (RISK-066 — zero frontend tests; RISK-067 — no CI/CD; RISK-068 — no test scripts; RISK-069 — schema version conflicts; RISK-070 — legacy test staleness; RISK-071 — standalone scripts; RISK-072 — no mocking) |
| Phase 11 Risks | 5 (RISK-073 — 71 legacy tables; RISK-074 — dual migration dirs; RISK-075 — no DB pruning; RISK-076 — storage.ts monolith; RISK-077 — untyped jsonb) |
| Phase 11 Addendum Risks | 6 (RISK-078 — index usage audit; RISK-079 — no table partitioning; RISK-080 — migration drift; RISK-081 — LATTI residuals; RISK-082 — no retention policy; RISK-083 — Cortex undocumented dependency) |
| Post-Audit Bugs | 1 (BUG-022 — duplicate tab value in enhanced-system-monitoring.tsx) |
| Unification Recommendations | 3 |
| Kyle-Accepted/Deferred | 6 (RISK-029 accepted, RISK-031 deferred, RISK-027 superseded, BUG-010/011 deferred, RISK-032 accepted, RISK-036 deferred) |
| Formally Deprecated | 2 (RISK-028 — Goal Alignment, BUG-012 — Goal Alignment Location 2). ~~RISK-037~~ RESOLVED. |
| Confirmed Legacy | 1 (RISK-040 — 5 Walter-era learning services, confirmed Kyle Phase 6 Addendum) |
| Live Mode Deferred | 3 (BUG-010, BUG-011, RISK-036 — informational until live refactor) |
| Items Pre-MCE Timing | 20 (BUG-004, BUG-006, BUG-007, BUG-008, BUG-009, BUG-012, BUG-014, BUG-017, BUG-020, RISK-013, RISK-014/015, RISK-016/017/018, RISK-023, RISK-028, RISK-037, RISK-045, RISK-049, RISK-050, RISK-051, RISK-057) |
| Items During-MCE/Wave 6 | 18 (includes RISK-019, RISK-020, RISK-038, RISK-043) |
| Items L-Series Cluster Removal | 2 (RISK-027 — entire GASP removed with cluster; RISK-052 partially — L-Series route files) |
| Replit LSP Cross-Reference Risks | 2 (RISK-084 — deprecated RiskManager 12 imports; RISK-085 — ~620 TS LSP errors) |
| Items Post-MCE/Anytime | 57 (includes RISK-021 through RISK-026, RISK-029, RISK-030, RISK-033, RISK-034, RISK-035, RISK-039, RISK-041, RISK-042, RISK-044, RISK-046, RISK-047, RISK-048, RISK-052 active files, RISK-053, RISK-054, RISK-055, RISK-056, RISK-058, RISK-059, RISK-060, RISK-061, RISK-062, RISK-063, RISK-064, RISK-065, RISK-066, RISK-067, RISK-068, RISK-069, RISK-071, RISK-072, RISK-073, RISK-074, RISK-075, RISK-076, RISK-077, RISK-078, RISK-079, RISK-080, RISK-081, RISK-082, RISK-084, RISK-085, BUG-016, BUG-018, BUG-019, BUG-021, BUG-022) |
| Items During Wave 3 Removal | 2 (RISK-070 — legacy test files; RISK-083 — Cortex system) |
| Items Post-Audit Architecture | 1 (RISK-031 — DSE cap authority) |
| Post-Audit Infrastructure Investigation | 9 systems flagged (Kyle Phase 7 Addendum — scheduler tasks, MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI residuals, CLE/CWA, Ethical Principles, Phase 17.0 Cluster) |

**Phase 4 Addendum applied**: RISK-027 superseded (GASP itself is legacy), RISK-028 elevated to formal deprecation, RISK-029 accepted by Kyle, RISK-031 deferred to post-audit.

**Phase 5 additions**: BUG-010/011 (TradingEngine placeholder code), BUG-012 (Goal Alignment second location), RISK-032 through RISK-036.

**Phase 5 Addendum applied**: NLAI formally deprecated (RISK-037). BUG-010/011/RISK-036 reclassified as informational (live mode deferred per Kyle). RISK-032 accepted (MicroExecution experimental/dormant). "Must Fix Before Live Trading" category replaced with "Live Mode Deferred" category.

**Phase 6 additions**: BUG-013 (ML Service Client stale interface), BUG-014 (retraining freeze stale deployment), RISK-038 through RISK-042.

**Phase 6 Addendum applied**: RISK-043 added (CRITICAL — artificial strategy differentiation, Kyle: "core architectural problem in Phase 6"). RISK-040 upgraded from POTENTIAL LEGACY to CONFIRMED LEGACY (5 Walter-era learning services). RISK-039 confirmed observability-only. BUG-014 confirmed for removal/manual trigger.

**Phase 7 additions**: BUG-015 (dual shutdown handlers race condition), RISK-044 through RISK-047. Three potential legacy systems flagged for Kyle confirmation: Phase 17.0 Cluster System (TaskRouter + TaskWorker), CLE/CWA scheduler tasks, Ethical Principles Seeder.

**Phase 7 Addendum applied**: Kyle's position: "Phase 7 infrastructure is stable. No hidden kill switches, no silent trade shutdown mechanisms. However, architectural accumulation requires post-audit cleanup." All 3 potential legacy systems reclassified from "AWAITING KYLE CONFIRMATION" to "POST-AUDIT CLEANUP INVESTIGATION REQUIRED." 6 additional systems added to post-audit investigation list: MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI/coherence residual flags, background scheduler tasks. New registry category added: "Post-Audit Infrastructure Investigation" (9 systems). BUG-015 timing updated from "Pre-MCE" to "Post-audit investigation." RISK-047 acknowledged as architectural accumulation.

**Phase 8 additions**: BUG-016 (REST violation — GET mutates state in audit.ts), BUG-017 (rl.ts internal service key bypass), RISK-048 through RISK-054. Major security findings: RISK-049 (CRITICAL — hardcoded JWT fallback in 9 files), RISK-050 (inconsistent JWT secret in regime-archive.ts), RISK-051 (x-internal-audit header bypass in 4 files), RISK-052 (13 unauthenticated route files), RISK-053 (duplicated auth middleware in 8+ files). Architecture: RISK-048 (routes.ts at 23,349 lines — largest file in codebase), RISK-054 (vts.ts at 1,425 lines / 37 endpoints).

**Phase 8 Addendum applied**: Kyle's position: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk." Five directives issued:
- **ADD-1 (RISK-055)**: RBAC enforcement inconsistency — modular route files verify JWT only but do not enforce role checks. Standardize permission enforcement across all routes.
- **ADD-2 (RISK-049/050)**: Remove JWT fallback secrets entirely. Fail hard if `JWT_SECRET` is not defined.
- **ADD-3 (RISK-051, BUG-017)**: Remove `x-internal-audit` header bypass. Replace with proper internal service key validation, signed internal JWT, or remove entirely.
- **ADD-4 (RISK-056)**: Create API versioning plan. Introduce `/api/v1/` namespace before next major refactor.
- **ADD-5**: Post-audit endpoint census — during Phase 9, cross-reference frontend usage against all endpoints, mark unused for removal.
Kyle decisions added to RISK-049, RISK-050, RISK-051, RISK-052, RISK-053, BUG-017. RISK-055 (RBAC gap) and RISK-056 (API versioning) added. Total: 17 bugs, 56 risks.

**Phase 9 additions**: BUG-018 (dead History import in App.tsx), BUG-019 (dead Watchlist import in active-trades.tsx), BUG-020 (simulated current price in active trades), BUG-021 (system-config bypasses apiFetch), RISK-057 through RISK-062. ADD-5 Endpoint Census completed: ~291 frontend endpoints vs ~750 server endpoints — ~460 endpoints with no frontend consumer. Major findings: 123 console.log statements (RISK-057), enhanced-system-monitoring.tsx references ~60 speculative endpoints (RISK-059), Walter frontend integration requires coordinated cleanup wave (RISK-060). Total: 21 bugs, 62 risks.

**Phase 9 Addendum applied**: Kyle's position: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit." Five directives issued:
- **ADD-1 (RISK-063)**: JWT tokens in localStorage create XSS exposure risk. Document and recommend migration to httpOnly cookie or hybrid approach. MEDIUM severity.
- **ADD-2 (RISK-064)**: Four monolithic pages (ai-transparency 2,074, machine-learning 1,985, analytics 1,939, top-bar 1,042 lines) flagged for component decomposition. MEDIUM severity.
- **ADD-3 (RISK-065)**: No centralized polling policy. Define standard refresh tiers: Critical (5s), Semi-critical (15–30s), Informational (60s+). LOW severity.
- **ADD-4**: Remove speculative endpoints from enhanced-system-monitoring.tsx (~60 aspirational API endpoints). Directive linked to RISK-059.
- **ADD-5**: Remove simulated price display (`entryPrice * 1.02`). Replace with real price feed. Directive linked to BUG-020. Kyle confirmed Pre-MCE timing.
Total: 21 bugs, 65 risks.

**Phase 10 additions**: RISK-066 through RISK-072. Major findings: zero frontend test coverage (RISK-066, HIGH), no CI/CD pipeline (RISK-067, HIGH), no test scripts in package.json (RISK-068), schema version conflicts across tests (RISK-069), test files for deprecated Walter/Bob systems (RISK-070), standalone scripts not discoverable by framework (RISK-071), no mocking infrastructure (RISK-072). Test suite inventory: 60 test files (~13,735 lines), 31 unit tests, 13 integration tests, 3 E2E tests (Playwright), 4 standalone scripts. Runtime validation: 5 runtime validation services + 15+ diagnostic services. Total: 21 bugs, 72 risks.

**Phase 10 Addendum applied**: Kyle's verdict: "Accurate. Grounded. Technically strong. Well-cataloged. Not inflated. Backend math QA is elite-tier. Frontend and API QA are light. Runtime validation systems are extensive but fragmented." Corrections: slightly overstated backend execution risk, understated frontend blind spot and legacy test contamination, did not address unified QA architecture. Five directives issued:
- **ADD-1**: Legacy test suite audit required — tag all tests referencing Walter/Bob/DCE/NGC/CWQI/NLAI. Per-test decision: remove/archive/refactor/keep behind legacy flag. Strengthens RISK-070 scope. Important distinction: tests that assert legacy metrics are _absent_ are positive architectural guards, not contamination.
- **ADD-2**: Create unified test runner scripts in package.json (`test:unit`, `test:e2e`, `test:all`). Standardize entry point even before CI exists. Addresses RISK-068.
- **ADD-3**: Frontend test introduction plan — minimum targets: auth token refresh, TradingModeContext, use-websocket reconnection, TopBar start/stop flow. Install @testing-library/react + jest-dom. Addresses RISK-066.
- **ADD-4**: Mark standalone scripts as operational QA tools (not regression tests) in documentation. Addresses RISK-071.
- **ADD-5**: Property-based testing for core math (optional, high ROI) — FinalScore invariants, VolNoise monotonicity, covariance positive semi-definiteness, regime classification determinism. Recommended framework: fast-check.
Total: 21 bugs, 72 risks (no new risks — all directives are improvement actions addressing existing risks).

**Phase 11 additions**: RISK-073 through RISK-077. Schema inventory: ~160 tables (4,836 lines), ~80 enums, ~71 legacy tables (~44% of schema). Major findings: legacy table bloat from aspirational L-Series/ethics/cluster systems (RISK-073, MEDIUM), dual migration directories with untracked files (RISK-074, MEDIUM), no database pruning strategy against 10 GB Neon limit (RISK-075, MEDIUM), storage.ts monolith at 4,580 lines (RISK-076, LOW), ~50 untyped jsonb columns (RISK-077, LOW). Migration infrastructure: 9 files across 2 directories, only 2 tracked in journal, primary mechanism is `drizzle-kit push` (no review step, no rollback). Total: 21 bugs, 77 risks.

**Phase 11 Addendum applied** (ChatGPT feedback + Cortex/Tab audit, 2026-02-17):
- **ChatGPT corrections**: "71 legacy tables" nuanced — some have active writers, need pre-drop audit. "No transactions" corrected to "limited transactions." Storage layer coupling order constraint added.
- **6 new risks from ChatGPT feedback**: RISK-078 (index usage audit, MEDIUM), RISK-079 (no table partitioning, MEDIUM), RISK-080 (migration drift/rebaseline, MEDIUM), RISK-081 (LATTI residual fields, LOW), RISK-082 (no data retention policy, MEDIUM), RISK-083 (Cortex undocumented dependency, MEDIUM).
- **Cortex system identified**: ACTIVE in-memory caching layer between Bob and Walter. 6 files, 4 API endpoints, 9+ consuming services. Must be included in Wave 3 removal scope (RISK-083).
- **Directive 12.2.3 Sub-Batch A** (Batch 5, commit `cc320466`): 9 Walter service files with zero external importers deleted (~2,792 lines). Test file `phase-6.0-simulations.test.ts` cleaned (7 tests removed). RISK-070 partially resolved. Directive completed in Batches 5-7B (see Directive 12.2.3 Completion Log below).
- **1 new bug from tab catalog**: BUG-022 (duplicate `value="learning"` in enhanced-system-monitoring.tsx, LOW). Second tab with same value is unreachable.
- **5-phase database cleanup strategy** endorsed from ChatGPT: Phase A (Isolation) → B (Modularization) → C (Schema Simplification) → D (Migration Rebaseline) → E (Index & Retention Hygiene).
Total: **22 bugs, 83 architectural risks**.

**Replit LSP audit cross-reference** (2026-02-17):
- **Source**: "Pre-Phase 9 Comprehensive Audit Report" by Replit (Dec 30, 2025, updated Jan 2, 2026).
- **2 new risks**: RISK-084 (deprecated RiskManager class, 12 import locations, MEDIUM), RISK-085 (~620 TypeScript LSP errors, LOW/informational).
- **Confirmed completed**: 4 legacy files deleted (F-001 to F-003, F-008), Guardrails V2 migration (F-004 to F-006), UnifiedFilterGateway created (F-007), CWQI friction standardization (F-010/F-011). All verified consistent with our audit findings.
- **Critical disagreements resolved**: Replit report listed Walter services, ConfigBob/BobCore, Goals Learning Engine, and WalterPurposeTab as "Do Not Touch" — all four are now confirmed LEGACY per Kyle decisions made after the Replit report was written (Feb 2026). The "Phase 13 restoration" plan for Walter referenced in the Replit report is superseded. Kyle's direction is permanent removal, not preservation.
- **RiskManager class**: Not previously captured in our audit. Deprecated since Phase 8.8.3-H4, replaced by `checkGuardrailRisk()` from trade-safety.ts, but still imported in 12 locations across 7 files.
Total: **22 bugs, 85 architectural risks**.

**ChatGPT System Manual review** (2026-02-17):
- **Source**: ChatGPT review of the consolidated SYSTEM_MANUAL.md (9,930+ lines).
- **Accepted recommendations**: Added System Authority Hierarchy (front-page quick reference), Legacy Clusters appendix (6 removal groupings), expanded "About" section with reading guidance for current-state vs intended-state labeling, Paper vs Live development authority clarification, MCP/ARE elevated to "High-Impact Legacy Cluster" classification.
- **Already addressed (no changes needed)**: VTS generic signal CRITICAL callout — already present as multi-paragraph FINDING block plus 5-point Critical Observations in Chapter 6. NGC contamination chain — already documented across multiple chapters with specific code locations. MCP/ARE 14+ consumer impact — already thoroughly documented in Chapter 2 with full consumer list, strategy matrix, exposure multipliers, timer, and Kyle's decision.
- **Declined**: Per-chapter "Reality Snapshot" blocks — Chapter 2 already has this (`⚠️ CRITICAL: Current State vs Intended State` block), and the new "About" reading guidance + Authority Hierarchy address this concern document-wide without repetitive per-chapter blocks.
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

**Directive Implementation Workflow established** (2026-02-19):
- Created `WORKFLOW.md` — 7-step directive lifecycle with templates (directive, review, completion report)
- Created `SYSTEM_IMPACT_MAP.md` — comprehensive component dependency map covering 30+ services across 11 layers, with upstream/downstream dependencies, blast radius ratings, and "If I Change X, Check Y" quick lookup table
- Created `directives/DIRECTIVE_INDEX.md` — master tracker for all Phase 12+ directives (18 directives pre-loaded for Phase 12)
- Created `sync-repo.bat` — one-click repository sync script (GitHub → local clone worktree)
- POST_AUDIT_ROADMAP.md revised to v2 — formal phase numbering (12-22), incorporated Kyle's Next Steps, Phase 11.8 final steps, Directional Bias, Short Trading, and ML planning documents (~43 week timeline)
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

**Replit onboarding & governance embedding** (2026-02-19):
- Created `REPLIT_ONBOARDING_PROMPT.md` — conversational prompt for onboarding Replit Agent to the directive workflow, covering role definition, Three Rules, directive protocol, prohibited/required actions, and review cycle expectations
- Updated `replit.md` (project root) — replaced Walter-era general overview with streamlined architecture reference + embedded Development Governance section (Three Rules, role definition, directive protocol, prohibited/required actions, reference document table). This file is read by Replit Agent at the start of every conversation, making the governance rules persistent.
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

**Document Update Package workflow — Step 7 revision** (2026-02-19):
- **Problem**: Step 7 originally said "Kyle: push updated docs to GitHub" but Replit is the only push path to GitHub. Claude Code writes doc updates locally, but those files need to reach GitHub through Replit.
- **Solution**: Introduced Document Update Packages (`DOC_UPDATE_X.Y.Z.md`) — Claude Code writes exact FIND/REPLACE edits for governance documents, Kyle sends the package to Replit, Replit applies verbatim and pushes.
- Updated `WORKFLOW.md` — revised Step 7 diagram, added When to Sync entry for doc update pushes, added full Step 7 explanation section, added Document Update Package template, updated Document Discipline principles
- Updated `replit.md` — added Document Update Packages section, updated prohibited actions with carve-out for packages provided by Kyle
- Updated `REPLIT_ONBOARDING_PROMPT.md` — added Document Update Packages section, updated review cycle description, updated prohibited/required actions, updated confirm understanding checklist
- Updated `SYSTEM_MANUAL_OVERVIEW.md` — revised directive flow diagram, updated "What Replit Must Do" list, revised "What Happens After Implementation" description
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

---

**AUDIT COMPLETE**: All 11 phases of the systematic repository audit are now finished. Post-audit addenda applied: ChatGPT Phase 11 feedback, Cortex investigation, frontend tab catalog, Replit LSP audit cross-reference, ChatGPT System Manual review, and directive workflow establishment. Final registry: **22 bugs, 85 architectural risks** across the full DawnTrader codebase.

---

*Registry now entering implementation phase. Future entries will track directive-resolved bugs/risks as they are completed.*

---

## DIRECTIVE 12.2.3 COMPLETION LOG (2026-02-26)

**Directive 12.2.3: Wave 3 — Walter/Bob/Cortex Removal — COMPLETE**

Total removal: ~17,100 lines across ~65 files over 7 batches (5, 5B, 6, 6B, 7A, 7B, 7B-hotfix).

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 5 (Sub-Batch A) | 9 Walter files with zero external importers | ~2,792 | `cc320466` |
| Batch 5B | Governance update | — | `8a286e64` |
| Batch 6 (Sub-Batch B) | 10 Walter backend + 1 middleware + 5 frontend + docs. 13 consuming files modified. 28 route handlers removed. | ~8,600 | `1ea3bb38` |
| Batch 6B | Governance update | — | `eaacf34c` |
| Batch 7A (Sub-Batch C) | 28 Bob/Cortex files + 3 directories + 718-file training data tree deleted | ~4,500 | `5fc79598` |
| Batch 7B (Sub-Batch C) | 12 consuming files surgically modified (routes.ts, index.ts, lazy-loader.ts, config-change-handler.ts, diagnostic-controller.ts, cognitive-interpreter.ts, phase-8.6.5-enhancements.ts, self-repair.ts, intent-executor.ts, context-refresh-coordinator.ts, enhanced-system-monitoring.tsx, diagnostic-system.test.ts) | ~1,000 | `8cc362cc` |
| Batch 7B-hotfix | 11 missed broken imports fixed across 4 files (routes.ts, reasoning-orchestrator.ts, autonomy-controller.ts). learning-cycle-service.ts deleted. | ~200 | `39dc23b1` |

**Risks resolved by this directive:**
- RISK-070 (legacy test files) — RESOLVED: All Walter/Bob test dependencies removed
- RISK-083 (Cortex undocumented dependency) — RESOLVED: All Cortex files, endpoints, and consuming service imports removed

**Test baseline progression:**
- Pre-directive: 816/81 (897 total)
- After Sub-Batch A (Batch 5): 809/81 (890 total, 7 Walter tests removed)
- After Sub-Batch B (Batch 6): 802/81 (883 total, 7 more Walter tests removed)
- After Sub-Batch C (Batch 7): 800/81 (881 total, 4 Bob tests removed, 2 tests net from file deletion)

---

## DIRECTIVE 12.2.1 COMPLETION LOG (2026-02-27)

**Directive 12.2.1: Wave 1 — Safe Deletions — COMPLETE**

Total removal: ~1,254 lines across 13 files in 1 batch.

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 8 | 2 files deleted (dhma.ts, latti-safety-monitor.tsx). 11 files modified: routes.ts (handleLATTITargets + comment), index.ts (LATTI audit→systemManaged), schema.ts (lattiBaselineHistory + 3 fields), enhanced-system-monitoring.tsx, target-daily-goals.tsx (full rewrite), 5 goal component text replacements, signal-orchestrator.ts (expectedDuration). | ~1,254 | `8086264c` |

**Risks addressed by this directive:**
- RISK-081 (LATTI residual fields) — PARTIALLY RESOLVED: ORM definitions removed, physical DB columns remain
- RISK-044 (lazy-loader LATTI stub) — UPDATED: All other LATTI residuals removed; lazy-loader stub (2 lines) remains

**Test baseline**: 800/81 (881 total) — unchanged

---

## DIRECTIVE 12.2.9 + 12.2.2 COMPLETION LOG (2026-02-27)

**Directive 12.2.9: Wave 9 — Frontend Dead Pages — COMPLETE**
**Directive 12.2.2: Wave 1.5 — MarketScanner Class Removal — COMPLETE**

Total removal: ~3,110 lines across 12 files in 1 batch.

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 9 | 6 frontend pages deleted (admin.tsx, analysis.tsx, command-center.tsx, history.tsx, search.tsx, settings-old-backup.tsx). MarketScanner class removed from market-scanner.ts (~637 lines). 5 consuming files cleaned (routes.ts, market-scan-task.ts, startup.ts, status.ts, App.tsx). | ~3,110 | `8b6bb540` |

**Bugs resolved by this directive:**
- BUG-009 (Two Parallel Scanning Systems) — RESOLVED: MarketScanner class removed, only FX5 Scanner runs

**Risks addressed:**
- RISK-081 (LATTI residual fields) — No change (remains PARTIALLY RESOLVED)

**Test baseline**: 800/81 (881 total) — unchanged

---

## DIRECTIVE 12.2.8 COMPLETION LOG (2026-02-27)

**Directive 12.2.8: Wave 8 — Walter-Era Learning Services + Residual Cleanup — COMPLETE**

Total removal: ~1,460 lines across 7 files in 1 batch.

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 10 | 3 dead services deleted (cognitive-interpreter.ts 589, event-broker.ts 247, phase-8.6.5-enhancements.ts 527). autonomy-controller.ts bug fixed (4 broken references). LATTi lazy-loader stub removed. [LATTIManager] log prefixes cleaned. 3 Walter storage methods removed. | ~1,460 | `189fe0b2` |

**Risks resolved by this directive:**
- RISK-044 (lazy-loader LATTI stub) — RESOLVED: Stub removed, only DB column names remain

**Test baseline**: 800/81 (881 total) — unchanged

---

## DIRECTIVE 12.2.6 + 12.2.5 COMPLETION LOG (2026-02-27)

**Directive 12.2.6: Wave 4.5 — Goal Alignment Gate Removal — COMPLETE**
**Directive 12.2.5: Wave 4 — Friction Model Unification — COMPLETE**

Total removal: ~1,440 lines across 10 files in 1 batch.

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 11 | **12.2.6**: alignment-verifier.ts + strategic-policy-guard.ts deleted (~758 lines). autonomy-controller.ts gate check removed. routes.ts: 7 /alignment routes + 3 strategicPolicyGuard refs + compliance endpoint removed (~180 lines). schema.ts: alignmentAuditLog + valueAlignmentMatrix tables + 3 derived types removed (~38 lines). enhanced-system-monitoring.tsx: AlignmentTab removed (~296 lines). **12.2.5**: vts-service.ts migrated to canonical cost model. 3 deprecated friction functions removed from analysis-utils.ts (~39 lines). expectancy.ts comment updated. | ~1,440 | `b3a1526c` |

**Items resolved by this batch:**
- UNIFY-001 (Friction Model Consolidation) — RESOLVED: All deprecated friction functions removed, all callers migrated to canonical cost model
- Phase 9.0 Alignment Verification System — REMOVED: AlignmentVerifier gate no longer blocks autonomy actions

**Items NOT resolved (separate systems):**
- RISK-028 (Goal Alignment in pre-execution-validator.ts) — Phase 4 system, separate from Phase 9.0
- BUG-012 (Goal Alignment in trading-engine.ts) — Phase 5 finding, separate from Phase 9.0

**Test baseline**: 800/81 (881 total) — unchanged

---

## PHASE 12.3 PIPELINE UNIFICATION COMPLETION LOG (2026-03-03)

**Directive 12.3.1: Regime Authority Resolution — COMPLETE**
**Directive 12.3.3: Confidence Authority Cleanup (NGC Removal) — COMPLETE**
**Directive 12.3.2: Strategy Routing Expansion (Implementation) — COMPLETE**

Total: 5 files modified + 10 files created = 15 files. ~4,000 new/modified lines across 1 mega-batch.

| Batch | Scope | Lines Changed | Commit |
|-------|-------|---------------|--------|
| Batch 13 | **12.3.1**: DSS rewired to `calculatePairRegime()`, canonical 5-regime model, EXTREME_NOISE pre-filter preserved. **12.3.3**: NGC replaced with deterministic confidence formula `(stratConf*0.60 + (1-vol)*0.20 + (1-risk)*0.20)`. Rolling normalization bypassed. **12.3.2**: 8 new strategy modules (morning_star, inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge). StrategySignal type 9→17. strategy-sync.ts updated to 17 strategies. Signal orchestrator wired with 8 new evaluation blocks. | ~4,000 | `4d8ef060` |

**Items resolved by this batch:**
- BUG-006 (DSS Legacy Strategy Map) — RESOLVED: DSS now uses canonical map with 17 strategies
- BUG-008 (Four Parallel Regime Systems) — PARTIALLY RESOLVED: Engine #1 replaced, Engine #4 (MCP/ARE) remains for Wave 6
- RISK-001 (VTS/Active Trading Regime Drift) — RESOLVED: Both paths use `calculatePairRegime()`
- RISK-003 (DSS Blocks Pattern/Hybrid) — RESOLVED: All 17 strategies flow through pipeline
- RISK-014 (Strategy Sync 8 Quant Only) — RESOLVED: Sync covers 17 strategies
- RISK-015 (range_trading vs range_trade) — RESOLVED: Canonical name `range_trade`, legacy alias accepted

**Items NOT resolved (separate scope):**
- BUG-008 Engine #4 (MCP/ARE) — deferred to Wave 6 (MCE). 14+ consumers need migration.
- RISK-017 (Bridge JSON Staleness) — not addressed in this batch
- RISK-018 (Drift Detector Baselines) — not addressed in this batch
- BUG-007 (hybrid-integration.ts legacy types) — not addressed, may be obsoleted by new strategy modules

**Test baseline**: 791/90 (881 total) — 9 new failures from strategy module interactions with existing tests

---

## Batch 40 — Migration to Hetzner + Supabase (2026-03-30)

| Category | Description |
|----------|-------------|
| **Infrastructure** | Migrated from Replit to Hetzner CPX22 staging server (188.245.193.8, Falkenstein). nginx reverse proxy with WebSocket upgrade, SSL-ready, rate limiting. PM2 process manager. |
| **Database** | Migrated from Neon serverless to Supabase PostgreSQL 17.6 (Frankfurt). Driver swap: `@neondatabase/serverless` to standard `pg`. Drizzle ORM adapter changed to `drizzle-orm/node-postgres`. 182 tables, full data imported. |
| **CI/CD** | GitHub Actions pipeline: typecheck, build, Docker build on every push to migration branch. Deploy-staging workflow template with TODO gates. |
| **Code cleanup** | Removed 3 Replit Vite plugins. Removed unused REPLIT/REPLIT_DEPLOYMENT env vars. Removed REPLIT_DEV_DOMAIN CORS handling. Disabled OpenAI-dependent imports (ai-analyst, ai-opportunities, daily-brief) to unblock Express startup. |
| **Workflow** | Adopted Post-Replit workflow (POST_REPLIT_WORKFLOW.md). Replit frozen. Clone repo now read-write on migration branch. Direct SSH deployment. |

**Items resolved:**
- Replit operational friction (Agent queue confusion, prompt truncation, browser automation fragility) — RESOLVED: direct SSH access
- Indirect deployment path (zip + INSTRUCTIONS.md + Agent) — RESOLVED: git-native workflow
- Limited log/DB access — RESOLVED: direct PM2 logs and psql to Supabase

**Items outstanding:**
- ai-analyst.ts full removal (legacy Walter code — currently disabled, not removed)
- Non-fatal DB column errors (some tables missing columns added in later batches)
- ML service not running on staging (python3 PATH issue)
- Sidebar toggle z-index fix needs testing across screen sizes

---

## PHASE 15a FIXES (Batch 59, 2026-04-12)

### FIX-B59-001: Regime Archive Field Name Mismatch
- **Severity**: HIGH (data correctness)
- **Location**: `server/core/logging/vts-telemetry.ts:148`
- **Problem**: Telemetry aggregator looked for `netProfitPercent`/`pnlPercent`/`profitPct` but VTS trades store `netProfit` (decimal). Fell through to 0 — 0% win rate and $0 P&L in all 39 regime archive entries despite 449+ trades being read.
- **Fix**: Added `netProfit` to fallback chain with `* 100` decimal-to-percent conversion.
- **Found by**: Claude Code pre-implementation audit (staging UI review)

### FIX-B59-002: Regime Archive PnL Double-Scaling (Langston Catch)
- **Severity**: HIGH (latent — activated by FIX-B59-001)
- **Location**: `server/core/logging/vts-telemetry.ts:158`
- **Problem**: `pnl += netProfitPercent * 100` — double-scaled percent to basis points. Harmless when always 0, 100x inflated once real data flows.
- **Fix**: `pnl += netProfitPercent` — removed redundant `* 100`.
- **Found by**: Langston code-level review

### FIX-B59-003: Mapping Drift Stale Sync Timestamp
- **Severity**: LOW (diagnostic display)
- **Location**: `canonical-regime-strategy-map.ts:38`, `sync-canonical-bridge.ts:67`
- **Problem**: Hard-coded `updatedAt: '2026-03-05T00:00:00Z'`, never refreshed. No automatic sync scheduler.
- **Fix**: Updated metadata, added `updatedAt` override in sync script, added daily `canonical_bridge_sync` scheduler task, MIN_SAMPLES 30→10.

### FIX-B59-004: ESM Compatibility — sync-canonical-bridge.ts
- **Severity**: MEDIUM (blocked force-sync API + scheduler task)
- **Location**: `server/scripts/sync-canonical-bridge.ts:201`
- **Problem**: `require.main === module` throws in ESM. Same pattern as B58 `__dirname` fix.
- **Fix**: `typeof require/module` guard with try/catch.

### INFRA-B59-001: Predictive Diagnostics Placeholder Data
- **Severity**: INFORMATIONAL
- **Location**: `predictive-diagnostics.service.ts`, `analytics.tsx`
- **Problem**: Model Diagnostics values are hardcoded constructor defaults, never fed real data.
- **Fix**: Added amber placeholder warning banner. Full wiring deferred to B60.

---

## PHASE 15B INFRASTRUCTURE FIXES (2026-04-14 → 2026-04-15)

### INFRA-15B-001: CCDT Relay Stopped Copying Messages to cc-inbox (Six Root Causes)
- **Severity**: HIGH (broke the Kyle → Claude Code message relay pipeline, forcing manual workaround sends that masked the real issue for ~14 hours)
- **Discovered**: 2026-04-15 00:30 by the new CC session during B61 Phase 3a — "CCDT is posting fake acks in the group and not relaying Kyle's messages to cc-inbox"
- **Diagnosed**: 2026-04-15 00:45 (previous governance CC session, three root causes) + 2026-04-15 01:30 (Langston infrastructure session, three additional root causes)
- **Symptom**: Messages Kyle posted in Topic 21 were NOT appearing in `cc-inbox`. The new CC session's polling chain returned "no unread messages" even when Kyle posted. Simultaneously, messages attributed to "CCDT Communicator" were appearing in the group that looked like automated acks not originated by CC.
- **Six root causes identified (all fixed)**:
  1. **`channels.telegram.accounts.ccdt-relay.enabled: false`** in `openclaw.json` — had been disabled in every config backup going back weeks. Inbound path to the relay agent blocked at the account level. Outbound sends via `openclaw message send --account ccdt-relay` still worked (masking the disable), which is why CC's workaround posts were succeeding.
  2. **Legacy streaming config keys** (`channels.telegram.*.streamMode`, `streaming` scalar, `chunkMode`, `blockStreaming`, `draftChunk`, `blockStreamingCoalesce`) were incompatible with the OpenClaw 2026.4.14 schema after today's 2026.4.5 → 2026.4.14 upgrade. Even with `enabled: true`, the ccdt-relay account couldn't load cleanly. Fixed via `openclaw doctor --fix` which migrated them to the nested `streaming.{mode,chunkMode,preview.chunk,block.enabled,block.coalesce}` structure.
  3. **Duplicate gateway — leftover `openclaw-ccdt` systemd service** was running in parallel to the main gateway, fighting for the `@CCDTCommsBot` token. Either gateway could handle any given inbound, each with stale config, producing intermittent behavior. Stopped and disabled the leftover service.
  4. **Missing `openclaw agents bind` routing** — the `telegram-relay ← telegram accountId=ccdt-relay` binding had been wiped at some point. `enabled: true` in config is necessary but not sufficient; the runtime bind is a separate wire. Re-added via `openclaw agents bind`.
  5. **Stale `SOUL.md` at obsolete profile path** — the silent-relay instructions had been maintained at `/root/.openclaw-ccdt/workspace/SOUL.md` (an obsolete separate OpenClaw profile), but the main gateway's `telegram-relay` agent actually reads from `/root/.openclaw/agents/telegram-relay/workspace/SOUL.md`, which still held an old verbose version. Wrote the correct silent-relay version there.
  6. **Wrong model on `telegram-relay` agent** — was `openai/gpt-4.1-mini`, which cannot reliably invoke shell tools. Instead of calling `cc-inbox write "..."`, the mini model was outputting the literal text `cc-inbox write "..."` directly into the group chat. This was misdiagnosed as "chatty ack posts" when it was actually failed tool-call fallbacks leaking as text. Switched to `openai/gpt-4.1` (full) — slower and slightly more expensive but actually calls tools.
- **Secondary fix**: `agents.defaults.bootstrapMaxChars` raised from 20,000 to 40,000 so Langston's BOOTSTRAP.md (at 19,952 chars after Phase 15b additions) doesn't silently truncate on next session reset.
- **End-to-end verification**: Kyle posted `test relay 3` in Topic 21 → CCDT silently executed `cc-inbox write` → `cc-inbox` showed `#774 [FROM: Kyle Jordan] [TOPIC: 21] test relay 3` with no text output in the group. Relay agent behaving as specified.
- **Operational rules added as a result** (see `SYSTEM_MANUAL.md` Telegram Infrastructure section and CLAUDE.md §8):
  - **Model rule**: Never use `gpt-4.1-mini` for OpenClaw agents that need to invoke shell tools (relay, conductor, or similar). Use `gpt-4.1` full minimum. Mini is fine for text-generation-only jobs.
  - **Binding rule**: `enabled: true` in `openclaw.json` is necessary but NOT sufficient for an agent↔account wire. The runtime `openclaw agents bind` is separate state and can be wiped independently.
  - **Duplicate-gateway check**: When an OpenClaw agent is misbehaving, always check `systemctl list-units --type=service | grep openclaw` AND `ps aux | grep openclaw-gateway` for leftover/duplicate processes fighting for the same bot token.
  - **Workspace path verification**: If behavior contradicts documented workspace rules (e.g. SOUL.md says "silent in group topics" but agent is chatty), verify the agent is actually loading the file you think it is. OpenClaw profiles can have multiple workspace paths. Confirm with `openclaw health` and the registered `agentDir` in `openclaw.json`.
- **Masking effect**: For ~14 hours (April 14 10:28 UTC → April 15 00:30 UTC), the broken relay was masked by Langston writing to cc-inbox directly via his BOOTSTRAP additions ("Always copy your messages to cc-inbox so Claude Code's polling picks them up"). This made it look like the relay was working when it wasn't. The real breakage was only discovered when the new CC session expected relay-formatted messages in its polling loop and they weren't arriving.
- **Follow-up cleanup** (tracked, not blocking): delete or rename `/root/.openclaw-ccdt/` obsolete profile path so future sessions don't accidentally edit workspace files that aren't the live ones.

### INFRA-15B-002: OpenClaw Gateway Upgrade 2026.4.5 → 2026.4.14 (1M Context Override Deferred)
- **Severity**: INFORMATIONAL (operational improvement; one regression addressed by INFRA-15B-001)
- **Location**: `/usr/lib/node_modules/openclaw` (global npm install) + `/root/.openclaw/openclaw.json`
- **Trigger**: Upstream bug [openclaw/openclaw#42225](https://github.com/openclaw/openclaw/issues/42225) — GPT-5.4 runtime context-engineering path uses hardcoded 272,000-token cap instead of the model's real 1,050,000-token capacity, causing premature compaction on Langston's topic-21 session. Related PR [#44475](https://github.com/openclaw/openclaw/pull/44475) proposes `agents.defaults.models` passthrough override to fix.
- **Action taken**: Upgraded via `openclaw update` (2026.4.5 → 2026.4.14, latest as of 2026-04-14). Attempted both documented override patterns:
  1. `agents.defaults.models.openai/gpt-5.4.contextWindow = 1050000` — REJECTED, schema still `.strict()`, PR #44475 not merged in 2026.4.14.
  2. `models.providers.openai.models[].contextWindow = 1050000` — schema-accepted after adding required `baseUrl` and `name` fields, but the override did not propagate to runtime session telemetry (session still reported `contextTokens: 272000`). Matches the #42225 "catalog lookup wins before forward-compat patch" caveat.
- **Status**: **272K cap deferred** until OpenClaw ships a newer release containing PR #44475. Langston workspace files (BOOTSTRAP, MEMORY, SOUL) were already structured for the 272K constraint as part of the Phase 15b governance transition. Monitor [openclaw/openclaw releases](https://github.com/openclaw/openclaw/releases) and retry the override when PR #44475 lands.
- **Side effect**: The upgrade surfaced the legacy streaming config keys that broke the CCDT relay, which was the trigger chain for INFRA-15B-001.
- **Post-upgrade verification**: `openclaw health` reports `telegram: ok (@LangstonDTBot, @CCDTCommsBot)`, both accounts healthy after INFRA-15B-001 fixes applied.

### INFRA-15B-003: `.claude/settings.json` Invalid JSON (Missing Comma)
- **Severity**: MEDIUM (silently broke Claude Code project hooks)
- **Location**: `.claude/settings.json` (line 10-11)
- **Problem**: Missing comma between `"_notificationPing"` and `"_test"` keys. Claude Code silently failed to parse the file, which meant the `ConfigChange` hook (which runs `cc-inbox read && cc-inbox mark-read` on config change) was not loading. Hooks had been broken for an unknown period.
- **Fix**: Added the missing comma. File now parses as valid JSON.

### INFRA-15B-004: `.claude/settings.local.json` Wrong Permission Wildcard Syntax
- **Severity**: HIGH (caused aggressive permission prompts that blocked the new CC session's B61 work and led to manual allow-list accumulation)
- **Location**: `.claude/settings.local.json` permissions.allow list
- **Problem**: Every entry used `Bash(*)`, `Read(*)`, `Write(*)`, etc. Per the official Claude Code settings documentation, these are interpreted as "bash with the specific literal argument `*`" — which never matches any real command. The wildcard syntax for "all bash commands" is the bare tool name `Bash` (no parentheses). Because the wildcards were non-functional, the new CC session was prompted on every `Bash` invocation and had been accumulating specific command entries like `Bash(cp ".claude/tmp_cc_msg.txt" /tmp/cc_msg.txt)` each time Kyle clicked "Always allow", bloating the file and not solving the underlying problem.
- **Fix**: Rewrote the allow list with bare tool names per the documented syntax: `"Bash"`, `"Read"`, `"Write"`, `"Edit"`, `"Grep"`, `"Glob"`, `"WebFetch"`, `"WebSearch"`, `"Task"`, `"TodoWrite"`, `"NotebookEdit"`, plus `"mcp__plugin_telegram_telegram__reply"`. Added `$schema` reference. Session restart required because Claude Code loads settings at session startup only — no hot-reload for `permissions.allow`.
- **Reference**: [Claude Code settings docs — permission rule syntax](https://code.claude.com/docs/en/settings)
- **Lesson**: When pattern-matching settings don't behave as expected, consult the official docs for the exact syntax before hacking around. Wildcard conventions vary across tools and Claude Code specifically uses bare tool names for "match all", not `(*)` patterns.

### INFRA-15B-005: CLAUDE.md Multi-Line Telegram Send Pattern — Double-Expansion Trap
- **Severity**: MEDIUM (every multi-line Telegram send from CC sessions landed in Telegram as one collapsed paragraph with no bullets or newlines)
- **Location**: `CLAUDE.md` §6 "Reliable multi-line pattern" subsection
- **Problem (first version)**: Original pattern used `"$(cat /tmp/cc_msg.txt)"` inside an SSH command with outer double quotes. The local shell expanded the file contents during SSH command construction, inserting them directly into the SSH command string. Any `$(...)`, backticks, or `$VAR` literals in the body were then re-expanded a SECOND time by the remote shell, breaking on unbalanced quotes. The newline-preservation also failed in some send paths.
- **Problem (first fix version)**: The new CC session hit the double-expansion trap trying to send the B61 scope review to Langston — the review itself documented the `"$(cat /tmp/cc_msg.txt)"` pattern, which then got re-expanded on the remote side and failed.
- **Final fix**: Rewrote CLAUDE.md §6 with the correct pattern: (a) write body to local `/tmp/cc_msg.txt` via heredoc with quoted delimiter `<<'BODY_EOF'`, (b) `scp` file to remote server, (c) wrap ssh command in outer SINGLE quotes, (d) on remote side use `MSG=$(cat /tmp/cc_msg.txt); openclaw ... --message "$MSG"`. The double-quoted variable expansion `"$MSG"` substitutes the stored string without re-running command substitution on its contents. Metacharacters come through as literals. Added explicit "what NOT to do" block showing the obsolete pattern.
- **Reference**: CLAUDE.md §6 "Reliable multi-line pattern" after commit `30e4d19c`.
- **Lesson**: Any time a shell command chain crosses an SSH boundary with potentially-unsafe content, think carefully about where each expansion happens (local shell vs remote shell) and use variable assignment on the target side to prevent double-expansion.

### DBS-B61-001: Dormant Wire + Half-Wire Discovery at DBS Consumer Sites
- **Severity**: MEDIUM (governance framing was wrong — SIM said "NONE" and "never imported anywhere" but two consumer sites existed in source)
- **Type**: DISCOVERY
- **Location**: `server/services/signal-orchestrator.ts:454` (dormant wire), `server/services/vts-runner.ts:877` (half-wire)
- **Summary**: Two DBS consumer sites found that governance docs had classified as "orphan": signal-orchestrator.ts:454 (dormant wire — imports `computeBiasConfidenceModifier`, computes `dbsModifier`, multiplies confidence, but active trading has been OFF since at least 2026-01-12, so this code has never executed against a captured cycle) and vts-runner.ts:877 (half-wire — computes `biasModifier = computeBiasConfidenceModifier(biasCategory)` then the result is never referenced again, discarded every VTS cycle). Corrected framing from "orphan" to "dormant wire + half-wire" in SIM §5.1b and System Manual Layer 1b. Both carried as discovered, not fixed during B61 — fixing is deferred to B62+ when the DBS integration path is designed.
- **Governance lesson**: The prior SIM entry said "NONE" for downstream consumers. This was operationally true for captured decisions during the DBS era, but false as a code-path inventory claim. Every future review must check both runtime consumer behavior AND source-level imports, not conflate them. See SIM §5.1b burial-pattern case study (false parity claim between two broken paths).
- **Reference**: `BATCH_61_SCOPE.md` §2, `BATCH_61_PRE_AUDIT.md` §2.2.1, SIM §5.1b (updated 2026-04-15).

### DBS-B62-001: Regime Classifier Redesign (Design B — DBS-Integrated)
- **Severity**: HIGH (structural fix for 70% drift contamination in RANGE_BOUND_STABLE)
- **Type**: REDESIGN
- **Location**: `server/core/metrics/market-regime.ts`, `server/services/market-context-engine.ts`
- **Summary**: `calculatePairRegime()` redesigned to accept `dbsScore` as 4th input. Three DBS gates added: RBS requires `|DBS| < 0.10` (eliminates drift contamination), TFS admits `|DBS| >= 0.30`, IE admits `|DBS| >= 0.50 + vol > 0.015`. MCE ordering swapped to DBS-before-regime. Phase 0 evidence: TFS+IE 14.1%→36.5%, RBS drift 70.2%→0.0%, family flicker 1.99% (passes 2.0% ceiling). TFS threshold 0.30 selected by parameter sweep as the only value that passes flicker ceiling.
- **Reference**: `BATCH_62_PHASE0_REPLAY_ANALYSIS.md`, `BATCH_62_SCOPE.md`

### DBS-B62-002: Global DBS Three-Defect Fix (A.3 Remediation)
- **Severity**: MEDIUM (global DBS was operationally noisy — 50.32% flicker from partial cache reads)
- **Type**: FIX
- **Location**: `server/core/metrics/directional-bias.ts`, `server/services/market-context-engine.ts`, `server/services/market-indicators.ts`
- **Summary**: Three A.3 defects fixed: (1) real 24h volume from MCE cache instead of empty map, (2) coverage gate at 70% of peak — prevents computing global DBS from underfilled cache, (3) sentinel-zero filter on `DirectionalBiasResult`. Configurable weight cap constant added (`GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT = 1.0`, disabled). Further architectural improvement (persistent store + end-of-cycle snapshot) deferred to post-72h verification.
- **Reference**: `BATCH_61_A3_GLOBAL_DBS_METHODOLOGY.md`, `BATCH_62_PRE_AUDIT.md`

### DBS-B62-003: VTS Benchmark Unblock + Dead Code Removal
- **Severity**: MEDIUM
- **Type**: CLEANUP + FEATURE
- **Location**: `server/services/vts-runner.ts`, `server/services/signal-orchestrator.ts`, `server/services/fx5-scanner.ts`
- **Summary**: (1) Directive 11.6F benchmark exclusion removed from vts-runner.ts. (2) Batch 52 benchmark filter removed from fx5-scanner.ts. BTC/ETH/SOL now flow through VTS. (3) Dormant DBS confidence modifier removed from signal-orchestrator.ts (L448-467 + import). (4) Half-wired biasModifier removed from vts-runner.ts (L875-877 + import). Both `computeBiasConfidenceModifier` imports eliminated.
- **Reference**: `BATCH_62_SCOPE.md` §4.9

### DBS-B62-004: B62 Verification CONFIRMED — 72h post-deploy metrics PASS
- **Severity**: VERIFICATION (closure record)
- **Type**: CONFIRMATION
- **Location**: `Claude Comms and Packages/Batch Completion/BATCH_62_COMPLETION_REPORT.md`
- **Summary**: 72h B62 verification window (2026-04-16 09:15 UTC → 2026-04-19 09:15 UTC) confirms all primary metrics. 174,287 MCE pair-cycle samples + 359 closed trades across 76 symbols. Results:
  - **RBS drift contamination: 0.00%** (0/23,983 RBS samples). Target <30%. Pre-B62 was 70.2%. Primary B62 objective achieved definitively.
  - **TFS+IE combined: 46.19%** (TFS 43.0% + IE 3.2%). Target 18-25%. Pre-B62 was 14.1%. Exceeds target band.
  - **RBS share: 14.4%** (was 55.7%).
  - **IE share: 3.2%** — within 2-5% target band; IE redefine successful.
  - **ST share: 33.2%** — high but stable; no DBS-aware sub-condition needed at this time.
  - Family-level flicker within 2.0% ceiling.
  - Component-clamp saturation stable vs B61 baselines.
- **Additional finding (triggered B63):** high-DBS trades (|DBS|≥0.30) show 25.6% WR vs 37.9% for neutral pairs, 70% stop-out rate. Root cause: existing TFS/IE-mapped strategies (morning_star, reverse_impulse, vwap_pullback) are reversal/pullback patterns misapplied to trending pairs. NOT a filter/gate rejection issue — conversion rates are fine (0.21-0.29%). Triggers B63 = Strong Bull Trend strategy (Path D) + TEC shared service.
- **Reference**: `BATCH_62_COMPLETION_REPORT.md` §4 and §4.1, `POST_B62_PRE_LAUNCH_PLAN.md` Items 1-2.

### INFRA-15B-006: CLAUDE.md Autonomy-With-Langston Rule Missing
- **Severity**: MEDIUM (caused the new CC session to escalate every routine Langston exchange to Kyle instead of iterating to consensus directly)
- **Location**: `CLAUDE.md` §6 Three-Way Communication Protocol
- **Problem**: The original CLAUDE.md §6 documented the three-way roles and the 2-step send pattern, but did NOT explicitly state that CC and Langston can iterate on technical review without looping Kyle in for every exchange. Without that explicit rule, the fresh CC session defaulted to the conservative "ask the user when uncertain" pattern, which manifested as escalating every round of Langston feedback to Kyle — exactly the failure mode Kyle called out as "passive behavior" in the screenshot of the B61 scope exchange.
- **Fix**: Added a full "Autonomy with Langston — iterate to consensus, don't escalate every round to Kyle" subsection in §6 with: iterate-decide-respond loop, 5 explicit escalation triggers (true deadlock 2-3 rounds, architectural decision, risk/authority boundary, new directive needed, scope expansion), explicit default behavior statement, and exceptions for Langston's no-objection feedback and Kyle interruptions.
- **Reference**: CLAUDE.md §6 "Autonomy with Langston" after commit `6f667570`.
- **Lesson**: Stable content in instant-context files (CLAUDE.md / BOOTSTRAP.md) must explicitly describe the DEFAULT behavior, not just the exceptions. Omission reads as "escalate when in doubt" to fresh sessions. If you want the default to be "iterate with peer and decide," say so explicitly.

### DBS-B63B-001: Counter-Trend LONG Guard (Mirror-Defect Fix)
- **Severity**: MEDIUM
- **Type**: FIX + NEW GOVERNANCE PATTERN
- **Location**: `server/strategies/morning-star.ts`, `server/strategies/reverse-impulse.ts`, `server/strategies/defensive-hedge.ts`, `server/services/strategy-engine.ts` (sma_trend_ride block), `server/services/strategy-engine.ts` (vwap_pullback block — restructured in DBS-B63B-002)
- **Problem**: B62 72h counterfactual audit found 94 LONG-only trades opened on pairs with `pairDirectionalBiasScore ≤ -0.30` (strong downtrend). Win rate 22.3%. Contributors: reverse_impulse (54), morning_star (22), vwap_pullback (15), defensive_hedge (2), sma_trend_ride (1). Mirror of B63 Item 6's positive-DBS exclusion — the negative side was unaddressed.
- **Fix**: Added `if dbsScore <= -0.35 return null` with new null-reason `b63b_counter_trend_long_exclusion` to all 5 LONG-only strategies. Threshold -0.35 chosen for symmetry with B63 Item 6's +0.35. Commits `b0b8e39e` (Stage 10A, 4 strategies) + `c3fe0712` (Stage 10B+10C, vwap_pullback restructure integrates the mirror guard).
- **Post-deploy verification**: 5 occurrences of `b63b_counter_trend_long_exclusion` in compiled dist (one per strategy) confirmed after PM2 #79 restart.
- **Reference**: `BATCH_63_SCOPE.md` Item 10; `BATCH_63_COUNTERFACTUAL_AUDIT.md` for trigger evidence.

### DBS-B63B-002: vwap_pullback Promotion Into Strong-Trend Lane + First-Claim-Wins Arbitration
- **Severity**: MEDIUM (architectural)
- **Type**: FEATURE
- **Location**: `server/services/strategy-engine.ts` (vwap_pullback block), `server/config/canonical-regime-strategy-map.ts` (new `MULTI_FAMILY_ELIGIBILITY` map), `server/services/vts-runner.ts` (family-eligibility gate + first-claim-wins arbitration block)
- **Problem**: Counterfactual audit showed vwap_pullback as the ONE legacy archetype that works on strong-trend pairs (baseline WR 63.2% on n=19 high-DBS bullish sample). B63 Item 6's positive-DBS exclusion blocked promotion.
- **Fix**: (1) Removed vwap_pullback's positive-DBS exclusion. (2) Added mirror-defect guard per DBS-B63B-001. (3) New `MULTI_FAMILY_ELIGIBILITY` map makes vwap_pullback eligible in both `trend` (primary) and `strong_trend` families; gate logic OR's primary + additional. (4) Lane arbitration: if both `strong_bull_trend` and strong-trend-lane `vwap_pullback` fire same-pair same-cycle, first-claim-wins (same pattern as Batch 19G duplicate guard). Null-reason `strong_trend_lane_conflict`. Strict R-multiple arbitration deferred to future enhancement.
- **Commit**: `c3fe0712` (Stage 10B+10C).
- **Reference**: `BATCH_63_SCOPE.md` Items 11 + 13.

### DBS-B63B-003: Strong-Trend Geometry Override Plumbing (Variant E)
- **Severity**: LOW (additive)
- **Type**: FEATURE
- **Location**: `server/services/strategy-engine.ts` (new optional `TechnicalIndicators.strongTrendGeometryOverride` field + vwap_pullback consumption), `server/services/vts-runner.ts` (override attached when `sourcePool === 'quant-strong_trend'`)
- **Design rationale**: routing lane is the first-class concept; override carried via routing context (not hard-coded DBS branch inside the strategy). Future strategies promoted into the lane inherit the contract automatically.
- **Fix**: Optional `strongTrendGeometryOverride: { stopAtrMultiplier, targetAsRMultiple }` on `TechnicalIndicators`. vts-runner attaches `{ 4.0, 3.0 }` (Variant E per counterfactual audit) at call site when sourcePool is quant-strong_trend. `vwap_pullback` consumes override; `strong_bull_trend` ignores (uses own locked constants).
- **Contract test**: `server/tests/unit/b63-item12-geometry-override.test.ts` — 4 tests verify override path, default path, counter-trend guard precedence, Variant E constants.
- **Commit**: `c3fe0712` (Stage 10B+10C).
- **Reference**: `BATCH_63_SCOPE.md` Item 12.

### DBS-B63B-004: Strong-Trend Lane Mode-Overlay Bypass
- **Severity**: HIGH (silently destroyed R:R geometry on every pre-fix strong-trend trade)
- **Type**: FIX
- **Location**: `server/services/vts-runner.ts` (~L1086), `server/services/paper-execution-engine.ts` (~L2165)
- **Problem**: Existing mode-overlay applied asymmetric multipliers globally. DEFENSIVE: stop×1.2 + target×0.8 → 2:1 RR became 1.33:1. SURVIVAL: stop×1.5 + target×0.6 → ratio 0.8 (target closer than stop, inversion). Every pre-fix strong_bull_trend trade in observed CSVs sat in DEFENSIVE or SURVIVAL with silently-destroyed geometry.
- **Fix**: Lane-based bypass. When `sourcePool === 'quant-strong_trend'`, use native stop/target distances. Reversal/continuation archetypes retain mode-overlay as designed — bypass is scoped to the strong-trend lane only.
- **Post-deploy verification**: direct proof from same-cycle log pair under SURVIVAL mode. ETH/USD (normal lane): `Stop 2283.27→2271.75 | TP 2333.89→2322.86` (multipliers applied). EVAA/USD (strong-trend lane): `Stop 0.6653→0.6653 | TP 1.1200→1.1200` (bypass active, identical before/after values).
- **Commit**: `c3fe0712` (Stage 10B+10C).
- **Reference**: `BATCH_63_SCOPE.md` Item 14.

### DBS-B63-ITEM16-001: Global DBS Persistent Store + End-of-Cycle Atomic Snapshot + Fixed 20-Pair Floor
- **Severity**: HIGH (architectural)
- **Type**: FEATURE (replaces opportunistic cache-read approach)
- **Location**: NEW `server/core/metrics/directional-bias-store.ts`, MOD `server/services/market-context-engine.ts`
- **Problem**: Pre-fix global DBS used opportunistic TTL cache reads with a 70% coverage gate that silently returned NEUTRAL/0 when cache dropped below threshold. Consumers could receive different values within the same cycle depending on cache state at read time. No explicit stale/cold-start semantics.
- **Fix**: (1) Persistent per-pair DBS store with timestamps + 5-minute hard expiry. (2) End-of-cycle atomic snapshot publish — consumers read snapshot, get same value within a cycle. (3) Fixed 20-pair floor replaces 70% coverage gate. (4) Explicit 5-row behavior spec implemented:
  - Row 1 — cold start (empty store + no prior) → `null` + `[GlobalDBS][coldStart]` log
  - Row 2 — below floor WITH prior snapshot → stale prior, `isStale: true` + `[degradedCoverage]` log
  - Row 3 — below floor WITHOUT prior snapshot → `null` + `[noSnapshot]` log
  - Row 4 — non-finite compute → stale prior if exists, else null + `[invalidCompute]` log
  - Row 5 — happy path → fresh snapshot, `isStale: false`, no log (normal operation)
- **Semantics contract**: `null` and `isStale: true` are DIFFERENT states; consumers never substitute zero/default for null. In-memory only for B63 (DB persistence deferred). Within-cycle determinism: `getLatestSnapshot()` returns same object reference until next publish.
- **Contract test**: `server/tests/unit/b63-item16-dbs-store.test.ts` — 11 tests covering all 5 spec rows including fake-timer-driven Row 2 (populate → publish → advance 6min → repopulate below floor → assert stale carry-forward with exact prior value/coverage/snapshotTime).
- **Post-deploy verification (PM2 #81, 2026-04-21 15:34:43 UTC)**: cold-start log at T+3s, warm-up to first valid snapshot at T+63s (pairs=33), zero degraded/stale/invalid/noSnapshot logs during 15+ min of normal operation post-warm-up.
- **Commit**: `a4f5dbe0` (Stage 16).
- **Reference**: `BATCH_63_SCOPE.md` Item 16; `BATCH_63_PRE_AUDIT.md` §13 Item 16 (5-row behavior spec source).

### DBS-B63-AUDIT-001: Counterfactual Audit — Exit-Only Replay of B62 72h High-DBS Trades
- **Severity**: EVIDENCE (audit finding, no code change)
- **Type**: ANALYSIS
- **Location**: `Claude Comms and Packages/Scope Files/BATCH_63_COUNTERFACTUAL_AUDIT.md`, `scripts/phase15b/b63_counterfactual_audit.py`
- **Summary**: Exit-only counterfactual replay of 90 bullish high-DBS LONG trades from the B62 72h window. Six variants tested (baseline, A/B/C/D/E with varying stop × target geometry) using 15-min Kraken OHLC + MCE-derived ATR-at-entry. Findings: (a) morning_star (55/90 = 61% of population) had identical 32.1% WR across EVERY fixed-stop variant — widening stops does NOT rescue the archetype, confirming entry-archetype problem not exit-geometry; (b) vwap_pullback (19/90) already profitable at baseline (63.2% WR) and responds positively to Variant E (4×ATR stop, 3R target, Sum R doubled to +4.1); (c) only 13.5% of original stop-outs later reached +1R under fixed-stop variants — small rescue effect, concentrated in vwap_pullback; (d) losers' median MFE 0.0016 vs winners' 0.0252 (15× gap) — directionally wrong from entry, not stopped by noise; (e) separate mirror defect — 94 DBS ≤ -0.30 LONG trades in window with WR 22.3%, dominated by reverse_impulse (54) and morning_star (22). **Triggered: B63 Items 10 (counter-trend LONG guards), 11 (vwap_pullback lane promotion), 12 (geometry override), 14 (mode-overlay bypass).**
- **Reference**: `BATCH_63_COUNTERFACTUAL_AUDIT.md`.

### B64-AUDIT-001: B58a Authority Baseline — Current DB State Verified
- **Severity**: VERIFICATION (restores trust after prior discovery of DB-vs-docs drift)
- **Type**: AUDIT (documented-as-wired vs actually-wired)
- **Location**: `screener_filters` table on staging Supabase.
- **Context**: Earlier in B63 Kyle raised that DB rows existed but values were not all populated per documented design. Trust in governance records was shaken. This audit verifies current state against `AUTHORITY_BASELINE.md` Section A.
- **Finding**: **ALL 12 B58a baseline filter paths match AUTHORITY_BASELINE.md Section A exactly on `vn_max, di_min, di_max, min_volume` across both `live` and `paper` modes = 24 rows, exact match.** Additionally B63 added 2 new strong_trend filter paths (`active_strong_trend`, `vts_strong_trend`) = 28 total rows in DB today.
- **Documented-vs-actual drift (1 item, intentional)**: B63 original scope doc proposed `min_volume=$250k` for strong_trend paths; B63.4 intentionally loosened to `min_volume=$0` to increase Path D trade count. Current DB reflects the loosened value. B63 scope doc is stale on this specific parameter. Log and close — no further action required.
- **Residual observation**: B63.3 commit message references columns (min_price tiered, max_price, liquidity, market_cap, spread, history) outside the B58a baseline scope (baseline documented only `vn_max/di_min/di_max/min_volume/volume_24h_min`). Those columns are present in the schema but out of B58a-audit scope. B64 treats this as confirmed-baseline-intact, not a gap.
- **Reference**: `AUTHORITY_BASELINE.md` Section A; `BATCH_63_COMPLETION_REPORT.md` §B64 audit section.

### DBS-B64a-001: Regime & Strategy Drift Dashboard
- **Severity**: FEATURE (observation tool)
- **Type**: NEW UI + NEW API + STORE EXTENSION
- **Location**:
  - NEW `server/services/drift-dashboard-aggregator.ts` — reads closed-trade JSONs + MCE telemetry JSONLs; computes B62-style metrics + strategies-by-regime tables; reads live snapshot/history/transitions from `directional-bias-store`.
  - MOD `server/routes.ts` — new endpoint `GET /api/analytics/drift-dashboard?window=rolling_24h|rolling_7d|rolling_30d|cohort_latest` (auth required).
  - MOD `server/core/metrics/directional-bias-store.ts` — added `snapshotHistory` ring buffer (96 × 15-min = 24h) + `transitions` array (last 50 category changes). New public methods `getHistory()` + `getTransitions()`. Transitions only emitted across FRESH snapshots (stale carry-forwards deliberately excluded to avoid false transition events).
  - MOD `client/src/pages/analytics.tsx` — new "Drift Dashboard" tab (5th of 8). `DriftDashboardSection` with window toggle + summary cards + regime shares + regime integrity metrics + DBS distribution counts + Global DBS live snapshot with isStale badge + `GlobalDbsSparkline` inline SVG chart + category transition list + per-regime strategy performance tables.
- **Design decisions (per Kyle 6-question spec 2026-04-22):**
  1. Window: rolling 24h/7d/30d + since-last-restart toggle
  2. Metrics: all B62-72h-report metrics (regime shares, family flicker, RBS drift contamination, component-clamp saturation, DBS distribution)
  3. Strategy grouping: by REGIME (for each regime, which strategies fired + WR + avg R / net PnL)
  4. DBS distribution: simple category counts, no heavy charts
  5. Global DBS: current snapshot + 24h history sparkline + transitions list
  6. CLOSED trades only (live positions stay on existing Active Trades page)
- **Scope constraints:**
  - No caching — aggregator reads disk on each request. Add 60s memoization later if CPU becomes an issue.
  - Regime strings sourced through canonical SSOT (`REGIMES.*` from `canonical-regime-strategy-map.ts`) to satisfy the `regime_mapping_integrity` test (no hardcoded regime strings outside config/tests).
  - Zero external chart library dependencies — inline SVG for sparkline.
- **Hotfix 1** (`cd139ed8`): initial UI-sync commit had `await import(...)` inside a sync function; esbuild failed. Replaced with static top-of-file import.
- **Hotfix 2** (`cf7baef1`): regime_mapping_integrity test failed because aggregator hardcoded regime strings in 4 places. Routed all through `CANONICAL_REGIMES` / `REGIMES.*`.
- **Post-deploy verification (PM2 #84, 2026-04-22 ~02:05 UTC):**
  - Endpoint returns 24h rolling: 84 closed trades, WR 55.95%, avg net +1.414%, 72,765 MCE samples
  - Regime shares: TFS 40.4% / RBS 25.5% / ST 21.8% / IE 10.6% / HVU 1.8%
  - Family flicker 1.24% (target ≤ 2.0% — passing)
  - Strategy tables populated per regime (e.g. RBS range_trade n=21 WR 71%, TFS strong_bull_trend n=32 WR 53%)
  - History + transitions start empty (cold start) — expected; populate within ~15-30 min of stable operation
- **Commits**: `eb790763` (B64a), `cd139ed8` (HF1), `0be18c4f` (B64a.1 history+sparkline), `cf7baef1` (HF2 regime strings).
- **Reference**: `BATCH_63_SCOPE.md` Item 7 originally planned as B71 drift dashboard tab; shifted up to B64a since Kyle wanted it operational during the B63 audit window (Items 15/18/19 in flight).

### B64b-FIX-001 — MAX_HOLD_MS safety valve restoration
- **Reported by**: Langston in B63-close commit review 2026-04-23
- **Resolved by**: B64b commit `0a56d139` (2026-04-23, PM2 #86)
- **Issue**: B63-close commit set `MAX_HOLD_MS = Number.POSITIVE_INFINITY` while removing the 24-hour timeout (Kyle directive). This unintentionally disabled the Batch 18I force-close-stale safety valve — VTS trades on illiquid pairs with unavailable price feeds would accumulate indefinitely.
- **Fix**: `vts-runner.ts` L534 `MAX_HOLD_MS = 7 * 24 * 60 * 60 * 1000` (7 days). Normal trades resolve via TP/SL well before 7d (longest observed hold ~22h); cap exists only as zombie-cleanup.

### B65.1-FIX-001 — drizzle-kit push introspection broken on PG ARRAY defaults
- **Reported by**: CC during B65.1 deploy attempt 2026-04-23
- **Resolved by**: B65.1-HF3 commits `a129e567` + `b98fd288` + `31013517` (2026-04-23, PM2 #91)
- **Issue**: drizzle-kit 0.31.4 introspector parses PG ARRAY column defaults (`ARRAY['USD','USDT']::text[]` and similar — present on ~15 columns in `shared/schema.ts`) as JSON, fails with `SyntaxError: Unexpected token 'R'`. Has blocked schema-driven migrations.
- **Fix**: New `scripts/db-migrate.ts` file-based migration runner. Reads SQL files from `drizzle/migrations/` in lexicographic order, tracks applied filenames in `_migrations` ledger table, skips rollback files. Uses `pg` Client directly. Self-loads `.env`. Deploys now use `npm run db:migrate` instead of `npm run db:push`. db:push retained as dev-only tool.

### B65.2-FIX-001 — TEC dormant for 8 months
- **Reported by**: Kyle observation 2026-04-23 — "B65.2 plumbing-only commit shipped without behavior change."
- **Resolved by**: B65.2 functional commit `0fcd19b1` + HF1 `806effc0` (2026-04-23, PM2 #93)
- **Issue**: The trailing-exit engine (`trailing-exit-controller.ts`, Directive 9.2) had been dormant since Phase 11 — built, unit-tested, never wired into VTS or paper exit loops. Same for the Phase-11 Trade Execution Controller (`execution-controller.ts`, Directive 11.0C) which contained a separate competing trailing implementation plus the dormant adaptive-sizing function. Both running orphaned. CC's first attempt at B65.2 (`dd1f5372`) shipped a centralized evaluator but set `useTrailing:false` on both callers — plumbing without function. CLAUDE.md §2 step 7 (staging UI verification) skipped, so the gap survived through deploy.
- **Fix**: B65.2 functional commit engaged the engine end-to-end. VTS exit loop and paper `checkExitConditions` both call `evaluateTECExit({ useTrailing:true })`. Stop writeback to `paper_sim_open_positions.stop_loss` on every ratchet. ATR/DI/VolNoise snapshot at trade open. trade_mode populated across all four trade-row tables. Phase-11 percentage-trailing implementation deleted outright (`execution-controller.ts`, `execution-config.ts`, `trade-flow.ts`, 2 unit tests) per Kyle directive — no deprecation. EXECUTION_CONFIG live consumers migrated to module_constants before deletion. SIGTERM handler synchronously flushes trailing-state persistence file. 11-scenario parity test green.
- **Lesson logged**: CLAUDE.md §2 steps 2 (SIM walk) and 7 (UI verification on staging) BOTH have to be substantive. The earlier commit looked workflow-compliant but each step had been done shallow.

### B65.2-FIX-002 — break_even_stop mislabeled as trailing_stop_hit
- **Reported by**: Kyle CSV review 2026-04-24
- **Resolved by**: B65.2-HF3 commit `def5ec68` (2026-04-24, PM2 #96)
- **Issue**: Two distinct semantic concepts collapsed into one `trailing_stop_hit` label: (a) BE-lock-stop hit on a trade that gained 1×ATR and reversed before reaching target (protective exit near breakeven, NOT moonbag), and (b) genuine moonbag trailing-stop hit on a trade that flipped into TRAILING_TAKE and reversed. 7-day post-deploy data showed 49 events of (a) at +$0.09 mean and 5 events of (b) at +$2.68 mean — but the collapsed label made (a) look like underperforming moonbag. Compounding: `export-csv.ts` mapping priority was inverted (`trade.resultType` checked before raw exitReason), so even with correct exitReason the UI badges showed legacy TAKE_PROFIT.
- **Fix**: New `break_even_stop` exit reason threaded through tec-evaluator → vts-runner → vts-service → paper-execution-engine → closed-trade log. Engine logic: `targetLatched → trailing_stop_hit`; `breakEvenLatched only → break_even_stop`; `neither → stop_hit`. UI renders "BE PROTECT" (slate) badge separate from "TRAIL STOP" (emerald). export-csv mapping priority inverted: specific exitReason cases now win over legacy resultType.

### B65.2-FIX-003 — VTS Machine Learning UI missed during pre-audit
- **Reported by**: Kyle UI review 2026-04-23 evening
- **Resolved by**: B65.2-HF2 commit `48e830c4` + HF2b `98705e8e` + HF2c `aa7d9bb1` (2026-04-23, PM2 #95)
- **Issue**: CC told Langston in B65.2 pre-audit that VTS had no open/closed simulated-trades UI surface and got sign-off to skip surfacing trailing-engine state there. Kyle screenshots of `/machine-learning` proved this wrong — the VTS Open + Closed Simulated Trades tables have existed since Phase 11. CC failed to screenshot staging UI during pre-audit (CLAUDE.md §2 step 2) and again during first-pass verification (step 7).
- **Fix**: HF2 extended `getOpenVirtualTradesForML()` and `getClosedVTSTradesFromLogs()` to carry trailing-engine state. UI in `machine-learning.tsx` got a new TEC State column on Open. HF2b widened TradeRecord type for boolean. HF2c added the matching column on Closed.

### B65.4 — Ladder trailing model (target ratchets up with each rung hit)
- **Reported by**: Kyle direction 2026-04-23 (laid out as one of three trailing options); reaffirmed 2026-04-24 (CSV review showed 4 of 6 moonbag exits BELOW original target); 2026-04-25 acknowledged that CC committed to building three times without doing it.
- **Resolved by**: B65.4 commits `37beb18c` (main) + `4b958a6b` (HF1 test boundary fixes) + `ce13705e` (governance) (2026-04-25, PM2 #97).
- **Issue**: B65.2's pure-trail moonbag mode latched at first target hit and then trailed via HWM-based dynamic stop. Original target was the only target latch event for the trade's life; there was no concept of a second or third target hit. Post-B65.2 observation showed price typically poked just past target and reversed before the dynamic trail could ratchet meaningfully — 4 of 6 moonbag trades exited BELOW the original target. Designed-but-not-realized profit on the typical "spike + reversal" crypto pattern.
- **Compounding**: CC committed to the ladder design three times across two days and let governance / HF work crowd it out each time without flagging the deferral. Workflow failure per CLAUDE.md §11 (unflagged deferral = failure mode).
- **Fix**: Each target hit now ratchets BOTH stop and target. New rung target = previous + R-distance step (where R = original entry-to-target distance). New rung floor = cost-aware floor of just-hit target (`computeNetTargetFloor`). Combined with HWM-based dynamic trail kept as SECONDARY floor (active stop = max(rungFloor, dynamic_HWM_trail)) — clean superset of pure-trail. Multi-rung gaps in a single cycle handled via while-loop. Backward-compat persistence migration handles pre-B65.4 states (targetLatched=true → ladderRung=1). 9 new test scenarios (12-20) cover all paths including Langston Q5 ordering test. Schema migration adds `paper_sim_trades.ladder_rungs_hit INTEGER NOT NULL DEFAULT 0`. UI surfaces `🌙 MB×N` rung count chip on both Open + Closed Simulated Trades.
- **Lesson logged**: when a commitment has a concrete next step that's not yet started, the next commit message must either (a) include that work, or (b) include an explicit "still pending" note. No more silent deferral.

### B65.4.1 — Cost-aware floor formula change (floor placed ABOVE target with slippage buffer)
- **Reported by**: B65.4 ladder counterfactual analysis 2026-04-26 (`B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md`) showed first 5 closed laddered trades lost ~$11 vs the just-take-target counterfactual.
- **Resolved by**: B65.4.1 commit `050ccc88` (2026-04-26, PM2 #98). Per Kyle directive 2026-04-26 to ship straight away without Step-1/Step-4 review.
- **Issue**: The B65.4 rung-floor formula `target * (1 - totalCost/2)` placed the floor BELOW the just-hit target — a "breakeven-after-costs" floor. On price reversal off target, this allowed the trade to exit BELOW the original target value. 2Z/USD example: target $0.0963, floor placed at $0.0905 (6.26% below target), reversed, exited at $0.0902 — **a trade that hit its target became a small loser**.
- **Fix**: Replaced formula with `target * (1 + slippage * bufferMultiplier)`. Floor now sits ABOVE just-hit target by exactly the per-pair slippage estimate × multiplier. Multi-rung ratcheting still works as before. Buffer multiplier exposed as `module_constants.trailing_exit.rung_floor_slippage_buffer_multiplier` (seed 1.0), tunable per `(asset_class, exchange, regime, strategy)` without code redeploy. Migration `2026-04-26-b65-4-1-rung-floor-buffer-seed.sql`.
- **Verification (B65.4.1 verification 2026-04-28)**: hotfix formula confirmed working on post-deploy clean cases (4 trades, ~break-even vs counterfactual). Multi-rung still captures upside in design's payoff scenario. Aggregate ladder Δ across all 17 laddered trades: −59.89pp / ≈ −$39 vs counterfactual; even with hotfix, ladder is net-negative in aggregate. Bigger picture: broader 7-day cohort (1,136 trades) is **−$1,187** with 74% of exits at break-even-stop / original-stop / trailing-stop. Most trades never reach target. **The dominant problem is upstream entry quality, not ladder calibration.** B67 macro confidence modifier is the priority lever. Ladder net contribution stays under observation per Phase 19.4.5 item 7.

### B65.4.2 — Ladder observability columns
- **Reported by**: B65.4.1 verification 2026-04-28 showed the counterfactual analysis was unreadable on "anomaly" rows because the closed-trade CSV didn't expose latch-trigger price (which can fire at +1.5R from entry due to `target_lock_r` interaction, not at the strategy's published target), original stop, or per-rung target history. Analyst had to grep PM2 entry logs to recover original stops.
- **Resolved by**: B65.4.2 commits `db7cbcfb` main + `e9abe8fd` HF1 (`decimal` vs `numeric` build error) + `021b6d06` governance (2026-04-28, PM2 #100). Per Kyle directive 2026-04-28 to ship straight away.
- **Fix**: Three new TrailingState fields captured: `originalStopPrice` at init, `latchTriggerPrice` at first target latch, `rungTargetHistory[]` appended at each ratchet. Propagated through engine → evaluator → caller chain. Three new `paper_sim_trades` columns: `original_stop_price` decimal(20,8), `latch_trigger_price` decimal(20,8), `rung_target_history` jsonb. Migration `2026-04-28-b65-4-2-ladder-observability-columns.sql`. Both open + closed CSV exports + `/api/vts/ml/open` endpoint serializer include the fields. Folds in the original B65.4 punch-list item (open-trades API wiring). Backward-compat: `importStates` migration sets `rungTargetHistory: []` for pre-B65.4.2 persisted states; `originalStopPrice` and `latchTriggerPrice` remain undefined for trades whose state was persisted pre-B65.4.2 (cannot reconstruct).
- **Lesson logged**: ad-hoc analysis reports requiring log grepping is a sign that observability needs to land in CSV columns. The tradeoff was right (ship engine first via B65.4 / B65.4.1, observability second via B65.4.2) but the gap should have been visible from the start.

### B67.0 — Telemetry & Ablation Framework for Coordinated Regime-Confidence Overhaul
- **Reported by**: 2026-04-27 master planning doc + 2026-04-28 V2 pre-audit established that the B67 coordinated regime overhaul (6 sub-deliverables) needs a way to MEASURE per-factor contribution before any factor producer ships. Without a counterfactual harness, "did B67.1 macro modifier actually help?" is unanswerable.
- **Resolved by**: B67.0 commit `105d2b53` (2026-04-28, PM2 #101). Sub-deliverable 1 of 6 in B67.
- **Built**: New `regime_factor_alternates` DB table with XOR-discriminated source (`active_signal` vs `vts_trade`) capturing real classifier decisions plus N factor-level alternates per signal evaluation. Fire-and-forget `factor-ablation-emitter.ts` service (gated on `b67_0_ablation_emit_enabled` module constant) wired into both `signal-orchestrator.ts` (active path) and `vts-runner.ts` (VTS mirror); empty alternates today, populated by B67.1+ producers. Nightly `replay-ablation.ts` job (skeleton + 90-day retention sweep functional; outcome-lookup logic ships with B67.1+). New API endpoint `GET /api/analytics/ablation-comparison`, aggregator extension `computeAblationComparison()` reading four-quadrant taxonomy from `replay_outcome` JSONB. New `AblationComparisonSection` UI panel in existing Drift Dashboard tab — empty-state explainer at ship time, 8-column per-factor table when populated.
- **Verification (Step-7 first-pass)**: HTTP 200 post-PM2-restart, schema confirmed via psql (12 columns, 4 indexes, XOR CHECK constraint), 3 module_constants seeds present, row count 0 (expected — no factor producers yet), API returns well-formed empty response, zero `[B67` errors in PM2 logs.
- **Workflow note**: Langston Step-1 (scope) + Step-2 (V2 pre-audit) + Step-4 (×3 chunks: foundational, backend pipeline, UI + bug fix) all approved before push. V2 pre-audit caught a SQL duplicate-condition bug before Step 5; both fixes applied + re-confirmed before push.
- **Independent safety gap surfaced**: V2 pre-audit code-level inspection found `tripKillSwitch()` accepts auto-trip params but is never called automatically; `dailyLossKillSwitchPct` (10% per UI) is configured but enforcement is not wired. Logged as `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 9 marked **BLOCKING for live-trading activation**. Independent of B67 — must close before any real capital is at risk.
- **Lesson logged**: Step-2 pre-audit must include actual SIM consultation + code-level inspection of every consumer integration point, not just architectural reasoning. V1 pre-audit was lighter than CLAUDE.md §9 mandates and Kyle correctly challenged it; V2 redo surfaced findings (kill-switch gap, position sizing is risk-pct not Kelly, FinalScore lockstep across two consumer sites, B63 mode-overlay-bypass coexistence) that V1 missed entirely. Pre-audit shortcuts compound into scope drift downstream.

### B67.1 — Macro Confidence Modifier (regime classifier blind to macro market state)
- **Reported by**: Master planning doc 2026-04-27 §1 + canonical 04-22 hostile-day evidence: the per-pair regime classifier has no visibility into macro market state. On 04-22 globalRegime reported "trend-friendly stable, 98% bullish" while BTC dominance was rising sharply — a contrarian flag the system could not see. 177 strong-bull-trend trades fired; 84% lost. Cost in real money: catastrophic.
- **Resolved by**: B67.1 commit `828f6d92` (2026-04-28, PM2 #103). Sub-deliverable 3 of 6 in B67. Ships in shadow mode (`b67_1_enabled=false`); activation via module_constants flip after 24h soak.
- **Built**: External-data-driven multiplier in [0.85, 1.05] applied to `RegimeClassification.confidence` post-classification. Confidence-modifier architecture (Langston's Option C from master planning doc §3) — label preserved; only confidence is modulated. Inputs: BTC dominance (CoinGecko), aggregated funding rates (Binance public futures, BTC + ETH 8h, OI-weighted 0.6/0.4), total-mcap momentum (CoinGecko period-over-period delta). New pure `computeMacroModifier()` function with min-48-sample z-score floor + stale-data fallback. New `external-macro-feed.ts` singleton: 60s polling, 720-sample in-memory rolling window for z-score baselines, partial-feed graceful, loud `[B67.1][feed]` PM2 logging. MCE periodic refresh loop reads feed snapshot + module_constants, computes modifier, exposes via sync `getCurrentMacroContext()` accessor. `calculatePairRegime` accepts optional `macroModifier` 3rd arg applied pre-clamp; clamp upper bound raised 0.95 → 1.0. Ablation hooks at orchestrator + vts-runner push B67.1 alternate row (`buildB67_1Alternate` helper) when modifier non-null; shadow mode emits no alternate to avoid noise. `market-snapshot.ts` stub reconciled per V2 pre-audit §3.5 (single caller `ai-market-analyzer.ts` transparently inherits real values; +`fundingRate` field on type — no parallel structure created). 11 module_constants seeds in new `macro_modifier` module.
- **Verification (Step-7 first-pass)**: HTTP 200 post-PM2-restart-#103, all 11 seeds present in DB, feed alive (`[B67.1][feed] btc_dom=57.98% mcap_mom=0.00000 funding=0.000029 windows=(btc:2,fund:2,mcap:1)`), zero `[B67.1]` errors. CI overall conclusion SUCCESS — every B67.1 file is TS-clean at edit lines (the 656 vs 655 error-count delta is a re-evaluation artifact, not new B67.1 errors). 18 unit tests pass (`b67-1-macro-modifier.test.ts`): clamp behavior, weight math sign convention, cold-start floor (3 baseline-source tests), stale-data fallback, missing-input fallback, `buildB67_1Alternate` JSONB shape + reverse-derivation correctness.
- **Workflow note**: per Kyle directive 2026-04-28 each sub-deliverable in B67 gets its own dedicated `BATCH_67_X_SCOPE.md` + `_PRE_AUDIT.md` (alongside the master B67 docs). 4 governance docs landed: `BATCH_67_1_SCOPE.md`, `BATCH_67_1_PRE_AUDIT.md`, `BATCH_67_2_SCOPE.md`, `BATCH_67_2_PRE_AUDIT.md`. All Langston-approved cc-inbox #844. Step-4 code review (cc-inbox #845) caught one bug — `mcapMomentum` and raw `totalMarketCapUsd` were sharing a single field on `MacroSnapshot` (a "naming lie" that would bite future readers). Fix applied per option (a) — separate fields. Two design notes confirmed: (a) shadow-mode ablation row suppression is correct (no point in emitting thousands of value=1.0 rows that pollute the table); (b) reverse-derivation `confidence_without = modulated / modifier.value` is acceptable for ablation telemetry (clamp-edge imprecision is bounded and sub-percent for calibration purposes).
- **Lesson logged**: when reconciling pre-existing stub services, separate concerns explicitly. The original stub `market-snapshot.ts` carried `totalMarketCapUsd` which I initially overloaded with the COMPUTED momentum value to avoid adding a new field. Langston caught this as a naming lie. The fix is trivial — add the new field, keep the old name semantically correct. The lesson: **field names are contracts**; overloading them to dodge a schema addition produces a debt that compounds.

### B67.1 governance pattern — per-sub-deliverable scope + pre-audit
- **Reported by**: Kyle directive 2026-04-28: "Have B67.1 and .2 been pre-implementation audited? Have you looked at the system impacts map? The normal workflow should be used for these sub deliveries. that means a scope file too." Initial implementation lane was about to skip Steps 1+2 of CLAUDE.md §2 for B67.1 + B67.2, treating the master B67 scope/pre-audit as sufficient.
- **Resolved by**: stop the implementation lane; write 4 dedicated docs (B67.1 scope + pre-audit, B67.2 scope + pre-audit) with full SIM consultation per CLAUDE.md §9 + code-level inspection + §11 decision 12 BTC-correlation codebase grep. All four Langston-approved cc-inbox #844 in 2 rounds.
- **Pre-audit findings worth carrying forward** (`BATCH_67_1_PRE_AUDIT.md` §3.4 + §3.5): (1) `defensive-hedge.ts` already uses per-pair Spearman BTC correlation as an entry filter; this is ORTHOGONAL to B67.1's macro BTC-dominance signal (different decision points, different time scales, no double-count); (2) `market-snapshot.ts` had a pre-existing stub with hardcoded values that B67.1 must reconcile rather than parallel-create — exactly the burial pattern CLAUDE.md §9 warns against. Both findings documented and addressed.
- **Lesson logged**: master-batch scope/pre-audit is necessary but NOT sufficient for sub-deliverables. Each sub-deliverable still gets its own Step-1 + Step-2 docs covering its specific file-level changes, SIM walk, coexistence requirements, and verification criteria. Compaction of multiple sub-deliverables into a single master scope hides the per-sub-deliverable detail that Step-2 SIM consultation needs.

### B67 pre-calibration-window foundation work (silent observability gaps + cold-start data corruption)
- **Reported by**: Kyle review 2026-04-29 of the live ablation dashboard. Multiple gaps surfaced — replay job not actually running (counter stuck at 0), per-input attribution missing on the macro modifier, modifier + phase + regime confidence not visible on trade records, BTC/ETH OI weighting hardcoded, fallback patterns left over from B67.1's first ship. Plus deeper finding: phase=EARLY universally + modifier=1.0 universally across today's 16 closed trades, traced to cold-start artifacts from frequent PM2 restarts (8 deploys in a few hours wiped both in-memory stores each time).
- **Resolved by**: 7 commits between PM2 #106 and PM2 #113 on 2026-04-29, all on migration/aws-supabase. Each fix shipped autonomously per Kyle "go ahead" + DM-back protocol while Kyle was in a separate session.
- **Per-input ablation split** (`ed9a1a08`): single `b67_1_macro_modifier` row replaced with three per-input rows (`b67_1_btc_dominance` / `b67_1_funding_rates` / `b67_1_mcap_momentum`), each independently attributable. `b67_2_phase_dimension` renamed `b67_2_phase_preference`. `buildB67_1Alternate` (singular) replaced with `buildB67_1Alternates` (array of 3). New `MarketContextEngine.getCurrentMacroConfig()` accessor for ablation hooks to recompute counterfactuals.
- **Final fallback removal** (`cab55804`): per Kyle "all fallbacks deleted" — removed every silent-substitution pattern. 7 `??` config-read fallbacks → throw with explicit missing-key list. `readConst<T>(name, fallback)` → `readConstStrict<T>(name)`. `pollIntervalSec` default removed. `calculatePairRegime(macroModifier=1.0)` default arg removed (parameter required; all callers updated). `?? 1.0` at MCE consumer site → throws on cold-start race. `b67_1_enabled` shadow flag removed entirely; `MacroContext.modifier` non-nullable. BTC/ETH 0.6/0.4 funding weighting promoted from hardcode to `module_constants`. `?? 0` z-score result fields → NaN (so downstream can distinguish "computed zero" from "couldn't compute"). Cold-start warmup fallback (modifier=1.0 + fallbackActive=true when rolling baseline below 48 samples) stays — explicit runtime state with telemetry.
- **B67.3 activation** (`c1b314ad` + DB UPDATE): `pair_id_hash` trade-open persistence wired into both active-trading and VTS paths (single `assignCohortHash` source). `b67_3_enabled=true` flipped via SQL UPDATE on staging. Per-underlying cap actively gating cohort-0 signals.
- **B67.2.1 trade record observability** (`141ec3c3` + `41abd541` + `575dbca4`): originally deferred to B67.5; pulled forward per master plan §0.11.D. Schema migration adds 6 nullable columns to `paper_sim_trades` (regime_confidence_raw, macro_modifier_value, phase, phase_age_seconds, strategy_phase_weight, regime_confidence_modulated). Active-trading path captures via `paper-execution-engine.ts`; VTS path via `OpenVirtualTrade` + `persistRealPriceTrade`. UI: regime label + confidence number + phase badge (EARLY blue / PRIME emerald / LATE amber) all in SAME column per Kyle directive. CSV exports auto-include via Object.keys.
- **Replay logic + cron** (`3d1a1e7f` + `5e1031a6` + `33df2380`): `replay-ablation.ts` actual outcome lookup wired (was stubbed). VTS JSONL reader indexes 14d of closed trades, classifies via `classifyTradeOutcome(netPnl)`. Real bug found mid-implementation: ablation rows store `vts_trade_id = signal.id` (`vsig_p10_*`) but JSONL `trade.signal.id` was a NEW random `vs_*` id created inside `persistRealPriceTrade` — different formats, never matched. Fixed by threading original signal id through as `originalSignalId` field. Cron scheduled at 04:00 UTC nightly in root crontab.
- **Persistence + dashboard cleanup** (`8f417ca5`): investigation root-caused phase=EARLY + modifier=1.0 to in-memory stores being reset on every PM2 restart. `regime-phase.ts` and `external-macro-feed.ts` both now persist to `/tmp/*.json` files (pattern matches `trailing-exit-controller`'s state file). Phase store: 24h hard-expiry on entries; saves on regime transitions + ~2% of stable ticks. Macro feed: `restoreFeedState` on init; `persistFeedState` after every successful poll. Aggregator SQL also filters out legacy `b67_1_macro_modifier` + `b67_2_phase_dimension` rows from dashboard (preserved in DB for forensics).
- **Confidence saturation finding** (resolved by B67.3.5 below): pre-existing B62 design issue surfaced by investigation. TFS branch in `market-regime.ts:177-184` saturated at 0.95 INPUT for any pair with positive momentum + |DBS| ≥ 0.30. Resolved 2026-04-29 in B67.3.5; HVU/RBS/IE/ST branches still on original step-function (deferred per RUNNING_ISSUES #40).
- **Lesson logged**: in-memory stores that drive operationally-significant metrics (regime age, z-score baselines) MUST persist to disk. The pattern was already in the codebase (`trailing-exit-controller`'s state file) and was implicitly approved when B67.2's `regimePhaseStore` shipped without persistence on the assumption that PM2 restarts are infrequent. That assumption broke during a heavy-deploy day. Default rule going forward: any singleton store that accumulates state-over-time must persist on every meaningful update.

### B73 Exit-Strategy Ablation Framework — observation only (data layer)
- **Reported by**: Kyle 2026-04-29 review of 7d closed-trades CSV. Pattern: 509 BREAK_EVEN_STOP (44%) vs only 22 take-profit hits (2%); long winning streaks (20-30 TPs in a row historically) gone, replaced by BE-stop streaks (longest 32). Hypothesis: BE-stop is converting what would have been TPs into break-evens — price retraces to BE due to volatility, gets stopped out, then climbs back to target. Counterfactual analysis on n=87 BE_STOP trades with `originalStopPrice` populated (Kraken OHLC walk-forward, 8h window): **18.4% would have hit TP first (avg +9%), 28.7% would have hit original SL first (avg −2%), 52.9% chopped sideways → net +1.18% per trade vs ~0% with BE-stop**. n=87 too small to act on alone.
- **Resolved by**: B73 multi-week observation framework (commit `a747b646`, PM2 #115, 2026-04-29). Build the framework, accumulate data over weeks, then decide. Workflow Steps 1/2/4 Langston-approved cc-inbox #861/#862/#863.
- **Architecture** (parallel to B67.0):
  - New `exit_strategy_alternates` table (12 rows per closed trade)
  - New `exit-strategy-replay.ts` (12 variant evaluators) — BE A-F (current/ATR-padded/higher-trigger/trailing-instead/vol-conditional/no-BE), Trail G-J (current/tighter/looser/no-trail), Combined K-L (no-BE-no-trail / BE+pad-and-looser-trail)
  - New `exit-strategy-replay-service.ts` (orchestrator) — async fire-and-forget, OHLC fetch, bulk-insert, error-swallowing logging
  - 13 module_constants in new `exit_strategy_replay` module
  - Hook in `vts-service.persistRealPriceTrade` — VTS only (paper-execution-engine intentionally NOT wired per Kyle directive: B67-style symmetry, paper hook unnecessary while active trading OFF)
- **Selection criterion (pre-registered)**: Sharpe-like `(mean_variant - mean_baseline) / std(variant - baseline) × sqrt(n)` per Langston cc-inbox #858. n=200 total + n=50 per regime minimum.
- **Variant A baseline isolation**: anchors on `b73_baseline_*` snapshot constants, NOT live `trailing_exit`. Insulates multi-week observation from TEC tuning that would otherwise drift the baseline.
- **Replay precision**: 1-min OHLC. Convention: low ≤ level (BUY) or high ≥ level (SELL) → triggered. Conservative; matches real-stop semantics. Trailing variants use simplified state machine (peak + level + ATR multiplier); moonbag/ladder replay deferred to v2.
- **Same-day follow-ups all shipped tonight**:
  - **API endpoint + UI panel** (`a4bd0e6c`, PM2 #116): `GET /api/analytics/exit-strategy-ablation?window=<>&regime=<>`. New `ExitStrategyAblationSection` rendered under Analytics → Drift Dashboard tab alongside DriftDashboardSection + AblationComparisonSection. Variants sorted by Δ vs A baseline (descending). Sharpe color-coded. Per-regime dropdown filter. READY/ACCUMULATING badge.
  - **Unit tests** (`49c711d2` + `f53b9d60`): 12 variants + state machine + edge cases. CI run `25136181772` Test Suite/Build/Docker green. 3 initial float-precision assertion failures fixed in `f53b9d60` (test fixtures only — implementation unchanged).
- **v2 deferrals (still open)**: real ATR plumbing through trade record, `b73_variant_l_target_lock_r` module_constant, `gap_bar=true` metadata flag.
- **Lessons logged**:
  1. **Observation-mode framework should be research-mode-time-boxed.** B73 is built for multi-week observation → variant selection → either modularize (Phase 21.4 post-launch) or just tune live TEC. Forward-compat hooks to inactive paths are speculative complexity — drop them.
  2. **Snapshot baseline isolation is critical for multi-week comparative observation.** If Variant A reads live config, paired-diff Sharpe becomes invalid the moment config tunes. Snapshot the baseline at deploy time in dedicated `b73_baseline_*` keys.
  3. **The B67.0 ablation framework's pre-trade hook in signal-orchestrator already provides forward-compat for active trading without a paper-execution-engine touch** — paper-execution-engine just executes signals that already have ablation rows. Same logic applies to B73: VTS hook is sufficient because paper close path won't fire while active trading is OFF.
  4. **Float-precision assertion lesson**: when computing P&L percentages via division (`exit/entry - 1`), JS double arithmetic produces values like `-2.0000000000000018`. Assertions using `.toBe(-2)` fail; use `.toBeCloseTo(-2, 4)` for any computed numeric. Same convention should be applied to B67.x test files (verified by spot-check).

### B67.3.5 Pre-Window Hardening — phase backfill from OHLC + TFS branch desaturation
- **Reported by**: master plan §0.12.B Items 1+2 — two open discussion items surfaced 2026-04-29 evening. Item 1: `regimePhaseStore.tick()` records `enteredAt = now` on first observation, so cold pairs read EARLY even when they've been in TFS for hours. Persistence (shipped earlier 2026-04-29 in `8f417ca5`) fixed PM2-restart wipe but not the cold-pair problem. Item 2: TFS branch saturation at 0.95 INPUT documented above — 12/16 closed trades clustered at conf=1.0 makes the calibration check meaningless. Both items discussed with Langston post-compact (cc-inbox #850) — agreed on Modified B sequencing: fix both before B67.4 cheap-tier ships, because shipping B67.4 outcome feedback on a saturated/wrong-phase signal makes the feedback loop a no-op AND wastes the 14d calibration window on uninformative data.
- **Resolved by**: B67.3.5 sub-batch (commits `49209eb4` initial + `d97d47d7` CI fixes, 2026-04-29 PM2 #114). Single coordinated batch through full 11-step workflow: scope cc-inbox #851 → pre-audit + impl plan cc-inbox #852 → 10-file diff (807 lines) cc-inbox #853 → push → CI fix → migration → deploy → verification cc-inbox #854.
- **Phase backfill from OHLC history** (`server/core/metrics/regime-phase.ts`): new `backfillFromHistory` method walks 12 backward 60-min OHLC windows running `calculatePairRegime` to find the actual regime entry boundary. First-observation only (regime transitions handled by normal `tick()` flow). Uses CURRENT DBS as approximation per Langston — vol/momentum/ADX carry most of the classification signal so the regime LABEL is robust. New `BackfillContext` interface; `tick()` 4th param optional so backwards-compatible with existing 3-arg callers (3 unit-test sites).
- **TFS branch desaturation** (`server/core/metrics/market-regime.ts:177-184`): step-function replaced with continuous mapping `confidence = min + (max - min) × (momentum_factor × dbs_strength × vol_inverse)`. Multiplicative (not weighted-sum) — semantic match for "trend-friendly STABLE" = all three should align. Output range [0.50, 0.90] via 5 module_constants in `regime_classifier` module: `b67_3_5_tfs_desat_min/max/momentum_scale/volatility_scale/dbs_scale`. Recalibrate via DB UPDATE post-deploy; no code redeploy. New `RegimeConfig` type required as 4th param on `calculatePairRegime` (matches B67.1 `macroModifier` pattern). `DEFAULT_REGIME_CONFIG` exported for advisory paths (diagnostic + 2 unit tests updated).
- **MCE wiring** (`server/services/market-context-engine.ts`): 5 new constants resolved alongside macro/phase boundaries with hard-fail on missing keys. `regimeConfig` field cleared on stop. New `getCurrentRegimeConfig()` accessor. Threaded as 4th param into `calculatePairRegime` AND as `BackfillContext` into `regimePhaseStore.tick`.
- **Verification (Step-7 first-pass)**: PM2 #114 online, refreshMacroContext completed (would throw with explicit "missing module_constants in regime_classifier" otherwise — proves all 5 constants resolved). First diversified macro modifier observed = 0.85 (clamped to min) with real z-scores: BTC -0.79, funding +1.90 (very crowded longs), mcap +0.08. Macro feed rolling windows survived restart (btc:78, fund:96, mcap:77 samples — pre-restart accumulation preserved). New unit tests: `b67-3-5-tfs-desat.test.ts` (6 cases) + augmented `b67-2-phase-dimension.test.ts` (5 backfill scenarios). Initial CI failed on 4 issues all caught by tests + integrity check (timestamp generation in test fixtures, `computeMomentum` lookback semantics in test fixtures, hardcoded `'TREND_FRIENDLY_STABLE'` string in MCE — fixed in `d97d47d7`).
- **Deferred verification** (~24h post-deploy): backfill log lines on cold pairs entering universe; TFS confidence raw distribution shift (target P10≤0.55, P50∈[0.60,0.80], P90≥0.80); phase distribution mix shift away from universal EARLY.
- **Out of scope (deferred)**: HVU / RBS / IE / ST branch desaturation. TFS alone covers ~55-60% of pairs (the dominant regime, immediate calibration bottleneck). Logged as `RUNNING_ISSUES.md` #40 for post-window classifier-formula tuning batch — defers until B67 calibration window completes and we have evidence on whether TFS desat actually improves confidence-bucket WR signal.
- **Lessons logged**: (1) Test fixtures with synthetic OHLC must respect `computeMomentum`'s 30-candle lookback — building a 60-candle series with end-to-end target momentum X gives the LAST-30 only ~X/2 momentum. Use `count: 30` OR scale endPrice up. (2) `regime_mapping_integrity` test catches hardcoded regime strings — even DB resolution keys need to import from canonical config, not literal strings. (3) Test OHLC timestamps must respect the test's clock — generate them as `nowMs - (count-1-i) × spacing` so the latest candle is at `now`, going backward. (4) Multiplicative continuous mapping produces wider distribution spread than weighted-sum (central limit theorem effect) — the right choice for confidence formulas where we need calibration-quality variance.

### B67.4 / B68.4 / B68.5 / B68.2 / B68.3 / B67.5-prep / B68.1 — 7-modulator confidence chain buildout (CLOSED 2026-05-03)

- **Series scope**: see `BATCH_CATALOG.md` entries for B67.4 (cheap-tier bundle 2026-05-01), B68.2 (volume regime 2026-05-02), B68.3 (pair correlation 2026-05-02), B67.5-prep (post-composition floor 2026-05-03), and **B68.1 (multi-TF agreement 2026-05-03 — the final B68.x modulator)**. Each is its own commit + scope/pre-audit/test artifacts, all approved by Langston via the standard 11-step workflow (cc-inbox #856/#857/#879 / #880-882 / #883-885 / #886 / #887-889).
- **Final chain (post-B68.1)**: `raw × macro × phase × freshness × outcome × volume_regime × pair_correlation × multi_tf_agreement → clamp [0.45, 1.0]`. Active trading off → chain is observational pre-B67.5; calibration windows attribute per-factor independently per master plan §0.11.C step 5.
- **Lessons logged across the series:**
  1. **Decorative-then-operational pattern works.** Shipping each chain modulator LIVE with an ablation row but no consumer gate (active trading off) collected real-time evidence without behavioral risk. Calibration windows attribute per-factor independently — each batch's mini-window evaluates only its own factor's rows. Pre-B67.5 the chain is observational; post-B67.5 it becomes operational.
  2. **MCE multi-group orchestrator scales cleanly.** B67.4 introduced the 6-method orchestrator with first-refresh-Promise.all + per-group-try/catch + assembleRegimeConfig pattern. Subsequent additions (B68.2 → 7 → B68.3 → 8 → B68.1 → 9) followed the same pattern with zero refactor to the orchestrator core. Hot path: each new factor takes ~80 lines of MCE diff (sub-method + state field + accessor + register in 2 arrays).
  3. **Pure-function chain factors with divide-out counterfactual.** Every chain modulator is a pure function over OHLC + state with a `buildBxx_xAlternate()` helper that produces `confidence_without = real / factor`. Same approximation across all 7 modulators; same documented limitation at clamp boundaries (Langston OBS-2 cc-inbox #879).
  4. **Family map placement choice (B68.1).** When introducing a new abstraction colocated with one consumer, place it LOCAL to that module rather than mutating shared canonical configs. B68.1's regime-family map (5 regimes → 4 families) lives in `multi-tf-agreement.ts` — keeps blast radius LOW and `canonical-regime-strategy-map.ts` untouched. Per Langston cc-inbox #888 D.1.
  5. **Higher-TF source pivot (B68.1).** Master plan §0.11.B estimated B68.1 at ~2 weeks because it characterized the higher-TF pipeline as "new infrastructure". Actual ship was ~1 day — the existing `ohlcCache` keys on `${symbol}_${interval}` so adding a 240-min cache key per pair is one line. Kraken serves 4h natively (intervals 1/5/15/30/60/240/1440/10080/21600 all supported). **Lesson:** re-examine architectural assumptions as nearby infrastructure matures — what was "real new infrastructure" at planning time may have become "one-line addition" once an adjacent component (B74 OHLC pipeline + B18 OHLC cache) exists.
  6. **OHLC-shape map duplication accumulating** (RUNNING_ISSUES #52). The Kraken raw-candle → OHLCData mapping (`parseFloat(c.open || c[1])` etc.) now appears in 4 hook sites across the chain factors. Tactical refactor candidate; deferred per Langston cc-inbox #888 D.2 to a small dedicated cleanup batch. Field-tested duplication is acceptable in the short term.
  7. **Floor engagement is signal, not bug.** B67.5-prep raised the post-composition floor from 0.40 to 0.45 `module_constant` in anticipation of B68.1's compound. Worst-case 7-modulator stack ≈ 0.419 below the new floor; floor engages on a meaningful fraction of trades. Closed Trades UI shows `conf 0.450` widely — observational evidence that the chain is compounding. Floor-binding rows visible in ablation metadata via `confidence_with_factor` (clamped) vs `confidence_without_factor` (pre-clamp). Calibration analysis can quantify the binding rate.
  8. **Local TS check unrunnable on GDrive** — npm install hits EBADF on tar writes (Windows GDrive virtual filesystem can't keep up with tar throughput). All 5 chain-factor batches relied on CI as the verification gate. Workflow fix candidate: symlink `node_modules` to local SSD off GDrive. CI proved sufficient — 664 TS errors before each batch = 664 errors after = legacy baseline (RUNNING_ISSUES #39, Phase 16 cleanup target); zero new errors introduced by any of the 5 chain-factor batches.
  9. **Visual UI verification via Claude-in-Chrome** is non-optional on UI-touching batches (Kyle directive 2026-05-03 reinforced). Even when the new factor doesn't have its own dedicated UI panel, verifying that existing panels (Factor Ablation Comparison, Closed Trades) auto-extend to surface the new factor type catches subtle wiring bugs. B68.1 visual verification confirmed the factor surfaces in `Factor Ablation Comparison` row 7/10 with correct Total/Replayed/Pending counts within 1h of deploy.


### B67.4 / B68.4 / B68.5 / B68.2 / B68.3 / B67.5-prep — chain modulator series buildout
- See **BATCH_CATALOG.md** entries for B67.4 (cheap-tier bundle 2026-05-01), B68.2 (volume regime 2026-05-02), B68.3 (pair correlation 2026-05-02), B67.5-prep (post-composition floor 2026-05-03), and B68.1 (multi-TF agreement 2026-05-03 — final). Each is its own commit with its own scope/pre-audit/test artifact set, all approved by Langston via the standard 11-step workflow with cc-inbox confirmations. The catalog entries already document each batch comprehensively; the series collectively buildout the 7-modulator confidence chain that will be wired into 7 consumers in B67.5.
- **Lessons logged across the series:**
  1. **Decorative-then-operational pattern works.** Shipping each chain modulator LIVE with an ablation row but no consumer gate (active trading off) collected real-time evidence without behavioral risk. Calibration windows attribute per-factor independently — each batch's mini-window evaluates only its own factor's rows. Pre-B67.5 the chain is observational; post-B67.5 it becomes operational.
  2. **MCE multi-group orchestrator scales cleanly.** B67.4 introduced the 6-method orchestrator with first-refresh-Promise.all + per-group-try/catch + assembleRegimeConfig pattern. Subsequent additions (B68.2 → 7 methods → B68.3 → 8 methods → B68.1 → 9 methods) followed the same pattern with zero refactor to the orchestrator core. Hot path: each new factor takes ~80 lines of MCE diff (sub-method + state field + accessor + register in 2 arrays).
  3. **Pure-function chain factors with divide-out counterfactual.** Every chain modulator is a pure function over OHLC + state with a  helper that produces . Same approximation across all 7 modulators; same documented limitation at clamp boundaries (Langston OBS-2 cc-inbox #879).
  4. **Family map placement choice (B68.1).** When introducing a new abstraction colocated with one consumer, place it LOCAL to that module rather than mutating shared canonical configs. B68.1's regime-family map (5 regimes → 4 families) lives in `multi-tf-agreement.ts` — keeps blast radius LOW and `canonical-regime-strategy-map.ts` untouched. Per Langston cc-inbox #888 D.1.
  5. **Higher-TF source pivot (B68.1).** Master plan §0.11.B estimated B68.1 at ~2 weeks because it characterized the higher-TF pipeline as "new infrastructure". Actual ship was ~1 day — the existing `ohlcCache` keys on `\_\` so adding a 240-min cache key per pair is one line. Kraken serves 4h natively (intervals 1/5/15/30/60/240/1440/10080/21600 all supported). Lesson: re-examine architectural assumptions as nearby infrastructure matures — what was 'real new infrastructure' at planning time may have become 'one-line addition' once an adjacent component (B74 OHLC pipeline + B18 OHLC cache) exists.
  6. **OHLC-shape map duplication accumulating (RUNNING_ISSUES #52).** The Kraken raw-candle → OHLCData mapping (`parseFloat(c.open || c[1])` etc.) now appears in 4 hook sites across the chain factors. Tactical refactor candidate; deferred per Langston cc-inbox #888 D.2 to a small dedicated cleanup batch. Field-tested duplication is acceptable in the short term.
  7. **Floor engagement is signal, not bug.** B67.5-prep raised the post-composition floor from 0.40 to 0.45 `module_constant` in anticipation of B68.1's compound. Worst-case 7-modulator stack ≈ 0.419 below the new floor; floor engages on a meaningful fraction of trades. Closed Trades UI shows `conf 0.450` widely — observational evidence that the chain is compounding. Floor-binding rows are visible in ablation metadata via `confidence_with_factor` (clamped) vs `confidence_without_factor` (pre-clamp). Calibration analysis can quantify the binding rate.

### B69.1 / B69.2 / B69.3 / B73.3 — bug fix series 2026-05-04

Triggered by Kyle review of the open + closed simulated trades exports + screenshots of the Factor Calibration and Exit Strategy Ablation panels on 2026-05-04. Four distinct bugs surfaced and fixed same-day.

- **BUG-2026-05-04-A: AssetClassBadge missing from canonical paper-sim views.** B69 added the badge component but only wired it into trade-history + active-trades, missing the Open Trades and Closed Trades (7d) tabs on the Machine Learning page where Kyle actually reviews trades. Fixed in B69.1 — symbol cell refactored to stack badge below the pair (per Kyle preference vs. separate column). `getOpenVirtualTradesForML` + `getClosedVTSTradesFromLogs` populate `assetClass: 'crypto_spot'` (VTS handles crypto only today). PM2 #138.

- **BUG-2026-05-04-B: b67_2 phase preference 100% shift=0 in calibration table.** Looked like the factor was a no-op. Investigation showed factor was firing correctly on every trade — the calibration aggregator's `shift = realConfidence - altConfidence` collapsed to zero by construction because both fields were sourced from the same `predictiveConfidence ?? 0.5` value (`real_decision.confidence` set by emitter; `alternateDecision.confidence` set to `_baseConf` which equals `predictiveConfidence` for b67_2 since b67_2 is the FIRST factor in the chain). Fix: change b67_2 alt.confidence to the with-factor (modulated) value. **Deeper finding:** the framework's "shift" metric isn't actually measuring per-factor effect for ANY modulator — `real_decision.confidence` is the raw classifier value, not chain-final. Multiplicative factors LOOK like they work because compounding produces non-zero shifts, but magnitude isn't a clean per-factor measurement. Predictive-lift column (REAL spread - ALT spread) is the trustworthy decision-grade metric. Proper framework refactor queued for a future cleanup batch. PM2 #139.

- **BUG-2026-05-04-C: F/J/K exit ablation variants showing identical results.** Kyle correctly suspected this when F (no_BE_stop), J (no_trailing), and K (no_BE_no_trail) all reported +0.315 mean P&L / Sharpe 1.84 / 69.5% WR. Investigation: all three variants routed through `replayPureSlTp(inputs, id, params)`. The function destructured `params.allowBe` and `params.trailMultiplier` but never used them — the function only checked target hit / original SL / timeout. F and J ran K's pure-SL/TP semantic regardless of intent. Net effect: prior "remove BE-stop adds 0.090 P&L" finding actually measured K (remove BOTH BE + trailing). Fix: two new dedicated simulators. `replayNoBeWithTrailingTake` (F) walks bars with no BE-lock pre-target; on target hit switches to trailing-after-target moonbag mode. `replayBeOnlyNoTrail` (J) walks bars with BE-lock at +1×ATR; on target hit exits at target with no trailing. K's `replayPureSlTp` unchanged. PM2 #140. **Earlier "turn off BE-stop" recommendation walked back** pending 7-10 days of clean differentiated F/J data.

- **BUG-2026-05-04-D: CoinGecko HTTP 429 rate limiting suppressing ~50% of B67.1 macro feed polls.** PM2 logs showed alternating `[B67.1][feed] CoinGecko HTTP 429` followed by `partial snapshot — btc_dom=NA mcap_mom=NA funding=...` for stretches of 70+ minutes. Both BTC dominance and mcap momentum come from the same `/global` endpoint; funding rate (Binance premiumIndex, NOT CoinGecko despite older comments) was unaffected. Root cause: shared-IP unauthenticated rate limit pool. Fix: `COINGECKO_API_KEY` env var, sent as `x-cg-demo-api-key` header (Demo key per-key 30 calls/min vs shared-IP). Single 3s backoff retry on 429. 401/403 logs as `[B67.1][feed][AUTH]`. Key added to staging `.env` directly, NOT committed. PM2 #141.

## B70 — Unified Data Archiving (2026-05-04 → 2026-05-05, PM2 #142 → #145)

- **B70 SHIPPED 2026-05-04 → 2026-05-05.** Unified data-capture infrastructure across VTS / paper-sim / live execution paths. 5 partitioned archive tables (`pair_scan_archive` ~255k/day, `signal_eval_archive` admitted-only in v1, `exit_decision_archive` per-trade-close, `macro_feed_archive` 60s, `b62_retroactive_labels` one-shot) + 48 monthly partitions + 11 module_constants in new `data_archive` module + new `server/services/data-archive/` service module (6 files) + bootstrap + Drift Dashboard `DataArchiveSection` panel + retention/partition crons. Mode-agnostic capture per Kyle directive 2026-05-04 (scope §M): every row carries `mode` (system-state from `getCurrentMode()` accessor) + `source` (per-hook origin, hardcoded). Two-column discriminator decouples system mode from hook origin (Langston cc-inbox #896). When system flips VTS→paper-sim→live no archiver code change needed. Hot-path hooks all try/catch wrapped + bounded-queue drop-OLDEST. Retention sweep cron 02:00 UTC drops monthly partitions older than 90d. Verified end-to-end: 196 pair_scan rows + 17+ macro rows accumulating with live regime/DBS values. **Deferred to B70.1** (RUNNING_ISSUES #56-#59): reject-stage signal_eval capture, B62 retroactive labels runner, Parquet exporter, unit tests.

### B70.2 silent-failure bugs (caught 2026-05-05 via PM2 log scan)

- **BUG-2026-05-05-A: B70 admit-hook ReferenceError on `rawSignal`** (commit `5617ad72` introduced, `03d704cb` fixed). The admit-archive hook in `vts-runner.ts:generatePhase10Signal` referenced `rawSignal?.metadata?.rankingScore` but `rawSignal` is a parameter to `signal-orchestrator.ts`, not vts-runner. ReferenceError caught by try/catch wrapper, every admit silently failed. Net effect: `signal_eval_archive` admitted-row count was 0 from B70 deploy 2026-05-04 until fix 2026-05-05 ~12:24 UTC. Lesson: cross-file hook copy-paste introduces scope errors that try/catch hides.

- **BUG-2026-05-05-B: B70 exit-hook TypeError on `trade.openedAt.getTime()`** (introduced in B70 main `6b63b6bd`, fixed in `03d704cb`). The exit-archive hook called `.getTime()` on `trade.openedAt` but the `OpenVirtualTrade` interface declares it as `number` (ms epoch). TypeError caught by try/catch, every exit silently failed. Net effect: `exit_decision_archive` had 0 rows despite 41+ trades closing. Wrapped to handle both number and Date defensively.

- **BUG-2026-05-05-C: B70 admit-hook ReferenceError on `_modulatedConfChain`** (introduced in B70.2 expansion, surfaced after BUG-A fix, fixed in `f799f701`). The variable was declared with `let` inside a bare `{ ... }` block at lines ~1447-1724 in vts-runner.ts (the B67.x ablation factor builder block). The admit hook is OUTSIDE that block. Replaced with read from `openVirtualTrades.get(tradeId)?.regimeConfidenceModulated` which IS function-scoped.

- **BUG-2026-05-05-D: B70 exit-hook ReferenceError on `finalTradeMode`** (introduced in B70 main, fixed in `0423a2be`). Const-declared inside the persist-trade try block at line ~2159, so the B70 exit hook below couldn't reference it. Hoisted out to closePosition function scope. Trailing snapshot read is cheap (in-memory map).

**Net diagnostic pattern:** all four were silent failures hidden by the hot-path try/catch wrappers. The wrappers prevented host-path crashes (correct design) but masked the data-capture failures. Detected only when Kyle questioned why `signal_eval_archive admitted` and `exit_decision_archive` were empty — log scan immediately surfaced the errors. Mitigation for future hook batches: include a synthetic-event integration test that asserts row writes through the full pipeline, not just the queue side.

### B70.3 — Path B momentum gate swap (2026-05-05, commit `decf5b80`)

7-day calibration data showed `b68_5_path_b_sustainability` at -2.0pp predictive lift + -0.4480 avg shift — the slope-derivative gate was binary-suppressing winning signals (consolidation pauses produce temporarily negative slope while the underlying trend is healthy). Replaced with momentum-based gate per Langston cc-inbox #901 review:

- **Old:** `(absDbs >= 0.30 && dbsSlope >= regimeConfig.b68_5DbsSlopeMin)` — slope-derivative gate
- **New:** `(absDbs >= 0.30 && mom > regimeConfig.b68_5PathBMomentumMin)` — forward-looking momentum gate
- New module_constant `b68_5_path_b_momentum_min = 0.002` (regime=TFS scope) tunable via DB
- Old `b68_5_dbs_slope_min` retained for back-compat with ablation counterfactual reader; runtime classifier reads new constant
- B68.5 ablation counterfactual builder updated to disable momentum gate (was disabling slope gate); emits new metadata fields `momentum`, `momentum_min_threshold`, `gate_kind`
- liquidity_trap iteration-loop exclusion: new `UNIVERSALLY_DISABLED_STRATEGIES` Set in vts-runner skips at top of strategy iteration BEFORE `detect()` is called; same exclusion in signal-orchestrator. Eliminates ~7,342 wasted evaluations/24h that returned `strategy_disabled_bearish`.

### B70.3b — Post-composition floor dropped 0.45 → 0.20 (2026-05-05, no code — module_constants UPDATE)

Per Kyle directive + Langston cc-inbox #902. Pre-B70.3b every open trade showed `regimeConfidenceModulated = 0.45` (floor binding 100%) — true compressed chain output hidden by the clamp. Since no consumer reads the value until B67.5 wires it, lowering the floor is pure visibility (zero behavioral impact). 0.20 well below the worst-case compound `0.85⁴ × 0.92² × 0.95 ≈ 0.42` so any realistic chain output now lands in visible range. Floor will be raised back to an empirically-correct value during B67.5 consumer wiring once we have real distribution data.

### B70 lessons (carried forward)

1. **Drizzle `db.execute(sql.raw(BEGIN; ...; COMMIT))` only returns the last result set.** Postgres-js exposes only the trailing COMMIT row (empty), so the SELECT in the middle is lost. Hotfix `3796ae56` dropped the wrapper. For B-tree partition counts on small tables there's no statement-timeout need; revisit if Supabase ever lags.
2. **Hot-path hooks must be `setImmediate`-deferred, not just try/catch.** MCE 60s cycle hits ~177 pairs synchronously; even module-resolution latency on a dynamic import would compound. Pair-scan hook uses `setImmediate(() => { (async () => { ... })() })` to push the import + enqueue completely off the hot path.
3. **Two-column discriminator beats single mode column.** When Langston suggested adding `source` alongside `mode` (cc-inbox #896), I almost shipped with mode-only. The split between "what was the system doing" (mode) vs "which code path produced this row" (source) only diverges in edge cases (VTS-always-on alongside paper-sim) but those edge cases are exactly the lifecycle-transition points the archive needs to support cleanly.
4. **Mode-agnostic capture as a first-class design property changed the implementation order.** Original scope had a `mode` column on `exit_decision_archive` only; Kyle directive 2026-05-04 promoted it to all 5 tables and required hooks in all three execution paths (signal-orchestrator live + paper-execution-engine paper-sim + vts-runner vts), even paths currently dormant. This added zero engineering cost (hooks live on existing code paths; they fire when the path activates) but adds enormous lifecycle continuity for the archive.
5. **Defer-don't-block on capture surface expansion.** Reject-stage signal_eval rows would have doubled the diff size for B70 main. Splitting into B70 (architecture + admitted-path) and B70.1 (reject-stage capture) per Langston cc-inbox #898 made each diff individually reviewable. The architecture lives or dies on whether the layer is correct, not on whether every reject site is hooked yet.

**Lessons logged:**
1. **"Three variants reporting identical numbers" is a smell.** Always sanity-check ablation comparisons that show byte-identical outputs across distinct definitions.
2. **Calibration aggregator's "shift" metric is structurally broken for any factor whose without-counterfactual equals the raw classifier value.** Primarily b67_2 (first in chain). Other factors escape via compounding.
3. **External feed reliability matters as much as feed correctness.** Half the B67.4 calibration window was getting NAs for 2 of 3 macro inputs. Authentication should be the default for any third-party API integration going forward.
4. **Same-day fix discipline.** Four bugs surfaced from one review session, all fixed and deployed within 6 hours. The B73 + B67.0 ablation frameworks are working — surfacing real issues that hand-reviewing 622 closed trades would never catch.
5. **Recommendation walk-backs are a feature, not a failure.** The "turn off BE-stop" call was based on an apparent F/J/K convergence that turned out to be a bug. Caught before any operational change.


---

## INFRA-2026-05-07-F: B79 — Phase 24 NEW + xstock_spot dormant scaffold + ASSET_CLASS_ONBOARDING_WORKFLOW.md (2026-05-07 evening)

**Trigger:** Kyle directive 2026-05-07 round 2 — *"What we are doing with these X-Stocks, this needs to be our experimentation lab, our learning example for how we set up asset classes in the future."* B79 reframed mid-flight from "implement xstock_spot quickly" to "canonical asset-class-onboarding lab driving a reusable workflow."

**Phase reframe:** Phase 24 NEW (B79 + sub-batches B79.0a/.1/.2/.3/.4/.5/.6/.x); Phase 25 = B80 + sub-batches; out-of-sequence with current Phase 15c, consistent with Phase 19.0 pull-forward pattern.

**Scope iterations:** rev 1 → rev 7 across 4 Langston review rounds + 2 Kyle round directives (max_price cap removed; Stage 5 parallel quant+pattern correction; Q-D AAPLx-vs-AAPL probe elevated to dedicated pre-implementation stage; ORB Q-D-gated; resource management §11 added; quant family paths separate-pool extension; family-path SSOT scoping per rev 7 §-2.5).

**PIA findings (Langston PIA round-2 GREENLIT):** 3 hard blockers in telemetry partitioning resolved via two-instance pattern (separate AdaptiveScanManager + TelemetryAggregator + AdaptiveRatioManager + PairFailureTracker per asset class). CC's initial param-plumbing lean conceded to Langston's silent-corruption argument. Static-state hazard surfaced (TelemetryAggregator disk-persist module-scoped at line 1600-1602) — xstock instance runs in-memory only Day 1; promote persistence in B79.x if needed.

**Schema migrations applied to Supabase:**
- `screener_filters` add `asset_class` + `tunable_status` columns + xstock_spot row with **NO max_price cap** per Kyle (NULL = no cap; mirrors crypto's no-cap convention)
- `module_constants` xstock seeds: macro_modifier=1.0 (B79.3 deferred), pattern_pool_gates {final_score_floor=0.45, max_position_pct=0.50}, strategy_gates.orb.enabled=false (Q-D-gated), sqe_config {di_min_quant=18, adx_min=18, momentum_min=0.002, di_min_pattern=10}
- 5 of 6 critical tables already had asset_class column from B65/B70 era; only screener_filters needed migration

**Files (5 new + 11 modified, +1759/-84):**
- NEW: `server/asset_classes/types.ts` (AssetClassFrictionModel interface), `server/asset_classes/xstock_spot/market-hours.ts` (ARCA 24/5 schedule), `server/services/asset-class-instances.ts` (bootstrap factory; Langston Q1+Q6 separate-instance pattern), `server/strategies/orb.ts` (Q-D-gated dormant skeleton), `server/utils/symbol-normalize.ts` (cross-asset normalizer; Langston rev 3 §G)
- MODIFIED (all back-compat for crypto): shared/asset-classes.ts (XSTOCK_SPOT_SYMBOLS allow-list 275 syms), crypto_spot/friction.ts (populated from exchange-defaults.ts; no semantic change), xstock_spot/{friction,index,pattern-pool-filters,regime-thresholds}.ts (Layer 1 baselines), canonical-regime-strategy-map.ts (XSTOCK_SPOT_ENABLED_STRATEGIES = 6 quant + 3 file pattern + ORB), signal_quality_evaluator.ts (weekend pause + strategy whitelist gates), cost-model.ts (getFrictionForAssetClass dispatch), market-regime.ts (calculatePairRegime accepts assetClass), trailing-exit-controller.ts (TEC stop-freeze guard top of updatePosition per Langston PIA Q5 placement)

**NEW Tier-2 governance doc:** `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — full Section A.0 through K reusable template with xstock_spot worked example in Section H.1. By the time B80 (crypto_perp) starts, the implementer reads this doc, walks Sections A-G, identifies perp-specific deltas (funding rate, leverage, liquidation), updates Section H.2 with crypto_perp as second worked example.

**Step 4 PUSH_GREENLIT** (Langston watchdog reply 2026-05-07 21:43 UTC, after one 240s API-hang retry): 4 non-blocking notes queued for B79.0a — (N1) replace require() with static import for market-hours.ts; (N2) SQE pattern-pool floor still reads crypto_spot static; (N3) drop redundant truthy strategy guard; (N4) unit tests for boundaries deferred. Telegram-relayed verbatim per CLAUDE.md §6.5 Step 3.

**Step 6 deploy verified:** PM2 #184 restart at 21:49 UTC; HTTP 200; no B79 errors in PM2 logs; pre-existing infrastructure errors unchanged. **No-touch fence SQL on crypto_spot regime_factor_alternates:** 12 emissions/factor/hr across all 10 factors trailing-hour (within ±10% of pre-deploy 9/factor/hr post-restart-window-fill). Crypto pipeline UNDISTURBED.

**Explicit deferrals to B79.0a:** live xstock scanner setInterval, ARM constructor injection of telemetry, Q-D AAPLx-vs-AAPL yfinance probe, sector-classification yfinance script, asset-class-aware data-freshness gate helper, pre-deploy 1.3× synthetic load test (replay historical scan cycles per Langston Q7), N1-N4 cleanups.

**Lessons from this batch:**
1. **Multi-batch phase framing matters.** Trying to ship "all of B79" as a single batch would have invited corner-cutting. The scope's own §7 sub-batch breakdown + Kyle's Phase 24 reframe gave permission to ship dormant scaffolding properly + defer live wire-in to B79.0a with focused review. Result: clean Step 4 PUSH_GREENLIT, clean deploy, no-touch fence absolute.
2. **Langston's "bulletproof > elegant" partitioning argument** (silent-corruption resistance via separate-instance pattern over CC's param-plumbing lean) is the kind of architectural pushback the workflow exists to surface. CC's initial design risked the future-call-site-forgets-the-arg failure mode; Langston's separate-instance shape eliminates the failure mode by construction.
3. **Static-state hazard on singleton refactors** — TelemetryAggregator's module-scoped disk-persist path at line 1600-1602 is a foot-gun for the two-instance pattern. Day 1 sidestepped via in-memory-only xstock instance; full persistence parameterization deferred to B79.x with explicit tracking.
4. **NO max_price cap** on xstock_spot mirrors crypto's no-cap convention (we don't cap BTC at $150K, so we don't cap AAPLx at $2000). Removing the cap was a Kyle round-2 directive; the migration sets NULL for xstock_spot row while crypto_spot rows preserve their numeric defaults.

---

## INFRA-2026-05-11: B79.0m.b2 — xstock_spot pipeline pulled to functional crypto parity (PM2 #229)

**Commits:** `4c60d259e` (main, 26 files +2241/-478) + `909182690` (pattern-filter test fixup) + (endpoint patch this session). Phase 24 EXTENDED — closes the architectural gaps that B79.0m.b shipped with.

**Trigger:** Kyle directive 2026-05-11 — *"xstock pipeline must mirror crypto's `fx5-scanner.ts` + `vts-runner.ts` shape EXACTLY; differences live in DB rows, not code."* B79.0m.b had wired a Layer-1-starter pipeline that ran cleanly for 24h but opened ZERO trades, because two architectural gaps remained:
1. **Pattern path missing entirely.** Pattern strategies fired inline within the quant loop with no parallel global+IMF gate; zero `vts_pattern`/`active_pattern` rows for xstock_spot in `screener_filters`.
2. **Family fan-out was single-iteration filter gate.** A pair passing 3 family IMFs was iterated once with eligibility filtering, vs. crypto's 3 separate evaluation entries via `taggedVtsSurvivors`.

**5 objectives shipped (all approved across 3 Langston review rounds — rev1 + rev2 + Step 4 code review):**

1. **Parallel pattern path** — 4 new `screener_filters` rows seeded (`vts_pattern` + `active_pattern` × paper/live; cloned from crypto baseline: LQ=43, VN=0.98, DI=3/5, min_price=0.05/0.25, min_volume=150k/250k). New file `server/asset_classes/xstock_spot/pattern-filter.ts` (~270 lines) — two-stage gate (global + IMF) matching crypto's `fx5-scanner.ts:743-770 + 1242-1272` shape. Per-cycle 60-bar floor matches `global-filter.ts:109` convention; Layer-3 migration target = `module_constants.pattern_pool_gates.min_bars_for_eval`. Pattern survivors tagged `sourcePool='pattern'` and ONLY pattern-family strategies (`STRATEGY_FAMILY_MAP[s] === 'pattern'`) fire on the pattern lane.

2. **Family fan-out** — Replaced single-iteration loop in `eval-cycle.ts` with `for (lane of lanes) { for (strategy of regimeStrategies) { ... } }`. A pair passing N family IMFs + pattern produces `N+1` evaluation lanes. `isStrategyEligibleForLane(strategyKey, lane)` extracted to `server/asset_classes/xstock_spot/lane-eligibility.ts` for unit-test isolation (Langston Step 4 nit #1). Mirrors crypto `fx5-scanner.ts:1607-1643` exactly.

3. **ORB LONG-only fix + STRATEGY_FAMILY_MAP entry** — `orb.ts:254-264` down-break (`!upBreak`) branch replaced with `setNullReason('sell_disabled_long_only'); return null;` (mirrors `inside-bar-reversal.ts:131-134`). Pre-deploy crypto baseline verified: admitted=0, total=77,919/24h all `strategy_internal` — no production SELL leak on crypto. Added `orb: 'breakout'` to `STRATEGY_FAMILY_MAP` (was previously absent → bypassed family-eligibility gate entirely; now routes through breakout IMF lane). §-1.7 rollback trigger documents two-condition revert.

4. **B73 replay asset-class branch** — `exit-strategy-replay-service.ts:fetchOhlcForReplay` gains `assetClass: string = 'crypto_spot'` param; xstock symbols read partitioned `xstock_spot_ohlc_1m` directly (EXPLAIN ANALYZE 1.035 ms verified pre-deploy; all 13 partitions have child indexes on `(symbol, interval_begin DESC)`). `_b79XstockReplayErrors` counter + `[B73-REPLAY][XSTOCK]` log surface async failures. `ReplayContext.assetClass` threaded from `OpenVirtualTrade.assetClass` via `vts-runner.ts:2336` → `vts-service.persistRealPriceTrade:957`.

5. **Drizzle schema-file drift fix** — `shared/schema.ts` `screenerFilters` unique-index TS declaration updated from `(mode, filterPath)` → `(mode, assetClass, filterPath)` with name `screener_filters_mode_class_path_idx` matching production. No DB migration runs (production already correct from B79.0m.a hotfix). RUNNING_ISSUES #100 tracks drizzle-kit journal-sync follow-up.

**Endpoint patch (separate post-Step-11 commit):** `/api/xstocks/filter-diagnostics` had hardcoded `applicable.path: false` from B79.0m.b iteration 2 era. Without the patch, the xStocks UI tab would render pattern path as N/A even with the live parallel pipeline. Added `buildPatternGlobalFromCounters` + `buildPatternImfFromCounters` helpers; wired `lastScan.pattern` + `rolling24h.aggregated.pattern` to read the new B79.0m.b2 counters (`patternFilterCounters`, `patternPerMetric`, `pairsPassedPattern`). Lifetime accumulator in `scanner.ts` extended with the 5 new counters. SCAN_EVAL_DONE log line gains `passed_pattern`, `failed_pattern`, `pattern_reject_min_history`, `pattern_fanout`, `family_fanout_sum`, `archive_failures` fields.

**Bug fixes:**
- **BUG-2026-05-11-A — ORB SELL leak:** `orb.ts:260` unconditional `direction = 'SELL'` branch on down-break violated LONG-only invariant. **Production impact pre-fix:** zero (crypto admitted-ORB count = 0/24h pre-deploy). **Risk window if left unfixed:** as pattern path enabled more pair/regime combos hitting ORB on xstock_spot, SELL signals would have begun reaching admit stage. Pre-emptive fix.
- **BUG-2026-05-11-B — B73 xstock replay silently empty:** `exit-strategy-replay-service.ts:fetchOhlcForReplay` defaulted to Kraken crypto REST for all symbols; xstock symbols returned empty bars. **Production impact pre-fix:** zero (no xstock trades had closed yet). Risk window: first xstock trade close would have produced no `exit_strategy_alternates` row.
- **BUG-2026-05-11-C — Drizzle schema-file drift:** `shared/schema.ts` declared `(mode, filterPath)` index but production had `(mode, asset_class, filter_path)`. Production correct; TS file stale. **Surfaces as:** next `drizzle-kit generate` emits a surprise DROP-old-idx + CREATE-new-idx migration. Patched TS to match production. RUNNING_ISSUES #100 logs the journal-sync follow-up.
- **BUG-2026-05-11-D — xStocks tab endpoint hardcoded pattern path N/A:** `/api/xstocks/filter-diagnostics` at `routes.ts:7241` hardcoded `applicable.path: false`. Patched to read live pattern counters; xStocks UI tab will now render the pattern path Pipeline Summary block with real data after first RTH cycle.

**Pre-existing bug filed separately (NOT introduced this batch, NOT fixed):**
- **RUNNING_ISSUES #99** — `exit-strategy-replay-service.ts:339` references `ohlcBars.length` but the in-scope variable is `replayBars` / `allBars`. ReferenceError thrown on every successful persist; wrapped in outer try/catch so it logs as "persist failed" — masks real B73 success signal. Surfaced during Langston Step 4 read. Standalone follow-up commit.

**New counters in `XstockEvalCycleCounters`:**
- `pairsPassedPattern` / `pairsFailedPattern` — pattern-filter pass/fail per cycle.
- **`patternRejectByMinHistory`** — TRIPWIRE for §-1.1 60-bar-floor implementation correctness (spikes to ~all-pairs if Layer-1 floor is misconfigured).
- `patternFanOut` — pairs admitted to pattern lane.
- `patternFilterCounters` / `patternPerMetric` — pattern-side accumulator structures.
- `archiveFailures` — `signal_eval_archive` insert exceptions surfaced (Langston Step 4 nit #7).

**Verification gates G1-G12 pre-RTH:**
- **G1 CI**: Build + Docker GREEN; TS Check + Test Suite at pre-existing legacy baseline (RUNNING_ISSUES #39 + 66 pre-existing `module_constants not warm` failures from boot-sequence tests). **All 28 of this batch's new tests pass.** No new failures introduced.
- **G2 DB seeds**: ✅ 4 pattern rows confirmed via psql with correct cloned values.
- **G3-G7 + G9**: PENDING RTH 2026-05-12 13:30 UTC. xstock scanner correctly short-circuits weekend market-closed; no cycle data to verify until xstock market open.
- **G8 ORB LONG-only**: ✅ crypto ORB admitted=0/24h (rollback trigger NOT tripped).
- **G10 crypto no-touch fence**: PARTIAL ✅ — all 10 factor families emitting (5/hr in 1h window — restart noise; +30min re-check scheduled).
- **G11 schema drift**: ✅ closed.
- **G12 pattern-strategy params**: ✅ 26 wildcard rows confirmed + unit test passes.

**Files (7 new + 12 modified, +2241/-478):**
- NEW: `server/asset_classes/xstock_spot/pattern-filter.ts`, `lane-eligibility.ts`; `drizzle/migrations/2026-05-11-b79-0m-b2-xstock-pattern-rows.sql` + rollback; 3 new unit test files; `Claude Comms and Packages/Scope Files/BATCH_79_0m_b2_SCOPE.md`; completion report.
- MODIFIED: `eval-cycle.ts` (lane × strategy fan-out), `scanner.ts` (lifetime accumulator + log fields), `orb.ts` (LONG-only), `canonical-regime-strategy-map.ts` (orb family entry), `exit-strategy-replay-service.ts` (asset-class branch), `vts-runner.ts` + `vts-service.ts` (thread assetClass), `shared/schema.ts` (drift fix), `routes.ts` (xstock endpoint patch), `b79-0d-orb.test.ts` (LONG-only assertion).

**Governance updated:** BATCH_CATALOG, PHASE_HISTORY (Phase 24 EXTENDED section), SYSTEM_IMPACT_MAP (7 new component entries + If-I-Change-X additions), SYSTEM_MANUAL (Phase 24 EXTENDED appendix), RUNNING_ISSUES (#99 + #100 new), MEMORY × 2 (in-cache truth + in-repo mirror) + Langston MEMORY synced via SSH+heredoc (83/200 lines).

**Langston review trail:** 5 files in `Claude Comms and Packages/Langston Design Asks/B79_0m_b2_*`. 3 review rounds (rev1 8 pre-audit edits, rev2 2 refinements, Step 4 7 inline nits). Step 4 verdict: "push it."

**Lessons:**
1. **Architecture-as-code-shape vs. architecture-as-DB-rows.** B79.0m.b shipped a pipeline that ran but never opened trades because the code shape diverged from crypto. The fix wasn't more DB rows — it was rebuilding the iteration shape (lane × strategy fan-out + parallel pattern path) to match crypto's `fx5-scanner.ts:1607-1643` exactly. "Differences live in DB" only works when the code-shape is parity.
2. **Endpoint-vs-pipeline drift on schema changes.** The `/api/xstocks/filter-diagnostics` endpoint had hardcoded `applicable.path: false` from a prior era when the pattern path didn't exist. Even after the parallel pipeline was built, the endpoint would have continued surfacing pattern path as N/A. Lesson: when a pipeline section comes online, audit all surfaces that previously reported it as N/A.
3. **Pre-existing bugs surface during architectural touches.** RUNNING_ISSUES #99 (`ohlcBars.length` ReferenceError) had been masking B73 success logs since the file was written. Surfaced only because Step 4 review made Langston re-read the file. Lesson: file pre-existing bugs as separate follow-ups; don't piggyback the fix into the architectural batch.

---

## INFRA-2026-05-12: B79.0m.b2 follow-up patches — closing Kyle's 9-issue catalog (PM2 #235)

**Trigger:** After B79.0m.b2 main ship, Kyle navigated the xStocks tab on Monday evening 2026-05-12 and surfaced 9 concrete issues — 7 infrastructure/visibility bugs, 2 calibration concerns. 6 follow-up commits (`8fd97b16e` → `f31fc18d6`) close the 7 infrastructure items.

**Commit chain:**
- `8fd97b16e` — xstocks endpoint patch (pattern path applicable=true; scanner lifetime counter expansion; SYSTEM_MANUAL Phase 24 EXTENDED appendix; CHANGES_AND_FIXES B79.0m.b2 entry)
- `ac38ac194` — `buildFamilyPaths` shape fix (panel rows render full `{imf,survivors}` shape instead of bare numbers)
- `a7f494cc0` — strip `vts_`/`active_` prefix from family keys for panel parity
- `1dd6b9e45` — xStocks tab description text refresh (no longer claims scanner-not-wired)
- `dd0466c7e` — pattern strategies eligible in family lanes (Kyle directive: crypto parity)
- `f31fc18d6` — per-lane counter split + slow-load fix + freshness panel removal + setup-hash dedupe counter + family-mismatch denominator fix

**Bug catalog (BUG-2026-05-12-A through -F):**

- **BUG-2026-05-12-A — Endpoint hardcoded pattern-path eval metrics to 0.** `routes.ts:/api/xstocks/filter-diagnostics` had `patternPairsEvaluated: 0`, `patternStrategyEvaluations: 0`, `patternSignalsGenerated: 0` hardcoded from B79.0m.b iteration 2 era. After B79.0m.b2 made the pattern path real, the panel still showed pattern path as dead. Fix: 10 new per-lane counter fields in `XstockEvalCycleCounters` + endpoint mapping.

- **BUG-2026-05-12-B — Slow tab load (~60s).** Two compounding DB query bugs: (1) `signal_eval_archive` queries referenced 4 nonexistent columns (`regime`/`null_reason`/`signal_generated`/`trade_opened`) — silently failed via try/catch leaving panel sections empty. Real columns are `regime_label`, `reject_stage`, etc. (2) `COUNT(DISTINCT date_trunc('second', captured_at))` over millions of `xstock_spot_ticker_snap` tick rows hit Supabase's 60s statement timeout. Both replaced with cheap in-memory reads. **Verified: 60s → 0.94s (60× speedup).**

- **BUG-2026-05-12-C — `buildFamilyPaths` returned wrong shape.** Returned `Record<string, number>` (pass counts only); the crypto `FilterDiagnosticsPanel` reads `Record<string, {imf: {failedLQ/VN/DI/passed/total}, survivors: number}>`. Without the fix the 5 family rows rendered but every cell showed 0/undefined. Patched to return full nested shape.

- **BUG-2026-05-12-D — Family-key prefix mismatch.** xstock counters use DB filter_path names (`vts_trend`, `vts_reversal`, ...); the FilterDiagnosticsPanel iterates `['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend']` (no prefix). Stripped prefix in `buildFamilyPaths` so xstock + crypto share the same component contract.

- **BUG-2026-05-12-E — Setup-hash dedupe silent skip.** `isIdenticalXstockSetupSuppressed` true → `continue;` with no counter increment. Result: `signalsGenerated > 0` with `tradesOpened = 0` and no visible reason in the panel. Added `setupHashDeduped` counter + `setup_hash_dedupe` null-reason emit. Verified live: `setupHashDeduped: 0` confirmed NOT the cause of 0 trades; 100% null rate is at strategy detect time.

- **BUG-2026-05-12-F — Family-mismatch denominator math broken.** UI showed 248,375 mismatches / 156,398 strategies-evaluated = 158.8% (impossible). Denominator should be eligibility-pass + eligibility-fail = total iterations. Endpoint now emits `vtsEvaluation.familyMismatchDenominatorTotal` (5,408 in current cycle) for the correct 60.5% rate. **Frontend UI math fix still queued** — `machine-learning.tsx` divides by old denominator.

**Pattern-strategies-in-family-lanes — semantic alignment with crypto:** Kyle's directive 2026-05-12 evening: "In the crypto asset class, the pattern strategies can fire in the quant paths, so that should also be a possibility for the X stocks." `isStrategyEligibleForLane` flipped: pattern strategies now eligible in family lanes. Verified live — strategy iteration count tripled (225 → 824) confirming pattern strategies now firing on both pattern lane AND family lanes per crypto's symbol-pool-union model. Asymmetry preserved: quant/hybrid strategies still excluded from pattern lane.

**Per-Pair Fresh-Tick Latency panel removed** from xStocks tab UI per Kyle directive 2026-05-12. Freshness query kept for scanner-cycle header tooltip.

**Verified counters from live xstock cycles 2026-05-12 evening (post-deploy PM2 #235):**
```
quantPairsEvaluated: 1035        patternPairsEvaluated: 435
quantStrategyEvaluations: 1846   patternStrategyEvaluations: 289
quantStrategyNulls: 1843         patternStrategyNulls: 288  (99.8% both lanes)
quantSignalsGenerated: 0         patternSignalsGenerated: 0
tradesOpened: 0                  setupHashDeduped: 0
familyMismatchDenominatorTotal: 5408
```

**Why 0 trades right now (post-RTH-close Mon evening UTC):** NOT infrastructure — every counter populates correctly, every silent-skip path now has telemetry. Pure detect-time strategy nulls across both lanes: pattern strategies returning null because `scanPatterns()` isn't detecting Morning Star/Inside Bar/Pivot Shift patterns on noisy 1m equity bars; quant strategies returning null because thresholds are crypto-tuned. **This is Layer-3 calibration territory** — pre-audit §-1.10 already flagged it. Generous filter ≠ generous signal flow.

**Calibration concerns flagged for future sub-batch (Kyle 2026-05-12):**
- Pattern path `di_min=3` too lenient (admits ~all pairs but `scanPatterns()` then nulls them at detect)
- `scanPatterns()` ATR multipliers at `pattern-recognizer.ts:553-554` crypto-tuned
- Quant strategy `module_constants.strategy.<name>.*` 26 wildcard rows for xstock_spot
- VN dominance in family-IMF rejection (31% of fails)

**Lessons:**
1. **Hardcoded "N/A" surfaces survive architectural overhauls.** Pattern path was hardcoded to `applicable.path: false` from B79.0m.b iteration 2 era; survived B79.0m.b2 architectural ship until Kyle navigated the UI and noticed pattern path showing as dead. Lesson: when a previously-N/A subsystem comes online, grep for `applicable.path: false` (and equivalents) across response builders.
2. **Schema-column drift causes silent panel failures.** Endpoint queries against columns that don't exist (`regime`, `null_reason`) caught by try/catch — panel sections went empty, no logs. Lesson: when DB schemas change, the queries referencing old column names need an audit pass, not just "it'll fail silently and we'll catch it later."
3. **In-memory state beats expensive aggregations.** The slow-load fix replaced two complex DB queries with cheap in-memory reads from the scanner's lifetime accumulator. The in-memory state was already populated; the endpoint just wasn't reading it. Lesson: when an endpoint is slow, audit whether the data it queries from DB is already available in process memory.
4. **Generous filters ≠ generous signal flow.** A wide-open pattern filter admits pairs but doesn't generate signals — the strategy detect functions correctly reject when there's no pattern shape. Tuning filters won't help signal flow; the bottleneck is at detect time. Layer-3 calibration needs to address strategy thresholds, not just filter thresholds.

---

## CLOSURE-2026-05-26 — B79.0n.SCORING + B79.0n.TEC

**Deploy chain:** Step 6 initial deploy `ceeaa15c6` (TEC + SCORING migrations + Step 3 code chunks); R-5 hotfix-deploy `29bfda74f` (added `assetClass=` + threshold tags to SQE_EVAL log line). Cumulative CI GREEN at `9952111f8`, run `26428529329` (2m35s).

**B79.0n.SCORING summary:** 8 new sqe_config rows (4 perp coverage + 4 crypto_spot numeric-threshold promotion). Predictive-confidence cache key F-2 fix `${assetClass}:${regime}:${strategy}` (3 callers threaded). Static-mirror-fallback counter via `getSQEStaticMirrorFallbackStats()`. **TWO-STEP per Langston D-5:** wildcard retirement deferred to B79.0n.SCORING.b after 48h verify-gate. F-1 resolver hooks for SCORE_WEIGHTS + RANKING_WEIGHTS bundled into .b.

**B79.0n.TEC summary:** Closes RUNNING_ISSUES #85 (deferred-from-B79.TEC HARD-FAIL extension). 32 new trailing_exit rows (perp coverage + crypto_spot + xstock_spot moonbag/persistence) + EXISTS-gated wildcard retirement (Migration 2, single-batch confirmed via clean grep). HARD-FAIL coverage softened from strict 11-key throw to observable per-key fallback counter — Langston ACK Option A; B79.0n.TEC.b restores strict throw within 7d of verify-gate close. tec-evaluator.resolveTECConstants consolidated to sync per-class cache lookup. trailing-exit-controller.ts:107 comment chronology updated citing Kyle 2026-05-21 directive (D-1 root cause via DB probe).

**Five-round CI iteration on TEC** (MANIFEST drift hotfix → idempotent A.2 backfill block → HARD-FAIL retreat) reveals two new institutional patterns codified in ASSET_CLASS_ONBOARDING_WORKFLOW §4.17-§4.18.

**Side effect:** pre-deploy `TEC_STALE_FAIL_CLOSED` errors firing every 60s through 02:46 UTC (B-NEW-40 stale-cache fence) STOPPED post-restart — deploy fixed a separate live issue as cleanup.

**Lessons:**
1. **Commit + push ≠ deployed.** R-5 follow-up commit `29bfda74f` was committed/pushed AFTER Step 6 deploy but never `git pull`ed to staging — Langston Step 8 SHA cross-check caught it. Codified in §4.17.
2. **CI initial-schema pg_dump may diverge from staging.** TEC Migration 1 v1 assumed rows existed on staging from B79.0m.b era; absent from CI's fresh-DB baseline. Hotfix added idempotent A.2 backfill block. Codified in §4.18.
3. **Strict HARD-FAIL extension can break existing test fixtures.** 7 TEC test files use per-class break_even_enabled + wildcard for other 10 keys; strict extension would require ~308 row-insert fixture refactor. Soft-fallback counter + 48h verify-gate + deferred strict throw is the pragmatic NO-PATCHES-compliant compromise.
4. **Build parity ≠ runtime parity.** SQE_EVAL R-5 schema is build-verified by Langston but runtime emission remains dormant (VTS-shadow has no candidates passing strategy detection in current regime). Schema-parity-only Step 8 ACK with dormant-test caveat documented in completion reports.

---

## CLOSURE-2026-05-26 — B79.0n.TELEMETRY

**Deploy:** Step 6 deploy `02bad33a6`, PM2 #323 at 18:01:48Z; CI all-4-green at run `26465795903`. Single CI iteration before green (one test fixture update on b79-0b suite for new 4-of-4 factory coverage on post-Step-3 push). Step 1 scope `4e790cf0d`; Step 2 pre-audit `019c4875b`; Step 3 implementation `12e451d037` (+980/-48 LOC across 12 files = 7 production + 5 new test); Step 4 change list `33ecd32b9`.

**B79.0n.TELEMETRY summary:** Completes the B79.0a per-asset-class `TelemetryAggregator` instance pattern across 9 chunks. Factory at `server/services/asset-class-instances.ts` extended from 2-of-4 active-class coverage (`crypto_spot` via no-touch fence → null; `xstock_spot` via dedicated in-memory triad) to **4-of-4** (`crypto_perp` + `xstock_perp` gain dedicated in-memory triads). Compile-time `assertNever` exhaustive-switch enforcement covers ASSET_CLASS_REGISTRY's 4 reserved-future classes (`forex_spot`/`forex_perp`/`equity_spot`/`equity_perp`) via explicit `[CLASS_NOT_WIRED]` throws. New non-arming-read companion `peekTelemetryInstance()` export in `server/services/telemetry-aggregator.ts` backs the new `getTelemetryInstanceStats()` accessor that serves the 48h verify-gate signal. `server/index.ts` boot pre-warm of 3 factory-managed triads HARD-FAILs via `process.exit(1)` on bootstrap exception. 28 NEW tests + 93 existing telemetry-related tests pass unchanged. Local tsc baseline 457 errors unchanged.

**Variant C structural finding (load-bearing rationale):** Per Langston AGREE on scope Q1, new instances are in-memory only **by construction**, not by policy — direct `new TelemetryAggregatorService()` bypasses the global singleton's `setInterval(persist, 5min)` arm because the persist-timer arming code path is structurally gated INSIDE `getTelemetryAggregator()` factory only. This makes Variant C safe by structure (no flag-check, no opt-out path). The 3 factory-managed instances cannot accidentally write disk state because the persist-timer construct never fires for them. **crypto_spot asymmetry preserved** — 18mo+ live disk-persist state at global singleton untouched.

**Verify-gate alert:** `1f34cf84-a37c-425c-a1c4-54924b053061` armed at triggers_at 2026-05-28T18:01:48Z. Expected: `crypto_perp.recordCount === 0` + `xstock_perp.recordCount === 0` for entirety of gate window (per-class VTS-writer threading deferred to WIRE-IN #16); crypto_spot continues recording normally via global singleton (no-touch fence held).

**Deferrals:** Q3 caller-site API per-class threading → OBSERVABILITY (#18); Q4 SQL `telemetry_history.asset_class` column → TELEMETRY.b (no SLA today — opens when first non-crypto_spot active class persists across restarts in live trading); `getTelemetryInstanceStats` `/api/diagnostics` route → OBSERVABILITY (#18).

**Lessons:**
1. **Variant C in-memory-only invariant is safe by structure, not by policy.** The persist-timer arming code path being structurally gated INSIDE the global-singleton accessor function means direct construction at the factory site simply does not invoke that path. No flag-check, no opt-out, no race. This is the canonical shape for per-class instance onboarding when persistent state is owned by a canonical class.
2. **Ship the non-arming-read companion (`peek*`) AT THE SAME TIME as the construction API.** Verify-gate signals are usually wired in the same batch that introduces the construction surface — a stats accessor that accidentally arms persist-timer machinery defeats the verify-gate's read-only contract. Codified in ASSET_CLASS_ONBOARDING_WORKFLOW §4.19.
3. **`[CLASS_NOT_WIRED]` is distinct from `[CLASS_INVALID]`.** The marker on reserved-future enum values tells the reader "this is a valid future class; onboarding work is required to wire it" rather than "this is a bug." Helps Phase 24 onboarding sequencing know what's left vs what's broken.
4. **Pre-existing infrastructure bugs surface during error-log review.** Step 7 verification surfaced a pre-existing `MarketDataHealthCheck` EACCES on `/home/runner` path (looks like a CI runner path bleed) — unrelated to TELEMETRY but worth tracking. RUNNING_ISSUES #144 entry filed as a future Tier-3 cleanup. Routine error-log inspection during Step 7 is structural debt-finding.


---

## BUG-2026-05-31-A — `sync-canonical-bridge.ts` producer-consumer drift (B.1.5 redeploy blocker)

**Surfaced:** 2026-05-29 23:09 UTC, when B.1.5 staging deploy (`aa3c2dd`) crashed scanner at boot. Process online, HTTP 502.

**Symptom:** `Error: [11.4H.6G][Mapper] No canonical regime-strategy map for asset class 'crypto_spot'. Check bridge/canonical/mapping-regime-strategy.json byAssetClass section.` thrown during esbuild bundle module-init at `market-indicators.ts` → `getExpandedRegimeDescriptionFromCanonical` → `getFavoredStrategiesForRegime` → `getClassMap`. xStock scanner never booted; site 502; rolled back.

**Root cause:** Producer-consumer contract drift LATENT since B79.0n.STRATEGY (`af99bd5`, 2026-05-24).
- **Source TS const** `CANONICAL_REGIME_STRATEGY_MAP` at `server/config/canonical-regime-strategy-map.ts:149` is typed `Record<CanonicalRegimeType, RegimeStrategyMapping>` — flat per-regime, NOT byAssetClass-nested.
- **Hand-authored JSON** `bridge/canonical/mapping-regime-strategy.json` was edited during B79.0n.STRATEGY to byAssetClass shape (v3.0.0) with per-class deltas (`defensive_hedge` crypto-only HVU; `orb` xstock-only IE+TFS-additive; `strong_bull_trend` globally excluded).
- **Runtime consumer** `getClassMap` at `server/core/strategy-mapper.ts:43` reads `typedCanonicalMap.byAssetClass?.[assetClass]` — strictly nested.
- **Sync utility** `server/scripts/sync-canonical-bridge.ts` `generateBridgeJSON()` was NOT updated — still reads the flat in-source const and emits a flat-per-regime JSON, OVERWRITING the hand-authored byAssetClass file when run.

**Why it stayed latent:** The sync script is a manual `npx ts-node` invocation, not part of `npm run build` or `pm2 restart`. Nobody re-ran it between af99bd5 and B.1.5, so the hand-authored byAssetClass JSON on staging stayed correct. The B.1.5 deploy doesn't run the sync either. The crash mode triggered by the B.1.5 deploy is the boot-time module-init read of the JSON. Hypothesis: esbuild ESM module-init ordering shifted when B.1.5 added/changed module-level imports in the eval-cycle/scanner/filter chain, causing `market-indicators.ts` to initialize earlier in the topological order — into a window where the JSON read returned a partial/empty value (atomic-write race during deploy suspected; precise trigger unconfirmed).

**Fix:** Redeploy unblocker `efeef6d` (2026-05-31). Rewrote `generateBridgeJSON()` to derive both per-class subtrees from new `ASSET_CLASS_OVERRIDES` const encoding the hand-authored deltas (exclude+add lists per class). Output proven byte-identical to hand-authored staging JSON across 40 assertions (2 classes × 5 regimes × 4 fields). New `server/tests/unit/sync-canonical-bridge.test.ts` (9 tests) locks the producer-consumer contract in CI so this drift class can't recur silently. Markdown bridge generators left flat (docs-only; only consumer is a shape-only structure test).

**Out-of-scope deeper structural fix (logged for follow-up):** Restructure the source TS const `CANONICAL_REGIME_STRATEGY_MAP` to byAssetClass nesting + update all ~56 in-tree consumers to dereference per-class. Eliminates the dual-shape ambiguity entirely. Out of scope here (urgency = unblock deploy). Logged as RUNNING_ISSUES #163.

**Lessons:**
1. **Pre-audit gap (Kyle 2026-05-31 critique):** Pre-audit Step 2 did not include "verify the producer-consumer contract for every shared canonical artifact the batch touches indirectly." The new code didn't modify the canonical map, but module-init ordering shifts can promote latent contract drift to a deploy-time crash. **New onboarding rule:** add a `CANONICAL_ARTIFACT_PRODUCER_CONSUMER_AUDIT` line to the Step 2 pre-audit template — for every JSON / generated file the batch's code paths read at runtime, verify that the producer (sync script / build step / hand-author) and the consumer (runtime reader) agree on shape. Cheap check that would have caught this in pre-audit. Codified in ASSET_CLASS_ONBOARDING_WORKFLOW.
2. **CI unit test as contract lock.** A 9-test unit suite asserting `generateBridgeJSON()` output shape against `getClassMap` consumer expectations is the right enforcement surface. Build-step regeneration would add a runtime dependency in the bundle pipeline; unit test catches it without that risk.
3. **Hand-authored canonical files masking generator drift.** If a generator silently emits wrong-shape output but nobody runs it, the bug stays latent until the next invocation. Either fold the generator into CI (regenerate-and-compare) or lock the contract via test. Latter is lighter.

---

## BUG-2026-05-31-B — node-cron silent fire failure (B-NEW-36 weekend-shutdown timer)

**Surfaced:** 2026-05-31 06:30 UTC during weekend-shutdown audit. `scheduled_tasks_audit` table shows ZERO `weekend_shutdown` rows for Sat 30 May 00:00 UTC boundary (= Fri 29 May 8 PM ET, the most recent Friday close). Boot-reconciliation at Sat 31 May 05:06 UTC subsequently caught up (insideWeekendWindow=true detected, 244 trades suspended, scanner paused). System ended up in correct state via the safety-net path, but the primary cron path silently failed to fire.

**Symptom:** No `[B-NEW-36][WEEKEND_SHUTDOWN_START]` log line at Sat 30 May 00:00 UTC. No exception. No `[B-NEW-36][WEEKEND_SHUTDOWN_FAIL]` log line. No audit-row write attempt. node-cron's `schedule()` callback was simply not invoked.

**Verified NOT the cause:**
- Process was UP and healthy at Sat 30 May 00:00 UTC (PM2 history + log evidence). Continuous uptime from Thu 28 May 11:03 UTC through Sat 31 May 05:06 UTC (~66 hours), the fire window was ~37h into that uptime.
- Central-clock-based periodic ticks fired every 60s without gaps at the exact fire window: `[B78.1][WS_TICK_RATE]` + `[A3.R9.0.C][METRICS]` at 00:00:10, 00:01:10, 00:02:10, etc. — event loop was alive.
- No async exception logged before, during, or after the fire window.
- DST transition is not in play (last DST event 2026-03-08; mid-EDT throughout).

**Possible (unverified) causes:** node-cron 4.x async-handler edge case + `noOverlap:true` interaction; scheduled-task handle GC; registration-time race; cross-process state contamination on PM2 restart cascade. Precise trigger remains UNCONFIRMED.

**Fix:** B-NEW-36 poll-reconcile (`5f20c71`, 2026-05-31). Added `reconcileWindowState()` to `xstockSpotScanner.clockTickHandler` running every 30 ticks (= 30s) regardless of `isPaused`. Compares `isXstockMarketOpenUTC()` vs `scanner.isPaused`; on drift, invokes new `runShutdownFromPoll`/`runRestartFromPoll` entries on `sessionLifecycleController` (sharing the existing shutdown/restart core, refactored). Atomic `inFlight` mutex + post-mutex state recheck handle cron-vs-poll race. Poll path skips prewarm (catch-up semantics) and writes a system-alert (severity=warning, category=breakage) so future cron regressions surface to §10.5 per-turn checks rather than silently relying on poll forever. `[B-NEW-36][POLL_RECONCILE_CHECK]` 10-min heartbeat provides positive proof-of-life. Audit-row meta gains `trigger_source` field with values cron / poll / boot for query distinction.

**Why "fixed" without root cause:** The poll-reconcile does NOT depend on understanding why cron failed because it doesn't touch cron. It rides on the central-clock path that has positive evidence of firing reliably at the exact moment cron missed. If cron silently fails again Sunday, the poll catches up within 30s AND writes a system-alert telling us cron regressed (forensic trail next time). If cron is healthy, poll observes state-matches and no-ops.

**Blast-radius concern (Kyle 2026-05-31 pushback): UNRESOLVED.** There are 5 OTHER node-cron schedules in `/server` with no equivalent safety net: `server/jobs/formula-auto-audit.ts`, `server/jobs/feed-integrity-auto-check.ts`, `server/services/awareness-scheduler.ts` (×2: hourly + 6-hourly), `server/services/xstock-universe-cron.ts`. Any could have already silently failed without detection. Audit batch logged as RUNNING_ISSUES #164 — must (a) check each for evidence of prior silent failures via output artifacts, (b) instrument each to log on every successful invocation, (c) decide policy (poll-reconcile parity vs pin node-cron version + open upstream bug vs replace library).

**Lessons:**
1. **In-process timers carry silent-failure risk.** node-cron has no persistent state and no observability on missed fires. Mitigation patterns: (a) poll-based reconcile riding a different tick source, (b) audit-table write on every fire so missing rows are detectable, (c) external scheduler (systemd timer / cron + HTTP) for boundaries where silence is catastrophic.
2. **Robust ≠ understood.** Fix can be correct against an unknown root cause IF the new path uses an independent mechanism with positive evidence of reliability. State the trust argument explicitly in the completion report so future readers know why the fix is robust despite the unknown.
3. **Honest scoping under time pressure.** Sun resume in ~41h meant we couldn't wait for root cause. The right move was to ship the structural safety net + log the root-cause investigation as a follow-up batch, not to claim the underlying issue is understood.
4. **Audit-table write is the canonical evidence trail.** Whenever a scheduled task fires, write a row regardless of outcome (success / error). Absent row = missed fire. This pattern caught BUG-2026-05-31-B because `scheduled_tasks_audit` is the canonical source of truth, not log greps.

## FIX-2026-06-11-B — B-4.7: per-asset-class regime (#162) + per-class canonical map source (#163)
**The damage being fixed (C1, live contamination):** every VTS trade row was stamped with a crypto-dominated mixed-class `globalRegime` (the ~2:1 crypto cohort outvoted xStocks in one shared majority vote) and a mixed-class `globalFriction` — the xStock calibration arc was ingesting crypto-flavored context labels daily. Fixed by per-class votes (mixed votes DELETED from both sources) + class-true stamps with AT-OPEN preservation (close-time re-resolution fallbacks removed — they mixed timestamps AND classes). vts calibration epoch → 3: pre/post rows never mix.
**The near-miss (chunk-B diff review, Langston):** the first tree re-point of the VTS eval loop would have silently disabled the quant-strong_trend lane — the bridge's ASSET_CLASS_OVERRIDES conflated class-INELIGIBILITY excludes (orb-for-crypto, defensive_hedge-for-xstock) with favored-LIST curation (strong_bull_trend, lane-routed). Structural fix: the two exclude kinds split; the materialized tree (eval universe) keeps lane strategies; the bridge favored-list derivation subtracts them — bridge JSON stayed byte-identical (4,361B, independently re-proven on staging) while eval behavior stayed exactly pre-batch for crypto. ONE intended delta: xstock TFS eval gains orb (the B79.0n.STRATEGY add finally reaching the loop). Validation domain = base ∪ trees (never narrower; historical ST+orb rows validate).
**Honest-absence semantics:** below 5 same-class pairs the vote is null (CLASS_IDLE), friction with no same-class sample is null/NO_SAMPLE (the synthetic 25 default is gone), transition trackers suppress during idle and re-seed SILENTLY on resume (no false Sunday-reopen flips; the friction tracker keeps its OWN idle flag — a shared flag was read-order-dependent, Langston diff-A R1). selectContextAwareStrategy throws on unwired classes (B80 guard).
Deploys `b8ab812de` (chunk A) + `2c986c231` (chunk B); CI green; Step-8 CONFIRMED. Issues: #162/#163 RESOLVED; #217 (CONTEXT_BONUS wire-or-remove → AMR), #218 (dead getMarketContextFields + Tier-6 fee default param), #219 (dormant flipRate), #220 (frozen setNullReason stderr anomaly, pre-existing, flushed) OPENED. R2 full-closure alert: `b47_sbt_fresh_admit`.

## GAP+FIX-2026-06-17 — P19-B6: the daily-loss auto-trip safety brake had been silently DELETED; RESTORED
**The gap (a deleted safety mechanism, not a never-built one):** the system once had an automatic daily-loss kill switch — `risk-manager.ts::checkKillSwitch` + `calculate24hPL`, mode-aware, wired to the modern `tripKillSwitch` — that watched the trailing-24h loss and auto-halted trading when it crossed `dailyLossKillSwitchPct`. It worked as of Phase 8. It was DELETED 2026-01-01 in commit `594aad717` as collateral of an unrelated remove-legacy sweep; its trigger-wiring (F2) had already been cut earlier, so by Phase 19 the threshold sat in `guardrails_v2` as a manual-only check with NO service watching running P&L. The governance docs (roadmap §19.0.B, SIM line 1551) had drifted to describe this as a never-existed gap to BUILD. **Kyle caught it** (2026-06-16: "it was working as of Phase 8 — re-check that code"), which reframed the batch from build to RESTORE and is itself the lesson: a "build new" scope item should be cross-checked against git history when anyone recalls the capability once existing.
**The fix (RESTORE + harden):** recovered the deleted logic from `594aad717^` into a NEW `server/services/daily-loss-budget.ts` — rolling-24h REALIZED loss % vs `getPortfolioBalanceV2`, **session-anchored** window `max(now−24h, engineSessionStart)` so a restart rebaselines (circuit-breaker, Kyle decision), `≤0`-portfolio→force-breach. Auto-trips the EXISTING `tripKillSwitch` ONLY — confirmed in code that the modern trip already flattens all open positions via `stopPaperSimulation→forceCloseAllOpenPositionsOnStop`, so restoring Phase-8's separate `closeAllTrades` would have DOUBLE-closed; B6 adds none. Re-entrancy across the fire-and-forget close hook is closed three ways (trip persisted before the throwable flatten + `setImmediate` deferral + a synchronous atomic `killInProgress` latch). Added 2 per-mode warning tiers (50%/75% of kill, % not absolute) with ratchet + hysteresis re-arm + arm-cycle dedupe, surfaced on BOTH the operational alert feed AND a new user-facing dismissible website banner (Kyle directive).
**Two real bugs caught in Langston Step-4 (both fixed before ship):** (1) the new warning-order coherency rule RULE_011 compared the `decimal(5,2)` columns as STRINGS (they arrive off Drizzle as strings) — a lexicographic compare that REJECTED a legal `warn1=9, warn2=80` and ADMITTED an inverted `80/9`; fixed by `parseFloat` before the ordering compare + making `Number.isFinite` part of the validity predicate (NaN now FAILS, not silently skips) + 4 regression tests. (2) A thrown `doKill` left `killInProgress=true` set before the await, permanently latching the evaluator OFF; fixed so a throw rolls the latch back and fires a critical TRIP-FAILED alert (retries next close). Force-trip proven by a 5-case integration test (auto-trip+latch+both-alerts, idempotent, recovery, gated-off, already-tripped); live close-driven exercise lands at B7b. Orphan `paper-metrics.calculate24hPL` (0 callers) DELETED (rule-18). Deploy `43601300f`, CI `27678506922` all-4-green, restart#399. **Realized-only** (faithful to Phase-8) → unrealized-drawdown gap OPENED as #303 → Phase-25. **#302** (paper-vs-live full guardrail separation, P19-B6.8) OPENED. Langston Step-4 re-APPROVE + Step-8 CONFIRMED.
