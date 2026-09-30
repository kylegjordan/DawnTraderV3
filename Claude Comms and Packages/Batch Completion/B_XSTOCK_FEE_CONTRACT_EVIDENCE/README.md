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

## ⚠️ ONE QUERY THE REPORT CITES IS NOT HERE
The report's P8 context paragraph cites a second reader's `rv3.sql` (the implied maker-over-taker advantage before and after the deploy). **That name in the scratchpad now holds a different query** (the `B-REACH-BASELINE-ADJUST` re-check, windows 09-20/09-27). The same-day reader reused the name, and the fee version was overwritten. The figure it produced (0 of 113 below 0.004 before the deploy; 62 of 122 after) is **context, not the verdict**. On Friday it is either rebuilt from the pre-audit's definition and committed here, or the report says the query is lost. It is **never** re-cited as `rv3.sql`. This is the same class as `#979` (a generic name in a shared namespace), in a session's own scratchpad.
