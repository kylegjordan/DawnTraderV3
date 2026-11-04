# B-CRYPTO-FEED-WATCHDOG (#1232) — STEP 4 CHANGE LIST (Langston, code review)

**Graded ref:** `d6f06bc4d60c303eddd49f55df5a53506562458c` on `migration/aws-supabase` (code commits `208e824a6` + `d6f06bc4d`). Read the code there; every snippet below is cut from that ref.

## Dispatch header
| # | field | value |
|---|---|---|
| i | **declared change-class** | `architecture` (scope header, unchanged at Step 2) |
| ii | **doc set for `architecture`** | scope — **present** `Claude Comms and Packages/Scope Files/B_CRYPTO_FEED_WATCHDOG_SCOPE.md` (r2) · pre-audit — **present** `…/Scope Files/B_CRYPTO_FEED_WATCHDOG_PRE_AUDIT.md` · completion report — **absent, written at Step 11** · `BATCH_CATALOG` / `PHASE_HISTORY` / `SYSTEM_MANUAL` (incl. the `:708-709` correction) / `SYSTEM_IMPACT_MAP` — **absent, Step 10** · `RUNNING_ISSUES` `#1232` — **present** (filed `5f6de7489`) · plan row 33a + pre-sprint line 1a — **present** · task list + memory — Step 10 |
| iii | **Step-2 reference** | `…/Scope Files/B_CRYPTO_FEED_WATCHDOG_PRE_AUDIT.md` — your PROCEED with C1-C3 + record items, folded at `d95fd8568` |

## Files (16 in `208e824a6`, 2 in `d6f06bc4d`)
NEW `server/services/passive-archive/recorder-connection.ts` · NEW `server/core/trading/witness-vouch.ts` · NEW `scripts/b-crypto-feed-watchdog-witness-backfill.ts` · NEW `drizzle/migrations/2026-11-04-b-crypto-feed-watchdog.sql` (+ `-rollback.sql`, MANIFEST line) · NEW `server/tests/unit/b-crypto-feed-watchdog.test.ts` · MODIFIED `crypto-spot-archiver.ts`, `kraken-futures-archiver.ts`, `feed-integrity-monitor.ts`, `feed-health-aggregate.ts` (header only), `close-fill-contract-config.ts`, `active-execution-engine.ts`, `system-alerts.ts` (one actor row), `shared/schema.ts` (+7 lines), `b-feed-mismatch-fix.test.ts` (+3 tests).
**Untracked-file check done** (`git status --porcelain`: only `.claude/launch.json`, local config).

## Verification
- tsc baseline 329 = 329 · new suite 26/26 · `b-feed-mismatch-fix` 15/15 · the 7 existing suites touching these files pass · full local run 4,581 passed; the 10 files that fail to load locally fail identically WITHOUT these changes (local Postgres absent; 2 pre-existing syntax errors) — CI is the gate.
- **Mutation checks, each turned the suite RED:** backoff reset on open (M1) · silence ignores the open time (M2) · heartbeat counted as data (M3) · snapshot stamps the per-symbol clock (M4) · denominator = ticked symbols only (C1, M5) · unknown liveness treated as live (M6) · no pending-reconnect guard (M7) · engine vouch removed (V1 + V3 red).
- **P4 wire capture** (staging, 2026-11-04 14:22Z, 20 s): one subscribe reply per symbol per channel, `success:true` + `result`, or `success:false` + `error` + `symbol`; `{"channel":"heartbeat"}` 20 times in 20 s; ticker `snapshot` then `update`. Fixtures in the test use those shapes.

## Load-bearing hunks
### 1. One socket, one timer — `recorder-connection.ts:184-262`
```ts
  connect(): void {
    if (!this.opts.isEnabled()) return;
    this.clearReconnectTimer();
    this.clearSubscribeTimer();
    if (this.ws) { detachAndTerminate(this.ws); this.ws = null; }
    const ws = new WebSocket(this.opts.url, { handshakeTimeout: RECORDER_HANDSHAKE_TIMEOUT_MS });
    this.ws = ws;
    ws.on('open', () => {
      if (this.ws !== ws) return;
      const now = Date.now();
      this.openedAtMs = now;
      this.awaitingFirstData = true;
      this.liveSinceMs = 0;
      this.bytesSinceOpen = 0;
      this.subscribeOk = 0;
      this.subscribeRejected.length = 0;
      console.log(`[B74][${this.opts.label}] connected (attempt ${this.backoff.attempts() + 1})`);
      this.opts.onOpen(ws);
      this.armSubscribeTimer(ws);
    });
    ws.on('message', (raw) => {
      if (this.ws !== ws) return;
      const now = Date.now();
      this.lastAnyAtMs = now;
      this.bytesSinceOpen += typeof (raw as any).length === 'number' ? (raw as any).length : 0;
      const r = this.opts.onMessage(raw, now);
      this.recentKinds.push(r.kind);
      if (this.recentKinds.length > 8) this.recentKinds.shift();
      if (r.data) this.noteData(now);
    });
    ws.on('close', (code, reason) => {
      if (this.ws !== ws) return; // a replaced socket's late close must not schedule a second reconnect
      console.warn(`[B74][${this.opts.label}] disconnected code=${code} reason=${reason.toString()}`);
      this.ws = null;
      this.scheduleReconnect();
    });
    ws.on('error', (err) => {
      if (this.ws !== ws) return;
      console.warn(`[B74][${this.opts.label}] ws error: ${err.message}`);
    });
  }

  /** A data frame arrived: the data clock moves, the backoff resets once per open, streaks clear. */
  noteData(nowMs: number): void {
    this.lastDataAtMs = nowMs;
    if (this.awaitingFirstData) {
      this.awaitingFirstData = false;
      this.backoff.reset();
      this.consecutiveForced = 0;
      this.liveSinceMs = nowMs;
    }
  }

  /** Record one subscribe reply (`success` true/false, with the rejected symbol when false). */
  noteSubscribeReply(success: boolean, symbol: string | null): void {
    if (success) this.subscribeOk++;
    else if (symbol) this.subscribeRejected.push(symbol);
    else this.subscribeRejected.push('?');
  }

  /** At most ONE pending reconnect. */
  scheduleReconnect(): void {
    if (!this.opts.isEnabled()) return;
    if (this.reconnectPending) return;
    this.reconnectPending = true;
    const delay = this.backoff.nextDelayMs();
    console.warn(`[B74][${this.opts.label}] reconnecting in ${delay}ms (attempt ${this.backoff.attempts()})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectPending = false;
      try { this.connect(); } catch (err) {
        console.error(`[B74][${this.opts.label}] reconnect failed:`, err);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /** Terminate the current socket and reconnect through the single path. */
  forceReconnect(reason: string, nowMs: number): void {
    const ws = this.ws;
    const state = ws ? ws.readyState : -1;
    console.warn(
      `[B74][${this.opts.label}][SILENT] forcing reconnect: ${reason} readyState=${state} ` +
      `data_age_ms=${this.lastDataAtMs > 0 ? nowMs - this.lastDataAtMs : -1} any_age_ms=${this.lastAnyAtMs > 0 ? nowMs - this.lastAnyAtMs : -1} ` +
      `open_age_ms=${this.openedAtMs > 0 ? nowMs - this.openedAtMs : -1} bytes_since_open=${this.bytesSinceOpen} ` +
      `last_kinds=${this.recentKinds.join(',') || 'none'} subscribe_ok=${this.subscribeOk} subscribe_rejected=${this.subscribeRejected.length}`,
    );
    this.clearSubscribeTimer();
    detachAndTerminate(ws);
    this.ws = null;
    this.liveSinceMs = 0;
    this.consecutiveForced++;
    this.forcedAtMs.push(nowMs);
```
### 2. The silence decision + the tick — `recorder-connection.ts:75-88`, `:309-335`
```ts
export function decideSilence(input: {
  open: boolean;
  reconnectPending: boolean;
  nowMs: number;
  lastDataAtMs: number;
  openedAtMs: number;
  silenceMs: number;
}): WatchDecision {
  if (!input.open || input.reconnectPending) return 'skip';
  const since = Math.max(input.lastDataAtMs, input.openedAtMs);
  if (since <= 0) return 'skip';
  return input.nowMs - since > input.silenceMs ? 'force' : 'ok';
}

…
  async watchTick(nowMs: number): Promise<WatchDecision> {
    if (!this.opts.isEnabled()) return 'skip';
    const cfg = this.resolveConfig();
    if (!cfg) return 'skip';
    const decision = decideSilence({
      open: this.ws?.readyState === WebSocket.OPEN,
      reconnectPending: this.reconnectPending,
      nowMs,
      lastDataAtMs: this.lastDataAtMs,
      openedAtMs: this.openedAtMs,
      silenceMs: cfg.silenceMs,
    });
    if (decision === 'force') {
      this.forceReconnect(`no data frame for > ${cfg.silenceMs} ms`, nowMs);
    }
    while (this.forcedAtMs.length > 0 && nowMs - this.forcedAtMs[0] > 3_600_000) this.forcedAtMs.shift();
    if (!this.alertRaised && decideRecorderAlert({ consecutiveForced: this.consecutiveForced, forcedInLastHour: this.forcedAtMs.length, cfg })) {
      await this.raiseSilentAlert(cfg, nowMs);
    } else if (this.alertRaised && decideRecorderAlertClear({
      dataLive: this.isDataLive(nowMs, cfg.silenceMs),
      liveSinceMs: this.liveSinceMs,
      nowMs,
      clearAfterDataMs: cfg.clearAfterDataMs,
    })) {
      await this.resolveSilentAlert(nowMs, cfg);
    }
    return decision;
```
### 3. Crypto recorder: DATA flag, update-only clock, subscribe replies — `crypto-spot-archiver.ts:239-284`
```ts
function handleMessage(shard: Shard, raw: WebSocket.RawData): { data: boolean; kind: string } {
  const now = Date.now();
  shard.lastMsgAt = now;
  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return { data: false, kind: 'unparsable' };
  }
  if (msg.method === 'subscribe') {
    // Wire capture 2026-11-04: one reply per symbol per channel; success:false carries `error` and `symbol`.
    shard.conn?.noteSubscribeReply(msg.success === true, typeof msg.symbol === 'string' ? msg.symbol : null);
    return { data: false, kind: msg.success === true ? 'subscribe_ok' : 'subscribe_rejected' };
  }
  if (msg.channel === 'ohlc' && Array.isArray(msg.data)) {
    for (const bar of msg.data) {
      // *scanned* stays unconditional — every bar received (J8); *persisted* follows the return value
      // (#1029 — it used to count bars the old guard discarded); a rejected bar is *skipped*.
      shard.cumulativeOhlcRows++;
      if (parseOhlcBar(bar)) shard.rowsPersistedLastMinute++;
      else shard.ohlcFramesSkipped++;
    }
    return { data: msg.data.length > 0, kind: `ohlc/${msg.type ?? '?'}` };
  } else if (msg.channel === 'ticker' && Array.isArray(msg.data)) {
    const isUpdate = msg.type === 'update';
    for (const snap of msg.data) {
      parseTickerSnap(snap);
      shard.cumulativeTickerSnaps++;
      if (isUpdate && typeof snap?.symbol === 'string') {
        lastTickerUpdateAt.set(snap.symbol, now);
        if (firstTickerUpdateAtMs === null) firstTickerUpdateAtMs = now;
      }
    }
    return { data: msg.data.length > 0, kind: `ticker/${msg.type ?? '?'}` };
  }
  return { data: false, kind: typeof msg.channel === 'string' ? msg.channel : 'other' };
}

function subscribe(shard: Shard, ws: WebSocket): void {
  ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ohlc', symbol: shard.symbols, interval: 1 },
  }));
  ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ticker', symbol: shard.symbols },
```
### 4. C1 / C3 accessors — `crypto-spot-archiver.ts:104-143`
```ts
export function getCryptoRecorderSymbolAges(nowMs: number, shardId?: number): { symbol: string; ageMs: number | null }[] {
  const out: { symbol: string; ageMs: number | null }[] = [];
  for (const sh of state.shards) {
    if (shardId !== undefined && sh.id !== shardId) continue;
    for (const symbol of sh.symbols) {
      const at = lastTickerUpdateAt.get(symbol);
      out.push({ symbol, ageMs: at === undefined ? null : Math.max(0, nowMs - at) });
    }
  }
  return out;
}

/** The shard ids, for per-connection grading. */
export function getCryptoRecorderShardIds(): number[] { return state.shards.map((s) => s.id); }

/** C2: the live-share reading is meaningful only once a full window has passed since this process's first ticker update.
 *  The window is the caller's (ONE DB value, `feed_health.recorder_live_window_ms`), so the warmth and the share can never
 *  use different windows. Blind for the first window after every process start — stated in the pre-audit and Step 7. */
export function isCryptoRecorderWarm(nowMs: number, windowMs: number): boolean {
  return firstTickerUpdateAtMs !== null && nowMs - firstTickerUpdateAtMs >= windowMs;
}

/** C3/P7: is this symbol in the recorder's subscribed universe? (GLMR/USD on 2026-10-22 was not — its witness was days old.) */
export function isInCryptoRecorderUniverse(symbol: string): boolean {
  return symbolShard.has(symbol);
}

/** C3/P7: is DATA arriving on the connection that owns this symbol? `null` when the symbol is not in the universe or the
 *  connection's threshold cannot be read (the caller treats unknown as NOT vouched — never as live). Sync, in-memory. */
export function isCryptoRecorderSymbolConnectionLive(symbol: string, nowMs: number): boolean | null {
  const id = symbolShard.get(symbol);
  if (id === undefined) return null;
  const sh = state.shards.find((s) => s.id === id);
  if (!sh?.conn) return null;
  const cfg = sh.conn.resolveConfig();
  if (!cfg) return null;
  return sh.conn.isDataLive(nowMs, cfg.silenceMs);
}

/**
```
### 5. The recorder grade (C1/C2) — `feed-integrity-monitor.ts:385-410`
```ts
  /**
   * B-CRYPTO-FEED-WATCHDOG (#1232, P6; Langston Step-2 C1/C2). Per recorder connection: the share of its SUBSCRIBED symbols
   * (C1 — the denominator is the universe, never the symbols that happened to tick) with a ticker update inside the window,
   * against the floor. ONE window (`feed_health.recorder_live_window_ms`) for both the share and the warmth gate (C2), so the
   * reading is blind for the first window after every process start — reported as NOT GRADED ('warming'), never as healthy.
   * Measured basis (pre-audit A5): 2 h share healthy 0.80-0.99 (Sunday 0.785+), half-dead ≤ 0.44; floor 0.60.
   */
  private computeRecorderLiveness(now: number): RecorderLivenessReading {
    const ids = getCryptoRecorderShardIds();
    if (ids.length === 0) {
      // No recorder running (capture disabled, or not started): nothing to grade — and no config read either.
      return { graded: false, notGradedReason: 'no_recorder', windowMs: null, floor: null, shards: [], grade: 'healthy' };
    }
    const windowMs = this.tryGetConfig('crypto_spot', 'recorder_live_window_ms');
    const floor = this.tryGetConfig('crypto_spot', 'recorder_live_share_floor');
    const base = { windowMs, floor, shards: [] as RecorderLivenessReading['shards'] };
    if (windowMs === null || floor === null) return { ...base, graded: false, notGradedReason: 'config_missing', grade: 'healthy' };
    if (!isCryptoRecorderWarm(now, windowMs)) return { ...base, graded: false, notGradedReason: 'warming', grade: 'healthy' };
    let grade: FeedAliveGrade = 'healthy';
    for (const id of ids) {
      const items = getCryptoRecorderSymbolAges(now, id);
      const liveShare = proportionFresh(items, windowMs);
      const g: FeedAliveGrade = liveShare < floor ? 'critical' : 'healthy';
      if (g === 'critical') grade = 'critical';
      base.shards.push({ shardId: id, liveShare, symbolCount: items.length, grade: g });
    }
    return { ...base, graded: true, notGradedReason: null, grade };
  }

  /** B-FEED-HEALTH-GRADE-ARM: the last cycle's per-class liveness (read-only; null before the first graded cycle). */
  public getLastLiveness(): LivenessReading | null {
    return this.lastLiveness;
  }
```
### 6. The vouched witness at the gate (P7/C3) — `active-execution-engine.ts:4453-4486`
```ts
      } else {
        // B-CRYPTO-FEED-WATCHDOG (#1232, P7): on crypto the witness is the recorder's — a dead recorder hands this gate a
        // FROZEN PRESENCE, not an absence (13 closes on 2026-10-21 → 11-04 carried a witness frozen at 10:19:57Z; GLMR/USD
        // one from a symbol no longer recorded). Grade only a VOUCHED witness (in the recorder's universe, its connection
        // receiving data, within `witness_max_age_ms`); otherwise do not grade, stamp `walk_witness_unvouched` — distinct
        // from `walk_no_reference` (no witness at all) and from `walk_stale` (graded and agreed). Bound on the consumer only.
        let _vouch: WitnessVouch | null = null;
        if (_witness && _closeClass === 'crypto_spot' && _closeContract && typeof _closeContract.witnessMaxAgeMs === 'number') {
          const _nowV = Date.now();
          _vouch = decideWitnessVouch({
            inRecorderUniverse: isInCryptoRecorderUniverse(position.symbol),
            connectionLive: isCryptoRecorderSymbolConnectionLive(position.symbol, _nowV),
            capturedAtMs: _witness.capturedAtMs,
            nowMs: _nowV,
            maxAgeMs: _closeContract.witnessMaxAgeMs,
          });
        }
        const _refBid = _witness && (!_vouch || _vouch.vouched) ? _witness.bid : null;
        if (_vouch && !_vouch.vouched) {
          _fillArm = 'walk_witness_unvouched';
          console.warn(`[B-CRYPTO-FEED-WATCHDOG][WITNESS_UNVOUCHED] ${position.symbol} pos=${positionId} reason=${_vouch.reason} `
            + `witnessAgeMs=${_vouch.ageMs} witnessBid=${_witness!.bid} walked=${actualExitPrice!} — not graded, close proceeds`);
        } else if (_refBid === null) {
          _fillArm = 'walk_no_reference'; // e.g. EUR-quoted pairs (#966): nothing to grade against
        } else if (_closeContract && !walkAboveReference(actualExitPrice!, _refBid, _closeContract.upTol)) {
          _fillArm = _isFlatten ? 'flatten_walk' : 'walk_stale';
        } else if (_isFlatten) {
          // A flatten must go flat — there is no next cycle — so it books, but the diverged walk is
          // stamped and kept out of learning. (Also the fail-closed arm when the contract is unseeded.)
          _fillArm = 'flatten_walk_diverged';
          _learnExcluded = true;
        } else {
          const _yield = await this._countCloseRefusal(
            position, _closeContract,
```
### 7. The witness age on the record (P8) — `active-execution-engine.ts:4845-4856`
```ts
        // B-CRYPTO-FEED-WATCHDOG (#1232, P8): WHEN the witness above was captured, so a stale one can never again pass as
        // fresh. `at_close` = read at this close; NULL/NULL when no witness was stored. A caller-supplied ticker (never
        // today — the payload fields are null by construction) would have no capture time: `underivable`.
        exitTickerCapturedAt: options?.exitProvenance?.tickerBid != null
          ? null
          : (_witness ? new Date(_witness.capturedAtMs) : null),
        exitTickerAgeBasis: options?.exitProvenance?.tickerBid != null
          ? 'underivable'
          : (_witness ? 'at_close' : null),
        // ── B-XSTOCK-FEED-SANITY P5 — THE LABEL, outside every money expression. Basis `guard` means
        // A LIVE FRAME WAS ASSESSED at that instant, and is written only when one was: the decision
        // label is the exit stamp's verdict or NULL (a flatten through `forceClosePosition` carries
```
### 8. Contract: `witness_max_age_ms` is a CRYPTO-ONLY required key — `close-fill-contract-config.ts`
A crypto row set without it resolves `null` ⇒ the existing fail-closed path (not-warm crypto closes refused + alert). It ships in the same migration as the code (`dt-deploy` runs migrations before the restart). xStock's required set is unchanged.

## Judgement calls — attack these
1. **One shared connection class for BOTH recorders** (crypto-spot shards and the two futures legs) instead of patching each file. The futures legs inherit P1/P2/P5 with a 120 s threshold; their subscribe-reply check is OFF (`expectedSubscribeReplies: () => 0`) because the Futures v1 replies were not wire-captured.
2. **Liveness unknown ⇒ NOT vouched ⇒ the close proceeds ungraded.** A missing `passive_archive` row therefore LOOSENS the not-warm gate for crypto (it stops grading) rather than tightening it — while the same missing row raises `passive-archive-config-missing` (critical). I chose "don't grade against a witness we cannot vouch for" over "refuse closes because a config row is missing". Rule on it.
3. **The recorder grade is folded into the alarm's overall status** (worse of trading classes and recorder). A half-dark recorder now turns the feed-health status critical on the dashboard, though trading's own feed is fine. Alternative: report it beside the status without moving it.
4. **Subscribe-reply check reconnects only on ZERO replies**; partial replies and explicit rejections are logged, not reconnected (a delisted symbol would otherwise loop the shard forever). `got < expected` is a warn line only.
5. **The alert clears on 10 min of continuous data on the CURRENT socket** (`liveSinceMs`), not on the forced-reconnect history; a natural 1006 cut restarts the clock (conservative).
6. **`handshakeTimeout: 15_000`** added after self-review (`d6f06bc4d`): without it a socket stuck CONNECTING is never silence-checked (the check judges OPEN sockets) and `ws` would hold it forever.

## Step 7 reminder (pre-registered in the pre-audit §4)
The live-share grade is NOT GRADED ('warming') for the first 2 h after the deploy's restart (C2); criterion (4) is read after that. The backfill dry run, then `--apply`, before 2026-11-20.
