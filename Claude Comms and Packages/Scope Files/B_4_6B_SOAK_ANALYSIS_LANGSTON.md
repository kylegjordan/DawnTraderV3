# B-4.6-B chunk-A 24h soak analysis — Langston

**Alert:** 394711c9-f675-454c-a4e6-4e5b2f44a056 (category b46b_soak_analysis)
**Instrument deploy:** 3bc16efdb
**Data window analyzed:** 2026-06-11 01:17:08Z → 19:14:27Z (1,076 one-minute intervals).

## Window caveat (finding 0)
No `[4.6B]` METRIC lines exist before 2026-06-11 01:17Z and there are no rotated logs (`out.log.1`/`.2.gz` absent). Deploy was 06-10 ~18:14Z but metric emission began at 01:17Z — consistent with a process restart ~01:17Z (the B-4.7 R2 alert independently references a regime occurrence post 2026-06-11T01:03Z). Net: ~18h of clean soak data, not 24h. Sufficient sample (1,076 intervals), but the "24h" label is inaccurate — log it.

## Event-loop delay (ELD) distribution
- **p99_ms across intervals:** min=12.3 / median=15.3 / p95=22.0 / max=27.8 — steady-state loop health is fine.
- **max_ms across intervals:** min=183.9 / median=276.3 / p95=391.4 / p99=469.2 / **max=704.1**
- **1,073 of 1,076 intervals had max_ms > 200ms; all 1,076 > 100ms.**

Interpretation: low p99 + high max every single interval = a **periodic once-per-cycle blocking spike of 200–700ms**, not continuous load. Textbook starvation signature.

## Segment profile (SEG), full window
| segment | total_spans | total_sum_ms | max_span_ms |
|---|---|---|---|
| crypto_prefetch_batch | 70,364 | 299,929 | **95.06** |
| crypto_prefetch_pair | 652,120 | 299,929 | **72.07** |
| xstock_eval | 106,235 | 12,456 | 32.08 |
| vts_eval | 130,532 | 39,171 | 25.50 |

## Hot-segment finding (decision rule)
Pre-audit rule: *single-pair max_span materially over 20–25ms = its own finding before chunk B ships.*
- **crypto_prefetch_pair single-span max = 72ms** and **crypto_prefetch_batch = 95ms** — both materially over 20–25ms. These are their own findings (Finding 1).
- xstock_eval (32ms) and vts_eval (25.5ms) are marginally over — secondary.

**Root cause of the 200–700ms ELD spike:** crypto_prefetch is the proven hot path. It sums ~300,000ms over the window (~278ms/min) across ~652k per-pair spans (~600 pairs/cycle) that run **contiguously without yielding**. No single span hits 700ms, so the spike is the *cumulative back-to-back run* of the per-pair prefetch loop blocking the loop per scan cycle. This matches the chunk-B hypothesis exactly.

## Cron-miss cross-check
06-09 misses (`awareness_state_update_cron` 13:00Z, `awareness_reflection_cron` 18:00Z) predate this instrument window so no direct timestamp correlation is possible here — but the signature (top-of-hour fire starved by a blocked loop, same PID, self-clears) is consistent with this prefetch block. Matches my MEMORY note proj_cron_eventloop_misses. Treat as same-family, not coincidence.

## Gate decision: chunk-B PROCEED
The chunk-B design — elapsed-time yields, ~20ms trigger, pair/batch boundaries only, targeting crypto_prefetch — is correctly aimed at the proven hot segment and will break the contiguous block into <20ms slices. **Approved to proceed**, with two caveats:
1. The yield fires at the boundary *after* a pair completes, so a single 72ms pair still blocks 72ms even post-fix. The yields fix the cumulative block (the 700ms → ~20ms win); they do NOT fix the rare single-pair outlier. That residual single-pair work is a separate, smaller follow-up — not a chunk-B blocker.
2. Re-confirm post-deploy that max_ms drops below ~50ms/interval before closing chunk-B.
