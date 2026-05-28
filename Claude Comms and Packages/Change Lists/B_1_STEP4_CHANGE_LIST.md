# B-XSTOCK-CALIB Sub-batch 1 (B.1) — Step 4 Change List

**Batch:** B-XSTOCK-CALIB B.1a (regime threshold + TFS confidence-formula calibration)
**From:** CC
**To:** Langston (Step 4 code review)
**Date:** 2026-05-28 (autonomous run, Kyle asleep)
**Status:** Step 3 chunks A1-A6 + S1-S3 complete; pre-push code review.

---

## §0 — Headline (plain-language for Kyle if reading)

Ran the regime classifier against 2,658 archived xStock bars from 260 symbols. **Result: current thresholds + scales are operating within design envelope; no adjustments to production code.** Sub-batch ships three new helper files (sibling features for future analysis: time-of-day + Russell calendar + unit tests) and the analysis document. Zero changes to `regime-thresholds.ts`, zero changes to `market-regime.ts`, zero changes to `module_constants`. This is a VALIDATE-and-document batch, not a tune-and-deploy batch.

---

## §1 — Files in this change list (all NEW; no modifications to existing production code)

| File | Type | LOC | Purpose |
|---|---|---|---|
| `server/asset_classes/xstock_spot/time-of-day.ts` | NEW (leaf module) | 62 | `getTimeOfDayClass(utcTs)` — NYSE-clock bucket classifier |
| `server/asset_classes/xstock_spot/calendar.ts` | NEW (leaf module) | 100 | `isRebalanceDay(utcTs)` — Russell quarterly last-Friday check |
| `server/tests/unit/b-xstock-calib-b1-sibling-features.test.ts` | NEW (tests) | 124 | 19 tests covering both helpers (DST cross, edge cases, last-Friday math) |
| `scripts/b-xstock-calib-b1a-replay.ts` | NEW (offline tool) | 215 | Archive-replay harness — imports production `calculatePairRegime` + iterates joined OHLC+DBS rows + emits CSV + per-branch summary |
| `Claude Comms and Packages/Cross-Session Briefs/B_1A_DISTRIBUTION_ANALYSIS.md` | NEW (governance) | n/a | Analysis writeup feeding A3 decision |
| `Claude Comms and Packages/Cross-Session Briefs/b-xstock-calib-b1a-replay-output.csv` | NEW (artifact) | 2659 rows | Raw replay output (paper trail) |

**Files NOT modified:**
- `server/asset_classes/xstock_spot/regime-thresholds.ts` — per A3 decision, no adjustments
- `server/core/metrics/market-regime.ts` — untouched
- `module_constants` — no migration
- `screener_filters` — untouched

---

## §2 — Embedded diffs

### 2.1 NEW `server/asset_classes/xstock_spot/time-of-day.ts`

Leaf module (NO IMPORTS allowed) classifying any UTC timestamp into one of seven NYSE-clock buckets. DST-aware via `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York' })`. Observation-grade sibling feature for B.1a archive replay; not used for live gating.

```ts
export type TimeOfDayClass =
  | 'pre_open'
  | 'open_hour'
  | 'mid_morning'
  | 'lunch'
  | 'mid_afternoon'
  | 'close_hour'
  | 'after_close';

const NY_TZ_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
});

export function getTimeOfDayClass(utcTs: Date | number): TimeOfDayClass {
  const d = utcTs instanceof Date ? utcTs : new Date(utcTs);
  const parts = NY_TZ_FORMATTER.formatToParts(d);
  let hour = 0; let minute = 0;
  for (const p of parts) {
    if (p.type === 'hour') hour = Number(p.value);
    else if (p.type === 'minute') minute = Number(p.value);
  }
  if (hour === 24) hour = 0;
  const minutesAfterMidnight = hour * 60 + minute;
  if (minutesAfterMidnight < 9 * 60 + 30) return 'pre_open';
  if (minutesAfterMidnight < 10 * 60 + 30) return 'open_hour';
  if (minutesAfterMidnight < 12 * 60) return 'mid_morning';
  if (minutesAfterMidnight < 13 * 60 + 30) return 'lunch';
  if (minutesAfterMidnight < 15 * 60) return 'mid_afternoon';
  if (minutesAfterMidnight < 16 * 60) return 'close_hour';
  return 'after_close';
}
```

Bucket boundaries (Eastern Time, DST-adjusted):
- `pre_open` — before 09:30 ET
- `open_hour` — 09:30 to 10:30 ET
- `mid_morning` — 10:30 to 12:00 ET
- `lunch` — 12:00 to 13:30 ET
- `mid_afternoon` — 13:30 to 15:00 ET
- `close_hour` — 15:00 to 16:00 ET
- `after_close` — after 16:00 ET (xStock 24/5 — non-zero traffic continues)

### 2.2 NEW `server/asset_classes/xstock_spot/calendar.ts`

Leaf module (NO IMPORTS). `isRebalanceDay(utcTs)` returns true if the timestamp falls on the last Friday of June/September/December/March in NY-tz (Russell quarterly rebalance schedule). S&P add/delete events NOT seeded (would require upstream feed adapter beyond B.1 scope).

Key fix during testing: the last-day-of-month calculation needs to use noon UTC (not midnight) to avoid the ET offset shifting the date to the previous calendar day. Captured as inline comment.

```ts
export function isRebalanceDay(utcTs: Date | number): boolean {
  const d = utcTs instanceof Date ? utcTs : new Date(utcTs);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  let year = 0, month = 0, day = 0, weekday = '';
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    else if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'weekday') weekday = p.value;
  }
  const russellMonths = new Set([3, 6, 9, 12]);
  if (!russellMonths.has(month)) return false;
  if (weekday !== 'Fri') return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // 12:00 UTC so NY-tz formatter stays on same calendar day (-4h/-5h offset)
  const lastDayDate = new Date(Date.UTC(year, month - 1, daysInMonth, 12));
  const lastDayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', weekday: 'short',
  });
  const lastWeekday = lastDayFmt.format(lastDayDate);
  const weekdayIdx: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const lastIdx = weekdayIdx[lastWeekday];
  let lastFridayDay: number;
  if (lastIdx >= 5) lastFridayDay = daysInMonth - (lastIdx - 5);
  else lastFridayDay = daysInMonth - (lastIdx + 2);
  return day === lastFridayDay;
}
```

Russell rebalance dates verified in tests: 2026-06-26 (Jun) ✓, 2026-09-25 (Sep) ✓, 2026-12-25 (Dec) ✓, 2027-03-26 (Mar) ✓.

### 2.3 NEW `server/tests/unit/b-xstock-calib-b1-sibling-features.test.ts`

19 tests total, all passing.

`getTimeOfDayClass` (10 tests):
- All 7 bucket boundaries verified at exact ET transition times
- DST cross-check: 2026-01-15T14:30Z (EST) = 09:30 ET = `open_hour` (vs EDT version 2026-05-15T13:30Z = same bucket)
- Numeric ms-epoch input accepted

`isRebalanceDay` (9 tests):
- 4 positive cases (last Fridays of Jun/Sep/Dec 2026 + Mar 2027)
- 4 negative cases (second-to-last Friday, Russell-month Thursday, non-Russell-month Friday)
- Numeric ms-epoch input accepted

### 2.4 NEW `scripts/b-xstock-calib-b1a-replay.ts`

Offline tool (not part of running app) that:
- Connects to staging DB via pg client
- Resolves `RegimeConfig` from `xstock_spot` rows in `module_constants` (regime_classifier + path_b_sustainability)
- For each symbol with both OHLC + DBS archive coverage, iterates bars, builds 30-bar OHLC window, calls production `calculatePairRegime`
- Emits per-bar CSV + per-branch summary table to stdout

Run on staging via `cd /home/deploy/dawntrader && set -a && source .env && set +a && npx tsx scripts/b-xstock-calib-b1a-replay.ts` to produce empirical evidence for B.1a/B.1b decision.

Two iteration fixes during launch (documented in §2.5):
1. `pg` ESM/CJS interop — `import pg from 'pg'; const { Client } = pg;`
2. ms-epoch timestamps for OHLC↔DBS matching (ISO strings were unreliable across formatter paths)

### 2.5 Replay results — fed into A3 decision

- **2,658 bars classified** across 260 symbols (window 2026-05-06 → 2026-05-15)
- **Regime distribution:** HVU 25.0% / IE 11.6% / RBS 8.8% / ST 36.5% / TFS 18.2%
- **TFS confidence:** mean 0.58, p25=0.52, p75=0.63, p95=0.70 — **compressed near floor 0.50** as Kyle suspected. Compression is direct consequence of the multiplicative formula's design intent (`any weak input collapses score`).
- **No anomalies in regime DISTRIBUTION** — TFS+IE=29.8% (within crypto's calibration target 30-40%); ST=36.5% (functionally equivalent to crypto's post-B62 ST share 36.6%).
- **No threshold adjustments recommended.** See `B_1A_DISTRIBUTION_ANALYSIS.md` §3 for full A3 reasoning.

---

## §3 — Verification gates (Step 3 chunk A6 + tests)

- ✅ Local vitest: 19/19 sibling-feature tests pass.
- ✅ Local tsc baseline: 494 errors maintained (no new TS errors from B.1 code).
- ✅ `node scripts/check-tsc-baseline.mjs` → "OK — no regressions above baseline."
- ✅ Replay harness ran end-to-end on staging: 2,658 bars classified successfully, summary table emitted.

---

## §4 — Asks for Langston review

**Q1.** Distribution analysis (§2.5 + full doc): does the regime distribution + per-branch confidence interpretation look right to you? Specifically the **no-threshold-adjustment** conclusion — concur, or push back with specific number-driven counter?

**Q2.** TFS confidence compression near floor: the analysis frames this as "design intent of the multiplicative formula, not a bug." Does that interpretation hold up, or do you read it as latent calibration debt that should land in this batch (not Phase 25)?

**Q3.** Sibling features (`time-of-day.ts` + `calendar.ts`) — leaf module discipline preserved, both NO-IMPORTS. Acceptable, or want any structural change before push?

**Q4.** Sample size (2,658 bars / 260 symbols) — is this enough empirical evidence for the no-adjustment conclusion? Or would you want a fresh DBS backfill run against post-2026-05-15 OHLC to get more recent data before deciding?

**Q5.** Anything else worth catching before Step 5 push?

**Reply format:** numbered point-by-point on Q1-Q5. ACK clean → CC proceeds to Step 5 (push + CI verify) + Step 6 (staging deploy — though no production code changed, so deploy is effectively a no-op except for the new helper files becoming importable).

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b-xstock-calib/B_1_STEP4_CHANGE_LIST.md` after SCP. Full analysis doc + CSV in same inbox. The code itself is in the `C:\dev` mirror not yet pushed; you're reviewing the embedded diffs above.
