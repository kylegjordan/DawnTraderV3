# Diagnostic ask — xStock spot ohlc(1) silent on fresh subscription (2026-05-25)

**To:** Langston
**From:** CC (Kyle session, 2026-05-25)
**Type:** Investigation, not a fix proposal. Kyle's directive: "investigate with Langston first" before any code changes. No batch scope yet — converge on diagnosis first.

## What's verified

1. **PM2 restarted today 2026-05-25 15:52:47 UTC** to force a fresh WS connection on the xStock spot archiver.
2. **Subscribe message sent at 15:52:47:** `[B74][equity-spot] subscribed to ohlc(1) + ticker for 489 symbols`.
3. **Catch-up bars landed at 15:52:52** for 485 of 489 subscribed symbols. Latest `interval_begin` in each catch-up batch: **2026-05-22 23:59:00 UTC** (Friday last-minute pre-shutdown).
4. **Since 15:52:52 (now +30 min):** zero new ohlc bars written for xstock_spot. Every 60-second health log line reads `connected=true, last_msg_age_ms=300-500, rows_persisted_60s=0`. Messages ARE flowing on the socket; ohlc channel is silent.
5. **Same socket, ticker channel:** writing normally (ticker_snap latest captured_at within seconds; ~485 rows/cycle).
6. **Crypto (ws.kraken.com/v2) + xStock perp (REST polling on futures.kraken.com) ohlc:** both fresh, current minute bars landing.

## Friday-vs-Monday delta — what I can't explain

| Day | Universe size | xstock_spot_ohlc_1m rows | Unique symbols with bars |
|---|---:|---:|---:|
| 2026-05-15 (pre-discovery) | 260 | 125,011 | 260 |
| 2026-05-19 | 260 | 119,021 | 260 |
| 2026-05-20 | 298 | 116,815 | 298 |
| **2026-05-21** (universe discovery deployed 11:55 UTC) | **485** | **194,013** | **485** |
| **2026-05-22** (full day) | **485** | **206,709** | **485** |
| 2026-05-23 (weekend, no market) | — | (none — Fri 8PM ET shutdown) | — |
| 2026-05-25 (today, post-restart) | 485 | only catch-up; 0 live | 485 (catch-up only) |

So 485-symbol subscriptions on the SAME archiver, SAME code, SAME endpoint produced full live data on Thursday 5/21 (partial day post-deploy) and all day Friday 5/22. The PM2 restart on 5/21 11:55 UTC for B79.0n.UNIVERSE-DISCOVERY would have triggered the same `subscribe(489 symbols)` shape I just saw today succeed at the catch-up phase. Yet today the live feed is silent on ohlc.

My initial "Kraken caps at 300 per connection" hypothesis is weakened by the Friday data. If there's a hard cap at 300, 485-symbol subscriptions should have failed Thursday and Friday too.

## What I can't see (the diagnostic gap)

`server/services/passive-archive/equity-spot-archiver.ts:124-128` — `handleMessage` only routes channel=`ohlc` and channel=`ticker`. Anything else (Kraken's subscribe-acknowledgement messages, subscribe-error messages, system messages, status messages) is silently dropped. So when we subscribe, **Kraken's response is invisible to us.** If Kraken rejected our ohlc subscribe with a "too many symbols" or "channel deprecated" or "rate limit exceeded" message, we'd never see it. If Kraken accepted with `result: 'ok'`, we wouldn't see that either.

This is the only reason I can't tell you definitively right now: subscription succeeded vs subscription rejected vs subscription accepted-but-silent-due-to-Kraken-side-issue.

## What I'm proposing as the next step

A tiny diagnostic-only addition to `handleMessage` (NOT a fix — read-only observability):

```ts
function handleMessage(raw: WebSocket.RawData): void {
  state.lastMsgAt = Date.now();
  let msg: any;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  // NEW: log non-data messages once each, so we see Kraken's subscribe response + any errors
  if (msg.method || msg.error || (msg.channel && msg.channel !== 'ohlc' && msg.channel !== 'ticker')) {
    console.log(`[B74][equity-spot][DIAG] non-data message: ${JSON.stringify(msg).slice(0, 500)}`);
  }

  if (msg.channel === 'ohlc' && Array.isArray(msg.data)) {
    for (const bar of msg.data) parseOhlcBar(bar);
  } else if (msg.channel === 'ticker' && Array.isArray(msg.data)) {
    for (const snap of msg.data) parseTickerSnap(snap);
  }
}
```

That's ~5 lines, no behavioral change, no logic change. Ships, PM2 restarts, fresh subscribe fires, we see Kraken's actual response in PM2 logs within 1 second. From there we know whether to fix the subscribe shape, shard, or escalate to Kraken.

## My asks of you

1. **Sanity-check the Friday-vs-Monday delta.** Do you see anything in the 5/22 → 5/25 gap that could explain a Kraken-side behavior change (a deploy of ours that touched WS-equities in any indirect way, a Kraken known-issue you recall, anything else)? Git log for me hasn't surfaced anything archiver-touching since pre-5/17.

2. **Sanity-check the diagnostic add.** ~5-line non-behavioral diagnostic. Reasonable as a 1-chunk ship before any actual fix attempt? Or would you prefer a different approach (e.g., raw-message logging gated by an env flag, or a one-time staging probe outside PM2)?

3. **Sharding question.** If the diagnostic shows Kraken IS rejecting/capping our 489-symbol subscribe, my next-step fix would be to mirror crypto's hash-mod sharding at 300/connection (crypto already has this pattern; xStock spot doesn't). Approve in principle, or any reason to prefer different shard sizing for ws-equities specifically?

4. **Any hypothesis I'm missing?** Friday-vs-Monday on identical subscribe shape, same code, same endpoint, same universe size. What am I not considering?

Reply expected: ≤2KB. The diagnostic question is the primary one — if you AGREE that's the right next step, I draft a one-line ship batch (literally a 5-line diff in equity-spot-archiver.ts), get Kyle's approval, deploy, observe, return with the actual root cause confirmed.

INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive (FUSE hangs). For repo inspection use `ssh staging`.

— CC
