# B-ARCHIVE-NETWORK-RETRY — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · owner CC-A · scope `Scope Files/B_ARCHIVE_NETWORK_RETRY_SCOPE.md` r2 (`a4dbcb300`, Langston APPROVED r1 with C1-C7 folded) · graded ref for this audit: `origin/migration/aws-supabase` at the commit carrying this file.

## PREVIOUSLY STATED → NOW (read first)
- **PREVIOUSLY STATED:** "a refused connect fails in ~40 ms at the first chunk" (scope r1). **NOW:** over the bar writer's 1,398 refused `flush failure after N ms` lines (856 PERMANENT + 542 xStock `ADMISSION UNCONFIRMED`): median 30 ms, p90 7,897 ms, max 14,670 ms; PERMANENT only (n=856): median 53, p90 7,364, max 14,670. **REASON:** measured at C6, label corrected by Langston (A5).
- **PREVIOUSLY STATED:** the shed alert's body "names … the measured minutes of cover" (scope OBJ-2). **NOW:** the body names the class, rows shed, cap, buffer length and whether the class can be re-fetched, and POINTS to the System Impact Map entry that carries the measured cover. **REASON:** a measured rate written into code goes stale silently; the rule for always-read text is to name WHERE a live value is read, not WHAT it is (A6).
- **PREVIOUSLY STATED:** no memory figure (scope r2 asked for one). **NOW:** ~609 B per buffered ticker row and ~550 B per bar row on staging's Node v20.20.0; one full buffer ≈ 29 MB (ticker) / 26 MB (bars); all eight full ≈ 221 MB; a 60-minute in-session `ticker:xstock_spot` hold (336,867 rows) ≈ 196 MB. **REASON:** OBJ-3 (A4).

## THE AUDIT

### A1 — the code, read at the ref (source 1)
- `isTransientWriteError` (`server/services/passive-archive/ohlc-batch-writer.ts:97-114`) reads ONLY `err.message` (lower-cased): a statement-timeout guard returns permanent first (`:105`), then substring arms for `deadlock`, `pool slot timeout`, `timeout exceeded when trying to connect`, `connection terminated`, `connection reset`, `econnreset`, `etimedout`, `too many clients`. Anything else is PERMANENT (the deliberate default, `:92-95`).
- Callers (census, A7): the bar writer's catch (`:667`, after the xStock admission/projection branches) and the ticker writer's catch (`ticker-batch-writer.ts:163`).
- Shed paths: bars `:699-717` (`xstock_spot` preserves and raises its fail-stop alert; the other three splice the oldest and write stderr only); ticker `:171-181` (all four classes splice the oldest, stderr only). The ticker writer splices the WHOLE buffer before its insert (`:125`) and `unshift`s it back on a transient failure (`:171`) — the `#1032` shape (out of scope).
- The alert shape to copy: `alertPermanentWriteFailure` (`:262-325`) — latch keyed `writer:class` (`_permanentAlerted`), claimed BEFORE the raise, released if the raise throws, expiring at `ALERT_RE_ARM_MS` (6 h, `:118`), cleared by `clearPermanentAlertLatch` on a successful flush (bars `:660`, ticker `:146`); `category: 'breakage'`, `severity: 'critical'`, `dedupe_key: ${writer}-writer-permanent-${class}`.

### A2 — what the error ACTUALLY looks like (sources 1+2): a message-only test misses the multi-address shape
Measured on staging's Node v20.20.0 with `net.connect({ autoSelectFamily: true })` to a closed port:
| host | `name` | `code` | `message` | inner `errors[]` |
|---|---|---|---|---|
| `localhost` (two addresses) | `AggregateError` | `ECONNREFUSED` | **`""` (empty)** | `ECONNREFUSED: connect ECONNREFUSED ::1:1`, `…127.0.0.1:1` |
| `127.0.0.1` | `Error` | `ECONNREFUSED` | `connect ECONNREFUSED 127.0.0.1:1` | — |
| `no-such-host.invalid` | `Error` | `ENOTFOUND` | `getaddrinfo ENOTFOUND no-such-host.invalid` | — |
⇒ **A refused connection to a host with more than one address arrives with an EMPTY message**, so a message-only arm reads it as unknown → PERMANENT → dropped, even after this batch adds `econnrefused`. 2026-11-16's messages carried text only because the database host resolved to a single IPv6 address (`connect ECONNREFUSED 2a05:d018:…:5432`). Whether the pool's connect path uses `autoSelectFamily` is not established; the fix does not depend on it (P1 reads the code either way). **Measured:** the AggregateError shape and its `code` are Node's own, reproduced above. **NOT RE-READ (no second reader):** whether `pg`'s connect path ever produces it against our host. P1 is built so that this question does not need an answer.

### A3 — the real message population (source 2)
Every `PERMANENT flush failure` line in staging's error stream, all 15 files on disk (`error__2026-11-03` … `error.log`, content 2026-11-02 → 2026-11-16), normalised:
| writer | message shape | count | dates |
|---|---|---:|---|
| ticker | `connect ECONNREFUSED <addr>:5432` | 2,172 | 11-16 |
| bars | `connect ECONNREFUSED <addr>:5432` | 864 | 11-16 |
| bars | `canceling statement due to statement timeout` | 3 | 11-04 |
| ticker | `Query read timeout` | 2 | 11-04 |
| bars | `Query read timeout` | 2 | 11-04 |
The 3,036 refused lines match Infra Claude's `#1259` count. The 7 timeout lines are the **control set that must stay PERMANENT** (statement timeout: F-G-1; read timeout: Langston's 2026-10-17 refusal on `#705`). These shapes become the test fixtures (P2).

### A4 — cover and memory (OBJ-3; sources 2 + a measurement)
- **Cover, rolling hourly** over `out__*.log` + `out.log`, 2026-11-10 14Z → 2026-11-16 12Z (108-143 hours per class): minutes a 50,000-row buffer holds at median / p90 / peak — ticker:xstock_spot 63 / 9 / 9 (**~9 is the in-session baseline**, Langston C2: 315,823-336,867 rows/h every hour 15:00-20:59Z on 11-13) · ticker:crypto_perp 63 / 63 / 62 · ticker:crypto_spot 206 / 133 / 82 · ticker:xstock_perp 376 / 370 / 367 · bars:crypto_spot 177 / 120 / 69 · bars:crypto_perp 272 / 10 / 4 · bars:xstock_perp 5,000 / 146 / 74 (the two futures bar rates count the REST poller's re-sent windows) · bars:xstock_spot fail-stop.
- **Memory — object: synthetic rows built field-for-field as the producers build them** (`equity-spot-archiver.ts:334-353` ticker; `crypto-spot-archiver.ts:208-220` + `arrivedAt` bars), `node --expose-gc`, heap delta, staging Node v20.20.0, run twice: **609 B/ticker row, 550 B/bar row**. 50k ticker ≈ 29 MB; 50k bars ≈ 26 MB; all eight buffers full (4 × 29 + 4 × 26, counting the xStock fail-stop buffer) ≈ **221 MB**; a 60-minute in-session `ticker:xstock_spot` hold (336,867 rows) ≈ **196 MB**. Context: app RSS 622 MB, host 3,814 MB total / 2,399 MB available (`free -m`, 13:2xZ). ⚠️ Synthetic values are short decimal strings as `String(number)` produces; a real row could be slightly larger. **Not re-read by a second reader** (a sizing figure, not a decision this batch takes).
- **The J3 option, priced for Kyle's list:** raising only `ticker:xstock_spot` to a 60-minute in-session hold costs ~196 MB at the worst moment, against ~2.4 GB available. Recorded as a **proposal for Kyle's list, not a placement** — this batch keeps 50,000.

### A5 — refused-flush duration (C6; source 2; label corrected)
**Measured (C6; label corrected at Step 2, Langston `1571882987669422203`, re-derived by him) — object: the bar writer's `flush failure after N ms` lines (PERMANENT **and** `ADMISSION UNCONFIRMED`) in staging `error.log` 2026-11-16 04:20-05:19Z, all `ECONNREFUSED`; population n=1,398 = 856 PERMANENT (crypto_spot 539 · crypto_perp 243 · xstock_perp 74) + 542 `ADMISSION UNCONFIRMED` (all `xstock_spot`, the retained branch).** Pooled: min 25 ms, median 30 ms, p90 7,897 ms, max 14,670 ms. PERMANENT only: n=856, min 25, median 53, p90 7,364, p95 8,366, max 14,670. The ticker writer logs no duration (2,172 ticker PERMANENT lines, 0 with `after N ms`). A refused connect is a TCP refusal, not a login, so it cannot add to a Supabase ban. **HYPOTHESIS, not measured:** the seconds-long tail mixes two waits this instrument cannot separate. `flushStartedAt` is set BEFORE `await acquireSlot()` (`ohlc-batch-writer.ts:602` / `:604`), so `elapsedMs` includes the writer's own counting-semaphore wait (2 slots, 5 s timeout; the file header says it is NOT the Drizzle pool) as well as any pool wait; 141 of the 856 exceed 5,000 ms. Backoff stays `#1082`'s, with two riders recorded there.

### A6 — the System Impact Map, per component (source 3)
- **§2.6b** (bar writer, write-order contract): rows leave the buffer only after a successful write; one flush per class in flight; xStock spot through `writeXstockProjectionAttempts`. This batch changes neither rule; the xStock spot bar path already retains on admission-unconfirmed and keeps its fail-stop. Open edges named there stay out: `#1034`/`#1032`, `#1082`, `#1030`.
- **Layer-9 table rows 4, 5, 22** (5 s flush, 2-slot semaphore, 1,000-row chunks): unchanged.
- **Cross-Cutting Runtime State registry (`:67`)**: no entry for the writers' alert latch today; OBJ-2 adds a second module-level map of the same kind. Mode-INVARIANT, dies with the process. ⇒ **Step 10 adds ONE registry entry covering both latches** — a governance gap this audit flags (the existing latch was never registered).
- **Upstream** (unchanged): the three archivers' `bufferOhlcBar` / `bufferTickerSnap` calls; `startBatchWriter`/`startTickerWriter` from `server/startup/passive-archive-bootstrap.ts:247-248`; the shutdown drain (`ohlc-batch-writer.ts:800-801`). **Downstream** (unchanged): the bar and ticker tables' readers. **New downstream:** the system-alert store gains seven possible keys. **Blast radius: LOW** — the only behaviour change on the write path is that network-unreachable failures are retained instead of dropped, which the existing bound already sizes.

### A7 — census at each hop (§9.5(a); repo-wide `git grep`, tests excluded unless named)
| state / function | writers | readers | mutators | DELETERS | schedulers |
|---|---|---|---|---|---|
| `isTransientWriteError` | — | exactly two: `ohlc-batch-writer.ts:667`, `ticker-batch-writer.ts:163` | — | — | — |
| bar `buffers[class]` | `bufferOhlcBar` (one entry point) | flush | flush | flush success (`buf.splice(0,n)`), permanent drop, shed | `startBatchWriter` timer, `stopBatchWriter`, shutdown drain |
| `tickerBuffers[class]` | `bufferTickerSnap` (one entry point; producers: equity-spot, crypto-spot, kraken-futures archivers) | flush | flush (`unshift` on transient) | flush (splice-before-insert), shed | `startTickerWriter` timer, `stopTickerWriter`, shutdown drain |
| `_permanentAlerted` | `alertPermanentWriteFailure` | same | — | `clearPermanentAlertLatch` (2 callers: the two success paths), raise-failure release | — |
| dedupe keys `*-writer-shed-*` | **none today** (alert store: 0 lines; control: `writer-permanent` 17 lines in the same file) | — | — | — | — |
Every list with one member says so above. One scheduler per writer; no mutual-exclusion question.

### A8 — the System Manual (source 4)
Silent on the writers' error classification and shed policy (searched `batch writer`, `transient`, `retry buffer`). This batch adds no architecture or maths; **judged N/A** for the System Manual, and the silence is recorded rather than filled.

### A9 — the ledger and the reports (source 5)
`#705` (its 11-16 item carries Langston's rulings); `#1082` backoff, `#1034` cap/drain, `#1032` double insert — all homed, none folded; `#1259` the incident. `BATCH_CATALOG` F-G-1 and `F_G_1_COMPLETION_REPORT.md` (the classifier's origin, `98640f00a`). No prior decision excludes the network family; the only prior refusal on this list is `query read timeout` (2026-10-17), untouched.

### A10 — provenance (source 6)
The classifier and the shed paths postdate the 2026-01/02 governance change (F-G-1, 2026-08-28); intent quoted in the scope from `98640f00a`. `bridge/canonical/` has no coverage of these writers' retry policy (not searched beyond that; nothing here is disputed or pre-governance).

### A11 — deploy window
No observation window: OBJ-4's checks read the restart and the first flushes, not a period. **No `DEPLOY_WINDOWS.jsonl` row is filed.**

## THE PLAN (each item → its finding)
- **P1 (A1, A2, A3) — the classifier.** In `isTransientWriteError`: keep the statement-timeout guard first. Then a transient NETWORK test that reads the error's **`code`**, and the `code` of each entry in an `AggregateError`'s `errors`, against a named set `TRANSIENT_NETWORK_CODES = ECONNREFUSED, EHOSTUNREACH, ENETUNREACH, EAI_AGAIN`, plus message arms for the same four codes (`econnrefused`, `ehostunreach`, `enetunreach`, `eai_again`) for errors that arrive as text. **No `getaddrinfo` arm and no `ENOTFOUND` anywhere** (C4). The existing arms are unchanged.
  - **Judgement call A (for Langston):** should the code test also carry the two codes the message arms already accept (`ECONNRESET`, `ETIMEDOUT`), so their empty-message multi-address form is transient too? Proposed: **yes** — same failure, same shape; it only changes verdicts for errors that today carry NO text. Without it the existing arms keep the gap A2 shows.
- **P2 (A2, A3) — the fence**, in `server/tests/unit/f-g-1-writer-retry-fence.test.ts` (one new `describe`):
  - real-population fixtures: `connect ECONNREFUSED 2a05:d018:135e:16c7:82b8:28a7:565c:6ebf:5432` → transient; `canceling statement due to statement timeout`, `Query read timeout` → permanent (the 7-line control);
  - one per new code by message and by `code`; the `AggregateError` shape built like Node's (`message ''`, `code`, `errors[]`) → transient; `getaddrinfo ENOTFOUND db.example` and `{code:'ENOTFOUND'}` → permanent;
  - **mutations, run and recorded:** remove each arm → its test fails; remove the code test → the AggregateError test fails; **add a `getaddrinfo` arm → the ENOTFOUND test fails** (C4).
- **P3 (A1, A6, OBJ-2) — the shed alert.** In `ohlc-batch-writer.ts`, beside `alertPermanentWriteFailure`: `alertWriterShed(writer, assetClass, shed, bufferLen)` and `clearShedAlertLatch(writer, assetClass)`, with its own map `_shedAlerted` (claim before raise, release on failure, expire at `ALERT_RE_ARM_MS`). `category 'breakage'`, `severity 'critical'`, `dedupe_key` `${writer}-writer-shed-${class}`, metadata `{ assetClass, shed, bufferLen, cap, refetchable, source, issue: '#705' }`. `refetchable` comes from a named map: true only for `ohlc:crypto_perp` and `ohlc:xstock_perp` (the REST poller); false for all four ticker classes and `ohlc:crypto_spot` (C1). The body says the rows are gone, whether they can be re-fetched, that the alert is resolve-only and not raised again while unresolved, and where the measured cover is recorded (the System Impact Map's writer entry).
  - Called from the bar shed branch (`:708`, the three non-xStock-spot classes) and the ticker shed branch (`:173`, all four). Cleared beside the existing `clearPermanentAlertLatch` calls on both success paths.
- **P4 (A1, A6) — the fence for P3**, same file: one shed raises exactly one alert under repeated sheds; a successful flush clears the latch so the next shed raises; a raise that throws releases the latch; no alert below the cap; the ticker leg covered as well as the bar leg; `refetchable` correct for all seven pairs. Mutations: latch removed → repeated sheds raise more than once; clear removed → the post-success shed does not raise; call removed → no alert.
- **P5 (A4, A6) — comments.** The classifier docblock gains the network family, the `ENOTFOUND` exclusion and the AggregateError reason; the `RETRY_BUFFER_MAX` docblock points to the System Impact Map entry for the measured cover and memory, and states no figure.
- **P6 (A6, A9) — Step 10.** System Impact Map: §2.6b (network family, shed alert, cover and memory table with its window) and ONE runtime-state registry entry for both latches. `RUNNING_ISSUES` `#705`: the 11-16 item closed with this batch's refs; the ticker leg (`#1032`) stays open. The plan line §0a CC-A item 3. `BATCH_CATALOG`, `PHASE_HISTORY`, `CHANGES_AND_FIXES`. The J3 option goes to PM as a proposal for Kyle's list.
- **Verification (OBJ-4, Step 7):** deployed sha in `dist/BUILD_SHA`; the fence run at that sha on staging; the classifier imported from the deployed source and run over every A3 line → 3,036 transient, 7 permanent; flushes resume on all eight writer:class pairs, read inside a window in which each pair normally flushes (all eight do on a weekday, xStock 24/5), with a pair that cannot flush in the window reading as neither pass nor fail (`#661` leg 2). No UI surface: the System Alerts page renders a shed alert only if one fires, and none can be induced safely.

## Plain-language summary
The audit found one more gap than the scope knew about. When the database's name points at more than one address, a refused connection arrives with an empty message, and the current check would still throw that data away. The plan reads the error code as well as the message. Everything else lines up with what Langston ruled. Seven past timeout errors stay "permanent" as the control. A full set of buffers costs about 220 MB of memory, which the server can afford. Holding a full hour of xStock snapshots during market hours would take about 196 MB more, and that goes to Kyle's list as an option, not into this fix.
