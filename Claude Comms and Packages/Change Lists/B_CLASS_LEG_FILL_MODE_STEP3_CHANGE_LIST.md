# B-CLASS-LEG-FILL-MODE — Step 3 change list

**Step:** 3 of 11 — implementation

**Approved plan ref:** `91445dd89821730edf7df1cf8dd428f9661f2f7e`

**Review target:** the exact commit containing this file on `migration/b-class-leg-fill-mode`

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

- focused affected suite: **16 test files, 269 tests passed**;
- TypeScript baseline: **335 current vs 337 baseline, 0 regressions above baseline**; the two lower counts are unrelated existing `partition-exporter.ts` diagnostics and the baseline was not resynced;
- `git diff --check`: clean apart from Git's existing LF/CRLF working-copy notices;
- one broad local Vitest run reached **351 passing files / 4,222 passing tests / 184 skipped**; its remaining 14 failing files were local full-suite prerequisites and repository-wide scanner pollution. All failures attributable to this change were corrected and are included in the final 269-test green run. CI remains the authoritative four-job gate.

## Review focus

1. Prove the policy overlay never substitutes raw maker EV/fees for adjusted maker EV and cannot be bypassed by exploration.
2. Prove every execution decision/rest consumes a durable snapshot and no missing snapshot becomes taker.
3. Prove accepted price and arrival belong to the same quote while freshness and ordering clocks remain separate.
4. Prove all strict interval boundaries, legacy cuts, stop precedence, target-expiry policies, and twin suppression.
5. Confirm the shadow selection-quality lane remains deliberately unpriced: it creates no maker/taker execution leg, so it must not acquire `chosenEntryMode` and trip the existing lost-friction-input alert. The shared persistence/rehydrate seam carries the new fields whenever a priced VTS creator supplies them.

## Explicit non-changes

- no two-arm Net Expectancy, fee, haircut, side-selection, spread, freshness-limit, or clock-basis change;
- no historical policy/timestamp backfill;
- no VTS target-rest lifecycle or real-exchange post-only lifecycle;
- no natural-fill quota, observation window, or deployment freeze;
- `.claude/launch.json` is untouched and excluded.
