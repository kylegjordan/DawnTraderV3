# B-CLASS-LEG-FILL-MODE — Step 3 change list

**Step:** 3 of 11 — implementation

**Approved plan ref:** `91445dd89821730edf7df1cf8dd428f9661f2f7e`

**Review target:** the exact commit containing this file on `migration/b-class-leg-fill-mode`

## Step 4 dispatch header

**DECLARED CHANGE-CLASS:** `architecture`

**STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_CLASS_LEG_FILL_MODE_PRE_AUDIT.md`

| Architecture document-set row | Step-4 state |
|---|---|
| batch `SCOPE` | **present** — `Claude Comms and Packages/Scope Files/B_CLASS_LEG_FILL_MODE_SCOPE.md` |
| batch `PRE_AUDIT` | **present** — `Claude Comms and Packages/Scope Files/B_CLASS_LEG_FILL_MODE_PRE_AUDIT.md` |
| `COMPLETION_REPORT` | **absent** — Step 11 deliverable, not valid before staging verification and governance reconciliation |
| `BATCH_CATALOG.md` | **present; batch-content update due at Step 10** — `1-system-manual/BATCH_CATALOG.md` |
| `PHASE_HISTORY.md` | **present; batch-content update due at Step 10** — `1-system-manual/PHASE_HISTORY.md` |
| `SYSTEM_MANUAL.md` | **present; batch-content update due at Step 10** — `1-system-manual/SYSTEM_MANUAL.md` |
| `SYSTEM_IMPACT_MAP.md` | **present; batch-content update due at Step 10** — `1-system-manual/SYSTEM_IMPACT_MAP.md` |
| `CHANGES_AND_FIXES.md` | **present; applicable batch-content update due at Step 10** — `1-system-manual/CHANGES_AND_FIXES.md` |
| `RUNNING_ISSUES.md` | **present; applicable `#1170` close/update due at Step 10** — `1-system-manual/RUNNING_ISSUES.md` |
| `POST_AUDIT_ROADMAP.md` | **judged N/A** — this pre-sprint item is carried by the active sprint plan, not a roadmap row |
| `DELETED_COMPONENTS_LOG.md` | **judged N/A** — the implementation deletes no component |
| `ADJUSTMENT_FRAMEWORK.md` | **present; applicable configuration-policy update due at Step 10** — `1-system-manual/ADJUSTMENT_FRAMEWORK.md` |
| `PHASE_19_PLAN.md` | **N/A — no row there**; the batch ID is not `P19-*` |
| active plan, `SPRINT_TO_LIVE_PLAN.md` | **present; P1c row update due at Step 10** — `1-system-manual/SPRINT_TO_LIVE_PLAN.md` |
| shared `MEMORY.md` + owner `MEMORY_CC_C.md` + reviewer memory | **present/local owner position updated; final reconciliation due at Step 10** — `.claude/memory/MEMORY.md`, `.claude/memory/MEMORY_CC_C.md`; Coltrane's reviewer-memory handoff is due with governance |
| session task lists | **present; owner list update due at Step 10** — `1-system-manual/CC_C_SESSION_TASK_LIST.md`; CC-A, CC-B, and CC-INFRA lists are `N/A — not mine` |
| Observation column | **applicable, no new hold** — the October/November windows continue under their registered cohort/handoff rules; the completion ledger will record this explicitly |

## Changed

1. Policy and configuration
   - keeps `decideMakerTaker`'s two-arm economics unchanged and applies a typed `maker_only` / `maker_preferred` overlay afterward;
   - preserves the active `0` and VTS `-0.01` admission floors while keeping maker-only strictly positive and subject to the hard floor;
   - seeds and startup-verifies exactly four class/leg policy rows, with missing, invalid, cold, or unsupported values failing closed.

2. Decision and placement provenance
   - snapshots the effective policy beside the chosen arm at signal birth and every RTB refresh, then requires both at promotion instead of inventing a taker default;
   - persists entry policy and one exact maker-placement instant through active/VTS open, rehydrate, closed, API, and raw-export surfaces;
   - derives each new maker deadline from that same captured placement instant.

3. Strict later-quote proof
   - carries local quote-arrival time beside the accepted price: crypto book `bookUpdatedAt`, ticker `sidesCapturedAtMs`, and accepted paper/VTS xStock row `atMs`;
   - leaves the existing venue/receipt freshness stamp and clock basis unchanged;
   - requires `placement < arrival < deadline`, including fill from a pre-deadline arrival processed late, and refuses missing, equal, pre-placement, and at/after-deadline evidence.

4. Legacy, target, and VTS behavior
   - retires legacy pending entries without placement/policy as `legacy_missing_fill_provenance` rather than fabricating history;
   - clears a legacy no-policy target rest while leaving its position open; stops still pre-empt;
   - maker-only target expiry clears and remains open, while maker-preferred retains the existing taker conversion;
   - suppresses maker-only twins and creates a maker-preferred alternate only when that arm independently clears the VTS floor;
   - leaves VTS target rests (`#513`) and `#1073` deletion timing out of scope.

5. Schema and migration
   - adds nullable, no-default policy/placement columns to RTB, active, closed, and VTS records;
   - adds a forward migration, rollback, and manifest entry, with no historical backfill.

## Verification

- focused affected suite: **17 test files, 297 tests passed**;
- TypeScript baseline: **335 current vs 337 baseline, 0 regressions above baseline**; the two lower counts are unrelated existing `partition-exporter.ts` diagnostics and the baseline was not resynced;
- `git diff --check`: clean apart from Git's existing LF/CRLF working-copy notices;
- one broad local Vitest run reached **351 passing files / 4,222 passing tests / 184 skipped**; its remaining 14 failing files were local full-suite prerequisites and repository-wide scanner pollution. All failures attributable to this change were corrected and are included in the final 297-test green run. CI remains the authoritative four-job gate.

## Step 4 round-1 corrections

Coltrane's exact-ref review at `353f8503b2476baa632f5f67c7e29081d99c014d` found three release blockers. The correction commit:

1. preserves the last applied target policy on the active row and passes the snapshotted policy explicitly into the close, covering maker-only expiry followed by a later stop and maker-preferred same-tick conversion;
2. resolves the target policy separately and first, refusing the target action when class, policy, saved rest, or target is unusable; the pre-existing rest-budget/non-TARGET fallbacks remain available only when the valid saved policy is `maker_preferred`;
3. makes the policy-selected EV required and finite at the queue writer and the promotion consumer, removing the promotion-time taker recomputation fallback.

Behavioral coverage now includes both target-expiry policies, policy-controlled target fallback, four invalid selected-EV forms at the queue, and the same four invalid forms at the real ActiveExecutionEngine trade-creation seam. The latter refuses before order placement or trade persistence; the existing promotion claim still removes the RTB row first to preserve its double-activation guard.

REVIEWER: claim-only · identify alternate states consistent with the three Step-4 corrections · HIT (additional target fallthrough states, RTB deletion precedes trade-time EV rejection, ambiguous expiry log) · re-derived yes; target fallthroughs and log corrected, RTB ordering claim narrowed because the pre-open delete is an intentional concurrency guard.

## Review focus

1. Prove the policy overlay never substitutes raw maker EV/fees for adjusted maker EV and cannot be bypassed by exploration.
2. Prove every execution decision/rest consumes a durable snapshot and no missing snapshot becomes taker.
3. Prove accepted price and arrival belong to the same quote while freshness and ordering clocks remain separate.
4. Prove all strict interval boundaries, legacy cuts, stop precedence, target-expiry policies, and twin suppression.
5. Confirm the shadow selection-quality lane remains deliberately unpriced: it creates no maker/taker execution leg, so it must not acquire `chosenEntryMode` and trip the existing lost-friction-input alert. The shared persistence/rehydrate seam carries the new fields whenever a priced VTS creator supplies them.

## Load-bearing diff excerpts

### MODIFIED — policy now overlays the already-priced arms

Before:

```ts
export interface MakerTakerDecisionResult {
  chosenMode: EntryMode;
  chosenNetEV: number;
  takerNetEV: number;
  makerNetEVRaw: number;
  makerNetEVAdjusted: number;
  makerEntryAdvantagePct: number;
  adverseSelectionPct: number;
  nonFillCostPct: number;
  hardFloorFired: boolean;
}
```

After:

```ts
export function applyMakerTakerFillPolicy(
  decision: MakerTakerDecisionResult,
  policy: FillPolicy,
  admissionFloor: number,
): FillPolicyDecision {
  if (policy === 'maker_only') {
    if (decision.hardFloorFired) return { admitted: false, policy, reason: 'hard_floor' };
    if (!(Number.isFinite(decision.makerNetEVAdjusted) && decision.makerNetEVAdjusted > 0)) {
      return { admitted: false, policy, reason: 'maker_not_positive' };
    }
    return { admitted: true, policy, chosenMode: 'maker', chosenNetEV: decision.makerNetEVAdjusted };
  }
```

### MODIFIED — a rest needs a quote that arrived inside its live interval

Before:

```ts
const { side, transactablePrice, limit, nowMs, deadlineMs } = args;
if (transactablePrice != null && tradedThrough(side, transactablePrice, limit)) return 'fill';
if (deadlineMs != null && nowMs >= deadlineMs) return 'drop';
return 'rest';
```

After:

```ts
const { side, transactablePrice, limit, nowMs, deadlineMs, restPlacedAtMs, quoteArrivedAtMs } = args;
const arrivalIsDuringRest =
  restPlacedAtMs != null
  && quoteArrivedAtMs != null
  && Number.isFinite(restPlacedAtMs)
  && Number.isFinite(quoteArrivedAtMs)
  && quoteArrivedAtMs > restPlacedAtMs
  && (deadlineMs == null || quoteArrivedAtMs < deadlineMs);
if (arrivalIsDuringRest && transactablePrice != null && tradedThrough(side, transactablePrice, limit)) return 'fill';
if (deadlineMs != null && nowMs >= deadlineMs) return 'drop';
return 'rest';
```

### MODIFIED — target-rest expiry follows the saved policy

Before:

```ts
if (_restOutcome === 'drop') {
  await storage.updateActiveOpenPosition(this.mode, position.id, {
    exitLimitPrice: null, exitRestPlacedAt: null, exitDeadline: null,
  } as any);
  _exitRestStamp = { restedAtPrice: _exitRestLimit, placedAtMs: _restPlacedAtMs, outcome: 'convert' };
  if (!exitCondition) continue;
}
```

After:

```ts
if (_restOutcome === 'drop') {
  const expiry = decideTargetRestExpiry(_targetPolicy, exitCondition?.type === 'target_hit');
  await storage.updateActiveOpenPosition(this.mode, position.id, {
    exitLimitPrice: null,
    exitRestPlacedAt: null,
    exitDeadline: null,
    targetExitFillPolicy: expiry.preservedPolicy,
  } as any);
  if (!expiry.closeAsTakerNow) continue;
  _exitRestStamp = { restedAtPrice: _exitRestLimit, placedAtMs: _restPlacedAtMs, outcome: 'convert' };
}
```

### MODIFIED — policy resolution fails closed before the legacy budget fallback

Before:

```ts
try {
  const restClass = resolveClass(position) ?? 'crypto_spot';
  restBudgetMs = getRestBudget(restClass);
  targetPolicy = resolveFillPolicy(restClass, 'target_exit');
} catch {
  restBudgetMs = null;
  targetPolicy = null;
}
// Falls through to immediate taker.
```

After:

```ts
const restClass = resolveClass(position);
if (restClass === null) continue;
try {
  targetPolicy = resolveFillPolicy(restClass, 'target_exit');
} catch {
  continue;
}
try {
  restBudgetMs = getRestBudget(restClass);
} catch {
  restBudgetMs = null; // only this pre-existing failure may fall through
}
```

### MODIFIED — queue and promotion require the selected EV

Before:

```ts
chosenNetEv?: number | null;
const chosenNetEv = signal.chosenNetEv != null ? Number(signal.chosenNetEv) : null;
const isTradeable = chosenNetEv != null ? chosenNetEv > 0 : expectancyResult.isTradeable;
const effectiveNetEv = chosenNetEv != null ? chosenNetEv : expectancyResult.netEV;
```

After:

```ts
chosenNetEv: number;
if (!Number.isFinite(input.chosenNetEv)) throw new Error('[SNAPSHOT_INVALID]');
const chosenNetEv = signal.chosenNetEv != null ? Number(signal.chosenNetEv) : null;
if (typeof chosenNetEv !== 'number' || !Number.isFinite(chosenNetEv)) {
  return { opened: false, stage: 'POLICY_SNAPSHOT_MISSING' };
}
const isTradeable = chosenNetEv > 0;
const effectiveNetEv = chosenNetEv;
```

## Explicit non-changes

- no two-arm Net Expectancy, fee, haircut, side-selection, spread, freshness-limit, or clock-basis change;
- no historical policy/timestamp backfill;
- no VTS target-rest lifecycle or real-exchange post-only lifecycle;
- no natural-fill quota, observation window, or deployment freeze;
- `.claude/launch.json` is untouched and excluded.
