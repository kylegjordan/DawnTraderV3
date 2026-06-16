# P19-B5c SCOPE — Continuous Q-D (Quote-Depth) Probe → `xstock_qd_probe_history` (#86)

**Batch:** P19-B5c (carved out of P19-B5 per Langston Q2 @ B5 Step-1, 2026-06-16 — the only B5 member that is ALWAYS-ON, so it owns its own write-volume / cadence / retention / dedup story).
**Author:** Claude New (CC-B). **Date:** 2026-06-16. **Step:** 1 (scope draft → Langston ACK).
**Predecessors CLOSED:** P19-B5a (active-path reject/admit capture, dormant-until-active) + P19-B5b (#94 xStock VIX+DXY macro snapshot) — both Langston-Step-8-CONFIRMED, awaiting Kyle ack.

---

## 0. PREVIOUSLY-STATED-VS-NOW (§9.2)

- **#86 home:** PREVIOUSLY "B79.x follow-up / tracker placeholder." NOW "its own batch **P19-B5c**." REASON: Langston Q2 @ P19-B5 Step-1 (2026-06-16) — a continuous quote-depth probe is always-on (unlike the rest of B5, which was dormant-until-active), so it owns its own cadence/retention/dedup design.
- No numeric deltas otherwise (first scope for this batch).

---

## 1. ONE-LINE GOAL

Build the **always-on background probe** that writes a compact, retention-stable, query-ready time series of xStock per-symbol **friction evidence** (bid-ask spread + top-of-book depth + freshness) to a NEW table `xstock_qd_probe_history`, so the friction-modeling surface gains trend visibility (mean / p95 / skew over hours → weeks) that the raw high-frequency tick archive cannot provide (it is pruned + cold-offloaded).

**CAPTURE-NOW / BUILD-LATER:** this batch makes the *probe* functional. It does **NOT** make per-pair friction modeling functional.

---

## 2. §9.1 SCAFFOLDING / DORMANCY DECLARATION

> 🚨 **THIS BATCH DOES NOT MAKE PER-PAIR FRICTION MODELING FUNCTIONAL.** The friction model's `perPairOverrides` stays empty and `spreadRateDefault` / `slippageRateDefault` are untouched. B5c only COLLECTS the distributional evidence; CONSUMING it (deriving per-pair friction overrides) remains downstream (`friction.ts` comment cites B81; PHASE_19_PLAN / Phase-25 friction-extraction).

**NOT dormant in the B5a sense.** Unlike B5a (which was gated to fire only when active-paper turns on), this probe **writes rows immediately on deploy** and runs regardless of paper/live active state — it is a passive-learning / telemetry component, like the rest of the archive layer. So B5c is *functional-on-deploy* for the probe itself; the dormancy declaration above is strictly about the *downstream consumer* (friction modeling) not being built.

---

## 3. THE ARCHITECTURAL FINDING THAT SHAPES SCOPE (the fork for Langston)

Direct reads (Step-1.a) surfaced a finding that reshapes the naïve "continuous Q-D probe" framing. Stated plainly so the decision is informed:

**(a) The on-venue quote-depth is ALREADY captured raw.** `xstock_spot_ticker_snap` (schema `tickerSnapColumns`, `shared/schema.ts:4680`) carries `bid / bid_qty / ask / ask_qty / last / captured_at` per symbol, written continuously by the B74 ticker batch-writer (`ticker-batch-writer.ts`) at ≤1 row/sec/symbol (throttle `b74_ticker_snapshot_min_interval_ms`, 5s flush). `depth-source.ts:getDepthSnapshot` already reads top-of-book from it for fills. **So a probe that merely re-reads bid/ask would be redundant with data already in the tick archive.**

**(b) But that raw archive is NOT a stable long-horizon series.** The B75 retention sweep (`b75-retention-sweep.ts:72`) prunes `xstock_spot_ticker_snap` by `xstock_spot_ticker_snap.hot_retention_days` and cold-offloads old partitions via B-NEW-47. It is also high-frequency raw (expensive to aggregate into distributions) and carries **no derived friction fields** (no `spread_bps`, no depth-notional, no staleness flag). Friction modeling over "hours / days / weeks" needs a curated, retention-tuned, low-volume series — which is exactly what #86 asks for ("dedicated DB table so the friction-modeling surface has trend visibility over time").

**(c) The existing "Q-D probe" (B79.0a) measured a DIFFERENT thing.** `scripts/b79-0a-qd-probe.ts` captures the **xStock-vs-underlying BASIS** (`deltaPct = (xstockPrice − underlyingPrice) / underlyingPrice`) using an **external Yahoo Finance fetch** per ticker, 7 hard-coded symbols, one-shot JSON. That is a fair-value / arbitrage signal — NOT the on-venue friction cost the fill model pays. The friction model's `spreadRateDefault` (`friction.ts:37`, "12 bps mid-range of 5-15 bps observed for top XStocks pairs") is the **bid-ask** spread, not the basis.

**So "#86 continuous Q-D probe" forks into two candidate captures:**

| | What it captures | Source | Always-on-safe? | Friction-relevant? |
|---|---|---|---|---|
| **(α) Derived friction series** *(RECOMMENDED core)* | per-symbol `spread_abs`, `spread_bps`, `mid`, top-of-book depth notional (bid/ask), snap age + stale flag | INTERNAL `xstock_spot_ticker_snap` only | YES (no external dep) | YES — directly the `spreadRateDefault` distribution + depth-gate tuning |
| **(β) Basis series** | per-symbol xStock-vs-underlying `deltaPct` (continuation of B79.0a) | needs underlying equity price (external Yahoo today; internal feed *maybe* exists — see below) | only if internally sourced | indirectly (fair-value, not fill cost) |

**Internal underlying-price path (β feasibility):** `amr-equity-feed.ts` + `stocks.ts` reference underlying / `regularMarketPrice`. Step-2 will confirm whether that path provides **per-symbol single-stock quotes for the whole active universe** or only the VIX/DXY macro indices (B5b). That determines whether β is internally sourceable at all; an always-on Yahoo-per-tick loop for 20-40 symbols is a fragile external dependency and is NOT acceptable for a 24/5 background service (NO-PATCHES).

### Decisions requested from Langston (Step-1)

- **D1 — Core = Option α?** Confirm B5c core = the derived on-venue friction series from internal `ticker_snap`. *(CC recommends YES.)*
- **D2 — Basis (Option β) in or out?** CC recommends: **OUT of the B5c core** (different signal + external-dependency risk). IF Step-2 confirms an internal per-symbol underlying feed covering the universe, add basis as a **nullable column-set at the same cadence**; if only Yahoo exists, **home "continuous basis capture" as a separate item** and keep `b79-0a-qd-probe.ts` as the on-demand basis spot-check tool. *(Tied to D10.)*
- **D3 — Cadence?** CC recommends module_constants-resolved, **default 5 minutes** (α is cheap; ≥ the snap throttle; 5 min is ample for friction distributions). Volume estimate: ~20-40 symbols × 12 buckets/hr × ~120 active hrs/wk ≈ 29k-58k rows/wk; at 90-day retention ≈ 0.4-0.8M rows steady-state (trivial for Postgres).
- **D4 — Retention?** CC recommends module_constants `xstock_qd_probe_history.hot_retention_days`, **default 90 days** (covers weekly seasonality with margin for distribution fits).
- **D5 — Dedup?** CC recommends unique `(symbol, bucket_start)` where `bucket_start = floor(captured_at to cadence)`; `ON CONFLICT DO NOTHING` (idempotent if double-armed / overlapping tick).
- **D6 — Universe?** CC recommends iterating `xstockUniverseService.getActiveUniverse()` (the live active set, ~20-40), NOT the hard-coded 7 from B79.0a. *(recommends YES.)*
- **D7 — Feed-gap / weekend handling?** CC recommends: when a snap row EXISTS but is stale (age > a configurable freshness ceiling), still WRITE the row with `snap_age_ms` + `stale=true` (honest gap representation for the distribution); SKIP writing only when NO snap row exists for the symbol at all. *(xStock is 24/5 per rule 17; weekend shutdown will produce stale/absent snaps — the series should show the gap, not silently omit it.)*
- **D8 — Scheduler pattern?** CC recommends the canonical **node-cron + `cronRegistry.register` + `scheduledJobsAudit.writeFireRow` fire-evidence + B-NEW-49 smoke-test arming** path (same observability as the discovery + retention crons), over the `scheduler-registry` setInterval path — so a silent arming failure is caught.
- **D9 — Retention mechanism?** CC recommends **folding the new table into the existing B75 sweep specs** (`b75-retention-sweep.ts` already enumerates per-table `hot_retention_days` + batched delete + cold-offload), rather than a separate dedicated prune cron. *(Confirm; the B75 sweep is partition-based — Step-2 confirms whether the new table should be partitioned like the snap tables or a plain table with an age-delete.)*
- **D10 — Does B5c retire `b79-0a-qd-probe.ts`?** Per never-leave-legacy (rule 18): if basis stays OUT (D2), the one-shot stays as a *distinct on-demand basis tool* (not legacy). If basis comes IN, retire the one-shot on the spot + log to `DELETED_COMPONENTS_LOG.md`. *(Tied to D2.)*

---

## 4. NUMBERED OBJECTIVES + VERIFICATION CRITERIA

1. **NEW table `xstock_qd_probe_history`** — migration SQL + paired rollback + MANIFEST.txt entry (`git add -f`) + `shared/schema.ts` definition. Columns (pending D1/D2): `id` (bigserial or uuid per convention), `symbol`, `asset_class`, `captured_at` (the snap's time), `bucket_start` (cadence-floored, dedup key), `recorded_at` (write time), `bid`, `ask`, `mid`, `spread_abs`, `spread_bps`, `bid_depth_notional`, `ask_depth_notional`, `snap_age_ms`, `stale` (bool), `metadata` (jsonb); `[basis_delta_pct` nullable IF D2=IN]`. Indexes: `(symbol, bucket_start)` UNIQUE (dedup), `(symbol, captured_at)` (range queries).
   - **Verify:** table exists on staging; `\d xstock_qd_probe_history` matches schema; unique constraint present.
2. **NEW probe service** — reads active universe → latest `ticker_snap` per symbol → computes spread/depth/staleness (PURE, testable functions) → writes one compact row per `(symbol, bucket_start)` via `ON CONFLICT DO NOTHING`. Fail-soft per symbol (one bad symbol never aborts the batch).
   - **Verify:** psql shows rows accumulating ≥1/symbol/bucket with non-null `spread_bps`, depth, `snap_age_ms`; spread_bps values sane (single-to-low-double-digit bps for liquid names).
3. **Cadence + retention + dedup all module_constants-resolved** — NO hardcoded fallbacks (Kyle pref: DB-governed → fail-hard if unseeded). Seed migration for `xstock_qd_probe_history.probe_cadence_*`, `.hot_retention_days`, `.freshness_ceiling_ms`.
   - **Verify:** constants present in `module_constants`; service fails loud (not silent-default) if a required key is missing.
4. **Always-on boot wiring** (`server/index.ts`) — register the probe cron + `cronRegistry.register` + fire-evidence `writeFireRow` in finally + ensure B-NEW-49 smoke-test/verifier covers it.
   - **Verify:** boot log shows the cron armed; a `scheduled_tasks_audit` fire-evidence row appears after the first tick; smoke-test reports OK for the new job.
5. **Retention** — per D9 (fold into B75 sweep, or dedicated). 
   - **Verify:** retention config resolves; (Step-2 to confirm partition vs plain-table delete).
6. **Unit tests** — spread/depth/staleness computation purity; dedup (second write same bucket = no dup); stale-flag at the freshness ceiling; empty-universe safety (no throw, no write); fire-evidence written on success + on error.
   - **Verify:** all green in bench vitest; no regression in suite count.
7. **Close-out** — bench `node scripts/check-tsc-baseline.mjs` (no regression) + `npx vitest run` green → CI all-4-green on `migration/aws-supabase` head → staging deploy HTTP200 clean boot → live-verify rows + fire-evidence → governance → completion report → close.
   - **Verify (§9.3):** this is a BACKEND data-quality / telemetry batch with **NO UI panel** this batch — so "staging verified" = psql row evidence + boot/fire-evidence logs, explicitly labeled as such (not UI-navigated, because there is nothing to navigate). State this in the completion report.

---

## 5. GOVERNANCE APPLICABILITY (judged per §9 anti-pattern — not skipped-by-default)

- **SIM (Tier-2):** YES — new always-on component + new table + cross-cutting reads (`ticker_snap`), boot registration, B75 retention coupling. Add the component + table + liveness note.
- **System Manual (Tier-2):** RECOMMEND **N/A** — this is a data-quality / telemetry probe, not architecture / strategy / regime / filter / signal-pipeline / math (per §9: a pure data-quality service is SIM-scope, not System-Manual-scope). *Counter-option for Langston:* if the friction-evidence series should be documented in the friction-model chapter, CC will add it. → **D11.**
- **Tier-1 (unconditional):** BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1 board + §5 log (§14 temporary rule), RUNNING_ISSUES (#86 → capture-landed; downstream friction-extraction stays homed), MEMORY (4-way sync), completion report.
- **Tier-2 (applicable):** MULTI_ASSET_VTS_EXPANSION_PLAN — the temporary xStock-calibration WORKING LIST (friction tracker) MUST be updated (mark #86 capture-substrate landed).
- **DELETED_COMPONENTS_LOG:** only if D10 = retire the one-shot.

---

## 6. OUT OF SCOPE (explicit)

- Per-pair friction overrides / consuming the distribution to set `perPairOverrides` (downstream — B81 / Phase-25 friction-extraction).
- Any change to `friction.ts` defaults, depth-gate config, or fill pricing.
- crypto_spot sibling probe (B5c is **xStock-only by construction**; crypto has the live WS book + a different friction question). *Confirm with Langston whether a crypto sibling is wanted later — CC recommends xStock-only for B5c, home a crypto sibling separately if desired.*
- UI surfacing of the friction series (no panel this batch).
- Basis (Option β) IF D2 = OUT.

---

## 7. STEP SEQUENCE (this batch)

1. **Step-1 (this doc)** → Langston ACK + rulings on D1-D11.
2. **Step-2** pre-audit: deep SIM read; confirm β feasibility (`amr-equity-feed.ts` / `stocks.ts` coverage); confirm B75 partition-vs-plain decision; blast-radius (boot wiring, cron-registry, B75 specs, schema); draft `P19_B5c_PRE_AUDIT.md`.
3. **Step-3** implement (migration → schema → pure compute fns → service → boot wiring → retention → tests), chunked.
4. **Steps 4-11** Langston embedded-diff review → CI → deploy → CC verify → Langston Step-8 → governance → completion report → close.

---

## 8. LANGSTON STEP-1 RULINGS — LOCKED (2026-06-16, ACK → proceed to Step-2)

Langston ACKed the scope and ruled on all decisions. Authoritative going into Step-2:

- **D1 — Core = α (derived on-venue friction series from internal `ticker_snap`): CONFIRMED.**
- **D2 — Basis (β): OUT of core, CONFIRMED + AMENDED.** Even if Step-2 finds an internal per-symbol underlying feed, **do NOT auto-add basis as a nullable column-set** — surface the finding as a **one-line addendum decision** for Langston to rule (basis has different seasonality/retention and is a different signal). *(CC Step-1.a finding to carry into the addendum: an internal per-symbol underlying path DOES exist — `stockService.getQuote` via Finnhub, cached/retry; `amr-equity-feed.ts` is VIX/DXY macro ONLY, not per-symbol. Caveat: the underlying US equity trades RTH-only while xStock is 24/5, so basis is semantically clean only during RTH overlap. → present as the addendum, do not act.)*
- **D3 — Cadence 5 min, module_constants-resolved: CONFIRMED.**
- **D4 — Retention 90 days: CONFIRMED.**
- **D5 — Dedup `(symbol, bucket_start)` + `ON CONFLICT DO NOTHING`: mechanism CONFIRMED, but `bucket_start` DEFINITION CORRECTED.** Floor `bucket_start` on the **probe-fire cadence grid (fire time)**, NOT on the snap's `captured_at`. Keep `captured_at` as the actual snap timestamp (staleness is computed from it). RATIONALE: if bucket = floor(captured_at), a feed gap makes two consecutive ticks read the same stale snap → same captured_at → same bucket → second write deduped away → ONE stale row for a multi-bucket gap (under-represents the gap, breaks one-row-per-symbol-per-bucket regularity). Fire-grid flooring → regular grid + correct idempotency + an honest stale row per bucket during a gap. **Reflect in Step-2 schema.**
- **D6 — Universe = `getActiveUniverse()`: CONFIRMED** (not the hard-coded 7).
- **D7 — Stale-but-present → write `stale=true`; skip only no-snap-at-all: CONFIRMED + ADD.** When skipping a symbol for no-snap, **record the skipped-symbol count in the fire-evidence/metadata** (so a silent coverage drop — probe bug vs legitimate weekend absence — is observable, not inferred).
- **D8 — node-cron + `cronRegistry.register` + `writeFireRow` + B-NEW-49 smoke-test: CONFIRMED (strongly).**
- **D9 — Fold retention into B75 sweep as single owner: CONFIRMED, but lean PLAIN-TABLE + indexed age-delete over partitioning.** At 0.4-0.8M rows steady-state, no partition machinery. **Step-2 MUST confirm** whether the B75 sweep can operate on a non-partitioned table or is hard-wired to partitions; if partition-only, surface + decide (do not partition a sub-1M-row table just to satisfy the sweep's shape).
- **D10 — Keep `b79-0a-qd-probe.ts`: CONFIRMED, document as intentionally-retained.** One line in the completion report's "left-intentionally" list per rule-18: "kept as the on-demand basis spot-check tool, distinct purpose, NOT superseded by B5c."
- **D11 — System Manual: NOT full-N/A — add a ONE-LINE cross-reference** in the friction-model chapter: "a continuous on-venue friction-evidence series accrues in `xstock_qd_probe_history`; consumption (per-pair overrides) deferred to B81/Phase-25." No chapter write (the probe is SIM-scope); the full friction-chapter write happens at CONSUMPTION time (B81 — flag forward).

### Two additions (fold into Step-2/Step-3 — not blockers)

- **A1 — Degenerate-quote handling in the pure functions + a test.** `spread_bps = (ask−bid)/mid·1e4` MUST guard zero/negative mid, crossed book (`ask < bid`), and `bid == 0`. Decide the policy (write with flagged/null `spread_bps`, or skip) + unit-test it — thin xStock books at the open produce these.
- **A2 — `freshness_ceiling_ms` seeded RELATIVE to cadence, not arbitrary.** At 5-min cadence a snap up to ~5 min old is normal, not stale — too-tight a ceiling flags every row and the flag becomes meaningless. Default ≥2× cadence as a starting point; note the relationship in the seed migration.

**Most-wanted-reflected-in-pre-audit:** D5 (fire-grid bucket) + D2 amendment (no auto-add of basis).
