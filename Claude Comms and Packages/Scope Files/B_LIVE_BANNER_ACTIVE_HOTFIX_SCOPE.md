# B-LIVE-BANNER-ACTIVE-HOTFIX — SCOPE (hotfix path)

change-class: hotfix

**Issue:** `#1160` — the ACTIVE half (Kyle assigned it to CC-B 2026-10-07; traced by CC-INFRA). The view-DEFAULT half (a fresh browser opens on the live view) stays Kyle's decision and is NOT in this hotfix.
**Owner:** CC-B · **Plan row:** `SPRINT_TO_LIVE_PLAN` 2a0h (rides the 2026-10-07 deploy).

## §1 — The qualifying test (all three)
1. **Broken now — false information in the UI.** The Live Trading page's banner reads *"Live Trading Mode • Real capital at risk | ACTIVE"* while the live engine is stopped and only paper runs. Measured (CC-INFRA, staging 2026-10-06/07): `GET /api/trading/status` with `--mode live` and `--mode paper` both return `isEngineActiveLive: false`, `isEngineActivePaper: true`, `currentMode: paper`, **`active: true`** (mode-agnostic: `routes.ts` sets `active = isActiveEngineRunning || isLiveEngineRunning`).
2. **Waiting causes real harm.** The operator is told live trading with real capital is running when it is not — on the page whose whole job is to say whether it is — weeks before the live launch; and the agents that read the UI as evidence (Langston, Coltrane) are told the same. Kyle assigned it on report.
3. **Blast radius small and proven** — §2: display only, one hook and three components; no server, engine, trading or data change.

## §2 — Blast-radius audit (path B: the error turned up on its own)
1. **Mechanism (read):** `ModeBanner` (`client/src/components/mode-banner.tsx`, rendered on the Live page by `mode-trading.tsx:99`) showed `useTrading().isTradingActive`, which was `tradingStatus.active` whenever it is a boolean (`use-trading.tsx:322-325`); `isTradingActiveLive` / `isTradingActivePaper` went through `deriveIsActive`, which ALSO returned `state.active` first and reached the per-mode flags only as a fallback.
2. **Census at the component** — every client read of the active state (`grep` over `client/src` for `isTradingActive*`, `deriveIsActive`, `isEngineActive*`, `tradingStatus?.active`):
   | site | read | defect? |
   |---|---|---|
   | `mode-banner.tsx` | `isTradingActive` for the mode shown | **yes** — the reported bug (paper or live view) |
   | `paper-trading-controls.tsx` | `isTradingActive` for the PAPER start/stop toggle | **yes, same class** — would read ACTIVE if only live ran |
   | `filter-health-widget.tsx` | `mode === 'paper' && active` | **yes, same class** |
   | `top-bar.tsx:144` | `isEngineActivePaper \|\| activeEngineStatus.isRunning` | no — already per-mode |
   `isTradingActive` had no other consumer; `isTradingActiveLive` had none at all.
3. **Other sites with the same defect:** the three above — all fixed here (the class, not the instance).
4. **State written / readers:** none — pure display; the server payload is unchanged.
5. **Larger design fault?** Partly: the server sends a mode-agnostic `active` that invites this. It stays (other consumers may use "any engine running"), and the client's per-mode questions now never read it. The view-default question is the separate half Kyle owns.

## §2.3 — Ledger
`#1160` (this). No prior decision to show the mode-agnostic flag per mode (`Phase 32.D-Fix.Final` / `Phase 41.2` comments chose one "authoritative" flag when only one engine could run).

## §2.4 — The fix
- NEW `shared/engine-active.ts`: `isEngineActiveForMode(status, mode, paperRunning?)` — live ⇒ `isEngineActiveLive === true`; paper ⇒ `isEngineActivePaper` once loaded, else the paper engine endpoint's `isRunning` (first paint). Pure.
- `use-trading.tsx`: `isTradingActivePaper` / `isTradingActiveLive` from it; `deriveIsActive` and the mode-agnostic `isTradingActive` REMOVED from the hook's return.
- `mode-banner.tsx`: `mode === 'live' ? isTradingActiveLive : isTradingActivePaper`.
- `paper-trading-controls.tsx`: `isTradingActivePaper`.
- `filter-health-widget.tsx`: `isEngineActiveForMode(tradingStatus, 'paper')` (its local type gains `isEngineActivePaper?`).
- Tests: `server/tests/unit/b-live-banner-active-hotfix.test.ts` (8) — the measured case (paper on, live off ⇒ live STOPPED), live-only, none, first paint, loaded-wins; fences on the three sites. Against the pre-fix client code the three fences fail.

## §4 — Verify once (after deploy)
In Claude-in-Chrome on staging: the Live Trading page banner reads **STOPPED** while paper runs; the Paper page banner reads **ACTIVE**; the paper start/stop toggle shows running. Same instrument that showed it present (the banner itself).
