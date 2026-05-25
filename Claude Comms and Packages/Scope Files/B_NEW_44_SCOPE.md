# B-NEW-44 — xStock equity-spot archiver WebSocket diagnostic observability

> **From:** Claude Code
> **To:** Langston (Step-1 + Step-4 review) + Kyle (decider)
> **Date:** 2026-05-25
> **Status:** 1-chunk ship. Kyle approved 2026-05-25. Langston ACK'd the shape in `B_NEW_36_XSTOCK_OHLC_DIAGNOSTIC_2026-05-25.md`. Step-4 dispatch in flight.
> **Type:** Diagnostic-only observability add. No behavioral change. No routing change.

---

## §0 — Why this exists

On 2026-05-25 ~13:50 UTC the xStock spot ohlc-1m table was found to have zero new rows since 2026-05-22 23:59 UTC (Friday pre-shutdown). The WebSocket connection was alive and the ticker channel was producing rows normally on the same socket — ohlc channel specifically was silent. Root cause was not identifiable because `equity-spot-archiver.ts`'s `handleMessage` silently dropped any non-data messages, including Kraken's subscribe acknowledgements and any error responses. This batch adds rate-limited diagnostic logging for those previously-invisible messages so the next investigation has actual evidence to work from.

Reference: `Claude Comms and Packages/Langston Design Asks/B_NEW_36_XSTOCK_OHLC_DIAGNOSTIC_2026-05-25.md`.

---

## §1 — Scope (atomic, 1-chunk)

### Code change

`server/services/passive-archive/equity-spot-archiver.ts`:
- ADD `DIAG_NON_DATA_LOG_INTERVAL_MS` constant + `seenNonDataKeys` Map.
- ADD `classifyNonDataKey(msg)` — classifies non-data messages by `method:` > `error:` > `channel:` > `other`.
- ADD `logDiagNonDataMessage(msg)` — rate-limited (60s/key) logger with 800-char payload truncation and unserializable-input safety.
- ADD `_resetDiagNonDataState()` test-only export.
- ADD `_logDiagNonDataMessageForTests` test-only export.
- MODIFY `handleMessage` — add `else { logDiagNonDataMessage(msg); }` after the existing `ohlc` / `ticker` branches.

### Tests

`server/tests/unit/b-new-44-equity-spot-diag.test.ts` — NEW. Six tests, all PASS local (12ms):
1. First-occurrence logging with correct key prefix
2. Rate-limit suppression within window
3. Re-log after window elapses
4. Key differentiation across `method` / `error` / `channel` / `other`
5. Payload truncation >800 chars
6. Unserializable-input safety

---

## §2 — Acceptance criteria

- CI all 4 jobs (TypeScript Check, Test Suite, Build, Docker Build) GREEN on the head commit.
- Post-deploy: PM2 logs show `[B74][equity-spot][DIAG] non-data message (key=…)` entries within ~1 second of fresh WS subscribe.
- Subscribe-ack from Kraken visible in logs with `key=method:subscribe` (or whatever Kraken's actual response shape uses).
- No regression on ohlc/ticker data routing — daily row counts for xstock_spot_ticker_snap continue at expected ~485/cycle rate.

---

## §3 — Verification plan (post-deploy)

1. SSH staging + PM2 restart.
2. Within 60 seconds: `pm2 logs dawntrader --lines 200 | grep '\[B74\]\[equity-spot\]\[DIAG\]'` — expect at least one entry naming the subscribe-ack response.
3. Capture the actual subscribe-ack payload + any error/status messages from Kraken.
4. Return with the actual root cause confirmed: subscribe accepted-with-warning? rejected? accepted-clean-but-silent? Document in completion report.
5. Based on that evidence, scope the actual fix (sharding, universe-cleanup, or escalation to Kraken).

---

## §4 — SIM impact

- `equity-spot-archiver.ts` — gains diagnostic-only logging surface; no behavioral change to upstream/downstream consumers. Blast radius: LOW.
- No new tables, no migrations, no module_constants changes, no governance retro.
- Test file added under existing `server/tests/unit/` convention. CI consumes via existing vitest discovery.

---

## §5 — Out of scope (deliberately)

- Sharding the xStock spot WS subscription. Deferred to a separate batch (likely B-NEW-45) once the diagnostic confirms whether the cap-at-N hypothesis is the actual root cause, and at what N.
- Adding subscribe-response logging to the perp archiver or crypto archiver. Deferred until xStock spot diagnostic confirms a class of bug worth checking elsewhere.
- The broader B-NEW-36 weekend-archiver stop/start lifecycle wiring. Separate concern, separate batch, separate Kyle directive.

---

## §6 — Governance

Tier 1 (mandatory):
- BATCH_CATALOG entry added at Step 11.
- PHASE_HISTORY update at Step 11 (Phase 24 follow-on or stand-alone).
- MEMORY.md update at Step 11 (mark closed, capture root cause discovered, link follow-up).
- This scope file + completion report.

Tier 2 (when applicable):
- CHANGES_AND_FIXES entry at Step 11 (BUG-2026-05-25-X) — only if the diagnostic surfaces an actual root cause worth registering. Otherwise the completion report alone documents.

— Claude Code, 2026-05-25
