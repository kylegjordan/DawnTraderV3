# B-BOOK-CHECKSUM-CIRCUIT-BREAKER — STEP 4 CHANGE LIST (`#1220`)

**GRADE AT:** code commit `cdf74ab5d74ac22d786dffbe27371c83d06421fd` on `origin/migration/aws-supabase` (this file lands one commit above it; it changes no code).
**Pre-sprint item 1** of Kyle's list, re-ordered and locked 2026-10-20 evening (`e400fed12`; `SPRINT_TO_LIVE_PLAN.md` §0a, CC-B row).

## Dispatch header (`workflow-04` fields i–iii)

| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (scope header, `Scope Files/B_BOOK_CHECKSUM_CIRCUIT_BREAKER_SCOPE.md:3`) |
| ii | **THE CLASS'S DOC SET** | SCOPE — **present** `Claude Comms and Packages/Scope Files/B_BOOK_CHECKSUM_CIRCUIT_BREAKER_SCOPE.md` · PRE_AUDIT — **present** `Claude Comms and Packages/Scope Files/B_BOOK_CHECKSUM_CIRCUIT_BREAKER_PRE_AUDIT.md` · COMPLETION_REPORT — **absent** (Step 11) · BATCH_CATALOG — **absent** (Step 10) · PHASE_HISTORY — **absent** (Step 10) · SYSTEM_MANUAL — **absent** (Step 10; the §8 / §18.0.1 text items `:8726`, `:8804`, `:8806` land there) · SYSTEM_IMPACT_MAP — **absent** (Step 10; §2.1 + a cross-cutting row + the `:379` line) · DELETED_COMPONENTS_LOG — **present** (entry dated 2026-10-20, landed in `cdf74ab5d`) |
| iii | **STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_BOOK_CHECKSUM_CIRCUIT_BREAKER_PRE_AUDIT.md` at `a70f8fb1e` — your **STEP 2: APPROVED** at `11ac8817` (inbox 30915), both document conditions applied at `a70f8fb1e` |

**Every claim below cites a line at `cdf74ab5d`.** Mechanism claims in this file are **NOT RE-READ** by a fresh reader — you are the second pass, and the code is the object.

---

## 1. Plan 1 — one socket at a time (`kraken-websocket-adapter.ts`)

**AFTER, `connect()` `:638-675`:**
```ts
const prev = this.ws;
if (prev && (prev.readyState === WebSocket.CONNECTING || prev.readyState === WebSocket.OPEN)) {
  console.log(`[#1220][CONNECT_REFUSED] ...`); return;
}
if (prev) {
  prev.removeAllListeners();
  prev.on('error', () => {});
  try { prev.terminate(); } catch { /* already closed */ }
}
this.isConnecting = true;
this.cleanup();
const sock = new WebSocket(this.WS_URL, { handshakeTimeout: this.HANDSHAKE_TIMEOUT_MS }); // 15_000
this.ws = sock;
sock.on('open',    () => { if (this.ws !== sock) return; this.handleOpen(); });
sock.on('message', (d) => { if (this.ws !== sock) return; this.handleMessage(d); });
sock.on('close',   (c, r) => { if (this.ws !== sock) return; this.handleClose(c, r.toString()); });
sock.on('error',   (e) => { if (this.ws !== sock) return; this.handleError(e); });
sock.on('pong',    () => { if (this.ws !== sock) return; this.handlePong(); });
```
**BEFORE:** `if (this.isConnecting) return;` then `this.ws = new WebSocket(this.WS_URL)` with five unguarded listeners and no teardown of the previous socket.
- The refusal is first, ahead of `cleanup()`, so a refused call cannot clear the live socket's heartbeat timer.
- `handleOpen` `:696`: `this.reconnectRetries = 0;` beside `reconnectAttempts = 0` (record item (e)).
- `reconnectWithBackoff` and `softResubscribeAll` no longer zero `isConnecting` (r4 B3).
- `stop()` is unchanged: it nulls `this.ws`, and the closure guard then drops every event the old socket emits (test 22).

## 2. Plan 2 — the breaker

**The gate, `handleV2BookUpdate` `:1245-1250`:**
```ts
const _trust = this.bookTrust.get(internalSymbol);
if (_trust && _trust.state !== 'trusted' && (!isSnapshot || (_trust.state === 'untrusted' && !_trust.recheck))) {
  bump(this.bookFramesIgnoredUntrusted);
  continue;
}
```
**The checksum arm, `:1287-1313`** (crossed detector now above it, `:1278-1283`, plan 5):
```ts
if (ours === update.checksum) {
  bump(this.bookChecksumMatches); _verified = true;
  if (_trust && _trust.state !== 'trusted') this.restoreBookTrust(internalSymbol, ours);
} else {
  bump(this.bookChecksumMismatches);
  this.onBookChecksumMismatch(internalSymbol, ours, update.checksum, depth);
  continue;
}
...
if (_trust && _trust.state !== 'trusted' && !_verified) continue;   // only a verified match restores
```
**BEFORE:** the mismatch arm was `void this.softResubscribe(internalSymbol); continue;`, which deleted the book and resubscribed both channels — the 10-13 loop.

**The machine, `:3865-4080`:**
- `onBookChecksumMismatch` `:3865` — untrusted (only its re-check snapshot reaches here) ⇒ re-check failed, cancel the book again. Trusted ⇒ if within 60 s of `lastRestoreMs`, confirm (`second_desync_within_60s_of_restore`), else `suspect` + a new episode + `requestBookResync('unsub_then_sub')`. Suspect (only a snapshot reaches here) ⇒ clear the in-flight entry; the first time, `rereadPrecisionAndJudge`; otherwise confirm.
- `rereadPrecisionAndJudge` `:3919` — re-verifies the HELD snapshot (deltas are dropped while suspect, so `bookRaw` is still that snapshot) at the REST precision. It adopts the venue's precision only if the precision DIFFERS **and** makes the snapshot match, then sends ONE more resync. Otherwise it confirms (`snapshot_mismatch_at_reread_precision` / `precision_reread_unavailable`).
- `requestBookResync` `:3944` — one in-flight entry per symbol holding a 30 s timeout; with the socket not OPEN it sends nothing and clears nothing; `unsub_then_sub` cancels the book, then subscribes after 500 ms only if `this.ws` is still the same OPEN socket.
- `onBookResyncTimeout` `:3973` — on a live socket a suspect is confirmed (`resync_no_snapshot_within_30s`) and a re-check is abandoned; on a dead socket nothing is judged.
- `handleClose` `:1585-1592` clears every in-flight timer and every re-check flag; `handleOpen` `:739-742` re-requests every suspect, subscribe only.
- `confirmBookUntrusted` `:3996` — cancels the book channel, counts, logs `[#1220][BOOK_UNTRUSTED]`, raises `book_untrusted:<symbol>:<episode ISO>`, `breakage`/`warning`, metadata with both CRCs, the precision, the counts and the state.
- `restoreBookTrust` `:4030` — restoring from `untrusted` (only a re-check can) resolves that episode's alert through `resolveAlertsByDedupeKey` with the re-check's actor, evidence `#1220 book-recheck snapshot match <symbol> crc=<n>`, transport `engine`.

## 3. Plan 3 — the doors
- `subscribeToSymbols` `:1720-1735` — the book subscribe goes through the new `sendBookSubscribe` (`:1837`, tagged `req_id`, depth `BOOK_SUBSCRIBE_DEPTH`) for trusted symbols only; the ticker list is unchanged.
- `switchToBookChannel` `:2997-3001` — refused for a non-trusted symbol.
- `getBookForFill` `:3704` — `if (!this.isBookTrusted(symbol)) return null;` (the r4 B4 dependency, same commit).
- `touch-price.ts` `:84`, `:90`, `:121`, `:131-132`, `:150-151` — `bookTrusted` is a REQUIRED declaration; a non-trusted book refuses `book_untrusted`; **the ticker rung refuses `producer === 'ws_book'`** with `tickerRefusal: 'book_untrusted'`; `recordTouchSelection` `:272` maps the new verdict.
- `level-basis.ts` `:370`, `:404`, `:466`, `:477`, `:572` — the new value in `FunnelRefusal`, `TickerAcceptBookVerdict`, both zeroed cells, and `LADDER_REASON_NAME` → `ticker_from_untrusted_book` (new `LadderRefusal` member).
- The four call sites: `crypto-touch.ts:246` (via the new required `CryptoTouchReaders.isBookTrusted`, wired in `crypto-touch-readers.ts`), `active-execution-engine.ts:2986`, `signal-orchestrator.ts:2714`, `vts-runner.ts:1806`.
- `getLatestPriceData` now returns `trust`; the integrity monitor skips a non-trusted book.

## 4. Plans 4-9 (brief)
- **Route** `routes.ts` (after the book-integrity route; handler at `:13284`): `POST /api/active-engine/book-recheck/:symbol`, body `{by}` normalised through `normaliseAlertActor` (400 otherwise), `202` accepted / `409` refused with the reason.
- **Precision bound** `:1162` (0-18 on both fields, refused + counted); `readAssetPairsPrecision` `:277-288` uses the same bound on the REST answer. *(Record item, Langston r3: those lines are at `cdf74ab5d`; at the approved `5c5abef81` the reader is `:316-322` — `async function readAssetPairsPrecision(internalSymbol: string)` — and the bound is applied at `:300` inside `fetchAssetPairsPrecisionSnapshot`.)*
- **Counters** `getBookIntegrityCounters` — per-symbol and totals for the six new counters, `skippedNoPrecision` now published, `trust` per symbol and a trust tally; the docblock and the `note` corrected.
- **Rule 18** — DELETED_COMPONENTS_LOG entry 2026-10-20 + three verbatim archives in `1-system-manual/_archive/deleted-code/`.
- **Instrument subscribe** `:711`, once per open; gone from `subscribeToSymbols`.

## 5. Tests
- **New** `server/tests/unit/b-book-checksum-circuit-breaker.test.ts`, 32 tests, every negative with its twin: the wipe loop (socket down: held, nothing sent; resync in flight: exactly one); the emit stops; restore; confirm after one re-read (alert key shape asserted); precision corrected ⇒ adopt + one fresh snapshot; re-desync inside / outside 60 s; resync timeout on a live vs a closed socket; rejected unsubscribe counted, not retried; rejected subscribe attributed by `req_id`; the doors (subscribe, channel switch, `getBookForFill`, `getLatestPriceData`); precision bound; the depth pin; the re-check (restore + resolve, and the failing twin); trust surviving `stop()` and `softResubscribeAll`; both reader refusals; one socket with a mocked `ws` (CONNECTING refused + `handshakeTimeout`, CLOSING detached-then-terminated, no reconnect from the terminated socket, an orphan's message/pong/close moving nothing, the current socket's message moving both clocks, two schedulers ⇒ one socket, both counters reset on open + instrument sent).
- **Re-pointed:** `b-price-side-p7b-book-unsubscribe` tests 3, 4, 8 now drive the breaker's resync via a real mismatching frame (test 4 adds: no ticker unsubscribe). `b507` ARMED now asserts `suspect`, the book held, `getBookForFill` null.
- **Fixtures** declaring trust: `b-rest-sides-to-cache-inc2` (test 15 now carries a `book_untrusted` walk), `obj8c`, `p7d`, `b-class-leg-fill-mode`, `8a-p3`, `b-rtb-retirement-ask`.
- `tsc` baseline 329 = 329. Locally the full suite is 366/377 files and 4,504 tests passing; the 10 failing files are DB-dependent (`ECONNREFUSED`) or the local `.mjs` SyntaxError, and none imports a changed file. **CI is the gate; not yet read.**

## 6. ATTACK THESE — the judgement calls not spelled out in the approved plan
1. **The 30 s no-snapshot timeout confirms a suspect book untrusted** on a live socket. The plan named no rule for a resync that is never answered; without one a suspect could sit forever (held and refused). Is "confirm" right, or should it retry once?
2. **A failed REST precision re-read confirms** (`precision_reread_unavailable`). The alternative was to judge at the unchanged precision — which also confirms, so the outcome is the same but the recorded reason differs. Acceptable?
3. **The re-check route writes the REST precision unconditionally** before its subscribe (the plan's literal "re-reads AssetPairs precision, then sends one book subscribe"). If REST and the instrument channel ever disagree for a pair, a failing re-check leaves the REST value in place. The symbol is untrusted either way. Should a failed re-check restore the previous precision?
4. **The first mismatching delta IS applied** to the held book: the frame is applied, truncated and checked, and only then refused. Everything after it is dropped. Readers refuse the book from that instant, so nothing prices from it. Do you want the apply moved behind the check, which would mean computing the CRC on a copy?
5. **Two readers the pre-audit's census did not list, both now gated:** the book/ticker disagreement probe in the ticker handler (`:1071`, record-only) and the integrity monitor's comparison (log-only). I found them by a census of every `orderBooks`/`bookRaw`/`bookUpdatedAt` read in the adapter. **This item was UNAUDITED at Step 2.**
6. **Trust is keyed by the internal symbol** from `mapKrakenPairToInternalSymbol` in the handler, and by `normalizeToInternalSymbol` in `subscribeToSymbols` and the route. If those two ever disagree for a pair, the subscribe filter would miss a non-trusted book. I did not prove they agree for every pair.

## 7. Not in this commit (Step 10)
System Manual §8 / §18.0.1 text items, the SIM §2.1 entry + cross-cutting row + the `:379` line, `BATCH_CATALOG`, `PHASE_HISTORY`, `#1220` annotation, the plan line, memory.
