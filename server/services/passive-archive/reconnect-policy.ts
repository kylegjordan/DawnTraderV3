/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — WebSocket Reconnect Policy (shared helper)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Exponential backoff with cap, used by all 3 archiver services.
 *
 * Capped at b74_ws_reconnect_max_backoff_sec (default 30s) per Langston
 * cc-inbox #867 Q4 + scope §1 Objective 7.
 *
 * Sequence: 1s → 2s → 4s → 8s → 16s → 30s → 30s → 30s ...
 * Reset to 1s on any successful connection (the WS open event resets).
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface BackoffPolicy {
  /** Returns the delay (ms) before the next reconnect attempt. */
  nextDelayMs(): number;
  /** Reset the backoff to its initial value (call on successful connect). */
  reset(): void;
  /** Current attempt count since last reset (for logging). */
  attempts(): number;
}

export function makeBackoff(maxBackoffSec: number = 30): BackoffPolicy {
  let attemptCount = 0;
  return {
    nextDelayMs(): number {
      const exp = Math.min(Math.pow(2, attemptCount), maxBackoffSec);
      attemptCount++;
      return Math.floor(exp * 1000);
    },
    reset(): void {
      attemptCount = 0;
    },
    attempts(): number {
      return attemptCount;
    },
  };
}
