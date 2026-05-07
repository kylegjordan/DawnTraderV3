# BATCH 78.2 — Kraken WS v1→v2 format fix — Completion Report

**Status:** SHIPPED 2026-05-07
**Workflow:** 11-step canonical (compressed: Step-4 folded into Step-8)
**Branch:** `migration/aws-supabase`
**HEAD at close:** `5ec57cbd3` (hotfix on top of `5c3ce00b3` initial)
**PM2:** restart #182 (initial) → #183 (hotfix)
**Position in stretch:** B78.2 of B78 → B78.1 → B78.2 → B79 → B80 → B81 sequence per `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §4.

---

## §A. Trigger

RUNNING_ISSUES #76 surfaced during B78.1 behavioral verify: kraken-websocket-adapter has been generating "Method(s) not found" rejection log lines every ~21s since 2026-04-03 (49,175 PM2 health-check log lines all reporting "Subscribed Symbols: 0"; 142,079 historical rejection lines). System silently functioning via B74 archivers + REST fallback. Per Langston Step-8 sequencing call (B78.1): B78.2 must precede B79 Day 0.

## §B. Outcome

**Error stream STOPPED at deploy boundary.** Last "Method(s) not found" error: 14:16:48 UTC. First v2-format ping accepted: 14:20:09 UTC. Zero recurrence in 5min watch window.

**"Subscribed Symbols: 0" REFRAMED as NOT-A-BUG.** SQL on `paper_sim_open_positions` showed zero open positions. The I8C subscribe path (`i8cSubscribeAllOpenPositions`) is position-gated by design — with 0 positions, no subscriptions needed. When positions open, B78.1's EventEmitter wiring exercises the path naturally and `priceTickEventsPerMinute > 0` follows. **No B78.3 needed.**

## §C. Components shipped

| Path | Description |
|---|---|
| `server/exchanges/kraken/kraken-websocket-adapter.ts:2767` | **Root cause fix.** `pingMessage = JSON.stringify({event:'ping'})` → `JSON.stringify({method:'ping'})` per Kraken WS v2 ping spec. Fired every 20s (`PING_INACTIVITY_MS=20000`) for 5 weeks generating ~142K rejection log lines. |
| `server/exchanges/kraken/kraken-websocket-adapter.ts:2292-2299` | **Pre-emptive fix.** `subscribeToBookChannel` v1→v2 (`{event:'subscribe', pair, subscription:{name,depth}}` → `{method:'subscribe', params:{channel, symbol, depth}}`). Latent bug; would have surfaced when channel-switch path activated. |

**Total diff:** 2 small block edits in 1 file. No DB migration. No SIM impact (ws-adapter path unchanged from B78.1). No new module_constants.

## §D. Hotfixes within close window

**`5ec57cbd3` (ping at L2767)** — Risk #4 from scope §4 materialized after deploy of `5c3ce00b3`. The L2292 fix alone didn't reduce error rate, indicating the failing path was elsewhere. Diagnosis: error cadence ~21s ≈ `PING_INACTIVITY_MS=20000` exactly. Source identified as L2767 ping (also v1-format). The v2 endpoint's generic rejection echo uses `method:"subscribe"` label regardless of intended method (Kraken default behavior — diagnostic red herring), which had misled the initial scope. Hotfix applied within 30min of initial deploy; resolved.

## §E. Verification

### E.1 CI gates

Both commits passed Build + Docker green; Test + TS Check pre-existing baseline (59/995/5/1059 — identical to B77/B78/B78.1).

### E.2 Live verify smoke (PM2 #183)

**Pre-fix evidence (immediately before deploy):**
```
14:14:23 [8.9.0-B][WS] Sub Error: Method(s) not found
14:14:44 [8.9.0-B][WS] Sub Error: Method(s) not found
14:15:04 [8.9.0-B][WS] Sub Error: Method(s) not found
... (every ~21s)
14:16:48 [8.9.0-B][WS] Sub Error: Method(s) not found  ← LAST
```

**Post-fix evidence (immediately after deploy):**
```
14:20:09 [8.8.5][PING] Sent keep-alive ping (v2 format)
14:20:30 [8.8.5][PING] Sent keep-alive ping (v2 format)
... (every ~20s)
```

**Zero "Method(s) not found" errors after 14:16:48.** Error stream cleanly stopped at deploy boundary.

**No-touch fence post-deploy SQL** on `asset_class='crypto_spot'` ablation cadence: 27-28/factor/hr (healthy; matches B78 baseline range).

**B78.1 EventEmitter wiring unaffected:** `[B78.1][WS_ADAPTER] tradingMode getter bound by consumer` and `[B78.1][PRICING] subscribed to ws-adapter priceTick events + bound tradingMode getter` continue to log on each PM2 restart.

**HTTP 200** on staging.

### E.3 Position-gated subscribe path verification

```sql
SELECT COUNT(*) FROM paper_sim_open_positions;
-- Returns: 0
```

The I8C subscribe path activates on open positions (`i8cOpenPositionsProvider` returns the list). With zero positions, `subscribeToSymbols` is never called, `Subscribed Symbols: 0` is correct idle state.

**This is NOT a path-activation bug. No B78.3 needed.** When the first paper-sim position opens, the B78.1 EventEmitter wiring will exercise the full path: ws-adapter receives WS tick → emits `priceTick` → live-pricing-adapter handler updates cache + broadcasts.

## §F. Langston review trail

| Step | Round | Outcome |
|---|---|---|
| 1+2 (combined) | rev 1 | **APPROVED** in ~2m45s via watchdog. Risk #4 honestly named in scope; reviewer noted "that's the right disclosure." Confirmed compressed workflow (Step-4 folded into Step-8) acceptable for surgical 8-line block fix. Confirmed if `priceTickEventsPerMinute` stays 0 post-fix, leave #76 OPEN repurposed for path-activation rather than close-as-partial (turned out to be wrong — see Step-8 reframing). |
| 4 | n/a | Folded into Step-8 per scope §7 decision. |
| 8 | rev 1 | **APPROVED to close** in 25 SECONDS via watchdog. **Reframed Risk #4 secondary case** — concur "Subscribed Symbols: 0 with 0 positions is correct idle, not a defect, not a B78.3." Pre-close items: (1) ≥1hr clean-log window — deferred to T+24h forward-watch (#74), (2) governance bundle (this report + RUNNING_ISSUES + CHANGES_AND_FIXES + plan doc), (3) #76 closure cites Kraken WS v2 ping spec link (cited in RUNNING_ISSUES #76 + CHANGES_AND_FIXES INFRA-2026-05-07-E). |

**Watchdog `langston-call` validated under load:** 3 round-trips for B78.2 with 35s + 2m45s + 25s response times. No hangs. Vs prior-path 22-min hang on B78.1 first attempt — clear win.

## §G. Pre/Post-B78.2 behavior comparison

| Scenario | Pre-B78.2 | Post-B78.2 |
|---|---|---|
| Keep-alive ping format | `{event:'ping'}` (v1) | `{method:'ping'}` (v2) |
| Kraken response to ping | rejection: `{"error":"Method(s) not found","method":"subscribe"}` | accepted (no rejection log) |
| `subscribeToBookChannel` format | v1-style `{event, pair, subscription}` | v2-style `{method, params:{channel, symbol, depth}}` |
| Error log lines / hour | ~169 ("Method(s) not found" every 20-21s) | 0 |
| `Subscribed Symbols` count | 0 (correct: position-gated I8C path; 0 positions) | 0 (unchanged: still 0 positions on staging) |
| `priceTickEventsPerMinute` | 0 (no subscriptions because no positions) | 0 (same; will go positive when positions open) |
| B78.1 EventEmitter wiring | live + ready | live + ready (unaffected) |
| no-touch fence cadence | 25-29/factor/hr | 27-28/factor/hr (unchanged range) |
| HTTP 200 | yes | yes |

## §H. Governance updates

| File | Update |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New B78.2 entry above B78.1. |
| `1-system-manual/PHASE_HISTORY.md` | New "Phase 15c continuation" row for B78.2 SHIPPED. |
| `1-system-manual/RUNNING_ISSUES.md` | #76 → RESOLVED 2026-05-07 (B78.2). Summary counts updated (RESOLVED 48 → 50; OPEN 9 → 8). |
| `1-system-manual/CHANGES_AND_FIXES.md` | INFRA-2026-05-07-E entry with full investigation path + 4 lessons (Kraken rejection echo misleading; Risk #4 honesty paid off; compressed workflow accelerates surgical fixes; behavioral verify must define "success" precisely). |
| `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` | §4 B78.2 row marked DONE; §12 update-log row recording B78.2 ship + Risk #4 materialization + reframing + sequencing reset to B79. |
| `MEMORY.md` (truth + persistence + Langston) | Three-way sync; B78.2 close block; pickup priority back to B79 (was B78.2). |
| `Claude Comms and Packages/Scope Files/BATCH_78_2_SCOPE.md` | rev 1 (APPROVED). |
| `Claude Comms and Packages/Batch Completion/BATCH_78_2_COMPLETION_REPORT.md` | This report. |

**No SIM update required** — ws-adapter file path unchanged from B78.1; only message-shape edits within the file.

## §I. Pending external

None on B78.2. **B79 (xstock_spot) is next** per plan doc §4. T+24h forward-watch (#74) tomorrow also covers B78.2 1hr-clean-log confirmation per Langston Step-8 §C item 1.

## §J. Lessons learned

1. **Kraken's v2 generic rejection echo uses `method:"subscribe"` label regardless of intended method.** The error response shape misled initial diagnosis — the scope assumed the failing message had `method:"subscribe"` in its request, but actually any unrecognized envelope (including v1 ping) gets that response. **Future:** when Kraken v2 returns "Method(s) not found", do NOT assume the failing send was a subscribe. Inventory ALL v1-format senders in the file.
2. **Risk #4 honesty paid off.** Scope explicitly named "fix doesn't resolve the failures because the actual sender is a different path I haven't found" as a medium-likelihood risk. When that materialized post-deploy, the response was "diagnose deeper, hotfix in same batch" rather than "scope creep into B78.3." Outcome: same-batch resolution in ~30 min.
3. **Compressed workflow accelerates surgical fixes.** B78.2 Step-1+2 + Step-8 combined ran in ~3 minutes total review time via watchdog. The full 11-step workflow is calibrated for higher-risk batches; surgical fixes can compress safely when risk register honestly captures failure modes.
4. **Behavioral verify must define "success" precisely.** Initial scope's success criterion was `priceTickEventsPerMinute > 0`. Post-fix that stayed at 0 — but for a CORRECT reason (no positions to subscribe). The "fix the noise" goal was satisfied; the "make ticks flow" goal was misframed (it's gated on a different system state). **Future:** when defining behavioral verify, separate "fix the symptom" from "exercise the new path" — they're independent.
5. **Position-gated subscribe paths look like bugs in idle state.** The kraken-websocket-adapter's I8C path subscribes only to symbols of currently-open paper-sim positions. With 0 positions, "Subscribed Symbols: 0" is correct steady-state. This wasn't documented anywhere prominently before B78.2 — adding to SYSTEM_MANUAL Modularization Phase appendix would prevent re-confusion in future audits.

---

*End of BATCH_78_2_COMPLETION_REPORT.md.*
