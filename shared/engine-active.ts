/**
 * B-LIVE-BANNER-ACTIVE-HOTFIX (#1160, the ACTIVE half; Kyle assigned to CC-B 2026-10-07) — is THIS mode's
 * engine running?
 *
 * `/api/trading/status` returns a MODE-AGNOSTIC `active` (true when ANY engine runs — routes.ts: `active =
 * isActiveEngineRunning || isLiveEngineRunning`) AND the per-mode flags `isEngineActivePaper` /
 * `isEngineActiveLive`. The UI used to answer "is the engine I am looking at running?" with the mode-agnostic
 * field, so the Live Trading page announced "Live Trading Mode … ACTIVE" whenever PAPER ran — while live was
 * stopped (measured 2026-10-06: `isEngineActiveLive:false`, `isEngineActivePaper:true`, `active:true` for both
 * `--mode live` and `--mode paper`). ⇒ A per-mode question gets the per-mode answer, never `active`.
 *
 * Pure, so it is unit-testable and every consumer asks it the same way.
 */
export interface EngineActiveStatus {
  isEngineActivePaper?: boolean;
  isEngineActiveLive?: boolean;
}

/**
 * @param status         the `/api/trading/status` payload (may be undefined before the first fetch)
 * @param mode           the mode being shown
 * @param paperRunning   first-paint fallback for PAPER only: `/api/active-engine/status`'s `isRunning`
 *                       (the paper engine's own endpoint), used until the trading status has loaded
 */
export function isEngineActiveForMode(
  status: EngineActiveStatus | undefined,
  mode: 'paper' | 'live',
  paperRunning?: boolean,
): boolean {
  if (mode === 'live') return status?.isEngineActiveLive === true;
  if (status && typeof status.isEngineActivePaper === 'boolean') return status.isEngineActivePaper;
  return paperRunning === true;
}
