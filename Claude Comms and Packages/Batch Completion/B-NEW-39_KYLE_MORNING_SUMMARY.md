# Overnight summary — Saturday morning

## Short version

The first fix is in production and is working mechanically. The proof that it solved the original problem will take a few more days to gather, because the crypto market has been unusually quiet and isn't producing the kind of winning-or-losing trade outcomes the test needs. Nothing is broken; nothing needs rolling back; the second fix (the secondary calibration step) is on hold until we can read the first one's full result.

## What we were trying to do

Over the last few days we found that the system's "how confident am I in this trade" number was upside-down at the top — the trades the system rated most confident were winning least often, and the trades it rated lowest confidence were winning most often. We traced that to two interacting problems. The first was that a temporary safety net under the confidence number had been set very low months ago for visibility reasons and had been quietly catching a big chunk of bad-signal trades and giving them artificially high win-rates, fighting against the real signal. The second was a sustainability check that was uniformly too aggressive and dragging good trades' confidence down. We were going to fix them one at a time so we could read each fix's effect cleanly.

## What landed last night

The first fix landed in the database at 23:08 UTC. The safety net under the confidence number was moved up from where it had been parked (0.20) to where it used to live before the visibility-window experiment (0.45). This is what was always intended to happen once we had enough data, and the original change months ago explicitly named this number as the target to come back to.

After it landed, I checked the live system and found two unrelated operational issues that had crept in earlier in the day — the signal-emission pipeline had been quiet for several hours because a cache that protects against stale safety-related data had aged out and the system had defensively stopped emitting, and the stocks scanner had been timing out separately. I restarted the service, which is a routine operational action that doesn't undo the fix (the fix is in the database, not in memory). After the restart, signals started flowing again, and the new confidence numbers in the new signals confirm the safety net moved exactly as intended: trades that would have been clamped to 0.20 are now clamped to 0.45 instead. The math is working as designed.

## Why we don't have the full "did it actually fix the inversion" answer yet

The way we measure whether the fix worked is to wait for new trades to close out as either winners or losers, then sort them by their confidence number and see if the winners are now on the higher-confidence end and losers on the lower-confidence end (instead of the reverse, like before). The catch is that the crypto market right now is in a very quiet, sideways state. Trades that opened over the last 24 hours haven't been hitting their profit targets or their stop-losses — they're just expiring on time-based exits, which the system records as "breakeven" rather than win or loss. The test can't see a shape in a row of breakevens.

This isn't a problem with the fix. It's market conditions. When the market starts trending or moving in either direction again, the wins and losses will come back. Until then, the data we need is just not being produced.

## What this means for the timeline

For perspective: in the seven-day window before this issue surfaced, the system produced about 1,000 wins and 1,600 losses worth of test material. In the 24 hours before the pipeline halted yesterday, it produced zero wins and zero losses (only breakevens and rejections). So we need the market to come back to a more typical state, or we need to let several days roll by so the natural ebb and flow gives us enough win/loss material to test against.

Realistic checkpoints:
- **Daily quick-check at 04:30 UTC** after the nightly background job finishes — looking for the first win and loss outcomes to start showing up.
- **First meaningful read** around three to seven days from now — enough win/loss outcomes to see whether the inversion is broken on a partial signal.
- **Full confidence read** around two to four weeks from now — enough win/loss outcomes per confidence bucket to call it definitively.

## What's on hold

- The second fix (the sustainability-check recalibration) is on hold until we can read the first fix's full result. There's no point making two changes at once if we can't tell them apart.
- The follow-up batch that re-runs the wider factor study on this new corrected baseline is also waiting.
- The consumer gate work that everything else has been waiting on is, in turn, also still waiting.

## What's not affected

- All active trading is OFF (Phase 19 territory). The system is in passive learning mode only.
- No regression has shown up anywhere. The fix is conservative — it raises a floor, it doesn't change any decisions or filters.
- The stocks scanner issue I mentioned is a separate problem with the equities pipeline that pre-dates last night's work. I logged it as its own follow-up so it doesn't get lost.
- All governance is up to date in the repo. The fix, the rollback procedure (in case it's ever needed), and tonight's status report are all checked in.

## What I need from you when you wake up

Nothing urgent. If you want to override anything — applying the second fix early, rolling the first fix back, splitting the deeper investigation into its own batch — let me know and I'll act on it. Otherwise the right move is to let the data accumulate and re-check in a few days.

— CC
