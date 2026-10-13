# CORZ / B-XSTOCK-BAR-AVAILABILITY — review change list

**Author:** ANALYST Codex (CC-C)

**Review type:** investigation finding + §9.4 placement; no runtime code

**Base ref:** `483e6f4903a65d6da0c3267790f6083b2cf32be0`

**Review branch:** `migration/corz-bar-availability-investigation`

## Claim to review

The CORZ quote-versus-bars discrepancy is a mixed-clock comparison, not evidence that either price stream was wrong: xStock ticker rows are receipt-stamped, while Kraken's equities OHLC payload arrives about 15–16 minutes after its `interval_begin`. DawnTrader preserves both the label and, on current rows, the receipt clock, but its live and replay consumers generally operate on the label alone.

Rule-24 classification is outcome (3): the B74 raw sink works as designed, but its later promotion to live/replay source did not add an availability contract. The upstream meaning of the Kraken label remains unresolved, so the record forbids a blind +15-minute shift.

## Files

| file | change |
|---|---|
| `Claude Comms and Packages/Scope Files/CORZ_QUOTE_VS_BARS_INVESTIGATION_2026-10-13.md` | New evidence record: CORZ reproduction, actual-arrival and crypto controls, raw-wire control, consumer/provenance census, history, competing states, taxonomy, and next-batch boundary. |
| `1-system-manual/RUNNING_ISSUES.md` | Adds CC-C issue `#707` with the finding and explicit §9.4 home. |
| `1-system-manual/SPRINT_TO_LIVE_PLAN.md` | Places `B-XSTOCK-BAR-AVAILABILITY` in pre-sprint Stage 3 before `B-CRON-MISSED-CATCHUP`. |
| `Claude Comms and Packages/Scope Files/PRE_SPRINT_SIMULATION_TRUTH_PLAN.md` | Replaces the open CORZ symptom with the bounded conclusion and record pointer. |
| `.claude/memory/MEMORY_CC_C.md` | Updates the position boundary: CORZ investigation closed; new batch placed before the cron batch. |

## Review questions

1. Do the raw-wire, actual-arrival, price-pairing, and crypto controls support the mixed-clock mechanism without overclaiming Kraken's upstream semantics?
2. Does outcome (3) correctly distinguish the sink-only B74 intent from the later live/replay use?
3. Are any live or replay consumers missing from the named blast radius?
4. Is the placed home precise enough: CC-C, Stage 3, after the completed investigation and before `B-CRON-MISSED-CATCHUP`?
5. Does any statement collapse the still-consistent states (late event-time publication, shifted label, or whole-feed delay) into a verdict?

## Verification already performed

- Direct equities and crypto WebSocket subscriptions, using the same subscription method.
- Current staging population with actual `arrived_at`: 20,151 xStock bars / 465 symbols versus 11,677 crypto bars / 432 symbols.
- Historical and current price pairing at the label clock versus the receipt/write clock.
- Live decision-provenance age population: 61,940 rows / 414 symbols at 15-minute bars.
- Producer, writer, scanner, aggregator, cache, regime, replay, calibration, and provenance paths traced at the base ref.
- One required claim-only fresh-reader pass; its hit and the re-derivation are recorded at the end of the investigation file.

No runtime code, migration, configuration, deployment, or trading state changes in this review.
