# B-XSTOCK-BID-TRIGGER-RELAND — STZ STEP 8 IMMUTABLE EVIDENCE

Captured from staging by ANALYST Codex at `2026-10-13T19:03:08Z` after Coltrane's first review returned `CHANGES NEEDED` because his host has no staging SSH identity. This file preserves the fixed-window command stdout and the SHA-256 of each exact filtered byte stream so the review is against a committed object rather than the implementer's verdict.

## Provenance

- Host: staging, `188.245.193.8`, read as `deploy`.
- Source: `/var/log/dawntrader/error.log`.
- Source stat at capture: inode `305737`, size `408391393` bytes, mtime `2026-10-13 19:03:08.448329716 +0000`.
- Deployed repo head: `94bf16d1022b8cb24c027df9aa721fb1d0333f18`.
- `/home/deploy/dawntrader-deploy.record` SHA-256: `a313d4cb77058170614b11574987c40ace2ae92ea6269c08a16adbc29965c10a`.
- Hash convention: each SHA-256 is over the exact LF-terminated stdout byte stream produced by the pipeline shown for that population.
- Fixed populations: event slice `13:45:00-13:45:39Z`; post-release decisions/refusals `13:46:00-18:44:11Z`; positive-control refusals `09:29:01-13:45:29Z`.

## Captured counts and stream hashes

```text
event_count
34
event_sha256
d498ffc3dd37d037646295dc6756ad488e2c387494b605d559781f597b4a64d5  -
post_frame_count
11418
post_frame_sha256
e0287505e93ef24b9cf587ea7dda0c4749d7113e0aaabfa435be1a3de0b27c34  -
post_refusal_count
0
post_refusal_sha256
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  -
pre_refusal_count
7900
pre_refusal_sha256
47e9aa0e275a7c153444e5f5951636d1f1a022fc5ac36238c9bd86b6d87ff99c  -
```

`e3b0...b855` is the SHA-256 of the empty byte stream and is paired with the explicit zero count. The post-frame status projection independently returned one bucket: `11418 ok`.

## Exact event-slice stdout

```text
2026-10-13 13:45:00 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7880 ratio=47.92 reasons=two_sided
2026-10-13 13:45:01 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7881 ratio=47.92 reasons=two_sided
2026-10-13 13:45:03 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7882 ratio=47.92 reasons=two_sided
2026-10-13 13:45:04 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7883 ratio=47.92 reasons=two_sided
2026-10-13 13:45:06 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7884 ratio=47.92 reasons=two_sided
2026-10-13 13:45:07 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7885 ratio=47.92 reasons=two_sided
2026-10-13 13:45:09 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7886 ratio=47.92 reasons=two_sided
2026-10-13 13:45:10 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7887 ratio=47.92 reasons=two_sided
2026-10-13 13:45:10 +00:00: [B-XSTOCK-BID-TRIGGER-RELAND][BOOK_STATE] STZ/USD RI_NEAR_MISS pos=0a70419d-b9af-45f3-aa99-d9781450b150 failed=window_median|moves spread=0.00784 ceiling=0.01000 windowMedian=0.01516 runMoves=1 bidMoved=true askMoved=true suppressedTicks=4897 suppressedMinSpread=0.01024 suppressedMaxSpread=0.02691 refusedS=12006 episodes=11 longestS=5196 sinceRestart=true
2026-10-13 13:45:12 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7888 ratio=47.92 reasons=two_sided
2026-10-13 13:45:12 +00:00: [B-XSTOCK-BID-TRIGGER-RELAND][BOOK_STATE] STZ/USD RI_NEAR_MISS pos=0a70419d-b9af-45f3-aa99-d9781450b150 failed=window_median spread=0.00979 ceiling=0.01000 windowMedian=0.01516 runMoves=2 bidMoved=true askMoved=true suppressedTicks=0 suppressedMinSpread=none suppressedMaxSpread=none refusedS=12008 episodes=11 longestS=5196 sinceRestart=true
2026-10-13 13:45:13 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7889 ratio=47.92 reasons=two_sided
2026-10-13 13:45:15 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7890 ratio=47.92 reasons=two_sided
2026-10-13 13:45:17 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7891 ratio=47.92 reasons=two_sided
2026-10-13 13:45:18 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7892 ratio=47.92 reasons=two_sided
2026-10-13 13:45:19 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7893 ratio=47.92 reasons=two_sided
2026-10-13 13:45:21 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7894 ratio=47.92 reasons=two_sided
2026-10-13 13:45:22 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7895 ratio=47.92 reasons=two_sided
2026-10-13 13:45:24 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7896 ratio=39.43 reasons=two_sided
2026-10-13 13:45:26 +00:00: [B-XSTOCK-BID-TRIGGER-RELAND][BOOK_STATE] STZ/USD SEED_ESCAPED_RI framesHeld=7897 runMoves=5 seedSpread=0.02005 escapeMedian=0.00886 spreadNow=0.00423 ceiling=0.01000 retainedMedian=0.00032 seededAt=2026-10-13T09:29:00.843Z
2026-10-13 13:45:26 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD COMPARATOR_CLEARED reason=ring_independent_escape validated=false framesSinceSeed=7897 observedMovement=true ringAfter=true seededAt=2026-10-13T09:29:00.843Z
2026-10-13 13:45:26 +00:00: [8a-P4a][BOOK_STATE] STZ/USD REFUSAL_BASIS seedImplausible=false seedSpread=0.00423 seedRetainedMedian=none retainedMedianNow=none currentMedian=0.00423 ratio=none kRel=3 inherited=false seededAt=2026-10-13T13:45:25.251Z framesSinceSeed=0
2026-10-13 13:45:26 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=7897 ratio=none reasons=two_sided
2026-10-13 13:45:29 +00:00: [B-XSTOCK-FEED-SANITY][BOOK_STATE] STZ/USD REFUSE unvalidated state=two_sided validated=false framesSinceSeed=0 ratio=none reasons=two_sided
2026-10-13 13:45:30 +00:00: [B-XSTOCK-BID-TRIGGER-RELAND][BOOK_STATE] STZ/USD EXIT_RELEASED pos=0a70419d-b9af-45f3-aa99-d9781450b150 bidToStopPct=18.442 suppressedTicks=8 suppressedMinSpread=0.00423 suppressedMaxSpread=0.00792 refusedS=12024 episodes=11 sinceRestart=true
2026-10-13 13:45:30 +00:00: [3n.q7][XS_FRAME] STZ/USD pos=0a70419d-b9af-45f3-aa99-d9781450b150 frame=ok basis=raw_guarded mark=127.72999999999999 sl=107.6138 tp=130.1139 bid=127.46 ask=128 spread=0.00423 thr=0.01268 trail=0.00423 ret=none tb=v bidWouldFire=no markExit=n exitReason=none
2026-10-13 13:45:32 +00:00: [3n.q7][XS_FRAME] STZ/USD pos=0a70419d-b9af-45f3-aa99-d9781450b150 frame=ok basis=raw_guarded mark=127.72999999999999 sl=107.6138 tp=130.1139 bid=127.46 ask=128 spread=0.00423 thr=0.01268 trail=0.00423 ret=none tb=v bidWouldFire=no markExit=n exitReason=none
2026-10-13 13:45:33 +00:00: [3n.q7][XS_FRAME] STZ/USD pos=0a70419d-b9af-45f3-aa99-d9781450b150 frame=ok basis=raw_guarded mark=127.72999999999999 sl=107.6138 tp=130.1139 bid=127.46 ask=128 spread=0.00423 thr=0.01268 trail=0.00423 ret=none tb=v bidWouldFire=no markExit=n exitReason=none
2026-10-13 13:45:34 +00:00: [8a-P4c][VTS_NO_TRIGGER_END] STZ/USD trade vts_xstock_spot_1791378716282_gn18zzt class=xstock_spot streakMs=7380032 lastReason=no_transactable_side (too_wide) paged=true
2026-10-13 13:45:34 +00:00: [8a-P4c][VTS_NO_TRIGGER_END] STZ/USD trade vts_xstock_spot_1791477533412_ca8smt4 class=xstock_spot streakMs=7380034 lastReason=no_transactable_side (too_wide) paged=true
2026-10-13 13:45:35 +00:00: [3n.q7][XS_FRAME] STZ/USD pos=0a70419d-b9af-45f3-aa99-d9781450b150 frame=ok basis=raw_guarded mark=127.72999999999999 sl=107.6138 tp=130.1139 bid=127.46 ask=128 spread=0.00423 thr=0.01268 trail=0.00423 ret=none tb=v bidWouldFire=no markExit=n exitReason=none
2026-10-13 13:45:36 +00:00: [3n.q7][XS_FRAME] STZ/USD pos=0a70419d-b9af-45f3-aa99-d9781450b150 frame=ok basis=raw_guarded mark=127.63999999999999 sl=107.6138 tp=130.1139 bid=127.46 ask=127.82 spread=0.00282 thr=0.01268 trail=0.00423 ret=none tb=v bidWouldFire=no markExit=n exitReason=none
2026-10-13 13:45:38 +00:00: [3n.q7][XS_FRAME] STZ/USD pos=0a70419d-b9af-45f3-aa99-d9781450b150 frame=ok basis=raw_guarded mark=127.63999999999999 sl=107.6138 tp=130.1139 bid=127.46 ask=127.82 spread=0.00282 thr=0.01268 trail=0.00423 ret=none tb=v bidWouldFire=no markExit=n exitReason=none
2026-10-13 13:45:39 +00:00: [3n.q7][XS_FRAME] STZ/USD pos=0a70419d-b9af-45f3-aa99-d9781450b150 frame=ok basis=raw_guarded mark=127.805 sl=107.6138 tp=130.1139 bid=127.46 ask=128.15 spread=0.00540 thr=0.01268 trail=0.00423 ret=none tb=v bidWouldFire=no markExit=n exitReason=none
```

## Exact commands

```bash
grep -F 'STZ/USD' /var/log/dawntrader/error.log | grep -E '^2026-10-13 13:45:(0[0-9]|1[0-9]|2[0-9]|3[0-9])'
grep -F '[3n.q7][XS_FRAME] STZ/USD' /var/log/dawntrader/error.log | sed -n '/^2026-10-13 13:46:/,/^2026-10-13 18:44:11/p' | sed -n 's/.* frame=\([^ ]*\).*/\1/p' | sort | uniq -c
grep -F '[3n.q7][XS_FRAME] STZ/USD' /var/log/dawntrader/error.log | sed -n '/^2026-10-13 13:46:/,/^2026-10-13 18:44:11/p' | sha256sum
grep -F 'STZ/USD' /var/log/dawntrader/error.log | sed -n '/^2026-10-13 13:46:/,/^2026-10-13 18:44:11/p' | grep -F 'REFUSE unvalidated' | wc -l
grep -F 'STZ/USD' /var/log/dawntrader/error.log | sed -n '/^2026-10-13 13:46:/,/^2026-10-13 18:44:11/p' | grep -F 'REFUSE unvalidated' | sha256sum
grep -F 'STZ/USD' /var/log/dawntrader/error.log | sed -n '/^2026-10-13 09:29:01/,/^2026-10-13 13:45:29/p' | grep -F 'REFUSE unvalidated' | wc -l
grep -F 'STZ/USD' /var/log/dawntrader/error.log | sed -n '/^2026-10-13 09:29:01/,/^2026-10-13 13:45:29/p' | grep -F 'REFUSE unvalidated' | sha256sum
```

The committed event slice is independently hashable from this file after extracting the fenced block. The two larger fixed-window streams are represented by their complete command stdout counts and SHA-256 digests; no moving end time is used.
