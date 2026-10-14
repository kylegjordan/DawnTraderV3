# CORZ / B-XSTOCK-BAR-AVAILABILITY — review change list

**Author:** ANALYST Codex (CC-C)

**Review type:** investigation finding + full provenance amendment + §9.4 placement; no runtime code

**Original evidence ref:** `483e6f4903a65d6da0c3267790f6083b2cf32be0`

**Provenance-amendment base:** `aa6314b43f44b060f3dda81de49b3e326b74b3f7`

**Review branch:** `migration/corz-provenance`

## Claim to review

The CORZ quote-versus-bars discrepancy is a mixed-clock comparison, not evidence that either price stream was wrong: xStock ticker rows are receipt-stamped, while Kraken's equities OHLC payload arrives about 15–16 minutes after its `interval_begin`. DawnTrader preserves both the label and, on current rows, the receipt clock, but its live and replay consumers generally operate on the label alone.

Rule-24 classification remains outcome (3), with a narrower intent conclusion after the full provenance read: B74 deliberately stored different provenance clocks for a passive sink; B-NEW-34 deliberately consumed the perceived current/forming bar, Kyle explicitly approved that policy in B.3, and B.4 retained it. What was never established was the load-bearing xStock feed premise that the delayed interval label denoted a bar actually current and available on receipt. B79.0m.b first introduced functional live/VTS bar consumption after immediate column repair `4904ea66b`, behind the separate receipt-time ticker gate; B-NEW-34 later removed that gate; F-G-1 added `arrived_at` only for write ordering. The upstream meaning of the Kraken label remains unresolved, so the record forbids a blind +15-minute shift.

## Files

| file | change |
|---|---|
| `Claude Comms and Packages/Scope Files/CORZ_QUOTE_VS_BARS_INVESTIGATION_2026-10-13.md` | Adds the full six-source provenance read, introducing commits, original intent, what each transition added/deleted, the B79-first-consumer correction, canonical no-coverage result with a positive control, and the capture-intent versus downstream-intent distinction. |
| `1-system-manual/RUNNING_ISSUES.md` | Amends `#707` with the complete transition chronology and narrower intent conclusion; its existing §9.4 home is unchanged. |
| `1-system-manual/SPRINT_TO_LIVE_PLAN.md` | Places `B-XSTOCK-BAR-AVAILABILITY` in pre-sprint Stage 3 before `B-CRON-MISSED-CATCHUP`. |
| `Claude Comms and Packages/Scope Files/PRE_SPRINT_SIMULATION_TRUTH_PLAN.md` | Replaces the open CORZ symptom with the bounded conclusion and record pointer. |
| `.claude/memory/MEMORY_CC_C.md` | Carries the provenance conclusion at the existing closed investigation boundary; the placed next batch is unchanged. |

## Review questions

1. Do the raw-wire, actual-arrival, price-pairing, and crypto controls support the mixed-clock mechanism without overclaiming Kraken's upstream semantics?
2. Does the history support the three-way distinction: capture split deliberate; perceived forming-bar consumption deliberate; xStock label→availability equivalence unestablished?
3. Are any live or replay consumers missing from the named blast radius?
4. Is the placed home precise enough: CC-C, Stage 3, after the completed investigation and before `B-CRON-MISSED-CATCHUP`?
5. Does any statement collapse the still-consistent states (late event-time publication, shifted label, or whole-feed delay) into a verdict?
6. Does the transition chronology correctly identify B79.0m.b, not B-NEW-34, as the first live/VTS OHLC consumer and B-NEW-34 as the removal of the separate receipt-time gate?

## Coltrane round-1 correction

At `c6f661e2929cfbfb0e7e65d1241623611f2d0ff7`, Coltrane accepted the mechanism boundary, outcome (3), and placement, but found the consumer census incomplete. This revision adds the route-reachable passive-archive dashboard reader, which compares OHLC `interval_begin` and ticker `captured_at` under one rolling-window cutoff; it is included in `B-XSTOCK-BAR-AVAILABILITY`. It also records the adjacent non-current readers: the AMR context shadow has zero production callers and gains an activation guard in this batch, while the inert freshness monitor remains with existing `#441` and must inherit the settled contract when rebuilt.

## Verification already performed

- Direct equities and crypto WebSocket subscriptions, using the same subscription method.
- Current staging population with actual `arrived_at`: 20,151 xStock bars / 465 symbols versus 11,677 crypto bars / 432 symbols.
- Historical and current price pairing at the label clock versus the receipt/write clock.
- Live decision-provenance age population: 61,940 rows / 414 symbols at 15-minute bars.
- Producer, writer, scanner, aggregator, cache, regime, replay, passive-archive dashboard, calibration, and provenance paths traced at the base ref.
- Adjacent reader census: `computeContextBonusShadow` has only its export definition in production code (positive control finds the passive-archive caller); the freshness-monitor draft is explicitly inert under `#441`.
- The original mechanism claim-only fresh-reader pass; its hit and re-derivation remain recorded at the end of the investigation file.
- `git log -S --reverse` for the original OHLC label pass-through, local ticker stamp, B-NEW-34 freshness-gate removal, and F-G-1 arrival stamp.
- Introducing commits and original scope/pre-audit/design/completion records for B74, B79.0a, B79.0m.b (including its immediate `timestamp_minute` → `interval_begin` repair), B79.0m.b2, B-NEW-34, B-NEW-35, B.4, and F-G-1.
- What-each-change-deleted read: B74 replaced no prior clock/consumer contract; B79 added consumption beneath the gate; B-NEW-34 deleted the direct 1-minute reader and receipt-time gate; B-NEW-35 replaced append-only duplicate writes; B.4 changed cadence only; F-G-1 replaced order-dependent writer behavior without changing readers.
- Six-source coverage: actual code, runtime/database, System Impact Map, System Manual, reports/ledger, and bridge/canonical. Canonical contains the B-NEW-34 xStock OHLC path but no arrival/publication/decision-time contract.
- A second claim-only reader independently found the B.3/Kyle and B.4 forming-bar approvals. The claim was narrowed, then re-derived directly from `B_3_REGIME_AUDIT_REPORT.md`, decision commit `3ee0c0579`, and `B_4_BAR_FREQUENCY_RESULTS_REPORT.md`.

No runtime code, migration, configuration, deployment, or trading state changes in this review.
