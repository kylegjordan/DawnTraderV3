/**
 * ═══════════════════════════════════════════════════════════════════════
 * B-OHLC-FRAME-GUARD (#1028) — what happens to a REJECTED bar: the throttled skip log (plan P4)
 * and the sustained-skip escalation (plan P5)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Kept OUT of `ohlc-frame-validator.ts` so the validator stays import-free and pure; this module
 * holds the state and the side effects. Every export catches its own errors — nothing here may
 * throw into a WebSocket parser or the futures poll loop.
 *
 * ⛔ THE SKIP COUNTERS LIVE IN THE PRODUCERS, AND THEY ARE NEVER RATE-LIMITED (Step-2 condition C2).
 * Only the LOG LINE below is throttled.
 */

import { getCachedConstant } from '../module-constants-service.js';
import { addAlert } from '../system-alerts.js';
import { ALERT_RE_ARM_MS, type ArchiveAssetClass } from './ohlc-batch-writer.js';
import type { OhlcFrameField, OhlcFrameRejectReason } from './ohlc-frame-validator.js';

export type OhlcFrameProducer = 'equity-spot' | 'crypto-spot' | 'kraken-futures';

// ── P4 — THE THROTTLED SKIP LOG ─────────────────────────────────────────────────────────────────

/** At most one line per (producer, assetClass) per window. The value is CHOSEN, not measured: it is
 *  the cadence of the three archivers' existing 60 s health lines, so the two share a clock. */
export const SKIP_LOG_INTERVAL_MS = 60_000;
const _skipLog = new Map<string, { lastAt: number; suppressed: number }>();

function describeSymbol(symbol: unknown): string {
  if (typeof symbol === 'string') return symbol.length > 40 ? `${symbol.slice(0, 40)}…` : symbol;
  return `<${symbol === null ? 'null' : typeof symbol}>`;
}

function logSkip(
  producer: OhlcFrameProducer,
  assetClass: ArchiveAssetClass,
  symbol: unknown,
  field: OhlcFrameField,
  reason: OhlcFrameRejectReason,
  now: number,
): void {
  const key = `${producer}:${assetClass}`;
  const s = _skipLog.get(key);
  if (s && now - s.lastAt < SKIP_LOG_INTERVAL_MS) {
    s.suppressed++;
    return;
  }
  const suppressed = s?.suppressed ?? 0;
  _skipLog.set(key, { lastAt: now, suppressed: 0 });
  // console.warn ⇒ PM2 writes this to error.log, NOT out.log. Read it there.
  console.warn(
    `[B-OHLC-FRAME-GUARD][${producer}][${assetClass}] bar skipped: symbol=${describeSymbol(symbol)} ` +
    `field=${field} reason=${reason} (+${suppressed} suppressed since last line)`,
  );
}

// ── P5 — THE SUSTAINED-SKIP ESCALATION ──────────────────────────────────────────────────────────
// Shape from `_recordPriceSkip` (active-execution-engine.ts): a per-key streak and one alert at the
// threshold. Raise mechanics from `alertPermanentWriteFailure` (ohlc-batch-writer.ts): latch claimed
// synchronously, JSONL `addAlert`, `dedupe_key`, latch RELEASED if the raise fails.

export const OHLC_FRAME_SKIP_ALERT_STREAK_COLD_DEFAULT = 10;
export const OHLC_FRAME_SKIP_ALERT_KNOB = { module: 'passive_archive', constant: 'ohlc_frame_skip_alert_streak' } as const;

interface Streak {
  /** Distinct rejected BARS — a bar is (symbol, intervalBegin). Capped at the threshold. */
  bars: Set<string>;
  lastField: OhlcFrameField;
  lastReason: OhlcFrameRejectReason;
}
/** Key `${assetClass}|${symbol}`; frames with no usable symbol share `${assetClass}|`. Bounded by the
 *  universe plus one entry per class, because an accepted bar deletes its entry. */
const _streaks = new Map<string, Streak>();
const _alertLatch = new Map<ArchiveAssetClass, number>();
let _noIdentitySeq = 0;
let _badKnobWarnedAt = 0;

/**
 * ⛔ A NON-REQUIRED READ WITH A COLD DEFAULT — THE RULED EXCEPTION (Step-2 condition C6, on the
 * `06560c299` precedent in `_recordPriceSkip`). The value cannot be audited before deploy, so it must
 * be retunable without one, and a REQUIRED read is what made B-GOV-HYGIENE OBJ-3 production-down.
 * It is in NO boot-assert list. In production the module is warm: the passive-archive bootstrap
 * prefetches it and the module-constants refresher re-warms every cached module every 60 s, so a
 * retune lands within about a minute. Cold (a test, or a read before the bootstrap), the default
 * stands and the alert still fires.
 */
function resolveStreakThreshold(assetClass: ArchiveAssetClass): number {
  try {
    const v = getCachedConstant<unknown>(OHLC_FRAME_SKIP_ALERT_KNOB.module, OHLC_FRAME_SKIP_ALERT_KNOB.constant, {
      exchange: '*', assetClass, strategy: '*', regime: '*',
    });
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return v;
    if (v !== undefined && Date.now() - _badKnobWarnedAt >= SKIP_LOG_INTERVAL_MS) {
      // A row that is present but unusable is SAID, not silently replaced.
      _badKnobWarnedAt = Date.now();
      console.warn(
        `[B-OHLC-FRAME-GUARD] ${OHLC_FRAME_SKIP_ALERT_KNOB.module}.${OHLC_FRAME_SKIP_ALERT_KNOB.constant} is ` +
        `${JSON.stringify(v)} — not a positive integer; using the cold default ${OHLC_FRAME_SKIP_ALERT_STREAK_COLD_DEFAULT}`,
      );
    }
  } catch {
    // Module not warm. The default below stands; the alert still fires.
  }
  return OHLC_FRAME_SKIP_ALERT_STREAK_COLD_DEFAULT;
}

/** A bar's identity is its minute. A bar whose time is itself invalid has none, so it counts as
 *  distinct every time (pre-audit P5, bounded and stated there). */
function barIdentity(intervalBegin: unknown): string {
  const t = typeof intervalBegin === 'number' || typeof intervalBegin === 'string'
    ? new Date(intervalBegin).getTime()
    : Number.NaN;
  return Number.isFinite(t) ? String(t) : `no-identity#${++_noIdentitySeq}`;
}

function streaksAtOrOver(assetClass: ArchiveAssetClass, threshold: number): Array<{ symbol: string; s: Streak }> {
  const prefix = `${assetClass}|`;
  const out: Array<{ symbol: string; s: Streak }> = [];
  for (const [k, s] of _streaks) {
    if (k.startsWith(prefix) && s.bars.size >= threshold) out.push({ symbol: k.slice(prefix.length), s });
  }
  return out;
}

function raiseSustainedSkipAlert(assetClass: ArchiveAssetClass, threshold: number, now: number): void {
  const last = _alertLatch.get(assetClass);
  if (last != null && now - last < ALERT_RE_ARM_MS) return;
  // ⛔ CLAIM THE LATCH SYNCHRONOUSLY, BEFORE THE FIRST `await` — two frames close together would
  // otherwise both pass the check above and both raise (the race `alertPermanentWriteFailure` closes).
  _alertLatch.set(assetClass, now);

  const over = streaksAtOrOver(assetClass, threshold);
  const listed = over.slice(0, 20)
    .map(({ symbol, s }) => `${symbol || '<no symbol>'} (${s.lastField}: ${s.lastReason})`)
    .join(', ');
  const more = over.length > 20 ? `, and ${over.length - 20} more` : '';

  void (async () => {
    try {
      // addAlert is imported STATICALLY, unlike the writer's precedent: under vitest a second concurrent dynamic
      // import of the mocked module had not settled after 300 ms, holding the latch with no alert and no error
      // (mechanism not established). The equity archiver already imports system-alerts statically.
      await addAlert({
        triggers_at: new Date(now),
        category: 'breakage',
        severity: 'warning',
        title: `OHLC frame guard — sustained bar rejection on ${assetClass}`,
        body:
          `${over.length} symbol(s) on ${assetClass} have had at least ${threshold} consecutive distinct one-minute bars ` +
          `rejected by the OHLC frame guard, with no accepted bar in between, so those minutes are NOT being archived: ` +
          `${listed}${more}. The guard drops only the malformed bar (before it, one such bar dropped its whole ` +
          `1,000-row write chunk or stored a NaN). Every skip is counted in the Passive Archive panel's "skipped" column ` +
          `and logged, throttled, to error.log as [B-OHLC-FRAME-GUARD] lines naming the symbol, field and reason. ` +
          `Suspect a venue field or format change for these symbols first. Route to CC-C (ANALYST Claude), owner of ` +
          `B-OHLC-FRAME-GUARD (#1028). Threshold: ${OHLC_FRAME_SKIP_ALERT_KNOB.module}.${OHLC_FRAME_SKIP_ALERT_KNOB.constant} ` +
          `= ${threshold}, retunable without a deploy.`,
        metadata: {
          assetClass,
          threshold,
          symbolsOverThreshold: over.length,
          symbols: over.slice(0, 20).map(({ symbol, s }) => ({ symbol, field: s.lastField, reason: s.lastReason })),
          source: 'ohlc-frame-skip-tracker',
          issue: '#1028',
          suggested_owner: 'CC-C',
        },
        // One per class. `addAlert` suppresses a second while this one is unresolved; resolving it
        // re-arms the warning rather than muting it for good.
        dedupe_key: `ohlc-frame-skip-sustained-${assetClass}`,
      });
    } catch (err) {
      // ⛔ RELEASE THE CLAIM — the alert never got out. Only our own claim: a newer one stays.
      if (_alertLatch.get(assetClass) === now) _alertLatch.delete(assetClass);
      console.error(
        `[B-OHLC-FRAME-GUARD] ${assetClass} FAILED TO RAISE the sustained-skip alert:`,
        err instanceof Error ? err.message : err,
      );
    }
  })();
}

/** Call for every bar the validator rejects. Logs (throttled), advances the bar's symbol streak,
 *  and raises the class alert at the threshold. Never throws. */
export function noteOhlcFrameRejected(
  producer: OhlcFrameProducer,
  assetClass: ArchiveAssetClass,
  frame: { symbol: unknown; intervalBegin: unknown },
  verdict: { field: OhlcFrameField; reason: OhlcFrameRejectReason },
): void {
  try {
    const now = Date.now();
    logSkip(producer, assetClass, frame.symbol, verdict.field, verdict.reason, now);
    const sym = typeof frame.symbol === 'string' ? frame.symbol : '';
    const key = `${assetClass}|${sym}`;
    let s = _streaks.get(key);
    if (!s) {
      s = { bars: new Set(), lastField: verdict.field, lastReason: verdict.reason };
      _streaks.set(key, s);
    }
    s.lastField = verdict.field;
    s.lastReason = verdict.reason;
    const threshold = resolveStreakThreshold(assetClass);
    // BARS, not frames: the spot legs re-send a minute on every trade and futures re-evaluates a
    // rejected candle every poll, so a re-sent bar must not advance the streak.
    if (s.bars.size < threshold) s.bars.add(barIdentity(frame.intervalBegin));
    if (s.bars.size >= threshold) raiseSustainedSkipAlert(assetClass, threshold, now);
  } catch (err) {
    console.error(
      '[B-OHLC-FRAME-GUARD] skip bookkeeping failed (the bar is still skipped and counted):',
      err instanceof Error ? err.message : err,
    );
  }
}

/** Call for every bar the validator accepts. Resets that symbol's streak and the class's symbol-less
 *  streak; once no symbol in the class is still at the threshold, the latch clears so a genuinely new
 *  fault can raise again (the BLOCKER-11 rule on `alertPermanentWriteFailure`'s latch). Never throws. */
export function noteOhlcFrameAccepted(assetClass: ArchiveAssetClass, symbol: string): void {
  try {
    const cleared = _streaks.delete(`${assetClass}|${symbol}`);
    const clearedAnon = _streaks.delete(`${assetClass}|`);
    if ((cleared || clearedAnon) && _alertLatch.has(assetClass)
      && streaksAtOrOver(assetClass, resolveStreakThreshold(assetClass)).length === 0) {
      _alertLatch.delete(assetClass);
    }
  } catch {
    // Bookkeeping only — the bar is already buffered.
  }
}

// ── Test hooks ──────────────────────────────────────────────────────────────────────────────────
export function _resetOhlcFrameSkipTrackerForTests(): void {
  _skipLog.clear();
  _streaks.clear();
  _alertLatch.clear();
  _noIdentitySeq = 0;
  _badKnobWarnedAt = 0;
}
export function _getOhlcFrameStreakForTests(assetClass: ArchiveAssetClass, symbol: string): number {
  return _streaks.get(`${assetClass}|${symbol}`)?.bars.size ?? 0;
}
export function _isOhlcFrameAlertLatchedForTests(assetClass: ArchiveAssetClass): boolean {
  return _alertLatch.has(assetClass);
}
