# B-5 Step-9 iteration review — AMR weather UI panel (commit 38b4d7343, NOT yet pushed)

**From:** Claude Code · **To:** Langston · **Date:** 2026-06-11
**Review type:** Step-4-style diff review of an in-batch iteration (Kyle directive 2026-06-11: AMR needs a visible UI display with per-classification plain-language descriptions). Push gated on your APPROVE.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. All load-bearing diff is EMBEDDED below. For anything beyond it, use `ssh staging 'cd /home/deploy/dawntrader && git ...'` — note staging does NOT have this commit yet (it is local-only pending your review).

## What Kyle asked for (verbatim intent)
A tab/page where AMR statuses and scores show up, PLUS "some sort of description for what the weather report is telling me... one for xStocks and one for crypto... if it's saying calm and idle, what does that mean? What should I expect... if the adaptive functionality was turned on... What do we expect to see happening to pairs?" Behavior IS defined (seeded dials), so descriptions include it.

## Scope of the diff (2 files, +375/−2)

### 1. server/routes.ts — /api/diagnostics/amr/current gains a `dials` block (+24 lines)

The endpoint already served `{flag, report, mode}` per class. It now also serves, per class, the live DB-governed dial values for all four modes, read via the existing B-5 accessors:

```ts
const { getModeOverlayForClass, getSlotCapForMode } = await import('./core/governance/strategy-modes.js');
...
let dials: Record<string, unknown> | null = null;
try {
  dials = {};
  for (const mode of ['NORMAL', 'AGGRESSIVE', 'DEFENSIVE', 'SURVIVAL'] as const) {
    const o = getModeOverlayForClass(mode, klass);
    dials[mode] = {
      positionSizeMultiplier: o.positionSizeMultiplier,
      stopLossDistanceMultiplier: o.stopLossDistanceMultiplier,
      takeProfitDistanceMultiplier: o.takeProfitDistanceMultiplier,
      entryCooldownMultiplier: o.entryCooldownMultiplier,
      slotCap: getSlotCapForMode(mode, klass),
    };
  }
} catch (dialErr: any) {
  console.warn(`[B-5][AMR] diagnostics dial read failed for ${klass}: ${dialErr?.message}`);
  dials = null;
}
byClass[klass] = { flag, report: r, mode: getCurrentModeForClass(klass), dials };
```

**JUDGMENT CALL J1 (design rationale):** the UI's plain-language behavior descriptions are TEMPLATED from these live values — so a future retune of any dial automatically updates the user-facing copy. The alternative (hardcoding "60% size, 1.2x stops..." in the React component) drifts silently on the first retune; rejected per the DB-governed-knobs discipline.

**JUDGMENT CALL J2 (fail-soft for dials only):** a dial-read throw blanks `dials` (UI shows "Response dial values unavailable") instead of 500-ing the whole endpoint. Rationale: this is read-only diagnostics; the fail-hard contract on missing seeds is already enforced where it matters (B-5 boot assertion + the active-path accessors). A diagnostics page that goes fully blank because ONE dial row is missing would hide the weather data Kyle needs to see exactly when something is wrong. NOTE the asymmetry is explicit: the weather/flag/mode read keeps its existing behavior (top-level try → 500), only the dial enrichment is fail-soft.

### 2. client/src/pages/analytics.tsx — AmrWeatherSection (+353 lines, one new section at top of Overview tab)

Structure (full code in repo at commit 38b4d7343; key logic embedded):

- **Query:** `useQuery` on `/api/diagnostics/amr/current?t=Date.now()` via the authenticated `apiFetch`, `refetchInterval: 30_000` (matches the weather cycle cadence), `staleTime: 0`.
- **Layout:** section header + two cards in `md:grid-cols-2` (Crypto / xStock), placed ABOVE MarketOverviewSection in the Overview tab.

Per-card content:
- Classification badge (CALM green / CHOPPY amber / STORMY red / FAVORABLE emerald / IDLE gray + weather icons Sun/CloudDrizzle/CloudLightning/Sparkles/PauseCircle), continuousScore as `0.xxx` + a 0-1 width bar, flag badge (SHADOW blue / ACTIVE green / DISABLED gray / unresolved red), mode line ("Would run DEFENSIVE" in shadow vs "Running DEFENSIVE" in active vs "Holding prior posture" when resolvedMode null).
- **Plain-language description block** — current classification's market meaning + would-do behavior:

```ts
function amrWouldDo(c: AmrClassification, dials: Record<AmrMode, AmrDialSet> | null): string {
  if (c === 'IDLE') return 'No posture decision is made: the system holds, then re-seeds carefully when readings resume — by design it can never wake directly into the aggressive stance.';
  const d = dials?.[AMR_MODE_BY_CLASSIFICATION[c]];
  if (!d) return 'Response dial values unavailable.';
  switch (c) {
    case 'CALM': return `Trade as standard: full position size, normal stop and target distances, normal re-entry waits, up to ${d.slotCap} open positions.`;
    case 'CHOPPY': return `Get defensive: position sizes cut to ${fmtAmrPct(d.positionSizeMultiplier)} of normal, stops widened to ${fmtAmrX(d.stopLossDistanceMultiplier)} (whipsaw protection), profit targets pulled in to ${fmtAmrX(d.takeProfitDistanceMultiplier)}, re-entry waits ${fmtAmrX(d.entryCooldownMultiplier)} longer, at most ${d.slotCap} open positions.`;
    case 'STORMY': return `Survival posture: sizes drop to ${fmtAmrPct(d.positionSizeMultiplier)} of normal, stops widen to ${fmtAmrX(d.stopLossDistanceMultiplier)}, targets tighten to ${fmtAmrX(d.takeProfitDistanceMultiplier)}, re-entry waits stretch to ${fmtAmrX(d.entryCooldownMultiplier)}, and only ${d.slotCap} positions may be open — expect very few new trades.`;
    case 'FAVORABLE': return `Press the edge: position sizes increase to ${fmtAmrX(d.positionSizeMultiplier)}, profit targets stretch to ${fmtAmrX(d.takeProfitDistanceMultiplier)}, re-entries speed up (${fmtAmrX(d.entryCooldownMultiplier)} wait), up to ${d.slotCap} open positions. The signal-quality bar does NOT drop — same standards, pressed harder.`;
  }
}
```

Market-meaning copy is per-class-aware: STORMY for xStock carries "this is also the designed overnight read: spreads run far wider outside US market hours" (the session-bimodal threshold design, proven live last night); IDLE for xStock = weekend/warming vs crypto = warming-only.

- **Health chips** — one per sentinel reading (Regime vote / Friction / DBS / Macro) with raw value inline (votePct is regimePercentage 0-100 so `toFixed(0)%` is scale-correct; friction shows n=; macro shows |z|) and a severity-ordered dot:

```ts
function amrHealthChipState(h: AmrHealthReading): { dot: string; note: string } {
  if (h.quarantined || !h.inBounds) return { dot: 'bg-red-500', note: 'Quarantined — reading outside plausibility rails, never consumed' };
  if (h.varying === false) return { dot: 'bg-red-500', note: 'Stuck value — feed may be frozen' };
  if (h.crossConsistent === false) return { dot: 'bg-red-500', note: 'Second source disagrees — divergence alert open' };
  if (!h.fresh) return { dot: 'bg-amber-500', note: h.detail ? `No fresh reading (${h.detail})` : 'No fresh reading' };
  if (h.varying === null) return { dot: 'bg-gray-400', note: 'Healthy — variance check still warming' };
  return { dot: 'bg-green-500', note: 'Healthy' };
}
```

- **Triggers** (cyan, Zap icon) + **staleness** (amber, AlertTriangle) lists when non-empty.
- **Collapsible legend** "What each weather reading means for {class}" — ALL FIVE classifications, each with mode mapping + market meaning + dial-templated would-do; the CURRENT one highlighted. This is Kyle's "what does calm/choppy/stormy/favorable/idle mean" ask, answered per class.
- **Flag note footer** — shadow: "the weather is computed and recorded every 30 seconds, but nothing is applied to trading yet. The panel shows what the system WOULD be doing." (the 9.1-style inertness disclaimer, on the panel itself).

**JUDGMENT CALL J3:** disabled flag or null report → honest empty-state copy ("Off — no weather is computed" / "First weather cycle pending"), never fabricated values.

**JUDGMENT CALL J4:** the panel reads `report.resolvedMode ?? block.mode` — resolvedMode is the cycle's dwell/ladder-applied output; block.mode (getCurrentModeForClass) is the held posture; preferring resolvedMode with held-mode fallback matches the aggregator's own precedence.

## Bench evidence
- `node scripts/check-tsc-baseline.mjs`: **OK — no regressions** (474 current vs 494 baseline; 5 counts BELOW baseline are unrelated upstream fixes already in origin).
- `npx vitest run`: 12 failures across 11 files — **proven pre-existing**: the IDENTICAL 11-file set was re-run on a CLEAN checkout (both changed files reverted) → identical 12 failures. These are the known bench-environment failures (DB/env-gated); CI runs them green (all-4-green at 361544bca, runs 27353067465/27353959344). My diff adds ZERO new failures.

## Ask
APPROVE / REVISE on the diff + explicit verdicts on J1-J4. On APPROVE: push → CI all-4-green → deploy → §9.3 Claude-in-Chrome verification of the rendered panel (which also becomes part of your Step-8 second-pass surface).
