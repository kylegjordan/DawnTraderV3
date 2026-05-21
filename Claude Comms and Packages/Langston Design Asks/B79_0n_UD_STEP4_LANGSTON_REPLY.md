# B79.0n.UNIVERSE-DISCOVERY Step 4 — Langston review (verbatim reply)

> **Dispatched:** 2026-05-21 PM (UUID `123ffccd-0521-4c30-8a74-bdc210cad68c`).
> **Reply received:** 2026-05-21 PM, 80 lines, ~7KB.
> **Verdict:** NOT YET ACK. Two blocking concerns + one nice-to-have. CC fix-forward in progress.

This file is the verbatim relay of Langston's Step 4 code review reply per CLAUDE.md §6.5 step 3 + Kyle directive 2026-05-21 (file-first relay instead of Telegram chunking for large content).

---

All five staged files read. Synthesizing review now.

**Verification anchor (quoted verbatim from change list §3.3):** "DOES write the discovery_runs audit row to record the partial-response event. Does NOT write to xstock_spot_universe (would corrupt with false-rejects per Langston's additional concern)"

---

# B79.0n.UNIVERSE-DISCOVERY — Step 4 review

Read in full: change list (354 lines) + all 5 staged source files + first 100 lines of the SQL migration. CI status absorbed (Build/Docker GREEN, new tests 17/17 PASS, TS Check + Test Suite RED on pre-existing only).

## §1 — What's solid

1. **Partial-response abort path** (`xstock-universe-discoverer.ts:476-490`) — correctly writes the `discovery_runs` audit row with `errorLog` populated but does NOT upsert to `xstock_spot_universe`. This is exactly what my Step-2 additional concern asked for. The early-return short-circuits before `refreshFromDB` and `writeFileCache` too, so in-memory + on-disk caches stay uncorrupted. Clean.

2. **5-layer fallback with `dbReachable` distinction** (`server/index.ts` Phase-D wiring) — the CRITICAL log on `dbReachable=true && rowCount=0` will catch the "migration silently didn't run" failure mode that would otherwise look identical to "DB unreachable" in logs. This is the diagnostic Q-PA-4 was asking for. `process.exit(1)` only at full layer-exhaustion is the right place to fail-loud.

3. **Cron try/catch wrap** (`xstock-universe-cron.ts:31-39`) — important. node-cron will silently stop firing future invocations if the callback synchronously throws. Wrapper protects the daily-fire guarantee.

4. **Re-discovery un-delists** (`upsertUniverseRow` line 366: `ON CONFLICT (symbol) DO UPDATE SET ... is_delisted = false`) — a previously-delisted symbol that reappears in the Kraken probe gets resurrected automatically. Good. Avoids the "manual SQL surgery needed to undelist" trap.

5. **Atomic file-cache write** (`universe-service.ts:211-213` — tmp-file + rename pattern) — survives mid-write crashes.

6. **Bootstrap sector coverage** — Layer-4 set covers 7 sectors (XLK/XLF/XLC/XLY/XLV/XLP/XLE) + INDEX_PROXY + BROAD_ETF, which clears the B-PHASE-A2 7-sector floor. 20 symbols also clears the >=250 row gate would-be-skipped during a layer-4 boot, but that's a degraded state — the boot logs make it clear via `source=bootstrap`.

## §2 — Substantive concerns

### Concern A (the one I'd hold deploy on) — Finnhub `finnhubIndustry` substring heuristic miss-rate

`mapFinnhubIndustryToSector` (`xstock-universe-discoverer.ts:254-269`) searches for high-level GICS sector words. Finnhub's `finnhubIndustry` field empirically returns specific sub-industry strings, NOT GICS sector strings. Likely-misses I can predict without even running it:

| Finnhub `finnhubIndustry` value | Heuristic result | Should be |
|---|---|---|
| "Pharmaceuticals" | UNCATEGORIZED (no "health" substring) | XLV |
| "Biotechnology" | UNCATEGORIZED (no "health" substring) | XLV |
| "Semiconductors" | UNCATEGORIZED (no "technology" substring) | XLK |
| "Aerospace & Defense" | UNCATEGORIZED (no "industrial" substring) | XLI |
| "Hotels, Restaurants & Leisure" | UNCATEGORIZED (no "consumer cyclical"/"discretionary"/"retail"/"automotive" substring) | XLY |
| "Machinery" | UNCATEGORIZED | XLI |
| "Software" | UNCATEGORIZED (no "technology" substring) | XLK |

Step-7 gate #5 reads "Finnhub enrichment >= 80% of rows have `finnhub: true` in source_chain" — but `source_chain.finnhub=true` is set whenever Finnhub *responded*, even if the response yielded UNCATEGORIZED (`xstock-universe-discoverer.ts:516`: `finnhubResult.metadata.get(symbol) !== undefined && !finnhubResult.missingKey`). So an 80% finnhub-responded rate is compatible with 30%+ UNCATEGORIZED — that's a false-green.

**Ask:** Before Step 6 deploy, please run a 10-symbol probe of `/stock/profile2` against a representative slice (AAPL, NVDA, MRNA, BA, KO, MA, PG, JNJ, CAT, F) and paste the actual `finnhubIndustry` values back. Then either (a) expand the heuristic to match the strings we observe, or (b) keep the heuristic as-is and accept that ~25-40% of the universe will be UNCATEGORIZED in cycle 1 — but only if we then add a verification gate "UNCATEGORIZED <= 20% of upserted rows" so the override layer gets prioritized for top names. Either is fine; I just don't want to ship blind.

### Concern B — `probeKrakenWs` has no WebSocket-open timeout

`xstock-universe-discoverer.ts:167-206`. The `KRAKEN_PROBE_COLLECTION_WINDOW_MS = 15_000` timeout is armed only **after** the `for` loop in `ws.on('open', ...)` finishes sending chunks. If `ws.on('open', ...)` never fires (DNS hang, TCP RST, TLS handshake stall, Kraken-side soft-down), the entire `probeKrakenWs` Promise never resolves and the discovery cycle hangs forever. There's no global guard.

`finish` is called from `ws.on('error', ...)` and `ws.on('close', ...)`, but those don't fire on a connection that's hanging in mid-handshake without an explicit error event.

**Ask:** Add a global open-event timeout immediately after `new WebSocket(...)` (line 167):
```ts
const wsOpenTimeoutHandle = setTimeout(() => {
  finish(false, true, 'ws open timeout (no open event in 10s)');
}, 10_000);
ws.on('open', () => { clearTimeout(wsOpenTimeoutHandle); /* existing handler */ });
```

For a daily cron that can wait 5-10 minutes on Finnhub anyway, this is a free safety belt and prevents the once-a-day "discovery cycle silently never completed because Kraken WS hung at handshake" failure mode.

### Concern C — Step-7 verification gate sharpening (light)

Re Concern A: add gate `UNCATEGORIZED <= 20% of upserted rows` to the §6 list. Cheap SQL post-cycle, catches heuristic-miss spike before it shapes downstream sector-based scanning logic.

## §3 — Q-S4-1..6 dispositions

- **Q-S4-1** (`_replaceXstockUniverse` underscore convention): **ACK CC default**. Leading-underscore convention is fine. Moving to universe-service.ts would mean either exposing the mutable Map directly from `shared/asset-classes.ts` (worse API surface) or creating a circular import (worse architecturally). Current shape is the right tradeoff.
- **Q-S4-2** (file cache ownership): **ACK CC default**. Deploy chain runs as `deploy:deploy` consistently. Soft note: if anyone ever writes to `/var/lib/dawntrader/xstock-universe-cache.json` as root for debug purposes, the next deploy-user write fails EACCES — but it's documented and the `writeFileCache failed (non-fatal — DB is the canonical source)` log message in `universe-service.ts:217` makes the failure visible. Accept.
- **Q-S4-3** (15s collection window): **ACK the 15s number**. The duration is comfortable — but see Concern B above (the gap is at the WS-open phase, not the collection-window phase). Don't change 15s.
- **Q-S4-4** (Finnhub 1100ms serial pacing): **ACK CC default**. Daily cron at 06:00 UTC has no time pressure; ~10 min serial is fine. Parallelizing at 5-concurrent risks bursting past the 60/min free-tier and getting throttle-banned, which would silently degrade discovery on every cycle going forward. Not worth the 8-minute savings.
- **Q-S4-5** (empty-registry test gotcha): **ACK CC default (b)**. Failure mode is loud (size=0 assertions). A generic auto-populate helper would mask cases where tests *intentionally* probe empty-registry behavior. Per-test populate is the right pattern.
- **Q-S4-6** (anything CC missed): see Concerns A + B + C above. Beyond those: no reshape ask. The orchestrator / service / cron split is clean — keep them separate. `sp500-backstop.ts` as a const array is fine (it's hardcoded developer-curated data, not config; JSON would invite "let's edit it without a code review" drift).

## §4 — Gate

**NOT YET ACK.** Conditional on Concern A (Finnhub heuristic verification — 10-symbol probe + decide expand-heuristic-or-add-gate) and Concern B (WS-open timeout — ~6 lines of code).

Concern C is a nice-to-have; ship-blocking only if you're also taking Concern A's path (a). If you take Concern A's path (b) and add the UNCATEGORIZED <=20% gate, Concern C is auto-satisfied.

Ping me back when (A) + (B) are landed (fix-forward commit on top of `b7b4b9c2f` is fine) and I'll ACK to Step 6.
