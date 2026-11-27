# B-SPREAD-BLOWN-RELEASE-MOVEMENT — #1199 offline comparison

Owner CC-C. Step 3 checkpoints P1 and P2 quote recovery, trailing state and history gaps. Coltrane approved the Step 2 plan at `2a07df59dd5efeda8ada4c5f50f667a5916ff324` on 2026-11-27 at 04:27:00 UTC.

## P1 — Existing historical evidence

The fixed screen comprises 81 of 297 paper xStock closes in the half-open interval 2026-10-16 15:10:55 UTC to 2026-11-04 13:52:36 UTC. The original list of 81 close IDs ordered by close time and ID reproduces MD5 `2587324df620604c1c54d6667a2d53c8`. The screen only finds close rows carrying a first stop-side wide-hold marker.

| Source | Coverage of the 81 screened closes | Recorded evidence |
|---|---:|---|
| `active_trade_logs`, joined by close ID | 81/81, one position per close | The bounded position-keyed read found 81 `position_closed` rows, one per position, between September 1 and November 4 at 14:10 UTC. |
| `exit_decision_archive`, joined by position ID, symbol and within five minutes of each close | 81/81, one archived close per position | The writer stores the position ID as `trade_id` and the archive mode as `paper_sim`. The snapshot has mode, quantity, costs, P&L, price source and pool. It carries no comparator history or per-evaluation state. GIS separately returned one exact matching row from the same join. |
| Saved `bookState` position metadata on the close row | 81/81 latest skip records, 73/81 with a saved wide-only yield, 8/81 without one | The 73 rows contain 1,274 retained wide-only yield entries. Of the 81 closes, 59 hit the writer's 20-yield cap. A position's yield entry does not prove that the shared comparator was present and deleted on that evaluation. |
| Operational logs and sampled quotes | Earliest retained error rotation was November 7, whose daily file starts November 6 under Storage Policy §5.5. November 16 GIS remains a direct positive control for the same log family. | The saved samples can witness quotes. A four-second target sampling cadence leaves intervening exit evaluations unknown. The October 19 retained warm manifest identifies an available partition; it cannot supply missing engine history. |

**Current coverage of the screened closes:** 81 partial, zero fully matched in the checked sources, zero missing all close evidence. Each close has its position and archived exit. For each, the missing grade is a same-process link from its wide hold to the actual comparator deletion, successor seed, validation and exit opportunity on an unbroken evaluation tape. The 53 first-night release log events and the later GIS control stay outside the 81-close screen. CRM remains a recorded ask-only sequence control. GIS remains a short hold with a surviving comparator and a witnessed bid, with no direct linkage from the archive snapshot to the booked fill.

The structured read can reproduce the per-close coverage beginning with this projection. Run through `dt-sql --csv`:

```sql
WITH screened AS (
  SELECT id, symbol, closed_at, metadata
  FROM closed_trades
  WHERE mode = 'paper' AND asset_class = 'xstock_spot'
    AND closed_at >= '2026-10-16T15:10:55Z'
    AND closed_at < '2026-11-04T13:52:36Z'
    AND metadata #>> '{exitRefusal,spreadBlownFirstStopRefusedBid}' IS NOT NULL
)
SELECT s.id, s.symbol, s.closed_at, p.position_id, p.position_count,
       a.archive_count,
       jsonb_typeof(s.metadata #> '{bookState,lastSkip}') = 'object' AS has_last_skip,
       count(y.entry) FILTER (WHERE y.entry->'reasons' = '["spread_blown"]'::jsonb) AS saved_wide_yields,
       count(y.entry) AS saved_yields
FROM screened s
LEFT JOIN LATERAL (
  SELECT max(position_id) AS position_id, count(DISTINCT position_id) AS position_count
  FROM active_trade_logs
  WHERE trade_id = s.id AND event_type = 'position_closed'
) p ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS archive_count
  FROM exit_decision_archive
  WHERE trade_id = p.position_id AND symbol = s.symbol
    AND source = 'active-execution-engine' AND mode = 'paper_sim' AND asset_class = 'xstock_spot'
    AND captured_at BETWEEN s.closed_at - interval '5 minutes' AND s.closed_at + interval '5 minutes'
) a ON true
LEFT JOIN LATERAL jsonb_array_elements(coalesce(s.metadata #> '{bookState,yields}', '[]'::jsonb)) y(entry) ON true
GROUP BY s.id, s.symbol, s.closed_at, s.metadata, p.position_id, p.position_count, a.archive_count
ORDER BY s.closed_at, s.id;
```

## P2 — Paired quote recovery fixtures

`server/tests/unit/b-xstock-bid-trigger-reland-inc2-chain.test.ts` adds nine paired tests through the real exit loop, guard, comparator, selector and hard-stop evaluator. Each arm starts a new engine fixture, warms a fresh comparator on the same tape and runs the identical ordered recovery quotes. A cap-reaching hold must record the position's wide yield and the comparator's actual deletion before starting the paired recovery. The candidate withholds evaluation at the fixture boundary. The close stub captures decision requests. The tape supplies synthetic receipt provenance and 1,500 ms between evaluations. These cases verify decision behavior under controlled inputs. They provide no observed historical fills.

| Tape after the hold | Existing rule | Movement candidate |
|---|---|---|
| Fresh `A → B → A` after clear | Requests a stop on evaluation 3 | Counts 0, 1, 2 through seeding and validation, then requests the same stop on evaluation 3. |
| Fresh `A → B → B`, frozen, ask-only, snapshot, replay and repeat-evaluation cases | Requests a stop on evaluation 3 in each of the six tapes | Holds on evaluation 3 in all six. The ask-only tape counts two pair changes without any bid movement. The snapshot, replay and repeat evaluation add no movement credit. These arms end without a decision at the end of the tape. |
| Fresh `A → B → wide → A → B → A` after clear | Requests a stop on evaluation 4 | Resets movement on the wide evaluation and requests the stop on evaluation 6, 3,000 ms later at the same tested bid relative to the original stop. |
| One wide evaluation with a surviving validated comparator, then `A` | Requests a stop on evaluation 1 | Requests the identical stop on evaluation 1 with zero movement. This protects the short-hold path used as the GIS control. |

Local verification passed **67/67** across the chain, increment A and reseed suites. Three temporary fixture mutations caused the specific assertions to fail: counting only after validation, allowing ask-only movement, and retaining movement across a wide interruption. The checked tests use the restored specification.

### Independent trailing state and incomplete history

`server/tests/unit/b65-tec-parity.test.ts` drives the real trailing evaluator with break-even enabled in the fixture and zero costs. Both arms start with entry 100, stop 95, target 110, ATR 1 and high-water 100. The fixture supplies the admission sequence established above. A repeated recovery quote at bid 101.20 reaches the existing evaluator alone. On this no-close evaluation the existing arm raises its stop to 100 and high-water to 101.20. The candidate records no evaluation and keeps stop 95 and high-water 100. At the next admitted bid of 99.90, the existing arm requests a break-even stop because its bid is 0.10 below its own stop. The candidate's bid is 4.90 above its stop and it remains open. Each arm has its own trade key and clears its trailing state after replay. Each starts with a fresh discontinuity detector for the same symbol.

`server/tests/unit/b-xstock-bid-trigger-reland-inc2-chain.test.ts` supplies the same `A → B → A` sequence with a four-second interval before the final A. Where the interval could contain unobserved decisions or quote changes, both arms stop after recording the first two evaluations and mark the comparison partial. Where the tape certifies no evaluations and unchanged admission state, both arms preserve the one earned move, count the arriving second move and request a stop at evaluation 3, 8,500 ms into recovery. This checks application of a known evidence status. The fixture supplies the status directly and makes no claim about the historical archive.

Local verification passed **101/101** across the four named fixture suites. The assertions detected three forced errors: allowing the unverified interval through, discarding the verified idle duration and updating the candidate's trailing state during a withheld evaluation.

The 81 screened historical closes still supply zero fully matched benefit cases and zero fully matched recovery cases in the checked sources. The grading rule retains the existing release behavior. The remaining P2 protection controls and final evidence disposition go to Coltrane together. The #1191 joint recovery read and #1073/#961 staging gates keep their recorded precedence.
