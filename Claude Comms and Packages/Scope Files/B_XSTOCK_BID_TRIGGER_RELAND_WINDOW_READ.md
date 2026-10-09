# B-XSTOCK-BID-TRIGGER-RELAND — the increment-1 window read, ENDED AT DAY 7 (Kyle 2026-10-09)

**Kyle's decision (2026-10-09 ~00:45Z):** *"if you have enough data, then yes, end it now and start the analysis."* The 21-day window registered for increment 1 (`GOVERNANCE_EXCEPTIONS.md` rows 41 and 44) ends at day 7. Seven days hold 327 episodes on 61 symbols. That answers the question below without the remaining 14 days. Increment 3 (the re-land) is now gated on this read plus Langston's review, and then Kyle's call on where the stop trigger reads.

## The question
Sprint plan row 2 (Kyle 2026-09-28): move the paper xStock stop and target triggers off the midpoint and back onto the bid. **Would the extra stops a bid trigger fires be REAL (the market actually traded at or through the stop) or FAKE (a thin stub bid with no trade near it)?**

## Object and population
- **Corpus:** `/home/deploy/xs_window/xs_frame_window_2026-10-02_to_2026-10-09.log.gz` on staging, frozen 2026-10-09 00:17Z. It holds 1,766,556 `[3n.q7][XS_FRAME]` lines from 2026-10-02 20:38:03Z to 2026-10-09 00:17:47Z (sha256 `08a454d2b07cf7877d4e33fc24fbc45ae5db0efae678119659edaea8bc377edc`).
- **Cross-tab of every frame** (`bidWouldFire` × `markExit` × `exitReason`):

| bidWouldFire | markExit | exitReason | frames |
|---|---|---|---|
| no | n | none | 1,723,925 |
| **stop** | **n** | none | **42,391** ← the object |
| stop | y | target_hit | 108 |
| stop | y | stop_hit | 82 |
| no | y | target_hit | 39 |
| target | y | target_hit | 11 |

- **Episodes:** the 42,391 `bidWouldFire=stop markExit=n` frames (all `frame=ok`), grouped per position. A gap over 120 s, or a PM2 restart or deploy (`~/.pm2/pm2.log`), splits an episode. Result: **327 episodes, 61 symbols, 66 positions.**
- **Prints:** `xstock_spot_ticker_snap` for those 61 symbols, 2026-10-02 20:30Z → 2026-10-09 00:50Z (1,866,858 rows, exported with `xs_frame_false_hollow_snaps.sql`). A PRINT is a snapshot whose `volume_24h` rose strictly; its price is `last`. This is the same definition as `xs_frame_false_hollow.py`. All 61 symbols have prints.
- **Classification:** **REAL** = a print at or below the frame's `sl=`, inside the episode or within end + 90 s. **FAKE** = prints exist in that window and none reaches the stop. **NC** = no print. The +5 and +30 min horizons are sensitivity checks only.
- **Mark later:** whether the mark trigger itself fired on the same position (a `markExit=y` frame) within 30 min of the episode end, and the median lead from episode start to that frame. ⚠️ `markExit=y` means the mark trigger fired. It does NOT mean the position closed: the book-state guard can still refuse the close.
- **Script:** `scripts/analysis/xstock-bid-only-stop-episodes.py` (self-test included). Re-derive on staging with:
  `python3 xstock-bid-only-stop-episodes.py --frames xs_frame_window_2026-10-02_to_2026-10-09.log.gz --snaps snaps.csv --boundaries /home/deploy/.pm2/pm2.log`

## Result
Sessions: **cash** = 13:30-20:00Z Mon-Fri · **h2015** = 20:00-20:30Z (the 4:15 pm ET handoff) · **h0015** = 00:00-00:30Z (the 8:15 pm ET handoff) · **off** = everything else.

| session | episodes | frames | 90 s REAL / FAKE / NC | +5 min | +30 min | mark fired ≤30 min after | median lead (s) | episode median / p90 (s) |
|---|---|---|---|---|---|---|---|---|
| cash | 33 | 1,749 | **24 / 9 / 0** | 25/8/0 | 31/2/0 | 31 | 78 | 63 / 235 |
| h2015 | 25 | 4,526 | **0 / 22 / 3** | 0/25/0 | 0/25/0 | 6 | 59 | 89 / 799 |
| h0015 | 34 | 2,329 | **0 / 7 / 27** | 0/7/27 | 0/11/23 | 9 | 10 | 49 / 339 |
| off | 235 | 33,787 | **12 / 111 / 112** | 13/130/92 | 21/172/42 | 35 | 641 | 138 / 668 |
| **ALL** | **327** | **42,391** | **36 / 149 / 142** | 38/170/119 | 52/210/65 | 81 | 164 | 106 / 641 |

## Reading
1. **During cash hours the bid trigger is mostly right and only early.** 24 of 33 episodes are REAL at 90 s (31 of 33 by +30 min), and in 31 of 33 the mark trigger fired anyway, a median 78 s later.
2. **Outside cash hours the bid trigger fires on stub bids.** At the two handoffs: 0 REAL in 59 episodes (29 FAKE, 30 no print). In the rest of off-hours: 12 REAL, 111 FAKE, 112 no print. In 7 days, a bid trigger with no session condition would have fired about 140 stops that no trade supported, and the 142 no-print episodes (almost all off-hours) are more likely to add to that count than to reduce it.
3. ⇒ **"Stop trigger on the bid" as one rule for all hours is NOT supported by the data.** A bid trigger during cash hours, with off-hours handled another way (the mark, or a bid confirmed by a print at or below the stop), is the shape the data supports. **Which off-hours rule to use is Kyle's call** (his 2026-09-03 off-hours posture ruling). This read informs that call; it does not make it.

## Biases (each pushes one way)
(i) A drop-off leaving the 24 h volume window can hide a rise, so a print is missed → toward NC. (ii) `last` is only the final trade in a ~4-5 s snapshot interval, so a dip through the stop that recovers inside one interval is invisible → toward FAKE, i.e. toward NOT moving the trigger. (iii) Later horizons over-count REAL, because a print through the stop minutes later is a later stop, not this one. Bias (ii) is the one that could flatter the off-hours FAKE count. It cannot turn 0 REAL in 59 handoff episodes into a majority.

## Not covered
- **The target leg.** The bid can only reach a target later than the mark (`bidWouldFire=no markExit=y target_hit`: 39 frames). A bid target trigger is conservative by construction, so it needs no "fake" test. Its cost is target exits that are withheld or delayed, which this read did not size.
- **108 frames where the mark said `target_hit` while the bid was below the stop** (ABBV 95, ALB 6, BDX 5, NCLH 1, NET 1), all at an 00:15Z handoff with a blown-out book (e.g. ALB bid 102 / ask 125 / mark 113.5 against target 111.64). The book-state guard held these (ABBV is still open; ALB yielded later, see the 3a interim's cascade table). This is the handoff bad-price class that row 66 (`B-BOOK-STATE-RING-INDEPENDENT-BOUND`) addresses. It is not new.

## Numeric correction
**PREVIOUSLY STATED: 42,122 frames → 320 episodes, 57 symbols, 62 positions. NOW: 42,391 → 327, 61, 66. REASON:** the earlier figure was a quick read taken before this script existed; its exact source was not kept, so the difference is not attributed. The frozen file, read by the committed script, is the object of record.

`NOT RE-READ` by a fresh reader. This goes to Langston as the second pass.
