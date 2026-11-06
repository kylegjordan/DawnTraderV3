/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-CRYPTO-FEED-WATCHDOG (#1232, sprint row 33a) — ONE recorder connection, watched.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS. On 2026-10-21 10:19:55Z the crypto recorder's shard0 was cut by the
 * venue (its 9th routine 1006 cut that day), reconnected, took in its opening data and
 * then received nothing for 14.08 days while reporting `connected=true` — until the
 * 2026-11-04 12:13:26Z deploy restarted it. The recorders reconnected ONLY from the
 * socket's `close` event, sent nothing, never checked a subscription was accepted, and
 * printed their own silence every minute without acting on it (pre-audit A1-A4).
 *
 * WHAT THIS MODULE OWNS, for ONE socket (a crypto-spot shard, or one futures leg):
 *   P1  exactly one live socket and at most one pending reconnect timer, at all times.
 *       A replaced socket has its listeners removed and is TERMINATED (never `close()`d:
 *       on a half-open socket a close handshake waits on a peer that will not answer).
 *       The backoff resets on the first DATA frame after an open, never on the open
 *       itself — a socket that opens and goes silent climbs the backoff (objective 5a).
 *   P2  the silence check: a socket whose last DATA frame is older than its threshold
 *       is terminated and reconnected through the same single path, with its state
 *       logged at that moment so the next occurrence can be diagnosed.
 *   P4  subscribe replies are counted per channel (wire-captured 2026-11-04: one reply
 *       per symbol, `success:true` with `result`, or `success:false` with `error` and
 *       `symbol`); a rejection names its symbols; no reply at all within the timeout
 *       reconnects. Wired by the caller (the futures protocol differs).
 *   P5  one deduped alert per connection, raised after repeated forced reconnects that
 *       did not bring data back, or too many forced reconnects in an hour; resolved
 *       in-app once data has flowed for a full clear window.
 *
 * ⛔ DATA, NOT ANY FRAME: Kraken sends `{"channel":"heartbeat"}` about once a second on a
 * subscribed connection (wire capture: 20 in 20 s) — an any-frame clock reads fresh on a
 * connection whose subscriptions are gone. The caller tells `noteFrame` whether a frame
 * carried DATA; only that clock decides silence.
 *
 * Every threshold is DB-governed (`module_constants.passive_archive`, rule 15). A missing
 * row makes the check INERT for that tick and raises `passive-archive-config-missing` —
 * the socket-close reconnect still works; nothing is silently defaulted.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import WebSocket from 'ws';
import { makeBackoff, type BackoffPolicy } from './reconnect-policy.js';
import { getCachedNumberRequired } from '../module-constants-service.js';

/** The in-app actor that resolves this module's own alerts (ALERT_ACTORS, system-alerts.ts). */
export const RECORDER_WATCHDOG_ACTOR = 'passive-archive-watchdog';
/** One watch tick for every registered connection. */
export const RECORDER_WATCH_TICK_MS = 30_000;
/** A socket that never completes its opening handshake is failed by `ws` after this long (error + close ⇒ the single
 *  reconnect path). Without it a socket stuck CONNECTING is never checked: the silence check only judges OPEN sockets.
 *  The same value the trading adapter uses (`kraken-websocket-adapter.ts` HANDSHAKE_TIMEOUT_MS) — a protocol timeout,
 *  not a tuned threshold. */
export const RECORDER_HANDSHAKE_TIMEOUT_MS = 15_000;

export interface RecorderWatchConfig {
  /** No DATA frame for longer than this ⇒ terminate + reconnect. */
  silenceMs: number;
  /** Consecutive forced reconnects that brought no data back ⇒ alert. */
  consecutiveForcedAlert: number;
  /** Forced reconnects within the trailing hour ⇒ alert. */
  forcedPerHourAlert: number;
  /** Data flowing for this long after an alert ⇒ resolve it. */
  clearAfterDataMs: number;
  /** No subscribe reply at all within this long of an open ⇒ reconnect. */
  subscribeReplyTimeoutMs: number;
}

export type WatchDecision = 'skip' | 'ok' | 'force';

/** Data liveness of one recorder connection (objective 4). 'unknown' = threshold unreadable — never live, never silent. */
export type RecorderDataLiveness = 'live' | 'silent' | 'unknown' | 'starting';
/** One connection as the stats report it: the socket state BESIDE the data liveness, never one for the other. */
export interface RecorderConnectionLiveness {
  /** The connection's recorderKey, e.g. `crypto-spot:shard0`. */
  key: string;
  /** Socket readyState === OPEN (what `connected` has always meant). */
  socketOpen: boolean;
  dataLive: RecorderDataLiveness;
}

/**
 * The silence decision, pure. `skip` while not open or a reconnect is pending (the timer
 * owns the shard then); `force` when the data age — measured from the later of the last
 * data frame and the open, so a fresh socket gets its full threshold — exceeds the limit.
 */
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

/** The alert decision, pure: raise on a streak of fruitless forced reconnects or an hourly flood. */
export function decideRecorderAlert(input: {
  consecutiveForced: number;
  forcedInLastHour: number;
  cfg: Pick<RecorderWatchConfig, 'consecutiveForcedAlert' | 'forcedPerHourAlert'>;
}): boolean {
  return input.consecutiveForced >= input.cfg.consecutiveForcedAlert
    || input.forcedInLastHour > input.cfg.forcedPerHourAlert;
}

/** The clear decision, pure: data live on the CURRENT socket, continuously, for the whole clear window. */
export function decideRecorderAlertClear(input: {
  dataLive: boolean;
  liveSinceMs: number;
  nowMs: number;
  clearAfterDataMs: number;
}): boolean {
  return input.dataLive && input.liveSinceMs > 0 && input.nowMs - input.liveSinceMs >= input.clearAfterDataMs;
}

/** Remove our listeners and kill the socket without waiting on the peer. Never throws. */
export function detachAndTerminate(ws: WebSocket | null): void {
  if (!ws) return;
  try { ws.removeAllListeners(); } catch { /* ignore */ }
  // A late error event on a dying socket must not become an unhandled 'error'.
  try { ws.on('error', () => { /* swallowed: detached */ }); } catch { /* ignore */ }
  try { ws.terminate(); } catch { /* ignore */ }
}

export interface RecorderConnectionOptions {
  /** Log label, e.g. `crypto-spot][shard0` (keeps the B74 `[B74][<label>]` grammar). */
  label: string;
  /** Alert identity, e.g. `crypto-spot:shard0`; the dedupe key is `passive-archive-silent:<key>`. */
  recorderKey: string;
  /** `passive_archive` constant holding this connection's silence threshold. */
  silenceConstant: string;
  url: string;
  /** Asset class used to resolve the DB rows (most-specific-wins; `*` rows apply). */
  configAssetClass: string;
  /** Called on every open: send the subscriptions. */
  onOpen: (ws: WebSocket) => void;
  /** Called on every frame; returns whether it carried DATA. */
  onMessage: (raw: WebSocket.RawData, nowMs: number) => { data: boolean; kind: string };
  isEnabled: () => boolean;
  /** Expected subscribe replies per open (0 ⇒ the subscribe-reply check is off for this protocol). */
  expectedSubscribeReplies: () => number;
}

interface AlertDeps {
  addAlert: (opts: any) => Promise<unknown>;
  resolveByKey: (key: string, by: string, evidence: string, transport: 'engine') => Promise<string[]>;
  /** Is a non-resolved row already open for this dedupe key? (adopted at the first tick — a row raised before a
   *  restart or a stop must still be clearable by this process; Langston Step-4 record item 4). */
  hasOpen: (key: string) => Promise<boolean>;
}

async function defaultAlertDeps(): Promise<AlertDeps> {
  const m = await import('../system-alerts.js');
  return {
    addAlert: m.addAlert,
    resolveByKey: m.resolveAlertsByDedupeKey as AlertDeps['resolveByKey'],
    hasOpen: async (key) => m.readAllAlerts().some((a) => a.dedupe_key === key && a.state !== 'resolved'),
  };
}
let _alertDeps: () => Promise<AlertDeps> = defaultAlertDeps;
/** Test-only: replace the alert sink. */
export function _setRecorderAlertDepsForTests(fn: (() => Promise<AlertDeps>) | null): void {
  _alertDeps = fn ?? defaultAlertDeps;
}

const _registry = new Set<RecorderConnection>();
/** Every registered connection (for the shared-pause note and the stats). */
export function registeredRecorderConnections(): RecorderConnection[] { return [..._registry]; }

export class RecorderConnection {
  ws: WebSocket | null = null;
  readonly backoff: BackoffPolicy = makeBackoff(30);
  reconnectTimer: NodeJS.Timeout | null = null;
  reconnectPending = false;
  lastAnyAtMs = 0;
  lastDataAtMs = 0;
  openedAtMs = 0;
  /** True between an open and the first data frame after it (the backoff resets on that frame). */
  awaitingFirstData = false;
  /** When data first arrived on the CURRENT socket (0 = not yet). The alert clears only after a full window of it. */
  liveSinceMs = 0;
  bytesSinceOpen = 0;
  readonly recentKinds: string[] = [];
  consecutiveForced = 0;
  readonly forcedAtMs: number[] = [];
  alertRaised = false;
  /** Subscribe replies seen since the last open. */
  subscribeOk = 0;
  readonly subscribeRejected: string[] = [];
  private subscribeTimer: NodeJS.Timeout | null = null;
  private configMissingWarned = false;
  /** Whether this process has looked for an already-open silent row to adopt (once, at the first tick). */
  private adoptChecked = false;

  constructor(readonly opts: RecorderConnectionOptions) {
    _registry.add(this);
  }

  /** Open a socket (replacing any current one). The ONLY place a socket is created. */
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
    while (this.forcedAtMs.length > 0 && nowMs - this.forcedAtMs[0] > 3_600_000) this.forcedAtMs.shift();
    this.scheduleReconnect();
  }

  /**
   * Is data arriving on this CONNECTION (a data frame within `silenceMs`, socket OPEN)?
   * ⚠️ TWO NOTIONS OF "LIVE" IN THIS CLASS, ON PURPOSE (Langston Step-4 record item 1) — do not merge them:
   *   - HERE, connection-scoped: `lastDataAtMs` survives a socket replacement, so for up to `silenceMs` after a
   *     reconnect this reads live on a socket that has received nothing yet. The witness vouch asks exactly this
   *     ("is this connection delivering?"), and `silenceMs` (120 s) is far inside the 6 h witness ceiling.
   *   - `liveSinceMs`, socket-scoped: reset on every open, set on the first data frame. The ALERT CLEAR reads it, so a
   *     page clears only after a full window of data on the CURRENT socket. Never move the clear onto `lastDataAtMs`.
   */
  isDataLive(nowMs: number, silenceMs: number): boolean {
    const open = this.ws?.readyState === WebSocket.OPEN;
    return open && this.lastDataAtMs > 0 && nowMs - this.lastDataAtMs <= silenceMs;
  }

  /**
   * B-CRYPTO-FEED-WATCHDOG objective 4: this connection's data liveness for the stats and the Passive Archive panel,
   * reported BESIDE the socket state, never instead of it (Langston Step-9 conditions 1-4). Sync, in memory.
   * PRECEDENCE, in this order — the first arm that matches wins:
   *   1. socket not OPEN            ⇒ 'silent'   no data can be arriving; `socketOpen:false` beside it says why, and the
   *                                              panel's socket-down arm (DISCONNECTED) outranks every data arm anyway.
   *                                              Needs no threshold, so it is a fact, not an unknown defaulted to false.
   *   2. threshold unreadable       ⇒ 'unknown'  `resolveConfig()` returned null: never graded live, never graded silent.
   *   3. OPEN, no data frame yet in ⇒ 'starting' the opening window before the first data frame (lastDataAtMs === 0),
   *      this process, still within                bounded by the same threshold the silence check uses — past it the
   *      `silenceMs` of the open                   connection reads 'silent', so a socket that opens dark at process start
   *                                                cannot read 'starting' forever.
   *   4. otherwise                  ⇒ `isDataLive` ? 'live' : 'silent' (the connection-scoped notion; see isDataLive).
   */
  dataLiveness(nowMs: number): RecorderConnectionLiveness {
    const socketOpen = this.ws?.readyState === WebSocket.OPEN;
    const key = this.opts.recorderKey;
    if (!socketOpen) return { key, socketOpen, dataLive: 'silent' };
    const cfg = this.resolveConfig();
    if (!cfg) return { key, socketOpen, dataLive: 'unknown' };
    if (this.lastDataAtMs === 0 && this.openedAtMs > 0 && nowMs - this.openedAtMs <= cfg.silenceMs) {
      return { key, socketOpen, dataLive: 'starting' };
    }
    return { key, socketOpen, dataLive: this.isDataLive(nowMs, cfg.silenceMs) ? 'live' : 'silent' };
  }

  /** Resolve this connection's config from the DB; null (and a loud alert) when any row is missing. */
  resolveConfig(): RecorderWatchConfig | null {
    const key = { exchange: '*', assetClass: this.opts.configAssetClass, strategy: '*', regime: '*' };
    try {
      return {
        silenceMs: getCachedNumberRequired('passive_archive', this.opts.silenceConstant, key),
        consecutiveForcedAlert: getCachedNumberRequired('passive_archive', 'recorder_watch_consecutive_forced_alert', key),
        forcedPerHourAlert: getCachedNumberRequired('passive_archive', 'recorder_watch_forced_per_hour_alert', key),
        clearAfterDataMs: getCachedNumberRequired('passive_archive', 'recorder_watch_clear_after_data_ms', key),
        subscribeReplyTimeoutMs: getCachedNumberRequired('passive_archive', 'recorder_subscribe_reply_timeout_ms', key),
      };
    } catch (err) {
      if (!this.configMissingWarned) {
        this.configMissingWarned = true;
        console.error(`[B74][${this.opts.label}][WATCH] config missing — silence check INERT: ${err instanceof Error ? err.message : err}`);
        void this.raiseConfigMissing(err instanceof Error ? err.message : String(err));
      }
      return null;
    }
  }

  /** One watch tick: the silence check, then the alert raise / clear. */
  async watchTick(nowMs: number): Promise<WatchDecision> {
    if (!this.opts.isEnabled()) return 'skip';
    if (!this.adoptChecked) {
      this.adoptChecked = true;
      try {
        if (await (await _alertDeps()).hasOpen(this.dedupeKey())) this.alertRaised = true; // adopt it: this process can clear it
      } catch { this.adoptChecked = false; /* retry next tick */ }
    }
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
  }

  private armSubscribeTimer(ws: WebSocket): void {
    const expected = this.opts.expectedSubscribeReplies();
    if (expected <= 0) return;
    const cfg = this.resolveConfig();
    if (!cfg) return;
    this.subscribeTimer = setTimeout(() => {
      this.subscribeTimer = null;
      if (this.ws !== ws) return;
      const got = this.subscribeOk + this.subscribeRejected.length;
      if (this.subscribeRejected.length > 0) {
        console.warn(`[B74][${this.opts.label}][SUBSCRIBE] ${this.subscribeRejected.length} rejected: ${this.subscribeRejected.slice(0, 20).join(',')}${this.subscribeRejected.length > 20 ? ',…' : ''}`);
      }
      if (got === 0) {
        this.forceReconnect(`no subscribe reply within ${cfg.subscribeReplyTimeoutMs} ms (expected ${expected})`, Date.now());
      } else if (got < expected) {
        console.warn(`[B74][${this.opts.label}][SUBSCRIBE] ${got} of ${expected} replies within ${cfg.subscribeReplyTimeoutMs} ms`);
      }
    }, cfg.subscribeReplyTimeoutMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.reconnectPending = false;
  }

  private clearSubscribeTimer(): void {
    if (this.subscribeTimer) { clearTimeout(this.subscribeTimer); this.subscribeTimer = null; }
  }

  private dedupeKey(): string { return `passive-archive-silent:${this.opts.recorderKey}`; }

  private async raiseSilentAlert(cfg: RecorderWatchConfig, nowMs: number): Promise<void> {
    // Set BEFORE the write: a re-entrancy guard (ticks are not awaited and a slow write can overlap the next one).
    // Reset in the catch: a FAILED write must be retried next tick, or the page is lost for the life of the process
    // on the very connection that is dead (Langston Step-4 BLOCKER).
    this.alertRaised = true;
    const all = registeredRecorderConnections();
    const silentOthers = all.filter((c) => c !== this && !c.isDataLive(nowMs, cfg.silenceMs)).map((c) => c.opts.recorderKey);
    const shared = silentOthers.length > 0 && silentOthers.length === all.length - 1;
    try {
      const deps = await _alertDeps();
      await deps.addAlert({
        triggers_at: new Date(nowMs),
        category: 'breakage',
        severity: 'critical',
        title: `Price recorder connection silent — ${this.opts.recorderKey}`,
        body: `The recorder connection ${this.opts.recorderKey} has been forced to reconnect ${this.consecutiveForced} time(s) in a row without data coming back `
          + `(${this.forcedAtMs.length} forced in the last hour; silence threshold ${Math.round(cfg.silenceMs / 1000)} s). `
          + (shared
            ? `EVERY recorder connection is silent at the same time — a shared pause (our network, the database writer, or the venue), not this connection alone. `
            : silentOthers.length > 0 ? `Also silent: ${silentOthers.join(', ')}. ` : `The other recorder connections are receiving data. `)
          + `It clears itself once data has flowed for ${Math.round(cfg.clearAfterDataMs / 60000)} min. B-CRYPTO-FEED-WATCHDOG #1232.`,
        metadata: { recorderKey: this.opts.recorderKey, consecutiveForced: this.consecutiveForced, forcedInLastHour: this.forcedAtMs.length, sharedPause: shared, silentOthers },
        dedupe_key: this.dedupeKey(),
      });
    } catch (err) {
      this.alertRaised = false;
      console.error(`[B74][${this.opts.label}][WATCH] failed to raise the silent-connection alert (will retry next tick):`, err);
    }
  }

  private async resolveSilentAlert(nowMs: number, cfg: RecorderWatchConfig): Promise<void> {
    try {
      const deps = await _alertDeps();
      await deps.resolveByKey(this.dedupeKey(), RECORDER_WATCHDOG_ACTOR, '#1232', 'engine');
      this.alertRaised = false;
      console.log(`[B74][${this.opts.label}][WATCH] data flowing for >= ${Math.round(cfg.clearAfterDataMs / 60000)} min — silent-connection alert resolved`);
    } catch (err) {
      console.error(`[B74][${this.opts.label}][WATCH] failed to resolve the silent-connection alert at ${nowMs}:`, err);
    }
  }

  private async raiseConfigMissing(detail: string): Promise<void> {
    try {
      const deps = await _alertDeps();
      await deps.addAlert({
        triggers_at: new Date(),
        category: 'breakage',
        severity: 'critical',
        title: 'Price recorder watchdog config missing — silence check inert',
        body: `The recorder silence check could not resolve its passive_archive thresholds and is INERT (the socket-close reconnect still works), and the crypto close gate stops grading witnesses it cannot vouch for. Seed the rows, THEN RESOLVE THIS ROW by hand — it has no in-app clear. Detail: ${detail}. B-CRYPTO-FEED-WATCHDOG #1232.`,
        metadata: { recorderKey: this.opts.recorderKey },
        dedupe_key: 'passive-archive-config-missing',
      });
    } catch (err) {
      this.configMissingWarned = false; // a failed write is retried on the next resolve, never lost (Langston Step-4 BLOCKER)
      console.error(`[B74][${this.opts.label}][WATCH] failed to raise the config-missing alert (will retry):`, err);
    }
  }

  /** Stop: no reconnect, no socket. */
  stop(): void {
    this.clearReconnectTimer();
    this.clearSubscribeTimer();
    detachAndTerminate(this.ws);
    this.ws = null;
    _registry.delete(this);
  }
}

let _watchTimer: NodeJS.Timeout | null = null;
/** Start the single watch ticker over every registered connection (idempotent). */
export function startRecorderWatch(): void {
  if (_watchTimer) return;
  _watchTimer = setInterval(() => {
    const now = Date.now();
    for (const c of registeredRecorderConnections()) {
      c.watchTick(now).catch((err) => console.error(`[B74][${c.opts.label}][WATCH] tick failed:`, err));
    }
  }, RECORDER_WATCH_TICK_MS);
  if (typeof (_watchTimer as any).unref === 'function') (_watchTimer as any).unref();
}
/** Test-only. */
export function _resetRecorderRegistryForTests(): void {
  for (const c of [..._registry]) c.stop();
  _registry.clear();
  if (_watchTimer) { clearInterval(_watchTimer); _watchTimer = null; }
}
