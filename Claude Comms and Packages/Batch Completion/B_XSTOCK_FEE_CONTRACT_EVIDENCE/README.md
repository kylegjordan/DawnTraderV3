# B-XSTOCK-FEE-CONTRACT — the queries behind the fee-window read

Copied here on 2026-09-30 from CC-B's session scratchpad, so that the verdict of record can be re-run by anyone at a ref. These are the files the **2026-09-29 interim read** used, byte for byte. Read-only; they run on staging with the env sourced (`psql -X -f <file>`).

| file | what it reads |
|---|---|
| `p8_q1.sql` … `p8_q5.sql`, `p8_fine.sql` | P8, the maker-share prediction: population per segment, the r-ratio join, the positive control, the classes |
| `armb_read.sql`, `armb_read2.sql`, `armb_fine.sql` | Arm B, EV-gate admission per segment (first reader) |
| `rv_armb_probe_7c1.sql`, `rv_armb_main_7c2.sql`, `rv_armb_hod_7c3.sql` | Arm B, the independent second reader's queries |

## ⛔ TWO EDITS BEFORE THE FINAL READ (after 2026-10-02T20:09:47Z)
1. **Close the last segment at the window's end.** In the `p8_*` files, S5's upper bound is `timestamptz '2099-01-01 00:00:00+00'` (open-ended for the interim read). Replace it with `timestamptz '2026-10-02 20:09:47+00'`. In the `armb_*` and `rv_armb_*` files, S5 is the `ELSE` arm of a `CASE`, so add `AND captured_at < '2026-10-02T20:09:47Z'` to the row filter. **A final read that is not capped at the window's end is not the registered window.**
2. **Record the read instant** (`p8_q1.sql` section 0 prints `now()`), and commit the edited files beside these as `*_final.sql`. The interim files stay unedited: they are the record of what the interim read ran.

## ✅ THE FINAL COPIES ARE PREPARED (2026-10-01, CC-B)
Each `*_final.sql` is the interim file with only its end bound changed to **2026-10-02T20:09:47Z**: the `p8_*` S5 upper bound, the `armb_*` `\set cutoff`, and the `*_fine` cutoff rows. Checked: no `2099` or `2026-09-29` cutoff is left in any `_final` copy. **No deploy has landed inside the window since `bc199185e` (the hold)**, so S5 needs no further split. Run each after 20:09:47Z and record its `now()` read instant.

## ✅ THE CONTEXT QUERY IS REBUILT, AND IT REPRODUCES BOTH LOST FIGURES (2026-10-01, CC-B)
The report's P8 context paragraph cited a second reader's `rv3.sql`; that name in the scratchpad was later reused for a different query (the `B-REACH-BASELINE-ADJUST` re-check), so the fee version was overwritten. **It is rebuilt here as `rv_context_rebuilt.sql` and `rv_context_final.sql`, and it is never cited as `rv3.sql`.**
- **Definition** (the report's own words, "the recorded EVs with the fill haircut undone, per entry"): undo `makerNetEVAdjusted = pFill·(maker.netEV − adverseSelection) − (1 − pFill)·nonFillCost` (`server/core/math/maker-taker-decision.ts`) using the four inputs `switch_on_shadow_evidence` records per decision (`maker_fill_probability`, `adverse_selection_pct`, `non_fill_cost_pct`, both EVs), then `(maker.netEV − taker_net_ev) / E`, with `E` the paired `rtb_shadow_pairings.entry_price` (the `p8_q2.sql` join).
- **Reproduction, at the interim cutoff 2026-09-29T14:19:38Z (read 2026-10-01T21:11Z):** before the deploy **113 joined, 0 below 0.004, minimum 0.00464**; after it **62 of 122 maker picks below 0.004**. **Both match the lost figures exactly.** The before-period is closed, so it is the control; the after-period match shows the window and the join are the same ones.
- **Still context, not the verdict** (Langston): an aggregate cannot discharge a single class-(iii) row. ⚠️ The advantage is mode-independent by construction, so taker-chosen decisions sit below 0.004 too (1,839 of 2,013 after the deploy at the interim cutoff); which is what the formula gives once the fee gap is 0.0012 (`makerEntryAdvantagePct` = fee gap + slippage, plus spread when not sided), not a maker anomaly.
- `rv_context_final.sql` runs the same read to the window's end, 2026-10-02T20:09:47Z.
