Fresh UUID: 812127ba-c480-4414-a199-29f8cc52910f
Read v2 in full. Pre-verification holds — all 8 round-1 items absorbed correctly:

1. Phase 0 procedures: 0.1 / 0.2 / 0.3 each have numbered concrete steps, with split + halt unit tests as hard gates before A.1. ✓
2. B.4→B.5 invariant: line 132 explicit "single coupled-retune unit, NO other batch inserts between." ✓
3. F-NOW storage: `vts_open_trades.calibration_state TEXT`, set at INSERT in `insertOpenTrade()`, propagates on close, aggregator WHERE clause specified. ✓
4. B81 prerequisite checklist: 8 items, 1-3 in-scope vs 4-8 post-launch split called out. ✓
5. Q1 no-pre-emptive-retune marked "load-bearing invariant." ✓
6. Q7 Phase 0 structurally first. ✓
7. Index rebalance: Russell + S&P URLs, `module_constants.equity_calendar.rebalance_dates` jsonb, post-hoc only. ✓
8. No scope expansion vs round-1. ✓

**ACK for final lock + code start.** Two small clarifications to fold inline as you start Phase 0 — not v3-worthy, just edit-in-place:

**(a) F-NOW production flip migration scope (line 199 ambiguity).** "Default value flips to `'production'` via a one-line migration" reads as a column-DDL change, but per line 197 the value is set in application code at INSERT, not by column default. Tighten to: migration changes the constant in `vts-trade-persistence.ts::insertOpenTrade()` (so newly-opened post-Phase-E trades tag as `'production'`) AND issues `UPDATE vts_open_trades SET calibration_state = 'production' WHERE calibration_state = 'pre_calibration_xstock_2026_05'` for any in-flight open trades at migration time. Two-line migration, not one. Otherwise in-flight trades keep their pre_calibration tag through close and get excluded from the very dataset they should populate.

**(b) Crypto-friction-review batch missing from timeline.** B81 checklist item 2 is "in scope for this xStock calibration plan" but doesn't appear in §2 timeline or any phase A-F. Add a half-line note: "Crypto-friction-review is a parallel non-xStock batch slotted into the Phase B window (~3-5 days, runs concurrent with B.4); does not extend critical path." Or whatever sequencing you prefer — just needs to exist somewhere on the timeline.

**(c) DBS backfill depth — soft suggestion only, no fold-in needed if you disagree.** A.2 says "if <14 days available, document explicitly." Consider a hard floor (e.g., "<7 days = A.2 waits for archive maturation") rather than just documenting. Calibration on ~3 days of history is plumbing-validation, not signal — same principle as the workflow invariant. Your call whether to harden now or treat as Phase A reviewer judgment.

(a) and (b) fold in as one-line edits. (c) is judgment. None block lock.

**Plan is locked from my side. Proceed to Phase 0 corporate-actions audit.**
---
UUID captured for paper trail; now running real send:
