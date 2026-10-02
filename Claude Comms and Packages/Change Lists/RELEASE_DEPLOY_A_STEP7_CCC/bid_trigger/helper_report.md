# Step-7 harvest — B-XSTOCK-BID-TRIGGER-RELAND increment 1 (row 3n.q7), deploy A

Read-only. Deployed sha ea456ad40936b1fbde463e43e473d3ff11432ba0 (confirmed: staging `git rev-parse HEAD`). PM2 process start 2026-10-02T20:37:49Z.
Window: 2026-10-02 20:37:49Z -> 20:44:52Z (~7 min; all of it before the xStock weekend boundary 2026-10-03T00:00Z, which is ~3h15m after the window end).
Format source: `server/services/xstock-exit-frame-log.ts` AT ea456ad40 (no trail/ret/tb fields; those are inc-2, not deployed) + `active-execution-engine.ts:2811,2827,3117-3124` at ea456ad40.
Population: 1 open xStock position (MGM/USD, fe42f52a…, opened 18:55:39Z) + 5 crypto (read-only SQL on active_open_positions).

| check | object / window | positive control | reading | grade |
|---|---|---|---|---|
| C1 reconcile | `EVAL_EXIT xsFrames=e/i`, out.log, 279 cycles | `xsFrames=` absent before 20:37:54 (new binary only); 120 cycles show 1/1 | 279/279 e==i; 0 RECONCILE_BROKEN; Σe=120=Σi=120=XS_FRAME lines in error.log; i equals `noTriggerByClass xstock` denominator every cycle | PASS (drift detector only) |
| C2 frame=none carries reason | XS_FRAME lines | 120 lines parsed, 120 `frame=ok basis=raw_guarded` | 0 frame=none lines => criterion vacuous | INCONCLUSIVE (n=0) |
| C3 first real line bytes | first XS_FRAME 20:38:03Z | — | 213 B message (241 B with PM2 prefix); all 120 identical length | PASS (< 375 B) |
| C4 error.log daily | pm2-logrotate + /var/log/dawntrader | 12 daily `error__*` files 09-21..10-02, 65-93 MB each | rotateInterval `0 0 * * *`, max_size 1G, retain 14 unchanged; error.log 70.7 MB at 20:43Z; instrument adds ~0.6 MB/h per evaluated xStock position | PASS on precondition; the confirming rotation is due 00:00Z |

Fence positive control: a synthetic `XS_FRAME_RECONCILE_BROKEN` line matched the same grep (1). Also 0 `EVAL_PARTITION_BROKEN` in the window.

## Counts
- XS_FRAME lines: 120 (all MGM/USD, all frame=ok basis=raw_guarded, 0 class_mismatch, bidWouldFire=no 120, markExit=n/exitReason=none 120).
- Byte length (message from `[3n.q7]`): min 213 / median 213 / max 213. Full line incl. PM2 timestamp: 241/241/241.
- EVAL_EXIT xsFrames lines: 279; reconcile 279, not 0; cycles with 0/0: 159; xsFrameClassMismatch sum 0.
- frame=none reasons: none observed.

## Coverage note (not a defect — the fence is not coverage)
MGM was evaluated in 120 of 279 cycles. The other 159: 153 carry `[P19-B8.5e][EQUITY_MARK] MGM/USD: mark is Ns old, ceiling 82s … not actionable this tick` (the row `continue`s before the evaluator, as the pre-audit's P3 states), and 6 are the first cycles after restart (20:37:54-20:38:02) before MGM had a price (withoutPrice=1). Those ticks are outside the XS_FRAME population by construction — xsFrames reconciles 0/0 on them.

## Limits
7 minutes, one position, one symbol, only the guarded arm. Nothing about frame=none, unguarded arms, class_mismatch, or long-line cases has been exercised live. Re-harvest after Sunday's open for a real sample.

Extracts: s7_xsframe.txt (120), s7_evalexit.txt (279), s7_broken.txt (empty), summary.json, harvest.py, q.sql.
