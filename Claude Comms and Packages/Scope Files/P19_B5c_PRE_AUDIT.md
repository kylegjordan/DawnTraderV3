# P19-B5c PRE-AUDIT — Continuous Q-D (Quote-Depth) Probe → `xstock_qd_probe_history` (#86)

**Batch:** P19-B5c. **Author:** Claude New (CC-B). **Date:** 2026-06-16. **Step:** 2 (pre-audit → Langston review).
**Predecessor:** Step-1 scope ACKed (commit `eab5fde27`); rulings D1-D11 + A1/A2 locked in scope §8.
**Infra note for Langston:** read ONLY this inbox file + `ssh staging` for any repo inspection. Do NOT `cd` to a mounted drive or run git on a mounted repo.

---

## 0. PREVIOUSLY-STATED-VS-NOW (§9.2)

- **Universe accessor:** scope §3/§8 D6 named `getActiveUniverse()`. NOW: the canonical live accessor is **`XSTOCK_SPOT_SYMBOLS`** (`ReadonlySet<string>`, `shared/asset-classes.ts:326`, derived from `XSTOCK_SPOT_REGISTRY`, kept current by the discovery/fallback layers). `getActiveUniverse()` is a stale doc-comment name in `universe-service.ts` with no live method. REASON: direct read; the scanner iterates `Array.from(XSTOCK_SPOT_SYMBOLS)` (`scanner.ts:501`) — the probe mirrors it. Intent unchanged (iterate the live active set, not the hard-coded 7).
- No numeric deltas otherwise.

---

## 1. SIM CONSULTATION (mandatory Step-2)

**New component:** an always-on `xstock_qd_probe_cron` background job + a new `xstock_qd_probe_history` table. Per-component map:

- **Upstream (reads):** `xstock_spot_ticker_snap` (the B74 archive table — SIM §1833 "B74 Passive Archive Pipeline"), latest row per symbol via the existing `(symbol, captured_at)` index (`schema.ts:4709`); `XSTOCK_SPOT_SYMBOLS` in-memory set (SIM universe-discovery context, §9.x). NO external feed (β is OUT — see §6).
- **Downstream (writes / consumers):** `xstock_qd_probe_history` (NEW) + `scheduled_tasks_audit` (fire-evidence, shared with all crons). FUTURE consumer (NOT this batch): friction-extraction (per-pair `perPairOverrides`), B81/Phase-25.
- **Shared state / singletons (SIM §59 Cross-Cutting Runtime/Liveness Registry):** the probe is **near-stateless** — only in-memory state is the `node-cron` task handle + the idempotent double-register guard (mirrors `xstock-universe-cron.ts`). No shared mutable runtime state, no per-mode/per-user coupling, no engine touch. → add ONE background-execution entry to the registry (`xstock_qd_probe_cron`), severity LOW.
- **Background execution (SIM §9.10.c B-NEW-49 observability):** registers via `cronRegistry.register(...)` → auto-covered by the boot smoke-test (`cron-arm-smoke-test`, `server/index.ts:1430`) + the 15-min fire-evidence verifier (`server/index.ts:1434`). A silent arming failure becomes a §10.5 alert within 15 min — exactly the safety net D8 wants.
- **Weekend-lifecycle interaction (SIM §688-689, B-NEW-36):** the xStock ticker feed PAUSES during weekend shutdown (scanner suspended Fri→Sun), so `xstock_spot_ticker_snap` stops receiving rows → snaps go absent/stale on weekends. The probe MUST treat this honestly (see §5 D7-refinement) and NOT mistake an expected weekend for a breakage.
- **Blast radius: LOW / additive.** New table + new service + one new boot line + one new `cron-registry` entry + one retention pass. **No existing code path is mutated**; nothing reads the new table this batch; xStock-only by construction; zero change to fills, friction model, depth-gate, or the scanner. The only existing files touched are `server/index.ts` (one registration line), `shared/schema.ts` (new table), the retention sweep (one additive pass — see §3), and `drizzle/migrations/MANIFEST.txt` (one entry).

**Where SIM/System-Manual updates land (Step-10):**
- SIM: new subsection near §1833 (B74/archive family) describing the B5c probe + table; one line in the §59 liveness registry (`xstock_qd_probe_cron`, LOW).
- System Manual (D11): ONE-LINE cross-reference in the friction-model chapter ("a continuous on-venue friction-evidence series accrues in `xstock_qd_probe_history`; consumption deferred to B81/Phase-25"). No chapter write (probe is SIM-scope telemetry).

---

## 2. CONFIRMED ARCHITECTURE (direct reads)

| Surface | Finding | Source |
|---|---|---|
| Quote-depth source | `xstock_spot_ticker_snap`: `bid, bid_qty, ask, ask_qty, last, captured_at` (+ 24h fields, `metadata` jsonb) | `schema.ts:4680-4710` |
| Writer cadence | B74 ticker-batch-writer: per-`(class:symbol)` throttle (default 1000ms), 5s flush; so a snap is ≤1/sec/symbol when feed is hot | `ticker-batch-writer.ts:24-100` |
| Top-of-book read precedent | `depth-source.ts:getDepthSnapshot` reads exactly these fields for fills (ask>0 ∧ ask_qty>0 ∧ bid>0 ∧ bid_qty>0, else null) | `depth-source.ts:47-70` |
| Staleness precedent | `/api/xstocks/freshness` does per-symbol `MAX(captured_at)` over 24h; thresholds fresh ≤90s / stale ≤600s / dead beyond | SIM §1271 |
| Universe | `XSTOCK_SPOT_SYMBOLS` ReadonlySet (~20-40; bootstrap 20); scanner iterates `Array.from(...)` | `asset-classes.ts:326`, `scanner.ts:501` |
| Cron template | `cron.schedule(expr, cb, {timezone:'UTC'})` + `cronRegistry.register` + `writeFireRow` in finally + `logCronArm` + double-register guard | `xstock-universe-cron.ts` (full) |
| Boot wiring | discovery cron registered at `server/index.ts:94-95`; B-NEW-49 smoke-test+verifier at `:1430/:1434` | `server/index.ts` |
| Existing one-shot | `scripts/b79-0a-qd-probe.ts` = xStock-vs-underlying BASIS via Yahoo, 7 hard-coded, one-shot. KEEP (D10). | `b79-0a-qd-probe.ts` (full) |

---

## 3. D9 RESOLUTION — B75 is PARTITION-ONLY (the tension Langston flagged, now confirmed)

**Finding:** `b75-retention-sweep.ts` is hard-wired to **declaratively-partitioned** tables. `listOldPartitions` (`:140-168`) lists `pg_inherits` children, parses `YYYY_MM` child names, and archives/drops whole monthly partitions via `partition-exporter`. Its `B74_TABLES` inventory (`:71-78`) is all monthly-partitioned. **A plain (non-partitioned) table has no `pg_inherits` children → the sweep silently does nothing for it.**

So Langston's two D9 preferences are in genuine tension: **"fold into B75"** (B75 only sweeps partitioned tables) vs **"lean plain-table"** (he prefers no partition machinery for a sub-1M-row table). You can't have both as-is.

**CC RESOLUTION (recommend) — plain table + a plain-table retention pass added to the SAME B75 sweep script/cron, so B75 remains the single retention owner WITHOUT partitioning a tiny table:**
- Keep `xstock_qd_probe_history` a **plain table** (Langston's robustness-over-complexity preference).
- Add a small `PLAIN_RETENTION_TABLES` list + a second pass in `b75-retention-sweep.ts`: batched `DELETE FROM xstock_qd_probe_history WHERE bucket_start < cutoff` (cutoff = NOW − `hot_retention_days`) + `VACUUM`, exactly mirroring the canonical plain-table TTL pattern (`server/scripts/context-bridge-log-ttl.ts:258-305` — batched delete by age + pause + VACUUM, module_constants-resolved). `hot_retention_days` from `module_constants.data_lifecycle.xstock_qd_probe_history.hot_retention_days` (= 90).
- **No cold-offload.** Unlike the B74 partition tables, this small derived telemetry series is NOT archived to cold storage — after 90 days the rows are deleted (regime drift makes >90-day friction low-value; cold-offloading a tiny derived series is unjustified B-NEW-47 machinery). If >90-day friction history is ever wanted, that is a clean future add.
- **NET:** "single retention owner" honored (one B75 cron/script still owns all retention), "plain table" honored, no novel retention story (reuses the context-bridge-log-ttl delete-by-age pattern).

**Alternative if Langston prefers strict separation:** a dedicated tiny daily cron (separate file) doing the same age-delete. CC recommends the in-B75 pass (option above) — fewer moving parts, one retention cron. **Open for Langston Step-2 ruling (R-D9).**

---

## 4. FINAL TABLE SCHEMA (D5 fire-grid + A1 degenerate columns)

```
xstock_qd_probe_history
  id            bigserial PRIMARY KEY
  symbol        text        NOT NULL
  asset_class   text        NOT NULL   -- always 'xstock_spot' this batch (forward-proof column)
  bucket_start  timestamptz NOT NULL   -- ★D5: the PROBE-FIRE time floored to the cadence grid (NOT captured_at)
  captured_at   timestamptz             -- the real snap timestamp (staleness source); NULL if no snap
  recorded_at   timestamptz NOT NULL DEFAULT now()  -- write time
  bid           numeric(20,8)           -- raw, as read
  ask           numeric(20,8)
  bid_qty       numeric(28,8)
  ask_qty       numeric(28,8)
  mid           numeric(20,8)           -- (bid+ask)/2 when computable
  spread_abs    numeric(20,8)           -- ask-bid when valid
  spread_bps    numeric(12,4)           -- (ask-bid)/mid*1e4 when valid; NULL on degenerate (A1)
  bid_depth_notional numeric(28,8)      -- bid*bid_qty
  ask_depth_notional numeric(28,8)      -- ask*ask_qty
  snap_age_ms   bigint                  -- NOW - captured_at at fire time; NULL if no snap
  stale         boolean     NOT NULL    -- snap_age_ms > freshness_ceiling_ms
  quote_quality text        NOT NULL    -- 'ok' | 'crossed' | 'zero_bid' | 'nonpositive_mid' | 'no_snap' (A1)
  metadata      jsonb       NOT NULL DEFAULT '{"schema_version":1}'
  UNIQUE (symbol, bucket_start)          -- ★D5 dedup; ON CONFLICT DO NOTHING
  INDEX (symbol, bucket_start)           -- range queries
```

**★D5 (the correction Langston most wants reflected):** `bucket_start` = the cron-fire instant floored to the 5-min grid (e.g. `floor(fireTime / 300s) * 300s`), NOT `floor(captured_at)`. `captured_at` stays the real snap time. This gives a regular one-row-per-symbol-per-bucket grid, correct idempotency (a double-armed/overlapping fire in the same bucket dedups), and — during a feed gap where consecutive fires read the same stale snap — an HONEST stale row per bucket instead of one collapsed row.

**A1 degenerate-quote policy (recommend):** always store the raw `bid/ask/qty`; compute `mid/spread_abs/spread_bps/depth` only when valid (`bid>0 ∧ ask>0 ∧ ask≥bid`). On degenerate, leave the derived metrics NULL and set `quote_quality` to the reason (`crossed` if ask<bid, `zero_bid` if bid≤0, `nonpositive_mid` if mid≤0). `no_snap` is used only when a row is written for a skipped symbol — but per D7 we SKIP (no row) on no-snap, so `no_snap` will not normally appear as a written row; kept in the enum for completeness/forward-proofing. Unit-tested per case.

---

## 5. PROBE SERVICE DESIGN

- **Fire:** `*/5 * * * *` (5-min grid), `intervalSeconds: 300`, `{timezone:'UTC'}`. Mirrors `xstock-universe-cron.ts` exactly (register guard, `cronRegistry.register`, `logCronArm`, `writeFireRow` in finally).
- **Per fire:** compute `bucket_start = floorToGrid(fireTime, 300s)`. For each `symbol ∈ XSTOCK_SPOT_SYMBOLS`: read latest `ticker_snap` row; if NO row → skip + increment `symbols_skipped_no_snap`; else compute metrics + `snap_age_ms` + `stale` + `quote_quality`, insert with `ON CONFLICT (symbol,bucket_start) DO NOTHING`. Fail-soft per symbol (one bad symbol never aborts the batch).
- **★D7 refinement (the "ADD" Langston asked for — distinguish weekend from breakage):** the fire-evidence `meta` records `{ market_open, universe_size, rows_written, symbols_skipped_no_snap, symbols_stale }`. `market_open` from `isXstockMarketOpenUTC()` (`xstock_spot/market-hours.ts`, already the weekend-lifecycle predicate). RATIONALE: during the KNOWN weekend shutdown the feed is paused so most symbols are no-snap → without `market_open` context a full-universe skip looks identical to a probe breakage. With it, "skipped because market closed" (expected) is cleanly distinguishable from "skipped during open" (investigate). This honors D7 (stale-but-present → write `stale=true`; no-snap → skip + COUNT) and adds the observability he wanted. We do NOT write 17k known-closed stale rows over a weekend — absence + `market_open=false` IS the honest gap.
- **DB-governed (no hardcoded fallbacks — Kyle pref):** cadence, `hot_retention_days`, `freshness_ceiling_ms` all from `module_constants` (fail-loud if unseeded).
- **★A2:** `freshness_ceiling_ms` seeded ≥ 2× cadence = **600000ms (10 min)** as the starting point (note: aligns with the existing freshness-endpoint "stale" threshold of 600s); seed migration comments the cadence relationship so it isn't set blindly tight.

---

## 6. β (BASIS) ADDENDUM — D2: FINDING ONLY, NO ACTION (per Langston's amendment)

Per D2-amended ("do NOT auto-add basis even if an internal feed exists — surface as a one-line decision"):

> **Finding:** an internal per-symbol underlying-equity quote path DOES exist — `stockService.getQuote(symbol)` via Finnhub (`server/services/stocks.ts`, cached 2 min + retry + fallback). `amr-equity-feed.ts` is VIX/DXY MACRO only (CBOE/FRED/ECB), NOT per-symbol. **Caveat:** the underlying US equity trades RTH-only while xStock is 24/5, so a continuous basis is semantically clean only during the RTH overlap (off-hours it would compare against a stale close). **Decision for Langston:** keep basis OUT of B5c entirely (CC recommend; home a separate RTH-gated basis-capture item if wanted), OR add basis as a nullable, RTH-gated column-set at a lower cadence. **Not acting until you rule (R-D2).**

---

## 7. OPEN DECISIONS FOR LANGSTON STEP-2 REVIEW

- **R-D9:** approve the resolution — plain table + a plain-table age-delete pass added inside the B75 sweep script (single retention owner, no partitioning, no cold-offload), vs a separate dedicated cron. CC recommends in-B75 pass.
- **R-D7:** approve the `market_open`-in-fire-evidence refinement (weekend-vs-breakage distinguishability) + the no-known-weekend-stale-rows behavior.
- **R-A1:** approve the degenerate-quote policy (raw stored always; derived NULL + `quote_quality` reason; skip-no-row on no-snap).
- **R-D2:** rule on basis (OUT entirely vs RTH-gated nullable add) given the Finnhub-exists + RTH-only finding.

---

## 8. STEP-3 CHUNK PLAN (on Step-2 ACK)

- **C1 — migration + schema:** `shared/schema.ts` table def + migration SQL (`CREATE TABLE` + unique + index) + paired rollback + `MANIFEST.txt` (`git add -f`) + seed migration for `module_constants.data_lifecycle.{probe cadence, xstock_qd_probe_history.hot_retention_days=90, freshness_ceiling_ms=600000}`.
- **C2 — pure compute fns** (`spread_bps`/depth/`quote_quality`/`stale`, degenerate-guarded) — PURE + unit-tested.
- **C3 — probe service** (iterate `XSTOCK_SPOT_SYMBOLS`, per-symbol latest snap, ON CONFLICT, fail-soft, fire-evidence meta with `market_open`+counts).
- **C4 — cron registration** (`xstock-qd-probe-cron.ts` mirroring `xstock-universe-cron.ts`) + boot wiring (`server/index.ts` near :95).
- **C5 — retention** (B75 plain-table pass per R-D9).
- **C6 — tests** (A1 degenerate cases, dedup, fire-grid bucket, stale flag, empty-universe, market-closed skip-count, fire-evidence written on success+error).
- **C7 — bench tsc-no-regression + vitest; CI; deploy; live-verify rows + fire-evidence; governance; completion report; close.**
